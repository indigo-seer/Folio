import { describe, expect, it } from 'vitest'
import { shouldRemoveTmpFile } from '../startupCleanup'

describe('shouldRemoveTmpFile', () => {
    it('removes yjs tmp files anywhere in vault', () => {
        expect(shouldRemoveTmpFile('note.yjs.tmp', false)).toBe(true)
    })

    it('removes tmp files under .vault-sync', () => {
        expect(shouldRemoveTmpFile('merge_log.tmp', true)).toBe(true)
    })

    it('keeps non-sync tmp files outside sync directory', () => {
        expect(shouldRemoveTmpFile('notes-cache.tmp', false)).toBe(false)
    })

    it('ignores non tmp files', () => {
        expect(shouldRemoveTmpFile('note.yjs', true)).toBe(false)
    })
})
