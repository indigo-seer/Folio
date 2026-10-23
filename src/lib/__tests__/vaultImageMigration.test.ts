import { describe, expect, it } from 'vitest'
import { migrateNoteContent } from '../vaultImageMigration'

describe('vault image migration', () => {
    it('rewrites image syntax outside code while preserving examples byte-for-byte', async () => {
        const source = [
            '![real](https://example.com/real.png)',
            '',
            '`![inline](https://example.com/inline.png)`',
            '',
            '```md',
            '![fenced](https://example.com/fenced.png)',
            '```',
        ].join('\n')

        const result = await migrateNoteContent(source, async imageSource => ({
            replacement: imageSource.endsWith('real.png') ? 'attachments/real.png' : 'attachments/wrong.png',
            pending: false,
        }))

        expect(result.changed).toBe(true)
        expect(result.output).toBe(source.replace(
            'https://example.com/real.png',
            'attachments/real.png',
        ))
    })
})
