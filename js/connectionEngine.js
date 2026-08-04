/**
 * SVG Connection Line Overlay & Interactive Canvas/SVG Engine
 */

export class ConnectionEngine {
  constructor(svgElement, gridTableElement) {
    this.svg = svgElement;
    this.gridTable = gridTableElement;
    this.lines = []; // Combined manual + auto lines
    this.manualLines = [];
    this.autoLines = [];
    this.activeTool = "select"; // 'select', 'connect-line', 'connect-arrow', 'erase'
    this.selectedColor = "#06b6d4";
    this.selectedStyle = "glow";
    this.startNodeCell = null;
    this.onLineAddedCallback = null;
    this.onLineRemovedCallback = null;

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
    if (tool !== "connect-line" && tool !== "connect-arrow") {
      this.clearStartNode();
    }
  }

  setColor(color) {
    this.selectedColor = color;
  }

  setStyle(style) {
    this.selectedStyle = style;
  }

  clearStartNode() {
    if (this.startNodeCell) {
      this.startNodeCell.classList.remove("start-node");
      this.startNodeCell = null;
    }
  }

  handleCellClick(cellElement, cellId) {
    if (this.activeTool === "connect-line" || this.activeTool === "connect-arrow") {
      if (!this.startNodeCell) {
        // First click: select start node
        this.startNodeCell = cellElement;
        cellElement.classList.add("start-node");
      } else {
        const startCellId = this.startNodeCell.dataset.cellId;
        if (startCellId !== cellId) {
          // Second click: complete line
          const newLine = {
            id: `line-${Date.now()}-${Math.floor(Math.random()*1000)}`,
            fromCellId: startCellId,
            toCellId: cellId,
            color: this.selectedColor,
            style: this.selectedStyle,
            isArrow: this.activeTool === "connect-arrow",
            label: "",
            isAuto: false
          };

          this.manualLines.push(newLine);
          this.lines.push(newLine);
          this.render();

          if (this.onLineAddedCallback) {
            this.onLineAddedCallback(newLine);
          }
        }
        this.clearStartNode();
      }
    }
  }

  initEvents() {
    window.addEventListener("resize", () => this.render());
  }

  getCellCenter(cellId) {
    const cell = this.gridTable.querySelector(`[data-cell-id="${cellId}"]`);
    if (!cell) return null;

    const cellRect = cell.getBoundingClientRect();
    const svgRect = this.svg.getBoundingClientRect();

    return {
      x: cellRect.left + cellRect.width / 2 - svgRect.left,
      y: cellRect.top + cellRect.height / 2 - svgRect.top
    };
  }

  render() {
    if (!this.svg || !this.gridTable) return;

    // Update SVG size to match grid dimensions
    const wrapper = this.gridTable.parentElement;
    if (wrapper) {
      this.svg.setAttribute("width", wrapper.offsetWidth);
      this.svg.setAttribute("height", wrapper.offsetHeight);
    }

    this.svg.innerHTML = `
      <defs>
        <marker id="arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#06b6d4" />
        </marker>
        <marker id="arrow-pink" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ec4899" />
        </marker>
        <marker id="arrow-gold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
        </marker>
        <marker id="arrow-indigo" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
        </marker>
        <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
    `;

    this.lines.forEach(line => {
      const start = this.getCellCenter(line.fromCellId);
      const end = this.getCellCenter(line.toCellId);
      if (!start || !end) return;

      const pathGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      pathGroup.dataset.lineId = line.id;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      
      // Calculate smooth curved cubic bezier or straight line
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      let dStr = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

      if (Math.abs(dy) > 50 && Math.abs(dx) > 20) {
        const cx1 = start.x;
        const cy1 = start.y + dy * 0.4;
        const cx2 = end.x;
        const cy2 = end.y - dy * 0.4;
        dStr = `M ${start.x} ${start.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end.x} ${end.y}`;
      }

      path.setAttribute("d", dStr);
      path.setAttribute("stroke", line.color || "#06b6d4");
      path.setAttribute("stroke-width", line.isAuto ? "2" : "3");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");

      if (line.style === "dashed") {
        path.setAttribute("stroke-dasharray", "6 4");
      }

      if (line.style === "glow") {
        path.setAttribute("filter", "url(#glow-filter)");
      }

      if (line.isArrow) {
        let markerId = "arrow-cyan";
        if (line.color === "#ec4899") markerId = "arrow-pink";
        else if (line.color === "#f59e0b") markerId = "arrow-gold";
        else if (line.color === "#6366f1") markerId = "arrow-indigo";
        path.setAttribute("marker-end", `url(#${markerId})`);
      }

      // Erase tool listener on line click
      path.addEventListener("click", (e) => {
        if (this.activeTool === "erase") {
          e.stopPropagation();
          this.removeLine(line.id);
        }
      });

      pathGroup.appendChild(path);

      // Optional text label
      if (line.label) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2 - 6;
        text.setAttribute("x", midX);
        text.setAttribute("y", midY);
        text.setAttribute("fill", line.color || "#ffffff");
        text.setAttribute("font-size", "10");
        text.setAttribute("font-family", "Outfit, sans-serif");
        text.setAttribute("text-anchor", "middle");
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
