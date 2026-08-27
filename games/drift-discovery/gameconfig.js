window.GAME_CONFIG = {
  id: "drift-discovery",
  title: "Drift Discovery",
  name: "Drift Discovery",
  icon: "🏎️",
  catchphrase: "Race the line. Discover the answer.",
  description: "Build a custom racer, battle a field of rivals, and use class questions in the pit lane to repair your car.",
  genre: "Roguelike Racer",
  entry: "index.html",
  gameModes: ["singleplayer", "challenge"],
  primaryMode: "singleplayer",
  players: "1 Player",
  questionType: "multichoice",
  supportedQuestionFormats: ["multichoice"],
  requiresQuestionBank: true,
  supportsHighScores: true,
  supportsAchievements: true,
  createdBy: "Mr McKenzie",
  saveKey: "driftRushSave_v1",
  startSelector: "#btnPlay",
  achievements: [
    { id:"drift_discovery_pit_scholar", name:"Pit Scholar", description:"Answer 20 pit-lane questions correctly in Drift Discovery.", tier:"silver", scope:"game", requirement:{ event:"drift_discovery_correct", operator:">=", value:20 } },
    { id:"drift_discovery_drift_master", name:"Drift Master", description:"Score 5,000 drift points in one valid race.", tier:"gold", scope:"game", requirement:{ stat:"drift_discovery_best_drift", operator:">=", value:5000 } }
  ],
  levelRewards: [
    { id:"drift-discovery_academy_blue_racer", name:"Academy Blue Racer", type:"cosmetic", slot:"skin", gameId:"drift-discovery" },
    { id:"drift-discovery_neon_tyres", name:"Neon Tyres", type:"cosmetic", slot:"wheels", gameId:"drift-discovery" },
    { id:"drift-discovery_comet_drift_smoke", name:"Comet Drift Smoke", type:"cosmetic", slot:"trail", gameId:"drift-discovery" },
    { id:"drift-discovery_gold_nitro", name:"Gold Nitro", type:"cosmetic", slot:"nitro", gameId:"drift-discovery" },
    { id:"drift-discovery_midnight_circuit", name:"Midnight Circuit", type:"cosmetic", slot:"world", gameId:"drift-discovery" },
    { id:"drift-discovery_champion_livery", name:"Champion Livery", type:"cosmetic", slot:"livery", gameId:"drift-discovery" },
    { id:"drift-discovery_tuned_start", name:"Tuned Start", type:"gameplay", slot:"boost", gameId:"drift-discovery" }
  ],
  challengeMode: { enabled:true, types:{
    scoreAttack:{enabled:true},
    survival:{enabled:true},
    timeAttack:{enabled:true,targetScore:7500}
  }}
};
