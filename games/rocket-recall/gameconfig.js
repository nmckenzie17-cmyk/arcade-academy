window.GAME_CONFIG = {

    id: "rocket-recall",

    title: "Rocket Recall",

    description: "Answer quiz questions correctly to earn ammo and power-ups, to defeat the alien invaders before they destroy your planet.",
    catchphrase: "Fire fast. Answer faster.",

    genre: "Space Invaders",
    gameModes: ["singleplayer", "challenge"],

    questionType: "multichoice",
    supportedQuestionFormats: ["multichoice", "matching", "category"],

    version: "1.0.0",

    entry: "index.html",

    icon: "👾",

    saveKey: "rocketrecallGameProgress",

    requiresQuestionBank: true,

    supportsHighScores: true,

    supportsAchievements: true,

    createdBy: "Mr McKenzie",
    challengeMode:{enabled:true,types:{scoreAttack:{enabled:true},survival:{enabled:true},waveRace:{enabled:true},timeAttack:{enabled:true,targetScore:15000},questionRace:{enabled:true,targetCorrect:25},accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}}},

};
