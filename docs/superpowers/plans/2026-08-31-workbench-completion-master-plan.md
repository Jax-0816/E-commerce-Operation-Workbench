# Ecommerce AI Workbench Completion Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Phase 0–2 与精确财务基础之上，完成从商品建档、事实确认、SKU、平台规则、成本定价、促销测算、AI 内容生产到可锁定运营方案的本地闭环工作台。

**Architecture:** 延续本地优先的 pnpm 模块化单体：React 只通过 `/api/v1` 调用 Fastify；应用用例编排以商品为中心的领域对象；计算、规则、提示词、AI、工作流、SQLite 与工作区安全保持独立边界。所有财务结论必须可复算、可追踪，所有 AI 结果必须结构化、可验证、可追溯且不能自证事实。

**Tech Stack:** Node.js 24.19.0、pnpm 11.22.0、TypeScript 6.0.3、React 19.2.8、Vite 8.2.1、Fastify 5.12.1、SQLite、Drizzle ORM 0.45.2、Zod 4.4.3、Vitest 4.1.11、Playwright 1.62.1、SSE。

**Spec:** `docs/superpowers/specs/2026-08-19-ecommerce-ai-workbench-design.md`

## Global Constraints

- 受支持运行时固定为 Node.js `>=24.19.0 <25`，包管理器固定为 `pnpm@11.22.0`。
- 生产服务只能绑定 `127.0.0.1`；不引入云端数据库、队列或常驻外部服务。
- 金额使用整数最小货币单位，费率使用基点或精确有理数；禁止 `eval`、`Function` 和以浮点数决定权威财务结果。
- AI 不负责权威财务计算，不得确认商品事实，不得自动批准无证据卖点。
- 规则、提示词、AI 输出、财务结果和运营方案都必须保存版本、输入哈希和来源。
- 密钥不得进入业务 SQLite、备份、日志、浏览器响应、请求快照或 Git。
- 生成资产采用不可变修订；锁定内容不被重生成覆盖，上游变化只标记下游过期。
- 每个任务严格执行 RED → GREEN → refactor，完成前必须通过聚焦测试和相关质量门禁。
- 禁止用伪数据或无效按钮掩盖未实现能力；未完成能力必须明确显示不可用原因。

## Current Baseline — 2026-08-31

| 原计划任务                            | 状态        | 当前证据                                                                                  |
| ------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| Task 1–3：仓库、应用壳、质量基线      | complete    | 工作区、Vite/Fastify、本地健康检查、CI/ADR 已存在                                         |
| Task 4–6：ID/错误、工作区安全、SQLite | complete    | 领域 ID、错误清洗、锁/密钥端口、迁移与集成测试已存在                                      |
| Task 7–10：商品、事实、SKU、平台档案  | complete    | 完整 API/UI 路由与 Phase 2 浏览器黄金路径已存在                                           |
| Phase 2 usability closeout            | complete    | 总控台、四步建档、事实编辑确认、SKU/平台独立页面已存在                                    |
| Task 11：精确金额、费率、舍入、追踪   | complete    | `packages/calculation-engine` 已实现并有单元/性质测试                                     |
| Task 12：安全公式 AST 与依赖 DAG      | complete    | 严格 Zod AST、精确求值、资源预算、稳定拓扑与完整循环诊断已通过审查和全仓门禁              |
| Task 13：成本档案与定价实验室         | complete    | 纯定价引擎、SKU 成本 revision、不可变历史、API/UI 与 Phase 3 E2E 已通过独立审查和全仓门禁 |
| Task 14：平台能力注册表               | complete    | 规范 ID/别名、不可伪造能力合同、通用 adapter、API/UI 和真实页面验收已完成                 |
| Task 15：版本化规则包与快照           | complete    | 安全 JSON/ZIP 加载、优先级/冲突、SQLite 版本与不可变快照、API/UI 和真实门禁均已完成       |
| Task 16：确定性促销引擎               | complete    | 组件规范化、资金归因、解释轨迹、全局最低活动价求解与确定性不变量测试均已完成              |
| Task 17：拼多多模拟器与批算           | complete    | PDD adapter、规则/成本快照、批算仓储、API/UI 与真实运行时持久化验收均已完成               |
| Task 18：版本化提示词编译器           | complete    | 五级信任分层、防注入边界、三类哈希、默认模板和不可变 SQLite 仓储均通过全仓门禁            |
| Task 19：DeepSeek 生成管线            | complete    | provider 抽象、有界重试、结构修复、证据校验、脱敏不可变日志和本地密钥设置已通过门禁       |
| Task 20：可审计竞品快照与导入         | complete    | provider port、CSV/XLSX/粘贴预览确认、不可变 SQLite、API/UI 与重启持久化测试已完成        |
| Task 21                               | complete    | 三类结构化提示词、证据审查、不可变修订、API/UI 与 fake-provider 重启测试已完成            |
| Task 22                               | complete    | 四类标题、事实守卫、本地规则、不可变修订、锁定、stale 原因和真实运行时持久化均已完成       |
| Task 23                               | in_progress | 正在实现结构化创意方案、详情页架构、单项重生成、锁定与稳定重排                            |
| Task 24–29                            | pending     | Task 23 完成后进入可恢复工作流和运营方案                                                  |

