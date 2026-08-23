/**
 * SVG annotation overlay for PA 5 Studio.
 * Supports chained line drawing, with Present-row endpoints completing a chain.
 */

export function isConnectionTool(tool) {
  return tool === "connect-line" || tool === "connect-arrow" || tool === "freeform-line";
}

export function shouldEndConnectionChain(targetRole, tool = "connect-line") {
  return tool !== "freeform-line" && targetRole === "present";
}

export const LINE_COLOR_PALETTE = [
  "#187458",
  "#376f9f",
  "#b66b2c",
  "#9b4f62"
];

export const AUTO_PATTERN_ORDER = ['match', 'vertical', 'sister', 'math-sequence'];
const AUTO_RING_SPACING = 5;
const AUTO_LINE_SPACING = 6;

export function automatedPatternType(line) {
  if (line?.patternType) return line.patternType;
  const id = String(line?.id || '');
  if (id.startsWith('auto-vrun-')) return 'vertical';
  if (id.startsWith('auto-diag-')) return 'sister';
  if (id.startsWith('auto-math-')) return 'math-sequence';
  return 'match';
}

function patternSort(a, b) {
  const aIndex = AUTO_PATTERN_ORDER.indexOf(a);
  const bIndex = AUTO_PATTERN_ORDER.indexOf(b);
  return (aIndex < 0 ? AUTO_PATTERN_ORDER.length : aIndex)
    - (bIndex < 0 ? AUTO_PATTERN_ORDER.length : bIndex)
    || a.localeCompare(b);
}

export function buildAutoRingLayout(lines = []) {
  const patternsByCell = new Map();

  lines.filter(line => line.isAuto && automatedPatternType(line) !== 'math-sequence').forEach(line => {
    const patternType = automatedPatternType(line);
    [line.fromCellId, line.toCellId].forEach(cellId => {
      if (!patternsByCell.has(cellId)) patternsByCell.set(cellId, new Set());
      patternsByCell.get(cellId).add(patternType);
    });
  });

  const layout = new Map();
  patternsByCell.forEach((patterns, cellId) => {
    [...patterns].sort(patternSort).forEach((patternType, index) => {
      layout.set(`${patternType}:${cellId}`, { index, count: patterns.size });
    });
  });
  return layout;
}

export function buildAutoPairOffsets(lines = []) {
  const patternsByPair = new Map();
  const pairKey = line => [line.fromCellId, line.toCellId].sort().join(':');

  lines.filter(line => line.isAuto && automatedPatternType(line) !== 'math-sequence').forEach(line => {
    const key = pairKey(line);
    if (!patternsByPair.has(key)) patternsByPair.set(key, new Set());
    patternsByPair.get(key).add(automatedPatternType(line));
  });

  const offsets = new Map();
  patternsByPair.forEach((patterns, key) => {
    const ordered = [...patterns].sort(patternSort);
    ordered.forEach((patternType, index) => {
      offsets.set(`${patternType}:${key}`, (index - (ordered.length - 1) / 2) * AUTO_LINE_SPACING);
    });
  });
  return offsets;
}

export function visibleConnectionColor(color) {
  const legacyColors = {
    "#06b6d4": "#376f9f",
    "#67e8f9": "#376f9f",
    "#ec4899": "#9b4f62",
    "#f9a8d4": "#9b4f62",
    "#f59e0b": "#b66b2c",
    "#fde68a": "#b66b2c",
    "#10b981": "#187458",
    "#6ee7b7": "#187458",
    "#6366f1": "#187458"
  };
  const normalized = String(color || "").toLowerCase();
  return legacyColors[normalized] || color || LINE_COLOR_PALETTE[0];
}

function renderedConnectionColor(color) {
  const baseColor = visibleConnectionColor(color);
  if (typeof document === 'undefined' || document.documentElement?.dataset?.theme !== 'dark') return baseColor;
  return {
    '#187458': '#61b895',
    '#376f9f': '#78acd2',
    '#b66b2c': '#d39b62',
    '#9b4f62': '#ca849e'
  }[String(baseColor).toLowerCase()] || baseColor;
}

