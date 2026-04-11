import { useEffect, useState } from 'react'
import { syncManager } from '../index'
import { isSyncRuntimeEnabledForVault } from '../bootstrap'
import type { PairedDevice } from '../types'

interface SyncSettingsProps {
    vaultPath: string | null
    onOpenAddDevice: () => void
    onOpenRemoveDevice: (device: PairedDevice) => void
    onRenameDevice: (newName: string) => void
}

export function SyncSettings({ 
    vaultPath, 
    onOpenAddDevice, 
    onOpenRemoveDevice,
    onRenameDevice 
}: SyncSettingsProps) {
    const [status, setStatus] = useState<{
        enabled: boolean
        syncthingRunning: boolean
        lastError: string | null
        vaultPath: string | null
    }>({
        enabled: false,
        syncthingRunning: false,
        lastError: null,
        vaultPath: null,
    })
    const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([])
    const [deviceName, setDeviceName] = useState<string | null>(null)
    const [isEditingName, setIsEditingName] = useState(false)
    const [tempName, setTempName] = useState('')

    useEffect(() => {
        if (!vaultPath || !isSyncRuntimeEnabledForVault(vaultPath)) {
            setStatus({
                enabled: false,
                syncthingRunning: false,
                lastError: null,
                vaultPath: null,
            })
            return
        }

        const syncStatus = syncManager.getStatus()
        setStatus({
            enabled: true,
            syncthingRunning: syncStatus.syncthingRunning,
            lastError: syncStatus.lastError,
            vaultPath: syncStatus.vaultPath,
        })

        setPairedDevices(syncManager.getPairedDevices())
        setDeviceName(syncManager.getDeviceName())

        const interval = setInterval(() => {
            const currentStatus = syncManager.getStatus()
            setStatus({
                enabled: true,
                syncthingRunning: currentStatus.syncthingRunning,
                lastError: currentStatus.lastError,
                vaultPath: currentStatus.vaultPath,
            })
            setPairedDevices(syncManager.getPairedDevices())
        }, 3000)

        return () => clearInterval(interval)
    }, [vaultPath])

    const handleSaveName = async () => {
        const trimmed = tempName.trim()
        if (trimmed && trimmed !== deviceName) {
            await onRenameDevice(trimmed)
            setDeviceName(trimmed)
        }
        setIsEditingName(false)
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
                    <button
                        onClick={onOpenAddDevice}
                        className="font-sans text-[13px] text-folium-accent dark:text-folium-dark-accent hover:underline"
                    >
                        + Add Device
                    </button>
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
                                    onClick={() => onOpenRemoveDevice(device)}
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
                        {status.vaultPath || 'Not connected'}
                    </span>
                </div>
            </div>
        </div>
    )
}