当前主线完成度按原计划 29 个任务计为 `22/29 ≈ 76%`。这里的状态以代码、提交历史和测试为准；旧计划中的未更新复选框不再作为进度来源。Task 22 已完成，下一项为 Task 23。

## Dependency Order

```text
公式 DAG → 成本/定价
        → 平台能力 → 规则快照 → 促销引擎 → 拼多多模拟
事实/规则 → 提示词编译 → AI 管线 → 竞品 → 洞察/卖点 → 标题/创意/详情
财务结果 + 内容资产 → 持久化工作流 → 可锁定运营方案
全部业务能力 → 备份/Windows 启动 → 仪表盘/离线体验 → 全链路验收
```

## Execution Protocol

每次开始工作前：

1. 阅读本文件、根目录 `task_plan.md`、`findings.md` 和 `progress.md`。
2. 只把一个任务标记为 `in_progress`，先写失败测试并记录 RED 证据。
3. 完成最小实现、聚焦测试、相关 workspace 测试和构建。
4. 更新本文件复选框、`task_plan.md` 状态、`findings.md` 决策与 `progress.md` 结果。
5. 一个任务一个可审查提交；任何质量门禁失败都不能把任务标记为 complete。

统一完整门禁：

```bash
node scripts/check-versions.mjs
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:rule-packs
pnpm exec playwright test
```

## Wave 1 — 完成财务基础

### Task 12: Safe formula AST and dependency DAG

**Files:**

- Create: `packages/calculation-engine/src/formula/ast.ts`
- Create: `packages/calculation-engine/src/formula/schema.ts`
- Create: `packages/calculation-engine/src/formula/evaluator.ts`
- Create: `packages/calculation-engine/src/formula/dag.ts`
- Modify: `packages/calculation-engine/src/index.ts`
- Test: 同目录 `*.test.ts` 与性质测试

**Interfaces:**

```ts
evaluateFormula(ast: FormulaNode, variables: ReadonlyMap<string, Money>, policy: RoundingPolicy): Money
orderDependencies(definitions: readonly FormulaDefinition[]): readonly FormulaDefinition[]
```

- [x] 测试白名单运算、零除、未知变量、最大深度/节点数、溢出及 `A→B→C→A` 循环。
- [x] 运行聚焦测试，确认因模块缺失而 RED。
- [x] 实现 Zod 判别联合、纯求值器和确定性拓扑排序；不执行任意代码。
- [x] 运行 calculation-engine 测试、类型检查和构建。
- [x] 提交 `feat: add safe formula calculation graph`。

### Task 13: Cost profiles and pricing laboratory

**Files:**

- Create: `packages/pricing-engine/src/{types,calculate,solver,index}.ts`
- Create: cost profile domain/repository/application/contracts/database vertical slice
- Create: 下一条不可变迁移 `migrations/0005_*.sql`
- Create: `apps/server/src/routes/costs.ts`, `pricing.ts`
- Create: `apps/web/src/features/costs/*`, `pricing/*`
- Modify: composition root、contracts index、workbench router

**Interfaces:**

```ts
calculatePricing(input: PricingInput): PricingResult
solveBreakEven(input: BreakEvenInput): BreakEvenResult
```

