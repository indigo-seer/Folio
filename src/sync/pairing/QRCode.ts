import QRCodeLib from 'qrcode'

export async function generateQRDataURI(content: string): Promise<string> {
  return QRCodeLib.toDataURL(content, {
    width: 256,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  })
}

export function formatCodeForDisplay(code: string): string {
  const parts = code.split('-')
  return parts.join('  ·  ')
}

export function parseCodeFromInput(input: string): string {
  const cleaned = input.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  // First format the code portion (first 12 alphanumeric chars = 4-4-4 format with dashes)
  const codeChars = cleaned.substring(0, 12)
  const codeFormatted = codeChars.match(/.{1,4}/g)?.join('-') || codeChars
  // Keep the full string including any payload characters that follow
  // The payload is base64-like and starts after the 14-char code
  return codeFormatted + cleaned.substring(12)
}

export type PairingInputKind = 'full_token' | 'short_code' | 'invalid'

function classifyPairingToken(candidate: string): { kind: PairingInputKind; token?: string } {
  const trimmed = candidate.trim()
  if (!trimmed) {
    return { kind: 'invalid' }
  }

  const shortCodePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
  if (shortCodePattern.test(trimmed)) {
    return { kind: 'short_code', token: trimmed }
  }

  const fullTokenPattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Za-z0-9_-]+$/
  if (fullTokenPattern.test(trimmed)) {
    return { kind: 'full_token', token: trimmed }
  }

  return { kind: 'invalid' }
}

export function normalizePairingTokenInput(input: string): { kind: PairingInputKind; token?: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return { kind: 'invalid' }
  }

  if (trimmed.startsWith('folium://pair?')) {
    const match = trimmed.match(/[?&]code=([^&]+)/)
    if (!match) {
      return { kind: 'invalid' }
    }
    try {
      const decoded = decodeURIComponent(match[1])
      return classifyPairingToken(decoded)
    } catch {
      return { kind: 'invalid' }
    }
  }

  return classifyPairingToken(trimmed)
}
