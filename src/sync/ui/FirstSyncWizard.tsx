import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, FolderOpen, Check } from 'lucide-react'
import { getDefaultVaultPath } from '../vaultRegistry'
import { syncManager, syncRuntimeForVault } from '../index'
import type { VaultInfo } from '../vaultRegistry'
import { loadConfig, saveConfig } from '../../lib/config'

interface FirstSyncWizardProps {
    newVaults: VaultInfo[]
    onComplete: () => void
    onCancel: () => void
}

export function FirstSyncWizard({ newVaults, onComplete, onCancel }: FirstSyncWizardProps) {
    const [selectedVaults, setSelectedVaults] = useState<Map<string, string>>(new Map())
    const [isSyncing, setIsSyncing] = useState(false)
    const [customPaths, setCustomPaths] = useState<Map<string, boolean>>(new Map())
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const initVaults = async () => {
            const map = new Map<string, string>()
            for (const vault of newVaults) {
                const defaultPath = await getDefaultVaultPath(vault.name)
                map.set(vault.name, defaultPath)
            }
            setSelectedVaults(map)
            setIsLoading(false)
        }
        initVaults()
    }, [newVaults])

    const toggleVault = async (vaultName: string) => {
        const newSelected = new Map(selectedVaults)
        if (newSelected.has(vaultName)) {
            newSelected.delete(vaultName)
        } else {
            const defaultPath = await getDefaultVaultPath(vaultName)
            newSelected.set(vaultName, defaultPath)
        }
        setSelectedVaults(newSelected)
    }

    const updateVaultPath = (vaultName: string, newPath: string) => {
        const newSelected = new Map(selectedVaults)
        newSelected.set(vaultName, newPath)
        setSelectedVaults(newSelected)
    }

    const syncToDefault = async () => {
        setIsSyncing(true)

        const config = await loadConfig()

        for (const [vaultName, vaultPath] of selectedVaults) {
            try {
                try {
                    const { mkdir } = await import('@tauri-apps/plugin-fs')
                    await mkdir(vaultPath, { recursive: true })
                } catch (e) {
                    console.warn(`Could not create or verify path: ${vaultPath}`, e)
                }

                await syncManager.addVaultToSync(vaultName, vaultPath)
                if (!config.workspaces) config.workspaces = []
                if (!config.workspaces.find(w => w.path === vaultPath)) {
                    config.workspaces.push({
                        id: `workspace-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                        path: vaultPath,
                        displayName: vaultName,
                        lastOpened: Date.now(),
                        createdAt: Date.now()
                    })
                }
            } catch (err) {
                console.error(`Failed to add vault ${vaultName}:`, err)
            }
        }

        await saveConfig(config)
        await syncRuntimeForVault(config)

        setIsSyncing(false)
        onComplete()
    }

    const chooseCustomLocations = async () => {
        const next = new Map(selectedVaults)
        try {
            const { open } = await import('@tauri-apps/plugin-dialog')
            for (const vault of newVaults) {
                if (!next.has(vault.name)) continue
                const current = next.get(vault.name) || ''
                const chosen = await open({
                    directory: true,
                    multiple: false,
                    title: `Choose location for "${vault.name}"`,
                    defaultPath: current
                })
                if (chosen && typeof chosen === 'string') {
                    next.set(vault.name, chosen.trim())
                    setCustomPaths(prev => new Map(prev).set(vault.name, true))
                } else {
                    break // User cancelled the sequence
                }
            }
        } catch (err) {
            console.error('Failed to open dialog', err)
        }
        setSelectedVaults(next)
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onCancel])

    if (isLoading) {
        return createPortal(
            <div className="fixed inset-0 z-[150] flex items-center justify-center">
                <div className="relative bg-white dark:bg-folium-dark-bg-secondary rounded-2xl shadow-2xl w-[500px] max-w-[90vw] p-8 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-folium-accent border-t-transparent rounded-full animate-spin" />
                </div>
            </div>,
            document.body
        )
    }

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onCancel}
            />
            <div className="relative bg-white dark:bg-folium-dark-bg-secondary rounded-2xl shadow-2xl w-[500px] max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-folium-border dark:border-folium-dark-border">
                    <div>
                        <h2 className="font-sans text-[20px] font-semibold text-[#344054] dark:text-folium-dark-text">
                            New vaults detected
                        </h2>
                        <p className="font-sans text-[14px] text-[#717F9A] dark:text-[#8895AD] mt-1">
                            Choose where to sync these vaults
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1 text-[#717F9A] hover:text-[#344054] dark:text-[#8895AD] dark:hover:text-folium-dark-text transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="flex flex-col gap-3">
                        {newVaults.map(vault => {
                            const isSelected = selectedVaults.has(vault.name)
                            const currentPath = selectedVaults.get(vault.name) || ''

                            return (
                                <div
                                    key={vault.name}
                                    className={`p-4 rounded-xl border transition-colors ${isSelected
                                        ? 'border-folium-accent dark:border-folium-dark-accent bg-folium-accent/5 dark:bg-folium-dark-accent/5'
                                        : 'border-folium-border dark:border-folium-dark-border'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleVault(vault.name)}
                                            className="w-5 h-5 rounded border-folium-border dark:border-folium-dark-border text-folium-accent focus:ring-folium-accent"
                                        />
                                        <div className="flex-1">
                                            <div className="font-sans text-[15px] font-medium text-[#344054] dark:text-folium-dark-text">
                                                {vault.name}
                                            </div>
                                            <div className="font-sans text-[13px] text-[#717F9A] dark:text-[#8895AD] mt-1 flex items-center gap-1">
                                                <FolderOpen className="w-3.5 h-3.5" />
                                                <span className="truncate">{currentPath}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {isSelected && (
                                        <div className="mt-3 ml-8">
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const { open } = await import('@tauri-apps/plugin-dialog')
                                                        const newPath = await open({
                                                            directory: true,
                                                            multiple: false,
                                                            title: `Choose location for "${vault.name}"`,
                                                            defaultPath: currentPath
                                                        })
                                                        if (newPath && typeof newPath === 'string' && newPath.trim()) {
                                                            updateVaultPath(vault.name, newPath.trim())
                                                            setCustomPaths(new Map(customPaths).set(vault.name, true))
                                                        }
                                                    } catch (err) {
                                                        console.error('Failed to open dialog', err)
                                                    }
                                                }}
                                                className="font-sans text-[13px] text-folium-accent dark:text-folium-dark-accent hover:underline"
                                            >
                                                Choose different location...
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="p-6 border-t border-folium-border dark:border-folium-dark-border">
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-2.5 px-4 bg-[#F8F7F6] dark:bg-folium-dark-bg text-[#344054] dark:text-folium-dark-text font-sans text-[14px] font-medium rounded-lg transition-colors hover:bg-[#EBE9E6] dark:hover:bg-folium-dark-border"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={syncToDefault}
                            disabled={isSyncing || selectedVaults.size === 0}
                            className="flex-1 py-2.5 px-4 bg-folium-accent hover:bg-folium-accent/90 disabled:bg-[#D0D0D0] text-white font-sans text-[14px] font-medium rounded-lg transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSyncing ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Syncing...
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    Sync {selectedVaults.size} vault{selectedVaults.size !== 1 ? 's' : ''} to default location
                                </>
                            )}
                        </button>
                    </div>
                    <div className="mt-3 text-center">
                        <button
                            onClick={chooseCustomLocations}
                            className="font-sans text-[13px] text-folium-accent dark:text-folium-dark-accent hover:underline"
                        >
                            Let me choose where to sync
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
