import { afterEach, describe, expect, it } from 'vitest'

import {
    resolveAbsoluteImagePath,
    setImageCacheVaultImagePaths,
    setImageCacheVaultRoot,
} from '../imageCache'

describe('vault-relative image paths', () => {
    afterEach(() => {
        setImageCacheVaultRoot(null)
        setImageCacheVaultImagePaths([])
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
})
