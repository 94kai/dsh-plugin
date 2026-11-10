// Presentation adapted from dsh-aside-note 1.1.0 (MIT), Copyright (c) 2026 Rayle8.
// See LICENSE.aside-note. Only namespaces and server-adapter props differ.


/** Chinese copy — the single source of truth for the message keys. */
const zh = {
	"nav.label": "旁边记",
	"title": "旁边记",
	"popover.title": "旁边记",
	"popover.close": "关闭旁边记",
	"popover.count": "{open} 未完成 · {total} 条",
	"popover.completed": "已完成",
	"popover.clearCancel": "取消",
	"popover.clearConfirm": "清除 {n} 项已完成记录？",
	"popover.clearConfirmAction": "确认清除",
	"popover.clearDone": "清除已完成",
	"popover.storage": "按会话隔离 · 数据仅保存在本地",
	"popover.shared": "工作区共享 · 数据仅保存在本地",
	"scope.label": "便笺范围",
	"scope.workspace": "工作区",
	"scope.session": "会话",
	"popover.empty.title": "旁边还没有记录",
	"popover.empty.body": "让想法留在对话旁边",
	"settings.open": "设置",
	"settings.title": "设置",
	"settings.about": "关于",
	"settings.tagline": "让想法留在对话旁边",
	"settings.version": "版本",
	"settings.author": "作者",
	"settings.project": "源代码",
	"settings.shortcut": "发送快捷键",
	"settings.shortcutCtrlEnter": "{mod}+Enter 发送，Enter 换行",
	"settings.shortcutEnter": "Enter 发送，{mod}+Enter 换行",
	"settings.forward": "一键转发",
	"settings.forwardPrefixItem": "前缀提示词",
	"settings.forwardPrefixHint": "转发到会话时，若输入框为空，会先写入这段提示词，再追加记录内容；留空则只转发记录内容",
	"add.placeholder": "随手记一条",
	"add.shortcut": "{mod}+Enter 发送 · Enter 换行",
	"add.shortcutEnter": "Enter 发送 · {mod}+Enter 换行",
	"add.action": "添加",
	"list.open": "未完成",
	"list.allDone.title": "未完成的都清空了",
	"list.allDone.body": "可以继续添加，或展开下方回看已完成",
	"item.markDone": "标记为完成",
	"item.markOpen": "标记为未完成",
	"item.copy": "复制",
	"item.forward": "转发到会话",
	"item.forwarded": "已转发到会话，点击可移除标识",
	"item.edit": "编辑",
	"item.delete": "删除",
	"item.editHint": "双击编辑",
	"edit.save": "保存",
	"edit.cancel": "取消",
	"edit.hintCtrlEnter": "{mod}+Enter 保存 · Enter 换行",
	"edit.hintEnter": "Enter 保存 · {mod}+Enter 换行",
	"time.now": "刚刚",
	"time.minutes": "{n} 分钟前",
	"time.hours": "{n} 小时前",
	"time.days": "{n} 天前",
	"time.createdDone": "{created}创建，{completed}完成",
	"storage.failed": "本地存储不可用，改动不会保留",
	"forward.prefix": "完成以下任务：",
	"resize.width": "调整旁边记宽度",
	"resize.height": "调整旁边记高度",
	"resize.hint": "拖动调整，双击复位",
	"dock.open": "打开旁边记",
	"dock.count": "{n} 项未完成",
	"header.tooltip": "旁边记 · {n} 项未完成",
	"header.tooltipEmpty": "旁边记",
	"toast.copied": "已复制",
	"toast.copyFailed": "复制失败，请重试",
	"toast.forwarded": "已转发到会话",
	"toast.unforwarded": "已取消转发标识",
	"toast.forwardFailed": "没有找到输入框，转发失败",
	"toast.deleted": "已删除",
	"toast.cleared": "已清除已完成",
	"toast.saveFailed": "保存失败，内容没有改动",

};



