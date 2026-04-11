import { useEffect, useState } from 'react'
import { syncManager } from '../index'
import { isSyncRuntimeEnabledForVault } from '../bootstrap'

interface SyncStatusDotProps {
    vaultPath: string | null
}

export function SyncStatusDot({ vaultPath }: SyncStatusDotProps) {
    const [status, setStatus] = useState<'disabled' | 'inactive' | 'active' | 'error'>('disabled')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!vaultPath || !isSyncRuntimeEnabledForVault(vaultPath)) {
            setStatus('disabled')
            return
        }

        const syncStatus = syncManager.getStatus()
        
        if (!syncStatus.syncthingRunning && syncStatus.lastError) {
            setStatus('error')
            setError(syncStatus.lastError)
        } else if (syncStatus.syncthingRunning) {
            setStatus('active')
            setError(null)
        } else {
            setStatus('inactive')
        }

        const interval = setInterval(() => {
            const currentStatus = syncManager.getStatus()
            if (!currentStatus.syncthingRunning && currentStatus.lastError) {
                setStatus('error')
                setError(currentStatus.lastError)
            } else if (currentStatus.syncthingRunning) {
                setStatus('active')
                setError(null)
            } else {
                setStatus('inactive')
            }
        }, 5000)

        return () => clearInterval(interval)
    }, [vaultPath])

    if (status === 'disabled') {
        return null
    }

    const colors = {
        inactive: 'bg-amber-500',
        active: 'bg-green-500',
        error: 'bg-red-500',
    }

    const tooltips = {
        inactive: 'Sync starting...',
        active: 'Sync active',
        error: error || 'Sync error',
    }

    return (
        <div
            className={`w-2.5 h-2.5 rounded-full ${colors[status]} transition-colors duration-300`}
            title={tooltips[status]}
        />
    )
}