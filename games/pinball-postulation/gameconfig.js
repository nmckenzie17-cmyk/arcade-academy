window.GAME_CONFIG = {
  id: "pinball-postulation",
  title: "Pinball Postulation",
  name: "Pinball Postulation",
  description: "Keep the neon pinball alive, build huge bumper combos, and answer class questions to earn every launch.",
  catchphrase: "Flip. Think. Dominate the grid.",
  genre: "Pinball / Arcade",
  gameModes: ["singleplayer", "challenge"],
  players: "1 Player",
  questionType: "mixed",
  version: "1.0.0",
  entry: "index.html",
  icon: "🔮",
  requiresQuestionBank: true,
  supportsHighScores: true,
  supportsAchievements: true,
  createdBy: "Mr McKenzie",
  challengeMode:{enabled:true,types:{scoreAttack:{enabled:true},survival:{enabled:true},timeAttack:{enabled:true,targetScore:10000},questionRace:{enabled:true,targetCorrect:25},accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}}}
};
