import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Camera, Keyboard } from 'lucide-react'
import { syncManager } from '../index'
import { parseCodeFromInput } from '../pairing/QRCode'

interface JoinVaultScreenProps {
    onClose: () => void
    onSuccess: () => void
}

export function JoinVaultScreen({ onClose, onSuccess }: JoinVaultScreenProps) {
    const [code, setCode] = useState('')
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mode, setMode] = useState<'camera' | 'manual'>('manual')

    const handleConnect = async () => {
        const cleanCode = code.replace(/[^A-Za-z0-9]/g, '')
        if (cleanCode.length !== 12) {
            setError('Please enter a complete 12-character code')
            return
        }

        const formattedCode = parseCodeFromInput(code)
        
        setIsConnecting(true)
        setError(null)

        try {
            await syncManager.acceptPairingCode(formattedCode)
            onSuccess()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect')
            setIsConnecting(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && code.length >= 12) {
            handleConnect()
        }
        if (e.key === 'Escape') {
            onClose()
        }
    }

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center">
            <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative bg-white dark:bg-folium-dark-bg-secondary rounded-2xl shadow-2xl w-[420px] max-w-[90vw] p-6">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 text-[#717F9A] hover:text-[#344054] dark:text-[#8895AD] dark:hover:text-folium-dark-text transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="font-sans text-[20px] font-semibold text-[#344054] dark:text-folium-dark-text mb-2">
                    Sync from another device
                </h2>
                <p className="font-sans text-[14px] text-[#717F9A] dark:text-[#8895AD] mb-6">
                    On your existing device, go to Settings → Sync → Add Device, then scan the code shown there.
                </p>

                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setMode('manual')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-sans text-[14px] transition-colors ${
                            mode === 'manual' 
                                ? 'bg-folium-accent text-white' 
                                : 'bg-[#F8F7F6] dark:bg-folium-dark-bg text-[#344054] dark:text-folium-dark-text'
                        }`}
                    >
                        <Keyboard className="w-4 h-4" />
                        Type Code
                    </button>
                    <button
                        onClick={() => setMode('camera')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-sans text-[14px] transition-colors ${
                            mode === 'camera' 
                                ? 'bg-folium-accent text-white' 
                                : 'bg-[#F8F7F6] dark:bg-folium-dark-bg text-[#344054] dark:text-folium-dark-text'
                        }`}
                    >
                        <Camera className="w-4 h-4" />
                        Scan QR
                    </button>
                </div>

                {mode === 'manual' && (
                    <div className="mb-6">
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(parseCodeFromInput(e.target.value))}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter code (e.g., KXBT-M92P-HJ4R)"
                            className="w-full px-4 py-3 font-sans text-[16px] text-[#344054] dark:text-folium-dark-text bg-[#F8F7F6] dark:bg-folium-dark-bg border border-folium-border dark:border-folium-dark-border rounded-lg outline-none focus:ring-2 focus:ring-folium-accent dark:focus:ring-folium-dark-accent"
                            autoFocus
                        />
                    </div>
                )}

                {mode === 'camera' && (
                    <div className="mb-6 p-8 bg-[#F8F7F6] dark:bg-folium-dark-bg rounded-lg flex items-center justify-center">
                        <div className="text-center">
                            <Camera className="w-12 h-12 text-[#717F9A] dark:text-[#8895AD] mx-auto mb-2" />
                            <p className="font-sans text-[14px] text-[#717F9A] dark:text-[#8895AD]">
                                Camera access required
                            </p>
                            <p className="font-sans text-[12px] text-[#717F9A] dark:text-[#8895AD] mt-1">
                                (QR scanning coming soon)
                            </p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <span className="font-sans text-[14px] text-red-600 dark:text-red-400">{error}</span>
                    </div>
                )}

                <button
                    onClick={handleConnect}
                    disabled={isConnecting || code.length < 14}
                    className="w-full py-3 px-4 bg-folium-accent hover:bg-folium-accent/90 disabled:bg-[#D0D0D0] text-white font-sans text-[15px] font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                    {isConnecting ? 'Connecting...' : 'Connect'}
                </button>
            </div>
        </div>,
        document.body
    )
}