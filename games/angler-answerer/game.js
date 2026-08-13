(function(){
"use strict";

/* =========================================================================
   ANGLER'S ASCENT — retro pixel fishing roguelike
   Single-file HTML/CSS/JS game. Organised into clearly separated systems:
   CONFIG -> DATA (fish/zones/upgrades) -> STATE -> SAVE/LOAD -> BAIT ->
   INPUT -> CAST -> HOOK -> REEL -> CATCH -> XP/UPGRADES -> SHOP -> ZONES ->
   FISHDEX -> EVENTS -> BOSS -> PARTICLES -> RENDER -> MAIN LOOP
   ========================================================================= */

/* ---------------------------- CONFIG ---------------------------- */
const CONFIG = {
  startBait: 0,
  maxBait: 10,
  baseCastPowerTimeMs: 1400,   // time held to reach full charge
  hookWindowMs: 850,           // base reaction window to hook a fish
  biteDelayMin: 900,
  biteDelayMax: 3200,
  distanceMax: 100,            // 0 = caught, 100 = fully away
  markerRiseBase: 72,          // %/sec the tension marker climbs while holding
  markerFallBase: 55,          // %/sec the tension marker falls while released
  inZonePullPerSec: 30,        // distance %/sec closed while the marker is inside the catch zone
  // --- market / cooler economy ---
  marketDropPerSale: 0.90,     // each unit sold multiplies that species' supply factor by this
  marketFloor: 0.35,           // a saturated market never pays out less than this fraction
  marketRecoveryPerSec: 0.012, // fraction of the gap back to 1.0 recovered per second
  marketDriftAmplitude: 0.12,  // ambient +/- price wobble per species, independent of selling
  marketDriftPeriodMs: 70000,  // roughly how long one ambient price cycle takes
  bulkSaleDropPerFish: 0.947,
  bulkSaleFloor: 0.40,
  coinCurveBase: 0.5,          // shared-coin economy: useful common catches without runaway late-game payouts
  coinCurveScale: 1,
  maxFishCoinValue: 38,
  economyVersion: 3,
  saveKey: "anglers_ascent_save_v1"
};
const GAME_ID = "angler-answerer";
let challengeRunCaught = 0;
const QUESTION_TYPE = "multichoice";
let questionBankReady = false;
let currentQuestion = null;
let castReady = false;
let platformSessionStarted = false;
let gameStarted = false;
let animationLoopStarted = false;
let anglerQuestionStreak = 0;

// Catching-zone size & movement speed by rarity: common fish give you a big, slow-moving
// target; rarer fish shrink the zone and speed up its motion, demanding tighter tracking.
const ZONE_BY_RARITY = {
  common:    { width:38, maxWidth:54, speed:0.72, pull:1.00, drift:1.00, startOffset:0 },
  uncommon:  { width:30, maxWidth:43, speed:1.00, pull:1.08, drift:1.20, startOffset:5 },
  rare:      { width:23, maxWidth:34, speed:1.34, pull:1.16, drift:1.45, startOffset:9 },
  epic:      { width:17, maxWidth:26, speed:1.72, pull:1.25, drift:1.75, startOffset:13 },
  legendary: { width:12, maxWidth:19, speed:2.15, pull:1.34, drift:2.10, startOffset:17 },
  mythic:    { width:10, maxWidth:16, speed:2.45, pull:1.40, drift:2.25, startOffset:19 },
  bloodmoon: { width:10, maxWidth:16, speed:2.35, pull:1.40, drift:2.30, startOffset:19 },
  meteor:    { width:12, maxWidth:18, speed:2.05, pull:1.34, drift:2.05, startOffset:17 },
  boss:      { width:8,  maxWidth:13, speed:2.70, pull:1.50, drift:2.75, startOffset:24 },
};

/* ---------------------------- DATA: RARITY ---------------------------- */
const RARITY = {
  common:    { label:"Common",    color:"#b8c4d9", mult:1,  xp:1  },
  uncommon:  { label:"Uncommon",  color:"#5fd07a", mult:2,  xp:2  },
  rare:      { label:"Rare",      color:"#59a5ff", mult:4,  xp:4  },
  epic:      { label:"Epic",      color:"#c96bff", mult:8,  xp:8  },
  legendary: { label:"Legendary", color:"#ffb347", mult:16, xp:16 },
  mythic:    { label:"Mythic",    color:"#ff6bd6", mult:30, xp:80 },
  bloodmoon: { label:"Blood Moon", color:"#ff2d4a", mult:28, xp:70 },
  meteor:    { label:"Meteor",    color:"#ffe38a", mult:26, xp:65 },
  boss:      { label:"Boss",      color:"#ff5d5d", mult:40, xp:60 }
};

/* ---------------------------- DATA: FISH DATABASE ---------------------------- */
// behavior: steady | burst | directional | resting | escalating | constant
const FISH_DB = [
  // --- Pond (common) ---
  { id:"bluegill", name:"Bluegill", rarity:"common", zone:"pond", minKg:0.2, maxKg:0.6, valuePerKg:6, strength:2, speed:2, behavior:"steady", shape:"round", color:"#7fb2e0", belly:"#d8ecff", fin:"#3f6fa8", pattern:"spots", patternColor:"#4a7fc0", features:[] },
  { id:"perch",    name:"Perch",    rarity:"common", zone:"pond", minKg:0.3, maxKg:1.4, valuePerKg:6, strength:2, speed:3, behavior:"directional", shape:"round", color:"#e0c25c", belly:"#fff1c2", fin:"#c98a2e", pattern:"stripes", patternColor:"#3a5a3a", features:["spinyfin"] },
  { id:"pondcarp", name:"Mud Carp", rarity:"common", zone:"pond", minKg:0.5, maxKg:2.2, valuePerKg:5, strength:3, speed:2, behavior:"resting", shape:"long", color:"#a3835a", belly:"#d9c39a", fin:"#6e5136", pattern:"none", patternColor:"#000", features:["whiskers"] },
  { id:"crappie",  name:"Crappie",  rarity:"common", zone:"pond", minKg:0.15, maxKg:0.9, valuePerKg:6, strength:2, speed:3, behavior:"steady", shape:"round", color:"#9fc9e0", belly:"#e8f5ff", fin:"#5a8ab0", pattern:"spots", patternColor:"#3a5a70", features:[] },
  { id:"bullhead", name:"Bullhead", rarity:"common", zone:"pond", minKg:0.2, maxKg:1.1, valuePerKg:5, strength:3, speed:2, behavior:"resting", shape:"long", color:"#6b5a42", belly:"#a89470", fin:"#443723", pattern:"none", patternColor:"#000", features:["whiskers"] },
  { id:"goldfish", name:"Feral Goldfish", rarity:"common", zone:"pond", minKg:0.1, maxKg:0.5, valuePerKg:7, strength:1, speed:3, behavior:"directional", shape:"round", color:"#e8862c", belly:"#ffd9a0", fin:"#b8601c", pattern:"gradient", patternColor:"#ffedb0", features:[] },
  { id:"minnow",   name:"Minnow",   rarity:"common", zone:"pond", minKg:0.05, maxKg:0.25, valuePerKg:4, strength:1, speed:5, behavior:"burst", shape:"round", color:"#c7d4e0", belly:"#f0f6fb", fin:"#8fa3b8", pattern:"none", patternColor:"#000", features:[] },

  // --- River (uncommon) ---
  { id:"trout",   name:"Trout",   rarity:"uncommon", zone:"river", minKg:0.8, maxKg:3.0, valuePerKg:9, strength:4, speed:5, behavior:"burst", shape:"long", color:"#8fd1c9", belly:"#eafff8", fin:"#4a9c8f", pattern:"spots", patternColor:"#e05b6b", features:[] },
  { id:"snapper", name:"Snapper", rarity:"uncommon", zone:"river", minKg:1.0, maxKg:3.6, valuePerKg:10, strength:5, speed:4, behavior:"directional", shape:"round", color:"#e08f6b", belly:"#ffe3d2", fin:"#b4522c", pattern:"gradient", patternColor:"#ffb38f", features:["spinyfin"] },
  { id:"salmon",  name:"Salmon",  rarity:"uncommon", zone:"river", minKg:2.0, maxKg:6.5, valuePerKg:11, strength:6, speed:6, behavior:"escalating", shape:"long", color:"#e37b8f", belly:"#ffdbe6", fin:"#a84b62", pattern:"stripes", patternColor:"#c25a72", features:[] },
  { id:"smallmouthbass", name:"Smallmouth Bass", rarity:"uncommon", zone:"river", minKg:0.9, maxKg:3.2, valuePerKg:9, strength:4, speed:4, behavior:"directional", shape:"round", color:"#6b8f5c", belly:"#d9e8c9", fin:"#3f5c34", pattern:"stripes", patternColor:"#2f4527", features:["spinyfin"] },
  { id:"pike",    name:"Pike",    rarity:"uncommon", zone:"river", minKg:1.5, maxKg:5.5, valuePerKg:10, strength:5, speed:6, behavior:"burst", shape:"spike", color:"#4a6b4f", belly:"#a9c9a0", fin:"#2c3f2e", pattern:"spots", patternColor:"#233524", features:["teeth"] },
  { id:"walleye", name:"Walleye", rarity:"uncommon", zone:"river", minKg:1.0, maxKg:4.0, valuePerKg:10, strength:4, speed:5, behavior:"escalating", shape:"long", color:"#8a9a6b", belly:"#dbe6c2", fin:"#5c6a44", pattern:"gradient", patternColor:"#c9d9a0", features:[] },
  { id:"arcticchar", name:"Arctic Char", rarity:"uncommon", zone:"river", minKg:1.2, maxKg:4.5, valuePerKg:11, strength:5, speed:6, behavior:"directional", shape:"long", color:"#d97b8f", belly:"#ffd9e2", fin:"#a34f62", pattern:"spots", patternColor:"#ffb3c4", features:[] },

  // --- Lake (rare) ---
  { id:"tuna",      name:"Tuna",       rarity:"rare", zone:"lake", minKg:5, maxKg:22, valuePerKg:13, strength:7, speed:8, behavior:"constant", shape:"torpedo", color:"#4d6fa8", belly:"#dbe8ff", fin:"#2e4a7a", pattern:"stripes", patternColor:"#c9d9f5", features:["finlets"] },
  { id:"barracuda", name:"Barracuda",  rarity:"rare", zone:"lake", minKg:3, maxKg:14, valuePerKg:14, strength:6, speed:9, behavior:"burst", shape:"spike", color:"#7d8b99", belly:"#dfe6ec", fin:"#4f5c68", pattern:"none", patternColor:"#000", features:["teeth"] },
  { id:"mahimahi",  name:"Mahi-mahi",  rarity:"rare", zone:"lake", minKg:4, maxKg:16, valuePerKg:15, strength:6, speed:7, behavior:"escalating", shape:"long", color:"#4fd6a0", belly:"#fff6b8", fin:"#2f9c6b", pattern:"gradient", patternColor:"#ffd15c", features:["ridgehead"] },
  { id:"muskellunge", name:"Muskellunge", rarity:"rare", zone:"lake", minKg:6, maxKg:25, valuePerKg:14, strength:7, speed:7, behavior:"burst", shape:"spike", color:"#5c6b4a", belly:"#c9d6a9", fin:"#3a4530", pattern:"spots", patternColor:"#2c3524", features:["teeth"] },
  { id:"sturgeon",  name:"Sturgeon",  rarity:"rare", zone:"lake", minKg:8, maxKg:30, valuePerKg:13, strength:8, speed:3, behavior:"resting", shape:"long", color:"#6b6355", belly:"#a89c85", fin:"#463f34", pattern:"none", patternColor:"#000", features:["whiskers","scars"] },
  { id:"paddlefish", name:"Paddlefish", rarity:"rare", zone:"lake", minKg:5, maxKg:20, valuePerKg:14, strength:6, speed:6, behavior:"steady", shape:"long", color:"#5a7a8f", belly:"#c2dbe6", fin:"#3a5261", pattern:"none", patternColor:"#000", features:["bill"] },
  { id:"goldentrout", name:"Golden Trout", rarity:"rare", zone:"lake", minKg:3, maxKg:12, valuePerKg:16, strength:6, speed:7, behavior:"escalating", shape:"long", color:"#e8b83c", belly:"#fff0c2", fin:"#b8871c", pattern:"spots", patternColor:"#ffe08a", features:[] },

  // --- Ocean (epic) ---
  { id:"swordfish", name:"Swordfish",     rarity:"epic", zone:"ocean", minKg:40, maxKg:120, valuePerKg:16, strength:9, speed:8, behavior:"burst", shape:"spike", color:"#5e6b8a", belly:"#c7cfe0", fin:"#333c52", pattern:"gradient", patternColor:"#8b98ba", features:["bill","sail"] },
  { id:"marlin",    name:"Marlin",        rarity:"epic", zone:"ocean", minKg:50, maxKg:180, valuePerKg:17, strength:9, speed:9, behavior:"escalating", shape:"spike", color:"#3a7bd5", belly:"#d8ecff", fin:"#1f4f8f", pattern:"stripes", patternColor:"#9fd0ff", features:["bill","sail"] },
  { id:"grouper",   name:"Giant Grouper", rarity:"epic", zone:"ocean", minKg:60, maxKg:200, valuePerKg:14, strength:10, speed:3, behavior:"resting", shape:"round", color:"#6b5e42", belly:"#cbb98d", fin:"#463c28", pattern:"spots", patternColor:"#3a3122", features:[] },
  { id:"hammerhead", name:"Hammerhead Shark", rarity:"epic", zone:"ocean", minKg:50, maxKg:150, valuePerKg:16, strength:9, speed:7, behavior:"constant", shape:"spike", color:"#6b7a8a", belly:"#d0dbe6", fin:"#43505c", pattern:"none", patternColor:"#000", features:["teeth","hammerhead"] },
  { id:"mantaray", name:"Manta Ray", rarity:"epic", zone:"ocean", minKg:80, maxKg:250, valuePerKg:15, strength:7, speed:5, behavior:"resting", shape:"round", color:"#2c3a4a", belly:"#7a8ea0", fin:"#1a2430", pattern:"gradient", patternColor:"#4a6070", features:["wings"] },
  { id:"oceansunfish", name:"Ocean Sunfish", rarity:"epic", zone:"ocean", minKg:100, maxKg:300, valuePerKg:13, strength:5, speed:2, behavior:"resting", shape:"round", color:"#8a97a0", belly:"#dbe2e6", fin:"#5c6a72", pattern:"spots", patternColor:"#3a4750", features:[] },
  { id:"electricray", name:"Electric Ray", rarity:"epic", zone:"ocean", minKg:20, maxKg:70, valuePerKg:17, strength:6, speed:4, behavior:"burst", shape:"round", color:"#4a5c8a", belly:"#a9c2ff", fin:"#2c3a5c", pattern:"gradient", patternColor:"#8ab3ff", features:["wings","electric"] },

  // --- Deep Sea (legendary) ---
  { id:"greatwhite", name:"Great White Shark",  rarity:"legendary", zone:"deepsea", minKg:300, maxKg:900, valuePerKg:20, strength:10, speed:8, behavior:"constant", shape:"spike", color:"#8b97a3", belly:"#eef2f6", fin:"#525c66", pattern:"gradient", patternColor:"#5a636d", features:["teeth","dorsal"] },
  { id:"giantsquid",  name:"Giant Squid",        rarity:"legendary", zone:"deepsea", minKg:150, maxKg:450, valuePerKg:22, strength:9, speed:6, behavior:"directional", shape:"squid", color:"#a0527a", belly:"#e8b8cf", fin:"#6e3456", pattern:"spots", patternColor:"#6e3456", features:["tentacles"] },
  { id:"coelacanth",  name:"Ancient Coelacanth", rarity:"legendary", zone:"deepsea", minKg:50, maxKg:110, valuePerKg:26, strength:8, speed:2, behavior:"resting", shape:"long", color:"#3f5b8c", belly:"#9fb8e0", fin:"#24365a", pattern:"spots", patternColor:"#c9d9f5", features:["lobefins"] },
  { id:"anglerfish", name:"Anglerfish", rarity:"legendary", zone:"deepsea", minKg:30, maxKg:90, valuePerKg:22, strength:6, speed:3, behavior:"resting", shape:"round", color:"#3a2c42", belly:"#6b5480", fin:"#241a2c", pattern:"none", patternColor:"#000", features:["lure","teeth"] },
  { id:"vampiresquid", name:"Vampire Squid", rarity:"legendary", zone:"deepsea", minKg:10, maxKg:35, valuePerKg:24, strength:5, speed:5, behavior:"directional", shape:"squid", color:"#2c1a30", belly:"#5c3a66", fin:"#1a0f1e", pattern:"none", patternColor:"#000", features:["tentacles"] },
  { id:"gulpereel", name:"Gulper Eel", rarity:"legendary", zone:"deepsea", minKg:15, maxKg:50, valuePerKg:23, strength:6, speed:4, behavior:"escalating", shape:"long", color:"#1a2432", belly:"#3a4a5c", fin:"#0f1620", pattern:"none", patternColor:"#000", features:["teeth"] },
  { id:"frilledshark", name:"Frilled Shark", rarity:"legendary", zone:"deepsea", minKg:40, maxKg:120, valuePerKg:25, strength:8, speed:5, behavior:"burst", shape:"spike", color:"#4a3a3a", belly:"#8a6f6f", fin:"#2c2020", pattern:"none", patternColor:"#000", features:["teeth","scars"] },
];

const BOSS_DB = {
  pond:    { id:"oldwhiskers", name:"Old Whiskers", rarity:"boss", minKg:8,  maxKg:16,  valuePerKg:30, strength:8,  speed:3, behavior:"resting",    shape:"long",  color:"#5c4a33", belly:"#a9906a", fin:"#372a1c", pattern:"none", patternColor:"#000", features:["whiskers","scars"], desc:"An enormous catfish said to lurk beneath the dock." },
  river:   { id:"riverking",   name:"The River King", rarity:"boss", minKg:15, maxKg:26, valuePerKg:32, strength:9,  speed:6, behavior:"escalating", shape:"long",  color:"#c9556f", belly:"#ffc9d6", fin:"#8a2f45", pattern:"stripes", patternColor:"#ffd166", features:["crown","scars"], desc:"A giant salmon that rules the rapids." },
  lake:    { id:"thelurker",   name:"The Lurker", rarity:"boss", minKg:25, maxKg:40,  valuePerKg:34, strength:9,  speed:5, behavior:"burst",      shape:"spike", color:"#3f6b4a", belly:"#a9d6b0", fin:"#22402a", pattern:"spots", patternColor:"#254a30", features:["teeth","scars"], desc:"An enormous pike that ambushes from the reeds." },
  ocean:   { id:"thetitan",    name:"The Titan", rarity:"boss", minKg:220, maxKg:340, valuePerKg:36, strength:10, speed:8, behavior:"constant",   shape:"spike", color:"#2f5fae", belly:"#cfe2ff", fin:"#1a3a72", pattern:"stripes", patternColor:"#8fc4ff", features:["bill","sail","scars"], desc:"A giant marlin, king of the open water." },
  deepsea: { id:"theabyssal",  name:"The Abyssal One", rarity:"boss", minKg:500, maxKg:800, valuePerKg:40, strength:10, speed:7, behavior:"escalating", shape:"round", color:"#4a2f5c", belly:"#7a5490", fin:"#2c1a38", pattern:"none", patternColor:"#000", features:["lure","teeth"], desc:"Something ancient stirs in the trench below." },
};

// --- Secret/mythic fish: whimsical rarities that can bite in ANY zone with a tiny chance,
// each rendered with a fully custom sprite routine instead of the standard body pipeline.
const SECRET_FISH_DB = [
  { id:"pixelfish",  name:"Pixelfish",   rarity:"mythic", zone:"secret", minKg:1, maxKg:4,  valuePerKg:35, strength:5, speed:8, behavior:"burst",   shape:"round", color:"#5ad1e6", belly:"#eaf2ff", fin:"#8a7ee6", pattern:"none", patternColor:"#000", features:[], special:"pixel",
    desc:"A fish rendered entirely out of chunky, shimmering pixels. Nobody knows why." },
  { id:"cerebusfish", name:"Cerebus Fish", rarity:"mythic", zone:"secret", minKg:6, maxKg:14, valuePerKg:38, strength:9, speed:5, behavior:"chaotic", shape:"round", color:"#9a5c3c", belly:"#d9b48c", fin:"#5c3a24", pattern:"none", patternColor:"#000", features:[], special:"cerberus",
    desc:"Three snapping heads, one very confused body. Guards nothing in particular." },
  { id:"chronocarp", name:"Chrono Carp", rarity:"mythic", zone:"secret", minKg:2, maxKg:6, valuePerKg:32, strength:4, speed:4, behavior:"resting", shape:"long", color:"#8fb8ff", belly:"#dce8ff", fin:"#4a6fa8", pattern:"none", patternColor:"#000", features:[], special:"chrono",
    desc:"Trails faint copies of itself through time. Always a little late to its own splash." },
];

/* ---------------------------- DATA: ZONES ---------------------------- */
const ZONES = {
  pond:    { id:"pond",    name:"Pond",     order:0, unlockLevel:1,  sky:["#8fd3ff","#cdeeff"], water:["#2d7fb0","#1c4f75"], tier:"common" },
  river:   { id:"river",   name:"River",    order:1, unlockLevel:5,  sky:["#7fc4e8","#c9e8f5"], water:["#2f7a9c","#1b4a63"], tier:"uncommon" },
  lake:    { id:"lake",    name:"Lake",     order:2, unlockLevel:10, sky:["#5fa8d6","#a9d6ea"], water:["#1f6a8c","#123f57"], tier:"rare" },
  ocean:   { id:"ocean",   name:"Ocean",    order:3, unlockLevel:16, sky:["#3f79b8","#7fb2d9"], water:["#124a70","#0b2c44"], tier:"epic" },
  deepsea: { id:"deepsea", name:"Deep Sea", order:4, unlockLevel:24, sky:["#0e1c33","#1c3050"], water:["#081525","#03080f"], tier:"legendary" },
  sunkenruins: { id:"sunkenruins", name:"Sunken Academy Ruins", order:5, unlockLevel:1, secret:true, sky:["#17102d","#30234c"], water:["#102d38","#04151c"], tier:"legendary" },
};

/* ---------------------------- DATA: IN-RUN UPGRADES ---------------------------- */
const UPGRADE_POOL = [
  { id:"strongline", name:"Strong Line",  desc:"+15% larger catching zone.", apply:r=>r.tensionMaxMult+=0.15 },
  { id:"quickreel",  name:"Quick Reel",   desc:"+10% marker rise speed.",    apply:r=>r.reelSpeedMult+=0.10 },
  { id:"longcast",   name:"Long Cast",    desc:"+15% maximum casting distance.", apply:r=>r.castDistanceMult+=0.15 },
  { id:"fishfinder", name:"Fish Finder",  desc:"Slightly increases rare fish chance.", apply:r=>r.rareChanceBonus+=0.08 },
  { id:"luckyhook",  name:"Lucky Hook",   desc:"Increases fish value.",      apply:r=>r.valueMult+=0.15 },
  { id:"fasthook",   name:"Fast Hook",    desc:"Increases the hook reaction window.", apply:r=>r.hookWindowBonusMs+=250 },
  { id:"steadyhands",name:"Steady Hands", desc:"Marker falls more slowly — easier to hold in the zone.", apply:r=>r.tensionGainMult-=0.12 },
  { id:"powerreel",  name:"Power Reel",   desc:"Reel in faster once locked on, but the marker gets twitchier.", apply:r=>{r.pullMult+=0.30; r.tensionGainMult+=0.15;} },
  { id:"treasure",   name:"Treasure Hunter", desc:"Chance to catch treasure instead of fish.", apply:r=>r.treasureChance+=0.06 },
  { id:"doublecatch",name:"Double Catch", desc:"Small chance for a catch to count twice.", apply:r=>r.doubleCatchChance+=0.08 },
];

/* ---------------------------- DATA: PERMANENT SHOP UPGRADES ---------------------------- */
function permUpgradeDefs(){
  return [
    { id:"rod",  name:"Better Rod",  desc:"Reel in faster once your marker is locked in the zone.", baseCost:100, costMult:1.9, max:8 },
    { id:"line", name:"Better Line", desc:"Slightly widens your catching zone.", baseCost:100, costMult:1.9, max:8 },
    { id:"hook", name:"Better Hook", desc:"Makes hooking fish easier.",       baseCost:100, costMult:1.8, max:8 },
    { id:"reel", name:"Better Reel", desc:"Improves starting reel speed.",    baseCost:100, costMult:1.9, max:8 },
    { id:"lure", name:"Lucky Lure",  desc:"Improves starting rarity chance.", baseCost:100, costMult:2.1, max:6 },
  ];
}

/* ---------------------------- STATE ---------------------------- */
let state = null;

function freshState(){
  return {
    coins: 0,
    bait: CONFIG.startBait,
    xp: 0,
    level: 1,
    zone: "pond",
    fishdex: {},           // id -> {caughtCount, bestWeight, bestValue}
    perm: { rod:0, line:0, hook:0, reel:0, lure:0, bag:0 },
    run: freshRunUpgrades(),
    inventory: [],          // fish waiting in the cooler, not yet sold: {uid, fishId, name, rarity, weight, baseValue, caughtAt}
    market: {},             // fishId -> { supplyMult } - drops when you sell, recovers over time
    stats: { totalCaught:0, totalCoinsEarned:0 } // lifetime
  };
}
// Zone access is derived purely from the player's current level - it's never saved to
// localStorage, so it always reflects the level state actually has right now.
function isZoneUnlocked(zoneId){
  const zone=ZONES[zoneId];
  return !!zone && (!zone.secret || hasAnglerSecret("secret_map_border")) && state.level >= zone.unlockLevel;
}
function freshRunUpgrades(){
  return {
    tensionMaxMult:1, reelSpeedMult:1, castDistanceMult:1,
    rareChanceBonus:0, valueMult:1, hookWindowBonusMs:0,
    tensionGainMult:1, pullMult:1, treasureChance:0, doubleCatchChance:0,
    chosen: [] // list of upgrade ids picked this run (stack counts)
  };
}

/* ---------------------------- SAVE / LOAD ---------------------------- */
function saveGame(){
  try{
    // NOTE: zone access is intentionally NOT persisted here - it's always recomputed
    // from state.level via isZoneUnlocked(), so it can never go stale or be edited.
    const persist = {
      xp: state.xp, level: state.level,
      fishdex: state.fishdex,
      perm: state.perm, stats: state.stats, zone: state.zone,
      inventory: state.inventory, market: state.market
    };
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(persist));
  }catch(e){ /* storage unavailable - fail silently, game still playable */ }
}
function loadGame(){
  state = freshState();
  try{
    const raw = localStorage.getItem(CONFIG.saveKey);
    if(raw){
      const p = JSON.parse(raw);
      Object.assign(state, {
        xp:p.xp||0, level:p.level||1,
        fishdex: p.fishdex||{}, perm: Object.assign(state.perm, p.perm||{}),
        stats: Object.assign(state.stats, p.stats||{}), zone: p.zone||"pond",
        inventory: p.inventory||[], market: p.market||{}
      });
    }
  }catch(e){ /* corrupted save - start fresh */ }
  // if a save is somehow restored to a zone the current level no longer supports
  // (e.g. after a manual edit), fall back to the pond rather than getting stuck.
  if(!isZoneUnlocked(state.zone)) state.zone = "pond";
  state.bait = CONFIG.startBait;
  state.run = freshRunUpgrades();
}

/* ---------------------------- BAIT SYSTEM ---------------------------- */
// Structured so an educational question system can later call addBait(1) per correct answer.
function addBait(amount){
  const previous = state.bait;
  state.bait = clamp(state.bait + amount, 0, CONFIG.maxBait);
  refreshHUD();
  const added = state.bait - previous;
  if(added>0) showBanner(`+${added} BAIT · ${state.bait}/${CONFIG.maxBait}`);
  return added;
}
function spendBait(amount){
  if(state.bait < amount) return false;
  state.bait -= amount;
  refreshHUD();
  return true;
}

/* ---------------------------- RUNTIME (non-persisted) ---------------------------- */
const RT = {
  phase: "idle",           // idle | charging | flying | waiting | biting | reeling | caught | bossintro
  power: 0,                 // 0..1 cast charge
  chargeStart: 0,
  aim: { x:0.5 },           // horizontal aim 0..1 (for bobber landing x)
  bobber: { x:0,y:0, targetX:0, targetY:0, t:0, flying:false, bobPhase:0 },
  biteTimer: 0,
  hookWindowLeft: 0,
  currentFish: null,        // fish def object (from DB or boss)
  fishWeight: 0,
  fightPhaseTimer: 0,
  fightDirection: 1,
  distance: 100,
  tension: 0,
  reeling: false,
  isBoss: false,
  event: null,              // active random event {id,name,endsAt,...}
  nextEventAt: 0,
  dayNight: 0,               // 0..1 cycling
  particles: [],
  bossEncounterArmed: false,
  castsInZone: 0,
  paused: false,
  isSecret: false,
  isEventFish: false,
  bossEnraged: false,
  perfectCatch: false,
  fightState: { message:"", urgency:"neutral", surge:false },
  shakeUntil: 0,
  shakeMag: 0,
};

/* ---------------------------- DOM REFS ---------------------------- */
const $ = id=>document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");
const coinsText=$("coinsText"), baitText=$("baitText"), zoneLabel=$("zoneLabel");
const xpBarInner=$("xpBarInner"), lvlText=$("lvlText");
const mainActionBtn=$("mainActionBtn"), hintText=$("hintText");
const powerMeterWrap=$("powerMeterWrap"), powerMeterInner=$("powerMeterInner");
const reelUI=$("reelUI"), distanceInner=$("distanceInner"), tensionInner=$("tensionInner"), bossTag=$("bossTag"), reelHelp=$("reelHelp"), tensionCatchZone=$("tensionCatchZone");
const biteBang=$("biteBang");
const surgeFlash=$("surgeFlash");
const catchPopup=$("catchPopup"), catchTitle=$("catchTitle"), catchFishName=$("catchFishName"), catchStats=$("catchStats"), catchCoins=$("catchCoins"), catchFishCanvas=$("catchFishCanvas");
const bannerWrap=$("bannerWrap");

/* ---------------------------- CANVAS SIZING ---------------------------- */
function resizeCanvas(){
  const wrap = document.getElementById("game-wrap");
  const w = wrap.clientWidth, h = wrap.clientHeight;
  canvas.width = w; canvas.height = h;
}
function resizeHomeFishCanvas(){
  const el = $("homeFishCanvas");
  el.width = el.clientWidth;
  el.height = el.clientHeight;
}
window.addEventListener("resize", ()=>{ resizeCanvas(); resizeHomeFishCanvas(); });

/* ---------------------------- HELPERS ---------------------------- */
function rand(min,max){ return min + Math.random()*(max-min); }
function randInt(min,max){ return Math.floor(rand(min,max+1)); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function lerp(a,b,t){ return a+(b-a)*t; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

/* ---- colour/size variance helpers: every individual catch gets a unique
   hue/lightness shift and a size scale derived from where its weight falls
   within the species' range, so no two fish of the same species look identical. */
function hexToHsl(hex){
  const c = hex.replace('#','');
  const n = c.length===3 ? c.split('').map(ch=>ch+ch).join('') : c;
  const num = parseInt(n,16);
  const r=((num>>16)&255)/255, g=((num>>8)&255)/255, b=(num&255)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s; const l=(max+min)/2;
  if(max===min){ h=0; s=0; }
  else{
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2; break;
      default: h=(r-g)/d+4;
    }
    h/=6;
  }
  return [h*360, s*100, l*100];
}
function hslToHex(h,s,l){
  h=((h%360)+360)%360; h/=360; s=clamp(s,0,100)/100; l=clamp(l,0,100)/100;
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; };
    const q = l<0.5 ? l*(1+s) : l+s-l*s;
    const p = 2*l-q;
    r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
  }
  const toHex = x=>{ const v=Math.round(clamp(x*255,0,255)); return v.toString(16).padStart(2,'0'); };
  return '#'+toHex(r)+toHex(g)+toHex(b);
}
function shiftHex(hex, hueShift, satShift, lightShift){
  const [h,s,l] = hexToHsl(hex);
  return hslToHex(h+hueShift, clamp(s+satShift,6,96), clamp(l+lightShift,8,92));
}
function hashStr(s){
  let h=0;
  for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; }
  return Math.abs(h);
}
function seededRand(seed){
  let s = seed%2147483647; if(s<=0) s+=2147483646;
  return function(){ s = (s*16807)%2147483647; return (s-1)/2147483646; };
}
function applyVariant(base, frac){
  frac = frac===undefined ? 0.5 : frac;
  const v = Object.assign({}, base);
  const hueShift = rand(-16,16), satShift = rand(-8,8), lightShift = rand(-7,7);
  v.color = shiftHex(base.color, hueShift, satShift, lightShift);
  if(base.belly) v.belly = shiftHex(base.belly, hueShift*0.7, satShift*0.6, lightShift*0.6);
  if(base.fin)   v.fin   = shiftHex(base.fin,   hueShift*0.8, satShift*0.6, lightShift*0.6);
  if(base.patternColor && base.patternColor!=="#000") v.patternColor = shiftHex(base.patternColor, hueShift*0.6, satShift*0.5, lightShift*0.5);
  v.sizeScale = clamp(0.8 + frac*0.5 + rand(-0.05,0.05), 0.72, 1.4);
  v.sizeTag = frac<0.12 ? "Runt " : (frac>0.85 ? "Giant " : "");
  v._seed = hashStr(base.id) + Math.floor(rand(0,99999));
  return v;
}

