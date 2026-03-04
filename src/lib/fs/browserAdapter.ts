import { FileNode, FileSystemAdapter } from './types'

declare global {
    interface Window {
        __TAURI_INTERNALS__?: unknown
        showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
    }

    interface FileSystemDirectoryHandle {
        values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>
        getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
        getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
        removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
    }

    interface FileSystemFileHandle {
        getFile(): Promise<File>
        createWritable(): Promise<FileSystemWritableFileStream>
    }

    interface FileSystemWritableFileStream {
        write(data: string | BufferSource | Blob): Promise<void>
        close(): Promise<void>
    }
}

let browserRootHandle: FileSystemDirectoryHandle | null = null
const browserHandleCache = new Map<string, FileSystemFileHandle>()

async function browserGetDirHandle(dirPath: string): Promise<FileSystemDirectoryHandle> {
    if (!browserRootHandle) throw new Error('No vault open')
    if (!dirPath) return browserRootHandle
    const parts = dirPath.split('/')
    let current = browserRootHandle
    for (const part of parts) {
        current = await current.getDirectoryHandle(part)
    }
    return current
}

async function browserGetParentHandle(path: string): Promise<FileSystemDirectoryHandle> {
    if (!browserRootHandle) throw new Error('No vault open')
    const parts = path.split('/')
    let current = browserRootHandle
    for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
    }
    return current
}

export const browserFs: FileSystemAdapter = {
    openVault: async () => {
        if (!window.showDirectoryPicker) {
            alert('Your browser does not support folder access. Please use Chrome or Edge, or download the desktop app.')
            return null
        }
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
        browserRootHandle = dirHandle
        browserHandleCache.clear()
        return { path: dirHandle.name, name: dirHandle.name }
    },

    loadVault: async (_path: string) => {
        throw new Error('loadVault by path is not supported in the browser because directory handles cannot be restored automatically without IndexedDB.')
    },

    scanDirectory: async function scan(path: string, dirHandle?: FileSystemDirectoryHandle): Promise<FileNode[]> {
        const handleToScan = dirHandle || browserRootHandle
        if (!handleToScan) throw new Error('No vault open')

        const nodes: FileNode[] = []
        for await (const entry of handleToScan.values()) {
            if (entry.name.startsWith('.')) continue
            const entryPath = path ? `${path}/${entry.name}` : entry.name

            if (entry.kind === 'file') {
                if (!entry.name.endsWith('.md')) continue
                browserHandleCache.set(entryPath, entry as FileSystemFileHandle)
                nodes.push({ name: entry.name, path: entryPath, kind: 'file', _handle: entry as FileSystemFileHandle })
            } else if (entry.kind === 'directory') {
                const children = await scan(entryPath, entry as FileSystemDirectoryHandle)
                nodes.push({ name: entry.name, path: entryPath, kind: 'directory', _handle: entry as FileSystemDirectoryHandle, children })
            }
        }
        return nodes
    },

    readFile: async (path: string) => {
        const handle = browserHandleCache.get(path)
        if (!handle) throw new Error(`Browser: file handle not found for ${path}`)
        const file = await handle.getFile()
        return file.text()
    },

    writeFile: async (path: string, content: string) => {
        const handle = browserHandleCache.get(path)
        if (!handle) throw new Error(`Browser: file handle not found for ${path}`)
        const writable = await handle.createWritable()
        await writable.write(content)
        await writable.close()
    },

    createFile: async (_rootPath: string, name: string, parentPath?: string) => {
        if (!browserRootHandle) throw new Error('No vault open')
        const filename = name.endsWith('.md') ? name : `${name}.md`
        const newPath = parentPath ? `${parentPath}/${filename}` : filename
        const parentHandle = parentPath ? await browserGetDirHandle(parentPath) : browserRootHandle
        const handle = await parentHandle.getFileHandle(filename, { create: true })
        const writable = await handle.createWritable()
        await writable.write('')
        await writable.close()
        browserHandleCache.set(newPath, handle)
        return newPath
    },

    createFolder: async (_rootPath: string, name: string, parentPath?: string) => {
        if (!browserRootHandle) throw new Error('No vault open')
        const newPath = parentPath ? `${parentPath}/${name}` : name
        const parentHandle = parentPath ? await browserGetDirHandle(parentPath) : browserRootHandle
        await parentHandle.getDirectoryHandle(name, { create: true })
        return newPath
    },

    renameFile: async (oldPath: string, newFilename: string) => {
        const parentHandle = await browserGetParentHandle(oldPath)
        const oldFilename = oldPath.split('/').pop()!
        const parts = oldPath.split('/')
        parts.pop()

        const isFile = oldPath.endsWith('.md')
        const finalName = isFile ? (newFilename.endsWith('.md') ? newFilename : `${newFilename}.md`) : newFilename
        const newPath = parts.length > 0 ? `${parts.join('/')}/${finalName}` : finalName

        const oldHandle = browserHandleCache.get(oldPath)
        if (!oldHandle) throw new Error(`Browser: handle not found for ${oldPath}`)
        const file = await oldHandle.getFile()
        const content = await file.text()

        const newHandle = await parentHandle.getFileHandle(finalName, { create: true })
        const writable = await newHandle.createWritable()
        await writable.write(content)
        await writable.close()
        await parentHandle.removeEntry(oldFilename)

        browserHandleCache.delete(oldPath)
        browserHandleCache.set(newPath, newHandle)
        return newPath
    },

    moveFile: async (_rootPath: string, oldPath: string, parentPath?: string) => {
        const isFile = oldPath.endsWith('.md')
        if (!isFile) throw new Error('Browser: Moving directories is not supported. Please use the desktop app.')

        const filename = oldPath.split('/').pop()!
        const newPath = parentPath ? `${parentPath}/${filename}` : filename

        const oldHandle = browserHandleCache.get(oldPath)
        if (!oldHandle) throw new Error(`Browser: handle not found for ${oldPath}`)
        const file = await oldHandle.getFile()
        const content = await file.text()

        const newParentHandle = parentPath ? await browserGetDirHandle(parentPath) : browserRootHandle!
        const newHandle = await newParentHandle.getFileHandle(filename, { create: true })
        const writable = await newHandle.createWritable()
        await writable.write(content)
        await writable.close()

        const oldParentHandle = await browserGetParentHandle(oldPath)
        await oldParentHandle.removeEntry(filename)

        browserHandleCache.delete(oldPath)
        browserHandleCache.set(newPath, newHandle)
        return newPath
    },

    deleteFile: async (path: string) => {
        const parentHandle = await browserGetParentHandle(path)
        const filename = path.split('/').pop()!
        await parentHandle.removeEntry(filename, { recursive: true })
        browserHandleCache.delete(path)
    }
}
