import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useRef, useContext, useMemo } from 'react'

import { FloatingToolbar } from './FloatingToolbar'
import { VaultContext } from '../contexts/VaultContext'
import { getEditorExtensions } from '../lib/editor/extensions'

interface EditorProps {
    onUpdate?: (editor: ReturnType<typeof useEditor>) => void
    onReady?: (editor: ReturnType<typeof useEditor>) => void
    isTypewriterMode?: boolean
}

export function Editor({ onUpdate, onReady, isTypewriterMode = false }: EditorProps) {
    // Context for vault notes
    const { notes } = useContext(VaultContext)
    const notesRef = useRef(notes)
    notesRef.current = notes

    // Use refs to avoid re-running effects when callbacks change
    const onUpdateRef = useRef(onUpdate)
    const onReadyRef = useRef(onReady)
    onUpdateRef.current = onUpdate
    onReadyRef.current = onReady

    const extensions = useMemo(
        () => getEditorExtensions(notesRef),
        [] // Intentionally empty — extensions are evaluated mount-time only
    )

    const editor = useEditor({
        extensions,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: 'prose-folio outline-none min-h-[calc(100vh-12rem)] pb-16 px-6',
            },
        },
        content: '',
        onUpdate: ({ editor: e }) => {
            // Use ref so this closure never goes stale
            if (onUpdateRef.current) onUpdateRef.current(e as ReturnType<typeof useEditor>)
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
            <EditorContent editor={editor} />
        </>
    )
}
