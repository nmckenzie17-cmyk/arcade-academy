/**
 * teacher.js
 * ------------------------------------------------------------------
 * All dashboard logic lives here: fetching from TeacherDataProvider,
 * rendering the overview table, the student detail panel, and the
 * accuracy trend graph.
 *
 * This file only talks to `window.TeacherDataProvider`; direct Firebase
 * communication stays in the shared FirebaseManager.
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
    selectedStudentDetail: null,
    pendingReset: null,
    gameCatalog: {},
    trendScope: "overall", // 'overall' | 'game' | 'subject'
    trendSeries: null,     // gameId or subject name, when scope != overall
    sessionTimerId: null,
    dashboardInitialized: false,
    authCheckId: 0,
  };

  // ---------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------
  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheDom();
    bindAuthEvents();
    showAccessScreen("loading");
    window.FirebaseManager.watchAuthState(handleTeacherAuthState);
  }

  function cacheDom() {
    els.loadingScreen = document.getElementById("teacher-loading-screen");
    els.loginScreen = document.getElementById("teacher-login-screen");
    els.deniedScreen = document.getElementById("teacher-denied-screen");
    els.dashboardScreen = document.getElementById("teacher-dashboard-screen");
    els.googleSignIn = document.getElementById("teacher-google-sign-in");
    els.loginError = document.getElementById("teacher-login-error");
    els.signOut = document.getElementById("teacher-sign-out");
    els.deniedSignOut = document.getElementById("teacher-denied-sign-out");
    els.classResetSelect = document.getElementById("class-reset-select");
    els.classResetCount = document.getElementById("class-reset-student-count");
    els.classResetGameSelect = document.getElementById("class-reset-game-select");
    els.classResetGameButton = document.getElementById("class-reset-game-button");
    els.classResetAllButton = document.getElementById("class-reset-all-button");
    els.classResetResult = document.getElementById("class-reset-result");
    els.resetHistoryBody = document.getElementById("reset-history-body");
    els.resetHistoryStatus = document.getElementById("reset-history-status");
    els.classFilter = document.getElementById("class-filter");
    els.refreshClassButton = document.getElementById("refresh-class-button");
    els.searchInput = document.getElementById("student-search");
    els.tableBody = document.getElementById("overview-body");
    els.tableStatus = document.getElementById("overview-status");
    els.headerCells = document.querySelectorAll("#overview-table thead th[data-sort-key]");
    els.statActive = document.getElementById("stat-active");
    els.statTotal = document.getElementById("stat-total");
    els.statAccuracy = document.getElementById("stat-accuracy");
    els.statQuestions = document.getElementById("stat-questions");
    els.statTotalQuestions = document.getElementById("stat-total-questions");
    els.statTotalPlaytime = document.getElementById("stat-total-playtime");
    els.statTotalLabel = document.getElementById("stat-total-label");
    els.statisticsHeading = document.getElementById("statistics-heading");
    els.statisticsScope = document.getElementById("statistics-scope");
    els.overviewHeading = document.getElementById("overview-heading");

    els.panel = document.getElementById("student-panel");
    els.panelOverlay = document.getElementById("student-panel-overlay");
    els.panelClose = document.getElementById("panel-close");
    els.panelTitle = document.getElementById("panel-student-name");
    els.panelMeta = document.getElementById("panel-student-meta");
    els.studentNameInput = document.getElementById("student-name-input");
    els.studentYearSelect = document.getElementById("student-year-select");
    els.studentProfileSave = document.getElementById("student-profile-save");
    els.studentProfileResult = document.getElementById("student-profile-result");
    els.studentClassSelect = document.getElementById("student-class-select");
    els.studentClassSave = document.getElementById("student-class-save");
    els.studentClassResult = document.getElementById("student-class-result");
    els.studentCoinsInput = document.getElementById("student-coins-input");
    els.studentCoinsSave = document.getElementById("student-coins-save");
    els.studentCoinsResult = document.getElementById("student-coins-result");
    els.studentQuestionFormat = document.getElementById("student-question-format");
    els.studentQuestionFormatSave = document.getElementById("student-question-format-save");
    els.studentQuestionFormatResult = document.getElementById("student-question-format-result");
    els.questionFormatClass = document.getElementById("question-format-class");
    els.classQuestionFormat = document.getElementById("class-question-format");
    els.classQuestionFormatSave = document.getElementById("class-question-format-save");
    els.classQuestionFormatResult = document.getElementById("class-question-format-result");
    els.gameStatsBody = document.getElementById("game-stats-body");
    els.resetGameSelect = document.getElementById("reset-game-select");
    els.resetGameButton = document.getElementById("reset-game-button");
    els.resetLearningButton = document.getElementById("reset-learning-button");
    els.resetAllButton = document.getElementById("reset-all-button");
    els.deleteStudentButton = document.getElementById("delete-student-button");
    els.resetResult = document.getElementById("reset-result");
    els.resetOverlay = document.getElementById("reset-confirm-overlay");
    els.resetTitle = document.getElementById("reset-confirm-title");
    els.resetMessage = document.getElementById("reset-confirm-message");
    els.resetTypeWrap = document.getElementById("reset-type-wrap");
    els.resetTypeLabel = document.getElementById("reset-type-label");
    els.resetInput = document.getElementById("reset-confirm-input");
    els.resetCancel = document.getElementById("reset-cancel-button");
    els.resetContinue = document.getElementById("reset-continue-button");
    els.resetFinal = document.getElementById("reset-final-button");

    els.trendScope = document.getElementById("trend-scope");
    els.trendSeries = document.getElementById("trend-series");
    els.trendSeriesWrap = document.getElementById("trend-series-wrap");
    els.trendBadge = document.getElementById("trend-badge");
    els.trendGraph = document.getElementById("trend-graph");
    els.trendSummary = document.getElementById("trend-summary");
  }

  function bindAuthEvents() {
    els.googleSignIn.addEventListener("click", async () => {
      els.googleSignIn.disabled = true;
      els.googleSignIn.textContent = "Signing in…";
      els.loginError.hidden = true;

      const user = await window.FirebaseManager.signInWithGoogle();
      if (!user) {
        els.loginError.textContent = "Google sign-in did not complete. Please try again.";
        els.loginError.hidden = false;
      }

      els.googleSignIn.disabled = false;
      els.googleSignIn.textContent = "Sign in with Google";
    });

    els.signOut.addEventListener("click", signOutTeacher);
    els.deniedSignOut.addEventListener("click", signOutTeacher);
  }

  async function signOutTeacher() {
    const returnScreen = els.deniedScreen.hidden ? "dashboard" : "denied";
    state.authCheckId += 1;
    showAccessScreen("loading");
    clearDashboardData();
    const signedOut = await window.FirebaseManager.signOut();
    if (!signedOut) showAccessScreen(returnScreen);
  }

  async function handleTeacherAuthState(user) {
    const checkId = ++state.authCheckId;
    clearDashboardData();

    if (!user) {
      showAccessScreen("login");
      return;
    }

    showAccessScreen("loading");
    const profile = await window.FirebaseManager.getUserProfile(user.uid);
    if (checkId !== state.authCheckId) return;

    if (!profile || profile.role !== "teacher") {
      showAccessScreen("denied");
      return;
    }

    try {
      if (!state.dashboardInitialized) {
        bindStaticEvents();
        state.dashboardInitialized = true;
        startSessionClock();
      }
      await populateClassFilter();
      await refreshOverview();
      await initializeClassResetControls();
      await loadResetHistory();
      if (checkId === state.authCheckId) showAccessScreen("dashboard");
    } catch (error) {
      console.error("Teacher dashboard initialization failed:", error);
      showOverviewError();
      if (checkId === state.authCheckId) showAccessScreen("dashboard");
    }
  }

  function showAccessScreen(name) {
    els.loadingScreen.hidden = name !== "loading";
    els.loginScreen.hidden = name !== "login";
    els.deniedScreen.hidden = name !== "denied";
    els.dashboardScreen.hidden = name !== "dashboard";
    if (name !== "dashboard" && !els.panel.hidden) closeStudentPanel();
  }

  function clearDashboardData() {
    state.overview = [];
    state.selectedStudentId = null;
    state.selectedStudentDetail = null;
    cachedHistory = [];
    window.TeacherDataProvider.clearCache?.();
    if (els.tableBody) els.tableBody.innerHTML = "";
    if (els.tableStatus) els.tableStatus.textContent = "";
  }

  function bindStaticEvents() {
    els.classFilter.addEventListener("change", async (e) => {
      state.classCode = e.target.value;
      await refreshOverview();
    });

    els.refreshClassButton.addEventListener("click", refreshSelectedClass);

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

    els.resetGameButton.addEventListener("click", () => beginReset("game"));
    els.resetLearningButton.addEventListener("click", () => beginReset("learning"));
    els.resetAllButton.addEventListener("click", () => beginReset("all"));
    els.deleteStudentButton.addEventListener("click", beginStudentDeletion);
    els.studentProfileSave.addEventListener("click", saveStudentProfile);
    els.studentClassSave.addEventListener("click", saveStudentClass);
    els.studentCoinsSave.addEventListener("click", saveStudentCoins);
    els.studentQuestionFormatSave.addEventListener("click", saveStudentQuestionFormat);
    els.classQuestionFormatSave.addEventListener("click", saveClassQuestionFormat);
    els.questionFormatClass.addEventListener("change", loadClassQuestionFormat);
    els.resetCancel.addEventListener("click", closeResetConfirmation);
    els.resetContinue.addEventListener("click", showFinalResetWarning);
    els.resetFinal.addEventListener("click", submitProgressReset);
    els.resetInput.addEventListener("input", () => {
      els.resetFinal.disabled = els.resetInput.value !== state.pendingReset?.confirmText;
    });
    els.classResetSelect.addEventListener("change", updateClassResetCount);
    els.classResetGameButton.addEventListener("click", () => beginClassReset("game"));
    els.classResetAllButton.addEventListener("click", () => beginClassReset("all"));
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
    els.classResetSelect.innerHTML = classes.length
      ? classes.map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.code)} — ${escapeHtml(c.subject)}</option>`).join("")
      : '<option value="">No classes available</option>';
    els.questionFormatClass.innerHTML = classes.length
      ? classes.map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.code)} — ${escapeHtml(c.subject)}</option>`).join("")
      : '<option value="">No classes available</option>';
    await loadClassQuestionFormat();
  }

  async function loadClassQuestionFormat() {
    const className = els.questionFormatClass.value;
    if (!className) return;
    els.classQuestionFormat.value = await window.TeacherDataProvider.getClassQuestionFormat(className);
  }

  async function saveClassQuestionFormat() {
    const className = els.questionFormatClass.value;
    if (!className) return;
    els.classQuestionFormatSave.disabled = true;
    try {
      await window.TeacherDataProvider.setClassQuestionFormat(className, els.classQuestionFormat.value);
      els.classQuestionFormatResult.textContent = `Saved ${els.classQuestionFormat.options[els.classQuestionFormat.selectedIndex].text} for ${className}.`;
    } catch (error) {
      console.error("Unable to save class question format:", error);
      els.classQuestionFormatResult.textContent = "The class format could not be saved.";
    } finally { els.classQuestionFormatSave.disabled = false; }
  }

  async function saveStudentQuestionFormat() {
    const detail = state.selectedStudentDetail;
    if (!detail) return;
    els.studentQuestionFormatSave.disabled = true;
    try {
      await window.TeacherDataProvider.setStudentQuestionFormat(detail.id, els.studentQuestionFormat.value);
      detail.questionFormatOverride = els.studentQuestionFormat.value;
      els.studentQuestionFormatResult.textContent = "Student question format saved.";
    } catch (error) {
      console.error("Unable to save student question format:", error);
      els.studentQuestionFormatResult.textContent = "The student format could not be saved.";
    } finally { els.studentQuestionFormatSave.disabled = false; }
  }

  async function initializeClassResetControls() {
    const games = await window.TeacherDataProvider.getGamesCatalog();
    state.gameCatalog = Object.fromEntries(games.map((game) => [game.id, game.name]));
    els.classResetGameSelect.innerHTML = games.length
      ? games.map((game) => `<option value="${escapeHtml(game.id)}">${escapeHtml(game.name)}</option>`).join("")
      : '<option value="">No games available</option>';
    els.classResetGameButton.disabled = games.length === 0;
    els.classResetAllButton.disabled = !els.classResetSelect.value;
    await updateClassResetCount();
  }

  async function updateClassResetCount() {
    const className = els.classResetSelect.value;
    const count = className ? await window.TeacherDataProvider.getClassStudentCount(className) : 0;
    els.classResetCount.textContent = String(count);
    els.classResetGameButton.disabled = count === 0 || !els.classResetGameSelect.value;
    els.classResetAllButton.disabled = count === 0;
  }

  async function loadResetHistory() {
    els.resetHistoryStatus.textContent = "Loading reset history…";
    els.resetHistoryStatus.hidden = false;
    try {
      const history = await window.TeacherDataProvider.getResetHistory();
      if (!history.length) {
        els.resetHistoryBody.innerHTML = "";
        els.resetHistoryStatus.textContent = "No class reset operations have been recorded yet.";
        return;
      }
      els.resetHistoryBody.innerHTML = history.map((operation) => `
        <tr>
          <td class="cell-numeric">${formatDateTime(operation.requestedAt)}</td>
          <td>${escapeHtml(operation.teacherName || "Teacher")}</td>
          <td>${escapeHtml(operation.className || "Unknown class")}</td>
          <td class="cell-numeric">${Number(operation.studentsAffected || operation.processedStudents || 0)}</td>
          <td>${escapeHtml(operation.resetScope === "all" ? "All progress" : gameLabel(operation.gameId || "Game"))}</td>
          <td><span class="reset-status reset-status--${escapeHtml(operation.status || "unknown")}">${escapeHtml(operation.status || "Unknown")}</span></td>
        </tr>
      `).join("");
      els.resetHistoryStatus.hidden = true;
    } catch (error) {
      console.error("Unable to load reset history:", error);
      els.resetHistoryStatus.textContent = "Reset history could not be loaded.";
    }
  }

  async function refreshOverview() {
    els.tableStatus.textContent = "Loading class data…";
    els.tableStatus.hidden = false;
    try {
      state.overview = await window.TeacherDataProvider.getClassOverview(state.classCode);
      renderTable();
      renderHeaderStats();
    } catch (err) {
      console.error("Unable to refresh student overview:", err);
      showOverviewError();
    }
  }

  async function refreshSelectedClass() {
    const selectedClass = state.classCode;
    const selectedStudentId = state.selectedStudentId;
    els.refreshClassButton.disabled = true;
    els.refreshClassButton.textContent = "↻ Refreshing…";
    window.TeacherDataProvider.clearCache?.();
    try {
      await refreshOverview();
      // Preserve the current class and all table filters/sorting. If its student
      // panel is open, refresh that student's values from the same new snapshot.
      if (selectedStudentId && state.selectedStudentId === selectedStudentId) {
        const stillInView = state.overview.some(student => student.id === selectedStudentId);
        if (stillInView) await openStudentPanel(selectedStudentId);
        else closeStudentPanel();
      }
      els.classFilter.value = selectedClass;
    } finally {
      els.refreshClassButton.disabled = false;
      els.refreshClassButton.textContent = "↻ Refresh Class";
    }
  }

  function renderHeaderStats() {
    const rows = state.overview;
    const activeCount = rows.filter((r) => r.active).length;
    const totalQuestions = rows.reduce((sum, row) => sum + row.overall.totalQuestionsAnswered, 0);
    const totalCorrect = rows.reduce((sum, row) => sum + row.overall.totalCorrect, 0);
    const avgAccuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const questionsToday = rows.reduce((s, r) => s + r.today.questionsAnswered, 0);
    const totalPlaytime = rows.reduce((sum, row) => sum + row.overall.totalPlaytimeMinutes, 0);
    const allClasses = state.classCode === "all";
    const selectedOption = els.classFilter.options[els.classFilter.selectedIndex];
    const scopeLabel = allClasses ? "All classes" : (selectedOption?.textContent || state.classCode);

    els.statActive.textContent = `${activeCount}/${rows.length}`;
    els.statTotal.textContent = String(rows.length);
    els.statAccuracy.textContent = rows.length ? `${avgAccuracy}%` : "—";
    els.statQuestions.textContent = String(questionsToday);
    els.statTotalQuestions.textContent = totalQuestions.toLocaleString();
    els.statTotalPlaytime.textContent = formatMinutes(totalPlaytime);
    els.statTotalLabel.textContent = allClasses ? "Total students" : "Students in class";
    els.statisticsHeading.textContent = allClasses ? "Overall statistics" : "Class statistics";
    els.statisticsScope.textContent = scopeLabel;
    els.overviewHeading.textContent = allClasses ? "All students" : `Class overview — ${state.classCode}`;
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
      case "questions":
        return row.overall.totalQuestionsAnswered;
      case "accuracy":
        return row.overall.accuracy;
      case "playtime":
        return row.overall.totalPlaytimeMinutes;
      case "favourite":
        return row.favouriteGame.toLowerCase();
      case "lastActive":
        return row.lastActive || 0;
      case "coins":
        return row.coins;
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
      els.tableStatus.textContent = state.overview.length
        ? "No students match your search."
        : "No student data available yet.";
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
              <span>${escapeHtml(row.name)}<small class="student-meta">${escapeHtml(row.yearLevel)} · ${escapeHtml(row.className)}</small></span>
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
            <td class="cell-numeric">${row.overall.totalQuestionsAnswered}</td>
            <td class="cell-numeric">
              <span class="accuracy-badge accuracy-badge--${accClass}">${row.overall.accuracy}%</span>
            </td>
            <td class="cell-numeric">${formatMinutes(row.overall.totalPlaytimeMinutes)}</td>
            <td>${escapeHtml(row.favouriteGame)}</td>
            <td class="cell-numeric">${formatRelativeTime(row.lastActive)}</td>
            <td class="cell-numeric">${Math.floor(row.coins).toLocaleString()}</td>
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
    els.resetResult.textContent = "";
    els.studentProfileResult.textContent = "";
    els.studentClassResult.textContent = "";
    els.studentCoinsResult.textContent = "";
    document.body.classList.add("panel-open");

    let detail;
    try {
      detail = await window.TeacherDataProvider.getStudentDetail(studentId);
    } catch (error) {
      console.error("Unable to load student detail:", error);
      if (state.selectedStudentId === studentId) {
        els.panelTitle.textContent = "Couldn't load student data";
        els.gameStatsBody.innerHTML = `<tr><td colspan="9">Firestore data could not be read. Check authentication and security rules.</td></tr>`;
      }
      return;
    }
    if (!detail || state.selectedStudentId !== studentId) return;
    state.selectedStudentDetail = detail;

    els.panelTitle.textContent = detail.name;
    els.panelMeta.textContent = `${detail.yearLevel} · ${detail.className} · ${Math.floor(detail.coins).toLocaleString()} coins · Favourite game: ${detail.favouriteGame}`;
    els.studentNameInput.value = detail.name;
    els.studentYearSelect.value = detail.yearLevel;
    els.studentCoinsInput.value = Math.max(0,Math.floor(Number(detail.coins)||0));
    els.studentQuestionFormat.value = detail.questionFormatOverride || "mixed";
    populateStudentClassOptions(detail);

    renderGameStats(detail.games);
    const gameCatalog = await window.TeacherDataProvider.getGamesCatalog();
    state.gameCatalog = Object.fromEntries(gameCatalog.map((game) => [game.id, game.name]));
    if (state.selectedStudentId !== studentId) return;
    populateResetGameOptions(gameCatalog);

    // Reset trend controls for the newly opened student.
    state.trendScope = "overall";
    state.trendSeries = null;
    els.trendScope.value = "overall";
    updateTrendSeriesOptions();

    await loadAndRenderTrend(studentId);

    els.panelClose.focus();
  }

  function closeStudentPanel() {
    closeResetConfirmation();
    els.panel.hidden = true;
    els.panelOverlay.hidden = true;
    document.body.classList.remove("panel-open");
    state.selectedStudentId = null;
    state.selectedStudentDetail = null;
    if (lastFocusedElement) lastFocusedElement.focus();
  }

  function renderGameStats(games) {
    if (!games.length) {
      els.gameStatsBody.innerHTML = `<tr><td colspan="9">No game sessions recorded yet.</td></tr>`;
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
            <td class="cell-numeric">${g.correct}</td>
            <td class="cell-numeric">${g.incorrect}</td>
            <td class="cell-numeric">${formatMinutes(g.playtimeMinutes)}</td>
            <td class="cell-numeric">${formatDate(g.lastPlayed)}</td>
            <td class="cell-numeric">${g.gamesPlayed}</td>
          </tr>
        `
      )
      .join("");
  }

  function populateResetGameOptions(games) {
    els.resetGameSelect.innerHTML = games.length
      ? games.map((game) => `<option value="${escapeHtml(game.id)}">${escapeHtml(game.name)}</option>`).join("")
      : '<option value="">No games available</option>';
    els.resetGameButton.disabled = games.length === 0;
  }

  function populateStudentClassOptions(detail) {
    const year = Number((/\d+/.exec(detail.yearLevel || "") || [])[0]);
    const configuredClasses = window.getClassOptionsForYear?.(year) || [];
    const observedClasses = state.overview
      .filter(student => student.yearLevel === detail.yearLevel)
      .map(student => student.className)
      .filter(Boolean);
    const classes = [...new Set([detail.className, ...configuredClasses, ...observedClasses].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    els.studentClassSelect.innerHTML = classes
      .map(className => `<option value="${escapeHtml(className)}"${className === detail.className ? " selected" : ""}>${escapeHtml(className)}</option>`)
      .join("");
    els.studentClassSave.disabled = classes.length === 0;
  }

  async function saveStudentProfile() {
    const detail = state.selectedStudentDetail;
    const displayName = els.studentNameInput.value.trim();
    const yearLevel = els.studentYearSelect.value;
    if (!detail) return;
    if (!displayName) {
      els.studentProfileResult.textContent = "Enter a student name first.";
      els.studentNameInput.focus();
      return;
    }
    if (displayName === detail.name && yearLevel === detail.yearLevel) {
      els.studentProfileResult.textContent = "The name and year level are already up to date.";
      return;
    }

    els.studentProfileSave.disabled = true;
    els.studentProfileSave.textContent = "Saving…";
    els.studentProfileResult.textContent = "";
    try {
      await window.TeacherDataProvider.updateStudentProfile(detail.id, { displayName, yearLevel });
      detail.name = displayName;
      detail.yearLevel = yearLevel;
      els.panelTitle.textContent = detail.name;
      els.panelMeta.textContent = `${detail.yearLevel} · ${detail.className} · ${Math.floor(detail.coins).toLocaleString()} coins · Favourite game: ${detail.favouriteGame}`;
      populateStudentClassOptions(detail);
      els.studentProfileResult.textContent = `Updated ${detail.name} to ${detail.yearLevel}.`;
      await refreshOverview();
    } catch (error) {
      console.error("Unable to update student profile:", error);
      els.studentProfileResult.textContent = "The student profile could not be updated. Check teacher write permissions and try again.";
    } finally {
      els.studentProfileSave.disabled = false;
      els.studentProfileSave.textContent = "Save Name & Year";
    }
  }

  async function saveStudentClass() {
    const detail = state.selectedStudentDetail;
    const className = els.studentClassSelect.value;
    if (!detail || !className || className === detail.className) {
      els.studentClassResult.textContent = className === detail?.className ? "This student is already assigned to that class." : "Choose a class first.";
      return;
    }

    els.studentClassSave.disabled = true;
    els.studentClassSave.textContent = "Saving…";
    els.studentClassResult.textContent = "";
    try {
      await window.TeacherDataProvider.updateStudentClass(detail.id, className);
      detail.className = className;
      els.panelMeta.textContent = `${detail.yearLevel} · ${detail.className} · ${Math.floor(detail.coins).toLocaleString()} coins · Favourite game: ${detail.favouriteGame}`;
      els.studentClassResult.textContent = `Class updated to ${className}.`;
      await refreshOverview();
    } catch (error) {
      console.error("Unable to change student class:", error);
      els.studentClassResult.textContent = "The class could not be updated. Check teacher write permissions and try again.";
    } finally {
      els.studentClassSave.disabled = false;
      els.studentClassSave.textContent = "Save Class";
    }
  }

  async function saveStudentCoins() {
    const detail = state.selectedStudentDetail;
    const coins = Number(els.studentCoinsInput.value);
    if (!detail) return;
    if (!Number.isSafeInteger(coins) || coins < 0 || coins > 999999999) {
      els.studentCoinsResult.textContent = "Enter a whole number from 0 to 999,999,999.";
      els.studentCoinsInput.focus();
      return;
    }
    if (coins === Math.floor(Number(detail.coins)||0)) {
      els.studentCoinsResult.textContent = "The coin balance is already up to date.";
      return;
    }

    els.studentCoinsSave.disabled = true;
    els.studentCoinsSave.textContent = "Saving…";
    els.studentCoinsResult.textContent = "";
    try {
      await window.TeacherDataProvider.updateStudentCoins(detail.id, coins);
      detail.coins = coins;
      els.panelMeta.textContent = `${detail.yearLevel} · ${detail.className} · ${coins.toLocaleString()} coins · Favourite game: ${detail.favouriteGame}`;
      els.studentCoinsResult.textContent = `Coin balance updated to ${coins.toLocaleString()}.`;
      await refreshOverview();
    } catch (error) {
      console.error("Unable to update student coins:", error);
      els.studentCoinsResult.textContent = "The coin balance could not be updated. Check teacher write permissions and try again.";
    } finally {
      els.studentCoinsSave.disabled = false;
      els.studentCoinsSave.textContent = "Save Coins";
    }
  }

  function beginReset(type) {
    const detail = state.selectedStudentDetail;
    if (!detail) return;
    const gameId = type === "game" ? els.resetGameSelect.value : null;
    if (type === "game" && !gameId) return;
    const gameName = type === "game"
      ? els.resetGameSelect.options[els.resetGameSelect.selectedIndex].textContent
      : null;

    state.pendingReset = { target: "student", type, gameId, gameName, studentId: detail.id, studentName: detail.name, confirmText: type === "all" ? "RESET" : null };
    els.resetTitle.textContent = type === "all"
      ? "Reset all student progress?"
      : type === "learning" ? "Reset learning statistics?" : `Reset ${gameName}?`;
    els.resetMessage.textContent = type === "all"
      ? `Reset all Arcade Academy progress for ${detail.name}? This includes coins, platform statistics, every game's statistics, and all game-specific saves. Their profile, year and class will remain.`
      : type === "learning"
        ? `Reset question totals, correct and incorrect answers, accuracy, and question-bank history for ${detail.name}? Coins, high scores, unlocks, playtime, and game saves will remain.`
        : `Reset ${gameName} progress for ${detail.name}? Other games, global coins, and the student profile will remain unchanged.`;
    els.resetTypeWrap.hidden = true;
    els.resetInput.value = "";
    els.resetContinue.hidden = false;
    els.resetFinal.hidden = true;
    els.resetOverlay.hidden = false;
    els.resetCancel.focus();
  }

  function beginStudentDeletion() {
    const detail = state.selectedStudentDetail;
    if (!detail) return;
    state.pendingReset = { target: "delete-student", studentId: detail.id, studentName: detail.name, confirmText: "DELETE" };
    els.resetTitle.textContent = "Delete student data?";
    els.resetMessage.textContent = `Permanently delete all Firestore profile and progress data for ${detail.name}? Their Google account is not deleted, and signing in again can create a new Arcade Academy profile.`;
    els.resetTypeLabel.innerHTML = "Type <strong>DELETE</strong> to continue";
    els.resetTypeWrap.hidden = false;
    els.resetInput.value = "";
    els.resetContinue.hidden = true;
    els.resetFinal.hidden = false;
    els.resetFinal.disabled = true;
    els.resetFinal.textContent = "Delete student data permanently";
    els.resetOverlay.hidden = false;
    els.resetInput.focus();
  }

  function beginClassReset(type) {
    const className = els.classResetSelect.value;
    const studentsAffected = Number(els.classResetCount.textContent || 0);
    const gameId = type === "game" ? els.classResetGameSelect.value : null;
    if (!className || studentsAffected < 1 || (type === "game" && !gameId)) return;
    const gameName = type === "game"
      ? els.classResetGameSelect.options[els.classResetGameSelect.selectedIndex].textContent
      : null;

    state.pendingReset = {
      target: "class",
      type,
      gameId,
      gameName,
      className,
      studentsAffected,
      confirmText: className
    };
    els.resetTitle.textContent = type === "all" ? "Reset all class progress?" : "Reset class game progress?";
    els.resetMessage.textContent = type === "all"
      ? `Class: ${className}. Students affected: ${studentsAffected}. This will reset ALL Arcade Academy progression for every student in this class. Student profiles will not be deleted.`
      : `Class: ${className}. Students affected: ${studentsAffected}. Reset: ${gameName}. Other game progress and global coins will not be affected.`;
    els.resetTypeWrap.hidden = true;
    els.resetInput.value = "";
    els.resetContinue.hidden = false;
    els.resetFinal.hidden = true;
    els.resetOverlay.hidden = false;
    els.resetCancel.focus();
  }

  function showFinalResetWarning() {
    const reset = state.pendingReset;
    if (!reset) return;
    els.resetTitle.textContent = "Final warning";
    if (reset.target === "class") {
      els.resetMessage.textContent = `This will reset ${reset.type === "all" ? "all progress" : reset.gameName} for ${reset.studentsAffected} students. Type the exact class name to confirm.`;
      els.resetTypeLabel.innerHTML = `Type <strong>${escapeHtml(reset.className)}</strong> to continue`;
    } else {
      els.resetMessage.textContent = reset.type === "all"
        ? `This will permanently reset all progress for ${reset.studentName}. This cannot easily be undone.`
        : reset.type === "learning"
          ? `This will permanently clear the recorded learning statistics for ${reset.studentName}. Coins, scores and unlocks will remain.`
          : `This will permanently reset ${reset.gameName} for ${reset.studentName}. This cannot easily be undone.`;
      els.resetTypeLabel.innerHTML = "Type <strong>RESET</strong> to continue";
    }
    els.resetContinue.hidden = true;
    els.resetFinal.hidden = false;
    const requiresTyping = reset.target === "class" || reset.type === "all";
    els.resetTypeWrap.hidden = !requiresTyping;
    els.resetFinal.disabled = requiresTyping;
    els.resetFinal.textContent = reset.target === "class" ? "Reset Class" : "Reset progress permanently";
    if (requiresTyping) els.resetInput.focus();
    else els.resetFinal.focus();
  }

  function closeResetConfirmation() {
    if (!els.resetOverlay) return;
    els.resetOverlay.hidden = true;
    els.resetTypeWrap.hidden = true;
    els.resetInput.value = "";
    els.resetFinal.disabled = true;
    state.pendingReset = null;
  }

  async function submitProgressReset() {
    const reset = state.pendingReset;
    if (!reset) return;
    if (reset.confirmText && els.resetInput.value !== reset.confirmText) return;

    els.resetFinal.disabled = true;
    els.resetFinal.textContent = "Resetting…";
    try {
      if (reset.target === "delete-student") {
        await window.TeacherDataProvider.deleteStudent(reset.studentId);
        closeResetConfirmation();
        closeStudentPanel();
        await populateClassFilter();
        await refreshOverview();
        return;
      }
      if (reset.target === "class") {
        await window.TeacherDataProvider.requestClassReset(reset.className, reset.type, reset.gameId);
        const successMessage = `${reset.type === "all" ? "All progress" : reset.gameName} was reset for ${reset.studentsAffected} students in ${reset.className}.`;
        closeResetConfirmation();
        els.classResetResult.textContent = successMessage;
        await populateClassFilter();
        await refreshOverview();
        await updateClassResetCount();
        await loadResetHistory();
        return;
      }

      await window.TeacherDataProvider.requestProgressReset(reset.studentId, reset.type, reset.gameId);
      const successMessage = reset.type === "all"
        ? `All progress for ${reset.studentName} was reset. Their local saves will clear next time they load Arcade Academy.`
        : reset.type === "learning"
          ? `Learning statistics for ${reset.studentName} were reset. Coins, scores, unlocks and game saves were preserved.`
          : `${reset.gameName} was reset for ${reset.studentName}. Its local save will clear next time they load Arcade Academy.`;
      const studentId = reset.studentId;
      closeResetConfirmation();
      await refreshOverview();
      if (state.selectedStudentId === studentId) {
        await openStudentPanel(studentId);
        els.resetResult.textContent = successMessage;
      }
    } catch (error) {
      console.error("Unable to reset student progress:", error);
      els.resetMessage.textContent = reset.target === "class"
        ? "The class reset could not be completed. Some student requests may have been processed; review Reset History before retrying."
        : "The reset could not be saved. No local reset request was issued. Check Firestore permissions and try again.";
      els.resetFinal.disabled = false;
      if (reset.target === "class") await loadResetHistory();
    } finally {
      els.resetFinal.textContent = "Reset progress permanently";
    }
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
    if (state.gameCatalog[gameId]) return state.gameCatalog[gameId];
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
    if (!isoDateStr) return "Never";
    const d = typeof isoDateStr === "number"
      ? new Date(isoDateStr)
      : new Date(String(isoDateStr).includes("T") ? isoDateStr : `${isoDateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return "Never";
    return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return "Never";
    const then = new Date(isoString).getTime();
    if (!Number.isFinite(then)) return "Never";
    const diffMs = Date.now() - then;
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return `${diffDay}d ago`;
  }

  function formatDateTime(value) {
    const date = new Date(Number(value));
    if (!Number.isFinite(date.getTime())) return "Unknown";
    return date.toLocaleString("en-NZ", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showOverviewError() {
    state.overview = [];
    els.tableBody.innerHTML = "";
    els.tableStatus.textContent = "Couldn't read student data from Firestore. Check that you are authenticated and that the security rules allow teacher reads.";
    els.tableStatus.hidden = false;
    renderHeaderStats();
  }
})();
