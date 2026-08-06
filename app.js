const gameFolders = [
  "fortress-facts",
  "jetpack-journey",
  "note-knowledge",
  "rocket-recall",
  "shuriken-scholar",
  "wild-west-wordslinger"
];

const gameGrid = document.querySelector("#game-grid");
const cardTemplate = document.querySelector("#game-card-template");
const gameCount = document.querySelector("#game-count");


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


  displayGames(games);

}


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


    gameGrid.appendChild(card);

  });


  gameCount.textContent =
    `${games.length} games ready to play`;

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


loadGames();
