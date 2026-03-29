import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import {
    Info,
    AlertTriangle,
    Book,
    CheckCircle,
    HelpCircle,
    XCircle,
    Bug,
    Quote,
    Lightbulb,
    ListTodo,
    Flame,
    ChevronDown,
    ChevronRight,
    ChevronsUpDown,
} from 'lucide-react'

const PRIMARY_CALLOUT_TYPES = [
    { id: 'note', label: 'Note' },
    { id: 'abstract', label: 'Abstract' },
    { id: 'todo', label: 'Todo' },
    { id: 'tip', label: 'Tip' },
    { id: 'success', label: 'Success' },
    { id: 'question', label: 'Question' },
    { id: 'warning', label: 'Warning' },
    { id: 'failure', label: 'Failure' },
    { id: 'danger', label: 'Danger' },
    { id: 'bug', label: 'Bug' },
    { id: 'example', label: 'Example' },
    { id: 'quote', label: 'Quote' },
]

function titleFromType(type: string) {
    if (!type) return 'Note'
    return type.charAt(0).toUpperCase() + type.slice(1)
}

function hasBodyContent(calloutNode: any) {
    for (let i = 0; i < calloutNode.childCount; i += 1) {
        const node = calloutNode.child(i)

        if (typeof node.text === 'string' && node.text.trim().length > 0) {
            return true
        }

        if (node.isAtom && node.type?.name !== 'text') {
            return true
        }

        if (node.childCount > 0 && hasBodyContent(node)) {
            return true
        }
    }

    return false
}

