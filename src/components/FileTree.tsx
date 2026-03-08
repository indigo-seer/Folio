import { useState } from 'react'
import { FileNode } from '../lib/fs'

interface FileTreeProps {
    nodes: FileNode[]
    activeFilePath: string | null
    onFileSelect: (path: string) => void
    onFileContextMenu?: (path: string, kind: 'file' | 'directory', x: number, y: number) => void
    depth?: number
}

export function FileTree({ nodes, activeFilePath, onFileSelect, onFileContextMenu, depth = 0 }: FileTreeProps) {
    return (
        <div className="select-none">
            {nodes.map(node => (
                <FileTreeItem
                    key={node.path}
                    node={node}
                    activeFilePath={activeFilePath}
                    onFileSelect={onFileSelect}
                    onFileContextMenu={onFileContextMenu}
                    depth={depth}
                />
            ))}
        </div>
    )
}

interface FileTreeItemProps {
    node: FileNode
    activeFilePath: string | null
    onFileSelect: (path: string) => void
    onFileContextMenu?: (path: string, kind: 'file' | 'directory', x: number, y: number) => void
    depth: number
}

function FileTreeItem({ node, activeFilePath, onFileSelect, onFileContextMenu, depth }: FileTreeItemProps) {
    const [expanded, setExpanded] = useState(depth < 1) // Auto-expand first level
    const isActive = node.path === activeFilePath
    const isDirectory = node.kind === 'directory'
    const displayName = isDirectory ? node.name : node.name.replace(/\.md$/, '')

    const paddingLeft = depth * 16 + 8

    if (isDirectory) {
        return (
            <div>
                <button
                    onClick={() => setExpanded(prev => !prev)}
                    onContextMenu={(e) => {
                        if (onFileContextMenu) {
                            e.preventDefault()
                            e.stopPropagation()
                            onFileContextMenu(node.path, node.kind, e.clientX, e.clientY)
                        }
                    }}
                    className={`
            w-full flex items-center gap-1.5 py-1 pr-2 rounded-md
            font-sans text-ui transition-colors duration-folio
            text-folio-text-secondary hover:text-folio-text hover:bg-folio-bg/50
            dark:text-folio-dark-text-secondary dark:hover:text-folio-dark-text dark:hover:bg-folio-dark-bg/50
          `}
                    style={{ paddingLeft: `${paddingLeft}px` }}
                >
                    {/* Chevron */}
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                    >
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span className="truncate font-medium">{displayName}</span>
                </button>

                {/* Children */}
                <div
                    className="relative overflow-hidden transition-all duration-200"
                    style={{
                        maxHeight: expanded ? '2000px' : '0px',
                        opacity: expanded ? 1 : 0,
                    }}
                >
                    {node.children && node.children.length > 0 && (
                        <div
                            className="absolute top-1 bottom-3 w-[1px] bg-folio-border dark:bg-folio-dark-border opacity-100"
                            style={{ left: `${paddingLeft + 5.5}px` }}
                        />
                    )}
                    {node.children && (
                        <FileTree
                            nodes={node.children}
                            activeFilePath={activeFilePath}
                            onFileSelect={onFileSelect}
                            onFileContextMenu={onFileContextMenu}
                            depth={depth + 1}
                        />
                    )}
                </div>
            </div>
        )
    }

    return (
        <button
            onClick={() => onFileSelect(node.path)}
            onContextMenu={(e) => {
                if (onFileContextMenu) {
                    e.preventDefault()
                    e.stopPropagation()
                    onFileContextMenu(node.path, node.kind, e.clientX, e.clientY)
                }
            }}
            className={`
        w-full flex items-center gap-1.5 py-1 pr-2 rounded-md
        font-sans text-ui transition-colors duration-folio truncate
        ${isActive
                    ? 'text-folio-accent bg-folio-accent/8 dark:text-folio-dark-accent dark:bg-folio-dark-accent/8'
                    : 'text-folio-text-secondary hover:text-folio-text hover:bg-folio-bg/50 dark:text-folio-dark-text-secondary dark:hover:text-folio-dark-text dark:hover:bg-folio-dark-bg/50'
                }
      `}
            style={{ paddingLeft: `${paddingLeft}px` }}
            title={node.name}
        >
            {/* File icon */}
            <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 opacity-40"
            >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="truncate">{displayName}</span>
        </button>
    )
}
