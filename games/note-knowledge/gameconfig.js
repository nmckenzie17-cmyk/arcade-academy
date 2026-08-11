window.GAME_CONFIG = {

    id: "note-knowledge",

    title: "Note Knowledge",

    description: "Tap the notes, and categorise the chorus to get the high score",
    
    catchphrase: "Tap the beat. Sort the chorus.",

    genre: "Rhythm Arcade",
    gameModes: ["singleplayer", "challenge"],

    questionType: "category",

    version: "1.0.0",

    entry: "index.html",

    icon: "🎵",

    saveKey: "noteknowledgeGameProgress",

    requiresQuestionBank: true,

    supportsHighScores: true,

    supportsAchievements: true,

    createdBy: "Mr McKenzie",
    challengeMode:{enabled:true,types:{scoreAttack:{enabled:true},survival:{enabled:true},timeAttack:{enabled:true,targetScore:5000},questionRace:{enabled:true,targetCorrect:25},accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}}},

};
