# Progress Log

## Session: 2026-08-31 — 建立长期完成计划

### Planning baseline

- **Status:** complete
- Actions taken:
  - 对照设计规格、原始实施计划、提交历史、现有模块和页面状态核验进度。
  - 确认 Task 1–11 已完成，Task 12–29 为后续主线。
  - 创建完整 master plan，并建立 task/findings/progress 持久执行文件。
  - 把工具链差异、测试运行注意事项和旧文档滞后写入长期记录。
  - 完成 Task 12–29 编号覆盖、规格主题覆盖、占位符扫描和 `git diff --check` 自检；未发现遗漏或格式错误。
- Files created/modified:
  - `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md`（created）
  - `task_plan.md`（created）
  - `findings.md`（created）
  - `progress.md`（created）

## Test Results

| Test                            | Input                              | Expected                   | Actual                                                      | Status  |
| ------------------------------- | ---------------------------------- | -------------------------- | ----------------------------------------------------------- | ------- |
| Web + calculation focused tests | Vitest, source paths               | Pass                       | 14 files / 38 tests passed                                  | ✓       |
| Database workspace tests        | Vitest from `packages/database`    | Pass                       | 5 files / 20 tests passed                                   | ✓       |
| Workspace tests                 | Vitest from `packages/workspace`   | Pass                       | 3 files / 52 tests passed                                   | ✓       |
| Domain tests                    | Vitest from `packages/domain`      | Pass                       | 8 files / 28 tests passed                                   | ✓       |
| Application tests               | Vitest from `packages/application` | Pass                       | 4 files / 10 tests passed                                   | ✓       |
| Server tests                    | Vitest from `apps/server`          | Pass                       | 9 files / 19 tests passed                                   | ✓       |
| API health                      | `GET /api/v1/health`               | status ok                  | `{status:"ok", appVersion:"0.1.0"}`                         | ✓       |
| Web smoke                       | `GET http://127.0.0.1:5173/`       | HTTP 200                   | HTTP 200                                                    | ✓       |
| Full root quality gate          | root `pnpm test`                   | Run under pinned toolchain | blocked by Node/pnpm mismatch before authoritative test run | blocked |

## Error Log

| Timestamp  | Error                                                                              | Attempt | Resolution                                                                         |
| ---------- | ---------------------------------------------------------------------------------- | ------: | ---------------------------------------------------------------------------------- |
| 2026-08-31 | graphify current-progress query returned no matching nodes                         |       1 | Used code, commits and test evidence instead                                       |
| 2026-08-31 | root `pnpm test` attempted dependency preparation with unsupported local toolchain |       1 | Avoided dependency mutation; recorded environment prerequisite                     |
| 2026-08-31 | root-level raw Vitest produced cwd/dist false failures                             |       1 | Re-ran key workspaces from correct directories; all passed                         |
| 2026-08-31 | 精确 Node 可运行，但版本检查脚本在 PATH 中找不到临时 pnpm                          |       1 | 在 `/private/tmp/eaw-toolchain-bin` 创建仅本次任务使用的 pnpm wrapper              |
| 2026-08-31 | 锁文件供应链校验在沙箱内 DNS 失败                                                  |       1 | 使用获批网络完成 `pnpm install --lockfile-only`                                    |
| 2026-08-31 | `pnpm install --offline` 缺少供应链元数据并中止重建                                |       1 | 改用联网 `pnpm install --frozen-lockfile`，依赖目录恢复完成                        |
| 2026-08-31 | 单个 apply_patch 同时删除并新增同一路径被拒绝                                      |       1 | 分成删除与新增两个 apply_patch 调用，未丢失内容                                    |
| 2026-08-31 | 更新长期记录时补丁上下文定位错误                                                   |       1 | 重新读取文件并按实际段落位置更新                                                   |
| 2026-08-31 | calculation-engine typecheck 报 3 处 `unknown` 传入 `Set<string>.has`              |       1 | 根因是 Record 属性窄化未跨别名保留；在验证函数入口将 `node.type` 收窄为局部 string |
| 2026-08-31 | 新增公式文件未满足 Prettier 格式检查                                               |       1 | 对 4 个公式实现文件运行仓库 Prettier，随后根级 `format:check` 通过                 |
| 2026-08-31 | 一次聚焦测试误用了系统 pnpm 11.19.0，触发依赖状态检查                              |       1 | 未允许其修改依赖；立即改用临时精确 Node 24.19.0 / pnpm 11.22.0 工具链              |
| 2026-08-31 | GitHub HTTPS 推送两次收到空响应，随后 443 连接超时                                 |       2 | IPv4 探测成功；使用单次 `http.curloptResolve` 定向后成功推送，不改系统设置         |
| 2026-08-31 | GitHub SSH 连接可达但无可用公钥，`gh` 旧令牌失效                                   |       1 | 未创建新凭据；改用已有 Git credential + IPv4 HTTPS 完成推送                        |
| 2026-08-31 | 新增 pricing-engine 后冻结锁文件因缺少 workspace importer 拒绝安装                 |       1 | 先离线更新 lockfile-only，再恢复冻结安装                                           |
| 2026-08-31 | 离线冻结安装缺少供应链元数据并中止                                                 |       1 | 使用获批网络从本地内容仓恢复 299 个锁定包，未改变版本                              |
| 2026-08-31 | pricing-engine 测试 helper 返回宽泛联合导致 2 处 TS2322                            |       1 | 将 helper 返回类型收窄为 `AmountCostItem`，实现代码无需修改                        |
| 2026-08-31 | Prettier 无法推断 SQL parser                                                       |       1 | 不用 Prettier 改写迁移；以真实 SQLite 迁移测试和 `git diff --check` 验证           |
| 2026-08-31 | application 测试中的过期修订用例缺少 `now` 字段                                    |       1 | 修正测试输入后确认领域实现通过                                                     |
| 2026-08-31 | server 首轮 GREEN 暴露 fake 未保存状态及 prepare-internal 预期过期                 |       1 | 修正有状态 fake，并把 calculation/pricing engine 加入依赖顺序契约                  |

