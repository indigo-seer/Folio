# Markdown Format Comparison: Folio vs. Obsidian

This document provides a thorough comparison between the current markdown editor and parser in Folio (built on Tiptap + `@tiptap/markdown`) and the comprehensive feature set of Obsidian Flavored Markdown (OFM).

## Overview

**Folio** uses **Tiptap** as its rich-text editor environment with a dual-parsing system: formatting is edited visually (WYSIWYG) and serialized to/from standard Markdown using `@tiptap/markdown` alongside several custom extensions (like `Wikilink` and `TauriImage`). 

**Obsidian** operates primarily on plain text using a highly extended variant of GitHub Flavored Markdown (GFM), interpreted at render-time with a custom parser.

---

## 1. Supported Features (Common Ground)

These formats are supported by both Folio and Obsidian, though their implementations might subtly differ.

| Feature | Folio (Tiptap) Implementation | Obsidian Implementation |
| :--- | :--- | :--- |
| **Basic Text Styling** | Bold (`**`), Italic (`*`), Strikethrough (`~~`) | Bold, Italic, Strikethrough |
| **Headings** | Limited: Only H1, H2, and H3 (`#`, `##`, `###`) via `StarterKit.configure` | Full: H1 through H6 (including Setext-style `Title\n===`) |
| **Lists (Unordered/Ordered)** | Yes, standard Markdown (`-`, `*`, `1.`) | Yes |
| **Task Lists** | Yes (`- [ ]`), but explicitly configured with `nested: false` | Yes, full nesting support. Also supports custom status characters used by themes/plugins. |
| **Blockquotes** | Yes (`> `) | Yes |
| **Horizontal Rules** | Yes (`---` or `***`) | Yes |
| **Hard Line Breaks** | Yes (via double space) | Yes (via double space or trailing backslash `\`) |
| **Code Blocks** | Yes, with syntax highlighting via `lowlight` | Yes, with PrismJS syntax highlighting |
| **Inline Code** | Yes (`` `code` ``) | Yes |
| **Standard Links** | Yes (`[Text](URL)`). Note: Reference links are parsed but silently flattened to inline URLs during serialization. | Yes, including full support for Reference-style definitions. |
| **Standard Images** | Supported (`![Alt](URL)`). Folio overrides this via `TauriImage` to resolve local `attachments/` paths. | Yes. Resolves attachments relative to vault based on settings. |
| **Basic Wikilinks** | Supported (`[[Note Name]]`) via custom `Wikilink` extension. Parses standard brackets but ignores internal structure. | Supported natively with autocomplete. |

---

## 2. Obsidian-Specific Formats (Not Currently in Folio)

Obsidian extends Markdown significantly to support building a "second brain". The current Folio setup lacks parsers/extensions for the following:

### Link & Embed Variations
*   **Aliases in Wikilinks**: `[[Note Name|Alias Text]]`. Folio's regex `^\[\[([^\]]+)\]\]` treats the entire inner string as the note name.
*   **Heading & Block Anchors**: `[[Note Name#Specific Heading]]` or `[[Note Name^block-id]]`.
*   **Wikilink Alias + Anchor Combo**: `[[Note Name#Specific Heading|Alias Text]]`. The regex parsing implications compound here.
*   **Same-note Anchors**: `[[#Heading]]` or `[[^block-id]]`. Used to link to a section within the current note without specifying the note's name. Folio's tokenizer regex blindly swallows `#Heading` as the literal note name.
*   **Block Identifiers**: `^block-id` at the end of a line/paragraph.
### Link & Embed Variations
*   **Note Transclusions (Embeds)**: `![[Note Name]]` is partially supported. The `Embed` extension parses and renders an interactive transclusion placeholder block in the editor.
*   **File Embeds (Audio, Video, PDF)**: `![[file.mp3]]`, `![[file.mp4]]`, `![[file.pdf]]`, and even `![[doc.pdf#page=3]]` for specific PDF pages. Folio currently lacks a mechanism to render these media types inline.
*   **Image Resizing**: `![[image.png|100x100]]` (Obsidian syntax) or `![alt|200](https://url)` (Standard Markdown extension syntax).

### Advanced Formatting & Elements
*   **Callouts (Admonitions)**: Supported natively! Folio supports 12 of the primary Obsidian layout styles (Note, Abstract, Tip, Success, Question, Warning, Failure, Danger, Bug, Example, Quote, Todo). Includes foldable support (`> [!NOTE]-`).
*   **Tables**: Supported natively via `@tiptap/extension-table` with strict markdown `|` text formatting alignment.
*   **Math (LaTeX/MathJax)**: Supported natively via KaTeX for both block (`$$...$$`) and inline (`$math$`). Edited seamlessly via inline text areas.
*   **Tags**: `#tag` natively parsed and rendered as interactive UI pills. (Note: hierarchical tag indexing `#parent/child` is parsed but relies on external application logic to filter).
*   **Frontmatter (YAML)**: Supported natively. Parsed and rendered as an uneditable property block at the very top of the note to preserve application metadata perfectly across edits.
*   **Reference-style Links**: `[link text][ref-id]` accompanied by `[ref-id]: https://url`. While Folio's parser can read these, `@tiptap/markdown` round-trips them by silently flattening them into inline links `[link text](https://url)`. The original reference definition block at the bottom will literally be deleted upon editing.
*   **Highlights**: `==Highlighted text==`. (Tiptap has a `<mark>` / highlight extension, but it is not currently included in Folio).
*   **Mermaid Diagrams**: ````mermaid ... ```` blocks render as diagrams in Obsidian. Folio renders this as a standard code block.
*   **Footnotes**: `[^1]` inline and `[^1]: Footnote text` at the bottom.
*   **Comments**: `%% This is a hidden comment %%`. Doesn't render in preview mode.
*   **Inline HTML**: Obsidian natively renders raw HTML like `<u>text</u>`, `<br>`, or `<span style="color:red">`. Folio does not have defined behavior for all raw structural HTML.
*   **Properties (formerly YAML Frontmatter)**: 
    ```yaml
    ---
    title: My Note
    tags: [a, b]
    ---
    ```
    Obsidian (since v1.4) parses this into an interactive, structured UI properties panel at the top of the note instead of raw YAML. Folio treats it as a horizontal rule followed by text, which will break the YAML format during formatting/serialization.

---

## 3. What is Not Supported

Here is the definitive explicit list of Obsidian formatting features that **are currently NOT supported** by the Folio editor:

1.  **Headings 4, 5, and 6** (`####`, `#####`, `######`) and Setext headings (`Title\n===`)
2.  **Nested Task Lists** (`- [ ]`)
3.  **Wikilink Aliases** (`[[Link|Alias]]`)
4.  **Wikilink Anchor Links** (`[[Link#Heading]]` or `[[Link^block-id]]`)
5.  **Same-note Anchors** (`[[#Heading]]` or `[[^block-id]]`)
6.  **Combo Wikilinks** (`[[Link#Heading|Alias]]`)
7.  **Block Identifiers** (`^block-id`)
8.  **Media Audio/Video/PDF Embeds** (`![[file.mp3]]`, `![[doc.pdf#page=3]]`)
9.  **Embed + Anchor Combos** (`![[Note#Heading]]`, `![[Note^block-id]]`)
10. **Image Resizing** (`![[image.png|200]]` or standard `![alt|200](url)`)
11. **Highlights** (`==text==`)
12. **Nested Callouts** (Callouts inside of Callouts)
13. **Mermaid Diagrams** (Renders as plain text/code blocks)
14. **Footnotes** (`[^1]`)
15. **Markdown Comments** (`%% comment %%`)
16. **Inline HTML** (`<u>`, `<span>`, etc.)
17. **Hard Line Breaks via Backslash** (`line\`)
18. **Reference-style Links** (Silently flattened to inline links upon serialization)

---

## 4. Where to Find these Features in the Codebase

If you plan to add support for missing Obsidian features or remove existing ones, here are the key files responsible for Markdown parsing, feature configuration, and editor behavior in the Folio project:

### Main Editor Configuration
*   **`src/lib/editor/extensions.ts`**: **The most important file for adding/removing features.** This file exports the `getEditorExtensions()` function, which defines the exact array of Tiptap extensions (e.g., `StarterKit`, `@tiptap/markdown`, `Wikilink`) loaded into the editor. If you want to add Tables or Highlight support, you would import and add the extension to the array here.
*   **`src/components/Editor.tsx`**: The core rich-text React component. It initializes the Tiptap `useEditor` hook and wires it up to the extensions from `extensions.ts`. It also contains the logic for intercepting and saving pasted images to the local filesystem.

### Custom Markdown Extensions & Parsers
*   **`src/extensions/Wikilink.ts`**: The custom Tiptap Node extension responsible for parsing `[[Note Name]]` links. Notice the `markdownTokenizer` and `renderMarkdown` methods—this is where you would update the Regex if you wanted to add support for Obsidian Aliases (`|Alias`) or Block/Heading anchors (`#` and `^`).
*   **`src/components/WikilinkNodeView.tsx`** & **`src/components/WikilinkSuggestion.tsx`**: The React UI components that render the interactive tag/link inside the editor and handle the dropdown suggestion popup when you type `[[`.
*   **`src/extensions/SlashCommand.ts`** & **`src/components/SlashCommandSuggestion.tsx`**: Handles the `/` menu popup for inserting blocks (which is a rich-text feature rather than pure Markdown syntax).

### UX Extensions
*   **`src/extensions/TypewriterMode.ts`** & **`src/extensions/SmoothCaret.ts`**: pure editor UX extensions that control caret animation and keeping the active line centered, separate from Markdown parsing.

---

## 5. Implementation Roadmap & Progress Status

### Phase 0 — Corruption Guard
- [x] Create `CorruptionBanner.tsx` component
- [x] Integrate corruption detection into `Editor.tsx`

### Phase 1 — Quick Wins
- [x] Enable H4-H6 in `extensions.ts`
- [x] Enable nested task lists in `extensions.ts`
- [x] Add Setext heading support
- [x] Update `MarkdownPaste.ts` (H1-H6, Setext)
- [x] Add H4/H5/H6 slash commands
- [x] Add H4/H5/H6 CSS styles

### Phase 2 — Wikilink Overhaul
- [x] Rewrite `Wikilink.ts` tokenizer (alias, anchor, same-note)
- [x] Update `WikilinkNodeView.tsx` (alias display, anchor icon)
- [x] Update `handleWikilinkClick` in `useFileOperations.ts`
- [x] Fix cross-note alias and anchor drop on serialization (`tipTapToMarkdown`)

### Phase 3 — New Extensions
- [x] Install Table/Highlight packages
- [x] Register Table in `extensions.ts`
- [x] Create `Callout.ts` + `CalloutNodeView.tsx`
- [x] Create `Frontmatter.ts` + `FrontmatterNodeView.tsx`
- [x] Create `Tag.ts` + `TagNodeView.tsx`
- [x] Create `MathBlock.ts` and `InlineMath.ts`
- [x] Create `Embed.ts` + `EmbedNodeView.tsx`
- [x] Update `SlashCommandSuggestion.ts` (new commands)
- [x] Update `index.css` with new styles
- [ ] Create `Comment.ts`
- [ ] Create `Footnote.ts`
- [ ] Standard image resizing (`![alt|200](url)`)
- [ ] Update `FloatingToolbar.tsx` (highlight button)
- [ ] Update `MarkdownPaste.ts` (new patterns)

### Phase 4 — Edge Cases
- [ ] Backslash line breaks
- [ ] Inline HTML pass-through
- [ ] Reference-style links decision
- [ ] Create `BlockId.ts`

### Phase 5 — Heavy Rendering (Deferred)
- [ ] Mermaid diagrams (pending user decision)
- [ ] Note transclusion (pending user decision)
