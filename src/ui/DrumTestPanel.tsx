import { useEffect, useRef, useState } from 'react'
import { startAudio } from '../audio/engine'
import {
  disposeDrums,
  triggerHiHat,
  triggerKick,
  triggerSnare,
} from '../audio/drums'

const PADS = [
  { id: 'kick', label: 'Kick', trigger: triggerKick },
  { id: 'snare', label: 'Snare', trigger: triggerSnare },
  { id: 'hihat', label: 'Hi-hat', trigger: triggerHiHat },
] as const

export default function DrumTestPanel() {
  const [error, setError] = useState('')
  const [pressed, setPressed] = useState<string | null>(null)
  const flashTimeout = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (flashTimeout.current !== null) clearTimeout(flashTimeout.current)
      disposeDrums()
    }
  }, [])

  const hit = async (
    id: string,
    trigger: (velocity?: number) => void,
  ) => {
    try {
      await startAudio()
      setError('')
      trigger()
      if (flashTimeout.current !== null) clearTimeout(flashTimeout.current)
      setPressed(id)
      flashTimeout.current = window.setTimeout(() => setPressed(null), 140)
    } catch {
      setError(
        'Audio could not start. Your browser may have blocked it — try clicking again.',
      )
    }
  }

  return (
    <section className="drum-panel">
      <h2>Drum test</h2>
      <div className="pads">
        {PADS.map((pad) => (
          <button
            key={pad.id}
            type="button"
            className={`pad ${pressed === pad.id ? 'pressed' : ''}`}
            onClick={() => hit(pad.id, pad.trigger)}
          >
            {pad.label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
