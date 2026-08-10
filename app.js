const gameFolders = [
  "fortress-facts",
  "jetpack-journey",
  "note-knowledge",
  "rocket-recall",
  "shuriken-scholar",
  "wild-west-wordslinger",
  "cavern-crammer",
  "pinball-postulation",
  "tic-tac-toe",
  "pixel-artillery"
];

// Temporarily disabled while the Spark-compatible leaderboard deployment is
// being reviewed. Set to true to restore leaderboards and gold score boxes.
const LEADERBOARDS_ENABLED = false;

const singleGameGrid = document.querySelector("#single-game-grid");
const multiplayerGameGrid = document.querySelector("#multiplayer-game-grid");
const cardTemplate = document.querySelector("#game-card-template");
const gameCount = document.querySelector("#game-count");
const multiplayerGameCount = document.querySelector("#multiplayer-game-count");
const statGrid = document.querySelector("#stat-grid");
const statCardTemplate = document.querySelector("#stat-card-template");
const leaderboardGameSelect = document.querySelector("#leaderboard-game-select");
const leaderboardResults = document.querySelector("#leaderboard-results");
const leaderboardHeading = document.querySelector("#leaderboard-heading");
const leaderboardClassBtn = document.querySelector("#leaderboard-class-btn");
const leaderboardOverallBtn = document.querySelector("#leaderboard-overall-btn");
let loadedGames = [];
let leaderboardScope = "class";
let leaderboardRequestId = 0;


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
  loadedGames = games;
  displayDashboard(buildGameTitleMap(games));
  displayGames(games);
  if (LEADERBOARDS_ENABLED) initialiseLeaderboards(games);
  if (LEADERBOARDS_ENABLED && currentUser) {
    const statsByGame = Object.fromEntries(games
      .map(game => [game.id, PlatformManager.getGameStats(game.id)])
      .filter(([, stats]) => stats && (stats.gamesPlayed > 0 || stats.questionsAnswered > 0 || stats.highScore > 0)));
    FirebaseManager.syncLeaderboardEntries(currentUser.uid, statsByGame)
      .then(published => setTimeout(async () => {
        refreshHighScoreHighlights(games);
        await renderLeaderboard();
        if (!published && Object.keys(statsByGame).some(gameId => statsByGame[gameId].highScore > 0)) {
          leaderboardResults.innerHTML = '<p class="leaderboard-message">High scores could not be published. Publish the latest Firestore rules, then reload this page.</p>';
        }
      }, 1500))
      .catch(() => {});
  }

}


// ------------------------------------------------------------------
// Screens (loading / login / profile setup / hub)
// ------------------------------------------------------------------
//
// Exactly one of these is visible at a time. app.js decides which one
// based on Firebase auth state + whether a Firestore profile exists -
// see initAuthFlow() at the bottom of this file.

const screens = {
  loading: document.querySelector("#loading-screen"),
  login: document.querySelector("#login-screen"),
  profileSetup: document.querySelector("#profile-setup-screen"),
  seniorClass: document.querySelector("#senior-class-screen"),
  hub: document.querySelector("#hub-screen")
};

let currentUser = null;
let currentProfile = null;
let hubInitialized = false;
let seniorClassExpiryTimer = null;


function showScreen(name) {

  Object.entries(screens).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });

}


const loadingTextEl = document.querySelector("#loading-text");
const loadingSpinnerEl = document.querySelector(".loading-spinner");


function showLoadingScreen() {

  if (loadingTextEl) loadingTextEl.textContent = "Loading Arcade Academy…";
  if (loadingSpinnerEl) loadingSpinnerEl.hidden = false;

  showScreen("loading");

}


// Used when something goes wrong before we ever reach Login/Profile
// Setup/Hub (e.g. Firebase failed to load, or never responded). Keeps
// the loading screen up, but replaces the spinner with an explanation
// instead of leaving the student staring at a spinner forever.
function showLoadingError(message) {

  showScreen("loading");

  if (loadingTextEl) loadingTextEl.textContent = message;
  if (loadingSpinnerEl) loadingSpinnerEl.hidden = true;

}


function showLoginScreen() {
  clearLoginError();
  showScreen("login");
}


