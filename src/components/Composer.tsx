import { useMemo, useRef, useState } from 'react'
import { COMMANDS, CommandDef } from '../commands'
import { IconPlus, IconChevronDown, IconSend, IconShield } from './icons'
import ContextMeter from './ContextMeter'

export interface ModelInfo {
  name: string
  effort: string
}

interface Props {
  mode: string
  onModeChange: (m: string) => void
  model: ModelInfo
  onModelChange: (m: ModelInfo) => void
  theme: 'terminal' | 'chat'
  onThemeChange: (t: 'terminal' | 'chat') => void
  onSend: (text: string) => void
  hero?: boolean
}

export const MODES: { value: string; label: string; hint: string; danger?: boolean }[] = [
  { value: 'readonly', label: '只读', hint: '沙箱只读：仅查看和搜索' },
  { value: 'workspace', label: '标准模式', hint: 'Workspace Write：可编辑项目文件，执行命令前询问' },
  { value: 'full', label: '完全访问', hint: '无限制，不询问（危险）', danger: true },
  { value: 'auto', label: '自动', hint: '自动接受编辑，危险操作前询问' },
  { value: 'plan', label: '计划', hint: '只读规划，确认后执行' },
]

const MODELS: ModelInfo[] = [
  { name: 'DeepSeek-V4-Pro', effort: 'High' },
  { name: 'DeepSeek-V4-Pro', effort: 'Medium' },
  { name: 'DeepSeek-V4-Pro', effort: 'Low' },
  { name: 'DeepSeek-V3', effort: 'High' },
]

export default function Composer({ mode, onModeChange, model, onModelChange, theme, onThemeChange, onSend, hero }: Props) {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [selIndex, setSelIndex] = useState(0)
  const [modeOpen, setModeOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const slashActive = text.startsWith('/')
  const filter = slashActive ? text.slice(1).toLowerCase() : ''
  const matches = useMemo(() => {
    if (!slashActive) return []
    if (!filter) return COMMANDS
    return COMMANDS.filter((c) => c.name.includes(filter))
  }, [slashActive, filter])

  const currentMode = MODES.find((m) => m.value === mode) ?? MODES[1]

  const pick = (cmd: CommandDef) => {
    setText(`/${cmd.name} `)
    setMenuOpen(false)
    inputRef.current?.focus()
  }

  const submit = () => {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText('')
    setMenuOpen(false)
  }

  return (
    <div className={hero ? 'composer composer-hero' : 'composer'}>
      <div className="composer-box">
        {menuOpen && matches.length > 0 && (
          <div className="dropdown">
            {matches.map((c, i) => (
              <button
                key={c.name}
                className={i === selIndex ? 'dd-item selected' : 'dd-item'}
                onMouseEnter={() => setSelIndex(i)}
                onClick={() => pick(c)}
              >
                <span className="dd-name">{c.label}</span>
                <span className="dd-desc">{c.description}</span>
              </button>
            ))}
          </div>
        )}

        <div className="composer-scroll">
          <div className="composer-grow">
            <textarea
              ref={inputRef}
              className="composer-input"
              placeholder="描述你想要构建的内容"
              value={text}
              rows={1}
              onChange={(e) => {
                setText(e.target.value)
                setMenuOpen(e.target.value.startsWith('/'))
                setSelIndex(0)
              }}
              onKeyDown={(e) => {
                if (menuOpen && matches.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSelIndex((i) => (i + 1) % matches.length); return }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSelIndex((i) => (i - 1 + matches.length) % matches.length); return }
                  if (e.key === 'Enter') { e.preventDefault(); pick(matches[selIndex]); return }
                  if (e.key === 'Escape') { setMenuOpen(false); return }
                }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
              }}
            />
          </div>
        </div>

        <div className="composer-row">
          <div className="composer-left">
            <button
              className="add-btn"
              aria-label="命令"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen(!menuOpen)
                setSelIndex(0)
                if (!text.startsWith('/')) { setText('/'); inputRef.current?.focus() }
              }}
            >
              <IconPlus size={14} />
            </button>

            <div className="composer-modes">
              <div className="seg">
                <button
                  className="mode-trigger"
                  aria-label={`访问模式，当前：${currentMode.label}`}
                  aria-haspopup="menu"
                  aria-expanded={modeOpen}
                  onClick={() => setModeOpen((v) => !v)}
                >
                  <IconShield size={16} />
                  <span className="mode-label">{currentMode.label}</span>
                  <span className={modeOpen ? 'chev open' : 'chev'}>
                    <IconChevronDown size={12} />
                  </span>
                </button>
                {modeOpen && (
                  <div className="dropdown">
                    {MODES.map((m) => (
                      <button
                        key={m.value}
                        className={m.danger ? 'dd-item danger' : 'dd-item'}
                        onClick={() => { onModeChange(m.value); setModeOpen(false) }}
                      >
                        <span className="dd-name">{m.label}</span>
                        <span className="dd-desc">{m.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="composer-right">
            <div className="seg">
              <button
                className="model-trigger"
                aria-label={`选择模型，当前 ${model.name}，推理等级 ${model.effort}`}
                aria-haspopup="menu"
                aria-expanded={modelOpen}
                onClick={() => setModelOpen((v) => !v)}
              >
                <span className="model-name">{model.name}</span>
                <span className="effort">{model.effort}</span>
                <span className={modelOpen ? 'chev open' : 'chev'}>
                  <IconChevronDown size={12} />
                </span>
              </button>
              {modelOpen && (
                <div className="dropdown" style={{ left: 'auto', right: 0 }}>
                  {MODELS.map((m, i) => (
                    <button key={i} className="dd-item" onClick={() => { onModelChange(m); setModelOpen(false) }}>
                      <span className="dd-name">{m.name}</span>
                      <span className="dd-desc">{m.effort}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ContextMeter />

            <button className="theme-trigger" aria-label="主题" title="切换主题" onClick={() => onThemeChange(theme === 'terminal' ? 'chat' : 'terminal')}>
              {theme === 'terminal' ? '☀' : '◐'}
            </button>

            <button className="send" aria-label="发送消息" onClick={submit} disabled={!text.trim()}>
              <IconSend size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
