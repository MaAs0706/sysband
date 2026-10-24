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
  { id: 'snare', label: 'Snare', cx: 0.24, cy: 0.76, r: 0.075, color: 0x67e8f9 },
  { id: 'kick', label: 'Kick', cx: 0.5, cy: 0.84, r: 0.09, color: 0xc084fc },
  { id: 'hihat', label: 'Hi-hat', cx: 0.76, cy: 0.76, r: 0.07, color: 0xfbbf24 },
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

export const STRIKE = {
  strikeVelocity: 0.55,
  entryVelocity: 0.3,
  cooldownMs: 220,
  minGain: 0.25,
} as const

export interface Strike {
  id: DrumId
  velocity: number
}

export class StrikeDetector {
  private lastHitAt = new Map<DrumId, number>()
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

  reset(): void {
    this.lastHitAt.clear()
  }
}