/** Note shape, ordering and relative time copy. */
/**
* Sanitize one session's notes. The store is user-editable, so treat
* every field defensively and preserve the authored order.
*/
/** Relative age copy for a note's creation stamp. */
function ageLabel(time, say, localeId) {
	const stamp = Number.isFinite(time) ? time : Date.now();
	const elapsed = Math.max(0, Date.now() - stamp);
	if (elapsed < 6e4) return say("time.now");
	const minutes = Math.floor(elapsed / 6e4);
	if (minutes < 60) return say("time.minutes", { n: minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return say("time.hours", { n: hours });
	const days = Math.floor(hours / 24);
	if (days < 7) return say("time.days", { n: days });
	try {
		return new Intl.DateTimeFormat(localeId, {
			month: "short",
			day: "numeric"
		}).format(stamp);
	} catch {
		return "";
	}
}
/**
* Best-known completion stamp for a done note. Newer records carry
* `completedAt`; older ones only have `updatedAt`, so fall back in order
* until a finite time is found. Returns 0 when the item has no usable stamp.
*/
function completedStamp(item) {
	if (!item) return 0;
	const candidates = [
		item.completedAt,
		item.updatedAt,
		item.createdAt
	];
	for (const time of candidates) if (Number.isFinite(time)) return time;
	return 0;
}
/** Newest completion first; updatedAt then createdAt keep equal stamps stable. */
function compareDoneItems(a, b) {
	const byCompletion = completedStamp(b) - completedStamp(a);
	if (byCompletion) return byCompletion;
	const aUpdated = Number.isFinite(a && a.updatedAt) ? a.updatedAt : 0;
	const bUpdated = Number.isFinite(b && b.updatedAt) ? b.updatedAt : 0;
	if (aUpdated !== bUpdated) return bUpdated - aUpdated;
	const aCreated = Number.isFinite(a && a.createdAt) ? a.createdAt : 0;
	return (Number.isFinite(b && b.createdAt) ? b.createdAt : 0) - aCreated;
}
/** Done notes show creation and completion age; open ones show creation age only. */
function metaLabel(item, say, localeId) {
	const created = ageLabel(item && item.createdAt, say, localeId);
	if (!item || item.done !== true) return created;
	return say("time.createdDone", {
		created,
		completed: ageLabel(completedStamp(item) || (item ? item.createdAt : 0), say, localeId)
	});
}



/**
* Shared glyphs and the tooltip wrapper.
*
* Glyphs come from the product icon set; this plugin draws none of its own, so
* stroke weight, optical size and currentColor stay consistent with the shell.
* Tooltip and Toast are the seeded primitives — the bundle keeps them external.
*/
const h$12 = react.default.createElement;
const PRIMITIVES = _deepseek_ai_dsh_client_ui_primitives;
const Tooltip = typeof PRIMITIVES.Tooltip === "function" ? PRIMITIVES.Tooltip : null;
const Toast = typeof PRIMITIVES.Toast === "function" ? PRIMITIVES.Toast : null;
const icon = (name) => typeof PRIMITIVES[name] === "function" ? PRIMITIVES[name] : null;
/**
* Glyphs come from the shared product icon set; this plugin draws none of
* its own, so stroke weight, optical size and currentColor stay consistent
* with the surrounding shell.
*/
function Glyph(props) {
	const Component = icon(props.name);
	if (!Component) return null;
	return h$12(Component, { size: props.size });
}
const IconCheck = (props) => h$12(Glyph, {
	name: "IconCheckOutlineMedium",
	size: props && props.size ? props.size : 12
});
const IconCopy = () => h$12(Glyph, {
	name: "IconCopyOutlineRegular",
	size: 14
});
const IconForward = () => h$12(Glyph, {
	name: "IconShareOutlineRegular",
	size: 14
});
const IconGear = () => h$12(Glyph, {
	name: "IconSettingsOutlineRegular",
	size: 14
});
const IconPencil = () => h$12(Glyph, {
	name: "IconEditOutlineRegular",
	size: 14
});
const IconTrash = () => h$12(Glyph, {
	name: "IconTrashOutlineRegular",
	size: 14
});
const IconChevron = () => h$12(Glyph, {
	name: "IconChevronRightOutlineRegular",
	size: 12
});
const IconEmpty = () => h$12(Glyph, {
	name: "IconChecklistOutlineRegular",
	size: 18
});
const IconClose = () => h$12(Glyph, {
	name: "IconCloseOutlineRegular",
	size: 14
});
/** Wrap one icon-only control in the shared tooltip; a bare button when absent. */
function withTooltip(label, node) {
	if (!Tooltip) return node;
	return h$12(Tooltip, {
		label,
		side: "top",
		portal: true,
		gap: 6
	}, node);
}

// src/client/ui/toastSeat.ts
/** Frame-wide toast seat: one notice at a time, dismissed when it fades. */
const h$11 = react.default.createElement;
const TOAST_COPY = {
	copied: {
		key: "toast.copied",
		tone: "success"
	},
	forwarded: {
		key: "toast.forwarded",
		tone: "success"
	},
	unforwarded: {
		key: "toast.unforwarded",
		tone: "success"
	},
	deleted: {
		key: "toast.deleted",
		tone: "success"
	},
	cleared: {
		key: "toast.cleared",
		tone: "success"
	},
	copyFailed: { key: "toast.copyFailed" },
	forwardFailed: { key: "toast.forwardFailed" },
	saveFailed: { key: "toast.saveFailed" }
};
const WarningIcon = icon("IconWarningOutlineRegular");
/**
* Settled outcomes (copy, forward, delete, write failure) live in the frame,
* not inside the panel: the panel unmounts on close, the banner must not.
*/
function createToastSeat(tr) {
	const source = (() => {
		let notice = null;
		let sequence = 0;
		const listeners = /* @__PURE__ */ new Set();
		const publish = (next) => {
			notice = next;
			for (const listener of listeners) listener();
		};
		return {
			hooks: { notice: {
				getSnapshot: () => notice,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				}
			} },
			show(kind) {
				sequence += 1;
				publish({
					kind,
					sequence
				});
			},
			dismiss() {
				publish(null);
			}
		};
	})();
	/** The slot the layout mounts once; it owns the only visible notice. */
	function ToastHost(props) {
		const notice = react.default.useSyncExternalStore(source.hooks.notice.subscribe, source.hooks.notice.getSnapshot);
		if (!notice || !Toast) return null;
		const copy = TOAST_COPY[notice.kind] || TOAST_COPY.saveFailed;
		const bound = props && typeof props.t === "function" ? props.t(copy.key) : "";
		const text = bound && bound !== copy.key ? bound : tr(copy.key);
		return h$11(Toast, {
			key: notice.sequence,
			text,
			tone: copy.tone,
			icon: copy.tone ? void 0 : WarningIcon ? h$11(WarningIcon, { size: 16 }) : void 0,
			onDone: source.dismiss
		});
	}
	return {
		show: source.show,
		ToastHost
	};
}


const HEADER_ICON = "<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3.25 2.75h6.5l3 3v7.5c0 .55-.45 1-1 1H3.25c-.55 0-1-.45-1-1V3.75c0-.55.45-1 1-1Z\"/><path d=\"M9.75 2.75v3h3\"/><path d=\"M4.9 7.6h5.4M4.9 9.9h3.6\" stroke-linecap=\"round\"/></svg>";


/**
* Mark the section head that is actually pinned to the scroller's top edge.
* Sticky heads stay transparent in flow; only the pinned one takes the menu
* group-header fill, so no full-width layer sits over the list at rest.
*/
function syncStickyHeads(node) {
	const areaTop = node.getBoundingClientRect().top;
	for (const head of node.querySelectorAll(".pk-an-sectionHead, .pk-an-doneHead")) {
		const section = head.parentElement;
		if (!section) continue;
		const rect = section.getBoundingClientRect();
		head.toggleAttribute("data-stuck", rect.top < areaTop && rect.bottom > areaTop);
	}
}
/**
* Frame-owned top safety margin for floating surfaces. Read from the layout
* rather than baked in, so macOS window chrome and the Windows titlebar both
* keep their clearance without this page touching the global variable.
*/
function overlayTopFloor(margin) {
	try {
		const raw = getComputedStyle(document.body).getPropertyValue("--dsh-frame-overlay-top").trim();
		const value = Number.parseFloat(raw);
		if (Number.isFinite(value) && value > 0) return Math.max(margin, value);
	} catch {}
	return margin;
}
/**
* Fixed panel placement: a right-side panel for the experimental entry,
* otherwise below the anchor. Both stay inside the viewport margin, and the
* gap side is only abandoned when the opposite side genuinely fits.
*/
function memoPopoverStyle(anchor, placement, requestedWidth, requestedHeight) {
	const margin = window.innerWidth <= 480 ? 12 : 16;
	const topFloor = overlayTopFloor(margin);
	const available = Math.max(280, window.innerWidth - margin * 2);
	const width = Math.max(280, Math.min(720, available, requestedWidth || 360));
	if (placement === "right") {
		const rect = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : null;
		let desiredRight = rect && rect.width > 0 ? rect.right : window.innerWidth - margin;
		const sidebar = [...document.querySelectorAll("[data-sidebar-right-panel][data-sidebar-right-open]")].find((node) => {
			const box = node.getBoundingClientRect();
			return box.width > 24 && box.left > 0 && box.left < window.innerWidth - 24;
		});
		if (sidebar) desiredRight = Math.min(desiredRight, sidebar.getBoundingClientRect().left - 8);
		const rightInset = Math.max(margin, Math.min(window.innerWidth - margin, window.innerWidth - desiredRight));
		const top = rect && rect.width > 0 ? Math.max(topFloor, Math.round(rect.bottom + 8)) : topFloor;
		const maxHeight = Math.max(160, window.innerHeight - top - margin);
		const height = requestedHeight ? Math.max(Math.min(240, maxHeight), Math.min(maxHeight, requestedHeight)) : 0;
		const style = {
			right: `${rightInset}px`,
			left: "auto",
			top: `${top}px`,
			width: `${width}px`,
			maxHeight: `${maxHeight}px`
		};
		if (height) style.height = `${height}px`;
		return style;
	}
	const maxHeight = Math.max(160, Math.min(460, window.innerHeight - topFloor - margin));
	if (!anchor) return {
		left: `${margin}px`,
		top: `${topFloor}px`,
		width: `${width}px`,
		maxHeight: `${maxHeight}px`
	};
	const rect = anchor.getBoundingClientRect();
	const left = rect.left < 420 ? Math.max(margin, rect.left) : Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
	let top = rect.bottom + 8;
	if (top + maxHeight > window.innerHeight - margin) top = Math.max(topFloor, rect.top - maxHeight - 8);
	return {
		left: `${left}px`,
		top: `${top}px`,
		width: `${width}px`,
		maxHeight: `${maxHeight}px`
	};
}

// src/client/ui/usePanelGeometry.ts
/** Panel geometry: remembered width/height, pointer and keyboard resize, placement. */
function usePanelGeometry(anchorRef, placement, panelRef, preferences, persist) {
	const [panelWidth, setPanelWidth] = react.default.useState(preferences.panelWidth || 360);
	const [panelHeight, setPanelHeight] = react.default.useState(preferences.panelHeight || 0);
	const [style, setStyle] = react.default.useState(() => memoPopoverStyle(anchorRef.current, placement, panelWidth, panelHeight));
	const panelWidthRef = react.default.useRef(panelWidth);
	const panelHeightRef = react.default.useRef(panelHeight);
	const lastStyleRef = react.default.useRef("");
	const dragCleanupRef = react.default.useRef(null);
	react.default.useEffect(() => () => dragCleanupRef.current?.(), []);
	react.default.useEffect(() => {
		if (dragCleanupRef.current) return;
		setPanelWidth(preferences.panelWidth || 360);
		setPanelHeight(preferences.panelHeight || 0);
	}, [preferences.panelWidth, preferences.panelHeight]);
	const updatePosition = react.default.useCallback(() => {
		if (anchorRef.current || placement === "right") {
			const next = memoPopoverStyle(anchorRef.current, placement, panelWidth, panelHeight);
			const key = JSON.stringify(next);
			if (key === lastStyleRef.current) return;
			lastStyleRef.current = key;
			setStyle(next);
		}
	}, [
		anchorRef,
		placement,
		panelWidth,
		panelHeight
	]);
	react.default.useEffect(() => {
		panelWidthRef.current = panelWidth;
	}, [panelWidth]);
	react.default.useEffect(() => {
		panelHeightRef.current = panelHeight;
	}, [panelHeight]);
	const clampPanelWidth = (value) => {
		const max = Math.min(720, Math.max(280, window.innerWidth - 32));
		return Math.max(280, Math.min(max, value));
	};
	const commitPanelWidth = (value) => {
		const next = clampPanelWidth(value);
		panelWidthRef.current = next;
		setPanelWidth(next);
		persist({ panelWidth: Math.round(next) });
	};
	const startPanelResize = (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		dragCleanupRef.current?.();
		const previousSelect = document.body.style.userSelect, previousCursor = document.body.style.cursor;
		const startX = event.clientX;
		const startWidth = panelWidthRef.current;
		const onMove = (moveEvent) => {
			const next = clampPanelWidth(startWidth + (startX - moveEvent.clientX));
			panelWidthRef.current = next;
			setPanelWidth(next);
		};
		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
			dragCleanupRef.current = null;
			document.body.style.userSelect = previousSelect;
			document.body.style.cursor = previousCursor;
			persist({ panelWidth: Math.round(panelWidthRef.current) });
		};
		dragCleanupRef.current = onUp;
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp, { once: true });
		window.addEventListener("pointercancel", onUp, { once: true });
		document.body.style.userSelect = "none";
		document.body.style.cursor = "ew-resize";
	};
	const onPanelResizeKeyDown = (event) => {
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			commitPanelWidth(panelWidthRef.current + 16);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			commitPanelWidth(panelWidthRef.current - 16);
		} else if (event.key === "Home") {
			event.preventDefault();
			commitPanelWidth(360);
		}
	};
	const clampPanelHeight = (value) => {
		const max = Math.max(240, window.innerHeight - 64 - 16);
		return Math.max(240, Math.min(max, value));
	};
	const commitPanelHeight = (value) => {
		const next = value > 0 ? clampPanelHeight(value) : 0;
		panelHeightRef.current = next;
		setPanelHeight(next);
		persist({ panelHeight: Math.round(next) });
	};
	const startPanelHeightResize = (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		dragCleanupRef.current?.();
		const previousSelect = document.body.style.userSelect, previousCursor = document.body.style.cursor;
		const startY = event.clientY;
		const startHeight = panelHeightRef.current || (panelRef.current ? panelRef.current.getBoundingClientRect().height : 360);
		const onMove = (moveEvent) => {
			const next = clampPanelHeight(startHeight + (moveEvent.clientY - startY));
			panelHeightRef.current = next;
			setPanelHeight(next);
		};
		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
			dragCleanupRef.current = null;
			document.body.style.userSelect = previousSelect;
			document.body.style.cursor = previousCursor;
			persist({ panelHeight: Math.round(panelHeightRef.current) });
		};
		dragCleanupRef.current = onUp;
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp, { once: true });
		window.addEventListener("pointercancel", onUp, { once: true });
		document.body.style.userSelect = "none";
		document.body.style.cursor = "ns-resize";
	};
	const onPanelHeightKeyDown = (event) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			commitPanelHeight((panelHeightRef.current || 360) + 16);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			commitPanelHeight((panelHeightRef.current || 360) - 16);
		} else if (event.key === "Home") {
			event.preventDefault();
			commitPanelHeight(0);
		}
	};
	react.default.useLayoutEffect(() => {
		updatePosition();
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);
		return () => {
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
		};
	}, [updatePosition]);
	react.default.useEffect(() => {
		const anchor = anchorRef.current;
		if (!anchor || typeof ResizeObserver !== "function") return void 0;
		const target = anchor;
		const observer = new ResizeObserver(updatePosition);
		observer.observe(target);
		return () => observer.disconnect();
	}, [anchorRef, updatePosition]);
	react.default.useEffect(() => {
		const timer = window.setInterval(updatePosition, 400);
		return () => window.clearInterval(timer);
	}, [updatePosition]);
	return {
		style,
		commitPanelWidth,
		commitPanelHeight,
		startPanelResize,
		startPanelHeightResize,
		onPanelResizeKeyDown,
		onPanelHeightKeyDown
	};
}



