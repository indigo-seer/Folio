import { describe, expect, it, vi } from 'vitest'
import {
    flushDocumentSession,
    getDocumentSession,
    openDocumentSession,
    updateDocumentDraft,
} from '../documentSessions'

describe('document save coordinator', () => {
    it('does not write a document that was only viewed', async () => {
        const path = '/vault/viewed.md'
        openDocumentSession(path, 'unchanged')
        const writeFile = vi.fn(async () => {})

        const result = await flushDocumentSession(path, {
            readFile: async () => 'unchanged',
            writeFile,
        })

        expect(result.status).toBe('clean')
        expect(writeFile).not.toHaveBeenCalled()
    })

    it('flushes by document path even after its tab is gone', async () => {
        const path = '/vault/closed.md'
        let disk = 'before'
        openDocumentSession(path, disk)
        updateDocumentDraft(path, 'after')

        const result = await flushDocumentSession(path, {
            readFile: async () => disk,
            writeFile: async (_path, content) => { disk = content },
        })

        expect(result.status).toBe('saved')
        expect(disk).toBe('after')
        expect(getDocumentSession(path)?.dirty).toBe(false)
    })

    it('preserves a dirty recovery draft when the disk changed externally', async () => {
        const path = '/vault/conflict.md'
        openDocumentSession(path, 'baseline')
        updateDocumentDraft(path, 'local edit')

        const result = await flushDocumentSession(path, {
            readFile: async () => 'external edit',
            writeFile: async () => { throw new Error('must not write') },
        })

        expect(result.status).toBe('conflict')
        expect(getDocumentSession(path)).toMatchObject({ draft: 'local edit', dirty: true })
    })

    it('serializes writes and keeps edits made during an in-flight save dirty', async () => {
        const path = '/vault/ordered.md'
        let disk = 'baseline'
        let notifyFirstWriteStarted!: () => void
        let releaseFirstWrite!: () => void
        const firstWriteStarted = new Promise<void>(resolve => { notifyFirstWriteStarted = resolve })
        const firstWriteGate = new Promise<void>(resolve => { releaseFirstWrite = resolve })
        let writes = 0
        openDocumentSession(path, disk)
        updateDocumentDraft(path, 'first edit')

        const io = {
            readFile: async () => disk,
            writeFile: async (_path: string, content: string) => {
                writes += 1
                if (writes === 1) {
                    notifyFirstWriteStarted()
                    await firstWriteGate
                }
                disk = content
            },
        }
        const first = flushDocumentSession(path, io)
        await firstWriteStarted
        updateDocumentDraft(path, 'second edit')
        const second = flushDocumentSession(path, io)
        releaseFirstWrite()

        await expect(first).resolves.toMatchObject({ status: 'saved' })
        await expect(second).resolves.toMatchObject({ status: 'saved' })
        expect(disk).toBe('second edit')
        expect(getDocumentSession(path)?.dirty).toBe(false)
    })
})
