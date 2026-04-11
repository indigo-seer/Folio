import type { FoliumConfig } from '../lib/config'

function generateDeviceId(): string {
    const array = new Uint8Array(8)
    crypto.getRandomValues(array)
    return 'folium-' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateDeviceSecret(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

function detectDeviceName(): string {
    if (typeof navigator !== 'undefined') {
        return navigator.platform || 'My Device'
    }
    return 'My Device'
}

export interface DeviceCredentials {
    deviceId: string
    deviceName: string
    deviceSecret: string
}

export function ensureDeviceCredentials(config: FoliumConfig): FoliumConfig {
    if (!config.sync) {
        config.sync = {
            enabled: false,
            deviceId: null,
            deviceName: null,
            deviceSecret: null,
            pairedDevices: [],
        }
    }

    if (!config.sync.deviceId) {
        config.sync.deviceId = generateDeviceId()
    }

    if (!config.sync.deviceSecret) {
        config.sync.deviceSecret = generateDeviceSecret()
    }

    if (!config.sync.deviceName) {
        config.sync.deviceName = detectDeviceName()
    }

    if (!config.sync.pairedDevices) {
        config.sync.pairedDevices = []
    }

    return config
}

export function renameDevice(config: FoliumConfig, newName: string): FoliumConfig {
    if (!config.sync) {
        config.sync = {
            enabled: false,
            deviceId: generateDeviceId(),
            deviceName: newName,
            deviceSecret: generateDeviceSecret(),
            pairedDevices: [],
        }
    } else {
        config.sync.deviceName = newName
    }
    return config
}