/** The inline second confirmation for clearing completed notes. */
function useClearConfirm({ sessionId, showDone, doneCount, onConfirm }) {
	const [confirmClear, setConfirmClear] = react.default.useState(false);
	const clearConfirmTimerRef = react.default.useRef(0);
	/** Drop the pending auto-dismiss clock without touching state. */
	const stopClearConfirmTimer = () => {
		if (!clearConfirmTimerRef.current) return;
		window.clearTimeout(clearConfirmTimerRef.current);
		clearConfirmTimerRef.current = 0;
	};
	/** Close the inline band and drop its pending timer. */
	const dismissClearConfirm = () => {
		stopClearConfirmTimer();
		setConfirmClear(false);
	};
	/** Open the inline band; it retires itself after a short pause. */
	const askClearConfirm = () => {
		stopClearConfirmTimer();
		setConfirmClear(true);
		clearConfirmTimerRef.current = window.setTimeout(() => {
			clearConfirmTimerRef.current = 0;
			setConfirmClear(false);
		}, CLEAR_CONFIRM_MS);
	};
	/** Only the destructive confirm action reaches the clear routine. */
	const confirmClearDone = () => {
		dismissClearConfirm();
		onConfirm();
	};
	react.default.useEffect(() => () => stopClearConfirmTimer(), []);
	react.default.useEffect(() => {
		if (confirmClear && (!showDone || doneCount === 0)) dismissClearConfirm();
	}, [
		confirmClear,
		showDone,
		doneCount
	]);
	react.default.useEffect(() => {
		dismissClearConfirm();
	}, [sessionId]);
	return {
		confirmClear,
		askClearConfirm,
		dismissClearConfirm,
		confirmClearDone
	};
}