## Next Action

1. 读取 Task 13 范围和现有领域/数据库/API/UI 模式。
2. 按 TDD 建立成本档案与定价实验室的纯计算核心。
3. 完成 Task 13 垂直切片、门禁、审查和独立提交。

## 5-Question Reboot Check

| Question             | Answer                                                |
| -------------------- | ----------------------------------------------------- |
| Where am I?          | Wave 1 / Task 12 已完成，下一项是 Task 13             |
| Where am I going?    | 完成 master plan 的 Task 12–29                        |
| What's the goal?     | 交付完整、可追踪、可恢复的本地电商 AI 运营工作台 v0.1 |
| What have I learned? | 见 `findings.md`                                      |
| What have I done?    | 已完成进度核验和长期计划落盘                          |

## Session: 2026-08-31 — Wave 1 / Task 12

### Safe formula AST and dependency DAG

- **Status:** complete
- Actions taken:
  - 读取并审阅 master plan、task plan、findings 和历史进度。
  - 确认当前目录是分支 `codex/phase-0` 的独立 linked worktree。
  - 确认仓库没有 `.codegraph/`，按仓库规则跳过 CodeGraph。
  - 发现当前系统工具链为 Node 26.4.0 / pnpm 11.19.0；准备在临时目录恢复锁定版本，不修改系统配置。
  - 使用 Node 24.19.0 / pnpm 11.22.0 完成冻结安装和权威基线 `pnpm test`；现有测试全部通过。
  - 完成 schema 两轮 RED→GREEN：严格白名单、精确字面量、额外字段拒绝、深度 32 与节点 256 限制，14 项测试通过。
  - 完成 evaluator 两轮 RED→GREEN：精确算术、min/max、局部舍入、六种比较、条件短路、零除/负值/未知变量/币种错误，16 项测试通过。
  - 完成 DAG RED→GREEN：稳定拓扑排序、外部变量忽略、重复/非法键、定义数上限和完整循环路径，7 项测试通过。
  - 增加包根导出测试并完成公式模块公开导出。
  - 独立审查识别出 schema 未净化行为属性、BigInt 输入无界和 DFS 拓扑不稳定三个 Important 问题；逐项补 RED 回归测试后修复，并通过同一审查者复核。
  - schema 最终采用安全迭代预检 + strict recursive Zod 判别联合，返回脱离输入的纯数据副本；输入整数上限 128 位，中间精确值预算 4096 位。
  - DAG 最终采用按原始索引优先的 Kahn 排序，并在失败时用 DFS 提取完整循环路径。
  - 补充确定性性质测试，覆盖等价有理数和生成式 DAG 的依赖先行不变量；calculation-engine 共 10 个测试文件、63 项测试通过。
  - 通过 calculation-engine 的 test/typecheck/lint/build 聚焦门禁。
  - 通过根级 `format:check`、`typecheck`、`lint`、`test` 和 `build`；根级测试共 244 项通过。
- Files created/modified:
  - `task_plan.md`（Task 12 标记为 in_progress）
  - `progress.md`（新增本次执行记录）
  - `packages/calculation-engine/src/formula/*`（新增 AST、schema、evaluator、DAG、导出与测试）
  - `packages/calculation-engine/src/index.ts`（公开公式模块）
  - `packages/calculation-engine/package.json`、`pnpm-lock.yaml`（加入精确版本 Zod 依赖）

