"use strict";

(() => {
  const CE = window.MultiSearch;
  const state = CE.state;

  // ── Host element + Shadow DOM ──────────────────────────────────────
  const host = document.createElement("msearch-panel");
  host.style.cssText = "all:initial; position:fixed; top:8px; right:8px; z-index:2147483647; display:none;";
  const shadow = host.attachShadow({ mode: "closed" });

  CE.setHost(host);
  document.documentElement.appendChild(host);

  // DOM references (set after HTML loads)
  let rowsContainer = null;
  let addBtn = null;
  let clearBtn = null;

  // ── Load HTML + CSS into Shadow DOM ────────────────────────────────
  CE.initPanel = async () => {
    // Load stylesheet
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("content/panel.css");
    shadow.appendChild(link);

    // Load HTML template
    const res = await fetch(chrome.runtime.getURL("content/panel.html"));
    const html = await res.text();
    const container = document.createElement("div");
    container.innerHTML = html;

    // Move the panel element into the shadow root
    const panel = container.firstElementChild;
    shadow.appendChild(panel);

    // Cache DOM references
    rowsContainer = shadow.querySelector(".rows");
    addBtn = shadow.querySelector(".add-btn");
    clearBtn = shadow.querySelector(".clear-btn");
    const closeBtn = shadow.querySelector(".close-btn");

    // Wire up static button events
    addBtn.addEventListener("click", () => CE.addTerm());
    clearBtn.addEventListener("click", () => CE.clearAll());
    closeBtn.addEventListener("click", () => CE.dismissPanel());
  };

  // ── Debounce helper ─────────────────────────────────────────────────
  let debounceTimer = null;
  function debounceHighlight() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      CE.runHighlight();
      CE.saveState();
    }, 100);
  }

  // ── Row rendering ──────────────────────────────────────────────────
  CE.renderRows = () => {
    if (!rowsContainer) return;
    rowsContainer.innerHTML = "";

    state.terms.forEach((term, i) => {
      const row = document.createElement("div");
      row.className = "row";

      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.background = CE.COLORS[term.colorIndex];
      row.appendChild(dot);

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = `Search term ${i + 1}`;
      input.value = term.text;

      input.addEventListener("input", () => {
        state.terms[i].text = input.value;
        updateActionButtons();
        debounceHighlight();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { CE.dismissPanel(); e.preventDefault(); }
        if (e.key === "ArrowUp") { CE.navigateTerm(i, -1); e.preventDefault(); }
        if (e.key === "ArrowDown") { CE.navigateTerm(i, 1); e.preventDefault(); }
        if (e.key === "Enter") {
          if (i < state.terms.length - 1) {
            const inputs = rowsContainer.querySelectorAll("input");
            if (inputs[i + 1]) inputs[i + 1].focus();
          } else if (state.terms.length < CE.MAX_TERMS && state.terms[i].text) {
            CE.addTerm();
          }
          e.preventDefault();
        }
      });

      // Collapse empty rows on blur
      const termId = term.id;
      input.addEventListener("blur", () => {
        setTimeout(() => {
          const idx = state.terms.findIndex((t) => t.id === termId);
          if (idx >= 0 && state.terms.length > 1 && !state.terms[idx].text) {
            CE.removeTerm(idx);
          }
        }, 150);
      });

      row.appendChild(input);

      const count = document.createElement("span");
      count.className = "match-count";
      count.dataset.termIndex = i;
      count.textContent = matchCountText(i);
      row.appendChild(count);

      const prevBtn = document.createElement("button");
      prevBtn.className = "nav-btn";
      prevBtn.textContent = "\u25B2";
      prevBtn.title = "Previous match";
      prevBtn.addEventListener("click", () => CE.navigateTerm(i, -1));
      row.appendChild(prevBtn);

      const nextBtn = document.createElement("button");
      nextBtn.className = "nav-btn";
      nextBtn.textContent = "\u25BC";
      nextBtn.title = "Next match";
      nextBtn.addEventListener("click", () => CE.navigateTerm(i, 1));
      row.appendChild(nextBtn);

      if (state.terms.length > 1) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-btn";
        removeBtn.textContent = "\u00D7";
        removeBtn.title = "Remove this term";
        removeBtn.addEventListener("click", () => CE.removeTerm(i));
        row.appendChild(removeBtn);
      }

      rowsContainer.appendChild(row);
    });

    updateActionButtons();

    const inputs = rowsContainer.querySelectorAll("input");
    const lastInput = inputs[inputs.length - 1];
    if (lastInput && !lastInput.value) lastInput.focus();
  };

  // ── Action button state ────────────────────────────────────────────
  function updateActionButtons() {
    if (!addBtn || !clearBtn) return;
    const hasEmpty = state.terms.some((t) => !t.text);
    addBtn.disabled = state.terms.length >= CE.MAX_TERMS || hasEmpty;
    clearBtn.style.display = state.terms.length > 1 ? "" : "none";
  }

  // ── Match counts ───────────────────────────────────────────────────
  function matchCountText(i) {
    const visible = CE.visibleMarks(i);
    if (visible.length === 0) return state.terms[i].text ? "0" : "";
    const ci = state.currentIndex[i];
    const visIdx = ci >= 0 ? visible.indexOf(state.highlights[i][ci]) : -1;
    return visIdx >= 0 ? `${visIdx + 1}/${visible.length}` : `${visible.length}`;
  }

  CE.updateMatchCounts = () => {
    if (!rowsContainer) return;
    state.terms.forEach((_, i) => {
      const el = rowsContainer.querySelector(`.match-count[data-term-index="${i}"]`);
      if (el) el.textContent = matchCountText(i);
    });
  };

  // ── Term management ────────────────────────────────────────────────
  CE.addTerm = () => {
    if (state.terms.length >= CE.MAX_TERMS) return;
    state.terms.push({ id: CE.generateId(), text: "", colorIndex: CE.nextAvailableColor() });
    state.highlights.push([]);
    state.currentIndex.push(-1);
    CE.renderRows();
    CE.saveState();
  };

  CE.removeTerm = (i) => {
    CE.clearHighlightsForTerm(i);
    state.terms.splice(i, 1);
    state.highlights.splice(i, 1);
    state.currentIndex.splice(i, 1);
    CE.runHighlight();
    CE.renderRows();
    CE.updateMatchCounts();
    CE.saveState();
  };

  CE.clearAll = () => {
    CE.clearAllHighlights();
    CE.resetState();
    CE.renderRows();
    CE.saveState();
  };

  // ── Panel visibility ───────────────────────────────────────────────
  CE.showPanel = () => {
    host.style.display = "block";
    state.panelVisible = true;
    CE.renderRows();
    CE.runHighlight();
    setTimeout(() => {
      if (!rowsContainer) return;
      const firstInput = rowsContainer.querySelector("input");
      if (firstInput) firstInput.focus();
    }, 0);
  };

  CE.hidePanel = () => {
    host.style.display = "none";
    state.panelVisible = false;
  };

  CE.dismissPanel = () => {
    CE.hidePanel();
    CE.clearAllHighlights();
    CE.resetState();
    chrome.storage.local.remove("msearch_state");
  };

  CE.togglePanel = () => {
    if (state.panelVisible) {
      CE.dismissPanel();
    } else {
      CE.showPanel();
    }
  };
})();
