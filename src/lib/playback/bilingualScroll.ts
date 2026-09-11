type Side = "source" | "target";
export type ScrollAnchor = { source: number; target: number };

// Duplicate centers occur when several short sentences share a rendered line.
export function normalizeScrollAnchors(anchors: ScrollAnchor[]): ScrollAnchor[] {
  const result: ScrollAnchor[] = [];
  const counts: number[] = [];
  for (const anchor of [...anchors].sort((a, b) => a.source - b.source)) {
    const previous = result.at(-1);
    if (previous && Math.abs(previous.source - anchor.source) < 1) {
      const count = counts[counts.length - 1];
      previous.target = (previous.target * count + anchor.target) / (count + 1);
      counts[counts.length - 1] += 1;
    } else {
      result.push({ ...anchor });
      counts.push(1);
    }
  }
  for (let i = 1; i < result.length; i += 1) {
    result[i].target = Math.max(result[i - 1].target, result[i].target);
  }
  return result;
}

export function mapScrollPosition(anchors: ScrollAnchor[], position: number): number {
  if (!anchors.length) return position;
  if (position <= anchors[0].source) return anchors[0].target + position - anchors[0].source;
  const last = anchors[anchors.length - 1];
  if (position >= last.source) return last.target + position - last.source;
  let low = 0;
  let high = anchors.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (anchors[middle].source <= position) low = middle;
    else high = middle;
  }
  const a = anchors[low];
  const b = anchors[high];
  return a.target + ((position - a.source) / (b.source - a.source)) * (b.target - a.target);
}

type LinkedState = {
  owner: Side | null;
  releaseTimer?: number;
  anchors: ScrollAnchor[] | null;
  sourceStart: number;
  targetStart: number;
};
const states = new WeakMap<HTMLElement, LinkedState>();

function readerRoot(source: Element): HTMLElement | null {
  return source.closest<HTMLElement>("[data-bilingual-pane]")?.parentElement ?? null;
}

function stateFor(root: HTMLElement) {
  let state = states.get(root);
  if (!state) {
    state = { owner: null, anchors: null, sourceStart: 0, targetStart: 0 };
    states.set(root, state);
  }
  return state;
}

export function invalidateLinkedScroll(source: Element) {
  const root = readerRoot(source);
  if (root) stateFor(root).anchors = null;
}

export function pauseLinkedScrollForTap(source: Element) {
  const root = readerRoot(source);
  if (!root) return;
  const state = stateFor(root);
  state.owner = null;
  state.anchors = null;
  if (state.releaseTimer) window.clearTimeout(state.releaseTimer);
}

export function scrollBilingualPaneTo(
  container: HTMLDivElement,
  top: number,
  behavior: ScrollBehavior = "auto"
) {
  const token = `${Date.now()}-${Math.random()}`;
  container.dataset.bilingualSyncing = token;
  pauseLinkedScrollForTap(container);
  container.scrollTo({ top: Math.max(0, top), behavior });
  // Ownership also suppresses delayed scroll events; this guard covers restores
  // and smooth sentence-centering that have no user-owned scrolling pane.
  window.setTimeout(() => {
    if (container.dataset.bilingualSyncing === token) delete container.dataset.bilingualSyncing;
  }, behavior === "smooth" ? 800 : 100);
}

function measureAnchors(source: HTMLDivElement, target: HTMLDivElement) {
  const targetNodes = new Map(
    Array.from(target.querySelectorAll<HTMLElement>("[data-bilingual-segment-id]"))
      .map((node) => [node.dataset.bilingualSegmentId, node])
  );
  const sourceTop = source.getBoundingClientRect().top + source.clientTop;
  const targetTop = target.getBoundingClientRect().top + target.clientTop;
  const anchors: ScrollAnchor[] = [];
  for (const node of source.querySelectorAll<HTMLElement>("[data-bilingual-segment-id]")) {
    const counterpart = targetNodes.get(node.dataset.bilingualSegmentId);
    if (!counterpart) continue;
    const a = node.getBoundingClientRect();
    const b = counterpart.getBoundingClientRect();
    anchors.push({
      source: source.scrollTop + a.top - sourceTop + a.height / 2 - source.clientHeight / 2,
      target: target.scrollTop + b.top - targetTop + b.height / 2 - target.clientHeight / 2,
    });
  }
  return normalizeScrollAnchors(anchors);
}

export function claimLinkedScroll(source: HTMLDivElement, side: Side) {
  const root = readerRoot(source);
  if (!root) return;
  const state = stateFor(root);
  const target = root.querySelector<HTMLDivElement>(`[data-bilingual-scroll="${side === "source" ? "target" : "source"}"]`);
  if (!target) return;
  if (state.releaseTimer) window.clearTimeout(state.releaseTimer);
  if (state.owner !== side || !state.anchors) {
    // Stop a preceding smooth centering action as soon as the user takes over.
    for (const pane of [source, target]) {
      if (pane.dataset.bilingualSyncing) pane.scrollTo({ top: pane.scrollTop, behavior: "instant" });
      delete pane.dataset.bilingualSyncing;
    }
    state.anchors = measureAnchors(source, target);
    state.sourceStart = source.scrollTop;
    state.targetStart = target.scrollTop;
  }
  state.owner = side;
}

export function syncOtherPaneScroll(side: Side, source: HTMLDivElement): boolean {
  if (source.dataset.bilingualSyncing) return true;
  const root = readerRoot(source);
  if (!root) return true;
  const state = stateFor(root);
  // Only wheel/touch/keyboard intent may take ownership. Programmatic scrolls
  // and the follower's delayed events must never drive the leader backwards.
  if (state.owner !== side) return true;
  const target = root.querySelector<HTMLDivElement>(`[data-bilingual-scroll="${side === "source" ? "target" : "source"}"]`);
  if (!target) return true;
  if (!state.anchors) {
    state.anchors = measureAnchors(source, target);
    state.sourceStart = source.scrollTop;
    state.targetStart = target.scrollTop;
  }
  const delta = mapScrollPosition(state.anchors, source.scrollTop) - mapScrollPosition(state.anchors, state.sourceStart);
  const top = Math.min(Math.max(0, target.scrollHeight - target.clientHeight), Math.max(0, state.targetStart + delta));
  if (Math.abs(target.scrollTop - top) >= 0.5) target.scrollTop = top;
  if (state.releaseTimer) window.clearTimeout(state.releaseTimer);
  state.releaseTimer = window.setTimeout(() => {
    if (state.owner === side) {
      state.owner = null;
      state.anchors = null;
    }
  }, 180);
  return false;
}
