const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface PairingPayload {
  deviceId: string
  syncthingId: string
  deviceName: string
  platform: string
  vaultId: string
  vaultName: string
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
  vaultName: string,
  secret: string,
  validityMs: number = 10 * 60 * 1000
): Promise<string> {
  const payload = {
    deviceId,
    syncthingId,
    deviceName,
    platform,
    vaultId,
    vaultName,
    expires: Date.now() + validityMs,
  }
  
  const hmac = await computeHMACAsync(payload, secret)
  const fullPayload = { ...payload, hmac }
  return base64Encode(fullPayload)
}

export async function createSignedPayload(
  deviceId: string,
  syncthingId: string,
  deviceName: string,
  platform: string,
  vaultId: string,
  vaultName: string,
  secret: string,
  validityMs: number = 10 * 60 * 1000
): Promise<string> {
  return createSignedPayloadAsync(
    deviceId,
    syncthingId,
    deviceName,
    platform,
    vaultId,
    vaultName,
    secret,
    validityMs
  )
}

export function encodePairingCode(code: string, payload: PairingPayload): string {
  const encoded = base64Encode(payload)
  return `${code}-${encoded}`
}

export function decodePairingCode(
  fullString: string
): { code: string; payload: PairingPayload } | null {
  // The code portion is ALWAYS exactly 14 chars (XXXX-XXXX-XXXX format)
  // Find the position after the 14-char code plus one dash = position 15
  const CODE_LENGTH = 14 // "XXXX-XXXX-XXXX"
  
  if (fullString.length < CODE_LENGTH + 1) {
    return null
  }
  
  // Extract the code portion (first 14 chars)
  const code = fullString.substring(0, CODE_LENGTH)
  
  // Validate it's in correct format
  const codePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
  if (!codePattern.test(code)) {
    return null
  }
  
  // The payload starts at position 15 (after 14-char code + first dash)
  const encoded = fullString.substring(CODE_LENGTH + 1)
  
  if (encoded.length === 0) {
    return null
  }

  const decoded = base64Decode(encoded)
  if (!decoded) {
    return null
  }

  return { code, payload: decoded as PairingPayload }
}

export async function verifyHMACAsync(payload: PairingPayload, secret: string): Promise<boolean> {
  const { hmac, ...payloadWithoutHmac } = payload
  const computed = await computeHMACAsync(payloadWithoutHmac, secret)
  return computed === hmac
}

export async function verifyHMAC(payload: PairingPayload, secret: string): Promise<boolean> {
  return verifyHMACAsync(payload, secret)
}

export function isPayloadExpired(payload: PairingPayload): boolean {
  return Date.now() > payload.expires
}

export async function validatePairingCode(
  fullString: string,
  expectedVaultId: string,
  secret: string
): Promise<{ valid: boolean; payload?: PairingPayload; error?: string }> {
  const decoded = decodePairingCode(fullString)
  if (!decoded) {
    return { valid: false, error: 'invalid_format' }
  }

  if (decoded.payload.vaultId !== expectedVaultId) {
    return { valid: false, payload: decoded.payload, error: 'vault_mismatch' }
  }

  if (isPayloadExpired(decoded.payload)) {
    return { valid: false, error: 'expired' }
  }

  const isValid = await verifyHMAC(decoded.payload, secret)
  if (!isValid) {
    return { valid: false, error: 'invalid_signature' }
  }

  return { valid: true, payload: decoded.payload }
}
