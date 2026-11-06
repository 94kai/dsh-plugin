window.__ModuleLoader__.load({
  id: '@local/network-speed',
  factory(require) {
    /* MEASUREMENT_ENGINE */
    const React = require('react');
    const h = React.createElement;
    const dictionaries = {
      zh: {
        title:'连接测速', subtitle:'当前浏览器 ⇄ DSH 服务端', close:'关闭', download:'下载', upload:'上传', downHint:'服务端 → 本机', upHint:'本机 → 服务端', latency:'请求往返延迟', jitter:'延迟波动', chart:'传输速率', empty:'开始测速后显示实际传输速率', start:'开始测速', stop:'停止测速', idle:'尚未测试', running:'测速中', stopped:'已停止 · 保留部分结果', done:'测速完成', error:'测速失败', preparing:'准备连接', complete:'完成', noResult:'暂无测量数据', details:'测试说明', warning:'手动测试约 20 秒；下载、上传各最多 128 MiB。测速可能短暂影响聊天和文件传输，关闭面板即停止。', explanation:'单连接串行 HTTP 测试，结果包含代理、VPN、TLS 与请求开销，不代表网卡峰值或模型响应速度。延迟为 5 次 HTTP 往返中位数，波动为相邻往返时长差的平均值，不是 ICMP ping 或丢包率。', uploadExplanation:'上传速率仅统计服务端确认收到的完整请求；截止时尚未确认的请求不计入结果。上传提交量是请求数据量上限，不等于实际收到的流量。', downUsage:'下载已接收', upUsage:'上传已确认', upSubmitted:'上传已提交', capped:'已达流量上限', partial:'未完成', average:'累计平均速率', target:'当前站点', axis:'秒', lastTest:'完成时间', seconds:'秒', unknown:'请求失败，请重试', limited:'服务器忙或请求过于频繁，请稍后重试', expired:'测试会话已过期，请重新开始', networkError:'网络连接中断，请检查连接后重试', timeout:'请求超时，未完成的结果仅供参考', protocolError:'测速响应不匹配，请检查插件版本、代理缓存或压缩设置', noSamples:'没有获得有效传输样本，请检查网络后重试', budget:'已超过服务端流量限制', badRequest:'测速请求被拒绝，请重新打开面板重试', unavailable:'测速后端不可用，请检查插件加载状态', unauthorized:'连接认证失效，请重新连接 DSH', completionNote:'单流应用层吞吐 · KB/s / MB/s（十进制）'
      },
      en: {
        title:'Connection speed', subtitle:'This browser ⇄ DSH server', close:'Close', download:'Download', upload:'Upload', downHint:'Server → this device', upHint:'This device → server', latency:'Request round-trip', jitter:'Latency variation', chart:'Transfer rate', empty:'Actual transfer rates appear after starting', start:'Start test', stop:'Stop test', idle:'Not tested yet', running:'Testing', stopped:'Stopped · partial results retained', done:'Test complete', error:'Test failed', preparing:'Connecting', complete:'Complete', noResult:'No measurements yet', details:'About this test', warning:'A manual test takes about 20 seconds, up to 128 MiB in each direction. It may briefly affect chat and transfers. Closing the panel stops testing.', explanation:'Single-connection serial HTTP testing includes proxies, VPN, TLS and request overhead; it is not peak network capacity or model latency. RTT is the median of 5 HTTP requests; variation is the average absolute difference between adjacent RTTs, not ICMP ping or packet loss.', uploadExplanation:'Upload rate counts only complete requests acknowledged by the server. A request not acknowledged by the deadline is excluded. Submitted bytes are an upper bound on upload payload, not the actual received traffic.', downUsage:'Downloaded', upUsage:'Upload acknowledged', upSubmitted:'Upload submitted', capped:'Data cap reached', partial:'Incomplete', average:'Cumulative average', target:'Current site', axis:'seconds', lastTest:'Completed', seconds:'s', unknown:'Request failed; please retry', limited:'Server busy or rate limited; retry shortly', expired:'Test session expired; start again', networkError:'Connection interrupted; check your network and retry', timeout:'Request timed out; unfinished results are partial', protocolError:'Unexpected test response; check plugin version, proxy caching or compression', noSamples:'No valid transfer samples; check your network and retry', budget:'Server transfer budget exceeded', badRequest:'Test request rejected; reopen the panel and retry', unavailable:'Speed backend unavailable; check plugin activation', unauthorized:'Authentication expired; reconnect to DSH', completionNote:'Single-stream application throughput · decimal KB/s / MB/s'
      }
    };
    const css = `
.ns-dialog{box-sizing:border-box;width:540px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 32px);margin:auto;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:14px/1.5 system-ui,sans-serif;overflow:auto;pointer-events:auto}
.ns-dialog::backdrop{background:color-mix(in srgb,var(--dsw-alias-bg-base) 65%,transparent);backdrop-filter:blur(5px)}.ns-body{padding:24px}.ns-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ns-title{margin:0;font-size:20px;font-weight:650;letter-spacing:-.4px}.ns-sub{font-size:12px;color:var(--dsw-alias-label-secondary);margin:5px 0 0}.ns-target{overflow-wrap:anywhere;font-size:12px;margin-top:4px;color:var(--dsw-alias-label-secondary)}
.ns-close{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:32px;height:32px;padding:6px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex-shrink:0;font-size:22px}.ns-close:hover{background:var(--dsw-alias-bg-layer-2)}
.ns-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}.ns-card{min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;background:var(--dsw-alias-bg-layer-1)}.ns-card[data-active=true]{border-color:var(--dsw-alias-brand-primary)}.ns-label{font-size:12px;color:var(--dsw-alias-label-secondary)}.ns-number{display:flex;align-items:baseline;gap:7px;margin:8px 0 4px;flex-wrap:wrap}.ns-number strong{font-size:34px;font-weight:600;line-height:1.15;letter-spacing:-1px;font-variant-numeric:tabular-nums}.ns-number small{font-size:12px;color:var(--dsw-alias-label-secondary)}.ns-down{color:var(--dsw-alias-brand-primary)}.ns-up{color:var(--dsw-alias-label-primary)}.ns-metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.ns-metrics strong{font-size:20px;font-weight:550;margin-right:5px;font-variant-numeric:tabular-nums}.ns-metrics small{color:var(--dsw-alias-label-secondary)}
.ns-chart{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px;background:var(--dsw-alias-bg-layer-1)}.ns-chart-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}.ns-plot{position:relative;height:100px;margin-top:10px}.ns-plot svg{width:100%;height:100%;overflow:visible}.ns-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--dsw-alias-label-secondary);text-align:center}.ns-steps{display:flex;gap:8px;margin-top:18px}.ns-step{flex:1;font-size:11px;color:var(--dsw-alias-label-secondary);border-top:3px solid var(--dsw-alias-border-l1);padding-top:6px}.ns-step[data-done=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.ns-status{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:14px;font-size:12px;color:var(--dsw-alias-label-secondary)}.ns-button{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px 18px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);font:inherit;cursor:pointer;margin-top:18px;min-width:120px}.ns-button:hover{background:var(--dsw-alias-bg-layer-2)}.ns-button[data-running=true]{color:var(--dsw-alias-state-error-primary)}.ns-dialog button:focus-visible,.ns-dialog summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}.ns-details{margin-top:18px;font-size:12px;color:var(--dsw-alias-label-secondary)}.ns-details summary{cursor:pointer;width:fit-content}.ns-details p{margin-bottom:0}.ns-warning{margin:18px 0 0;font-size:11px;color:var(--dsw-alias-label-secondary)}.ns-usage{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:11px;color:var(--dsw-alias-label-secondary)}.ns-error{font-size:12px;color:var(--dsw-alias-state-error-primary);margin:10px 0 0}
@media(max-width:480px){.ns-body{padding:18px}.ns-dialog{max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);border-radius:14px}.ns-number strong{font-size:28px}.ns-card{padding:12px}}
@media(max-width:640px),(pointer:coarse){.ns-close{width:44px;height:44px}.ns-button{min-height:44px}.ns-details summary{min-height:44px;display:flex;align-items:center}.ns-body{padding-bottom:max(18px,env(safe-area-inset-bottom))}}
.ns-header>div{min-width:0}.ns-metrics>div{min-width:0;overflow-wrap:anywhere}
`;
    function Gauge() { return h('svg',{width:19,height:19,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round','aria-hidden':true},h('path',{d:'M4 18a9 9 0 1 1 16 0M12 12l4-5M5 12h1M18 12h1M12 4v1'}),h('circle',{cx:12,cy:12,r:1.5}),h('path',{d:'M8 19h8'})); }
    const number = value => value === null || !Number.isFinite(value) ? '—' : value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2);
    const volume = value => value < 1048576 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1048576).toFixed(1)} MiB`;
    function errorKey(code) {
      if (/BUSY|RATE|COOLDOWN|LIMITED/.test(code)) return 'limited';
      if (/EXPIRED|SESSION_NOT_FOUND|UNKNOWN_SESSION/.test(code)) return 'expired';
      if (/TIMEOUT/.test(code)) return 'timeout';
      if (/BUDGET|QUOTA/.test(code)) return 'budget';
      if (code === 'NETWORK_ERROR') return 'networkError';
      if (code === 'PROTOCOL_ERROR') return 'protocolError';
      if (code === 'NO_SAMPLES') return 'noSamples';
      if (/UNAUTHORIZED/.test(code)) return 'unauthorized';
      if (/NOT_FOUND|HTTP_ERROR/.test(code)) return 'unavailable';
      return 'badRequest';
    }
    return {
      inject:['slots','locale'],
      apply(ctx) {
        for (const [language,dict] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register('network-speed',language,dict));
        const t = ctx.locale.bind('network-speed');
        const listeners = new Set();
        let open = false;
        const setOpen = value => { open = value; for (const notify of listeners) notify(); };
        const subscribe = notify => { listeners.add(notify); return () => listeners.delete(notify); };
        function useLocale() { return React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot()); }
        function ShortcutAction({closeMenu,itemClassName}) {
          useLocale();
          return h('button',{type:'button',role:'menuitem',tabIndex:-1,className:itemClassName,'aria-haspopup':'dialog',onClick:()=>{closeMenu();setOpen(true);}},h(Gauge),h('span',null,t('title')));
        }
        function Panel() {
          useLocale();
          const visible = React.useSyncExternalStore(subscribe, () => open);
          return visible ? h(TestDialog,{close:()=>setOpen(false)}) : null;
        }
        function TestDialog({close}) {
          const locale = useLocale();
          const dialog = React.useRef(null);
          const runner = React.useRef(null);
          const titleId = React.useId();
          const warningId = React.useId();
          const [state,setState] = React.useState(initialSpeedState);
          React.useEffect(() => {
            runner.current = createSpeedTestRunner({baseUrl:document.baseURI,onUpdate:setState});
            return () => { runner.current.dispose(); runner.current = null; };
          }, []);
          React.useEffect(() => {
            const previous = document.activeElement;
            const node = dialog.current;
            node.showModal();
            return () => { node.close(); if (previous?.isConnected) previous.focus(); };
          }, []);
          const running = state.status === 'running';
          const phases = ['latency','download','upload','complete'];
          const stage = phases.indexOf(state.phase);
          const chartMax = Math.max(1, ...state.samples.map(sample => sample.mbps)) * 1.1;
          const chartRate = byteRateDisplay(chartMax);
          const timeMax = Math.max(1, ...state.samples.map(sample => sample.seconds));
          const path = phase => state.samples.filter(sample => sample.phase === phase).map((sample,i) => `${i?'L':'M'}${(sample.seconds/timeMax*440).toFixed(2)},${(88-sample.mbps/chartMax*78).toFixed(2)}`).join(' ');
          const card = (key,arrow,hint) => {
            const metric = state[key];
            const rate = byteRateDisplay(metric.mbps);
            return h('div',{className:'ns-card','data-active':running&&state.phase===key},h('div',{className:'ns-label'},arrow+' '+t(key)),h('div',{className:'ns-number '+(key==='download'?'ns-down':'ns-up')},h('strong',null,number(rate.value)),h('small',null,rate.unit)),h('div',{className:'ns-label'},t(hint)),h('div',{className:'ns-label'},metric.capped?t('capped'):metric.bytes&&!metric.complete&&!running?t('partial'):'\u00a0'));
          };
          return h('dialog',{ref:dialog,className:'ns-dialog','aria-labelledby':titleId,'aria-describedby':warningId,onCancel:event=>{event.preventDefault();close();},onClick:event=>{if(event.target===dialog.current){const rect=dialog.current.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}}},
            h('style',null,css),h('div',{className:'ns-body'},
              h('header',{className:'ns-header'},h('div',null,h('h2',{id:titleId,className:'ns-title'},t('title')),h('p',{className:'ns-sub'},t('subtitle')),h('div',{className:'ns-target'},window.location.host)),h('button',{type:'button',className:'ns-close',onClick:close,'aria-label':t('close'),autoFocus:true},'×')),
              h('div',{className:'ns-grid'},card('download','↓','downHint'),card('upload','↑','upHint')),
              h('div',{className:'ns-metrics'},...['latency','jitter'].map(key=>h('div',{key},h('div',{className:'ns-label'},t(key)),h('strong',null,number(state[key])),h('small',null,'ms')))),
              h('section',{className:'ns-chart','aria-label':t('chart')},h('div',{className:'ns-chart-head'},h('span',null,t('average')),h('span',null,`${number(chartRate.value)} ${chartRate.unit}`)),
                h('div',{className:'ns-plot'},h('svg',{viewBox:'0 0 440 100',preserveAspectRatio:'none','aria-hidden':true},...[10,49,88].map(y=>h('path',{key:y,d:`M0 ${y}H440`,stroke:'var(--dsw-alias-border-l1)',fill:'none'})),h('path',{d:path('download'),stroke:'var(--dsw-alias-brand-primary)',strokeWidth:2,fill:'none'}),h('path',{d:path('upload'),stroke:'var(--dsw-alias-label-secondary)',strokeWidth:2,strokeDasharray:'5 3',fill:'none'})),!state.samples.length&&h('div',{className:'ns-empty'},t('empty'))),h('div',{className:'ns-chart-head'},h('span',{className:'ns-down'},'— '+t('download')),h('span',null,'┄ '+t('upload')),h('span',null,`${timeMax.toFixed(1)} ${t('axis')}`))),
              h('div',{className:'ns-steps'},...phases.map((phase,i)=>h('div',{key:phase,className:'ns-step','data-done':state.status!=='idle'&&i<=stage},t(phase)))),
              h('div',{className:'ns-status'},h('span',{'aria-live':'polite'},running?t('running')+' · '+t(state.phase):t(state.status)),state.finishedAt&&h('span',null,new Date(state.finishedAt).toLocaleTimeString(locale.active,{hour:'2-digit',minute:'2-digit',second:'2-digit'}))),
              state.error&&h('p',{className:'ns-error',role:'alert'},t(errorKey(state.error))),
              h('div',{className:'ns-usage'},h('span',null,t('downUsage')+': '+volume(state.download.bytes)),h('span',null,t('upUsage')+': '+volume(state.upload.bytes))),
              h('button',{type:'button',className:'ns-button','data-running':running,onClick:()=>running?runner.current?.stop():void runner.current?.run()},t(running?'stop':'start')),
              h('details',{className:'ns-details'},h('summary',null,t('details')),h('p',null,t('explanation')),h('p',null,t('uploadExplanation')),h('p',null,t('upSubmitted')+': '+volume(state.upload.submitted)),h('p',null,t('target')+': '+window.location.origin),h('p',null,t('completionNote'))),
              h('p',{id:warningId,className:'ns-warning'},t('warning'))));
        }
        ctx.slots.inject('local.shortcuts.menu.action',()=>ctx.slots.register({name:'local.shortcuts.menu.action',id:'network-speed',order:20,label:()=>t('title')},ShortcutAction));
        ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'network-speed',order:20},Panel));
        ctx.effect(()=>()=>{open=false;listeners.clear();});
      }
    };
  }
});
