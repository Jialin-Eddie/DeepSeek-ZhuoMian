import { useState } from 'react'
import { TimelineItem } from '../data'

interface Props {
  items: TimelineItem[]
  onJump: (messageId: string) => void
}

/**
 * 时间轴导航（#26）：
 * 对话右侧的竖栏，每条横线 = 一条用户 prompt。
 * - 横线长度 ∝ prompt 长度（自动分长短）
 * - 悬停显示 prompt 预览（不用点击）
 * - 点击直接跳转到该条 prompt 的位置
 */
export default function TimelineRail({ items, onJump }: Props) {
  const [hover, setHover] = useState<TimelineItem | null>(null)

  return (
    <div className="timeline">
      <div className="timeline-inner">
        {items.map((item) => {
          const len = Math.min(28, 6 + Math.round(item.prompt.length / 8))
          return (
            <button
              key={item.id}
              className="timeline-line"
              style={{ width: `${len}px` }}
              title={item.prompt}
              onMouseEnter={() => setHover(item)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onJump(item.id)}
            />
          )
        })}
      </div>
      {hover && (
        <div className="timeline-tooltip">
          <div className="tip-time">{hover.time}</div>
          <div className="tip-text">{hover.prompt}</div>
        </div>
      )}
    </div>
  )
}
