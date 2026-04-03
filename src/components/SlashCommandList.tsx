import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Editor, Range } from '@tiptap/core'

export interface SlashCommandItem {
    title: string
    shortcut?: string
    icon: React.ElementType
    action: (editor: Editor, range: Range) => void
}

export interface SlashCommandListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export interface SlashCommandListProps {
    items: SlashCommandItem[]
    command: (item: SlashCommandItem) => void
}

export const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => {
        setSelectedIndex(0)
    }, [props.items])

    useEffect(() => {
        const selectedEl = document.querySelector(`[data-slash-index="${selectedIndex}"]`)
        selectedEl?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    const selectItem = (index: number) => {
        const item = props.items[index]
        if (item) {
            props.command(item)
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
            <div className="bg-folium-bg dark:bg-folium-dark-bg border border-folium-border dark:border-folium-dark-border rounded-lg shadow-xl py-2 px-3 min-w-[320px] text-sm text-folium-text-tertiary dark:text-folium-dark-text-tertiary">
                No matching results
            </div>
        )
    }

    return (
        <div className="bg-folium-bg dark:bg-folium-dark-bg border border-folium-border dark:border-folium-dark-border rounded-lg shadow-xl py-2 min-w-[320px] max-h-[350px] overflow-y-auto">
            <div className="px-3 py-1 mb-1 text-[11px] font-semibold text-folium-text-tertiary dark:text-folium-dark-text-tertiary">
                Basic blocks
            </div>
            {props.items.map((item, index) => {
                const Icon = item.icon
                return (
                    <button
                        key={index}
                        data-slash-index={index}
                        onClick={() => selectItem(index)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors ${index === selectedIndex
                            ? 'bg-folium-base dark:bg-folium-dark-base'
                            : 'hover:bg-folium-base dark:hover:bg-folium-dark-base bg-transparent'
                            }`}
                    >
                        <div className="flex items-center space-x-3">
                            <div className={`w-[28px] h-[28px] flex items-center justify-center rounded-[4px] border text-folium-text dark:text-folium-dark-text-secondary ${index === selectedIndex
                                ? 'bg-white dark:bg-folium-dark-bg-secondary border-folium-border dark:border-folium-dark-border shadow-sm dark:shadow-none'
                                : 'bg-transparent border-transparent text-folium-text-tertiary dark:text-folium-dark-text-tertiary focus-visible:outline-none'
                                }`}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <span className={`text-[14px] ${index === selectedIndex ? 'text-folium-accent dark:text-folium-dark-accent font-medium' : 'text-folium-text dark:text-folium-dark-text'}`}>{item.title}</span>
                        </div>
                        {item.shortcut && (
                            <span className="text-[12px] text-folium-text-tertiary dark:text-folium-dark-text-tertiary font-mono">
                                {item.shortcut}
                            </span>
                        )}
                    </button>
                )
            })}
        </div>
    )
})

SlashCommandList.displayName = 'SlashCommandList'
