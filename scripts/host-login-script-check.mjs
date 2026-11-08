// Non-browser regression for the login page's inline script.
// Covers the reported "any token works" bug and the auto-enter probe using a
// mock DOM and stubbed fetch; no network, browser or real credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as crypto from 'node:crypto';

const target = process.argv[2];
assert(target, 'Pass installed client-connection lib/index.js');
const source = await fs.readFile(target, 'utf8');
assert(!source.includes('dsh-auth-diagnostic'), 'temporary diagnostics must not be present');
assert(!source.includes('SameSite=Lax'), 'temporary Lax experiment must not be present');

const context = vm.createContext({ ...crypto, Buffer, Headers, URL, credentialKey: () => 'fixture', console: { info() {} } });
const section = source.slice(source.indexOf('const AUTH_RECORD_KEY ='), source.indexOf('//#region lib/types/rpc.js'));
vm.runInContext(section + '\nglobalThis.TestBrowserAuth = BrowserAuth;', context);
const auth = new context.TestBrowserAuth({}, crypto.randomBytes(32), 30);

const result = {};
auth.authorizeIndex({ url: '/', method: 'GET', headers: { host: 'fixture.invalid', accept: 'text/html' } }, {
  writeHead(status, headers) { result.status = status; result.headers = headers; },
  end(body) { result.body = body; }
}, true);
assert.equal(result.status, 401);
assert(result.status, 'login page must keep 401');
assert.equal(result.status, 401);
const inline = result.body.match(/<script>([\s\S]*?)<\/script>/)[1];
assert(result.headers['content-security-policy'].includes(crypto.createHash('sha256').update(inline).digest('base64')), 'CSP hash mismatch');

// Server half: only a matching token is reported as verified, and the cookie
// still gates the app.
const authority = 'https://fixture.invalid';
const call = (url, accept = 'text/plain', method = 'GET', cookie) => {
  const out = {};
  out.allowed = auth.authorizeIndex({ url, method, headers: { host: 'fixture.invalid', accept, ...(cookie ? { cookie } : {}) } }, {
    writeHead(status, headers) { out.status = status; out.headers = headers; },
    end(body) { out.body = body; }
  }, true);
  return out;
};
const signed = call('/?token=' + auth.launchToken);
assert.equal(signed.status, 303);
assert.equal(signed.headers.location, './?dsh-token-auth=verified');
assert.match(signed.headers['set-cookie'], /HttpOnly; SameSite=Strict; Secure/);
const cookie = signed.headers['set-cookie'].split(';')[0];
assert.equal(call('/?token=wrong').status, 401);
const wrongWithSession = call('/?token=wrong', 'text/plain', 'GET', cookie);
assert.equal(wrongWithSession.status, 303);
assert.equal(wrongWithSession.headers.location, './');
assert.equal(wrongWithSession.headers['set-cookie'], undefined, 'a bad token must not mint a cookie');
assert.equal(call('/', 'text/plain', 'GET', cookie).allowed, true);
assert.equal(call('/', 'text/plain', 'GET', cookie + 'tampered').status, 401);
assert.equal(call('/', 'text/html', 'HEAD').body, undefined);
assert.match(call('/api', 'text/html').headers['content-type'], /text\/plain/);
assert.match(call('/connect?token=wrong', 'text/html').headers['content-type'], /text\/plain/);

const HOME = 'https://fixture.invalid/';

function makePage(routes = []) {
  const state = { replaced: [], fetched: [], pending: new Map(), nextTimer: 1, routes: [...routes], focused: false };
  const element = (extra = {}) => ({ disabled: false, className: '', textContent: '', value: '', focus() { state.focused = true; }, ...extra });
  const form = element();
  const input = element();
  const button = element();
  const status = element();
  const nodes = new Map([['form', form], ['#token', input], ['button', button], ['#status', status]]);
  form.addEventListener = (type, handler) => { assert.equal(type, 'submit'); state.submit = handler; };
  const ctx = vm.createContext({
    URL,
    AbortController,
    document: { querySelector: selector => nodes.get(selector) ?? null },
    location: { href: HOME, replace(url) { state.replaced.push(url); } },
    fetch: async (url) => {
      state.fetched.push(url);
      const route = state.routes.shift();
      assert(route !== undefined, 'unexpected fetch: ' + url);
      if (route instanceof Error) throw route;
      return route;
    },
    setTimeout(fn) { const id = state.nextTimer++; state.pending.set(id, fn); return id; },
    clearTimeout(id) { state.pending.delete(id); },
    localStorage: { get length() { throw new Error('localStorage must not be used'); } },
    sessionStorage: { get length() { throw new Error('sessionStorage must not be used'); } }
  });
  vm.runInContext(inline, ctx);
  state.submitEvent = () => state.submit({ preventDefault() {} });
  state.runPending = () => { const fns = [...state.pending.values()]; state.pending.clear(); fns.forEach(fn => fn()); };
  return { state, input, button, status };
}

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const response = (url, status = 200) => ({ ok: status < 400, status, url });

