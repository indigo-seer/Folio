import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'

const editor = new Editor({
    extensions: [
        StarterKit,
        Markdown.configure({
            markedOptions: { breaks: true }
        })
    ],
    content: ''
})

console.log("Empty editor doc:", editor.getJSON())

// Try plain setContent
editor.commands.setContent('# Hello\n\nThis is a **test**.')
console.log("After setContent:", JSON.stringify(editor.getJSON(), null, 2))

// Try with contentType
editor.commands.setContent('# Hello 2\n\nThis is a **test 2**.', false, { preserveWhitespace: 'full' } as any)
console.log("After setContent with parseOptions:", JSON.stringify(editor.getJSON(), null, 2))

// Look at storage
console.dir(editor.storage.markdown, { depth: null })
