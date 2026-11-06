import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export const PERSONS = Object.freeze(['通用', '爸爸', '妈妈', '赞赞']);
const MAX_ITEMS = 2000;
const queues = new Map();

export class ChecklistError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const invalid = (message) => { throw new ChecklistError(400, 'invalid_request', message); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validRevision = (value) => Number.isSafeInteger(value) && value >= 0;
function text(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) {
    invalid('text must contain 1–500 characters after trimming');
  }
  return value.trim();
}
function person(value) {
  if (!PERSONS.includes(value)) invalid('person must be 通用, 爸爸, 妈妈 or 赞赞');
  return value;
}
function keys(value, allowed) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid('Unknown field');
}
function validateCommand(command) {
  if (!object(command) || !validRevision(command.revision)) invalid('revision must be a non-negative safe integer');
  const fields = {
    add: ['text', 'person'], update: ['id', 'text', 'person', 'checked'],
    delete: ['id'], reset: [], move: ['id', 'direction'],
  };
  if (typeof command.action !== 'string' || !Object.hasOwn(fields, command.action)) invalid('Unknown action');
  keys(command, ['revision', 'action', ...fields[command.action]]);
  const result = { ...command };
  if (['update', 'delete', 'move'].includes(command.action) &&
      (typeof command.id !== 'string' || !command.id || command.id.length > 128)) invalid('Invalid id');
  if (command.action === 'add' || Object.hasOwn(command, 'text')) result.text = text(command.text);
  if (command.action === 'add') result.person = person(command.person ?? '通用');
  else if (Object.hasOwn(command, 'person')) result.person = person(command.person);
  if (Object.hasOwn(command, 'checked') && typeof command.checked !== 'boolean') invalid('checked must be boolean');
  if (command.action === 'update' && !['text', 'person', 'checked'].some((key) => Object.hasOwn(command, key))) invalid('update requires at least one field');
  if (command.action === 'move' && !['up', 'down'].includes(command.direction)) invalid('direction must be up or down');
  return result;
}
function validateSnapshot(value) {
  if (!object(value) || !validRevision(value.revision) || !Array.isArray(value.items) || value.items.length > MAX_ITEMS) throw new Error('Invalid snapshot');
  keys(value, ['items', 'revision']);
  const ids = new Set();
  for (const item of value.items) {
    if (!object(item) || typeof item.id !== 'string' || !item.id || item.id.length > 128 || ids.has(item.id) || typeof item.checked !== 'boolean') throw new Error('Invalid item');
    keys(item, ['id', 'text', 'person', 'checked']);
    if (text(item.text) !== item.text) throw new Error('Invalid text');
    person(item.person);
    ids.add(item.id);
  }
  return value;
}

export function resolveDataFile(dataFile) {
  if (dataFile === undefined) return join(homedir(), '.dsh', 'outing-checklist.json');
  if (typeof dataFile !== 'string' || !dataFile.trim() || dataFile.includes('\0')) throw new TypeError('config.dataFile must be a non-empty path');
  return resolve(dataFile.startsWith('~/') ? join(homedir(), dataFile.slice(2)) : dataFile);
}

export function createStore({ dataFile } = {}) {
  const file = resolveDataFile(dataFile);
  // Shared by all instances for this resolved path, including hot-reloaded contexts.
  // One process owns the file; this is not an inter-process lock.
  function serial(operation) {
    const previous = queues.get(file) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.catch(() => {});
    queues.set(file, tail);
    void tail.then(() => { if (queues.get(file) === tail) queues.delete(file); });
    return result;
  }
  async function load() {
    let raw;
    try { raw = await readFile(file, 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') return { items: [], revision: 0 };
      throw new ChecklistError(500, 'storage_error', 'Unable to read checklist');
    }
    try { return validateSnapshot(JSON.parse(raw)); }
    catch { throw new ChecklistError(500, 'storage_error', 'Checklist data is invalid; existing file was not changed'); }
  }
  async function save(snapshot) {
    const directory = dirname(file);
    const temporary = join(directory, `.${basename(file)}.${randomUUID()}.tmp`);
    let handle;
    let created = false;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      handle = await open(temporary, 'wx', 0o600);
      created = true;
      await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      // Both paths are resolved siblings; rename replaces only the configured file.
      if (dirname(temporary) !== directory || temporary === file) throw new Error('Invalid temporary path');
      await rename(temporary, file);
      created = false;
    } catch {
      throw new ChecklistError(500, 'storage_error', 'Unable to save checklist');
    } finally {
      if (handle) await handle.close().catch(() => {});
      if (created && dirname(temporary) === directory && temporary !== file) await unlink(temporary).catch(() => {});
    }
  }
  return {
    read: () => serial(load),
    mutate: (input) => serial(async () => {
      const command = validateCommand(input);
      const snapshot = await load();
      if (command.revision !== snapshot.revision) throw new ChecklistError(409, 'revision_conflict', 'Checklist changed; reload and retry', { revision: snapshot.revision });
      if (snapshot.revision === Number.MAX_SAFE_INTEGER) throw new ChecklistError(409, 'revision_exhausted', 'Revision limit reached');
      const items = snapshot.items;
      const index = items.findIndex((item) => item.id === command.id);
      if (['update', 'delete', 'move'].includes(command.action) && index < 0) throw new ChecklistError(404, 'item_not_found', 'Checklist item not found');
      switch (command.action) {
        case 'add':
          if (items.length >= MAX_ITEMS) invalid('Checklist may contain at most 2000 items');
          items.push({ id: randomUUID(), text: command.text, person: command.person, checked: false });
          break;
        case 'update':
          for (const key of ['text', 'person', 'checked']) if (Object.hasOwn(command, key)) items[index][key] = command[key];
          break;
        case 'delete': items.splice(index, 1); break;
        case 'reset': for (const item of items) item.checked = false; break;
        case 'move': {
          const next = index + (command.direction === 'up' ? -1 : 1);
          if (next >= 0 && next < items.length) [items[index], items[next]] = [items[next], items[index]];
          break;
        }
      }
      snapshot.revision++;
      await save(snapshot);
      return snapshot;
    }),
  };
}
