/**
 * 引擎 RPC 小工具（不依赖 electron，可单独测试）。
 *
 * 当前工作区解析：通过引擎的 HTTP API 拿 session.list，
 * 取「running 且 updatedAt 最新」的会话的 cwd —— 服务端状态，
 * 不需要读页面 DOM。
 */

export interface EngineSession {
  sessionId: string
  updatedAt: number
  running?: boolean
  blank?: boolean
  cwd?: string
  agentPreset?: string
}

export async function listSessions(port: number): Promise<EngineSession[]> {
  const body = JSON.stringify({
    type: 'client-request',
    rpcId: 'stash-ws',
    method: 'session.list',
    params: {},
    payload: {},
  })
  const r = await fetch(`http://127.0.0.1:${port}/api/session.list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(4000),
  })
  if (!r.ok) return []
  const j = (await r.json()) as { result?: { value?: { items?: EngineSession[] } } }
  const items = j?.result?.value?.items
  return Array.isArray(items) ? items : []
}

/**
 * 解析「当前工作区」路径：
 * 1. running:true 的会话（可能多个窗口/标签），取 updatedAt 最新者
 * 2. 没有 running 的会话时，取全量 updatedAt 最新者
 * 3. 失败返回 null（调用方回退 'default'）
 */
export async function resolveActiveWorkspace(port: number): Promise<string | null> {
  try {
    const items = await listSessions(port)
    if (items.length === 0) return null
    const running = items.filter((s) => s.running === true)
    const pool = running.length > 0 ? running : items
    const sorted = [...pool].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    const cwd = sorted[0]?.cwd
    return typeof cwd === 'string' && cwd.length > 0 ? cwd : null
  } catch {
    return null
  }
}
