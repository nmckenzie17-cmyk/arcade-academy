window.GAME_CONFIG = {

    id: "cavern-crammer",

    title: "Cavern Crammer",

    description: "Climb crumbling pixel-art caverns full of spikes, foes and hidden vaults — cram your knowledge at every shrine to earn upgrades and survive.",

    catchphrase: "Climb hard. Cram harder.",

    genre: "Platformer / Roguelike",
    gameModes: ["singleplayer", "challenge"],

    questionType: "matching",
    supportedQuestionFormats: ["multichoice", "matching", "category", "type-answer", "falling-words"],

    version: "1.0.0",

    entry: "index.html",

    icon: "🏮",

    saveKey: "cavernCrammerGameProgress",

    requiresQuestionBank: true,

    supportsHighScores: true,

    supportsAchievements: true,

    createdBy: "Mr McKenzie",
    challengeMode:{enabled:true,types:{scoreAttack:{enabled:true},survival:{enabled:true},distanceRace:{enabled:true},timeAttack:{enabled:true,targetScore:12},questionRace:{enabled:true,targetCorrect:25},accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}}},

};
