import { useEffect, useState } from 'react'

interface ToastProps {
    message: string
    duration?: number
    onDismiss: () => void
}

export function Toast({ message, duration = 5000, onDismiss }: ToastProps) {
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        // Trigger enter animation
        requestAnimationFrame(() => setIsVisible(true))

        const timer = setTimeout(() => {
            setIsVisible(false)
            setTimeout(onDismiss, 400) // Wait for fade-out to complete
        }, duration)

        return () => clearTimeout(timer)
    }, [duration, onDismiss])

    return (
        <div
            className={`
                fixed bottom-8 left-1/2 -translate-x-1/2 z-50
                px-5 py-3 rounded-lg shadow-lg
                bg-folio-text dark:bg-folio-dark-text
                text-folio-bg dark:text-folio-dark-bg
                text-sm font-sans
                transition-all duration-400 ease-out
                ${isVisible
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2'
                }
            `}
        >
            {message}
        </div>
    )
}
