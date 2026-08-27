window.GAME_CONFIG = {
  id:"garden-guessing", title:"Garden Guessing", name:"Garden Guessing", icon:"🌻",
  catchphrase:"Grow your knowledge. Guard your garden.",
  description:"Build a team of powerful plants, defend five garden lanes from invading bugs, and answer class questions between waves to grow stronger.",
  genre:"Educational Tower Defence", entry:"index.html",
  gameModes:["singleplayer","challenge"], primaryMode:"singleplayer", players:"1 Player",
  questionType:"multichoice", supportedQuestionFormats:["multichoice"], requiresQuestionBank:true,
  supportsHighScores:true, supportsAchievements:true, createdBy:"Mr McKenzie",
  saveKey:"gardenGuessingProgress_v1", startSelector:"#gardenStartBtn",
  achievements:[
    {id:"garden_guessing_green_thinker",name:"Green Thinker",description:"Answer 20 Garden Guessing questions correctly.",tier:"silver",scope:"game",requirement:{event:"garden_guessing_correct",operator:">=",value:20}},
    {id:"garden_guessing_bastion",name:"Botanical Bastion",description:"Survive 15 waves in one valid garden.",tier:"gold",scope:"game",requirement:{stat:"garden_guessing_best_wave",operator:">=",value:15}}
  ],
  levelRewards:[
    {id:"garden-guessing_academy_blooms",name:"Academy Blooms",type:"cosmetic",slot:"plants",gameId:"garden-guessing"},
    {id:"garden-guessing_firefly_shots",name:"Firefly Shots",type:"cosmetic",slot:"projectiles",gameId:"garden-guessing"},
    {id:"garden-guessing_moonlit_garden",name:"Moonlit Garden",type:"cosmetic",slot:"world",gameId:"garden-guessing"},
    {id:"garden-guessing_bloom_bursts",name:"Bloom Bursts",type:"cosmetic",slot:"effect",gameId:"garden-guessing"},
    {id:"garden-guessing_academy_scarecrow",name:"Academy Scarecrow",type:"cosmetic",slot:"crossover",gameId:"garden-guessing"},
    {id:"garden-guessing_garden_legend",name:"Garden Legend",type:"cosmetic",slot:"theme",gameId:"garden-guessing"},
    {id:"garden-guessing_seedling_start",name:"Seedling Start",type:"gameplay",slot:"boost",gameId:"garden-guessing"}
  ],
  challengeMode:{enabled:true,types:{scoreAttack:{enabled:true},survival:{enabled:true},waveRace:{enabled:true},timeAttack:{enabled:true,targetScore:2500},questionRace:{enabled:true,targetCorrect:25},accuracyChallenge:{enabled:true,minimumQuestions:20,durationSeconds:300}}}
};
