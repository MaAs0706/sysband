# RoomTone

Multiplayer virtual drum room — webcam-tracked fingertip strikes play
synthesized drums, relayed over Socket.IO rooms so everyone hears and
sees each hit.

## Requirements

- Node.js 20+, a Chromium-based or Safari browser
- A webcam (tracking runs fully in-browser via MediaPipe — video never
  leaves your device; only fingertip x/y and drum events are shared)
- Serve over `localhost` or HTTPS — `getUserMedia` requires a secure
  context

## Setup & run

```bash
npm install

# terminal 1 — room relay server on :3001
npm run server

# terminal 2 — Vite dev client on :5173
npm run dev
```

Open `http://localhost:5173` in two windows/devices to test multiplayer.

### Playing over LAN

Run the client exposed to the network: `npm run dev -- --host`, then
others open `http://<your-ip>:5173`. The Vite proxy forwards
`/socket.io` to the server on the same machine, so nothing else is
needed. Note: non-localhost camera access requires HTTPS in most
browsers — LAN may work in Chrome for local addresses, otherwise it's
localhost-only.

## Controls

- **Enable Camera** → allow permission → flick an index fingertip
  downward through a glowing ring (snare left, kick center, hi-hat right)
- Hovering inside a pad is silent; a hit needs downward motion
- Both hands work; each gets its own orb (white/violet local, colored
  remote players)
- **debug** toggle under the stage reveals the manual drum-test pads and
  the fps/hands/velocity overlay

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev client |
| `npm run server` | Socket.IO room server (tsx watch, :3001) |
| `npm run build` | typecheck + production build |
| `npm run lint` | oxlint |
| `npm run typecheck:server` | tsc over `server/` |
| `npm run test:server` | integration test: relay, isolation, validation, GC |

## Tuning

- `STRIKE` in `src/scene/hitZones.ts` — `strikeVelocity` (flick inside a
  pad), `entryVelocity` (crossing into a pad), `cooldownMs`, `minGain`
- `FINGER_SMOOTHING` in `src/App.tsx` — fingertip EMA (higher = smoother,
  laggier)

## Known limitations

- Rooms are in-memory; a server restart wipes them. No persistence,
  auth, or stable identity — reconnecting players rejoin as a new
  `Player-N`.
- Designed for localhost/LAN demos; production deployment (TLS, scaling,
  TURN-free since no video is relayed) is out of scope.
- Remote hand positions are shared presence data (~20 Hz of 2–4 floats);
  no video or full landmark data ever leaves the device.