// src/client/ui/useListEdge.ts
/** Tracks whether the note list can still scroll down, and updates sticky heads. */
function useListEdge({ items, showOpen, showDone }) {
	const listRef = react.default.useRef(null);
	const [listHasMore, setListHasMore] = react.default.useState(false);
	/** The bottom fade exists only while the list can still scroll down. */
	const syncListEdge = react.default.useCallback(() => {
		const node = listRef.current;
		if (!node) return;
		syncStickyHeads(node);
		const more = node.scrollTop + node.clientHeight < node.scrollHeight - 1;
		setListHasMore((current) => current === more ? current : more);
	}, []);
	react.default.useEffect(() => {
		const node = listRef.current;
		if (!node) return void 0;
		syncListEdge();
		if (typeof ResizeObserver !== "function") return void 0;
		const observer = new ResizeObserver(syncListEdge);
		observer.observe(node);
		for (const section of node.children) observer.observe(section);
		return () => observer.disconnect();
	}, [
		items,
		showOpen,
		showDone,
		syncListEdge
	]);
	return {
		listRef,
		listHasMore,
		syncListEdge
	};
}

// src/client/ui/useOutsideDismiss.ts
/** Close the panel on an outside pointerdown or Escape. */
function useOutsideDismiss(panelRef, anchorRef, onClose) {
	react.default.useEffect(() => {
		const onPointerDown = (event) => {
			if (panelRef.current && panelRef.current.contains(event.target)) return;
			if (anchorRef.current && anchorRef.current.contains(event.target)) return;
			onClose();
		};
		const onKeyDown = (event) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [onClose, anchorRef]);
}



/** One note: checkbox, actions, inline edit and the forwarded mark. */
const h$10 = react.default.createElement;
function TodoRow(props) {
	const { item, done, say, onToast, onToggle, onStartEdit, onDelete, editing, editDraft, setEditDraft, onEditDraftChange, onFinishEdit, onCancelEdit, editRef, forwardPrefix, sendShortcut = SEND_SHORTCUT_DEFAULT, forwarded = false, onForwarded, onUnforwarded } = props;
	const editHintKey = sendShortcut === "enter" ? "edit.hintEnter" : "edit.hintCtrlEnter";
	const [pending, setPending] = react.default.useState("");
	const mountedRef = react.default.useRef(true);
	react.default.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);
	const copy = async () => {
		if (pending) return;
		setPending("copy");
		let ok = false;
		try {
			ok = await copyText(item.text);
		} finally {
			if (mountedRef.current) setPending("");
		}
		if (!mountedRef.current) return;
		if (onToast) onToast(ok ? "copied" : "copyFailed");
	};
	const forward = () => {
		if (forwarded) {
			if (onUnforwarded) onUnforwarded(item);
			if (onToast) onToast("unforwarded");
			return;
		}
		if (!props.onForwardRequest?.(item.text, forwardPrefix)) {
			if (onToast) onToast("forwardFailed");
			return;
		}
		if (onForwarded) onForwarded(item);
		if (onToast) onToast("forwarded");
	};
	const toggleCheck = () => onToggle(item);
	const resizeEditor = (node) => {
		if (!node) return;
		node.style.height = "auto";
		node.style.height = `${node.scrollHeight + 2}px`;
	};
	const setEditorRef = react.default.useCallback((node) => {
		editRef.current = node;
		if (node) {
			node.style.height = "auto";
			node.style.height = `${node.scrollHeight + 2}px`;
		}
	}, [editRef]);
	/** Insert a line break at the caret of the controlled edit textarea and keep focus there. */
	const insertEditNewline = (node) => {
		if (!node) return;
		const start = node.selectionStart === null ? node.value.length : node.selectionStart;
		const end = node.selectionEnd === null ? start : node.selectionEnd;
		const next = `${node.value.slice(0, start)}\n${node.value.slice(end)}`;
		const caret = start + 1;
		setEditDraft(next);
		if (onEditDraftChange) onEditDraftChange(next);
		window.requestAnimationFrame(() => {
			node.focus();
			try {
				node.setSelectionRange(caret, caret);
			} catch {}
			resizeEditor(node);
		});
	};
	const body = editing ? h$10("div", { className: "pk-an-edit" }, h$10("textarea", {
		ref: setEditorRef,
		className: "pk-an-editInput",
		value: editDraft,
		rows: 1,
		maxLength: 10000,
		"aria-label": say("item.edit"),
		onChange: (event) => {
			const value = event.target.value;
			setEditDraft(value);
			if (onEditDraftChange) onEditDraftChange(value);
			resizeEditor(event.target);
		},
		onKeyDown: (event) => {
			if (event.isComposing || event.nativeEvent && event.nativeEvent.isComposing) return;
			if (event.key === "Escape") {
				event.preventDefault();
				onCancelEdit();
				return;
			}
			if (event.key !== "Enter") return;
			const chord = event.ctrlKey || event.metaKey;
			const platformModifier = isSendModifier(event);
			if (sendShortcut === "enter") {
				if (!chord && !event.shiftKey) {
					event.preventDefault();
					onFinishEdit(item);
				} else {
					event.preventDefault();
					insertEditNewline(event.currentTarget);
				}
				return;
			}
			if (platformModifier) {
				event.preventDefault();
				if (event.shiftKey) insertEditNewline(event.currentTarget);
				else onFinishEdit(item);
			} else if (event.shiftKey) {
				event.preventDefault();
				insertEditNewline(event.currentTarget);
			}
		},
		onBlur: () => onFinishEdit(item)
	}), h$10("div", { className: "pk-an-editActions" }, h$10("button", {
		type: "button",
		className: "pk-an-mini pk-an-miniPrimary",
		disabled: props.disabled,
		onMouseDown: (event) => event.preventDefault(),
		onClick: () => onFinishEdit(item)
	}, say("edit.save")), h$10("button", {
		type: "button",
		className: "pk-an-mini",
		onMouseDown: (event) => event.preventDefault(),
		onClick: onCancelEdit
	}, say("edit.cancel")), h$10("span", {
		className: "pk-an-editHint",
		title: say(editHintKey, { mod: MOD_LABEL })
	}, say(editHintKey, { mod: MOD_LABEL })))) : h$10("div", {
		className: "pk-an-text",
		title: say("item.editHint"),
		onDoubleClick: () => onStartEdit(item)
	}, item.text);
	const checked = done === true;
	return h$10("li", { className: done ? "pk-an-row pk-an-rowDone" : "pk-an-row" }, h$10("button", {
		type: "button",
		className: "pk-an-check",
		disabled: props.disabled,
		role: "checkbox",
		"aria-checked": checked ? "true" : "false",
		"aria-label": say(done ? "item.markOpen" : "item.markDone"),
		onClick: toggleCheck
	}, h$10("span", { className: "pk-an-checkCircle" }, checked ? h$10(IconCheck, { size: 9 }) : null)), h$10("div", { className: "pk-an-itemBody" }, body, editing ? null : h$10("div", { className: "pk-an-rowFoot" }, h$10("span", {
		className: "pk-an-meta",
		title: metaLabel(item, say, props.localeId)
	}, metaLabel(item, say, props.localeId)), h$10("div", { className: "pk-an-actions" }, withTooltip(say("item.copy"), h$10("button", {
		type: "button",
		className: "pk-an-iconBtn",
		"aria-label": say("item.copy"),
		"aria-busy": pending === "copy" ? "true" : "false",
		"data-loading": pending === "copy" ? "true" : void 0,
		onClick: copy
	}, h$10(IconCopy, null))), done ? null : withTooltip(say(forwarded ? "item.forwarded" : "item.forward"), h$10("button", {
		type: "button",
		className: "pk-an-iconBtn",
		"aria-label": say(forwarded ? "item.forwarded" : "item.forward"),
		"data-forwarded": forwarded ? "true" : void 0,
		disabled: props.disabled,
		onClick: forward
	}, h$10(IconForward, null), forwarded ? h$10("span", {
		className: "pk-an-forwardMark",
		"aria-hidden": true
	}, h$10(IconCheck, { size: 8 })) : null)), withTooltip(say("item.edit"), h$10("button", {
		type: "button",
		className: "pk-an-iconBtn",
		"aria-label": say("item.edit"),
		onClick: () => onStartEdit(item)
	}, h$10(IconPencil, null))), withTooltip(say("item.delete"), h$10("button", {
		type: "button",
		className: "pk-an-iconBtn pk-an-iconBtnDanger",
		disabled: props.disabled,
		"aria-label": say("item.delete"),
		onClick: () => onDelete(item)
	}, h$10(IconTrash, null)))))));
}

