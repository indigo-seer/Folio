# Folium: project status, safety audit, and remediation plan

Audit date: October 19, 2026. Source snapshot: `Refactored-Parser` at `7182b84` (version `0.5.2`). This report assesses the current checkout; the separate sync branch was inventoried, not fully audited. Application code and dependency versions were not changed during this audit.

**Assessment: Folium is a substantial desktop editor prototype approaching feature completeness for its original writing experience, but it is not ready to be trusted with irreplaceable vaults.** The next milestone should be a reliability and security release. There are reproducible note-preservation defects, unsafe file mutation paths, and known dependency vulnerabilities. Adding sync before resolving these would propagate existing corruption and make recovery harder.

> **Remediation update (October 20, 2026):** The tables and findings below preserve the audited `7182b84` baseline. The working tree now contains the first reliability/security implementation pass. All sync work remained untouched.
>
> - Patched and aligned TipTap/ProseMirror, Vite, Vitest, KaTeX, DOMPurify and fflate; `pnpm audit --prod` now reports no known vulnerabilities. Updated the Rust lockfile past every vulnerable version captured in the audit evidence.
> - Removed direct ProseMirror imports in favor of TipTap's `@tiptap/pm` entry points and deduplicated the lockfile to one model/transform runtime. This fixes the post-upgrade `Can not convert ... to a Fragment` failure that blocked Enter, text input, slash commands and Backspace on a new paragraph; the failing keyboard sequence now has a permanent regression test.
> - Added a backend-owned approved-vault list, native vault selection, active-vault validation for custom commands, one-time canonical import grants recorded from native drag/drop events, a bounded import size, a restrictive CSP and asset scope, and a shell-free Windows URL opener. Removed the static Documents/Desktop filesystem scopes. Previously approved vault roots remain in Tauri's process-lifetime plugin scope because Tauri has no reversible allow rule; sensitive custom commands enforce the currently active root.
> - Added a Linux image transport fallback for WebKitGTK's cross-origin rejection of `asset://` URLs. It reads bounded image bytes through a native command restricted to the active vault or Folium image cache, creates revocable Blob URLs in the editor, and keeps the asset protocol path on Windows and macOS. Canonical-path tests cover unrelated paths and symlink escapes.
> - Fixed the reproduced Markdown losses for inline math, dollar-containing code, escapes, ordered-list starts, code delimiters, table pipes and table alignment. These cases now run through the production parser in the permanent test suite.
> - Added document sessions with dirty/version state, ordered conflict-aware saves, recovery drafts in local storage, shared-pane updates, flush-before-mutation/shortcut-close, close-request flushing, and recoverable same-directory replacement writes. Viewing a note no longer writes it.
> - Added exclusive note creation with unique Untitled allocation, no-clobber rename/move checks, path/name validation, browser-relative path consistency, descendant tab/session remapping and source-aware backlink rename transactions.
> - Serialized configuration operations, made stale snapshots apply only their changed top-level fields, added field transactions, runtime checks, atomic native writes, surfaced failures and preserved corrupt backups.
> - Added path-qualified note identity, ambiguity handling, alias/anchor normalization and code-aware wikilink extraction. Image migration transformations now skip code and dirty notes and recheck disk state before writes; automatic startup/workspace migration is disabled until preview and rollback are implemented.
> - Bounded and type-checked image imports; bookmark preview requests now block private/local destinations and redirects and stream into explicit size limits. CI and release workflows now run locked installs, tests, builds, audits, Rust checks and Clippy with pinned tool versions.
>
> Permanent checks currently cover 77 frontend tests across 11 files and 4 Rust tests. Frontend build, TypeScript, Rust formatting, Linux `cargo check`, and strict Clippy pass. `pnpm audit --prod` reports no known production vulnerabilities; the Rust lockfile no longer contains the vulnerable versions recorded below, and CI/release now run Rust audit checks. Native WebView smoke tests, real crash/power-loss tests, signed cross-platform package smoke tests, migration preview/rollback UI, full accessibility work, cache worker/cancellation work, source-mode handling for arbitrary unsupported Markdown, and bundle/performance work remain before the report's full release exit criteria are met.

## 1. What the project is trying to become

The [original PRD](archive/folio-prd.md) describes a calm, opinionated, local-first Markdown editor: plain files, attractive typography, fast navigation, wikilinks and graph view, and first-class focus/typewriter modes. Obsidian compatibility and user ownership of files matter more than accumulating features. Its strongest promise is that Folium does not silently modify notes beyond the user's edits.

The later [sync PRD](archive/sync_implementation_prd_.md) expands the scope considerably: embedded Syncthing, Yjs documents, pairing, history, compaction, desktop background operation, and Android. It also changes the storage contract: `.yjs` becomes authoritative and Markdown becomes derived output. That is a significant product decision, not simply a transport implementation detail. It needs explicit reconciliation with the original plain-file model before integration.

| Document | How to use it now |
| --- | --- |
| `docs/archive/folio-prd.md` | Product vision and original acceptance criteria; implementation checklist is historical. |
| `docs/archive/folio-custom-titlebar-prd.md` | Historical titlebar design; do not reuse its permissive security configuration examples. |
| `docs/archive/sync_implementation_prd_.md` | Draft future architecture, not a description of this checkout. Its old integration branch name is stale. |
| `docs/archive/markdown_comparison.md` | Historical compatibility inventory. Frontmatter stripping is no longer in the production load path, reference restoration exists, and media previews have expanded. Its claim that inline math round-trips is incorrect today. |
| `docs/archive/bug_resolution_nested_notes.md` | Useful incident history. Its claims of universal resolution and selection-based security are too strong: hydration cancellation and unrestricted scope grants still need attention. |
| `CODEBASE_OVERVIEW.md` | Architecture guide, with audit corrections applied alongside this report. |
| `CODE_AUDIT.md` | April 11 findings, preserved as history. Section 5 below reconciles every numbered item. |

