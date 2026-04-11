import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '../hooks/useSettings'
import { Palette, Type, Keyboard, Folder, HardDrive, RefreshCw } from 'lucide-react'
import { Workspace } from '../lib/config'
import { useCacheSize } from '../hooks/useCacheSize'
import { isSyncRuntimeEnabledForVault, syncManager } from '../sync'
import { AddDeviceModal } from '../sync/ui/AddDeviceModal'
import { JoinVaultScreen } from '../sync/ui/JoinVaultScreen'
import { RemoveDeviceModal } from '../sync/ui/RemoveDeviceModal'
import type { PairedDevice } from '../sync/types'

// ---------------------------------------------------------
// Types & Props
// ---------------------------------------------------------

interface SettingsModalProps {
    onClose: () => void
    workspaces: Workspace[]
    activeWorkspaceId: string | null
    onRemoveWorkspace: (id: string) => void
    onUpdateWorkspaceName: (id: string, newName: string) => void
    vaultPath: string | null
}

// ---------------------------------------------------------
// Workspace Row Component
// ---------------------------------------------------------

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
            setTempName(workspace.displayName)
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
        <div className="flex items-center justify-between p-4 rounded-xl border border-folium-border/50 dark:border-folium-dark-border/50 bg-white dark:bg-folium-dark-bg-secondary w-full group transition-all duration-200 hover:border-folium-border dark:hover:border-folium-dark-border">
            <div className="flex flex-col gap-[3px] min-w-0 pr-4 flex-1">
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="font-sans text-[15px] font-medium text-[#344054] dark:text-folium-dark-text bg-transparent border-none outline-none ring-1 ring-[#3b5b8c]/30 dark:ring-folium-dark-accent/30 rounded px-1.5 py-0.5 -ml-1.5 w-[200px]"
                        />
                    ) : (
                        <div
                            className="font-sans text-[15px] font-medium text-[#344054] dark:text-folium-dark-text truncate cursor-pointer hover:underline decoration-folium-border/50 dark:decoration-folium-dark-border underline-offset-4"
                            onClick={() => setIsEditing(true)}
                            title="Click to rename"
                        >
                            {workspace.displayName}
                        </div>
                    )}
                    {isActive && !isEditing && (
                        <span className="px-2 py-0.5 rounded-full bg-[#EAE8E2] dark:bg-white/10 text-[#828896] dark:text-folium-dark-text-secondary text-[11px] font-medium tracking-wide">
                            Current
                        </span>
                    )}
                </div>
                <span className="font-mono text-[11px] text-[#A2A4B2] dark:text-folium-dark-text-secondary/70 truncate" title={workspace.path}>
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

// ---------------------------------------------------------
// Sub-components
// ---------------------------------------------------------

const FoliumLogo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 654 654" className="w-[22px] h-[22px] text-folium-text-secondary/60 dark:text-folium-dark-text-secondary/60 fill-current">
        <path d="M585.24,0H68.76A68.75,68.75,0,0,0,0,68.76V585.24A68.75,68.75,0,0,0,68.76,654H585.24A68.75,68.75,0,0,0,654,585.24V68.76A68.75,68.75,0,0,0,585.24,0ZM44.46,585.24v-23.8H128.1a48.6,48.6,0,0,0,48.54-48.54V146.76A48.6,48.6,0,0,0,128.1,98.22H44.46V68.76a24.33,24.33,0,0,1,24.3-24.3H420V609.54H68.76A24.33,24.33,0,0,1,44.46,585.24Zm565.08,0a24.33,24.33,0,0,1-24.3,24.3H464.43V44.46H585.24a24.33,24.33,0,0,1,24.3,24.3Z" />
        <path d="M537.59,98.22a10.11,10.11,0,0,0-10.11,10.11V550.52a10.11,10.11,0,1,0,20.21,0V108.33A10.11,10.11,0,0,0,537.59,98.22Z" />
    </svg>
)

