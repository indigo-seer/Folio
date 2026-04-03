import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface ContextMenuProps {
    x: number
    y: number
    onClose: () => void
    actions: {
        label: string
        onClick: () => void
        danger?: boolean
        disabled?: boolean
    }[]
}

export function ContextMenu({ x, y, onClose, actions }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null)
    const [position, setPosition] = useState({ top: y, left: x })

    // Boundary detection
    useEffect(() => {
        if (!menuRef.current) return

        const rect = menuRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        let newX = x
        let newY = y

        if (x + rect.width > viewportWidth) {
            newX = Math.max(0, x - rect.width)
        }

        if (y + rect.height > viewportHeight) {
            newY = Math.max(0, y - rect.height)
        }

        setPosition({ top: newY, left: newX })
    }, [x, y])

    // Click outside and Scroll lock
    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose()
            }
        }

        const handleScroll = (e: Event) => {
            // Only close if scrolling an element that is outside the menu itself
            if (menuRef.current && menuRef.current.contains(e.target as Node)) {
                return;
            }
            onClose() // Scroll lock: close if anything else scrolls
        }

        // Use capture phase for scroll to catch inner element scrolling
        window.addEventListener('scroll', handleScroll, true)
        window.addEventListener('mousedown', handleOutsideClick)

        return () => {
            window.removeEventListener('scroll', handleScroll, true)
            window.removeEventListener('mousedown', handleOutsideClick)
        }
    }, [onClose])

    return createPortal(
        <div
            ref={menuRef}
            className="fixed z-[100] min-w-[160px] bg-white dark:bg-folium-dark-bg-secondary border border-folium-border dark:border-folium-dark-border rounded-lg shadow-xl py-1 overflow-hidden font-sans text-sm animate-in fade-in zoom-in-95 duration-150"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {actions.map((action, index) => (
                <button
                    key={index}
                    onClick={(e) => {
                        e.stopPropagation()
                        if (action.disabled) return
                        action.onClick()
                        onClose()
                    }}
                    disabled={action.disabled}
                    className={`
                        w-full text-left px-4 py-2 transition-colors flex items-center justify-between
                        ${action.danger ? 'text-red-600 dark:text-red-400' : 'text-folium-text dark:text-folium-dark-text'}
                        ${action.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-folium-bg-secondary dark:hover:bg-folium-dark-bg'}
                    `}
                >
                    {action.label}
                </button>
            ))}
        </div>,
        document.body
    )
}
