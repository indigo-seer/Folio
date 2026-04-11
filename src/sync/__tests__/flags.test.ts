import { describe, expect, it, vi } from 'vitest'
import { resolveRuntimeFlags } from '../../config/flags'
import type { FoliumConfig } from '../../lib/config'

function makeConfig(syncEnabled: boolean): FoliumConfig {
    return {
        version: 1,
        hasCompletedOnboarding: true,
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
            enabled: syncEnabled,
            deviceId: null,
            deviceName: null,
            deviceSecret: null,
            pairedDevices: [],
        },
        migrations: {
            imageIngestionByWorkspace: {},
            imageIngestionPendingByWorkspace: {},
        },
    }
}

describe('resolveRuntimeFlags', () => {
    it('enables sync when local config is enabled', () => {
        vi.stubEnv('VITE_FOLIUM_SYNC_ENABLED', 'false')
        const flags = resolveRuntimeFlags(makeConfig(true))
        expect(flags.FOLIUM_SYNC_ENABLED).toBe(true)
    })

    it('enables sync when environment variable is enabled', () => {
        vi.stubEnv('VITE_FOLIUM_SYNC_ENABLED', 'true')
        const flags = resolveRuntimeFlags(makeConfig(false))
        expect(flags.FOLIUM_SYNC_ENABLED).toBe(true)
    })

    it('keeps sync disabled by default', () => {
        vi.stubEnv('VITE_FOLIUM_SYNC_ENABLED', 'false')
        const flags = resolveRuntimeFlags(makeConfig(false))
        expect(flags.FOLIUM_SYNC_ENABLED).toBe(false)
    })
})
