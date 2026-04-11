import { join } from '@tauri-apps/api/path'
import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs'

export interface VaultInfo {
    name: string
    path: string
    createdAt: string
    deviceId: string
}

export interface VaultManifest {
    vaults: VaultInfo[]
}

const VAULT_REGISTRY_FILENAME = 'vaults.json'

export async function getVaultManifest(vaultPath: string): Promise<VaultManifest | null> {
    try {
        const manifestPath = await join(vaultPath, '.vault-sync', VAULT_REGISTRY_FILENAME)
        const content = await readTextFile(manifestPath)
        return JSON.parse(content) as VaultManifest
    } catch {
        return null
    }
}

export async function saveVaultManifest(vaultPath: string, manifest: VaultManifest): Promise<void> {
    const syncDir = await join(vaultPath, '.vault-sync')
    const syncDirExists = await exists(syncDir)
    if (!syncDirExists) {
        await mkdir(syncDir, { recursive: true })
    }
    const manifestPath = await join(syncDir, VAULT_REGISTRY_FILENAME)
    await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2))
}

export async function addVaultToManifest(
    vaultPath: string,
    vaultName: string,
    deviceId: string
): Promise<void> {
    const existing = await getVaultManifest(vaultPath)
    const vaultInfo: VaultInfo = {
        name: vaultName,
        path: vaultName,
        createdAt: new Date().toISOString(),
        deviceId,
    }

    if (existing) {
        const alreadyExists = existing.vaults.some(v => v.name === vaultName && v.path === vaultName)
        if (!alreadyExists) {
            existing.vaults.push(vaultInfo)
            await saveVaultManifest(vaultPath, existing)
        }
    } else {
        const manifest: VaultManifest = { vaults: [vaultInfo] }
        await saveVaultManifest(vaultPath, manifest)
    }
}

export async function removeVaultFromManifest(vaultPath: string, vaultName: string): Promise<void> {
    const existing = await getVaultManifest(vaultPath)
    if (existing) {
        existing.vaults = existing.vaults.filter(v => v.name !== vaultName)
        await saveVaultManifest(vaultPath, existing)
    }
}

export async function discoverLocalVaults(vaultPaths: string[]): Promise<VaultInfo[]> {
    const vaults: VaultInfo[] = []
    
    for (const vaultPath of vaultPaths) {
        const manifest = await getVaultManifest(vaultPath)
        if (manifest) {
            vaults.push(...manifest.vaults)
        } else {
            const vaultName = vaultPath.split(/[/\\]/).pop() || 'vault'
            vaults.push({
                name: vaultName,
                path: vaultName,
                createdAt: new Date().toISOString(),
                deviceId: 'local',
            })
        }
    }
    
    return vaults
}

export async function mergeVaultManifests(
    localVaults: VaultInfo[],
    peerVaults: VaultInfo[]
): Promise<{ allVaults: VaultInfo[]; newVaults: VaultInfo[] }> {
    const localVaultKeys = new Set(localVaults.map(v => `${v.name}:${v.path}`))
    
    const newVaults = peerVaults.filter(v => !localVaultKeys.has(`${v.name}:${v.path}`))
    const allVaults = [...localVaults, ...newVaults]
    
    return { allVaults, newVaults }
}

export async function getDefaultVaultPath(vaultName: string): Promise<string> {
    const { documentDir } = await import('@tauri-apps/api/path')
    const basePath = await documentDir()
    return await join(basePath, 'Folium', 'vaults', vaultName)
}

export function isVaultNameValid(name: string): boolean {
    if (!name || name.trim().length === 0) return false
    const invalidChars = /[<>:"/\\|?*]/
    return !invalidChars.test(name)
}