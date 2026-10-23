import { getSchema } from '@tiptap/core'
import { joinBackward, splitBlock } from '@tiptap/pm/commands'
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { describe, expect, it } from 'vitest'

import { getEditorExtensions } from '../extensions'

function createEditorState() {
    const schema = getSchema(getEditorExtensions({ current: new Set<string>() }))
    const doc = schema.node('doc', null, [
        schema.node('paragraph', null, schema.text('First line')),
    ])

    return EditorState.create({
        schema,
        doc,
        selection: TextSelection.atEnd(doc),
    })
}

function runCommand(
    state: EditorState,
    command: typeof splitBlock,
): { handled: boolean; state: EditorState } {
    let nextState = state
    const handled = command(state, (transaction: Transaction) => {
        nextState = state.apply(transaction)
    })
    return { handled, state: nextState }
}

describe('editor keyboard runtime', () => {
    it('supports repeated paragraph splits and text insertion on an empty line', () => {
        const firstSplit = runCommand(createEditorState(), splitBlock)
        expect(firstSplit.handled).toBe(true)

        const secondSplit = runCommand(firstSplit.state, splitBlock)
        expect(secondSplit.handled).toBe(true)
        expect(secondSplit.state.doc.childCount).toBe(3)

        const withSlash = secondSplit.state.apply(secondSplit.state.tr.insertText('/'))
        expect(withSlash.doc.lastChild?.textContent).toBe('/')
    })

    it('joins an empty line back into the preceding paragraph', () => {
        const split = runCommand(createEditorState(), splitBlock)
        expect(split.state.doc.childCount).toBe(2)

        const joined = runCommand(split.state, joinBackward)
        expect(joined.handled).toBe(true)
        expect(joined.state.doc.childCount).toBe(1)
        expect(joined.state.doc.textContent).toBe('First line')
    })
})
