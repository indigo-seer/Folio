# Folio
### A markdown editor built for thinking, not tinkering.

**Product Requirements Document · Version 1.0 · February 2026**

---

## 1. Vision & Purpose

Folio is a cross-platform markdown editor and viewer designed around a single belief: the tool should disappear when you write. Where Obsidian is a powerful system that rewards configuration and tinkering, Folio is opinionated — beautiful by default, calm in every interaction, and fast to open.

The target user is someone who thinks in text, cares about how their tools feel, and wants a local-first notes system that respects their files and their focus. Folio does not compete with Obsidian on feature count. It competes on experience.

> **Thesis:** Most note-taking apps are built by developers for developers. Folio is built for anyone who writes and thinks — and it shows.

### 1.1 What Makes Folio Different

| Obsidian | Folio |
|---|---|
| Powerful, extensible plugin system | Opinionated, no plugin system in v1 |
| Configurable to the point of complexity | Beautiful defaults — minimal configuration |
| Electron-based, heavier footprint | Web-first, Tauri desktop wrapper — fast and light |
| UI designed by engineers | UI designed by a designer |
| Sync via paid Obsidian Sync or iCloud | Sync via Syncthing — self-hosted, peer-to-peer |
| Focus mode is a plugin | Focus mode is a core, first-class experience |
| Typography is functional | Typography is a primary design lever |

---

## 2. Platform & Technical Stack

Folio targets all platforms through a single web-first codebase. The technical choices are made to maximise vibe-coding productivity, minimise dependencies, and ensure long-term maintainability.

### 2.1 Core Stack

| Component | Technology | Reason |
|---|---|---|
| UI Framework | React + TypeScript | Best AI code-generation support; designer-friendly component model |
| Editor | TipTap | Most designer-friendly editor library; fully styleable; great React integration |
| Desktop wrapper | Tauri | Lightweight alternative to Electron; native file system access; same web codebase |
| Graph view | React Force Graph | Performant force-directed graph; easy to style and theme |
| Styling | Tailwind CSS | Utility-first; maps well to design systems; easy to theme |
| Sync engine | Syncthing | Open-source; self-hosted; handles LAN proximity sync and server relay automatically |

### 2.2 Storage Model

Files live on disk as plain `.md` files. No proprietary database, no lock-in. A vault is simply a folder the user points Folio at. This means notes are always accessible from any other tool, and sync is just file sync — handled entirely by Syncthing outside the app.

> **Important:** Folio never modifies the content of `.md` files beyond what the user types. Metadata like wikilinks and frontmatter are parsed at read time, never injected silently.

---

## 3. Feature Specification — v1

### 3.1 Editor & Live Preview

The editor is the heart of Folio. Built on TipTap, it renders markdown as the user types — no split pane, no separate preview mode. The formatted output is always visible. The editing experience is WYSIWYG in feel but markdown on disk.

**Typography**

Typography is treated as a primary design decision, not a default. Body text uses a humanist serif at a comfortable reading size with generous line height (1.7) and a constrained content column (68ch maximum) so lines never run too long. Headings use a clean geometric sans. Code blocks use a monospace with optical sizing.

**Interaction**

- Markdown shortcuts work inline: typing `**` wraps text in bold, `#` creates a heading
- No visible toolbar during writing — formatting tools appear on text selection only
- Smooth transitions when opening, closing, or switching notes (under 200ms)
- Scroll position remembered per note

---

### 3.2 Focus Mode

Focus mode is a first-class, core feature — not an afterthought or a plugin. When activated, all surrounding UI fades out and the text column becomes the sole visible element. Mouse movement or a configurable key brings the UI back into view with a smooth fade.

> **Design intent:** Focus mode should feel like the rest of the app fades rather than disappears. The transition is the experience — a gentle, intentional dimming that signals the shift from managing to writing.

