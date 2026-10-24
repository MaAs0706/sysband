import {
  leaveRoom,
  PLAYER_COLORS,
  remoteColorFor,
  useNetState,
} from '../net/session'

const STATUS_LABEL: Record<string, string> = {
  offline: 'offline',
  connecting: 'connecting…',
  connected: 'connected',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
}

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
      <div className="room-players">
        {net.players.map((p) => {
          const you = p.id === net.you?.id
          const color = you ? '#d8b4fe' : PLAYER_COLORS[remoteColorFor(p.id)]
          return (
            <span
              key={p.id}
              className="player-chip"
              style={{ color, borderColor: `${color}66` }}
            >
              {p.name}
              {you ? ' (you)' : ''}
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
