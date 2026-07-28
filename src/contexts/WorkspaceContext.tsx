import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { loadConfig, saveConfig, Workspace } from '../lib/config';
import { BootState } from '../App';
import { runVaultImageMigrationInBackground } from '../lib/vaultImageMigration';
import { getOrCreateVaultUid, resolveWorkspaceIdentity } from '../lib/vaultIdentity';
import type { FileSystemAPI } from '../hooks/useFileSystem';
import type { TabsAPI } from '../hooks/useTabs';

interface WorkspaceContextType {
    workspaces: Workspace[];
    activeWorkspaceId: string | null;
    setWorkspaces: (ws: Workspace[]) => void;
    setActiveWorkspaceId: (id: string | null) => void;
    handleOpenWorkspace: (isLeavingOnboarding?: boolean) => Promise<void>;
    handleSelectWorkspace: (id: string) => Promise<void>;
    handleRemoveWorkspace: (id: string) => Promise<void>;
    handleUpdateWorkspaceName: (id: string, newName: string) => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({
    children,
    fileSystem,
    tabs,
    setBootState,
    showToast
}: {
    children: ReactNode;
    fileSystem: FileSystemAPI;
    tabs: TabsAPI;
    setBootState: (state: BootState) => void;
    showToast: (msg: string) => void;
}) {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

    const handleOpenWorkspace = useCallback(async (isLeavingOnboarding?: boolean) => {
        const result = await fileSystem.openVault();
        if (result) {
            tabs.clearTabs();
            const config = await loadConfig();
            const { workspaceId: id, vaultUid, matchedWorkspace } = await resolveWorkspaceIdentity(config.workspaces || [], result.path);

            let updatedWorkspaces = [...(config.workspaces || [])];
            const existingIndex = updatedWorkspaces.findIndex((workspace) =>
                workspace.vaultUid === vaultUid ||
                workspace.id === id ||
                workspace.path === result.path ||
                (matchedWorkspace ? workspace.id === matchedWorkspace.id : false)
            );

            let newWorkspace: Workspace;
            if (existingIndex >= 0) {
                newWorkspace = {
                    ...updatedWorkspaces[existingIndex],
                    id,
                    vaultUid,
                    path: result.path,
                    lastOpened: Date.now()
                };
                updatedWorkspaces.splice(existingIndex, 1);
            } else {
                newWorkspace = {
                    id,
                    path: result.path,
                    vaultUid,
                    displayName: result.name,
                    lastOpened: Date.now(),
                    createdAt: Date.now()
                };
            }

            // Re-order active to top, prune lowest
            updatedWorkspaces = [newWorkspace, ...updatedWorkspaces].sort((a, b) => b.lastOpened - a.lastOpened);
            if (updatedWorkspaces.length > 7) {
                updatedWorkspaces = updatedWorkspaces.slice(0, 7);
            }

            config.workspaces = updatedWorkspaces;
            config.activeWorkspaceId = id;

            setWorkspaces(updatedWorkspaces);
            setActiveWorkspaceId(id);

            await saveConfig(config);
            setBootState(BootState.ReadyWithWorkspace);
            void runVaultImageMigrationInBackground(result.path, id);

            if (isLeavingOnboarding) {
                showToast('Getting Started notes are still in your Documents folder if you ever want them.');
            }
        }
    }, [fileSystem, tabs, setBootState, showToast]);

    const handleSelectWorkspace = useCallback(async (id: string) => {
        try {
            const config = await loadConfig();
            const targetWorkspace = config.workspaces.find(w => w.id === id);
            if (!targetWorkspace) return;

            tabs.clearTabs();
            // Always route through loadVault() so dynamic fs scope is granted
            // before any read checks are performed by the adapter.
            await fileSystem.loadVault(targetWorkspace.path);
            const vaultUid = await getOrCreateVaultUid(targetWorkspace.path);
            targetWorkspace.vaultUid = vaultUid;

            targetWorkspace.lastOpened = Date.now();
            let updatedWorkspaces = [...config.workspaces]
                .sort((a, b) => b.lastOpened - a.lastOpened)
                .slice(0, 7);

            config.activeWorkspaceId = targetWorkspace.id;
            config.workspaces = updatedWorkspaces;

            setWorkspaces(updatedWorkspaces);
            setActiveWorkspaceId(targetWorkspace.id);
            await saveConfig(config);
            setBootState(BootState.ReadyWithWorkspace);
            void runVaultImageMigrationInBackground(targetWorkspace.path, targetWorkspace.id);
        } catch (err) {
            console.error('Error switching workspace', err);
            showToast('Could not open this vault path. Check that the drive is mounted and try again.');
        }
    }, [fileSystem, tabs, setBootState, showToast]);

    const handleRemoveWorkspace = useCallback(async (id: string) => {
        try {
            const config = await loadConfig();
            const updatedWorkspaces = config.workspaces.filter(w => w.id !== id);

            config.workspaces = updatedWorkspaces;

            if (config.activeWorkspaceId === id) {
                if (updatedWorkspaces.length > 0) {
                    const sortedRemaining = [...updatedWorkspaces].sort((a, b) => b.lastOpened - a.lastOpened);
                    const nextWorkspace = sortedRemaining[0];
                    config.activeWorkspaceId = nextWorkspace.id;

                    tabs.clearTabs();
                    await fileSystem.loadVault(nextWorkspace.path);
                    setActiveWorkspaceId(nextWorkspace.id);
                    setBootState(BootState.ReadyWithWorkspace);
                    void runVaultImageMigrationInBackground(nextWorkspace.path, nextWorkspace.id);
                } else {
                    config.activeWorkspaceId = null;
                    setActiveWorkspaceId(null);
                    setBootState(BootState.ReadyWithoutWorkspace);
                    tabs.clearTabs();
                }
            }

            setWorkspaces(updatedWorkspaces);
            await saveConfig(config);
        } catch (err) {
            console.error('Error removing workspace', err);
            showToast('Could not remove this workspace.');
        }
    }, [fileSystem, tabs, setBootState, showToast]);

    const handleUpdateWorkspaceName = useCallback(async (id: string, newName: string) => {
        try {
            const trimmedName = newName.trim();
            if (!trimmedName) return;

            const config = await loadConfig();
            let updated = false;
            const updatedWorkspaces = config.workspaces.map(w => {
                if (w.id === id) {
                    updated = true;
                    return { ...w, displayName: trimmedName };
                }
                return w;
            });

            if (updated) {
                config.workspaces = updatedWorkspaces;
                await saveConfig(config);
                setWorkspaces(updatedWorkspaces);
            }
        } catch (err) {
            console.error('Error updating workspace name', err);
            showToast('Could not rename this workspace.');
        }
    }, [showToast]);

    return (
        <WorkspaceContext.Provider value={{
            workspaces,
            activeWorkspaceId,
            setWorkspaces,
            setActiveWorkspaceId,
            handleOpenWorkspace,
            handleSelectWorkspace,
            handleRemoveWorkspace,
            handleUpdateWorkspaceName
        }}>
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspace() {
    const ctx = useContext(WorkspaceContext);
    if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
    return ctx;
}
