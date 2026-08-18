window.GAME_CONFIG = {
  id: "angler-answerer",
  title: "Angler Answerer",
  name: "Angler Answerer",
  description: "Answer class questions to earn casts, hook pixel fish, master the tension meter and fill your Fishdex across five unlockable fishing grounds.",
  catchphrase: "Question to catch. Reel to score.",
  genre: "Fishing / Roguelike",
  gameModes: ["singleplayer", "challenge"],
  players: "1 Player",
  questionType: "multichoice",
  supportedQuestionFormats: ["multichoice", "matching", "category"],
  version: "1.0.0",
  entry: "index.html",
  icon: "🎣",
  saveKey: "anglers_ascent_save_v1",
  requiresQuestionBank: true,
  supportsHighScores: true,
  supportsAchievements: true,
  createdBy: "Mr McKenzie",
  achievements: [
    { id:"angler_answerer_perfect_school", name:"Perfect School", description:"Answer ten class questions correctly in a row while fishing.", tier:"silver", scope:"game", requirement:{ stat:"run.correctStreak", operator:">=", value:10 } },
    { id:"angler_answerer_boss_landed", name:"Boss on the Line", description:"Land a boss fish during a valid fishing trip.", tier:"gold", scope:"game", requirement:{ event:"angler_boss_caught", value:true } }
  ],
  challengeMode:{enabled:true,types:{scoreAttack:{enabled:true},timeAttack:{enabled:true,targetScore:40},questionRace:{enabled:true,targetCorrect:25},accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}}},
  levelRewards: [
    { id:"angler-answerer_lucky_rod", name:"Lucky Rod", type:"cosmetic", slot:"rod" },
    { id:"angler-answerer_bioluminescent_line", name:"Bioluminescent Line", type:"cosmetic", slot:"line" },
    { id:"angler-answerer_pixel_bobber", name:"Pixel Bobber", type:"cosmetic", slot:"bobber" },
    { id:"angler-answerer_moonlit_waters", name:"Moonlit Waters", type:"cosmetic", slot:"background" },
    { id:"angler-answerer_fishdex_sparkles", name:"Fishdex Sparkles", type:"cosmetic", slot:"catchEffect" },
    { id:"angler-answerer_legendary_angler", name:"Legendary Angler", type:"cosmetic", slot:"character" },
    { id:"angler-answerer_extra_bait", name:"Extra Bait", type:"gameplay", slot:"boost" }
  ]
};
