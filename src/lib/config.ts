export const isTauri = (): boolean => {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export interface Workspace {
    // Deprecated: path-derived identifier retained for backward compatibility.
    // Use vaultUid as the stable vault identity moving forward.
    id: string
    path: string
    vaultUid?: string
    displayName: string
    lastOpened: number
    createdAt: number
}

export interface UIConfig {
    theme: 'system' | 'light' | 'dark'
    fontSize: 'compact' | 'default' | 'relaxed'
    focusModeDefault: boolean
    typewriterModeDefault: boolean
    typewriterBlur: boolean
}

export interface SyncConfig {
    enabled: boolean
    deviceId: string | null
}

export interface FoliumConfig {
    version: number
    hasCompletedOnboarding: boolean
    workspaces: Workspace[]
    activeWorkspaceId: string | null
    ui: UIConfig
    sync: SyncConfig
    migrations: {
        imageIngestionByWorkspace: Record<string, number>
        imageIngestionPendingByWorkspace: Record<string, Record<string, string[]>>
    }
}

const DEFAULT_CONFIG: FoliumConfig = {
    version: 1,
    hasCompletedOnboarding: false,
    workspaces: [],
    activeWorkspaceId: null,
    ui: {
        theme: 'system',
        fontSize: 'default',
        focusModeDefault: false,
        typewriterModeDefault: false,
        typewriterBlur: true,
    },
    sync: {
        enabled: false,
        deviceId: null,
    },
    migrations: {
        imageIngestionByWorkspace: {},
        imageIngestionPendingByWorkspace: {},
    },
}

/**
 * Generates a stable deterministic ID from a file path
 */
export async function hashPath(path: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(path)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16)
}

async function migrateParsedConfig(parsed: any): Promise<FoliumConfig> {
    if (!parsed.version) throw new Error('Invalid config format (no version)')

    const workspaces: Workspace[] = parsed.workspaces || []
    let activeWorkspaceId = parsed.activeWorkspaceId !== undefined ? parsed.activeWorkspaceId : null

    // V1 alpha migration from `vault` object to `workspaces` array
    if (parsed.vault && Array.isArray(parsed.vault.recent)) {
        for (const old of parsed.vault.recent) {
            const id = await hashPath(old.path)
            if (!workspaces.find(w => w.id === id)) {
                workspaces.push({
                    id,
                    path: old.path,
                    displayName: old.name,
                    lastOpened: old.lastOpenedAt || Date.now(),
                    createdAt: Date.now()
                })
            }
        }
        if (parsed.vault.lastOpenedVault) {
            const activeId = await hashPath(parsed.vault.lastOpenedVault.path)
            if (activeId) activeWorkspaceId = activeId
        }
    }

    return {
        ...DEFAULT_CONFIG,
        ...parsed,
        // Existing users who already have a config file have already onboarded
        hasCompletedOnboarding: parsed.hasCompletedOnboarding ?? true,
        workspaces,
        activeWorkspaceId,
        ui: { ...DEFAULT_CONFIG.ui, ...parsed.ui },
        sync: { ...DEFAULT_CONFIG.sync, ...parsed.sync },
        migrations: {
            ...DEFAULT_CONFIG.migrations,
            ...parsed.migrations,
            imageIngestionByWorkspace: {
                ...DEFAULT_CONFIG.migrations.imageIngestionByWorkspace,
                ...(parsed.migrations?.imageIngestionByWorkspace || {}),
            },
            imageIngestionPendingByWorkspace: {
                ...DEFAULT_CONFIG.migrations.imageIngestionPendingByWorkspace,
                ...(parsed.migrations?.imageIngestionPendingByWorkspace || {}),
            }
        }
    }
}

/**
 * Returns the resolved path to the config file (e.g. ~/.config/folium/folium.json)
 */
async function getConfigPath(): Promise<string> {
    const { appConfigDir, join } = await import('@tauri-apps/api/path')
    const { exists, mkdir } = await import('@tauri-apps/plugin-fs')

    const configDir = await appConfigDir()
    if (!(await exists(configDir))) {
        await mkdir(configDir, { recursive: true })
    }
    return await join(configDir, 'folium.json')
}

/**
 * Load configuration from disk. Generates default if missing or corrupt.
 */
export async function loadConfig(): Promise<FoliumConfig> {
    try {
        if (!isTauri()) {
            const raw = localStorage.getItem('folium_config')
            if (!raw) {
                localStorage.setItem('folium_config', JSON.stringify(DEFAULT_CONFIG))
                return DEFAULT_CONFIG
            }
            return await migrateParsedConfig(JSON.parse(raw))
        }

        const { readTextFile, writeTextFile, exists } = await import('@tauri-apps/plugin-fs')
        const configPath = await getConfigPath()

        if (!(await exists(configPath))) {
            await writeTextFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2))
            return DEFAULT_CONFIG
        }

        const raw = await readTextFile(configPath)
        return await migrateParsedConfig(JSON.parse(raw))
    } catch (err) {
        console.warn('Failed to load folium.json, falling back to default', err)
        try {
            if (!isTauri()) {
                localStorage.setItem('folium_config', JSON.stringify(DEFAULT_CONFIG))
            } else {
                const { writeTextFile } = await import('@tauri-apps/plugin-fs')
                const configPath = await getConfigPath()
                await writeTextFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2))
            }
        } catch (writeErr) {
            console.error('Failed to write default config', writeErr)
        }
        return DEFAULT_CONFIG
    }
}

/**
 * Save configuration to disk.
 */
export async function saveConfig(config: FoliumConfig): Promise<void> {
    try {
        if (!isTauri()) {
            localStorage.setItem('folium_config', JSON.stringify(config))
            return
        }
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const configPath = await getConfigPath()
        await writeTextFile(configPath, JSON.stringify(config, null, 2))
    } catch (err) {
        console.error('Failed to save config:', err)
    }
}
