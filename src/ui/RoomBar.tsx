import { useState } from 'react'
import {
  leaveRoom,
  PLAYER_COLORS,
  remoteColorFor,
  useNetState,
} from '../net/session'

const STATUS_LABEL: Record<string, string> = {
  offline: 'Offline',
  connecting: 'Connecting',
  connected: 'Live',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
}

const INST_BADGE: Record<string, { label: string; cls: string }> = {
  drums: { label: 'Drums', cls: 'badge-drums' },
  piano: { label: 'Piano', cls: 'badge-piano' },
  guitar: { label: 'Guitar', cls: 'badge-guitar' },
}

export default function RoomBar({
  showDebug,
  onToggleDebug,
}: {
  showDebug: boolean
  onToggleDebug: () => void
}) {
  const net = useNetState()
  const [copied, setCopied] = useState(false)

  const copyCode = () => {
    if (!net.roomId) return
    void navigator.clipboard?.writeText(net.roomId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <header className="room-top">
      <div className="brand-cluster">
        <span className="logo-mini">RoomTone</span>
        <span className="header-sep" />
        <button
          type="button"
          className="room-code-btn"
          onClick={copyCode}
          title="Click to copy room code"
        >
          <span className="code-caption">ROOM</span>
          <span className="room-code">{net.roomId}</span>
          <span className="code-copy-tag">{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <span className={`conn conn-${net.conn}`}>
          <span className="conn-dot" />
          {STATUS_LABEL[net.conn]}
        </span>
      </div>

      <div className="room-players" aria-label="Connected musicians">
        {net.players.map((p) => {
          const you = p.id === net.you?.id
          const color = you ? '#c4b5fd' : PLAYER_COLORS[remoteColorFor(p.id)]
          const badge = INST_BADGE[p.instrument] ?? INST_BADGE.drums
          return (
            <div
              key={p.id}
              className={`player-chip ${you ? 'is-you' : ''}`}
            >
              <span
                className="player-dot"
                style={{ backgroundColor: color }}
              />
              <span className="player-name">
                {p.name}
                {you ? ' (you)' : ''}
              </span>
              <span className={`player-inst ${badge.cls}`}>{badge.label}</span>
            </div>
          )
        })}
      </div>

      <div className="header-actions">
        <button
          type="button"
          className={`dev-btn ${showDebug ? 'active' : ''}`}
          onClick={onToggleDebug}
          title="Toggle developer telemetry"
        >
          Telemetry
        </button>
        <button type="button" className="secondary leave-btn" onClick={leaveRoom}>
          Leave Studio
        </button>
      </div>
    </header>
  )
}