function hasAnglerSecret(id){return !!window.AchievementManager?.hasSecret?.(id);}
function currentZone(){ return ZONES[state.zone] || ZONES.pond; }

function showBanner(text, ms=2600){
  const el = document.createElement("div");
  el.className="banner";
  el.textContent = text;
  bannerWrap.appendChild(el);
  setTimeout(()=>{ el.style.transition="opacity .3s"; el.style.opacity="0"; setTimeout(()=>el.remove(),320); }, ms);
}

function refreshHUD(){
  const sharedCoins = window.PlatformManager?.getCoins?.() || 0;
  state.coins = sharedCoins;
  coinsText.textContent = Math.floor(sharedCoins);
  if($("homeCoins")) $("homeCoins").textContent = Math.floor(sharedCoins);
  if($("homeCaught")) $("homeCaught").textContent = state.stats.totalCaught;
  if($("homeHighScore")) $("homeHighScore").textContent = window.PlatformManager?.getGameStats?.(GAME_ID)?.highScore || 0;
  baitText.textContent = state.bait;
  zoneLabel.textContent = currentZone().name;
  const need = xpForLevel(state.level);
  xpBarInner.style.width = clamp(state.xp/need,0,1)*100 + "%";
  lvlText.textContent = "LVL " + state.level;
  const busy = ["charging","flying","waiting","biting","reeling"].includes(RT.phase);
  $("btnShop").classList.toggle("disabled", busy);
  $("btnZones").classList.toggle("disabled", busy);
  $("btnCooler").classList.toggle("disabled", busy);
  $("coolerCount").textContent = state.inventory.length;
}

function xpForLevel(lvl){ return Math.round(20 * Math.pow(1.35, lvl-1)); }

/* =========================================================================
   CASTING
   ========================================================================= */
function beginCharge(){
  if(RT.phase!=="idle") return;
  if(state.bait<=0){ onOutOfBait(); return; }
  RT.phase="charging";
  RT.chargeStart = performance.now();
  powerMeterWrap.style.display="block";
  mainActionBtn.textContent="RELEASE TO CAST";
  hintText.textContent="Charging power…";
}
function requestCast(){
  if(RT.phase!=="idle" || RT.paused) return;
  // Any banked bait can fund the next cast; questions are only required once
  // the stack is empty. This is what makes answering ahead genuinely useful.
  if(castReady || state.bait>0){ castReady=false; beginCharge(); return; }
  showCastQuestion();
}
function showCastQuestion(){
  if(!questionBankReady || !window.QuestionManager?.hasQuestions?.()){showBanner("Your class questions are not ready.",2200);return;}
  if(state.bait>=CONFIG.maxBait){castReady=true;showBanner(`Bait is full (${CONFIG.maxBait}/${CONFIG.maxBait}). Go fishing!`,2200);return;}
  currentQuestion=QuestionManager.getNextQuestion();if(!currentQuestion)return;
  RT.paused=true;$("questionPrompt").textContent=currentQuestion.q;$("questionFeedback").textContent="";
  $("questionProgress").textContent=`Bait ${state.bait}/${CONFIG.maxBait} · Correct: +1 bait · Incorrect: −20 coins`;
  $("questionContinueActions").hidden=true;
  const options=$("questionOptions");options.replaceChildren();
  currentQuestion.a.forEach((answer,index)=>{const button=document.createElement("button");button.type="button";button.textContent=answer;button.onclick=()=>answerCastQuestion(index,button);options.appendChild(button);});
  $("modalQuestion").classList.add("show");
}
function answerCastQuestion(index,button){
  const correct=index===currentQuestion.c;
  $("questionOptions").querySelectorAll("button").forEach((option,i)=>{option.disabled=true;if(i===currentQuestion.c)option.classList.add("correct");});
  if(!correct)button.classList.add("wrong");QuestionManager.recordAnswer(currentQuestion,correct);PlatformManager.recordQuestionAnswered(GAME_ID,correct);
  anglerQuestionStreak=correct?anglerQuestionStreak+1:0;window.AchievementManager?.notify?.("angler_question_result",{facts:{angler_correct_streak:anglerQuestionStreak}});
  if(correct){
    addBait(1);castReady=true;
    const full=state.bait>=CONFIG.maxBait;
    $("questionFeedback").textContent=full?`Correct — bait is full at ${CONFIG.maxBait}!`:`Correct — bait added (${state.bait}/${CONFIG.maxBait}).`;
    $("questionProgress").textContent=`Bait ${state.bait}/${CONFIG.maxBait}`;
    const actions=$("questionContinueActions");actions.hidden=false;
    $("answerAnotherQuestionBtn").hidden=full;
    $("answerAnotherQuestionBtn").onclick=()=>showCastQuestion();
    $("goFishingBtn").onclick=()=>{$("modalQuestion").classList.remove("show");actions.hidden=true;RT.paused=false;mainActionBtn.textContent="CAST LINE";hintText.textContent=`${state.bait} bait ready · hold to charge your cast`;};
  }
  else{PlatformManager.deductCoins(20);refreshHUD();$("questionFeedback").textContent="Incorrect — 20 coins lost. Try another question.";}
  if(!correct)setTimeout(()=>showCastQuestion(),1000);
}
function updateCharge(){
  if(RT.phase!=="charging") return;
  const t = (performance.now()-RT.chargeStart) / CONFIG.baseCastPowerTimeMs;
  RT.power = clamp( (Math.sin(t*Math.PI*0.999 - Math.PI/2)+1)/2 * (t<1?1:1), 0, 1);
  // simple ping-pong so holding longer doesn't just max out instantly: bounce 0->1->0
  const cyc = t % 2;
  RT.power = cyc<=1 ? cyc : 2-cyc;
  powerMeterInner.style.width = (RT.power*100)+"%";
}
function releaseCast(){
  if(RT.phase!=="charging") return;
  if(!spendBait(1)){ cancelCharge(); onOutOfBait(); return; }
  const power = Math.max(0.15, RT.power);
  powerMeterWrap.style.display="none";
  RT.phase="flying";
  const dist = 0.25 + power*0.7; // 0..1 across water area
  RT.bobber.flying=true;
  RT.bobber.t=0;
  RT.bobber.targetX = clamp(RT.aim.x, 0.15, 0.92);
  RT.bobber.targetDist = dist;
  RT.castsInZone++;
  mainActionBtn.textContent="…";
  hintText.textContent="Casting…";
  refreshHUD();
}
function cancelCharge(){
  RT.phase="idle"; RT.power=0;
  powerMeterWrap.style.display="none";
  mainActionBtn.textContent="CAST LINE";
  hintText.textContent="Hold to charge your cast, release to throw";
}
function onBobberLanded(){
  RT.phase="waiting";
  mainActionBtn.textContent="WAITING…";
  hintText.textContent="Watching the bobber…";
  const spread = state.run.hookWindowBonusMs; // used later
  const mult = RT.event && RT.event.id==="calm" ? 0.8 : (RT.event && RT.event.id==="storm" ? 1.3 : 1);
  RT.biteTimer = rand(CONFIG.biteDelayMin, CONFIG.biteDelayMax) * mult;
}

