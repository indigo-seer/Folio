import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

export interface WikilinkDropdownRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export interface WikilinkDropdownProps {
    items: string[]
    command: (item: { id: string }) => void
}

export const WikilinkDropdown = forwardRef<WikilinkDropdownRef, WikilinkDropdownProps>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => {
        setSelectedIndex(0)
    }, [props.items])

    const selectItem = (index: number) => {
        const item = props.items[index]
        if (item) {
            props.command({ id: item })
        }
    }

    const upHandler = () => {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
    }

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % props.items.length)
    }

    const enterHandler = () => {
        selectItem(selectedIndex)
    }

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (event.key === 'ArrowUp') {
                upHandler()
                return true
            }
            if (event.key === 'ArrowDown') {
                downHandler()
                return true
            }
            if (event.key === 'Enter') {
                enterHandler()
                return true
            }
            return false
        }
    }))

    if (!props.items.length) {
        return (
            <div className="bg-white dark:bg-folium-dark-bg border border-folium-border dark:border-folium-dark-border rounded-lg shadow-xl overflow-hidden py-2 px-4 min-w-[200px] text-sm text-folium-text-tertiary dark:text-folium-dark-text-tertiary">
                No matching notes found. Type to create new.
            </div>
        )
    }

    return (
        <div className="bg-white dark:bg-folium-dark-bg border border-folium-border dark:border-folium-dark-border rounded-lg shadow-xl overflow-hidden py-1 min-w-[200px] max-h-[300px] overflow-y-auto">
            {props.items.map((item, index) => (
                <button
                    key={index}
                    onClick={() => selectItem(index)}
                    className={`block w-full text-left px-4 py-2 text-sm transition-colors ${index === selectedIndex
                            ? 'bg-folium-base dark:bg-folium-dark-base text-folium-accent dark:text-folium-dark-accent font-medium'
                            : 'text-folium-text dark:text-folium-dark-text hover:bg-folium-base dark:hover:bg-folium-dark-base'
                        }`}
                >
                    {item}
                </button>
            ))}
        </div>
    )
})

WikilinkDropdown.displayName = 'WikilinkDropdown'
