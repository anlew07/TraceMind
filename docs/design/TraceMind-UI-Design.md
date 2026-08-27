# TraceMind UI Design Specification

> Single source of truth for current routes, UI behavior and responsive contracts.
> Portable Visual DNA lives in `design.md`. Read both before modifying frontend presentation.

## Product Identity

TraceMind is a **local-first, traceable personal knowledge workspace for developers.**

It is **not**:
- an admin dashboard
- a CRUD management system
- a generic SaaS dashboard
- a promotional SaaS marketing surface; the dedicated editorial Landing is a restrained first-entry exception
- a ChatGPT clone
- an IDE clone
- a Coding Agent

## Design Direction

**TraceMind — Minimal Technical Workspace**

Core qualities: Minimal · Precise · Technical · Calm · Traceable

Core principle: Minimal clarity + Developer precision + Inspectable evidence

---

## Current Routes and Entry Flow

The current router contract is:

| Route | Current screen |
| --- | --- |
| `/` | Local first-entry decision: `/landing` before completion, otherwise `/knowledge-bases` |
| `/landing` | Editorial Landing with one workspace-entry action |
| `/knowledge-bases` | Knowledge Base Workspace / Research Desk |
| `/knowledge-bases/:knowledgeBaseId/chat` | Conversation |
| `/knowledge-bases/:knowledgeBaseId/documents` | Documents |
| `/knowledge-bases/:knowledgeBaseId/retrieval` | Retrieval Workspace |
| `/knowledge-bases/:knowledgeBaseId/knowledge` | Knowledge ledger |
| `/knowledge-bases/:knowledgeBaseId/knowledge/:entryId` | Knowledge Detail |
| `/knowledge-bases/:knowledgeBaseId/map` | Knowledge Map |
| `/knowledge-bases/:knowledgeBaseId/data-management` | Data & Recovery |

The root decision reads only a local landing preference and never intercepts deep links. First-time
Quick Start documentation must point to `/`, not directly to `/knowledge-bases`.

---

## Information Hierarchy

### L1 — Primary Content (dominates visually)
- User question
- AI answer
- Documents
- Knowledge Bases
- Search results
- **Sources / Citations / Evidence** (first-class product capability)

### L2 — Context Metadata (supports L1)
- File path
- Section / Page / Chunk
- Version
- Line range
- Status tags

### L3 — Execution / Debug (discoverable but secondary)
- Query rewrite mode
- Retrieval mode (hybrid, reranker)
- Reranker fallback
- Latency
- Path scope
- Trace metadata

**Rules:**
- L1 dominates. L2 supports L1. L3 remains discoverable but visually secondary.
- Sources / Evidence are **always L1**. Never demote them to metadata.
- L3 must use progressive disclosure (collapsed by default).

---

## Global Shell

One compact semantic layer. No global sidebar.

### Compact App Bar (approximately 56–60px)
```
TraceMind | 当前知识库 | 问答  文档  知识  图谱 | Local-first | Workspace
```
- Brand, current KB context, KB navigation and local-first status share one bar.
- KB name comes from page data (existing `knowledgeBaseName` ref).
- 问答 / 文档 / 知识 / 图谱 are compact text tabs. Active state = bottom border accent.
- Retrieval strategy is not global navigation; expose it only in Execution Trace, Inspector,
  Settings or Retrieval Workspace.
- No global KB selector dropdown at current stage.
- `1px solid` bottom border. No shadow, gradient or second navigation row.
- At 680px and below, the same 58px bar becomes one mobile layer: `TraceMind | current
  page · current KB | Menu`. The KB name truncates with ellipsis; the four KB destinations and
  “Return to Workspace” move into one light-dismiss dropdown. Local-first remains visible as a
  compact status dot and is named in the menu.
- At 768px, retain the complete desktop navigation rather than creating a mixed tablet state.
- Workspace Home and Landing do not expose empty KB navigation; they keep only their current page
  identity and the compact Local-first status on narrow screens.

**Implementation:** `AppShell.vue` with `provide/inject` for KB name.

---

