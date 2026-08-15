import { SessionMeta } from '../data'

interface Props {
  session: SessionMeta
}

interface LedgerRow {
  id: string
  kind: 'USER' | 'ASSISTANT' | 'TOOL'
  request?: number
  turn?: number
  tool?: string
  text: string
  preview?: string
}

/** 由会话消息推导轨迹事件（mock：USER / ASSISTANT / TOOL 行） */
function buildRows(session: SessionMeta): LedgerRow[] {
  const rows: LedgerRow[] = []
  let request = 0
  let turn = 0
  for (const m of session.messages) {
    if (m.role === 'user') {
      turn++
      rows.push({ id: m.id, kind: 'USER', turn, text: m.text })
      continue
    }
    if (m.tools) {
      for (const t of m.tools) {
        rows.push({ id: `${m.id}-t${t.tool}`, kind: 'TOOL', request: request + 1, tool: t.tool, text: t.title, preview: t.detail })
      }
    }
    if (m.text || m.thinking) {
      request++
      rows.push({ id: m.id, kind: 'ASSISTANT', request, text: m.thinking ? '(tool call only)' : m.text })
    }
  }
  return rows
}

/**
 * 轨迹页（官方 fV0t5q 工具栏 + _1p9O6q 时间轴 + Y0dWHa 事件账本）：
 * 工具栏（搜索/折叠）→ 时间轴条（turn 边界 + 事件 span）→ 事件表格
 */
export default function TrajectoryPanel({ session }: Props) {
  const rows = buildRows(session)

  return (
    <div className="traj">
      <div className="traj-toolbar" role="toolbar" aria-label="轨迹工具栏">
        <div className="traj-actions">
          <button className="traj-action" aria-label="Collapse turns">⊟ Turns</button>
          <button className="traj-action" aria-label="Collapse calls">⊟ Calls</button>
        </div>
        <div className="traj-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M11.894845 6.647401C11.894845 3.725463 9.534486 1.356779 6.623219 1.35657C3.711786 1.35657 1.351635 3.725338 1.351635 6.647401C1.351843 9.569296 3.711911 11.938273 6.623219 11.938273C9.534361 11.938064 11.894637 9.569171 11.894845 6.647401ZM13.245462 6.647401C13.245254 10.317935 10.280401 13.293613 6.623219 13.293821C2.965871 13.293821 0.000204 10.31806 0 6.647401C0 2.976574 2.965746 0 6.623219 0C10.280526 0.000205 13.245462 2.9767 13.245462 6.647401Z" fill="currentColor" />
            <path d="M16.000417 15.041079L15.044449 16.000433L11.530434 12.473588L12.486298 11.514234L16.000417 15.041079Z" fill="currentColor" />
          </svg>
          <input className="traj-search-input" aria-label="搜索轨迹" placeholder="搜索轨迹" />
        </div>
      </div>

      <section className="traj-plot" aria-label="Trajectory timeline">
        <div className="traj-track" aria-label="Timeline overview; drag horizontally to focus events">
          <button className="traj-earlier" aria-label="Load earlier history">Load earlier history</button>
          <div className="traj-lanes">
            {rows.map((r) => (
              <span
                key={r.id}
                className={`traj-span traj-span-${r.kind.toLowerCase()}`}
                style={{ width: `${Math.max(6, Math.min(60, 14 + r.text.length / 2))}px` }}
                title={r.text}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="traj-ledger">
        <table className="traj-table">
          <tbody>
            <tr className="traj-history-row">
              <td colSpan={2}>
                <button className="traj-history-btn" aria-label="Load earlier history">Load earlier history</button>
              </td>
            </tr>
            {rows.map((r) => (
              <tr key={r.id} className={`traj-row traj-row-${r.kind.toLowerCase()}`} aria-label={`${r.kind}${r.tool ? ', ' + r.tool : ''}${r.text ? ', ' + r.text.slice(0, 60) : ''}`}>
                <td className="traj-event">
                  <div className="traj-event-inner">
                    <span className={`traj-kind traj-kind-${r.kind.toLowerCase()}`}>{r.kind}</span>
                    {r.kind === 'ASSISTANT' && (
                      <button className="traj-request" aria-label={`Request #${r.request}`}>#{r.request}</button>
                    )}
                    {r.kind === 'USER' && r.turn && <span className="traj-turn" aria-label={`Turn ${r.turn}`}>Turn {r.turn}</span>}
                  </div>
                </td>
                <td className="traj-content">
                  {r.kind === 'TOOL' ? (
                    <>
                      <span className="traj-content-tool">{r.tool}</span>
                      <span className="traj-content-text">{r.text}</span>
                      {r.preview && <span className="traj-preview">{r.preview}</span>}
                    </>
                  ) : (
                    <span className="traj-content-text">{r.text}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
