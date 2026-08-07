const gameFolders = [
  "fortress-facts",
  "jetpack-journey",
  "note-knowledge",
  "rocket-recall",
  "shuriken-scholar",
  "wild-west-wordslinger",
  "cavern-crammer"
];

const gameGrid = document.querySelector("#game-grid");
const cardTemplate = document.querySelector("#game-card-template");
const gameCount = document.querySelector("#game-count");
const statGrid = document.querySelector("#stat-grid");
const statCardTemplate = document.querySelector("#stat-card-template");


async function loadGames() {

  const games = [];

  for (const folder of gameFolders) {

    try {

      // Load the game's config file
      await loadScript(`games/${folder}/gameconfig.js`);

      // Copy the config before the next game overwrites it
      games.push({
        ...window.GAME_CONFIG,
        path: `games/${folder}/`
      });

    } catch (error) {

      console.error(`Could not load ${folder}`, error);

    }

  }

  // Build the dashboard first so it can show the favourite game's title,
  // then render the cards (each pulling in its own PlatformManager stats).
  displayDashboard(buildGameTitleMap(games));
  displayGames(games);

}


// ------------------------------------------------------------------
// Class code
// ------------------------------------------------------------------
//
// The Hub is the only place a student ever enters or changes their
// class code. PlatformManager owns validating the code, resolving it
// to a subject + question bank, and persisting it - games just read
// PlatformManager.getCurrentBank() and never see this UI at all.

const classView = document.querySelector("#class-view");
const classEditForm = document.querySelector("#class-edit-form");
const classEditHeading = document.querySelector("#class-edit-heading");
const classCodeInput = document.querySelector("#class-code-input");
const classCodeValueEl = document.querySelector("#class-code-value");
const classSubjectValueEl = document.querySelector("#class-subject-value");
const changeClassBtn = document.querySelector("#change-class-btn");
const classCancelBtn = document.querySelector("#class-cancel-btn");
const classSubmitBtn = document.querySelector("#class-submit-btn");
const classErrorEl = document.querySelector("#class-error");


function initClassCodeUI() {

  if (!classEditForm || !window.PlatformManager) return;

  renderClassCodeState();

  classEditForm.addEventListener("submit", handleClassCodeSubmit);
  changeClassBtn.addEventListener("click", showClassEditForm);
  classCancelBtn.addEventListener("click", hideClassEditForm);

}


// Renders whichever state currently applies: the read-only "view" (a
// class code is active) or the "edit" form (no class code yet).
function renderClassCodeState() {

  const hasCode = PlatformManager.hasClassCode();

  if (hasCode) {

    classCodeValueEl.textContent = PlatformManager.getClassCode();
    classSubjectValueEl.textContent = PlatformManager.getCurrentSubject() || "";

    classView.hidden = false;
    classEditForm.hidden = true;
    clearClassError();

  } else {

    classView.hidden = true;
    showClassEditForm();

  }

}


function showClassEditForm() {

  classView.hidden = true;
  classEditForm.hidden = false;

  // Only offer "Cancel" if there's already a valid class code to fall
  // back to - a first-time student with no code has nothing to cancel to.
  classCancelBtn.hidden = !PlatformManager.hasClassCode();

  classEditHeading.textContent = PlatformManager.hasClassCode()
    ? "Change your class code"
    : "Enter your class code";

  clearClassError();
  classCodeInput.value = "";
  classCodeInput.focus();

}


function hideClassEditForm() {

  // Only reachable when a class code already exists, so it's always
  // safe to just go back to the view state without changing anything.
  clearClassError();
  renderClassCodeState();

}


async function handleClassCodeSubmit(event) {

  event.preventDefault();

  const code = classCodeInput.value.trim();

  if (!code) {
    showClassError("Please enter a class code.");
    return;
  }

  setClassSubmitBusy(true);
  clearClassError();

  const isValid = await PlatformManager.setClassCode(code);

  setClassSubmitBusy(false);

  if (isValid) {
    renderClassCodeState();
  } else {
    showClassError("That class code wasn't found. Check with your teacher and try again.");
  }

}


function setClassSubmitBusy(isBusy) {

  classSubmitBtn.disabled = isBusy;
  classSubmitBtn.textContent = isBusy ? "Checking…" : "Set code";

}


function showClassError(message) {

  classErrorEl.textContent = message;
  classErrorEl.hidden = false;

}


function clearClassError() {

  classErrorEl.hidden = true;
  classErrorEl.textContent = "";

}


// ------------------------------------------------------------------
// Dashboard (platform-wide stats)
// ------------------------------------------------------------------

