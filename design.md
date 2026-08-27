# TraceMind Visual DNA

> Status: LOCKED
>
> Scope: portable visual language only

本文件只定义 TraceMind 的视觉基因：排版、纸张感、Evidence 身份、间距、层级、Inspector 表现和颜色原则。它不定义当前路由、API、产品能力或实现状态；这些事实分别以代码、`docs/product/TraceMind-Product.md` 和 `docs/design/TraceMind-UI-Design.md` 为准。

## 1. 视觉定位

TraceMind 是一套温暖、纸张感、Evidence-led 的技术知识工作台。界面应像具有软件精度的编辑型研究工具：适合长时间阅读，支持高密度调查，并让每个回答都可以回到证据。

核心气质：

- 内容优先于装饰；
- Evidence 优先于抽象状态；
- Typography、规则线、对齐和留白优先于卡片与阴影；
- 本地、安静、可信，不使用云营销或人工“未来感”；
- Element Plus 是行为依赖，不是产品视觉身份。

## 2. 信息层级

- **L1 Primary Content**：答案、文档正文、Knowledge solution、检索结果、Evidence、图谱画布。
- **L2 Context Metadata**：路径、版本、章节、状态、更新时间、Tags、Scope。
- **L3 Execution / Debug**：latency、candidate count、ranking detail、trace metadata、generation 状态。

L1 应长期可见；L2 提供核验上下文；L3 默认折叠或渐进展示，不得压过内容。Execution Trace 是可观测信息，不是模型思维链。

## 3. 页面构图

应用工作台使用稳定的非对称结构：

```text
┌──────────────────────── Global Shell ────────────────────────┐
├──── Context Rail ────┬──── Main Workspace ────┬─ Inspector ─┤
│ navigation / filters │ primary task / content │ evidence     │
└──────────────────────┴─────────────────────────┴──────────────┘
```

- Top Shell 建立产品身份和当前上下文，不成为通用 SaaS 导航栏。
- Left Rail 提供局部导航、会话或过滤，不重复全局导航。
- Main Workspace 每页只有一个主任务。
- Inspector 解释当前选择、Evidence、lineage 或系统状态；桌面为侧栏，中等宽度为 overlay，移动端为全宽 panel。
- 垂直区域主要使用 1px 暖色规则线分隔，不使用漂浮卡片堆叠。

建议尺寸是视觉参考而非功能契约：

```text
app-shell-height       56–68px
left-rail-width        240–288px
inspector-width        360–400px
main-workspace-min     640px
workspace-gutter       24–32px
compact-control-height 30–32px
default-control-height 36px
```

## 4. Typography

字体按角色使用：

- **Brand / editorial serif**：品牌字标、Landing hero 和少量编辑型标题。
- **Application sans**：导航、控件、正文、列表和 Inspector。
- **Technical mono**：路径、ID、代码、Score、行号、Hash 和技术元数据。

推荐本地字体栈：

```css
--font-serif: "Noto Serif SC", "Source Serif 4", Georgia, serif;
--font-sans: system-ui, "PingFang SC", "Microsoft YaHei UI", "Segoe UI", sans-serif;
--font-mono: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
```

不依赖外部字体 CDN。Serif 不是所有标题的默认字体；Mono 只用于真正的技术内容。阅读正文使用比 UI metadata 更宽松的行高。

## 5. 颜色角色

颜色温暖且克制；具体生产值以当前 CSS tokens 和浏览器校准为准。

```css
--tm-paper:          oklch(97.5% 0.010 80);
--tm-surface:        oklch(99%   0.006 80);
--tm-surface-muted:  oklch(95%   0.012 75);
--tm-ink:            oklch(22%   0.015 75);
--tm-ink-secondary:  oklch(47%   0.015 75);
--tm-ink-tertiary:   oklch(62%   0.012 75);
--tm-rule:           oklch(89%   0.012 75);
--tm-primary:        oklch(35%   0.055 190);
--tm-primary-soft:   oklch(94%   0.020 175);
--tm-evidence:       oklch(54%   0.170 32);
--tm-evidence-soft:  oklch(95%   0.028 55);
--tm-success:        oklch(62%   0.120 145);
--tm-warning:        oklch(70%   0.130 78);
--tm-error:          oklch(50%   0.160 28);
```

