import type { FoliumConfig } from '../lib/config'

export interface RuntimeFlags {
    FOLIUM_SYNC_ENABLED: boolean
}

export function resolveRuntimeFlags(config: FoliumConfig): RuntimeFlags {
    const envEnabled = import.meta.env.VITE_FOLIUM_SYNC_ENABLED === 'true'
    const localEnabled = config.sync?.enabled === true

    return {
        FOLIUM_SYNC_ENABLED: envEnabled || localEnabled || true,
    }
}
