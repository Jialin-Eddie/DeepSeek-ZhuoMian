import { useState } from 'react'

interface Props {
  onLater: () => void
  onSave: () => void
}

export default function ApiKeyModal({ onLater, onSave }: Props) {
  const [key, setKey] = useState('')

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-label="添加一个 API Key 开始使用">
        <h2 className="dialog-title">添加一个 API Key 开始使用</h2>
        <div className="dialog-body">
          <p>配置 DeepSeek 官方模型，即可开始使用。</p>
          <div className="field">
            <span className="field-label">API 密钥</span>
            <input
              className="field-input"
              aria-label="API 密钥"
              placeholder="sk-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          <div className="dialog-actions">
            <button className="btn-ghost" onClick={onLater}>稍后配置</button>
            <button className="btn-primary" onClick={onSave} disabled={!key.trim()}>保存并继续</button>
          </div>
        </div>
      </div>
    </div>
  )
}
