import * as Tone from 'tone'
import {
  disposeDrums,
  triggerHiHat,
  triggerKick,
  triggerSnare,
} from './drums'
import type { DrumId } from '../scene/hitZones'

export type InstrumentId = 'drums' | 'piano' | 'guitar'

export const PIANO_NOTES = [
  'C4',
  'D4',
  'E4',
  'F4',
  'G4',
  'A4',
  'B4',
  'C5',
] as const
export type PianoNote = (typeof PIANO_NOTES)[number]

export const GUITAR_NOTES = [
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
] as const
export type GuitarNote = (typeof GUITAR_NOTES)[number]

export type NoteTarget = DrumId | PianoNote | GuitarNote

let piano: Tone.PolySynth | null = null
let guitar: Tone.PolySynth | null = null
let guitarFilter: Tone.Filter | null = null

function getPiano(): Tone.PolySynth {
  if (!piano) {
    piano = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle8' },
      envelope: { attack: 0.006, decay: 0.55, sustain: 0.15, release: 1.1 },
    }).toDestination()
    piano.volume.value = -6
  }
  return piano
}

function getGuitar(): Tone.PolySynth {
  if (!guitar || !guitarFilter) {
    guitarFilter = new Tone.Filter(2200, 'lowpass').toDestination()
    guitar = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
      envelope: { attack: 0.004, decay: 0.45, sustain: 0.08, release: 0.65 },
    }).connect(guitarFilter)
    guitar.volume.value = -9
  }
  return guitar
}

export function triggerPiano(note: PianoNote, velocity = 0.8): void {
  const v = Math.min(1, Math.max(0.15, velocity))
  getPiano().triggerAttackRelease(note, '8n', Tone.now(), v)
}

export function triggerGuitar(note: GuitarNote, velocity = 0.8): void {
  const v = Math.min(1, Math.max(0.15, velocity))
  getGuitar().triggerAttackRelease(note, '8n', Tone.now(), v)
}

export function triggerInstrument(
  instrument: InstrumentId,
  target: string,
  velocity = 0.8,
): void {
  if (instrument === 'drums') {
    if (target === 'kick') triggerKick(velocity)
    else if (target === 'snare') triggerSnare(velocity)
    else if (target === 'hihat') triggerHiHat(velocity)
  } else if (instrument === 'piano') {
    if ((PIANO_NOTES as readonly string[]).includes(target)) {
      triggerPiano(target as PianoNote, velocity)
    }
  } else if (instrument === 'guitar') {
    if ((GUITAR_NOTES as readonly string[]).includes(target)) {
      triggerGuitar(target as GuitarNote, velocity)
    }
  }
}

export function disposeAllInstruments(): void {
  disposeDrums()
  piano?.dispose()
  guitar?.dispose()
  guitarFilter?.dispose()
  piano = null
  guitar = null
  guitarFilter = null
}
