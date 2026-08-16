(function (global) {
  "use strict";

  const GAME_STORAGE_KEYS = {
    "cavern-crammer": ["cavernCrammerGameProgress"],
    "fortress-facts": ["fortressfactsGameProgress", "castleDefenceKingdomSave_v1"],
    "jetpack-journey": [
      "jetpackjourneyGameProgress",
      "pixelJetpackHighScore",
      "pixelJetpackDeathCount",
      "pixelJetpackQuestionsCorrect",
      "pixelJetpackAnnouncedPowerups",
      "pixelJetpackSelectedPowerups",
      "pixelJetpackShopState",
      "pixelJetpackDeathPity"
    ],
    "note-knowledge": ["noteknowledgeGameProgress"],
    // Pinball progression is entirely PlatformManager-owned; the empty list
    // still registers the game so teacher resets report success.
    "pinball-postulation": [],
    "angler-answerer": ["anglers_ascent_save_v1"],
    "dot-n-box-deducer": [],
    "rocket-recall": [
      "rocketrecallGameProgress",
      "totalQuestionsCorrect",
      "permanentUpgrades",
      "totalEnemiesDefeated",
      "spaceInvadersHighScore",
      "equippedRunPowerups"
    ],
    "shuriken-scholar": ["ninjaShurikenGameProgress"],
    "wild-west-wordslinger": ["wildwestwordslingerGameProgress"],
    "cube-curiosity": ["cubeCuriosityHighScores", "cubeCuriositySkin", "cubeCuriosityWallet"]
  };

  function resetGame(gameId) {
    const keys = GAME_STORAGE_KEYS[gameId];
    if (!keys) return false;
    keys.forEach((key) => global.localStorage.removeItem(key));
    return true;
  }

  function resetAllGames() {
    Object.keys(GAME_STORAGE_KEYS).forEach(resetGame);
  }

  global.GameSaveManager = {
    resetGame,
    resetAllGames,
    getOwnedKeys(gameId) {
      return gameId ? [...(GAME_STORAGE_KEYS[gameId] || [])] : Object.values(GAME_STORAGE_KEYS).flat();
    }
  };
})(window);
