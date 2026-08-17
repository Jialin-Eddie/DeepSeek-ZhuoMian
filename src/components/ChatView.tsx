import { useState } from 'react'
import { SessionMeta, ToolCallCard } from '../data'

interface Props {
  session: SessionMeta
  /** 当前访问模式：auto = 自动接受编辑（Claude Code acceptEdits 同款），其他模式需人工确认 */
  mode?: string
}

/** 待确认工具卡片：自动模式下直接标记「已自动批准」；否则给出 允许 / 拒绝 按钮 */
function PendingToolCard({ card, auto }: { card: ToolCallCard; auto: boolean }) {
  const [resolved, setResolved] = useState<'pending' | 'done' | 'error'>('pending')
  const status = auto ? 'done' : resolved
  const cls = status === 'done' ? 'tool-done' : status === 'error' ? 'tool-error' : 'tool-pending'
  return (
    <div className={`tool-card ${cls}`}>
      <span className="tool-name">{card.tool}</span>
      <span className="tool-title">{card.title}</span>
      <span className="tool-status">{status === 'done' ? '✓' : status === 'error' ? '✗' : '…'}</span>
      <span className="tool-detail">{auto ? '已自动批准' : status === 'pending' ? '等待确认' : card.detail}</span>
      {!auto && status === 'pending' && (
        <span className="tool-actions">
          <button className="tool-allow" onClick={() => setResolved('done')}>允许</button>
          <button className="tool-deny" onClick={() => setResolved('error')}>拒绝</button>
        </span>
      )}
    </div>
  )
}

/** 官方 Md3f7G 消息流：加载更早 + flowItem 消息块 + callRow 工具行 + turnStatus shimmer */
export default function ChatView({ session, mode }: Props) {
  const auto = mode === 'auto'
  return (
    <div className="chat">
      <button className="chat-older" aria-label="加载更早">加载更早</button>
      <div className="chat-flow">
        {session.messages.map((m) => (
          <div key={m.id} id={`msg-${m.id}`} className="chat-flow-item">
            <div className={`msg msg-${m.role}`}>
              {m.thinking && (
                <div className="turn-status" aria-hidden="true">
                  思考中…
                </div>
              )}
              {!m.thinking && <div className="msg-label">{m.role === 'user' ? '你' : 'DeepSeek'}</div>}
              {m.text && <div className="msg-text">{m.text}</div>}
              {m.tools && (
                <div className="tool-cards">
                  {m.tools.map((t, i) =>
                    t.status === 'pending' ? (
                      <PendingToolCard key={i} card={t} auto={auto} />
                    ) : (
                      <div key={i} className={`tool-card tool-${t.status}`}>
                        <span className="tool-name">{t.tool}</span>
                        <span className="tool-title">{t.title}</span>
                        <span className="tool-status">{t.status === 'running' ? '⏳' : t.status === 'done' ? '✓' : '✗'}</span>
                        <span className="tool-detail">{t.detail}</span>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
