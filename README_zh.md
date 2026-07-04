<div align="center">

<img src="public/app-icon.png" alt="TOKENICODE Mod" width="120" />

# TOKENICODE 魔改版

### Claude Code 桌面客户端(个人二创魔改)

[![License](https://img.shields.io/badge/许可证-Apache%202.0-green?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/bistutzyy/tokenicode-mod?style=flat-square&color=blue)](https://github.com/bistutzyy/tokenicode-mod/releases)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)

[**下载**](https://github.com/bistutzyy/tokenicode-mod/releases/latest) · **[English](README.md)**

</div>

## 出处与致谢

本仓库是个人魔改版,基于以下项目二次修改:

- **原项目**:[yiliqi78/TOKENICODE](https://github.com/yiliqi78/TOKENICODE)(Apache-2.0)— Claude Code 的桌面 GUI 客户端
- **参考二创**:[mistydew/tokenicode-deepseek-alpha](https://github.com/mistydew/tokenicode-deepseek-alpha)
  - **头像图形化统计弹窗**(点头像看用量热力图 / 模型分布)直接移植自该二创的 `ProfileStatsModal` 并适配修改
  - **右侧网页预览面板**参考该二创的 `PreviewPanel` / `previewStore` 实现

感谢原作者与二创作者的开放共享。

## 魔改内容

| 功能 | 说明 |
|---|---|
| 🖼️ 千问 VL 识图预描述 | 主模型无视觉时,前端用千问 VL 预描述图片,文本注入 CLI prompt |
| 💰 千问余额查询 | 头像弹窗显示阿里云账户余额(BSS OpenAPI HMAC-SHA1 签名,需自备 RAM AK/SK) |
| 📊 头像图形化统计弹窗 | **移植自 mistydew 二创** — 本机会话用量热力图 + 模型分布 |
| 🌐 网页预览面板 | **参考 mistydew 二创** — URL 栏 + 前进/后退/刷新 + 快照捕获 |
| 📁 侧栏项目列表 | 一键切换项目 + 开新对话归组 |
| 🔧 UI 调整 | 去反馈/用量 tab、改名"魔改版"、项目点击开新对话 |
| ⚙️ 配置 | 移除 updater(无签名私钥,不自动更新)、改 identifier |

## 下载与安装

从 [Releases](https://github.com/bistutzyy/tokenicode-mod/releases/latest) 下载:

- `TOKENICODE-Mod_0.11.0_x64-setup.exe` — Windows NSIS 安装包(推荐)
- `TOKENICODE-Mod_0.11.0_x64-portable.exe` — Windows 便携版(免安装)

### 前置条件
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — 应用首次启动自动检测/安装/认证
- WebView2 Runtime(Win11 自带;Win10 需 [安装](https://developer.microsoft.com/microsoft-edge/webview2/))

### 启动不了?
- **SmartScreen 拦截**:点"更多信息"→"仍要运行"(应用未代码签名)
- **杀毒软件误报**:加白名单(未签名)
- **闪退/白屏**:改用便携版;确认 WebView2 已装;确认 Claude Code CLI 可用(`claude --version`)
- 仍不行:[提 issue](https://github.com/bistutzyy/tokenicode-mod/issues),附现象(安装失败 / 白屏 / 报错截图)

## 千问识图 / 余额配置

识图与余额查询需自备凭据,配置 `~/.tokenicode/vision-credentials.json`:

```json
{
  "qwen": { "apiKey": "sk-...", "vlModel": "qwen-vl-max", "enabled": true },
  "aliyun": { "accessKeyId": "LTAI...", "accessKeySecret": "...", "enabled": true }
}
```

- **千问 apiKey**:VL 识图(DashScope)
- **阿里云 RAM AK/SK**:余额查询(BSS OpenAPI,需授予 `bss:QueryAccountBalance` 权限)

> 仓库不含任何个人凭据。

## 许可证

[Apache License 2.0](LICENSE)。基于 yiliqi78/TOKENICODE 修改,保留原许可证与版权声明。
