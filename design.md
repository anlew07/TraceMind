<!-- Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · studied: yes · DNA-source: image (user-approved TraceMind reference set) -->

# TraceMind Design DNA

> Status: **LOCKED**
>
> Scope: project-level portable visual source of truth
>
> Studied: yes
>
> Study date: 2026-08-24
>
> Source mode: image study of user-owned, approved final UI designs

## 1. Source and authority

The visual DNA is extracted from the approved TraceMind reference set in `E:\pycharmprojects\TraceMind-design-reference`:

- Primary structural reference: `01-conversation-evidence.png`
- Cross-page corroboration: `02-retrieval-workspace.png` through `09-document-reader.png`

The nine images are one product system, not nine independent themes. Shared patterns take precedence over page-specific variations.

This document is the visual source of truth for future TraceMind UI work. It governs visual hierarchy, layout, component treatment, evidence identity, and interaction presentation. It does **not** define product capabilities. Current code, API contracts, routes, data models, and approved product scope remain the functional source of truth.

Screenshot-only concepts such as Inbox, Share, Owner, Saved Searches, Investigations, Collections, Favorites, Global Search, or Resource Usage must not be implemented merely because they appear in a reference image.

All numeric tokens below are **estimated from screenshots**, not pixel-exact CSS truth. They must be validated in-browser when implemented. No logo asset or production CSS is defined here.

## 2. Hallmark Study Diagnosis

| Dimension | Diagnosis |
|---|---|
| Source status | User-owned, approved, frozen design references |
| Primary macrostructure | Workbench |
| Page variants | Map / Diagram for Knowledge Map; editorial portal for Landing; reader workbench for Document Reader |
| Visual genre | Editorial + technical, evidence-led knowledge workspace |
| Composition | Persistent top shell; contextual left rail; flexible main workspace; persistent right Inspector |
| Density | Dense but calm; compact controls, generous reading line-height, minimal ornamental whitespace |
| Surface model | Warm paper canvas, thin warm rules, selective bounded surfaces, almost no elevation |
| Identity | Compass navigation motif; serif brand voice; deep green action; vermilion evidence identity |
| Signature device | `[S1]`, `[S2]` source IDs connecting claims, excerpts, rows, graph nodes, and lineage |
| Hierarchy method | Typography, rules, alignment, tints, and whitespace before cards or shadows |
| Interaction tone | Deliberate, inspectable, local-first, trustworthy; never playful or promotional inside the app |

### Locked DNA statement

TraceMind is a warm, paper-like evidence ledger for technical knowledge. It should feel like an editorial research instrument with software precision: quiet enough for sustained reading, dense enough for investigation, and explicit enough that every answer can be traced back to evidence.

## 3. Product meaning expressed visually

The product loop is:

```text
Document → Retrieval → Evidence → Answer → Knowledge → Knowledge Map
```

The interface must make this loop visible through persistent source identity and lineage, not through decorative diagrams. The intended product qualities are expressed as follows:

- **Evidence:** citations and sources are primary navigation and inspection objects.
- **Trace:** provenance remains visible across answer, retrieval, reader, knowledge, and graph views.
- **Knowledge:** answers remain durable editorial surfaces; compact user bubbles are scanning aids,
  not the dominant content model.
- **Trust:** states, scores, paths, and source boundaries are explicit and restrained.
- **Local-first:** status is calm and operational, never cloud-marketing language or artificial futurism.

## 4. Macrostructure

### 4.1 Application workbench

Desktop application pages share this skeleton:

```text
┌──────────────────────────── Global shell ─────────────────────────────┐
├──────── Left context rail ───────┬──── Main workspace ────┬ Inspector ┤
│ navigation / sessions / filters  │ primary task and data  │ evidence  │
│                                  │                         │ context   │
└──────────────────────────────────┴─────────────────────────┴───────────┘
```

- The top shell establishes global identity and system context.
- The left rail supplies local navigation, filters, sessions, or document structure.
- The main workspace owns the page's single primary task.
- The right Inspector explains the current selection, evidence, lineage, or system state.
- Vertical regions are separated primarily by 1px warm rules, not floating cards.

### 4.2 Page variants

