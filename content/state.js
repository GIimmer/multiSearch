"use strict";

window.MultiSearch = window.MultiSearch || {};

(() => {
  const CE = window.MultiSearch;

  // ── Constants ────────────────────────────────────────────────────────
  CE.COLORS = ["#FDD835", "#26C6DA", "#FFA726", "#EC407A", "#9CCC65"];
  CE.MAX_TERMS = 5;
  CE.STORAGE_KEY = "msearch_state";
  CE.SYNC_PREF_KEY = "msearch_sync";

  // ── State ────────────────────────────────────────────────────────────
  let nextId = 1;
  let _selfWrites = 0;

  CE.state = {
    terms: [{ id: nextId++, text: "", colorIndex: 0 }],
    highlights: [[]],
    currentIndex: [-1],
    panelVisible: false,
    ready: false,
    syncEnabled: false,
  };

  // ── Helpers ──────────────────────────────────────────────────────────
  CE.generateId = () => nextId++;

  CE.nextAvailableColor = () => {
    const used = new Set(CE.state.terms.map((t) => t.colorIndex));
    for (let c = 0; c < CE.COLORS.length; c++) {
      if (!used.has(c)) return c;
    }
    return 0;
  };

  CE.resetState = () => {
    CE.state.terms = [{ id: CE.generateId(), text: "", colorIndex: 0 }];
    CE.state.highlights = [[]];
    CE.state.currentIndex = [-1];
  };

  // ── Sync preference ────────────────────────────────────────────────
  CE.loadSyncPref = (callback) => {
    chrome.storage.local.get(CE.SYNC_PREF_KEY, (result) => {
      CE.state.syncEnabled = result?.[CE.SYNC_PREF_KEY] === true;
      if (callback) callback();
    });
  };

  CE.saveSyncPref = () => {
    chrome.storage.local.set({ [CE.SYNC_PREF_KEY]: CE.state.syncEnabled });
  };

  // ── Persistence ──────────────────────────────────────────────────────
  CE.saveState = () => {
    if (!CE.state.syncEnabled) return;
    _selfWrites++;
    const data = CE.state.terms
      .filter((t) => t.text.length > 0)
      .map((t) => ({ text: t.text, colorIndex: t.colorIndex }));
    if (data.length > 0) {
      chrome.storage.local.set({ [CE.STORAGE_KEY]: { terms: data } });
    } else {
      chrome.storage.local.remove(CE.STORAGE_KEY);
    }
  };

  CE.clearSyncedState = () => {
    if (!CE.state.syncEnabled) return;
    _selfWrites++;
    chrome.storage.local.remove(CE.STORAGE_KEY);
  };

  CE.loadState = (callback) => {
    if (!CE.state.syncEnabled) return;
    chrome.storage.local.get(CE.STORAGE_KEY, (result) => {
      const saved = result?.[CE.STORAGE_KEY];
      if (saved?.terms?.length && saved.terms.some((t) => t.text?.length > 0)) {
        const loaded = saved.terms
          .filter((t) => t.text?.length > 0)
          .slice(0, CE.MAX_TERMS);
        if (loaded.length === 0) return;
        CE.clearAllHighlights();
        CE.state.terms = loaded.map((t) => ({
          id: CE.generateId(),
          text: t.text,
          colorIndex: t.colorIndex ?? 0,
        }));
        CE.state.highlights = CE.state.terms.map(() => []);
        CE.state.currentIndex = CE.state.terms.map(() => -1);
        if (callback) callback();
      }
    });
  };

  // ── Cross-tab sync via storage.onChanged ─────────────────────────────
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    // Track sync preference changes across tabs
    if (changes[CE.SYNC_PREF_KEY]) {
      const wasEnabled = CE.state.syncEnabled;
      CE.state.syncEnabled = changes[CE.SYNC_PREF_KEY].newValue === true;
      if (CE.updateSyncCheckbox) CE.updateSyncCheckbox();
      if (CE.updateCloseBtn) CE.updateCloseBtn();

      if (!wasEnabled && CE.state.syncEnabled && CE.state.ready) {
        CE.loadState(() => {
          if (CE.state.panelVisible) {
            CE.renderRows();
            CE.runHighlight();
          }
        });
      }
    }

    // Only process term changes when sync is enabled
    if (!CE.state.syncEnabled) return;
    if (!changes[CE.STORAGE_KEY]) return;

    // Skip self-echo: this tab wrote this change
    if (_selfWrites > 0) {
      _selfWrites--;
      return;
    }

    const newData = changes[CE.STORAGE_KEY].newValue;

    if (!newData || !newData.terms || newData.terms.length === 0) {
      CE.clearAllHighlights();
      CE.resetState();
      if (CE.hidePanel) CE.hidePanel();
      return;
    }

    const loaded = newData.terms
      .filter((t) => t.text?.length > 0)
      .slice(0, CE.MAX_TERMS);

    if (loaded.length === 0) {
      CE.clearAllHighlights();
      CE.resetState();
      if (CE.state.panelVisible && CE.renderRows) CE.renderRows();
      return;
    }

    CE.clearAllHighlights();
    CE.state.terms = loaded.map((t) => ({
      id: CE.generateId(),
      text: t.text,
      colorIndex: t.colorIndex ?? 0,
    }));
    CE.state.highlights = CE.state.terms.map(() => []);
    CE.state.currentIndex = CE.state.terms.map(() => -1);

    if (CE.state.panelVisible) {
      if (CE.renderRows) CE.renderRows();
      CE.runHighlight();
    }
  });
})();
