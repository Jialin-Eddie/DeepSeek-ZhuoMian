import { SessionMeta } from '../data'

interface Props {
  session: SessionMeta
}

/** 官方 Md3f7G 消息流：加载更早 + flowItem 消息块 + callRow 工具行 + turnStatus shimmer */
export default function ChatView({ session }: Props) {
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
                  {m.tools.map((t, i) => (
                    <div key={i} className={`tool-card tool-${t.status}`}>
                      <span className="tool-name">{t.tool}</span>
                      <span className="tool-title">{t.title}</span>
                      <span className="tool-status">{t.status === 'running' ? '⏳' : t.status === 'done' ? '✓' : '✗'}</span>
                      <span className="tool-detail">{t.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
