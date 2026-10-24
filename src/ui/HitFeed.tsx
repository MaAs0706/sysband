import type { InstrumentId } from '../audio/instruments'

export interface HitItem {
  key: number
  name: string
  instrument: InstrumentId
  label: string
}

export default function HitFeed({
  items,
  onExpire,
}: {
  items: HitItem[]
  onExpire: (key: number) => void
}) {
  if (!items.length) return null
  return (
    <div className="hit-feed">
      {items.map((item) => (
        <div
          key={item.key}
          className={`hit-item hit-${item.instrument}`}
          onAnimationEnd={() => onExpire(item.key)}
        >
          {item.name} · {item.label}
        </div>
      ))}
    </div>
  )
}
