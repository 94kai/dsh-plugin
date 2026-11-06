import { MusicAutomation } from './automation.mjs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { readPrivateJson, savePrivateJson, privateBindHost, httpError } from './storage.mjs';
import path from 'node:path';


function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload), 'Cache-Control': 'no-store' });
  res.end(payload);
}

async function body(req, limit = 64 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw Object.assign(new Error('请求内容过大'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('请求内容不是有效 JSON'), { status: 400 }); }
}

export class XiaoAiMusicModule {
  constructor({ projectDir, dataDir, env = {} }) {
    this.moduleDir = fileURLToPath(new URL('./', import.meta.url));
    this.env = { ...env };
    this.desiredRunning = new Set();
    this.restartTimers = new Map();
    this.starting = new Map();
    this.pendingWrites = new Set();
    this.dataDir = path.join(dataDir, 'xiaoai-music');
    this.configFile = path.join(this.dataDir, 'config.json');
    this.libraryFile = path.join(this.dataDir, 'library.json');
    this.children = new Map();
    this.config = null;
    this.library = { favorites: [], playlists: {}, announcements: {} };
    this.shuttingDown = false;
    this.automation = new MusicAutomation(this);
  }

  async initialize() {
    // Deliberately read-only: no mkdir, generated configs, indexing or subprocess.
    const config = await readPrivateJson(this.configFile, { profiles: [] });
    if (!config || !Array.isArray(config.profiles)) throw httpError('音箱配置格式无效；未覆盖原文件', 503);
    this.config = { ...config, profiles: config.profiles.map(profile => this.normalizeProfile(profile, profile)) };
    if (new Set(this.config.profiles.map(p => p.id)).size !== this.config.profiles.length) throw httpError('音箱标识重复', 503);
    const library = await readPrivateJson(this.libraryFile, { favorites: [], playlists: {}, announcements: {} });
    if (!library || typeof library !== 'object' || Array.isArray(library)) throw httpError('音乐收藏数据格式无效；未覆盖原文件', 503);
    this.library = { ...library, favorites: library.favorites ?? [], playlists: library.playlists ?? {}, announcements: library.announcements ?? {} };
    if (!Array.isArray(this.library.favorites) || !this.library.playlists || typeof this.library.playlists !== 'object' || Array.isArray(this.library.playlists) || !this.library.announcements || typeof this.library.announcements !== 'object' || Array.isArray(this.library.announcements)) throw httpError('音乐收藏数据格式无效；未覆盖原文件', 503);
    this.library.playlists = Object.assign(Object.create(null), this.library.playlists);
    this.library.announcements = Object.assign(Object.create(null), this.library.announcements);
    await this.automation.initialize();
  }

