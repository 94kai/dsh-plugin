import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./view.js', import.meta.url), 'utf8');
const mediaStyles = await readFile(new URL('../media/client.js', import.meta.url), 'utf8');
// Define functions only. No React hooks, DOM, browser, network or speaker actions run.
const { createXiaoaiReadGate, xiaoaiReadbackAfterCommit } = vm.runInNewContext(`${source}\n({ createXiaoaiReadGate, xiaoaiReadbackAfterCommit });`, {});

test('single playlist exposes playback modes and removes the run queue controls', () => {
  assert.match(source, /\[\['sequence', '顺序播放'\], \['loop-all', '列表循环'\], \['loop-one', '单曲循环'\], \['shuffle', '随机播放'\]\]/);
  assert.match(source, /点某首从该曲开始；列表循环会回到第一首/);
  assert.match(source, /h\('h2', null, '播放列表'\)/);
  assert.match(source, /className: `pk-track\$\{current \? ' is-current' : ''\}`/);
  assert.match(source, /playAndRefresh\('search\/play', \{ keyword: searchedKeyword, path: song\.path, mode: playMode \}/);
  assert.match(source, /playAndRefresh\('favorites\/play', \{ path: song\.path, mode: playMode \}/);
  assert.doesNotMatch(source, /queue\/shuffle|queue\/jump|打乱列表|本次播放队列/);
});


test('volume applies on slider release without a separate apply button', () => {
  assert.match(source, /onPointerUp: commit, onKeyUp: commitKey/);
  assert.match(source, /onCommit\(value\)/);
  assert.doesNotMatch(source, /应用音量/);
});

test('hide stop control when idle and use three-second marquee', () => {
  assert.match(source, /currentTitle \? h\('div', \{ className: 'pk-actions' \},\s*button\('停止播放'/);
  assert.match(mediaStyles, /animation:pk-marquee 3s linear infinite alternate/);
  assert.doesNotMatch(mediaStyles, /animation:pk-marquee 9s/);
});

test('retired announcement merge and UI are absent', () => {
  assert.doesNotMatch(source, /xiaoaiCombinedHistory|collection\.announcements|清空旧版记录|item\.legacy/);
});

test('collection gate accepts only newest read for the current device', () => {
  const gate = createXiaoaiReadGate();
  const first = gate.begin('A'), second = gate.begin('A');
  assert.equal(gate.accepts(first, 'A'), false);
  assert.equal(gate.accepts(second, 'A'), true);
  assert.equal(gate.accepts(second, 'B'), false);
});

test('A-B-A selection cannot revive the first A response', () => {
  const gate = createXiaoaiReadGate();
  const oldA = gate.begin('A');
  gate.invalidate('B'); const requestB = gate.begin('B');
  gate.invalidate('A'); const newA = gate.begin('A');
  assert.equal(gate.accepts(oldA, 'A'), false);
  assert.equal(gate.accepts(requestB, 'A'), false);
  assert.equal(gate.accepts(newA, 'A'), true);
});

test('mutation and unmount invalidation reject reads issued before changes', () => {
  const gate = createXiaoaiReadGate();
  const beforeWrite = gate.begin('A'); gate.invalidate('A');
  assert.equal(gate.accepts(beforeWrite, 'A'), false);
  const afterWrite = gate.begin('A'); assert.equal(gate.accepts(afterWrite, 'A'), true);
  gate.invalidate(''); assert.equal(gate.accepts(afterWrite, 'A'), false);
});

test('failed readback does not reject or repeat an already committed real action', async () => {
  let sends = 0; const warnings = [];
  const run = async () => {
    sends++;
    await xiaoaiReadbackAfterCommit(async () => { throw new Error('Fixture readback failed'); }, error => warnings.push(error.message));
    return 'confirmed-sent';
  };
  assert.equal(await run(), 'confirmed-sent');
  assert.equal(sends, 1); assert.deepEqual(warnings, ['Fixture readback failed']);
});

test('readback success and teardown abort do not report false mutation failure', async () => {
  const warnings = [];
  assert.equal(await xiaoaiReadbackAfterCommit(async () => {}, error => warnings.push(error)), true);
  assert.equal(await xiaoaiReadbackAfterCommit(async () => { throw Object.assign(new Error('closed'), { name: 'AbortError' }); }, error => warnings.push(error)), false);
  assert.equal(warnings.length, 0);
});

test('UI gates owned collections and disables drafts while actions run', () => {
  assert.match(source, /collectionState\.profileId === selected && collectionState\.ready/);
  assert.match(source, /collectionGate\.current\.accepts\(ticket, selectedRef\.current\)/);
  assert.match(source, /if \(module === 'playback'.*invalidateCollection\(\)/);
  assert.match(source, /return h\('fieldset', \{ ref: rootRef, disabled: action\.busy/);
  assert.match(source, /setControlDraft\(null\); await readback/);
  assert.match(source, /setConfigDraft\(null\); await readback/);
  assert.match(source, /请仅刷新状态，不要重复操作/);
});

test('automation rule form defines its selected playlist before rendering', () => {
  const defined = source.indexOf('const ruleList = lists.find');
  const rendered = source.indexOf('const ruleForm = ruleOpen');
  assert.ok(defined > 0 && rendered > defined, 'ruleList must be declared before ruleForm is built');
});
