import { FileNode, FileSystemAdapter } from './types'
import { getBasename, IMAGE_EXTENSIONS } from '../constants'
import { assertPathWithinRoot, EntryExistsError, markdownFilename, validateEntryName } from './pathSafety'

export const tauriFs: FileSystemAdapter = {
    openVault: async () => {
        const { invoke } = await import('@tauri-apps/api/core')
        const result = await invoke<string | null>('select_vault')
        if (!result) return null
        return tauriFs.loadVault(result)
    },

    loadVault: async (path: string) => {
        const { invoke } = await import('@tauri-apps/api/core')
        const approvedPath = await invoke<string>('restore_vault_scope', { path })

        const { exists, readDir } = await import('@tauri-apps/plugin-fs')
        if (!(await exists(approvedPath))) throw new Error(`Vault path does not exist: ${approvedPath}`)
        await readDir(approvedPath) // Verify readability
        const rootName = getBasename(approvedPath) || 'Vault'
        return { path: approvedPath, name: rootName }
    },

    scanImageFiles: async (rootPath: string): Promise<string[]> => {
        const { readDir } = await import('@tauri-apps/plugin-fs')
        const { join } = await import('@tauri-apps/api/path')
        const imagePaths: string[] = []

        async function scan(dirPath: string): Promise<void> {
            const entries = await readDir(dirPath)
            for (const entry of entries) {
                if (!entry.name || entry.name.startsWith('.')) continue
                const entryPath = await join(dirPath, entry.name)

                if ((entry as any).isDirectory) {
                    await scan(entryPath)
                    continue
                }

                const extension = entry.name.includes('.')
                    ? entry.name.split('.').pop()!.toLowerCase()
                    : ''
                if (IMAGE_EXTENSIONS.has(extension)) imagePaths.push(entryPath)
            }
        }

        await scan(rootPath)
        return imagePaths
    },

    scanDirectory: async (dirPath: string): Promise<FileNode[]> => {
        const { readDir } = await import('@tauri-apps/plugin-fs')
        const { join } = await import('@tauri-apps/api/path')
        const nodes: FileNode[] = []

        const entries = await readDir(dirPath)
        for (const entry of entries) {
            if (entry.name?.startsWith('.') || entry.name === 'attachments') continue
            const entryPath = await join(dirPath, entry.name!)

            if ((entry as any).isFile && entry.name?.endsWith('.md')) {
                nodes.push({ name: entry.name, path: entryPath, kind: 'file' })
            } else if ((entry as any).isDirectory) {
                const children = await tauriFs.scanDirectory(entryPath)
                nodes.push({ name: entry.name || 'Unknown', path: entryPath, kind: 'directory', children })
            }
        }
        return nodes
    },

    readFile: async (path: string) => {
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        return readTextFile(path)
    },

    writeFile: async (path: string, content: string) => {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('write_text_file_atomic', { path, content })
    },

    readBinaryFile: async (path: string) => {
        const { readFile } = await import('@tauri-apps/plugin-fs')
        return readFile(path)
    },

    writeBinaryFile: async (path: string, content: Uint8Array) => {
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        await writeFile(path, content)
    },

    createFile: async (rootPath: string, name: string, parentPath?: string) => {
        const { exists, writeTextFile } = await import('@tauri-apps/plugin-fs')
        const { sep } = await import('@tauri-apps/api/path')
        const separator = await sep()
        const filename = markdownFilename(name)
        const targetDir = assertPathWithinRoot(rootPath, parentPath || rootPath)
        const newPath = `${targetDir}${separator}${filename}`
        try {
            await writeTextFile(newPath, '', { createNew: true })
        } catch (error) {
            if (await exists(newPath)) {
                throw new EntryExistsError(`A note named "${filename}" already exists.`)
            }
            throw error
        }
        return newPath
    },

    createFolder: async (rootPath: string, name: string, parentPath?: string) => {
        const { mkdir } = await import('@tauri-apps/plugin-fs')
        const { sep } = await import('@tauri-apps/api/path')
        const separator = await sep()
        const targetDir = assertPathWithinRoot(rootPath, parentPath || rootPath)
        const newPath = `${targetDir}${separator}${validateEntryName(name)}`
        await mkdir(newPath)
        return newPath
    },

    renameFile: async (oldPath: string, newFilename: string) => {
        const { rename } = await import('@tauri-apps/plugin-fs')
        const { sep } = await import('@tauri-apps/api/path')
        const separator = await sep()
        const parts = oldPath.split(separator)
        parts.pop()
        const parentPath = parts.join(separator)
        const isFile = oldPath.endsWith('.md')
        const finalName = isFile ? markdownFilename(newFilename) : validateEntryName(newFilename)
        const newPath = parentPath ? `${parentPath}${separator}${finalName}` : finalName

        if (newPath === oldPath) return oldPath
        const { exists } = await import('@tauri-apps/plugin-fs')
        if (await exists(newPath)) throw new EntryExistsError(`A file or folder named "${finalName}" already exists.`)
        await rename(oldPath, newPath)
        return newPath
    },

    moveFile: async (rootPath: string, oldPath: string, parentPath?: string) => {
        const { exists, rename, readTextFile, writeTextFile, remove } = await import('@tauri-apps/plugin-fs')
        const { sep } = await import('@tauri-apps/api/path')
        const separator = await sep()
        const filename = oldPath.split(separator).pop()!
        const targetDir = assertPathWithinRoot(rootPath, parentPath || rootPath)
        const newPath = `${targetDir}${separator}${filename}`

        if (newPath === oldPath) return oldPath
        if (await exists(newPath)) throw new EntryExistsError(`A file or folder named "${filename}" already exists at the destination.`)

        try {
            await rename(oldPath, newPath)
        } catch (renameError) {
            if (!oldPath.toLowerCase().endsWith('.md')) throw renameError
            const content = await readTextFile(oldPath)
            await writeTextFile(newPath, content, { createNew: true })
            try {
                await remove(oldPath)
            } catch (removeError) {
                throw new Error(`The note was copied but the original could not be removed. Both copies were kept. ${String(removeError)}`)
            }
        }
        return newPath
    },

    deleteFile: async (path: string) => {
        const { remove } = await import('@tauri-apps/plugin-fs')
        await remove(path, { recursive: true })
    }
}
