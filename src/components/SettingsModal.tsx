import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '../hooks/useSettings'
import { Palette, Type, Keyboard, Folder } from 'lucide-react'
import { Workspace } from '../lib/config'

interface SettingsModalProps {
    onClose: () => void
    workspaces: Workspace[]
    activeWorkspaceId: string | null
    onRemoveWorkspace: (id: string) => void
    onUpdateWorkspaceName: (id: string, newName: string) => void
}

function WorkspaceRow({
    workspace,
    isActive,
    onRemove,
    onUpdateName
}: {
    workspace: Workspace,
    isActive: boolean,
    onRemove: () => void,
    onUpdateName: (name: string) => void
}) {
    const [isEditing, setIsEditing] = useState(false)
    const [tempName, setTempName] = useState(workspace.displayName)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    const handleSave = () => {
        const trimmed = tempName.trim()
        if (trimmed && trimmed !== workspace.displayName) {
            onUpdateName(trimmed)
        } else {
            setTempName(workspace.displayName) // Revert if blank or unchanged
        }
        setIsEditing(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave()
        if (e.key === 'Escape') {
            setTempName(workspace.displayName)
            setIsEditing(false)
        }
    }

    return (
        <div className="flex items-center justify-between p-4 rounded-xl border border-folio-border/50 dark:border-folio-dark-border/50 bg-white dark:bg-folio-dark-bg-secondary w-full group transition-all duration-200 hover:border-folio-border dark:hover:border-folio-dark-border">
            <div className="flex flex-col gap-[3px] min-w-0 pr-4 flex-1">
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="font-sans text-[15px] font-medium text-[#344054] dark:text-folio-dark-text bg-transparent border-none outline-none ring-1 ring-[#3b5b8c]/30 dark:ring-folio-dark-accent/30 rounded px-1.5 py-0.5 -ml-1.5 w-[200px]"
                        />
                    ) : (
                        <div
                            className="font-sans text-[15px] font-medium text-[#344054] dark:text-folio-dark-text truncate cursor-pointer hover:underline decoration-folio-border/50 dark:decoration-folio-dark-border underline-offset-4"
                            onClick={() => setIsEditing(true)}
                            title="Click to rename"
                        >
                            {workspace.displayName}
                        </div>
                    )}
                    {isActive && !isEditing && (
                        <span className="px-2 py-0.5 rounded-full bg-[#EAE8E2] dark:bg-white/10 text-[#828896] dark:text-folio-dark-text-secondary text-[11px] font-medium tracking-wide">
                            Current
                        </span>
                    )}
                </div>
                <span className="font-mono text-[11px] text-[#A2A4B2] dark:text-folio-dark-text-secondary/70 truncate" title={workspace.path}>
                    {workspace.path}
                </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {!isEditing && (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="px-2.5 py-1.5 rounded-md text-[12px] font-medium text-[#717F9A] hover:bg-black/5 dark:text-[#8895AD] dark:hover:bg-white/5 transition-colors"
                    >
                        Edit
                    </button>
                )}
                <button
                    onClick={onRemove}
                    className="px-2.5 py-1.5 rounded-md text-[12px] font-medium text-red-500/80 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                    Remove
                </button>
            </div>
        </div>
    )
}