- **Conversation / Evidence:** answer ledger in the center, source trace nearby, Evidence Inspector on the right.
- **Retrieval Workspace:** query and real scope context above a dense ranked result ledger; Retrieval Inspector exposes scores and provenance. LLM Query Rewrite appears only if a real standalone API ever provides it.
- **Data Management:** editorial backup/restore, consistency and derived-state maintenance sections
  with an operational Recovery Inspector; it is not a settings or resource dashboard.
- **Documents / Knowledge:** editorial rows in the main plane; selected row drives Inspector content.
- **Workspace Home:** slightly more open rhythm with flat editorial Knowledge Space tiles, one
  create action, and no invented dashboard metrics. Tiles use real name, description, and update
  time, and open the Conversation workspace directly.
- **Knowledge Map:** spatial canvas replaces the central document plane; shell, rail, selection, and Inspector stay consistent.
- **Document Reader (deferred):** the visual direction remains a document tree, readable source body,
  highlighted evidence chunk, and Source Inspector, but the product must not implement it until a
  stable full-document / pagination reading API contract exists. Chunk previews are not a Reader.
- **Landing:** a deliberate exception—a centered editorial portal with enlarged brand lockup, short product sequence, and one workspace-entry action.

## 5. Global shell

The application shell is a persistent, full-width masthead, estimated at **64–68px** high.

- Left anchor: compass mark, TraceMind serif wordmark, and restrained product descriptor.
- Middle controls: workspace and retrieval context where functionally available.
- Right utilities: compact search, system status, destinations, and user identity where supported by current product code.
- The shell uses the warm canvas or a nearly identical surface; it is separated by a thin border rather than a strong shadow.
- Items align to a shared horizontal centerline. Visual weight remains on the brand and current context, not utility icons.
- The shell must not become a generic SaaS navbar or marketing header.

## 6. Navigation and workspace regions

### 6.1 Top navigation

- Compact controls, short labels, restrained chevrons, and visible current context.
- Search follows an inline command-search pattern with a keyboard hint such as `⌘K` only when the functionality exists.
- Active destinations use ink weight, a subtle warm tint, or a thin accent; never a large filled pill.
- Local/index state appears as a small indicator plus text, not color alone.

### 6.2 Left navigation / sidebar

- Estimated desktop width: **256–288px**.
- Section titles may use a small editorial serif role; items and metadata use UI sans.
- Rows are compact and aligned to a stable text/icon grid.
- Selection uses a warm tint, narrow edge cue, stronger ink, or a combination of these.
- Counts and metadata are visually secondary.
- The rail may contain sessions, filters, a document tree, or settings navigation, but its visual grammar is shared.

### 6.3 Main workspace

- The main workspace is flexible and should preserve a practical reading/working minimum of about **640px** on desktop.
- Page headers contain a title, concise context, and at most one visually dominant action.
- Dense data and long-form reading can coexist, but each page should have one primary plane.
- Section separation uses whitespace and rules before bounded containers.
- Conversation uses asymmetric surfaces: a compact right-aligned user bubble and a broad editorial
  answer surface that owns its Evidence and Execution Trace.

### 6.4 Right Inspector

- Estimated desktop width: **360–400px**.
- The Inspector is a first-class product region, not a debug drawer.
- It is selection-aware and context-specific: Evidence, Retrieval, Document, Knowledge, Source, Node, or System.
- Header, tabs, identity block, grouped details, relationships/lineage, and contextual actions follow a stable order.
- Sections are separated by spacing and hairlines. Avoid nested card stacks.
- Long excerpts remain readable and show explicit source identity.
- A bottom action region may remain visually anchored when the page requires it.
- Desktop Inspectors occupy a contextual side pane. At medium widths they become right overlays with
  a shared backdrop; on mobile they are full-width panels. Close buttons are native buttons, Escape
  closes an open Inspector, and the global mobile menu remains above Inspector layers.

## 7. Content density and grid rhythm

- Application density is compact: control and row height should optimize investigation without feeling compressed.
- Reading text receives more line-height than surrounding metadata.
- Alignment across rails, headers, rows, citations, and Inspector values is more important than decorative whitespace.
- The three-column composition is intentionally asymmetric: contextual rail < main work plane > evidence Inspector.
- Estimated desktop proportions are roughly **17% / 58% / 25%**, adjusted by page need.
- Main gutters are estimated at **24–32px**; Inspector and rail internal padding at **16–20px**.
- Repeated rows generally use **12–16px** vertical padding, with metadata grouped tightly below or beside the primary label.

