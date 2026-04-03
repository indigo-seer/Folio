import { useState, useEffect, useRef } from 'react'
import { FileNode } from '../lib/fs'

interface MoveModalProps {
    tree: FileNode[]
    sourcePath: string | null
    sourceKind: 'file' | 'directory' | null
    onClose: () => void
    onMove: (targetParentPath: string | null) => void
    onCreateAndMove: (folderName: string) => void
}

interface FlatFolder {
    path: string | null
    displayName: string
}

function flattenFolders(nodes: FileNode[], prefix = ''): FlatFolder[] {
    let result: FlatFolder[] = []
    for (const node of nodes) {
        if (node.kind === 'directory') {
            const displayName = prefix ? `${prefix}/${node.name}` : node.name
            result.push({ path: node.path, displayName })
            if (node.children) {
                result.push(...flattenFolders(node.children, displayName))
            }
        }
    }
    return result
}

export function MoveModal({ tree, sourcePath, sourceKind, onClose, onMove, onCreateAndMove }: MoveModalProps) {
    const [inputValue, setInputValue] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)

    // Add root as the first option and flatten tree
    const allFolders: FlatFolder[] = [
        { path: null, displayName: '/' },
        ...flattenFolders(tree)
    ].filter(folder => {
        // Filter out invalid move targets for directories
        if (sourceKind === 'directory' && sourcePath) {
            const targetPath = folder.path
            if (targetPath === sourcePath || (targetPath && targetPath.startsWith(sourcePath + '/'))) {
                return false
            }
        }
        return true
    })

    const filteredFolders = allFolders.filter(f =>
        f.displayName.toLowerCase().includes(inputValue.toLowerCase())
    )

    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setSelectedIndex(0)
    }, [inputValue])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
            } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(prev => Math.min(prev + 1, Math.max(0, filteredFolders.length - 1)))
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(prev => Math.max(prev - 1, 0))
            } else if (e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) {
                    if (inputValue.trim()) {
                        onCreateAndMove(inputValue.trim())
                    }
                } else {
                    if (filteredFolders[selectedIndex]) {
                        onMove(filteredFolders[selectedIndex].path)
                    }
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [filteredFolders, selectedIndex, onClose, onMove, onCreateAndMove, inputValue])

    // Scroll selected item into view
    useEffect(() => {
        const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
        selectedEl?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (e.target === e.currentTarget) onClose()
        }
        const overlay = document.getElementById('move-modal-overlay')
        overlay?.addEventListener('mousedown', handleClickOutside)
        return () => overlay?.removeEventListener('mousedown', handleClickOutside)
    }, [onClose])

    return (
        <div id="move-modal-overlay" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 animate-in fade-in duration-200">
            <div
                className="bg-folium-bg dark:bg-folium-dark-bg border border-folium-border dark:border-folium-dark-border rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Input Header */}
                <div className="p-4 border-b border-folium-border dark:border-folium-dark-border flex items-center bg-folium-bg-secondary/50 dark:bg-folium-dark-bg-secondary/50">
                    <input
                        type="text"
                        autoFocus
                        placeholder="Type a folder"
                        className="w-full bg-transparent outline-none text-folium-text dark:text-folium-dark-text placeholder:text-folium-text-secondary/50 font-sans"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                    />
                    <button
                        onClick={onClose}
                        className="ml-2 p-1 text-folium-text-secondary hover:text-folium-text hover:bg-folium-bg-secondary dark:hover:bg-folium-dark-bg-secondary rounded-full transition-colors flex-shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* List Body */}
                <div ref={listRef} className="max-h-[350px] overflow-y-auto py-2">
                    {filteredFolders.map((folder, idx) => {
                        const isSelected = idx === selectedIndex
                        return (
                            <div
                                key={folder.path || 'root'}
                                data-index={idx}
                                onMouseEnter={() => setSelectedIndex(idx)}
                                onClick={() => onMove(folder.path)}
                                className={`
                                    px-4 py-2 cursor-pointer flex items-center font-sans
                                    ${isSelected ? 'bg-folium-bg-secondary dark:bg-folium-dark-bg-secondary' : ''}
                                `}
                            >
                                <span className={isSelected ? 'text-folium-text dark:text-folium-dark-text font-medium' : 'text-folium-text-secondary dark:text-folium-dark-text-secondary'}>
                                    {folder.displayName}
                                </span>
                            </div>
                        )
                    })}
                    {filteredFolders.length === 0 && (
                        <div className="px-4 py-6 flex flex-col items-center justify-center text-center text-folium-text-secondary dark:text-folium-dark-text-secondary font-sans opacity-70">
                            <span className="mb-2">No matching folders found</span>
                            <span className="text-sm">Press <kbd className="bg-folium-bg dark:bg-folium-dark-bg px-1 rounded shadow-sm">Shift</kbd> + <kbd className="bg-folium-bg dark:bg-folium-dark-bg px-1 rounded shadow-sm">Enter</kbd> to create "{inputValue}"</span>
                        </div>
                    )}
                </div>

                {/* Footer hints */}
                <div className="px-4 py-3 border-t border-folium-border dark:border-folium-dark-border bg-folium-bg-secondary dark:bg-folium-dark-bg-secondary flex justify-center gap-6 text-xs text-folium-text-secondary dark:text-folium-dark-text-secondary font-sans tracking-wide">
                    <span><span className="font-semibold text-folium-text dark:text-folium-dark-text opacity-70">↑↓</span> to navigate</span>
                    <span><span className="font-semibold text-folium-text dark:text-folium-dark-text opacity-70">↲</span> to move</span>
                    <span><span className="font-semibold text-folium-text dark:text-folium-dark-text opacity-70">shift ↲</span> to create</span>
                    <span><span className="font-semibold text-folium-text dark:text-folium-dark-text opacity-70">esc</span> to dismiss</span>
                </div>
            </div>
        </div>
    )
}
