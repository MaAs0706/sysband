import { useSyncExternalStore } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { DrumId } from '../scene/hitZones'

export type ConnState =
  | 'offline'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export interface PlayerInfo {
  id: string
  name: string
}

export interface RemoteHit {
  playerId: string
  name: string
  drum: DrumId
  velocity: number
  ts: number
}

export interface RemoteCursor {
  playerId: string
  name: string
  hands: { x: number; y: number }[]
  ts: number
}

interface NetState {
  conn: ConnState
  roomId: string | null
  you: PlayerInfo | null
  players: PlayerInfo[]
}

let state: NetState = {
  conn: 'offline',
  roomId: null,
  you: null,
  players: [],
}

const listeners = new Set<() => void>()
const set = (patch: Partial<NetState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useNetState(): NetState {
  return useSyncExternalStore(subscribe, () => state)
}

const DRUM_IDS: DrumId[] = ['kick', 'snare', 'hihat']
const hitListeners = new Set<(hit: RemoteHit) => void>()
const cursorListeners = new Set<(cursor: RemoteCursor) => void>()
const seenHits = new Set<string>()

let socket: Socket | null = null
let desiredRoom: string | null = null

function ensureSocket(): Socket {
  if (socket) return socket
  socket = io()

  socket.on('connect', () => {
    set({ conn: 'connected' })
    if (desiredRoom) void doJoin(desiredRoom)
  })
  socket.on('disconnect', () => set({ conn: 'disconnected' }))
  socket.io.on('reconnect_attempt', () => set({ conn: 'reconnecting' }))
  socket.io.on('reconnect_failed', () => set({ conn: 'disconnected' }))

  socket.on('room-state', (payload: unknown) => {
    const p = payload as { roomId?: string; players?: PlayerInfo[] }
    if (typeof p?.roomId === 'string' && Array.isArray(p.players)) {
      set({ roomId: p.roomId, players: p.players })
    }
  })

  socket.on('drum-hit', (payload: unknown) => {
    const p = payload as Partial<RemoteHit>
    if (!DRUM_IDS.includes(p.drum as DrumId)) return
    const velocity = Number(p.velocity)
    if (!Number.isFinite(velocity)) return
    const key = `${p.playerId}:${p.ts}:${p.drum}`
    if (seenHits.has(key)) return
    seenHits.add(key)
    if (seenHits.size > 256) seenHits.clear()
    const hit: RemoteHit = {
      playerId: String(p.playerId),
      name: String(p.name ?? 'player'),
      drum: p.drum as DrumId,
      velocity: Math.min(1, Math.max(0, velocity)),
      ts: Number(p.ts) || 0,
    }
    hitListeners.forEach((cb) => cb(hit))
  })

  socket.on('remote-cursor', (payload: unknown) => {
    const p = payload as Partial<RemoteCursor>
    if (typeof p?.playerId !== 'string' || !Array.isArray(p.hands)) return
    const hands = p.hands
      .map((h) => ({ x: Number(h?.x), y: Number(h?.y) }))
      .filter((h) => Number.isFinite(h.x) && Number.isFinite(h.y))
      .slice(0, 2)
    cursorListeners.forEach((cb) =>
      cb({
        playerId: p.playerId as string,
        name: String(p.name ?? 'player'),
        hands,
        ts: Number(p.ts) || 0,
      }),
    )
  })

  return socket
}

async function doJoin(
  roomId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const s = ensureSocket()
  try {
    if (!s.connected) {
      await new Promise<void>((resolve, reject) => {
        s.once('connect', () => resolve())
        s.once('connect_error', () => reject(new Error('unreachable')))
        s.connect()
      })
    }
    const res = (await s
      .timeout(5000)
      .emitWithAck('join', { roomId })) as {
      ok: boolean
      error?: string
      you?: PlayerInfo
      roomId?: string
    }
    if (res?.ok && res.you) {
      desiredRoom = res.roomId ?? roomId ?? null
      set({ you: res.you })
    }
    return res?.ok ? { ok: true } : { ok: false, error: res?.error ?? 'failed' }
  } catch {
    return { ok: false, error: 'server unreachable' }
  }
}

export async function joinRoom(
  roomId?: string,
): Promise<{ ok: boolean; error?: string }> {
  set({ conn: 'connecting' })
  const res = await doJoin(roomId)
  if (!res.ok && state.conn === 'connecting') set({ conn: 'disconnected' })
  return res
}

export function leaveRoom(): void {
  desiredRoom = null
  socket?.emit('leave')
  set({ roomId: null, you: null, players: [] })
}

export function sendHit(drum: DrumId, velocity: number): void {
  if (!socket?.connected || !state.roomId || !state.you) return
  socket.emit('hit', {
    roomId: state.roomId,
    playerId: state.you.id,
    drum,
    velocity,
    ts: Date.now(),
  })
}

export function onRemoteHit(cb: (hit: RemoteHit) => void): () => void {
  hitListeners.add(cb)
  return () => {
    hitListeners.delete(cb)
  }
}

let lastCursorSent = 0

export function sendCursor(hands: { x: number; y: number }[]): void {
  if (!socket?.connected || !state.roomId || !state.you) return
  const now = Date.now()
  if (now - lastCursorSent < 50) return
  lastCursorSent = now
  socket.emit('cursor', {
    roomId: state.roomId,
    playerId: state.you.id,
    hands,
    ts: now,
  })
}

export function onRemoteCursor(
  cb: (cursor: RemoteCursor) => void,
): () => void {
  cursorListeners.add(cb)
  return () => {
    cursorListeners.delete(cb)
  }
}

export function remoteColorFor(playerId: string): number {
  let hash = 0
  for (let i = 0; i < playerId.length; i++) hash += playerId.charCodeAt(i)
  return hash % 4
}
