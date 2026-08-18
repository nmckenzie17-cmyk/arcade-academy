window.GAME_CONFIG = {

    id: "jetpack-journey",

    title: "Jetpack Journey",

    description: "Fly through time and answer questions to get further.",
    catchphrase: "Fly farther. Match Smarter.",

    genre: "Endless Runner",
    gameModes: ["singleplayer", "challenge"],

    questionType: "matching",
    supportedQuestionFormats: ["multichoice", "matching", "category"],

    version: "1.0.0",

    entry: "index.html",

    icon: "🚀",

    saveKey: "jetpackjourneyGameProgress",

    requiresQuestionBank: true,

    supportsHighScores: true,

    supportsAchievements: true,

    createdBy: "Mr McKenzie",
    challengeMode:{enabled:true,types:{scoreAttack:{enabled:true},survival:{enabled:true},distanceRace:{enabled:true},timeAttack:{enabled:true,targetScore:10000},questionRace:{enabled:true,targetCorrect:25},accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}}},

};
