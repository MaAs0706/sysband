import { useEffect, useState, type RefObject } from 'react'

export interface DebugStats {
  fps: number
  hands: number
  lastHit: string
  lastVelocity: number
}

export default function DebugOverlay({
  source,
}: {
  source: RefObject<DebugStats>
}) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [])

  const stats = source.current
  return (
    <div className="debug">
      <span>fps {Math.round(stats.fps)}</span>
      <span>hands {stats.hands}</span>
      <span>last {stats.lastHit || '—'}</span>
      <span>vel {stats.lastVelocity.toFixed(2)}</span>
    </div>
  )
}
