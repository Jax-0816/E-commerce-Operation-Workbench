# Findings & Decisions

## Requirements

- 根据当前真实进度列出完整后续计划。
- 将计划持久化在项目中，后续持续按计划执行并更新。
- 最终目标是完善整个本地电商 AI 运营工作台，而不是只完成当前页面。

## Research Findings

- 真正的应用代码位于 `.worktrees/codex-phase-0`，分支 `codex/phase-0` 与 `origin/main` 同步；外层主目录主要保存早期文档。
- 已完成原计划 Task 1–11；下一项是 Task 12“安全公式 AST 与依赖 DAG”。
- 现有 UI 已覆盖商品建档、商品事实、SKU 矩阵和三个平台的独立档案。
- `packages/calculation-engine` 已有 Money、Rate、Rounding、Trace，但尚无公式 DAG、成本/定价垂直切片。
- 后续未实现能力包括：规则包、促销、AI provider、竞品、洞察、标题、创意、详情、持久工作流、运营方案、备份恢复、Windows 交付和最终验收。
- 旧 README 仍自述为 Phase 0，旧实施计划复选框也没有更新；二者不能作为当前进度依据。
- 本机终端版本为 Node 26.4.0 / pnpm 11.19.0，而项目要求 Node 24.19.0 / pnpm 11.22.0。
- 已用临时工作区启动前后端：健康检查正常，网页可加载，总控台对未实现能力有明确说明。
- 已在 `/private/tmp` 准备 Node 24.19.0 与 pnpm 11.22.0；Node 官方 SHA-256 校验一致，项目版本检查与冻结安装通过。
- Task 12 的 AST 白名单必须完整覆盖 add/subtract/multiply/divide、min/max、round/ceil/floor、if 和 compare；未知变量、零除、循环、过深/过大 AST 必须拒绝。
- 公式值采用精确有理数中间表示，字面量使用十进制整数字符串表示 numerator/denominator，避免 JSON 数字和浮点精度进入权威计算。
- `evaluateFormula` 的变量边界保持 `ReadonlyMap<string, Money>`；所有 Money 变量必须同币种，无变量公式默认 CNY，最终通过显式 rounding policy 转换为 Money。
- DAG 定义从公式 AST 中提取对其他定义名的引用；外部输入变量不属于 DAG 节点，独立节点按输入顺序稳定输出。
- 现有性质测试不引入 fast-check，而是在确定性整数范围内枚举输入；Task 12 延续该风格以保持依赖最小和结果可复现。
- 局部 `round` 使用调用者传入的显式舍入策略；`ceil`/`floor` 固定各自语义；公式最终输出仍执行一次显式舍入。
- 条件表达式必须短路，只求值被选中的分支，避免未选分支的缺失变量或零除影响结果。
- Task 12 的依赖排序最终使用按原始索引优先的稳定 Kahn 排序：只把同批定义中的变量视为图边，外部输入保留为运行时变量；排序失败后用 DFS 返回完整闭环路径。
- Task 12 最终门禁覆盖 calculation-engine 的 63 项测试及全仓 244 项测试，根级类型检查、lint、build 和格式检查均通过。
- 独立审查暴露了原始 schema 保留 `toJSON`、无界 BigInt 和 DFS 非稳定排序三个边界问题；最终改为安全预检后 strict Zod 克隆、128/4096 位资源预算和按输入索引优先的 Kahn 排序，复核无阻塞问题。
- GitHub 默认 HTTPS 路由失败是 IPv6 路径问题；`curl -4` 与按 GitHub IPv4 定向的 Git 命令正常，现有系统钥匙串凭据可完成推送，无需新建 SSH key 或令牌。
- Task 13 必须把成本档案绑定到 SKU；成本项至少区分固定、按件、按订单、按收入百分比和安全公式，并显式保存 `confirmed` / `estimated` / `missing` 输入状态。
- 定价引擎必须保持纯函数且不访问数据库，输入/输出复用 calculation-engine 的 Money、精确舍入和 trace；持久化结果采用新增不可变记录，输入变化创建新 scenario/result。
- 当前数据库迁移最新为 `0004_add-platform-profiles.sql`，Task 13 应新增 `0005_*`，并沿用 UUID v7、STRICT 表、外键、CHECK、索引及真实 SQLite 集成测试模式。
- 当前 API 垂直切片固定为 domain repository interface → database adapter → application use case → Zod contracts → Fastify route → React feature/router；Task 13 需沿用该组合根显式注入方式。
- Task 13 的纯引擎把当前无促销场景中的 campaign price、consumer payment、recognized revenue 和 merchant settlement 视为同一候选价格；Task 16 的促销引擎再负责拆分这些资金流。
- 毛利按 recognized revenue 减 cost_of_goods，净利再扣 operating 成本；目标利润和两类利润率都用精确整数不等式验证候选，避免先计算浮点比例。
- 定价方案与结果必须在同一 SQLite `BEGIN IMMEDIATE` 事务中追加；结果主键或外键失败时回滚方案，避免不可变历史中留下孤立半成品。
- Task 13 前端沿用商品路由但在页面内选择已启用 SKU；成本档案保存 revision，价格实验室展示可信状态、建议价、利润指标、计算轨迹和不可变历史。
- 重连后优先使用 Codex bundled Node 24.19.0；pnpm 11.22.0 可临时安装到 `/private/tmp`，不改系统 Node/pnpm。
- 任意安全公式不保证目标谓词单调；Task 13 solver 最终在最多 100,000 分的搜索窗内升序穷举以保证全局最小价，并用“候选数 × 求解次数 × 成本/公式节点复杂度”不超过 2,000,000 的复合预算保护 Fastify 同步事件循环。
- 定价公式变量严格限制为 campaign price、consumer payment、recognized revenue、merchant settlement；公共 solver 与 API 路径共享节点、变量和工作预算校验，不存在旁路。
- SKU/商品异步请求必须以 request generation 和当前身份双重校验；切换时立即清空旧状态并使旧保存/计算失效，避免跨 SKU 覆盖和永久 loading/saving 状态。
- 平台引擎使用规范 ID `pinduoduo` / `taobao_tmall` / `douyin_ecommerce`，并把旧数据与 URL 的 `taobao` / `douyin` 作为显式别名；两种 API 标识返回同一规范结果。
- Task 15 规则快照落地前，拼多多 `promotion` 和 `fee_model` 始终为 `requires_rule_pack`；平台 context 不接受调用方自证能力完整。
- 能力响应合同必须按平台 ID 判别并锁定允许状态；仅校验 `status` 与 `available` 自洽不足以防止跨平台伪造支持。
- 平台档案保存除身份校验外还需递增 sequence；身份 ABA 切换会让仅比较 product/platform 的旧请求重新匹配。
- 规则包 checksum 覆盖排除 `manifest.checksum` 后的 manifest 与 rules 规范 JSON；对象键排序、数组顺序保留，从而让 JSON 文本排版不影响完整性校验。
- ZIP 规则包在解压前校验中央目录、路径、扩展名、加密/压缩方法、条目数与解压大小，解压后再校验 CRC32；不接受可执行文件或 traversal 路径。
- 拼多多公开帮助/规则入口无法支撑一个可稳定覆盖全类目与活动的通用费率；默认包仅保存官方来源和 `null + needs_review`，不把历史活动费率冒充当前通用规则。
- SQLite 通过 partial unique index 保证每个平台/区域只能有一个 active 规则包；激活操作在 `BEGIN IMMEDIATE` 内先停用旧版本再启用目标版本。
- 用户覆盖以平台/区域/规则 key 唯一并递增 revision；规则快照同时由 SQLite trigger 禁止更新/删除，并在读取时复算 hash 与校验完整结构。
- 加载器返回的 `sourceFormat` 只用于导入诊断；仓储明确挑选 `manifest`/`rules` 后再严格解析，既不误拒绝已验证输入，也不持久化额外字段。
- 浏览器规则管理页只显示服务端真实安装状态；导入支持受限 JSON/ZIP，差异结果只展示规则 key 和结构化变更，不执行或渲染规则内容。
- 促销组件按 `priority + key` 稳定排序，门槛统一相对活动价判断；百分比折扣按当前消费者应付逐项计算，因此相同输入、组件集合和舍入策略可稳定复现相同轨迹。
- 商家承担优惠同时降低消费者应付与商家实收，平台承担优惠只降低消费者应付；核心恒等式为 `商家实收 = 消费者应付 + 平台承担优惠`，确认收入等于商家实收。
- 活动价门槛、封顶和逐项舍入会形成离散跳变，不能安全假设单调；Task 16 solver 在最多 100,000 分的显式窗口中升序穷举，返回满足最低实收的全局最低活动价或明确无解。
- 工作区持久锁的 owner 文件会在并发抢占时被另一进程原子改名；目录扫描后读取文件遇到 `ENOENT` 属于瞬时状态，应重新扫描锁目录而非把正常竞争误报为 I/O 故障。
- 促销批算必须先固定规则快照，再让每条结果分别绑定 SKU、成本 revision、引擎版本、输入和 trace；批次失败时场景与结果应在同一事务中整体回滚。
- 默认拼多多规则包的佣金、技术服务费与补贴归因仍是 `needs_review`，因此 Task 17 只能给出确定性资金流，不能给出伪精确利润或保本点。
- 定价引擎的四资金流输入必须保持彼此独立；平台补贴降低消费者应付但不降低商家实收，费用基数仍按各自规则选择。
- 浏览器真实验收确认促销页已支持多 SKU 选择、商家/平台券、六项关键指标、逐步 trace 和不可变历史，不再显示占位内容。