// Map Obsidian callout types to styling colors and Lucide icons
const CALLOUT_TYPES: Record<string, { icon: any; colorClass: string; bgClass: string; darkBgClass: string; iconBgClass: string }> = {
    note: { icon: Info, colorClass: 'text-blue-700 dark:text-blue-300', bgClass: 'bg-blue-50/70', darkBgClass: 'dark:bg-[#141b37]', iconBgClass: 'bg-blue-600 dark:bg-blue-500' },
    abstract: { icon: Book, colorClass: 'text-sky-700 dark:text-sky-300', bgClass: 'bg-sky-50/70', darkBgClass: 'dark:bg-[#14233a]', iconBgClass: 'bg-sky-600 dark:bg-sky-500' },
    summary: { icon: Book, colorClass: 'text-sky-700 dark:text-sky-300', bgClass: 'bg-sky-50/70', darkBgClass: 'dark:bg-[#14233a]', iconBgClass: 'bg-sky-600 dark:bg-sky-500' },
    info: { icon: Info, colorClass: 'text-blue-700 dark:text-blue-300', bgClass: 'bg-blue-50/70', darkBgClass: 'dark:bg-[#141b37]', iconBgClass: 'bg-blue-600 dark:bg-blue-500' },
    todo: { icon: ListTodo, colorClass: 'text-cyan-700 dark:text-cyan-300', bgClass: 'bg-cyan-50/70', darkBgClass: 'dark:bg-[#13283b]', iconBgClass: 'bg-cyan-600 dark:bg-cyan-500' },
    tip: { icon: Lightbulb, colorClass: 'text-emerald-700 dark:text-emerald-300', bgClass: 'bg-emerald-50/70', darkBgClass: 'dark:bg-[#102b2e]', iconBgClass: 'bg-emerald-600 dark:bg-emerald-500' },
    hint: { icon: Lightbulb, colorClass: 'text-emerald-700 dark:text-emerald-300', bgClass: 'bg-emerald-50/70', darkBgClass: 'dark:bg-[#102b2e]', iconBgClass: 'bg-emerald-600 dark:bg-emerald-500' },
    important: { icon: Lightbulb, colorClass: 'text-emerald-700 dark:text-emerald-300', bgClass: 'bg-emerald-50/70', darkBgClass: 'dark:bg-[#102b2e]', iconBgClass: 'bg-emerald-600 dark:bg-emerald-500' },
    success: { icon: CheckCircle, colorClass: 'text-green-700 dark:text-green-300', bgClass: 'bg-green-50/70', darkBgClass: 'dark:bg-[#0f2a2f]', iconBgClass: 'bg-green-600 dark:bg-green-500' },
    check: { icon: CheckCircle, colorClass: 'text-green-700 dark:text-green-300', bgClass: 'bg-green-50/70', darkBgClass: 'dark:bg-[#0f2a2f]', iconBgClass: 'bg-green-600 dark:bg-green-500' },
    done: { icon: CheckCircle, colorClass: 'text-green-700 dark:text-green-300', bgClass: 'bg-green-50/70', darkBgClass: 'dark:bg-[#0f2a2f]', iconBgClass: 'bg-green-600 dark:bg-green-500' },
    question: { icon: HelpCircle, colorClass: 'text-amber-700 dark:text-amber-300', bgClass: 'bg-amber-50/70', darkBgClass: 'dark:bg-[#2a2232]', iconBgClass: 'bg-amber-600 dark:bg-amber-500' },
    help: { icon: HelpCircle, colorClass: 'text-amber-700 dark:text-amber-300', bgClass: 'bg-amber-50/70', darkBgClass: 'dark:bg-[#2a2232]', iconBgClass: 'bg-amber-600 dark:bg-amber-500' },
    faq: { icon: HelpCircle, colorClass: 'text-amber-700 dark:text-amber-300', bgClass: 'bg-amber-50/70', darkBgClass: 'dark:bg-[#2a2232]', iconBgClass: 'bg-amber-600 dark:bg-amber-500' },
    warning: { icon: AlertTriangle, colorClass: 'text-orange-700 dark:text-orange-300', bgClass: 'bg-orange-50/70', darkBgClass: 'dark:bg-[#2e1f2b]', iconBgClass: 'bg-orange-600 dark:bg-orange-500' },
    caution: { icon: AlertTriangle, colorClass: 'text-orange-700 dark:text-orange-300', bgClass: 'bg-orange-50/70', darkBgClass: 'dark:bg-[#2e1f2b]', iconBgClass: 'bg-orange-600 dark:bg-orange-500' },
    attention: { icon: AlertTriangle, colorClass: 'text-orange-700 dark:text-orange-300', bgClass: 'bg-orange-50/70', darkBgClass: 'dark:bg-[#2e1f2b]', iconBgClass: 'bg-orange-600 dark:bg-orange-500' },
    failure: { icon: XCircle, colorClass: 'text-rose-700 dark:text-rose-300', bgClass: 'bg-rose-50/70', darkBgClass: 'dark:bg-[#301d2a]', iconBgClass: 'bg-rose-600 dark:bg-rose-500' },
    fail: { icon: XCircle, colorClass: 'text-rose-700 dark:text-rose-300', bgClass: 'bg-rose-50/70', darkBgClass: 'dark:bg-[#301d2a]', iconBgClass: 'bg-rose-600 dark:bg-rose-500' },
    missing: { icon: XCircle, colorClass: 'text-rose-700 dark:text-rose-300', bgClass: 'bg-rose-50/70', darkBgClass: 'dark:bg-[#301d2a]', iconBgClass: 'bg-rose-600 dark:bg-rose-500' },
    danger: { icon: Flame, colorClass: 'text-red-700 dark:text-red-300', bgClass: 'bg-red-50/70', darkBgClass: 'dark:bg-[#321d26]', iconBgClass: 'bg-red-600 dark:bg-red-500' },
    error: { icon: Flame, colorClass: 'text-red-700 dark:text-red-300', bgClass: 'bg-red-50/70', darkBgClass: 'dark:bg-[#321d26]', iconBgClass: 'bg-red-600 dark:bg-red-500' },
    bug: { icon: Bug, colorClass: 'text-red-700 dark:text-red-300', bgClass: 'bg-red-50/70', darkBgClass: 'dark:bg-[#321d26]', iconBgClass: 'bg-red-600 dark:bg-red-500' },
    example: { icon: Book, colorClass: 'text-indigo-700 dark:text-indigo-300', bgClass: 'bg-indigo-50/70', darkBgClass: 'dark:bg-[#1d2341]', iconBgClass: 'bg-indigo-600 dark:bg-indigo-500' },
    quote: { icon: Quote, colorClass: 'text-slate-700 dark:text-slate-300', bgClass: 'bg-slate-50/70', darkBgClass: 'dark:bg-[#1f2437]', iconBgClass: 'bg-slate-600 dark:bg-slate-500' },
    cite: { icon: Quote, colorClass: 'text-slate-700 dark:text-slate-300', bgClass: 'bg-slate-50/70', darkBgClass: 'dark:bg-[#1f2437]', iconBgClass: 'bg-slate-600 dark:bg-slate-500' },
}