- [x] 测试 SKU 成本项、固定/按件/按订单/按收入基数、估算状态与缺失关键成本。
- [x] 测试目标利润、毛利率、净利率、保本点、单调性和完整计算追踪。
- [x] 实现纯定价引擎，再实现持久化、用例、API 和 UI；引擎内不得访问数据库。
- [x] 验证历史计算不可变，缺失/待确认输入不能显示 `verified`。
- [x] 运行引擎性质测试、SQLite 集成测试、UI 测试、构建与 E2E 回归。
- [x] 提交 `feat: add traceable sku cost and pricing laboratory`。

## Wave 2 — 平台规则与促销闭环

### Task 14: Platform registry and truthful capabilities

**Files:** `packages/platform-engine/src/{registry,context,adapter,capabilities}.ts`，配套 application/contracts/routes/UI。

```ts
getCapabilities(context: PlatformContext): PlatformCapabilities
requireCapability(context: PlatformContext, capability: Capability): void
```

- [x] 测试拼多多、淘宝、抖音能力矩阵和显式 unavailable 错误。
- [x] 实现注册表、上下文和通用内容适配器；切换平台不得触发 AI 调用。
- [x] 用真实页面验证能力提示、URL 状态和无伪结果行为。
- [x] 提交 `feat: add truthful platform capability registry`。

### Task 15: Versioned rule packs and immutable snapshots

**Files:** `packages/rule-engine/src/{schemas,loader,checksum,resolver,snapshot,diff}.ts`、规则表/仓库/导入 UI、`default-rule-packs/pinduoduo-cn/*`、`scripts/validate-rule-packs.mjs`。

```ts
loadRulePack(input: Uint8Array | string): LoadedRulePack
resolveRules(input: RuleResolutionInput): ResolvedRules
createRuleSnapshot(input: ResolvedRules): RuleSnapshot
```

- [x] 测试优先级、同级冲突、过期、兼容性、checksum、ZIP traversal 与可执行文件拒绝。
- [x] 实现只含数据的规则包、解析/冲突报告、不可变快照和差异查看。
- [x] 添加带来源的拼多多默认包；不确定财务规则必须标记 `needs_review`。
- [x] 将 `validate:rule-packs` 从占位脚本替换为真实校验并通过。
- [x] 提交 `feat: add versioned inert platform rule packs`。

### Task 16: Deterministic promotion engine

**Files:** `packages/promotion-engine/src/{components,normalize,calculate,solver,types,index}.ts` 及单元/性质/不变量测试。

```ts
calculatePromotion(input: PromotionInput): PromotionResult
solveCampaignPrice(input: CampaignPriceInput): CampaignPriceResult
```

- [x] 测试满减、折扣、券、平台/商家承担、封顶、门槛、非负支付和禁止重复扣减。
- [x] 实现规范化、钱流归因、有界全局最低价求解和逐步 trace。
- [x] 验证相同输入与规则快照始终得到相同结果。
- [x] 提交 `feat: add deterministic promotion money flow`。

### Task 17: Pinduoduo simulator and batch calculation

**Files:** 拼多多 adapter、promotion schema/repository/use cases/contracts/routes、`apps/web/src/features/promotion/*`。

- [x] 测试完整/不完整场景、多 SKU 批算、快照与追踪持久化。
- [x] 实现两栏模拟器、目标价求解、风险状态与可展开计算过程。
- [x] 明确回答到手价、商家实收、平台承担、利润、利润率和保本点。
- [x] 运行垂直切片、UI、批量与构建测试。
- [x] 提交 `feat: add pinduoduo promotion simulator`。

## Wave 3 — AI 安全基础设施

### Task 18: Versioned prompt compiler

**Files:** `packages/prompt-engine/src/{template,compiler,trust,hash,index}.ts`、prompt 表/仓库、`default-prompts/*.json`。

```ts
compilePrompt(input: PromptCompileInput): CompiledPrompt
```

- [x] 测试确定性编译、五级信任边界、外部不可信内容分隔、规则与提示分离、依赖哈希变化。
- [x] 实现版本化模板和 JSON Schema 输出约束；禁止业务提示词散落在 route/UI。
- [x] 添加默认模板校验命令与快照测试。
- [x] 提交 `feat: add versioned injection-safe prompt compiler`。

