/**
 * teacher.js
 * ------------------------------------------------------------------
 * All dashboard LOGIC lives here: fetching from TeacherDataProvider,
 * rendering the overview table, the student detail panel, and the
 * accuracy trend graph.
 *
 * This file only ever talks to `window.TeacherDataProvider` (see
 * fake-data.js). It never reaches into fake student arrays directly,
 * so swapping fake-data.js for a Firebase-backed provider later
 * should not require any changes here.
 * ------------------------------------------------------------------
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  const state = {
    classCode: "all",
    overview: [],       // last-fetched overview rows
    sortKey: "name",
    sortDir: 1,          // 1 asc, -1 desc
    searchTerm: "",
    selectedStudentId: null,
    trendScope: "overall", // 'overall' | 'game' | 'subject'
    trendSeries: null,     // gameId or subject name, when scope != overall
    sessionTimerId: null,
  };

  // ---------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------
  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheDom();
    bindStaticEvents();
    await populateClassFilter();
    await refreshOverview();
    startSessionClock();
  }

  function cacheDom() {
    els.classFilter = document.getElementById("class-filter");
    els.searchInput = document.getElementById("student-search");
    els.tableBody = document.getElementById("overview-body");
    els.tableStatus = document.getElementById("overview-status");
    els.headerCells = document.querySelectorAll("#overview-table thead th[data-sort-key]");
    els.statActive = document.getElementById("stat-active");
    els.statTotal = document.getElementById("stat-total");
    els.statAccuracy = document.getElementById("stat-accuracy");
    els.statQuestions = document.getElementById("stat-questions");

    els.panel = document.getElementById("student-panel");
    els.panelOverlay = document.getElementById("student-panel-overlay");
    els.panelClose = document.getElementById("panel-close");
    els.panelTitle = document.getElementById("panel-student-name");
    els.panelMeta = document.getElementById("panel-student-meta");
    els.gameStatsBody = document.getElementById("game-stats-body");

    els.trendScope = document.getElementById("trend-scope");
    els.trendSeries = document.getElementById("trend-series");
    els.trendSeriesWrap = document.getElementById("trend-series-wrap");
    els.trendBadge = document.getElementById("trend-badge");
    els.trendGraph = document.getElementById("trend-graph");
    els.trendSummary = document.getElementById("trend-summary");
  }

  function bindStaticEvents() {
    els.classFilter.addEventListener("change", async (e) => {
      state.classCode = e.target.value;
      await refreshOverview();
    });

    els.searchInput.addEventListener("input", (e) => {
      state.searchTerm = e.target.value.trim().toLowerCase();
      renderTable();
    });

    els.headerCells.forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sortKey;
        if (state.sortKey === key) {
          state.sortDir *= -1;
        } else {
          state.sortKey = key;
          state.sortDir = 1;
        }
        renderTable();
      });
      th.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          th.click();
        }
      });
    });

    els.panelClose.addEventListener("click", closeStudentPanel);
    els.panelOverlay.addEventListener("click", closeStudentPanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.panel.hidden) closeStudentPanel();
    });

    els.trendScope.addEventListener("change", () => {
      state.trendScope = els.trendScope.value;
      updateTrendSeriesOptions();
      renderTrendGraph();
    });

    els.trendSeries.addEventListener("change", () => {
      state.trendSeries = els.trendSeries.value;
      renderTrendGraph();
    });
  }

  // ---------------------------------------------------------------
  // Class filter + overview table
  // ---------------------------------------------------------------
  async function populateClassFilter() {
    const classes = await window.TeacherDataProvider.getClassCodes();
    els.classFilter.innerHTML =
      '<option value="all">All classes</option>' +
      classes
        .map((c) => `<option value="${c.code}">${c.code} — ${escapeHtml(c.subject)}</option>`)
        .join("");
  }

  async function refreshOverview() {
    els.tableStatus.textContent = "Loading class data…";
    els.tableStatus.hidden = false;
    try {
      state.overview = await window.TeacherDataProvider.getClassOverview(state.classCode);
      renderTable();
      renderHeaderStats();
      els.tableStatus.hidden = true;
    } catch (err) {
      els.tableStatus.textContent = "Couldn't load class data. Try again shortly.";
      els.tableStatus.hidden = false;
    }
  }

  function renderHeaderStats() {
    const rows = state.overview;
    const activeCount = rows.filter((r) => r.active).length;
    const avgAccuracy = rows.length
      ? Math.round(rows.reduce((s, r) => s + r.overall.accuracy, 0) / rows.length)
      : 0;
    const questionsToday = rows.reduce((s, r) => s + r.today.questionsAnswered, 0);

    els.statActive.textContent = `${activeCount}/${rows.length}`;
    els.statTotal.textContent = String(rows.length);
    els.statAccuracy.textContent = rows.length ? `${avgAccuracy}%` : "—";
    els.statQuestions.textContent = String(questionsToday);
  }

  function getFilteredSortedRows() {
    let rows = state.overview.filter((r) =>
      r.name.toLowerCase().includes(state.searchTerm)
    );

    const key = state.sortKey;
    rows = rows.slice().sort((a, b) => {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (va < vb) return -1 * state.sortDir;
      if (va > vb) return 1 * state.sortDir;
      return 0;
    });
    return rows;
  }

  function sortValue(row, key) {
    switch (key) {
      case "name":
        return row.name.toLowerCase();
      case "active":
        return row.active ? 1 : 0;
      case "session":
        return row.active ? Date.now() - row.sessionStartedAt : -1;
      case "today":
        return row.today.questionsAnswered;
      case "accuracy":
        return row.overall.accuracy;
      case "playtime":
        return row.overall.totalPlaytimeMinutes;
      case "favourite":
        return row.favouriteGame.toLowerCase();
      case "lastActive":
        return row.lastActive;
      default:
        return "";
    }
  }

  function renderTable() {
    const rows = getFilteredSortedRows();

    els.headerCells.forEach((th) => {
      if (th.dataset.sortKey === state.sortKey) {
        th.setAttribute("aria-sort", state.sortDir === 1 ? "ascending" : "descending");
      } else {
        th.setAttribute("aria-sort", "none");
      }
    });

    if (!rows.length) {
      els.tableBody.innerHTML = "";
      els.tableStatus.textContent = "No students match your search.";
      els.tableStatus.hidden = false;
      return;
    }
    els.tableStatus.hidden = true;

    els.tableBody.innerHTML = rows
      .map((row) => {
        const accClass = accuracyClass(row.overall.accuracy);
        return `
          <tr tabindex="0" data-student-id="${row.id}" class="student-row">
            <th scope="row" class="cell-name">
              <span class="student-avatar" aria-hidden="true">${initials(row.name)}</span>
              <span>${escapeHtml(row.name)}</span>
            </th>
            <td>
              <span class="status-pill ${row.active ? "status-pill--active" : "status-pill--idle"}">
                <span class="status-dot" aria-hidden="true"></span>
                ${row.active ? "Active now" : "Offline"}
              </span>
            </td>
            <td class="cell-numeric" data-session-cell data-session-start="${row.sessionStartedAt || ""}">
              ${row.active ? formatDuration(Date.now() - row.sessionStartedAt) : "—"}
            </td>
            <td class="cell-numeric">${row.today.questionsAnswered}</td>
            <td class="cell-numeric">
              <span class="accuracy-badge accuracy-badge--${accClass}">${row.overall.accuracy}%</span>
            </td>
            <td class="cell-numeric">${formatMinutes(row.overall.totalPlaytimeMinutes)}</td>
            <td>${escapeHtml(row.favouriteGame)}</td>
            <td class="cell-numeric">${formatRelativeTime(row.lastActive)}</td>
          </tr>
        `;
      })
      .join("");

    els.tableBody.querySelectorAll(".student-row").forEach((tr) => {
      tr.addEventListener("click", () => openStudentPanel(tr.dataset.studentId));
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openStudentPanel(tr.dataset.studentId);
        }
      });
    });
  }

  // Live-update "current session duration" cells once a minute
  // without re-fetching or re-rendering the whole table.
  function startSessionClock() {
    if (state.sessionTimerId) clearInterval(state.sessionTimerId);
    state.sessionTimerId = setInterval(() => {
      document.querySelectorAll("[data-session-cell]").forEach((cell) => {
        const start = Number(cell.dataset.sessionStart);
        if (start) cell.textContent = formatDuration(Date.now() - start);
      });
    }, 30000);
  }

  // ---------------------------------------------------------------
  // Student detail panel
  // ---------------------------------------------------------------
  let lastFocusedElement = null;

  async function openStudentPanel(studentId) {
    state.selectedStudentId = studentId;
    lastFocusedElement = document.activeElement;

    els.panel.hidden = false;
    els.panelOverlay.hidden = false;
    els.panelTitle.textContent = "Loading…";
    els.gameStatsBody.innerHTML = "";
    els.trendSummary.textContent = "";
    els.trendGraph.innerHTML = "";
    document.body.classList.add("panel-open");

    const detail = await window.TeacherDataProvider.getStudentDetail(studentId);
    if (!detail || state.selectedStudentId !== studentId) return;

    els.panelTitle.textContent = detail.name;
    els.panelMeta.textContent = `${detail.classCode} — ${detail.subject} · Favourite game: ${detail.favouriteGame}`;

    renderGameStats(detail.games);

    // Reset trend controls for the newly opened student.
    state.trendScope = "overall";
    state.trendSeries = null;
    els.trendScope.value = "overall";
    updateTrendSeriesOptions();

    await loadAndRenderTrend(studentId);

    els.panelClose.focus();
  }

  function closeStudentPanel() {
    els.panel.hidden = true;
    els.panelOverlay.hidden = true;
    document.body.classList.remove("panel-open");
    state.selectedStudentId = null;
    if (lastFocusedElement) lastFocusedElement.focus();
  }

  function renderGameStats(games) {
    if (!games.length) {
      els.gameStatsBody.innerHTML = `<tr><td colspan="6">No game sessions recorded yet.</td></tr>`;
      return;
    }
    els.gameStatsBody.innerHTML = games
      .map(
        (g) => `
          <tr>
            <th scope="row">${escapeHtml(g.gameName)}</th>
            <td class="cell-numeric">${g.highScore.toLocaleString()}</td>
            <td class="cell-numeric">
              <span class="accuracy-badge accuracy-badge--${accuracyClass(g.accuracy)}">${g.accuracy}%</span>
            </td>
            <td class="cell-numeric">${g.questionsAnswered}</td>
            <td class="cell-numeric">${formatMinutes(g.playtimeMinutes)}</td>
            <td class="cell-numeric">${formatDate(g.lastPlayed)}</td>
          </tr>
        `
      )
      .join("");
  }

  // ---------------------------------------------------------------
  // Trend controls (overall / by game / by subject)
  // ---------------------------------------------------------------
  let cachedHistory = [];

  async function loadAndRenderTrend(studentId) {
    cachedHistory = await window.TeacherDataProvider.getStudentHistory(studentId);
    if (state.selectedStudentId !== studentId) return;
    renderTrendGraph();
  }

  function updateTrendSeriesOptions() {
    const scope = state.trendScope;
    if (scope === "overall") {
      els.trendSeriesWrap.hidden = true;
      state.trendSeries = null;
      return;
    }
    els.trendSeriesWrap.hidden = false;

    let options = [];
    if (scope === "game") {
      const gameIds = new Set();
      cachedHistory.forEach((r) => Object.keys(r.byGame).forEach((id) => gameIds.add(id)));
      options = Array.from(gameIds).map((id) => ({ value: id, label: gameLabel(id) }));
    } else if (scope === "subject") {
      const subjects = new Set();
      cachedHistory.forEach((r) => Object.keys(r.bySubject).forEach((s) => subjects.add(s)));
      options = Array.from(subjects).map((s) => ({ value: s, label: s }));
    } else if (scope === "questionType") {
      // Built from whatever question-type keys actually appear in this
      // student's history, so adding a new type elsewhere (fake-data.js
      // or, later, Firebase) shows up here automatically — nothing to
      // hardcode in this file.
      const typeIds = new Set();
      cachedHistory.forEach((r) => Object.keys(r.byQuestionType || {}).forEach((t) => typeIds.add(t)));
      options = Array.from(typeIds).map((id) => ({ value: id, label: questionTypeLabel(id) }));
    }

    if (!options.length) {
      els.trendSeries.innerHTML = `<option value="">No data yet</option>`;
      state.trendSeries = null;
      return;
    }

    els.trendSeries.innerHTML = options
      .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
      .join("");
    state.trendSeries = options[0].value;
    els.trendSeries.value = state.trendSeries;
  }

  function gameLabel(gameId) {
    const known = {
      "cavern-crammer": "Cavern Crammer",
      "shuriken-scholar": "Shuriken Scholar",
      wordslinger: "Wild West Wordslinger",
      jetpack: "Pixel Jetpack",
      "nova-guardians": "Nova Guardians",
      "bloom-brigade": "Bloom Brigade",
    };
    return known[gameId] || gameId;
  }

  // Falls back to a capitalised version of the id, so a brand new
  // question type added in fake-data.js (or later, Firebase) still
  // gets a readable label even before anyone updates this map.
  function questionTypeLabel(typeId) {
    const known = {
      multichoice: "Multichoice",
      matching: "Matching",
      category: "Category",
    };
    if (known[typeId]) return known[typeId];
    return typeId
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function getTrendPoints() {
    if (state.trendScope === "overall") {
      return cachedHistory.map((r) => ({ date: r.date, value: r.overallAccuracy }));
    }
    if (state.trendScope === "game") {
      return cachedHistory
        .filter((r) => state.trendSeries in r.byGame)
        .map((r) => ({ date: r.date, value: r.byGame[state.trendSeries] }));
    }
    if (state.trendScope === "subject") {
      return cachedHistory
        .filter((r) => state.trendSeries in r.bySubject)
        .map((r) => ({ date: r.date, value: r.bySubject[state.trendSeries] }));
    }
    if (state.trendScope === "questionType") {
      return cachedHistory
        .filter((r) => r.byQuestionType && state.trendSeries in r.byQuestionType)
        .map((r) => ({ date: r.date, value: r.byQuestionType[state.trendSeries] }));
    }
    return [];
  }

  /** Simple least-squares slope, in accuracy points per record. */
  function calculateTrendSlope(points) {
    const n = points.length;
    if (n < 2) return 0;
    const xs = points.map((_, i) => i);
    const ys = points.map((p) => p.value);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }

  function classifyTrend(slope) {
    if (slope >= 1.2) return { key: "improving", label: "Improving" };
    if (slope <= -1.2) return { key: "declining", label: "Declining" };
    return { key: "stable", label: "Steady" };
  }

  function renderTrendGraph() {
    const points = getTrendPoints();
    els.trendGraph.innerHTML = "";
    els.trendBadge.className = "trend-badge";

    if (points.length < 2) {
      els.trendGraph.innerHTML = `<p class="trend-empty">Not enough records yet to plot a trend.</p>`;
      els.trendSummary.textContent = "";
      els.trendBadge.textContent = "No data";
      return;
    }

    const slope = calculateTrendSlope(points);
    const trend = classifyTrend(slope);
    els.trendBadge.textContent = trend.label;
    els.trendBadge.classList.add(`trend-badge--${trend.key}`);

    const first = points[0].value;
    const last = points[points.length - 1].value;
    const change = last - first;
    const changeText =
      change === 0 ? "unchanged" : `${change > 0 ? "up" : "down"} ${Math.abs(change)} points`;

    els.trendSummary.textContent =
      `Accuracy trend: ${trend.label.toLowerCase()} — ${changeText} over the last ${points.length} records ` +
      `(from ${first}% on ${formatDate(points[0].date)} to ${last}% on ${formatDate(points[points.length - 1].date)}).`;

    els.trendGraph.appendChild(buildSvgChart(points, trend.key));
  }

  function buildSvgChart(points, trendKey) {
    const width = 640;
    const height = 240;
    const padding = { top: 20, right: 24, bottom: 36, left: 40 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const minY = 0;
    const maxY = 100;
    const xFor = (i) => padding.left + (innerW * i) / (points.length - 1);
    const yFor = (v) => padding.top + innerH - (innerH * (v - minY)) / (maxY - minY);

    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `Accuracy trend chart showing ${points.length} recorded sessions, ranging from ${Math.min(
        ...points.map((p) => p.value)
      )}% to ${Math.max(...points.map((p) => p.value))}%.`
    );
    svg.classList.add("trend-svg");

    // Gridlines at 0/25/50/75/100
    [0, 25, 50, 75, 100].forEach((tick) => {
      const y = yFor(tick);
      const line = document.createElementNS(svgNs, "line");
      line.setAttribute("x1", padding.left);
      line.setAttribute("x2", width - padding.right);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("class", "trend-grid-line");
      svg.appendChild(line);

      const label = document.createElementNS(svgNs, "text");
      label.setAttribute("x", padding.left - 8);
      label.setAttribute("y", y + 4);
      label.setAttribute("class", "trend-axis-label");
      label.setAttribute("text-anchor", "end");
      label.textContent = `${tick}%`;
      svg.appendChild(label);
    });

    // Date labels: first, middle, last to avoid crowding.
    const labelIdxs = new Set([0, points.length - 1, Math.floor((points.length - 1) / 2)]);
    labelIdxs.forEach((i) => {
      const label = document.createElementNS(svgNs, "text");
      label.setAttribute("x", xFor(i));
      label.setAttribute("y", height - padding.bottom + 20);
      label.setAttribute("class", "trend-axis-label");
      label.setAttribute("text-anchor", "middle");
      label.textContent = formatDate(points[i].date);
      svg.appendChild(label);
    });

    // Line path
    const d = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`)
      .join(" ");
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", `trend-line trend-line--${trendKey}`);
    path.setAttribute("fill", "none");
    svg.appendChild(path);

    // Points (with native <title> tooltips for accessibility/mouse users)
    points.forEach((p, i) => {
      const circle = document.createElementNS(svgNs, "circle");
      circle.setAttribute("cx", xFor(i));
      circle.setAttribute("cy", yFor(p.value));
      circle.setAttribute("r", i === points.length - 1 ? 6 : 4);
      circle.setAttribute("class", `trend-point trend-point--${trendKey}`);
      const title = document.createElementNS(svgNs, "title");
      title.textContent = `${formatDate(p.date)}: ${p.value}%`;
      circle.appendChild(title);
      svg.appendChild(circle);
    });

    return svg;
  }

  // ---------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------
  function initials(name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }

  function accuracyClass(accuracy) {
    if (accuracy >= 80) return "good";
    if (accuracy >= 60) return "ok";
    return "low";
  }

  function formatDuration(ms) {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  function formatMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  function formatDate(isoDateStr) {
    const d = new Date(`${isoDateStr}T00:00:00`);
    return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
  }

  function formatRelativeTime(isoString) {
    const then = new Date(isoString).getTime();
    const diffMs = Date.now() - then;
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return `${diffDay}d ago`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
