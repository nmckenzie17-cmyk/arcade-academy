(function(){
"use strict";

// Identifies this game to the shared PlatformManager (shared/js/PlatformManager.js).
// Platform-wide stats (coins, question totals, sessions, high score) are keyed by this id.
const GAME_CONFIG = { id: 'cavern-crammer', name: 'Cavern Crammer' };

// Cavern Crammer's shrine quizzes are drag-a-term-to-its-definition rounds, so they use
// QuestionManager's "matching" bank shape ({ name, cards:[{term, definition}] }).
const QUESTION_BANK_TYPE = 'matching';

/* ============================= STORAGE ============================= */
// Only per-run-independent progression lives here (upgrades/skins/character/etc).
// The persistent coin balance is NOT stored here — it lives in PlatformManager as the
// single source of truth for the shared coin economy. Use PlatformManager.getCoins() /
// addCoins() / spendCoins() instead of a local field.
const SAVE_KEY = 'cavernCrammerGameProgress';
const DEFAULT_SAVE = { upgrades:{maxHealthBonus:0, jumpBonus:0, wallJump:false, magnetTier:0, speedTier:0, extraLives:0}, skin:'green', skinsOwned:['green'], character:'wisp',
  hasClearedLoop:false, hardMode:false, nextRunAdjust:0, questionWeights:{},
  // Lifetime stats shown on the title screen (separate from PlatformManager's shared
  // coin/highscore totals — these are Cavern Crammer's own running totals).
  stats:{ totalRuns:0, bestDepth:0, vaultsOpened:0, questionsCorrect:0 } };
let save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
let saveDirty = false;

function loadSave(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    save = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SAVE)), parsed);
    save.upgrades = Object.assign({maxHealthBonus:0,jumpBonus:0,wallJump:false,magnetTier:0,speedTier:0,extraLives:0}, parsed.upgrades||{});
    save.questionWeights = (parsed.questionWeights && typeof parsed.questionWeights==='object') ? parsed.questionWeights : {};
    save.stats = Object.assign({totalRuns:0, bestDepth:0, vaultsOpened:0, questionsCorrect:0}, parsed.stats||{});
  }catch(e){ /* no save yet, or localStorage unavailable — fresh start */ }
}
function persistSave(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }catch(e){ /* localStorage unavailable (e.g. private browsing) — fail silently */ }
}
// Coins collected in-level are "carried" and at risk until banked at a shrine/goal.
function addCoins(n){
  const v = Math.round(n);
  session.carriedCoins += v;
  session.stats.coinsEarned += v;
}
function bankCarriedCoins(){
  // Coins remain run-local until the accuracy settlement at game over.
  session.carriedCoins = 0;
}

/* ============================= CANVAS SETUP ============================= */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const VW = 384, VH = 216; // world/camera units — all game logic and draw calls use this space, unchanged
const RENDER_SCALE = 2;   // supersamples the backing store for crisper, more detailed pixel art
canvas.width = VW*RENDER_SCALE; canvas.height = VH*RENDER_SCALE;
ctx.imageSmoothingEnabled = false;
ctx.scale(RENDER_SCALE, RENDER_SCALE);

// Offscreen buffer used to build the darkness mask (dark everywhere, a soft hole around
// the player) before compositing it over the fully-rendered scene each frame.
const maskCanvas = document.createElement('canvas');
maskCanvas.width = VW; maskCanvas.height = VH;
const maskCtx = maskCanvas.getContext('2d');
const BASE_LANTERN_RADIUS = 54; // roughly 3x the player's size

/* ============================= INPUT ============================= */
const input = { left:false, right:false, jumpHeld:false, jumpPressed:false, poundPressed:false, dashRequest:0 };
const lastDirPress = {left:0, right:0};
const DOUBLE_TAP_WINDOW = 280;
function registerDirTap(dir){
  const t = performance.now();
  if(t - lastDirPress[dir] < DOUBLE_TAP_WINDOW) input.dashRequest = dir==='left' ? -1 : 1;
  lastDirPress[dir] = t;
}
window.addEventListener('keydown', e=>{
  if(['ArrowLeft','KeyA'].includes(e.code)){ if(!input.left) registerDirTap('left'); input.left = true; }
  if(['ArrowRight','KeyD'].includes(e.code)){ if(!input.right) registerDirTap('right'); input.right = true; }
  if(['ArrowUp','KeyW','Space'].includes(e.code)){ if(!input.jumpHeld) input.jumpPressed = true; input.jumpHeld = true; e.preventDefault(); }
  if(['ArrowDown','KeyS'].includes(e.code)){ input.poundPressed = true; e.preventDefault(); }
});
window.addEventListener('keyup', e=>{
  if(['ArrowLeft','KeyA'].includes(e.code)) input.left = false;
  if(['ArrowRight','KeyD'].includes(e.code)) input.right = false;
  if(['ArrowUp','KeyW','Space'].includes(e.code)) input.jumpHeld = false;
});
function bindTouchBtn(el, onDown, onUp){
  el.addEventListener('pointerdown', e=>{ e.preventDefault(); el.classList.add('active'); onDown(); });
  ['pointerup','pointerleave','pointercancel'].forEach(ev=> el.addEventListener(ev, e=>{ el.classList.remove('active'); onUp(); }));
}
bindTouchBtn(document.getElementById('btnLeft'), ()=>{ registerDirTap('left'); input.left=true; }, ()=>input.left=false);
bindTouchBtn(document.getElementById('btnRight'), ()=>{ registerDirTap('right'); input.right=true; }, ()=>input.right=false);
bindTouchBtn(document.getElementById('jumpBtn'), ()=>{ if(!input.jumpHeld) input.jumpPressed=true; input.jumpHeld=true; }, ()=>input.jumpHeld=false);
document.getElementById('poundBtn').addEventListener('pointerdown', e=>{ e.preventDefault(); input.poundPressed = true; });
document.getElementById('warpBtn').addEventListener('pointerdown', e=>{
  e.preventDefault();
  if(session.warpCharges<=0) return;
  session.warpTargeting = !session.warpTargeting;
  document.getElementById('warpBtn').classList.toggle('targeting', session.warpTargeting);
  if(session.warpTargeting) showToast('Tap where you want to warp...', 1400);
});
canvas.addEventListener('pointerdown', e=>{
  if(!session.warpTargeting || session.warpCharges<=0 || STATE!=='playing' || !level) return;
  const rect = canvas.getBoundingClientRect();
  const worldX = (e.clientX-rect.left)*(VW/rect.width) + camX;
  const worldY = (e.clientY-rect.top)*(VH/rect.height) + camY;
  player.x = Math.max(0, Math.min(level.width-player.w, worldX-player.w/2));
  player.y = Math.max(0, Math.min(level.height-player.h, worldY-player.h/2));
  player.vx = 0; player.vy = 0;
  session.warpCharges--;
  session.warpTargeting = false;
  document.getElementById('warpBtn').classList.remove('targeting');
  spawnParticles(player.x+player.w/2, player.y+player.h/2, 16, '#8b5fbf', 2.6);
  showToast('Warped!', 900);
});

/* ============================= CONSTANTS ============================= */
// Physics run at ~50% speed (velocities halved, gravity quartered) so motion
// takes about twice as long start-to-finish while covering the same distances —
// true slow motion, not just smaller jumps. JUMP_APEX below still comes out the
// same value as before, so all jump-apex-derived level spacing stays valid.
const GRAVITY = 0.155;
const TERMINAL_V = 5.5;
const MOVE_SPEED = 0.775;
const ACCEL = 0.14;
const AIR_ACCEL = 0.09;
const BASE_JUMP_V = -4.8;
const DOUBLE_JUMP_V = -4.2;
const COYOTE_MAX = 7;
const JUMP_BUFFER_MAX = 7;
// Highest a base (unboosted) jump can rise: v^2/(2g). Used to size vertical
// gaps between layers so a jump always has genuine room before hitting a ceiling.
const JUMP_APEX = (BASE_JUMP_V*BASE_JUMP_V)/(2*GRAVITY);
const MIN_LAYER_GAP = Math.round(JUMP_APEX*1.0);    // floor for the smallest layer gap
const MAX_LAYER_GAP = Math.round(JUMP_APEX*1.7);    // ceiling for the largest layer gap
// Horizontal distance a single jump can cross (time aloft x move speed), with margin for a
// standing jump with no run-up and a bit of input latency. Floor pit gaps wider than this
// get a stepping-stone platform so they're never a required double jump.
const JUMP_FLIGHT_FRAMES = 2 * (-BASE_JUMP_V/GRAVITY);
const SAFE_JUMP_GAP = Math.floor(MOVE_SPEED * JUMP_FLIGHT_FRAMES * 0.75);
// Gaps (both floor pits and layer-to-layer climbs) scale up over the course of a run:
// a bit with level depth, and more meaningfully with how much traversal power the player
// has actually picked up (extra jump, triple jump, dash, hover, wall jump tier). This keeps
// early, ability-less levels conservative while later, better-equipped levels open up.
function computeGapScale(idx){
  let power = 1;
  if(session.extraJumps>0) power += 0.12;
  if(session.tripleJumpOwned) power += 0.08;
  if(session.wallJump) power += 0.08 + 0.04*Math.max(0, session.wallJumpTier-1);
  if(session.dashOwned) power += 0.15;
  if(session.hoverOwned) power += 0.1;
  if(session.featherFall) power += 0.05;
  const levelScale = 1 + Math.min(0.5, idx*0.015);
  return power * levelScale * (session.adaptiveGapMult||1);
}
// Decaying speed score: ticks down while playing, converted to bonus coins at each
// checkpoint/goal (then reset), rewarding reaching checkpoints faster.
const SPEED_SCORE_MAX = 1000;
const SPEED_SCORE_MIN = 100;
const SPEED_SCORE_DECAY_PER_FRAME = 0.25; // ~15/second at 60fps

/* ============================= GAME/SESSION STATE ============================= */
let STATE = 'title'; // title, playing, quiz, shop, gameover
let levelIndex = 0;
let camX = 0, camY = 0;
let particles = [];
let toastTimer = 0;

const session = {
  hasKey:false, keyGivenThisRun:false,
  lives:3, carriedCoins:0,
  speedScore:1000,
  rewardCounts:{},
  // run-long abilities, granted once via shrine rewards, never permanent across runs
  wallJump:false, wallJumpTier:0,
  extraJumps:0,
  tripleJumpOwned:false, jumpChainCount:0, jumpChainWindow:0,
  dashOwned:false, shadowDash:false, dashAirCharges:1, dashAirChargesUsed:0,
  warpCharges:0, warpTargeting:false,
  hoverOwned:false,
  featherFall:false,
  groundPoundOwned:false, groundPoundTier:0,
  silverChance:0,
  hat:null,
  // cursed blessings — real upside, real downside
  curseGlassCannon:false, curseSpeedMult:1, curseNoTelegraph:false,
  curseHeavyPurse:false, curseGlassLantern:false,
  curseDoubleOrNothing:false,
  curseKnockbackMult:1, curseFallMult:1,
  curseAdrenaline:false,
  curseIronBoots:false, curseJumpMult:1,
  curseVampiric:false,
  // character stats (set by applyCharacterStats)
  charGravityMult:1, charSpeedMult:1, charJumpMult:1, charWindImmune:false,
  charFallDamageMult:1, charKnockbackMult:1, charMagnetBonus:0, charCoinsSurvive:false,
  // adaptive difficulty: consumed once, set from the PREVIOUS run's death count, applies only to this run
  deathsThisRun:0, adaptiveGapMult:1, adaptiveTrapMult:1, adaptiveEnemyMult:1,
  runStartTime:0,
  stats:{ enemiesDefeated:0, bossesDefeated:0, vaultsOpened:0, coinsEarned:0, questionsCorrect:0, questionsTotal:0 }
};

function startingLives(){ return 3 + (save.upgrades.extraLives||0); }

// Astronaut/Ninja/King are built and balanced but hidden from the select screen for now
// (set hidden:false to bring a character back — no other code needs to change).
const CHARACTERS = [
  { id:'wisp', name:'Wisp', tagline:'The lantern-bearer', desc:'Balanced in every way — no bonus, no drawback.',
    gravityMult:1, speedMult:1, jumpMult:1, maxHealthDelta:0, windImmune:false, startDash:false, magnetBonus:0, coinsSurvive:false, fallDamageMult:1, knockbackMult:1 },
  { id:'astronaut', name:'Astronaut', tagline:'Low-gravity drifter', desc:'Floaty jumps and falls, immune to wind gusts. -10% move speed (bulky suit).',
    gravityMult:0.8, speedMult:0.9, jumpMult:1, maxHealthDelta:0, windImmune:true, startDash:false, magnetBonus:0, coinsSurvive:false, fallDamageMult:1, knockbackMult:1, hidden:true },
  { id:'ninja', name:'Ninja', tagline:'Silent blade', desc:'Starts with Dash already unlocked, lands soft (half knockback/fall damage). -1 max health.',
    gravityMult:1, speedMult:1, jumpMult:1, maxHealthDelta:-1, windImmune:false, startDash:true, magnetBonus:0, coinsSurvive:false, fallDamageMult:0.5, knockbackMult:0.6, hidden:true },
  { id:'king', name:'King', tagline:'Royal treasury', desc:'Passive coin magnet and coins always survive death. -10% jump height (heavy robes).',
    gravityMult:1, speedMult:1, jumpMult:0.9, maxHealthDelta:0, windImmune:false, startDash:false, magnetBonus:30, coinsSurvive:true, fallDamageMult:1, knockbackMult:1, hidden:true },
  {id:'skeleton',name:'Skeleton',tagline:'Light-footed revenant',desc:'Half health, double jump height, and collapsing ledges ignore you.',gravityMult:1,speedMult:1,jumpMult:2,maxHealthDelta:0,windImmune:false,startDash:false,magnetBonus:0,coinsSurvive:false,fallDamageMult:1,knockbackMult:1,secret:'secret_skeleton'},
  {id:'riftwalker',name:'Riftwalker',tagline:'Reality skips a beat',desc:'Moves 35% faster, ignores wind and fall damage, but has only one health.',gravityMult:.8,speedMult:1.35,jumpMult:1.2,maxHealthDelta:-99,windImmune:true,startDash:true,magnetBonus:18,coinsSurvive:true,fallDamageMult:0,knockbackMult:.25,secret:'secret_glitch_aura'}
];
function cavernSecret(id){return typeof AchievementManager!=='undefined'&&AchievementManager.hasSecret?.(id);}
function characterAvailable(c){return !c.hidden&&(!c.secret||cavernSecret(c.secret));}
function currentCharacter(){const c=CHARACTERS.find(c=>c.id===save.character);return c&&characterAvailable(c)?c:CHARACTERS[0];}
function applyCharacterStats(){
  const c = currentCharacter();
  session.charGravityMult = c.gravityMult;
  session.charSpeedMult = c.speedMult;
  session.charJumpMult = c.jumpMult;
  session.charWindImmune = c.windImmune;
  session.charFallDamageMult = c.fallDamageMult;
  session.charKnockbackMult = c.knockbackMult;
  session.charMagnetBonus = c.magnetBonus;
  session.charCoinsSurvive = c.coinsSurvive;
  if(c.startDash) session.dashOwned = true;
}

function resetSession(){
  session.hasKey=false; session.keyGivenThisRun=false;
  session.lives = startingLives(); session.carriedCoins = 0;
  session.speedScore = SPEED_SCORE_MAX;
  session.rewardCounts = {};
  session.wallJump = save.upgrades.wallJump; session.wallJumpTier = save.upgrades.wallJump?1:0;
  session.extraJumps = 0;
  session.tripleJumpOwned=false; session.jumpChainCount=0; session.jumpChainWindow=0;
  session.dashOwned=false; session.shadowDash=false; session.dashAirCharges=1; session.dashAirChargesUsed=0;
  session.warpCharges=0; session.warpTargeting=false;
  session.hoverOwned=false;
  session.featherFall=false;
  session.groundPoundOwned=false; session.groundPoundTier=0;
  session.silverChance=0;
  session.hat=null;
  session.curseGlassCannon=false; session.curseSpeedMult=1; session.curseNoTelegraph=false;
  session.curseHeavyPurse=false; session.curseGlassLantern=false;
  session.curseDoubleOrNothing=false;
  session.curseKnockbackMult=1; session.curseFallMult=1;
  session.curseAdrenaline=false;
  session.curseIronBoots=false; session.curseJumpMult=1;
  session.curseVampiric=false;
  session.deathsThisRun = 0;
  session.runStartTime = performance.now();
  session.stats = { enemiesDefeated:0, bossesDefeated:0, vaultsOpened:0, coinsEarned:0, questionsCorrect:0, questionsTotal:0 };
  // Adaptive difficulty: apply whatever the previous run's outcome set, then consume it —
  // this only ever affects the single run right after it was set.
  const adj = save.nextRunAdjust||0;
  session.adaptiveGapMult = 1 + adj*0.1;
  session.adaptiveTrapMult = 1 + adj*0.15;
  session.adaptiveEnemyMult = 1 + adj*0.15;
  save.nextRunAdjust = 0; saveDirty = true; persistSave();
  applyCharacterStats();
}

const player = {
  x:40,y:100,w:12,h:16,vx:0,vy:0,onGround:false,facing:1,
  jumpsUsed:0,health:3,maxHealth:3,invincTimer:0,
  coyote:0,jumpBuffer:0,touchWall:0,standingPlatform:null,
  walkAnim:0, prevBottom:0,
  dashTimer:0, dashCooldown:0, dashDir:1, airDashUsed:0,
  hoverFuel:0, pounding:false
};

let level = null; // current level object
let checkpointSpawn = {x:40,y:100};

