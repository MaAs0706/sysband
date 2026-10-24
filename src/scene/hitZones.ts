import {
  PIANO_NOTES,
  type GuitarNote,
  type InstrumentId,
  type PianoNote,
} from '../audio/instruments'

export type DrumId = 'kick' | 'snare' | 'hihat'

export interface DrumPad {
  id: DrumId
  label: string
  cx: number
  cy: number
  r: number
  color: number
}

export const DRUM_PADS: DrumPad[] = [
  { id: 'snare', label: 'Snare', cx: 0.24, cy: 0.78, r: 0.072, color: 0x67e8f9 },
  { id: 'kick', label: 'Kick', cx: 0.5, cy: 0.84, r: 0.085, color: 0xc084fc },
  { id: 'hihat', label: 'Hi-hat', cx: 0.76, cy: 0.78, r: 0.068, color: 0xfbbf24 },
]

export function padAt(
  apparentX: number,
  apparentY: number,
  aspect: number,
): DrumPad | null {
  for (const pad of DRUM_PADS) {
    const dx = (apparentX - pad.cx) * aspect
    const dy = apparentY - pad.cy
    if (dx * dx + dy * dy < pad.r * pad.r) return pad
  }
  return null
}

export interface PianoKeyZone {
  note: PianoNote
  x0: number
  x1: number
  cx: number
  y0: number
  y1: number
}

export const PIANO_KEY_ZONES: PianoKeyZone[] = PIANO_NOTES.map((note, idx) => {
  const span = 0.76
  const start = 0.12
  const w = span / PIANO_NOTES.length
  const x0 = start + idx * w
  const x1 = x0 + w
  return {
    note,
    x0,
    x1,
    cx: (x0 + x1) / 2,
    y0: 0.71,
    y1: 0.93,
  }
})

export function pianoKeyAt(
  apparentX: number,
  apparentY: number,
): PianoKeyZone | null {
  if (apparentY < 0.71 || apparentY > 0.93) return null
  for (const k of PIANO_KEY_ZONES) {
    if (apparentX >= k.x0 && apparentX <= k.x1) return k
  }
  return null
}

export interface GuitarStringZone {
  index: number
  y: number
  x0: number
  x1: number
  lowNote: GuitarNote
  highNote: GuitarNote
}

const LOW_VOICING: GuitarNote[] = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
const HIGH_VOICING: GuitarNote[] = ['A3', 'D4', 'G4', 'B4', 'E5', 'E4']

export const GUITAR_STRING_ZONES: GuitarStringZone[] = LOW_VOICING.map(
  (lowNote, idx) => ({
    index: idx,
    y: 0.68 + idx * 0.044,
    x0: 0.16,
    x1: 0.84,
    lowNote,
    highNote: HIGH_VOICING[idx],
  }),
)

export const STRIKE = {
  strikeVelocity: 0.55,
  entryVelocity: 0.28,
  cooldownMs: 210,
  minGain: 0.25,
} as const

export interface Strike {
  id: DrumId
  velocity: number
}

export interface InstrumentHit {
  instrument: InstrumentId
  target: string
  label: string
  velocity: number
}

export class StrikeDetector {
  private lastHitAt = new Map<string, number>()
  private strikeVelocity = STRIKE.strikeVelocity
  private entryVelocity = STRIKE.entryVelocity
  private cooldownMs = STRIKE.cooldownMs

  constructor(overrides: Partial<typeof STRIKE> = {}) {
    Object.assign(this, overrides)
  }

  update(
    pad: DrumPad | null,
    enteredZone: boolean,
    vy: number,
    now: number,
  ): Strike | null {
    if (!pad) return null
    const threshold = enteredZone ? this.entryVelocity : this.strikeVelocity
    if (vy < threshold) return null
    const last = this.lastHitAt.get(pad.id) ?? -Infinity
    if (now - last < this.cooldownMs) return null
    this.lastHitAt.set(pad.id, now)
    const velocity = Math.min(1, Math.max(STRIKE.minGain, STRIKE.minGain + vy / 4))
    return { id: pad.id, velocity }
  }

  updatePiano(
    keyZone: PianoKeyZone | null,
    enteredKey: boolean,
    vy: number,
    now: number,
  ): InstrumentHit | null {
    if (!keyZone) return null
    const threshold = enteredKey ? 0.18 : 0.48
    if (vy < threshold) return null
    const last = this.lastHitAt.get(keyZone.note) ?? -Infinity
    if (now - last < 170) return null
    this.lastHitAt.set(keyZone.note, now)
    const velocity = Math.min(1, Math.max(0.28, 0.3 + vy / 3.6))
    return {
      instrument: 'piano',
      target: keyZone.note,
      label: `Piano ${keyZone.note}`,
      velocity,
    }
  }

  updateGuitar(
    prevY: number,
    currX: number,
    currY: number,
    vy: number,
    now: number,
  ): InstrumentHit | null {
    if (currX < 0.16 || currX > 0.84) return null
    const speed = Math.abs(vy)
    if (speed < 0.22) return null
    const minY = Math.min(prevY, currY)
    const maxY = Math.max(prevY, currY)
    for (const s of GUITAR_STRING_ZONES) {
      if (s.y >= minY && s.y <= maxY) {
        const key = `str_${s.index}`
        const last = this.lastHitAt.get(key) ?? -Infinity
        if (now - last < 115) continue
        this.lastHitAt.set(key, now)
        const note = currX >= 0.5 ? s.highNote : s.lowNote
        const velocity = Math.min(1, Math.max(0.3, 0.3 + speed / 3.8))
        return {
          instrument: 'guitar',
          target: note,
          label: `Guitar ${note}`,
          velocity,
        }
      }
    }
    return null
  }

  reset(): void {
    this.lastHitAt.clear()
  }
}