export default function CalloutNodeView(props: any) {
    const { node, updateAttributes } = props
    const type = (node.attrs.type || 'note').toLowerCase()
    const computedTitle = node.attrs.title || titleFromType(type)
    const isFoldable = Boolean(node.attrs.foldable)
    const isExpanded = node.attrs.defaultExpanded !== false

    const [draftTitle, setDraftTitle] = useState(computedTitle)
    const [isTypeMenuOpen, setTypeMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const menuButtonRef = useRef<HTMLButtonElement | null>(null)

    useEffect(() => {
        setDraftTitle(computedTitle)
    }, [computedTitle])

    const style = CALLOUT_TYPES[type] || CALLOUT_TYPES.note
    const Icon = style.icon
    const isEmpty = !hasBodyContent(node)

    useEffect(() => {
        if (!isTypeMenuOpen) return

        const onMouseDown = (event: MouseEvent) => {
            const target = event.target as Node
            if (menuRef.current?.contains(target)) return
            if (menuButtonRef.current?.contains(target)) return
            setTypeMenuOpen(false)
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setTypeMenuOpen(false)
        }

        document.addEventListener('mousedown', onMouseDown)
        document.addEventListener('keydown', onKeyDown)

        return () => {
            document.removeEventListener('mousedown', onMouseDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [isTypeMenuOpen])

    const toggleFold = () => {
        if (isFoldable) {
            updateAttributes({ defaultExpanded: !isExpanded })
        }
    }

    const toggleFoldable = () => {
        const nextFoldable = !isFoldable
        updateAttributes({
            foldable: nextFoldable,
            defaultExpanded: true,
        })
    }

    const updateType = (nextType: string) => {
        const nextTitle = titleFromType(nextType)
        const currentDefault = titleFromType(type).toLowerCase()
        const currentTitle = (node.attrs.title || '').trim().toLowerCase()
        const shouldAutoUpdateTitle = currentTitle.length === 0 || currentTitle === currentDefault

        updateAttributes({
            type: nextType,
            ...(shouldAutoUpdateTitle ? { title: nextTitle } : {}),
        })

        if (shouldAutoUpdateTitle) {
            setDraftTitle(nextTitle)
        }
    }

    const selectedType = PRIMARY_CALLOUT_TYPES.some((option) => option.id === type) ? type : 'note'
    const typeMenuItems = PRIMARY_CALLOUT_TYPES.map((option) => ({
        ...option,
        icon: (CALLOUT_TYPES[option.id] || CALLOUT_TYPES.note).icon,
    }))

    return (
        <NodeViewWrapper
            className={`folio-callout my-5 rounded-xl shadow-sm ${style.colorClass} ${style.bgClass} ${style.darkBgClass}`}
            data-type="callout"
            data-callout-type={node.attrs.type}
            data-callout-title={node.attrs.title}
            data-callout-foldable={isFoldable ? 'true' : undefined}
            data-callout-expanded={isExpanded ? 'true' : 'false'}
        >
            <div
                className={`folio-callout-header ${isFoldable ? 'is-foldable' : ''}`}
                contentEditable={false}
                onClick={(event) => {
                    const target = event.target as HTMLElement
                    if (target.closest('.folio-callout-menu-anchor')) return
                    if (target.closest('.folio-callout-title-input')) return
                    toggleFold()
                }}
            >
                <div className="folio-callout-menu-anchor">
                    <button
                        ref={menuButtonRef}
                        type="button"
                        className={`folio-callout-icon-btn ${isTypeMenuOpen ? 'is-open' : ''}`}
                        title="Change callout type"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setTypeMenuOpen((open) => !open)}
                    >
                        <span className={`folio-callout-icon ${style.iconBgClass}`}>
                            <Icon size={16} className="opacity-90" />
                        </span>
                    </button>

                    {isTypeMenuOpen && (
                        <div className="folio-callout-type-menu" ref={menuRef}>
                            <div className="folio-callout-type-grid">
                                {typeMenuItems.map((option) => {
                                    const OptionIcon = option.icon
                                    const isActive = option.id === selectedType

                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            className={`folio-callout-type-btn ${isActive ? 'is-active' : ''}`}
                                            title={option.label}
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={() => {
                                                updateType(option.id)
                                                setTypeMenuOpen(false)
                                            }}
                                        >
                                            <OptionIcon size={15} />
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="folio-callout-menu-divider" />
                            <button
                                type="button"
                                className={`folio-callout-collapse-toggle ${isFoldable ? 'is-active' : ''}`}
                                title={isFoldable ? 'Disable collapse' : 'Enable collapse'}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={toggleFoldable}
                            >
                                <ChevronsUpDown size={14} />
                            </button>
                        </div>
                    )}
                </div>

                <input
                    className="folio-callout-title-input"
                    value={draftTitle}
                    placeholder={titleFromType(type)}
                    onMouseDown={(event) => event.stopPropagation()}
                    onChange={(event) => {
                        const nextValue = event.target.value
                        setDraftTitle(nextValue)
                        updateAttributes({ title: nextValue })
                    }}
                    onBlur={() => {
                        const normalized = draftTitle.trim()
                        updateAttributes({ title: normalized })
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault()
                            ;(event.currentTarget as HTMLInputElement).blur()
                        }
                    }}
                />
                {isFoldable && (
                    <span className="folio-callout-fold-indicator" aria-hidden>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                )}
            </div>

            <div className={`folio-callout-content ${(!isFoldable || isExpanded) ? 'is-expanded' : 'is-collapsed'}`}>
                <NodeViewContent
                    className={`folio-callout-node-content text-folio-text dark:text-folio-dark-text text-sm leading-relaxed [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 prose-p:my-1.5 ${isEmpty ? 'is-empty-callout' : ''}`}
                    data-empty-hint={isEmpty ? 'Tip: Click the icon to change the callout type.' : ''}
                />
            </div>
        </NodeViewWrapper>
    )
}