/* ============================= LEVEL GENERATION ============================= */
function rand(a,b){ return a + Math.random()*(b-a); }
function ri(a,b){ return Math.floor(rand(a,b+1)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
// Lighten (positive amt) or darken (negative amt) a hex color, amt in [-1,1].
function shadeColor(hex, amt){
  const num = parseInt(hex.slice(1), 16);
  let r = (num>>16) + Math.round(255*amt);
  let g = ((num>>8)&0xff) + Math.round(255*amt);
  let b = (num&0xff) + Math.round(255*amt);
  r = Math.max(0,Math.min(255,r)); g = Math.max(0,Math.min(255,g)); b = Math.max(0,Math.min(255,b));
  return '#' + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1);
}

// Vertical gap between y and the nearest solid (non-passthrough) platform directly above
// the given x-range. Used to keep hazards out from under ceilings too low to jump clear of.
function clearanceAbove(platforms, x1, x2, y){
  let minGap = Infinity;
  for(const p of platforms){
    if(!p.solid || p.type==='passthrough') continue;
    if(p.x < x2 && p.x+p.w > x1){
      const bottom = p.y + p.h;
      if(bottom <= y){
        const gap = y - bottom;
        if(gap < minGap) minGap = gap;
      }
    }
  }
  return minGap;
}

// Builds one horizontal layer's floor as a row of segments with gaps (pits/chasms).
// Returns list of {x1,x2,y,gapBefore:{x1,x2}|null}
function buildLayerSegments(y, width, startPad, gapChance, gapMin, gapMax, longGapChance, longGapMin, longGapMax){
  const segs = [];
  let x = startPad;
  segs.push({x1:0, x2:startPad, y, gapBefore:null});
  while(x < width-260){
    const rolled = x>startPad+80 && Math.random()<gapChance;
    const isLong = rolled && longGapChance && Math.random()<longGapChance;
    const gap = rolled ? (isLong ? ri(longGapMin||150, longGapMax||230) : ri(gapMin, gapMax)) : 0;
    const gapStart = x;
    x += gap;
    const w = ri(120,230);
    segs.push({x1:x, x2:x+w, y, gapBefore: gap>0 ? {x1:gapStart, x2:x, long:isLong} : null});
    x += w;
  }
  segs.push({x1:x, x2:width, y, gapBefore:null});
  return segs;
}

/* ============================= ZONES ============================= */
// Every ZONE_LENGTH normal ruins are followed by one boss ruin, then a new zone begins.
// Within a zone the 4 normal ruins follow a fixed teaching curriculum:
//  1: one layer — introduces the zone's mechanic and jumping over gaps
//  2: two layers — introduces spikes
//  3: three layers — introduces climbing between layers
//  4: same layer count — introduces enemies (and hidden traps)
const ZONE_LENGTH = 4;
const ZONES = [
  { name:'Mossy Ruins', bg:['#241d3d','#181231','#0e0a1c'], hill1:'#1e1836', hill2:'#271f42',
    ground:'#3a3054', groundEdge:'#4c4068', walkway:'#6b5a94', wall:'#4a3d6b', spike:'#c94a44',
    enemyHues:['#8b5fbf','#c0563f','#3f7fc0'], fallDamage:1, icy:false, trapMult:1, bossName:'Moss Warden',
    frozenChance:0, hasWind:false, crumbleChance:0.28, heatingChance:0, growthChance:0.35,
    ambientColor:'#9fe0a0', hillShape:'round', texture:'moss', bossSpecial:'vines', verticalClimb:false },
  { name:'Icy Crypt', bg:['#132735','#0d1c28','#081218'], hill1:'#123042', hill2:'#184254',
    ground:'#1f4a55', groundEdge:'#2c6470', walkway:'#2f7a86', wall:'#1c5560', spike:'#4fd0e6',
    enemyHues:['#3fa7c0','#5fb8d8','#2f7fae'], fallDamage:1, icy:true, trapMult:1.3, bossName:'Crypt Warden',
    frozenChance:0.4, hasWind:true, crumbleChance:0.28, heatingChance:0, growthChance:0,
    ambientColor:'#dff5fb', hillShape:'icy', texture:'ice', bossSpecial:'frost', verticalClimb:false },
  { name:'Molten Depths', bg:['#3a1410','#2a0d0a','#180605'], hill1:'#4a1a12', hill2:'#5c2417',
    ground:'#5c2417', groundEdge:'#7a3520', walkway:'#8a4426', wall:'#6b2e1a', spike:'#ff8a3d',
    enemyHues:['#e0564f','#ff8a3d','#c0563f'], fallDamage:2, icy:false, trapMult:1.6, bossName:'Cinder Warden',
    frozenChance:0, hasWind:false, crumbleChance:0.7, heatingChance:0.35, growthChance:0,
    ambientColor:'#ffb066', hillShape:'volcanic', texture:'ember', bossSpecial:'fire', verticalClimb:true },
  ...(cavernSecret('secret_map_border')?[{name:'Astral Lost Ruin',bg:['#080d27','#11163d','#050817'],hill1:'#151b46',hill2:'#25285f',ground:'#34335f',groundEdge:'#d9b85f',walkway:'#625f91',wall:'#29294f',spike:'#74f4e8',enemyHues:['#f2d06b','#7ce8db','#ba82ff'],fallDamage:1,icy:false,trapMult:1.8,bossName:'The Ruin Cartographer',frozenChance:0,hasWind:true,crumbleChance:0.45,heatingChance:0,growthChance:0.2,ambientColor:'#ffe39a',hillShape:'round',texture:'moss',bossSpecial:'vines',verticalClimb:true}]:[])
];
function getZoneIndex(li){ return Math.floor(li/(ZONE_LENGTH+1)); }
function getPositionInZone(li){ return li%(ZONE_LENGTH+1); }
function isBossLevel(li){ return getPositionInZone(li)===ZONE_LENGTH; }
function zoneFor(li){ return ZONES[getZoneIndex(li)%ZONES.length]; }

function generateLevel(idx, zone){
  const position = getPositionInZone(idx);          // 0..3 within the zone (boss levels never reach generateLevel)
  const zoneCycle = Math.floor(getZoneIndex(idx) / ZONES.length); // 0 first time through the zone list, 1 second time, etc.
  const vertical = !!zone.verticalClimb;
  const baseLayerCount = position===0 ? 1 : position===1 ? 2 : 3; // level 4 keeps level 3's layer count
  let layerCount = Math.min(6, baseLayerCount + zoneCycle);       // later passes through a zone get taller
  if(vertical) layerCount = Math.min(14, (position===0?3:position===1?5:7) + zoneCycle*2);
  const spikesEnabled = position>=1;                 // level 2+
  const enemiesEnabled = position>=2;                // level 3+ (level 4 gets double, see enemyCount below)
  const trapsEnabled = position>=3;                  // hidden traps arrive alongside enemies

  const colW = 150;
  const cols = vertical ? (position===0?6:8) : 15 + idx*2;
  const width = cols*colW;
  // Gap sizes scale with level depth and the player's current jump toolkit (see computeGapScale).
  const gapScale = computeGapScale(idx);
  const minLayerGap = MIN_LAYER_GAP*gapScale;
  const maxLayerGap = MAX_LAYER_GAP*gapScale;
  const safeJumpGap = SAFE_JUMP_GAP*gapScale;
  // Each layer-to-layer gap is randomized, but never smaller than 75% of a base
  // jump's max height (so there's always real room to jump, not an instant bonk),
  // and generally larger than before for more open verticality.
  const layerGaps = [];
  for(let i=0; i<layerCount-1; i++) layerGaps.push(rand(minLayerGap, maxLayerGap));
  const layerY = [96 + layerGaps.reduce((a,b)=>a+b, 0)];
  for(let i=0; i<layerGaps.length; i++) layerY.push(layerY[i]-layerGaps[i]);
  const baseY = layerY[0];                       // bottom layer's floor y
  const height = baseY + 60;                     // total vertical extent of the ruin

  const platforms = [];
  const spikes = [];
  const layerSegs = [];

  for(let L=0; L<layerCount; L++){
    const y = layerY[L];
    const isBottom = (L===0);
    const bigGaps = (L===1 || L===2);
    const groundForcesDetour = isBottom && position>=2;
    const gapChance = isBottom ? (groundForcesDetour?0.42:0.3) : bigGaps ? 0.58 : 0.44;
    const gapRange = (isBottom ? [52,110] : bigGaps ? [90,170] : [52,110]).map(v=>Math.round(v*gapScale));
    const longGapChance = groundForcesDetour ? 0.6 : 0;
    const segs = buildLayerSegments(y, width, isBottom?280:220, gapChance, gapRange[0], gapRange[1], longGapChance, Math.round(150*gapScale), Math.round(230*gapScale));
    layerSegs.push(segs);
    segs.forEach(s=>{
      if(isBottom){
        // the main ground floor never crumbles or ignites — it's always the reliable path
        platforms.push({x:s.x1, y:s.y, w:s.x2-s.x1, h:(height-s.y)+40, solid:true, type:'ground', icy:zone.icy, frozen:false});
      } else {
        const crumble = zone.crumbleChance>0 && Math.random()<zone.crumbleChance;
        const frozen = !crumble && zone.icy && Math.random()<zone.frozenChance;
        platforms.push({x:s.x1, y:s.y, w:s.x2-s.x1, h:16, solid:true, type:'walkway', icy:zone.icy, frozen,
          crumble, crumbleTimer:undefined, broken:false});
      }
      // A pit gap wider than a single jump can safely cross gets stepping stones,
      // so it's never a forced double jump unless the player chooses to skip them.
      // These always stay reliable (no crumble/frozen) since they're a fairness guarantee.
      // Exception: deliberate "long gaps" on the ground floor (levels 3-4) are left
      // unbridged on purpose, forcing a detour up to a higher layer to cross them —
      // the guaranteed 4-connector layer transitions make that detour always possible.
      if(s.gapBefore && !s.gapBefore.long){
        const gapW = s.gapBefore.x2 - s.gapBefore.x1;
        if(gapW > safeJumpGap){
          const hops = Math.ceil(gapW / safeJumpGap);
          const stoneW = 18;
          for(let k=1; k<hops; k++){
            const cx = s.gapBefore.x1 + (gapW/hops)*k;
            platforms.push({x:cx-stoneW/2, y:s.y, w:stoneW, h:14, solid:true, type:'walkway', icy:zone.icy, frozen:false});
          }
        }
      }
    });
  }

  // Vertical wall-jump shafts connecting each layer to the one above it, sited at floor gaps.
  const coins = [];
  for(let L=0; L<layerCount-1; L++){
    const upperSegs = layerSegs[L+1];
    let candidateGaps = upperSegs.filter(s=>s.gapBefore && (s.gapBefore.x2-s.gapBefore.x1)>=44).map(s=>s.gapBefore);
    if(candidateGaps.length===0){
      // guarantee at least one connection: carve a gap into a mid segment of the upper layer
      const midSegs = upperSegs.filter(s=>!s.gapBefore && (s.x2-s.x1)>150);
      const seg = midSegs.length ? pick(midSegs) : null;
      if(seg){
        const gx1 = seg.x1 + 50;
        const gx2 = gx1 + 50;
        const pIdx = platforms.findIndex(p=>p.type==='walkway' && Math.abs(p.x-seg.x1)<0.5 && Math.abs(p.y-seg.y)<0.5);
        if(pIdx>=0){
          platforms.splice(pIdx,1);
          platforms.push({x:seg.x1, y:seg.y, w:gx1-seg.x1, h:16, solid:true, type:'walkway'});
          platforms.push({x:gx2, y:seg.y, w:seg.x2-gx2, h:16, solid:true, type:'walkway'});
        }
        candidateGaps.push({x1:gx1, x2:gx2});
      }
    }
    shuffle(candidateGaps);
    const targetShafts = 1 + (Math.random()<0.55?1:0);
    let placed = 0;
    for(const g of candidateGaps){
      if(placed>=targetShafts) break;
      const gapCenter = (g.x1+g.x2)/2;
      const wallGap = 22;
      const sx = gapCenter - wallGap/2 - 8;
      // Walls hover well above the floor (clear of player height) so the ground
      // path underneath is always walkable — the shaft is an optional shortcut
      // up, never a mandatory (or impassable) chokepoint.
      const groundClearance = 34;
      const shaftTop = layerY[L+1] - 6;
      const shaftBottom = layerY[L] - groundClearance;
      const shaftH = Math.max(24, shaftBottom - shaftTop);
      platforms.push({x:sx, y:shaftTop, w:8, h:shaftH, solid:true, type:'wall'});
      platforms.push({x:sx+8+wallGap, y:shaftTop, w:8, h:shaftH, solid:true, type:'wall'});
      // sprinkle a coin or two up the shaft as a wall-jump reward
      const coinN = ri(1,2);
      for(let c=0;c<coinN;c++){
        coins.push({x:sx+8+wallGap/2, y:shaftTop + (shaftH/(coinN+1))*(c+1), collected:false, phase:rand(0,Math.PI*2)});
      }
      placed++;
    }

    // Pass-through rungs: platforms you can jump up through but still land on,
    // to soften gaps for players not chaining a perfect wall-jump. Always at
    // least one per transition — the ground-to-middle climb especially needs it.
    const gapSize = layerGaps[L];
    const rungCount = gapSize > minLayerGap*1.6 ? 2 : 1;
    for(let r=0; r<rungCount; r++){
      const frac = (r+1)/(rungCount+1);
      const ry = layerY[L] - gapSize*frac;
      const rx = rand(220, width-280);
      platforms.push({x:rx, y:ry, w:ri(56,84), h:10, solid:true, type:'passthrough'});
    }

    // Since the ruin is a strict stack of layers, the number of distinct start-to-finish
    // routes is bounded by whichever transition has the fewest independent connectors
    // (shafts + rungs) — that's the bottleneck. So guaranteeing >=4 routes overall just
    // means guaranteeing every single transition has >=4 connectors of its own.
    const MIN_PATHS_PER_TRANSITION = 4;
    let connectorCount = placed + rungCount;
    let extra = 0;
    while(connectorCount < MIN_PATHS_PER_TRANSITION && extra < 6){
      const frac = rand(0.22, 0.78);
      const ry = layerY[L] - gapSize*frac;
      const rx = rand(220, width-280);
      platforms.push({x:rx, y:ry, w:ri(50,78), h:10, solid:true, type:'passthrough'});
      connectorCount++; extra++;
    }
  }

  // extra floating platforms scattered through the vertical space (chunkier now; some crumble, some pass-through).
  // Solid ones sit well clear of the floor below them (not just barely above it) so they read as properly
  // elevated, and a normal jump over ground-level spikes never bonks a low ceiling.
  // Skipped entirely on single-layer levels (there's no second layer to band them against, and it keeps
  // the intro level clean).
  if(layerCount>1){
    const FLOAT_CLEARANCE = Math.round(JUMP_APEX*1.5);
    const floatCount = Math.floor(width/280) + layerCount;
    const placedFloats = [];
    for(let i=0;i<floatCount;i++){
      let px, attempts=0;
      do{
        px = rand(260, width-260);
        attempts++;
      } while(attempts<8 && placedFloats.some(fx=>Math.abs(fx-px)<130));
      placedFloats.push(px);
      const pw = ri(46,84);
      const moving = Math.random()<0.35;
      const passthrough = !moving && Math.random()<0.3;
      let crumble = false, heats = false, growth = false;
      if(!moving && !passthrough){
        const roll = Math.random();
        if(roll < zone.heatingChance) heats = true;
        else if(roll < zone.heatingChance + zone.crumbleChance) crumble = true;
        else if(roll < zone.heatingChance + zone.crumbleChance + (zone.growthChance||0)) growth = true;
      }
      const frozen = !moving && !passthrough && !heats && !crumble && !growth && zone.icy && Math.random()<zone.frozenChance;
      // Passthrough platforms never block an upward jump, so they don't need the clearance guarantee.
      const clearance = passthrough ? 18 : FLOAT_CLEARANCE;

      let py;
      if(Math.random()<0.15){
        // occasional platform above the very top of the ruin
        const topFloor = layerY[layerCount-1];
        const lo = 50, hi = Math.max(lo, topFloor-clearance);
        py = rand(lo, hi);
      } else {
        const L = ri(0, layerCount-2);
        const floorBelow = layerY[L];
        const ceilAbove = layerY[L+1];
        const highestAllowed = ceilAbove + 14;               // stay clear of the floor above it
        const lowestAllowed = Math.max(highestAllowed, floorBelow - clearance); // never lower than a full clearance above the floor
        py = rand(highestAllowed, lowestAllowed);
      }

      const axis = Math.random()<0.5?'x':'y';
      platforms.push({
        x:px,y:py,w:pw,h:ri(16,28),solid: growth ? false : true,type: passthrough?'passthrough':'floating',
        moving, axis, baseX:px, baseY:py, range:ri(18,34), speed:rand(0.005,0.0125), phase:rand(0,Math.PI*2), dx:0,dy:0,
        crumble, crumbleTimer:undefined, broken:false, frozen,
        heats, heatTimer:undefined, onFire:false, fireTimer:0, coolTimer:0,
        growth, grown:false, growTimer:undefined
      });
    }
  }

  // short mini platforms sitting exactly halfway between each pair of consecutive layers —
  // small, simple resting spots that give a steady rhythm as you climb
  for(let L=0; L<layerCount-1; L++){
    const midY = (layerY[L] + layerY[L+1]) / 2;
    const miniCount = Math.max(2, Math.floor(width/260));
    const placedMiniX = [];
    for(let i=0;i<miniCount;i++){
      let mx, attempts=0;
      do{ mx = rand(240, width-240); attempts++; } while(attempts<6 && placedMiniX.some(px=>Math.abs(px-mx)<150));
      placedMiniX.push(mx);
      const mw = ri(26,40);
      platforms.push({
        x:mx-mw/2, y:midY, w:mw, h:10, solid:true, type:'floating', mini:true,
        moving:false, baseX:mx-mw/2, baseY:midY, dx:0,dy:0,
        crumble:false, crumbleTimer:undefined, broken:false
      });
    }
  }

  // hidden traps: arrow traps mounted at floor's edge, falling blocks suspended overhead
  // (traps arrive at level 4 of each zone, alongside enemies)
  const traps = [];
  const trapMultEff = zone.trapMult * (save.hardMode?1.4:1) * session.adaptiveTrapMult;
  if(trapsEnabled){
    layerSegs.forEach(segs=>{
      segs.forEach((s,i)=>{
        if(i===0 || i===segs.length-1) return;
        const segW = s.x2-s.x1;
        if(segW<70) return;
        if(Math.random() < 0.12*trapMultEff){
          const fromLeft = Math.random()<0.5;
          traps.push({
            type:'arrow', x: fromLeft? s.x1+6 : s.x2-6, y: s.y-14, dir: fromLeft?1:-1,
            state:'idle', timer:0, range:100
          });
        }
        if(Math.random() < 0.09*trapMultEff){
          const bw = ri(26,34);
          const bx = rand(s.x1+20, s.x2-20-bw);
          traps.push({ type:'fallblock', x:bx, y:s.y-rand(70,120), w:bw, h:16, state:'idle', timer:0, vy:0, becamePlatform:false });
        }
      });
    });
  }

  // spikes on ground/walkway segments (arrive at level 2 of each zone; never on the first/last
  // of a layer, and never under a ceiling too low to jump clear of)
  const SPIKE_MIN_CLEARANCE = Math.round(JUMP_APEX) + 12;
  if(spikesEnabled){
    layerSegs.forEach(segs=>{
      segs.forEach((s,i)=>{
        if(i===0 || i===segs.length-1) return;
        if(Math.random()<0.32 && (s.x2-s.x1) > 60){
          const sw = Math.min(28, (s.x2-s.x1)*0.4);
          const sx = rand(s.x1+14, s.x2-14-sw);
          if(clearanceAbove(platforms, sx, sx+sw, s.y-8) >= SPIKE_MIN_CLEARANCE){
            spikes.push({x:sx, y:s.y-8, w:sw, h:8});
          }
        }
      });
    });
    platforms.forEach(p=>{
      if(p.type==='floating' && !p.crumble && !p.heats && !p.growth && Math.random()<0.18){
        if(clearanceAbove(platforms, p.x+p.w/2-6, p.x+p.w/2+6, p.y-8) >= SPIKE_MIN_CLEARANCE){
          spikes.push({x:p.x+p.w/2-6, y:p.y-8, w:12, h:8});
        }
      }
    });
  }

  // enemies distributed across layers (arrive at level 4 of each zone) — mixed types for variety
  const enemies = [];
  const enemyCount = enemiesEnabled ? Math.round((3 + idx + Math.floor(layerCount/2)) * (position===3?2:1) * (save.hardMode?1.6:1) * session.adaptiveEnemyMult) : 0;
  const candidates = platforms.filter(p=>p.type!=='wall' && p.w>50);
  function pickEnemyType(){
    if(zone.icy && Math.random()<0.22) return 'slider';
    const r = Math.random();
    if(r<0.5) return 'crawler';
    if(r<0.76) return 'flyer';
    return 'lobber';
  }
  for(let i=0;i<enemyCount;i++){
    const type = pickEnemyType();
    if(type==='flyer'){
      const L = layerCount>1 ? ri(0,layerCount-2) : 0;
      const floorBelow = layerY[L];
      const ceilAbove = layerCount>1 ? layerY[L+1] : floorBelow-90;
      const fy = rand(ceilAbove+22, floorBelow-30);
      const fx = rand(150, width-150);
      enemies.push({
        type:'flyer', x:fx, y:fy, w:12, h:10, alive:true, hue:pick(zone.enemyHues), vx:0,
        baseX:fx, baseY:fy, phase:rand(0,Math.PI*2), ampX:ri(30,60), ampY:ri(14,26), speed:rand(0.02,0.035)
      });
      continue;
    }
    const p = pick(candidates);
    if(!p) continue;
    const ew=12, eh=11;
    if(type==='lobber'){
      enemies.push({
        type:'lobber', x:rand(p.x+4,p.x+p.w-4-ew), y:p.y-eh, w:ew, h:eh, alive:true, hue:pick(zone.enemyHues),
        vx:0, minX:p.x+2, maxX:p.x+p.w-2-ew, fireTimer:ri(60,140), range:130
      });
    } else {
      const speedMult = type==='slider' ? 2.6 : 1;
      enemies.push({
        type, x:rand(p.x+4,p.x+p.w-4-ew), y:p.y-eh, w:ew, h:eh, alive:true, hue:pick(zone.enemyHues),
        vx: (Math.random()<0.5?-0.25:0.25)*speedMult, minX:p.x+2, maxX:p.x+p.w-2-ew
      });
    }
  }

  // extra coins across all layers/platforms
  const coinTargets = platforms.filter(p=>p.type!=='wall' && p.x>60 && p.x<width-160);
  const coinCount = Math.floor(width/95) + layerCount*2;
  for(let i=0;i<coinCount;i++){
    const p = pick(coinTargets);
    if(!p) continue;
    coins.push({x:rand(p.x+8,p.x+p.w-8), y:p.y-rand(14,40), collected:false, phase:rand(0,Math.PI*2)});
  }

  // In vertical climb levels (rising lava) checkpoints mark progress up the shaft and the
  // goal is always at the very top. Elsewhere, 3 checkpoints climb upward as an optional
  // exploration reward, with the exit forced to the ground on levels 1-2 and free on 3-4.
  const cpLayers = vertical
    ? [Math.floor(layerCount*0.3), Math.floor(layerCount*0.6), Math.floor(layerCount*0.85)].map(l=>Math.min(layerCount-1,Math.max(0,l)))
    : [0, Math.min(1,layerCount-1), Math.min(2,layerCount-1)];
  const cpFracs = vertical ? [0.5,0.5,0.5] : [0.25, 0.55, 0.8];
  const checkpoints = cpLayers.map((L,i)=>({
    x:width*cpFracs[i], y:layerY[L]-30, w:14, h:30, type:'checkpoint', triggered:false, index:i
  }));
  const goalLayer = vertical ? layerCount-1 : (position>=2 ? ri(0, layerCount-1) : 0);
  const goal = {x: vertical? width*0.5 : width-70, y:layerY[goalLayer]-34, w:16, h:34, type:'goal', triggered:false};

  // Rising lava (Molten Depths vertical climbs only): starts at the very bottom after a
  // short grace period, then rises steadily — outpacing a player who lingers too long.
  const lavaGraceFrames = 200;
  const lavaRiseSpeed = 0.05 * (save.hardMode?1.35:1);

  // exactly one vault per ruin: a locked door leading to a small loot room, always needs a key
  const vaultLayer = layerCount>1 ? ri(1,layerCount-1) : 0;
  const vaultCandidates = platforms.filter(p=>p.type!=='wall' && Math.abs(p.y-layerY[vaultLayer])<2 && p.w>60 && p.x>200 && p.x<width-260);
  const vaultPlat = vaultCandidates.length ? pick(vaultCandidates) : {x:width*0.65, y:layerY[vaultLayer], w:100};
  const vaultY = vaultPlat.y;
  const doorX = vaultPlat.x + vaultPlat.w + 4;
  const roomW = 74;
  // small floor extension for the loot room, plus a back wall to visually enclose it
  platforms.push({x:doorX+8, y:vaultY, w:roomW, h:16, solid:true, type:'walkway', icy:false});
  platforms.push({x:doorX+8+roomW, y:vaultY-42, w:8, h:58, solid:true, type:'wall'});
  // the door itself: solid until opened with the key
  const vaultDoor = {x:doorX, y:vaultY-42, w:8, h:58, opened:false, solid:true, type:'vaultdoor'};
  platforms.push(vaultDoor);
  // loot: a small spread of higher-value coins inside the room
  for(let i=0;i<5;i++){
    coins.push({x:doorX+16+i*(roomW-24)/4, y:vaultY-rand(14,30), collected:false, phase:rand(0,Math.PI*2), value:5});
  }

  const spawn = {x:40, y:layerY[0]-40};

  // Wind gusts (Icy Crypt): push the player mid-air only, scattered through open vertical space.
  const windZones = [];
  if(zone.hasWind && layerCount>1){
    const windCount = Math.max(2, Math.floor(width/480));
    const DIRS = [
      {fx:0.05, fy:0}, {fx:-0.05, fy:0}, {fx:0, fy:-0.045}, {fx:0.035, fy:-0.03}, {fx:-0.035, fy:-0.03}
    ];
    for(let i=0;i<windCount;i++){
      const wx = rand(260, width-260);
      const wy = rand(60, layerY[0]-60);
      const d = pick(DIRS);
      windZones.push({x:wx, y:wy, w:ri(70,110), h:ri(90,150), fx:d.fx, fy:d.fy});
    }
  }

  return { width, height, layerCount, layerY, platforms, spikes, enemies, coins, checkpoints, goal, vaultDoor, spawn, traps, projectiles:[], zone, boss:null, windZones,
    lavaRise:vertical, lavaY:height, lavaGrace:lavaGraceFrames, lavaSpeed:lavaRiseSpeed };
}

function generateBossLevel(idx, zoneIndex, zone){
  const width = 1000;
  const groundY = 168;
  const height = groundY + 60;
  const platforms = [
    {x:0, y:groundY, w:width, h:height-groundY+40, solid:true, type:'ground', icy:false}
  ];
  // a couple of evasion platforms to escape slam shockwaves
  platforms.push({x:width*0.22, y:groundY-70, w:70, h:16, solid:true, type:'walkway', icy:false});
  platforms.push({x:width*0.62, y:groundY-70, w:70, h:16, solid:true, type:'walkway', icy:false});

  const bossHp = Math.round((3 + zoneIndex) * (save.hardMode?1.5:1));
  const boss = {
    x:width*0.7, y:groundY-30, w:30, h:28, vx: -0.45-zoneIndex*0.06, baseSpeed: 0.45+zoneIndex*0.06,
    minX:width*0.3, maxX:width*0.85, hp:bossHp, maxHp:bossHp, alive:true,
    state:'patrol', timer:ri(100,160), invinc:0, hue: zone.enemyHues[0], name: zone.bossName,
    phase:1, special: zone.bossSpecial, specialTimer:0, hazards:[]
  };

  const coins = [];
  for(let i=0;i<6;i++) coins.push({x:rand(80,width-80), y:groundY-rand(30,90), collected:false, phase:rand(0,Math.PI*2)});

  const checkpoints = []; // no mid-boss checkpoints; it's a single short encounter
  const goal = {x:width-60, y:groundY-34, w:16, h:34, type:'goal', triggered:false};
  const spawn = {x:40, y:groundY-40};

  return { width, height, layerCount:1, layerY:[groundY], platforms, spikes:[], enemies:[], coins,
    checkpoints, goal, vaultDoor:null, spawn, traps:[], projectiles:[], zone, boss, isBoss:true, windZones:[], lavaRise:false };
}

function buildLevel(idx){
  const zoneIdx = getZoneIndex(idx);
  const zone = zoneFor(idx);
  return isBossLevel(idx) ? generateBossLevel(idx, zoneIdx, zone) : generateLevel(idx, zone);
}

/* ============================= PARTICLES ============================= */
function spawnParticles(x,y,count,color,spread){
  for(let i=0;i<count;i++){
    particles.push({x,y,vx:rand(-1,1)*(spread||1.6),vy:rand(-2.2,-0.4),life:rand(18,34),maxLife:34,color});
  }
}
function updateParticles(){
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.life--;
    if(p.life<=0) particles.splice(i,1);
  }
}
function drawParticles(){
  particles.forEach(p=>{
    ctx.globalAlpha = Math.max(0,p.life/p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x-camX), Math.round(p.y-camY), 2,2);
  });
  ctx.globalAlpha = 1;
}