/* =========================================================================
   BITE + HOOK
   ========================================================================= */
function triggerBite(){
  RT.phase="biting";
  chooseFishForBite();
  let baseWindow = CONFIG.hookWindowMs + state.run.hookWindowBonusMs + state.perm.hook*60;
  if(RT.event && RT.event.id==="fog") baseWindow -= 220; // harder to time in the fog
  RT.hookWindowLeft = Math.max(300, baseWindow);
  biteBang.style.display="block";
  positionBiteBang();
  mainActionBtn.textContent="HOOK IT!";
  hintText.textContent="Tap now!";
}
function positionBiteBang(){
  const rect = canvas.getBoundingClientRect();
  const bx = RT.bobber.targetX * rect.width;
  const by = waterSurfaceY(rect.height) - 26;
  biteBang.style.left = (bx-12)+"px";
  biteBang.style.top = by+"px";
}
function updateSurgeFlash(){
  if(RT.zoneEnterFlashUntil && performance.now()<RT.zoneEnterFlashUntil && RT.bobber.screenX!==undefined){
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width/canvas.width, scaleY = rect.height/canvas.height;
    surgeFlash.textContent = "🎯";
    surgeFlash.style.color = "#7cd992";
    surgeFlash.style.textShadow = "0 0 10px rgba(124,217,146,0.9), 0 0 2px #000";
    surgeFlash.style.left = (RT.bobber.screenX*scaleX-10)+"px";
    surgeFlash.style.top = (RT.bobber.screenY*scaleY-46)+"px";
    surgeFlash.style.display="block";
  } else {
    surgeFlash.style.display="none";
  }
}
function chooseFishForBite(){
  const zone = currentZone();
  RT.isBoss = false;
  RT.isSecret = false;
  RT.isEventFish = false;
  // an event with an exclusive fish gives a generous chance at that fish while it's live -
  // that's the whole point of the event, so this comes first in the roll
  const eventFishChance = (RT.event && RT.event.exclusiveFish) ? 0.14 : 0;
  // secret/mythic fish can bite in any zone with a tiny chance
  const secretChance = 0.012 + (hasAnglerSecret("secret_skeleton")?0.025:0) + (RT.event && RT.event.id==="feeding" ? 0.02 : 0);
  // boss chance grows with casts in zone, small baseline
  let bossChance = 0.015 + Math.min(0.10, RT.castsInZone*0.006);
  if(RT.event && RT.event.id==="monster") bossChance += 0.5;
  const roll = Math.random();
  let base;
  if(eventFishChance && roll < eventFishChance){
    RT.isEventFish = true;
    base = RT.event.exclusiveFish;
  } else if(roll < eventFishChance+secretChance){
    RT.isSecret = true;
    base = pick(SECRET_FISH_DB);
  } else if(!RT.bossEncounterArmed && roll < eventFishChance+secretChance+bossChance){
    RT.isBoss = true;
    base = BOSS_DB[zone.id];
  } else {
    let pool = zone.secret ? FISH_DB : FISH_DB.filter(f=>f.zone===zone.id);
    // rare chance bonus nudges toward rarer entries within pool by weighting
    // (fog makes fish less wary, giving a similar nudge toward the rarer end of the pool)
    const rareBonus = state.run.rareChanceBonus + state.perm.lure*0.02 + (RT.event && RT.event.id==="fog" ? 0.05 : 0);
    const weights = pool.map((f,i)=> 1 + i*rareBonus*2);
    base = weightedPick(pool, weights);
  }
  let [minKg,maxKg] = [base.minKg, base.maxKg];
  if(RT.event && RT.event.id==="monster") { minKg = maxKg; maxKg = maxKg*1.4; }
  RT.fishWeight = rand(minKg, maxKg);
  const frac = maxKg>minKg ? clamp((RT.fishWeight-minKg)/(maxKg-minKg),0,1) : 0.5;
  RT.currentFish = applyVariant(base, frac);
}
function weightedPick(items, weights){
  const total = weights.reduce((a,b)=>a+b,0);
  let r = Math.random()*total;
  for(let i=0;i<items.length;i++){ r-=weights[i]; if(r<=0) return items[i]; }
  return items[items.length-1];
}
function attemptHook(){
  if(RT.phase!=="biting") return;
  startReel();
}
function onHookMissed(){
  biteBang.style.display="none";
  showBanner("It got away…", 1600);
  endToIdle();
}

/* =========================================================================
   REELING MINIGAME
   ========================================================================= */
function computeZoneCenter(phase, width, wobble){
  const amp = (100-width)/2*0.94;
  let center = 50 + amp*Math.sin(phase);
  if(wobble){ center += amp*0.28*Math.sin(phase*2.7+1.2); }
  return clamp(center, width/2+1, 99-width/2);
}
function startReel(){
  biteBang.style.display="none";
  RT.phase="reeling";
  RT.reelElapsed = 0;
  RT.fightPhaseTimer = 0;
  RT.fightDirection = 1;
  RT.zonePhase = rand(0,Math.PI*2);
  RT.bossEnraged = false;
  RT.perfectCatch = false;
  RT._wasInZone = false;
  RT.zoneEnterFlashUntil = 0;
  const fish = RT.currentFish;
  const zoneDef = ZONE_BY_RARITY[fish.rarity] || ZONE_BY_RARITY.common;
  const r = state.run;
  const secretDifficulty=(hasAnglerSecret("secret_skeleton") ? .85 : 1)*(hasAnglerSecret("secret_glitch_aura") ? .8 : 1);
  RT.zoneWidth = clamp(zoneDef.width * (r.tensionMaxMult||1) * (1+state.perm.line*0.04)*secretDifficulty, 7, zoneDef.maxWidth||62);
  RT.zoneBaseSpeed = zoneDef.speed * (1 + (fish.speed-5)*0.035);
  RT.zonePullMult = zoneDef.pull||1;
  RT.zoneDriftMult = zoneDef.drift||1;
  RT.zoneWobble = (fish.rarity==="mythic" || fish.rarity==="boss") ? 1 : 0;
  RT.zoneCenter = computeZoneCenter(RT.zonePhase, RT.zoneWidth, RT.zoneWobble);
  // Higher-tier fish begin progressively further from the marker, so the player
  // must actively acquire the moving zone rather than receiving a guaranteed lock.
  const startDirection=Math.random()<.5?-1:1;
  RT.tension = clamp(RT.zoneCenter+startDirection*(zoneDef.startOffset||0),0,100);
  RT.distance = 92;
  RT.fightState = { message:"Hold to raise the marker — keep it in the zone!", urgency:"neutral", inZone:true };
  reelUI.style.display="flex";
  bossTag.style.display = (RT.isBoss || RT.isSecret || RT.isEventFish) ? "block":"none";
  bossTag.textContent = RT.isBoss ? "⚠ BOSS ENCOUNTER ⚠" : (RT.isSecret ? "✦ MYTHICAL ENCOUNTER ✦" : (RT.isEventFish ? `✦ ${RT.event.name.toUpperCase()} ✦` : ""));
  bossTag.style.color = RT.isSecret ? "#ff6bd6" : (RT.isEventFish ? RARITY[RT.currentFish.rarity].color : "");
  bossTag.style.textShadow = RT.isSecret ? "0 0 8px rgba(255,107,214,0.6)" : (RT.isEventFish ? `0 0 8px ${hexToRgba(RARITY[RT.currentFish.rarity].color,0.6)}` : "");
  reelHelp.className = "";
  mainActionBtn.textContent="REEL";
  hintText.textContent="Hold to raise the marker — keep it in the zone!";
}
function updateReel(dt){
  if(RT.phase!=="reeling") return;
  const fish = RT.currentFish;
  const r = state.run;
  const dtS = dt/1000;
  RT.reelElapsed += dt;

  // --- move the catching zone along the tension axis ---
  const enrageSpeedMult = (RT.isBoss && RT.bossEnraged) ? 1.65 : 1;
  const speed = RT.zoneBaseSpeed * enrageSpeedMult;
  RT.zonePhase += dt*0.001*speed;
  let width = RT.zoneWidth * (RT.isBoss && RT.bossEnraged ? 0.75 : 1);
  const center = computeZoneCenter(RT.zonePhase, width, RT.zoneWobble);
  RT.zoneCenter = center;
  RT.zoneWidthNow = width;

  // --- player-controlled marker: hold to raise, release to fall ---
  const riseSpeed = CONFIG.markerRiseBase * r.reelSpeedMult * r.pullMult * (1+state.perm.reel*0.06);
  const fallSpeed = CONFIG.markerFallBase * clamp(r.tensionGainMult,0.5,1.8);
  if(RT.reeling){ RT.tension += riseSpeed*dtS; }
  else { RT.tension -= fallSpeed*dtS; }
  RT.tension = clamp(RT.tension,0,100);

  const inZone = Math.abs(RT.tension-center) <= width/2;
  RT.fightState.inZone = inZone;
  if(inZone && !RT._wasInZone){ RT.zoneEnterFlashUntil = performance.now()+350; }
  RT._wasInZone = inZone;

  // --- distance: closes while locked on target, drifts back open otherwise ---
  if(inZone){
    const pullRate = CONFIG.inZonePullPerSec * RT.zonePullMult * (1+state.perm.rod*0.06);
    RT.distance -= pullRate*dtS;
  } else {
    RT.distance += fishDriftRate(fish, dt) * RT.zoneDriftMult * dtS;
  }
  RT.distance = clamp(RT.distance,0,100);

  // boss enrage: triggers once, the first time a boss is fought to the halfway mark
  if(RT.isBoss && !RT.bossEnraged && RT.distance<=50){
    RT.bossEnraged = true;
    RT.shakeUntil = performance.now()+450;
    RT.shakeMag = 6;
    showBanner(`⚠ ${fish.name} surges — the zone gets faster!`, 2400);
  }

  updateFightMessage(fish, inZone, RT.tension, center, width);

  distanceInner.style.width = RT.distance+"%";
  tensionInner.style.width = RT.tension+"%";
  tensionInner.style.background = inZone ? "linear-gradient(90deg,#7cd992,#5ad1e6)" : "";
  tensionCatchZone.style.left = (center-width/2)+"%";
  tensionCatchZone.style.width = width+"%";
  const zoneColor = RARITY[fish.rarity] ? RARITY[fish.rarity].color : "#7cd992";
  tensionCatchZone.style.background = hexToRgba(zoneColor,0.28);
  tensionCatchZone.style.borderColor = hexToRgba(zoneColor,0.8);

  if(RT.reelElapsed>1200 && RT.distance>=100){
    onFishEscaped();
  } else if(RT.distance<=0){
    RT.perfectCatch = Math.abs(RT.tension-center) <= width*0.25;
    onFishCaught();
  }
}
// how fast the fish pulls the distance bar back open while the player's marker is outside
// the catching zone - reuses each species' behavior pattern for extra personality/variety.
function fishDriftRate(fish, dtMs){
  const speedFactor = 0.4 + fish.speed*0.08;
  RT.fightPhaseTimer = (RT.fightPhaseTimer||0) + dtMs;
  let drift;
  switch(fish.behavior){
    case "steady":      drift = 3.5*speedFactor; break;
    case "constant":    drift = 5.5*speedFactor; break;
    case "burst":       drift = (Math.sin(RT.fightPhaseTimer*0.006)>0.6 ? 10 : 2)*speedFactor; break;
    case "directional":
      if(RT.fightPhaseTimer>600){ RT.fightPhaseTimer=0; RT.fightDirection*=-1; }
      drift = 4*speedFactor*(RT.fightDirection>0?1:0.5);
      break;
    case "resting":     drift = (Math.floor(RT.fightPhaseTimer/1500)%2===0 ? 5 : 0.8)*speedFactor; break;
    case "escalating":  drift = (2+Math.min(7,RT.fightPhaseTimer/700))*speedFactor; break;
    case "chaotic":     drift = (3.5 + Math.sin(RT.fightPhaseTimer*0.013)*4 + Math.sin(RT.fightPhaseTimer*0.031+2)*2.5)*speedFactor; break;
    default:            drift = 3.5*speedFactor;
  }
  if(RT.event && RT.event.id==="calm") drift *= 0.55;
  if(RT.event && RT.event.id==="storm") drift *= 1.35;
  return Math.max(0.6, drift);
}
function updateFightMessage(fish, inZone, tension, center, width){
  let msg, urgency;
  if(inZone){
    msg = "🎯 Locked on — reeling it in!"; urgency="safe";
  } else if(tension>92){
    msg = "Marker pinned at the top — ease off to drop back into range."; urgency="neutral";
  } else if(tension<8){
    msg = "Line's slack — hold to catch up to the zone."; urgency="neutral";
  } else if(Math.abs(tension-center) < width){
    msg = "Almost there — keep tracking it!"; urgency="neutral";
  } else {
    msg = "⚠ Out of the zone — fish pulling away!"; urgency="danger";
  }
  RT.fightState.message = msg;
  RT.fightState.urgency = urgency;
  reelHelp.textContent = msg;
  reelHelp.className = "urgency-"+urgency;
}
function onFishEscaped(){
  reelUI.style.display="none";
  showBanner("The fish shook free and got away!", 2200);
  endToIdle();
}

/* =========================================================================
   CATCH + REWARDS
   ========================================================================= */
function onFishCaught(){

  reelUI.style.display="none";
  const fish = RT.currentFish;
  const weight = RT.fishWeight;
  const rarityInfo = RARITY[fish.rarity];
  const rawValue = weight * fish.valuePerKg * rarityInfo.mult * state.run.valueMult;
  let value = balanceFishCoinValue(rawValue);

  const perfect = RT.perfectCatch;
  if(perfect) value *= 1.25;

  let treasureHit = false;
  if(!RT.isBoss && !RT.isSecret && !RT.isEventFish && Math.random() < state.run.treasureChance){
    treasureHit = true;
    value = value*1.6 + 5;
  }
  let doubled = false;
  if(Math.random() < state.run.doubleCatchChance){ doubled=true; value*=2; }
  value = Math.min(CONFIG.maxFishCoinValue, Math.max(1, Math.round(value)));

  // fish no longer pay out instantly - they go in the cooler until the player sells them
  const sizePrefix = (!RT.isBoss && !RT.isSecret && !RT.isEventFish) ? (fish.sizeTag||"") : "";
  const invItem = {
    uid: "f"+Date.now()+"_"+Math.floor(Math.random()*100000),
    fishId: fish.id, name: sizePrefix+fish.name, rarity: fish.rarity,
    weight, baseValue: value, economyVersion:CONFIG.economyVersion, caughtAt: Date.now()
  };
  state.inventory.push(invItem);
  const twinCatch=hasAnglerSecret("secret_twin_shot");
  if(twinCatch)state.inventory.push({...invItem,uid:"f"+Date.now()+"_twin",name:"Twin "+invItem.name});
  state.stats.totalCaught += twinCatch?2:1;
  challengeRunCaught += twinCatch?2:1;
  window.ChallengeManager?.update?.({score:challengeRunCaught,alive:true});
  PlatformManager.setHighScore(GAME_ID,state.stats.totalCaught);
  if(RT.isBoss) window.AchievementManager?.notify?.("angler_boss_caught",{facts:{angler_boss_caught:1,mastery_angler_answerer:1}});

  recordFishdex(fish, weight, value);
  if(twinCatch)recordFishdex(fish,weight,value);

  let xpGain = Math.round(weight*0.6 + rarityInfo.xp*3);
  if(perfect) xpGain = Math.round(xpGain*1.2);
  gainXP(xpGain);

  spawnSplashParticles(RT.bobber.targetX);

  const estPrice = getSellPrice(invItem);
  catchTitle.textContent = RT.isBoss ? "BOSS DEFEATED!" : (RT.isSecret ? "MYTHICAL CATCH!" : (RT.isEventFish ? (RT.event ? RT.event.name.toUpperCase()+" CATCH!" : "EVENT CATCH!") : "FISH CAUGHT!"));
  const dexCtx = catchFishCanvas.getContext("2d");
  drawFishSprite(dexCtx, fish, catchFishCanvas.width, catchFishCanvas.height, true);
  catchFishName.textContent = invItem.name + (doubled? "  (x2!)":"") + (treasureHit? "  💰 Treasure!":"");
  catchStats.textContent = `${weight.toFixed(1)} kg · ${rarityInfo.label}` + (perfect? "  ·  ★ PERFECT CATCH":"");
  catchStats.style.color = perfect ? "var(--bait)" : "";
  catchCoins.textContent = `🧊 Added ${hasAnglerSecret("secret_twin_shot")?"two catches":"to cooler"} · sells for ~${estPrice} coins each  ·  +${xpGain} xp`;
  catchPopup.style.display="flex";
  setTimeout(()=>{ catchPopup.style.display="none"; endToIdle(); }, 1500);

  refreshHUD();
  saveGame();
}
function recordFishdex(fish, weight, value){
  const entry = state.fishdex[fish.id] || { caughtCount:0, bestWeight:0, bestValue:0 };
  entry.caughtCount++;
  entry.bestWeight = Math.max(entry.bestWeight, weight);
  entry.bestValue = Math.max(entry.bestValue, value);
  state.fishdex[fish.id] = entry;
}

/* =========================================================================
   MARKET / COOLER ECONOMY
   Catching a fish no longer pays out coins directly - it goes into the cooler.
   The player chooses when to sell, and each species' price drifts on its own
   ambient cycle and dips whenever that species gets sold in bulk, recovering
   gradually afterwards. This rewards selling a varied catch over dumping one
   species all at once.
   ========================================================================= */
