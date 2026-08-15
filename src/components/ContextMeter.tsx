import { useState } from 'react'

/**
 * 上下文计量器（官方 JObwrW ContextMeter）：
 * composer 尾部 28px 圆环按钮，点击弹出上下文用量面板（百分比 + 分段条 + 三类明细）。
 * mock 数据：27% / ~273K / 1M
 */
export default function ContextMeter() {
  const [open, setOpen] = useState(false)
  const percent = 27
  const R = 5.5
  const C = 2 * Math.PI * R // ≈34.5575
  const dash = `${(C * percent) / 100} ${C}`

  const rows = [
    { label: '系统提示词', value: '~1.6K', tint: 'var(--dsw-static-neutral-bluish-400)', pct: 0.16 },
    { label: '工具', value: '~6.7K', tint: '#a78bfa', pct: 0.67 },
    { label: '对话消息', value: '~222K', tint: 'var(--dsw-static-blue-450)', pct: 22.2 },
  ]

  return (
    <div className="meter">
      <button
        className="meter-trigger"
        aria-label={`上下文已用 ${percent}%`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
          <circle className="meter-track" cx="7" cy="7" r={R} />
          <circle
            className="meter-fill"
            cx="7"
            cy="7"
            r={R}
            strokeDasharray={dash}
            transform="rotate(-90 7 7)"
          />
        </svg>
      </button>

      {open && (
        <div className="meter-panel" role="dialog" aria-label="上下文已用">
          <div className="meter-header">
            <span className="meter-headline">上下文已用</span>
            <span className="meter-percent">{percent}%</span>
            <span className="meter-headline" />
            <span className="meter-figures">~273K / 1M</span>
          </div>
          <div className="meter-bar">
            {rows.map((r) => (
              <div key={r.label} className="meter-segment" style={{ width: `${r.pct}%`, background: r.tint }} />
            ))}
          </div>
          <dl className="meter-rows">
            {rows.map((r) => (
              <div className="meter-row" key={r.label}>
                <dt>
                  <span className="meter-swatch" style={{ background: r.tint }} aria-hidden="true" />
                  {r.label}
                </dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
