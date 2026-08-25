 //Wild West Wordslinger Game.js
 // Game state
  let killCount=0, overallScore=0, sessionCoins=0, lives=3, ammo=5, maxAmmo=5;
  let gameActive=false, spawnInterval=null, reloadOpen=false, reloadStartTime=null;
  let gameMode='lawman';
  let gameOverReason='';
  let comboStreak=0;

  // ===== ONE-POINT TOWN TUNING =====
  // These values are intentionally grouped here so the perspective can be
  // fine-tuned without editing the drawing code below.
  const TOWN_VANISHING_POINT_Y = 0.055; // fraction of game-area height
  const TOWN_MOVEMENT_SPEED = 0.14;     // depth travelled per second (linear)
  const TOWN_HOUSE_COUNT = 4;           // buildings drawn on EACH side
  const TOWN_HOUSE_DEPTH = 0.128;       // original street-facing house length
  const TOWN_HOUSE_WIDTH = 0.18;        // wide outward footprint; near faces clip beyond the map edge
  const TOWN_ROAD_NEAR_HALF_WIDTH = 0.50; // always spans the full live UI width at the player
  const TOWN_NEAR_HOUSE_SCALE = 2.0;    // houses are twice-size at the player
  const TOWN_NEAR_WALL_HEIGHT = 0.92;   // nearest wall height vs game-area height
  const TOWN_DOOR_HEIGHT_RATIO = 0.48;  // projected door height vs wall height
  const TOWN_ACTOR_DOOR_RATIO = 0.80;   // every actor is exactly 80% of door height
  const DISTANCE_SCORE_BONUS = 1.5;     // farthest possible shot adds +150% score
  const TOWN_ROAD_LINE_COUNT = 11;
  const TOWN_ROAD_MARK_COUNT = 34;
  const TOWN_SAND_COLOUR = '#c99652';
  const TOWN_SAND_HIGHLIGHT = '#e1b76d';
  const TOWN_SKY_TOP = '#78bfe8';
  const TOWN_SKY_HORIZON = '#d8e7d5';
  const TOWN_ROAD_COLOUR = '#7c4932';
  const TOWN_ROAD_DARK = '#5b3428';
  const TOWN_HOUSE_TYPES = [
    {id:'homestead',name:'Homestead',wall:'#7c4b30',front:'#965f3e',detail:'#e4bd6c',layout:'home-a'},
    {id:'ranch-house',name:'Ranch House',wall:'#684733',front:'#83583d',detail:'#cfa55f',layout:'home-b'},
    {id:'desert-home',name:'Desert Home',wall:'#91603d',front:'#aa7048',detail:'#efd28d',layout:'home-c'},
    {id:'boarding-house',name:'Boarding House',wall:'#61402e',front:'#79513b',detail:'#d8b36f',layout:'home-d'},
    {id:'bathhouse-blue',name:'Blue Bathhouse',wall:'#466b70',front:'#59868b',detail:'#bce9e2',layout:'bath-a'},
    {id:'armory',name:'Armory',wall:'#41464b',front:'#596067',detail:'#c6cbd0',layout:'armory'},
    {id:'jail',name:'Jail',wall:'#4b443d',front:'#625950',detail:'#c0b7a8',layout:'jail'},
    {id:'general-store',name:'General Store',wall:'#78502e',front:'#97663a',detail:'#f0cf75',layout:'store-a'},
    {id:'supply-store',name:'Supply Store',wall:'#655338',front:'#806b49',detail:'#e4c881',layout:'store-b'},
    {id:'bathhouse-red',name:'Red Bathhouse',wall:'#744044',front:'#915157',detail:'#f2c6ba',layout:'bath-b'}
  ];
  // One distinct height and street-length profile for every catalogue building.
  const TOWN_HOUSE_HEIGHT_VARIANCE=[.84,.91,.97,1.04,1.11,.88,1.16,.94,1.08,1.01];
  const TOWN_HOUSE_LENGTH_VARIANCE=[.78,.86,.93,1.02,1.12,1.22,.82,.97,1.08,1.17];
  // Random once per page load, then kept stable so houses do not jump between
  // redraws. Sorting creates four irregularly spaced spawn points per side.
  const randomHouseOffsets=()=>Array.from({length:TOWN_HOUSE_COUNT},(_,i)=>(i/TOWN_HOUSE_COUNT+Math.random()*.16)%1).sort((a,b)=>a-b);
  const TOWN_HOUSE_OFFSETS = {'-1':randomHouseOffsets(),'1':randomHouseOffsets()};
  const TOWN_HOUSE_SELECTIONS={'-1':Array.from({length:TOWN_HOUSE_COUNT},()=>Math.floor(Math.random()*TOWN_HOUSE_TYPES.length)),'1':Array.from({length:TOWN_HOUSE_COUNT},()=>Math.floor(Math.random()*TOWN_HOUSE_TYPES.length))};
  const randomFaceDetails=()=>Array.from({length:TOWN_HOUSE_COUNT},()=>({
    poster:Math.random()<.58, lantern:Math.random()<.5, crates:Math.random()<.55,
    planks:Math.random()<.42, sign:Math.random()<.38
  }));
  const TOWN_HOUSE_FACE_DETAILS={'-1':randomFaceDetails(),'1':randomFaceDetails()};

  // An accumulated clock lets a boss freeze the town exactly where it is and
  // resume the same walk cycle after the fight, without a visual jump.
  let townTravelMs=0, townTravelLast=performance.now(), townMovementPaused=false;
  function setTownMovementPaused(paused){
    const now=performance.now();
    if(!townMovementPaused)townTravelMs+=now-townTravelLast;
    townTravelLast=now;townMovementPaused=paused;
  }
  function townTravelSeconds(){
    return (townTravelMs+(townMovementPaused?0:performance.now()-townTravelLast))/1000;
  }
  function resetTownMovement(){townTravelMs=0;townTravelLast=performance.now();townMovementPaused=false;}

  // Identifies this game to the shared PlatformManager (shared/js/PlatformManager.js).
  // Platform-wide stats (coins, question totals, sessions, high score) are keyed by this id.
  const GAME_CONFIG = { id: 'wild-west-wordslinger', name: 'Wild West Wordslinger' };
  function wordslingerCosmetic(id) {
    return typeof AchievementManager!=='undefined' && Object.values(AchievementManager.getEquipped('wild-west-wordslinger')).some(reward=>reward?.id===id);
  }
  function achievementAmmoBonus(){return wordslingerCosmetic('wild-west-wordslinger_loaded_chamber')?2:0;}
  window.addEventListener('arcade-progression-changed',()=>{updateCrosshairCursor();if(document.getElementById('bg-canvas'))drawBackground(stage);});
  // One PlatformManager session per sitting — startGame() runs on every "Play"
  // AND "Play Again" click (there's no separate restart path in this game),
  // so this guards against starting a new session on every replay.
  let platformSessionStarted = false;
  // Reports whether the player is actively playing right now (gameActive already
  // tracks this throughout: true during normal spawning and boss fights, false
  // during reload/pre-run quiz/boss-incoming preview/game over) so PlatformManager
  // can track "active play time" separately from total session time.
  setInterval(() => PlatformManager.heartbeat(GAME_CONFIG.id, gameActive), 1000);

  // Single-run powerup modifiers (reset every game, scaled by the pre-run quiz performance)
  let runScoreMult=1, runCoinMult=1, runSpawnRateMult=1, runPerformance=0;
  let activePowerupsThisRun=[];

  // Stage / boss state
  let stage=1, bossActive=false, bossHP=0, bossMaxHP=0, stageStartScore=0;
  let currentBoss=null, bossState={};
  const STAGE_SCORE_STEP = 300; // score needed within a stage before the boss appears

  // ===== In-run Roguelike Upgrade Cards =====
  // Offered one-of-three after every boss defeat. Entirely reset each run.
  // Cards can stack up to MAX_STACK times; several effects scale with stack count.
  const UPGRADE_CARDS = [
    { id:'piercing',   name:'Piercing Rounds',   icon:'🎯', rarity:'common', desc:'Kills also strike one other enemy on screen.' },
    { id:'ricochet',   name:'Ricochet',          icon:'↩️', rarity:'common', desc:'Missed shots bounce and strike the nearest enemy.' },
    { id:'spread',     name:'Spread Shot',       icon:'📐', rarity:'rare',   desc:'Kills also damage nearby enemies in a blast radius.' },
    { id:'explosive',  name:'Explosive Rounds',  icon:'💥', rarity:'rare',   desc:'Kills trigger a bonus explosion that can finish off nearby enemies.' },
    { id:'hollow',     name:'Hollow Points',     icon:'🪖', rarity:'common', desc:'Armored enemies go down in one less hit.' },
    { id:'quickdraw',  name:'Quickdraw',         icon:'⏱️', rarity:'common', desc:'Chance for any shot to cost no ammo.' },
    { id:'speedload',  name:'Speed Loader',      icon:'🔃', rarity:'common', desc:'Reload puzzles use a smaller, faster grid.' },
    { id:'overflow',   name:'Overflow Chamber',  icon:'🔫', rarity:'common', desc:'+1 max ammo, right now.' },
    { id:'hotreload',  name:'Hot Reload',        icon:'🔥', rarity:'rare',   desc:'After reloading, your next few shots are free.' },
    { id:'mastery',    name:'Category Mastery',  icon:'📚', rarity:'common', desc:'Reload & start bonuses pay out more.' },
    { id:'chain',      name:'Chain Lightning',   icon:'⚡', rarity:'rare',   desc:'High combos occasionally zap a bonus enemy dead.' },
    { id:'adrenaline', name:'Adrenaline',        icon:'💉', rarity:'common', desc:'Missing only halves your combo instead of resetting it.' },
    { id:'bounty',     name:'Bounty Hunter',     icon:'⭐', rarity:'rare',   desc:'Enemies occasionally spawn as Bounties worth 3x.' },
    { id:'kevlar',     name:'Kevlar Vest',       icon:'🦺', rarity:'common', desc:'The first life you\'d lose each stage is blocked.' },
    { id:'secondwind', name:'Second Wind',       icon:'❤️', rarity:'rare',   desc:'Once per run, survive a killing blow with 1 life.' },
    { id:'horseshoe',  name:'Lucky Horseshoe',   icon:'🍀', rarity:'common', desc:'Chance to shrug off a life-losing mistake entirely.' },
    { id:'magnet',     name:'Magnetic Draw',     icon:'🧲', rarity:'common', desc:'+1 bonus coin on every kill.' },
    { id:'deadeye',    name:'Deadeye Focus',     icon:'👁️', rarity:'rare',   desc:'Chance for a kill to score double.' }
  ];
  const CURSE_CARDS = [
    { id:'gamble',       name:"Outlaw's Gamble",    icon:'🎲', rarity:'curse', desc:'+50% score this run — but you\'re capped at 1 life.' },
    { id:'fanning',      name:'Fanning the Hammer', icon:'🔫', rarity:'curse', desc:'Combo builds twice as fast — but every shot costs 2 ammo.' },
    { id:'glasscannon',  name:'Glass Cannon',       icon:'🍾', rarity:'curse', desc:'+75% score this run — but max ammo is cut by 2, right now.' },
    { id:'triggerhappy', name:'Trigger Happy',      icon:'🌵', rarity:'curse', desc:'Never run out of ammo — but score gained is cut by 30%.' },
  ];
  const ALL_UPGRADE_CARDS = UPGRADE_CARDS.concat(CURSE_CARDS);
  const MAX_STACK = 3;

  let runUpgrades = {};          // id -> stack count, reset every run
  let kevlarUsedThisStage = false;
  let secondWindUsed = false;
  let deadManHandTimer = null;
  let runModifier = null;

  function upStack(id) { return runUpgrades[id] || 0; }
  function hasUp(id) { return upStack(id) > 0; }

  function rollUpgradeOffer() {
    // Commons/rares are far more likely to appear than curses; maxed-out cards drop out of the pool.
    const pool = [];
    ALL_UPGRADE_CARDS.forEach(c=>{
      if (upStack(c.id) >= MAX_STACK) return;
      const weight = c.rarity==='curse' ? 1 : (c.rarity==='rare' ? 2 : 4);
      for (let i=0;i<weight;i++) pool.push(c);
    });
    const picks = [], usedIds = new Set();
    let guard = 0;
    while (picks.length < 3 && pool.length && guard < 300) {
      guard++;
      const c = pool[Math.floor(Math.random()*pool.length)];
      if (!usedIds.has(c.id)) { picks.push(c); usedIds.add(c.id); }
    }
    return picks;
  }

  function showUpgradePicks() {
    gameActive = false; clearInterval(spawnInterval);
    kevlarUsedThisStage = false;
    document.getElementById('upgrade-stage-num').textContent = stage;
    const grid = document.getElementById('upgrade-pick-grid');
    grid.innerHTML = '';
    rollUpgradeOffer().forEach(card=>{
      const stackCount = upStack(card.id);
      const el = document.createElement('div');
      el.className = 'upgrade-card powerup-card' + (card.rarity==='curse' ? ' curse' : '');
      el.innerHTML =
        '<p class="canva-text desc-font font-bold text-sm mb-1">' + card.icon + ' ' + card.name +
        (stackCount>0 ? ' <span class="stack-badge">(Lv.'+(stackCount+1)+')</span>' : '') + '</p>' +
        '<p class="text-xs text-gray-300 desc-font">' + card.desc + '</p>';
      el.addEventListener('click', ()=>pickUpgrade(card.id));
      grid.appendChild(el);
    });
    document.getElementById('upgrade-pick-overlay').classList.remove('hidden');
  }

  function pickUpgrade(id) {
    runUpgrades[id] = upStack(id) + 1;
    applyImmediateUpgradeEffect(id);
    document.getElementById('upgrade-pick-overlay').classList.add('hidden');
    updateHUD();
    gameActive = true;
    spawnInterval = setInterval(spawnEnemy, getSpawnDelay());
  }

  // A few cards need a one-time effect the moment they're picked (max ammo
  // changes, life caps, timers) rather than a passive check elsewhere.
  function applyImmediateUpgradeEffect(id) {
    if (id==='overflow') { maxAmmo += 1; ammo = Math.min(maxAmmo, ammo+1); }
    if (id==='glasscannon') { maxAmmo = Math.max(2, maxAmmo-2); ammo = Math.min(ammo, maxAmmo); }
    if (id==='gamble') { lives = Math.min(lives, 1); }
    if (id==='deadmanshand' && !deadManHandTimer) {
      deadManHandTimer = setInterval(()=>{
        if (!gameActive && !bossActive) return;
        const area = document.getElementById('game-area');
        loseLife(1, area, area.clientWidth/2-50, 50, "The Dead Man's Hand caught up with you.");
      }, 45000);
    }
  }

  // Centralizes every way the player can lose lives so defensive cards
  // (Kevlar, Second Wind, Lucky Horseshoe) and curses (Blood Money) only
  // need to be handled here instead of at every call site.
  function loseLife(amount, area, x, y, reason) {
    if (hasUp('bloodmoney')) amount *= 2;
    const fx = x!=null ? x : (area ? area.clientWidth/2-40 : 20);
    const fy = y!=null ? y : 60;
    if (hasUp('horseshoe') && Math.random() < 0.1*upStack('horseshoe')) {
      showFloatingText(fx, fy, '🍀 Lucky!', '#2ecc71', area);
      return;
    }
    if (hasUp('kevlar') && !kevlarUsedThisStage) {
      kevlarUsedThisStage = true;
      showFloatingText(fx, fy, '🦺 Blocked!', '#00d4ff', area);
      return;
    }
    lives = Math.max(0, lives - amount);
    updateHUD();
    if (lives <= 0) {
      if (hasUp('secondwind') && !secondWindUsed) {
        secondWindUsed = true;
        lives = 1; updateHUD();
        showFloatingText(fx, fy, '❤️ Second Wind!', '#ff69b4', area);
      } else {
        gameOverReason = reason || gameOverReason || 'Ran out of lives.';
        endGame();
      }
    }
  }

  // Centralizes ammo spend so Trigger Happy / Fanning the Hammer / Quickdraw /
  // Hot Reload only need to be handled here instead of at every shot site.
  let freeShotsRemaining = 0;
  function consumeAmmo(base) {
    if (hasUp('triggerhappy')) return;
    if (freeShotsRemaining > 0) { freeShotsRemaining--; return; }
    let cost = base;
    if (hasUp('fanning')) cost *= 2;
    if (hasUp('quickdraw') && Math.random() < 0.12*upStack('quickdraw')) cost = 0;
    ammo = Math.max(0, ammo - cost);
  }

  function upgradeScoreMult() {
    let m = 1;
    if (hasUp('gamble')) m *= 1.5;
    if (hasUp('glasscannon')) m *= 1.75;
    if (hasUp('triggerhappy')) m *= 0.7;
    return m;
  }
  function upgradeCoinMult() {
    let m = 1;
    if (hasUp('bloodmoney')) m *= 2;
    if (hasUp('deadmanshand')) m *= 2;
    return m;
  }
  // Fully kills an enemy element (used by Explosive/Piercing/Chain Lightning
  // to finish off a *different* enemy than the one directly clicked).
  function finishOffEnemy(other, area) {
    if (!other || other.dataset.dead || other.dataset.kind==='decoy') return;
    const pos=elementEffectPosition(other,area),ox=pos.x,oy=pos.y;
    other.dataset.dead='1';
    if (other._expireTimer) clearTimeout(other._expireTimer);
    other._peekWall?.remove();
    stopTeleport(other); stopDrain(other);
    const otherType = [...ENEMY_TYPES,...DECOY_TYPES].find(t=>t.id===other.dataset.type) || ENEMY_TYPES[0];
    comboStreak++;
    const otherGain = Math.round(otherType.score * getComboMultiplier() * runScoreMult * upgradeScoreMult());
    const otherCoins = Math.round(otherType.coins * runCoinMult * upgradeCoinMult()) + upStack('magnet');
    killCount++; totalKills++; overallScore+=otherGain; sessionCoins+=otherCoins;
    spawnDeathEffect(ox,oy,area);
    other.style.transition='transform 0.25s, opacity 0.25s';
    other.style.transform='scale(0) rotate(90deg)';other.style.opacity='0';
    setTimeout(()=>other.remove(),300);
  }
  // Reduces an enemy's remaining hits by 1; returns true if that was its last hit
  // (caller should then call finishOffEnemy on it).
  function damageOtherEnemy(other) {
    if (!other || other.dataset.dead || other.dataset.kind==='decoy') return false;
    const hitsLeft = parseInt(other.dataset.hitsLeft||'1',10) - 1;
    if (hitsLeft > 0) {
      other.dataset.hitsLeft = String(hitsLeft);
      const sprite=other.querySelector('canvas');
      if(sprite){sprite.classList.remove('armor-flash');void sprite.offsetWidth;sprite.classList.add('armor-flash');}
      return false;
    }
    return true;
  }

  // ===== Random Start Modifiers ("Wanted: Special Conditions") =====
  // Rolled once at the start of every run — never player-chosen. About half
  // of runs get none at all so a "clean" run stays common.
  const MODIFIERS = [
    { id:'highnoon',  name:'High Noon',       desc:'Enemies spawn 30% faster — but score is worth +25% more.',
      apply:()=>{ runSpawnRateMult *= 0.7; runScoreMult *= 1.25; } },
    { id:'ghosttown', name:'Ghost Town',      desc:'Enemies spawn 25% slower — but escapes cost double lives.',
      apply:()=>{ runSpawnRateMult *= 1.25; runModifier.escapePenaltyMult = 2; } },
    { id:'payday',    name:'Payday',          desc:'Coins are worth +50% more — but max ammo is 1 less.',
      apply:()=>{ runCoinMult *= 1.5; maxAmmo = Math.max(2, maxAmmo-1); ammo = Math.min(ammo, maxAmmo); } },
    { id:'ironwill',  name:'Iron Will',       desc:'+1 life to start — but coins are worth 20% less.',
      apply:()=>{ lives += 1; runCoinMult *= 0.8; } },
    { id:'quicktrigger', name:'Quick Trigger', desc:'Reload puzzles are smaller — but max ammo is 1 less.',
      apply:()=>{ runModifier.smallerReload = true; maxAmmo = Math.max(2, maxAmmo-1); ammo = Math.min(ammo, maxAmmo); } },
    { id:'stormscoming', name:"Storm's Coming", desc:'Enemies vanish faster off-screen — but score is worth +20% more.',
      apply:()=>{ runModifier.lifetimeMult = 0.75; runScoreMult *= 1.2; } }
  ];

  function rollModifier() {
    runModifier = null;
    if (Math.random() < 0.45) {
      const def = MODIFIERS[Math.floor(Math.random()*MODIFIERS.length)];
      runModifier = { id: def.id, name: def.name, desc: def.desc, escapePenaltyMult: 1, smallerReload: false, lifetimeMult: 1 };
      def.apply();
    }
  }

  function showModifierBanner(callback) {
    if (!runModifier) { callback(); return; }
    document.getElementById('modifier-banner-name').textContent = '📜 ' + runModifier.name;
    document.getElementById('modifier-banner-desc').textContent = runModifier.desc;
    document.getElementById('modifier-banner-overlay').classList.remove('hidden');
    setTimeout(()=>{
      document.getElementById('modifier-banner-overlay').classList.add('hidden');
      callback();
    }, 2200);
  }

  // ===== Quickdraw Duel =====
  // A single high-value gunslinger challenges the player once per stage
  // (weighted chance): find the correct word before the timer bar runs out.
  let duelActive = false;
  let duelUsedThisStage = false;
  let duelTimerHandle = null;

  function maybeTriggerDuel() {
    if (duelUsedThisStage || bossActive || bossPreviewActive || duelActive || !gameActive) return;
    if (Math.random() < 0.012) triggerDuel();
  }

  function triggerDuel() {
    duelUsedThisStage = true; duelActive = true;
    gameActive = false; clearInterval(spawnInterval);
    const area = document.getElementById('game-area');
    area.querySelectorAll('.enemy-wrap,.western-obstacle,.peek-house-wall').forEach(e=>{ stopTeleport(e); stopDrain(e); if(e._expireTimer) clearTimeout(e._expireTimer); e.remove(); });
    const type = ENEMY_TYPES[Math.floor(Math.random()*ENEMY_TYPES.length)];
    const canvas = document.getElementById('duel-canvas');
    type.draw(canvas.getContext('2d'));
    document.getElementById('duel-name').textContent = '👤 ' + type.name + ' calls you out!';
    const cat = QuestionManager.getNextQuestion();
    document.getElementById('duel-category').textContent = 'Tap: ' + cat.prompt;
    const correctWord = cat.correct[Math.floor(Math.random()*cat.correct.length)];
    const distractors = [...cat.distractors].sort(()=>Math.random()-0.5).slice(0,5);
    const words = [correctWord, ...distractors].sort(()=>Math.random()-0.5);
    const grid = document.getElementById('duel-grid');
    grid.innerHTML = '';
    let resolved = false;
    const duration = 2600;
    const fill = document.getElementById('duel-timer-fill');
    fill.style.transition = 'none'; fill.style.width = '100%';
    requestAnimationFrame(()=>{ fill.style.transition = 'width '+duration+'ms linear'; fill.style.width = '0%'; });
    duelTimerHandle = setTimeout(()=>resolveDuel(false, cat, correctWord), duration);
    words.forEach(w=>{
      const cell = document.createElement('button');
      cell.className = 'word-cell p-2 text-xs text-center rounded font-bold';
      cell.textContent = w;
      cell.addEventListener('click', ()=>{
        if (resolved) return;
        resolved = true;
        clearTimeout(duelTimerHandle);
        resolveDuel(w===correctWord, cat, correctWord);
      });
      grid.appendChild(cell);
    });
    document.getElementById('duel-overlay').classList.remove('hidden');
  }

  function resolveDuel(won, cat, correctWord) {
    document.getElementById('duel-overlay').classList.add('hidden');
    duelActive = false;
    const area = document.getElementById('game-area');
    PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, won);
    if (won) {
      window.AchievementManager?.notify?.('quickdraw_won',{facts:{mastery_wild_west_wordslinger:1}});
      totalCorrectAnswers++; safeSave();
      const bonusScore = Math.round(120 * runScoreMult);
      const bonusCoins = Math.round(40 * runCoinMult);
      overallScore += bonusScore; sessionCoins += bonusCoins; killCount++; totalKills++;
      showFloatingText(area.clientWidth/2-70, area.clientHeight/2, '⚡ Quickdraw Win! +'+bonusScore+' / +'+bonusCoins+'🪙', '#2ecc71', area);
      updateHUD(); checkStageProgress();
      if (gameActive===false && !bossActive && !bossPreviewActive) { gameActive = true; spawnInterval = setInterval(spawnEnemy, getSpawnDelay()); }
    } else {
      PlatformManager.deductCoins(5);
      showFloatingText(area.clientWidth/2-70, area.clientHeight/2, 'Too slow! It was "'+correctWord+'" / -5🪙', '#e74c3c', area);
      loseLife(1, area, area.clientWidth/2-40, area.clientHeight/2+30, 'Lost a quickdraw duel — outdrawn!');
      if (gameActive===false && !bossActive && !bossPreviewActive && lives>0) { gameActive = true; spawnInterval = setInterval(spawnEnemy, getSpawnDelay()); }
    }
  }

  // Persistent state
  let playerData = null; // the SDK record
  // NOTE: the persistent coin balance is NOT stored in a local field — it
  // lives in PlatformManager (shared/js/PlatformManager.js) as the single
  // source of truth for the shared coin economy. `sessionCoins` above is
  // this run's ephemeral, not-yet-banked earnings, which stays local.
  let highScore=0, bulletLevel=0, livesLevel=0, comboLevel=0;
  let totalCorrectAnswers=0, totalKills=0;
  let equippedPowerups=[]; // ids from POWERUPS the player has selected to run with
  let ownedCrosshairs=[], ownedEffects=[];
  let equippedCrosshair='', equippedEffect='';

  const EFFECT_COLORS = {
    'Smoke':['#888','#aaa','#ccc','#666'],
    'Fire':['#ff4500','#ff6600','#ffaa00','#ff2200'],
    'Rainbow':['#ff0000','#ff8800','#ffff00','#00ff00','#0088ff','#8800ff'],
    'Stars':['#f5c842','#fff','#f39c12','#fffacd'],
    'Lightning':['#00bfff','#87ceeb','#fff','#1e90ff'],
    'Hearts':['#ff1493','#ff69b4','#ff6b81','#c0392b'],
    'Coins':['#f5c842','#daa520','#ffd700','#b8860b'],
    'Green Plasma':['#00ff00','#32cd32','#7cfc00','#228b22'],
    'Blue Ice':['#00ffff','#87ceeb','#b0e0e6','#4169e1']
  };

  // Single-run powerups — unlocked by lifetime correct answers, equipped from the shop,
  // magnitude scaled each run by a short pre-run quiz (accuracy + speed).
  const POWERUPS = [
    { id:'lucky',     name:'Lucky Charm',       icon:'🍀', unlockAt:40,
      desc:'Before the run: 2 quick questions. The better & faster you answer, the bigger your score multiplier for that run.' },
    { id:'stage',     name:'Stage Clear Bonus', icon:'🏁', unlockAt:80,
      desc:'Before the run: 2 quick questions. Every stage you clear pays out bonus coins & score, scaled by that quiz.' },
    { id:'golden',    name:'Golden Touch',      icon:'💰', unlockAt:120,
      desc:'Before the run: 2 quick questions. The better you do, the more every coin is worth for that run.' },
    { id:'overdrive', name:'Overdrive',         icon:'⚡', unlockAt:160,
      desc:'Before the run: 2 quick questions. The better you do, the more enemies spawn — but coins & score are worth more too.' }
  ];
  function maxEquippedSlots() {
    if (totalCorrectAnswers >= 400) return 4;
    if (totalCorrectAnswers >= 300) return 3;
    if (totalCorrectAnswers >= 200) return 2;
    return 1;
  }

  // Data SDK
  const dataHandler = {
    onDataChanged(data) {
      if (data.length > 0) {
        playerData = data[0];
        highScore = playerData.high_score || 0;
        bulletLevel = playerData.bullet_upgrade_level || 0;
        livesLevel = playerData.lives_upgrade_level || 0;
        totalCorrectAnswers = playerData.total_correct_answers || 0;
        totalKills = playerData.total_kills || 0;
        equippedPowerups = playerData.equipped_powerups ? playerData.equipped_powerups.split(',').filter(Boolean) : [];
        comboLevel = playerData.combo_upgrade_level || 0;
        ownedCrosshairs = playerData.owned_crosshairs ? playerData.owned_crosshairs.split(',').filter(Boolean) : [];
        ownedEffects = playerData.owned_effects ? playerData.owned_effects.split(',').filter(Boolean) : [];
        equippedCrosshair = playerData.equipped_crosshair || '';
        equippedEffect = playerData.equipped_effect || '';
      } else {
        playerData = null;
        highScore=0; bulletLevel=0; livesLevel=0; comboLevel=0;
        totalCorrectAnswers=0; totalKills=0; equippedPowerups=[];
        ownedCrosshairs=[]; ownedEffects=[];
        equippedCrosshair=''; equippedEffect='';
      }
      maxAmmo = 5 + bulletLevel + achievementAmmoBonus();
      updateHomeStats();
      loadQuestionBank().then(updateCodeStatus);
    }
  };

  async function initData() {
    if (!window.dataSdk) return;
    const r = await window.dataSdk.init(dataHandler);
    if (!r.isOk) console.error('SDK init failed');
  }
  initData();

  async function safeSave() { try { await saveData(); } catch(e) { console.error("saveData failed", e); } }

  async function saveData() {
    const obj = {
      high_score: highScore,
      bullet_upgrade_level: bulletLevel,
      lives_upgrade_level: livesLevel,
      total_correct_answers: totalCorrectAnswers,
      total_kills: totalKills,
      equipped_powerups: equippedPowerups.join(','),
      combo_upgrade_level: comboLevel,
      owned_crosshairs: ownedCrosshairs.join(','),
      owned_effects: ownedEffects.join(','),
      equipped_crosshair: equippedCrosshair,
      equipped_effect: equippedEffect
    };
    if (playerData) {
      await window.dataSdk.update({...playerData, ...obj});
    } else {
      await window.dataSdk.create(obj);
    }
  }

  function updateHomeStats() {
    document.getElementById('home-highscore').textContent = highScore;
    document.getElementById('home-coins').textContent = '🪙 ' + PlatformManager.getCoins();
    document.getElementById('home-kills').textContent = totalKills;
    document.getElementById('home-correct').textContent = totalCorrectAnswers;
    updateModeSelection();
  }

  function bloodyBanditProgress(){
    const stats=PlatformManager.getAllGameStats(),others=stats.filter(g=>g.gameId!==GAME_CONFIG.id&&g.correct>=50);
    const total=stats.reduce((sum,g)=>sum+(Number(g.correct)||0),0);
    const earned=total>=200&&others.length>=3;
    if(earned)window.AchievementManager?.grantTypeUnlock?.('wild-west-bloody-bandit',{name:'Bloody Bandit',kind:'game-mode',gameId:GAME_CONFIG.id,detail:'Reverse mode: hunt townsfolk and protect outlaws.'});
    return{unlocked:earned||!!window.AchievementManager?.hasTypeUnlock?.('wild-west-bloody-bandit'),total,otherGames:others.length};
  }
  function showModeMilestone(){
    if(localStorage.getItem('wild-west-bloody-bandit-milestone'))return;
    localStorage.setItem('wild-west-bloody-bandit-milestone','1');
    const fx=document.createElement('div');fx.className='mode-milestone-burst';
    fx.innerHTML='<div class="milestone-pixels"></div><h2>🩸 BLOODY BANDIT UNLOCKED</h2><p>Hunt the townsfolk. Let every outlaw escape.</p>';
    document.body.appendChild(fx);setTimeout(()=>fx.remove(),4200);
  }
  function updateModeSelection(){
    const button=document.getElementById('bloody-bandit-button'),lawman=document.getElementById('lawman-mode-button'),progress=document.getElementById('mode-unlock-progress');if(!button||!progress)return;
    const state=bloodyBanditProgress();button.disabled=!state.unlocked;
    button.innerHTML=(gameMode==='bloody'?'✅ ':'')+(state.unlocked?'🩸 Bloody Bandit<br><small>Hunt townsfolk and protect outlaws.</small>':'🔒 Bloody Bandit');
    if(lawman){lawman.innerHTML=(gameMode==='lawman'?'✅ ':'')+'🤠 Lawman<br><small>Hunt outlaws and protect townsfolk.</small>';lawman.classList.toggle('equipped',gameMode==='lawman');}
    button.classList.toggle('equipped',gameMode==='bloody');
    const start=document.getElementById('start-button');if(start)start.textContent=gameMode==='bloody'?'Press Start — Bloody Bandit':'Press Start — Lawman';
    progress.textContent=state.unlocked?'Bloody Bandit unlocked':`${Math.min(200,state.total)}/200 correct · ${Math.min(3,state.otherGames)}/3 other games at 50 correct`;
    if(state.unlocked)showModeMilestone();
  }
  window.addEventListener('arcade-achievement-manager-ready',updateModeSelection);
  function selectGameMode(mode){if(mode==='bloody'&&!bloodyBanditProgress().unlocked)return;gameMode=mode;updateModeSelection();}

  // Screens
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function goHome() { showScreen('home-screen'); updateHomeStats(); }

  // Shop
  const SHOP_TABS = ['upgrades','powerups','modes'];
  function switchShopTab(tab) {
    SHOP_TABS.forEach(t => {
      const target=document.getElementById('shop-tab-'+t);target.hidden=t!==tab;target.classList.toggle('hidden', t!==tab);
      document.getElementById('shop-tab-btn-'+t).classList.toggle('shop-tab-active', t===tab);
    });
    const cosmetics=document.getElementById('arcade-native-cosmetics-panel');if(cosmetics){cosmetics.hidden=true;cosmetics.classList.remove('active');}
  }
  function openShop() {
    document.getElementById('shop-modal').classList.add('open');
    document.getElementById('shop-coins-display').textContent = '🪙 ' + PlatformManager.getCoins();
    updateBulletInfo();
    updateLifeInfo();
    updateComboUpgradeInfo();
    renderPowerups();
    updateModeSelection();
    switchShopTab('upgrades');
    document.getElementById('shop-result').classList.add('hidden');
  }

  function renderPowerups() {
    const slots = maxEquippedSlots();
    document.getElementById('powerup-slots-info').textContent =
      slots + ' powerup slot' + (slots>1?'s':'') + ' — equip up to ' + slots + ' for your next run (' + totalCorrectAnswers + ' correct answers so far)';
    const list = document.getElementById('powerup-list');
    list.innerHTML = '';
    POWERUPS.forEach(p => {
      const unlocked = totalCorrectAnswers >= p.unlockAt;
      const equipped = equippedPowerups.includes(p.id);
      const card = document.createElement('div');
      card.className = 'powerup-card' + (!unlocked ? ' locked' : '') + (equipped ? ' equipped' : '');
      const title = document.createElement('p');
      title.className = 'canva-text desc-font font-bold text-sm mb-1';
      title.textContent = p.icon + ' ' + p.name + (equipped ? ' ✓' : '');
      const desc = document.createElement('p');
      desc.className = 'text-xs text-gray-400 desc-font mb-2';
      desc.textContent = unlocked ? p.desc : ('🔒 Unlocks at ' + p.unlockAt + ' correct answers (' + totalCorrectAnswers + '/' + p.unlockAt + ')');
      card.appendChild(title); card.appendChild(desc);
      if (unlocked) {
        const btn = document.createElement('button');
        btn.className = 'canva-button w-full py-2 pixel-border rounded font-bold text-xs';
        btn.textContent = equipped ? 'Unequip' : 'Equip';
        btn.addEventListener('click', () => togglePowerup(p.id));
        card.appendChild(btn);
      }
      list.appendChild(card);
    });
  }

  async function togglePowerup(id) {
    if (equippedPowerups.includes(id)) {
      equippedPowerups = equippedPowerups.filter(x => x!==id);
    } else {
      if (equippedPowerups.length >= maxEquippedSlots()) {
        showShopResult('No free powerup slots! Unequip one first.', '#e74c3c');
        return;
      }
      equippedPowerups.push(id);
    }
    await safeSave();
    renderPowerups();
  }

  function closeShop() { document.getElementById('shop-modal').classList.remove('open'); }

  function updateBulletInfo() {
    const cost = PlatformManager.permanentUpgradeCost(bulletLevel);
    document.getElementById('bullet-upgrade-info').textContent = 'Level ' + bulletLevel + ' (Ammo: ' + (5+bulletLevel) + ') — Next: ' + cost + ' 🪙';
  }

  async function buyBulletUpgrade() {
    const cost = PlatformManager.permanentUpgradeCost(bulletLevel);
    if (!PlatformManager.spendCoins(cost)) { showShopResult('Not enough coins!', '#e74c3c'); return; }
    bulletLevel++;
    maxAmmo = 5 + bulletLevel + achievementAmmoBonus();
    await safeSave();
    document.getElementById('shop-coins-display').textContent = '🪙 ' + PlatformManager.getCoins();
    updateBulletInfo();
    showShopResult('Upgraded! Ammo: ' + maxAmmo, '#2ecc71');
  }

  function lifeUpgradeCost() { return PlatformManager.permanentUpgradeCost(livesLevel); }
  function updateLifeInfo() {
    document.getElementById('life-upgrade-info').textContent = 'Start with ' + (3+livesLevel) + ' lives — Next: ' + lifeUpgradeCost() + ' 🪙';
  }
  async function buyLifeUpgrade() {
    const cost = lifeUpgradeCost();
    if (!PlatformManager.spendCoins(cost)) { showShopResult('Not enough coins!', '#e74c3c'); return; }
    livesLevel++;
    await safeSave();
    document.getElementById('shop-coins-display').textContent = '🪙 ' + PlatformManager.getCoins();
    updateLifeInfo();
    showShopResult('❤️ Now starting with ' + (3+livesLevel) + ' lives!', '#2ecc71');
  }

  // Combo Master: raises how fast your streak multiplier grows and its cap. Cost rises exponentially.
  function comboUpgradeCost() { return PlatformManager.permanentUpgradeCost(comboLevel); }
  function updateComboUpgradeInfo() {
    const rate = (0.1 + comboLevel*0.04).toFixed(2);
    const cap = (3 + comboLevel*0.75).toFixed(1);
    document.getElementById('combo-upgrade-info').textContent = 'Level ' + comboLevel + ' (+' + rate + 'x per kill, cap ' + cap + 'x) — Next: ' + comboUpgradeCost() + ' 🪙';
  }
  async function buyComboUpgrade() {
    const cost = comboUpgradeCost();
    if (!PlatformManager.spendCoins(cost)) { showShopResult('Not enough coins!', '#e74c3c'); return; }
    comboLevel++;
    await safeSave();
    document.getElementById('shop-coins-display').textContent = '🪙 ' + PlatformManager.getCoins();
    updateComboUpgradeInfo();
    showShopResult('🔥 Combo power increased!', '#2ecc71');
  }

  function showShopResult(msg, color) {
    const el = document.getElementById('shop-result');
    el.style.cssText = '';
    el.textContent = msg; el.style.color = color;
    el.classList.remove('hidden');
  }

  function goToShopFromGameOver() { goHome(); openShop(); }

  // Inventory
  function openInventory() {
    document.getElementById('inventory-modal').classList.add('open');
    renderInventory();
  }
  function closeInventory() { document.getElementById('inventory-modal').classList.remove('open'); }

  function renderInventory() {
    const cl = document.getElementById('crosshair-list');
    const el = document.getElementById('effect-list');
    cl.innerHTML = ''; el.innerHTML = '';
    if (ownedCrosshairs.length === 0) cl.innerHTML = '<p class="text-xs text-gray-500 desc-font col-span-2">None yet</p>';
    ownedCrosshairs.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'p-2 rounded text-xs font-bold desc-font ' + (equippedCrosshair===c ? 'ring-2 ring-pink-400' : '');
      btn.style.background = equippedCrosshair===c ? '#5c1a75' : 'rgba(106,5,114,0.18)';
      btn.style.border = '1px solid #6a0572';
      btn.style.color = '#ffffff';
      btn.textContent = (equippedCrosshair===c?'✓ ':'')+c;
      btn.onclick = () => equipCrosshair(c);
      cl.appendChild(btn);
    });
    if (ownedEffects.length === 0) el.innerHTML = '<p class="text-xs text-gray-500 desc-font col-span-2">None yet</p>';
    ownedEffects.forEach(e => {
      const btn = document.createElement('button');
      btn.className = 'p-2 rounded text-xs font-bold desc-font ' + (equippedEffect===e ? 'ring-2 ring-pink-400' : '');
      btn.style.background = equippedEffect===e ? '#5c1a75' : 'rgba(106,5,114,0.18)';
      btn.style.border = '1px solid #6a0572';
      btn.style.color = '#ffffff';
      btn.textContent = (equippedEffect===e?'✓ ':'')+e;
      btn.onclick = () => equipEffect(e);
      el.appendChild(btn);
    });
  }

  async function equipCrosshair(name) {
    equippedCrosshair = equippedCrosshair===name ? '' : name;
    await safeSave(); renderInventory();
  }
  async function equipEffect(name) {
    equippedEffect = equippedEffect===name ? '' : name;
    await safeSave(); renderInventory();
  }

  // Custom crosshair
  function updateCrosshairCursor() {
    const el = document.getElementById('crosshair-cursor');
    const area = document.getElementById('game-area');
    const rewardCrosshair = ['fish_crosshair','sheriff_star_crosshair','musical_crosshair'].find(id=>wordslingerCosmetic('wild-west-wordslinger_'+id));
    if ((!equippedCrosshair && !rewardCrosshair) || !gameActive) {
      el.classList.add('hidden');
      if (area) area.classList.remove('custom-cursor-active');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = rewardCrosshair ? getRewardCrosshairSVG(rewardCrosshair) : getCrosshairSVG(equippedCrosshair);
    if (area) area.classList.add('custom-cursor-active');
  }

  function getRewardCrosshairSVG(id){
    if(id==='fish_crosshair')return '<svg width="46" height="34" viewBox="0 0 46 34"><path d="M5 17C12 5 29 5 37 17C29 29 12 29 5 17Z" fill="#4fe5ff" stroke="#fff" stroke-width="2"/><path d="M36 17L45 8V26Z" fill="#ff77c8"/><circle cx="13" cy="14" r="2" fill="#111"/><circle cx="23" cy="17" r="2" fill="#ffd15c"/></svg>';
    if(id==='sheriff_star_crosshair')return '<svg width="42" height="42" viewBox="0 0 42 42"><polygon points="21,2 26,12 38,10 31,21 38,32 26,30 21,40 16,30 4,32 11,21 4,10 16,12" fill="#ffd15c" stroke="#fff4b0" stroke-width="2"/><circle cx="21" cy="21" r="4" fill="#5b3217"/></svg>';
    return '<svg width="44" height="44" viewBox="0 0 44 44"><path d="M20 6V29c-8-3-14 1-12 7 2 6 15 3 15-5V15l13-3v13c-8-3-13 1-11 7 2 6 14 3 14-5V4Z" fill="#ff78cf" stroke="#fff" stroke-width="1.5"/><circle cx="22" cy="22" r="2" fill="#ffd15c"/></svg>';
  }

  function getCrosshairSVG(name) {
    const svgs = {
      'Cross':'<svg width="32" height="32"><line x1="16" y1="4" x2="16" y2="28" stroke="#f5c842" stroke-width="2"/><line x1="4" y1="16" x2="28" y2="16" stroke="#f5c842" stroke-width="2"/></svg>',
      'Circle':'<svg width="32" height="32"><circle cx="16" cy="16" r="10" fill="none" stroke="#f5c842" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="#f5c842"/></svg>',
      'Dot':'<svg width="32" height="32"><circle cx="16" cy="16" r="4" fill="#f5c842"/></svg>',
      'Sheriff Badge':'<svg width="32" height="32"><polygon points="16,4 18,12 26,12 20,17 22,25 16,20 10,25 12,17 6,12 14,12" fill="#f5c842"/></svg>',
      'Horseshoe':'<svg width="32" height="32"><path d="M10,24 Q10,8 16,8 Q22,8 22,24" fill="none" stroke="#f5c842" stroke-width="3" stroke-linecap="round"/></svg>',
      'Star':'<svg width="32" height="32"><polygon points="16,6 18,13 26,13 20,18 22,26 16,21 10,26 12,18 6,13 14,13" fill="none" stroke="#f5c842" stroke-width="1.5"/></svg>',
      'Skull':'<svg width="32" height="32"><circle cx="16" cy="14" r="8" fill="#f5c842"/><rect x="12" y="22" width="8" height="4" fill="#f5c842"/><circle cx="13" cy="13" r="2" fill="#1a0a00"/><circle cx="19" cy="13" r="2" fill="#1a0a00"/></svg>',
      'Bullseye':'<svg width="32" height="32"><circle cx="16" cy="16" r="12" fill="none" stroke="#f5c842" stroke-width="1.5"/><circle cx="16" cy="16" r="7" fill="none" stroke="#f5c842" stroke-width="1.5"/><circle cx="16" cy="16" r="2" fill="#f5c842"/></svg>'
    };
    return svgs[name] || '';
  }

  document.addEventListener('mousemove', e => {
    const el = document.getElementById('crosshair-cursor');
    if (!el.classList.contains('hidden')) {
      el.style.left = e.clientX + 'px';
      el.style.top = e.clientY + 'px';
    }
  });

  // Death effect particles
  function spawnDeathEffect(x, y, area) {
    const rewardEffect=['fish_crosshair','sheriff_star_crosshair','musical_crosshair'].find(id=>wordslingerCosmetic('wild-west-wordslinger_'+id));
    const colors = equippedEffect && EFFECT_COLORS[equippedEffect] ? EFFECT_COLORS[equippedEffect] : ['#f5c842','#f39c12','#e74c3c','#c0392b'];
    for (let i = 0; i < 16; i++) {
      const g = document.createElement('div');
      g.className = 'gunfire-effect';
      const angle = (Math.PI * 2 / 16) * i;
      const dist = 15 + Math.random() * 40;
      g.style.left = (x + 64) + 'px';
      g.style.top = (y + 64) + 'px';
      if(rewardEffect){g.textContent=rewardEffect==='fish_crosshair'?(i%2?'◆':'◀'):rewardEffect==='sheriff_star_crosshair'?'★':(i%2?'♪':'♫');g.style.color=rewardEffect==='fish_crosshair'?(i%2?'#4fe5ff':'#ff77c8'):rewardEffect==='sheriff_star_crosshair'?'#ffd15c':(i%2?'#ff78cf':'#71efff');g.style.fontSize=(10+Math.random()*9)+'px';g.style.textShadow='0 0 5px currentColor';}
      else{g.style.background = colors[Math.floor(Math.random() * colors.length)];g.style.width = (4 + Math.random()*6) + 'px';g.style.height = (4 + Math.random()*6) + 'px';}
      g.style.setProperty('--gx', Math.cos(angle) * dist + 'px');
      g.style.setProperty('--gy', Math.sin(angle) * dist + 'px');
      area.appendChild(g);
      setTimeout(() => g.remove(), 400);
    }
  }

  function elementEffectPosition(el,area){
    const rect=el.getBoundingClientRect(),areaRect=area.getBoundingClientRect();
    return{x:rect.left-areaRect.left+rect.width/2-64,y:rect.top-areaRect.top+rect.height/2-64};
  }

  function spawnBossMuzzleEffect(area,angle){
    const cx=area.clientWidth*.5,cy=area.clientHeight*.5;
    for(let i=0;i<9;i++){
      const pixel=document.createElement('i');pixel.className='boss-muzzle-pixel';
      const spread=angle+(Math.random()-.5)*.8,dist=28+Math.random()*48;
      pixel.style.left=(cx+Math.cos(angle)*66)+'px';pixel.style.top=(cy+Math.sin(angle)*66)+'px';
      pixel.style.setProperty('--mx',Math.cos(spread)*dist+'px');pixel.style.setProperty('--my',Math.sin(spread)*dist+'px');
      pixel.style.background=i%3===0?'#fff2a8':i%2?'#ffb52e':'#e64a19';
      area.appendChild(pixel);setTimeout(()=>pixel.remove(),330);
    }
  }

  // Categories - Easy for 7 year olds
  // ===== Teacher question banks =====
  // Category files use this shape:
  //   { "subject": "Year 9 Biology", "categories": [
  //       { "prompt": "Cell Structures", "correct": ["Nucleus","Mitochondria","Ribosome","Cell membrane"],
  //         "distractors": ["Bone","Muscle","Skin","Blood vessel", ... at least 12 wrong options] }
  //   ] }
  // Each round shows 16 tiles (all "correct" words + random distractors) and the player must
  // click every "correct" tile — same word-grid mechanic as the built-in game, just per-subject.
  // Change this value if Wild West Wordslinger ever supports another question type.
  // All loading, storing, selecting and shuffling of categories lives in QuestionManager now.
  const QUESTION_BANK_TYPE = 'category';

  async function loadQuestionBank() {
    return QuestionManager.loadCurrentBanks(window.GAME_CONFIG?.supportedQuestionFormats);
  }

  function updateCodeStatus() {
    const el = document.getElementById('code-status');
    if (!el) return;
    if (QuestionManager.hasQuestions()) {
      el.textContent = '📚 Loaded: ' + QuestionManager.getBankName();
      el.style.color = '#2ecc71';
    } else {
      el.textContent = 'Please enter the class code before playing.';
      el.style.color = '#9aa0a6';
    }
  }

  // This must run after QUESTION_BANK_TYPE is initialized. The Hub owns the
  // class selection; this game only loads that selected class's category bank.
  loadQuestionBank().then(updateCodeStatus);

  // ===== Procedural western pixel-art character renderer =====
  // 32x32 block grid at 4px per block = 128x128 canvas. Higher detail: shading, seams, brim, cuffs.
  function blk(ctx,gx,gy,gw,gh,color,px){ ctx.fillStyle=color; ctx.fillRect(Math.round(gx*px),Math.round(gy*px),Math.round(gw*px),Math.round(gh*px)); }
  function shadeColor(hex, percent) {
    const num = parseInt(hex.slice(1),16);
    let r = (num>>16) + Math.round(255*percent);
    let g = ((num>>8)&0xff) + Math.round(255*percent);
    let b = (num&0xff) + Math.round(255*percent);
    r=Math.max(0,Math.min(255,r)); g=Math.max(0,Math.min(255,g)); b=Math.max(0,Math.min(255,b));
    return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
  }

  function drawWestern(ctx, opts) {
    const px = 4;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,128,128);
    if (opts.glowColor) {
      const g = ctx.createRadialGradient(64,64,10,64,64,64);
      g.addColorStop(0, opts.glowColor); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
    }
    ctx.save();
    ctx.globalAlpha = opts.alpha != null ? opts.alpha : 1;

    // Wings (drawn behind body) for scavenger-type characters
    if (opts.wings) {
      ctx.fillStyle = opts.wingColor || '#2b2b2b';
      ctx.beginPath(); ctx.moveTo(10*px,15*px); ctx.lineTo(0,9*px); ctx.lineTo(3*px,21*px); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(22*px,15*px); ctx.lineTo(32*px,9*px); ctx.lineTo(29*px,21*px); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shadeColor(opts.wingColor || '#2b2b2b', -0.15);
      ctx.beginPath(); ctx.moveTo(10*px,17*px); ctx.lineTo(2*px,13*px); ctx.lineTo(4*px,20*px); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(22*px,17*px); ctx.lineTo(30*px,13*px); ctx.lineTo(28*px,20*px); ctx.closePath(); ctx.fill();
    }

    if (opts.dress) {
      // Long coat/dress covering torso + legs as one silhouette
      blk(ctx,9,12,14,17,opts.shirt,px);
      blk(ctx,9,12,2,17,opts.shirtAccent,px);
      blk(ctx,21,12,2,17,opts.shirtAccent,px);
      blk(ctx,21,12,2,17,shadeColor(opts.shirtAccent,-0.12),px);
      blk(ctx,6,13,4,7,opts.shirt,px); // left sleeve
      blk(ctx,22,13,4,7,opts.shirt,px); // right sleeve
      blk(ctx,6,19,4,1,shadeColor(opts.shirt,0.15),px); // cuff highlight
      blk(ctx,22,19,4,1,shadeColor(opts.shirt,0.15),px);
      blk(ctx,12,28,3,2,opts.boot,px);
      blk(ctx,18,28,3,2,opts.boot,px);
    } else {
      // Torso
      blk(ctx,10,12,12,8,opts.shirt,px);
      blk(ctx,20,12,2,8,shadeColor(opts.shirt,-0.15),px); // right-side shading
      blk(ctx,10,12,2,8,opts.shirtAccent,px);
      blk(ctx,21,12,1,8,opts.shirtAccent,px);
      // Buttons
      blk(ctx,15,14,1,1,'#d4af37',px); blk(ctx,15,16.5,1,1,'#d4af37',px); blk(ctx,15,19,1,1,'#d4af37',px);
      // Arms
      blk(ctx,6,13,4,7,opts.shirt,px);
      blk(ctx,22,13,4,7,opts.shirt,px);
      blk(ctx,6,19,4,1,shadeColor(opts.shirt,0.15),px);
      blk(ctx,22,19,4,1,shadeColor(opts.shirt,0.15),px);
      if (opts.armor) {
        blk(ctx,10,12,12,3,opts.armorColor,px);
        blk(ctx,10,12,2,3,shadeColor(opts.armorColor,-0.2),px);
        blk(ctx,20,12,2,3,shadeColor(opts.armorColor,-0.2),px);
        blk(ctx,13.5,13,1,1,'#5c6570',px); blk(ctx,17.5,13,1,1,'#5c6570',px);
      }
      // Belt + legs
      blk(ctx,10,20,12,2,opts.boot,px);
      blk(ctx,15,20.3,2,1.4,'#d4af37',px);
      blk(ctx,10,22,5,8,opts.pants,px);
      blk(ctx,17,22,5,8,opts.pants,px);
      blk(ctx,12.3,22,0.5,8,shadeColor(opts.pants,-0.15),px);
      blk(ctx,19.3,22,0.5,8,shadeColor(opts.pants,-0.15),px);
      blk(ctx,9,30,6,2,opts.boot,px);
      blk(ctx,17,30,6,2,opts.boot,px);
      blk(ctx,9,31.3,6,0.7,shadeColor(opts.boot,-0.2),px);
      blk(ctx,17,31.3,6,0.7,shadeColor(opts.boot,-0.2),px);
    }

    // Head
    blk(ctx,12,6,8,6,opts.skin,px);
    blk(ctx,18,6,2,6,shadeColor(opts.skin,-0.12),px); // face shading
    if (opts.maskColor) {
      blk(ctx,12,10,8,2,opts.maskColor,px);
      blk(ctx,19,9,2,2,opts.maskColor,px); // bandana knot
    }
    // Eyes / eyebrows
    if (!opts.maskColor) {
      blk(ctx,13.2,7,2,0.6,shadeColor(opts.skin,-0.3),px);
      blk(ctx,16.8,7,2,0.6,shadeColor(opts.skin,-0.3),px);
      blk(ctx,13.5,7.8,1.4,1.2,opts.eyeColor||'#241505',px);
      blk(ctx,17,7.8,1.4,1.2,opts.eyeColor||'#241505',px);
    } else if (opts.eyeColor) {
      blk(ctx,13.5,7.8,1.4,1.2,opts.eyeColor,px);
      blk(ctx,17,7.8,1.4,1.2,opts.eyeColor,px);
    }

    // Hat / hood / hair
    if (opts.hatColor) {
      blk(ctx,10,0,12,4,opts.hatColor,px);
      blk(ctx,11,4,10,1,shadeColor(opts.hatColor,0.15),px);
      blk(ctx,6,5,20,1,opts.hatColor,px);
      blk(ctx,7,6,18,1,shadeColor(opts.hatColor,-0.2),px);
    }
    // Boss crest: a colored sash on the hat band, marking this sprite as a boss
    if (opts.crest) {
      blk(ctx,13,5,6,1,opts.crest,px);
      blk(ctx,15,4.2,2,0.8,opts.crest,px);
    }

    // Badge
    if (opts.badge) {
      blk(ctx,14.5,13,3,3,'#d4af37',px);
      blk(ctx,15.3,13.8,1.4,1.4,'#fff4c2',px);
    }

    // Hand item
    const item = opts.handItem;
    if (item === 'gun') { blk(ctx,26,14,4,2,'#2b2b2b',px); blk(ctx,26,14,4,0.6,'#4a4a4a',px); }
    if (item === 'guns') { blk(ctx,26,14,4,2,'#2b2b2b',px); blk(ctx,2,14,4,2,'#2b2b2b',px); }
    if (item === 'dynamite') { blk(ctx,26,10,2,6,'#c0392b',px); blk(ctx,26.6,10,0.8,6,'#8e2318',px); blk(ctx,26,9,2,1,'#f5c842',px); }
    if (item === 'pan') { blk(ctx,24,14,6,4,'#d4af37',px); blk(ctx,25,15,4,2,'#b8860b',px); blk(ctx,26,15.5,1,1,'#fff4c2',px); }
    if (item === 'basket') { blk(ctx,24,16,4,4,'#8b5e34',px); blk(ctx,25,14.5,2,1.5,'#6a4224',px); }
    if (item === 'cards') { blk(ctx,25,13,4,6,'#f2f2f2',px); blk(ctx,26,13,1,6,'#d94a4a',px); blk(ctx,26.5,15.5,1,1,'#d94a4a',px); }
    if (item === 'book') { blk(ctx,24,15,4,3.5,'#1a1a1a',px); blk(ctx,25.7,15.3,0.6,2.9,'#d4af37',px); blk(ctx,24.7,16.5,2.6,0.6,'#d4af37',px); }
    if (item === 'medbag') { blk(ctx,24,15,5,4,'#8b5e34',px); blk(ctx,25.8,15.7,0.6,2.6,'#e74c3c',px); blk(ctx,24.7,16.7,2.6,0.6,'#e74c3c',px); }

    ctx.restore();
  }

  function drawBandit(ctx){ drawWestern(ctx,{hatColor:'#1a1a1a',skin:'#c9915f',shirt:'#7a1f1f',shirtAccent:'#5c1717',pants:'#2b3a67',boot:'#3d2200',maskColor:'#5c3a21',handItem:'gun'}); }
  function drawGunslinger(ctx){ drawWestern(ctx,{hatColor:'#111111',skin:'#c9915f',shirt:'#b5651d',shirtAccent:'#8c4a12',pants:'#333333',boot:'#1a1a1a',maskColor:'#8b0000',handItem:'guns'}); }
  function drawArmored(ctx){ drawWestern(ctx,{hatColor:'#555555',skin:'#c9915f',shirt:'#6a1f1f',shirtAccent:'#4a1515',pants:'#2b3a67',boot:'#3d2200',maskColor:'#3d2200',handItem:'gun',armor:true,armorColor:'#b0b8c0'}); }
  function drawDynamiteBandit(ctx){ drawWestern(ctx,{hatColor:'#3d2200',skin:'#c9915f',shirt:'#4a2c0a',shirtAccent:'#33200a',pants:'#2b2b2b',boot:'#1a1a1a',maskColor:'#1a1a1a',handItem:'dynamite'}); }
  function drawGhostRider(ctx){ drawWestern(ctx,{hatColor:'#dfefff',skin:'#dfefff',shirt:'#cfe8ff',shirtAccent:'#b8dcff',pants:'#cfe8ff',boot:'#b8dcff',maskColor:null,eyeColor:'#00d4ff',handItem:'gun',alpha:0.5,glowColor:'rgba(0,212,255,0.35)'}); }
  function drawProspector(ctx){ drawWestern(ctx,{hatColor:'#8b5e34',skin:'#c9915f',shirt:'#c9a227',shirtAccent:'#a5811d',pants:'#5c3a21',boot:'#3d2200',maskColor:null,handItem:'pan',glowColor:'rgba(212,175,55,0.35)'}); }
  function drawVulture(ctx){ drawWestern(ctx,{hatColor:'#2b2b2b',skin:'#8a7f6a',shirt:'#3a3a3a',shirtAccent:'#232323',pants:'#1c1c1c',boot:'#111111',maskColor:'#232323',eyeColor:'#f5c842',handItem:null,wings:true,wingColor:'#2b2b2b',glowColor:'rgba(46,204,113,0.15)'}); }
  function drawCardShark(ctx){ drawWestern(ctx,{hatColor:'#0f3d2e',skin:'#c9915f',shirt:'#145c3f',shirtAccent:'#0d3f2b',pants:'#1a1a1a',boot:'#1a1a1a',maskColor:null,handItem:'cards',glowColor:'rgba(46,204,113,0.2)'}); }
  function drawSheriff(ctx){ drawWestern(ctx,{hatColor:'#c9a227',skin:'#c9915f',shirt:'#274b8f',shirtAccent:'#1c3a70',pants:'#22335c',boot:'#3d2200',maskColor:null,badge:true,handItem:null}); }
  function drawGranny(ctx){ drawWestern(ctx,{hatColor:'#d9d9d9',skin:'#e0b090',shirt:'#8e44ad',shirtAccent:'#6c3483',boot:'#3d2200',maskColor:null,dress:true,handItem:'basket'}); }
  function drawPreacher(ctx){ drawWestern(ctx,{hatColor:'#161616',skin:'#c9915f',shirt:'#161616',shirtAccent:'#0c0c0c',boot:'#0c0c0c',maskColor:null,dress:true,handItem:'book'}); }
  function drawDoc(ctx){ drawWestern(ctx,{hatColor:'#8a8f94',skin:'#c9915f',shirt:'#e6e2d3',shirtAccent:'#c9c4b0',boot:'#3d2200',maskColor:null,dress:true,handItem:'medbag'}); }
  function drawMayor(ctx){drawWestern(ctx,{hatColor:'#6b2138',skin:'#c9915f',shirt:'#7b2947',shirtAccent:'#e2bf72',pants:'#2a2340',boot:'#28160a',maskColor:null,badge:true,handItem:'book'});}
  function drawTeacher(ctx){drawWestern(ctx,{hatColor:'#38576b',skin:'#d5a477',shirt:'#47758c',shirtAccent:'#d9edf2',pants:'#313b4d',boot:'#2b1b12',maskColor:null,handItem:'book'});}
  function drawNurse(ctx){drawWestern(ctx,{hatColor:'#f1eee5',skin:'#c9915f',shirt:'#e9e5dc',shirtAccent:'#d44b4b',boot:'#4b3025',maskColor:null,dress:true,handItem:'medbag'});}
  function drawBlacksmith(ctx){drawWestern(ctx,{hatColor:'#352d29',skin:'#9f6a45',shirt:'#5c4539',shirtAccent:'#b06c3c',pants:'#252525',boot:'#17120f',maskColor:null,handItem:'pan'});}

  // Bosses: 5 distinct sprites, each with its own crest color and a matching attack pattern
  function drawBossIronVest(ctx){ drawWestern(ctx,{hatColor:'#3a3f47',skin:'#c9915f',shirt:'#232323',shirtAccent:'#141414',pants:'#1c1c1c',boot:'#0c0c0c',maskColor:'#141414',handItem:'gun',armor:true,armorColor:'#d8dee3',crest:'#ff8fa8'}); }
  function drawBossPhantom(ctx){ drawWestern(ctx,{hatColor:'#e9d8ff',skin:'#e9d8ff',shirt:'#d8c2ff',shirtAccent:'#c2a8f0',pants:'#d8c2ff',boot:'#c2a8f0',maskColor:null,eyeColor:'#a855f7',handItem:'gun',alpha:0.55,glowColor:'rgba(168,85,247,0.35)',crest:'#a855f7'}); }
  function drawBossBoomBaron(ctx){ drawWestern(ctx,{hatColor:'#1a0a0a',skin:'#c9915f',shirt:'#7a2510',shirtAccent:'#4a1608',pants:'#2b2b2b',boot:'#0c0c0c',maskColor:'#1a1a1a',handItem:'dynamite',glowColor:'rgba(255,136,0,0.25)',crest:'#ffb347'}); }
  function drawBossDuchess(ctx){ drawWestern(ctx,{hatColor:'#3d1155',skin:'#c9915f',shirt:'#5c1a75',shirtAccent:'#3d1155',boot:'#1a1a1a',maskColor:null,dress:true,handItem:'cards',glowColor:'rgba(168,85,247,0.2)',crest:'#d4af37'}); }
  function drawBossTalon(ctx){ drawWestern(ctx,{hatColor:'#1c1c1c',skin:'#8a7f6a',shirt:'#2b2b2b',shirtAccent:'#1c1c1c',pants:'#111111',boot:'#0a0a0a',maskColor:'#1c1c1c',eyeColor:'#f5c842',handItem:null,wings:true,wingColor:'#1c1c1c',glowColor:'rgba(46,204,113,0.2)',crest:'#2ecc71'}); }
  function drawBossMapmaker(ctx){drawWestern(ctx,{hatColor:'#705324',skin:'#bc8a5f',shirt:'#173f45',shirtAccent:'#0e272c',pants:'#49351d',boot:'#24170b',maskColor:'#d9bd79',eyeColor:'#65f4e8',handItem:'book',glowColor:'rgba(101,244,232,.3)',crest:'#ffe08a'});ctx.save();ctx.strokeStyle='#ffe08a';ctx.lineWidth=3;ctx.strokeRect(18,18,92,92);ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(28,94);ctx.lineTo(55,60);ctx.lineTo(82,78);ctx.lineTo(103,32);ctx.stroke();ctx.restore();}
  function drawBossMarshal(ctx){drawWestern(ctx,{hatColor:'#d2a62c',skin:'#c9915f',shirt:'#28568c',shirtAccent:'#163a68',pants:'#202d47',boot:'#2a180c',maskColor:null,badge:true,handItem:'gun',armor:true,armorColor:'#e5edf2',crest:'#65d6ff'});}
  function drawBossGuardian(ctx){drawWestern(ctx,{hatColor:'#e6ffff',skin:'#e6ffff',shirt:'#b8f2e8',shirtAccent:'#78d6c6',pants:'#b8f2e8',boot:'#78d6c6',maskColor:null,eyeColor:'#35ffd0',handItem:'gun',alpha:.62,glowColor:'rgba(53,255,208,.35)',crest:'#35ffd0'});}
  function drawBossDeputy(ctx){drawWestern(ctx,{hatColor:'#c78a2c',skin:'#c9915f',shirt:'#315f83',shirtAccent:'#24445d',pants:'#303238',boot:'#22150b',maskColor:null,badge:true,handItem:'dynamite',crest:'#ffd15c'});}
  function drawBossLadyLuck(ctx){drawWestern(ctx,{hatColor:'#f0d46a',skin:'#c9915f',shirt:'#275c4a',shirtAccent:'#173f32',boot:'#26170d',maskColor:null,dress:true,handItem:'cards',glowColor:'rgba(73,255,167,.2)',crest:'#7dff9b'});}
  function drawBossSkywarden(ctx){drawWestern(ctx,{hatColor:'#d8edf2',skin:'#9c8d72',shirt:'#3a6680',shirtAccent:'#244354',pants:'#16252e',boot:'#111820',maskColor:null,eyeColor:'#7de8ff',wings:true,wingColor:'#d8edf2',crest:'#7de8ff'});}

  // Enemies: bandit (redesigned) + 7 unique outlaws, each with its own scoring/behavior
  const ENEMY_TYPES = [
    { id:'bandit', name:'Bandit', score:10, coins:5, hits:1, lifetimeMult:1, weight:32, draw:drawBandit, cssClass:'' },
    { id:'gunslinger', name:'Quick-Draw Gunslinger', score:20, coins:10, hits:1, lifetimeMult:0.55, weight:16, draw:drawGunslinger, cssClass:'urgent', escapePenaltyLives:2 },
    { id:'armored', name:'Armored Outlaw', score:25, coins:8, hits:2, lifetimeMult:1.35, weight:13, draw:drawArmored, cssClass:'' },
    { id:'dynamite', name:'Dynamite Bandit', score:15, coins:5, hits:1, lifetimeMult:1, weight:11, draw:drawDynamiteBandit, cssClass:'', explodes:true },
    { id:'ghost', name:'Ghost Rider', score:30, coins:10, hits:1, lifetimeMult:1.7, weight:8, draw:drawGhostRider, cssClass:'ghost-fade', teleports:true, teleportSpeed:750 },
    { id:'prospector', name:'Gold Rush Bandit', score:8, coins:20, hits:1, lifetimeMult:1, weight:9, draw:drawProspector, cssClass:'gold-glow' },
    { id:'vulture', name:'Vulture Scout', score:12, coins:6, hits:1, lifetimeMult:0.8, weight:8, draw:drawVulture, cssClass:'', teleports:true, teleportSpeed:380, refundsAmmo:true },
    { id:'cardshark', name:'Card Shark', score:18, coins:8, hits:1, lifetimeMult:1.5, weight:8, draw:drawCardShark, cssClass:'', drainsCoins:true }
  ];
  const TOTAL_ENEMY_WEIGHT = ENEMY_TYPES.reduce((s,t)=>s+t.weight,0);

  // Non-enemy townsfolk: shooting these HURTS the player
  const DECOY_TYPES = [
    { id:'sheriff', name:'Sheriff', draw:drawSheriff, penaltyScore:15, penaltyLives:1, warning:"Don't shoot the Sheriff!" },
    { id:'granny', name:'Granny Mabel', draw:drawGranny, penaltyScore:15, penaltyLives:1, warning:"That's an innocent townsfolk!" },
    { id:'preacher', name:'The Preacher', draw:drawPreacher, penaltyScore:20, penaltyLives:1, warning:"Don't shoot the Preacher!" },
    { id:'doc', name:'The Doctor', draw:drawDoc, penaltyScore:15, penaltyLives:1, warning:"That's the town doctor!", healOnEscape:true },
    { id:'mayor', name:'Mayor Bell', draw:drawMayor, penaltyScore:20, penaltyLives:1, warning:"That's the mayor!" },
    { id:'teacher', name:'Schoolteacher Ada', draw:drawTeacher, penaltyScore:15, penaltyLives:1, warning:"That's the schoolteacher!" },
    { id:'nurse', name:'Nurse Clara', draw:drawNurse, penaltyScore:15, penaltyLives:1, warning:"That's the town nurse!" },
    { id:'blacksmith', name:'Blacksmith Boone', draw:drawBlacksmith, penaltyScore:20, penaltyLives:1, warning:"That's the blacksmith!" }
  ];
  DECOY_TYPES.forEach(t=>{t.score=t.score||15;t.coins=t.coins||6;t.hits=1;t.lifetimeMult=t.lifetimeMult||1;t.cssClass=t.cssClass||'';});
  const BASIC_DECOY_TYPES=DECOY_TYPES.slice(0,4);
  const DECOY_CHANCE = 0.18; // ~18% of spawns are a non-enemy you must avoid

  const ENEMY_TIPS = {
    gunslinger: 'Quick-Draw Gunslingers move fast — prioritize them the moment they appear.',
    ghost: 'Ghost Riders teleport unpredictably — keep your eyes moving across the whole screen.',
    vulture: 'Vulture Scouts teleport too, but shooting them refunds ammo — worth the chase.',
    armored: 'Armored Outlaws take two hits — commit and follow through instead of hesitating.',
    dynamite: "Dynamite Bandits are dangerous if left too long — shoot them fast.",
    cardshark: 'Card Sharks drain your coins the longer they stay on screen — take them out quick.'
  };
  function buildEscapeDeathMessage(type) {
    const tip = ENEMY_TIPS[type.id];
    return `Ran out of lives — a ${type.name} got away! ${tip || 'Watch your surroundings and don\'t let outlaws slip past.'}`;
  }
  function pickEnemyType() {
    let r = Math.random() * TOTAL_ENEMY_WEIGHT;
    for (const t of ENEMY_TYPES) { if (r < t.weight) return t; r -= t.weight; }
    return ENEMY_TYPES[0];
  }

  function showFloatingText(x, y, text, color, area) {
    const el = document.createElement('div');
    el.className = 'floating-penalty';
    el.textContent = text; el.style.color = color;
    el.style.left = (x + 30) + 'px'; el.style.top = (y + 20) + 'px';
    area.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  const STAGE_PALETTES = [
    { skyTop:'#0a0a0a', skyMid:'#1a0a2e', skyBot:'#3d1240', mesa1:'rgba(106,5,114,0.45)', mesa2:'rgba(233,69,96,0.28)', groundTop:'#3a1a48', groundBot:'#150826', groundLine:'#e94560', sand:'rgba(233,69,96,0.15)', cactus:'rgba(46,204,113,0.35)', fence:'#241028', fenceRail:'#3a1a48', sunCore:'#e9c05a', sunGlow:'#ffe6a8' },
    { skyTop:'#04060f', skyMid:'#0a1a3d', skyBot:'#123d5c', mesa1:'rgba(0,80,120,0.5)', mesa2:'rgba(0,150,180,0.25)', groundTop:'#0e2a44', groundBot:'#081420', groundLine:'#00d4ff', sand:'rgba(0,212,255,0.14)', cactus:'rgba(0,150,120,0.3)', fence:'#0a1420', fenceRail:'#0e2a44', sunCore:'#dfefff', sunGlow:'#8fd8ff' },
    { skyTop:'#0a0505', skyMid:'#2a0a0a', skyBot:'#4a1010', mesa1:'rgba(140,20,20,0.45)', mesa2:'rgba(200,80,20,0.28)', groundTop:'#3a1010', groundBot:'#150505', groundLine:'#ff6b3d', sand:'rgba(255,107,61,0.15)', cactus:'rgba(120,60,20,0.35)', fence:'#1a0a0a', fenceRail:'#3a1010', sunCore:'#ffb347', sunGlow:'#ff8844' }
  ];

  function drawBackground(stageNum) {
    const pal = STAGE_PALETTES[((stageNum||1)-1) % STAGE_PALETTES.length];
    const canvas=document.getElementById('bg-canvas');
    const w=canvas.parentElement.clientWidth, h=canvas.parentElement.clientHeight;
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    const vpX=w*.5,vpY=Math.max(8,h*TOWN_VANISHING_POINT_Y),horizon=vpY;
    // The horizon runs horizontally through the vanishing point. Sky exists
    // only above that line; desert sand fills everything below it.
    const sky=ctx.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,TOWN_SKY_TOP);sky.addColorStop(1,TOWN_SKY_HORIZON);ctx.fillStyle=sky;ctx.fillRect(0,0,w,horizon);
    ctx.fillStyle=TOWN_SAND_COLOUR;ctx.fillRect(0,horizon,w,h-horizon);
    // Sand and clay road use one LINEAR depth clock. Nothing squares/eases this
    // value, so buildings, cross-lines and bumps move toward the player steadily.
    const phase=(townTravelSeconds()*TOWN_MOVEMENT_SPEED)%1;
    const project=d=>({y:vpY+(h-vpY)*d,half:w*TOWN_ROAD_NEAR_HALF_WIDTH*d});
    const roadNearHalf=w*TOWN_ROAD_NEAR_HALF_WIDTH;
    ctx.fillStyle=TOWN_ROAD_COLOUR;ctx.beginPath();ctx.moveTo(vpX,vpY);ctx.lineTo(vpX+roadNearHalf,h);ctx.lineTo(vpX-roadNearHalf,h);ctx.closePath();ctx.fill();
    // Minor clay ruts, stones and bumps grow with depth and travel on the road.
    for(let i=0;i<TOWN_ROAD_MARK_COUNT;i++){
      const d=(i/TOWN_ROAD_MARK_COUNT+phase)%1,p=project(d),lane=(((i*47)%101)/100*1.7-.85),x=vpX+lane*p.half;
      ctx.fillStyle=i%3?TOWN_ROAD_DARK:TOWN_SAND_HIGHLIGHT;ctx.globalAlpha=.18+.42*d;
      ctx.beginPath();ctx.ellipse(x,p.y,Math.max(1,d*(3+i%5)),Math.max(.5,d*(1.2+i%3)),(i%7-3)*.12,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;ctx.strokeStyle=TOWN_SAND_HIGHLIGHT;
    for(let i=0;i<TOWN_ROAD_LINE_COUNT;i++){const d=(i/TOWN_ROAD_LINE_COUNT+phase)%1,p=project(d);ctx.globalAlpha=.12+.5*d;ctx.lineWidth=Math.max(1,2.5*d);ctx.beginPath();ctx.moveTo(vpX-p.half,p.y);ctx.lineTo(vpX+p.half,p.y);ctx.stroke();}
    ctx.globalAlpha=1;
    const haunted=wordslingerCosmetic('wild-west-wordslinger_ghost_town_legend');
    const poly=(pts,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let n=1;n<pts.length;n++)ctx.lineTo(pts[n].x,pts[n].y);ctx.closePath();ctx.fill();};
    for(const side of [-1,1]){
      // Painter's order: distant boxes first, nearest front walls last.
      const houseSlots=TOWN_HOUSE_OFFSETS[String(side)].map((offset,i)=>({i,frontD:(offset+phase)%1})).filter(v=>v.frontD>=TOWN_HOUSE_DEPTH*.35).sort((a,b)=>a.frontD-b.frontD);
      for(const {i,frontD} of houseSlots){
      // Perspective thickness: TOWN_HOUSE_DEPTH is the full near-camera length;
      // distant buildings receive proportionally less depth and look thinner.
      const typeIndex=TOWN_HOUSE_SELECTIONS[String(side)][i],houseType=TOWN_HOUSE_TYPES[typeIndex],variant=typeIndex%6,sizeScale=frontD*TOWN_NEAR_HOUSE_SCALE;
      const projectedHouseDepth=TOWN_HOUSE_DEPTH*frontD*TOWN_HOUSE_LENGTH_VARIANCE[typeIndex]*TOWN_NEAR_HOUSE_SCALE,backD=Math.max(.002,frontD-projectedHouseDepth),front=project(frontD),back=project(backD);
      const widthMult=[.92,1.04,.96,1.1,.88,1.07][variant],frontW=w*TOWN_HOUSE_WIDTH*sizeScale*widthMult;
      const frontH=Math.min(h,12+h*TOWN_NEAR_WALL_HEIGHT*frontD*TOWN_HOUSE_HEIGHT_VARIANCE[typeIndex]*TOWN_NEAR_HOUSE_SCALE);
      // Inner walls sit exactly on the road edge; all building width extends
      // outward, so no house face overlaps the clay street.
      const FI={x:vpX+side*front.half,y:front.y},FO={x:vpX+side*(front.half+frontW),y:front.y},BI={x:vpX+side*back.half,y:back.y};
      const FIT={x:FI.x,y:Math.max(0,FI.y-frontH)},FOT={x:FO.x,y:Math.max(0,FO.y-frontH)},depthRatio=backD/frontD;
      // Both upper (roof-line) corners sit directly on rays running from their
      // near corners to the single vanishing point.
      const BIT={x:vpX+(FIT.x-vpX)*depthRatio,y:vpY+(FIT.y-vpY)*depthRatio};
      // Roofless rectangular cuboid: only the street-facing side and near/front
      // wall are visible. The rear wall is deliberately never painted.
      poly([BI,FI,FIT,BIT],haunted?'#172534':houseType.wall);
      poly([FI,FO,FOT,FIT],haunted?'#253642':houseType.front);
      ctx.strokeStyle=haunted?'rgba(170,235,235,.35)':'rgba(49,26,16,.7)';ctx.lineWidth=Math.max(1,frontD*3);ctx.beginPath();ctx.moveTo(BIT.x,BIT.y);ctx.lineTo(FIT.x,FIT.y);ctx.stroke();
      // Windows and doors belong only on the long wall facing the street. Each
      // detail is a projected quad, so its upper/lower edges share the wall's
      // vanishing-point slope instead of appearing as flat screen rectangles.
      const sidePoint=(u,v)=>{const bx=BI.x+(FI.x-BI.x)*u,by=BI.y+(FI.y-BI.y)*u,tx=BIT.x+(FIT.x-BIT.x)*u,ty=BIT.y+(FIT.y-BIT.y)*u;return{x:bx+(tx-bx)*v,y:by+(ty-by)*v};};
      const sideQuad=(u0,u1,v0,v1,color)=>poly([sidePoint(u0,v0),sidePoint(u1,v0),sidePoint(u1,v1),sidePoint(u0,v1)],color);
      const frontPoint=(u,v)=>({x:FI.x+(FO.x-FI.x)*u,y:FI.y+(FIT.y-FI.y)*v});
      const frontQuad=(u0,u1,v0,v1,color)=>poly([frontPoint(u0,v0),frontPoint(u1,v0),frontPoint(u1,v1),frontPoint(u0,v1)],color);
      const windowColor=haunted?'rgba(160,255,230,.48)':houseType.detail,doorColor=haunted?'#08141b':'#2d1c16';
      // Siding, base trim and corner posts.
      for(let v=.14;v<.92;v+=.12)sideQuad(.02,.98,v,v+.018,haunted?'rgba(150,220,220,.16)':'rgba(43,24,15,.25)');
      sideQuad(.02,.06,.02,.96,houseType.detail);sideQuad(.94,.98,.02,.96,houseType.detail);sideQuad(.02,.98,.04,.09,doorColor);
      if(houseType.layout.startsWith('home')){
        sideQuad(.12,.29,.34,.58,windowColor);sideQuad(.43,.59,.34,.58,windowColor);sideQuad(.72,.93,0,.48,doorColor);
        if(houseType.layout==='home-b'||houseType.layout==='home-d')sideQuad(.08,.66,.66,.75,houseType.detail);
        if(houseType.layout==='home-c')for(const u of [.17,.48])sideQuad(u,u+.035,.34,.58,doorColor);
      }else if(houseType.layout.startsWith('bath')){
        sideQuad(.08,.92,.68,.82,houseType.detail);sideQuad(.14,.3,.31,.56,windowColor);sideQuad(.4,.56,.31,.56,windowColor);sideQuad(.7,.92,0,.5,doorColor);
        for(const u of [.18,.48,.78]){const p=sidePoint(u,.9);ctx.fillStyle=haunted?'#b8ffff':'rgba(235,245,240,.7)';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,frontD*5),0,Math.PI*2);ctx.fill();}
      }else if(houseType.layout==='armory'){
        sideQuad(.08,.92,.68,.84,'#252b30');sideQuad(.14,.3,.3,.54,'#aab4bc');sideQuad(.68,.93,0,.56,'#24282c');
        for(const u of [.2,.25,.76,.82])sideQuad(u,u+.025,.18,.62,houseType.detail);sideQuad(.38,.62,.4,.48,'#c18b43');
      }else if(houseType.layout==='jail'){
        sideQuad(.08,.92,.68,.84,'#2b2927');sideQuad(.12,.36,.3,.58,'#171717');sideQuad(.48,.71,.3,.58,'#171717');sideQuad(.76,.95,0,.58,doorColor);
        for(const base of [.13,.49,.8])for(let k=0;k<4;k++)sideQuad(base+k*.05,base+k*.05+.012,.28,.61,houseType.detail);
      }else{
        sideQuad(.06,.94,.62,.76,houseType.detail);for(let k=0;k<5;k++)sideQuad(.08+k*.17,.08+k*.17+.085,.5,.62,k%2?houseType.front:windowColor);
        sideQuad(.12,.31,.23,.48,windowColor);sideQuad(.39,.58,.23,.48,windowColor);sideQuad(.72,.94,0,.5,doorColor);
        if(houseType.layout==='store-b'){sideQuad(.08,.62,.1,.17,'#51331f');sideQuad(.1,.2,.17,.27,'#b9813e');sideQuad(.26,.36,.17,.27,'#8e5e31');sideQuad(.42,.52,.17,.27,'#c49a54');}
      }
      // Stable, randomly combined detail sets decorate the broad wall facing
      // the player. They are regenerated only on a new page load, not per frame.
      const face=TOWN_HOUSE_FACE_DETAILS[String(side)][i];
      for(let v=.16;v<.9;v+=.14)frontQuad(.025,.975,v,v+.018,haunted?'rgba(150,220,220,.13)':'rgba(45,25,16,.22)');
      frontQuad(.025,.06,.03,.96,houseType.detail);frontQuad(.94,.975,.03,.96,houseType.detail);
      if(face.sign){frontQuad(.2,.8,.68,.84,haunted?'#537378':houseType.detail);frontQuad(.24,.76,.715,.755,haunted?'#172b32':'#68401f');}
      if(face.poster){frontQuad(.13,.35,.28,.53,'#d8b46f');frontQuad(.17,.31,.34,.37,'#714623');frontQuad(.19,.29,.42,.45,'#714623');}
      if(face.lantern){frontQuad(.72,.78,.42,.64,'#261a16');frontQuad(.68,.82,.34,.46,haunted?'#8dfff0':'#ffc857');frontQuad(.7,.8,.31,.34,'#2b211b');}
      if(face.crates){frontQuad(.54,.78,.04,.22,'#74451f');frontQuad(.6,.87,.22,.4,'#8b5728');frontQuad(.56,.76,.08,.1,'#d1954b');frontQuad(.64,.84,.27,.29,'#d1954b');}
      if(face.planks){
        ctx.strokeStyle=haunted?'#78969a':'#4f2e1a';ctx.lineWidth=Math.max(2,frontD*5);
        const a=frontPoint(.38,.18),b=frontPoint(.88,.62),c=frontPoint(.88,.18),d=frontPoint(.38,.62);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.moveTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.stroke();
      }
      }
    }
    // Texture speckles
    ctx.fillStyle=pal.sand;
    for (let i=0;i<40;i++){ const sx=(i*97)%w, sy=horizon+((i*53)%(h-horizon)); ctx.fillRect(sx,sy,3,1); }
    // Cacti silhouettes
    function cactus(cx, baseY, scale) {
      ctx.fillStyle=pal.cactus;
      ctx.fillRect(cx-4*scale, baseY-40*scale, 8*scale, 40*scale);
      ctx.fillRect(cx-16*scale, baseY-26*scale, 8*scale, 6*scale);
      ctx.fillRect(cx-16*scale, baseY-32*scale, 6*scale, 14*scale);
      ctx.fillRect(cx+8*scale, baseY-20*scale, 8*scale, 6*scale);
      ctx.fillRect(cx+10*scale, baseY-26*scale, 6*scale, 14*scale);
    }
    cactus(w*0.06, horizon+30, 0.7);
    cactus(w*0.95, horizon+42, 0.8);
    if(wordslingerCosmetic('wild-west-wordslinger_cavern_prospector')){
      const cave=ctx.createLinearGradient(0,0,0,h);cave.addColorStop(0,'rgba(5,12,28,.68)');cave.addColorStop(1,'rgba(18,40,48,.74)');ctx.fillStyle=cave;ctx.fillRect(0,0,w,h);ctx.fillStyle='#17263c';
      for(let x=0;x<w;x+=70){const d=35+(x*17%90);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+35,d);ctx.lineTo(x+70,0);ctx.fill();ctx.beginPath();ctx.moveTo(x,h);ctx.lineTo(x+35,h-d*.7);ctx.lineTo(x+70,h);ctx.fill();}
      for(let i=0;i<18;i++){const x=(i*149)%w,y=60+(i*83)%(h-120);ctx.fillStyle=i%2?'#23e4ff':'#9d5cff';ctx.beginPath();ctx.moveTo(x,y-15);ctx.lineTo(x+8,y);ctx.lineTo(x,y+15);ctx.lineTo(x-8,y);ctx.fill();}
    }
    if(wordslingerCosmetic('wild-west-wordslinger_ghost_town_legend')){
      ctx.fillStyle='rgba(7,8,20,.5)';ctx.fillRect(0,0,w,h);
      ctx.fillStyle='rgba(220,255,245,.2)';for(let i=0;i<20;i++){const x=(i*97+townTravelSeconds()*18)%w,y=50+(i*47)%(h-100);ctx.beginPath();ctx.arc(x,y,8,Math.PI,0);ctx.lineTo(x+8,y+16);ctx.lineTo(x,y+11);ctx.lineTo(x-8,y+16);ctx.closePath();ctx.fill();}
    }
  }

  function drawAlienOutlaw(ctx){
    ctx.save();ctx.translate(64,64);ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(-34,45,68,8);ctx.fillStyle='#24162f';ctx.fillRect(-29,12,58,34);ctx.fillStyle='#553064';ctx.fillRect(-24,17,48,25);ctx.fillStyle='#9b6336';ctx.fillRect(-32,9,12,28);ctx.fillRect(20,9,12,28);ctx.fillStyle='#df9a4e';ctx.fillRect(-29,12,6,20);ctx.fillRect(23,12,6,20);
    ctx.fillStyle='#59bb55';ctx.fillRect(-24,-28,48,38);ctx.fillRect(-19,-35,38,8);ctx.fillStyle='#77ef72';ctx.fillRect(-19,-25,38,29);ctx.fillStyle='#397d40';ctx.fillRect(-24,-15,5,18);ctx.fillRect(19,-15,5,18);
    ctx.fillStyle='#10151d';ctx.fillRect(-16,-19,12,15);ctx.fillRect(4,-19,12,15);ctx.fillStyle='#d9ffff';ctx.fillRect(-13,-17,4,6);ctx.fillRect(7,-17,4,6);ctx.fillStyle='#263a31';ctx.fillRect(-5,1,10,3);
    ctx.fillStyle='#70401f';ctx.fillRect(-34,-39,68,7);ctx.fillRect(-20,-53,40,15);ctx.fillStyle='#b87538';ctx.fillRect(-17,-50,34,9);ctx.fillStyle='#ffd15c';ctx.fillRect(-9,20,18,18);ctx.fillStyle='#6a431d';ctx.fillRect(-5,24,10,10);ctx.fillStyle='#d8edf2';ctx.fillRect(29,24,18,6);ctx.fillStyle='#46545d';ctx.fillRect(35,30,9,7);ctx.fillStyle='#ff445f';ctx.fillRect(-3,-32,6,3);ctx.restore();
  }
  setInterval(()=>{if(document.getElementById('game-screen')?.classList.contains('active'))drawBackground(stage);},80);

  function startGame() {
    if (!QuestionManager.hasQuestions()) {
      const statusEl = document.getElementById('code-status');
      if (statusEl) { statusEl.textContent = '⚠️ Please enter the class code before playing.'; statusEl.style.color = '#e74c3c'; }
      showScreen('home-screen');
      return;
    }
    killCount=0; overallScore=0; sessionCoins=0; lives=3+livesLevel;
    maxAmmo=5+bulletLevel+achievementAmmoBonus(); ammo=maxAmmo; gameActive=false; reloadOpen=false; gameOverReason='';
    comboStreak=0;
    // Reset the roguelike run layer: upgrade cards, curse flags, duel/boss-stage
    // flags, and any leftover timers/free-shot counters all reset every run.
    runUpgrades={}; kevlarUsedThisStage=false; secondWindUsed=false;
    duelActive=false; duelUsedThisStage=false; freeShotsRemaining=0;
    if (deadManHandTimer) { clearInterval(deadManHandTimer); deadManHandTimer=null; }
    if (!platformSessionStarted) {
      PlatformManager.startSession(GAME_CONFIG.id);
      QuestionManager.beginMixedRun();
      platformSessionStarted = true;
    }
    runScoreMult=1; runCoinMult=1; runSpawnRateMult=1; runPerformance=0;
    activePowerupsThisRun=PlatformManager.powerupsAllowed()?[...equippedPowerups]:[];
    stage=1; bossActive=false; bossHP=0; bossMaxHP=0; stageStartScore=0;
    resetTownMovement();
    cleanupCurrentBoss();
    clearTimeout(bossIncomingTimer); bossPreviewActive=false;
    document.getElementById('boss-incoming-overlay').classList.add('hidden');
    document.getElementById('upgrade-pick-overlay').classList.add('hidden');
    document.getElementById('duel-overlay').classList.add('hidden');
    clearInterval(bossWordInterval);
    rollModifier();
    updateHUD(); showScreen('game-screen');
    const area=document.getElementById('game-area');
    area.querySelectorAll('.enemy-wrap, .falling-word,.western-obstacle,.peek-house-wall').forEach(e=>{ stopTeleport(e); stopDrain(e); if(e._expireTimer) clearTimeout(e._expireTimer); e.remove(); });
    const bw=document.getElementById('boss-wrap'); if(bw) bw.remove();
    const bh=document.getElementById('boss-health-bar-wrap'); if(bh) bh.remove();
    document.getElementById('reload-overlay').classList.add('hidden');
    setTimeout(()=>drawBackground(stage),50);
    updateCrosshairCursor();
    showModifierBanner(()=>{
      if (activePowerupsThisRun.length > 0) {
        startPowerupAssessment();
      } else {
        startEnemySpawning();
      }
    });
  }

  // ===== Pre-run powerup assessment: 2 quick rounds, accuracy+speed set this run's multipliers =====
  let preRunRoundIndex = 0;
  let preRunScores = [];
  let preRunRoundStart = 0;
  let preRunMistakes = 0;

  function startPowerupAssessment() {
    preRunRoundIndex = 0;
    preRunScores = [];
    showPowerupAssessmentRound();
  }

  // Highlights any not-yet-found correct cells in green (reusing the .selected style)
  // and locks the grid so nothing else can be clicked while the reveal is shown.
  function revealCorrectAnswers(gridEl, correctWords) {
    gridEl.style.pointerEvents = 'none';
    gridEl.querySelectorAll('.word-cell').forEach(cell=>{
      if (correctWords.includes(cell.textContent) && !cell.classList.contains('selected')) {
        cell.classList.add('selected');
      }
    });
  }

  function showPowerupAssessmentRound() {
    preRunMistakes = 0;
    preRunRoundStart = Date.now();
    const cat = QuestionManager.getNextQuestion();
    const roundCorrect=[...cat.correct].sort(()=>Math.random()-.5).slice(0,4);
    document.getElementById('start-question-category').textContent =
      '⚡ Powerup Check ' + (preRunRoundIndex+1) + '/2 — ' + cat.prompt;
    const shuffled=[...cat.distractors].sort(()=>Math.random()-0.5);
    const words=[...roundCorrect,...shuffled.slice(0,12)].sort(()=>Math.random()-0.5);
    const grid=document.getElementById('start-question-grid');grid.innerHTML='';grid.className='grid grid-cols-4 gap-2';grid.style.pointerEvents='';
    let found=0; const requiredCorrect=Math.min(3,roundCorrect.length);
    let wrongCount=0;
    words.slice(0,16).forEach(w=>{
      const cell=document.createElement('button');
      cell.className='word-cell p-2 text-xs text-center rounded font-bold';cell.textContent=w;
      cell.addEventListener('click',()=>{
        if(cell.classList.contains('selected')||cell.classList.contains('wrong'))return;
        if(roundCorrect.includes(w)){
          cell.classList.add('selected');found++;
          if(found>=requiredCorrect){ finishPowerupAssessmentRound(); }
        } else {
          cell.classList.add('wrong'); preRunMistakes++; wrongCount++;
          PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, false);
          PlatformManager.deductCoins(5);
          if(wrongCount>=2){
            revealCorrectAnswers(grid, roundCorrect);
            setTimeout(()=>finishPowerupAssessmentRound(),1000);
          }
        }
      });
      grid.appendChild(cell);
    });
    document.getElementById('start-question-overlay').classList.remove('hidden');
  }

  function finishPowerupAssessmentRound() {
    const timeMs = Date.now() - preRunRoundStart;
    totalCorrectAnswers++; safeSave();
    // Mirrors this game's own totalCorrectAnswers bookkeeping, which counts a
    // completed round here as correct regardless of accuracy within it.
    PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, true);
    const speedScore = Math.max(0.2, Math.min(1, 1 - timeMs/8000));
    const accuracyScore = Math.max(0, 1 - preRunMistakes*0.25);
    preRunScores.push((speedScore + accuracyScore) / 2);
    preRunRoundIndex++;
    if (preRunRoundIndex < 2) {
      setTimeout(showPowerupAssessmentRound, 300);
    } else {
      runPerformance = preRunScores.reduce((a,b)=>a+b,0) / preRunScores.length;
      applyPowerupEffects();
      document.getElementById('start-question-overlay').classList.add('hidden');
      startEnemySpawning();
    }
  }

  function applyPowerupEffects() {
    const p = runPerformance; // 0..1
    if (activePowerupsThisRun.includes('lucky')) {
      runScoreMult *= (1 + p*1.5); // up to 2.5x
    }
    if (activePowerupsThisRun.includes('golden')) {
      runCoinMult *= (1 + p*1.5); // up to 2.5x
    }
    if (activePowerupsThisRun.includes('overdrive')) {
      runSpawnRateMult *= (1 - p*0.4); // faster spawns, down to 0.6x delay
      runCoinMult *= (1 + p*0.8);
      runScoreMult *= (1 + p*0.8);
    }
    // 'stage' powerup is paid out on stage-clear directly using runPerformance, see clearStage()
  }

  function getSpawnDelay() {
    // Progressively increase difficulty: spawn delay decreases as score increases
    // At score 0: 1400ms, at score 500: 700ms, at score 1000+: 400ms
    const baseTier = Math.floor((overallScore / 250) * PlatformManager.getDifficultyRateMultiplier());
    return Math.max(250, Math.round((1400 - baseTier * 100) * runSpawnRateMult));
  }

  function getEnemyLifetime() {
    // Enemies disappear faster as score increases
    // At score 0: 4200ms, at score 500: 3000ms, at score 1000+: 1800ms
    const baseTier = Math.floor((overallScore / 250) * PlatformManager.getDifficultyRateMultiplier());
    return Math.max(1800, 4200 - baseTier * 100);
  }

  async function showStartQuestion() {
    if(QuestionManager.getRunQuestionType()!=='category'&&window.MixedQuestionRound){
      const result=await MixedQuestionRound.play();
      if(result.correct>0){totalCorrectAnswers+=result.correct;safeSave();document.getElementById('start-question-overlay').classList.add('hidden');startEnemySpawning();}
      else setTimeout(showStartQuestion,700);
      return;
    }
    const cat = QuestionManager.getNextQuestion();
    const roundCorrect=[...cat.correct].sort(()=>Math.random()-.5).slice(0,4);
    document.getElementById('start-question-category').textContent=cat.prompt;
    const shuffled=[...cat.distractors].sort(()=>Math.random()-0.5);
    const words=[...roundCorrect,...shuffled.slice(0,12)].sort(()=>Math.random()-0.5);
    const grid=document.getElementById('start-question-grid');grid.innerHTML='';grid.className='grid grid-cols-4 gap-2';
    let found=0; const requiredCorrect=Math.min(4,roundCorrect.length);
    words.slice(0,16).forEach(w=>{
      const cell=document.createElement('button');
      cell.className='word-cell p-2 text-xs text-center rounded font-bold';cell.textContent=w;
      cell.addEventListener('click',()=>{
        if(cell.classList.contains('selected'))return;
        if(roundCorrect.includes(w)){cell.classList.add('selected');found++;if(found>=requiredCorrect){totalCorrectAnswers++;safeSave();PlatformManager.recordQuestionAnswered(GAME_CONFIG.id,true);document.getElementById('start-question-overlay').classList.add('hidden');startEnemySpawning();}}
        else{cell.classList.add('wrong');PlatformManager.recordQuestionAnswered(GAME_CONFIG.id,false);PlatformManager.deductCoins(5);grid.querySelectorAll('.word-cell').forEach(c=>{if(roundCorrect.includes(c.textContent))c.classList.add('correct');});setTimeout(()=>showStartQuestion(),2000);}
      });
      grid.appendChild(cell);
    });
    document.getElementById('start-question-overlay').classList.remove('hidden');
  }

  function startEnemySpawning() {
    // Begin with initial spawn delay
    gameActive = true;
    updateCrosshairCursor();
    spawnInterval = setInterval(spawnEnemy, getSpawnDelay());
  }

  function getComboMultiplier() {
    const rate = 0.1 + comboLevel*0.04;
    const cap = 3 + comboLevel*0.75;
    return Math.min(cap, 1 + comboStreak*rate);
  }

  function updateHUD() {
    if(gameActive)window.ChallengeManager?.update?.({score:overallScore,wave:1+Math.floor(overallScore/100),waveProgress:killCount,alive:lives>0});
    document.getElementById('kill-val').textContent=killCount;
    document.getElementById('score-val').textContent=overallScore;
    document.getElementById('coins-val').textContent=sessionCoins;
    document.getElementById('lives-val').textContent=lives;
    document.getElementById('level-val').textContent=1+Math.floor(overallScore/100);
    document.getElementById('ammo-val').textContent=ammo+'/'+maxAmmo;
    const ad=document.getElementById('ammo-display');ad.innerHTML='';
    for(let i=0;i<maxAmmo;i++){const p=document.createElement('div');p.className='ammo-pip'+(i>=ammo?' empty':'');ad.appendChild(p);}
    const comboBadge=document.getElementById('combo-badge');
    const mult=getComboMultiplier();
    if (comboStreak >= 2) {
      document.getElementById('combo-val').textContent=mult.toFixed(1)+'x';
      comboBadge.classList.remove('hidden');
    } else {
      comboBadge.classList.add('hidden');
    }
  }

  // ---- Pausable per-enemy timers (so reload doesn't make enemies vanish) ----
  function scheduleExpiry(wrap, ms) {
    wrap._expireAt = Date.now() + ms;
    wrap._expireTimer = setTimeout(()=>expireEnemy(wrap), ms);
  }
  function pauseExpiry(wrap) {
    if (wrap._expireTimer) {
      clearTimeout(wrap._expireTimer); wrap._expireTimer=null;
      wrap._remaining = Math.max(300, wrap._expireAt - Date.now());
    }
  }
  function resumeExpiry(wrap) {
    if (wrap._remaining != null) { scheduleExpiry(wrap, wrap._remaining); wrap._remaining=null; }
  }
  function expireEnemy(wrap) {
    wrap._expireTimer = null;
    if (!wrap.parentNode || wrap.dataset.dead) return;
    stopTeleport(wrap); stopDrain(wrap);
    wrap._peekWall?.remove();
    wrap.remove();
    if (!gameActive) return;
    if (wrap.dataset.kind === 'decoy') {
      const dtype = DECOY_TYPES.find(t=>t.id===wrap.dataset.type);
      if (dtype && dtype.healOnEscape && lives < 3+livesLevel) {
        lives = Math.min(3+livesLevel, lives+1);
        updateHUD();
      }
    } else {
      const type = [...ENEMY_TYPES,...DECOY_TYPES].find(t=>t.id===wrap.dataset.type) || ENEMY_TYPES[0];
      let lost = type.escapePenaltyLives || 1;
      if (runModifier && runModifier.escapePenaltyMult) lost *= runModifier.escapePenaltyMult;
      loseLife(lost, document.getElementById('game-area'), parseInt(wrap.style.left)||null, parseInt(wrap.style.top)||null, buildEscapeDeathMessage(type));
    }
  }
  function startTeleport(wrap, areaW, areaH, intervalMs) {
    if(wrap.classList.contains('house-peek'))return;
    wrap._teleportSpeed = intervalMs;
    wrap.classList.add('ghost-glide');
    wrap._teleportTimer = setInterval(()=>{
      if (!wrap.parentNode || wrap.dataset.dead) { stopTeleport(wrap); return; }
      const vpX=areaW*.5,vpY=Math.max(8,areaH*TOWN_VANISHING_POINT_Y),depth=.3+Math.random()*.62,half=areaW*TOWN_ROAD_NEAR_HALF_WIDTH*depth,scale=actorScaleAtDepth(areaH,depth);
      wrap.style.animation='none';wrap.style.transform=`scale(${scale})`;
      wrap.style.left=Math.max(0,Math.min(areaW-128,vpX+(Math.random()*1.6-.8)*half-64))+'px';
      wrap.style.top=(vpY+(areaH-vpY)*depth-128)+'px';
    }, intervalMs);
  }
  function startVulturePatrol(wrap,areaW,areaH,intervalMs){
    if(wrap.classList.contains('house-peek'))return;
    wrap.classList.add('ghost-glide');let horizontal=Math.random()<.5;
    wrap._teleportTimer=setInterval(()=>{
      if(!wrap.parentNode||wrap.dataset.dead){stopTeleport(wrap);return;}
      const currentLeft=parseFloat(wrap.style.left)||0,currentTop=parseFloat(wrap.style.top)||0;
      const depth=Math.max(.1,Math.min(1,(currentTop+128)/areaH));wrap.style.animation='none';wrap.style.transform=`scale(${actorScaleAtDepth(areaH,depth)})`;
      if(horizontal){wrap.style.left=Math.max(0,Math.min(areaW-128,currentLeft+(Math.random()<.5?-1:1)*(55+Math.random()*120)))+'px';wrap.style.top=currentTop+'px';}
      else{wrap.style.left=currentLeft+'px';wrap.style.top=Math.max(10,Math.min(areaH-132,currentTop+(Math.random()<.5?-1:1)*(45+Math.random()*100)))+'px';}
      horizontal=!horizontal;
    },intervalMs);
  }
  function stopTeleport(wrap) { if (wrap._teleportTimer) { clearInterval(wrap._teleportTimer); wrap._teleportTimer=null; } }
  function startDrain(wrap) {
    wrap._drainTimer = setInterval(()=>{
      if (!wrap.parentNode || wrap.dataset.dead || !gameActive) { stopDrain(wrap); return; }
      if (sessionCoins > 0) { sessionCoins--; updateHUD(); }
    }, 1000);
  }
  function stopDrain(wrap) { if (wrap._drainTimer) { clearInterval(wrap._drainTimer); wrap._drainTimer=null; } }

  function actorScaleAtDepth(areaH,depth){
    const projectedWallHeight=Math.min(areaH,12+areaH*TOWN_NEAR_WALL_HEIGHT*depth*TOWN_NEAR_HOUSE_SCALE);
    const projectedDoorHeight=projectedWallHeight*TOWN_DOOR_HEIGHT_RATIO;
    return Math.max(.1,(projectedDoorHeight*TOWN_ACTOR_DOOR_RATIO)/128);
  }

  function placeActorOnStreet(wrap, areaW, areaH, housePeek=false) {
    const vpX=areaW*.5,vpY=Math.max(8,areaH*TOWN_VANISHING_POINT_Y);
    if(housePeek){
      const depth=[.25,.5,.75][Math.floor(Math.random()*3)],side=Math.random()<.5?-1:1;
      const streetHalf=areaW*TOWN_ROAD_NEAR_HALF_WIDTH*depth;
      const scale=actorScaleAtDepth(areaH,depth);
      const edgeX=vpX+side*streetHalf,actorWidth=128*scale;
      const visualLeft=side<0?edgeX-actorWidth*.68:edgeX-actorWidth*.32;
      wrap.style.left=(visualLeft-(128-actorWidth)/2)+'px';
      wrap.style.top=(vpY+(areaH-vpY)*depth-128)+'px';
      wrap.style.setProperty('--from-x',(vpX-64-parseFloat(wrap.style.left))+'px');
      wrap.style.setProperty('--from-y',(vpY-128-parseFloat(wrap.style.top))+'px');
      wrap.style.setProperty('--end-scale',String(scale));
      wrap.style.setProperty('--peek-hide',(side<0?'-':'')+'48px');
      const exitX=side*(areaW*.5-streetHalf),exitY=areaH-(vpY+(areaH-vpY)*depth),finalScale=actorScaleAtDepth(areaH,1);
      wrap.style.setProperty('--peek-exit-half-x',(exitX*.5)+'px');wrap.style.setProperty('--peek-exit-half-y',(exitY*.5)+'px');
      wrap.style.setProperty('--peek-exit-near-x',(exitX*.82)+'px');wrap.style.setProperty('--peek-exit-near-y',(exitY*.82)+'px');
      wrap.style.setProperty('--peek-exit-x',exitX+'px');wrap.style.setProperty('--peek-exit-y',exitY+'px');
      wrap.style.setProperty('--peek-mid-scale',String(scale+(finalScale-scale)*.5));wrap.style.setProperty('--peek-near-scale',String(scale+(finalScale-scale)*.82));
      wrap.style.setProperty('--peek-final-scale',String(finalScale));wrap.style.setProperty('--peek-final-hide',(side<0?'-':'')+'48px');
      wrap.classList.add('house-peek');
      wrap.dataset.peekDepth=String(depth);
      wrap.dataset.peekSide=String(side);
      return;
    }
    const scale=actorScaleAtDepth(areaH,1),actorSize=128*scale,lane=(Math.random()*1.7-.85),roadHalf=areaW*TOWN_ROAD_NEAR_HALF_WIDTH,endX=Math.max((actorSize-128)/2,Math.min(areaW-128-(actorSize-128)/2,vpX+lane*(roadHalf-actorSize/2)-64)),endY=Math.max(vpY+80,areaH-128);
    wrap.style.left=endX+'px';wrap.style.top=endY+'px';
    wrap.style.setProperty('--from-x',(vpX-64-endX)+'px');
    wrap.style.setProperty('--from-y',(vpY-118-endY)+'px');
    wrap.style.setProperty('--end-scale',String(scale));
  }

  function createPeekWall(area,wrap,areaW,areaH,lifetime){
    const depth=Number(wrap.dataset.peekDepth),side=Number(wrap.dataset.peekSide),vpX=areaW*.5,vpY=Math.max(8,areaH*TOWN_VANISHING_POINT_Y);
    const streetHalf=areaW*TOWN_ROAD_NEAR_HALF_WIDTH*depth,edgeX=vpX+side*streetHalf,baseY=vpY+(areaH-vpY)*depth;
    const wall=document.createElement('div');wall.className='peek-house-wall';
    const wallWidth=Math.max(34,areaW*TOWN_HOUSE_WIDTH*depth*TOWN_NEAR_HOUSE_SCALE);
    const wallHeight=Math.max(48,12+areaH*TOWN_NEAR_WALL_HEIGHT*depth*TOWN_NEAR_HOUSE_SCALE);
    wall.style.width=wallWidth+'px';wall.style.height=wallHeight+'px';wall.style.left=(side<0?edgeX-wallWidth:edgeX)+'px';wall.style.top=(baseY-wallHeight)+'px';
    const wallLeft=parseFloat(wall.style.left),wallTop=parseFloat(wall.style.top);
    wall.style.setProperty('--wall-from-x',(vpX-(wallLeft+wallWidth*.5))+'px');
    wall.style.setProperty('--wall-from-y',(vpY-(wallTop+wallHeight))+'px');
    const exitX=side*(areaW*.5-streetHalf),exitY=areaH-baseY,finalWallWidth=Math.max(34,areaW*TOWN_HOUSE_WIDTH*TOWN_NEAR_HOUSE_SCALE);
    const finalWallScale=finalWallWidth/wallWidth;
    wall.style.setProperty('--wall-exit-half-x',(exitX*.5)+'px');wall.style.setProperty('--wall-exit-half-y',(exitY*.5)+'px');
    wall.style.setProperty('--wall-exit-near-x',(exitX*.82)+'px');wall.style.setProperty('--wall-exit-near-y',(exitY*.82)+'px');
    wall.style.setProperty('--wall-exit-x',exitX+'px');wall.style.setProperty('--wall-exit-y',exitY+'px');
    wall.style.setProperty('--wall-mid-scale',String(1+(finalWallScale-1)*.5));wall.style.setProperty('--wall-near-scale',String(1+(finalWallScale-1)*.82));wall.style.setProperty('--wall-final-scale',String(finalWallScale));
    wall.style.setProperty('--peek-time',lifetime+'ms');wall.classList.add('approaching');
    area.appendChild(wall);wrap._peekWall=wall;setTimeout(()=>wall.remove(),lifetime+80);
  }

  function spawnEnemy() {
    if(!gameActive||bossActive||bossPreviewActive)return;
    const area=document.getElementById('game-area'),areaW=area.clientWidth,areaH=area.clientHeight;
    // `isDecoy` means "protected target". Bloody Bandit reverses the rosters:
    // townsfolk become targets and outlaws are the protected characters.
    const isDecoy = Math.random() < DECOY_CHANCE;
    const type = gameMode==='bloody'
      ? (isDecoy?pickEnemyType():DECOY_TYPES[Math.floor(Math.random()*DECOY_TYPES.length)])
      : (isDecoy?BASIC_DECOY_TYPES[Math.floor(Math.random()*BASIC_DECOY_TYPES.length)]:pickEnemyType());

    const isBounty = !isDecoy && hasUp('bounty') && Math.random() < 0.06*upStack('bounty');
    const wrap=document.createElement('div');
    wrap.className = 'enemy-wrap' + (isDecoy ? ' decoy-glow' : (isBounty ? ' gold-glow' : (type.cssClass ? ' '+type.cssClass : '')));
    wrap.dataset.kind = isDecoy ? 'decoy' : 'enemy';
    wrap.dataset.type = type.id;
    wrap.dataset.hitsLeft = isDecoy ? '1' : String(type.hits);
    if(!isDecoy&&type.id==='vulture')wrap.classList.add('orthogonal-approach');
    if (isBounty) wrap.dataset.bounty = '1';
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;canvas.style.width='128px';canvas.style.height='128px';
    if(!isDecoy&&wordslingerCosmetic('wild-west-wordslinger_alien_outlaws'))drawAlienOutlaw(canvas.getContext('2d'));else type.draw(canvas.getContext('2d'));wrap.appendChild(canvas);
    const housePeek=Math.random()<0.10;
    placeActorOnStreet(wrap,areaW,areaH,housePeek);
    if(!isDecoy&&type.id==='ghost'&&!housePeek){
      wrap.classList.add('ghost-zigzag');
      const fx=parseFloat(wrap.style.getPropertyValue('--from-x'))||0,fy=parseFloat(wrap.style.getPropertyValue('--from-y'))||0;
      const endScale=parseFloat(wrap.style.getPropertyValue('--end-scale'))||1;
      wrap.style.setProperty('--ghost-x1',(fx*.78-55)+'px');wrap.style.setProperty('--ghost-y1',(fy*.78)+'px');
      wrap.style.setProperty('--ghost-x2',(fx*.56+65)+'px');wrap.style.setProperty('--ghost-y2',(fy*.56)+'px');
      wrap.style.setProperty('--ghost-x3',(fx*.34-70)+'px');wrap.style.setProperty('--ghost-y3',(fy*.34)+'px');
      wrap.style.setProperty('--ghost-x4',(fx*.16+55)+'px');wrap.style.setProperty('--ghost-y4',(fy*.16)+'px');
      wrap.style.setProperty('--ghost-s1',String(endScale*.28));wrap.style.setProperty('--ghost-s2',String(endScale*.48));
      wrap.style.setProperty('--ghost-s3',String(endScale*.68));wrap.style.setProperty('--ghost-s4',String(endScale*.86));
    }
    wrap.addEventListener('click',(e)=>{ e.stopPropagation(); shootEnemy(wrap, type, isDecoy); });
    area.appendChild(wrap);

    // Ghost Rider teleports. Vulture Scouts patrol one axis at a time and never
    // travel diagonally: horizontal and vertical moves alternate.
    if(!isDecoy&&type.id==='vulture')startVulturePatrol(wrap,areaW,areaH,type.teleportSpeed||380);
    else if (!isDecoy && type.teleports && type.id!=='ghost') startTeleport(wrap, areaW, areaH, type.teleportSpeed || 750);
    // Card Shark drains coins every second while alive
    if (!isDecoy && type.drainsCoins) startDrain(wrap);

    const modLifetimeMult = (runModifier && runModifier.lifetimeMult) ? runModifier.lifetimeMult : 1;
    const lifetime = housePeek ? 1000/TOWN_MOVEMENT_SPEED : getEnemyLifetime() * (isDecoy ? 1 : type.lifetimeMult) * modLifetimeMult;
    wrap.style.setProperty('--approach-time', lifetime+'ms');
    wrap.classList.add('approaching');
    if(housePeek)createPeekWall(area,wrap,areaW,areaH,lifetime);
    if(!isDecoy&&!housePeek&&Math.random()<0.34)spawnWesternCover(area,wrap,areaW,areaH);
    scheduleExpiry(wrap, lifetime);
  }

  function spawnWesternCover(area, enemy, areaW, areaH){
    const kinds=[{id:'barrel',hp:2,solid:true},{id:'wagon',hp:3,solid:true},{id:'cactus',hp:Infinity},{id:'sign',hp:Infinity}];
    const kind=kinds[Math.floor(Math.random()*kinds.length)],cover=document.createElement('button');
    cover.type='button';cover.className='western-obstacle '+(kind.solid?'destructible':'indestructible');cover.dataset.hp=String(kind.hp);cover.dataset.kind=kind.id;
    const sprite=document.createElement('canvas');sprite.width=72;sprite.height=82;sprite.setAttribute('aria-hidden','true');drawPixelObstacle(sprite.getContext('2d'),kind.id);cover.appendChild(sprite);cover.setAttribute('aria-label',kind.id);
    const ex=parseFloat(enemy.style.left)||0,ey=parseFloat(enemy.style.top)||0;
    cover.style.left=Math.max(0,Math.min(areaW-72,ex+24+(Math.random()-.5)*40))+'px';cover.style.top=Math.max(0,Math.min(areaH-92,ey+54+(Math.random()-.5)*26))+'px';
    const vpX=areaW*.5,vpY=Math.max(8,areaH*TOWN_VANISHING_POINT_Y);
    cover.style.setProperty('--from-x',(vpX-36-parseFloat(cover.style.left))+'px');
    cover.style.setProperty('--from-y',(vpY-82-parseFloat(cover.style.top))+'px');
    cover.style.setProperty('--end-scale',enemy.style.getPropertyValue('--end-scale')||'1');
    cover.style.setProperty('--approach-time',enemy.style.getPropertyValue('--approach-time'));cover.classList.add('approaching');
    if(kind.solid)cover.onclick=e=>{e.stopPropagation();if(!gameActive||ammo<=0)return;consumeAmmo(1);const hp=Number(cover.dataset.hp)-1;cover.dataset.hp=String(hp);sprite.classList.add('hit');setTimeout(()=>sprite.classList.remove('hit'),120);if(hp<=0){cover.classList.add('destroyed');setTimeout(()=>cover.remove(),220);}updateHUD();};
    else cover.onclick=e=>{e.stopPropagation();sprite.classList.add('hit');setTimeout(()=>sprite.classList.remove('hit'),120);};
    area.appendChild(cover);setTimeout(()=>cover.remove(),Math.max(1000,getEnemyLifetime()*1.6));
  }

  function drawPixelObstacle(ctx,kind){
    ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,72,82);
    const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
    if(kind==='barrel'){
      rect(18,12,36,62,'#351c0d');rect(14,20,44,46,'#75401e');rect(19,15,34,54,'#a5632d');rect(24,16,6,52,'#c9823b');rect(14,23,44,6,'#2c3338');rect(14,51,44,6,'#2c3338');rect(20,12,32,5,'#15191c');rect(20,65,32,6,'#15191c');rect(29,33,14,14,'#8a4a22');rect(33,36,6,8,'#d39248');
    }else if(kind==='wagon'){
      rect(7,39,58,25,'#44230f');rect(11,34,50,25,'#9b5525');rect(17,39,38,14,'#c87b37');rect(8,28,7,36,'#6d3a1b');rect(57,28,7,36,'#6d3a1b');
      for(const cx of [17,55]){ctx.fillStyle='#17191c';ctx.beginPath();ctx.arc(cx,65,13,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#b87a3c';ctx.lineWidth=4;ctx.beginPath();ctx.arc(cx,65,8,0,Math.PI*2);ctx.stroke();for(let a=0;a<Math.PI*2;a+=Math.PI/4){ctx.beginPath();ctx.moveTo(cx,65);ctx.lineTo(cx+Math.cos(a)*8,65+Math.sin(a)*8);ctx.stroke();}}
      rect(13,29,46,6,'#e0c29a');rect(8,20,6,22,'#70451f');rect(58,20,6,22,'#70451f');ctx.strokeStyle='#e8d5b7';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(10,20);ctx.quadraticCurveTo(36,2,62,20);ctx.stroke();
    }else if(kind==='cactus'){
      rect(30,7,14,67,'#194d2c');rect(34,7,7,67,'#2f8b4d');rect(15,34,18,12,'#236f3d');rect(14,24,10,22,'#2f8b4d');rect(42,43,17,12,'#236f3d');rect(51,31,10,24,'#2f8b4d');rect(27,69,20,8,'#173a25');for(const [x,y] of [[35,15],[39,29],[19,31],[55,39],[33,51],[40,65]])rect(x,y,2,5,'#b9d67b');
    }else{
      rect(32,25,9,53,'#4b2a13');rect(36,25,5,53,'#865027');rect(8,10,56,34,'#42220e');rect(11,13,50,28,'#a6632c');rect(14,16,44,22,'#70401e');rect(18,20,6,4,'#d7b06a');rect(28,20,5,4,'#d7b06a');rect(38,20,5,4,'#d7b06a');rect(48,20,6,4,'#d7b06a');rect(22,29,28,4,'#e5c27d');rect(29,74,16,5,'#2d180b');
    }
  }

  function shootEnemy(el, type, isDecoy) {
    if(!gameActive||ammo<=0||el.dataset.dead)return;
    const area = document.getElementById('game-area');
    const hitRect=el.getBoundingClientRect(),areaRect=area.getBoundingClientRect();
    const pos=elementEffectPosition(el,area),x=pos.x,y=pos.y;

    if (isDecoy) {
      // Penalize: never shoot the townsfolk!
      comboStreak = 0;
      consumeAmmo(1); el.dataset.dead='1';
      el._peekWall?.remove();
      if (el._expireTimer) clearTimeout(el._expireTimer);
      stopTeleport(el); stopDrain(el);
      spawnDeathEffect(x,y,area);
      el.style.transition='transform 0.25s, opacity 0.25s';
      el.style.transform='scale(0) rotate(90deg)';el.style.opacity='0';
      const penaltyScore=type.penaltyScore||15,warning=type.warning||(gameMode==='bloody'?'Let the bandits go free!':'Wrong target!');
      overallScore -= penaltyScore;
      showFloatingText(x,y,'-'+penaltyScore+' '+warning,'#e74c3c',area);
      updateHUD(); updateEnemySpawning();
      setTimeout(()=>el.remove(),300);
      loseLife(type.penaltyLives||1, area, x, y, `Ran out of lives — you shot ${type.name}! ${warning}`);
      return;
    }

    // Armored Outlaw needs a second hit before it goes down (Hollow Points skips one)
    const secretDouble=window.AchievementManager?.hasSecret?.('secret_twin_shot')?1:0;
    let hitsLeft = parseInt(el.dataset.hitsLeft || '1', 10) - 1 - upStack('hollow')-secretDouble;
    if(secretDouble)showFloatingText(x+18,y-15,'✦ DOUBLE SHOT ✦','#ffd15c',area);
    if (hitsLeft > 0) {
      consumeAmmo(1); el.dataset.hitsLeft = String(hitsLeft);
      const sprite=el.querySelector('canvas');
      if(sprite){sprite.classList.remove('armor-flash');void sprite.offsetWidth;sprite.classList.add('armor-flash');}
      showFloatingText(x,y,'Armor cracked!','#ffffff',area);
      updateHUD();
      return;
    }

    consumeAmmo(1);el.dataset.dead='1';el._peekWall?.remove();
    if (el._expireTimer) clearTimeout(el._expireTimer);
    stopTeleport(el); stopDrain(el);
    spawnDeathEffect(x,y,area);
    el.style.transition='transform 0.25s, opacity 0.25s';
    el.style.transform='scale(0) rotate(90deg)';el.style.opacity='0';
    const coinMult = runCoinMult;
    comboStreak++;
    const isBounty = el.dataset.bounty==='1';
    const critHit = hasUp('deadeye') && Math.random() < 0.15*upStack('deadeye');
    let mult = getComboMultiplier() * runScoreMult * upgradeScoreMult();
    const shotDepth=Math.max(0,Math.min(1,(hitRect.bottom-areaRect.top)/Math.max(1,areaRect.height)));
    const distanceBonus=1+(1-shotDepth)*DISTANCE_SCORE_BONUS;
    mult*=distanceBonus;
    if (critHit) mult *= 2;
    if (isBounty) mult *= 3;
    const scoreGain = Math.round(type.score * mult);
    let coinsGain = Math.round(type.coins*coinMult*upgradeCoinMult()) + upStack('magnet');
    if (isBounty) coinsGain *= 3;
    killCount++;totalKills++;overallScore+=scoreGain;sessionCoins+=coinsGain;window.AchievementManager?.notify?.('enemy_defeated',{x:x+64,y:y+64});
    let label = '+'+scoreGain+(mult>1?' ('+mult.toFixed(1)+'x)':'')+(distanceBonus>=1.15?' 🎯 FAR SHOT':'');
    if (critHit) label = '💥 CRIT! '+label;
    if (isBounty) label = '⭐ BOUNTY! '+label;
    showFloatingText(x,y,label,'#2ecc71',area);

    // Vulture Scout: refunds a shot when downed
    if (type.refundsAmmo && ammo < maxAmmo) {
      ammo = Math.min(maxAmmo, ammo+1);
      showFloatingText(x,y-18,'+1 Ammo','#00d4ff',area);
    }

    // Dynamite Bandit: chain-kill nearby enemies
    if (type.explodes) {
      const ring = document.createElement('div');
      ring.className='shock-ring'; ring.style.left=(x+64)+'px'; ring.style.top=(y+64)+'px';
      area.appendChild(ring); setTimeout(()=>ring.remove(),500);
      area.querySelectorAll('.enemy-wrap').forEach(other=>{
        if (other===el || other.dataset.dead || other.dataset.kind==='decoy') return;
        const ox=parseInt(other.style.left), oy=parseInt(other.style.top);
        const dist=Math.hypot(ox-x, oy-y);
        if (dist < 170) finishOffEnemy(other, area);
      });
    }

    // Explosive Rounds upgrade: bonus blast finishes off weak enemies nearby
    if (hasUp('explosive')) {
      const radius = 90 + upStack('explosive')*30;
      area.querySelectorAll('.enemy-wrap').forEach(other=>{
        if (other===el || other.dataset.dead || other.dataset.kind==='decoy') return;
        const ox=parseInt(other.style.left), oy=parseInt(other.style.top);
        if (Math.hypot(ox-x, oy-y) < radius) finishOffEnemy(other, area);
      });
    }

    // Spread Shot upgrade: damages (doesn't always kill) a few nearby enemies
    if (hasUp('spread')) {
      let hitCount = 0; const maxHits = upStack('spread')*2;
      area.querySelectorAll('.enemy-wrap').forEach(other=>{
        if (hitCount>=maxHits || other===el || other.dataset.dead || other.dataset.kind==='decoy') return;
        const ox=parseInt(other.style.left), oy=parseInt(other.style.top);
        if (Math.hypot(ox-x, oy-y) < 140) { hitCount++; if (damageOtherEnemy(other)) finishOffEnemy(other, area); }
      });
    }

    // Piercing Rounds upgrade: strike additional enemies elsewhere on screen
    if (hasUp('piercing')) {
      const others = [...area.querySelectorAll('.enemy-wrap')].filter(o=>o!==el && !o.dataset.dead && o.dataset.kind!=='decoy');
      others.sort(()=>Math.random()-0.5).slice(0, upStack('piercing')).forEach(other=>{
        if (damageOtherEnemy(other)) finishOffEnemy(other, area);
      });
    }

    // Chain Lightning upgrade: big combos occasionally zap a bonus enemy dead
    if (hasUp('chain') && comboStreak>=3 && Math.random() < 0.15*upStack('chain')) {
      const others = [...area.querySelectorAll('.enemy-wrap')].filter(o=>o!==el && !o.dataset.dead && o.dataset.kind!=='decoy');
      if (others.length) {
        const target = others[Math.floor(Math.random()*others.length)];
        const tx=parseInt(target.style.left), ty=parseInt(target.style.top);
        finishOffEnemy(target, area);
        showFloatingText(tx,ty-16,'⚡ Chain!','#00d4ff',area);
      }
    }

    updateHUD();updateEnemySpawning();checkStageProgress();maybeTriggerDuel();setTimeout(()=>el.remove(),300);
  }

  async function endGame() {
    PlatformManager.endPracticeRun();
    gameActive=false;clearInterval(spawnInterval);setTownMovementPaused(false);
    window.ChallengeManager?.finish?.({score:overallScore,wave:1+Math.floor(overallScore/100),waveProgress:killCount,alive:false});
    if (deadManHandTimer) { clearInterval(deadManHandTimer); deadManHandTimer=null; }
    clearTimeout(duelTimerHandle); duelActive=false;
    document.getElementById('duel-overlay').classList.add('hidden');
    document.getElementById('upgrade-pick-overlay').classList.add('hidden');
    clearTimeout(bossIncomingTimer); bossPreviewActive=false;
    document.getElementById('boss-incoming-overlay').classList.add('hidden');
    document.getElementById('game-area').querySelectorAll('.enemy-wrap').forEach(e=>{ if(e._teleportTimer) clearInterval(e._teleportTimer); });
    if (bossActive) {
      bossActive=false; clearInterval(bossWordInterval);
      cleanupCurrentBoss();
      document.querySelectorAll('.falling-word').forEach(w=>w.remove());
      const bw=document.getElementById('boss-wrap'); if(bw) bw.remove();
      const bh=document.getElementById('boss-health-bar-wrap'); if(bh) bh.remove();
    }
    updateCrosshairCursor();
    const coinResult = PlatformManager.settleAccuracyCoins(GAME_CONFIG.id, Math.max(0, sessionCoins));
    const newHigh = overallScore > highScore;
    if(newHigh) highScore=overallScore;
    PlatformManager.setHighScore(GAME_CONFIG.id, overallScore);
    try { await saveData(); } catch(e) { console.error('saveData failed', e); }
    document.getElementById('final-score').textContent='Score: '+overallScore+' (Kills: '+killCount+')';
    document.getElementById('final-coins').textContent=`🪙 ${coinResult.coinsAwarded} awarded from ${sessionCoins} raw coins at ${coinResult.accuracyPercent}% accuracy (+15%)`;
    document.getElementById('gameover-reason').textContent = gameOverReason || '';
    document.getElementById('new-highscore').classList.toggle('hidden',!newHigh);
    const wipe = document.getElementById('screenWipe');
    wipe.classList.add('wipe');
    setTimeout(() => {
      showScreen('gameover-screen');
      wipe.classList.remove('wipe');
    }, 750);
  }

  function updateEnemySpawning() {
    // Recalculate spawn rate based on current score
    if(gameActive && !bossActive && !bossPreviewActive && spawnInterval) {
      clearInterval(spawnInterval);
      spawnInterval = setInterval(spawnEnemy, getSpawnDelay());
    }
  }

  // ===== Stages & Boss Fights =====
  // Each boss has its own sprite, HP profile, word-fall speed, and a unique mechanic:
  //  - Iron Vest:  armored — cycles between armored/weak-point phases (damage multiplier)
  //  - Phantom:    dodges — periodically becomes untargetable and relocates
  //  - Boom Baron: hazard — falling bombs among the words; defuse for bonus dmg, ignore for a lost life
  //  - Duchess:    drain  — steals ammo on a timer, so you must manage supply
  //  - Talon:      speed  — faster words + constantly repositions, punishing slow aim
  const BOSS_TYPES = [
    { id:'ironvest', name:'Iron Vest', draw:drawBossIronVest, hpMult:1.15, wordInterval:1100,
      hint:'Armored — wait for the gold glow, that\'s the weak point!',
      init:bossInitIronVest, cleanup:bossCleanupIronVest,
      modifyDamage:(amt,state)=> state.weak ? Math.round(amt*1.5) : Math.round(amt*0.5) },
    { id:'phantom', name:'Phantom of the Plains', draw:drawBossPhantom, hpMult:0.9, wordInterval:1100,
      hint:'Fades and dodges in place — time your shots on the body!',
      init:bossInitPhantom, cleanup:bossCleanupPhantom },
    { id:'boombaron', name:'Boom Baron', draw:drawBossBoomBaron, hpMult:1, wordInterval:1200,
      hint:'Watch for 💣 — defuse it, don\'t let it hit the ground!' },
    { id:'duchess', name:'Deadeye Duchess', draw:drawBossDuchess, hpMult:1, wordInterval:1000,
      hint:'She steals ammo every few seconds — stay stocked up!',
      init:bossInitDrain, cleanup:bossCleanupDrain },
    { id:'talon', name:'Talon', draw:drawBossTalon, hpMult:0.95, wordInterval:850,
      hint:'Rapid fire — her word bullets launch much faster!',
      init:bossInitTalon, cleanup:bossCleanupTalon },
    ...(window.AchievementManager?.hasSecret?.('secret_map_border')?[{id:'mapmaker',name:'The Lost Mapmaker',draw:drawBossMapmaker,hpMult:1.25,wordInterval:760,hint:'Secret boss — extra health and the fastest word-bullet pattern!',init:bossInitMapmaker,cleanup:bossCleanupMapmaker}]:[])
  ];
  const GOOD_BOSS_TYPES = [
    {id:'marshal',name:'Marshal Aegis',draw:drawBossMarshal,hpMult:1.15,wordInterval:1100,hint:'Armored like Iron Vest — strike during the gold weak-point glow!',init:bossInitIronVest,cleanup:bossCleanupIronVest,modifyDamage:(amt,state)=>state.weak?Math.round(amt*1.5):Math.round(amt*.5)},
    {id:'guardian',name:'Guardian Mirage',draw:drawBossGuardian,hpMult:.9,wordInterval:1100,hint:'Mirrors the Phantom — fades and dodges incoming shots!',init:bossInitPhantom,cleanup:bossCleanupPhantom},
    {id:'powderdeputy',name:'Powder Deputy',draw:drawBossDeputy,hpMult:1,wordInterval:1200,hint:'Mirrors Boom Baron — defuse the powder bombs before they escape!'},
    {id:'ladyluck',name:'Lady Luck',draw:drawBossLadyLuck,hpMult:1,wordInterval:1000,hint:'Mirrors Deadeye Duchess — steals one ammo every few seconds!',init:bossInitDrain,cleanup:bossCleanupDrain},
    {id:'skywarden',name:'Skywarden',draw:drawBossSkywarden,hpMult:.95,wordInterval:850,hint:'Mirrors Talon — launches word bullets at the fastest rate!',init:bossInitTalon,cleanup:bossCleanupTalon}
  ];
  function activeBossTypes(){return gameMode==='bloody'?GOOD_BOSS_TYPES:BOSS_TYPES;}
  let bossWordInterval = null;

  function cleanupCurrentBoss() {
    if (currentBoss && currentBoss.cleanup) currentBoss.cleanup();
    currentBoss = null;
    bossState = {};
  }

  // --- Iron Vest: armored/weak-point cycle ---
  function bossInitIronVest() {
    bossState.weak = false;
    const cycle = () => {
      bossState.weak = !bossState.weak;
      const wrap = document.getElementById('boss-wrap');
      if (wrap) wrap.classList.toggle('boss-weak-glow', bossState.weak);
      bossState.cycleTimer = setTimeout(cycle, bossState.weak ? 1200 : 3000);
    };
    bossState.cycleTimer = setTimeout(cycle, 3000);
  }
  function bossCleanupIronVest() { if (bossState.cycleTimer) clearTimeout(bossState.cycleTimer); }

  // --- Phantom: dodge in place (bosses remain centered after their entrance) ---
  function bossInitPhantom() {
    bossState.dodging = false;
    const cycle = () => {
      bossState.dodging = !bossState.dodging;
      const wrap = document.getElementById('boss-wrap');
      const area = document.getElementById('game-area');
      if (wrap) {
        wrap.classList.toggle('boss-dodge', bossState.dodging);
      }
      bossState.cycleTimer = setTimeout(cycle, bossState.dodging ? 1400 : 2600);
    };
    bossState.cycleTimer = setTimeout(cycle, 2600);
  }
  function bossCleanupPhantom() { if (bossState.cycleTimer) clearTimeout(bossState.cycleTimer); }

  // --- Duchess: periodic ammo drain ---
  function bossInitDrain() {
    bossState.drainTimer = setInterval(()=>{
      if (!bossActive || ammo<=0) return;
      ammo = Math.max(0, ammo-1);
      updateHUD();
      const area = document.getElementById('game-area');
      if (area) showFloatingText(area.clientWidth/2-50, 60, '🃏 Ammo Stolen!', '#a855f7', area);
    }, 4000);
  }
  function bossCleanupDrain() { if (bossState.drainTimer) clearInterval(bossState.drainTimer); }

  // --- Talon: faster wordInterval, but remains centered like every boss ---
  function bossInitTalon() {}
  function bossCleanupTalon() { if (bossState.moveTimer) clearTimeout(bossState.moveTimer); }
  function bossInitMapmaker(){}
  function bossCleanupMapmaker(){if(bossState.moveTimer)clearTimeout(bossState.moveTimer);}

  let bossPreviewActive = false;
  let bossIncomingTimer = null;
  let pendingBossCategory = null;

  function checkStageProgress() {
    if (!gameActive || bossActive || bossPreviewActive) return;
    if (overallScore - stageStartScore >= STAGE_SCORE_STEP) {
      showBossIncoming();
    }
  }

  function showBossIncoming() {
    bossPreviewActive = true;
    gameActive = false;
    clearInterval(spawnInterval);
    const area = document.getElementById('game-area');
    area.querySelectorAll('.enemy-wrap,.western-obstacle,.peek-house-wall').forEach(e=>{ stopTeleport(e); stopDrain(e); if(e._expireTimer) clearTimeout(e._expireTimer); e.remove(); });
    const roster=activeBossTypes(),bossDef = roster[(stage-1)%roster.length];
    pendingBossCategory = QuestionManager.getNextQuestion();
    const canvas = document.getElementById('boss-incoming-canvas');
    bossDef.draw(canvas.getContext('2d'));
    document.getElementById('boss-incoming-name').textContent = '👹 ' + bossDef.name;
    document.getElementById('boss-incoming-hint').textContent =
      'Category: ' + pendingBossCategory.prompt + ' — shoot ONLY the correct words!\n' + (bossDef.hint || '');
    document.getElementById('boss-incoming-overlay').classList.remove('hidden');
    bossIncomingTimer = setTimeout(()=>{
      document.getElementById('boss-incoming-overlay').classList.add('hidden');
      bossPreviewActive = false;
      startBossFight();
    }, 2200);
  }

  function startBossFight() {
    bossActive = true;
    gameActive = true;
    clearInterval(spawnInterval);
    const area = document.getElementById('game-area');
    area.querySelectorAll('.enemy-wrap,.western-obstacle,.peek-house-wall').forEach(e=>{ stopTeleport(e); stopDrain(e); if(e._expireTimer) clearTimeout(e._expireTimer); e.remove(); });
    const roster=activeBossTypes(),bossDef = roster[(stage-1)%roster.length];
    currentBoss = bossDef;
    bossState = {arrived:false};
    bossMaxHP = Math.round((80 + stage*40) * (bossDef.hpMult||1)); bossHP = bossMaxHP;

    const wrap=document.createElement('div');
    wrap.id='boss-wrap';
    wrap.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:150px;height:150px;cursor:crosshair;z-index:15;';
    wrap.style.setProperty('--boss-entry-y',(Math.max(8,area.clientHeight*TOWN_VANISHING_POINT_Y)-area.clientHeight*.5)+'px');
    wrap.classList.add('boss-entering');
    const canvas=document.createElement('canvas');
    canvas.width=128;canvas.height=128;canvas.style.width='150px';canvas.style.height='150px';
    bossDef.draw(canvas.getContext('2d'));
    wrap.appendChild(canvas);
    wrap.addEventListener('click',(e)=>{
      e.stopPropagation();
      if (!bossActive || !bossState.arrived || ammo<=0) return;
      if (bossState.dodging) {
        consumeAmmo(1); updateHUD();
        showFloatingText(area.clientWidth/2-30, area.clientHeight/2, 'Dodged!', '#7fdfff', area);
        return;
      }
      consumeAmmo(1);
      let dmg = 5;
      if (bossDef.modifyDamage) dmg = bossDef.modifyDamage(dmg, bossState);
      damageBoss(dmg, area);
      updateHUD();
    });
    area.appendChild(wrap);

    const barWrap=document.createElement('div');
    barWrap.id='boss-health-bar-wrap';
    barWrap.style.cssText='position:absolute;left:50%;top:clamp(20px, 6vh, 34px);transform:translateX(-50%);width:min(620px, 92%);z-index:120;';
    barWrap.innerHTML='<div style="background:#1a0a2e;border:2px solid var(--border-purple);border-radius:6px;height:16px;overflow:hidden;"><div id="boss-health-fill" style="background:linear-gradient(90deg,#e74c3c,#ff6b81);height:100%;width:100%;transition:width 0.2s;"></div></div><p id="boss-name-label" class="text-center text-xs font-bold" style="color:#fff;text-shadow:0 1px 3px #000;margin-top:2px;"></p><p id="boss-correct-words" class="text-center" style="color:#7dff9b;font-size:12px;font-weight:800;text-shadow:0 1px 3px #000;margin-top:2px;"></p><p id="boss-hint-label" class="text-center" style="color:#ffd8e0;font-size:11px;text-shadow:0 1px 3px #000;margin-top:1px;"></p>';
    area.appendChild(barWrap);

    const cat = pendingBossCategory || QuestionManager.getNextQuestion();
    pendingBossCategory = null;
    document.getElementById('boss-name-label').textContent = '👹 ' + bossDef.name + ' — Category: ' + cat.prompt;
    document.getElementById('boss-correct-words').textContent = 'Correct: ' + cat.correct.join(' • ');
    document.getElementById('boss-hint-label').textContent = 'Shoot ONLY the correct words! ' + (bossDef.hint || '');
    showFloatingText(area.clientWidth/2-60, area.clientHeight/2-20, '⚠️ BOSS FIGHT ⚠️', '#e74c3c', area);

    const finishBossEntrance=()=>{
      if(!bossActive||bossState.arrived)return;
      bossState.arrived=true;wrap.classList.remove('boss-entering');
      setTownMovementPaused(true);
      if(bossDef.init)bossDef.init();
      fireBossPattern(cat);
      bossWordInterval=setInterval(()=>fireBossPattern(cat),bossDef.wordInterval||1100);
    };
    wrap.addEventListener('animationend',finishBossEntrance,{once:true});
    setTimeout(finishBossEntrance,1700);
  }

  function fireBossPattern(cat,patternId=currentBoss?.id){
    if(!bossActive)return;
    if(patternId==='mapmaker')patternId=['ironvest','phantom','boombaron','duchess','talon'][Math.floor(Math.random()*5)];
    if(patternId==='ironvest'||patternId==='marshal'){
      bossState.fireSide=bossState.fireSide==='left'?'right':'left';
      const angle=bossState.fireSide==='left'?(Math.PI*.55+Math.random()*Math.PI*.9):(-Math.PI*.45+Math.random()*Math.PI*.9);
      spawnFallingWord(cat,{angle,pattern:'alternate',patternId});return;
    }
    if(patternId==='phantom'||patternId==='guardian'){
      const centre=Math.random()*Math.PI*2,gap=Math.PI/12;
      [-gap,0,gap].forEach((offset,i)=>setTimeout(()=>spawnFallingWord(cat,{angle:centre+offset,pattern:'burst',patternId}),i*90));return;
    }
    if(patternId==='boombaron'||patternId==='powderdeputy'){spawnFallingWord(cat,{pattern:'sine',patternId,duration:7000});return;}
    if(patternId==='duchess'||patternId==='ladyluck'){spawnFallingWord(cat,{pattern:'accelerate',patternId,duration:5400});return;}
    if(patternId==='talon'||patternId==='skywarden'){
      const offset=Math.random()*Math.PI*2;
      for(let i=0;i<8;i++)spawnFallingWord(cat,{angle:offset+i*Math.PI/4,pattern:'circle',patternId,duration:5800});return;
    }
    spawnFallingWord(cat,{patternId});
  }

  function spawnFallingWord(cat,options={}) {
    if (!bossActive) return;
    const area = document.getElementById('game-area');
    const bossDef = currentBoss;
    const patternId=options.patternId||bossDef?.id;
    const isBomb = !!((patternId==='boombaron'||patternId==='powderdeputy') && Math.random() < 0.25);
    const pool = [...cat.correct, ...cat.distractors.slice(0,8)];
    const word = isBomb ? '💣' : pool[Math.floor(Math.random()*pool.length)];
    const isCorrect = !isBomb && cat.correct.includes(word);
    const el = document.createElement('button');
    el.className = 'falling-word' + (isBomb ? ' falling-bomb' : '');
    el.textContent = word;
    const areaW = area.clientWidth, areaH = area.clientHeight;
    // Fire each word radially from the centred boss until it exits one edge of
    // the play area. Starting just outside the sprite keeps the words readable.
    const angle=Number.isFinite(options.angle)?options.angle:Math.random()*Math.PI*2,dirX=Math.cos(angle),dirY=Math.sin(angle);
    const bossRadius=82,startX=areaW*.5+dirX*bossRadius,startY=areaH*.5+dirY*bossRadius;
    const margin=90;
    const tx=dirX>0?(areaW-margin-startX)/dirX:dirX<0?(margin-startX)/dirX:Infinity;
    const ty=dirY>0?(areaH-margin-startY)/dirY:dirY<0?(margin-startY)/dirY:Infinity;
    const travel=Math.max(120,Math.min(tx>0?tx:Infinity,ty>0?ty:Infinity));
    el.style.left=startX+'px';el.style.top=startY+'px';
    el.style.setProperty('--boss-word-x',(dirX*travel)+'px');
    el.style.setProperty('--boss-word-y',(dirY*travel)+'px');
    if(options.pattern==='sine'){
      const px=-dirY,py=dirX,amp=Math.min(42,areaW*.055),dx=dirX*travel,dy=dirY*travel;
      el.style.setProperty('--boss-word-x25',(dx*.25+px*amp)+'px');el.style.setProperty('--boss-word-y25',(dy*.25+py*amp)+'px');
      el.style.setProperty('--boss-word-x50',(dx*.5-px*amp)+'px');el.style.setProperty('--boss-word-y50',(dy*.5-py*amp)+'px');
      el.style.setProperty('--boss-word-x75',(dx*.75+px*amp)+'px');el.style.setProperty('--boss-word-y75',(dy*.75+py*amp)+'px');
      el.classList.add('boss-word-sine');
    }else if(options.pattern==='accelerate')el.classList.add('boss-word-accelerate');
    area.appendChild(el);
    spawnBossMuzzleEffect(area,angle);
    const fallDuration = options.duration||5200;
    el.style.setProperty('--boss-word-time',fallDuration+'ms');
    requestAnimationFrame(()=>el.classList.add('boss-word-fired'));
    el.addEventListener('click',(e)=>{
      e.stopPropagation();
      if (!bossActive || el.dataset.dead) return;
      el.dataset.dead='1';
      const areaRect=area.getBoundingClientRect(),wordRect=el.getBoundingClientRect();
      const x=wordRect.left-areaRect.left,y=wordRect.top-areaRect.top;
      if (isBomb) {
        spawnDeathEffect(x,y,area);
        let dmg = 18;
        if (bossDef && bossDef.modifyDamage) dmg = bossDef.modifyDamage(dmg, bossState);
        damageBoss(dmg, area);
        showFloatingText(x,y-16,'💥 Defused!','#00d4ff',area);
      } else if (isCorrect) {
        PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, true);
        spawnDeathEffect(x,y,area);
        let dmg = 12;
        if (bossDef && bossDef.modifyDamage) dmg = bossDef.modifyDamage(dmg, bossState);
        damageBoss(dmg, area);
        ammo = Math.min(maxAmmo, ammo+1);
        showFloatingText(x,y-16,'+1 Ammo','#00d4ff',area);
      } else {
        PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, false);
        PlatformManager.deductCoins(5);
        ammo = Math.max(0, ammo-1);
        showFloatingText(x,y-16,'Wrong!','#e74c3c',area);
        loseLife(1, area, x, y-16, 'Ran out of lives — you missed a word during the boss fight! Slow down and double-check each word before you shoot it.');
      }
      updateHUD();
      el.remove();
    });
    setTimeout(()=>{
      if (el.parentNode && !el.dataset.dead) {
        if (isBomb && bossActive) {
          const areaRect=area.getBoundingClientRect(),wordRect=el.getBoundingClientRect();
          const x=wordRect.left-areaRect.left,y=wordRect.top-areaRect.top;
          showFloatingText(x,y, '💥 Boom!', '#e74c3c', area);
          loseLife(1, area, x, y, 'Ran out of lives — a Boom Baron bomb went off! Defuse the 💣 before it escapes.');
        }
        el.remove();
      }
    }, fallDuration+150);
  }

  function damageBoss(amount, area) {
    if (!bossActive) return;
    bossHP = Math.max(0, bossHP - amount);
    const fill = document.getElementById('boss-health-fill');
    if (fill) fill.style.width = (bossMaxHP>0 ? (bossHP/bossMaxHP*100) : 0) + '%';
    if (bossHP <= 0) defeatBoss(area);
  }

  function defeatBoss(area) {
    bossActive = false;
    setTownMovementPaused(false);
    clearInterval(bossWordInterval);
    cleanupCurrentBoss();
    area.querySelectorAll('.falling-word').forEach(w=>w.remove());
    const bossWrap = document.getElementById('boss-wrap'); if (bossWrap) bossWrap.remove();
    const barWrap = document.getElementById('boss-health-bar-wrap'); if (barWrap) barWrap.remove();

    if (activePowerupsThisRun.includes('stage')) {
      const bonusCoins = Math.round(100 * runPerformance);
      const bonusScore = Math.round(150 * runPerformance);
      sessionCoins += bonusCoins; overallScore += bonusScore;
      showFloatingText(area.clientWidth/2-70, 70, '+'+bonusScore+' score / +'+bonusCoins+'🪙 Stage Bonus!', '#d4af37', area);
    }
    stage++;
    stageStartScore = overallScore;
    duelUsedThisStage = false;
    showFloatingText(area.clientWidth/2-70, 40, '🏁 Stage ' + stage + ' — onward!', '#2ecc71', area);
    drawBackground(stage);
    updateHUD();
    if (PlatformManager.powerupsAllowed()) setTimeout(showUpgradePicks, 900);
  }

  function openReload() {
    if(reloadOpen||ammo===maxAmmo||bossActive||bossPreviewActive)return;
    reloadOpen=true;gameActive=false;clearInterval(spawnInterval);
    // Pause every active enemy/decoy's timers so nothing vanishes while you reload
    document.querySelectorAll('#game-area .enemy-wrap').forEach(w=>{
      pauseExpiry(w);
      if (w._teleportTimer) { clearInterval(w._teleportTimer); w._teleportTimer=null; w._teleportPaused=true; }
      if (w._drainTimer) { clearInterval(w._drainTimer); w._drainTimer=null; w._drainPaused=true; }
    });
    reloadStartTime=Date.now();
    document.getElementById('reload-overlay').classList.remove('hidden');
    generateGrid();
  }

  function closeReload() {
    document.getElementById('reload-overlay').classList.add('hidden');
    reloadOpen=false;
    const area=document.getElementById('game-area'), areaW=area.clientWidth, areaH=area.clientHeight;
    document.querySelectorAll('#game-area .enemy-wrap').forEach(w=>{
      resumeExpiry(w);
      if (w._teleportPaused) { startTeleport(w, areaW, areaH, w._teleportSpeed || 750); w._teleportPaused=false; }
      if (w._drainPaused) { startDrain(w); w._drainPaused=false; }
    });
    startEnemySpawning();
  }

  async function generateGrid() {
    if(QuestionManager.getRunQuestionType()!=='category'&&window.MixedQuestionRound){
      const result=await MixedQuestionRound.play();
      if(result.correct>0){totalCorrectAnswers+=result.correct;safeSave();overallScore+=Math.round(2000*result.rewardRatio);ammo=Math.max(1,Math.round(maxAmmo*result.rewardRatio));updateHUD();closeReload();checkStageProgress();}
      else setTimeout(generateGrid,700);
      return;
    }
    const cat = QuestionManager.getNextQuestion();
    const roundCorrect=[...cat.correct].sort(()=>Math.random()-.5).slice(0,4);
    document.getElementById('reload-category').textContent=cat.prompt;
    const shuffled=[...cat.distractors].sort(()=>Math.random()-0.5);
    // Speed Loader / Quick Trigger shrink the grid (fewer distractors to sift through)
    let cellCount = 16 - 2*upStack('speedload');
    if (runModifier && runModifier.smallerReload) cellCount -= 2;
    cellCount = Math.max(roundCorrect.length + 4, Math.min(16, cellCount));
    const words=[...roundCorrect,...shuffled.slice(0,Math.max(0,cellCount-roundCorrect.length))].sort(()=>Math.random()-0.5);
    const grid=document.getElementById('reload-grid');grid.innerHTML='';grid.className='grid grid-cols-4 gap-2';grid.style.pointerEvents='';
    let found=0; const requiredCorrect=Math.min(4,roundCorrect.length);
    let wrongCount=0;
    const masteryMult = 1 + 0.25*upStack('mastery');
    const updateScore=()=>{const t=Math.max(50,Math.round((2000-(Date.now()-reloadStartTime)/4)*masteryMult));document.getElementById('reload-score').textContent='+'+t+' Points';};
    updateScore();const si=setInterval(updateScore,100);
    words.slice(0,cellCount).forEach(w=>{
      const cell=document.createElement('button');
      cell.className='word-cell p-2 text-xs text-center rounded font-bold';cell.textContent=w;
      cell.addEventListener('click',()=>{
        if(cell.classList.contains('selected')||cell.classList.contains('wrong'))return;
        if(roundCorrect.includes(w)){cell.classList.add('selected');found++;if(found>=requiredCorrect){clearInterval(si);totalCorrectAnswers++;safeSave();PlatformManager.recordQuestionAnswered(GAME_CONFIG.id,true);const bonus=Math.max(50,Math.round((2000-(Date.now()-reloadStartTime)/4)*masteryMult));overallScore+=bonus;ammo=maxAmmo;if(hasUp('hotreload'))freeShotsRemaining+=2*upStack('hotreload');updateHUD();closeReload();checkStageProgress();}}
        else{
          cell.classList.add('wrong');wrongCount++;
          PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, false);
          PlatformManager.deductCoins(5);
          if(wrongCount>=2){
            clearInterval(si);
            revealCorrectAnswers(grid, roundCorrect);
            setTimeout(()=>generateGrid(),2000);
          }
        }
      });
      grid.appendChild(cell);
    });
  }

  // Clicking open ground (not an enemy) counts as a missed shot
  document.getElementById('game-area').addEventListener('click', (e)=>{
    if (!gameActive || ammo<=0) return;
    const area = document.getElementById('game-area');
    const rect = area.getBoundingClientRect();
    consumeAmmo(1);
    comboStreak = hasUp('adrenaline') ? Math.floor(comboStreak/2) : 0;
    updateHUD();
    const mx = e.clientX-rect.left-30, my = e.clientY-rect.top-10;
    showFloatingText(mx, my, 'MISS', '#e74c3c', area);
    // Ricochet upgrade: the missed shot bounces to the nearest live enemy
    if (hasUp('ricochet')) {
      const others = [...area.querySelectorAll('.enemy-wrap')].filter(o=>!o.dataset.dead && o.dataset.kind!=='decoy');
      if (others.length) {
        let nearest=null, best=Infinity;
        others.forEach(o=>{
          const ox=parseInt(o.style.left), oy=parseInt(o.style.top);
          const d=Math.hypot(ox-mx, oy-my);
          if (d<best) { best=d; nearest=o; }
        });
        if (nearest) {
          showFloatingText(parseInt(nearest.style.left), parseInt(nearest.style.top)-16, '↩️ Ricochet!', '#00d4ff', area);
          if (damageOtherEnemy(nearest)) finishOffEnemy(nearest, area);
        }
      }
    }
    updateEnemySpawning();
  });

  window.addEventListener('resize',()=>{if(gameActive)drawBackground(stage);});

  // Decorative background: idle outlaw sprites drifting behind the home screen, reusing
  // the same draw functions as gameplay (purely visual, no effect on game state).
  let homeBgEnemies=[];
  function initHomeBgEnemies(){
    const pool=[ENEMY_TYPES[0],ENEMY_TYPES[1],ENEMY_TYPES[2],ENEMY_TYPES[4],ENEMY_TYPES[6]];
    homeBgEnemies=[];
    for(let i=0;i<5;i++){
      const type=pool[i%pool.length];
      homeBgEnemies.push({type,x:Math.random()*600,y:Math.random()*500,vx:(Math.random()-0.5)*0.5,vy:(Math.random()-0.5)*0.35});
    }
  }
  function animateHomeBg(){
    const canvas=document.getElementById('home-bg');
    const screen=document.getElementById('home-screen');
    if(canvas&&screen&&screen.classList.contains('active')){
      if(canvas.width!==canvas.clientWidth||canvas.height!==canvas.clientHeight){
        canvas.width=canvas.clientWidth;canvas.height=canvas.clientHeight;
      }
      const bctx=canvas.getContext('2d');
      bctx.clearRect(0,0,canvas.width,canvas.height);
      homeBgEnemies.forEach(e=>{
        e.x+=e.vx;e.y+=e.vy;
        if(e.x<-100)e.x=canvas.width+60;
        if(e.x>canvas.width+60)e.x=-100;
        if(e.y<-100)e.y=canvas.height+60;
        if(e.y>canvas.height+60)e.y=-100;
        bctx.save();
        bctx.translate(e.x,e.y);
        e.type.draw(bctx);
        bctx.restore();
      });
    }
    requestAnimationFrame(animateHomeBg);
  }
  initHomeBgEnemies();
  animateHomeBg();