function getMarketDrift(fishId, nowMs){
  const phase = (hashStr(fishId)%1000)/1000 * Math.PI*2;
  const t = (nowMs/CONFIG.marketDriftPeriodMs)*Math.PI*2;
  return 1 + Math.sin(t+phase)*CONFIG.marketDriftAmplitude;
}
function balanceFishCoinValue(rawValue){
  const raw = Math.max(0,Number(rawValue)||0);
  return Math.min(CONFIG.maxFishCoinValue,Math.max(1,Math.round(CONFIG.coinCurveBase+CONFIG.coinCurveScale*Math.log2(1+raw))));
}
function balancedInventoryValue(item){
  const savedVersion=Number(item.economyVersion)||0,stored=Math.max(1,Number(item.baseValue)||1);
  if(savedVersion>=CONFIG.economyVersion)return Math.min(CONFIG.maxFishCoinValue,stored);
  // Version 2 was shipped before two further halvings. Convert those catches
  // to one quarter of their stored value; pre-versioned exponential values
  // still use the logarithmic curve.
  if(savedVersion===2)return Math.min(CONFIG.maxFishCoinValue,Math.max(1,Math.round(stored/4)));
  return balanceFishCoinValue(stored);
}
function getMarketSupplyMult(fishId){
  const rec = state.market[fishId];
  return rec ? rec.supplyMult : 1;
}
function getSellPrice(item){
  const drift = getMarketDrift(item.fishId, Date.now());
  const supply = getMarketSupplyMult(item.fishId);
  return Math.max(1, Math.round(balancedInventoryValue(item)*drift*supply));
}
function marketTrend(fishId){
  const combined = getMarketDrift(fishId, Date.now()) * getMarketSupplyMult(fishId);
  if(combined>1.06) return {symbol:"▲", cls:"trend-up"};
  if(combined<0.94) return {symbol:"▼", cls:"trend-down"};
  return {symbol:"►", cls:"trend-flat"};
}
function registerSale(fishId){
  const rec = state.market[fishId] || { supplyMult:1 };
  rec.supplyMult = Math.max(CONFIG.marketFloor, rec.supplyMult*CONFIG.marketDropPerSale);
  state.market[fishId] = rec;
}
function updateMarketRecovery(dt){
  const dtS = dt/1000;
  for(const fishId in state.market){
    const rec = state.market[fishId];
    rec.supplyMult += (1-rec.supplyMult)*CONFIG.marketRecoveryPerSec*dtS;
    if(rec.supplyMult>0.999) delete state.market[fishId]; // fully recovered - stop tracking
  }
}
function sellItem(uid){
  const idx = state.inventory.findIndex(i=>i.uid===uid);
  if(idx===-1) return;
  const item = state.inventory[idx];
  const price = getSellPrice(item);
  state.stats.totalCoinsEarned += price;
  PlatformManager.addCoins(price);
  registerSale(item.fishId);
  state.inventory.splice(idx,1);
  refreshHUD(); saveGame(); renderCooler();
  showBanner(`Sold ${item.name} for ${price} coins`, 1800);
}
function sellAllItems(){
  if(state.inventory.length===0) return;
  let total = 0;
  // sell oldest-first so repeated species show their diminishing price live
  const items = [...state.inventory].sort((a,b)=>a.caughtAt-b.caughtAt);
  items.forEach((item,index)=>{
    const bulkMult = Math.max(CONFIG.bulkSaleFloor,Math.pow(CONFIG.bulkSaleDropPerFish,index));
    const price = Math.max(1,Math.round(getSellPrice(item)*bulkMult));
    total += price;
    state.stats.totalCoinsEarned += price;
    registerSale(item.fishId);
  });
  PlatformManager.addCoins(total);
  state.inventory = [];
  refreshHUD(); saveGame(); renderCooler();
  showBanner(`Sold the whole cooler for ${total} coins!`, 2200);
}

/* =========================================================================
   XP / LEVEL UP / UPGRADES
   ========================================================================= */
function gainXP(amount){
  if(hasAnglerSecret("secret_glitch_aura"))amount*=2;
  state.xp += amount;
  const need = xpForLevel(state.level);
  if(state.xp >= need){
    state.xp -= need;
    state.level++;
    const justUnlocked = Object.values(ZONES).find(z=>z.unlockLevel===state.level);
    if(justUnlocked) showBanner(`🔓 ${justUnlocked.name} unlocked!`, 3000);
    openLevelUp();
  }
  refreshHUD();
}
function openLevelUp(){
  RT.paused = true;
  const cards = [];
  while(cards.length<3){
    const u = pick(UPGRADE_POOL);
    cards.push(u);
  }
  const wrap = $("upgradeCards");
  wrap.innerHTML="";
  cards.forEach(u=>{
    const div = document.createElement("div");
    div.className="upgradeCard";
    div.innerHTML = `<div class="u-name">${u.name}</div><div class="u-desc">${u.desc}</div>`;
    div.onclick = ()=>{
      u.apply(state.run);
      state.run.chosen.push(u.id);
      $("modalUpgrade").classList.remove("show");
      RT.paused=false;
      showBanner(u.name+" acquired!");
    };
    wrap.appendChild(div);
  });
  $("modalUpgrade").classList.add("show");
}

/* =========================================================================
   RANDOM EVENTS
   ========================================================================= */
const EVENTS = [
  { id:"feeding", name:"Feeding Frenzy", desc:"Rare fish chance increased!", duration:14000 },
  { id:"calm",    name:"Calm Waters",    desc:"Fish struggle less.",         duration:16000 },
  { id:"storm",   name:"Storm",          desc:"Fish are harder to catch, worth more! Thunder Eels are drawn out.", duration:14000,
    exclusiveFish: { id:"thundereel", name:"Thunder Eel", rarity:"rare", zone:"event", minKg:3, maxKg:12, valuePerKg:15, strength:6, speed:8, behavior:"burst", shape:"long", color:"#3a4a8a", belly:"#a9c2ff", fin:"#1f2a5c", pattern:"none", patternColor:"#000", features:["electric"] } },
  { id:"golden",  name:"Golden Waters",  desc:"Coin rewards increased!",     duration:16000 },
  { id:"monster", name:"Monster Fish",   desc:"Something huge is circling…", duration:9000 },
  { id:"fog",     name:"Fog",            desc:"Bites are harder to time, but fish grow careless.", duration:14000, rare:true },
  { id:"bloodmoon", name:"Blood Moon",   desc:"A crimson tide rises. Crimson Reapers stir in the deep.", duration:18000, rare:true,
    exclusiveFish: { id:"crimsonreaper", name:"Crimson Reaper", rarity:"bloodmoon", zone:"event", minKg:8, maxKg:30, valuePerKg:30, strength:9, speed:8, behavior:"chaotic", shape:"spike", color:"#8a0f22", belly:"#ff6b7a", fin:"#4a0812", pattern:"stripes", patternColor:"#ff4d5e", features:["teeth","scars"] } },
  { id:"meteor",  name:"Meteor Shower",  desc:"Starfall Koi rise to feed on the falling light.", duration:16000, rare:true,
    exclusiveFish: { id:"starfallkoi", name:"Starfall Koi", rarity:"meteor", zone:"event", minKg:2, maxKg:8, valuePerKg:28, strength:5, speed:6, behavior:"escalating", shape:"long", color:"#fff3c2", belly:"#ffffff", fin:"#ffd166", pattern:"spots", patternColor:"#ffe9a8", features:["sparkle"] } },
];
function scheduleNextEvent(){
  RT.nextEventAt = performance.now() + rand(40000,80000);
}
function maybeTriggerEvent(){
  if(RT.event) return;
  if(performance.now() < RT.nextEventAt) return;
  // rare, more dramatic events (Blood Moon, Meteor Shower, Fog) show up less often
  const weights = EVENTS.map(e=> e.rare ? 1 : 4);
  const ev = Object.assign({}, weightedPick(EVENTS, weights));
  ev.endsAt = performance.now()+ev.duration;
  RT.event = ev;
  const icon = ev.id==="bloodmoon" ? "🌙" : ev.id==="meteor" ? "☄" : ev.id==="fog" ? "🌫" : "✨";
  showBanner(`${icon} ${ev.name}: ${ev.desc}`, 3400);
  if(ev.id==="golden") state.run.valueMult += 0.4;
}
function updateEvent(){
  if(RT.event && performance.now()>RT.event.endsAt){
    if(RT.event.id==="golden") state.run.valueMult -= 0.4;
    RT.event=null;
    scheduleNextEvent();
  }
}

/* =========================================================================
   RUN / IDLE FLOW
   ========================================================================= */
function endToIdle(){
  RT.phase="idle";
  RT.bobber.flying=false;
  mainActionBtn.textContent="CAST LINE";
  hintText.textContent="Hold to charge your cast, release to throw";
  refreshHUD();
  if(state.bait<=0){ onOutOfBait(); }
}
function onOutOfBait(){
  if($("modalRunEnd").classList.contains("show")) return;
  const coolerValue = state.inventory.reduce((sum,item)=>sum+getSellPrice(item),0);
  $("runSummaryBody").innerHTML = `
    Fish caught this trip pool: <b>${state.stats.totalCaught}</b> lifetime<br>
    Shared coins: <b>${Math.floor(PlatformManager.getCoins())}</b><br>
    🧊 Cooler: <b>${state.inventory.length}</b> fish worth ~<b>${coolerValue}</b> coins<br>
    Current level: <b>${state.level}</b>
  `;
  $("modalRunEnd").classList.add("show");
  RT.paused = true;
  PlatformManager.endSession(GAME_ID);
  window.ChallengeManager?.finish?.({score:challengeRunCaught,alive:false});
  platformSessionStarted=false;
  window.AchievementManager?.notify?.("run_completed");
}
function returnRunHome(){
  state.bait = CONFIG.startBait;
  state.run = freshRunUpgrades();
  $("modalRunEnd").classList.remove("show");
  RT.paused=true;gameStarted=false;RT.phase="idle";castReady=false;
  $("homeScreen").classList.add("show");startHomeFishAnim();refreshHUD();
}

/* =========================================================================
   SHOP
   ========================================================================= */
function permCost(def){
  const lvl = state.perm[def.id];
  return Math.round(def.baseCost * Math.pow(def.costMult, lvl));
}
function renderShop(){
  const grid = $("shopGrid");
  grid.innerHTML="";
  permUpgradeDefs().forEach(def=>{
    const lvl = state.perm[def.id];
    const maxed = lvl>=def.max;
    const cost = permCost(def);
    const row = document.createElement("div");
    row.className="shopItem";
    row.innerHTML = `
      <div>
        <div class="s-name">${def.name} <span style="color:var(--dim)">Lv.${lvl}${maxed?" (MAX)":""}</span></div>
        <div class="s-desc">${def.desc}</div>
      </div>
      <button class="shopBtn" ${maxed || PlatformManager.getCoins()<cost ? "disabled":""}>${maxed?"MAXED":("BUY · "+cost)}</button>
    `;
    row.querySelector("button").onclick = ()=>{
      if(maxed || !PlatformManager.spendCoins(cost)) return;
      state.perm[def.id]++;
      window.AchievementManager?.notify?.("upgrade_purchased");
      if(def.id==="bag") showBanner("Bait bag capacity increased for next trip!");
      refreshHUD(); saveGame(); renderShop();
    };
    grid.appendChild(row);
  });
}

/* =========================================================================
   ZONES
   ========================================================================= */
function renderZones(){
  const grid = $("zoneGrid");
  grid.innerHTML="";
  Object.values(ZONES).sort((a,b)=>a.order-b.order).forEach(z=>{
    const unlocked = isZoneUnlocked(z.id);
    const row = document.createElement("div");
    row.className="zoneItem";
    row.innerHTML = `
      <div>
        <div class="s-name">${z.name} <span style="color:var(--dim)">(${RARITY[z.tier].label} tier)</span></div>
        <div class="s-desc">${unlocked? "Unlocked" : ("Reach level "+z.unlockLevel+" to unlock")}</div>
      </div>
      <button class="zoneBtn ${state.zone===z.id?"active":""}" ${unlocked?"":"disabled"}>${state.zone===z.id?"HERE":(unlocked?"TRAVEL":"LOCKED")}</button>
    `;
    const btn = row.querySelector("button");
    if(state.zone===z.id) btn.disabled=true;
    if(unlocked && state.zone!==z.id){
      btn.onclick = ()=>{
        state.zone=z.id;
        RT.castsInZone=0;
        refreshHUD(); saveGame();
        $("modalZones").classList.remove("show");
        showBanner("Travelled to "+z.name);
      };
    }
    grid.appendChild(row);
  });
}

/* =========================================================================
   FISHDEX
   ========================================================================= */
function allFishForDex(){
  const eventFish = EVENTS.filter(e=>e.exclusiveFish).map(e=>e.exclusiveFish);
  return FISH_DB.concat(Object.values(BOSS_DB)).concat(SECRET_FISH_DB).concat(eventFish);
}
function renderFishdex(){
  const grid = $("fishdexGrid");
  grid.innerHTML="";
  const all = allFishForDex();
  let known=0;
  all.forEach(f=>{
    const entry = state.fishdex[f.id];
    const div = document.createElement("div");
    div.className = "dexEntry"+(entry?" known":"");
    if(entry) known++;
    const cnv = document.createElement("canvas");
    cnv.width=48; cnv.height=32;
    div.appendChild(cnv);
    const nameDiv = document.createElement("div");
    nameDiv.className="dex-name";
    nameDiv.textContent = entry? f.name : "???";
    div.appendChild(nameDiv);
    const rarityDiv = document.createElement("div");
    rarityDiv.className="rarity-tag";
    rarityDiv.style.color = RARITY[f.rarity].color;
    rarityDiv.textContent = entry ? RARITY[f.rarity].label : "";
    div.appendChild(rarityDiv);
    if(entry){
      const stat = document.createElement("div");
      stat.style.marginTop="3px";
      stat.innerHTML = `Caught: ${entry.caughtCount}<br>Best: ${entry.bestWeight.toFixed(1)}kg<br>Top: ${entry.bestValue}c`;
      div.appendChild(stat);
      drawFishSprite(cnv.getContext("2d"), f, 48, 32, entry ? true:false);
    } else {
      const g = cnv.getContext("2d");
      g.fillStyle="#1c2c46"; g.fillRect(0,0,48,32);
      g.fillStyle="#3a4a6a"; g.font="18px monospace"; g.textAlign="center";
      g.fillText("?", 24, 22);
    }
    grid.appendChild(div);
  });
  $("dexProgress").textContent = `${known} / ${all.length} discovered`;
}
function findFishDef(fishId){
  return allFishForDex().find(f=>f.id===fishId);
}

/* =========================================================================
   HOME SCREEN — discovered-fish swimmers
   Only species the player has actually caught (i.e. exist in the Fishdex)
   drift past on the title screen, so the background fills in as they play.
   Each fish swims a free 2D path with a bit of organic wander, exits fully
   off-screen in whatever direction it was heading, then re-enters from a
   random edge on a fresh random heading - so paths never feel like a fixed
   left-right loop.
   ========================================================================= */
let homeFishAnimId = null;
let homeFishLastT = null;
let homeFishList = [];
function initHomeFishSwimmers(){
  const knownIds = Object.keys(state.fishdex);
  let pool = knownIds.map(id=>findFishDef(id)).filter(Boolean);
  if(pool.length>10){
    // cap how many swim at once so it stays readable rather than cluttered
    pool = [...pool].sort(()=>Math.random()-0.5).slice(0,10);
  }
  homeFishList = pool.map(def=>{
    const f = { def, scale: rand(0.85,1.3), bob: rand(0,Math.PI*2), dir:1 };
    // start already somewhere on screen, heading in a random direction
    const angle = rand(0,Math.PI*2);
    const speed = rand(0.05,0.13);
    f.x = rand(0.1,0.9); f.y = rand(0.12,0.88);
    f.vx = Math.cos(angle)*speed; f.vy = Math.sin(angle)*speed*0.6;
    return f;
  });
}
function respawnHomeFishAtEdge(f){
  // re-enter from a random screen edge on a fresh heading that's guaranteed
  // to actually carry it back across the screen rather than out immediately
  const edge = Math.floor(rand(0,4)); // 0=left 1=right 2=top 3=bottom
  const speed = rand(0.05,0.14);
  let angle;
  if(edge===0){ f.x=-0.14; f.y=rand(0.08,0.92); angle=rand(-0.5,0.5); }
  else if(edge===1){ f.x=1.14; f.y=rand(0.08,0.92); angle=Math.PI+rand(-0.5,0.5); }
  else if(edge===2){ f.x=rand(0.08,0.92); f.y=-0.14; angle=Math.PI/2+rand(-0.5,0.5); }
  else { f.x=rand(0.08,0.92); f.y=1.14; angle=-Math.PI/2+rand(-0.5,0.5); }
  f.vx = Math.cos(angle)*speed;
  f.vy = Math.sin(angle)*speed*0.6;
}
function renderHomeFish(now){
  const dt = homeFishLastT ? Math.min(50, now-homeFishLastT) : 16;
  homeFishLastT = now;
  const cnv = $("homeFishCanvas");
  const g = cnv.getContext("2d");
  const w = cnv.width, h = cnv.height;
  g.clearRect(0,0,w,h);
  homeFishList.forEach(f=>{
    // gentle organic wander: nudge the heading angle a little each frame
    const speed = Math.hypot(f.vx,f.vy);
    const angle = Math.atan2(f.vy,f.vx) + (Math.random()-0.5)*0.05;
    f.vx = Math.cos(angle)*speed;
    f.vy = Math.sin(angle)*speed;

    f.x += f.vx*dt*0.001;
    f.y += f.vy*dt*0.001;
    f.dir = f.vx>=0 ? 1 : -1;

    // fully exits the screen before re-entering from a random edge
    if(f.x<-0.16 || f.x>1.16 || f.y<-0.16 || f.y>1.16){
      respawnHomeFishAtEdge(f);
    }

    const px = f.x*w;
    const py = f.y*h + Math.sin(now*0.0012+f.bob)*6;
    g.save();
    g.globalAlpha=0.85;
    g.translate(px,py);
    const baseScale = Math.min(w,h)/230 * f.scale;
    g.scale(baseScale*f.dir, baseScale);
    drawFishFull(g, f.def, now*0.0025+f.bob);
    g.restore();
  });
  homeFishAnimId = requestAnimationFrame(renderHomeFish);
}
function startHomeFishAnim(){
  resizeHomeFishCanvas();
  initHomeFishSwimmers();
  homeFishLastT = null;
  if(homeFishAnimId) cancelAnimationFrame(homeFishAnimId);
  if(homeFishList.length>0){
    homeFishAnimId = requestAnimationFrame(renderHomeFish);
  } else {
    $("homeFishCanvas").getContext("2d").clearRect(0,0,9999,9999);
  }
}
function stopHomeFishAnim(){
  if(homeFishAnimId){ cancelAnimationFrame(homeFishAnimId); homeFishAnimId=null; }
}
function renderCooler(){
  const grid = $("coolerGrid");
  grid.innerHTML="";
  if(state.inventory.length===0){
    grid.innerHTML = `<div id="coolerEmpty">Your cooler is empty. Go catch something!</div>`;
    $("coolerTotalText").textContent = "0 fish · worth ~0 coins";
    $("btnSellAll").disabled = true;
    return;
  }
  $("btnSellAll").disabled = false;
  let total = 0;
  const items = [...state.inventory].sort((a,b)=>b.caughtAt-a.caughtAt);
  items.forEach(item=>{
    const price = getSellPrice(item);
    total += price;
    const def = findFishDef(item.fishId) || { shape:"round", color:"#888" };
    const trend = marketTrend(item.fishId);
    const row = document.createElement("div");
    row.className="coolerItem";
    const cnv = document.createElement("canvas");
    cnv.width=40; cnv.height=32;
    row.appendChild(cnv);
    const info = document.createElement("div");
    info.className="ci-info";
    info.innerHTML = `
      <div class="ci-name" style="color:${RARITY[item.rarity].color}">${item.name}</div>
      <div class="ci-meta">${item.weight.toFixed(1)}kg · ${RARITY[item.rarity].label} · <span class="${trend.cls}">${trend.symbol}</span></div>
    `;
    row.appendChild(info);
    const priceDiv = document.createElement("div");
    priceDiv.className="ci-price";
    priceDiv.textContent = price+"c";
    row.appendChild(priceDiv);
    const sellBtn = document.createElement("button");
    sellBtn.className="sellBtn";
    sellBtn.textContent="SELL";
    sellBtn.onclick=()=>sellItem(item.uid);
    row.appendChild(sellBtn);
    grid.appendChild(row);
    drawFishSprite(cnv.getContext("2d"), def, 40, 32, true);
  });
  $("coolerTotalText").textContent = `${state.inventory.length} fish · worth ~${total} coins`;
}

