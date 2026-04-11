import * as Y from 'yjs'
import { fs } from '../lib/fs'
import { isTauri } from '../lib/config'
import { atomicWriteBinary } from './atomicWrite'

function toYjsPath(markdownPath: string): string {
    return markdownPath.endsWith('.md')
        ? `${markdownPath.slice(0, -3)}.yjs`
        : `${markdownPath}.yjs`
}

async function yjsExists(path: string): Promise<boolean> {
    if (isTauri()) {
        const { exists } = await import('@tauri-apps/plugin-fs')
        return exists(path)
    }

    if (!fs.readBinaryFile) return false
    try {
        await fs.readBinaryFile(path)
        return true
    } catch {
        return false
    }
}

class YjsVault {
    getYjsPath(markdownPath: string): string {
        return toYjsPath(markdownPath)
    }

    async writeNote(markdownPath: string, markdown: string): Promise<void> {
        if (!fs.readBinaryFile || !fs.writeBinaryFile) {
            return
        }

        const yjsPath = toYjsPath(markdownPath)
        const doc = new Y.Doc()

        if (await yjsExists(yjsPath)) {
            try {
                const existingBytes = await fs.readBinaryFile(yjsPath)
                Y.applyUpdateV2(doc, existingBytes)
            } catch (err) {
                console.warn('[Sync] Existing .yjs could not be read. Recreating document:', yjsPath, err)
            }
        }

        const content = doc.getText('content')
        const meta = doc.getMap('meta')
        doc.transact(() => {
            content.delete(0, content.length)
            content.insert(0, markdown)
            meta.set('modifiedAt', Date.now())
        })

        const update = Y.encodeStateAsUpdateV2(doc)
        await atomicWriteBinary(yjsPath, update)
    }

    async readNote(markdownPath: string): Promise<string | null> {
        if (!fs.readBinaryFile) {
            return null
        }

        const yjsPath = toYjsPath(markdownPath)
        if (!(await yjsExists(yjsPath))) {
            return null
        }

        try {
            const bytes = await fs.readBinaryFile(yjsPath)
            const doc = new Y.Doc()
            Y.applyUpdateV2(doc, bytes)
            return doc.getText('content').toString()
        } catch (err) {
            console.warn('[Sync] Failed to decode .yjs note. Falling back to markdown:', yjsPath, err)
            return null
        }
    }
}

export const yjsVault = new YjsVault()
