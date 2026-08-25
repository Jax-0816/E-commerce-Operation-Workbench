# Design QA — Operations Command Ledger

## Target and implementation

- Approved direction: `.impeccable/mocks/decision/option-1-operations-command-ledger.png`
- Reference size: 1487 × 1058 px
- Desktop implementation: `.impeccable/review/desktop.png`
- Desktop viewport: 1440 × 1024 px, dashboard route `/`, populated with the local `虾滑` product returned by the real API
- Mobile implementation: `.impeccable/review/mobile.png`
- Mobile viewport: exact 390 × 844 CSS px through installed Google Chrome, dashboard route `/`, same real API state
- Normalized side-by-side comparison: `.impeccable/review/comparison-desktop.png` (reference left, implementation right)

## Comparison passes

### Full-frame desktop

- Layout: passed. The implementation preserves the target's fixed deep-ink navigation rail, horizontal operating context, readiness progression, ledger-led primary workspace, and right attention column. The implementation intentionally omits the mock's invented regulatory feed and granular completion percentages because those values are not available from the current product API.
- Typography: passed. Self-hosted Noto Sans SC provides the compact operations-console rhythm; headings, metadata, row labels, and status copy remain distinct without oversized display text.
- Color and surfaces: passed. Warm paper surfaces, cinnabar primary actions, green current states, dark amber status copy, thin dividers, and restrained radii match the approved direction. There are no gradients or decorative shadows.
- Icons: passed. All navigation and status icons come from the Phosphor family and use a consistent stroke weight. No handwritten SVG, emoji, or CSS illustration is used.
- Content: passed. Visible product count and product rows are derived from the existing API. Because the dashboard does not query facts, SKUs, or profiles, it presents those areas as neutral workspace links and says their state was not read. Phase-locked capabilities are named honestly instead of represented by fake metrics.

### Focused components and behavior

- Navigation and CTA: passed. Global navigation, `新建商品`, the product ledger row, and the next-step action are semantic links or buttons with keyboard focus styles.
- Readiness rail: passed. It remains scannable at desktop size and collapses into two columns, then one column, without overlap.
- Task ledger: passed. Headers and rows stay aligned on desktop; on narrow screens the existing horizontal table behavior preserves content rather than clipping it.
- Attention column: passed. Neutral workspace shortcuts and platform scope are separated by dividers, and the column stacks below the ledger on narrow screens.
- States: passed. Loading skeleton, API error alert, instructive empty state, disabled plan action, pending/current/locked states, and reduced-motion behavior are present.

### Responsive and accessibility

- 1440 × 1024: passed with no overlap, clipping, or broken hierarchy.
- 390 × 844: passed. The sidebar becomes a compact icon navigation strip, context values stack, the CTA becomes full width, and readiness steps become a single-column sequence.
- Semantic landmarks and labels: passed (`主导航`, `商品工作流入口`, `商品任务账本`, `快捷入口`, alert/status roles).
- Focus and motion: passed. Focus-visible outlines use the primary token and animation is disabled under `prefers-reduced-motion`.

## Automated review

- `impeccable detect` scanned the changed router, dashboard, and stylesheet once after implementation.
- Findings: 0.
- The production build retains the Impeccable seed `f7706ca2` in `dist/index.html`.

## Iteration history

1. First browser capture exposed a blank desktop frame because the screenshot was taken before Vite completed rendering.
2. The desktop pass was repeated with a five-second virtual-time budget, producing the populated implementation capture used in the normalized comparison.
3. A plain headless Chrome capture exposed macOS Chrome's minimum-window crop rather than a CSS defect. The final mobile image was recaptured through the installed Google Chrome executable with an exact Playwright viewport and confirms correct wrapping, compact navigation, and stacked readiness behavior at 390 CSS px.
4. Independent finish review rejected inferred “pending” SKU/profile claims and two low-contrast tokens. The final implementation now labels those controls as neutral workspace entries, explicitly says their state was not read, and uses darker secondary/warning tokens.
5. The final independent re-review returned `SHIP` with no blocking findings.

## Final result

Passed for the approved Operations Command Ledger direction. The visual hierarchy is faithful while dashboard claims remain constrained to data the current product vertical slices can actually prove.
