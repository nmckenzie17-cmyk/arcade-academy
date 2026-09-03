/* =========================================================================================
   SHOOTER STUDYING - top-down tactical battle royale
   Split into index.html / style.css / game.js, matching the Arcade Academy structure. Wire
   this up to PlatformManager.js + QuestionManager.js when folding it into the platform -
   search for "QUESTION SYSTEM" below, it's intentionally isolated so the placeholder bank
   can be swapped for the real QuestionManager without touching gameplay code.
   ========================================================================================= */

// ------------------------------------------------------------------------------------------
// 1. CONFIG - WEAPONS
// ------------------------------------------------------------------------------------------
const WEAPON_CONFIG = {
  pistol: {
    id:'pistol', name:'Pistol', unlockCost:0, color:'#8fd3ff',
    damage:13, range:170, fireRate:2.4, coneWidth:24, magazineSize:12,
    projectileSpeed:820, spread:2, pellets:1, movementModifier:1, reloadTime:1.0,
    visionRange:190, visionAngle:72, peripheralVisionRange:35, visionFalloff:60,
    detectRadius:260, // how far gunfire is heard by enemies
    compatibleUpgrades:['extendedMag','silencer','improvedBarrel'],
    desc:'Short range, short sight. Safe in a pinch, but you\'re fighting half-blind.'
  },
  smg: {
    id:'smg', name:'SMG', unlockCost:35, color:'#8fffb0',
    damage:7, range:250, fireRate:10, coneWidth:44, magazineSize:32,
    projectileSpeed:900, spread:6, pellets:1, movementModifier:1.05, reloadTime:1.6,
    visionRange:300, visionAngle:100, peripheralVisionRange:110, visionFalloff:70,
    detectRadius:340,
    compatibleUpgrades:['extendedMag','stock','silencer'],
    desc:'Wide awareness up close, weak scouting range. Hoses ammo fast.'
  },
  shotgun: {
    id:'shotgun', name:'Shotgun', unlockCost:55, color:'#ffb15c',
    damage:8, range:170, fireRate:1.1, coneWidth:36, magazineSize:6,
    projectileSpeed:760, spread:16, pellets:7, movementModifier:0.95, reloadTime:2.0,
    visionRange:150, visionAngle:150, peripheralVisionRange:330, visionFalloff:40,
    detectRadius:420,
    compatibleUpgrades:['choke','improvedBarrel','stock'],
    desc:'Huge angle, tiny distance. Sees almost everything nearby, nothing far.'
  },
  assaultRifle: {
    id:'assaultRifle', name:'Assault Rifle', unlockCost:110, color:'#ffd15c',
    damage:11, range:460, fireRate:6.5, coneWidth:20, magazineSize:28,
    projectileSpeed:1100, spread:3, pellets:1, movementModifier:1, reloadTime:1.9,
    visionRange:420, visionAngle:55, peripheralVisionRange:60, visionFalloff:80,
    detectRadius:400,
    compatibleUpgrades:['scope','extendedMag','stock'],
    desc:'The versatile middle ground between Pistol and Sniper.'
  },
  lmg: {
    id:'lmg', name:'LMG', unlockCost:200, color:'#ff8f8f',
    damage:9, range:420, fireRate:7.5, coneWidth:32, magazineSize:70,
    projectileSpeed:1000, spread:5, pellets:1, movementModifier:0.78, reloadTime:2.8,
    visionRange:380, visionAngle:80, peripheralVisionRange:50, visionFalloff:70,
    detectRadius:460,
    compatibleUpgrades:['extendedMag','stock','improvedBarrel'],
    desc:'Massive magazine, slows you down. Vision narrows further while firing.'
  },
  sniper: {
    id:'sniper', name:'Sniper Rifle', unlockCost:240, color:'#c58fff',
    damage:90, range:920, fireRate:0.8, coneWidth:5, magazineSize:4,
    projectileSpeed:1800, spread:0.3, pellets:1, movementModifier:0.9, reloadTime:2.4,
    visionRange:1000, visionAngle:9, peripheralVisionRange:9, visionFalloff:150,
    detectRadius:520,
    compatibleUpgrades:['scope','silencer','improvedBarrel'],
    desc:'Enormous distance, razor-thin angle. Blind to anything beside you.'
  }
};
const WEAPON_ORDER = ['pistol','smg','shotgun','assaultRifle','lmg','sniper'];

// ------------------------------------------------------------------------------------------
// 2. CONFIG - ATTACHMENTS/UPGRADES
// ------------------------------------------------------------------------------------------
const UPGRADE_CONFIG = {
  scope:          { id:'scope', name:'Scope', duration:45,
                     apply:(s)=>({ ...s, range:s.range*1.3, visionRange:s.visionRange*1.25, visionAngle:s.visionAngle*0.9 }) },
  extendedMag:    { id:'extendedMag', name:'Extended Magazine', duration:50,
                     apply:(s)=>({ ...s, magazineSize:Math.round(s.magazineSize*1.5) }) },
  stock:          { id:'stock', name:'Stock', duration:45,
                     apply:(s)=>({ ...s, coneWidth:s.coneWidth*0.7, spread:s.spread*0.6 }) },
  silencer:       { id:'silencer', name:'Silencer', duration:45,
                     apply:(s)=>({ ...s, detectRadius:s.detectRadius*0.35 }) },
  improvedBarrel: { id:'improvedBarrel', name:'Improved Barrel', duration:40,
                     apply:(s)=>({ ...s, damage:s.damage*1.3, projectileSpeed:s.projectileSpeed*1.15 }) },
  choke:          { id:'choke', name:'Choke', duration:40,
                     apply:(s)=>({ ...s, spread:s.spread*0.5, range:s.range*1.2, coneWidth:s.coneWidth*0.75 }) }
};

const TOMBSTONE_CONFIG = [
  {id:'iron_cross',name:'Iron Cross',cost:25,desc:'A battle-worn iron memorial.'},
  {id:'western_wood',name:'Frontier Marker',cost:40,desc:'A rough wooden marker with a sheriff star.'},
  {id:'field_skull',name:'Skull Warning',cost:60,desc:'A grim warning to the next squad.'},
  {id:'academy_book',name:'Scholar’s Rest',cost:80,desc:'An open book beneath the marker.'},
  {id:'neon_pulse',name:'Neon Memorial',cost:110,desc:'A cyan marker with a pulsing core.'},
  {id:'samurai_stone',name:'Ronin Shrine',cost:140,desc:'A stone shrine marked by crossed blades.'},
  {id:'crystal_spire',name:'Crystal Spire',cost:175,desc:'A luminous violet crystal monument.'},
  {id:'golden_hero',name:'Golden Hero',cost:220,desc:'A polished monument for a worthy rival.'},
  {id:'flame_altar',name:'Eternal Flame',cost:275,desc:'A dark altar carrying an endless flame.'},
  {id:'void_obelisk',name:'Void Obelisk',cost:350,desc:'An ancient obelisk swallowing nearby light.'}
];

const ACTIVE_POWERUPS = {
  scan:{name:'Recon Pulse',duration:5,desc:'Reveals nearby enemies and objectives.'},
  smoke:{name:'Smoke Screen',duration:7,desc:'Enemies cannot see you inside the cloud.'},
  dash:{name:'Combat Dash',duration:0,desc:'Burst quickly toward your aim direction.'},
  decoy:{name:'Sound Decoy',duration:8,desc:'Creates gunfire that draws investigating enemies.'}
};
const DEPLOYABLE_ITEMS = {
  medkit:{name:'Medkit',desc:'Restore 45 health.'},
  armour:{name:'Armour Plate',desc:'Absorb the next 40 damage.'},
  shield:{name:'Shield Projector',desc:'Deploy an eight-second protective field.'}
};

// ------------------------------------------------------------------------------------------
// 3. CONFIG - ENEMY ARCHETYPES
// ------------------------------------------------------------------------------------------
const ENEMY_CONFIG = {
  grunt:      { id:'grunt', name:'Grunt', hp:26, speed:70, damage:8, fireRate:1.5, range:220,
                visionRange:260, visionAngle:80, hearingRange:220, color:'#ff8a8a', xp:1 },
  rusher:     { id:'rusher', name:'Rusher', hp:18, speed:150, damage:13, fireRate:0, range:34, melee:true,
                visionRange:230, visionAngle:100, hearingRange:260, color:'#ff5c5c', xp:1 },
  shotgunner: { id:'shotgunner', name:'Shotgunner', hp:34, speed:80, damage:7, fireRate:1.1, range:150, pellets:5,
                visionRange:200, visionAngle:110, hearingRange:200, color:'#ffb15c', xp:1 },
  rifleman:   { id:'rifleman', name:'Rifleman', hp:30, speed:65, damage:10, fireRate:2.8, range:340,
                visionRange:340, visionAngle:60, hearingRange:260, color:'#ffd15c', xp:2 },
  sniper:     { id:'sniper', name:'Sniper', hp:22, speed:50, damage:28, fireRate:0.65, range:600,
                visionRange:600, visionAngle:20, hearingRange:200, color:'#c58fff', xp:2, stationary:true, silenced:true },
  heavy:      { id:'heavy', name:'Heavy', hp:90, speed:45, damage:18, fireRate:1.9, range:260,
                visionRange:260, visionAngle:70, hearingRange:260, color:'#ff4444', xp:3 },
  flanker:    { id:'flanker', name:'Flanker', hp:22, speed:120, damage:9, fireRate:2.1, range:180,
                visionRange:280, visionAngle:100, hearingRange:280, color:'#5cffe0', xp:2, flanks:true, silenced:true },
  guard:      { id:'guard', name:'Guard', hp:44, speed:55, damage:10, fireRate:1.5, range:240,
                visionRange:240, visionAngle:90, hearingRange:220, color:'#8f9dff', xp:2, patrolTight:true },
  brawler:    { id:'brawler', name:'Brawler', hp:70, speed:60, damage:20, fireRate:0, range:40, melee:true,
                visionRange:230, visionAngle:80, hearingRange:220, color:'#c97b3d', xp:2 },
  marksman:   { id:'marksman', name:'Marksman', hp:26, speed:85, damage:16, fireRate:1.4, range:420,
                visionRange:400, visionAngle:50, hearingRange:240, color:'#5cd6c0', xp:2 },
  scout:      { id:'scout', name:'Scout', hp:16, speed:140, damage:5, fireRate:1.6, range:160,
                visionRange:340, visionAngle:130, hearingRange:340, color:'#d6e85c', xp:1 }
};
// Bullet/gunfire alert radius bump - hearingRange drives both how far an enemy notices
// someone else's gunfire (see the heardPos detection in Enemy.update) and, via
// gunfireVisRadius below, how large the visual "bang" ping is when THIS enemy fires. Bumping
// it here makes gunfire alerts carry further in both directions at once, and means rival
// squads are more likely to actually notice each other fighting and converge.
Object.values(ENEMY_CONFIG).forEach(cfg=>{ cfg.hearingRange = Math.round(cfg.hearingRange*1.45); });
const NORMAL_ARCHETYPES = ['grunt','rusher','shotgunner','rifleman','sniper','heavy','flanker','guard','brawler','marksman','scout'];

// ------------------------------------------------------------------------------------------
// 3b. CONFIG - SQUAD GROUP BEHAVIOURS
//    Three roaming 4-enemy squads spawn each floor, independent of room encounters. Each squad
//    draws one of these 10 presets at random. Behaviour is expressed as tunable numeric knobs
//    (roamRadius, gunfireAttraction, packTightness, aggression, retreatOnLowHP, holdGround)
//    rather than bespoke per-behaviour code, so new behaviours are just new config entries -
//    consistent with the rest of this file's config-driven approach.
// ------------------------------------------------------------------------------------------
const GROUP_BEHAVIORS = [
  { id:'aggressive_push', name:'Aggressive Push', roamRadius:260, gunfireAttraction:0.55, packTightness:0.3, aggression:1.4, retreatOnLowHP:false, holdGround:false },
  { id:'wide_patrol',     name:'Wide Patrol',      roamRadius:900, gunfireAttraction:0.15, packTightness:0.15, aggression:0.9, retreatOnLowHP:false, holdGround:false },
  { id:'perimeter_guard', name:'Perimeter Guard',  roamRadius:140, gunfireAttraction:0.1,  packTightness:0.6, aggression:0.8, retreatOnLowHP:false, holdGround:true },
  { id:'ambush',          name:'Ambush',           roamRadius:60,  gunfireAttraction:0.25, packTightness:0.8, aggression:1.6, retreatOnLowHP:false, holdGround:false, ambush:true },
  { id:'pack_hunt',       name:'Pack Hunt',        roamRadius:500, gunfireAttraction:0.4,  packTightness:0.75, aggression:1.2, retreatOnLowHP:false, holdGround:false },
  { id:'scavenge',        name:'Scavenge',         roamRadius:700, gunfireAttraction:0.05, packTightness:0.1, aggression:0.6, retreatOnLowHP:false, holdGround:false },
  { id:'bloodhound',      name:'Bloodhound',       roamRadius:600, gunfireAttraction:0.9,  packTightness:0.4, aggression:1.1, retreatOnLowHP:false, holdGround:false },
  { id:'fortify',         name:'Fortify',          roamRadius:100, gunfireAttraction:0.05, packTightness:0.5, aggression:0.7, retreatOnLowHP:false, holdGround:true },
  { id:'flank_march',     name:'Flank March',      roamRadius:1000,gunfireAttraction:0.3,  packTightness:0.2, aggression:1.0, retreatOnLowHP:false, holdGround:false, edgePreference:true },
  { id:'retreat_regroup', name:'Retreat & Regroup',roamRadius:400, gunfireAttraction:0.35, packTightness:0.85, aggression:1.0, retreatOnLowHP:true, holdGround:false }
];
function pickGroupBehavior(){ return GROUP_BEHAVIORS[Math.floor(Math.random()*GROUP_BEHAVIORS.length)]; }
const FOOTPRINT_MAX_AGE = 26000; // ms a footprint stays visible in explored fog - long enough to actually function as a trackable trail

// ------------------------------------------------------------------------------------------
// 4. QUESTION SYSTEM - shared Arcade Academy question flow
// ------------------------------------------------------------------------------------------
class ShooterQuestionFlow{
  constructor(game){ this.game = game; this.active = false; }

  // Called when the player walks over an ammo pickup. Pauses the game, asks 4 questions,
  // then awards ammo scaled to the current weapon's magazine size.
  async startAmmoQuestionPhase(onComplete){
    this.active = true;
    this.game.paused = true;
    window.PlatformManager?.heartbeat?.(GAME_CONFIG.id, false);
    const result = await window.MixedQuestionRound.play();
    const correctCount = result.correct || 0;
    this.game.stats.questionsAnswered += result.total || 0;
    this.game.stats.questionsCorrect += correctCount;
    if(correctCount) window.AchievementManager?.notify?.('shooter_studying_correct', {amount:correctCount});
    const ammoAwarded = this.awardAmmo(correctCount);
    this.active = false;
    this.game.paused = false;
    onComplete?.(ammoAwarded, correctCount);
  }

  // Called when the player walks over a compatible weapon attachment. Single question.
  async startUpgradeQuestion(upgrade, onComplete){
    this.active = true;
    this.game.paused = true;
    window.PlatformManager?.heartbeat?.(GAME_CONFIG.id, false);
    const result = await window.MixedQuestionRound.play();
    const correct = (result.correct || 0) === (result.total || 4);
    this.game.stats.questionsAnswered += result.total || 0;
    this.game.stats.questionsCorrect += result.correct || 0;
    if(result.correct) window.AchievementManager?.notify?.('shooter_studying_correct', {amount:result.correct});
    this.active = false;
    this.game.paused = false;
    onComplete?.(correct);
  }

  async startDeployableQuestion(reward, onComplete){
    this.active=true;this.game.paused=true;
    window.PlatformManager?.heartbeat?.(GAME_CONFIG.id,false);
    const result=await window.MixedQuestionRound.play();
    const earned=(result.correct||0)>0;
    this.game.stats.questionsAnswered+=result.total||0;
    this.game.stats.questionsCorrect+=result.correct||0;
    if(result.correct)window.AchievementManager?.notify?.('shooter_studying_correct',{amount:result.correct});
    this.active=false;this.game.paused=false;
    onComplete?.(earned,result);
  }

  // ammo table: 1 correct=0.5 mag, 2=1 mag, 3=1.5 mag, 4=2 mag, 0=nothing.
  // Ammo earned goes into the reserve pool, not straight into the magazine - matches every
  // other ammo source (chests, ammo pickups) and means it's actually visible as "spare rounds"
  // rather than mysteriously topping up a magazine that's already full.
  awardAmmo(correctCount){
    const mag = this.game.player.weaponStats.magazineSize;
    const table = {0:0, 1:0.5, 2:1, 3:1.5, 4:2};
    const amount = Math.round(mag * table[correctCount]);
    this.game.player.reserveAmmo = Math.min(this.game.player.reserveAmmo + amount, mag * 6);
    return amount;
  }
}

// ------------------------------------------------------------------------------------------
// 5. ROOM TEMPLATES + MAP GENERATION
//    Each template is a function(w,h) -> array of wall rects (relative to room origin 0,0)
//    describing interior obstacles. Templates can be mirrored/flipped when placed.
// ------------------------------------------------------------------------------------------
const ROOM_W = 420, ROOM_H = 340; // room cell size in world units
const CORRIDOR_W = 90;

function tEmpty(w,h){ return []; }
function tPillars(w,h){
  return [
    {x:w*0.25-14,y:h*0.3-14,w:28,h:28}, {x:w*0.75-14,y:h*0.3-14,w:28,h:28},
    {x:w*0.25-14,y:h*0.7-14,w:28,h:28}, {x:w*0.75-14,y:h*0.7-14,w:28,h:28}
  ];
}
function tCross(w,h){
  return [ {x:w*0.5-70,y:h*0.5-14,w:140,h:28}, {x:w*0.5-14,y:h*0.5-70,w:28,h:140} ];
}
function tCrates(w,h){
  // enforce minimum spacing between crates - unconstrained random placement could let several
  // crates cluster together by chance and form an accidental blockade, especially right in
  // front of a doorway.
  const boxes=[];
  let tries=0;
  while(boxes.length<5 && tries<60){
    tries++;
    const bx = 40+Math.random()*(w-120), by = 40+Math.random()*(h-120);
    const tooClose = boxes.some(b=>Math.hypot(b.x-bx,b.y-by) < 95);
    if(!tooClose) boxes.push({x:bx, y:by, w:36, h:36});
  }
  return boxes;
}
function tRing(w,h){
  // a ring of cover with a doorway gap in the bottom edge - previously this fully sealed
  // the centre of the room (all four bars overlapped at the corners with no opening), which
  // could trap a pickup inside with no way to reach it.
  return [
    {x:w*0.5-90,y:h*0.5-90,w:180,h:20},                 // top
    {x:w*0.5-90,y:h*0.5+70,w:60,h:20},                  // bottom-left segment
    {x:w*0.5+30,y:h*0.5+70,w:60,h:20},                  // bottom-right segment (30px gap between them)
    {x:w*0.5-90,y:h*0.5-90,w:20,h:180},                 // left
    {x:w*0.5+70,y:h*0.5-90,w:20,h:180}                  // right
  ];
}
function tZigzag(w,h){
  return [
    {x:0,y:h*0.33,w:w*0.65,h:22}, {x:w*0.35,y:h*0.66,w:w*0.65,h:22}
  ];
}
function tCornerCover(w,h){
  return [
    {x:20,y:20,w:50,h:50}, {x:w-70,y:20,w:50,h:50}, {x:20,y:h-70,w:50,h:50}, {x:w-70,y:h-70,w:50,h:50}
  ];
}
function tNarrowMaze(w,h){
  return [
    {x:w*0.2,y:0,w:22,h:h*0.6}, {x:w*0.5,y:h*0.4,w:22,h:h*0.6}, {x:w*0.8,y:0,w:22,h:h*0.6}
  ];
}
function tOpenHall(w,h){
  // two stub walls with a central gap you pass through. The gap needs to stay comfortably
  // wider than the player's diameter plus wall clearance on both sides - a too-tight gap can
  // fall through the cracks of the coarse reachability grid used to validate spawn points.
  return [ {x:w*0.5-11,y:0,w:22,h:h*0.28}, {x:w*0.5-11,y:h*0.72,w:22,h:h*0.28} ];
}
function tScatter(w,h){
  // same minimum-spacing rule as tCrates, for the same reason.
  const boxes=[];
  let tries=0;
  while(boxes.length<7 && tries<80){
    tries++;
    const bx = 30+Math.random()*(w-90), by = 30+Math.random()*(h-90);
    const bw = 24+Math.random()*20, bh = 24+Math.random()*20;
    const tooClose = boxes.some(b=>Math.hypot(b.x-bx,b.y-by) < 85);
    if(!tooClose) boxes.push({x:bx, y:by, w:bw, h:bh});
  }
  return boxes;
}
function tDiagonalCover(w,h){
  return [ {x:w*0.15,y:h*0.2,w:60,h:22}, {x:w*0.45,y:h*0.45,w:60,h:22}, {x:w*0.75,y:h*0.7,w:60,h:22} ];
}
function tBossArena(w,h){
  return [ {x:w*0.5-100,y:h*0.5-100,w:200,h:20}, {x:w*0.5-100,y:h*0.5+80,w:200,h:20} ];
}

const ROOM_TEMPLATES = [tEmpty,tPillars,tCross,tCrates,tRing,tZigzag,tCornerCover,tNarrowMaze,tOpenHall,tScatter,tDiagonalCover,tCrates,tScatter];

const ROOM_TYPES = ['combat','combat','combat','ammo','weapon','upgrade','elite','safe'];

// ------------------------------------------------------------------------------------------
// 4b. MAP THEMES - 10 distinct visual/structural styles. Each theme recolours the floor and
//     walls, scales room/corridor size (roomMult, corridorMult applied to the ROOM_W/ROOM_H/
//     CORRIDOR_W base constants above), and draws its room interiors from its own preferred
//     subset of ROOM_TEMPLATES (`templates`) - so a theme has a genuinely different layout
//     character too, not just a different paint job. E.g. Bunker leans on tight mazes and
//     corner cover, Desert leans on open halls and sparse scatter.
// ------------------------------------------------------------------------------------------
const MAP_THEMES = [
  { id:'industrial',  name:'Industrial Facility', floorBg:'#0a0d10', gridColor:'rgba(120,150,170,0.08)',
    wallFill:'#4a6580', wallHi:'rgba(255,255,255,0.16)', wallShadow:'rgba(0,0,0,0.4)', wallOutline:'#9fc3e0',
    roomMult:1.0, corridorMult:1.0, templates:[tPillars,tCross,tCrates,tCornerCover] },
  { id:'desert',       name:'Desert Outpost', floorBg:'#1a1408', gridColor:'rgba(210,175,110,0.08)',
    wallFill:'#8a6a3e', wallHi:'rgba(255,240,200,0.2)', wallShadow:'rgba(30,15,0,0.45)', wallOutline:'#e0c68f',
    roomMult:1.15, corridorMult:1.25, templates:[tOpenHall,tScatter,tEmpty,tDiagonalCover] },
  { id:'arctic',       name:'Arctic Base', floorBg:'#0a1319', gridColor:'rgba(150,205,225,0.1)',
    wallFill:'#5f7f92', wallHi:'rgba(255,255,255,0.32)', wallShadow:'rgba(0,15,25,0.4)', wallOutline:'#cdeaf5',
    roomMult:0.9, corridorMult:0.85, templates:[tNarrowMaze,tOpenHall,tZigzag,tCornerCover] },
  { id:'jungle',       name:'Jungle Ruins', floorBg:'#0d140a', gridColor:'rgba(110,165,80,0.09)',
    wallFill:'#3f5c2e', wallHi:'rgba(200,255,160,0.22)', wallShadow:'rgba(0,10,0,0.45)', wallOutline:'#9fd67a',
    roomMult:1.05, corridorMult:1.3, templates:[tScatter,tCrates,tRing,tDiagonalCover] },
  { id:'neon',         name:'Neon City', floorBg:'#0c0616', gridColor:'rgba(190,90,255,0.11)',
    wallFill:'#3a2158', wallHi:'rgba(230,150,255,0.3)', wallShadow:'rgba(0,0,10,0.5)', wallOutline:'#c58fff',
    roomMult:0.95, corridorMult:0.95, templates:[tNarrowMaze,tZigzag,tCross,tRing] },
  { id:'bunker',       name:'Underground Bunker', floorBg:'#0e0c0a', gridColor:'rgba(150,130,100,0.06)',
    wallFill:'#5a4a3a', wallHi:'rgba(220,200,170,0.14)', wallShadow:'rgba(0,0,0,0.5)', wallOutline:'#b5a082',
    roomMult:0.8, corridorMult:0.7, templates:[tNarrowMaze,tCornerCover,tCross,tPillars] },
  { id:'volcanic',     name:'Volcanic Complex', floorBg:'#140505', gridColor:'rgba(255,110,60,0.08)',
    wallFill:'#5c2a1e', wallHi:'rgba(255,150,90,0.28)', wallShadow:'rgba(0,0,0,0.5)', wallOutline:'#ff8f5c',
    roomMult:1.0, corridorMult:0.9, templates:[tDiagonalCover,tScatter,tRing,tOpenHall] },
  { id:'station',      name:'Space Station', floorBg:'#070b12', gridColor:'rgba(150,190,230,0.1)',
    wallFill:'#3a4a5e', wallHi:'rgba(255,255,255,0.34)', wallShadow:'rgba(0,5,15,0.45)', wallOutline:'#a9d8ff',
    roomMult:1.1, corridorMult:1.05, templates:[tPillars,tCross,tCornerCover,tRing] },
  { id:'swamp',        name:'Swamp Facility', floorBg:'#0c110a', gridColor:'rgba(130,150,90,0.07)',
    wallFill:'#3e4a2e', wallHi:'rgba(180,200,120,0.16)', wallShadow:'rgba(0,10,0,0.5)', wallOutline:'#a8bd7a',
    roomMult:1.2, corridorMult:1.35, templates:[tScatter,tCrates,tZigzag,tDiagonalCover] },
  { id:'fortress',     name:'Crimson Fortress', floorBg:'#120608', gridColor:'rgba(200,60,70,0.08)',
    wallFill:'#5c1e28', wallHi:'rgba(255,120,130,0.22)', wallShadow:'rgba(0,0,0,0.5)', wallOutline:'#ff6b7a',
    roomMult:0.95, corridorMult:0.75, templates:[tRing,tCornerCover,tCross,tPillars] }
];
function pickMapTheme(){ return MAP_THEMES[Math.floor(Math.random()*MAP_THEMES.length)]; }

