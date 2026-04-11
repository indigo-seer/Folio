import { useRef, useCallback, useEffect, useState } from 'react';
import type { Editor as TipTapEditor } from '@tiptap/react';
import {
    extractReferenceStyleDefinitions,
    restoreReferenceStyleLinks,
    tipTapToMarkdown,
    type ReferenceStyleDefinition,
} from '../lib/markdown';
import { fs } from '../lib/fs';
import { updateWordCountGlobally } from './useWordCount';
import { detectCorruption } from '../lib/corruptionDetector';
import { isSyncRuntimeEnabledForVault } from '../sync/bootstrap';
import { yjsVault } from '../sync/YjsVault';
import type { FileSystemAPI } from './useFileSystem';
import type { TabData } from './useTabs';

interface UseEditorStateProps {
    activeTabId: string | null;
    tabs: TabData[];
    fileSystem: Pick<FileSystemAPI, 'readFile' | 'writeFile' | 'getEditorState' | 'saveEditorState'>;
    isMoveModalOpen: boolean;
    vaultRootPath: string | null;
    showToast?: (msg: string) => void;
}

export function useEditorState({
    activeTabId,
    tabs,
    fileSystem,
    isMoveModalOpen,
    vaultRootPath,
    showToast
}: UseEditorStateProps) {
    const [isNewNote, setIsNewNote] = useState(false);
    const [editorReady, setEditorReady] = useState(false);
    const [editorInstanceVersion, setEditorInstanceVersion] = useState(0);
    const [corruptionWarnings, setCorruptionWarnings] = useState<string[]>([]);
    const [externalChangeWarning, setExternalChangeWarning] = useState<string | null>(null);

    const editorRef = useRef<TipTapEditor | null>(null);
    const editorScrollRef = useRef<HTMLDivElement | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLoadingRef = useRef(false);
    const isSyncingRef = useRef(false);
    const renderedTabIdRef = useRef<string | null>(null);
    const hydratedTabIdRef = useRef<string | null>(null);
    const lastFlushedTabRef = useRef<string | null>(null);
    const referenceStyleByPathRef = useRef<Map<string, ReferenceStyleDefinition[]>>(new Map());
    const lastKnownDiskByPathRef = useRef<Map<string, string>>(new Map());
    const lastKnownYjsByPathRef = useRef<Map<string, string>>(new Map());
    const lastEditorUpdateAtRef = useRef<number>(0);
    const isSyncWriteEnabled = useCallback(() => {
        return isSyncRuntimeEnabledForVault(vaultRootPath);
    }, [vaultRootPath]);

    const checkExternalChangeBeforeWrite = useCallback(async (path: string, nextMarkdown: string) => {
        const expectedDisk = lastKnownDiskByPathRef.current.get(path);
        const currentDisk = await fileSystem.readFile(path);

        // Initialize baseline when missing to avoid false positive on first save attempt.
        if (expectedDisk === undefined) {
            lastKnownDiskByPathRef.current.set(path, currentDisk);
            return { shouldWrite: true, currentDisk };
        }

        const diskChangedExternally = currentDisk !== expectedDisk;
        if (diskChangedExternally && currentDisk !== nextMarkdown) {
            setExternalChangeWarning('This file changed on disk outside Folium. Your local edits were not saved to avoid overwriting newer content. Reload the note to merge changes.')
            return { shouldWrite: false, currentDisk };
        }

        return { shouldWrite: true, currentDisk };
    }, [fileSystem]);

    // Sync editor content with active tab
    useEffect(() => {
        let isMounted = true;
        const syncEditor = async () => {
            // Prevent re-entrant calls (writeFile state updates cause effect re-fire)
            if (isSyncingRef.current) return;
            isSyncingRef.current = true;

            try {
                // If we are switching away from a tab, flush content to disk immediately
                if (renderedTabIdRef.current && renderedTabIdRef.current !== activeTabId) {
                    // Only flush if we haven't already flushed this exact tab
                    if (editorRef.current && lastFlushedTabRef.current !== renderedTabIdRef.current) {
                        // Cancel any pending debounced save
                        if (saveTimerRef.current) {
                            clearTimeout(saveTimerRef.current);
                            saveTimerRef.current = null;
                        }

                        // Immediately flush content to disk using raw FS adapter
                        // (NOT fileSystem.writeFile which triggers setVault → re-render → loop)
                        const prevTab = tabs.find((t: any) => t.id === renderedTabIdRef.current);
                        if (prevTab?.path) {
                            try {
                                const json = editorRef.current.getJSON();
                                const rawMarkdown = tipTapToMarkdown(json);
                                const definitions = referenceStyleByPathRef.current.get(prevTab.path) || [];
                                const md = restoreReferenceStyleLinks(rawMarkdown, definitions);
                                const { shouldWrite } = await checkExternalChangeBeforeWrite(prevTab.path, md);
                                if (!shouldWrite) {
                                    console.warn('[Folium Debug] Tab-switch flush blocked by external file change:', prevTab.path);
                                } else {
                                    if (import.meta.env.DEV) console.log('[Folium Debug] Tab-switch flush:', prevTab.path, 'length:', md.length);
                                    await fs.writeFile(prevTab.path, md);
                                    if (isSyncWriteEnabled()) {
                                        await yjsVault.writeNote(prevTab.path, md);
                                    }
                                    lastKnownDiskByPathRef.current.set(prevTab.path, md);
                                    lastKnownYjsByPathRef.current.set(prevTab.path, md);
                                    lastFlushedTabRef.current = renderedTabIdRef.current;
                                    if (activeTabId === renderedTabIdRef.current) {
                                        setExternalChangeWarning(null);
                                    }
                                }
                            } catch (err) {
                                console.error('[Folium Debug] Tab-switch flush FAILED:', err);
                            }
                        }
                    }

                    if (editorScrollRef.current && editorRef.current) {
                        fileSystem.saveEditorState(renderedTabIdRef.current, {
                            scroll: editorScrollRef.current.scrollTop,
                            cursor: editorRef.current.state.selection.head
                        });
                    }
                }

                if (!activeTabId) {
                    editorRef.current?.commands.setContent('', {
                        emitUpdate: false
                    } as any);
                    renderedTabIdRef.current = null;
                    hydratedTabIdRef.current = null;
                    isSyncingRef.current = false;
                    return;
                }

                if (activeTabId === renderedTabIdRef.current) {
                    isSyncingRef.current = false;
                    return;
                }

                const tab = tabs.find(t => t.id === activeTabId);
                if (!tab || tab.type !== 'markdown' || !tab.path) return;

                // Guard: editor must be initialised before we can setContent
                if (!editorRef.current) return;

                isLoadingRef.current = true;
                hydratedTabIdRef.current = null;
                setIsNewNote(false);

                try {
                    const raw = await fileSystem.readFile(tab.path);
                    const yjsMarkdown = isSyncWriteEnabled()
                        ? await yjsVault.readNote(tab.path)
                        : null;
                    const markdownFromSource = yjsMarkdown ?? raw;

                    referenceStyleByPathRef.current.set(tab.path, extractReferenceStyleDefinitions(markdownFromSource));
                    lastKnownDiskByPathRef.current.set(tab.path, raw);
                    lastKnownYjsByPathRef.current.set(tab.path, markdownFromSource);
                    setExternalChangeWarning(null);

                    // Phase 0: detect corruption from older parser versions
                    const warnings = detectCorruption(markdownFromSource);
                    setCorruptionWarnings(warnings);

                    const markdown = markdownFromSource;

                    if (!isMounted) return;
                    if (!editorRef.current) {
                        isLoadingRef.current = false;
                        return;
                    }

                    // @tiptap/markdown overrides setContent to parse the markdown natively
                    // if the contentType option is passed. This supports custom task list
                    // extensions and securely runs Wikilink's own markdownTokenizer.
                    editorRef.current.commands.setContent(markdown, {
                        emitUpdate: false,
                        contentType: 'markdown'
                    } as any);

                    renderedTabIdRef.current = activeTabId;
                    hydratedTabIdRef.current = activeTabId;
                    lastFlushedTabRef.current = null; // Reset flush tracker for new tab

                    requestAnimationFrame(() => {
                        if (!isMounted || !editorRef.current) return;

                        const savedState = fileSystem.getEditorState(tab.path!);

                        // Restore scroll
                        if (editorScrollRef.current && savedState.scroll > 0) {
                            editorScrollRef.current.scrollTop = savedState.scroll;
                        } else if (editorScrollRef.current) {
                            editorScrollRef.current.scrollTop = 0;
                        }

                        // Restore cursor or focus top
                        if (savedState.cursor > 1) { // 1 is default start
                            try {
                                editorRef.current.commands.setTextSelection(savedState.cursor);
                            } catch {
                                // Cursor position may be out of range for a different file
                            }
                            editorRef.current.commands.focus();
                        } else {
                            editorRef.current.commands.focus('start');
                        }

                        updateWordCountGlobally(editorRef.current);
                        isLoadingRef.current = false;
                    });
                } catch (err) {
                    console.error('Failed to load note:', err);
                    if (isMounted) {
                        if (editorRef.current) {
                            const errMessage = err instanceof Error ? err.message : String(err);
                            const errorHtml = `<h1>Error Loading Note</h1><p style="color: #ef4444;">Failed to load note content.</p><pre><code>${errMessage}</code></pre>`;
                            try {
                                editorRef.current.commands.setContent(errorHtml);
                            } catch (e) {
                                console.error('Failed to set error content', e);
                            }
                        }
                        hydratedTabIdRef.current = null;
                        isLoadingRef.current = false;
                    }
                }
            } finally {
                isSyncingRef.current = false;
            }
        };

        syncEditor();

        return () => {
            isMounted = false;
        };
    }, [activeTabId, tabs, fileSystem, editorReady, editorInstanceVersion, vaultRootPath]);

    // Auto-save: debounced write back to disk
    const triggerAutoSave = useCallback(() => {
        if (isMoveModalOpen) return;
        if (isLoadingRef.current || !activeTabId || !editorRef.current) return;
        if (renderedTabIdRef.current !== activeTabId) return;
        if (hydratedTabIdRef.current !== activeTabId) return;

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        saveTimerRef.current = setTimeout(async () => {
            if (!editorRef.current || !activeTabId) return;
            if (renderedTabIdRef.current !== activeTabId) return;
            if (hydratedTabIdRef.current !== activeTabId) return;
            const tab = tabs.find(t => t.id === activeTabId);
            if (!tab || !tab.path) return;

            try {
                const json = editorRef.current.getJSON();
                const rawMarkdown = tipTapToMarkdown(json);
                const definitions = referenceStyleByPathRef.current.get(tab.path) || [];
                const md = restoreReferenceStyleLinks(rawMarkdown, definitions);
                const { shouldWrite } = await checkExternalChangeBeforeWrite(tab.path, md);
                if (!shouldWrite) return;
                if (import.meta.env.DEV) console.log('[Folium Debug] Autosave: markdown length:', md.length, 'preview:', md.substring(0, 100));
                await fileSystem.writeFile(tab.path, md);
                if (isSyncWriteEnabled()) {
                    await yjsVault.writeNote(tab.path, md);
                }
                lastKnownDiskByPathRef.current.set(tab.path, md);
                lastKnownYjsByPathRef.current.set(tab.path, md);
                setExternalChangeWarning(null);
                if (import.meta.env.DEV) console.log('[Folium Debug] Autosave: Write complete');
            } catch (err) {
                console.error('[Folium Debug] Autosave FAILED:', err);
            }
        }, 1000);
    }, [activeTabId, tabs, fileSystem, isMoveModalOpen, isSyncWriteEnabled]);

    useEffect(() => {
        if (!activeTabId || !isSyncWriteEnabled()) return;

        let isMounted = true;

        const pollForRemoteYjsUpdate = async () => {
            if (!isMounted || !activeTabId) return;
            if (!editorRef.current) return;
            if (renderedTabIdRef.current !== activeTabId || hydratedTabIdRef.current !== activeTabId) return;
            if (Date.now() - lastEditorUpdateAtRef.current < 1500) return;

            const tab = tabs.find(t => t.id === activeTabId);
            if (!tab?.path) return;

            const remoteMarkdown = await yjsVault.readNote(tab.path);
            if (remoteMarkdown === null) return;

            const knownYjs = lastKnownYjsByPathRef.current.get(tab.path);
            if (knownYjs === remoteMarkdown) return;

            const selectionHead = editorRef.current.state.selection.head;
            const currentJson = editorRef.current.getJSON();
            const currentRawMarkdown = tipTapToMarkdown(currentJson);
            const definitions = referenceStyleByPathRef.current.get(tab.path) || [];
            const currentMarkdown = restoreReferenceStyleLinks(currentRawMarkdown, definitions);

            if (currentMarkdown !== remoteMarkdown) {
                editorRef.current.commands.setContent(remoteMarkdown, {
                    emitUpdate: false,
                    contentType: 'markdown'
                } as any);
                try {
                    editorRef.current.commands.setTextSelection(selectionHead);
                } catch {
                    // Cursor may be out of range after remote update.
                }
                showToast?.('Note updated from sync');
            }

            await fileSystem.writeFile(tab.path, remoteMarkdown);
            lastKnownDiskByPathRef.current.set(tab.path, remoteMarkdown);
            lastKnownYjsByPathRef.current.set(tab.path, remoteMarkdown);
            setExternalChangeWarning(null);
        };

        const timer = setInterval(() => {
            void pollForRemoteYjsUpdate();
        }, 1500);

        return () => {
            isMounted = false;
            clearInterval(timer);
        };
    }, [activeTabId, tabs, fileSystem, isSyncWriteEnabled, showToast]);

    // Handle editor updates: word count + auto-save
    const handleEditorUpdate = useCallback(
        (editor: TipTapEditor | null) => {
            if (!editor) return;
            editorRef.current = editor;
            lastEditorUpdateAtRef.current = Date.now();
            updateWordCountGlobally(editor);
            triggerAutoSave();
        },
        [triggerAutoSave],
    );

    // Store editor ref on mount and signal readiness
    const handleEditorReady = useCallback((editor: TipTapEditor | null) => {
        if (editor) {
            const isNewEditorInstance = editorRef.current !== editor;
            editorRef.current = editor;
            if (isNewEditorInstance) {
                // Force a hydration cycle for the current tab when the editor remounts.
                renderedTabIdRef.current = null;
                hydratedTabIdRef.current = null;
                lastFlushedTabRef.current = null;
                setEditorInstanceVersion(v => v + 1);
            }
            setEditorReady(true);
        }
    }, []);

    // Cleanup save timer on unmount
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    const reloadActiveTabFromDisk = useCallback(() => {
        if (!activeTabId) return;

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }

        // Force a fresh hydration cycle for the currently active tab.
        renderedTabIdRef.current = null;
        hydratedTabIdRef.current = null;
        lastFlushedTabRef.current = null;
        setExternalChangeWarning(null);
        setEditorInstanceVersion(v => v + 1);
    }, [activeTabId]);

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
        triggerAutoSave
    };
}
