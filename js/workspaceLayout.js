/** Docked, persistent workspace panels. Analysis state stays owned by the app. */
export const LAYOUT_KEY = 'cash5studio_panel_layout_v1';
export const PANEL_DEFAULTS = [
  { id: 'history', selector: '.history-surface', title: 'Draw History', span: 7 },
  { id: 'board', selector: '.next-board-surface', title: 'Next Draw Board', span: 5 },
  { id: 'pick', selector: '#composerCard', title: 'Your pick', span: 12 },
  { id: 'sequences', selector: '.analysis-panels > details:nth-child(1)', title: 'Similar Sequences', span: 6 },
  { id: 'evidence', selector: '.analysis-panels > details:nth-child(2)', title: 'Number Evidence', span: 6 },
  { id: 'performance', selector: '#historicalPerformanceCard', title: 'Historical Performance', span: 12 },
  { id: 'patternLanguage', selector: '#patternLanguageCard', title: 'Pattern Language', span: 12 }
];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function normalizeLayout(value) {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set();
  return [...entries, ...PANEL_DEFAULTS].flatMap(item => {
    const def = PANEL_DEFAULTS.find(d => d.id === item?.id);
    if (!def || seen.has(def.id)) return [];
    seen.add(def.id);
    return [{ id: def.id, span: Number.isFinite(item.span) ? clamp(Math.round(item.span), 3, 12) : def.span,
      height: Number.isFinite(item.height) ? clamp(item.height, 180, 2400) : null }];
  });
}

export function panelSpan(span, width) {
  if (width < 860) return 12;
  // Keep a useful minimum width as the window and interface zoom change.
  return clamp(Math.max(span, Math.ceil(320 / ((width + 12) / 12))), 3, 12);
}

