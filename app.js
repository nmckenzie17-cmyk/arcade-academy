/*
 * Add a new game by adding an entry here. Its folder should contain index.html,
 * for example: { title: "New Game", path: "games/new-game/", ... }.
 */
const games = [
  { title: "Fortress Facts", subject: "Science challenge", icon: "🏰", path: "games/fortress-facts/", theme: "fortress" },
  { title: "Jetpack Journey", subject: "Learning adventure", icon: "🚀", path: "games/jetpack-journey/", theme: "jetpack" },
  { title: "Note Knowledge", subject: "Memory challenge", icon: "🎵", path: "games/note-knowledge/", theme: "note" },
  { title: "Rocket Recall", subject: "Quick-fire quiz", icon: "🛸", path: "games/rocket-recall/", theme: "rocket" },
  { title: "Shuriken Scholar", subject: "Skill builder", icon: "🥷", path: "games/shuriken-scholar/", theme: "shuriken" },
  { title: "Wild West Wordslinger", subject: "Word challenge", icon: "🤠", path: "games/wild-west-wordslinger/", theme: "wildwest" }
];

const gameGrid = document.querySelector("#game-grid");
const cardTemplate = document.querySelector("#game-card-template");
const gameCount = document.querySelector("#game-count");

games.forEach((game) => {
  const card = cardTemplate.content.cloneNode(true);
  const link = card.querySelector(".game-card");
  const art = card.querySelector(".game-art");

  link.href = game.path;
  link.setAttribute("aria-label", `Play ${game.title}`);
  art.classList.add(`theme-${game.theme}`);
  card.querySelector(".game-icon").textContent = game.icon;
  card.querySelector(".game-subject").textContent = game.subject;
  card.querySelector(".game-name").textContent = game.title;
  gameGrid.appendChild(card);
});

gameCount.textContent = `${games.length} games ready to play`;
