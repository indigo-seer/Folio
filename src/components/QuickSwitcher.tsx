import React, { useState, useEffect, useRef, useMemo, useContext } from 'react'
import Fuse from 'fuse.js'
import { VaultContext } from '../contexts/VaultContext'

export interface QuickSwitcherCommand {
    id: string
    label: string
    icon?: React.ReactNode
}

export interface UnifiedItem {
    type: 'note' | 'command'
    id?: string // For commands
    name: string // For notes (title) or commands (label)
    icon?: React.ReactNode
}

interface QuickSwitcherProps {
    isOpen: boolean
    commands?: QuickSwitcherCommand[]
    onClose: () => void
    onSelect: (item: UnifiedItem) => void
    onSelectInSplit?: (item: UnifiedItem) => void
}

export function QuickSwitcher({ isOpen, commands = [], onClose, onSelect, onSelectInSplit }: QuickSwitcherProps) {
    const { notes } = useContext(VaultContext)
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLUListElement>(null)

    // Reset when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('')
            setSelectedIndex(0)
            // Small timeout to allow element to render before focusing
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [isOpen])

    // Configure dual Fuse.js instances
    const { noteFuse, commandFuse } = useMemo(() => {
        const notesList = Array.from(notes).map(name => ({ type: 'note' as const, name }))
        const cmdsList = commands.map(c => ({ type: 'command' as const, id: c.id, name: c.label, icon: c.icon }))

        return {
            noteFuse: new Fuse(notesList, { keys: ['name'], threshold: 0.4 }),
            commandFuse: new Fuse(cmdsList, { keys: ['name'], threshold: 0.3 })
        }
    }, [notes, commands])

    // Get filtered and merged results
    const results = useMemo(() => {
        if (!query.trim()) {
            // Empty state: Commands First, then some Recent Notes
            const cmds = commands.map(c => ({ type: 'command' as const, id: c.id, name: c.label, icon: c.icon }))
            const recentNotes = Array.from(notes).slice(0, 10).map(name => ({ type: 'note' as const, name }))
            return [...cmds, ...recentNotes]
        }

        // Searching state: Boost commands
        const cmdResults = commandFuse.search(query).slice(0, 3).map(r => r.item)
        const noteResults = noteFuse.search(query).slice(0, 8).map(r => r.item)

        return [...cmdResults, ...noteResults]
    }, [query, commandFuse, noteFuse, commands, notes])

    // Handle keyboard navigation
    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
            } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev))
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
            } else if (e.key === 'Enter' && results.length > 0) {
                e.preventDefault()
                if ((e.altKey || e.ctrlKey || e.metaKey) && onSelectInSplit) {
                    onSelectInSplit(results[selectedIndex])
                } else {
                    onSelect(results[selectedIndex])
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, results, selectedIndex, onClose, onSelect, onSelectInSplit])

    // Keep selected item in view
    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' })
            }
        }
    }, [selectedIndex])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-xl bg-folio-bg dark:bg-folio-dark-bg rounded-xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col max-h-[60vh]">
                <div className="p-3 border-b border-black/5 dark:border-white/5 flex items-center gap-2">
                    <svg className="w-4 h-4 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        className="flex-1 bg-transparent border-none outline-none text-base text-folio-text dark:text-folio-dark-text placeholder:opacity-40"
                        placeholder="Search notes..."
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value)
                            setSelectedIndex(0)
                        }}
                    />
                </div>

                {results.length > 0 ? (
                    <ul ref={listRef} className="overflow-y-auto p-2 code-scrollbar">
                        {results.map((item, i) => {
                            const isCommand = item.type === 'command'
                            // Basic visual grouping indicator if needed, we'll rely on the distinct icons and top positioning for now 
                            // to keep the list clean, but we can detect group boundaries.

                            // Determine boundary headers
                            const prevItem = i > 0 ? results[i - 1] : null
                            const showActionHeader = isCommand && (!prevItem || prevItem.type !== 'command')
                            const showNoteHeader = !isCommand && (!prevItem || prevItem.type !== 'note')

                            return (
                                <React.Fragment key={`${item.type}-${isCommand ? item.id : item.name}`}>
                                    {showActionHeader && (
                                        <div className="px-3 pt-3 pb-1 text-[10px] font-bold tracking-wider text-folio-text-secondary/50 dark:text-folio-dark-text-secondary/50 uppercase">
                                            Actions
                                        </div>
                                    )}
                                    {showNoteHeader && (
                                        <div className="px-3 pt-3 pb-1 text-[10px] font-bold tracking-wider text-folio-text-secondary/50 dark:text-folio-dark-text-secondary/50 uppercase">
                                            {query.trim() ? 'Notes' : 'Recent Notes'}
                                        </div>
                                    )}
                                    <li
                                        data-index={i}
                                        className={`px-3 py-2 rounded-lg cursor-pointer flex items-center gap-3 transition-colors ${i === selectedIndex ? 'bg-folio-accent/10 text-folio-accent' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                                        onClick={() => onSelect(item)}
                                        onMouseEnter={() => setSelectedIndex(i)}
                                    >
                                        {isCommand && item.icon ? (
                                            <div className="w-4 h-4 opacity-60 shrink-0 flex items-center justify-center">
                                                {item.icon}
                                            </div>
                                        ) : (
                                            <svg className="w-3.5 h-3.5 opacity-40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                <polyline points="14 2 14 8 20 8"></polyline>
                                            </svg>
                                        )}
                                        <span className={`truncate text-sm ${isCommand ? 'font-medium' : ''}`}>{item.name}</span>
                                    </li>
                                </React.Fragment>
                            )
                        })}
                    </ul>
                ) : (
                    <div className="p-8 text-center opacity-50">
                        No notes found
                    </div>
                )}
                <div className="px-3 py-2 border-t border-black/5 dark:border-white/5 text-[11px] text-folio-text-secondary/70 dark:text-folio-dark-text-secondary/70">
                    <span className="font-medium">Enter</span> to open in focused pane · <span className="font-medium">Alt/Ctrl/Cmd + Enter</span> to open in split
                </div>
            </div>
        </div>
    )
}