## Session: 2026-08-31 — Wave 1 / Task 13

### Cost profiles and pricing laboratory

- **Status:** complete
- Actions taken:
  - 将 Task 12 提交 `c1511e7` 推送到 GitHub `codex/phase-0` 分支并建立远端跟踪。
  - 重新读取 master plan、task plan、findings、progress，并确认继续在独立 worktree 分支执行。
  - 标记 Task 13 为 in_progress；下一步先核对现有垂直切片模式，再以失败测试定义纯定价引擎契约。
  - 完成纯 pricing-engine 的 RED→GREEN：首次正确 RED 为 calculate/solver 模块缺失；随后 8 项单元/性质测试通过。
  - 定价引擎支持固定分摊、按件、按订单、按收入百分比与安全公式成本，目标利润/毛利率/净利率/保本求解，以及 verified/warning/incomplete 状态与完整 trace。
  - 分段公式通过阈值分区、区间二分和候选复核寻找最早安全价格；固定成本增长的保本单调性测试通过。
  - 完成 CostProfile 领域模型、乐观 revision、`0005_add-cost-pricing.sql`、真实 SQLite 仓储与不可变 scenario/result 触发器。
  - 完成 application 用例、严格 Zod contracts、成本/定价 Fastify routes 和生产组合根注入。
  - 当前聚焦结果：domain 31、database 22、application 12、contracts 29、server 21 项测试通过；相关 typecheck 通过。

## Session: 2026-09-01 — Wave 1 / Task 13 验收

### Cost profiles and pricing laboratory closeout

- **Status:** complete
- Actions taken:
  - 为 `PricingRepository` 增加原子 `appendCalculation`，将 scenario/result 放入同一 `BEGIN IMMEDIATE` 事务；新增结果写入失败回滚集成测试。
  - 为持久化定价状态增加运行时枚举校验，防止类型断言掩盖畸形数据库内容。
  - 完成成本中心 React 编辑器：已启用 SKU 选择、revision、五类成本、三种输入状态、关键项、动态字段、保存与冲突错误反馈。
  - 完成价格实验室 React 页面：四类定价目标、候选价范围、可信状态、建议价、利润/利润率、完整 trace 和不可变历史。
  - 接通浏览器 API、Workbench 路由、应用组合根和响应式财务样式。
  - 新增 Phase 3 Playwright 黄金路径；第一次运行准确暴露重复文本定位器歧义，按结果区域和指标语义收紧定位后 Phase 2/3 E2E 共同通过。
  - 重连后从 Codex bundled runtime 恢复 Node 24.19.0，并把 pnpm 11.22.0 安装到临时目录，未修改系统工具链。
  - 启动独立只读代码审查，等待审查结论后再提交。
  - 独立审查首次发现 solver 非单调错误、百分比基数未显式选择、轨迹不完整、计算异常 503、UI 请求竞态和大整数展示精度问题；逐项以回归测试修复。
  - solver 最终改为 100,000 分窗口内的升序全局最小值搜索，并为所有公共入口增加 2,000,000 复合工作预算、256 节点上限和四变量白名单。
  - 补齐六类比较、有理表达式阈值、单点有效窗口、复杂公式终止、公共 solver 预算旁路、四种百分比基数、完整财务 trace、422 错误映射、跨商品/SKU 竞态、旧保存解锁和超大 BigInt 展示测试。
  - 独立审查共四轮复核；最终结论为无 Critical/Important/Minor 剩余问题，`Ready to merge: Yes`。

### Fresh verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Root unit/integration tests | 289 passed, 0 failed |
| Playwright E2E              | 2 passed, 0 failed   |
| Root typecheck              | passed               |
| Root lint                   | passed               |
| Root production build       | passed               |
| Root format check           | passed               |
| `git diff --check`          | passed               |

### Next action

1. 提交并推送 Task 13：`feat: add traceable sku cost and pricing laboratory`。
2. 进入 Wave 2 / Task 14：平台能力注册表。

## Session: 2026-09-01 — Wave 2 / Task 14

### Truthful platform capability registry

- **Status:** complete
- Actions taken:
  - 新增 `@eaw/platform-engine`，实现三平台规范注册表、旧 profile ID 别名映射、纯 context builder、固定能力矩阵、`requireCapability` 和通用内容 adapter。
  - 拼多多促销/费率在规则快照上线前固定为 `requires_rule_pack`；淘宝/抖音促销不可用、费率不完整，定价仅为通用能力。
  - 新增 application use case、按平台判别的 Zod 合同和 `/api/v1/platforms/:platformId/capabilities`，规范 ID 与别名均可访问。
  - 平台档案页增加真实能力卡，切换平台只加载档案与能力 API，不触发 AI，未支持能力不显示伪利润。
  - 档案保存使用身份和 sequence 双重竞态保护，覆盖切走和 ABA 切回后的过期保存，身份变化时立即解锁新页面。
  - 独立审查发现自证规则完整、合同可伪造、canonical API 不可访问和保存 ABA 问题；均补回归测试并修复，最终复核为无剩余问题、`Ready to merge: Yes`。
  - GitHub 同步核对显示本地与 `origin/codex/phase-0` 为 0 ahead / 0 behind，`origin/main` 无新提交需合并。

