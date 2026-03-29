import { type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'

interface TableToolbarProps {
    editor: Editor
}

interface TableToolbarButtonProps {
    label: string
    onClick: () => void
    disabled?: boolean
    destructive?: boolean
    title: string
}

function TableToolbarButton({ label, onClick, disabled = false, destructive = false, title }: TableToolbarButtonProps) {
    return (
        <button
            type="button"
            className={`table-toolbar-btn ${destructive ? 'is-destructive' : ''}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
            disabled={disabled}
            title={title}
        >
            {label}
        </button>
    )
}

export function TableToolbar({ editor }: TableToolbarProps) {
    const canRun = (operation: (chain: any) => any) => operation(editor.can().chain().focus()).run()
    const run = (operation: (chain: any) => any) => operation(editor.chain().focus()).run()

    const canMergeCells = canRun((chain) => chain.mergeCells())
    const canSplitCell = canRun((chain) => chain.splitCell())

    return (
        <BubbleMenu
            editor={editor}
            pluginKey="tableToolbar"
            shouldShow={({ editor: currentEditor }) => currentEditor.isActive('table')}
            options={{
                placement: 'top-start',
                offset: 10,
            }}
        >
            <div className="table-toolbar">
                <TableToolbarButton
                    label="+Col L"
                    title="Insert column to the left"
                    onClick={() => run((chain) => chain.addColumnBefore())}
                />
                <TableToolbarButton
                    label="+Col R"
                    title="Insert column to the right"
                    onClick={() => run((chain) => chain.addColumnAfter())}
                />
                <TableToolbarButton
                    label="+Row A"
                    title="Insert row above"
                    onClick={() => run((chain) => chain.addRowBefore())}
                />
                <TableToolbarButton
                    label="+Row B"
                    title="Insert row below"
                    onClick={() => run((chain) => chain.addRowAfter())}
                />
                <div className="table-toolbar-separator" />
                <TableToolbarButton
                    label="Header"
                    title="Toggle header row"
                    onClick={() => run((chain) => chain.toggleHeaderRow())}
                />
                <TableToolbarButton
                    label="Merge"
                    title="Merge selected cells"
                    onClick={() => run((chain) => chain.mergeCells())}
                    disabled={!canMergeCells}
                />
                <TableToolbarButton
                    label="Split"
                    title="Split merged cell"
                    onClick={() => run((chain) => chain.splitCell())}
                    disabled={!canSplitCell}
                />
                <div className="table-toolbar-separator" />
                <TableToolbarButton
                    label="-Col"
                    title="Delete current column"
                    onClick={() => run((chain) => chain.deleteColumn())}
                    destructive
                />
                <TableToolbarButton
                    label="-Row"
                    title="Delete current row"
                    onClick={() => run((chain) => chain.deleteRow())}
                    destructive
                />
                <TableToolbarButton
                    label="Delete"
                    title="Delete table"
                    onClick={() => run((chain) => chain.deleteTable())}
                    destructive
                />
            </div>
        </BubbleMenu>
    )
}
