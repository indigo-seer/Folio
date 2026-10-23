import { useCallback, useMemo } from 'react';
import { useModals } from '../contexts/ModalContext';
import { exportNoteAsPdf } from '../lib/pdfExport';
import type { FileSystemAPI } from './useFileSystem';
import type { TabsAPI } from './useTabs';
import { findNotePath } from '../lib/fs';
import { GRAPH_TAB_ID, getBasename } from '../lib/constants';
import {
    flushAllDocumentSessions,
    remapDocumentSessions,
    removeDocumentSessions,
} from '../lib/documentSessions';
import { EntryExistsError } from '../lib/fs/pathSafety';

interface UseFileOperationsProps {
    fileSystem: FileSystemAPI;
    tabs: TabsAPI;
    activeTabId: string | null;
    renderedTabIdRef: React.MutableRefObject<string | null>;
    setIsNewNote: (isNew: boolean) => void;
}

/**
 * Scroll to a heading or block anchor within the current editor.
 * Anchor format: "#Heading Text" or "^block-id"
 */
function scrollToAnchor(anchor: string) {
    const editorEl = document.querySelector('.ProseMirror')
    if (!editorEl) return

    if (anchor.startsWith('#')) {
        // Heading anchor — find a heading whose text matches
        const headingText = anchor.slice(1).toLowerCase().trim()
        const headings = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6')
        for (const h of headings) {
            const text = (h.textContent || '').toLowerCase().trim()
            if (text === headingText) {
                h.scrollIntoView({ behavior: 'smooth', block: 'start' })
                return
            }
        }
    }
    // Block ID anchors (^block-id) are not yet rendered in the DOM,
    // so we can't scroll to them yet. This will be handled in Phase 4
    // when BlockId.ts is implemented.
}