/* ============================= TOAST ============================= */
function showToast(msg, ms){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), ms||1800);
}
function flashDanger(){
  const d = document.getElementById('dangerFlash');
  d.classList.add('show'); setTimeout(()=>d.classList.remove('show'),100);
}

/* ============================= LEVEL START / RESPAWN ============================= */
function startLevel(idx){
  level = buildLevel(idx);
  const zone = level.zone;
  if(level.isBoss){
    document.getElementById('levelLabel').textContent = zone.name.toUpperCase() + ' — BOSS';
    showToast('⚠ ' + zone.bossName + ' blocks the way!', 2200);
  } else {
    document.getElementById('levelLabel').textContent = 'RUIN ' + (getPositionInZone(idx)+1) + ' · ' + zone.name;
  }
  const reinforcedStep = typeof AchievementManager!=='undefined' && AchievementManager.hasBoost('cavern-crammer_reinforced_step');
  player.maxHealth = Math.max(1, 3 + save.upgrades.maxHealthBonus + currentCharacter().maxHealthDelta + (reinforcedStep?1:0));
  if(currentCharacter().id==='skeleton')player.maxHealth=Math.max(1,Math.ceil(player.maxHealth*.5));
  player.health = player.maxHealth;
  player.x = level.spawn.x; player.y = level.spawn.y; player.vx=0; player.vy=0;
  player.pounding=false; player.dashTimer=0; player.dashCooldown=0; player.hoverFuel=0; player.airDashUsed=0;
  checkpointSpawn = {x:level.spawn.x, y:level.spawn.y};
  STATE = 'playing';
}
function respawnPlayer(){
  player.x = checkpointSpawn.x; player.y = checkpointSpawn.y;
  player.vx=0; player.vy=0; player.health = player.maxHealth; player.invincTimer=60;
  player.pounding=false; player.dashTimer=0; player.dashCooldown=0; player.hoverFuel=0; player.airDashUsed=0;
}

/* ============================= REWARD SYSTEM ============================= */
// New model: rewards are never permanent across runs (only shop upgrades are).
// Most can only ever be picked once per run and then vanish from the pool;
// a few explicitly allow more (wallJump x3, groundPound x2), and coins10 is
// unlimited with double selection weight. Once picked, an ability lasts the
// rest of the run (no more "until next shrine" expiry).
function rewardOwnedCount(id){ return session.rewardCounts[id]||0; }
function bumpReward(id){ session.rewardCounts[id] = rewardOwnedCount(id)+1; }
function rewardAvailable(def){
  if(def.customAvailable) return def.customAvailable();
  if(rewardOwnedCount(def.id) >= (def.maxCount||1)) return false;
  if(def.prereq && !def.prereq()) return false;
  return true;
}
const HAT_STYLES = [
  { id:'crown', name:'Tiny Crown' }, { id:'flower', name:'Wild Bloom' },
  { id:'feather', name:'Jaunty Feather' }, { id:'halo', name:'Faint Halo' }
];

const REWARD_DEFS = [
  { id:'coins10', label:'Bonus Coins', weight:2, maxCount:Infinity,
    descFor:()=> '+10 coins to your purse.', apply:()=>{ addCoins(10); bumpReward('coins10'); } },
  { id:'tripleJump', label:'Triple Jump', maxCount:1,
    descFor:()=> 'Jump from the ground 3 times in a row (landing between each) — the third leaps twice as high, for the rest of this run.',
    apply:()=>{ session.tripleJumpOwned = true; bumpReward('tripleJump'); } },
  { id:'dash', label:'Dash', maxCount:1,
    descFor:()=> 'Double-tap a direction to dash that way. Unlimited on the ground; in midair you get one dash until you land again.',
    apply:()=>{ session.dashOwned = true; bumpReward('dash'); } },
  { id:'airDash', label:'Extra Air Dash', maxCount:2, prereq:()=>session.dashOwned,
    descFor:()=> `Adds one more midair dash charge before you need to land (currently ${session.dashAirCharges}, max 3).`,
    apply:()=>{ session.dashAirCharges = Math.min(3, session.dashAirCharges+1); bumpReward('airDash'); } },
  { id:'shadowDash', label:'Shadow Dash', maxCount:1, prereq:()=>session.dashOwned,
    descFor:()=> 'Your dash now trails shadow and grants brief immunity while dashing.',
    apply:()=>{ session.shadowDash = true; bumpReward('shadowDash'); } },
  { id:'warp', label:'Warp', maxCount:1,
    descFor:()=> 'A single-use teleport: tap Warp, then tap where you want to appear.',
    apply:()=>{ session.warpCharges = 1; bumpReward('warp'); } },
  { id:'wallJump', label:'Wall Jump', maxCount:3,
    descFor:owned=> owned? 'Your wall jump grows stronger still!' : 'Kick off walls to climb, for the rest of this run.',
    apply:()=>{ session.wallJump = true; session.wallJumpTier = (session.wallJumpTier||0)+1; bumpReward('wallJump'); } },
  { id:'extraJump', label:'Extra Jump', maxCount:1,
    descFor:()=> 'One extra jump in midair, for the rest of this run.',
    apply:()=>{ session.extraJumps = 1; bumpReward('extraJump'); } },
  { id:'hover', label:'Hover', maxCount:1,
    descFor:()=> 'Hold jump in midair to hover briefly, for the rest of this run.',
    apply:()=>{ session.hoverOwned = true; bumpReward('hover'); } },
  { id:'featherFall', label:'Feather Fall', maxCount:1,
    descFor:()=> 'Fall slower and glide further, for the rest of this run.',
    apply:()=>{ session.featherFall = true; bumpReward('featherFall'); } },
  { id:'groundPound', label:'Ground Pound', maxCount:2,
    descFor:owned=> owned? 'Landing now sends out a shockwave, damaging nearby foes too!' : 'Drop fast — direct hits defeat enemies instantly, for the rest of this run.',
    apply:()=>{ session.groundPoundOwned = true; session.groundPoundTier = rewardOwnedCount('groundPound')+1; bumpReward('groundPound'); } },
  { id:'coinBonus', label:'Silver Vein', maxCount:1,
    descFor:()=> '5% chance any coin you collect is silver, worth 5x.',
    apply:()=>{ session.silverChance = 0.05; bumpReward('coinBonus'); } },
  { id:'hat', label:'Snazzy Hat', maxCount:1,
    descFor:()=> 'Purely cosmetic — nothing else. But you\'ll look great doing it.',
    apply:()=>{ session.hat = pick(HAT_STYLES).id; bumpReward('hat'); } },
  { id:'key', label:'Ruined Key', weight:2, maxCount:1,
    customAvailable:()=> !session.keyGivenThisRun && !(level.vaultDoor && level.vaultDoor.opened),
    descFor:()=> 'Unlocks this ruin\'s vault door, leading to a small room full of loot.', apply:()=>{ session.hasKey=true; session.keyGivenThisRun=true; bumpReward('key'); } },

  // Cursed blessings: real upside, real downside. Weighted lower so they show up
  // less often than plain boons, but they're always a real option.
  { id:'curseGlassCannon', label:'Glass Cannon', weight:0.6, maxCount:1,
    descFor:()=> 'Every enemy you defeat drops a bonus coin — but max health is -1 for this run.',
    apply:()=>{ session.curseGlassCannon=true; player.maxHealth=Math.max(1,player.maxHealth-1); player.health=Math.min(player.health,player.maxHealth); bumpReward('curseGlassCannon'); } },
  { id:'curseRecklessSprint', label:'Reckless Sprint', weight:0.6, maxCount:1,
    descFor:()=> 'Move speed +20% — but arrow traps no longer telegraph before firing.',
    apply:()=>{ session.curseSpeedMult=1.2; session.curseNoTelegraph=true; bumpReward('curseRecklessSprint'); } },
  { id:'curseHeavyPurse', label:'Heavy Purse', weight:0.6, maxCount:1,
    descFor:()=> 'Unbanked coins are never lost on death — but every coin you collect is worth half.',
    apply:()=>{ session.curseHeavyPurse=true; bumpReward('curseHeavyPurse'); } },
  { id:'curseGlassLantern', label:'Glass Lantern', weight:0.6, maxCount:1,
    descFor:()=> 'Your lantern glow nearly doubles — but you take +1 extra damage from every hit.',
    apply:()=>{ session.curseGlassLantern=true; bumpReward('curseGlassLantern'); } },
  { id:'curseDoubleOrNothing', label:'Double or Nothing', weight:0.6, maxCount:1,
    descFor:()=> 'Every coin you collect has a 50/50 chance to be worth double — or worth nothing.',
    apply:()=>{ session.curseDoubleOrNothing=true; bumpReward('curseDoubleOrNothing'); } },
  { id:'curseFeatherweight', label:'Featherweight', weight:0.6, maxCount:1,
    descFor:()=> 'Fall speed reduced 30%, softer and longer landings — but knockback from every hit is doubled.',
    apply:()=>{ session.curseFallMult=0.7; session.curseKnockbackMult=2; bumpReward('curseFeatherweight'); } },
  { id:'curseAdrenaline', label:'Adrenaline', weight:0.6, maxCount:1,
    descFor:()=> 'Your speed score decays 50% slower — but enemy contact deals double damage.',
    apply:()=>{ session.curseAdrenaline=true; bumpReward('curseAdrenaline'); } },
  { id:'curseIronBoots', label:'Iron Boots', weight:0.6, maxCount:1,
    descFor:()=> 'Immune to icy/frozen slipping and wind gusts — but jump height is -15%.',
    apply:()=>{ session.curseIronBoots=true; session.curseJumpMult=0.85; bumpReward('curseIronBoots'); } },
  { id:'curseVampiric', label:'Vampiric Edge', weight:0.6, maxCount:1,
    descFor:()=> 'Defeating an enemy heals 1 health — but spikes now deal double damage.',
    apply:()=>{ session.curseVampiric=true; bumpReward('curseVampiric'); } }
];

// Picks `k` distinct items from `items`, weighted by weightFn, without replacement.
// (This was previously called but never defined — the ReferenceError it threw is why
// the reward grid could come back empty and the shrine result screen would get stuck.)
function weightedSampleWithoutReplacement(items, weightFn, k){
  const pool = items.slice();
  const result = [];
  while(result.length < k && pool.length > 0){
    let total = 0;
    for(const it of pool) total += Math.max(0.0001, weightFn(it));
    let r = Math.random()*total;
    let idx = pool.length-1;
    for(let i=0;i<pool.length;i++){
      r -= Math.max(0.0001, weightFn(pool[i]));
      if(r<=0){ idx = i; break; }
    }
    result.push(pool[idx]);
    pool.splice(idx,1);
  }
  return result;
}

function buildRewardOptions(n){
  const pool = REWARD_DEFS.filter(rewardAvailable);
  const chosen = weightedSampleWithoutReplacement(pool, def=>def.weight||1, Math.min(n, pool.length));
  return chosen;
}

/* ============================= QUIZ BANK ============================= */
// Question data no longer lives here — it comes from QuestionManager (shared/js/QuestionManager.js),
// loaded from the class code selected in the Hub (see loadQuestionBank() near BOOT).
// QuestionManager owns selection/weighting internally; this game just asks it for cards and reports
// back whether each was answered correctly on the first try (see recordAnswer() calls below).
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

/* ============================= QUIZ FLOW ============================= */
let quizRound = null;        // {mode, pairs:[{id,term,def,hadWrong,done}], filled, correctFirstTry}
let deathGauntlet = null;    // {needed, correctSoFar}
let quizFinishCallback = null;
let activeDrag = null; // {chip, pointerId, offX, offY}

async function openQuizRound(mode, size){
  STATE = 'quiz';
  if(QuestionManager.getRunQuestionType()!=='matching'&&window.MixedQuestionRound){
    const result=await MixedQuestionRound.play();
    quizRound={mode,pairs:new Array(4).fill(null),filled:4,correctFirstTry:result.correct};
    if(result.correct<4)PlatformManager.deductCoins((4-result.correct)*10);
    finishRound();return;
  }
  activeDrag = null;
  // (rewards now last the whole run once obtained — nothing resets at the next shrine)
  // Pull `size` distinct cards from QuestionManager's weighted pool (missed terms come up
  // more often). `_q` keeps a reference to QuestionManager's own card object so recordAnswer()
  // below can mutate its weight in place; `def` mirrors `definition` so the rest of the quiz UI
  // (drag/drop rendering) doesn't need to change.
  const excluded = [];
  const chosen = [];
  for(let i=0;i<size;i++){
    const q = QuestionManager.getNextQuestion(false, excluded);
    if(!q) break;
    excluded.push(q);
    chosen.push({ term:q.term, def:q.definition, _q:q });
  }
  quizRound = { mode, pairs: chosen.map(p=>({...p, hadWrong:false, done:false})), filled:0, correctFirstTry:0 };

  document.getElementById('quizHeading').textContent = mode==='death' ? 'PROVE YOUR KNOWLEDGE' : 'SHRINE OF KNOWLEDGE';
  document.getElementById('quizSubtitle').textContent = mode==='death'
    ? 'Answer correctly to earn your way back into the ruins.'
    : 'Drag each term beside its true definition.';
  document.getElementById('resultPanel').classList.remove('show');
  document.getElementById('quizArea').style.display = 'flex';

  const bank = document.getElementById('termBank');
  const defList = document.getElementById('defList');
  bank.innerHTML = ''; defList.innerHTML = '';

  const terms = quizRound.pairs.map(p=>p.term);
  shuffle(terms);
  terms.forEach(term=>{
    const chip = document.createElement('div');
    chip.className = 'termChip';
    chip.textContent = term;
    chip.dataset.term = term;
    bank.appendChild(chip);
    makeDraggable(chip);
  });

  const defsShuffled = quizRound.pairs.slice(); shuffle(defsShuffled);
  defsShuffled.forEach(pair=>{
    const row = document.createElement('div');
    row.className = 'defRow';
    const dz = document.createElement('div');
    dz.className = 'dropZone';
    dz.dataset.answer = pair.term;
    dz.textContent = '?';
    const txt = document.createElement('div');
    txt.className = 'defText';
    txt.textContent = pair.def;
    row.appendChild(dz);
    row.appendChild(txt);
    defList.appendChild(row);
  });

  document.getElementById('quizModal').classList.remove('hidden');
}

// Robust drag: tracked at window level rather than per-element pointer capture,
// which can silently drop events on some browsers/touch devices once a style
// change moves the element out from under the pointer. One chip drags at a time.
function makeDraggable(chip){
  chip.addEventListener('pointerdown', e=>{
    if(chip.classList.contains('placed') || activeDrag) return;
    const r = chip.getBoundingClientRect();
    activeDrag = { chip, pointerId:e.pointerId, offX:e.clientX-r.left, offY:e.clientY-r.top };
    chip.style.width = r.width+'px';
    chip.classList.add('dragging');
    chip.style.left = r.left+'px'; chip.style.top = r.top+'px';
    e.preventDefault();
  });
}
function resetChipStyle(chip){
  chip.classList.remove('dragging');
  chip.style.left = ''; chip.style.top = ''; chip.style.width = '';
}
function endActiveDrag(clientX, clientY){
  if(!activeDrag) return;
  const chip = activeDrag.chip;
  activeDrag = null;
  resetChipStyle(chip);

  const zones = document.querySelectorAll('.dropZone:not(.filled)');
  let target = null;
  zones.forEach(z=>{
    const r = z.getBoundingClientRect();
    if(clientX>=r.left && clientX<=r.right && clientY>=r.top && clientY<=r.bottom) target = z;
  });
  const pairEntry = quizRound.pairs.find(p=>p.term===chip.dataset.term);
  if(target){
    if(target.dataset.answer === chip.dataset.term){
      target.classList.add('filled');
      target.textContent = chip.dataset.term;
      chip.classList.add('placed');
      if(pairEntry && !pairEntry.done){
        pairEntry.done = true;
        const firstTry = !pairEntry.hadWrong;
        QuestionManager.recordAnswer(pairEntry._q, firstTry);
        save.questionWeights = QuestionManager.getWeightsSnapshot('term');
        saveDirty = true;
        if(firstTry) quizRound.correctFirstTry++;
        quizRound.filled++;
        session.stats.questionsTotal++;
        if(firstTry) session.stats.questionsCorrect++;
        PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, firstTry);
        if(!firstTry) PlatformManager.deductCoins(10);
      }
      if(quizRound.filled >= quizRound.pairs.length){
        setTimeout(finishRound, 350);
      }
    } else {
      target.classList.add('wrongFlash');
      setTimeout(()=>target.classList.remove('wrongFlash'),400);
      if(pairEntry) pairEntry.hadWrong = true;
    }
  }
}
window.addEventListener('pointermove', e=>{
  if(!activeDrag || e.pointerId!==activeDrag.pointerId) return;
  activeDrag.chip.style.left = (e.clientX-activeDrag.offX)+'px';
  activeDrag.chip.style.top = (e.clientY-activeDrag.offY)+'px';
});
window.addEventListener('pointerup', e=>{
  if(!activeDrag || e.pointerId!==activeDrag.pointerId) return;
  endActiveDrag(e.clientX, e.clientY);
});
window.addEventListener('pointercancel', e=>{
  if(!activeDrag || e.pointerId!==activeDrag.pointerId) return;
  const chip = activeDrag.chip;
  activeDrag = null;
  resetChipStyle(chip);
});

