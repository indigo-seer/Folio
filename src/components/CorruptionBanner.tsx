import { useState } from 'react'

interface CorruptionBannerProps {
    warnings: string[]
}

export function CorruptionBanner({ warnings }: CorruptionBannerProps) {
    const [dismissed, setDismissed] = useState(false)

    if (dismissed || warnings.length === 0) return null

    return (
        <div className="corruption-banner">
            <div className="corruption-banner-content">
                <div className="corruption-banner-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                </div>
                <div className="corruption-banner-text">
                    <strong>This note may contain formatting altered by an older version of Folium.</strong>
                    <ul>
                        {warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                    </ul>
                    <span className="corruption-banner-hint">Please review the raw markdown before editing.</span>
                </div>
                <button
                    className="corruption-banner-dismiss"
                    onClick={() => setDismissed(true)}
                    title="Dismiss"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
        </div>
    )
}
