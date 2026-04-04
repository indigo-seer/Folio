import { convertFileSrc, invoke } from '@tauri-apps/api/core'

import { isTauri } from './config'

const ATTACHMENT_IMAGE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tif', 'tiff', 'ico', 'heic', 'heif'
])
const RASTER_CACHE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'tif', 'tiff', 'ico', 'heic', 'heif'
])
const MAX_CONCURRENT_CACHE_JOBS = 1

let vaultRootPath: string | null = null
let activeVaultUid: string | null = null
const resolvedDisplayUrls = new Map<string, string>()
const inflightLookups = new Map<string, Promise<void>>()
const inflightGenerations = new Set<string>()
const pendingQueue: string[] = []
const queuedPaths = new Set<string>()
let activeWorkers = 0

type CacheUpdateListener = (absolutePath: string, displayUrl: string) => void
const listeners = new Set<CacheUpdateListener>()

function normalizePathSeparators(path: string): string {
    return path.replace(/\\/g, '/')
}

function isAbsolutePath(path: string): boolean {
    return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}

function toAbsolutePath(inputPath: string): string | null {
    const trimmed = String(inputPath || '').trim()
    if (!trimmed) return null

    if (isAbsolutePath(trimmed)) return trimmed
    if (trimmed.startsWith('attachments/') && vaultRootPath) {
        return `${vaultRootPath}/${trimmed}`
    }

    return null
}

function toDisplayUrl(filePath: string): string {
    return convertFileSrc(filePath)
}

function toRelativeAttachmentPath(inputPath: string): string | null {
    const normalizedPath = normalizePathSeparators(inputPath)
    if (normalizedPath.startsWith('attachments/')) {
        return normalizedPath
    }

    if (!vaultRootPath) return null
    const normalizedVaultRoot = normalizePathSeparators(vaultRootPath).replace(/\/+$/, '')
    const prefix = `${normalizedVaultRoot}/attachments/`
    if (!normalizedPath.startsWith(prefix)) return null
    return `attachments/${normalizedPath.slice(prefix.length)}`
}

function getPathExtension(path: string): string {
    const fileName = normalizePathSeparators(path).split('/').pop() || ''
    if (!fileName.includes('.')) return ''
    return fileName.split('.').pop()!.toLowerCase()
}

function canGenerateRasterCache(absolutePath: string): boolean {
    return RASTER_CACHE_EXTENSIONS.has(getPathExtension(absolutePath))
}

function notifyListeners(absolutePath: string, displayUrl: string) {
    for (const listener of listeners) {
        listener(absolutePath, displayUrl)
    }
}

async function resolveCachedPath(absolutePath: string): Promise<string | null> {
    const relativePath = toRelativeAttachmentPath(absolutePath)
    if (!relativePath || !activeVaultUid) return null

    try {
        const cachePath = await invoke<string | null>('get_cached_image', {
            sourcePath: absolutePath,
            vaultUid: activeVaultUid,
            relativePath,
        })
        return cachePath || null
    } catch (err) {
        console.warn('[Folium Image Cache] Failed to check cached image:', absolutePath, err)
        return null
    }
}

async function generateCachedPath(absolutePath: string): Promise<string | null> {
    const relativePath = toRelativeAttachmentPath(absolutePath)
    if (!relativePath || !activeVaultUid) return null

    try {
        const cachePath = await invoke<string>('generate_cached_image', {
            sourcePath: absolutePath,
            vaultUid: activeVaultUid,
            relativePath,
        })
        return cachePath || null
    } catch (err) {
        console.warn('[Folium Image Cache] Failed to generate cached image:', absolutePath, err)
        return null
    }
}

function rememberAndNotify(absolutePath: string, cachePath: string) {
    const displayUrl = toDisplayUrl(cachePath)
    resolvedDisplayUrls.set(absolutePath, displayUrl)
    notifyListeners(absolutePath, displayUrl)
}

async function lookupOrGenerateInBackground(absolutePath: string): Promise<void> {
    if (!isTauri()) return

    const cached = await resolveCachedPath(absolutePath)
    if (cached) {
        rememberAndNotify(absolutePath, cached)
        return
    }

    if (inflightGenerations.has(absolutePath)) return
    inflightGenerations.add(absolutePath)

    try {
        const generated = await generateCachedPath(absolutePath)
        if (generated) {
            rememberAndNotify(absolutePath, generated)
        }
    } finally {
        inflightGenerations.delete(absolutePath)
    }
}

function ensureLookupScheduled(absolutePath: string) {
    if (!isTauri()) return
    if (resolvedDisplayUrls.has(absolutePath)) return
    if (!canGenerateRasterCache(absolutePath)) return

    const existing = inflightLookups.get(absolutePath)
    if (existing) return

    if (queuedPaths.has(absolutePath)) return
    pendingQueue.push(absolutePath)
    queuedPaths.add(absolutePath)
    pumpQueue()
}