function showProfileSetup(user) {

  clearProfileError();
  profileSetupForm.reset();
  resetClassSelect();

  // Prefill from the Google account, but the student can still edit it.
  profileNameInput.value = user.displayName || "";

  showScreen("profileSetup");
  profileNameInput.focus();

}


// Shows the Hub, and - the first time only - kicks off the game
// library / class-code UI that the Hub depends on. Re-showing the Hub
// on later auth-state changes (e.g. after a sign-out/sign-in without a
// page reload) doesn't need to redo that work.
function showHub(profile) {

  currentProfile = profile;
  applyProfileToHub(profile);
  showScreen("hub");
  scheduleSeniorClassExpiry(profile);

  if (!hubInitialized) {
    hubInitialized = true;
    initClassCodeUI();
    loadGames();
  }

}


function applyProfileToHub(profile) {

  if (hubPlayerNameEl) {
    hubPlayerNameEl.textContent = profile?.displayName || "";
  }

}


// ------------------------------------------------------------------
// Login screen
// ------------------------------------------------------------------

const googleSignInButton = document.querySelector("#google-sign-in");
const loginErrorEl = document.querySelector("#login-error");


googleSignInButton?.addEventListener("click", async () => {

  setGoogleButtonBusy(true);
  clearLoginError();

  const user = await window.FirebaseManager.signInWithGoogle();

  setGoogleButtonBusy(false);

  // On success, watchAuthState's callback (below) takes it from here -
  // it'll check for a profile and move to Profile Setup or the Hub.
  if (!user) {
    showLoginError("Sign-in was cancelled or didn't go through. Please try again.");
  }

});


function setGoogleButtonBusy(isBusy) {

  if (!googleSignInButton) return;

  googleSignInButton.disabled = isBusy;
  googleSignInButton.textContent = isBusy ? "Signing in…" : "";

  if (!isBusy) {
    googleSignInButton.innerHTML = `<span class="google-btn-icon" aria-hidden="true">G</span> Sign in with Google`;
  }

}


function showLoginError(message) {
  if (!loginErrorEl) return;
  loginErrorEl.textContent = message;
  loginErrorEl.hidden = false;
}


function clearLoginError() {
  if (!loginErrorEl) return;
  loginErrorEl.hidden = true;
  loginErrorEl.textContent = "";
}


// ------------------------------------------------------------------
// Profile setup screen
// ------------------------------------------------------------------

const profileSetupForm = document.querySelector("#profile-setup-form");
const profileNameInput = document.querySelector("#profile-name-input");
const profileYearSelect = document.querySelector("#profile-year-select");
const profileClassSelect = document.querySelector("#profile-class-select");
const profileSubmitBtn = document.querySelector("#profile-submit-btn");
const profileErrorEl = document.querySelector("#profile-error");


profileSetupForm?.addEventListener("submit", handleProfileSetupSubmit);
profileYearSelect?.addEventListener("change", () => {
  populateClassOptions(profileYearSelect.value);
});


// Pulls the year number (e.g. 9) out of a "Year 9"-style select value,
// so the shared class list can return every option that permits that year.
function parseYearNumber(yearLevelValue) {

  const match = /\d+/.exec(yearLevelValue || "");

  return match ? Number(match[0]) : null;

}

function isSeniorYear(yearLevelValue) {
  const year = parseYearNumber(yearLevelValue);
  return year >= 11 && year <= 13;
}

