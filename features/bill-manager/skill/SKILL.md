---
name: bill-organizer
description: 用随身工具箱“记账单”程序把微信/支付宝/招商银行账单转成记账软件可导入的 Excel，并结合拼多多、美团订单截图补全备注。用户发来账单文件（xlsx/csv/pdf）、订单截图，或要求“整理账单/转成记账格式/核对账单”时使用。
---

# 账单整理

## 何时用

用户发来微信账单（xlsx）、支付宝明细（csv）、招商银行流水（pdf），或拼多多/美团订单截图，并说“转一下”“整理账单”“补充备注”“核对这个月账单”。也可用于只要求核对金额的场景。

## 三条铁律

1. **不猜。** 金额或日期对不上就留空并列出，宁可少补不可错补。截图被“…”截断的商品名不补全。
2. **不碰正式数据。** 所有转换在临时目录跑，绝不写入 `.local/data/bill-manager/source/`（那是运行中插件的“当前账单”）。
3. **不自创分类。** 只用用户确认过的规则；没有就保留“临时支出/临时收入”。

## 程序在哪

| 内容 | 位置 |
|---|---|
| 转换与导出逻辑 | `features/bill-manager/backend.mjs`（`BillManagerModule`），不要另写一套映射 |
| 导出列定义 | `.local/data/bill-manager/source/模板_0925091713.xls`（`账单` sheet） |
| 规则配置 | `.local/data/bill-manager/config.json`（fieldRules / categoryRules / alipayFilterRules） |
| 账户名 | `.local/data/bill-manager/accounts.json`（微信/支付宝/招行） |
| 交付目录 | `.local/exports/`（已 gitignore，文件权限 0600） |

固定输出列：

```
日期 | 收支类型 | 金额 | 类别 | 二级分类 | 所属账本 | 收支账户 | 备注
```

- `所属账本` 固定“日常账本”；`收支账户` 取自 accounts.json（个人账户名只在私有配置里，不要写进代码或文档）。
- `类别` 先填“临时支出/临时收入”，再由 categoryRules 按顺序覆盖。
- 导出自动写 `defaultRowHeight=15`（否则 DSH 预览行高为 NaN、正文空白）。

## 来源识别

| 文件 | 判定 |
|---|---|
| 工作表名 `账单` 且首行含 `收支类型` | 账单模板（决定导出列） |
| 任意行含 `交易时间` + `交易单号` | 微信 |
| 任意行含 `交易时间` + `交易分类` + `交易订单号` | 支付宝（CSV 用 gb18030 解码） |
| `.pdf` | 招商银行（按文字坐标切列） |

## 标准流程

### 1. 跑转换（复制即用）

```js
import { mkdtemp, mkdir, copyFile, writeFile } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { BillManagerModule } from './features/bill-manager/backend.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'bill-run-'));
const t = path.join(dir, 'bill-manager');
await mkdir(path.join(t, 'source'), { recursive: true, mode: 0o700 });
for (const n of ['config.json', 'accounts.json'])
  await copyFile(path.join('.local/data/bill-manager', n), path.join(t, n));
await copyFile('.local/data/bill-manager/source/模板_0925091713.xls', path.join(t, 'source', '模板.xls'));
await copyFile(输入文件, path.join(t, 'source', '微信.xlsx'));   // 文件名随意，靠表头识别

const m = new BillManagerModule({ dataDir: dir });
await m.initialize();
const preview = m.buildExportPreview();      // { bills, alipay, cmb }
const bytes = m.exportWorkbook();            // 注意：会把所有来源合并进一个 sheet
await writeFile('.local/exports/xxx.xlsx', bytes, { mode: 0o600 });
await m.shutdown();
```

要**单来源**文件时，只放该来源文件（招商补商品时除外，见下节），或用预览行替换 `buildExportPreview` 后再 `exportWorkbook()`。

### 2. 必做核对（不通过不交付）

| 来源 | 核对基准 |
|---|---|
| 微信 | 表头“共 N 笔记录 / 收入 X 笔 / 支出 X 笔” |
| 支付宝 | 表头“共 N 笔 / 收入 / 支出 / 不计收支” |
| 招商 | PDF 末页“合并统计：合并收入 / 合并支出” |

条数和合计金额必须完全一致；不一致就停下排查坐标或表头识别，不要交付。

支付宝回单自带免责说明：明细直接累加可能与统计金额不同（遇到过差 900 元）。此时以明细为准，但在交付里明确写出差额和原因，不隐瞒。

