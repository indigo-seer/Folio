import { useEditor, EditorContent, type Editor as TipTapEditor } from '@tiptap/react'
import { useEffect, useRef, useContext, useMemo } from 'react'

import { FloatingToolbar } from './FloatingToolbar'
import { TableToolbar } from './TableToolbar'
import { VaultContext } from '../contexts/VaultContext'
import { getEditorExtensions, setVaultRootPath } from '../lib/editor/extensions'
import {
    decodeFileUrlToPath,
    getFileNameFromPath,
    ingestImageSourceToAttachments,
    isVaultAttachmentAbsolutePath,
    normalizeAttachmentProxySrc,
    shouldIngestImageSource,
    toVaultRelativeAttachmentPath,
} from '../lib/imageIngestion'

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

export function Editor({ onUpdate, onReady, onFocus, isTypewriterMode = false }: EditorProps) {
    // Context for vault state and filesystem operations
    const { notes, vault, fileSystem } = useContext(VaultContext)
    const { ensureAttachmentFolder, writeBinaryFile, isTauriEnv } = fileSystem

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

    if (!editor) return null

    return (
        <>
            <FloatingToolbar editor={editor} />
            <TableToolbar editor={editor} />
            <EditorContent editor={editor} />
        </>
    )
}
