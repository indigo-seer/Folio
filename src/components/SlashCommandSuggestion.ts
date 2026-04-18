import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import { SuggestionOptions } from '@tiptap/suggestion'
import { Editor, Range } from '@tiptap/core'
import { Type, Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Minus, Table as TableIcon, Info, Pi, FileSymlink, AlertTriangle, Book, Lightbulb, CheckCircle, HelpCircle, XCircle, Flame, Bug, Quote, Code2, Paperclip } from 'lucide-react'
import { SlashCommandList, SlashCommandListRef, SlashCommandItem } from './SlashCommandList.tsx'
import { requestOpenEmbedPicker } from '../lib/embedPickerEvent'

const COMMAND_ITEMS: SlashCommandItem[] = [
    {
        title: 'Text',
        icon: Type,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).setNode('paragraph').run()
        },
    },
    {
        title: 'Heading 1',
        shortcut: '#',
        icon: Heading1,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
        },
    },
    {
        title: 'Heading 2',
        shortcut: '##',
        icon: Heading2,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
        },
    },
    {
        title: 'Heading 3',
        shortcut: '###',
        icon: Heading3,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
        },
    },

    {
        title: 'Bulleted list',
        shortcut: '-',
        icon: List,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).toggleBulletList().run()
        },
    },
    {
        title: 'Numbered list',
        shortcut: '1.',
        icon: ListOrdered,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).toggleOrderedList().run()
        },
    },
    {
        title: 'To-do list',
        shortcut: '[]',
        icon: CheckSquare,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).toggleTaskList().run()
        },
    },
    {
        title: 'Divider',
        shortcut: '---',
        icon: Minus,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).setHorizontalRule().run()
        },
    },
    {
        title: 'Table',
        shortcut: 'table',
        icon: TableIcon,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        },
    },
    {
        title: 'Code Block',
        shortcut: '```',
        icon: Code2,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).setCodeBlock({ language: 'plaintext' }).run()
        },
    },
    ...[
        { id: 'note', name: 'Note', icon: Info },
        { id: 'abstract', name: 'Abstract', icon: Book },
        { id: 'todo', name: 'Todo', icon: CheckSquare },
        { id: 'tip', name: 'Tip', icon: Lightbulb },
        { id: 'success', name: 'Success', icon: CheckCircle },
        { id: 'question', name: 'Question', icon: HelpCircle },
        { id: 'warning', name: 'Warning', icon: AlertTriangle },
        { id: 'failure', name: 'Failure', icon: XCircle },
        { id: 'danger', name: 'Danger', icon: Flame },
        { id: 'bug', name: 'Bug', icon: Bug },
        { id: 'example', name: 'Example', icon: Book },
        { id: 'quote', name: 'Quote', icon: Quote }
    ].map(callout => ({
        title: `${callout.name} Callout`,
        shortcut: `> [!${callout.id}]`,
        icon: callout.icon,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'callout',
                attrs: { type: callout.id, title: callout.name },
                content: [{ type: 'paragraph' }]
            }).run()
        },
    })),
    {
        title: 'Math Block',
        shortcut: '$$',
        icon: Pi,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mathBlock',
                attrs: { latex: '' }
            }).run()
        },
    },
    {
        title: 'Embed Note',
        shortcut: '![[Note]]',
        icon: FileSymlink,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'embed',
                attrs: { noteName: 'Placeholder' }
            }).run()
        },
    },
    {
        title: 'Embed File',
        shortcut: '/embed',
        icon: Paperclip,
        action: (editor: Editor, range: Range) => {
            editor.chain().focus().deleteRange(range).run()
            requestOpenEmbedPicker(editor)
        },
    },
]

import { PluginKey } from '@tiptap/pm/state'

export function createSlashCommandSuggestion(): Omit<SuggestionOptions, 'editor'> {
    return {
        pluginKey: new PluginKey('slashCommandSuggestion'),
        char: '/',
        allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from)
            const textBefore = $from.parent.textContent.slice(0, range.from - $from.start())
            // Only trigger if slash is at start of block or after a space
            return textBefore === '' || textBefore.endsWith(' ')
        },
        items: ({ query }) => {
            return COMMAND_ITEMS.filter(item => item.title.toLowerCase().includes(query.toLowerCase())).slice(0, 20)
        },
        render: () => {
            let component: ReactRenderer<SlashCommandListRef> | null = null
            let popup: TippyInstance | null = null
            let isDestroyed = false

            return {
                onStart: (props) => {
                    isDestroyed = false
                    component = new ReactRenderer(SlashCommandList, {
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
