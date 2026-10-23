import { FileNode, fs } from './fs'
import { hashPath, isTauri, loadConfig, updateConfig } from './config'
import { getDocumentSession } from './documentSessions'
import {
    decodeFileUrlToPath,
    ingestImageSourceToAttachments,
    normalizeAttachmentProxySrc,
    shouldIngestImageSource,
    toVaultRelativeAttachmentPath,
} from './imageIngestion'
import { extractAttachmentImagePaths, warmCacheForNote } from './imageCache'

const IMAGE_INGESTION_MIGRATION_VERSION = 1
const activeMigrationRuns = new Set<string>()
type PendingBySource = Record<string, string[]>

function walkMarkdownFiles(nodes: FileNode[], out: string[]) {
    for (const node of nodes) {
        if (node.kind === 'file' && node.path.endsWith('.md')) {
            out.push(node.path)
            continue
        }
        if (node.kind === 'directory' && node.children) {
            walkMarkdownFiles(node.children, out)
        }
    }
}

async function ensureAttachmentFolder(vaultRootPath: string): Promise<void> {
    const { sep } = await import('@tauri-apps/api/path')
    const separator = await sep()
    const attachmentPath = `${vaultRootPath}${separator}attachments`
    const { exists, mkdir } = await import('@tauri-apps/plugin-fs')
    if (await exists(attachmentPath)) return
    await mkdir(attachmentPath, { recursive: true })
}

interface ResolveResult {
    replacement: string | null
    pending: boolean
}

type ReplacementResolver = (source: string) => Promise<ResolveResult>

async function replaceAllAsync(
    input: string,
    regex: RegExp,
    replacer: (match: RegExpExecArray) => Promise<string>
): Promise<{ output: string; changed: boolean }> {
    regex.lastIndex = 0
    let changed = false
    let cursor = 0
    let output = ''
    let match: RegExpExecArray | null

    while ((match = regex.exec(input)) !== null) {
        const original = match[0]
        const replacement = await replacer(match)
        output += input.slice(cursor, match.index) + replacement
        if (replacement !== original) changed = true
        cursor = match.index + original.length
        if (original.length === 0) {
            regex.lastIndex += 1
        }
    }

    if (cursor === 0) return { output: input, changed: false }
    output += input.slice(cursor)
    return { output, changed }
}

function isLikelyObsidianImagePath(src: string): boolean {
    const normalized = src.toLowerCase()
    return /\.(png|jpe?g|gif|webp|bmp|svg|avif|tiff?|ico|heic|heif)([#?].*)?$/.test(normalized)
}

function splitMarkdownImageDestination(destination: string): { source: string; suffix: string } {
    const trimmed = destination.trim()
    if (!trimmed) return { source: '', suffix: '' }

    if (trimmed.startsWith('<')) {
        const end = trimmed.indexOf('>')
        if (end > 0) {
            return {
                source: trimmed.slice(1, end),
                suffix: trimmed.slice(end + 1),
            }
        }
    }

    const wsIndex = trimmed.search(/\s/)
    if (wsIndex === -1) {
        return { source: trimmed, suffix: '' }
    }

    return {
        source: trimmed.slice(0, wsIndex),
        suffix: trimmed.slice(wsIndex),
    }
}

function buildMarkdownImageDestination(source: string, suffix: string): string {
    const wrapped = /\s/.test(source) ? `<${source}>` : source
    return `${wrapped}${suffix}`
}

async function migrateStandardMarkdownImages(markdown: string, resolveReplacement: ReplacementResolver): Promise<{ output: string; changed: boolean }> {
    return replaceAllAsync(markdown, /!\[([^\]]*)\]\(([^)\n]+)\)/g, async (match) => {
        const alt = match[1] || ''
        const destination = match[2] || ''
        const { source, suffix } = splitMarkdownImageDestination(destination)
        if (!source) return match[0]
        const result = await resolveReplacement(source)
        const replacement = result.replacement
        if (!replacement || replacement === source) return match[0]
        const newDestination = buildMarkdownImageDestination(replacement, suffix)
        return `![${alt}](${newDestination})`
    })
}

async function migrateObsidianImageLinks(markdown: string, resolveReplacement: ReplacementResolver): Promise<{ output: string; changed: boolean }> {
    return replaceAllAsync(markdown, /!\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, async (match) => {
        const source = (match[1] || '').trim()
        if (!source) return match[0]
        if (!isLikelyObsidianImagePath(source) && !shouldIngestImageSource(source)) {
            return match[0]
        }
        const suffix = match[2] || ''
        const result = await resolveReplacement(source)
        const replacement = result.replacement
        if (!replacement || replacement === source) return match[0]
        return `![[${replacement}${suffix}]]`
    })
}

async function migrateHtmlImageTags(markdown: string, resolveReplacement: ReplacementResolver): Promise<{ output: string; changed: boolean }> {
    return replaceAllAsync(markdown, /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi, async (match) => {
        const tag = match[0]
        const source = match[2] || ''
        if (!source) return tag
        const result = await resolveReplacement(source)
        const replacement = result.replacement
        if (!replacement || replacement === source) return tag
        return tag.replace(/(\bsrc\s*=\s*["'])([^"']*)(["'])/i, (_full, p1, _p2, p3) => `${p1}${replacement}${p3}`)
    })
}