function buildGameTitleMap(games) {

  const titlesById = {};

  games.forEach((game) => {
    if (game.id) titlesById[game.id] = game.title;
  });

  return titlesById;

}


function displayDashboard(gameTitlesById) {

  if (!statGrid || !statCardTemplate) return;

  if (!window.PlatformManager) {
    console.error("PlatformManager is not available — dashboard stats cannot be shown.");
    return;
  }

  const stats = PlatformManager.getOverallStats();

  const favouriteGame = stats.favouriteGame
    ? (gameTitlesById[stats.favouriteGame] || stats.favouriteGame)
    : "Not Played Yet";

  const statItems = [
    { icon: "🪙", value: stats.coins.balance.toLocaleString(), label: "Total Coins" },
    { icon: "🎯", value: `${stats.overallPercentageCorrect}%`, label: "Overall Accuracy" },
    { icon: "⭐", value: favouriteGame, label: "Favourite Game" },
    { icon: "❓", value: stats.totalQuestionsAnswered.toLocaleString(), label: "Questions Answered" },
    { icon: "📅", value: stats.questionsAnsweredToday.toLocaleString(), label: "Questions Today" },
    { icon: "⏱️", value: formatDuration(stats.currentSessionDurationMs), label: "Current Session" },
    { icon: "🎮", value: stats.totalSessionsPlayed.toLocaleString(), label: "Total Sessions Played" },
    { icon: "🕒", value: formatDuration(stats.totalPlayTimeMs), label: "Total Play Time" }
  ];

  statGrid.innerHTML = "";
  statItems.forEach((item) => statGrid.appendChild(buildStatCard(item)));

}


function buildStatCard({ icon, value, label }) {

  const card = statCardTemplate.content.cloneNode(true);

  card.querySelector(".stat-icon").textContent = icon;
  card.querySelector(".stat-value").textContent = value;
  card.querySelector(".stat-label").textContent = label;

  return card;

}


// ------------------------------------------------------------------
// Game library (cards)
// ------------------------------------------------------------------

function displayGames(games) {

  games.forEach((game) => {

    const card = cardTemplate.content.cloneNode(true);

    const link = card.querySelector(".game-card");
    const art = card.querySelector(".game-art");

    link.href = game.path;

    link.setAttribute(
      "aria-label",
      `Play ${game.title}`
    );


    // Optional theme support
    if (game.id) {
      art.classList.add(`theme-${game.id}`);
    }


    card.querySelector(".game-icon").textContent =
      game.icon;


    card.querySelector(".game-genre").textContent =
      game.genre;


    card.querySelector(".game-title").textContent =
      game.title;


    card.querySelector(".game-catchphrase").textContent =
      game.catchphrase;
    
    card.querySelector(".game-description").textContent =
      game.description;

    populateGameStats(card, game.id);

    gameGrid.appendChild(card);

  });


  gameCount.textContent =
    `${games.length} games ready to play`;

}


// Fills in a card's PlatformManager-driven stats, falling back to
// friendly defaults for games that have never been played.
function populateGameStats(card, gameId) {

  const stats = (gameId && window.PlatformManager)
    ? PlatformManager.getGameStats(gameId)
    : null;

  const hasBeenPlayed = !!(stats && stats.questionsAnswered + stats.gamesPlayed > 0);

  card.querySelector(".stat-highscore").textContent =
    stats && stats.highScore > 0
      ? stats.highScore.toLocaleString()
      : "No High Score Yet";

  card.querySelector(".stat-accuracy").textContent =
    stats && stats.questionsAnswered > 0
      ? `${stats.percentageCorrect}%`
      : "0%";

  card.querySelector(".stat-questions").textContent =
    stats
      ? `${stats.questionsAnswered.toLocaleString()} Questions`
      : "0 Questions";

  card.querySelector(".stat-playtime").textContent =
    formatDuration(stats ? stats.playTimeMs : 0);

  card.querySelector(".stat-lastplayed").textContent =
    stats && hasBeenPlayed && stats.lastPlayed
      ? formatLastPlayed(stats.lastPlayed)
      : "Never Played";

}


// ------------------------------------------------------------------
// Formatting helpers
// ------------------------------------------------------------------

function formatDuration(ms) {

  const totalMinutes = Math.floor((ms || 0) / 60000);

  if (totalMinutes < 1) return "0m";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

}


function formatLastPlayed(timestamp) {

  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString();

}


function loadScript(src) {

  return new Promise((resolve, reject) => {

    const script = document.createElement("script");

    script.src = src;

    script.onload = resolve;

    script.onerror = reject;

    document.head.appendChild(script);

  });

}


initClassCodeUI();
loadGames();
