/**
 * Main LottoPlus Application Orchestrator
 */

import { SAMPLE_POWERBALL, SAMPLE_MEGA_MILLIONS, SAMPLE_CASH_5 } from './sampleData.js';
import { parseCSV, autoMapColumns, convertRowsToDraws } from './csvParser.js';
import { generateAutomatedPatterns } from './patternEngine.js';
import { ConnectionEngine } from './connectionEngine.js';
import { GridMatrix } from './gridMatrix.js';

class LottoPlusApp {
  constructor() {
    this.activeGame = "powerball"; // 'powerball', 'megamillions', 'cash5'
    this.draws = [...SAMPLE_POWERBALL];
    this.filteredDraws = [...this.draws];
    this.manualLines = [];
    this.autoLines = [];
    this.activeDigitHighlight = null;

    this.patternSettings = {
      showMatches: true,
      showVerticalRuns: false,
      showDiagonalRuns: false
    };

    this.gridMatrix = null;
    this.connectionEngine = null;

    this.init();
  }

  init() {
    document.addEventListener("DOMContentLoaded", () => {
      this.setupDOMReferences();
      this.setupComponents();
      this.bindEvents();
      this.loadFromLocalStorage();
      this.updateState();
    });
  }

  setupDOMReferences() {
    this.gridContainer = document.getElementById("gridContainer");
    this.svgOverlay = document.getElementById("svgOverlay");

    // Game tabs
    this.gameTabs = document.querySelectorAll(".tab-btn");

    // Action buttons
    this.btnImportCsv = document.getElementById("btnImportCsv");
    this.btnSaveProject = document.getElementById("btnSaveProject");
    this.btnOpenProject = document.getElementById("btnOpenProject");
    this.btnLoadSample = document.getElementById("btnLoadSample");

    // Filter controls
    this.startDateInput = document.getElementById("startDateInput");
    this.endDateInput = document.getElementById("endDateInput");
    this.sortOrderSelect = document.getElementById("sortOrderSelect");

    // Tool buttons
    this.toolBtns = document.querySelectorAll(".tool-btn");
    this.colorSwatches = document.querySelectorAll(".color-swatch");

    // Checkboxes
    this.chkMatches = document.getElementById("chkMatches");
    this.chkVerticalRuns = document.getElementById("chkVerticalRuns");
    this.chkDiagonalRuns = document.getElementById("chkDiagonalRuns");

    // CSV Modal
    this.csvModal = document.getElementById("csvModal");
    this.csvFileInput = document.getElementById("csvFileInput");
    this.csvDropzone = document.getElementById("csvDropzone");

    // Stats bar
    this.statsBar = document.getElementById("statsBar");

    // Project File Input
    this.projectFileInput = document.getElementById("projectFileInput");
  }

  setupComponents() {
    this.gridMatrix = new GridMatrix(this.gridContainer);
    this.connectionEngine = new ConnectionEngine(this.svgOverlay, this.gridContainer);

    this.gridMatrix.onCellClickCallback = (cellElement, cellId, digit) => {
      if (this.connectionEngine.activeTool === "select") {
        // Highlight all instances of this digit in grid
        if (this.activeDigitHighlight === digit) {
          this.activeDigitHighlight = null;
        } else {
          this.activeDigitHighlight = digit;
        }
        this.gridMatrix.setHighlightedDigit(this.activeDigitHighlight);
      } else {
        this.connectionEngine.handleCellClick(cellElement, cellId);
      }
    };

    this.connectionEngine.onLineAddedCallback = (newLine) => {
      this.manualLines.push(newLine);
      this.saveToLocalStorage();
      this.showToast("Connection created!");
    };

    this.connectionEngine.onLineRemovedCallback = (lineId) => {
      this.manualLines = this.manualLines.filter(l => l.id !== lineId);
      this.saveToLocalStorage();
      this.showToast("Connection erased.");
    };
  }