function finishRound(){
  document.getElementById('quizArea').style.display = 'none';
  const panel = document.getElementById('resultPanel');
  const grid = document.getElementById('rewardOptionsGrid');
  grid.innerHTML = '';
  panel.classList.add('show');

  if(quizRound.mode === 'death'){
    deathGauntlet.correctSoFar += quizRound.correctFirstTry;
    document.getElementById('resultTitle').textContent = quizRound.correctFirstTry + ' of ' + quizRound.pairs.length + ' correct on first try';
    if(deathGauntlet.correctSoFar >= deathGauntlet.needed){
      document.getElementById('resultMessage').textContent = 'You have proven your knowledge. The ruin lets you back in.';
      const btn = document.getElementById('resultContinueBtn');
      btn.textContent = 'RETURN TO THE RUINS';
      btn.onclick = ()=>{
        document.getElementById('quizModal').classList.add('hidden');
        STATE = 'playing';
        respawnPlayer();
      };
    } else {
      const remaining = deathGauntlet.needed - deathGauntlet.correctSoFar;
      document.getElementById('resultMessage').textContent = 'You need ' + remaining + ' more correct answer' + (remaining===1?'':'s') + ' to return. Try again!';
      const btn = document.getElementById('resultContinueBtn');
      btn.textContent = 'ANSWER MORE';
      btn.onclick = ()=>{ openQuizRound('death', Math.max(4, Math.min(6, deathGauntlet.needed))); };
    }
    return;
  }

  // checkpoint / goal mode: reward-choice scaled by number correct on first try
  const count = quizRound.correctFirstTry;
  document.getElementById('resultTitle').textContent = count + ' of ' + quizRound.pairs.length + ' correct on first try';
  if(count===0){
    document.getElementById('resultMessage').textContent = 'No correct answers this time — no boon awaits, but press on!';
    const btn = document.getElementById('resultContinueBtn');
    btn.textContent = 'CONTINUE';
    btn.onclick = finalizeQuizFlow;
  } else {
    document.getElementById('resultMessage').textContent = 'Choose 1 boon from your ' + count + ' option' + (count===1?'':'s') + ':';
    const btn = document.getElementById('resultContinueBtn');
    btn.textContent = 'CONTINUE';
    btn.style.display = 'none';
    let rerollCost = 15;
    function renderOptions(){
      grid.innerHTML = '';
      const options = buildRewardOptions(count);
      if(options.length===0){
        // Every reward this run allows has already been claimed — nothing left to
        // offer, so don't leave the player stuck on a blank grid with no way out.
        document.getElementById('resultMessage').textContent = 'You already carry every boon these shrines can offer this run!';
        btn.style.display = '';
        return;
      }
      options.forEach(def=>{
        const owned = rewardOwnedCount(def.id) > 0;
        const card = document.createElement('div');
        card.className = 'rewardCard';
        card.innerHTML = `<div class="rcName">${def.label}</div><div class="rcDesc">${def.descFor(owned)}</div>${owned?'<div class="rcOwned">already unlocked — upgrading!</div>':''}`;
        card.addEventListener('click', ()=>{
          document.querySelectorAll('.rewardCard').forEach(c=>c.classList.add('disabled'));
          card.classList.remove('disabled');
          card.classList.add('chosen');
          def.apply(owned);
          document.getElementById('resultMessage').textContent = 'You chose: ' + def.label + '!';
          btn.style.display = '';
          const rerollBtn = document.getElementById('rerollBtn');
          if(rerollBtn) rerollBtn.remove();
        });
        grid.appendChild(card);
      });
      let rerollBtn = document.getElementById('rerollBtn');
      if(rerollBtn) rerollBtn.remove();
      rerollBtn = document.createElement('button');
      rerollBtn.id = 'rerollBtn';
      rerollBtn.className = 'btn secondary';
      rerollBtn.style.cssText = 'font-size:9px; padding:8px; margin-top:4px;';
      rerollBtn.textContent = '🔄 Reroll options (' + rerollCost + ' 🪙)';
      rerollBtn.disabled = PlatformManager.getCoins() < rerollCost;
      rerollBtn.addEventListener('click', ()=>{
        if(!PlatformManager.spendCoins(rerollCost)) return;
        rerollCost = Math.round(rerollCost*1.6);
        renderOptions();
      });
      grid.appendChild(rerollBtn);
    }
    renderOptions();
    btn.onclick = finalizeQuizFlow;
  }
}

function finalizeQuizFlow(){
  document.getElementById('resultContinueBtn').style.display = '';
  document.getElementById('quizModal').classList.add('hidden');
  STATE = 'playing';
  const cb = quizFinishCallback; quizFinishCallback = null;
  if(cb) cb();
}

/* ============================= SHOP ============================= */
const MAGNET_BASE_RADIUS = 50;
const UPGRADES = [
  { id:'maxHealthBonus', name:'Heart Fragment', desc:'+1 max health, permanently.', cost:()=> PlatformManager.permanentUpgradeCost(save.upgrades.maxHealthBonus), max:2,
    buy:()=>{ save.upgrades.maxHealthBonus++; } },
  { id:'jumpBonus', name:'Feather Charm', desc:'+10% jump height, permanently.', cost:()=> PlatformManager.permanentUpgradeCost(save.upgrades.jumpBonus), max:3,
    buy:()=>{ save.upgrades.jumpBonus++; } },
  { id:'wallJump', name:'Grip Gloves', desc:'Unlock wall jump permanently.', cost:()=>PlatformManager.permanentUpgradeCost(0), max:1,
    buy:()=>{ save.upgrades.wallJump = true; } },
  { id:'magnetTier', name:'Lodestone', desc:()=> 'Passive coin magnet, always on. +10% radius per upgrade'+(save.upgrades.magnetTier>0?` (currently ${Math.round(MAGNET_BASE_RADIUS*(1+0.1*(save.upgrades.magnetTier-1)))}px)`:'')+'.',
    cost:()=> PlatformManager.permanentUpgradeCost(save.upgrades.magnetTier||0), max:10,
    buy:()=>{ save.upgrades.magnetTier = (save.upgrades.magnetTier||0)+1; } },
  { id:'speedTier', name:'Swift Boots', desc:()=> 'Move speed +10% per upgrade, permanently'+(save.upgrades.speedTier>0?` (currently +${save.upgrades.speedTier*10}%)`:'')+'.',
    cost:()=> PlatformManager.permanentUpgradeCost(save.upgrades.speedTier||0), max:10,
    buy:()=>{ save.upgrades.speedTier = (save.upgrades.speedTier||0)+1; } },
  { id:'extraLives', name:'Spare Heartstone', desc:'+1 starting life on future runs.', cost:()=> PlatformManager.permanentUpgradeCost(save.upgrades.extraLives||0), max:2,
    buy:()=>{ save.upgrades.extraLives = (save.upgrades.extraLives||0)+1; } }
];
const SKINS = [
  {id:'green', name:'Moss', color:'#5fb89c', cost:0},
  {id:'amber', name:'Amber', color:'#f2b84b', cost:25},
  {id:'violet', name:'Violet', color:'#8b5fbf', cost:25},
  {id:'crimson', name:'Ember', color:'#c0563f', cost:35}
];

function openShop(){
  STATE = 'shop';
  renderShop();
  document.getElementById('shopModal').classList.remove('hidden');
}
function upgradeLevel(u){
  if(u.id==='maxHealthBonus') return save.upgrades.maxHealthBonus;
  if(u.id==='jumpBonus') return save.upgrades.jumpBonus;
  if(u.id==='wallJump') return save.upgrades.wallJump?1:0;
  if(u.id==='magnetTier') return save.upgrades.magnetTier||0;
  if(u.id==='speedTier') return save.upgrades.speedTier||0;
  if(u.id==='extraLives') return save.upgrades.extraLives||0;
  return 0;
}
// Shared renderer for the permanent-upgrades + skins grids — used both by the mid-run
// "WAYSHRINE MARKET" (openShop/renderShop) and the title-screen "Shop" overlay
// (openHomeShop/renderHomeShop), which are separate DOM elements with their own ids
// so the two can't stomp on each other while a run is in progress.
function renderShopGrids(coinValId, gridId, sgridId, rerender){
  document.getElementById(coinValId).textContent = PlatformManager.getCoins();
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  UPGRADES.forEach(u=>{
    const lvl = upgradeLevel(u);
    const maxed = lvl>=u.max;
    const cost = u.cost();
    const div = document.createElement('div');
    div.className = 'shopItem';
    div.innerHTML = `<div class="siName">${u.name}${u.max>1? ' ('+lvl+'/'+u.max+')':''}</div>
      <div class="siDesc">${typeof u.desc==='function'?u.desc():u.desc}</div>
      <div class="siCost">${maxed?'MAXED':'Cost: '+cost+' 🪙'}</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn secondary'; btn.style.fontSize='9px'; btn.style.padding='6px';
    btn.textContent = maxed? 'OWNED' : 'BUY';
    btn.disabled = maxed || PlatformManager.getCoins() < cost;
    btn.addEventListener('click', ()=>{
      if(!maxed && PlatformManager.spendCoins(cost)){ u.buy(); saveDirty=true; persistSave(); rerender(); }
    });
    div.appendChild(btn);
    grid.appendChild(div);
  });

  const sgrid = document.getElementById(sgridId);
  sgrid.innerHTML = '';
  SKINS.forEach(s=>{
    const owned = save.skinsOwned.includes(s.id);
    const active = save.skin === s.id;
    const div = document.createElement('div');
    div.className = 'shopItem';
    div.innerHTML = `<div class="skinSwatch" style="background:${s.color}"></div>
      <div class="siName">${s.name}</div>
      <div class="siCost">${owned? (active?'EQUIPPED':'Owned') : 'Cost: '+s.cost+' 🪙'}</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn secondary'; btn.style.fontSize='9px'; btn.style.padding='6px';
    if(owned){
      btn.textContent = active? 'EQUIPPED' : 'EQUIP';
      btn.disabled = active;
      btn.addEventListener('click', ()=>{ save.skin = s.id; saveDirty=true; persistSave(); rerender(); });
    } else {
      btn.textContent = 'BUY';
      btn.disabled = PlatformManager.getCoins() < s.cost;
      btn.addEventListener('click', ()=>{
        if(PlatformManager.spendCoins(s.cost)){ save.skinsOwned.push(s.id); save.skin=s.id; saveDirty=true; persistSave(); rerender(); }
      });
    }
    div.appendChild(btn);
    sgrid.appendChild(div);
  });
}
function renderShop(){ renderShopGrids('shopCoinVal', 'upgradeGrid', 'skinGrid', renderShop); }
document.getElementById('shopContinueBtn').addEventListener('click', ()=>{
  document.getElementById('shopModal').classList.add('hidden');
  if(!save.hasClearedLoop && isBossLevel(levelIndex) && getZoneIndex(levelIndex)%ZONES.length===ZONES.length-1){
    save.hasClearedLoop = true; saveDirty = true;
    showToast('🔓 Hard Mode unlocked — toggle it from the title screen!', 2600);
  }
  persistSave();
  levelIndex++;
  startLevel(levelIndex);
});

/* ---- Title-screen Shop overlay: hero select + hard mode + permanent upgrades/skins,
   all reachable from the home screen before a run starts (mirrors Shuriken Scholar's
   home-screen Shop button, which hides its own character select + upgrades the same way). */
function renderHomeShop(){ renderShopGrids('homeShopCoinVal', 'homeUpgradeGrid', 'homeSkinGrid', renderHomeShop); }
function openHomeShop(){
  renderCharGrid();
  renderHardModeToggle();
  renderHomeShop();
  document.getElementById('homeShopModal').classList.remove('hidden');
}
document.getElementById('openHomeShopBtn').addEventListener('click', openHomeShop);
document.getElementById('homeShopCloseBtn').addEventListener('click', ()=>{
  document.getElementById('homeShopModal').classList.add('hidden');
});

/* ============================= GAME OVER (PERMADEATH) ============================= */
function formatElapsed(ms){
  const s = Math.floor(ms/1000);
  return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
}
function triggerRunOver(){
  PlatformManager.endPracticeRun();
  STATE = 'gameover';
  window.ChallengeManager?.finish?.({score:levelIndex,distance:levelIndex,alive:false});
  // Subtly bias the very next run based on how this one went — struggled a lot (many
  // lives lost) eases the next run up slightly; breezed through tightens it up slightly.
  // This is consumed once (see resetSession) and never compounds across multiple runs.
  const deaths = session.deathsThisRun;
  if(deaths>=4) save.nextRunAdjust = -1;
  else if(deaths<=1) save.nextRunAdjust = 1;
  else save.nextRunAdjust = 0;
  // Fold this run's results into the lifetime totals shown on the title screen.
  const st = session.stats;
  save.stats.totalRuns = (save.stats.totalRuns||0) + 1;
  save.stats.bestDepth = Math.max(save.stats.bestDepth||0, levelIndex);
  save.stats.vaultsOpened = (save.stats.vaultsOpened||0) + st.vaultsOpened;
  save.stats.questionsCorrect = (save.stats.questionsCorrect||0) + st.questionsCorrect;
  persistSave();
  // Deepest ruin index reached this run is this game's "high score" for the shared platform stats.
  PlatformManager.setHighScore(GAME_CONFIG.id, levelIndex);

  const zoneIdx = getZoneIndex(levelIndex)%ZONES.length;
  const zoneName = ZONES[zoneIdx].name;
  const depthLabel = (isBossLevel(levelIndex) ? zoneName+' — Boss' : 'Ruin '+(getPositionInZone(levelIndex)+1)+' · '+zoneName);
  const accuracy = st.questionsTotal>0 ? Math.round(100*st.questionsCorrect/st.questionsTotal) : 0;
  const coinResult = PlatformManager.settleAccuracyCoins(GAME_CONFIG.id, st.coinsEarned, {
    correct: st.questionsCorrect, answered: st.questionsTotal
  });

  document.getElementById('gameOverHeadline').textContent = 'Fell in ' + depthLabel;
  const rows = [
    ['Time survived', formatElapsed(performance.now()-session.runStartTime)],
    ['Raw run coins', st.coinsEarned],
    ['Coins awarded due to accuracy (+15%)', coinResult.coinsAwarded],
    ['Coins banked', PlatformManager.getCoins()],
    ['Enemies defeated', st.enemiesDefeated],
    ['Wardens defeated', st.bossesDefeated],
    ['Vaults opened', st.vaultsOpened],
    ['Lives lost', deaths],
    ['Quiz accuracy', accuracy + '% (' + st.questionsCorrect + '/' + st.questionsTotal + ')']
  ];
  document.getElementById('gameOverStats').innerHTML = rows.map(r=>
    `<div class="statRow"><span class="statLabel">${r[0]}</span><span class="statVal">${r[1]}</span></div>`
  ).join('');
  document.getElementById('gameOverModal').classList.remove('hidden');
}
document.getElementById('newRunBtn').addEventListener('click', ()=>{
  document.getElementById('gameOverModal').classList.add('hidden');
  state = 'title';
  updateHomeStats();
  document.getElementById('titleScreen').classList.remove('hidden');
});

/* ============================= PHYSICS / COLLISION ============================= */
function updatePlatforms(){
  level.platforms.forEach(p=>{
    if(p.crumbleTimer!==undefined && p.solid){
      p.crumbleTimer--;
      if(p.crumbleTimer<=0){
        p.solid=false; p.broken=true;
        spawnParticles(p.x+p.w/2, p.y+p.h/2, 10, '#6b5a94', 1.8);
      }
    }
    if(p.growth && !p.grown){
      const cx = p.x+p.w/2, cy = p.y+p.h/2;
      const near = Math.hypot((player.x+player.w/2)-cx, (player.y+player.h/2)-cy) < 56;
      if(near && p.growTimer===undefined) p.growTimer = 45;
      if(p.growTimer!==undefined){
        if(near){
          p.growTimer--;
          if(p.growTimer<=0){
            p.grown = true; p.solid = true;
            spawnParticles(cx, cy, 12, '#7fd8a0', 1.6);
          }
        } else {
          p.growTimer = undefined; // wandered off before it finished waking up
        }
      }
    }
    if(p.heats){
      if(p.onFire){
        p.fireTimer--;
        if(aabb(player.x,player.y,player.w,player.h,p.x,p.y-3,p.w,p.h+3)) damagePlayer(1);
        if(p.fireTimer<=0){ p.onFire=false; p.heatTimer=undefined; p.coolTimer=60; }
      } else if(p.coolTimer>0){
        p.coolTimer--;
      } else if(p.heatTimer!==undefined){
        p.heatTimer--;
        if(p.heatTimer<=0){
          p.onFire = true; p.fireTimer = 34;
          spawnParticles(p.x+p.w/2, p.y, 14, '#ff8a3d', 2.2);
        }
      }
    }
    if(!p.moving){ p.dx=0; p.dy=0; return; }
    p.phase += p.speed;
    const oldX=p.x, oldY=p.y;
    if(p.axis==='x') p.x = p.baseX + Math.sin(p.phase)*p.range;
    else p.y = p.baseY + Math.sin(p.phase)*p.range;
    p.dx = p.x-oldX; p.dy = p.y-oldY;
  });
}

function aabb(ax,ay,aw,ah,bx,by,bw,bh){
  return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
}

function collideX(){
  player.touchWall = 0;
  for(const p of level.platforms){
    if(!p.solid || p.type==='passthrough') continue;
    if(aabb(player.x,player.y,player.w,player.h,p.x,p.y,p.w,p.h)){
      if(player.vx>0){ player.x = p.x-player.w; player.touchWall=1; }
      else if(player.vx<0){ player.x = p.x+p.w; player.touchWall=-1; }
      player.vx = 0;
    }
  }
}
function collideY(){
  let landed=false;
  for(const p of level.platforms){
    if(!p.solid) continue;
    if(p.type==='passthrough'){
      // One-way: only catch the player when falling onto it from above; never
      // blocks upward movement, so it can be jumped through from below.
      if(player.vy>0 && player.prevBottom<=p.y+8 && aabb(player.x,player.y,player.w,player.h,p.x,p.y,p.w,p.h)){
        player.y = p.y-player.h; player.vy=0; landed=true;
        player.jumpsUsed=0; player.coyote=COYOTE_MAX; player.standingPlatform=p;
      }
      continue;
    }
    if(aabb(player.x,player.y,player.w,player.h,p.x,p.y,p.w,p.h)){
      if(player.vy>0){
        player.y = p.y-player.h; player.vy=0; landed=true;
        player.jumpsUsed=0; player.coyote=COYOTE_MAX; player.standingPlatform=p;
        if(p.crumble && p.crumbleTimer===undefined && currentCharacter().id!=='skeleton') p.crumbleTimer = 22;
        if(p.heats && !p.onFire && p.coolTimer<=0 && p.heatTimer===undefined) p.heatTimer = 42;
      } else if(player.vy<0){
        player.y = p.y+p.h; player.vy=0;
        if(p.crumble && p.crumbleTimer===undefined && currentCharacter().id!=='skeleton') p.crumbleTimer = 16;
      }
    }
  }
  const justLanded = landed && !player.onGround;
  player.onGround = landed;
  if(landed) player.airDashUsed = 0;
  // Triple-jump chain requires quick successive ground jumps — dawdling on the ground
  // after landing lets the window expire and resets the combo (see updatePlayer).
  if(justLanded && session.tripleJumpOwned && session.jumpChainCount>0) session.jumpChainWindow = 20;
  if(!landed) player.standingPlatform=null;
}

