window.GAME_CONFIG = {
  id: "ko-klarity",
  title: "KO Klarity",
  name: "KO Klarity",
  icon: "🥊",
  catchphrase: "Fight sharp. Think sharper.",
  description: "Climb an endless fighting circuit and turn correct class answers into powerful roguelike upgrades.",
  genre: "Roguelike Fighter",
  entry: "index.html",
  gameModes: ["singleplayer", "challenge"],
  primaryMode: "singleplayer",
  players: "1 Player",
  questionType: "multichoice",
  supportedQuestionFormats: ["multichoice", "matching", "category", "type-answer", "falling-words"],
  requiresQuestionBank: true,
  supportsHighScores: true,
  supportsAchievements: true,
  createdBy: "Mr McKenzie",
  saveKey: "koKlarityProgress",
  startSelector: "#btnFight",
  achievements: [
    { id:"ko_klarity_clear_thinker", name:"Clear Thinker", description:"Answer 20 class questions correctly in KO Klarity.", tier:"silver", scope:"game", requirement:{ event:"ko_klarity_correct", operator:">=", value:20 } },
    { id:"ko_klarity_combo_clarity", name:"Combo Clarity", description:"Land a 12-hit combo in KO Klarity.", tier:"gold", scope:"game", requirement:{ stat:"koKlarityBestCombo", operator:">=", value:12 } }
  ],
  challengeMode: { enabled: true, types: {
    scoreAttack: { enabled: true },
    survival: { enabled: true },
    waveRace: { enabled: true },
    timeAttack: { enabled: true, targetScore: 5000 }
  }}
};
