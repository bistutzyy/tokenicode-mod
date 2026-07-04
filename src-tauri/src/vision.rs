// Vision pipeline — Qwen VL image pre-description (方式 B) + balance query +
// plaintext credential storage at ~/.tokenicode/vision-credentials.json.
//
// The main model (DeepSeek via Volces Ark, through the CLI) has no vision
// capability. Qwen VL runs here in the Rust backend (direct DashScope call,
// bypassing the browser to avoid CORS) and produces a textual pre-description
// that the frontend injects into the CLI prompt alongside the image path.

use base64::Engine as _;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha1::Sha1;

// DashScope OpenAI-compatible multimodal endpoint. Standard image_url + base64
// data URL request body, OpenAI-shaped response with usage.prompt_tokens /
// usage.completion_tokens. Verified shape; URL kept as a constant so it can be
// retargeted without touching call sites.
const DASHSCOPE_VL_URL: &str =
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

// Balance is queried via the Aliyun BSS OpenAPI (QueryAccountBalance), which
// requires RAM AK/SK HMAC-SHA1 signing — the DashScope sk- apiKey cannot do it
// (DashScope has no apiKey-only balance endpoint; /api/v1/usage, /quota, /balance
// all 404, verified 2026-07-03). The AK/SK pair lives in the `aliyun` block of
// vision-credentials.json. When aliyun creds are absent, the query degrades to
// balance=None and the UI shows "余额查询暂不可用".
const BSS_OPENAPI_ENDPOINT: &str = "https://business.aliyuncs.com/";
const BSS_API_VERSION: &str = "2017-12-14";

const DEFAULT_VL_MODEL: &str = "qwen-vl-max";

const DEFAULT_DESCRIBE_PROMPT: &str = "请详细描述这张图片的内容。重点提取：1) 图片类型（截图/照片/图表/示意图等）；2) 所有可见的文字与 UI 元素；3) 数据、数值、表格内容；4) 关键视觉布局与颜色。输出用简洁的中文段落，便于下游文本模型理解，不要加多余寒暄。";

/// DashScope rejects images larger than ~10MB; guard before the network hop.
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

// ================================================================
// Credentials — ~/.tokenicode/vision-credentials.json (plaintext,
// consistent with providers.json). Qwen apiKey is required for VL +
// balance; Volc ak/sk is reserved for future console-API calibration.
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QwenCreds {
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_vl_model")]
    pub vl_model: String,
    #[serde(default)]
    pub enabled: bool,
}

fn default_vl_model() -> String {
    DEFAULT_VL_MODEL.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VolcCreds {
    #[serde(default)]
    pub ak: String,
    #[serde(default)]
    pub sk: String,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AliyunCreds {
    #[serde(default)]
    pub access_key_id: String,
    #[serde(default)]
    pub access_key_secret: String,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VisionCredentials {
    #[serde(default)]
    pub qwen: QwenCreds,
    #[serde(default)]
    pub volc: VolcCreds,
    #[serde(default)]
    pub aliyun: AliyunCreds,
}

fn creds_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home dir")?;
    let dir = home.join(".tokenicode");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create .tokenicode dir: {}", e))?;
    }
    Ok(dir.join("vision-credentials.json"))
}

fn read_creds() -> Result<VisionCredentials, String> {
    let path = creds_path()?;
    if !path.exists() {
        return Ok(VisionCredentials::default());
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read vision-credentials: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Cannot parse vision-credentials: {}", e))
}

#[tauri::command]
pub async fn load_vision_credentials() -> Result<VisionCredentials, String> {
    read_creds()
}

#[tauri::command]
pub async fn save_vision_credentials(data: VisionCredentials) -> Result<(), String> {
    let path = creds_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Serialize error: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Write error: {}", e))?;
    // Restrict to owner on Unix; Windows relies on user-dir ACL isolation.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

// ================================================================
// Image description
// ================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DescribeImageResult {
    pub description: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub model: String,
}

fn guess_mime(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else {
        "image/jpeg"
    }
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() > n {
        let mut out: String = s.chars().take(n).collect();
        out.push_str("...");
        out
    } else {
        s.to_string()
    }
}

/// Read an image file, send it to Qwen VL (DashScope OpenAI-compatible mode),
/// and return the textual description plus token usage. The frontend stores
/// this on the attachment and injects it into the CLI prompt for the main
/// vision-less model.
#[tauri::command]
pub async fn describe_image(
    path: String,
    api_key: String,
    model: Option<String>,
    prompt: Option<String>,
) -> Result<DescribeImageResult, String> {
    if api_key.trim().is_empty() {
        return Err("Missing Qwen API key".into());
    }
    let model = model
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_VL_MODEL.to_string());
    let prompt_text = prompt
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_DESCRIBE_PROMPT.to_string());

    let bytes = std::fs::read(&path)
        .map_err(|e| format!("Cannot read image file {}: {}", path, e))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(format!(
            "Image too large ({} KB); DashScope limit is 10 MB",
            bytes.len() / 1024
        ));
    }
    let mime = guess_mime(&path);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime, b64);

    let body = json!({
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": prompt_text}
            ]
        }]
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .post(DASHSCOPE_VL_URL)
        .bearer_auth(&api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("DashScope request failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Read response failed: {}", e))?;
    if !status.is_success() {
        return Err(format!(
            "DashScope error ({}): {}",
            status,
            truncate(&text, 500)
        ));
    }

    let val: Value = serde_json::from_str(&text).map_err(|e| {
        format!(
            "Parse response failed: {} | body: {}",
            e,
            truncate(&text, 200)
        )
    })?;
    let description = val["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    if description.is_empty() {
        return Err(format!(
            "DashScope returned empty description. Body: {}",
            truncate(&text, 300)
        ));
    }
    let input_tokens = val["usage"]["prompt_tokens"].as_u64().unwrap_or(0);
    let output_tokens = val["usage"]["completion_tokens"].as_u64().unwrap_or(0);

    Ok(DescribeImageResult {
        description,
        input_tokens,
        output_tokens,
        model,
    })
}

