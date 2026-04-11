import type { FoliumConfig } from '../lib/config'
import { resolveRuntimeFlags } from '../config/flags'
import { cleanupOrphanedSyncTemps } from './startupCleanup'
import { ensureDeviceCredentials } from './device'

let initializedVaultPaths = new Set<string>()

export async function syncRuntimeForVault(config: FoliumConfig): Promise<void> {
    const flags = resolveRuntimeFlags(config)
    const workspaces = config.workspaces || []
    const shouldEnableSync = flags.FOLIUM_SYNC_ENABLED && workspaces.length > 0

    if (!shouldEnableSync) {
        if (initializedVaultPaths.size > 0) {
            const { syncManager } = await import('./index')
            await syncManager.shutdown()
            initializedVaultPaths.clear()
        }
        return
    }

    const targetPaths = workspaces.map(w => w.path)
    if (targetPaths.length === initializedVaultPaths.size && targetPaths.every(p => initializedVaultPaths.has(p))) {
        return
    }

    for (const ws of workspaces) {
        await cleanupOrphanedSyncTemps(ws.path)
    }

    const { saveConfig } = await import('../lib/config')
    const updatedConfig = ensureDeviceCredentials(config)
    if (updatedConfig !== config) {
        await saveConfig(updatedConfig)
    }

    const { syncManager } = await import('./index')
    syncManager.setConfig(updatedConfig)

    const syncVaultsList = workspaces.map(w => ({ name: w.displayName || 'Vault', path: w.path }))
    await syncManager.initializeMultipleVaults(syncVaultsList)

    initializedVaultPaths.clear()
    for (const ws of workspaces) {
        initializedVaultPaths.add(ws.path)
    }
}

export function isSyncRuntimeEnabledForVault(vaultPath: string | null): boolean {
    if (!vaultPath) return false
    return initializedVaultPaths.has(vaultPath)
}
