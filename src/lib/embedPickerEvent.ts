import type { Editor } from '@tiptap/core'

export const OPEN_EMBED_PICKER_EVENT = 'folium:open-embed-picker'

export interface OpenEmbedPickerEventDetail {
    editor: Editor
}

export function requestOpenEmbedPicker(editor: Editor) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent<OpenEmbedPickerEventDetail>(OPEN_EMBED_PICKER_EVENT, {
        detail: { editor },
    }))
}
