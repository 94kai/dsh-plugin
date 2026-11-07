import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./view.js', import.meta.url), 'utf8');
// Define functions only. No React hooks, DOM, browser, network or speaker actions run.
const { createXiaoaiReadGate, xiaoaiReadbackAfterCommit } = vm.runInNewContext(`${source}\n({ createXiaoaiReadGate, xiaoaiReadbackAfterCommit });`, {});

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
