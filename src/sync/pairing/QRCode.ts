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
  const formatted = cleaned.match(/.{1,4}/g)?.join('-') || cleaned
  return formatted.substring(0, 14)
}