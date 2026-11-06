import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { XiaoAiMusicModule, XiaoAiAssistantModule } from './index.mjs';
import { privateBindHost } from './storage.mjs';

const fixtureProfile = { id: 'speaker-a', name: 'Fixture speaker', ws_port: 4399, api_port: 18180, musicPort: 18080, baseUrl: 'http://127.0.0.1:18080', musicDirs: ['/fixture/music'], volume: 30 };
async function fixture(t, { profile = fixtureProfile, library } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pocket-kit-xiaoai-'));
  t.after(async () => { assert.equal(resolve(directory).startsWith(resolve(tmpdir()) + '/pocket-kit-xiaoai-'), true); await rm(directory, { recursive: true, force: true }); });
  await mkdir(join(directory, 'xiaoai-music'));
  await writeFile(join(directory, 'xiaoai-music/config.json'), JSON.stringify({ profiles: [profile] }));
  if (library) await writeFile(join(directory, 'xiaoai-music/library.json'), JSON.stringify(library));
  const music = new XiaoAiMusicModule({ projectDir: directory, dataDir: directory });
  await music.initialize();
  t.after(() => music.dispose());
  const assistant = new XiaoAiAssistantModule({ dataDir: directory, xiaoAiMusic: music });
  await assistant.initialize();
  return { directory, music, assistant };
}
async function request(module, path, method = 'GET', payload) {
  const req = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]); req.method = method;
  let status, headers, result;
  const res = { writeHead(code, fields) { status = code; headers = fields; }, end(value) { result = JSON.parse(String(value)); } };
  const handled = await module.handle(req, res, new URL(path, 'http://fixture.invalid'));
  return { status, headers, result, handled };
}
const base = '/api/modules/xiaoai-music/profiles/speaker-a';

test('initialize is read-only and never starts workers or writes defaults', async t => {
  const { directory, music, assistant } = await fixture(t);
  assert.deepEqual(await readdir(join(directory, 'xiaoai-music')), ['config.json']);
  assert.deepEqual(await readdir(directory), ['xiaoai-music']);
  assert.equal(music.children.size, 0);
  assert.equal(assistant.state.controls.length, 0);
  assert.equal(music.moduleDir.includes('/features/xiaoai'), true);
});

test('missing entire data directory remains absent after initialize', async t => {
  const { directory } = await fixture(t);
  const missing = join(directory, 'missing');
  const module = new XiaoAiMusicModule({ dataDir: missing });
  await module.initialize();
  assert.deepEqual(module.config.profiles, []);
  await assert.rejects(stat(missing), { code: 'ENOENT' });
  await module.dispose();
});

test('paused worker blocks even status access to legacy local ports', async t => {
  const { music } = await fixture(t);
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Must not connect to old worker'); };
  t.after(() => { globalThis.fetch = original; });
  await assert.rejects(music.worker(music.profile('speaker-a'), '/status'), error => error.status === 503);
  const { result } = await request(music, '/api/modules/xiaoai-music/profiles');
  assert.equal(result.profiles[0].online, false);
  assert.equal(result.profiles[0].workerState, 'stopped');
});

test('explicit start is rejected by default before port checking or config writes', async t => {
  const { directory, music } = await fixture(t);
  music.assertPortsAvailable = () => { throw new Error('Must not probe without consent'); };
  await assert.rejects(request(music, `${base}/worker/start`, 'POST', {}), error => error.status === 409);
  assert.deepEqual(await readdir(join(directory, 'xiaoai-music')), ['config.json']);
  assert.equal(music.children.size, 0);
});

test('private bind policy rejects public, wildcard and hostname listeners', () => {
  for (const host of ['0.0.0.0', '8.8.8.8', 'example.com', '::', '169.254.1.1', '192.168.0.999']) assert.throws(() => privateBindHost(host));
  for (const host of ['127.0.0.1', '10.0.0.2', '172.16.0.2', '192.168.1.2']) assert.equal(privateBindHost(host), host);
});

test('port conflict never writes worker config or kills unrelated processes', async t => {
  const { directory, music } = await fixture(t);
  music.env.XIAOAI_ALLOW_LAN_UNAUTHENTICATED = 'true';
  music.assertPortsAvailable = async () => { throw Object.assign(new Error('Fixture occupied port'), { status: 409 }); };
  await assert.rejects(music.start(music.profile('speaker-a')), error => error.status === 409);
  assert.equal(music.children.size, 0);
  assert.deepEqual(await readdir(join(directory, 'xiaoai-music')), ['config.json']);
});

test('private config fields stay on disk and out of public profile/worker config', async t => {
  const { music } = await fixture(t, { profile: { ...fixtureProfile, password: 'FAKE_TEST_SECRET', token: 'FAKE_TEST_TOKEN' } });
  const pub = music.publicProfile(music.profile('speaker-a'));
  assert.equal(pub.password, undefined); assert.equal(pub.token, undefined);
  assert.equal(music.profile('speaker-a').password, 'FAKE_TEST_SECRET');
  const worker = music.workerConfig(music.profile('speaker-a'), 'FAKE_INTERNAL_WORKER_TOKEN');
  assert.equal(worker.password, undefined);
  assert.equal(worker.api_token, 'FAKE_INTERNAL_WORKER_TOKEN');
  assert.equal(worker.music.http.host, '127.0.0.1');
});