// src/client/ui/ScopeSwitch.tsx
/** Segmented switch between global, workspace and session lists. */
const h$9 = react.default.createElement;
function ScopeSwitch(props) {
	const { say, mode, onChange } = props;
	const options = [
		{ value: "global", label: say("scope.global") },
		...(props.canUseWorkspace ? [{ value: "workspace", label: say("scope.workspace") }] : []),
		...(props.canUseSession !== false ? [{ value: "session", label: say("scope.session") }] : [])
	].filter(option => (props.visibleScopes || DEFAULT_VISIBLE_SCOPES)[option.value]);
	if (options.length < 2) return null;
	return h$9("div", {
		className: "pk-an-scope",
		role: "group",
		"aria-label": say("scope.label")
	}, options.map((option) => h$9("button", {
		key: option.value,
		type: "button",
		className: "pk-an-scopeBtn",
		"data-scope-mode": option.value,
		"data-active": mode === option.value ? "true" : void 0,
		"aria-pressed": mode === option.value,
		onClick: () => onChange(option.value)
	}, option.label)));
}

// src/client/ui/PanelHead.ts
/** Panel title, counts, scope switch and settings; outside click/Escape dismiss. */
const h$8 = react.default.createElement;
function PanelHead(props) {
	const { say, openCount, total, showSettings, onToggleSettings, onClose, newerVersion, scopeMode, canUseWorkspace, onScopeChange } = props;
	return h$8("div", { className: "pk-an-popHead" }, h$8("div", { className: "pk-an-popTitleLine" }, h$8("div", { className: "pk-an-popTitle" }, say("popover.title")), h$8("p", { className: "pk-an-popMeta" }, say("popover.count", {
		open: openCount,
		total
	})), h$8(ScopeSwitch, {
		say,
		mode: scopeMode,
		canUseWorkspace,
		canUseSession: props.canUseSession,
		visibleScopes: props.visibleScopes,
		onChange: onScopeChange
	})), h$8("div", { className: "pk-an-popActions" }, withTooltip(say("settings.open"), h$8("button", {
		type: "button",
		className: "pk-an-settingsBtn",
		"data-active": showSettings ? "true" : void 0,
		"aria-label": newerVersion ? `${say("settings.open")} · ${say("update.tip", { version: `v${newerVersion}` })}` : say("settings.open"),
		"aria-expanded": showSettings,
		onClick: onToggleSettings
	}, h$8(IconGear, null), newerVersion ? h$8("span", {
		className: "pk-an-updateDot",
		"aria-hidden": true
	}) : null))));
}