export function useFileOperations({ fileSystem, tabs, activeTabId, renderedTabIdRef, setIsNewNote }: UseFileOperationsProps) {
    const modals = useModals();

    const flushAllBeforeMutation = useCallback(async () => {
        const results = await flushAllDocumentSessions(fileSystem);
        const failed = results.find(result => result.status === 'conflict' || result.status === 'error');
        if (failed?.status === 'conflict') throw new Error('A note changed outside Folium. Resolve it before changing files.');
        if (failed?.status === 'error') throw failed.error;
    }, [fileSystem]);

    const openPathInMainTab = useCallback((path: string) => {
        const title = getBasename(path).replace(/\.md$/, '') || 'Untitled';
        tabs.openTab({
            id: path,
            type: 'markdown',
            title,
            path
        });
    }, [tabs]);

    const openPathInSplitTab = useCallback((path: string) => {
        const title = getBasename(path).replace(/\.md$/, '') || 'Untitled';
        tabs.openTabInSplit({
            id: path,
            type: 'markdown',
            title,
            path
        });
    }, [tabs]);

    const handleNewNote = useCallback(async (parentPath?: string) => {
        try {
            let path: string | null = null;
            for (let suffix = 1; suffix <= 1000; suffix += 1) {
                const candidate = suffix === 1 ? 'Untitled' : `Untitled ${suffix}`;
                try {
                    path = await fileSystem.createFile(candidate, parentPath);
                    break;
                } catch (error) {
                    if (!(error instanceof EntryExistsError)) throw error;
                }
            }
            if (!path) throw new Error('Could not allocate a unique note name.');
            tabs.openTab({
                id: path,
                type: 'markdown',
                title: getBasename(path).replace(/\.md$/i, ''),
                path
            });
            setIsNewNote(true);
            return path;
        } catch (err) {
            console.error('Failed to create note:', err);
            modals.showToast('Failed to create note.');
            return null;
        }
    }, [fileSystem, tabs, setIsNewNote]);

    const handleCreateFolder = useCallback(async (name: string) => {
        if (!modals.state.folder.isOpen) return;
        try {
            const newPath = await fileSystem.createFolder(name, modals.state.folder.parentPath || undefined);
            const shouldMove = modals.state.folder.shouldMove;
            modals.closeFolderModal();

            if (shouldMove && newPath) {
                modals.openMoveModal(newPath, 'directory');
            }
        } catch (err) {
            console.error('Failed to create folder:', err);
            modals.showToast('Failed to create folder.');
        }
    }, [fileSystem, modals]);

    const handleWikilinkClick = useCallback(async (noteName: string, anchor?: string | null, openInSplit = false) => {
        // Same-note anchor: scroll within the current editor
        if (!noteName && anchor) {
            scrollToAnchor(anchor)
            return
        }

        const path = findNotePath(fileSystem.vault.tree, noteName);
        if (path) {
            if (openInSplit) {
                openPathInSplitTab(path)
            } else {
                openPathInMainTab(path)
            }

            // If there's an anchor, scroll to it after a short delay to let content load
            if (anchor) {
                setTimeout(() => scrollToAnchor(anchor), 300)
            }
        } else {
            try {
                const newPath = await fileSystem.createFile(noteName);
                if (openInSplit) {
                    openPathInSplitTab(newPath)
                } else {
                    openPathInMainTab(newPath)
                }
            } catch (err) {
                console.error('Failed to create stub note:', err);
                modals.showToast('Failed to create stub note.');
            }
        }
    }, [fileSystem, openPathInMainTab, openPathInSplitTab]);

    const handleOpenInSplit = useCallback((path: string) => {
        openPathInSplitTab(path)
    }, [openPathInSplitTab])

    const handleOpenNoteInSplit = useCallback(async (noteName: string) => {
        await handleWikilinkClick(noteName, null, true)
    }, [handleWikilinkClick])

    const handleRename = useCallback(async (newName: string) => {
        if (!activeTabId) return;
        const tab = tabs.tabs.find(t => t.id === activeTabId);
        if (!tab || !tab.path) return;

        try {
            await flushAllBeforeMutation();
            const newPath = await fileSystem.renameFile(tab.path, newName);
            remapDocumentSessions(tab.path, newPath);
            const newTitle = getBasename(newPath).replace(/\.md$/, '') || 'Untitled';

            tabs.renameTab(tab.id, newPath, newTitle);
            renderedTabIdRef.current = newPath;
        } catch (err) {
            console.error('Failed to rename file:', err);
            modals.showToast(err instanceof Error ? err.message : 'Failed to rename file.');
        }
    }, [activeTabId, tabs, fileSystem, renderedTabIdRef, flushAllBeforeMutation, modals]);

    const handleSidebarRename = useCallback(async (newName: string) => {
        if (!modals.state.rename.path) return;
        const path = modals.state.rename.path;

        try {
            await flushAllBeforeMutation();
            const newPath = await fileSystem.renameFile(path, newName);
            remapDocumentSessions(path, newPath);
            const normalizedPrefix = `${path.replace(/\\/g, '/').replace(/\/$/, '')}/`;
            const affectedTabs = tabs.tabs.filter(tab => {
                const normalized = tab.path?.replace(/\\/g, '/');
                return tab.path === path || Boolean(normalized?.startsWith(normalizedPrefix));
            });
            for (const tab of affectedTabs) {
                const updatedPath = `${newPath}${tab.path!.slice(path.length)}`;
                const newTitle = getBasename(updatedPath).replace(/\.md$/, '') || 'Untitled';
                tabs.renameTab(tab.id, updatedPath, newTitle);
                if (activeTabId === tab.id) renderedTabIdRef.current = updatedPath;
            }
        } catch (err) {
            console.error('Failed to rename file:', err);
            modals.showToast('Failed to rename file.');
        }
    }, [modals, tabs, activeTabId, fileSystem, renderedTabIdRef, flushAllBeforeMutation]);

    const handleMoveFile = useCallback(async (targetParentPath: string | null) => {
        if (!modals.state.move.sourcePath || !modals.state.move.sourceKind) return;
        const oldPath = modals.state.move.sourcePath;

        const normalizedOldPath = oldPath.replace(/\\/g, '/').replace(/\/$/, '');
        const normalizedTargetParent = targetParentPath?.replace(/\\/g, '/').replace(/\/$/, '');
        if (normalizedTargetParent && (normalizedTargetParent === normalizedOldPath || normalizedTargetParent.startsWith(`${normalizedOldPath}/`))) {
            modals.closeMoveModal();
            console.warn('Cannot move a folder into itself or its own subfolder');
            return;
        }

        try {
            await flushAllBeforeMutation();
            const newPath = await fileSystem.moveFile(oldPath, targetParentPath || undefined);
            remapDocumentSessions(oldPath, newPath);

            const tabsToUpdate = tabs.tabs.filter(t => {
                const normalized = t.path?.replace(/\\/g, '/');
                return t.path === oldPath || Boolean(normalized?.startsWith(`${normalizedOldPath}/`));
            });
            for (const tab of tabsToUpdate) {
                const updatedPath = newPath + tab.path!.slice(oldPath.length);
                const newTitle = getBasename(updatedPath).replace(/\.md$/, '') || 'Untitled';
                tabs.renameTab(tab.id, updatedPath, newTitle);

                if (activeTabId === tab.id) {
                    renderedTabIdRef.current = updatedPath;
                }
            }

            modals.closeMoveModal();
        } catch (err) {
            console.error('Failed to move file/folder:', err);
            modals.showToast('Failed to move file or folder.');
        }
    }, [modals, tabs, activeTabId, fileSystem, renderedTabIdRef, flushAllBeforeMutation]);

    const handleCreateAndMove = useCallback(async (folderName: string) => {
        const sanitized = folderName.trim().replace(/[*"\\/<>:|?]/g, '');
        if (!sanitized) return;

        try {
            const newFolderPath = await fileSystem.createFolder(sanitized);
            await handleMoveFile(newFolderPath);
        } catch (err) {
            console.error('Failed to create folder & move:', err);
            modals.showToast('Failed to create folder and move.');
        }
    }, [fileSystem, handleMoveFile]);

    const handleDeleteFile = useCallback(async (path: string, kind: 'file' | 'directory') => {
        const name = getBasename(path).replace(/\.md$/, '') || path;

        try {
            const confirmed = fileSystem.isTauriEnv
                ? await import('@tauri-apps/plugin-dialog').then(m => m.ask(`Delete "${name}"? This cannot be undone.`, { kind: 'warning' }))
                : window.confirm(`Delete "${name}"? This cannot be undone.`);

            if (confirmed) {
                await flushAllBeforeMutation();
                await fileSystem.deleteFile(path);
                removeDocumentSessions(path);

                const pathPrefixNorm = path.replace(/\\/g, '/') + '/';
                const tabsToClose = tabs.tabs.filter(t =>
                    t.path === path ||
                    (kind === 'directory' && t.path && t.path.replace(/\\/g, '/').startsWith(pathPrefixNorm))
                );
                for (const tab of tabsToClose) {
                    tabs.closeTab(tab.id);
                }
            }
        } catch (err) {
            console.error('Failed to delete file/folder:', err);
            modals.showToast('Failed to delete file or folder.');
        }
    }, [tabs, fileSystem, flushAllBeforeMutation, modals]);

    const handleExportNoteAsPdf = useCallback(async (requestedTabId?: string | null, requestedEditorElement?: HTMLElement | null) => {
        const exportTabId = requestedTabId || activeTabId;
        const activeTab = tabs.tabs.find(t => t.id === exportTabId);
        if (!activeTab || !activeTab.path || activeTab.id === GRAPH_TAB_ID) {
            modals.showToast('Open a note first to export it as PDF.');
            return;
        }

        const editorElement = requestedEditorElement || document.querySelector('.ProseMirror');
        if (!(editorElement instanceof HTMLElement)) {
            modals.showToast('Editor is still loading. Please try again.');
            return;
        }

        try {
            const exported = await exportNoteAsPdf({
                noteTitle: activeTab.title || 'Untitled',
                noteHtml: editorElement.innerHTML,
                isDarkMode: document.documentElement.classList.contains('dark')
            });

            if (fileSystem.isTauriEnv && typeof fileSystem.writeBinaryFile === 'function') {
                const { save } = await import('@tauri-apps/plugin-dialog');
                const suggestedPath = activeTab.path.endsWith('.md')
                    ? activeTab.path.replace(/\.md$/i, '.pdf')
                    : `${activeTab.path}.pdf`;
                const selectedPath = await save({
                    title: 'Export Note as PDF',
                    defaultPath: suggestedPath,
                    filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
                });

                if (!selectedPath) {
                    modals.showToast('PDF export canceled.');
                    return;
                }

                const targetPath = selectedPath.toLowerCase().endsWith('.pdf')
                    ? selectedPath
                    : `${selectedPath}.pdf`;

                await fileSystem.writeBinaryFile(targetPath, exported.bytes);
                const targetName = getBasename(targetPath) || exported.fileName;
                modals.showToast(`Exported ${targetName}`);
            } else {
                const blob = new Blob([exported.bytes as unknown as BlobPart], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = exported.fileName;
                link.rel = 'noopener';
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 0);
                modals.showToast(`Exported ${exported.fileName}`);
            }
        } catch (err) {
            console.error('Failed to export PDF:', err);
            modals.showToast('Failed to export note as PDF.');
        }
    }, [tabs.tabs, activeTabId, modals, fileSystem]);

    return useMemo(() => ({
        handleNewNote,
        handleCreateFolder,
        handleWikilinkClick,
        handleOpenInSplit,
        handleOpenNoteInSplit,
        handleRename,
        handleSidebarRename,
        handleMoveFile,
        handleCreateAndMove,
        handleDeleteFile,
        handleExportNoteAsPdf
    }), [
        handleNewNote,
        handleCreateFolder,
        handleWikilinkClick,
        handleOpenInSplit,
        handleOpenNoteInSplit,
        handleRename,
        handleSidebarRename,
        handleMoveFile,
        handleCreateAndMove,
        handleDeleteFile,
        handleExportNoteAsPdf
    ]);
}

/**
 * Type of the object returned by `useFileOperations`.
 * Use this instead of `any` at every consumer boundary.
 */
export type FileOperationsAPI = ReturnType<typeof useFileOperations>