function updatePlayer(){
  const dir = (input.right?1:0)-(input.left?1:0);
  if(dir!==0) player.facing = dir;

  // Triple-jump chain must be kept alive with quick jumps — if the window granted on
  // landing (see collideY) runs out before the next ground jump, the combo resets.
  if(session.jumpChainCount>0){
    if(session.jumpChainWindow>0) session.jumpChainWindow--;
    else if(player.onGround) session.jumpChainCount = 0;
  }

  // dash: triggered by a double-tap, consumed here regardless of whether it fired.
  // Grounded dashes are unlimited (just gated by the short reuse cooldown below); in the
  // air the player has a pool of charges (1 by default, up to 3 with the Extra Air Dash
  // reward) that only refills once they touch ground again.
  if(player.dashCooldown>0) player.dashCooldown--;
  if(input.dashRequest!==0){
    const airChargesLeft = session.dashAirCharges - player.airDashUsed;
    const dashReady = session.dashOwned && player.dashCooldown<=0 && (player.onGround || airChargesLeft>0);
    if(dashReady){
      player.dashTimer = 12; player.dashCooldown = 34; player.dashDir = input.dashRequest; player.facing = input.dashRequest;
      if(!player.onGround) player.airDashUsed++;
      spawnParticles(player.x+player.w/2, player.y+player.h/2, session.shadowDash?14:8, session.shadowDash?'#2a2138':'#dff5fb', 2.2);
    }
    input.dashRequest = 0;
  }

  // ground pound: triggered by ArrowDown/S or the Pound button, only while airborne
  if(input.poundPressed){
    if(session.groundPoundOwned && !player.onGround && !player.pounding){
      player.pounding = true;
      player.vy = 6.5;
      spawnParticles(player.x+player.w/2, player.y, 8, '#f2b84b', 1.6);
    }
    input.poundPressed = false;
  }

  const targetVx = dir*MOVE_SPEED*(1+0.1*(save.upgrades.speedTier||0))*session.curseSpeedMult*session.charSpeedMult;
  const onIce = !session.curseIronBoots && player.onGround && player.standingPlatform && player.standingPlatform.icy;
  const onFrozen = !session.curseIronBoots && player.onGround && player.standingPlatform && player.standingPlatform.frozen;
  const a = onFrozen ? 0.012 : onIce ? 0.03 : (player.onGround?ACCEL:AIR_ACCEL);
  if(player.dashTimer>0){
    player.vx = player.dashDir * 4.4;
  } else {
    player.vx += (targetVx-player.vx)*a;
  }
  if(Math.abs(player.vx)<0.02) player.vx=0;
  if(dir!==0) player.walkAnim += 0.175; else player.walkAnim*=0.8;

  if(player.coyote>0) player.coyote--;
  if(player.jumpBuffer>0) player.jumpBuffer--;
  if(input.jumpPressed) player.jumpBuffer = JUMP_BUFFER_MAX;
  input.jumpPressed = false;

  const maxJumps = 2 + session.extraJumps;
  const wallKickMult = 1 + 0.15*Math.max(0, session.wallJumpTier-1);

  const canGroundJump = player.onGround || player.coyote>0;
  if(player.jumpBuffer>0 && canGroundJump){
    // triple jump: only counts consecutive GROUND jumps — the 3rd one leaps twice as high
    const chainBoost = (session.tripleJumpOwned && session.jumpChainCount===2) ? 2 : 1;
    player.vy = BASE_JUMP_V*chainBoost*session.curseJumpMult*session.charJumpMult; player.jumpsUsed=1; player.onGround=false; player.coyote=0; player.jumpBuffer=0;
    if(session.tripleJumpOwned) session.jumpChainCount = chainBoost>1 ? 0 : session.jumpChainCount+1;
    spawnParticles(player.x+player.w/2, player.y+player.h, chainBoost>1?12:6, chainBoost>1?'#f2b84b':'#cfc7e8', chainBoost>1?2:1.2);
  } else if(player.jumpBuffer>0 && session.wallJump && player.touchWall!==0 && !player.onGround){
    player.vy = BASE_JUMP_V*0.92*session.curseJumpMult*session.charJumpMult;
    player.vx = -player.touchWall*MOVE_SPEED*1.6*wallKickMult;
    player.jumpsUsed = 1; player.jumpBuffer=0;
    session.jumpChainCount = 0; // a wall jump isn't a ground jump — breaks the chain
    spawnParticles(player.x+player.w/2, player.y+player.h/2, 6, '#f2b84b', 1.6);
  } else if(player.jumpBuffer>0 && player.jumpsUsed < maxJumps && !player.onGround){
    player.vy = DOUBLE_JUMP_V*session.curseJumpMult*session.charJumpMult; player.jumpsUsed++; player.jumpBuffer=0;
    session.jumpChainCount = 0; // an air jump isn't a ground jump — breaks the chain
    spawnParticles(player.x+player.w/2, player.y+player.h/2, 8, '#5fb89c', 1.8);
  }
  if(!input.jumpHeld && player.vy<-1) player.vy *= 0.86;

  if(player.dashTimer>0){
    player.dashTimer--;
    player.vy *= 0.4; // dash flattens the arc briefly
    if(session.shadowDash) spawnParticles(player.x+player.w/2, player.y+player.h/2, 2, '#2a2138', 0.6);
  }

  // hover: refills on landing, drains while held in midair
  if(player.onGround) player.hoverFuel = 40;
  const hovering = session.hoverOwned && !player.onGround && input.jumpHeld && player.hoverFuel>0 && player.vy>-1 && player.dashTimer<=0;
  if(hovering){
    player.hoverFuel--;
    player.vy = Math.max(-0.3, Math.min(player.vy, 0.4));
  }

  // slow slide when pressed against a wall (helps wall-jump chains feel controllable)
  if(!player.onGround && player.touchWall!==0 && session.wallJump && player.vy>1.2 &&
     ((player.touchWall===1 && input.right) || (player.touchWall===-1 && input.left))){
    player.vy = Math.min(player.vy, 0.9);
  }

  const effGravity = (session.featherFall ? GRAVITY*0.55 : GRAVITY) * session.curseFallMult * session.charGravityMult;
  const effTerminal = (session.featherFall ? TERMINAL_V*0.6 : TERMINAL_V) * session.curseFallMult;
  if(!hovering){
    player.vy += effGravity;
    if(player.vy>effTerminal) player.vy=effTerminal;
  }
  if(player.pounding && player.vy<6.5) player.vy = 6.5; // ground pound keeps falling fast regardless of other effects

  // wind zones push the player only while they're airborne
  if(!player.onGround && !session.curseIronBoots && !session.charWindImmune && level.windZones){
    for(const wz of level.windZones){
      if(aabb(player.x,player.y,player.w,player.h,wz.x,wz.y,wz.w,wz.h)){
        player.vx += wz.fx;
        player.vy += wz.fy;
      }
    }
  }

  if(player.standingPlatform && player.standingPlatform.moving){
    player.x += player.standingPlatform.dx;
    player.y += player.standingPlatform.dy;
  }

  player.prevBottom = player.y+player.h;
  player.x += player.vx; collideX();
  player.y += player.vy; collideY();

  if(player.pounding && player.onGround){
    player.pounding = false;
    spawnParticles(player.x+player.w/2, player.y+player.h, 14, '#f2b84b', 2.4);
    if(session.groundPoundTier>=2){
      const RADIUS = 60;
      level.enemies.forEach(en=>{
        if(!en.alive) return;
        const dist = Math.hypot((en.x+en.w/2)-(player.x+player.w/2), (en.y+en.h/2)-(player.y+player.h));
        if(dist<RADIUS){ en.alive=false; spawnParticles(en.x+en.w/2, en.y+en.h/2, 8, en.hue, 1.8); addCoins(1); onEnemyDefeated(); }
      });
      if(level.boss && level.boss.alive){
        const b=level.boss;
        const dist = Math.hypot((b.x+b.w/2)-(player.x+player.w/2), (b.y+b.h/2)-(player.y+player.h));
        if(dist<RADIUS && b.invinc<=0){ b.hp--; b.invinc=45; if(b.hp<=0){ b.alive=false; session.stats.bossesDefeated++; addCoins(50); showToast(b.name+' defeated! The way is clear.', 2000); } }
      }
    }
  }

  if(player.x<0) player.x=0;
  if(player.x>level.width-player.w) player.x = level.width-player.w;

  if(player.invincTimer>0) player.invincTimer--;

  // fell out of the bottom of the entire ruin
  if(player.y > level.height+40){
    player.x = checkpointSpawn.x; player.y = checkpointSpawn.y; player.vx=0; player.vy=0;
    player.pounding = false;
    const fallDmg = Math.max(1, Math.round((level.zone ? level.zone.fallDamage : 1) * session.charFallDamageMult));
    damagePlayer(fallDmg, true);
  }
}

function damagePlayer(n, silent){
  if(player.invincTimer>0 || STATE!=='playing') return;
  if(session.shadowDash && player.dashTimer>0) return; // immune while shadow-dashing
  if(session.curseGlassLantern) n += 1;
  player.health -= n;
  player.invincTimer = 70;
  flashDanger();
  spawnParticles(player.x+player.w/2, player.y+player.h/2, 8, '#e0564f', 2);
  const kb = session.curseKnockbackMult*session.charKnockbackMult;
  player.vy = -5*kb; player.vx = -player.facing*3*kb;
  if(player.health<=0){
    const coinsSafe = session.curseHeavyPurse || session.charCoinsSurvive;
    const lostCoins = coinsSafe ? 0 : session.carriedCoins;
    if(!coinsSafe) session.carriedCoins = 0;
    session.lives -= 1;
    session.deathsThisRun++;
    if(lostCoins>0) showToast('You died and lost ' + lostCoins + ' unbanked coins!', 2000);
    else if(!silent) showToast('You have fallen...', 1400);
    if(session.lives<=0){
      triggerRunOver();
    } else {
      deathGauntlet = { needed: Math.max(1, Math.min(8, levelIndex+1)), correctSoFar:0 };
      const roundSize = Math.max(4, Math.min(6, deathGauntlet.needed));
      openQuizRound('death', roundSize);
    }
  }
}

function onEnemyDefeated(){
  session.stats.enemiesDefeated++;
  window.AchievementManager?.notify?.('enemy_defeated',{x:player.x-camX,y:player.y-camY});
  if(session.curseGlassCannon) addCoins(1);
  if(session.curseVampiric) player.health = Math.min(player.maxHealth, player.health+1);
}
function updateEnemies(){
  level.enemies.forEach(en=>{
    if(!en.alive) return;
    if(en.type==='flyer'){
      en.phase += en.speed;
      en.x = en.baseX + Math.sin(en.phase)*en.ampX;
      en.y = en.baseY + Math.sin(en.phase*1.3)*en.ampY;
      en.vx = Math.cos(en.phase)*en.ampX*en.speed;
    } else if(en.type==='lobber'){
      if(en.fireTimer>0) en.fireTimer--;
      const dist = Math.abs((player.x+player.w/2)-(en.x+en.w/2));
      if(en.fireTimer<=0 && dist<en.range && Math.abs(player.y-en.y)<70){
        const dir = player.x<en.x ? -1 : 1;
        level.projectiles.push({x:en.x+en.w/2, y:en.y+en.h/2, vx:dir*1.6, vy:-1.4, w:5, h:5, lob:true, hue:en.hue});
        en.fireTimer = ri(90,150);
        spawnParticles(en.x+en.w/2, en.y+en.h/2, 4, en.hue, 1);
      }
    } else {
      en.x += en.vx;
      if(en.x<en.minX){ en.x=en.minX; en.vx*=-1; }
      if(en.x>en.maxX){ en.x=en.maxX; en.vx*=-1; }
    }
    if(aabb(player.x,player.y,player.w,player.h,en.x,en.y,en.w,en.h)){
      if(player.pounding){
        en.alive=false;
        spawnParticles(en.x+en.w/2, en.y+en.h/2, 12, en.hue, 2.2);
        addCoins(1); onEnemyDefeated();
      } else if(player.vy>0 && player.prevBottom <= en.y+5){
        en.alive=false;
        spawnParticles(en.x+en.w/2, en.y+en.h/2, 10, en.hue, 2);
        player.vy = BASE_JUMP_V*0.6;
        player.jumpsUsed=0;
        addCoins(1); onEnemyDefeated();
      } else {
        damagePlayer(session.curseAdrenaline?2:1);
      }
    }
  });
}

function updateTraps(){
  level.traps.forEach(t=>{
    if(t.type==='arrow'){
      if(t.state==='idle'){
        const dx = (player.x - t.x) * t.dir;
        const dy = Math.abs((player.y+player.h/2) - t.y);
        if(dx>0 && dx<t.range && dy<26){ t.state='priming'; t.timer=session.curseNoTelegraph?1:16; }
      } else if(t.state==='priming'){
        t.timer--;
        if(t.timer<=0){
          t.state='cooldown'; t.timer=100;
          level.projectiles.push({x:t.x+t.dir*6, y:t.y, vx:t.dir*1.7, w:6, h:3});
          spawnParticles(t.x, t.y, 5, level.zone.spike, 1.4);
        }
      } else if(t.state==='cooldown'){
        t.timer--; if(t.timer<=0) t.state='idle';
      }
    } else if(t.type==='fallblock'){
      if(t.state==='idle'){
        const dx = Math.abs((player.x+player.w/2)-(t.x+t.w/2));
        if(player.y > t.y && dx < t.w*0.85){ t.state='shaking'; t.timer=20; }
      } else if(t.state==='shaking'){
        t.timer--;
        if(t.timer<=0){ t.state='falling'; t.vy=0; }
      } else if(t.state==='falling'){
        t.vy += GRAVITY*1.1;
        t.y += t.vy;
        if(aabb(player.x,player.y,player.w,player.h,t.x,t.y,t.w,t.h)) damagePlayer(1);
        let landedY = level.height;
        for(const p of level.platforms){
          if(!p.solid || p.type==='passthrough' || p.type==='wall') continue;
          if(t.x+t.w>p.x && t.x<p.x+p.w && p.y>=t.y+t.h && p.y<landedY) landedY = p.y;
        }
        if(t.y+t.h>=landedY){
          t.y = landedY-t.h; t.state='landed'; t.vy=0;
          spawnParticles(t.x+t.w/2, t.y+t.h, 10, level.zone.groundEdge, 2);
          if(!t.becamePlatform){
            level.platforms.push({x:t.x, y:t.y, w:t.w, h:t.h, solid:true, type:'floating'});
            t.becamePlatform = true;
          }
        }
      }
    }
  });

  for(let i=level.projectiles.length-1;i>=0;i--){
    const pr = level.projectiles[i];
    if(pr.lob) pr.vy = (pr.vy||0) + GRAVITY*0.5;
    pr.x += pr.vx;
    pr.y += pr.vy||0;
    let hit = false;
    for(const p of level.platforms){
      if(p.solid && p.type!=='passthrough' && aabb(pr.x,pr.y,pr.w,pr.h,p.x,p.y,p.w,p.h)){ hit=true; break; }
    }
    if(aabb(pr.x,pr.y,pr.w,pr.h,player.x,player.y,player.w,player.h)){ damagePlayer(1); hit=true; }
    if(hit || pr.x<-60 || pr.x>level.width+60 || pr.y<-60 || pr.y>level.height+60) level.projectiles.splice(i,1);
  }
}

function updateBoss(){
  const b = level.boss;
  if(!b || !b.alive) return;
  if(b.invinc>0) b.invinc--;

  // phase transition: enrage at half health
  if(b.phase===1 && b.hp<=Math.ceil(b.maxHp/2)){
    b.phase = 2;
    b.vx = (b.vx<0?-1:1) * b.baseSpeed * 1.3;
    spawnParticles(b.x+b.w/2, b.y+b.h/2, 18, b.hue, 3);
    showToast(b.name + ' grows desperate!', 1800);
  }

  // update any lingering ground hazards (vine spikes)
  for(let i=b.hazards.length-1; i>=0; i--){
    const hz = b.hazards[i];
    hz.timer--;
    if(hz.timer>hz.maxTimer-10 || hz.timer<10){ /* rising/falling visual handled in draw */ }
    if(hz.timer<=hz.maxTimer-14 && hz.timer>4 && aabb(player.x,player.y,player.w,player.h,hz.x,hz.y,hz.w,hz.h)) damagePlayer(1);
    if(hz.timer<=0) b.hazards.splice(i,1);
  }

  if(b.state==='patrol'){
    b.x += b.vx;
    if(b.x<b.minX){ b.x=b.minX; b.vx*=-1; }
    if(b.x>b.maxX){ b.x=b.maxX; b.vx*=-1; }
    b.timer--;
    if(b.timer<=0){
      const useSpecial = b.phase===2 && Math.random()<0.55;
      b.state = useSpecial ? 'special_telegraph' : 'telegraph';
      b.timer = useSpecial ? 30 : 26;
    }
  } else if(b.state==='telegraph'){
    b.timer--;
    if(b.timer<=0){ b.state='slam'; b.vy=-3.25; }
  } else if(b.state==='slam'){
    b.vy += GRAVITY;
    b.y += b.vy;
    if(b.y >= level.layerY[0]-b.h){
      b.y = level.layerY[0]-b.h; b.vy=0; b.state='patrol'; b.timer=ri(110,170);
      spawnParticles(b.x+b.w/2, b.y+b.h, 16, b.hue, 3);
      if(player.onGround && Math.abs((player.x+player.w/2)-(b.x+b.w/2))<80){
        damagePlayer(1);
      }
    }
  } else if(b.state==='special_telegraph'){
    b.timer--;
    if(b.timer<=0){ b.state='special'; fireBossSpecial(b); b.timer=20; }
  } else if(b.state==='special'){
    b.timer--;
    if(b.timer<=0){ b.state='patrol'; b.timer=ri(110,170); }
  }

  if(aabb(player.x,player.y,player.w,player.h,b.x,b.y,b.w,b.h)){
    if((player.pounding || (player.vy>0 && player.prevBottom<=b.y+8)) && b.invinc<=0){
      b.hp--;
      b.invinc = 45;
      player.vy = BASE_JUMP_V*0.7;
      player.jumpsUsed = 0;
      spawnParticles(b.x+b.w/2, b.y+b.h/2, 12, b.hue, 2.4);
      if(b.hp<=0){
        b.alive = false;
        session.stats.bossesDefeated++;
        addCoins(50);
        showToast(b.name + ' defeated! The way is clear.', 2000);
      }
    } else if(b.invinc<=0){
      damagePlayer(1);
    }
  }
}

function fireBossSpecial(b){
  if(b.special==='vines'){
    // thorny spikes erupt from the ground at 3 spots around the player
    for(let i=0;i<3;i++){
      const hx = player.x + rand(-70,70) + i*2;
      b.hazards.push({x:Math.max(20,Math.min(level.width-40,hx)), y:level.layerY[0]-20, w:14, h:20, timer:44, maxTimer:44});
    }
    spawnParticles(b.x+b.w/2, b.y+b.h, 10, '#5fb89c', 2);
  } else if(b.special==='frost'){
    // an expanding ring of frost damages anyone caught nearby
    const dist = Math.hypot((player.x+player.w/2)-(b.x+b.w/2), (player.y+player.h/2)-(b.y+b.h/2));
    if(dist<95) damagePlayer(1);
    spawnParticles(b.x+b.w/2, b.y+b.h/2, 20, '#dff5fb', 3.2);
    b.frostRing = {x:b.x+b.w/2, y:b.y+b.h/2, timer:20};
  } else if(b.special==='fire'){
    // a spread of fireballs launched toward the player
    const dir = (player.x<b.x) ? -1 : 1;
    for(let i=0;i<3;i++){
      level.projectiles.push({x:b.x+b.w/2, y:b.y+b.h/2+i*6-6, vx:dir*2.2, vy:(i-1)*0.4, w:6, h:6, fireball:true});
    }
    spawnParticles(b.x+b.w/2, b.y+b.h/2, 10, '#ff8a3d', 2.4);
  }
}

function updateHazards(){
  level.spikes.forEach(sp=>{
    if(aabb(player.x,player.y,player.w,player.h,sp.x,sp.y,sp.w,sp.h)){
      damagePlayer(session.curseVampiric?2:1);
    }
  });
  const door = level.vaultDoor;
  if(door && !door.opened && session.hasKey &&
     aabb(player.x-3,player.y,player.w+6,player.h,door.x,door.y,door.w,door.h)){
    door.opened = true; door.solid = false; session.hasKey = false;
    session.stats.vaultsOpened++;
    if(session.stats.vaultsOpened>=5) window.AchievementManager?.notify?.('cavern_vault_mastery',{facts:{mastery_cavern_crammer:1}});
    spawnParticles(door.x+door.w/2, door.y+door.h/2, 20, '#f2b84b', 2.6);
    showToast('The vault door creaks open — loot inside!', 1800);
  }
}

