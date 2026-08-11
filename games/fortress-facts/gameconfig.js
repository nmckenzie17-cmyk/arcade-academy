window.GAME_CONFIG = {

    id: "fortress-facts",

    title: "Fortress Facts",

    description: "Build your fortress, and defend the king, while answering multiple-choice questions to strengthen your defences.",

    catchphrase: "Defend the kingdom. Answer to arm",

    genre: "Strategy / Tower Defense",
    gameModes: ["singleplayer", "challenge"],

    questionType: "multichoice",

    version: "1.0.0",

    entry: "index.html",

    icon: "🏰",

    saveKey: "fortressfactsGameProgress",

    requiresQuestionBank: true,

    supportsHighScores: true,

    supportsAchievements: true,

    createdBy: "Mr McKenzie",
    challengeMode:{enabled:true,types:{scoreAttack:{enabled:true},survival:{enabled:true},waveRace:{enabled:true},timeAttack:{enabled:true,targetScore:1500},questionRace:{enabled:true,targetCorrect:25},accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}}},

};