class MapManager{
  constructor(floorNumber, gridSize, theme){
    this.floorNumber = floorNumber;
    this.gridSize = gridSize; // e.g. 5 -> 5x5 grid of cells, not all used
    this.theme = theme || MAP_THEMES[0];
    // theme-scaled room/corridor dimensions - room templates already work in percentages of
    // w/h so they scale cleanly; only a couple of fixed-size obstacles (e.g. pillar width)
    // don't scale, which is fine, they just read as relatively smaller in a bigger room.
    this.roomW = Math.round(ROOM_W * this.theme.roomMult);
    this.roomH = Math.round(ROOM_H * this.theme.roomMult);
    this.corridorW = Math.round(CORRIDOR_W * this.theme.corridorMult);
    this.cellW = this.roomW + this.corridorW;
    this.cellH = this.roomH + this.corridorW;
    this.rooms = []; // {gx,gy,x,y,w,h,type,walls:[],cleared:false}
    this.walls = []; // world-space rects, all obstacles (room walls + corridor walls)
    this.worldW = this.gridSize*this.cellW + 200;
    this.worldH = this.gridSize*this.cellH + 200;
    this.exit = null;
    this._generate();
  }

  _generate(){
    // random walk to place N rooms on a grid, guarantees connectivity
    const n = 7 + Math.min(this.floorNumber, 5); // more rooms on deeper floors
    const visited = new Set();
    const start = {gx: Math.floor(this.gridSize/2), gy: Math.floor(this.gridSize/2)};
    let cur = start;
    visited.add(`${cur.gx},${cur.gy}`);
    const cells = [cur];
    const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    while(cells.length < n){
      const d = dirs[Math.floor(Math.random()*dirs.length)];
      const nx = cur.gx + d.dx, ny = cur.gy + d.dy;
      if(nx<0||ny<0||nx>=this.gridSize||ny>=this.gridSize){ cur = cells[Math.floor(Math.random()*cells.length)]; continue; }
      const key = `${nx},${ny}`;
      if(!visited.has(key)){
        visited.add(key);
        cells.push({gx:nx,gy:ny});
      }
      cur = {gx:nx,gy:ny};
    }

    // assign types: first cell = start(safe), last = exit(boss-ish elite), rest random with at least one of each key type
    const typesToAssign = ['safe'];
    const pool = ['combat','ammo','combat','ammo','ammo','upgrade','elite','combat','ammo'];
    for(let i=1;i<cells.length-1;i++) typesToAssign.push(pool[i % pool.length]);
    typesToAssign.push('boss');
    while(typesToAssign.length < cells.length) typesToAssign.push('combat');

    cells.forEach((c,i)=>{
      // draw from the current theme's preferred template subset when it has one, so a
      // theme's rooms have a distinct layout character rather than just different colours
      const templatePool = (this.theme && this.theme.templates && this.theme.templates.length) ? this.theme.templates : ROOM_TEMPLATES;
      const tmpl = templatePool[Math.floor(Math.random()*templatePool.length)];
      const w = this.roomW, h = this.roomH;
      const x = 100 + c.gx*this.cellW;
      const y = 100 + c.gy*this.cellH;
      const room = {
        gx:c.gx, gy:c.gy, x, y, w, h,
        type: typesToAssign[i] || 'combat',
        interior: tmpl(w,h),
        cleared: false,
        spawnedPickup: false
      };
      this.rooms.push(room);
    });

    // build wall rects: perimeter of each room (with door gaps toward connected neighbours) + interior obstacles
    const cellKey = (gx,gy)=>`${gx},${gy}`;
    const roomAt = {};
    this.rooms.forEach(r=> roomAt[cellKey(r.gx,r.gy)] = r);

    this.rooms.forEach(room=>{
      const neighbours = { n:false,s:false,e:false,w:false };
      if(roomAt[cellKey(room.gx+1,room.gy)]) neighbours.e = true;
      if(roomAt[cellKey(room.gx-1,room.gy)]) neighbours.w = true;
      if(roomAt[cellKey(room.gx,room.gy+1)]) neighbours.s = true;
      if(roomAt[cellKey(room.gx,room.gy-1)]) neighbours.n = true;
      const wallT = 16, doorGap = this.corridorW;
      const wx = room.x, wy = room.y, ww = room.w, wh = room.h;
      // top wall
      if(neighbours.n){
        this.walls.push({x:wx,y:wy-wallT,w:ww/2-doorGap/2,h:wallT});
        this.walls.push({x:wx+ww/2+doorGap/2,y:wy-wallT,w:ww/2-doorGap/2,h:wallT});
      } else this.walls.push({x:wx-wallT,y:wy-wallT,w:ww+wallT*2,h:wallT});
      // bottom wall
      if(neighbours.s){
        this.walls.push({x:wx,y:wy+wh,w:ww/2-doorGap/2,h:wallT});
        this.walls.push({x:wx+ww/2+doorGap/2,y:wy+wh,w:ww/2-doorGap/2,h:wallT});
      } else this.walls.push({x:wx-wallT,y:wy+wh,w:ww+wallT*2,h:wallT});
      // left wall
      if(neighbours.w){
        this.walls.push({x:wx-wallT,y:wy,w:wallT,h:wh/2-doorGap/2});
        this.walls.push({x:wx-wallT,y:wy+wh/2+doorGap/2,w:wallT,h:wh/2-doorGap/2});
      } else this.walls.push({x:wx-wallT,y:wy,w:wallT,h:wh});
      // right wall
      if(neighbours.e){
        this.walls.push({x:wx+ww,y:wy,w:wallT,h:wh/2-doorGap/2});
        this.walls.push({x:wx+ww,y:wy+wh/2+doorGap/2,w:wallT,h:wh/2-doorGap/2});
      } else this.walls.push({x:wx+ww,y:wy,w:wallT,h:wh});

      // Validate this room's interior obstacles don't accidentally pinch off one of its own
      // doors from the rest of the room - a fine-resolution check done locally (cheap, since
      // it's bounded to one room) rather than relying on the coarser whole-floor reachability
      // grid to catch it after the fact. If the template (or, for the random-scatter
      // templates, sheer bad luck) creates a blind spot, this room's interior is discarded in
      // favour of open space instead of risking a hidden dead zone.
      const doorPoints = [];
      if(neighbours.n) doorPoints.push({x: wx+ww/2, y: wy+8});
      if(neighbours.s) doorPoints.push({x: wx+ww/2, y: wy+wh-8});
      if(neighbours.w) doorPoints.push({x: wx+8, y: wy+wh/2});
      if(neighbours.e) doorPoints.push({x: wx+ww-8, y: wy+wh/2});
      if(room.interior.length>0 && doorPoints.length>0){
        const localWalls = room.interior.map(rect=>({x:room.x+rect.x, y:room.y+rect.y, w:rect.w, h:rect.h}));
        if(!this._roomInteriorIsFullyConnected(room, localWalls, doorPoints)){
          room.interior = [];
        }
      }

      // interior obstacles (post-validation)
      room.interior.forEach(rect=> this.walls.push({x:room.x+rect.x, y:room.y+rect.y, w:rect.w, h:rect.h}));
    });

    // hard outer border - each room's own perimeter is already solid on any side with no
    // neighbour, so the room graph is normally self-enclosing, but this adds an explicit,
    // unconditional rectangular wall around the entire world bounding box as a guarantee: no
    // map layout or edge-case room combination can ever leave a gap for the player (or
    // anything else) to wander out into the void beyond the generated rooms. Every map is a
    // bounded, fixed-size space.
    const borderThickness = 60;
    this.walls.push({ x:0, y:0, w:this.worldW, h:borderThickness }); // top
    this.walls.push({ x:0, y:this.worldH-borderThickness, w:this.worldW, h:borderThickness }); // bottom
    this.walls.push({ x:0, y:0, w:borderThickness, h:this.worldH }); // left
    this.walls.push({ x:this.worldW-borderThickness, y:0, w:borderThickness, h:this.worldH }); // right

    this.startRoom = this.rooms[0];
    this.exit = this.rooms[this.rooms.length-1];

    // ground-truth reachability, flood-filled from the start room. Anything a pickup or
    // enemy might spawn at gets checked against this before placement, so no combination of
    // room templates can ever trap an item (or an objective enemy) somewhere the player can't
    // physically walk to - regardless of what any individual template does.
    this._buildReachability();
  }

  // Fine-resolution flood fill confined to a single room, used to verify none of that room's
  // own doors get cut off from the rest of its floor space by its own interior obstacles.
  _roomInteriorIsFullyConnected(room, localWalls, doorPoints){
    const cell = 12;
    const cols = Math.ceil(room.w/cell), rows = Math.ceil(room.h/cell);
    const walkable = (cx,cy)=>{
      const wx = room.x + cx*cell+cell/2, wy = room.y + cy*cell+cell/2;
      for(const w of localWalls){ if(circleRectCollide(wx,wy,15,w)) return false; }
      return true;
    };
    const visited = new Uint8Array(cols*rows);
    const idx=(cx,cy)=>cy*cols+cx;
    // seed the flood fill from the first door point that lands on a walkable cell
    let seeded = false;
    const queue = [];
    for(const dp of doorPoints){
      const lx = dp.x-room.x, ly = dp.y-room.y;
      const cx = Math.max(0,Math.min(cols-1,Math.floor(lx/cell))), cy = Math.max(0,Math.min(rows-1,Math.floor(ly/cell)));
      if(walkable(cx,cy) && !visited[idx(cx,cy)]){
        visited[idx(cx,cy)] = 1;
        queue.push([cx,cy]);
        seeded = true;
      }
    }
    if(!seeded) return false;
    let qi = 0;
    while(qi<queue.length){
      const [cx,cy] = queue[qi++];
      const neighbours = [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]];
      for(const [nx,ny] of neighbours){
        if(nx<0||ny<0||nx>=cols||ny>=rows) continue;
        const ni = idx(nx,ny);
        if(visited[ni]) continue;
        if(!walkable(nx,ny)) continue;
        visited[ni] = 1;
        queue.push([nx,ny]);
      }
    }
    // every door must reach the same connected region as every other door
    for(const dp of doorPoints){
      const lx = dp.x-room.x, ly = dp.y-room.y;
      const cx = Math.max(0,Math.min(cols-1,Math.floor(lx/cell))), cy = Math.max(0,Math.min(rows-1,Math.floor(ly/cell)));
      if(!visited[idx(cx,cy)]) return false;
    }
    // and the flood must cover a healthy majority of the room's nominally free space, so a
    // template that seals off most of the room (even while technically keeping doors linked
    // through a sliver) still gets rejected.
    let freeCells = 0, reachedFree = 0;
    for(let cy=0; cy<rows; cy++){
      for(let cx=0; cx<cols; cx++){
        if(walkable(cx,cy)){ freeCells++; if(visited[idx(cx,cy)]) reachedFree++; }
      }
    }
    return freeCells>0 && (reachedFree/freeCells) > 0.7;
  }

  _buildReachability(){
    const cell = this.reachCell = 24;
    const cols = this.reachCols = Math.ceil(this.worldW/cell);
    const rows = this.reachRows = Math.ceil(this.worldH/cell);
    const walkable = (cx,cy)=>{
      if(cx<0||cy<0||cx>=cols||cy>=rows) return false;
      const wx = cx*cell+cell/2, wy = cy*cell+cell/2;
      for(const w of this.walls){ if(circleRectCollide(wx,wy,15,w)) return false; }
      return true;
    };
    const reach = new Uint8Array(cols*rows);
    const idx = (cx,cy)=> cy*cols+cx;
    const start = this.center(this.startRoom);
    let startCol = Math.floor(start.x/cell), startRow = Math.floor(start.y/cell);
    // the exact room centre can land on an interior obstacle even though the room itself is
    // wide open (a room template's crate/pillar/cross happening to sit at the midpoint) - if
    // so, spiral outward ring by ring to find the nearest walkable cell to seed the flood
    // fill from, instead of ever treating the whole floor as unreachable over one blocked
    // pixel. That single-seed failure was the root cause of pickups/enemies/the exit portal
    // all getting flagged unreachable at once on some floors.
    if(!walkable(startCol,startRow)){
      let found = false;
      for(let radius=1; radius<=24 && !found; radius++){
        for(let dx=-radius; dx<=radius && !found; dx++){
          for(let dy=-radius; dy<=radius && !found; dy++){
            if(Math.max(Math.abs(dx),Math.abs(dy)) !== radius) continue; // ring perimeter only
            if(walkable(startCol+dx, startRow+dy)){ startCol+=dx; startRow+=dy; found = true; }
          }
        }
      }
      if(!found){ this.reachGrid = reach; return; } // truly nothing walkable nearby - shouldn't happen
    }
    const queue = [[startCol,startRow]];
    reach[idx(startCol,startRow)] = 1;
    let qi = 0;
    while(qi<queue.length){
      const [cx,cy] = queue[qi++];
      const neighbours = [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]];
      for(const [nx,ny] of neighbours){
        if(nx<0||ny<0||nx>=cols||ny>=rows) continue;
        const ni = idx(nx,ny);
        if(reach[ni]) continue;
        if(!walkable(nx,ny)) continue;
        reach[ni] = 1;
        queue.push([nx,ny]);
      }
    }
    this.reachGrid = reach;
  }

  isReachable(x,y){
    if(!this.reachGrid) return true;
    const cx = Math.floor(x/this.reachCell), cy = Math.floor(y/this.reachCell);
    if(cx<0||cy<0||cx>=this.reachCols||cy>=this.reachRows) return false;
    return this.reachGrid[cy*this.reachCols+cx] === 1;
  }

  roomContaining(px,py){
    return this.rooms.find(r=> px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h) || null;
  }

  center(room){ return { x: room.x+room.w/2, y: room.y+room.h/2 }; }
}

