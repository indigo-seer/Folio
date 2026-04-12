import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { syncManager } from '../index'
import { generateQRDataURI, formatCodeForDisplay } from '../pairing/QRCode'

interface AddDeviceModalProps {
    onClose: () => void
}

export function AddDeviceModal({ onClose }: AddDeviceModalProps) {
    const [code, setCode] = useState<string>('')
    const [pairingToken, setPairingToken] = useState<string>('')
    const [qrDataUrl, setQrDataUrl] = useState<string>('')
    const [expiresAt, setExpiresAt] = useState<Date | null>(null)
    const [timeLeft, setTimeLeft] = useState<string>('')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [copiedToken, setCopiedToken] = useState(false)
    const cancelFnRef = useRef<(() => void) | null>(null)

    useEffect(() => {
        let mounted = true

        const startPairing = async () => {
            try {
                const session = await syncManager.startPairing()
                if (!mounted) return

                cancelFnRef.current = session.cancel
                setCode(session.code)
                setPairingToken(session.pairingToken)
                setExpiresAt(session.expiresAt)

                const qr = await generateQRDataURI(session.qrData)
                if (!mounted) return
                setQrDataUrl(qr)
                setIsLoading(false)
            } catch (err) {
                if (!mounted) return
                setError(err instanceof Error ? err.message : 'Failed to start pairing')
                setIsLoading(false)
            }
        }

        startPairing()
        syncManager.startHandshakePolling()

        return () => {
            mounted = false
            syncManager.stopHandshakePolling()
            if (cancelFnRef.current) {
                cancelFnRef.current()
            }
        }
    }, [])

    useEffect(() => {
        if (!expiresAt) return

        const updateTime = () => {
            const remaining = expiresAt.getTime() - Date.now()
            if (remaining <= 0) {
                setTimeLeft('Expired')
                return
            }

            const minutes = Math.floor(remaining / 60000)
            const seconds = Math.floor((remaining % 60000) / 1000)
            setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`)
        }

        updateTime()
        const interval = setInterval(updateTime, 1000)

        return () => clearInterval(interval)
    }, [expiresAt])

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose()
        }
    }

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handleCopyToken = async () => {
        if (!pairingToken) return
        try {
            await navigator.clipboard.writeText(pairingToken)
            setCopiedToken(true)
            setTimeout(() => setCopiedToken(false), 1500)
        } catch {
            setError('Could not copy token. Please copy manually from QR flow.')
        }
    }

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative bg-white dark:bg-folium-dark-bg-secondary rounded-2xl shadow-2xl w-[400px] max-w-[90vw] p-6">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 text-[#717F9A] hover:text-[#344054] dark:text-[#8895AD] dark:hover:text-folium-dark-text transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="font-sans text-[20px] font-semibold text-[#344054] dark:text-folium-dark-text mb-2">
                    Add Device
                </h2>
                <p className="font-sans text-[14px] text-[#717F9A] dark:text-[#8895AD] mb-6">
                    Open Folium on your other device and scan this code, or type it manually.
                </p>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 border-2 border-folium-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <span className="font-sans text-[14px] text-red-600 dark:text-red-400">{error}</span>
                    </div>
                ) : (
                    <>
                        {qrDataUrl && (
                            <div className="flex justify-center mb-6">
                                <div className="p-4 bg-white rounded-xl border border-folium-border dark:border-folium-dark-border">
                                    <img
                                        src={qrDataUrl}
                                        alt="Pairing QR Code"
                                        className="w-[200px] h-[200px]"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="text-center mb-4">
                            <div className="font-sans text-[18px] font-medium text-[#344054] dark:text-folium-dark-text tracking-wider">
                                {formatCodeForDisplay(code)}
                            </div>
                        </div>

                        <div className="text-center mb-6">
                            <button
                                onClick={handleCopyToken}
                                className="font-sans text-[13px] text-folium-accent dark:text-folium-dark-accent hover:underline"
                            >
                                {copiedToken ? 'Copied full pairing token' : 'Copy full pairing token'}
                            </button>
                            <p className="mt-2 font-sans text-[12px] text-[#717F9A] dark:text-[#8895AD]">
                                Manual entry requires full token paste or QR scan.
                            </p>
                        </div>

                        <div className="flex items-center justify-center gap-2 mb-6">
                            <span className="font-sans text-[14px] text-[#717F9A] dark:text-[#8895AD]">
                                Expires in
                            </span>
                            <span className={`font-sans text-[16px] font-medium ${timeLeft === 'Expired' ? 'text-red-500' : 'text-[#344054] dark:text-folium-dark-text'}`}>
                                {timeLeft}
                            </span>
                        </div>

                        {timeLeft !== 'Expired' && (
                            <div className="text-center pt-4 border-t border-folium-border/50 dark:border-folium-dark-border/50">
                                <p className="font-sans text-[13px] text-[#717F9A] dark:text-[#8895AD]">
                                    Waiting for other device...
                                </p>
                                <div className="flex items-center justify-center gap-1 mt-2">
                                    <span className="w-2 h-2 rounded-full bg-folium-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 rounded-full bg-folium-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 rounded-full bg-folium-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>,
        document.body
    )
}
