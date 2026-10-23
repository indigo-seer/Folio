import { beforeEach, describe, expect, it, vi } from 'vitest'

const disk = vi.hoisted(() => new Map<string, string>())

vi.mock('@tauri-apps/api/path', () => ({ sep: async () => '/' }))
vi.mock('@tauri-apps/plugin-fs', () => ({
    exists: async (path: string) => disk.has(path),
    writeTextFile: async (path: string, text: string, options?: { createNew?: boolean }) => {
        if (options?.createNew && disk.has(path)) throw new Error('already exists')
        disk.set(path, text)
    },
    rename: async (from: string, to: string) => {
        if (disk.has(to)) throw new Error('already exists')
        disk.set(to, disk.get(from) || '')
        disk.delete(from)
    },
}))

import { browserFs } from '../browserAdapter'
import { tauriFs } from '../tauriAdapter'

beforeEach(() => disk.clear())

describe('safe filesystem mutations', () => {
    it('creates notes exclusively instead of truncating an existing note', async () => {
        disk.set('/vault/Untitled.md', 'valuable text')
        await expect(tauriFs.createFile('/vault', 'Untitled')).rejects.toThrow('already exists')
        expect(disk.get('/vault/Untitled.md')).toBe('valuable text')
    })

    it('rejects create traversal before touching the filesystem', async () => {
        await expect(tauriFs.createFile('/vault', '../outside')).rejects.toThrow()
        expect(disk.size).toBe(0)
    })

    it('does not overwrite a rename destination', async () => {
        disk.set('/vault/A.md', 'A')
        disk.set('/vault/B.md', 'B')
        await expect(tauriFs.renameFile('/vault/A.md', 'B')).rejects.toThrow('already exists')
        expect(disk.get('/vault/A.md')).toBe('A')
        expect(disk.get('/vault/B.md')).toBe('B')
    })

    it('uses browser scan paths directly for later operations', async () => {
        let removed = ''
        const fileHandle = { getFile: async () => ({ text: async () => 'A' }) }
        const root = {
            name: 'Vault',
            async *values() { yield { kind: 'file', name: 'A.md', ...fileHandle } },
            getFileHandle: async (name: string) => {
                if (name === 'A.md') return fileHandle
                throw new Error('not found')
            },
            getDirectoryHandle: async () => { throw new Error('not found') },
            removeEntry: async (name: string) => { removed = name },
        }
        vi.stubGlobal('window', { showDirectoryPicker: async () => root })

        const selected = await browserFs.openVault()
        const tree = await browserFs.scanDirectory(selected!.path)
        expect(tree[0].path).toBe('A.md')
        await browserFs.deleteFile(tree[0].path)
        expect(removed).toBe('A.md')
    })

    it('serializes browser note creation so concurrent creates cannot truncate', async () => {
        const files = new Map<string, { content: string }>()
        const root = {
            name: 'Vault',
            async *values() { /* empty */ },
            getDirectoryHandle: async () => { throw new Error('not found') },
            getFileHandle: async (name: string, options?: { create?: boolean }) => {
                let entry = files.get(name)
                if (!entry && !options?.create) throw new Error('not found')
                if (!entry) {
                    entry = { content: '' }
                    files.set(name, entry)
                }
                const captured = entry
                return {
                    getFile: async () => ({ text: async () => captured.content }),
                    createWritable: async () => ({
                        write: async (content: string) => { captured.content = content },
                        close: async () => undefined,
                    }),
                }
            },
            removeEntry: async () => undefined,
        }
        vi.stubGlobal('window', { showDirectoryPicker: async () => root })
        await browserFs.openVault()

        const [first, second] = await Promise.allSettled([
            browserFs.createFile('Vault', 'Untitled'),
            browserFs.createFile('Vault', 'Untitled'),
        ])

        expect([first.status, second.status].sort()).toEqual(['fulfilled', 'rejected'])
        expect(files.size).toBe(1)
    })
})