function updateCoins(){
  const magnetTier = save.upgrades.magnetTier||0;
  const magnetActive = magnetTier>0 || session.charMagnetBonus>0;
  const magnetRadius = (magnetTier>0 ? MAGNET_BASE_RADIUS*(1+0.1*(magnetTier-1)) : 0) + session.charMagnetBonus;
  level.coins.forEach(c=>{
    if(c.collected) return;
    c.phase += 0.04;
    if(magnetActive){
      const dx = (player.x+player.w/2)-c.x, dy=(player.y+player.h/2)-c.y;
      const dist = Math.hypot(dx,dy);
      if(dist<magnetRadius && dist>1){ c.x += dx/dist*3.2; c.y += dy/dist*3.2; }
    }
    if(aabb(player.x,player.y,player.w,player.h,c.x-4,c.y-4,8,8)){
      c.collected = true;
      const base = c.value||1;
      let v = (session.silverChance>0 && Math.random()<session.silverChance) ? base*5 : base;
      const silver = v===base*5 && base*5!==base;
      if(session.curseDoubleOrNothing) v = Math.random()<0.5 ? v*2 : 0;
      if(session.curseHeavyPurse) v = Math.max(0, Math.round(v*0.5));
      if(v<=0){
        spawnParticles(c.x,c.y,4,'#6b5a94',1);
      } else {
        addCoins(v);
        spawnParticles(c.x,c.y,silver?7:5, silver?'#dfe8f2':'#f2b84b', silver?1.8:1.4);
        if(silver) showToast('Silver coin! +'+v, 900);
      }
    }
  });
}

function updateFlags(){
  for(const cp of level.checkpoints){
    if(!cp.triggered && aabb(player.x,player.y,player.w,player.h,cp.x,cp.y,cp.w,cp.h)){
      cp.triggered = true;
      checkpointSpawn = {x:cp.x, y:cp.y+cp.h-player.h};
      const speedBonus = Math.floor(session.speedScore/40);
      addCoins(speedBonus);
      session.speedScore = SPEED_SCORE_MAX;
      bankCarriedCoins();
      showToast('Checkpoint '+(cp.index+1)+' of 3 reached! +'+speedBonus+' speed bonus. Gold banked.', 1600);
      quizFinishCallback = ()=>{};
      openQuizRound('checkpoint', 4);
      return;
    }
  }
  const g = level.goal;
  const bossBlocking = level.boss && level.boss.alive;
  if(!g.triggered && !bossBlocking && aabb(player.x,player.y,player.w,player.h,g.x,g.y,g.w,g.h)){
    g.triggered = true;
    const speedBonus = Math.floor(session.speedScore/40);
    addCoins(speedBonus);
    session.speedScore = SPEED_SCORE_MAX;
    bankCarriedCoins();
    showToast((level.isBoss ? 'Guardian defeated — ruin cleared!' : 'Ruin cleared!') + ' +'+speedBonus+' speed bonus. Gold banked.', 1600);
    quizFinishCallback = ()=>{ openShop(); };
    openQuizRound('goal', 4);
  }
}

/* ============================= RENDER ============================= */
function cavernReward(slot){ return typeof AchievementManager!=='undefined' ? AchievementManager.getEquipped('cavern-crammer')[slot] : null; }
function drawBackground(){
  const z = level && level.zone ? level.zone : ZONES[0];
  const grad = ctx.createLinearGradient(0,0,0,VH);
  const deepCrystal=cavernReward('theme')?.id==='cavern-crammer_deep_crystal_explorer';
  const wildWest=cavernReward('world')?.id==='cavern-crammer_wild_west_hazards';
  grad.addColorStop(0,deepCrystal?'#07182f':wildWest?'#5b2414':z.bg[0]); grad.addColorStop(0.6,deepCrystal?'#163760':wildWest?'#b15b2d':z.bg[1]); grad.addColorStop(1,deepCrystal?'#32165d':wildWest?'#e29b52':z.bg[2]);
  ctx.fillStyle = grad; ctx.fillRect(0,0,VW,VH);

  drawHillLayer(z.hill1, camX*0.25, 140, 150, 50, z.hillShape);
  drawHillLayer(z.hill2, camX*0.5, 100, 168, 48, z.hillShape);

  const time = performance.now()/1000;
  const ac = z.ambientColor || '#f2e7a8';
  for(let i=0;i<10;i++){
    let fx, fy, size;
    if(z.texture==='ember'){
      // embers drift upward
      fy = VH - ((time*22 + i*37) % (VH+30));
      fx = (i*97 + Math.sin(time*0.8+i)*14) % (VW+40) - 20;
      size = 1+((i*13)%3)*0.5;
    } else if(z.texture==='ice'){
      // slow glittering motes
      fx = (i*97 + Math.sin(time*0.4+i)*24) % (VW+40) - 20;
      fy = 30 + (i*23%130) + Math.sin(time*0.8+i*2)*5;
      size = 1+((i*7)%2)*0.5;
    } else {
      // drifting spores
      fx = (i*97 + Math.sin(time*0.6+i)*30) % (VW+40) - 20;
      fy = 40 + (i*23%110) + Math.sin(time+i*2)*6;
      size = 1.5;
    }
    ctx.globalAlpha = 0.4+0.5*Math.sin(time*2+i);
    ctx.fillStyle = ac;
    ctx.fillRect(fx,fy,size,size);
  }
  ctx.globalAlpha=1;
  if(deepCrystal){
    ctx.save();
    // Layered crystal walls, faceted clusters and slow moving shafts of refracted light.
    const shimmer=.55+.45*Math.sin(time*1.4);ctx.globalAlpha=.16+.1*shimmer;
    for(let i=0;i<5;i++){const bx=(i*137-camX*.08)%(VW+180)-90;const beam=ctx.createLinearGradient(bx,0,bx+90,VH);beam.addColorStop(0,'rgba(120,250,255,.85)');beam.addColorStop(1,'rgba(135,70,255,0)');ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(bx,0);ctx.lineTo(bx+32,0);ctx.lineTo(bx+125,VH);ctx.lineTo(bx+82,VH);ctx.fill();}
    ctx.globalAlpha=.48;for(let i=0;i<12;i++){const x=(i*101-camX*.16)%(VW+120)-40,base=145+(i%3)*12,h=28+(i*17)%48,w=8+(i%4)*3;ctx.fillStyle=i%3===0?'#64f4ff':i%3===1?'#a56cff':'#4c8fff';ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x+w*.45,base-h);ctx.lineTo(x+w,base);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(235,255,255,.72)';ctx.beginPath();ctx.moveTo(x+w*.45,base-h);ctx.lineTo(x+w*.45,base-4);ctx.lineTo(x+w*.7,base);ctx.closePath();ctx.fill();}
    ctx.globalAlpha=.7;for(let i=0;i<18;i++){const x=(i*83-camX*.12)%(VW+80)-30,y=24+(i*41)%128,s=7+(i%4)*3;ctx.fillStyle=i%2?'#7ff7ff':'#c47dff';ctx.beginPath();ctx.moveTo(x,y-s);ctx.lineTo(x+s*.6,y);ctx.lineTo(x,y+s);ctx.lineTo(x-s*.6,y);ctx.fill();ctx.fillStyle='rgba(255,255,255,.75)';ctx.fillRect(x-1,y-s+3,2,Math.max(2,s*.45));}
    ctx.globalAlpha=.25+.2*shimmer;ctx.strokeStyle='#b6ffff';ctx.lineWidth=1;for(let y=34;y<170;y+=27){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(VW,y+Math.sin(time+y)*4);ctx.stroke();}
    ctx.restore();
  }
}

function drawHillLayer(color, scrollX, period, baseY, riseH, shape){
  ctx.fillStyle = color;
  for(let i=-1;i<7;i++){
    const bx = i*period - (scrollX%period);
    ctx.beginPath();
    if(shape==='icy'){
      // jagged ice peaks
      ctx.moveTo(bx, baseY);
      ctx.lineTo(bx+period*0.18, baseY-riseH*0.5);
      ctx.lineTo(bx+period*0.32, baseY-riseH);
      ctx.lineTo(bx+period*0.46, baseY-riseH*0.4);
      ctx.lineTo(bx+period*0.62, baseY-riseH*0.9);
      ctx.lineTo(bx+period*0.8, baseY-riseH*0.3);
      ctx.lineTo(bx+period, baseY);
    } else if(shape==='volcanic'){
      // jagged volcanic silhouette with a glowing crack
      ctx.moveTo(bx, baseY);
      ctx.lineTo(bx+period*0.25, baseY-riseH*0.7);
      ctx.lineTo(bx+period*0.4, baseY-riseH);
      ctx.lineTo(bx+period*0.55, baseY-riseH*0.55);
      ctx.lineTo(bx+period*0.7, baseY-riseH*0.85);
      ctx.lineTo(bx+period, baseY);
    } else {
      // soft rounded mossy hill
      ctx.moveTo(bx, baseY);
      ctx.quadraticCurveTo(bx+period*0.5, baseY-riseH, bx+period, baseY);
    }
    ctx.closePath(); ctx.fill();
  }
  if(shape==='volcanic'){
    // faint glow along the ridgeline
    ctx.globalAlpha = 0.35+0.25*Math.sin(performance.now()/500);
    ctx.fillStyle = '#ff8a3d';
    for(let i=-1;i<7;i++){
      const bx = i*period - (scrollX%period);
      ctx.fillRect(bx+period*0.38, baseY-riseH+2, 3, 2);
    }
    ctx.globalAlpha = 1;
  }
}

function drawWindZones(){
  if(!level.windZones || !level.windZones.length) return;
  const t = performance.now()/1000;
  level.windZones.forEach(wz=>{
    const sx = wz.x-camX, sy = wz.y-camY;
    if(sx+wz.w<0||sx>VW||sy+wz.h<0||sy>VH) return;
    ctx.fillStyle = 'rgba(180,225,240,0.08)';
    ctx.fillRect(sx, sy, wz.w, wz.h);
    // animated chevrons drifting in the push direction
    const len = Math.hypot(wz.fx, wz.fy) || 0.001;
    const ux = wz.fx/len, uy = wz.fy/len;
    const rows = Math.max(2, Math.floor(wz.h/28));
    const cols = Math.max(2, Math.floor(wz.w/28));
    for(let r=0; r<rows; r++){
      for(let c=0; c<cols; c++){
        const baseX = sx + (c+0.5)*(wz.w/cols);
        const baseY = sy + (r+0.5)*(wz.h/rows);
        const drift = ((t*40 + r*17 + c*23) % 24) - 12;
        const cx = baseX + ux*drift, cy = baseY + uy*drift;
        ctx.strokeStyle = 'rgba(210,238,248,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx-ux*4-uy*3, cy-uy*4+ux*3);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx-ux*4+uy*3, cy-uy*4-ux*3);
        ctx.stroke();
      }
    }
  });
}

function drawZoneTopDecor(sx, sy, w, texture){
  if(texture==='moss'){
    for(let bx=4; bx<w-4; bx+=14){
      const hgt = 2+(Math.floor((sx+bx)/5)%3);
      ctx.fillStyle = '#5fb89c';
      ctx.fillRect(sx+bx, sy-hgt, 2, hgt);
      ctx.fillStyle = '#7fd8a0';
      ctx.fillRect(sx+bx, sy-hgt, 1, 1);
    }
  } else if(texture==='ice'){
    for(let bx=5; bx<w-5; bx+=16){
      ctx.fillStyle='rgba(223,245,251,0.65)';
      ctx.fillRect(sx+bx, sy-3, 1, 3);
    }
  } else if(texture==='ember'){
    for(let bx=5; bx<w-5; bx+=18){
      const flick = 0.35+0.4*Math.sin(performance.now()/280 + bx);
      ctx.globalAlpha = flick;
      ctx.fillStyle = '#ff8a3d';
      ctx.fillRect(sx+bx, sy, 3, 1);
      ctx.globalAlpha = 1;
    }
  }
}
function drawZoneUnderDecor(sx, sy, w, h, texture){
  if(texture==='ice'){
    for(let bx=6; bx<w-6; bx+=20){
      const len = 3+(Math.floor((sx+bx)/6)%3);
      ctx.fillStyle='rgba(223,245,251,0.55)';
      ctx.fillRect(sx+bx, sy+h, 2, len);
    }
  } else if(texture==='moss'){
    for(let bx=8; bx<w-8; bx+=26){
      ctx.fillStyle='rgba(95,184,156,0.45)';
      ctx.fillRect(sx+bx, sy+h, 1, 5);
    }
  }
}
function drawPlatforms(){
  const z = level.zone || ZONES[0];
  level.platforms.forEach(p=>{
    if(p.broken) return;
    const jitter = (p.crumbleTimer!==undefined && p.solid) ? (Math.random()*2-1) : 0;
    const sx = p.x-camX+jitter;
    const sy = p.y-camY;
    if(sx+p.w<0 || sx>VW || sy+p.h<0 || sy>VH) return;
    if(p.type==='ground'){
      ctx.fillStyle = z.ground;
      ctx.fillRect(sx, sy, p.w, Math.min(p.h,VH));
      ctx.fillStyle = z.groundEdge;
      ctx.fillRect(sx, sy, p.w, 4);
      if(p.icy) { ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.fillRect(sx, sy, p.w, 2); }
      for(let bx=0; bx<p.w; bx+=16){
        ctx.fillStyle='rgba(0,0,0,0.18)';
        ctx.fillRect(sx+bx, sy+4, 1, Math.min(p.h,VH)-4);
      }
      drawZoneTopDecor(sx, sy, p.w, z.texture);
    } else if(p.type==='wall'){
      ctx.fillStyle = z.wall;
      ctx.fillRect(sx,sy,p.w,p.h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for(let by=0; by<p.h; by+=14) ctx.fillRect(sx,sy+by,p.w,2);
    } else if(p.type==='vaultdoor'){
      if(p.opened){
        ctx.fillStyle = 'rgba(8,6,14,0.85)';
        ctx.fillRect(sx,sy,p.w,p.h);
      } else {
        ctx.fillStyle = session.hasKey ? '#f2b84b' : '#5a4a38';
        ctx.fillRect(sx,sy,p.w,p.h);
        ctx.fillStyle = '#2a2138';
        for(let by=6; by<p.h-4; by+=12) ctx.fillRect(sx+1,sy+by,p.w-2,2);
        ctx.fillStyle = session.hasKey ? '#fff8e6' : '#8a7a68';
        ctx.fillRect(sx+p.w/2-1, sy+p.h/2-1, 2, 2);
      }
    } else if(p.type==='passthrough'){
      const rungCol = shadeColor(z.walkway, 0.3);
      ctx.fillStyle = rungCol+'8c';
      for(let bx=0; bx<p.w; bx+=8){
        ctx.fillRect(sx+bx, sy+p.h-4, 5, 4);
      }
      ctx.fillStyle = z.spike;
      ctx.fillRect(sx, sy, p.w, 2);
    } else {
      const crumbling = p.crumbleTimer!==undefined;
      if(p.crumble){
        // Falling platforms always look visibly different — cracked, weathered
        // stone — so players can spot them before ever stepping on one.
        const dangerFlash = crumbling && Math.floor(p.crumbleTimer/3)%2===0;
        ctx.fillStyle = dangerFlash ? '#e0564f' : '#8a6a45';
        ctx.fillRect(sx,sy,p.w,p.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx+p.w*0.22, sy); ctx.lineTo(sx+p.w*0.38, sy+p.h*0.5); ctx.lineTo(sx+p.w*0.18, sy+p.h);
        ctx.moveTo(sx+p.w*0.68, sy); ctx.lineTo(sx+p.w*0.55, sy+p.h*0.45); ctx.lineTo(sx+p.w*0.78, sy+p.h);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(sx,sy,p.w,2);
        ctx.fillStyle = 'rgba(255,220,150,0.6)';
        ctx.fillRect(sx+2,sy+2,2,2); ctx.fillRect(sx+p.w-4,sy+2,2,2);
      } else if(p.heats){
        // Heats up the longer you stand on it, then bursts into flame.
        if(p.onFire){
          const flicker = 0.6+0.4*Math.sin(performance.now()/25);
          ctx.fillStyle = '#7a2e1a';
          ctx.fillRect(sx,sy,p.w,p.h);
          ctx.globalAlpha = flicker;
          ctx.fillStyle = '#ff8a3d';
          ctx.fillRect(sx, sy-3, p.w, 4);
          for(let bx=2; bx<p.w-2; bx+=7){
            ctx.fillStyle = Math.random()<0.5 ? '#ffcf6b' : '#ff8a3d';
            ctx.fillRect(sx+bx, sy-3-Math.random()*4, 3, 5);
          }
          ctx.globalAlpha = 1;
        } else {
          const heating = p.heatTimer!==undefined;
          const warmth = heating ? 1-(p.heatTimer/42) : 0; // 0 (cool) -> 1 (about to ignite)
          ctx.fillStyle = heating ? `rgba(255,${Math.round(140-90*warmth)},${Math.round(60-40*warmth)},1)` : '#6b3a2c';
          ctx.fillRect(sx,sy,p.w,p.h);
          ctx.fillStyle = 'rgba(255,180,120,0.5)';
          ctx.fillRect(sx,sy,p.w,2);
          if(heating && Math.floor(p.heatTimer/4)%2===0){
            ctx.fillStyle = 'rgba(255,138,61,0.5)';
            ctx.fillRect(sx-1,sy-1,p.w+2,p.h+2);
          }
        }
      } else if(p.growth){
        if(p.grown){
          ctx.fillStyle = '#4f7a5c';
          ctx.fillRect(sx,sy,p.w,p.h);
          ctx.fillStyle = '#7fd8a0';
          for(let bx=3; bx<p.w-2; bx+=9){
            ctx.fillRect(sx+bx, sy-3, 3, 4);
          }
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(sx,sy,p.w,2);
        } else {
          const waking = p.growTimer!==undefined;
          const wakeAmt = waking ? 1-(p.growTimer/45) : 0;
          ctx.globalAlpha = 0.12 + wakeAmt*0.55;
          ctx.fillStyle = '#5fb89c';
          ctx.fillRect(sx,sy,p.w,p.h);
          ctx.globalAlpha = 1;
        }
      } else if(p.frozen){
        // Extra-slippery ice patch — pale, crystalline, harder to stop on than regular icy footing.
        ctx.fillStyle = '#bfe9f2';
        ctx.fillRect(sx,sy,p.w,p.h);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(sx,sy,p.w,2);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx+p.w*0.3, sy+1); ctx.lineTo(sx+p.w*0.3, sy+p.h-1);
        ctx.moveTo(sx+p.w*0.7, sy+1); ctx.lineTo(sx+p.w*0.7, sy+p.h-1);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.moving? shadeColor(z.walkway, 0.28) : z.walkway;
        ctx.fillRect(sx,sy,p.w,p.h);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(sx,sy,p.w,2);
        if(p.icy){ ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.fillRect(sx, sy, p.w, 2); }
        if(!p.mini && !p.moving && p.w>=30){
          drawZoneTopDecor(sx, sy, p.w, z.texture);
          drawZoneUnderDecor(sx, sy, p.w, p.h, z.texture);
        }
      }
    }
  });
}
function drawSpikes(){
  const western=cavernReward('world')?.id==='cavern-crammer_wild_west_hazards';
  ctx.fillStyle = western ? '#4b8a36' : (level.zone ? level.zone.spike : '#c94a44');
  level.spikes.forEach(sp=>{
    const sx = sp.x-camX, sy = sp.y-camY;
    if(sx+sp.w<0||sx>VW||sy+sp.h<0||sy>VH) return;
    const n = Math.max(1,Math.floor(sp.w/8));
    const tw = sp.w/n;
    for(let i=0;i<n;i++){
      ctx.beginPath();
      ctx.moveTo(sx+i*tw, sy+sp.h);
      ctx.lineTo(sx+i*tw+tw/2, sy);
      ctx.lineTo(sx+i*tw+tw, sy+sp.h);
      ctx.closePath(); ctx.fill();
      if(western){ctx.fillStyle='#8fd36b';ctx.fillRect(sx+i*tw+tw*.45,sy+sp.h*.34,1,sp.h*.45);ctx.fillStyle='#4b8a36';}
    }
  });
}
function drawCoins(){
  const silver=cavernReward('coins')?.id==='cavern-crammer_silver_cavern_coins';
  level.coins.forEach(c=>{
    if(c.collected) return;
    const sx = c.x-camX, sy = c.y-camY;
    if(sx<-10||sx>VW+10||sy<-10||sy>VH+10) return;
    const bob = Math.sin(c.phase)*2;
    const w = 6+Math.sin(c.phase*1.3)*2;
    ctx.fillStyle = silver ? '#aebdca' : '#f2b84b';
    ctx.fillRect(sx-w/2, sy+bob-3, w, 6);
    ctx.fillStyle = silver ? '#f2fbff' : '#fff3c9';
    ctx.fillRect(sx-1, sy+bob-2, 1,1);
  });
}
function drawEnemies(){
  level.enemies.forEach(en=>{
    if(!en.alive) return;
    const sx = en.x-camX, sy = en.y-camY;
    if(sx+en.w<0||sx>VW||sy+en.h<0||sy>VH) return;
    if(en.type==='flyer') drawFlyer(en,sx,sy);
    else if(en.type==='slider') drawSlider(en,sx,sy);
    else if(en.type==='lobber') drawLobber(en,sx,sy);
    else drawCrawler(en,sx,sy);
  });
}

