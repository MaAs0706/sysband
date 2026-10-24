import { useSyncExternalStore } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { DrumId } from '../scene/hitZones'
import {
  GUITAR_NOTES,
  PIANO_NOTES,
  type InstrumentId,
} from '../audio/instruments'

export type ConnState =
  | 'offline'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export interface PlayerInfo {
  id: string
  name: string
  instrument: InstrumentId
}

export interface RemoteHit {
  playerId: string
  name: string
  drum: DrumId
  velocity: number
  ts: number
}

export interface RemoteNote {
  playerId: string
  name: string
  instrument: InstrumentId
  target: string
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
  instrument: InstrumentId
}

let state: NetState = {
  conn: 'offline',
  roomId: null,
  you: null,
  players: [],
  instrument: 'drums',
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

const DRUM_IDS: readonly string[] = ['kick', 'snare', 'hihat']
const hitListeners = new Set<(hit: RemoteHit) => void>()
const noteListeners = new Set<(note: RemoteNote) => void>()
const cursorListeners = new Set<(cursor: RemoteCursor) => void>()
const seenHits = new Set<string>()

let socket: Socket | null = null
let desiredRoom: string | null = null

function isValidTarget(inst: InstrumentId, target: string): boolean {
  if (inst === 'drums') return DRUM_IDS.includes(target)
  if (inst === 'piano') return (PIANO_NOTES as readonly string[]).includes(target)
  if (inst === 'guitar') return (GUITAR_NOTES as readonly string[]).includes(target)
  return false
}

function dedupe(key: string): boolean {
  if (seenHits.has(key)) return false
  seenHits.add(key)
  if (seenHits.size > 256) seenHits.clear()
  return true
}

function ensureSocket(): Socket {
  if (socket) return socket
  socket = io()

  socket.on('connect', () => {
    set({ conn: 'connected' })
    if (desiredRoom) void doJoin(desiredRoom, state.instrument)
  })
  socket.on('disconnect', () => set({ conn: 'disconnected' }))
  socket.io.on('reconnect_attempt', () => set({ conn: 'reconnecting' }))
  socket.io.on('reconnect_failed', () => set({ conn: 'disconnected' }))

  socket.on('room-state', (payload: unknown) => {
    const p = payload as { roomId?: string; players?: PlayerInfo[] }
    if (typeof p?.roomId === 'string' && Array.isArray(p.players)) {
      const normalized = p.players.map((pl) => ({
        id: String(pl.id),
        name: String(pl.name),
        instrument: (pl.instrument ?? 'drums') as InstrumentId,
      }))
      const updatedYou =
        normalized.find((pl) => pl.id === state.you?.id) ?? state.you
      set({ roomId: p.roomId, players: normalized, you: updatedYou })
    }
  })

  socket.on('drum-hit', (payload: unknown) => {
    const p = payload as Partial<RemoteHit>
    if (!DRUM_IDS.includes(String(p.drum))) return
    const velocity = Number(p.velocity)
    if (!Number.isFinite(velocity)) return
    const key = `${p.playerId}:${p.ts}:${p.drum}`
    if (!dedupe(key)) return
    const hit: RemoteHit = {
      playerId: String(p.playerId),
      name: String(p.name ?? 'player'),
      drum: p.drum as DrumId,
      velocity: Math.min(1, Math.max(0, velocity)),
      ts: Number(p.ts) || 0,
    }
    hitListeners.forEach((cb) => cb(hit))
    noteListeners.forEach((cb) =>
      cb({
        playerId: hit.playerId,
        name: hit.name,
        instrument: 'drums',
        target: hit.drum,
        velocity: hit.velocity,
        ts: hit.ts,
      }),
    )
  })

  socket.on('remote-note', (payload: unknown) => {
    const p = payload as Partial<RemoteNote>
    const inst = p.instrument as InstrumentId
    if (!inst || typeof p.target !== 'string') return
    if (!isValidTarget(inst, p.target)) return
    const velocity = Number(p.velocity)
    if (!Number.isFinite(velocity)) return
    const key = `${p.playerId}:${p.ts}:${inst}:${p.target}`
    if (!dedupe(key)) return
    const ev: RemoteNote = {
      playerId: String(p.playerId),
      name: String(p.name ?? 'player'),
      instrument: inst,
      target: p.target,
      velocity: Math.min(1, Math.max(0, velocity)),
      ts: Number(p.ts) || 0,
    }
    noteListeners.forEach((cb) => cb(ev))
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
  instrument: InstrumentId = state.instrument,
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
      .emitWithAck('join', { roomId, instrument })) as {
      ok: boolean
      error?: string
      you?: PlayerInfo
      roomId?: string
    }
    if (res?.ok && res.you) {
      desiredRoom = res.roomId ?? roomId ?? null
      set({
        you: {
          ...res.you,
          instrument: res.you.instrument ?? instrument,
        },
        instrument: res.you.instrument ?? instrument,
      })
      return { ok: true }
    }
    desiredRoom = null
    set({ roomId: null, you: null, players: [] })
    return { ok: false, error: res?.error ?? 'failed' }
  } catch {
    desiredRoom = null
    set({ roomId: null, you: null, players: [] })
    return { ok: false, error: 'server unreachable' }
  }
}

export async function joinRoom(
  roomId?: string,
  instrument: InstrumentId = state.instrument,
): Promise<{ ok: boolean; error?: string }> {
  set({ conn: 'connecting', instrument })
  const res = await doJoin(roomId, instrument)
  if (!res.ok && state.conn === 'connecting') set({ conn: 'disconnected' })
  return res
}

export function selectInstrument(instrument: InstrumentId): void {
  set({
    instrument,
    you: state.you ? { ...state.you, instrument } : null,
    players: state.players.map((p) =>
      p.id === state.you?.id ? { ...p, instrument } : p,
    ),
  })
  if (socket?.connected && state.roomId) {
    socket.emit('select-instrument', { instrument })
  }
}

export function leaveRoom(): void {
  desiredRoom = null
  socket?.emit('leave')
  set({ roomId: null, you: null, players: [] })
}

export function sendHit(drum: DrumId, velocity: number): void {
  sendNote('drums', drum, velocity)
}

export function sendNote(
  instrument: InstrumentId,
  target: string,
  velocity: number,
): void {
  if (!socket?.connected || !state.roomId || !state.you) return
  const ts = Date.now()
  if (instrument === 'drums') {
    socket.emit('hit', {
      roomId: state.roomId,
      playerId: state.you.id,
      drum: target,
      velocity,
      ts,
    })
  } else {
    socket.emit('note', {
      roomId: state.roomId,
      playerId: state.you.id,
      instrument,
      target,
      velocity,
      ts,
    })
  }
}

export function onRemoteHit(cb: (hit: RemoteHit) => void): () => void {
  hitListeners.add(cb)
  return () => {
    hitListeners.delete(cb)
  }
}

export function onRemoteNote(cb: (note: RemoteNote) => void): () => void {
  noteListeners.add(cb)
  return () => {
    noteListeners.delete(cb)
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

export const PLAYER_COLORS = ['#fbbf24', '#34d399', '#60a5fa', '#f472b6']

export function remoteColorFor(playerId: string): number {
  let hash = 0
  for (let i = 0; i < playerId.length; i++) hash += playerId.charCodeAt(i)
  return hash % PLAYER_COLORS.length
}
