import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import TimelineRail from './components/TimelineRail'
import Composer from './components/Composer'
import DetailsPanel from './components/DetailsPanel'
import ApiKeyModal from './components/ApiKeyModal'
import TabPanels from './components/TabPanels'
import TrajectoryPanel from './components/TrajectoryPanel'
import { HeroFish } from './components/official-icons.generated'
import { PresetIcon, JobsDot, LogIcon, GoalGlyph } from './components/official-header-icons.generated'
import { IconFolder, IconDots, IconPlus, IconChevronDown } from './components/icons'
import { MOCK_WORKSPACES, TABS, TabId, TimelineItem, Workspace } from './data'

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
  /** goal dock（官方 nLMEza GoalBar）：有目标时显示在 composer 上方 */
  const [goal, setGoal] = useState<string | null>('还原 DeepSeek Harness 官方 UI（桌面端）')

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

  const handleSend = (text: string) => {
    if (!text.trim() || !activeSession) return
    const id = `m${Date.now()}`
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id !== activeWs.id
          ? w
          : {
              ...w,
              sessions: w.sessions.map((s) =>
                s.id === activeSession.id
                  ? { ...s, updatedAt: '刚刚', messages: [...s.messages, { id, role: 'user' as const, text }] }
                  : s,
              ),
            },
      ),
    )
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

  const composer = (
    <Composer
      mode={mode}
      onModeChange={setMode}
      model={model}
      onModelChange={setModel}
      theme={theme}
      onThemeChange={setTheme}
      onSend={handleSend}
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
              <span className="preset-chip" title="标准模式">
                <PresetIcon />
                <span>标准模式</span>
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
                <ChatView session={activeSession} />
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
