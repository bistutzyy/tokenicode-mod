<div align="center">

<img src="public/app-icon.png" alt="TOKENICODE Mod" width="120" />

# TOKENICODE Mod

### Desktop client for Claude Code (personal fork mod)

[![License](https://img.shields.io/badge/license-Apache%202.0-green?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/bistutzyy/tokenicode-mod?style=flat-square&color=blue)](https://github.com/bistutzyy/tokenicode-mod/releases)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)

[**Download**](https://github.com/bistutzyy/tokenicode-mod/releases/latest) · **[中文](README_zh.md)**

</div>

## Attribution

This is a personal mod, built on top of:

- **Original project**: [yiliqi78/TOKENICODE](https://github.com/yiliqi78/TOKENICODE) (Apache-2.0) — a desktop GUI client for Claude Code
- **Reference mod**: [mistydew/tokenicode-deepseek-alpha](https://github.com/mistydew/tokenicode-deepseek-alpha)
  - The **avatar stats popup** (click avatar for usage heatmap / model distribution) is ported from that mod's `ProfileStatsModal` and adapted
  - The **web preview panel** follows that mod's `PreviewPanel` / `previewStore` implementation

Thanks to both authors for open-sourcing their work.

## Mod features

| Feature | Notes |
|---|---|
| 🖼️ Qwen VL image pre-description | When the main model has no vision, Qwen VL pre-describes images and injects text into the CLI prompt |
| 💰 Qwen balance query | Avatar popup shows Aliyun account balance (BSS OpenAPI HMAC-SHA1 signing; needs your own RAM AK/SK) |
| 📊 Avatar stats popup | **Ported from mistydew's mod** — local session usage heatmap + model distribution |
| 🌐 Web preview panel | **Follows mistydew's mod** — URL bar + back/forward/refresh + snapshot capture |
| 📁 Sidebar project list | One-click switch + new conversation grouped under project |
| 🔧 UI tweaks | Removed feedback/usage tabs, renamed "魔改版", project click starts new conversation |
| ⚙️ Config | Removed updater (no signing key, no auto-update), changed identifier |

## Download & install

From [Releases](https://github.com/bistutzyy/tokenicode-mod/releases/latest):

- `TOKENICODE-Mod_0.11.0_x64-setup.exe` — Windows NSIS installer (recommended)
- `TOKENICODE-Mod_0.11.0_x64-portable.exe` — Windows portable (no install)

### Prerequisites
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — auto-detected/installed/authenticated on first launch
- WebView2 Runtime (built into Win11; Win10 needs [install](https://developer.microsoft.com/microsoft-edge/webview2/))

### Won't launch?
- **SmartScreen block**: "More info" → "Run anyway" (app is unsigned)
- **Antivirus false positive**: whitelist (unsigned)
- **Crash/blank**: try the portable build; ensure WebView2 installed; ensure Claude Code CLI works (`claude --version`)
- Still stuck: [open an issue](https://github.com/bistutzyy/tokenicode-mod/issues) with symptoms

## Vision / balance credentials

Image description and balance query need your own credentials in `~/.tokenicode/vision-credentials.json`:

```json
{
  "qwen": { "apiKey": "sk-...", "vlModel": "qwen-vl-max", "enabled": true },
  "aliyun": { "accessKeyId": "LTAI...", "accessKeySecret": "...", "enabled": true }
}
```

- **Qwen apiKey**: VL vision (DashScope)
- **Aliyun RAM AK/SK**: balance query (BSS OpenAPI, needs `bss:QueryAccountBalance` permission)

> The repo contains no personal credentials.

## License

[Apache License 2.0](LICENSE). Modified from yiliqi78/TOKENICODE; original license and copyright notice retained.