function pumpQueue() {
    while (activeWorkers < MAX_CONCURRENT_CACHE_JOBS && pendingQueue.length > 0) {
        const absolutePath = pendingQueue.shift()
        if (!absolutePath) break
        queuedPaths.delete(absolutePath)
        activeWorkers += 1

        const task = lookupOrGenerateInBackground(absolutePath)
            .catch((err) => {
                console.warn('[Folium Image Cache] Background lookup failed:', absolutePath, err)
            })
            .finally(() => {
                inflightLookups.delete(absolutePath)
                activeWorkers = Math.max(0, activeWorkers - 1)
                pumpQueue()
            })

        inflightLookups.set(absolutePath, task)
    }
}

export function setImageCacheVaultRoot(path: string | null) {
    vaultRootPath = path
}

export function setImageCacheVaultUid(vaultUid: string | null) {
    activeVaultUid = vaultUid || null
}

export function subscribeImageCacheUpdates(listener: CacheUpdateListener): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function getCachePathForImage(sourcePath: string): string {
    if (!isTauri()) return sourcePath

    const absolutePath = toAbsolutePath(sourcePath)
    if (!absolutePath) return sourcePath
    if (!activeVaultUid) return toDisplayUrl(absolutePath)

    const cachedDisplay = resolvedDisplayUrls.get(absolutePath)
    if (cachedDisplay) return cachedDisplay

    ensureLookupScheduled(absolutePath)
    return toDisplayUrl(absolutePath)
}

export async function warmCacheForNote(imagePaths: string[]): Promise<void> {
    if (!isTauri() || !activeVaultUid || imagePaths.length === 0) return

    const absolutePaths = new Set<string>()
    for (const path of imagePaths) {
        const absolutePath = toAbsolutePath(path)
        if (absolutePath) absolutePaths.add(absolutePath)
    }

    let index = 0
    for (const absolutePath of absolutePaths) {
        ensureLookupScheduled(absolutePath)

        // Keep migration/startup warm-up low priority to avoid blocking paint.
        if (index % 4 === 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
        }
        index += 1
    }
}

export function invalidateCacheEntry(sourcePath: string): void {
    const absolutePath = toAbsolutePath(sourcePath)
    if (!absolutePath) return

    resolvedDisplayUrls.delete(absolutePath)
    inflightLookups.delete(absolutePath)
    inflightGenerations.delete(absolutePath)
    queuedPaths.delete(absolutePath)
}

export async function sweepOrphanedCache(): Promise<void> {
    if (!isTauri()) return

    try {
        await invoke('sweep_orphaned_cache')
    } catch (err) {
        console.warn('[Folium Image Cache] Failed to sweep orphaned cache entries:', err)
    }
}

function extractFromStandardMarkdown(markdown: string, out: Set<string>) {
    const regex = /!\[[^\]]*\]\(([^)\n]+)\)/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(markdown)) !== null) {
        const destination = (match[1] || '').trim()
        if (!destination) continue

        const extracted = destination.startsWith('<')
            ? destination.slice(1, destination.indexOf('>') > 0 ? destination.indexOf('>') : undefined)
            : destination.split(/\s+/)[0]

        if (extracted.startsWith('attachments/')) out.add(extracted)
    }
}

function extractFromObsidianWiki(markdown: string, out: Set<string>) {
    const regex = /!\[\[([^\]|]+)(\|[^\]]+)?\]\]/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(markdown)) !== null) {
        const src = (match[1] || '').trim()
        if (!src.startsWith('attachments/')) continue
        out.add(src)
    }
}

function extractFromHtmlImages(markdown: string, out: Set<string>) {
    const regex = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi
    let match: RegExpExecArray | null

    while ((match = regex.exec(markdown)) !== null) {
        const src = (match[2] || '').trim()
        if (!src.startsWith('attachments/')) continue
        out.add(src)
    }
}

export function extractAttachmentImagePaths(markdown: string): string[] {
    const out = new Set<string>()
    extractFromStandardMarkdown(markdown, out)
    extractFromObsidianWiki(markdown, out)
    extractFromHtmlImages(markdown, out)
    return Array.from(out)
}

export function isAttachmentImagePath(path: string): boolean {
    const normalized = normalizePathSeparators(path)
    const index = normalized.toLowerCase().indexOf('/attachments/')
    if (index < 0) return false

    const fileName = normalized.split('/').pop() || ''
    const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
    return ATTACHMENT_IMAGE_EXTENSIONS.has(extension)
}