/* =========================================================================
   PIXEL FISH SPRITE DRAWING (procedural, no external images)
   Every species gets: gradient-shaded body, body-shape-specific fins/tail,
   an optional pattern overlay (stripes/spots/gradient-belly), an eye+gill,
   and optional "feature" flourishes (bill, sail, teeth, whiskers, tentacles,
   crown, glow-lure, scars) so silhouettes read distinctly at a glance.
   ========================================================================= */
function shadeColor(hex, amt){
  const c = hex.replace('#','');
  const n = c.length===3 ? c.split('').map(ch=>ch+ch).join('') : c;
  const num = parseInt(n,16);
  let r=(num>>16)&255, g=(num>>8)&255, b=num&255;
  r = clamp(Math.round(r+amt),0,255); g = clamp(Math.round(g+amt),0,255); b = clamp(Math.round(b+amt),0,255);
  return `rgb(${r},${g},${b})`;
}
function drawFishSprite(g, fish, w, h, silhouette){
  g.save();
  g.clearRect(0,0,w,h);
  g.fillStyle = "#0e1a2c";
  g.fillRect(0,0,w,h);
  const cx=w/2, cy=h/2;
  const baseScale = Math.min(w,h)/38;
  const scale = baseScale * (silhouette && fish.sizeScale ? fish.sizeScale : 1);
  g.translate(cx,cy);
  g.scale(scale,scale);
  if(silhouette){
    drawFishFull(g, fish, 1);
  } else {
    g.fillStyle="#1a2740";
    drawFishShape(g, fish.shape||"round");
  }
  g.restore();
}

// Full detailed render used in fishdex thumbnails, the reeling minigame, and boss reveals.
function drawFishFull(g, fish, animT){
  animT = animT||0;
  const rarityGlow = RARITY[fish.rarity] ? RARITY[fish.rarity].color : null;
  const feats = fish.features || [];
  const glowRarities = ["legendary","boss","epic","mythic","bloodmoon","meteor"];

  // glow aura for epic/legendary/mythic/boss/event-exclusive fish
  if(glowRarities.includes(fish.rarity)){
    g.save();
    g.shadowColor = rarityGlow; g.shadowBlur = (fish.rarity==="boss"||fish.rarity==="mythic"||fish.rarity==="bloodmoon")?16:10;
    g.globalAlpha=0.55;
    g.fillStyle=rarityGlow;
    g.beginPath(); g.ellipse(0,0,20,10,0,0,Math.PI*2); g.fill();
    g.restore();
  }

  // special fish (pixelfish / cerebus fish / chrono carp) bypass the standard
  // shape-based body pipeline entirely and draw their own custom silhouette.
  if(fish.special){
    drawSpecialFish(g, fish, animT);
    return;
  }

  // bioluminescent lure (anglerfish-style boss)
  if(feats.includes("lure")){
    const bob = Math.sin(animT*4)*1.5;
    g.strokeStyle = shadeColor(fish.color,-40); g.lineWidth=1;
    g.beginPath(); g.moveTo(10,-8); g.quadraticCurveTo(16,-16,14,-20+bob); g.stroke();
    g.save(); g.shadowColor="#bfffea"; g.shadowBlur=8;
    g.fillStyle="#bfffea"; g.beginPath(); g.arc(14,-20+bob,2.2,0,Math.PI*2); g.fill();
    g.restore();
  }

  // pectoral fin (behind body) - gentle flutter
  const finFlap = Math.sin(animT*5)*3;
  g.save();
  g.translate(-1,3);
  g.rotate(finFlap*0.02);
  g.fillStyle = fish.fin || shadeColor(fish.color,-40);
  g.beginPath(); g.moveTo(0,0); g.lineTo(-5,8); g.lineTo(3,3); g.closePath(); g.fill();
  g.restore();

  // tail (wags side to side as the fish swims/fights)
  const {rx:pivotRx} = bodyRadii(fish.shape);
  const wag = Math.sin(animT*6) * 0.22;
  g.save();
  g.translate(-pivotRx+2, 0);
  g.rotate(wag);
  g.translate(pivotRx-2, 0);
  drawTail(g, fish);
  g.restore();

  // body (gradient shaded, shape dependent)
  drawBodyWithShading(g, fish);

  // scale texture (subtle overlapping arcs)
  drawScaleTexture(g, fish);

  // specular highlight + soft rim light for a glossy, more "alive" look
  drawHighlight(g, fish);
  drawRimLight(g, fish);

  // dorsal fin on top
  drawDorsal(g, fish);

  // pattern overlay
  drawPattern(g, fish);

  // lateral line - the faint horizontal stripe running nose-to-tail on real fish
  drawLateralLine(g, fish);

  // feature flourishes
  if(feats.includes("bill")) drawBill(g, fish);
  if(feats.includes("sail")) drawSail(g, fish);
  if(feats.includes("teeth")) drawTeeth(g, fish);
  if(feats.includes("whiskers")) drawWhiskers(g, fish);
  if(feats.includes("tentacles")) drawTentacles(g, fish, animT);
  if(feats.includes("crown")) drawCrown(g, fish);
  if(feats.includes("spinyfin")) drawSpinyDorsal(g, fish);
  if(feats.includes("finlets")) drawFinlets(g, fish);
  if(feats.includes("scars")) drawScars(g, fish);
  if(feats.includes("hammerhead")) drawHammerhead(g, fish);
  if(feats.includes("wings")) drawWings(g, fish);
  if(feats.includes("electric")) drawElectric(g, fish, animT);
  if(feats.includes("ridgehead")) drawRidgehead(g, fish);
  if(feats.includes("lobefins")) drawLobefins(g, fish);
  if(feats.includes("sparkle")) drawSparkle(g, fish, animT);

  // gill line (now drawn as two short slits for extra definition)
  g.strokeStyle = shadeColor(fish.color,-55);
  g.lineWidth=0.8;
  g.beginPath(); g.moveTo(6,-4); g.quadraticCurveTo(4,0,6,5); g.stroke();
  g.beginPath(); g.moveTo(8,-3.2); g.quadraticCurveTo(6.4,0,8,4.2); g.stroke();

  // mouth
  drawMouth(g, fish);

  // eye
  g.fillStyle="#111";
  g.beginPath(); g.arc(7,-1.5,1.7,0,Math.PI*2); g.fill();
  g.fillStyle="rgba(255,255,255,0.9)";
  g.beginPath(); g.arc(7.5,-2,0.7,0,Math.PI*2); g.fill();
}

/* ---- Special/mythic fish: fully custom silhouettes ---- */
function drawSpecialFish(g, fish, animT){
  if(fish.special==="pixel") drawPixelfish(g, fish, animT);
  else if(fish.special==="cerberus") drawCerberusFish(g, fish, animT);
  else if(fish.special==="chrono") drawChronoCarp(g, fish, animT);
}
function drawPixelfish(g, fish, animT){
  const seed = fish._seed || hashStr(fish.id);
  const rnd = seededRand(seed+1);
  const cols=11, rows=8, cell=2.25;
  const startX = -cols*cell/2, startY = -rows*cell/2;
  const palette = ["#ff6b6b","#ffd166","#7cd992","#5ad1e6","#8a7ee6","#ff8a5c","#ffffff","#ff6bd6"];
  const cells=[];
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const nx=(c-(cols-1)/2)/((cols-1)/2), ny=(r-(rows-1)/2)/((rows-1)/2);
      if(nx*nx+ny*ny>1.05) continue; // clip to an oval "fish" silhouette
      cells.push({c,r,base:palette[Math.floor(rnd()*palette.length)]});
    }
  }
  cells.forEach((cell_,i)=>{
    // occasional glitchy colour flicker so it visibly reads as "made of pixels"
    const flick = Math.floor(animT*3+i) % 11 === 0;
    g.fillStyle = flick ? palette[(i+Math.floor(animT))%palette.length] : cell_.base;
    g.fillRect(startX+cell_.c*cell, startY+cell_.r*cell, cell-0.4, cell-0.4);
    // faint pixel bevel for a chunkier, more tactile block look
    g.fillStyle="rgba(0,0,0,0.12)";
    g.fillRect(startX+cell_.c*cell, startY+cell_.r*cell+cell-0.9, cell-0.4, 0.5);
  });
  // blocky pixel tail
  g.fillStyle = palette[3];
  g.fillRect(startX-cell*2.4, -cell*1.6, cell*2, cell*1.2);
  g.fillRect(startX-cell*2.4, cell*0.4, cell*2, cell*1.2);
  // single-pixel eye
  g.fillStyle="#111";
  g.fillRect(startX+cols*cell-cell*1.8, startY+rows*cell*0.26, cell*0.9, cell*0.9);
}
function drawCerberusFish(g, fish, animT){
  const bodyFish = Object.assign({}, fish, {shape:"round"});
  drawTail(g, bodyFish);
  drawBodyWithShading(g, bodyFish);
  drawScaleTexture(g, bodyFish);
  drawHighlight(g, bodyFish);
  drawRimLight(g, bodyFish);
  drawDorsal(g, bodyFish);
  drawLateralLine(g, bodyFish);
  // three necks + heads fanning from the front of the body, each snapping independently
  const angles = [-0.55, 0, 0.55];
  angles.forEach((ang,i)=>{
    const wig = Math.sin(animT*4 + i*2) * 0.10;
    const snap = (Math.sin(animT*6 + i*3) + 1)/2;
    g.save();
    g.translate(8,0);
    g.rotate(ang+wig);
    g.strokeStyle = fish.fin || shadeColor(fish.color,-30);
    g.lineWidth=3;
    g.beginPath(); g.moveTo(0,0); g.lineTo(8,0); g.stroke();
    g.translate(8,0);
    g.fillStyle = fish.color;
    g.beginPath(); g.ellipse(2,0,4,3,0,0,Math.PI*2); g.fill();
    g.strokeStyle=shadeColor(fish.color,-45); g.lineWidth=0.4;
    g.beginPath(); g.arc(2,0,3,0,Math.PI*2); g.stroke();
    // jaw that opens/closes
    g.fillStyle="#f5f5f5";
    g.save();
    g.translate(5,1.4);
    g.rotate(snap*0.4);
    g.beginPath(); g.moveTo(0,0); g.lineTo(2.4,0.6); g.lineTo(0,1.2); g.closePath(); g.fill();
    g.restore();
    // eye
    g.fillStyle="#111"; g.beginPath(); g.arc(3,-1.3,0.9,0,Math.PI*2); g.fill();
    g.fillStyle="rgba(255,255,255,0.85)"; g.beginPath(); g.arc(3.3,-1.6,0.35,0,Math.PI*2); g.fill();
    g.restore();
  });
}
function drawChronoCarp(g, fish, animT){
  const trails=3;
  for(let t=trails;t>=1;t--){
    g.save();
    g.globalAlpha = 0.16*(trails-t+1);
    g.translate(-t*4.5, Math.sin(animT+t)*1.5);
    const fadedFish = Object.assign({}, fish, {shape:"long"});
    drawTail(g, fadedFish);
    drawBodyWithShading(g, fadedFish);
    g.restore();
  }
  drawTail(g, Object.assign({}, fish, {shape:"long"}));
  drawBodyWithShading(g, Object.assign({}, fish, {shape:"long"}));
  drawScaleTexture(g, Object.assign({}, fish, {shape:"long"}));
  drawHighlight(g, Object.assign({}, fish, {shape:"long"}));
  drawDorsal(g, Object.assign({}, fish, {shape:"long"}));
  drawLateralLine(g, Object.assign({}, fish, {shape:"long"}));
  // small clock-face motif on its flank
  g.save();
  g.globalAlpha=0.85;
  g.strokeStyle="#eaf2ff"; g.lineWidth=0.7;
  g.beginPath(); g.arc(1,0,3.6,0,Math.PI*2); g.stroke();
  const handAngle = animT*2;
  g.beginPath(); g.moveTo(1,0); g.lineTo(1+Math.cos(handAngle)*2.6, Math.sin(handAngle)*2.6); g.stroke();
  g.beginPath(); g.moveTo(1,0); g.lineTo(1+Math.cos(handAngle*0.4)*1.6, Math.sin(handAngle*0.4)*1.6); g.stroke();
  // small tick marks around the clock face
  for(let tk=0;tk<12;tk++){
    const a=tk*(Math.PI*2/12);
    g.beginPath();
    g.moveTo(1+Math.cos(a)*3.2, Math.sin(a)*3.2);
    g.lineTo(1+Math.cos(a)*3.6, Math.sin(a)*3.6);
    g.stroke();
  }
  g.restore();
  drawMouth(g, fish);
  // eye
  g.fillStyle="#111"; g.beginPath(); g.arc(7,-1.5,1.5,0,Math.PI*2); g.fill();
  g.fillStyle="rgba(255,255,255,0.9)"; g.beginPath(); g.arc(7.5,-2,0.6,0,Math.PI*2); g.fill();
}

