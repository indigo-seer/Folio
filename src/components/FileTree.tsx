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

// Indent constants
const INDENT_PER_LEVEL = 14   // px per level of nesting
const BASE_PADDING = 8    // px left padding at depth 0
const CHEVRON_WIDTH = 15   // 9px icon + 6px gap — used to align file rows with folder names

// Folder icon — open or closed
function FolderIcon({ open }: { open: boolean }) {
    return open ? (
        // Open folder
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
    ) : (
        // Closed folder
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    )
}

// Small chevron for expand/collapse indicator
function Chevron({ expanded }: { expanded: boolean }) {
    return (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            className={`shrink-0 transition-transform duration-150 opacity-50 ${expanded ? 'rotate-90' : ''}`}>
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

function FileTreeItem({ node, activeFilePath, onFileSelect, onFileContextMenu, depth }: FileTreeItemProps) {
    const [expanded, setExpanded] = useState(depth < 1)
    const isActive = node.path === activeFilePath
    const isDirectory = node.kind === 'directory'
    const displayName = isDirectory ? node.name : node.name.replace(/\.md$/, '')

    const paddingLeft = depth * INDENT_PER_LEVEL + BASE_PADDING

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
                        w-full flex items-center gap-1.5 py-[5px] pr-2 mb-1 rounded-md
                        font-sans text-ui transition-colors duration-folio
                        text-folio-text-secondary hover:text-folio-text
                        dark:text-folio-dark-text-secondary dark:hover:text-folio-dark-text
                        ${depth === 0 ? 'font-semibold' : 'font-medium'}
                        ${expanded
                            ? 'bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                            : 'hover:bg-folio-bg/60 dark:hover:bg-folio-dark-bg/60'
                        }
                    `}
                    style={{ paddingLeft: `${paddingLeft}px` }}
                >
                    <Chevron expanded={expanded} />
                    <FolderIcon open={expanded} />
                    <span className="truncate">{displayName}</span>
                </button>

                {/* Children */}
                <div
                    className="relative overflow-hidden transition-all duration-200"
                    style={{
                        maxHeight: expanded ? '9999px' : '0px',
                        opacity: expanded ? 1 : 0,
                    }}
                >
                    {/* Indent guide line */}
                    {node.children && node.children.length > 0 && (
                        <div
                            className="absolute top-0 bottom-2 w-px"
                            style={{
                                left: `${paddingLeft + 5}px`,
                                // Stronger guide at shallow depths, subtler deeper
                                background: depth === 0
                                    ? 'rgba(140,151,173,0.30)'
                                    : 'rgba(140,151,173,0.18)',
                            }}
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

    // File item — slightly muted at deeper levels
    const fileOpacity = Math.max(0.72, 1 - depth * 0.06)
    // Offset files so their icon aligns with folder name text (past the chevron)
    const filePaddingLeft = paddingLeft + CHEVRON_WIDTH

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
                w-full flex items-center gap-1.5 py-[5px] pr-2 rounded-md
                font-sans text-ui transition-colors duration-folio truncate
                ${isActive
                    ? 'text-folio-accent bg-folio-accent/8 dark:text-folio-dark-accent dark:bg-folio-dark-accent/8'
                    : 'text-folio-text-secondary hover:text-folio-text hover:bg-folio-bg/50 dark:text-folio-dark-text-secondary dark:hover:text-folio-dark-text dark:hover:bg-folio-dark-bg/50'
                }
            `}
            style={{ paddingLeft: `${filePaddingLeft}px`, opacity: isActive ? 1 : fileOpacity }}
            title={node.name}
        >
            {/* File icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                className="shrink-0 opacity-40">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="truncate">{displayName}</span>
        </button>
    )
}
