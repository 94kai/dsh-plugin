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

test('initialize without LAN consent is read-only and never starts workers or writes defaults', async t => {
  const { directory, music, assistant } = await fixture(t);
  assert.deepEqual(await readdir(join(directory, 'xiaoai-music')), ['config.json']);
  assert.deepEqual(await readdir(directory), ['xiaoai-music']);
  assert.equal(music.children.size, 0);
  assert.equal(assistant.state.controls.length, 0);
  assert.equal(music.moduleDir.includes('/features/xiaoai'), true);
});

test('consented initialize auto-starts every profile and isolates failures', async t => {
  const { directory } = await fixture(t);
  await writeFile(join(directory, 'xiaoai-music/config.json'), JSON.stringify({ profiles: [fixtureProfile, { ...fixtureProfile, id: 'speaker-b' }] }));
  const music = new XiaoAiMusicModule({ dataDir: directory, env: { XIAOAI_ALLOW_LAN_UNAUTHENTICATED: 'true' } });
  t.after(() => music.dispose());
  const calls = [];
  music.startOwned = async profile => { calls.push(profile.id); if (profile.id === 'speaker-a') throw new Error('FAKE_SECRET'); return { success: true }; };
  await music.initialize();
  assert.deepEqual(calls, ['speaker-a', 'speaker-b']);
  const { result } = await request(music, '/api/modules/xiaoai-music/profiles');
  assert.match(result.profiles[0].processError, /自动连接失败/);
  assert.equal(JSON.stringify(result).includes('FAKE_SECRET'), false);
  music.startOwned = async () => ({ success: true });
  await music.start(music.profile('speaker-a'));
  assert.equal(music.startErrors.has('speaker-a'), false);
});

test('auto-start opt-out preserves paused state despite LAN consent', async t => {
  const { directory } = await fixture(t);
  const music = new XiaoAiMusicModule({ dataDir: directory, env: { XIAOAI_ALLOW_LAN_UNAUTHENTICATED: 'true', XIAOAI_AUTO_START: 'false' } });
  t.after(() => music.dispose());
  music.start = () => { throw new Error('Must remain paused'); };
  await music.initialize();
  assert.equal(music.children.size, 0);
});