/** Settings card: send shortcut, forward prefix and data maintenance. */
const h$6 = react.default.createElement;
function ScopeVisibilitySettings(props) {
	const visibility = props.visibleScopes || DEFAULT_VISIBLE_SCOPES;
	const count = Object.values(visibility).filter(Boolean).length;
	return h$6("div", { className: "pk-an-settingGroup" },
		h$6("div", { className: "pk-an-settingLabel" }, "显示范围"),
		h$6("div", { className: "pk-an-settingBody" },
			h$6("div", { className: "pk-an-settingChoices pk-an-scopeChoices" }, ["session", "workspace", "global"].map(kind =>
				h$6("label", { key: kind, className: "pk-an-settingChoice" },
					h$6("input", { type: "checkbox", checked: visibility[kind], disabled: count === 1 && visibility[kind], onChange: event => props.onVisibilityChange?.(kind, event.target.checked) }),
					h$6("span", null, props.say("scope." + kind))))),
			h$6("p", { className: "pk-an-settingHint" }, "至少保留一个范围；只有一个可用范围时隐藏 Tab。隐藏不会删除便笺。")));
}
function SettingsPanel(props) {
	const { say, sendShortcut, chooseShortcut, forwardPrefix, changeForwardPrefix, prefixRef } = props;
	return h$6("div", { className: "pk-an-settings" }, h$6("div", { className: "pk-an-settingsHead" }, say("settings.title")), h$6(ScopeVisibilitySettings, { say, visibleScopes: props.visibleScopes, onVisibilityChange: props.onVisibilityChange }), h$6("div", { className: "pk-an-settingGroup" }, h$6("div", { className: "pk-an-settingLabel" }, say("settings.shortcut")), h$6("div", { className: "pk-an-settingBody" }, h$6("div", { className: "pk-an-settingChoices" }, h$6("label", { className: "pk-an-settingChoice" }, h$6("input", {
		type: "radio",
		name: "pk-an-send-shortcut",
		checked: sendShortcut === "enter",
		onChange: () => chooseShortcut("enter")
	}), h$6("span", null, say("settings.shortcutEnter", { mod: MOD_LABEL }))), h$6("label", { className: "pk-an-settingChoice" }, h$6("input", {
		type: "radio",
		name: "pk-an-send-shortcut",
		checked: sendShortcut === "ctrl-enter",
		onChange: () => chooseShortcut("ctrl-enter")
	}), h$6("span", null, say("settings.shortcutCtrlEnter", { mod: MOD_LABEL })))))), h$6("div", { className: "pk-an-settingGroup" }, h$6("div", { className: "pk-an-settingLabel" }, say("settings.forward")), h$6("div", { className: "pk-an-settingBody" }, h$6("div", { className: "pk-an-settingItem" }, h$6("textarea", {
		id: "pk-an-forward-prefix",
		ref: prefixRef,
		className: "pk-an-settingInput pk-an-settingTextarea",
		value: forwardPrefix,
		rows: 1,
		maxLength: 2000,
		placeholder: say("forward.prefix"),
		"aria-label": say("settings.forwardPrefixItem"),
		"aria-describedby": "pk-an-forward-prefix-hint",
		style: {
			fontFamily: "inherit",
			fontSize: "var(--pkan-fs-row)",
			lineHeight: "var(--pkan-lh-row)",
			fontWeight: 500
		},
		onChange: (event) => changeForwardPrefix(event.target.value)
	}), h$6("p", {
		id: "pk-an-forward-prefix-hint",
		className: "pk-an-settingHint"
	}, say("settings.forwardPrefixHint"))))), h$6("div", { className: "pk-an-settingGroup" }, h$6("button", {
		type: "button",
		className: "pk-an-updateCheck",
		onClick: props.onDataTools
	}, "数据与迁移")));
}

