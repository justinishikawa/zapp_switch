# zapp_switch 💡⌚

Turn your TP-Link Kasa bedroom light on and off from your Amazfit watch.

A [Zepp OS](https://docs.zepp.com/) mini-program with three parts:

```
┌──────────────┐   Bluetooth    ┌──────────────────┐   HTTPS    ┌─────────────────┐
│  Watch app   │ ◄────────────► │  Side service    │ ─────────► │  TP-Link Kasa   │
│ (tap toggle) │   (zepos zml)  │ (inside Zepp app)│            │  Cloud API      │
└──────────────┘                └──────────────────┘            └─────────────────┘
                                       ▲
                              ┌────────┴─────────┐
                              │  Settings page   │  (Kasa email / password /
                              │ (inside Zepp app)│   light name / bridge URL)
                              └──────────────────┘
```

The watch itself never touches the network — all Kasa traffic happens in the
side-service that lives inside the Zepp phone app, which relays results back
to your wrist over Bluetooth.

## Compatibility

Any Amazfit / Zepp watch running **Zepp OS 2.0 or newer**, round or square,
including (non-exhaustive): GTR 3 / 3 Pro / 4, GTS 3 / 4 / 4 mini, T-Rex 2 / 3,
Amazfit Balance, Bip 5, Cheetah, Active / Active Edge.

## Two ways to reach your light

| Mode | How it works | Pros | Cons |
|---|---|---|---|
| ☁️ **Kasa Cloud** (default) | Side-service calls `https://wap.tplinkcloud.com` (the same API the Kasa app uses) | Zero extra hardware, works away from home | Needs internet; TP-Link legacy cloud must accept your account |
| 🏠 **Local Bridge** | Side-service calls a tiny HTTP server you run on your LAN (`bridge/kasa_bridge.py`), which speaks Kasa's local TCP protocol | Fast, private, no cloud | Needs an always-on machine (Pi, NAS, old laptop, even Termux) |

Start with cloud mode. If login fails with newer Kasa hardware/firmware,
switch to bridge mode.

---

## 🚀 Install on Android (sideload via QR)

You need: your **Android phone** with the Zepp app + watch paired, and a
**PC** (Windows/Mac/Linux) with Node.js.

### 1 — Enable Developer Mode in the Zepp app (one time)

1. Open **Zepp** → **Profile** (bottom right)
2. Tap the ⚙️ **Settings** gear → **About**
3. Tap the **version number** 7 times quickly → "Developer mode enabled" toast
4. Back on the Profile tab, a new **Developer Options** entry appears

### 2 — Install the build tools on your PC

```bash
# install Node.js 18+ first from https://nodejs.org if you don't have it
npm i -g @zeppos/zeus-cli
```

### 3 — Build & preview

```bash
git clone https://github.com/justinishikawa/zapp_switch.git
cd zapp_switch
zeus build     # sanity check — should end with a .zab in dist/
zeus preview
```

`zeus preview` prints a **QR code** in the terminal and starts a local server.

### 4 — Install to your watch

1. Phone + watch connected via Bluetooth, Zepp app open
2. Zepp app → **Profile → Developer Options → Scan QR code** (the "Preview"/scan icon)
3. Scan the QR from the terminal
4. Pick your watch → the app installs over Bluetooth (takes ~30–60s)

### 5 — Configure your Kasa account

1. Zepp app → **Profile → My devices → [your watch] → App settings** (or: Device → Apps)
2. Find **zapp_switch** → tap the ⚙️ gear icon
3. Enter:
   - **Kasa account email + password** (the account your light is registered to)
   - **Light name** — exact name from the Kasa app, e.g. `Bedroom Light` (optional; without it the first plug-like device is used)
4. The settings save automatically as you type

### 6 — Rock it 🤘

Open **zapp_switch** on your watch:

- **Tap the big circle** → toggles the light
- **ON / OFF buttons** → explicit control
- Amber = on, dark = off, `···` = unknown
- Status line shows *via kasa cloud* / *via local bridge* / the error

---

## 🏠 Optional: local bridge mode

On any always-on machine on the same network as your light:

```bash
python3 bridge/kasa_bridge.py --light 192.168.1.42 --port 8765
```

(192.168.1.42 = your Kasa device's IP; check your router or the Kasa app.)

Then in the watch app's Zepp settings: set mode to **Local Bridge** and
bridge URL to `http://<machine-ip>:8765`.

No third-party Python packages needed. Note: the bridge uses the legacy Kasa
TCP protocol — devices that only speak the newer KLAP handshake need cloud mode.

## Publishing your own version

The `appId` in `app.json` (28961) is a placeholder for personal sideloading —
it works fine in Developer Mode. To publish on the Zepp app store, register
your own appId at the [Zepp developer console](https://developer.zepp.com/)
and replace it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Watch shows "error — is the Zepp app nearby?" | Phone must be in BT range with Zepp app running (side-service lives there) |
| Toast: "Kasa login failed" | Wrong email/password in settings, or your account doesn't work with the legacy cloud API → try bridge mode |
| Toast: "No device named 'X'" | Light name must match the Kasa app exactly (case-insensitive) |
| `zeus preview` QR won't scan | Phone and PC must be on the same network; brightness up; restart `zeus preview` |
| App installs but crashes on open | Make sure your watch runs Zepp OS 2.0+; file an issue with your model |
| Bridge mode errors | Verify `curl http://<bridge-ip>:8765/status` from another machine on the network |

## Security notes

- Your Kasa credentials are stored only in the Zepp app's local settings
  storage on your phone, and are sent only to TP-Link's cloud endpoint
  (or your own bridge).
- Nothing else runs on the watch — it just sends "on / off / status" intents.

## License

MIT — see [LICENSE](LICENSE)
