/**
 * Command registry — additive only (never remove DSH originals).
 *
 * - `dsh` group = DeepSeek Harness native commands. At runtime the full host
 *   list is fetched via `remote.commands.list()`; these known entries are a
 *   fallback and are never trimmed.
 * - `extra` group = our additions (Claude Code / Codex-inspired).
 */

export interface CommandDef {
  name: string
  label: string
  description: string
  group: 'dsh' | 'extra'
}

export const COMMANDS: CommandDef[] = [
  // ---- DeepSeek Harness native (keep all) ----
  { name: 'compact', label: '/compact', description: '压缩对话以回收上下文', group: 'dsh' },
  { name: 'plan', label: '/plan', description: '进入计划模式（执行前先审阅）', group: 'dsh' },
  { name: 'goal', label: '/goal', description: '创建 / 查看目标', group: 'dsh' },
  { name: 'feedback', label: '/feedback', description: '发送反馈和评分', group: 'dsh' },
  { name: 'help', label: '/help', description: '查看帮助', group: 'dsh' },
  { name: 'resume', label: '/resume', description: '恢复之前的会话', group: 'dsh' },
  { name: 'status', label: '/status', description: '查看会话状态', group: 'dsh' },
  { name: 'permissions', label: '/permissions', description: '查看 / 管理权限', group: 'dsh' },
  { name: 'init', label: '/init', description: '初始化工作区', group: 'dsh' },
  { name: 'memory', label: '/memory', description: '查看 / 编辑记忆', group: 'dsh' },
  { name: 'export', label: '/export', description: '导出对话', group: 'dsh' },
  { name: 'cost', label: '/cost', description: '查看费用统计', group: 'dsh' },

  // ---- Our additions (Claude Code / Codex-inspired) ----
  { name: 'clear', label: '/clear', description: '清空当前对话', group: 'extra' },
  { name: 'model', label: '/model', description: '切换模型', group: 'extra' },
  { name: 'mcp', label: '/mcp', description: '配置 MCP 工具服务器', group: 'extra' },
  { name: 'agents', label: '/agents', description: '管理子代理', group: 'extra' },
  { name: 'rewind', label: '/rewind', description: '回退到之前的检查点', group: 'extra' },
  { name: 'btw', label: '/btw', description: '添加旁注，不打断当前任务', group: 'extra' },
]
