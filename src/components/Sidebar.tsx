import { useState } from 'react'
import { Workspace } from '../data'
import { BrandMark } from './official-icons.generated'
import {
  IconNewSession,
  IconSearch,
  IconDots,
  IconFolder,
  IconFolderPlus,
  IconPlus,
  IconArrowRight,
  IconRail,
} from './icons'

interface Props {
  collapsed: boolean
  workspaces: Workspace[]
  activeWsId: string
  activeSessionId: string | null
  onSelectWorkspace: (id: string) => void
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onAddWorkspace: () => void
  onToggle: () => void
}

export default function Sidebar({
  collapsed,
  workspaces,
  activeWsId,
  activeSessionId,
  onSelectWorkspace,
  onSelectSession,
  onNewSession,
  onAddWorkspace,
  onToggle,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false)

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed" aria-label="侧边栏">
        <button className="icon-btn" aria-label="展开侧边栏" onClick={onToggle}>
          <IconRail size={16} />
        </button>
        <button className="icon-btn" aria-label="新建会话" onClick={onNewSession}>
          <IconNewSession size={16} />
        </button>
      </aside>
    )
  }

  return (
    <aside className="sidebar" aria-label="侧边栏">
      <div className="sidebar-logo">
        <button className="brand" aria-label="新建会话" onClick={onNewSession}>
          <span className="brand-logo">
            <BrandMark />
          </span>
        </button>
        <button className="icon-btn" aria-label="收起侧边栏" onClick={onToggle}>
          <IconRail size={16} />
        </button>
      </div>

      <button className="new-session" onClick={onNewSession}>
        <IconNewSession size={14} />
        <span className="new-session-label">新会话</span>
      </button>

      <div className="region">
        <div className="section-header">
          <span className="section-label">工作区</span>
          <div className={searchOpen ? 'search-slot expanded' : 'search-slot'}>
            <div className={searchOpen ? 'search expanded' : 'search'}>
              <button
                className="search-btn"
                aria-label="搜索会话"
                aria-expanded={searchOpen}
                onClick={() => setSearchOpen((v) => !v)}
              >
                <IconSearch size={14} />
              </button>
              <input
                className="search-input"
                placeholder="搜索会话"
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setSearchOpen(false)}
              />
            </div>
          </div>
          <div className="header-actions">
            <button className="icon-btn" aria-label="视图选项">
              <IconDots size={16} />
            </button>
            <button className="icon-btn" aria-label="添加工作区" title="添加工作区（打开文件夹）" onClick={onAddWorkspace}>
              <IconFolderPlus size={16} />
            </button>
          </div>
        </div>

        <div className="tree" role="tree" aria-label="会话">
          {workspaces.map((ws) => (
            <div key={ws.id}>
              <div
                className="tree-folder"
                role="treeitem"
                aria-expanded={ws.id === activeWsId}
                onClick={() => onSelectWorkspace(ws.id)}
              >
                <span className="tree-slot">
                  <span className="tree-arrow open" aria-hidden="true">
                    <IconArrowRight size={14} />
                  </span>
                  <span className="tree-chevron">
                    <IconArrowRight size={14} />
                  </span>
                </span>
                <span className="tree-slot tree-slot-folder">
                  <IconFolder size={16} className={ws.id === activeWsId ? 'folder-active' : ''} />
                </span>
                <span className="tree-title">{ws.name}</span>
                <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="row-icon-btn" aria-label={`工作区"${ws.name}"的操作`}>
                    <IconDots size={16} />
                  </button>
                  <button
                    className="row-icon-btn"
                    aria-label={`在"${ws.name}"中新建会话`}
                    onClick={onNewSession}
                  >
                    <IconPlus size={16} />
                  </button>
                </span>
              </div>
              {ws.id === activeWsId &&
                ws.sessions.map((s) => (
                  <div
                    key={s.id}
                    className={s.id === activeSessionId ? 'tree-item active' : 'tree-item'}
                    role="treeitem"
                    onClick={() => onSelectSession(s.id)}
                  >
                    <span className="tree-slot" aria-hidden="true" />
                    <span className="tree-title">{s.title}</span>
                    <span className="tree-time">{s.updatedAt}</span>
                    <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="row-icon-btn" aria-label={`会话"${s.title}"的操作`}>
                        <IconDots size={16} />
                      </button>
                    </span>
                  </div>
                ))}
            </div>
          ))}
          <div className="tree-fade" aria-hidden="true" />
        </div>
      </div>

      <div className="sidebar-footer">
        <button className="settings-btn" aria-label="设置">
          <IconDots size={16} />
          <span className="settings-label">设置</span>
        </button>
      </div>
    </aside>
  )
}