function bodyRadii(shape){
  switch(shape){
    case "long":   return {rx:15, ry:5};
    case "torpedo":return {rx:14, ry:6.5};
    case "spike":  return {rx:15, ry:6};
    case "squid":  return {rx:11, ry:9};
    default:       return {rx:13, ry:7.5}; // round
  }
}
function drawBodyWithShading(g, fish){
  const {rx,ry} = bodyRadii(fish.shape);
  const grad = g.createLinearGradient(0,-ry,0,ry);
  grad.addColorStop(0, shadeColor(fish.color,28));
  grad.addColorStop(0.55, fish.color);
  grad.addColorStop(1, fish.belly || shadeColor(fish.color,60));
  g.fillStyle = grad;
  g.beginPath();
  if(fish.shape==="spike"){
    g.moveTo(rx+1,0);
    g.quadraticCurveTo(rx-6,-ry, -rx*0.4,-ry*0.7);
    g.quadraticCurveTo(-rx-2,-ry*0.35, -rx-2,0);
    g.quadraticCurveTo(-rx-2,ry*0.35, -rx*0.4,ry*0.7);
    g.quadraticCurveTo(rx-6,ry, rx+1,0);
  } else {
    g.ellipse(0,0,rx,ry,0,0,Math.PI*2);
  }
  g.closePath();
  g.fill();
  g.strokeStyle=shadeColor(fish.color,-45);
  g.lineWidth=0.7;
  g.stroke();
}
function drawTail(g, fish){
  const {rx,ry} = bodyRadii(fish.shape);
  g.fillStyle = fish.fin || shadeColor(fish.color,-30);
  g.beginPath();
  if(fish.shape==="long" || fish.shape==="spike"){
    // forked tail
    g.moveTo(-rx+2,0);
    g.lineTo(-rx-9,-ry-2);
    g.lineTo(-rx-3,0);
    g.lineTo(-rx-9,ry+2);
    g.closePath();
  } else if(fish.shape==="squid"){
    return; // squid uses tentacles instead of a tail fin
  } else {
    g.moveTo(-rx+2,0);
    g.lineTo(-rx-8,-ry-3);
    g.lineTo(-rx-8,ry+3);
    g.closePath();
  }
  g.fill();
  // fin rays - thin darker lines fanning through the tail for extra definition
  g.save();
  g.beginPath();
  g.rect(-rx-14, -ry-4, 16, ry*2+8);
  g.clip();
  g.strokeStyle = shadeColor(fish.color,-55);
  g.lineWidth=0.5;
  g.globalAlpha=0.55;
  for(let i=-2;i<=2;i++){
    g.beginPath();
    g.moveTo(-rx+1, i*1.6);
    g.lineTo(-rx-9, i*(ry/2.2));
    g.stroke();
  }
  g.restore();
}
function drawDorsal(g, fish){
  const {rx,ry} = bodyRadii(fish.shape);
  if(fish.shape==="squid") return;
  g.fillStyle = shadeColor(fish.fin||fish.color, -10);
  g.beginPath();
  g.moveTo(-2,-ry+1);
  g.lineTo(2,-ry-6);
  g.lineTo(6,-ry+1);
  g.closePath();
  g.fill();
  // fin rays
  g.strokeStyle = shadeColor(fish.color,-45);
  g.lineWidth=0.5;
  g.globalAlpha=0.6;
  g.beginPath(); g.moveTo(1,-ry); g.lineTo(2,-ry-5.5); g.stroke();
  g.beginPath(); g.moveTo(4,-ry); g.lineTo(3.4,-ry-3.5); g.stroke();
  g.globalAlpha=1;
}
function drawSpinyDorsal(g, fish){
  const {ry} = bodyRadii(fish.shape);
  g.strokeStyle = fish.fin || shadeColor(fish.color,-30);
  g.lineWidth=1;
  for(let i=0;i<4;i++){
    const x=-3+i*2.6;
    g.beginPath(); g.moveTo(x,-ry+1); g.lineTo(x,-ry-5); g.stroke();
  }
}
function drawFinlets(g, fish){
  const {rx,ry} = bodyRadii(fish.shape);
  g.fillStyle = shadeColor(fish.color,-20);
  for(let i=0;i<5;i++){
    const x = -rx*0.6+i*3.2;
    g.beginPath(); g.moveTo(x,ry-1); g.lineTo(x+1.4,ry+3); g.lineTo(x+2.6,ry-1); g.closePath(); g.fill();
  }
}
function drawPattern(g, fish){
  const {rx,ry} = bodyRadii(fish.shape);
  g.save();
  g.beginPath();
  if(fish.shape==="spike"){ g.ellipse(0,0,rx*0.75,ry*0.85,0,0,Math.PI*2); } else { g.ellipse(0,0,rx*0.85,ry*0.85,0,0,Math.PI*2); }
  g.clip();
  if(fish.pattern==="stripes"){
    g.strokeStyle = fish.patternColor; g.lineWidth=1.3;
    for(let i=-1;i<=1;i++){
      const x = i*rx*0.55;
      g.beginPath(); g.moveTo(x,-ry); g.lineTo(x-2,ry); g.stroke();
    }
    g.beginPath(); g.moveTo(rx*0.9,-ry); g.lineTo(rx*0.5,ry); g.stroke();
    g.beginPath(); g.moveTo(-rx*0.9,-ry); g.lineTo(-rx*1.3,ry); g.stroke();
  } else if(fish.pattern==="spots"){
    g.fillStyle = fish.patternColor;
    const spots = [[-4,-2],[2,2],[6,-1],[-1,3],[-7,1],[4,-3]];
    spots.forEach(([sx,sy])=>{ g.beginPath(); g.arc(sx,sy,1.1,0,Math.PI*2); g.fill(); });
  } else if(fish.pattern==="gradient"){
    const grad = g.createLinearGradient(-rx,0,rx,0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, fish.patternColor);
    g.globalAlpha=0.45;
    g.fillStyle=grad;
    g.fillRect(-rx,-ry,rx*2,ry*2);
  }
  g.restore();
}
function drawBill(g, fish){
  const {rx} = bodyRadii(fish.shape);
  g.strokeStyle = shadeColor(fish.color,-20);
  g.lineWidth=2;
  g.beginPath(); g.moveTo(rx-2,-1); g.lineTo(rx+9,-2); g.stroke();
}
function drawSail(g, fish){
  const {ry} = bodyRadii(fish.shape);
  g.fillStyle = shadeColor(fish.fin||fish.color,10);
  g.globalAlpha=0.85;
  g.beginPath();
  g.moveTo(-6,-ry+1);
  g.quadraticCurveTo(-2,-ry-10, 4,-ry-6);
  g.quadraticCurveTo(1,-ry+2, -6,-ry+1);
  g.closePath();
  g.fill();
  g.globalAlpha=1;
}
function drawTeeth(g, fish){
  const {rx} = bodyRadii(fish.shape);
  g.fillStyle="#f5f5f5";
  for(let i=0;i<3;i++){
    g.beginPath(); g.moveTo(rx-3+i*1.6,1.5); g.lineTo(rx-2.3+i*1.6,3.5); g.lineTo(rx-1.6+i*1.6,1.5); g.closePath(); g.fill();
  }
}
function drawWhiskers(g, fish){
  g.strokeStyle = shadeColor(fish.color,-40);
  g.lineWidth=0.9;
  g.beginPath(); g.moveTo(11,1); g.quadraticCurveTo(17,3,20,6); g.stroke();
  g.beginPath(); g.moveTo(11,-1); g.quadraticCurveTo(17,-4,20,-7); g.stroke();
}
function drawTentacles(g, fish, animT){
  const wig = Math.sin((animT||0)*3)*2;
  g.strokeStyle = fish.fin || shadeColor(fish.color,-30);
  g.lineWidth=2;
  for(let i=0;i<5;i++){
    const baseY = -6+i*3;
    g.beginPath();
    g.moveTo(-9,baseY);
    g.quadraticCurveTo(-16,baseY+wig*(i%2?1:-1), -20,baseY+2+wig);
    g.stroke();
  }
}
function drawCrown(g, fish){
  const {ry} = bodyRadii(fish.shape);
  g.fillStyle="#ffd166";
  g.beginPath();
  g.moveTo(-4,-ry-4); g.lineTo(-2,-ry-9); g.lineTo(0,-ry-4);
  g.lineTo(2,-ry-10); g.lineTo(4,-ry-4); g.lineTo(6,-ry-8); g.lineTo(7,-ry-3);
  g.closePath(); g.fill();
}
function drawScaleTexture(g, fish){
  if(fish.shape==="squid") return;
  const {rx,ry} = bodyRadii(fish.shape);
  g.save();
  g.beginPath();
  if(fish.shape==="spike"){ g.ellipse(0,0,rx*0.78,ry*0.88,0,0,Math.PI*2); } else { g.ellipse(0,0,rx*0.88,ry*0.88,0,0,Math.PI*2); }
  g.clip();
  g.strokeStyle = shadeColor(fish.color,-18);
  g.lineWidth = 0.55;
  const rows = 6;
  for(let row=-rows;row<=rows;row++){
    const rowY = row*(ry/rows*0.95);
    g.globalAlpha = 0.32 - Math.abs(row)*0.012;
    for(let col=-5;col<=5;col++){
      const colX = col*2.5 + (row%2===0?0:1.25);
      g.beginPath();
      g.arc(colX,rowY,1.7,Math.PI*0.15,Math.PI*0.85);
      g.stroke();
    }
  }
  g.restore();
}
function drawHighlight(g, fish){
  const {rx,ry} = bodyRadii(fish.shape);
  g.save();
  g.globalAlpha=0.28;
  g.fillStyle="#ffffff";
  g.beginPath();
  g.ellipse(-rx*0.15,-ry*0.45,rx*0.32,ry*0.22,-0.3,0,Math.PI*2);
  g.fill();
  // a second, smaller catchlight for extra glossiness
  g.globalAlpha=0.16;
  g.beginPath();
  g.ellipse(-rx*0.35,-ry*0.15,rx*0.12,ry*0.09,-0.2,0,Math.PI*2);
  g.fill();
  g.restore();
}
function drawRimLight(g, fish){
  // faint cool-toned rim along the upper back edge, as if lit from above by the water surface
  const {rx,ry} = bodyRadii(fish.shape);
  g.save();
  g.globalAlpha=0.22;
  g.strokeStyle="#dff3ff";
  g.lineWidth=1;
  g.beginPath();
  g.ellipse(0,0,rx*0.92,ry*0.92,0,Math.PI*1.08,Math.PI*1.7);
  g.stroke();
  g.restore();
}
function drawLateralLine(g, fish){
  // the faint horizontal stripe running nose-to-tail that real fish use to sense motion
  const {rx} = bodyRadii(fish.shape);
  g.save();
  g.globalAlpha=0.3;
  g.strokeStyle = shadeColor(fish.color,-38);
  g.lineWidth=0.6;
  g.beginPath();
  g.moveTo(rx*0.6,-0.5);
  g.quadraticCurveTo(0,0.5,-rx*0.7,0);
  g.stroke();
  g.restore();
}
function drawMouth(g, fish){
  g.strokeStyle = shadeColor(fish.color,-50);
  g.lineWidth=0.7;
  g.beginPath();
  g.moveTo(10,0.5);
  g.quadraticCurveTo(11.5,1.6,10,2.4);
  g.stroke();
}
function drawScars(g, fish){
  g.strokeStyle="rgba(20,20,20,0.5)";
  g.lineWidth=0.8;
  g.beginPath(); g.moveTo(-2,-3); g.lineTo(2,-1); g.stroke();
  g.beginPath(); g.moveTo(-4,2); g.lineTo(0,4); g.stroke();
}
function drawHammerhead(g, fish){
  // flattened, T-shaped head with eyes set on each end - hammerhead shark silhouette
  const {rx} = bodyRadii(fish.shape);
  g.fillStyle = shadeColor(fish.color,-10);
  g.beginPath();
  g.ellipse(rx-3, 0, 3, 8, 0, 0, Math.PI*2);
  g.fill();
  g.fillStyle="#111";
  g.beginPath(); g.arc(rx-2,-6,1,0,Math.PI*2); g.fill();
  g.beginPath(); g.arc(rx-2,6,1,0,Math.PI*2); g.fill();
}
function drawWings(g, fish){
  // wide, flat triangular "wing" fins - manta ray / electric ray silhouette
  const {ry} = bodyRadii(fish.shape);
  g.fillStyle = shadeColor(fish.color,-15);
  g.beginPath();
  g.moveTo(2,-ry*0.3); g.lineTo(-7,-ry*2.1); g.lineTo(-2,-ry*0.6); g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(2,ry*0.3); g.lineTo(-7,ry*2.1); g.lineTo(-2,ry*0.6); g.closePath(); g.fill();
}
function drawElectric(g, fish, animT){
  // flickering little sparks - electric ray
  if(Math.sin(animT*8)<0.5) return;
  g.save();
  g.strokeStyle="#bfe9ff"; g.lineWidth=1;
  g.shadowColor="#bfe9ff"; g.shadowBlur=4;
  g.beginPath();
  g.moveTo(-3,-3); g.lineTo(0,-5); g.lineTo(-1,-1); g.lineTo(3,2); g.lineTo(1,3);
  g.stroke();
  g.restore();
}
function drawRidgehead(g, fish){
  // small raised ridge on the forehead
  const {ry} = bodyRadii(fish.shape);
  g.fillStyle = shadeColor(fish.color,18);
  g.beginPath();
  g.moveTo(6,-ry+1); g.lineTo(9,-ry-4); g.lineTo(11,-ry+2);
  g.closePath(); g.fill();
}
function drawLobefins(g, fish){
  // paired fleshy, lobed fins along the flank - coelacanth's signature feature
  const {rx,ry} = bodyRadii(fish.shape);
  g.fillStyle = fish.fin || shadeColor(fish.color,-30);
  g.beginPath(); g.ellipse(-rx*0.2, ry*0.65, 4.2, 2.4, 0.4, 0, Math.PI*2); g.fill();
  g.beginPath(); g.ellipse(2, ry*0.75, 4.2, 2.4, 0.5, 0, Math.PI*2); g.fill();
}
function drawSparkle(g, fish, animT){
  // twinkling little starlight motes - Starfall Koi, born of a meteor shower
  const pts = [[10,-6],[-6,-8],[8,6],[-9,4],[1,-9]];
  pts.forEach(([sx,sy],i)=>{
    const tw = (Math.sin(animT*3+i*2)+1)/2;
    if(tw<0.45) return;
    g.save();
    g.globalAlpha = tw;
    g.fillStyle="#ffffff";
    g.shadowColor="#fff3c2"; g.shadowBlur=3;
    g.beginPath();
    g.moveTo(sx,sy-1.4); g.lineTo(sx+0.4,sy-0.4); g.lineTo(sx+1.4,sy);
    g.lineTo(sx+0.4,sy+0.4); g.lineTo(sx,sy+1.4); g.lineTo(sx-0.4,sy+0.4);
    g.lineTo(sx-1.4,sy); g.lineTo(sx-0.4,sy-0.4); g.closePath();
    g.fill();
    g.restore();
  });
}


// Lightweight silhouette used for ambient background fish and the miss/undiscovered state.
function drawFishShape(g, shape){
  g.beginPath();
  const {rx,ry} = bodyRadii(shape);
  if(shape==="spike"){
    g.moveTo(rx+1,0); g.lineTo(-rx*0.4,-ry); g.lineTo(-rx-2,-ry*0.4); g.lineTo(-rx-8,-ry-2);
    g.lineTo(-rx-2,0); g.lineTo(-rx-8,ry+2); g.lineTo(-rx-2,ry*0.4); g.lineTo(-rx*0.4,ry);
    g.closePath(); g.fill();
  } else if(shape==="squid"){
    g.ellipse(0,-1,rx*0.8,ry*0.8,0,0,Math.PI*2); g.fill();
  } else {
    g.ellipse(0,0,rx,ry,0,0,Math.PI*2); g.fill();
    g.beginPath(); g.moveTo(-rx+2,0); g.lineTo(-rx-8,-ry-2); g.lineTo(-rx-8,ry+2); g.closePath(); g.fill();
  }
  g.fillStyle="rgba(255,255,255,0.85)";
  g.beginPath(); g.arc(rx*0.45,-1,1.4,0,Math.PI*2); g.fill();
}

/* =========================================================================
   PARTICLES
   ========================================================================= */
function spawnSplashParticles(xFrac){
  const rect = canvas.getBoundingClientRect();
  const x = xFrac*rect.width, y = waterSurfaceY(rect.height);
  for(let i=0;i<14;i++){
    RT.particles.push({
      x, y, vx: rand(-90,90), vy: rand(-170,-40), life: rand(400,750),
      age:0, color: Math.random()<0.5? "#bfe9ff":"#ffffff", size: rand(1.5,3.5)
    });
  }
}
function updateParticles(dt){
  for(let i=RT.particles.length-1;i>=0;i--){
    const p = RT.particles[i];
    p.age+=dt;
    if(p.age>p.life){ RT.particles.splice(i,1); continue; }
    p.vy += 480*dt/1000;
    p.x += p.vx*dt/1000;
    p.y += p.vy*dt/1000;
  }
}

/* =========================================================================
   INPUT
   ========================================================================= */
function pointerDownMain(e){
  e.preventDefault();
  if(RT.phase==="idle") requestCast();
  else if(RT.phase==="biting") attemptHook();
  else if(RT.phase==="reeling"){ RT.reeling=true; }
}
function pointerUpMain(e){
  if(RT.phase==="charging") releaseCast();
  if(RT.phase==="reeling") RT.reeling=false;
}
mainActionBtn.addEventListener("pointerdown", pointerDownMain);
window.addEventListener("pointerup", pointerUpMain);
mainActionBtn.addEventListener("pointercancel", pointerUpMain);

// Aiming: pointer move over canvas while idle/charging sets horizontal aim
canvas.addEventListener("pointermove", (e)=>{
  const rect = canvas.getBoundingClientRect();
  RT.aim.x = clamp((e.clientX-rect.left)/rect.width, 0.1, 0.95);
});
canvas.addEventListener("pointerdown", (e)=>{
  const rect = canvas.getBoundingClientRect();
  RT.aim.x = clamp((e.clientX-rect.left)/rect.width, 0.1, 0.95);
  pointerDownMain(e);
});
canvas.addEventListener("pointerup", pointerUpMain);

// Keyboard: space bar for charge/hook/reel
window.addEventListener("keydown",(e)=>{
  if(e.code==="Space"){
    e.preventDefault();
    if(e.repeat) { if(RT.phase==="reeling") RT.reeling=true; return; }
    pointerDownMain(e);
  }
});
window.addEventListener("keyup",(e)=>{
  if(e.code==="Space"){ e.preventDefault(); pointerUpMain(e); }
});

/* Top bar buttons */
$("btnFishdex").onclick=()=>{ renderFishdex(); $("modalFishdex").classList.add("show"); RT.paused=true; };
$("closeFishdex").onclick=()=>{ $("modalFishdex").classList.remove("show"); RT.paused=false; };
$("btnZones").onclick=()=>{ if($("btnZones").classList.contains("disabled")) return; renderZones(); $("modalZones").classList.add("show"); RT.paused=true; };
$("closeZones").onclick=()=>{ $("modalZones").classList.remove("show"); RT.paused=false; };
$("btnShop").onclick=()=>{ if($("btnShop").classList.contains("disabled")) return; renderShop(); $("modalShop").classList.add("show"); RT.paused=true; };
$("closeShop").onclick=()=>{ $("modalShop").classList.remove("show"); RT.paused=false; };
$("btnCooler").onclick=()=>{ if($("btnCooler").classList.contains("disabled")) return; renderCooler(); $("modalCooler").classList.add("show"); RT.paused=true; };
$("closeCooler").onclick=()=>{ $("modalCooler").classList.remove("show"); RT.paused=false; };
$("btnSellAll").onclick=()=>sellAllItems();
$("btnGoShop").onclick=()=>{ $("modalRunEnd").classList.remove("show"); renderShop(); $("modalShop").classList.add("show"); };
$("btnGoCooler").onclick=()=>{ $("modalRunEnd").classList.remove("show"); renderCooler(); $("modalCooler").classList.add("show"); };
$("btnNewRun").onclick=()=>returnRunHome();

/* Home screen buttons */
$("homeShopBtn").onclick=()=>{ renderShop(); $("modalShop").classList.add("show"); };
$("homeFishdexBtn").onclick=()=>{ renderFishdex(); $("modalFishdex").classList.add("show"); };
$("homeStartBtn").onclick=()=>startGame();
$("homeArcadeBtn").onclick=()=>returnToArcadeAcademy();

/* =========================================================================
   RENDERING
   ========================================================================= */
function waterSurfaceY(h){ return h*0.42; }

function render(now){
  const w = canvas.width, h = canvas.height;
  const zone = currentZone();
  const waterY = waterSurfaceY(h);

  ctx.save();
  if(now < RT.shakeUntil){
    ctx.translate(rand(-RT.shakeMag,RT.shakeMag), rand(-RT.shakeMag,RT.shakeMag));
  }

  // day/night tint factor
  const nightAmt = (Math.sin(RT.dayNight*Math.PI*2)+1)/2 * 0.55; // 0 = day .. up to .55 dark overlay

  // sky
  const skyGrad = ctx.createLinearGradient(0,0,0,waterY);
  skyGrad.addColorStop(0, zone.sky[0]);
  skyGrad.addColorStop(1, zone.sky[1]);
  ctx.fillStyle=skyGrad;
  ctx.fillRect(0,0,w,waterY);

  if(zone.id!=="deepsea"){
    // sun/moon
    const cyclex = w*(0.15+ ( (RT.dayNight)%1 )*0.7);
    ctx.beginPath();
    ctx.fillStyle = nightAmt>0.3 ? "#dfe8ff" : "#fff2b0";
    ctx.arc(cyclex, waterY*0.28, 16, 0, Math.PI*2);
    ctx.fill();

    // clouds (simple)
    ctx.fillStyle="rgba(255,255,255,0.5)";
    for(let i=0;i<3;i++){
      const cx = ((now*0.01 + i*220) % (w+200)) -100;
      const cy = waterY*0.2 + i*22;
      drawCloud(cx,cy);
    }
  }

  // zone-specific backdrop (mountains, treeline, distant sailboat...) sits between sky and water
  drawZoneBackdrop(zone, w, waterY, now);

  // weather: storm event = rain
  if(RT.event && RT.event.id==="storm"){
    ctx.strokeStyle="rgba(180,210,255,0.5)";
    ctx.lineWidth=1;
    for(let i=0;i<40;i++){
      const rx = (i*53 + (now*0.4)%53) % w;
      const ry = (i*37 + now*0.5) % waterY;
      ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(rx-6,ry+12); ctx.stroke();
    }
    ctx.fillStyle="rgba(20,20,30,0.15)";
    ctx.fillRect(0,0,w,waterY);
  }

  // weather: blood moon = a huge crimson moon rises and everything gets a red tint
  if(RT.event && RT.event.id==="bloodmoon"){
    ctx.save();
    ctx.shadowColor="#ff3b4e"; ctx.shadowBlur=28;
    ctx.fillStyle="#ff3b4e";
    ctx.beginPath(); ctx.arc(w*0.82, waterY*0.26, 24, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle="rgba(150,10,30,0.13)";
    ctx.fillRect(0,0,w,h);
    // drifting red mist near the shore
    ctx.fillStyle="rgba(180,20,40,0.08)";
    for(let i=0;i<3;i++){
      const mx = ((now*0.015+i*180)%(w+160))-80;
      ctx.beginPath(); ctx.ellipse(mx, waterY-6-i*4, 90, 14, 0, 0, Math.PI*2); ctx.fill();
    }
  }

  // weather: meteor shower = streaking shooting stars across the sky
  if(RT.event && RT.event.id==="meteor"){
    ctx.strokeStyle="rgba(255,255,255,0.85)";
    ctx.lineWidth=1.3;
    for(let i=0;i<7;i++){
      const t = (now*0.35 + i*160) % (w+waterY);
      const sx = w - (t>w? w : t);
      const sy = t>w ? (t-w) : 0;
      ctx.beginPath();
      ctx.moveTo(sx,sy);
      ctx.lineTo(sx+16,sy-16);
      ctx.stroke();
    }
  }

  // weather: fog = hazy low visibility drifting across the whole scene
  if(RT.event && RT.event.id==="fog"){
    ctx.fillStyle="rgba(205,210,220,0.22)";
    ctx.fillRect(0,0,w,h);
    ctx.fillStyle="rgba(230,232,238,0.12)";
    for(let i=0;i<4;i++){
      const fx = ((now*0.02+i*150)%(w+160))-80;
      ctx.beginPath(); ctx.ellipse(fx, waterY*0.6+i*10, 110, 30, 0, 0, Math.PI*2); ctx.fill();
    }
  }

  // zone-specific shoreline (grassy bank, rocky bank, wooden dock, sandy beach, stone ledge...)
  drawShore(zone, w, waterY);

  // water
  const waterGrad = ctx.createLinearGradient(0,waterY,0,h);
  waterGrad.addColorStop(0, zone.water[0]);
  waterGrad.addColorStop(1, zone.water[1]);
  ctx.fillStyle=waterGrad;
  ctx.fillRect(0,waterY,w,h-waterY);

  // waves
  ctx.strokeStyle="rgba(255,255,255,0.18)";
  ctx.lineWidth=2;
  for(let row=0; row<5; row++){
    const ry = waterY + 18 + row*((h-waterY-18)/5);
    ctx.beginPath();
    for(let x=0;x<=w;x+=14){
      const yy = ry + Math.sin((x*0.04)+(now*0.0016)+row)*3;
      if(x===0) ctx.moveTo(x,yy); else ctx.lineTo(x,yy);
    }
    ctx.stroke();
  }

  // zone-specific water decor (lily pads, current streaks, wave caps, bioluminescence...)
  drawWaterDecor(zone, w, h, waterY, now);

  // fish silhouettes under water (ambient)
  for(let i=0;i<4;i++){
    const fx = ((now*0.02*(1+i*0.3) + i*160) % (w+80)) - 40;
    const fy = waterY + 40 + i*26 + Math.sin(now*0.002+i)*6;
    ctx.save();
    ctx.translate(fx,fy);
    ctx.scale(((i%2===0)?1:-1)*0.9,0.9);
    ctx.fillStyle="rgba(0,0,0,0.28)";
    drawFishShape(ctx,"round");
    ctx.restore();
  }

  // night overlay
  if(zone.id!=="deepsea" && nightAmt>0.02){
    ctx.fillStyle = `rgba(5,10,30,${nightAmt*0.6})`;
    ctx.fillRect(0,0,w,h);
  }

  // night stars
  if(zone.id!=="deepsea" && nightAmt>0.25){
    ctx.fillStyle="rgba(255,255,255,"+(nightAmt-0.2)+")";
    for(let i=0;i<40;i++){
      const sx = (i*97)%w, sy=(i*53)%waterY;
      ctx.fillRect(sx,sy,1.5,1.5);
    }
  }

  // event tint
  if(RT.event && RT.event.id==="golden"){
    ctx.fillStyle="rgba(255,210,90,0.10)";
    ctx.fillRect(0,0,w,h);
  }
  if(RT.event && RT.event.id==="feeding"){
    ctx.fillStyle="rgba(90,255,150,0.06)";
    ctx.fillRect(0,0,w,h);
  }

  // bobber + line + rod
  drawAngler(w,h,waterY,now);
  drawBobberAndLine(w,h,waterY,now);

  // particles
  ctx.save();
  for(const p of RT.particles){
    const alpha = 1-(p.age/p.life);
    ctx.fillStyle = hexToRgba(p.color, alpha);
    ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);
  }
  ctx.restore();

  // reeling fish visual (jumping near bobber)
  if(RT.phase==="reeling"){
    drawFightingFish(w,h,waterY,now);
    updateSurgeFlash();
  } else if(surgeFlash.style.display!=="none"){
    surgeFlash.style.display="none";
  }

  // vignette
  const vg = ctx.createRadialGradient(w/2,h/2,h*0.35,w/2,h/2,h*0.85);
  vg.addColorStop(0,"rgba(0,0,0,0)");
  vg.addColorStop(1,"rgba(0,0,0,0.35)");
  ctx.fillStyle=vg;
  ctx.fillRect(0,0,w,h);

  ctx.restore();
}
function hexToRgba(hex, a){
  const c = hex.replace('#','');
  const bigint = parseInt(c.length===3? c.split('').map(ch=>ch+ch).join(''):c,16);
  const r=(bigint>>16)&255,g=(bigint>>8)&255,b=bigint&255;
  return `rgba(${r},${g},${b},${a})`;
}
/* =========================================================================
   ZONE-SPECIFIC VISUAL DECOR
   Each fishing ground gets its own backdrop (drawn in the sky, before the
   water), shoreline, and water-surface decor so the five zones read as
   distinct places rather than palette-swapped copies of one scene.
   ========================================================================= */
