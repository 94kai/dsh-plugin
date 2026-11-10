import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function editorHarness(fetch, props = {}) {
  const source = (await readFile(new URL('./client.js', import.meta.url), 'utf8')).replace('    return {\n      inject:', '    globalThis.TestEditor = Editor;\n    return {\n      inject:');
  let module, cursor = 0;
  const states = [], refs = [], effects = [], cleanups = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return refs[index] ||= { current: initial }; },
    useEffect(effect) { const index = cursor++; if (!effects[index]) { effects[index] = true; cleanups.push(effect()); } },
  };
  const context = vm.createContext({ window: { __ModuleLoader__: { load: value => { module = value; } } }, document: { baseURI: 'https://example.test/' }, URL, AbortController, fetch });
  vm.runInContext(source, context); module.factory(() => React);
  const saved = [], closed = [];
  return {
    render() { cursor = 0; return context.TestEditor({ revision: 'a'.repeat(64), onSaved: data => saved.push(data), onClose: () => closed.push(true), ...props }); },
    saved, closed, unmount() { cleanups.forEach(cleanup => cleanup?.()); },
  };
}
const nodes = tree => [tree, ...tree.children.filter(child => child && typeof child === 'object').flatMap(nodes)];
function fill(harness, values) {
  for (const [index, value] of Object.entries(values)) {
    const fields = nodes(harness.render()).filter(node => ['input', 'textarea'].includes(node.type));
    fields[index].props.onChange({ target: { value } });
  }
}
const submit = harness => harness.render().props.onSubmit({ preventDefault() {} });

test('editor validates locally, retains failed input and sends a revision-protected command', async () => {
  const requests = []; let success = false;
  const harness = await editorHarness(async (url, options) => {
    requests.push(options);
    return Response.json(success ? { items: [], revision: 'b'.repeat(64) } : { error: '链接已更新，请刷新。' }, { status: success ? 200 : 409 });
  });
  fill(harness, { 0: '示例', 1: 'javascript:alert(1)' });
  await submit(harness); assert.equal(requests.length, 0);
  fill(harness, { 1: 'https://example.com', 3: '保留备注' });
  await submit(harness);
  assert.equal(nodes(harness.render()).find(node => node.type === 'textarea').props.value, '保留备注');
  assert.ok(nodes(harness.render()).some(node => node.props.role === 'alert' && node.children.includes('链接已更新，请刷新。')));
  const body = JSON.parse(requests[0].body); assert.equal(body.action, 'add'); assert.equal(body.revision, 'a'.repeat(64));
  assert.equal(requests[0].headers['X-Pocket-Kit'], '1');
  success = true; await submit(harness); assert.equal(harness.saved.length, 1);
  harness.unmount();
});
test('editor blocks duplicate submits and cancels pending request on unmount', async () => {
  let resolve, request, calls = 0;
  const harness = await editorHarness((url, options) => { calls++; request = options; return new Promise(done => { resolve = done; }); }, { item: { id: 'fixture', title: '示例', url: 'https://example.com' } });
  const pending = submit(harness); await submit(harness); assert.equal(calls, 1);
  assert.equal(JSON.parse(request.body).action, 'update');
  assert.ok(nodes(harness.render()).filter(node => node.type === 'button').every(node => node.props.disabled));
  harness.unmount(); assert.equal(request.signal.aborted, true);
  resolve(Response.json({ items: [], revision: 'b'.repeat(64) })); await pending;
  assert.equal(harness.saved.length, 0);
});
test('editor Escape closes without submitting', async () => {
  const harness = await editorHarness(() => { throw new Error('Unexpected save'); });
  harness.render().props.onKeyDown({ key: 'Escape', preventDefault() {} });
  assert.equal(harness.closed.length, 1); harness.unmount();
});
