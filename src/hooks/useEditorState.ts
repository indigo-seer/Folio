import { useRef, useCallback, useEffect, useState } from 'react';
import type { Editor as TipTapEditor } from '@tiptap/react';
import { marked } from 'marked';
import { updateWordCountGlobally } from './useWordCount';

// Register Wikilink tokenizer with marked
marked.use({
    extensions: [{
        name: 'wikilink',
        level: 'inline',
        start(src: string) { return src.indexOf('[['); },
        tokenizer(src: string) {
            const match = src.match(/^\[\[([^\]]+)\]\]/);
            if (match) {
                return {
                    type: 'wikilink',
                    raw: match[0],
                    noteName: match[1],
                };
            }
            return undefined;
        },
        renderer(token: any) {
            return `<span data-type="wikilink" data-note-name="${token.noteName}">[[${token.noteName}]]</span>`;
        }
    }]
});

/**
 * Strip YAML front-matter from externally-authored Markdown files.
 * Front-matter starts at the very first line with `---` and ends with `---`.
 */
function stripFrontMatter(md: string): string {
    if (md.startsWith('---\n') || md.startsWith('---\r\n')) {
        const end = md.indexOf('\n---', 3)
        if (end !== -1) {
            return md.slice(end + 4).replace(/^\r?\n/, '')
        }
    }
    return md
}

interface UseEditorStateProps {
    activeTabId: string | null;
    tabs: any[];
    fileSystem: {
        readFile: (path: string) => Promise<string>;
        writeFile: (path: string, content: string) => Promise<void>;
        getEditorState: (path: string) => { scroll: number, cursor: number };
        saveEditorState: (path: string, state: { scroll: number, cursor: number }) => void;
    };
    isMoveModalOpen: boolean;
}

export function useEditorState({
    activeTabId,
    tabs,
    fileSystem,
    isMoveModalOpen
}: UseEditorStateProps) {
    const [isNewNote, setIsNewNote] = useState(false);
    const [editorReady, setEditorReady] = useState(false);

    const editorRef = useRef<TipTapEditor | null>(null);
    const editorScrollRef = useRef<HTMLDivElement | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLoadingRef = useRef(false);
    const renderedTabIdRef = useRef<string | null>(null);

    // Sync editor content with active tab
    useEffect(() => {
        let isMounted = true;
        const syncEditor = async () => {
            // If we are switching away from a tab, save its scroll and cursor position
            if (renderedTabIdRef.current && renderedTabIdRef.current !== activeTabId) {
                if (editorScrollRef.current && editorRef.current) {
                    fileSystem.saveEditorState(renderedTabIdRef.current, {
                        scroll: editorScrollRef.current.scrollTop,
                        cursor: editorRef.current.state.selection.head
                    });
                }
            }

            if (!activeTabId) {
                editorRef.current?.commands.setContent('');
                renderedTabIdRef.current = null;
                return;
            }

            if (activeTabId === renderedTabIdRef.current) return;

            const tab = tabs.find(t => t.id === activeTabId);
            if (!tab || tab.type !== 'markdown' || !tab.path) return;

            // Guard: editor must be initialised before we can setContent
            if (!editorRef.current) return;

            isLoadingRef.current = true;
            setIsNewNote(false);

            try {
                const raw = await fileSystem.readFile(tab.path);
                const markdown = stripFrontMatter(raw);

                if (!isMounted) return;
                if (!editorRef.current) {
                    isLoadingRef.current = false;
                    return;
                }

                // @tiptap/markdown: The safest cross-version method to load Markdown is rendering
                // it to HTML via the embedded marked parser before giving it to Tiptap.
                try {
                    const html = await marked.parse(markdown);
                    editorRef.current.commands.setContent(html);
                } catch (e) {
                    console.error("Markdown parsing error fallback", e);
                    editorRef.current.commands.setContent(markdown);
                }

                renderedTabIdRef.current = activeTabId;

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
                    isLoadingRef.current = false;
                }
            }
        };

        syncEditor();

        return () => {
            isMounted = false;
        };
    }, [activeTabId, tabs, fileSystem, editorReady]);

    // Auto-save: debounced write back to disk
    const triggerAutoSave = useCallback(() => {
        if (isMoveModalOpen) return;
        if (isLoadingRef.current || !activeTabId || !editorRef.current) return;

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        saveTimerRef.current = setTimeout(async () => {
            if (!editorRef.current || !activeTabId) return;
            const tab = tabs.find(t => t.id === activeTabId);
            if (!tab || !tab.path) return;

            try {
                // @tiptap/markdown: get markdown from editor using the v3 storage API
                const md = (editorRef.current.storage.markdown as any)?.getMarkdown?.();
                if (typeof md === 'string') {
                    await fileSystem.writeFile(tab.path, md);
                }
            } catch (err) {
                console.error('Auto-save failed:', err);
            }
        }, 1000);
    }, [activeTabId, tabs, fileSystem, isMoveModalOpen]);

    // Handle editor updates: word count + auto-save
    const handleEditorUpdate = useCallback(
        (editor: TipTapEditor | null) => {
            if (!editor) return;
            editorRef.current = editor;
            updateWordCountGlobally(editor);
            triggerAutoSave();
        },
        [triggerAutoSave],
    );

    // Store editor ref on mount and signal readiness
    const handleEditorReady = useCallback((editor: TipTapEditor | null) => {
        if (editor) {
            editorRef.current = editor;
            setEditorReady(true);
        }
    }, []);

    // Cleanup save timer on unmount
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    return {
        editorRef,
        editorScrollRef,
        isNewNote,
        setIsNewNote,
        handleEditorUpdate,
        handleEditorReady,
        triggerAutoSave
    };
}
