import { useEffect, useState, type RefObject } from 'react'

export interface DebugStats {
  fps: number
  hands: number
  lastHit: string
  lastVelocity: number
}

export default function DebugOverlay({
  source,
  cameraStatus,
}: {
  source: RefObject<DebugStats>
  cameraStatus?: string
}) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [])

  const stats = source.current
  return (
    <div className="debug" role="status" aria-label="Developer telemetry">
      <span className="debug-tag">DEV TELEMETRY</span>
      <span>cam {cameraStatus ?? 'idle'}</span>
      <span>fps {Math.round(stats.fps)}</span>
      <span>hands {stats.hands}</span>
      <span>last {stats.lastHit || '—'}</span>
      <span>vel {stats.lastVelocity.toFixed(2)}</span>
    </div>
  )
}
