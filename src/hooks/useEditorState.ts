import { useRef, useCallback, useEffect, useState } from 'react'
import type { Editor as TipTapEditor } from '@tiptap/react'
import {
    extractReferenceStyleDefinitions,
    repairUnparsedMathInTipTapJson,
    restoreReferenceStyleLinks,
    tipTapToMarkdown,
    type ReferenceStyleDefinition,
} from '../lib/markdown'
import {
    discardDocumentDraft,
    flushDocumentSession,
    openDocumentSession,
    subscribeToDocument,
    updateDocumentDraft,
    type FlushResult,
} from '../lib/documentSessions'
import { updateWordCountGlobally } from './useWordCount'
import { detectCorruption } from '../lib/corruptionDetector'
import type { FileSystemAPI } from './useFileSystem'
import type { TabData } from './useTabs'

interface UseEditorStateProps {
    activeTabId: string | null
    tabs: TabData[]
    fileSystem: Pick<FileSystemAPI, 'readFile' | 'writeFile' | 'getEditorState' | 'saveEditorState'>
    isMoveModalOpen: boolean
    vaultRootPath: string | null
    onError?: (message: string) => void
}

const EXTERNAL_CHANGE_MESSAGE = 'This file changed on disk outside Folium. Your local edits were kept as a recovery draft and were not written over the newer file.'

