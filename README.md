# RoomTone

A shared 3D virtual music studio where people play **Acoustic Drums**, **Grand Piano**, and **Electric Guitar** together in real time using webcam hand gestures.

**Live Production App:** [https://roomtone.aswanthmadhav-roomtone.workers.dev](https://roomtone.aswanthmadhav-roomtone.workers.dev)

---

## Features

- **3D Recording Studio (Three.js)**: Architectural hardwood floor, woven studio rug, acoustic timber-slat wall panels, backlit control-room observation window with mixing desk & VU meters, ACES filmic tone mapping, soft shadows, and overhead moving-head spotlights with feathered volumetric shafts and audio-reactive floor pools.
- **Three Distinct Instrument Stations**:
  - **Acoustic Drums (Left)**: Bass drum, snare, rack & floor toms, hi-hat & crash cymbals (`MembraneSynth`, `NoiseSynth`, `MetalSynth`).
  - **Grand Piano (Center)**: 88-key studio cabinet with individually animated playable keys across the `C4–C5` octave (`PolySynth`).
  - **Electric Guitar (Right)**: Double-cutaway electric guitar with 4×12 speaker cabinet & tube amp head across 6 strings with low (`E2–E4`) and high (`A3–E5`) voicings.
- **Webcam Hand-Gesture Tracking (MediaPipe)**: Tracks up to two index fingertips locally in the browser (`VIDEO` mode). Camera video never leaves your device; only note events and normalized cursor coordinates are shared.
- **Real-Time Multiplayer Rooms**: 4-character room codes, live instrument switching, co-occupied stations (up to 2 musicians per station), colored remote fingertip orbs, and attributed live hit feed.

---

## Run Locally

```bash
npm install

# Terminal 1 — Socket.IO room server on :3001
npm run server

# Terminal 2 — Vite dev client on :5173 (also exposed on your LAN IP)
npm run dev
```

Open `http://localhost:5173` in two browser windows to test locally.

### Playing Across Devices

1. **Use the deployed Cloudflare URL (Recommended — HTTPS included for webcam access):**  
   Open **`https://roomtone.aswanthmadhav-roomtone.workers.dev`** on any laptop, desktop, or phone, create a room, and share the 4-letter room code.
2. **Or tunnel your local dev server over HTTPS:**
   ```bash
   npm run share
   ```
   Opens an instant `https://*.lhr.life` tunnel to your local `:5173` server so other devices can use webcam tracking against your local build.

---

## Deploy to Cloudflare Workers

RoomTone deploys as a single Cloudflare Worker serving static assets (`./dist`) plus a `RoomHub` Durable Object (`worker/index.js`) handling WebSocket room state at `/ws`:

```bash
npm run deploy
```

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server (`localhost:5173` + LAN IP) |
| `npm run server` | Start local Express + Socket.IO room server (`:3001`) |
| `npm run share` | Open an HTTPS tunnel (`localhost.run`) to `:5173` for multi-device testing |
| `npm run deploy` | Build client and deploy to Cloudflare Workers (`wrangler deploy`) |
| `npm run build` | TypeScript check (`tsc -b`) + production Vite bundle |
| `npm run lint` | Run `oxlint` |
| `npm run typecheck:server` | Typecheck `server/index.ts` |
| `npm run test:server` | Run 21-assertion multiplayer & validation smoke test suite |

---

## Controls & Tuning

- **Drums**: Flick your index fingertip downward through the **Snare** (left), **Kick** (center), or **Hi-hat** (right) rings.
- **Grand Piano**: Strike downward into any of the 8 key zones (`C4`–`C5`) along the lower stage.
- **Electric Guitar**: Sweep your fingertip vertically across the 6 horizontal strings (left half plays low voicing `E2–E4`, right half plays high voicing `A3–E5`).
- **Bottom Instrument Dock**: Switch instruments live at any time or click/tap the pads, keys, and strings directly.
- **Telemetry**: Click **Telemetry** in the top studio bar to view live FPS, tracked hand count, last note, and strike velocity.
