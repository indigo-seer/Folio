import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';

try {
    const editor = new Editor({
        extensions: [Document, Paragraph, Text],
        content: ''
    })

    // Try setting content with \r in text node
    console.log('Testing with CR...');
    editor.commands.setContent({
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Hello\rWorld' }]
            }
        ]
    })
    console.log("SUCCESS with CR");
} catch (e) {
    console.error("FAILED with CR:", e.message)
}
