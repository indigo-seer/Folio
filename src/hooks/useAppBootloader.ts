import { useState, useEffect, useCallback, useRef } from 'react';
import { BootState } from '../App';
import { loadConfig, saveConfig, Workspace, isTauri } from '../lib/config';
import { createStarterNote, createDefaultVault } from '../lib/onboarding';
import { sweepOrphanedCache } from '../lib/imageCache';
import { getOrCreateVaultUid, resolveWorkspaceIdentity } from '../lib/vaultIdentity';
import type { FileSystemAPI } from './useFileSystem';
import type { TabsAPI } from './useTabs';

export function useAppBootloader(
    fileSystem: FileSystemAPI,
    tabs: TabsAPI,
    setWorkspaces: (ws: Workspace[]) => void,
    setActiveWorkspaceId: (id: string | null) => void,
    setBootState: (state: BootState) => void
) {
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const hasBooted = useRef(false);
    const hasSweptImageCache = useRef(false);

    useEffect(() => {
        if (hasBooted.current) return;
        hasBooted.current = true;

        const init = async () => {
            try {
                const config = await loadConfig();
                setWorkspaces(config.workspaces || []);

                // First launch onboarding (Tauri only) — show modal instead of booting into vault
                if (!config.hasCompletedOnboarding && isTauri()) {
                    setIsOnboardingOpen(true);
                    // Don't set a boot state yet — the modal will handle it
                    return;
                }

                if (config.activeWorkspaceId) {
                    const activeWorkspace = config.workspaces.find(w => w.id === config.activeWorkspaceId);
                    if (activeWorkspace) {
                        try {
                            // Always route through loadVault() so dynamic fs scope
                            // is granted before any file checks occur.
                            await fileSystem.loadVault(activeWorkspace.path);
                            if (!activeWorkspace.vaultUid) {
                                activeWorkspace.vaultUid = await getOrCreateVaultUid(activeWorkspace.path);
                                await saveConfig(config);
                                setWorkspaces([...config.workspaces]);
                            }
                            setActiveWorkspaceId(activeWorkspace.id);
                            setBootState(BootState.ReadyWithWorkspace);
                            if (!hasSweptImageCache.current) {
                                hasSweptImageCache.current = true;
                                void sweepOrphanedCache();
                            }
                            return;
                        } catch (e) {
                            // Keep the stored active workspace so removable/mounted
                            // paths can auto-recover on next launch without re-adding.
                            console.warn('Auto-load failed for active workspace (keeping config as-is):', activeWorkspace.path, e);
                        }
                    } else {
                        config.activeWorkspaceId = null;
                        await saveConfig(config);
                    }
                }

                setBootState(BootState.ReadyWithoutWorkspace);
            } catch (err) {
                console.error('Fatal boot error processing config', err);
                setBootState(BootState.ReadyWithoutWorkspace);
            }
        };
        init();
    }, [fileSystem, setWorkspaces, setActiveWorkspaceId, setBootState]);

    const handleOnboardingComplete = useCallback(async (mode: 'pick' | 'create') => {
        setIsOnboardingOpen(false);

        try {
            let vaultPath: string;
            let vaultName: string;

            if (mode === 'pick') {
                const result = await fileSystem.openVault();
                if (!result) {
                    setIsOnboardingOpen(true);
                    return;
                }
                vaultPath = result.path;
                vaultName = result.name;
            } else {
                vaultPath = await createDefaultVault();
                await fileSystem.loadVault(vaultPath);
                vaultName = 'Folium Notes';
            }

            const config = await loadConfig();
            const { workspaceId: id, vaultUid } = await resolveWorkspaceIdentity(config.workspaces || [], vaultPath);

            const newWorkspace: Workspace = {
                id,
                path: vaultPath,
                vaultUid,
                displayName: vaultName,
                lastOpened: Date.now(),
                createdAt: Date.now()
            };

            config.workspaces = [newWorkspace];
            config.activeWorkspaceId = id;
            config.hasCompletedOnboarding = true;
            await saveConfig(config);

            setWorkspaces([newWorkspace]);
            setActiveWorkspaceId(id);

            const starterPath = await createStarterNote(vaultPath);

            if (mode === 'create' || starterPath) {
                await fileSystem.loadVault(vaultPath);
            }

            if (starterPath) {
                const title = 'Getting Started with Folium';
                tabs.openTab({ id: starterPath, type: 'markdown', title, path: starterPath });
            }

            setBootState(BootState.ReadyWithWorkspace);
            if (!hasSweptImageCache.current) {
                hasSweptImageCache.current = true;
                void sweepOrphanedCache();
            }
        } catch (err) {
            console.error('Onboarding completion failed:', err);
            const config = await loadConfig();
            config.hasCompletedOnboarding = true;
            await saveConfig(config);
            setBootState(BootState.ReadyWithoutWorkspace);
        }
    }, [fileSystem, tabs, setWorkspaces, setActiveWorkspaceId, setBootState]);

    return {
        isOnboardingOpen,
        handleOnboardingComplete
    };
}
