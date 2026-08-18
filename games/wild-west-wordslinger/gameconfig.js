window.GAME_CONFIG = {

    id: "wild-west-wordslinger",

    title: "Wild West Wordslinger",

    description: "Aim and shoot outlaws before they reach you, while answering questions to reload your gun.",
    catchphrase: "Shoot fast. Reload smarter.",

    genre: "Shooting Gallery",
    gameModes: ["singleplayer", "challenge"],

    questionType: "category",
    supportedQuestionFormats: ["multichoice", "matching", "category", "type-answer", "falling-words"],

    version: "1.0.0",

    entry: "index.html",

    icon: "🌵",

    saveKey: "wildwestwordslingerGameProgress",

    requiresQuestionBank: true,

    supportsHighScores: true,

    supportsAchievements: true,

    createdBy: "Mr McKenzie",
    challengeMode:{enabled:true,types:{scoreAttack:{enabled:true},survival:{enabled:true},waveRace:{enabled:true},timeAttack:{enabled:true,targetScore:15000},questionRace:{enabled:true,targetCorrect:25},accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}}},

};
