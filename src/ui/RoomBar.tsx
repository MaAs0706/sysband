import type { InstrumentId } from '../audio/instruments'
import {
  leaveRoom,
  PLAYER_COLORS,
  remoteColorFor,
  selectInstrument,
  useNetState,
} from '../net/session'

const STATUS_LABEL: Record<string, string> = {
  offline: 'offline',
  connecting: 'connecting…',
  connected: 'connected',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
}

const INST_TABS: { id: InstrumentId; label: string }[] = [
  { id: 'drums', label: 'Drums' },
  { id: 'piano', label: 'Piano' },
  { id: 'guitar', label: 'Guitar' },
]

export default function RoomBar() {
  const net = useNetState()

  return (
    <div className="room-top">
      <span className="logo-mini">RoomTone</span>
      <span className="room-code" title="Share this code">
        {net.roomId}
      </span>
      <span className={`conn conn-${net.conn}`}>
        <span className="conn-dot" />
        {STATUS_LABEL[net.conn]}
      </span>

      <div className="inst-tabs" role="group" aria-label="Select instrument">
        {INST_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`inst-tab ${net.instrument === t.id ? 'active' : ''}`}
            onClick={() => selectInstrument(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="room-players">
        {net.players.map((p) => {
          const you = p.id === net.you?.id
          const color = you ? '#d8b4fe' : PLAYER_COLORS[remoteColorFor(p.id)]
          const instName =
            p.instrument === 'piano'
              ? 'Piano'
              : p.instrument === 'guitar'
                ? 'Guitar'
                : 'Drums'
          return (
            <span
              key={p.id}
              className="player-chip"
              style={{ color, borderColor: `${color}66` }}
            >
              {p.name}
              {you ? ' (you)' : ''} · {instName}
            </span>
          )
        })}
      </div>
      <button type="button" className="secondary" onClick={leaveRoom}>
        Leave room
      </button>
    </div>
  )
}