export function SettingsModal({
    onClose,
    workspaces,
    activeWorkspaceId,
    onRemoveWorkspace,
    onUpdateWorkspaceName
}: SettingsModalProps) {
    const {
        theme, setTheme,
        fontSize, setFontSize,
        typewriterBlur, setTypewriterBlur
    } = useSettings()

    const [activeSection, setActiveSection] = useState('appearance')
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Handle escape key to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const scrollToSection = (id: string) => {
        setActiveSection(id)
        const el = document.getElementById(`settings-${id}`)
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    }

    const FolioLogo = () => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 654 654" className="w-[22px] h-[22px] text-folio-text-secondary/60 dark:text-folio-dark-text-secondary/60 fill-current">
            <path d="M585.24,0H68.76A68.75,68.75,0,0,0,0,68.76V585.24A68.75,68.75,0,0,0,68.76,654H585.24A68.75,68.75,0,0,0,654,585.24V68.76A68.75,68.75,0,0,0,585.24,0ZM44.46,585.24v-23.8H128.1a48.6,48.6,0,0,0,48.54-48.54V146.76A48.6,48.6,0,0,0,128.1,98.22H44.46V68.76a24.33,24.33,0,0,1,24.3-24.3H420V609.54H68.76A24.33,24.33,0,0,1,44.46,585.24Zm565.08,0a24.33,24.33,0,0,1-24.3,24.3H464.43V44.46H585.24a24.33,24.33,0,0,1,24.3,24.3Z" />
            <path d="M537.59,98.22a10.11,10.11,0,0,0-10.11,10.11V550.52a10.11,10.11,0,1,0,20.21,0V108.33A10.11,10.11,0,0,0,537.59,98.22Z" />
        </svg>
    )

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 dark:bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 p-4 sm:p-6"
            onMouseDown={onClose}
        >
            <div
                className="bg-[#FCFBFA] dark:bg-folio-dark-bg border border-folio-border dark:border-folio-dark-border rounded-xl shadow-2xl w-full max-w-[840px] h-[640px] max-h-[90vh] pointer-events-auto animate-in zoom-in-[0.98] duration-200 flex overflow-hidden"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* Left Sidebar */}
                <div className="w-[200px] sm:w-[240px] flex-shrink-0 border-r border-folio-border dark:border-folio-dark-border bg-[#FDFCFB] dark:bg-folio-dark-bg-secondary flex flex-col pt-8">
                    {/* Brand */}
                    <div className="px-4 mb-6">
                        <div className="flex items-center gap-[10px] px-4">
                            <FolioLogo />
                            <span className="font-sans font-bold text-[#A2A4B2] dark:text-[#7A7C8A] text-[21px] tracking-tight mt-[1px]">Folio</span>
                        </div>
                    </div>

                    {/* Nav */}
                    <nav className="flex flex-col gap-1 px-4">
                        <button
                            onClick={() => scrollToSection('appearance')}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-md font-sans text-[14px] transition-colors ${activeSection === 'appearance'
                                ? 'bg-black/5 dark:bg-white/10 text-folio-text dark:text-folio-dark-text font-medium'
                                : 'text-folio-text-secondary dark:text-folio-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                        >
                            <Palette className="w-[18px] h-[18px]" strokeWidth={2} />
                            Appearance
                        </button>
                        <button
                            onClick={() => scrollToSection('typography')}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-md font-sans text-[14px] transition-colors ${activeSection === 'typography'
                                ? 'bg-black/5 dark:bg-white/10 text-folio-text dark:text-folio-dark-text font-medium'
                                : 'text-folio-text-secondary dark:text-folio-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                        >
                            <Type className="w-[18px] h-[18px]" strokeWidth={2} />
                            Typography
                        </button>
                        <button
                            onClick={() => scrollToSection('writing-modes')}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-md font-sans text-[14px] transition-colors ${activeSection === 'writing-modes'
                                ? 'bg-black/5 dark:bg-white/10 text-folio-text dark:text-folio-dark-text font-medium'
                                : 'text-folio-text-secondary dark:text-folio-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                        >
                            <Keyboard className="w-[18px] h-[18px]" strokeWidth={2} />
                            Writing Modes
                        </button>
                        <button
                            onClick={() => scrollToSection('workspaces')}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-md font-sans text-[14px] transition-colors ${activeSection === 'workspaces'
                                ? 'bg-black/5 dark:bg-white/10 text-folio-text dark:text-folio-dark-text font-medium'
                                : 'text-folio-text-secondary dark:text-folio-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                        >
                            <Folder className="w-[18px] h-[18px]" strokeWidth={2} />
                            Workspaces
                        </button>
                    </nav>
                </div>

                {/* Right Content */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#FDFCFB] dark:bg-folio-dark-bg">
                    {/* Header */}
                    <div className="flex items-center justify-between px-10 pt-8 pb-4 border-b border-folio-border dark:border-folio-dark-border/50">
                        <h3 className="font-serif text-[22px] text-[#344054] dark:text-folio-dark-text font-normal">Settings</h3>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-folio-text-secondary hover:text-folio-text dark:text-folio-dark-text-secondary dark:hover:text-folio-dark-text rounded-md transition-colors -mr-2"
                            title="Close settings"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 hover:opacity-100">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>

                    {/* Scrollable Container */}
                    <div
                        ref={scrollContainerRef}
                        className="flex-1 overflow-y-auto px-10 py-8 scroll-smooth"
                    >
                        <div className="flex flex-col gap-8 max-w-xl pb-16">

                            {/* APPEARANCE ANCHOR */}
                            <div id="settings-appearance" className="flex flex-col gap-5 scroll-mt-6">
                                <div className="flex justify-between items-start">
                                    <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Appearance</h4>
                                </div>

                                <div className="flex items-center justify-between border-b border-folio-border/50 dark:border-folio-dark-border/50 pb-5">
                                    <span className="font-sans text-[15px] font-medium text-[#344054] dark:text-folio-dark-text">Theme</span>
                                    <div className="flex bg-[#EAE8E2] dark:bg-folio-dark-bg-secondary p-1 rounded-[10px] shadow-sm">
                                        {(['light', 'dark', 'system'] as const).map((t) => (
                                            <button
                                                key={t}
                                                onClick={() => setTheme(t)}
                                                className={`px-4 py-1.5 font-sans text-[13px] capitalize rounded-md transition-all duration-200 ${theme === t
                                                    ? 'bg-white dark:bg-folio-dark-bg text-[#344054] dark:text-folio-dark-text shadow-[0_1px_3px_rgba(0,0,0,0.1)] font-medium'
                                                    : 'text-[#828896] dark:text-folio-dark-text-secondary hover:text-[#344054] dark:hover:text-folio-dark-text font-medium'
                                                    }`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* TYPOGRAPHY ANCHOR */}
                            <div id="settings-typography" className="flex flex-col gap-5 scroll-mt-6">
                                <div className="flex justify-between items-start pt-2">
                                    <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Typography</h4>
                                </div>

                                <div className="flex flex-col gap-4 border-b border-folio-border/50 dark:border-folio-dark-border/50 pb-6">
                                    <span className="font-sans text-[15px] font-medium text-[#344054] dark:text-folio-dark-text">Base Font Size</span>

                                    <div className="grid grid-cols-3 gap-3">
                                        {(['compact', 'default', 'relaxed'] as const).map((size) => (
                                            <button
                                                key={size}
                                                onClick={() => setFontSize(size)}
                                                className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200 ${fontSize === size
                                                    ? 'bg-[#F2F6FA] border-[#A8C7FA] text-[#295DAC] shadow-[0_0_0_1px_#A8C7FA] dark:bg-folio-dark-accent/10 dark:border-folio-dark-accent dark:text-folio-dark-accent dark:shadow-[0_0_0_1px_rgba(123,158,217,0.5)]'
                                                    : 'bg-white border-[#E8E6DF] text-[#7A869A] shadow-sm hover:border-[#D1CECB] dark:bg-folio-dark-bg-secondary dark:border-folio-dark-border dark:text-folio-dark-text-secondary dark:hover:border-folio-dark-text/30'
                                                    }`}
                                            >
                                                <span className="font-sans text-[14px] capitalize font-semibold mb-1">{size}</span>
                                                <span className="font-sans text-[12px] opacity-70">
                                                    {size === 'compact' ? '15px' : size === 'default' ? '17px' : '20px'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                            </div>

                            {/* WRITING MODES ANCHOR */}
                            <div id="settings-writing-modes" className="flex flex-col gap-5 scroll-mt-6">
                                <div className="flex justify-between items-start pt-2">
                                    <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Writing Modes</h4>
                                </div>

                                <div className="flex items-center justify-between pb-5 border-b border-folio-border/50 dark:border-folio-dark-border/50">
                                    <div className="flex flex-col">
                                        <span className="font-sans text-[15px] font-medium text-[#344054] dark:text-folio-dark-text">Blur for Typewriter</span>
                                        <span className="font-sans text-[13px] text-[#8692A6] dark:text-folio-dark-text-secondary mt-0.5">Masks surrounding text when typewriter mode is active</span>
                                    </div>
                                    <button
                                        onClick={() => setTypewriterBlur(!typewriterBlur)}
                                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-[3px] border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${typewriterBlur ? 'bg-[#3b5b8c] dark:bg-folio-dark-accent' : 'bg-[#E5E7EB] dark:bg-folio-dark-border'
                                            }`}
                                        role="switch"
                                        aria-checked={typewriterBlur}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={`pointer-events-none inline-block h-4 w-4 mt-[1px] transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${typewriterBlur ? 'translate-x-[18px]' : 'translate-x-[2px]'
                                                }`}
                                        />
                                    </button>
                                </div>
                            </div>

                            {/* WORKSPACES ANCHOR */}
                            <div id="settings-workspaces" className="flex flex-col gap-5 scroll-mt-6">
                                <div className="flex justify-between items-start pt-2">
                                    <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Workspaces</h4>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {workspaces.map(workspace => (
                                        <WorkspaceRow
                                            key={workspace.id}
                                            workspace={workspace}
                                            isActive={workspace.id === activeWorkspaceId}
                                            onUpdateName={(name) => onUpdateWorkspaceName(workspace.id, name)}
                                            onRemove={() => onRemoveWorkspace(workspace.id)}
                                        />
                                    ))}
                                    {workspaces.length === 0 && (
                                        <div className="px-4 py-8 text-center text-[13px] text-folio-text-secondary dark:text-folio-dark-text-secondary/70 border border-dashed border-folio-border dark:border-folio-dark-border/50 rounded-xl">
                                            No workspaces connected
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>

                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