test('offline config edits preserve paused state and write mode 0600', async t => {
  const { directory, music } = await fixture(t);
  music.start = () => { throw new Error('Must remain paused'); };
  const { result } = await request(music, base, 'PUT', { name: 'Renamed fixture' });
  assert.equal(result.profile.name, 'Renamed fixture');
  assert.equal((await stat(join(directory, 'xiaoai-music/config.json'))).mode & 0o777, 0o600);
  assert.equal(music.children.size, 0);
});

test('playlists, shared favorites and announcements survive writes and reload', async t => {
  const { directory, music } = await fixture(t);
  const song = { path: '/fixture/music/song.mp3', title: 'Fixture song' };
  await request(music, `${base}/playlist`, 'POST', { songs: [song] });
  await request(music, `${base}/favorites`, 'PUT', { song, favorite: true });
  const loaded = new XiaoAiMusicModule({ dataDir: directory }); await loaded.initialize();
  const { result } = await request(loaded, `${base}/collection`);
  assert.equal(result.playlist.length, 1); assert.equal(result.favorites.length, 1); assert.deepEqual(result.announcements, []);
  assert.equal((await stat(join(directory, 'xiaoai-music/library.json'))).mode & 0o777, 0o600);
  await loaded.dispose();
});

test('invalid replacement playlist does not clear existing items', async t => {
  const { music } = await fixture(t);
  await request(music, `${base}/playlist`, 'POST', { songs: [{ path: '/fixture/music/valid.mp3' }] });
  await assert.rejects(request(music, `${base}/playlist`, 'POST', { mode: 'replace', songs: [{ path: '/outside/invalid.mp3' }] }));
  assert.equal(music.playlist(music.profile('speaker-a')).length, 1);
});

test('automation validates revision and retains rules without starting schedule', async t => {
  const { music, directory } = await fixture(t);
  const config = { revision: '', playlists: [{ id: 'fixture-list', profileId: 'speaker-a', name: 'Fixture list', songs: [{ path: '/fixture/music/valid.mp3' }] }], rules: [{ id: 'fixture-rule', profileId: 'speaker-a', playlistId: 'fixture-list', enabled: true, time: '21:00', phrase: '播放测试歌单', repeat: 2 }] };
  const saved = await music.automation.update(config);
  assert.notEqual(saved.revision, '');
  await assert.rejects(music.automation.update(config), error => error.status === 409);
  assert.equal(music.children.size, 0);
  assert.equal((await stat(join(directory, 'xiaoai-music/automation.json'))).mode & 0o777, 0o600);
});

test('assistant preserves quick controls and per-device five-item history using mocked commands', async t => {
  const { assistant, music, directory } = await fixture(t);
  const calls = []; music.assistantCommand = async (...args) => { calls.push(args); return { success: true }; };
  const created = await request(assistant, '/api/modules/xiaoai-assistant/controls', 'POST', { name: 'Fixture lamp', category: 'light', mode: 'pair', onCommand: '开灯', offCommand: '关灯' });
  assert.equal(created.status, 201);
  await request(assistant, '/api/modules/xiaoai-assistant/execute', 'POST', { profileId: 'speaker-a', controlId: created.result.control.id, operation: 'off' });
  assert.deepEqual(calls.at(-1), ['speaker-a', 'ask', '关灯']);
  for (let i = 0; i < 6; i++) await request(assistant, '/api/modules/xiaoai-assistant/send', 'POST', { profileId: 'speaker-a', mode: 'speak', text: `Fixture ${i}` });
  assert.equal(assistant.state.history['speaker-a'].length, 5);
  assert.equal((await stat(join(directory, 'xiaoai-assistant/state.json'))).mode & 0o777, 0o600);
  await request(assistant, '/api/modules/xiaoai-assistant/history/speaker-a', 'DELETE');
  assert.deepEqual(assistant.state.history['speaker-a'], []);
});

test('corrupt persisted config is not overwritten', async t => {
  const { directory } = await fixture(t);
  const file = join(directory, 'xiaoai-music/config.json');
  await writeFile(file, '{broken-fixture');
  const music = new XiaoAiMusicModule({ dataDir: directory });
  await assert.rejects(music.initialize(), error => error.status === 503);
  assert.equal(await readFile(file, 'utf8'), '{broken-fixture');
});

test('dispose kills only owned fake child and clears retry timers', async t => {
  const { music } = await fixture(t);
  const child = new EventEmitter(); const signals = [];
  child.exitCode = null; child.signalCode = null;
  child.kill = signal => { signals.push(signal); queueMicrotask(() => child.emit('exit', 0)); };
  music.children.set('speaker-a', { child, token: 'fake', stopping: false });
  music.restartTimers.set('speaker-a', setTimeout(() => { throw new Error('Retry was not cancelled'); }, 1000));
  await music.dispose();
  assert.deepEqual(signals, ['SIGTERM']); assert.equal(music.children.size, 0); assert.equal(music.restartTimers.size, 0);
});

test('Python source safety and shell quoting regressions use mocks only', t => {
  const result = spawnSync('python3', ['-B', new URL('./safety_test.py', import.meta.url).pathname], { encoding: 'utf8', timeout: 15000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  if (result.error?.code === 'ENOENT') return t.skip('Python 3 is unavailable; no runtime dependency installed automatically');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
