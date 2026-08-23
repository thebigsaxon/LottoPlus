/** Main PA 5 Studio application orchestrator. */

import { SAMPLE_DRAWS_BY_GAME } from './sampleData.js?v=4';
import { DEFAULT_GAME_ID, GAME_IDS, getGameConfig, numberRange } from './gameConfig.js';
import { parseCSV, autoMapColumns, convertRowsToDraws } from './csvParser.js';
import { generateAutomatedPatterns } from './patternEngine.js';
import { ConnectionEngine, normalizeManualConnectionChains } from './connectionEngine.js?v=5';
import { GridMatrix } from './gridMatrix.js?v=5';
import { fetchLiveGameUpdate } from './liveFetcher.js?v=5';
import { validateProject, escapeHTML } from './validation.js?v=4';
import { cash5AnalysisWindow, cash5ResearchWindow } from './drawFilters.js?v=2';
import { findBoardSimilarSequences } from './motifEngine.js?v=4';
import { buildNumberEvidence } from './evidenceEngine.js';
import { classifyOnesHeat } from './onesAnalysis.js';
import { createDraftRow, editSessionInBuilder, finalizeSession, formatSessionForMessage, scorePendingSessions } from './sessionStore.js?v=5';
import { futureCellEvidence, selectFutureDigit } from './futureWorkspace.js?v=2';
import { buildDigitRepeatSummary } from './repeatSummary.js';
import { getTensBands, recommendTensBands, tensDigitForNumber } from './fuzzyTens.js';

const INTERFACE_ZOOM_STEPS = [0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5];
const INTERFACE_ZOOM_KEY = 'pa5studio_interface_zoom';
const THEME_KEY = 'pa5studio_theme';
const PROJECT_STORAGE_KEY = 'pa5studio_current_project_v4';

function cash5NumberMarkup(number) {
  if (number === null || number === undefined || !Number.isInteger(Number(number))) return '<span class="number-empty">?</span>';
  const text = String(Number(number));
  const leading = text.slice(0, -1);
  const ones = text.slice(-1);
  return `<span class="number-leading">${leading}</span><strong class="number-ones">${ones}</strong>`;
}

function emptyBallSlots(game = DEFAULT_GAME_ID) {
  return Array.from({ length: getGameConfig(game).ballCount }, () => null);
}

export function createWorkspaceState(game = DEFAULT_GAME_ID) {
  return {
    motifSelections: [],
    motifMatches: [],
    futureDigitMap: [],
    activeFutureCell: null,
    candidateDigits: [],
    selectedEvidenceDigit: null,
    fullCandidates: [],
    rowBuilder: [],
    slipNumbers: emptyBallSlots(game),
    slipTensFilters: emptyBallSlots(game),
    draftRows: [],
    sessions: []
  };
}

function createGameState(gameId) {
  return {
    draws: [...SAMPLE_DRAWS_BY_GAME[gameId]],
    manualLines: [],
    workspace: createWorkspaceState(gameId),
    jackpot: null,
    jackpotIsStale: true
  };
}

export class PA5StudioApp {
  constructor() {
    this.activeGameId = DEFAULT_GAME_ID;
    this.gameStates = Object.fromEntries(GAME_IDS.map(gameId => [gameId, createGameState(gameId)]));
    this.gameConfig = getGameConfig(this.activeGameId);
    this.draws = this.gameStates[this.activeGameId].draws;
    this.filteredDraws = [...this.draws];
    this.researchDraws = cash5ResearchWindow(this.draws);
    this.manualLines = this.gameStates[this.activeGameId].manualLines;
    this.autoLines = [];
    this.activeDigitHighlight = null;
    this.recentFinalizedSessionId = null;
    this.jackpot = this.gameStates[this.activeGameId].jackpot;
    this.jackpotIsStale = this.gameStates[this.activeGameId].jackpotIsStale;

    this.patternSettings = {
      showMatches: false,
      showVerticalRuns: false,
      showDiagonalRuns: false,
      showMathematicalSequences: false,
      showTens: false,
      showOnes: true,
      linkBonusCurrentAndPrevOnly: false
    };

    this.gridMatrix = null;
    this.connectionEngine = null;
    this.workspace = this.gameStates[this.activeGameId].workspace;

    this.init();
  }