## 8. Typography roles

Typography is role-based. Exact typefaces cannot be proven from screenshots and remain **estimated**.

### 8.1 Font roles

- **Brand / editorial serif:** TraceMind wordmark, landing hero, and selected editorial headings. Candidate stack: `"Source Serif 4", "Noto Serif SC", Georgia, serif`.
- **Application sans:** navigation, controls, body copy, rows, Inspector details. Candidate stack: `Inter, "PingFang SC", "Microsoft YaHei UI", system-ui, sans-serif`.
- **Technical mono:** source paths, IDs, code, scores, line ranges, hashes, and genuinely technical metadata only. Candidate stack: `"JetBrains Mono", "Cascadia Code", Consolas, monospace`.

Serif is not a blanket heading font. Mono is not a decorative product voice. Italic display headings are not part of the system.

### 8.2 Estimated type scale

| Role | Size | Line-height | Notes |
|---|---:|---:|---|
| Landing hero | 56–64px | 1.05–1.12 | Serif; one expressive phrase may use evidence color |
| Landing brand | 52–64px | 1.0 | Paired with enlarged compass |
| App wordmark | 26–30px | 1.0 | Serif |
| Page title | 20–24px | 1.25 | Sans by default; serif only where editorial context is intentional |
| Inspector / rail title | 17–20px | 1.3 | Serif or restrained sans according to reference role |
| Section heading | 15–17px | 1.35 | Medium weight, not oversized |
| Reading body | 14–16px | 1.65–1.8 | Long-form answers and source excerpts |
| UI body | 13–14px | 1.45–1.6 | Controls, rows, labels |
| Metadata | 11–12px | 1.4–1.5 | Muted; mono only when technical |
| Micro label | 10–11px | 1.3 | Uppercase/letter spacing used sparingly |

## 9. Palette

The palette is warm and restrained. Values are **estimated** and should be calibrated against the approved images during implementation.

```css
/* Estimated study tokens; not production CSS */
--tm-paper:          oklch(97.5% 0.010 80);  /* warm ivory canvas */
--tm-surface:        oklch(99%   0.006 80);  /* raised/readable surface */
--tm-surface-muted:  oklch(95%   0.012 75);  /* selected rows, quiet regions */
--tm-ink:            oklch(22%   0.015 75);  /* primary dark ink */
--tm-ink-secondary:  oklch(47%   0.015 75);  /* supporting copy */
--tm-ink-tertiary:   oklch(62%   0.012 75);  /* metadata */
--tm-rule:           oklch(89%   0.012 75);  /* warm hairline */

--tm-primary:        oklch(35%   0.055 190); /* deep green action */
--tm-primary-hover:  oklch(29%   0.050 190);
--tm-primary-soft:   oklch(94%   0.020 175);

--tm-evidence:       oklch(54%   0.170 32);  /* brick / vermilion */
--tm-evidence-soft:  oklch(95%   0.028 55);
--tm-success:        oklch(62%   0.120 145); /* muted green */
--tm-success-soft:   oklch(95%   0.030 145);
--tm-warning:        oklch(70%   0.130 78);
--tm-error:          oklch(50%   0.160 28);

/* Graph relationship/type accents, subordinate to evidence color */
--tm-graph-query:     oklch(62% 0.080 300);
--tm-graph-retrieval: oklch(65% 0.100 245);
--tm-graph-ranking:   oklch(72% 0.130 70);
--tm-graph-knowledge: oklch(64% 0.100 145);
```

Color roles are semantic:

- Deep green is the primary action and trusted local/system accent.
- Vermilion is reserved for evidence, citation, trace emphasis, and closely related warnings—not every interactive control.
- Muted green signals healthy/success states.
- Warm neutrals carry most hierarchy.
- Graph accents distinguish semantic families while remaining desaturated enough not to overpower evidence.
- Status must always combine color with icon, shape, or text.

## 10. Borders, radius, and shadow