export function normalizeManualConnectionChains(lines = []) {
  const chainColors = new Map();
  let previousLine = null;
  let previousChainId = null;

  return lines.map((line, index) => {
    const continuesLegacyChain = !line.connectionId && previousLine?.toCellId === line.fromCellId;
    const connectionId = line.connectionId
      || (continuesLegacyChain ? previousChainId : `connection-${line.id || index}`);
    const color = chainColors.get(connectionId) || visibleConnectionColor(line.color);
    chainColors.set(connectionId, color);

    const normalized = { ...line, connectionId, color };
    previousLine = normalized;
    previousChainId = connectionId;
    return normalized;
  });
}

export function trimConnectionToRings(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return { start: { ...start }, end: { ...end } };

  const unitX = dx / distance;
  const unitY = dy / distance;
  return {
    start: {
      ...start,
      x: start.x + unitX * start.radius,
      y: start.y + unitY * start.radius
    },
    end: {
      ...end,
      x: end.x - unitX * end.radius,
      y: end.y - unitY * end.radius
    }
  };
}

export function browserRectToSvgSpace(rect, svgRect, coordinateWidth, coordinateHeight) {
  const scaleX = svgRect.width && coordinateWidth ? svgRect.width / coordinateWidth : 1;
  const scaleY = svgRect.height && coordinateHeight ? svgRect.height / coordinateHeight : 1;
  return {
    left: (rect.left - svgRect.left) / scaleX,
    top: (rect.top - svgRect.top) / scaleY,
    right: (rect.right - svgRect.left) / scaleX,
    bottom: (rect.bottom - svgRect.top) / scaleY,
    width: rect.width / scaleX,
    height: rect.height / scaleY
  };
}

export class ConnectionEngine {
  constructor(svgElement, gridTableElement) {
    this.svg = svgElement;
    this.gridTable = gridTableElement;
    this.lines = [];
    this.manualLines = [];
    this.autoLines = [];
    this.activeTool = "select";
    this.selectedColor = LINE_COLOR_PALETTE[0];
    this.paletteIndex = 0;
    this.selectedStyle = "glow";
    this.startNodeCell = null;
    this.activeChainColor = null;
    this.activeChainId = null;
    this.onLineAddedCallback = null;
    this.onLineRemovedCallback = null;
    this._renderRaf = null;

    this.initEvents();
  }

  setLines(manualLines = [], autoLines = []) {
    this.manualLines = manualLines;
    this.autoLines = autoLines;
    this.lines = [...manualLines, ...autoLines];
    this.render();
  }

  setTool(tool) {
    this.activeTool = tool;
    if (!isConnectionTool(tool)) {
      this.clearStartNode();
    }
    this.render();
  }

  setColor(color) {
    const normalizedColor = visibleConnectionColor(color);
    const paletteIndex = LINE_COLOR_PALETTE.indexOf(normalizedColor);
    this.paletteIndex = paletteIndex >= 0 ? paletteIndex : 0;
    this.selectedColor = paletteIndex >= 0 ? normalizedColor : LINE_COLOR_PALETTE[0];
  }

  takeNextLineColor() {
    return this.selectedColor;
  }

  setStyle(style) {
    this.selectedStyle = style;
  }

  clearStartNode() {
    if (this.startNodeCell) {
      this.startNodeCell.classList.remove("start-node");
      this.startNodeCell = null;
    }
    this.activeChainColor = null;
    this.activeChainId = null;
  }

  completeConnection() {
    const hadActiveChain = Boolean(this.startNodeCell || this.activeChainId);
    this.clearStartNode();
    this.render();
    return hadActiveChain;
  }