export async function migrateNoteContent(markdown: string, resolveReplacement: ReplacementResolver): Promise<{ output: string; changed: boolean }> {
    if (!markdown.includes('![') && !markdown.includes('<img')) {
        return { output: markdown, changed: false }
    }

    const protectedSegments: string[] = []
    const protect = (segment: string) => {
        const token = `\uE000FOLIUM_CODE_${protectedSegments.length}\uE001`
        protectedSegments.push(segment)
        return token
    }
    let changed = false
    let current = markdown
        .replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm, protect)
        .replace(/(`+)([^\n]*?)\1/g, protect)

    const standard = await migrateStandardMarkdownImages(current, resolveReplacement)
    current = standard.output
    changed = changed || standard.changed

    const obsidian = await migrateObsidianImageLinks(current, resolveReplacement)
    current = obsidian.output
    changed = changed || obsidian.changed

    const htmlImages = await migrateHtmlImageTags(current, resolveReplacement)
    current = htmlImages.output
    changed = changed || htmlImages.changed

    current = current.replace(/\uE000FOLIUM_CODE_(\d+)\uE001/g, (_match, index) => protectedSegments[Number(index)] || '')
    return { output: current, changed }
}

function addPending(pending: Map<string, Set<string>>, source: string, notePath: string) {
    const existing = pending.get(source) || new Set<string>()
    existing.add(notePath)
    pending.set(source, existing)
}

function pendingMapToRecord(pending: Map<string, Set<string>>): PendingBySource {
    const out: PendingBySource = {}
    for (const [source, notePaths] of pending.entries()) {
        if (notePaths.size === 0) continue
        out[source] = Array.from(notePaths)
    }
    return out
}

async function migrateVaultImages(vaultPath: string): Promise<{ pending: PendingBySource; discoveredImages: string[]; complete: boolean }> {
    if (!fs.writeBinaryFile) {
        return { pending: {}, discoveredImages: [], complete: false }
    }

    await ensureAttachmentFolder(vaultPath)

    const tree = await fs.scanDirectory(vaultPath)
    const markdownPaths: string[] = []
    walkMarkdownFiles(tree, markdownPaths)

    const sourceCache = new Map<string, Promise<ResolveResult>>()
    const pendingBySource = new Map<string, Set<string>>()
    const discoveredImages = new Set<string>()

    const resolveReplacement = async (sourceRaw: string): Promise<ResolveResult> => {
        const source = sourceRaw.trim()
        if (!source) return { replacement: null, pending: false }

        const existingNormalized = normalizeAttachmentProxySrc(source)
        if (existingNormalized) return { replacement: existingNormalized, pending: false }

        const decodedFilePath = decodeFileUrlToPath(source)
        if (decodedFilePath) {
            const relative = toVaultRelativeAttachmentPath(decodedFilePath, vaultPath)
            if (relative) return { replacement: relative, pending: false }
        }

        if (!shouldIngestImageSource(source)) return { replacement: null, pending: false }

        const cached = sourceCache.get(source)
        if (cached) {
            return cached
        }

        const task = ingestImageSourceToAttachments(source, vaultPath, fs.writeBinaryFile!)
            .then((relativePath) => ({
                replacement: relativePath,
                pending: false,
            }))
            .catch((err): ResolveResult => {
                console.warn('[Folium Migration] Failed to ingest image source:', source, err)
                return {
                    replacement: null,
                    pending: true,
                }
            })

        sourceCache.set(source, task)
        return task
    }

    let migratedCount = 0
    let failedNotes = 0

    for (const markdownPath of markdownPaths) {
        try {
            if (getDocumentSession(markdownPath)?.dirty) {
                failedNotes += 1
                continue
            }
            const raw = await fs.readFile(markdownPath)
            const noteAwareResolver: ReplacementResolver = async (source) => {
                const result = await resolveReplacement(source)
                if (result.pending) {
                    addPending(pendingBySource, source, markdownPath)
                }
                return result
            }

            const { output, changed } = await migrateNoteContent(raw, noteAwareResolver)

            const imagePaths = extractAttachmentImagePaths(output)
            for (const imagePath of imagePaths) {
                discoveredImages.add(`${vaultPath}/${imagePath}`)
            }

            if (!changed || output === raw) continue
            const latest = await fs.readFile(markdownPath)
            if (latest !== raw) throw new Error('Note changed while image migration was running')
            await fs.writeFile(markdownPath, output)
            migratedCount += 1
        } catch (err) {
            failedNotes += 1
            console.warn('[Folium Migration] Failed to migrate note:', markdownPath, err)
        }
    }

    if (migratedCount > 0) {
        console.info(`[Folium Migration] Image source migration complete. Updated ${migratedCount} note(s).`)
    }

    return {
        pending: pendingMapToRecord(pendingBySource),
        discoveredImages: Array.from(discoveredImages),
        complete: failedNotes === 0,
    }
}

function normalizePending(input: PendingBySource | undefined): PendingBySource {
    const out: PendingBySource = {}
    if (!input) return out
    for (const [source, paths] of Object.entries(input)) {
        const cleaned = Array.from(new Set((paths || []).filter(Boolean)))
        if (cleaned.length > 0) out[source] = cleaned
    }
    return out
}

function mergePending(previous: PendingBySource, next: PendingBySource): PendingBySource {
    const merged: PendingBySource = { ...previous }
    for (const [source, notePaths] of Object.entries(next)) {
        const combined = new Set([...(merged[source] || []), ...notePaths])
        if (combined.size > 0) merged[source] = Array.from(combined)
    }
    return merged
}

async function retryPendingSources(vaultPath: string, pendingBySource: PendingBySource): Promise<PendingBySource> {
    if (!fs.writeBinaryFile) return pendingBySource

    const normalizedPending = normalizePending(pendingBySource)
    const pendingEntries = Object.entries(normalizedPending)
    if (pendingEntries.length === 0) return {}

    await ensureAttachmentFolder(vaultPath)

    const resolvedSources = new Map<string, string>()
    const stillPending: PendingBySource = {}

    for (const [source, notePaths] of pendingEntries) {
        try {
            const replacement = await ingestImageSourceToAttachments(source, vaultPath, fs.writeBinaryFile!)
            resolvedSources.set(source, replacement)
        } catch (err) {
            console.warn('[Folium Migration] Retry still failing for source:', source, err)
            stillPending[source] = Array.from(new Set(notePaths))
        }
    }

    if (resolvedSources.size === 0) {
        return stillPending
    }

    const notePathsToUpdate = new Set<string>()
    for (const [source] of resolvedSources.entries()) {
        for (const notePath of normalizedPending[source] || []) {
            notePathsToUpdate.add(notePath)
        }
    }

    for (const notePath of notePathsToUpdate) {
        try {
            if (getDocumentSession(notePath)?.dirty) throw new Error('Note has unsaved edits')
            const raw = await fs.readFile(notePath)
            const { output, changed } = await migrateNoteContent(raw, async (source): Promise<ResolveResult> => {
                const replacement = resolvedSources.get(source)
                if (!replacement) {
                    return { replacement: null, pending: false }
                }
                return {
                    replacement,
                    pending: false,
                }
            })

            if (changed && output !== raw) {
                const latest = await fs.readFile(notePath)
                if (latest !== raw) throw new Error('Note changed while image migration retry was running')
                await fs.writeFile(notePath, output)
            }
        } catch (err) {
            console.warn('[Folium Migration] Failed to update note during retry:', notePath, err)
            for (const [source] of resolvedSources.entries()) {
                if ((normalizedPending[source] || []).includes(notePath)) {
                    const current = new Set(stillPending[source] || [])
                    current.add(notePath)
                    stillPending[source] = Array.from(current)
                }
            }
        }
    }

    return normalizePending(stillPending)
}

export async function runVaultImageMigrationInBackground(vaultPath: string, workspaceId?: string): Promise<void> {
    if (!isTauri()) return

    const resolvedWorkspaceId = workspaceId || await hashPath(vaultPath)
    if (activeMigrationRuns.has(resolvedWorkspaceId)) return
    activeMigrationRuns.add(resolvedWorkspaceId)

    try {
        const config = await loadConfig()
        const currentVersion = config.migrations.imageIngestionByWorkspace[resolvedWorkspaceId] || 0
        const pendingForWorkspace = normalizePending(config.migrations.imageIngestionPendingByWorkspace[resolvedWorkspaceId])

        if (currentVersion < IMAGE_INGESTION_MIGRATION_VERSION) {
            const migrationResult = await migrateVaultImages(vaultPath)

            await updateConfig(latestConfig => {
                const existingPending = normalizePending(latestConfig.migrations.imageIngestionPendingByWorkspace[resolvedWorkspaceId])
                if (migrationResult.complete) {
                    latestConfig.migrations.imageIngestionByWorkspace[resolvedWorkspaceId] = IMAGE_INGESTION_MIGRATION_VERSION
                }
                latestConfig.migrations.imageIngestionPendingByWorkspace[resolvedWorkspaceId] = mergePending(existingPending, migrationResult.pending)
            })
            void warmCacheForNote(migrationResult.discoveredImages)
            return
        }

        if (Object.keys(pendingForWorkspace).length === 0) return

        const updatedPending = await retryPendingSources(vaultPath, pendingForWorkspace)
        await updateConfig(latestConfig => {
            latestConfig.migrations.imageIngestionPendingByWorkspace[resolvedWorkspaceId] = updatedPending
        })
    } catch (err) {
        console.warn('[Folium Migration] Startup image migration failed:', err)
    } finally {
        activeMigrationRuns.delete(resolvedWorkspaceId)
    }
}
