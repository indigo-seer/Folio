export interface FileNode {
    name: string
    path: string
    kind: 'file' | 'directory'
    children?: FileNode[]
    // Browser-only: retain the handle for file access
    _handle?: FileSystemFileHandle | FileSystemDirectoryHandle
}

export interface VaultState {
    rootPath: string | null
    rootName: string
    tree: FileNode[]
    notes: Set<string>
    backlinkIndex: Map<string, Set<string>>
}

export interface FileSystemAdapter {
    openVault: () => Promise<{ path: string, name: string } | null>;
    loadVault: (path: string) => Promise<{ path: string, name: string }>;
    scanDirectory: (path: string) => Promise<FileNode[]>;
    readFile: (path: string) => Promise<string>;
    readBinaryFile?: (path: string) => Promise<Uint8Array>;
    writeFile: (path: string, content: string) => Promise<void>;
    writeBinaryFile?: (path: string, content: Uint8Array) => Promise<void>;
    createFile: (rootPath: string, name: string, parentPath?: string) => Promise<string>;
    createFolder: (rootPath: string, name: string, parentPath?: string) => Promise<string>;
    renameFile: (oldPath: string, newFilename: string) => Promise<string>;
    moveFile: (rootPath: string, oldPath: string, parentPath?: string) => Promise<string>;
    deleteFile: (path: string) => Promise<void>;
}
