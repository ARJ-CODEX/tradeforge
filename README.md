# ⚡ TradeForge

<p align="center">
  <img src="https://img.shields.io/badge/license-Brand%20Protected-red.svg" alt="License: TradeForge Brand License — no rebranding" />
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" alt="Zero dependencies" />
  <img src="https://img.shields.io/badge/data-local--first-teal.svg" alt="Local-first" />
  <img src="https://img.shields.io/badge/prs-welcome-orange.svg" alt="PRs welcome" />
</p>

**TradeForge** is a fast, private, local-first trading journal with a **pre-trade risk gate** and a **discipline tiltmeter**. Crypto, forex, stocks — one journal. No account, no cloud, no subscription: your trades live in a file you own.

**🔗 Live demo: [arj-codex.github.io/tradeforge](https://arj-codex.github.io/tradeforge)**

## Why TradeForge?

Retail traders' #1 pain isn't analysis — it's **discipline**: emotional position sizing, revenge trades, and journals nobody keeps using. TradeForge attacks that directly:

- 🚦 **Risk Gate** — before you enter a trade, it forges your position size so a stop-out costs *exactly* your risk %. Exceed your personal limit and it warns you in red.
- ⚡ **30-second journaling** — log a filled trade with auto-computed P&L and R multiple.
- 🎭 **Emotion + mistake tags** — connect *how you felt* to *what you earned*.
- 🌡 **Tiltmeter** — a signature gauge that shows when discipline is breaking across your last 10 trades.
- 📁 **Obsidian-model data ownership** — everything local, one-click JSON backup, CSV export. No lock-in, ever.

## ✨ Features

- 📊 **Dashboard** — win rate, total R, profit factor, net P&L, and a live equity curve
- 📈 **Advanced analytics — free** — by day-of-week, by market, top symbols, win/loss streaks, max drawdown, and **performance by setup** (the feature competitors paywall)
- 🏷 **Setup tags** — name your setups ("breakout", "reversal"…) and see which ones actually make money
- 🚦 **Risk Gate** — position sizing for crypto (units), forex (lots × 100k), stocks (shares) + R:R planning
- 📒 **Journal** — filter by market, result, and symbol; delete-safe history
- 🔍 **Weekly Review** — tilt events, emotion × performance table, most frequent mistakes
- 📥 **CSV import + JSON backup** — bring trades in, own your data
- 📸 **Share card** — one-click branded PNG of your weekly discipline report
- 🌗 Dark (default) & light themes · ⌨️ `1`–`4` to switch views
- 🌍 **All markets, USD-denominated** — tag each trade with its market

## 🚀 Getting Started

No build step, no dependencies:

```bash
git clone https://github.com/ARJ-CODEX/tradeforge.git
cd tradeforge
# open index.html in your browser, or serve it:
npx serve .
```

Or simply use the [live demo](https://arj-codex.github.io/tradeforge).

## 🤖 Android

**Direct APK — no Play Store, no account:**

1. Grab **`TradeForge-android.apk`** from [**Releases**](https://github.com/ARJ-CODEX/tradeforge/releases).
2. Open it on your phone → allow "install unknown apps" for your browser when asked.
3. Done — the nitro TF icon lands on your home screen. 100% offline, zero permissions.

**Or install as a PWA** (no APK at all): open [the web app](https://arj-codex.github.io/tradeforge) in Chrome → **Add to Home screen**. Same app, full-screen, works offline.

The APK is built entirely in the cloud (GitHub Actions + Capacitor) — contributors don't need Android Studio. Run it from the Actions tab, or push a `v*` tag and the APK attaches to the release automatically.

## 🖥 Desktop (Windows)

No installer, no admin rights — one portable `.exe`:

1. Grab **`TradeForge-<version>-portable.exe`** from [**Releases**](https://github.com/ARJ-CODEX/tradeforge/releases).
2. Run it. That's it — same app, same local-first data, in its own window.

> First launch of the portable build takes a few extra seconds while it unpacks. Your journal data stays local either way.

**Build it yourself** (Node.js 18+ required):

```bash
cd desktop
npm install
npm run dist   # → dist/TradeForge-<version>-portable.exe
```

The desktop shell is Electron with `contextIsolation` and `sandbox` enabled, zero runtime dependencies, and loads only the same static files the web version uses.

## ⌨️ Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `1` | Dashboard |
| `2` | Analytics |
| `3` | Journal |
| `4` | Risk Gate |
| `5` | Review |

## 🛠 Tech Stack

- **HTML5** + **CSS3** + **vanilla JavaScript (ES6+)**
- Canvas 2D for the equity curve, tiltmeter gauge, and share cards
- Zero frameworks, zero dependencies, zero build tools

## 📂 Project Structure

```
tradeforge/
├── index.html      # Markup
├── style.css       # ARJ Forge identity (black · red · gold)
├── app.js          # Trade math, journal, risk gate, tiltmeter, charts
├── manifest.json   # PWA manifest (Add to Home Screen)
├── sw.js           # Service worker (offline)
├── icon.png        # Brand icon (web favicon, desktop, Android launcher)
├── desktop/        # Electron shell → portable Windows .exe
│   ├── main.js
│   ├── package.json
│   └── make-ico.cjs
└── mobile/         # Capacitor config → cloud-built Android APK
    ├── capacitor.config.json
    └── package.json
```

## 🗺 Roadmap

- 📥 Broker CSV import (auto-fill your trade history)
- 🧠 AI weekly coach — reads your journal and calls out patterns
- 🔐 Release-signed Android APK (currently debug-signed)

## ™ Trademark & Branding

**TradeForge™** and its logo are the exclusive brand of **ARJ-CODEX**.

You may use the TradeForge name only to refer to this original project. You may **not**:

- Rebrand or redistribute this project under any other name
- Use the TradeForge name or logo for your own products, domains, or marketing
- Present a modified version as an official TradeForge release

Personal and internal use is free, and contributions to this repository are welcome — see the [License](LICENSE) for full terms.

## 📄 License

Released under the **[TradeForge Brand License (FBL)](LICENSE)** — free to use, protected against rebranding.