function SettingsSidebar({ activeSection, onScrollToSection, showSync }: { activeSection: string, onScrollToSection: (id: string) => void, showSync?: boolean }) {
    const navItems = [
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'typography', label: 'Typography', icon: Type },
        { id: 'writing-modes', label: 'Writing Modes', icon: Keyboard },
        { id: 'image-cache', label: 'Image Cache', icon: HardDrive },
        { id: 'workspaces', label: 'Workspaces', icon: Folder },
    ]

    if (showSync) {
        navItems.splice(1, 0, { id: 'sync', label: 'Sync', icon: RefreshCw })
    }

    return (
        <div className="w-[200px] sm:w-[240px] flex-shrink-0 border-r border-folium-border dark:border-folium-dark-border bg-[#FDFCFB] dark:bg-folium-dark-bg-secondary flex flex-col pt-8">
            <div className="px-4 mb-6">
                <div className="flex items-center gap-[10px] px-4">
                    <FoliumLogo />
                    <span className="font-sans font-bold text-[#A2A4B2] dark:text-[#7A7C8A] text-[21px] tracking-tight mt-[1px]">Folium</span>
                </div>
            </div>
            <nav className="flex flex-col gap-1 px-4">
                {navItems.map(item => {
                    const Icon = item.icon
                    const isActive = activeSection === item.id
                    return (
                        <button
                            key={item.id}
                            onClick={() => onScrollToSection(item.id)}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-md font-sans text-[14px] transition-colors ${isActive
                                    ? 'bg-black/5 dark:bg-white/10 text-folium-text dark:text-folium-dark-text font-medium'
                                    : 'text-folium-text-secondary dark:text-folium-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                        >
                            <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
                            {item.label}
                        </button>
                    )
                })}
            </nav>
        </div>
    )
}

