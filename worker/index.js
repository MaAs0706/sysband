const INSTRUMENTS = new Set(['drums', 'piano', 'guitar'])
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

function isValidTarget(instrument, target) {
  if (instrument === 'drums') return DRUMS.has(target)
  if (instrument === 'piano') return PIANO_NOTES.has(target)
  if (instrument === 'guitar') return GUITAR_NOTES.has(target)
  return false
}

export class RoomHub {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.rooms = new Map()
    this.clients = new Map()
    this.nameSeq = 0
  }

  makeCode() {
    for (;;) {
      let code = ''
      for (let i = 0; i < 4; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
      }
      if (!this.rooms.has(code)) return code
    }
  }

  stateOf(room) {
    return {
      roomId: room.code,
      players: [...room.players.values()],
    }
  }

  broadcastRoom(room, event, data, excludeWs = null) {
    const msg = JSON.stringify({ event, data })
    for (const [ws] of room.sockets) {
      if (ws === excludeWs) continue
      try {
        ws.send(msg)
      } catch {
        // ignore closed socket
      }
    }
  }

  leaveClient(ws) {
    const c = this.clients.get(ws)
    if (!c || !c.room) return
    const room = c.room
    room.players.delete(c.player.id)
    room.sockets.delete(ws)
    c.room = null
    if (room.players.size > 0) {
      this.broadcastRoom(room, 'room-state', this.stateOf(room))
    } else {
      this.rooms.delete(room.code)
    }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()

    const id = crypto.randomUUID().slice(0, 8)
    const player = {
      id,
      name: `Player-${++this.nameSeq}`,
      instrument: 'drums',
    }
    const clientState = {
      player,
      room: null,
      lastHitAt: 0,
      lastCursorAt: 0,
    }
    this.clients.set(server, clientState)

    server.addEventListener('message', (ev) => {
      let msg
      try {
        msg = JSON.parse(String(ev.data))
      } catch {
        return
      }
      const { event, data, ackId } = msg ?? {}
      const reply = (res) => {
        if (ackId !== undefined) {
          server.send(JSON.stringify({ event: 'ack', ackId, data: res }))
        }
      }

      if (event === 'join') {
        if (clientState.room) this.leaveClient(server)
        const p = data ?? {}
        const code =
          typeof p.roomId === 'string' ? p.roomId.trim().toUpperCase() : ''
        if (typeof p.instrument === 'string' && INSTRUMENTS.has(p.instrument)) {
          player.instrument = p.instrument
        }

        let target
        if (code) {
          const found = this.rooms.get(code)
          if (!found) return reply({ ok: false, error: 'room not found' })
          target = found
        } else {
          const created = this.makeCode()
          target = { code: created, players: new Map(), sockets: new Map() }
          this.rooms.set(created, target)
        }

        clientState.room = target
        target.players.set(player.id, { ...player })
        target.sockets.set(server, player.id)
        reply({ ok: true, you: { ...player }, roomId: target.code })
        this.broadcastRoom(target, 'room-state', this.stateOf(target))
      } else if (event === 'select-instrument') {
        const inst = data?.instrument
        if (typeof inst !== 'string' || !INSTRUMENTS.has(inst)) return
        player.instrument = inst
        if (clientState.room) {
          clientState.room.players.set(player.id, { ...player })
          this.broadcastRoom(
            clientState.room,
            'room-state',
            this.stateOf(clientState.room),
          )
        }
      } else if (event === 'leave') {
        this.leaveClient(server)
      } else if (event === 'hit') {
        const room = clientState.room
        const p = data
        if (!room || !p || typeof p !== 'object') return
        if (p.roomId !== room.code || p.playerId !== player.id) return
        if (typeof p.drum !== 'string' || !DRUMS.has(p.drum)) return
        const velocity = Number(p.velocity)
        if (!Number.isFinite(velocity)) return
        const now = Date.now()
        if (now - clientState.lastHitAt < MIN_HIT_INTERVAL_MS) return
        clientState.lastHitAt = now
        this.broadcastRoom(
          room,
          'drum-hit',
          {
            playerId: player.id,
            name: player.name,
            drum: p.drum,
            velocity: Math.min(1, Math.max(0, velocity)),
            ts: Number.isFinite(p.ts) ? Number(p.ts) : now,
          },
          server,
        )
      } else if (event === 'note') {
        const room = clientState.room
        const p = data
        if (!room || !p || typeof p !== 'object') return
        if (p.roomId !== room.code || p.playerId !== player.id) return
        const inst = p.instrument
        if (typeof inst !== 'string' || !INSTRUMENTS.has(inst)) return
        if (typeof p.target !== 'string' || !isValidTarget(inst, p.target))
          return
        const velocity = Number(p.velocity)
        if (!Number.isFinite(velocity)) return
        const now = Date.now()
        if (now - clientState.lastHitAt < MIN_HIT_INTERVAL_MS) return
        clientState.lastHitAt = now
        this.broadcastRoom(
          room,
          'remote-note',
          {
            playerId: player.id,
            name: player.name,
            instrument: inst,
            target: p.target,
            velocity: Math.min(1, Math.max(0, velocity)),
            ts: Number.isFinite(p.ts) ? Number(p.ts) : now,
          },
          server,
        )
      } else if (event === 'cursor') {
        const room = clientState.room
        const p = data
        if (!room || !p || typeof p !== 'object') return
        if (p.roomId !== room.code || p.playerId !== player.id) return
        if (!Array.isArray(p.hands) || p.hands.length > 2) return
        const hands = []
        for (const h of p.hands) {
          const x = Number(h?.x)
          const y = Number(h?.y)
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue
          hands.push({
            x: Math.min(1, Math.max(0, x)),
            y: Math.min(1, Math.max(0, y)),
          })
        }
        const now = Date.now()
        if (now - clientState.lastCursorAt < MIN_CURSOR_INTERVAL_MS) return
        clientState.lastCursorAt = now
        this.broadcastRoom(
          room,
          'remote-cursor',
          {
            playerId: player.id,
            name: player.name,
            hands,
            ts: now,
          },
          server,
        )
      }
    })

    const close = () => {
      this.leaveClient(server)
      this.clients.delete(server)
    }
    server.addEventListener('close', close)
    server.addEventListener('error', close)

    return new Response(null, { status: 101, webSocket: client })
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return Response.json({ ok: true })
    }
    if (url.pathname === '/ws') {
      const id = env.ROOM_HUB.idFromName('global-hub')
      const stub = env.ROOM_HUB.get(id)
      return stub.fetch(request)
    }
    return env.ASSETS.fetch(request)
  },
}
