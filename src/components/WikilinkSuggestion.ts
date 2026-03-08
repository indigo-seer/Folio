import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import { SuggestionOptions } from '@tiptap/suggestion'
import { WikilinkDropdown, WikilinkDropdownRef } from './WikilinkDropdown'

import { PluginKey } from '@tiptap/pm/state'

export function createWikilinkSuggestion(getNotes: () => Set<string>): Omit<SuggestionOptions, 'editor'> {
    return {
        pluginKey: new PluginKey('wikilinkSuggestion'),
        char: '[[',
        command: ({ editor, range, props }) => {
            // Find if there are trailing brackets `]]` to replace
            const textAfter = editor.view.state.doc.textBetween(range.to, Math.min(range.to + 2, editor.view.state.doc.nodeSize - 2), '\n', '\0')
            let replaceEnd = range.to
            if (textAfter.startsWith(']]')) {
                replaceEnd += 2
            } else if (textAfter.startsWith(']')) {
                replaceEnd += 1
            }

            editor
                .chain()
                .focus()
                .insertContentAt({ from: range.from, to: replaceEnd }, {
                    type: 'wikilink',
                    attrs: {
                        noteName: props.id
                    }
                })
                .insertContent(' ')
                .run()
        },
        items: ({ query }) => {
            const notes = Array.from(getNotes())
            // If query is non-empty and has no exact match, allow it as a generic create option
            const exactMatch = notes.some(note => note.toLowerCase() === query.toLowerCase())
            const results = notes
                .filter(note => note.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 10)

            if (query && !exactMatch && !results.includes(query)) {
                results.push(query) // Allow creating a new wikilink of whatever they typed
            }
            return results
        },
        render: () => {
            let component: ReactRenderer<WikilinkDropdownRef> | null = null
            let popup: TippyInstance | null = null
            let isDestroyed = false

            return {
                onStart: (props) => {
                    isDestroyed = false
                    component = new ReactRenderer(WikilinkDropdown, {
                        props,
                        editor: props.editor,
                    })

                    if (!props.clientRect) {
                        return
                    }

                    popup = tippy('body', {
                        getReferenceClientRect: props.clientRect as () => DOMRect,
                        appendTo: () => document.body,
                        content: component.element,
                        showOnCreate: true,
                        interactive: true,
                        trigger: 'manual',
                        placement: 'bottom-start',
                    })[0]
                },

                onUpdate(props) {
                    if (isDestroyed) return
                    component?.updateProps(props)

                    if (!props.clientRect) {
                        return
                    }

                    popup?.setProps({
                        getReferenceClientRect: props.clientRect as () => DOMRect,
                    })
                },

                onKeyDown(props) {
                    if (isDestroyed) return false
                    if (props.event.key === 'Escape') {
                        popup?.hide()
                        // Ensure we return true so the event isn't passed down to the editor preventing loss of focus,
                        // keeping the raw [[ as plain text.
                        return true
                    }
                    return component?.ref?.onKeyDown(props) || false
                },

                onExit() {
                    if (isDestroyed) return
                    isDestroyed = true

                    popup?.destroy()
                    popup = null

                    setTimeout(() => {
                        component?.destroy()
                        component = null
                    })
                },

                // Important: handle editor destroy during autocomplete to prevent unmounted component updates
                destroy() {
                    if (isDestroyed) return
                    isDestroyed = true

                    popup?.destroy()
                    popup = null

                    setTimeout(() => {
                        component?.destroy()
                        component = null
                    })
                }
            }
        },
    }
}
