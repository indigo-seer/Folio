import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import { Wikilink } from './src/extensions/Wikilink';
import StarterKit from '@tiptap/starter-kit';

const editor = new Editor({
    extensions: [
        StarterKit,
        Markdown,
        Wikilink.configure({ suggestion: {} as any }),
    ],
    content: ''
});

// Try to parse markdown with Wikilink
editor.commands.setContent('This has a [[LinkToNote]] in it.');

console.log('Resulting HTML:', editor.getHTML());
