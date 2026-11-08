import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { BillManagerModule } from '../features/bill-manager/backend.mjs';

// 只使用虚构数据，不读取私人账单、模板或配置。
test('bill export writes finite default row height without changing mapped cells', () => {
  const module = new BillManagerModule({ dataDir: '/unused-fixture' });
  const columns = ['日期', '收支类型', '金额', '类别', '二级分类', '所属账本', '收支账户', '备注'];
  module.sources = [
    { role: 'bill-template', columns, rows: [] },
    { role: 'wechat', columns: [], rows: [
      { id: 'fixture-out', values: { '交易时间': '2026-01-02 10:20:30', '收/支': '支出', '金额(元)': '12.34', '商品': '测试商品', '交易对方': '测试商店' } },
      { id: 'fixture-in', values: { '交易时间': '2026-01-01 09:00:00', '收/支': '收入', '金额(元)': '20', '商品': '测试收入', '交易对方': '测试付款方' } }
    ] }
  ];
  module.config.categoryRules = [{ keyword: '测试商品', primary: '测试分类', secondary: '测试子类' }];
  const preview = module.buildExportPreview().bills;
  const expected = [preview.columns, ...preview.rows.map(row => preview.columns.map(column => row[column] || ''))];
  const buffer = module.exportWorkbook();
  const workbook = XLSX.read(buffer, { type: 'buffer', bookFiles: true });
  assert.deepEqual(workbook.SheetNames, ['账单']);
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets['账单'], { header: 1, defval: '', raw: false }), expected);
  const xml = Buffer.from(workbook.files['xl/worksheets/sheet1.xml'].content).toString('utf8');
  const sheetFormat = xml.match(/<sheetFormatPr\b[^>]*>/)?.[0];
  assert.ok(sheetFormat, 'must write sheetFormatPr, not just per-row heights');
  const height = Number(sheetFormat.match(/defaultRowHeight="([^"]+)"/)?.[1]);
  assert.ok(Number.isFinite(height) && height > 0);
  assert.equal(height, 15);
  assert.match(sheetFormat, /outlineLevelRow="0"/);
});

test('alipay dates become year-month-day and keep rows and notes unchanged', () => {
  const module = new BillManagerModule({ dataDir: '/unused-fixture' });
  const columns = ['日期', '收支类型', '金额', '类别', '二级分类', '所属账本', '收支账户', '备注'];
  const alipayRow = (date, amount, way = '账户余额') => ({
    id: `row-${date}-${amount}`,
    values: { '交易时间': date, '收/支': '支出', '金额': amount, '商品说明': '测试商品', '交易对方': '测试商家', '交易分类': '餐饮美食', '收/付款方式': way }
  });
  module.sources = [
    { role: 'bill-template', columns, rows: [] },
    { role: 'alipay', columns: [], rows: [
      alipayRow('11/7/26', '12.87'),
      alipayRow('9/25/26', '81.00'),
      alipayRow('2026-10-02', '73.00'),
      alipayRow('12/31/26', '1.00'),
      alipayRow('10/12/26', '20.90', '招商银行储蓄卡(1077)')
    ] }
  ];
  module.accounts = { wechat: 'w', alipay: 'fixture alipay', cmb: 'c' };
  module.config.alipayFilterRules = [{ id: 'alipay-filter-1', keyword: '招商银行' }];
  const preview = module.buildExportPreview().alipay;
  assert.deepEqual(preview.rows.map(row => row['日期']), ['2026-11-07', '2026-09-25', '2026-10-02', '2026-12-31']);
  assert.deepEqual(preview.rows.map(row => row['金额']), ['12.87', '81.00', '73.00', '1.00']);
  assert.equal(preview.rows[0]['备注'], '测试商品 测试商家 餐饮美食');
  assert.deepEqual(preview.rows.map(row => row['收支账户']), Array(4).fill('fixture alipay'));
  assert.ok(preview.rows.every(row => /^\d{4}-\d{2}-\d{2}$/.test(row['日期'])));
});

test('cmb notes gain the matching alipay product only when the match is unique', () => {
  const module = new BillManagerModule({ dataDir: '/unused-fixture' });
  const columns = ['日期', '收支类型', '金额', '类别', '二级分类', '所属账本', '收支账户', '备注'];
  const alipayRow = (date, amount, item, way = '招商银行储蓄卡(1077)') => ({
    id: `alipay-${date}-${amount}-${item}`,
    values: { '交易时间': date, '收/支': '支出', '金额': amount, '商品说明': item, '交易对方': '测试商家', '交易分类': '生活服务', '收/付款方式': way }
  });
  const cmbRow = (date, amount, summary = '快捷支付') => ({
    id: `cmb-${date}-${amount}`,
    values: { '记账日期': date, '货币': 'CNY', '交易金额': amount, '联机余额': '1.00', '交易摘要': summary, '对手信息': '测试商户 123' }
  });
  module.sources = [
    { role: 'bill-template', columns, rows: [] },
    { role: 'alipay', columns: [], rows: [
      alipayRow('10/12/26', '20.90', '闲鱼寄件费A'),
      alipayRow('10/13/26', '5.00', '同额商品甲'),
      alipayRow('10/13/26', '5.00', '同额商品乙'),
      alipayRow('10/14/26', '7.00', '余额支付商品', '账户余额')
    ] },
    { role: 'cmb', columns: [], rows: [
      cmbRow('2026-10-12', '-20.90'),
      cmbRow('2026-10-13', '-5.00'),
      cmbRow('2026-10-14', '-7.00'),
      cmbRow('2026-10-15', '-9.00')
    ] }
  ];
  module.accounts = { wechat: 'w', alipay: 'fixture alipay', cmb: 'fixture cmb' };
  module.config.alipayFilterRules = [{ id: 'alipay-filter-1', keyword: '招商银行' }];
  const preview = module.buildExportPreview();
  const notes = Object.fromEntries(preview.cmb.rows.map(row => [row['日期'], row['备注']]));
  assert.equal(notes['2026-10-12'], '快捷支付 测试商户 123 支付宝：闲鱼寄件费A');
  assert.equal(notes['2026-10-13'], '快捷支付 测试商户 123', '同日期同金额两笔时不得猜测');
  assert.equal(notes['2026-10-14'], '快捷支付 测试商户 123', '非该卡付款的支付宝记录不参与');
  assert.equal(notes['2026-10-15'], '快捷支付 测试商户 123', '无对应支付宝记录时保持原备注');
  assert.deepEqual(preview.alipay.rows.map(row => row['金额']), ['7.00'], '招行付款的支付宝记录仍从支付宝导出中排除');
});