// src/client/ui/ComposerForm.ts
/** The add form: one growing textarea, the shortcut hint and the submit button. */
const h$5 = react.default.createElement;
function ComposerForm(props) {
	const { say, draft, inputRef, sendShortcut, onDraftChange, onCompositionStart, onCompositionEnd, onKeyDown, onSubmit } = props;
	return h$5("form", {
		className: "pk-an-add",
		onSubmit
	}, h$5("textarea", {
		ref: inputRef,
		className: "pk-an-input",
		value: draft,
		rows: 1,
		maxLength: 10000,
		placeholder: say("add.placeholder"),
		"aria-label": say("add.placeholder"),
		onChange: onDraftChange,
		onCompositionStart,
		onCompositionEnd,
		onKeyDown
	}), h$5("div", { className: "pk-an-addFoot" }, h$5("span", { className: "pk-an-addShortcut" }, say(sendShortcut === "enter" ? "add.shortcutEnter" : "add.shortcut", { mod: MOD_LABEL })), h$5("button", {
		type: "submit",
		className: "pk-an-addBtn",
		disabled: props.disabled || !draft.trim()
	}, say("add.action"))));
}

// src/client/ui/ClearConfirm.ts
/** Inline second confirmation for clearing the completed notes. */
const h$4 = react.default.createElement;
function ClearConfirm(props) {
	const { say, count, onCancel, onConfirm } = props;
	return h$4("div", {
		className: "pk-an-clearConfirm",
		role: "group",
		"aria-live": "polite",
		"aria-label": say("popover.clearConfirm", { n: count })
	}, h$4("p", { className: "pk-an-clearConfirmText" }, say("popover.clearConfirm", { n: count })), h$4("div", { className: "pk-an-clearConfirmActions" }, h$4("button", {
		type: "button",
		className: "pk-an-mini",
		onClick: onCancel
	}, say("popover.clearCancel")), h$4("button", {
		type: "button",
		className: "pk-an-mini pk-an-miniDanger",
		disabled: props.disabled,
		onClick: onConfirm
	}, say("popover.clearConfirmAction"))));
}

