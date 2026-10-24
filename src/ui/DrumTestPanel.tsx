import { useEffect, useRef, useState } from 'react'
import { startAudio } from '../audio/engine'
import {
  disposeAllInstruments,
  PIANO_NOTES,
  triggerInstrument,
  type InstrumentId,
} from '../audio/instruments'
import { sendNote, useNetState } from '../net/session'

const DRUM_BUTTONS = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'hihat', label: 'Hi-hat' },
] as const

const GUITAR_BUTTONS = [
  { id: 'E2', label: 'E2' },
  { id: 'A2', label: 'A2' },
  { id: 'D3', label: 'D3' },
  { id: 'G3', label: 'G3' },
  { id: 'B3', label: 'B3' },
  { id: 'E4', label: 'E4' },
] as const

export default function DrumTestPanel({
  onTrigger,
}: {
  onTrigger?: (instrument: InstrumentId, target: string, label: string) => void
}) {
  const net = useNetState()
  const [error, setError] = useState('')
  const [pressed, setPressed] = useState<string | null>(null)
  const flashTimeout = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (flashTimeout.current !== null) clearTimeout(flashTimeout.current)
      disposeAllInstruments()
    }
  }, [])

  const hit = async (inst: InstrumentId, target: string, label: string) => {
    try {
      await startAudio()
      setError('')
      triggerInstrument(inst, target, 0.85)
      sendNote(inst, target, 0.85)
      onTrigger?.(inst, target, label)
      if (flashTimeout.current !== null) clearTimeout(flashTimeout.current)
      setPressed(`${inst}:${target}`)
      flashTimeout.current = window.setTimeout(() => setPressed(null), 140)
    } catch {
      setError(
        'Audio could not start. Your browser may have blocked it — try clicking again.',
      )
    }
  }

  return (
    <section className="drum-panel">
      <h2>
        {net.instrument === 'piano'
          ? 'Piano keyboard (C4–C5)'
          : net.instrument === 'guitar'
            ? 'Guitar strings (E2–E4)'
            : 'Drum pads'}
      </h2>
      <div className="pads">
        {net.instrument === 'drums' &&
          DRUM_BUTTONS.map((pad) => (
            <button
              key={pad.id}
              type="button"
              className={`pad ${pressed === `drums:${pad.id}` ? 'pressed' : ''}`}
              onClick={() => hit('drums', pad.id, pad.label)}
            >
              {pad.label}
            </button>
          ))}
        {net.instrument === 'piano' &&
          PIANO_NOTES.map((note) => (
            <button
              key={note}
              type="button"
              className={`pad pad-key ${pressed === `piano:${note}` ? 'pressed' : ''}`}
              onClick={() => hit('piano', note, `Piano ${note}`)}
            >
              {note}
            </button>
          ))}
        {net.instrument === 'guitar' &&
          GUITAR_BUTTONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`pad ${pressed === `guitar:${s.id}` ? 'pressed' : ''}`}
              onClick={() => hit('guitar', s.id, `Guitar ${s.label}`)}
            >
              {s.label}
            </button>
          ))}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