### Borders

- Default divider: **1px solid warm rule**.
- Strong dividers are rare and remain low contrast.
- Evidence blocks may use a vermilion edge rule or citation outline.
- Focus indication should use a visible deep-green ring plus border contrast; never rely on shadow alone.

### Radius

All values are estimated:

- Citation/source ID: **2–3px**.
- Small controls: **4px**.
- Inputs and buttons: **5–6px**.
- Bounded panels: **6–8px**.
- Pills: `999px` only for true tags, compact status, or segmented metadata.

Large soft SaaS radii are not part of the system.

### Shadow

- Base surfaces: none.
- Subtle lift: `0 1px 2px rgb(53 42 28 / 5%)`.
- Menus, transient overlays, or the landing entry portal only: up to `0 8px 24px rgb(53 42 28 / 7%)`.
- Prefer border and tonal separation over elevation.

## 11. Spacing and size tokens

Use an estimated 4px base rhythm:

```text
space-1  4px      space-5  20px
space-2  8px      space-6  24px
space-3  12px     space-8  32px
space-4  16px     space-10 40px
```

Estimated layout tokens:

```text
app-shell-height       64–68px
left-rail-width        256–288px
inspector-width        360–400px
main-workspace-min     640px
workspace-gutter       24–32px
rail-padding           16–20px
compact-control-height 30–32px
default-control-height 36px
prominent-control      40–44px
```

Spacing should communicate grouping. Avoid mechanically applying the same padding to every section.

## 12. Controls and repeated patterns

### Inputs and search

- Warm or near-white fill, thin warm border, compact height, strong text contrast.
- Search is visually identifiable but not oversized inside the application shell.
- Keyboard hints are small bounded suffixes, not promotional badges.
- Focus uses a clear deep-green border/ring.
- Validation uses message + icon + color.

### Buttons

- **Primary:** deep green fill, light text, restrained radius, compact label.
- **Secondary:** paper/surface fill, warm border, dark ink.
- **Tertiary:** text or icon button with quiet hover tint.
- **Evidence action:** may use vermilion text/border when the action specifically concerns sources or traceability.
- One dominant action per page or bounded task region.
- Avoid excessive pills, gradients, glow, and heavy shadows.

### Tabs

- Tabs are a compact text row with a thin underline, edge, or restrained selected tint.
- Active state is conveyed by both color and weight/indicator.
- Tabs divide views of the same object; they do not replace primary navigation.
- Inspector tabs retain the Inspector's narrow rhythm and do not become large segmented buttons.

### Rows and tables

- Documents, knowledge items, sessions, and sources are editorial rows—not cards by default.
- Rows use rules, consistent columns, type hierarchy, and a quiet selected tint.
- Tables are appropriate for ranking, score, diagnostic, or operational comparison where columns matter.
- Table headers are small and muted; numeric/technical values may use mono and right alignment.
- Hover and selection must not shift layout.

### Status indicators

- Compact dot/icon + short label.
- Healthy/local/indexed states use muted green.
- Warnings use amber or evidence-adjacent tones with explicit wording.
- Errors use vermilion/error color with recovery context.
- Never use color as the only status channel.

## 13. Citation and evidence visual language

### Citation

`[S1]`, `[S2]`, and related source IDs are TraceMind's signature visual device.

- Format remains bracketed and stable across answer text, source lists, retrieval rows, document chunks, knowledge entries, and graph lineage.
- Default treatment is a small, square or near-square outlined vermilion label—not a filled pill.
- Inline citations sit naturally on the text baseline and remain visually distinct without disrupting reading.
- Hover/focus/selection may introduce a pale evidence tint and stronger outline.
- Source IDs must be keyboard-focusable when interactive and have an accessible label beyond the compact code.
- The same ID must preserve identity across all views of the same evidence relationship.

### Evidence source identity

An evidence object is identified by more than a filename. Its visual identity may include, when provided by real data:

- Source ID
- Document or knowledge-entry name
- Page, section, chunk, or code line range
- File/path or source type
- Excerpt
- Retrieval/ranking context
- Relationship to answer or knowledge entry

These fields should form one traceable identity block. Do not reduce evidence to a generic attachment icon or hide it as debug metadata.