  normalizeProfile(input, previous = {}) {
    const musicDirs = Array.isArray(input.musicDirs) ? input.musicDirs.map(String).map(value => value.trim()).filter(Boolean) : previous.musicDirs || [];
    const musicPort = Number(input.musicPort || previous.musicPort);
    const name = String(input.name || previous.name || '小爱音箱').trim().slice(0, 30);
    const baseUrl = String(input.baseUrl || previous.baseUrl || `http://127.0.0.1:${musicPort}`).trim();
    const id = String(input.id || previous.id || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw httpError('音箱标识无效');
    const ports = [Number(input.ws_port || previous.ws_port), Number(input.api_port || previous.api_port), musicPort];
    if (ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535) || new Set(ports).size !== 3) throw httpError('音箱端口必须是不同的 1024–65535 整数');
    for (const value of [input.maxResults ?? previous.maxResults ?? 20, input.refreshInterval ?? previous.refreshInterval ?? 0, input.volume ?? previous.volume ?? 30]) if (!Number.isFinite(Number(value))) throw httpError('音箱数值配置无效');
    if (!name) throw Object.assign(new Error('音箱名称不能为空'), { status: 400 });
    if (!musicDirs.length || musicDirs.length > 10 || musicDirs.some(directory => !path.isAbsolute(directory))) throw Object.assign(new Error('音乐目录必须是 1–10 个绝对路径'), { status: 400 });
    try { const url = new URL(baseUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\r\n]/.test(baseUrl)) throw new Error(); }
    catch { throw Object.assign(new Error('音箱访问地址必须是有效的 HTTP/HTTPS 地址'), { status: 400 }); }
    return {
      ...previous, id, name,
      ws_port: Number(input.ws_port || previous.ws_port), api_port: Number(input.api_port || previous.api_port), musicPort,
      baseUrl,
      musicDirs, maxResults: Math.max(1, Math.min(100, Number(input.maxResults ?? previous.maxResults ?? 20))),
      refreshInterval: Math.max(0, Number(input.refreshInterval ?? previous.refreshInterval ?? 0)),
      playKeywords: this.keywordList(input.playKeywords ?? previous.playKeywords, ['播放']),
      stopKeywords: this.keywordList(input.stopKeywords ?? previous.stopKeywords, ['停止播放', '暂停播放', '停止', '暂停', '闭嘴', '别放了']),
      refreshKeywords: this.keywordList(input.refreshKeywords ?? previous.refreshKeywords, ['刷新曲库']),
      randomKeywords: this.keywordList(input.randomKeywords ?? previous.randomKeywords, ['随便听听']),
      listenerEnabled: input.listenerEnabled ?? previous.listenerEnabled ?? true,
      volume: Math.max(0, Math.min(100, Number(input.volume ?? previous.volume ?? 30)))
    };
  }

  keywordList(value, fallback) {
    const items = Array.isArray(value) ? value : fallback;
    return [...new Set(items.map(String).map(item => item.trim()).filter(Boolean))].slice(0, 20);
  }

  workerConfig(profile, token) {
    return {
      id: profile.id, name: profile.name, ws_port: profile.ws_port, api_port: profile.api_port,
      bind_host: privateBindHost(this.env.XIAOAI_BIND_HOST), api_token: token,
      listener_enabled: profile.listenerEnabled,
      automation_file: this.automation.file,
      automation_state_file: path.join(this.dataDir, `${profile.id}-automation-state.json`),
      music: {
        music_dirs: profile.musicDirs, supported_audio_extensions: ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg'],
        search: { max_results: profile.maxResults, refresh_interval_sec: profile.refreshInterval, index_file: path.join(this.dataDir, `${profile.id}-index.json`) },
        commands: { play_keywords: profile.playKeywords, stop_keywords: profile.stopKeywords, refresh_keywords: profile.refreshKeywords, random_play_keywords: profile.randomKeywords, interrupt_whitelist_keywords: ['音量', '声音', '大点声', '小点声', '静音'], auto_resume_delay_sec: 1.8 },
        http: { port: profile.musicPort, base_url: profile.baseUrl, host: privateBindHost(this.env.XIAOAI_BIND_HOST), allowed_dirs: profile.musicDirs }, logging: { level: 'INFO' }
      }
    };
  }

  trackWrite(operation) {
    this.pendingWrites.add(operation);
    operation.then(() => this.pendingWrites.delete(operation), () => this.pendingWrites.delete(operation));
    return operation;
  }
  async save() { await this.trackWrite(savePrivateJson(this.configFile, this.config)); }
  async saveLibrary() { await this.trackWrite(savePrivateJson(this.libraryFile, this.library)); }

  playlist(profile) {
    if (!Array.isArray(this.library.playlists[profile.id])) this.library.playlists[profile.id] = [];
    return this.library.playlists[profile.id];
  }

  announcements(profile) {
    if (!Array.isArray(this.library.announcements[profile.id])) this.library.announcements[profile.id] = [];
    return this.library.announcements[profile.id];
  }

  normalizeSong(input, profile) {
    const songPath = String(input?.path || '').trim();
    if (!path.isAbsolute(songPath) || !profile.musicDirs.some(root => {
      const relative = path.relative(path.resolve(root), path.resolve(songPath));
      return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    })) throw Object.assign(new Error('歌曲不在该音箱的受控曲库目录中'), { status: 400 });
    return {
      path: songPath,
      name: String(input.name || path.basename(songPath)).slice(0, 300),
      title: String(input.title || '').slice(0, 200), artist: String(input.artist || '').slice(0, 200),
      album: String(input.album || '').slice(0, 200), size: Math.max(0, Number(input.size) || 0), addedAt: new Date().toISOString()
    };
  }

  addSongs(target, songs, profile) {
    const byPath = new Map(target.map(song => [song.path, song]));
    const validated = (Array.isArray(songs) ? songs : []).slice(0, 500).map(input => this.normalizeSong(input, profile));
    for (const song of validated) {
      if (!byPath.has(song.path)) { target.push(song); byPath.set(song.path, song); }
    }
    if (target.length > 1000) target.splice(1000);
  }

  async assertPortsAvailable(profile) {
    const host = privateBindHost(this.env.XIAOAI_BIND_HOST);
    for (const [bind, port] of [[host, profile.ws_port], [host, profile.musicPort], ['127.0.0.1', profile.api_port]]) {
      await new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', () => reject(httpError(`音箱端口 ${port} 无法使用；请先停止旧服务或调整端口，不会终止其他进程`, 409)));
        server.listen({ host: bind, port, exclusive: true }, () => server.close(error => error ? reject(error) : resolve()));
      });
    }
  }

  async start(profile) {
    if (this.shuttingDown) throw httpError('音箱模块已卸载', 503);
    if (!profile) throw httpError('音箱不存在', 404);
    if (this.children.has(profile.id)) return { success: true, workerState: 'running' };
    if (this.starting.has(profile.id)) return this.starting.get(profile.id);
    const operation = this.startOwned(profile);
    this.starting.set(profile.id, operation);
    try { return await operation; } finally { this.starting.delete(profile.id); }
  }

  async startOwned(profile) {
    if (String(this.env.XIAOAI_ALLOW_LAN_UNAUTHENTICATED) !== 'true') throw httpError('默认暂停音箱服务。兼容音箱的 WS/音频端口无鉴权；请先隔离可信局域网、停止旧服务，并在私密配置中明确确认风险后启动', 409);
    privateBindHost(this.env.XIAOAI_BIND_HOST);
    await this.assertPortsAvailable(profile);
    if (this.shuttingDown) throw httpError('音箱模块已卸载', 503);
    const token = randomBytes(32).toString('hex');
    const configPath = path.join(this.dataDir, `${profile.id}-worker.json`);
    await savePrivateJson(configPath, this.workerConfig(profile, token));
    if (this.shuttingDown) throw httpError('音箱模块已卸载', 503);
    const python = this.env.XIAOAI_PYTHON || 'python3';
    const child = spawn(python, [path.join(this.moduleDir, 'worker_bridge.py'), '--config', configPath], {
      cwd: this.moduleDir, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG || 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1' },
    });
    const state = { child, token, startedAt: Date.now(), error: '', stopping: false };
    this.children.set(profile.id, state);
    this.desiredRunning.add(profile.id);
    // Drain logs, but never publish voice utterances, paths or child secrets.
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => { state.error = '音箱 worker 报告异常；请检查解释器、ffprobe 与私密配置'; });
    child.once('error', () => { state.error = '无法启动音箱 worker；请检查 Python 可执行文件'; this.desiredRunning.delete(profile.id); if (this.children.get(profile.id) === state) this.children.delete(profile.id); });
    child.once('exit', () => {
      if (this.children.get(profile.id) === state) this.children.delete(profile.id);
      if (!state.stopping && !this.shuttingDown && this.desiredRunning.has(profile.id)) {
        const timer = setTimeout(() => {
          this.restartTimers.delete(profile.id);
          if (!this.shuttingDown && this.desiredRunning.has(profile.id)) void this.start(profile).catch(() => { this.desiredRunning.delete(profile.id); });
        }, 3000);
        timer.unref?.(); this.restartTimers.set(profile.id, timer);
      }
    });
    return { success: true, workerState: 'starting' };
  }

  async stop(id) {
    this.desiredRunning.delete(id);
    clearTimeout(this.restartTimers.get(id)); this.restartTimers.delete(id);
    const pending = this.starting.get(id);
    if (pending) await pending.catch(() => {});
    this.desiredRunning.delete(id);
    const state = this.children.get(id); if (!state) return;
    state.stopping = true;
    await new Promise(resolve => {
      let finished = false;
      const done = () => { if (finished) return; finished = true; clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { state.child.kill('SIGKILL'); done(); }, 4000);
      state.child.once('exit', done);
      if (state.child.exitCode !== null || state.child.signalCode !== null) done();
      else state.child.kill('SIGTERM');
    });
    if (this.children.get(id) === state) this.children.delete(id);
  }

  async shutdown() {
    this.shuttingDown = true;
    for (const timer of this.restartTimers.values()) clearTimeout(timer);
    this.restartTimers.clear(); this.desiredRunning.clear();
    await Promise.all([...this.starting.values()].map(operation => operation.catch(() => {})));
    await Promise.all([...this.children.keys()].map(id => this.stop(id)));
  }
  async dispose() { await this.shutdown(); await this.automation.writes.catch(() => {}); await Promise.allSettled([...this.pendingWrites]); }

  profile(id) { return this.config.profiles.find(item => item.id === id); }

  async worker(profile, pathname, options = {}) {
    const owned = this.children.get(profile.id);
    if (!owned || owned.stopping || !owned.token) throw httpError('音箱 worker 已暂停，请先显式启动；不会连接旧服务', 503);
    const response = await fetch(`http://127.0.0.1:${profile.api_port}${pathname}`, { ...options, signal: AbortSignal.timeout(options.timeout || 120000), headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${owned.token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(`音箱服务请求失败（${response.status}），请检查连接与参数`), { status: 502 });
    return data;
  }

  publicProfile(profile) { const { id, name, musicPort, baseUrl, musicDirs, maxResults, refreshInterval, playKeywords, stopKeywords, refreshKeywords, randomKeywords, listenerEnabled, volume } = profile; const displayUrl = new URL(baseUrl); displayUrl.search = ''; displayUrl.hash = ''; return { id, name, musicPort, baseUrl: displayUrl.href, musicDirs, maxResults, refreshInterval, playKeywords, stopKeywords, refreshKeywords, randomKeywords, listenerEnabled, volume, workerState: this.children.has(id) ? 'running' : 'stopped' }; }

  async assistantProfiles() {
    return Promise.all(this.config.profiles.map(async profile => {
      try { return { id: profile.id, name: profile.name, volume: profile.volume ?? 30, ...(await this.worker(profile, '/status', { timeout: 2500 })), online: true }; }
      catch { return { id: profile.id, name: profile.name, volume: profile.volume ?? 30, workerState: this.children.has(profile.id) ? 'running' : 'stopped', online: false, speakerConnected: false }; }
    }));
  }

  async assistantCommand(profileId, mode, text) {
    const profile = this.profile(profileId);
    if (!profile) throw Object.assign(new Error('音箱不存在'), { status: 404 });
    const value = String(text || '').trim();
    const maxLength = mode === 'speak' ? 500 : 200;
    if (!value || value.length > maxLength) throw Object.assign(new Error(`内容长度必须为 1–${maxLength} 个字符`), { status: 400 });
    return this.worker(profile, mode === 'speak' ? '/speak' : '/ask', { method: 'POST', body: JSON.stringify({ text: value }), timeout: 30000 });
  }

  async assistantVolume(profileId, volume) {
    const profile = this.profile(profileId);
    if (!profile) throw Object.assign(new Error('音箱不存在'), { status: 404 });
    const value = Math.max(0, Math.min(100, Number(volume)));
    if (!Number.isFinite(value)) throw Object.assign(new Error('音量必须是 0–100 的数字'), { status: 400 });
    const result = await this.worker(profile, '/volume', { method: 'POST', body: JSON.stringify({ volume: value }), timeout: 30000 });
    profile.volume = value; await this.save(); return result;
  }

  async handle(req, res, url) {
    const base = '/api/modules/xiaoai-music';
    if (!url.pathname.startsWith(base)) return false;
    if (url.pathname === `${base}/profiles` && req.method === 'GET') {
      const profiles = await Promise.all(this.config.profiles.map(async profile => {
        try { return { ...this.publicProfile(profile), ...(await this.worker(profile, '/status', { timeout: 2500 })), online: true }; }
        catch { return { ...this.publicProfile(profile), online: false, processError: this.children.get(profile.id)?.error || '音箱服务已暂停，需手动启动' }; }
      }));
      json(res, 200, { profiles }); return true;
    }
    if (url.pathname === `${base}/automation` && req.method === 'GET') { if (this.automation.error) throw Object.assign(new Error(this.automation.error), { status: 503 }); json(res, 200, this.automation.data); return true; }
    if (url.pathname === `${base}/automation` && req.method === 'PUT') { json(res, 200, await this.automation.update(await body(req, 2 * 1024 * 1024))); return true; }
    const match = url.pathname.match(/^\/api\/modules\/xiaoai-music\/profiles\/([^/]+)(?:\/(.+))?$/);
    if (!match) { json(res, 404, { error: '小爱音乐接口不存在' }); return true; }
    const profile = this.profile(decodeURIComponent(match[1]));
    if (!profile) { json(res, 404, { error: '音箱不存在' }); return true; }
    const action = match[2] || '';
    if (action === 'worker/start' && req.method === 'POST') { json(res, 200, await this.start(profile)); return true; }
    if (action === 'worker/stop' && req.method === 'POST') { await this.stop(profile.id); json(res, 200, { success: true, workerState: 'stopped' }); return true; }
    if (!action && req.method === 'PUT') {
      const updated = this.normalizeProfile({ ...(await body(req)), id: profile.id, ws_port: profile.ws_port, api_port: profile.api_port }, profile);
      const running = this.children.has(profile.id); await this.stop(profile.id); Object.assign(profile, updated); await this.save(); if (running) await this.start(profile); json(res, 200, { profile: this.publicProfile(profile) }); return true;
    }
    if (action === 'search' && req.method === 'GET') { json(res, 200, await this.worker(profile, `/search?q=${encodeURIComponent(String(url.searchParams.get('q') || '').slice(0, 100))}`)); return true; }
    if (action === 'collection' && req.method === 'GET') {
      json(res, 200, { playlist: this.playlist(profile), favorites: this.library.favorites, announcements: this.announcements(profile) }); return true;
    }
    if (action === 'playlist' && req.method === 'POST') {
      const payload = await body(req); const target = payload.mode === 'replace' ? [] : [...this.playlist(profile)];
      this.addSongs(target, payload.songs, profile); this.library.playlists[profile.id] = target; await this.saveLibrary();
      json(res, 200, { playlist: target }); return true;
    }
    if (action === 'playlist' && req.method === 'DELETE') {
      const songPath = String(url.searchParams.get('path') || ''); const target = this.playlist(profile);
      const index = target.findIndex(song => song.path === songPath);
      if (index < 0) throw Object.assign(new Error('歌曲不在播放列表中'), { status: 404 });
      target.splice(index, 1); await this.saveLibrary(); json(res, 200, { playlist: target }); return true;
    }
    if (action === 'favorites' && req.method === 'PUT') {
      const payload = await body(req); const song = this.normalizeSong(payload.song, profile);
      const index = this.library.favorites.findIndex(item => item.path === song.path);
      if (payload.favorite === false) { if (index >= 0) this.library.favorites.splice(index, 1); }
      else if (index < 0) this.library.favorites.unshift(song);
      await this.saveLibrary(); json(res, 200, { favorites: this.library.favorites }); return true;
    }
    if (action === 'collection/play' && req.method === 'POST') {
      const payload = await body(req); const source = payload.source === 'favorites' ? this.library.favorites : this.playlist(profile);
      const start = Math.max(0, Math.min(source.length - 1, Number(payload.index) || 0));
      if (!source.length) throw Object.assign(new Error('列表为空'), { status: 400 });
      const ordered = source.slice(start);
      const repeat = Math.max(1, Math.min(20, Number(payload.repeat) || 1));
      const result = await this.worker(profile, '/queue/play', { method: 'POST', body: JSON.stringify({ paths: ordered.map(song => song.path), repeat }) });
      json(res, 200, result); return true;
    }
    if (action === 'queue/jump' && req.method === 'POST') {
      const payload = await body(req);
      const result = await this.worker(profile, '/queue/jump', { method: 'POST', body: JSON.stringify({ index: Number(payload.index) }) });
      json(res, 200, result); return true;
    }
    if (action === 'announcements' && req.method === 'DELETE') {
      this.announcements(profile).splice(0);
      await this.saveLibrary(); json(res, 200, { announcements: [] }); return true;
    }
    if (['play', 'play-search', 'random', 'stop', 'refresh', 'listener', 'volume', 'speak'].includes(action) && req.method === 'POST') {
      const payload = await body(req);
      if (['play', 'random'].includes(action)) payload.repeat = Math.max(1, Math.min(20, Number(payload.repeat) || 1));
      if (action === 'speak') {
        const text = String(payload.text || '').trim();
        if (!text) throw Object.assign(new Error('请输入要播报的文字'), { status: 400 });
        if (text.length > 500) throw Object.assign(new Error('播报文字不能超过 500 个字符'), { status: 400 });
        payload.text = text;
      }
      if (action === 'volume' && !Number.isFinite(Number(payload.volume))) throw httpError('音量必须是有限数字');
      const result = await this.worker(profile, `/${action}`, { method: 'POST', body: JSON.stringify(payload), timeout: action === 'refresh' ? 600000 : 120000 });
      if (action === 'speak') {
        const announcements = this.announcements(profile);
        const duplicate = announcements.indexOf(payload.text);
        if (duplicate >= 0) announcements.splice(duplicate, 1);
        announcements.unshift(payload.text); announcements.splice(5);
        await this.saveLibrary();
        result.announcements = announcements;
      }
      if (action === 'listener') { profile.listenerEnabled = Boolean(payload.enabled); await this.save(); }
      if (action === 'volume') { profile.volume = Math.max(0, Math.min(100, Number(payload.volume))); await this.save(); }
      json(res, 200, result); return true;
    }
    json(res, 405, { error: '请求方法不支持' }); return true;
  }
}