  handleCellClick(cellElement, cellId) {
    const targetCell = cellElement.closest ? (cellElement.closest(".square-cell") || cellElement) : cellElement;
    if (!targetCell) return;
    const actualCellId = targetCell.dataset.cellId || cellId;

    if (isConnectionTool(this.activeTool)) {
      if (!this.startNodeCell) {
        // First node in chain
        this.activeChainColor = this.takeNextLineColor();
        this.activeChainId = `connection-${Date.now()}-${Math.floor(Math.random()*10000)}`;
        this.startNodeCell = targetCell;
        targetCell.classList.add("start-node");
        if (window.app && window.app.showToast) {
          window.app.showToast(this.activeTool === "freeform-line"
            ? "Free Form started. Continue anywhere, then choose Complete / New."
            : "Start digit selected. End on Present to complete this connection.");
        }
      } else {
        const startCellId = this.startNodeCell.dataset.cellId;

        if (startCellId === actualCellId) {
          // Double-clicking same node deselects start node
          this.clearStartNode();
          if (window.app && window.app.showToast) {
            window.app.showToast("Deselected digit.");
          }
          return;
        }

        const newLine = {
          id: `line-${Date.now()}-${Math.floor(Math.random()*10000)}`,
          fromCellId: startCellId,
          toCellId: actualCellId,
          connectionId: this.activeChainId,
          color: this.activeChainColor,
          style: this.selectedStyle,
          isArrow: this.activeTool === "connect-arrow",
          label: "",
          isAuto: false
        };

        this.manualLines.push(newLine);
        this.lines.push(newLine);

        // Remove glowing outline from previous start node
        this.startNodeCell.classList.remove("start-node");

        if (shouldEndConnectionChain(targetCell.dataset.role, this.activeTool)) {
          // Present is a terminal row. The next click starts an independent line.
          this.startNodeCell = null;
          this.activeChainColor = null;
          this.activeChainId = null;
          if (window.app && window.app.showToast) {
            window.app.showToast("Connection completed on Present. Select a new starting digit.");
          }
        } else {
          // Regular chains continue until Present; Free Form continues until
          // the user explicitly chooses Complete / New.
          this.startNodeCell = targetCell;
          targetCell.classList.add("start-node");
        }

        this.render();

        if (this.onLineAddedCallback) {
          this.onLineAddedCallback(newLine);
        }
      }
    }
  }

  initEvents() {
    window.addEventListener("resize", () => this.render());
  }

  getCellCenter(cellId) {
    const container = this.gridTable || document.getElementById("gridContainer");
    const searchRoot = container || document;
    const cell = Array.from(searchRoot.querySelectorAll("[data-cell-id]"))
      .find(candidate => candidate.dataset.cellId === String(cellId));
    if (!cell || !this.svg) return null;

    const cellRect = cell.getBoundingClientRect();
    const svgRect = this.svg.getBoundingClientRect();

    if (cellRect.width === 0 || cellRect.height === 0) return null;

    const coordinateWidth = Number(this.svg.getAttribute('width')) || this.svg.clientWidth || svgRect.width;
    const coordinateHeight = Number(this.svg.getAttribute('height')) || this.svg.clientHeight || svgRect.height;
    const svgCellRect = browserRectToSvgSpace(cellRect, svgRect, coordinateWidth, coordinateHeight);

    return {
      x: svgCellRect.left + svgCellRect.width / 2,
      y: svgCellRect.top + svgCellRect.height / 2,
      radius: Math.max(8, Math.min(svgCellRect.width, svgCellRect.height) * 0.42)
    };
  }

  render() {
    if (this._renderRaf) cancelAnimationFrame(this._renderRaf);
    this._renderRaf = requestAnimationFrame(() => this.renderActual());
  }

