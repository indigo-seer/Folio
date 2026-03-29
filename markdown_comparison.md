# Markdown Format Comparison: Folio vs Obsidian (Current Snapshot)

> Last updated: March 29, 2026  
> Scope: What the app does today in `main` based on current source code (`src/lib/editor/extensions.ts`, `src/lib/markdown.ts`, `src/hooks/useEditorState.ts`, extension modules, and tests).

## 1. Executive Summary

Folio now supports a much broader Obsidian-style markdown surface than before, including:

- Wikilinks with alias/anchor variants
- Callouts with fold behavior
- Native tables
- Obsidian-style codeblock copy affordance (hover copy button)
- Highlight syntax (`==mark==`)
- Inline + block math
- Tag tokens (`#tag`)
- Embed tokens (`![[Note]]`, including anchor forms)

It uses a hybrid pipeline:

- **Load/edit parse path**: TipTap `@tiptap/markdown` + custom tokenizers in extensions.
- **Save path**: custom serializer in `src/lib/markdown.ts` (`tipTapToMarkdown`).

That means support quality is best judged by **round-trip behavior** (load -> edit -> save), not only parse.

---

## 2. Supported and Round-Trippable

These features are currently supported in practice and serialized back to markdown explicitly by `tipTapToMarkdown`.

| Feature | Folio Status | Notes |
|---|---|---|
| Bold / Italic / Strike / Inline Code | Supported | Serialized via mark handlers in `inlineToMarkdown`. |
| Headings H1-H6 | Supported | `StarterKit` configured with levels `[1..6]`. |
| Unordered + Ordered Lists | Supported | Includes multi-line item serialization. |
| Task Lists (nested enabled) | Supported | `TaskItem.configure({ nested: true })`; serializer has special indent handling for nested task items. |
| Blockquotes | Supported | Block-level parse + serialization. |
| Horizontal Rules | Supported | Serialized as `---`. |
| Hard breaks | Supported | Serialized as `\\\n`; parser converts paragraph newlines to hard breaks. |
| Fenced code blocks | Supported | Language retained through `codeBlock` attrs; hover copy button for full-block clipboard copy. |
| Standard links | Supported | Markdown link marks serialize to `[text](url)`. |
| Images | Supported | Includes attachment path normalization from Tauri asset URLs back to `attachments/...` on save. |
| Wikilinks | Supported | `[[Note]]`, `[[Note|Alias]]`, `[[Note#Heading]]`, `[[Note^block]]`, combos, and same-note anchor variants via `parseWikilinkInner`. |
| Callouts | Supported | Obsidian-like `> [!type]`, fold markers `+` / `-`, custom node view UX. |
| Tables | Supported | TipTap table extension + explicit markdown table serialization in `nodeToMarkdown`. |
| Highlights | Supported | Highlight extension + serializer emits `==text==`. |
| Math (inline and block) | Supported | `inlineMath` and `mathBlock` nodes serialize as `$...$` and `$$...$$`. |
| Tags | Supported | Custom `tag` node/tokenizer serializes to `#tag/path`. |
| Embeds | Supported (token-level) | `embed` node serializes to `![[Note]]` / `![[Note#Anchor]]`. |

---

## 3. Supported but With Important Caveats

### 3.1 Frontmatter

There is a custom `frontmatter` extension and serializer support, but the active load pipeline currently strips top-of-file frontmatter before injecting content:

- `useEditorState.ts` runs `stripFrontMatter(...)` before `setContent(..., { contentType: 'markdown' })`.

Implication:

- Existing YAML frontmatter at file start is currently not hydrated into the editor as frontmatter content in the normal load path.
- The extension/test infrastructure exists, but runtime behavior is constrained by load stripping.

### 3.2 Embeds are syntax-level, not full transclusion rendering

Embed tokens parse/render as dedicated nodes, but full Obsidian transclusion behavior (live content projection of target note/section) is not implemented yet.

### 3.3 Reference-style links

Reference link definitions are not preserved as reference definitions in save output; behavior still flattens into inline links in practice.

### 3.4 Anchor scrolling

Heading anchors are handled; block-id scrolling (`^block-id`) is not fully implemented yet in DOM navigation.

---

## 4. Not Implemented (or Not Fully Obsidian-Equivalent)

| Area | Status |
|---|---|
| Footnotes (`[^1]`) | Not implemented |
| Obsidian comments (`%% ... %%`) | Not implemented |
| Mermaid rendering | Not implemented (treated as regular fenced code) |
| Full media embed rendering (`![[file.pdf]]`, video/audio player semantics) | Not implemented |
| Block ID authoring + robust navigation | Partial / pending |
| Full Obsidian Properties parity | Partial (frontmatter caveat above) |
| Guaranteed inline HTML parity with Obsidian preview behavior | Not guaranteed |

---

## 5. UX-Driven Markdown Capabilities Added Recently

Recent implementation includes notable UX polish around markdown-native blocks:

- Callout type picker anchored to icon (icon-only grid), fold toggle in floating menu.
- Empty-callout inline hint text.
- Table UX improvements (toolbar operations, visual alignment/styling polish).
- Codeblock UX polish with hover copy affordance and copied-state feedback.
- Split pane editing with independent pane focus and pane-aware quick switch behavior.

These do not always change markdown grammar, but materially improve markdown editing ergonomics.

---

## 6. Source of Truth in Code

Primary files for markdown behavior:

- `src/lib/editor/extensions.ts`  
  Extension registry (StarterKit, Markdown, Callout, Wikilink, Table, Highlight, Math, etc.)
- `src/lib/markdown.ts`  
  Save-side serializer and fallback parser utilities
- `src/hooks/useEditorState.ts`  
  Load pipeline, autosave, and content hydration behavior (including frontmatter stripping)
- `src/extensions/Wikilink.ts`
- `src/extensions/Callout.ts`
- `src/extensions/Frontmatter.ts`
- `src/extensions/Embed.ts`
- `src/extensions/MathBlock.ts`
- `src/extensions/InlineMath.ts`
- `src/extensions/Tag.ts`
- `src/extensions/MarkdownPaste.ts`
- `src/extensions/CodeBlockCopy.ts`

Validation tests:

- `src/lib/__tests__/markdown.test.ts` (serializer behavior)
- `src/lib/__tests__/parse.test.ts` (parser behavior and regressions)

---

## 7. Practical Compatibility Guidance

If you are importing Obsidian vault content into Folio today:

- Safe bets: headings, lists/tasks, callouts, tables, wikilinks, tags, highlight, math.
- Use caution with: frontmatter-heavy notes, reference-style links, footnotes, comments, mermaid, and media-heavy embeds.

For roadmap prioritization, the biggest compatibility gains would come from:

1. Frontmatter load-path parity (stop stripping or convert to node reliably)  
2. Footnotes/comments support  
3. Rich media/embed rendering and block-id navigation
