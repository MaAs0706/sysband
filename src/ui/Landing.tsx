import { useState } from 'react'
import { startAudio } from '../audio/engine'
import type { InstrumentId } from '../audio/instruments'
import { joinRoom, selectInstrument, useNetState } from '../net/session'

const STATUS_LABEL: Record<string, string> = {
  offline: 'Ready to connect',
  connecting: 'Connecting to studio…',
  connected: 'Studio relay online',
  reconnecting: 'Reconnecting…',
  disconnected: 'Offline — local mode ready',
}

const INSTRUMENTS: {
  id: InstrumentId
  label: string
  role: string
  gesture: string
  accent: string
}[] = [
  {
    id: 'drums',
    label: 'Acoustic Drums',
    role: 'Rhythm Section',
    gesture: 'Downward fingertip strikes on Kick, Snare & Hi-hat',
    accent: 'drums',
  },
  {
    id: 'piano',
    label: 'Grand Piano',
    role: 'Keys & Harmony',
    gesture: 'Playable C4–C5 melodic octave keybed',
    accent: 'piano',
  },
  {
    id: 'guitar',
    label: 'Electric Guitar',
    role: 'Lead & Chords',
    gesture: '6-string vertical strum with low & high voicings',
    accent: 'guitar',
  },
]

function InstrumentIcon({ id }: { id: InstrumentId }) {
  if (id === 'drums') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <ellipse cx="12" cy="14" rx="7" ry="4" />
        <path d="M5 14v3c0 2.2 3.1 4 7 4s7-1.8 7-4v-3" />
        <path d="M4 6l6 5M20 6l-6 5" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'piano') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M8 5v9M12 5v9M16 5v9M6 14h12" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M15 4l5 5-3 3-5-5 3-3z" />
      <path d="M12 7l-5.5 5.5a4.5 4.5 0 1 0 6.4 6.4L18.5 13" />
      <circle cx="9.5" cy="15.5" r="1.4" />
    </svg>
  )
}

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
    if (!res.ok) setError(res.error ?? 'Could not join room')
    else void startAudio().catch(() => {})
  }

  return (
    <div className="landing-shell">
      <div className="landing-hero">
        <span className="studio-eyebrow">
          <span className="eyebrow-dot" />
          LIVE 3D MULTIPLAYER STUDIO
        </span>
        <h1 className="logo">RoomTone</h1>
        <p className="tagline">
          Step into a shared 3D recording room and play drums, grand piano, or
          electric guitar together in real time using webcam hand gestures.
        </p>
      </div>

      <div className="landing-panel">
        <div className="section-head">
          <span className="section-label">1. Select Your Studio Station</span>
          <span className="section-meta">Switch anytime in-room</span>
        </div>

        <div className="inst-picker">
          {INSTRUMENTS.map((inst) => {
            const selected = net.instrument === inst.id
            return (
              <button
                key={inst.id}
                type="button"
                className={`inst-option inst-${inst.accent} ${selected ? 'active' : ''}`}
                onClick={() => selectInstrument(inst.id)}
              >
                <div className="inst-card-top">
                  <span className="inst-icon">
                    <InstrumentIcon id={inst.id} />
                  </span>
                  <span className="inst-role">{inst.role}</span>
                </div>
                <span className="inst-title">{inst.label}</span>
                <span className="inst-desc">{inst.gesture}</span>
              </button>
            )
          })}
        </div>

        <div className="section-head">
          <span className="section-label">2. Enter a Session</span>
        </div>

        <div className="session-actions">
          <button
            type="button"
            className="primary create-btn"
            disabled={busy}
            onClick={() => join()}
          >
            <span>{busy ? 'Opening Studio…' : 'Create Studio Room'}</span>
            <span className="btn-sub">Starts a new 4-letter session code</span>
          </button>

          <div className="join-card">
            <label className="join-label" htmlFor="room-code-input">
              Have an invite code?
            </label>
            <div className="join-row">
              <input
                id="room-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD"
                maxLength={4}
                className="room-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.trim().length === 4)
                    void join(code.trim())
                }}
              />
              <button
                type="button"
                className="secondary join-submit"
                disabled={busy || code.trim().length !== 4}
                onClick={() => join(code.trim())}
              >
                Join Room
              </button>
            </div>
          </div>
        </div>

        {error && <p className="error-banner">{error}</p>}

        <div className="landing-footer">
          <span className={`conn conn-${net.conn}`}>
            <span className="conn-dot" />
            {STATUS_LABEL[net.conn]}
          </span>
          <span className="privacy-note">
            Camera frames stay on your device · only note &amp; cursor events
            sync
          </span>
        </div>
      </div>
    </div>
  )
}