### Evidence emphasis

- Selected evidence may use a warm highlighted surface plus a vermilion edge rule.
- Excerpts remain dark-ink readable; evidence color marks identity and relationship, not entire paragraphs.
- Source linkage between main content and Inspector should be obvious through shared ID and selection state.

## 14. Inspector pattern

The Inspector is consistent across pages even when its data changes.

Recommended visual order:

1. Context label and object title
2. Stable identity and status
3. Tabs, if multiple views are necessary
4. Primary summary or excerpt
5. Evidence, scores, metadata, or properties
6. Relationships and lineage
7. Notes or operational details
8. Contextual action area

Inspector principles:

- Display only details relevant to the current selection.
- Keep L1 evidence and identity visible; collapse L3 diagnostics by default.
- Use hairline-separated sections, not cards inside cards.
- Preserve source IDs and lineage language exactly where product data provides them.
- A missing selection should show a calm instructional empty state, not an empty white rectangle.

## 15. Graph visual language

The Knowledge Map is a spatial expression of the same evidence ledger.

- Canvas remains warm ivory, not a dark graph viewport.
- Nodes use compact labels, thin outlines, and lightly tinted fills by semantic type.
- Evidence/trace relationships retain vermilion identity; other type colors remain muted.
- Selected nodes receive a stronger outline, clearer label contrast, and corresponding Inspector update.
- Edges are fine and quiet. Solid/dashed treatment may distinguish relationship semantics when real data supports it.
- Direction, lineage, and evidence provenance matter more than decorative force simulation.
- Zoom/minimap controls are compact, bordered, and visually subordinate.
- Labels must remain legible; avoid particle effects, glow, neon, and cyberpunk styling.
- The graph is not a reason to introduce Agent, GraphRAG, or functions absent from the product.

## 16. Logo system

The compass logo is part of TraceMind's identity. This document specifies use, not asset construction.

### App shell lockup

- Estimated compass height: **30–36px**.
- Estimated wordmark size: **26–30px**.
- Compass and wordmark form a compact horizontal lockup with close but breathable spacing.
- Compass stroke feels fine, cartographic, and warm-dark—not a heavy filled app icon.
- The descriptor is quieter than the wordmark and may sit beside or below it according to available shell width.

### Landing lockup

- Compass expands to approximately **88–104px**.
- Wordmark expands to approximately **52–64px**.
- The enlarged lockup is centered and paired with the editorial hero.
- Scale changes; proportions, stroke character, and brand relationship do not.

Do not redraw or generate the logo from this description. Use the approved asset when it becomes available.
The current letter-mark is an explicit temporary placeholder; the approved Compass asset remains
deferred and its absence is not a merge blocker.

## 17. Empty, loading, and error principles

These states were not fully specified by static screenshots; the following are system-consistent **estimated implications**.

### Empty

- Preserve the page grid and context.
- Use a concise explanation and one relevant next action.
- Keep the surface warm and quiet; no generic illustration is required.
- An empty Inspector should explain what selection will populate it.

### Loading

- Preserve layout to prevent column and row shifts.
- Prefer restrained skeleton lines/rows in warm neutrals for content regions.
- Use a small progress indicator only where duration is indeterminate.
- Do not obscure already available evidence.

### Error

- Keep the error near the failed operation and retain recoverable context.
- Use explicit wording, icon, and restrained vermilion/error treatment.
- Offer one clear retry or recovery action when valid.
- Backend/network unavailability may warrant a persistent shell or workspace notice, but should not erase readable local content.

## 18. Motion and interaction

Motion is not directly observable in the screenshots and therefore remains an **estimated** implementation rule.

- Use minimal opacity/transform transitions for menus, Inspector changes, and selection feedback.
- Typical duration: **120–180ms** for micro-interactions, up to **220ms** for drawers.
- Avoid layout animation, bouncing, decorative motion, and continuous graph effects.
- Respect `prefers-reduced-motion` and keep all evidence navigation usable without animation.

## 19. Responsive implications

The approved images establish a desktop-first workbench. Breakpoint behavior below is **estimated** and must be visually validated.