### Fresh verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Root unit/integration tests | 306 passed, 0 failed |
| Playwright E2E              | 2 passed, 0 failed   |
| Root typecheck              | passed               |
| Root lint                   | passed               |
| Root production build       | passed               |
| Root format check           | passed               |
| `git diff --check`          | passed               |

### Next action

1. 提交并推送 Task 14：`feat: add truthful platform capability registry`。
2. 进入 Wave 2 / Task 15：版本化规则包、冲突解析与不可变快照。

## Session: 2026-09-01 — Wave 2 / Task 15

### Versioned inert rule packs

- **Status:** complete
- Actions taken:
  - 将 Task 15 标记为 in_progress，重读规则系统设计、ADR 0006 与旧实施计划接口。
  - 新增 `@eaw/rule-engine` 包与 RED→GREEN 测试，当前 10 项通过：JSON/ZIP 加载、checksum、应用版本兼容、可执行数据/文件拒绝、ZIP traversal、解析优先级、同级冲突、过期/待审核状态、不可变快照与 diff。
  - 实现稳定 canonical JSON/SHA-256、有边界 ZIP 中央目录解析/CRC32 校验、惰性 Zod schema、规则 resolver、snapshot hash 和稳定 diff。
  - 添加 `default-rule-packs/pinduoduo-cn` 的 manifest/rules/schema/fixture/changelog；佣金、技术服务费和补贴归因不猜值，全部为 `null + needs_review`。
  - 将 `validate:rule-packs` 从占位命令替换为真实构建/校验脚本；当前输出 `validated pinduoduo-cn@2026.9.0 (incomplete)`。
  - 新增 `0006_add-rule-packs.sql`、真实 SQLite 仓储和集成测试：唯一 active 版本、覆盖 revision、不可变快照 trigger、读取时结构/hash fail-closed。
  - 新增 application use case、严格 HTTP 合同和 `/api/v1/rule-packs` 导入/列表/激活/diff API；生产运行时使用 UUIDv7 与真实仓储组合。
  - 将“平台与规则”从占位页升级为可操作页面，支持 JSON/ZIP 文件、粘贴导入、启用版本、显示 `needs_review` 数量和比较规则差异。
  - 收口复核发现加载器的 `sourceFormat` 与仓储 strict schema 边界不兼容；新增真实回归测试并改为只持久化 manifest/rules。

### Current verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Root unit/integration tests | 331 passed, 0 failed |
| Root typecheck              | passed               |
| Root lint                   | passed               |
| Root production build       | passed               |
| `pnpm validate:rule-packs`  | passed               |

### Next action

1. 提交并推送 Task 15：`feat: add versioned inert platform rule packs`。
2. 进入 Wave 2 / Task 16：确定性促销金额流、组件规范化、求解与 trace。

## Session: 2026-09-02 — Wave 2 / Task 16

### Deterministic promotion money flow

- **Status:** complete
- Actions taken:
  - 提交并推送 Task 15；同步核对 `codex/phase-0` 与远端分支为 0 ahead / 0 behind。
  - 新增 `@eaw/promotion-engine`，按 RED→GREEN 实现固定满减、券、百分比折扣、门槛、封顶、优先级和资方归因。
  - 组件按 `priority + key` 稳定规范化；逐步 trace 保存每一步请求优惠、实际优惠、消费者应付和商家实收前后值。
  - 平台承担优惠保留商家实收，商家承担优惠同时降低应付与实收，并在运行时强制验证钱流恒等式、非负金额和确认收入。
  - 实现最多 100,000 分搜索窗的升序求解器，保证在门槛、封顶和舍入跳变下仍返回满足最低商家实收的全局最低活动价，并明确返回无解状态。
  - 添加 9 项单元、求解和确定性性质测试，覆盖相同输入重复计算、全价格窗不变量、资金归因和边界拒绝。
  - 全仓测试偶发暴露持久密钥锁的正常原子抢占竞态：扫描后 `owner.json` 已被另一进程改名。读取逻辑对瞬时 `ENOENT` 重新扫描；workspace 测试连续三轮 52/52 通过。