### Task 19: Provider abstraction, DeepSeek, validation and logs

**Files:** `packages/ai-engine/src/{provider,registry,deepseek,retry,structured,generation-log}.ts`、generation 表/仓库、AI settings API/UI。

```ts
interface AIProvider { generate(request: ProviderRequest): Promise<ProviderResponse> }
generateValidated<T>(input: StructuredGenerationInput<T>): Promise<ValidatedGeneration<T>>
```

- [x] 用 fake HTTP 测试超时、429/5xx 有界重试、一次结构修复和不可修复失败。
- [x] 测试 JSON/字段/枚举/证据/跨商品引用/无支持卖点的验证拒绝。
- [x] 实现 provider registry、DeepSeek adapter、结构化管线和脱敏不可变日志。
- [x] 证明密钥不出现在数据库、响应、日志与测试快照中；测试不得产生真实付费调用。
- [x] 提交 `feat: add guarded deepseek generation pipeline`。

## Wave 4 — 竞品、策略与内容资产

### Task 20: Auditable competitor snapshots and imports

**Files:** competitor domain/schema/repository/use cases/contracts/routes/UI，以及 CSV/XLSX/粘贴导入 adapter。

- [x] 测试“10万+”保持原始文本、快照不可变、跨商品/畸形导入拒绝。
- [x] 实现 preview → validation → confirm 导入，不实现抓取器。
- [x] 保留原值、标准化值、来源、导入批次和时间戳。
- [x] 提交 `feat: add auditable competitor snapshots and imports`。

### Task 21: Evidence-backed analysis, insight and selling points

**Files:** 三类 AI task contract/template/validator、insight/selling-point domain/schema/repository/use cases/routes/UI。

- [x] 测试结构化输出、证据归属、数据限制、修订和不支持主张降级为 suggested fact。
- [x] 实现竞品分析、市场洞察、卖点三条独立垂直链路。
- [x] UI 必须展示证据和限制，不得把建议显示成已确认事实。
- [x] 提交 `feat: add evidence-backed market strategy`。

### Task 22: Versioned title studio

**Files:** content asset/version/stale 服务、title use cases/contracts/routes/UI。

- [x] 测试编辑/重生成产生新修订、锁定保留、依赖变更过期原因和平台本地规则。
- [x] 实现推荐型、搜索型、卖点型、场景型标题及确定性本地校验。
- [x] 所有无事实支撑的词语进入 review，不得静默通过。
- [x] 提交 `feat: add guarded versioned title studio`。

### Task 23: Creative and detail-page builders

**Files:** creative/detail domain/schema/repository、AI task、routes、支持排序/锁定/单项重生成的 UI。

- [ ] 测试五图序列、逐项证据、中英文提示词/负面提示词、锁定和稳定重排。
- [ ] 实现结构化创意方案与详情页架构；本版本不生成图片。
- [ ] 上游依赖改变时只标记过期，不自动覆盖用户锁定内容。
- [ ] 提交 `feat: add structured creative and detail builders`。

## Wave 5 — 可恢复工作流与运营方案

### Task 24: Persisted workflow DAG and SSE

**Files:** `packages/workflow-engine/src/{dag,runner,persistence,recovery,idempotency}.ts`、workflow schema/repository/use cases/contracts/routes/SSE/UI。

```ts
runWorkflow(id: WorkflowId): Promise<WorkflowState>
resumeWorkflow(id: WorkflowId, expectedRevision: number): Promise<WorkflowState>
```

- [ ] 构造“前四节点完成、creative 失败、进程重启”的失败用例。
- [ ] 实现持久状态、幂等键、并发保护、恢复、取消与 SSE 事件。
- [ ] 恢复时只重跑失败/未开始节点，已完成节点 AI 调用次数保持为零。
- [ ] 提交 `feat: add resumable persisted generation workflow`。

### Task 25: Immutable traceable operation plans

**Files:** operation-plan domain/schema/repository/use cases/contracts/routes/UI/history。

