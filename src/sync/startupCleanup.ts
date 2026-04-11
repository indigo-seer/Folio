import { isTauri } from '../lib/config'

export function shouldRemoveTmpFile(name: string, inVaultSyncDir: boolean): boolean {
    if (!name.endsWith('.tmp')) return false
    if (name.endsWith('.yjs.tmp')) return true
    return inVaultSyncDir
}

export async function cleanupOrphanedSyncTemps(vaultPath: string): Promise<void> {
    if (!isTauri()) return

    const { readDir, remove } = await import('@tauri-apps/plugin-fs')
    const { join } = await import('@tauri-apps/api/path')

    async function walk(dirPath: string, inVaultSyncDir: boolean): Promise<void> {
        const entries = await readDir(dirPath).catch(() => [])

        for (const entry of entries) {
            const name = entry.name || ''
            if (!name) continue

            const fullPath = await join(dirPath, name)
            const nextInVaultSyncDir = inVaultSyncDir || name === '.vault-sync'

            if ((entry as any).isDirectory) {
                await walk(fullPath, nextInVaultSyncDir)
                continue
            }

            if ((entry as any).isFile && shouldRemoveTmpFile(name, nextInVaultSyncDir)) {
                await remove(fullPath).catch(() => {})
            }
        }
    }

    await walk(vaultPath, false)
}