function drawZoneBackdrop(zone, w, waterY, now){
  switch(zone.id){
    case "river":
      drawTreeline(w, waterY, "#234a33", 15);
      break;
    case "lake":
      drawMountains(w, waterY);
      drawTreeline(w, waterY, "#1f3a2a", 13);
      break;
    case "ocean":
      drawDistantSailboat(w, waterY, now);
      break;
    case "deepsea":
      drawTrenchGlow(w, waterY, now);
      break;
    case "sunkenruins":
      ctx.fillStyle="#251d3d";for(let x=w*.22;x<w;x+=74){ctx.fillRect(x,waterY-45,9,45);ctx.fillRect(x-14,waterY-47,37,6);ctx.fillStyle="#56d8d0";ctx.fillRect(x+2,waterY-37,3,9);ctx.fillStyle="#251d3d";}
      break;
    default: // pond: open grassy horizon, nothing extra needed
      break;
  }
}
function drawShore(zone, w, waterY){
  switch(zone.id){
    case "pond":    drawGrassyBank(w, waterY); break;
    case "river":   drawRockyBank(w, waterY); break;
    case "lake":    drawWoodenDock(w, waterY); break;
    case "ocean":   drawSandyBeach(w, waterY); break;
    case "deepsea": drawStoneLedge(w, waterY); break;
    case "sunkenruins": drawStoneLedge(w, waterY); break;
    default:        drawWoodenDock(w, waterY);
  }
}
function drawWaterDecor(zone, w, h, waterY, now){
  switch(zone.id){
    case "pond":
      drawLilyPads(w, waterY, now);
      drawDragonflies(w, waterY, now);
      break;
    case "river":
      drawCurrentStreaks(w, h, waterY, now);
      drawDriftwood(w, waterY, now);
      break;
    case "lake":
      drawBirds(w, waterY, now);
      break;
    case "ocean":
      drawSeagulls(w, waterY, now);
      drawWaveCaps(w, h, waterY, now);
      break;
    case "deepsea":
      drawBioParticles(w, h, waterY, now);
      drawJellyfish(w, h, waterY, now);
      drawLightShafts(w, h, waterY);
      break;
    case "sunkenruins":
      drawBioParticles(w,h,waterY,now);
      ctx.strokeStyle="rgba(86,216,208,.28)";for(let i=0;i<7;i++){ctx.strokeRect((i*137+now*.01)%w,waterY+30+(i*41)%(h-waterY-50),18,12);}
      break;
  }
}

