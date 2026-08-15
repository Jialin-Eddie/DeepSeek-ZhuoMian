import { TabId } from '../data'

const PANELS: Record<Exclude<TabId, 'conversation'>, { title: string; empty: string }> = {
  goals: { title: '目标', empty: '还没有目标。让 DeepSeek 创建一个。' },
  subagents: { title: '子代理', empty: '没有运行中的子代理。从对话中启动一个。' },
  jobs: { title: '任务', empty: '没有后台任务。长时间运行的任务会出现在这里。' },
  workflow: { title: '工作流', empty: '还没有工作流运行。' },
  trajectory: { title: '轨迹', empty: '选择一个会话查看其轨迹。' },
  skills: { title: '技能', empty: '没有加载技能。' },
}

export default function TabPanels({ tab }: { tab: Exclude<TabId, 'conversation'> }) {
  const p = PANELS[tab]
  return (
    <div className="panel">
      <h2 className="panel-title">{p.title}</h2>
      <div className="panel-empty">{p.empty}</div>
    </div>
  )
}
