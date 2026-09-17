# Ecommerce AI Workbench

电商 AI 运营工作台是一个 Windows 优先、本地运行的中文电商运营工作台。它把商品建档、事实与 SKU、成本定价、促销测算、竞品分析、AI 内容、工作流、运营方案以及备份恢复放在同一个可追溯工作区中。

整个服务只绑定 `127.0.0.1`，不是公网托管服务，也不需要 Docker。业务数据、AI 密钥、日志和备份都保留在用户选定的本机工作区中。

## 0.1.0 发布候选验收

`0.1.0` 的规范验收路径从空白工作区开始，经可见界面完成：商品建档 → 事实确认 → SKU 与成本 → 竞品导入 → AI 策略和内容 → 定价 → 拼多多促销 → trace → 精确来源选择 → 运营方案锁定。锁定结果会在页面刷新和服务重启后保持相同来源与哈希；备份恢复场景另行验证损坏归档不改变旧工作区、成功恢复不携带源机器密钥。

自动化 AI 仅使用本机、确定性 fake provider。浏览器门禁拒绝非回环请求，provider 日志只记录任务名和商品 ID；它不读取真实 DeepSeek 密钥，也不会产生真实付费调用。最近一次代码级双平台基线是 [GitHub Actions 35084741641](https://github.com/Jax-0816/E-commerce-Operation-Workbench/actions/runs/35084741641)：Windows 与 Ubuntu 均从干净检出通过完整质量门禁和 6 条 Playwright 场景，Windows 另通过 Pester setup/start 验收。

当前非目标：淘宝/抖音促销计算、自动抓取平台数据、云端多用户协作、移动端原生应用、Windows 安装包或系统服务、把服务暴露到局域网/公网。内置拼多多规则仍要求人工复核后启用；未确认规则只展示钱流，不输出权威利润。

## 当前 v0.1 能力

- 商品、事实、SKU 和平台档案，包含归档与不可变历史。
- 精确金额、成本档案、目标利润定价、可解释 trace 和版本化历史。
- 平台能力、版本化规则包、确定性促销引擎和多 SKU 批量测算。内置拼多多规则包会安装但不会自动启用，需用户复核费率后显式激活。
- CSV/XLSX/粘贴竞品快照、市场洞察、卖点、标题、五图与详情页修订历史。
- 本地 DeepSeek 配置、版本化提示词、结构化验证、脱敏调用日志和事实证据守卫。
- 可恢复的持久化工作流 DAG，以及引用精确资产/财务/规则快照的可锁定运营方案。
- WAL 一致性便携备份、下次启动事务恢复、密钥排除和跨机器安全校验。
- 可行动运营总控台，直接汇总缺失成本、过期资产、最新亏损结果、规则风险及 AI/规则配置状态，并提供站内处理入口。
- 只读系统状态页、可信离线提示、顶层错误恢复、键盘跳转与 1440/720/390 宽度适配。

## 总控台、设置与离线边界

“工作台”首页的数据来自服务端只读聚合，不从页面商品列表猜测状态。每个风险数字只采用当前商品、已启用 SKU 和最新不可变结果；待处理项会链接到对应的商品、规则或 AI 页面。

“系统设置”只显示应用版本、本机回环绑定、AI 是否已配置、提示词数量和规则包摘要。它不会显示 API 密钥、工作区路径、进程信息、日志、提示词正文或规则正文；修改仍在 AI、规则和数据管理专页完成。

浏览器报告离线时，工作台只暂停需要公网的 DeepSeek 连接测试、AI 生成/重新生成以及工作流启动、恢复和节点重试。商品与事实 CRUD、已保存历史、AI 密钥保存/清除、成本定价、促销、竞品导入、规则、备份恢复、锁定、排序和工作流取消仍按本地能力开放。重新联网只恢复按钮，不会自动调用 AI 或消耗额度。

键盘用户首次按 `Tab` 可使用“跳到主要内容”；站内路径切换后焦点进入主内容，仅修改平台查询参数不会抢夺焦点。当前导航、禁用状态、离线状态和错误提示均提供文字及语义属性；窄屏表格在自身区域横向滚动，不推动整个页面。

## Windows 安装

需要 64 位 Windows 10/11、Git、PowerShell 7（`pwsh`）、Node.js `24.19.0`（支持范围 `>=24.19.0 <25`）和 pnpm `11.22.0`。

先克隆仓库并启用精确 pnpm 版本：

```powershell
git clone https://github.com/Jax-0816/E-commerce-Operation-Workbench.git
Set-Location .\E-commerce-Operation-Workbench
corepack enable
corepack prepare pnpm@11.22.0 --activate
```

然后运行幂等 setup：

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

setup 会校验精确工具链、冻结安装依赖、生产构建并初始化工作区。可以对同一工作区重复执行；它不会删除商品、密钥、资产、备份、规则状态或生成历史。

默认数据位置是 `%LOCALAPPDATA%\EcommerceWorkbench\workspace`。如需改用中文或带空格的目录，将完整路径作为一个参数传入。工作区必须位于源码仓库之外：

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\setup.ps1 `
  -WorkspacePath 'D:\电商数据\运营 工作台'
```

## 启动工作台

默认启动并在健康检查通过后打开浏览器：

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

默认地址是 [http://127.0.0.1:3210](http://127.0.0.1:3210)。使用自定义工作区时，setup 和 start 必须传入同一路径：

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\start.ps1 `
  -WorkspacePath 'D:\电商数据\运营 工作台' `
  -Port 3210
```

自动化或不需要打开浏览器时使用 `-NoBrowser`。重复启动会在 PID、端口、回环 URL、应用版本和健康响应全部匹配时复用已有进程。

发布验收已在从 GitHub 新克隆的中文/空格路径中执行两次 setup，并以独立中文/空格工作区启动生产服务。仓库不依赖 Bash 启动、符号链接、大小写敏感文件名或本机绝对路径，因此同一提交可直接在符合上述版本要求的 Windows 新机克隆使用。

## 数据与备份

源码与用户数据严格分离；不要把 workspace 放在克隆的仓库目录中。“数据管理”页面可创建便携 ZIP 备份、下载并在另一台机器上恢复。备份不包含 API 密钥、本机绝对路径、日志、SQLite WAL/SHM 或运行 marker。恢复在下次启动时事务生效，且不覆盖目标机器密钥。

## 安全排障

- `Unsupported runtime versions`：安装 Node.js 24.19.0，再重新执行 `corepack prepare pnpm@11.22.0 --activate`；不要跳过检查。
- `Production build is missing`：先重新运行 `scripts\setup.ps1`，不要手动复制 `dist` 或从其他机器下载构建产物。
- `Port ... is already in use`：选择另一个 `-Port`，或先正常结束占用端口的程序；不要批量终止所有 Node 进程。
- 健康检查超时：查看 workspace 下 `logs\workbench-server.out.log` 和 `logs\workbench-server.err.log`。日志不应包含密钥；不要在 issue 或聊天中粘贴 `.secrets.json`。
- 工作区锁或 marker 异常：先确认是否已有工作台进程。只有在对应 PID 已退出后，才可删除该 workspace 的过期 marker；不要删除数据库或整个 workspace。

## 开发与质量门禁

```powershell
node scripts/check-versions.mjs
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:prompts
pnpm validate:rule-packs
pnpm exec playwright install chromium
pnpm test:e2e
```

首次执行浏览器门禁前安装与锁文件匹配的 Playwright Chromium；Ubuntu CI 使用 `pnpm exec playwright install --with-deps chromium` 同时安装系统依赖。自动化测试使用每次运行唯一的临时工作区和 fake provider，不读取浏览器用户资料，也不会触发真实付费 AI 调用。贡献和安全说明见 [CONTRIBUTING.md](CONTRIBUTING.md)、[RULE_PACK_CONTRIBUTING.md](RULE_PACK_CONTRIBUTING.md)、[SECURITY.md](SECURITY.md) 和 [docs/adr](docs/adr)。
