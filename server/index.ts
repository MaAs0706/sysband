import { randomInt } from 'node:crypto'
import { createServer } from 'node:http'
import express from 'express'
import { Server, type Socket } from 'socket.io'

const PORT = Number(process.env.PORT ?? 3001)

const app = express()
app.get('/health', (_req, res) => res.json({ ok: true }))

const http = createServer(app)
const io = new Server(http, {
  cors: { origin: true },
})

type InstrumentId = 'drums' | 'piano' | 'guitar'

const INSTRUMENTS = new Set<InstrumentId>(['drums', 'piano', 'guitar'])
const DRUMS = new Set(['kick', 'snare', 'hihat'])
const PIANO_NOTES = new Set(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'])
const GUITAR_NOTES = new Set([
  'E2',
  'A2',
  'D3',
  'G3',
  'B3',
  'E4',
  'A3',
  'D4',
  'G4',
  'B4',
  'E5',
])

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const MIN_HIT_INTERVAL_MS = 25
const MIN_CURSOR_INTERVAL_MS = 40

interface Player {
  id: string
  name: string
  instrument: InstrumentId
}

interface Room {
  code: string
  players: Map<string, Player>
}

const rooms = new Map<string, Room>()
let nameSeq = 0

function makeCode(): string {
  for (;;) {
    let code = ''
    for (let i = 0; i < 4; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)]
    if (!rooms.has(code)) return code
  }
}

const stateOf = (room: Room) => ({
  roomId: room.code,
  players: [...room.players.values()],
})

function isValidTarget(instrument: InstrumentId, target: string): boolean {
  if (instrument === 'drums') return DRUMS.has(target)
  if (instrument === 'piano') return PIANO_NOTES.has(target)
  if (instrument === 'guitar') return GUITAR_NOTES.has(target)
  return false
}

io.on('connection', (socket: Socket) => {
  const player: Player = {
    id: socket.id,
    name: `Player-${++nameSeq}`,
    instrument: 'drums',
  }
  let room: Room | null = null
  let lastHitAt = 0
  let lastCursorAt = 0

  const leave = () => {
    if (!room) return
    room.players.delete(player.id)
    socket.leave(room.code)
    if (room.players.size) io.to(room.code).emit('room-state', stateOf(room))
    else rooms.delete(room.code)
    room = null
  }

  socket.on('join', (payload: unknown, ack: unknown) => {
    const reply =
      typeof ack === 'function'
        ? (ack as (res: object) => void)
        : () => undefined
    if (room) leave()

    const p = (payload ?? {}) as { roomId?: unknown; instrument?: unknown }
    const code =
      typeof p.roomId === 'string' ? p.roomId.trim().toUpperCase() : ''
    if (
      typeof p.instrument === 'string' &&
      INSTRUMENTS.has(p.instrument as InstrumentId)
    ) {
      player.instrument = p.instrument as InstrumentId
    }

    let target: Room
    if (code) {
      const found = rooms.get(code)
      if (!found) return reply({ ok: false, error: 'room not found' })
      target = found
    } else {
      const created = makeCode()
      target = { code: created, players: new Map() }
      rooms.set(created, target)
    }

    room = target
    room.players.set(player.id, player)
    socket.join(room.code)
    reply({ ok: true, you: player, roomId: room.code })
    io.to(room.code).emit('room-state', stateOf(room))
  })

  socket.on('select-instrument', (payload: unknown) => {
    const inst = (payload as { instrument?: unknown } | null)?.instrument
    if (
      typeof inst !== 'string' ||
      !INSTRUMENTS.has(inst as InstrumentId)
    ) {
      return
    }
    player.instrument = inst as InstrumentId
    if (room) {
      room.players.set(player.id, { ...player })
      io.to(room.code).emit('room-state', stateOf(room))
    }
  })

  socket.on('leave', leave)

  socket.on('hit', (payload: unknown) => {
    const p = payload as Record<string, unknown> | null
    if (!room || !p || typeof p !== 'object') return
    if (p.roomId !== room.code) return
    if (p.playerId !== player.id) return
    if (typeof p.drum !== 'string' || !DRUMS.has(p.drum)) return
    const velocity = Number(p.velocity)
    if (!Number.isFinite(velocity)) return
    const now = Date.now()
    if (now - lastHitAt < MIN_HIT_INTERVAL_MS) return
    lastHitAt = now
    const clamped = Math.min(1, Math.max(0, velocity))
    const ts = Number.isFinite(p.ts) ? Number(p.ts) : now
    socket.to(room.code).emit('drum-hit', {
      playerId: player.id,
      name: player.name,
      drum: p.drum,
      velocity: clamped,
      ts,
    })
  })

  socket.on('note', (payload: unknown) => {
    const p = payload as Record<string, unknown> | null
    if (!room || !p || typeof p !== 'object') return
    if (p.roomId !== room.code) return
    if (p.playerId !== player.id) return
    const inst = p.instrument as InstrumentId
    if (typeof inst !== 'string' || !INSTRUMENTS.has(inst)) return
    if (typeof p.target !== 'string' || !isValidTarget(inst, p.target)) return
    const velocity = Number(p.velocity)
    if (!Number.isFinite(velocity)) return
    const now = Date.now()
    if (now - lastHitAt < MIN_HIT_INTERVAL_MS) return
    lastHitAt = now
    const clamped = Math.min(1, Math.max(0, velocity))
    const ts = Number.isFinite(p.ts) ? Number(p.ts) : now
    socket.to(room.code).emit('remote-note', {
      playerId: player.id,
      name: player.name,
      instrument: inst,
      target: p.target,
      velocity: clamped,
      ts,
    })
  })

  socket.on('cursor', (payload: unknown) => {
    const p = payload as Record<string, unknown> | null
    if (!room || !p || typeof p !== 'object') return
    if (p.roomId !== room.code || p.playerId !== player.id) return
    if (!Array.isArray(p.hands) || p.hands.length > 2) return
    const hands: { x: number; y: number }[] = []
    for (const h of p.hands) {
      const x = Number((h as { x?: unknown })?.x)
      const y = Number((h as { y?: unknown })?.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      hands.push({
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      })
    }
    const now = Date.now()
    if (now - lastCursorAt < MIN_CURSOR_INTERVAL_MS) return
    lastCursorAt = now
    socket.to(room.code).emit('remote-cursor', {
      playerId: player.id,
      name: player.name,
      hands,
      ts: now,
    })
  })

  socket.on('disconnect', leave)
})

http.listen(PORT, () => console.log(`roomtone server on :${PORT}`))