## Home

`/knowledge-bases` is the daily **Research Desk**. The root route is a local entry decision only:
first access redirects to the product Landing, while a locally recorded completed entry redirects
straight to `/knowledge-bases`. This preference never intercepts deep links.

Structure:
- Workspace heading with one "Create Knowledge Base" primary action
- Knowledge Spaces grid using only `name`, optional `description`, and `updated_at`
- Whole-space navigation to `/knowledge-bases/{id}/chat`
- Existing edit/delete actions in a visible overflow menu
- Empty state with one create action
- Create success routes directly to the new Conversation workspace

**Anti-patterns to avoid:**
- Dashboard metrics or invented document/conversation/activity counts
- Large shadows
- Gradients
- Backend status as dominant content
- Feature lists

**File:** `src/views/HomeView.vue`

The product introduction remains available explicitly at `/landing`. It is a short editorial
portal whose single action records the local first-entry preference and navigates directly to
`/knowledge-bases`. Storage failure must not block entry. After the first entry, `/` resolves to the
daily Workspace, while `/landing` remains manually accessible for product demos and review.

---

## Knowledge Bases

Knowledge Bases are workspaces, not database rows.

### Visual Pattern: Editorial Workspace Tile
- Each KB is a flat, thin-bordered workspace tile; it is not an elevated dashboard card
- Name + description + updated date
- Whole-tile navigation to Conversation
- Contextual actions (Edit, Delete) in `···` overflow dropdown
- "Create Knowledge Base" as the single primary page action
- Three columns on wide desktop, two around 900–1280px, one on narrow/mobile screens

An empty Knowledge Base presents focused Conversation onboarding. Import opens the existing
Documents upload flow; Direct-mode chat remains available without inventing retrieval evidence.

**Anti-patterns to avoid:**
- CRUD tables with action columns
- Equal-weight inline buttons

**File:** `src/views/KnowledgeBaseView.vue`

---

## Documents

Documents are knowledge sources for search, answers, and citations.

### Page Structure
```
Page Header: "资料" + description + [导入资料]
Search: [按名称或路径筛选…]
Document List: editorial resource rows
Document Inspector: opens only after row selection
Retrieval Tools: collapsible at bottom
```

### Visual Pattern: Editorial Resource Row
Each document row shows:
- **Filename** (without extension) + **extension** in mono
- **Relative path** in mono, secondary color
- **Metadata row**: version · size · chunks · updated date
- **Product status**: one truthful status derived from current parse/index state: 可用、等待解析、
  处理中或失败。Do not invent ingestion substages or archived state.
- **Overflow** `···`: Chunks, Re-parse, Re-index, Download, Versions, Delete
- Selecting the row opens the contextual Inspector; the overflow remains reserved for real actions

### Document Inspector
- Closed by default and driven by the selected resource row
- Uses only current API fields: identity/path, source, MIME/extension, size, version, chunks,
  parse/index state and timestamps
- Parser, embedding, content hash and index generation are technical detail and collapsed by default
- Contextual actions reuse the existing Chunk preview, version history, download and failed-stage retry
- No full document reader is implied until a stable parsed-document/page API exists
- Wide desktop uses a side pane; medium widths use an overlay; narrow screens use a full-width sheet

### Import
- Compact "导入资料" button in page header
- Opens existing `DocumentUploadPanel` inline (collapsible and closed by default)
- `?import=1` opens the same panel for the empty-KB onboarding path
- Preserves the existing file picker, upload progress and cancellation behavior

### Retrieval Tools
- Compact "Advanced · Retrieval Workspace" region at page bottom
- Opens the dedicated `/knowledge-bases/{id}/retrieval` workspace
- Does not retain a second embedded search implementation

**Anti-patterns to avoid:**
- CRUD tables
- Permanent upload panel
- Action button rows
- Invented Owner, tags, archive, saved searches or storage metrics
- A fabricated Reader assembled from chunk previews

**File:** `src/views/DocumentView.vue`

---

## Ask / Conversation

Core product page. Three-area workbench at desktop (1440px), with Evidence available on demand.

