(() => {
  "use strict";

  const COLORS = ["#FDD835", "#26C6DA", "#FFA726", "#EC407A", "#9CCC65"];
  const MAX_TERMS = 5;

  // ── State ──────────────────────────────────────────────────────────
  // Each term: { id, text, colorIndex }
  let nextId = 1;
  let terms = [{ id: nextId++, text: "", colorIndex: 0 }];
  let highlights = [[]]; // highlights[position] = [element, ...]
  let currentIndex = [-1]; // currentIndex[position] = int
  let panelVisible = false;

  // ── Host element + Shadow DOM ──────────────────────────────────────
  const host = document.createElement("ctrleff-panel");
  host.style.cssText = "all:initial; position:fixed; top:8px; right:8px; z-index:2147483647; display:none;";
  const shadow = host.attachShadow({ mode: "closed" });

  // ── Shadow DOM styles ──────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    :host { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 13px; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .panel {
      background: #1e1e1e;
      color: #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.45);
      padding: 8px;
      min-width: 320px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      user-select: none;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 2px 4px;
      border-bottom: 1px solid #333;
    }
    .header .title { font-weight: 600; font-size: 12px; letter-spacing: 0.5px; color: #aaa; }

    .row {
      display: flex;
      align-items: center;
      gap: 6px;
      animation: fadeIn 0.12s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

    .color-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    input[type="text"] {
      flex: 1;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      color: #eee;
      padding: 4px 8px;
      font-size: 13px;
      outline: none;
      min-width: 0;
    }
    input[type="text"]:focus { border-color: #4A90D9; }

    .match-count {
      font-size: 11px;
      color: #888;
      min-width: 36px;
      text-align: center;
      flex-shrink: 0;
    }

    button {
      background: none;
      border: 1px solid #444;
      color: #ccc;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    }
    button:hover { background: #333; border-color: #666; }
    button:disabled { opacity: 0.35; cursor: default; pointer-events: none; }

    .nav-btn { width: 24px; height: 24px; padding: 0; flex-shrink: 0; }
    .remove-btn { width: 24px; height: 24px; padding: 0; flex-shrink: 0; color: #999; }
    .remove-btn:hover { color: #f44; border-color: #f44; }

    .actions {
      display: flex;
      gap: 6px;
      padding-top: 4px;
      border-top: 1px solid #333;
    }
    .actions button { padding: 3px 10px; font-size: 12px; }
    .add-btn { color: #4A90D9; border-color: #4A90D9; }
    .add-btn:hover { background: rgba(74,144,217,0.15); }
    .clear-btn { color: #f77; border-color: #f77; }
    .clear-btn:hover { background: rgba(255,119,119,0.15); }
    .close-btn {
      margin-left: auto;
      color: #999;
      border-color: #555;
    }
  `;
  shadow.appendChild(style);

  // ── Panel DOM ──────────────────────────────────────────────────────
  const panel = document.createElement("div");
  panel.className = "panel";
  shadow.appendChild(panel);

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `<span class="title">CTRLEFF</span>`;
  panel.appendChild(header);

  const rowsContainer = document.createElement("div");
  panel.appendChild(rowsContainer);

  const actions = document.createElement("div");
  actions.className = "actions";
  panel.appendChild(actions);

  const addBtn = document.createElement("button");
  addBtn.className = "add-btn";
  addBtn.textContent = "+ Add Term";
  addBtn.addEventListener("click", () => addTerm());
  actions.appendChild(addBtn);

  const clearBtn = document.createElement("button");
  clearBtn.className = "clear-btn";
  clearBtn.textContent = "Clear All";
  clearBtn.addEventListener("click", clearAll);
  actions.appendChild(clearBtn);

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", dismissPanel);
  actions.appendChild(closeBtn);

  document.documentElement.appendChild(host);

  // ── Color assignment ───────────────────────────────────────────────
  function nextAvailableColor() {
    const used = new Set(terms.map((t) => t.colorIndex));
    for (let c = 0; c < COLORS.length; c++) {
      if (!used.has(c)) return c;
    }
    return 0; // fallback (shouldn't happen with max 5)
  }

  // ── Build / rebuild term rows ──────────────────────────────────────
  function renderRows() {
    rowsContainer.innerHTML = "";
    terms.forEach((term, i) => {
      const row = document.createElement("div");
      row.className = "row";

      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.background = COLORS[term.colorIndex];
      row.appendChild(dot);

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = `Search term ${i + 1}`;
      input.value = term.text;
      input.addEventListener("input", () => {
        terms[i].text = input.value;
        runHighlight();
        updateActionButtons();
        saveState();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { dismissPanel(); e.preventDefault(); }
        if (e.key === "ArrowUp") { navigateTerm(i, -1); e.preventDefault(); }
        if (e.key === "ArrowDown") { navigateTerm(i, 1); e.preventDefault(); }
        if (e.key === "Enter") {
          if (i < terms.length - 1) {
            // Focus next existing input
            const inputs = rowsContainer.querySelectorAll("input");
            if (inputs[i + 1]) inputs[i + 1].focus();
          } else if (terms.length < MAX_TERMS && terms[i].text) {
            // On last term with text: add a new term and focus it
            addTerm();
          }
          e.preventDefault();
        }
      });

      // Collapse empty rows on blur
      const termId = term.id;
      input.addEventListener("blur", () => {
        setTimeout(() => {
          const idx = terms.findIndex((t) => t.id === termId);
          if (idx >= 0 && terms.length > 1 && !terms[idx].text) {
            removeTerm(idx);
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
      prevBtn.addEventListener("click", () => navigateTerm(i, -1));
      row.appendChild(prevBtn);

      const nextBtn = document.createElement("button");
      nextBtn.className = "nav-btn";
      nextBtn.textContent = "\u25BC";
      nextBtn.title = "Next match";
      nextBtn.addEventListener("click", () => navigateTerm(i, 1));
      row.appendChild(nextBtn);

      if (terms.length > 1) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-btn";
        removeBtn.textContent = "\u00D7";
        removeBtn.title = "Remove this term";
        removeBtn.addEventListener("click", () => removeTerm(i));
        row.appendChild(removeBtn);
      }

      rowsContainer.appendChild(row);
    });

    updateActionButtons();

    // Focus the last empty input
    const inputs = rowsContainer.querySelectorAll("input");
    const lastInput = inputs[inputs.length - 1];
    if (lastInput && !lastInput.value) lastInput.focus();
  }

  function updateActionButtons() {
    const hasEmpty = terms.some((t) => !t.text);
    addBtn.disabled = terms.length >= MAX_TERMS || hasEmpty;
    clearBtn.style.display = terms.length > 1 ? "" : "none";
  }

  function matchCountText(i) {
    const h = highlights[i];
    if (!h || h.length === 0) return terms[i].text ? "0" : "";
    const ci = currentIndex[i];
    return ci >= 0 ? `${ci + 1}/${h.length}` : `${h.length}`;
  }

  function updateMatchCounts() {
    terms.forEach((_, i) => {
      const el = rowsContainer.querySelector(`.match-count[data-term-index="${i}"]`);
      if (el) el.textContent = matchCountText(i);
    });
  }

  // ── Term management ────────────────────────────────────────────────
  function addTerm() {
    if (terms.length >= MAX_TERMS) return;
    terms.push({ id: nextId++, text: "", colorIndex: nextAvailableColor() });
    highlights.push([]);
    currentIndex.push(-1);
    renderRows();
    saveState();
  }

  function removeTerm(i) {
    clearHighlightsForTerm(i);
    terms.splice(i, 1);
    highlights.splice(i, 1);
    currentIndex.splice(i, 1);
    runHighlight();
    renderRows();
    updateMatchCounts();
    saveState();
  }

  function clearAll() {
    clearAllHighlights();
    terms = [{ id: nextId++, text: "", colorIndex: 0 }];
    highlights = [[]];
    currentIndex = [-1];
    renderRows();
    saveState();
  }

  // ── Panel visibility ───────────────────────────────────────────────
  function showPanel() {
    host.style.display = "block";
    panelVisible = true;
    renderRows();
    runHighlight();
    // Focus first input
    setTimeout(() => {
      const firstInput = rowsContainer.querySelector("input");
      if (firstInput) firstInput.focus();
    }, 0);
  }

  function hidePanel() {
    host.style.display = "none";
    panelVisible = false;
  }

  function dismissPanel() {
    hidePanel();
    clearAllHighlights();
    terms = [{ id: nextId++, text: "", colorIndex: 0 }];
    highlights = [[]];
    currentIndex = [-1];
    chrome.storage.local.remove("ctrleff_state");
  }

  function togglePanel() {
    if (panelVisible) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  // ── Highlighting engine ────────────────────────────────────────────
  function clearHighlightsForTerm(termIndex) {
    const marks = highlights[termIndex];
    if (!marks) return;
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      const text = document.createTextNode(mark.textContent);
      parent.replaceChild(text, mark);
      parent.normalize();
    });
    highlights[termIndex] = [];
    currentIndex[termIndex] = -1;
  }

  function clearAllHighlights() {
    for (let i = 0; i < highlights.length; i++) {
      clearHighlightsForTerm(i);
    }
  }

  function runHighlight() {
    clearAllHighlights();
    highlights = terms.map(() => []);
    currentIndex = terms.map(() => -1);

    terms.forEach((term, i) => {
      if (!term.text) return;
      highlightTerm(term.text, i, term.colorIndex);
    });

    updateMatchCounts();
  }

  function highlightTerm(term, posIndex, colorIndex) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let regex;
    try {
      regex = new RegExp(escaped, "gi");
    } catch {
      return;
    }

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          // Skip our own panel
          if (host.contains(node)) return NodeFilter.FILTER_REJECT;
          // Skip script/style
          const tag = node.parentElement?.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
          // Skip already-highlighted nodes (avoid infinite loops)
          if (node.parentElement?.tagName === "CTRLEFF-MARK") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((textNode) => {
      const text = textNode.textContent;
      regex.lastIndex = 0;
      const matches = [];
      let m;
      while ((m = regex.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      }
      if (matches.length === 0) return;

      const frag = document.createDocumentFragment();
      let lastEnd = 0;

      matches.forEach(({ start, end, text: matchText }) => {
        if (start > lastEnd) {
          frag.appendChild(document.createTextNode(text.slice(lastEnd, start)));
        }
        const mark = document.createElement("ctrleff-mark");
        mark.setAttribute("data-term", colorIndex);
        mark.textContent = matchText;
        frag.appendChild(mark);
        highlights[posIndex].push(mark);
        lastEnd = end;
      });

      if (lastEnd < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastEnd)));
      }

      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  // ── Navigation ─────────────────────────────────────────────────────
  function navigateTerm(termIndex, direction) {
    const marks = highlights[termIndex];
    if (!marks || marks.length === 0) return;

    // Remove current highlight
    if (currentIndex[termIndex] >= 0 && marks[currentIndex[termIndex]]) {
      marks[currentIndex[termIndex]].classList.remove("ctrleff-current");
    }

    // Advance
    let next = currentIndex[termIndex] + direction;
    if (next >= marks.length) next = 0;
    if (next < 0) next = marks.length - 1;
    currentIndex[termIndex] = next;

    const el = marks[next];
    if (el) {
      el.classList.add("ctrleff-current");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    updateMatchCounts();
  }

  // ── Persistence ────────────────────────────────────────────────────
  function saveState() {
    const nonEmpty = terms.some((t) => t.text.length > 0);
    if (nonEmpty) {
      // Save text + colorIndex (not id, that's ephemeral)
      const data = terms.map((t) => ({ text: t.text, colorIndex: t.colorIndex }));
      chrome.storage.local.set({ ctrleff_state: { terms: data } });
    } else {
      chrome.storage.local.remove("ctrleff_state");
    }
  }

  function loadState() {
    chrome.storage.local.get("ctrleff_state", (result) => {
      const state = result?.ctrleff_state;
      if (state?.terms?.length && state.terms.some((t) => t.text?.length > 0)) {
        // Filter out empty terms on load (clean slate)
        const loaded = state.terms
          .filter((t) => t.text?.length > 0)
          .slice(0, MAX_TERMS);
        if (loaded.length === 0) return;
        terms = loaded.map((t) => ({
          id: nextId++,
          text: t.text,
          colorIndex: t.colorIndex ?? 0,
        }));
        highlights = terms.map(() => []);
        currentIndex = terms.map(() => -1);
        showPanel();
      }
    });
  }

  // ── Message listener (from background) ─────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggle-panel") {
      togglePanel();
    }
  });

  // ── Global keyboard listener ───────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    // Ctrl+Shift+F (physical Ctrl on all platforms) to toggle panel
    if (e.ctrlKey && e.shiftKey && e.key === "F") {
      togglePanel();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape" && panelVisible) {
      dismissPanel();
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // ── Init: restore persisted terms on page load ─────────────────────
  loadState();
})();