## 2. Current implementation versus the vision

| Area | Current state | Remaining gap |
| --- | --- | --- |
| Desktop foundation | Tauri 2, React 18, strict TypeScript, TipTap 3, Vite, Tailwind; versions agree at `0.5.2`. | No runtime validation of packaged Windows/macOS/Linux apps in this audit. |
| Local vaults | Nested Markdown tree, workspace history, create/rename/move/delete, stable vault UID file. | Collision handling, mutation transactions, browser path consistency, and recovery need work. |
| Writing experience | Live formatting, selection toolbar, slash commands, tables, code highlighting/copying, tasks. | Load/save fidelity is not reliable for several ordinary inputs. |
| Obsidian features | Wikilinks, aliases, heading anchors, tags, frontmatter, callouts, images, inline/display math. | Parsing support does not imply safe saving. Block-ID navigation remains explicitly unimplemented. |
| Embeds | Note text previews, bookmarks, PDF iframes, audio controls, attachment links. | Note previews use the first eight nonempty lines, not full live section/block transclusion. Some non-attachment media paths are not discoverable from the Markdown-only tree. |
| Navigation | Main/split tabs, quick switcher, graph, backlinks. | Tab state is in memory; it is not restored after restart. Same-basename notes collide in the note index. Quick switcher “recent” notes are the first ten entries, not actual recency. |
| Focus/typewriter | Implemented, including Linux rendering fallback and deliberate edge reveal. | Defaults in config are not wired into `EditorModeProvider`; no cross-platform interaction benchmark here. |
| Sidebar | Nested folders, collapse/expand, context-menu operations. | PRD drag-to-move/reorder, resizable sidebar, and persisted collapsed state are not implemented. Split-pane resizing is implemented. |
| Graph | Force graph, pan/zoom and note navigation. | Uses basename identities; node size is fixed by existing/stub state, not connection count. No 200+ note performance validation. |
| PDF | Canvas screenshot to PDF, desktop save dialog/browser download. | Raster output, long-note and failed-image limits, and correct focused-pane export need work. |
| Preferences/onboarding | Theme, typography, typewriter blur, onboarding, workspace management. | Independent whole-config writers can overwrite each other's settings. Starter-note shortcuts are stale. |
| Sync | Absent from this branch: no `src/sync`, Yjs dependency, or Syncthing runtime. | Separate experimental branch exists; not an enabled or finished feature here. |
| Offline/privacy | Notes are stored locally. | Google Fonts load over the network, Aptabase receives `app_opened`, bookmark previews fetch URLs, and image migration downloads remote images. “Local-first” is not “network-free.” |
| Quality/release | Passing unit suite, TypeScript, frontend build, Linux Rust check and Clippy. | No PR test workflow, editor lifecycle integration suite, browser/native end-to-end suite, or enforced dependency/security gate. |

The original roadmap's phases 1–5 are substantially represented in code; phase 6 polish and release readiness remain incomplete. PDF export from phase 7 is present, while sync is separate. The sub-second startup target, large-vault graph target, Markdown interoperability target, and three-minute sync setup target have not been demonstrated by the current checks.

Local branch inventory, without fetching or changing branches:

- `Refactored-Parser`: `7182b84`, one commit ahead of its locally recorded remote-tracking ref.
- `main`: `c569e60`, the older audit-fixes baseline.
- `feature/sync-yjs-core`: `ad9b6a5`, one commit ahead of its locally recorded remote-tracking ref. It contains Yjs storage, watchers, pairing/UI, sidecar code, tests, and five bundled Syncthing binaries. Its tracker calls phase 1 host-validated, but also retains stale “in progress”/blocked wording. Desktop beta, Android, and GA are not completed according to that tracker.

Remote hosting/release state was not checked; local branch names and package versions do not prove that a release is published.

## 3. Verification and limits

| Check | Result |
| --- | --- |
| Existing Vitest suite | **45/45 pass**, four files. |
| `tsc -p tsconfig.app.json --noEmit` | Pass. |
| `npm run build` | Pass on Node `20.20.2`; the previous overview's Node-22 build restriction was not reproduced. |
| Frontend bundle | Main JS approximately **1,994.98 kB minified / 610.35 kB gzip**; Vite warns about large chunks and ineffective mixed static/dynamic imports. |
| `cargo check --locked --offline` | Pass on Linux using Rust `1.93.1`, with target artifacts in `/tmp`. |
| `cargo clippy --locked --offline --all-targets -- -D warnings` | Pass. This is host-target compilation/linting, not all-OS execution. |
| Additional round-trip/index probes | **10 fail, 1 pass**, using the production `MarkdownManager` extension registry, math repair, and serializer. |
| Additional editor lifecycle probes | **5 fail**, exercising actual hook callbacks with a minimal mocked hook scheduler and mocked editor/filesystem. |
| Additional adapter probes | **4 fail**, exercising actual adapters against in-memory filesystem API doubles. |
| npm advisory scan | **45 package/advisory entries: 15 high, 22 moderate, 8 low**. Includes one advisory counted for both Vitest and its mocker package. |
| RustSec scan | **15 vulnerability entries**, plus **9 unmaintained, 5 unsound, and 1 yanked** warning entries, across the complete 631-package lockfile. Database commit `999ec89d5d3f10f20be14750ec8c2d8b44e0ac9b`, updated October 17. |

