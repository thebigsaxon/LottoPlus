/** Main Cash 5 Studio application orchestrator. */

import { SAMPLE_CASH_5 } from './sampleData.js?v=3';
import { parseCSV, autoMapColumns, convertRowsToDraws } from './csvParser.js';
import { generateAutomatedPatterns } from './patternEngine.js?v=5';
import { ConnectionEngine, normalizeManualConnectionChains } from './connectionEngine.js?v=10';
import { GridMatrix } from './gridMatrix.js?v=6';
import { fetchLiveCash5Update } from './liveFetcher.js?v=4';
import { validateProject, validateDraw, escapeHTML } from './validation.js?v=3';
import { cash5AnalysisWindow, cash5ResearchWindow } from './drawFilters.js?v=2';
import { findBoardSimilarSequences } from './motifEngine.js?v=4';
import { buildNumberEvidence } from './evidenceEngine.js';
import { classifyOnesHeat } from './onesAnalysis.js';
import { createDraftRow, editSessionInBuilder, finalizeSession, formatSessionForMessage, scorePendingSessions } from './sessionStore.js?v=5';
import { futureCellEvidence, rankHistoricalSuccessors, selectFutureDigit } from './futureWorkspace.js?v=4';
import { buildDigitRepeatSummary } from './repeatSummary.js';
import { rankPatternRecommendationsByColumn } from './patternRecommendations.js?v=2';
import { hasAvailableOrderedSlip, recommendTensBands, TENS_BANDS, tensDigitForNumber } from './fuzzyTens.js?v=3';

const INTERFACE_ZOOM_STEPS = [0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5];
const INTERFACE_ZOOM_KEY = 'cash5studio_interface_zoom';
const THEME_KEY = 'cash5studio_theme';
const JACKPOT_KEY = 'cash5studio_last_jackpot';
const SUCCESSOR_RANK_LABELS = ['Top historical successor', 'Second historical successor', 'Third historical successor', 'Honorable mention'];

function cash5NumberMarkup(number) {
  if (number === null || number === undefined || !Number.isInteger(Number(number))) return '<span class="number-empty">?</span>';
  const text = String(Number(number));
  const leading = text.slice(0, -1);
  const ones = text.slice(-1);
  return `<span class="number-leading">${leading}</span><strong class="number-ones">${ones}</strong>`;
}

function createWorkspaceState() {
  return {
    motifSelections: [],
    motifMatches: [],
    futureDigitMap: [],
    activeFutureCell: null,
    candidateDigits: [],
    selectedEvidenceDigit: null,
    fullCandidates: [],
    rowBuilder: [],
    slipNumbers: [null, null, null, null, null],
    slipTensFilters: [null, null, null, null, null],
    draftRows: [],
    sessions: []
  };
}

export class Cash5StudioApp {
  constructor() {
    this.draws = [...SAMPLE_CASH_5];
    this.filteredDraws = [...this.draws];
    this.researchDraws = cash5ResearchWindow(this.draws);
    this.manualLines = [];
    this.autoLines = [];
    this.activeDigitHighlight = null;
    this.recentFinalizedSessionId = null;
    this.jackpot = null;
    this.jackpotIsStale = true;

    this.patternSettings = {
      showMatches: false,
      showVerticalRuns: false,
      showDiagonalRuns: false,
      showMathematicalSequences: false,
      showDiagonalMathematicalSequences: false,
      showSisterOutputSequences: false,
      showLPatterns: false,
      showTens: false,
      showOnes: true,
      linkBonusCurrentAndPrevOnly: false
    };

    this.gridMatrix = null;
    this.connectionEngine = null;
    this.workspace = createWorkspaceState();

    this.init();
  }

  init() {
    document.addEventListener("DOMContentLoaded", () => {
      this.setupDOMReferences();
      this.loadTheme();
      this.loadInterfaceZoom();
      this.setupComponents();
      this.bindEvents();
      this.loadCachedJackpot();
      this.loadFromLocalStorage();
      this.applyFilters();
    });
  }

  setupDOMReferences() {
    this.gridContainer = document.getElementById("gridContainer");
    this.svgOverlay = document.getElementById("svgOverlay");

    // Action buttons
    this.btnImportCsv = document.getElementById("btnImportCsv");
    this.btnSaveProject = document.getElementById("btnSaveProject");
    this.btnOpenProject = document.getElementById("btnOpenProject");
    this.btnLoadSample = document.getElementById("btnLoadSample");
    this.btnFetchLive = document.getElementById("btnFetchLive");

    // Tool buttons
    this.toolBtns = document.querySelectorAll(".tool-btn");
    this.colorSwatches = document.querySelectorAll(".color-swatch");
    this.btnCompleteConnection = document.getElementById("btnCompleteConnection");
    this.btnClearAllLines = document.getElementById("btnClearAllLines");

    // Checkboxes
    this.chkMatches = document.getElementById("chkMatches");
    this.chkVerticalRuns = document.getElementById("chkVerticalRuns");
    this.chkDiagonalRuns = document.getElementById("chkDiagonalRuns");
    this.chkMathematicalSequences = document.getElementById("chkMathematicalSequences");
    this.chkDiagonalMathematicalSequences = document.getElementById("chkDiagonalMathematicalSequences");
    this.chkSisterOutputSequences = document.getElementById("chkSisterOutputSequences");
    this.chkLPatterns = document.getElementById("chkLPatterns");
    this.chkTens = document.getElementById("chkTens");
    this.chkOnes = document.getElementById("chkOnes");
    this.digitRepeatSummary = document.getElementById("digitRepeatSummary");

    // File Inputs
    this.csvFileInput = document.getElementById("csvFileInput");
    this.projectFileInput = document.getElementById("projectFileInput");

    this.cash5Workspace = document.getElementById("cash5Workspace");
    this.motifSelectionSummary = document.getElementById("motifSelectionSummary");
    this.futureMapCard = document.getElementById("futureMapCard");
    this.futureDigitGrid = document.getElementById("futureDigitGrid");
    this.futureAllDigitGrid = document.getElementById("futureAllDigitGrid");
    this.futureMapInspector = document.getElementById("futureMapInspector");
    this.btnClearFutureMap = document.getElementById("btnClearFutureMap");
    this.btnJumpToSlip = document.getElementById("btnJumpToSlip");
    this.motifResults = document.getElementById("motifResults");
    this.heatTiers = document.getElementById("heatTiers");
    this.candidateDigitsContainer = document.getElementById("candidateDigits");
    this.numberEvidence = document.getElementById("numberEvidence");
    this.rowBuilderContainer = document.getElementById("rowBuilder");
    this.draftRowsContainer = document.getElementById("draftRows");
    this.sessionHistory = document.getElementById("sessionHistory");
    this.btnFindMotifs = document.getElementById("btnFindMotifs");
    this.btnClearMotif = document.getElementById("btnClearMotif");
    this.btnAddDraftRow = document.getElementById("btnAddDraftRow");
    this.btnFinalizeSession = document.getElementById("btnFinalizeSession");
    this.finalizeSharePrompt = document.getElementById("finalizeSharePrompt");
    this.btnClearSlip = document.getElementById("btnClearSlip");
    this.slipProgress = document.getElementById("slipProgress");
    this.slipGuidance = document.getElementById("slipGuidance");
    this.latestDrawStatus = document.getElementById("latestDrawStatus");
    this.jackpotStatus = document.getElementById("jackpotStatus");
    this.btnPatterns = document.getElementById("btnPatterns");
    this.patternsPopover = document.getElementById("patternsPopover");
    this.btnAnnotate = document.getElementById("btnAnnotate");
    this.annotationToolbar = document.getElementById("annotationToolbar");
    this.composerCard = document.getElementById("composerCard");
    this.composerCard?.parentElement?.prepend(this.composerCard);
    this.btnSessions = document.getElementById("btnSessions");
    this.sessionsPanel = document.getElementById("sessionsPanel");
    this.btnCloseSessions = document.getElementById("btnCloseSessions");
    this.btnAboutAnalysis = document.getElementById("btnAboutAnalysis");
    this.analysisNotice = document.getElementById("analysisNotice");
    this.dataMenu = document.getElementById("dataMenu");
    this.btnZoomOut = document.getElementById("btnZoomOut");
    this.btnZoomReset = document.getElementById("btnZoomReset");
    this.btnZoomIn = document.getElementById("btnZoomIn");
    this.zoomLevel = document.getElementById("zoomLevel");
    this.btnTheme = document.getElementById("btnTheme");
  }

