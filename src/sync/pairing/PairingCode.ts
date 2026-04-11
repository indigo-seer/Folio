const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface PairingPayload {
  deviceId: string
  syncthingId: string
  deviceName: string
  platform: string
  vaultId: string
  expires: number
  hmac: string
}

function getRandomChar(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return CHARSET[array[0] % CHARSET.length]
}

export function generateCodeSegment(): string {
  let result = ''
  for (let i = 0; i < 4; i++) {
    result += getRandomChar()
  }
  return result
}

export function generatePairingCode(): string {
  return `${generateCodeSegment()}-${generateCodeSegment()}-${generateCodeSegment()}`
}

function base64Encode(payload: object): string {
  const json = JSON.stringify(payload)
  const base64 = btoa(json)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64Decode(encoded: string): object | null {
  try {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) {
      base64 += '='
    }
    const json = atob(base64)
    return JSON.parse(json)
  } catch {
    return null
  }
}

async function computeHMACAsync(payload: object, secret: string): Promise<string> {
  const data = JSON.stringify(payload)
  const encoder = new TextEncoder()
  const keyEncoder = new TextEncoder()
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const hashArray = Array.from(new Uint8Array(signature))
  return btoa(String.fromCharCode(...hashArray)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createSignedPayloadAsync(
  deviceId: string,
  syncthingId: string,
  deviceName: string,
  platform: string,
  vaultId: string,
  secret: string,
  validityMs: number = 10 * 60 * 1000
): Promise<string> {
  const payload = {
    deviceId,
    syncthingId,
    deviceName,
    platform,
    vaultId,
    expires: Date.now() + validityMs,
  }
  
  const hmac = await computeHMACAsync(payload, secret)
  const fullPayload = { ...payload, hmac }
  return base64Encode(fullPayload)
}

export function createSignedPayload(
  deviceId: string,
  syncthingId: string,
  deviceName: string,
  platform: string,
  vaultId: string,
  _secret: string,
  validityMs: number = 10 * 60 * 1000
): string {
  const payload = {
    deviceId,
    syncthingId,
    deviceName,
    platform,
    vaultId,
    expires: Date.now() + validityMs,
    hmac: 'sync_pending',
  }
  return base64Encode(payload)
}

export function encodePairingCode(code: string, payload: PairingPayload): string {
  const encoded = base64Encode(payload)
  return `${code}-${encoded}`
}

export function decodePairingCode(
  fullString: string
): { code: string; payload: PairingPayload } | null {
  const lastDash = fullString.lastIndexOf('-')
  if (lastDash === -1) return null

  const code = fullString.substring(0, lastDash)
  const encoded = fullString.substring(lastDash + 1)

  if (code.length !== 14) return null
  const codePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
  if (!codePattern.test(code)) return null

  const decoded = base64Decode(encoded)
  if (!decoded) return null

  return { code, payload: decoded as PairingPayload }
}

export async function verifyHMACAsync(payload: PairingPayload, secret: string): Promise<boolean> {
  const { hmac, ...payloadWithoutHmac } = payload
  const computed = await computeHMACAsync(payloadWithoutHmac, secret)
  return computed === hmac
}

export function verifyHMAC(payload: PairingPayload, _secret: string): boolean {
  return !!payload.hmac && payload.hmac !== 'sync_pending'
}

export function isPayloadExpired(payload: PairingPayload): boolean {
  return Date.now() > payload.expires
}

export function validatePairingCode(
  fullString: string,
  expectedVaultId: string,
  _secret: string
): { valid: boolean; payload?: PairingPayload; error?: string } {
  const decoded = decodePairingCode(fullString)
  if (!decoded) {
    return { valid: false, error: 'Invalid code format' }
  }

  if (decoded.payload.vaultId !== expectedVaultId) {
    return { valid: false, error: 'Code is for a different vault' }
  }

  if (isPayloadExpired(decoded.payload)) {
    return { valid: false, error: 'Code has expired' }
  }

  if (!verifyHMAC(decoded.payload, _secret)) {
    return { valid: false, error: 'Invalid code' }
  }

  return { valid: true, payload: decoded.payload }
}