- Triggered by keyboard shortcut (`Cmd/Ctrl + Shift + F`) or a UI toggle
- Sidebar, header, and status bar fade to zero opacity
- Mouse movement or `Escape` fades the chrome back in
- Focus mode state persists across note switches until explicitly toggled off
- In focus mode, the content column optionally shifts to vertical centre of the viewport

---

### 3.3 Typewriter Mode

When writing, the active line stays vertically centred on screen rather than the cursor chasing to the bottom of the window. The document scrolls to keep the insertion point in the centre of the viewport, creating the feeling of a physical typewriter advancing through a fixed point.

Typewriter mode pairs naturally with Focus mode and can be toggled independently. It is most useful during long writing sessions and can be disabled for quick editing.

---

### 3.4 File Tree Sidebar

A collapsible left sidebar shows the vault's folder and file hierarchy. The design is deliberately minimal — no icons competing for attention, no colour-coded file types. Just hierarchy, indentation, and filenames.

- Folders expand and collapse with a smooth animation
- Active note highlighted with a subtle accent
- Files can be dragged to reorder or move between folders
- Right-click context menu for rename and delete — kept minimal
- Sidebar width is resizable; collapsed state persists

---

### 3.5 Graph View

Graph view displays all notes as nodes connected by wikilinks. It gives a spatial, visual sense of how ideas connect. The goal is not the complex hairball Obsidian defaults to — Folio's graph should be legible and beautiful even for large vaults.

- Force-directed layout with gentle physics — nodes settle naturally
- Node size scaled by number of connections
- Clicking a node navigates to that note
- Hover shows note title and connection count
- Pinch-to-zoom and pan supported on trackpad and touch
- Dark and light variants match the app theme
- Orphan notes (no links) shown in a subtle muted style

---

### 3.6 Wikilinks

`[[Note Name]]` syntax creates bidirectional links between notes. Wikilinks are parsed at read time and rendered as clickable inline links in the editor. They are the backbone of the graph view.

- Typing `[[` triggers an autocomplete dropdown listing existing notes
- Clicking a wikilink navigates to the linked note
- Non-existent links shown in a distinct style — stubs waiting to be created
- Backlinks (notes that link to the current note) shown in a collapsible panel at the bottom of the editor

---

### 3.7 Quick Switcher

`Cmd/Ctrl + K` opens a floating command palette that fuzzy-searches all notes by title. It is the fastest way to navigate the vault and the one power-user feature that earns its place because it is invisible until needed.

- Fuzzy search across all note titles
- Recent notes shown by default when the palette opens
- Arrow keys to navigate, Enter to open, Escape to dismiss
- Future: also search for commands (toggle focus mode, open graph view, etc.)

---

### 3.8 Word Count & Reading Time

A minimal status line at the bottom of the editor shows word count and estimated reading time (based on 200 words per minute). It fades in when the cursor is active and fades out during extended inactivity. In focus mode it remains visible but dimmed.

---

## 4. Sync Architecture

Folio does not build a sync system from scratch. Instead, it integrates with Syncthing — an open-source, peer-to-peer file sync engine — and provides a beautiful, minimal setup experience inside the app. All the hard distributed systems work (conflict resolution, device discovery, transport) is handled by Syncthing.

### 4.1 How Syncthing Covers Both Sync Scenarios

**Proximity sync (same network)**
When two devices running Syncthing are on the same WiFi, they discover each other via mDNS and sync directly — no server involved. This is Syncthing's default behaviour.

**Server-assisted sync (Ubuntu laptop)**
The Ubuntu laptop runs a Syncthing instance and acts as a relay peer. When devices are on different networks, or one device comes back online after being offline, it syncs through the laptop. When the laptop is off, devices fall back to proximity sync automatically.

**Conflict resolution:** last-write-wins, based on file modification timestamps.

### 4.2 In-App Setup Experience

Folio's sync setup screen is where the designer advantage applies. Syncthing's own interface is technical and intimidating. Folio wraps it in a simple onboarding flow:

