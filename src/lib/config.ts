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
    if (!parsed || typeof parsed !== 'object' || !Number.isInteger(parsed.version)) {
        throw new Error('Invalid config format (no supported version)')
    }
    if (parsed.version > DEFAULT_CONFIG.version) {
        throw new Error(`Config version ${parsed.version} is newer than this Folium build supports`)
    }
    if (parsed.workspaces !== undefined && !Array.isArray(parsed.workspaces)) {
        throw new Error('Invalid config format (workspaces must be an array)')
    }
    if (parsed.ui !== undefined && (typeof parsed.ui !== 'object' || Array.isArray(parsed.ui))) {
        throw new Error('Invalid config format (ui must be an object)')
    }

    const workspaces: Workspace[] = (parsed.workspaces || []).filter((workspace: unknown): workspace is Workspace => {
        if (!workspace || typeof workspace !== 'object') return false
        const value = workspace as Record<string, unknown>
        return typeof value.id === 'string'
            && typeof value.path === 'string'
            && typeof value.displayName === 'string'
            && typeof value.lastOpened === 'number'
            && typeof value.createdAt === 'number'
    })
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

type ConfigUpdater = (current: FoliumConfig) => FoliumConfig | void | Promise<FoliumConfig | void>

let configOperationQueue: Promise<unknown> = Promise.resolve()
const loadedSnapshots = new WeakMap<FoliumConfig, FoliumConfig>()

function cloneConfig(config: FoliumConfig): FoliumConfig {
    return JSON.parse(JSON.stringify(config)) as FoliumConfig
}

function enqueueConfigOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = configOperationQueue.then(operation, operation)
    configOperationQueue = result.then(() => undefined, () => undefined)
    return result
}

async function writeConfigStorage(config: FoliumConfig): Promise<void> {
    const serialized = JSON.stringify(config, null, 2)
    if (!isTauri()) {
        localStorage.setItem('folium_config', serialized)
        return
    }
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('write_text_file_atomic', { path: await getConfigPath(), content: serialized })
}

async function preserveCorruptConfig(raw: string, configPath?: string): Promise<void> {
    if (!isTauri()) {
        localStorage.setItem(`folium_config_corrupt_${Date.now()}`, raw)
        return
    }
    if (!configPath) return
    const { rename } = await import('@tauri-apps/plugin-fs')
    await rename(configPath, `${configPath}.corrupt-${Date.now()}`)
}

async function readConfigStorage(): Promise<FoliumConfig> {
    if (!isTauri()) {
        const raw = localStorage.getItem('folium_config')
        if (!raw) {
            const initial = cloneConfig(DEFAULT_CONFIG)
            await writeConfigStorage(initial)
            return initial
        }
        try {
            return await migrateParsedConfig(JSON.parse(raw))
        } catch (error) {
            await preserveCorruptConfig(raw)
            const initial = cloneConfig(DEFAULT_CONFIG)
            await writeConfigStorage(initial)
            console.warn('Preserved corrupt browser configuration and created a new default.', error)
            return initial
        }
    }

    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')
    const configPath = await getConfigPath()
    if (!(await exists(configPath))) {
        const initial = cloneConfig(DEFAULT_CONFIG)
        await writeConfigStorage(initial)
        return initial
    }

    const raw = await readTextFile(configPath)
    try {
        return await migrateParsedConfig(JSON.parse(raw))
    } catch (error) {
        await preserveCorruptConfig(raw, configPath)
        const initial = cloneConfig(DEFAULT_CONFIG)
        await writeConfigStorage(initial)
        console.warn('Preserved corrupt folium.json and created a new default.', error)
        return initial
    }
}

/** Load a consistent configuration snapshot. Mutating callers can still use
 * saveConfig; it applies only fields changed from this snapshot. */
export function loadConfig(): Promise<FoliumConfig> {
    return enqueueConfigOperation(async () => {
        const config = cloneConfig(await readConfigStorage())
        loadedSnapshots.set(config, cloneConfig(config))
        return config
    })
}

/** Serialize a field-level configuration transaction with every other update. */
export function updateConfig(updater: ConfigUpdater): Promise<FoliumConfig> {
    return enqueueConfigOperation(async () => {
        const current = cloneConfig(await readConfigStorage())
        const updated = await updater(current)
        const next = cloneConfig(updated || current)
        await writeConfigStorage(next)
        const result = cloneConfig(next)
        loadedSnapshots.set(result, cloneConfig(result))
        return result
    })
}

/**
 * Save fields changed from a loadConfig snapshot without overwriting unrelated
 * concurrent settings, workspace, or migration updates.
 */
export async function saveConfig(config: FoliumConfig): Promise<void> {
    const original = loadedSnapshots.get(config)
    await updateConfig(current => {
        if (!original) return cloneConfig(config)
        const next = cloneConfig(current)
        for (const key of Object.keys(config) as (keyof FoliumConfig)[]) {
            if (JSON.stringify(config[key]) !== JSON.stringify(original[key])) {
                ;(next as any)[key] = cloneConfigValue(config[key])
            }
        }
        return next
    })
    loadedSnapshots.set(config, cloneConfig(config))
}

function cloneConfigValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}
