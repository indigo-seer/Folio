import { useEditor, EditorContent, type Editor as TipTapEditor } from '@tiptap/react'
import { useEffect, useRef, useContext, useMemo, useState } from 'react'

import { FloatingToolbar } from './FloatingToolbar'
import { TableToolbar } from './TableToolbar'
import { VaultContext } from '../contexts/VaultContext'
import { useModals } from '../contexts/ModalContext'
import { getEditorExtensions, setVaultRootPath } from '../lib/editor/extensions'
import { OPEN_EMBED_PICKER_EVENT, type OpenEmbedPickerEventDetail } from '../lib/embedPickerEvent'
import {
    decodeFileUrlToPath,
    getFileNameFromPath,
    ingestImageSourceToAttachments,
    isVaultAttachmentAbsolutePath,
    normalizeAttachmentProxySrc,
    shouldIngestImageSource,
    toVaultRelativeAttachmentPath,
} from '../lib/imageIngestion'
import { subscribeImageCacheUpdates } from '../lib/imageCache'

interface EditorProps {
    onUpdate?: (editor: ReturnType<typeof useEditor>) => void
    onReady?: (editor: ReturnType<typeof useEditor>) => void
    onFocus?: (editor: ReturnType<typeof useEditor>) => void
    isTypewriterMode?: boolean
}

function extractImageFilesFromClipboard(event: ClipboardEvent): File[] {
    const items = event.clipboardData?.items
    if (!items) return []
    const files: File[] = []
    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) files.push(file)
        }
    }
    return files
}

function extractImageFilesFromDrop(event: DragEvent): File[] {
    const fileList = event.dataTransfer?.files
    if (!fileList) return []
    return Array.from(fileList).filter(file => file.type.startsWith('image/'))
}

function insertImageNodeAtSelection(view: any, src: string, alt: string) {
    const imageType = view.state.schema.nodes.image
    if (!imageType) return
    const imageNode = imageType.create({
        src,
        alt,
    })
    const tr = view.state.tr.replaceSelectionWith(imageNode).scrollIntoView()
    view.dispatch(tr)
}

function sanitizeAttachmentName(filename: string): string {
    const safe = String(filename || '')
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/^\.+/, '')
    return safe || 'attachment'
}

function toUniqueAttachmentName(filename: string): string {
    const safe = sanitizeAttachmentName(filename)
    const dot = safe.lastIndexOf('.')
    const hasExt = dot > 0 && dot < safe.length - 1
    const base = hasExt ? safe.slice(0, dot) : safe
    const ext = hasExt ? safe.slice(dot) : ''
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    return `${base}-${suffix}${ext}`
}

function extractFirstDroppedFile(dataTransfer: DataTransfer | null | undefined): File | null {
    if (!dataTransfer) return null
    if (dataTransfer.files && dataTransfer.files.length > 0) {
        return dataTransfer.files[0]
    }
    if (!dataTransfer.items || dataTransfer.items.length === 0) return null
    for (const item of Array.from(dataTransfer.items)) {
        if (item.kind !== 'file') continue
        const file = item.getAsFile()
        if (file) return file
    }
    return null
}

function parentDirFromPath(path: string): string {
    const normalized = path.replace(/[\\/]+$/, '')
    const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
    if (index <= 0) return normalized
    return normalized.slice(0, index)
}

