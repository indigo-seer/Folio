import { afterEach, describe, expect, it } from 'vitest'
import { syncManager } from '../SyncManager'

describe('syncManager lifecycle', () => {
    afterEach(async () => {
        await syncManager.shutdown()
    })

    it('enables and disables status across initialize/shutdown', async () => {
        await syncManager.initialize('/tmp/folium-test-vault')
        expect(syncManager.getStatus().enabled).toBe(true)
        expect(syncManager.getStatus().vaultPath).toBe('/tmp/folium-test-vault')

        await syncManager.shutdown()
        expect(syncManager.getStatus().enabled).toBe(false)
        expect(syncManager.getStatus().vaultPath).toBe(null)
    })
})
