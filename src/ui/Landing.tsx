import { useState } from 'react'
import { startAudio } from '../audio/engine'
import type { InstrumentId } from '../audio/instruments'
import { joinRoom, selectInstrument, useNetState } from '../net/session'

const STATUS_LABEL: Record<string, string> = {
  offline: 'offline',
  connecting: 'connecting…',
  connected: 'connected',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
}

const INSTRUMENTS: { id: InstrumentId; label: string; desc: string }[] = [
  { id: 'drums', label: 'Drums', desc: 'Kick, snare & hi-hat kit' },
  { id: 'piano', label: 'Grand Piano', desc: '8-key melodic octave' },
  { id: 'guitar', label: 'Electric Guitar', desc: '6-string strum & leads' },
]

export default function Landing() {
  const net = useNetState()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const join = async (roomId?: string) => {
    setBusy(true)
    setError('')
    const res = await joinRoom(roomId, net.instrument)
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'could not join room')
    else void startAudio().catch(() => {})
  }

  return (
    <div className="landing">
      <h1 className="logo">RoomTone</h1>
      <p className="tagline">
        A shared 3D virtual music studio. Pick your instrument, step up to your
        station, and play live with friends using hand gestures.
      </p>

      <div className="landing-card">
        <div className="inst-picker-label">Choose your station</div>
        <div className="inst-picker">
          {INSTRUMENTS.map((inst) => (
            <button
              key={inst.id}
              type="button"
              className={`inst-option ${net.instrument === inst.id ? 'active' : ''}`}
              onClick={() => selectInstrument(inst.id)}
            >
              <span className="inst-title">{inst.label}</span>
              <span className="inst-desc">{inst.desc}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="primary big"
          disabled={busy}
          onClick={() => join()}
        >
          {busy ? 'Connecting…' : 'Enter New Studio Room'}
        </button>
        <div className="divider">
          <span />
          or join with a room code
          <span />
        </div>
        <div className="join-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={4}
            className="room-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code.trim().length === 4)
                void join(code.trim())
            }}
          />
          <button
            type="button"
            className="primary"
            disabled={busy || code.trim().length !== 4}
            onClick={() => join(code.trim())}
          >
            Join
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <p className="conn-line">
          <span className={`conn conn-${net.conn}`}>
            <span className="conn-dot" />
            {STATUS_LABEL[net.conn]}
          </span>
        </p>
      </div>

      <p className="landing-hint">
        Webcam tracking runs locally in your browser — video never leaves your
        device.
      </p>
    </div>
  )
}
