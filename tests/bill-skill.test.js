import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mountSkill, readSkill } from '../lib/skill-host.mjs';

const dir = fileURLToPath(new URL('../features/bill-manager/skill/', import.meta.url));

test('bill skill registers through the plugin provider', async () => {
  const factories = [];
  let effects = 0;
  mountSkill({
    effect: fn => { effects += 1; fn(); },
    skills: { registerProvider: fn => { factories.push(fn); return () => {}; } }
  }, { name: 'bill-organizer', dir });
  assert.equal(effects, 1);
  assert.equal(factories.length, 1);
  const provider = factories[0]();
  assert.equal(provider.name, 'pocket-kit');
  const candidates = await provider.list();
  assert.equal(candidates.length, 1);
  const [candidate] = candidates;
  assert.equal(candidate.name, 'bill-organizer');
  assert.equal(candidate.provider, 'pocket-kit');
  assert.equal(candidate.rank, 550);
  assert.ok(candidate.description.length > 10);
  assert.deepEqual(candidate.resourceBase, { kind: 'directory', path: dir.split('/').join('/') });
  const loaded = await provider.get(candidate, { signal: new AbortController().signal });
  assert.equal('rank' in loaded, false);
  assert.equal('locator' in loaded, false);
  assert.equal(loaded.content, readSkill(dir, 'bill-organizer').content);
  await assert.rejects(provider.get({ name: 'other' }, { signal: new AbortController().signal }));
});

test('bill skill keeps the operational rules that future sessions rely on', () => {
  const { content } = readSkill(dir, 'bill-organizer');
  for (const required of ['实付', '唯一', '临时支出', '招商', '支付宝', 'sheetFormatPr', 'updateConfig', '合并统计', 'exportWorkbook']) {
    assert.ok(content.includes(required), `skill 应包含 ${required}`);
  }
  assert.ok(!content.startsWith('---'), '注册内容应去掉 frontmatter');
});