function currentHourKey(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}`;
}

function nextHourTimestamp() {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next.getTime();
}

function hasCurrentSeniorClass(profile) {
  return !isSeniorYear(profile?.yearLevel)
    || profile?.seniorClassSelection?.hourKey === currentHourKey();
}


// Rebuilds the Class dropdown to match the chosen year level, including
// combined classes whose yearLevels list contains the student's year.
// Falls back to a disabled "No classes configured" option if that
// year has no classes listed (or the class-options helper hasn't loaded).
function populateClassOptions(yearLevelValue) {

  const yearNumber = parseYearNumber(yearLevelValue);
  const classes = yearNumber && window.getClassOptionsForYear
    ? window.getClassOptionsForYear(yearNumber)
    : [];

  profileClassSelect.innerHTML = "";

  if (classes.length === 0) {

    const noClassesOption = document.createElement("option");
    noClassesOption.value = "";
    noClassesOption.textContent = "No classes configured";
    noClassesOption.disabled = true;
    noClassesOption.selected = true;

    profileClassSelect.appendChild(noClassesOption);
    profileClassSelect.disabled = true;

    return;

  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select your class";
  placeholder.disabled = true;
  placeholder.selected = true;
  profileClassSelect.appendChild(placeholder);

  classes.forEach((className) => {
    const option = document.createElement("option");
    option.value = className;
    option.textContent = className;
    profileClassSelect.appendChild(option);
  });

  profileClassSelect.disabled = false;

}


// Locks the Class dropdown back to its initial "pick a year first"
// state - used whenever the profile setup screen is (re)shown.
function resetClassSelect() {

  profileClassSelect.innerHTML =
    '<option value="" disabled selected>Select your year level first</option>';

  profileClassSelect.disabled = true;

}


async function handleProfileSetupSubmit(event) {

  event.preventDefault();

  if (!currentUser) return;

  const displayName = profileNameInput.value.trim();
  const yearLevel = profileYearSelect.value;
  const className = profileClassSelect.value;

  if (!displayName || !yearLevel || !className) {
    showProfileError("Please fill in every field, including your class.");
    return;
  }

  setProfileSubmitBusy(true);
  clearProfileError();

  const profile = {
    displayName,
    yearLevel,
    className,
    email: currentUser.email || null
  };
  if (isSeniorYear(yearLevel)) {
    profile.seniorClassSelection = {
      className,
      hourKey: currentHourKey(),
      selectedAt: Date.now(),
      expiresAt: nextHourTimestamp()
    };
  }

  const created = await window.FirebaseManager.createUserProfile(currentUser.uid, profile);

  setProfileSubmitBusy(false);

  if (created) {
    showHub(profile);
  } else {
    showProfileError("Something went wrong saving your profile. Please try again.");
  }

}

// ------------------------------------------------------------------
// Senior hourly subject-class selection
// ------------------------------------------------------------------

const seniorClassForm = document.querySelector("#senior-class-form");
const seniorClassSelect = document.querySelector("#senior-class-select");
const seniorClassSubmit = document.querySelector("#senior-class-submit");
const seniorClassError = document.querySelector("#senior-class-error");
const seniorClassLockMessage = document.querySelector("#senior-class-lock-message");

function showSeniorClassSelection(profile) {
  currentProfile = profile;
  const year = parseYearNumber(profile.yearLevel);
  const classes = window.getClassOptionsForYear?.(year) || [];
  seniorClassSelect.innerHTML = '<option value="" disabled selected>Select your current class</option>';
  classes.forEach(className => {
    const option = document.createElement("option");
    option.value = className;
    option.textContent = className;
    seniorClassSelect.appendChild(option);
  });
  seniorClassSelect.disabled = classes.length === 0;
  seniorClassSubmit.disabled = classes.length === 0;
  seniorClassLockMessage.textContent = `This selection will be locked until ${new Date(nextHourTimestamp()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
  seniorClassError.hidden = true;
  showScreen("seniorClass");
}

seniorClassForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const className = seniorClassSelect.value;
  if (!currentUser || !className) {
    seniorClassError.textContent = "Choose the class you are currently attending.";
    seniorClassError.hidden = false;
    return;
  }
  seniorClassSubmit.disabled = true;
  seniorClassSubmit.textContent = "Saving…";
  const selection = {
    className,
    hourKey: currentHourKey(),
    selectedAt: Date.now(),
    expiresAt: nextHourTimestamp()
  };
  const saved = await window.FirebaseManager.updateUserProfile(currentUser.uid, {
    className,
    seniorClassSelection: selection
  });
  seniorClassSubmit.disabled = false;
  seniorClassSubmit.textContent = "Enter Arcade Academy";
  if (!saved) {
    seniorClassError.textContent = "Your class could not be saved. Check your connection and try again.";
    seniorClassError.hidden = false;
    return;
  }
  currentProfile = { ...currentProfile, className, seniorClassSelection: selection };
  showHub(currentProfile);
});

