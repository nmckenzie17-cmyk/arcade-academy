window.GAME_CONFIG = {
  id: "cube-curiosity", title: "Cube Curiosity", name: "Cube Curiosity", icon: "🟪",
  catchphrase: "Dodge the hazards. Improve your brain.",
  description: "Race through an endless neon obstacle course and answer class questions at checkpoints to earn run-changing upgrades.",
  genre: "Precision Platformer / Roguelike", entry: "index.html",
  gameModes: ["singleplayer", "challenge"], primaryMode: "singleplayer", players: "1 Player",
  questionType: "mixed", supportedQuestionFormats: ["multichoice", "matching", "category"], requiresQuestionBank: true,
  supportsHighScores: true, supportsAchievements: true, createdBy: "Mr McKenzie",
  saveKey: "cubeCuriosityHighScores", startSelector: "#playBtn",
  achievements: [
    { id:"cube_curiosity_quiz_climber", name:"Quiz Climber", description:"Answer 20 Cube Curiosity questions correctly.", tier:"silver", scope:"game", requirement:{ event:"cube_curiosity_correct", operator:">=", value:20 } },
    { id:"cube_curiosity_checkpoint_champion", name:"Checkpoint Champion", description:"Reach 10 checkpoints in one run.", tier:"gold", scope:"game", requirement:{ stat:"cube_curiosity_run_checkpoints", operator:">=", value:10 } }
  ],
  challengeMode: { enabled:true, types:{ survival:{enabled:true}, distanceRace:{enabled:true}, questionRace:{enabled:true,targetCorrect:25}, accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300} } },
  levelRewards: [
    { id:"cube-curiosity_prismatic_cube", name:"Prismatic Cube", type:"cosmetic", slot:"skin", gameId:"cube-curiosity" },
    { id:"cube-curiosity_comet_trail", name:"Comet Trail", type:"cosmetic", slot:"trail", gameId:"cube-curiosity" },
    { id:"cube-curiosity_midnight_grid", name:"Midnight Grid", type:"cosmetic", slot:"world", gameId:"cube-curiosity" },
    { id:"cube-curiosity_checkpoint_spark", name:"Checkpoint Spark", type:"cosmetic", slot:"effect", gameId:"cube-curiosity" },
    { id:"cube-curiosity_arcade_academy_cube", name:"Arcade Academy Cube", type:"cosmetic", slot:"skin", gameId:"cube-curiosity" },
    { id:"cube-curiosity_cyber_city_legend", name:"Cyber City Legend", type:"cosmetic", slot:"theme", gameId:"cube-curiosity" },
    { id:"cube-curiosity_steady_start", name:"Steady Start", type:"gameplay", slot:"boost", gameId:"cube-curiosity" }
  ]
};
