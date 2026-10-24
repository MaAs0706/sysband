import { useState } from 'react'
import { startAudio } from '../audio/engine'
import { joinRoom, useNetState } from '../net/session'

const STATUS_LABEL: Record<string, string> = {
  offline: 'offline',
  connecting: 'connecting…',
  connected: 'connected',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
}

export default function Landing() {
  const net = useNetState()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const join = async (roomId?: string) => {
    setBusy(true)
    setError('')
    const res = await joinRoom(roomId)
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'could not join room')
    else void startAudio().catch(() => {})
  }

  return (
    <div className="landing">
      <h1 className="logo">RoomTone</h1>
      <p className="tagline">
        A virtual drum room. Flick your fingertip down through the glowing
        pads — play live with friends, right in the browser.
      </p>

      <div className="landing-card">
        <button
          type="button"
          className="primary big"
          disabled={busy}
          onClick={() => join()}
        >
          {busy ? 'Connecting…' : 'Create a room'}
        </button>
        <div className="divider">
          <span />
          or join with a code
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
        Uses your webcam for hand tracking — decent lighting helps. Video
        never leaves your device; only fingertip positions are shared.
      </p>
    </div>
  )
}
