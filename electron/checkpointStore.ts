/**
 * /checkpoint 检查点存储层（纯 Node 模块，不依赖 electron）。
 *
 * 检查点 = 一个本地书签（会话 id + 事件 seq + 名字），
 * 供 /rewind 用 session.fork 在 atSeq 处开新分支时快速定位。
 * 每个工作区一个 JSON 文件，放在 ~/.dsh/checkpoints/ 下。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { sanitizeKey } from './stashStore'

export interface Checkpoint {
  id: string
  name: string
  sessionId: string
  atSeq: number
  preview: string
  createdAt: number
}

export interface CheckpointsFile {
  workspacePath: string
  items: Checkpoint[]
}

export const CHECKPOINTS_MAX = 50

export function checkpointsFilePath(checkpointsDir: string, workspacePath: string): string {
  return path.join(checkpointsDir, `${sanitizeKey(workspacePath)}.json`)
}

export function loadCheckpoints(checkpointsDir: string, workspacePath: string): CheckpointsFile {
  const file = checkpointsFilePath(checkpointsDir, workspacePath)
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as CheckpointsFile
      if (Array.isArray(raw.items)) {
        return { workspacePath: raw.workspacePath ?? workspacePath, items: raw.items }
      }
    }
  } catch {
    /* 损坏文件按空处理，不抛 */
  }
  return { workspacePath, items: [] }
}

/** 保存一个检查点；同名去重置顶；超上限丢最旧 */
export function saveCheckpoint(
  checkpointsDir: string,
  workspacePath: string,
  input: { name: string; sessionId: string; atSeq: number; preview?: string },
): Checkpoint {
  const file = loadCheckpoints(checkpointsDir, workspacePath)
  const now = Date.now()
  const name = input.name.trim() || '未命名'
  const existing = file.items.find((i) => i.sessionId === input.sessionId && i.atSeq === input.atSeq && i.name === name)
  if (existing) {
    existing.createdAt = now
    existing.preview = input.preview ?? existing.preview
    file.items = [existing, ...file.items.filter((i) => i !== existing)]
  } else {
    const item: Checkpoint = {
      id: `c${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      name,
      sessionId: input.sessionId,
      atSeq: input.atSeq,
      preview: input.preview ?? '',
      createdAt: now,
    }
    file.items = [item, ...file.items]
  }
  file.items = file.items.slice(0, CHECKPOINTS_MAX)
  mkdirSync(checkpointsDir, { recursive: true })
  const target = checkpointsFilePath(checkpointsDir, file.workspacePath)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf8')
  renameSync(tmp, target)
  return file.items[0]
}

/** 按 id 删除一个检查点；返回是否真的删掉了 */
export function deleteCheckpoint(checkpointsDir: string, workspacePath: string, id: string): boolean {
  const file = loadCheckpoints(checkpointsDir, workspacePath)
  const before = file.items.length
  file.items = file.items.filter((i) => i.id !== id)
  if (file.items.length === before) return false
  const target = checkpointsFilePath(checkpointsDir, file.workspacePath)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf8')
  renameSync(tmp, target)
  return true
}
