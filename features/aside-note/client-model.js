// Inlined by the root build; also exercised directly in Node tests.
export class NotesClient {
  constructor(request, timers = globalThis) {
    this.request = request; this.timers = timers; this.entries = new Map(); this.listeners = new Set(); this.disposed = false;
    this.preferences = { record: null, value: null, latest: null, dirty: false, pending: 0, error: '', conflict: false };
    this.preferenceToken = 0; this.preferenceTimer = null; this.preferenceChain = Promise.resolve();
  }
  emit() { if (!this.disposed) for (const fn of this.listeners) fn(); }
  acceptPreferences(value) {
    if (!value || (this.preferences.latest && value.revision < this.preferences.latest.revision)) return;
    const current = this.preferences;
    this.preferences = { ...current, latest: value, ...(!current.dirty && !current.pending ? { record: value, value } : {}) };
  }
  setPreferences(patch) {
    if (this.disposed || !this.preferences.value) return;
    this.preferenceToken++;
    this.preferences = { ...this.preferences, value: { ...this.preferences.value, ...patch }, dirty: true };
    this.timers.clearTimeout(this.preferenceTimer);
    if (!this.preferences.conflict) this.preferenceTimer = this.timers.setTimeout(() => { void this.savePreferences(); }, 650);
    this.emit();
  }
  savePreferences(explicit = false) {
    this.timers.clearTimeout(this.preferenceTimer);
    const task = this.preferenceChain.then(async () => {
      const current = this.preferences;
      if (this.disposed) return false;
      if (!current.dirty) return true;
      if (current.conflict && !explicit) return false;
      const token = this.preferenceToken;
      this.preferences = { ...current, pending: 1 }; this.emit();
      try {
        const saved = await this.request({ ...current.value, action: 'preferences', revision: current.record.revision });
        const unchanged = token === this.preferenceToken;
        this.preferences = { ...this.preferences, record: saved, latest: saved, ...(unchanged ? { value: saved, dirty: false } : {}), error: '', conflict: false };
        for (const entry of this.entries.values()) if (entry.state.record) this.publish(entry, { record: { ...entry.state.record, preferences: saved } });
        return true;
      } catch (error) {
        this.preferences = { ...this.preferences, error: error.message, conflict: error.status === 409 || this.preferences.conflict }; return false;
      } finally { this.preferences = { ...this.preferences, pending: 0 }; this.emit(); }
    });
    this.preferenceChain = task; return task;
  }
  resumePreferences() {
    const current = this.preferences;
    if (!current.latest) return;
    this.preferences = { ...current, record: current.latest, conflict: false, error: '' }; this.emit();
  }
  entry(scope) {
    const key = JSON.stringify([scope.kind, scope.id]);
    if (!this.entries.has(key)) this.entries.set(key, { scope, state: { record: null, draft: { add: '', edits: {} }, dirty: false, pending: 0, error: '', conflict: false }, chain: Promise.resolve(), token: 0, epoch: 0, timer: null, loading: null });
    return this.entries.get(key);
  }
  snapshot(scope) { return this.entry(scope).state; }
  subscribe = fn => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  publish(entry, update) { entry.state = { ...entry.state, ...update }; this.emit(); }
  async load(scope) {
    const entry = this.entry(scope);
    if (entry.loading || entry.state.pending) return entry.loading;
    const epoch = entry.epoch;
    entry.loading = this.request(null, scope).then(record => {
      if (epoch !== entry.epoch) return;
      this.acceptPreferences(record.preferences);
      this.publish(entry, { record, ...(!entry.state.dirty ? { draft: record.draft } : {}), error: entry.state.conflict ? entry.state.error : '' });
    }).catch(error => this.publish(entry, { error: error.message })).finally(() => { entry.loading = null; });
    return entry.loading;
  }
  setDraft(scope, value) {
    if (this.disposed) return;
    const entry = this.entry(scope);
    this.timers.clearTimeout(entry.timer); entry.token++;
    this.publish(entry, { draft: value, dirty: true });
    if (!entry.state.conflict) entry.timer = this.timers.setTimeout(() => { void this.saveDraft(scope); }, 650);
  }
  async saveDraft(scope, explicit = false) {
    const entry = this.entry(scope);
    this.timers.clearTimeout(entry.timer);
    if (!entry.state.dirty || !entry.state.record) return !entry.state.dirty;
    return this.mutate(scope, { action: 'draft', draft: entry.state.draft }, { draftToken: entry.token, explicit });
  }
  mutate(scope, command, { draftToken, explicit = false } = {}) {
    const entry = this.entry(scope);
    entry.epoch++;
    this.publish(entry, { pending: entry.state.pending + 1 });
    const task = entry.chain.then(async () => {
      if (this.disposed) return false;
      if (command.action === 'draft' && draftToken !== entry.token) return true;
      if (!entry.state.record) throw new Error('请先加载服务端数据');
      if (entry.state.conflict && !explicit) throw new Error('其他浏览器已修改数据。请先刷新，再手动重试；输入仍保留');
      const token = entry.token;
      try {
        const record = await this.request({ ...command, scope, revision: entry.state.record.revision });
        this.acceptPreferences(record.preferences);
        const update = { record, error: '', conflict: false };
        if (command.action === 'draft' && draftToken === entry.token) Object.assign(update, { dirty: false, draft: record.draft });
        else if (command.action === 'add' && token === entry.token) {
          this.timers.clearTimeout(entry.timer); entry.token++;
          Object.assign(update, { draft: { ...entry.state.draft, add: '' } });
          // Existing edit drafts may still need saving.
          update.dirty = JSON.stringify(update.draft) !== JSON.stringify(record.draft);
        } else if (command.action === 'update' && command.text !== undefined && token === entry.token) {
          const edits = { ...entry.state.draft.edits }; delete edits[command.id];
          Object.assign(update, { draft: { ...entry.state.draft, edits } });
          update.dirty = JSON.stringify(update.draft) !== JSON.stringify(record.draft);
        } else if (!entry.state.dirty) update.draft = record.draft;
        this.publish(entry, update); return true;
      } catch (error) {
        this.publish(entry, { error: error.message, ...(error.status === 409 ? { conflict: true } : {}) }); return false;
      }
    }).catch(error => { this.publish(entry, { error: error.message }); return false; }).finally(() => this.publish(entry, { pending: entry.state.pending - 1 }));
    entry.chain = task; return task;
  }
  async refresh(scope) {
    const entry = this.entry(scope);
    await entry.chain;
    await this.load(scope);
    // Refresh does not resubmit anything or discard local drafts. Next deliberate
    // action uses the fresh revision; automatic draft saving stays paused.
  }
  resume(scope) { const entry = this.entry(scope); this.publish(entry, { conflict: false, error: '' }); }
  hasUnsaved() { return this.preferences.dirty || this.preferences.pending || [...this.entries.values()].some(entry => entry.state.dirty || entry.state.pending); }
  dispose() { this.disposed = true; if (this.preferenceTimer !== null) this.timers.clearTimeout(this.preferenceTimer); for (const entry of this.entries.values()) this.timers.clearTimeout(entry.timer); this.listeners.clear(); }
}