function scheduleSeniorClassExpiry(profile) {
  clearTimeout(seniorClassExpiryTimer);
  if (!isSeniorYear(profile?.yearLevel)) return;
  const delay = Math.max(0, nextHourTimestamp() - Date.now()) + 250;
  seniorClassExpiryTimer = setTimeout(() => showSeniorClassSelection(currentProfile), delay);
}


function setProfileSubmitBusy(isBusy) {

  profileSubmitBtn.disabled = isBusy;
  profileSubmitBtn.textContent = isBusy ? "Saving…" : "Continue to Arcade Academy";

}


function showProfileError(message) {
  profileErrorEl.textContent = message;
  profileErrorEl.hidden = false;
}


function clearProfileError() {
  profileErrorEl.hidden = true;
  profileErrorEl.textContent = "";
}


// ------------------------------------------------------------------
// Hub: sign out
// ------------------------------------------------------------------

const hubPlayerNameEl = document.querySelector("#hub-player-name");
const signOutBtn = document.querySelector("#sign-out-btn");


signOutBtn?.addEventListener("click", async () => {

  signOutBtn.disabled = true;

  await window.FirebaseManager.signOut();

  // watchAuthState's callback (below) will notice the sign-out and
  // switch back to the Login screen.
  signOutBtn.disabled = false;

});


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

  let singleCount = 0;
  let multiplayerCount = 0;

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

    const stats = populateGameStats(card, game.id);
    link.dataset.gameId = game.id;
    const modes = Array.isArray(game.gameModes)
      ? game.gameModes
      : (game.players === "2 Online" ? ["multiplayer"] : ["singleplayer"]);
    const isMultiplayer = modes.includes("multiplayer");
    (isMultiplayer ? multiplayerGameGrid : singleGameGrid).appendChild(card);
    if (isMultiplayer) multiplayerCount++; else singleCount++;

    if (LEADERBOARDS_ENABLED && stats?.highScore > 0) highlightClassHighScore(game.id);

  });


  gameCount.textContent = `${singleCount} games ready to play`;
  multiplayerGameCount.textContent = `${multiplayerCount} games ready to play`;

}

function highlightClassHighScore(gameId) {
  if (!currentUser?.uid || !currentProfile?.className) return;
  FirebaseManager.isClassHighScoreHolder(gameId, currentUser.uid, currentProfile.className)
    .then(isHolder => {
      if (!isHolder) return;
      document.querySelector(`.game-card[data-game-id="${gameId}"] .stat-highscore`)
        ?.closest(".stat-row")?.classList.add("class-high-score");
    });
}

