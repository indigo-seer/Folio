import { useCallback, useEffect } from 'react'
import type { Editor as TipTapEditor } from '@tiptap/react'
import { restoreReferenceStyleLinks, tipTapToMarkdown, type ReferenceStyleDefinition } from '../lib/markdown'
import type { FileSystemAPI } from './useFileSystem'
import type { TabData } from './useTabs'

interface UseEditorAutoSaveProps {
    activeTabId: string | null
    tabs: TabData[]
    fileSystem: Pick<FileSystemAPI, 'writeFile'>
    isMoveModalOpen: boolean
    editorRef: React.MutableRefObject<TipTapEditor | null>
    isLoadingRef: React.MutableRefObject<boolean>
    saveTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
    renderedTabIdRef: React.MutableRefObject<string | null>
    hydratedTabIdRef: React.MutableRefObject<string | null>
    referenceStyleByPathRef: React.MutableRefObject<Map<string, ReferenceStyleDefinition[]>>
    lastKnownDiskByPathRef: React.MutableRefObject<Map<string, string>>
    checkExternalChangeBeforeWrite: (path: string, nextMarkdown: string) => Promise<{ shouldWrite: boolean; currentDisk: string }>
    setExternalChangeWarning: (message: string | null) => void
    onError?: (message: string) => void
}

export function useEditorAutoSave({
    activeTabId,
    tabs,
    fileSystem,
    isMoveModalOpen,
    editorRef,
    isLoadingRef,
    saveTimerRef,
    renderedTabIdRef,
    hydratedTabIdRef,
    referenceStyleByPathRef,
    lastKnownDiskByPathRef,
    checkExternalChangeBeforeWrite,
    setExternalChangeWarning,
    onError,
}: UseEditorAutoSaveProps) {
    const triggerAutoSave = useCallback(() => {
        if (isMoveModalOpen || isLoadingRef.current || !activeTabId || !editorRef.current) return
        if (renderedTabIdRef.current !== activeTabId || hydratedTabIdRef.current !== activeTabId) return

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

        saveTimerRef.current = setTimeout(async () => {
            if (!editorRef.current || !activeTabId) return
            if (renderedTabIdRef.current !== activeTabId || hydratedTabIdRef.current !== activeTabId) return

            const tab = tabs.find(t => t.id === activeTabId)
            if (!tab?.path) return

            try {
                const rawMarkdown = tipTapToMarkdown(editorRef.current.getJSON())
                const definitions = referenceStyleByPathRef.current.get(tab.path) || []
                const markdown = restoreReferenceStyleLinks(rawMarkdown, definitions)
                const { shouldWrite } = await checkExternalChangeBeforeWrite(tab.path, markdown)
                if (!shouldWrite) return

                if (import.meta.env.DEV) {
                    console.log('[Folium Debug] Autosave:', { path: tab.path, length: markdown.length })
                }
                await fileSystem.writeFile(tab.path, markdown)
                lastKnownDiskByPathRef.current.set(tab.path, markdown)
                setExternalChangeWarning(null)
            } catch (err) {
                console.error('[Folium Debug] Autosave FAILED:', err)
                onError?.('Could not save this note. Your changes are still in the editor; try saving again.')
            }
        }, 1000)
    }, [activeTabId, tabs, fileSystem, isMoveModalOpen, editorRef, isLoadingRef, saveTimerRef, renderedTabIdRef, hydratedTabIdRef, referenceStyleByPathRef, lastKnownDiskByPathRef, checkExternalChangeBeforeWrite, setExternalChangeWarning, onError])

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        }
    }, [saveTimerRef])

    return triggerAutoSave
}
