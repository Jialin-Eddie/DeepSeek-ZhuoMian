/**
 * 参照对话收藏存储层（纯 Node 模块，不依赖 electron）。
 *
 * 参照栏（功能2）里收藏的句子存本机：~/.dsh/reference/<workspace>.json，
 * 按工作区一个文件；每条收藏 = { id, sessionId, sessionTitle, text, createdAt }。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { sanitizeKey } from './stashStore'

export interface ReferenceItem {
  id: string
  sessionId: string
  sessionTitle: string
  text: string
  createdAt: number
}

export interface ReferenceFile {
  workspacePath: string
  items: ReferenceItem[]
}

export const REFERENCES_MAX = 200

export function referencesFilePath(referenceDir: string, workspacePath: string): string {
  return path.join(referenceDir, `${sanitizeKey(workspacePath)}.json`)
}

export function loadReferences(referenceDir: string, workspacePath: string): ReferenceFile {
  const file = referencesFilePath(referenceDir, workspacePath)
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { workspacePath?: string; items?: ReferenceItem[] }
      if (Array.isArray(raw.items)) {
        return { workspacePath: raw.workspacePath ?? workspacePath, items: raw.items }
      }
    }
  } catch {
    /* 损坏文件按空处理，不抛 */
  }
  return { workspacePath, items: [] }
}

function writeAtomic(referenceDir: string, file: ReferenceFile): void {
  mkdirSync(referenceDir, { recursive: true })
  const target = referencesFilePath(referenceDir, file.workspacePath)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf8')
  renameSync(tmp, target)
}

/** 收藏一句；同会话+同文本去重（更新时间为最新） */
export function addReference(referenceDir: string, workspacePath: string, input: { sessionId: string; sessionTitle?: string; text: string }): ReferenceItem {
  const file = loadReferences(referenceDir, workspacePath)
  const now = Date.now()
  const text = String(input.text ?? '').trim()
  const sessionId = String(input.sessionId ?? '')
  const title = String(input.sessionTitle ?? '').trim()
  if (!text) throw new Error('收藏内容为空')
  const existing = file.items.find((i) => i.sessionId === sessionId && i.text === text)
  if (existing) {
    existing.createdAt = now
    if (title) existing.sessionTitle = title
    file.items = [existing, ...file.items.filter((i) => i !== existing)]
  } else {
    file.items.unshift({
      id: `r${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      sessionId,
      sessionTitle: title,
      text,
      createdAt: now,
    })
  }
  file.items = file.items.slice(0, REFERENCES_MAX)
  writeAtomic(referenceDir, file)
  return file.items[0]
}

/** 删除一条收藏；返回是否真的删掉了 */
export function deleteReference(referenceDir: string, workspacePath: string, id: string): boolean {
  const file = loadReferences(referenceDir, workspacePath)
  const before = file.items.length
  file.items = file.items.filter((i) => i.id !== id)
  if (file.items.length === before) return false
  writeAtomic(referenceDir, file)
  return true
}
