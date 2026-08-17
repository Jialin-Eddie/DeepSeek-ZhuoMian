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
  const s = await resolveActiveSession(port)
  const cwd = s?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : null
}

/** 解析「当前活动会话」（与工作区同规则），失败返回 null */
export async function resolveActiveSessionId(port: number): Promise<string | null> {
  const s = await resolveActiveSession(port)
  return s?.sessionId ?? null
}

async function resolveActiveSession(port: number): Promise<EngineSession | null> {
  try {
    const items = await listSessions(port)
    if (items.length === 0) return null
    const running = items.filter((s) => s.running === true)
    const pool = running.length > 0 ? running : items
    const sorted = [...pool].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    return sorted[0] ?? null
  } catch {
    return null
  }
}

export interface HistoryTail {
  lastSeq: number | null
  lastPrompt: string
}

/**
 * 取会话历史尾部：最后事件 seq（供检查点定位）+ 最近一条用户提示词文本（作预览）。
 * 预览会分页往回找（最多 8 页 × 500 事件），长任务尾部全是工具事件时也能找到。
 * 失败返回 { lastSeq: null, lastPrompt: '' }。
 */
export async function historyTail(port: number, sessionId: string): Promise<HistoryTail> {
  try {
    let lastSeq: number | null = null
    let lastPrompt = ''
    let beforeSeq: number | undefined
    for (let page = 0; page < 8; page++) {
      const payload: Record<string, unknown> = { sessionId, maxMessages: 500 }
      if (beforeSeq !== undefined) payload.beforeSeq = beforeSeq
      const body = JSON.stringify({
        type: 'client-request',
        rpcId: 'cp-tail',
        method: 'session.history',
        params: {},
        payload,
      })
      const r = await fetch(`http://127.0.0.1:${port}/api/session.history`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) return { lastSeq, lastPrompt }
      const j = (await r.json()) as {
        result?: { value?: { events?: Array<{ event?: { seq?: number; type?: string; data?: unknown } }>; hasMore?: boolean } }
      }
      const evs = j?.result?.value?.events
      if (!Array.isArray(evs) || evs.length === 0) return { lastSeq, lastPrompt }
      for (const { event } of evs) {
        if (!event) continue
        if (typeof event.seq === 'number' && lastSeq === null) lastSeq = event.seq
        if (event.type === 'user/message' && !lastPrompt) {
          const txt = extractText(event.data)
          if (txt) lastPrompt = txt
        }
      }
      if (lastPrompt || !j?.result?.value?.hasMore) return { lastSeq, lastPrompt }
      beforeSeq = evs[0].event?.seq
    }
    return { lastSeq, lastPrompt }
  } catch {
    return { lastSeq: null, lastPrompt: '' }
  }
}

function extractText(data: unknown): string {
  if (data == null) return ''
  if (typeof data === 'string') return data
  if (typeof data === 'object' && 'text' in data && typeof (data as { text?: unknown }).text === 'string') {
    return (data as { text: string }).text
  }
  if (Array.isArray(data)) {
    return data
      .map((p) => (p && typeof p === 'object' && 'type' in p && (p as { type?: string }).type === 'text' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
      .join(' ')
      .trim()
  }
  return ''
}