// 1. No session: the probe gets the 401 login response and leaves the form usable.
{
  const page = makePage([response(HOME, 401)]);
  await flush();
  assert.equal(page.state.replaced.length, 0);
  assert.equal(page.status.textContent, '');
}

// 2. The reported UX fix: a valid session enters automatically, no token typed.
{
  const page = makePage([response(HOME, 200)]);
  await flush();
  assert.deepEqual(page.state.fetched, ['./']);
  assert.deepEqual(page.state.replaced, [HOME]);
  assert.match(page.status.textContent, /已有登录状态/);
}

// 3. Probe network failure keeps the form available.
{
  const page = makePage([new TypeError('offline')]);
  await flush();
  assert.equal(page.state.replaced.length, 0);
  assert.equal(page.status.textContent, '');
}

// 4. Empty input never reaches the server.
{
  const page = makePage([response(HOME, 401)]);
  await flush();
  page.input.value = '   ';
  await page.state.submitEvent();
  assert.match(page.status.textContent, /请填写 token/);
  assert.equal(page.state.fetched.length, 1, 'only the probe ran');
}

// 5. Invalid token without a session keeps the truthful error.
{
  const page = makePage([response(HOME, 401)]);
  await flush();
  page.state.routes.push(response(HOME, 401));
  page.input.value = 'wrong';
  await page.state.submitEvent();
  assert.match(page.status.textContent, /登录失败：token 无效或已更新/);
  assert.equal(page.state.replaced.length, 0);
}

// 6. REGRESSION: wrong token while the browser already holds a valid cookie.
//    The server ignores the bad token and answers 200; this must not be
//    reported as "token accepted".
{
  const page = makePage([response(HOME, 401)]);
  await flush();
  page.state.routes.push(response(HOME, 200));
  page.input.value = 'abc';
  await page.state.submitEvent();
  assert.match(page.status.textContent, /本次 token 未通过验证/);
  assert.match(page.status.textContent, /已有有效登录状态/);
  assert.equal(page.state.replaced.length, 0, 'must not navigate before the notice');
  assert.equal(page.input.value, '');
  page.state.runPending();
  assert.deepEqual(page.state.replaced, [HOME]);
}

// 7. Genuine server-verified token uses the marker and navigates at once.
{
  const page = makePage([response(HOME, 401)]);
  await flush();
  page.state.routes.push(response(HOME + '?dsh-token-auth=verified', 200));
  page.input.value = 'real-token';
  await page.state.submitEvent();
  assert.equal(page.status.textContent, '');
  assert.deepEqual(page.state.replaced, [HOME]);
}

// 8. Pasted full login URL only supplies the token; origin stays the same.
{
  const page = makePage([response(HOME, 401)]);
  await flush();
  page.state.routes.push(response(HOME + '?dsh-token-auth=verified', 200));
  page.input.value = 'https://elsewhere.invalid/path?token=real-token';
  await page.state.submitEvent();
  const requested = new URL(page.state.fetched[1]);
  assert.equal(requested.origin, 'https://fixture.invalid');
  assert.equal(requested.searchParams.get('token'), 'real-token');
  assert.deepEqual(page.state.replaced, [HOME]);
}

// 9. A token containing the marker name cannot forge it.
{
  const page = makePage([response(HOME, 401)]);
  await flush();
  page.state.routes.push(response(HOME, 200));
  page.input.value = 'x&dsh-token-auth=verified';
  await page.state.submitEvent();
  const requested = new URL(page.state.fetched[1]);
  assert.equal(requested.searchParams.get('dsh-token-auth'), null);
  assert.equal(requested.searchParams.get('token'), 'x&dsh-token-auth=verified');
  assert.match(page.status.textContent, /本次 token 未通过验证/);
}

// 10. Network failure while submitting keeps input and offers a retry.
{
  const page = makePage([response(HOME, 401)]);
  await flush();
  page.state.routes.push(new TypeError('offline'));
  page.input.value = 'real-token';
  await page.state.submitEvent();
  assert.match(page.status.textContent, /连接失败或超时/);
  assert.equal(page.input.value, 'real-token');
  assert.equal(page.button.disabled, false);
}

// 11. No navigation URL ever carries the token.
{
  const page = makePage([response(HOME, 200)]);
  await flush();
  for (const url of page.state.replaced) assert.equal(new URL(url).searchParams.get('token'), null);
}

console.log('PASS: auto-enter on valid session, 401 fallback, empty/401/wrong-token-with-session, verified token, pasted URL, marker forgery, network failure, no token in navigation, no web storage.');