  bindEvents() {
    // Game Switcher Tabs
    this.gameTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const game = tab.dataset.game;
        this.switchGame(game);
      });
    });

    // Tool Selector
    this.toolBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        this.toolBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tool = btn.dataset.tool;
        this.connectionEngine.setTool(tool);
      });
    });

    // Color Swatches
    this.colorSwatches.forEach(swatch => {
      swatch.addEventListener("click", () => {
        this.colorSwatches.forEach(s => s.classList.remove("active"));
        swatch.classList.add("active");
        this.connectionEngine.setColor(swatch.dataset.color);
      });
    });

    // Automated Pattern Checkboxes
    if (this.chkMatches) {
      this.chkMatches.addEventListener("change", (e) => {
        this.patternSettings.showMatches = e.target.checked;
        this.updateLines();
      });
    }
    if (this.chkVerticalRuns) {
      this.chkVerticalRuns.addEventListener("change", (e) => {
        this.patternSettings.showVerticalRuns = e.target.checked;
        this.updateLines();
      });
    }
    if (this.chkDiagonalRuns) {
      this.chkDiagonalRuns.addEventListener("change", (e) => {
        this.patternSettings.showDiagonalRuns = e.target.checked;
        this.updateLines();
      });
    }

    // Filter Listeners
    if (this.startDateInput) this.startDateInput.addEventListener("change", () => this.applyFilters());
    if (this.endDateInput) this.endDateInput.addEventListener("change", () => this.applyFilters());
    if (this.sortOrderSelect) this.sortOrderSelect.addEventListener("change", () => this.applyFilters());

    // Sample Loader
    if (this.btnLoadSample) {
      this.btnLoadSample.addEventListener("click", () => {
        this.loadSampleData(this.activeGame);
      });
    }

    // Project File Save / Open
    if (this.btnSaveProject) {
      this.btnSaveProject.addEventListener("click", () => this.exportProjectFile());
    }
    if (this.btnOpenProject) {
      this.btnOpenProject.addEventListener("click", () => this.projectFileInput.click());
    }
    if (this.projectFileInput) {
      this.projectFileInput.addEventListener("change", (e) => this.importProjectFile(e));
    }

    // CSV Modal Handlers
    if (this.btnImportCsv) {
      this.btnImportCsv.addEventListener("click", () => this.openCsvModal());
    }
    document.querySelectorAll(".close-modal").forEach(btn => {
      btn.addEventListener("click", () => this.closeCsvModal());
    });
    if (this.csvDropzone) {
      this.csvDropzone.addEventListener("click", () => this.csvFileInput.click());
      this.csvDropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        this.csvDropzone.classList.add("drag-over");
      });
      this.csvDropzone.addEventListener("dragleave", () => {
        this.csvDropzone.classList.remove("drag-over");
      });
      this.csvDropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        this.csvDropzone.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) {
          this.handleCsvFile(e.dataTransfer.files[0]);
        }
      });
    }
    if (this.csvFileInput) {
      this.csvFileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
          this.handleCsvFile(e.target.files[0]);
        }
      });
    }
  }

  switchGame(game) {
    this.activeGame = game;
    this.gameTabs.forEach(t => {
      t.classList.toggle("active", t.dataset.game === game);
    });

    this.loadSampleData(game);
  }

  loadSampleData(game) {
    if (game === "powerball") this.draws = [...SAMPLE_POWERBALL];
    else if (game === "megamillions") this.draws = [...SAMPLE_MEGA_MILLIONS];
    else if (game === "cash5") this.draws = [...SAMPLE_CASH_5];

    this.manualLines = [];
    this.activeDigitHighlight = null;
    this.applyFilters();
    this.showToast(`Loaded ${game.toUpperCase()} sample dataset.`);
  }

  applyFilters() {
    let result = [...this.draws];

    const startVal = this.startDateInput ? this.startDateInput.value : "";
    const endVal = this.endDateInput ? this.endDateInput.value : "";
    const sortOrder = this.sortOrderSelect ? this.sortOrderSelect.value : "desc";

    if (startVal) {
      result = result.filter(d => d.date >= startVal);
    }
    if (endVal) {
      result = result.filter(d => d.date <= endVal);
    }

    result.sort((a, b) => {
      const tA = new Date(a.date).getTime();
      const tB = new Date(b.date).getTime();
      return sortOrder === "desc" ? tB - tA : tA - tB;
    });

    this.filteredDraws = result;
    this.updateState();
  }

  updateState() {
    this.gridMatrix.setDraws(this.filteredDraws, this.activeGame);
    this.updateLines();
    this.updateStats();
    this.saveToLocalStorage();
  }

  updateLines() {
    this.autoLines = generateAutomatedPatterns(this.filteredDraws, this.patternSettings);
    this.connectionEngine.setLines(this.manualLines, this.autoLines);
  }

  updateStats() {
    if (!this.statsBar) return;

    // Calculate digit frequencies (0 through 9)
    const counts = Array(10).fill(0);
    let totalDigits = 0;

    this.filteredDraws.forEach(draw => {
      draw.numbers.forEach(num => {
        const formatted = num.toString().padStart(2, '0');
        counts[parseInt(formatted[0], 10)]++;
        counts[parseInt(formatted[1], 10)]++;
        totalDigits += 2;
      });
      if (draw.bonus !== null && draw.bonus !== undefined) {
        const formatted = draw.bonus.toString().padStart(2, '0');
        counts[parseInt(formatted[0], 10)]++;
        counts[parseInt(formatted[1], 10)]++;
        totalDigits += 2;
      }
    });

    const maxCount = Math.max(...counts, 1);

    let html = '';
    for (let d = 0; d <= 9; d++) {
      const count = counts[d];
      const percent = Math.round((count / maxCount) * 100);

      html += `
        <div class="heatmap-item" title="Digit ${d}: ${count} occurrences">
          <div class="heatmap-digit">${d}</div>
          <div class="heatmap-bar-container">
            <div class="heatmap-bar-fill" style="height: ${percent}%;"></div>
          </div>
          <div class="heatmap-count">${count}</div>
        </div>
      `;
    }

    this.statsBar.innerHTML = html;
  }

  // Local Storage Save/Load
  saveToLocalStorage() {
    const projectData = {
      activeGame: this.activeGame,
      draws: this.draws,
      manualLines: this.manualLines,
      timestamp: Date.now()
    };
    localStorage.setItem("lottoplus_current_project", JSON.stringify(projectData));
  }

  loadFromLocalStorage() {
    const raw = localStorage.getItem("lottoplus_current_project");
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (data.activeGame && data.draws) {
        this.activeGame = data.activeGame;
        this.draws = data.draws;
        this.manualLines = data.manualLines || [];
        this.gameTabs.forEach(t => t.classList.toggle("active", t.dataset.game === this.activeGame));
      }
    } catch (e) {
      console.warn("Failed to parse local storage", e);
    }
  }

  // Export Local Project File (.lottoplus JSON)
  exportProjectFile() {
    const project = {
      appName: "LottoPlus",
      version: "1.0",
      gameType: this.activeGame,
      draws: this.draws,
      manualLines: this.manualLines,
      savedAt: new Date().toISOString()
    };

    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lottoplus_${this.activeGame}_${new Date().toISOString().split('T')[0]}.lottoplus`;
    a.click();
    URL.revokeObjectURL(url);

    this.showToast("Project file downloaded locally!");
  }

  // Import Local Project File (.lottoplus JSON)
  importProjectFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const project = JSON.parse(evt.target.result);
        if (project.draws && Array.isArray(project.draws)) {
          this.draws = project.draws;
          this.manualLines = project.manualLines || [];
          if (project.gameType) {
            this.activeGame = project.gameType;
            this.gameTabs.forEach(t => t.classList.toggle("active", t.dataset.game === this.activeGame));
          }
          this.applyFilters();
          this.showToast("Project file successfully loaded!");
        } else {
          alert("Invalid project file format.");
        }
      } catch (err) {
        alert("Failed to read project file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // CSV Modal & Importer
  openCsvModal() {
    this.csvModal.classList.add("active");
  }

  closeCsvModal() {
    this.csvModal.classList.remove("active");
  }

  handleCsvFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0 || rows.length === 0) {
        alert("Empty or unreadable CSV file.");
        return;
      }

      const mapping = autoMapColumns(headers);
      const importedDraws = convertRowsToDraws(headers, rows, mapping, this.activeGame);

      if (importedDraws.length > 0) {
        this.draws = importedDraws;
        this.manualLines = [];
        this.applyFilters();
        this.closeCsvModal();
        this.showToast(`Successfully imported ${importedDraws.length} draws from CSV!`);
      } else {
        alert("Could not extract lottery numbers from CSV file.");
      }
    };
    reader.readAsText(file);
  }

  showToast(message) {
    let container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span>✨</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// Instantiate App
window.app = new LottoPlusApp();
