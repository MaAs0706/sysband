import { useState } from 'react'
import { joinRoom, leaveRoom, useNetState } from '../net/session'

const STATUS_LABEL: Record<string, string> = {
  offline: 'offline',
  connecting: 'connecting…',
  connected: 'connected',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
}

export default function RoomPanel() {
  const net = useNetState()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const join = async (roomId?: string) => {
    setBusy(true)
    setError('')
    const res = await joinRoom(roomId)
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'join failed')
  }

  const inRoom = Boolean(net.roomId)

  return (
    <section className="room-panel">
      <h2>
        Room
        <span className={`conn conn-${net.conn}`}>
          <span className="conn-dot" />
          {STATUS_LABEL[net.conn]}
        </span>
      </h2>

      {!inRoom ? (
        <div className="room-join">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => join()}
          >
            Create room
          </button>
          <span className="room-or">or join:</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={4}
            className="room-input"
          />
          <button
            type="button"
            className="secondary"
            disabled={busy || code.trim().length !== 4}
            onClick={() => join(code.trim())}
          >
            Join
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <div className="room-active">
          <span className="room-code">{net.roomId}</span>
          <div className="room-players">
            {net.players.map((p) => (
              <span
                key={p.id}
                className={`player-chip ${p.id === net.you?.id ? 'you' : ''}`}
              >
                {p.name}
                {p.id === net.you?.id ? ' (you)' : ''}
              </span>
            ))}
          </div>
          <button type="button" className="secondary" onClick={leaveRoom}>
            Leave room
          </button>
        </div>
      )}
    </section>
  )
}
