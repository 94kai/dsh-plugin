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
  // The bridge owns fixed module prefixes; only relative API paths cross it.
  const M = '', A = '';
  const songName = song => song.title || song.name || String(song.path || '').split('/').pop();
  const blankControl = () => ({ id: '', name: '', category: 'light', mode: 'pair', onLabel: '开启', offLabel: '关闭', onCommand: '', offCommand: '', command: '' });
  const blankRule = () => ({ id: '', playlistId: '', time: '', phrase: '', repeat: 1, enabled: true });
  const newId = () => crypto.randomUUID();
  const area = (label, value, set, props = {}) => h('label', null, label, h('textarea', { value, onChange: e => set(e.target.value), ...props }));
  const check = (label, value, set) => h('label', { className: 'pk-check' }, h('input', { type: 'checkbox', checked: !!value, onChange: e => set(e.target.checked) }), label);
  return function XiaoaiView() {
    const api = useApi('xiaoai'), action = useAction();
    const [tab, setTab] = React.useState('playback'), [profiles, setProfiles] = React.useState([]), [selected, setSelected] = React.useState('');
    const [loading, setLoading] = React.useState(true), [collectionState, setCollection] = React.useState({ profileId: '', ready: false, playlist: [], favorites: [], announcements: [] });
    const [libraryTab, setLibraryTab] = React.useState('playlist'), [query, setQuery] = React.useState(''), [hits, setHits] = React.useState([]), [searched, setSearched] = React.useState(false);
    const [repeat, setRepeat] = React.useState(1), [volume, setVolume] = React.useState(30), [speak, setSpeak] = React.useState('');
    const [configDraft, setConfigDraft] = React.useState(null), [automation, setAutomation] = React.useState(null), [autoId, setAutoId] = React.useState('');
    const [autoName, setAutoName] = React.useState(''), [autoQuery, setAutoQuery] = React.useState(''), [autoHits, setAutoHits] = React.useState([]), [rule, setRule] = React.useState(blankRule);
    const [assistant, setAssistant] = React.useState({ controls: [], history: {} }), [mode, setMode] = React.useState('speak'), [text, setText] = React.useState(''), [controlDraft, setControlDraft] = React.useState(null);
    const selectedRef = React.useRef(selected), profileSerial = React.useRef(0), active = React.useRef(true);
    const collectionGate = React.useRef(null), assistantSerial = React.useRef(0), automationSerial = React.useRef(0);
    if (!collectionGate.current) collectionGate.current = createXiaoaiReadGate();
    selectedRef.current = selected;
    const collectionReady = collectionState.profileId === selected && collectionState.ready;
    const collection = collectionReady ? collectionState : { playlist: [], favorites: [], announcements: [] };
    const profile = profiles.find(p => p.id === selected), connected = !!profile?.speakerConnected, online = !!profile?.online;
    const disabled = action.busy || !selected, unavailable = disabled || !online || !connected;
    const P = (suffix = '', id = selectedRef.current) => `${M}/profiles/${encodeURIComponent(id)}${suffix ? '/' + suffix : ''}`;
    const read = async (path, module = 'playback') => api(path, 'GET', undefined, module);
    function invalidateCollection(id = selectedRef.current) {
      collectionGate.current.invalidate(id);
      setCollection({ profileId: id, ready: false, playlist: [], favorites: [], announcements: [] });
    }
    const call = async (path, body = {}, method = 'POST', module = 'playback') => {
      if (module === 'playback' && /\/(playlist|favorites|speak|announcements)(?:[?]|$)/.test(path)) invalidateCollection();
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
      setCollection({ profileId: id, ready: false, playlist: [], favorites: [], announcements: [] });
      const result = await read(P('collection', id));
      if (active.current && collectionGate.current.accepts(ticket, selectedRef.current)) setCollection({ profileId: id, ready: true, playlist: result.playlist || [], favorites: result.favorites || [], announcements: result.announcements || [] });
    }

    async function loadAssistant() { const serial = ++assistantSerial.current; const result = await read(`${A}/state`, 'assistant'); if (active.current && serial === assistantSerial.current) setAssistant({ controls: result.controls || [], history: result.history || {} }); }
    async function loadAutomation() { const serial = ++automationSerial.current; const result = await read(`${M}/automation`); if (active.current && serial === automationSerial.current) setAutomation(result); }
    async function refresh() { await loadProfiles(); await Promise.all([loadCollection(), loadAssistant(), loadAutomation()]); }
    React.useEffect(() => {
      active.current = true;
      refresh().catch(e => { if (active.current && e.name !== 'AbortError') action.setError(e.message); }).finally(() => { if (active.current) setLoading(false); });
      const timer = setInterval(() => { if (!document.hidden) loadProfiles().catch(() => {}); }, 10000);
      return () => { active.current = false; clearInterval(timer); ++profileSerial.current; collectionGate.current.invalidate(''); ++assistantSerial.current; ++automationSerial.current; };
    }, []);
    React.useEffect(() => {
      setHits([]); setSearched(false); invalidateCollection(selected); setConfigDraft(null); setAutoHits([]); setAutoId(''); setRule(blankRule());
      if (!selected) return;
      try { localStorage.setItem('pocket-kit-xiaoai-speaker', selected); setRepeat(Math.max(1, Math.min(20, Number(localStorage.getItem(`pocket-kit-xiaoai-repeat:${selected}`) || localStorage.getItem(`allinone-music-repeat:${selected}`)) || 1))); } catch {}
      setVolume(profiles.find(p => p.id === selected)?.volume ?? 30);
      loadCollection(selected).catch(e => { if (active.current && e.name !== 'AbortError') action.setError(e.message); });
    }, [selected]);
    const perform = (fn, notice) => action.run(fn, notice);
    async function musicAction(name, payload, notice) {
      const id = selectedRef.current;
      return perform(async () => { await call(P(name, id), payload); await readback(async () => { await loadProfiles(); if (name === 'speak') await loadCollection(id); }, notice || '设备操作请求已发送'); return true; }, notice);
    }
    function changeSpeaker(id) { if (action.busy) return; invalidateCollection(id); selectedRef.current = id; setSelected(id); }
    async function saveAutomation(change, notice = '自动歌单已保存；worker 暂停时不会执行') {
      if (!automation) return action.setError('请先加载自动播放配置');
      return perform(async () => {
        const next = structuredClone(automation); change(next);
        const result = await call(`${M}/automation`, next, 'PUT'); setAutomation(result); return true;
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
      return songs.map((song, index) => h('article', { className: 'pk-row', key: song.path },
        h('div', { className: 'pk-grow pk-wrap' }, h('strong', null, songName(song)), h('div', { className: 'pk-muted' }, [song.artist, song.album].filter(Boolean).join(' · ')), song.size ? h('small', null, `${(song.size / 1048576).toFixed(1)} MiB`) : null),
        h('div', { className: 'pk-actions' },
          button('播放', () => musicAction(context === 'search' ? 'play' : 'collection/play', context === 'search' ? { path: song.path, repeat } : { source: context, index, repeat }, '播放请求已发送'), unavailable),
          context === 'search' && button('加入列表', () => perform(async () => { await call(P('playlist'), { songs: [song] }); await readback(() => loadCollection(), '列表或历史已更新'); }, '已加入播放列表'), disabled),
          button(favorite(song) ? '取消喜欢' : '喜欢', () => perform(async () => { await call(P('favorites'), { song, favorite: !favorite(song) }, 'PUT'); await readback(() => loadCollection(), '列表或历史已更新'); }, '收藏已更新'), disabled || !collectionReady),
          context === 'playlist' && button('移除', () => { if (confirm('从播放列表移除此歌曲？不会删除音乐文件。')) perform(async () => { await call(`${P('playlist')}?path=${encodeURIComponent(song.path)}`, undefined, 'DELETE'); await readback(() => loadCollection(), '列表或历史已更新'); }, '已从列表移除'); }, disabled, 'pk-danger'))));
    }
    function configuration() {
      if (!configDraft) return null;
      const update = (key, value) => setConfigDraft(previous => ({ ...previous, [key]: value }));
      const lines = key => area(key === 'musicDirs' ? '音乐目录（每行一个绝对路径，最多10个）' : ({ playKeywords: '播放关键词', stopKeywords: '附加停止关键词', refreshKeywords: '刷新关键词', randomKeywords: '随机播放关键词' })[key], configDraft[key], value => update(key, value));
      return h('section', { className: 'pk-panel' }, h('h2', null, '音箱配置'), h('p', { className: 'pk-muted' }, '保存运行中音箱的配置会重启对应 worker；暂停的音箱保持暂停。不会创建新设备，也不会更改原服务配置。'),
        h('form', { className: 'pk-form', onSubmit: async event => {
          event.preventDefault(); const id = selected;
          const payload = { ...configDraft, maxResults: Number(configDraft.maxResults), refreshInterval: Number(configDraft.refreshInterval) };
          for (const key of ['musicDirs', 'playKeywords', 'stopKeywords', 'refreshKeywords', 'randomKeywords']) payload[key] = configDraft[key].split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          if (profile?.workerState === 'running' && !confirm('保存配置会重启此音箱 worker，可能中断当前播放。继续？')) return;
          const ok = await perform(async () => { await call(P('', id), payload, 'PUT'); setConfigDraft(null); await readback(() => loadProfiles(), '请求已发送或配置已保存'); return true; }, '配置已保存'); if (ok) setConfigDraft(null);
        } }, field('名称', configDraft.name, value => update('name', value), { required: true, maxLength: 30 }), lines('musicDirs'), field('音箱可访问的音频 base URL', configDraft.baseUrl, value => update('baseUrl', value), { type: 'url', required: true }),
          h('div', { className: 'pk-grid' }, field('语音搜索数量上限', configDraft.maxResults, value => update('maxResults', value), { type: 'number', min: 1, max: 100 }), field('自动刷新间隔（秒，0关闭）', configDraft.refreshInterval, value => update('refreshInterval', value), { type: 'number', min: 0 })),
          lines('playKeywords'), area(`内置停止关键词（只读，${profile?.builtinStopKeywords?.length || 0} 条）`, profile?.builtinStopKeywords?.join('\n') || 'worker 暂停或尚未连接，未读取运行时内置词表。', () => {}, { readOnly: true }), lines('stopKeywords'), lines('refreshKeywords'), lines('randomKeywords'),
          h('div', { className: 'pk-actions' }, h('button', { type: 'submit', disabled, className: 'pk-primary' }, '保存配置'), button('取消', () => setConfigDraft(null), action.busy))));
    }
    function automationPanel() {
      const last = profile?.automation?.last;
      return h('section', { className: 'pk-panel' }, h('h2', null, '定时与语音歌单'),
        h('p', { className: 'pk-muted pk-wrap' }, '每日北京时间；关闭网页仍有效，但须先显式启动 worker。每条规则每天最多定时尝试一次；错过、离线或失败不补播。语音规则还需要开启语音监听。'),
        last && h('p', { className: 'pk-wrap', role: 'status' }, `最近执行：${last.at || ''} · ${last.playlist || ''} · ${last.status || ''}${last.error ? ' · ' + last.error : ''}`),
        profile?.automation?.error && h('p', { role: 'alert' }, profile.automation.error),
        button('重新加载自动播放配置', () => perform(loadAutomation, '配置已重新加载'), action.busy),
        !automation ? h('p', null, '自动播放配置尚未读取；错误时不会覆盖原文件。') : h(React.Fragment, null,
          h('form', { className: 'pk-form', onSubmit: async e => { e.preventDefault(); const id = newId(); const ok = await saveAutomation(next => next.playlists.push({ id, profileId: selected, name: autoName, songs: [] })); if (ok) { setAutoId(id); setAutoName(''); } } },
            field('新歌单名称', autoName, setAutoName, { required: true, maxLength: 40 }), h('button', { type: 'submit', disabled }, '创建歌单')),
          !!lists.length && h(React.Fragment, null,
            select('选择命名歌单', chosenList?.id || '', setAutoId, lists.map(p => [p.id, `${p.name}（${p.songs.length}首）`])),
            h('div', { className: 'pk-actions' }, button('修改名称', () => { const name = prompt('歌单名称', chosenList.name); if (name !== null) saveAutomation(next => { next.playlists.find(p => p.id === chosenList.id).name = name; }); }, disabled),
              button('导入当前播放列表', () => { if (confirm('将当前播放列表复制到此歌单？已有歌曲会去重，不建立动态关联。')) saveAutomation(next => { const list = next.playlists.find(p => p.id === chosenList.id); for (const song of collection.playlist) if (!list.songs.some(item => item.path === song.path)) list.songs.push(song); }); }, disabled || !collection.playlist.length),
              button('删除歌单', () => { if (confirm('删除此命名歌单及关联规则？音乐文件不受影响。')) saveAutomation(next => { next.playlists = next.playlists.filter(p => p.id !== chosenList.id); next.rules = next.rules.filter(r => r.playlistId !== chosenList.id); }); }, disabled, 'pk-danger')),
            h('form', { className: 'pk-form', onSubmit: e => { e.preventDefault(); const id = selected; perform(async () => { const result = await read(`${P('search', id)}?q=${encodeURIComponent(autoQuery)}`); if (selectedRef.current === id) setAutoHits(result.items || []); }, '歌单搜索完成'); } }, field('搜索歌曲加入此歌单', autoQuery, setAutoQuery, { maxLength: 100, required: true }), h('button', { type: 'submit', disabled: disabled || !online }, '搜索曲库')),
            autoHits.map(song => h('div', { className: 'pk-row', key: song.path }, h('span', { className: 'pk-grow pk-wrap' }, songName(song)), button('加入歌单', () => saveAutomation(next => { const list = next.playlists.find(p => p.id === chosenList.id); if (!list.songs.some(item => item.path === song.path)) list.songs.push(song); }), disabled))),
            h('h3', null, '歌单歌曲'), chosenList.songs.length ? chosenList.songs.map((song, index) => h('div', { className: 'pk-row', key: song.path }, h('span', { className: 'pk-grow pk-wrap' }, `${index + 1}. ${songName(song)}`), button('移除', () => { if (confirm('从命名歌单移除此歌曲？')) saveAutomation(next => { next.playlists.find(p => p.id === chosenList.id).songs.splice(index, 1); }); }, disabled))) : h('p', { className: 'pk-muted' }, '歌单为空，先添加歌曲再启用规则。')),
          h('h3', null, rule.id ? '编辑规则' : '新增规则'),
          h('form', { className: 'pk-form', onSubmit: async e => { e.preventDefault(); const nextRule = { ...rule, id: rule.id || newId(), profileId: selected, playlistId: rule.playlistId || chosenList?.id || '', repeat: Number(rule.repeat) }; const ok = await saveAutomation(next => { const i = next.rules.findIndex(r => r.id === nextRule.id); if (i >= 0) next.rules[i] = nextRule; else next.rules.push(nextRule); }); if (ok) setRule(blankRule()); } },
            select('规则播放的歌单', rule.playlistId || chosenList?.id || '', value => updateRule('playlistId', value), lists.map(p => [p.id, p.name])),
            h('div', { className: 'pk-grid' }, field('每天北京时间（可留空）', rule.time, value => updateRule('time', value), { type: 'time' }), field('播放轮数', rule.repeat, value => updateRule('repeat', value), { type: 'number', min: 1, max: 20, required: true })),
            field('语音提示词（与时间至少填写一项）', rule.phrase, value => updateRule('phrase', value), { maxLength: 80 }), check('启用规则', rule.enabled, value => updateRule('enabled', value)),
            h('div', { className: 'pk-actions' }, h('button', { type: 'submit', disabled: disabled || !lists.length }, rule.id ? '保存规则' : '添加规则'), rule.id && button('取消编辑', () => setRule(blankRule()), action.busy))),
          rules.length ? rules.map(item => h('article', { className: 'pk-row', key: item.id }, h('div', { className: 'pk-grow pk-wrap' }, h('strong', null, lists.find(p => p.id === item.playlistId)?.name || '歌单'), h('p', { className: 'pk-muted' }, `${item.enabled ? '已启用' : '已停用'} · ${item.time ? '每天 ' + item.time : '无定时'} · ${item.repeat}轮${item.phrase ? ' · 说：' + item.phrase : ''}`)), h('div', { className: 'pk-actions' },
            button('编辑', () => setRule({ ...item }), disabled), button(item.enabled ? '停用' : '启用', () => saveAutomation(next => { const target = next.rules.find(r => r.id === item.id); target.enabled = !target.enabled; }), disabled),
            button('删除', () => { if (confirm('删除这条自动播放规则？')) saveAutomation(next => { next.rules = next.rules.filter(r => r.id !== item.id); }); }, disabled, 'pk-danger')))) : h('p', { className: 'pk-muted' }, '暂无自动播放规则')));
    }
    function playbackPanel() {
      return h(React.Fragment, null,
        h('section', { className: 'pk-panel' }, h('h2', null, profile?.currentSong || '当前未播放'), h('p', { className: 'pk-muted' }, `曲库 ${profile?.librarySize ?? '—'} 首 · 待播 ${profile?.queueSize ?? 0} 首${profile?.refreshing ? ' · 正在刷新曲库' : ''}`),
          h('div', { className: 'pk-grid' }, field('总播放轮数（1–20）', repeat, value => { const n = Math.max(1, Math.min(20, Number(value) || 1)); setRepeat(n); try { localStorage.setItem(`pocket-kit-xiaoai-repeat:${selected}`, String(n)); } catch {} }, { type: 'number', min: 1, max: 20 }), field('音量（0–100，点击应用后生效）', volume, setVolume, { type: 'number', min: 0, max: 100 })),
          h('div', { className: 'pk-actions' }, button('随机播放', () => musicAction('random', { repeat }, '随机播放请求已发送'), unavailable), button('停止播放并清空运行队列', () => musicAction('stop', {}, '已停止播放；持久列表保留'), unavailable), button('应用音量', () => musicAction('volume', { volume: Number(volume) }, '音量请求已发送'), unavailable)),
          h('div', { className: 'pk-actions' }, button('刷新曲库', () => musicAction('refresh', {}, '曲库刷新完成'), disabled || !online), button(profile?.listenerEnabled ? '关闭语音监听' : '开启语音监听', () => musicAction('listener', { enabled: !profile?.listenerEnabled }, '语音监听设置已更新'), disabled || !online),
            button('音箱配置', () => { if (!profile) return; const draft = { name: profile.name, baseUrl: profile.baseUrl, maxResults: profile.maxResults, refreshInterval: profile.refreshInterval }; for (const key of ['musicDirs', 'playKeywords', 'stopKeywords', 'refreshKeywords', 'randomKeywords']) draft[key] = (profile[key] || []).join('\n'); setConfigDraft(draft); }, disabled)),
          h('details', { className: 'pk-panel' }, h('summary', null, `运行播放队列（${profile?.queueSize || 0}首待播）`), (profile?.queue || []).length ? profile.queue.map((song, index) => h('div', { className: 'pk-row', key: `${index}:${song.path}` }, h('div', { className: 'pk-grow pk-wrap' }, `${song.current ? '正在播放' : index + '.'} ${song.name}`, song.durationSec ? h('small', null, ` · ${Math.round(song.durationSec)}秒`) : null), button(song.current ? '当前歌曲' : '切换到此曲', () => musicAction('queue/jump', { index }, '已发送切歌请求'), unavailable || song.current))) : h('p', { className: 'pk-muted' }, '暂无运行队列。它与下面的持久播放列表相互独立。'))),
        configuration(),
        h('nav', { className: 'pk-tabs', 'aria-label': '播放内容' }, [['playlist', '播放列表'], ['search', '曲库搜索'], ['favorites', '我喜欢'], ['automation', '定时播放']].map(([id, label]) => h('button', { type: 'button', key: id, 'aria-selected': libraryTab === id, onClick: () => setLibraryTab(id) }, label))),
        libraryTab === 'automation' ? automationPanel() : h('section', { className: 'pk-panel' },
          libraryTab === 'search' ? h(React.Fragment, null, h('form', { className: 'pk-form', onSubmit: e => { e.preventDefault(); const id = selected; perform(async () => { const result = await read(`${P('search', id)}?q=${encodeURIComponent(query)}`); if (selectedRef.current === id) { setHits(result.items || []); setSearched(true); } }, '搜索完成'); } }, field('搜索本地曲库', query, setQuery, { required: true, maxLength: 100 }), h('button', { type: 'submit', disabled: disabled || !online }, '搜索')), !!hits.length && button('全部加入播放列表', () => perform(async () => { await call(P('playlist'), { songs: hits }); await readback(() => loadCollection(), '列表或历史已更新'); }, '搜索结果已加入列表'), disabled), tracks(hits, 'search')) : h(React.Fragment, null,
            h('div', { className: 'pk-actions' }, button('从第一首播放', () => musicAction('collection/play', { source: libraryTab, index: 0, repeat }, '列表播放请求已发送'), unavailable || !collection[libraryTab]?.length), libraryTab === 'playlist' && button('清空播放列表', () => { if (confirm('清空持久播放列表？收藏和音乐文件不受影响。')) perform(async () => { await call(P('playlist'), { mode: 'replace', songs: [] }); await readback(() => loadCollection(), '列表或历史已更新'); }, '播放列表已清空'); }, disabled || !collection.playlist.length, 'pk-danger')), !collectionReady ? h('p', { className: 'pk-muted', role: 'status' }, '当前设备列表尚未加载完成；请等待或刷新状态，列表操作暂不可用。') : tracks(collection[libraryTab] || [], libraryTab))),
        h('details', { className: 'pk-panel' }, h('summary', null, '播放侧播报与既有记录'), h('p', { className: 'pk-muted' }, '保留迁移前音乐模块的最近5条播报记录；音响控制视图另有独立历史。'), area('文字播报', speak, setSpeak, { maxLength: 500 }), button('发送播报', () => musicAction('speak', { text: speak }, '播报请求已发送'), unavailable || !speak.trim()),
          collection.announcements.map((message, i) => h('div', { className: 'pk-row', key: i }, h('span', { className: 'pk-grow pk-wrap' }, message), button('重播', () => musicAction('speak', { text: message }, '播报请求已发送'), unavailable))), button('清空播放侧播报历史', () => { if (confirm('清空当前音箱在播放侧保存的播报历史？')) perform(async () => { await call(P('announcements'), undefined, 'DELETE'); await readback(() => loadCollection(), '列表或历史已更新'); }, '播报历史已清空'); }, disabled || !collection.announcements.length, 'pk-danger')));
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
          h('p', { className: 'pk-muted' }, mode === 'speak' ? '音箱会原样读出文字。' : '这是实际设备指令，可能影响灯光、空调和其他米家设备。'), button('发送到所选音箱', () => sendText(text.trim(), mode, true), unavailable || !text.trim(), 'pk-primary'),
          h('div', { className: 'pk-actions' }, field('音量（0–100）', volume, setVolume, { type: 'number', min: 0, max: 100 }), button('应用音量', () => perform(async () => { await call(`${A}/volume`, { profileId: selected, volume: Number(volume) }, 'POST', 'assistant'); await readback(() => loadProfiles(), '请求已发送或配置已保存'); }, '音量请求已发送'), unavailable))),
        h('section', { className: 'pk-panel' }, h('h2', null, '最近发送'), history.length ? history.map((item, index) => h('div', { className: 'pk-row', key: index }, h('div', { className: 'pk-grow pk-wrap' }, item.text, h('small', { className: 'pk-muted' }, ` · ${item.mode === 'speak' ? '播报' : '指令'}`)), h('div', { className: 'pk-actions' }, button('填入编辑', () => { setText(item.text); setMode(item.mode); }, action.busy), button('再次发送', () => { setText(item.text); setMode(item.mode); sendText(item.text, item.mode); }, unavailable)))) : h('p', { className: 'pk-muted' }, '暂无成功发送历史。每台音箱独立保存最近5条。'),
          button('清空此音箱历史', () => { if (confirm('清空所选音箱的最近发送历史？')) perform(async () => { await call(`${A}/history/${encodeURIComponent(selected)}`, undefined, 'DELETE', 'assistant'); await readback(() => loadAssistant(), '音响控制数据已保存'); }, '历史已清空'); }, disabled || !history.length, 'pk-danger')),
        h('section', { className: 'pk-panel' }, h('h2', null, '快捷控制'), button('添加快捷控制', () => setControlDraft(blankControl()), action.busy),
          assistant.controls.length ? assistant.controls.map(control => h('article', { className: 'pk-row', key: control.id }, h('div', { className: 'pk-grow pk-wrap' }, h('strong', null, control.name), h('small', { className: 'pk-muted' }, ` · ${({ light: '灯光', aircon: '空调', scene: '场景', custom: '其他' })[control.category] || '其他'}`)),
            h('div', { className: 'pk-actions' }, ...(control.mode === 'pair' ? [['on', control.onLabel], ['off', control.offLabel]] : [['action', '执行']]).map(([operation, label]) => button(label, () => perform(() => call(`${A}/execute`, { profileId: selected, controlId: control.id, operation }, 'POST', 'assistant'), '快捷指令已发送'), unavailable)), button('编辑', () => setControlDraft({ ...control }), action.busy)))) : h('p', { className: 'pk-muted' }, '暂无快捷控制。可配置灯光、空调、场景或其他自然语言指令。')),
        controlDraft && h('section', { className: 'pk-panel' }, h('h2', null, controlDraft.id ? '编辑快捷控制' : '新增快捷控制'), h('form', { className: 'pk-form', onSubmit: async e => { e.preventDefault(); const draft = { ...controlDraft }; const ok = await perform(async () => { await call(`${A}/controls${draft.id ? '/' + encodeURIComponent(draft.id) : ''}`, draft, draft.id ? 'PUT' : 'POST', 'assistant'); setControlDraft(null); await readback(() => loadAssistant(), '音响控制数据已保存'); return true; }, '快捷控制已保存'); if (ok) setControlDraft(null); } },
          field('名称', controlDraft.name, value => updateControl('name', value), { required: true, maxLength: 30 }), select('分类', controlDraft.category, value => updateControl('category', value), [['light', '灯光'], ['aircon', '空调'], ['scene', '场景'], ['custom', '其他']]), select('操作类型', controlDraft.mode, value => updateControl('mode', value), [['pair', '开启 / 关闭'], ['action', '单次执行']]),
          controlDraft.mode === 'pair' ? h(React.Fragment, null, field('开启按钮文字', controlDraft.onLabel, value => updateControl('onLabel', value), { maxLength: 10 }), field('开启指令', controlDraft.onCommand, value => updateControl('onCommand', value), { required: true, maxLength: 200 }), field('关闭按钮文字', controlDraft.offLabel, value => updateControl('offLabel', value), { maxLength: 10 }), field('关闭指令', controlDraft.offCommand, value => updateControl('offCommand', value), { required: true, maxLength: 200 })) : field('执行指令', controlDraft.command, value => updateControl('command', value), { required: true, maxLength: 200 }),
          h('div', { className: 'pk-actions' }, h('button', { type: 'submit', disabled: action.busy }, '保存快捷控制'), button('取消', () => setControlDraft(null), action.busy), controlDraft.id && button('删除', async () => { if (!confirm('删除此快捷控制？不会控制真实设备。')) return; const ok = await perform(async () => { await call(`${A}/controls/${encodeURIComponent(controlDraft.id)}`, undefined, 'DELETE', 'assistant'); setControlDraft(null); await readback(() => loadAssistant(), '音响控制数据已保存'); return true; }, '快捷控制已删除'); if (ok) setControlDraft(null); }, action.busy, 'pk-danger')))));
    }
    return h('fieldset', { disabled: action.busy, style: { border: 0, padding: 0, margin: 0, minWidth: 0 }, 'aria-label': '小爱音箱操作' },
      h('nav', { className: 'pk-tabs', 'aria-label': '小爱音箱子视图' }, [['playback', '小爱播放'], ['assistant', '音响控制']].map(([id, label]) => h('button', { type: 'button', key: id, 'aria-selected': tab === id, onClick: () => setTab(id) }, label))),
      h(Status, { state: action }),
      h('section', { className: 'pk-panel' }, h('h2', null, '音箱与服务'), loading ? h('p', { role: 'status' }, '正在读取本地音箱配置…') : !profiles.length ? h('p', null, '尚无音箱配置。请先完成私人数据迁移；本页不会自动创建设备或启动服务。') : select('所选音箱', selected, changeSpeaker, profiles.map(p => [p.id, `${p.name} · ${p.speakerConnected ? '已连接' : p.online ? '等待音箱连接' : p.workerState === 'running' ? '启动中/异常' : '已暂停'}`])),
        profile && h('p', { className: 'pk-wrap', role: 'status' }, `${profile.name}：${connected ? '音箱已连接' : online ? '服务在线，音箱未连接' : profile.processError || 'worker 已暂停'}${profile.listenerEnabled ? '' : ' · 语音监听关闭'}`),
        h('p', { className: 'pk-muted' }, '迁移后默认全部暂停，不会自动播放或运行定时。启动前须停止旧 Allinone 小爱 worker，并在本地私密配置明确确认未鉴权局域网兼容风险；只绑定可信私网地址，不能暴露公网。'),
        h('div', { className: 'pk-actions' }, button('刷新状态和数据', () => perform(refresh, '状态已刷新'), action.busy),
          button('启动所选音箱服务', () => { if (confirm('启动后会监听音箱、刷新曲库，并启用已保存的定时和语音规则，可能触发实际播放。确认已停止旧服务并隔离可信局域网？')) perform(async () => { await call(P('worker/start')); await readback(() => loadProfiles(), '请求已发送或配置已保存'); }, '已请求启动；请稍后刷新检查连接'); }, disabled || profile?.workerState === 'running'),
          button('停止所选音箱服务', () => { if (confirm('停止此 worker 的监听、音乐流和自动播放任务？不会停止其他进程或删除数据。设备已经缓存的音频不保证立即结束。')) perform(async () => { await call(P('worker/stop')); await readback(() => loadProfiles(), '请求已发送或配置已保存'); }, '所选 worker 已停止'); }, disabled || profile?.workerState === 'stopped', 'pk-danger'))),
      selected && (tab === 'playback' ? playbackPanel() : assistantPanel()));
  };
}