### Layout (approximate proportions)
```
Conversations (200px) | Answer (flex) | Evidence (360px)
```

### Conversation History (left)
- "Conversations" header
- Compact list: title + relative date
- Selected state: accent background + left border
- "+ New" button at bottom
- Rename/Delete in `···` overflow (not permanent buttons)

### Answer (center)
- Use an **asymmetric conversation surface system**, not mirrored messenger bubbles.
- User messages: compact right-aligned bubble, maximum width around 65–70%, muted sage/warm-green
  surface, dark ink, restrained 10–14px radius, subtle border, and no visible shadow
- Assistant messages: broad left-aligned warm-paper answer surface, maximum width around 88–94%,
  subtle warm border, restrained radius, and reading-first Markdown width
- Evidence, Execution Trace, Trace Detail and Promote to Knowledge remain inside the corresponding
  Assistant answer surface as secondary sections separated by hairlines
- Inline citation pills: `[S1]` — brick/vermilion Evidence accent, monospace, clickable
- **Provenance row** below each answer: "Cited from N sources"
- **No duplicate full sources below the answer.** Evidence lives in the Inspector.
- Execution Trace stays fully expanded while streaming, then folds to a compact summary at terminal
  state. Historical traces are folded by default and use the same trace ViewModel.
- Execution details: collapsed `▸` summary (L3)

### Evidence Inspector (right)
- **Closed by default**, including initial entry, historical session switches and completed RAG answers
- No source is selected automatically; clicking a citation `[S1]` selects that exact source and opens
  the inspector
- Desktop: right-side pane. Medium widths: right overlay/drawer without reflowing the composer or
  MessageViewport. Mobile: full-width sheet/panel with an explicit close control.
- Collapsible via `×` button; when closed, Answer immediately regains the available width
- Two sections: **Sources** (L1) + **Execution** (L3)

### Source/Evidence Types

**Document Evidence:**
```
# DOCUMENT
[S1]  filename.md
§ Section · Chunk N
excerpt…
```

**Code Evidence:**
```
<> CODE
[S3]  ClassName.java
src/path/to/ClassName.java
public ReturnType methodName(Params)
L42–58
code excerpt…
```

**Verified Knowledge Evidence:**
```
KNOWLEDGE
[S2]  Maintained question
Verified knowledge · Solution
excerpt…
```

- Source type distinguished by `# DOCUMENT` / `<> CODE` labels + composition
- Verified Knowledge uses the same evidence item pattern, says `知识 / 已验证知识`, and links to
  the maintained Knowledge detail. It never uses a file path or pretends to be a Document.
- Not color alone
- Code evidence: relative path + line range + code block with left accent border

**Anti-patterns to avoid:**
- Symmetric messenger bubbles or identical User/Assistant surfaces
- Duplicated evidence (inline + inspector)
- Hiding sources behind `<details>`
- "GROUNDED" claims

**File:** `src/views/ConversationView.vue`

---

## Retrieval Workspace

Retrieval Workspace is a developer-facing retrieval laboratory, not a second Conversation and not
a benchmark dashboard. It stops at Retrieval / Rerank / Evidence candidates and never creates an
Answer, Conversation or Knowledge entry.

### Real capability boundary

- `Semantic`: dense retrieval against the current Qdrant cosine vector configuration
- `Hybrid`: Qdrant Dense + BM25 branches combined by deterministic application-side RRF; the returned score is an RRF ranking score
- `Reranked`: Hybrid candidates followed by the local Cross-Encoder; `rerank_score` is a raw logit,
  not a probability
- One user-selected mode runs per request; the initial mode is Hybrid
- Scope is either the entire current Knowledge Base or one real `document_id`
- Explicit file paths may produce `path_scope_mode=exact`, `scoped_relative_path` and a path-stripped
  `semantic_query`
- `semantic_query` is not LLM Query Rewrite and only appears when exact path scope actually occurs
- Limit stays compact at 5 or 10 so the default configured rerank candidate limit is respected
- Language remains an optional Advanced hint, not a prominent invented language system

