import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockWriteTextFile = vi.fn()
const mockWriteFile = vi.fn()
const mockRename = vi.fn()
const mockRemove = vi.fn()

vi.mock('../../lib/config', () => ({
    isTauri: () => true,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeTextFile: mockWriteTextFile,
    writeFile: mockWriteFile,
    rename: mockRename,
    remove: mockRemove,
}))

import { atomicWriteBinary, atomicWriteText } from '../atomicWrite'

describe('atomicWrite helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockRename.mockResolvedValue(undefined)
        mockWriteTextFile.mockResolvedValue(undefined)
        mockWriteFile.mockResolvedValue(undefined)
        mockRemove.mockResolvedValue(undefined)
    })

    it('writes temp text file then renames target', async () => {
        await atomicWriteText('/vault/Note.md', '# Note')
        expect(mockWriteTextFile).toHaveBeenCalledWith('/vault/Note.md.tmp', '# Note')
        expect(mockRename).toHaveBeenCalledWith('/vault/Note.md.tmp', '/vault/Note.md')
    })

    it('writes temp binary file then renames target', async () => {
        await atomicWriteBinary('/vault/Note.yjs', new Uint8Array([1, 2, 3]))
        expect(mockWriteFile).toHaveBeenCalledWith('/vault/Note.yjs.tmp', new Uint8Array([1, 2, 3]))
        expect(mockRename).toHaveBeenCalledWith('/vault/Note.yjs.tmp', '/vault/Note.yjs')
    })

    it('cleans temp file when rename fails', async () => {
        mockRename.mockRejectedValueOnce(new Error('rename failed'))
        await expect(atomicWriteText('/vault/Fail.md', 'data')).rejects.toThrow('rename failed')
        expect(mockRemove).toHaveBeenCalledWith('/vault/Fail.md.tmp')
    })
})
