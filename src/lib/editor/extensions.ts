import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { Markdown } from '@tiptap/markdown'
import { common, createLowlight } from 'lowlight'
import { convertFileSrc } from '@tauri-apps/api/core'

import { isTauri } from '../config'
import { Wikilink } from '../../extensions/Wikilink'
import { TypewriterMode } from '../../extensions/TypewriterMode'
import { SlashCommand } from '../../extensions/SlashCommand'
import { SmoothCaret } from '../../extensions/SmoothCaret'
import { createWikilinkSuggestion } from '../../components/WikilinkSuggestion'
import { createSlashCommandSuggestion } from '../../components/SlashCommandSuggestion'

// Create lowlight instance with common languages
const lowlight = createLowlight(common)

// Module-level vault root path — set by the Editor component so renderHTML
// can resolve relative `attachments/` paths to absolute disk paths for Tauri.
let vaultRootPath: string | null = null
export function setVaultRootPath(path: string | null) {
    vaultRootPath = path
}

const TauriImage = Image.extend({
    renderHTML({ HTMLAttributes }) {
        const src = HTMLAttributes.src
        let resolvedSrc = src

        if (isTauri() && src && src.startsWith('attachments/') && vaultRootPath) {
            // Build the absolute path: /vault/root/attachments/name.png
            const absolutePath = `${vaultRootPath}/${src}`
            resolvedSrc = convertFileSrc(absolutePath)
        }

        return ['img', { ...HTMLAttributes, src: resolvedSrc }]
    }
})

/**
 * Returns the array of configured TipTap extensions for the main Editor.
 * 
 * @param notesRef is passed as a ref (not state) so the suggestion plugin
 * always reads the current vault notes without needing extension recreation.
 */
export function getEditorExtensions(notesRef: React.MutableRefObject<Set<string>>) {
    return [
        StarterKit.configure({
            codeBlock: false,
            heading: {
                levels: [1, 2, 3],
            },
        }),
        Markdown.configure({
            markedOptions: {
                breaks: true,
            },
        }),
        Typography,
        Placeholder.configure({
            placeholder: "Press '/' for blocks or just start typing",
        }),
        CodeBlockLowlight.configure({
            lowlight,
            defaultLanguage: 'plaintext',
        }),
        Link.configure({
            openOnClick: false,
            HTMLAttributes: {
                rel: 'noopener noreferrer nofollow',
            },
        }),
        Wikilink.configure({
            suggestion: createWikilinkSuggestion(() => notesRef.current),
        }),
        TypewriterMode,
        TaskList,
        TaskItem.configure({
            nested: false,
        }),
        TauriImage,
        SlashCommand.configure({
            suggestion: createSlashCommandSuggestion(),
        }),
        SmoothCaret,
    ]
}