## Technical Decisions

| Decision                                        | Rationale                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 继续采用本地优先模块化单体                      | 与现有架构一致，减少部署和数据安全复杂度                                                                  |
| 纯计算引擎先于持久化/UI                         | 财务规则可独立验证并保持确定性                                                                            |
| 规则快照先于促销结果                            | 历史财务结果必须绑定当时规则版本                                                                          |
| Prompt compiler 先于 AI provider                | 先固定信任边界、版本和输出结构                                                                            |
| 内容资产采用不可变修订与 stale 标记             | 防止重生成覆盖用户锁定成果                                                                                |
| fake provider 作为自动测试默认                  | 保证可重复、无付费调用和无密钥依赖                                                                        |
| master plan + task/findings/progress 四文件机制 | 同时满足稳定范围、当前状态、知识和执行证据的长期维护                                                      |
| Task 12 限制 AST 深度 32、节点数 256            | 在表达能力和拒绝资源耗尽之间给出确定性边界                                                                |
| Task 12 使用 Zod 公开 `FormulaNodeSchema`       | 与仓库契约校验技术栈一致，并给后续规则包提供统一解析边界                                                  |
| Task 12 使用 BigInt 有理数作为中间值            | 避免浮点误差和固定整数上限；最终只在显式舍入策略边界转换为 Money                                          |
| Task 13 先交付纯 pricing-engine 再接垂直切片    | 先锁定可验证的财务语义，避免 UI/持久化反向污染权威计算                                                    |
| Task 13 solver 采用有工作预算的升序穷举         | 安全公式可构造非单调和单点有效窗口，二分/阈值分区不能保证最低有效价；有界穷举以可证明正确性换取受控计算量 |
| 平台能力合同采用按平台判别的固定矩阵            | 使服务端、客户端和测试都无法把淘宝/抖音促销伪装为可用                                                     |
| Task 16 采用稳定顺序和显式资方钱流恒等式        | 防止组件输入顺序、平台补贴和重复扣减造成不可复现或错误确认收入                                            |
| Task 16 solver 采用 100,000 分内升序穷举        | 门槛、封顶和舍入产生离散跳变；有界穷举保证返回全局最低满足值且同步计算量可控                              |
| Task 17 在批算前固定规则与成本 revision         | 保证历史结果可复现，后续规则或成本修改不会反向改写已有财务结论                                            |
| 不完整平台规则只输出钱流、不输出利润            | 未确认的佣金、服务费和补贴归因不能被默认值掩盖，避免用户把估算误当权威结果                                |