function refreshHighScoreHighlights(games) {
  games.forEach(game => {
    if ((PlatformManager.getGameStats(game.id)?.highScore || 0) > 0) highlightClassHighScore(game.id);
  });
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

  card.querySelector(".stat-lastplayed").textContent =
    stats && hasBeenPlayed && stats.lastPlayed
      ? formatLastPlayed(stats.lastPlayed)
      : "Never Played";

  return stats;

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
  const played = new Date(Number(timestamp));
  if (Number.isNaN(played.getTime())) return "Never Played";
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startPlayed = new Date(played.getFullYear(), played.getMonth(), played.getDate());
  const diffDays = Math.max(0, Math.floor((startToday - startPlayed) / 86400000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 14) return `${diffDays} days ago`;
  if (diffDays < 28) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  const years = Math.floor(diffDays / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;

}


// ------------------------------------------------------------------
// Privacy-safe leaderboards
// ------------------------------------------------------------------

function initialiseLeaderboards(games) {
  if (!leaderboardGameSelect) return;
  leaderboardGameSelect.innerHTML = "";
  games.filter(game => game.supportsHighScores !== false).forEach(game => {
    const option = document.createElement("option");
    option.value = game.id;
    option.textContent = game.title;
    leaderboardGameSelect.appendChild(option);
  });
  leaderboardGameSelect.addEventListener("change", renderLeaderboard);
  leaderboardClassBtn.addEventListener("click", () => setLeaderboardScope("class"));
  leaderboardOverallBtn.addEventListener("click", () => setLeaderboardScope("overall"));
  renderLeaderboard();
}

function setLeaderboardScope(scope) {
  leaderboardScope = scope;
  const isClass = scope === "class";
  leaderboardClassBtn.classList.toggle("active", isClass);
  leaderboardOverallBtn.classList.toggle("active", !isClass);
  leaderboardClassBtn.setAttribute("aria-pressed", String(isClass));
  leaderboardOverallBtn.setAttribute("aria-pressed", String(!isClass));
  renderLeaderboard();
}

async function renderLeaderboard() {
  const requestId = ++leaderboardRequestId;
  const gameId = leaderboardGameSelect?.value;
  if (!gameId || !leaderboardResults) return;
  const game = loadedGames.find(item => item.id === gameId);
  leaderboardHeading.textContent = `${leaderboardScope === "class" ? "CLASS" : "OVERALL"} — ${game?.title || gameId}`;
  leaderboardResults.innerHTML = '<p class="leaderboard-message loading">Loading scores…</p>';
  const entries = leaderboardScope === "class"
    ? await FirebaseManager.getClassLeaderboard(gameId, currentProfile?.className)
    : await FirebaseManager.getOverallLeaderboard(gameId);
  if (requestId !== leaderboardRequestId) return;
  if (!Array.isArray(entries)) {
    leaderboardResults.innerHTML = '<p class="leaderboard-message">Scores could not be loaded right now. Please try again soon.</p>';
    return;
  }
  if (!entries.length) {
    leaderboardResults.innerHTML = '<p class="leaderboard-message">No high scores have been posted yet. Be the first!</p>';
    return;
  }
  const list = document.createElement("ol");
  list.className = "leaderboard-list";
  entries.forEach(entry => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    const score = document.createElement("strong");
    name.textContent = entry.initial;
    score.textContent = entry.highScore.toLocaleString();
    row.append(name, score);
    list.appendChild(row);
  });
  leaderboardResults.replaceChildren(list);
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


// ------------------------------------------------------------------
// Auth flow — decides which screen to show
// ------------------------------------------------------------------
//
//   Page loads -> Loading -> Firebase checks auth ->
//     signed out       -> Login
//     signed in, no profile yet -> Profile Setup
//     signed in, profile exists -> Hub
//
// This is the only place that calls loadGames()/initClassCodeUI() -
// they only run once the student is authenticated and has a profile.

async function handleAuthStateChanged(user) {

  currentUser = user;

  if (!user) {
    showLoginScreen();
    return;
  }

  const profile = await window.FirebaseManager.getUserProfile(user.uid);

  if (profile) {
    await window.PlatformManager?.connectFirebase(user.uid);
    currentProfile = profile;
    if (hasCurrentSeniorClass(profile)) showHub(profile);
    else showSeniorClassSelection(profile);
  } else {
    showProfileSetup(user);
  }

}


function initAuthFlow() {

  showLoadingScreen();

  if (!window.FirebaseManager) {
    // Most likely cause: shared/js/FirebaseManager.js failed to load or
    // threw before it could set window.FirebaseManager - e.g. a blocked
    // network request to the Firebase SDK on gstatic.com (ad blocker /
    // school content filter), a bad script path, or the local server
    // not serving .js files as a JS module. Check DevTools > Console
    // and Network for the actual failed request.
    console.error("FirebaseManager is not available — shared/js/FirebaseManager.js didn't finish loading. Check the browser console and Network tab for a failed or blocked request.");
    showLoadingError("Couldn't reach the sign-in system. Check your internet connection, then reload the page.");
    return;
  }

  // Safety net: if Firebase never calls back (e.g. a request hangs
  // instead of failing outright), don't leave the student stuck on
  // the loading screen forever with no explanation.
  const authTimeoutId = setTimeout(() => {
    console.error("Firebase auth check timed out — watchAuthState never called back within 10s.");
    showLoadingError("Taking longer than expected. Check your connection, then reload the page.");
  }, 10000);

  window.FirebaseManager.watchAuthState((user) => {
    clearTimeout(authTimeoutId);
    handleAuthStateChanged(user);
  });

}


initAuthFlow();
