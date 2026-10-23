import { invoke } from '@tauri-apps/api/core'

import { isTauri } from './config'
import { getOrCreateVaultUid } from './vaultIdentity'
import { normalizePathSeparators } from './constants'

export interface IngestedImage {
    bytes: Uint8Array
    extension: string
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tif', 'tiff', 'ico', 'heic', 'heif'])

async function readBoundedResponse(response: Response): Promise<Uint8Array> {
    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 25 MB import limit')
    if (!response.body) {
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 25 MB import limit')
        return bytes
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            length += value.length
            if (length > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 25 MB import limit')
            chunks.push(value)
        }
    } finally {
        reader.releaseLock()
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
    }
    return bytes
}

function validateImageBytes(bytes: Uint8Array, extension: string): void {
    if (bytes.length === 0) throw new Error('Image is empty')
    const ext = extension.toLowerCase()
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) throw new Error(`Unsupported image type: ${ext}`)
    const ascii = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase()
    const valid =
        (ext === 'png' && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
        ((ext === 'jpg' || ext === 'jpeg') && bytes[0] === 0xff && bytes[1] === 0xd8) ||
        (ext === 'gif' && ascii.startsWith('gif8')) ||
        (ext === 'webp' && ascii.startsWith('riff') && ascii.slice(8, 12) === 'webp') ||
        (ext === 'bmp' && ascii.startsWith('bm')) ||
        (ext === 'svg' && (ascii.startsWith('<svg') || (ascii.startsWith('<?xml') && ascii.includes('<svg')))) ||
        ((ext === 'tif' || ext === 'tiff') && ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d))) ||
        (ext === 'ico' && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) ||
        ((ext === 'avif' || ext === 'heic' || ext === 'heif') && ascii.includes('ftyp'))
    if (!valid) throw new Error(`File contents do not match the expected ${ext} image format`)
}

export function normalizeAttachmentProxySrc(src: string): string | null {
    if (!src) return null
    if (src.startsWith('attachments/')) return src

    try {
        const decodedSrc = decodeURIComponent(src)
        if (
            (decodedSrc.startsWith('http://') || decodedSrc.startsWith('https://') || decodedSrc.startsWith('asset://') || decodedSrc.startsWith('tauri://')) &&
            decodedSrc.includes('localhost') &&
            decodedSrc.includes('/attachments/')
        ) {
            const parts = decodedSrc.split('/attachments/')
            return 'attachments/' + parts[parts.length - 1]
        }
    } catch {
        return null
    }

    return null
}

export function decodeFileUrlToPath(src: string): string | null {
    if (!src.startsWith('file://')) return null
    try {
        const url = new URL(src)
        if (url.protocol !== 'file:') return null

        let pathname = decodeURIComponent(url.pathname || '')
        if (/^\/[A-Za-z]:/.test(pathname)) {
            pathname = pathname.slice(1)
        }

        if (url.host && !/^([A-Za-z]:|\/)/.test(pathname)) {
            pathname = `//${url.host}${pathname}`
        }

        return pathname
    } catch {
        return null
    }
}

export function getFileNameFromPath(path: string): string {
    const parts = path.split(/[\\/]/).filter(Boolean)
    return parts[parts.length - 1] || ''
}

function getFileExtensionFromPath(path: string): string | null {
    const filename = getFileNameFromPath(path)
    const match = filename.match(/\.([a-zA-Z0-9]+)$/)
    return match ? match[1].toLowerCase() : null
}

function extensionFromMime(mimeType: string): string | null {
    const normalized = mimeType.toLowerCase().trim()
    if (!normalized.startsWith('image/')) return null
    const subtype = normalized.split('/')[1] || ''
    if (!subtype) return null
    if (subtype === 'jpeg') return 'jpg'
    if (subtype.includes('svg')) return 'svg'
    return subtype.replace(/[^a-z0-9]/g, '') || null
}