## Issues Encountered

| Issue                                               | Resolution                                      |
| --------------------------------------------------- | ----------------------------------------------- |
| graphify 知识图陈旧且只覆盖设计文档                 | 保留为架构参考，当前进度以源码/提交/测试为准    |
| 根级 `pnpm test` 受工具链版本与依赖准备影响         | 不宣称完整门禁通过；实施前恢复精确工具链        |
| 根目录直接运行全部 Vitest 会破坏 workspace cwd 假设 | 后续只用 package scripts 或明确的 workspace cwd |

## Resources

- `docs/superpowers/specs/2026-08-19-ecommerce-ai-workbench-design.md`
- `docs/superpowers/plans/2026-08-19-ecommerce-ai-workbench-implementation.md`
- `docs/superpowers/plans/2026-08-24-phase-2-usability-closeout.md`
- `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md`
- `task_plan.md`
- `progress.md`

## Visual/Browser Findings

- 2026-08-31 页面标题为“电商运营工作台”，入口包含工作台、商品库、新建商品、内容资产、平台与规则、AI 设置、数据管理和系统设置。
- 临时空工作区显示 0 个商品，并引导创建商品；商品事实、SKU 和平台档案被呈现为真实工作流入口。
- “生成运营方案”明确禁用并标注 Phase 10；成本与财务明确标注 Phase 3，不会生成伪结果。
- 页面和 API 均可通过 `127.0.0.1` 访问。
- 2026-09-01 Phase 3 Playwright 黄金路径已覆盖：创建商品/SKU、建立 SKU 成本档案、计算目标单件利润、展示 `verified` 建议价与净利润、显示计算轨迹并追加不可变历史。
- 2026-09-02 Task 17 页面已在应用内浏览器打开并验证：双栏促销配置、多 SKU 批算、资金流指标、风险提示、trace 与重启后历史均来自真实 API。