function drawCrawler(en,sx,sy){
  const dark = shadeColor(en.hue, -0.32);
  const dir = en.vx>=0 ? 1 : -1;
  const legPhase = Math.round(Math.sin(performance.now()/110 + en.x));
  ctx.save();
  ctx.translate(Math.round(sx+en.w/2), 0);
  ctx.scale(dir,1);
  // legs (scuttling)
  ctx.fillStyle = dark;
  ctx.fillRect(-4, sy+en.h-3, 2, 3+legPhase);
  ctx.fillRect(2, sy+en.h-3, 2, 3-legPhase);
  // shell/body
  ctx.fillStyle = en.hue;
  ctx.fillRect(-5, sy+2, 10, en.h-4);
  ctx.fillStyle = dark;
  ctx.fillRect(-5, sy+en.h-5, 10, 2);
  ctx.fillRect(-5, sy+2, 10, 2);
  // back spikes
  ctx.fillStyle = dark;
  ctx.fillRect(-3, sy-1, 2, 3);
  ctx.fillRect(1, sy-1, 2, 3);
  // twitching antennae
  const twitch = Math.round(Math.sin(performance.now()/180+en.x)*1);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-1, sy); ctx.lineTo(-2+twitch, sy-3);
  ctx.moveTo(2, sy); ctx.lineTo(3-twitch, sy-3);
  ctx.stroke();
  // little front pincer
  ctx.fillStyle = dark;
  ctx.fillRect(4, sy+en.h-6, 2, 2);
  // eyes: angry, glowing on the leading side
  ctx.fillStyle = '#0b0815';
  ctx.fillRect(0, sy+4, 4, 3);
  ctx.fillStyle = '#fff8e6';
  ctx.fillRect(1, sy+5, 1, 1);
  ctx.fillRect(3, sy+5, 1, 1);
  ctx.restore();
}

function drawFlyer(en,sx,sy){
  const dark = shadeColor(en.hue, -0.32);
  const dir = en.vx>=0 ? 1 : -1;
  const wingPhase = Math.sin(performance.now()/70+en.x);
  ctx.save();
  ctx.translate(Math.round(sx+en.w/2), 0);
  ctx.scale(dir,1);
  // flapping wings
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const wingY = sy+3+wingPhase*2;
  ctx.beginPath();
  ctx.moveTo(-2, sy+4); ctx.lineTo(-9, wingY-2); ctx.lineTo(-8, wingY+3); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, sy+4); ctx.lineTo(9, wingY-2); ctx.lineTo(8, wingY+3); ctx.closePath(); ctx.fill();
  // round hovering body
  ctx.fillStyle = en.hue;
  ctx.fillRect(-4, sy+2, 8, 7);
  ctx.fillStyle = dark;
  ctx.fillRect(-4, sy+7, 8, 2);
  // glowing eyes (nocturnal creature)
  ctx.fillStyle = '#fff8e6';
  ctx.globalAlpha = 0.7+0.3*Math.sin(performance.now()/200);
  ctx.fillRect(-2, sy+4, 2, 2);
  ctx.fillRect(1, sy+4, 2, 2);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSlider(en,sx,sy){
  const dark = shadeColor(en.hue, -0.32);
  const dir = en.vx>=0 ? 1 : -1;
  ctx.save();
  ctx.translate(Math.round(sx+en.w/2), 0);
  ctx.scale(dir,1);
  // speed trail
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = en.hue;
  ctx.fillRect(-9, sy+en.h-4, 5, 2);
  ctx.globalAlpha = 1;
  // low, flattened streamlined body with a ski-like base
  ctx.fillStyle = dark;
  ctx.fillRect(-5, sy+en.h-2, 10, 2);
  ctx.fillStyle = en.hue;
  ctx.fillRect(-5, sy+4, 10, en.h-6);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(-5, sy+4, 10, 1);
  // sharp forward-swept head
  ctx.fillStyle = dark;
  ctx.fillRect(3, sy+3, 3, 3);
  // eyes
  ctx.fillStyle = '#0b0815';
  ctx.fillRect(1, sy+5, 3, 2);
  ctx.fillStyle = '#fff8e6';
  ctx.fillRect(2, sy+5, 1, 1);
  ctx.restore();
}