export function Editor({ onUpdate, onReady, onFocus, isTypewriterMode = false }: EditorProps) {
    // Context for vault state and filesystem operations
    const { notes, vault, fileSystem } = useContext(VaultContext)
    const modals = useModals()
    const { ensureAttachmentFolder, writeBinaryFile, readBinaryFile, isTauriEnv } = fileSystem
    const [isEmbedPickerOpen, setIsEmbedPickerOpen] = useState(false)
    const [isEmbedDropActive, setIsEmbedDropActive] = useState(false)
    const [isEmbeddingFile, setIsEmbeddingFile] = useState(false)
    const isEmbeddingFileRef = useRef(false)
    isEmbeddingFileRef.current = isEmbeddingFile
    const embedFileInputRef = useRef<HTMLInputElement | null>(null)
    const embedPathHandlerRef = useRef<(path: string) => void>(() => {})

    // Use refs to avoid re-running effects when callbacks change
    const notesRef = useRef(notes)
    notesRef.current = notes

    // Use refs to avoid re-running effects when callbacks change
    const onUpdateRef = useRef(onUpdate)
    const onReadyRef = useRef(onReady)
    const onFocusRef = useRef(onFocus)
    onUpdateRef.current = onUpdate
    onReadyRef.current = onReady
    onFocusRef.current = onFocus

    const extensions = useMemo(
        () => getEditorExtensions(notesRef),
        [] // Intentionally empty — extensions are evaluated mount-time only
    )

    // Keep the image extension's vault root path in sync
    useEffect(() => {
        setVaultRootPath(vault.rootPath)
    }, [vault.rootPath])

    // Ref to prevent concurrent image ingestion processing
    const isProcessingImageIngestionRef = useRef(false)
    const failedImageSourcesRef = useRef<Set<string>>(new Set())
    const isTauriRef = useRef(isTauriEnv)
    isTauriRef.current = isTauriEnv
    const ensureAttachmentFolderRef = useRef(ensureAttachmentFolder)
    const writeBinaryFileRef = useRef(writeBinaryFile)
    const scannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        ensureAttachmentFolderRef.current = ensureAttachmentFolder
        writeBinaryFileRef.current = writeBinaryFile
    }, [ensureAttachmentFolder, writeBinaryFile])

    const scheduleImageIngestion = (editor: TipTapEditor) => {
        const currentVaultRoot = vault.rootPath

        if (!isTauriRef.current || !currentVaultRoot || isProcessingImageIngestionRef.current) return

        if (scannerTimeoutRef.current) {
            clearTimeout(scannerTimeoutRef.current)
        }

        scannerTimeoutRef.current = setTimeout(() => {
            const sourceToReplacement = new Map<string, string>()
            const sourcesToIngest = new Set<string>()

            editor.state.doc.descendants((node) => {
                if (node.type.name !== 'image') return

                const rawSrc = String(node.attrs.src || '').trim()
                if (!rawSrc) return

                const normalizedProxy = normalizeAttachmentProxySrc(rawSrc)
                if (normalizedProxy) {
                    sourceToReplacement.set(rawSrc, normalizedProxy)
                    return
                }

                const decodedFilePath = decodeFileUrlToPath(rawSrc)
                if (decodedFilePath && isVaultAttachmentAbsolutePath(decodedFilePath, currentVaultRoot)) {
                    const relativeFromAbsolute = toVaultRelativeAttachmentPath(decodedFilePath, currentVaultRoot)
                    if (relativeFromAbsolute) {
                        sourceToReplacement.set(rawSrc, relativeFromAbsolute)
                    }
                    return
                }

                if (!shouldIngestImageSource(rawSrc)) return
                if (failedImageSourcesRef.current.has(rawSrc)) return
                sourcesToIngest.add(rawSrc)
            })

            if (sourceToReplacement.size === 0 && sourcesToIngest.size === 0) return

            isProcessingImageIngestionRef.current = true
            const rootPath = currentVaultRoot

            ; (async () => {
                try {
                    await ensureAttachmentFolderRef.current()

                    for (const source of sourcesToIngest) {
                        try {
                            const relativePath = await ingestImageSourceToAttachments(
                                source,
                                rootPath,
                                writeBinaryFileRef.current
                            )
                            sourceToReplacement.set(source, relativePath)
                            if (source.startsWith('blob:')) {
                                URL.revokeObjectURL(source)
                            }
                        } catch (err) {
                            failedImageSourcesRef.current.add(source)
                            console.error('[Folium Debug] Failed to ingest image source:', source, err)
                        }
                    }

                    if (sourceToReplacement.size === 0) return

                    let tr = editor.state.tr
                    let changed = false

                    editor.state.doc.descendants((node, nodePos) => {
                        if (node.type.name !== 'image') return
                        const currentSrc = String(node.attrs.src || '').trim()
                        const replacementSrc = sourceToReplacement.get(currentSrc)
                        if (!replacementSrc) return
                        changed = true
                        tr = tr.setNodeMarkup(nodePos, undefined, {
                            ...node.attrs,
                            src: replacementSrc,
                            alt: node.attrs.alt || getFileNameFromPath(replacementSrc),
                        })
                    })

                    if (changed) {
                        editor.view.dispatch(tr)
                    }
                } finally {
                    isProcessingImageIngestionRef.current = false
                }
            })()
        }, 450)
    }

    const editor = useEditor({
        extensions,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: 'prose-folium outline-none min-h-[calc(100vh-12rem)] pb-16 px-6',
            },
            handleDrop: (view, event) => {
                if (!isTauriRef.current) return false
                const imageFiles = extractImageFilesFromDrop(event)
                if (imageFiles.length === 0) return false

                event.preventDefault()

                for (const file of imageFiles) {
                    const blobUrl = URL.createObjectURL(file)
                    insertImageNodeAtSelection(view, blobUrl, file.name || 'pasted-image')
                }

                return true
            },
            handlePaste: (view, event) => {
                if (!isTauriRef.current) return false
                const imageFiles = extractImageFilesFromClipboard(event)
                if (imageFiles.length === 0) return false

                event.preventDefault()

                for (const file of imageFiles) {
                    const blobUrl = URL.createObjectURL(file)
                    insertImageNodeAtSelection(view, blobUrl, file.name || 'pasted-image')
                }

                return true
            }
        },
        content: '',
        onUpdate: ({ editor: e }) => {
            // Forward to parent callback
            if (onUpdateRef.current) onUpdateRef.current(e as ReturnType<typeof useEditor>)
        },
        onTransaction: ({ editor: e, transaction }) => {
            if (transaction.docChanged) {
                scheduleImageIngestion(e)
            }
        },
        onFocus: ({ editor: e }) => {
            scheduleImageIngestion(e)
            if (onFocusRef.current) onFocusRef.current(e as ReturnType<typeof useEditor>)
        },
    })

    const handleEmbedFile = async (file: File) => {
        if (!editor) return
        if (!isTauriRef.current) {
            modals.showToast('File embedding picker is available in the desktop app.')
            return
        }
        if (!vault.rootPath) {
            modals.showToast('Open a vault first.')
            return
        }

        const originalName = String(file.name || '').trim()
        if (!originalName) {
            modals.showToast('Could not read the selected file.')
            return
        }

        const lower = originalName.toLowerCase()
        if (lower.endsWith('.md')) {
            modals.showToast('Use wikilinks for Markdown notes instead of file embeds.')
            return
        }

        isEmbeddingFileRef.current = true
        setIsEmbeddingFile(true)
        try {
            const bytes = new Uint8Array(await file.arrayBuffer())
            if (bytes.length === 0) {
                modals.showToast('Selected file is empty.')
                return
            }

            const attachmentDir = await ensureAttachmentFolderRef.current()
            const { join } = await import('@tauri-apps/api/path')
            const storedName = toUniqueAttachmentName(originalName)
            const absolutePath = await join(attachmentDir, storedName)
            const relativePath = `attachments/${storedName}`

            await writeBinaryFileRef.current(absolutePath, bytes)

            editor
                .chain()
                .focus()
                .insertContent(`![[${relativePath}]]`, {
                    parseOptions: { preserveWhitespace: 'full' },
                    contentType: 'markdown',
                } as any)
                .run()

            setIsEmbedPickerOpen(false)
            setIsEmbedDropActive(false)
            if (embedFileInputRef.current) embedFileInputRef.current.value = ''
            modals.showToast(`Embedded ${originalName}`)
        } catch (error) {
            console.error('Failed to embed file:', error)
            modals.showToast('Failed to embed file.')
        } finally {
            isEmbeddingFileRef.current = false
            setIsEmbeddingFile(false)
        }
    }

    const handleEmbedAbsolutePath = async (absolutePath: string) => {
        if (!editor) return
        if (!isTauriRef.current) {
            modals.showToast('Drag and drop embedding is available in the desktop app.')
            return
        }
        if (!vault.rootPath) {
            modals.showToast('Open a vault first.')
            return
        }
        if (!readBinaryFile) {
            modals.showToast('Binary file reading is not available in this environment.')
            return
        }

        const originalName = getFileNameFromPath(absolutePath) || 'attachment'
        if (originalName.toLowerCase().endsWith('.md')) {
            modals.showToast('Use wikilinks for Markdown notes instead of file embeds.')
            return
        }

        isEmbeddingFileRef.current = true
        setIsEmbeddingFile(true)
        try {
            const parentPath = parentDirFromPath(absolutePath)
            if (parentPath) {
                const { invoke } = await import('@tauri-apps/api/core')
                await invoke('grant_vault_scope', { path: parentPath })
            }

            const bytes = await readBinaryFile(absolutePath)
            if (!bytes || bytes.length === 0) {
                modals.showToast('Dropped file is empty.')
                return
            }

            const attachmentDir = await ensureAttachmentFolderRef.current()
            const { join } = await import('@tauri-apps/api/path')
            const storedName = toUniqueAttachmentName(originalName)
            const destinationPath = await join(attachmentDir, storedName)
            const relativePath = `attachments/${storedName}`

            await writeBinaryFileRef.current(destinationPath, bytes)

            editor
                .chain()
                .focus()
                .insertContent(`![[${relativePath}]]`, {
                    parseOptions: { preserveWhitespace: 'full' },
                    contentType: 'markdown',
                } as any)
                .run()

            setIsEmbedPickerOpen(false)
            setIsEmbedDropActive(false)
            modals.showToast(`Embedded ${originalName}`)
        } catch (error) {
            console.error('Failed to embed dropped path:', absolutePath, error)
            modals.showToast('Failed to embed dropped file.')
        } finally {
            isEmbeddingFileRef.current = false
            setIsEmbeddingFile(false)
        }
    }

    embedPathHandlerRef.current = (path: string) => {
        void handleEmbedAbsolutePath(path)
    }

    const handleEmbedDrop = (dataTransfer: DataTransfer | null | undefined) => {
        if (isEmbeddingFileRef.current) return

        const droppedFile = extractFirstDroppedFile(dataTransfer)
        if (droppedFile) {
            void handleEmbedFile(droppedFile)
            return
        }

        modals.showToast('Drop a single file to embed.')
    }

    useEffect(() => {
        if (!editor) return

        const openPicker = (event: Event) => {
            const detail = (event as CustomEvent<OpenEmbedPickerEventDetail>).detail
            if (!detail || detail.editor !== editor) return
            setIsEmbedPickerOpen(true)
            setIsEmbedDropActive(false)
        }

        window.addEventListener(OPEN_EMBED_PICKER_EVENT, openPicker as EventListener)
        return () => {
            window.removeEventListener(OPEN_EMBED_PICKER_EVENT, openPicker as EventListener)
        }
    }, [editor])

    useEffect(() => {
        const unsubscribe = subscribeImageCacheUpdates((absolutePath, displayUrl) => {
            const rootElement = editor?.view?.dom
            if (!rootElement) return

            const imageNodes = rootElement.querySelectorAll('img[data-folium-image-source-path]')
            for (const imageNode of imageNodes) {
                const sourcePath = imageNode.getAttribute('data-folium-image-source-path')
                if (sourcePath !== absolutePath) continue
                imageNode.setAttribute('src', displayUrl)
            }
        })

        return unsubscribe
    }, [editor])

    // Fire once when editor mounts — NOT on callback changes
    useEffect(() => {
        if (editor) {
            if (onReadyRef.current) onReadyRef.current(editor as ReturnType<typeof useEditor>)
            if (onUpdateRef.current) onUpdateRef.current(editor as ReturnType<typeof useEditor>)
        }
    }, [editor]) // Only depends on editor instance, not callbacks

    // Sync Typewriter Mode state to the editor's DOM so the Extension can read it
    useEffect(() => {
        if (editor && editor.view && editor.view.dom) {
            if (isTypewriterMode) {
                editor.view.dom.setAttribute('data-typewriter-mode', 'true')
            } else {
                editor.view.dom.removeAttribute('data-typewriter-mode')
            }
        }
    }, [editor, isTypewriterMode])

    useEffect(() => {
        return () => {
            if (scannerTimeoutRef.current) {
                clearTimeout(scannerTimeoutRef.current)
                scannerTimeoutRef.current = null
            }
        }
    }, [])

    useEffect(() => {
        if (!isEmbedPickerOpen) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            if (isEmbeddingFile) return
            setIsEmbedPickerOpen(false)
            setIsEmbedDropActive(false)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => {
            window.removeEventListener('keydown', onKeyDown)
        }
    }, [isEmbedPickerOpen, isEmbeddingFile])

    useEffect(() => {
        if (!isEmbedPickerOpen || !isTauriRef.current) return

        let isDisposed = false
        let unlisten: (() => void) | null = null

        ; (async () => {
            try {
                const { getCurrentWindow } = await import('@tauri-apps/api/window')
                unlisten = await getCurrentWindow().onDragDropEvent((event) => {
                    if (isDisposed) return
                    const payload = event.payload

                    if (payload.type === 'enter' || payload.type === 'over') {
                        if (!isEmbeddingFileRef.current) {
                            setIsEmbedDropActive(true)
                        }
                        return
                    }

                    if (payload.type === 'leave') {
                        setIsEmbedDropActive(false)
                        return
                    }

                    if (payload.type === 'drop') {
                        setIsEmbedDropActive(false)
                        if (isEmbeddingFileRef.current) return

                        const firstPath = payload.paths?.[0]
                        if (!firstPath) {
                            modals.showToast('Drop a single file to embed.')
                            return
                        }
                        embedPathHandlerRef.current(firstPath)
                    }
                })
            } catch (error) {
                console.warn('Failed to attach native drag-drop listener for embed picker:', error)
            }
        })()

        return () => {
            isDisposed = true
            if (unlisten) unlisten()
        }
    }, [isEmbedPickerOpen, modals])

    if (!editor) return null

    return (
        <>
            <FloatingToolbar editor={editor} />
            <TableToolbar editor={editor} />
            <EditorContent editor={editor} />
            {isEmbedPickerOpen && (
                <div
                    className="fixed inset-0 z-[90] bg-black/35 backdrop-blur-[1px] flex items-center justify-center p-4"
                    onMouseDown={() => {
                        if (isEmbeddingFile) return
                        setIsEmbedPickerOpen(false)
                        setIsEmbedDropActive(false)
                    }}
                    onDragEnter={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        if (isEmbeddingFile) return
                        setIsEmbedDropActive(true)
                    }}
                    onDragOver={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        if (isEmbeddingFile) return
                        setIsEmbedDropActive(true)
                    }}
                    onDragLeave={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                        setIsEmbedDropActive(false)
                    }}
                    onDrop={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setIsEmbedDropActive(false)
                        handleEmbedDrop(event.dataTransfer)
                    }}
                >
                    <div
                        className="w-full max-w-md rounded-xl border border-folium-border dark:border-folium-dark-border bg-folium-bg dark:bg-folium-dark-bg shadow-2xl p-5"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-folium-text dark:text-folium-dark-text">Embed File</h3>
                            <button
                                type="button"
                                className="px-2.5 py-1 rounded-md text-xs border border-folium-border dark:border-folium-dark-border hover:bg-folium-bg-secondary dark:hover:bg-folium-dark-bg-secondary transition-colors"
                                onClick={() => {
                                    if (isEmbeddingFile) return
                                    setIsEmbedPickerOpen(false)
                                    setIsEmbedDropActive(false)
                                }}
                            >
                                Close
                            </button>
                        </div>
                        <p className="mt-2 text-sm opacity-75">
                            Pick a file or drag it here. We will copy it into <code>attachments/</code> and embed it inline.
                        </p>
                        <div
                            className={`mt-4 rounded-xl border-2 border-dashed p-8 min-h-[210px] flex flex-col items-center justify-center text-center transition-colors ${
                                isEmbedDropActive
                                    ? 'border-folium-accent bg-folium-accent/10'
                                    : 'border-folium-border dark:border-folium-dark-border bg-folium-bg-secondary/40 dark:bg-folium-dark-bg-secondary/40'
                            }`}
                            onDragEnter={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                if (isEmbeddingFile) return
                                setIsEmbedDropActive(true)
                            }}
                            onDragOver={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                if (isEmbeddingFile) return
                                setIsEmbedDropActive(true)
                            }}
                            onDragLeave={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                                setIsEmbedDropActive(false)
                            }}
                            onDrop={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                setIsEmbedDropActive(false)
                                handleEmbedDrop(event.dataTransfer)
                            }}
                        >
                            <div className="text-sm font-medium">
                                {isEmbeddingFile ? 'Embedding file...' : 'Drop file to embed'}
                            </div>
                            <div className="mt-2 text-xs opacity-70">
                                or
                            </div>
                            <button
                                type="button"
                                disabled={isEmbeddingFile}
                                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium border border-folium-border dark:border-folium-dark-border hover:bg-folium-bg-secondary dark:hover:bg-folium-dark-bg-secondary disabled:opacity-55 disabled:cursor-not-allowed transition-colors"
                                onClick={() => {
                                    if (isEmbeddingFile) return
                                    embedFileInputRef.current?.click()
                                }}
                            >
                                Click Here to Browse
                            </button>
                        </div>
                        <input
                            ref={embedFileInputRef}
                            type="file"
                            className="hidden"
                            onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (!file) return
                                void handleEmbedFile(file)
                            }}
                        />
                    </div>
                </div>
            )}
        </>
    )
}
