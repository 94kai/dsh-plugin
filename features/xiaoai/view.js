// Pure helpers: safe to test without React, DOM, network or speaker access.
function createXiaoaiReadGate() {
  let generation = 0, owner = '';
  return {
    invalidate(profileId) { owner = profileId; generation++; },
    begin(profileId) { owner = profileId; return { profileId, generation: ++generation }; },
    accepts(ticket, profileId) { return ticket.profileId === profileId && owner === profileId && ticket.generation === generation; },
  };
}
async function xiaoaiReadbackAfterCommit(readback, onWarning) {
  try { await readback(); return true; }
  catch (error) { if (error.name !== 'AbortError') onWarning(error); return false; }
}

function createXiaoaiView(React, { h, useApi, useAction, Status, button, field, select }) {
  // One shared observer pauses marquee animations while a row is off screen.
  let xiaoaiMarqueeObserver = null;
  const xiaoaiMarqueeCallbacks = new WeakMap();
  function observeMarquee(node, callback) {
    if (typeof IntersectionObserver === 'undefined') return () => {};
    if (!xiaoaiMarqueeObserver) xiaoaiMarqueeObserver = new IntersectionObserver(entries => {
      for (const entry of entries) xiaoaiMarqueeCallbacks.get(entry.target)?.(entry.isIntersecting);
    }, { rootMargin: '80px 0px' });
    xiaoaiMarqueeCallbacks.set(node, callback);
    xiaoaiMarqueeObserver.observe(node);
    return () => { xiaoaiMarqueeCallbacks.delete(node); xiaoaiMarqueeObserver.unobserve(node); };
  }

  // Only the current track (or the now-playing card) animates; the text is
  // translated with a transform so layout and other rows stay untouched.
  function MarqueeTitle({ text, active = true, className = 'pk-track-title' }) {
    const wrapRef = React.useRef(null), textRef = React.useRef(null);
    const [shift, setShift] = React.useState(0), [visible, setVisible] = React.useState(true);
    React.useEffect(() => {
      const node = wrapRef.current;
      if (!node) return;
      return observeMarquee(node, setVisible);
    }, []);
    React.useLayoutEffect(() => {
      const measure = () => {
        const wrap = wrapRef.current, node = textRef.current;
        if (!wrap || !node) return;
        const overflow = node.scrollWidth - wrap.clientWidth;
        setShift(overflow > 2 ? -overflow : 0);
      };
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(wrapRef.current);
      return () => observer.disconnect();
    }, [text]);
    const marquee = active && visible && shift < 0;
    return h('span', { ref: wrapRef, className: `pk-title-wrap${marquee ? ' is-marquee' : ''}`, title: text, style: shift < 0 ? { '--pk-shift': `${shift}px` } : undefined },
      h('span', { ref: textRef, className }, text));
  }

  // The bridge owns fixed module prefixes; only relative API paths cross it.
  const M = '', A = '';
  const songName = song => song.title || song.name || String(song.path || '').split('/').pop();
  const blankControl = () => ({ id: '', name: '', category: 'light', mode: 'pair', onLabel: '开启', offLabel: '关闭', onCommand: '', offCommand: '', command: '' });
  const blankRule = () => ({ id: '', playlistId: '', time: '', phrase: '', repeat: 1, enabled: true });
  const newId = () => crypto.randomUUID();
  const area = (label, value, set, props = {}) => h('label', null, label, h('textarea', { value, onChange: e => set(e.target.value), ...props }));
  const check = (label, value, set) => h('label', { className: 'pk-check' }, h('input', { type: 'checkbox', checked: !!value, onChange: e => set(e.target.checked) }), label);
  function ConfigDialog({ onClose, busy, formId, children }) {
    const cardRef = React.useRef(null), closeRef = React.useRef(null);
    const latest = React.useRef({ onClose, busy }); latest.current = { onClose, busy };
    React.useEffect(() => {
      const opener = document.activeElement;
      const scroller = cardRef.current?.closest('.pk-media');
      const previousOverflow = scroller?.style.overflow;
      if (scroller) scroller.style.overflow = 'hidden';
      closeRef.current?.focus();
      const focusable = () => [...(cardRef.current?.querySelectorAll('button,input,textarea,select,summary,[tabindex]') || [])].filter(el => !el.matches(':disabled,[tabindex="-1"]') && el.getClientRects().length);
      const onKey = event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!latest.current.busy) latest.current.onClose(); }
        if (event.key === 'Tab') {
          const nodes = focusable(), first = nodes[0], last = nodes[nodes.length - 1];
          if (!first) { event.preventDefault(); cardRef.current?.focus(); return; }
          if (event.shiftKey && (document.activeElement === first || !cardRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || !cardRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        }
      };
      const onFocus = event => { if (cardRef.current && !cardRef.current.contains(event.target)) (focusable()[0] || cardRef.current).focus(); };
      document.addEventListener('keydown', onKey, true); document.addEventListener('focusin', onFocus);
      return () => {
        document.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocus);
        if (scroller) scroller.style.overflow = previousOverflow;
        if (opener?.isConnected) opener.focus?.();
      };
    }, []);
    return h('div', { className: 'pk-modal', onClick: event => { if (event.target === event.currentTarget && !busy) onClose(); } },
      h('section', { ref: cardRef, className: 'pk-modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': '音箱配置', 'aria-busy': busy, tabIndex: -1 },
        h('header', { className: 'pk-modal-head' }, h('div', { className: 'pk-modal-title' }, h('h2', null, '音箱配置'), h('p', { className: 'pk-muted' }, '保存运行中的配置会重启此音箱服务。')),
          h('button', { ref: closeRef, type: 'button', className: 'pk-modal-close', 'aria-label': '关闭音箱配置', disabled: busy, onClick: onClose }, '×')),
        h('div', { className: 'pk-modal-body' }, children),
        h('footer', { className: 'pk-modal-foot' }, button('取消', onClose, busy), h('button', { type: 'submit', form: formId, disabled: busy, className: 'pk-primary' }, busy ? '正在保存…' : '保存配置'))));
  }
  return function XiaoaiView() {
    const api = useApi('xiaoai'), action = useAction();
    const [tab, setTab] = React.useState('playback'), [profiles, setProfiles] = React.useState([]), [selected, setSelected] = React.useState('');
    const [loading, setLoading] = React.useState(true), [collectionState, setCollection] = React.useState({ profileId: '', ready: false, playlist: [], favorites: [] });
    const [libraryTab, setLibraryTab] = React.useState('playlist'), [query, setQuery] = React.useState(''), [hits, setHits] = React.useState([]), [searched, setSearched] = React.useState(false), [searchedKeyword, setSearchedKeyword] = React.useState('');
    const [playMode, setPlayMode] = React.useState('sequence'), [volume, setVolume] = React.useState(30);
    const [configDraft, setConfigDraft] = React.useState(null), [automation, setAutomation] = React.useState(null), [autoId, setAutoId] = React.useState('');
    const [autoName, setAutoName] = React.useState(''), [autoQuery, setAutoQuery] = React.useState(''), [autoHits, setAutoHits] = React.useState([]), [rule, setRule] = React.useState(blankRule);
    const [assistant, setAssistant] = React.useState({ controls: [], history: {} }), [mode, setMode] = React.useState('speak'), [text, setText] = React.useState(''), [controlDraft, setControlDraft] = React.useState(null);
    const [fnos, setFnos] = React.useState({configured:false,connected:false}), [nasOrigin, setNasOrigin] = React.useState(''), [authorizationUrl, setAuthorizationUrl] = React.useState('');
    const [serviceOpen, setServiceOpen] = React.useState(false);
    const servicePanelId = React.useId(), configFormId = React.useId();
    const [autoView, setAutoView] = React.useState('rules'), [ruleOpen, setRuleOpen] = React.useState(false), [ruleTrigger, setRuleTrigger] = React.useState('time'), [createListOpen, setCreateListOpen] = React.useState(false);
    const [refreshPending, setRefreshPending] = React.useState([]);
    const refreshLocks = React.useRef(new Set());
    const selectedRef = React.useRef(selected), profileSerial = React.useRef(0), active = React.useRef(true);
    const collectionGate = React.useRef(null), assistantSerial = React.useRef(0), automationSerial = React.useRef(0);
    const rootRef = React.useRef(null), ruleFormRef = React.useRef(null), controlFormRef = React.useRef(null);
    if (!collectionGate.current) collectionGate.current = createXiaoaiReadGate();
    selectedRef.current = selected;
    const collectionReady = collectionState.profileId === selected && collectionState.ready;
    const favoritesReady = collectionReady && collectionState.favoritesReady !== false;
    const collection = collectionReady ? collectionState : { playlist: [], favorites: [] };
    const profile = profiles.find(p => p.id === selected), connected = !!profile?.speakerConnected, online = !!profile?.online;
    const disabled = action.busy || !selected, unavailable = disabled || !online || !connected;
    const refreshing = refreshPending.includes(selected) || !!profile?.refreshing;
    const statusActive = action.busy || !!action.error || !!action.notice;
    const serviceNote = !profile ? '' : !online
      ? (profile.workerState === 'running' ? (profile.processError || '服务启动中或连接异常') : '')
      : !connected ? '服务在线，音箱未连接'
        : !profile.listenerEnabled ? '语音监听已关闭' : '';
    const P = (suffix = '', id = selectedRef.current) => `${M}/profiles/${encodeURIComponent(id)}${suffix ? '/' + suffix : ''}`;
    const read = async (path, module = 'playback') => api(path, 'GET', undefined, module);
    function invalidateCollection(id = selectedRef.current) {
      collectionGate.current.invalidate(id);
      setCollection({ profileId: id, ready: false, playlist: [], favorites: [] });
    }
    const call = async (path, body = {}, method = 'POST', module = 'playback') => {
      if (module === 'playback' && /\/(playlist|favorites)(?:[?]|$)/.test(path)) invalidateCollection();
      if (module === 'assistant') ++assistantSerial.current;
      if (module === 'playback' && path === '/automation') ++automationSerial.current;
      return api(path, method, body, module);
    };
    const readback = (fn, confirmed = '操作已完成') => xiaoaiReadbackAfterCommit(fn, error => {
      if (active.current) action.setError(`${confirmed}，但状态刷新失败；请仅刷新状态，不要重复操作：${error.message}`);
    });
    async function loadProfiles() {
      const serial = ++profileSerial.current;
      const result = await read(`${M}/profiles`);
      if (!active.current || serial !== profileSerial.current) return;
      const next = result.profiles || []; setProfiles(next);
      if (!next.some(p => p.id === selectedRef.current)) {
        let previous = ''; try { previous = localStorage.getItem('pocket-kit-xiaoai-speaker') || localStorage.getItem('allinone-music-speaker') || ''; } catch {}
        const id = next.some(p => p.id === previous) ? previous : next[0]?.id || '';
        invalidateCollection(id); selectedRef.current = id; setSelected(id);
      }
    }
    async function loadCollection(id = selectedRef.current) {
      if (!id || id !== selectedRef.current) return;
      const ticket = collectionGate.current.begin(id);
      setCollection({ profileId: id, ready: false, playlist: [], favorites: [] });
      const result = await read(P('collection', id));
      if (active.current && collectionGate.current.accepts(ticket, selectedRef.current)) setCollection({ profileId: id, ready: true, playlist: result.playlist || [], favorites: result.favorites || [], favoritesReady: result.favoritesReady !== false, favoritesError: result.favoritesError || '', favoritesTotal: result.favoritesTotal });
    }
    async function loadAssistant() { const serial = ++assistantSerial.current; const result = await read(`${A}/state`, 'assistant'); if (active.current && serial === assistantSerial.current) setAssistant({ controls: result.controls || [], history: result.history || {} }); }
    async function loadAutomation() { const serial = ++automationSerial.current; const result = await read(`${M}/automation`); if (active.current && serial === automationSerial.current) setAutomation(result); }
    async function loadFnos() { const result = await read('/fnos/status'); if(active.current) { setFnos(result); if(result.nasOrigin)setNasOrigin(result.nasOrigin); } return result; }
    async function refresh() { await loadProfiles(); await Promise.all([loadCollection(), loadAssistant(), loadAutomation(), loadFnos()]); }
    React.useEffect(() => {
      active.current = true;
      refresh().catch(e => { if (active.current && e.name !== 'AbortError') action.setError(e.message); }).finally(() => { if (active.current) setLoading(false); });
      const timer = setInterval(() => { if (!document.hidden) loadProfiles().catch(() => {}); }, 10000);
      return () => { active.current = false; clearInterval(timer); ++profileSerial.current; collectionGate.current.invalidate(''); ++assistantSerial.current; ++automationSerial.current; };
    }, []);
    React.useEffect(() => {
      setHits([]); setSearched(false); setSearchedKeyword(''); invalidateCollection(selected); setConfigDraft(null); setAutoHits([]); setAutoId(''); setRule(blankRule()); setRuleOpen(false); setCreateListOpen(false); setServiceOpen(false);
      if (!selected) return;
      try { localStorage.setItem('pocket-kit-xiaoai-speaker', selected); setPlayMode(localStorage.getItem(`pocket-kit-xiaoai-mode:${selected}`) || 'sequence'); } catch {}
      setVolume(profiles.find(p => p.id === selected)?.volume ?? 30);
      loadCollection(selected).catch(e => { if (active.current && e.name !== 'AbortError') action.setError(e.message); });
    }, [selected]);
    React.useEffect(() => {
      if (controlDraft) requestAnimationFrame(() => controlFormRef.current?.scrollIntoView({ block: 'center' }));
    }, [controlDraft?.id, !!controlDraft]);
    const perform = (fn, notice) => action.run(fn, notice);
    async function musicAction(name, payload, notice) {
      const id = selectedRef.current;
      return perform(async () => { await call(P(name, id), payload); await readback(async () => { await loadProfiles();  }, notice || '设备操作请求已发送'); return true; }, notice);
    }
    async function playAndRefresh(name, payload, notice) {
      const id = selectedRef.current;
      return perform(async () => {
        await call(P(name, id), payload);
        await readback(async () => { await loadProfiles(); await loadCollection(id); }, notice || '播放请求已发送');
        return true;
      }, notice);
    }
    function changeMode(next) {
      setPlayMode(next);
      try { localStorage.setItem(`pocket-kit-xiaoai-mode:${selectedRef.current}`, next); } catch {}
      if (profile?.currentSong && online) perform(async () => { await call(P('playlist/mode'), { mode: next }); }, '播放模式已切换');
    }
    function changeSpeaker(id) { if (action.busy || id === selectedRef.current) return; action.clear(); invalidateCollection(id); selectedRef.current = id; setSelected(id); }
    function scrollViewTop() {
      const scroller = rootRef.current?.closest('.pk-media');
      if (scroller) scroller.scrollTop = 0;
      else if (typeof window !== 'undefined') window.scrollTo(0, 0);
    }
    function switchTab(id) {
      if (id === tab) return;
      action.clear(); setConfigDraft(null); setTab(id); requestAnimationFrame(scrollViewTop);
    }
    function switchLibraryTab(id) {
      if (id === libraryTab) return;
      action.clear(); setConfigDraft(null); setLibraryTab(id);
    }
    async function refreshLibrary() {
      const id = selectedRef.current;
      if (!id || refreshLocks.current.has(id) || profile?.refreshing) return;
      const name = profile?.name || '音箱';
      refreshLocks.current.add(id);
      setRefreshPending([...refreshLocks.current]); action.clear();
      try {
        await call(P('refresh', id));
        await loadProfiles();
        if (active.current && selectedRef.current === id) action.notify(`${name}曲库刷新完成`);
      } catch (error) {
        if (active.current && selectedRef.current === id && error.name !== 'AbortError') action.setError(`${name}曲库刷新失败：${error.message}`);
      } finally {
        refreshLocks.current.delete(id);
        if (active.current) setRefreshPending([...refreshLocks.current]);
      }
    }
    function volumeRow(onCommit, commitDisabled = false) {
      const commit = event => {
        if (commitDisabled) return;
        const value = Number(event.currentTarget.value);
        onCommit(value);
      };
      const commitKey = event => {
        if (/^(Arrow|Home$|End$|Page)/.test(event.key)) commit(event);
      };
      return h('div', { className: 'pk-volume' },
        h('label', null, `音量（0–100）：${volume}`, h('input', { type: 'range', min: 0, max: 100, step: 1, value: volume, onChange: e => setVolume(Number(e.target.value)), onPointerUp: commit, onKeyUp: commitKey, 'aria-label': '音量' })));
    }
    async function saveAutomation(change, notice = '歌单与规则已保存') {
      if (!automation) return action.setError('请先加载自动播放配置');
      return perform(async () => {
        const next = structuredClone(automation); change(next);
        const result = await call(`${M}/automation`, next, 'PUT');
        setAutomation(result); return true;
      }, notice);
    }
    const lists = (automation?.playlists || []).filter(p => p.profileId === selected);
    const chosenList = lists.find(p => p.id === autoId) || lists[0];
    const rules = (automation?.rules || []).filter(r => r.profileId === selected);
    const updateRule = (key, value) => setRule(previous => ({ ...previous, [key]: value }));
    const updateControl = (key, value) => setControlDraft(previous => ({ ...previous, [key]: value }));
    const favorite = song => collection.favorites.some(item => item.path === song.path);
    function tracks(songs, context) {
      if (!songs.length) return h('p', { className: 'pk-muted' }, context === 'search' && !searched ? '输入歌名、歌手、专辑或文件名搜索本地曲库。' : '暂无歌曲');
      const play = song => {
        if (context === 'search') return playAndRefresh('search/play', { keyword: searchedKeyword, path: song.path, mode: playMode }, '播放请求已发送');
        if (context === 'favorites') return playAndRefresh('favorites/play', { path: song.path, mode: playMode }, '播放请求已发送');
        return playAndRefresh('playlist/play', { path: song.path, mode: playMode }, '播放请求已发送');
      };
      const now = profile?.currentSong || '';
      const isCurrent = song => !!now && (song.name === now || songName(song) === now.replace(/\.[^.]+$/, ''));
      return h('div', { className: 'pk-track-list' }, songs.map((song, index) => {
        const current = isCurrent(song), on = favorite(song), name = songName(song);
        return h('article', { className: `pk-track${current ? ' is-current' : ''}`, key: song.path },
          h('span', { className: 'pk-track-index', 'aria-hidden': 'true' }, current ? '▶' : index + 1),
          h('div', { className: 'pk-track-text' },
            h(MarqueeTitle, { text: name }),
            h('span', { className: 'pk-track-sub' }, [song.artist, song.album].filter(Boolean).join(' · '))),
          h('div', { className: 'pk-track-actions' },
            h('button', { type: 'button', className: 'pk-icon-btn', 'aria-label': `播放 ${name}`, title: '播放', disabled: unavailable, onClick: () => play(song) }, '▶'),
            context !== 'playlist' && h('button', { type: 'button', className: 'pk-icon-btn', 'aria-label': `加入播放列表 ${name}`, title: '加入播放列表', disabled, onClick: () => perform(async () => { await call(P('playlist'), { songs: [song] }); await readback(() => loadCollection(), '列表或历史已更新'); }, '已加入播放列表') }, '＋'),
            h('button', { type: 'button', className: `pk-icon-btn${on ? ' is-on' : ''}`, 'aria-label': `${on ? '取消喜欢' : '喜欢'} ${name}`, title: on ? '取消喜欢' : '喜欢', disabled: disabled || !favoritesReady, onClick: () => perform(async () => { await call(P('favorites'), { song, favorite: !on }, 'PUT'); await readback(() => loadCollection(), '列表或历史已更新'); }, '收藏已更新') }, on ? '♥' : '♡'),
            context === 'playlist' && h('button', { type: 'button', className: 'pk-icon-btn is-danger', 'aria-label': `从播放列表移除 ${name}`, title: '移除', disabled, onClick: () => { if (confirm('从播放列表移除此歌曲？不会删除音乐文件。')) perform(async () => { await call(`${P('playlist')}?path=${encodeURIComponent(song.path)}`, undefined, 'DELETE'); await readback(() => loadCollection(), '列表或历史已更新'); }, '已从列表移除'); } }, '✕')));
      }));
    }
    function configuration() {
      if (!configDraft) return null;
      const update = (key, value) => setConfigDraft(previous => ({ ...previous, [key]: value }));
      const lines = key => area(key === 'musicDirs' ? '音乐目录（每行一个绝对路径，最多10个）' : ({ playKeywords: '播放关键词', stopKeywords: '附加停止关键词', refreshKeywords: '刷新关键词', randomKeywords: '随机播放关键词' })[key], configDraft[key], value => update(key, value));
      return h(ConfigDialog, { onClose: () => setConfigDraft(null), busy: action.busy, formId: configFormId }, h(Status, { state: action }),
        h('p', { className: 'pk-muted' }, '只修改当前所选音箱；暂停的服务保存后仍保持暂停。'),
        h('form', { id: configFormId, className: 'pk-form', onSubmit: async event => {
          event.preventDefault(); const id = selected;
          const payload = { ...configDraft, maxResults: Number(configDraft.maxResults), refreshInterval: Number(configDraft.refreshInterval) };
          for (const key of ['musicDirs', 'playKeywords', 'stopKeywords', 'refreshKeywords', 'randomKeywords']) payload[key] = configDraft[key].split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          if (profile?.workerState === 'running' && !confirm('保存配置会重启此音箱 worker，可能中断当前播放。继续？')) return;
          const ok = await perform(async () => { await call(P('', id), payload, 'PUT'); setConfigDraft(null); await readback(() => loadProfiles(), '请求已发送或配置已保存'); return true; }, '配置已保存'); if (ok) setConfigDraft(null);
        } }, field('名称', configDraft.name, value => update('name', value), { required: true, maxLength: 30 }), lines('musicDirs'), field('音箱可访问的音频 base URL', configDraft.baseUrl, value => update('baseUrl', value), { type: 'url', required: true }),
          h('div', { className: 'pk-grid' }, field('语音搜索数量上限', configDraft.maxResults, value => update('maxResults', value), { type: 'number', min: 1, max: 100 }), field('自动刷新间隔（秒，0关闭）', configDraft.refreshInterval, value => update('refreshInterval', value), { type: 'number', min: 0 })),
          lines('playKeywords'),
          h('details', null, h('summary', null, `内置停止关键词（只读，${profile?.builtinStopKeywords?.length || 0} 条）`), h('label', null, '完整表达，不写入配置', h('textarea', { value: profile?.builtinStopKeywords?.join('\n') || 'worker 暂停或尚未连接，未读取运行时内置词表。', readOnly: true, rows: 6 }))),
          lines('stopKeywords'), lines('refreshKeywords'), lines('randomKeywords')));
    }
    function openRule(item) {
      setRule(item ? { ...item } : { ...blankRule(), playlistId: chosenList?.id || '' });
      setRuleTrigger(item?.time && item?.phrase ? 'both' : item?.phrase ? 'voice' : 'time');
      setRuleOpen(true);
      requestAnimationFrame(() => ruleFormRef.current?.scrollIntoView({ block: 'start' }));
    }
    function automationPanel() {
      const last = automation?.last;
      const lastDate = last?.at ? new Date(last.at) : null;
      const lastAt = lastDate && !Number.isNaN(lastDate.getTime()) ? lastDate.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : (last?.at || '');
      const lastStatus = ({ success: '成功', failed: '失败', skipped: '跳过' })[last?.status] || last?.status || '';
      const readyLists = lists.filter(item => item.songs.length);
      const enabledCount = rules.filter(item => item.enabled).length;
      const ruleList = lists.find(item => item.id === rule.playlistId);
      const triggerText = item => [item.time ? `每天 ${item.time}` : '', item.phrase ? `说“${item.phrase}”` : '', `播放 ${item.repeat} 轮`].filter(Boolean).join(' · ');
      const ruleForm = ruleOpen && h('section', { ref: ruleFormRef, className: 'pk-panel pk-auto-form', 'aria-label': '规则设置' },
        h('h3', null, rule.id ? '编辑规则' : '新建规则'),
        h('form', { className: 'pk-form', onSubmit: async event => {
          event.preventDefault();
          const nextRule = { ...rule, id: rule.id || newId(), profileId: selected, repeat: Number(rule.repeat), time: ruleTrigger === 'voice' ? '' : rule.time, phrase: ruleTrigger === 'time' ? '' : rule.phrase.trim() };
          if (!ruleList?.songs.length) return action.setError('请先选择已有歌曲的歌单。');
          if (ruleTrigger !== 'voice' && !nextRule.time) return action.setError('请选择每天的播放时间。');
          if (ruleTrigger !== 'time' && !nextRule.phrase) return action.setError('请输入语音提示词。');
          const ok = await saveAutomation(next => { const i = next.rules.findIndex(r => r.id === nextRule.id); if (i >= 0) next.rules[i] = nextRule; else next.rules.push(nextRule); }, '播放规则已保存');
          if (ok) { setRuleOpen(false); setRule(blankRule()); }
        } },
          select('歌单', rule.playlistId, value => updateRule('playlistId', value), [['', '请选择歌单'], ...readyLists.map(list => [list.id, `${list.name}（${list.songs.length}首）`])]),
          select('触发方式', ruleTrigger, setRuleTrigger, [['time', '每天定时'], ['voice', '对小爱说提示词'], ['both', '定时或语音均可']]),
          ruleTrigger !== 'voice' && field('播放时间（北京时间）', rule.time, value => updateRule('time', value), { type: 'time', required: true }),
          ruleTrigger !== 'time' && field('语音提示词', rule.phrase, value => updateRule('phrase', value), { maxLength: 80, required: true, placeholder: '例如：播放英文儿歌' }),
          ruleTrigger === 'both' && h('p', { className: 'pk-muted' }, '两个条件任一条满足就会播放，不需要同时满足。'),
          field('播放轮数（1–20）', rule.repeat, value => updateRule('repeat', value), { type: 'number', min: 1, max: 20, required: true }),
          check('保存后启用', rule.enabled, value => updateRule('enabled', value)),
          h('div', { className: 'pk-actions' },
            h('button', { type: 'submit', disabled: disabled || !ruleList?.songs.length, className: 'pk-primary' }, '保存规则'),
            button('取消', () => { setRuleOpen(false); setRule(blankRule()); }, action.busy))));
      return h('section', { className: 'pk-panel pk-xiaoai-auto' },
        h('h2', null, '定时与语音播放'),
        h('p', { className: 'pk-muted' }, '为当前音箱设置每天定时播放，或对小爱说出提示词时播放歌单。'),
        h('nav', { className: 'pk-tabs', 'aria-label': '自动播放管理' }, [['rules', '播放规则'], ['lists', '歌单管理']].map(([id, label]) => h('button', { key: id, type: 'button', 'aria-pressed': autoView === id, onClick: () => { action.clear(); setAutoView(id); } }, label))),
        !automation ? h(React.Fragment, null, h('p', null, '配置尚未读取。'), button('重新读取配置', () => perform(loadAutomation, '配置已读取'), disabled))
          : autoView === 'rules' ? h(React.Fragment, null,
            h('p', { className: 'pk-muted' }, online ? `服务在线 · 共 ${rules.length} 条规则，${enabledCount} 条启用` : '服务未就绪：规则可以保存，但目前不会执行'),
            profile?.automation?.error && h('p', { role: 'alert' }, profile.automation.error),
            h('div', { className: 'pk-actions' }, button(ruleOpen ? '收起编辑' : '新增规则', () => ruleOpen ? setRuleOpen(false) : openRule(), disabled || !readyLists.length), button('刷新', () => perform(loadAutomation, '配置已重新读取'), disabled)),
            !readyLists.length && h('p', { className: 'pk-muted' }, '还没有含歌曲的歌单。先到“歌单管理”创建歌单并添加歌曲。'),
            ruleForm,
            rules.length ? h('div', { className: 'pk-auto-rules' }, rules.map(item => {
              const list = lists.find(entry => entry.id === item.playlistId);
              return h('article', { className: 'pk-auto-rule', key: item.id },
                h('div', { className: 'pk-auto-rule-main' },
                  h('div', { className: 'pk-auto-title' }, h('strong', null, list?.name || '歌单不存在'), h('span', { className: `pk-badge${item.enabled ? ' is-on' : ''}` }, item.enabled ? '已启用' : '已停用')),
                  h('p', { className: 'pk-muted' }, triggerText(item))),
                h('div', { className: 'pk-auto-actions' },
                  button(item.enabled ? '停用' : '启用', () => saveAutomation(next => { const target = next.rules.find(r => r.id === item.id); target.enabled = !target.enabled; }, item.enabled ? '规则已停用' : '规则已启用'), disabled),
                  button('编辑', () => openRule(item), disabled),
                  h('button', { type: 'button', className: 'pk-icon-btn is-danger', title: '删除规则', 'aria-label': `删除规则 ${list?.name || ''}`, disabled, onClick: () => { if (confirm('删除这条播放规则？歌单和音乐文件保留。')) saveAutomation(next => { next.rules = next.rules.filter(ruleItem => ruleItem.id !== item.id); }, '规则已删除'); } }, '✕')));
            })) : h('p', { className: 'pk-muted' }, '还没有规则。点击“新增规则”开始。'),
            h('details', { className: 'pk-panel pk-auto-help' }, h('summary', null, '执行说明与上次结果'),
              h('p', { className: 'pk-muted' }, '定时每天最多尝试一次；错过、离线或失败不补播。关闭网页仍会运行，但音箱服务必须保持启动。'),
              last ? h('p', { className: 'pk-wrap' }, `上次：${lastAt} · ${last.playlist || ''} · ${lastStatus}${last.error ? ' · ' + last.error : ''}`) : h('p', { className: 'pk-muted' }, '还没有执行记录。')))
          : h(React.Fragment, null,
            h('div', { className: 'pk-actions' }, button(createListOpen ? '取消新建' : '新建歌单', () => setCreateListOpen(value => !value), disabled), button('刷新', () => perform(loadAutomation, '配置已重新读取'), disabled)),
            createListOpen && h('form', { className: 'pk-panel pk-form', onSubmit: async e => { e.preventDefault(); const id = newId(); const ok = await saveAutomation(next => next.playlists.push({ id, profileId: selected, name: autoName.trim(), songs: [] }), '歌单已创建，请继续添加歌曲'); if (ok) { setAutoId(id); setAutoName(''); setAutoHits([]); setCreateListOpen(false); } } },
              field('新歌单名称', autoName, setAutoName, { required: true, maxLength: 40 }),
              h('button', { type: 'submit', disabled: disabled || !autoName.trim() }, '创建歌单')),
            !chosenList ? h('p', { className: 'pk-muted' }, '还没有歌单。新建后可以从曲库搜索添加歌曲。') : h(React.Fragment, null,
              select('当前歌单', chosenList.id, id => { setAutoId(id); setAutoHits([]); setAutoQuery(''); }, lists.map(list => [list.id, `${list.name}（${list.songs.length}首）`])),
              h('form', { className: 'pk-form pk-search', onSubmit: e => { e.preventDefault(); const id = selected; perform(async () => { const result = await read(`${P('search', id)}?q=${encodeURIComponent(autoQuery)}`); if (selectedRef.current === id) setAutoHits(result.items || []); }, '搜索完成'); } },
                field('搜索歌曲加入歌单', autoQuery, setAutoQuery, { required: true, maxLength: 100 }),
                h('button', { type: 'submit', disabled: disabled || !online }, '搜索')),
              autoHits.length > 0 && h('div', { className: 'pk-auto-songs' }, autoHits.map(song => {
                const added = chosenList.songs.some(item => item.path === song.path);
                return h('div', { className: 'pk-auto-song', key: song.path },
                  h('span', { className: 'pk-auto-song-name', title: songName(song) }, songName(song)),
                  button(added ? '已加入' : '加入', () => saveAutomation(next => { const list = next.playlists.find(entry => entry.id === chosenList.id); if (!list.songs.some(item => item.path === song.path)) list.songs.push(song); }, '歌曲已加入歌单'), disabled || added));
              })),
              h('h3', null, `歌单中的歌曲（${chosenList.songs.length}）`),
              chosenList.songs.length ? h('div', { className: 'pk-auto-songs' }, chosenList.songs.map((song, index) => h('div', { className: 'pk-auto-song', key: song.path },
                h('span', { className: 'pk-auto-index' }, index + 1),
                h('span', { className: 'pk-auto-song-name', title: songName(song) }, songName(song)),
                h('button', { type: 'button', className: 'pk-icon-btn is-danger', title: '移除', 'aria-label': `移除 ${songName(song)}`, disabled, onClick: () => { if (confirm('从歌单移除此歌曲？音乐文件保留；删空后需先停用关联规则。')) saveAutomation(next => { next.playlists.find(entry => entry.id === chosenList.id).songs.splice(index, 1); }, '歌曲已移除'); } }, '✕')))) : h('p', { className: 'pk-muted' }, '歌单为空，先搜索并加入歌曲。'),
              h('div', { className: 'pk-actions' },
                button('用此歌单新建规则', () => { setAutoView('rules'); openRule({ ...blankRule(), playlistId: chosenList.id }); }, disabled || !chosenList.songs.length)),
              h('details', { className: 'pk-panel pk-auto-help' }, h('summary', null, '歌单设置'),
                h('form', { key: `${chosenList.id}:${chosenList.name}`, className: 'pk-form', onSubmit: e => { e.preventDefault(); const name = new FormData(e.currentTarget).get('name'); saveAutomation(next => { next.playlists.find(entry => entry.id === chosenList.id).name = String(name).trim(); }, '歌单名称已更新'); } },
                  h('label', null, '歌单名称', h('input', { name: 'name', defaultValue: chosenList.name, required: true, maxLength: 40 })),
                  h('button', { type: 'submit', disabled }, '保存名称')),
                button('复制播放列表到此歌单', () => { if (confirm('将播放列表中的歌曲复制到此歌单？重复项跳过，之后分别维护。')) saveAutomation(next => { const list = next.playlists.find(entry => entry.id === chosenList.id); for (const song of collection.playlist) if (!list.songs.some(item => item.path === song.path)) list.songs.push(song); }, '歌曲已复制到歌单'); }, disabled || !collectionReady || !collection.playlist.length),
                button('删除此歌单', () => { if (confirm(`删除“${chosenList.name}”及关联的 ${rules.filter(item => item.playlistId === chosenList.id).length} 条规则？音乐文件保留。`)) saveAutomation(next => { next.playlists = next.playlists.filter(entry => entry.id !== chosenList.id); next.rules = next.rules.filter(ruleItem => ruleItem.playlistId !== chosenList.id); }, '歌单及关联规则已删除'); }, disabled, 'pk-danger')))));
    }
    function playerPanel() {
      const currentTitle = profile?.currentSong ? profile.currentSong.replace(/\.[^./]+$/, '') : '';
      const modes = [['sequence', '顺序播放'], ['loop-all', '列表循环'], ['loop-one', '单曲循环'], ['shuffle', '随机播放']];
      return h('section', { className: 'pk-panel' },
        currentTitle ? h('div', { className: 'pk-now' }, h('div', { className: 'pk-now-art', 'aria-hidden': 'true' }, '♪'), h('div', { className: 'pk-now-text' }, h('span', { className: 'pk-now-sub' }, '正在播放'), h('strong', { className: 'pk-now-title' }, h(MarqueeTitle, { text: currentTitle, active: true, className: 'pk-now-title-text' })))) : h('h2', null, '当前未播放'),
        h('p', { className: 'pk-muted' }, `曲库 ${profile?.librarySize ?? '—'} 首 · 播放列表 ${collection.playlist.length} 首${refreshing ? ' · 正在刷新曲库' : ''}`),
        h('nav', { className: 'pk-tabs pk-modes', 'aria-label': '播放模式' }, modes.map(([id, label]) => h('button', { type: 'button', key: id, 'aria-pressed': playMode === id, onClick: () => changeMode(id) }, label))),
        volumeRow(value => musicAction('volume', { volume: value }, '音量请求已发送'), unavailable),
        currentTitle ? h('div', { className: 'pk-actions' },
          button('停止播放', () => { if (confirm('停止当前播放？播放列表会保留。')) musicAction('stop', {}, '已停止播放；播放列表保留'); }, unavailable, 'pk-danger')) : null,
        h('div', { className: 'pk-actions' },
          button(refreshing ? '正在刷新曲库…' : '刷新曲库', refreshLibrary, disabled || !online || refreshing),
          button(profile?.listenerEnabled ? '关闭语音监听' : '开启语音监听', () => musicAction('listener', { enabled: !profile?.listenerEnabled }, '语音监听设置已更新'), disabled || !online),
          button('音箱配置', () => { if (!profile) return; const draft = { name: profile.name, baseUrl: profile.baseUrl, maxResults: profile.maxResults, refreshInterval: profile.refreshInterval }; for (const key of ['musicDirs', 'playKeywords', 'stopKeywords', 'refreshKeywords', 'randomKeywords']) draft[key] = (profile[key] || []).join('\n'); setConfigDraft(draft); }, disabled)));
    }
    function playlistPanel() {
      return h('section', { className: 'pk-panel' },
        h('div', { className: 'pk-list-head' }, h('h2', null, '播放列表'), h('span', { className: 'pk-muted' }, `${collection.playlist.length} 首`)),
        h('div', { className: 'pk-actions' },
          button('从第一首播放', () => playAndRefresh('playlist/play', { mode: playMode }, '播放请求已发送'), unavailable || !collection.playlist.length),
          button('清空', () => { if (confirm('清空播放列表？喜欢和音乐文件不受影响。')) perform(async () => { await call(P('playlist'), { mode: 'replace', songs: [] }); await readback(() => loadCollection(), '列表或历史已更新'); }, '播放列表已清空'); }, disabled || !collection.playlist.length, 'pk-danger')),
        h('p', { className: 'pk-muted' }, '点某首从该曲开始；列表循环会回到第一首，单曲循环重播当前曲。'),
        !collectionReady ? h('p', { className: 'pk-muted', role: 'status' }, '列表加载中…') : tracks(collection.playlist, 'playlist'));
    }
    async function connectFnos() {
      let popup; try { popup = window.open('about:blank', '_blank'); if(popup)popup.opener=null; } catch {}
      const ok = await perform(async () => {
        const result = await call('/fnos/connect', { nasOrigin });
        const url = new URL(result.authorizationUrl);
        if(url.origin !== new URL(nasOrigin).origin || url.pathname !== '/signin') throw new Error('授权地址验证失败，请检查NAS地址');
        setAuthorizationUrl(url.href);
        if(popup)popup.location.replace(url.href);
        return true;
      }, '请在飞牛页面完成登录授权，再点击“检查连接”');
      if(!ok)popup?.close();
    }
    function favoritesPanel() {
      return h(React.Fragment, null,
        h('section', { className:'pk-panel', 'aria-label':'飞牛音乐连接' },
          h('h2', null, '飞牛音乐 · 我喜欢'),
          h('p', {role:'status'}, fnos.connected ? `已连接：${fnos.user?.name || '飞牛音乐用户'}` : fnos.configured ? '授权需重新检查或已过期' : '尚未连接飞牛音乐'),
          h('details', {open:!fnos.connected}, h('summary',null,'账号与授权设置'),
          h('p', {className:'pk-muted'}, '喜欢列表直接来自飞牛音乐账号，两台音箱共享；未连接或授权失效时请重新连接。'),
          field('本机飞牛NAS管理地址', nasOrigin, setNasOrigin, {type:'url', placeholder:'例如：https://你的NAS地址', autoComplete:'url'}),
          h('p', {className:'pk-muted'}, '填写NAS管理页面地址，不是DSH地址或音乐页面路径。优先HTTPS；HTTP仅用于可信局域网。账号密码只在飞牛登录页输入。'),
          fnos.error && h('p', {className:'pk-error',role:'alert'}, fnos.error),
          h('div', {className:'pk-actions'},
            button(fnos.connected ? '重新授权飞牛音乐' : '连接飞牛音乐', connectFnos, action.busy || !nasOrigin.trim()),
            button('检查连接', () => perform(async () => { const result=await loadFnos();if(!result.connected)throw new Error(result.error || '尚未完成授权，请先在飞牛页面登录并同意授权');setAuthorizationUrl('');await readback(()=>loadCollection(),'飞牛音乐已连接'); }, '飞牛音乐已连接，喜欢列表已刷新'), action.busy),
            fnos.configured && button('断开连接', () => { if(confirm('仅清除插件保存的飞牛音乐授权？不会清空飞牛喜欢或停止音箱。')) perform(async()=>{await call('/fnos/disconnect');setAuthorizationUrl('');setFnos({configured:false,connected:false});await readback(()=>loadCollection(),'连接已断开');},'已断开飞牛音乐'); }, action.busy, 'pk-danger')),
          authorizationUrl && h('p', {className:'pk-wrap'}, '未打开授权页面？', h('a', {className:'pk-fnos-auth-link',href:authorizationUrl,target:'_blank',rel:'noopener noreferrer'}, '点击打开飞牛授权页'), '。授权链接10分钟内有效，完成后回到这里检查连接。'))),
        h('section', { className: 'pk-panel' },
          h('h2',null,'飞牛喜欢的歌曲'),
          collection.favoritesError && h('p', {className:'pk-muted',role:'status'}, collection.favoritesError),
          collectionReady && favoritesReady && h('p',{className:'pk-muted'}, `飞牛收藏共 ${collection.favoritesTotal ?? collection.favorites.length} 首，本音箱曲库中可播放 ${collection.favorites.length} 首；库外、无权限或多曲目CUE不会加入播放。`),
          h('div', { className: 'pk-actions' }, button('从第一首播放', () => playAndRefresh('favorites/play', { mode: playMode }, '播放请求已发送'), unavailable || !favoritesReady || !collection.favorites.length), button('刷新喜欢列表',()=>perform(loadCollection,'喜欢列表已刷新'),disabled)),
          !collectionReady ? h('p', { className: 'pk-muted', role: 'status' }, '正在读取此音箱可播放的飞牛喜欢列表…') : favoritesReady ? tracks(collection.favorites, 'favorites') : h('p',{className:'pk-muted'},'连接成功后将在这里显示飞牛音乐的喜欢列表。')));
    }
    function searchPanel() {
      return h('section', { className: 'pk-panel' },
        h('form', { className: 'pk-form pk-search', onSubmit: e => { e.preventDefault(); const id = selected; perform(async () => { const result = await read(`${P('search', id)}?q=${encodeURIComponent(query)}`); if (selectedRef.current === id) { setHits(result.items || []); setSearched(true); setSearchedKeyword(query); } }, '搜索完成'); } }, field('搜索', query, setQuery, { required: true, maxLength: 100 }), h('button', { type: 'submit', disabled: disabled || !online }, '搜索')),
        !favoritesReady && h('p',{className:'pk-muted'},'喜欢功能需要先到“我喜欢”连接飞牛音乐。'),
        searched && h('div', { className: 'pk-search-result-head' },
          h('span', { className: 'pk-muted', role: 'status' }, hits.length ? `找到 ${hits.length} 首` : '没有找到匹配的歌曲'),
          !!hits.length && button('全部加入列表', () => perform(async () => { await call(P('playlist'), { songs: hits }); await readback(() => loadCollection(), '列表或历史已更新'); }, '搜索结果已加入列表'), disabled)),
        (!searched || hits.length) && tracks(hits, 'search'));
    }
    function playbackView() {
      return h(React.Fragment, null,
        h('nav', { className: 'pk-tabs', 'aria-label': '播放内容' }, [['playlist', '播放台'], ['search', '曲库搜索'], ['favorites', '我喜欢'], ['automation', '定时播放']].map(([id, label]) => h('button', { type: 'button', key: id, 'aria-pressed': libraryTab === id, onClick: () => switchLibraryTab(id) }, label))),
        libraryTab === 'playlist' ? h(React.Fragment, null, playerPanel(), playlistPanel()) : libraryTab === 'search' ? searchPanel() : libraryTab === 'favorites' ? favoritesPanel() : automationPanel());
    }
    async function sendText(value, sendMode, clear = false) {
      const id = selected;
      const ok = await perform(async () => { const result = await call(`${A}/send`, { profileId: id, mode: sendMode, text: value }, 'POST', 'assistant'); setAssistant(previous => ({ ...previous, history: { ...previous.history, [id]: result.history } })); return true; }, sendMode === 'speak' ? '播报已发送' : '指令已发送');
      if (ok && clear) setText('');
    }
    function assistantPanel() {
      const history = assistant.history[selected] || [];
      return h(React.Fragment, null,
        h('section', { className: 'pk-panel' }, h('h2', null, '音响控制与播报'),
          select('发送方式', mode, setMode, [['speak', '直接朗读文字'], ['ask', '让小爱理解并执行指令']]), area(mode === 'speak' ? '播报文字（最多500字）' : '小爱指令（最多200字）', text, setText, { maxLength: mode === 'speak' ? 500 : 200 }),
          h('p', { className: 'pk-muted' }, mode === 'speak' ? '音箱会原样读出文字。' : '这是实际设备指令，可能影响灯光、空调和其他米家设备。'), button('发送到所选音箱', () => sendText(text.trim(), mode, true), unavailable || !text.trim(), 'pk-primary pk-block'),
          volumeRow(value => perform(async () => { await call(`${A}/volume`, { profileId: selected, volume: value }, 'POST', 'assistant'); await readback(() => loadProfiles(), '请求已发送或配置已保存'); }, '音量请求已发送'), unavailable)),
        h('section', { className: 'pk-panel' }, h('h2', null, '最近发送'), h('p', { className: 'pk-muted' }, '每台音箱保留最近5条成功发送的播报或指令，相同内容与方式再次发送会置顶。'), history.length ? history.map((item, index) => h('div', { className: 'pk-row', key: index }, h('div', { className: 'pk-grow pk-wrap' }, item.text, h('small', { className: 'pk-muted' }, ` · ${item.mode === 'speak' ? '播报' : '指令'}`)), h('div', { className: 'pk-actions' }, button('填入编辑', () => { setText(item.text); setMode(item.mode); }, action.busy), button('再次发送', () => { setText(item.text); setMode(item.mode); sendText(item.text, item.mode); }, unavailable)))) : h('p', { className: 'pk-muted' }, '暂无发送记录。播报和指令均在这里查看。'),
          button('清空近期记录', () => { if (confirm('清空所选音箱的近期播报与指令记录？')) perform(async () => { await call(`${A}/history/${encodeURIComponent(selected)}`, undefined, 'DELETE', 'assistant'); await readback(() => loadAssistant(), '音响控制数据已保存'); }, '历史已清空'); }, disabled || !(assistant.history[selected] || []).length, 'pk-danger')),
        h('section', { className: 'pk-panel' }, h('h2', null, '快捷控制'), button('添加快捷控制', () => setControlDraft(blankControl()), action.busy),
          assistant.controls.length ? assistant.controls.map(control => h('article', { className: 'pk-row', key: control.id }, h('div', { className: 'pk-grow pk-wrap' }, h('strong', null, control.name), h('small', { className: 'pk-muted' }, ` · ${({ light: '灯光', aircon: '空调', scene: '场景', custom: '其他' })[control.category] || '其他'}`)),
            h('div', { className: 'pk-actions' }, ...(control.mode === 'pair' ? [['on', control.onLabel], ['off', control.offLabel]] : [['action', '执行']]).map(([operation, label]) => button(label, () => perform(() => call(`${A}/execute`, { profileId: selected, controlId: control.id, operation }, 'POST', 'assistant'), '快捷指令已发送'), unavailable)), button('编辑', () => setControlDraft({ ...control }), action.busy)))) : h('p', { className: 'pk-muted' }, '暂无快捷控制。可配置灯光、空调、场景或其他自然语言指令。')),
        controlDraft && h('section', { ref: controlFormRef, className: 'pk-panel' }, h('h2', null, controlDraft.id ? '编辑快捷控制' : '新增快捷控制'), h('form', { className: 'pk-form', onSubmit: async e => { e.preventDefault(); const draft = { ...controlDraft }; const ok = await perform(async () => { await call(`${A}/controls${draft.id ? '/' + encodeURIComponent(draft.id) : ''}`, draft, draft.id ? 'PUT' : 'POST', 'assistant'); setControlDraft(null); await readback(() => loadAssistant(), '音响控制数据已保存'); return true; }, '快捷控制已保存'); if (ok) setControlDraft(null); } },
          field('名称', controlDraft.name, value => updateControl('name', value), { required: true, maxLength: 30 }), select('分类', controlDraft.category, value => updateControl('category', value), [['light', '灯光'], ['aircon', '空调'], ['scene', '场景'], ['custom', '其他']]), select('操作类型', controlDraft.mode, value => updateControl('mode', value), [['pair', '开启 / 关闭'], ['action', '单次执行']]),
          controlDraft.mode === 'pair' ? h(React.Fragment, null, field('开启按钮文字', controlDraft.onLabel, value => updateControl('onLabel', value), { maxLength: 10 }), field('开启指令', controlDraft.onCommand, value => updateControl('onCommand', value), { required: true, maxLength: 200 }), field('关闭按钮文字', controlDraft.offLabel, value => updateControl('offLabel', value), { maxLength: 10 }), field('关闭指令', controlDraft.offCommand, value => updateControl('offCommand', value), { required: true, maxLength: 200 })) : field('执行指令', controlDraft.command, value => updateControl('command', value), { required: true, maxLength: 200 }),
          h('div', { className: 'pk-actions' }, h('button', { type: 'submit', disabled: action.busy }, '保存快捷控制'), button('取消', () => setControlDraft(null), action.busy), controlDraft.id && button('删除', async () => { if (!confirm('删除此快捷控制？不会控制真实设备。')) return; const ok = await perform(async () => { await call(`${A}/controls/${encodeURIComponent(controlDraft.id)}`, undefined, 'DELETE', 'assistant'); setControlDraft(null); await readback(() => loadAssistant(), '音响控制数据已保存'); return true; }, '快捷控制已删除'); if (ok) setControlDraft(null); }, action.busy, 'pk-danger')))));
    }
    return h('fieldset', { ref: rootRef, disabled: action.busy, style: { border: 0, padding: 0, margin: 0, minWidth: 0 }, 'aria-label': '小爱音箱操作' },
      h('nav', { className: 'pk-tabs', 'aria-label': '小爱音箱子视图' }, [['playback', '小爱播放'], ['assistant', '音响控制']].map(([id, label]) => h('button', { type: 'button', key: id, 'aria-pressed': tab === id, onClick: () => switchTab(id) }, label))),
      h('div', { className: `pk-xiaoai-status${statusActive && !configDraft ? ' is-active' : ''}` },
        h('div', { className: 'pk-xiaoai-status-bar' },
          h('div', { className: 'pk-xiaoai-status-body' }, h(Status, { state: action })),
          statusActive && h('button', { type: 'button', className: 'pk-xiaoai-dismiss', 'aria-label': '关闭提示', onClick: action.clear, disabled: action.busy }, '×'))),
      h('section', { className: 'pk-panel pk-xiaoai-service', 'aria-label': '音箱与服务' }, loading ? h('p', { role: 'status' }, '正在读取本地音箱配置…') : !profiles.length ? h('p', null, '尚无音箱配置。请先完成私人数据迁移；本页不会自动创建设备或启动服务。') : select('所选音箱', selected, changeSpeaker, profiles.map(p => [p.id, `${p.name} · ${p.speakerConnected ? '已连接' : p.online ? '等待音箱连接' : p.workerState === 'running' ? '启动中/异常' : '已暂停'}`])),
        profile && serviceNote && h('p', { className: 'pk-wrap pk-muted', role: 'status' }, `${profile.name}：${serviceNote}`),
        profile && profile.workerState !== 'running' && h('p', { className: 'pk-muted pk-wrap' }, '服务已暂停。启动会启用语音监听和已保存的规则；请确认旧 Allinone 已停止且只在可信局域网使用。'),
        refreshing && h('p', { className: 'pk-muted', role: 'status' }, '正在刷新曲库，可继续操作。'),
        h('div', { className: 'pk-actions' }, button('刷新状态和数据', () => perform(refresh, '状态已刷新'), action.busy),
          h('button', { type: 'button', 'aria-expanded': serviceOpen, 'aria-controls': servicePanelId, disabled, onClick: () => setServiceOpen(value => !value) }, serviceOpen ? '收起服务管理 ▴' : '服务管理 ▾')),
        serviceOpen && profile && h('div', { id: servicePanelId, className: 'pk-xiaoai-service-body', role: 'region', 'aria-label': '服务管理' },
          h('p', { role: 'status' }, `服务：${online ? '在线' : profile.workerState === 'running' ? '启动中或异常' : '已停止'} · 音箱：${connected ? '已连接' : '未连接'}`),
          h('p', { className: 'pk-muted' }, '服务负责连接音箱、语音监听与自动规则。只想结束音乐，请用播放台的“停止播放”，不要停止服务。'),
          h('div', { className: 'pk-actions' },
            button('启动音箱服务', () => { if (confirm('启动服务会恢复已启用的语音监听和播放规则，可能产生声音。确认旧服务已停止、仅在可信局域网使用？')) perform(async () => { await call(P('worker/start')); await readback(() => loadProfiles(), '已请求启动'); }, '已请求启动，请等待音箱连接'); }, disabled || profile.workerState === 'running'),
            button('停止音箱服务', () => { if (confirm('停止服务会断开音箱连接，停用语音监听和自动规则，并中断音乐流。缓存声音不保证立即停止。继续？')) perform(async () => { await call(P('worker/stop')); await readback(() => loadProfiles(), '服务已停止'); }, '音箱服务已停止'); }, disabled || profile.workerState !== 'running', 'pk-danger')))),
      selected && (tab === 'playback' ? playbackView() : assistantPanel()), configuration());
  };
}
