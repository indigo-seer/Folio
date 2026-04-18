import { NodeViewWrapper } from '@tiptap/react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { ExternalLink, FileAudio, FileSymlink, FileText, Link2, Paperclip } from 'lucide-react'
import { useContext, useEffect, useMemo, useState } from 'react'

import { VaultContext } from '../contexts/VaultContext'
import { getBookmarkPreview, type BookmarkPreviewData } from '../lib/bookmarkPreview'
import { isTauri } from '../lib/config'
import { normalizePathSeparators } from '../lib/constants'

function findNotePath(tree: any[], noteName: string): string | null {
    for (const node of tree) {
        if (node.kind === 'file' && node.name === `${noteName}.md`) {
            return node.path
        }
        if (node.kind === 'directory' && node.children) {
            const found = findNotePath(node.children, noteName)
            if (found) return found
        }
    }
    return null
}

function toPreviewText(markdown: string): string {
    const normalized = markdown.replace(/\r/g, '')
    const withoutFrontmatter = normalized.replace(/^---\n[\s\S]*?\n---\n?/, '')
    const lines = withoutFrontmatter
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.trim().length > 0)
        .slice(0, 8)

    return lines.join('\n').trim()
}

const AUDIO_EXTENSIONS = new Set([
    'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus', 'weba'
])

function getEmbedTargetExtension(target: string): string {
    const clean = String(target || '').split('|')[0].trim().split('?')[0].split('#')[0]
    const dot = clean.lastIndexOf('.')
    if (dot === -1) return ''
    return clean.slice(dot + 1).toLowerCase()
}

function isExternalUrl(target: string): boolean {
    const trimmed = String(target || '').trim().toLowerCase()
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('www.')
}

function toExternalUrl(target: string): string {
    const trimmed = String(target || '').trim()
    if (trimmed.toLowerCase().startsWith('www.')) return `https://${trimmed}`
    return trimmed
}

function isAbsolutePath(path: string): boolean {
    const normalized = normalizePathSeparators(path)
    return normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)
}

