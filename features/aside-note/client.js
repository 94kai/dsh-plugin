window.__ModuleLoader__.load({
  id: '@local/pocket-kit-aside-note',
  factory(require) {
    const React = require('react'), h = React.createElement;
    const react = { default: React };
    const ReactDOM = require('react-dom');
    const _deepseek_ai_dsh_client_ui_primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const SEND_SHORTCUT_DEFAULT = 'enter', CLEAR_CONFIRM_MS = 5000;
    const PLUGIN_VERSION = '1.7.1 · 工具箱', PLUGIN_AUTHOR = '阿三石（原版）';
    const PLUGIN_REPO_URL = 'https://github.com/Rayle8/dsh-aside-note', PLUGIN_REPO_LABEL = 'github.com/Rayle8/dsh-aside-note';
    const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');
    const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';
    const isSendModifier = event => IS_MAC ? event.metaKey === true : event.ctrlKey === true;
    async function copyText(value) { try { await navigator.clipboard.writeText(value); return true; } catch { return false; } }
    /* NOTES_MODEL */
    /* NOTES_ORIGINAL_UI */
    const originalCss = /* NOTES_ORIGINAL_CSS */ '';
    // Normal-state dimensions, colours, glyphs and markup are the upstream UI.
    // Supplemental rules only contain the new maintenance/error states.
    const css = originalCss + `
.pk-an-scopeChoices input{border-radius:4px}.pk-an-settingsScroll{min-height:0;overflow:auto;flex-shrink:1;overscroll-behavior:contain}.pk-an-tools{margin-top:8px}.pk-an-tools .pk-an-settingBody{gap:8px}.pk-an-toolsActions{display:flex;gap:8px;flex-wrap:wrap}.pk-an-serverMessage{overflow-wrap:anywhere;white-space:pre-wrap}.pk-an-popFoot button{margin-left:8px}.pk-an-popover{max-height:calc(100dvh - 24px)}
`;
    const copy = { ...zh, 'popover.storage': '按会话隔离 · 数据保存在服务端', 'popover.shared': '工作区共享 · 数据保存在服务端', 'scope.global': '全局', 'popover.global': '全局共享 · 数据保存在服务端', 'storage.failed': '服务端保存失败，输入已保留，请重试' };
    const say = (key, vars) => String(copy[key] || key).replace(/\{(\w+)\}/g, (match, name) => vars?.[name] == null ? match : String(vars[name]));
    const DEFAULT_VISIBLE_SCOPES = { session: true, workspace: true, global: true };
    function scopeFor(binding, mode, visibility = DEFAULT_VISIBLE_SCOPES) {
      const available = ['global', 'workspace', 'session'].filter(kind => visibility[kind] && (kind === 'global' || (kind === 'workspace' ? !!binding?.workspace : !!binding?.sessionId)));
      const preferred = mode === 'workspace' && !binding?.workspace && available.includes('session') ? 'session' : mode;
      const kind = available.includes(preferred) ? preferred : available[0];
      return !kind ? null : kind === 'global' ? { kind, id: 'all' } : { kind, id: kind === 'workspace' ? binding.workspace.workspaceId : binding.sessionId };
    }
    const urlFor = scope => {
      const url = new URL('api/pocket-kit/aside-note', document.baseURI);
      if (scope) { url.searchParams.set('kind', scope.kind); url.searchParams.set('id', scope.id); }
      return url;
    };
    function HeaderGlyph() { return h('span', { className: 'pk-an-headerIcon', dangerouslySetInnerHTML: { __html: HEADER_ICON } }); }
    function HeaderButton({ count = 0, active, kind, onClick }) {
      return h('button', { type: 'button', className: 'pk-an-headerBtn', 'data-active': active ? 'true' : 'false', 'data-scope': kind, 'data-pocket-kit-aside-note': 'true', title: count > 0 ? say('header.tooltip', { n: count }) : say('header.tooltipEmpty'), 'aria-label': count > 0 ? `${say('dock.open')}, ${say('dock.count', { n: count })}` : say('dock.open'), 'aria-expanded': !!active, onPointerDown: event => event.stopPropagation(), onClick },
        h(HeaderGlyph), count > 0 ? h('span', { className: 'pk-an-headerCount' }, count > 99 ? '99+' : String(count)) : null);
    }
    return { inject: ['slots'], apply(ctx) {
      const controllers = new Set();
      async function request(command, scope) {
        const controller = new AbortController(); controllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(urlFor(scope), { method: command ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, ...(command ? { headers: { 'Content-Type': 'application/json', 'X-Pocket-Kit': '1' }, body: JSON.stringify(command) } : {}) });
          let result; try { result = await response.json(); } catch { throw new Error('服务返回异常，请检查登录并刷新列表'); }
          if (!response.ok) { const error = new Error(response.status === 401 ? '登录已失效，请重新登录后重试' : result.message || '服务暂不可用'); error.status = response.status; throw error; }
          return result;
        } catch (error) {
          if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('网络异常或请求超时。请先刷新确认是否已保存，输入仍保留；不要重复添加');
          throw error;
        } finally { clearTimeout(timeout); controllers.delete(controller); }
      }
      const model = new NotesClient(request), toastSeat = createToastSeat(say);
      const listeners = new Set();
      let view = { binding: null, open: false, anchorRef: { current: null } };
      const publish = patch => { view = { ...view, ...patch }; for (const fn of listeners) fn(); };
      const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
      const useView = () => React.useSyncExternalStore(subscribe, () => view);
      const unavailable = { record: null, draft: { add: '', edits: {} }, pending: 0, dirty: false, conflict: false, error: '' };
      const metadataScope = { kind: 'global', id: 'all' };
      const useRecord = scope => React.useSyncExternalStore(model.subscribe, () => scope ? model.snapshot(scope) : unavailable);
      const usePreferences = () => React.useSyncExternalStore(model.subscribe, () => model.preferences);
      const close = () => {
        const anchor = view.anchorRef.current;
        publish({ open: false });
        if (anchor?.isConnected) anchor.focus?.({ preventScroll: true });
      };
      const open = anchor => {
        if (view.open && view.anchorRef.current === anchor) { close(); return; }
        publish({ open: true, anchorRef: { current: anchor || null } });
      };
      const noSnapshot = () => null;
      function useRefresh(scope, interval = 10000) {
        // Visibility is presentation only, not access control. Keep preferences
        // refreshable even when the sole enabled scope lacks a current context.
        scope ||= metadataScope;
        React.useEffect(() => {
          void model.load(scope);
          const refresh = () => { if (!document.hidden) void model.load(scope); };
          const timer = setInterval(refresh, interval);
          window.addEventListener('focus', refresh);
          return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
        }, [scope.kind, scope.id, interval]);
      }
      function Header(props) {
        const current = useView(), preferences = usePreferences();
        const workspaces = (props.useWorkspaces || noSnapshot)(state => state);
        const input = (props.useInput || noSnapshot)(state => state);
        const workspace = (workspaces?.items || []).find(value => value.sessionIds?.includes(props.sessionId)) || null;
        React.useEffect(() => {
          const changed = view.binding && (view.binding.sessionId !== props.sessionId || view.binding.workspace?.workspaceId !== workspace?.workspaceId);
          publish({ binding: { sessionId: props.sessionId, workspace, input, inputActions: props.inputActions, active: true }, ...(changed ? { open: false } : {}) });
        }, [props.sessionId, workspace, input, props.inputActions]);
        React.useEffect(() => () => { if (view.binding?.sessionId === props.sessionId) publish({ binding: { ...view.binding, active: false }, open: false }); }, [props.sessionId]);
        const scope = scopeFor({ sessionId: props.sessionId, workspace }, preferences.value?.scopeMode || 'workspace', preferences.value?.visibleScopes), state = useRecord(scope);
        useRefresh(scope, 15000);
        return h(React.Fragment, null, h('style', null, css), h(HeaderButton, { count: state.record?.items.filter(item => !item.done).length || 0, active: current.open, kind: scope?.kind, onClick: event => { event.preventDefault(); event.stopPropagation(); open(event.currentTarget); } }));
      }
      function forwardToComposer(binding, text, prefix) {
        if (!binding?.active || !binding.inputActions?.insertText || !binding.input || !['plain', 'claimed'].includes(binding.input.phase)) return false;
        const current = binding.input.draft || '', lead = prefix.trim();
        const value = (current.trim() ? (current.endsWith('\n') ? '' : '\n') : (lead ? lead + '\n' : '')) + '- ' + text;
        const accepted = binding.inputActions.insertText(value, { start: current.length, end: current.length, draftRev: binding.input.draftRev });
        if (accepted) binding.inputActions.persistDraft?.();
        return accepted;
      }
      function ServerTools({ scope, report }) {
        const state = useRecord(scope), prefs = usePreferences(), [busy, setBusy] = React.useState(false);
        async function migrate() {
          if (!window.confirm('将当前浏览器中原“旁边记”的便笺、草稿和设置合并到服务端？不会删除原数据或覆盖现有便笺，迁移期间请勿继续编辑原插件。')) return;
          setBusy(true);
          try {
            if (state.dirty && !await model.saveDraft(scope)) throw new Error('请先处理草稿保存错误');
            if (prefs.dirty && !await model.savePreferences()) throw new Error('请先处理设置保存错误');
            const result = await request({ action: 'import', data: collectLegacy(window.localStorage) });
            await model.refresh(scope || metadataScope);
            report(result.alreadyImported ? '这批数据已迁移，无需重复导入。原浏览器数据仍保留。' : `迁移完成，新增 ${result.imported} 条便笺。旧草稿按会话保存，请切换会话范围核对。`);
          } catch (error) { report(error.message); } finally { setBusy(false); }
        }
        async function backup() {
          setBusy(true);
          try {
            const response = await fetch(new URL('api/pocket-kit/aside-note?export=1', document.baseURI), { credentials: 'same-origin', cache: 'no-store' });
            if (!response.ok) throw new Error('导出失败，请检查登录后重试');
            const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
            link.href = url; link.download = 'aside-note-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (error) { report(error.message); } finally { setBusy(false); }
        }
        const orphanEdits = Object.entries(state.draft.edits).filter(([id]) => !state.record?.items.some(item => item.id === id));
        return h('div', { className: 'pk-an-settings pk-an-tools' }, h('div', { className: 'pk-an-settingsHead' }, '数据与迁移'),
          h('div', { className: 'pk-an-settingBody' }, h('p', { className: 'pk-an-settingHint' }, '便笺、草稿、设置和面板尺寸均保存到服务端。核对迁移结果后再卸载原独立插件。'),
            h('div', { className: 'pk-an-toolsActions' }, h('button', { className: 'pk-an-mini', disabled: busy || !!state.pending || state.conflict || prefs.conflict, onClick: migrate }, busy ? '处理中…' : '迁移原插件浏览器数据'), h('button', { className: 'pk-an-mini', disabled: busy, onClick: backup }, '导出服务端备份'), h('button', { className: 'pk-an-mini', disabled: busy || !!state.pending, onClick: () => model.refresh(scope || metadataScope) }, '刷新服务端数据')),
            prefs.error && h('p', { className: 'pk-an-settingHint pk-an-error', role: 'alert' }, prefs.error),
            prefs.dirty && h('button', { className: 'pk-an-mini', disabled: !!prefs.pending, onClick: async () => { if (prefs.conflict) { if (!window.confirm('先刷新并核对设置。确认用当前保留的设置输入继续保存？')) return; await model.refresh(scope || metadataScope); model.resumePreferences(); } await model.savePreferences(true); } }, '重试保存设置'),
            state.dirty && h('button', { className: 'pk-an-mini', disabled: !!state.pending || state.conflict, onClick: () => model.saveDraft(scope, true) }, '重试保存草稿'),
            orphanEdits.length > 0 && h('div', { className: 'pk-an-settingGroup' }, h('div', { className: 'pk-an-settingLabel' }, '恢复旧编辑草稿'), orphanEdits.map(([id, text]) => h('div', { key: id, className: 'pk-an-settingItem' }, h('p', { className: 'pk-an-text' }, text), h('button', { className: 'pk-an-mini', onClick: () => { const current = model.snapshot(scope).draft; if (!current.add || window.confirm('用这份旧编辑草稿替换当前新增输入？请先确认已备份。')) model.setDraft(scope, { ...current, add: text }); } }, '放入新增框继续编辑'))))));
      }
      function Panel({ scope, binding, anchorRef, onClose }) {
        const state = useRecord(scope), preferences = usePreferences(), prefs = preferences.value || { scopeMode: 'workspace', sendShortcut: 'enter', forwardPrefix: '', panelWidth: 360, panelHeight: 0, sections: { open: true, done: false } };
        const { record, draft, pending, conflict } = state;
        const scopeIdentity = JSON.stringify(scope), activeScopeRef = React.useRef(scopeIdentity);
        activeScopeRef.current = scopeIdentity;
        const [showSettings, setShowSettings] = React.useState(false), [showTools, setShowTools] = React.useState(false), [notice, setNotice] = React.useState('');
        const [editingId, setEditingId] = React.useState(null), [editDraft, setEditDraft] = React.useState('');
        const addRef = React.useRef(null), editRef = React.useRef(null), composingRef = React.useRef(false), panelRef = React.useRef(null), finishRef = React.useRef(false), seeded = React.useRef('');
        const persist = React.useCallback(patch => model.setPreferences(patch), []);
        const changeVisibility = (kind, checked) => {
          if (!['session', 'workspace', 'global'].includes(kind) || typeof checked !== 'boolean') return;
          const current = model.preferences.value || prefs;
          const visibleScopes = { ...(current.visibleScopes || DEFAULT_VISIBLE_SCOPES), [kind]: checked };
          if (!Object.values(visibleScopes).some(Boolean)) return;
          const selected = scopeFor(binding, current.scopeMode, visibleScopes);
          persist({ visibleScopes, scopeMode: selected?.kind || (visibleScopes[current.scopeMode] ? current.scopeMode : ['global', 'workspace', 'session'].find(value => visibleScopes[value])) });
        };
        const geometry = usePanelGeometry(anchorRef, 'right', panelRef, prefs, persist);
        const prefixRef = React.useRef(null), sections = prefs.sections || { open: true, done: false };
        const items = record?.items || [], openItems = items.filter(item => !item.done), doneItems = items.filter(item => item.done).sort(compareDoneItems);
        const { listRef, listHasMore, syncListEdge } = useListEdge({ items, showOpen: sections.open, showDone: sections.done });
        const report = kind => toastSeat.show(kind);
        useRefresh(scope);
        React.useEffect(() => { setEditingId(null); setEditDraft(''); setNotice(''); seeded.current = ''; }, [scope?.kind, scope?.id]);
        useOutsideDismiss(panelRef, anchorRef, onClose);
        React.useEffect(() => {
          const members = binding?.workspace?.sessionIds || [], key = members.join('\0');
          if (scope?.kind !== 'workspace' || !record || pending || conflict || seeded.current === key) return;
          seeded.current = key;
          if (members.some(id => !record.seededSessionIds.includes(id))) void model.mutate(scope, { action: 'seed', sessionIds: members });
        }, [record, pending, conflict, binding?.workspace]);
        const grow = node => { if (node) { node.style.height = 'auto'; node.style.height = `${node.scrollHeight + 2}px`; } };
        React.useEffect(() => grow(addRef.current), [draft.add]);
        React.useEffect(() => grow(prefixRef.current), [prefs.forwardPrefix, showSettings]);
        React.useLayoutEffect(() => { if (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) { addRef.current?.focus(); const end = addRef.current?.value.length || 0; addRef.current?.setSelectionRange?.(end, end); } }, []);
        React.useEffect(() => { if (editingId) { editRef.current?.focus(); editRef.current?.select(); } }, [editingId]);
        const disabled = !record || !!pending || conflict;
        const run = async command => {
          if (!scope) return false;
          const latest = model.snapshot(scope);
          if (!latest.record || latest.pending || latest.conflict) return false;
          const ok = await model.mutate(scope, command); if (!ok) report('saveFailed'); return ok;
        };
        const changeAdd = value => { const current = model.snapshot(scope).draft; model.setDraft(scope, { ...current, add: value }); };
        const changeEdit = value => { setEditDraft(value); const current = model.snapshot(scope).draft; model.setDraft(scope, { ...current, edits: { ...current.edits, [editingId]: value } }); };
        const cancelEdit = () => {
          const current = model.snapshot(scope).draft, edits = { ...current.edits }; delete edits[editingId];
          model.setDraft(scope, { ...current, edits }); setEditingId(null); setEditDraft('');
        };
        const finishEdit = async item => {
          if (!editingId || finishRef.current || disabled) return;
          if (!editDraft.trim()) return;
          if (editDraft.trim() === item.text) { cancelEdit(); return; }
          finishRef.current = true;
          const token = model.entry(scope).token;
          try { if (await run({ action: 'update', id: item.id, text: editDraft.trim() }) && activeScopeRef.current === scopeIdentity && model.entry(scope).token === token) { setEditingId(null); setEditDraft(''); } }
          finally { finishRef.current = false; }
        };
        const add = () => { const value = model.snapshot(scope).draft.add.trim(); if (value) void run({ action: 'add', text: value }); };
        const insertNewline = node => {
          const start = node.selectionStart ?? node.value.length, end = node.selectionEnd ?? start;
          changeAdd(`${node.value.slice(0, start)}\n${node.value.slice(end)}`);
          window.requestAnimationFrame(() => { node.setSelectionRange?.(start + 1, start + 1); grow(node); });
        };
        const onDraftKeyDown = event => {
          if (event.key === 'Escape') { event.currentTarget.blur(); return; }
          if (event.key !== 'Enter') return;
          if (event.isComposing || event.nativeEvent?.isComposing || composingRef.current) { event.preventDefault(); return; }
          const chord = event.ctrlKey || event.metaKey;
          if (prefs.sendShortcut === 'enter' ? !chord && !event.shiftKey : isSendModifier(event)) { event.preventDefault(); add(); }
          else if (prefs.sendShortcut === 'enter' && (chord || event.shiftKey)) { event.preventDefault(); insertNewline(event.currentTarget); }
        };
        const clearDone = async () => { if (await run({ action: 'clear' })) { report('cleared'); persist({ sections: { ...sections, done: false } }); } };
        const confirmation = useClearConfirm({ sessionId: JSON.stringify(scope), showDone: sections.done, doneCount: doneItems.length, onConfirm: clearDone });
        const row = item => h(TodoRow, {
          key: item.id, item, done: item.done, say, localeId: 'zh-CN', onToast: report, disabled,
          onToggle: value => run({ action: 'update', id: value.id, done: !value.done }),
          onStartEdit: value => { setEditingId(value.id); setEditDraft(model.snapshot(scope).draft.edits[value.id] ?? value.text); },
          onDelete: async value => { if (await run({ action: 'delete', id: value.id })) { report('deleted'); if (activeScopeRef.current === scopeIdentity && editingId === value.id) setEditingId(null); } },
          editing: editingId === item.id, editDraft, setEditDraft: changeEdit, onFinishEdit: finishEdit, onCancelEdit: cancelEdit, editRef,
          forwardPrefix: prefs.forwardPrefix, sendShortcut: prefs.sendShortcut === 'mod-enter' ? 'ctrl-enter' : 'enter', forwarded: record?.forwarded[item.id] === true,
          onForwardRequest: (text, prefix) => !disabled && forwardToComposer(binding, text, prefix),
          onForwarded: value => run({ action: 'forward', id: value.id, forwarded: true }), onUnforwarded: value => run({ action: 'forward', id: value.id, forwarded: false }),
        });
        const error = state.error || preferences.error;
        const status = error || (!scope ? '当前启用的范围不可用，请打开对应工作区/会话，或在设置中启用其他范围' : !record ? '正在加载服务端便笺…' : pending || preferences.pending ? '正在保存到服务端…' : state.dirty || preferences.dirty ? '草稿或设置尚未保存到服务端' : say(scope.kind === 'global' ? 'popover.global' : scope.kind === 'workspace' ? 'popover.shared' : 'popover.storage'));
        return h('div', { ref: panelRef, className: 'pk-an-popover pk-an-popoverRight', style: geometry.style, role: 'dialog', 'aria-label': say('popover.title'), 'data-pocket-kit-aside-note': 'true' },
          h('div', { className: 'pk-an-resizeHandle', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': say('resize.width'), tabIndex: 0, title: say('resize.hint'), onPointerDown: geometry.startPanelResize, onDoubleClick: () => geometry.commitPanelWidth(360), onKeyDown: geometry.onPanelResizeKeyDown }),
          h('div', { className: 'pk-an-resizeHandleBottom', role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': say('resize.height'), tabIndex: 0, title: say('resize.hint'), onPointerDown: geometry.startPanelHeightResize, onDoubleClick: () => geometry.commitPanelHeight(0), onKeyDown: geometry.onPanelHeightKeyDown }),
          h(PanelHead, { say, openCount: openItems.length, total: items.length, showSettings, onToggleSettings: () => setShowSettings(value => !value), onClose, scopeMode: scope?.kind || prefs.scopeMode, visibleScopes: prefs.visibleScopes, canUseWorkspace: !!binding?.workspace, canUseSession: !!binding?.sessionId, onScopeChange: value => { if (value !== scope?.kind) persist({ scopeMode: value }); } }),
          showSettings ? h('div', { className: 'pk-an-settingsScroll' }, h(SettingsPanel, { say, visibleScopes: prefs.visibleScopes, onVisibilityChange: changeVisibility, sendShortcut: prefs.sendShortcut === 'mod-enter' ? 'ctrl-enter' : 'enter', chooseShortcut: value => persist({ sendShortcut: value === 'ctrl-enter' ? 'mod-enter' : 'enter' }), forwardPrefix: prefs.forwardPrefix, changeForwardPrefix: value => persist({ forwardPrefix: value }), prefixRef, onDataTools: () => setShowTools(value => !value) }), showTools ? h(ServerTools, { scope, report: setNotice }) : null) : null,
          scope ? h(ComposerForm, { say, draft: draft.add, inputRef: addRef, disabled, sendShortcut: prefs.sendShortcut, onDraftChange: event => { changeAdd(event.target.value); grow(event.target); }, onCompositionStart: () => { composingRef.current = true; }, onCompositionEnd: () => { composingRef.current = false; }, onKeyDown: onDraftKeyDown, onSubmit: event => { event.preventDefault(); if (!composingRef.current) add(); } }) : h(EmptyState, { title: '当前没有可用范围', body: '请打开对应工作区/会话，或在设置中启用其他范围。' }),
          scope && h(NoteList, { say, listRef, listHasMore, syncListEdge, showOpen: sections.open, toggleOpen: () => persist({ sections: { ...sections, open: !sections.open } }), openItems, openCount: openItems.length, total: items.length, row, showDone: sections.done, toggleDone: () => persist({ sections: { ...sections, done: !sections.done } }), doneItems, ...confirmation, disabled }),
          h('div', { className: 'pk-an-popFoot pk-an-serverMessage', role: error ? 'alert' : 'status' }, h('span', { className: error ? 'pk-an-error' : undefined }, notice || status),
            error && h('button', { className: 'pk-an-mini', disabled: !!pending, onClick: async () => { await model.refresh(scope || metadataScope); if (scope && model.snapshot(scope).conflict && window.confirm('列表已刷新，输入已保留。请核对后确认继续编辑；不会自动重放上次操作。')) model.resume(scope); if (model.preferences.conflict) setShowSettings(true); } }, '刷新并重试')));
      }
      function Overlay() {
        const current = useView(), preferences = usePreferences();
        if (!current.open) return null;
        const scope = scopeFor(current.binding, preferences.value?.scopeMode || (current.binding?.sessionId ? 'workspace' : 'global'), preferences.value?.visibleScopes);
        return h(React.Fragment, null, h('style', null, css), ReactDOM.createPortal(h(Panel, { scope, binding: current.binding, anchorRef: current.anchorRef, onClose: close }), document.body));
      }
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'pocket-kit.aside-note', order: 30 }, props => h(Header, props)));
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'pocket-kit.aside-note.overlay', order: 70 }, () => h(React.Fragment, null, h(Overlay), h(toastSeat.ToastHost))));
      ctx.effect(() => {
        const unload = event => { if (model.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener?.('beforeunload', unload);
        return () => { model.dispose(); for (const controller of controllers) controller.abort(); window.removeEventListener?.('beforeunload', unload); listeners.clear(); };
      });
    } };
  }
});
