import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle } from 'lucide-react'
import type { PairedDevice } from '../types'
import { syncManager } from '../index'

interface RemoveDeviceModalProps {
    device: PairedDevice
    onClose: () => void
    onSuccess: () => void
}

export function RemoveDeviceModal({ device, onClose, onSuccess }: RemoveDeviceModalProps) {
    const [isRemoving, setIsRemoving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleRemove = async () => {
        setIsRemoving(true)
        setError(null)

        try {
            await syncManager.removeDevice(device.deviceId)
            onSuccess()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove device')
            setIsRemoving(false)
        }
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center">
            <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative bg-white dark:bg-folium-dark-bg-secondary rounded-2xl shadow-2xl w-[380px] max-w-[90vw] p-6">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 text-[#717F9A] hover:text-[#344054] dark:text-[#8895AD] dark:hover:text-folium-dark-text transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <h2 className="font-sans text-[18px] font-semibold text-[#344054] dark:text-folium-dark-text">
                            Remove Device
                        </h2>
                        <p className="font-sans text-[13px] text-[#717F9A] dark:text-[#8895AD]">
                            {device.deviceName}
                        </p>
                    </div>
                </div>

                <p className="font-sans text-[14px] text-[#717F9A] dark:text-[#8895AD] mb-6">
                    Removing this device will stop sync between your devices. 
                    Your notes will remain on both devices.
                </p>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <span className="font-sans text-[14px] text-red-600 dark:text-red-400">{error}</span>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 px-4 bg-[#F8F7F6] dark:bg-folium-dark-bg text-[#344054] dark:text-folium-dark-text font-sans text-[14px] font-medium rounded-lg transition-colors hover:bg-[#EBE9E6] dark:hover:bg-folium-dark-border"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleRemove}
                        disabled={isRemoving}
                        className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-sans text-[14px] font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                        {isRemoving ? 'Removing...' : 'Remove'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}