test('automatic startup retains private bind and port conflict checks', async t => {
  const { directory } = await fixture(t);
  for (const host of ['0.0.0.0', '127.0.0.1']) {
    const music = new XiaoAiMusicModule({ dataDir: directory, env: { XIAOAI_ALLOW_LAN_UNAUTHENTICATED: 'true', XIAOAI_BIND_HOST: host } });
    let probes = 0;
    music.assertPortsAvailable = async () => { probes++; throw Object.assign(new Error('occupied'), { status: 409 }); };
    await music.initialize();
    assert.equal(probes, host === '0.0.0.0' ? 0 : 1);
    assert.equal(music.children.size, 0);
    assert.equal(music.startErrors.has('speaker-a'), true);
    assert.deepEqual(await readdir(join(directory, 'xiaoai-music')), ['config.json']);
    await music.dispose();
  }
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

test('playlists persist without retaining retired local favorite data', async t => {
  const { directory, music } = await fixture(t,{library:{favorites:[{path:'/fixture/music/retired.mp3'}],playlists:{},announcements:{}}});
  const song = { path: '/fixture/music/song.mp3', title: 'Fixture song' };
  await request(music, `${base}/playlist`, 'POST', { songs: [song] });
  const stored = JSON.parse(await readFile(join(directory, 'xiaoai-music/library.json'),'utf8'));
  assert.equal(Object.hasOwn(stored,'favorites'),false);
  const loaded = new XiaoAiMusicModule({ dataDir: directory }); await loaded.initialize();
  const { result } = await request(loaded, `${base}/collection`);
  assert.equal(result.playlist.length, 1); assert.deepEqual(result.favorites, []);assert.equal(result.favoritesReady,false);
  await assert.rejects(request(loaded,`${base}/favorites`,'PUT',{song,favorite:true}),{status:503});
  assert.equal((await stat(join(directory, 'xiaoai-music/library.json'))).mode & 0o777, 0o600);
  await loaded.dispose();
});

test('playlist play forwards ordered source and mode to the owned worker', async t => {
  const { music } = await fixture(t, { library: { playlists: { 'speaker-a': [{ path: '/fixture/music/a.mp3' }, { path: '/fixture/music/b.mp3' }] }, announcements: {} } });
  await assert.rejects(request(music, `${base}/playlist/play`, 'POST', {}), { status: 503 });
  const calls = [];
  music.worker = async (...args) => { calls.push(args); return { success: true }; };
  const { status, result } = await request(music, `${base}/playlist/play`, 'POST', { path: '/fixture/music/b.mp3', mode: 'loop-all' });
  assert.equal(status, 200); assert.deepEqual(result, { success: true });
  assert.equal(calls[0][0].id, 'speaker-a');
  assert.equal(calls[0][1], '/queue/playlist');
  assert.deepEqual(JSON.parse(calls[0][2].body), { mode: 'loop-all', source: ['/fixture/music/a.mp3', '/fixture/music/b.mp3'], paths: ['/fixture/music/b.mp3'] });
  // Unknown modes fall back to sequence instead of reaching the worker verbatim.
  await request(music, `${base}/playlist/play`, 'POST', { mode: 'repeat-all' });
  assert.equal(JSON.parse(calls[1][2].body).mode, 'sequence');
  await request(music, `${base}/playlist/mode`, 'POST', { mode: 'shuffle' });
  assert.equal(calls[2][1], '/queue/mode');
  assert.deepEqual(JSON.parse(calls[2][2].body), { mode: 'shuffle' });
});

test('search play clears the playlist and keeps the chosen song and later results', async t => {
  const { music } = await fixture(t, { library: { playlists: { 'speaker-a': [{ path: '/fixture/music/old.mp3' }] }, announcements: {} } });
  const calls = [];
  music.worker = async (profile, name, options) => {
    calls.push([name, options]);
    if (name.startsWith('/search?')) return { items: [
      { path: '/fixture/music/a.mp3', name: 'a.mp3', title: 'A' },
      { path: '/fixture/music/b.mp3', name: 'b.mp3', title: 'B' },
      { path: '/fixture/music/c.mp3', name: 'c.mp3', title: 'C' }] };
    return { success: true };
  };
  const { status } = await request(music, `${base}/search/play`, 'POST', { keyword: 'fixture', path: '/fixture/music/b.mp3', mode: 'loop-one' });
  assert.equal(status, 200);
  assert.deepEqual(music.playlist(music.profile('speaker-a')).map(song => song.path), ['/fixture/music/b.mp3', '/fixture/music/c.mp3']);
  const play = calls.find(([name]) => name === '/queue/playlist');
  assert.deepEqual(JSON.parse(play[1].body), { mode: 'loop-one', source: ['/fixture/music/b.mp3', '/fixture/music/c.mp3'], paths: ['/fixture/music/b.mp3'] });
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

test('NAS favorites are the only source, never write legacy storage, and fail closed on lost authorization', async t => {
  const local={favorites:[{path:'/fixture/music/local.mp3',name:'原收藏'}],playlists:{},announcements:{}};
  const {music,directory}=await fixture(t,{library:local});const writes=[];
  music.fnos={favorites:async()=>[{path:'/fixture/music/nas.mp3',guid:'nas-id',name:'飞牛收藏'},{path:'/outside/music.mp3',guid:'out',name:'库外'},{path:'/fixture/music/cue.flac',guid:'cue',cue:true}],setFavorite:async(song,favorite)=>{writes.push({song,favorite});return {success:true};},dispose(){}};
  const before=await readFile(join(directory,'xiaoai-music/library.json'),'utf8');
  const loaded=await request(music,`${base}/collection`);assert.equal(loaded.result.favoritesReady,true);assert.equal(loaded.result.favoritesSource,'fnos');assert.equal(loaded.result.favorites.length,1);assert.equal(loaded.result.favorites[0].guid,'nas-id');assert.equal(loaded.result.favoritesTotal,3);
  await request(music,`${base}/favorites`,'PUT',{song:{path:'/fixture/music/nas.mp3'},favorite:true});assert.equal(writes.length,1);assert.equal(await readFile(join(directory,'xiaoai-music/library.json'),'utf8'),before);
  const queued=[];music.worker=async(_profile,url,options)=>{queued.push({url,body:JSON.parse(options.body)});return {success:true};};
  await request(music,`${base}/collection/play`,'POST',{source:'favorites',index:0,path:'/fixture/music/nas.mp3'});assert.deepEqual(queued[0].body.paths,['/fixture/music/nas.mp3']);
  music.fnos.favorites=async()=>{throw Object.assign(new Error('请重新连接'),{status:401});};
  const expired=await request(music,`${base}/collection`);assert.equal(expired.result.favoritesReady,false);assert.deepEqual(expired.result.favorites,[]);assert.deepEqual(expired.result.playlist,[]);
  await assert.rejects(request(music,`${base}/collection/play`,'POST',{source:'favorites',index:0}),{status:401});assert.equal(queued.length,1);
});

test('Python source safety and shell quoting regressions use mocks only', t => {
  const result = spawnSync('python3', ['-B', new URL('./safety_test.py', import.meta.url).pathname], { encoding: 'utf8', timeout: 15000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  if (result.error?.code === 'ENOENT') return t.skip('Python 3 is unavailable; no runtime dependency installed automatically');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
