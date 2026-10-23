import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    getCachePathForImage,
    IMAGE_LOADING_PLACEHOLDER,
    resolveAbsoluteImagePath,
    setImageCacheVaultUid,
    setImageCacheVaultImagePaths,
    setImageCacheVaultRoot,
    subscribeImageCacheUpdates,
} from '../imageCache'

vi.mock('@tauri-apps/api/core', () => ({
    convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
    invoke: vi.fn(),
}))

describe('vault-relative image paths', () => {
    afterEach(() => {
        setImageCacheVaultRoot(null)
        setImageCacheVaultUid(null)
        setImageCacheVaultImagePaths([])
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('resolves an image in an Obsidian assets folder', () => {
        setImageCacheVaultRoot('/vault/Obsidian 1.0')

        expect(resolveAbsoluteImagePath('assets/pixel-banner-image.png'))
            .toBe('/vault/Obsidian 1.0/assets/pixel-banner-image.png')
    })

    it('resolves Windows-style vault-relative paths on every platform', () => {
        setImageCacheVaultRoot('C:\\Users\\user\\Vault')

        expect(resolveAbsoluteImagePath('assets\\pixel-banner-image.png'))
            .toBe('C:/Users/user/Vault/assets/pixel-banner-image.png')
    })

    it('resolves a bare Obsidian image name from the vault-wide image index', () => {
        setImageCacheVaultRoot('/vault/Obsidian 1.0')
        setImageCacheVaultImagePaths([
            '/vault/Obsidian 1.0/assets/Pasted image 20250324153757.png',
        ])

        expect(resolveAbsoluteImagePath('Pasted image 20250324153757.png'))
            .toBe('/vault/Obsidian 1.0/assets/Pasted image 20250324153757.png')
    })

    it('does not include image query strings or fragments in the path', () => {
        setImageCacheVaultRoot('/vault')

        expect(resolveAbsoluteImagePath('assets/image.png#preview?size=small'))
            .toBe('/vault/assets/image.png')
    })

    it('uses a scoped binary read and Blob URL on Linux', async () => {
        vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:folium-image')
        const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

        vi.mocked(invoke).mockImplementation(async (command) => {
            if (command === 'get_cached_image') return null
            if (command === 'generate_cached_image') return null
            if (command === 'read_image_for_display') {
                return new Uint8Array([137, 80, 78, 71]).buffer
            }
            throw new Error(`Unexpected command: ${command}`)
        })

        setImageCacheVaultRoot('/vault')
        setImageCacheVaultUid('vault-id')
        const updates: string[] = []
        const unsubscribe = subscribeImageCacheUpdates((_path, displayUrl) => {
            updates.push(displayUrl)
        })

        expect(getCachePathForImage('attachments/image.png')).toBe(IMAGE_LOADING_PLACEHOLDER)
        await vi.waitFor(() => expect(updates).toContain('blob:folium-image'))
        expect(invoke).toHaveBeenCalledWith('read_image_for_display', {
            path: '/vault/attachments/image.png',
        })
        expect(convertFileSrc).not.toHaveBeenCalled()

        setImageCacheVaultRoot(null)
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:folium-image')

        unsubscribe()
    })
})
