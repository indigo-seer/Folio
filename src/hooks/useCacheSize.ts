import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

import { isTauri } from '../lib/config'

const ONE_MB = 1024 * 1024
const ONE_GB = 1024 * 1024 * 1024

export function useCacheSize() {
    const [cacheSizeBytes, setCacheSizeBytes] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [isOpeningFolder, setIsOpeningFolder] = useState(false)

    const refresh = useCallback(async () => {
        if (!isTauri()) {
            setCacheSizeBytes(0)
            return
        }

        setIsLoading(true)
        try {
            const size = await invoke<number>('get_cache_size')
            setCacheSizeBytes(Math.max(0, Number(size || 0)))
        } catch (err) {
            console.warn('[Folium Image Cache] Failed to fetch cache size:', err)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const clearCache = useCallback(async () => {
        if (!isTauri()) return
        setIsLoading(true)
        try {
            await invoke('clear_cache')
            setCacheSizeBytes(0)
            await refresh()
        } catch (err) {
            console.warn('[Folium Image Cache] Failed to clear cache:', err)
            setIsLoading(false)
        }
    }, [refresh])

    const cacheSizeMB = useMemo(() => {
        return Math.round(cacheSizeBytes / ONE_MB)
    }, [cacheSizeBytes])

    const isLarge = cacheSizeBytes > ONE_GB

    const openCacheFolder = useCallback(async () => {
        if (!isTauri()) return
        setIsOpeningFolder(true)
        try {
            await invoke('open_cache_folder')
        } catch (err) {
            console.warn('[Folium Image Cache] Failed to open cache folder:', err)
        } finally {
            setIsOpeningFolder(false)
        }
    }, [])

    return {
        cacheSizeBytes,
        cacheSizeMB,
        isLoading,
        isOpeningFolder,
        isLarge,
        clearCache,
        openCacheFolder,
        refreshCacheSize: refresh,
    }
}
