import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Markdown } from '@tiptap/markdown'

console.log('StarterKit:', StarterKit ? !!StarterKit.name : 'undefined')
console.log('Placeholder:', Placeholder ? !!Placeholder.name : 'undefined')
console.log('Typography:', Typography ? !!Typography.name : 'undefined')
console.log('CodeBlockLowlight:', CodeBlockLowlight ? !!CodeBlockLowlight.name : 'undefined')
console.log('Link:', Link ? !!Link.name : 'undefined')
console.log('TaskList:', TaskList ? !!TaskList.name : 'undefined')
console.log('TaskItem:', TaskItem ? !!TaskItem.name : 'undefined')
console.log('Markdown:', Markdown ? !!Markdown.name : 'undefined')
