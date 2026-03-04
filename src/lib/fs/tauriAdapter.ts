import { FileNode, FileSystemAdapter } from './types'

export const tauriFs: FileSystemAdapter = {
    openVault: async () => {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const result = await open({ directory: true, multiple: false })
        if (!result || typeof result !== 'string') return null
        return tauriFs.loadVault(result)
    },

    loadVault: async (path: string) => {
        const { exists, readDir } = await import('@tauri-apps/plugin-fs')
        if (!(await exists(path))) throw new Error(`Vault path does not exist: ${path}`)
        await readDir(path) // Verify readability
        const rootName = path.split(/[\/\\]/).pop() || 'Vault'
        return { path, name: rootName }
    },

    scanDirectory: async (dirPath: string): Promise<FileNode[]> => {
        const { readDir } = await import('@tauri-apps/plugin-fs')
        const { join } = await import('@tauri-apps/api/path')
        const nodes: FileNode[] = []

        try {
            const entries = await readDir(dirPath)
            for (const entry of entries) {
                if (entry.name?.startsWith('.')) continue
                const entryPath = await join(dirPath, entry.name!)

                if ((entry as any).isFile && entry.name?.endsWith('.md')) {
                    nodes.push({ name: entry.name, path: entryPath, kind: 'file' })
                } else if ((entry as any).isDirectory) {
                    const children = await tauriFs.scanDirectory(entryPath)
                    nodes.push({ name: entry.name || 'Unknown', path: entryPath, kind: 'directory', children })
                }
            }
        } catch (err) {
            console.error('Tauri: failed to scan directory:', err)
        }
        return nodes
    },

    readFile: async (path: string) => {
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        return readTextFile(path)
    },

    writeFile: async (path: string, content: string) => {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        await writeTextFile(path, content)
    },

    createFile: async (rootPath: string, name: string, parentPath?: string) => {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const { sep } = await import('@tauri-apps/api/path')
        const separator = await sep()
        const filename = name.endsWith('.md') ? name : `${name}.md`
        const targetDir = parentPath || rootPath
        const newPath = `${targetDir}${separator}${filename}`
        await writeTextFile(newPath, '')
        return newPath
    },

    createFolder: async (rootPath: string, name: string, parentPath?: string) => {
        const { mkdir } = await import('@tauri-apps/plugin-fs')
        const { sep } = await import('@tauri-apps/api/path')
        const separator = await sep()
        const targetDir = parentPath || rootPath
        const newPath = `${targetDir}${separator}${name}`
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
        const finalName = isFile ? (newFilename.endsWith('.md') ? newFilename : `${newFilename}.md`) : newFilename
        const newPath = parentPath ? `${parentPath}${separator}${finalName}` : finalName

        await rename(oldPath, newPath)
        return newPath
    },

    moveFile: async (rootPath: string, oldPath: string, parentPath?: string) => {
        const { rename, readTextFile, writeTextFile, remove } = await import('@tauri-apps/plugin-fs')
        const { sep } = await import('@tauri-apps/api/path')
        const separator = await sep()
        const filename = oldPath.split(separator).pop()!
        const targetDir = parentPath || rootPath
        const newPath = `${targetDir}${separator}${filename}`

        try {
            await rename(oldPath, newPath)
        } catch {
            const content = await readTextFile(oldPath)
            await writeTextFile(newPath, content)
            await remove(oldPath, { recursive: true })
        }
        return newPath
    },

    deleteFile: async (path: string) => {
        const { remove } = await import('@tauri-apps/plugin-fs')
        await remove(path, { recursive: true })
    }
}
