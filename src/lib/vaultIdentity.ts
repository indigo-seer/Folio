import { hashPath, isTauri, Workspace } from './config'

const FOLIUM_DIRECTORY_NAME = '.folium'
const VAULT_UID_FILENAME = 'vault.uid'
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function createFallbackUuidV4(): string {
    // Fallback only for environments without crypto.randomUUID.
    const bytes = new Uint8Array(16)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes)
    } else {
        for (let i = 0; i < 16; i += 1) {
            bytes[i] = Math.floor(Math.random() * 256)
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join('-')
}

function generateVaultUid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return createFallbackUuidV4()
}

function isValidVaultUid(input: string | null | undefined): input is string {
    if (!input) return false
    return UUID_V4_REGEX.test(input.trim())
}

async function getIdentityPaths(vaultPath: string): Promise<{ foliumDirPath: string; vaultUidFilePath: string }> {
    const { join } = await import('@tauri-apps/api/path')
    const foliumDirPath = await join(vaultPath, FOLIUM_DIRECTORY_NAME)
    const vaultUidFilePath = await join(foliumDirPath, VAULT_UID_FILENAME)
    return { foliumDirPath, vaultUidFilePath }
}

async function ensureVaultScope(vaultPath: string): Promise<void> {
    if (!isTauri()) return
    try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('grant_vault_scope', { path: vaultPath })
    } catch (err) {
        console.warn('[Folium Vault Identity] Failed to grant vault scope for UID access:', vaultPath, err)
    }
}

export async function readVaultUid(vaultPath: string): Promise<string | null> {
    if (!isTauri()) return null

    try {
        await ensureVaultScope(vaultPath)
        const { exists, readTextFile } = await import('@tauri-apps/plugin-fs')
        const { vaultUidFilePath } = await getIdentityPaths(vaultPath)
        if (!(await exists(vaultUidFilePath))) return null
        const raw = (await readTextFile(vaultUidFilePath)).trim()
        return isValidVaultUid(raw) ? raw : null
    } catch (err) {
        console.warn('[Folium Vault Identity] Failed to read vault UID:', vaultPath, err)
        return null
    }
}

export async function getOrCreateVaultUid(vaultPath: string): Promise<string> {
    if (!isTauri()) {
        // Browser mode does not persist workspace identities in-vault.
        return `browser-${await hashPath(vaultPath)}`
    }

    const existing = await readVaultUid(vaultPath)
    if (existing) return existing

    const fallbackUid = `fallback-${await hashPath(vaultPath)}`

    try {
        await ensureVaultScope(vaultPath)
        const { mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs')
        const { foliumDirPath, vaultUidFilePath } = await getIdentityPaths(vaultPath)
        const newVaultUid = generateVaultUid()
        await mkdir(foliumDirPath, { recursive: true })
        await writeTextFile(vaultUidFilePath, `${newVaultUid}\n`)
        return newVaultUid
    } catch (err) {
        console.warn('[Folium Vault Identity] Falling back to path-based UID because .folium/vault.uid is not writable:', vaultPath, err)
        return fallbackUid
    }
}

export async function resolveWorkspaceIdentity(
    existingWorkspaces: Workspace[],
    vaultPath: string
): Promise<{ workspaceId: string; vaultUid: string; matchedWorkspace: Workspace | null }> {
    const workspaceId = await hashPath(vaultPath)
    const vaultUid = await getOrCreateVaultUid(vaultPath)
    const matchedWorkspace = existingWorkspaces.find((workspace) => workspace.vaultUid === vaultUid) || null
    return { workspaceId, vaultUid, matchedWorkspace }
}