export class WorkspaceLayout {
  constructor(main, onChange) {
    this.main = main;
    this.onChange = onChange;
    this.panels = new Map();
    try { this.layout = normalizeLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY))); }
    catch { this.layout = normalizeLayout(null); }
    this.dashboard = document.createElement('section');
    this.dashboard.className = 'panel-dashboard';
    this.dashboard.setAttribute('aria-label', 'Arrangeable Cash 5 workspace');
    const toolbar = document.createElement('div');
    toolbar.className = 'workspace-layout-toolbar';
    toolbar.innerHTML = '<span>Drag handles to arrange · resize from a corner</span><button type="button" class="text-btn">Reset layout</button><span class="layout-status" role="status" aria-live="polite"></span>';
    toolbar.querySelector('button').addEventListener('click', () => this.reset());
    this.status = toolbar.querySelector('.layout-status');
    // Resolve all selectors before moving nodes out of their original containers.
    const contents = PANEL_DEFAULTS.map(def => [def, main.querySelector(def.selector)]);
    for (const [def, content] of contents) {
      if (!content) continue;
      const panel = document.createElement('section');
      panel.className = 'workspace-panel';
      panel.dataset.panel = def.id;
      panel.setAttribute('aria-label', def.title + ' panel');
      panel.innerHTML = `<div class="panel-gripbar"><button class="panel-drag" type="button" aria-label="Move ${def.title}" title="Drag to move. Arrow keys move this card earlier or later.">⠿ <span>${def.title}</span></button><button class="panel-fit" type="button" title="Fit this card to its contents">Fit content</button></div><div class="panel-viewport"><div class="panel-content"></div></div><button class="panel-resize" type="button" aria-label="Resize ${def.title}" title="Drag to resize. Arrow keys resize; Home fits content.">◢</button>`;
      panel.querySelector('.panel-content').append(content);
      this.panels.set(def.id, panel);
      panel.querySelector('.panel-drag').addEventListener('pointerdown', e => this.startMove(e, def.id));
      panel.querySelector('.panel-drag').addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const index = this.layout.findIndex(item => item.id === def.id);
        this.move(def.id, clamp(index + (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1), 0, this.layout.length - 1));
      });
      panel.querySelector('.panel-resize').addEventListener('pointerdown', e => this.startResize(e, def.id));
      panel.querySelector('.panel-resize').addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home'].includes(e.key)) return;
        e.preventDefault();
        const item = this.layout.find(item => item.id === def.id);
        if (e.key === 'Home') item.height = null;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') item.span = clamp(item.span + (e.key === 'ArrowRight' ? 1 : -1), 3, 12);
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') item.height = clamp((item.height ?? panel.offsetHeight) + (e.key === 'ArrowDown' ? 40 : -40), 180, 2400);
        this.save(); this.schedule();
      });
      panel.querySelector('.panel-fit').addEventListener('click', () => this.fitContent(def.id));
    }
    main.querySelector('.primary-workspace')?.remove();
    main.querySelector('.analysis-panels')?.remove();
    main.prepend(toolbar, this.dashboard);
    for (const item of this.layout) this.dashboard.append(this.panels.get(item.id));
    this.observer = new ResizeObserver(() => this.schedule());
    this.observer.observe(main);
    // Content updates and disclosures can change the natural panel height.
    this.mutations = new MutationObserver(records => {
      if (records.some(record => !record.target.closest?.('svg'))) this.schedule();
    });
    this.mutations.observe(this.dashboard, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'open'] });
    this.dashboard.addEventListener('toggle', () => this.schedule(), true);
    this.schedule();
  }

  announce(text) { this.status.textContent = text; }
  save() { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout)); } catch { /* Session-only layout when storage is unavailable. */ } }
  fitContent(id, announce = true) {
    const item = this.layout.find(entry => entry.id === id);
    if (!item) return false;
    item.height = null;
    this.save();
    this.schedule();
    if (announce) {
      const title = PANEL_DEFAULTS.find(def => def.id === id)?.title || id;
      this.announce(`${title} fits its contents.`);
    }
    return true;
  }
  schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }
  render() {
    const width = this.dashboard.clientWidth;
    const outerZoom = Number(this.main.style.zoom) || 1;
    const measurements = new Map();
    for (const item of this.layout) {
      const panel = this.panels.get(item.id);
      const viewport = panel.querySelector('.panel-viewport');
      const content = panel.querySelector('.panel-content');
      const span = panelSpan(item.span, width);
      panel.style.gridColumn = `span ${span}`;
      // Measure at the actual column width, independently of a previous row span.
      const panelWidth = (width + 12) * span / 12 - 12;
      const availableWidth = panelWidth - 2;
      const minScale = Math.max(.9, .9 / outerZoom);
      const desiredWidth = item.id === 'history' ? 680 : item.id === 'board' ? 480 : 900;
      let scale = clamp(availableWidth / desiredWidth, minScale, 1.15);
      const measure = value => {
        content.style.zoom = String(value);
        content.style.width = `${availableWidth / value}px`;
        return content.scrollHeight * value;
      };
      let naturalHeight = measure(scale);
      const availableHeight = item.height === null ? Infinity : item.height - 48;
      // Content-fit cards grow with their contents. Only an explicitly resized card
      // is allowed to shrink its contents to fit its saved height.
      if (naturalHeight > availableHeight && scale > minScale) {
        let low = minScale, high = scale;
        for (let i = 0; i < 7; i++) {
          const mid = (low + high) / 2;
          if (measure(mid) <= availableHeight) low = mid; else high = mid;
        }
        scale = low;
        naturalHeight = measure(scale);
      }
      measurements.set(item.id, { item, panel, viewport, content, availableWidth, scale, naturalHeight });
    }

    const sharedAutoCardIds = new Set(['history', 'board']);
    const sharedAutoCardMeasurements = [...measurements.values()]
      .filter(measurement => sharedAutoCardIds.has(measurement.item.id) && measurement.item.height === null);
    const sharedAutoHeight = sharedAutoCardMeasurements.length === 2
      ? Math.max(...sharedAutoCardMeasurements.map(measurement => measurement.naturalHeight + 48))
      : null;

    for (const item of this.layout) {
      const { panel, viewport, content, availableWidth, scale, naturalHeight } = measurements.get(item.id);
      const targetHeight = item.height ?? (
        sharedAutoCardIds.has(item.id) && sharedAutoHeight !== null
          ? sharedAutoHeight
          : naturalHeight + 48
      );
      const rows = Math.ceil((targetHeight + 12) / 20);
      panel.style.gridRowEnd = `span ${rows}`;
      viewport.style.height = `${rows * 20 - 12 - 48}px`;
      panel.classList.toggle('panel-scrolls', naturalHeight > rows * 20 - 60 + 1 || content.scrollWidth * scale > availableWidth + 1);
      panel.querySelector('.panel-fit').disabled = item.height === null;
    }
    this.onChange?.();
  }
  move(id, index) {
    const from = this.layout.findIndex(item => item.id === id);
    if (from === index) return;
    const [item] = this.layout.splice(from, 1);
    this.layout.splice(index, 0, item);
    // Move only the affected panel and restore keyboard focus if it was inside it.
    const focused = this.panels.get(id).contains(document.activeElement) ? document.activeElement : null;
    this.dashboard.insertBefore(this.panels.get(id), this.panels.get(this.layout[index + 1]?.id) ?? null);
    focused?.focus({ preventScroll: true });
    this.save(); this.schedule();
    this.announce(`${PANEL_DEFAULTS.find(d => d.id === id).title} moved to position ${index + 1}.`);
  }
  pointerSession(event, update, finish) {
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const done = e => {
      target.removeEventListener('pointermove', update);
      target.removeEventListener('pointerup', done);
      target.removeEventListener('pointercancel', done);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      finish(e.type === 'pointercancel');
    };
    target.addEventListener('pointermove', update);
    target.addEventListener('pointerup', done);
    target.addEventListener('pointercancel', done);
  }
  startMove(event, id) {
    if (event.button !== 0) return;
    event.preventDefault();
    const panel = this.panels.get(id);
    let targetId = null;
    panel.classList.add('panel-dragging');
    this.pointerSession(event, e => {
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.workspace-panel');
      targetId = under && under !== panel ? under.dataset.panel : null;
      for (const [key, card] of this.panels) card.classList.toggle('panel-drop-target', key === targetId);
      // Allow moving to cards below the fold without a separate scroll gesture.
      if (e.clientY > innerHeight - 65) window.scrollBy(0, 24);
      else if (e.clientY < 110) window.scrollBy(0, -24);
    }, cancelled => {
      panel.classList.remove('panel-dragging');
      for (const card of this.panels.values()) card.classList.remove('panel-drop-target');
      if (!cancelled && targetId) this.move(id, this.layout.findIndex(item => item.id === targetId));
    });
  }
  startResize(event, id) {
    if (event.button !== 0) return;
    event.preventDefault();
    const item = this.layout.find(item => item.id === id);
    const panel = this.panels.get(id);
    const original = { ...item };
    const zoom = Number(this.main.style.zoom) || 1;
    const startWidth = panel.getBoundingClientRect().width / zoom;
    const startHeight = panel.getBoundingClientRect().height / zoom;
    const startX = event.clientX, startY = event.clientY;
    panel.classList.add('panel-resizing');
    this.pointerSession(event, e => {
      item.span = clamp(Math.round((startWidth + (e.clientX - startX) / zoom + 12) / ((this.dashboard.clientWidth + 12) / 12)), 3, 12);
      item.height = clamp(startHeight + (e.clientY - startY) / zoom, 180, 2400);
      this.schedule();
    }, cancelled => {
      if (cancelled) Object.assign(item, original);
      panel.classList.remove('panel-resizing');
      this.save(); this.schedule();
      this.announce(`${PANEL_DEFAULTS.find(d => d.id === id).title} resized.`);
    });
  }
  reset() {
    this.layout = normalizeLayout(null);
    for (const item of this.layout) this.dashboard.append(this.panels.get(item.id));
    this.save(); this.schedule(); this.announce('Default layout restored.');
  }
}