The extra probes intentionally assert preservation guarantees that currently fail. They are archived outside normal test discovery in [the evidence directory](audits/2026-10-19/README.md); they are not newly introduced failures in the existing 45-test suite. Mocked lifecycle checks are evidence of callback/control-flow defects, not substitutes for React/WebView integration testing. Node-only Markdown parsing does not reproduce browser DOM parsing of arbitrary HTML; the passing HTML probe should not be treated as an HTML safety guarantee.

This was a repository-wide static audit with focused executable checks, not a penetration-test certification. It did not exercise malicious payloads against a live desktop app, real user vaults, native save dialogs, crash/power-loss recovery, installers/signatures, macOS/Windows runtime behavior, or the sync branch's runtime. Dependency matches indicate affected versions, not that every advisory is reachable with this app's enabled features. No private `.env` contents were read or included in the report.

## 4. Prioritized findings

P0 means fix before the next release or use with valuable original vaults. P1 means required for the reliability milestone. P2 covers remaining correctness, maintainability, and polish. Evidence is labeled as reproduced, source-confirmed, or conditional where appropriate.

### F01 — P0: affected paste dependency combined with excessive desktop privileges

**Known affected version; app-specific exploit chain not executed.** The lockfile/install uses `prosemirror-view@1.41.8`. The maintainer documents JavaScript execution when pasting attacker-controlled HTML in versions before `1.42.3`. Folium's rich HTML paste path remains enabled. [Maintainer advisory](https://github.com/ProseMirror/prosemirror-view/security/advisories/GHSA-c8x8-7fp4-3x9w).

The consequence is amplified by [Tauri configuration](../src-tauri/tauri.conf.json): CSP is disabled and asset access allows `**`/`**/*`. [lib.rs:45](../src-tauri/src/lib.rs) accepts any frontend-provided path in `grant_vault_scope` and recursively grants filesystem/asset access, with no selected-vault verification. [imageIngestion.ts:135](../src/lib/imageIngestion.ts) invokes it on parent paths derived from note image sources. Custom image commands also access `std::fs` without checking a trusted vault root.