function drawLobber(en,sx,sy){
  const dark = shadeColor(en.hue, -0.32);
  const winding = en.fireTimer<20;
  ctx.save();
  ctx.translate(Math.round(sx+en.w/2), 0);
  // squat stationary body
  ctx.fillStyle = en.hue;
  ctx.fillRect(-5, sy+3, 10, en.h-3);
  ctx.fillStyle = dark;
  ctx.fillRect(-5, sy+en.h-3, 10, 2);
  // small spiky crown
  ctx.fillStyle = dark;
  ctx.fillRect(-4, sy, 2, 4); ctx.fillRect(-1, sy-1, 2, 5); ctx.fillRect(2, sy, 2, 4);
  // maw that puffs/glows just before firing
  ctx.fillStyle = winding ? '#fff8e6' : '#0b0815';
  if(winding){ ctx.globalAlpha = 0.6+0.4*Math.sin(performance.now()/25); }
  ctx.fillRect(-2, sy+5, 4, 3);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawTraps(){
  const spikeColor = level.zone ? level.zone.spike : '#c94a44';
  level.traps.forEach(t=>{
    if(t.type==='arrow'){
      const sx = t.x-camX, sy = t.y-camY;
      if(sx<-14||sx>VW+14||sy<-14||sy>VH+14) return;
      const dir = t.dir;
      // stone turret mount, bolted to the wall/floor edge
      ctx.fillStyle = '#2c2438';
      ctx.fillRect(sx-5, sy-6, 10, 12);
      ctx.fillStyle = '#4a3d6b';
      ctx.fillRect(sx-5, sy-6, 10, 3);
      // snout pointing the direction it fires, so its threat is readable at a glance
      ctx.fillStyle = '#1a1526';
      ctx.fillRect(sx + (dir>0?4:-8), sy-2, 4, 4);
      // glowing eye, always visible (not just while priming) so the trap reads clearly
      const idlePulse = 0.55+0.3*Math.sin(performance.now()/260);
      const primePulse = 0.65+0.35*Math.sin(performance.now()/30);
      ctx.globalAlpha = t.state==='priming' ? primePulse : idlePulse;
      ctx.fillStyle = spikeColor;
      ctx.beginPath();
      ctx.arc(sx+dir*1, sy, t.state==='priming'?4.5:3.5, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff8e0';
      ctx.fillRect(sx+dir*1-1, sy-1, 2, 2);
      if(t.state==='priming'){
        ctx.globalAlpha = 0.3+0.3*Math.sin(performance.now()/40);
        ctx.fillStyle = spikeColor;
        ctx.beginPath();
        ctx.arc(sx, sy, 11, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if(t.type==='fallblock'){
      if(t.state==='landed') return; // now a normal platform, drawn by drawPlatforms
      const sx = t.x-camX, sy = t.y-camY;
      if(sx+t.w<0||sx>VW||sy+t.h<0||sy>VH) return;
      const jitter = t.state==='shaking' ? (Math.random()*2-1) : 0;
      ctx.fillStyle = level.zone ? level.zone.groundEdge : '#7a3520';
      ctx.fillRect(sx+jitter, sy, t.w, t.h);
      // amber/black hazard stripes mark it as a rigged, falling hazard
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx+jitter, sy, t.w, t.h);
      ctx.clip();
      ctx.fillStyle = 'rgba(242,184,75,0.55)';
      for(let d=-t.h; d<t.w; d+=6){
        ctx.beginPath();
        ctx.moveTo(sx+jitter+d, sy+t.h);
        ctx.lineTo(sx+jitter+d+3, sy+t.h);
        ctx.lineTo(sx+jitter+d+3+t.h, sy);
        ctx.lineTo(sx+jitter+d+t.h, sy);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle='rgba(0,0,0,0.35)';
      ctx.fillRect(sx+jitter, sy+t.h-3, t.w, 3);
    }
  });
  level.projectiles.forEach(pr=>{
    const sx = pr.x-camX, sy = pr.y-camY;
    if(sx<-10||sx>VW+10||sy<-10||sy>VH+10) return;
    if(pr.fireball){
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.arc(sx-pr.vx*1.2, sy+pr.h/2, pr.w*0.9, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e0564f';
      ctx.beginPath(); ctx.arc(sx+pr.w/2, sy+pr.h/2, pr.w/2+1, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ffcf6b';
      ctx.beginPath(); ctx.arc(sx+pr.w/2, sy+pr.h/2, pr.w/2-1, 0, Math.PI*2); ctx.fill();
      return;
    }
    if(pr.lob){
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = pr.hue||'#8b5fbf';
      ctx.beginPath(); ctx.arc(sx+pr.w/2, sy+pr.h/2, pr.w/2+2, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = pr.hue||'#8b5fbf';
      ctx.beginPath(); ctx.arc(sx+pr.w/2, sy+pr.h/2, pr.w/2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff8e6';
      ctx.fillRect(sx+pr.w/2-1, sy+pr.h/2-1, 1, 1);
      return;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(sx-pr.vx*1.5, sy-1, Math.abs(pr.vx*1.5), pr.h+2);
    ctx.fillStyle = '#1a1526';
    ctx.fillRect(sx-1, sy-1, pr.w+2, pr.h+2);
    ctx.fillStyle = spikeColor;
    ctx.fillRect(sx, sy, pr.w, pr.h);
    ctx.fillStyle = '#fff8e0';
    ctx.fillRect(sx+pr.w/2-1, sy, 2, pr.h);
  });
}
function drawBoss(){
  const b = level.boss;
  if(!b || !b.alive) return;
  const sx = b.x-camX, sy = b.y-camY;
  if(!(sx+b.w<0||sx>VW||sy+b.h<0||sy>VH)){
    if(b.invinc>0 && Math.floor(b.invinc/3)%2===0){ /* hit flash: skip a frame */ }
    else {
      const dark = shadeColor(b.hue, -0.35);
      const dir = b.vx>=0 ? 1 : -1;
      const cx = Math.round(sx+b.w/2);
      ctx.save();
      ctx.translate(cx, 0);
      ctx.scale(dir,1);
      // stone legs
      ctx.fillStyle = dark;
      ctx.fillRect(-11, sy+b.h-7, 8, 7);
      ctx.fillRect(4, sy+b.h-7, 8, 7);
      // torso
      ctx.fillStyle = b.hue;
      ctx.fillRect(-13, sy+7, 26, b.h-13);
      // shoulder plating
      ctx.fillStyle = dark;
      ctx.fillRect(-15, sy+6, 7, 7);
      ctx.fillRect(9, sy+6, 7, 7);
      // head/brow
      ctx.fillStyle = dark;
      ctx.fillRect(-9, sy, 18, 8);
      ctx.fillStyle = b.hue;
      ctx.fillRect(-9, sy+7, 18, 2);
      // glowing eyes
      const glow = 0.65+0.35*Math.sin(performance.now()/220);
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#fff8e6';
      ctx.fillRect(-5, sy+3, 4, 3);
      ctx.fillRect(2, sy+3, 4, 3);
      ctx.globalAlpha = 1;
      // cracked armor line + rivets
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(-13, sy+15, 26, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-13, sy+7, 26, 2);
      // glowing chest crystal, echoing the eye glow
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#fff8e6';
      ctx.fillRect(-2, sy+11, 4, 4);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = dark; ctx.lineWidth = 1;
      ctx.strokeRect(-2.5, sy+10.5, 5, 5);
      if(b.state==='telegraph'){
        ctx.globalAlpha = 0.5+0.5*Math.sin(performance.now()/30);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-15, sy, 30, b.h);
        ctx.globalAlpha = 1;
      } else if(b.state==='special_telegraph'){
        const specColor = b.special==='vines'?'#5fb89c':b.special==='frost'?'#dff5fb':'#ff8a3d';
        ctx.globalAlpha = 0.45+0.45*Math.sin(performance.now()/25);
        ctx.fillStyle = specColor;
        ctx.fillRect(-15, sy, 30, b.h);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  // vine spikes (telegraphed ground hazards)
  b.hazards.forEach(hz=>{
    const hsx = hz.x-camX, hsy = hz.y-camY;
    const rising = hz.timer>hz.maxTimer-14;
    const h = rising ? hz.h*(1-(hz.timer-(hz.maxTimer-14))/14) : hz.h;
    if(h<=0) return;
    ctx.fillStyle = '#5fb89c';
    ctx.fillRect(hsx, hsy+(hz.h-h), hz.w, h);
    ctx.fillStyle = '#7fd8a0';
    for(let bx=2; bx<hz.w-1; bx+=5) ctx.fillRect(hsx+bx, hsy+(hz.h-h), 2, 3);
  });

  // frost ring pulse
  if(b.frostRing && b.frostRing.timer>0){
    b.frostRing.timer--;
    const r = 95*(1-b.frostRing.timer/20);
    ctx.globalAlpha = Math.max(0, b.frostRing.timer/20)*0.5;
    ctx.strokeStyle = '#dff5fb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.frostRing.x-camX, b.frostRing.y-camY, r, 0, Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if(b.frostRing.timer<=0) b.frostRing = null;
  }
  // HP pips above the boss, in world space
  const pipW=8, pipGap=3, total=b.maxHp*(pipW+pipGap)-pipGap;
  const px0 = b.x+b.w/2-total/2-camX, py0 = b.y-16-camY;
  for(let i=0;i<b.maxHp;i++){
    ctx.fillStyle = i<b.hp? '#e0564f':'#3a3054';
    ctx.fillRect(px0+i*(pipW+pipGap), py0, pipW, 6);
  }
}
function drawFlags(){
  const all = level.checkpoints.concat([level.goal]);
  all.forEach(f=>{
    const sx = f.x-camX, sy = f.y-camY;
    if(sx+f.w<0||sx>VW||sy+f.h<0||sy>VH) return;
    ctx.fillStyle = f.triggered? '#5fb89c':'#8a7fae';
    ctx.fillRect(sx+f.w/2-1, sy, 2, f.h);
    ctx.fillStyle = f.triggered? '#7fd8bd':'#c9bfe8';
    ctx.beginPath();
    ctx.moveTo(sx+f.w/2+1, sy+3);
    ctx.lineTo(sx+f.w, sy+8);
    ctx.lineTo(sx+f.w/2+1, sy+13);
    ctx.closePath(); ctx.fill();
  });
}

const SKIN_COLORS = {green:'#5fb89c', amber:'#f2b84b', violet:'#8b5fbf', crimson:'#c0563f'};
function drawLanternGlow(topY, t){
  const bob = Math.round(Math.sin(t*4.2)*1);
  const glow = ctx.createRadialGradient(-9, topY+11+bob, 0, -9, topY+11+bob, 13);
  glow.addColorStop(0, 'rgba(242,184,75,0.28)');
  glow.addColorStop(1, 'rgba(242,184,75,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-23, topY-9, 32, 32);
}
function drawLantern(topY, t, frameColor){
  const bob = Math.round(Math.sin(t*4.2)*1);
  ctx.fillStyle = '#241c38';
  ctx.fillRect(-8, topY+7, 1, 4);
  ctx.globalAlpha = 0.8 + 0.2*Math.sin(t*6.5);
  ctx.fillStyle = '#f2b84b';
  ctx.fillRect(-10, topY+10+bob, 3, 3);
  ctx.globalAlpha = 1;
  ctx.fillStyle = frameColor||'#2a2138';
  ctx.fillRect(-10, topY+9+bob, 3, 1);
  ctx.fillRect(-10, topY+13+bob, 3, 1);
}
function drawHat(topY){
  if(session.hat==='crown'){
    ctx.fillStyle = '#f2b84b';
    ctx.fillRect(-3, topY-4, 6, 3);
    ctx.fillRect(-3, topY-5, 1, 1); ctx.fillRect(0, topY-5, 1, 1); ctx.fillRect(2, topY-5, 1, 1);
  } else if(session.hat==='flower'){
    ctx.fillStyle = '#e0564f';
    ctx.fillRect(-2, topY-4, 2, 2);
    ctx.fillStyle = '#fff8e6';
    ctx.fillRect(-1, topY-5, 1, 1);
  } else if(session.hat==='feather'){
    ctx.fillStyle = '#8b5fbf';
    ctx.fillRect(1, topY-6, 1, 5);
    ctx.fillRect(2, topY-5, 1, 2);
  } else if(session.hat==='halo'){
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#fff8e6';
    ctx.fillRect(-3, topY-5, 6, 1);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(){
  if(player.invincTimer>0 && Math.floor(player.invincTimer/4)%2===0) return;
  const relic=cavernReward('companion')?.id==='cavern-crammer_rocket_recall_relic';
  const orbitTime=performance.now()/650,orbitDepth=Math.sin(orbitTime);
  if(relic&&orbitDepth<0)drawRocketRelic(orbitTime,orbitDepth);
  const ch = typeof AchievementManager!=='undefined'&&AchievementManager.getEquipped('cavern-crammer').skin?.id==='cavern-crammer_ninja_outfit' ? 'ninja' : save.character;
  if(ch==='skeleton') drawPlayerSkeleton();
  else if(ch==='riftwalker') drawPlayerRiftwalker();
  else if(ch==='astronaut') drawPlayerAstronaut();
  else if(ch==='ninja') drawPlayerNinja();
  else if(ch==='king') drawPlayerKing();
  else drawPlayerWisp();
  const trail=cavernReward('trail');
  if(trail?.id==='cavern-crammer_gem_spark_jump_trail'&&!player.onGround){
    const t=performance.now()/90;for(let i=0;i<5;i++){const x=player.x-camX+player.w/2-Math.sin(t+i)*10-i*3,y=player.y-camY+player.h+((t*2+i*7)%18);ctx.fillStyle=['#67f5ff','#d66bff','#fff3a0'][i%3];ctx.fillRect(Math.round(x),Math.round(y),i%2?2:3,i%2?2:3);}
  }
  if(relic&&orbitDepth>=0)drawRocketRelic(orbitTime,orbitDepth);
}

function drawPlayerSkeleton(){
  const cx=Math.round(player.x-camX+player.w/2),y=Math.round(player.y-camY),step=Math.round(Math.sin(player.walkAnim)*2);ctx.save();ctx.translate(cx,0);ctx.scale(player.facing,1);ctx.fillStyle='#efe8d0';ctx.fillRect(-5,y,10,8);ctx.fillStyle='#17131f';ctx.fillRect(-3,y+2,2,2);ctx.fillRect(2,y+2,2,2);ctx.fillRect(-1,y+6,2,1);ctx.fillStyle='#d9d0b7';ctx.fillRect(-2,y+8,4,7);ctx.fillRect(-6,y+9,4,2);ctx.fillRect(2,y+9,4,2);ctx.fillRect(-5+step,y+15,3,4);ctx.fillRect(2-step,y+15,3,4);ctx.fillStyle='#17131f';ctx.fillRect(-1,y+10,2,1);ctx.fillRect(-1,y+13,2,1);ctx.restore();
}
function drawPlayerRiftwalker(){const cx=Math.round(player.x-camX+player.w/2),y=Math.round(player.y-camY),p=.55+.45*Math.sin(performance.now()/130);ctx.save();ctx.globalAlpha=.35;ctx.fillStyle='#ff54ca';ctx.fillRect(cx-10-player.vx*2,y+2,20,15);ctx.globalAlpha=1;ctx.fillStyle='#101329';ctx.fillRect(cx-7,y,14,18);ctx.fillStyle='#56f5ff';ctx.fillRect(cx-8,y+3,16,3);ctx.globalAlpha=p;ctx.fillStyle='#ffdb62';ctx.fillRect(cx-4,y+8,8,7);ctx.fillStyle='#56f5ff';ctx.fillRect(cx-11,y+17,7,3);ctx.fillRect(cx+4,y+17,7,3);ctx.restore();}

function drawRocketRelic(t,depth){
  const cx=player.x-camX+player.w/2+Math.cos(t)*24,cy=player.y-camY+player.h*.52+depth*4;
  const scale=.48+(depth+1)*.26;
  ctx.save();ctx.translate(cx,cy);ctx.scale(scale,scale);ctx.globalAlpha=.58+(depth+1)*.21;ctx.rotate(-.15*Math.cos(t));
  ctx.fillStyle='#26334d';ctx.fillRect(-8,-4,15,8);ctx.fillStyle='#dce9f3';ctx.fillRect(-6,-3,11,6);ctx.fillStyle='#76efff';ctx.fillRect(-3,-2,4,3);ctx.fillStyle='#ff5b55';ctx.fillRect(5,-5,4,10);ctx.fillStyle='#ffd15c';ctx.fillRect(-10,-2,4,4);ctx.fillStyle='rgba(101,232,255,.7)';ctx.fillRect(-14,-1,4,2);ctx.restore();
}

function drawPlayerWisp(){
  const bodyColor = SKIN_COLORS[save.skin]||'#5fb89c';
  const bodyDark = shadeColor(bodyColor, -0.3);
  const dir = player.facing;
  const cx = Math.round(player.x - camX + player.w/2);
  const topY = Math.round(player.y - camY);
  const airborne = !player.onGround;
  const t = performance.now()/1000;
  const legPhase = Math.round(Math.sin(player.walkAnim)*2);

  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(dir, 1);
  drawLanternGlow(topY, t);

  // cape, trailing behind the facing direction
  ctx.fillStyle = 'rgba(10,8,18,0.35)';
  const capeLen = airborne ? 9 : 7+Math.abs(legPhase);
  ctx.fillRect(-7, topY+4, 3, capeLen);

  drawLantern(topY, t);

  // boots / legs
  ctx.fillStyle = bodyDark;
  if(airborne){
    ctx.fillRect(-4, topY+12, 3, 4);
    ctx.fillRect(1, topY+12, 3, 4);
  } else {
    ctx.fillRect(-4+legPhase, topY+13, 3, 3);
    ctx.fillRect(1-legPhase, topY+13, 3, 3);
  }

  // cloak body
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-5, topY+4, 10, 9);
  ctx.fillRect(-4, topY+2, 8, 3);
  ctx.fillStyle = bodyDark;
  ctx.fillRect(-5, topY+11, 10, 2);
  ctx.fillRect(-5, topY+4, 1, 9);

  // pointed hood
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-2, topY-1, 5, 3);
  ctx.fillStyle = bodyDark;
  ctx.fillRect(-2, topY-1, 1, 3);

  drawHat(topY);

  // shadowed face with a single glowing eye (facing side)
  ctx.fillStyle = '#150f22';
  ctx.fillRect(-3, topY+4, 7, 4);
  ctx.fillStyle = '#fff8e6';
  ctx.fillRect(1, topY+5, 2, 2);

  // sash accent tying the outfit to the lantern glow
  ctx.fillStyle = '#f2b84b';
  ctx.fillRect(-5, topY+9, 10, 1);

  ctx.restore();
}

function drawPlayerAstronaut(){
  const bodyColor = SKIN_COLORS[save.skin]||'#5fb89c';
  const dir = player.facing;
  const cx = Math.round(player.x - camX + player.w/2);
  const topY = Math.round(player.y - camY);
  const airborne = !player.onGround;
  const t = performance.now()/1000;
  const legPhase = Math.round(Math.sin(player.walkAnim)*2);

  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(dir, 1);
  drawLanternGlow(topY, t);

  // backpack tank instead of a cape
  ctx.fillStyle = '#8a94a0';
  ctx.fillRect(-7, topY+5, 3, 7);
  drawLantern(topY, t, '#8a94a0');

  // boots
  ctx.fillStyle = '#c7cfd6';
  if(airborne){ ctx.fillRect(-4, topY+12, 3, 4); ctx.fillRect(1, topY+12, 3, 4); }
  else { ctx.fillRect(-4+legPhase, topY+13, 3, 3); ctx.fillRect(1-legPhase, topY+13, 3, 3); }

  // bulky white suit body with a color-accent stripe
  ctx.fillStyle = '#e8ecef';
  ctx.fillRect(-5, topY+4, 10, 9);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-5, topY+8, 10, 2);
  ctx.fillStyle = '#aab3bb';
  ctx.fillRect(-5, topY+11, 10, 2);

  drawHat(topY-3);

  // round helmet with a tinted visor and reflection
  ctx.fillStyle = '#e8ecef';
  ctx.fillRect(-4, topY-3, 9, 7);
  ctx.fillStyle = '#3fa7c0';
  ctx.fillRect(-2, topY-1, 6, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(-1, topY, 2, 1);

  ctx.restore();
}

function drawPlayerNinja(){
  const bodyColor = SKIN_COLORS[save.skin]||'#5fb89c';
  const bodyDark = shadeColor(bodyColor, -0.35);
  const dir = player.facing;
  const cx = Math.round(player.x - camX + player.w/2);
  const topY = Math.round(player.y - camY);
  const airborne = !player.onGround;
  const t = performance.now()/1000;
  const legPhase = Math.round(Math.sin(player.walkAnim)*2);

  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(dir, 1);
  drawLanternGlow(topY, t);

  // flowing scarf trail, longer than the Wisp's cape
  ctx.fillStyle = bodyColor;
  const scarfLen = airborne ? 11 : 8+Math.abs(legPhase);
  ctx.fillRect(-8, topY+3, 2, scarfLen);
  ctx.fillStyle = bodyDark;
  ctx.fillRect(-9, topY+5, 1, scarfLen-3);

  drawLantern(topY, t);

  // dark boots
  ctx.fillStyle = '#0b0815';
  if(airborne){ ctx.fillRect(-4, topY+12, 3, 4); ctx.fillRect(1, topY+12, 3, 4); }
  else { ctx.fillRect(-4+legPhase, topY+13, 3, 3); ctx.fillRect(1-legPhase, topY+13, 3, 3); }

  // slim dark garb
  ctx.fillStyle = '#1a1526';
  ctx.fillRect(-4, topY+3, 8, 10);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-4, topY+8, 8, 1);

  // belt kunai
  ctx.fillStyle = '#8a94a0';
  ctx.fillRect(3, topY+9, 1, 3);

  drawHat(topY-1);

  // wrapped head with an eye-slit
  ctx.fillStyle = '#1a1526';
  ctx.fillRect(-3, topY, 7, 5);
  ctx.fillStyle = '#fff8e6';
  ctx.fillRect(1, topY+2, 2, 1);

  ctx.restore();
}

function drawPlayerKing(){
  const bodyColor = SKIN_COLORS[save.skin]||'#5fb89c';
  const bodyDark = shadeColor(bodyColor, -0.3);
  const dir = player.facing;
  const cx = Math.round(player.x - camX + player.w/2);
  const topY = Math.round(player.y - camY);
  const airborne = !player.onGround;
  const t = performance.now()/1000;
  const legPhase = Math.round(Math.sin(player.walkAnim)*2);

  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(dir, 1);
  drawLanternGlow(topY, t);

  // regal cape
  ctx.fillStyle = shadeColor(bodyColor,-0.1);
  const capeLen = airborne ? 10 : 8+Math.abs(legPhase);
  ctx.fillRect(-7, topY+3, 3, capeLen);

  drawLantern(topY, t, '#f2b84b'); // gilded lantern frame

  // boots hidden under the robe hem
  ctx.fillStyle = bodyDark;
  if(airborne){ ctx.fillRect(-4, topY+13, 3, 3); ctx.fillRect(1, topY+13, 3, 3); }
  else { ctx.fillRect(-4+legPhase, topY+14, 3, 2); ctx.fillRect(1-legPhase, topY+14, 3, 2); }

  // wide flowing robe with a fur-trim collar
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-6, topY+4, 12, 10);
  ctx.fillStyle = '#fff8e6';
  ctx.fillRect(-6, topY+4, 12, 2);
  ctx.fillStyle = bodyDark;
  ctx.fillRect(-6, topY+12, 12, 2);

  // crown
  ctx.fillStyle = '#f2b84b';
  ctx.fillRect(-3, topY-3, 7, 3);
  ctx.fillRect(-3, topY-5, 1, 2); ctx.fillRect(0, topY-6, 1, 3); ctx.fillRect(3, topY-5, 1, 2);
  ctx.fillStyle = '#e0564f';
  ctx.fillRect(0, topY-4, 1, 1);

  drawHat(topY-5);

  // face
  ctx.fillStyle = '#150f22';
  ctx.fillRect(-3, topY, 7, 4);
  ctx.fillStyle = '#fff8e6';
  ctx.fillRect(1, topY+1, 2, 2);

  ctx.restore();
}

function drawEffectsHUD(){
  const row = document.getElementById('effectsRow');
  const chips = [];
  if(session.hasKey) chips.push('🗝 KEY');
  if(session.wallJump) chips.push('WALLJUMP'+(session.wallJumpTier>1?' ×'+session.wallJumpTier:''));
  if(session.extraJumps>0) chips.push('+1 JUMP');
  if(session.tripleJumpOwned) chips.push('TRIPLE JUMP');
  if(session.dashOwned) chips.push(session.shadowDash?'SHADOW DASH':'DASH');
  if(session.warpCharges>0) chips.push('🌀 WARP×'+session.warpCharges);
  if(session.hoverOwned) chips.push('HOVER');
  if(session.featherFall) chips.push('FEATHER FALL');
  if(session.groundPoundOwned) chips.push('POUND'+(session.groundPoundTier>1?' +SHOCK':''));
  if(session.silverChance>0) chips.push('SILVER VEIN');
  if(session.hat) chips.push('🎩 HAT');
  if(session.curseGlassCannon) chips.push('GLASS CANNON');
  if(session.curseSpeedMult>1) chips.push('RECKLESS');
  if(session.curseHeavyPurse) chips.push('HEAVY PURSE');
  if(session.curseGlassLantern) chips.push('GLASS LANTERN');
  if(session.curseDoubleOrNothing) chips.push('50/50 COINS');
  if(session.curseKnockbackMult>1) chips.push('FEATHERWEIGHT');
  if(session.curseAdrenaline) chips.push('ADRENALINE');
  if(session.curseIronBoots) chips.push('IRON BOOTS');
  if(session.curseVampiric) chips.push('VAMPIRIC');
  row.innerHTML = chips.map(c=>`<div class="effectChip">${c}</div>`).join('');
}
function drawHearts(){
  const wrap = document.getElementById('hearts');
  let html='';
  for(let i=0;i<player.maxHealth;i++){
    const filled = i<player.health;
    html += `<svg class="heart" viewBox="0 0 16 16"><rect width="16" height="16" fill="none"/><path d="M8 14 L2 8 A4 4 0 0 1 8 3 A4 4 0 0 1 14 8 Z" fill="${filled?'#e0564f':'#3a3054'}" stroke="#0b0815" stroke-width="1"/></svg>`;
  }
  wrap.innerHTML = html;
  const lv = document.createElement('span');
  lv.id = 'livesLabel';
  lv.textContent = '×' + session.lives;
  wrap.appendChild(lv);
}

/* ============================= MAIN LOOP ============================= */
function updateLava(){
  if(!level.lavaRise) return;
  if(level.lavaGrace>0){
    level.lavaGrace--;
    if(level.lavaGrace<=0) showToast('⚠ The lava is rising — climb!', 2200);
    return;
  }
  level.lavaY -= level.lavaSpeed;
  if(player.y+player.h > level.lavaY){
    damagePlayer(Math.max(1, level.zone ? level.zone.fallDamage : 1));
  }
}

function gameUpdate(){
  updatePlatforms();
  updatePlayer();
  updateEnemies();
  updateTraps();
  updateBoss();
  updateHazards();
  updateCoins();
  updateLava();
  updateFlags();
  updateParticles();
  session.speedScore = Math.max(SPEED_SCORE_MIN, session.speedScore - SPEED_SCORE_DECAY_PER_FRAME*(session.curseAdrenaline?0.5:1));
  camX = Math.max(0, Math.min(Math.max(0,level.width-VW), player.x - VW/2));
  camY = Math.max(0, Math.min(Math.max(0,level.height-VH), player.y - VH/2));
}
function gameRender(){
  ctx.clearRect(0,0,VW,VH);
  drawBackground();
  drawLava();
  drawWindZones();
  drawPlatforms();
  drawTraps();
  drawSpikes();
  drawFlags();
  drawCoins();
  drawEnemies();
  drawBoss();
  drawParticles();
  drawPlayer();
  drawDarkness();
}

function drawLava(){
  if(!level.lavaRise) return;
  const sy = level.lavaY - camY;
  if(sy>VH) return;
  const grad = ctx.createLinearGradient(0,sy,0,sy+34);
  grad.addColorStop(0,'#ffcf6b');
  grad.addColorStop(0.35,'#ff8a3d');
  grad.addColorStop(1,'#8a2f1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, Math.max(0,sy), VW, VH-Math.max(0,sy)+40);
  const t = performance.now()/280;
  for(let x=0;x<VW;x+=6){
    const wave = Math.sin(x*0.15+t)*2;
    ctx.fillStyle = Math.floor(x/6)%2===0 ? '#ffe8b0' : '#ffcf6b';
    ctx.fillRect(x, sy+wave, 6, 2);
  }
}

function drawDarkness(){
  const radius = BASE_LANTERN_RADIUS * (session.curseGlassLantern ? 1.8 : 1);
  const px = player.x-camX+player.w/2, py = player.y-camY+player.h/2;
  maskCtx.clearRect(0,0,VW,VH);
  maskCtx.fillStyle = 'rgba(4,3,10,0.93)';
  maskCtx.fillRect(0,0,VW,VH);
  maskCtx.globalCompositeOperation = 'destination-out';
  const grad = maskCtx.createRadialGradient(px,py,radius*0.3, px,py,radius);
  grad.addColorStop(0,'rgba(0,0,0,1)');
  grad.addColorStop(0.7,'rgba(0,0,0,0.9)');
  grad.addColorStop(1,'rgba(0,0,0,0)');
  maskCtx.fillStyle = grad;
  maskCtx.beginPath(); maskCtx.arc(px,py,radius,0,Math.PI*2); maskCtx.fill();
  maskCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(maskCanvas, 0, 0);
}

let lastSync = 0;
function loop(ts){
  requestAnimationFrame(loop);
  if(STATE==='playing' && level){
    gameUpdate();
    gameRender();
  }
  document.getElementById('coinVal').textContent = PlatformManager.getCoins();
  document.getElementById('carriedVal').textContent = session.carriedCoins>0 ? (' +'+session.carriedCoins) : '';
  const speedEl = document.getElementById('speedVal');
  speedEl.textContent = Math.round(session.speedScore);
  const speedFrac = (session.speedScore-SPEED_SCORE_MIN)/(SPEED_SCORE_MAX-SPEED_SCORE_MIN);
  document.getElementById('speedScore').style.color = speedFrac>0.5 ? '#7fd8a0' : speedFrac>0.2 ? '#f2b84b' : '#e0564f';
  document.getElementById('poundBtn').classList.toggle('hidden', !session.groundPoundOwned);
  document.getElementById('warpBtn').classList.toggle('hidden', session.warpCharges<=0);
  document.getElementById('warpBtn').textContent = '🌀 WARP' + (session.warpCharges>0?' ×'+session.warpCharges:'');
  drawHearts();
  drawEffectsHUD();
  if(saveDirty && ts-lastSync>1500){ persistSave(); saveDirty=false; lastSync=ts; }
  // Tells PlatformManager whether the player is actively playing right now (not paused,
  // not sat on the title/quiz/shop/game-over screens), for accurate play-time tracking.
  PlatformManager.heartbeat(GAME_CONFIG.id, STATE==='playing' && !!level);
  if(STATE==='playing'&&level)window.ChallengeManager?.update?.({score:levelIndex,distance:levelIndex,alive:true});
}

/* ============================= BOOT ============================= */
// Loads the Hub-selected class's question bank via QuestionManager and restores this game's saved
// adaptive weights onto it. Returns true/false so the Start button can be gated on it.
async function loadQuestionBank(){
  const result = await QuestionManager.loadCurrentBanks(window.GAME_CONFIG?.supportedQuestionFormats);
  if(!result.ok) return false;
  // Adaptive question weighting persists across sessions (see save.questionWeights),
  // unlike the in-memory-only default — restore whatever was saved onto the freshly-loaded bank.
  QuestionManager.restoreWeights(save.questionWeights, 'term');
  return true;
}

const bankMessage = document.getElementById('bankMessage');
const startBtn = document.getElementById('startBtn');
startBtn.disabled = true;

async function loadCurrentQuestionBank(){
  bankMessage.style.color = '#a89fc0';
  bankMessage.textContent = 'Loading question bank…';
  startBtn.disabled = true;
  const ok = await loadQuestionBank();
  if(ok){
    bankMessage.style.color = 'var(--moss)';
    bankMessage.textContent = '✓ Loaded: ' + QuestionManager.getBankName();
    startBtn.disabled = false;
  } else {
    bankMessage.style.color = 'var(--danger)';
    bankMessage.textContent = PlatformManager.hasClassCode()
      ? 'Question bank could not be loaded. Return to the Hub and check the class code.'
      : 'Please enter the class code before playing.';
    startBtn.disabled = true;
  }
}
loadCurrentQuestionBank();

startBtn.addEventListener('click', ()=>{
  if(startBtn.disabled || !QuestionManager.hasQuestions()) return;
  QuestionManager.beginMixedRun();
  document.getElementById('titleScreen').classList.add('hidden');
  // One PlatformManager session per sitting — restarting a run (newRunBtn) doesn't
  // start a new one, it's still the same session.
  PlatformManager.startSession(GAME_CONFIG.id);
  resetSession();
  levelIndex = 0;
  startLevel(0);
});

function renderCharGrid(){
  const grid = document.getElementById('charGrid');
  grid.innerHTML = '';
  // Safety net: if a save has a now-hidden character selected (e.g. from before this
  // change), fall back to Wisp rather than leaving an unselectable character active.
  if(!CHARACTERS.some(c=>c.id===save.character && characterAvailable(c))){
    save.character = 'wisp'; saveDirty=true; persistSave();
  }
  CHARACTERS.filter(characterAvailable).forEach(c=>{
    const active = save.character === c.id;
    const div = document.createElement('div');
    div.className = 'shopItem';
    if(active) div.style.borderColor = 'var(--amber)';
    div.innerHTML = `<div class="siName">${c.name}${active?' ✓':''}</div>
      <div class="siDesc" style="font-style:italic; color:var(--moss);">${c.tagline}</div>
      <div class="siDesc">${c.desc}</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn secondary'; btn.style.fontSize='9px'; btn.style.padding='6px';
    btn.textContent = active ? 'SELECTED' : 'CHOOSE';
    btn.disabled = active;
    btn.addEventListener('click', ()=>{ save.character = c.id; saveDirty=true; persistSave(); renderCharGrid(); });
    div.appendChild(btn);
    grid.appendChild(div);
  });
}

function updateHomeStats(){
  document.getElementById('homeTotalCoins').textContent = PlatformManager.getCoins();
  document.getElementById('homeBestDepth').textContent = save.stats.bestDepth||0;
  document.getElementById('homeVaults').textContent = save.stats.vaultsOpened||0;
  document.getElementById('homeCorrect').textContent = save.stats.questionsCorrect||0;
}

// Decorative background made only from Cavern Crammer's real enemy renderers.
(function homeBg(){
  const bgCanvas = document.getElementById('homeBg');
  const bgCtx = bgCanvas.getContext('2d');
  const types=['crawler','flyer','slider','lobber'];
  const colors=['#8b5fbf','#c0563f','#3f7fc0','#5fb89c'];
  const enemies=Array.from({length:18},(_,i)=>({type:types[i%types.length],hue:colors[i%colors.length],
    x:Math.random(),y:.08+Math.random()*.82,vx:(Math.random()<.5?-1:1)*(.00012+Math.random()*.00028),
    vy:(Math.random()-.5)*.00012,w:i%4===1?12:10,h:i%4===1?10:12,fireTimer:50}));
  function frame(){
    const titleScreen = document.getElementById('titleScreen');
    if(titleScreen && !titleScreen.classList.contains('hidden')){
      const w = bgCanvas.clientWidth, h = bgCanvas.clientHeight;
      if(bgCanvas.width!==w) bgCanvas.width = w;
      if(bgCanvas.height!==h) bgCanvas.height = h;
      bgCtx.clearRect(0,0,w,h);
      const gameCtx=ctx;
      ctx=bgCtx;
      enemies.forEach(en=>{
        en.x+=en.vx;en.y+=en.vy;
        if(en.x<-.05)en.x=1.05;if(en.x>1.05)en.x=-.05;
        if(en.y<.04||en.y>.96)en.vy*=-1;
        const sx=en.x*w,sy=en.y*h;
        bgCtx.save();bgCtx.globalAlpha=.62;bgCtx.scale(2,2);
        if(en.type==='flyer')drawFlyer(en,sx/2,sy/2);
        else if(en.type==='slider')drawSlider(en,sx/2,sy/2);
        else if(en.type==='lobber')drawLobber(en,sx/2,sy/2);
        else drawCrawler(en,sx/2,sy/2);
        bgCtx.restore();
      });
      ctx=gameCtx;
    }
    requestAnimationFrame(frame);
  }
  frame();
})();

function renderHardModeToggle(){
  const btn = document.getElementById('hardModeBtn');
  if(!save.hasClearedLoop){
    btn.textContent = '🔒 HARD MODE (clear a full loop to unlock)';
    btn.disabled = true;
    btn.classList.remove('secondary');
    return;
  }
  btn.disabled = false;
  btn.classList.add('secondary');
  btn.textContent = 'HARD MODE: ' + (save.hardMode ? 'ON' : 'OFF');
  btn.style.borderColor = save.hardMode ? 'var(--danger)' : '';
  btn.style.background = save.hardMode ? 'var(--danger)' : '';
}
document.getElementById('hardModeBtn').addEventListener('click', ()=>{
  if(!save.hasClearedLoop) return;
  save.hardMode = !save.hardMode; saveDirty=true; persistSave();
  renderHardModeToggle();
});

(function boot(){
  loadSave();
  renderCharGrid();
  renderHardModeToggle();
  updateHomeStats();
  requestAnimationFrame(loop);
})();

})();