function SectionAppearance() {
    const { theme, setTheme } = useSettings()

    return (
        <div id="settings-appearance" className="flex flex-col gap-5 scroll-mt-6">
            <div className="flex justify-between items-start">
                <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Appearance</h4>
            </div>
            <div className="flex items-center justify-between border-b border-folium-border/50 dark:border-folium-dark-border/50 pb-5">
                <span className="font-sans text-[15px] font-medium text-[#344054] dark:text-folium-dark-text">Theme</span>
                <div className="flex bg-[#EAE8E2] dark:bg-folium-dark-bg-secondary p-1 rounded-[10px] shadow-sm">
                    {(['light', 'dark', 'system'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTheme(t)}
                            className={`px-4 py-1.5 font-sans text-[13px] capitalize rounded-md transition-all duration-200 ${theme === t
                                    ? 'bg-white dark:bg-folium-dark-bg text-[#344054] dark:text-folium-dark-text shadow-[0_1px_3px_rgba(0,0,0,0.1)] font-medium'
                                    : 'text-[#828896] dark:text-folium-dark-text-secondary hover:text-[#344054] dark:hover:text-folium-dark-text font-medium'
                                }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

function SectionTypography() {
    const { fontSize, setFontSize } = useSettings()

    return (
        <div id="settings-typography" className="flex flex-col gap-5 scroll-mt-6">
            <div className="flex justify-between items-start pt-2">
                <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Typography</h4>
            </div>
            <div className="flex flex-col gap-4 border-b border-folium-border/50 dark:border-folium-dark-border/50 pb-6">
                <span className="font-sans text-[15px] font-medium text-[#344054] dark:text-folium-dark-text">Base Font Size</span>
                <div className="grid grid-cols-3 gap-3">
                    {(['compact', 'default', 'relaxed'] as const).map((size) => (
                        <button
                            key={size}
                            onClick={() => setFontSize(size)}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200 ${fontSize === size
                                    ? 'bg-[#F2F6FA] border-[#A8C7FA] text-[#295DAC] shadow-[0_0_0_1px_#A8C7FA] dark:bg-folium-dark-accent/10 dark:border-folium-dark-accent dark:text-folium-dark-accent dark:shadow-[0_0_0_1px_rgba(123,158,217,0.5)]'
                                    : 'bg-white border-[#E8E6DF] text-[#7A869A] shadow-sm hover:border-[#D1CECB] dark:bg-folium-dark-bg-secondary dark:border-folium-dark-border dark:text-folium-dark-text-secondary dark:hover:border-folium-dark-text/30'
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
    )
}

function SectionWritingModes() {
    const { typewriterBlur, setTypewriterBlur } = useSettings()

    return (
        <div id="settings-writing-modes" className="flex flex-col gap-5 scroll-mt-6">
            <div className="flex justify-between items-start pt-2">
                <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Writing Modes</h4>
            </div>
            <div className="flex items-center justify-between pb-5 border-b border-folium-border/50 dark:border-folium-dark-border/50">
                <div className="flex flex-col">
                    <span className="font-sans text-[15px] font-medium text-[#344054] dark:text-folium-dark-text">Blur for Typewriter</span>
                    <span className="font-sans text-[13px] text-[#8692A6] dark:text-folium-dark-text-secondary mt-0.5">Masks surrounding text when typewriter mode is active</span>
                </div>
                <button
                    onClick={() => setTypewriterBlur(!typewriterBlur)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-[3px] border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${typewriterBlur ? 'bg-[#3b5b8c] dark:bg-folium-dark-accent' : 'bg-[#E5E7EB] dark:bg-folium-dark-border'
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
    )
}

function SectionImageCache() {
    const {
        cacheSizeBytes,
        cacheSizeMB,
        isLoading: isCacheLoading,
        isOpeningFolder,
        isLarge: isCacheLarge,
        clearCache,
        openCacheFolder,
    } = useCacheSize()

    const cacheUsageLabel = cacheSizeMB > 0 ? `${cacheSizeMB} MB` : '0 MB'
    const largeCacheLabel = cacheSizeBytes >= 1024 * 1024 * 1024
        ? `${(cacheSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
        : `${cacheSizeMB} MB`

    return (
        <div id="settings-image-cache" className="flex flex-col gap-5 scroll-mt-6">
            <div className="flex justify-between items-start pt-2">
                <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Image Cache</h4>
            </div>
            <div className="flex flex-col gap-2 pb-5 border-b border-folium-border/50 dark:border-folium-dark-border/50">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="font-sans text-[15px] font-medium text-[#344054] dark:text-folium-dark-text">Image Cache</span>
                        <span className="font-sans text-[13px] text-[#8692A6] dark:text-folium-dark-text-secondary mt-0.5">Stores optimized copies of large images for faster rendering.</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => void openCacheFolder()}
                            disabled={isOpeningFolder}
                            className="px-3 py-1.5 rounded-md text-[12px] font-medium text-[#717F9A] hover:bg-black/5 dark:text-[#8895AD] dark:hover:bg-white/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isOpeningFolder ? 'Opening...' : 'Open Folder'}
                        </button>
                        <button
                            onClick={() => void clearCache()}
                            disabled={isCacheLoading}
                            className="px-3 py-1.5 rounded-md text-[12px] font-medium text-[#717F9A] hover:bg-black/5 dark:text-[#8895AD] dark:hover:bg-white/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isCacheLoading ? 'Clearing...' : 'Clear Cache'}
                        </button>
                    </div>
                </div>
                <div className="font-sans text-[13px] text-[#5F6B85] dark:text-folium-dark-text-secondary">
                    Currently using: {cacheUsageLabel}
                </div>
                {isCacheLarge && (
                    <div className="font-sans text-[13px] text-amber-600 dark:text-amber-400">
                        Cache is large ({largeCacheLabel}). Consider clearing to free up space.
                    </div>
                )}
            </div>
        </div>
    )
}

function SectionSync({ vaultPath }: { vaultPath: string | null }) {
    const [status, setStatus] = useState<{
        enabled: boolean
        syncthingRunning: boolean
        lastError: string | null
    }>({
        enabled: false,
        syncthingRunning: false,
        lastError: null,
    })
    const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([])
    const [deviceName, setDeviceName] = useState<string | null>(null)
    const [isEditingName, setIsEditingName] = useState(false)
    const [tempName, setTempName] = useState('')
    const [showAddDevice, setShowAddDevice] = useState(false)
    const [showJoinVault, setShowJoinVault] = useState(false)
    const [deviceToRemove, setDeviceToRemove] = useState<PairedDevice | null>(null)

    useEffect(() => {
        if (!vaultPath || !isSyncRuntimeEnabledForVault(vaultPath)) {
            setStatus({ enabled: false, syncthingRunning: false, lastError: null })
            return
        }

        const syncStatus = syncManager.getStatus()
        setStatus({
            enabled: true,
            syncthingRunning: syncStatus.syncthingRunning,
            lastError: syncStatus.lastError,
        })

        setPairedDevices(syncManager.getPairedDevices())
        setDeviceName(syncManager.getDeviceName())

        const interval = setInterval(() => {
            const currentStatus = syncManager.getStatus()
            setStatus({
                enabled: true,
                syncthingRunning: currentStatus.syncthingRunning,
                lastError: currentStatus.lastError,
            })
            setPairedDevices(syncManager.getPairedDevices())
        }, 3000)

        return () => clearInterval(interval)
    }, [vaultPath])

    const handleSaveName = async () => {
        const trimmed = tempName.trim()
        if (trimmed && trimmed !== deviceName) {
            await syncManager.updateDeviceName(trimmed)
            setDeviceName(trimmed)
        }
        setIsEditingName(false)
    }

    const handleRemoveDevice = async () => {
        if (!deviceToRemove) return
        await syncManager.removeDevice(deviceToRemove.deviceId)
        setPairedDevices(syncManager.getPairedDevices())
        setDeviceToRemove(null)
    }

    const getStatusColor = () => {
        if (!status.enabled) return 'bg-gray-400'
        if (status.lastError) return 'bg-red-500'
        if (status.syncthingRunning) return 'bg-green-500'
        return 'bg-amber-500'
    }

    const getStatusText = () => {
        if (!status.enabled) return 'Disabled'
        if (status.lastError) return 'Error'
        if (status.syncthingRunning) return 'Active'
        return 'Starting...'
    }

    if (!status.enabled) {
        return (
            <div id="settings-sync" className="flex flex-col gap-5 scroll-mt-6">
                <div className="flex justify-between items-start">
                    <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Sync</h4>
                </div>
                <div className="flex items-center justify-between border-b border-folium-border/50 dark:border-folium-dark-border/50 pb-5">
                    <span className="font-sans text-[15px] font-medium text-[#344054] dark:text-folium-dark-text">
                        Sync is not enabled
                    </span>
                </div>
            </div>
        )
    }

    return (
        <div id="settings-sync" className="flex flex-col gap-6 scroll-mt-6">
            <div className="flex justify-between items-start">
                <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Sync</h4>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
                    <span className="font-sans text-[13px] text-[#717F9A] dark:text-[#8895AD]">{getStatusText()}</span>
                </div>
            </div>

            {status.lastError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <span className="font-sans text-[13px] text-red-600 dark:text-red-400">{status.lastError}</span>
                </div>
            )}

            <div className="border-b border-folium-border/50 dark:border-folium-dark-border/50 pb-5">
                <span className="font-sans text-[14px] font-medium text-[#344054] dark:text-folium-dark-text mb-3 block">
                    This Device
                </span>
                {isEditingName ? (
                    <input
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onBlur={handleSaveName}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                        className="font-sans text-[15px] text-[#344054] dark:text-folium-dark-text bg-white dark:bg-folium-dark-bg-secondary border border-folium-border dark:border-folium-dark-border rounded px-2 py-1 outline-none focus:ring-2 focus:ring-folium-accent dark:focus:ring-folium-dark-accent"
                        autoFocus
                    />
                ) : (
                    <div 
                        className="flex items-center gap-2 cursor-pointer hover:underline"
                        onClick={() => {
                            setTempName(deviceName || '')
                            setIsEditingName(true)
                        }}
                    >
                        <span className="font-sans text-[15px] text-[#344054] dark:text-folium-dark-text">
                            {deviceName || 'Unnamed Device'}
                        </span>
                        <span className="text-[12px] text-[#717F9A] dark:text-[#8895AD]">(click to rename)</span>
                    </div>
                )}
            </div>

            <div className="border-b border-folium-border/50 dark:border-folium-dark-border/50 pb-5">
                <div className="flex justify-between items-center mb-4">
                    <span className="font-sans text-[14px] font-medium text-[#344054] dark:text-folium-dark-text">
                        My Devices
                    </span>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setShowJoinVault(true)}
                            className="font-sans text-[13px] text-[#717F9A] dark:text-[#8895AD] hover:text-folium-accent dark:hover:text-folium-dark-accent"
                        >
                            Join from device
                        </button>
                        <button
                            onClick={() => setShowAddDevice(true)}
                            className="font-sans text-[13px] text-folium-accent dark:text-folium-dark-accent hover:underline"
                        >
                            + Add Device
                        </button>
                    </div>
                </div>

                {pairedDevices.length === 0 ? (
                    <p className="font-sans text-[13px] text-[#717F9A] dark:text-[#8895AD]">
                        No devices connected yet
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {pairedDevices.map((device) => (
                            <div 
                                key={device.deviceId}
                                className="flex items-center justify-between p-3 bg-[#F8F7F6] dark:bg-folium-dark-bg-secondary rounded-lg"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                    <div className="flex flex-col">
                                        <span className="font-sans text-[14px] text-[#344054] dark:text-folium-dark-text">
                                            {device.deviceName}
                                        </span>
                                        <span className="font-sans text-[11px] text-[#717F9A] dark:text-[#8895AD]">
                                            Paired {new Date(device.pairedAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setDeviceToRemove(device)}
                                    className="font-sans text-[12px] text-[#717F9A] dark:text-[#8895AD] hover:text-red-500"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between pb-2">
                <div className="flex flex-col">
                    <span className="font-sans text-[14px] font-medium text-[#344054] dark:text-folium-dark-text">
                        Vault
                    </span>
                    <span className="font-sans text-[12px] text-[#717F9A] dark:text-[#8895AD]">
                        {vaultPath || 'Not connected'}
                    </span>
                </div>
            </div>

            {showAddDevice && <AddDeviceModal onClose={() => setShowAddDevice(false)} />}
            {showJoinVault && <JoinVaultScreen onClose={() => setShowJoinVault(false)} onSuccess={() => { setShowJoinVault(false); setPairedDevices(syncManager.getPairedDevices()) }} />}
            {deviceToRemove && (
                <RemoveDeviceModal 
                    device={deviceToRemove} 
                    onClose={() => setDeviceToRemove(null)} 
                    onSuccess={handleRemoveDevice}
                />
            )}
        </div>
    )
}

function SectionWorkspaces({
    workspaces,
    activeWorkspaceId,
    onRemoveWorkspace,
    onUpdateWorkspaceName
}: {
    workspaces: Workspace[]
    activeWorkspaceId: string | null
    onRemoveWorkspace: (id: string) => void
    onUpdateWorkspaceName: (id: string, newName: string) => void
}) {
    return (
        <div id="settings-workspaces" className="flex flex-col gap-5 scroll-mt-6">
            <div className="flex justify-between items-start pt-2">
                <h4 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#717F9A] dark:text-[#8895AD]">Workspaces</h4>
            </div>
            <div className="flex flex-col gap-3">
                {workspaces.map((workspace) => (
                    <WorkspaceRow
                        key={workspace.id}
                        workspace={workspace}
                        isActive={workspace.id === activeWorkspaceId}
                        onUpdateName={(name) => onUpdateWorkspaceName(workspace.id, name)}
                        onRemove={() => onRemoveWorkspace(workspace.id)}
                    />
                ))}
                {workspaces.length === 0 && (
                    <div className="px-4 py-8 text-center text-[13px] text-folium-text-secondary dark:text-folium-dark-text-secondary/70 border border-dashed border-folium-border dark:border-folium-dark-border/50 rounded-xl">
                        No workspaces connected
                    </div>
                )}
            </div>
        </div>
    )
}

// ---------------------------------------------------------
// Main Modal Export
// ---------------------------------------------------------

export function SettingsModal({
    onClose,
    workspaces,
    activeWorkspaceId,
    onRemoveWorkspace,
    onUpdateWorkspaceName,
    vaultPath
}: SettingsModalProps) {
    const [activeSection, setActiveSection] = useState('appearance')
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const showSync = vaultPath ? isSyncRuntimeEnabledForVault(vaultPath) : false

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

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 dark:bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 p-4 sm:p-6"
            onMouseDown={onClose}
        >
            <div
                className="bg-[#FCFBFA] dark:bg-folium-dark-bg border border-folium-border dark:border-folium-dark-border rounded-xl shadow-2xl w-full max-w-[840px] h-[640px] max-h-[90vh] pointer-events-auto animate-in zoom-in-[0.98] duration-200 flex overflow-hidden"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <SettingsSidebar activeSection={activeSection} onScrollToSection={scrollToSection} showSync={showSync} />

                {/* Right Content */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#FDFCFB] dark:bg-folium-dark-bg">
                    {/* Header */}
                    <div className="flex items-center justify-between px-10 pt-8 pb-4 border-b border-folium-border dark:border-folium-dark-border/50">
                        <h3 className="font-serif text-[22px] text-[#344054] dark:text-folium-dark-text font-normal">Settings</h3>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-folium-text-secondary hover:text-folium-text dark:text-folium-dark-text-secondary dark:hover:text-folium-dark-text rounded-md transition-colors -mr-2"
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
                            {showSync && <SectionSync vaultPath={vaultPath} />}
                            <SectionAppearance />
                            <SectionTypography />
                            <SectionWritingModes />
                            <SectionImageCache />
                            <SectionWorkspaces
                                workspaces={workspaces}
                                activeWorkspaceId={activeWorkspaceId}
                                onRemoveWorkspace={onRemoveWorkspace}
                                onUpdateWorkspaceName={onUpdateWorkspaceName}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