function findAttachmentPath(tree: any[], target: string, vaultRootPath: string | null): string | null {
    const rawTarget = String(target || '').split('|')[0].trim()
    const normalizedTarget = normalizePathSeparators(rawTarget).replace(/^\.?\//, '').trim()
    if (!normalizedTarget) return null
    const normalizedTargetLower = normalizedTarget.toLowerCase()
    const basename = normalizedTarget.split('/').pop() || normalizedTarget
    const basenameLower = basename.toLowerCase()

    if (isAbsolutePath(rawTarget)) {
        return rawTarget
    }

    if (vaultRootPath) {
        const normalizedRoot = normalizePathSeparators(vaultRootPath).replace(/\/+$/, '')
        if (normalizedTargetLower.startsWith('attachments/')) {
            return `${normalizedRoot}/${normalizedTarget}`
        }
    }

    let exactOrRelativeMatch: string | null = null
    let attachmentsBasenameMatch: string | null = null
    let basenameMatch: string | null = null

    const stack = [...tree]
    while (stack.length > 0) {
        const current = stack.pop()
        if (!current) continue

        if (current.kind === 'directory') {
            if (current.children?.length) stack.push(...current.children)
            continue
        }

        const path = normalizePathSeparators(String(current.path || ''))
        const pathLower = path.toLowerCase()
        const nameLower = String(current.name || '').toLowerCase()

        if (pathLower === normalizedTargetLower || pathLower.endsWith(`/${normalizedTargetLower}`)) {
            exactOrRelativeMatch = current.path
            break
        }

        if (nameLower === basenameLower) {
            if (!basenameMatch) basenameMatch = current.path
            if (!attachmentsBasenameMatch && pathLower.includes('/attachments/')) {
                attachmentsBasenameMatch = current.path
            }
        }
    }

    return exactOrRelativeMatch || attachmentsBasenameMatch || basenameMatch
}

function toEmbedFileUrl(path: string | null): string | null {
    if (!path) return null
    if (!isTauri()) return path
    return convertFileSrc(path)
}

function openExternalBookmarkUrl(url: string) {
    const targetUrl = String(url || '').trim()
    if (!targetUrl) return

    if (isTauri()) {
        void invoke('open_external_url', { url: targetUrl }).catch((error) => {
            console.error('Failed to open bookmark URL via Tauri command:', targetUrl, error)
        })
        return
    }

    window.open(targetUrl, '_blank', 'noopener,noreferrer')
}

function openEmbeddedFile(url: string | null) {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
}

export default function EmbedNodeView(props: any) {
    const { node } = props
    const noteName = String(node.attrs.noteName || '')
    const anchor = String(node.attrs.anchor || '')
    const { vault, fileSystem, onWikilinkClick } = useContext(VaultContext)

    const notePath = useMemo(() => findNotePath(vault.tree, noteName), [vault.tree, noteName])
    const fullTarget = `${noteName}${anchor}`.trim()
    const targetWithoutSize = fullTarget.split('|')[0].trim()
    const extension = getEmbedTargetExtension(targetWithoutSize)
    const isPdfEmbed = extension === 'pdf'
    const isAudioEmbed = AUDIO_EXTENSIONS.has(extension)
    const isMediaEmbed = isPdfEmbed || isAudioEmbed
    const isUrlEmbed = isExternalUrl(targetWithoutSize)
    const isAttachmentFileEmbed = targetWithoutSize.toLowerCase().startsWith('attachments/')
    const isGenericFileEmbed = isAttachmentFileEmbed && !isMediaEmbed

    const embedMode: 'note' | 'bookmark' | 'pdf' | 'audio' | 'file' = isPdfEmbed
        ? 'pdf'
        : isAudioEmbed
            ? 'audio'
            : isUrlEmbed
                ? 'bookmark'
                : isGenericFileEmbed
                    ? 'file'
                    : 'note'

    const bookmarkUrl = useMemo(() => {
        if (embedMode !== 'bookmark') return ''
        return toExternalUrl(targetWithoutSize)
    }, [embedMode, targetWithoutSize])

    const localMediaPath = useMemo(() => {
        if (!isMediaEmbed || isUrlEmbed) return null
        return findAttachmentPath(vault.tree, targetWithoutSize, vault.rootPath)
    }, [isMediaEmbed, isUrlEmbed, targetWithoutSize, vault.tree, vault.rootPath])

    const mediaUrl = useMemo(() => {
        if (!isMediaEmbed) return null
        if (isUrlEmbed) return toExternalUrl(targetWithoutSize)
        return toEmbedFileUrl(localMediaPath)
    }, [isMediaEmbed, isUrlEmbed, targetWithoutSize, localMediaPath])

    const genericFilePath = useMemo(() => {
        if (embedMode !== 'file') return null
        return findAttachmentPath(vault.tree, targetWithoutSize, vault.rootPath)
    }, [embedMode, targetWithoutSize, vault.tree, vault.rootPath])

    const genericFileUrl = useMemo(() => {
        if (embedMode !== 'file') return null
        return toEmbedFileUrl(genericFilePath)
    }, [embedMode, genericFilePath])

    const genericFileName = useMemo(() => {
        if (embedMode !== 'file') return targetWithoutSize
        const normalized = normalizePathSeparators(targetWithoutSize)
        return normalized.split('/').pop() || normalized
    }, [embedMode, targetWithoutSize])

    const bookmarkHost = useMemo(() => {
        if (!bookmarkUrl) return ''
        try {
            return new URL(bookmarkUrl).hostname.replace(/^www\./i, '')
        } catch {
            return bookmarkUrl
        }
    }, [bookmarkUrl])

    const [previewText, setPreviewText] = useState('')
    const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

    const [bookmarkStatus, setBookmarkStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [bookmarkPreview, setBookmarkPreview] = useState<BookmarkPreviewData | null>(null)

    useEffect(() => {
        let isCancelled = false

        const loadPreview = async () => {
            if (embedMode !== 'note') {
                setStatus('ready')
                setPreviewText('')
                return
            }

            if (!noteName || !notePath) {
                setStatus('missing')
                setPreviewText('')
                return
            }

            setStatus('loading')

            try {
                const raw = await fileSystem.readFile(notePath)
                if (isCancelled) return
                const preview = toPreviewText(raw)
                setPreviewText(preview)
                setStatus('ready')
            } catch (error) {
                if (isCancelled) return
                console.error('Failed to load embed preview:', error)
                setStatus('error')
                setPreviewText('')
            }
        }

        loadPreview()
        return () => {
            isCancelled = true
        }
    }, [embedMode, fileSystem, noteName, notePath])

    useEffect(() => {
        let isCancelled = false

        const loadBookmarkPreview = async () => {
            if (embedMode !== 'bookmark' || !bookmarkUrl) {
                setBookmarkStatus('loading')
                setBookmarkPreview(null)
                return
            }

            setBookmarkStatus('loading')
            try {
                const preview = await getBookmarkPreview(bookmarkUrl)
                if (isCancelled) return
                setBookmarkPreview(preview)
                setBookmarkStatus('ready')
            } catch (error) {
                if (isCancelled) return
                console.error('Failed to load bookmark metadata:', error)
                setBookmarkPreview(null)
                setBookmarkStatus('error')
            }
        }

        loadBookmarkPreview()
        return () => {
            isCancelled = true
        }
    }, [bookmarkUrl, embedMode])

    return (
        <NodeViewWrapper
            className="my-4 border border-folium-border dark:border-folium-dark-border rounded-lg bg-folium-bg-secondary/30 overflow-hidden"
            data-type="embed"
            data-note-name={noteName}
            data-anchor={anchor}
            contentEditable={false}
        >
            <div
                className="w-full text-left flex items-center gap-2 px-3 py-2 bg-folium-bg-secondary/50 border-b border-folium-border dark:border-folium-dark-border hover:bg-folium-bg-secondary/70 dark:hover:bg-folium-dark-bg-secondary/60 transition-colors"
                onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                }}
                onClick={() => {
                    if (embedMode === 'bookmark' && bookmarkUrl) {
                        openExternalBookmarkUrl(bookmarkPreview?.url || bookmarkUrl)
                        return
                    }

                    if (embedMode === 'note' && noteName) {
                        onWikilinkClick(noteName, anchor || null)
                    }
                }}
                title={
                    embedMode === 'bookmark'
                        ? (bookmarkUrl || 'Open link')
                        : noteName
                            ? `Open ${noteName}${anchor}`
                            : 'Open note'
                }
            >
                {embedMode === 'bookmark' && <Link2 size={16} className="text-folium-accent dark:text-folium-dark-accent" />}
                {embedMode === 'pdf' && <FileText size={16} className="text-folium-accent dark:text-folium-dark-accent" />}
                {embedMode === 'audio' && <FileAudio size={16} className="text-folium-accent dark:text-folium-dark-accent" />}
                {embedMode === 'file' && <Paperclip size={16} className="text-folium-accent dark:text-folium-dark-accent" />}
                {embedMode === 'note' && <FileSymlink size={16} className="text-folium-accent dark:text-folium-dark-accent" />}
                <span className="font-semibold text-sm opacity-80">
                    {embedMode === 'bookmark'
                        ? bookmarkHost
                        : embedMode === 'file'
                            ? genericFileName
                            : `${noteName}${anchor}`}
                </span>
                <span className="text-xs opacity-50 ml-auto uppercase tracking-wider">
                    {embedMode === 'bookmark' ? 'Bookmark' : 'Embed'}
                </span>
            </div>
            <div className="p-4 text-sm opacity-80 whitespace-pre-wrap leading-relaxed" contentEditable={false}>
                {embedMode === 'bookmark' && (
                    <>
                        {bookmarkStatus === 'loading' && (
                            <div className="rounded-md border border-folium-border dark:border-folium-dark-border bg-folium-bg dark:bg-folium-dark-bg p-3 animate-pulse">
                                <div className="h-4 w-2/3 bg-folium-bg-secondary dark:bg-folium-dark-bg-secondary rounded" />
                                <div className="h-3 w-full mt-2 bg-folium-bg-secondary dark:bg-folium-dark-bg-secondary rounded" />
                                <div className="h-3 w-4/5 mt-1 bg-folium-bg-secondary dark:bg-folium-dark-bg-secondary rounded" />
                            </div>
                        )}

                        {bookmarkStatus === 'error' && (
                            <span className="opacity-55 italic">Could not load bookmark metadata.</span>
                        )}

                        {bookmarkStatus === 'ready' && (
                            <div
                                className="group rounded-md border border-folium-border dark:border-folium-dark-border bg-folium-bg dark:bg-folium-dark-bg p-3 hover:border-folium-accent/50 transition-colors cursor-pointer"
                                onMouseDown={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                }}
                                onClick={() => {
                                    if (bookmarkUrl) {
                                        openExternalBookmarkUrl(bookmarkPreview?.url || bookmarkUrl)
                                    }
                                }}
                                title={bookmarkUrl}
                            >
                                <div className="flex gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-folium-text dark:text-folium-dark-text break-words">
                                            {bookmarkPreview?.title || bookmarkUrl}
                                        </div>
                                        {bookmarkPreview?.description && (
                                            <div className="mt-1 text-xs opacity-80 break-words">
                                                {bookmarkPreview.description}
                                            </div>
                                        )}
                                        <div className="mt-2 text-xs opacity-65 flex items-center gap-1 break-all">
                                            <ExternalLink size={12} />
                                            {bookmarkPreview?.siteName || bookmarkHost}
                                        </div>
                                    </div>
                                    {bookmarkPreview?.imageUrl && (
                                        <img
                                            src={bookmarkPreview.imageUrl}
                                            alt={bookmarkPreview.title || bookmarkHost}
                                            className="w-28 h-20 rounded object-cover border border-folium-border dark:border-folium-dark-border flex-shrink-0"
                                            loading="lazy"
                                            onError={(event) => {
                                                const target = event.currentTarget
                                                target.style.display = 'none'
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {embedMode === 'pdf' && (
                    <>
                        {!mediaUrl && (
                            <span className="opacity-55 italic">Could not locate this PDF in the vault.</span>
                        )}
                        {mediaUrl && (
                            <iframe
                                src={mediaUrl}
                                title={`PDF embed: ${targetWithoutSize}`}
                                className="w-full h-[420px] rounded-md border border-folium-border dark:border-folium-dark-border bg-folium-bg dark:bg-folium-dark-bg"
                            />
                        )}
                    </>
                )}

                {embedMode === 'audio' && (
                    <>
                        {!mediaUrl && (
                            <span className="opacity-55 italic">Could not locate this audio file in the vault.</span>
                        )}
                        {mediaUrl && (
                            <audio
                                controls
                                preload="metadata"
                                src={mediaUrl}
                                className="w-full"
                            />
                        )}
                    </>
                )}

                {embedMode === 'file' && (
                    <>
                        <div className="rounded-md border border-folium-border dark:border-folium-dark-border bg-folium-bg dark:bg-folium-dark-bg p-3">
                            <div className="font-medium">{genericFileName}</div>
                            <div className="mt-1 text-xs opacity-70 break-all">{targetWithoutSize}</div>
                            {genericFileUrl && (
                                <button
                                    type="button"
                                    className="mt-3 text-sm px-3 py-1.5 rounded-md border border-folium-border dark:border-folium-dark-border hover:bg-folium-bg-secondary dark:hover:bg-folium-dark-bg-secondary transition-colors"
                                    onMouseDown={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                    }}
                                    onClick={() => openEmbeddedFile(genericFileUrl)}
                                >
                                    Open file
                                </button>
                            )}
                        </div>
                    </>
                )}

                {embedMode === 'note' && (
                    <>
                        {status === 'loading' && (
                            <span className="opacity-55 italic">Loading embed preview...</span>
                        )}
                        {status === 'missing' && (
                            <span className="opacity-55 italic">Target note was not found in this vault.</span>
                        )}
                        {status === 'error' && (
                            <span className="opacity-55 italic">Could not load this embed preview.</span>
                        )}
                        {status === 'ready' && (
                            <span>{previewText || 'This note is empty.'}</span>
                        )}
                    </>
                )}
            </div>
        </NodeViewWrapper>
    )
}
