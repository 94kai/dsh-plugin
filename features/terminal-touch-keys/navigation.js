// Panel selection hides the rightbar's Session surface. Restore Conversation before resolving its target.
export function nextFrame(view,signal){
  return new Promise(resolve=>{
    if(signal.aborted)return resolve(false);
    let frame;
    const stop=()=>{view.cancelAnimationFrame(frame);signal.removeEventListener('abort',stop);resolve(false);};
    frame=view.requestAnimationFrame(()=>{signal.removeEventListener('abort',stop);resolve(!signal.aborted);});
    signal.addEventListener('abort',stop,{once:true});
  });
}
export async function revealNativeTerminal(ctx,view,signal){
  // A layout commit and then the Session-scoped rightbar commit may be separate React renders.
  for(let i=0;i<12;i++){
    if(!await nextFrame(view,signal))return 'cancelled';
    const target=ctx.sidebarRight.commandTarget(null);
    if(!target)continue;
    const active=ctx.sidebarRight.active();
    const existing=active?.kind==='terminal'?active:ctx.sidebarRight.tabsIn(target.sessionId).find(tab=>tab.kind==='terminal');
    if(existing){if(!ctx.sidebarRight.isExpanded())ctx.sidebarRight.toggleExpanded();ctx.sidebarRight.focus(existing.id);}
    else ctx.sidebarRight.openTabFromTarget('terminal',target);
    return 'opened';
  }
  return 'no-session';
}
