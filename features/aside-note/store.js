import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_FILE = fileURLToPath(new URL('../../.local/data/aside-note/notes.json', import.meta.url));
const MAX_FILE = 16 * 1024 * 1024;
const queues = new Map();
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export class NoteError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const invalid = message => { throw new NoteError(400, 'invalid_request', message); };
function id(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || ['__proto__', 'prototype', 'constructor'].includes(value)) invalid('无效的记录标识');
  return value;
}
function text(value, max = 10000, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) invalid(`内容不能为空且不能超过 ${max} 字`);
  return value;
}
const revision = value => Number.isSafeInteger(value) && value >= 0;
const stamp = value => Number.isFinite(value) && value >= 0;
function item(raw) {
  if (!plain(raw) || typeof raw.done !== 'boolean' || !stamp(raw.createdAt) || !stamp(raw.updatedAt)) invalid('便笺格式不正确');
  return { id: id(raw.id), text: text(raw.text), done: raw.done, createdAt: raw.createdAt, updatedAt: raw.updatedAt, ...(raw.completedAt === undefined ? {} : { completedAt: stamp(raw.completedAt) ? raw.completedAt : invalid('完成时间不正确') }) };
}
function draft(raw) {
  if (!plain(raw) || !plain(raw.edits) || Object.keys(raw.edits).length > 1000) invalid('草稿格式不正确');
  return { add: text(raw.add, 10000, true), edits: Object.fromEntries(Object.entries(raw.edits).map(([key, value]) => [id(key), text(value, 10000, true)])) };
}
function scopeKey(scope) {
  if (!plain(scope) || !['global', 'session', 'workspace'].includes(scope.kind)) invalid('请选择全局、工作区或会话');
  if (scope.kind === 'global' && scope.id !== 'all') invalid('全局范围标识必须为 all');
  return JSON.stringify([scope.kind, id(scope.id)]);
}
const emptyRecord = () => ({ revision: 0, items: [], draft: { add: '', edits: {} }, forwarded: {}, seededSessionIds: [] });
const empty = () => ({ version: 1, records: {}, imports: [], preferences: { revision: 0, sendShortcut: 'enter', forwardPrefix: '', scopeMode: 'workspace', visibleScopes: { session: true, workspace: true, global: true }, panelWidth: 360, panelHeight: 0, sections: { open: true, done: false } } });
function validatePresentation(prefs) {
  const visibility = prefs.visibleScopes;
  if (!plain(visibility) || Object.keys(visibility).length !== 3 || !['session', 'workspace', 'global'].every(key => typeof visibility[key] === 'boolean') || !Object.values(visibility).some(Boolean)) invalid('至少显示一个便笺范围，且所有范围开关必须为布尔值');
  if (!Number.isInteger(prefs.panelWidth) || prefs.panelWidth < 280 || prefs.panelWidth > 720 || !Number.isInteger(prefs.panelHeight) || (prefs.panelHeight !== 0 && (prefs.panelHeight < 240 || prefs.panelHeight > 10000)) || !plain(prefs.sections) || typeof prefs.sections.open !== 'boolean' || typeof prefs.sections.done !== 'boolean') invalid('面板尺寸或分区设置不正确');
}
function validateState(state) {
  if (!plain(state) || state.version !== 1 || !plain(state.records) || Object.keys(state.records).length > 2000 || !Array.isArray(state.imports) || state.imports.length > 1000 || state.imports.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) || !plain(state.preferences) || !revision(state.preferences.revision) || !['enter', 'mod-enter'].includes(state.preferences.sendShortcut) || !['global', 'session', 'workspace'].includes(state.preferences.scopeMode)) throw new Error('invalid snapshot');
  text(state.preferences.forwardPrefix, 2000, true);
  // Backward-compatible defaults for snapshots written by 1.7.0.
  state.preferences.panelWidth ??= 360;
  state.preferences.panelHeight ??= 0;
  state.preferences.sections ??= { open: true, done: false };
  if (state.preferences.visibleScopes === undefined) state.preferences.visibleScopes = { session: true, workspace: true, global: true };
  validatePresentation(state.preferences);
  for (const [key, record] of Object.entries(state.records)) {
    const [kind, value] = JSON.parse(key);
    if (scopeKey({ kind, id: value }) !== key || !plain(record) || !revision(record.revision) || !Array.isArray(record.items) || !Array.isArray(record.seededSessionIds) || !plain(record.forwarded)) throw new Error('invalid record');
    if (record.items.length > 1000 || record.seededSessionIds.length > 2000 || Object.keys(record.forwarded).length > 2000) throw new Error('record too large');
    record.seededSessionIds.forEach(id);
    for (const [key, value] of Object.entries(record.forwarded)) if (!id(key) || value !== true) throw new Error('invalid mark');
    const ids = new Set();
    for (const raw of record.items) { item(raw); if (ids.has(raw.id)) throw new Error('duplicate id'); ids.add(raw.id); }
    draft(record.draft);
  }
  return state;
}
export function createStore({ dataFile = DEFAULT_FILE } = {}) {
  const file = resolve(dataFile);
  function serial(fn) {
    const task = (queues.get(file) || Promise.resolve()).then(fn);
    const tail = task.catch(() => {}); queues.set(file, tail);
    void tail.then(() => { if (queues.get(file) === tail) queues.delete(file); });
    return task;
  }
  async function load() {
    try {
      const raw = await readFile(file, 'utf8');
      if (Buffer.byteLength(raw) > MAX_FILE) throw new Error('too large');
      return validateState(JSON.parse(raw));
    } catch (error) {
      if (error.code === 'ENOENT') return empty();
      throw new NoteError(500, 'storage_error', '服务端数据读取失败；原文件未改动，请先备份并检查');
    }
  }
  async function save(state) {
    try { validateState(state); }
    catch (error) { if (error instanceof NoteError) throw error; invalid('合并后的数据格式或数量超限，未写入任何数据'); }
    const raw = JSON.stringify(state);
    if (Buffer.byteLength(raw) > MAX_FILE || Object.keys(state.records).length > 2000) throw new NoteError(413, 'storage_limit', '便笺总量超限，请先导出备份并整理');
    const temporary = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`);
    if (dirname(temporary) !== dirname(file) || temporary === file) throw new Error('invalid temporary path');
    let handle;
    try {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(raw); await handle.sync(); await handle.close(); handle = null;
      await rename(temporary, file);
    } catch { throw new NoteError(500, 'storage_error', '服务端保存失败，请重试；输入未清空'); }
    finally { if (handle) await handle.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
  }
  const get = (state, scope) => state.records[scopeKey(scope)] || emptyRecord();
  const result = (state, scope) => ({ ...get(state, scope), preferences: state.preferences });
  return {
    read: scope => serial(async () => result(await load(), scope)),
    export: () => serial(load),
    mutate: command => serial(async () => {
      if (!plain(command)) invalid('请求格式不正确');
      const state = await load();
      if (command.action === 'import') {
        const summary = importLegacy(state, command.data);
        await save(state); return summary;
      }
      if (command.action === 'preferences') {
        if (command.revision !== state.preferences.revision) throw new NoteError(409, 'revision_conflict', '设置已在其他浏览器修改，请刷新后重试');
        if (!['enter', 'mod-enter'].includes(command.sendShortcut) || !['global', 'session', 'workspace'].includes(command.scopeMode)) invalid('设置格式不正确');
        state.preferences = { ...state.preferences, revision: state.preferences.revision + 1, sendShortcut: command.sendShortcut, scopeMode: command.scopeMode, forwardPrefix: text(command.forwardPrefix, 2000, true), panelWidth: command.panelWidth ?? state.preferences.panelWidth, panelHeight: command.panelHeight ?? state.preferences.panelHeight, sections: command.sections ?? state.preferences.sections, visibleScopes: Object.hasOwn(command, 'visibleScopes') ? command.visibleScopes : state.preferences.visibleScopes };
        validatePresentation(state.preferences);
        if (!state.preferences.visibleScopes[state.preferences.scopeMode]) state.preferences.scopeMode = ['global', 'workspace', 'session'].find(kind => state.preferences.visibleScopes[kind]);
        await save(state); return state.preferences;
      }
      const key = scopeKey(command.scope), record = get(state, command.scope);
      if (!revision(command.revision)) invalid('缺少数据版本');
      if (command.revision !== record.revision) throw new NoteError(409, 'revision_conflict', '便笺已在其他浏览器修改。请刷新列表后重试，输入会保留');
      const now = Date.now();
      const index = record.items.findIndex(value => value.id === command.id);
      if (['update', 'delete', 'forward'].includes(command.action) && index < 0) throw new NoteError(404, 'not_found', '该便笺已不存在，请刷新列表');
      switch (command.action) {
        case 'add':
          record.items.unshift({ id: randomUUID(), text: text(command.text).trim(), done: false, createdAt: now, updatedAt: now });
          record.draft.add = ''; break;
        case 'update': {
          const value = record.items[index];
          if (command.text === undefined && command.done === undefined) invalid('缺少修改内容');
          if (command.text !== undefined) { value.text = text(command.text).trim(); delete record.draft.edits[value.id]; }
          if (command.done !== undefined) {
            if (typeof command.done !== 'boolean') invalid('完成状态不正确');
            value.done = command.done;
            if (value.done) value.completedAt = now; else delete value.completedAt;
          }
          value.updatedAt = now; break;
        }
        case 'delete': record.items.splice(index, 1); delete record.draft.edits[command.id]; delete record.forwarded[command.id]; break;
        case 'clear': {
          for (const value of record.items.filter(value => value.done)) { delete record.draft.edits[value.id]; delete record.forwarded[value.id]; }
          record.items = record.items.filter(value => !value.done); break;
        }
        case 'draft': record.draft = draft(command.draft); break;
        case 'forward':
          if (typeof command.forwarded !== 'boolean') invalid('转发标记不正确');
          if (command.forwarded) record.forwarded[command.id] = true; else delete record.forwarded[command.id]; break;
        case 'seed': {
          if (command.scope.kind !== 'workspace' || !Array.isArray(command.sessionIds) || command.sessionIds.length > 2000) invalid('工作区成员不正确');
          const seen = new Set(record.items.map(value => value.id));
          for (const sessionId of command.sessionIds.map(id)) {
            if (record.seededSessionIds.includes(sessionId)) continue;
            for (const value of get(state, { kind: 'session', id: sessionId }).items) if (!seen.has(value.id)) { record.items.push({ ...value }); seen.add(value.id); }
            record.seededSessionIds.push(sessionId);
          }
          break;
        }
        default: invalid('不支持此操作');
      }
      if (record.items.length > 1000) invalid('每个清单最多保存 1000 条便笺');
      record.revision++;
      state.records[key] = record;
      await save(state); return result(state, command.scope);
    }),
  };
}

// Import is atomic, strict and additive. Never clear browser data or replace
// authored server notes. A durable content ledger prevents deleted imports
// being resurrected by clicking the same migration button again.
function importLegacy(state, data) {
  if (!plain(data) || Object.keys(data).some(key => !['sessions', 'workspaces', 'drafts', 'forwarded', 'preferences'].includes(key))) invalid('迁移数据格式不正确');
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const digest = hash(data);
  if (state.imports.includes(digest)) return { imported: 0, alreadyImported: true };
  if (state.imports.length >= 1000) invalid('迁移次数超限');
  let imported = 0;
  const legacyBucket = (value, name) => {
    if (value === undefined) return {};
    if (!plain(value) || value.version !== 1 || !plain(value[name])) invalid('原插件数据格式不正确，迁移已取消，未覆盖任何数据');
    return value[name];
  };
  const changed = new Set();
  function ensure(scope) { const key = scopeKey(scope); state.records[key] ||= emptyRecord(); changed.add(key); return state.records[key]; }
  for (const [name, kind] of [['sessions', 'session'], ['workspaces', 'workspace']]) {
    for (const [value, raw] of Object.entries(legacyBucket(data[name], name))) {
      if (!plain(raw) || !Array.isArray(raw.items) || raw.items.length > 1000) invalid('原便笺记录格式不正确');
      const record = ensure({ kind, id: value });
      for (const source of raw.items) {
        const next = item(source), existing = record.items.find(value => value.id === next.id);
        if (existing) {
          if (hash(existing) === hash(next)) continue;
          next.id = `import-${hash([value, next])}`;
          if (record.items.some(value => value.id === next.id)) continue;
        }
        record.items.push(next); imported++;
      }
      if (record.items.length > 1000) invalid('迁移后单个清单超过 1000 条，未写入');
      if (raw.seededSessionIds !== undefined) {
        if (!Array.isArray(raw.seededSessionIds) || raw.seededSessionIds.length > 2000) invalid('工作区迁移记录不正确');
        record.seededSessionIds = [...new Set([...record.seededSessionIds, ...raw.seededSessionIds.map(id)])];
      }
    }
  }
  const fromKey = key => key.startsWith('ws:') ? { kind: 'workspace', id: key.slice(3) } : { kind: 'session', id: key };
  for (const [key, raw] of Object.entries(legacyBucket(data.drafts, 'sessions'))) {
    if (!plain(raw)) invalid('原草稿格式不正确');
    const value = draft({ add: raw.add ?? '', edits: raw.edits ?? {} }), record = ensure(fromKey(key));
    // Different unsaved text is preserved as an imported note, never discarded.
    for (const [a, b] of [[record.draft.add, value.add], ...Object.entries(value.edits).map(([id, value]) => [record.draft.edits[id], value])]) {
      if (a && b && a !== b) { record.items.push({ id: randomUUID(), text: b, done: false, createdAt: Date.now(), updatedAt: Date.now() }); imported++; }
    }
    record.draft = { add: record.draft.add || value.add, edits: { ...value.edits, ...record.draft.edits } };
    if (record.items.length > 1000) invalid('草稿迁移后便笺超限');
  }
  for (const [key, raw] of Object.entries(legacyBucket(data.forwarded, 'sessions'))) {
    if (!plain(raw)) invalid('转发标记格式不正确');
    const record = ensure(fromKey(key));
    for (const [key, flag] of Object.entries(raw)) if (flag === true) record.forwarded[id(key)] = true;
  }
  if (data.preferences !== undefined) {
    const prefs = data.preferences;
    if (!plain(prefs)) invalid('旧设置格式不正确');
    if (state.preferences.revision === 0) {
      state.preferences = { ...state.preferences, revision: 1, sendShortcut: prefs.sendShortcut === 'mod-enter' ? 'mod-enter' : 'enter', forwardPrefix: text(prefs.forwardPrefix ?? '', 2000, true), scopeMode: prefs.scopeMode === 'session' ? 'session' : 'workspace', panelWidth: prefs.panelWidth ?? state.preferences.panelWidth, panelHeight: prefs.panelHeight ?? state.preferences.panelHeight, sections: prefs.sections ?? state.preferences.sections };
      validatePresentation(state.preferences);
    }
  }
  for (const key of changed) state.records[key].revision++;
  state.imports.push(digest);
  return { imported, alreadyImported: false };
}