// src/client/ui/EmptyState.ts
const h$3 = react.default.createElement;
function EmptyState(props) {
	return h$3("div", { className: "pk-an-empty" }, h$3("div", { className: "pk-an-emptyIcon" }, h$3(IconEmpty, null)), h$3("div", { className: "pk-an-emptyTitle" }, props.title), h$3("div", { className: "pk-an-emptyBody" }, props.body));
}

// src/client/ui/NoteList.ts
/** Open/completed sections, their sticky heads, rows and the clear confirmation. */
const h$2 = react.default.createElement;
function NoteList(props) {
	const { say, listRef, listHasMore, syncListEdge, showOpen, toggleOpen, openItems, openCount, total, row, showDone, toggleDone, doneItems, confirmClear, askClearConfirm, dismissClearConfirm, confirmClearDone } = props;
	return h$2("div", {
		className: "pk-an-listViewport",
		"data-bottom": listHasMore ? "true" : void 0
	}, h$2("div", {
		className: "pk-an-listArea",
		ref: listRef,
		onScroll: syncListEdge
	}, h$2("div", { className: "pk-an-listSection" }, h$2("div", { className: "pk-an-sectionHead" }, h$2("button", {
		type: "button",
		className: "pk-an-doneToggle",
		"aria-expanded": showOpen ? "true" : "false",
		onClick: toggleOpen
	}, h$2("span", {
		className: "pk-an-chevron",
		"data-open": showOpen ? "true" : "false"
	}, h$2(IconChevron, null)), say("list.open"), openCount ? h$2("span", { className: "pk-an-sectionCount" }, String(openCount)) : null)), showOpen ? openItems.length ? h$2("ul", { className: "pk-an-rows" }, openItems.map(row)) : h$2(EmptyState, {
		title: say(total ? "list.allDone.title" : "popover.empty.title"),
		body: say(total ? "list.allDone.body" : "popover.empty.body")
	}) : null), doneItems.length ? h$2("div", { className: "pk-an-listSection" }, h$2("div", { className: "pk-an-doneHead" }, h$2("button", {
		type: "button",
		className: "pk-an-doneToggle",
		"aria-expanded": showDone ? "true" : "false",
		onClick: toggleDone
	}, h$2("span", {
		className: "pk-an-chevron",
		"data-open": showDone ? "true" : "false"
	}, h$2(IconChevron, null)), say("popover.completed"), h$2("span", { className: "pk-an-sectionCount" }, String(doneItems.length))), showDone ? h$2("button", {
		type: "button",
		className: "pk-an-clear",
		disabled: props.disabled,
		"aria-expanded": confirmClear ? "true" : "false",
		onClick: askClearConfirm
	}, say("popover.clearDone")) : null), showDone && confirmClear ? h$2(ClearConfirm, {
		say,
		count: doneItems.length,
		disabled: props.disabled,
		onCancel: dismissClearConfirm,
		onConfirm: confirmClearDone
	}) : null, showDone ? h$2("ul", { className: "pk-an-rows pk-an-doneRows" }, doneItems.map(row)) : null) : null));
}