### Page structure

```text
Workspace header + KB context
Query composer: 查询 · 模式 · 范围 · 数量 · 运行检索
Optional real path-scope notice
Retrieval Result Ledger               Result Inspector (closed by default)
```

Each result leads with final rank, document identity and readable chunk excerpt. Location and path
are L2. Ranking mode and raw scores are L3 but remain visible enough for comparison. Reranked rows
use API-provided `retrieval_rank` to state `Retrieved #N → Reranked #M`; the frontend never
reconstructs the original rank.

The Result Inspector follows the shared selection pattern and exposes only returned identity,
location, full chunk content and ranking fields. It never exposes vectors, Qdrant point IDs,
content hashes, index generations, prompts, Graph state or raw exceptions. Desktop uses a side pane;
tablet uses an overlay; mobile uses a full-width sheet.

The workspace is entered from Documents Advanced and is deliberately absent from the four-item
Global Header navigation. It does not execute LangGraph, Generation, three-way Compare, evaluation
metrics or Query Rewrite.

**Files:** `src/views/RetrievalView.vue`, `src/components/SemanticSearchPanel.vue`

---

## Citation System

- One consistent citation identity: `[S1]`, `[S2]`, `[S3]`
- Brick/vermilion Evidence-accent pill with monospace font
- Same color for all citations (document and code)
- Source TYPE distinguished in Evidence Inspector via labels, not citation color
- Clicking a citation opens/focuses the Evidence Inspector

---

## Data Management & Recovery

Data Management is a secondary local-first maintenance workspace. It protects Source of Truth and
repairs or rebuilds derived state; it is not a dashboard, Settings page, storage analytics view or
DevOps console.

### Real data boundary

- Archive Source of Truth contains Knowledge Base metadata, Documents, all Document Versions and
  stored source files, Conversations, Messages and Knowledge Entries with their provenance
  snapshots.
- Restore is Workspace-level (`/knowledge-base-archives/restore`) and creates the archived Knowledge
  Base identity. It does not belong to the currently open KB even when launched from that KB's
  maintenance page.
- Restored Document parse/index state and verified Knowledge retrieval index state begin pending;
  `rebuild_status=not_started` is explicit. The UI must distinguish “Source data restored” from
  “Ready for Retrieval”.
- Derived state consists of parsed chunks, the latest Document retrieval indexes and verified
  Knowledge retrieval indexes. Rebuild regenerates these from existing Source of Truth.

### Page structure

```text
数据与恢复 header + current KB context             恢复详情
备份与恢复
一致性检查 → selected findings → backend dry-run → 安全修复
重建 Derived State
Source of Truth vs Derived State (collapsed)
```

- Entry lives in each Knowledge Space overflow menu; the four-item Global Shell navigation remains
  unchanged.
- Export and Audit are direct actions. Restore, Repair and Rebuild require one explicit confirmation.
- Audit is visibly read-only and reports the API's `completed/partial`, severity counts, findings,
  safe message and entity identity. It never invents a health score.
- Audit findings do not expose repairability. The user may select findings for review, but only the
  backend `dry_run` response may mark an item `repairable` and `planned`; execution sends only those
  server-approved finding IDs.
- Repair and Rebuild poll the existing status endpoints at a restrained interval only while queued
  or running. Retry appears conservatively for failed or partially failed operations.
- Rebuild progress uses only real count fields: Document Versions parsed, Documents indexed and
  verified Knowledge Entries indexed. There are no fabricated stages or percentages.
- Restore maps conflict, archive limit and invalid archive to distinct user guidance and never
  exposes raw exceptions. A successful response offers explicit rebuild and navigation actions
  without automatically redirecting.
- Desktop uses an editorial maintenance plane with a narrow Recovery Inspector; below the workbench
  threshold the Inspector becomes a normal single-column section. Findings and operation rows wrap
  at 320px and never become a wide table.

**Files:** `src/views/DataManagementView.vue`, `src/services/dataMaintenance.ts`

