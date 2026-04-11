import type { FoliumConfig } from '../lib/config'
import { resolveRuntimeFlags } from '../config/flags'
import { cleanupOrphanedSyncTemps } from './startupCleanup'
import { ensureDeviceCredentials } from './device'

let initializedVaultPath: string | null = null

export async function syncRuntimeForVault(vaultPath: string | null, config: FoliumConfig): Promise<void> {
    const flags = resolveRuntimeFlags(config)
    const shouldEnableSync = flags.FOLIUM_SYNC_ENABLED && !!vaultPath

    if (!shouldEnableSync) {
        if (initializedVaultPath) {
            const { syncManager } = await import('./index')
            await syncManager.shutdown()
            initializedVaultPath = null
        }
        return
    }

    if (initializedVaultPath === vaultPath) {
        return
    }

    await cleanupOrphanedSyncTemps(vaultPath)
    
    const { saveConfig } = await import('../lib/config')
    const updatedConfig = ensureDeviceCredentials(config)
    if (updatedConfig !== config) {
        await saveConfig(updatedConfig)
    }
    
    const { syncManager } = await import('./index')
    syncManager.setConfig(updatedConfig)
    await syncManager.initialize(vaultPath!)
    initializedVaultPath = vaultPath
}

export function isSyncRuntimeEnabledForVault(vaultPath: string | null): boolean {
    if (!vaultPath) return false
    return initializedVaultPath === vaultPath
}