- **≥1280px:** persistent three-column workbench; full shell; Inspector 360–400px.
- **960–1279px:** preserve main workspace; compact or collapsible left rail; Inspector may narrow toward 320px or open as an overlay.
- **768–959px:** one persistent primary plane; left rail becomes a drawer; Inspector becomes an accessible overlay side sheet.
- **<768px:** single-column reading/task flow; compact brand/current-context shell; navigation drawer; Inspector becomes a full-width panel rather than entering normal page flow.

At every width:

- Evidence IDs and source identity remain visible.
- Inspector information remains reachable; it is never silently discarded.
- Tables may scroll horizontally only when column comparison is essential; ordinary objects should reflow as rows.
- Tabs may scroll, but their active state must remain clear.
- Primary action stays discoverable without duplicating actions throughout the page.
- Validate at minimum 320, 375, 414, 768, 1024, 1280, and 1440px during implementation.

## 20. Cross-page consistency contract

| Element | Locked behavior across pages |
|---|---|
| Global Shell | Same height, brand lockup, warm surface, hairline boundary, compact control grammar |
| Inspector | Fixed semantic role, stable internal order, right-side desktop placement, selection-driven content |
| Sidebar | Compact rail, stable item grid, warm selection tint, subdued counts/metadata |
| Workspace Header | Clear title/context, one dominant action, aligned to main content grid |
| Search | Compact bordered control, quiet hint, clear focus, no oversized AI prompt treatment |
| Tabs | Text-led, thin selected indicator, compact spacing |
| Rows | Editorial hierarchy, hairline separation, no default card wrapping |
| Evidence IDs | Bracketed vermilion identity, consistent across every product surface |
| Status | Dot/icon + text; semantic color; no color-only meaning |
| Buttons | Deep-green primary, bordered secondary, restrained evidence action |
| Form Controls | Warm surface, thin border, compact radius, visible focus and validation |

### Product language

- Product copy is Chinese-first: page titles, descriptions, actions, status, loading, empty, error,
  confirmation, tooltip, and maintenance guidance use natural Chinese.
- Stable professional terms may remain in English where translation would reduce precision:
  TraceMind, RAG, Semantic, Hybrid, Reranked, RRF, Cross-Encoder, Evidence, Execution Trace,
  Local-first, Embedding, BM25, LangGraph, LangChain, Qdrant, Direct, and API.
- `Source of Truth` and `Derived State` may remain bilingual because they identify an explicit data
  boundary. Ordinary actions at the same hierarchy must never mix English and Chinese.

## 21. Implementation guardrails

When implementing from this DNA:

- Read this document before changing presentation-layer code.
- Treat current code/API as the functional source of truth.
- Preserve one primary action and one primary work plane per page.
- Make evidence and lineage first-class, never secondary debug output.
- Reuse the shared shell, rail, Inspector, row, citation, status, and control grammar.
- Validate typography and tokens against the reference images in-browser; estimated values may be tuned without changing their semantic roles.
- Prefer semantic components and accessibility over screenshot-only absolute positioning.

Do not:

- Re-theme TraceMind.
- Introduce dark mode as part of this design system.
- Use AI gradients, glassmorphism, cyberpunk, glow, or neon.
- Imitate Linear, Notion, ChatGPT, or generic SaaS styling.
- Wrap every section in a card.
- Replace warm rules with heavy shadows.
- Use pills for every label or navigation state.
- Use serif for all UI or mono for decorative texture.
- Hide evidence behind a debug affordance.
- Infer product features from screenshot labels.
- Create a separate permanent visual language for graph, reader, retrieval, or landing pages.

## 22. Portable design summary

If only one paragraph survives, use this:

> Build TraceMind as a warm ivory, dark-ink, editorial-technical evidence ledger. Use a compass-led serif brand voice, neutral sans application typography, mono only for true technical metadata, deep green for primary/local-trust actions, and brick vermilion for citations and evidence. Structure desktop application pages as a calm, dense three-column workbench with a persistent global shell, contextual left rail, flexible main workspace, and first-class right Inspector. Prefer thin warm rules, aligned editorial rows, restrained radii, and almost no shadow. Keep `[S1]` source identity consistent across answer, retrieval, document, knowledge, and graph surfaces. Preserve the same system responsively and never invent functionality from the reference images.
