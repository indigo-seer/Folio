import { useMemo } from 'react';
import { useModals } from '../contexts/ModalContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { QuickSwitcher, QuickSwitcherCommand, UnifiedItem } from './QuickSwitcher';
import { ContextMenu } from './ContextMenu';
import { RenameModal } from './RenameModal';
import { MoveModal } from './MoveModal';
import { SettingsModal } from './SettingsModal';
import { Toast } from './Toast';

interface ModalRootProps {
    activeTabId: string | null;
    tabs: any;
    fileSystem: any;
    fileOperations: any;
}

export function ModalRoot({
    activeTabId,
    tabs,
    fileSystem,
    fileOperations
}: ModalRootProps) {
    const modals = useModals();
    const { workspaces, activeWorkspaceId, handleRemoveWorkspace, handleUpdateWorkspaceName } = useWorkspace();

    const quickSwitcherCommands = useMemo<QuickSwitcherCommand[]>(() => {
        const baseCommands: QuickSwitcherCommand[] = [
            { id: 'new-note', label: 'Create New Note...', icon: <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg> },
            { id: 'new-folder', label: 'Create New Folder...', icon: <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg> }
        ]
        if (activeTabId) {
            baseCommands.push(
                { id: 'move-note', label: 'Move Current Note...', icon: <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l2 2 2-2" /><path d="M5 22h14c1.1 0 2-.9 2-2V7.5L14.5 2H6c-1.1 0-2 .9-2 2v4" /><polyline points="14 2 14 8 20 8" /></svg> },
                { id: 'delete-note', label: 'Delete Current Note...', icon: <svg className="w-full h-full text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> }
            )
        }
        return baseCommands
    }, [activeTabId]);

    const handleQuickSwitcherSelect = (item: UnifiedItem) => {
        modals.closeQuickSwitcher();
        if (item.type === 'note') {
            fileOperations.handleWikilinkClick(item.name);
        } else if (item.type === 'command') {
            switch (item.id) {
                case 'new-note':
                    fileOperations.handleNewNote();
                    break;
                case 'new-folder':
                    modals.openFolderModal(null, true);
                    break;
                case 'move-note':
                    if (activeTabId) {
                        const path = tabs.tabs.find((t: any) => t.id === activeTabId)?.path;
                        if (path) {
                            modals.openMoveModal(path, 'file');
                        }
                    }
                    break;
                case 'delete-note':
                    if (activeTabId) {
                        const path = tabs.tabs.find((t: any) => t.id === activeTabId)?.path;
                        if (path) {
                            fileOperations.handleDeleteFile(path, 'file');
                        }
                    }
                    break;
            }
        }
    };

    return (
        <>
            <QuickSwitcher
                isOpen={modals.state.quickSwitcher}
                commands={quickSwitcherCommands}
                onClose={modals.closeQuickSwitcher}
                onSelect={handleQuickSwitcherSelect}
            />

            {modals.state.contextMenu.isOpen && (
                <ContextMenu
                    x={modals.state.contextMenu.x}
                    y={modals.state.contextMenu.y}
                    onClose={modals.closeContextMenu}
                    actions={[
                        ...(modals.state.contextMenu.kind === 'root' || modals.state.contextMenu.kind === 'directory' ? [
                            {
                                label: 'New Note',
                                onClick: () => fileOperations.handleNewNote(modals.state.contextMenu.path || undefined)
                            },
                            {
                                label: 'New Folder',
                                onClick: () => modals.openFolderModal(modals.state.contextMenu.path)
                            }
                        ] : []),
                        ...(modals.state.contextMenu.kind === 'file' || modals.state.contextMenu.kind === 'directory' ? [
                            {
                                label: 'Rename',
                                onClick: () => {
                                    const filename = modals.state.contextMenu.path!.split(/[\/\\]/).pop() || '';
                                    modals.openRenameModal(modals.state.contextMenu.path!, filename);
                                },
                                disabled: !fileSystem.isTauriEnv && modals.state.contextMenu.kind === 'directory'
                            },
                            {
                                label: 'Move to...',
                                onClick: () => {
                                    modals.openMoveModal(modals.state.contextMenu.path!, modals.state.contextMenu.kind as 'file' | 'directory');
                                },
                                disabled: !fileSystem.isTauriEnv && modals.state.contextMenu.kind === 'directory'
                            },
                            {
                                label: 'Delete',
                                onClick: () => fileOperations.handleDeleteFile(modals.state.contextMenu.path!, modals.state.contextMenu.kind as 'file' | 'directory'),
                                danger: true
                            }
                        ] : [])
                    ]}
                />
            )}

            {modals.state.rename.isOpen && modals.state.rename.path && (
                <RenameModal
                    initialName={modals.state.rename.initialName}
                    isFolder={modals.state.contextMenu.kind === 'directory' && modals.state.contextMenu.path === modals.state.rename.path}
                    title={modals.state.contextMenu.kind === 'directory' && modals.state.contextMenu.path === modals.state.rename.path ? 'Rename folder' : 'Rename note'}
                    placeholder={modals.state.contextMenu.kind === 'directory' && modals.state.contextMenu.path === modals.state.rename.path ? 'Folder name' : 'Note name'}
                    onRename={fileOperations.handleSidebarRename}
                    onClose={modals.closeRenameModal}
                />
            )}

            {modals.state.folder.isOpen && (
                <RenameModal
                    initialName=""
                    title="Create new folder"
                    actionLabel="Create Folder"
                    placeholder="Folder name"
                    onRename={fileOperations.handleCreateFolder}
                    onClose={modals.closeFolderModal}
                />
            )}

            {modals.state.move.isOpen && modals.state.move.sourcePath && (
                <MoveModal
                    tree={fileSystem.vault.tree}
                    sourcePath={modals.state.move.sourcePath}
                    sourceKind={modals.state.move.sourceKind!}
                    onClose={modals.closeMoveModal}
                    onMove={fileOperations.handleMoveFile}
                    onCreateAndMove={fileOperations.handleCreateAndMove}
                />
            )}

            {modals.state.settings && (
                <SettingsModal
                    onClose={modals.closeSettings}
                    workspaces={workspaces}
                    activeWorkspaceId={activeWorkspaceId}
                    onRemoveWorkspace={(id) => handleRemoveWorkspace(id)}
                    onUpdateWorkspaceName={handleUpdateWorkspaceName}
                />
            )}

            {modals.state.toast && (
                <Toast
                    message={modals.state.toast}
                    onDismiss={modals.hideToast}
                />
            )}
        </>
    );
}