  renderActual() {
    if (!this.svg) return;

    const wrapper = document.getElementById("gridWrapper");
    if (wrapper) {
      this.svg.setAttribute("width", wrapper.offsetWidth);
      this.svg.setAttribute("height", wrapper.offsetHeight);
      this.svg.style.width = wrapper.offsetWidth + "px";
      this.svg.style.height = wrapper.offsetHeight + "px";
    }

    const renderedPalette = LINE_COLOR_PALETTE.map(renderedConnectionColor);
    this.svg.innerHTML = `
      <defs>
        <marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="${renderedPalette[0]}" fill-opacity="0.82" />
        </marker>
        <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="${renderedPalette[1]}" fill-opacity="0.82" />
        </marker>
        <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="${renderedPalette[2]}" fill-opacity="0.82" />
        </marker>
        <marker id="arrow-rose" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="${renderedPalette[3]}" fill-opacity="0.82" />
        </marker>
        <filter id="glow-filter" filterUnits="userSpaceOnUse" x="-1000" y="-1000" width="5000" height="5000">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
    `;

    const renderedRings = new Set();
    const autoRingLayout = buildAutoRingLayout(this.lines);
    const autoPairOffsets = buildAutoPairOffsets(this.lines);

    this.lines
      .filter(line => line.isAuto && automatedPatternType(line) === 'math-sequence')
      .forEach(sequence => {
        const container = this.gridTable || document.getElementById("gridContainer");
        const searchRoot = container || document;
        const cells = (sequence.sequenceCellIds || [])
          .map(cellId => Array.from(searchRoot.querySelectorAll("[data-cell-id]"))
            .find(candidate => candidate.dataset.cellId === String(cellId)))
          .filter(Boolean);
        if (cells.length !== 3) return;

        const svgRect = this.svg.getBoundingClientRect();
        const coordinateWidth = Number(this.svg.getAttribute('width')) || this.svg.clientWidth || svgRect.width;
        const coordinateHeight = Number(this.svg.getAttribute('height')) || this.svg.clientHeight || svgRect.height;
        const rects = cells.map(cell => browserRectToSvgSpace(
          cell.getBoundingClientRect(), svgRect, coordinateWidth, coordinateHeight
        ));
        const padding = 5;
        const minX = Math.min(...rects.map(rect => rect.left)) - padding;
        const minY = Math.min(...rects.map(rect => rect.top)) - padding;
        const maxX = Math.max(...rects.map(rect => rect.right)) + padding;
        const maxY = Math.max(...rects.map(rect => rect.bottom)) + padding;
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.dataset.lineId = sequence.id;
        const box = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        box.setAttribute("x", minX);
        box.setAttribute("y", minY);
        box.setAttribute("width", maxX - minX);
        box.setAttribute("height", maxY - minY);
        box.setAttribute("rx", "10");
        box.setAttribute("fill", "rgba(110, 231, 183, 0.06)");
        box.setAttribute("stroke", renderedConnectionColor(sequence.color));
        box.setAttribute("stroke-width", "2.5");
        box.setAttribute("vector-effect", "non-scaling-stroke");
        if (sequence.overlapsSequence) box.setAttribute("stroke-dasharray", "7 5");
        box.style.pointerEvents = "none";
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = sequence.label;
        box.appendChild(title);
        group.appendChild(box);
        this.svg.appendChild(group);
      });

    this.lines.forEach((line, lineIndex) => {
      if (line.isAuto && automatedPatternType(line) === 'math-sequence') return;
      const start = this.getCellCenter(line.fromCellId);
      const end = this.getCellCenter(line.toCellId);
      if (!start || !end) return;
      const patternType = automatedPatternType(line);
      const startRing = autoRingLayout.get(`${patternType}:${line.fromCellId}`);
      const endRing = autoRingLayout.get(`${patternType}:${line.toCellId}`);
      const ringRadius = (point, layout) => point.radius
        + (line.isAuto ? 1.5 + (layout?.index || 0) * AUTO_RING_SPACING : 0);
      const pathPoints = trimConnectionToRings(
        { ...start, radius: ringRadius(start, startRing) },
        { ...end, radius: ringRadius(end, endRing) }
      );
      const pathStart = pathPoints.start;
      const pathEnd = pathPoints.end;
      const baseLineColor = visibleConnectionColor(line.color);
      const lineColor = renderedConnectionColor(line.color);
      const pairKey = [line.fromCellId, line.toCellId].sort().join(':');
      const parallelOffset = line.isAuto
        ? (autoPairOffsets.get(`${patternType}:${pairKey}`) || 0)
        : 0;

      const pathGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      pathGroup.dataset.lineId = line.id;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      
      const dx = pathEnd.x - pathStart.x;
      const dy = pathEnd.y - pathStart.y;
      const distance = Math.hypot(dx, dy) || 1;
      const normalX = -dy / distance;
      const normalY = dx / distance;
      let dStr = `M ${pathStart.x} ${pathStart.y} L ${pathEnd.x} ${pathEnd.y}`;

      if (Math.abs(dy) > 50 && Math.abs(dx) > 20) {
        const cx1 = pathStart.x + normalX * parallelOffset;
        const cy1 = pathStart.y + dy * 0.4 + normalY * parallelOffset;
        const cx2 = pathEnd.x + normalX * parallelOffset;
        const cy2 = pathEnd.y - dy * 0.4 + normalY * parallelOffset;
        dStr = `M ${pathStart.x} ${pathStart.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${pathEnd.x} ${pathEnd.y}`;
      } else if (parallelOffset) {
        const midX = (pathStart.x + pathEnd.x) / 2 + normalX * parallelOffset;
        const midY = (pathStart.y + pathEnd.y) / 2 + normalY * parallelOffset;
        dStr = `M ${pathStart.x} ${pathStart.y} Q ${midX} ${midY}, ${pathEnd.x} ${pathEnd.y}`;
      }

      path.setAttribute("d", dStr);
      path.setAttribute("stroke", lineColor);
      if (!line.isAuto) path.setAttribute("stroke-opacity", "0.7");
      path.setAttribute("stroke-width", line.isAuto ? "2.5" : "4.5");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", line.isAuto ? "round" : "butt");

      // Keep skipped-row connectors visually beneath any number cell they cross.
      const maskId = `connector-mask-${lineIndex}`;
      const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
      mask.setAttribute("id", maskId);
      mask.setAttribute("maskUnits", "userSpaceOnUse");
      mask.setAttribute("x", "0");
      mask.setAttribute("y", "0");
      mask.setAttribute("width", this.svg.getAttribute("width") || "100%");
      mask.setAttribute("height", this.svg.getAttribute("height") || "100%");
      const maskBase = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      maskBase.setAttribute("x", "0");
      maskBase.setAttribute("y", "0");
      maskBase.setAttribute("width", "100%");
      maskBase.setAttribute("height", "100%");
      maskBase.setAttribute("fill", "white");
      mask.appendChild(maskBase);

      const container = this.gridTable || document.getElementById("gridContainer");
      const svgRect = this.svg.getBoundingClientRect();
      const coordinateWidth = Number(this.svg.getAttribute('width')) || this.svg.clientWidth || svgRect.width;
      const coordinateHeight = Number(this.svg.getAttribute('height')) || this.svg.clientHeight || svgRect.height;
      Array.from((container || document).querySelectorAll(".square-cell[data-cell-id]"))
        .filter(cell => cell.dataset.cellId !== String(line.fromCellId)
          && cell.dataset.cellId !== String(line.toCellId))
        .forEach(cell => {
          const rect = browserRectToSvgSpace(cell.getBoundingClientRect(), svgRect, coordinateWidth, coordinateHeight);
          const cutout = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          cutout.setAttribute("x", rect.left - 1);
          cutout.setAttribute("y", rect.top - 1);
          cutout.setAttribute("width", rect.width + 2);
          cutout.setAttribute("height", rect.height + 2);
          cutout.setAttribute("rx", "7");
          cutout.setAttribute("fill", "black");
          mask.appendChild(cutout);
        });
      this.svg.querySelector("defs")?.appendChild(mask);
      path.setAttribute("mask", `url(#${maskId})`);

      path.style.pointerEvents = "none";
      path.style.cursor = "default";

      if (line.style === "dashed") {
        path.setAttribute("stroke-dasharray", "6 4");
      }

      if (line.style === "glow") {
        path.setAttribute("filter", "url(#glow-filter)");
      }

      if (line.label) {
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = line.label;
        path.appendChild(title);
      }

      if (line.isArrow) {
        let markerId = "arrow-green";
        if (baseLineColor === "#376f9f") markerId = "arrow-blue";
        else if (baseLineColor === "#b66b2c") markerId = "arrow-amber";
        else if (baseLineColor === "#9b4f62") markerId = "arrow-rose";
        path.setAttribute("marker-end", `url(#${markerId})`);
      }

      if (!line.isAuto) {
        const underlay = document.createElementNS("http://www.w3.org/2000/svg", "path");
        underlay.setAttribute("class", "connection-line-underlay");
        underlay.setAttribute("d", dStr);
        underlay.setAttribute("stroke", lineColor);
        underlay.setAttribute("stroke-opacity", "0.28");
        underlay.setAttribute("stroke-width", "7");
        underlay.setAttribute("fill", "none");
        underlay.setAttribute("stroke-linecap", "butt");
        underlay.setAttribute("mask", `url(#${maskId})`);
        underlay.style.pointerEvents = "none";
        pathGroup.appendChild(underlay);
      }

      pathGroup.appendChild(path);

      if (!line.isAuto && this.activeTool === "erase") {
        const deleteHit = document.createElementNS("http://www.w3.org/2000/svg", "path");
        deleteHit.setAttribute("class", "connection-delete-hit");
        deleteHit.setAttribute("d", dStr);
        deleteHit.setAttribute("stroke", "rgba(255, 255, 255, 0.001)");
        deleteHit.setAttribute("stroke-width", "20");
        deleteHit.setAttribute("fill", "none");
        deleteHit.setAttribute("stroke-linecap", "round");
        deleteHit.setAttribute("mask", `url(#${maskId})`);
        deleteHit.addEventListener("mouseenter", () => path.setAttribute("stroke-width", "7"));
        deleteHit.addEventListener("mouseleave", () => path.setAttribute("stroke-width", "4.5"));
        deleteHit.addEventListener("click", event => {
          event.stopPropagation();
          this.removeLine(line.id);
        });
        pathGroup.appendChild(deleteHit);
      }

      [
          { point: start, cellId: line.fromCellId },
          { point: end, cellId: line.toCellId }
        ].forEach(({ point, cellId }) => {
          const layout = autoRingLayout.get(`${patternType}:${cellId}`);
          const ringKey = line.isAuto
            ? `auto:${patternType}:${cellId}`
            : `manual:${line.connectionId || line.id}:${cellId}`;
          if (renderedRings.has(ringKey)) return;
          renderedRings.add(ringKey);
          const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          ring.setAttribute("class", `connection-node-ring${line.isAuto ? ' auto-pattern-ring' : ''}`);
          if (line.isAuto) ring.setAttribute('data-pattern-type', patternType);
          ring.setAttribute("cx", point.x);
          ring.setAttribute("cy", point.y);
          ring.setAttribute("r", ringRadius(point, layout));
          ring.setAttribute("fill", "none");
          ring.setAttribute("stroke", lineColor);
          ring.setAttribute("stroke-opacity", line.isAuto ? "0.92" : "0.7");
          ring.setAttribute("stroke-width", "2.5");
          ring.setAttribute("vector-effect", "non-scaling-stroke");
          ring.style.color = lineColor;
          ring.style.pointerEvents = "none";
          pathGroup.appendChild(ring);

          if (!line.isAuto && this.activeTool === "erase") {
            const ringHit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            ringHit.setAttribute("class", "connection-ring-delete-hit");
            ringHit.setAttribute("cx", point.x);
            ringHit.setAttribute("cy", point.y);
            ringHit.setAttribute("r", ringRadius(point, layout));
            ringHit.setAttribute("fill", "none");
            ringHit.setAttribute("stroke", "rgba(255, 255, 255, 0.001)");
            ringHit.setAttribute("stroke-width", "16");
            ringHit.addEventListener("mouseenter", () => ring.setAttribute("stroke-width", "5"));
            ringHit.addEventListener("mouseleave", () => ring.setAttribute("stroke-width", "2.5"));
            ringHit.addEventListener("click", event => {
              event.stopPropagation();
              this.removeLine(line.id);
            });
            pathGroup.appendChild(ringHit);
          }
        });

      if (line.label && !line.isAuto) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        const midX = (start.x + end.x) / 2 + normalX * parallelOffset;
        const midY = (start.y + end.y) / 2 + normalY * parallelOffset - 6;
        text.setAttribute("x", midX);
        text.setAttribute("y", midY);
        text.setAttribute("fill", lineColor);
        text.setAttribute("font-size", "10");
        text.setAttribute("font-family", "Outfit, sans-serif");
        text.setAttribute("text-anchor", "middle");
        text.style.pointerEvents = "none";
        text.textContent = line.label;
        pathGroup.appendChild(text);
      }

      this.svg.appendChild(pathGroup);
    });
  }

  removeLine(lineId) {
    this.manualLines = this.manualLines.filter(l => l.id !== lineId);
    this.autoLines = this.autoLines.filter(l => l.id !== lineId);
    this.lines = this.lines.filter(l => l.id !== lineId);
    this.render();

    if (this.onLineRemovedCallback) {
      this.onLineRemovedCallback(lineId);
    }
  }
}