### 3. 截图补充备注（拼多多 / 美团）

- 只按**实付**金额匹配，不用原价或划线价。
- **唯一命中才补**：同日同额多笔、多笔订单同额时一律不补，列出来让用户定。
- 备注格式：`拼多多｜店铺｜商品名｜实付46.8`；美团用 `美团｜…` 同构。
- 实现方式：把该行 `商品` 改成上述整串、`交易对方` 置空，程序拼接后就是干净备注；不要事后改 xlsx。
- 截图看不清的价格不要用，宁可漏。

### 4. 招商 ↔ 支付宝（顺序有依赖）

- 程序会把支付宝里“由该卡付款”的记录从支付宝导出中剔除（防止双记），并自动给招商备注追加 `支付宝：商品说明`。
- 匹配条件是**日期 + 金额都唯一**；同日同额多笔则不补。
- 用户只发招商、没发支付宝时，先提醒“需要支付宝明细才能补商品信息”。用户确认该期间确实没有支付宝记录后，才跳过。

### 5. 分类（与插件前端的关系）

- 插件前端“更多 → 分类规则 / 支付宝过滤”保存后，会通过 `PUT /category-rules`、`PUT /alipay-filter-rules` **写入 `.local/data/bill-manager/config.json`**。本流程每次运行都复制该文件，所以**前端新加的规则会自动被识别，不需要改 skill 或重启**。
- 前提是规则**已保存**（点了保存按钮）。只填了没保存的草稿不在 config.json 里。
- 不要读 Host 内存里的 `/status` 当规则来源，直接读文件；也不要把临时目录的 config 写回正式目录。
- 规则语义：`备注.includes(keyword)`，**按数组顺序首个命中**，命中后覆盖 `类别`/`二级分类`。
- **顺序敏感**：前端列表顺序就是匹配顺序，追加在后面的规则可能被前面的宽泛关键词吃掉（例如“停车”在“停车缴费”之前，但两者同归类时无所谓；换成不同类别就会失效）。新增规则后如发现没生效，先查是不是被前面的规则抢先命中。
- 新增类别必须由用户给出关键词 + 一级分类（可带二级）；不推断、不脑补。config 里已有的规则视为已确认，直接生效，不要清空。

### 6. 交付

`present` 生成的文件，并给出：条数、支出/收入合计、日期范围、分类分布、被过滤或未匹配的条目、需要用户确认的问题。

## 已知坑

1. **导出会合并所有来源**（bills + alipay + cmb 拼成一个 `账单` sheet）。要分来源交付必须隔离数据源。
2. **招行大额转账属于预期，不要处理**：`汇入汇款`/`转账汇款`（如大额整数进出、当日对冲）按程序逻辑计入收入/支出。用户已确认这是正常资金往来，**保留原样、不剔除、不标记、不反复询问**；只有用户当次明确要求才改。
3. **12306 规则失效**：关键词 `12306消费 中铁网络`，实际备注是 `12306 中铁网络`，命中不了。建议改用 `中铁网络`，但改用户配置前先问。
4. **日期格式**：微信保留完整时间 `2026-11-08 17:15:06`；支付宝原始是 `11/7/26`，程序已归一为 `2026-11-07`；招行原值 `2026-09-25`。
5. **预览空白**：DSH 预览器遇到没写默认行高的 xlsx 会算出 NaN 行高，正文不显示。`exportWorkbook()` 已写 `sheetFormatPr defaultRowHeight="15"`；新文件仍空白就查这个字段。
6. **招行 PDF 靠坐标硬切**：日期 `x<90`，列边界 90/145/225/300/410/590。版式一变就错行，必须用“合并统计”复核。
7. **微信拼多多行**：`交易对方=拼多多`，`商品=商户单号XP...`，商品信息只能靠截图补。
8. **支付宝去重**：付款方式含“招商银行”的记录被 `alipayFilterRules` 剔除，但仍是招商备注的来源；两边要能一一对上才算对。
9. **不要用 `updateConfig()`**：它是死代码，调用会清掉 categoryRules/alipayFilterRules。

## 验证

```bash
node --test tests/bill-export.test.js && npm run check
```

## 边界

- 除非用户明确要求，不做浏览器实页验证、不截图。
- 不修改 DSH 内置预览插件；预览问题优先在导出端规避。
- 账单内容属于私人数据：不写进源码、文档、测试快照、日志或提交记录。
