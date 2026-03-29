import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useRef, useContext, useMemo } from 'react'

import { FloatingToolbar } from './FloatingToolbar'
import { TableToolbar } from './TableToolbar'
import { VaultContext } from '../contexts/VaultContext'
import { getEditorExtensions, setVaultRootPath } from '../lib/editor/extensions'

interface EditorProps {
    onUpdate?: (editor: ReturnType<typeof useEditor>) => void
    onReady?: (editor: ReturnType<typeof useEditor>) => void
    onFocus?: (editor: ReturnType<typeof useEditor>) => void
    isTypewriterMode?: boolean
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

    // Ref to prevent concurrent base64 processing
    const isProcessingBase64Ref = useRef(false)
    const isTauriRef = useRef(isTauriEnv)
    isTauriRef.current = isTauriEnv
    const ensureAttachmentFolderRef = useRef(ensureAttachmentFolder)
    const writeBinaryFileRef = useRef(writeBinaryFile)
    const scannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        ensureAttachmentFolderRef.current = ensureAttachmentFolder
        writeBinaryFileRef.current = writeBinaryFile
    }, [ensureAttachmentFolder, writeBinaryFile])

    const editor = useEditor({
        extensions,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: 'prose-folio outline-none min-h-[calc(100vh-12rem)] pb-16 px-6',
            },
            handleDrop: () => false,
            handlePaste: () => false
        },
        content: '',
        onUpdate: ({ editor: e }) => {
            // Forward to parent callback
            if (onUpdateRef.current) onUpdateRef.current(e as ReturnType<typeof useEditor>)

            // Use the live vault object directly from the component scope
            const currentVaultRoot = vault.rootPath

            // Base64 image scanner: detect pasted images and save to attachments
            // Print primitive values so WebKit inspector doesn't collapse them into "Object"
            console.log('[Folio Debug] Scanner guard: isTauri=', isTauriRef.current, 'vaultRoot=', !!currentVaultRoot, 'processing=', isProcessingBase64Ref.current)

            if (!isTauriRef.current || !currentVaultRoot || isProcessingBase64Ref.current) return

            // Use a 1000ms debounce to prevent O(N) tree traversals on every single keystroke,
            // which was choking the main thread and causing caret animation lag and dropped frames.
            if (scannerTimeoutRef.current) {
                clearTimeout(scannerTimeoutRef.current)
            }

            scannerTimeoutRef.current = setTimeout(() => {
                const ephemeralNodes: Array<{ pos: number; src: string }> = []
                e.state.doc.descendants((node, pos) => {
                    if (node.type.name === 'image') {
                        const src = node.attrs.src || ''
                        // Catch both data: URLs and blob: URLs — both are ephemeral
                        if (src.startsWith('data:') || src.startsWith('blob:')) {
                            ephemeralNodes.push({ pos, src })
                        }
                    }
                })

                if (ephemeralNodes.length === 0) return

                isProcessingBase64Ref.current = true
                console.log('[Folio Debug] Found', ephemeralNodes.length, 'ephemeral image(s) to save')

                const rootPath = currentVaultRoot;

                (async () => {
                    try {
                        await ensureAttachmentFolderRef.current()
                        const { sep } = await import('@tauri-apps/api/path')
                        const separator = await sep()

                        for (const { src } of ephemeralNodes) {
                            try {
                                const response = await fetch(src)
                                const blob = await response.blob()
                                const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
                                const name = `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
                                const absolutePath = `${rootPath}${separator}attachments${separator}${name}`

                                const arrayBuffer = await blob.arrayBuffer()
                                const uint8Array = new Uint8Array(arrayBuffer)

                                console.log('[Folio Debug] Saving base64 image:', name, 'size:', uint8Array.length)
                                await writeBinaryFileRef.current(absolutePath, uint8Array)

                                const { convertFileSrc } = await import('@tauri-apps/api/core')
                                const displaySrc = isTauriRef.current ? convertFileSrc(absolutePath) : `attachments/${name}`

                                // Replace the base64 src with the relative display path
                                e.state.doc.descendants((node, nodePos) => {
                                    if (node.type.name === 'image' && node.attrs.src === src) {
                                        const tr = e.state.tr.setNodeMarkup(nodePos, undefined, {
                                            ...node.attrs,
                                            src: displaySrc,
                                            alt: node.attrs.alt || name
                                        })
                                        e.view.dispatch(tr)
                                        return false
                                    }
                                })

                                console.log('[Folio Debug] Replaced base64 with:', displaySrc)
                            } catch (err) {
                                console.error('[Folio Debug] Failed to save base64 image:', err)
                            }
                        }
                    } finally {
                        isProcessingBase64Ref.current = false
                    }
                })()
            }, 1000)
        },
        onFocus: ({ editor: e }) => {
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

    if (!editor) return null

    return (
        <>
            <FloatingToolbar editor={editor} />
            <TableToolbar editor={editor} />
            <EditorContent editor={editor} />
        </>
    )
}
