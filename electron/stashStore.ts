/**
 * 提示词便签（Ctrl+S）存储层。
 *
 * 纯 Node 模块（不依赖 electron），方便单独测试：
 * 每个工作区一个 JSON 文件，放在 ~/.dsh/stash/ 下，
 * 文件名由工作区路径（cwd）清理后生成。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import path from 'node:path'

export interface StashItem {
  id: string
  text: string
  savedAt: number
}

export interface StashFile {
  workspacePath: string
  items: StashItem[]
}

export const STASH_MAX_ITEMS = 50

/** 把工作区路径转成安全的文件基名（保留可读性，跨平台字符清理） */
export function sanitizeKey(workspacePath: string): string {
  const s = workspacePath
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
  return s.length > 0 ? s : 'default'
}

export function stashFilePath(stashDir: string, workspacePath: string): string {
  return path.join(stashDir, `${sanitizeKey(workspacePath)}.json`)
}

export function loadStash(stashDir: string, workspacePath: string): StashFile {
  const file = stashFilePath(stashDir, workspacePath)
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as StashFile
      if (Array.isArray(raw.items)) {
        return { workspacePath: raw.workspacePath ?? workspacePath, items: raw.items }
      }
    }
  } catch {
    /* 损坏文件按空处理，不抛 */
  }
  return { workspacePath, items: [] }
}

function writeStash(stashDir: string, file: StashFile): void {
  mkdirSync(stashDir, { recursive: true })
  const target = stashFilePath(stashDir, file.workspacePath)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf8')
  renameSync(tmp, target) // 原子替换，避免半写文件
}

/** 保存一条提示词；同文去重（置顶刷新时间），超上限丢最旧 */
export function savePrompt(
  stashDir: string,
  workspacePath: string,
  text: string,
): { item: StashItem; deduped: boolean } {
  const file = loadStash(stashDir, workspacePath)
  const trimmed = text.trim()
  if (!trimmed) throw new Error('stash: empty prompt')
  const now = Date.now()

  const existing = file.items.find((i) => i.text === trimmed)
  if (existing) {
    existing.savedAt = now
    file.items = [existing, ...file.items.filter((i) => i !== existing)]
    writeStash(stashDir, file)
    return { item: existing, deduped: true }
  }

  const item: StashItem = {
    id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    text: trimmed,
    savedAt: now,
  }
  file.items = [item, ...file.items].slice(0, STASH_MAX_ITEMS)
  writeStash(stashDir, file)
  return { item, deduped: false }
}

/** 按 id 删除一条；返回是否真的删掉了 */
export function deletePrompt(stashDir: string, workspacePath: string, id: string): boolean {
  const file = loadStash(stashDir, workspacePath)
  const before = file.items.length
  file.items = file.items.filter((i) => i.id !== id)
  if (file.items.length === before) return false
  writeStash(stashDir, file)
  return true
}

// ── /btw 旁注（独立于便签，按工作区一个文件） ──

export interface BtwNote {
  id: string
  text: string
  savedAt: number
}

export interface BtwNotesFile {
  workspacePath: string
  items: BtwNote[]
}

export function btwNotesPath(stashDir: string, workspacePath: string): string {
  return path.join(stashDir, `btw-${sanitizeKey(workspacePath)}.json`)
}

/** 追加一条 /btw 旁注（上限 100 条，超限丢最旧） */
export function appendBtwNote(stashDir: string, workspacePath: string, text: string): BtwNote {
  const file = btwNotesPath(stashDir, workspacePath)
  let notes: BtwNotesFile = { workspacePath, items: [] }
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as BtwNotesFile
      if (Array.isArray(raw.items)) notes = { workspacePath, items: raw.items }
    }
  } catch {
    /* 损坏按空处理 */
  }
  const now = Date.now()
  const note: BtwNote = {
    id: `b${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    text: text.trim(),
    savedAt: now,
  }
  notes.items = [note, ...notes.items].slice(0, 100)
  mkdirSync(stashDir, { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(notes, null, 2), 'utf8')
  renameSync(tmp, file)
  return note
}