- [ ] 测试成功聚合及跨商品、缺失、过期、未锁定、不兼容引用拒绝。
- [ ] 实现只引用精确上游 revision/result/snapshot ID 的方案聚合与锁定。
- [ ] 展示历史与可追踪来源；不得额外请求 AI 生成“总结”。
- [ ] 提交 `feat: aggregate traceable operation plans`。

## Wave 6 — 工作区可靠性与 Windows 交付

### Task 26: Consistent backup and transactional restore

**Files:** `packages/workspace/src/{backup,restore,manifest,archive-security}.ts` 及 data-management API/UI。

- [ ] 测试 WAL 活跃时一致性、checksum、ZIP traversal、兼容性、损坏归档和失败回滚。
- [ ] 实现 SQLite 安全快照、相对路径 manifest、暂存恢复、完整性检查、迁移和原子替换。
- [ ] 证明备份不含密钥和绝对路径，恢复失败时旧工作区保持可用。
- [ ] 提交 `feat: add safe portable workspace backup`。

### Task 27: Idempotent Windows setup and start

**Files:** `scripts/setup.ps1`、`scripts/start.ps1`、`scripts/windows/*.psm1`、Pester 测试。

- [ ] 测试版本错误、重复执行、数据保留、loopback、健康超时及中文/空格路径。
- [ ] 实现固定版本检查、安装、迁移、默认资源安装、启动、健康等待和浏览器打开。
- [ ] 在同一工作区连续执行两次并通过 Windows CI。
- [ ] 提交 `feat: add windows setup and start workflow`。

## Wave 7 — 产品收口与发布验收

### Task 28: Dashboard, settings, offline and accessibility

**Files:** dashboard read model/API/UI、规则/提示词/AI/系统页面、全局错误边界、离线与 capability banners。

- [ ] 测试缺失成本、过期资产、规则风险、亏损数量、配置状态和离线允许/禁止动作。
- [ ] 实现可行动总控台与脱敏设置页；离线时仍允许本地财务和历史查看。
- [ ] 完成键盘操作、焦点、语义状态、桌面布局和窄屏基本可用性检查。
- [ ] 更新 README，使能力说明与实际阶段一致。
- [ ] 提交 `feat: complete operational dashboard and offline ux`。

### Task 29: Full golden path and release gates

**Files:** `tests/e2e/golden-path.spec.ts`、fake AI fixture、competitor fixture、CI、README 验收说明。

- [ ] 编写端到端测试：商品 → 事实确认 → SKU → 成本 → 竞品导入 → AI 策略/内容 → 定价 → 拼多多促销 → trace → 运营方案锁定。
- [ ] 先运行并记录第一个真实行为缺口，再只在归属模块修复并添加聚焦回归。
- [ ] 在 Windows 与 Ubuntu 运行完整统一门禁，失败时保存 Playwright trace。
- [ ] 验证空白新工作区、已有工作区升级、备份恢复和离线模式。
- [ ] 提交 `test: verify complete ecommerce workbench golden path`，将版本标记为可发布候选。

## Completion Criteria

- [ ] Task 12–29 全部为 complete，且每项有 RED/GREEN/门禁记录。
- [ ] 三个平台能力范围真实；拼多多促销完整，淘宝/抖音未支持能力明确不可用。
- [ ] 每个 AI 结论都能回溯到事实、证据、规则、提示词和模型调用日志。
- [ ] 每个财务结果都能用输入与规则快照确定性复算。
- [ ] 工作流可在失败和重启后恢复，不重复已完成的外部调用。
- [ ] Windows 新机可幂等安装启动；工作区可安全备份并跨机器恢复。
- [ ] 完整质量门禁与最终 Playwright 黄金路径在支持环境全部通过。
- [ ] README、版本、界面能力提示与实际实现一致。

## Plan Maintenance Rules

- 本文件是剩余功能范围与验收标准的唯一主计划；除非用户改变产品范围，否则不得跳过或静默改写任务。
- `task_plan.md` 只维护波次状态和当前任务；`findings.md` 保存发现/决策；`progress.md` 保存每次执行与测试证据。
- 如果发现原计划遗漏，先在本文件新增任务或验收项，再实施代码。
- 如需改变架构、引入外部服务、真实付费 AI 调用或扩大平台能力，必须先向用户说明并取得授权。