// ------------------------------------------------------------------------------------------
// 6. GEOMETRY HELPERS (raycasting against wall rects for fog-of-war + LOS)
// ------------------------------------------------------------------------------------------
function segIntersect(x1,y1,x2,y2,x3,y3,x4,y4){
  const d = (x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if(Math.abs(d) < 1e-9) return null;
  const t = ((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/d;
  const u = -((x1-x2)*(y1-y3)-(y1-y2)*(x1-x3))/d;
  if(t>=0 && t<=1 && u>=0 && u<=1){
    return { x:x1+t*(x2-x1), y:y1+t*(y2-y1), t };
  }
  return null;
}
function rectEdges(r){
  return [
    [r.x,r.y, r.x+r.w,r.y],
    [r.x+r.w,r.y, r.x+r.w,r.y+r.h],
    [r.x+r.w,r.y+r.h, r.x,r.y+r.h],
    [r.x,r.y+r.h, r.x,r.y]
  ];
}
// cast a ray from (ox,oy) at angle 'ang' up to maxDist, return distance to nearest wall hit
function castRay(walls, ox, oy, ang, maxDist){
  const ex = ox + Math.cos(ang)*maxDist;
  const ey = oy + Math.sin(ang)*maxDist;
  let best = maxDist;
  for(const w of walls){
    for(const [x1,y1,x2,y2] of rectEdges(w)){
      const hit = segIntersect(ox,oy,ex,ey,x1,y1,x2,y2);
      if(hit){
        const dist = Math.hypot(hit.x-ox, hit.y-oy);
        if(dist < best) best = dist;
      }
    }
  }
  return best;
}
function hasLineOfSight(walls, x1,y1,x2,y2){
  for(const w of walls){
    for(const [wx1,wy1,wx2,wy2] of rectEdges(w)){
      if(segIntersect(x1,y1,x2,y2,wx1,wy1,wx2,wy2)) return false;
    }
  }
  return true;
}
function pointInRect(px,py,r){ return px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h; }
function circleRectCollide(cx,cy,radius,r){
  const nx = Math.max(r.x, Math.min(cx, r.x+r.w));
  const ny = Math.max(r.y, Math.min(cy, r.y+r.h));
  return Math.hypot(cx-nx, cy-ny) < radius;
}
function resolveCircleRect(cx,cy,radius,r){
  const nx = Math.max(r.x, Math.min(cx, r.x+r.w));
  const ny = Math.max(r.y, Math.min(cy, r.y+r.h));
  const dx = cx-nx, dy = cy-ny;
  const dist = Math.hypot(dx,dy) || 0.001;
  if(dist < radius){
    const push = radius-dist;
    return { x: cx + (dx/dist)*push, y: cy + (dy/dist)*push };
  }
  return { x:cx, y:cy };
}
function angleDiff(a,b){
  let d = a-b;
  while(d> Math.PI) d -= Math.PI*2;
  while(d<-Math.PI) d += Math.PI*2;
  return Math.abs(d);
}

// ------------------------------------------------------------------------------------------
// 7. FOG OF WAR
// ------------------------------------------------------------------------------------------
class FogOfWar{
  constructor(worldW, worldH, tile=32){
    this.tile = tile;
    this.cols = Math.ceil(worldW/tile);
    this.rows = Math.ceil(worldH/tile);
    this.explored = new Uint8Array(this.cols*this.rows);
  }
  idx(cx,cy){ return cy*this.cols+cx; }
  markExplored(polygon, minx,miny,maxx,maxy){
    const c0 = Math.max(0, Math.floor(minx/this.tile)), c1 = Math.min(this.cols-1, Math.ceil(maxx/this.tile));
    const r0 = Math.max(0, Math.floor(miny/this.tile)), r1 = Math.min(this.rows-1, Math.ceil(maxy/this.tile));
    for(let ry=r0; ry<=r1; ry++){
      for(let cx=c0; cx<=c1; cx++){
        const wx = cx*this.tile+this.tile/2, wy = ry*this.tile+this.tile/2;
        if(pointInPolygon(wx,wy,polygon)) this.explored[this.idx(cx,ry)] = 1;
      }
    }
  }
  isExplored(px,py){
    const cx = Math.floor(px/this.tile), cy = Math.floor(py/this.tile);
    if(cx<0||cy<0||cx>=this.cols||cy>=this.rows) return false;
    return this.explored[this.idx(cx,cy)] === 1;
  }
}
function pointInPolygon(px,py,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
    const intersect = ((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

// Build the player's visibility polygon for a weapon-driven vision cone using raycasting.
// Returns { mainPoly, localPoly, maxDist } where mainPoly is the directional cone and
// localPoly is the small always-on circle of immediate awareness.
function buildVisionPolygon(walls, ox, oy, aimAngle, visionAngleDeg, visionRange, rayCount){
  const halfAngle = (visionAngleDeg * Math.PI/180) / 2;
  const poly = [{x:ox,y:oy}];
  for(let i=0;i<=rayCount;i++){
    const t = i/rayCount;
    const ang = aimAngle - halfAngle + t*halfAngle*2;
    const dist = castRay(walls, ox, oy, ang, visionRange);
    poly.push({ x: ox+Math.cos(ang)*dist, y: oy+Math.sin(ang)*dist });
  }
  return poly;
}
function buildLocalAwarenessPolygon(walls, ox, oy, radius, rayCount=20){
  const poly = [];
  for(let i=0;i<rayCount;i++){
    const ang = (i/rayCount)*Math.PI*2;
    const dist = castRay(walls, ox, oy, ang, radius);
    poly.push({ x: ox+Math.cos(ang)*dist, y: oy+Math.sin(ang)*dist });
  }
  return poly;
}

// ------------------------------------------------------------------------------------------
// 8. ENTITIES
// ------------------------------------------------------------------------------------------
class Bullet{
  // faction: 'player' for the player's own shots, a squadId (0/1/2) for squad-vs-squad fire,
  // or null for a non-squad enemy shooting at the player. visRadius controls how far away the
  // player can see this bullet's tracer - Silencer (player upgrade) and silenced enemy
  // archetypes both shrink it.
  constructor(x,y,ang,speed,damage,owner,range,color,faction,visRadius){
    this.x=x; this.y=y; this.originX=x; this.originY=y; this.ang=ang; this.speed=speed; this.damage=damage;
    this.owner=owner; // 'player' or 'enemy'
    this.faction = (faction===undefined) ? null : faction;
    this.visRadius = visRadius || 300;
    this.traveled=0; this.maxRange=range; this.dead=false; this.color=color||'#fff';
  }
  update(dt, walls){
    const dx = Math.cos(this.ang)*this.speed*dt, dy = Math.sin(this.ang)*this.speed*dt;
    this.x += dx; this.y += dy;
    this.traveled += Math.hypot(dx,dy);
    if(this.traveled > this.maxRange) this.dead = true;
    for(const w of walls){ if(pointInRect(this.x,this.y,w)){ this.dead = true; break; } }
  }
}

class Player{
  constructor(x,y,ownedWeapons){
    this.x=x; this.y=y; this.radius=14; this.speed=190;
    this.maxHp=100; this.hp=100;
    this.ownedWeapons = ownedWeapons;
    this.weaponId = 'pistol';
    this.baseStats = {...WEAPON_CONFIG.pistol};
    this.weaponStats = {...this.baseStats};
    // ammo is two separate pools, like most shooters: magazineAmmo is what's actually loaded
    // and firing from right now (0..magazineSize); reserveAmmo is spare rounds carried but not
    // chambered. Reloading moves rounds from reserve into the magazine over reloadTime.
    this.magazineAmmo = this.weaponStats.magazineSize;
    this.reserveAmmo = 0;
    this.aimAngle = 0;
    this.fireTimer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.activeUpgrades = []; // {id,name,timeLeft,duration}
    this.localAwarenessRadius = 55;
    this.moveDir = {x:0,y:0};
    this.isMoving = false;
    this.peekOffset = {x:0,y:0}; // smoothed lean-around-a-corner offset, see _computePeek()
    this.openingChest = null; // Chest instance currently being channel-opened, if any
    this.powerup = null;
    this.item = null;
    this.armour = 0;
    this.shieldTime = 0;
    this.scanTime = 0;
    this.smokeTime = 0;
  }
  equipWeapon(id){
    this.weaponId = id;
    this.baseStats = {...WEAPON_CONFIG[id]};
    this.activeUpgrades = [];
    this._recalcStats();
    // switching weapons starts you with a fresh full magazine and an empty reserve - you have
    // to go find ammo for the new gun, same as before, just expressed correctly now.
    this.magazineAmmo = this.weaponStats.magazineSize;
    this.reserveAmmo = 0;
    this.reloading = false;
  }
  applyUpgrade(upgrade){
    // remove existing same-id then add fresh
    this.activeUpgrades = this.activeUpgrades.filter(u=>u.id!==upgrade.id);
    this.activeUpgrades.push({ id:upgrade.id, name:upgrade.name, timeLeft:upgrade.duration, duration:upgrade.duration });
    this._recalcStats();
  }
  _recalcStats(){
    let stats = {...this.baseStats};
    for(const u of this.activeUpgrades){
      stats = UPGRADE_CONFIG[u.id].apply(stats);
    }
    this.weaponStats = stats;
  }
  update(dt, walls){
    this.shieldTime=Math.max(0,this.shieldTime-dt);
    this.scanTime=Math.max(0,this.scanTime-dt);
    this.smokeTime=Math.max(0,this.smokeTime-dt);
    // upgrade timers
    let changed = false;
    this.activeUpgrades = this.activeUpgrades.filter(u=>{
      u.timeLeft -= dt;
      if(u.timeLeft<=0){ changed = true; return false; }
      return true;
    });
    if(changed) this._recalcStats();

    // movement
    let mx=this.moveDir.x, my=this.moveDir.y;
    const len = Math.hypot(mx,my);
    this.isMoving = len > 0.01;
    if(len>0){ mx/=len; my/=len; }
    const spd = this.speed * this.weaponStats.movementModifier;
    const nx = this.x + mx*spd*dt;
    const ny = this.y + my*spd*dt;
    let px = nx, py = this.y;
    for(const w of walls){ if(circleRectCollide(px,py,this.radius,w)){ const r=resolveCircleRect(px,py,this.radius,w); px=r.x; } }
    let px2 = px, py2 = ny;
    for(const w of walls){ if(circleRectCollide(px2,py2,this.radius,w)){ const r=resolveCircleRect(px2,py2,this.radius,w); py2=r.y; } }
    this.x = px2; this.y = py2;

    if(this.fireTimer>0) this.fireTimer -= dt;
    if(this.reloading){
      this.reloadTimer -= dt;
      if(this.reloadTimer<=0){
        this.reloading = false;
        const needed = this.weaponStats.magazineSize - this.magazineAmmo;
        const transfer = Math.min(needed, this.reserveAmmo);
        this.magazineAmmo += transfer;
        this.reserveAmmo -= transfer;
      }
    }

    // peek: standing still right at the edge of a wall automatically leans the view (and
    // aim) a little to the open side, so you can see - and shoot - around a corner without
    // stepping fully into the open.
    const targetPeek = this._computePeek(walls);
    const peekLerp = 1 - Math.pow(0.001, dt); // fast but smooth, framerate-independent
    this.peekOffset.x += (targetPeek.x - this.peekOffset.x) * peekLerp;
    this.peekOffset.y += (targetPeek.y - this.peekOffset.y) * peekLerp;
  }
  // Detects whether the player is standing still right against the edge of a wall on one
  // side with open space on the other (the classic "hugging a corner" position) and, if so,
  // returns a small offset toward the open side to lean the vision/aim origin out past the
  // corner. Returns {x:0,y:0} when moving or not near a qualifying corner.
  _computePeek(walls){
    if(this.isMoving) return {x:0,y:0};
    const perp = this.aimAngle + Math.PI/2;
    const checkDist = this.radius + 12;
    const sideAx = Math.cos(perp), sideAy = Math.sin(perp);
    const leftPt = { x:this.x+sideAx*checkDist, y:this.y+sideAy*checkDist };
    const rightPt = { x:this.x-sideAx*checkDist, y:this.y-sideAy*checkDist };
    const leftBlocked = walls.some(w=>circleRectCollide(leftPt.x,leftPt.y,6,w));
    const rightBlocked = walls.some(w=>circleRectCollide(rightPt.x,rightPt.y,6,w));
    const peekAmount = 18;
    if(leftBlocked && !rightBlocked) return { x:-sideAx*peekAmount, y:-sideAy*peekAmount };
    if(rightBlocked && !leftBlocked) return { x:sideAx*peekAmount, y:sideAy*peekAmount };
    return {x:0,y:0};
  }
  startReload(){
    if(this.reloading) return;
    if(this.magazineAmmo >= this.weaponStats.magazineSize) return; // already full, nothing to do
    if(this.reserveAmmo <= 0) return; // nothing in reserve to reload with
    this.reloading = true;
    this.reloadTimer = this.weaponStats.reloadTime;
  }
  // firing cone tightens 30% when standing still - steadier aim, and (via getEffectiveSpread)
  // tighter grouping too, since accuracy is derived from live cone width below.
  getLiveConeWidth(){
    return this.weaponStats.coneWidth * (this.isMoving ? 1 : 0.7);
  }
  // spread is not an independent stat at fire time - it's derived from how wide the current
  // cone is relative to the weapon's baseline cone/spread ratio. A wider cone (bigger upgrade
  // penalty, or just moving) always means less accuracy; a tighter cone always means more.
  getEffectiveSpread(){
    const spreadFactor = this.weaponStats.spread / this.weaponStats.coneWidth;
    return this.getLiveConeWidth() * spreadFactor;
  }
}

class Enemy{
  constructor(archetypeId, x, y, tierMultiplier){
    const cfg = ENEMY_CONFIG[archetypeId];
    this.archetype = archetypeId;
    this.cfg = cfg;
    this.x=x; this.y=y; this.radius=13;
    this.hp = cfg.hp * tierMultiplier;
    this.maxHp = this.hp;
    this.speed = cfg.speed;
    this.state = 'patrol';
    this.aimAngle = Math.random()*Math.PI*2;
    this.patrolTarget = { x:x+ (Math.random()*160-80), y:y+ (Math.random()*160-80) };
    this.fireTimer = Math.random();
    this.lastKnownPlayerPos = null;
    this.searchTimer = 0;
    this.alertPulse = 0;
    this.dead = false;
    this.tier = tierMultiplier;
    this.isElite = tierMultiplier > 1.35;
    // squad membership (set by Squad on creation) - null means a regular room-spawned enemy
    this.squadId = null;
    this.squad = null;
    this.rivalRef = null;
    this.isSquad = false;
    // footprint trail
    this.footprintTimer = Math.random()*0.3;
    this.ambushTriggered = false;
    // damage aversion: taking a hit (or running low on HP) makes an enemy fight more
    // defensively for a few seconds - keeping more distance and juking sideways instead of
    // pressing straight in - without giving up on attacking altogether.
    this.recentlyHitTimer = 0;
    this.strafeSeed = Math.random()*1000; // per-enemy phase offset so squads don't all juke in sync
    // combat buff from opening a chest or picking up a ground upgrade - enemies don't carry a
    // magazine, so instead of ammo they get a flat damage/fire-rate/range boost for a while.
    this.buff = null; // {timeLeft, duration}
    // hidden adaptive difficulty (see Game.adaptiveDifficulty) - defaults to neutral (1.0)
    // until whatever spawned this enemy calls applyAdaptiveDifficulty() with the current
    // round's multiplier.
    this.applyAdaptiveDifficulty(1);
  }
  // Scales this enemy's detection range and gunfire visual signature by the given multiplier
  // (Game.adaptiveDifficulty.mult). Kept as instance properties rather than mutating the
  // shared cfg object, so different enemies spawned under different multipliers over the
  // game's lifetime never interfere with each other.
  applyAdaptiveDifficulty(mult){
    this.adaptiveMult = mult;
    this.hearingRange = this.cfg.hearingRange * mult;
    this.visionRange = this.cfg.visionRange * mult;
    this.gunfireVisRadius = (this.cfg.silenced ? this.hearingRange*0.4 : this.hearingRange*1.1);
  }
  getCombatMult(){
    const buffMult = this.buff ? { damage:1.25, fireRate:1.15, range:1.15 } : { damage:1, fireRate:1, range:1 };
    // rate of fire is the one the player will feel most directly - scaled straight by the
    // hidden adaptive multiplier, on top of any temporary chest/pickup buff
    return { damage: buffMult.damage, fireRate: buffMult.fireRate*this.adaptiveMult, range: buffMult.range };
  }
  canSeePoint(walls, px, py){
    const dist = Math.hypot(px-this.x, py-this.y);
    if(dist > this.visionRange) return false;
    const ang = Math.atan2(py-this.y, px-this.x);
    if(angleDiff(ang, this.aimAngle) > (this.cfg.visionAngle*Math.PI/180)/2) return false;
    return hasLineOfSight(walls, this.x, this.y, px, py);
  }
  update(dt, game){
    const startX = this.x, startY = this.y;
    const player = game.player;
    const walls = game.map.walls;
    const distToPlayer = Math.hypot(player.x-this.x, player.y-this.y);
    let canSee = this.canSeePoint(walls, player.x, player.y);
    if(player.smokeTime>0&&distToPlayer<125)canSee=false;

    if(this.recentlyHitTimer>0) this.recentlyHitTimer -= dt;
    if(this.buff){ this.buff.timeLeft -= dt; if(this.buff.timeLeft<=0) this.buff = null; }
    const mult = this.getCombatMult();
    // damage-averse: true right after taking a hit, or whenever running low on health -
    // covers both "flinched and backing off" and "hurt and being careful" cases.
    const damageAverse = this.recentlyHitTimer>0 || (this.hp/this.maxHp < 0.35);
    if(this.isCommander){
      this.commandTimer=(this.commandTimer||0)-dt;
      if(this.commandTimer<=0){this.commandTimer=6;game.enemies.forEach(ally=>{if(ally!==this&&!ally.dead&&Math.hypot(ally.x-this.x,ally.y-this.y)<360){ally.buff={timeLeft:7,duration:7};if(this.lastKnownPlayerPos){ally.lastKnownPlayerPos={...this.lastKnownPlayerPos};if(ally.state==='patrol')ally.state='suspicious';}}});}
    }

    // sound detection: react to the nearest sufficiently-recent gunshot within hearing range,
    // regardless of who fired it - the player, a rival squad, or one of this enemy's own
    // squadmates engaging someone elsewhere. Priority 2 of 4 (see the cascade below).
    let heardPos = null, heardDist = this.hearingRange;
    for(const ge of game.gunfireEvents){
      if(performance.now()-ge.t > 3000) continue;
      const d = Math.hypot(ge.x-this.x, ge.y-this.y);
      if(d < heardDist){ heardDist = d; heardPos = ge; }
    }

    // footprint detection: an enemy only picks up a trail it can actually SEE - real line of
    // sight and inside its current vision cone, same as spotting the player, not just "close
    // enough to hear". This is what makes footprints something enemies genuinely follow rather
    // than an omniscient radar, and it's how they can pick up the *player's* trail too, not
    // just another enemy's. Priority 3 of 4 - outranks reacting to a gunshot, since a fresh
    // trail spotted with your own eyes is a firmer lead than a noise, but still yields to
    // actually being able to engage someone.
    let footprintPos = null, footprintDist = Infinity;
    for(const fp of game.footprints){
      if(fp.owner===this) continue;
      if(performance.now()-fp.born > (fp.maxAge!=null ? fp.maxAge : FOOTPRINT_MAX_AGE)) continue;
      if(!this.canSeePoint(walls, fp.x, fp.y)) continue;
      const d = Math.hypot(fp.x-this.x, fp.y-this.y);
      if(d < footprintDist){ footprintDist = d; footprintPos = fp; }
    }

    // ---- squad rival detection takes priority over the player ----
    if(this.squadId!=null){
      const behavior = this.squad ? this.squad.behavior : null;
      const ambushWaiting = behavior && behavior.ambush && !this.ambushTriggered;
      const rival = ambushWaiting ? null : game.findVisibleRivalFor(this);
      if(rival){
        this.state = 'attackRival';
        this.rivalRef = rival;
        this.ambushTriggered = true;
        this.aimAngle = Math.atan2(rival.y-this.y, rival.x-this.x);
      } else if(this.state==='attackRival'){
        this.state = 'search';
        this.lastKnownPlayerPos = this.lastKnownPlayerPos || {x:this.x,y:this.y};
        this.searchTimer = 2;
      }
    }

    // ---- behaviour priority cascade, lowest to highest ----
    // 1) drift toward the zone centre (the default/fallback, applied in the 'patrol' movement
    //    block below when nothing more urgent is happening)
    // 2) move toward a recent gunshot location
    // 3) move toward a recent footprint trail (outranks gunshots - a trail is a firmer lead)
    // 4) engage a visible enemy (rival squad, or the player) - handled above/below, always wins
    if(this.state!=='attackRival'){
      if(canSee){
        if(this.squad && this.squad.behavior.ambush) this.ambushTriggered = true;
        this.state = 'attack';
        this.lastKnownPlayerPos = {x:player.x,y:player.y};
        this.searchTimer = 2.5 * (this.squad ? this.squad.behavior.aggression : 1) * this.adaptiveMult;
        this.aimAngle = Math.atan2(player.y-this.y, player.x-this.x);
      } else if(this.state==='attack' || this.state==='chase'){
        this.state = 'search';
      } else if(footprintPos && (this.state==='patrol' || this.state==='suspicious' || this.state==='search')){
        this.state = 'suspicious';
        this.lastKnownPlayerPos = {x:footprintPos.x, y:footprintPos.y};
        this.searchTimer = Math.max(this.searchTimer, 5);
        // Alert nearby squadmates so groups investigate noises together instead of one at a time.
        if(this.squad)this.squad.members.forEach(m=>{if(m!==this&&!m.dead&&Math.hypot(m.x-this.x,m.y-this.y)<260){m.lastKnownPlayerPos={x:heardPos.x,y:heardPos.y};m.searchTimer=Math.max(m.searchTimer,4);if(m.state==='patrol')m.state='suspicious';}});
      } else if(heardPos && (this.state==='patrol' || this.state==='suspicious' || this.state==='search')){
        // investigate the gunshot's location, whoever fired it
        this.state = 'suspicious';
        this.lastKnownPlayerPos = {x:heardPos.x, y:heardPos.y};
        this.searchTimer = Math.max(this.searchTimer, 2);
      }
    }

    if(this.state==='search'){
      this.searchTimer -= dt;
      if(this.searchTimer<=0){ this.state='patrol'; this.lastKnownPlayerPos=null; }
    }

    // movement/behaviour per state
    // Zone survival always wins over patrol/suspicious/search/holding position - even a
    // normally-stationary Sniper will reposition rather than stand still and die to the
    // shrinking zone. This was the main cause of rounds ending prematurely to "zone death":
    // an enemy deep in a suspicious/search loop (or a Sniper that never moves at all outside
    // combat) could end up outside the ring with nothing ever pulling it back in. Only an
    // active engagement (attack/attackRival) is allowed to override this - finishing a fight
    // still matters more than the zone for that one tick.
    const zoneDist = game.zone ? Math.hypot(this.x-game.zone.x, this.y-game.zone.y) : 0;
    const mustFleeZone = game.zone && zoneDist > game.zone.radius + 30 && this.state!=='attack' && this.state!=='attackRival';

    if(mustFleeZone){
      const zoneAng = Math.atan2(game.zone.y-this.y, game.zone.x-this.x);
      this.aimAngle = zoneAng;
      this._moveTry(walls, zoneAng, this.speed*dt);
    } else if(this.archetype==='sniper' && game.zone && this.state!=='attack' && this.state!=='attackRival'
              && (game.zone.radius - zoneDist) < game.zone.radius*0.18){
      // Snipers stalk the edge of the ring rather than sitting dead-centre or wandering like
      // everyone else - a sniper's whole value is a long, exposed sightline, and the ring's
      // boundary is exactly that. Once it's within ~18% of the current radius from the edge
      // (from either side), it urgently repositions to a fresh point just inside the boundary
      // instead of holding still, so it keeps pace as the ring shrinks under it rather than
      // ever getting caught properly outside.
      const needNewTarget = !this._sniperEdgeTarget
        || Math.hypot(this.x-this._sniperEdgeTarget.x, this.y-this._sniperEdgeTarget.y) < 24
        || performance.now()-(this._sniperEdgeTargetTime||0) > 4000;
      if(needNewTarget){
        const ang = Math.random()*Math.PI*2;
        const r = game.zone.radius*0.8;
        this._sniperEdgeTarget = { x: game.zone.x+Math.cos(ang)*r, y: game.zone.y+Math.sin(ang)*r };
        this._sniperEdgeTargetTime = performance.now();
      }
      const moveAng = Math.atan2(this._sniperEdgeTarget.y-this.y, this._sniperEdgeTarget.x-this.x);
      this.aimAngle = moveAng;
      this._moveTry(walls, moveAng, this.speed*dt);
    } else if(this.cfg.stationary && this.state!=='attackRival'){
      // snipers hold position, just rotate toward target
    } else if(this.state==='attackRival' && this.rivalRef && !this.rivalRef.dead){
      const rival = this.rivalRef;
      const rdist = Math.hypot(rival.x-this.x, rival.y-this.y);
      this.aimAngle = Math.atan2(rival.y-this.y, rival.x-this.x);
      // damage-averse enemies hold a bigger cushion of distance instead of closing all the
      // way to their normal engagement range. The non-averse baseline is also scaled by the
      // hidden adaptive difficulty multiplier - a higher multiplier means a smaller desired
      // range, i.e. a more aggressive enemy that presses closer.
      const desiredRange = this.cfg.range * (damageAverse ? 0.95 : 0.75/this.adaptiveMult);
      let moveAng = null;
      if(!this.cfg.stationary){
        if(rdist>desiredRange) moveAng = this.aimAngle;
        else if(rdist<desiredRange*0.5 && !this.cfg.melee) moveAng = this.aimAngle+Math.PI;
        if(moveAng!==null) this._moveTry(walls, moveAng, this.speed*dt);
        // juke sideways while hurt/recently hit so they're a harder target to keep hitting -
        // still tracking and firing, just not standing still to take it.
        if(damageAverse && !this.cfg.melee && !this.cfg.stationary){
          const strafeDir = Math.sin(performance.now()/450 + this.strafeSeed) > 0 ? 1 : -1;
          this._moveTry(walls, this.aimAngle + Math.PI/2*strafeDir, this.speed*0.55*dt);
        }
      }
      if(this.fireTimer>0) this.fireTimer -= dt;
      if(this.fireTimer<=0 && !this.cfg.heals){
        if(this.cfg.melee){
          if(rdist < this.radius+rival.radius+16){
            rival.hp -= this.cfg.damage*mult.damage;
            if(rival.hp<=0){
              game.markEnemyDead(rival);
              game.stats.kills += 1;
              window.AchievementManager?.notify?.('enemy_defeated', {x:this.x,y:this.y});
              game.stats.coinsEarned += 1;
            }
            this.fireTimer = 1/1.2;
          }
        } else if(rdist <= this.cfg.range*mult.range){
          const pellets = this.cfg.pellets || 1;
          for(let i=0;i<pellets;i++){
            // tighter enemy accuracy than before - single-pellet weapons especially so
            const spread = pellets>1 ? (Math.random()*0.28-0.14) : (Math.random()*0.03-0.015);
            game.enemyBullets.push(new Bullet(this.x,this.y, this.aimAngle+spread, 640, this.cfg.damage*mult.damage, 'enemy', this.cfg.range*mult.range, this.cfg.color, this.squadId, this.gunfireVisRadius));
          }
          this.fireTimer = 1/(this.cfg.fireRate*mult.fireRate);
          game.registerGunshot(this.x,this.y, this.gunfireVisRadius);
        }
      }
    } else if(this.state==='patrol'){
      // priority 1 (lowest/default): drift toward the zone centre while wandering, blended
      // with the existing squad-rally / self-random target so it still feels organic per
      // class rather than beelining - this only ever applies when nothing higher-priority
      // (engaging, a footprint, a gunshot) is active.
      const behavior = this.squad ? this.squad.behavior : null;
      const zoneCenter = game.zone ? {x:game.zone.x, y:game.zone.y} : null;
      const d = Math.hypot(this.patrolTarget.x-this.x, this.patrolTarget.y-this.y);
      if(d<8){
        if(behavior){
          // squad members roam around their shared rally point rather than their own spawn
          const home = this.squad.rallyPoint;
          const r = behavior.roamRadius;
          let tx = home.x + (Math.random()*2-1)*r, ty = home.y + (Math.random()*2-1)*r;
          if(zoneCenter){ tx = tx*0.7 + zoneCenter.x*0.3; ty = ty*0.7 + zoneCenter.y*0.3; }
          this.patrolTarget = { x:tx, y:ty };
        } else {
          let tx = this.x+(Math.random()*200-100), ty = this.y+(Math.random()*200-100);
          if(zoneCenter){ tx = tx*0.5 + zoneCenter.x*0.5; ty = ty*0.5 + zoneCenter.y*0.5; }
          this.patrolTarget = { x:tx, y:ty };
        }
      } else {
        const ang = Math.atan2(this.patrolTarget.y-this.y, this.patrolTarget.x-this.x);
        const behaviorSpeed = behavior && behavior.ambush ? 0.12 : 0.4;
        this._moveTry(walls, ang, this.speed*behaviorSpeed*dt);
        this.aimAngle = ang;
      }
    } else if(this.state==='suspicious'){
      if(this.lastKnownPlayerPos){
        const ang = Math.atan2(this.lastKnownPlayerPos.y-this.y, this.lastKnownPlayerPos.x-this.x);
        this.aimAngle = ang;
        this._moveTry(walls, ang, this.speed*0.5*dt);
      }
    } else if(this.state==='search'){
      if(this.lastKnownPlayerPos){
        const d = Math.hypot(this.lastKnownPlayerPos.x-this.x, this.lastKnownPlayerPos.y-this.y);
        if(d>10){
          const ang = Math.atan2(this.lastKnownPlayerPos.y-this.y, this.lastKnownPlayerPos.x-this.x);
          this.aimAngle = ang;
          this._moveTry(walls, ang, this.speed*0.7*dt);
        }
      }
    } else if(this.state==='attack'){
      const behavior = this.squad ? this.squad.behavior : null;
      // retreat & regroup squads back off from the player instead of pressing the fight
      if(behavior && behavior.retreatOnLowHP){
        const alive = this.squad.members.filter(m=>!m.dead);
        const avgHpPct = alive.length ? alive.reduce((s,m)=>s+m.hp/m.maxHp,0)/alive.length : 1;
        if(avgHpPct < 0.4){
          const away = this.aimAngle + Math.PI;
          this._moveTry(walls, away, this.speed*dt);
          return;
        }
      }
      // same aggression scaling as the rival-combat branch above - a higher hidden difficulty
      // multiplier means a smaller desired range, so the enemy presses closer to the player.
      const desiredRange = this.cfg.range * (damageAverse ? 0.95 : 0.75/this.adaptiveMult);
      let moveAng = this.aimAngle;
      if(this.cfg.flanks){
        moveAng = this.aimAngle + Math.PI/2 * (Math.sin(performance.now()/900)>0?1:-1);
      } else if(distToPlayer > desiredRange){
        // approach
      } else if(distToPlayer < desiredRange*0.6 && !this.cfg.melee){
        moveAng = this.aimAngle + Math.PI; // back off
      } else {
        moveAng = null; // hold position
      }
      if(behavior && behavior.holdGround && this.squad){
        const distFromHome = Math.hypot(this.x-this.squad.homePos.x, this.y-this.squad.homePos.y);
        if(distFromHome > behavior.roamRadius*1.4) moveAng = Math.atan2(this.squad.homePos.y-this.y, this.squad.homePos.x-this.x);
      }
      if(moveAng !== null) this._moveTry(walls, moveAng, this.speed*dt);
      // damage-averse: juke sideways instead of standing still and eating fire, without
      // abandoning the fight - still aiming and shooting through the dodge.
      if(damageAverse && !this.cfg.melee && !this.cfg.stationary){
        const strafeDir = Math.sin(performance.now()/450 + this.strafeSeed) > 0 ? 1 : -1;
        this._moveTry(walls, this.aimAngle + Math.PI/2*strafeDir, this.speed*0.55*dt);
      }
      // Riflemen use the terrain in a fight rather than standing in the open: if there's no
      // wall reasonably close by, they drift toward the nearest one on top of their normal
      // range-holding movement, so they end up fighting from doorways and corners more often
      // than the middle of a room. A lightweight "seek nearby cover" approximation rather than
      // true pathfinding to a specific corner, but it reliably pulls them toward walls.
      if(this.archetype==='rifleman'){
        let nearestPt = null, nearestDist = Infinity;
        for(const w of walls){
          const nx = Math.max(w.x, Math.min(this.x, w.x+w.w));
          const ny = Math.max(w.y, Math.min(this.y, w.y+w.h));
          const d = Math.hypot(this.x-nx, this.y-ny);
          if(d < nearestDist){ nearestDist = d; nearestPt = {x:nx,y:ny}; }
        }
        if(nearestPt && nearestDist > 70){
          const wallAng = Math.atan2(nearestPt.y-this.y, nearestPt.x-this.x);
          this._moveTry(walls, wallAng, this.speed*0.45*dt);
        }
      }

      // attack
      if(this.fireTimer>0) this.fireTimer -= dt;
      if(this.fireTimer<=0){
        if(this.cfg.melee){
          if(distToPlayer < this.radius+player.radius+16){
            game.damagePlayer(this.cfg.damage*mult.damage);
            this.fireTimer = 1/1.2;
          }
        } else if(this.cfg.heals){
          // medic: heal nearby wounded enemies instead of shooting
          for(const other of game.enemies){
            if(other!==this && !other.dead && other.hp<other.maxHp){
              const d = Math.hypot(other.x-this.x, other.y-this.y);
              if(d<140){ other.hp = Math.min(other.maxHp, other.hp+other.maxHp*0.15); this.fireTimer=1/0.4; break; }
            }
          }
          if(this.fireTimer<=0) this.fireTimer = 0.5;
        } else if(distToPlayer <= this.cfg.range*mult.range){
          const pellets = this.cfg.pellets || 1;
          for(let i=0;i<pellets;i++){
            // tighter enemy accuracy than before - single-pellet weapons especially so
            const spread = pellets>1 ? (Math.random()*0.28-0.14) : (Math.random()*0.03-0.015);
            game.enemyBullets.push(new Bullet(this.x,this.y, this.aimAngle+spread, 640, this.cfg.damage*mult.damage, 'enemy', this.cfg.range*mult.range, this.cfg.color, this.squadId, this.gunfireVisRadius));
          }
          this.fireTimer = 1/(this.cfg.fireRate*mult.fireRate);
          game.registerGunshot(this.x,this.y, this.gunfireVisRadius);
        }
      }
    }

    // ---- footprint trail: a fading breadcrumb the player can pick up on in explored fog ----
    this.footprintTimer -= dt;
    if(this.footprintTimer<=0){
      if(Math.hypot(this.x-startX, this.y-startY) > 1){
        game.footprints.push({ x:this.x, y:this.y, born:performance.now(), owner:this });
        this.soundStep=(this.soundStep||0)+1;
        if(this.soundStep%2===0)game.registerSound(this.x,this.y,'footsteps',165);
      }
      this.footprintTimer = 0.32;
    }
  }
  _moveTry(walls, ang, dist){
    if(dist<=0) return;
    const nx = this.x+Math.cos(ang)*dist, ny = this.y+Math.sin(ang)*dist;
    let ok = true;
    for(const w of walls){ if(circleRectCollide(nx,ny,this.radius,w)){ ok=false; break; } }
    if(ok){ this.x=nx; this.y=ny; }
    else {
      // try sliding on one axis
      let nx2=this.x+Math.cos(ang)*dist, ny2=this.y;
      let ok2=true;
      for(const w of walls){ if(circleRectCollide(nx2,ny2,this.radius,w)){ ok2=false; break; } }
      if(ok2) this.x=nx2;
      else {
        let nx3=this.x, ny3=this.y+Math.sin(ang)*dist;
        let ok3=true;
        for(const w of walls){ if(circleRectCollide(nx3,ny3,this.radius,w)){ ok3=false; break; } }
        if(ok3) this.y=ny3;
      }
    }
  }
}

// ------------------------------------------------------------------------------------------
// 8b. SQUAD - groups 4 enemies under a shared behaviour preset. Individual combat/AI logic
//     still lives on Enemy; Squad only nudges the shared rally point (patrol anchor) toward
//     gunfire and tracks the group so rival squads can find each other via
//     Game.findVisibleRivalFor().
// ------------------------------------------------------------------------------------------
class Squad{
  constructor(id, behavior, members, homePos){
    this.id = id;
    this.behavior = behavior;
    this.members = members;
    this.homePos = { ...homePos };
    this.rallyPoint = { ...homePos };
    members.forEach(m=>{ m.squadId = id; m.squad = this; m.isSquad = true; });
  }
  update(dt, game){
    const alive = this.members.filter(m=>!m.dead);
    if(alive.length===0) return;
    let cx=0, cy=0;
    alive.forEach(m=>{ cx+=m.x; cy+=m.y; });
    cx/=alive.length; cy/=alive.length;
    this.centroid = { x:cx, y:cy };

    // gunfire attraction: drift the rally point toward the nearest recent gunshot
    if(this.behavior.gunfireAttraction>0 && game.gunfireEvents.length){
      let nearest=null, nd=Infinity;
      for(const ge of game.gunfireEvents){
        const d = Math.hypot(ge.x-cx, ge.y-cy);
        if(d<nd){ nd=d; nearest=ge; }
      }
      if(nearest && nd < 1100){
        this.rallyPoint.x += (nearest.x-this.rallyPoint.x)*this.behavior.gunfireAttraction*dt*0.6;
        this.rallyPoint.y += (nearest.y-this.rallyPoint.y)*this.behavior.gunfireAttraction*dt*0.6;
      }
    }
    // edge-preferring squads slowly drift their rally point back toward the map perimeter
    if(this.behavior.edgePreference){
      const midX = game.map.worldW/2, midY = game.map.worldH/2;
      const dx = this.rallyPoint.x-midX, dy = this.rallyPoint.y-midY;
      const d = Math.hypot(dx,dy) || 1;
      this.rallyPoint.x += (dx/d) * 12 * dt;
      this.rallyPoint.y += (dy/d) * 12 * dt;
    }
    // pack tightness: pull straggling members back toward the centroid a little
    if(this.behavior.packTightness>0){
      alive.forEach(m=>{
        if(m.state==='patrol'){
          const d = Math.hypot(m.x-cx, m.y-cy);
          if(d > 260){
            const pull = Math.atan2(cy-m.y, cx-m.x);
            m._moveTry(game.map.walls, pull, m.speed*this.behavior.packTightness*0.5*dt);
          }
        }
      });
    }
  }
}

class Pickup{
  constructor(type, x, y, extra){
    this.type = type; // 'ammo' | 'weapon' | 'upgrade'
    this.x=x; this.y=y; this.extra = extra || null;
    this.collected = false;
    this.bob = Math.random()*Math.PI*2;
  }
}

// ------------------------------------------------------------------------------------------
// 8b2. CHESTS - take time to open (channel-based, not a quiz) and drop ammo plus an upgrade.
//     Anyone can open one: the player (which disables their weapon for the duration - see
//     Player.openingChest / _handleAutoFire) or an idle ('patrol' state) enemy, who gets a
//     temporary combat buff out of it instead of ammo, since enemies don't carry magazines.
//     Only one opener makes progress at a time; walking away lets the progress decay back down
//     rather than resetting outright, so a brief interruption isn't fully wasted.
// ------------------------------------------------------------------------------------------
class Chest{
  constructor(x,y){
    this.x=x; this.y=y;
    this.opened = false;
    this.progress = 0;
    this.requiredTime = 3.5;
    this.openerType = null; // 'player' | 'enemy' | null
    this.openerRef = null;  // the Enemy instance, when openerType==='enemy'
  }
}
function drawChestIcon(ctx,x,y,opened){
  ctx.save();
  ctx.translate(x,y);
  // shadow
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(1,9,11,3,0,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  // body with subtle wood-grain lines
  ctx.fillStyle = opened ? '#3a3226' : '#6b4a20';
  ctx.fillRect(-11,-7,22,14);
  ctx.strokeStyle = opened ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 0.6;
  for(let gx=-7; gx<=7; gx+=4){ ctx.beginPath(); ctx.moveTo(gx,-2); ctx.lineTo(gx,7); ctx.stroke(); }
  // lid
  ctx.fillStyle = opened ? '#2a2418' : '#8a5f28';
  ctx.fillRect(-11,-7,22,5);
  // metal corner bands
  ctx.fillStyle = opened ? '#4a4438' : '#c9a24a';
  ctx.fillRect(-11,-7,3,14);
  ctx.fillRect(8,-7,3,14);
  ctx.strokeStyle = opened ? '#2a2418' : '#5c4118'; ctx.lineWidth = 0.6;
  ctx.strokeRect(-11,-7,3,14); ctx.strokeRect(8,-7,3,14);
  // lock
  ctx.beginPath();
  ctx.arc(0,-2,2.6,0,Math.PI*2);
  ctx.fillStyle = opened ? '#5a5040' : '#ffe27a';
  ctx.fill();
  ctx.strokeStyle = opened ? '#2a2418' : '#8a5f28';
  ctx.lineWidth = 1;
  ctx.stroke();
  // outline
  ctx.strokeStyle = opened ? '#5a5040' : '#3a2a10';
  ctx.lineWidth = 1.3;
  ctx.strokeRect(-11,-7,22,14);
  ctx.lineWidth = 1;
  ctx.restore();
}

// Gravestones mark where something died and stick around for the rest of the round. Looked up
// by style id so a future Armoury tab could sell alternate styles - just point
// this.progress.gravestoneStyle at a different key and everything downstream (spawn +
// render) picks it up automatically with no other changes.
const GRAVESTONE_STYLES = {
  default: (ctx,x,y)=>{
    ctx.save();
    ctx.translate(x,y);
    // shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(1,8,7,2.3,0,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    // stone body
    ctx.fillStyle = '#6f6f6f';
    ctx.beginPath();
    ctx.moveTo(-6,7); ctx.lineTo(-6,-1);
    ctx.arc(0,-1,6,Math.PI,0);
    ctx.lineTo(6,7);
    ctx.closePath();
    ctx.fill();
    // shaded half for a bit of roundness
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-6,-8,6,16);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(1,-8,3,16);
    ctx.restore();
    // outline
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6,7); ctx.lineTo(-6,-1);
    ctx.arc(0,-1,6,Math.PI,0);
    ctx.lineTo(6,7);
    ctx.stroke();
    // engraved lines
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-3,2); ctx.lineTo(3,2); ctx.moveTo(-2,4); ctx.lineTo(2,4); ctx.stroke();
    // hairline crack
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-1,-4); ctx.lineTo(1,-1); ctx.lineTo(-1,2); ctx.stroke();
    // moss flecks at the base
    ctx.fillStyle = 'rgba(110,150,80,0.55)';
    ctx.beginPath(); ctx.arc(-4,5.5,1.1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5,6,0.8,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
};

function drawCustomTombstone(ctx,x,y,style){
  const pulse=.72+Math.sin(performance.now()/260)*.18;
  ctx.save();ctx.translate(x,y);
  ctx.globalAlpha=.3;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(1,9,10,3,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  if(style==='iron_cross'){
    ctx.fillStyle='#424b54';ctx.strokeStyle='#171c21';ctx.lineWidth=1.5;ctx.fillRect(-3,-10,6,18);ctx.fillRect(-8,-5,16,6);ctx.strokeRect(-3,-10,6,18);ctx.strokeRect(-8,-5,16,6);
    ctx.fillStyle='#9aa5ae';ctx.fillRect(-1,-8,1,13);
  }else if(style==='western_wood'){
    ctx.fillStyle='#76502d';ctx.strokeStyle='#33200f';ctx.lineWidth=1.4;ctx.fillRect(-2,-9,4,18);ctx.fillRect(-9,-5,18,4);ctx.strokeRect(-2,-9,4,18);ctx.strokeRect(-9,-5,18,4);
    ctx.fillStyle='#e6bd55';ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?2:4;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r-3)}ctx.closePath();ctx.fill();
  }else if(style==='field_skull'){
    ctx.fillStyle='#777b80';ctx.strokeStyle='#282b30';ctx.lineWidth=1.2;ctx.beginPath();ctx.roundRect(-8,-8,16,17,4);ctx.fill();ctx.stroke();
    ctx.fillStyle='#ddd3b7';ctx.beginPath();ctx.arc(0,-2,5,0,Math.PI*2);ctx.fill();ctx.fillRect(-3,1,6,5);ctx.fillStyle='#222';ctx.beginPath();ctx.arc(-2,-2,1.3,0,Math.PI*2);ctx.arc(2,-2,1.3,0,Math.PI*2);ctx.fill();
  }else if(style==='academy_book'){
    ctx.fillStyle='#68717b';ctx.strokeStyle='#272d33';ctx.beginPath();ctx.roundRect(-7,-9,14,16,4);ctx.fill();ctx.stroke();
    ctx.fillStyle='#eee7cf';ctx.beginPath();ctx.moveTo(-11,4);ctx.quadraticCurveTo(-5,1,0,5);ctx.quadraticCurveTo(5,1,11,4);ctx.lineTo(10,9);ctx.quadraticCurveTo(5,6,0,9);ctx.quadraticCurveTo(-5,6,-10,9);ctx.closePath();ctx.fill();ctx.stroke();
  }else if(style==='neon_pulse'){
    ctx.shadowColor='#31d8ff';ctx.shadowBlur=9*pulse;ctx.fillStyle='#102c38';ctx.strokeStyle='#31d8ff';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-7,8);ctx.lineTo(-6,-5);ctx.lineTo(0,-11);ctx.lineTo(6,-5);ctx.lineTo(7,8);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=`rgba(49,216,255,${pulse})`;ctx.fillRect(-1,-6,2,10);
  }else if(style==='samurai_stone'){
    ctx.fillStyle='#62676d';ctx.strokeStyle='#24272b';ctx.beginPath();ctx.roundRect(-8,-7,16,16,2);ctx.fill();ctx.stroke();ctx.strokeStyle='#d7e0e8';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-10,-9);ctx.lineTo(8,7);ctx.moveTo(10,-9);ctx.lineTo(-8,7);ctx.stroke();ctx.fillStyle='#9b2734';ctx.beginPath();ctx.arc(0,-1,3,0,Math.PI*2);ctx.fill();
  }else if(style==='crystal_spire'){
    ctx.shadowColor='#c58fff';ctx.shadowBlur=10;ctx.fillStyle='#7044a3';ctx.strokeStyle='#dfbfff';ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(8,3);ctx.lineTo(4,9);ctx.lineTo(-5,8);ctx.lineTo(-8,2);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='rgba(255,255,255,.35)';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(2,5);ctx.lineTo(-3,6);ctx.closePath();ctx.fill();
  }else if(style==='golden_hero'){
    ctx.fillStyle='#c59222';ctx.strokeStyle='#ffe58a';ctx.lineWidth=1.4;ctx.beginPath();ctx.roundRect(-8,-9,16,18,5);ctx.fill();ctx.stroke();ctx.fillStyle='#ffe58a';ctx.beginPath();ctx.arc(0,-2,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#9b6a13';ctx.fillRect(-5,4,10,2);
  }else if(style==='flame_altar'){
    ctx.fillStyle='#2d3036';ctx.strokeStyle='#111';ctx.fillRect(-9,2,18,7);ctx.strokeRect(-9,2,18,7);ctx.fillRect(-6,-3,12,6);ctx.strokeRect(-6,-3,12,6);ctx.fillStyle='#ffb52e';ctx.beginPath();ctx.moveTo(0,1);ctx.quadraticCurveTo(-7,-5,-1,-13);ctx.quadraticCurveTo(1,-7,5,-10);ctx.quadraticCurveTo(7,-2,0,1);ctx.fill();ctx.fillStyle='#ff5145';ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-3,-4,1,-8);ctx.quadraticCurveTo(4,-3,0,0);ctx.fill();
  }else if(style==='void_obelisk'){
    ctx.shadowColor='#8b32d9';ctx.shadowBlur=12*pulse;ctx.fillStyle='#100d18';ctx.strokeStyle='#a855f7';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(7,-7);ctx.lineTo(6,9);ctx.lineTo(-6,9);ctx.lineTo(-7,-7);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle=`rgba(213,166,255,${pulse})`;ctx.beginPath();ctx.arc(0,-2,3,0,Math.PI*2);ctx.moveTo(-3,-2);ctx.lineTo(3,-2);ctx.stroke();
  }
  ctx.restore();
}
TOMBSTONE_CONFIG.forEach(item=>{GRAVESTONE_STYLES[item.id]=(ctx,x,y)=>drawCustomTombstone(ctx,x,y,item.id);});
function drawGravestone(ctx,x,y,style){
  const fn = GRAVESTONE_STYLES[style] || GRAVESTONE_STYLES.default;
  fn(ctx,x,y);
}

// ------------------------------------------------------------------------------------------
// 4c. BACKGROUND CLUTTER - purely decorative floor dressing, one themed set per map. Never
//     added to the wall list, never checked by collision/reachability/spawn validation -
//     you can walk straight over every piece of it. Exists only to make each theme's rooms
//     feel less like an empty box and more like a specific kind of place. Shapes are fully
//     deterministic (no per-frame randomness) so nothing flickers; instance-level variety
//     comes from a random rotation/scale chosen once at spawn time instead.
// ------------------------------------------------------------------------------------------
function drawClutterRock(ctx,x,y,color){
  ctx.save(); ctx.translate(x,y);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = shadeColor(color,-25);
  ctx.beginPath(); ctx.ellipse(1,1,7,5,0.3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0,0,7,5,0.3,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-5,2,4,3,-0.2,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawClutterVegetation(ctx,x,y,color){
  ctx.save(); ctx.translate(x,y);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const blades = [-0.55,-0.18,0.18,0.55];
  blades.forEach(offset=>{
    const ang = -Math.PI/2 + offset;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.quadraticCurveTo(Math.cos(ang)*4, Math.sin(ang)*8, Math.cos(ang)*3, Math.sin(ang)*13);
    ctx.stroke();
  });
  ctx.lineWidth = 1; ctx.lineCap = 'butt';
  ctx.restore();
}
function drawClutterCrack(ctx,x,y,color){
  ctx.save(); ctx.translate(x,y);
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = color; ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-8,-3); ctx.lineTo(-2,1); ctx.lineTo(3,-2); ctx.lineTo(9,4);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-2,1); ctx.lineTo(-4,6); ctx.stroke();
  ctx.restore();
}
function drawClutterPanel(ctx,x,y,color){
  ctx.save(); ctx.translate(x,y);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = shadeColor(color,-20);
  ctx.fillRect(-9,-6,18,12);
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.strokeRect(-9,-6,18,12);
  for(let lx=-6; lx<=6; lx+=4){ ctx.beginPath(); ctx.moveTo(lx,-6); ctx.lineTo(lx,6); ctx.stroke(); }
  ctx.restore();
}
function drawClutterPuddle(ctx,x,y,color){
  ctx.save(); ctx.translate(x,y);
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0,0,10,6,0.2,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha = 0.22;
  ctx.beginPath(); ctx.ellipse(-3,-1,4,2,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawClutterDebris(ctx,x,y,color){
  ctx.save(); ctx.translate(x,y);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = color;
  [[-3,-2],[2,-3],[-1,3],[4,1]].forEach(([dx,dy])=>{ ctx.fillRect(dx-1.3,dy-1.3,2.6,2.6); });
  ctx.restore();
}

const CLUTTER_STYLES = {
  industrial: [ {fn:drawClutterPanel, color:'#5a7690'}, {fn:drawClutterDebris, color:'#3a4550'}, {fn:drawClutterCrack, color:'#2a3540'} ],
  desert:     [ {fn:drawClutterRock, color:'#9a7a4a'}, {fn:drawClutterDebris, color:'#c9a86a'}, {fn:drawClutterCrack, color:'#5a4020'} ],
  arctic:     [ {fn:drawClutterRock, color:'#cfe8f5'}, {fn:drawClutterPuddle, color:'#aee0f5'}, {fn:drawClutterCrack, color:'#7fb8d0'} ],
  jungle:     [ {fn:drawClutterVegetation, color:'#5cae4a'}, {fn:drawClutterRock, color:'#5c6a4a'}, {fn:drawClutterPuddle, color:'#3a5a3a'} ],
  neon:       [ {fn:drawClutterPanel, color:'#a85cff'}, {fn:drawClutterPuddle, color:'#5cd6ff'}, {fn:drawClutterDebris, color:'#6a4a8a'} ],
  bunker:     [ {fn:drawClutterCrack, color:'#3a3228'}, {fn:drawClutterDebris, color:'#5a4e3c'}, {fn:drawClutterPanel, color:'#6a5a44'} ],
  volcanic:   [ {fn:drawClutterRock, color:'#3a2018'}, {fn:drawClutterCrack, color:'#ff6a3a'}, {fn:drawClutterDebris, color:'#5a2a1a'} ],
  station:    [ {fn:drawClutterPanel, color:'#7aa0c0'}, {fn:drawClutterDebris, color:'#4a6580'}, {fn:drawClutterCrack, color:'#3a5570'} ],
  swamp:      [ {fn:drawClutterVegetation, color:'#7a9a4a'}, {fn:drawClutterPuddle, color:'#5a5030'}, {fn:drawClutterRock, color:'#4a3a28'} ],
  fortress:   [ {fn:drawClutterCrack, color:'#6a2a30'}, {fn:drawClutterVegetation, color:'#5a7a4a'}, {fn:drawClutterDebris, color:'#4a1a20'} ]
};

// ------------------------------------------------------------------------------------------
// 8c. PICKUP SPRITES - small procedural icons drawn straight on canvas (no external image
//     assets, so the whole game still ships as one file). Each function draws centred on
//     (x,y) at roughly a 16px footprint. Easy to swap for real art later: just replace the
//     body of each function, the call sites in _render() don't need to change.
// ------------------------------------------------------------------------------------------
function drawAmmoIcon(ctx,x,y){
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle = '#2a1d0a';
  ctx.fillRect(-3,-2,6,9);
  ctx.fillStyle = '#d9a441';
  ctx.fillRect(-3,-2,6,6);
  ctx.beginPath();
  ctx.moveTo(-3,-2); ctx.lineTo(3,-2); ctx.lineTo(0,-8); ctx.closePath();
  ctx.fillStyle = '#ffe27a';
  ctx.fill();
  ctx.strokeStyle = '#5a3d10'; ctx.lineWidth = 0.6;
  ctx.strokeRect(-3,-2,6,9);
  ctx.lineWidth = 1;
  ctx.restore();
}
function drawWeaponIcon(ctx,x,y,color){
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle = color;
  ctx.fillRect(-7,-2,12,3);   // slide/barrel
  ctx.fillRect(2,-2,3,8);     // grip
  ctx.strokeStyle = '#0a0f14'; ctx.lineWidth = 0.8;
  ctx.strokeRect(-7,-2,12,3);
  ctx.strokeRect(2,-2,3,8);
  ctx.lineWidth = 1;
  ctx.restore();
}
function drawScopeIcon(ctx,x,y){
  ctx.save();
  ctx.translate(x,y);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-7,0); ctx.lineTo(-5,0); ctx.moveTo(5,0); ctx.lineTo(7,0);
  ctx.moveTo(0,-7); ctx.lineTo(0,-5); ctx.moveTo(0,5); ctx.lineTo(0,7);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.restore();
}
function drawMagIcon(ctx,x,y){
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-3,-7,6,14);
  ctx.strokeStyle = '#0a0f14'; ctx.lineWidth = 0.8;
  for(let i=-5;i<=5;i+=3){ ctx.beginPath(); ctx.moveTo(-3,i); ctx.lineTo(3,i); ctx.stroke(); }
  ctx.lineWidth = 1;
  ctx.restore();
}
function drawStockIcon(ctx,x,y){
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-7,-3); ctx.lineTo(3,-3); ctx.lineTo(3,3); ctx.lineTo(-3,6); ctx.lineTo(-7,6); ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function drawSilencerIcon(ctx,x,y){
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-8,-2,16,4);
  ctx.strokeStyle = '#0a0f14'; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-4,-2); ctx.lineTo(-4,2); ctx.moveTo(0,-2); ctx.lineTo(0,2); ctx.moveTo(4,-2); ctx.lineTo(4,2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.restore();
}
function drawBarrelIcon(ctx,x,y){
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-8,-1.5,16,3);
  ctx.strokeStyle = '#0a0f14'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(-8,-1.5); ctx.lineTo(8,-1.5); ctx.moveTo(-8,1.5); ctx.lineTo(8,1.5); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.restore();
}
function drawChokeIcon(ctx,x,y){
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-7,-5); ctx.lineTo(7,-5); ctx.lineTo(2,5); ctx.lineTo(-2,5); ctx.closePath();
  ctx.fill();
  ctx.restore();
}
const UPGRADE_ICONS = {
  scope: drawScopeIcon,
  extendedMag: drawMagIcon,
  stock: drawStockIcon,
  silencer: drawSilencerIcon,
  improvedBarrel: drawBarrelIcon,
  choke: drawChokeIcon
};