function resolveImageExtension(mimeType: string, sourceHint: string): string {
    return extensionFromMime(mimeType)
        || getFileExtensionFromPath(sourceHint)
        || 'png'
}

export function getParentDirectory(path: string): string {
    const trimmed = path.replace(/[\\/]+$/, '')
    const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
    if (idx < 0) return trimmed
    if (idx === 0) return trimmed.startsWith('/') ? '/' : trimmed
    return trimmed.slice(0, idx)
}



export function isVaultAttachmentAbsolutePath(src: string, vaultRoot: string): boolean {
    const normalizedSrc = normalizePathSeparators(src)
    const normalizedVaultRoot = normalizePathSeparators(vaultRoot)
    return normalizedSrc.startsWith(`${normalizedVaultRoot}/attachments/`)
}

export function toVaultRelativeAttachmentPath(src: string, vaultRoot: string): string | null {
    if (!isVaultAttachmentAbsolutePath(src, vaultRoot)) return null
    const normalizedSrc = normalizePathSeparators(src)
    const normalizedVaultRoot = normalizePathSeparators(vaultRoot)
    const relative = normalizedSrc.slice(normalizedVaultRoot.length + 1)
    return relative.startsWith('attachments/') ? relative : `attachments/${relative}`
}

export function shouldIngestImageSource(src: string): boolean {
    if (!src) return false
    if (src.startsWith('attachments/')) return false
    if (src.startsWith('data:') || src.startsWith('blob:')) return true
    if (src.startsWith('http://') || src.startsWith('https://')) return true
    if (src.startsWith('file://')) return true
    if (/^[A-Za-z]:[\\/]/.test(src)) return true
    if (src.startsWith('/')) return true
    return false
}

export async function readImageSource(src: string): Promise<IngestedImage> {
    if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) {
        const response = await fetch(src, { signal: AbortSignal.timeout(10_000), credentials: 'omit', referrerPolicy: 'no-referrer' })
        if (!response.ok && !src.startsWith('data:') && !src.startsWith('blob:')) {
            throw new Error(`Failed to fetch image source: ${response.status} ${response.statusText}`)
        }
        const contentType = response.headers.get('content-type') || ''
        if (contentType && !contentType.toLowerCase().startsWith('image/')) {
            throw new Error(`Remote source is not an image (${contentType})`)
        }
        const extension = resolveImageExtension(contentType, src)
        const bytes = await readBoundedResponse(response)
        validateImageBytes(bytes, extension)
        return {
            bytes,
            extension,
        }
    }

    const decodedFilePath = decodeFileUrlToPath(src)
    const localPath = decodedFilePath || src
    const { invoke } = await import('@tauri-apps/api/core')
    const approvedPath = await invoke<string>('grant_import_file_scope', { path: localPath })
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const bytes = await readFile(approvedPath)
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 25 MB import limit')
    const extension = resolveImageExtension('', approvedPath)
    validateImageBytes(bytes, extension)

    return {
        bytes,
        extension,
    }
}

export async function ingestImageSourceToAttachments(
    source: string,
    vaultRootPath: string,
    writeBinaryFile: (path: string, content: Uint8Array) => Promise<void>
): Promise<string> {
    const { bytes, extension } = await readImageSource(source)
    const safeExtension = extension || 'png'
    const name = `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${safeExtension}`
    const { sep } = await import('@tauri-apps/api/path')
    const separator = await sep()
    const absolutePath = `${vaultRootPath}${separator}attachments${separator}${name}`
    await writeBinaryFile(absolutePath, bytes)
    const relativePath = `attachments/${name}`

    if (isTauri()) {
        try {
            const vaultUid = await getOrCreateVaultUid(vaultRootPath)
            await invoke('generate_cached_image', {
                sourcePath: absolutePath,
                vaultUid,
                relativePath,
            })
        } catch (err) {
            console.warn('[Folium Image Cache] Failed to warm cache after ingestion:', absolutePath, err)
        }
    }

    return relativePath
}
