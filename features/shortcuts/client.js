window.__ModuleLoader__.load({
  id: '@local/shortcuts',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'shortcut-links';
    const dictionaries = {
      en: { toolkit: 'Pocket Kit', heading: 'Quick links', details: 'Details and notes', newTab: 'Opens in a new tab', back: 'Back to toolbox', description: 'Your saved websites, descriptions and notes.', loading: 'Loading…', error: 'Could not load links. Please try again.', retry: 'Retry', open: 'Open website ↗', copyUrl: 'Copy URL', copyNotes: 'Copy notes', copied: 'Copied', copyError: 'Copy failed. Please select the text and copy manually.', notes: 'Notes', noNotes: 'No notes', count: ' saved links' },
      zh: { toolkit: '随身工具箱', heading: '快捷访问', details: '详情与备注', newTab: '在新标签页打开', back: '返回工具箱', description: '常用网站快捷入口，附带说明、备注和图标。', loading: '正在加载…', error: '入口加载失败，请重试。', retry: '重试', open: '打开网站 ↗', copyUrl: '复制网址', copyNotes: '复制备注', copied: '已复制', copyError: '复制失败，请选中文字手动复制。', notes: '备注', noNotes: '暂无备注', count: ' 个快捷入口' },
    };
    const css = `
      .shortcuts-links-button:hover { background:var(--dsw-alias-interactive-bg-hover); }
      .shortcuts-links-page a:focus-visible, .shortcuts-links-page button:focus-visible { outline:2px solid var(--dsw-alias-label-primary); outline-offset:2px; }
      .shortcuts-links-button { background: transparent; color: inherit; font: inherit; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px 10px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
      .shortcuts-links-page a:focus-visible, .shortcuts-links-page button:focus-visible { outline:2px solid var(--dsw-alias-label-primary); outline-offset:2px; }
      .shortcuts-links-page { box-sizing: border-box; height: 100%; min-width: 0; overflow: auto; padding: 28px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); font-size: 14px; line-height: 1.6; }
      .shortcuts-links-page-inner { max-width: 1000px; margin: 0 auto; }
      .shortcuts-links-page header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
      .shortcuts-links-page h1 { font-size: 22px; margin: 0; }
      .shortcuts-links-page h2 { font-size: 16px; margin: 0; }
      .shortcuts-links-muted { color: var(--dsw-alias-label-tertiary); }
      .shortcuts-links-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px; margin-top: 20px; }
      .shortcuts-links-card { border: 1px solid var(--dsw-alias-border-l2); border-radius: 16px; padding: 18px; min-width: 0; background: var(--dsw-alias-bg-layer-1); }
      .shortcuts-links-card-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
      .shortcuts-links-art { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .shortcuts-links-art img { width: 26px; height: 26px; object-fit: contain; }
      .shortcuts-links-url { display: block; overflow-wrap: anywhere; font-size: 12px; color: inherit; margin-bottom: 12px; }
      .shortcuts-links-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .shortcuts-links-notes { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; margin: 8px 0; padding: 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); user-select: text; }
      .shortcuts-links-note-heading { margin-top: 16px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
      @media (max-width: 600px) { .shortcuts-links-page { padding: 18px; } }
      .shortcuts-links-card-heading > div { min-width:0; overflow-wrap:anywhere; }
      @media (max-width: 640px), (pointer: coarse) {
        .shortcuts-links-button { min-height:44px; }
        .shortcuts-links-page { padding:16px 12px max(24px, env(safe-area-inset-bottom)); }
        .shortcuts-links-card { padding:14px; }
      }
    `;
    function useBookmarks() {
      const [state, setState] = React.useState({ items: [], loading: true, error: false });
      const [version, setVersion] = React.useState(0);
      React.useEffect(() => {
        const controller = new AbortController();
        setState({ items: [], loading: true, error: false });
        fetch(new URL('api/shortcuts/bookmarks', document.baseURI), {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        }).then(async result => {
          if (!result.ok) throw new Error('Request failed');
          const data = await result.json();
          if (!Array.isArray(data.items)) throw new Error('Invalid response');
          if (!controller.signal.aborted) setState({ items: data.items, loading: false, error: false });
        }).catch(() => {
          if (!controller.signal.aborted) setState({ items: [], loading: false, error: true });
        });
        return () => controller.abort();
      }, [version]);
      return { ...state, retry: () => setVersion(value => value + 1) };
    }
    function Icon({ item }) {
      return item.iconDataUrl ? h('img', { src: item.iconDataUrl, alt: '' }) : h('span', null, item.title.slice(0, 1));
    }
    function Page({ t, back }) {
      const state = useBookmarks();
      const [status, setStatus] = React.useState('');
      const active = React.useRef(true);
      React.useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
      async function copy(text) {
        try { await navigator.clipboard.writeText(text); if (active.current) setStatus(t('copied')); }
        catch { if (active.current) setStatus(t('copyError')); }
      }
      return h('section', { className: 'shortcuts-links-page', 'aria-label': t('heading') }, h('style', null, css),
        h('div', { className: 'shortcuts-links-page-inner' },
          h('header', null, h('h1', null, t('heading')),
            h('button', { className: 'shortcuts-links-button', onClick: back }, t('back'))),
          h('p', { className: 'shortcuts-links-muted' }, t('description')),
          h('div', { role: 'status', 'aria-live': 'polite' }, status),
          state.loading ? h('p', null, t('loading')) : null,
          state.error ? h('div', { role: 'alert' }, t('error'), ' ', h('button', { className: 'shortcuts-links-button', onClick: state.retry }, t('retry'))) : null,
          !state.loading && !state.error ? h('div', { className: 'shortcuts-links-muted' }, `${state.items.length}${t('count')}`) : null,
          h('div', { className: 'shortcuts-links-cards' }, state.items.map(item => h('article', { className: 'shortcuts-links-card', key: item.id },
            h('div', { className: 'shortcuts-links-card-heading' },
              h('span', { className: 'shortcuts-links-art', style: { background: item.color } }, h(Icon, { item })),
              h('div', null, h('h2', null, item.title), h('div', { className: 'shortcuts-links-muted' }, item.description))),
            h('a', { className: 'shortcuts-links-url', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, item.url),
            h('div', { className: 'shortcuts-links-actions' },
              h('a', { className: 'shortcuts-links-button', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, t('open')),
              h('button', { className: 'shortcuts-links-button', onClick: () => copy(item.url) }, t('copyUrl'))),
            h('div', { className: 'shortcuts-links-note-heading' }, t('notes')),
            h('pre', { className: 'shortcuts-links-notes' }, item.notes || t('noNotes')),
            item.notes ? h('button', { className: 'shortcuts-links-button', onClick: () => copy(item.notes) }, t('copyNotes')) : null,
          )))));
    }
    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, dictionaries));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'shortcuts', locale: NS },
          props => h(Page, { ...props, back: () => ctx.layout.selectPanel('pocket-kit.home') })));

      },
    };
  },
});
