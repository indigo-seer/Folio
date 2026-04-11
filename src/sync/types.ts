export interface SyncInitializationOptions {
    deviceName?: string
}

export interface SyncStatus {
    enabled: boolean
    vaultPath: string | null
    lastInitializedAt: string | null
    syncthingRunning: boolean
    lastError: string | null
}

export interface PairedDevice {
    deviceId: string
    deviceName: string
    syncthingId: string
    platform: string
    pairedAt: string
    lastSeenAt?: number
    status?: 'online' | 'offline'
}

export interface PairingSession {
    code: string
    qrData: string
    expiresAt: Date
    cancel(): void
}

export interface VaultSyncConfig {
    name: string
    path: string
}