1. Folio detects whether Syncthing is installed and prompts to install if not
2. User sees their Device ID as a shareable code (like an AirDrop name)
3. User adds other devices by entering their Device ID
4. The vault folder is automatically shared with added devices
5. Sync status shown as a simple indicator — synced, syncing, or offline

No mention of relay servers, ports, or protocols visible to the user. The Ubuntu laptop is just "another device" in the list.

---

## 5. Design System & Principles

### 5.1 Core Design Principles

**Chrome disappears when you write**
Every UI element should justify its presence during a writing session. If it doesn't need to be visible, it shouldn't be. Sidebars collapse, toolbars hide, status bars dim. The text is always the focus.

**Animations serve a purpose**
Every transition communicates something: a sidebar sliding in signals context change; focus mode fading signals mode change. No animation is decorative. All animations complete in under 200ms to feel instant rather than theatrical.

**Both themes are first-class**
Dark mode and light mode are both fully designed — neither is an inversion of the other. Light mode uses warm off-whites and deep navy text. Dark mode uses deep blue-greys with warm cream text. Neither feels like an afterthought.

**Defaults over settings**
Every configuration option is a design failure. Folio should ship defaults so considered that most users never open a settings panel. Where settings are necessary, they are minimal and clearly named.

### 5.2 Typography Scale

| Role | Font | Size / Weight | Usage |
|---|---|---|---|
| Body text | Humanist serif | 17px / Regular | Note content, the primary reading typeface |
| Headings | Geometric sans | 24–40px / Bold | H1–H3 inside notes |
| UI labels | Geometric sans | 13px / Medium | Sidebar, toolbar, status bar |
| Code | Monospace | 15px / Regular | Inline code and code blocks |
| Graph labels | Geometric sans | 11px / Regular | Node labels in graph view |

---

## 6. Build Roadmap

The build sequence is designed to keep a working, demonstrable product at every stage. Each phase ships something real before the next begins.

| Phase | Timeline | Deliverables | Goal |
|---|---|---|---|
| Phase 1 | Weeks 1–2 | React + Tauri scaffold; TipTap editor with live markdown preview; open a single `.md` file; good typography | Prove the core thesis — the editor feels great |
| Phase 2 | Weeks 3–4 | File System Access API (browser) + Tauri file access (desktop); open a vault folder; file tree sidebar | Navigate a real vault |
| Phase 3 | Week 5 | Wikilink parsing and rendering; backlinks panel; autocomplete on `[[` | Notes start connecting |
| Phase 4 | Week 6 | Graph view with React Force Graph; nodes, edges, click-to-navigate, pinch-to-zoom | The vault becomes a map |
| Phase 5 | Week 7 | Focus mode; typewriter mode; quick switcher (`Cmd+K`); word count / reading time | The writing experience is complete |
| Phase 6 | Week 8 | Dark / light mode toggle; polish animations; drag-to-reorder sidebar | Ship-ready v1 |
| Phase 7 | Post-v1 | Syncthing integration and setup screen; styled PDF export | Sync and sharing |

---

## 7. Out of Scope — v1

The following features are explicitly deferred to maintain v1 focus. Each is worth building eventually but not before the core experience is excellent.

- Plugin or extension system
- Mobile native app (mobile web will work but is not optimised)
- Real-time collaborative editing
- Database or cloud backend of any kind
- Canvas or whiteboard mode
- Daily notes or task management
- Custom theme editor
- Community marketplace of any kind

---

## 8. Success Criteria

Folio v1 is a success when all of the following are true:

- Opening the app to a writing-ready state takes under 1 second on a modern laptop
- A designer who has never touched the settings panel finds the defaults genuinely beautiful
- Focus mode transition feels smooth and intentional — not like a CSS hack
- A vault of 200+ notes renders the graph view without visible lag
- Any `.md` file written in Folio opens correctly in Obsidian, iA Writer, or any other markdown app
- The sync setup screen can be completed in under 3 minutes with no technical knowledge

---

*Folio PRD v1.0 · February 2026*