  loadTheme() {
    let savedTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') savedTheme = stored;
    } catch (_) {
      // The early document theme remains the safe fallback.
    }
    this.setTheme(savedTheme, false);
  }

  setTheme(theme, persist = true) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    this.theme = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    const nextLabel = nextTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    this.btnTheme?.setAttribute('aria-label', nextLabel);
    this.btnTheme?.setAttribute('title', nextLabel);
    this.btnTheme?.setAttribute('aria-pressed', String(nextTheme === 'dark'));
    window.cash5StudioNativeTheme?.(nextTheme);
    if (persist) {
      try { localStorage.setItem(THEME_KEY, nextTheme); } catch (_) { /* no-op */ }
    }
    requestAnimationFrame(() => this.connectionEngine?.render());
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  loadCachedJackpot() {
    try {
      const cached = JSON.parse(localStorage.getItem(JACKPOT_KEY) || 'null');
      if (cached && Number.isSafeInteger(cached.amount) && cached.amount > 0 && typeof cached.fetchedAt === 'string') {
        this.jackpot = {
          amount: cached.amount,
          display: `$${cached.amount.toLocaleString('en-US')}`,
          fetchedAt: cached.fetchedAt,
          source: String(cached.source || '')
        };
        this.jackpotIsStale = true;
      }
    } catch (_) {
      this.jackpot = null;
    }
  }

  cacheJackpot(jackpot) {
    try { localStorage.setItem(JACKPOT_KEY, JSON.stringify(jackpot)); } catch (_) { /* no-op */ }
  }

  loadInterfaceZoom() {
    let savedZoom = 1;
    try {
      const stored = Number(localStorage.getItem(INTERFACE_ZOOM_KEY));
      if (INTERFACE_ZOOM_STEPS.includes(stored)) savedZoom = stored;
    } catch (_) {
      // Local storage can be unavailable in hardened preview environments.
    }
    this.setInterfaceZoom(savedZoom, false);
  }

  setInterfaceZoom(value, persist = true) {
    const requested = Number(value);
    const closest = INTERFACE_ZOOM_STEPS.reduce((best, step) => (
      Math.abs(step - requested) < Math.abs(best - requested) ? step : best
    ), 1);
    this.interfaceZoom = closest;
    document.body.style.zoom = String(closest);
    document.body.classList.toggle('zoom-enlarged', closest >= 1.2);
    document.body.classList.toggle('zoom-extra', closest >= 1.4);
    if (this.zoomLevel) this.zoomLevel.textContent = `${Math.round(closest * 100)}%`;
    if (this.btnZoomOut) this.btnZoomOut.disabled = closest === INTERFACE_ZOOM_STEPS[0];
    if (this.btnZoomIn) this.btnZoomIn.disabled = closest === INTERFACE_ZOOM_STEPS[INTERFACE_ZOOM_STEPS.length - 1];
    requestAnimationFrame(() => this.connectionEngine?.render());
    if (persist) {
      try { localStorage.setItem(INTERFACE_ZOOM_KEY, String(closest)); } catch (_) { /* no-op */ }
    }
  }

  zoomInterface(direction) {
    const currentIndex = Math.max(0, INTERFACE_ZOOM_STEPS.indexOf(this.interfaceZoom || 1));
    const nextIndex = Math.max(0, Math.min(INTERFACE_ZOOM_STEPS.length - 1, currentIndex + direction));
    this.setInterfaceZoom(INTERFACE_ZOOM_STEPS[nextIndex]);
  }

  setupComponents() {
    if (!this.gridContainer || !this.svgOverlay) return;

    this.gridMatrix = new GridMatrix(this.gridContainer);
    this.connectionEngine = new ConnectionEngine(this.svgOverlay, this.gridContainer);

    this.gridMatrix.onCellClickCallback = (cellElement, cellId, digit) => {
      if (this.connectionEngine.activeTool === "select") {
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
      if (!this.manualLines.some(l => l.id === newLine.id)) {
        this.manualLines.push(newLine);
      }
      this.saveToLocalStorage();
      this.updateLines();
      this.colorSwatches.forEach(swatch => {
        swatch.classList.toggle("active", swatch.dataset.color === this.connectionEngine.selectedColor);
      });
    };

    this.connectionEngine.onLineRemovedCallback = (lineId) => {
      this.manualLines = this.manualLines.filter(l => l.id !== lineId);
      this.saveToLocalStorage();
      this.updateLines();
    };
  }

  bindEvents() {
    if (this.toolBtns) {
      this.toolBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          this.toolBtns.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          this.connectionEngine.setTool(btn.dataset.tool);
        });
      });
    }

    if (this.colorSwatches) {
      this.colorSwatches.forEach(swatch => {
        swatch.addEventListener("click", () => {
          this.colorSwatches.forEach(s => s.classList.remove("active"));
          swatch.classList.add("active");
          this.connectionEngine.setColor(swatch.dataset.color);
        });
      });
    }

    const completeConnectionButton = this.btnCompleteConnection
      || document.getElementById("btnCompleteConnection");
    if (completeConnectionButton) {
      completeConnectionButton.addEventListener("click", () => {
        const completed = this.connectionEngine.completeConnection();
        this.showToast(completed
          ? "Connection completed. Select a digit to create a new one."
          : "No connection is currently in progress.");
      });
    }

    const clearAllLinesButton = this.btnClearAllLines
      || document.getElementById("btnClearAllLines");
    if (clearAllLinesButton) {
      clearAllLinesButton.addEventListener("click", () => this.clearAllManualLines());
    }

    // Pattern Checkboxes
    if (this.chkMatches) {
      this.chkMatches.addEventListener("change", (e) => {
        this.patternSettings.showMatches = e.target.checked;
        this.updateState();
      });
    }
    if (this.chkVerticalRuns) {
      this.chkVerticalRuns.addEventListener("change", (e) => {
        this.patternSettings.showVerticalRuns = e.target.checked;
        this.updateState();
      });
    }
    if (this.chkDiagonalRuns) {
      this.chkDiagonalRuns.addEventListener("change", (e) => {
        this.patternSettings.showDiagonalRuns = e.target.checked;
        this.updateState();
      });
    }

    if (this.chkMathematicalSequences) {
      this.chkMathematicalSequences.addEventListener("change", (e) => {
        this.patternSettings.showMathematicalSequences = e.target.checked;
        this.updateState();
      });
    }

    if (this.chkDiagonalMathematicalSequences) {
      this.chkDiagonalMathematicalSequences.addEventListener("change", (e) => {
        this.patternSettings.showDiagonalMathematicalSequences = e.target.checked;
        this.updateState();
      });
    }

    if (this.chkSisterOutputSequences) {
      this.chkSisterOutputSequences.addEventListener("change", (e) => {
        this.patternSettings.showSisterOutputSequences = e.target.checked;
        this.updateState();
      });
    }

    if (this.chkLPatterns) {
      this.chkLPatterns.addEventListener("change", (e) => {
        this.patternSettings.showLPatterns = e.target.checked;
        this.updateState();
      });
    }

    if (this.chkTens) {
      this.chkTens.addEventListener("change", (e) => {
        this.patternSettings.showTens = e.target.checked;
        this.updateState();
      });
    }

    if (this.chkOnes) {
      this.chkOnes.addEventListener("change", (e) => {
        this.patternSettings.showOnes = e.target.checked;
        this.updateState();
      });
    }

    // File Action Buttons
    if (this.btnImportCsv && this.csvFileInput) {
      this.btnImportCsv.addEventListener("click", () => this.csvFileInput.click());
      this.csvFileInput.addEventListener("change", (e) => this.importCsvFile(e));
    }

    if (this.btnOpenProject && this.projectFileInput) {
      this.btnOpenProject.addEventListener("click", () => this.projectFileInput.click());
      this.projectFileInput.addEventListener("change", (e) => this.importProjectFile(e));
    }

    if (this.btnSaveProject) {
      this.btnSaveProject.addEventListener("click", () => this.exportProjectFile());
    }

    if (this.btnLoadSample) {
      this.btnLoadSample.addEventListener("click", () => this.loadSampleData());
    }

    if (this.btnFetchLive) {
      this.btnFetchLive.addEventListener("click", () => this.fetchLiveDraws());
    }

    this.btnZoomOut?.addEventListener("click", () => this.zoomInterface(-1));
    this.btnZoomIn?.addEventListener("click", () => this.zoomInterface(1));
    this.btnZoomReset?.addEventListener("click", () => this.setInterfaceZoom(1));
    this.btnTheme?.addEventListener("click", () => this.toggleTheme());

    this.btnClearSlip?.addEventListener("click", () => {
      this.workspace.slipNumbers = [null, null, null, null, null];
      this.workspace.slipTensFilters = [null, null, null, null, null];
      this.workspace.rowBuilder = [];
      this.renderCash5Workspace();
      this.saveToLocalStorage();
    });
    this.btnJumpToSlip?.addEventListener("click", () => {
      this.composerCard?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    this.btnPatterns?.addEventListener("click", () => {
      const shouldOpen = this.patternsPopover.hidden;
      this.patternsPopover.hidden = !shouldOpen;
      this.btnPatterns.setAttribute("aria-expanded", String(shouldOpen));
    });
    document.addEventListener("pointerdown", event => {
      if (!this.patternsPopover || this.patternsPopover.hidden) return;
      if (this.patternsPopover.contains(event.target) || this.btnPatterns?.contains(event.target)) return;
      this.patternsPopover.hidden = true;
      this.btnPatterns?.setAttribute("aria-expanded", "false");
    });

    this.btnAnnotate?.addEventListener("click", () => {
      const shouldOpen = this.annotationToolbar.hidden;
      this.annotationToolbar.hidden = !shouldOpen;
      this.btnAnnotate.setAttribute("aria-pressed", String(shouldOpen));
      if (!shouldOpen) {
        this.toolBtns.forEach(button => button.classList.toggle("active", button.dataset.tool === "select"));
        this.connectionEngine?.completeConnection();
        this.connectionEngine?.setTool("select");
      }
    });

    const setSessionsOpen = open => {
      if (!this.sessionsPanel) return;
      this.sessionsPanel.hidden = !open;
      this.btnSessions?.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
      if (open) this.btnCloseSessions?.focus();
    };
    this.setSessionsOpen = setSessionsOpen;
    this.btnSessions?.addEventListener("click", () => setSessionsOpen(true));
    this.btnCloseSessions?.addEventListener("click", () => setSessionsOpen(false));
    this.sessionsPanel?.querySelector("[data-close-sessions]")?.addEventListener("click", () => setSessionsOpen(false));
    document.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          this.zoomInterface(1);
        } else if (event.key === '-') {
          event.preventDefault();
          this.zoomInterface(-1);
        } else if (event.key === '0') {
          event.preventDefault();
          this.setInterfaceZoom(1);
        }
      }
      if (event.key === "Escape") {
        if (this.sessionsPanel && !this.sessionsPanel.hidden) setSessionsOpen(false);
        if (this.patternsPopover && !this.patternsPopover.hidden) {
          this.patternsPopover.hidden = true;
          this.btnPatterns?.setAttribute("aria-expanded", "false");
        }
      }
    });

    this.btnAboutAnalysis?.addEventListener("click", () => {
      const shouldOpen = this.analysisNotice.hidden;
      this.analysisNotice.hidden = !shouldOpen;
      this.btnAboutAnalysis.setAttribute("aria-expanded", String(shouldOpen));
    });

    this.dataMenu?.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => { this.dataMenu.open = false; });
    });

    this.bindWorkspaceEvents();
  }

  clearAllManualLines() {
    const lineCount = this.manualLines.length;
    this.connectionEngine.completeConnection();
    if (!lineCount) {
      this.showToast("There are no manual lines to clear.");
      return;
    }

    this.manualLines = [];
    this.saveToLocalStorage();
    this.updateLines();
    this.showToast(`Cleared ${lineCount} manual line${lineCount === 1 ? '' : 's'}.`);
  }

  loadSampleData(showToastMsg = true) {
    this.draws = [...SAMPLE_CASH_5];
    this.manualLines = [];
    this.applyFilters();

    if (showToastMsg) {
      this.showToast("Sample Cash 5 drawings restored.");
    }
  }

  async fetchLiveDraws() {
    this.btnFetchLive?.setAttribute("aria-busy", "true");
    this.showToast("Updating Cash 5 drawings and jackpot…");

    const update = await fetchLiveCash5Update();

    let drawCount = 0;
    if (update.draws.ok) {
      drawCount = update.draws.value.length;
      this.draws = update.draws.value;
      this.manualLines = [];
      this.applyFilters();
    }

    if (update.jackpot.ok) {
      this.jackpot = update.jackpot.value;
      this.jackpotIsStale = false;
      this.cacheJackpot(this.jackpot);
    } else if (this.jackpot) {
      this.jackpotIsStale = true;
    }
    this.updateJackpotStatus();

    if (drawCount && update.jackpot.ok) {
      this.showToast(`Updated ${drawCount} Cash 5 drawings. Jackpot ${this.jackpot.display}.`);
    } else if (drawCount) {
      this.showToast(`Updated ${drawCount} drawings. Jackpot update failed${this.jackpot ? '; showing the last known amount.' : '.'}`);
    } else if (update.jackpot.ok) {
      const detail = update.draws.error?.message || 'No drawings were returned.';
      this.showToast(`Jackpot updated to ${this.jackpot.display}. Draw update failed: ${detail || 'Network error'}`);
    } else {
      const drawError = update.draws.error?.message || 'No drawings were returned.';
      this.showToast(`Update failed: ${drawError || 'Network error'} ${this.jackpot ? 'Showing the last known jackpot.' : 'Jackpot unavailable.'}`);
    }

    this.btnFetchLive?.removeAttribute("aria-busy");
  }

  applyFilters() {
    this.filteredDraws = cash5AnalysisWindow(this.draws);
    this.researchDraws = cash5ResearchWindow(this.draws);
    this.workspace.motifSelections = [];
    this.workspace.motifMatches = [];
    this.workspace.sessions = scorePendingSessions(this.workspace.sessions, this.draws);
    this.updateState();
  }

  updateState() {
    const rowRoles = {};
    if (this.filteredDraws.length >= 2) {
      rowRoles[this.filteredDraws[this.filteredDraws.length - 2].id] = 'past';
      rowRoles[this.filteredDraws[this.filteredDraws.length - 1].id] = 'present';
    }
    if (this.gridMatrix) {
      this.gridMatrix.setDraws(this.filteredDraws, "cash5", {
        showTens: this.patternSettings.showTens,
        showOnes: this.patternSettings.showOnes,
        selectedCellIds: [],
        rowRoles,
        selectableContextRows: false
      });
      this.gridMatrix.setPositionHighlights(this.workspace.futureDigitMap);
    }

    this.updateLines();
    this.renderCash5Workspace();
    this.renderDigitRepeatSummary();
    this.updateLatestDrawStatus();
    this.updateJackpotStatus();
    this.saveToLocalStorage();
  }

  renderDigitRepeatSummary() {
    if (!this.digitRepeatSummary) return;
    const summary = buildDigitRepeatSummary(this.filteredDraws);
    const displayItem = item => item
      ? `<span class="repeat-summary-digit">${item.digit}${item.streak > 1 ? `<sup>${item.streak}</sup>` : ''}</span>`
      : '<span class="repeat-summary-empty">—</span>';
    const groups = [
      ["Latest repeats", summary.latestRepeats],
      ["Previous repeats", summary.previousRepeats],
      ["Cold digits", summary.coldDigits]
    ];
    this.digitRepeatSummary.innerHTML = groups.map(([label, items]) => `
      <div class="summary-group"><strong>${label}</strong><span class="summary-digits">${items.length ? items.map(displayItem).join("") : displayItem(null)}</span></div>
    `).join("");
  }

  updateLatestDrawStatus() {
    if (!this.latestDrawStatus) return;
    const latest = [...this.draws].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) {
      this.latestDrawStatus.textContent = "No draws loaded";
      return;
    }
    const date = new Date(`${latest.date}T12:00:00`);
    const label = Number.isNaN(date.getTime())
      ? latest.date
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    this.latestDrawStatus.textContent = `Latest draw ${label}`;
  }

  updateJackpotStatus() {
    if (!this.jackpotStatus) return;
    if (!this.jackpot) {
      this.jackpotStatus.textContent = 'Jackpot unavailable';
      this.jackpotStatus.removeAttribute('title');
      return;
    }
    this.jackpotStatus.textContent = `${this.jackpotIsStale ? 'Last known jackpot' : 'Est. jackpot'} ${this.jackpot.display}`;
    const timestamp = new Date(this.jackpot.fetchedAt);
    if (!Number.isNaN(timestamp.getTime())) {
      const label = timestamp.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      this.jackpotStatus.setAttribute('title', `Jackpot retrieved ${label} from the South Carolina Education Lottery.`);
    }
  }

  updateLines() {
    this.manualLines = normalizeManualConnectionChains(this.manualLines);
    this.autoLines = generateAutomatedPatterns(this.filteredDraws, this.patternSettings);
    if (this.connectionEngine) {
      this.connectionEngine.setLines(this.manualLines, this.autoLines);
    }
  }

  bindWorkspaceEvents() {
    if (this.btnClearFutureMap) {
      this.btnClearFutureMap.addEventListener('click', () => {
        this.workspace.futureDigitMap = [];
        this.workspace.motifMatches = [];
        this.workspace.activeFutureCell = null;
        this.activeDigitHighlight = null;
        this.gridMatrix?.setHighlightedDigit(null);
        this.gridMatrix?.setPositionHighlights([]);
        this.renderCash5Workspace();
        this.saveToLocalStorage();
      });
    }
    if (this.btnClearMotif) {
      this.btnClearMotif.addEventListener('click', () => {
        this.workspace.motifMatches = [];
        this.renderCash5Workspace();
        this.saveToLocalStorage();
      });
    }
    if (this.btnFindMotifs) {
      this.btnFindMotifs.addEventListener('click', () => {
        if (!this.workspace.futureDigitMap.length) {
          this.showToast('Map at least one digit on the Next Draw Board first.');
          return;
        }
        this.workspace.motifMatches = findBoardSimilarSequences(this.researchDraws, this.workspace.futureDigitMap);
        this.renderCash5Workspace();
        this.saveToLocalStorage();
      });
    }
    if (this.btnAddDraftRow) {
      this.btnAddDraftRow.addEventListener('click', () => {
        try {
          this.workspace.draftRows.push(createDraftRow(this.workspace.slipNumbers));
          this.workspace.slipNumbers = [null, null, null, null, null];
          this.workspace.slipTensFilters = [null, null, null, null, null];
          this.workspace.rowBuilder = [];
          this.renderCash5Workspace();
          this.saveToLocalStorage();
          this.showToast('Row saved. Build another row or finalize for the next draw.');
        } catch (error) {
          this.showToast(error.message);
        }
      });
    }
    if (this.btnFinalizeSession) {
      this.btnFinalizeSession.addEventListener('click', () => {
        try {
          const latestDraw = this.filteredDraws[this.filteredDraws.length - 1];
          const snapshot = finalizeSession(this.workspace, latestDraw);
          this.workspace.sessions.unshift(snapshot);
          this.recentFinalizedSessionId = snapshot.id;
          this.workspace.draftRows = [];
          this.workspace.slipNumbers = [null, null, null, null, null];
          this.workspace.slipTensFilters = [null, null, null, null, null];
          this.workspace.rowBuilder = [];
          this.renderCash5Workspace();
          this.saveToLocalStorage();
          this.showToast('Session finalized for the next draw.');
        } catch (error) {
          this.showToast(error.message);
        }
      });
    }
  }

  setSlipNumberForPosition(number, column) {
    const value = Number(number);
    const position = Number(column);
    if (!Number.isInteger(value) || value < 1 || value > 42
        || !Number.isInteger(position) || position < 0 || position > 4) return;
    this.workspace.slipNumbers[position] = value;
    this.workspace.rowBuilder = this.workspace.slipNumbers.filter(Number.isInteger);
    this.renderCash5Workspace();
    this.saveToLocalStorage();
  }

  renderCash5Workspace() {
    if (!this.cash5Workspace) return;

    const selections = this.workspace.futureDigitMap || [];
    const mappedKeys = new Set((this.workspace.futureDigitMap || []).map(item => `${item.column}:${item.digit}`));
    const successorRankings = rankHistoricalSuccessors(this.researchDraws);
    const successorCandidates = new Map(successorRankings.flatMap(result => (
      result.candidates.map(candidate => [`${result.column}:${candidate.digit}`, { ...candidate, result }])
    )));
    const patternRankings = rankPatternRecommendationsByColumn(this.researchDraws, 3);
    const patternCandidates = new Map(patternRankings.flatMap(result => (
      result.candidates.map(candidate => [`${result.column}:${candidate.digit}`, candidate])
    )));
    this.gridMatrix?.setPositionHighlights(selections);

    if (this.futureDigitGrid) {
      this.futureDigitGrid.classList.add('pattern-recommendation-grid');
      this.futureDigitGrid.innerHTML = `
        <div class="future-grid-corner">Rank</div>
        ${Array.from({ length: 5 }, (_, column) => `<div class="future-space-head">Ball ${column + 1}</div>`).join('')}
        ${Array.from({ length: 3 }, (_, index) => {
          const rank = index + 1;
          return `
          <div class="pattern-rank-label">#${rank}</div>
          ${Array.from({ length: 5 }, (_, column) => {
            const result = patternRankings.find(item => item.column === column);
            const candidate = result?.candidates.find(item => item.rank === rank);
            if (!candidate) return '<div class="pattern-recommendation-missing">—</div>';
            const digit = candidate.digit;
            const key = `${column}:${digit}`;
            const mapped = mappedKeys.has(key);
            const active = this.workspace.activeFutureCell?.column === column && this.workspace.activeFutureCell?.digit === digit;
            const backtestText = candidate.walkForwardSufficient
              ? `${Math.round(candidate.walkForwardRate * 100)}% walk-forward hit rate (${candidate.walkForwardHits} of ${candidate.walkForwardTrials})`
              : `insufficient backtest sample (${candidate.walkForwardTrials} of 25 required trials)`;
            const detail = `Rank ${rank} pattern recommendation for Ball ${column + 1}: ending ${digit}. Pattern score ${candidate.score} of 100; ${backtestText}.`;
            return `<button class="pattern-recommendation-cell rank-${rank} ${mapped ? `mapped position-${column + 1}` : ''} ${active ? 'active' : ''}"
              data-future-column="${column}" data-future-digit="${digit}" aria-pressed="${mapped}"
              title="${escapeHTML(detail)}" aria-label="${escapeHTML(`Select ${detail}`)}">
              <b>${digit}</b>
            </button>`;
          }).join('')}`;
        }).join('')}`;
    }

    if (this.futureAllDigitGrid) {
      this.futureAllDigitGrid.innerHTML = `
        <div class="future-grid-corner">Digit</div>
        ${Array.from({ length: 5 }, (_, column) => `<div class="future-space-head">Ball ${column + 1}</div>`).join('')}
        ${Array.from({ length: 10 }, (_, digit) => `
          <div class="future-digit-label">${digit}</div>
          ${Array.from({ length: 5 }, (_, column) => {
            const key = `${column}:${digit}`;
            const mapped = mappedKeys.has(key);
            const active = this.workspace.activeFutureCell?.column === column && this.workspace.activeFutureCell?.digit === digit;
            const successor = successorCandidates.get(key);
            const rankClass = successor ? `successor-rank-${successor.rank}` : '';
            const rankTitle = successor
              ? `${SUCCESSOR_RANK_LABELS[successor.rank - 1]}: digit ${digit} followed present digit ${successor.result.presentDigit} in Ball ${column + 1} in ${successor.count} of ${successor.result.totalTransitions} matching transitions. Most recent transition: ${successor.mostRecentTransitionDate}.`
              : '';
            return `<button class="future-map-cell ${rankClass} ${mapped ? `mapped position-${column + 1}` : ''} ${active ? 'active' : ''}"
              data-future-column="${column}" data-future-digit="${digit}" aria-pressed="${mapped}"
              ${rankTitle ? `title="${escapeHTML(rankTitle)}"` : ''}
              aria-label="${escapeHTML(`Select ones digit ${digit} in Ball ${column + 1}.${rankTitle ? ` ${rankTitle}` : ''}`)}">
              <b>${digit}</b>
            </button>`;
          }).join('')}`).join('')}`;
    }

    [this.futureDigitGrid, this.futureAllDigitGrid].filter(Boolean).forEach(grid => {
      grid.querySelectorAll('[data-future-column]').forEach(button => {
        button.addEventListener('click', () => {
          const column = Number(button.dataset.futureColumn);
          const digit = Number(button.dataset.futureDigit);
          const wasMapped = this.workspace.futureDigitMap.some(item => item.column === column && item.digit === digit);
          this.workspace.futureDigitMap = selectFutureDigit(this.workspace.futureDigitMap, column, digit);
          this.workspace.motifMatches = [];
          this.workspace.activeFutureCell = wasMapped
            ? (this.workspace.futureDigitMap[0] ? { ...this.workspace.futureDigitMap[0] } : null)
            : { column, digit };
          this.gridMatrix?.setPositionHighlights(this.workspace.futureDigitMap);
          this.renderCash5Workspace();
          this.saveToLocalStorage();
        });
      });
    });

    if (this.futureMapInspector) {
      const active = this.workspace.activeFutureCell;
      this.futureMapInspector.classList.toggle('empty-state', !active);
      if (!active) {
        this.futureMapInspector.innerHTML = '<strong>Start with a position.</strong><span> Choose a digit-space square to inspect recent context.</span>';
      } else {
        const evidence = futureCellEvidence(this.researchDraws, this.workspace.motifMatches, active.column, active.digit);
        const isMapped = mappedKeys.has(`${active.column}:${active.digit}`);
        const successor = successorCandidates.get(`${active.column}:${active.digit}`);
        const recommendation = patternCandidates.get(`${active.column}:${active.digit}`);
        const successorResult = successorRankings.find(result => result.column === active.column);
        const successorDetail = successor
          ? `<span class="successor-inspector-rank rank-${successor.rank}"><b>${successor.rank === 4 ? 'HM' : `#${successor.rank}`}</b> ${SUCCESSOR_RANK_LABELS[successor.rank - 1]}<br><small>${successor.count} of ${successorResult.totalTransitions} matching transitions · latest ${escapeHTML(successor.mostRecentTransitionDate)}</small></span>`
          : `<span><b>—</b> successor rank<br><small>${successorResult?.totalTransitions || 0} matching transitions</small></span>`;
        const recommendationDetail = recommendation
          ? `<span class="pattern-inspector-summary">
              <b>#${recommendation.rank} · ${recommendation.score}/100 pattern score</b><br>
              <small class="${recommendation.walkForwardSufficient ? 'pattern-backtest-sufficient' : 'pattern-backtest-limited'}">
                ${recommendation.walkForwardSufficient
                  ? `${Math.round(recommendation.walkForwardRate * 100)}% walk-forward hit rate · ${recommendation.walkForwardHits} of ${recommendation.walkForwardTrials} exact Ball outcomes`
                  : `Insufficient backtest sample · ${recommendation.walkForwardTrials} of 25 required Ball-position trials`}
              </small>
            </span>`
          : '';
        const patternEvidence = recommendation
          ? `<details open class="future-evidence-expander pattern-evidence-expander">
              <summary>${recommendation.familyCount} supporting pattern ${recommendation.familyCount === 1 ? 'family' : 'families'} · ${recommendation.signalCount} signals</summary>
              <ul class="pattern-support-list">${recommendation.families.map(family => `
                <li><b>${escapeHTML(family.label)}</b><span>${Math.round(family.reliability * 100)}% smoothed signal precision</span>
                  <small>${family.trials ? `${family.hits} of ${family.trials} historical signals hit` : 'No prior trials; Laplace-smoothed starting estimate'}${family.examples.length ? ` · ${family.examples.map(escapeHTML).join(' · ')}` : ''}</small>
                </li>`).join('')}</ul>
            </details>`
          : '';
        this.futureMapInspector.innerHTML = `
          <div class="future-inspector-head">
            <div><span>Focused selection</span><h4>Digit ${active.digit} in Ball ${active.column + 1}</h4></div>
            <span class="map-status ${isMapped ? 'mapped' : ''}">${isMapped ? 'On your map' : 'Not mapped'}</span>
          </div>
          <div class="future-inspector-stats">
            <span><b>${evidence.windowCount}</b> times in this space<br><small>${this.researchDraws.length} research draws</small></span>
            <span><b>${evidence.motifCount}</b> pattern futures<br><small>after motif search</small></span>
            ${recommendationDetail}
            ${successorDetail}
          </div>
          ${patternEvidence}
          <details open class="future-evidence-expander">
            <summary>Full numbers ending in ${active.digit}</summary>
            <div class="future-full-number-grid">${evidence.fullNumbers.map(item => `
              <button data-map-full-number="${item.number}" class="future-full-number ${this.workspace.slipNumbers[active.column] === item.number ? 'chosen' : ''}">
                <span class="future-full-number-value">${cash5NumberMarkup(item.number)}</span><small>seen here ${item.spaceCount}×</small>
              </button>`).join('')}</div>
          </details>
          <p class="future-inspector-note">Choose a full number to place it directly in Ball ${active.column + 1} of the slip builder.</p>`;
        this.futureMapInspector.querySelectorAll('[data-map-full-number]').forEach(button => {
          button.addEventListener('click', () => this.setSlipNumberForPosition(button.dataset.mapFullNumber, active.column));
        });
      }
    }

    if (this.motifSelectionSummary) {
      this.motifSelectionSummary.classList.toggle('empty-state', selections.length === 0);
      this.motifSelectionSummary.innerHTML = selections.length
        ? Array.from({ length: 5 }, (_, column) => {
          const mapped = selections.find(item => item.column === column);
          return mapped ? `<div><strong>Ball ${column + 1}</strong><span class="selection-square position-${column + 1}">${mapped.digit}</span></div>` : '';
        }).join('')
        : 'Map at least one digit on the Next Draw Board.';
    }

    if (this.btnFindMotifs) this.btnFindMotifs.disabled = selections.length === 0;

    if (this.motifResults) {
      if (!this.workspace.motifMatches.length) {
        this.motifResults.innerHTML = '<div class="empty-state">No motif search run yet.</div>';
      } else {
        this.motifResults.innerHTML = this.workspace.motifMatches.map(match => `
          <div class="motif-result ${match.kind}">
            <div class="motif-result-head"><span>${match.kind === 'exact' ? 'Exact position match' : `${Math.round(match.coverage * 100)}% similar`}</span><small>${escapeHTML(match.historicalMatch.date)} → ${escapeHTML(match.historicalFuture.date)}</small></div>
            <div class="motif-sequence motif-square-sequence">
              <span class="mini-square-row"><small>Similar</small>${match.historicalMatch.numbers.map(number => `<i>${cash5NumberMarkup(number)}</i>`).join('')}</span>
              <span class="mini-square-row future"><small>Next</small>${match.historicalFuture.numbers.map((number, column) => `<button data-use-sequence-number="${number}" data-sequence-column="${column}" title="Use ${number} in Ball ${column + 1}">${cash5NumberMarkup(number)}</button>`).join('')}</span>
            </div>
            <ul>${match.reasons.slice(0, 5).map(reason => `<li>${escapeHTML(reason)}</li>`).join('')}</ul>
          </div>
        `).join('');
        this.motifResults.querySelectorAll('[data-use-sequence-number]').forEach(button => {
          button.addEventListener('click', () => this.setSlipNumberForPosition(button.dataset.useSequenceNumber, button.dataset.sequenceColumn));
        });
      }
    }

    const heat = classifyOnesHeat(this.researchDraws);
    if (this.heatTiers) {
      this.heatTiers.innerHTML = heat.map(item => (
        `<span class="heat-digit ${item.tier}" title="Digit ${item.digit} appeared ${item.count} times"><b>${item.digit}</b><span>${item.count}x</span><small>${item.tier}</small></span>`
      )).join('');
    }

    const focusedMapping = selections.find(item => item.column === this.workspace.activeFutureCell?.column
      && item.digit === this.workspace.activeFutureCell?.digit) || selections[0] || null;
    if (focusedMapping) this.workspace.activeFutureCell = { ...focusedMapping };

    if (this.candidateDigitsContainer) {
      this.candidateDigitsContainer.innerHTML = Array.from({ length: 5 }, (_, column) => {
        const mapped = selections.find(item => item.column === column);
        const active = mapped && focusedMapping?.column === column;
        return `<button class="position-evidence-tab position-${column + 1} ${active ? 'active' : ''}" data-evidence-column="${column}" ${mapped ? '' : 'disabled'} aria-pressed="${Boolean(active)}">
          <small>Ball ${column + 1}</small><strong>${mapped ? mapped.digit : '—'}</strong>
        </button>`;
      }).join('');
      this.candidateDigitsContainer.querySelectorAll('[data-evidence-column]:not([disabled])').forEach(button => {
        button.addEventListener('click', () => {
          const mapped = selections.find(item => item.column === Number(button.dataset.evidenceColumn));
          if (!mapped) return;
          this.workspace.activeFutureCell = { ...mapped };
          this.renderCash5Workspace();
          this.saveToLocalStorage();
        });
      });
    }

    if (this.numberEvidence) {
      const evidence = focusedMapping
        ? buildNumberEvidence(focusedMapping.digit, this.researchDraws, this.workspace.motifMatches, [focusedMapping.column])
        : [];
      this.numberEvidence.classList.toggle('empty-state', !focusedMapping);
      const maxPattern = Math.max(...evidence.map(item => item.patternSignal), 1);
      const maxPosition = Math.max(...evidence.map(item => item.positionSignal), 1);
      const maxFrequency = Math.max(...evidence.map(item => item.frequencySignal), 1);
      this.numberEvidence.innerHTML = !focusedMapping ? 'Map a digit on the Next Draw Board to inspect its full-number evidence.' : evidence.map((item, index) => `
        <div class="number-card ${item.historyFitTier} ${this.workspace.slipNumbers[focusedMapping.column] === item.number ? 'chosen' : ''}">
          <div class="number-card-value future-number-square compact">${cash5NumberMarkup(item.number)}</div>
          <div class="number-card-content">
            <div class="number-card-rank"><strong>#${index + 1} · ${item.historyFitTier === 'strong' ? 'Strong' : item.historyFitTier === 'mixed' ? 'Mixed' : 'Limited'} history fit</strong><span>${item.historyFit}% relative</span></div>
            <div class="signal-meter pattern"><span>Pattern</span><i><b style="width:${Math.round(item.patternSignal / maxPattern * 100)}%"></b></i><em>${item.motifFutureCount}×</em></div>
            <div class="signal-meter position"><span>Position</span><i><b style="width:${Math.round(item.positionSignal / maxPosition * 100)}%"></b></i><em>${item.sameColumnCount + item.sisterColumnCount}×</em></div>
            <div class="signal-meter frequency"><span>Recent</span><i><b style="width:${Math.round(item.frequencySignal / maxFrequency * 100)}%"></b></i><em>${item.frequency}×</em></div>
            <p>${item.mostRecentRowsAgo === null ? `Not seen in the ${this.researchDraws.length}-draw research window` : item.mostRecentRowsAgo === 0 ? 'Seen in the latest draw' : `Last seen ${item.mostRecentRowsAgo} draws ago`}</p>
          </div>
          <button class="mini-btn" data-use-evidence-number="${item.number}">${this.workspace.slipNumbers[focusedMapping.column] === item.number ? 'Using' : `Use in Ball ${focusedMapping.column + 1}`}</button>
        </div>
      `).join('');
      this.numberEvidence.querySelectorAll('[data-use-evidence-number]').forEach(button => {
        button.addEventListener('click', () => this.setSlipNumberForPosition(button.dataset.useEvidenceNumber, focusedMapping.column));
      });
    }

    this.renderComposer();
    this.renderSessionHistory();
  }

  renderComposer() {
    const legacyNumbers = Array.isArray(this.workspace.rowBuilder)
      ? this.workspace.rowBuilder.filter(Number.isInteger).sort((a, b) => a - b)
      : [];
    if (!Array.isArray(this.workspace.slipNumbers) || this.workspace.slipNumbers.length !== 5) {
      this.workspace.slipNumbers = Array.from({ length: 5 }, (_, index) => legacyNumbers[index] ?? null);
    }
    const slip = this.workspace.slipNumbers;
    if (!Array.isArray(this.workspace.slipTensFilters) || this.workspace.slipTensFilters.length !== 5) {
      this.workspace.slipTensFilters = [null, null, null, null, null];
    }
    const tensFilters = this.workspace.slipTensFilters;
    const filledNumbers = slip.filter(Number.isInteger);
    const mappedDigitByColumn = new Map((this.workspace.futureDigitMap || []).map(item => [item.column, item.digit]));
    const mappedDigitsByPosition = Array.from({ length: 5 }, (_, column) => mappedDigitByColumn.get(column) ?? null);
    const tensRecommendations = recommendTensBands(this.filteredDraws, {
      mappedDigits: mappedDigitsByPosition,
      tensFilters,
      fixedNumbers: slip
    });
    const isComplete = filledNumbers.length === 5
      && new Set(filledNumbers).size === 5
      && filledNumbers.every((number, index) => index === 0 || number > filledNumbers[index - 1])
      && slip.every((number, index) => !mappedDigitByColumn.has(index) || number % 10 === mappedDigitByColumn.get(index))
      && slip.every((number, index) => !Number.isInteger(tensFilters[index]) || tensDigitForNumber(number) === tensFilters[index]);

    if (this.rowBuilderContainer) {
      this.rowBuilderContainer.innerHTML = Array.from({ length: 5 }, (_, index) => {
        const current = slip[index];
        const previousIndex = Array.from({ length: index }, (_, offset) => index - offset - 1)
          .find(position => Number.isInteger(slip[position]));
        const nextIndex = Array.from({ length: 4 - index }, (_, offset) => index + offset + 1)
          .find(position => Number.isInteger(slip[position]));
        const previous = previousIndex === undefined ? null : slip[previousIndex];
        const next = nextIndex === undefined ? null : slip[nextIndex];
        const mappedDigits = (this.workspace.futureDigitMap || [])
          .filter(item => item.column === index)
          .map(item => item.digit)
          .sort((a, b) => a - b);
        const tensFilter = Number.isInteger(tensFilters[index]) ? tensFilters[index] : null;
        const recommendation = tensRecommendations[index];
        const recommendationAvailable = Boolean(recommendation.primary?.available);
        const minimum = Number.isInteger(previous) ? previous + (index - previousIndex) : index + 1;
        const maximum = Number.isInteger(next) ? next - (nextIndex - index) : 42 - (4 - index);
        const available = Array.from({ length: 42 }, (_, numberIndex) => numberIndex + 1)
          .filter(number => number >= minimum && number <= maximum)
          .filter(number => mappedDigits.length === 0 || mappedDigits.includes(number % 10))
          .filter(number => tensFilter === null || tensDigitForNumber(number) === tensFilter)
          .filter(number => {
            const proposedNumbers = [...slip];
            proposedNumbers[index] = number;
            return hasAvailableOrderedSlip({
              mappedDigits: mappedDigitsByPosition,
              tensFilters,
              fixedNumbers: proposedNumbers
            });
          });
        const currentMatchesMap = !Number.isInteger(current) || mappedDigits.length === 0 || mappedDigits.includes(current % 10);
        const currentMatchesTens = !Number.isInteger(current) || tensFilter === null || tensDigitForNumber(current) === tensFilter;
        const currentIsUnique = !Number.isInteger(current) || slip.filter(number => number === current).length === 1;
        const currentIsOrdered = !Number.isInteger(current)
          || slip.slice(0, index).every(number => !Number.isInteger(number) || number < current)
            && slip.slice(index + 1).every(number => !Number.isInteger(number) || number > current);
        const currentIsValid = currentMatchesMap && currentMatchesTens && currentIsUnique && currentIsOrdered;
        const options = [...new Set([...(Number.isInteger(current) ? [current] : []), ...available])].sort((a, b) => a - b);
        const helper = mappedDigits.length
          ? `Showing numbers ending in ${mappedDigits.join(', ')}`
          : `All valid numbers ${minimum}–${maximum}`;
        const invalidMessage = !currentIsUnique ? `Number ${current} is already used in another Ball position.`
          : !currentIsOrdered ? 'Numbers must increase from Ball 1 through Ball 5.'
            : `Current ${current} does not match the updated filters; choose again or change a filter.`;
        return `<div class="slip-slot ${Number.isInteger(current) ? 'filled' : ''} ${currentIsValid ? '' : 'invalid'}">
          <span class="slip-slot-head"><strong>Ball ${index + 1}</strong>${mappedDigits.length ? `<span class="mapped-ending position-${index + 1}"><small>Mapped ending</small><b>${mappedDigits[0]}</b></span>` : '<span class="no-mapped-ending">No digit filter</span>'}</span>
          <div class="fuzzy-recommendation">
            <span><b>${recommendationAvailable ? recommendation.primary.label : 'No available tens range'}</b><small>${recommendationAvailable ? `${recommendation.primary.confidence} · ${recommendation.primary.reason}` : 'Change another Ball filter or mapped ending'}</small></span>
            <button type="button" data-use-tens="${recommendation.primary.digit}" data-tens-position="${index}" aria-label="Use ${recommendation.primary.label} recommendation for Ball ${index + 1}" aria-pressed="${tensFilter === recommendation.primary.digit}" ${recommendationAvailable ? '' : 'disabled'}>${tensFilter === recommendation.primary.digit ? 'Using' : 'Use'}</button>
          </div>
          <label class="slip-field-label">Tens range
            <select class="tens-filter-select" data-slip-tens="${index}" aria-label="Tens range for Ball ${index + 1}">
              <option value="">Any tens</option>
              ${TENS_BANDS.map(band => {
                const rankedBand = recommendation.ranked.find(item => item.digit === band.digit);
                const unavailable = !rankedBand?.available;
                const suffix = unavailable ? ' — Unavailable' : band.digit === recommendation.primary.digit
                  ? ` — ${recommendation.primary.confidence}` : band.digit === recommendation.alternate?.digit ? ' — Alternate' : '';
                return `<option value="${band.digit}" ${band.digit === tensFilter ? 'selected' : ''} ${unavailable ? 'disabled' : ''}>${band.label}${suffix}</option>`;
              }).join('')}
            </select>
          </label>
          <label class="slip-field-label">Full number
          <select data-slip-position="${index}" aria-label="Full number for Ball ${index + 1}">
            <option value="">Choose…</option>
            ${options.map(number => `<option value="${number}" ${number === current ? 'selected' : ''}>${number}</option>`).join('')}
          </select>
          </label>
          <small>${currentIsValid ? `${helper}${tensFilter === null ? '' : ` in ${TENS_BANDS.find(band => band.digit === tensFilter)?.label}`}.${recommendation.alternate ? ` Alternate: ${recommendation.alternate.label}.` : ''}` : invalidMessage}</small>
        </div>`;
      }).join('');

      this.rowBuilderContainer.querySelectorAll('[data-slip-tens]').forEach(select => {
        select.addEventListener('change', () => {
          const position = Number(select.dataset.slipTens);
          const tens = select.value === '' ? null : Number(select.value);
          this.workspace.slipTensFilters[position] = tens;
          const current = this.workspace.slipNumbers[position];
          if (Number.isInteger(current) && tens !== null && tensDigitForNumber(current) !== tens) this.workspace.slipNumbers[position] = null;
          this.workspace.rowBuilder = this.workspace.slipNumbers.filter(Number.isInteger);
          this.renderCash5Workspace();
          this.saveToLocalStorage();
        });
      });
      this.rowBuilderContainer.querySelectorAll('[data-use-tens]').forEach(button => {
        button.addEventListener('click', () => {
          const position = Number(button.dataset.tensPosition);
          const tens = Number(button.dataset.useTens);
          this.workspace.slipTensFilters[position] = tens;
          const current = this.workspace.slipNumbers[position];
          if (Number.isInteger(current) && tensDigitForNumber(current) !== tens) this.workspace.slipNumbers[position] = null;
          this.workspace.rowBuilder = this.workspace.slipNumbers.filter(Number.isInteger);
          this.renderCash5Workspace();
          this.saveToLocalStorage();
        });
      });

      this.rowBuilderContainer.querySelectorAll('[data-slip-position]').forEach(select => {
        select.addEventListener('change', () => {
          const position = Number(select.dataset.slipPosition);
          const value = select.value === '' ? null : Number(select.value);
          this.workspace.slipNumbers[position] = value;
          this.workspace.rowBuilder = this.workspace.slipNumbers.filter(Number.isInteger);
          this.renderCash5Workspace();
          this.saveToLocalStorage();
        });
      });
    }
    if (this.slipProgress) {
      this.slipProgress.textContent = isComplete ? 'Ready to add' : `${filledNumbers.length} of 5 selected`;
      this.slipProgress.classList.toggle('complete', isComplete);
    }
    if (this.slipGuidance) {
      this.slipGuidance.textContent = isComplete
        ? `Slip ready: ${filledNumbers.join(' · ')}`
        : 'Choose one full number in each position. The menus prevent duplicates and out-of-order rows.';
    }
    if (this.btnAddDraftRow) this.btnAddDraftRow.disabled = !isComplete;

    if (this.draftRowsContainer) {
      const rows = this.workspace.draftRows;
      this.draftRowsContainer.classList.toggle('empty-state', rows.length === 0);
      this.draftRowsContainer.innerHTML = rows.length ? rows.map(row => `
        <div class="draft-row" data-row-id="${escapeHTML(row.id)}">
          <div class="ticket-numbers">${row.numbers.map(number => `<span>${number}</span>`).join('')}</div>
          <select data-row-label="${escapeHTML(row.id)}">
            ${[
              ['strong', 'High confidence'],
              ['uncertain', 'Keep for review'],
              ['ugly', 'Low confidence']
            ].map(([value, label]) => `<option value="${value}" ${row.label === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <input type="text" data-row-note="${escapeHTML(row.id)}" value="${escapeHTML(row.note)}" placeholder="Optional note about this slip">
          <button class="mini-btn" data-edit-row="${escapeHTML(row.id)}">Edit numbers</button>
          <button class="mini-btn danger" data-delete-row="${escapeHTML(row.id)}">Delete</button>
        </div>
      `).join('') : 'No saved rows yet.';
      this.draftRowsContainer.querySelectorAll('[data-row-label]').forEach(select => {
        select.addEventListener('change', () => {
          const row = this.workspace.draftRows.find(item => item.id === select.dataset.rowLabel);
          if (row) row.label = select.value;
          this.saveToLocalStorage();
        });
      });
      this.draftRowsContainer.querySelectorAll('[data-row-note]').forEach(input => {
        input.addEventListener('change', () => {
          const row = this.workspace.draftRows.find(item => item.id === input.dataset.rowNote);
          if (row) row.note = input.value;
          this.saveToLocalStorage();
        });
      });
      this.draftRowsContainer.querySelectorAll('[data-edit-row]').forEach(button => {
        button.addEventListener('click', () => {
          const row = this.workspace.draftRows.find(item => item.id === button.dataset.editRow);
          if (!row) return;
          this.workspace.slipNumbers = [...row.numbers];
          this.workspace.slipTensFilters = [null, null, null, null, null];
          this.workspace.rowBuilder = [...row.numbers];
          this.workspace.draftRows = this.workspace.draftRows.filter(item => item.id !== row.id);
          this.renderCash5Workspace();
          this.saveToLocalStorage();
          this.composerCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          this.showToast('Slip loaded into the five number menus. Make changes, then add it again.');
        });
      });
      this.draftRowsContainer.querySelectorAll('[data-delete-row]').forEach(button => {
        button.addEventListener('click', () => {
          this.workspace.draftRows = this.workspace.draftRows.filter(item => item.id !== button.dataset.deleteRow);
          this.renderComposer();
          this.saveToLocalStorage();
        });
      });
    }
    if (this.btnFinalizeSession) this.btnFinalizeSession.disabled = this.workspace.draftRows.length === 0;
    this.renderFinalizeSharePrompt();
  }

  renderFinalizeSharePrompt() {
    if (!this.finalizeSharePrompt) return;
    const session = this.workspace.sessions.find(item => item.id === this.recentFinalizedSessionId);
    this.finalizeSharePrompt.hidden = !session;
    if (!session) {
      this.finalizeSharePrompt.innerHTML = '';
      return;
    }
    const shareAvailable = typeof window.cash5StudioNativeShare === 'function';
    this.finalizeSharePrompt.innerHTML = `
      <div><strong>${session.rows.length} row${session.rows.length === 1 ? '' : 's'} finalized for the next draw.</strong><span>Your dated session is saved.</span></div>
      <div class="inline-actions">
        <button class="btn btn-primary" type="button" data-copy-finalized>Copy slips</button>
        ${shareAvailable ? '<button class="btn btn-secondary" type="button" data-share-finalized>Share…</button>' : ''}
        <button class="text-btn" type="button" data-dismiss-finalized>Dismiss</button>
      </div>`;
    this.finalizeSharePrompt.querySelector('[data-copy-finalized]')?.addEventListener('click', async () => {
      const copied = await this.copyText(formatSessionForMessage(session));
      this.showToast(copied ? 'Formatted slips copied.' : 'Copy failed.');
    });
    this.finalizeSharePrompt.querySelector('[data-share-finalized]')?.addEventListener('click', () => this.shareSession(session));
    this.finalizeSharePrompt.querySelector('[data-dismiss-finalized]')?.addEventListener('click', () => {
      this.recentFinalizedSessionId = null;
      this.renderFinalizeSharePrompt();
    });
  }

  renderSessionHistory() {
    if (!this.sessionHistory) return;
    const sessions = this.workspace.sessions;
    this.sessionHistory.classList.toggle('empty-state', sessions.length === 0);
    this.sessionHistory.innerHTML = sessions.length ? sessions.map(session => `
      <div class="session-card ${session.status}">
        <div class="session-head"><strong>${escapeHTML(session.baselineDate)} → next draw</strong><span>${session.status}</span></div>
        <div class="session-meta">Locked ${escapeHTML(new Date(session.finalizedAt).toLocaleString())} · ${session.rows.length} row${session.rows.length === 1 ? '' : 's'}</div>
        <div class="session-rows">${session.rows.map((row, index) => `
          <div class="session-row">
            <strong>Row ${index + 1}</strong>
            <div class="ticket-numbers">${row.numbers.map(number => `<span>${String(number).padStart(2, '0')}</span>`).join('')}</div>
            ${row.note ? `<small>${escapeHTML(row.note)}</small>` : ''}
          </div>`).join('')}</div>
        ${session.result ? `
          <div class="result-numbers">Result: ${session.result.numbers.join(' · ')}</div>
          <div class="score-line">Rows: ${session.result.rowScores.map(score => `<b>${score.hits}/5</b>`).join(' ')}</div>
        ` : '<div class="pending-result">Waiting for a newer imported or fetched drawing.</div>'}
        <div class="session-actions">
          <button class="mini-btn" data-copy-session="${escapeHTML(session.id)}">Copy for iMessage</button>
          ${typeof window.cash5StudioNativeShare === 'function' ? `<button class="mini-btn" data-share-session="${escapeHTML(session.id)}">Share…</button>` : ''}
          <button class="mini-btn" data-edit-session="${escapeHTML(session.id)}">${session.result ? 'Reuse in Ticket Builder' : 'Edit in Ticket Builder'}</button>
        </div>
      </div>
    `).join('') : 'No locked sessions yet.';
    this.sessionHistory.querySelectorAll('[data-copy-session]').forEach(button => {
      button.addEventListener('click', async () => {
        const session = this.workspace.sessions.find(item => item.id === button.dataset.copySession);
        const text = formatSessionForMessage(session);
        if (!text) return;
        const copied = await this.copyText(text);
        this.showToast(copied ? 'Formatted slips copied. Paste them into iMessage.' : 'Copy failed. Select the rows and copy them manually.');
      });
    });
    this.sessionHistory.querySelectorAll('[data-edit-session]').forEach(button => {
      button.addEventListener('click', () => {
        const session = this.workspace.sessions.find(item => item.id === button.dataset.editSession);
        const wasScored = Boolean(session?.result);
        this.workspace = editSessionInBuilder(this.workspace, button.dataset.editSession);
        this.renderCash5Workspace();
        this.saveToLocalStorage();
        this.setSessionsOpen?.(false);
        this.composerCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        this.showToast(wasScored ? 'Rows copied into Ticket Builder.' : 'Session unlocked in Ticket Builder. Edit and finalize it again when ready.');
      });
    });
    this.sessionHistory.querySelectorAll('[data-share-session]').forEach(button => {
      button.addEventListener('click', () => {
        const session = this.workspace.sessions.find(item => item.id === button.dataset.shareSession);
        if (session) this.shareSession(session);
      });
    });
  }

  async shareSession(session) {
    const text = formatSessionForMessage(session);
    if (!text || typeof window.cash5StudioNativeShare !== 'function') return;
    try {
      await window.cash5StudioNativeShare(text);
    } catch (error) {
      this.showToast(`Share failed: ${error?.message || 'Native share is unavailable.'}`);
    }
  }

  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    }
  }

  saveToLocalStorage() {
    const projectData = {
      appName: "Cash 5 Studio",
      version: 3,
      draws: this.draws,
      manualLines: this.manualLines,
      workspace: this.workspace
    };
    try {
      localStorage.setItem("cash5studio_current_project", JSON.stringify(projectData));
    } catch (e) {}
  }

  loadFromLocalStorage() {
    const current = localStorage.getItem("cash5studio_current_project");
    const raw = current || localStorage.getItem("lottoplus_current_project");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const valRes = validateProject(data);
      if (valRes.valid) {
        this.draws = valRes.validDraws;
        this.manualLines = valRes.manualLines;
        this.workspace = valRes.workspace ? { ...createWorkspaceState(), ...valRes.workspace } : createWorkspaceState();
        if (!current) this.saveToLocalStorage();
      }
    } catch (e) {}
  }

  exportProjectFile() {
    const project = {
      appName: "Cash 5 Studio",
      version: 3,
      draws: this.draws,
      manualLines: this.manualLines,
      workspace: this.workspace
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cash5-studio_${new Date().toISOString().split('T')[0]}.cash5studio`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("Cash 5 Studio project saved.");
  }

  importProjectFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const project = JSON.parse(evt.target.result);
        const valRes = validateProject(project);
        if (!valRes.valid) {
          this.showToast(`Import failed: ${valRes.errors[0] || 'Invalid project structure'}`);
          return;
        }

        this.draws = valRes.validDraws;
        this.manualLines = valRes.manualLines;
        this.workspace = valRes.workspace ? { ...createWorkspaceState(), ...valRes.workspace } : createWorkspaceState();
        this.applyFilters();
        this.showToast(`Project opened with ${this.draws.length} valid draws.`);
      } catch (err) {
        this.showToast("Import failed: invalid JSON project file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  importCsvFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = parseCSV(evt.target.result);
        const mapping = autoMapColumns(parsed.headers);
        const res = convertRowsToDraws(parsed.headers, parsed.rows, mapping);

        if (!res.draws || res.draws.length === 0) {
          this.showToast("No valid Cash 5 drawings were found in the CSV file.");
          return;
        }

        this.draws = res.draws;
        this.manualLines = [];
        this.applyFilters();

        if (res.errors.length > 0) {
          this.showToast(`Imported ${res.draws.length} draws; ${res.errors.length} invalid rows were skipped.`);
        } else {
          this.showToast(`Imported ${res.draws.length} draws from CSV.`);
        }
      } catch (err) {
        this.showToast("CSV import failed. Check the file format and try again.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  showToast(message) {
    let toastContainer = document.getElementById("toastContainer");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "toastContainer";
      toastContainer.className = "toast-container";
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message; // Safe textContent to prevent HTML injection

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 350);
    }, 2800);
  }
}

// Global App Initialization
const app = new Cash5StudioApp();
window.app = app;
