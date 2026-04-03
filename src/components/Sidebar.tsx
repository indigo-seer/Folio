import { useState, useRef, useEffect } from 'react'
import { FileNode } from '../lib/fs'
import { FileTree } from './FileTree'
import { ChevronUp, ChevronDown, Folder as FolderIcon, X, Plus, Library } from 'lucide-react'

import { Workspace } from '../lib/config'

interface SidebarProps {
    isCollapsed: boolean
    onToggle: () => void
    vaultName: string
    tree: FileNode[]
    activeFilePath: string | null
    workspaces: Workspace[]
    activeWorkspaceId: string | null
    onFileSelect: (path: string) => void
    onFileContextMenu?: (path: string | null, kind: 'file' | 'directory' | 'root', x: number, y: number) => void
    onOpenVault: () => void
    onSelectVault: (id: string) => void
    onRemoveVault: (id: string) => void
    onNewNote: () => void
    onOpenGraph: () => void
    onOpenSettings: () => void
}

export function Sidebar({
    isCollapsed,
    onToggle,
    vaultName,
    tree,
    activeFilePath,
    workspaces,
    activeWorkspaceId,
    onFileSelect,
    onFileContextMenu,
    onOpenVault,
    onSelectVault,
    onRemoveVault,
    onNewNote,
    onOpenGraph,
    onOpenSettings,
}: SidebarProps) {
    const hasVault = tree.length > 0 || vaultName !== ''

    const [isVaultSwitcherOpen, setIsVaultSwitcherOpen] = useState(false)
    const switcherRef = useRef<HTMLDivElement>(null)

    // Close switcher when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
                setIsVaultSwitcherOpen(false)
            }
        }

        if (isVaultSwitcherOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isVaultSwitcherOpen])

    const FoliumLogo = () => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 654 654" className="w-[20px] h-[20px] text-folium-text-secondary/60 dark:text-folium-dark-text-secondary/60 fill-current">
            <path d="M585.24,0H68.76A68.75,68.75,0,0,0,0,68.76V585.24A68.75,68.75,0,0,0,68.76,654H585.24A68.75,68.75,0,0,0,654,585.24V68.76A68.75,68.75,0,0,0,585.24,0ZM44.46,585.24v-23.8H128.1a48.6,48.6,0,0,0,48.54-48.54V146.76A48.6,48.6,0,0,0,128.1,98.22H44.46V68.76a24.33,24.33,0,0,1,24.3-24.3H420V609.54H68.76A24.33,24.33,0,0,1,44.46,585.24Zm565.08,0a24.33,24.33,0,0,1-24.3,24.3H464.43V44.46H585.24a24.33,24.33,0,0,1,24.3,24.3Z" />
            <path d="M537.59,98.22a10.11,10.11,0,0,0-10.11,10.11V550.52a10.11,10.11,0,1,0,20.21,0V108.33A10.11,10.11,0,0,0,537.59,98.22Z" />
        </svg>
    )



    return (
        <div
            className="sidebar relative flex flex-col"
            style={{ width: isCollapsed ? '0px' : '260px' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-[48px] min-w-[260px] flex-shrink-0">
                <div className="flex items-center gap-[8px] pl-1">
                    <FoliumLogo />
                    <span className="font-sans font-bold text-folium-text-secondary/70 dark:text-folium-dark-text-secondary/70 text-[19px] tracking-tight mt-[1px]">Folium</span>
                </div>
                <div className="flex items-center gap-0.5">
                    {hasVault && (
                        <>
                            <button
                                onClick={onOpenGraph}
                                className="w-6 h-6 flex items-center justify-center rounded opacity-40 hover:opacity-100 transition-opacity duration-folium"
                                title="Open graph view"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="18" cy="5" r="3"></circle>
                                    <circle cx="6" cy="12" r="3"></circle>
                                    <circle cx="18" cy="19" r="3"></circle>
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                </svg>
                            </button>
                            <button
                                onClick={onNewNote}
                                className="w-6 h-6 flex items-center justify-center rounded opacity-40 hover:opacity-100 transition-opacity duration-folium"
                                title="New note"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </button>
                        </>
                    )}
                    <button
                        onClick={onToggle}
                        className="w-6 h-6 flex items-center justify-center rounded opacity-40 hover:opacity-100 transition-opacity duration-folium"
                        title="Collapse sidebar"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="11 17 6 12 11 7" />
                            <polyline points="18 17 13 12 18 7" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-w-[260px] border-r border-folium-border dark:border-folium-dark-border overflow-hidden">
                {/* Content */}
                <div
                    className="flex-1 overflow-y-auto px-2 py-1"
                    onContextMenu={(e) => {
                        if (onFileContextMenu && hasVault) {
                            e.preventDefault()
                            onFileContextMenu(null, 'root', e.clientX, e.clientY)
                        }
                    }}
                >
                    {hasVault && (
                        <div className="px-2 pt-2 pb-1 mb-1 flex items-center gap-1.5 text-[12px] font-medium text-folium-text-secondary dark:text-folium-dark-text-secondary uppercase tracking-wider select-none">
                            <Library className="w-[12px] h-[12px] opacity-60" strokeWidth={2.5} />
                            <span className="opacity-60">{vaultName || ''}</span>
                        </div>
                    )}
                    {hasVault ? (
                        <FileTree
                            nodes={tree}
                            activeFilePath={activeFilePath}
                            onFileSelect={onFileSelect}
                            onFileContextMenu={onFileContextMenu}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full">
                            <button
                                onClick={onOpenVault}
                                className="flex flex-col items-center gap-3 opacity-40 hover:opacity-70 transition-opacity duration-folium group cursor-pointer"
                            >
                                <svg
                                    width="40"
                                    height="40"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="group-hover:scale-105 transition-transform duration-folium"
                                >
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                                <span className="font-sans text-ui text-center">
                                    Open a vault to<br />browse your notes
                                </span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Open Vault button at bottom */}
                {hasVault && (
                    <div className="px-3 h-[41px] flex-shrink-0 flex items-center justify-between gap-2 border-t border-folium-border dark:border-folium-dark-border">
                        <div className="relative flex-1 flex" ref={switcherRef}>
                            {/* Vault Switcher Popup */}
                            {isVaultSwitcherOpen && (
                                <div className="absolute bottom-full left-0 mb-2 w-full flex flex-col bg-folium-bg dark:bg-folium-dark-bg border border-folium-border/50 dark:border-folium-dark-border/50 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="max-h-[300px] overflow-y-auto py-1">
                                        {workspaces.map((workspace) => (
                                            <div
                                                key={workspace.id}
                                                className="group flex items-center justify-between px-3 py-2 hover:bg-folium-bg-secondary dark:hover:bg-folium-dark-bg-secondary transition-colors cursor-default"
                                            >
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setIsVaultSwitcherOpen(false)
                                                        onSelectVault(workspace.id)
                                                    }}
                                                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                                                    title={workspace.path}
                                                >
                                                    <FolderIcon className="w-4 h-4 flex-shrink-0 opacity-70" strokeWidth={2} />
                                                    <span className="font-sans text-[13px] font-medium text-folium-text dark:text-folium-dark-text truncate">
                                                        {workspace.displayName}
                                                    </span>
                                                </button>

                                                {workspace.id !== activeWorkspaceId && (
                                                    <button
                                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-folium-text-secondary/50 hover:text-red-500 hover:bg-red-500/10 transition-all focus:outline-none"
                                                        title="Remove from recents"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            onRemoveVault(workspace.id)
                                                        }}
                                                    >
                                                        <X className="w-[14px] h-[14px]" strokeWidth={2} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {workspaces.length === 0 && (
                                            <div className="px-4 py-3 text-center text-[12px] text-folium-text-secondary/50 dark:text-folium-dark-text-secondary/50">
                                                No workspaces found
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-t border-folium-border/30 dark:border-folium-dark-border/30 p-1">
                                        <button
                                            onClick={() => {
                                                setIsVaultSwitcherOpen(false)
                                                onOpenVault()
                                            }}
                                            className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-md font-sans text-[13px] font-medium text-folium-text dark:text-folium-dark-text hover:bg-folium-bg-secondary dark:hover:bg-folium-dark-bg-secondary transition-colors"
                                        >
                                            <Plus className="w-4 h-4 opacity-70" strokeWidth={2.5} />
                                            <span>Add Workspace</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={() => setIsVaultSwitcherOpen(!isVaultSwitcherOpen)}
                                className="flex-1 flex w-full items-center justify-between px-2 py-1.5 rounded-md font-sans text-[13px] font-medium text-folium-text-secondary hover:text-folium-text hover:bg-folium-bg/50 hover:shadow-sm dark:text-folium-dark-text-secondary dark:hover:text-folium-dark-text dark:hover:bg-folium-dark-bg/50 transition-all duration-200"
                                title="Switch vault"
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <FolderIcon className="w-4 h-4 flex-shrink-0 opacity-70" strokeWidth={2} />
                                    <span className="truncate">
                                        {workspaces.find(w => w.id === activeWorkspaceId)?.displayName || vaultName || 'No Vault'}
                                    </span>
                                </div>
                                {isVaultSwitcherOpen ? (
                                    <ChevronDown className="w-4 h-4 flex-shrink-0 opacity-50" strokeWidth={2} />
                                ) : (
                                    <ChevronUp className="w-4 h-4 flex-shrink-0 opacity-50" strokeWidth={2} />
                                )}
                            </button>
                        </div>

                        <button
                            onClick={onOpenSettings}
                            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-folium-text-secondary hover:text-folium-text hover:bg-folium-bg/50 dark:text-folium-dark-text-secondary dark:hover:text-folium-dark-text dark:hover:bg-folium-dark-bg/50 transition-colors duration-folium"
                            title="Settings"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
