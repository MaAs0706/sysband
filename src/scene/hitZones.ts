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

export interface Strike {
  id: DrumId
  strength: number
}

export class StrikeDetector {
  private lastHitAt = new Map<DrumId, number>()
  private velocityThreshold: number
  private cooldownMs: number

  constructor(velocityThreshold = 0.6, cooldownMs = 200) {
    this.velocityThreshold = velocityThreshold
    this.cooldownMs = cooldownMs
  }

  update(pad: DrumPad | null, vy: number, now: number): Strike | null {
    if (!pad || vy < this.velocityThreshold) return null
    const last = this.lastHitAt.get(pad.id) ?? -Infinity
    if (now - last < this.cooldownMs) return null
    this.lastHitAt.set(pad.id, now)
    return { id: pad.id, strength: Math.min(1, 0.4 + vy / 3) }
  }

  reset(): void {
    this.lastHitAt.clear()
  }
}