The data boundary is fixed: PostgreSQL records and stored source files are Source of Truth;
parsed chunks and retrieval indexes are Derived State. The UI may operate only the existing archive,
restore, audit, repair, and rebuild contracts. It must not invent resource monitoring, cloud backup,
automatic recovery, health scores, or frontend repair policy.

## Problem & Solution Knowledge

Knowledge entries are durable engineering records saved from completed answers.

- The Knowledge list uses editorial resource rows, not a CRUD table or card grid.
- Search, validation status and tag filters remain compact and secondary to the entries.
- A detail page gives the solution primary reading space and keeps Evidence visible as L1 content.
- Background, root cause and failed attempts appear only when present.
- The original conversation is linked when it still exists; immutable question, answer and source
  snapshots remain visible after it is deleted.
- Evidence shown on a Knowledge detail is explicitly labelled as a saved snapshot. Snapshot IDs do
  not imply that the original Document or Knowledge source is still live; the UI only offers a live
  source action when the API provides a current availability signal.
- Editing changes the maintained knowledge fields, never the provenance snapshots.
- Validation status and retrieval-index status are separate L2 metadata. A verified entry can be
  waiting, processing, searchable or failed; failed indexing exposes one contextual retry action.
- RAG availability is a read-only product interpretation of both states: only verified entries with
  a current successful index are available to retrieval. Unverified and outdated entries are not
  used in RAG, and the UI never introduces a separate “use in RAG” toggle.
- The list is a Knowledge Ledger: question and solution lead, validation and tags follow, while
  update time and derived indexing metadata remain visually quiet. Row-level edit/delete stay in an
  overflow menu; the independent detail route remains the durable reading and maintenance surface.

---

## Visual Language

### Product Language

- TraceMind UI is Chinese-first. Page titles, ordinary actions, status, loading, empty, error,
  confirmation, tooltip, and maintenance copy use natural Chinese.
- Professional terms may remain in English: TraceMind, RAG, Semantic, Hybrid, Reranked, RRF,
  Cross-Encoder, Evidence, Execution Trace, Local-first, Embedding, BM25, LangGraph, LangChain,
  Qdrant, Direct, and API.
- `Source of Truth` and `Derived State` may be bilingual when describing the persistence boundary.
  Peer actions at the same visual level do not mix ordinary English and Chinese.

### Inspector Responsive Contract

- Desktop: contextual side pane, closed until a real selection exists.
- Medium: right overlay with the shared warm backdrop; it does not enter normal page flow.
- Mobile: full-width panel with bounded viewport height and internal scrolling.
- Every dismissible Inspector has a labelled native close button and closes on Escape. The global
  mobile menu remains above the Inspector/backdrop z-index pair.

### Color Roles
| Role | Usage |
|------|-------|
| Background (`--color-bg`) | Page background, warm near-white |
| Surface (`--color-surface`) | Cards, panels, inspector |
| Text (`--color-text`) | Primary content |
| Text secondary (`--color-text-secondary`) | Metadata, labels |
| Text tertiary (`--color-text-tertiary`) | Captions, timestamps |
| Accent (`--color-accent`) | Deep-green navigation active, focus, links, primary buttons |
| Evidence (`--color-evidence`) | Brick/vermilion citations and source identity |
| Border (`--color-border`) | Hairline separators |
| Success/Warning/Error | Semantic states only |

Deep green is used for navigation, focus, primary actions and links. Brick/vermilion is reserved for
citations and Evidence identity. Muted green is used for success states.

### Typography
- **System font stack** (no external CDN): `system-ui, 'PingFang SC', 'Microsoft YaHei UI', 'Segoe UI'`
- **Mono stack**: `'Cascadia Code', 'JetBrains Mono', Consolas, monospace`
- **Scale**: 24px (page titles) > 15px (reading body) > 14px (UI) > 13px (metadata) > 11px (micro)
- No giant titles. No decorative eyebrows. No excessive uppercase.

### Separators
- Hairline `1px solid` borders
- `border-bottom` on resource rows
- No heavy borders, no card wrappers around everything