// ================================================================
// Balance query (best-effort)
// ================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceResult {
    /// None when the endpoint is unavailable or the shape is unknown — the
    /// frontend then shows "余额查询暂不可用" instead of a number.
    pub balance: Option<f64>,
    pub update_time: u64,
    pub error: Option<String>,
}

fn now_ts() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// --- Aliyun BSS OpenAPI RPC v1.0 signing helpers ---

/// Percent-encode per Aliyun signature rules: keep A-Za-z0-9-_.~, else %HH.
fn aliyun_percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn is_leap_year(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

/// Convert days since 1970-01-01 to (year, month, day) in UTC.
fn days_to_ymd(mut days: i64) -> (i64, u32, u32) {
    let mut y: i64 = 1970;
    loop {
        let diy = if is_leap_year(y) { 366 } else { 365 };
        if days < diy {
            break;
        }
        days -= diy;
        y += 1;
    }
    let months = [
        31,
        if is_leap_year(y) { 29 } else { 28 },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut m: u32 = 1;
    for &dim in months.iter() {
        if days < dim {
            break;
        }
        days -= dim;
        m += 1;
    }
    (y, m, (days + 1) as u32)
}

/// ISO 8601 UTC timestamp, e.g. "2024-01-01T00:00:00Z" (BSS Timestamp param).
fn iso8601_utc_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = (secs / 86400) as i64;
    let tod = secs % 86400;
    let (y, m, d) = days_to_ymd(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m,
        d,
        tod / 3600,
        (tod % 3600) / 60,
        tod % 60
    )
}

fn hmac_sha1_base64(data: &str, key: &str) -> String {
    type HmacSha1 = Hmac<Sha1>;
    let mut mac = HmacSha1::new_from_slice(key.as_bytes())
        .expect("HMAC accepts any key length");
    mac.update(data.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes())
}

#[tauri::command]
pub async fn query_qwen_balance() -> Result<BalanceResult, String> {
    let creds = read_creds()?;
    let ak = creds.aliyun.access_key_id.trim().to_string();
    let sk = creds.aliyun.access_key_secret.trim().to_string();
    if ak.is_empty() || sk.is_empty() {
        return Ok(BalanceResult {
            balance: None,
            update_time: now_ts(),
            error: Some("未配置阿里云 RAM AK/SK".into()),
        });
    }

    // Canonicalized query params (RPC v1.0): sorted, percent-encoded.
    let mut params: Vec<(&str, String)> = vec![
        ("Format", "JSON".into()),
        ("Version", BSS_API_VERSION.into()),
        ("AccessKeyId", ak.clone()),
        ("SignatureMethod", "HMAC-SHA1".into()),
        ("Timestamp", iso8601_utc_now()),
        ("SignatureVersion", "1.0".into()),
        ("SignatureNonce", uuid::Uuid::new_v4().to_string()),
        ("Action", "QueryAccountBalance".into()),
    ];
    params.sort_by(|a, b| a.0.cmp(b.0));
    let canonical: String = params
        .iter()
        .map(|(k, v)| format!("{}={}", aliyun_percent_encode(k), aliyun_percent_encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    let string_to_sign = format!("GET&%2F&{}", aliyun_percent_encode(&canonical));
    let signature = hmac_sha1_base64(&string_to_sign, &format!("{}&", sk));

    // Append signature (same encoding) and build the final URL.
    let mut all = params;
    all.push(("Signature", signature));
    let query: String = all
        .iter()
        .map(|(k, v)| format!("{}={}", aliyun_percent_encode(k), aliyun_percent_encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    let url = format!("{}?{}", BSS_OPENAPI_ENDPOINT, query);

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return Ok(BalanceResult {
                balance: None,
                update_time: now_ts(),
                error: Some(format!("HTTP client error: {}", e)),
            });
        }
    };
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            return Ok(BalanceResult {
                balance: None,
                update_time: now_ts(),
                error: Some(format!("Balance request failed: {}", e)),
            });
        }
    };
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let val: Value = serde_json::from_str(&text).unwrap_or(Value::Null);

    let code = val["Code"].as_str().unwrap_or("");
    let success = val["Success"].as_bool() == Some(true) || code == "Success";
    if !success {
        let msg = val["Message"].as_str().unwrap_or("");
        return Ok(BalanceResult {
            balance: None,
            update_time: now_ts(),
            error: Some(format!("BSS {} {}: {}", status.as_u16(), code, msg)),
        });
    }
    // Data.Balance is a string like "89.50" (may be negative when in arrears).
    let balance = val["Data"]["Balance"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .or_else(|| val["Data"]["Balance"].as_f64())
        .or_else(|| {
            val["Data"]["AvailableAmount"]
                .as_str()
                .and_then(|s| s.parse::<f64>().ok())
        })
        .or_else(|| val["Data"]["AvailableAmount"].as_f64());
    Ok(BalanceResult {
        balance,
        update_time: now_ts(),
        error: if balance.is_some() {
            None
        } else {
            Some("Balance field not parseable".into())
        },
    })
}
