import { useEffect, useRef, useState } from 'react'
import { startAudio } from '../audio/engine'
import {
  disposeAllInstruments,
  PIANO_NOTES,
  triggerInstrument,
  type InstrumentId,
} from '../audio/instruments'
import { selectInstrument, sendNote, useNetState } from '../net/session'

const DOCK_STATIONS: {
  id: InstrumentId
  label: string
  hint: string
  cls: string
}[] = [
  {
    id: 'drums',
    label: 'Drums',
    hint: 'Strike downward into Snare, Kick or Hi-hat rings',
    cls: 'dock-drums',
  },
  {
    id: 'piano',
    label: 'Grand Piano',
    hint: 'Strike downward into the C4–C5 keybed',
    cls: 'dock-piano',
  },
  {
    id: 'guitar',
    label: 'Electric Guitar',
    hint: 'Sweep vertically across the 6 strings',
    cls: 'dock-guitar',
  },
]

const DRUM_BUTTONS = [
  { id: 'snare', label: 'Snare', sub: 'Left ring' },
  { id: 'kick', label: 'Kick', sub: 'Center ring' },
  { id: 'hihat', label: 'Hi-hat', sub: 'Right ring' },
] as const

const GUITAR_BUTTONS = [
  { id: 'E2', label: 'E2', sub: '6th' },
  { id: 'A2', label: 'A2', sub: '5th' },
  { id: 'D3', label: 'D3', sub: '4th' },
  { id: 'G3', label: 'G3', sub: '3rd' },
  { id: 'B3', label: 'B3', sub: '2nd' },
  { id: 'E4', label: 'E4', sub: '1st' },
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

  const activeMeta =
    DOCK_STATIONS.find((s) => s.id === net.instrument) ?? DOCK_STATIONS[0]

  return (
    <section className={`instrument-dock dock-active-${net.instrument}`}>
      <div className="dock-station-selector" role="group" aria-label="Instrument station">
        <span className="dock-section-tag">STATION</span>
        <div className="inst-tabs">
          {DOCK_STATIONS.map((st) => (
            <button
              key={st.id}
              type="button"
              className={`inst-tab ${st.cls} ${net.instrument === st.id ? 'active' : ''}`}
              onClick={() => selectInstrument(st.id)}
            >
              <span className="tab-indicator" />
              {st.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dock-divider" />

      <div className="dock-triggers">
        <div className="dock-triggers-head">
          <span className="dock-section-tag">
            {net.instrument === 'piano'
              ? 'KEYBED · C4–C5'
              : net.instrument === 'guitar'
                ? 'STRINGS · E2–E4'
                : 'DRUM KIT'}
          </span>
          <span className="dock-gesture-hint">{activeMeta.hint}</span>
        </div>

        <div className="pads">
          {net.instrument === 'drums' &&
            DRUM_BUTTONS.map((pad) => (
              <button
                key={pad.id}
                type="button"
                className={`pad pad-drums ${pressed === `drums:${pad.id}` ? 'pressed' : ''}`}
                onClick={() => hit('drums', pad.id, pad.label)}
              >
                <span className="pad-main">{pad.label}</span>
                <span className="pad-sub">{pad.sub}</span>
              </button>
            ))}
          {net.instrument === 'piano' &&
            PIANO_NOTES.map((note) => (
              <button
                key={note}
                type="button"
                className={`pad pad-key pad-piano ${pressed === `piano:${note}` ? 'pressed' : ''}`}
                onClick={() => hit('piano', note, `Piano ${note}`)}
              >
                <span className="pad-main">{note}</span>
              </button>
            ))}
          {net.instrument === 'guitar' &&
            GUITAR_BUTTONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`pad pad-guitar ${pressed === `guitar:${s.id}` ? 'pressed' : ''}`}
                onClick={() => hit('guitar', s.id, `Guitar ${s.label}`)}
              >
                <span className="pad-main">{s.label}</span>
                <span className="pad-sub">{s.sub}</span>
              </button>
            ))}
        </div>
      </div>

      {error && <p className="error dock-error">{error}</p>}
    </section>
  )
}