/* ---- backdrops ---- */
function drawMountains(w, waterY){
  const peaks = [
    {x:w*0.14, ph:Math.min(waterY*0.85,74), pw:150, color:"#48607e"},
    {x:w*0.42, ph:Math.min(waterY*0.95,100), pw:190, color:"#3b5169"},
    {x:w*0.74, ph:Math.min(waterY*0.75,66), pw:140, color:"#557092"},
  ];
  peaks.forEach(p=>{
    ctx.fillStyle=p.color;
    ctx.beginPath();
    ctx.moveTo(p.x-p.pw/2, waterY);
    ctx.lineTo(p.x, waterY-p.ph);
    ctx.lineTo(p.x+p.pw/2, waterY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.88)";
    ctx.beginPath();
    ctx.moveTo(p.x-16, waterY-p.ph+20);
    ctx.lineTo(p.x, waterY-p.ph);
    ctx.lineTo(p.x+16, waterY-p.ph+20);
    ctx.lineTo(p.x+7, waterY-p.ph+25);
    ctx.lineTo(p.x-7, waterY-p.ph+25);
    ctx.closePath();
    ctx.fill();
  });
}
function drawTreeline(w, waterY, color, spacing){
  ctx.fillStyle=color;
  for(let x=w*0.18; x<w; x+=spacing){
    const th = 14+((Math.floor(x)*7)%11);
    ctx.beginPath();
    ctx.moveTo(x, waterY);
    ctx.lineTo(x+spacing*0.5, waterY-th);
    ctx.lineTo(x+spacing, waterY);
    ctx.closePath();
    ctx.fill();
  }
}
function drawDistantSailboat(w, waterY, now){
  const bx = ((now*0.006)%(w+140))-70;
  const by = waterY-4;
  ctx.fillStyle="rgba(255,255,255,0.75)";
  ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx,by-18); ctx.lineTo(bx+13,by); ctx.closePath(); ctx.fill();
  ctx.fillStyle="rgba(40,55,75,0.8)";
  ctx.fillRect(bx-7,by,22,3);
}
function drawTrenchGlow(w, waterY, now){
  // a faint pulsing glow far below, hinting at something bioluminescent deep in the trench
  const gx = w*0.6, gy = waterY*0.7;
  const pulse = 0.15+0.08*Math.sin(now*0.0012);
  ctx.save();
  ctx.globalAlpha=pulse;
  ctx.fillStyle="#6fe6c9";
  ctx.shadowColor="#6fe6c9"; ctx.shadowBlur=30;
  ctx.beginPath(); ctx.arc(gx,gy,26,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

/* ---- shorelines ---- */
function drawGrassyBank(w, waterY){
  ctx.fillStyle="#3d5a3f";
  ctx.fillRect(0, waterY-14, w*0.16, 26);
  ctx.fillStyle="#33492f";
  for(let i=0;i<5;i++){ ctx.fillRect(w*0.015+i*w*0.032, waterY+8, 8, 8); }
  ctx.strokeStyle="#4a7a4f"; ctx.lineWidth=2;
  for(let i=0;i<6;i++){
    const x=w*0.02+i*w*0.026;
    ctx.beginPath(); ctx.moveTo(x,waterY+2); ctx.quadraticCurveTo(x+3,waterY-14,x+1,waterY-26); ctx.stroke();
  }
}
function drawRockyBank(w, waterY){
  ctx.fillStyle="#565a5e";
  ctx.fillRect(0, waterY-10, w*0.16, 22);
  ctx.fillStyle="#6e7276";
  for(let i=0;i<6;i++){
    const x=w*0.012+i*w*0.026;
    ctx.beginPath(); ctx.ellipse(x,waterY+8,7,5,0,0,Math.PI*2); ctx.fill();
  }
}
function drawWoodenDock(w, waterY){
  ctx.fillStyle="#3a2c22";
  ctx.fillRect(0, waterY-14, w*0.16, 26);
  ctx.fillStyle="#2a1e17";
  for(let i=0;i<4;i++){ ctx.fillRect(w*0.02+i*w*0.04, waterY+10, 6, 26); }
}
function drawSandyBeach(w, waterY){
  ctx.fillStyle="#dcc386";
  ctx.fillRect(0, waterY-10, w*0.2, 24);
  ctx.fillStyle="#c9a24a";
  ctx.fillRect(0, waterY+10, w*0.2, 4);
  ctx.fillStyle="#8a6a42";
  for(let i=0;i<3;i++){ ctx.fillRect(w*0.15+i*w*0.028, waterY+8, 5, 20); }
  ctx.strokeStyle="#6b4a2c"; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(w*0.045,waterY-8); ctx.quadraticCurveTo(w*0.055,waterY-38,w*0.085,waterY-46); ctx.stroke();
  ctx.fillStyle="#3f7a3f";
  for(let a=0;a<5;a++){
    const ang=a*(Math.PI*2/5);
    ctx.beginPath();
    ctx.ellipse(w*0.085+Math.cos(ang)*10, waterY-46+Math.sin(ang)*6, 10, 4, ang, 0, Math.PI*2);
    ctx.fill();
  }
}
function drawStoneLedge(w, waterY){
  ctx.fillStyle="#101c28";
  ctx.fillRect(0, waterY-14, w*0.16, 26);
  ctx.fillStyle="#0a141d";
  for(let i=0;i<4;i++){ ctx.fillRect(w*0.02+i*w*0.04, waterY+10, 6, 22); }
}

/* ---- water-surface decor ---- */
function drawLilyPads(w, waterY, now){
  const pads=[[0.30,10],[0.46,34],[0.64,14],[0.78,42],[0.55,60]];
  pads.forEach(([px,base],i)=>{
    const x=w*px, y=waterY+base+Math.sin(now*0.0015+i)*2;
    ctx.fillStyle="#3f8f4f";
    ctx.beginPath();
    ctx.arc(x,y,9,0.4,Math.PI*2-0.4);
    ctx.lineTo(x,y);
    ctx.closePath();
    ctx.fill();
    if(i%2===0){ ctx.fillStyle="#ff9ec4"; ctx.beginPath(); ctx.arc(x-2,y-1,1.6,0,Math.PI*2); ctx.fill(); }
  });
}
function drawDragonflies(w, waterY, now){
  for(let i=0;i<2;i++){
    const t = now*0.001+i*3;
    const x = w*0.35+Math.sin(t)*w*0.18+i*w*0.18;
    const y = waterY-24+Math.cos(t*1.3)*10;
    ctx.strokeStyle="rgba(255,255,255,0.65)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x-4,y); ctx.lineTo(x+4,y); ctx.stroke();
    ctx.fillStyle="#2f5c46";
    ctx.fillRect(x-1,y-3,2,7);
  }
}
function drawCurrentStreaks(w, h, waterY, now){
  ctx.strokeStyle="rgba(255,255,255,0.22)"; ctx.lineWidth=1.4;
  for(let i=0;i<10;i++){
    const yy = waterY+16+((i*23)%(h-waterY-20));
    const xoff = (now*0.09+i*50)%(w+60)-30;
    ctx.beginPath(); ctx.moveTo(xoff,yy); ctx.lineTo(xoff+30,yy-4); ctx.stroke();
  }
}
function drawDriftwood(w, waterY, now){
  const x = ((now*0.025)%(w+80))-40;
  const y = waterY+50;
  ctx.strokeStyle="#5a3d24"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(x-10,y); ctx.lineTo(x+10,y-2); ctx.stroke();
}
function drawBirds(w, waterY, now){
  ctx.strokeStyle="rgba(40,40,50,0.55)"; ctx.lineWidth=1.4;
  for(let i=0;i<3;i++){
    const x=((now*0.02+i*90)%(w+80))-40;
    const y=waterY*0.22+i*10;
    ctx.beginPath();
    ctx.moveTo(x-5,y); ctx.quadraticCurveTo(x,y-4,x+5,y);
    ctx.moveTo(x,y); ctx.quadraticCurveTo(x+5,y-4,x+10,y);
    ctx.stroke();
  }
}
function drawSeagulls(w, waterY, now){
  ctx.strokeStyle="rgba(255,255,255,0.9)"; ctx.lineWidth=1.4;
  for(let i=0;i<3;i++){
    const x=((now*0.03+i*110)%(w+80))-40;
    const y=waterY*0.18+i*14+Math.sin(now*0.003+i)*4;
    ctx.beginPath();
    ctx.moveTo(x-5,y); ctx.quadraticCurveTo(x,y-5,x+5,y);
    ctx.moveTo(x,y); ctx.quadraticCurveTo(x+5,y-5,x+10,y);
    ctx.stroke();
  }
}
function drawWaveCaps(w, h, waterY, now){
  ctx.fillStyle="rgba(255,255,255,0.5)";
  for(let row=0; row<3; row++){
    const ry=waterY+18+row*((h-waterY-18)/5);
    for(let x=0;x<w;x+=18){
      const phase=(x*0.05)+(now*0.0016)+row;
      const yy=ry+Math.sin(phase)*3;
      if(Math.sin(phase*3)>0.75){ ctx.fillRect(x-1,yy-1,3,2); }
    }
  }
}
function drawBioParticles(w, h, waterY, now){
  ctx.save();
  for(let i=0;i<22;i++){
    const seedx=(i*53)%w;
    const speed=0.02+((i%5)*0.01);
    const y = h-((now*speed+i*40)%(h-waterY));
    const x = seedx+Math.sin(now*0.001+i)*10;
    const alpha=Math.max(0.12, 0.4+0.4*Math.sin(now*0.002+i));
    ctx.fillStyle=`rgba(140,255,220,${alpha})`;
    ctx.shadowColor="#8cffdc"; ctx.shadowBlur=4;
    ctx.beginPath(); ctx.arc(x,y,1.3,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function drawJellyfish(w, h, waterY, now){
  for(let i=0;i<2;i++){
    const x = w*(0.3+i*0.4)+Math.sin(now*0.0007+i)*30;
    const y = waterY+60+i*70+Math.sin(now*0.0012+i)*10;
    const glow = 0.5+0.3*Math.sin(now*0.003+i);
    ctx.save();
    ctx.globalAlpha=glow;
    ctx.fillStyle="#c78be0";
    ctx.shadowColor="#c78be0"; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.ellipse(x,y,10,7,0,Math.PI,0); ctx.fill();
    ctx.strokeStyle="rgba(199,139,224,0.6)"; ctx.lineWidth=1;
    for(let t=-1;t<=1;t++){
      ctx.beginPath();
      ctx.moveTo(x+t*4,y);
      ctx.quadraticCurveTo(x+t*4+Math.sin(now*0.004+t)*4,y+14,x+t*4,y+24);
      ctx.stroke();
    }
    ctx.restore();
  }
}
function drawLightShafts(w, h, waterY){
  ctx.save();
  ctx.globalAlpha=0.06;
  ctx.fillStyle="#bfe9ff";
  for(let i=0;i<3;i++){
    const x=w*(0.2+i*0.3);
    ctx.beginPath();
    ctx.moveTo(x-30,waterY);
    ctx.lineTo(x+30,waterY);
    ctx.lineTo(x+70,h);
    ctx.lineTo(x-70,h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawCloud(cx,cy){
  ctx.beginPath();
  ctx.ellipse(cx,cy,26,10,0,0,Math.PI*2);
  ctx.ellipse(cx+18,cy-6,18,9,0,0,Math.PI*2);
  ctx.ellipse(cx-16,cy-4,16,8,0,0,Math.PI*2);
  ctx.fill();
}
function drawSecretAngler(glitched,now){
  const bone=glitched?(Math.sin(now*.003)>0?'#58f7ff':'#ff4fcb'):'#eee7d2',dark=glitched?'#151027':'#5d5560';
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(0,15,17,4,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=bone;ctx.lineWidth=4;ctx.lineCap='square';
  ctx.beginPath();ctx.moveTo(-4,-1);ctx.lineTo(-5,13);ctx.moveTo(4,-1);ctx.lineTo(5,13);ctx.moveTo(-7,-18);ctx.lineTo(7,-18);ctx.moveTo(0,-22);ctx.lineTo(0,0);ctx.moveTo(-8,-15);ctx.lineTo(-15,-4);ctx.moveTo(8,-15);ctx.lineTo(15,-6);ctx.stroke();
  ctx.strokeStyle=dark;ctx.lineWidth=2;for(let y=-18;y<=-6;y+=4){ctx.beginPath();ctx.moveTo(-7,y);ctx.lineTo(7,y);ctx.stroke();}
  ctx.fillStyle=bone;ctx.fillRect(-8,-35,16,13);ctx.fillStyle=dark;ctx.fillRect(-5,-31,3,4);ctx.fillRect(2,-31,3,4);ctx.fillRect(-3,-24,6,2);
  if(glitched){ctx.fillStyle='#ffe65c';ctx.fillRect(-10,-38,20,3);ctx.fillStyle='#ff4fcb';ctx.fillRect(9,-29,4,10);ctx.fillStyle='#58f7ff';ctx.fillRect(-13,-13,5,5);}
  ctx.strokeStyle=glitched?'#58f7ff':'#b7aa90';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(14,-7);ctx.lineTo(34,-30);ctx.stroke();
  ctx.restore();
}
function drawAngler(w,h,waterY,now){
  const idleBob = Math.sin(now*0.0025)*1.4;
  const ax = w*0.105, ay = waterY-14+idleBob;
  const leaning = RT.phase==="reeling" ? clamp(RT.tension/40,0,1) : 0;
  const armPump = RT.phase==="reeling" && RT.reeling ? (Math.sin(now*0.02)+1)/2 : 0;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(-leaning*0.08);
  const skeleton=hasAnglerSecret("secret_skeleton"),glitched=hasAnglerSecret("secret_glitch_aura");
  if(skeleton||glitched){drawSecretAngler(glitched,now);const theta=-leaning*.08,localX=34,localY=-30;RT._rodTip={x:ax+localX*Math.cos(theta)-localY*Math.sin(theta),y:ay+localX*Math.sin(theta)+localY*Math.cos(theta)};ctx.restore();return;}

  // soft layered ground shadow
  ctx.fillStyle="rgba(0,0,0,0.16)";
  ctx.beginPath(); ctx.ellipse(0,15,16,4.2,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(0,15,12,3,0,0,Math.PI*2); ctx.fill();

  // --- legs (cargo pants with cuffs and knee shading) ---
  const legGrad = ctx.createLinearGradient(-7,-2,6,13);
  legGrad.addColorStop(0,"#3c5470"); legGrad.addColorStop(1,"#243347");
  ctx.fillStyle=legGrad;
  ctx.fillRect(-6,-2,5,15);   // back leg
  ctx.fillRect(1,-2,5,15);    // front leg
  // knee shading crease
  ctx.strokeStyle="rgba(0,0,0,0.25)"; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.moveTo(-6,5); ctx.lineTo(-1,5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1,5); ctx.lineTo(6,5); ctx.stroke();
  // cargo pocket on front leg (thigh)
  ctx.fillStyle="#1e2c3f"; ctx.fillRect(2,1,3.2,3.6);
  ctx.strokeStyle="#152234"; ctx.lineWidth=0.5; ctx.strokeRect(2,1,3.2,3.6);
  // pant cuffs
  ctx.fillStyle="#1c2838"; ctx.fillRect(-6.3,9.5,5.6,2); ctx.fillRect(0.7,9.5,5.6,2);
  // boots with laces + sole
  ctx.fillStyle="#1c2436"; ctx.fillRect(-7,11,7,4.5);
  ctx.fillStyle="#222c40"; ctx.fillRect(0,11,7,4.5);
  ctx.fillStyle="#0e141f"; ctx.fillRect(-7,14.2,7,1.3); ctx.fillRect(0,14.2,7,1.3); // soles
  ctx.strokeStyle="#e0c9a0"; ctx.lineWidth=0.5;
  for(let i=0;i<2;i++){
    ctx.beginPath(); ctx.moveTo(-6,11.6+i*1.2); ctx.lineTo(-1.4,12+i*1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.6,11.6+i*1.2); ctx.lineTo(5.2,12+i*1.2); ctx.stroke();
  }

  // --- torso (fishing vest) ---
  const torsoGrad = ctx.createLinearGradient(-8,-24,8,0);
  torsoGrad.addColorStop(0,"#d0713f");
  torsoGrad.addColorStop(0.55,"#c9683c");
  torsoGrad.addColorStop(1,"#9c4a28");
  ctx.fillStyle=torsoGrad;
  ctx.fillRect(-8,-24,16,24);
  // collar
  ctx.fillStyle="#8a3c22";
  ctx.beginPath(); ctx.moveTo(-3,-24); ctx.lineTo(0,-21); ctx.lineTo(3,-24); ctx.closePath(); ctx.fill();
  // vest pockets with stitched edges + flaps
  ctx.fillStyle="#8a3c22";
  ctx.fillRect(-6,-14,5,6);
  ctx.fillRect(2,-14,5,6);
  ctx.strokeStyle="rgba(0,0,0,0.25)"; ctx.lineWidth=0.4;
  ctx.strokeRect(-6,-14,5,6); ctx.strokeRect(2,-14,5,6);
  ctx.fillStyle="#7a331c"; ctx.fillRect(-6,-14,5,1.4); ctx.fillRect(2,-14,5,1.4); // pocket flaps
  // pocket button snaps
  ctx.fillStyle="#e0c088";
  ctx.fillRect(-4,-10.5,1,1);
  ctx.fillRect(4,-10.5,1,1);
  // a small pair of clippers/tool hanging off one pocket - angler flair
  ctx.strokeStyle="#8a8f96"; ctx.lineWidth=0.7;
  ctx.beginPath(); ctx.moveTo(6,-14); ctx.lineTo(6.6,-11.5); ctx.stroke();
  ctx.fillStyle="#c0c4c9"; ctx.beginPath(); ctx.arc(6.6,-11,0.9,0,Math.PI*2); ctx.fill();
  // embroidered fish-shaped patch on the chest
  ctx.save();
  ctx.translate(-3,-20);
  ctx.scale(0.35,0.35);
  ctx.fillStyle="#ffd166";
  ctx.beginPath(); ctx.ellipse(0,0,7,4,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-7,0); ctx.lineTo(-11,-4); ctx.lineTo(-11,4); ctx.closePath(); ctx.fill();
  ctx.restore();
  // vest zipper line
  ctx.strokeStyle="#5c2a17"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,-24); ctx.lineTo(0,0); ctx.stroke();
  // fabric fold shading along the sides
  ctx.strokeStyle="rgba(0,0,0,0.15)"; ctx.lineWidth=0.7;
  ctx.beginPath(); ctx.moveTo(-6.5,-22); ctx.lineTo(-5,-2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6.5,-22); ctx.lineTo(5,-2); ctx.stroke();
  // belt
  ctx.fillStyle="#3a2a1c"; ctx.fillRect(-8,-2,16,2.4);
  ctx.fillStyle="#c9a24a"; ctx.fillRect(-1.2,-2,2.4,2.4); // buckle
  // small creel/fish bag hanging at the hip
  ctx.fillStyle="#5c4a34";
  ctx.beginPath(); ctx.ellipse(-9,4,3.6,4.2,0.1,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="#3a2f20"; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.moveTo(-11,1.5); ctx.lineTo(-7,1.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-11,4); ctx.lineTo(-7,4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-9,0); ctx.quadraticCurveTo(-9,-2.5,-6,-2); ctx.stroke(); // strap up to shoulder

  // back arm (holds rod near reel) - with rolled sleeve cuff
  ctx.strokeStyle="#c9683c"; ctx.lineWidth=5.2; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(-5,-19);
  ctx.lineTo(-2, -10 + armPump*3);
  ctx.stroke();
  ctx.strokeStyle="#e0b088"; ctx.lineWidth=3.6; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(-2.6,-12+armPump*3); ctx.lineTo(-2,-10+armPump*3); ctx.stroke();

  // neck + head
  ctx.fillStyle="#e0b088";
  ctx.fillRect(-3,-29,6,6);
  ctx.strokeStyle="rgba(0,0,0,0.1)"; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.moveTo(-2,-24.5); ctx.lineTo(2,-24.5); ctx.stroke(); // collarbone line
  ctx.beginPath(); ctx.arc(0,-34,7.5,0,Math.PI*2); ctx.fillStyle="#e6b98e"; ctx.fill();
  // face shading (cheek/jaw shadow)
  ctx.fillStyle="rgba(0,0,0,0.08)";
  ctx.beginPath(); ctx.arc(2,-32,6,0,Math.PI*2); ctx.fill();
  // hair tufts peeking from under the hat
  ctx.fillStyle="#4a3624";
  ctx.beginPath(); ctx.ellipse(-6,-36.5,1.6,2.4,0.5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-1,-40.5,3.2,1.4,0,0,Math.PI*2); ctx.fill();
  // ear with inner detail
  ctx.fillStyle="#d9a67e";
  ctx.beginPath(); ctx.ellipse(-6.5,-33,1.4,2,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,0.2)"; ctx.lineWidth=0.4;
  ctx.beginPath(); ctx.arc(-6.5,-33,0.7,0,Math.PI*2); ctx.stroke();
  // nose
  ctx.fillStyle="rgba(0,0,0,0.12)";
  ctx.beginPath(); ctx.moveTo(6.5,-33.5); ctx.quadraticCurveTo(7.6,-32.4,6.3,-31.8); ctx.lineTo(5.6,-32); ctx.closePath(); ctx.fill();
  // eye + brow (eyelid crease for more life)
  ctx.fillStyle="#2b2320";
  ctx.fillRect(2.5,-35,1.6,1.6);
  ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=0.4;
  ctx.beginPath(); ctx.moveTo(2.3,-35.2); ctx.lineTo(4.3,-35.2); ctx.stroke();
  ctx.strokeStyle="#5c4632"; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.moveTo(2,-36.5); ctx.lineTo(4.5,-36.8); ctx.stroke();
  // small smile line
  ctx.strokeStyle="rgba(120,80,60,0.6)"; ctx.lineWidth=0.7;
  ctx.beginPath(); ctx.moveTo(2,-31); ctx.quadraticCurveTo(3.5,-30.3,5,-31); ctx.stroke();
  // stubble/jaw shadow
  ctx.fillStyle="rgba(60,40,25,0.12)";
  ctx.beginPath(); ctx.ellipse(3,-30,3.4,1.6,0.2,0,Math.PI*2); ctx.fill();

  // bucket hat (shaded crown + stitched seams + grommet)
  ctx.fillStyle="#4d6b4a";
  ctx.beginPath(); ctx.ellipse(0,-40,9,3.4,0,0,Math.PI*2); ctx.fill(); // brim
  ctx.strokeStyle="rgba(0,0,0,0.15)"; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.ellipse(0,-40,9,3.4,0,0,Math.PI*2); ctx.stroke();
  const crownGrad = ctx.createLinearGradient(-6,-49,6,-40);
  crownGrad.addColorStop(0,"#699263"); crownGrad.addColorStop(1,"#4a6647");
  ctx.beginPath(); ctx.moveTo(-6,-40); ctx.quadraticCurveTo(0,-49,6,-40); ctx.closePath(); ctx.fillStyle=crownGrad; ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,0.18)"; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.moveTo(-3,-40.5); ctx.quadraticCurveTo(0,-47,3,-40.5); ctx.stroke(); // center seam
  ctx.fillStyle="#3d5539"; ctx.fillRect(-6,-41,12,1.6); // hat band
  ctx.fillStyle="#2c3f2a"; ctx.beginPath(); ctx.arc(-4.5,-44.5,0.6,0,Math.PI*2); ctx.fill(); // grommet vent
  // little lure pin tucked in the hat band
  ctx.strokeStyle="#c9a24a"; ctx.lineWidth=0.7;
  ctx.beginPath(); ctx.moveTo(4,-41); ctx.lineTo(4,-38); ctx.stroke();
  ctx.fillStyle="#ff8a5c"; ctx.beginPath(); ctx.arc(4,-37.4,0.8,0,Math.PI*2); ctx.fill();
  // sunglasses perched on the brim
  ctx.fillStyle="rgba(20,25,35,0.85)";
  ctx.beginPath(); ctx.ellipse(-2.6,-39.6,1.5,1.1,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(1.4,-39.6,1.5,1.1,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="#2b2320"; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.moveTo(-1.1,-39.6); ctx.lineTo(-0.1,-39.6); ctx.stroke();

  // front arm (extends toward rod grip) - vest sleeve + bare forearm
  const frontArmY = -19 + armPump*2;
  ctx.strokeStyle="#c9683c"; ctx.lineWidth=5; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(4,-20); ctx.lineTo(6,-20+ (frontArmY+20)*0.4); ctx.stroke();
  ctx.strokeStyle="#e0b088"; ctx.lineWidth=4.2; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(5.6,-20+(frontArmY+20)*0.35);
  ctx.lineTo(9,frontArmY);
  ctx.stroke();
  // wristband
  ctx.strokeStyle="#3a4a5c"; ctx.lineWidth=2.2;
  ctx.beginPath(); ctx.moveTo(7.6,frontArmY-1.2); ctx.lineTo(8.6,frontArmY+1); ctx.stroke();
  // hand with a couple of finger creases at the grip
  ctx.fillStyle="#e0b088";
  ctx.beginPath(); ctx.arc(9,frontArmY,2.2,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,0.2)"; ctx.lineWidth=0.4;
  ctx.beginPath(); ctx.moveTo(8,frontArmY-1.4); ctx.lineTo(10.2,frontArmY-0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(8,frontArmY+0.4); ctx.lineTo(10.2,frontArmY+1.2); ctx.stroke();

  // fishing rod (tapered, cork grip texture, line guides) + reel
  const rodBaseX=9, rodBaseY=frontArmY;
  const powerFlex = RT.phase==="charging" ? RT.power*8 : 0;
  const tensionFlex = RT.phase==="reeling" ? RT.tension*0.10 : 0;
  const rodTipLocalX = 34 + powerFlex*0.4;
  const rodTipLocalY = -30 - powerFlex - tensionFlex;

  // cork grip
  ctx.strokeStyle="#c9a878"; ctx.lineWidth=3.2; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(rodBaseX-3,rodBaseY+2); ctx.lineTo(rodBaseX+2,rodBaseY-1); ctx.stroke();
  ctx.strokeStyle="rgba(0,0,0,0.15)"; ctx.lineWidth=0.5;
  for(let i=0;i<3;i++){
    const t=i/2;
    ctx.beginPath();
    ctx.moveTo(rodBaseX-3+t*5-1, rodBaseY+2-t*3-1);
    ctx.lineTo(rodBaseX-3+t*5+1, rodBaseY+2-t*3+1);
    ctx.stroke();
  }
  // rod shaft
  ctx.strokeStyle="#7a5230"; ctx.lineWidth=2.2; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(rodBaseX,rodBaseY);
  ctx.quadraticCurveTo(rodBaseX+16,rodBaseY-10-powerFlex*0.5, rodTipLocalX, rodTipLocalY);
  ctx.stroke();
  // line guide rings along the rod
  ctx.strokeStyle="#d9c9a0"; ctx.lineWidth=0.6;
  [0.3,0.55,0.8].forEach(t=>{
    const gx = lerp(rodBaseX, rodTipLocalX, t);
    const gy = lerp(rodBaseY-2, rodTipLocalY, t) - Math.sin(t*Math.PI)*4;
    ctx.beginPath(); ctx.ellipse(gx,gy,0.9,1.3,0.3,0,Math.PI*2); ctx.stroke();
  });
  // reel with wound line texture + handle crank
  ctx.fillStyle="#2b2320";
  ctx.beginPath(); ctx.arc(rodBaseX-1,rodBaseY+3,2.8,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="#c9a24a"; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.arc(rodBaseX-1,rodBaseY+3,2.8,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,0.25)"; ctx.lineWidth=0.4;
  for(let i=0;i<3;i++){ ctx.beginPath(); ctx.arc(rodBaseX-1,rodBaseY+3,1.2+i*0.5,0,Math.PI*1.4); ctx.stroke(); }
  const crankAngle = now*0.006;
  ctx.strokeStyle="#8a8f96"; ctx.lineWidth=0.7;
  ctx.beginPath();
  ctx.moveTo(rodBaseX-1,rodBaseY+3);
  ctx.lineTo(rodBaseX-1+Math.cos(crankAngle)*3.4, rodBaseY+3+Math.sin(crankAngle)*3.4);
  ctx.stroke();
  ctx.fillStyle="#c0c4c9";
  ctx.beginPath(); ctx.arc(rodBaseX-1+Math.cos(crankAngle)*3.4, rodBaseY+3+Math.sin(crankAngle)*3.4, 0.6,0,Math.PI*2); ctx.fill();

  ctx.restore();

  // convert rod tip to world space (account for the slight lean rotation)
  const theta = -leaning*0.08;
  const wx = rodTipLocalX*Math.cos(theta) - rodTipLocalY*Math.sin(theta);
  const wy = rodTipLocalX*Math.sin(theta) + rodTipLocalY*Math.cos(theta);
  RT._rodTip = { x: ax + wx, y: ay + wy };
}
function drawBobberAndLine(w,h,waterY,now){
  if(RT.phase==="idle" || RT.phase==="charging") return;
  const rod = RT._rodTip || {x:w*0.13,y:waterY-46};
  let bx,by;
  if(RT.phase==="flying"){
    const t = clamp(RT.bobber.t,0,1);
    bx = lerp(rod.x, RT.bobber.targetX*w, t);
    by = lerp(rod.y, waterY - Math.sin(t*Math.PI)*60, t);
  } else {
    bx = RT.bobber.targetX*w;
    by = waterY + Math.sin(now*0.006+RT.bobber.bobPhase)*3;
    if(RT.phase==="reeling"){
      by = waterY + Math.sin(now*0.01)*2;
      bx = lerp(w*0.2, RT.bobber.targetX*w, RT.distance/100);
    }
  }
  ctx.strokeStyle="rgba(255,255,255,0.55)";
  ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(rod.x,rod.y); ctx.lineTo(bx,by); ctx.stroke();

  if(RT.phase!=="reeling"){
    ctx.beginPath(); ctx.arc(bx,by,6,0,Math.PI*2);
    ctx.fillStyle="#ff5d5d"; ctx.fill();
    ctx.beginPath(); ctx.arc(bx,by-3,6,Math.PI,0);
    ctx.fillStyle="#f5f5f5"; ctx.fill();
  }
  RT.bobber.screenX=bx; RT.bobber.screenY=by;
}
function drawFightingFish(w,h,waterY,now){
  const fish = RT.currentFish;
  const bx = RT.bobber.screenX||w*0.5, by = RT.bobber.screenY||waterY;
  const jump = Math.max(0, Math.sin(now*0.01)) * (RT.tension>60?18:6);
  const facing = Math.sin(now*0.004)>0 ? 1 : -1;
  ctx.save();
  ctx.translate(bx, by+10-jump);
  const scale = (RT.isBoss?2.1:1) * (0.9+fish.strength*0.03) * (fish.sizeScale||1);
  ctx.scale(scale*facing, scale);
  drawFishFull(ctx, fish, now*0.003);
  ctx.restore();

  // splash rings while thrashing
  if(RT.tension>50){
    ctx.save();
    ctx.strokeStyle="rgba(255,255,255,0.35)";
    ctx.lineWidth=1.5;
    const r = ((now*0.05)%20);
    ctx.beginPath(); ctx.ellipse(bx,by+8,r,r*0.35,0,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }
}

/* =========================================================================
   MAIN LOOP
   ========================================================================= */
let lastTime = performance.now();
function tick(now){
  const dt = Math.min(50, now-lastTime);
  lastTime = now;

  if(!RT.paused){
    RT.dayNight += dt/240000; // full cycle ~4 minutes
    if(RT.dayNight>1) RT.dayNight-=1;

    updateCharge();

    if(RT.phase==="flying"){
      RT.bobber.t += dt/380;
      if(RT.bobber.t>=1){
        RT.bobber.t=1; RT.phase="waiting";
        onBobberLanded();
      }
    } else if(RT.phase==="waiting"){
      RT.biteTimer -= dt;
      if(RT.biteTimer<=0) triggerBite();
    } else if(RT.phase==="biting"){
      RT.hookWindowLeft -= dt;
      if(RT.hookWindowLeft<=0) onHookMissed();
    } else if(RT.phase==="reeling"){
      updateReel(dt);
    }

    updateParticles(dt);
    maybeTriggerEvent();
    updateEvent();
    updateMarketRecovery(dt);
  }

  render(now);
  requestAnimationFrame(tick);
}

/* =========================================================================
   INIT
   ========================================================================= */
async function loadClassQuestions(){
  const status=$("questionBankStatus"),button=$("homeStartBtn");button.disabled=true;
  const result=await QuestionManager.loadCurrentBank(QUESTION_TYPE);
  questionBankReady=!!result.ok;status.classList.toggle("error",!result.ok);
  status.textContent=result.ok?`Class questions ready · ${QuestionManager.getBankName()}`:(result.error==="class-code-required"?"Please enter your class code on the Arcade Academy Hub.":"This class does not have compatible multiple-choice questions for this game.");
  button.disabled=!result.ok;
}
async function init(){
  resizeCanvas();
  loadGame();
  refreshHUD();
  scheduleNextEvent();
  $("homeScreen").classList.add("show");
  startHomeFishAnim();
  await loadClassQuestions();
}
function startGame(){
  if(!questionBankReady)return;
  challengeRunCaught=0;
  stopHomeFishAnim();
  $("homeScreen").classList.remove("show");
  RT.paused=false;gameStarted=true;
  if(!platformSessionStarted){PlatformManager.startSession(GAME_ID);platformSessionStarted=true;}
  showBanner("Answer a question to load your first cast.");
  if(!animationLoopStarted){animationLoopStarted=true;requestAnimationFrame((t)=>{lastTime=t;requestAnimationFrame(tick);});}
}
function returnToArcadeAcademy(){
  window.location.href = "../../index.html";
}
setInterval(()=>PlatformManager.heartbeat(GAME_ID,gameStarted&&!RT.paused&&RT.phase!=="idle"),1000);
init();

})();