  init() {
    document.addEventListener("DOMContentLoaded", () => {
      this.setupDOMReferences();
      this.loadTheme();
      this.loadInterfaceZoom();
      this.setupComponents();
      this.bindEvents();
      this.loadFromLocalStorage();
      this.applyGameLabels();
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
    this.gameSwitch = document.getElementById("gameSwitch");
    this.activeGameName = document.getElementById("activeGameName");
    this.workspaceLabel = document.getElementById("workspaceLabel");
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
    if (persist) {
      try { localStorage.setItem(THEME_KEY, nextTheme); } catch (_) { /* no-op */ }
    }
    requestAnimationFrame(() => this.connectionEngine?.render());
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  cacheJackpot(jackpot) {
    this.jackpot = jackpot;
    this.gameStates[this.activeGameId].jackpot = jackpot;
    this.gameStates[this.activeGameId].jackpotIsStale = this.jackpotIsStale;
  }

  commitActiveGameState() {
    this.gameStates[this.activeGameId] = {
      draws: this.draws,
      manualLines: this.manualLines,
      workspace: this.workspace,
      jackpot: this.jackpot,
      jackpotIsStale: this.jackpotIsStale
    };
  }

  loadActiveGameState(gameId) {
    this.activeGameId = getGameConfig(gameId).id;
    this.gameConfig = getGameConfig(this.activeGameId);
    const state = this.gameStates[this.activeGameId] || createGameState(this.activeGameId);
    this.gameStates[this.activeGameId] = state;
    this.draws = state.draws;
    this.manualLines = state.manualLines;
    this.workspace = state.workspace;
    this.jackpot = state.jackpot;
    this.jackpotIsStale = state.jackpotIsStale;
  }

  switchGame(gameId) {
    const nextId = getGameConfig(gameId).id;
    if (nextId === this.activeGameId) return;
    this.commitActiveGameState();
    this.connectionEngine?.completeConnection();
    this.activeDigitHighlight = null;
    this.recentFinalizedSessionId = null;
    this.loadActiveGameState(nextId);
    this.applyGameLabels();
    this.applyFilters();
    this.saveToLocalStorage();
    this.showToast(`Switched to ${this.gameConfig.displayName}.`);
  }

  applyGameLabels() {
    if (this.activeGameName) this.activeGameName.textContent = this.gameConfig.displayName;
    if (this.workspaceLabel) this.workspaceLabel.setAttribute('aria-label', `${this.gameConfig.displayName} analysis workspace`);
    document.title = `PA 5 Studio — ${this.gameConfig.displayName}`;
    this.gameSwitch?.querySelectorAll('[data-game-id]').forEach(button => {
      const active = button.dataset.gameId === this.activeGameId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
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
    this.gameSwitch?.querySelectorAll('[data-game-id]').forEach(button => {
      button.addEventListener('click', () => this.switchGame(button.dataset.gameId));
    });
    window.pa5Desktop?.onMenuAction?.(action => {
      if (action === 'importCSV') this.csvFileInput?.click();
      else if (action === 'openProject') this.projectFileInput?.click();
      else if (action === 'saveProject') this.exportProjectFile();
      else if (action === 'zoomIn') this.zoomInterface(1);
      else if (action === 'zoomOut') this.zoomInterface(-1);
      else if (action === 'zoomReset') this.setInterfaceZoom(1);
    });
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
      this.workspace.slipNumbers = emptyBallSlots(this.gameConfig);
      this.workspace.slipTensFilters = emptyBallSlots(this.gameConfig);
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
    this.draws = [...SAMPLE_DRAWS_BY_GAME[this.activeGameId]];
    this.manualLines = [];
    this.applyFilters({ resetAnalysis: true });
    this.saveToLocalStorage();

    if (showToastMsg) {
      this.showToast(`Sample ${this.gameConfig.displayName} drawings restored.`);
    }
  }

  async fetchLiveDraws() {
    this.btnFetchLive?.setAttribute("aria-busy", "true");
    this.showToast(`Updating ${this.gameConfig.displayName} drawings and jackpot…`);

    const update = await fetchLiveGameUpdate(this.gameConfig);

    let drawCount = 0;
    if (update.draws.ok) {
      drawCount = update.draws.value.length;
      this.draws = update.draws.value;
      this.manualLines = [];
      this.applyFilters({ resetAnalysis: true });
    }

    if (update.jackpot.ok) {
      this.jackpot = update.jackpot.value;
      this.jackpotIsStale = false;
      this.cacheJackpot(this.jackpot);
    } else if (this.jackpot) {
      this.jackpotIsStale = true;
      this.gameStates[this.activeGameId].jackpotIsStale = true;
    }
    this.updateJackpotStatus();
    this.saveToLocalStorage();

    if (drawCount && update.jackpot.ok) {
      this.showToast(`Updated ${drawCount} ${this.gameConfig.displayName} drawings. Jackpot ${this.jackpot.display}.`);
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

  applyFilters({ resetAnalysis = false } = {}) {
    this.filteredDraws = cash5AnalysisWindow(this.draws);
    this.researchDraws = cash5ResearchWindow(this.draws);
    if (resetAnalysis) {
      this.workspace.motifSelections = [];
      this.workspace.motifMatches = [];
    }
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
      this.gridMatrix.setDraws(this.filteredDraws, this.activeGameId, {
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
      this.jackpotStatus.setAttribute('title', `Jackpot retrieved ${label} from the Pennsylvania Lottery.`);
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
          this.workspace.draftRows.push(createDraftRow(this.workspace.slipNumbers, 'uncertain', '', this.gameConfig));
          this.workspace.slipNumbers = emptyBallSlots(this.gameConfig);
          this.workspace.slipTensFilters = emptyBallSlots(this.gameConfig);
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
          const snapshot = finalizeSession(this.workspace, latestDraw, new Date(), this.gameConfig);
          this.workspace.sessions.unshift(snapshot);
          this.recentFinalizedSessionId = snapshot.id;
          this.workspace.draftRows = [];
          this.workspace.slipNumbers = emptyBallSlots(this.gameConfig);
          this.workspace.slipTensFilters = emptyBallSlots(this.gameConfig);
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
    if (!Number.isInteger(value) || value < this.gameConfig.minimumNumber || value > this.gameConfig.maximumNumber
        || !Number.isInteger(position) || position < 0 || position >= this.gameConfig.ballCount) return;
    this.workspace.slipNumbers[position] = value;
    this.workspace.rowBuilder = this.workspace.slipNumbers.filter(Number.isInteger);
    this.renderCash5Workspace();
    this.saveToLocalStorage();
  }

  renderCash5Workspace() {
    if (!this.cash5Workspace) return;

    const selections = this.workspace.futureDigitMap || [];
    const mappedKeys = new Set((this.workspace.futureDigitMap || []).map(item => `${item.column}:${item.digit}`));
    this.gridMatrix?.setPositionHighlights(selections);

    if (this.futureDigitGrid) {
      this.futureDigitGrid.innerHTML = `
        <div class="future-grid-corner">Digit</div>
        ${Array.from({ length: this.gameConfig.ballCount }, (_, column) => `<div class="future-space-head">Ball ${column + 1}</div>`).join('')}
        ${Array.from({ length: 10 }, (_, digit) => `
          <div class="future-digit-label">${digit}</div>
          ${Array.from({ length: this.gameConfig.ballCount }, (_, column) => {
            const key = `${column}:${digit}`;
            const mapped = mappedKeys.has(key);
            const active = this.workspace.activeFutureCell?.column === column && this.workspace.activeFutureCell?.digit === digit;
            return `<button class="future-map-cell ${mapped ? `mapped position-${column + 1}` : ''} ${active ? 'active' : ''}"
              data-future-column="${column}" data-future-digit="${digit}" aria-pressed="${mapped}"
              aria-label="Select ones digit ${digit} in Ball ${column + 1}">
              <b>${digit}</b>
            </button>`;
          }).join('')}`).join('')}`;

      this.futureDigitGrid.querySelectorAll('[data-future-column]').forEach(button => {
        button.addEventListener('click', () => {
          const column = Number(button.dataset.futureColumn);
          const digit = Number(button.dataset.futureDigit);
          this.workspace.futureDigitMap = selectFutureDigit(this.workspace.futureDigitMap, column, digit, this.gameConfig);
          this.workspace.motifMatches = [];
          this.workspace.activeFutureCell = { column, digit };
          this.gridMatrix?.setPositionHighlights(this.workspace.futureDigitMap);
          this.renderCash5Workspace();
          this.saveToLocalStorage();
        });
      });
    }

    if (this.futureMapInspector) {
      const active = this.workspace.activeFutureCell;
      this.futureMapInspector.classList.toggle('empty-state', !active);
      if (!active) {
        this.futureMapInspector.innerHTML = '<strong>Start with a position.</strong><span> Choose a digit-space square to inspect recent context.</span>';
      } else {
        const evidence = futureCellEvidence(this.researchDraws, this.workspace.motifMatches, active.column, active.digit, this.gameConfig);
        const isMapped = mappedKeys.has(`${active.column}:${active.digit}`);
        this.futureMapInspector.innerHTML = `
          <div class="future-inspector-head">
            <div><span>Focused selection</span><h4>Digit ${active.digit} in Ball ${active.column + 1}</h4></div>
            <span class="map-status ${isMapped ? 'mapped' : ''}">${isMapped ? 'On your map' : 'Not mapped'}</span>
          </div>
          <div class="future-inspector-stats">
            <span><b>${evidence.windowCount}</b> times in this space<br><small>${this.researchDraws.length} research draws</small></span>
            <span><b>${evidence.motifCount}</b> pattern futures<br><small>after motif search</small></span>
          </div>
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
        ? Array.from({ length: this.gameConfig.ballCount }, (_, column) => {
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
      this.candidateDigitsContainer.innerHTML = Array.from({ length: this.gameConfig.ballCount }, (_, column) => {
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
        ? buildNumberEvidence(focusedMapping.digit, this.researchDraws, this.workspace.motifMatches, [focusedMapping.column], this.gameConfig)
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
    if (!Array.isArray(this.workspace.slipNumbers) || this.workspace.slipNumbers.length !== this.gameConfig.ballCount) {
      this.workspace.slipNumbers = Array.from({ length: this.gameConfig.ballCount }, (_, index) => legacyNumbers[index] ?? null);
    }
    const slip = this.workspace.slipNumbers;
    if (!Array.isArray(this.workspace.slipTensFilters) || this.workspace.slipTensFilters.length !== this.gameConfig.ballCount) {
      this.workspace.slipTensFilters = emptyBallSlots(this.gameConfig);
    }
    const tensFilters = this.workspace.slipTensFilters;
    const tensBands = getTensBands(this.gameConfig);
    const tensRecommendations = recommendTensBands(this.filteredDraws, this.gameConfig);
    const filledNumbers = slip.filter(Number.isInteger);
    const mappedDigitByColumn = new Map((this.workspace.futureDigitMap || []).map(item => [item.column, item.digit]));
    const isComplete = filledNumbers.length === this.gameConfig.ballCount
      && new Set(filledNumbers).size === this.gameConfig.ballCount
      && filledNumbers.every((number, index) => index === 0 || number > filledNumbers[index - 1])
      && slip.every((number, index) => !mappedDigitByColumn.has(index) || number % 10 === mappedDigitByColumn.get(index))
      && slip.every((number, index) => !Number.isInteger(tensFilters[index]) || tensDigitForNumber(number, this.gameConfig) === tensFilters[index]);

    if (this.rowBuilderContainer) {
      this.rowBuilderContainer.innerHTML = Array.from({ length: this.gameConfig.ballCount }, (_, index) => {
        const current = slip[index];
        const previousIndex = Array.from({ length: index }, (_, offset) => index - offset - 1)
          .find(position => Number.isInteger(slip[position]));
        const nextIndex = Array.from({ length: this.gameConfig.ballCount - 1 - index }, (_, offset) => index + offset + 1)
          .find(position => Number.isInteger(slip[position]));
        const previous = previousIndex === undefined ? null : slip[previousIndex];
        const next = nextIndex === undefined ? null : slip[nextIndex];
        const mappedDigits = (this.workspace.futureDigitMap || [])
          .filter(item => item.column === index)
          .map(item => item.digit)
          .sort((a, b) => a - b);
        const tensFilter = Number.isInteger(tensFilters[index]) ? tensFilters[index] : null;
        const recommendation = tensRecommendations[index];
        const minimum = Number.isInteger(previous) ? previous + (index - previousIndex) : index + 1;
        const maximum = Number.isInteger(next) ? next - (nextIndex - index) : this.gameConfig.maximumNumber - (this.gameConfig.ballCount - 1 - index);
        const available = numberRange(this.gameConfig)
          .filter(number => number >= minimum && number <= maximum)
          .filter(number => mappedDigits.length === 0 || mappedDigits.includes(number % 10))
          .filter(number => tensFilter === null || tensDigitForNumber(number, this.gameConfig) === tensFilter);
        const currentMatchesMap = !Number.isInteger(current) || mappedDigits.length === 0 || mappedDigits.includes(current % 10);
        const currentMatchesTens = !Number.isInteger(current) || tensFilter === null || tensDigitForNumber(current, this.gameConfig) === tensFilter;
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
          : !currentIsOrdered ? `Numbers must increase from Ball 1 through Ball ${this.gameConfig.ballCount}.`
            : `Current ${current} does not match the updated filters; choose again or change a filter.`;
        return `<div class="slip-slot ${Number.isInteger(current) ? 'filled' : ''} ${currentIsValid ? '' : 'invalid'}">
          <span class="slip-slot-head"><strong>Ball ${index + 1}</strong>${mappedDigits.length ? `<span class="mapped-ending position-${index + 1}"><small>Mapped ending</small><b>${mappedDigits[0]}</b></span>` : '<span class="no-mapped-ending">No digit filter</span>'}</span>
          <div class="fuzzy-recommendation">
            <span><b>${recommendation.primary.label}</b><small>${recommendation.primary.confidence} · ${recommendation.primary.reason}</small></span>
            <button type="button" data-use-tens="${recommendation.primary.digit}" data-tens-position="${index}" aria-label="Use ${recommendation.primary.label} recommendation for Ball ${index + 1}" aria-pressed="${tensFilter === recommendation.primary.digit}">${tensFilter === recommendation.primary.digit ? 'Using' : 'Use'}</button>
          </div>
          <label class="slip-field-label">Tens range
            <select class="tens-filter-select" data-slip-tens="${index}" aria-label="Tens range for Ball ${index + 1}">
              <option value="">Any tens</option>
              ${tensBands.map(band => `<option value="${band.digit}" ${band.digit === tensFilter ? 'selected' : ''}>${band.label}${band.digit === recommendation.primary.digit ? ` — ${recommendation.primary.confidence}` : band.digit === recommendation.alternate.digit ? ' — Alternate' : ''}</option>`).join('')}
            </select>
          </label>
          <label class="slip-field-label">Full number
          <select data-slip-position="${index}" aria-label="Full number for Ball ${index + 1}">
            <option value="">Choose…</option>
            ${options.map(number => `<option value="${number}" ${number === current ? 'selected' : ''}>${number}</option>`).join('')}
          </select>
          </label>
          <small>${currentIsValid ? `${helper}${tensFilter === null ? '' : ` in ${tensBands.find(band => band.digit === tensFilter)?.label}`}. Alternate: ${recommendation.alternate.label}.` : invalidMessage}</small>
        </div>`;
      }).join('');

      this.rowBuilderContainer.querySelectorAll('[data-slip-tens]').forEach(select => {
        select.addEventListener('change', () => {
          const position = Number(select.dataset.slipTens);
          const tens = select.value === '' ? null : Number(select.value);
          this.workspace.slipTensFilters[position] = tens;
          const current = this.workspace.slipNumbers[position];
          if (Number.isInteger(current) && tens !== null && tensDigitForNumber(current, this.gameConfig) !== tens) this.workspace.slipNumbers[position] = null;
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
          if (Number.isInteger(current) && tensDigitForNumber(current, this.gameConfig) !== tens) this.workspace.slipNumbers[position] = null;
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
          this.workspace.slipTensFilters = emptyBallSlots(this.gameConfig);
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
    this.finalizeSharePrompt.innerHTML = `
      <div><strong>${session.rows.length} row${session.rows.length === 1 ? '' : 's'} finalized for the next draw.</strong><span>Your dated session is saved.</span></div>
      <div class="inline-actions">
        <button class="btn btn-primary" type="button" data-copy-finalized>Copy slips</button>
        <button class="text-btn" type="button" data-dismiss-finalized>Dismiss</button>
      </div>`;
    this.finalizeSharePrompt.querySelector('[data-copy-finalized]')?.addEventListener('click', async () => {
      const copied = await this.copyText(formatSessionForMessage(session, this.gameConfig));
      this.showToast(copied ? 'Formatted slips copied.' : 'Copy failed.');
    });
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
          <button class="mini-btn" data-copy-session="${escapeHTML(session.id)}">Copy slips</button>
          <button class="mini-btn" data-edit-session="${escapeHTML(session.id)}">${session.result ? 'Reuse in Ticket Builder' : 'Edit in Ticket Builder'}</button>
        </div>
      </div>
    `).join('') : 'No locked sessions yet.';
    this.sessionHistory.querySelectorAll('[data-copy-session]').forEach(button => {
      button.addEventListener('click', async () => {
        const session = this.workspace.sessions.find(item => item.id === button.dataset.copySession);
        const text = formatSessionForMessage(session, this.gameConfig);
        if (!text) return;
        const copied = await this.copyText(text);
        this.showToast(copied ? 'Formatted slips copied to the clipboard.' : 'Copy failed. Select the rows and copy them manually.');
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
  }

  async copyText(text) {
    try {
      if (typeof window.pa5Desktop?.copyText === 'function') return Boolean(await window.pa5Desktop.copyText(text));
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
    const projectData = this.buildProjectData();
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projectData));
    } catch (e) {}
  }

  buildProjectData() {
    this.commitActiveGameState();
    return { appName: 'PA 5 Studio', version: 4, activeGame: this.activeGameId, games: this.gameStates };
  }

  loadFromLocalStorage() {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const valRes = validateProject(data);
      if (valRes.valid) {
        this.gameStates = Object.fromEntries(GAME_IDS.map(gameId => [gameId, {
          ...valRes.games[gameId],
          workspace: { ...createWorkspaceState(gameId), ...valRes.games[gameId].workspace }
        }]));
        this.loadActiveGameState(valRes.activeGame);
      }
    } catch (e) {}
  }

  async exportProjectFile() {
    const contents = JSON.stringify(this.buildProjectData(), null, 2);
    const filename = `pa5-studio_${new Date().toISOString().split('T')[0]}.pa5studio`;
    if (typeof window.pa5Desktop?.saveProject === 'function') {
      const saved = await window.pa5Desktop.saveProject(contents, filename);
      if (saved) this.showToast('PA 5 Studio project saved.');
      return;
    }
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('PA 5 Studio project saved.');
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

        this.gameStates = Object.fromEntries(GAME_IDS.map(gameId => [gameId, {
          ...valRes.games[gameId], workspace: { ...createWorkspaceState(gameId), ...valRes.games[gameId].workspace }
        }]));
        this.loadActiveGameState(valRes.activeGame);
        this.applyGameLabels();
        this.applyFilters();
        this.saveToLocalStorage();
        this.showToast('PA 5 Studio project opened.');
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
        const res = convertRowsToDraws(parsed.headers, parsed.rows, mapping, this.gameConfig);

        if (!res.draws || res.draws.length === 0) {
          this.showToast(`No valid ${this.gameConfig.displayName} drawings were found in the CSV file.`);
          return;
        }

        this.draws = res.draws;
        this.manualLines = [];
        this.applyFilters({ resetAnalysis: true });
        this.saveToLocalStorage();

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
const app = new PA5StudioApp();
window.app = app;