export function useEditorState({
    activeTabId,
    tabs,
    fileSystem,
    isMoveModalOpen,
    vaultRootPath,
    onError,
}: UseEditorStateProps) {
    const [isNewNote, setIsNewNote] = useState(false)
    const [editorReady, setEditorReady] = useState(false)
    const [editorInstanceVersion, setEditorInstanceVersion] = useState(0)
    const [corruptionWarnings, setCorruptionWarnings] = useState<string[]>([])
    const [externalChangeWarning, setExternalChangeWarning] = useState<string | null>(null)

    const editorRef = useRef<TipTapEditor | null>(null)
    const editorScrollRef = useRef<HTMLDivElement | null>(null)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isLoadingRef = useRef(false)
    const renderedTabIdRef = useRef<string | null>(null)
    const renderedPathRef = useRef<string | null>(null)
    const hydratedTabIdRef = useRef<string | null>(null)
    const referenceStyleByPathRef = useRef<Map<string, ReferenceStyleDefinition[]>>(new Map())
    const syncGenerationRef = useRef(0)
    const sourceRef = useRef(Symbol('editor-pane'))
    const fileSystemRef = useRef(fileSystem)
    const onErrorRef = useRef(onError)
    const isMoveModalOpenRef = useRef(isMoveModalOpen)

    fileSystemRef.current = fileSystem
    onErrorRef.current = onError
    isMoveModalOpenRef.current = isMoveModalOpen

    const activeTab = tabs.find(tab => tab.id === activeTabId)
    const targetPath = activeTab?.type === 'markdown' ? activeTab.path || null : null

    const handleFlushResult = useCallback((result: FlushResult, context: string) => {
        if (result.status === 'conflict') {
            setExternalChangeWarning(EXTERNAL_CHANGE_MESSAGE)
            onErrorRef.current?.(`Could not save the note ${context} because it changed outside Folium. Your draft was preserved.`)
        } else if (result.status === 'error') {
            console.error(`Failed to save note ${context}:`, result.error)
            onErrorRef.current?.(`Could not save the note ${context}. Your draft was preserved and will be recovered.`)
        } else if (result.status === 'saved') {
            setExternalChangeWarning(null)
        }
        return result
    }, [])

    const flushPath = useCallback(async (path: string, context = '') => {
        const io = fileSystemRef.current
        const result = await flushDocumentSession(path, {
            readFile: io.readFile,
            writeFile: io.writeFile,
        })
        return handleFlushResult(result, context)
    }, [handleFlushResult])

    const flushCurrentDocument = useCallback(async () => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current)
            saveTimerRef.current = null
        }
        const path = renderedPathRef.current
        return path ? flushPath(path, 'before continuing') : null
    }, [flushPath])

    const setMarkdownContent = useCallback((markdown: string) => {
        const editor = editorRef.current
        if (!editor) return
        editor.commands.setContent(markdown, {
            emitUpdate: false,
            contentType: 'markdown',
        } as any)

        const parsedJson = editor.getJSON() as any
        const repairedJson = repairUnparsedMathInTipTapJson(parsedJson)
        if (JSON.stringify(parsedJson) !== JSON.stringify(repairedJson)) {
            editor.commands.setContent(repairedJson as any, { emitUpdate: false } as any)
        }
    }, [])

    useEffect(() => {
        const generation = ++syncGenerationRef.current
        let cancelled = false

        const syncEditor = async () => {
            const previousTabId = renderedTabIdRef.current
            const previousPath = renderedPathRef.current
            if (previousPath && (previousTabId !== activeTabId || previousPath !== targetPath)) {
                if (saveTimerRef.current) {
                    clearTimeout(saveTimerRef.current)
                    saveTimerRef.current = null
                }
                if (editorScrollRef.current && editorRef.current && previousTabId) {
                    fileSystemRef.current.saveEditorState(previousPath, {
                        scroll: editorScrollRef.current.scrollTop,
                        cursor: editorRef.current.state.selection.head,
                    })
                }
                await flushPath(previousPath, 'before switching notes')
            }

            if (cancelled || generation !== syncGenerationRef.current) return

            if (!activeTabId || !targetPath) {
                editorRef.current?.commands.setContent('', { emitUpdate: false } as any)
                renderedTabIdRef.current = null
                renderedPathRef.current = null
                hydratedTabIdRef.current = null
                return
            }

            if (!editorRef.current) return
            if (renderedTabIdRef.current === activeTabId && renderedPathRef.current === targetPath) return

            isLoadingRef.current = true
            hydratedTabIdRef.current = null
            setIsNewNote(false)

            try {
                const raw = await fileSystemRef.current.readFile(targetPath)
                if (cancelled || generation !== syncGenerationRef.current || !editorRef.current) return

                referenceStyleByPathRef.current.set(targetPath, extractReferenceStyleDefinitions(raw))
                const session = openDocumentSession(targetPath, raw)
                setCorruptionWarnings(detectCorruption(raw))
                setExternalChangeWarning(null)
                setMarkdownContent(session.content)
                renderedTabIdRef.current = activeTabId
                renderedPathRef.current = targetPath
                hydratedTabIdRef.current = activeTabId

                if (session.recoveredDraft) {
                    onErrorRef.current?.('Recovered unsaved edits for this note. Folium will save them after checking the file on disk.')
                }

                requestAnimationFrame(() => {
                    if (cancelled || generation !== syncGenerationRef.current || !editorRef.current) return
                    const savedState = fileSystemRef.current.getEditorState(targetPath)
                    if (editorScrollRef.current) editorScrollRef.current.scrollTop = savedState.scroll > 0 ? savedState.scroll : 0
                    if (savedState.cursor > 1) {
                        try { editorRef.current.commands.setTextSelection(savedState.cursor) } catch { /* stale cursor */ }
                        editorRef.current.commands.focus()
                    } else {
                        editorRef.current.commands.focus('start')
                    }
                    updateWordCountGlobally(editorRef.current)
                    isLoadingRef.current = false
                })
            } catch (error) {
                console.error('Failed to load note:', error)
                onErrorRef.current?.('Could not load this note. The file may have been moved or is unreadable.')
                if (!cancelled && generation === syncGenerationRef.current) {
                    hydratedTabIdRef.current = null
                    isLoadingRef.current = false
                }
            }
        }

        void syncEditor()
        return () => { cancelled = true }
    }, [activeTabId, targetPath, editorReady, editorInstanceVersion, vaultRootPath, flushPath, setMarkdownContent])

    useEffect(() => {
        if (!targetPath) return
        return subscribeToDocument(targetPath, (draft, source) => {
            if (source === sourceRef.current || renderedPathRef.current !== targetPath || !editorRef.current) return
            const selection = editorRef.current.state.selection.from
            isLoadingRef.current = true
            setMarkdownContent(draft)
            try { editorRef.current.commands.setTextSelection(selection) } catch { /* document shrank */ }
            updateWordCountGlobally(editorRef.current)
            isLoadingRef.current = false
        })
    }, [targetPath, setMarkdownContent])

    useEffect(() => () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        const path = renderedPathRef.current
        if (path) void flushPath(path, 'while closing the editor')
    }, [flushPath])

    const scheduleAutoSave = useCallback((path: string) => {
        if (isMoveModalOpenRef.current) return
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null
            void flushPath(path, 'during auto-save')
        }, 1000)
    }, [flushPath])

    const handleEditorUpdate = useCallback((editor: TipTapEditor | null) => {
        if (!editor) return
        editorRef.current = editor
        updateWordCountGlobally(editor)
        const path = renderedPathRef.current
        if (isLoadingRef.current || !path || renderedTabIdRef.current !== activeTabId || hydratedTabIdRef.current !== activeTabId) return

        const rawMarkdown = tipTapToMarkdown(editor.getJSON())
        const definitions = referenceStyleByPathRef.current.get(path) || []
        const markdown = restoreReferenceStyleLinks(rawMarkdown, definitions)
        updateDocumentDraft(path, markdown, sourceRef.current)
        scheduleAutoSave(path)
    }, [activeTabId, scheduleAutoSave])

    const handleEditorReady = useCallback((editor: TipTapEditor | null) => {
        if (!editor) return
        const isNewEditorInstance = editorRef.current !== editor
        editorRef.current = editor
        if (isNewEditorInstance) {
            renderedTabIdRef.current = null
            renderedPathRef.current = null
            hydratedTabIdRef.current = null
            setEditorInstanceVersion(version => version + 1)
        }
        setEditorReady(true)
    }, [])

    const reloadActiveTabFromDisk = useCallback(() => {
        if (!targetPath) return
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current)
            saveTimerRef.current = null
        }
        discardDocumentDraft(targetPath)
        renderedTabIdRef.current = null
        renderedPathRef.current = null
        hydratedTabIdRef.current = null
        setExternalChangeWarning(null)
        setEditorInstanceVersion(version => version + 1)
    }, [targetPath])

    return {
        editorRef,
        editorScrollRef,
        isNewNote,
        setIsNewNote,
        corruptionWarnings,
        externalChangeWarning,
        reloadActiveTabFromDisk,
        handleEditorUpdate,
        handleEditorReady,
        flushCurrentDocument,
    }
}
