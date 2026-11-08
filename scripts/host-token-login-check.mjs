// Isolated regression: never reads live credentials or starts a server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
const target = process.argv[2];
assert(target, 'Pass the installed client-connection lib/index.js path');
const source = await fs.readFile(target, 'utf8');
const section = source.slice(source.indexOf('const AUTH_RECORD_KEY ='), source.indexOf('//#region lib/types/rpc.js'));
const context = vm.createContext({ ...crypto, Buffer, Headers, URL, credentialKey: () => 'fixture' });
vm.runInContext(section + '\nglobalThis.TestBrowserAuth = BrowserAuth;', context);
const auth = new context.TestBrowserAuth({}, crypto.randomBytes(32), 30);
const call = (url, accept = 'text/html', method = 'GET', cookie) => {
  const result = {};
  const headers = { host: 'fixture.invalid', accept, ...(cookie ? { cookie } : {}) };
  result.allowed = auth.authorizeIndex({ url, method, headers }, {
    writeHead(status, headers) { result.status = status; result.headers = headers; },
    end(body) { result.body = body; }
  }, true);
  return result;
};
const login = call('/');
assert.equal(login.status, 401);
assert.match(login.headers['content-type'], /text\/html/);
assert.match(login.body, /登录 DSH/);
assert(!login.body.includes(auth.launchToken));
const inline = login.body.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(inline);
assert(login.headers['content-security-policy'].includes(crypto.createHash('sha256').update(inline).digest('base64')));
assert.equal(call('/', 'text/html', 'HEAD').body, undefined);
assert.equal(call('/', 'text/plain').body.startsWith('dsh web authentication required'), true);
assert.match(call('/api', 'text/html').headers['content-type'], /text\/plain/);
assert.match(call('/connect?token=wrong', 'text/html').headers['content-type'], /text\/plain/);
assert.equal(call('/?token=wrong', 'text/plain').status, 401);
assert.equal(call('/?token=wrong&token=wrong', 'text/plain').status, 401);
const signed = call('/?token=' + auth.launchToken, 'text/plain');
assert.equal(signed.status, 303);
assert.equal(signed.headers.location, './');
assert.match(signed.headers['set-cookie'], /HttpOnly; SameSite=Strict; Secure/);
const cookie = signed.headers['set-cookie'].split(';')[0];
assert.equal(call('/', 'text/html', 'GET', cookie).allowed, true);
assert.equal(call('/', 'text/html', 'GET', cookie + 'tampered').status, 401);
console.log('PASS: login, invalid/duplicate token, signed/tampered cookie, HEAD, API isolation, CSP, Strict/Secure');

const require = createRequire(path.join(os.homedir(), 'tools/pocket-kit-preview/browser-tools/package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: path.join(os.homedir(), 'tools/pocket-kit-preview/browser/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell') });
const screenshots = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-token-login-'));
try {
  for (const colorScheme of ['light', 'dark']) for (const width of [320, 375, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, colorScheme,
      userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
    const page = await ctx.newPage();
    const errors = [];
    let mode = 'invalid';
    page.on('pageerror', error => errors.push(error.message));
    const trace = [];
    page.on('console', message => { if (message.type() === 'error') trace.push(message.text().replaceAll(auth.launchToken, '[fixture]')); });
    await ctx.route('https://fixture.invalid/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      trace.push({ mode, nav: request.isNavigationRequest(), path: url.pathname, hasToken: url.searchParams.has('token') });
      if (request.isNavigationRequest()) {
        if (mode === 'success') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<h1>已登录</h1>' });
        return route.fulfill({ status: login.status, headers: login.headers, body: login.body });
      }
      assert.equal(url.searchParams.get('token'), auth.launchToken);
      assert.equal(url.origin, 'https://fixture.invalid');
      assert.equal(request.headers().referer, undefined);
      if (mode === 'offline') return route.abort();
      return route.fulfill({ status: mode === 'success' ? 200 : 401, contentType: 'text/plain', body: '' });
    });
    await page.goto('https://fixture.invalid/');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert((await page.locator('button').boundingBox()).height >= 44);
    await page.screenshot({ path: path.join(screenshots, `${width}-${colorScheme}.png`) });
    await page.locator('#token').fill(auth.launchToken);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'token 无效或已更新' }).waitFor();
    assert.equal(await page.locator('#token').inputValue(), auth.launchToken);
    mode = 'offline';
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '连接失败或超时' }).waitFor();
    mode = 'success';
    // A pasted URL must only supply a token, never control the destination.
    await page.locator('#token').fill('https://other.invalid/?token=' + auth.launchToken);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    try {
      await page.getByRole('heading', { name: '已登录', exact: true }).waitFor({ timeout: 5000 });
    } catch (error) {
      console.error('Success navigation diagnostics:', { url: page.url(), state: await page.evaluate(() => ({ heading: document.querySelector('h1')?.textContent, status: document.querySelector('#status')?.textContent, disabled: document.querySelector('button')?.disabled, empty: document.querySelector('input')?.value.length === 0 })), trace, errors });
      throw error;
    }
    assert.equal(page.url(), 'https://fixture.invalid/');
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(`PASS: Android ${width}px ${colorScheme}; CSP, layout, failed/offline/success login, pasted URL, no token storage`);
  }
} finally { await browser.close(); }
console.log('Screenshots: ' + screenshots);