// ------------------------------------------------------------------------------------------
// 8d. CHARACTER SPRITES - procedural top-down humanoids, one per enemy archetype plus the
//     player. Everything is drawn in local space with "forward" along +x, then rotated to the
//     character's facing angle - so silhouette shape (build, stance, weapon) reads correctly
//     from any angle without needing separate directional frames. Each archetype's body
//     proportions and loadout reflect its role (e.g. Shotgunner is deliberately the widest,
//     bulkiest build; Sniper trails a cloak and carries the longest weapon).
//
//     drawHumanoidBody and drawWeaponLine are the shared base every character is built on
//     (torso/head/shading and gun shape respectively) - upgrading these two functions alone
//     adds detail to all 12 characters at once; each archetype's own function then layers a
//     few extra accent shapes (cloak, shield, shoulder pads, etc.) on top of that shared base.
// ------------------------------------------------------------------------------------------
// Lightens (positive percent) or darkens (negative) a '#rrggbb' colour for cheap pseudo-shading.
function shadeColor(hex, percent){
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  const amt = Math.round(2.55 * percent);
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}
function drawHumanoidBody(ctx, bodyLen, bodyWidth, headR, bodyColor, outlineColor){
  const dark = shadeColor(bodyColor, -32);
  const light = shadeColor(bodyColor, 28);
  const outline = outlineColor || 'rgba(0,0,0,0.5)';

  // drop shadow, offset slightly so the body reads as raised off the ground
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(2, 3, bodyLen*0.46, bodyWidth*0.34, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // separated boots make movement direction and stance readable at gameplay scale
  ctx.fillStyle = '#151b22';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  for(const side of [-1,1]){
    ctx.beginPath();
    ctx.ellipse(-bodyLen*0.29, side*bodyWidth*0.34, bodyLen*0.22, bodyWidth*0.16, -.12*side, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
  }

  // backpack/pack bump on the back (-x side), gives the silhouette some depth
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-bodyLen*0.3, 0, bodyWidth*0.24, bodyWidth*0.34, 0, 0, Math.PI*2);
  ctx.fill();

  // torso
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyLen/2, bodyWidth/2, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();

  // tactical vest, centre seam, belt and two small utility pouches
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(-bodyLen*.18,-bodyWidth*.3,bodyLen*.36,bodyWidth*.6,2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = .7;
  ctx.beginPath();ctx.moveTo(0,-bodyWidth*.27);ctx.lineTo(0,bodyWidth*.27);ctx.stroke();
  ctx.strokeStyle = outline;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(-bodyLen*.12,-bodyWidth*.31);ctx.lineTo(-bodyLen*.12,bodyWidth*.31);ctx.stroke();
  ctx.fillStyle=light;
  ctx.fillRect(-bodyLen*.08,-bodyWidth*.27,bodyLen*.12,bodyWidth*.13);
  ctx.fillRect(-bodyLen*.08,bodyWidth*.14,bodyLen*.12,bodyWidth*.13);

  // top-front sheen for a bit of pseudo-3D roundness
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(bodyLen*0.1, -bodyWidth*0.18, bodyLen*0.28, bodyWidth*0.15, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // shoulders, one each side, darker than the torso for definition
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(bodyLen*0.04, -bodyWidth*0.44, bodyWidth*0.2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(bodyLen*0.04, bodyWidth*0.44, bodyWidth*0.2, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = outline; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(bodyLen*0.04, -bodyWidth*0.44, bodyWidth*0.2, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(bodyLen*0.04, bodyWidth*0.44, bodyWidth*0.2, 0, Math.PI*2); ctx.stroke();

  // forearms reach toward the weapon instead of disappearing into the torso
  ctx.strokeStyle = dark;ctx.lineWidth=Math.max(2,bodyWidth*.15);ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(bodyLen*.08,-bodyWidth*.4);ctx.lineTo(bodyLen*.34,-bodyWidth*.22);ctx.stroke();
  ctx.beginPath();ctx.moveTo(bodyLen*.08,bodyWidth*.4);ctx.lineTo(bodyLen*.38,bodyWidth*.24);ctx.stroke();

  // head, with a darker visor/face wedge on the forward side so facing reads clearly
  ctx.fillStyle = bodyColor;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(bodyLen*0.3, 0, headR, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(bodyLen*0.3 + headR*0.3, 0, headR*0.6, -Math.PI/2, Math.PI/2);
  ctx.fill();
  // helmet rim, visor shine, and tiny comms earpiece
  ctx.strokeStyle = light;ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(bodyLen*.3,0,headR*.72,-Math.PI*.72,Math.PI*.72);ctx.stroke();
  ctx.strokeStyle='rgba(190,240,255,.75)';ctx.lineWidth=1.2;
  ctx.beginPath();ctx.moveTo(bodyLen*.3+headR*.38,-headR*.34);ctx.lineTo(bodyLen*.3+headR*.64,-headR*.08);ctx.stroke();
  ctx.fillStyle='#202832';ctx.beginPath();ctx.arc(bodyLen*.27,-headR*.82,Math.max(1,headR*.18),0,Math.PI*2);ctx.fill();
  ctx.lineWidth = 1;
  ctx.lineCap = 'butt';
}
function drawWeaponLine(ctx, length, width, offsetY, color, startX){
  const sx = startX==null ? 4 : startX;
  const dir = offsetY>=0 ? 1 : -1;
  const metal = '#687480';
  // rear stock and receiver give each firearm a recognisable profile
  ctx.strokeStyle=shadeColor(color.startsWith('#')?color:'#444444',-18);
  ctx.lineWidth=Math.max(2,width*.9);ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(sx-5,offsetY);ctx.lineTo(sx+length*.32,offsetY);ctx.stroke();
  ctx.fillStyle=color;ctx.strokeStyle='#111820';ctx.lineWidth=.8;
  ctx.beginPath();ctx.roundRect(sx+length*.2,offsetY-width*.72,length*.34,width*1.45,1.5);ctx.fill();ctx.stroke();
  // barrel
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, offsetY);
  ctx.lineTo(sx+length, offsetY);
  ctx.stroke();
  // top rail and sight
  ctx.strokeStyle=metal;ctx.lineWidth=Math.max(1,width*.28);
  ctx.beginPath();ctx.moveTo(sx+length*.3,offsetY-width*.85);ctx.lineTo(sx+length*.62,offsetY-width*.85);ctx.stroke();
  ctx.fillStyle='#a9efff';ctx.fillRect(sx+length*.5-1,offsetY-width*1.35,2,2);
  // grip, angled down/away from the body line
  ctx.lineWidth = Math.max(1.4, width*0.75);
  ctx.beginPath();
  ctx.moveTo(sx+length*0.18, offsetY);
  ctx.lineTo(sx+length*0.1, offsetY + width*2.1*dir);
  ctx.stroke();
  // magazine hint, a shorter stroke ahead of the grip
  ctx.lineWidth = Math.max(1.2, width*0.6);
  ctx.beginPath();
  ctx.moveTo(sx+length*0.34, offsetY);
  ctx.lineTo(sx+length*0.27, offsetY + width*1.5*dir);
  ctx.stroke();
  // muzzle tip highlight so the barrel end reads distinctly from the body of the gun
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(sx+length, offsetY, Math.max(1.1, width*0.4), 0, Math.PI*2);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.lineCap = 'butt';
}

function drawGruntSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 22, 16, 7, color);
  drawWeaponLine(ctx, 16, 3, 3, '#2a2a2a');
  ctx.restore();
}
function drawRusherSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 18, 12, 6, color); // lean, fast build
  ctx.strokeStyle='#e8e8e8'; ctx.lineWidth=2; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(2,4); ctx.lineTo(13,7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2,-4); ctx.lineTo(13,-7); ctx.stroke();
  ctx.lineWidth=1; ctx.lineCap='butt';
  ctx.restore();
}
function drawShotgunnerSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 27, 25, 8, color); // large, bulky build
  drawWeaponLine(ctx, 13, 5.5, 4, '#3a2a1a');
  // bright shell loops across the vest
  for(let i=0;i<3;i++){ctx.fillStyle='#e7b64d';ctx.fillRect(-5+i*4,-8,2,5);ctx.fillStyle='#9b2f28';ctx.fillRect(-5+i*4,-4,2,2);}
  ctx.restore();
}
function drawRiflemanSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 22, 16, 7, color);
  drawWeaponLine(ctx, 23, 3, 3, '#2a2a2a');
  ctx.fillStyle='#6e7c43';ctx.fillRect(-8,-7,4,5);ctx.fillRect(-8,2,4,5);
  ctx.restore();
}
function drawSniperSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  ctx.fillStyle='rgba(0,0,0,0.4)'; // trailing cloak
  ctx.beginPath(); ctx.moveTo(-7,-10); ctx.lineTo(-7,10); ctx.lineTo(-21,0); ctx.closePath(); ctx.fill();
  drawHumanoidBody(ctx, 19, 13, 6, color);
  drawWeaponLine(ctx, 31, 2.5, 2, '#1a1a1a');
  ctx.fillStyle='#87d7ee';ctx.strokeStyle='#13202a';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(13,-1,10,3,1.5);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#45525e';ctx.beginPath();ctx.moveTo(18,2);ctx.lineTo(13,9);ctx.moveTo(18,2);ctx.lineTo(23,9);ctx.stroke();
  ctx.restore();
}
function drawHeavySprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 28, 28, 9, color); // massive, armoured build
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(-3,-12,6,5,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-3,12,6,5,0,0,Math.PI*2); ctx.fill();
  drawWeaponLine(ctx, 18, 6, 5, '#2a2a2a');
  drawWeaponLine(ctx, 18, 6, -5, '#2a2a2a');
  // segmented chest armour and an ammunition belt
  ctx.strokeStyle='#ffcf5c';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(-9,-10);ctx.lineTo(8,10);ctx.stroke();
  for(let i=-5;i<=5;i+=3){ctx.fillStyle='#b78328';ctx.fillRect(i-1,i-1,3,4);}
  ctx.restore();
}
function drawFlankerSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 17, 12, 6, color);
  drawWeaponLine(ctx, 9, 2.5, 5, '#2a2a2a');
  drawWeaponLine(ctx, 9, 2.5, -5, '#2a2a2a');
  ctx.strokeStyle='#5cffe0';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-8,-5);ctx.lineTo(-13,0);ctx.lineTo(-8,5);ctx.stroke();
  ctx.restore();
}
function drawGuardSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 22, 19, 7, color);
  ctx.fillStyle='#8a94a0'; ctx.strokeStyle='#3a4552'; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.ellipse(-3,11,4.5,8,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle='#bce7ff';ctx.beginPath();ctx.moveTo(-5,7);ctx.lineTo(-5,15);ctx.moveTo(-8,11);ctx.lineTo(-2,11);ctx.stroke();
  ctx.lineWidth=1;
  drawWeaponLine(ctx, 14, 3, -4, '#2a2a2a');
  ctx.restore();
}
function drawMedicSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 18, 14, 6, color);
  ctx.fillStyle='#fff';
  ctx.fillRect(-2,-4,4,8);
  ctx.fillRect(-4,-2,8,4);
  ctx.fillStyle='#39434d';ctx.fillRect(-10,-7,5,14);
  ctx.restore();
}
function drawBrawlerSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 24, 22, 8, color); // bulky melee bruiser, tankier than Rusher
  // bare knuckles instead of a weapon
  ctx.fillStyle = '#e8c9a8';
  ctx.beginPath(); ctx.arc(9,4,3,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(9,-4,3,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawMarksmanSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 20, 14, 6, color); // lean, mobile mid/long-range unit
  drawWeaponLine(ctx, 26, 2.5, 2, '#2a2a2a');
  ctx.fillStyle='#ffd15c';ctx.beginPath();ctx.arc(18,-1,2,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawScoutSprite(ctx,x,y,angle,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 15, 10, 5, color); // smallest, fastest build
  drawWeaponLine(ctx, 8, 2, 2, '#2a2a2a');
  // small pack/antenna to read as a spotter/scout silhouette
  ctx.fillStyle = '#333';
  ctx.fillRect(-8,-2,3,4);
  ctx.strokeStyle='#9eefff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-7,-2);ctx.lineTo(-11,-9);ctx.stroke();
  ctx.fillStyle='#ff5c5c';ctx.beginPath();ctx.arc(-11,-9,1.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
const ENEMY_SPRITES = {
  grunt: drawGruntSprite, rusher: drawRusherSprite, shotgunner: drawShotgunnerSprite,
  rifleman: drawRiflemanSprite, sniper: drawSniperSprite, heavy: drawHeavySprite,
  flanker: drawFlankerSprite, guard: drawGuardSprite, medic: drawMedicSprite,
  brawler: drawBrawlerSprite, marksman: drawMarksmanSprite, scout: drawScoutSprite
};

function drawPlayerSprite(ctx,x,y,angle,weaponColor){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  drawHumanoidBody(ctx, 22, 17, 7, '#3a6a8a', '#8fd3ff');
  ctx.fillStyle='rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(0,0,8,5,0,0,Math.PI*2); ctx.fill();
  // academy-blue armour panels, shoulder lights, and a clear player chevron
  ctx.fillStyle='#17384d';ctx.strokeStyle='#8fd3ff';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(-6,-5,9,10,2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#8fd3ff';ctx.beginPath();ctx.arc(1,-8,1.6,0,Math.PI*2);ctx.arc(1,8,1.6,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-4,-3);ctx.lineTo(0,0);ctx.lineTo(-4,3);ctx.stroke();
  drawWeaponLine(ctx, 20, 3, 3, weaponColor||'#5ad1ff');
  ctx.restore();
}


// ------------------------------------------------------------------------------------------
// 9. MAIN GAME CLASS
// ------------------------------------------------------------------------------------------
class Game{
  constructor(){
    this.isTouchDevice=(navigator.maxTouchPoints||0)>0||'ontouchstart' in window;
    document.documentElement.classList.toggle('touch-device',this.isTouchDevice);
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.canvas.width;
    this.fogCanvas.height = this.canvas.height;
    this.fogCtx = this.fogCanvas.getContext('2d');

    this.keys = {};
    this.mouse = { x: this.canvas.width/2, y: this.canvas.height/2 };
    this.touchMove={x:0,y:0};
    this.touchAim={x:1,y:0,active:false,engaged:false};
    this.paused = false;
    this.running = false;

    this.progress = this._loadProgress();
    this.questionManager = new ShooterQuestionFlow(this);
    this.gameMode = 'teaming'; // 'teaming' | 'ffa' - set from the start screen toggle

    // Hidden adaptive difficulty. Never surfaced to the player anywhere (no HUD element, no
    // message) - just a multiplier applied to enemy detection range, aggression, and fire
    // rate at spawn time. It nudges up after a win and down after a loss, but the two step
    // sizes are deliberately asymmetric: win/lossStep ratio matches 0.65/0.35, so the random
    // walk this produces settles into equilibrium around a 65% player win rate rather than
    // 50% - the player keeps winning more often than not, but it never gets easy.
    this.adaptiveDifficulty = {
      mult: 1.0,
      winStep: 0.05,
      lossStep: 0.05 * (0.65/0.35),
      min: 0.65,
      max: 1.55
    };

    this._bindInput();
    this._resizeCanvas();
    window.addEventListener('resize',()=>this._resizeCanvas());
    window.visualViewport?.addEventListener('resize',()=>this._resizeCanvas());
  }

  _loadProgress(){
    try{
      const saved = JSON.parse(localStorage.getItem(GAME_CONFIG.saveKey) || 'null');
      return {
        unlockedWeapons:new Set(saved?.unlockedWeapons?.length ? saved.unlockedWeapons : ['pistol']),
        ownedTombstones:new Set(['default',...(saved?.ownedTombstones || [])]),
        gravestoneStyle:GRAVESTONE_STYLES[saved?.gravestoneStyle] ? saved.gravestoneStyle : 'default'
      };
    }catch(_){ return { unlockedWeapons:new Set(['pistol']), ownedTombstones:new Set(['default']), gravestoneStyle:'default' }; }
  }

  saveProgress(){
    if(window.PlatformManager?.isPracticeMode?.()) return;
    localStorage.setItem(GAME_CONFIG.saveKey, JSON.stringify({
      unlockedWeapons:[...this.progress.unlockedWeapons],
      ownedTombstones:[...this.progress.ownedTombstones],
      gravestoneStyle:this.progress.gravestoneStyle
    }));
  }

  _bindInput(){
    window.addEventListener('keydown', e=>{
      this.keys[e.code] = true;
      if(e.code==='KeyR' && this.running && !this.paused){this.player.startReload();this.registerSound(this.player.x,this.player.y,'reload',260);}
      if(e.code==='KeyQ' && !e.repeat) this.deployPowerup();
      if(e.code==='KeyE' && !e.repeat) this.deployItem();
    });
    window.addEventListener('keyup', e=>{ this.keys[e.code]=false; });
    this.canvas.addEventListener('mousemove', e=>{
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX-rect.left) * (this.canvas.width/rect.width);
      this.mouse.y = (e.clientY-rect.top) * (this.canvas.height/rect.height);
      this.touchAim.engaged=false;
    });
    this._bindTouchStick(document.getElementById('moveStick'),(x,y,active)=>{this.touchMove={x:active?x:0,y:active?y:0};});
    this._bindTouchStick(document.getElementById('aimStick'),(x,y,active)=>{if(active&&Math.hypot(x,y)>.12)this.touchAim={x,y,active:true,engaged:true};else this.touchAim.active=false;});
    document.getElementById('touchReloadBtn').addEventListener('click',e=>{e.preventDefault();if(this.running&&!this.paused){this.player.startReload();this.registerSound(this.player.x,this.player.y,'reload',260);}});
    const releaseTouchControls=()=>{this.touchMove={x:0,y:0};this.touchAim.active=false;document.querySelectorAll('.touch-stick i').forEach(knob=>knob.style.transform='');};
    window.addEventListener('blur',releaseTouchControls);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseTouchControls();});
  }

  _resizeCanvas(){
    const viewport=window.visualViewport;
    const width=Math.max(1,Math.round(viewport?.width||document.documentElement.clientWidth||window.innerWidth||960));
    const height=Math.max(1,Math.round(viewport?.height||document.documentElement.clientHeight||window.innerHeight||640));
    document.documentElement.style.setProperty('--game-viewport-height',`${height}px`);
    this.canvas.width=width;this.canvas.height=height;
    this.fogCanvas.width=width;this.fogCanvas.height=height;
    if(!this.touchAim.active){this.mouse.x=width/2;this.mouse.y=height/2;}
  }

  _bindTouchStick(element,onChange){
    if(!element)return;const knob=element.querySelector('i');let pointer=null;
    const move=e=>{if(pointer!==e.pointerId)return;e.preventDefault();const rect=element.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,limit=rect.width*.3,dx=e.clientX-cx,dy=e.clientY-cy,length=Math.hypot(dx,dy)||1,scale=Math.min(1,limit/length),px=dx*scale,py=dy*scale;knob.style.transform=`translate(${px}px,${py}px)`;onChange(px/limit,py/limit,true);};
    const end=e=>{if(pointer!==e.pointerId)return;pointer=null;knob.style.transform='';onChange(0,0,false);};
    element.addEventListener('pointerdown',e=>{e.preventDefault();pointer=e.pointerId;element.setPointerCapture?.(pointer);move(e);});
    element.addEventListener('pointermove',move);element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);element.addEventListener('lostpointercapture',end);
    if(!window.PointerEvent){
      let touchId=null;
      const touchMove=e=>{const touch=[...e.changedTouches].find(item=>item.identifier===touchId);if(!touch)return;e.preventDefault();const rect=element.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,limit=rect.width*.3,dx=touch.clientX-cx,dy=touch.clientY-cy,length=Math.hypot(dx,dy)||1,scale=Math.min(1,limit/length),px=dx*scale,py=dy*scale;knob.style.transform=`translate(${px}px,${py}px)`;onChange(px/limit,py/limit,true);};
      const touchEnd=e=>{if(![...e.changedTouches].some(item=>item.identifier===touchId))return;touchId=null;knob.style.transform='';onChange(0,0,false);};
      element.addEventListener('touchstart',e=>{if(touchId!==null)return;touchId=e.changedTouches[0].identifier;touchMove(e);},{passive:false});
      element.addEventListener('touchmove',touchMove,{passive:false});element.addEventListener('touchend',touchEnd,{passive:false});element.addEventListener('touchcancel',touchEnd,{passive:false});
    }
  }

  startRun(){
    document.getElementById('startScreen').classList.remove('active');
    document.getElementById('gameOverScreen').classList.remove('active');
    document.getElementById('victoryScreen').classList.remove('active');
    document.getElementById('hud').style.display = 'block';
    this.stats = { kills:0, coinsEarned:0, questionsAnswered:0, questionsCorrect:0, score:0 };
    window.QuestionManager.beginMixedRun();
    window.PlatformManager.startSession(GAME_CONFIG.id);
    this.enemies = [];
    this.squads = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.pickups = [];
    this.chests = [];
    this.clutter = [];
    this.deathEffects = [];
    this.gravestones = [];
    this.footprints = [];
    this.gunfireEvents = [];
    this.soundEvents = [];
    this.hazards = [];
    this.objectives = [];
    this.extractionUnlocked = false;
    this.lastGunshot = null;
    this.player = new Player(0,0, this.progress.unlockedWeapons);
    this._loadArena();
    this.running = true;
    this.paused = false;
    this._lastTime = performance.now();
    requestAnimationFrame(this._loop.bind(this));
  }

  // Builds the single arena for a run: one generated map, populated with room encounters and
  // three roaming squads, plus a shrinking safe zone. There's no floor progression - the run
  // ends either in death or in victory once every enemy on the map is eliminated (see
  // _onVictory, triggered from _update).
  _loadArena(){
    // ARENA_DIFFICULTY feeds the same tier/room-count formulas that used to scale with floor
    // number, just fixed at a single value tuned for a satisfying one-shot map instead of a
    // multi-floor ramp. Bumped up from 3 - enemies were landing too easy; this raises both
    // headcount and the HP/tier multiplier applied to every enemy on the map.
    const ARENA_DIFFICULTY = 4;
    const gridSize = 5;
    this.mapTheme = pickMapTheme();
    this.map = new MapManager(ARENA_DIFFICULTY, gridSize, this.mapTheme);
    this.fog = new FogOfWar(this.map.worldW, this.map.worldH);
    // validated spawn point - the raw room centre can land on an interior obstacle, which
    // used to be able to spawn the player embedded in a wall.
    const startCenter = this.map.center(this.map.startRoom);
    const start = this._findSafeSpot(this.map.startRoom, startCenter.x, startCenter.y);
    this.player.x = start.x; this.player.y = start.y;
    this.enemies = [];
    this.squads = [];
    this.pickups = [];
    this.chests = [];
    this.clutter = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.footprints = [];
    this.gunfireEvents = [];
    this.soundEvents = [];
    this.hazards = [];
    this.objectives = [];

    // background clutter - decorative floor dressing matched to this round's theme. Walkable,
    // no collision, never touches this.map.walls or any reachability/spawn check - it's just
    // dressing, so the only thing it needs to avoid is visually overlapping a wall.
    const clutterSet = CLUTTER_STYLES[this.mapTheme.id] || CLUTTER_STYLES.industrial;
    this.map.rooms.forEach(room=>{
      const count = 3 + Math.floor(Math.random()*4); // 3-6 pieces per room
      for(let i=0;i<count;i++){
        const cx = room.x + 20 + Math.random()*(room.w-40);
        const cy = room.y + 20 + Math.random()*(room.h-40);
        if(this.map.walls.some(w=>circleRectCollide(cx,cy,10,w))) continue;
        const piece = clutterSet[Math.floor(Math.random()*clutterSet.length)];
        this.clutter.push({
          x:cx, y:cy, fn:piece.fn, color:piece.color,
          rotation: Math.random()*Math.PI*2,
          scale: 0.8 + Math.random()*0.5
        });
      }
    });

    // populate rooms - in Free For All mode, room-based combat/elite/boss encounters are
    // skipped so the fight is purely the 10 solo agents (see _spawnSquads); loot rooms
    // (ammo/weapon/upgrade) still populate in both modes.
    this.map.rooms.forEach(room=>{
      if(room.type==='safe') return;
      const tier = 1 + (ARENA_DIFFICULTY-1)*0.18;
      const center = this.map.center(room);
      if(room.type==='combat'){
        if(this.gameMode==='ffa') return;
        const count = 2 + Math.floor(ARENA_DIFFICULTY/2) + Math.floor(Math.random()*2);
        for(let i=0;i<count;i++) this._spawnEnemyInRoom(room, tier);
        // small chance of a bonus ammo cache tucked into a combat room
        if(Math.random() < 0.35){
          const spot = this._findSafeSpot(room, center.x + (Math.random()*100-50), center.y + (Math.random()*80-40));
          this.pickups.push(new Pickup('ammo', spot.x, spot.y));
        }
      } else if(room.type==='elite'){
        if(this.gameMode==='ffa') return;
        const count = 1 + Math.floor(ARENA_DIFFICULTY/3);
        for(let i=0;i<count;i++) this._spawnEnemyInRoom(room, tier*1.6);
      } else if(room.type==='boss'){
        if(this.gameMode==='ffa') return;
        this._spawnEnemyInRoom(room, tier*3.2, 'heavy');
      } else if(room.type==='ammo'){
        // two caches per ammo room, spread apart so the room feels worth detouring for
        const spotA = this._findSafeSpot(room, center.x - 60, center.y);
        const spotB = this._findSafeSpot(room, center.x + 60, center.y + (Math.random()*60-30));
        this.pickups.push(new Pickup('ammo', spotA.x, spotA.y));
        this.pickups.push(new Pickup('ammo', spotB.x, spotB.y));
      } else if(room.type==='upgrade'){
        const upgradeIds = Object.keys(UPGRADE_CONFIG);
        const uid = upgradeIds[Math.floor(Math.random()*upgradeIds.length)];
        const spot = this._findSafeSpot(room, center.x, center.y);
        this.pickups.push(new Pickup('upgrade', spot.x, spot.y, uid));
      }
    });

    // extra scattered ammo/upgrade pickups on top of the dedicated loot rooms above, so
    // there's more to find across the map generally - and since ground upgrade pickups can
    // now be picked up by an idle enemy too (see _checkEnemyPickups), these also feed the AI.
    const lootableRooms = this.map.rooms.filter(r=>r.type!=='safe');
    const extraAmmoCount = 3 + Math.floor(Math.random()*3); // 3-5
    for(let i=0;i<extraAmmoCount && lootableRooms.length; i++){
      const room = lootableRooms[Math.floor(Math.random()*lootableRooms.length)];
      const c = this.map.center(room);
      const spot = this._findSafeSpot(room, c.x+(Math.random()*160-80), c.y+(Math.random()*120-60));
      this.pickups.push(new Pickup('ammo', spot.x, spot.y));
    }
    const extraUpgradeCount = 2 + Math.floor(Math.random()*3); // 2-4
    const upgradeIds = Object.keys(UPGRADE_CONFIG);
    for(let i=0;i<extraUpgradeCount && lootableRooms.length; i++){
      const room = lootableRooms[Math.floor(Math.random()*lootableRooms.length)];
      const c = this.map.center(room);
      const spot = this._findSafeSpot(room, c.x+(Math.random()*160-80), c.y+(Math.random()*120-60));
      const uid = upgradeIds[Math.floor(Math.random()*upgradeIds.length)];
      this.pickups.push(new Pickup('upgrade', spot.x, spot.y, uid));
    }

    // chests - take time to channel-open (see _updateChests), drop ammo + an upgrade for the
    // player, or a combat buff for whichever idle enemy opens one instead.
    const chestRooms = this.map.rooms.filter(r=>r.type!=='safe');
    const chestCount = Math.max(3, Math.floor(chestRooms.length/2));
    const shuffledChestRooms = [...chestRooms].sort(()=>Math.random()-0.5);
    for(let i=0;i<chestCount && i<shuffledChestRooms.length; i++){
      const room = shuffledChestRooms[i];
      const c = this.map.center(room);
      const spot = this._findSafeSpot(room, c.x+(Math.random()*100-50), c.y+(Math.random()*80-40));
      this.chests.push(new Chest(spot.x, spot.y));
    }

    // Question-gated active powers and defensive supplies use the same pickup loop as
    // attachments and ammunition, but remain in inventory until explicitly deployed.
    const rewardRooms=[...chestRooms].sort(()=>Math.random()-.5);
    for(let i=0;i<3&&rewardRooms.length;i++){
      const room=rewardRooms[i%rewardRooms.length],c=this.map.center(room),spot=this._findSafeSpot(room,c.x+70,c.y-50);
      const ids=Object.keys(ACTIVE_POWERUPS);this.pickups.push(new Pickup('powerup',spot.x,spot.y,ids[Math.floor(Math.random()*ids.length)]));
    }
    for(let i=0;i<4&&rewardRooms.length;i++){
      const room=rewardRooms[(i+3)%rewardRooms.length],c=this.map.center(room),spot=this._findSafeSpot(room,c.x-70,c.y+45);
      const ids=Object.keys(DEPLOYABLE_ITEMS);this.pickups.push(new Pickup('item',spot.x,spot.y,ids[Math.floor(Math.random()*ids.length)]));
    }

    // Walkable environmental hazards: explosive barrels, alarm plates and electrical fields.
    rewardRooms.slice(0,6).forEach((room,i)=>{
      const c=this.map.center(room),spot=this._findSafeSpot(room,c.x+(Math.random()*130-65),c.y+(Math.random()*90-45));
      this.hazards.push({id:`hazard-${i}`,type:['barrel','alarm','electric'][i%3],x:spot.x,y:spot.y,radius:18,active:true,cooldown:0});
    });

    // Teaming: 3 roaming squads of 4. Free For All: 10 solo agents, each their own team -
    // everyone (including the player) is hostile to everyone else. Both go through the same
    // Squad class; a squad of 1 just never has any squadmates to regroup with.
    this._spawnSquads(ARENA_DIFFICULTY);

    this._setupModeObjectives(ARENA_DIFFICULTY);

    this.enemiesRemaining = this.enemies.length;
    this._initialEnemyCount = this.enemies.length;

    this._initZone();
    this._flashMessage(this.mapTheme.name.toUpperCase(), MODE_DESCRIPTIONS[this.gameMode] || 'Stay alert');
  }

  // Battle-royale-style shrinking safe zone. Centred on a random room (validated reachable,
  // like every other spawn point), starts large enough to cover most of the map, and shrinks
  // toward a small minimum over the course of the run. Standing outside it costs health over
  // time, so the fight can't just be stalled out from a safe corner - it pushes the player
  // (and, since squads roam freely, often the AI too) toward the centre.
  // Zone centre is randomised fresh every round - a true random point anywhere reachable on
  // the map (not just one of the room centres), so it doesn't feel like it's always landing
  // on the same handful of spots.
  _initZone(){
    let zoneCenter = null;
    for(let tries=0; tries<80 && !zoneCenter; tries++){
      const x = 60 + Math.random()*(this.map.worldW-120);
      const y = 60 + Math.random()*(this.map.worldH-120);
      const blocked = this.map.walls.some(w=>circleRectCollide(x,y,20,w));
      if(!blocked && this.map.isReachable(x,y)) zoneCenter = {x,y};
    }
    if(!zoneCenter){
      // fallback: same validated-safe-spot approach used for every other spawn on the map
      const candidates = this.map.rooms.filter(r=>r.type!=='safe');
      const pick = candidates[Math.floor(Math.random()*candidates.length)] || this.map.rooms[0];
      const center = this.map.center(pick);
      zoneCenter = this._findSafeSpot(pick, center.x, center.y);
    }
    const maxDim = Math.max(this.map.worldW, this.map.worldH);
    this.zone = {
      x: zoneCenter.x, y: zoneCenter.y,
      startRadius: maxDim*0.7,
      radius: maxDim*0.7,
      minRadius: 220,
      shrinkDuration: 130, // seconds for a full shrink from start to minimum
      elapsed: 0,
      damagePerSecond: 3,
      playerWasOutside: false
    };
  }

  _setupModeObjectives(){
    const rooms=this.map.rooms.filter(r=>r.type!=='safe');
    const safePoint=room=>{const c=this.map.center(room);return this._findSafeSpot(room,c.x,c.y);};
    if(this.gameMode==='commander'){
      const commander=this.enemies.find(e=>e.isElite)||this.enemies[this.enemies.length-1];
      if(commander){commander.isCommander=true;commander.maxHp*=1.8;commander.hp=commander.maxHp;commander.speed*=1.08;commander.buff={timeLeft:999,duration:999};}
    }else if(this.gameMode==='intel'){
      [...rooms].sort(()=>Math.random()-.5).slice(0,3).forEach((room,i)=>{const p=safePoint(room);this.objectives.push({type:'intel',x:p.x,y:p.y,index:i,captured:false,progress:0});});
    }else if(this.gameMode==='extraction'){
      const intelRoom=rooms[Math.floor(Math.random()*rooms.length)]||this.map.rooms[0];
      const exitRoom=rooms.find(r=>r!==intelRoom)||this.map.rooms.at(-1);const a=safePoint(intelRoom),b=safePoint(exitRoom);
      this.objectives.push({type:'intel',x:a.x,y:a.y,index:0,captured:false,progress:0},{type:'extract',x:b.x,y:b.y,active:false,progress:0});
    }
  }

  deployPowerup(){
    if(!this.running||this.paused||!this.player?.powerup)return;
    const id=this.player.powerup;this.player.powerup=null;
    if(id==='scan')this.player.scanTime=ACTIVE_POWERUPS[id].duration;
    else if(id==='smoke')this.player.smokeTime=ACTIVE_POWERUPS[id].duration;
    else if(id==='dash'){
      const distance=145,tx=this.player.x+Math.cos(this.player.aimAngle)*distance,ty=this.player.y+Math.sin(this.player.aimAngle)*distance;
      if(!this.map.walls.some(w=>circleRectCollide(tx,ty,this.player.radius,w))){this.player.x=tx;this.player.y=ty;}
    }else if(id==='decoy'){
      const x=this.player.x+Math.cos(this.player.aimAngle)*180,y=this.player.y+Math.sin(this.player.aimAngle)*180;
      for(let i=0;i<5;i++)setTimeout(()=>this.running&&this.registerGunshot(x,y,650,'decoy'),i*350);
    }
    this._flashMessage(ACTIVE_POWERUPS[id].name.toUpperCase(),'Powerup deployed');this._updateDeployButtons();
  }

  deployItem(){
    if(!this.running||this.paused||!this.player?.item)return;
    const id=this.player.item;this.player.item=null;
    if(id==='medkit')this.player.hp=Math.min(this.player.maxHp,this.player.hp+45);
    else if(id==='armour')this.player.armour=Math.min(80,this.player.armour+40);
    else if(id==='shield')this.player.shieldTime=8;
    this._flashMessage(DEPLOYABLE_ITEMS[id].name.toUpperCase(),'Item deployed');this._updateDeployButtons();
  }

  _updateDeployButtons(){
    const p=this.player,power=document.getElementById('deployPowerBtn'),item=document.getElementById('deployItemBtn');
    power.disabled=!p?.powerup;item.disabled=!p?.item;
    power.textContent=p?.powerup?`Q · ${ACTIVE_POWERUPS[p.powerup].name.toUpperCase()}`:'Q · NO POWERUP';
    item.textContent=p?.item?`E · ${DEPLOYABLE_ITEMS[p.item].name.toUpperCase()}`:'E · NO ITEM';
  }

  _updateObjectives(dt){
    const p=this.player;
    for(const objective of this.objectives){
      if(objective.type==='intel'&&!objective.captured){
        const near=Math.hypot(p.x-objective.x,p.y-objective.y)<42;
        objective.progress=near?Math.min(3,objective.progress+dt):Math.max(0,objective.progress-dt*1.5);
        if(objective.progress>=3){objective.captured=true;this.stats.score+=150;this._flashMessage('INTEL SECURED','Objective captured');}
      }
    }
    if(this.gameMode==='intel'&&this.objectives.length&&this.objectives.every(o=>o.captured)){this._onVictory();return true;}
    if(this.gameMode==='extraction'){
      const intel=this.objectives.find(o=>o.type==='intel'),exit=this.objectives.find(o=>o.type==='extract');
      if(intel?.captured)exit.active=true;
      if(exit?.active){const near=Math.hypot(p.x-exit.x,p.y-exit.y)<50;exit.progress=near?exit.progress+dt:0;if(exit.progress>=4){this._onVictory();return true;}}
    }
    if(this.gameMode==='commander'&&!this.enemies.some(e=>e.isCommander&&!e.dead)){this._onVictory();return true;}
    return false;
  }

  _updateHazards(dt){
    for(const h of this.hazards){if(!h.active)continue;h.cooldown=Math.max(0,h.cooldown-dt);const d=Math.hypot(this.player.x-h.x,this.player.y-h.y);
      if(h.type==='alarm'&&d<h.radius+8&&h.cooldown<=0){h.cooldown=8;this.registerGunshot(this.player.x,this.player.y,900,'alarm');this._flashMessage('ALARM TRIGGERED','Nearby squads are investigating');}
      if(h.type==='electric'&&d<h.radius&&h.cooldown<=0){h.cooldown=1;this.damagePlayer(7);}
    }
  }

  _explodeBarrel(hazard){
    if(!hazard.active)return;hazard.active=false;this.registerSound(hazard.x,hazard.y,'explosion',900);
    this.deathEffects.push({particles:Array.from({length:22},(_,i)=>{const a=i/22*Math.PI*2,s=90+Math.random()*170;return{x:hazard.x,y:hazard.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.8,maxLife:.8,color:i%2?'#ff6b3d':'#ffd15c'}})});
    if(Math.hypot(this.player.x-hazard.x,this.player.y-hazard.y)<105)this.damagePlayer(38);
    this.enemies.forEach(e=>{if(!e.dead&&Math.hypot(e.x-hazard.x,e.y-hazard.y)<105){e.hp-=70;if(e.hp<=0){this.markEnemyDead(e);this.stats.kills++;this.stats.coinsEarned++;window.AchievementManager?.notify?.('enemy_defeated',{x:e.x,y:e.y});}}});
    this._flashMessage('BARREL DETONATED','Anything nearby takes heavy damage');
  }

  // Finds a spawn point that (a) doesn't overlap any wall/obstacle and (b) is actually
  // reachable from the player's starting room, per MapManager's flood-filled reachability
  // grid. Tries the preferred spot, then random points, then an exhaustive grid scan of the
  // whole room - that last step means this can only fail to find a valid spot if the room is
  // truly 100% unusable, which shouldn't be possible given the reachability fix upstream.
  _findSafeSpot(room, preferredX, preferredY, tries=24){
    const valid = (x,y) => !this.map.walls.some(w=>circleRectCollide(x,y,18,w)) && this.map.isReachable(x,y);
    if(valid(preferredX, preferredY)) return {x:preferredX, y:preferredY};
    for(let i=0;i<tries;i++){
      const x = room.x + 40 + Math.random()*(room.w-80);
      const y = room.y + 40 + Math.random()*(room.h-80);
      if(valid(x,y)) return {x,y};
    }
    // exhaustive fallback - scans the room on a fine grid so a valid spot is found whenever
    // one exists, even in odd-shaped or heavily-obstructed rooms that random sampling got
    // unlucky with. Uses a slightly tighter clearance (still comfortably above the player's
    // actual radius of 14) since this is the last resort before giving up.
    for(let y=room.y+24; y<room.y+room.h-24; y+=12){
      for(let x=room.x+24; x<room.x+room.w-24; x+=12){
        const blocked = this.map.walls.some(w=>circleRectCollide(x,y,15,w));
        if(!blocked && this.map.isReachable(x,y)) return {x,y};
      }
    }
    // absolute last resort: the player's own current position is reachable by definition
    // (they're standing on it), so this can never hand back a spot the player can't get to,
    // even in a pathological room this exhaustive scan still somehow missed.
    return { x: this.player.x, y: this.player.y };
  }

  _spawnSquads(floorNumber){
    const tier = 1 + (floorNumber-1)*0.14;
    const usableRooms = this.map.rooms.filter(r=>r.type!=='safe');

    if(this.gameMode==='ffa'){
      // Free For All: 10 solo agents, each its own one-member "squad" - so every single one
      // of them is hostile to every other one (via the same rival-squad system Teaming uses),
      // as well as to the player. Spread across different rooms so they don't all spawn on
      // top of each other.
      const shuffledRooms = [...usableRooms].sort(()=>Math.random()-0.5);
      for(let s=0; s<10; s++){
        const behavior = pickGroupBehavior();
        const homeRoom = shuffledRooms[s % shuffledRooms.length] || this.map.rooms[0];
        const homePos = this.map.center(homeRoom);
        const archetype = NORMAL_ARCHETYPES[Math.floor(Math.random()*NORMAL_ARCHETYPES.length)];
        const spot = this._findSafeSpot(homeRoom, homePos.x + (Math.random()*140-70), homePos.y + (Math.random()*140-70));
        const enemy = new Enemy(archetype, spot.x, spot.y, tier*1.15);
        enemy.applyAdaptiveDifficulty(this.adaptiveDifficulty.mult);
        this.enemies.push(enemy);
        this.squads.push(new Squad(s, behavior, [enemy], homePos));
      }
      return;
    }

    // Teaming: 3 squads of 4, as before.
    for(let s=0; s<3; s++){
      const behavior = pickGroupBehavior();
      const homeRoom = usableRooms[Math.floor(Math.random()*usableRooms.length)] || this.map.rooms[0];
      const homePos = this.map.center(homeRoom);
      const members = [];
      for(let i=0;i<4;i++){
        const archetype = NORMAL_ARCHETYPES[Math.floor(Math.random()*NORMAL_ARCHETYPES.length)];
        const spot = this._findSafeSpot(homeRoom, homePos.x + (Math.random()*160-80), homePos.y + (Math.random()*160-80));
        const enemy = new Enemy(archetype, spot.x, spot.y, tier);
        enemy.applyAdaptiveDifficulty(this.adaptiveDifficulty.mult);
        members.push(enemy);
        this.enemies.push(enemy);
      }
      this.squads.push(new Squad(s, behavior, members, homePos));
    }
  }

  // finds the nearest enemy belonging to a *different* squad that this enemy can currently see -
  // this is what drives "if they encounter another group they will attack them".
  findVisibleRivalFor(enemy){
    let best = null, bestDist = Infinity;
    for(const other of this.enemies){
      if(other===enemy || other.dead || other.squadId==null || other.squadId===enemy.squadId) continue;
      const dist = Math.hypot(other.x-enemy.x, other.y-enemy.y);
      if(dist > enemy.visionRange) continue;
      if(dist < bestDist && enemy.canSeePoint(this.map.walls, other.x, other.y)){
        best = other; bestDist = dist;
      }
    }
    return best;
  }

  _spawnEnemyInRoom(room, tier, forceType){
    const type = forceType || NORMAL_ARCHETYPES[Math.floor(Math.random()*NORMAL_ARCHETYPES.length)];
    const center = this.map.center(room);
    const spot = this._findSafeSpot(room, center.x, center.y);
    const enemy = new Enemy(type, spot.x, spot.y, tier);
    enemy.applyAdaptiveDifficulty(this.adaptiveDifficulty.mult);
    this.enemies.push(enemy);
  }

  // registers a gunshot for: the existing "did the player hear this recently" check, the squad
  // gunfire-attraction system, and the on-screen sound-location ping rendered in _render().
  // visRadius is how far away that ping can be seen/heard - shrunk by the Silencer upgrade or
  // a silenced enemy archetype.
  registerGunshot(x,y,visRadius,source='gunfire'){
    const t = performance.now();
    this.lastGunshot = { x,y, recent:true, t };
    this.gunfireEvents.push({ x,y,t, visRadius: visRadius||400, source });
    this.registerSound(x,y,source,visRadius||400);
    if(this.gunfireEvents.length>30) this.gunfireEvents.shift();
  }

  registerSound(x,y,type,radius){
    this.soundEvents.push({x,y,type,radius,t:performance.now()});
    if(this.soundEvents.length>24)this.soundEvents.shift();
  }

  // Central death handler for enemies - every death site (bullets, rival-squad melee, zone
  // damage) should call this instead of setting dead/_justDied directly, so the particle burst
  // and gravestone always fire exactly once, regardless of what killed them.
  markEnemyDead(enemy){
    if(enemy.dead) return;
    enemy.dead = true;
    enemy._justDied = true;
    this._spawnDeathEffect(enemy.x, enemy.y, enemy.cfg.color);
  }

  // small pixel-burst particle effect plus a persistent gravestone marker. Gravestone visuals
  // are looked up via GRAVESTONE_STYLES by id, so a future shop can sell alternate styles just
  // by writing this.progress.gravestoneStyle to something other than 'default'.
  _spawnDeathEffect(x,y,color){
    const particles = [];
    const count = 8;
    for(let i=0;i<count;i++){
      const ang = (i/count)*Math.PI*2 + Math.random()*0.5;
      const speed = 55 + Math.random()*85;
      particles.push({ x, y, vx:Math.cos(ang)*speed, vy:Math.sin(ang)*speed, life:0.5, maxLife:0.5, color });
    }
    this.deathEffects.push({ particles });
    this.gravestones.push({ x, y, style: this.progress.gravestoneStyle || 'default' });
  }

  damagePlayer(amount){
    if(this.player.shieldTime>0)return;
    if(this.player.armour>0){const absorbed=Math.min(this.player.armour,amount);this.player.armour-=absorbed;amount-=absorbed;}
    if(amount<=0)return;
    this.player.hp -= amount;
    window.AchievementManager?.notify?.('damage_taken',{amount:Math.max(1,Math.round(amount))});
    if(this.player.hp<=0){ this.player.hp = 0; this._onPlayerDeath(); }
  }

  _onPlayerDeath(){
    this.running = false;
    // hidden adaptive difficulty: a loss nudges the multiplier back down (bigger step than a
    // win's step up, so the walk equilibrates around a 65% win rate - see the constructor)
    const ad = this.adaptiveDifficulty;
    ad.mult = Math.max(ad.min, ad.mult - ad.lossStep);
    document.getElementById('hud').style.display = 'none';
    document.getElementById('goScore').textContent = Math.round(this.stats.score);
    document.getElementById('goKills').textContent = this.stats.kills;
    const settlement = window.PlatformManager.settleAccuracyCoins(GAME_CONFIG.id, this.stats.coinsEarned, {correct:this.stats.questionsCorrect,answered:this.stats.questionsAnswered});
    document.getElementById('goCoins').textContent = settlement.coinsAwarded;
    document.getElementById('goQuestions').textContent = this.stats.questionsAnswered;
    const acc = this.stats.questionsAnswered>0 ? Math.round(100*this.stats.questionsCorrect/this.stats.questionsAnswered) : 0;
    document.getElementById('goAccuracy').textContent = acc+'%';
    document.getElementById('gameOverScreen').classList.add('active');
    this._recordLifetimeKills();
    window.PlatformManager.setHighScore(GAME_CONFIG.id, Math.round(this.stats.score));
    window.ChallengeManager?.finish({score:Math.round(this.stats.score),alive:false});
    window.PlatformManager.endSession(GAME_CONFIG.id);
  }

  // Victory: every enemy on the map - room-based encounters and both squads - is dead.
  // There's no next floor to move on to; this ends the run outright.
  _onVictory(){
    this.running = false;
    // hidden adaptive difficulty: a win nudges the multiplier up a little
    const ad = this.adaptiveDifficulty;
    ad.mult = Math.min(ad.max, ad.mult + ad.winStep);
    document.getElementById('hud').style.display = 'none';
    this.stats.score += 500; // flat clear bonus
    document.getElementById('vScore').textContent = Math.round(this.stats.score);
    document.getElementById('vKills').textContent = this.stats.kills;
    const settlement = window.PlatformManager.settleAccuracyCoins(GAME_CONFIG.id, this.stats.coinsEarned, {correct:this.stats.questionsCorrect,answered:this.stats.questionsAnswered});
    document.getElementById('vCoins').textContent = settlement.coinsAwarded;
    document.getElementById('vQuestions').textContent = this.stats.questionsAnswered;
    const acc = this.stats.questionsAnswered>0 ? Math.round(100*this.stats.questionsCorrect/this.stats.questionsAnswered) : 0;
    document.getElementById('vAccuracy').textContent = acc+'%';
    document.getElementById('victoryScreen').classList.add('active');
    this._recordLifetimeKills();
    window.PlatformManager.setHighScore(GAME_CONFIG.id, Math.round(this.stats.score));
    window.AchievementManager?.notify?.('mastery_shooter_studying');
    window.ChallengeManager?.finish({score:Math.round(this.stats.score),alive:true,finished:true});
    window.PlatformManager.endSession(GAME_CONFIG.id);
  }

  _recordLifetimeKills(){
    if(window.PlatformManager?.isPracticeMode?.()) return;
    const key='shooterStudyingLifetimeKills';
    localStorage.setItem(key, String(Number(localStorage.getItem(key)||0) + this.stats.kills));
  }

  // ---- main loop ----
  _loop(now){
    if(!this.running) return;
    const dt = Math.min(0.033, (now-this._lastTime)/1000);
    this._lastTime = now;
    if(this.lastGunshot && now-this.lastGunshot.t > 350) this.lastGunshot.recent = false;
    if(!this.paused) this._update(dt);
    window.PlatformManager?.heartbeat?.(GAME_CONFIG.id, !this.paused);
    this._render();
    requestAnimationFrame(this._loop.bind(this));
  }

  _update(dt){
    const p = this.player;
    let mx=0,my=0;
    if(this.keys['KeyW']||this.keys['ArrowUp']) my-=1;
    if(this.keys['KeyS']||this.keys['ArrowDown']) my+=1;
    if(this.keys['KeyA']||this.keys['ArrowLeft']) mx-=1;
    if(this.keys['KeyD']||this.keys['ArrowRight']) mx+=1;
    mx+=this.touchMove.x;my+=this.touchMove.y;
    const moveLength=Math.hypot(mx,my);if(moveLength>1){mx/=moveLength;my/=moveLength;}
    p.moveDir = {x:mx,y:my};

    if(this.touchAim.engaged)p.aimAngle=Math.atan2(this.touchAim.y,this.touchAim.x);
    else {const worldMouse = this._screenToWorld(this.mouse.x, this.mouse.y);p.aimAngle = Math.atan2(worldMouse.y-p.y, worldMouse.x-p.x);}

    p.update(dt, this.map.walls);

    // player footprints - same trail mechanic as enemies (see Enemy.update's footprint
    // emission), so an enemy that gets line of sight on the ground where you walked can pick
    // up your trail even after you break their direct line of sight on you. The Silencer
    // upgrade makes your own footprints decay much faster - a quieter gun going with a
    // fainter trail, so you're genuinely harder to track while it's active.
    this._playerFootprintTimer = (this._playerFootprintTimer==null ? 0 : this._playerFootprintTimer) - dt;
    if(this._playerFootprintTimer<=0){
      if(p.isMoving){
        const hasSilencer = p.activeUpgrades.some(u=>u.id==='silencer');
        const maxAge = hasSilencer ? FOOTPRINT_MAX_AGE*0.3 : FOOTPRINT_MAX_AGE;
        this.footprints.push({ x:p.x, y:p.y, born:performance.now(), owner:'player', maxAge });
        this.registerSound(p.x,p.y,'footsteps',125);
      }
      this._playerFootprintTimer = 0.32;
    }

    // auto-fire
    this._handleAutoFire(dt);

    // bullets
    this.playerBullets.forEach(b=>b.update(dt, this.map.walls));
    this.enemyBullets.forEach(b=>b.update(dt, this.map.walls));
    this._resolveBulletHits();
    this.playerBullets = this.playerBullets.filter(b=>!b.dead);
    this.enemyBullets = this.enemyBullets.filter(b=>!b.dead);

    // enemies
    this.enemies.forEach(e=>{ if(!e.dead) e.update(dt, this); });
    this.enemies = this.enemies.filter(e=>!e.dead || e._justDied);
    this.enemies.forEach(e=>e._justDied=false);

    // squads (rally-point drift, pack cohesion)
    this.squads.forEach(s=>s.update(dt, this));

    // fog of war
    this._updateFog();

    // pickups
    this._checkPickups();
    this._checkEnemyPickups();
    this._updateChests(dt);
    this._updateHazards(dt);
    if(this._updateObjectives(dt))return;

    // prune expired footprints and gunfire events - footprints use a per-footprint maxAge
    // (see Silencer's effect on player footprints below) rather than the flat global default
    const now = performance.now();
    this.footprints = this.footprints.filter(fp => now - fp.born < (fp.maxAge!=null ? fp.maxAge : FOOTPRINT_MAX_AGE));
    this.gunfireEvents = this.gunfireEvents.filter(ge => now - ge.t < 5000);
    this.soundEvents = this.soundEvents.filter(se => now - se.t < 2200);

    // death-effect particles - simple outward pixel burst, fades and is pruned once every
    // particle in a burst has finished its short life
    this.deathEffects.forEach(fx=>{
      fx.particles.forEach(p=>{
        p.x += p.vx*dt; p.y += p.vy*dt;
        p.vx *= 0.9; p.vy *= 0.9;
        p.life -= dt;
      });
    });
    this.deathEffects = this.deathEffects.filter(fx=>fx.particles.some(p=>p.life>0));

    // shrinking zone - battle-royale style. Standing outside it costs health over time so the
    // fight can't be stalled out from a safe corner forever. It's toxic to everyone, not just
    // the player - any enemy caught outside it (room-spawned or squad) takes the same
    // damage-over-time, so hiding at the map's edge isn't safe for the AI either.
    if(this.zone){
      this.zone.elapsed += dt;
      const t = Math.min(1, this.zone.elapsed/this.zone.shrinkDuration);
      this.zone.radius = this.zone.startRadius + (this.zone.minRadius-this.zone.startRadius)*t;
      const distFromCenter = Math.hypot(p.x-this.zone.x, p.y-this.zone.y);
      const outside = distFromCenter > this.zone.radius;
      if(outside){
        this.damagePlayer(this.zone.damagePerSecond*dt);
        if(!this.zone.playerWasOutside) this._flashMessage('OUTSIDE THE ZONE', 'Get back inside - taking damage');
        this.zone.playerWasOutside = true;
      } else {
        this.zone.playerWasOutside = false;
      }
      for(const e of this.enemies){
        if(e.dead) continue;
        const ed = Math.hypot(e.x-this.zone.x, e.y-this.zone.y);
        if(ed > this.zone.radius){
          e.hp -= this.zone.damagePerSecond*dt;
          if(e.hp<=0){
            this.markEnemyDead(e);
            this.stats.kills += 1;
            window.AchievementManager?.notify?.('enemy_defeated', {x:e.x,y:e.y});
            this.stats.coinsEarned += 1;
          }
        }
      }
    }

    // victory - every enemy on the map (room encounters and both squads) is down. There's no
    // next floor; this ends the run. Guarded on the player still being alive so a same-tick
    // death (e.g. from zone damage) can't fire both the death and victory screens at once.
    if(['teaming','ffa'].includes(this.gameMode)&&this.player.hp>0 && this._initialEnemyCount>0 && this.enemies.length===0){
      this._onVictory();
      return;
    }

    this.enemiesRemaining = this.enemies.filter(e=>!e.dead).length;
    this.stats.score = this.stats.kills*10 + this.stats.coinsEarned*2;
    window.ChallengeManager?.update?.({score:Math.round(this.stats.score),alive:true});
    this._updateHud();
  }

  _handleAutoFire(dt){
    const p = this.player;
    // weapons are unavailable while channel-opening a chest, same as reloading
    if(p.reloading || p.magazineAmmo<=0 || p.fireTimer>0 || p.openingChest) return;
    // firing cone tightens 30% when standing still, and accuracy is derived directly from
    // however wide that live cone currently is - see Player.getLiveConeWidth/getEffectiveSpread.
    const liveCone = p.getLiveConeWidth();
    // shots (and targeting) originate from the peeked position when leaning around a corner,
    // matching what _updateFog just made visible.
    const fx = p.x + p.peekOffset.x, fy = p.y + p.peekOffset.y;
    // find nearest visible enemy within cone + range + LOS
    let target = null, bestDist = Infinity;
    for(const e of this.enemies){
      if(e.dead) continue;
      const dist = Math.hypot(e.x-fx, e.y-fy);
      if(dist > p.weaponStats.range) continue;
      const ang = Math.atan2(e.y-fy, e.x-fx);
      if(angleDiff(ang, p.aimAngle) > (liveCone*Math.PI/180)/2) continue;
      if(!hasLineOfSight(this.map.walls, fx,fy,e.x,e.y)) continue;
      if(!this._isPointCurrentlyVisible(e.x,e.y)) continue;
      if(dist < bestDist){ bestDist = dist; target = e; }
    }
    if(!target) return;
    const pellets = p.weaponStats.pellets || 1;
    const effectiveSpread = p.getEffectiveSpread();
    for(let i=0;i<pellets;i++){
      const spreadRad = (effectiveSpread*Math.PI/180) * (Math.random()*2-1);
      const ang = Math.atan2(target.y-fy, target.x-fx) + spreadRad;
      this.playerBullets.push(new Bullet(fx,fy, ang, p.weaponStats.projectileSpeed, p.weaponStats.damage, 'player', p.weaponStats.range, p.weaponStats.color, 'player', p.weaponStats.detectRadius));
    }
    p.magazineAmmo -= 1;
    p.fireTimer = 1/p.weaponStats.fireRate;
    this.registerGunshot(fx,fy, p.weaponStats.detectRadius);
    if(p.magazineAmmo<=0) p.startReload();
  }

  _resolveBulletHits(){
    for(const b of this.playerBullets){
      if(b.dead) continue;
      const barrel=this.hazards.find(h=>h.active&&h.type==='barrel'&&Math.hypot(b.x-h.x,b.y-h.y)<h.radius+3);
      if(barrel){b.dead=true;this._explodeBarrel(barrel);continue;}
      for(const e of this.enemies){
        if(e.dead) continue;
        if(Math.hypot(b.x-e.x,b.y-e.y) < e.radius+3){
          e.hp -= b.damage; b.dead = true;
          e.recentlyHitTimer = 1.4; // triggers damage-averse behaviour for a few seconds
          if(e.hp<=0 && !e.dead){
            this.markEnemyDead(e);
            this.stats.kills += 1;
            window.AchievementManager?.notify?.('enemy_defeated', {x:e.x,y:e.y});
            this.stats.coinsEarned += 1;
          }
          break;
        }
      }
    }
    for(const b of this.enemyBullets){
      if(b.dead) continue;
      // stray enemy fire can always hit the player, regardless of who it was aimed at
      if(Math.hypot(b.x-this.player.x, b.y-this.player.y) < this.player.radius+3){
        b.dead = true;
        this.damagePlayer(b.damage);
        continue;
      }
      // rival-squad friendly fire: a squad's bullet can hit any enemy from a *different* squad
      if(b.faction!=null){
        for(const e of this.enemies){
          if(e.dead || e.squadId==null || e.squadId===b.faction) continue;
          if(Math.hypot(b.x-e.x,b.y-e.y) < e.radius+3){
            e.hp -= b.damage; b.dead = true;
            e.recentlyHitTimer = 1.4;
            if(e.hp<=0 && !e.dead){
              this.markEnemyDead(e);
              this.stats.kills += 1;
              window.AchievementManager?.notify?.('enemy_defeated', {x:e.x,y:e.y});
              this.stats.coinsEarned += 1;
            }
            break;
          }
        }
      }
    }
  }

  _updateFog(){
    const p = this.player;
    const rayCount = 48;
    // the vision origin leans out by peekOffset when hugging a corner (see
    // Player._computePeek), letting you see - and the auto-fire targeting below hit - past a
    // corner without walking into the open.
    const vx = p.x + p.peekOffset.x, vy = p.y + p.peekOffset.y;
    const mainPoly = buildVisionPolygon(this.map.walls, vx, vy, p.aimAngle, p.weaponStats.visionAngle, p.weaponStats.visionRange, rayCount);
    const peripheralPoly = p.weaponStats.peripheralVisionRange > p.weaponStats.visionAngle
      ? buildVisionPolygon(this.map.walls, vx, vy, p.aimAngle, Math.min(359, p.weaponStats.peripheralVisionRange), Math.max(60,p.weaponStats.visionRange*0.35), 40)
      : null;
    const localPoly = buildLocalAwarenessPolygon(this.map.walls, p.x, p.y, p.localAwarenessRadius, 16);
    this._currentPolys = { mainPoly, peripheralPoly, localPoly };
    const bounds = { minx:p.x-1000, miny:p.y-1000, maxx:p.x+1000, maxy:p.y+1000 };
    this.fog.markExplored(mainPoly, bounds.minx,bounds.miny,bounds.maxx,bounds.maxy);
    if(peripheralPoly) this.fog.markExplored(peripheralPoly, bounds.minx,bounds.miny,bounds.maxx,bounds.maxy);
    this.fog.markExplored(localPoly, bounds.minx,bounds.miny,bounds.maxx,bounds.maxy);
  }

  _isPointCurrentlyVisible(x,y){
    const { mainPoly, peripheralPoly, localPoly } = this._currentPolys || {};
    if(mainPoly && pointInPolygon(x,y,mainPoly)) return true;
    if(peripheralPoly && pointInPolygon(x,y,peripheralPoly)) return true;
    if(localPoly && pointInPolygon(x,y,localPoly)) return true;
    return false;
  }

  _checkPickups(){
    const p = this.player;
    for(const pk of this.pickups){
      if(pk.collected) continue;
      const d = Math.hypot(p.x-pk.x, p.y-pk.y);
      if(d < p.radius+18){
        if(pk.type==='ammo'){
          pk.collected = true;
          this.questionManager.startAmmoQuestionPhase();
        } else if(pk.type==='weapon'){
          pk.collected = true;
          this.player.equipWeapon(pk.extra);
          this._flashMessage('WEAPON SWAPPED', WEAPON_CONFIG[pk.extra].name.toUpperCase());
        } else if(pk.type==='upgrade'){
          const upgrade = UPGRADE_CONFIG[pk.extra];
          const compatible = p.weaponStats && WEAPON_CONFIG[p.weaponId].compatibleUpgrades.includes(upgrade.id);
          if(!compatible) continue; // incompatible: do nothing, leave pickup
          pk.collected = true;
          this.questionManager.startUpgradeQuestion(upgrade, (correct)=>{
            if(correct){ this.player.applyUpgrade(upgrade); this._flashMessage('ATTACHMENT INSTALLED', upgrade.name.toUpperCase()); }
            else this._flashMessage('ATTACHMENT LOST', 'Incorrect answer');
          });
        } else if(pk.type==='powerup'){
          if(p.powerup)continue;
          pk.collected=true;const reward=ACTIVE_POWERUPS[pk.extra];
          this.questionManager.startDeployableQuestion(reward,(earned)=>{
            if(earned){p.powerup=pk.extra;this._flashMessage('POWERUP READY',`${reward.name} · deploy with Q`);this._updateDeployButtons();}
            else this._flashMessage('POWERUP LOST','No correct answers');
          });
        } else if(pk.type==='item'){
          if(p.item)continue;
          pk.collected=true;const reward=DEPLOYABLE_ITEMS[pk.extra];
          this.questionManager.startDeployableQuestion(reward,(earned)=>{
            if(earned){p.item=pk.extra;this._flashMessage('ITEM READY',`${reward.name} · deploy with E`);this._updateDeployButtons();}
            else this._flashMessage('ITEM LOST','No correct answers');
          });
        }
        break;
      }
    }
    this.pickups = this.pickups.filter(pk=>!pk.collected);
  }

  // Ground upgrade pickups can also be grabbed by an idle enemy - only while 'patrol' (the
  // lowest-priority state, so this never pulls an enemy out of an actual fight or investigation)
  // and only 'upgrade' pickups, since ammo has no meaning for enemies (no magazine). Applies the
  // same generic combat buff as opening a chest, straight away - no quiz, it's the AI.
  _checkEnemyPickups(){
    for(const e of this.enemies){
      if(e.dead || e.state!=='patrol') continue;
      for(const pk of this.pickups){
        if(pk.collected || !['upgrade','powerup','item'].includes(pk.type)) continue;
        const d = Math.hypot(e.x-pk.x, e.y-pk.y);
        if(d < e.radius+18){
          pk.collected = true;
          e.buff = { timeLeft:25, duration:25 };
          break;
        }
      }
    }
    this.pickups = this.pickups.filter(pk=>!pk.collected);
  }

  // Chests take time to channel-open; only one opener makes progress at a time (player or a
  // single idle enemy), and walking/wandering away lets progress decay back down rather than
  // resetting outright. See the Chest class comment for the full design.
  _updateChests(dt){
    const p = this.player;
    for(const chest of this.chests){
      if(chest.opened) continue;

      const distPlayer = Math.hypot(p.x-chest.x, p.y-chest.y);
      const playerEligible = distPlayer < 45 && !p.isMoving;

      // is whoever the chest currently thinks is opening it (if an enemy) still valid this tick?
      let currentEnemyStillValid = false;
      if(chest.openerType==='enemy' && chest.openerRef && !chest.openerRef.dead){
        const d = Math.hypot(chest.openerRef.x-chest.x, chest.openerRef.y-chest.y);
        if(d<45 && chest.openerRef.state==='patrol') currentEnemyStillValid = true;
      }

      if(playerEligible && chest.openerType!=='enemy'){
        chest.openerType = 'player';
        chest.progress += dt;
        p.openingChest = chest;
      } else if(currentEnemyStillValid){
        chest.progress += dt;
        if(p.openingChest===chest) p.openingChest = null;
      } else {
        let newEnemyOpener = null;
        if(!playerEligible){
          for(const e of this.enemies){
            if(e.dead || e.state!=='patrol') continue;
            const d = Math.hypot(e.x-chest.x, e.y-chest.y);
            if(d<45){ newEnemyOpener = e; break; }
          }
        }
        if(newEnemyOpener){
          chest.openerType = 'enemy';
          chest.openerRef = newEnemyOpener;
          chest.progress += dt;
        } else {
          chest.progress = Math.max(0, chest.progress - dt*1.5);
          if(chest.progress<=0){ chest.openerType = null; chest.openerRef = null; }
          if(p.openingChest===chest) p.openingChest = null;
        }
      }

      if(chest.progress >= chest.requiredTime){
        chest.opened = true;
        if(chest.openerType==='player'){
          p.openingChest = null;
          const amount = Math.round(p.weaponStats.magazineSize*1.5);
          p.reserveAmmo = Math.min(p.reserveAmmo + amount, p.weaponStats.magazineSize*6);
          const compatIds = WEAPON_CONFIG[p.weaponId].compatibleUpgrades;
          const uid = compatIds[Math.floor(Math.random()*compatIds.length)];
          this.player.applyUpgrade(UPGRADE_CONFIG[uid]);
          this._flashMessage('CHEST OPENED', `+${amount} ammo, ${UPGRADE_CONFIG[uid].name} installed`);
        } else if(chest.openerType==='enemy' && chest.openerRef && !chest.openerRef.dead){
          chest.openerRef.buff = { timeLeft:25, duration:25 };
        }
      }
    }
  }

  _flashMessage(title, sub){
    const el = document.getElementById('centerMsg');
    document.getElementById('centerMsgTitle').textContent = title;
    document.getElementById('centerMsgSub').textContent = sub || '';
    el.classList.add('show');
    clearTimeout(this._msgTimeout);
    this._msgTimeout = setTimeout(()=> el.classList.remove('show'), 1800);
  }

  _screenToWorld(sx,sy){
    const p = this.player;
    const camX = p.x - this.canvas.width/2;
    const camY = p.y - this.canvas.height/2;
    return { x: sx+camX, y: sy+camY };
  }

  _updateHud(){
    const p = this.player;
    document.getElementById('hpText').textContent = `${Math.max(0,Math.round(p.hp))}/${p.maxHp}${p.armour?` +${Math.round(p.armour)} ARMOUR`:''}${p.shieldTime>0?' · SHIELDED':''}`;
    document.getElementById('healthBarInner').style.width = `${Math.max(0,p.hp/p.maxHp*100)}%`;
    document.getElementById('weaponName').textContent = WEAPON_CONFIG[p.weaponId].name.toUpperCase();
    document.getElementById('ammoText').textContent = p.reloading
      ? 'RELOADING'
      : p.openingChest ? 'CHEST OPEN...' : `${p.magazineAmmo}/${p.weaponStats.magazineSize} (+${p.reserveAmmo})`;
    document.getElementById('ammoBarInner').style.width = `${Math.min(100, p.magazineAmmo/p.weaponStats.magazineSize*100)}%`;
    document.getElementById('coinsText').textContent = this.stats.coinsEarned;
    document.getElementById('enemiesText').textContent = this.enemiesRemaining;
    document.getElementById('scoreText').textContent = Math.round(this.stats.score);
    document.getElementById('reloadHint').textContent = p.openingChest ? 'Weapon unavailable' : 'R to reload';
    const zoneText = document.getElementById('zoneText');
    if(this.zone){
      zoneText.textContent = this.zone.playerWasOutside ? 'DANGER -' + this.zone.damagePerSecond + '/s' : 'SAFE';
      zoneText.style.color = this.zone.playerWasOutside ? '#ff5c5c' : '#5cff8f';
    }
    const attachList = document.getElementById('attachList');
    if(p.activeUpgrades.length===0) attachList.textContent = 'none';
    else attachList.innerHTML = p.activeUpgrades.map(u=>`<div class="attach-chip">${u.name} — ${Math.ceil(u.timeLeft)}s</div>`).join('');
    this._updateDeployButtons();
    const objective=document.getElementById('objectiveText');
    if(this.gameMode==='commander')objective.textContent=this.enemies.some(e=>e.isCommander&&!e.dead)?'Eliminate the Elite Commander':'Commander eliminated';
    else if(this.gameMode==='intel'){const done=this.objectives.filter(o=>o.captured).length;objective.textContent=`Secure intelligence ${done}/3 · hold position 3s`;}
    else if(this.gameMode==='extraction'){const intel=this.objectives.find(o=>o.type==='intel');objective.textContent=intel?.captured?'Reach extraction and hold for 4s':'Secure the intelligence cache';}
    else objective.textContent='Eliminate all hostiles';
  }

  // ---- rendering ----
  _render(){
    const ctx = this.ctx;
    const p = this.player;
    const camX = p.x - this.canvas.width/2;
    const camY = p.y - this.canvas.height/2;
    const theme = this.mapTheme || MAP_THEMES[0];

    ctx.fillStyle = theme.floorBg;
    ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    ctx.save();
    ctx.translate(-camX,-camY);

    // floor grid
    ctx.strokeStyle = theme.gridColor;
    const gridStep=40;
    const startX = Math.floor(camX/gridStep)*gridStep, endX = camX+this.canvas.width+gridStep;
    const startY = Math.floor(camY/gridStep)*gridStep, endY = camY+this.canvas.height+gridStep;
    for(let x=startX;x<endX;x+=gridStep){ ctx.beginPath(); ctx.moveTo(x,startY); ctx.lineTo(x,endY); ctx.stroke(); }
    for(let y=startY;y<endY;y+=gridStep){ ctx.beginPath(); ctx.moveTo(startX,y); ctx.lineTo(endX,y); ctx.stroke(); }

    // background clutter - purely decorative floor dressing, themed per map, walkable and
    // non-interactive (never in this.map.walls). Drawn under everything else so it always
    // reads as ground texture, never obstructs.
    for(const c of this.clutter){
      if(c.x < camX-30 || c.x > camX+this.canvas.width+30 || c.y < camY-30 || c.y > camY+this.canvas.height+30) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.scale(c.scale, c.scale);
      c.fn(ctx, 0, 0, c.color);
      ctx.restore();
    }

    // walls - deliberately high-contrast against the floor: lit stone panels with a bevel,
    // recoloured per the current map's theme. Panels dim when outside the player's current
    // weapon-driven field of view, and light back up the moment they're looked at - fog of
    // war reads as "what am I looking at", not "what's been discovered".
    for(const w of this.map.walls){
      if(w.x+w.w < camX-20 || w.x > camX+this.canvas.width+20 || w.y+w.h < camY-20 || w.y > camY+this.canvas.height+20) continue;
      const cx = w.x+w.w/2, cy = w.y+w.h/2;
      const lit = this._isPointCurrentlyVisible(cx,cy)
        || this._isPointCurrentlyVisible(w.x,w.y) || this._isPointCurrentlyVisible(w.x+w.w,w.y)
        || this._isPointCurrentlyVisible(w.x,w.y+w.h) || this._isPointCurrentlyVisible(w.x+w.w,w.y+w.h);
      ctx.save();
      if(!lit) ctx.globalAlpha = 0.4;
      ctx.fillStyle = theme.wallFill;
      ctx.fillRect(w.x,w.y,w.w,w.h);
      // top/left highlight
      ctx.fillStyle = theme.wallHi;
      ctx.fillRect(w.x,w.y,w.w,3);
      ctx.fillRect(w.x,w.y,3,w.h);
      // bottom/right shadow
      ctx.fillStyle = theme.wallShadow;
      ctx.fillRect(w.x,w.y+w.h-3,w.w,3);
      ctx.fillRect(w.x+w.w-3,w.y,3,w.h);
      // crisp outline
      ctx.strokeStyle = theme.wallOutline;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w.x+0.75,w.y+0.75,w.w-1.5,w.h-1.5);
      ctx.lineWidth = 1;
      ctx.restore();
    }

    // shrinking zone boundary - drawn as a dashed ring plus a subtle red haze just outside it,
    // battle-royale style, so it's clear at a glance which side is safe. The centre itself is
    // marked with a plain X, since that's the point everyone (including the AI's baseline
    // wandering) is ultimately being pulled toward as the ring closes.
    if(this.zone){
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.zone.x, this.zone.y, this.zone.radius, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,90,90,0.6)';
      ctx.lineWidth = 4;
      ctx.setLineDash([16,12]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      const xSize = 14;
      ctx.strokeStyle = 'rgba(255,140,140,0.85)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.zone.x-xSize, this.zone.y-xSize); ctx.lineTo(this.zone.x+xSize, this.zone.y+xSize);
      ctx.moveTo(this.zone.x+xSize, this.zone.y-xSize); ctx.lineTo(this.zone.x-xSize, this.zone.y+xSize);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt';
      ctx.restore();
    }

    // pickups - always visible; fog only ever hides enemies. Each type gets a small
    // procedural sprite drawn on a soft glow pad in its category colour (weapon pickups use
    // that specific weapon's own colour so you can tell what's on the floor at a glance).
    for(const pk of this.pickups){
      pk.bob += 0.05;
      const bobY = Math.sin(pk.bob)*4;
      const cx = pk.x, cy = pk.y+bobY;
      const baseColor = pk.type==='ammo' ? '#ffe27a'
        : pk.type==='weapon' ? (WEAPON_CONFIG[pk.extra] ? WEAPON_CONFIG[pk.extra].color : '#5ad1ff')
        : pk.type==='powerup' ? '#5cffe0'
        : pk.type==='item' ? '#7aff8f'
        : '#ff8fe0';
      ctx.save();
      // ground-anchored shadow (stays put while the icon bobs above it) so pickups read as
      // floating just off the floor rather than flat sprites pasted on top of it
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(pk.x, pk.y+9, 9, 3, 0, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = baseColor;
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = baseColor; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI*2); ctx.stroke();
      ctx.lineWidth = 1;
      if(pk.type==='ammo') drawAmmoIcon(ctx, cx, cy);
      else if(pk.type==='weapon') drawWeaponIcon(ctx, cx, cy, baseColor);
      else if(pk.type==='upgrade'){
        const iconFn = UPGRADE_ICONS[pk.extra];
        if(iconFn) iconFn(ctx, cx, cy);
      }
      else {ctx.fillStyle='#fff';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(pk.type==='powerup'?'Q':'E',cx,cy);}
      ctx.restore();
    }

    for(const h of this.hazards){if(!h.active)continue;ctx.save();ctx.translate(h.x,h.y);
      if(h.type==='barrel'){ctx.fillStyle='#a52b2b';ctx.strokeStyle='#ffb15c';ctx.fillRect(-9,-13,18,26);ctx.strokeRect(-9,-13,18,26);ctx.fillStyle='#ffe27a';ctx.fillRect(-9,-3,18,5);}
      else if(h.type==='alarm'){ctx.strokeStyle=h.cooldown>0?'#ff4242':'#ffcf5c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ff4242';ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();}
      else {ctx.strokeStyle='#65c7ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-9,1);ctx.lineTo(-3,-7);ctx.lineTo(1,5);ctx.lineTo(8,-5);ctx.stroke();}
      ctx.restore();}

    for(const o of this.objectives){if(o.type==='extract'&&!o.active)continue;ctx.save();ctx.translate(o.x,o.y);ctx.strokeStyle=o.captured?'#55e58a':o.type==='extract'?'#5ad1ff':'#ffd15c';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,24+Math.sin(performance.now()/180)*2,0,Math.PI*2);ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(o.type==='extract'?'EXIT':'INTEL',0,4);ctx.restore();}

    // chests - a plain box icon, with a filling progress ring while someone (player or an
    // idle enemy) is channel-opening it, and a dimmed look once emptied.
    for(const chest of this.chests){
      drawChestIcon(ctx, chest.x, chest.y, chest.opened);
      if(!chest.opened && chest.progress>0){
        const t = chest.progress/chest.requiredTime;
        ctx.beginPath();
        ctx.arc(chest.x, chest.y, 16, -Math.PI/2, -Math.PI/2 + t*Math.PI*2);
        ctx.strokeStyle = chest.openerType==='player' ? '#5ad1ff' : '#ff8f4d';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    // footprints - fading breadcrumbs left by anyone (enemies and the player alike), only
    // shown in fog the player has already explored (so they hint at nearby activity without
    // revealing the unknown). Player-left prints are tinted faintly blue so they read as
    // distinct from enemy trails at a glance.
    const nowTs = performance.now();
    for(const fp of this.footprints){
      if(!this.fog.isExplored(fp.x, fp.y)) continue;
      const age = nowTs - fp.born;
      const maxAge = fp.maxAge!=null ? fp.maxAge : FOOTPRINT_MAX_AGE;
      const alpha = Math.max(0, 1 - age/maxAge) * 0.55;
      if(alpha<=0) continue;
      ctx.beginPath();
      ctx.fillStyle = fp.owner==='player' ? `rgba(140,190,255,${alpha.toFixed(3)})` : `rgba(190,210,230,${alpha.toFixed(3)})`;
      ctx.arc(fp.x, fp.y, 2.5, 0, Math.PI*2);
      ctx.fill();
    }

    // gravestones - persistent marker wherever something died this round. Always visible
    // (like pickups/walls, fog only ever hides enemies) so they read as a lasting record of
    // the fight rather than something you have to be looking at the right moment to see.
    for(const g of this.gravestones){
      drawGravestone(ctx, g.x, g.y, g.style);
    }

    // gunfire sound-location pings - a fading ring at the origin of every shot, marking
    // "a gun fired here" rather than showing the bullet's flight path. Only visible within
    // that shot's audible/visible radius; Silencer (player) and silenced archetypes (enemy)
    // shrink the radius, so suppressed fire stays quiet unless you're already close.
    const pingDuration = 700; // ms
    for(const ge of this.gunfireEvents){
      const age = nowTs - ge.t;
      if(age > pingDuration) continue;
      const dist = Math.hypot(ge.x-p.x, ge.y-p.y);
      if(dist > ge.visRadius) continue;
      const lifeT = age/pingDuration;
      const distFade = Math.max(0.25, 1 - dist/ge.visRadius);
      const alpha = (1-lifeT) * distFade;
      const ringRadius = 10 + lifeT*62;
      ctx.beginPath();
      ctx.arc(ge.x, ge.y, ringRadius, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(255,224,140,${alpha.toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // enemies - only render if currently visible
    for(const e of this.enemies){
      if(e.dead) continue;
      if(!this._isPointCurrentlyVisible(e.x,e.y)&&!(p.scanTime>0&&Math.hypot(e.x-p.x,e.y-p.y)<520)) continue;
      const spriteFn = ENEMY_SPRITES[e.archetype];
      if(spriteFn) spriteFn(ctx, e.x, e.y, e.aimAngle, e.cfg.color);
      else { ctx.beginPath(); ctx.fillStyle=e.cfg.color; ctx.arc(e.x,e.y,e.radius,0,Math.PI*2); ctx.fill(); }
      if(e.isElite){
        ctx.beginPath(); ctx.arc(e.x,e.y,e.radius+3,0,Math.PI*2);
        ctx.strokeStyle='#ffcf5c'; ctx.lineWidth=2.5; ctx.stroke(); ctx.lineWidth=1;
      }
      if(e.isCommander){ctx.fillStyle='#ffd15c';ctx.font='bold 17px sans-serif';ctx.textAlign='center';ctx.fillText('♛',e.x,e.y-e.radius-20);}
      // squad membership marker - small tag above the HP bar so rival squads (or, in Free
      // For All, individual solo agents) read as visually distinct from one another
      if(e.squadId!=null){
        const squadColors = ['#5ad1ff','#ff6bcf','#ffe27a','#7aff8f','#ff8f4d','#c58fff','#4dd9ff','#ff4d7a','#a8ff4d','#ffcf4d'];
        ctx.fillStyle = squadColors[e.squadId % squadColors.length];
        ctx.fillRect(e.x-4, e.y-e.radius-18, 8, 4);
      }
      // hp bar
      ctx.fillStyle='#300'; ctx.fillRect(e.x-16,e.y-e.radius-10,32,4);
      ctx.fillStyle='#ff5c5c'; ctx.fillRect(e.x-16,e.y-e.radius-10,32*Math.max(0,e.hp/e.maxHp),4);
    }

    // bullets - plain, always-visible projectiles (fog only ever hides enemies). The gunfire
    // ping above is what's gated by silencer/visibility, not the physical bullet itself.
    for(const b of this.playerBullets){
      ctx.beginPath(); ctx.fillStyle=b.color; ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill();
    }
    for(const b of this.enemyBullets){
      ctx.beginPath(); ctx.fillStyle=b.color; ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill();
    }

    // death effects - small outward pixel burst in the victim's own colour, quick fade
    for(const fx of this.deathEffects){
      for(const pt of fx.particles){
        if(pt.life<=0) continue;
        const alpha = pt.life/pt.maxLife;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(pt.x-2, pt.y-2, 4, 4);
      }
    }
    ctx.globalAlpha = 1;

    // firing cone (subtle) - reflects the live cone width (tightens 30% when standing still)
    // and leans out from the peeked position when hugging a corner.
    const fx = p.x + p.peekOffset.x, fy = p.y + p.peekOffset.y;
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = p.weaponStats.color;
    ctx.beginPath();
    ctx.moveTo(fx,fy);
    const coneHalf = (p.getLiveConeWidth()*Math.PI/180)/2;
    const steps=16;
    for(let i=0;i<=steps;i++){
      const ang = p.aimAngle - coneHalf + (i/steps)*coneHalf*2;
      ctx.lineTo(fx+Math.cos(ang)*p.weaponStats.range, fy+Math.sin(ang)*p.weaponStats.range);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // player body stays at its true (collision) position, drawn as the player's own sprite
    drawPlayerSprite(ctx, p.x, p.y, p.aimAngle, p.weaponStats.color);
    if(p.shieldTime>0){ctx.strokeStyle='rgba(90,209,255,.85)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,27,0,Math.PI*2);ctx.stroke();}
    if(p.smokeTime>0){ctx.fillStyle='rgba(115,125,145,.42)';ctx.beginPath();ctx.arc(p.x,p.y,125,0,Math.PI*2);ctx.fill();}
    // a small peek marker (gun/eye leaning past the corner) shows the offset vision and
    // firing origin whenever it's non-zero, so the lean is visually legible.
    const peekMag = Math.hypot(p.peekOffset.x, p.peekOffset.y);
    if(peekMag > 1){
      ctx.beginPath();
      ctx.fillStyle = '#5ad1ff';
      ctx.globalAlpha = 0.85;
      ctx.arc(fx, fy, 5, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(90,209,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(fx,fy); ctx.stroke();
      ctx.lineWidth = 1;
    }

    ctx.restore();
    this._renderSoundIndicators();
    this._renderMinimap();

    // NOTE: the darkness overlay is intentionally not drawn - the map, walls and pickups are
    // always fully visible. Fog of war is still computed every frame (see _updateFog /
    // _isPointCurrentlyVisible) and continues to gate enemy rendering and player auto-fire
    // targeting below, so weapon-driven visibility remains a real combat mechanic even
    // though it's no longer painted over the environment.
  }

  _renderSoundIndicators(){
    const ctx=this.ctx,p=this.player,now=performance.now(),cx=this.canvas.width/2,cy=this.canvas.height/2;
    for(const sound of this.soundEvents){const age=now-sound.t,dist=Math.hypot(sound.x-p.x,sound.y-p.y);if(age>2200||dist>sound.radius||dist<90)continue;const angle=Math.atan2(sound.y-p.y,sound.x-p.x),r=Math.min(cx,cy)-34,x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r;ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=(1-age/2200)*Math.max(.3,1-dist/sound.radius);ctx.fillStyle=sound.type==='footsteps'?'#b7d4e8':sound.type==='reload'?'#7aff8f':'#ffe27a';ctx.beginPath();ctx.moveTo(11,0);ctx.lineTo(-7,-7);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();ctx.restore();}
  }

  _renderMinimap(){
    const canvas=document.getElementById('minimap'),m=canvas.getContext('2d'),sx=canvas.width/this.map.worldW,sy=canvas.height/this.map.worldH;m.clearRect(0,0,canvas.width,canvas.height);m.fillStyle='#05090e';m.fillRect(0,0,canvas.width,canvas.height);
    this.map.rooms.forEach(room=>{const c=this.map.center(room);if(!this.fog.isExplored(c.x,c.y))return;m.fillStyle='#263747';m.fillRect(room.x*sx,room.y*sy,room.w*sx,room.h*sy);});
    this.objectives.forEach(o=>{if(!o.active&&o.type==='extract')return;if(!this.fog.isExplored(o.x,o.y)&&this.player.scanTime<=0)return;m.fillStyle=o.captured?'#55e58a':o.type==='extract'?'#5ad1ff':'#ffd15c';m.fillRect(o.x*sx-2,o.y*sy-2,4,4);});
    const now=performance.now();this.soundEvents.forEach(s=>{if(now-s.t>2200)return;m.strokeStyle='#ffe27a';m.beginPath();m.arc(s.x*sx,s.y*sy,3,0,Math.PI*2);m.stroke();});
    if(this.player.scanTime>0)this.enemies.forEach(e=>{if(!e.dead&&Math.hypot(e.x-this.player.x,e.y-this.player.y)<520){m.fillStyle=e.isCommander?'#ffd15c':'#ff5c5c';m.fillRect(e.x*sx-1,e.y*sy-1,3,3);}});
    m.fillStyle='#5ad1ff';m.beginPath();m.arc(this.player.x*sx,this.player.y*sy,3,0,Math.PI*2);m.fill();
  }

  _isRenderable(x,y){
    // currently visible OR previously explored (faint)
    return this._isPointCurrentlyVisible(x,y);
  }

  _renderFog(camX,camY){
    const fctx = this.fogCtx;
    const w = this.canvas.width, h = this.canvas.height;
    fctx.clearRect(0,0,w,h);

    // 1. previously-explored base: sample fog grid within camera view, draw dark-but-visible tiles
    fctx.fillStyle = 'rgba(4,6,10,1)';
    fctx.fillRect(0,0,w,h);
    const tile = this.fog.tile;
    const c0 = Math.floor(camX/tile), c1 = Math.ceil((camX+w)/tile);
    const r0 = Math.floor(camY/tile), r1 = Math.ceil((camY+h)/tile);
    fctx.fillStyle = 'rgba(20,28,38,0.82)';
    for(let ry=r0; ry<=r1; ry++){
      for(let cx=c0; cx<=c1; cx++){
        if(cx<0||ry<0||cx>=this.fog.cols||ry>=this.fog.rows) continue;
        if(this.fog.explored[this.fog.idx(cx,ry)]===1){
          fctx.fillRect(cx*tile-camX, ry*tile-camY, tile+1, tile+1);
        }
      }
    }

    // 2. cut out fully-visible current polygons (main cone + peripheral + local)
    fctx.save();
    fctx.globalCompositeOperation = 'destination-out';
    const drawPoly = (poly, alpha)=>{
      if(!poly) return;
      fctx.globalAlpha = alpha;
      fctx.beginPath();
      poly.forEach((pt,i)=>{
        const sx = pt.x-camX, sy = pt.y-camY;
        if(i===0) fctx.moveTo(sx,sy); else fctx.lineTo(sx,sy);
      });
      fctx.closePath();
      fctx.fill();
    };
    const polys = this._currentPolys || {};
    drawPoly(polys.mainPoly, 1);
    drawPoly(polys.peripheralPoly, 0.55);
    drawPoly(polys.localPoly, 1);
    fctx.restore();

    this.ctx.drawImage(this.fogCanvas,0,0);
  }
}

// ------------------------------------------------------------------------------------------
// 10. ARMOURY UI
// ------------------------------------------------------------------------------------------
function renderArmoury(game){
  document.getElementById('coinTotal').textContent = PlatformManager.getCoins();
  const grid = document.getElementById('weaponGrid');
  grid.innerHTML = '';
  WEAPON_ORDER.forEach(id=>{
    const w = WEAPON_CONFIG[id];
    const owned = game.progress.unlockedWeapons.has(id);
    const card = document.createElement('div');
    card.className = 'weaponCard';
    card.innerHTML = `
      <h3>${w.name}</h3>
      <div class="desc">${w.desc}</div>
      <div class="desc">DMG ${w.damage} · RANGE ${w.range} · MAG ${w.magazineSize} · CONE ${w.coneWidth}°</div>
      <button class="unlockBtn ${owned?'owned':''}" ${owned? 'disabled':''}>${owned? 'OWNED' : (w.unlockCost===0?'FREE':`Unlock — ${w.unlockCost}`)}</button>
    `;
    const btn = card.querySelector('.unlockBtn');
    if(!owned){
      btn.disabled = PlatformManager.getCoins() < w.unlockCost;
      btn.onclick = ()=>{
        if(PlatformManager.spendCoins(w.unlockCost)){
          game.progress.unlockedWeapons.add(id);
          game.saveProgress();
          window.AchievementManager?.notify?.('upgrade_purchased');
          renderArmoury(game);
        }
      };
    }
    grid.appendChild(card);
  });
  renderTombstones(game);
}

function renderTombstones(game){
  const grid=document.getElementById('tombstoneGrid');
  grid.innerHTML='';
  const choices=[{id:'default',name:'Standard Stone',cost:0,desc:'The original field marker.'},...TOMBSTONE_CONFIG];
  choices.forEach(item=>{
    const owned=game.progress.ownedTombstones.has(item.id),equipped=game.progress.gravestoneStyle===item.id;
    const card=document.createElement('div');card.className='weaponCard tombstoneCard';
    const preview=document.createElement('canvas');preview.className='tombstonePreview';preview.width=54;preview.height=54;
    const details=document.createElement('div');
    details.innerHTML=`<h3>${item.name}</h3><div class="desc">${item.desc}</div><button class="unlockBtn ${equipped?'equipped':owned?'owned':''}">${equipped?'EQUIPPED':owned?'EQUIP':`Purchase — ${item.cost}`}</button>`;
    const button=details.querySelector('button');
    button.disabled=equipped||(!owned&&PlatformManager.getCoins()<item.cost);
    button.onclick=()=>{
      if(owned){game.progress.gravestoneStyle=item.id;game.saveProgress();renderArmoury(game);return;}
      if(PlatformManager.spendCoins(item.cost)){
        game.progress.ownedTombstones.add(item.id);game.progress.gravestoneStyle=item.id;game.saveProgress();
        window.AchievementManager?.notify?.('upgrade_purchased');renderArmoury(game);
      }
    };
    card.append(preview,details);grid.appendChild(card);
    drawGravestone(preview.getContext('2d'),27,31,item.id);
  });
}

// ------------------------------------------------------------------------------------------
// 11. BOOT
// ------------------------------------------------------------------------------------------
const game = new Game();

const MODE_DESCRIPTIONS = {
  teaming: 'Room encounters plus 3 squads of 4 - squads fight each other as well as you.',
  ffa: '10 solo agents, everyone their own team. Pure last-one-standing - no room encounters, just loot rooms and the fight.',
  commander:'Hunt a heavily armoured commander who buffs and directs nearby soldiers.',
  intel:'Capture three intelligence terminals while hostile squads contest the arena.',
  extraction:'Secure a hidden intelligence cache, then survive at the extraction zone.'
};
function setGameMode(mode){
  game.gameMode = mode;
  const buttons={teaming:'modeTeamingBtn',ffa:'modeFfaBtn',commander:'modeCommanderBtn',intel:'modeIntelBtn',extraction:'modeExtractionBtn'};
  Object.entries(buttons).forEach(([id,element])=>document.getElementById(element).classList.toggle('active',mode===id));
  document.getElementById('modeDesc').textContent = MODE_DESCRIPTIONS[mode];
}
document.getElementById('modeTeamingBtn').onclick = ()=> setGameMode('teaming');
document.getElementById('modeFfaBtn').onclick = ()=> setGameMode('ffa');
document.getElementById('modeCommanderBtn').onclick = ()=> setGameMode('commander');
document.getElementById('modeIntelBtn').onclick = ()=> setGameMode('intel');
document.getElementById('modeExtractionBtn').onclick = ()=> setGameMode('extraction');
document.getElementById('deployPowerBtn').onclick=()=>game.deployPowerup();
document.getElementById('deployItemBtn').onclick=()=>game.deployItem();
document.querySelectorAll('[data-armoury-tab]').forEach(button=>button.onclick=()=>{
  const tab=button.dataset.armouryTab;
  document.querySelectorAll('[data-armoury-tab]').forEach(item=>item.classList.toggle('active-tab',item===button));
  document.getElementById('weaponGrid').hidden=tab!=='weapons';
  document.getElementById('tombstoneGrid').hidden=tab!=='tombstones';
});

document.getElementById('startRunBtn').onclick = ()=> game.startRun();
document.getElementById('openArmouryFromStartBtn').onclick = ()=>{
  document.getElementById('startScreen').classList.remove('active');
  renderArmoury(game);
  document.getElementById('armouryScreen').classList.add('active');
};
document.getElementById('openArmouryBtn').onclick = ()=>{
  document.getElementById('gameOverScreen').classList.remove('active');
  renderArmoury(game);
  document.getElementById('armouryScreen').classList.add('active');
};
document.getElementById('openArmouryFromVictoryBtn').onclick = ()=>{
  document.getElementById('victoryScreen').classList.remove('active');
  renderArmoury(game);
  document.getElementById('armouryScreen').classList.add('active');
};
document.getElementById('playAgainFromDeathBtn').onclick = ()=>{
  document.getElementById('gameOverScreen').classList.remove('active');
  showHome();
};
document.getElementById('playAgainFromVictoryBtn').onclick = ()=>{
  document.getElementById('victoryScreen').classList.remove('active');
  showHome();
};
document.getElementById('closeArmouryBtn').onclick = ()=>{
  document.getElementById('armouryScreen').classList.remove('active');
  showHome();
};

function refreshHome(){
  const stats = PlatformManager.getGameStats(GAME_CONFIG.id) || {};
  document.getElementById('homeKills').textContent = Number(localStorage.getItem('shooterStudyingLifetimeKills') || 0);
  document.getElementById('homeHighScore').textContent = stats.highScore || 0;
  document.getElementById('homeCorrect').textContent = stats.correct || 0;
  document.getElementById('homeCoins').textContent = PlatformManager.getCoins();
}

function showHome(){
  refreshHome();
  document.getElementById('startScreen').classList.add('active');
}

function startHomeBackdrop(){
  const canvas=document.getElementById('homeBg'),ctx=canvas.getContext('2d');
  const resize=()=>{const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);};
  resize();window.addEventListener('resize',resize);
  const agents=Array.from({length:9},(_,i)=>({x:(i*173)%Math.max(innerWidth,1),y:80+(i*97)%Math.max(innerHeight-140,1),speed:10+i*2,color:ENEMY_CONFIG[NORMAL_ARCHETYPES[i%NORMAL_ARCHETYPES.length]].color}));
  let previous=performance.now();
  const draw=now=>{const dt=Math.min(.05,(now-previous)/1000);previous=now;ctx.clearRect(0,0,innerWidth,innerHeight);ctx.strokeStyle='rgba(90,209,255,.12)';ctx.lineWidth=1;for(let x=0;x<innerWidth;x+=54){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,innerHeight);ctx.stroke()}for(let y=0;y<innerHeight;y+=54){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(innerWidth,y);ctx.stroke()}agents.forEach((agent,i)=>{agent.x+=agent.speed*dt;if(agent.x>innerWidth+30)agent.x=-30;ctx.save();ctx.translate(agent.x,agent.y);ctx.rotate(Math.sin(now/1200+i)*.35);drawHumanoidBody(ctx,16,12,5,agent.color);drawWeaponLine(ctx,13,2,2,'#d9ecf5');ctx.restore()});requestAnimationFrame(draw);};
  requestAnimationFrame(draw);
}

async function prepareQuestions(){
  const status = document.getElementById('bankMessage');
  const start = document.getElementById('startRunBtn');
  const result = await QuestionManager.loadCurrentBanks(GAME_CONFIG.supportedQuestionFormats);
  if(result.ok){
    status.textContent = `Class questions ready · ${result.available.length} compatible format${result.available.length===1?'':'s'}`;
    start.disabled = false;
  }else{
    status.textContent = result.error === 'class-code-required'
      ? 'Please enter your class code on the Arcade Academy Hub.'
      : 'This class does not have compatible questions for this game.';
    start.disabled = true;
  }
  refreshHome();
}

window.addEventListener('arcade-coins-changed', refreshHome);
if(window.ChallengeManager) ChallengeManager.register({snapshot:()=>({score:Math.round(game.stats?.score||0),alive:!!game.running})});
else window.addEventListener('arcade-challenge-manager-ready',()=>ChallengeManager.register({snapshot:()=>({score:Math.round(game.stats?.score||0),alive:!!game.running})}),{once:true});
prepareQuestions();
startHomeBackdrop();