### Fresh verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Promotion engine tests      | 9 passed, 0 failed   |
| Root unit/integration tests | 340 passed, 0 failed |
| Root typecheck              | passed               |
| Root lint                   | passed               |
| Root production build       | passed               |

### Next action

1. 提交并推送 Task 16：`feat: add deterministic promotion money flow`。
2. 进入 Wave 2 / Task 17：拼多多模拟器、持久化批算与可解释 UI。

## Session: 2026-09-02 — Wave 2 / Task 17

### Pinduoduo simulator and immutable batch history

- **Status:** complete
- Actions taken:
  - 增加拼多多规则 adapter，将活动价、消费者应付、确认收入、商家实收、平台承担和费用基数接入同一确定性资金流。
  - 默认规则包仍为 `needs_review` 时保留可验证钱流，但明确返回不完整状态，利润、利润率和保本点均为 `null`，不猜佣金或技术服务费。
  - 新增不可变促销场景/结果领域模型、SQLite 迁移与事务批量追加仓储；每条结果固定 SKU、成本 revision、规则快照/hash、引擎版本、输入和 trace。
  - 新增 application use case、严格合同和创建场景/批算/历史 API，生产组合根使用真实成本、规则与促销仓储。
  - 将促销占位页替换为两栏模拟器，支持多 SKU、商家/平台券、结果指标、风险状态、计算过程与不可变历史。
  - 使用真实临时工作区完成生产运行时重启持久化验证，并在应用内打开实际促销页面完成 DOM 验收。

### Fresh verification evidence

| Gate                               | Result               |
| ---------------------------------- | -------------------- |
| Promotion/PDD focused tests        | 12 passed, 0 failed  |
| Production runtime slice           | 6 passed, 0 failed   |
| Root unit/integration tests        | 354 passed, 0 failed |
| Root typecheck                     | passed               |
| Root lint                          | passed               |
| Root production build              | passed               |
| Browser DOM/API/history acceptance | passed               |

### Next action

1. 提交并推送 Task 17：`feat: add pinduoduo promotion simulator`。
2. 进入 Wave 3 / Task 18：版本化、可防注入的提示词编译器。

## Session: 2026-09-02 — Wave 3 / Task 18

### Versioned injection-safe prompt compiler

- **Status:** complete
- Actions taken:
  - 新增 `@eaw/prompt-engine`，实现严格版本化模板、JSON Schema 输出约束、规范 JSON 与 SHA-256 哈希。
  - 按 `SYSTEM → RULE → CONFIRMED_FACT → APPROVED_AI_ASSET → EXTERNAL_UNTRUSTED` 稳定排序；SYSTEM 上下文进入 system message，其余上下文保持独立分段。
  - 外部内容使用内容哈希派生的边界，并明确声明其仅为数据、不可覆盖任务/规则/输出格式；上下文 key 去重且受 32 层、10,000 节点和 200,000 字节预算保护。
  - 模板哈希、依赖哈希和输入哈希分别计算，规则或事实 revision 变化不会改写模板版本，但一定改变依赖/输入身份。
  - 新增首个竞品分析默认模板、`validate:prompts` 严格校验命令与稳定编译快照；扫描确认 route/UI 没有散落业务提示词。
  - 新增 `0008_add-prompts.sql` 与真实 SQLite 仓储，模板版本不可更新/删除，启用指针独立切换，读取时复算哈希并 fail closed。

### Fresh verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Prompt engine tests         | 5 passed, 0 failed   |
| Prompt repository tests     | 2 passed, 0 failed   |
| Root unit/integration tests | 361 passed, 0 failed |
| Root typecheck              | passed               |
| Root lint                   | passed               |
| Root production build       | passed               |
| `pnpm validate:prompts`     | passed               |
| `pnpm validate:rule-packs`  | passed               |

### Next action

1. 提交并推送 Task 18：`feat: add versioned injection-safe prompt compiler`。
2. 进入 Wave 3 / Task 19：provider 抽象、DeepSeek、结构化验证、重试与脱敏不可变日志。

## Session: 2026-09-03 — Wave 3 / Task 19

### Guarded DeepSeek generation pipeline

- **Status:** complete
- Actions taken:
  - 新增 `@eaw/ai-engine`，实现 provider 接口、稳定注册表、DeepSeek adapter 和可注入 fake HTTP 边界。
  - 对超时、HTTP 429、5xx 和网络异常执行最多 5 次的有界指数重试；对外只返回不含上游响应和密钥的安全错误。
  - 实现严格 JSON/Zod 结构化生成，首次无效时只允许一次修复；枚举、字段、证据归属、跨商品引用和无支持主张均会拒绝或降级为 `needs_review`。
  - 生成成功、审核降级和失败均通过统一入口追加脱敏日志，保存 provider/model、prompt 版本、输入哈希、token 和时间。
  - 新增 `0009_add-ai-generations.sql`和真实 SQLite 仓储；日志绑定精确提示词版本，通过外键、update/delete trigger 和读取复验 fail closed。
  - 完成本地 DeepSeek 设置用例、严格 API 合同、Fastify 路由和 React 设置页；密钥只进入 `FileSecretStore`，保存后不在响应或页面回显。
  - 真实运行时重启测试确认密钥可持续识别为“已配置”，同时 SQLite 二进制中不含密钥文本。
  - 所有 AI 测试使用 fake provider/fetch，未调用真实 DeepSeek 付费接口。

