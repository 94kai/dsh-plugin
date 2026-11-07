// The measured element belongs to this feature; never inspect another plugin's DOM.
export function keyboardLift(bottom, previousLift, viewportBottom, scale = 1) {
  if (![bottom, previousLift, viewportBottom, scale].every(Number.isFinite) || scale < 0.95 || scale > 1.05) return 0;
  // Undo our existing margin before comparing to the visual viewport, preventing feedback drift.
  return Math.max(0, Math.ceil(bottom + previousLift - viewportBottom));
}

export function followKeyboard(node, view) {
  if (!node || !view) return () => {};
  const viewport = view.visualViewport;
  let applied = 0, frame = null, disposed = false;
  const measure = () => {
    frame = null;
    if (disposed) return;
    const rect = node.getBoundingClientRect();
    const bottom = viewport ? viewport.offsetTop + viewport.height : view.innerHeight;
    const next = rect.width > 0 && rect.height > 0 ? keyboardLift(rect.bottom, applied, bottom, viewport?.scale ?? 1) : 0;
    if (next === applied) return;
    applied = next;
    // Reserve real space: the original terminal's flex screen shrinks and its own ResizeObserver refits xterm.
    node.style.marginBottom = next ? `${next}px` : '';
    node.dataset.keyboardLifted = String(next > 0);
  };
  const schedule = () => {
    if (!disposed && frame === null) frame = view.requestAnimationFrame(measure);
  };
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  view.addEventListener('resize', schedule);
  view.addEventListener('orientationchange', schedule);
  const observer = view.ResizeObserver ? new view.ResizeObserver(schedule) : null;
  observer?.observe(node);
  schedule();
  return () => {
    disposed = true;
    if (frame !== null) view.cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    view.removeEventListener('resize', schedule);
    view.removeEventListener('orientationchange', schedule);
    observer?.disconnect();
    node.style.marginBottom = '';
    delete node.dataset.keyboardLifted;
  };
}
