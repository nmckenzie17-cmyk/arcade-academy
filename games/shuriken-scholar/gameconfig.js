window.GAME_CONFIG = {

    id: "shuriken-scholar",

    title: "Shuriken Scholar",

    description: "Fight off endless enemies while answering multiple-choice questions.",

    catchphrase: "Throw shurikens. Strengthen your mind",

    genre: "Survival / Horde Shooter",
    gameModes: ["singleplayer", "challenge"],

    questionType: "multichoice",
    supportedQuestionFormats: ["multichoice", "matching", "category"],

    version: "1.0.0",

    entry: "index.html",

    icon: "🥷",

    saveKey: "ninjaShurikenGameProgress",

    requiresQuestionBank: true,

    supportsHighScores: true,

    supportsAchievements: true,

    createdBy: "Mr McKenzie",
    challengeMode:{enabled:true,types:{scoreAttack:{enabled:true},survival:{enabled:true},waveRace:{enabled:true},timeAttack:{enabled:true,targetScore:15000},questionRace:{enabled:true,targetCorrect:25},accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}}},

};
