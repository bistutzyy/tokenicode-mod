// Usage logging — append-only JSONL at ~/.tokenicode/usage-log.jsonl.
//
// Two sources write here:
//   * `qwen-vl`  — vision pre-descriptions (written from the frontend after
//                  bridge.describeImage returns; tokens come from the DashScope
//                  response).
//   * `cli-main` — main-model turns (written from useStreamProcessor when the
//                  CLI stream emits a `result` event; tokens/cost come from
//                  that event).
//
// Entries are arbitrary JSON (serde_json::Value) so the frontend can evolve the
// schema without a Rust recompile. Field names are camelCase to match TS:
//   { ts, source, inputTokens, outputTokens, cost, model?, provider?, image? }

use serde::{Deserialize, Serialize};
use serde_json::Value;

fn log_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home dir")?;
    let dir = home.join(".tokenicode");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create .tokenicode dir: {}", e))?;
    }
    Ok(dir.join("usage-log.jsonl"))
}

fn now_ts() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Append one usage entry. If `ts` is missing, the backend stamps it. The
/// frontend may pass its own `ts` (e.g. the moment the request started).
#[tauri::command]
pub async fn append_usage_log(entry: Value) -> Result<(), String> {
    let mut entry = entry;
    if entry.get("ts").and_then(|v| v.as_u64()).is_none() {
        entry["ts"] = serde_json::json!(now_ts());
    }
    let line = serde_json::to_string(&entry).map_err(|e| format!("Serialize error: {}", e))?;
    let path = log_path()?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Cannot open usage log: {}", e))?;
    use std::io::Write;
    writeln!(file, "{}", line).map_err(|e| format!("Write error: {}", e))
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageTotals {
    pub qwen_input_tokens: u64,
    pub qwen_output_tokens: u64,
    pub qwen_calls: u64,
    pub cli_input_tokens: u64,
    pub cli_output_tokens: u64,
    pub cli_calls: u64,
    pub cli_cost: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadUsageResult {
    pub entries: Vec<Value>,
    pub totals: UsageTotals,
}

/// Read entries within a rolling window (default 5h = 18000s) and return
/// per-source aggregates alongside the raw entries. Entries outside the
/// window are skipped (but left on disk for future longer-range views).
#[tauri::command]
pub async fn read_usage_log(window_sec: Option<u64>) -> Result<ReadUsageResult, String> {
    let path = log_path()?;
    let empty = || ReadUsageResult {
        entries: vec![],
        totals: UsageTotals::default(),
    };
    if !path.exists() {
        return Ok(empty());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Cannot read usage log: {}", e))?;
    let window = window_sec.unwrap_or(18000);
    let cutoff = now_ts().saturating_sub(window);
    let mut entries = Vec::new();
    let mut t = UsageTotals::default();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let val: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let ts = val.get("ts").and_then(|v| v.as_u64()).unwrap_or(0);
        if ts < cutoff {
            continue;
        }
        let source = val.get("source").and_then(|v| v.as_str()).unwrap_or("");
        let in_tok = val.get("inputTokens").and_then(|v| v.as_u64()).unwrap_or(0);
        let out_tok = val
            .get("outputTokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let cost = val.get("cost").and_then(|v| v.as_f64()).unwrap_or(0.0);
        match source {
            "qwen-vl" => {
                t.qwen_input_tokens += in_tok;
                t.qwen_output_tokens += out_tok;
                t.qwen_calls += 1;
            }
            "cli-main" => {
                t.cli_input_tokens += in_tok;
                t.cli_output_tokens += out_tok;
                t.cli_calls += 1;
                t.cli_cost += cost;
            }
            _ => {}
        }
        entries.push(val);
    }
    Ok(ReadUsageResult { entries, totals: t })
}