### Surfaces
- White only when a surface is actually needed
- No card-ification of every section
- No shadows (or minimal `0 1px 3px` for dropdowns)
- No gradients, no glass

### Buttons
- Primary: accent background, white text
- Secondary: border + transparent background
- Text: no border, no background
- Overflow actions: `···` trigger → Element Plus Dropdown

### Metadata
- Mono font, compact, secondary/tertiary color
- Status pills: colored dot + label, small size
- Timestamps: relative where practical

---

## Element Plus Integration

Element Plus is an **implementation dependency**, not TraceMind's visual identity.

**Use Element Plus for:** Dialog, Dropdown, Input behavior, Button behavior, Loading, Message, Confirmation.

**Override:** Primary color → `--color-accent`. Border radius → project tokens. Font family → project tokens.

**Do not:** introduce a second component framework (no Tailwind, no shadcn).

---

## New Feature Rules

For every new frontend feature:
1. Determine L1 / L2 / L3 classification for new information.
2. Inspect analogous existing TraceMind UI first.
3. Reuse an existing design pattern (resource row, provenance row, evidence item, etc.).
4. Preserve global shell/navigation semantics.
5. If introducing a genuinely reusable new UI pattern, update this document.
6. Never create a page-specific visual language silently.

---

## Knowledge Map

- The graph is the dominant L1 workspace. The selected-item Inspector is also L1 but remains closed
  until the user explicitly selects a node or edge; no item is selected automatically.
- The only node types are the current API's Knowledge Base, KnowledgeEntry, Document and derived
  Tag. Their restrained paper/green/vermilion/neutral treatment communicates type without turning
  the canvas into a saturated bubble graph.
- The only edge types are `contains`, `cites`, `tagged` and `related`. Direction follows the API's
  `source → target`; related edges are dashed, and their shared tag/live-document reasons come only
  from API metadata. There is no weight or inferred frontend score.
- Selecting an item strengthens its real neighborhood and dims unrelated elements. Relationship
  labels remain hidden by default and appear only in the selected context to protect canvas density.
- Cytoscape core owns zoom, pan, drag, selection and the existing `cose` layout. TraceMind owns the
  data contract, local node/edge filters, navigation and visual tokens; no wrapper, layout plugin or
  coordinate algorithm is introduced.
- KnowledgeEntry and Document nodes navigate to their existing detail/focused-list routes. The
  Inspector renders only current API metadata; it never exposes graph IDs, payloads, embeddings or
  internal state.
- Wide desktop uses an optional right pane, medium widths use the shared overlay pattern, and mobile
  uses a full-width panel below the Global Shell z-index. Closing it restores the full canvas.
- A graph with only its Knowledge Base root is an empty relationship graph: show real Conversation
  and Documents routes instead of initializing a fake canvas. Documents alone are valid graph
  content and must never be hidden by a KnowledgeEntry-only empty check.
- The map is a deterministic visualization of current knowledge assets, not a retrieval surface,
  editable graph, GraphRAG UI, graph database console or AI relationship generator.

## Review Checklist

Before completing any frontend UI work:
- [ ] L1/L2/L3 classification is correct
- [ ] Evidence/Sources remain L1, not buried or duplicated
- [ ] Execution/debug uses progressive disclosure
- [ ] No CRUD tables for knowledge objects
- [ ] No card-heavy SaaS layouts
- [ ] User/Assistant use distinct asymmetric conversation surfaces
- [ ] No duplicated navigation
- [ ] Shell layers preserved
- [ ] Element Plus visual defaults overridden where needed
- [ ] `vue-tsc --noEmit` passes
- [ ] `eslint` passes
- [ ] `vitest` passes
- [ ] `vite build` passes

## Explicit Deferrals

- **Document Reader:** deferred because the current product has no stable full-document / pagination
  reading API contract. Do not fabricate a Reader from Chunk preview data. This is not a merge blocker.
- **Compass Logo:** the current letter-mark remains a temporary placeholder until an approved brand
  asset exists. Do not generate, redraw, or adopt a third-party compass asset. This is not a merge blocker.
