export interface IngestedImage {
    bytes: Uint8Array
    extension: string
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

function normalizePathSeparators(path: string): string {
    return path.replace(/\\/g, '/')
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
        const response = await fetch(src)
        if (!response.ok && !src.startsWith('data:') && !src.startsWith('blob:')) {
            throw new Error(`Failed to fetch image source: ${response.status} ${response.statusText}`)
        }
        const blob = await response.blob()
        const bytes = new Uint8Array(await blob.arrayBuffer())
        return {
            bytes,
            extension: resolveImageExtension(blob.type || '', src),
        }
    }

    const decodedFilePath = decodeFileUrlToPath(src)
    const localPath = decodedFilePath || src
    const parentPath = getParentDirectory(localPath)

    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('grant_vault_scope', { path: parentPath })
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const bytes = await readFile(localPath)

    return {
        bytes,
        extension: resolveImageExtension('', localPath),
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
    return `attachments/${name}`
}
