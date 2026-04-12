import { isTauri, type FoliumConfig } from '../lib/config'
import { generatePairingCode, createSignedPayload, validatePairingCode } from './pairing/PairingCode'
import { VaultSyncWatcher } from './VaultSyncWatcher'
import { syncthingAPI } from './syncthing/SyncthingAPI'
import { getOrCreateVaultUid } from '../lib/vaultIdentity'

async function getVaultId(vaultPath: string | null): Promise<string> {
    if (!vaultPath) return 'folium-default'
    const uid = await getOrCreateVaultUid(vaultPath)
    return `folium-${uid}`
}

export interface SyncthingStartResult {
    running: boolean
    port: number
    apiKey: string
    pid: number
}

export interface SyncthingHealthResult {
    running: boolean
    wasStarted: boolean
    pid: number | null
    port: number | null
    lastExitCode: number | null
}

export interface SyncthingDevice {
    deviceId: string
    name: string
    connected: boolean
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<T>(command, args)
}

async function waitForSyncthingReady(port: number, apiKey: string, timeoutMs: number = 10_000): Promise<void> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/rest/system/ping`, {
                headers: {
                    'X-API-Key': apiKey,
                },
            })

            if (response.ok) {
                return
            }
        } catch {
            // Startup polling expected to fail until Syncthing binds the API port.
        }

        await new Promise(resolve => setTimeout(resolve, 300))
    }

    throw new Error(`Syncthing REST API did not become ready within ${timeoutMs}ms`)
}

class SyncthingDesktopManager {
    async start(vaultPath: string): Promise<SyncthingStartResult> {
        return this.startWithVaults(vaultPath, [{ name: 'vault', path: vaultPath }])
    }

    async startWithVaults(_primaryVaultPath: string, vaults: Array<{ name: string; path: string }>): Promise<SyncthingStartResult> {
        if (!isTauri()) {
            throw new Error('Syncthing desktop sidecar is only supported in Tauri runtime')
        }

        const vaultPaths = vaults.map(v => [v.path, v.name] as [string, string])
        const result = await tauriInvoke<SyncthingStartResult>('start_syncthing_sidecar', { vaultPaths })
        await waitForSyncthingReady(result.port, result.apiKey)

        syncthingAPI.setConnectionInfo(result.port, result.apiKey)

        return result
    }

    async stop(): Promise<void> {
        if (!isTauri()) return
        await tauriInvoke('stop_syncthing_sidecar')
    }

    async health(): Promise<SyncthingHealthResult> {
        if (!isTauri()) {
            return {
                running: false,
                wasStarted: false,
                pid: null,
                port: null,
                lastExitCode: null,
            }
        }
        return tauriInvoke<SyncthingHealthResult>('syncthing_sidecar_status')
    }

    async getDeviceId(): Promise<string> {
        if (!isTauri()) {
            return 'dev-' + Math.random().toString(36).substring(2, 10)
        }
        return syncthingAPI.getDeviceId()
    }

    async getConnectedDevices(): Promise<SyncthingDevice[]> {
        if (!isTauri()) return []

        try {
            return await syncthingAPI.getDevices()
        } catch {
            return []
        }
    }

    async addPeerDevice(syncthingId: string, deviceName: string): Promise<void> {
        if (!isTauri()) return
        await syncthingAPI.addDevice(syncthingId, deviceName)
    }

    async shareFolderWithDevice(folderId: string, deviceId: string): Promise<void> {
        if (!isTauri()) return
        await syncthingAPI.shareFolderWithDevice(folderId, deviceId)
    }

    async waitForIncomingDevice(timeoutMs: number = 60_000): Promise<string | null> {
        const startedAt = Date.now()

        while (Date.now() - startedAt < timeoutMs) {
            const devices = await this.getConnectedDevices()
            const newDevices = devices.filter(d => d.connected)
            if (newDevices.length > 0) {
                return newDevices[0].deviceId
            }
            await new Promise(resolve => setTimeout(resolve, 2_000))
        }

        return null
    }
}

export const syncthingDesktopManager = new SyncthingDesktopManager()

interface SyncInitializationOptions {
    deviceName?: string
}

interface SyncStatus {
    enabled: boolean
    vaultPath: string | null
    lastInitializedAt: string | null
    syncthingRunning: boolean
    lastError: string | null
}

type EventHandler = (...args: unknown[]) => void

class SyncManager {
    private initializedVaultPath: string | null = null
    private lastInitializedAt: string | null = null
    private syncthingRunning = false
    private lastError: string | null = null
    private healthMonitorTimer: ReturnType<typeof setInterval> | null = null
    private restartAttempts: number[] = []
    private watcher = new VaultSyncWatcher()
    private eventHandlers: Map<string, Set<EventHandler>> = new Map()
    private config: FoliumConfig | null = null

    async initialize(vaultPath: string, _options: SyncInitializationOptions = {}): Promise<void> {
        if (!vaultPath) {
            throw new Error('SyncManager.initialize requires a vault path')
        }

        if (this.initializedVaultPath === vaultPath) {
            return
        }

        if (this.initializedVaultPath) {
            await this.shutdown()
        }

        this.initializedVaultPath = vaultPath
        this.lastInitializedAt = new Date().toISOString()
        this.lastError = null

        if (isTauri()) {
            try {
                await syncthingDesktopManager.start(vaultPath)
                this.syncthingRunning = true
                this.startHealthMonitor()
            } catch (err) {
                this.syncthingRunning = false
                this.lastError = err instanceof Error ? err.message : String(err)
            }
        }

        await this.watcher.start(vaultPath)
    }

    async shutdown(): Promise<void> {
        this.stopHealthMonitor()
        this.restartAttempts = []

        if (isTauri()) {
            try {
                await syncthingDesktopManager.stop()
            } catch (err) {
                this.lastError = err instanceof Error ? err.message : String(err)
            }
        }

        this.watcher.stop()

        this.initializedVaultPath = null
        this.syncthingRunning = false
    }

    getStatus(): SyncStatus {
        return {
            enabled: this.initializedVaultPath !== null,
            vaultPath: this.initializedVaultPath,
            lastInitializedAt: this.lastInitializedAt,
            syncthingRunning: this.syncthingRunning,
            lastError: this.lastError,
        }
    }

    setConfig(config: FoliumConfig): void {
        this.config = config
    }

    getPairedDevices() {
        return this.config?.sync.pairedDevices || []
    }

    getDeviceName(): string | null {
        return this.config?.sync.deviceName || null
    }

    async updateDeviceName(newName: string): Promise<void> {
        if (!this.config) {
            throw new Error('Sync not configured')
        }

        this.config.sync.deviceName = newName

        const { saveConfig } = await import('../lib/config')
        await saveConfig(this.config)
    }

    async startPairing(): Promise<{ code: string; pairingToken: string; qrData: string; expiresAt: Date; cancel: () => void }> {
        if (!this.config || !this.initializedVaultPath) {
            throw new Error('Sync must be initialized before pairing')
        }

        const deviceId = this.config.sync.deviceId
        const deviceName = this.config.sync.deviceName
        const secret = this.config.sync.deviceSecret
        const vaultId = await getVaultId(this.initializedVaultPath)
        const vaultName = this.initializedVaultPath.split(/[\\/]/).pop() || 'Vault'

        if (!deviceId || !deviceName || !secret) {
            throw new Error('Device not configured for pairing')
        }

        const syncthingId = await syncthingDesktopManager.getDeviceId()
        const platform = this.getPlatform()

        const code = generatePairingCode()
        const payloadBase = await createSignedPayload(
            deviceId,
            syncthingId,
            deviceName,
            platform,
            vaultId,
            vaultName,
            secret
        )

        const pairingToken = `${code}-${payloadBase}`
        const qrData = `folium://pair?code=${encodeURIComponent(pairingToken)}`
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

        const cancel = () => { }

        return { code, pairingToken, qrData, expiresAt, cancel }
    }

    async acceptPairingCode(fullCode: string): Promise<{ status: 'paired_same_vault' | 'paired_new_vault'; incomingVault?: { id: string; name: string } }> {
        if (!this.config) {
            throw new Error('Sync not configured')
        }

        const secret = this.config.sync.deviceSecret
        const vaultId = await getVaultId(this.initializedVaultPath)

        if (!secret) {
            throw new Error('Device secret not configured')
        }

        const validation = await validatePairingCode(fullCode, vaultId, secret)

        if (!validation.valid || !validation.payload) {
            switch (validation.error) {
                case 'invalid_format':
                    throw new Error('Invalid code format. Paste full token or scan QR.')
                case 'vault_mismatch':
                    if (!validation.payload) {
                        throw new Error('Code is for a different vault')
                    }
                    return {
                        status: 'paired_new_vault',
                        incomingVault: {
                            id: validation.payload.vaultId,
                            name: validation.payload.vaultName || 'Imported Vault',
                        },
                    }
                case 'expired':
                    throw new Error('Code has expired. Ask for a new one.')
                case 'invalid_signature':
                    throw new Error('Invalid code signature')
                default:
                    throw new Error('Invalid code')
            }
        }

        const { deviceId, deviceName, syncthingId, platform, vaultId: incomingVaultId } = validation.payload

        await syncthingDesktopManager.addPeerDevice(syncthingId, deviceName)
        await syncthingDesktopManager.shareFolderWithDevice(incomingVaultId, syncthingId)

        const pairedDevices = this.config.sync.pairedDevices || []
        pairedDevices.push({
            deviceId,
            deviceName,
            syncthingId,
            platform,
            pairedAt: new Date().toISOString(),
        })

        this.config.sync.pairedDevices = pairedDevices

        const { saveConfig } = await import('../lib/config')
        await saveConfig(this.config)

        return { status: 'paired_same_vault' }
    }

    private activeHandshakePoll: ReturnType<typeof setInterval> | null = null;
    private onIncomingVaultFn: ((vault: { id: string; name: string }) => void) | null = null;

    startHandshakePolling(onIncomingVault?: (vault: { id: string; name: string }) => void) {
        if (this.activeHandshakePoll) this.stopHandshakePolling();
        this.onIncomingVaultFn = onIncomingVault || null;
        let lastEventId = 0;

        this.activeHandshakePoll = setInterval(async () => {
            if (!this.syncthingRunning) return;

            try {
                const events = await syncthingAPI.getEvents(lastEventId, 100);
                for (const ev of events) {
                    if (ev.id > lastEventId) lastEventId = ev.id;

                    if (ev.type === 'DeviceRejected') {
                        const deviceId = ev.data?.device;
                        if (deviceId) {
                            await syncthingDesktopManager.addPeerDevice(deviceId, 'Nearby Device');
                            // If we're hosting a vault, automatically share it back
                            if (this.initializedVaultPath) {
                                const vaultId = await getVaultId(this.initializedVaultPath);
                                await syncthingDesktopManager.shareFolderWithDevice(vaultId, deviceId);
                            }
                        }
                    }

                    if (ev.type === 'FolderRejected' && this.onIncomingVaultFn) {
                        const folderId = ev.data?.folder;
                        const folderLabel = ev.data?.folderLabel || 'Imported Vault';
                        const deviceId = ev.data?.device;
                        if (folderId && deviceId) {
                            await syncthingDesktopManager.addPeerDevice(deviceId, 'Nearby Device');
                            this.onIncomingVaultFn({ id: folderId, name: folderLabel });
                            this.onIncomingVaultFn = null;
                        }
                    }
                }
            } catch (err) {
                // Ignore errors
            }
        }, 1500);
    }

    stopHandshakePolling() {
        if (this.activeHandshakePoll) {
            clearInterval(this.activeHandshakePoll);
            this.activeHandshakePoll = null;
            this.onIncomingVaultFn = null;
        }
    }

    async removeDevice(deviceId: string): Promise<void> {
        if (!this.config) {
            throw new Error('Sync not configured')
        }

        const device = this.config.sync.pairedDevices?.find(d => d.deviceId === deviceId)
        if (!device) {
            throw new Error('Device not found')
        }

        if (isTauri()) {
            try {
                await syncthingAPI.removeDevice(device.syncthingId)
            } catch (err) {
                console.warn('Failed to remove Syncthing device:', err)
            }
        }

        this.config.sync.pairedDevices = this.config.sync.pairedDevices.filter(d => d.deviceId !== deviceId)

        const { saveConfig } = await import('../lib/config')
        await saveConfig(this.config)
    }

    on(event: string, handler: EventHandler): void {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set())
        }
        this.eventHandlers.get(event)!.add(handler)
    }

    off(event: string, handler: EventHandler): void {
        this.eventHandlers.get(event)?.delete(handler)
    }

    private getPlatform(): string {
        if (typeof navigator === 'undefined') return 'unknown'
        const ua = navigator.userAgent.toLowerCase()
        if (ua.includes('mac')) return 'macos'
        if (ua.includes('win')) return 'windows'
        if (ua.includes('linux')) return 'linux'
        return 'unknown'
    }

    private startHealthMonitor(): void {
        this.stopHealthMonitor()
        this.healthMonitorTimer = setInterval(() => {
            void this.checkAndHealDesktopSidecar()
        }, 5_000)
    }

    private stopHealthMonitor(): void {
        if (!this.healthMonitorTimer) return
        clearInterval(this.healthMonitorTimer)
        this.healthMonitorTimer = null
    }

    private canAttemptRestart(now: number): boolean {
        const windowMs = 10 * 60 * 1_000
        this.restartAttempts = this.restartAttempts.filter(ts => now - ts < windowMs)
        return this.restartAttempts.length < 3
    }

    private async checkAndHealDesktopSidecar(): Promise<void> {
        if (!isTauri() || !this.initializedVaultPath) return

        try {
            const health = await syncthingDesktopManager.health()
            this.syncthingRunning = health.running
            if (health.running) return
            if (!health.wasStarted) return

            const now = Date.now()
            if (!this.canAttemptRestart(now)) {
                this.lastError = 'Syncthing sidecar crashed repeatedly. Automatic restart limit reached.'
                this.stopHealthMonitor()
                return
            }

            this.restartAttempts.push(now)
            await new Promise(resolve => setTimeout(resolve, 2_000))

            if (!this.initializedVaultPath) return
            await syncthingDesktopManager.startWithVaults(this.initializedVaultPath, this.syncedVaults)
            this.syncthingRunning = true
            this.lastError = null
        } catch (err) {
            this.syncthingRunning = false
            this.lastError = err instanceof Error ? err.message : String(err)
        }
    }

    private syncedVaults: Array<{ name: string; path: string }> = []

    async initializeMultipleVaults(vaults: Array<{ name: string; path: string }>): Promise<void> {
        if (vaults.length === 0) {
            throw new Error('At least one vault is required')
        }

        if (this.initializedVaultPath) {
            await this.shutdown()
        }

        this.syncedVaults = vaults
        this.initializedVaultPath = vaults[0].path
        this.lastInitializedAt = new Date().toISOString()
        this.lastError = null

        if (isTauri()) {
            try {
                await syncthingDesktopManager.startWithVaults(vaults[0].path, vaults)
                this.syncthingRunning = true
                this.startHealthMonitor()
            } catch (err) {
                this.syncthingRunning = false
                this.lastError = err instanceof Error ? err.message : String(err)
            }
        }

        await this.watcher.start(vaults[0].path)
    }

    async addVaultToSync(vaultName: string, vaultPath: string): Promise<void> {
        if (!this.config) {
            throw new Error('Sync not configured')
        }

        if (isTauri()) {
            try {
                const { invoke } = await import('@tauri-apps/api/core')
                const folderId = await getVaultId(vaultPath)
                await invoke('add_syncthing_folder', {
                    folderId,
                    folderPath: vaultPath,
                    folderLabel: vaultName
                })
            } catch (err) {
                console.warn('Failed to add vault to Syncthing:', err)
            }
        }

        this.syncedVaults.push({ name: vaultName, path: vaultPath })
    }

    getSyncedVaults(): Array<{ name: string; path: string }> {
        return [...this.syncedVaults]
    }
}

export const syncManager = new SyncManager()
