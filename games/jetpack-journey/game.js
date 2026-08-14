// Jetpack Journey Game.js
(function(){
"use strict";
// Change this value if Jetpack Journey ever supports another question type.
// All loading, storing, selecting and shuffling of cards lives in QuestionManager now.
const QUESTION_BANK_TYPE='matching';

// Identifies this game to the shared PlatformManager (shared/js/PlatformManager.js).
// Platform-wide stats (coins, question totals, sessions, high score) are keyed by this id.
const GAME_CONFIG={id:'jetpack-journey',name:'Jetpack Journey'};
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');

function resize(){
canvas.width=window.innerWidth;
canvas.height=window.innerHeight;
const hbg=document.getElementById('home-bg');
if(hbg){hbg.width=window.innerWidth;hbg.height=window.innerHeight;}
}
resize();
window.addEventListener('resize',resize);

let lastFrameTime=performance.now();
let currentDelta=16;
function getDeltaTime(){return currentDelta;}

const SCALE=0.65;
const PIXEL=Math.max(3,Math.floor(window.innerWidth/160))*SCALE;
const GRAVITY=0.285;
const PLAYER_SCALE = PIXEL * 0.35;
const FIRE_SCALE = PIXEL * 0.35;
// Collision hitbox is inset from the player's full drawn bounding box - the sprite has
// transparent margin around the actual player body, and using the full box was causing
// hits to register before the visible art actually touched anything.
function getPlayerHitbox(){
const insetX=1.2*PIXEL, insetTop=3*PIXEL, insetBottom=1.5*PIXEL;
return {
l: player.x+insetX,
r: player.x+8*PIXEL-insetX,
t: player.y+insetTop,
b: player.y+PLAYER_HEIGHT-insetBottom
};
}
const BOOST_FORCE=-6;
const GROUND_SPEED=4;
const VISUAL_SPEED=GROUND_SPEED*1.5;
const CEILING_REPEL_FORCE=0.75;
// Set this to false to hide the player's colored hitbox outline.
const DEBUG_HITBOX=false;
const STAGE_DURATION=30000;
const TRANSITION_DURATION=5000;
const SANDFLY_STRAIGHT_LINE_POINT = 0.45; // 40%

let showHome=true;
const homeScreen=document.getElementById('home-screen');
const homeStats=document.getElementById('home-stats');
const startBtn=document.getElementById('start-btn');
const codePanel=document.getElementById('code-panel');
const codeMessage=document.getElementById('code-message');
const shopBtn=document.getElementById('shop-btn');
const shopScreen=document.getElementById('shop-screen');
const shopClose=document.getElementById('shop-close');
const shopSummary=document.getElementById('shop-summary');
const shopMessage=document.getElementById('shop-message');
const shopUpgrades=document.getElementById('shop-upgrades');
const shopSingles=document.getElementById('shop-singles');
const shopToggles=document.getElementById('shop-toggles');
const shopPowerups=document.getElementById('shop-powerups');
const shopPowerupsSummary=document.getElementById('shop-powerups-summary');
const shopPlayerSkins=document.getElementById('shop-player-skins');
const shopJetpackSkins=document.getElementById('shop-jetpack-skins');
const shopFireSkins=document.getElementById('shop-fire-skins');
const memoryScreen=document.getElementById('memory-screen');
const memoryStatus=document.getElementById('memory-status');
const memoryGrid=document.getElementById('memory-grid');
const memoryFinish=document.getElementById('memory-finish');

let highScore=parseInt(localStorage.getItem('pixelJetpackHighScore'))||0;
// NOTE: the persistent coin balance is NOT stored locally — it lives in
// PlatformManager (shared/js/PlatformManager.js) as the single source of
// truth for the shared coin economy. Use PlatformManager.getCoins() /
// addCoins() / spendCoins() instead of a local field.

const SHOP_STORAGE_KEY='pixelJetpackShopState';
const DEATH_PITY_KEY='pixelJetpackDeathPity';
const SHOP_DEFAULTS={
levels:{scoreMultiplier:0,fuelEfficiency:0,coinNumbers:0,magnetTime:0,headstartBoostTime:0},
owned:{silverSpawn:false,deathCoin:false,magnet:false,startingShield:false,doubleGas:false,halfGas:false,headstartBoost:false,extraQuizAttempt:false},
toggles:{doubleGas:false,halfGas:false},
appearance:{ownedPlayerSkins:['default'],equippedPlayerSkin:'default',ownedJetpackSkins:['default'],equippedJetpackSkin:'default',ownedFireSkins:['default'],equippedFireSkin:'default'}
};
const SHOP_UPGRADES=[
{id:'scoreMultiplier',name:'Increase Score Multiplier',detail:'Score grows 0.1% faster per level.',baseCost:100,cost:function(level){return PlatformManager.permanentUpgradeCost(level);}},
{id:'fuelEfficiency',name:'Increase Fuel Efficiency',detail:'Fuel drains 10% slower per level.',baseCost:100,cost:function(level){return PlatformManager.permanentUpgradeCost(level);}},
{id:'coinNumbers',name:'Increase Coin Numbers',detail:'+1 extra coin allowed on screen per level, and coins spawn more often so that extra coin reliably shows up. Max level 15.',baseCost:100,cost:function(level){return PlatformManager.permanentUpgradeCost(level);},maxLevel:15},
{id:'magnetTime',name:'Magnet Time',detail:'Adds 1 second to magnet duration per level. Requires Magnet.',baseCost:100,cost:function(level){return PlatformManager.permanentUpgradeCost(level);},requires:'magnet'},
{id:'headstartBoostTime',name:'Headstart Boost Duration',detail:'+10% boost time and immunity time per level. Requires Headstart Boost.',baseCost:100,cost:function(level){return PlatformManager.permanentUpgradeCost(level);},requires:'headstartBoost'}
];
const SHOP_SINGLES=[
{id:'silverSpawn',name:'Silver Spawn',detail:'Unlocked silver coins have a 5% chance to replace normal coins and are worth 5 coins.',cost:100},
{id:'deathCoin',name:'Death Coin',detail:'Spawns 1 per stage. Use collected ones on the Game Over screen for a prize quiz.',cost:250},
{id:'magnet',name:'Magnet',detail:'Magnet icons can appear during a run. Collecting one starts a quiz that determines how long it lasts.',cost:100},
{id:'startingShield',name:'Starting Shield',detail:'Begin each run with a shield that blocks 1 obstacle collision.',cost:500},
{id:'headstartBoost',name:'Headstart Boost',detail:'Start each run with a quiz. Answer everything correctly for a 1s x10 speed burst and 1.5s damage immunity.',cost:300},
{id:'extraQuizAttempt',name:'Answer Buffer',detail:'Allows 1 additional wrong answer on Fuel and Magnet quizzes before they end (reward tiers adjust to match).',cost:200}
];
const SHOP_TOGGLES=[
{id:'doubleGas',name:'Double Gas',detail:'2x fuel capacity, but gravity is 2x heavier.',cost:250,exclusive:'halfGas'},
{id:'halfGas',name:'Half Gas',detail:'0.5x fuel capacity, but gravity is 0.5x lighter.',cost:250,exclusive:'doubleGas'}
];
let shopState=loadShopState();
let deathCoinPity=parseInt(localStorage.getItem(DEATH_PITY_KEY))||0;
let totalDeathCount=parseInt(localStorage.getItem('pixelJetpackDeathCount'))||0;
let gameOverUIReady=true;
let lastRunWasNewHigh=false;
let lastDeathCause='';
const DEATH_CAUSE_MESSAGES={
'ceiling':{label:'flew into the ceiling',tip:'Ease off the boost near the top of the screen — tap in short bursts instead of holding it.'},
'ground':{label:'crashed into the ground',tip:'Give yourself more breathing room above obstacles before you stop boosting.'},
'cave-ceiling':{label:'hit the cave roof',tip:'Cave sections are tighter — keep your taps light and frequent to stay centered.'},
'cave-floor':{label:'hit the cave floor',tip:'Cave sections are tighter — keep your taps light and frequent to stay centered.'},
'obstacle':{label:'hit an obstacle',tip:'Watch the gaps ahead and start adjusting your height early, not at the last second.'},
'desert':{label:'was taken down by a desert hazard',tip:'Sandflies and floating eyes dart around — give them extra clearance rather than skimming past.'},
'space':{label:'was hit in the space biome',tip:'Meteors, UFOs, and alien bolts come from multiple angles — keep scanning the whole screen, not just ahead.'},
'horror':{label:'was caught by something in the dark',tip:'Ghosts and horror eyes can be hard to see — slow down and react earlier when shapes appear.'},
'snow':{label:'was caught in the snowstorm',tip:'Bats and snow hazards are fast — prioritize dodging over collecting fuel cans in this biome.'}
};
function buildDeathMessage(){
const info=DEATH_CAUSE_MESSAGES[lastDeathCause];
if(!info)return '';
return 'You '+info.label+'. '+info.tip;
}
let runElapsedMs=0;
let totalQuestionsCorrect=parseInt(localStorage.getItem('pixelJetpackQuestionsCorrect'))||0;
let announcedPowerupUnlocks=JSON.parse(localStorage.getItem('pixelJetpackAnnouncedPowerups')||'[]');
let powerupUnlockAlert='';
let selectedPowerups=PlatformManager.powerupsAllowed()?JSON.parse(localStorage.getItem('pixelJetpackSelectedPowerups')||'[]'):[];
let activePowerupEffects={};
let powerupQuizQueue=[];
let powerupQuizActive=null;
const POWERUP_DEFS=[
{id:'highscore',unlockAt:40,name:'Lucky Charm',detail:'Pre-run bonus quiz (4 questions). The more you get right, the bigger the boost to your score this run.'},
{id:'stageBonus',unlockAt:80,name:'Stage Clear Bonus',detail:'Pre-run bonus quiz (4 questions). The more you get right, the bigger the coin + score bonus every time you reach a new stage this run.'},
{id:'coinValue',unlockAt:120,name:'Golden Touch',detail:'Pre-run bonus quiz (4 questions). The more you get right, the more every coin is worth this run.'},
{id:'enemyDensity',unlockAt:160,name:'Overdrive',detail:'Pre-run bonus quiz (4 questions). The more you get right, the more enemies spawn this run - but coins and score pay out more too.'}
];
function getUnlockedPowerups(){return PlatformManager.powerupsAllowed()?POWERUP_DEFS.filter(function(p){return totalQuestionsCorrect>=p.unlockAt;}):[];}
function getAllowedPowerupSelections(){return 1+Math.floor(totalQuestionsCorrect/100);}
function saveSelectedPowerups(){localStorage.setItem('pixelJetpackSelectedPowerups',JSON.stringify(selectedPowerups));}
function togglePowerupSelection(id){
const idx=selectedPowerups.indexOf(id);
if(idx!==-1){selectedPowerups.splice(idx,1);}
else{
if(selectedPowerups.length>=getAllowedPowerupSelections())return;
selectedPowerups.push(id);
}
saveSelectedPowerups();
}
function recordQuestionCorrect(){
totalQuestionsCorrect++;
localStorage.setItem('pixelJetpackQuestionsCorrect',totalQuestionsCorrect);
}
let shopMessageTimer=0;
let secretJetCharacter=localStorage.getItem('jetpackSecretCharacter')||'pilot';
function setSecretJetCharacter(id){secretJetCharacter=id;localStorage.setItem('jetpackSecretCharacter',id);renderShop();}
function isJetCharacter(id){return secretJetCharacter===id;}

// --- Appearance (cosmetic only, zero gameplay effect): player/jetpack skins recolor the exact
// same detailed base sprite (guaranteeing identical size/shape), and fire effects swap the trail
// visual entirely. Cost roughly doubles each tier so the last one is the priciest.
const DEFAULT_PLAYER_CMAP={'p':'#674ea7','a':'#c68642','u':'#741b47','x':'#c27ba0','w':'#ffffff'};
const PLAYER_SKINS=[
{id:'caveman',name:'Caveman',stage:'Dinosaur Stage',cost:200,cmap:{'p':'#8b5a2b','a':'#c68642','u':'#4a2f18','x':'#2a1f14','w':'#ffffff'}},
{id:'desertwarrior',name:'Desert Warrior',stage:'Desert Stage',cost:500,cmap:{'p':'#c9a86a','a':'#b8794a','u':'#8a6435','x':'#e8d0a0','w':'#ffffff'}},
{id:'alien',name:'Alien',stage:'Space Stage',cost:1200,cmap:{'p':'#4dd68c','a':'#7fe0a0','u':'#1f6b3a','x':'#111111','w':'#111111'}},
{id:'vampire',name:'Vampire',stage:'Horror Stage',cost:2800,cmap:{'p':'#3a0d0d','a':'#e0c8d8','u':'#1a0505','x':'#0a0a0a','w':'#ff2222'}},
{id:'snowman',name:'Abominable Snowman',stage:'Snow Cave Stage',cost:6500,cmap:{'p':'#f0f0f0','a':'#c9a876','u':'#a8b8c0','x':'#e8e8e8','w':'#000000'}},
{id:'wizard',name:'Rainbow Wizard',stage:'Rainbow Madness Stage',cost:15000,cmap:null}
];
const DEFAULT_JETPACK_CMAP={'y':'#cccccc','b':'#000000','g':'#1a6b2e','i':'#fff2a0','t':'#4a4a33'};
const JETPACK_SKINS=[
{id:'caveman',name:'Bone & Hide Pack',stage:'Dinosaur Stage',cost:200,cmap:{'y':'#c9a876','b':'#2a1f14','g':'#4a2f18','i':'#e8d8b8','t':'#3a2818'}},
{id:'desertwarrior',name:'Desert Rig',stage:'Desert Stage',cost:500,cmap:{'y':'#c9a86a','b':'#3a2a1a','g':'#6b4423','i':'#e8d0a0','t':'#8a6435'}},
{id:'alien',name:'Alien Thruster',stage:'Space Stage',cost:1200,cmap:{'y':'#66ffcc','b':'#111111','g':'#1f6b3a','i':'#ccffee','t':'#0a3a2a'}},
{id:'vampire',name:'Bat-Wing Pack',stage:'Horror Stage',cost:2800,cmap:{'y':'#3a0d0d','b':'#000000','g':'#1a0505','i':'#661111','t':'#0a0a0a'}},
{id:'snowman',name:'Frost Pack',stage:'Snow Cave Stage',cost:6500,cmap:{'y':'#cfe8f5','b':'#1a2a3a','g':'#4a6a8a','i':'#ffffff','t':'#7a9ab0'}},
{id:'wizard',name:'Rainbow Pack',stage:'Rainbow Madness Stage',cost:15000,cmap:null}
];
const FIRE_SKINS=[
{id:'caveman',name:'Campfire Smoke',stage:'Dinosaur Stage',cost:200},
{id:'desertwarrior',name:'Sand Trail',stage:'Desert Stage',cost:500},
{id:'alien',name:'Laser Thrust',stage:'Space Stage',cost:1200},
{id:'vampire',name:'Bat Swarm',stage:'Horror Stage',cost:2800},
{id:'snowman',name:'Snow Trail',stage:'Snow Cave Stage',cost:6500},
{id:'wizard',name:'Rainbow Flame',stage:'Rainbow Madness Stage',cost:15000}
];
function sharedJetpackReward(slot){
if(typeof AchievementManager==='undefined')return null;
return AchievementManager.getEquipped('jetpack-journey')[slot]||null;
}
function getActivePlayerColorMap(){
const shared=sharedJetpackReward('skin');
if(shared?.id==='jetpack-journey_vampire_flyer')return PLAYER_SKINS.find(function(s){return s.id==='vampire';}).cmap;
if(shared?.id==='jetpack-journey_alien_flyer')return PLAYER_SKINS.find(function(s){return s.id==='alien';}).cmap;
if(shared?.id==='jetpack-journey_time_traveller_outfit')return{'p':'#24364b','a':'#d9b08c','u':'#8f5d2d','x':'#e9c46a','w':'#8ff6ff'};
if(shared?.id==='jetpack-journey_temporal_ace')return{'p':'#6b3f22','a':'#d9b08c','u':'#d59b3d','x':'#80ecff','w':'#fff6cf'};
return DEFAULT_PLAYER_CMAP;
}
function getActiveJetpackColorMap(){
const shared=sharedJetpackReward('skin');
if(shared?.id==='jetpack-journey_vampire_flyer')return JETPACK_SKINS.find(function(s){return s.id==='vampire';}).cmap;
if(shared?.id==='jetpack-journey_alien_flyer')return JETPACK_SKINS.find(function(s){return s.id==='alien';}).cmap;
if(shared?.id==='jetpack-journey_time_traveller_outfit')return{'y':'#d6a94f','b':'#151c26','g':'#38576d','i':'#8ff6ff','t':'#73451f'};
if(shared?.id==='jetpack-journey_temporal_ace')return{'y':'#d59b3d','b':'#2c1b12','g':'#6b3f22','i':'#aaf7ff','t':'#ad7934'};
return DEFAULT_JETPACK_CMAP;
}
const FIRE_SKIN_COLOR_MAPS={
'caveman':{'d':'#5a5a5a','l':'#c8c8c8','r':'#8a8a8a','w':'#f0f0f0','y':'#aaaaaa','b':'#1a1a1a','q':'#e8e8e8'},
'desertwarrior':{'d':'#a8802a','l':'#f0d080','r':'#c9a04a','w':'#fff2cc','y':'#e0b860','b':'#5a3d10','q':'#ffe8a0'},
'alien':{'d':'#0a5a44','l':'#66ffcc','r':'#1f9c72','w':'#e8fff5','y':'#8fe0c0','b':'#062a20','q':'#aaffe0'},
'vampire':{'d':'#3a0d0d','l':'#8a1020','r':'#661515','w':'#e0c8d0','y':'#4a1818','b':'#0a0505','q':'#ff2244'},
'snowman':{'d':'#8fb8d8','l':'#ffffff','r':'#bcd8ee','w':'#ffffff','y':'#dceeff','b':'#4a6a8a','q':'#e8f6ff'}
};
function drawFireEffect(fx,fy){
const sharedTrail=sharedJetpackReward('trail');
const sharedBoost=sharedJetpackReward('boostEffect');
const sharedSkin=sharedJetpackReward('skin');
const fireFrames=[fireFrame1,fireFrame2,fireFrame3,fireFrame4];
const frame=fireFrames[Math.max(0,player.fireFrame-1)];
if(sharedTrail?.id==='jetpack-journey_note_knowledge_flight'){
ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';for(let i=0;i<4;i++){const age=(performance.now()/7+i*29)%110;ctx.globalAlpha=1-age/120;ctx.font=`bold ${12+i*2}px sans-serif`;ctx.fillStyle=hslToHex((rainbowHue+i*78)%360,85,62);ctx.fillText(i%2?'♪':'♫',fx-age*.52,fy+9+Math.sin(age*.12+i)*12);}ctx.restore();
}else if(sharedSkin?.id==='jetpack-journey_vampire_flyer'){
drawPixelArt(frame,fx,fy,FIRE_SCALE,FIRE_SKIN_COLOR_MAPS.vampire);
}else if(sharedSkin?.id==='jetpack-journey_alien_flyer'){
drawPixelArt(frame,fx,fy,FIRE_SCALE,FIRE_SKIN_COLOR_MAPS.alien);
}else if(sharedSkin?.id==='jetpack-journey_time_traveller_outfit'){
ctx.save();ctx.translate(fx+4,fy+12);ctx.strokeStyle='#8ff6ff';ctx.lineWidth=2;ctx.globalAlpha=.8;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(-i*8,0,5+i*2,0,Math.PI*2);ctx.stroke();}ctx.fillStyle='#e9c46a';ctx.fillRect(-2,-2,4,4);ctx.restore();
}else if(sharedSkin?.id==='jetpack-journey_temporal_ace'){
drawPixelArt(frame,fx,fy,FIRE_SCALE,{'d':'#6b3f22','l':'#ffd15c','r':'#bd7b2d','w':'#fff6cf','y':'#7eeeff','b':'#21130c','q':'#bffaff'});
}else{
drawPixelArt(frame,fx,fy,FIRE_SCALE);
}
if(sharedBoost?.id==='jetpack-journey_pixel_ring_boost'){
ctx.save();ctx.strokeStyle=player.fireFrame%2?'#00d4ff':'#ff6ec7';ctx.lineWidth=2;ctx.globalAlpha=.75;ctx.beginPath();ctx.arc(fx+6,fy+18,10+player.fireFrame*4,0,Math.PI*2);ctx.stroke();ctx.restore();
}
}

function loadShopState(){
try{
const saved=JSON.parse(localStorage.getItem(SHOP_STORAGE_KEY)||'{}');
return {
levels:Object.assign({},SHOP_DEFAULTS.levels,saved.levels||{}),
owned:Object.assign({},SHOP_DEFAULTS.owned,saved.owned||{}),
toggles:Object.assign({},SHOP_DEFAULTS.toggles,saved.toggles||{}),
appearance:Object.assign({},SHOP_DEFAULTS.appearance,saved.appearance||{})
};
}catch(err){
return JSON.parse(JSON.stringify(SHOP_DEFAULTS));
}
}
function saveShopState(){localStorage.setItem(SHOP_STORAGE_KEY,JSON.stringify(shopState));}
function getUpgradePurchaseCount(){
let total=0;
Object.keys(shopState.levels).forEach(function(k){total+=shopState.levels[k]||0;});
Object.keys(shopState.owned).forEach(function(k){if(shopState.owned[k])total++;});
return total;
}
// Difficulty scaling: every upgrade purchased (levels + single purchases) makes enemies faster.
// Reduced to 25% of its original strength (0.01 -> 0.0025 per upgrade) so the effect is much less noticeable.
// This is intentionally not shown anywhere in the UI.
function getEnemySpeedMult(){return 1+(getUpgradePurchaseCount()||0)*0.0025;}
// Temporary full-run speed burst used by the Headstart Boost single purchase (see below).
let headstartBoostTimer=0;
function getWorldSpeedMult(){return headstartBoostTimer>0?10:1;}
// Combined multiplier for things that read GROUND_SPEED directly every frame.
function getMovementMult(){return getEnemySpeedMult()*getWorldSpeedMult();}
// Difficulty scaling based on run progress: how much to multiply the base spawn *interval* by
// (bigger number = slower spawning, smaller number = faster spawning). It halves every 30 seconds
// of run time: 4x interval (slow) at 0s, 2x at 30s, 1x (original base rate) at 60s, 0.5x (fastest,
// capped) at 90s and beyond - so it never spirals into chaos past that point.
function getScoreIntervalMult(){
const elapsedSeconds=score/1000;
const cappedSeconds=Math.min(elapsedSeconds,90);
return 4*Math.pow(0.5,cappedSeconds/30);
}
function getPowerupSpawnRateMult(){
const overdriveRateMult=activePowerupEffects.enemyDensity?1+0.3*activePowerupEffects.enemyDensity.correct:1;
return overdriveRateMult/getScoreIntervalMult();
}
function getScoreMultiplier(){
let m=1+(shopState.levels.scoreMultiplier||0)*0.001;
if(activePowerupEffects.enemyDensity)m*=(1+0.25*activePowerupEffects.enemyDensity.correct);
return m;
}
function getFuelDrainCost(){const earnedEfficiency=(typeof AchievementManager!=='undefined'&&AchievementManager.hasBoost('jetpack-journey_efficient_ignition'))?0.9:1;const skeletonEfficiency=isJetCharacter('skeleton')?0.5:1;return BOOST_FUEL_COST*Math.pow(0.9,shopState.levels.fuelEfficiency||0)*earnedEfficiency*skeletonEfficiency;}
function getGasMode(){
if(shopState.owned.doubleGas&&shopState.toggles.doubleGas)return 'double';
if(shopState.owned.halfGas&&shopState.toggles.halfGas)return 'half';
return 'normal';
}
function getFuelCapacity(){
const mode=getGasMode();
if(mode==='double')return MAX_FUEL*2;
if(mode==='half')return MAX_FUEL*0.5;
return MAX_FUEL;
}
function getGravity(){
if(isJetCharacter('chimera'))return GRAVITY*(.35+1.25*(.5+.5*Math.sin(performance.now()/900)));
const mode=getGasMode();
if(mode==='double')return GRAVITY*2;
if(mode==='half')return GRAVITY*0.5;
return GRAVITY;
}
function getMaxCoinsOnScreen(){return 3+(shopState.levels.coinNumbers||0);}
function getRegularCoinValue(){
let v=isRainbowMadness()?5:1;
if(activePowerupEffects.coinValue)v=1+0.5*activePowerupEffects.coinValue.correct;
if(activePowerupEffects.enemyDensity)v+=activePowerupEffects.enemyDensity.correct;
return v;
}
function getSilverCoinValue(){return getRegularCoinValue()*5;}
function getMagnetDuration(){return 5000+(shopState.levels.magnetTime||0)*1000;}
function getHeadstartBoostMult(){return 1+(shopState.levels.headstartBoostTime||0)*0.1;}
function getHeadstartBoostDuration(){return 1000*getHeadstartBoostMult();}
function getHeadstartImmunityDuration(){return 1500*getHeadstartBoostMult();}
function getQuizFullAward(kind){
if(kind==='fuel')return 40;
if(kind==='magnet')return getMagnetDuration();
return 0;
}
function getQuizWrongCap(){return shopState.owned.extraQuizAttempt?3:2;}
function getQuizTierReward(kind,wrongCount){
const full=getQuizFullAward(kind);
const cap=getQuizWrongCap();
const tiers=cap>=3?[1,0.65,0.4,0.2]:[1,0.5,0.25];
const idx=Math.min(wrongCount,tiers.length-1);
return full*tiers[idx];
}
function setShopMessage(text,isError){
shopMessage.textContent=text;
shopMessage.style.color=isError?'#ff7777':'#ffdd00';
shopMessageTimer=180;
}
function makeShopItem(name,detail,buttonText,disabled,onClick){
const item=document.createElement('div');item.className='shop-item';
const info=document.createElement('div');
const title=document.createElement('div');title.className='shop-name';title.textContent=name;
const desc=document.createElement('div');desc.className='shop-detail';desc.textContent=detail;
info.appendChild(title);info.appendChild(desc);
const btn=document.createElement('button');btn.type='button';btn.className='shop-buy btn';btn.textContent=buttonText;btn.disabled=disabled;
btn.addEventListener('click',function(e){e.stopPropagation();onClick();});
item.appendChild(info);item.appendChild(btn);
return item;
}
function makeAppearanceShopItem(name,detail,previewFn,buttonText,disabled,onClick){
const item=document.createElement('div');item.className='shop-item';
const wrap=document.createElement('div');wrap.className='shop-item-with-preview';
const canvas=document.createElement('canvas');canvas.width=50;canvas.height=70;canvas.className='shop-preview-canvas';
previewFn(canvas.getContext('2d'),canvas.width,canvas.height);
const textWrap=document.createElement('div');
const title=document.createElement('div');title.className='shop-name';title.textContent=name;
const desc=document.createElement('div');desc.className='shop-detail';desc.textContent=detail;
textWrap.appendChild(title);textWrap.appendChild(desc);
wrap.appendChild(canvas);wrap.appendChild(textWrap);
const btn=document.createElement('button');btn.type='button';btn.className='shop-buy btn';btn.textContent=buttonText;btn.disabled=disabled;
btn.addEventListener('click',function(e){e.stopPropagation();onClick();});
item.appendChild(wrap);item.appendChild(btn);
return item;
}
function drawFirePreview(pctx,w,h,skinId){
const cx=w/2,cy=h/2;
if(skinId==='wizard'){
drawPixelArtCtx(pctx,fireFrame2,cx-8,cy-13,2,{'d':'#ff4444','l':'#ffee44','r':'#4488ff','w':'#ffffff','y':'#cccccc','b':'#000000','q':'#44ffcc'});
}else if(skinId&&FIRE_SKIN_COLOR_MAPS[skinId]){
drawPixelArtCtx(pctx,fireFrame2,cx-8,cy-13,2,FIRE_SKIN_COLOR_MAPS[skinId]);
}else{
drawPixelArtCtx(pctx,fireFrame2,cx-8,cy-13,2,colorMap);
}
}
function renderSkinShopSection(container,skinsList,defaultName,ownedField,equippedField,previewFn){
container.innerHTML='';
const appearance=shopState.appearance;
const defaultEquipped=appearance[equippedField]==='default';
container.appendChild(makeAppearanceShopItem(defaultName,'The original look. Always available, no cost.',function(pctx,w,h){previewFn(pctx,w,h,null);},defaultEquipped?'EQUIPPED':'EQUIP',defaultEquipped,function(){
appearance[equippedField]='default';saveShopState();renderShop();
}));
skinsList.forEach(function(skin){
const owned=appearance[ownedField].indexOf(skin.id)!==-1;
const equipped=appearance[equippedField]===skin.id;
const label=!owned?(skin.cost+' COINS'):(equipped?'EQUIPPED':'EQUIP');
container.appendChild(makeAppearanceShopItem(skin.name+' ('+skin.stage+')','Cosmetic only - no effect on gameplay.',function(pctx,w,h){previewFn(pctx,w,h,skin.id);},label,!owned&&PlatformManager.getCoins()<skin.cost,function(){
if(!owned){
if(!spendCoins(skin.cost)){setShopMessage('Not enough coins.',true);return;}
appearance[ownedField].push(skin.id);
}
appearance[equippedField]=skin.id;
saveShopState();setShopMessage(skin.name+' equipped!',false);renderShop();
}));
});
}
function renderAppearanceShop(){
// Legacy coin-purchased appearances are intentionally hidden. Earned level
// cosmetics are rendered by AchievementManager in the Level Rewards section.
shopPlayerSkins.innerHTML='';shopJetpackSkins.innerHTML='';shopFireSkins.innerHTML='';
}
function spendCoins(cost){
return PlatformManager.spendCoins(cost);
}
function renderShop(){
shopSummary.innerHTML='COINS: '+PlatformManager.getCoins()+'<br>UPGRADES PURCHASED: '+getUpgradePurchaseCount();
shopUpgrades.innerHTML='';shopSingles.innerHTML='';shopToggles.innerHTML='';
const secretCharacters=[['pilot','Academy Pilot','Standard flight controls.'],...(typeof AchievementManager!=='undefined'&&AchievementManager.hasSecret?.('secret_skeleton')?[['skeleton','Skeleton Flyer','Half fuel drain, bone exhaust and more Horror stages.']]:[]),...(typeof AchievementManager!=='undefined'&&AchievementManager.hasSecret?.('secret_glitch_aura')?[['chimera','Gravity Chimera','Gravity changes rhythmically and fuel regenerates while gliding.']]:[])];
if(secretCharacters.length>1){for(const c of secretCharacters)shopUpgrades.appendChild(makeShopItem(c[1],c[2],isJetCharacter(c[0])?'SELECTED':'CHOOSE',isJetCharacter(c[0]),()=>setSecretJetCharacter(c[0])));}
SHOP_UPGRADES.forEach(function(up){
const level=shopState.levels[up.id]||0;
const atMax=up.maxLevel!==undefined&&level>=up.maxLevel;
const locked=up.requires&&!shopState.owned[up.requires];
const cost=up.cost(level);
const label=atMax?'MAX LEVEL':(locked?'LOCKED':cost+' COINS');
shopUpgrades.appendChild(makeShopItem(up.name+' | LVL '+level+(up.maxLevel!==undefined?' / '+up.maxLevel:''),up.detail,label,atMax||locked||PlatformManager.getCoins()<cost,function(){
if(atMax)return;
if(locked){setShopMessage('Unlock Magnet first.',true);return;}
if(!spendCoins(cost)){setShopMessage('Not enough coins.',true);return;}
shopState.levels[up.id]=level+1;saveShopState();setShopMessage('Upgrade purchased.',false);renderShop();updateHomeStats();
}));
});
SHOP_SINGLES.forEach(function(item){
const owned=shopState.owned[item.id];
shopSingles.appendChild(makeShopItem(item.name, item.detail, owned?'OWNED':item.cost+' COINS', owned||PlatformManager.getCoins()<item.cost, function(){
if(!spendCoins(item.cost)){setShopMessage('Not enough coins.',true);return;}
shopState.owned[item.id]=true;saveShopState();setShopMessage(item.name+' unlocked.',false);renderShop();updateHomeStats();
}));
});
SHOP_TOGGLES.forEach(function(item){
const owned=shopState.owned[item.id], active=shopState.toggles[item.id];
const label=owned?(active?'ON':'OFF'):(item.cost+' COINS');
shopToggles.appendChild(makeShopItem(item.name,item.detail,label,!owned&&PlatformManager.getCoins()<item.cost,function(){
if(!owned){
if(!spendCoins(item.cost)){setShopMessage('Not enough coins.',true);return;}
shopState.owned[item.id]=true;
}
shopState.toggles[item.id]=!shopState.toggles[item.id];
if(item.exclusive&&shopState.toggles[item.id])shopState.toggles[item.exclusive]=false;
saveShopState();setShopMessage(item.name+(shopState.toggles[item.id]?' enabled.':' disabled.'),false);renderShop();updateHomeStats();
}));
});
renderPowerupsShop();
renderAppearanceShop();
applyShopTabVisibility();
}
let activeShopTab='upgrades';
function switchShopTab(tab){
activeShopTab=tab;
applyShopTabVisibility();
}
function applyShopTabVisibility(){
document.querySelectorAll('.shop-tab-btn').forEach(function(btn){
btn.classList.toggle('active',btn.getAttribute('data-tab')===activeShopTab);
});
document.querySelectorAll('.shop-tab-panel').forEach(function(panel){
panel.classList.toggle('active',panel.getAttribute('data-tab')===activeShopTab);
});
}
function openShop(){
renderShop();shopScreen.style.display='flex';
}
function closeShop(){shopScreen.style.display='none';}
function renderPowerupsShop(){
shopPowerups.innerHTML='';
const unlocked=getUnlockedPowerups();
const allowed=getAllowedPowerupSelections();
const nextUnlock=POWERUP_DEFS.find(function(p){return totalQuestionsCorrect<p.unlockAt;});
let summary='Questions answered correctly (lifetime): '+totalQuestionsCorrect+'<br>Selected: '+selectedPowerups.length+' / '+allowed+' allowed';
if(nextUnlock)summary+='<br>Next powerup unlocks at '+nextUnlock.unlockAt+' correct.';
shopPowerupsSummary.innerHTML=summary;
POWERUP_DEFS.forEach(function(def){
const isUnlocked=totalQuestionsCorrect>=def.unlockAt;
const isSelected=selectedPowerups.indexOf(def.id)!==-1;
let badge;
if(!isUnlocked)badge='LOCKED ('+def.unlockAt+' CORRECT)';
else badge=isSelected?'SELECTED':'SELECT';
const disabled=!isUnlocked||(!isSelected&&selectedPowerups.length>=allowed);
shopPowerups.appendChild(makeShopItem(def.name,def.detail,badge,disabled&&!isSelected,function(){
if(!isUnlocked)return;
togglePowerupSelection(def.id);
renderShop();
}));
});
}

let sessionLoading=false;

// Stage identities. 5 = Rainbow Madness, a bonus stage outside the normal rotation.
const BASE_STAGE_ORDER=[0,1,3,4]; // Dinosaur -> Desert -> Horror -> Snow -> repeat
const ALL_REAL_STAGES=[0,1,2,3,4,6]; // every normal/secret stage used by wildcard jumps
let currentStageId=0;
let nextStageId=null;
let lastStageBoundaryCount=0;
let baseProgressIndex=0;
let forceRainbowNextRun=false;
// Any future stage just needs to be added to ALL_REAL_STAGES (and BASE_STAGE_ORDER if it
// should be part of the normal rotation) to be picked up by this system automatically.
function resolveNextStage(){
if(forceRainbowNextRun){forceRainbowNextRun=false;return 5;}
if(typeof AchievementManager!=='undefined'&&AchievementManager.hasSecret?.('secret_map_border')&&rng()<0.10)return 6;
if(isJetCharacter('skeleton')&&rng()<0.10)return 3;
if(rng()<0.02)return 5; // Rainbow Madness: 2% chance to appear instead of the next stage.
if(rng()<0.05)return ALL_REAL_STAGES[Math.floor(rng()*ALL_REAL_STAGES.length)]; // 5% wildcard
baseProgressIndex++;
return BASE_STAGE_ORDER[baseProgressIndex%BASE_STAGE_ORDER.length];
}
function updatePixelHud(){
const l=document.getElementById('hud-left'),r=document.getElementById('hud-right');
if(l.style.display==='none'){l.style.display='flex';r.style.display='flex';}
document.getElementById('hud-stage').textContent=getStageName();
document.getElementById('hud-score').textContent=Math.floor(score);
document.getElementById('hud-coins').textContent=Math.floor(PlatformManager.getCoins());
document.getElementById('hud-time').textContent=formatRunTime(runElapsedMs);
const shieldRow=document.getElementById('hud-shield-row');
if(shieldCharges>0){shieldRow.style.display='flex';document.getElementById('hud-shield').textContent=shieldCharges;}
else shieldRow.style.display='none';
const magnetRow=document.getElementById('hud-magnet-row');
if(magnetActiveTimer>0){magnetRow.style.display='flex';document.getElementById('hud-magnet').textContent=Math.ceil(magnetActiveTimer/1000)+'s';}
else magnetRow.style.display='none';
}
function hidePixelHud(){
const l=document.getElementById('hud-left'),r=document.getElementById('hud-right');
if(l.style.display!=='none'){l.style.display='none';r.style.display='none';}
}
function drawHudLabel(text,x,y,align,color,fontSize){
ctx.font='700 '+fontSize+'px "Lexend", sans-serif';
ctx.textAlign=align;
const w=ctx.measureText(text).width;
const pad=6;
let boxX;
if(align==='left')boxX=x-pad;
else if(align==='right')boxX=x-w-pad;
else boxX=x-w/2-pad;
ctx.fillStyle='rgba(0,0,0,0.25)';
ctx.fillRect(boxX,y-pad*0.5,w+pad*2,fontSize+pad);
ctx.fillStyle=color;
ctx.fillText(text,x,y);
}
function getStageName(idx){
if(idx===undefined)idx=getCurrentStageIndex();
return idx===0?'Dinosaur':idx===1?'Desert':idx===2?'Space':idx===3?'Horror':idx===4?'Snow Cave':idx===6?'Lost Archive':'Rainbow Madness';
}
function formatRunTime(ms){
const totalSec=Math.floor(Math.max(0,ms)/1000);
const m=Math.floor(totalSec/60),s=totalSec%60;
return m+':'+String(s).padStart(2,'0');
}
function getCurrentStageIndex(){
return currentStageId;
}
function isDesert(){return getCurrentStageIndex()===1;}
function isSpace(){return getCurrentStageIndex()===2;}
function isHorror(){return getCurrentStageIndex()===3;}
function isSnow(){return getCurrentStageIndex()===4;}
function isRainbowMadness(){return getCurrentStageIndex()===5;}
function isLostArchive(){return getCurrentStageIndex()===6;}
function getTransitionInfo(){
const t=score-lastStageBoundaryCount*STAGE_DURATION;
if(t>=STAGE_DURATION-TRANSITION_DURATION){
const alpha=(t-(STAGE_DURATION-TRANSITION_DURATION))/TRANSITION_DURATION;
const to=nextStageId!==null?nextStageId:currentStageId;
return{transitioning:true,alpha,from:currentStageId,to:to};
}
return{transitioning:false,alpha:0,from:currentStageId,to:currentStageId};
}

function checkStageChange(){
const boundaryCount=Math.floor(score/STAGE_DURATION);
const t=score-boundaryCount*STAGE_DURATION;
if(boundaryCount===lastStageBoundaryCount&&t>=STAGE_DURATION-TRANSITION_DURATION&&nextStageId===null){
nextStageId=resolveNextStage();
}
if(boundaryCount!==lastStageBoundaryCount){
lastStageBoundaryCount=boundaryCount;
currentStageId=nextStageId!==null?nextStageId:resolveNextStage();
nextStageId=null;
// Any obstacles still on screen from the previous stage are left alone here - they keep
// scrolling and get cleaned up naturally once off-screen (see updateObstacles). Only new
// spawning of that stage's obstacles is what actually stops.
if(activePowerupEffects.stageBonus){
const c=activePowerupEffects.stageBonus.correct;
addCoins(25*c);
score+=200*c;
}
}
}

// Pixel art data
const playerData1=["..x.................","..x....uuuuuu.......","..x...uppppppu......","...x.uppuuuuuuu.....","...x.uppuuuuuuuu....","...xupppuaaauuuu....","...xuppuaaaaa...u...","...xxpuaaaaaa...u...","..xxxxuaauuaa...u...","..xxxxuaawuua...u...","..xxxxuaawuaa...u...","...xxpuaaaaaaa..u...","....upuaaaaaa..u....","....uppuaaaaa..u....",".....ppuaaaaa..u....",".....upuaaaaa.u.....",".....upuuuuuuu......","....uuppppppu.......","...uppuuuuuuu.......","..uppppupppupu......","..upppppuppuppu.....","..uppppupppuppu.....",".uppppuuuuupppuu..aa",".uppppupppuppuppuaaa",".uppppppppupppppuaaa",".upppppppuaappppuaaa",".uppppppuaaappppuaaa","..uuupppuaaauuuu.aaa","..uppuuuuaaaau.......","...uppppaaapu.......","...uxxxxxxxxu.......","...uxxxxxxxxxu......","...uxxxxxxxxxu......","....upppppppppu.....","....uppppppppppu.....","...uuppppppppppu....","...uppppppppppppu...","...upppppuppppppu...","...upppppuuppppppu..","..uppppppu.upppppu...",".uupppppu...upppppu..",".uppppppu..upppppu...","uupppppuu..upppu....","upppppppu..uppppu....","uuuuppppu...upppu.....","uuuuupu...uuppu......","uuuuuu....uuupu......","uuuu....uuuuuu.......",".uuu....uuuuu.......",".uuu....uuuuu.......","..uu.....uuuu.......","...........uu.......","............u......."];
const playerData2=["....x...............","....x..uuuuuu.......","....x.uppppppu......","...x.uppuuuuuuu.....","...x.uppuuuuuuuu....","...xupppuaaauuuu....","...xuppuaaaaa...u...","...xxpuaaaaaa...u...","..xxxxuaauuaa...u...","..xxxxuaawuua...u...","..xxxxuaawuaa...u...","...xxpuaaaaaaa..u...","....upuaaaaaa..u....","....uppuaaaaa..u....",".....ppuaaaaa..u....",".....upuaaaaa.u.....",".....upuuuuuuu......","....uuppppppu.......","....upuuuuuuu.......","...upppupppupu......","..upppppuppupuu.....","..uppppupppuppu.....",".uppppuuuuupppuu....",".uppppupppuppupu..aa",".uppppppppupppppuaaa",".upppppppuaappppuaaa",".uppppppuaaappppuaaa",".uuuppppuaaappppuaaa","..uuuuuuuaaaauuuu.aaa","...uppppaaapu.......","...uxxxxxxxxu.......","...uxxxxxxxxxu......","...uxxxxxxxxxu......","....upppppppppu.....","....uppppppppppu.....","....uppppppppppu....","....upppppppppppu...","....upppppppppppu...","....upppppuppppppu..","...upppppu.upppppu...","..uupppppu..upppppu..","..uppppppu.upppppu...",".uupppppuu.upppu....",".uuppppppu.uppppu....",".uuuppppu...upppu.....",".uuuupu...uuppu......",".uuuuu....uuupu......",".uuu....uuuuuu.......","..uu....uuuuu.......","..uu....uuuuu.......","..uu.....uuuu.......","...........uu.......","............u......."];
// The visible player sprite is rendered at PLAYER_SCALE per pixel-art row, so its true on-screen
// height is (row count * PLAYER_SCALE), not a hand-picked guess - collision hitboxes were previously
// using a flat 24*PIXEL constant that didn't match this, so ground/enemy hits landed well below the
// visible sprite. Deriving it from the actual art keeps hitboxes lined up with what's drawn.
const PLAYER_HEIGHT=playerData1.length*PLAYER_SCALE;
const jetpackData=["......iyyyyy",".....iyyyyyy","....iyyyyyyt","..iyyyyyyyyt","biyyyyyyyyyt","bgggiyyyyyyt","bgggiyyyyyyt","bgggiyyyyyyt","bgggiyyyyyyt","bgggiyyyyyyt","bgggiyyyyyyt","bgggiyyyyyyt","bgggiyyyyyyt","bgggiyyyyyyt","biyyyyyyyyyt","..iyyyyyyyyt","....iyyyyyyt",".....iyyyyyt",".....iyyyyyt","......iyyyyt"];
const fuelCanData=["....bbbbbbbb.....bbb","...brrrrrrrrb...bbwb","..brrrrrrrrrrb.bybbb",".brrrbbbbbbbrrbyyyb.","brrrrb.....brrrbyb..","brrrrrbbbbbrrrrrb...","brrrrrrrrrrrrrrrrbb.","brbbbrbrrbrbbbrbrrb.","brbrrrbrrbrrrrrbrrb.","brbbrrbrrbrbbrrbrrb.","brbrrrbrrbrbrrrbrrb.","brbrrrbbbbrbbbrbbrb.","brrrrrrrrrrrrrrrrrb.","brurrrrrrrrrrrrrurb.","brrurrrrrrrrrrrurrb.","brrrurrrrrrrrrurrrbb.","brrrruuuuuuuuurrrrb.","brrrurrrrrrrrrurrrb.","brrurrrrrrrrrrrurrb.","brurrrrrrrrrrrrrurb.","brrrrrrrrrrrrrrrrrb.",".bbbbbbbbbbbbbbbbb.."];
const magnetData=["....bbb....","...brrhb...","..brrrrhb..","..brrrrhb..",".brrbrrhb.",".brrb.brhb.","brrb...brhb","brrb...brhb","brb.....brb","brb.....brb","brb.....brb","bbb.....bbb","bxb.....byb","bbb.....bbb"];

const fireFrame1=["...d.dd...","y...dld.b","w.d.d.ldb","..y..ddllb","..ddqdlllb",".dddllqrrb","ddllrrqrrb",".ddlllrqrb","w.yddllqlb","..dlldddlb","..d.d.d.db","...d.....b","........."];
const fireFrame2=[".........b","....d..ddb","w..drdrdlb","..lqddllrb",".ddlqrrrb","d.dllqrrrrb","ddlllqrrrb","...ddrrlrb","..w.ddddlb","...ydrd.db",".........b"];
const fireFrame3=["..........","....dd..b","....y..ddb",".y...d.dlb","..ddqdllrb",".dddlqrrrb","ddlllqrrrrb",".ddlllrrrb",".w.ddlllrb","....ddddlb","....d.d.db","...d.....b"];
const fireFrame4=["...........",".........b","..w....ddb","....wd.dlb","....ddqllb",".wddlqlrrb",".ddlllqrrb","..ddlllrrb","....dllllb","..ww.ddllb","......lddb","......d..b","..........."];

const colorMap={'b':'#000000','w':'#ffffff','r':'#ff2222','l':'#ffff00','y':'#cccccc','x':'#c27ba0','p':'#674ea7','d':'#c68642','c':'#003366','g':'#1a6b2e','k':'#228B22','f':'#ffdd00','u':'#741b47','a':'#c68642','0':'#00ff00','e':'#4a9950','v':'#0d3818','j':'#ffee88','z':'#aa3311','i':'#fff2a0','t':'#4a4a33','q':'#ffee77'};

const trexData1=["..eg.........",".egge........","ggrgg........","ggggv........",".ggvg........",".gggvg.......","...gvg.......","...ggvg......","..wkkgvg....g","...ggggv..gg.","....ggkkgvgg.","v....gkkkgv..",".....ykkgv...","v.....ykk.....","......ykkv....",".....ywkkv...."];
const trexData2=["..eg.........",".egge........","ggrgg........","ggggv........","...gv........","..ggvg.......",".gggvg.......","...ggvg......","...gvggg.....","..wkgvggg...g","....ggkkgvggg",".....gkkkgvg.",".....ykkkv...","......y.kk...","....yyy.k....",".....y.wk...."];

const pteranodonData1=["......jl..........",".....jl...........","....ll............","...lrlllllllllj...",".llllllllllllll...","ll...yllll...llzl","......ylllll......","......yylllll.....","......yyllzl......","..........llzl....","...........lzl...."];
const pteranodonData2=["...........jll....",".........llll.....","......ll.lllly....","....ll.llllyy.....","....ll.llllyy.jlll","...lrllllllllll...",".llllllllllllll...","ll....llzl........",".................."];
const pteranodonData3=["......jl..........",".....jl...........","....ll............","...lrlllllllllj...",".llllllllllllll...","ll...yllll...llzl","......ylllll......","......yylllll.....","......yyllzl......","..........llzl....","...........lzl...."];
const ghostFrame1=["...hwwwh...","..hwwwwwh..",".hwwwwwwwh.","wwwwwwwwwww","wwwbwwwbwww","wwwbwwwbwww","wwwwwwwwwww","wwwsmmmswww","wwwwwwwwwww","ww.ww.ww.ww","..........."];
const ghostFrame2=["...hwwwh...","..hwwwwwh..",".hwwwwwwwh.","wwwwwwwwwww","wwwbwwwbwww","wwwbwwwbwww","wwwwwwwwwww","wwwsmmmswww","wwwwwwwwwww","...........","ww.ww.ww.ww"];
const batFrame1=["..r.......r..",".rbb.....bbr.","rbbbb...bbbbr","bbbbbb.bbbbbb",".bbbbbbbbbbb.","..bbbbbbbbb..","...bbbbbbb...","....eb.be....",".....bbb....."];
const batFrame2=[".............","....r...r....","...rbb.bbr...","..rbbbbbbbr..",".rbbbbbbbbbr.","..bbbbbbbbb..","...bbbbbbb...","....eb.be....",".....bbb....."];
const unicornFrame1=[".......ggg..........","......wwwww.mn......",".....wwwwwww.nm.....","....whwwwwwwww.mn...","...whwwwwwwwwwww.nm.","..whwwwwwwwwwwwwww.n",".whwwwwwwbwwwwwwwwtn","wwwwwwwwwwwwwwwwwwtm","wswwwww....wwwwww...","ws.ww......ww.ww....","b..b......b..b......","o..o......o..o......"];
const unicornFrame2=[".......ggg..........","......wwwww.mn......",".....wwwwwww.nm.....","....whwwwwwwww.mn...","...whwwwwwwwwwww.nm.","..whwwwwwwwwwwwwww.n",".whwwwwwwbwwwwwwwwtn","wwwwwwwwwwwwwwwwwwtm","wswwwww....wwwwww...","ws..ww......ww.ww...",".b..b......b..b.....","..o..o......o..o...."];
const unicornColorMap={'w':'#ffffff','h':'#e8f4ff','s':'#d0d0e0','g':'#ffd700','m':'#ff66cc','n':'#9966ff','t':'#ff99dd','b':'#333333','o':'#c9a227'};

const sandflyFrame1=["...xx....","..xppx...",".xppppx..","xppppppx.","bbpppyyy.","bbbpyyyy.","bbbyyyyy.",".b.b.b...","........."];
const sandflyFrame2=[".........","...xx....","..xppx...",".xppppx..","bbpppyyy.","bbbpyyyy.","bbbyyyyy.",".b.b.b...","........."];
// Frame 1's art fills rows 0-7; frame 2's art fills rows 1-7. Match the box to whichever is showing.
function getSandflyHitbox(sf){
const scale=PIXEL*0.625;
const inset=1*scale;
if(sf.frame===0)return{x:sf.x+inset,y:sf.y+inset,w:8*scale-2*inset,h:8*scale-2*inset};
return{x:sf.x+inset,y:sf.y+1*scale+inset,w:8*scale-2*inset,h:7*scale-2*inset};
}

const sandstormFrames=[
["f........","......f.","........",".......f",".f......","....f...",".......f","........","........","..f.....","........",".....f..","f.......","...f....",".......f",".f......"],
["..f.....","........",".....f..",".f......","......f.","........","...f....","........","........","........","........","..f....f","....f...","........","........","f......."],
["f......f","........","........","........","f...f...","........","........","........","..f.....",".....f..",".f......","........","........","...f..f.","........","........"],
[".......f","ff......","........",".....f..","........","........","........",".f...f..","........",".....f..","f.......","........","..f.....","f....f..","........","........"]
];

const eyeIdleFrame=["wsssssw","swwwwws","wwpppww","wppdppw","wppdppw","wwpppww","swwwwws","wsssssw"];
const eyeFireFrame12=["wwrwwrw","wswwwsw","wwlllww","rwldlwr","wwldlww","wwlllww","wswwwsw","wrwwwrw"];
const eyeFireFrame34=["wwrwwrw","wswrsww","wrlllrw","rwldlwr","wwldlww","wwlllww","wswwwrw","wrrwwrw"];
const eyeFireFrame56=["wwrwwrw","wwrrsww","wrlllrw","rrldlrr","wrldlww","wwlllrw","wrwwrrw","wrrwwrw"];

const meteorFrames=[
[".....w..","....w.wy","....ywy.","....yyl.","...wll.w","...yl.y.","...lry..","..rr.w..",".rrr....",".fr.w...","fffy....","fff.....",".f......"],
["......w.","....ywy.","....ywy.","....yyy.","...ll.w.","...wl.y.","..ylry..",".wlryw.w",".lrl....",".fr.w...","fffy....","fff.....",".f......"],
["......y.","....ywy.","....ywwy","....yyy.","...llyw.","...wlyw.","..ylrw..",".wlrrw.w",".rrry...",".frl....","fffw....","fff.....",".f......"],
["........","....w.ww","....wwyy","....yyl.","...wll.w","...yr.y.","..ylry..",".ylrlw..",".lrr....",".frlw...","fffy....","fff.....",".f......"]
];

const ufoFrames=[
["....chc....","...ccccc...",".hccccccch.","yyyyyyyyyyy","kpxkpxkpxkp","syyyyyyyyys","..syyyys...","...ysys....","....sys...."],
["....chc....","...ccccc...",".hccccccch.","yyyyyyyyyyy","xkpxkpxkpxk","syyyyyyyyys","..syyyys...","...ysys....","....sys...."],
["....chc....","...ccccc...",".hccccccch.","yyyyyyyyyyy","pxkpxkpxkpx","syyyyyyyyys","..syyyys...","...ysys....","....sys...."]
];

const alienTowerIdle=["lll.lll","lll.lll",".l...l.",".l...l.",".l...l.","kkkkkkk","kcchcck","kcchcck","kcchcck","kcchcck","kcchcck","kkkkkkk"];
const alienTowerCharge=[
["lll.lll","lll.lll",".l...l.",".l...l.",".l...l.","kkkkkkk","kcchcck","kcchcck","kcchcck","kcchcck","krrkrrk","kkkkkkk"],
["lll.lll","lll.lll",".l...l.",".l...l.",".l...l.","kkkkkkk","kcchcck","kcchcck","kcchcck","krrkrrk","krrkrrk","kkkkkkk"],
["lll.lll","lll.lll",".l...l.",".l...l.",".l...l.","kkkkkkk","kcchcck","kcchcck","kcchcck","krrkrrk","krrkrrk","kkkkkkk"],
["lll.lll","lll.lll",".l...l.",".l...l.",".l...l.","kkkkkkk","kcchcck","kcchcck","krrkrrk","krrkrrk","krrkrrk","kkkkkkk"],
["lll.lll","lll.lll",".l...l.",".l...l.",".l...l.","kkkkkkk","kcchcck","krrkrrk","krrkrrk","krrkrrk","krrkrrk","kkkkkkk"],
["xxx.xxx","xxx.xxx",".x...x.",".x...x.",".x...x.","kkkkkkk","krrkrrk","krrkrrk","krrkrrk","krrkrrk","krrkrrk","kkkkkkk"]
];

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
const rng=mulberry32(42);

const clouds=[];for(let i=0;i<5;i++)clouds.push({offset:rng()*2000,y:0.08+rng()*0.15,w:8+Math.floor(rng()*8),h:4+Math.floor(rng()*4)});
const mountains=[];for(let i=0;i<4;i++)mountains.push({offset:rng()*2500,height:Math.floor((15+Math.floor(rng()*15))*1.5),width:25+Math.floor(rng()*20),type:Math.floor(rng()*2)});
const trees=[];for(let i=0;i<6;i++)trees.push({offset:rng()*1800,trunkH:4+Math.floor(rng()*4),crownH:5+Math.floor(rng()*5),crownW:4+Math.floor(rng()*4)});

let desertDunes=[];let desertCacti=[];let desertSkeletons=[];let desertSpawnTimer=0;
let spaceStars=[];let spacePlanets=[];let spaceSatellites=[];
let meteors=[];let meteorSpawnTimer=0;
let ufos=[];let ufoSpawnTimer=0;
let alienTowers=[];let alienTowerSpawnTimer=0;
let alienBolts=[];
let horrorTombstones=[];let horrorHouses=[];let horrorBgEyes=[];let horrorSpawnTimer=0;
let ghosts=[];let ghostSpawnTimer=0;
let bats=[];let batSpawnTimer=0;
let horrorEyes=[];let horrorEyeSpawnTimer=0;let horrorLaserActive=false;let horrorLaserFrameCount=0;
let horrorPendingPlan=null;
let caveScrollX=0;
let snowstorms=[];let snowstormSpawnTimer=0;
let rainbowHue=0;let rainbowHueTimer=0;
let rainbowStars=[];let rainbowStarSpawnTimer=0;
let unicorn=null;
let rainbowStageWasActive=false;

function initSpaceStars(){spaceStars=[];for(let i=0;i<10;i++)spaceStars.push({x:rng()*2000,y:rng()*0.8,brightness:0.3+rng()*0.7,size:1+Math.floor(rng()*3),twinkle:rng()*Math.PI*2});}
function initSpacePlanets(){spacePlanets=[];const colors=[['#664422','#775533'],['#553366','#664477'],['#445566','#556677'],['#664433','#775544']];for(let i=0;i<4;i++){spacePlanets.push({offset:600+rng()*2400,y:0.08+rng()*0.35,radius:12+Math.floor(rng()*30),color1:colors[i%4][0],color2:colors[i%4][1],hasRing:rng()>0.5});}}
function initSpaceSatellites(){spaceSatellites=[];for(let i=0;i<4;i++)spaceSatellites.push({offset:rng()*2000,y:0.25+rng()*0.35});}
initSpaceStars();initSpacePlanets();initSpaceSatellites();

let player={x:80,y:0,vy:0,frameCounter:0,isClicking:false,inputDisabled:false,fireFrame:0};
let groundOffset=0;let gameStarted=false;let countdownValue=3;let countdownTime=0;let score=0;let gameOver=false;let finalScore=0;
let obstacles=[];let obstacleSpawnTimer=0;const SPAWN_INTERVAL=1000;
let coins=[];let runCoins=0;let lastCoinResult=null;let coinSpawnTimer=0;const COIN_SPAWN_INTERVAL=1333;
let fuel=5;const MAX_FUEL=100;const BOOST_FUEL_COST=0.2;
let fuelCans=[];let fuelStageKey=-1;let fuelCanPlan=[];
let magnets=[];let magnetSpawnTimer=0;let magnetActiveTimer=0;
let deathCoins=[];let deathCoinStageKey=-1;let deathCoinCollected=0;let shieldCharges=0;let deathRewardMessage='';
let memoryGame={active:false,cards:[],selected:[],matched:0,wrong:0,reward:0,kind:null,finished:false,success:false};
let deathQuiz={active:false,term:'',options:[],resultMessage:''};
let deathCoinButtonRect=null;
let playAgainButtonRect=null;
let openShopFromGameOverRect=null;
let postQuizCountdownActive=false;let postQuizCountdownValue=3;let postQuizCountdownTimer=0;
let headstartImmuneTimer=0;
let sandflies=[];let sandflySpawnTimer=0;let sandstorms=[];let sandstormSpawnTimer=0;
let floatingEyes=[];let eyeSpawnTimer=0;let laserActive=false;let laserFrameCount=0;

const groundY=()=>canvas.height-60;

function clearLeftPortionEnemies(){
const threshold=canvas.width*0.4;
obstacles=obstacles.filter(function(o){return o.x>=threshold;});
sandflies=sandflies.filter(function(o){return o.x>=threshold;});
floatingEyes=floatingEyes.filter(function(o){return o.x>=threshold;});
meteors=meteors.filter(function(o){return o.x>=threshold;});
ufos=ufos.filter(function(o){return o.x>=threshold;});
alienTowers=alienTowers.filter(function(o){return o.x>=threshold;});
alienBolts=[];
ghosts=ghosts.filter(function(o){return o.x>=threshold;});
bats=bats.filter(function(o){return o.x>=threshold;});
horrorEyes=horrorEyes.filter(function(o){return o.x>=threshold;});
if(horrorEyes.length<2)horrorLaserActive=false;
}
function applyHeadstartBoost(success){
if(!success)return;
headstartBoostTimer=getHeadstartBoostDuration();
headstartImmuneTimer=getHeadstartImmunityDuration();
}

function resetGame(){
runCoins=0;
player.y=canvas.height/2;player.vy=0;player.frameCounter=0;player.inputDisabled=false;player.fireFrame=0;
groundOffset=0;gameStarted=false;countdownValue=3;countdownTime=0;score=0;gameOver=false;finalScore=0;
lastStageBoundaryCount=0;nextStageId=null;baseProgressIndex=0;
if(forceRainbowNextRun){currentStageId=5;forceRainbowNextRun=false;}else{currentStageId=0;}
obstacles=[];obstacleSpawnTimer=0;coins=[];coinSpawnTimer=0;
fuel=getFuelCapacity()*0.50;fuelCans=[];fuelStageKey=-1;fuelCanPlan=[];closeMemoryGame(false);
deathQuiz={active:false,term:'',options:[],resultMessage:''};deathCoinButtonRect=null;playAgainButtonRect=null;openShopFromGameOverRect=null;
postQuizCountdownActive=false;postQuizCountdownValue=3;postQuizCountdownTimer=0;
headstartBoostTimer=0;headstartImmuneTimer=0;
magnets=[];magnetSpawnTimer=0;magnetActiveTimer=0;deathCoins=[];deathCoinStageKey=-1;deathCoinCollected=0;deathRewardMessage='';shieldCharges=shopState.owned.startingShield?1:0;
sandflies=[];sandflySpawnTimer=0;sandstorms=[];sandstormSpawnTimer=0;
floatingEyes=[];eyeSpawnTimer=0;laserFrameCount=0;
desertDunes=[];desertCacti=[];desertSkeletons=[];desertSpawnTimer=0;
meteors=[];meteorSpawnTimer=0;ufos=[];ufoSpawnTimer=0;
alienTowers=[];alienTowerSpawnTimer=0;alienBolts=[];
horrorTombstones=[];horrorHouses=[];horrorBgEyes=[];horrorSpawnTimer=0;
ghosts=[];ghostSpawnTimer=0;bats=[];batSpawnTimer=0;
horrorEyes=[];horrorEyeSpawnTimer=0;horrorLaserActive=false;horrorLaserFrameCount=0;horrorPendingPlan=null;
caveScrollX=0;snowstorms=[];snowstormSpawnTimer=0;
rainbowHue=0;rainbowHueTimer=0;rainbowStars=[];rainbowStarSpawnTimer=0;unicorn=null;rainbowStageWasActive=false;
activePowerupEffects={};
runElapsedMs=0;
}
resetGame();

function drawPixelArt(data,x,y,scale,cmap){
const cm=cmap||colorMap;
for(let row=0;row<data.length;row++){
for(let col=0;col<data[row].length;col++){
const ch=data[row][col];
if(ch!=='.'&&cm[ch]){ctx.fillStyle=cm[ch];ctx.fillRect(x+col*scale,y+row*scale,scale,scale);}
}}}

function drawPixelArtCtx(c,data,x,y,scale,cmap){
const cm=cmap||colorMap;
for(let row=0;row<data.length;row++){
for(let col=0;col<data[row].length;col++){
const ch=data[row][col];
if(ch!=='.'&&cm[ch]){c.fillStyle=cm[ch];c.fillRect(x+col*scale,y+row*scale,scale,scale);}
}}}

function drawPixelCloud(cx,cy,w,h){
ctx.fillStyle='rgba(255,255,255,0.9)';
for(let row=0;row<h;row++){
const rowWidth=Math.floor(w*(1-Math.abs(row-h/2)/(h/2)*0.5));
const startX=cx+Math.floor((w-rowWidth)/2)*PIXEL;
for(let col=0;col<rowWidth;col++){ctx.fillRect(startX+col*PIXEL,cy+row*PIXEL,PIXEL,PIXEL);}
}}

function drawClouds(){
if(isSpace()||isHorror()||isSnow())return;
const speed=groundOffset*0.3;
const sm=isDesert()?1.5:1;
const ti=getTransitionInfo();
clouds.forEach(c=>{const x=((c.offset-speed)%2000+2000)%2000-200;
if(ti.transitioning)ctx.globalAlpha=1-ti.alpha;
drawPixelCloud(x,canvas.height*c.y,Math.floor(c.w*sm),Math.floor(c.h*sm));
if(ti.transitioning)ctx.globalAlpha=1;
});
}

function drawSandDune(dx,baseY,height){
for(let row=0;row<height;row++){
const ratio=row/height;
const rowW=Math.floor((10+height*0.8)*(1-ratio*0.3));
const sx=dx-Math.floor(rowW/2)*PIXEL;
for(let col=0;col<rowW;col++){
ctx.fillStyle=col%3===0?'#e8c86a':'#d4b060';
ctx.fillRect(sx+col*PIXEL,baseY-(height-row)*PIXEL,PIXEL,PIXEL);
}}}

function drawSkeleton(sx,baseY){
const skeletonData=["..wwww..","..wwww..",".wbwwbw.",".wwwwww.","..wwww..",".w.ww.w.","w.wwww.w",".w.ww.w.","..w..w..","..w..w..",".w....w."];
drawPixelArt(skeletonData,sx,baseY-skeletonData.length*PIXEL,PIXEL,{'w':'#e8e0d0','b':'#2a2418'});
}

function drawHorrorHouse(hx,baseY,height,width){
const roofH=Math.max(2,Math.floor(height*0.35));
const bodyH=height-roofH;
for(let row=0;row<bodyH;row++){
for(let col=0;col<width;col++){
ctx.fillStyle=(row+col)%5===0?'#2a1f35':'#3a2a45';
ctx.fillRect(hx+col*PIXEL,baseY-(bodyH-row)*PIXEL,PIXEL,PIXEL);
}}
const winY=baseY-Math.floor(bodyH*0.6)*PIXEL;
ctx.fillStyle='#ffcc33';
ctx.fillRect(hx+Math.floor(width*0.2)*PIXEL,winY,PIXEL*2,PIXEL*2);
ctx.fillRect(hx+Math.floor(width*0.65)*PIXEL,winY,PIXEL*2,PIXEL*2);
const roofBase=baseY-bodyH*PIXEL;
for(let row=0;row<roofH;row++){
const ratio=row/roofH;
const rowW=Math.max(1,Math.floor(width*(1-ratio)));
const sx=hx+Math.floor((width-rowW)/2)*PIXEL;
ctx.fillStyle='#1a1220';
for(let col=0;col<rowW;col++)ctx.fillRect(sx+col*PIXEL,roofBase-(roofH-row)*PIXEL,PIXEL,PIXEL);
}}

function drawHorrorTombstone(tx,baseY,type){
const h=type===0?5:7;const w=type===0?4:3;
ctx.fillStyle='#8a8a9a';
for(let row=1;row<h;row++){for(let col=0;col<w;col++)ctx.fillRect(tx+col*PIXEL,baseY-(h-row)*PIXEL,PIXEL,PIXEL);}
for(let col=1;col<w-1;col++)ctx.fillRect(tx+col*PIXEL,baseY-h*PIXEL,PIXEL,PIXEL);
ctx.fillStyle='#5a5a6a';ctx.fillRect(tx+PIXEL,baseY-(h-2)*PIXEL,PIXEL,PIXEL);
}

function drawDesertCactus(cx,baseY,height){
for(let r=0;r<height;r++){
ctx.fillStyle=r%2===0?'#2d8a2d':'#3a9a3a';
ctx.fillRect(cx,baseY-(r+1)*PIXEL,PIXEL*2,PIXEL);
}
const armY=baseY-Math.floor(height*0.6)*PIXEL;
for(let r=0;r<3;r++){
ctx.fillStyle='#2d8a2d';
ctx.fillRect(cx-PIXEL*2,armY-r*PIXEL,PIXEL,PIXEL);
ctx.fillRect(cx+PIXEL*3,armY-r*PIXEL,PIXEL,PIXEL);
}}

function drawMountains(){
const speed=groundOffset*0.5;
const baseY=groundY();
const ti=getTransitionInfo();
if(!ti.transitioning){drawStageDecor(getCurrentStageIndex(),speed,baseY,1);return;}
// Crossfade: draw the outgoing stage's scenery fading out AND the incoming stage's scenery
// fading in at the same time, instead of only fading the old one to nothing and then popping
// the new one in at full opacity the instant the boundary is crossed.
drawStageDecor(ti.from,speed,baseY,1-ti.alpha);
drawStageDecor(ti.to,speed,baseY,ti.alpha);
}
function drawStageDecor(stageIdx,speed,baseY,alpha){
if(alpha<=0)return;
if(stageIdx===2){drawSpacePlanets(alpha);}
else if(stageIdx===1){
desertDunes.forEach(d=>{const x=d.offset-speed;if(x>-400&&x<canvas.width+200){ctx.globalAlpha=alpha;drawSandDune(x,baseY,d.height);ctx.globalAlpha=1;}});
const midSpeed=groundOffset*0.55;
desertSkeletons.forEach(s=>{const x=s.offset-midSpeed;if(x>-200&&x<canvas.width+200){ctx.globalAlpha=alpha;drawSkeleton(x,baseY);ctx.globalAlpha=1;}});
}else if(stageIdx===3){
if(alpha>=1){ctx.fillStyle='#e8e0d0';ctx.beginPath();ctx.arc(canvas.width*0.85,canvas.height*0.15,26,0,Math.PI*2);ctx.fill();}
const houseSpeed=groundOffset*0.3;
horrorHouses.forEach(h=>{const x=h.offset-houseSpeed;if(x>-400&&x<canvas.width+200){ctx.globalAlpha=alpha;drawHorrorHouse(x,baseY,h.height,h.width);ctx.globalAlpha=1;}});
}else if(stageIdx===4){
// Cave walls (drawn in drawGround/drawSnowCave) are the entire background here.
}else if(stageIdx===5){
drawRainbowStars();
const houseSpeed=groundOffset*0.3;
horrorHouses.forEach(h=>{const x=h.offset-houseSpeed;if(x>-400&&x<canvas.width+200)drawHorrorHouse(x,baseY,h.height,h.width);});
desertDunes.forEach(d=>{const x=d.offset-speed;if(x>-400&&x<canvas.width+200)drawSandDune(x,baseY,d.height);});
}else{
mountains.forEach(m=>{const x=((m.offset-speed)%2500+2500)%2500-400;ctx.globalAlpha=alpha;drawMountain(x,baseY,m.height,m.width,m.type);ctx.globalAlpha=1;});
}
}

function drawMountain(mx,baseY,height,width,type){
for(let row=0;row<height;row++){
const ratio=row/height;
const rowW=Math.floor(width*ratio);
const startX=mx+Math.floor((width-rowW)/2)*PIXEL;
for(let col=0;col<rowW;col++){
if(type===0&&ratio<0.3)ctx.fillStyle='#ffffff';
else ctx.fillStyle=col>rowW/2?'#5ba6c0':'#4a90a4';
ctx.fillRect(startX+col*PIXEL,baseY-(height-row)*PIXEL,PIXEL,PIXEL);
}}}

function drawSpacePlanets(alpha){
if(alpha===undefined)alpha=1;
const speed=groundOffset*0.15;
spacePlanets.forEach(p=>{
const x=((p.offset-speed)%3000+3000)%3000-400;
const y=canvas.height*p.y;
const r=p.radius*PIXEL;
ctx.globalAlpha=alpha;
ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=p.color1;ctx.fill();
ctx.beginPath();ctx.arc(x-r*0.2,y-r*0.2,r*0.7,0,Math.PI*2);ctx.fillStyle=p.color2;ctx.fill();
if(p.hasRing){ctx.strokeStyle=p.color2;ctx.lineWidth=PIXEL;ctx.beginPath();ctx.ellipse(x,y,r*1.6,r*0.3,0,0,Math.PI*2);ctx.stroke();}
ctx.globalAlpha=1;
});}

function drawSpaceSatellites(){
    const speed=groundOffset*0.4;
    const ti=getTransitionInfo();

    spaceSatellites.forEach(s=>{
        const x=((s.offset-speed)%2000+2000)%2000-100;
        const y=canvas.height*s.y;

        ctx.save();                 // 🔥 isolate each satellite
        ctx.filter = "blur(4px)";   // adjust strength here

        if(ti.transitioning) ctx.globalAlpha = 1 - ti.alpha;

        ctx.fillStyle='#aaaaaa';
        ctx.fillRect(x,y,PIXEL*3,PIXEL*2);

        ctx.fillStyle='#4488ff';
        ctx.fillRect(x-PIXEL*4,y-PIXEL,PIXEL*4,PIXEL*4);
        ctx.fillRect(x+PIXEL*3,y-PIXEL,PIXEL*4,PIXEL*4);

        ctx.fillStyle='#666666';
        ctx.fillRect(x-PIXEL*1,y+PIXEL*2,PIXEL*5,PIXEL);

        if(ti.transitioning) ctx.globalAlpha = 1;

        ctx.restore();              // 🔥 removes blur immediately
    });
}

function drawSpaceStars(){
const t=performance.now()*0.001;
const ti=getTransitionInfo();
spaceStars.forEach(s=>{
const speed=groundOffset*0.05;
const x=((s.x-speed)%2000+2000)%2000;
const y=canvas.height*s.y;
const twinkle=0.5+0.5*Math.sin(t*2+s.twinkle);
if(ti.transitioning)ctx.globalAlpha=s.brightness*twinkle*(1-ti.alpha);else ctx.globalAlpha=s.brightness*twinkle;
ctx.fillStyle='rgba(255,255,255,1)';
ctx.fillRect(x,y,PIXEL*s.size,PIXEL*s.size);
if(ti.transitioning)ctx.globalAlpha=1;
});}

function drawTrees(){
if(isSpace()){drawSpaceSatellites();return;}
if(isSnow())return;
const speed=groundOffset*0.6;
const baseY=groundY();
if(isDesert()){
desertCacti.forEach(t=>{const x=t.offset-speed;if(x>-200&&x<canvas.width+200)drawDesertCactus(x,baseY,t.height);});
}else if(isLostArchive()){
for(let i=0;i<12;i++){const x=((i*190-groundOffset*.42)%2300+2300)%2300-120,h=55+(i%4)*22;ctx.fillStyle='#29264f';ctx.fillRect(x,baseY-h,42,h);ctx.fillStyle='#d9ba68';ctx.fillRect(x-8,baseY-h,58,7);ctx.fillRect(x-5,baseY-8,52,8);ctx.fillStyle='#79e5db';for(let r=0;r<3;r++)ctx.fillRect(x+8+r*10,baseY-h+18+(r%2)*13,5,9);const fy=baseY-h-24+Math.sin(performance.now()/500+i)*10;ctx.fillStyle=i%2?'#ffe08a':'#9bf5ec';ctx.fillRect(x+12,fy,22,4);ctx.fillRect(x+15,fy-3,16,3);}
}else if(isHorror()){
const tSpeed=groundOffset*0.55;
horrorTombstones.forEach(t=>{const x=t.offset-tSpeed;if(x>-200&&x<canvas.width+200)drawHorrorTombstone(x,baseY,t.type);});
const eSpeed=groundOffset*0.5;
horrorBgEyes.forEach(be=>{
if(!be.visible)return;
const x=be.offset-eSpeed;if(x<-50||x>canvas.width+50)return;
const y=canvas.height*be.y;
ctx.fillStyle='#ffee00';ctx.fillRect(x,y,PIXEL,PIXEL);ctx.fillRect(x+PIXEL*2,y,PIXEL,PIXEL);
});
}else if(isRainbowMadness()){
desertCacti.forEach(t=>{const x=t.offset-speed;if(x>-200&&x<canvas.width+200)drawDesertCactus(x,baseY,t.height);});
const tSpeed=groundOffset*0.55;
horrorTombstones.forEach(t=>{const x=t.offset-tSpeed;if(x>-200&&x<canvas.width+200)drawHorrorTombstone(x,baseY,t.type);});
}else{
trees.forEach(t=>{const x=((t.offset-speed)%1800+1800)%1800-200;drawTree(x,baseY,t.trunkH,t.crownH,t.crownW);});
}}

function drawTree(tx,baseY,trunkH,crownH,crownW){
ctx.fillStyle='#6B4423';
for(let r=0;r<trunkH;r++)ctx.fillRect(tx,baseY-(r+1)*PIXEL,PIXEL*2,PIXEL);
const crownBase=baseY-trunkH*PIXEL;
for(let r=0;r<crownH;r++){
const ratio=1-(r/crownH);
const rowW=Math.max(1,Math.floor(crownW*ratio));
const sx=tx+PIXEL-Math.floor(rowW/2)*PIXEL;
for(let c=0;c<rowW;c++){
ctx.fillStyle=c>rowW/2?'#32CD32':'#228B22';
ctx.fillRect(sx+c*PIXEL,crownBase-r*PIXEL,PIXEL,PIXEL);
}}}

function drawGround(){
if(isSnow()){drawSnowCave();return;}
const gY=groundY();
const ti=getTransitionInfo();
const idx=getCurrentStageIndex();
for(let x=-((groundOffset*PIXEL)%(PIXEL*2));x<canvas.width;x+=PIXEL){
const i=Math.floor((x+groundOffset*PIXEL)/PIXEL);
let fc;
if(ti.transitioning){fc=interpolateColor(getGroundTopColor(ti.from,i),getGroundTopColor(ti.to,i),ti.alpha);}
else fc=getGroundTopColor(idx,i);
ctx.fillStyle=fc;ctx.fillRect(x,gY,PIXEL,PIXEL*2);
}
for(let row=0;row<8;row++){
for(let x=-((groundOffset*PIXEL)%(PIXEL*2));x<canvas.width;x+=PIXEL){
const i=Math.floor((x+groundOffset*PIXEL+row*7)/PIXEL);
let bc;
if(ti.transitioning){bc=interpolateColor(getGroundBottomColor(ti.from,i),getGroundBottomColor(ti.to,i),ti.alpha);}
else bc=getGroundBottomColor(idx,i);
ctx.fillStyle=bc;ctx.fillRect(x,gY+PIXEL*2+row*PIXEL,PIXEL,PIXEL);
}}
if(idx===2&&!ti.transitioning){
const craterSpeed=groundOffset*1;
for(let ci=0;ci<5;ci++){
const cx=((ci*400+200-craterSpeed)%2000+2000)%2000-100;
const cy=gY+PIXEL*4;
ctx.fillStyle='#555555';ctx.beginPath();ctx.ellipse(cx,cy,PIXEL*4,PIXEL*2,0,0,Math.PI*2);ctx.fill();
}}}

function hslToHex(h,s,l){
s/=100;l/=100;
const c=(1-Math.abs(2*l-1))*s;
const x=c*(1-Math.abs((h/60)%2-1));
const m=l-c/2;
let r=0,g=0,b=0;
if(h<60){r=c;g=x;b=0;}else if(h<120){r=x;g=c;b=0;}else if(h<180){r=0;g=c;b=x;}else if(h<240){r=0;g=x;b=c;}else if(h<300){r=x;g=0;b=c;}else{r=c;g=0;b=x;}
r=Math.round((r+m)*255);g=Math.round((g+m)*255);b=Math.round((b+m)*255);
return '#'+r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0');
}
function getStageSkyTop(idx){return idx===2?'#000005':idx===1?'#f0c040':idx===3?'#0d0221':idx===4?'#e8e8e8':idx===6?'#111338':idx===5?hslToHex(rainbowHue,80,72):'#55ccff';}
function getStageSkyBottom(idx){return idx===2?'#0a0a1a':idx===1?'#e8a020':idx===3?'#1a0a2e':idx===4?'#d4d4d4':idx===6?'#493263':idx===5?hslToHex(rainbowHue,85,42):'#aaeeff';}
function getGroundTopColor(stageIdx,i){
if(stageIdx===0||stageIdx===5)return(i%3===0)?'#22cc44':(i%3===1)?'#33dd55':'#44ee66';
if(stageIdx===1)return(i%3===0)?'#e8c86a':(i%3===1)?'#dbb855':'#c9a844';
if(stageIdx===3)return(i%3===0)?'#4a2f5c':(i%3===1)?'#3a2050':'#5a3a6c';
if(stageIdx===4)return(i%3===0)?'#ffffff':(i%3===1)?'#f2f8ff':'#e8f0f5';
return(i%3===0)?'#aaaaaa':(i%3===1)?'#999999':'#888888';
}
function getGroundBottomColor(stageIdx,i){
if(stageIdx===0||stageIdx===5)return(i%4===0)?'#8B4513':(i%4===1)?'#A0522D':(i%4===2)?'#6B3410':'#7B3F15';
if(stageIdx===1)return(i%4===0)?'#c8a040':(i%4===1)?'#b89030':(i%4===2)?'#a88020':'#d0a848';
if(stageIdx===3)return(i%4===0)?'#241030':(i%4===1)?'#2e1640':(i%4===2)?'#1c0c28':'#301848';
if(stageIdx===4)return(i%4===0)?'#ffffff':(i%4===1)?'#f2f8ff':(i%4===2)?'#e8f0f5':'#dde8ee';
return(i%4===0)?'#666666':(i%4===1)?'#5a5a5a':(i%4===2)?'#707070':'#606060';
}

// --- Snow Cave: the tunnel shape is a pure function of world-X so it never needs a stored list ---
// Ceiling hugs the top of the screen, floor hugs the bottom; each only drifts down/up by up to 12%
// of screen height. Stalactites/stalagmites bite further in, but the path never drops below 1/3 screen.
function hash1(n){const s=Math.sin(n*12.9898)*43758.5453;return s-Math.floor(s);}
function caveTopVariation(worldX){return canvas.height*0.12*(0.5+0.5*Math.sin(worldX*0.0012));}
function caveBottomVariation(worldX){return canvas.height*0.12*(0.5+0.5*Math.sin(worldX*0.0012*1.3+2.1));}
function stalactiteDepth(worldX){
const H=canvas.height;
const cycle=350;const idx=Math.floor(worldX/cycle);const h=hash1(idx);
if(h<0.5)return 0;
const localCenter=(idx+0.5)*cycle,width=50+h*60,dist=Math.abs(worldX-localCenter);
if(dist>width/2)return 0;
const t=1-(dist/(width/2));
return t*t*(H*0.12+h*H*0.16);
}
function stalagmiteHeight(worldX){
const H=canvas.height;
const cycle=420;const idx=Math.floor(worldX/cycle)+1000;const h=hash1(idx);
if(h<0.5)return 0;
const localCenter=(idx-1000+0.5)*cycle,width=50+h*60,dist=Math.abs(worldX-localCenter);
if(dist>width/2)return 0;
const t=1-(dist/(width/2));
return t*t*(H*0.12+h*H*0.16);
}
function getCaveBounds(worldX){
const H=canvas.height;
const minGap=H/3;
let top=caveTopVariation(worldX)+stalactiteDepth(worldX);
let bottom=H-caveBottomVariation(worldX)-stalagmiteHeight(worldX);
if(bottom-top<minGap){
const mid=(top+bottom)/2;
top=mid-minGap/2;
bottom=mid+minGap/2;
}
if(top<0){bottom+=(-top);top=0;}
if(bottom>H){top-=(bottom-H);bottom=H;}
return{top:top,bottom:bottom};
}
function getCaveBoundsAtPlayer(){return getCaveBounds(caveScrollX+player.x+4*PIXEL);}
function drawSnowCave(){
const cols=Math.ceil(canvas.width/PIXEL)+2;
const totalRows=Math.ceil(canvas.height/PIXEL);
for(let c=0;c<cols;c++){
const screenX=c*PIXEL;
const worldX=caveScrollX+screenX;
const b=getCaveBounds(worldX);
const topRows=Math.ceil(b.top/PIXEL);
for(let r=0;r<topRows;r++){
ctx.fillStyle=((r+c)%5===0)?'#ffffff':((r+c)%5===2)?'#f2f8ff':'#e8f0f5';
ctx.fillRect(screenX,r*PIXEL,PIXEL,PIXEL);
}
if(topRows>0){ctx.fillStyle='#cfe0e8';ctx.fillRect(screenX,(topRows-1)*PIXEL,PIXEL,PIXEL);}
const bottomStartRow=Math.floor(b.bottom/PIXEL);
for(let r=bottomStartRow;r<totalRows;r++){
ctx.fillStyle=((r+c)%5===0)?'#ffffff':((r+c)%5===2)?'#f2f8ff':'#e8f0f5';
ctx.fillRect(screenX,r*PIXEL,PIXEL,PIXEL);
}
ctx.fillStyle='#cfe0e8';ctx.fillRect(screenX,bottomStartRow*PIXEL,PIXEL,PIXEL);
}}

function spawnDesertElements(){
const ti=getTransitionInfo();
if(!isDesert()&&!isRainbowMadness()&&!(ti.transitioning&&ti.to===1))return;
desertSpawnTimer+=getDeltaTime();
if(desertSpawnTimer>=1667){
desertSpawnTimer=0;
desertDunes.push({offset:groundOffset*0.5+canvas.width+rng()*300,height:8+Math.floor(rng()*12)});
desertCacti.push({offset:groundOffset*0.6+canvas.width+rng()*200,height:6+Math.floor(rng()*8)});
if(rng()<0.5)desertSkeletons.push({offset:groundOffset*0.55+canvas.width+rng()*250});
}
// Cleanup
const dSpeed=groundOffset*0.5;
for(let i=desertDunes.length-1;i>=0;i--){if(desertDunes[i].offset-dSpeed<-400)desertDunes.splice(i,1);}
const cSpeed=groundOffset*0.6;
for(let i=desertCacti.length-1;i>=0;i--){if(desertCacti[i].offset-cSpeed<-200)desertCacti.splice(i,1);}
const sSpeed=groundOffset*0.55;
for(let i=desertSkeletons.length-1;i>=0;i--){if(desertSkeletons[i].offset-sSpeed<-200)desertSkeletons.splice(i,1);}
}

function spawnHorrorElements(){
const ti=getTransitionInfo();
if(!isHorror()&&!isRainbowMadness()&&!(ti.transitioning&&ti.to===3))return;
const dt=getDeltaTime();
horrorSpawnTimer+=dt;
if(horrorSpawnTimer>=1800){
horrorSpawnTimer=0;
horrorHouses.push({offset:groundOffset*0.3+canvas.width+rng()*500,height:14+Math.floor(rng()*10),width:14+Math.floor(rng()*8)});
horrorTombstones.push({offset:groundOffset*0.55+canvas.width+rng()*250,type:Math.floor(rng()*2)});
if(rng()<0.4)horrorBgEyes.push({offset:groundOffset*0.5+canvas.width+rng()*300,y:0.3+rng()*0.4,blinkTimer:rng()*2000,visible:true});
}
const hSpeed=groundOffset*0.3;
for(let i=horrorHouses.length-1;i>=0;i--){if(horrorHouses[i].offset-hSpeed<-400)horrorHouses.splice(i,1);}
const tSpeed=groundOffset*0.55;
for(let i=horrorTombstones.length-1;i>=0;i--){if(horrorTombstones[i].offset-tSpeed<-200)horrorTombstones.splice(i,1);}
const eSpeed=groundOffset*0.5;
for(let i=horrorBgEyes.length-1;i>=0;i--){
const be=horrorBgEyes[i];
be.blinkTimer-=dt;
if(be.blinkTimer<=0){be.visible=!be.visible;be.blinkTimer=be.visible?800+rng()*1500:150+rng()*200;}
if(be.offset-eSpeed<-200)horrorBgEyes.splice(i,1);
}
}
function spawnSandflies(){
const count=1;
for(let i=0;i<count;i++){
sandflies.push({x:canvas.width+rng()*30,y:canvas.height*(0.1+rng()*0.8),frame:rng()<0.5?0:1,frameCounter:0,speed:(3.125+rng()*3.125)*getEnemySpeedMult(),goingLeft:false});
}}
function spawnSandstorm(){
const clusterSize=10+Math.floor(rng()*11);
const clusterY=canvas.height*(0.05+rng()*0.6);
for(let i=0;i<clusterSize;i++)sandstorms.push({x:canvas.width+rng()*240-120,y:Math.max(0,Math.min(canvas.height,clusterY+(rng()-0.5)*210)),frameCounter:Math.floor(rng()*32)});
}
// Snowstorm: same particle sprite as the desert sandstorm, recolored white, layered in front of
// obstacles and the player. Purely visual - it never disables input or damages the player.
function spawnSnowstorm(){
const clusterSize=10+Math.floor(rng()*11);
const clusterY=canvas.height*(0.05+rng()*0.6);
for(let i=0;i<clusterSize;i++){
snowstorms.push({x:canvas.width+rng()*240-120,y:Math.max(0,Math.min(canvas.height,clusterY+(rng()-0.5)*210)),frameCounter:Math.floor(rng()*32)});
}
}
function updateSnowstorms(){
if(!isSnow())return;
const dt=getDeltaTime();
snowstormSpawnTimer+=dt;
if(snowstormSpawnTimer>=500){spawnSnowstorm();snowstormSpawnTimer=0;}
const mMult=getMovementMult();
const ssScale=PIXEL*2.25*1.5;
for(let i=snowstorms.length-1;i>=0;i--){
const ss=snowstorms[i];ss.x-=GROUND_SPEED*mMult;ss.frameCounter++;
if(ss.x<-8*ssScale)snowstorms.splice(i,1);
}
}
function drawSnowstormOverlay(){
if(!isSnow())return;
const stormColorMap={'f':'rgba(255,255,255,0.8)'};
const ssScale=PIXEL*2.25*1.5;
snowstorms.forEach(function(ss){const fi=Math.floor(ss.frameCounter/8)%4;drawPixelArt(sandstormFrames[fi],ss.x,ss.y,ssScale,stormColorMap);});
}

// --- Rainbow Madness: a rare bonus stage (2% chance instead of another stage, guaranteed on
// death 5, 20, 35... and every 15 deaths after that) that throws every enemy/decoration system
// at once. Any future stage's update/draw/collision functions just need "||isRainbowMadness()"
// added to their guard to join the chaos. ---
function makeUnicorn(){
return{x:-60,wavelength:300+rng()*500,amplitude:70+rng()*130,phase:rng()*Math.PI*2,baseY:canvas.height*0.5,trailTimer:0,frame:0,frameCounter:0};
}
function updateRainbowMadness(){
if(!isRainbowMadness()){rainbowStars=[];unicorn=null;rainbowStageWasActive=false;return;}
if(!rainbowStageWasActive){
rainbowStageWasActive=true;
unicorn=makeUnicorn(); // guaranteed unicorn right at the start of the stage
}
const dt=getDeltaTime();
rainbowHueTimer+=dt;
if(rainbowHueTimer>=1000){rainbowHueTimer-=1000;rainbowHue=(rainbowHue+47)%360;}
rainbowStarSpawnTimer+=dt;
if(rainbowStarSpawnTimer>=200){
rainbowStarSpawnTimer=0;
rainbowStars.push({x:rng()*canvas.width,y:rng()*canvas.height*0.6,hue:Math.floor(rng()*360),life:0,maxLife:400+rng()*500});
}
for(let i=rainbowStars.length-1;i>=0;i--){
rainbowStars[i].life+=dt;
if(rainbowStars[i].life>=rainbowStars[i].maxLife)rainbowStars.splice(i,1);
}
if(!unicorn){
if(rng()<0.002){
unicorn=makeUnicorn();
}
}else{
unicorn.x+=GROUND_SPEED*1.4;
unicorn.frameCounter++;if(unicorn.frameCounter%6===0)unicorn.frame=1-unicorn.frame;
unicorn.y=unicorn.baseY+Math.sin((unicorn.x/unicorn.wavelength)*Math.PI*2+unicorn.phase)*unicorn.amplitude;
unicorn.trailTimer+=dt;
if(unicorn.trailTimer>=150){
unicorn.trailTimer=0;
coins.push({x:unicorn.x,y:unicorn.y+8*PIXEL,frameCounter:0,type:'gold',value:Math.round(getRegularCoinValue()*10)/10});
}
if(unicorn.x>canvas.width+80)unicorn=null;
}
}
function drawRainbowStars(){
rainbowStars.forEach(function(s){
const t=s.life/s.maxLife;
const alpha=Math.max(0,t<0.5?(t/0.5):(1-((t-0.5)/0.5)));
ctx.fillStyle='hsla('+s.hue+',90%,65%,'+alpha+')';
const size=PIXEL*1.5;
ctx.fillRect(s.x-size/2,s.y-size*1.5,size,size*3);
ctx.fillRect(s.x-size*1.5,s.y-size/2,size*3,size);
});
}
function drawUnicorn(){
// Purely decorative + coin-dropping: no collision check exists for it anywhere, so it can
// never cause a death and passes straight through every enemy on screen.
if(!unicorn)return;
const frame=unicorn.frame===0?unicornFrame1:unicornFrame2;
drawPixelArt(frame,unicorn.x,unicorn.y,PIXEL*1.3,unicornColorMap);
}
function spawnFloatingEye(){
const minY=canvas.height*0.2;const maxY=canvas.height*0.8;
const towerTopY=minY+rng()*(maxY-minY);
floatingEyes.push({x:canvas.width,y:towerTopY,towerHeight:groundY()-towerTopY,firing:false,fireFrame:0,fireTimer:0,idleTimer:0,state:'idle'});
}

function updateDesertEnemies(){
if(!isDesert()&&!isRainbowMadness())return;
const dt=getDeltaTime();
sandflySpawnTimer+=dt;
if(sandflySpawnTimer>=2667/getPowerupSpawnRateMult()){spawnSandflies();sandflySpawnTimer=0;}
for(let i=sandflies.length-1;i>=0;i--){
const sf=sandflies[i];
if(sf.goingLeft){sf.x-=sf.speed*1.5;}
else{
const dx=player.x-sf.x;const dy=player.y-sf.y;
const dist=Math.sqrt(dx*dx+dy*dy);
if(dist>1){sf.x+=(dx/dist)*sf.speed;sf.y+=(dy/dist)*sf.speed;}
if(sf.x <= canvas.width * SANDFLY_STRAIGHT_LINE_POINT)
    sf.goingLeft = true;
}
sf.frameCounter++;if(sf.frameCounter%10===0)sf.frame=1-sf.frame;
if(sf.x<-100)sandflies.splice(i,1);
}
sandstormSpawnTimer+=dt;
if(sandstormSpawnTimer>=500){spawnSandstorm();sandstormSpawnTimer=0;}
const ssScale=PIXEL*2.25*1.5;
for(let i=sandstorms.length-1;i>=0;i--){
const ss=sandstorms[i];ss.x-=GROUND_SPEED*getMovementMult();ss.frameCounter++;
if(ss.x<-8*ssScale)sandstorms.splice(i,1);
}
eyeSpawnTimer+=dt;
if(floatingEyes.length===0&&eyeSpawnTimer>=1500/getPowerupSpawnRateMult()){spawnFloatingEye();eyeSpawnTimer=0;}
else if(floatingEyes.length===1){
const first=floatingEyes[0];
if(first.x<canvas.width*0.7&&eyeSpawnTimer>=1000){spawnFloatingEye();eyeSpawnTimer=0;}
}
laserActive=false;
for(let i=floatingEyes.length-1;i>=0;i--){
const eye=floatingEyes[i];eye.x-=GROUND_SPEED*0.625*getMovementMult();
const screenProgressFromRight=1-(eye.x/canvas.width);
if(eye.state==='idle'){
eye.idleTimer+=dt;
if(screenProgressFromRight>=0.7){
eye.state='firing';eye.fireTimer=0;eye.idleTimer=0;
floatingEyes.forEach(e=>{e.state='firing';e.fireTimer=0;e.idleTimer=0;});
}
}else if(eye.state==='firing'){
eye.fireTimer++;eye.fireFrame=Math.min(5,Math.floor(eye.fireTimer/2));
}
if(eye.x<-100)floatingEyes.splice(i,1);
}
if(floatingEyes.length>=2&&floatingEyes[0].state==='firing'&&floatingEyes[1].state==='firing')laserActive=true;
}

function drawDesertEnemies(){
if(!isDesert()&&!isRainbowMadness())return;
const sfColorMap={'b':'#000000','x':'#553300','p':'#aa6600','y':'#ffcc00'};
sandflies.forEach(sf=>{const frame=sf.frame===0?sandflyFrame1:sandflyFrame2;drawPixelArt(frame,sf.x,sf.y,PIXEL*0.625,sfColorMap);});
const stormColorMap={'f':'rgba(210,170,72,0.78)'};
const ssScale=PIXEL*2.25*1.5;
sandstorms.forEach(ss=>{const fi=Math.floor(ss.frameCounter/8)%4;drawPixelArt(sandstormFrames[fi],ss.x,ss.y,ssScale,stormColorMap);});
const eyeColorMap={'w':'#ffffff','p':'#9933cc','r':'#ff3333','l':'#33ff33','s':'#cccccc','d':'#551a77'};
floatingEyes.forEach(eye=>{
const towerX=eye.x+2*PIXEL*1.125;
const towerTop=eye.y+8*PIXEL*1.125;
const baseY=groundY();
for(let r=0;r<Math.floor((baseY-towerTop)/PIXEL);r++){
ctx.fillStyle=r%3===0?'#8a7040':'#a08850';
ctx.fillRect(towerX,towerTop+r*PIXEL,PIXEL*3,PIXEL);
}
let frame;
if(eye.state==='idle')frame=eyeIdleFrame;
else if(eye.fireFrame<=1)frame=eyeFireFrame12;
else if(eye.fireFrame<=3)frame=eyeFireFrame34;
else frame=eyeFireFrame56;
drawPixelArt(frame,eye.x,eye.y,PIXEL*1.125,eyeColorMap);
});
if(laserActive&&floatingEyes.length>=2){
const e1=floatingEyes[0],e2=floatingEyes[1];
const x1=e1.x+3.5*PIXEL*1.125,y1=e1.y+3.5*PIXEL*1.125;
const x2=e2.x+3.5*PIXEL*1.125,y2=e2.y+3.5*PIXEL*1.125;
const steps=Math.floor(Math.sqrt((x2-x1)**2+(y2-y1)**2)/PIXEL);
const pulse=0.5+0.5*Math.sin(laserFrameCount*0.1);
for(let s=0;s<=steps;s++){
const t=s/steps;
const lx=x1+(x2-x1)*t,ly=y1+(y2-y1)*t;
ctx.fillStyle=s%2===0?'rgba(255,51,51,'+(0.6+0.4*pulse)+')':'rgba(255,170,0,'+(0.4+0.3*pulse)+')';
ctx.fillRect(lx-PIXEL,ly-PIXEL,PIXEL*2,PIXEL*2);
}
laserFrameCount++;
}}

function checkDesertCollisions(){
if(!isDesert()&&!isRainbowMadness())return false;
const _hb=getPlayerHitbox();const pL=_hb.l,pR=_hb.r,pT=_hb.t,pB=_hb.b;
for(const sf of sandflies){const hb=getSandflyHitbox(sf);if(pR>hb.x&&pL<hb.x+hb.w&&pB>hb.y&&pT<hb.y+hb.h)return true;}
for(const eye of floatingEyes){const ew=7*PIXEL*1.125,eh=8*PIXEL*1.125;if(pR>eye.x&&pL<eye.x+ew&&pB>eye.y&&pT<eye.y+eh)return true;}
if(laserActive&&floatingEyes.length>=2){
const e1=floatingEyes[0],e2=floatingEyes[1];
const x1=e1.x+3.5*PIXEL*1.125,y1=e1.y+3.5*PIXEL*1.125;
const x2=e2.x+3.5*PIXEL*1.125,y2=e2.y+3.5*PIXEL*1.125;
for(let s=0;s<=20;s++){const t=s/20;const lx=x1+(x2-x1)*t,ly=y1+(y2-y1)*t;if(lx>pL&&lx<pR&&ly>pT&&ly<pB)return true;}
}
return false;
}

// --- Halloween/Horror stage enemies ---
function spawnGhost(){
ghosts.push({x:canvas.width+rng()*40,y:canvas.height*(0.15+rng()*0.65),baseSpeed:GROUND_SPEED*0.5,state:'moving',pauseTimer:0,teleportTimer:0,checkpointIdx:0,frame:0,frameCounter:0,particles:[]});
}
function updateGhosts(){
if(!isHorror()&&!isRainbowMadness())return;
const dt=getDeltaTime();
ghostSpawnTimer+=dt;
if(ghostSpawnTimer>=3500/getPowerupSpawnRateMult()){spawnGhost();ghostSpawnTimer=0;}
const checkpoints=[0.75,0.5,0.25];
const mMult=getMovementMult();
for(let i=ghosts.length-1;i>=0;i--){
const g=ghosts[i];
g.frameCounter++;if(g.frameCounter%12===0)g.frame=1-g.frame;
if(g.state==='moving'){
g.x-=g.baseSpeed*mMult;
if(g.checkpointIdx<checkpoints.length&&g.x<=canvas.width*checkpoints[g.checkpointIdx]){
g.state='paused';g.pauseTimer=0;g.checkpointIdx++;
}
}else if(g.state==='paused'){
g.pauseTimer+=dt;
if(g.pauseTimer>=600){
g.state='teleport';g.teleportTimer=0;g.particles=[];
for(let p=0;p<10;p++)g.particles.push({dx:(rng()-0.5)*20*PIXEL,dy:(rng()-0.5)*20*PIXEL,life:1});
}
}else if(g.state==='teleport'){
g.teleportTimer+=dt;
g.particles.forEach(function(p){p.life-=dt/300;});
if(g.teleportTimer>=300){
g.x-=(80+rng()*160);
g.y=canvas.height*(0.15+rng()*0.65);
g.state='moving';g.particles=[];
}
}
if(g.x<-150)ghosts.splice(i,1);
}
}
function drawGhosts(){
if(!isHorror()&&!isRainbowMadness())return;
const ghostColorMap={'w':'#f0f0ff','h':'#ffffff','b':'#000000','s':'#c8c8e8','m':'#3a3a5a'};
ghosts.forEach(function(g){
if(g.state==='teleport'){
g.particles.forEach(function(p){if(p.life<=0)return;ctx.fillStyle='rgba(220,200,255,'+Math.max(0,p.life)+')';ctx.fillRect(g.x+4*PIXEL+p.dx,g.y+6*PIXEL+p.dy,PIXEL,PIXEL);});
return;
}
const frame=g.frame===0?ghostFrame1:ghostFrame2;
drawPixelArt(frame,g.x,g.y,PIXEL*1.1,ghostColorMap);
});
}
function checkGhostCollision(){
for(const g of ghosts){
if(g.state==='teleport')continue;
const gw=11*PIXEL*1.1,gh=11*PIXEL*1.1;
if(player.x+8*PIXEL>g.x&&player.x<g.x+gw&&player.y+PLAYER_HEIGHT>g.y&&player.y<g.y+gh)return true;
}
return false;
}

function spawnBatSwarm(){
const count=4+Math.floor(rng()*3);
const baseY=canvas.height*(0.2+rng()*0.5);
for(let i=0;i<count;i++){
bats.push({x:canvas.width+rng()*60+i*20,y:baseY+(rng()-0.5)*60,frame:rng()<0.5?0:1,frameCounter:Math.floor(rng()*10)});
}}
function updateBats(){
if(!isHorror()&&!isSnow()&&!isRainbowMadness())return;
const dt=getDeltaTime();
batSpawnTimer+=dt;
const spawnInterval=5000;
if(batSpawnTimer>=spawnInterval/getPowerupSpawnRateMult()){spawnBatSwarm();batSpawnTimer=0;}
const mMult=getMovementMult();
for(let i=bats.length-1;i>=0;i--){
const b=bats[i];b.x-=GROUND_SPEED*2*mMult;b.frameCounter++;if(b.frameCounter%6===0)b.frame=1-b.frame;
if(b.x<-60)bats.splice(i,1);
}
}
function drawBats(){
if(!isHorror()&&!isSnow()&&!isRainbowMadness())return;
const batColorMap=isSnow()?{'b':'#f0f8ff','r':'#c8d8e8','e':'#2a2a2a'}:{'b':'#1a1a1a','r':'#661111','e':'#ff3333'};
bats.forEach(function(b){const frame=b.frame===0?batFrame1:batFrame2;drawPixelArt(frame,b.x,b.y,PIXEL*0.9,batColorMap);});
}
function checkBatCollision(){
for(const b of bats){const bw=13*PIXEL*0.9,bh=9*PIXEL*0.9;if(player.x+8*PIXEL>b.x&&player.x<b.x+bw&&player.y+PLAYER_HEIGHT>b.y&&player.y<b.y+bh)return true;}
return false;
}
function checkSnowCollisions(){
if(!isSnow())return false;
return checkBatCollision();
}

// Eye lasers reuse the desert eye tower's exact sprite frames and idle->firing state machine
// (same screen-progress trigger at 70%, same staggered two-eye spawn timing). Only the pupil/laser
// color and movement pattern differ: purple = stationary, blue = linear vertical bob, green = orbit
// each other. These are pure floating eyes now - no tower shaft. Only one color spawns per pair.
const HORROR_EYE_COLOR_MAPS={
'purple':{'w':'#e8d8ff','p':'#9933cc','r':'#ff3333','l':'#33ff33','s':'#c8b8e0','d':'#5a1a8a'},
'blue':{'w':'#d8e8ff','p':'#3388ff','r':'#ff3333','l':'#33ff33','s':'#b8d0e8','d':'#1a4a8a'},
'green':{'w':'#d8ffe0','p':'#33cc55','r':'#ff3333','l':'#33ff33','s':'#b8e8c8','d':'#1a7a3a'}
};
function makeHorrorEye(x,y,color,mode){
return{x:x,y:y,color:color,mode:mode,firing:false,fireFrame:0,fireTimer:0,idleTimer:0,state:'idle'};
}
function planHorrorEyePair(){
const color=['purple','blue','green'][Math.floor(rng()*3)];
const minY=canvas.height*0.2,maxY=canvas.height*0.75;
if(color==='purple'){
const y1=minY+rng()*(maxY-minY-40);
const y2=y1+40+rng()*40;
return{color:color,mode:'static',y1:y1,y2:y2};
}else if(color==='blue'){
const midY=minY+rng()*(maxY-minY-90);
return{color:color,mode:'vertical',y1:midY,y2:midY+90,amp1:50+rng()*30,amp2:50+rng()*30};
}else{
const cy=minY+rng()*(maxY-minY);
return{color:color,mode:'orbit',y1:cy,y2:cy,radius:35};
}
}
function spawnHorrorEyeFromPlan(p,which){
const y=which===0?p.y1:p.y2;
const e=makeHorrorEye(canvas.width,y,p.color,p.mode);
if(p.mode==='vertical'){e.baseY=y;e.phase=which===0?0:Math.PI;e.amp=which===0?p.amp1:p.amp2;}
else if(p.mode==='orbit'){e.angle=which===0?0:Math.PI;e.cy=p.y1;e.radius=p.radius;}
horrorEyes.push(e);
}
function updateHorrorEyes(){
if(!isHorror()&&!isRainbowMadness())return;
const dt=getDeltaTime();
horrorEyeSpawnTimer+=dt;
if(horrorEyes.length===0&&horrorEyeSpawnTimer>=1500){
horrorPendingPlan=planHorrorEyePair();
spawnHorrorEyeFromPlan(horrorPendingPlan,0);
horrorEyeSpawnTimer=0;
}else if(horrorEyes.length===1&&horrorPendingPlan){
const first=horrorEyes[0];
if(first.x<canvas.width*0.7&&horrorEyeSpawnTimer>=1000){
spawnHorrorEyeFromPlan(horrorPendingPlan,1);
horrorPendingPlan=null;
horrorEyeSpawnTimer=0;
}
}
horrorLaserActive=false;
const mMult=getMovementMult();
for(let i=horrorEyes.length-1;i>=0;i--){
const eye=horrorEyes[i];
eye.x-=GROUND_SPEED*0.625*mMult;
const screenProgressFromRight=1-(eye.x/canvas.width);
if(eye.state==='idle'){
eye.idleTimer+=dt;
if(screenProgressFromRight>=0.7){
eye.state='firing';eye.fireTimer=0;eye.idleTimer=0;
horrorEyes.forEach(function(e){e.state='firing';e.fireTimer=0;e.idleTimer=0;});
}
}else if(eye.state==='firing'){
eye.fireTimer++;eye.fireFrame=Math.min(5,Math.floor(eye.fireTimer/2));
}
if(eye.mode==='vertical'){eye.phase+=0.04;eye.y=eye.baseY+Math.sin(eye.phase)*eye.amp;}
if(eye.mode==='orbit')eye.angle+=0.05;
if(eye.x<-100)horrorEyes.splice(i,1);
}
for(const eye of horrorEyes){
if(eye.mode==='orbit'){eye.drawX=eye.x+Math.cos(eye.angle)*eye.radius;eye.drawY=eye.cy+Math.sin(eye.angle)*eye.radius;}
else{eye.drawX=eye.x;eye.drawY=eye.y;}
}
if(horrorEyes.length>=2&&horrorEyes[0].state==='firing'&&horrorEyes[1].state==='firing')horrorLaserActive=true;
}
function drawHorrorEyes(){
if(!isHorror()&&!isRainbowMadness())return;
horrorEyes.forEach(function(eye){
const cmap=HORROR_EYE_COLOR_MAPS[eye.color]||HORROR_EYE_COLOR_MAPS.purple;
let frame;
if(eye.state==='idle')frame=eyeIdleFrame;
else if(eye.fireFrame<=1)frame=eyeFireFrame12;
else if(eye.fireFrame<=3)frame=eyeFireFrame34;
else frame=eyeFireFrame56;
drawPixelArt(frame,eye.drawX,eye.drawY,PIXEL*1.125,cmap);
});
if(horrorLaserActive&&horrorEyes.length>=2){
const e1=horrorEyes[0],e2=horrorEyes[1];
const x1=e1.drawX+3.5*PIXEL*1.125,y1=e1.drawY+3.5*PIXEL*1.125;
const x2=e2.drawX+3.5*PIXEL*1.125,y2=e2.drawY+3.5*PIXEL*1.125;
const steps=Math.max(1,Math.floor(Math.sqrt((x2-x1)**2+(y2-y1)**2)/PIXEL));
const pulse=0.5+0.5*Math.sin(horrorLaserFrameCount*0.1);
const laserColors={'purple':['rgba(153,51,204,','rgba(220,150,255,'],'blue':['rgba(51,120,220,','rgba(150,210,255,'],'green':['rgba(51,200,90,','rgba(160,255,180,']};
const lc=laserColors[e1.color]||laserColors.purple;
for(let s=0;s<=steps;s++){
const t=s/steps;
const lx=x1+(x2-x1)*t,ly=y1+(y2-y1)*t;
ctx.fillStyle=s%2===0?lc[0]+(0.6+0.4*pulse)+')':lc[1]+(0.4+0.3*pulse)+')';
ctx.fillRect(lx-PIXEL,ly-PIXEL,PIXEL*2,PIXEL*2);
}
horrorLaserFrameCount++;
}}
function checkHorrorEyeCollision(){
if(horrorEyes.length===0)return false;
const _hb=getPlayerHitbox();const pL=_hb.l,pR=_hb.r,pT=_hb.t,pB=_hb.b;
for(const eye of horrorEyes){
const ew=7*PIXEL*1.125,eh=8*PIXEL*1.125;
if(pR>eye.drawX&&pL<eye.drawX+ew&&pB>eye.drawY&&pT<eye.drawY+eh)return true;
}
if(horrorLaserActive&&horrorEyes.length>=2){
const e1=horrorEyes[0],e2=horrorEyes[1];
const x1=e1.drawX+3.5*PIXEL*1.125,y1=e1.drawY+3.5*PIXEL*1.125;
const x2=e2.drawX+3.5*PIXEL*1.125,y2=e2.drawY+3.5*PIXEL*1.125;
for(let s=0;s<=20;s++){const t=s/20;const lx=x1+(x2-x1)*t,ly=y1+(y2-y1)*t;if(lx>pL&&lx<pR&&ly>pT&&ly<pB)return true;}
}
return false;
}
function checkHorrorCollisions(){
if(!isHorror()&&!isRainbowMadness())return false;
return checkGhostCollision()||checkBatCollision()||checkHorrorEyeCollision();
}

// Meteors are drawn rotated around a pivot, so a plain axis-aligned box misses badly.
// These 3 sample points trace the actual diagonal rock shape through that same rotation.
function getMeteorHitPoints(m){
const frame=meteorFrames[m.frame];
const mScale=PIXEL*0.9;
const h=frame.length*mScale;
const px=2*mScale,py=h-2*mScale;
const theta=m.angle+Math.PI;
const cos=Math.cos(theta),sin=Math.sin(theta);
const localPoints=[{x:1*mScale,y:1*mScale},{x:3.5*mScale,y:6.1*mScale},{x:6*mScale,y:11*mScale}];
return localPoints.map(function(lp){
const dx=lp.x-px,dy=lp.y-py;
return{x:m.x+cos*dx-sin*dy,y:m.y+sin*dx+cos*dy,r:1.8*mScale};
});
}
function spawnMeteor(){
    const rockColor = ['#222222','#8B4513','#666666'][Math.floor(rng()*3)];

    // random angle but biased down-left
    let angle = Math.PI * 0.75 + rng() * Math.PI * 0.5;

    let speed = GROUND_SPEED * (0.8 + rng() * 0.6) * getEnemySpeedMult();

    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;

    meteors.push({
        x: canvas.width * (0.3 + rng() * 0.7),
        y: -PIXEL * 15,
        vx: vx,
        vy: vy,
        angle: angle,   // IMPORTANT for rotation
        frame: Math.floor(rng() * 4),
        frameCounter: 0,
        rockColor: rockColor
    });
}
function spawnUfo(){
ufos.push({x:canvas.width+50,y:canvas.height*(0.1+rng()*0.5),state:'approach',speed:GROUND_SPEED*0.8*getEnemySpeedMult(),frameCounter:0,dodgeDir:0,dodgeDist:0,dodgeTarget:9*PIXEL*4,pauseTimer:0,dodgeTrigger:[0.25,0.5,0.7][Math.floor(rng()*3)]});
}
function spawnAlienTower(){
alienTowers.push({x:canvas.width,spawnX:canvas.width,state:'idle',idleTime:(1500+rng()*2000)*0.67,timer:0,chargeFrame:0,targetX:0,targetY:0,fired:false});
}

function updateSpaceEnemies(){
if(!isSpace()&&!isRainbowMadness())return;
const dt=getDeltaTime();
meteorSpawnTimer+=dt;if(meteorSpawnTimer>=900/getPowerupSpawnRateMult()){spawnMeteor();meteorSpawnTimer=0;}
for(let i=meteors.length-1;i>=0;i--){const m=meteors[i];m.x+=m.vx;m.y+=m.vy;m.frameCounter++;if(m.frameCounter%8===0)m.frame=(m.frame+1)%4;if(m.y>canvas.height+100||m.x<-200)meteors.splice(i,1);}

ufoSpawnTimer+=dt;if(ufoSpawnTimer>=3500/getPowerupSpawnRateMult()){spawnUfo();ufoSpawnTimer=0;}
for(let i=ufos.length-1;i>=0;i--){
const u=ufos[i];u.frameCounter++;
if(u.state==='approach'){u.x-=u.speed;if(u.x<=canvas.width*u.dodgeTrigger){u.state='dodge';u.dodgeDir=rng()<0.5?-1:1;u.dodgeDist=0;}}
else if(u.state==='dodge'){const moveY=u.speed*u.dodgeDir;u.y+=moveY;u.x-=u.speed*0.3;u.dodgeDist+=Math.abs(moveY);if(u.dodgeDist>=u.dodgeTarget){u.state='pause';u.pauseTimer=0;}}
else if(u.state==='pause'){u.pauseTimer+=dt;if(u.pauseTimer>=1000){u.state='dash';}}
else if(u.state==='dash'){u.x-=u.speed*3;}
if(u.x<-200)ufos.splice(i,1);
}

alienTowerSpawnTimer+=dt;if(alienTowerSpawnTimer>=4500/getPowerupSpawnRateMult()&&alienTowers.length<2){spawnAlienTower();alienTowerSpawnTimer=0;}
for(let i=alienTowers.length-1;i>=0;i--){
const t=alienTowers[i];t.x-=GROUND_SPEED*getMovementMult();t.timer+=dt;
// Towers open fire once they've covered 65% of the distance from their spawn point to the player.
const totalDist=t.spawnX-player.x;
const progress=totalDist>0?(t.spawnX-t.x)/totalDist:1;
const inRange=progress>=0.65;
if(t.state==='idle'){if(t.timer>=t.idleTime&&inRange){t.state='charging';t.timer=0;t.chargeFrame=0;}}
else if(t.state==='charging'){
const frameDur=300;
if(t.timer>=frameDur){t.chargeFrame++;t.timer=0;
// Snapshot the player's position once, at chargeFrame 4 - the bolt then travels
// in a straight line to that fixed point rather than homing on the player.
if(t.chargeFrame===4){t.targetX=player.x+4*PIXEL;t.targetY=player.y+PLAYER_HEIGHT/2;}
if(t.chargeFrame>=6){
const tY=groundY()-alienTowerIdle.length*PIXEL;
alienBolts.push({x:t.x+3.5*PIXEL,y:tY,tx:t.targetX,ty:t.targetY,progress:0});
t.state='idle';t.timer=0;t.idleTime=1500+rng()*2000;t.chargeFrame=0;
}}
}
if(t.x<-100)alienTowers.splice(i,1);
}
// Projectile speed slowed by 50% (was progress+=0.04 per frame).
for(let i=alienBolts.length-1;i>=0;i--){alienBolts[i].progress+=0.02;if(alienBolts[i].progress>=1)alienBolts.splice(i,1);}
}

function drawSpaceEnemies(){
if(!isSpace()&&!isRainbowMadness())return;
const mScale=PIXEL*0.9;
meteors.forEach(m=>{
    const cmap = Object.assign({}, colorMap, {f: m.rockColor});

    const frame = meteorFrames[m.frame];

    const mScale = PIXEL * 0.9;

    const w = frame[0].length * mScale;
    const h = frame.length * mScale;

    // pivot (your custom center point)
    const px = 2 * mScale;
    const py = h - (2 * mScale);

    ctx.save();

    // move to meteor position
    ctx.translate(m.x, m.y);

    // rotate around pivot
    ctx.rotate(m.angle + Math.PI);

    // shift so pivot becomes origin
    ctx.translate(-px, -py);

    drawPixelArt(frame, 0, 0, mScale, cmap);

    ctx.restore();
});
const ufoColorMap={'c':'#66ffcc','y':'#cccccc','k':'#333333','p':'#ff44ff','x':'#44ff44','h':'#ccffee','s':'#888888'};
ufos.forEach(u=>{const fi=Math.floor(u.frameCounter/6)%3;drawPixelArt(ufoFrames[fi],u.x,u.y,PIXEL,ufoColorMap);});
const towerColorMap={'l':'#00ff00','k':'#333333','c':'#00cccc','r':'#ff3333','x':'#ff6600','h':'#7ecbe0'};
alienTowers.forEach(t=>{
let frame;if(t.state==='idle')frame=alienTowerIdle;else frame=alienTowerCharge[Math.min(t.chargeFrame,5)];
const tY=groundY()-frame.length*PIXEL;
drawPixelArt(frame,t.x,tY,PIXEL,towerColorMap);
});
alienBolts.forEach(b=>{
const cx=b.x+(b.tx-b.x)*b.progress;const cy=b.y+(b.ty-b.y)*b.progress;
ctx.fillStyle='#ff3333';ctx.beginPath();ctx.arc(cx,cy,PIXEL*2.5,0,Math.PI*2);ctx.fill();
ctx.fillStyle='#ffaa00';ctx.beginPath();ctx.arc(cx,cy,PIXEL*1.2,0,Math.PI*2);ctx.fill();
});
}

function checkSpaceCollisions(){
if(!isSpace()&&!isRainbowMadness())return false;
const _hb=getPlayerHitbox();const pL=_hb.l,pR=_hb.r,pT=_hb.t,pB=_hb.b;
for(const m of meteors){const pts=getMeteorHitPoints(m);for(const p of pts){if(pR>p.x-p.r&&pL<p.x+p.r&&pB>p.y-p.r&&pT<p.y+p.r)return true;}}
for(const u of ufos){const uw=11*PIXEL,uh=9*PIXEL;if(pR>u.x&&pL<u.x+uw&&pB>u.y&&pT<u.y+uh)return true;}
for(const t of alienTowers){const tw=7*PIXEL,th=12*PIXEL;const tY=groundY()-th;if(pR>t.x&&pL<t.x+tw&&pB>tY&&pT<tY+th)return true;}
for(const b of alienBolts){const cx=b.x+(b.tx-b.x)*b.progress;const cy=b.y+(b.ty-b.y)*b.progress;if(cx+PIXEL*2>pL&&cx-PIXEL*2<pR&&cy+PIXEL*2>pT&&cy-PIXEL*2<pB)return true;}
return false;
}

function addCoins(amount){
runCoins+=Math.max(0,Number(amount)||0);
}
function spawnCoin(){
if(coins.length>=getMaxCoinsOnScreen())return;
const type=shopState.owned.silverSpawn&&rng()<0.05?'silver':'gold';
coins.push({x:canvas.width,y:canvas.height*(0.15+rng()*0.7),frameCounter:0,type:type,value:Math.round((type==='silver'?getSilverCoinValue():getRegularCoinValue())*10)/10});
}
function spawnMagnet(){
if(!shopState.owned.magnet)return;
magnets.push({x:canvas.width+20,y:canvas.height*(0.18+rng()*0.62),frameCounter:0});
}
function updateDeathCoins(){
if(!shopState.owned.deathCoin)return;
const key=getStageRunKey();
if(key!==deathCoinStageKey){
deathCoinStageKey=key;
deathCoins.push({x:canvas.width+80,y:canvas.height*(0.18+rng()*0.62),frameCounter:0});
}
}
function updateCoins(){
const dt=getDeltaTime();
const wMult=getWorldSpeedMult();
coinSpawnTimer+=dt;
const spawnInterval=(COIN_SPAWN_INTERVAL*0.8)/(1+(shopState.levels.coinNumbers||0)*0.5);
if(coinSpawnTimer>=spawnInterval){spawnCoin();coinSpawnTimer=0;}
for(let i=coins.length-1;i>=0;i--){
const c=coins[i];
if(magnetActiveTimer>0){
const dx=player.x-c.x,dy=(player.y+PLAYER_HEIGHT/2)-c.y;
const dist=Math.max(1,Math.sqrt(dx*dx+dy*dy));
c.x+=(dx/dist)*GROUND_SPEED*2.8;c.y+=(dy/dist)*GROUND_SPEED*2.8;
}else c.x-=GROUND_SPEED*wMult;
c.frameCounter++;if(c.x<-50)coins.splice(i,1);
}
if(shopState.owned.magnet){magnetSpawnTimer+=dt;if(magnetSpawnTimer>=12000){spawnMagnet();magnetSpawnTimer=0;}}
if(magnetActiveTimer>0)magnetActiveTimer-=dt;
for(let i=magnets.length-1;i>=0;i--){magnets[i].x-=GROUND_SPEED*wMult;magnets[i].frameCounter++;if(magnets[i].x<-80)magnets.splice(i,1);}
updateDeathCoins();
for(let i=deathCoins.length-1;i>=0;i--){deathCoins[i].x-=GROUND_SPEED*wMult;deathCoins[i].frameCounter++;if(deathCoins[i].x<-80)deathCoins.splice(i,1);}
}
function drawCoins(){
coins.forEach(coin=>{
const s=PIXEL*2.5;
if(coin.type==='silver'){ctx.fillStyle='#eeeeee';ctx.beginPath();ctx.arc(coin.x+s,coin.y+s,s,0,Math.PI*2);ctx.fill();ctx.fillStyle='#9fa8b3';ctx.beginPath();ctx.arc(coin.x+s,coin.y+s,s*0.5,0,Math.PI*2);ctx.fill();}
else{ctx.fillStyle='#ffdd00';ctx.beginPath();ctx.arc(coin.x+s,coin.y+s,s,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff9900';ctx.beginPath();ctx.arc(coin.x+s,coin.y+s,s*0.5,0,Math.PI*2);ctx.fill();}
});
deathCoins.forEach(function(coin){const s=PIXEL*2.7;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(coin.x+s,coin.y+s,s,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000000';ctx.beginPath();ctx.arc(coin.x+s,coin.y+s,s*0.45,0,Math.PI*2);ctx.fill();});
magnets.forEach(function(m){drawPixelArt(magnetData,m.x,m.y+Math.sin(m.frameCounter*0.08)*PIXEL,PIXEL*0.9,{'b':'#000000','r':'#e43b44','x':'#777777','y':'#ffffff','h':'#ff9999'});});
if(magnetActiveTimer>0){ctx.strokeStyle='rgba(102,255,204,0.45)';ctx.lineWidth=PIXEL;ctx.beginPath();ctx.arc(player.x+6*PIXEL,player.y+PLAYER_HEIGHT/2,PIXEL*18,0,Math.PI*2);ctx.stroke();}
}
function checkCoinCollision(){
const _hb=getPlayerHitbox();const pL=_hb.l,pR=_hb.r,pT=_hb.t,pB=_hb.b;
for(let i=coins.length-1;i>=0;i--){const s=PIXEL*2.5;const c=coins[i];if(pR>c.x&&pL<c.x+s*2&&pB>c.y&&pT<c.y+s*2){addCoins(c.value);coins.splice(i,1);}}
for(let i=magnets.length-1;i>=0;i--){const s=PIXEL*2.8;const m=magnets[i];if(pR>m.x&&pL<m.x+s*4&&pB>m.y&&pT<m.y+s*4){magnets.splice(i,1);openMemoryGame('magnet');}}
for(let i=deathCoins.length-1;i>=0;i--){const s=PIXEL*2.7;const d=deathCoins[i];if(pR>d.x&&pL<d.x+s*2&&pB>d.y&&pT<d.y+s*2){deathCoinCollected++;deathCoins.splice(i,1);}}
}

function getStageRunKey(){return Math.floor(score/STAGE_DURATION);}
function planFuelCansForStage(){
fuelCanPlan=[];
const count=rng()<0.55?1:2;
const slots=count===1?[0.45]:[0.28,0.68];
for(let i=0;i<count;i++)fuelCanPlan.push({time:STAGE_DURATION*slots[i]+rng()*2500,spawned:false});
}
function spawnFuelCan(){fuelCans.push({x:canvas.width+20,y:canvas.height*(0.18+rng()*0.58),frameCounter:0});}
function updateFuelCans(){
const key=getStageRunKey();
if(key!==fuelStageKey){fuelStageKey=key;planFuelCansForStage();}
const stageTime=score%STAGE_DURATION;
fuelCanPlan.forEach(function(slot){if(!slot.spawned&&stageTime>=slot.time){spawnFuelCan();slot.spawned=true;}});
for(let i=fuelCans.length-1;i>=0;i--){fuelCans[i].x-=GROUND_SPEED*getWorldSpeedMult();fuelCans[i].frameCounter++;if(fuelCans[i].x<-120)fuelCans.splice(i,1);}
}
function drawFuelCans(){
const cmap=Object.assign({},colorMap,{'r':'#e43b44','u':'#8f1d2c','y':'#f5c542'});
fuelCans.forEach(function(can){
const bob=Math.sin(can.frameCounter*0.08)*PIXEL*1.5;
drawPixelArt(fuelCanData,can.x,can.y+bob,PIXEL*0.5,cmap);
});
}
function checkFuelCanCollision(){
const _hb=getPlayerHitbox();const pL=_hb.l,pR=_hb.r,pT=_hb.t,pB=_hb.b;
for(let i=fuelCans.length-1;i>=0;i--){
const scale=PIXEL*0.9;const can=fuelCans[i];const w=20*scale,h=22*scale;
if(pR>can.x&&pL<can.x+w&&pB>can.y&&pT<can.y+h){fuelCans.splice(i,1);openMemoryGame('fuel');return;}
}
}
function shuffleList(items){
const copy=items.slice();
for(let i=copy.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=copy[i];copy[i]=copy[j];copy[j]=t;}
return copy;
}
function getMemoryPairs(count){
return QuestionManager.getRandomSet(count||4, rng);
}
// kind is 'fuel', 'magnet', or 'headstart'. All three share this match-pairs quiz;
// the only difference is the question count and what the reward means when finished.
function openMemoryGame(kind){
kind=kind||'fuel';
player.isClicking=false;player.vy=0;
const pairs=getMemoryPairs(4);
const cards=[];
pairs.forEach(function(pair,idx){
cards.push({pair:idx,type:'term',text:pair.term,matched:false});
cards.push({pair:idx,type:'definition',text:pair.definition,matched:false});
});
memoryGame={active:true,cards:shuffleList(cards),selected:[],matched:0,wrong:0,reward:0,kind:kind,finished:false,success:false};
document.getElementById('memory-title').textContent=kind==='fuel'?'FUEL CHALLENGE':kind==='magnet'?'MAGNET CHALLENGE':'HEADSTART BOOST CHALLENGE';
renderMemoryGame();
memoryScreen.style.display='flex';
}
function finishMemoryGame(){
memoryGame.finished=true;
if(memoryGame.kind==='headstart'){
memoryGame.success=(memoryGame.wrong===0);
}else if(memoryGame.kind==='fuel'||memoryGame.kind==='magnet'){
memoryGame.reward=getQuizTierReward(memoryGame.kind,memoryGame.wrong);
}
renderMemoryGame();
}
function closeMemoryGame(apply){
const kind=memoryGame.kind;
if(apply){
if(kind==='fuel')fuel=Math.min(getFuelCapacity(),fuel+(memoryGame.reward||0));
else if(kind==='magnet')magnetActiveTimer=memoryGame.reward||0;
else if(kind==='headstart')applyHeadstartBoost(memoryGame.success);
}
memoryGame={active:false,cards:[],selected:[],matched:0,wrong:0,reward:0,kind:null,finished:false};
if(memoryScreen)memoryScreen.style.display='none';
if(apply&&(kind==='fuel'||kind==='magnet')){
clearLeftPortionEnemies();
postQuizCountdownActive=true;postQuizCountdownValue=3;postQuizCountdownTimer=0;
}
}
function renderMemoryGame(){
if(!memoryGame.active)return;
memoryGrid.innerHTML='';
if(!memoryGame.finished){
const capForStatus=(memoryGame.kind==='fuel'||memoryGame.kind==='magnet')?getQuizWrongCap():2;
memoryStatus.textContent=QuestionManager.getBankName()+' | Misses: '+memoryGame.wrong+'/'+capForStatus+' | Match all cards';
}
memoryGame.cards.forEach(function(card,idx){
const btn=document.createElement('button');
btn.type='button';
btn.className='memory-card';
if(card.matched)btn.className+=' matched';
if(memoryGame.selected.indexOf(idx)!==-1)btn.className+=' selected';
btn.textContent=card.text;
btn.disabled=card.matched||memoryGame.finished;
btn.addEventListener('click',function(e){e.stopPropagation();chooseMemoryCard(idx);});
memoryGrid.appendChild(btn);
});
if(memoryGame.finished){
if(memoryGame.kind==='headstart'){
memoryStatus.textContent=memoryGame.success?'All correct! Boost activated for run start.':'Not quite - no boost this run.';
memoryFinish.textContent='START RUN';
}else if(memoryGame.kind==='fuel'){
memoryStatus.textContent='Misses: '+memoryGame.wrong+' | Fuel reward: '+Math.round(memoryGame.reward);
memoryFinish.textContent='ADD FUEL';
}else if(memoryGame.kind==='magnet'){
memoryStatus.textContent='Misses: '+memoryGame.wrong+' | Magnet time: '+(memoryGame.reward/1000).toFixed(1)+'s';
memoryFinish.textContent='ACTIVATE MAGNET';
}
memoryFinish.style.display='block';
}else{
memoryFinish.style.display='none';
}
}
function chooseMemoryCard(idx){
if(!memoryGame.active||memoryGame.finished)return;
const card=memoryGame.cards[idx];
if(card.matched||memoryGame.selected.indexOf(idx)!==-1||memoryGame.selected.length>=2)return;
memoryGame.selected.push(idx);renderMemoryGame();
if(memoryGame.selected.length===2){
const a=memoryGame.cards[memoryGame.selected[0]],b=memoryGame.cards[memoryGame.selected[1]];
if(a.pair===b.pair&&a.type!==b.type){
a.matched=true;b.matched=true;memoryGame.matched+=2;memoryGame.selected=[];
recordQuestionCorrect();
PlatformManager.recordQuestionAnswered(GAME_CONFIG.id,true);
if(memoryGame.kind==='fuel'||memoryGame.kind==='magnet')addCoins(2);
if(memoryGame.matched===memoryGame.cards.length){finishMemoryGame();}
renderMemoryGame();
}else{
memoryGame.wrong++;
PlatformManager.recordQuestionAnswered(GAME_CONFIG.id,false);
PlatformManager.deductCoins(10);
const cap=(memoryGame.kind==='fuel'||memoryGame.kind==='magnet')?getQuizWrongCap():2;
if(memoryGame.wrong>=cap){
setTimeout(function(){memoryGame.selected=[];finishMemoryGame();},650);
}else{
setTimeout(function(){memoryGame.selected=[];renderMemoryGame();},650);
}
}
}
}

function spawnObstacle(){
if(isDesert()||isSpace()||isHorror()||isSnow())return;
const roll=rng();
let type;if(roll<0.4)type='pteranodon';else if(roll<0.6)type='pteranodon-blue';else type='trex';
const isAir=type.startsWith('pteranodon');
const baseY=isAir?canvas.height*(0.2+rng()*0.5):groundY()-110;
obstacles.push({x:canvas.width,y:baseY,type:type,frameCounter:0,baseY:isAir?baseY:0,sizeScale:0.9+rng()*0.2,jumpTimer:0,jumpActive:false,startFrame:type==='trex'?Math.floor(rng()*2):0});
}

function updateObstacles(){
if(!(isDesert()||isSpace()||isHorror()||isSnow())){
obstacleSpawnTimer+=getDeltaTime();
if(obstacleSpawnTimer>=SPAWN_INTERVAL/getPowerupSpawnRateMult()){spawnObstacle();obstacleSpawnTimer=0;}
}
for(let i=obstacles.length-1;i>=0;i--){
const mMult=getMovementMult();
const obs=obstacles[i];obs.x-=GROUND_SPEED*mMult;obs.frameCounter++;
if(obs.type.startsWith('pteranodon')){
const amplitude=obs.type==='pteranodon-blue'?60*1.5*1.5:20;
obs.y=obs.baseY+Math.sin(obs.frameCounter*0.05*-0.37)*amplitude;
const extraSpeed=obs.type==='pteranodon-blue'?GROUND_SPEED*0.25*2.2:obs.type==='pteranodon'?GROUND_SPEED*0.25:0;
obs.x-=extraSpeed*mMult;
}else if(obs.type==='trex'){
if(rng()<0.005){obs.jumpActive=true;obs.jumpTimer=0;}
if(obs.jumpActive){obs.jumpTimer++;const jumpHeight=Math.sin((obs.jumpTimer/30)*Math.PI)*40*PIXEL;obs.y=(groundY()+60)-jumpHeight;if(obs.jumpTimer>=30){obs.jumpActive=false;obs.y=groundY()-60;}}
}
if(obs.x<-200)obstacles.splice(i,1);
}}

function drawObstacles(){
obstacles.forEach(obs=>{
const fi=Math.floor(obs.frameCounter/8)%3;
if(obs.type==='pteranodon'){
const f=fi===0?pteranodonData1:fi===1?pteranodonData2:pteranodonData3;
drawPixelArt(f,obs.x,obs.y,PIXEL*obs.sizeScale);
}else if(obs.type==='pteranodon-blue'){
const f=fi===0?pteranodonData1:fi===1?pteranodonData2:pteranodonData3;
drawPixelArt(f,obs.x,obs.y,PIXEL*obs.sizeScale,{'l':'#3366ff','y':'#6699ff','r':'#ff2222'});
}else if(obs.type==='trex'){
const f=(Math.floor(obs.frameCounter/10)+obs.startFrame)%2===0?trexData1:trexData2;
drawPixelArt(f,obs.x,obs.y,PIXEL*1.5*obs.sizeScale);
}
});}

function checkObstacleCollision(){
const pL = player.x + 2 * PLAYER_SCALE;
const pR = player.x + 10 * PLAYER_SCALE;

const pT = player.y + 2 * PLAYER_SCALE;
const pB = player.y + 20 * PLAYER_SCALE;
for(const obs of obstacles){
let w,h;
if(obs.type.startsWith('pteranodon')){w=18*PIXEL*obs.sizeScale;h=11*PIXEL*obs.sizeScale;}
else{w=13*PIXEL*1.5*obs.sizeScale;h=16*PIXEL*1.5*obs.sizeScale;}
if(pR>obs.x&&pL<obs.x+w&&pB>obs.y&&pT<obs.y+h)return true;
}
return false;
}

function drawHitboxDebug(){
if(!DEBUG_HITBOX)return;
ctx.save();
ctx.fillStyle='rgba(255,0,255,0.28)';
ctx.strokeStyle='rgba(255,0,255,0.95)';
ctx.lineWidth=2;
function box(x,y,w,h){ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}
// Player
const pL=player.x+2*PLAYER_SCALE,pR=player.x+10*PLAYER_SCALE,pT=player.y+2*PLAYER_SCALE,pB=player.y+20*PLAYER_SCALE;
box(pL,pT,pR-pL,pB-pT);
if(isSnow()){
const cb=getCaveBoundsAtPlayer();
ctx.beginPath();ctx.moveTo(0,cb.top);ctx.lineTo(canvas.width,cb.top);ctx.stroke();
ctx.beginPath();ctx.moveTo(0,cb.bottom);ctx.lineTo(canvas.width,cb.bottom);ctx.stroke();
}
// Stage 1 obstacles (dinosaurs/pteranodons)
obstacles.forEach(function(obs){
let w,h;
if(obs.type.startsWith('pteranodon')){w=18*PIXEL*obs.sizeScale;h=11*PIXEL*obs.sizeScale;}
else{w=13*PIXEL*1.5*obs.sizeScale;h=16*PIXEL*1.5*obs.sizeScale;}
box(obs.x,obs.y,w,h);
});
// Desert stage enemies
sandflies.forEach(function(sf){const hb=getSandflyHitbox(sf);box(hb.x,hb.y,hb.w,hb.h);});
floatingEyes.forEach(function(eye){box(eye.x,eye.y,7*PIXEL*1.125,8*PIXEL*1.125);});
if(laserActive&&floatingEyes.length>=2){
const e1=floatingEyes[0],e2=floatingEyes[1];
const x1=e1.x+3.5*PIXEL*1.125,y1=e1.y+3.5*PIXEL*1.125;
const x2=e2.x+3.5*PIXEL*1.125,y2=e2.y+3.5*PIXEL*1.125;
ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
}
// Space stage enemies
meteors.forEach(function(m){getMeteorHitPoints(m).forEach(function(p){ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.stroke();});});
ufos.forEach(function(u){box(u.x,u.y,11*PIXEL,9*PIXEL);});
alienTowers.forEach(function(t){const th=12*PIXEL;box(t.x,groundY()-th,7*PIXEL,th);});
alienBolts.forEach(function(b){const cx=b.x+(b.tx-b.x)*b.progress,cy=b.y+(b.ty-b.y)*b.progress;box(cx-PIXEL*2,cy-PIXEL*2,PIXEL*4,PIXEL*4);});
// Horror stage enemies
ghosts.forEach(function(g){if(g.state==='teleport')return;box(g.x,g.y,11*PIXEL*1.1,11*PIXEL*1.1);});
bats.forEach(function(b){box(b.x,b.y,13*PIXEL*0.9,9*PIXEL*0.9);});
horrorEyes.forEach(function(e){box(e.drawX,e.drawY,7*PIXEL*1.125,8*PIXEL*1.125);});
if(horrorLaserActive&&horrorEyes.length>=2){
const he1=horrorEyes[0],he2=horrorEyes[1];
const hx1=he1.drawX+3.5*PIXEL*1.125,hy1=he1.drawY+3.5*PIXEL*1.125;
const hx2=he2.drawX+3.5*PIXEL*1.125,hy2=he2.drawY+3.5*PIXEL*1.125;
ctx.beginPath();ctx.moveTo(hx1,hy1);ctx.lineTo(hx2,hy2);ctx.stroke();
}
ctx.restore();
}
function clearActiveThreats(){
obstacles=[];sandflies=[];sandstorms=[];floatingEyes=[];meteors=[];ufos=[];alienTowers=[];alienBolts=[];laserActive=false;
ghosts=[];bats=[];horrorEyes=[];horrorLaserActive=false;
}
function tryShieldBlock(){
if(shieldCharges<=0)return false;
shieldCharges--;player.vy=0;player.y=Math.min(Math.max(player.y,20),groundY()-PLAYER_HEIGHT-20);clearActiveThreats();return true;
}
// Rolls the prize for a single death coin. Used once per correct/incorrect quiz answer
// on the Game Over screen (see openDeathCoinQuiz / chooseDeathAnswer below).
function rollSingleDeathCoinPrize(){
let bonus=Math.min(0.4,deathCoinPity*0.02);
const roll=rng();
let won=true,msg='';
if(roll<0.08+bonus){finalScore=Math.floor(finalScore*1.1);msg='Score x1.1';}
else if(roll<0.14+bonus){finalScore=Math.floor(finalScore*1.3);msg='Score x1.3';}
else if(roll<0.17+bonus){finalScore=Math.floor(finalScore*2);msg='Score x2';}
else if(roll<0.18+bonus){finalScore=Math.floor(finalScore*5);msg='Score x5';}
else if(roll<0.30+bonus){addCoins(75);msg='+75 coins';}
else if(roll<0.60+bonus){addCoins(25);msg='+25 coins';}
else if(roll<0.80+bonus){addCoins(50);msg='+50 coins';}
else if(roll<0.92+bonus){addCoins(100);msg='+100 coins';}
else won=false;
if(won){deathCoinPity=0;}else deathCoinPity++;
localStorage.setItem(DEATH_PITY_KEY,deathCoinPity);
if(finalScore>highScore){highScore=finalScore;localStorage.setItem('pixelJetpackHighScore',highScore);PlatformManager.setHighScore(GAME_CONFIG.id,highScore);}
return msg||'No prize this time. Next chance improved.';
}
function endGame(){
PlatformManager.endPracticeRun();
gameOver=true;
gameOverUIReady=false;
const wipe=document.getElementById('screenWipe');
const reveal=function(){
gameOverUIReady=true;
if(wipe)wipe.classList.remove('wipe');
showPixelGameOverPanel();
};
if(wipe){wipe.classList.add('wipe');setTimeout(reveal,750);}
else reveal();
deathRewardMessage='';
finalScore=Math.floor(score);
lastCoinResult=PlatformManager.settleAccuracyCoins(GAME_CONFIG.id,Math.floor(runCoins));
window.ChallengeManager?.finish?.({score:finalScore,distance:Math.floor(score),alive:false});
if(activePowerupEffects.highscore)finalScore=Math.floor(finalScore*(1+0.25*activePowerupEffects.highscore.correct));
if(finalScore>highScore){highScore=finalScore;localStorage.setItem('pixelJetpackHighScore',highScore);PlatformManager.setHighScore(GAME_CONFIG.id,highScore);lastRunWasNewHigh=true;}else{lastRunWasNewHigh=false;}
totalDeathCount++;
localStorage.setItem('pixelJetpackDeathCount',totalDeathCount);
if(totalDeathCount>=5&&(totalDeathCount-5)%15===0)forceRainbowNextRun=true;
activePowerupEffects={};
powerupUnlockAlert='';
const newlyUnlocked=[];
POWERUP_DEFS.forEach(function(p){
if(totalQuestionsCorrect>=p.unlockAt&&announcedPowerupUnlocks.indexOf(p.id)===-1){
announcedPowerupUnlocks.push(p.id);
newlyUnlocked.push(p.name);
}
});
if(newlyUnlocked.length>0){
localStorage.setItem('pixelJetpackAnnouncedPowerups',JSON.stringify(announcedPowerupUnlocks));
powerupUnlockAlert='\ud83c\udf89 New Powerup Unlocked: '+newlyUnlocked.join(', ')+'!';
}
}
// Death Coin flow: Game Over screen -> [USE DEATH COIN] -> multichoice quiz (1 term, 4 definitions)
// -> reward rolled and shown -> back to Game Over screen (with updated score/coins) -> can use again.
// The game-over action returns to the game's home screen so the shop and
// refreshed totals are available before the next run.
function showPixelGameOverPanel(){
document.getElementById('pixel-final-score').textContent='Final Score: '+finalScore;
document.getElementById('pixel-final-coins').textContent='\ud83e\ude99 Coins: '+PlatformManager.getCoins();
if(lastCoinResult)document.getElementById('pixel-final-coins').textContent+=` · ${lastCoinResult.accuracyPercent}% accuracy · ${lastCoinResult.coinsAwarded} awarded from ${Math.floor(runCoins)} raw (+15%)`;
document.getElementById('pixel-new-high').style.display=lastRunWasNewHigh?'block':'none';
document.getElementById('pixel-death-message').textContent=buildDeathMessage();
const alertEl=document.getElementById('pixel-powerup-alert');
if(powerupUnlockAlert){alertEl.textContent=powerupUnlockAlert;alertEl.style.display='block';}else{alertEl.style.display='none';}
const coinBtn=document.getElementById('pixel-deathcoin-btn');
if(deathCoinCollected>0){coinBtn.style.display='block';coinBtn.textContent='USE DEATH COIN ('+deathCoinCollected+')';}else{coinBtn.style.display='none';}
document.getElementById('pixel-gameover-screen').style.display='flex';
}
function hidePixelGameOverPanel(){
document.getElementById('pixel-gameover-screen').style.display='none';
}
document.getElementById('pixel-playagain-btn').addEventListener('click',function(){hidePixelGameOverPanel();showHomeScreen();});
document.getElementById('pixel-shop-btn').addEventListener('click',function(){hidePixelGameOverPanel();openShop();});
document.getElementById('pixel-deathcoin-btn').addEventListener('click',function(){hidePixelGameOverPanel();openDeathCoinQuiz();});

function playAgainFromGameOver(){
if(!QuestionManager.hasQuestions()){showHomeScreen();return;}
showHome=false;homeScreen.style.display='none';
resetGame();
gameStarted=false;
beginPreRunSequence();
}
function openDeathCoinQuiz(){
if(deathCoinCollected<=0)return;
if(!QuestionManager.questions||QuestionManager.questions.length<4)return;
const correct=QuestionManager.getRandomQuestion(rng);
let wrongPool=QuestionManager.getDistractors(correct,3,rng);
const options=shuffleList([{text:correct.definition,correct:true}].concat(wrongPool.map(function(c){return{text:c.definition,correct:false};})));
deathQuiz={active:true,term:correct.term,options:options,resultMessage:''};
document.getElementById('memory-title').textContent='DEATH COIN CHALLENGE';
renderDeathQuiz();
memoryScreen.style.display='flex';
}
function renderDeathQuiz(){
if(!deathQuiz.active)return;
memoryGrid.innerHTML='';
if(!deathQuiz.resultMessage){
memoryStatus.textContent='TERM: '+deathQuiz.term+' - choose the correct definition ('+deathCoinCollected+' coin'+(deathCoinCollected===1?'':'s')+' left)';
deathQuiz.options.forEach(function(opt,idx){
const btn=document.createElement('button');
btn.type='button';btn.className='memory-card';btn.textContent=opt.text;
btn.addEventListener('click',function(e){e.stopPropagation();chooseDeathAnswer(idx);});
memoryGrid.appendChild(btn);
});
memoryFinish.style.display='none';
}else{
memoryStatus.textContent=deathQuiz.resultMessage;
memoryFinish.style.display='block';
memoryFinish.textContent=deathCoinCollected>0?'USE ANOTHER DEATH COIN':'BACK TO GAME OVER';
}
}
function chooseDeathAnswer(idx){
if(!deathQuiz.active||deathQuiz.resultMessage)return;
const opt=deathQuiz.options[idx];
deathCoinCollected--;
PlatformManager.recordQuestionAnswered(GAME_CONFIG.id,!!opt.correct);
if(!opt.correct)PlatformManager.deductCoins(10);
let prize;
if(opt.correct){recordQuestionCorrect();prize=rollSingleDeathCoinPrize();}
else{deathCoinPity++;localStorage.setItem(DEATH_PITY_KEY,deathCoinPity);prize='No prize this time. Next chance improved.';}
deathQuiz.resultMessage=(opt.correct?'Correct! ':'Incorrect. ')+prize;
renderDeathQuiz();
}
function closeDeathQuiz(){
deathQuiz={active:false,term:'',options:[],resultMessage:''};
if(memoryScreen)memoryScreen.style.display='none';
if(gameOver)showPixelGameOverPanel();
}

// Pre-run powerup quizzes: each selected powerup runs its own 4-question multichoice round
// (same term+4-definitions format as the death coin quiz) before the run's countdown begins.
// How many of the 4 you get right sets that powerup's strength for the run only.
function beginPreRunSequence(){
powerupQuizQueue=PlatformManager.powerupsAllowed()?selectedPowerups.slice():[];
selectedPowerups=[];
saveSelectedPowerups();
activePowerupEffects={};
advancePreRunQueue();
}
function advancePreRunQueue(){
if(powerupQuizQueue.length>0){
const id=powerupQuizQueue.shift();
openPowerupQuiz(id);
}else if(shopState.owned.headstartBoost&&QuestionManager.hasQuestions()){
openMemoryGame('headstart');
}
}
function openPowerupQuiz(id){
const def=POWERUP_DEFS.find(function(p){return p.id===id;});
const cardCount=QuestionManager.questions?QuestionManager.questions.length:0;
if(!def||cardCount<4){
activePowerupEffects[id]={correct:0};
advancePreRunQueue();
return;
}
const questions=QuestionManager.getRandomSet(4, rng).map(function(c){
const wrongPool=QuestionManager.getDistractors(c,3,rng);
const options=shuffleList([{text:c.definition,correct:true}].concat(wrongPool.map(function(w){return{text:w.definition,correct:false};})));
return{term:c.term,options:options};
});
powerupQuizActive={id:id,name:def.name,questions:questions,index:0,correct:0,finished:false};
document.getElementById('memory-title').textContent=def.name.toUpperCase()+' BONUS ROUND';
renderPowerupQuiz();
memoryScreen.style.display='flex';
}
function renderPowerupQuiz(){
if(!powerupQuizActive)return;
memoryGrid.innerHTML='';
if(!powerupQuizActive.finished){
const q=powerupQuizActive.questions[powerupQuizActive.index];
memoryStatus.textContent='Question '+(powerupQuizActive.index+1)+'/4 - TERM: '+q.term;
q.options.forEach(function(opt,idx){
const btn=document.createElement('button');
btn.type='button';btn.className='memory-card';btn.textContent=opt.text;
btn.addEventListener('click',function(e){e.stopPropagation();choosePowerupAnswer(idx);});
memoryGrid.appendChild(btn);
});
memoryFinish.style.display='none';
}else{
memoryStatus.textContent=powerupQuizActive.name+': '+powerupQuizActive.correct+'/4 correct!';
memoryFinish.style.display='block';
memoryFinish.textContent='CONTINUE';
}
}
function choosePowerupAnswer(idx){
if(!powerupQuizActive||powerupQuizActive.finished)return;
const q=powerupQuizActive.questions[powerupQuizActive.index];
const wasCorrect=!!q.options[idx].correct;
PlatformManager.recordQuestionAnswered(GAME_CONFIG.id,wasCorrect);
if(!wasCorrect)PlatformManager.deductCoins(10);
if(wasCorrect){powerupQuizActive.correct++;recordQuestionCorrect();}
powerupQuizActive.index++;
if(powerupQuizActive.index>=powerupQuizActive.questions.length){
activePowerupEffects[powerupQuizActive.id]={correct:powerupQuizActive.correct};
powerupQuizActive.finished=true;
}
renderPowerupQuiz();
}
function closePowerupQuiz(){
powerupQuizActive=null;
if(memoryScreen)memoryScreen.style.display='none';
advancePreRunQueue();
}

function applyBoost(){
if(fuel<=0){player.isClicking=false;return;}
player.vy=BOOST_FORCE;
fuel=Math.max(0,fuel-getFuelDrainCost());
if(fuel<=0)player.isClicking=false;
}

function getCanvasPoint(e){
const rect=canvas.getBoundingClientRect();
return{x:e.clientX-rect.left,y:e.clientY-rect.top};
}
function isPointInRect(pt,r){return r&&pt.x>=r.x&&pt.x<=r.x+r.w&&pt.y>=r.y&&pt.y<=r.y+r.h;}
window.addEventListener('keydown',function(e){
if(e.code==='Space'){
e.preventDefault();
if(showHome||memoryGame.active||deathQuiz.active||powerupQuizActive||gameOver)return;
if(!player.inputDisabled&&fuel>0)player.isClicking=true;
}
});
window.addEventListener('keyup',function(e){if(e.code==='Space')player.isClicking=false;});
canvas.addEventListener('mousedown',function(){if(!showHome&&!gameOver&&!memoryGame.active&&!deathQuiz.active&&!powerupQuizActive&&!player.inputDisabled&&fuel>0)player.isClicking=true;});
canvas.addEventListener('mouseup',function(){player.isClicking=false;});
canvas.addEventListener('touchstart',function(e){if(!showHome&&!gameOver&&!memoryGame.active&&!deathQuiz.active&&!powerupQuizActive&&!player.inputDisabled&&fuel>0){e.preventDefault();player.isClicking=true;}},{passive:false});
canvas.addEventListener('touchend',function(){player.isClicking=false;});

function update(){
if(showHome||gameOver||memoryGame.active||deathQuiz.active||powerupQuizActive)return;
const delta=getDeltaTime();
if(postQuizCountdownActive){
postQuizCountdownTimer+=delta;
if(postQuizCountdownTimer>=1000){postQuizCountdownValue--;postQuizCountdownTimer=0;if(postQuizCountdownValue<0)postQuizCountdownActive=false;}
return;
}
if(!gameStarted){
countdownTime+=delta;
if(countdownTime>=1000){countdownValue--;countdownTime=0;if(countdownValue<0)gameStarted=true;}
return;
}
if(headstartBoostTimer>0){headstartBoostTimer=Math.max(0,headstartBoostTimer-delta);}
if(headstartImmuneTimer>0){headstartImmuneTimer=Math.max(0,headstartImmuneTimer-delta);}
score+=delta*getScoreMultiplier();runElapsedMs+=delta;checkStageChange();
if(isJetCharacter('chimera')&&!player.isClicking)fuel=Math.min(getFuelCapacity(),fuel+delta*.003);
if(player.isClicking&&!player.inputDisabled)applyBoost();
if(player.isClicking){player.fireFrame=(player.fireFrame+1)%4;}else{player.fireFrame=0;}
player.vy+=getGravity();
const ceilingThreshold=canvas.height*0.05;
if(player.y<ceilingThreshold)player.vy+=CEILING_REPEL_FORCE;
player.y+=player.vy;player.frameCounter++;
const immune=headstartImmuneTimer>0;
if(isSnow()){
const cb=getCaveBoundsAtPlayer();
if(!immune&&player.y>=cb.bottom-PLAYER_HEIGHT){
lastDeathCause='cave-floor';
endGame();
return;
}
if(player.y<cb.top)player.y=cb.top;
if(player.y>cb.bottom-PLAYER_HEIGHT)player.y=cb.bottom-PLAYER_HEIGHT;
}else{
if(!immune&&player.y>=groundY()-PLAYER_HEIGHT){
lastDeathCause='ground';
endGame();
return;
}
if(player.y<0)player.y=0;
if(player.y>groundY()-PLAYER_HEIGHT)player.y=groundY()-PLAYER_HEIGHT;
}
updateObstacles();updateCoins();updateFuelCans();updateDesertEnemies();spawnDesertElements();updateSpaceEnemies();
updateGhosts();updateBats();updateHorrorEyes();spawnHorrorElements();
updateSnowstorms();
updateRainbowMadness();
const hitObstacle=checkObstacleCollision();
const hitDesert=!hitObstacle&&checkDesertCollisions();
const hitSpace=!hitObstacle&&!hitDesert&&checkSpaceCollisions();
const hitHorror=!hitObstacle&&!hitDesert&&!hitSpace&&checkHorrorCollisions();
const hitSnow=!hitObstacle&&!hitDesert&&!hitSpace&&!hitHorror&&checkSnowCollisions();
if(!immune&&(hitObstacle||hitDesert||hitSpace||hitHorror||hitSnow)){
lastDeathCause=hitObstacle?'obstacle':hitDesert?'desert':hitSpace?'space':hitHorror?'horror':'snow';
if(!tryShieldBlock())endGame();
return;
}
checkCoinCollision();checkFuelCanCollision();groundOffset+=VISUAL_SPEED*getWorldSpeedMult();caveScrollX+=GROUND_SPEED*getWorldSpeedMult();
}

function draw(){
if(showHome)return;
const idx=getCurrentStageIndex();const ti=getTransitionInfo();
let grad=ctx.createLinearGradient(0,0,0,canvas.height);
if(ti.transitioning){
const fromTop=getStageSkyTop(ti.from),fromBot=getStageSkyBottom(ti.from);
const toTop=getStageSkyTop(ti.to),toBot=getStageSkyBottom(ti.to);
grad.addColorStop(0,interpolateColor(fromTop,toTop,ti.alpha));
grad.addColorStop(1,interpolateColor(fromBot,toBot,ti.alpha));
}else{grad.addColorStop(0,getStageSkyTop(idx));grad.addColorStop(1,getStageSkyBottom(idx));}
ctx.fillStyle=grad;ctx.fillRect(0,0,canvas.width,canvas.height);

if(gameStarted){
if (isSpace()) {
    ctx.save();
    ctx.filter = "blur(2px)"; // or whatever blur you use

    drawSpaceStars();

    ctx.restore();
}
drawClouds();drawMountains();drawTrees();drawGround();drawObstacles();drawDesertEnemies();drawSpaceEnemies();drawGhosts();drawBats();drawHorrorEyes();drawUnicorn();drawCoins();drawFuelCans();
}

const PLAYER_SCALE = PIXEL * 0.35;
const JETPACK_SCALE = PIXEL * 0.35;
const FIRE_SCALE = PIXEL * 0.35;

const jetpackX = player.x - 2 * PLAYER_SCALE;
const jetpackY = player.y + 15 * PLAYER_SCALE;

// Draw jetpack FIRST (behind player)
drawPixelArt(jetpackData, jetpackX, jetpackY, JETPACK_SCALE, getActiveJetpackColorMap());

const fi = Math.floor(player.frameCounter/6)%2;
let cf = fi===0 ? playerData1 : playerData2;
if(isJetCharacter('chimera')){const sx=player.x+10*PLAYER_SCALE,sy=player.y+7*PLAYER_SCALE,p=.5+.5*Math.sin(performance.now()/120);ctx.save();ctx.fillStyle='#11152d';ctx.fillRect(sx-10,sy-5,28,34);ctx.globalAlpha=.45;ctx.fillStyle='#ff4fc8';ctx.fillRect(sx-15,sy+p*8,10,26);ctx.fillStyle='#55f4ff';ctx.fillRect(sx+18,sy+(1-p)*8,10,26);ctx.globalAlpha=1;ctx.fillStyle='#55f4ff';ctx.fillRect(sx-5,sy,8,5);ctx.fillStyle='#ff4fc8';ctx.fillRect(sx+8,sy,8,5);ctx.fillStyle='#ffe36e';ctx.fillRect(sx+3,sy+12,7,10);ctx.restore();
}else if(isJetCharacter('skeleton')){
const sx=player.x+10*PLAYER_SCALE,sy=player.y+4*PLAYER_SCALE,ps=Math.max(2,PLAYER_SCALE*2);ctx.save();ctx.fillStyle='#eee7d0';ctx.fillRect(sx-4*ps,sy,8*ps,6*ps);ctx.fillStyle='#16131c';ctx.fillRect(sx-2.5*ps,sy+2*ps,1.5*ps,1.5*ps);ctx.fillRect(sx+1*ps,sy+2*ps,1.5*ps,1.5*ps);ctx.fillStyle='#d7ceb5';ctx.fillRect(sx-1.5*ps,sy+6*ps,3*ps,9*ps);ctx.fillRect(sx-5*ps,sy+7*ps,3.5*ps,1.5*ps);ctx.fillRect(sx+1.5*ps,sy+7*ps,3.5*ps,1.5*ps);ctx.fillRect(sx-4*ps,sy+15*ps,2*ps,8*ps);ctx.fillRect(sx+2*ps,sy+15*ps,2*ps,8*ps);ctx.restore();
}else drawPixelArt(cf, player.x, player.y, PLAYER_SCALE, getActivePlayerColorMap());
if(sharedJetpackReward('skin')?.id==='jetpack-journey_time_traveller_outfit'){
const cx=player.x+10*PLAYER_SCALE,cy=player.y+8*PLAYER_SCALE,t=performance.now()/700;ctx.save();ctx.strokeStyle='#e9c46a';ctx.lineWidth=2;ctx.shadowColor='#8ff6ff';ctx.shadowBlur=7;ctx.beginPath();ctx.arc(cx,cy,8*PLAYER_SCALE,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(t)*6*PLAYER_SCALE,cy+Math.sin(t)*6*PLAYER_SCALE);ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(-t*2)*4*PLAYER_SCALE,cy+Math.sin(-t*2)*4*PLAYER_SCALE);ctx.stroke();ctx.fillStyle='#8ff6ff';ctx.fillRect(player.x+2*PLAYER_SCALE,player.y-2*PLAYER_SCALE,5*PLAYER_SCALE,2*PLAYER_SCALE);ctx.restore();
}

if(player.isClicking&&player.fireFrame>0){
const fireX = jetpackX - 9 * PLAYER_SCALE;
const fireY = jetpackY + 3 * PLAYER_SCALE;

if(isJetCharacter('skeleton')){ctx.save();ctx.fillStyle='#efe8d0';for(let i=0;i<7;i++){const bx=fireX-i*8-((player.fireFrame+i)%2)*3,by=fireY+((i*5)%15);ctx.fillRect(bx,by,8,3);ctx.fillRect(bx-2,by-2,3,3);ctx.fillRect(bx+7,by+2,3,3);}ctx.restore();}else drawFireEffect(fireX,fireY);
}

drawSnowstormOverlay();
if(gameStarted)drawHitboxDebug();

if((!gameStarted||postQuizCountdownActive)&&!gameOver){
ctx.fillStyle='rgba(10,10,10,0.55)';ctx.fillRect(0,0,canvas.width,canvas.height);
ctx.fillStyle='#e94560';ctx.font='700 68px "Courier New", monospace';
ctx.textAlign='center';ctx.textBaseline='middle';
ctx.shadowColor='rgba(233,69,96,0.7)';ctx.shadowBlur=24;
ctx.fillText(Math.max(1,postQuizCountdownActive?postQuizCountdownValue:countdownValue),canvas.width/2,canvas.height/2);
ctx.shadowBlur=0;
}
if(gameStarted&&!gameOver){
ctx.textBaseline='top';
updatePixelHud();
// Top-middle: fuel
const fuelCap=getFuelCapacity();
drawHudLabel('FUEL',canvas.width/2,16,'center','#e94560',21);
const barW=Math.min(260,canvas.width*0.35),barH=14,barX=canvas.width/2-barW/2,barY=50;
ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fillRect(barX-6,barY-6,barW+12,barH+34);
ctx.fillStyle='#150826';ctx.fillRect(barX,barY,barW,barH);
ctx.fillStyle=fuel/fuelCap>0.3?'#2ecc71':'#e74c3c';ctx.fillRect(barX,barY,barW*(fuel/fuelCap),barH);
ctx.strokeStyle='#6a0572';ctx.lineWidth=2;ctx.strokeRect(barX,barY,barW,barH);
ctx.textAlign='center';ctx.fillStyle='#ffffff';ctx.font='600 18px "Lexend", sans-serif';
ctx.fillText(Math.floor((fuel/fuelCap)*100)+'%',canvas.width/2,barY+barH+6);
}else{
hidePixelHud();
}
if(gameOver&&gameOverUIReady){
ctx.fillStyle='rgba(10,10,10,0.7)';ctx.fillRect(0,0,canvas.width,canvas.height);
}}

function interpolateColor(c1,c2,t){
const r1=parseInt(c1.slice(1,3),16),g1=parseInt(c1.slice(3,5),16),b1=parseInt(c1.slice(5,7),16);
const r2=parseInt(c2.slice(1,3),16),g2=parseInt(c2.slice(3,5),16),b2=parseInt(c2.slice(5,7),16);
const r=Math.round(r1+(r2-r1)*t),g=Math.round(g1+(g2-g1)*t),b=Math.round(b1+(b2-b1)*t);
return '#'+r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0');
}

let homeBgObstacles=[];
function initHomeBgObstacles(){
homeBgObstacles=[];
const types=['pteranodon','pteranodon-blue','trex','sandfly','eye','meteor','ufo','ghost','bat','snowbat','unicorn','horror-eye-blue','horror-eye-green','alien-tower'];
for(let i=0;i<15;i++){
homeBgObstacles.push({type:types[Math.floor(Math.random()*types.length)],x:Math.random()*canvas.width,y:Math.random()*canvas.height,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*2,frame:0,fc:Math.floor(Math.random()*100)});
}}
initHomeBgObstacles();

function drawHomeBg(){
const hbg=document.getElementById('home-bg');
if(!hbg)return;
const hctx=hbg.getContext('2d');
if(!hctx)return;
hctx.clearRect(0,0,hbg.width,hbg.height);
hctx.fillStyle='#1a1a2e';hctx.fillRect(0,0,hbg.width,hbg.height);
homeBgObstacles.forEach(function(o){
o.x+=o.vx;o.y+=o.vy;o.fc++;
if(o.x<-100)o.x=hbg.width+50;if(o.x>hbg.width+100)o.x=-50;
if(o.y<-100)o.y=hbg.height+50;if(o.y>hbg.height+100)o.y=-50;
const fi=Math.floor(o.fc/8)%4;
if(o.type==='pteranodon'){const f=fi%3===0?pteranodonData1:fi%3===1?pteranodonData2:pteranodonData3;drawPixelArtCtx(hctx,f,o.x,o.y,PIXEL*1.5);}
else if(o.type==='pteranodon-blue'){const f=fi%3===0?pteranodonData1:fi%3===1?pteranodonData2:pteranodonData3;drawPixelArtCtx(hctx,f,o.x,o.y,PIXEL*1.5,{'l':'#3366ff','y':'#6699ff','r':'#ff2222'});}
else if(o.type==='trex'){const f=fi%2===0?trexData1:trexData2;drawPixelArtCtx(hctx,f,o.x,o.y,PIXEL*1.5);}
else if(o.type==='sandfly'){const f=fi%2===0?sandflyFrame1:sandflyFrame2;drawPixelArtCtx(hctx,f,o.x,o.y,PIXEL*0.625,{'b':'#000000','x':'#553300','p':'#aa6600','y':'#ffcc00'});}
else if(o.type==='eye'){drawPixelArtCtx(hctx,eyeIdleFrame,o.x,o.y,PIXEL*1.5,{'w':'#ffffff','p':'#9933cc','r':'#ff3333','l':'#33ff33','s':'#cccccc','d':'#551a77'});}
else if(o.type==='meteor'){const cmap=Object.assign({},colorMap,{f:'#666666'});drawPixelArtCtx(hctx,meteorFrames[fi%4],o.x,o.y,PIXEL*1.2,cmap);}
else if(o.type==='ufo'){drawPixelArtCtx(hctx,ufoFrames[fi%3],o.x,o.y,PIXEL,{'c':'#66ffcc','y':'#cccccc','k':'#333333','p':'#ff44ff','x':'#44ff44','h':'#ccffee','s':'#888888'});}
else if(o.type==='ghost'){const f=fi%2===0?ghostFrame1:ghostFrame2;drawPixelArtCtx(hctx,f,o.x,o.y,PIXEL*1.1,{'w':'#f0f0ff','h':'#ffffff','b':'#000000','s':'#c8c8e8','m':'#3a3a5a'});}
else if(o.type==='bat'){const f=fi%2===0?batFrame1:batFrame2;drawPixelArtCtx(hctx,f,o.x,o.y,PIXEL*0.9,{'b':'#1a1a1a','r':'#661111','e':'#ff3333'});}
else if(o.type==='snowbat'){const f=fi%2===0?batFrame1:batFrame2;drawPixelArtCtx(hctx,f,o.x,o.y,PIXEL*0.9,{'b':'#f0f8ff','r':'#c8d8e8','e':'#2a2a2a'});}
else if(o.type==='unicorn'){const f=fi%2===0?unicornFrame1:unicornFrame2;drawPixelArtCtx(hctx,f,o.x,o.y,PIXEL*1.3,unicornColorMap);}
else if(o.type==='horror-eye-blue'){drawPixelArtCtx(hctx,eyeIdleFrame,o.x,o.y,PIXEL*1.5,HORROR_EYE_COLOR_MAPS.blue);}
else if(o.type==='horror-eye-green'){drawPixelArtCtx(hctx,eyeIdleFrame,o.x,o.y,PIXEL*1.5,HORROR_EYE_COLOR_MAPS.green);}
else if(o.type==='alien-tower'){drawPixelArtCtx(hctx,alienTowerIdle,o.x,o.y,PIXEL*1.2,{'l':'#00ff00','k':'#333333','c':'#00cccc','r':'#ff3333','x':'#ff6600','h':'#7ecbe0'});}
});
}

function updateHomeStats(){document.getElementById('stat-deaths').textContent=totalDeathCount;document.getElementById('stat-highscore').textContent=highScore;document.getElementById('stat-correct').textContent=totalQuestionsCorrect;document.getElementById('stat-coins').textContent=PlatformManager.getCoins();}
function showHomeScreen(){
showHome=true;homeScreen.style.display='flex';updateHomeStats();initHomeBgObstacles();ctx.clearRect(0,0,canvas.width,canvas.height);
startBtn.textContent='PRESS START';
codePanel.style.display='block';
codeMessage.textContent=PlatformManager.hasClassCode() ? '' : 'Please enter the class code before playing.';
codeMessage.style.color='#ffdd00';
}
function setSessionMessage(message,isError){
codeMessage.textContent=message;
codeMessage.style.color=isError?'#ff7777':'#ffdd00';
}
// Resolves a session code through QuestionManager, which owns loading,
// validating and normalising the term/definition card bank. Throws with a
// user-facing message on failure, same contract this function always had.
async function loadCurrentQuestionPack(){
const result=await QuestionManager.loadCurrentBank(QUESTION_BANK_TYPE);
if(!result.ok){
if(result.error==='class-code-required')throw new Error('Please enter the class code before playing.');
throw new Error('Question bank could not be loaded. Return to the Hub and check the class code.');
}
return result;
}
async function handleStartClick(){
if(sessionLoading)return;
try{
sessionLoading=true;startBtn.disabled=true;setSessionMessage('LOADING SESSION...',false);
await loadCurrentQuestionPack();
}catch(err){
QuestionManager.questions=null;QuestionManager.bankName='';QuestionManager.bankCode='';
setSessionMessage(err.message||'SESSION CODE NOT FOUND',true);
sessionLoading=false;startBtn.disabled=false;
return;
}
sessionLoading=false;startBtn.disabled=false;
// One PlatformManager session per sitting — Play Again from the game-over
// screen re-runs beginPreRunSequence() directly without going through
// handleStartClick(), so it doesn't start a new one.
PlatformManager.startSession(GAME_CONFIG.id);
showHome=false;homeScreen.style.display='none';resetGame();gameStarted=false;
beginPreRunSequence();
}

startBtn.addEventListener('click',function(e){e.stopPropagation();handleStartClick();});
startBtn.addEventListener('touchend',function(e){e.preventDefault();e.stopPropagation();handleStartClick();});
shopBtn.addEventListener('click',function(e){e.stopPropagation();openShop();});
shopClose.addEventListener('click',function(e){e.stopPropagation();closeShop();});
document.querySelectorAll('.shop-tab-btn').forEach(function(btn){
btn.addEventListener('click',function(e){e.stopPropagation();switchShopTab(btn.getAttribute('data-tab'));});
});
shopScreen.addEventListener('mousedown',function(e){e.stopPropagation();});
shopScreen.addEventListener('touchstart',function(e){e.stopPropagation();},{passive:false});
memoryScreen.addEventListener('mousedown',function(e){e.stopPropagation();});
memoryScreen.addEventListener('touchstart',function(e){e.stopPropagation();},{passive:false});
memoryFinish.addEventListener('click',function(e){
e.stopPropagation();
if(deathQuiz.active){
if(deathCoinCollected>0)openDeathCoinQuiz();else closeDeathQuiz();
}else if(powerupQuizActive){
closePowerupQuiz();
}else{
closeMemoryGame(true);
}
});

function loop(){
const now=performance.now();
currentDelta=Math.min(now-lastFrameTime,50);
lastFrameTime=now;
if(shopMessageTimer>0){shopMessageTimer--;if(shopMessageTimer===0)shopMessage.textContent='';}
// Reports whether the player is actively playing right now (matches the
// same guard update() uses to skip gameplay logic during quizzes/menus/
// countdowns) so PlatformManager can track "active play time" separately
// from total session time. Cheap - in-memory only, safe every frame.
const isActivelyPlaying=gameStarted&&!showHome&&!gameOver&&!memoryGame.active&&!deathQuiz.active&&!powerupQuizActive&&!postQuizCountdownActive;
PlatformManager.heartbeat(GAME_CONFIG.id,isActivelyPlaying);
if(isActivelyPlaying)window.ChallengeManager?.update?.({score:Math.floor(score),distance:Math.floor(score),alive:true});
update();draw();
if(showHome)drawHomeBg();
requestAnimationFrame(loop);
}
showHomeScreen();
const registerJetpackChallenge=()=>window.ChallengeManager?.register?.({start:()=>{if(showHome&&!sessionLoading)startBtn.click();},snapshot:()=>({score:Math.floor(score),distance:Math.floor(score),alive:!gameOver})});
if(window.ChallengeManager)registerJetpackChallenge();else window.addEventListener('arcade-challenge-manager-ready',registerJetpackChallenge,{once:true});
loadCurrentQuestionPack().then(
  () => setSessionMessage('QUESTION BANK READY',false),
  error => setSessionMessage(error.message,true)
);
loop();
})();
