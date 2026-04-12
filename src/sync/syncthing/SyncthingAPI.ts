import { isTauri } from '../../lib/config'

export interface SyncthingDevice {
    deviceId: string
    name: string
    connected: boolean
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<T>(command, args)
}

class SyncthingAPI {
    private cachedPort: number | null = null
    private cachedApiKey: string | null = null

    setConnectionInfo(port: number, apiKey: string): void {
        this.cachedPort = port
        this.cachedApiKey = apiKey
    }

    private async getPortAndKey(): Promise<{ port: number; apiKey: string }> {
        if (this.cachedPort && this.cachedApiKey) {
            return { port: this.cachedPort, apiKey: this.cachedApiKey }
        }

        const connInfo = await tauriInvoke<{ port: number; apiKey: string }>('get_syncthing_connection_info')
        this.cachedPort = connInfo.port
        this.cachedApiKey = connInfo.apiKey
        return connInfo
    }

    private async request<T>(endpoint: string, method: string = 'GET', body?: object): Promise<T> {
        const { port, apiKey } = await this.getPortAndKey()

        const options: RequestInit = {
            method,
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json',
            },
        }

        if (body) {
            options.body = JSON.stringify(body)
        }

        const response = await fetch(`http://127.0.0.1:${port}/rest${endpoint}`, options)

        if (!response.ok) {
            throw new Error(`Syncthing API error: ${response.status} ${response.statusText}`)
        }

        if (response.status === 204) {
            return {} as T
        }

        return response.json()
    }

    async getLocalDevices(): Promise<string[]> {
        if (!isTauri()) return []
        try {
            const res = await this.request<Record<string, unknown>>('/system/discovery')
            return Object.keys(res || {})
        } catch {
            return []
        }
    }

    async getEvents(since: number = 0, limit: number = 100): Promise<Array<{ id: number; type: string; time: string; data: any }>> {
        if (!isTauri()) return []
        try {
            return await this.request<Array<any>>(`/events?since=${since}&limit=${limit}`)
        } catch {
            return []
        }
    }

    async getDeviceId(): Promise<string> {
        if (!isTauri()) {
            return 'dev-' + Math.random().toString(36).substring(2, 10)
        }

        try {
            return await tauriInvoke<string>('get_syncthing_device_id')
        } catch {
            return 'dev-' + Math.random().toString(36).substring(2, 10)
        }
    }

    async getDevices(): Promise<SyncthingDevice[]> {
        if (!isTauri()) return []

        try {
            const devices = await tauriInvoke<Array<{ deviceId: string; name: string; connected: boolean }>>('get_syncthing_devices')
            return devices
        } catch {
            return []
        }
    }

    async addDevice(deviceId: string, deviceName: string): Promise<void> {
        if (!isTauri()) return
        await tauriInvoke('add_syncthing_device', { deviceId, deviceName })
    }

    async removeDevice(deviceId: string): Promise<void> {
        if (!isTauri()) return
        await tauriInvoke('remove_syncthing_device', { deviceId })
    }

    async shareFolderWithDevice(folderId: string, deviceId: string): Promise<void> {
        if (!isTauri()) return
        await tauriInvoke('share_syncthing_folder', { folderId, deviceId })
    }

    async pauseDevice(deviceId: string): Promise<void> {
        if (!isTauri()) return
        await this.request(`/db/pause/${deviceId}`, 'POST')
    }

    async resumeDevice(deviceId: string): Promise<void> {
        if (!isTauri()) return
        await this.request(`/db/resume/${deviceId}`, 'POST')
    }

    async getConnectionStatus(): Promise<{ connected: boolean; version: string }> {
        if (!isTauri()) {
            return { connected: false, version: '' }
        }

        try {
            const ping = await this.request<{ ping: string }>('/system/ping')
            return { connected: ping.ping === 'pong', version: '' }
        } catch {
            return { connected: false, version: '' }
        }
    }
}

export const syncthingAPI = new SyncthingAPI()