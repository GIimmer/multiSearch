"use strict";

window.MultiSearch = window.MultiSearch || {};

(() => {
  const CE = window.MultiSearch;

  // ── Constants ────────────────────────────────────────────────────────
  CE.COLORS = ["#FDD835", "#26C6DA", "#FFA726", "#EC407A", "#9CCC65"];
  CE.MAX_TERMS = 5;

  // ── State ────────────────────────────────────────────────────────────
  let nextId = 1;

  CE.state = {
    terms: [{ id: nextId++, text: "", colorIndex: 0 }],
    highlights: [[]],
    currentIndex: [-1],
    panelVisible: false,
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

  // ── Persistence ──────────────────────────────────────────────────────
  CE.saveState = () => {
    const nonEmpty = CE.state.terms.some((t) => t.text.length > 0);
    if (nonEmpty) {
      const data = CE.state.terms.map((t) => ({ text: t.text, colorIndex: t.colorIndex }));
      chrome.storage.local.set({ msearch_state: { terms: data } });
    } else {
      chrome.storage.local.remove("msearch_state");
    }
  };

  CE.loadState = (callback) => {
    chrome.storage.local.get("msearch_state", (result) => {
      const saved = result?.msearch_state;
      if (saved?.terms?.length && saved.terms.some((t) => t.text?.length > 0)) {
        const loaded = saved.terms
          .filter((t) => t.text?.length > 0)
          .slice(0, CE.MAX_TERMS);
        if (loaded.length === 0) return;
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
})();