- Deep green：主操作、focus、导航 active 和可信本地状态。
- Vermilion：Citation、Evidence identity 和直接相关的强调，不用于所有按钮。
- Warm neutrals：承担主要层级。
- Success / Warning / Error：只表达真实语义。
- 所有状态都必须结合文字、图标或形状，不能只依赖颜色。

## 6. Evidence Identity

`[S1]`、`[S2]` 是 TraceMind 的签名视觉元素。

- Source ID 在回答、Evidence 列表、检索结果和 Knowledge lineage 中保持一致。
- 默认使用小型、近方形、Vermilion outline，而不是大号 filled pill。
- 交互 Citation 必须可键盘聚焦，并提供比紧凑编号更完整的 accessible label。
- Evidence identity 可组合来源类型、文档/知识名称、页码、章节、Chunk、代码行号、路径和 excerpt。
- 颜色标记身份和关系，不把整段正文染成 Evidence 色。
- Document 与 Knowledge source 通过标签和内容结构区分，不只通过颜色区分。

## 7. Inspector

Inspector 是第一等产品区域，不是 Debug Drawer。推荐顺序：

1. Context label 与标题；
2. 稳定身份和状态；
3. Primary excerpt / summary；
4. Evidence、scores 或属性；
5. Relationships / lineage；
6. 折叠的 L3 details；
7. Contextual actions。

Inspector 使用间距和 hairline 分节，避免 card-inside-card。关闭按钮使用有标签的原生 button，支持 Escape。中等宽度 overlay 不应挤压主工作区；移动端 panel 内部独立滚动。

## 8. Surfaces、边框与阴影

- 默认 divider：1px warm rule。
- Evidence selection 可使用浅暖底色和 Vermilion edge rule。
- 控件 radius 约 4–6px，bounded panel 约 6–8px。
- `999px` 只用于真实 tag、compact status 或 pill metadata。
- 基础页面无阴影；菜单和 transient overlay 只使用很轻的 elevation。
- 禁止大圆角、渐变、glass、glow 和 card-heavy SaaS surface。

## 9. Spacing

使用 4px 基础节奏：

```text
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40
```

间距表达 grouping，而不是让每一层拥有相同 padding。密集列表保持 12–16px 垂直节奏；长文本使用更宽松行高。跨 Rail、Header、Row、Citation 和 Inspector value 的对齐比装饰性留白更重要。

## 10. 控件与重复模式

- **Primary button**：Deep green fill；一个页面或任务区只有一个视觉主操作。
- **Secondary button**：paper/surface + warm border。
- **Tertiary action**：text/icon + quiet hover tint。
- **Evidence action**：仅来源相关操作可以使用 Vermilion 文本或边框。
- **Rows**：Document、Knowledge、Conversation 和 Source 默认是 editorial rows，不是 card grid。
- **Tables**：仅在 rank、score、diagnostic 或明确列比较有价值时使用。
- **Tabs**：用于同一对象的不同视图，不替代导航。
- **Status**：dot/icon + short label；hover/selection 不造成 layout shift。

## 11. 明确反模式

- 卡片包裹一切；
- 通用后台 CRUD table 表达知识对象；
- 对称 ChatGPT 式消息气泡；
- 重复展示完整 Evidence；
- L3 Debug 默认占据主视觉；
- 装饰性大标题、eyebrow、过量 uppercase；
- 未经批准引入 Tailwind、shadcn、第二套组件框架或外部字体 CDN；
- 因参考视觉中出现某个概念，就推断或实现相应产品功能。

## 12. 使用规则

任何前端表现层修改都必须先阅读 `docs/design/TraceMind-UI-Design.md`，确认真实路由、数据和交互边界，再使用本文件的视觉语言。若当前代码与本文件中的视觉建议冲突，应先判断是否是有意实现差异；不得为了“对齐设计”擅自扩展功能或修改数据契约。
