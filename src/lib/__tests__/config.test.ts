import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig, saveConfig, updateConfig } from '../config'

const storage = new Map<string, string>()
const localStorageMock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() { return storage.size },
}

beforeEach(() => {
    storage.clear()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', localStorageMock)
})

describe('configuration store', () => {
    it('merges changes from stale snapshots without erasing unrelated fields', async () => {
        const workspaceSnapshot = await loadConfig()
        const settingsSnapshot = await loadConfig()
        workspaceSnapshot.workspaces = [{
            id: 'one',
            path: '/vault',
            displayName: 'Vault',
            lastOpened: 1,
            createdAt: 1,
        }]
        settingsSnapshot.ui.theme = 'dark'

        await Promise.all([saveConfig(workspaceSnapshot), saveConfig(settingsSnapshot)])
        const result = await loadConfig()

        expect(result.workspaces).toHaveLength(1)
        expect(result.ui.theme).toBe('dark')
    })

    it('serializes field-level transactions', async () => {
        await Promise.all([
            updateConfig(config => { config.activeWorkspaceId = 'active' }),
            updateConfig(config => { config.ui.fontSize = 'relaxed' }),
        ])

        await expect(loadConfig()).resolves.toMatchObject({
            activeWorkspaceId: 'active',
            ui: { fontSize: 'relaxed' },
        })
    })

    it('backs up malformed configuration before replacing it', async () => {
        storage.set('folium_config', '{not-json')
        const result = await loadConfig()

        expect(result.version).toBe(1)
        expect([...storage.keys()].some(key => key.startsWith('folium_config_corrupt_'))).toBe(true)
    })

    it('surfaces persistence failures', async () => {
        vi.stubGlobal('localStorage', {
            ...localStorageMock,
            setItem: () => { throw new Error('disk full') },
        })
        await expect(updateConfig(config => { config.ui.theme = 'light' })).rejects.toThrow('disk full')
    })
})
