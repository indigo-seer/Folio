import { describe, expect, it } from 'vitest'
import { buildVaultIndex, extractWikilinks, findNotePath, getNoteTargetForPath, rewriteWikilinkTargets } from '../vaultIndexer'

const duplicateTree = [
    {
        name: 'a', path: '/vault/a', kind: 'directory' as const, children: [
            { name: 'Note.md', path: '/vault/a/Note.md', kind: 'file' as const },
        ],
    },
    {
        name: 'b', path: '/vault/b', kind: 'directory' as const, children: [
            { name: 'Note.md', path: '/vault/b/Note.md', kind: 'file' as const },
        ],
    },
    { name: 'Unique.md', path: '/vault/Unique.md', kind: 'file' as const },
]

describe('vault note index', () => {
    it('normalizes aliases and anchors and ignores links inside code', () => {
        expect(extractWikilinks([
            '[[Target|alias]] [[Target#Heading]]',
            '`[[InlineCode]]`',
            '```md',
            '[[FencedCode]]',
            '```',
            '![[image.png]]',
            '![[Embedded Note]]',
        ].join('\n'))).toEqual(['Target', 'Target', 'Embedded Note'])
    })

    it('keeps duplicate basenames distinct with relative targets', async () => {
        const result = await buildVaultIndex(duplicateTree, async () => '')
        expect([...result.notes].sort()).toEqual(['Unique', 'a/Note', 'b/Note'])
        expect(result.fileMap.get('/vault/a/Note.md')).toBe('a/Note')
        expect(result.fileMap.get('/vault/b/Note.md')).toBe('b/Note')
    })

    it('resolves relative targets exactly and rejects ambiguous basenames', () => {
        expect(findNotePath(duplicateTree, 'a/Note#Heading')).toBe('/vault/a/Note.md')
        expect(findNotePath(duplicateTree, 'Unique')).toBe('/vault/Unique.md')
        expect(findNotePath(duplicateTree, 'Note')).toBeNull()
        expect(getNoteTargetForPath(duplicateTree, '/vault/b/Note.md')).toBe('b/Note')
    })

    it('rewrites aliases and anchors without modifying code or embeds', () => {
        const source = '[[a/Note#Heading|alias]] `[[a/Note]]` ![[a/Note]] ![[a/Note.png]]'
        expect(rewriteWikilinkTargets(source, 'a/Note', 'a/Renamed')).toBe(
            '[[a/Renamed#Heading|alias]] `[[a/Note]]` ![[a/Renamed]] ![[a/Note.png]]',
        )
    })
})
