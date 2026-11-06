window.__ModuleLoader__.load({
  id: '@local/shortcuts',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'shortcut-links';
    const dictionaries = {
      en: { heading: 'Quick links', details: 'Details and notes', newTab: 'Opens in a new tab', back: 'Back to chat', description: 'Your saved websites, descriptions and notes.', loading: 'Loading…', error: 'Could not load links. Please try again.', retry: 'Retry', open: 'Open website ↗', copyUrl: 'Copy URL', copyNotes: 'Copy notes', copied: 'Copied', copyError: 'Copy failed. Please select the text and copy manually.', notes: 'Notes', noNotes: 'No notes', count: ' saved links' },
      zh: { heading: '快捷访问', details: '详情与备注', newTab: '在新标签页打开', back: '返回对话', description: '常用网站快捷入口，附带说明、备注和图标。', loading: '正在加载…', error: '入口加载失败，请重试。', retry: '重试', open: '打开网站 ↗', copyUrl: '复制网址', copyNotes: '复制备注', copied: '已复制', copyError: '复制失败，请选中文字手动复制。', notes: '备注', noNotes: '暂无备注', count: ' 个快捷入口' },
    };
    const css = `
      .shortcuts-links-foot { flex: 0 0 auto; align-self: stretch; width: 100%; min-width: 0; box-sizing: border-box; color: var(--dsw-alias-label-primary); font: inherit; }
      .shortcuts-links-foot-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; font-size: 10px; }
      .shortcuts-links-grid { display: grid; grid-template-columns: repeat(3, 30px); gap: 2px; }
      .shortcuts-links-icon, .shortcuts-links-summary { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 30px; height: 28px; border-radius: 6px; text-decoration: none; color: inherit; cursor: pointer; }
      .shortcuts-links-icon img { width: 19px; height: 19px; object-fit: contain; }
      .shortcuts-links-icon:hover, .shortcuts-links-summary:hover, .shortcuts-links-button:hover { background: var(--dsw-alias-interactive-bg-hover); }
      .shortcuts-links-foot a:focus-visible, .shortcuts-links-foot button:focus-visible, .shortcuts-links-summary:focus-visible, .shortcuts-links-page a:focus-visible, .shortcuts-links-page button:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; }
      .shortcuts-links-summary { list-style: none; font-size: 18px; }
      .shortcuts-links-summary::-webkit-details-marker { display: none; }
      .shortcuts-links-foot[data-wide='false'] .shortcuts-links-grid { grid-template-columns: 30px; }
      .shortcuts-links-button { background: transparent; color: inherit; font: inherit; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px 10px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
      .shortcuts-links-trigger { display:flex; box-sizing:border-box; width:100%; height:32px; align-items:center; justify-content:flex-start; gap:8px; padding:6px calc(var(--dsh-sidebar-row-padding, 12px) - var(--dsh-sidebar-paint-inset, 3px)); border:0; border-inline:var(--dsh-sidebar-paint-inset, 3px) solid transparent; border-radius:var(--dsw-radius-md); background:transparent; background-clip:padding-box; color:var(--dsw-alias-label-primary); font:inherit; font-size:14px; line-height:20px; text-align:left; cursor:pointer; white-space:nowrap; }
      .shortcuts-links-trigger svg { flex-shrink:0; }
      .shortcuts-links-foot[data-wide='false'] .shortcuts-links-trigger { justify-content:center; width:36px; height:36px; padding:0; border-inline:0; background-clip:border-box; }
      @media (hover:hover) { .shortcuts-links-trigger:hover { background-color:var(--dsw-alias-interactive-bg-hover); } }
      .shortcuts-links-menu { position:fixed; inset:auto; margin:0; box-sizing:border-box; width:200px; max-width:calc(100vw - 16px); max-height:calc(100vh - 24px); overflow-y:auto; padding:4px; border:0; border-radius:var(--dsw-radius-lg); background:var(--dsw-menu-surface-fill); color:var(--dsw-alias-label-primary); backdrop-filter:var(--dsw-menu-backdrop-filter); --dsw-elevation-stroke-color:var(--dsw-alias-border-l1); box-shadow:var(--dsw-elevation-prominent); }
      .shortcuts-links-menu-row { display:flex; box-sizing:border-box; align-items:center; gap:8px; width:100%; min-height:40px; padding:8px 10px; border:0; border-radius:var(--dsw-radius-md); background:transparent; color:var(--dsw-alias-label-primary); font:inherit; font-size:14px; line-height:22px; text-decoration:none; text-align:left; cursor:pointer; }
      .shortcuts-links-menu-row:hover, .shortcuts-links-menu-row:focus-visible { outline: none; background: var(--dsw-alias-interactive-bg-hover); }
      .shortcuts-links-menu-row img { width: 16px; height: 16px; object-fit: contain; }
      .shortcuts-links-menu-arrow { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .shortcuts-links-menu-divider { height: 1px; margin: 5px 4px; background: var(--dsw-alias-border-l2); }
      .shortcuts-links-menu-status { padding: 8px 10px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
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
    function Footer({ wide, t, open }) {
      const state = useBookmarks();
      const trigger = React.useRef(null);
      const menu = React.useRef(null);
      const id = React.useId();
      const [expanded, setExpanded] = React.useState(false);
      React.useEffect(() => {
        const node = menu.current;
        const sync = () => setExpanded(node.matches(':popover-open'));
        node.addEventListener('toggle', sync);
        return () => node.removeEventListener('toggle', sync);
      }, []);
      function close(restoreFocus = false) {
        menu.current?.hidePopover();
        setExpanded(false);
        if (restoreFocus) trigger.current?.focus();
      }
      function show(last = false) {
        const node = menu.current;
        const rect = trigger.current.getBoundingClientRect();
        node.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 224))}px`;
        node.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
        node.style.maxHeight = `${Math.max(80, rect.top - 16)}px`;
        node.showPopover();
        setExpanded(true);
        const entries = node.querySelectorAll('[role="menuitem"]');
        entries[last ? entries.length - 1 : 0]?.focus();
      }
      React.useEffect(() => {
        if (!expanded) return;
        const dismiss = () => close();
        window.addEventListener('resize', dismiss);
        return () => window.removeEventListener('resize', dismiss);
      }, [expanded]);
      React.useEffect(() => { close(); }, [wide]);
      function keyboard(event) {
        const entries = [...menu.current.querySelectorAll('[role="menuitem"]')];
        const index = entries.indexOf(document.activeElement);
        let next;
        if (event.key === 'ArrowDown') next = (index + 1) % entries.length;
        if (event.key === 'ArrowUp') next = (index - 1 + entries.length) % entries.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = entries.length - 1;
        if (next !== undefined) { event.preventDefault(); entries[next]?.focus(); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === 'Tab') close(true);
      }
      const glyph = h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
        h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }),
        h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }),
        h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }),
        h('path', { d: 'M14 17.5h7m-3.5-3.5v7' }));
      return h('div', { className: 'shortcuts-links-foot', 'data-wide': String(wide) }, h('style', null, css),
        h('button', {
          ref: trigger, type: 'button', className: 'shortcuts-links-trigger', title: t('heading'),
          'aria-label': t('heading'), 'aria-haspopup': 'menu', 'aria-expanded': expanded, 'aria-controls': id,
          onClick: () => menu.current.matches(':popover-open') ? close() : show(),
          onKeyDown(event) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(event.key === 'ArrowUp'); }
          },
        }, glyph, wide ? h('span', null, t('heading')) : null),
        h('div', {
          ref: menu, id, popover: 'auto', role: 'menu', className: 'shortcuts-links-menu', 'aria-label': t('heading'),
          'data-menu-material': '', onKeyDown: keyboard,
        },
          state.loading ? h('div', { className: 'shortcuts-links-menu-status', role: 'status' }, t('loading')) : null,
          state.error ? h('button', { role: 'menuitem', className: 'shortcuts-links-menu-row', onClick: state.retry }, t('retry')) : null,
          state.items.map(item => h('a', {
            key: item.id, role: 'menuitem', tabIndex: -1, href: item.url, target: '_blank', rel: 'noopener noreferrer',
            className: 'shortcuts-links-menu-row', title: `${item.title} · ${t('newTab')}`, onClick: () => close(true),
          }, h(Icon, { item }), h('span', null, item.title), h('span', { className: 'shortcuts-links-menu-arrow', 'aria-hidden': true }, '↗'))),
          h('div', { className: 'shortcuts-links-menu-divider', role: 'separator' }),
          h('button', { type: 'button', role: 'menuitem', tabIndex: -1, className: 'shortcuts-links-menu-row', onClick: () => { close(); open(); } },
            h('span', { 'aria-hidden': true }, '☷'), t('details'))));
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
          props => h(Page, { ...props, back: () => ctx.layout.selectPanel(null) })));
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action', id: 'shortcuts', order: 10, locale: NS,
        }, props => h(Footer, { ...props, open: () => ctx.layout.selectPanel('shortcuts') })));
      },
    };
  },
});
