import { invoke } from '@tauri-apps/api/core'

import { isTauri } from './config'

export interface BookmarkPreviewData {
    url: string
    title: string
    description: string
    imageUrl: string | null
    siteName: string
}

const previewCache = new Map<string, BookmarkPreviewData>()
const inflight = new Map<string, Promise<BookmarkPreviewData>>()

function toCacheKey(url: string): string {
    return String(url || '').trim().toLowerCase()
}

function fallbackPreview(url: string): BookmarkPreviewData {
    let siteName = url
    try {
        siteName = new URL(url).hostname.replace(/^www\./i, '')
    } catch {
        // Keep original URL fallback
    }

    return {
        url,
        title: siteName,
        description: '',
        imageUrl: null,
        siteName,
    }
}

export async function getBookmarkPreview(url: string): Promise<BookmarkPreviewData> {
    const key = toCacheKey(url)
    if (!key) return fallbackPreview(url)

    const cached = previewCache.get(key)
    if (cached) return cached

    const existing = inflight.get(key)
    if (existing) return existing

    const task = (async () => {
        if (!isTauri()) {
            const preview = fallbackPreview(url)
            previewCache.set(key, preview)
            return preview
        }

        try {
            const preview = await invoke<BookmarkPreviewData>('fetch_bookmark_preview', { url })
            const normalized = {
                ...preview,
                imageUrl: preview.imageUrl || null,
                title: String(preview.title || '').trim() || fallbackPreview(url).title,
                description: String(preview.description || '').trim(),
                siteName: String(preview.siteName || '').trim() || fallbackPreview(url).siteName,
                url: String(preview.url || '').trim() || url,
            }
            previewCache.set(key, normalized)
            return normalized
        } catch (error) {
            console.warn('[Folium Bookmark Preview] Failed to fetch metadata:', url, error)
            const preview = fallbackPreview(url)
            previewCache.set(key, preview)
            return preview
        } finally {
            inflight.delete(key)
        }
    })()

    inflight.set(key, task)
    return task
}