Tauri's custom app commands are available to app WebViews by default unless explicitly constrained; plugin filesystem scopes do not automatically validate the custom command's own filesystem operations. Remote frames are not automatically granted IPC access, so this report does **not** claim every remote iframe has native privileges. [Tauri capabilities documentation](https://v2.tauri.app/security/capabilities/).

**Change:** update ProseMirror and align the TipTap package family; introduce a backend-owned set of approved vault roots and explicitly selected attachment files; canonicalize and validate paths, including symlinks; remove arbitrary frontend scope escalation; restrict asset scope; add a tested CSP. Use native selection grants for specific imports instead of granting entire source parent directories.

**Acceptance:** pasted hostile HTML cannot execute script; invoking a vault/file command outside approved roots fails; `..`, absolute paths, symlink escapes, and unrelated attachment imports cannot expand privileges. Test this in native WebViews.

### F02 — P0: ordinary Markdown loses content on save, including notes only viewed

**Reproduced.** [markdown.ts:889](../src/lib/markdown.ts) handles wikilinks, tags and images inline, then drops nodes without `text`. `inlineMath` is missing from this path. Its separate `nodeToMarkdown` case does not help because paragraph children go through `inlineToMarkdown`.

| Input / construct | Observed output / effect |
| --- | --- |
| `The answer is $x+1$.` | `The answer is .` |
| Inline code containing `$HOME and $PATH` | Only `PATH` remains in inline code after the math repair/save path. |
| Escaped literal asterisks around `literal` | Both asterisks disappear in the production parser/serializer probe. |
| Ordered list starting at 7 | Saved starting at 1. |
| Inline code containing a backtick | Serialized with an insufficient single-backtick delimiter. |
| Fenced code containing a triple-backtick line | Serialized with a triple-backtick fence, prematurely terminating the code block. |
| Table cell containing escaped `a\|b` | Saved with an unescaped pipe, changing table structure. |
| Table alignment | Alignment markers removed. |

[Math repair at line 33](../src/lib/markdown.ts) processes text carrying a `code` mark and ignores original escaping context. Some loss happens in the installed parser itself: its inline token dispatch lacks a fallback for escape tokens. It is insufficient to repair only the final serializer.

[useEditorState.ts:79](../src/hooks/useEditorState.ts) also serializes and writes on every note switch without a dirty check. The lifecycle probe confirms a write after merely viewing a note. Consequently, opening A and then B can persist the lossy transformation without the user typing in A. This violates the original PRD's most important preservation promise.

**Change:** immediately add dirty/version checks, complete inline-node serialization, and make math repair respect code/literal text. Build a production parse → repair → serialize → parse corpus, checking semantic preservation as well as byte stability where promised. Cover nested structures, reference links, image titles/paths, HTML, unknown nodes, and escaped syntax. Preserve unsupported source or offer a source/read-only mode; never silently drop unsupported nodes/marks. Do not delete the legacy parser until its useful fixtures have moved to the production corpus.

### F03 — P0: creating a note can erase an existing note

**Reproduced with adapter API doubles; source-confirmed unguarded writes.** [useFileOperations.ts:80](../src/hooks/useFileOperations.ts) always creates `Untitled`. [tauriAdapter.ts:93](../src/lib/fs/tauriAdapter.ts) writes an empty string to that path, and [browserAdapter.ts](../src/lib/fs/browserAdapter.ts) opens/creates the same name and writes empty content. Neither checks collisions or uses exclusive creation. A second new-note action can truncate `Untitled.md`.

Rename and move similarly lack destination protection. The native rename API can replace an existing destination; the browser copy path overwrites destinations explicitly. Tauri's catch-all move fallback treats every rename error as a copy/delete opportunity, reads as text, and recursively removes the source. That is not a safe cross-device move implementation.

**Change:** allocate unique untitled names using exclusive creation; use no-clobber rename/move semantics; make same-path operations no-ops; handle cross-device errors explicitly with verified byte copies; only delete the source after a durable destination is established. Permanent delete already asks for confirmation, but a trash/recovery option would further improve safety.

**Acceptance:** repeated/concurrent new-note creation, rename-to-existing, case-only renames, moves to the same parent, cross-device failures, and directory collisions never destroy existing content.

### F04 — P0: closing, switching, and renaming can discard unsaved drafts

**Reproduced in callback probes.** [useEditorState.ts:91](../src/hooks/useEditorState.ts) looks up the departing note in the **new** tab list. Closing its last tab, clearing tabs on workspace change, or renaming its ID removes that lookup before the flush. The save is skipped and the next note replaces the editor content.

When a conflict blocks a tab-switch flush, or writing throws, the hook still proceeds to load the next note and clears the warning. Its error toast says the edits remain in the editor, but the editor is replaced. “Reload from disk” likewise discards local edits without first retaining a recoverable copy. There is no per-document draft store.

[App.tsx:166](../src/App.tsx) creates a separate `renderedTabIdRef` for file operations; it is not the ref owned by either editor hook, so updating it during rename does not synchronize hydration/save identity. [WindowControls.tsx:35](../src/components/WindowControls.tsx) calls `destroy()` explicitly, bypassing close-request work. No native close flush is registered; a pending one-second autosave can be lost on exit.

**Change:** retain document identity, source, dirty draft and save status independently of tabs. Await `flush(documentId)` before removing/renaming/switching, and preserve a recovery draft on failure. Make reload an explicit discard/merge/recovery choice. Route native and custom close through a bounded, recoverable shutdown flow. Share document state when both panes show the same file.

### F05 — P1: stale hydration and uncoordinated saves

**Hydration cancellation reproduced; save races source-confirmed.** The hydration effect in [useEditorState.ts:71](../src/hooks/useEditorState.ts) uses `isSyncingRef` to ignore a newer invocation while its cleanup invalidates the older one. A dependency change during a delayed read makes the old invocation abandon hydration and the new one return early. The callback probe leaves A displayed after selecting B. `onError` is an unstable modal-context function, and filesystem state changes also recreate dependencies.

Autosaves have no per-path write queue. Main/split editors keep independent disk baselines. Checking current disk content and writing happen in separate calls, so another editor/process can write between them. A slower earlier write can also complete after a newer one. Tab-switch saves bypass `useFileSystem.writeFile`, so their backlink updates are skipped.

**Change:** use a generation/token for hydration and retry the latest requested document; reset loading state on every exit. Use one document coordinator with ordered writes, version checks, atomic replacement and conflict snapshots. Atomic replacement prevents partial writes; it does not by itself solve external-writer races. Define a conservative conflict protocol for external tools and multiple app instances.

### F06 — P1: background image migration rewrites vaults outside save safeguards

**Source-confirmed.** [vaultImageMigration.ts:241](../src/lib/vaultImageMigration.ts) reads a note, awaits image downloads/conversion, then writes its earlier snapshot directly. It does not recheck whether the user or another program changed the note during that interval. Boot/workspace selection starts this automatically.

Regex replacement runs over the whole Markdown string, including code examples, and can silently change them. Standard image syntax can name an arbitrary local file; ingestion grants its parent scope, reads the bytes, and writes an attachment before attempting image decode. A failed image decode does not undo the copied file. Remote image loading also happens without an explicit per-vault trust decision. A failed note write can still leave the workspace migration marked complete without a durable note-level retry record.

**Change:** make transformations explicit, previewable, source-aware and journaled; use the same document write/conflict service; verify bytes before import; limit sizes/timeouts; retain failed work for retry; stop/cancel by vault generation. Preserve source files and provide a rollback manifest. This is an implementation recommendation, not an approval requirement imposed by this audit.

### F07 — P1: settings can overwrite workspace history and migration state

**Source-confirmed.** [useSettings.tsx:26](../src/hooks/useSettings.tsx) reads the entire config once. Theme/font/blur changes later save a whole object derived from that stale snapshot. Workspace and migration code independently load/save the same file. Reproduction sequence: launch, add/select a workspace, change theme, restart; the settings writer can restore the pre-workspace configuration. Removing a workspace can similarly be undone.

[config.ts:139](../src/lib/config.ts) treats parse/read errors as grounds to write defaults over the original configuration. Saves are non-atomic and suppress errors. Runtime shape validation is weak despite TypeScript interfaces.

**Change:** one configuration store with field-level updates, serialized atomic persistence, runtime schema/version validation, and preserved corrupt-file backups. Propagate failures and retry safely; never reset user state merely because a read temporarily failed.

### F08 — P1: note identity and backlink parsing are inconsistent

**Reproduced.** [vaultIndexer.ts](../src/lib/fs/vaultIndexer.ts) keys notes and sources by basename. Two different `Note.md` files collapse into one entry, while navigation chooses the first matching basename. Links with aliases/anchors become literal index keys (`Target|alias`, `Target#Heading`); code examples and image embeds are counted as note links.

Rename rewriting in [useFileSystem.ts:174](../src/hooks/useFileSystem.ts) handles only exact `[[OldName]]`, uses the ambiguous index, rewrites whole source files, and can mutate code examples. It does not preserve correctness for path-qualified, alias, anchor or concurrent edits. The incremental index also mutates an existing target `Set` when adding some links.

**Change:** use canonical vault-relative paths for identity; a single resolver for wikilinks, embeds, graph, quick switcher and backlinks; parse links contextually outside code. Treat rename/link rewriting as a coordinated transaction with conflict checks. Surface ambiguity rather than silently choosing a different note.

### F09 — P1: file/folder operations lack a consistent path contract

**Source-confirmed; path forwarding reproduced in the adapter double.** Native create/rename paths concatenate unchecked names. The title editor validates names, but the sidebar rename modal does not; wikilink-created stubs bypass those UI checks. `../outside` is forwarded by the adapter as `/vault/../outside.md`. Actual native traversal success depends on Tauri/plugin path validation and granted scopes; the mocked probe does not establish an OS-level escape. Backend validation is still essential, especially given F01.

Folder rename updates only a tab exactly matching the folder path, leaving descendant note tabs stale. Folder-move descendant checks use `oldPath + '/'`, failing for native Windows backslash paths. Renames/moves are performed before dirty editor state is reconciled.

**Change:** centralize filename validation separately from intentional vault-relative wikilink resolution; canonicalize backend paths; update all descendant document identities across both panes; preserve dirty state and cursor state through mutations.

### F10 — P1: browser vault paths break ordinary mutations

**Reproduced with browser handle doubles.** [browserAdapter.ts:60](../src/lib/fs/browserAdapter.ts) returns the root directory name as its path. Scanning prefixes notes with `Vault/`, but parent lookup starts from the already-selected vault handle and tries to enter a nested `Vault` directory. Existing notes can read through cached handles while rename/delete/nested-create fail. New root notes initially use a different key format and can fail after a refresh.

Browser workspace restoration explicitly throws, binary I/O is absent, and image indexing filters out images. Folder move/rename is disabled in the UI, which is appropriate, but does not fix the root-path mismatch.

**Change:** use a stable root identity plus consistently relative entry paths; implement handle persistence/repermission if browser mode is a supported product; otherwise clearly document browser mode as a limited preview. Add adapter contract tests shared with the native implementation.

### F11 — P1: network previews and media work are insufficiently bounded

**Source-confirmed; exploitation not attempted.** [bookmark_preview.rs:211](../src-tauri/src/bookmark_preview.rs) allows arbitrary HTTP(S) URLs and up to eight redirects, including loopback, private networks and link-local destinations. Bookmark node views fetch on rendering. In a desktop app this permits note-controlled requests to services reachable from the user's machine, rather than requests from a public server.

`MAX_HTML_BYTES` is enforced **after** `response.bytes()` has buffered the complete decompressed body. The oEmbed JSON path is also unbounded. [imageIngestion.ts:116](../src/lib/imageIngestion.ts) similarly buffers full remote bodies without an explicit timeout/size/type policy. PDF iframes have no `sandbox` or referrer policy, and a remote `.pdf` URL can serve other content or redirect.

**Change:** define a remote-content policy; validate destinations/redirects and DNS results, with explicit trusted intranet exceptions if desired; limit streaming/decompressed bytes, concurrent requests and time; verify media type/content; sandbox or externalize untrusted embeds. No credentials or local-network service was contacted as a test.

### F12 — P1: Windows external URL opening uses a command shell

**Conditional security risk, not a demonstrated Windows exploit.** [lib.rs:19](../src-tauri/src/lib.rs) passes a note-derived URL to `cmd /C start`. Restricting URL schemes to HTTP(S) is helpful, but does not make shell interpretation safe. Rust explicitly warns that `cmd.exe` uses nonstandard argument parsing and malicious arguments can run shell commands. [Rust Command documentation](https://doc.rust-lang.org/std/process/struct.Command.html).

**Change:** use an OS-native URL opener or maintained Tauri opener with explicit HTTP(S) permission. Validate Windows URL edge cases on Windows. Do not attempt to maintain a custom shell-escaping policy for this feature.

### F13 — P1: dependency and release checks need to become enforced gates

The complete findings are preserved in [npm-advisories.json](audits/2026-10-19/npm-advisories.json) and [rust-advisories.json](audits/2026-10-19/rust-advisories.json). Prioritize runtime entry points before lower-reachability build dependencies.

| Dependency | Installed/locked | Audit remediation floor / assessment |
| --- | --- | --- |
| `prosemirror-view` | `1.41.8` | At least `1.42.3`; direct HTML paste relevance (F01). |
| `@tiptap/core` | `3.22.1` | At least `3.30.5` for reported attribute-parser fixes; align the whole TipTap family and rerun compatibility tests. Attribute helper reachability needs confirmation for each extension. [Maintainer advisory](https://github.com/ueberdosis/tiptap/security/advisories/GHSA-j95f-988m-3j2f). |
| `linkify-it`, `markdown-it` | `5.0.0`, `14.1.1` | At least `5.0.2`, `14.3.1` for reported denial-of-service fixes; distinguish the transitive Markdown parser from Folium's active Marked/TipTap path. |
| `dompurify` via jsPDF | `3.3.3` | Scan reports fixes through `3.4.16`; Folium exports canvas images rather than invoking jsPDF's HTML API, so all sanitizer advisories are not automatically reachable. |
| Vite | `6.4.1` | At least `6.4.3` for reported dev-server issues; development exposure differs from bundled desktop production. |
| PostCSS / Vitest | `8.5.8` / `4.1.2` | Audit floors `8.5.23` / `4.1.11`; update associated transitive packages. |
| KaTeX | `0.16.44` | Reported trust-bypass fix is `0.18.2`, with existing prototype pollution as a precondition; test rendering/API compatibility during upgrade. |
| Rust HTTP/TLS stack | `h2 0.4.15`, `rustls 0.23.38`, `rustls-webpki 0.103.12` | Reported floors `0.4.16`, `0.23.46`, `0.103.13`. Present in the active Linux reqwest dependency tree; advisory feature/precondition checks still apply. |
| Rust image dependencies | `crossbeam-epoch 0.9.18` | Reported floor `0.9.20`; active through image/rayon, with specific invalid-pointer formatting preconditions. |

Other Rust matches include `quick-xml`, `quinn-proto` and `rkyv`, which were not present in the default Linux inverse dependency tree checked here. Review other targets/features instead of claiming fifteen exploitable runtime flaws. The unmaintained/unsound/yanked warnings also need ownership and documented triage. npm's `braces` finding has no patched version in the scan; remove/replace the affected path or document a bounded exception after reachability analysis.

[release.yml](../.github/workflows/release.yml) builds draft releases on tags/manual dispatch but does not run unit tests or security audits. There is no PR validation workflow. Pin pnpm/Node/Rust toolchain policy, enforce frozen installs explicitly, add frontend and Rust checks plus security triage, and validate tag/package/Cargo/Tauri version agreement. A clean lockfile scan should be part of release review, with reviewed exceptions for non-reachable/unmaintained dependencies.

### F14 — P2: image cache freshness, resource usage, and workspace changes

[imageCache.ts](../src/lib/imageCache.ts) retains display URLs indefinitely by absolute path; external image edits are not observed, so the Rust mtime-based key is not rechecked once memory cache hits. Old on-disk versions remain when source files still exist because orphan sweeping checks only source existence. Root/UID changes do not isolate already-running jobs; a vault generation token is needed.

[image_cache.rs:200](../src-tauri/src/image_cache.rs) decodes the full image before resizing and runs heavy processing in synchronous Tauri commands. Define explicit input/decoded-pixel limits, move CPU work to a bounded blocking worker, and use atomic cache writes. HEIC/HEIF are listed as cacheable extensions, but the selected Rust image backend needs codec support verified; GIF conversion produces a static cache image, so preserve animation semantics deliberately.

### F15 — P2: focused-pane and PDF correctness

PDF export uses the main `activeTabId` and `document.querySelector('.ProseMirror')` even when the split pane has focus. Anchor scrolling also selects the first editor. Word count debounces per editor now, but broadcasts a shared event without pane identity, so whichever editor last updates can own the status line.

[pdfExport.ts](../src/lib/pdfExport.ts) waits on image events after `decode()` rejects without a timeout/recheck, which can hang after an error event has already fired. Its 35-million-pixel scale adjustment bottoms out at 1, so very tall notes can exceed the intended cap. Single-page raster export loses searchable/selectable text and can shrink long notes severely.

**Change:** pass explicit document/editor/pane handles; use bounded image waits and pagination/rendering limits; decide whether PDF is a visual snapshot or a document export and set expectations accordingly.

### F16 — P2: platform, accessibility, and product-detail gaps

System theme reads `matchMedia` once without listening for changes; graph theme checks only `theme === 'dark'`, so system-dark users can get a light graph. `focusModeDefault`/`typewriterModeDefault` are stored but not consumed by the editor mode provider. The seeded getting-started note advertises `Ctrl+Shift+F` and `Ctrl+O`, while the global hook uses `Ctrl+,` and has no open-vault shortcut.

Modal/quick-switcher containers lack consistent dialog semantics, focus trapping/restoration, and shortcut scoping. Global shortcuts can still create/close notes while a modal/input is active. Collapsed file-tree descendants remain mounted and potentially keyboard-focusable. These require keyboard/screen-reader checks, not just visual review.

Google Fonts should be bundled if predictable offline typography is part of the product promise. Document Aptabase and remote-preview behavior and expose an appropriate preference. No user note content is passed by the explicit `app_opened` call inspected here; that is not a complete audit of vendor telemetry.

### F17 — P2: architecture and performance debt remains, but size alone is not a defect

The core hook APIs are typed, and the performance auditor is encapsulated. Remaining `any` usage is concentrated in editor/node-view boundaries: a rough search finds 73 non-test lines containing `any` and 19 TypeScript suppression lines (not a type-quality metric). Replace these at data boundaries first, using TipTap/ProseMirror types and checked unknown data.

`Editor.tsx` (682 lines) combines editor setup, image ingestion, file embedding, cache effects and UI. `markdown.ts` (940 lines) still mixes a legacy parser, repair passes, reference handling and serialization. Extract the document/persistence services first, then attachment handling and UI panels. Adding a broad application context or a new state library by itself will not repair these ownership problems.

Every file mutation rebuilds the full note index and scans images; indexing reads notes serially and startup waits for it. `scanDirectory` logs errors and returns partial/empty results without surfacing incompleteness. Collapsed folders still render their subtree. Eager graph/PDF imports contribute to the approximately 2 MB main JS chunk.

**Change:** report incomplete scans, use bounded concurrency and incremental indexing, cancel stale vault scans, lazy-load optional graph/PDF/diagnostics, and measure startup and typing before further animation refactors. There is no justification to replace a custom caret with CSS solely because its file is large.

### F18 — P2: toolchain metadata and Linux initialization need correction

The crate declares Rust `1.77.2`, but locked `image 0.25.10` declares minimum Rust `1.88.0`; the declared minimum is not credible for this dependency set. Set and test an actual supported toolchain. `package.json` lacks `engines`/`packageManager`, CI uses pnpm `latest`, and the container installs moving Node/Rust/CLI versions. The Dockerfile is in use by `build-appimage.sh`; it is not unexplained dead clutter.

The old audit says `set_var` happens before multithreading. It no longer does: [main.rs](../src-tauri/src/main.rs) constructs a multithread Tokio runtime before [lib.rs](../src-tauri/src/lib.rs) sets Linux process environment variables. Move environment initialization before thread creation or into launch-time configuration. Rust documents the multi-threaded Unix safety constraint; this is more than a future edition warning. [Rust environment API](https://doc.rust-lang.org/std/env/fn.set_var.html).

The release workflow has no explicit signing/notarization setup, and Cargo package metadata still contains placeholders. Verify actual distribution/signing requirements before calling a release generally available. Remove tracked `tsconfig.tsbuildinfo` as a separate cleanup; the audit restored its build-generated change.

## 5. Reconciliation of the April audit

The old severity labels overemphasized style/structure: an unused theme hook and `any` annotations are not equivalent to data-loss or exploitable security defects. The following status concerns the requested fix, not a claim that its whole subsystem is now correct.

| Old # | Finding | Current status | Evidence / remaining work |
| --- | --- | --- | --- |
| 1 | Core APIs typed as `any` | Partial, major progress | `FileSystemAPI`, `TabsAPI`, `FileOperationsAPI` now type core consumers; editor integration still bypasses types. |
| 2 | Modal context stale closure | Fixed | `closeContextMenu` uses a functional updater. |
| 3 | Unused `useTheme` | Fixed | File removed. |
| 4 | Duplicated Markdown pipeline | Open | Legacy parser remains; production parser/custom serializer remain asymmetric. Actual fidelity defects in F02. |
| 5 | Prop drilling | Partial | `EditorModeContext` removes mode drilling; filesystem/tabs/operations still flow through wrappers. |
| 6 | Duplicated image constants | Fixed for reported sites | Shared constants include `ico`; remaining regex inventories can be consolidated later. |
| 7 | Path normalization duplication | Partial | Shared helper exists, but inline separator/prefix logic remains. |
| 8 | Graph sentinel string | Fixed | `GRAPH_TAB_ID` centralized. |
| 9 | Performance auditor globals | Partial | Encapsulated in `PerformanceAuditor`; still a global singleton and eagerly imported. |
| 10 | Global word-count timer | Partial | `WeakMap<Editor, timer>` fixes shared debounce, but events lack pane identity and explicit editor disposal. |
| 11 | Overloaded editor hook | Partial | Autosave extracted; hydration, conflict handling and lifecycle ownership still intertwined. |
| 12 | Repeated vault refresh sequence | Fixed | Shared `refreshVault`. Performance/cancellation still require work. |
| 13 | No-op backlink deletion | Fixed | Updated set is stored back in the map. Other indexing defects remain in F08. |
| 14 | Inconsistent path splitting | Partial | `getBasename` exists; Windows descendant handling is still inconsistent. |
| 15 | Settings effect dependency loop | Fixed as described | Uses `useRef`; does not solve stale whole-config overwrites (F07). |
| 16 | Root clutter | Fixed for requested organization | PRDs archived, scripts moved, stale npm lock removed; Dockerfile has a real caller. |
| 17 | KaTeX types dependency | Fixed | In `devDependencies`. |
| 18 | Two JS lockfiles | Fixed | Current branch has only `pnpm-lock.yaml`. Sync branch still needs reconciliation when merged. |
| 19 | Async errors not surfaced | Partial | Many toasts added, but config/scan/open errors still suppressed; save failure UI can be misleading (F04). React error boundaries do not catch ordinary async callback errors. |
| 20 | Smooth caret file size | Reassessed, nonblocking | Custom DOM/animation work remains; measure correctness/performance rather than require a CSS replacement. |
| 21 | Onboarding monolith | Partial | Named step components now exist in the same file. Further file splitting is optional after lifecycle fixes. |
| 22 | Settings monolith | Partial | Named section components now exist in the same file. Shared config ownership is the substantive issue. |
| 23 | Production debug logging | Partial | Successful note-save logs are DEV-gated; Rust cache paths and some other diagnostics still log. |
| 24 | Rust `set_var` | Open; rationale corrected | Edition 2021 still compiles, but Tokio threads now precede environment mutation. |

**Tally: 10 fixed as described, 11 partial, 2 open, 1 reassessed as nonblocking.** This is remediation progress, not a readiness percentage.

## 6. Concrete implementation plan

Keep the current architecture usable while introducing explicit ownership of documents, persistence and paths. Avoid a large simultaneous rewrite of parser, state management and sync.

| Order | Proposed change set | Completion criteria |
| --- | --- | --- |
| 1 | Security dependency patch and boundary containment (F01, F12, F13) | ProseMirror paste issue patched; aligned editor versions; arbitrary scope grants removed; native opener; security scan triage recorded. CSP regression-tested for images, math, fonts and PDF. |
| 2 | Markdown preservation patch (F02) | Inline math/code/escapes/fences/tables/list starts preserved through the **production** pipeline; no writes for viewing only; unsupported content safely retained. |
| 3 | Safe file mutation primitives (F03, F09) | Exclusive create, no-clobber rename/move, path validation, same-path protection, recoverable cross-device errors, descendant-path remapping tested. |
| 4 | Document sessions and save coordinator (F04, F05) | One document identity independent of tabs; dirty/source/version state; ordered atomic writes; conflict snapshots; flush-before-close/switch/mutate; recoverable shutdown; both panes share current document state. |
| 5 | Central configuration store (F07) | Field-level updates cannot erase workspaces/preferences/migration state; validation and corrupt-file recovery; failures surfaced. |
| 6 | Controlled attachment migration/network work (F06, F11, F14) | Preview/rollback, parsed-source transformations, conflict-aware writes, bounded validated imports, cancellation by vault, scoped privileges, cache freshness/retention policy. |
| 7 | Canonical note index and browser contract (F08, F10) | Same-name notes remain distinct; aliased/anchored/path links resolve consistently; code ignored; shared adapter tests pass; browser support policy explicit. |
| 8 | UI/performance/platform polish (F15–F18) | Focused-pane export/stats, accessible dialogs, accurate shortcuts/theme/defaults, incremental scans, lazy optional bundles, measured startup/typing, toolchain/signing checks. |
| 9 | Reconcile and integrate sync | Rebase/cherry-pick against the stabilized document/file contracts; separate security/runtime audit; offline/conflict/rename/delete/recovery tests before opt-in beta. |

Suggested service boundaries:

- **Document session:** canonical ID/path, original source, live document, dirty version, disk baseline, recovery draft and save state. Panes/tabs reference it rather than owning independent persistence.
- **Persistence service:** validated paths, per-document serialization of app writes, atomic replacement, exclusive creation, conflict reporting and mutation transactions. Autosave, rename-link rewriting and migrations all use it.
- **Markdown codec:** production extension registry, contextual compatibility repairs, complete serialization and preservation policy. Retire the legacy parser only after test migration.
- **Vault index:** path identities, shared link resolver, incremental updates, incomplete-scan status and cancellation.
- **Configuration store:** validated snapshot plus serialized field-level patches.
- **Attachment service:** selected-file grants, bounded ingestion, destination allocation, migration journal and cache lifecycle.

No new general-purpose state-management dependency is required to establish these boundaries. Decide whether one helps only after ownership and contracts are explicit.

## 7. Tests and release exit criteria

Prioritize behavioral tests around data preservation; more tests that only inspect whether a tokenizer produced a node will not catch save corruption.

1. **Markdown corpus:** use the production registry and serializer together. Verify text, marks, math, YAML, callouts, tables, nested tasks, code delimiters, links/images with unusual paths, unknown syntax, LF/CRLF and Unicode. Include parse/save/reopen and byte-preserving no-edit cases.
2. **Editor lifecycle integration:** edit then close within the debounce; switch/rename/move during a slow save; fail reads/writes; open the same file in both panes; select A→B→C rapidly; trigger modal changes during read; exit while saving. Assert file bytes and recoverable drafts, not only displayed notifications.
3. **Filesystem contracts:** collisions, exclusive create races, case sensitivity, Windows paths/UNC, traversal/symlinks, cross-device failures, folder descendant tabs, browser root paths, and interruption between copy and delete.
4. **External changes:** concurrently edit via another process, mutate images, rename/delete externally, run migration during edits, switch vault during scans/imports. Confirm no silent overwrite and no stale result applied to another document/vault.
5. **Security and resource limits:** rich HTML paste, URL schemes/shell metacharacters, private/redirected HTTP destinations, huge/compressed responses, malformed/oversized images, untrusted embeds, and IPC paths outside approved roots.
6. **Config:** first run/onboarding plus theme changes; add/remove/rename workspace then change settings; concurrent migration writes; malformed config, unsupported version and disk-full errors.
7. **Platform smoke matrix:** native Linux/macOS/Windows opening, saving, shutdown, dialogs, image display, PDF export and titlebar behavior; browser mode if supported. A compile-only matrix is insufficient.
8. **Performance/accessibility:** measure cold/warm startup and time-to-edit, 200+/large-vault graph/navigation, large-note typing, memory/cache growth, keyboard-only dialogs, screen-reader labels and reduced-motion behavior.

Before a reliability release: resolve P0 findings; complete P1 preservation/permission work or explicitly remove the affected feature; make these checks run on PRs; publish an accurate compatibility/support matrix; verify recoverability and signed package behavior on target systems.

Before sync beta, reconcile the `.md` versus `.yjs` authority decision and define rename/delete/conflict/recovery semantics. The draft's “merge length must be at least the longer input” sanity rule rejects legitimate deletions; a reserved encryption directory is not an encryption architecture; a CRDT does not remove the need to handle external edits, file identity or semantic conflicts. These are design review items, not claims that the current branch implements sync incorrectly.
