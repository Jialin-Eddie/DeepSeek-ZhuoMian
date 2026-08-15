export type ThemeMode = 'terminal' | 'chat'

export type TabId = 'conversation' | 'goals' | 'subagents' | 'jobs' | 'workflow' | 'trajectory' | 'skills'

export interface TimelineItem {
  id: string
  prompt: string
  time: string
}

export interface ToolCallCard {
  tool: string
  title: string
  status: 'running' | 'done' | 'error'
  detail: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  tools?: ToolCallCard[]
  /** 官方 turnStatus：助手回合进行中（思考 shimmer） */
  thinking?: boolean
}

export interface SessionMeta {
  id: string
  title: string
  updatedAt: string
  messages: ChatMessage[]
}

export interface Workspace {
  id: string
  name: string
  path: string
  sessions: SessionMeta[]
}

/** 官方会话视图只有「对话 / 轨迹」两个标签（wSkVaW_tabs） */
export const TABS: { id: TabId; label: string }[] = [
  { id: 'conversation', label: '对话' },
  { id: 'trajectory', label: '轨迹' },
]

export const MOCK_WORKSPACES: Workspace[] = [
  {
    id: 'w1',
    name: 'deepseek harness',
    path: 'C:\\Users\\zhaoj\\projects',
    sessions: [
      {
        id: 's1',
        title: 'Refactor login module',
        updatedAt: '41m',
        messages: [
          {
            id: 'm1',
            role: 'user',
            text: 'Refactor the login module: extract JWT verification into middleware, add a token-refresh flow, and unify the error response format.',
          },
          {
            id: 'm2',
            role: 'assistant',
            text: 'Sure — let me inspect the current login module structure first, then propose a plan.',
            tools: [
              { tool: 'glob', title: 'Find login-related files', status: 'done', detail: '6 files' },
              { tool: 'read', title: 'Read auth.js', status: 'done', detail: '186 lines' },
            ],
          },
          { id: 'm3', role: 'user', text: 'Continue' },
          {
            id: 'm4',
            role: 'assistant',
            text: 'Refactor plan:\n\n1. Extract a `verifyJwt` middleware for unified validation\n2. Add a `/auth/refresh` endpoint for token renewal\n3. Normalize errors to `{ code, message }`\n\nPlan confirmed — executing in Auto mode.',
            thinking: true,
            tools: [
              { tool: 'edit', title: 'Apply verifyJwt middleware to auth routes', status: 'running', detail: '…' },
            ],
          },
        ],
      },
      {
        id: 's2',
        title: 'Debug API timeouts',
        updatedAt: 'Yesterday',
        messages: [
          { id: 'm1', role: 'user', text: 'Production API times out intermittently — help me find likely causes.' },
          { id: 'm2', role: 'assistant', text: 'Checking slow queries and connection-pool config…', tools: [{ tool: 'grep', title: 'Search pool config', status: 'done', detail: '3 matches' }] },
        ],
      },
      {
        id: 's3',
        title: 'Write a deploy script',
        updatedAt: 'Tue',
        messages: [{ id: 'm1', role: 'user', text: 'Write a one-click PowerShell deployment script for Windows.' }],
      },
    ],
  },
]
