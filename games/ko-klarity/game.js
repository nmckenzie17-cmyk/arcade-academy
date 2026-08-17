(function(){
"use strict";

const GLOBAL_BODY_FONT = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'sans-serif';
const GLOBAL_TITLE_FONT = getComputedStyle(document.documentElement).getPropertyValue('--font-title').trim() || 'monospace';

// ======================================================================
// CONFIG — tweak numbers here
// ======================================================================
const CFG = {
  GROUND_Y: 420,
  ARENA_L: 60, ARENA_R: 900,
  GRAVITY: 0.85,
  JUMP_V: -15.5,
  MOVE_SPEED: 4.1,
  BLOCK_SPEED_MULT: 0.4,
  DASH_SPEED: 11,

  PLAYER_MAX_HP: 100,
  HEAL_PERCENT: 0.15,

  LIGHT: {dmg: 5, startup: 6, active: 4, recovery: 10, knockback: 3, range: 131, meterGain: 8},
  HEAVY: {dmg: 13, startup: 16, active: 6, recovery: 24, knockback: 9, range: 149, meterGain: 14},
  SPECIAL: {dmg: 26, knockback: 16, meterMax: 100, chipMeterOnHit: 6},

  HITSTUN: 14,
  BLOCK_DMG_MULT: 0.25,
  BLOCK_KB_MULT: 0.3,

  BOSS_EVERY: 5,
};

const RNG = Math.random;
function randInt(a,b){return Math.floor(RNG()*(b-a+1))+a;}
function choice(arr){return arr[Math.floor(RNG()*arr.length)];}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

// ======================================================================
// SPECIAL ATTACK DEFINITIONS — one unique special per archetype/boss/player.
// Timings are generous (active window) so multi-hit specials always have
// room to land every hit before recovery cuts them off.
// ======================================================================
const SPECIAL_DEFS = {
  // player: eye-laser — huge single hit, but ZERO damage if blocked
  eyelaser:      {startup:16, active:14, recovery:26, dmg:CFG.HEAVY.dmg*4, knockback:CFG.HEAVY.knockback*2},
  // player alt special: cosmetic reskin of the eye laser (same numbers, different FX)
  sonic:         {startup:16, active:14, recovery:26, dmg:CFG.HEAVY.dmg*4, knockback:CFG.HEAVY.knockback*2},
  // player alt special: slow, hits harder than anything else in the game
  lightning:     {startup:24, active:16, recovery:30, dmg:CFG.HEAVY.dmg*5.5, knockback:CFG.HEAVY.knockback*2.6},
  // player alt special: fast multi-hit spinning kick, weaker per hit
  hurricanekick: {startup:8,  active:52, recovery:16, hits:8, hitInterval:6, dmgPerHit:CFG.HEAVY.dmg*0.35, knockbackPerHit:2},
  // brawler: whirling arms — 4 spinning hits that reach both sides
  whirlwind:     {startup:14, active:72, recovery:20, hits:4,  hitInterval:15,  dmgPerHit:CFG.HEAVY.dmg*0.55, knockbackPerHit:4},
  // rushdown: 20 rapid-fire jabs, each far weaker than a heavy punch
  flurry:        {startup:8,  active:100,recovery:16, hits:20, hitInterval:4.4,dmgPerHit:CFG.HEAVY.dmg*0.2,  knockbackPerHit:0.6},
  // tank: one huge shove — always pushes back, but deals 0 damage if blocked
  megapush:      {startup:20, active:14, recovery:28, dmg:CFG.HEAVY.dmg*3,   knockback:CFG.HEAVY.knockback*3.2},
  // defensive: classic fireball projectile
  fireball:      {startup:12, active:8,  recovery:22, dmg:CFG.SPECIAL.dmg,   knockback:CFG.SPECIAL.knockback},
  // zoner: sustained laser, 100 tiny ticks
  megalaser:     {startup:18, active:128,recovery:26, hits:100,hitInterval:1.1,dmgPerHit:CFG.HEAVY.dmg/25},
  // grappler: command grab + slam, ignores blocking
  suplex:        {startup:14, active:16, recovery:30, dmg:CFG.HEAVY.dmg*3,   knockback:CFG.HEAVY.knockback*1.6},
  // champion boss: 5-hit flurry combo burst
  comboburst:    {startup:10, active:72, recovery:20, hits:5,  hitInterval:12, dmgPerHit:CFG.HEAVY.dmg*0.65, knockbackPerHit:3},
  // titan boss: leap + ground-pound AOE
  meteorslam:    {startup:10, active:74, recovery:20, dmg:CFG.HEAVY.dmg*3.4, knockback:CFG.HEAVY.knockback*2.6},
  // shadow boss: teleport behind the opponent and strike
  phantomdash:   {startup:10, active:12, recovery:22, dmg:CFG.HEAVY.dmg*2.4, knockback:CFG.HEAVY.knockback*2},
  // pyro boss: 5-fireball spread
  infernobarrage:{startup:16, active:12, recovery:24, dmgEach:CFG.SPECIAL.dmg*0.55},
  // master boss: counter stance, punishes a hit or strikes at the end
  counterstrike: {startup:2,  active:34, recovery:18, dmgFinal:CFG.HEAVY.dmg*3, knockbackFinal:CFG.HEAVY.knockback*2.4, fallbackDmg:CFG.HEAVY.dmg*1.6},
  // fallback (unused normally)
  default:       {startup:10, active:8,  recovery:22, dmg:CFG.SPECIAL.dmg,   knockback:CFG.SPECIAL.knockback},
};

// Purchasable technique move data (Slide Kick, Uppercut, Ground Pound, Running Attack, Grab).
const TECHNIQUE_DEFS = {
  slidekick:     {startup:6, active:12, recovery:18, dmg:CFG.LIGHT.dmg*1.4,  knockback:6},
  uppercut:      {startup:8, active:8,  recovery:22, dmg:CFG.HEAVY.dmg*0.9, knockback:4},
  groundpound:   {startup:4, active:60, recovery:18, dmg:CFG.HEAVY.dmg*1.6, knockback:10},
  runningattack: {startup:6, active:10, recovery:20, dmg:CFG.HEAVY.dmg*1.2, knockback:10},
  grab:          {startup:8, active:12, recovery:16, dmg:0, knockback:0},
};

// ======================================================================
// META PROGRESSION — persistent coin currency + permanent shop upgrades.
// Saved to localStorage so it survives between sessions.
// ======================================================================
const META_KEY = 'ko_klarity_meta_v1';
const LEGACY_META_KEY = 'ironcircuit_meta_v1';
const GAME_ID = 'ko-klarity';
let classQuestionsReady = false;
function sharedCoins(){ return window.PlatformManager ? PlatformManager.getCoins() : (META?.coins || 0); }
function spendSharedCoins(cost){
  if(window.PlatformManager) return PlatformManager.spendCoins(cost);
  if(META.coins < cost) return false;
  META.coins -= cost;
  return true;
}
const DEFAULT_COSMETICS = {
  owned: { skin:['skin_default'], hair:['hair_auto'], facialhair:['facial_none'], hat:['hat_none'], outfit:['outfit_default'], shoes:['shoes_default'] },
  equipped: { skin:'skin_default', hair:'hair_auto', facialhair:'facial_none', hat:'hat_none', outfit:'outfit_default', shoes:'shoes_default', gender:'male' },
};
const DEFAULT_MOVES = {
  owned: { light:['light_default'], heavy:['heavy_default'], special:['special_default'] },
  equipped: { light:'light_default', heavy:'heavy_default', special:'special_default' },
};
function loadMeta(){
  try{
    const raw = localStorage.getItem(META_KEY) || localStorage.getItem(LEGACY_META_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      const merged = Object.assign({coins:0, purchases:{}, character:'default'}, parsed);
      merged.cosmetics = merged.cosmetics || {};
      merged.cosmetics.owned = Object.assign({}, DEFAULT_COSMETICS.owned, merged.cosmetics.owned);
      merged.cosmetics.equipped = Object.assign({}, DEFAULT_COSMETICS.equipped, merged.cosmetics.equipped);
      merged.moves = merged.moves || {};
      merged.moves.owned = Object.assign({}, DEFAULT_MOVES.owned, merged.moves.owned);
      merged.moves.equipped = Object.assign({}, DEFAULT_MOVES.equipped, merged.moves.equipped);
      return merged;
    }
  }catch(e){}
  return {coins:0, purchases:{}, character:'default',
    cosmetics: JSON.parse(JSON.stringify(DEFAULT_COSMETICS)),
    moves: JSON.parse(JSON.stringify(DEFAULT_MOVES))};
}
function saveMeta(){ try{ localStorage.setItem(META_KEY, JSON.stringify(META)); }catch(e){} }
let META = loadMeta();
function metaLevel(id){ return META.purchases[id] || 0; }

const SHOP_COST_BASE = 100, SHOP_COST_RATE = 1.5;
function shopItemCost(item){
  if(item.cost!==undefined) return item.cost; // flat-priced cosmetics
  return Math.round(SHOP_COST_BASE * Math.pow(SHOP_COST_RATE, metaLevel(item.id)));
}

const SHOP_TABS = [
  {id:'training', label:'Training'},
  {id:'survival', label:'Survival'},
  {id:'economy', label:'Economy'},
  {id:'draft', label:'Draft'},
  {id:'techniques', label:'Techniques'},
  {id:'characters', label:'Characters'},
  {id:'cosmetics', label:'Cosmetics'},
];

const COSMETIC_CATEGORIES = [
  {id:'skin', label:'Skin Tone'},
  {id:'hair', label:'Hairstyle'},
  {id:'facialhair', label:'Facial Hair'},
  {id:'hat', label:'Hat'},
  {id:'outfit', label:'Outfit'},
  {id:'shoes', label:'Shoes'},
];

const COSMETIC_ITEMS = [
  // ---- Skin tone ----
  {id:'skin_default', category:'skin', name:'Tan',    desc:'The default skin tone.', cost:0,   value:'#e8b98c'},
  {id:'skin_fair',     category:'skin', name:'Fair',   desc:'A fair skin tone.',      cost:80,  value:'#f0cba0'},
  {id:'skin_bronze',   category:'skin', name:'Bronze', desc:'A bronze skin tone.',    cost:80,  value:'#c98f63'},
  {id:'skin_olive',    category:'skin', name:'Olive',  desc:'An olive skin tone.',    cost:80,  value:'#a5714a'},
  {id:'skin_deep',     category:'skin', name:'Deep',   desc:'A deep skin tone.',      cost:80,  value:'#7a4a30'},
  {id:'skin_ebony',    category:'skin', name:'Ebony',  desc:'A rich dark skin tone.', cost:80,  value:'#5c3722'},
  // ---- Hair ----
  {id:'hair_auto',     category:'hair', name:'Default',   desc:"Hairstyle matches your fighter's build.", cost:0},
  {id:'hair_short',    category:'hair', name:'Short Cut', desc:'A neat short hairstyle.',   cost:100},
  {id:'hair_ponytail', category:'hair', name:'Ponytail',  desc:'A swinging ponytail.',       cost:100},
  {id:'hair_mohawk',   category:'hair', name:'Mohawk',    desc:'A spiked mohawk.',           cost:150},
  {id:'hair_long',     category:'hair', name:'Long Hair', desc:'Long, flowing hair.',        cost:150},
  {id:'hair_bald',     category:'hair', name:'Bald',      desc:'A clean-shaven head.',       cost:80},
  // ---- Facial hair ----
  {id:'facial_none',     category:'facialhair', name:'Clean Shaven', desc:'No facial hair.',      cost:0},
  {id:'facial_beard',    category:'facialhair', name:'Full Beard',   desc:'A scruffy full beard.', cost:100},
  {id:'facial_goatee',   category:'facialhair', name:'Goatee',       desc:'A trimmed goatee.',     cost:100},
  {id:'facial_mustache', category:'facialhair', name:'Moustache',    desc:'A classic moustache.',  cost:100},
  // ---- Hat ----
  {id:'hat_none',    category:'hat', name:'No Hat',  desc:'Bare-headed.',                    cost:0},
  {id:'hat_cap',     category:'hat', name:'Cap',      desc:'A backwards baseball cap.',       cost:120},
  {id:'hat_bandana', category:'hat', name:'Bandana',  desc:'A tied bandana.',                 cost:120},
  {id:'hat_beanie',  category:'hat', name:'Beanie',   desc:'A snug beanie.',                  cost:120},
  {id:'hat_crown',   category:'hat', name:'Crown',    desc:'A golden crown fit for a champion.', cost:500},
  // ---- Outfit ----
  {id:'outfit_default',   category:'outfit', name:'Classic',    desc:'The default fighting outfit.', cost:0},
  {id:'outfit_tracksuit', category:'outfit', name:'Tracksuit',  desc:'A striped tracksuit look.',     cost:150},
  {id:'outfit_ninja',     category:'outfit', name:'Ninja Gi',   desc:'A traditional gi with a sash.', cost:200},
  {id:'outfit_vest',      category:'outfit', name:'Fight Vest', desc:'An armoured vest.',             cost:200},
  // ---- Shoes ----
  {id:'shoes_default', category:'shoes', name:'Classic', desc:'Standard fight boots.',   cost:0},
  {id:'shoes_neon',    category:'shoes', name:'Neon',    desc:'Glowing neon soles.',      cost:120},
  {id:'shoes_gold',    category:'shoes', name:'Gold',    desc:'Flashy gold trim boots.',  cost:250},
  {id:'shoes_stealth', category:'shoes', name:'Stealth', desc:'All-black stealth boots.', cost:120},
];
function cosmeticById(id){ return COSMETIC_ITEMS.find(c=>c.id===id); }
function ownsCosmetic(item){ return (META.cosmetics.owned[item.category]||[]).includes(item.id); }
function equippedCosmetic(category){ return META.cosmetics.equipped[category]; }

// ======================================================================
// NEW MOVES — purchasable alternative Light/Heavy/Special attacks. Exactly one
// per slot can be equipped at a time (equipping overwrites the previous pick),
// same rule as cosmetics. Each slot has 3 paid options plus the free default:
// one purely cosmetic reskin, one slow-and-powerful, one fast-and-weak.
// ======================================================================
const MOVE_SLOTS = [
  {id:'light', label:'Light Attack'},
  {id:'heavy', label:'Heavy Attack'},
  {id:'special', label:'Special Attack'},
];
const MOVE_KIND_LABEL = {cosmetic:'Cosmetic', power:'Slow & Powerful', fast:'Fast & Weak', default:'Default'};
const MOVE_ITEMS = [
  // ---- Light attack ----
  {id:'light_default',   slot:'light', name:'Classic Combo', desc:'The standard punch-punch-kick combo.', cost:0, kind:'default'},
  {id:'light_twinfists', slot:'light', name:'Twin Fists',    desc:'A flashier double-jab combo. Same speed and damage as the classic combo.', cost:150, kind:'cosmetic'},
  {id:'light_blade',     slot:'light', name:'Blade Flurry',  desc:'A short blade flashes out with each strike. Noticeably slower, but hits much harder.', cost:320, kind:'power'},
  {id:'light_rapid',     slot:'light', name:'Rapid Jabs',    desc:'A blur of quick, light jabs. Much faster, but each hit deals less damage.', cost:220, kind:'fast'},
  // ---- Heavy attack ----
  {id:'heavy_default',     slot:'heavy', name:'Classic Strike', desc:'The standard heavy punch.', cost:0, kind:'default'},
  {id:'heavy_roundhouse',  slot:'heavy', name:'Power Kick',      desc:'A spinning roundhouse kick. Same speed and damage as the classic strike.', cost:150, kind:'cosmetic'},
  {id:'heavy_fireball',    slot:'heavy', name:'Fireball',        desc:'Hurl a blazing fireball at range. Slower to throw, but hits much harder.', cost:380, kind:'power'},
  {id:'heavy_quick',       slot:'heavy', name:'Quick Strike',    desc:'A snappy, shortened heavy attack. Faster, but trades away power.', cost:220, kind:'fast'},
  // ---- Special attack ----
  {id:'special_default',    slot:'special', name:'Eye Laser',       desc:'Twin beams fire from the eyes. Huge damage, but none at all if blocked.', cost:0, kind:'default'},
  {id:'special_sonic',      slot:'special', name:'Sonic Wave',      desc:'A thunderous shockwave blast. Same effect as the Eye Laser, different look.', cost:220, kind:'cosmetic'},
  {id:'special_lightning',  slot:'special', name:'Lightning Storm', desc:'Call down a devastating bolt of lightning. Slow to summon, but the hardest-hitting special.', cost:480, kind:'power'},
  {id:'special_hurricane',  slot:'special', name:'Hurricane Kick',  desc:'A fast spinning multi-hit kick. Weaker per hit, but very quick to unleash.', cost:260, kind:'fast'},
];
function moveById(id){ return MOVE_ITEMS.find(m=>m.id===id); }
function ownsMove(item){ return (META.moves.owned[item.slot]||[]).includes(item.id); }
function equippedMove(slot){ return META.moves.equipped[slot]; }

const SHOP_ITEMS = [
  // ---- Training (leveled, per-run stat boosts) ----
  {id:'stronger_strikes', tab:'training', name:'Stronger Strikes', desc:'Increase basic attack damage.', maxLevel:Infinity},
  {id:'heavy_training',   tab:'training', name:'Heavy Training',   desc:'Increase heavy attack damage.', maxLevel:Infinity},
  {id:'conditioning_meta',tab:'training', name:'Conditioning',     desc:'Increase maximum health.', maxLevel:Infinity},
  {id:'footwork',         tab:'training', name:'Footwork',         desc:'Increase movement speed.', maxLevel:Infinity},
  {id:'recovery_training',tab:'training', name:'Recovery Training',desc:'Reduce dodge cooldown.', maxLevel:Infinity},
  // ---- Survival ----
  {id:'toughened_up', tab:'survival', name:'Toughened Up', desc:'Start each run with more maximum health.', maxLevel:Infinity},
  {id:'second_chance',tab:'survival', name:'Second Chance', desc:'Once per run, lethal damage leaves you at 1 HP.', maxLevel:1},
  {id:'fresh_start',  tab:'survival', name:'Fresh Start', desc:'Restore some health after defeating a boss.', maxLevel:Infinity},
  // ---- Economy ----
  {id:'bigger_payout', tab:'economy', name:'Bigger Payout', desc:'Earn more coins during runs.', maxLevel:Infinity},
  {id:'boss_bonus',    tab:'economy', name:'Boss Bonus', desc:'Bosses drop additional coins.', maxLevel:Infinity},
  // ---- Draft (upgrade luck + starting build) ----
  {id:'reroll1',          tab:'draft', name:'Reroll I',   desc:'Gain one upgrade reroll per run.', maxLevel:1},
  {id:'reroll2',          tab:'draft', name:'Reroll II',  desc:'Gain two upgrade rerolls per run.', maxLevel:1},
  {id:'reroll3',          tab:'draft', name:'Reroll III', desc:'Gain three upgrade rerolls per run.', maxLevel:1},
  {id:'reject',           tab:'draft', name:'Reject', desc:'Replace one unwanted upgrade choice.', maxLevel:1},
  {id:'specialist',       tab:'draft', name:'Specialist', desc:'Upgrades from trees you are investing in become slightly more common.', maxLevel:1},
  {id:'lucky_break',      tab:'draft', name:'Lucky Break', desc:'Increase the chance of Rare upgrades.', maxLevel:1},
  {id:'legendary_chance', tab:'draft', name:'Legendary Chance', desc:'Slightly increase the chance of Legendary upgrades.', maxLevel:1},
  {id:'starting_upgrade', tab:'draft', name:'Starting Upgrade', desc:'Begin each run with one random Level 1 upgrade.', maxLevel:1},
  {id:'choose_training',  tab:'draft', name:'Choose Your Training', desc:'Select a starting upgrade tree at the beginning of the run.', maxLevel:1},
  {id:'extra_choice',     tab:'draft', name:'Extra Choice', desc:'The first upgrade selection has four options.', maxLevel:1},
  {id:'head_start',       tab:'draft', name:'Head Start', desc:'Receive the first upgrade earlier in the run.', maxLevel:1},
  // ---- Techniques (one-time, tutorial toast shows the keybind) ----
  {id:'slide_kick',      tab:'techniques', name:'Slide Kick',       desc:'Perform a sliding attack.', maxLevel:1, keybind:'Down + Light, while moving'},
  {id:'uppercut',        tab:'techniques', name:'Rising Uppercut',  desc:'Launch enemies into the air.', maxLevel:1, keybind:'Down + Heavy'},
  {id:'ground_pound',    tab:'techniques', name:'Ground Pound',     desc:'Slam downward while airborne.', maxLevel:1, keybind:'Down + Heavy, while airborne'},
  {id:'running_attack',  tab:'techniques', name:'Running Attack',   desc:'Attack while sprinting.', maxLevel:1, keybind:'Heavy while running'},
  {id:'grab',            tab:'techniques', name:'Grab',             desc:'Grab stunned or vulnerable enemies.', maxLevel:1, keybind:'Light + Heavy together'},
  {id:'throw',           tab:'techniques', name:'Throw',            desc:'Throw grabbed enemies.', maxLevel:1, keybind:'Light or Heavy right after a Grab connects'},
  {id:'counter',         tab:'techniques', name:'Counter',          desc:'Perfect dodges allow an immediate counterattack.', maxLevel:1, keybind:'Automatic on a perfect Dodge (Direction + Special)'},
  {id:'air_combo',       tab:'techniques', name:'Air Combo',        desc:'Continue attacking launched enemies.', maxLevel:1, keybind:'Light while an enemy is airborne'},
  {id:'finisher_upgrade',tab:'techniques', name:'Finisher Upgrade', desc:'Add an additional attack to the basic combo.', maxLevel:1},
  {id:'charged_heavy',   tab:'techniques', name:'Charged Heavy',    desc:'Hold heavy attack to charge a stronger strike.', maxLevel:1, keybind:'Hold Heavy, release to strike'},
  // ---- Character Unlocks ----
  {id:'char_astronaut', tab:'characters', name:'Astronaut', desc:'Fast fighter focused on dodges and combos.', maxLevel:1},
  {id:'char_ninja',     tab:'characters', name:'Ninja', desc:'Longer combos and stronger aerial attacks.', maxLevel:1},
  {id:'char_wrestler',  tab:'characters', name:'Wrestler', desc:'Strong grabs, throws and survivability.', maxLevel:1},
];
function shopItemById(id){ return SHOP_ITEMS.find(i=>i.id===id); }

const CHARACTER_DEFS = {
  default: {name:'Default', desc:'Balanced all-rounder.', color:'#ff5028', accentColor:'#ffd166'},
  char_astronaut: {name:'Astronaut', desc:'Fast fighter focused on dodges and combos.', color:'#4fa8ff', accentColor:'#dfe8ff',
    apply(p){ p.speedBonus+=0.12; p.dodgeCooldownMult=(p.dodgeCooldownMult||1)*0.7; p.comboExtend+=1; }},
  char_ninja: {name:'Ninja', desc:'Longer combos and stronger aerial attacks.', color:'#2b2b3a', accentColor:'#5bd6a0',
    apply(p){ p.comboExtend+=2; p.jumpDmgMult+=0.5; }},
  char_wrestler: {name:'Wrestler', desc:'Strong grabs, throws and survivability.', color:'#8a6d3b', accentColor:'#ffb347',
    apply(p){ p.maxHp+=25; p.hp+=25; p.grabRangeMult=(p.grabRangeMult||1)*1.5; p.throwDmgMult=(p.throwDmgMult||1)*1.3; }},
};
function unlockedCharacters(){
  return Object.keys(CHARACTER_DEFS).filter(id=>id==='default' || metaLevel(id)>0);
}

// 2-bone IK solver: returns the joint (elbow/knee) position bending toward `bend` (1 or -1).
function solveIK(ox,oy,tx,ty,len1,len2,bend){
  let dx=tx-ox, dy=ty-oy;
  let dist = Math.hypot(dx,dy) || 0.001;
  dist = clamp(dist, Math.abs(len1-len2)+0.5, len1+len2-0.5);
  const a1 = Math.acos(clamp((len1*len1+dist*dist-len2*len2)/(2*len1*dist), -1, 1));
  const baseAngle = Math.atan2(dy,dx);
  const jointAngle = baseAngle + a1*bend;
  return { x: ox+Math.cos(jointAngle)*len1, y: oy+Math.sin(jointAngle)*len1 };
}
// Filled capsule (rounded-end limb segment) — chunkier and more detailed than a plain stroke.
function drawCapsule(ctx,x1,y1,x2,y2,width,color,highlight){
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
  ctx.stroke();
  if(highlight){
    ctx.strokeStyle = highlight;
    ctx.lineWidth = width*0.32;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    const nx = -(y2-y1), ny = (x2-x1);
    const nl = Math.hypot(nx,ny)||1;
    const ox = nx/nl*width*0.18, oy = ny/nl*width*0.18;
    ctx.moveTo(x1-ox,y1-oy); ctx.lineTo(x2-ox,y2-oy);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
// Tapered limb segment (thicker at r1, narrower at r2) with rounded joints at both
// ends — reads as a real limb (upper arm, thigh, etc.) instead of a uniform tube.
function drawTaperedLimb(ctx,x1,y1,r1,x2,y2,r2,color,highlight){
  const dx=x2-x1, dy=y2-y1;
  const dist = Math.hypot(dx,dy)||0.001;
  const nx = -dy/dist, ny = dx/dist;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1+nx*r1, y1+ny*r1);
  ctx.lineTo(x2+nx*r2, y2+ny*r2);
  ctx.lineTo(x2-nx*r2, y2-ny*r2);
  ctx.lineTo(x1-nx*r1, y1-ny*r1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(x1,y1,r1,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x2,y2,r2,0,Math.PI*2); ctx.fill();
  if(highlight){
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = highlight;
    const off = 0.3;
    ctx.beginPath();
    ctx.moveTo(x1+nx*r1*off, y1+ny*r1*off);
    ctx.lineTo(x2+nx*r2*off, y2+ny*r2*off);
    ctx.lineTo(x2+nx*r2*0.82, y2+ny*r2*0.82);
    ctx.lineTo(x1+nx*r1*0.82, y1+ny*r1*0.82);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ======================================================================
// CANVAS / GLOBAL STATE
// ======================================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const gameWrap = document.getElementById('wrap');
function fitGameToViewport(){
  const viewport=window.visualViewport;
  const availableWidth=Math.max(1,viewport?.width||window.innerWidth);
  const availableHeight=Math.max(1,viewport?.height||window.innerHeight);
  gameWrap.style.width=`${Math.floor(availableWidth)}px`;
  gameWrap.style.height=`${Math.floor(availableHeight)}px`;
}
fitGameToViewport();
window.addEventListener('resize',fitGameToViewport);
window.addEventListener('orientationchange',()=>setTimeout(fitGameToViewport,100));
window.visualViewport?.addEventListener('resize',fitGameToViewport);

const Input = {
  keys: {},
  pressed: {}, // single-frame press
  released: {}, // single-frame release (for hold-and-release techniques)
};
window.addEventListener('keydown', e=>{
  const k = e.key.toLowerCase();
  if(['a','d','w','s','j','k','l',' '].includes(k)) e.preventDefault();
  if(!Input.keys[k]) Input.pressed[k] = true;
  Input.keys[k] = true;
});
window.addEventListener('keyup', e=>{
  const k = e.key.toLowerCase();
  if(Input.keys[k]) Input.released[k] = true;
  Input.keys[k] = false;
});

// ======================================================================
// PARTICLES
// ======================================================================
class Particle{
  constructor(x,y,vx,vy,life,color,size){
    this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.life=life;this.maxLife=life;this.color=color;this.size=size;
  }
  update(){ this.x+=this.vx; this.y+=this.vy; this.vy+=0.25; this.life--; }
  get dead(){return this.life<=0;}
  draw(ctx){
    ctx.globalAlpha = clamp(this.life/this.maxLife,0,1);
    ctx.fillStyle=this.color;
    ctx.fillRect(this.x-this.size/2,this.y-this.size/2,this.size,this.size);
    ctx.globalAlpha=1;
  }
}
class FloatingText{
  constructor(x,y,text,color,size){this.x=x;this.y=y;this.text=text;this.color=color;this.life=45;this.size=size||18;this.vy=-1.3;}
  update(){this.y+=this.vy;this.vy+=0.03;this.life--;}
  get dead(){return this.life<=0;}
  draw(ctx){
    ctx.globalAlpha=clamp(this.life/45,0,1);
    ctx.font=`bold ${this.size}px ${GLOBAL_BODY_FONT}`;
    ctx.fillStyle=this.color;
    ctx.textAlign='center';
    ctx.fillText(this.text,this.x,this.y);
    ctx.globalAlpha=1;
  }
}
class Projectile{
  constructor(owner,x,y,dir,dmg,speed,color,pierce){
    this.owner=owner;this.x=x;this.y=y;this.dir=dir;this.dmg=dmg;this.speed=speed;this.color=color||'#4fd6ff';
    this.w=26;this.h=14;this.dead=false;this.pierce=!!pierce;this.hitSet=new Set();
  }
  update(){ this.x += this.dir*this.speed; if(this.x<CFG.ARENA_L-50||this.x>CFG.ARENA_R+50) this.dead=true; }
  draw(ctx){
    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.fillStyle=this.color;
    ctx.shadowColor=this.color; ctx.shadowBlur=18;
    ctx.beginPath();
    ctx.ellipse(0,0,this.w/2,this.h/2,0,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  get box(){ return {x:this.x-this.w/2,y:this.y-this.h/2,w:this.w,h:this.h}; }
}

// A short-lived visual beam line (eye laser, dash trail, etc.) — purely cosmetic.
class Beam{
  constructor(x1,y1,x2,y2,color,life,width){
    this.x1=x1;this.y1=y1;this.x2=x2;this.y2=y2;this.color=color;this.life=life;this.maxLife=life;this.width=width||6;
  }
  update(){ this.life--; }
  get dead(){ return this.life<=0; }
  draw(ctx){
    ctx.save();
    ctx.globalAlpha = clamp(this.life/this.maxLife,0,1);
    ctx.strokeStyle=this.color;
    ctx.lineWidth=this.width;
    ctx.lineCap='round';
    ctx.shadowColor=this.color; ctx.shadowBlur=16;
    ctx.beginPath(); ctx.moveTo(this.x1,this.y1); ctx.lineTo(this.x2,this.y2); ctx.stroke();
    ctx.restore();
  }
}

function rectOverlap(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}

// ======================================================================
// FIGHTER
// ======================================================================
class Fighter{
  constructor(opts){
    this.name = opts.name || 'FIGHTER';
    this.isPlayer = !!opts.isPlayer;
    this.x = opts.x; this.y = CFG.GROUND_Y;
    this.vx = 0; this.vy = 0;
    this.facing = opts.facing || 1;
    this.w = opts.w || 90; this.h = opts.h || 203;
    this.maxHp = opts.maxHp || 100;
    this.hp = this.maxHp;
    this.meter = 0;
    this.meterMax = CFG.SPECIAL.meterMax;

    this.speed = opts.speed || CFG.MOVE_SPEED;
    this.dmgMult = opts.dmgMult || 1;
    this.defMult = opts.defMult || 1; // multiply incoming damage
    this.knockbackMult = opts.knockbackMult || 1;
    this.jumpsMax = opts.jumpsMax || 1;
    this.jumpsLeft = this.jumpsMax;

    this.state = 'idle'; // idle, walk, jump, crouch, attack, block, hitstun, ko
    this.crouching = false;
    this.blocking = false;
    this.grounded = true;

    this.attack = null; // active attack data
    this.attackTimer = 0;
    this.comboStep = 0;
    this.comboWindow = 0;
    this.hitThisAttack = false;

    this.hitstunTimer = 0;
    this.flashTimer = 0;
    this.koFlag = false;
    this.koFallT = 0;

    this.color = opts.color || '#4fa8ff';
    this.accentColor = opts.accentColor || null;
    this.skinColor = opts.skinColor || '#e8b98c';
    this.archetype = opts.archetype || null;
    this.gender = opts.gender || 'male';
    this.femaleBody = this.gender === 'female';
    this.isBoss = !!opts.isBoss;
    this.bossKind = opts.bossKind || null;
    this.specialKind = opts.specialKind || 'default';
    this.heavyIsRanged = !!opts.heavyIsRanged;
    this.flatDmgBonus = opts.flatDmgBonus || 0;

    // Techniques (mostly player-only; enemies just never set these true)
    this.dodgeIframes = 0;
    this.dodgeCooldownTimer = 0;
    this.dodgeCooldownMult = opts.dodgeCooldownMult || 1;
    this.grabbedTarget = null; // fighter I'm currently holding
    this.isGrabbed = false; this.grabbedBy = null; this.grabHoldTimer = 0;
    this.kHoldFrames = 0;
    this._lastJPress = -999; this._lastKPress = -999;
    this.handToggle = 1;
    this.hairColor = opts.hairColor || hairColorFor(this.name);
    this.hairStyle = opts.hairStyle || 'auto';
    this.facialHair = opts.facialHair || 'none';
    this.hat = opts.hat || 'none';
    this.outfit = opts.outfit || 'default';
    this.shoesStyle = opts.shoesStyle || 'default';
    this.lightDmgMult = 1; this.lightTimeMult = 1; this.lightVisual = 'default';
    this.heavyDmgMult = 1; this.heavyTimeMult = 1; this.heavyVisual = 'default';
    this.hasCounter = false; this.hasSlideKick = false; this.hasUppercut = false;
    this.hasGroundPound = false; this.hasRunningAttack = false; this.hasGrab = false;
    this.hasThrow = false; this.hasAirCombo = false; this.hasChargedHeavy = false;
    this.throwDmgMult = opts.throwDmgMult || 1;
    this.grabRangeMult = opts.grabRangeMult || 1;
    this.armWMult = opts.armWMult || 1;

    // upgrade-driven stats (player only)
    this.lightDmgBonus = 0; this.heavyDmgBonus = 0; this.globalDmgBonus = 0;
    this.speedBonus = 0; this.lightSpeedBonus = 0; this.recoveryReduction = 0;
    this.dmgReduction = 0; this.blockReduction = 0; this.lastStand = false;
    this.comboExtend = 0; this.momentumStacks = 0; this.momentumMult = 0;
    this.finisherBoost = false; this.meterGainMult = 1; this.specialSizeMult = 1;
    this.specialTwin = false; this.specialPierce = false;
    this.jumpDmgMult = 1; this.doubleJump = false; this.dashUnlocked = false;
    this.healBonus = 0; this.glassCannon = false;

    // AI
    this.ai = opts.ai || null;
    this.aiState = 'approach';
    this.aiTimer = randInt(20,50);
    this.reaction = opts.reaction || 18;
    this.aggression = opts.aggression || 0.5;

    this.animT = 0;
    this.hitCombo = 0; // for player combo tracking display
    this.lastHitTime = 0;
  }

  get alive(){ return this.hp > 0; }

  currentDamageMult(){
    let m = this.dmgMult * (1+this.globalDmgBonus);
    if(this.lastStand && this.hp/this.maxHp < 0.25) m *= 1.3;
    if(this.momentumStacks>0) m *= (1 + this.momentumStacks*this.momentumMult);
    return m;
  }

  // Applies the multiplier plus this fighter's flat damage bonus (used for
  // per-wave enemy scaling — a flat +N added on top of the usual multiplier).
  attackDamage(baseDmg, scale){
    const s = scale===undefined ? 1 : scale;
    return baseDmg*this.currentDamageMult() + (this.flatDmgBonus||0)*s;
  }

  hurtbox(){
    return {x:this.x-this.w/2, y:this.y-this.h, w:this.w, h:this.h};
  }

  startAttack(type, other, opts){
    const o = opts || {};
    let cfgBase = type==='light' ? CFG.LIGHT : CFG.HEAVY;
    const timeMult = type==='light' ? (this.lightTimeMult||1) : (type==='heavy' ? (this.heavyTimeMult||1) : 1);
    const dmgMult = type==='light' ? (this.lightDmgMult||1) : (type==='heavy' ? (this.heavyDmgMult||1) : 1);
    let startup = cfgBase.startup*timeMult, recovery = cfgBase.recovery*timeMult;
    if(this.isPlayer && type==='light') startup = Math.max(2, startup*(1-this.lightSpeedBonus));
    if(this.isPlayer) recovery = Math.max(2, recovery*(1-this.recoveryReduction));
    if(o.charged) startup += 4; // slight extra startup for the heavier charged swing

    let comboIdx = 0;
    if(type==='light'){
      if(this.comboWindow>0){ this.comboStep = (this.comboStep+1) % (3+this.comboExtend); }
      else this.comboStep = 0;
      comboIdx = this.comboStep;
      this.comboWindow = 26;
    } else {
      this.comboStep = 0; this.comboWindow = 0;
    }

    const isFinal = type==='light' && comboIdx === (2+this.comboExtend);
    let activeHand;
    if(type==='light'){
      activeHand = comboIdx%2===0 ? 1 : -1; // jab, cross, jab, cross… (kick uses no hand)
    } else {
      this.handToggle = -this.handToggle;
      activeHand = this.handToggle;
    }

    this.attack = {
      type, comboIdx, phase:'startup',
      startup, active: cfgBase.active, recovery,
      t:0, dmg: cfgBase.dmg*dmgMult, knockback: cfgBase.knockback, range: cfgBase.range,
      airborne: !this.grounded, isFinal, charged: !!o.charged, chargeMult: o.chargeMult||1,
      activeHand, visualKind: type==='light' ? this.lightVisual : (type==='heavy' ? this.heavyVisual : 'default')
    };
    this.attackTimer = 0;
    this.hitThisAttack = false;
    this.state='attack';
  }

  startSpecial(){
    const kind = this.specialKind || 'default';
    const def = SPECIAL_DEFS[kind] || SPECIAL_DEFS.default;
    this.meter = 0;
    this.handToggle = -this.handToggle;
    this.attack = Object.assign({type:'special', kind, phase:'startup', t:0,
      hitsLanded:0, nextHitT:0, spawned:false, countered:false, resolved:false,
      fallbackDone:false, airborne:!this.grounded, activeHand:this.handToggle}, def);
    this.attackTimer = 0; this.hitThisAttack = false;
    this.state='attack';
    if(kind==='meteorslam'){ this.vy = CFG.JUMP_V*1.3; this.grounded=false; }
    if(kind==='phantomdash'){ this.dashOrigin = this.x; }
    return true;
  }

  gainMeter(v){ this.meter = clamp(this.meter + v*this.meterGainMult, 0, this.meterMax); }

  takeHit(dmg, kb, dir, blocked, attacker){
    // Dodge i-frames: fully negate the hit. With Counter unlocked, retaliate instantly.
    if(this.dodgeIframes>0){
      this.dodgeIframes = 0; // consumed
      if(this.hasCounter && attacker && attacker.alive){
        const counterDmg = this.attackDamage(CFG.HEAVY.dmg*1.3);
        const cdir = Math.sign(attacker.x-this.x) || this.facing;
        const dealt = attacker.takeHit(counterDmg, CFG.HEAVY.knockback*1.5, cdir, attacker.blocking, this);
        this.gainMeter(20);
      }
      return 0;
    }
    // Master boss counter-stance: absorb the hit almost entirely and flag a retaliation.
    if(this.attack && this.attack.kind==='counterstrike' && this.attack.phase==='active' && !this.attack.countered){
      this.attack.countered = true;
      const reducedDmg = Math.max(0, Math.round(dmg*0.15));
      this.hp = clamp(this.hp-reducedDmg, 0, this.maxHp);
      this.flashTimer = 4;
      return reducedDmg;
    }
    let finalDmg = dmg;
    if(blocked){
      finalDmg *= CFG.BLOCK_DMG_MULT * (1-this.blockReduction);
      kb *= CFG.BLOCK_KB_MULT;
    } else {
      finalDmg *= this.defMult * (1-this.dmgReduction);
    }
    finalDmg = Math.max(0, Math.round(finalDmg));
    // Second Chance: once per run, lethal damage leaves the player at 1 HP instead.
    if(this.hasSecondChance && !this.usedSecondChance && finalDmg>=this.hp){
      this.usedSecondChance = true;
      finalDmg = this.hp-1;
    }
    this.hp = clamp(this.hp - finalDmg, 0, this.maxHp);
    this.vx = dir * kb * this.knockbackMult;
    if(!blocked){
      // Air Combo: juggling an already-airborne target gets extended hitstun so follow-ups connect.
      const airCombo = attacker && attacker.hasAirCombo && !this.grounded;
      this.vy = airCombo ? Math.min(this.vy, -2) : -3;
      this.hitstunTimer = airCombo ? CFG.HITSTUN+10 : CFG.HITSTUN;
      this.state = 'hitstun';
      this.flashTimer = 8;
    } else {
      this.state = 'block';
      this.flashTimer = 4;
    }
    this.gainMeter(dmg*0.4);
    if(this.hp<=0 && !this.koFlag){ this.koFlag = true; this.state='ko'; }
    return finalDmg;
  }

  update(other, game){
    this.animT++;
    if(this.flashTimer>0) this.flashTimer--;
    if(this.comboWindow>0) this.comboWindow--; else this.comboStep=0;

    // held in a grab — freeze at the grabber's side, skip normal physics/state machine
    if(this.state==='grabbed'){
      if(this.grabbedBy && this.grabbedBy.grabbedTarget===this){
        this.x = clamp(this.grabbedBy.x + this.grabbedBy.facing*this.grabbedBy.w*0.55, CFG.ARENA_L+this.w/2, CFG.ARENA_R-this.w/2);
        this.y = CFG.GROUND_Y; this.vx=0; this.vy=0; this.grounded=true;
      } else {
        this.state='idle'; this.isGrabbed=false; this.grabbedBy=null;
      }
      return;
    }
    // holding an opponent — count down to an automatic throw if not thrown manually
    if(this.grabbedTarget){
      this.grabHoldTimer--;
      if(this.grabHoldTimer<=0) this.throwGrabbed(game);
    }

    // facing
    if(this.state!=='attack' && this.state!=='hitstun'){
      this.facing = this.x < other.x ? 1 : -1;
    }

    // gravity & vertical
    this.vy += CFG.GRAVITY;
    this.y += this.vy;
    if(this.y >= CFG.GROUND_Y){ this.y = CFG.GROUND_Y; this.vy = 0;
      if(!this.grounded){ game.spawnDust(this.x); }
      this.grounded = true; this.jumpsLeft = this.jumpsMax + (this.doubleJump?1:0);
    } else { this.grounded = false; }

    // horizontal friction / bounds
    this.x += this.vx;
    if(this.state!=='hitstun') this.vx *= 0.8; else this.vx *= 0.9;
    this.x = clamp(this.x, CFG.ARENA_L+this.w/2, CFG.ARENA_R-this.w/2);

    // state machine timers
    if(this.state==='hitstun'){
      this.hitstunTimer--;
      if(this.hitstunTimer<=0) this.state='idle';
    } else if(this.state==='attack'){
      this.updateAttack(other, game);
    } else if(this.state==='block'){
      if(!this.blocking) this.state='idle';
    } else if(this.state==='ko'){
      if(this.koFallT<28) this.koFallT++;
    }
  }

  updateAttack(other, game){
    const a = this.attack;
    a.t++;
    if(a.phase==='startup' && a.t>=a.startup){ a.phase='active'; a.t=0; this.hitThisAttack=false; }
    else if(a.phase==='active' && a.t>=a.active){ a.phase='recovery'; a.t=0; }
    else if(a.phase==='recovery' && a.t>=a.recovery){ this.attack=null; this.state='idle'; return; }

    if(a.type==='special'){
      this.updateSpecialTick(other, game);
      return;
    }
    if(a.type==='technique'){
      this.updateTechniqueTick(other, game);
      return;
    }

    if(a.phase==='active' && !this.hitThisAttack){
      if(a.type==='heavy' && this.heavyIsRanged){
        if(!a.spawned){ a.spawned = true; game.spawnHeavyFireball(this); }
        this.hitThisAttack = true;
      } else {
        const hb = this.attackHitbox();
        const ob = other.hurtbox();
        if(hb && rectOverlap(hb, ob)){
          this.hitThisAttack = true;
          this.resolveHit(other, game, a);
        }
      }
    }
  }

  // ---- techniques (Slide Kick, Uppercut, Ground Pound, Running Attack, Grab) ----
  startTechnique(kind, other){
    const def = TECHNIQUE_DEFS[kind];
    if(kind==='uppercut' || kind==='runningattack'){ this.handToggle = -this.handToggle; }
    this.attack = Object.assign({type:'technique', kind, phase:'startup', t:0, spawned:false, airborne:!this.grounded, activeHand:this.handToggle}, def);
    this.attackTimer = 0; this.hitThisAttack = false;
    this.state = 'attack';
  }

  updateTechniqueTick(other, game){
    const a = this.attack;
    switch(a.kind){
      case 'slidekick':
      case 'runningattack': {
        if(a.phase==='active'){
          this.vx = this.facing * (a.kind==='slidekick'?6:8);
          if(!this.hitThisAttack){
            const range = CFG.LIGHT.range*(a.kind==='slidekick'?0.9:1.0);
            const x = this.facing===1 ? this.x+this.w*0.25 : this.x-this.w*0.25-range;
            const hb = a.kind==='slidekick'
              ? {x, y:this.y-this.h*0.32, w:range, h:this.h*0.28}
              : {x, y:this.y-this.h*0.72, w:range, h:this.h*0.5};
            if(rectOverlap(hb, other.hurtbox())){
              this.hitThisAttack = true;
              const blocked = other.blocking && ((this.x<other.x && other.facing===-1) || (this.x>other.x && other.facing===1));
              const dir = Math.sign(other.x-this.x) || this.facing;
              const dealt = other.takeHit(this.attackDamage(a.dmg), a.knockback, dir, blocked, this);
              if(!blocked) game.onHitLanded(this, other, dealt, {type:'light'});
              else game.onBlockedHit(this, other, {type:'light'});
            }
          }
        }
        break;
      }
      case 'uppercut': {
        if(a.phase==='active' && !this.hitThisAttack){
          const range = CFG.LIGHT.range*0.9;
          const x = this.facing===1 ? this.x+this.w*0.25 : this.x-this.w*0.25-range;
          const hb = {x, y:this.y-this.h*0.85, w:range, h:this.h*0.6};
          if(rectOverlap(hb, other.hurtbox())){
            this.hitThisAttack = true;
            const blocked = other.blocking && ((this.x<other.x && other.facing===-1) || (this.x>other.x && other.facing===1));
            const dir = Math.sign(other.x-this.x) || this.facing;
            const dealt = other.takeHit(this.attackDamage(a.dmg), a.knockback, dir, blocked, this);
            if(!blocked){
              other.vy = -14; other.grounded = false;
              game.onHitLanded(this, other, dealt, {type:'heavy'});
            } else game.onBlockedHit(this, other, {type:'heavy'});
          }
        }
        break;
      }
      case 'groundpound': {
        if(this.grounded && !a.spawned && a.phase!=='startup'){
          a.spawned = true;
          const dist = Math.abs(this.x-other.x);
          game.spawnHitParticles(this.x, CFG.GROUND_Y, '#ffd166', 14, 1.4);
          game.shake = Math.max(game.shake, 12);
          if(dist < this.w*1.3){
            const blocked = other.blocking;
            const dir = Math.sign(other.x-this.x) || this.facing;
            const dealt = other.takeHit(this.attackDamage(a.dmg), a.knockback, dir, blocked, this);
            if(!blocked) game.onHitLanded(this, other, dealt, {type:'heavy'});
            else game.onBlockedHit(this, other, {type:'heavy'});
          }
        }
        break;
      }
      case 'grab': {
        if(a.phase==='active' && !a.spawned){
          const range = this.w*0.85*this.grabRangeMult;
          const dist = Math.abs(this.x-other.x);
          if(dist < range && !other.isGrabbed && other.state!=='ko'){
            a.spawned = true;
            this.grabbedTarget = other;
            this.grabHoldTimer = 40;
            other.isGrabbed = true;
            other.grabbedBy = this;
            other.state = 'grabbed';
            other.attack = null;
            other.vx = 0; other.vy = 0;
            game.texts.push(new FloatingText(other.x, other.y-other.h*0.8, 'GRABBED!', '#ffd166', 20));
          }
        }
        break;
      }
    }
  }

  throwGrabbed(game){
    const other = this.grabbedTarget;
    if(!other) return;
    this.grabbedTarget = null;
    other.isGrabbed = false; other.grabbedBy = null;
    const dir = this.facing;
    const dmg = this.attackDamage(CFG.HEAVY.dmg*1.8) * (this.throwDmgMult||1);
    const dealt = other.takeHit(dmg, CFG.HEAVY.knockback*1.8, dir, false, this);
    game.onHitLanded(this, other, dealt, {type:'heavy'});
    game.spawnHitParticles(other.x, other.y-other.h*0.5, '#ffb347', 12, 1.3);
    game.texts.push(new FloatingText(other.x, other.y-other.h*0.9, 'THROW!', '#ff5028', 22));
    game.shake = Math.max(game.shake, 12);
  }


  // ---- special attack dispatch ----
  updateSpecialTick(other, game){
    const a = this.attack;
    switch(a.kind){
      case 'whirlwind': case 'flurry': case 'comboburst':
        this.multiHitTick(other, game, a); break;
      case 'megalaser':
        this.beamTick(other, game, a); break;
      case 'fireball':
        if(a.phase==='active' && !a.spawned){
          a.spawned = true;
          game.spawnSpecialProjectile(this, {dmg:a.dmg, knockback:a.knockback, color: this.isPlayer?'#ffb347':'#ff8a3d'});
        }
        break;
      case 'infernobarrage':
        if(a.phase==='active' && !a.spawned){ a.spawned = true; game.spawnBarrage(this, a); }
        break;
      case 'megapush':
        if(a.phase==='active' && !a.spawned){
          const range = CFG.HEAVY.range*0.75;
          const x = this.facing===1 ? this.x+this.w*0.2 : this.x-this.w*0.2-range;
          const hb = {x, y:this.y-this.h*0.75, w:range, h:this.h*0.55};
          if(rectOverlap(hb, other.hurtbox())){ a.spawned = true; this.resolvePush(other, game, a); }
        }
        break;
      case 'suplex':
        if(a.phase==='active' && !a.spawned){
          const dist = Math.abs(this.x-other.x);
          if(dist < this.w*0.95){ a.spawned = true; this.resolveSuplex(other, game, a); }
        }
        break;
      case 'eyelaser':
        if(a.phase==='active' && !a.spawned){ a.spawned = true; this.resolveEyeLaser(other, game, a); }
        break;
      case 'sonic':
        if(a.phase==='active' && !a.spawned){ a.spawned = true; this.resolveEyeLaser(other, game, a, '#4fd6ff'); }
        break;
      case 'lightning':
        if(a.phase==='active' && !a.spawned){ a.spawned = true; this.resolveLightning(other, game, a); }
        break;
      case 'hurricanekick':
        this.multiHitTick(other, game, a); break;
      case 'meteorslam':
        if(this.grounded && !a.spawned && a.phase!=='startup'){ a.spawned = true; this.resolveSlam(other, game, a); }
        break;
      case 'phantomdash':
        if(a.phase==='active' && !a.spawned){ a.spawned = true; this.resolveDash(other, game, a); }
        break;
      case 'counterstrike':
        this.counterTick(other, game, a); break;
      default:
        if(a.phase==='active' && !a.spawned){ a.spawned = true; game.spawnSpecialProjectile(this); }
    }
  }

  multiHitTick(other, game, a){
    if(a.phase!=='active' || a.hitsLanded>=a.hits) return;
    if(a.t < a.nextHitT) return;
    a.nextHitT = a.t + a.hitInterval;
    a.activeHand = -(a.activeHand||1); // alternate hands each hit
    let hb;
    if(a.kind==='whirlwind'){
      const range = CFG.HEAVY.range*0.85;
      hb = {x:this.x-range/2, y:this.y-this.h*0.78, w:range, h:this.h*0.6};
    } else {
      const range = CFG.LIGHT.range*0.8;
      const x = this.facing===1 ? this.x+this.w*0.28 : this.x-this.w*0.28-range;
      hb = {x, y:this.y-this.h*0.72, w:range, h:this.h*0.5};
    }
    if(a.kind==='hurricanekick'){
      // spinning kick ring — visually distinct from the arm-based flurry/whirlwind
      const ang = (a.hitsLanded/a.hits) * Math.PI*4;
      for(let i=0;i<3;i++){
        const ra = ang + i*(Math.PI*2/3);
        game.spawnHitParticles(this.x+Math.cos(ra)*this.w*0.6, this.y-this.h*0.5+Math.sin(ra)*this.h*0.25, this.isPlayer?this.accentColor:this.color, 2, 0.5);
      }
    }
    a.hitsLanded++;
    if(rectOverlap(hb, other.hurtbox())){
      const blocked = other.blocking && ((this.x<other.x && other.facing===-1) || (this.x>other.x && other.facing===1));
      const dir = Math.sign(other.x-this.x) || this.facing;
      const dmg = this.attackDamage(a.dmgPerHit, 1/a.hits);
      const dealt = other.takeHit(dmg, a.knockbackPerHit||1.5, dir, blocked, this);
      if(!blocked) game.onHitLanded(this, other, dealt, {type: a.kind==='whirlwind'?'heavy':'light'});
      else game.onBlockedHit(this, other, {type:'special'});
    }
  }

  beamTick(other, game, a){
    if(a.phase!=='active' || a.hitsLanded>=a.hits) return;
    if(a.t < a.nextHitT) return;
    a.nextHitT = a.t + a.hitInterval;
    const range = 420;
    const x = this.facing===1 ? this.x+this.w*0.3 : this.x-this.w*0.3-range;
    const by = this.y-this.h*0.62;
    const hb = {x, y:by-this.h*0.17, w:range, h:this.h*0.34};
    a.hitsLanded++;
    game.beams.push(new Beam(this.x+this.facing*this.w*0.3, by, this.x+this.facing*range, by, '#4fd6ff', 4, 12));
    if(rectOverlap(hb, other.hurtbox())){
      const blocked = other.blocking && ((this.x<other.x && other.facing===-1) || (this.x>other.x && other.facing===1));
      const dir = Math.sign(other.x-this.x) || this.facing;
      const dealt = other.takeHit(this.attackDamage(a.dmgPerHit, 1/25), 0.25, dir, blocked, this);
      game.damageDealt += dealt;
      if(a.hitsLanded % 5 === 0){
        game.spawnHitParticles(other.x, other.y-other.h*0.55, '#4fd6ff', 3, 0.4);
        game.shake = Math.max(game.shake, 2);
      }
    }
  }

  resolveEyeLaser(other, game, a, colorOverride){
    const blocked = other.blocking && ((this.x<other.x && other.facing===-1) || (this.x>other.x && other.facing===1));
    const dir = Math.sign(other.x-this.x) || this.facing;
    const dmgMult = this.currentDamageMult()*(1+(this.specialDmgBonus||0));
    if(blocked && !this.specialPierce){
      game.onBlockedHit(this, other, {type:'special'});
      other.vx = dir*2*other.knockbackMult;
      other.flashTimer = 4;
      game.spawnLaserBeamFX(this, other, true, colorOverride);
    } else {
      const dmgBase = a.dmg*dmgMult*(blocked?0.15:1);
      const dealt = other.takeHit(dmgBase, a.knockback*(blocked?0.3:1), dir, false, this);
      game.onHitLanded(this, other, dealt, {type:'special'});
      game.shake = Math.max(game.shake, blocked?6:16);
      game.hitPause = Math.max(game.hitPause, blocked?4:12);
      if(this.specialTwin && !blocked && other.alive){
        const dealt2 = other.takeHit(dmgBase, a.knockback*0.6, dir, false, this);
        game.onHitLanded(this, other, dealt2, {type:'special'});
      }
      game.spawnLaserBeamFX(this, other, false, colorOverride);
    }
  }

  resolveLightning(other, game, a){
    const blocked = other.blocking && ((this.x<other.x && other.facing===-1) || (this.x>other.x && other.facing===1));
    const dir = Math.sign(other.x-this.x) || this.facing;
    const dealt = other.takeHit(this.attackDamage(a.dmg), a.knockback, dir, blocked, this);
    if(!blocked) game.onHitLanded(this, other, dealt, {type:'special'});
    else game.onBlockedHit(this, other, {type:'special'});
    game.shake = Math.max(game.shake, blocked?10:22);
    game.hitPause = Math.max(game.hitPause, blocked?6:16);
    // jagged lightning bolt FX
    const midX = (this.x+other.x)/2 + (RNG()-0.5)*30, midY = this.y-this.h*0.9;
    game.beams.push(new Beam(this.x, this.y-this.h*1.35, midX, midY, '#c9a8ff', 12, 6));
    game.beams.push(new Beam(midX, midY, other.x, other.y-other.h*0.5, '#e0d0ff', 12, 8));
    game.spawnHitParticles(other.x, other.y-other.h*0.5, '#c9a8ff', blocked?6:18, blocked?0.6:1.8);
  }

  resolvePush(other, game, a){
    const blocked = other.blocking;
    const dir = Math.sign(other.x-this.x) || this.facing;
    if(blocked){
      other.vx = dir*a.knockback*other.knockbackMult;
      other.flashTimer = 6;
      game.spawnHitParticles(other.x, other.y-other.h*0.5, '#8fd0ff', 8, 1.2);
      game.shake = Math.max(game.shake, 10);
    } else {
      const dealt = other.takeHit(this.attackDamage(a.dmg), a.knockback, dir, false, this);
      game.onHitLanded(this, other, dealt, {type:'heavy'});
      game.shake = Math.max(game.shake, 18);
      game.hitPause = Math.max(game.hitPause, 14);
    }
  }

  resolveSuplex(other, game, a){
    const dir = Math.sign(other.x-this.x) || this.facing;
    const dealt = other.takeHit(this.attackDamage(a.dmg), a.knockback, dir, false, this);
    other.vy = -6;
    game.texts.push(new FloatingText(other.x, other.y-other.h*0.8, 'SUPLEX!', '#ff5028', 26));
    game.spawnHitParticles(other.x, CFG.GROUND_Y, '#c9a24a', 16, 1.6);
    game.shake = Math.max(game.shake, 20);
    game.hitPause = Math.max(game.hitPause, 16);
    game.onHitLanded(this, other, dealt, {type:'heavy'});
  }

  resolveSlam(other, game, a){
    const dist = Math.abs(this.x-other.x);
    const radius = this.w*1.6;
    game.spawnHitParticles(this.x, CFG.GROUND_Y, '#c9a24a', 20, 1.8);
    game.shake = Math.max(game.shake, 22);
    game.hitPause = Math.max(game.hitPause, 16);
    if(dist < radius){
      const blocked = other.blocking;
      const dir = Math.sign(other.x-this.x) || this.facing;
      const dealt = other.takeHit(this.attackDamage(a.dmg), a.knockback, dir, blocked, this);
      if(!blocked) game.onHitLanded(this, other, dealt, {type:'heavy'});
      else game.onBlockedHit(this, other, {type:'heavy'});
    }
  }

  resolveDash(other, game, a){
    const side = other.x > this.x ? 1 : -1;
    const oldX = this.x;
    this.x = clamp(other.x + side*this.w*0.9, CFG.ARENA_L+this.w/2, CFG.ARENA_R-this.w/2);
    this.facing = -side;
    const blocked = other.blocking;
    const dir = -side;
    const dealt = other.takeHit(this.attackDamage(a.dmg), a.knockback, dir, blocked, this);
    game.beams.push(new Beam(oldX, this.y-this.h*0.5, this.x, this.y-this.h*0.5, 'rgba(40,40,60,0.65)', 10, this.w*0.55));
    game.spawnHitParticles(this.x, this.y-this.h*0.5, '#2b2b3a', 14, 1.4);
    game.shake = Math.max(game.shake, 14);
    if(!blocked) game.onHitLanded(this, other, dealt, {type:'special'});
    else game.onBlockedHit(this, other, {type:'special'});
  }

  counterTick(other, game, a){
    if(a.countered && !a.resolved){
      a.resolved = true;
      const dir = Math.sign(other.x-this.x) || this.facing;
      const dealt = other.takeHit(this.attackDamage(a.dmgFinal), a.knockbackFinal, dir, other.blocking, this);
      game.onHitLanded(this, other, dealt, {type:'heavy'});
      game.shake = Math.max(game.shake, 16);
      game.spawnHitParticles(other.x, other.y-other.h*0.6, '#5bd6a0', 12, 1.4);
    } else if(a.phase==='active' && a.t>=a.active-4 && !a.countered && !a.fallbackDone){
      a.fallbackDone = true;
      const range = CFG.HEAVY.range;
      const x = this.facing===1 ? this.x+this.w*0.3 : this.x-this.w*0.3-range;
      const box = {x, y:this.y-this.h*0.75, w:range, h:this.h*0.55};
      if(rectOverlap(box, other.hurtbox())){
        const blocked = other.blocking;
        const dir = Math.sign(other.x-this.x) || this.facing;
        const dealt = other.takeHit(this.attackDamage(a.fallbackDmg), CFG.HEAVY.knockback*1.4, dir, blocked, this);
        if(!blocked) game.onHitLanded(this, other, dealt, {type:'heavy'});
        else game.onBlockedHit(this, other, {type:'heavy'});
      }
    }
  }

  attackHitbox(){
    const a = this.attack;
    if(!a || a.phase!=='active') return null;
    if(a.type==='special') return null; // handled via dedicated resolvers
    const range = a.range;
    const x = this.facing===1 ? this.x + this.w/2 : this.x - this.w/2 - range;
    if(a.type==='light' && a.isFinal){
      // kick lands a bit higher and further out than the punches in the combo
      return {x: x+this.facing*10, y: this.y-this.h*0.62, w: range+8, h: this.h*0.4};
    }
    return {x, y: this.y-this.h*0.75, w: range, h: this.h*0.55};
  }

  resolveHit(other, game, a){
    const blocked = other.blocking && Math.sign(other.x-this.x)!==0 &&
                     ((this.x < other.x && other.facing===-1) || (this.x > other.x && other.facing===1));
    let dmg = this.attackDamage(a.dmg);
    if(a.type==='light') dmg += (this.metaLightDmg||0);
    else if(a.type==='heavy') dmg += (this.metaHeavyDmg||0);
    if(a.isFinal && this.finisherBoost) dmg *= 1.6;
    if(a.airborne) dmg *= this.jumpDmgMult;
    if(a.charged) dmg *= a.chargeMult||1;
    let kb = a.knockback;
    if(a.isFinal && this.finisherBoost) kb *= 1.5;
    if(a.airborne) kb *= 1.3;
    if(a.charged) kb *= (a.chargeMult||1);

    const dir = Math.sign(other.x - this.x) || this.facing;
    const dealt = other.takeHit(dmg, kb, dir, blocked, this);

    if(!blocked){
      this.momentumStacks = Math.min(6, this.momentumStacks+1);
      this.gainMeter(a.type==='heavy'?CFG.HEAVY.meterGain:(a.type==='light'?CFG.LIGHT.meterGain:0));
      game.onHitLanded(this, other, dealt, a);
    } else {
      game.onBlockedHit(this, other, a);
    }
  }

  // Helper: darken/lighten a hex color by amt (-1..1)
  static shade(hex, amt){
    let c = hex.replace('#','');
    if(c.length===3) c = c.split('').map(x=>x+x).join('');
    const num = parseInt(c,16);
    let r=(num>>16)&255, g=(num>>8)&255, b=num&255;
    r = clamp(Math.round(r + (amt>0?(255-r):r)*amt), 0, 255);
    g = clamp(Math.round(g + (amt>0?(255-g):g)*amt), 0, 255);
    b = clamp(Math.round(b + (amt>0?(255-b):b)*amt), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  draw(ctx){
    // shadow (world space — kept soft/unpixelated on purpose)
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const shadowStretch = this.state==='ko' ? 1+this.koFallT*0.03 : 1;
    ctx.ellipse(this.x, CFG.GROUND_Y+4, this.w*0.62*shadowStretch, 7, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    this.drawPixelated(ctx);
  }

  // Renders the figure into a small low-res offscreen buffer, then blits it back
  // onto the main canvas scaled up with smoothing disabled — turns the vector
  // figure into a genuine chunky pixel-art sprite instead of a smooth shape.
  drawPixelated(ctx){
    const PS = Fighter.PIXEL_SCALE;
    const padW = this.w*4.2, padH = this.h*1.65;
    const offW = Math.ceil(padW/PS), offH = Math.ceil(padH/PS);
    if(!this._offCanvas || this._offCanvas.width!==offW || this._offCanvas.height!==offH){
      this._offCanvas = document.createElement('canvas');
      this._offCanvas.width = offW; this._offCanvas.height = offH;
      this._offCtx = this._offCanvas.getContext('2d');
    }
    const octx = this._offCtx;
    octx.setTransform(1,0,0,1,0,0);
    octx.clearRect(0,0,offW,offH);
    octx.imageSmoothingEnabled = false;
    octx.save();
    octx.scale(1/PS, 1/PS);
    const originX = (offW*PS)/2;
    const originY = (offH*PS)*0.82; // room above for hair/spikes, below for boot overlap
    this.drawFigure(octx, originX, originY);
    octx.restore();

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const drawX = this.x - originX;
    const drawY = this.y - originY;
    ctx.drawImage(this._offCanvas, 0,0, offW, offH, drawX, drawY, offW*PS, offH*PS);
    ctx.restore();
  }

  drawFigure(ctx, originX, originY){
    ctx.save();
    ctx.translate(originX, originY);
    const facing = this.facing;
    const dark = Fighter.shade(this.color, -0.35);
    const light = Fighter.shade(this.color, 0.28);
    const skinDark = Fighter.shade(this.skinColor, -0.25);
    const skinLight = Fighter.shade(this.skinColor, 0.2);

    const bob = this.grounded && this.state!=='hitstun' ? Math.sin(this.animT*0.25)*(this.state==='walk'?2.2:0.7) : 0;
    const crouchOffset = this.crouching ? this.h*0.178 : 0;
    ctx.translate(0, -crouchOffset);

    // KO: tip the whole fighter over and sink into the ground
    if(this.state==='ko'){
      const fall = this.koFallT/28;
      ctx.translate(0, fall*18);
      ctx.rotate(facing*fall*(Math.PI/2.15));
    }

    if(this.flashTimer>0 && this.flashTimer%2===0){ ctx.globalAlpha = 0.55; }

    // ---- proportions ----
    const w = this.w, bodyH = this.h - crouchOffset;
    const legH = bodyH*0.46, torsoH = bodyH*0.36, headR = bodyH*0.135;
    const hipY = -legH - bob;
    const shoulderY = hipY - torsoH;
    const headY = shoulderY - headR - bodyH*0.02;
    const thighLen = legH*0.54, shinLen = legH*0.52;
    const upperArmLen = torsoH*0.62, foreArmLen = torsoH*0.58;
    const frontHipX = facing*w*0.13, backHipX = -facing*w*0.13;
    const frontShoulderX = facing*w*0.17, backShoulderX = -facing*w*0.17;
    const limbW = w*0.155, armW = w*0.13*(this.armWMult||1);

    // ---- attack progress (0..1 extension) ----
    let atkExt = 0, atkPhase = null, atkType = null, isFinalKick=false, isSpecial=false;
    if(this.state==='attack' && this.attack){
      const a=this.attack; atkPhase=a.phase; atkType=a.type; isFinalKick = a.type==='light' && a.isFinal; isSpecial = a.type==='special';
      if(a.phase==='startup') atkExt = clamp(a.t/a.startup,0,1)*0.55;
      else if(a.phase==='active') atkExt = 1;
      else atkExt = Math.max(0, 1-a.t/a.recovery);
    }
    // Kick-based move variants (Power Kick heavy, Hurricane Kick special) reuse the
    // same leg-driven animation as the combo finisher instead of the arm-punch pose.
    const isRoundhouseKick = this.attack && this.attack.type==='heavy' && this.attack.visualKind==='roundhouse';
    const isHurricaneKick = this.attack && this.attack.kind==='hurricanekick';
    const isKickMove = isFinalKick || isRoundhouseKick || isHurricaneKick;

    // ---- leg targets ----
    let legSwing = this.state==='walk' ? Math.sin(this.animT*0.35)*9 : 0;
    let frontFoot = {x: frontHipX+legSwing*0.4, y: 0};
    let backFoot  = {x: backHipX-legSwing*0.4, y: 0};
    if(!this.grounded){
      // tucked in the air
      frontFoot = {x: frontHipX*0.6, y: -thighLen*0.55};
      backFoot  = {x: backHipX*0.6,  y: -thighLen*0.35};
    }
    if(this.crouching){
      frontFoot = {x: frontHipX*1.3, y: -4};
      backFoot  = {x: backHipX*1.3,  y: -4};
    }
    if(isFinalKick){
      const reach = 46*atkExt;
      frontFoot = {x: facing*(w*0.2+reach), y: -(18+16*atkExt)};
      backFoot  = {x: backHipX*1.1, y: 2};
    } else if(isRoundhouseKick){
      const reach = 60*atkExt;
      frontFoot = {x: facing*(w*0.2+reach), y: -(20+20*atkExt)};
      backFoot  = {x: backHipX*1.15, y: 4};
    } else if(isHurricaneKick){
      const wobble = Math.sin(this.animT*0.9)*8;
      const reach = 40*atkExt;
      frontFoot = {x: facing*(w*0.2+reach)+wobble, y: -(16+14*atkExt)};
      backFoot  = {x: backHipX*1.1, y: 2};
    }

    // ---- draw back leg then front leg (back drawn first for depth) ----
    const drawLeg = (hipX,footTarget,front)=>{
      const footY = footTarget.y; // absolute, ground-relative (0 = ground contact)
      const knee = solveIK(hipX,hipY,footTarget.x,footY,thighLen,shinLen, -facing);
      drawTaperedLimb(ctx, hipX,hipY,limbW*0.62, knee.x,knee.y,limbW*0.46, front?this.color:dark, front?light:null);
      // knee joint highlight
      ctx.fillStyle = front ? light : Fighter.shade(dark,0.08);
      ctx.beginPath(); ctx.arc(knee.x, knee.y, limbW*0.3, 0, Math.PI*2); ctx.fill();
      drawTaperedLimb(ctx, knee.x,knee.y,limbW*0.42, footTarget.x,footY,limbW*0.28, front?dark:Fighter.shade(dark,-0.15));
      if(this.isPlayer){
        // ankle tape wrap
        const ax = footTarget.x, ay = footY - limbW*0.5;
        ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=limbW*0.26;
        ctx.beginPath(); ctx.moveTo(ax-3,ay); ctx.lineTo(ax+3,ay); ctx.stroke();
      }
      // foot — elongated toward facing direction instead of a plain circle/ellipse
      const footPath = ()=>{
        ctx.beginPath();
        ctx.moveTo(footTarget.x-facing*limbW*0.5, footY-limbW*0.28);
        ctx.quadraticCurveTo(footTarget.x-facing*limbW*0.6, footY+limbW*0.4, footTarget.x-facing*limbW*0.2, footY+limbW*0.46);
        ctx.lineTo(footTarget.x+facing*limbW*0.95, footY+limbW*0.4);
        ctx.quadraticCurveTo(footTarget.x+facing*limbW*1.15, footY+limbW*0.12, footTarget.x+facing*limbW*0.85, footY-limbW*0.22);
        ctx.quadraticCurveTo(footTarget.x+facing*limbW*0.3, footY-limbW*0.42, footTarget.x-facing*limbW*0.5, footY-limbW*0.28);
        ctx.closePath();
      };
      let bootColor = this.isPlayer ? Fighter.shade(this.accentColor||'#1c1c22',-0.55) : '#1c1c22';
      if(this.isPlayer && this.shoesStyle && this.shoesStyle!=='default' && this.shoesStyle!=='shoes_default'){
        const shoeStyle = this.shoesStyle.replace('shoes_','');
        if(shoeStyle==='neon') bootColor = '#00eaff';
        else if(shoeStyle==='gold') bootColor = '#d4af37';
        else if(shoeStyle==='stealth') bootColor = '#0a0a0a';
      }
      ctx.fillStyle = bootColor;
      footPath();
      ctx.fill();
      if(this.isPlayer && this.shoesStyle==='shoes_neon'){
        ctx.save();
        ctx.strokeStyle = '#00eaff'; ctx.lineWidth = 1.5;
        ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 6;
        footPath();
        ctx.stroke();
        ctx.restore();
      }
      // sole highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(footTarget.x-facing*limbW*0.3, footY+limbW*0.36);
      ctx.lineTo(footTarget.x+facing*limbW*0.8, footY+limbW*0.32);
      ctx.stroke();
      if(this.isPlayer){
        ctx.strokeStyle=this.accentColor; ctx.lineWidth=1.4;
        footPath();
        ctx.stroke();
      }
    };
    drawLeg(backHipX, backFoot, false);
    drawLeg(frontHipX, frontFoot, true);

    // ---- arms ----
    // Arm reach is the combined upper-arm + forearm length; resting poses should
    // land close to that distance from the shoulder or the elbow folds unnaturally.
    const armOriginY = shoulderY + torsoH*0.12;
    const armReach = upperArmLen + foreArmLen;
    let frontHand = {x: frontShoulderX+facing*armReach*0.34, y: armOriginY+armReach*0.84};
    let backHand  = {x: backShoulderX-facing*armReach*0.12,  y: armOriginY+armReach*0.78};
    let strikingHand = null; // set below when a hand is actively extended into a strike — used for weapon FX

    const legOnlyTech = this.attack && (this.attack.kind==='slidekick' || this.attack.kind==='groundpound');
    const twoHandedTech = this.attack && (this.attack.kind==='grab' || this.attack.kind==='suplex' || this.attack.kind==='megapush');
    if(atkType && !isKickMove && !legOnlyTech){
      const reach = (atkType==='heavy'?46:(isSpecial?26:32)) * atkExt;
      const punchY = shoulderY + torsoH*(this.attack && this.attack.comboIdx===2 ? 0.28 : 0.5);
      const extendedHand = {x: facing*(w*0.2+upperArmLen*0.5+reach), y: punchY};
      strikingHand = extendedHand;
      if(twoHandedTech){
        // both hands reach forward together — grab, shove, grapple
        frontHand = extendedHand;
        backHand = {x: backShoulderX+facing*armReach*0.28*atkExt, y: punchY+8};
      } else {
        // alternate which shoulder throws the strike (jab/cross, or per-hit on multi-hit specials)
        const activeHand = (this.attack && this.attack.activeHand!==undefined) ? this.attack.activeHand : 1;
        const guardHand = {x: facing*w*0.14, y: armOriginY+torsoH*0.12};
        if(activeHand>=0){ frontHand = extendedHand; backHand = guardHand; }
        else { backHand = extendedHand; frontHand = guardHand; }
      }
    } else if(this.state==='block'){
      frontHand = {x: facing*w*0.24, y: armOriginY+torsoH*0.06};
      backHand  = {x: facing*w*0.32, y: armOriginY+torsoH*0.2};
    } else if(!this.grounded){
      frontHand = {x: frontShoulderX+facing*armReach*0.5, y: armOriginY+armReach*0.4};
      backHand  = {x: backShoulderX-facing*armReach*0.4,  y: armOriginY+armReach*0.45};
    } else if(this.state==='walk'){
      frontHand = {x: frontShoulderX+facing*armReach*0.3-legSwing*1.1, y: armOriginY+armReach*0.8};
      backHand  = {x: backShoulderX-facing*armReach*0.1+legSwing*1.1,  y: armOriginY+armReach*0.76};
    }

    const drawArm = (shoulderX,hand,front)=>{
      const shoulderPivotY = shoulderY+torsoH*0.12;
      // deltoid cap
      ctx.fillStyle = front ? Fighter.shade(this.color,-0.08) : dark;
      ctx.beginPath(); ctx.arc(shoulderX, shoulderPivotY, armW*0.58, 0, Math.PI*2); ctx.fill();
      const elbow = solveIK(shoulderX,shoulderPivotY,hand.x,hand.y,upperArmLen,foreArmLen,facing);
      drawTaperedLimb(ctx, shoulderX,shoulderPivotY,armW*0.56, elbow.x,elbow.y,armW*0.4, front?this.color:dark, front?light:null);
      // elbow joint highlight
      ctx.fillStyle = front ? light : Fighter.shade(dark,0.1);
      ctx.beginPath(); ctx.arc(elbow.x, elbow.y, armW*0.32, 0, Math.PI*2); ctx.fill();
      drawTaperedLimb(ctx, elbow.x,elbow.y,armW*0.38, hand.x,hand.y,armW*0.27, this.skinColor, skinLight);
      if(this.isPlayer){
        // wrist tape
        const t = 0.32;
        const wx = elbow.x+(hand.x-elbow.x)*(1-t), wy = elbow.y+(hand.y-elbow.y)*(1-t);
        ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=armW*0.5;
        ctx.beginPath(); ctx.moveTo(wx-1,wy-1); ctx.lineTo(wx+1,wy+1); ctx.stroke();
      }
      // fist — slightly elongated along the arm + small knuckle bumps instead of a plain ball
      const handAng = Math.atan2(hand.y-elbow.y, hand.x-elbow.x);
      ctx.save();
      ctx.translate(hand.x, hand.y);
      ctx.rotate(handAng);
      ctx.fillStyle = front ? (this.isPlayer? this.accentColor : Fighter.shade(this.color,-0.15)) : (this.isPlayer? Fighter.shade(this.accentColor,-0.3) : skinDark);
      ctx.beginPath();
      ctx.ellipse(0, 0, armW*0.58, armW*0.48, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for(let i=-1;i<=1;i++){
        ctx.beginPath(); ctx.arc(armW*0.12, i*armW*0.28, armW*0.12, 0, Math.PI*2); ctx.fill();
      }
      ctx.fillStyle='rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.arc(-armW*0.15, -armW*0.16, armW*0.16, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    };
    // back arm first, BEHIND the torso, so it actually reads as being on the far side of the body
    drawArm(backShoulderX, backHand, false);

    // ---- torso (gradient shaded, tapered like a real ribcage/waist instead of a box) ----
    const torsoGrad = ctx.createLinearGradient(-w*0.3,0,w*0.3,0);
    torsoGrad.addColorStop(0, facing===1?dark:light);
    torsoGrad.addColorStop(0.5, this.color);
    torsoGrad.addColorStop(1, facing===1?light:dark);
    ctx.fillStyle = torsoGrad;
    const torsoW = w*0.58*(this.femaleBody?0.86:1);
    const shoulderHalf = torsoW/2;
    const waistHalf = shoulderHalf * (this.femaleBody ? 0.58 : 0.72);
    const hipHalf = this.femaleBody ? shoulderHalf*0.76 : waistHalf;
    const torsoTop = shoulderY, torsoBottom = shoulderY+torsoH;
    const waistY = shoulderY + torsoH*0.62;
    const torsoPath = ()=>{
      ctx.beginPath();
      ctx.moveTo(-shoulderHalf, torsoTop+6);
      ctx.quadraticCurveTo(-shoulderHalf, torsoTop, -shoulderHalf+6, torsoTop);
      ctx.lineTo(shoulderHalf-6, torsoTop);
      ctx.quadraticCurveTo(shoulderHalf, torsoTop, shoulderHalf, torsoTop+6);
      ctx.quadraticCurveTo(shoulderHalf*0.9, waistY-torsoH*0.15, waistHalf, waistY);
      ctx.quadraticCurveTo(waistHalf*1.05, (waistY+torsoBottom)/2, hipHalf, torsoBottom-4);
      ctx.quadraticCurveTo(hipHalf, torsoBottom, hipHalf-4, torsoBottom);
      ctx.lineTo(-hipHalf+4, torsoBottom);
      ctx.quadraticCurveTo(-hipHalf, torsoBottom, -hipHalf, torsoBottom-4);
      ctx.quadraticCurveTo(-waistHalf*1.05, (waistY+torsoBottom)/2, -waistHalf, waistY);
      ctx.quadraticCurveTo(-shoulderHalf*0.9, waistY-torsoH*0.15, -shoulderHalf, torsoTop+6);
      ctx.closePath();
    };
    torsoPath();
    ctx.fill();
    // subtle outline on every fighter for crispness; player's reads a touch brighter
    ctx.strokeStyle = this.isPlayer ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = this.isPlayer ? 1.5 : 1.2;
    torsoPath();
    ctx.stroke();
    // collarbone line
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-torsoW*0.32, shoulderY+torsoH*0.14);
    ctx.quadraticCurveTo(0, shoulderY+torsoH*0.2, torsoW*0.32, shoulderY+torsoH*0.14);
    ctx.stroke();
    // ab/chest shading lines + center linea alba
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2.3;
    for(let i=1;i<=2;i++){
      ctx.beginPath();
      ctx.moveTo(-torsoW*0.22, shoulderY+torsoH*0.4+i*torsoH*0.16);
      ctx.lineTo(torsoW*0.22, shoulderY+torsoH*0.4+i*torsoH*0.16);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, shoulderY+torsoH*0.32);
    ctx.lineTo(0, shoulderY+torsoH*0.78);
    ctx.stroke();
    // Outfit — player cosmetic pattern layered over the torso
    if(this.isPlayer && this.outfit && this.outfit!=='default' && this.outfit!=='outfit_default'){
      const style = this.outfit.replace('outfit_','');
      if(style==='tracksuit'){
        ctx.fillStyle = this.accentColor;
        ctx.fillRect(-shoulderHalf*0.16, torsoTop+2, shoulderHalf*0.16, torsoH-4);
        ctx.fillRect(shoulderHalf*0.0, torsoTop+2, shoulderHalf*0.16, torsoH-4);
      } else if(style==='ninja'){
        ctx.fillStyle = 'rgba(20,20,28,0.55)';
        torsoPath();
        ctx.fill();
        ctx.strokeStyle = this.accentColor; ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-shoulderHalf*0.55, torsoTop+torsoH*0.12);
        ctx.lineTo(shoulderHalf*0.5, torsoBottom-torsoH*0.08);
        ctx.stroke();
      } else if(style==='vest'){
        ctx.fillStyle = Fighter.shade(this.color,-0.35);
        ctx.fillRect(-shoulderHalf*0.92, torsoTop+2, shoulderHalf*0.36, torsoH*0.88);
        ctx.fillRect(shoulderHalf*0.56, torsoTop+2, shoulderHalf*0.36, torsoH*0.88);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.2;
        ctx.strokeRect(-shoulderHalf*0.92, torsoTop+2, shoulderHalf*0.36, torsoH*0.88);
        ctx.strokeRect(shoulderHalf*0.56, torsoTop+2, shoulderHalf*0.36, torsoH*0.88);
      }
    }
    // chest emblem (player only, accent color)
    if(this.isPlayer && this.accentColor){
      ctx.save();
      ctx.translate(0, shoulderY+torsoH*0.28);
      ctx.fillStyle = this.accentColor;
      ctx.beginPath();
      ctx.moveTo(0,-7); ctx.lineTo(5,0); ctx.lineTo(0,7); ctx.lineTo(-5,0); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1; ctx.stroke();
      ctx.restore();
    }
    // trunks/shorts band
    ctx.fillStyle = Fighter.shade(this.color,-0.5);
    ctx.fillRect(-hipHalf, hipY-torsoH*0.16, hipHalf*2, torsoH*0.16);
    // belt highlight
    ctx.fillStyle = this.isPlayer ? this.accentColor : 'rgba(255,255,255,0.15)';
    ctx.fillRect(-hipHalf, hipY-torsoH*0.16, hipHalf*2, this.isPlayer?3:2);

    // front arm last, ON TOP of the torso, so it correctly reads as the near-side arm
    drawArm(frontShoulderX, frontHand, true);

    // Weapon/move-variant FX riding on whichever hand is currently striking
    if(strikingHand && this.attack && this.attack.type==='light' && this.attack.phase==='active'){
      if(this.attack.visualKind==='blade'){
        ctx.save();
        ctx.translate(strikingHand.x, strikingHand.y);
        ctx.fillStyle = '#dfefff';
        ctx.beginPath();
        ctx.moveTo(0,-3); ctx.lineTo(facing*22,-1.5); ctx.lineTo(facing*27,0); ctx.lineTo(facing*22,1.5); ctx.lineTo(0,3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle='rgba(120,180,255,0.7)'; ctx.lineWidth=1; ctx.stroke();
        ctx.fillStyle='#8a6a3a';
        ctx.fillRect(facing*-4, -2, facing*6, 4);
        ctx.restore();
      } else if(this.attack.visualKind==='rapid'){
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = this.isPlayer ? this.accentColor : this.color;
        ctx.lineWidth = 2;
        for(let i=1;i<=2;i++){
          ctx.beginPath();
          ctx.moveTo(strikingHand.x-facing*10*i, strikingHand.y);
          ctx.lineTo(strikingHand.x-facing*4*i, strikingHand.y);
          ctx.stroke();
        }
        ctx.restore();
      } else if(this.attack.visualKind==='twin'){
        ctx.save();
        ctx.strokeStyle = this.accentColor || '#ffd166';
        ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(strikingHand.x, strikingHand.y, armW*0.9, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
      }
    }

    // kicking leg redraw on top (so it visually reads above torso when raised high)
    if(isKickMove){
      const kickFootY = frontFoot.y; // absolute, ground-relative
      const knee = solveIK(frontHipX,hipY,frontFoot.x,kickFootY,thighLen,shinLen,-facing);
      const kickColor = isRoundhouseKick ? Fighter.shade(this.color,-0.1) : this.color;
      drawTaperedLimb(ctx, frontHipX,hipY,limbW*0.62, knee.x,knee.y,limbW*0.46, kickColor, light);
      drawTaperedLimb(ctx, knee.x,knee.y,limbW*0.42, frontFoot.x,kickFootY,limbW*0.3, dark);
      ctx.fillStyle = this.isPlayer ? Fighter.shade(this.accentColor||'#1c1c22',-0.55) : '#1c1c22';
      ctx.beginPath();
      ctx.ellipse(frontFoot.x+facing*4, kickFootY, limbW*0.68, limbW*0.46, facing*0.3, 0, Math.PI*2);
      ctx.fill();
      // motion streak
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = isRoundhouseKick ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(frontHipX, hipY-6);
      ctx.quadraticCurveTo(facing*(w*0.4), hipY-30, frontFoot.x, kickFootY);
      ctx.stroke();
    }

    // ---- head ----
    // neck
    ctx.fillStyle = skinDark;
    ctx.fillRect(-headR*0.32, headY+headR*0.6, headR*0.64, Math.max(2, shoulderY-(headY+headR*0.6)));

    const headGrad = ctx.createRadialGradient(facing*headR*0.3,headY-headR*0.3,headR*0.2, 0,headY,headR*1.1);
    headGrad.addColorStop(0, skinLight);
    headGrad.addColorStop(1, this.skinColor);
    ctx.fillStyle = headGrad;
    // human head shape: rounded flat-ish crown, bulging temples, tapered jaw with a
    // rounded (not pointed) chin — replaces the old egg/almond outline
    const headPath = ()=>{
      ctx.beginPath();
      ctx.moveTo(-headR*0.72, headY-headR*0.82);
      ctx.quadraticCurveTo(-headR*0.5, headY-headR*1.06, 0, headY-headR*1.06);
      ctx.quadraticCurveTo(headR*0.5, headY-headR*1.06, headR*0.72, headY-headR*0.82);
      ctx.quadraticCurveTo(headR*0.98, headY-headR*0.35, headR*0.88, headY+headR*0.15);
      ctx.quadraticCurveTo(headR*0.78, headY+headR*0.55, headR*0.4, headY+headR*0.88);
      ctx.quadraticCurveTo(headR*0.18, headY+headR*1.02, 0, headY+headR*1.04);
      ctx.quadraticCurveTo(-headR*0.18, headY+headR*1.02, -headR*0.4, headY+headR*0.88);
      ctx.quadraticCurveTo(-headR*0.78, headY+headR*0.55, -headR*0.88, headY+headR*0.15);
      ctx.quadraticCurveTo(-headR*0.98, headY-headR*0.35, -headR*0.72, headY-headR*0.82);
      ctx.closePath();
    };
    headPath();
    ctx.fill();
    // nose (facing-side profile bump)
    ctx.fillStyle = skinDark;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(facing*headR*0.92, headY+headR*0.02);
    ctx.quadraticCurveTo(facing*headR*1.08, headY+headR*0.12, facing*headR*0.88, headY+headR*0.2);
    ctx.quadraticCurveTo(facing*headR*0.8, headY+headR*0.1, facing*headR*0.92, headY+headR*0.02);
    ctx.fill();
    ctx.globalAlpha = 1;
    // headband (team color)
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.rect(-headR, headY-headR*0.32, headR*2, headR*0.42);
    ctx.fill();
    ctx.fillStyle = this.isPlayer ? this.accentColor : 'rgba(255,255,255,0.3)';
    ctx.fillRect(-headR, headY-headR*0.32, headR*2, this.isPlayer?3:2);
    if(this.isPlayer){
      // trailing headband tails
      ctx.fillStyle = this.accentColor;
      ctx.beginPath();
      ctx.moveTo(-facing*headR*0.9, headY-headR*0.1);
      ctx.lineTo(-facing*headR*1.6, headY+headR*0.5+Math.sin(this.animT*0.3)*3);
      ctx.lineTo(-facing*headR*1.3, headY+headR*0.15);
      ctx.closePath(); ctx.fill();
      // spiky hair silhouette
      ctx.fillStyle = this.hairColor;
      ctx.beginPath();
      for(let i=-2;i<=2;i++){
        const sx = i*headR*0.32, sh = headR*(0.55+Math.abs(i)*0.08);
        ctx.moveTo(sx-headR*0.14, headY-headR*0.55);
        ctx.lineTo(sx, headY-headR*0.55-sh);
        ctx.lineTo(sx+headR*0.14, headY-headR*0.55);
      }
      ctx.fill();
    }
    // ear (poking out past the head silhouette, drawn last so nothing covers it)
    ctx.fillStyle = this.skinColor;
    ctx.beginPath();
    ctx.ellipse(-facing*headR*0.98, headY+headR*0.05, headR*0.18, headR*0.26, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = skinDark; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(-facing*headR*0.98, headY+headR*0.05, headR*0.18, headR*0.26, 0, 0, Math.PI*2); ctx.stroke();
    // jaw shading (clipped to the head shape so it can't poke past the new jaw taper)
    ctx.save();
    headPath();
    ctx.clip();
    ctx.fillStyle = skinDark;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(0, headY+headR*0.15, headR*0.85, 0.15*Math.PI, 0.85*Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Hat — player cosmetic, drawn on top of hair/ear so it reads clearly
    if(this.isPlayer && this.hat && this.hat!=='none' && this.hat!=='hat_none'){
      const hatColor = this.accentColor || '#ff5028';
      const style = this.hat.replace('hat_','');
      if(style==='cap'){
        ctx.fillStyle = hatColor;
        ctx.beginPath();
        ctx.arc(0, headY-headR*0.15, headR*0.98, Math.PI*1.05, Math.PI*1.95);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = Fighter.shade(hatColor,-0.2);
        ctx.beginPath();
        ctx.ellipse(-facing*headR*0.9, headY-headR*0.25, headR*0.35, headR*0.14, 0,0,Math.PI*2);
        ctx.fill();
      } else if(style==='bandana'){
        ctx.fillStyle = hatColor;
        ctx.beginPath();
        ctx.moveTo(-headR*0.98, headY-headR*0.1);
        ctx.quadraticCurveTo(-headR*0.9, headY-headR*1.05, 0, headY-headR*1.1);
        ctx.quadraticCurveTo(headR*0.9, headY-headR*1.05, headR*0.98, headY-headR*0.1);
        ctx.quadraticCurveTo(headR*0.5, headY-headR*0.4, 0, headY-headR*0.45);
        ctx.quadraticCurveTo(-headR*0.5, headY-headR*0.4, -headR*0.98, headY-headR*0.1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = Fighter.shade(hatColor,-0.15);
        ctx.beginPath(); ctx.arc(-facing*headR*0.9, headY-headR*0.3, headR*0.14, 0, Math.PI*2); ctx.fill();
      } else if(style==='beanie'){
        ctx.fillStyle = hatColor;
        ctx.beginPath();
        ctx.arc(0, headY-headR*0.1, headR*1.0, Math.PI, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = Fighter.shade(hatColor,-0.25);
        ctx.fillRect(-headR*1.0, headY-headR*0.16, headR*2.0, headR*0.22);
      } else if(style==='crown'){
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.moveTo(-headR*0.9, headY-headR*0.5);
        ctx.lineTo(-headR*0.6, headY-headR*1.0);
        ctx.lineTo(-headR*0.25, headY-headR*0.6);
        ctx.lineTo(0, headY-headR*1.1);
        ctx.lineTo(headR*0.25, headY-headR*0.6);
        ctx.lineTo(headR*0.6, headY-headR*1.0);
        ctx.lineTo(headR*0.9, headY-headR*0.5);
        ctx.lineTo(headR*0.85, headY-headR*0.3);
        ctx.lineTo(-headR*0.85, headY-headR*0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle='#ff3050';
        [-0.6,0,0.6].forEach(fx=>{ ctx.beginPath(); ctx.arc(fx*headR, headY-headR*0.75, headR*0.08,0,Math.PI*2); ctx.fill(); });
      }
    }

    if(this.state==='ko'){
      // X eyes
      ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=1.6;
      [facing*headR*0.4, -facing*headR*0.15].forEach(ex=>{
        ctx.beginPath();
        ctx.moveTo(ex-3,headY-3); ctx.lineTo(ex+3,headY+3);
        ctx.moveTo(ex+3,headY-3); ctx.lineTo(ex-3,headY+3);
        ctx.stroke();
      });
    } else {
      // eyes (facing indicator) + brow
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.ellipse(facing*headR*0.42, headY, headR*0.22, headR*0.16, 0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#1a1a1a';
      ctx.beginPath(); ctx.arc(facing*headR*0.42+facing*headR*0.06, headY, headR*0.1,0,Math.PI*2); ctx.fill();
      // eyelid crease — the arc that actually makes an eye read as human rather than a dot
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(facing*headR*0.42, headY-headR*0.02, headR*0.24, Math.PI*1.08, Math.PI*1.92);
      ctx.stroke();
      if(this.femaleBody){
        // a couple of short lashes flicking up from the outer corner
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.3;
        for(let i=0;i<2;i++){
          const lx = facing*headR*(0.6+i*0.08), ly = headY-headR*(0.14+i*0.03);
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx+facing*headR*0.1, ly-headR*0.12);
          ctx.stroke();
        }
      }
      ctx.strokeStyle='#2a1a12'; ctx.lineWidth=2.4;
      ctx.beginPath();
      const browY = headY-headR*0.35;
      const angry = this.state==='attack' || this.state==='hitstun';
      ctx.moveTo(facing*headR*0.15, browY+(angry?headR*0.12:0));
      ctx.lineTo(facing*headR*0.7, browY-(angry?headR*0.05:0));
      ctx.stroke();
      // mouth
      ctx.beginPath();
      ctx.moveTo(-headR*0.1, headY+headR*0.55);
      ctx.lineTo(headR*0.35, headY+headR*0.55);
      ctx.stroke();
    }

    // ---- archetype / boss visual flourishes (silhouette, not just color) ----
    // Hairstyle — player can override via cosmetics; everyone else falls back to
    // gender-based auto (skipped for archetypes with their own dedicated head covering).
    const ownHairLook = (!this.isBoss && (this.archetype==='grappler' || this.archetype==='zoner')) ||
                         (this.isBoss && (this.bossKind==='shadow' || this.bossKind==='pyro'));
    const drawPonytailHair = ()=>{
      const sway = Math.sin(this.animT*0.28)*4;
      ctx.fillStyle = this.hairColor;
      ctx.beginPath();
      ctx.moveTo(-facing*headR*0.7, headY-headR*0.35);
      ctx.quadraticCurveTo(-facing*headR*1.9, headY+headR*0.35+sway, -facing*headR*1.45, headY+headR*1.35+sway);
      ctx.quadraticCurveTo(-facing*headR*1.05, headY+headR*0.65, -facing*headR*0.5, headY-headR*0.1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle=this.color; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(-facing*headR*0.72, headY-headR*0.32); ctx.lineTo(-facing*headR*0.55, headY-headR*0.05); ctx.stroke();
      ctx.fillStyle = this.hairColor;
      ctx.beginPath();
      ctx.moveTo(-headR*0.95, headY-headR*0.05);
      ctx.quadraticCurveTo(-headR*0.85, headY-headR*0.85, 0, headY-headR*0.95);
      ctx.quadraticCurveTo(headR*0.85, headY-headR*0.85, headR*0.95, headY-headR*0.05);
      ctx.quadraticCurveTo(headR*0.6, headY-headR*0.25, 0, headY-headR*0.32);
      ctx.quadraticCurveTo(-headR*0.6, headY-headR*0.25, -headR*0.95, headY-headR*0.05);
      ctx.closePath();
      ctx.fill();
    };
    const drawShortHair = ()=>{
      ctx.fillStyle = this.hairColor;
      ctx.beginPath();
      ctx.moveTo(-headR*0.95, headY-headR*0.05);
      ctx.quadraticCurveTo(-headR*0.92, headY-headR*1.08, 0, headY-headR*1.14);
      ctx.quadraticCurveTo(headR*0.92, headY-headR*1.08, headR*0.95, headY-headR*0.05);
      ctx.quadraticCurveTo(headR*0.65, headY-headR*0.32, 0, headY-headR*0.4);
      ctx.quadraticCurveTo(-headR*0.65, headY-headR*0.32, -headR*0.95, headY-headR*0.05);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = Fighter.shade(this.hairColor,0.15);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(-headR*0.3, headY-headR*0.95); ctx.lineTo(-headR*0.15, headY-headR*0.45);
      ctx.lineTo(headR*0.05, headY-headR*0.92); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    };
    const drawMohawkHair = ()=>{
      ctx.fillStyle = this.hairColor;
      for(let i=-2;i<=2;i++){
        const sx = i*headR*0.14;
        const sh = headR*(0.5+(2-Math.abs(i))*0.15);
        ctx.beginPath();
        ctx.moveTo(sx-headR*0.08, headY-headR*0.9);
        ctx.lineTo(sx, headY-headR*0.9-sh);
        ctx.lineTo(sx+headR*0.08, headY-headR*0.9);
        ctx.closePath();
        ctx.fill();
      }
    };
    const drawLongHair = ()=>{
      drawShortHair();
      const sway = Math.sin(this.animT*0.22)*5;
      ctx.fillStyle = this.hairColor;
      [-1,1].forEach(side=>{
        ctx.beginPath();
        ctx.moveTo(side*headR*0.85, headY-headR*0.1);
        ctx.quadraticCurveTo(side*headR*1.3, headY+headR*1.0+sway*side, side*headR*0.9, headY+headR*2.0+sway*side);
        ctx.quadraticCurveTo(side*headR*0.6, headY+headR*1.2, side*headR*0.55, headY+headR*0.3);
        ctx.closePath();
        ctx.fill();
      });
    };
    const drawBaldShine = ()=>{
      ctx.fillStyle='rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.ellipse(-facing*headR*0.2, headY-headR*0.6, headR*0.28, headR*0.14, 0,0,Math.PI*2); ctx.fill();
    };
    if(this.isPlayer && this.hairStyle && this.hairStyle!=='auto' && this.hairStyle!=='hair_auto'){
      const style = this.hairStyle.replace('hair_','');
      if(style==='short') drawShortHair();
      else if(style==='ponytail') drawPonytailHair();
      else if(style==='mohawk') drawMohawkHair();
      else if(style==='long') drawLongHair();
      else if(style==='bald') drawBaldShine();
    } else if(!ownHairLook){
      if(this.femaleBody) drawPonytailHair(); else drawShortHair();
    }
    // Facial hair — player cosmetic choice, or the Brawler archetype's default beard.
    const drawBeard = ()=>{
      ctx.fillStyle = this.hairColor;
      ctx.beginPath();
      ctx.moveTo(-headR*0.55, headY+headR*0.2);
      ctx.quadraticCurveTo(0, headY+headR*1.15, headR*0.55, headY+headR*0.2);
      ctx.quadraticCurveTo(headR*0.3, headY+headR*0.5, 0, headY+headR*0.45);
      ctx.quadraticCurveTo(-headR*0.3, headY+headR*0.5, -headR*0.55, headY+headR*0.2);
      ctx.closePath();
      ctx.fill();
    };
    if(this.isPlayer && this.facialHair && this.facialHair!=='none' && this.facialHair!=='facial_none'){
      const style = this.facialHair.replace('facial_','');
      ctx.fillStyle = this.hairColor;
      if(style==='beard'){
        drawBeard();
      } else if(style==='goatee'){
        ctx.beginPath();
        ctx.moveTo(-headR*0.22, headY+headR*0.68);
        ctx.quadraticCurveTo(0, headY+headR*1.12, headR*0.22, headY+headR*0.68);
        ctx.quadraticCurveTo(headR*0.1, headY+headR*0.85, 0, headY+headR*0.88);
        ctx.quadraticCurveTo(-headR*0.1, headY+headR*0.85, -headR*0.22, headY+headR*0.68);
        ctx.closePath();
        ctx.fill();
      } else if(style==='mustache'){
        ctx.beginPath();
        ctx.moveTo(-headR*0.35, headY+headR*0.42);
        ctx.quadraticCurveTo(0, headY+headR*0.55, headR*0.35, headY+headR*0.42);
        ctx.quadraticCurveTo(headR*0.2, headY+headR*0.48, 0, headY+headR*0.46);
        ctx.quadraticCurveTo(-headR*0.2, headY+headR*0.48, -headR*0.35, headY+headR*0.42);
        ctx.closePath();
        ctx.fill();
      }
    } else if(this.archetype==='brawler' && !this.isBoss && !this.femaleBody && !this.isPlayer){
      drawBeard();
    }
    if(this.archetype==='tank' && !this.isBoss){
      // bulky shoulder pads
      ctx.fillStyle = Fighter.shade(this.color,-0.2);
      ctx.beginPath(); ctx.ellipse(-torsoW*0.44, shoulderY+8, torsoW*0.24, torsoH*0.2, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(torsoW*0.44, shoulderY+8, torsoW*0.24, torsoH*0.2, 0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.ellipse(-torsoW*0.44, shoulderY+8, torsoW*0.24, torsoH*0.2, 0,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(torsoW*0.44, shoulderY+8, torsoW*0.24, torsoH*0.2, 0,0,Math.PI*2); ctx.stroke();
    }
    if(this.archetype==='defensive' && !this.isBoss){
      // riveted chest guard
      ctx.fillStyle = 'rgba(220,230,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(0, shoulderY+torsoH*0.08);
      ctx.lineTo(torsoW*0.26, shoulderY+torsoH*0.3);
      ctx.lineTo(0, shoulderY+torsoH*0.64);
      ctx.lineTo(-torsoW*0.26, shoulderY+torsoH*0.3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(0, shoulderY+torsoH*0.32, 2.2, 0, Math.PI*2); ctx.fill();
    }
    if(this.archetype==='zoner' && !this.isBoss){
      // hooded cloak flap + goggles
      ctx.fillStyle = 'rgba(20,20,30,0.6)';
      ctx.beginPath();
      ctx.moveTo(-facing*torsoW*0.32, shoulderY);
      ctx.lineTo(-facing*torsoW*1.15, shoulderY+torsoH*1.4+Math.sin(this.animT*0.15)*6);
      ctx.lineTo(-facing*torsoW*0.16, shoulderY+torsoH*0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = this.color;
      ctx.fillRect(-headR*0.9, headY-headR*0.12, headR*1.8, headR*0.3);
      ctx.fillStyle='rgba(200,240,255,0.85)';
      ctx.beginPath(); ctx.arc(facing*headR*0.4, headY, headR*0.22, 0, Math.PI*2); ctx.fill();
    }
    if(this.archetype==='grappler' && !this.isBoss){
      // bald head shine + singlet straps
      ctx.fillStyle='rgba(255,255,255,0.32)';
      ctx.beginPath(); ctx.ellipse(-facing*headR*0.2, headY-headR*0.5, headR*0.3, headR*0.16, 0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = Fighter.shade(this.color,-0.4); ctx.lineWidth=torsoW*0.08;
      ctx.beginPath(); ctx.moveTo(-torsoW*0.3, shoulderY); ctx.lineTo(-torsoW*0.12, shoulderY+torsoH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(torsoW*0.3, shoulderY); ctx.lineTo(torsoW*0.12, shoulderY+torsoH); ctx.stroke();
    }
    // boss-specific silhouettes
    if(this.bossKind==='champion'){
      ctx.fillStyle='rgba(255,209,102,0.5)';
      ctx.beginPath();
      ctx.moveTo(-torsoW*0.35, shoulderY+4);
      ctx.quadraticCurveTo(-facing*torsoW*0.9, shoulderY+torsoH*1.6, -facing*torsoW*0.5, shoulderY+torsoH*2.3+Math.sin(this.animT*0.1)*8);
      ctx.quadraticCurveTo(0, shoulderY+torsoH*1.8, torsoW*0.35, shoulderY+4);
      ctx.closePath(); ctx.fill();
    }
    if(this.bossKind==='titan'){
      ctx.fillStyle=Fighter.shade(this.color,-0.3);
      [-1,1].forEach(sx=>{
        ctx.beginPath();
        ctx.moveTo(sx*torsoW*0.4, shoulderY+2);
        ctx.lineTo(sx*torsoW*0.68, shoulderY-torsoH*0.22);
        ctx.lineTo(sx*torsoW*0.56, shoulderY+torsoH*0.18);
        ctx.closePath(); ctx.fill();
      });
    }
    if(this.bossKind==='shadow'){
      ctx.fillStyle='rgba(10,10,16,0.92)';
      ctx.beginPath(); ctx.arc(0, headY, headR*1.18, Math.PI*0.95, Math.PI*2.05); ctx.fill();
      ctx.shadowColor='#ff3050'; ctx.shadowBlur=8;
      ctx.fillStyle='#ff3050';
      ctx.beginPath(); ctx.arc(facing*headR*0.35, headY+headR*0.05, headR*0.13, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }
    if(this.bossKind==='pyro'){
      ctx.fillStyle=`rgba(255,${120+((Math.sin(this.animT*0.3)*40)|0)},60,0.85)`;
      for(let i=-1;i<=1;i++){
        ctx.beginPath();
        ctx.moveTo(i*headR*0.35, headY-headR*0.7);
        ctx.lineTo(i*headR*0.35+headR*0.12, headY-headR*(1.5+Math.sin(this.animT*0.4+i)*0.3));
        ctx.lineTo(i*headR*0.35-headR*0.12, headY-headR*0.7);
        ctx.closePath(); ctx.fill();
      }
    }
    if(this.bossKind==='master'){
      ctx.fillStyle='rgba(240,240,235,0.5)';
      ctx.fillRect(-torsoW*0.5, shoulderY+torsoH*0.2, torsoW, torsoH*0.5);
      ctx.strokeStyle=this.color; ctx.lineWidth=4;
      ctx.beginPath(); ctx.moveTo(-torsoW*0.4, shoulderY+torsoH*0.25); ctx.lineTo(torsoW*0.4, shoulderY+torsoH*0.75); ctx.stroke();
    }

    // block shield glow
    if(this.state==='block'){
      ctx.strokeStyle='rgba(120,190,255,0.7)';
      ctx.lineWidth=3;
      ctx.beginPath();
      ctx.arc(facing*w*0.35, shoulderY+torsoH*0.3, 24, 0, Math.PI*2);
      ctx.stroke();
      ctx.fillStyle='rgba(120,190,255,0.12)';
      ctx.fill();
    }

    // special attack glow aura on caster during active frames
    if(isSpecial && atkPhase==='active'){
      ctx.strokeStyle='rgba(255,190,80,0.55)';
      ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(0, shoulderY+torsoH*0.4, w*0.9, 0, Math.PI*2); ctx.stroke();
    }

    // boss crown marker
    if(this.isBoss){
      ctx.fillStyle='#ffb32e';
      ctx.font=`bold 15px ${GLOBAL_BODY_FONT}`;
      ctx.textAlign='center';
      ctx.shadowColor='#ffb32e'; ctx.shadowBlur=8;
      ctx.fillText('★', 0, headY-headR-10);
      ctx.shadowBlur=0;
    }

    ctx.restore();
  }
}
Fighter.PIXEL_SCALE = 3;

// Rounded rectangle path helper (used for torso)
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

// ======================================================================
// ENEMY ARCHETYPES / NAMES
// ======================================================================
const ARCHETYPES = {
  brawler:   {label:'BRAWLER',   hp:1.0, dmg:1.0, spd:1.0, aggro:0.5, color:'#c95b3f', special:'whirlwind'},
  rushdown:  {label:'RUSHDOWN',  hp:0.75,dmg:0.8, spd:1.45,aggro:0.85,color:'#ff5d8a', special:'flurry', armWMult:0.82},
  tank:      {label:'TANK',      hp:1.6, dmg:1.25,spd:0.65,aggro:0.4, color:'#6b5b95', special:'megapush', bodyMult:1.1, armWMult:1.1},
  defensive: {label:'DEFENSIVE', hp:1.0, dmg:0.95,spd:0.9, aggro:0.3, color:'#4fa8ff', special:'fireball'},
  zoner:     {label:'ZONER',     hp:0.85,dmg:0.9, spd:0.95,aggro:0.35,color:'#4fd6ff', ranged:true, special:'megalaser', heavyIsRanged:true},
  grappler:  {label:'GRAPPLER',  hp:1.4, dmg:1.5, spd:0.55,aggro:0.55,color:'#8a6d3b', shortRange:true, special:'suplex'},
};
const BOSS_ARCHETYPES = {
  champion: {label:'CHAMPION', hp:2.2, dmg:1.2, spd:1.05, aggro:0.6, color:'#ffd166', base:'brawler', special:'comboburst'},
  titan:    {label:'TITAN',    hp:3.0, dmg:1.5, spd:0.55, aggro:0.45,color:'#7a4b8a', base:'tank', special:'meteorslam'},
  shadow:   {label:'SHADOW',   hp:1.8, dmg:1.1, spd:1.6,  aggro:0.9, color:'#2b2b3a', base:'rushdown', special:'phantomdash'},
  pyro:     {label:'PYRO',     hp:1.9, dmg:1.15,spd:0.9,  aggro:0.5, color:'#ff7b3f', base:'zoner', ranged:true, special:'infernobarrage'},
  master:   {label:'THE MASTER',hp:2.4,dmg:1.3, spd:1.0,  aggro:0.6, color:'#5bd6a0', base:'defensive', special:'counterstrike'},
};
const NAME_PARTS1 = ['IRON','VIPER','SHADOW','CRIMSON','RAZOR','GHOST','STONE','BLAZE','THUNDER','NIGHT','STEEL','WOLF','VENOM','GOLD','ASH'];
const NAME_PARTS2 = ['JACK','FANG','KNUCKLE','STORM','HAWK','CRUSHER','KID','REAPER','BULL','FIST','WING','BONE','SPARK','TIDE','NULL'];
function genEnemyName(){ return `${choice(NAME_PARTS1)} ${choice(NAME_PARTS2)}`; }

// Deterministic per-name variety so each generated fighter gets a consistent
// hair colour and skin tone instead of everyone looking identical.
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return Math.abs(h); }
const HAIR_PALETTE = ['#1a1410','#2a1710','#3a2418','#17171d','#4a2e18','#5c3a1e'];
const SKIN_PALETTE = ['#e8b98c','#c98f63','#a5714a','#8a5a3a','#f0cba0','#7a4a30'];
function hairColorFor(name){ return HAIR_PALETTE[hashStr(name)%HAIR_PALETTE.length]; }
function skinColorFor(name){ return SKIN_PALETTE[hashStr(name+'skin')%SKIN_PALETTE.length]; }

function generateEnemy(fightNumber){
  const isBoss = fightNumber % CFG.BOSS_EVERY === 0;
  const pool = isBoss ? BOSS_ARCHETYPES : ARCHETYPES;
  const key = choice(Object.keys(pool));
  const arche = pool[key];
  const baseKey = isBoss ? arche.base : key;
  const gender = RNG() < 0.5 ? 'male' : 'female';

  const scaleT = (fightNumber-1) * 0.045; // gradual scaling
  const waveBonus = fightNumber-1; // flat +1 HP and +1 damage per wave already fought
  const hp = Math.round((isBoss?90:55) * arche.hp * (1+scaleT)) + waveBonus;
  const dmgMult = arche.dmg * (1+scaleT*0.55);
  const spd = arche.spd * CFG.MOVE_SPEED * (1+Math.min(scaleT*0.15,0.3));

  const sizeMult = (!isBoss && arche.bodyMult) || 1;
  const baseW = isBoss?117:90, baseH = isBoss?239:203;
  const enemyName = isBoss ? `${genEnemyName()} the ${arche.label}` : genEnemyName();
  const archArmMult = (!isBoss && arche.armWMult) || 1;
  const genderArmMult = gender==='female' ? 0.88 : 1;

  const enemy = new Fighter({
    name: enemyName,
    isPlayer:false, x: 700, facing:-1,
    w: baseW*sizeMult, h: baseH*sizeMult,
    maxHp: hp, speed: spd, dmgMult: dmgMult, flatDmgBonus: waveBonus,
    defMult: 1, knockbackMult: isBoss?0.8:1,
    color: arche.color, isBoss,
    skinColor: skinColorFor(enemyName),
    gender,
    archetype: baseKey,
    bossKind: isBoss ? key : null,
    specialKind: arche.special,
    heavyIsRanged: !!(!isBoss && arche.heavyIsRanged),
    armWMult: archArmMult * genderArmMult,
    aggression: arche.aggro + (isBoss?0.1:0),
    reaction: Math.max(6, 20 - fightNumber*0.7),
  });
  enemy.ranged = !!arche.ranged;
  enemy.shortRange = !!arche.shortRange;
  enemy.archLabel = arche.label;
  enemy.intelligence = clamp(0.25 + fightNumber*0.045, 0.25, 0.95); // block/punish chance
  return enemy;
}

// ======================================================================
// AI CONTROLLER
// ======================================================================
function updateAI(enemy, player, game){
  if(enemy.state==='ko' || enemy.state==='grabbed') return;
  enemy.aiTimer--;

  const dist = Math.abs(enemy.x - player.x);
  const wantsRange = enemy.ranged ? 260 : (enemy.shortRange ? 46 : 90);

  // reaction-delayed re-decision
  if(enemy.aiTimer<=0){
    enemy.aiTimer = randInt(enemy.reaction, enemy.reaction+30);
    const r = RNG();
    if(player.state==='attack' && player.attack && player.attack.phase==='startup' && dist<130 && RNG()<enemy.intelligence){
      enemy.aiState = RNG()<0.6 ? 'block' : 'retreat';
    } else if(dist > wantsRange+40){
      enemy.aiState = RNG()<enemy.aggression+0.2 ? 'approach' : 'wait';
    } else if(dist < wantsRange-30 && enemy.ranged){
      enemy.aiState = 'retreat';
    } else if(dist < 70){
      if(RNG() < enemy.aggression) enemy.aiState = 'attack';
      else enemy.aiState = RNG()<0.3?'block':'attack';
    } else {
      enemy.aiState = RNG()<0.5?'approach':'attack';
    }
    // punish opportunity
    if(player.state==='hitstun' && dist<110 && RNG()<0.7) enemy.aiState='punish';
    if(player.state==='block' && RNG()<0.2) enemy.aiState='wait';
  }

  enemy.blocking = false;
  const dir = player.x > enemy.x ? 1 : -1;

  if(enemy.state==='attack'){ return; } // committed

  switch(enemy.aiState){
    case 'approach':
      enemy.vx = dir*enemy.speed;
      enemy.state = enemy.grounded ? 'walk' : enemy.state;
      break;
    case 'retreat':
      enemy.vx = -dir*enemy.speed*0.9;
      enemy.state = enemy.grounded ? 'walk' : enemy.state;
      break;
    case 'wait':
      enemy.vx *= 0.7;
      if(enemy.state==='walk') enemy.state='idle';
      break;
    case 'block':
      enemy.blocking = true;
      enemy.state = 'block';
      enemy.vx *= CFG.BLOCK_SPEED_MULT;
      break;
    case 'jump':
      if(enemy.grounded && enemy.jumpsLeft>0){ enemy.vy = CFG.JUMP_V; enemy.jumpsLeft--; enemy.state='jump'; }
      break;
    case 'attack':
    case 'punish': {
      const closeSpecials = ['whirlwind','flurry','megapush','suplex','comboburst'];
      const specialReady = enemy.meter>=enemy.meterMax;
      const specialNeedsClose = closeSpecials.includes(enemy.specialKind);
      if(specialReady && RNG()<0.5 && (!specialNeedsClose || dist < wantsRange+30)){
        enemy.startSpecial();
      } else if(dist < wantsRange+20 || enemy.ranged){
        const useHeavy = RNG() < (enemy.aiState==='punish'?0.65:0.35);
        enemy.startAttack(useHeavy?'heavy':'light', player);
      } else {
        enemy.vx = dir*enemy.speed;
        enemy.state = enemy.grounded?'walk':enemy.state;
      }
      break;
    }
  }

  if(enemy.grounded && enemy.state!=='attack' && enemy.state!=='block' && Math.abs(enemy.vx)<0.3){
    enemy.state='idle';
  }
}

// ======================================================================
// PLAYER CONTROLLER
// ======================================================================
function updatePlayerControl(p, other, game){
  if(p.state==='ko') return;
  if(p.state==='grabbed') return; // no control while held by a grab
  const held = Input.keys;

  // Track press timing so Grab (Light+Heavy together) can detect near-simultaneous taps.
  if(Input.pressed['j']) p._lastJPress = game.frame;
  if(Input.pressed['k']) p._lastKPress = game.frame;
  const jkCombo = (Input.pressed['j'] || Input.pressed['k']) &&
    game.frame-(p._lastJPress===undefined?-999:p._lastJPress) <= 6 &&
    game.frame-(p._lastKPress===undefined?-999:p._lastKPress) <= 6;

  // ---- Dodge: Direction + Special (no meter needed) ----
  if(p.dodgeCooldownTimer>0) p.dodgeCooldownTimer--;
  const dirHeld = held['a'] || held['d'];
  if(Input.pressed[' '] && dirHeld && p.dodgeCooldownTimer<=0 && p.state!=='attack' && p.state!=='hitstun'){
    p.dodgeIframes = 12;
    const cdMult = (p.dodgeCooldownMult||1) * (1-(p.dodgeCooldownMeta||0));
    p.dodgeCooldownTimer = Math.max(18, Math.round(60*cdMult));
    const dir = held['a'] ? -1 : 1;
    p.vx = dir*10;
    game.spawnDust(p.x);
    Input.pressed[' '] = false; // consume so it doesn't also try to fire the special
  }
  if(p.dodgeIframes>0) p.dodgeIframes--;

  // ---- Throw: if currently holding a grabbed opponent ----
  if(p.grabbedTarget && p.hasThrow && (Input.pressed['j']||Input.pressed['k'])){
    p.throwGrabbed(game);
    for(const k in Input.pressed) Input.pressed[k]=false;
    for(const k in Input.released) Input.released[k]=false;
    return;
  }

  // ---- Grab: Light + Heavy together ----
  if(jkCombo && p.hasGrab && p.grounded && p.state!=='attack' && !p.grabbedTarget){
    p.startTechnique('grab', other);
    Input.pressed['j']=false; Input.pressed['k']=false; // consume so no normal attack also fires
  }

  p.blocking = !!held['l'] && p.state!=='attack';

  if(p.state==='attack'){
    // allow nothing but let attack finish; still apply light physics elsewhere
  } else if(p.blocking){
    p.state='block';
    let mv=0;
    if(held['a']) mv-=1; if(held['d']) mv+=1;
    p.vx = mv*p.speed*(1+p.speedBonus)*CFG.BLOCK_SPEED_MULT;
    p.crouching=false;
  } else {
    let mv=0;
    if(held['a']) mv-=1; if(held['d']) mv+=1;
    p.crouching = !!held['s'] && p.grounded;

    if(p.crouching){
      p.vx *= 0.5;
      p.state='crouch';
    } else {
      p.vx = mv*p.speed*(1+p.speedBonus);
      if(p.grounded){
        p.state = mv!==0 ? 'walk' : 'idle';
      } else {
        p.state = 'jump';
      }
    }

    if(Input.pressed['w'] && p.jumpsLeft>0){
      p.vy = CFG.JUMP_V;
      p.jumpsLeft--;
      p.state='jump';
      game.spawnDust(p.x,true);
    }

    // Ground Pound: Down + Heavy while airborne
    if(!p.grounded && p.hasGroundPound && held['s'] && Input.pressed['k']){
      p.startTechnique('groundpound', other);
    } else if(Input.pressed['j']){
      p.startAttack('light', other);
    } else {
      const speedFrac = Math.abs(p.vx)/(p.speed*(1+p.speedBonus)+0.001);
      const runReady = p.hasRunningAttack && p.grounded && speedFrac>0.55 && mv!==0;
      if(p.hasChargedHeavy && !runReady){
        // hold K to charge, release to strike
        if(held['k']) p.kHoldFrames = Math.min(50, (p.kHoldFrames||0)+1);
        if(Input.released['k'] && p.kHoldFrames>0){
          const chargeMult = 1 + Math.min(1.2, p.kHoldFrames/50*1.2);
          p.startAttack('heavy', other, {charged:true, chargeMult});
          p.kHoldFrames = 0;
        }
      } else if(Input.pressed['k']){
        if(runReady) p.startTechnique('runningattack', other);
        else p.startAttack('heavy', other);
      }
      if(Input.pressed[' '] && p.meter>=p.meterMax){ p.startSpecial(); }
    }
  }

  // crouch attacks: Down+Light (slide kick while moving), Down+Heavy (uppercut)
  if(p.state==='crouch'){
    let mv=0; if(held['a']) mv-=1; if(held['d']) mv+=1;
    if(Input.pressed['j']){
      if(p.hasSlideKick && mv!==0) p.startTechnique('slidekick', other);
      else p.startAttack('light', other);
    } else if(Input.pressed['k']){
      if(p.hasUppercut) p.startTechnique('uppercut', other);
      else p.startAttack('heavy', other);
    }
  }

  for(const k in Input.pressed) Input.pressed[k]=false;
  for(const k in Input.released) Input.released[k]=false;
}

// ======================================================================
// UPGRADES
// ======================================================================
const UPGRADE_POOL = [
  // Damage
  {id:'heavy_hands', name:'Heavy Hands', rarity:'common', tree:'damage', desc:'+15% light attack damage.', apply:p=>{p.globalDmgBonus+=0; p._flag_light=true; p.dmgMultLightBonus=(p.dmgMultLightBonus||0)+0.15;}},
  {id:'powerhouse', name:'Powerhouse', rarity:'common', tree:'damage', desc:'+20% heavy attack damage.', apply:p=>{p.dmgMultHeavyBonus=(p.dmgMultHeavyBonus||0)+0.2;}},
  {id:'glass_cannon', name:'Glass Cannon', rarity:'rare', tree:'damage', desc:'+40% damage but -20 max HP.', apply:p=>{p.globalDmgBonus+=0.4; p.maxHp=Math.max(20,p.maxHp-20); p.hp=Math.min(p.hp,p.maxHp); p.glassCannon=true;}},
  // Speed
  {id:'quick_feet', name:'Quick Feet', rarity:'common', tree:'speed', desc:'+10% movement speed.', apply:p=>{p.speedBonus+=0.1;}},
  {id:'lightning_hands', name:'Lightning Hands', rarity:'uncommon', tree:'speed', desc:'Light attacks are 15% faster.', apply:p=>{p.lightSpeedBonus=clamp((p.lightSpeedBonus||0)+0.15,0,0.6);}},
  {id:'rapid_recovery', name:'Rapid Recovery', rarity:'uncommon', tree:'speed', desc:'Reduced attack recovery time.', apply:p=>{p.recoveryReduction=clamp(p.recoveryReduction+0.18,0,0.6);}},
  // Defence
  {id:'tough_skin', name:'Tough Skin', rarity:'common', tree:'defence', desc:'Take 10% less damage.', apply:p=>{p.dmgReduction=clamp(p.dmgReduction+0.1,0,0.7);}},
  {id:'iron_guard', name:'Iron Guard', rarity:'uncommon', tree:'defence', desc:'Blocking prevents more damage.', apply:p=>{p.blockReduction=clamp(p.blockReduction+0.25,0,0.8);}},
  {id:'last_stand', name:'Last Stand', rarity:'rare', tree:'defence', desc:'Deal increased damage below 25% health.', apply:p=>{p.lastStand=true;}},
  // Health
  {id:'conditioning', name:'Conditioning', rarity:'common', tree:'health', desc:'+15 maximum HP.', apply:p=>{p.maxHp+=15; p.hp+=15;}},
  {id:'second_wind', name:'Second Wind', rarity:'uncommon', tree:'health', desc:'Heal more after defeating an opponent.', apply:p=>{p.healBonus=(p.healBonus||0)+0.12;}},
  // Combo
  {id:'combo_master', name:'Combo Master', rarity:'rare', tree:'combo', desc:'Add another attack to the basic combo.', apply:p=>{p.comboExtend+=1;}},
  {id:'momentum', name:'Momentum', rarity:'uncommon', tree:'combo', desc:'Each consecutive hit deals slightly more damage.', apply:p=>{p.momentumMult=(p.momentumMult||0)+0.06;}},
  {id:'finisher', name:'Finisher', rarity:'uncommon', tree:'combo', desc:'Final combo attack deals increased damage and knockback.', apply:p=>{p.finisherBoost=true;}},
  // Special
  {id:'overcharge', name:'Overcharge', rarity:'common', tree:'special', desc:'Special meter fills faster.', apply:p=>{p.meterGainMult+=0.35;}},
  {id:'mega_blast', name:'Mega Blast', rarity:'uncommon', tree:'special', desc:'Eye laser hits harder.', apply:p=>{p.specialSizeMult+=0.5; p.specialDmgBonus=(p.specialDmgBonus||0)+0.2;}},
  {id:'twin_blast', name:'Twin Blast', rarity:'rare', tree:'special', desc:'Eye laser fires from both eyes, hitting twice.', apply:p=>{p.specialTwin=true;}},
  {id:'piercing_blast', name:'Piercing Blast', rarity:'legendary', tree:'special', desc:'Eye laser burns through blocks for chip damage.', apply:p=>{p.specialPierce=true;}},
  // Movement
  {id:'air_fighter', name:'Air Fighter', rarity:'uncommon', tree:'movement', desc:'Jump attacks deal more damage.', apply:p=>{p.jumpDmgMult+=0.3;}},
  {id:'double_jump', name:'Double Jump', rarity:'rare', tree:'movement', desc:'Gain a second jump.', apply:p=>{p.doubleJump=true;}},
  {id:'dash', name:'Dash', rarity:'legendary', tree:'movement', desc:'Movement speed greatly increased.', apply:p=>{p.speedBonus+=0.3; p.dashUnlocked=true;}},
];
const RARITY_WEIGHT = {common:50, uncommon:28, rare:15, legendary:7};
const UPGRADE_TREES = ['damage','speed','defence','health','combo','special','movement'];

function rollUpgrades(count, bossBonus, opts){
  const o = opts || {};
  const weights = {...RARITY_WEIGHT};
  if(bossBonus){ weights.rare*=2; weights.legendary*=3; weights.common*=0.5; }
  if(o.luckyBreak) weights.rare *= 1.5;
  if(o.legendaryChance) weights.legendary *= 1.4;
  const pool = [...UPGRADE_POOL];
  const results = [];
  for(let i=0;i<count && pool.length;i++){
    let total = pool.reduce((s,u)=>{
      let w = weights[u.rarity];
      if(o.specialistTrees && o.specialistTrees.has(u.tree)) w *= 1.3;
      return s+w;
    },0);
    let r = RNG()*total;
    let idx=0;
    for(;idx<pool.length;idx++){
      let w = weights[pool[idx].rarity];
      if(o.specialistTrees && o.specialistTrees.has(pool[idx].tree)) w *= 1.3;
      r-=w; if(r<=0) break;
    }
    idx = clamp(idx,0,pool.length-1);
    results.push(pool[idx]);
    pool.splice(idx,1);
  }
  return results;
}

// ======================================================================
// GAME
// ======================================================================
// ======================================================================
// STAGES — one is chosen at random per run
// ======================================================================
function starField(ctx,stars,frame,color){
  stars.forEach(s=>{
    const tw = 0.5+0.5*Math.sin(frame*0.03+s.p);
    ctx.globalAlpha = 0.3+tw*0.6;
    ctx.fillStyle = color;
    ctx.fillRect(s.x,s.y,s.r,s.r);
  });
  ctx.globalAlpha=1;
}
function skyline(ctx,blds,color,groundY){
  ctx.fillStyle=color;
  blds.forEach(b=>{ ctx.fillRect(b.x,groundY-b.h,b.w,b.h); });
}
function fillSky(ctx,top,bot,groundY){
  const g=ctx.createLinearGradient(0,0,0,groundY);
  g.addColorStop(0,top); g.addColorStop(1,bot);
  ctx.fillStyle=g; ctx.fillRect(0,0,960,groundY);
}
function groundBand(ctx,color,lineColor,groundY){
  ctx.fillStyle=color; ctx.fillRect(0,groundY,960,540-groundY);
  ctx.strokeStyle=lineColor; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(0,groundY); ctx.lineTo(960,groundY); ctx.stroke();
}

const STAGE_DEFS = [
// 1. DINOSAUR ------------------------------------------------------------
{ name:'PRIMEVAL VALLEY', accent:'#8fbf4a',
  build(){ return { ferns: Array.from({length:9},()=>({x:randInt(30,930), s:0.6+RNG()*0.9})) }; },
  draw(ctx,d,f){
    fillSky(ctx,'#274a2c','#8fae56',CFG.GROUND_Y);
    // sun haze
    ctx.fillStyle='rgba(255,230,150,0.35)'; ctx.beginPath(); ctx.arc(160,110,60,0,Math.PI*2); ctx.fill();
    // volcano
    ctx.fillStyle='rgba(55,45,40,0.65)';
    ctx.beginPath(); ctx.moveTo(640,CFG.GROUND_Y); ctx.lineTo(755,130); ctx.lineTo(880,CFG.GROUND_Y); ctx.closePath(); ctx.fill();
    ctx.fillStyle=`rgba(255,${110+Math.sin(f*0.1)*30|0},50,0.7)`;
    ctx.beginPath(); ctx.arc(755,132,9,0,Math.PI*2); ctx.fill();
    // distant long-neck silhouette
    ctx.fillStyle='rgba(25,45,25,0.55)';
    ctx.beginPath(); ctx.ellipse(140,300,68,34,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(185,290); ctx.quadraticCurveTo(230,220,215,170); ctx.quadraticCurveTo(210,160,200,168);
    ctx.quadraticCurveTo(215,225,175,292); ctx.closePath(); ctx.fill();
    // ferns
    d.ferns.forEach(fern=>{
      ctx.fillStyle='rgba(30,70,25,0.8)';
      for(let i=-2;i<=2;i++){
        ctx.beginPath();
        ctx.ellipse(fern.x+i*6*fern.s, CFG.GROUND_Y-8*fern.s, 5*fern.s, 22*fern.s, i*0.25, 0, Math.PI*2);
        ctx.fill();
      }
    });
    groundBand(ctx,'#4a3826','#8a6a3f',CFG.GROUND_Y);
    // scattered rocks
    ctx.fillStyle='#3a2c1c';
    for(let i=0;i<8;i++){ ctx.beginPath(); ctx.ellipse(50+i*115,CFG.GROUND_Y+18,10,6,0,0,Math.PI*2); ctx.fill(); }
  }
},
// 2. JAPANESE --------------------------------------------------------------
{ name:'SAKURA COURTYARD', accent:'#ff8fb0',
  build(){ return { petals: Array.from({length:22},()=>({x:randInt(0,960), y:randInt(0,400), s:0.5+RNG()*0.9, sp:0.4+RNG()*0.6, ph:RNG()*10})) }; },
  draw(ctx,d,f){
    fillSky(ctx,'#3a2740','#c98fae',CFG.GROUND_Y);
    // moon
    ctx.fillStyle='rgba(255,245,220,0.85)'; ctx.beginPath(); ctx.arc(820,90,34,0,Math.PI*2); ctx.fill();
    // pagoda silhouette
    ctx.fillStyle='rgba(30,15,25,0.7)';
    for(let i=0;i<3;i++){ ctx.fillRect(560-i*30, 250+i*45, 200+i*60, 14); ctx.beginPath(); ctx.moveTo(560-i*30-10,250+i*45); ctx.lineTo(660,210+i*45-20); ctx.lineTo(760+i*30+10,250+i*45); ctx.closePath(); ctx.fill(); }
    ctx.fillRect(630,290,60,130);
    // torii gate
    ctx.strokeStyle='#a83a2a'; ctx.lineWidth=10;
    ctx.beginPath(); ctx.moveTo(140,CFG.GROUND_Y); ctx.lineTo(140,180); ctx.moveTo(260,CFG.GROUND_Y); ctx.lineTo(260,180); ctx.stroke();
    ctx.lineWidth=14; ctx.beginPath(); ctx.moveTo(120,180); ctx.lineTo(280,180); ctx.stroke();
    ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(130,205); ctx.lineTo(270,205); ctx.stroke();
    // lanterns
    [200,720].forEach(lx=>{
      ctx.fillStyle='#ffcf6b'; ctx.beginPath(); ctx.arc(lx,150,10,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=0.25; ctx.beginPath(); ctx.arc(lx,150,22,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    });
    groundBand(ctx,'#5a4632','#8a6a3f',CFG.GROUND_Y);
    // wood plank lines
    ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=2;
    for(let i=0;i<16;i++){ ctx.beginPath(); ctx.moveTo(i*64,CFG.GROUND_Y); ctx.lineTo(i*64,540); ctx.stroke(); }
    // falling petals
    d.petals.forEach(p=>{
      const y = (p.y+f*p.sp)%400;
      const x = p.x+Math.sin(f*0.02+p.ph)*20;
      ctx.fillStyle='rgba(255,180,205,0.85)';
      ctx.beginPath(); ctx.ellipse(x,y,3*p.s,2*p.s,f*0.05+p.ph,0,Math.PI*2); ctx.fill();
    });
  }
},
// 3. NEON --------------------------------------------------------------
{ name:'NEON DISTRICT', accent:'#ff2ee0',
  build(){ return {}; },
  draw(ctx,d,f){
    fillSky(ctx,'#0a0620','#2a0a40',CFG.GROUND_Y);
    // sun grid circle
    const cx=480,cy=260,r=140;
    const grad=ctx.createLinearGradient(0,cy-r,0,cy+r);
    grad.addColorStop(0,'#ff5fd0'); grad.addColorStop(1,'#3fe0ff');
    ctx.fillStyle=grad;
    ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();
    ctx.fillRect(cx-r,cy-r,r*2,r*2);
    ctx.strokeStyle='rgba(10,6,20,0.9)'; ctx.lineWidth=6;
    for(let i=0;i<8;i++){ ctx.beginPath(); ctx.moveTo(cx-r,cy-r+30+i*18); ctx.lineTo(cx+r,cy-r+30+i*18); ctx.stroke(); }
    ctx.restore();
    // skyline
    ctx.strokeStyle='rgba(80,240,255,0.7)'; ctx.lineWidth=1.5;
    for(let i=0;i<10;i++){
      const x=i*100, h=100+((i*53)%160);
      ctx.strokeRect(x,CFG.GROUND_Y-h,70,h);
      if(i%2===0){ ctx.fillStyle='rgba(255,60,220,0.5)'; ctx.fillRect(x+10,CFG.GROUND_Y-h+10,50,6); }
    }
    // perspective floor grid
    ctx.fillStyle='#120818'; ctx.fillRect(0,CFG.GROUND_Y,960,540-CFG.GROUND_Y);
    ctx.strokeStyle='rgba(255,50,220,0.5)'; ctx.lineWidth=2;
    for(let i=-10;i<=10;i++){
      ctx.beginPath(); ctx.moveTo(480+i*40, CFG.GROUND_Y); ctx.lineTo(480+i*130, 540); ctx.stroke();
    }
    ctx.strokeStyle='rgba(80,240,255,0.4)';
    for(let j=0;j<5;j++){ ctx.beginPath(); ctx.moveTo(0,CFG.GROUND_Y+j*j*4+10); ctx.lineTo(960,CFG.GROUND_Y+j*j*4+10); ctx.stroke(); }
    ctx.strokeStyle='#ff2ee0'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(0,CFG.GROUND_Y); ctx.lineTo(960,CFG.GROUND_Y); ctx.stroke();
  }
},
// 4. CYBERPUNK --------------------------------------------------------------
{ name:'CHROME SPRAWL', accent:'#4fd6ff',
  build(){ return { rain: Array.from({length:40},()=>({x:randInt(0,960), y:randInt(0,400), l:8+RNG()*14, sp:6+RNG()*6})),
                     signs: Array.from({length:6},()=>({x:randInt(60,900), y:randInt(120,300), c:choice(['#ff2e6e','#4fd6ff','#b04fff','#4fff9e'])})) }; },
  draw(ctx,d,f){
    fillSky(ctx,'#050912','#1a2438',CFG.GROUND_Y);
    // towers
    ctx.fillStyle='#0c1220';
    for(let i=0;i<8;i++){ const x=i*130,h=180+((i*71)%220); ctx.fillRect(x,CFG.GROUND_Y-h,110,h); }
    d.signs.forEach(s=>{
      ctx.fillStyle=s.c; ctx.globalAlpha=0.8+0.2*Math.sin(f*0.2+s.x);
      ctx.fillRect(s.x,s.y,36,8); ctx.globalAlpha=1;
      ctx.globalAlpha=0.15; ctx.beginPath(); ctx.arc(s.x+18,s.y+4,20,0,Math.PI*2); ctx.fillStyle=s.c; ctx.fill(); ctx.globalAlpha=1;
    });
    // rain
    ctx.strokeStyle='rgba(160,200,255,0.35)'; ctx.lineWidth=1;
    d.rain.forEach(r=>{
      const y=(r.y+f*r.sp)%400;
      ctx.beginPath(); ctx.moveTo(r.x,y); ctx.lineTo(r.x-3,y+r.l); ctx.stroke();
    });
    // wet ground w/ reflections
    ctx.fillStyle='#0a0f18'; ctx.fillRect(0,CFG.GROUND_Y,960,540-CFG.GROUND_Y);
    d.signs.forEach(s=>{
      ctx.globalAlpha=0.18; ctx.fillStyle=s.c;
      ctx.fillRect(s.x, CFG.GROUND_Y, 36, 30); ctx.globalAlpha=1;
    });
    ctx.strokeStyle='#4fd6ff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,CFG.GROUND_Y); ctx.lineTo(960,CFG.GROUND_Y); ctx.stroke();
  }
},
// 5. ALLEYWAY --------------------------------------------------------------
{ name:'BACK ALLEY', accent:'#ffb84f',
  build(){ return { steam: Array.from({length:5},()=>({x:randInt(100,860), ph:RNG()*10})) }; },
  draw(ctx,d,f){
    fillSky(ctx,'#181414','#3a2c24',CFG.GROUND_Y);
    // brick walls
    ctx.fillStyle='#3a2620'; ctx.fillRect(0,60,960,CFG.GROUND_Y-60);
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1;
    for(let row=0;row<14;row++){
      const y=60+row*26, off=(row%2)*20;
      for(let c=-1;c<25;c++){ ctx.strokeRect(c*40+off,y,40,26); }
    }
    // fire escape
    ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=4;
    for(let i=0;i<3;i++){ const y=100+i*70; ctx.strokeRect(700,y,140,10); ctx.beginPath(); ctx.moveTo(700,y+10); ctx.lineTo(700,y+70); ctx.moveTo(840,y+10); ctx.lineTo(840,y+70); ctx.stroke(); }
    // hanging bulb glow
    ctx.strokeStyle='#222'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(480,60); ctx.lineTo(480,140); ctx.stroke();
    ctx.fillStyle='rgba(255,210,140,0.9)'; ctx.beginPath(); ctx.arc(480,146,7,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=0.2; ctx.beginPath(); ctx.arc(480,146,60,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    // graffiti tag
    ctx.fillStyle='rgba(255,60,140,0.55)'; ctx.font=`italic bold 26px ${GLOBAL_TITLE_FONT}`; ctx.fillText('KO!', 60, 200);
    ctx.fillStyle='rgba(80,220,255,0.4)'; ctx.font=`italic bold 20px ${GLOBAL_TITLE_FONT}`; ctx.fillText('crew', 810, 260);
    // dumpster
    ctx.fillStyle='#2f4a35'; ctx.fillRect(60,CFG.GROUND_Y-46,90,46);
    ctx.fillStyle='#233a29'; ctx.fillRect(60,CFG.GROUND_Y-52,90,10);
    groundBand(ctx,'#232019','#4a4234',CFG.GROUND_Y);
    // puddle w/ light reflection
    ctx.globalAlpha=0.5; ctx.fillStyle='#5a5248';
    ctx.beginPath(); ctx.ellipse(480,CFG.GROUND_Y+22,70,10,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,210,140,0.3)'; ctx.beginPath(); ctx.ellipse(480,CFG.GROUND_Y+22,20,4,0,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    // steam vents
    d.steam.forEach(s=>{
      for(let i=0;i<3;i++){
        const y = CFG.GROUND_Y-((f*1.2+i*30+s.ph*20)%140);
        ctx.globalAlpha = 0.12*(1-((f*1.2+i*30)%140)/140);
        ctx.fillStyle='#ccc';
        ctx.beginPath(); ctx.arc(s.x+Math.sin(f*0.05+i)*6,y,10,0,Math.PI*2); ctx.fill();
      }
    });
    ctx.globalAlpha=1;
  }
},
// 6. BATTLEFIELD --------------------------------------------------------------
{ name:'WAR-TORN FRONT', accent:'#c9a24a',
  build(){ return { smoke: Array.from({length:4},()=>({x:randInt(80,880), ph:RNG()*10})) }; },
  draw(ctx,d,f){
    fillSky(ctx,'#4a3a2a','#8a7050',CFG.GROUND_Y);
    // distant explosion flashes
    if(Math.sin(f*0.03)>0.94){ ctx.fillStyle='rgba(255,180,80,0.5)'; ctx.beginPath(); ctx.arc(200+((f*7)%600),160,40,0,Math.PI*2); ctx.fill(); }
    // ruined structures
    ctx.fillStyle='rgba(40,35,30,0.6)';
    ctx.fillRect(80,180,60,240); ctx.fillRect(150,140,30,280);
    ctx.fillRect(760,160,70,260); ctx.beginPath(); ctx.moveTo(760,160); ctx.lineTo(795,110); ctx.lineTo(830,160); ctx.closePath(); ctx.fill();
    // smoke plumes
    d.smoke.forEach(s=>{
      for(let i=0;i<6;i++){
        const y=CFG.GROUND_Y-40-((f*0.8+i*24+s.ph*30)%260);
        ctx.globalAlpha=0.1;
        ctx.fillStyle='#555';
        ctx.beginPath(); ctx.arc(s.x+Math.sin(f*0.02+i)*10,y,16+i*2,0,Math.PI*2); ctx.fill();
      }
    });
    ctx.globalAlpha=1;
    // barbed wire
    ctx.strokeStyle='rgba(20,20,20,0.7)'; ctx.lineWidth=1.5;
    ctx.beginPath();
    for(let x=40;x<920;x+=10){ ctx.lineTo(x, CFG.GROUND_Y-30+Math.sin(x*0.6)*5); }
    ctx.stroke();
    groundBand(ctx,'#4a4030','#3a3222',CFG.GROUND_Y);
    // craters
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=2;
    for(let i=0;i<5;i++){ ctx.beginPath(); ctx.ellipse(70+i*190,CFG.GROUND_Y+20,26,8,0,0,Math.PI*2); ctx.stroke(); }
    // sandbags
    for(let i=0;i<6;i++){ ctx.fillStyle='#7a6b45'; ctx.beginPath(); ctx.ellipse(430+i*20,CFG.GROUND_Y-6,14,9,0,0,Math.PI*2); ctx.fill(); }
  }
},
// 7. POOL HALL --------------------------------------------------------------
{ name:'HUSTLER\'S POOL HALL', accent:'#3fbf6a',
  build(){ return {}; },
  draw(ctx,d,f){
    fillSky(ctx,'#241a10','#3a2a1a',CFG.GROUND_Y);
    // wood paneling
    ctx.fillStyle='#3a2515';
    for(let i=0;i<16;i++){ ctx.fillStyle=i%2===0?'#3a2515':'#432c19'; ctx.fillRect(i*60,60,60,CFG.GROUND_Y-60); }
    // pool tables silhouette (back-left / back-right)
    [130,700].forEach(tx=>{
      ctx.fillStyle='#0f4a2a'; ctx.fillRect(tx,260,160,60);
      ctx.strokeStyle='#7a5230'; ctx.lineWidth=10; ctx.strokeRect(tx-6,254,172,72);
      ctx.fillStyle='#111'; [[tx,260],[tx+160,260],[tx,320],[tx+160,320],[tx+80,258],[tx+80,322]].forEach(([px,py])=>{
        ctx.beginPath(); ctx.arc(px,py,5,0,Math.PI*2); ctx.fill();
      });
    });
    // hanging lamps
    [330,630].forEach(lx=>{
      ctx.strokeStyle='#222'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(lx,60); ctx.lineTo(lx,120); ctx.stroke();
      ctx.fillStyle='#2a2015'; ctx.beginPath(); ctx.moveTo(lx-30,120); ctx.lineTo(lx+30,120); ctx.lineTo(lx+18,150); ctx.lineTo(lx-18,150); ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(255,220,150,0.9)'; ctx.beginPath(); ctx.ellipse(lx,150,20,6,0,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=0.15; ctx.beginPath(); ctx.ellipse(lx,190,70,40,0,0,Math.PI*2); ctx.fillStyle='#ffd8a0'; ctx.fill(); ctx.globalAlpha=1;
    });
    // checkered floor
    ctx.fillStyle='#2a1f14'; ctx.fillRect(0,CFG.GROUND_Y,960,540-CFG.GROUND_Y);
    for(let r=0;r<3;r++) for(let c=0;c<24;c++){
      if((r+c)%2===0){ ctx.fillStyle='#3a2c1c'; ctx.fillRect(c*40,CFG.GROUND_Y+r*22,40,22); }
    }
    ctx.strokeStyle='#3fbf6a'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,CFG.GROUND_Y); ctx.lineTo(960,CFG.GROUND_Y); ctx.stroke();
  }
},
// 8. WHARF ON A LAKE --------------------------------------------------------------
{ name:'MOONLIT WHARF', accent:'#7fc7ff',
  build(){ return { ripples: Array.from({length:14},()=>({x:randInt(0,960), y:randInt(0,120), s:0.5+RNG()})) }; },
  draw(ctx,d,f){
    fillSky(ctx,'#101d2e','#3a5a70',CFG.GROUND_Y);
    ctx.fillStyle='rgba(230,240,255,0.9)'; ctx.beginPath(); ctx.arc(200,90,28,0,Math.PI*2); ctx.fill();
    // fog bank
    ctx.globalAlpha=0.18; ctx.fillStyle='#cfe0ee';
    ctx.beginPath(); ctx.ellipse(500,300,500,60,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    // distant mountains
    ctx.fillStyle='rgba(20,35,45,0.55)';
    ctx.beginPath(); ctx.moveTo(0,260); ctx.lineTo(150,160); ctx.lineTo(320,260); ctx.lineTo(520,180); ctx.lineTo(720,260); ctx.lineTo(960,190); ctx.lineTo(960,300); ctx.lineTo(0,300); ctx.closePath(); ctx.fill();
    // lake with moon shimmer
    const lakeG = ctx.createLinearGradient(0,300,0,CFG.GROUND_Y);
    lakeG.addColorStop(0,'#1a3345'); lakeG.addColorStop(1,'#0f2230');
    ctx.fillStyle=lakeG; ctx.fillRect(0,300,960,CFG.GROUND_Y-300);
    d.ripples.forEach(r=>{
      ctx.strokeStyle=`rgba(200,225,255,${0.15+0.1*Math.sin(f*0.05+r.x)})`;
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.ellipse(r.x,300+r.y*0.6,20*r.s+Math.sin(f*0.03+r.x)*3,3,0,0,Math.PI*2); ctx.stroke();
    });
    // wooden dock (ground)
    ctx.fillStyle='#4a3624'; ctx.fillRect(0,CFG.GROUND_Y,960,540-CFG.GROUND_Y);
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=2;
    for(let i=0;i<20;i++){ ctx.beginPath(); ctx.moveTo(i*50,CFG.GROUND_Y); ctx.lineTo(i*50,540); ctx.stroke(); }
    // dock posts
    ctx.fillStyle='#2c2013';
    for(let i=0;i<5;i++){ ctx.fillRect(60+i*200,CFG.GROUND_Y-10,12,40); }
    ctx.strokeStyle='#7fc7ff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,CFG.GROUND_Y); ctx.lineTo(960,CFG.GROUND_Y); ctx.stroke();
  }
},
// 9. SPACE PLANET --------------------------------------------------------------
{ name:'CRIMSON EXOPLANET', accent:'#ff7a5c',
  build(){ return { stars: Array.from({length:70},()=>({x:randInt(0,960), y:randInt(0,320), r:RNG()<0.8?1:2, p:RNG()*10})) }; },
  draw(ctx,d,f){
    fillSky(ctx,'#05040c','#2a1030',CFG.GROUND_Y);
    starField(ctx,d.stars,f,'#fff');
    // ringed planet
    ctx.save();
    ctx.translate(770,120); ctx.rotate(-0.35);
    ctx.fillStyle='#e0975a'; ctx.beginPath(); ctx.arc(0,0,46,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(230,210,180,0.7)'; ctx.lineWidth=8;
    ctx.beginPath(); ctx.ellipse(0,0,80,18,0,0,Math.PI*2); ctx.stroke();
    ctx.restore();
    // second moon
    ctx.fillStyle='#c9c9d8'; ctx.beginPath(); ctx.arc(120,80,16,0,Math.PI*2); ctx.fill();
    // alien mesa silhouettes
    ctx.fillStyle='rgba(60,20,30,0.65)';
    ctx.beginPath(); ctx.moveTo(0,320); ctx.lineTo(60,220); ctx.lineTo(120,250); ctx.lineTo(180,180); ctx.lineTo(260,320); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(650,320); ctx.lineTo(720,210); ctx.lineTo(800,260); ctx.lineTo(880,190); ctx.lineTo(960,320); ctx.closePath(); ctx.fill();
    // alien crystal spires
    ctx.fillStyle='rgba(180,80,255,0.5)';
    [200,760].forEach(cx=>{
      ctx.beginPath(); ctx.moveTo(cx,CFG.GROUND_Y); ctx.lineTo(cx+10,CFG.GROUND_Y-70); ctx.lineTo(cx+20,CFG.GROUND_Y); ctx.closePath(); ctx.fill();
    });
    groundBand(ctx,'#3a1a1c','#6a2e28',CFG.GROUND_Y);
    // crater dust ground texture
    ctx.fillStyle='rgba(0,0,0,0.2)';
    for(let i=0;i<10;i++){ ctx.beginPath(); ctx.ellipse(40+i*95,CFG.GROUND_Y+16,16,5,0,0,Math.PI*2); ctx.fill(); }
  }
},
// 10. ICE CAVERN --------------------------------------------------------------
{ name:'FROZEN HOLLOW', accent:'#8fe0ff',
  build(){ return { shards: Array.from({length:16},()=>({x:randInt(20,940), s:0.5+RNG()*1.1})) }; },
  draw(ctx,d,f){
    fillSky(ctx,'#0d2a3a','#3f7d94',CFG.GROUND_Y);
    // aurora streaks
    for(let i=0;i<3;i++){
      ctx.strokeStyle=`rgba(${120+i*40},255,${200-i*30},0.18)`;
      ctx.lineWidth=18;
      ctx.beginPath();
      ctx.moveTo(0,60+i*30);
      ctx.quadraticCurveTo(480,10+i*40+Math.sin(f*0.02+i)*20,960,80+i*30);
      ctx.stroke();
    }
    // glacier wall
    ctx.fillStyle='rgba(150,220,240,0.25)';
    ctx.beginPath(); ctx.moveTo(0,CFG.GROUND_Y); ctx.lineTo(0,180); ctx.lineTo(180,120); ctx.lineTo(340,190); ctx.lineTo(340,CFG.GROUND_Y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(960,CFG.GROUND_Y); ctx.lineTo(960,160); ctx.lineTo(760,110); ctx.lineTo(620,200); ctx.lineTo(620,CFG.GROUND_Y); ctx.closePath(); ctx.fill();
    // icicles
    ctx.fillStyle='rgba(200,235,250,0.55)';
    for(let i=0;i<12;i++){
      const x=i*80+20, len=20+((i*37)%40);
      ctx.beginPath(); ctx.moveTo(x-8,60); ctx.lineTo(x+8,60); ctx.lineTo(x,60+len); ctx.closePath(); ctx.fill();
    }
    groundBand(ctx,'#193a48','#8fe0ff',CFG.GROUND_Y);
    // ice cracks
    ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1.5;
    d.shards.forEach(s=>{
      ctx.beginPath(); ctx.moveTo(s.x,CFG.GROUND_Y+4);
      ctx.lineTo(s.x+10*s.s,CFG.GROUND_Y+14*s.s); ctx.lineTo(s.x-6*s.s,CFG.GROUND_Y+20*s.s);
      ctx.stroke();
    });
  }
},
];

class Game{
  constructor(){
    this.particles=[]; this.texts=[]; this.projectiles=[]; this.beams=[];
    this.shake=0; this.hitPause=0;
    this.fightNumber=0; this.bossesDefeated=0; this.opponentsDefeated=0;
    this.damageDealt=0; this.longestCombo=0; this.bestHit=0;
    this.score=0;
    this.running=false;
    this.phase='menu'; // menu, intro, fight, victory, gameover
    this.introTimer=0; this.koTimer=0;
    this.frame=0;
    this.stage = STAGE_DEFS[0]; this.stageData = this.stage.build();
  }

  newRun(){
    window.PlatformManager?.startSession(GAME_ID);
    const charDef = CHARACTER_DEFS[META.character] || CHARACTER_DEFS.default;
    const eq = META.cosmetics.equipped;
    const skinCosmetic = cosmeticById(eq.skin);
    this.stage = choice(STAGE_DEFS);
    this.stageData = this.stage.build();
    this.player = new Fighter({name:'PLAYER', isPlayer:true, x:260, facing:1,
      maxHp: CFG.PLAYER_MAX_HP, speed: CFG.MOVE_SPEED, color:charDef.color,
      skinColor: (skinCosmetic && skinCosmetic.value) || '#f0c090', accentColor:charDef.accentColor,
      specialKind:'eyelaser', gender: eq.gender});

    // ---- cosmetics ----
    const p = this.player;
    p.hairStyle = eq.hair;
    p.facialHair = eq.facialhair;
    p.hat = eq.hat;
    p.outfit = eq.outfit;
    p.shoesStyle = eq.shoes;

    // ---- new moves (Light/Heavy/Special loadout) ----
    const lm = META.moves.equipped.light;
    p.lightDmgMult = 1; p.lightTimeMult = 1; p.lightVisual = 'default';
    if(lm==='light_blade'){ p.lightDmgMult=1.6; p.lightTimeMult=1.4; p.lightVisual='blade'; }
    else if(lm==='light_rapid'){ p.lightDmgMult=0.6; p.lightTimeMult=0.6; p.lightVisual='rapid'; }
    else if(lm==='light_twinfists'){ p.lightVisual='twin'; }

    const hm = META.moves.equipped.heavy;
    p.heavyDmgMult = 1; p.heavyTimeMult = 1; p.heavyVisual = 'default';
    if(hm==='heavy_fireball'){ p.heavyDmgMult=1.5; p.heavyTimeMult=1.3; p.heavyVisual='fireball'; p.heavyIsRanged=true; }
    else if(hm==='heavy_quick'){ p.heavyDmgMult=0.65; p.heavyTimeMult=0.6; p.heavyVisual='quick'; }
    else if(hm==='heavy_roundhouse'){ p.heavyVisual='roundhouse'; }

    const smKindMap = {special_default:'eyelaser', special_sonic:'sonic', special_lightning:'lightning', special_hurricane:'hurricanekick'};
    p.specialKind = smKindMap[META.moves.equipped.special] || 'eyelaser';

    // ---- permanent shop (Training/Survival) bonuses ----
    p.metaLightDmg = metaLevel('stronger_strikes');
    p.metaHeavyDmg = metaLevel('heavy_training');
    p.maxHp += metaLevel('conditioning_meta') + metaLevel('toughened_up');
    p.hp = p.maxHp;
    p.speedBonus += metaLevel('footwork')*0.01;
    p.dodgeCooldownMeta = metaLevel('recovery_training')*0.01;
    p.hasSecondChance = metaLevel('second_chance')>0;
    p.usedSecondChance = false;
    p.comboExtend += metaLevel('finisher_upgrade')>0 ? 1 : 0;

    // ---- unlocked techniques ----
    p.hasCounter = metaLevel('counter')>0;
    p.hasSlideKick = metaLevel('slide_kick')>0;
    p.hasUppercut = metaLevel('uppercut')>0;
    p.hasGroundPound = metaLevel('ground_pound')>0;
    p.hasRunningAttack = metaLevel('running_attack')>0;
    p.hasGrab = metaLevel('grab')>0;
    p.hasThrow = metaLevel('throw')>0;
    p.hasAirCombo = metaLevel('air_combo')>0;
    p.hasChargedHeavy = metaLevel('charged_heavy')>0;

    // ---- character passive ----
    if(charDef.apply) charDef.apply(p);
    p.hp = p.maxHp;

    this.fightNumber=0; this.bossesDefeated=0; this.opponentsDefeated=0;
    this.damageDealt=0; this.longestCombo=0; this.bestHit=0; this.score=0;
    this.pickedTrees = new Set();
    this.rerollsLeft = (metaLevel('reroll1')>0?1:0)+(metaLevel('reroll2')>0?2:0)+(metaLevel('reroll3')>0?3:0);
    this.rejectAvailable = metaLevel('reject')>0;
    this.rejectUsedThisRun = false;
    this.extraChoiceUsed = false;

    if(metaLevel('starting_upgrade')>0){
      const picks = rollUpgrades(1, false, {});
      if(picks[0]) this.silentApplyUpgrade(picks[0]);
    }

    if(metaLevel('choose_training')>0){
      this.showTreeChoice(()=>{ this.afterPreRun(); });
    } else {
      this.afterPreRun();
    }
  }

  afterPreRun(){
    if(metaLevel('head_start')>0){
      this.showUpgrades();
    } else {
      this.nextFight();
    }
  }

  nextFight(){
    this.fightNumber++;
    this.enemy = generateEnemy(this.fightNumber);
    this.player.x = 260; this.player.facing=1; this.player.vx=0; this.player.vy=0;
    this.player.state='idle'; this.player.attack=null; this.player.momentumStacks=0;
    this.player.grabbedTarget=null; this.player.grabHoldTimer=0; this.player.isGrabbed=false; this.player.grabbedBy=null;
    // heal player between fights (reduced by 1 HP per wave already survived — tiredness)
    if(this.fightNumber>1){
      const healPct = CFG.HEAL_PERCENT + (this.player.healBonus||0);
      const baseHeal = this.player.maxHp*healPct;
      const tiredness = Math.max(0, this.fightNumber-2);
      const heal = Math.max(0, baseHeal - tiredness);
      this.player.hp = clamp(this.player.hp + heal, 0, this.player.maxHp);
    }
    this.enemy.x=700; this.enemy.facing=-1;
    this.particles=[]; this.projectiles=[]; this.texts=[]; this.beams=[];
    this.startIntro();
  }

  startIntro(){
    this.phase='intro';
    this.introTimer=0;
    this.introStage='names'; // names -> 3 -> 2 -> 1 -> fight -> go
    document.getElementById('countdownUI').classList.remove('hidden');
    const isBoss = this.enemy.isBoss;
    document.getElementById('introNames').textContent = isBoss ? `BOSS FIGHT` : `FIGHT ${this.fightNumber}`;
    const stageTag = this.fightNumber===1 ? `  —  ${this.stage.name}` : '';
    document.getElementById('introVs').textContent = `PLAYER  vs  ${this.enemy.name}  (${this.enemy.archLabel||''})${stageTag}`;
    document.getElementById('countNum').textContent='';
  }

  updateIntro(){
    this.introTimer++;
    const seq = [ [0,'names',''], [55,'3','3'], [90,'2','2'], [125,'1','1'], [160,'fight','FIGHT!'] ];
    if(this.introTimer===55) document.getElementById('countNum').textContent='3';
    if(this.introTimer===90) document.getElementById('countNum').textContent='2';
    if(this.introTimer===125) document.getElementById('countNum').textContent='1';
    if(this.introTimer===160) document.getElementById('countNum').textContent='FIGHT!';
    if(this.introTimer>=195){
      document.getElementById('countdownUI').classList.add('hidden');
      this.phase='fight';
    }
  }

  spawnDust(x,jump){
    for(let i=0;i<6;i++){
      this.particles.push(new Particle(x+randInt(-10,10), CFG.GROUND_Y-2, (RNG()-0.5)*2, -RNG()*2-0.5, 20, 'rgba(200,200,200,0.5)', 4));
    }
  }

  spawnHitParticles(x,y,color,n,power){
    for(let i=0;i<n;i++){
      const ang = RNG()*Math.PI*2;
      const spd = (1+RNG()*3)*power;
      this.particles.push(new Particle(x,y, Math.cos(ang)*spd, Math.sin(ang)*spd, 18+RNG()*10, color, 3+RNG()*3));
    }
  }

  spawnSpecialProjectile(owner, overrides){
    const p = owner;
    const ov = overrides || {};
    const size = 1*(p.specialSizeMult||1);
    const dmgMult = 1+(p.specialDmgBonus||0);
    const baseDmg = ov.dmg!==undefined ? ov.dmg*dmgMult : CFG.SPECIAL.dmg*dmgMult;
    const color = ov.color || (p.isPlayer?'#ffb347':'#ff4f6a');
    const mk = (offY)=>{
      const proj = new Projectile(p, p.x+p.facing*40, p.y-p.h*0.55+offY, p.facing, p.attackDamage(baseDmg), 9, color, p.specialPierce);
      proj.w*=size; proj.h*=size;
      proj.knockback = ov.knockback!==undefined ? ov.knockback : CFG.SPECIAL.knockback;
      this.projectiles.push(proj);
    };
    mk(0);
    if(p.specialTwin) mk(-24);
    this.shake = Math.max(this.shake, 6);
    this.spawnHitParticles(p.x+p.facing*40, p.y-p.h*0.55, color, 14, 1.4);
  }

  spawnHeavyFireball(owner){
    const proj = new Projectile(owner, owner.x+owner.facing*40, owner.y-owner.h*0.55, owner.facing,
      owner.attackDamage(CFG.HEAVY.dmg)*(owner.heavyDmgMult||1), 8, '#ff8a3d', false);
    proj.knockback = CFG.HEAVY.knockback;
    this.projectiles.push(proj);
    this.shake = Math.max(this.shake, 4);
    this.spawnHitParticles(owner.x+owner.facing*40, owner.y-owner.h*0.55, '#ff8a3d', 8, 0.9);
  }

  spawnBarrage(owner, a){
    const n = 5;
    for(let i=0;i<n;i++){
      const offY = (i-2)*22;
      const proj = new Projectile(owner, owner.x+owner.facing*40, owner.y-owner.h*0.55+offY, owner.facing,
        owner.attackDamage(a.dmgEach), 7+i*0.4, '#ff7b3f', false);
      proj.knockback = CFG.SPECIAL.knockback*0.8;
      this.projectiles.push(proj);
    }
    this.shake = Math.max(this.shake, 8);
    this.spawnHitParticles(owner.x+owner.facing*40, owner.y-owner.h*0.55, '#ff7b3f', 12, 1.2);
  }

  spawnLaserBeamFX(caster, target, blocked, colorOverride){
    const y = caster.y-caster.h*0.86;
    const baseColor = colorOverride || '#ff3030';
    const blockedColor = colorOverride ? Fighter.shade(colorOverride, 0.3) : '#ff8080';
    this.beams.push(new Beam(caster.x+caster.facing*caster.w*0.28, y, target.x, target.y-target.h*0.55,
      blocked?blockedColor:baseColor, 14, blocked?4:10));
    this.spawnHitParticles(target.x, target.y-target.h*0.55, blocked?blockedColor:baseColor, blocked?4:14, blocked?0.5:1.6);
  }

  onHitLanded(attacker, defender, dealt, atk){
    this.damageDealt += dealt;
    if(attacker.isPlayer){
      this.bestHit = Math.max(this.bestHit, dealt);
      attacker.hitCombo = (attacker.hitCombo||0)+1;
      this.longestCombo = Math.max(this.longestCombo, attacker.hitCombo);
      window.AchievementManager?.notify?.('ko_klarity_hit', { facts:{ koKlarityBestCombo:this.longestCombo } });
    } else {
      // defender is player, reset their combo counter
    }
    if(defender.isPlayer) defender.hitCombo = 0;

    const hx = defender.x - Math.sign(defender.x-attacker.x)*defender.w*0.3;
    const hy = defender.y - defender.h*0.6;
    const power = atk.type==='heavy'?1.6:(atk.type==='special'?2.2:0.9);
    this.spawnHitParticles(hx,hy, '#ffd166', atk.type==='heavy'?14:7, power);
    this.texts.push(new FloatingText(hx, hy-10, `${dealt}`, atk.type==='heavy'?'#ff5028':'#fff', atk.type==='heavy'?24:18));

    if(atk.type==='heavy'){ this.shake=Math.max(this.shake,9); this.hitPause=Math.max(this.hitPause,6); }
    else if(atk.type==='special'){ this.shake=Math.max(this.shake,14); this.hitPause=Math.max(this.hitPause,10); }
    else { this.shake=Math.max(this.shake,3); }
  }

  onBlockedHit(attacker, defender, atk){
    const hx = defender.x - Math.sign(defender.x-attacker.x)*defender.w*0.3;
    const hy = defender.y - defender.h*0.6;
    this.spawnHitParticles(hx,hy,'#8fd0ff',6,0.6);
    this.texts.push(new FloatingText(hx,hy-6,'BLOCK','#8fd0ff',13));
  }

  update(){
    window.PlatformManager?.heartbeat(GAME_ID, this.phase === 'fight');
    if(this.phase==='intro'){ this.updateIntro(); return; }
    if(this.phase!=='fight') return;

    if(this.hitPause>0){ this.hitPause--; return; }

    const p=this.player, e=this.enemy;
    updatePlayerControl(p, e, this);
    updateAI(e, p, this);

    p.update(e,this);
    e.update(p,this);

    // reset player combo counter if idle too long
    if(p.state==='idle' && p.hitCombo>0 && p.animT - (p.lastHitAnim||0) > 40) p.hitCombo=0;

    // momentum decay when not attacking
    if(p.state!=='attack' && p.momentumStacks>0 && p.animT%40===0) p.momentumStacks=Math.max(0,p.momentumStacks-1);

    // separate overlap (can't walk through each other)
    const minDist = (p.w+e.w)/2 + 4;
    const d = e.x - p.x;
    if(Math.abs(d) < minDist && p.state!=='hitstun' && e.state!=='hitstun' && p.state!=='grabbed' && e.state!=='grabbed'){
      const push = (minDist-Math.abs(d))/2 * Math.sign(d||1);
      p.x -= push; e.x += push;
      p.x = clamp(p.x, CFG.ARENA_L+p.w/2, CFG.ARENA_R-p.w/2);
      e.x = clamp(e.x, CFG.ARENA_L+e.w/2, CFG.ARENA_R-e.w/2);
    }

    // projectiles
    for(const proj of this.projectiles){
      proj.update();
      const target = proj.owner===p ? e : p;
      if(!proj.dead && !proj.hitSet.has(target)){
        if(rectOverlap(proj.box, target.hurtbox())){
          const blocked = target.blocking;
          const dealt = target.takeHit(proj.dmg, proj.knockback!==undefined?proj.knockback:CFG.SPECIAL.knockback, Math.sign(proj.dir), blocked, proj.owner);
          proj.hitSet.add(target);
          if(!blocked){
            this.onHitLanded(proj.owner, target, dealt, {type:'special'});
          } else {
            this.onBlockedHit(proj.owner, target, {type:'special'});
          }
          if(!proj.pierce) proj.dead=true;
        }
      }
    }
    this.projectiles = this.projectiles.filter(pr=>!pr.dead);

    // particles/texts/beams
    this.particles.forEach(pt=>pt.update());
    this.particles = this.particles.filter(pt=>!pt.dead);
    this.texts.forEach(t=>t.update());
    this.texts = this.texts.filter(t=>!t.dead);
    this.beams.forEach(b=>b.update());
    this.beams = this.beams.filter(b=>!b.dead);

    if(this.shake>0) this.shake*=0.85; if(this.shake<0.1) this.shake=0;

    // KO check
    if(p.hp<=0 || e.hp<=0){
      this.handleKO(p.hp<=0);
    }
  }

  handleKO(playerLost){
    this.phase='ko';
    this.koTimer=0;
    document.getElementById('koUI').classList.remove('hidden');
    this.koPlayerLost = playerLost;
  }

  updateKO(){
    this.koTimer++;
    if(this.koTimer>=70){
      document.getElementById('koUI').classList.add('hidden');
      if(this.koPlayerLost){ this.endRun(); }
      else { this.onEnemyDefeated(); }
    }
  }

  onEnemyDefeated(){
    this.opponentsDefeated++;
    window.AchievementManager?.notify?.('enemy_defeated', { amount: 1, facts: { koKlarityBestRun: this.opponentsDefeated } });
    let coins = 5 + metaLevel('bigger_payout');
    if(this.enemy.isBoss){
      this.bossesDefeated++;
      window.AchievementManager?.notify?.('boss_defeated', { amount: 1 });
      coins += 20 + metaLevel('boss_bonus');
      const freshHeal = metaLevel('fresh_start');
      if(freshHeal>0) this.player.hp = clamp(this.player.hp + freshHeal, 0, this.player.maxHp);
    }
    this.score += this.enemy.isBoss ? 500 : 150;
    window.ChallengeManager?.update?.({ score:this.score, wave:this.fightNumber, alive:true });
    window.PlatformManager?.addCoins(coins);
    META.coins = sharedCoins();
    saveMeta();
    this.startQuiz();
  }

  startQuiz(){
    this.phase='quiz';
    this.quizQuestions = QuestionManager.getRandomSet(4).map(q=>({source:q,q:q.q,options:q.a,correct:q.c}));
    this.quizIndex = 0;
    this.quizCorrectCount = 0;
    document.getElementById('quizUI').classList.remove('hidden');
    const track = document.getElementById('quizScoreTrack');
    track.innerHTML = this.quizQuestions.map((_,i)=>`<span class="quiz-score-pip" id="quizPip${i}"></span>`).join('');
    this.renderQuizQuestion();
  }

  renderQuizQuestion(){
    const q=this.quizQuestions[this.quizIndex];
    document.getElementById('quizProgress').textContent=`${this.quizIndex+1}/${this.quizQuestions.length}`;
    document.getElementById('quizQuestionText').textContent=q.q;
    document.getElementById('quizFeedback').textContent='';
    const wrap=document.getElementById('quizOptions');
    wrap.innerHTML='';
    q.options.map((_,i)=>i).sort(()=>Math.random()-.5).forEach(optionIndex=>{
      const button=document.createElement('button');
      button.className='quiz-option-btn';
      button.textContent=q.options[optionIndex];
      button.onclick=()=>this.answerQuiz(optionIndex===q.correct,button,wrap);
      wrap.appendChild(button);
    });
  }

  answerQuiz(correct,button,wrap){
    [...wrap.children].forEach(item=>item.disabled=true);
    button.classList.add(correct?'correct':'incorrect');
    const question=this.quizQuestions[this.quizIndex];
    QuestionManager.recordAnswer(question.source,correct);
    window.PlatformManager?.recordQuestionAnswered(GAME_ID,correct);
    const feedback=document.getElementById('quizFeedback');
    const pip=document.getElementById(`quizPip${this.quizIndex}`);
    if(correct){
      this.quizCorrectCount++;
      window.AchievementManager?.notify?.('ko_klarity_correct',{amount:1});
      feedback.textContent='CORRECT!'; feedback.style.color='var(--green)';
      pip?.classList.add('correct');
    }else{
      feedback.textContent='INCORRECT'; feedback.style.color='var(--red)';
      pip?.classList.add('incorrect');
    }
    setTimeout(()=>{
      this.quizIndex++;
      if(this.quizIndex<this.quizQuestions.length)this.renderQuizQuestion();
      else this.finishQuiz();
    },900);
  }

  finishQuiz(){
    document.getElementById('quizUI').classList.add('hidden');
    if(this.quizCorrectCount<=0){
      this.nextFight();
      return;
    }
    this.showUpgrades(this.quizCorrectCount);
  }

  showUpgrades(choiceCount){
    this.phase='victory';
    document.getElementById('victoryUI').classList.remove('hidden');
    document.getElementById('victoryTitle').textContent = 'VICTORY';
    const isQuizReward = Number.isInteger(choiceCount);
    const isFirst = !this.extraChoiceUsed;
    const count = isQuizReward ? clamp(choiceCount,1,4) : ((isFirst && metaLevel('extra_choice')>0) ? 4 : 3);
    this.currentUpgradeChoiceCount = count;
    this.extraChoiceUsed = true;
    const bossBonus = this.enemy ? this.enemy.isBoss : false;
    const opts = rollUpgrades(count, bossBonus, {
      luckyBreak: metaLevel('lucky_break')>0,
      legendaryChance: metaLevel('legendary_chance')>0,
      specialistTrees: metaLevel('specialist')>0 ? this.pickedTrees : null,
    });
    this.renderUpgradeCards(opts, u=>this.applyUpgrade(u), true);
    this.renderVictoryControls();
  }

  renderUpgradeCards(opts, onPick, allowReject){
    const box = document.getElementById('upgradeUI');
    box.innerHTML='';
    opts.forEach((u,idx)=>{
      const div = document.createElement('div');
      div.className = `upCard rarity-${u.rarity}`;
      div.innerHTML = `<h3>${u.name}</h3><p>${u.desc}</p><p style="margin-top:8px;color:#777;text-transform:uppercase;font-size:9px;">${u.rarity}</p>`;
      div.onclick = ()=>{ onPick(u); };
      if(allowReject && this.rejectAvailable && !this.rejectUsedThisRun){
        const rejectBtn = document.createElement('button');
        rejectBtn.textContent = 'REJECT';
        rejectBtn.style.cssText = 'display:block;margin-top:8px;font-size:9px;padding:3px 8px;background:#1a1a26;border:1px solid #ff5028;color:#ff5028;cursor:pointer;font-family:inherit;';
        rejectBtn.onclick = (e)=>{
          e.stopPropagation();
          this.rejectUsedThisRun = true;
          const [replacement] = rollUpgrades(1, this.enemy?this.enemy.isBoss:false, {
            luckyBreak: metaLevel('lucky_break')>0, legendaryChance: metaLevel('legendary_chance')>0,
            specialistTrees: metaLevel('specialist')>0 ? this.pickedTrees : null,
          });
          if(replacement){
            opts[idx] = replacement;
            this.renderUpgradeCards(opts, onPick, true);
          }
        };
        div.appendChild(rejectBtn);
      }
      box.appendChild(div);
    });
  }

  renderVictoryControls(){
    const box = document.getElementById('victoryControls');
    box.innerHTML = '';
    if(this.rerollsLeft>0){
      const btn = document.createElement('button');
      btn.className = 'menuBtn';
      btn.style.cssText = 'display:inline-block;width:auto;padding:6px 14px;font-size:11px;margin:0 6px;';
      btn.textContent = `REROLL (${this.rerollsLeft} left)`;
      btn.onclick = ()=>{ this.rerollsLeft--; this.showUpgrades(this.currentUpgradeChoiceCount); };
      box.appendChild(btn);
    }
    if(this.rejectAvailable && !this.rejectUsedThisRun){
      const note = document.createElement('span');
      note.style.cssText = 'margin-left:10px;color:#ffb32e;';
      note.textContent = 'Click "REJECT" on a card below to swap just that one.';
      box.appendChild(note);
    }
  }

  applyUpgrade(u){
    u.apply(this.player);
    this.pickedTrees.add(u.tree);
    document.getElementById('victoryUI').classList.add('hidden');
    this.nextFight();
  }

  silentApplyUpgrade(u){
    u.apply(this.player);
    this.pickedTrees.add(u.tree);
  }

  // Pre-run "Choose Your Training" screen — reuses the victory/upgrade UI.
  showTreeChoice(callback){
    this.phase='victory';
    document.getElementById('victoryUI').classList.remove('hidden');
    document.getElementById('victoryTitle').textContent = 'CHOOSE YOUR TRAINING';
    document.getElementById('victoryControls').innerHTML = '';
    const box = document.getElementById('upgradeUI');
    box.innerHTML='';
    UPGRADE_TREES.forEach(tree=>{
      const div = document.createElement('div');
      div.className = 'upCard rarity-uncommon';
      div.innerHTML = `<h3>${tree.charAt(0).toUpperCase()+tree.slice(1)}</h3><p>Start with a random upgrade from this tree.</p>`;
      div.onclick = ()=>{
        const pool = UPGRADE_POOL.filter(u=>u.tree===tree);
        const pick = choice(pool);
        if(pick) this.silentApplyUpgrade(pick);
        document.getElementById('victoryUI').classList.add('hidden');
        callback();
      };
      box.appendChild(div);
    });
  }

  endRun(){
    this.phase='gameover';
    // high scores
    const hs = JSON.parse(localStorage.getItem('ko_klarity_hs')||localStorage.getItem('ironcircuit_hs')||'{}');
    hs.bestOpponent = Math.max(hs.bestOpponent||0, this.opponentsDefeated);
    hs.bestScore = Math.max(hs.bestScore||0, this.score);
    hs.mostBosses = Math.max(hs.mostBosses||0, this.bossesDefeated);
    hs.longestCombo = Math.max(hs.longestCombo||0, this.longestCombo);
    localStorage.setItem('ko_klarity_hs', JSON.stringify(hs));
    window.PlatformManager?.setHighScore(GAME_ID, this.score);
    window.PlatformManager?.endSession(GAME_ID);
    window.ChallengeManager?.finish?.({ score:this.score, wave:this.fightNumber, alive:false });

    document.getElementById('finalStats').innerHTML = `
      Opponents Defeated: ${this.opponentsDefeated}<br>
      Bosses Defeated: ${this.bossesDefeated}<br>
      Damage Dealt: ${Math.round(this.damageDealt).toLocaleString()}<br>
      Longest Combo: ${this.longestCombo}<br>
      Best Hit: ${this.bestHit}<br>
      <br><b style="color:#ffd166;">SCORE: ${this.score}</b>
      <br><span style="color:#ffd166;">COINS: ${META.coins}</span>
    `;
    document.getElementById('gameOverUI').classList.remove('hidden');
  }

  // ============ DRAW ============
  draw(){
    ctx.save();
    if(this.shake>0.3){
      ctx.translate((RNG()-0.5)*this.shake, (RNG()-0.5)*this.shake);
    }
    this.stage.draw(ctx, this.stageData, this.frame);
    // arena boundary markers (tinted per-stage)
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(CFG.ARENA_L,0); ctx.lineTo(CFG.ARENA_L,CFG.GROUND_Y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CFG.ARENA_R,0); ctx.lineTo(CFG.ARENA_R,CFG.GROUND_Y); ctx.stroke();
    if(this.player && this.enemy){
      const order = this.player.y<=this.enemy.y ? [this.player,this.enemy] : [this.enemy,this.player];
      // draw in x order roughly (fixed camera, simple)
      this.player.draw(ctx);
      this.enemy.draw(ctx);
      this.beams.forEach(b=>b.draw(ctx));
      this.projectiles.forEach(p=>p.draw(ctx));
      this.particles.forEach(p=>p.draw(ctx));
      this.texts.forEach(t=>t.draw(ctx));
      this.drawHUD();
    }
    ctx.restore();
  }

  drawHUD(){
    const p=this.player, e=this.enemy;
    // player bar (left, decreases toward left origin i.e. shrinks from right edge of bar toward left... traditional: shrinks from right side)
    const barW=340, barH=22, pad=20;
    // Player health bar: full bar anchored left, decreases from right to left (standard) -> but spec says "decrease left to right" meaning as it depletes it shrinks starting from the right edge, revealing... Implement classic: bar anchored at fixed left edge, width shrinks.
    ctx.fillStyle='#111'; ctx.fillRect(pad-3,pad-3,barW+6,barH+6);
    ctx.fillStyle='#3a0e0e'; ctx.fillRect(pad,pad,barW,barH);
    const pRatio = p.hp/p.maxHp;
    ctx.fillStyle = pRatio>0.5?'#4fd67a':pRatio>0.25?'#ffd166':'#ff4444';
    ctx.fillRect(pad,pad,barW*pRatio,barH);
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(pad,pad,barW,barH);
    ctx.fillStyle='#fff'; ctx.font=`bold 13px ${GLOBAL_BODY_FONT}`; ctx.textAlign='left';
    ctx.fillText('PLAYER', pad, pad-8);

    // player meter
    ctx.fillStyle='#111'; ctx.fillRect(pad-3,pad+barH+3,barW+6,10);
    ctx.fillStyle='#2b2b3a'; ctx.fillRect(pad,pad+barH+6,barW,6);
    ctx.fillStyle='#4fa8ff'; ctx.fillRect(pad,pad+barH+6,barW*(p.meter/p.meterMax),6);

    // enemy bar (right, mirrored)
    const ex = 960-pad-barW;
    ctx.fillStyle='#111'; ctx.fillRect(ex-3,pad-3,barW+6,barH+6);
    ctx.fillStyle='#3a0e0e'; ctx.fillRect(ex,pad,barW,barH);
    const eRatio = e.hp/e.maxHp;
    ctx.fillStyle = eRatio>0.5?'#4fd67a':eRatio>0.25?'#ffd166':'#ff4444';
    const ew = barW*eRatio;
    ctx.fillStyle = eRatio>0.5?'#4fd67a':eRatio>0.25?'#ffd166':'#ff4444';
    ctx.fillRect(ex+(barW-ew),pad,ew,barH);
    ctx.strokeStyle='#fff'; ctx.strokeRect(ex,pad,barW,barH);
    ctx.textAlign='right';
    ctx.fillStyle= e.isBoss?'#ffb32e':'#fff';
    ctx.fillText(e.name.toUpperCase(), 960-pad, pad-8);

    ctx.fillStyle='#111'; ctx.fillRect(ex-3,pad+barH+3,barW+6,10);
    ctx.fillStyle='#2b2b3a'; ctx.fillRect(ex,pad+barH+6,barW,6);
    const emw = barW*(e.meter/e.meterMax);
    ctx.fillStyle='#ff4f6a'; ctx.fillRect(ex+(barW-emw),pad+barH+6,emw,6);

    // fight counter
    ctx.textAlign='center';
    ctx.fillStyle='#ffd166';
    ctx.font=`bold 14px ${GLOBAL_BODY_FONT}`;
    ctx.fillText(`FIGHT ${this.fightNumber}${e.isBoss?' — BOSS':''}`, 480, 34);

    // combo counter
    if(p.hitCombo>1){
      ctx.fillStyle='#ffb347';
      ctx.font=`bold 20px ${GLOBAL_TITLE_FONT}`;
      ctx.fillText(`${p.hitCombo} HIT COMBO`, 480, 70);
    }
  }
}

// ======================================================================
// MAIN LOOP
// ======================================================================
const game = new Game();

function loop(){
  game.frame++;
  if(game.phase==='ko'){ game.updateKO(); }
  else { game.update(); }
  ctx.clearRect(0,0,960,540);
  if(game.player && game.enemy) game.draw();
  requestAnimationFrame(loop);
}
loop();

// ======================================================================
// UI WIRING
// ======================================================================
function showOnly(id){
  ['mainMenu','shopMenu','countdownUI','koUI','quizUI','victoryUI','gameOverUI','charSelectUI'].forEach(x=>{
    document.getElementById(x).classList.add('hidden');
  });
  if(id) document.getElementById(id).classList.remove('hidden');
}

let toastTimer = null;
function showToast(html){
  const t = document.getElementById('toast');
  t.innerHTML = html;
  t.classList.add('show');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.classList.remove('show'); }, 4200);
}

function refreshMenuCoins(){
  META.coins = sharedCoins();
  document.getElementById('menuCoins').textContent = META.coins;
  const hs = JSON.parse(localStorage.getItem('ko_klarity_hs')||localStorage.getItem('ironcircuit_hs')||'{}');
  document.getElementById('menuHighScore').textContent = Math.max(hs.bestScore||0, window.PlatformManager?.getGameStats(GAME_ID)?.highScore||0);
  document.getElementById('menuBestRun').textContent = hs.bestOpponent||0;
}

async function loadClassQuestions(){
  const status=document.getElementById('classStatus');
  const fightButton=document.getElementById('btnFight');
  fightButton.disabled=true;
  const result=await window.QuestionManager?.loadCurrentBank('multichoice');
  classQuestionsReady=!!result?.ok;
  if(classQuestionsReady){
    status.textContent=`Class questions ready: ${QuestionManager.getBankName()}`;
    fightButton.disabled=false;
  }else{
    status.textContent=result?.error==='class-code-required'
      ? 'Please enter your class code on the Arcade Academy Hub.'
      : 'This class does not have compatible questions for this game.';
  }
}

// ---- Shop ----
let shopActiveTab = 'training';
function renderShopTabs(){
  const box = document.getElementById('shopTabs');
  box.innerHTML = '';
  SHOP_TABS.forEach(t=>{
    const btn = document.createElement('button');
    btn.className = 'shopTabBtn' + (t.id===shopActiveTab ? ' active' : '');
    btn.textContent = t.label;
    btn.onclick = ()=>{ shopActiveTab = t.id; renderShop(); };
    box.appendChild(btn);
  });
}
function renderShopItems(){
  META.coins = sharedCoins(); document.getElementById('shopCoins').textContent = `COINS: ${META.coins}`;
  const box = document.getElementById('shopItems');
  box.innerHTML = '';
  SHOP_ITEMS.filter(i=>i.tab===shopActiveTab).forEach(item=>{
    const level = metaLevel(item.id);
    const maxed = level >= item.maxLevel;
    const cost = shopItemCost(item);
    const card = document.createElement('div');
    card.className = 'shopCard' + (level>0 ? ' shopOwned' : '');
    let levelLine = '';
    if(item.maxLevel === Infinity) levelLine = `<div class="lvl">Level ${level}</div>`;
    else if(level>0) levelLine = `<div class="lvl">Owned</div>`;
    const keybindLine = item.keybind ? `<div class="keybind">Key: ${item.keybind}</div>` : '';
    card.innerHTML = `
      <h4>${item.name}</h4>
      <p>${item.desc}</p>
      ${levelLine}
      ${keybindLine}
      <div class="shopBuyRow"></div>
    `;
    const row = card.querySelector('.shopBuyRow');
    if(maxed){
      row.innerHTML = `<span class="shopMaxed">MAXED</span>`;
    } else {
      const costSpan = document.createElement('span');
      costSpan.className = 'shopCost';
      costSpan.textContent = `${cost} coins`;
      const buyBtn = document.createElement('button');
      buyBtn.className = 'shopBuyBtn';
      buyBtn.textContent = level>0 && item.maxLevel===Infinity ? 'UPGRADE' : 'BUY';
      buyBtn.disabled = META.coins < cost;
      buyBtn.onclick = ()=> buyShopItem(item);
      row.appendChild(costSpan);
      row.appendChild(buyBtn);
    }
    box.appendChild(card);
  });
}
function renderTechniquesTab(){
  document.getElementById('shopCoins').textContent = `COINS: ${META.coins}`;
  const box = document.getElementById('shopItems');
  box.innerHTML = '';

  const addHeader = (label)=>{
    const h = document.createElement('div');
    h.className = 'shopCategoryHeader';
    h.textContent = label;
    box.appendChild(h);
  };

  addHeader('Techniques');
  SHOP_ITEMS.filter(i=>i.tab==='techniques').forEach(item=>{
    const level = metaLevel(item.id);
    const maxed = level >= item.maxLevel;
    const cost = shopItemCost(item);
    const card = document.createElement('div');
    card.className = 'shopCard' + (level>0 ? ' shopOwned' : '');
    const keybindLine = item.keybind ? `<div class="keybind">Key: ${item.keybind}</div>` : '';
    card.innerHTML = `<h4>${item.name}</h4><p>${item.desc}</p>${keybindLine}<div class="shopBuyRow"></div>`;
    const row = card.querySelector('.shopBuyRow');
    if(maxed){
      row.innerHTML = `<span class="shopMaxed">OWNED</span>`;
    } else {
      const costSpan = document.createElement('span');
      costSpan.className = 'shopCost';
      costSpan.textContent = `${cost} coins`;
      const buyBtn = document.createElement('button');
      buyBtn.className = 'shopBuyBtn';
      buyBtn.textContent = 'BUY';
      buyBtn.disabled = META.coins < cost;
      buyBtn.onclick = ()=> buyShopItem(item);
      row.appendChild(costSpan);
      row.appendChild(buyBtn);
    }
    box.appendChild(card);
  });

  addHeader('New Moves');
  MOVE_SLOTS.forEach(slot=>{
    const subHeader = document.createElement('div');
    subHeader.className = 'shopCategoryHeader';
    subHeader.style.cssText = 'font-size:11px;color:#8fd0ff;border-bottom:none;margin-top:4px;';
    subHeader.textContent = slot.label;
    box.appendChild(subHeader);
    MOVE_ITEMS.filter(m=>m.slot===slot.id).forEach(item=>{
      const owned = ownsMove(item);
      const equipped = equippedMove(item.slot) === item.id;
      const cost = shopItemCost(item);
      const card = document.createElement('div');
      card.className = 'shopCard' + (owned ? ' shopOwned' : '');
      const kindColor = {default:'#9fa3ad', cosmetic:'#4fa8ff', power:'#ff5028', fast:'#4fd67a'}[item.kind];
      card.innerHTML = `<h4>${item.name}</h4>
        <div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${kindColor};">${MOVE_KIND_LABEL[item.kind]}</div>
        <p>${item.desc}</p><div class="shopBuyRow"></div>`;
      const row = card.querySelector('.shopBuyRow');
      if(!owned){
        const costSpan = document.createElement('span');
        costSpan.className = 'shopCost';
        costSpan.textContent = cost>0 ? `${cost} coins` : 'FREE';
        const buyBtn = document.createElement('button');
        buyBtn.className = 'shopBuyBtn';
        buyBtn.textContent = 'BUY';
        buyBtn.disabled = META.coins < cost;
        buyBtn.onclick = ()=> buyMove(item);
        row.appendChild(costSpan);
        row.appendChild(buyBtn);
      } else if(equipped){
        row.innerHTML = `<span class="shopMaxed">EQUIPPED</span>`;
      } else {
        const equipBtn = document.createElement('button');
        equipBtn.className = 'shopBuyBtn';
        equipBtn.textContent = 'EQUIP';
        equipBtn.onclick = ()=> equipMoveItem(item);
        row.appendChild(equipBtn);
      }
      box.appendChild(card);
    });
  });
}
function buyMove(item){
  const cost = shopItemCost(item);
  if(ownsMove(item) || !spendSharedCoins(cost)) return;
  META.coins = sharedCoins();
  META.moves.owned[item.slot] = META.moves.owned[item.slot] || [];
  META.moves.owned[item.slot].push(item.id);
  META.moves.equipped[item.slot] = item.id; // auto-equip on purchase
  saveMeta();
  renderTechniquesTab();
}
function equipMoveItem(item){
  META.moves.equipped[item.slot] = item.id;
  saveMeta();
  renderTechniquesTab();
}

function renderCosmeticsTab(){
  document.getElementById('shopCoins').textContent = `COINS: ${META.coins}`;
  const box = document.getElementById('shopItems');
  box.innerHTML = '';

  const addHeader = (label)=>{
    const h = document.createElement('div');
    h.className = 'shopCategoryHeader';
    h.textContent = label;
    box.appendChild(h);
  };

  // Gender — free, always available
  addHeader('Gender');
  ['male','female'].forEach(g=>{
    const equipped = META.cosmetics.equipped.gender === g;
    const card = document.createElement('div');
    card.className = 'shopCard' + (equipped ? ' shopOwned' : '');
    card.innerHTML = `<h4>${g.charAt(0).toUpperCase()+g.slice(1)}</h4><p>Changes your fighter's build and default hairstyle.</p><div class="shopBuyRow"></div>`;
    const row = card.querySelector('.shopBuyRow');
    if(equipped){
      row.innerHTML = `<span class="shopMaxed">SELECTED</span>`;
    } else {
      const btn = document.createElement('button');
      btn.className = 'shopBuyBtn'; btn.textContent = 'SELECT';
      btn.onclick = ()=>{ META.cosmetics.equipped.gender = g; saveMeta(); renderCosmeticsTab(); };
      row.appendChild(btn);
    }
    box.appendChild(card);
  });

  COSMETIC_CATEGORIES.forEach(cat=>{
    addHeader(cat.label);
    COSMETIC_ITEMS.filter(i=>i.category===cat.id).forEach(item=>{
      const owned = ownsCosmetic(item);
      const equipped = equippedCosmetic(item.category) === item.id;
      const cost = shopItemCost(item);
      const card = document.createElement('div');
      card.className = 'shopCard' + (owned ? ' shopOwned' : '');
      const swatch = (item.category==='skin' && item.value)
        ? `<div style="width:100%;height:14px;border-radius:3px;background:${item.value};margin-bottom:4px;"></div>` : '';
      card.innerHTML = `<h4>${item.name}</h4>${swatch}<p>${item.desc}</p><div class="shopBuyRow"></div>`;
      const row = card.querySelector('.shopBuyRow');
      if(!owned){
        const costSpan = document.createElement('span');
        costSpan.className = 'shopCost';
        costSpan.textContent = cost>0 ? `${cost} coins` : 'FREE';
        const buyBtn = document.createElement('button');
        buyBtn.className = 'shopBuyBtn';
        buyBtn.textContent = 'BUY';
        buyBtn.disabled = META.coins < cost;
        buyBtn.onclick = ()=> buyCosmetic(item);
        row.appendChild(costSpan);
        row.appendChild(buyBtn);
      } else if(equipped){
        row.innerHTML = `<span class="shopMaxed">EQUIPPED</span>`;
      } else {
        const equipBtn = document.createElement('button');
        equipBtn.className = 'shopBuyBtn';
        equipBtn.textContent = 'EQUIP';
        equipBtn.onclick = ()=> equipCosmeticItem(item);
        row.appendChild(equipBtn);
      }
      box.appendChild(card);
    });
  });
}
function buyCosmetic(item){
  const cost = shopItemCost(item);
  if(ownsCosmetic(item) || !spendSharedCoins(cost)) return;
  META.coins = sharedCoins();
  META.cosmetics.owned[item.category] = META.cosmetics.owned[item.category] || [];
  META.cosmetics.owned[item.category].push(item.id);
  META.cosmetics.equipped[item.category] = item.id; // auto-equip on purchase
  saveMeta();
  renderCosmeticsTab();
}
function equipCosmeticItem(item){
  META.cosmetics.equipped[item.category] = item.id;
  saveMeta();
  renderCosmeticsTab();
}

function renderShop(){
  renderShopTabs();
  if(shopActiveTab==='cosmetics') renderCosmeticsTab();
  else if(shopActiveTab==='techniques') renderTechniquesTab();
  else renderShopItems();
}

function buyShopItem(item){
  const cost = shopItemCost(item);
  const level = metaLevel(item.id);
  if(level >= item.maxLevel) return;
  if(!spendSharedCoins(cost)) return;
  META.coins = sharedCoins();
  META.purchases[item.id] = level+1;
  saveMeta();
  if(item.tab==='techniques'){
    const bind = item.keybind ? ` — <b>${item.keybind}</b>` : '';
    showToast(`<b>${item.name}</b> unlocked${bind}`);
  }
  renderShop();
}

document.getElementById('btnShop').onclick = ()=>{
  shopActiveTab = 'training';
  showOnly('shopMenu');
  renderShop();
};
document.getElementById('btnShopClose').onclick = ()=>{
  showOnly('mainMenu');
  refreshMenuCoins();
};

// ---- Character select ----
function renderCharSelect(){
  const box = document.getElementById('charSelectItems');
  box.innerHTML = '';
  unlockedCharacters().forEach(id=>{
    const def = CHARACTER_DEFS[id];
    const card = document.createElement('div');
    card.className = 'charCard';
    card.style.borderColor = def.color;
    card.innerHTML = `<h3 style="color:${def.color};">${def.name}</h3><p>${def.desc}</p>`;
    card.onclick = ()=>{
      META.character = id;
      saveMeta();
      showOnly(null);
      game.newRun();
    };
    box.appendChild(card);
  });
}

document.getElementById('btnFight').onclick = ()=>{
  if(!classQuestionsReady)return;
  const unlocked = unlockedCharacters();
  if(unlocked.length > 1){
    showOnly('charSelectUI');
    renderCharSelect();
  } else {
    META.character = 'default';
    showOnly(null);
    game.newRun();
  }
};
document.getElementById('btnScores').onclick = ()=>{
  const hs = JSON.parse(localStorage.getItem('ko_klarity_hs')||localStorage.getItem('ironcircuit_hs')||'{}');
  const box = document.getElementById('scoresBox');
  box.innerHTML = `
    Best Opponent Reached: ${hs.bestOpponent||0}<br>
    High Score: ${hs.bestScore||0}<br>
    Most Bosses Defeated: ${hs.mostBosses||0}<br>
    Longest Combo: ${hs.longestCombo||0}
  `;
  box.classList.toggle('hidden');
};
document.getElementById('btnMenu').onclick = ()=>{
  showOnly('mainMenu');
  refreshMenuCoins();
  game.phase='menu';
};

window.addEventListener('arcade-coins-changed', refreshMenuCoins);

// Main-menu opponents are genuine KO Klarity Fighter instances. Keeping this
// beside the Fighter renderer prevents the menu from drifting into a separate
// visual language from the game itself.
const menuEnemyCanvas = document.getElementById('homeEnemyBackdrop');
const menuEnemyCtx = menuEnemyCanvas?.getContext('2d');
const menuEnemies = menuEnemyCtx ? Array.from({length:7}, (_, i) => {
  const fighter = generateEnemy(i + 1);
  fighter.x = 90 + i * 135;
  fighter.y = CFG.GROUND_Y;
  fighter.facing = i % 2 ? -1 : 1;
  fighter.animT = i * 13;
  return {fighter, vx:(i % 2 ? -1 : 1) * (0.18 + i * 0.025), phase:i * 0.9};
}) : [];
function drawMenuEnemies(now){
  if(menuEnemyCtx && !document.getElementById('mainMenu').classList.contains('hidden')){
    menuEnemyCtx.clearRect(0, 0, menuEnemyCanvas.width, menuEnemyCanvas.height);
    menuEnemies.forEach((item, i) => {
      const f=item.fighter;
      f.x += item.vx;
      if(f.x < -80) f.x=1040;
      if(f.x > 1040) f.x=-80;
      f.animT++;
      f.state = Math.sin(now/850+item.phase) > .55 ? 'walk' : 'idle';
      f.y = CFG.GROUND_Y - 20 - (i%3)*115 + Math.sin(now/700+item.phase)*8;
      menuEnemyCtx.save();
      menuEnemyCtx.globalAlpha=.62;
      menuEnemyCtx.translate(0, f.y-CFG.GROUND_Y);
      f.y=CFG.GROUND_Y;
      f.draw(menuEnemyCtx);
      f.y=CFG.GROUND_Y - 20 - (i%3)*115 + Math.sin(now/700+item.phase)*8;
      menuEnemyCtx.restore();
    });
  }
  requestAnimationFrame(drawMenuEnemies);
}
requestAnimationFrame(drawMenuEnemies);

refreshMenuCoins();
loadClassQuestions();

})();
