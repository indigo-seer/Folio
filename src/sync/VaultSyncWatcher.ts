import * as Y from 'yjs'
import { isTauri } from '../lib/config'
import { fs } from '../lib/fs'
import { atomicWriteBinary, atomicWriteText } from './atomicWrite'

function basename(filePath: string): string {
    const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
    return idx >= 0 ? filePath.slice(idx + 1) : filePath
}

function yjsToMarkdownPath(yjsPath: string): string {
    return yjsPath.endsWith('.yjs') ? `${yjsPath.slice(0, -4)}.md` : `${yjsPath}.md`
}

function conflictBaseYjsPath(path: string): string | null {
    const marker = '.sync-conflict-'
    const idx = path.indexOf(marker)
    if (idx === -1) return null
    const base = path.slice(0, idx)
    return base.endsWith('.yjs') ? base : null
}

function isVaultSyncInternal(path: string): boolean {
    return path.includes('/.vault-sync/') || path.includes('\\.vault-sync\\')
}

function simpleHash(bytes: Uint8Array): string {
    let hash = 2166136261
    for (const b of bytes) {
        hash ^= b
        hash = Math.imul(hash, 16777619)
    }
    return `${bytes.byteLength}:${hash >>> 0}`
}

function decodeYjsContent(bytes: Uint8Array): string {
    const doc = new Y.Doc()
    Y.applyUpdateV2(doc, bytes)
    return doc.getText('content').toString()
}

async function appendMergeLog(vaultPath: string, payload: Record<string, unknown>): Promise<void> {
    if (!isTauri()) return

    const { exists, mkdir, readTextFile } = await import('@tauri-apps/plugin-fs')
    const { join } = await import('@tauri-apps/api/path')

    const compactionDir = await join(vaultPath, '.vault-sync', 'compaction')
    if (!(await exists(compactionDir))) {
        await mkdir(compactionDir, { recursive: true })
    }

    const mergeLogPath = await join(compactionDir, 'merge_log.jsonl')
    const line = `${JSON.stringify(payload)}\n`
    let current = ''
    if (await exists(mergeLogPath)) {
        current = await readTextFile(mergeLogPath).catch(() => '')
    }
    await atomicWriteText(mergeLogPath, `${current}${line}`)
}

async function listFilesRecursively(root: string): Promise<string[]> {
    if (!isTauri()) return []
    const { readDir } = await import('@tauri-apps/plugin-fs')
    const { join } = await import('@tauri-apps/api/path')

    const allFiles: string[] = []

    async function walk(dirPath: string): Promise<void> {
        const entries = await readDir(dirPath).catch(() => [])
        for (const entry of entries) {
            const name = entry.name || ''
            if (!name) continue
            const fullPath = await join(dirPath, name)
            if ((entry as any).isDirectory) {
                await walk(fullPath)
                continue
            }
            if ((entry as any).isFile) {
                allFiles.push(fullPath)
            }
        }
    }

    await walk(root)
    return allFiles
}

export interface VaultSyncWatcherOptions {
    onNoteUpdated?: (notePath: string) => void
}

export class VaultSyncWatcher {
    private pollTimer: ReturnType<typeof setInterval> | null = null
    private running = false
    private vaultPath: string | null = null
    private yjsHashes = new Map<string, string>()
    private options: VaultSyncWatcherOptions = {}

    async start(vaultPath: string, options: VaultSyncWatcherOptions = {}): Promise<void> {
        this.stop()
        if (!isTauri()) return

        this.vaultPath = vaultPath
        this.options = options
        this.pollTimer = setInterval(() => {
            void this.poll()
        }, 2000)

        await this.poll()
    }

    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer)
            this.pollTimer = null
        }
        this.vaultPath = null
        this.yjsHashes.clear()
        this.running = false
    }

    private async poll(): Promise<void> {
        if (this.running || !this.vaultPath || !fs.readBinaryFile) return
        this.running = true

        try {
            const files = await listFilesRecursively(this.vaultPath)
            const conflictFiles = files.filter(f => {
                const name = basename(f)
                return name.includes('.sync-conflict-') && name.includes('.yjs')
            })
            const yjsFiles = files.filter(f => f.endsWith('.yjs') && !isVaultSyncInternal(f))

            for (const conflictPath of conflictFiles) {
                await this.handleConflictFile(conflictPath)
            }

            for (const yjsPath of yjsFiles) {
                await this.syncYjsToMarkdownIfChanged(yjsPath)
            }
        } finally {
            this.running = false
        }
    }

    private async syncYjsToMarkdownIfChanged(yjsPath: string): Promise<void> {
        if (!fs.readBinaryFile) return

        const bytes = await fs.readBinaryFile(yjsPath).catch(() => null)
        if (!bytes) return

        const hash = simpleHash(bytes)
        if (this.yjsHashes.get(yjsPath) === hash) return

        const markdown = decodeYjsContent(bytes)
        const markdownPath = yjsToMarkdownPath(yjsPath)
        const current = await fs.readFile(markdownPath).catch(() => '')
        if (current !== markdown) {
            await atomicWriteText(markdownPath, markdown)
        }

        this.yjsHashes.set(yjsPath, hash)
        this.options.onNoteUpdated?.(markdownPath)
    }

    private async handleConflictFile(conflictPath: string): Promise<void> {
        if (!this.vaultPath || !fs.readBinaryFile) return
        if (!isTauri()) return

        const baseYjsPath = conflictBaseYjsPath(conflictPath)
        if (!baseYjsPath) return

        const currentBytes = await fs.readBinaryFile(baseYjsPath).catch(() => null)
        const conflictBytes = await fs.readBinaryFile(conflictPath).catch(() => null)
        if (!currentBytes || !conflictBytes) return

        const merged = Y.mergeUpdates([currentBytes, conflictBytes])
        const currentText = decodeYjsContent(currentBytes)
        const conflictText = decodeYjsContent(conflictBytes)
        const mergedText = decodeYjsContent(merged)

        const sanity =
            merged.byteLength > 0 &&
            mergedText.length >= Math.max(currentText.length, conflictText.length) &&
            !mergedText.includes('\u0000')

        const { remove, exists, mkdir } = await import('@tauri-apps/plugin-fs')
        const { join } = await import('@tauri-apps/api/path')

        if (sanity) {
            await atomicWriteBinary(baseYjsPath, merged)
            await atomicWriteText(yjsToMarkdownPath(baseYjsPath), mergedText)
            await remove(conflictPath).catch(() => {})
            await appendMergeLog(this.vaultPath, {
                ts: new Date().toISOString(),
                file: baseYjsPath,
                outcome: 'auto_merged',
            })
            this.yjsHashes.set(baseYjsPath, simpleHash(merged))
            this.options.onNoteUpdated?.(yjsToMarkdownPath(baseYjsPath))
            return
        }

        const conflictsDir = await join(this.vaultPath, '.vault-sync', 'conflicts')
        if (!(await exists(conflictsDir))) {
            await mkdir(conflictsDir, { recursive: true })
        }
        const target = await join(conflictsDir, `${basename(conflictPath)}-${Date.now()}`)
        await atomicWriteBinary(target, conflictBytes)
        await remove(conflictPath).catch(() => {})
        await appendMergeLog(this.vaultPath, {
            ts: new Date().toISOString(),
            file: baseYjsPath,
            outcome: 'failed_sanity',
        })
    }
}