### Fresh verification evidence

| Gate                             | Result               |
| -------------------------------- | -------------------- |
| Root unit/integration tests      | 379 passed, 0 failed |
| AI engine tests                  | 11 passed, 0 failed  |
| Database tests                   | 34 passed, 0 failed  |
| Root typecheck                   | passed               |
| Root lint                        | passed               |
| Root production build            | passed               |
| Frozen lockfile install          | passed               |
| Prompt/rule-pack validation      | passed               |
| Root format check / diff check   | passed               |
| Runtime secret isolation/restart | passed               |

### Next action

1. 提交并推送 Task 19：`feat: add guarded deepseek generation pipeline`。
2. 进入 Wave 4 / Task 20：可审计竞品快照、CSV/XLSX/粘贴预览与确认导入。

## Session: 2026-09-04 — Wave 4 / Task 20

### Auditable competitor snapshots and imports

- **Status:** complete；按用户要求在此暂停，Task 21 尚未启动
- Actions taken:
  - 新增竞品身份、导入批次和不可变捕获快照领域模型；展示价格/销量/评价与标准化值并存，`10万+` 原文完整保留且只标记为下界。
  - 新增可替换 `CompetitorDataProvider` 端口及 CSV、XLSX、粘贴本地 adapter；执行大小、行列、表头、URL、时间和工作区资产路径校验，不实现抓取器。
  - 新增 preview → validation → confirm 应用流程、严格 Zod 合同、Fastify 路由和 React 竞品页，支持文件预览、确认导入及审计台账。
  - 新增 `0010_add-competitors.sql` 和真实 SQLite 仓储；同商品复合外键阻止跨商品引用，批次原子导入，快照与批次禁止更新/删除。
  - 生产运行时重启集成测试确认竞品快照可持久化，UI/API 测试确认预览、确认和重新加载仍保留展示原文。

### Fresh verification evidence

| Gate                           | Result               |
| ------------------------------ | -------------------- |
| Root unit/integration tests    | 396 passed, 0 failed |
| Competitor engine tests        | 7 passed, 0 failed   |
| Root typecheck                 | passed               |
| Root lint                      | passed               |
| Root production build          | passed               |
| Runtime persistence/restart    | passed               |
| Real paid AI / crawler request | not used             |

### Pause / resume point

1. Task 20 已完成；不要重复实现或重新设计竞品导入。
2. 下周先读取 `docs/superpowers/handoffs/2026-09-04-after-task-20.md`，确认分支与质量门禁后，从 Task 21 的失败测试开始。
3. Task 21 目标是竞品分析、市场洞察、卖点三条独立 AI 垂直链路；必须绑定本商品证据， unsupported idea 降级为 suggested fact，UI 展示证据和限制。

## Session: 2026-09-04 — Wave 4 / Task 21

### Evidence-backed market strategy

- **Status:** complete
- Actions taken:
  - 新增竞品分析、市场洞察和卖点集三类严格结构化输出 schema、独立默认提示词及启动时安装/激活逻辑。
  - 只把已确认、允许且非敏感的商品事实，以及当前商品竞品快照按信任级别送入提示词；AI 输出证据逐条校验类型、ID 和商品归属。
  - 无证据或只有外部证据的商品卖点自动移入 `suggestedFacts` 并标记 `needs_review`，避免把建议展示成已确认事实。
  - 新增 `0011_add-strategy-assets.sql` 与不可变修订仓储；每次重新生成绑定精确 AI generation log、revision 和上一个资产 ID。
  - 新增应用用例、严格合同、Fastify 路由及市场分析/卖点页面，展示证据、数据限制、审核状态和修订历史。
  - 使用 fake provider 完成生产运行时生成与重启持久化测试，未产生真实付费 AI 请求。

### Fresh verification evidence

| Gate                              | Result               |
| --------------------------------- | -------------------- |
| Root unit/integration tests       | 403 passed, 0 failed |
| Root typecheck                    | passed               |
| Root lint                         | passed               |
| Root production build             | passed               |
| Frozen lockfile install           | passed               |
| Prompt/rule-pack validation       | passed               |
| Fake-provider restart persistence | passed               |

