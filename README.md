# RoomTone

Multiplayer virtual drum kit — webcam-tracked fingertip strikes play
synthesized drums, relayed over Socket.IO rooms so everyone in a room
hears each hit.

## Run locally

Two processes, two terminals:

```bash
npm install

# terminal 1 — relay server on :3001
npm run server

# terminal 2 — Vite dev client on :5173
npm run dev
```

Open `http://localhost:5173`, click **Enable Camera**, then in the Room
panel **Create room** (or enter a 4-letter code and **Join**). A second
browser/device joins with the same code; drum hits made by any player
play on every client in that room. The Vite dev server proxies
`/socket.io` to `:3001`, so no extra client config is needed.

Flick an index fingertip downward through a ring to strike.
Hovering inside a pad stays silent; hits need downward velocity.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev client |
| `npm run server` | Socket.IO room server (tsx watch) |
| `npm run build` | typecheck + production build |
| `npm run lint` | oxlint |
| `npm run typecheck:server` | tsc over `server/` |
| `npm run test:server` | smoke test: relay, isolation, validation, room GC |

## Tuning

- Strike thresholds live in `STRIKE` (`src/scene/hitZones.ts`):
  `strikeVelocity` (flick inside a pad), `entryVelocity` (crossing in),
  `cooldownMs`, `minGain`.
- `FINGER_SMOOTHING` (`src/App.tsx`) controls fingertip EMA smoothing.

## Limitations (for now)

- In-memory rooms; no persistence, auth, or reconnection to a stale
  player identity (rejoins get a fresh `Player-N` name).
- LAN/local dev only — the server binds localhost; deploy + TURN/TLS
  would come later.
