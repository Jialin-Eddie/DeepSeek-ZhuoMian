import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import TimelineRail from './components/TimelineRail'
import Composer, { MODES, MODELS } from './components/Composer'
import DetailsPanel from './components/DetailsPanel'
import ApiKeyModal from './components/ApiKeyModal'
import TabPanels from './components/TabPanels'
import TrajectoryPanel from './components/TrajectoryPanel'
import { HeroFish } from './components/official-icons.generated'
import { PresetIcon, JobsDot, LogIcon, GoalGlyph } from './components/official-header-icons.generated'
import { IconFolder, IconDots, IconPlus, IconChevronDown } from './components/icons'
import { COMMANDS } from './commands'
import { ChatMessage, MOCK_WORKSPACES, TABS, TabId, TimelineItem, Workspace } from './data'

const USER_PROMPTS = new Set<string>(['user'])

export default function App() {
  const [theme, setTheme] = useState<'terminal' | 'chat'>('terminal')
  const [mode, setMode] = useState<string>('workspace')
  const [model, setModel] = useState({ name: 'DeepSeek-V4-Pro', effort: 'High' })
  const [showModal, setShowModal] = useState(true)
  const [workspaces, setWorkspaces] = useState<Workspace[]>(MOCK_WORKSPACES)
  const [activeWsId, setActiveWsId] = useState<string>(MOCK_WORKSPACES[0].id)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(MOCK_WORKSPACES[0].sessions[0].id)
  const [activeTab, setActiveTab] = useState<TabId>('conversation')
  const [collapsed, setCollapsed] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  /** 已提交的提示词历史（↑/↓ 翻阅），跨 hero / 底部 composer 共享 */
  const [promptHistory, setPromptHistory] = useState<string[]>([])
  /** goal dock（官方 nLMEza GoalBar）：有目标时显示在 composer 上方 */
  const [goal] = useState<string | null>('还原 DeepSeek Harness 官方 UI（桌面端）')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const activeWs = workspaces.find((w) => w.id === activeWsId) ?? workspaces[0]
  const activeSession = activeWs.sessions.find((s) => s.id === activeSessionId) ?? null
  const hasMessages = (activeSession?.messages.length ?? 0) > 0

  const timeline: TimelineItem[] = useMemo(
    () =>
      (activeSession?.messages ?? [])
        .filter((m) => USER_PROMPTS.has(m.role))
        .map((m) => ({ id: m.id, prompt: m.text, time: '--:--' })),
    [activeSession],
  )

  const handleJump = (id: string) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** 向当前会话追加一条消息（user 或 assistant） */
  const appendMessage = (partial: Omit<ChatMessage, 'id'>) => {
    if (!activeSession) return
    const id = `m${Date.now()}`
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id !== activeWs.id
          ? w
          : {
              ...w,
              sessions: w.sessions.map((s) =>
                s.id === activeSession.id
                  ? { ...s, updatedAt: '刚刚', messages: [...s.messages, { id, ...partial }] }
                  : s,
              ),
            },
      ),
    )
  }

  const handleSend = (text: string) => {
    if (!text.trim() || !activeSession) return
    // 记录历史（去重 + 上限 50 条）
    setPromptHistory((prev) => [...prev.filter((x) => x !== text), text].slice(-50))
    appendMessage({ role: 'user', text })
  }

  const MODE_ALIASES: Record<string, string> = {
    auto: 'auto', 自动: 'auto',
    plan: 'plan', 计划: 'plan',
    readonly: 'readonly', read: 'readonly', 只读: 'readonly',
    workspace: 'workspace', 标准: 'workspace', 标准模式: 'workspace',
    full: 'full', 完全访问: 'full', 无限制: 'full',
  }

  const helpText = (): string => {
    const lines: string[] = ['可用命令：', '']
    for (const g of ['dsh', 'extra'] as const) {
      lines.push(g === 'dsh' ? 'DeepSeek Harness 原生：' : '演示版附加：')
      for (const c of COMMANDS.filter((x) => x.group === g)) lines.push(`- ${c.label} — ${c.description}`)
      lines.push('')
    }
    lines.push('提示：输入 `/` 弹出命令菜单；↑/↓ 翻阅历史提示词；「自动」模式下文件编辑会被自动接受。')
    return lines.join('\n')
  }

  /** 处理斜杠命令：返回 true 表示已消费（不作为普通消息发送） */
  const handleSlash = (raw: string): boolean => {
    const trimmed = raw.trim()
    if (!trimmed.startsWith('/')) return false
    const [head, ...rest] = trimmed.slice(1).split(/\s+/)
    const name = head.toLowerCase()
    const args = rest.join(' ').trim()
    const cmd = COMMANDS.find((c) => c.name === name)

    if (!cmd) {
      appendMessage({ role: 'assistant', text: `未知命令 \`/${head}\`。输入 \`/help\` 查看可用命令。` })
      return true
    }

    switch (name) {
      case 'help':
        appendMessage({ role: 'assistant', text: helpText() })
        break
      case 'clear':
        setWorkspaces((prev) =>
          prev.map((w) =>
            w.id !== activeWs.id || !activeSession
              ? w
              : {
                  ...w,
                  sessions: w.sessions.map((s) => (s.id === activeSession.id ? { ...s, messages: [], updatedAt: '刚刚' } : s)),
                },
          ),
        )
        break
      case 'new':
        handleNewSession()
        break
      case 'theme':
        setTheme((t) => (t === 'terminal' ? 'chat' : 'terminal'))
        appendMessage({ role: 'assistant', text: '已切换主题。' })
        break
      case 'plan':
        setMode('plan')
        appendMessage({ role: 'assistant', text: '已进入计划模式：只读规划，确认后执行。' })
        break
      case 'model': {
        const a = args.toLowerCase()
        if (!a) {
          const i = MODELS.findIndex((m) => m.name === model.name && m.effort === model.effort)
          const next = MODELS[(i + 1) % MODELS.length]
          setModel(next)
          appendMessage({ role: 'assistant', text: `已切换到 ${next.name}（${next.effort}）。` })
        } else if (['high', 'medium', 'low'].includes(a)) {
          const effort = a[0].toUpperCase() + a.slice(1)
          setModel((m) => ({ ...m, effort }))
          appendMessage({ role: 'assistant', text: `推理等级已设为 ${effort}。` })
        } else {
          const m = MODELS.find((x) => x.name.toLowerCase().includes(a))
          if (m) {
            setModel(m)
            appendMessage({ role: 'assistant', text: `已切换到 ${m.name}（${m.effort}）。` })
          } else {
            appendMessage({ role: 'assistant', text: `未找到模型「${args}」。可用：/model 循环切换，或 /model deepseek-v3、/model low。` })
          }
        }
        break
      }
      case 'mode': {
        const target = MODE_ALIASES[args.toLowerCase()] ?? args.toLowerCase()
        const m = MODES.find((x) => x.value === target)
        if (m) {
          setMode(m.value)
          appendMessage({ role: 'assistant', text: `已切换为「${m.label}」：${m.hint}` })
        } else {
          appendMessage({ role: 'assistant', text: `未知模式「${args}」。可用：auto / plan / readonly / workspace / full（或 自动 / 计划 / 只读 / 标准 / 完全访问）。` })
        }
        break
      }
      case 'btw': {
        const note = args
        if (!note) {
          appendMessage({ role: 'assistant', text: '用法：`/btw <旁注内容>`。旁注只记录、不打断当前任务。' })
          break
        }
        appendMessage({ role: 'assistant', text: `📌 已记录旁注（未发送给模型）：${note}` })
        break
      }
      case 'rewind': {
        // 演示版回退：撤销最后一轮（从尾部删到并包含最近一条用户消息）
        if (!activeSession || activeSession.messages.length === 0) {
          appendMessage({ role: 'assistant', text: '当前会话没有可回退的内容。' })
          break
        }
        const msgs = activeSession.messages
        let cut = msgs.length
        for (let i = msgs.length - 1; i >= 0; i--) {
          cut = i
          if (msgs[i].role === 'user') break
        }
        setWorkspaces((prev) =>
          prev.map((w) =>
            w.id !== activeWs.id || !activeSession
              ? w
              : {
                  ...w,
                  sessions: w.sessions.map((s) => (s.id === activeSession.id ? { ...s, messages: msgs.slice(0, cut) } : s)),
                },
          ),
        )
        appendMessage({ role: 'assistant', text: '已回退到上一个用户回合之前（演示版回退的是会话内容，非引擎 checkpoint）。' })
        break
      }
      default:
        // 演示版没有真实引擎：其余命令给出诚实的占位回复
        appendMessage({ role: 'assistant', text: `\`/${name}\` 已收到。演示版暂未接入真实引擎，此命令不会实际执行。` })
    }
    return true
  }

  const handleNewSession = () => {
    const id = `s${Date.now()}`
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id !== activeWs.id
          ? w
          : { ...w, sessions: [{ id, title: '新会话', updatedAt: '刚刚', messages: [] }, ...w.sessions] },
      ),
    )
    setActiveSessionId(id)
    setActiveTab('conversation')
  }

  const handleAddWorkspace = async () => {
    const path = await window.dshDesktop?.pickFolder?.()
    if (!path) return
    const name = path.split(/[\\/]/).filter(Boolean).pop() ?? '未命名'
    const ws: Workspace = { id: `w${Date.now()}`, name, path, sessions: [] }
    setWorkspaces((prev) => [...prev, ws])
    setActiveWsId(ws.id)
    setActiveSessionId(null)
  }

  const modeLabel = MODES.find((m) => m.value === mode)?.label ?? '标准模式'

  const composer = (
    <Composer
      mode={mode}
      onModeChange={setMode}
      model={model}
      onModelChange={setModel}
      theme={theme}
      onThemeChange={setTheme}
      onSend={handleSend}
      onSlash={handleSlash}
      history={promptHistory}
    />
  )

  const heroComposer = (
    <Composer
      mode={mode}
      onModeChange={setMode}
      model={model}
      onModelChange={setModel}
      theme={theme}
      onThemeChange={setTheme}
      onSend={handleSend}
      onSlash={handleSlash}
      history={promptHistory}
      hero
    />
  )

  const hero = (
    <div className="scroll-body scroll-body-hero">
      <div className="hero">
        <div className="hero-stack">
          <div className="hero-glow" aria-hidden="true">
            <svg viewBox="0 0 1051 468" fill="none" aria-hidden="true">
              <defs>
                <filter id="hero-glow-blur" x="0" y="0" width="1051" height="468" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                  <feGaussianBlur stdDeviation="50" result="effect1_foregroundBlur" />
                </filter>
              </defs>
              <g filter="url(#hero-glow-blur)">
                <ellipse cx="525.5" cy="234" rx="425.5" ry="134" fill="#6187D8" fillOpacity="0.08" />
              </g>
            </svg>
          </div>

          <div className="hero-headline">
            <span className="hero-fish">
              <HeroFish />
            </span>
            <span className="hero-text">探索未至之境</span>
            <span className="hero-badge">预览版</span>
          </div>

          <div className="hero-body">
            <div className="hero-workspace-row">
              <button className="hero-ws-btn" aria-label="选择工作区" aria-haspopup="menu" aria-expanded="false">
                <IconFolder size={16} />
                <span className="hero-ws-label">{activeWs.name}</span>
                <IconChevronDown size={12} className="hero-ws-chevron" />
              </button>
              <div className="seg">
                <button className="icon-btn" aria-label="更多操作">
                  <IconDots size={16} />
                </button>
              </div>
              <div className="seg">
                <button className="icon-btn" aria-label="新建会话" onClick={handleNewSession}>
                  <IconPlus size={16} />
                </button>
              </div>
            </div>

            {heroComposer}
          </div>
        </div>
      </div>
    </div>
  )

  const composerSeat = (
    <div className="composer-seat">
      <div className="composer-stack">
        {goal && (
          <div className="goal-dock" data-goal-bar="true">
            <div className="goal-bar">
              <span className="goal-glyph"><GoalGlyph /></span>
              <span className="goal-label">进行中的目标</span>
              <span className="goal-objective">{goal}</span>
            </div>
          </div>
        )}
        {composer}
      </div>
    </div>
  )

  return (
    <div className="frame" data-details-collapsed={!detailsOpen ? 'true' : undefined} data-sidebar-collapsed={collapsed ? 'true' : undefined}>
      <Sidebar
        collapsed={collapsed}
        workspaces={workspaces}
        activeWsId={activeWsId}
        activeSessionId={activeSessionId}
        onSelectWorkspace={(id) => {
          setActiveWsId(id)
          setActiveSessionId(workspaces.find((w) => w.id === id)?.sessions[0]?.id ?? null)
        }}
        onSelectSession={setActiveSessionId}
        onNewSession={handleNewSession}
        onAddWorkspace={handleAddWorkspace}
        onToggle={() => setCollapsed((c) => !c)}
      />

      <main className="center">
        <div className={hasMessages ? 'center-header' : 'center-header center-header-hidden'}>
          <div className="title-row">
            <div className="title-crumbs">
              <nav className="crumbs" aria-label="会话层级">
                <span className="crumb-seg">
                  <button className="crumb" onClick={() => setActiveTab('conversation')}>{activeWs.name}</button>
                  <span className="crumb-sep">/</span>
                </span>
                <button className="crumb crumb-current">{activeSession?.title ?? '新会话'}</button>
              </nav>
            </div>
            <div className="header-actions-row">
              <span className="preset-chip" title={`访问模式：${modeLabel}`}>
                <PresetIcon />
                <span>{modeLabel}</span>
              </span>
              <button className="count-trigger" aria-label="0 个子代理" aria-haspopup="menu">
                <span className="count">0</span>
                <span>个子代理</span>
                <IconChevronDown size={12} />
              </button>
              <button className="count-trigger" aria-label="0 个后台任务运行中" aria-haspopup="menu">
                <JobsDot />
                <span className="count">0</span>
                <span>个后台任务运行中</span>
                <IconChevronDown size={12} />
              </button>
            </div>
            <div className="header-utilities">
              <button className="session-log-btn" aria-label="导出会话日志">
                <LogIcon />
                <span>Session log</span>
              </button>
            </div>
          </div>
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={activeTab === t.id ? 'tab tab-active' : 'tab'}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'conversation' ? (
          hasMessages && activeSession ? (
            <div className="scroll-body">
              <div className="center-body">
                <ChatView session={activeSession} mode={mode} />
                <TimelineRail items={timeline} onJump={handleJump} />
              </div>
              {composerSeat}
            </div>
          ) : (
            hero
          )
        ) : activeTab === 'trajectory' && hasMessages && activeSession ? (
          <div className="scroll-body">
            <TrajectoryPanel session={activeSession} />
            {composerSeat}
          </div>
        ) : (
          <TabPanels tab={activeTab as Exclude<TabId, 'conversation'>} />
        )}
      </main>

      {detailsOpen && <DetailsPanel onClose={() => setDetailsOpen(false)} />}

      {showModal && <ApiKeyModal onLater={() => setShowModal(false)} onSave={() => setShowModal(false)} />}
    </div>
  )
}
