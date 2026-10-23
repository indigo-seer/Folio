import { describe, expect, it } from 'vitest'
import { assertPathWithinRoot, markdownFilename, validateEntryName } from '../pathSafety'

describe('filesystem path validation', () => {
    it('rejects traversal and platform-unsafe names', () => {
        for (const name of ['../outside', '..\\outside', 'A/B', 'A\\B', 'CON', 'bad:name']) {
            expect(() => validateEntryName(name)).toThrow()
        }
    })

    it('normalizes Markdown extensions without accepting path components', () => {
        expect(markdownFilename('Note')).toBe('Note.md')
        expect(markdownFilename('Note.MD')).toBe('Note.MD')
        expect(() => markdownFilename('../Note')).toThrow()
    })

    it('accepts descendants and rejects paths outside a vault', () => {
        expect(assertPathWithinRoot('/vault', '/vault/folder')).toBe('/vault/folder')
        expect(() => assertPathWithinRoot('/vault', '/vault-other')).toThrow()
        expect(() => assertPathWithinRoot('/vault', '/vault/../outside')).toThrow()
        expect(assertPathWithinRoot('C:\\Vault', 'c:\\vault\\Notes')).toBe('c:/vault/Notes')
    })
})
