window.GAME_CONFIG = {
  id: "shooter-studying",
  title: "Shooter Studying",
  name: "Shooter Studying",
  icon: "🎯",
  catchphrase: "See further. Think faster. Survive.",
  description: "Explore a tactical arena, answer class questions for supplies, and outlast every hostile squad.",
  genre: "Tactical / Battle Royale",
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
  saveKey: "shooterStudyingProgress_v1",
  startSelector: "#startRunBtn",
  achievements: [
    { id:"shooter_studying_field_scholar", name:"Field Scholar", description:"Answer 20 Shooter Studying questions correctly.", tier:"silver", scope:"game", requirement:{ event:"shooter_studying_correct", operator:">=", value:20 } },
    { id:"shooter_studying_last_one_standing", name:"Last One Standing", description:"Clear a Shooter Studying arena.", tier:"gold", scope:"game", requirement:{ event:"mastery_shooter_studying", operator:">=", value:1 } }
  ],
  challengeMode: { enabled:true, types:{
    scoreAttack:{enabled:true}, survival:{enabled:true},
    timeAttack:{enabled:true,targetScore:1000}, questionRace:{enabled:true,targetCorrect:25},
    accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}
  } }
};
