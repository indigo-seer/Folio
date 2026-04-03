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
    focusedPane?: 'main' | 'split';
    tabs: any;
    fileSystem: any;
    fileOperations: any;
}

export function ModalRoot({
    activeTabId,
    focusedPane = 'main',
    tabs,
    fileSystem,
    fileOperations
}: ModalRootProps) {
    const modals = useModals();
    const { workspaces, activeWorkspaceId, handleRemoveWorkspace, handleUpdateWorkspaceName } = useWorkspace();

    const quickSwitcherCommands = useMemo<QuickSwitcherCommand[]>(() => {
        const activeTab = tabs.tabs.find((t: any) => t.id === activeTabId);
        const hasActiveMarkdownTab = Boolean(activeTab && activeTab.path && activeTab.id !== 'folium-graph');

        const baseCommands: QuickSwitcherCommand[] = [
            { id: 'new-note', label: 'Create New Note...', icon: <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg> },
            { id: 'new-folder', label: 'Create New Folder...', icon: <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg> }
        ]
        if (tabs.splitTabId) {
            baseCommands.push(
                {
                    id: 'close-split-pane',
                    label: 'Close Split Pane',
                    icon: <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="16" y1="9" x2="19" y2="12" /><line x1="19" y1="12" x2="16" y2="15" /></svg>
                }
            )
        }
        if (hasActiveMarkdownTab) {
            baseCommands.push(
                { id: 'open-current-note-in-split', label: 'Open Current Note in Split', icon: <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="12" y1="4" x2="12" y2="20" /><polyline points="16 11 18 13 16 15" /></svg> },
                { id: 'export-note-pdf', label: 'Export Current Note as PDF...', icon: <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15h6" /><path d="M9 19h6" /></svg> },
                { id: 'move-note', label: 'Move Current Note...', icon: <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l2 2 2-2" /><path d="M5 22h14c1.1 0 2-.9 2-2V7.5L14.5 2H6c-1.1 0-2 .9-2 2v4" /><polyline points="14 2 14 8 20 8" /></svg> },
                { id: 'delete-note', label: 'Delete Current Note...', icon: <svg className="w-full h-full text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> }
            )
        }
        return baseCommands
    }, [activeTabId, tabs.tabs, tabs.splitTabId]);

    const handleQuickSwitcherSelect = (item: UnifiedItem) => {
        modals.closeQuickSwitcher();
        if (item.type === 'note') {
            if (focusedPane === 'split' && tabs.splitTabId) {
                fileOperations.handleOpenNoteInSplit(item.name);
            } else {
                fileOperations.handleWikilinkClick(item.name);
            }
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
                case 'export-note-pdf':
                    fileOperations.handleExportNoteAsPdf();
                    break;
                case 'open-current-note-in-split':
                    if (activeTabId) {
                        const path = tabs.tabs.find((t: any) => t.id === activeTabId)?.path
                        if (path) {
                            fileOperations.handleOpenInSplit(path)
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
                case 'close-split-pane':
                    tabs.closeSplitTab();
                    break;
            }
        }
    };

    const handleQuickSwitcherSelectInSplit = (item: UnifiedItem) => {
        modals.closeQuickSwitcher();
        if (item.type === 'note') {
            fileOperations.handleOpenNoteInSplit(item.name);
            return;
        }
        if (item.type === 'command') {
            if (item.id === 'close-split-pane') {
                tabs.closeSplitTab();
            } else {
                handleQuickSwitcherSelect(item);
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
                onSelectInSplit={handleQuickSwitcherSelectInSplit}
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
                            ...(modals.state.contextMenu.kind === 'file' ? [
                                {
                                    label: 'Open in Split',
                                    onClick: () => fileOperations.handleOpenInSplit(modals.state.contextMenu.path!)
                                }
                            ] : []),
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