export function collectLegacy(storage) {
  const result = {};
  for (const [name, key] of [['sessions', 'dsh.aside-note'], ['workspaces', 'dsh.aside-note.workspaces'], ['drafts', 'dsh.aside-note.drafts'], ['forwarded', 'dsh.aside-note.forwarded']]) {
    const raw = storage.getItem(key);
    if (raw !== null) { try { result[name] = JSON.parse(raw); } catch { throw new Error('旧插件数据无法解析，未执行迁移。请先导出原浏览器数据'); } }
  }
  const sendShortcut = storage.getItem('dsh.aside-note.send-shortcut');
  const forwardPrefix = storage.getItem('dsh.aside-note.forward-prefix');
  const scopeMode = storage.getItem('dsh.aside-note.scope-mode');
  if (sendShortcut !== null || forwardPrefix !== null || scopeMode !== null) result.preferences = { sendShortcut: sendShortcut === 'ctrl-enter' ? 'mod-enter' : sendShortcut ?? 'enter', forwardPrefix: forwardPrefix ?? '', scopeMode: scopeMode ?? 'workspace' };
  const width = storage.getItem('dsh.aside-note.panel-width'), height = storage.getItem('dsh.aside-note.panel-height'), sections = storage.getItem('dsh.aside-note.sections');
  if (width !== null || height !== null || sections !== null) {
    result.preferences ||= { sendShortcut: 'enter', forwardPrefix: '', scopeMode: 'workspace' };
    if (width !== null) result.preferences.panelWidth = Math.round(Number(width));
    if (height !== null) result.preferences.panelHeight = Math.round(Number(height));
    if (sections !== null) { try { result.preferences.sections = JSON.parse(sections); } catch { throw new Error('旧分区设置无法解析，未执行迁移'); } }
  }
  if (!Object.keys(result).length) throw new Error('当前浏览器没有原插件数据。请在曾经使用旁边记的浏览器、同一站点打开此页面迁移');
  return result;
}
