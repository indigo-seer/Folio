import { useState, useEffect, useCallback, useRef } from 'react';
import { BootState } from '../App';
import { loadConfig, saveConfig, hashPath, Workspace, isTauri } from '../lib/config';
import { createStarterNote, createDefaultVault } from '../lib/onboarding';

export function useAppBootloader(
    fileSystem: any,
    tabs: any,
    setWorkspaces: (ws: Workspace[]) => void,
    setActiveWorkspaceId: (id: string | null) => void,
    setBootState: (state: BootState) => void
) {
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const hasBooted = useRef(false);

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
                            const { exists } = await import('@tauri-apps/plugin-fs');
                            const pathExists = await exists(activeWorkspace.path);

                            if (pathExists) {
                                await fileSystem.loadVault(activeWorkspace.path);
                                setActiveWorkspaceId(activeWorkspace.id);
                                setBootState(BootState.ReadyWithWorkspace);
                                return;
                            } else {
                                console.warn('Configured active workspace path no longer exists:', activeWorkspace.path);
                                config.activeWorkspaceId = null;
                                await saveConfig(config);
                            }
                        } catch (e) {
                            console.warn('Auto-load failed or path invalid, clearing stale workspace', e);
                            config.activeWorkspaceId = null;
                            await saveConfig(config);
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
                vaultName = 'Folio Notes';
            }

            const config = await loadConfig();
            const id = await hashPath(vaultPath);

            const newWorkspace: Workspace = {
                id,
                path: vaultPath,
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
                const title = 'Getting Started with Folio';
                tabs.openTab({ id: starterPath, type: 'markdown', title, path: starterPath });
            }

            setBootState(BootState.ReadyWithWorkspace);
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
