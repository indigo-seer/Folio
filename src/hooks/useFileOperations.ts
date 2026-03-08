import { useCallback, useMemo } from 'react';
import { useModals } from '../contexts/ModalContext';
import { exportNoteAsPdf } from '../lib/pdfExport';

interface UseFileOperationsProps {
    fileSystem: any;
    tabs: any;
    activeTabId: string | null;
    renderedTabIdRef: React.MutableRefObject<string | null>;
    setIsNewNote: (isNew: boolean) => void;
}

function findNotePath(tree: any[], noteName: string): string | null {
    for (const node of tree) {
        if (node.kind === 'file' && node.name === `${noteName}.md`) {
            return node.path;
        }
        if (node.kind === 'directory' && node.children) {
            const found = findNotePath(node.children, noteName);
            if (found) return found;
        }
    }
    return null;
}

export function useFileOperations({ fileSystem, tabs, activeTabId, renderedTabIdRef, setIsNewNote }: UseFileOperationsProps) {
    const modals = useModals();

    const handleNewNote = useCallback(async (parentPath?: string) => {
        try {
            const path = await fileSystem.createFile('Untitled', parentPath);
            tabs.openTab({
                id: path,
                type: 'markdown',
                title: 'Untitled',
                path
            });
            setIsNewNote(true);
            return path;
        } catch (err) {
            console.error('Failed to create note:', err);
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
        }
    }, [fileSystem, modals]);

    const handleWikilinkClick = useCallback(async (noteName: string) => {
        const path = findNotePath(fileSystem.vault.tree, noteName);
        if (path) {
            const title = path.split(/[\/\\]/).pop()?.replace(/\.md$/, '') || 'Untitled';
            tabs.openTab({
                id: path,
                type: 'markdown',
                title,
                path
            });
        } else {
            try {
                const newPath = await fileSystem.createFile(noteName);
                const title = newPath.split(/[\/\\]/).pop()?.replace(/\.md$/, '') || 'Untitled';
                tabs.openTab({
                    id: newPath,
                    type: 'markdown',
                    title,
                    path: newPath
                });
            } catch (err) {
                console.error('Failed to create stub note:', err);
            }
        }
    }, [fileSystem, tabs]);

    const handleRename = useCallback(async (newName: string) => {
        if (!activeTabId) return;
        const tab = tabs.tabs.find((t: any) => t.id === activeTabId);
        if (!tab || !tab.path) return;

        const newPath = await fileSystem.renameFile(tab.path, newName);
        const newTitle = newPath.split(/[\/\\]/).pop()?.replace(/\.md$/, '') || 'Untitled';

        tabs.renameTab(tab.id, newPath, newTitle);
        renderedTabIdRef.current = newPath;
    }, [activeTabId, tabs, fileSystem, renderedTabIdRef]);

    const handleSidebarRename = useCallback(async (newName: string) => {
        if (!modals.state.rename.path) return;
        const path = modals.state.rename.path;

        try {
            const newPath = await fileSystem.renameFile(path, newName);
            const newTitle = newPath.split(/[\/\\]/).pop()?.replace(/\.md$/, '') || 'Untitled';

            const tab = tabs.tabs.find((t: any) => t.path === path);
            if (tab) {
                tabs.renameTab(tab.id, newPath, newTitle);
                if (activeTabId === tab.id) {
                    renderedTabIdRef.current = newPath;
                }
            }
        } catch (err) {
            console.error('Failed to rename file:', err);
        }
    }, [modals.state.rename.path, tabs, activeTabId, fileSystem, renderedTabIdRef]);

    const handleMoveFile = useCallback(async (targetParentPath: string | null) => {
        if (!modals.state.move.sourcePath || !modals.state.move.sourceKind) return;
        const oldPath = modals.state.move.sourcePath;

        if (targetParentPath && (targetParentPath === oldPath || targetParentPath.startsWith(oldPath + '/'))) {
            modals.closeMoveModal();
            console.warn('Cannot move a folder into itself or its own subfolder');
            return;
        }

        try {
            const newPath = await fileSystem.moveFile(oldPath, targetParentPath || undefined);

            const tabsToUpdate = tabs.tabs.filter((t: any) => t.path && (t.path === oldPath || t.path.startsWith(oldPath + '/')));
            for (const tab of tabsToUpdate) {
                const updatedPath = newPath + tab.path!.slice(oldPath.length);
                const newTitle = updatedPath.split(/[\/\\]/).pop()?.replace(/\.md$/, '') || 'Untitled';
                tabs.renameTab(tab.id, updatedPath, newTitle);

                if (activeTabId === tab.id) {
                    renderedTabIdRef.current = updatedPath;
                }
            }

            modals.closeMoveModal();
        } catch (err) {
            console.error('Failed to move file/folder:', err);
        }
    }, [modals, tabs, activeTabId, fileSystem, renderedTabIdRef]);

    const handleCreateAndMove = useCallback(async (folderName: string) => {
        const sanitized = folderName.trim().replace(/[*"\\/<>:|?]/g, '');
        if (!sanitized) return;

        try {
            const newFolderPath = await fileSystem.createFolder(sanitized);
            await handleMoveFile(newFolderPath);
        } catch (err) {
            console.error('Failed to create folder & move:', err);
        }
    }, [fileSystem, handleMoveFile]);

    const handleDeleteFile = useCallback(async (path: string, kind: 'file' | 'directory') => {
        const name = path.split(/[\/\\]/).pop()?.replace(/\.md$/, '') || path;

        try {
            const confirmed = fileSystem.isTauriEnv
                ? await import('@tauri-apps/plugin-dialog').then(m => m.ask(`Delete "${name}"? This cannot be undone.`, { kind: 'warning' }))
                : window.confirm(`Delete "${name}"? This cannot be undone.`);

            if (confirmed) {
                await fileSystem.deleteFile(path);

                const pathPrefixNorm = path.replace(/\\/g, '/') + '/';
                const tabsToClose = tabs.tabs.filter((t: any) =>
                    t.path === path ||
                    (kind === 'directory' && t.path && t.path.replace(/\\/g, '/').startsWith(pathPrefixNorm))
                );
                for (const tab of tabsToClose) {
                    tabs.closeTab(tab.id);
                }
            }
        } catch (err) {
            console.error('Failed to delete file/folder:', err);
        }
    }, [tabs, fileSystem]);

    const handleExportNoteAsPdf = useCallback(async () => {
        const activeTab = tabs.tabs.find((t: any) => t.id === activeTabId);
        if (!activeTab || !activeTab.path || activeTab.id === 'folio-graph') {
            modals.showToast('Open a note first to export it as PDF.');
            return;
        }

        const editorElement = document.querySelector('.ProseMirror');
        if (!(editorElement instanceof HTMLElement)) {
            modals.showToast('Editor is still loading. Please try again.');
            return;
        }

        try {
            await exportNoteAsPdf({
                noteTitle: activeTab.title || 'Untitled',
                noteHtml: editorElement.innerHTML,
                isDarkMode: document.documentElement.classList.contains('dark')
            });
            modals.showToast('Print dialog opened. Choose "Save as PDF".');
        } catch (err) {
            console.error('Failed to export PDF:', err);
            modals.showToast('Failed to export note as PDF.');
        }
    }, [tabs.tabs, activeTabId, modals]);

    return useMemo(() => ({
        handleNewNote,
        handleCreateFolder,
        handleWikilinkClick,
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
        handleRename,
        handleSidebarRename,
        handleMoveFile,
        handleCreateAndMove,
        handleDeleteFile,
        handleExportNoteAsPdf
    ]);
}