### Next action

1. 提交并推送 Task 21：`feat: add evidence-backed market strategy`。
2. 进入 Wave 4 / Task 22：版本化标题工作室、不可变修订、锁定与上游变化 stale 原因。

## Session: 2026-09-04 — Wave 4 / Task 22

### Guarded versioned title studio

- **Status:** complete
- Actions taken:
  - 新增推荐型、搜索型、卖点型和场景型四类严格标题输出，并按拼多多、淘宝/天猫、抖音执行确定性长度、重复和禁用词校验。
  - 标题主张只能引用当前商品已确认、允许且非敏感的事实；无证据主张和模型声明的待核实词语统一标记 `needs_review`。
  - 新增 `0012_add-title-assets.sql` 和不可变修订仓储；生成、编辑与锁定只追加版本，数据库 trigger 禁止历史更新和删除。
  - 依赖哈希覆盖商品事实、卖点、平台本地规则和提示词；上游变化只返回明确 stale 原因，不覆盖锁定版本。
  - 新增严格合同、Fastify 路由和标题工作室页面，支持平台切换、四类编辑、重新生成、锁定、校验问题与历史展示。
  - 使用 fake provider 完成生产运行时生成及重启后历史读取，未发起真实付费 AI 请求。

### Fresh verification evidence

| Gate                              | Result               |
| --------------------------------- | -------------------- |
| Root unit/integration tests       | 408 passed, 0 failed |
| Playwright golden paths           | 2 passed, 0 failed   |
| Root typecheck                    | passed               |
| Root lint                         | passed               |
| Root production build             | passed               |
| Frozen lockfile install           | passed               |
| Prompt/rule-pack validation       | passed               |
| Fake-provider restart persistence | passed               |

### Next action

1. 提交并推送 Task 22：`feat: add guarded versioned title studio`。
2. 进入 Wave 4 / Task 23：结构化创意方案与详情页构建器、单项重生成、锁定和稳定重排。

## Session: 2026-09-07 — Wave 4 / Task 23

### Structured creative and detail builders

- **Status:** complete
- Actions taken:
  - 新增恰好五项、稳定 ID 和显式顺序的创意方案领域模型；每项包含中英文正向提示词、中英文负面提示词、证据引用、审核状态和锁定状态，本版本明确不生成图片。
  - 新增有序详情页区块模型；创意项与详情区块的锁定、单项重生成和重排均追加完整不可变修订，不修改历史记录。
  - 新增三份严格结构化提示词与 AI 输出审核；只编译本商品已确认、允许且非敏感的事实，以及精确卖点/标题修订，跨商品或不存在的证据统一降级为 `needs_review`。
  - 新增 `0013_add-creative-detail-assets.sql`、创意/详情独立仓储和 SQLite 不可变 trigger；生成日志、前序修订及商品/平台/revision 关系均可追踪。
  - 新增应用用例、严格合同、Fastify 路由和生产组合根；fake provider 集成测试确认生成后重启仍能读取相同创意与详情历史。
  - 将“视觉”和“详情页”占位路由替换为真实工作台，支持平台切换、生成、逐项锁定/重生成、上下移动、证据/审核/过期原因和修订历史展示。
  - 以 Node 24.19.0 / pnpm 11.22.0 完成冻结安装和全部质量门禁；所有自动化 AI 测试只使用 fake provider，未发起付费调用。

### Fresh verification evidence

| Gate                              | Result               |
| --------------------------------- | -------------------- |
| Root unit/integration tests       | 429 passed, 0 failed |
| Playwright golden paths           | 2 passed, 0 failed   |
| Root typecheck                    | passed               |
| Root lint                         | passed               |
| Root production build             | passed               |
| Frozen lockfile install           | passed               |
| Prompt/rule-pack validation       | passed               |
| Fake-provider restart persistence | passed               |
| `git diff --check`                | passed               |

### Next action

1. 提交并推送 Task 23：`feat: add structured creative and detail builders`。
2. 进入 Wave 5 / Task 24：持久化工作流 DAG、幂等恢复、取消和 SSE 进度事件。

## Session: 2026-09-08 — Wave 5 / Task 24

### Resumable persisted workflow — engine, SQLite, recovery and preflight

