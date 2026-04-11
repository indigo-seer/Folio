import { isTauri } from '../lib/config'
import { fs } from '../lib/fs'

async function cleanupTmp(path: string): Promise<void> {
    if (!isTauri()) return
    const { remove } = await import('@tauri-apps/plugin-fs')
    await remove(path).catch(() => {})
}

export async function atomicWriteText(targetPath: string, content: string): Promise<void> {
    const tmpPath = `${targetPath}.tmp`

    if (!isTauri()) {
        await fs.writeFile(targetPath, content)
        return
    }

    const { writeTextFile, rename } = await import('@tauri-apps/plugin-fs')

    try {
        await writeTextFile(tmpPath, content)
        await rename(tmpPath, targetPath)
    } catch (err) {
        await cleanupTmp(tmpPath)
        throw err
    }
}

export async function atomicWriteBinary(targetPath: string, content: Uint8Array): Promise<void> {
    const tmpPath = `${targetPath}.tmp`

    if (!isTauri()) {
        if (!fs.writeBinaryFile) throw new Error('Binary write is not supported in this runtime')
        await fs.writeBinaryFile(targetPath, content)
        return
    }

    const { writeFile, rename } = await import('@tauri-apps/plugin-fs')

    try {
        await writeFile(tmpPath, content)
        await rename(tmpPath, targetPath)
    } catch (err) {
        await cleanupTmp(tmpPath)
        throw err
    }
}
