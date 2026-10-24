import type { DrumId } from '../scene/hitZones'

export interface HitItem {
  key: number
  name: string
  drum: DrumId
}

const LABELS: Record<DrumId, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hihat: 'Hi-hat',
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
          className={`hit-item hit-${item.drum}`}
          onAnimationEnd={() => onExpire(item.key)}
        >
          {item.name} · {LABELS[item.drum]}
        </div>
      ))}
    </div>
  )
}
