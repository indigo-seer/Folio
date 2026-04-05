import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Highlight } from '@tiptap/extension-highlight'
import { Markdown } from '@tiptap/markdown'
import { common, createLowlight } from 'lowlight'
import { ReactNodeViewRenderer } from '@tiptap/react'

import { isTauri } from '../config'
import { Wikilink } from '../../extensions/Wikilink'
import { Callout } from '../../extensions/Callout'
import { Frontmatter } from '../../extensions/Frontmatter'
import { Tag } from '../../extensions/Tag'
import { MathBlock } from '../../extensions/MathBlock'
import { Embed } from '../../extensions/Embed'
import { InlineMath } from '../../extensions/InlineMath'
import { ObsidianImage } from '../../extensions/ObsidianImage'
import { TypewriterMode } from '../../extensions/TypewriterMode'
import { SlashCommand } from '../../extensions/SlashCommand'
import { SmoothCaret } from '../../extensions/SmoothCaret'
import { MarkdownPaste } from '../../extensions/MarkdownPaste'
import { CodeBlockCopy } from '../../extensions/CodeBlockCopy'
import { createWikilinkSuggestion } from '../../components/WikilinkSuggestion'
import { createSlashCommandSuggestion } from '../../components/SlashCommandSuggestion'
import ImageNodeView from '../../components/ImageNodeView'
import { getCachePathForImage, setImageCacheVaultRoot } from '../imageCache'

// Create lowlight instance with common languages
const lowlight = createLowlight(common)

// Module-level vault root path — set by the Editor component so renderHTML
// can resolve relative `attachments/` paths to absolute disk paths for Tauri.
let vaultRootPath: string | null = null
export function setVaultRootPath(path: string | null) {
    vaultRootPath = path
    setImageCacheVaultRoot(path)
}

const TauriImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                parseHTML: element => element.getAttribute('width'),
                renderHTML: attributes => attributes.width ? { width: attributes.width } : {},
            },
            height: {
                default: null,
                parseHTML: element => element.getAttribute('height'),
                renderHTML: attributes => attributes.height ? { height: attributes.height } : {},
            },
            obsidian: {
                default: false,
                parseHTML: element => element.getAttribute('data-obsidian') === 'true',
                renderHTML: attributes => attributes.obsidian ? { 'data-obsidian': 'true' } : {},
            },
            align: {
                default: null,
                parseHTML: element => element.getAttribute('data-align') || element.getAttribute('align'),
                renderHTML: attributes => attributes.align ? { 'data-align': attributes.align } : {},
            },
        }
    },
    addNodeView() {
        return ReactNodeViewRenderer(ImageNodeView)
    },
    renderHTML({ HTMLAttributes }) {
        const src = HTMLAttributes.src
        let resolvedSrc = src
        const widthValue = HTMLAttributes.width
        const styleValue = String(HTMLAttributes.style || '')

        if (isTauri() && src && src.startsWith('attachments/') && vaultRootPath) {
            // Build the absolute path: /vault/root/attachments/name.png
            const absolutePath = `${vaultRootPath}/${src}`
            resolvedSrc = getCachePathForImage(absolutePath)
            HTMLAttributes['data-folium-image-source-path'] = absolutePath
        }

        if (widthValue) {
            const widthNumber = Number(widthValue)
            if (Number.isFinite(widthNumber) && widthNumber > 0) {
                const widthStyle = `width: ${Math.round(widthNumber)}px; max-width: 100%; height: auto;`
                HTMLAttributes.style = styleValue ? `${styleValue} ${widthStyle}`.trim() : widthStyle
            }
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
            link: false,
            heading: {
                levels: [1, 2, 3, 4, 5, 6],
            },
        }),
        Markdown.configure({
            html: true,
            markedOptions: {
                breaks: true,
            },
        } as any),
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
        Frontmatter,
        Callout,
        Tag,
        MathBlock,
        InlineMath,
        ObsidianImage,
        Embed,
        TypewriterMode,
        TaskList,
        TaskItem.configure({
            nested: true,
        }),
        Table.configure({
            resizable: true,
            HTMLAttributes: {
                class: 'folium-table w-full'
            }
        }),
        TableRow,
        TableHeader,
        TableCell,
        Highlight.configure({
            multicolor: false,
            HTMLAttributes: {
                class: 'folium-highlight',
            },
        }),
        TauriImage,
        SlashCommand.configure({
            suggestion: createSlashCommandSuggestion(),
        }),
        SmoothCaret,
        MarkdownPaste,
        CodeBlockCopy,
    ]
}