- **Status:** complete
- 已完成工作流定义、状态模型、串行 runner 与内存幂等恢复测试。
- 已完成 SQLite run/node/attempt/event 持久化、revision CAS、不可变审计、失败关闭读取及启动中断恢复。
- 已完成只读预检与归档商品保护；预检不会调用 `execute` 或产生付费 AI 请求。
- 已分别通过 workflow-engine 10 项、database 44 项及 application 28 项测试，以及相关类型检查、lint 和构建。
- 已推送 `27acb0c` 至 `185f670` 共八个 Task 24 阶段提交，远端与本地同步。
- 复核发现并已补齐 runner `retryNode/cancel`：显式重试只接受指定失败节点，取消和重试均执行 revision/状态保护；workflow-engine 12 项测试及类型检查、lint、构建通过。
- 已完成 Application 的 start/list/get 生命周期首段：启动先持久化再调度，后台 runner 拒绝被安全接住，列表/详情均重新校验商品归属；SQLite 新增按商品最新优先查询。
- 最新门禁：application 30 项、database 45 项测试通过，两个包的相关类型检查、lint 和构建通过。
- 已补齐 resume/retry/cancel/listEvents：所有操作先验证 run 商品归属与 expected revision，恢复/重试后台拒绝被安全收敛，取消直接返回原子转换结果；application 31 项测试及类型检查、lint、构建通过。
- 已完成安全事件订阅器：订阅时先回放持久事件、注册后再次补齐竞态窗口，按 sequence 去重；runner/取消完成后才从 durable event 仓储发布，监听器异常与取消订阅均被隔离。Application 32 项测试及类型检查、lint、构建通过。
- 已完成六节点 handler 路由与统一结果映射：三类策略、标题、创意和详情均复用现有应用用例，保留商品/平台身份、精确资产 ID/revision 以及 completed/locked/needs_review 状态；检查快照使用规范 JSON + SHA-256。Application 34 项测试及类型检查、lint、构建通过。
- 已完成真实仓储依赖检查：仅纳入已确认、策略允许且非敏感的事实，并追踪竞品快照、上游资产 ID/revision、平台资料、活动规则包/覆盖项和活动提示词哈希；仅在同商品、同平台且资产保存的 workflow 哈希完全一致时复用。Application 36 项测试及全部包门禁通过，Task 3 完成。
- 已完成 workflow HTTP/SSE 严格 contracts：UUIDv7、平台、固定定义、节点键、正 revision、非负事件游标及所有响应结构均拒绝未知字段。Contracts 35 项测试及类型检查、lint、构建通过。
- 已完成七个 workflow HTTP 操作路由：preflight/start/list/get/resume/retry/cancel 严格解析输入，异步调度操作返回 202，并复用全局安全错误映射。Server 42 项测试及类型检查、lint、构建通过。
- 已完成 durable SSE 适配器：严格校验事件游标，订阅期间先缓冲持久回放再切到实时写入，输出持久 id/event/JSON data 和禁缓存头，连接关闭时可靠取消订阅。Server 44 项测试及全部门禁通过。
- 已完成生产 workflow 组合与 canonical restart：启动恢复先于 buildApp 且绝不自动执行 handler；首次在 creative 失败后重启调用增量为 0，显式 resume 的六节点调用增量严格为 0/0/0/0/1/1。SSE 增加非持久 heartbeat，真实 definition node key 已校正。Application 36、Contracts 35、Server 46 项测试及类型检查、lint、构建通过，Task 4 完成。
- 已完成前端 workflow API 客户端：七个 JSON 操作保留严格 definition/revision guard，typed SSE 按持久事件类型监听并显式提供连接清理。Web 聚焦测试、类型检查和 lint 通过。
- 已完成可访问 workflow 进度组件：六节点状态、精确输出 revision、安全错误、人工复核/依赖变化提示及显式 start/resume/retry/cancel；平台切换丢弃过期结果，SSE 断线严格先 GET 对账再重连。3 项组件测试、类型检查和 lint 通过。
- 已将工作流进度接入真实 `/products/:productId/plans` 路由与顶部入口，补齐页面样式；用户显式启动/操作后会立即订阅该 run。Web 49 项测试、typecheck、lint 和生产构建全部通过。
- 已完成 Phase 10 Playwright 黄金路径：独立 E2E 服务入口使用确定性 fake provider，真实页面验证前四节点成功、creative 首次失败、重载后显式恢复和六节点全部产出。审计日志调用序列严格为 `1/1/1/1/2/1`；Phase 2/3/10 共 3 条 E2E 全部通过，无真实 AI 请求。

### Fresh verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Runtime / frozen install    | passed               |
| Root unit/integration tests | 459 passed, 0 failed |
| Playwright golden paths     | 3 passed, 0 failed   |
| Root format/typecheck/lint  | passed               |
| Root production build       | passed               |
| Prompt/rule-pack validation | passed               |
| `git diff --check`          | passed               |
| Real paid AI calls          | 0                    |

### Next action

1. 提交 Task 24 最终发布门禁与记录更新，GitHub 连通后推送待同步提交。
2. 进入 Task 25：只引用精确上游 revision/result/snapshot ID 的可追踪、可锁定运营方案。
