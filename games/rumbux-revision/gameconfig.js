window.GAME_CONFIG = {
  id: "rumbux-revision",
  title: "Rumbux Revision",
  name: "Rumbux Revision",
  icon: "👊",
  catchphrase: "Fight the enemy. Fight forgetfulness.",
  description: "Battle through the streets, then turn correct class answers into powerful roguelike upgrades.",
  genre: "Beat 'em up / Roguelike",
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
  saveKey: "rumbuxRevisionProgress",
  startSelector: "#btnStart",
  achievements: [
    { id:"rumbux_revision_recall", name:"Revision Rhythm", description:"Answer 20 class questions correctly in Rumbux Revision.", tier:"silver", scope:"game", requirement:{ event:"rumbux_revision_correct", operator:">=", value:20 } },
    { id:"rumbux_revision_combo", name:"Street Scholar", description:"Build a 15-hit combo in Rumbux Revision.", tier:"gold", scope:"game", requirement:{ stat:"rumbuxBestCombo", operator:">=", value:15 } }
  ],
  challengeMode: { enabled: true, types: {
    scoreAttack: { enabled: true },
    survival: { enabled: true },
    distanceRace: { enabled: true },
    waveRace: { enabled: true },
    timeAttack: { enabled: true, targetScore: 15000 },
    questionRace: { enabled: true, targetCorrect: 25 },
    accuracyChallenge: { enabled: true, minimumQuestions: 20, durationSeconds: 300 }
  }}
};
