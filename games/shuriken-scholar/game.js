// Shuriken Scholar Game.js
    // Config editable via Canva
    const defaultConfig = {
      game_title: "Shuriken Scholar",
      enemy_name: "enemies"
    };

    // Identifies this game to the shared PlatformManager (shared/js/PlatformManager.js).
    // Platform-wide stats (coins, question totals, sessions, high score) are keyed by this id.
    const GAME_CONFIG = { id: 'shuriken-scholar', name: 'Shuriken Scholar' };
    function shurikenCosmetic(id){return typeof AchievementManager!=='undefined'&&Object.values(AchievementManager.getEquipped('shuriken-scholar')).some(r=>r?.id===id);}
    function shurikenSecret(id){return typeof AchievementManager!=='undefined'&&AchievementManager.hasSecret?.(id);}

    // Change this value if this game is ever updated to use a different bank type.
    // Shuriken Scholar currently supports only multiple-choice question banks.
    const QUESTION_BANK_TYPE = 'multichoice';
    const SPAWNING_ADDS_UPGRADE_AMOUNT = false;

    let ctx;
    const canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    // Game state
    let game = { active: false, paused: false, time: 0, frame: 0 };
    const secretMoveKeys={};let secretWorldX=0,secretWorldY=0;
    addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD'].includes(e.code)){secretMoveKeys[e.code]=true;if(shurikenSecret('secret_map_border'))e.preventDefault();}});
    addEventListener('keyup',e=>{secretMoveKeys[e.code]=false;});
    let player = { x: 400, y: 300, hp: 100, maxHp: 100, level: 1, exp: 0, kills: 0, character: 'ninja', facingAngle: 0 };
    const NINJA_WEAPON_KEYS = ['shuriken', 'dart', 'smoke', 'trap'];
    const SAMURAI_WEAPON_KEYS = ['katana', 'naginata', 'bow', 'servant'];
    const SKELETON_WEAPON_KEYS = ['bone', 'soulOrb', 'graveMist', 'ribTrap'];
    const PARADOX_WEAPON_KEYS = ['riftBlade', 'chronoShard', 'anomalyField', 'echoSigil'];
    const ALL_WEAPON_KEYS = [...NINJA_WEAPON_KEYS, ...SAMURAI_WEAPON_KEYS, ...SKELETON_WEAPON_KEYS, ...PARADOX_WEAPON_KEYS];
    const CHARACTER_WEAPON_KEYS={ninja:NINJA_WEAPON_KEYS,samurai:SAMURAI_WEAPON_KEYS,skeleton:SKELETON_WEAPON_KEYS,paradox:PARADOX_WEAPON_KEYS};
    const CHARACTER_WEAPON_BASE={bone:'shuriken',soulOrb:'dart',graveMist:'smoke',ribTrap:'trap',riftBlade:'shuriken',chronoShard:'dart',anomalyField:'smoke',echoSigil:'trap'};

    // NOTE: the persistent coin balance is NOT stored here — it lives in
    // PlatformManager (shared/js/PlatformManager.js) as the single source of
    // truth for the shared coin economy. Use PlatformManager.getCoins() /
    // addCoins() / spendCoins() instead of a local field. `runCoins` below is
    // this run's in-progress, not-yet-banked earnings, which stays local.
    let progress = {
      runCoins: 0, runNumber: 1, deaths: 0, powerupStart: 0,
      questionsCorrect: 0, selectedPowerups: [], bestLevel: 0,
      ownedStages: ['training-grounds'], selectedStage: 'training-grounds', stageBestLevels: {'training-grounds':0}, boneWeaponSkins: {},
      questionWeights: {},
      playedCodes: [], samuraiUnlocked: false, selectedCharacter: 'ninja',
      weapons: {
        shuriken: { unlocked: true, kills: 0, level: 0, path: null, levelA: 0, levelB: 0, repeatBuys: 0, subPath: null, levelC: 0, levelD: 0, subRepeatBuys: 0 },
        dart:     { unlocked: false, kills: 0, level: 0, path: null, levelA: 0, levelB: 0, repeatBuys: 0, subPath: null, levelC: 0, levelD: 0, subRepeatBuys: 0 },
        smoke:    { unlocked: false, kills: 0, level: 0, path: null, levelA: 0, levelB: 0, repeatBuys: 0, subPath: null, levelC: 0, levelD: 0, subRepeatBuys: 0 },
        trap:     { unlocked: false, kills: 0, level: 0, path: null, levelA: 0, levelB: 0, repeatBuys: 0, subPath: null, levelC: 0, levelD: 0, subRepeatBuys: 0 },
        katana:   { unlocked: true, kills: 0, level: 0, path: null, levelA: 0, levelB: 0, repeatBuys: 0, subPath: null, levelC: 0, levelD: 0, subRepeatBuys: 0 },
        naginata: { unlocked: false, kills: 0, level: 0, path: null, levelA: 0, levelB: 0, repeatBuys: 0, subPath: null, levelC: 0, levelD: 0, subRepeatBuys: 0 },
        bow:      { unlocked: false, kills: 0, level: 0, path: null, levelA: 0, levelB: 0, repeatBuys: 0, subPath: null, levelC: 0, levelD: 0, subRepeatBuys: 0 },
        servant:  { unlocked: false, kills: 0, level: 0, path: null, levelA: 0, levelB: 0, repeatBuys: 0, subPath: null, levelC: 0, levelD: 0, subRepeatBuys: 0 }
        ,bone: { unlocked:true,kills:0,level:0,path:null,levelA:0,levelB:0,repeatBuys:0,subPath:null,levelC:0,levelD:0,subRepeatBuys:0 }
        ,soulOrb: { unlocked:false,kills:0,level:0,path:null,levelA:0,levelB:0,repeatBuys:0,subPath:null,levelC:0,levelD:0,subRepeatBuys:0 }
        ,graveMist: { unlocked:false,kills:0,level:0,path:null,levelA:0,levelB:0,repeatBuys:0,subPath:null,levelC:0,levelD:0,subRepeatBuys:0 }
        ,ribTrap: { unlocked:false,kills:0,level:0,path:null,levelA:0,levelB:0,repeatBuys:0,subPath:null,levelC:0,levelD:0,subRepeatBuys:0 }
        ,riftBlade: { unlocked:true,kills:0,level:0,path:null,levelA:0,levelB:0,repeatBuys:0,subPath:null,levelC:0,levelD:0,subRepeatBuys:0 }
        ,chronoShard: { unlocked:false,kills:0,level:0,path:null,levelA:0,levelB:0,repeatBuys:0,subPath:null,levelC:0,levelD:0,subRepeatBuys:0 }
        ,anomalyField: { unlocked:false,kills:0,level:0,path:null,levelA:0,levelB:0,repeatBuys:0,subPath:null,levelC:0,levelD:0,subRepeatBuys:0 }
        ,echoSigil: { unlocked:false,kills:0,level:0,path:null,levelA:0,levelB:0,repeatBuys:0,subPath:null,levelC:0,levelD:0,subRepeatBuys:0 }
      }
    };
    const SAVE_KEY = 'ninjaShurikenGameProgress';
    // Only total coins and per-weapon kill counts persist across a refresh.
    // Levels/paths always reset fresh so a student can freely try a different pathway.
    function saveProgress() {
      try {
        const weaponKills = {};
        for (const key of ALL_WEAPON_KEYS) weaponKills[key] = progress.weapons[key].kills;
        const slim = {
          questionsCorrect: progress.questionsCorrect,
          bestLevel: progress.bestLevel,
          playedCodes: progress.playedCodes,
          samuraiUnlocked: progress.samuraiUnlocked,
          questionWeights: progress.questionWeights,
          ownedStages: progress.ownedStages,
          selectedStage: progress.selectedStage,
          stageBestLevels: progress.stageBestLevels,
          boneWeaponSkins: progress.boneWeaponSkins,
          weaponKills
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(slim));
      } catch (e) {
        // localStorage unavailable (e.g. private browsing) — fail silently, progress just won't persist.
      }
    }
    function loadProgress() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (typeof saved.questionsCorrect === 'number') progress.questionsCorrect = saved.questionsCorrect;
        if (typeof saved.bestLevel === 'number') progress.bestLevel = saved.bestLevel;
        if (Array.isArray(saved.playedCodes)) progress.playedCodes = saved.playedCodes;
        if (saved.samuraiUnlocked) progress.samuraiUnlocked = true;
        if (saved.questionWeights && typeof saved.questionWeights === 'object') progress.questionWeights = saved.questionWeights;
        if (Array.isArray(saved.ownedStages)) progress.ownedStages = saved.ownedStages;
        if (typeof saved.selectedStage === 'string' && progress.ownedStages.includes(saved.selectedStage)) progress.selectedStage = saved.selectedStage;
        if (saved.stageBestLevels && typeof saved.stageBestLevels === 'object') progress.stageBestLevels = saved.stageBestLevels;
        if (saved.boneWeaponSkins && typeof saved.boneWeaponSkins === 'object') progress.boneWeaponSkins = saved.boneWeaponSkins;
        if (saved.weaponKills) {
          for (const key of ALL_WEAPON_KEYS) {
            const k = saved.weaponKills[key];
            if (typeof k === 'number') {
              progress.weapons[key].kills = k;
              if (k >= WEAPON_UNLOCK_KILLS) progress.weapons[key].unlocked = true;
            }
          }
        }
      } catch (e) {
        // Corrupt or missing save — just start fresh.
      }
    }

    const WEAPON_UNLOCK_KILLS = 10;
    progress.stageBestLevels['training-grounds']=Math.max(progress.stageBestLevels['training-grounds']||0,progress.bestLevel||0);
    const STAGES = [
      {id:'training-grounds',name:'Training Grounds',cost:0,previous:null,desc:'The original battleground.'},
      {id:'nightmare-forest',name:'Nightmare Forest',cost:1000,previous:'training-grounds',desc:'Detailed spiders replace slimes. All enemies move 15% faster.'},
      {id:'ruined-kingdom',name:'Ruined Kingdom',cost:1000,previous:'nightmare-forest',desc:'Sword skeletons and teleporting fire mages. All enemies have double health.'}
    ];
    const BONE_SKIN_NAMES={shuriken:'Bone Shuriken',dart:'Bone Darts',smoke:'Bone Dust Bomb',trap:'Ribcage Trap',katana:'Bone Katana',naginata:'Spine Naginata',bow:'Bone Bow',servant:'Bone Servant',bone:'Polished Bone Throw',soulOrb:'Skull Soul Orb',graveMist:'Bone-Dust Grave Mist',ribTrap:'Fossilised Ribcage',riftBlade:'Bone Rift Blade',chronoShard:'Fossil Chrono Shard',anomalyField:'Ossuary Anomaly',echoSigil:'Bone Echo Sigil'};
    function boneSkin(key){return !!progress.boneWeaponSkins?.[key];}
    loadProgress();
    updateHomeStats();

    function renderCharacterSelectors() {
      const show = progress.samuraiUnlocked||shurikenSecret('secret_skeleton')||shurikenSecret('secret_glitch_aura');
      const homeDiv = document.getElementById('charSelectHome');
      const guideDiv = document.getElementById('charSelectGuide');
      if (homeDiv) homeDiv.style.display = show ? '' : 'none';
      if (guideDiv) guideDiv.style.display = show ? '' : 'none';
      if (!show) return;

      const setSelected = (key) => {
        progress.selectedCharacter = key;
        renderCharacterSelectors();
      };

      for (const suffix of ['Home', 'Guide']) {
        const ninjaBtn = document.getElementById(`charBtnNinja${suffix}`);
        const samuraiBtn = document.getElementById(`charBtnSamurai${suffix}`);
        if (!ninjaBtn || !samuraiBtn) continue;
        ninjaBtn.textContent = (progress.selectedCharacter === 'ninja' ? '✅ ' : '') + '🥷 Ninja';
        samuraiBtn.textContent = (progress.selectedCharacter === 'samurai' ? '✅ ' : '') + '⚔️ Samurai';
        ninjaBtn.onclick = () => setSelected('ninja');
        samuraiBtn.onclick = () => setSelected('samurai');
        const host=ninjaBtn.parentElement;
        for(const [id,label,secret] of [['skeleton','💀 Skeleton','secret_skeleton'],['paradox','🌀 Paradox Scholar','secret_glitch_aura']]){let btn=document.getElementById(`charBtn${id}${suffix}`);if(shurikenSecret(secret)){if(!btn){btn=document.createElement('button');btn.id=`charBtn${id}${suffix}`;btn.className=ninjaBtn.className;host.appendChild(btn);}btn.textContent=(progress.selectedCharacter===id?'✅ ':'')+label;btn.onclick=()=>setSelected(id);}else btn?.remove();}
      }
    }
    renderCharacterSelectors();
    window.addEventListener('arcade-achievement-manager-ready',renderCharacterSelectors);
    window.addEventListener('arcade-progression-changed',renderCharacterSelectors);

    function checkSamuraiUnlock() {
      if (window.AchievementManager?.hasTypeUnlock?.('shuriken-scholar-samurai')) progress.samuraiUnlocked = true;
      if (progress.samuraiUnlocked) {window.AchievementManager?.grantTypeUnlock?.('shuriken-scholar-samurai',{name:'Samurai',kind:'character',gameId:GAME_CONFIG.id,detail:'Playable Samurai and Samurai weapon paths.'});return;}
      const overall=PlatformManager.getOverallStats?.()||{};
      const qualifying=(PlatformManager.getAllGameStats?.()||[]).filter(g=>g.gameId!==GAME_CONFIG.id&&(g.correct||0)>=150);
      if ((overall.totalCorrect||progress.questionsCorrect) >= 750 && qualifying.length >= 3) {
        progress.samuraiUnlocked = true;
        window.AchievementManager?.grantTypeUnlock?.('shuriken-scholar-samurai',{name:'Samurai',kind:'character',gameId:GAME_CONFIG.id,detail:'Playable Samurai and Samurai weapon paths.'});
        saveProgress();
        triggerSamuraiUnlockEffect();
        updateHomeStats();
        renderCharacterSelectors();
      }
    }

    function triggerSamuraiUnlockEffect() {
      const now = Date.now();
      const cx = (typeof game !== 'undefined' && game.active) ? player.x : 400;
      const cy = (typeof game !== 'undefined' && game.active) ? player.y : 300;
      const colors = ['#ffd700', '#ff0055', '#00d4ff', '#ffffff'];
      for (let i = 0; i < 70; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 6 + 3, color: colors[Math.floor(Math.random() * colors.length)], start: now, life: 1800 });
      }
      particles.push({ x: 400, y: 250, vx: 0, vy: 0, text: '⚔️ A new warrior has awakened...', color: '#ffd700', fontSize: 22, start: now, life: 3500 });

      const toast = document.getElementById('unlockToast');
      if (toast) {
        toast.textContent = '⚔️ A new warrior has awakened... The Samurai is now playable!';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4500);
      }
    }

    const WEAPON_NAMES = { shuriken: '🥷 Shurikens', dart: '🏹 Darts', smoke: '💨 Smoke Bomb', trap: '💥 Shadow Trap', katana: '⚔️ Katana', naginata: '🗡️ Naginata', bow: '🏹 Bow', servant: '👺 Summoned Servant', bone:'🦴 Bone Throw',soulOrb:'👻 Soul Orb',graveMist:'☠️ Grave Mist',ribTrap:'🦴 Ribcage Trap',riftBlade:'🌌 Rift Blade',chronoShard:'⏳ Chrono Shard',anomalyField:'🌀 Anomaly Field',echoSigil:'🪞 Echo Sigil' };

    const SINGLE_USE_POWERUPS = {
      killValue: { name: '💰 Bounty Hunter', desc: "Each kill counts extra toward your weapon mastery this run.", unlockAt: 20 },
      highLevel: { name: '🚀 Head Start', desc: "Begin the run already leveled up.", unlockAt: 40 },
      randomRewards: { name: '🎁 Lucky Start', desc: "Begin the run with a handful of free powerups already active.", unlockAt: 60 },
      coinsPerKill: { name: '🪙 Treasure Hunter', desc: "Earn bonus coin with every kill this run.", unlockAt: 80 }
    };
    // Run-scoped values set by single-use powerups; reset every run in reset().
    let runPowerupEffects = { killValueMult: 1, coinBonusPerKill: 0 };

    const ENEMY_DISPLAY_NAMES = {
      slime: 'Slime', spider:'Nightmare Spider', swordsman:'Skeleton Swordsman', mage:'Skeleton Mage', bat: 'Bat', ghost: 'Ghost', eye: 'Eye', archer: 'Skeleton Archer',
      troll: 'Troll', golem: 'Mud Golem', tree_golem: 'Tree Golem', smoke_golem: 'Smoke Golem', fire_golem: 'Fire Golem',
      mimic: 'Mimic'
    };
    const ENEMY_WEAKNESS = {
      golem: 'Shadow Traps', tree_golem: 'Darts', smoke_golem: 'Smoke Bombs', fire_golem: 'Direct Shuriken Hits'
    };
    let lastDeathInfo = null;

    function getDeathMessage(info) {
      if (!info) return '';
      let label = ENEMY_DISPLAY_NAMES[info.type] || info.type;
      if (info.type === 'fire_golem' && info.size) {
        const sizeLabel = info.size === 'full' ? 'Full-size' : info.size === 'half' ? 'Half-size' : 'Quarter-size';
        label = `${sizeLabel} ${label}`;
      }
      if (info.metal) label = `Metal ${label}`;

      let msg = info.method === 'arrow'
        ? `☠️ You were struck down by an arrow from a ${label}, dealing ${info.damage} damage.`
        : `☠️ You were killed by a ${label}, which hit you for ${info.damage} damage.`;

      const weakness = ENEMY_WEAKNESS[info.type];
      if (weakness) msg += ` Next time, try ${weakness}.`;
      return msg;
    }
    // Cost/kill requirement to buy the *next* level for a weapon.
    function weaponLevelCost(weaponKey, nextLevel, repeatBuys) {
      if (nextLevel === 1) return { coin: PlatformManager.permanentUpgradeCost(0), kills: 0 };
      if (nextLevel === 2) return { coin: PlatformManager.permanentUpgradeCost(1), kills: 0 };
      if (nextLevel === 3) return { coin: PlatformManager.permanentUpgradeCost(2), kills: weaponKey === 'shuriken' ? 200 : 100 };
      if (nextLevel === 4) return { coin: PlatformManager.permanentUpgradeCost(3), kills: weaponKey === 'shuriken' ? 300 : 200 };
      if (nextLevel === 5) return { coin: PlatformManager.permanentUpgradeCost(4), kills: weaponKey === 'shuriken' ? 400 : 300 };
      // Level 10+ is the new repeatable tier: cost grows 1.5x per purchase.
      const n = repeatBuys + 1;
      return { coin: PlatformManager.permanentUpgradeCost(9 + repeatBuys), kills: (9 + n) * 100 };
    }
    // Costs for the second branch (levels 6-9), mirroring the 1-4 pattern shifted by +5.
    function weaponSubLevelCost(weaponKey, nextLevel) {
      if (nextLevel === 6) return { coin: PlatformManager.permanentUpgradeCost(5), kills: 0 };
      if (nextLevel === 7) return { coin: PlatformManager.permanentUpgradeCost(6), kills: weaponKey === 'shuriken' ? 500 : 350 };
      if (nextLevel === 8) return { coin: PlatformManager.permanentUpgradeCost(7), kills: weaponKey === 'shuriken' ? 650 : 450 };
      return { coin: PlatformManager.permanentUpgradeCost(8), kills: weaponKey === 'shuriken' ? 800 : 550 }; // level 9
    }
    function runtimeWeaponKey(key){
      if(player.character==='skeleton') return ({shuriken:'bone',dart:'soulOrb',smoke:'graveMist',trap:'ribTrap'})[key]||key;
      if(player.character==='paradox') return ({shuriken:'riftBlade',dart:'chronoShard',smoke:'anomalyField',trap:'echoSigil'})[key]||key;
      return key;
    }
    function wInfo(key) { return progress.weapons[runtimeWeaponKey(key)]; }
    function wLevel(key) { return wInfo(key).level; }
    function wPath(key) { return wInfo(key).path; }
    function wUnlocked(key) { return wInfo(key).unlocked; }
    // Levels 1-2 can be bought independently in EITHER path before committing.
    // Buying level 3 locks in whichever path you buy it for (the other path's L1/L2 stop applying).
    // Levels 1-2 can be bought independently in EITHER path before committing, and once bought they
    // stay active forever — even after you commit to the other path at level 3. Only the *committed*
    // path can progress past level 2.
    function pathLevel(key, path) {
      const w = progress.weapons[runtimeWeaponKey(key)];
      if (w.path === path) return Math.min(w.level, 5); // main path caps at 5 - level 5 no longer stacks
      // Not the committed path (or no path chosen yet): whatever was bought pre-commit (max level 2) still applies.
      return path === 'A' ? Math.min(w.levelA, 2) : Math.min(w.levelB, 2);
    }
    // Level 5 is now a single fixed ability (not repeatable): returns 1 once owned, 0 otherwise.
    function wRepeats(key) {
      const w = progress.weapons[runtimeWeaponKey(key)];
      return (w.path && w.level >= 5) ? 1 : 0;
    }
    // Mirrors pathLevel/wRepeats, but for the second branch (levels 6-10+) that only
    // reveals once level 5 has been bought. Levels 6 is the pre-commit level (buyable
    // in either C or D), level 7 locks it in (just like level 3 locks A/B), and level
    // 10 is the new repeatable tier.
    function subPathLevel(key, subpath) {
      const w = progress.weapons[runtimeWeaponKey(key)];
      if (!w.path || w.level < 5) return 0;
      if (w.subPath === subpath) return Math.min(w.level, 10);
      return subpath === 'C' ? Math.min(w.levelC, 6) : Math.min(w.levelD, 6);
    }
    function wSubRepeats(key) {
      const w = progress.weapons[runtimeWeaponKey(key)];
      return (w.subPath && w.level >= 10) ? Math.max(1, w.subRepeatBuys) : 0;
    }
    let upgrades = { projSpeed: 5, damage: 1, cooldown: 900, smokeUnlocked: false, smokeDamage: 1, smokeCooldown: 4000, shadowUnlocked: false, shadowDamage: 2, shadowRadius: 100, shadowCooldown: 10000, dartUnlocked: false, dartAmount: 2, dartRange: 120, dartCooldown: 3000,
      katanaCooldown: 900, katanaDamage: 3, katanaRange: 70, katanaArc: 70,
      naginataUnlocked: false, naginataCooldown: 1600, naginataDamage: 3, naginataRange: 160, naginataSpeed: 3,
      bowUnlocked: false, bowCooldown: 1300, bowDamage: 2, bowSpeed: 4.5,
      servantUnlocked: false, servantCooldown: 8000, servantDamage: 1, servantLifetime: 15000,
      shadowRadiusPicks: 0, shurikenDamageMult: 1, dartDamageMult: 1 };

    // Cursed Cards: run-scoped risk/reward effects. Reset every run in reset().
    let curseEffects = { bloodPact: false, coinMult: 1, spawnRateMult: 1, voidChanceMult: 1, voidDamageTakenMult: 1 };

    // "Grows bigger" upgrades (radius, area, etc.) stack linearly off the base value
    // instead of multiplicatively - unlike cooldowns, growth has no natural ceiling,
    // so multiplicative stacking here would spiral out of control much faster.
    const GROWTH_LINEAR_STEP = 0.10;
    function applyLinearGrowth(base, picks) {
      return base * (1 + GROWTH_LINEAR_STEP * picks);
    }

    // Entities and IDs
    let nextEnemyId = 1;
    let nextRootId = 1;
    let enemies = [];
    let bullets = [];
    let enemyArrows = [];
    let shadowTraps = [];
    let darts = [];
    let particles = [];
    let rootSpikes = [];
    let smokeClouds = [];
    let poisonPools = [];
    let shurikenMag = { current: 2, capacity: 2, lastRegen: 0 };

    // Samurai weapon entities
    let katanaSlashFX = [];
    let naginataHitCounter = 0;
    let shurikenShotCounter = 0;
    let trapTriggerCounter = 0;
    // Naginata damage wrapper: Dragon Fang (every 5th hit), Weak Point (crit vs tougher
    // enemies), and Execution (instant kill below 20% HP).
    function applyNaginataHit(e, baseDmg) {
      const subC = subPathLevel('naginata', 'C');
      const nagW = progress.weapons.naginata;
      let dmg = baseDmg;

      if (nagW.subPath === 'C' && subC >= 6) {
        naginataHitCounter++;
        if (naginataHitCounter % 5 === 0) dmg *= 3;
      }
      if (nagW.subPath === 'C' && subC >= 7 && e.maxHp > 1) {
        dmg *= 2;
      }
      if (nagW.subPath === 'C' && subC >= 9 && !e.dead && e.hp / e.maxHp <= 0.2) {
        markEnemyDead(e, 'naginata');
        return;
      }
      dealWeaponDamage(e, dmg, 'naginata');
    }
    let shockwaves = [];
    let naginataSpears = [];
    let bowArrows = [];
    let arrowRainMarkers = [];
    let samuraiServants = [];
    let lastKatana = 0;
    let lastNaginata = 0;
    let lastBow = 0;
    let lastServant = 0;
    let servantReady = true;
    let honor = 0; // Bushido passive

    // Boss / void variant state
    let healingOrbs = [];
    let trollFireballs = [];
    let ectoplasmMarkers = [];
    let voidGhostTrail = [];
    let voidLasers = [];
    let bossMilestonesSpawned = new Set();
    let activeBossId = null;
    let ninjaUpgradesPurchased = 0;
    let samuraiUpgradesPurchased = 0;
    function currentCharUpgrades() { return player.character === 'samurai' ? samuraiUpgradesPurchased : ninjaUpgradesPurchased; }

    // Camera shake state
    let shakeStart = 0;
    let shakeDuration = 0;
    let shakeIntensity = 0;
    function triggerShake(intensity, duration) {
      shakeStart = Date.now();
      shakeDuration = duration;
      shakeIntensity = intensity;
    }
    function getShakeOffset() {
      if (shakeDuration <= 0) return { x: 0, y: 0 };
      const elapsed = Date.now() - shakeStart;
      if (elapsed >= shakeDuration) { shakeDuration = 0; return { x: 0, y: 0 }; }
      const falloff = 1 - (elapsed / shakeDuration);
      const mag = shakeIntensity * falloff;
      return { x: (Math.random() - 0.5) * 2 * mag, y: (Math.random() - 0.5) * 2 * mag };
    }
    function getVoidChance() { return Math.min(1, currentCharUpgrades() * 0.005 * curseEffects.voidChanceMult); } // halved from 0.01

    // The Mimic's void variant only exists once the player has committed to and leveled
    // 2 separate weapon paths to at least level 5 - a marker of a well-progressed run.
    function hasTwoMaxedPaths() {
      let count = 0;
      for (const key in progress.weapons) {
        const w = progress.weapons[key];
        if (w.path && w.level >= 5) count++;
      }
      return count >= 2;
    }
    function getMimicVoidChance() {
      return hasTwoMaxedPaths() ? getVoidChance() : 0;
    }
    function getMimicSpawnChance() {
      return Math.max(0, Math.min(10, currentCharUpgrades() - 5)) / 100;
    }
    function getExpReq(level) { return level * (5 + currentCharUpgrades()) * 10; } // linear scaling; kills needed = level*(5+upgrades) since each kill = 10 XP

    // Safety caps
    const MAX_BULLETS = 60;
    const MAX_DARTS = 40;
    const BASE_SHURIKEN_COOLDOWN = 900;
    const BASE_SMOKE_COOLDOWN = 4000;
    const BASE_DART_COOLDOWN = 3000;
    const BASE_KATANA_COOLDOWN = 900;
    const BASE_NAGINATA_COOLDOWN = 1600;
    const BASE_SHADOW_RADIUS = 100;
    const BASE_BOW_COOLDOWN = 2600;
    const TROLL_REGEN_INTERVAL = BASE_SHURIKEN_COOLDOWN * 0.95; // troll regenerates 1 HP at this interval if left unhit

    // Timers and inputs
    let lastShoot = 0;
    let lastSmoke = 0;
    let lastShadow = 0;
    let lastDart = 0;
    let targetX = 401;
    let targetY = 300;
    let samuraiWalkTargetX = 400;
    let samuraiWalkTargetY = 300;
    const SAMURAI_WALK_SPEED = 2.4;
    let shadowReady = true;

    // Quiz state. usedQuestions holds references to question objects already
    // served in the current quiz (not indices) — QuestionManager owns the
    // underlying question array now, so exclusion is done by identity.
    let quiz = { index: 0, correct: 0, forPowerup: false, pending: 0, usedQuestions: [], questionCount: 4 };

    // Helper functions
    function norm(dx, dy) {
      const d = Math.hypot(dx, dy);
      if (d === 0) return { nx: 0, ny: 0, d: 0 };
      return { nx: dx / d, ny: dy / d, d };
    }
    function clampParticles(max = 400) {
      if (particles.length > max) {
        const removeCount = Math.max(50, Math.floor((particles.length - max) * 0.25));
        particles.splice(0, removeCount);
      }
    }

    function drawBackground() {
      ctx.fillStyle = progress.selectedStage==='nightmare-forest'?'#07150f':progress.selectedStage==='ruined-kingdom'?'#17131d':'#2a2a3e';
      ctx.fillRect(0, 0, 800, 600);

      const bgOffX=shurikenSecret('secret_map_border')?((secretWorldX%64)+64)%64:0,bgOffY=shurikenSecret('secret_map_border')?((secretWorldY%64)+64)%64:0;
      for (let y = -64+bgOffY; y < 664; y += 64) {
        for (let x = -64+bgOffX; x < 864; x += 64) {
          ctx.fillStyle = progress.selectedStage==='nightmare-forest'?(((x/64+y/64)%2===0)?'#10281c':'#0b2016'):progress.selectedStage==='ruined-kingdom'?(((x/64+y/64)%2===0)?'#302839':'#241e2b'):(((x/64 + y/64) % 2 === 0) ? '#3a3a52' : '#2f2f45');
          ctx.fillRect(x, y, 64, 64);
          ctx.fillStyle = '#1a1a28';
          ctx.fillRect(x, y, 64, 2);
          ctx.fillRect(x, y, 2, 64);
        }
      }

      ctx.strokeStyle = '#1a1a28';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(150, 100); ctx.lineTo(180, 140); ctx.lineTo(200, 160); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(400, 300); ctx.lineTo(450, 320); ctx.lineTo(480, 340); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(600, 200); ctx.lineTo(630, 230); ctx.lineTo(650, 250); ctx.stroke();

      ctx.fillStyle = '#d4d4c8';
      ctx.fillRect(100, 450, 20, 20);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(105, 455, 4, 4);
      ctx.fillRect(111, 455, 4, 4);
      ctx.fillRect(107, 463, 6, 3);

      ctx.fillStyle = '#d4d4c8';
      ctx.fillRect(700, 100, 20, 20);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(705, 105, 4, 4);
      ctx.fillRect(711, 105, 4, 4);
      ctx.fillRect(707, 113, 6, 3);

      ctx.fillStyle = '#4a4a5a';
      ctx.fillRect(50, 50, 30, 80);
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(52, 52, 26, 76);
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(55, 55, 20, 10);

      ctx.fillStyle = '#4a4a5a';
      ctx.fillRect(720, 480, 30, 90);
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(722, 482, 26, 86);
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(725, 485, 20, 10);

      ctx.fillStyle = '#8b4513';
      ctx.fillRect(660, 520, 25, 40);
      ctx.fillRect(655, 530, 35, 30);
      ctx.fillStyle = '#654321';
      ctx.fillRect(665, 525, 15, 10);

      ctx.fillStyle = '#8b4513';
      ctx.fillRect(120, 200, 25, 40);
      ctx.fillRect(115, 210, 35, 30);
      ctx.fillStyle = '#654321';
      ctx.fillRect(125, 205, 15, 10);

      ctx.fillStyle = '#d4d4c8';
      ctx.fillRect(250, 500, 15, 3);
      ctx.fillRect(500, 150, 15, 3);
      ctx.fillRect(300, 80, 3, 15);
      ctx.fillRect(550, 450, 3, 15);

      ctx.fillStyle = '#1a1a28';
      ctx.fillRect(0, 0, 800, 30);
      ctx.fillRect(0, 570, 800, 30);
      ctx.fillRect(0, 0, 30, 600);
      ctx.fillRect(770, 0, 30, 600);

      ctx.fillStyle = '#252535';
      for (let i = 0; i < 800; i += 40) { ctx.fillRect(i, 5, 38, 20); ctx.fillRect(i + 20, 575, 38, 20); }
      for (let i = 0; i < 600; i += 40) { ctx.fillRect(5, i, 20, 38); ctx.fillRect(775, i + 20, 20, 38); }
      if(shurikenCosmetic('shuriken-scholar_wild_west_ronin')){
        const g=ctx.createLinearGradient(0,0,0,600);g.addColorStop(0,'#b75a28');g.addColorStop(.55,'#df9850');g.addColorStop(1,'#75401f');ctx.fillStyle=g;ctx.fillRect(0,0,800,600);
        ctx.fillStyle='#9b592a';ctx.fillRect(0,0,800,600);ctx.fillStyle='#6f381f';for(let i=0;i<34;i++){ctx.fillRect((i*137+43)%800,(i*211+71)%600,24+(i%5)*14,4+(i%2)*2);}
        // Top-down terrain: cracked clay, scattered stones, wheel ruts and dry scrub.
        ctx.strokeStyle='#603019';ctx.lineWidth=2;for(let i=0;i<18;i++){const x=(i*173+29)%760+20,y=(i*109+47)%550+25;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+8+(i%3)*4,y-7);ctx.lineTo(x+15,y+2);ctx.moveTo(x+8,y-7);ctx.lineTo(x+5,y-15);ctx.stroke();}
        ctx.fillStyle='#7c4527';for(let i=0;i<28;i++){const x=(i*191+61)%790,y=(i*83+33)%590,r=2+(i%4);ctx.fillRect(x-r,y-r,r*2,r*2);ctx.fillStyle='#b97843';ctx.fillRect(x-r,y-r,r,1);ctx.fillStyle='#7c4527';}
        ctx.strokeStyle='rgba(72,36,18,.52)';ctx.lineWidth=3;ctx.setLineDash([14,11]);ctx.beginPath();ctx.moveTo(-20,330);ctx.bezierCurveTo(180,275,360,390,820,295);ctx.moveTo(-20,354);ctx.bezierCurveTo(180,299,360,414,820,319);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle='#416b2d';for(const [x,y,s] of [[90,95,.8],[320,170,.65],[700,105,.9],[160,390,.7],[520,470,.85],[735,340,.6]]){ctx.fillRect(x-5*s,y-29*s,10*s,58*s);ctx.fillRect(x-21*s,y-11*s,16*s,8*s);ctx.fillRect(x-21*s,y-21*s,7*s,18*s);ctx.fillRect(x+5*s,y-2*s,18*s,8*s);ctx.fillRect(x+16*s,y-14*s,7*s,20*s);}
        ctx.strokeStyle='#ead8ad';ctx.lineWidth=5;for(const [x,y] of [[205,250],[590,170],[410,520],[670,440]]){ctx.beginPath();ctx.arc(x-10,y,10,Math.PI,0);ctx.arc(x+10,y,10,Math.PI,0);ctx.stroke();ctx.beginPath();ctx.moveTo(x-20,y);ctx.lineTo(x-30,y-12);ctx.moveTo(x+20,y);ctx.lineTo(x+30,y-12);ctx.stroke();}
        ctx.strokeStyle='#d8c28e';ctx.lineWidth=3;for(const [x,y,a] of [[120,520,.2],[455,105,-.5],[745,555,.4]]){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.beginPath();ctx.moveTo(-16,0);ctx.lineTo(16,0);ctx.moveTo(-8,-6);ctx.lineTo(-8,6);ctx.moveTo(0,-6);ctx.lineTo(0,6);ctx.moveTo(8,-6);ctx.lineTo(8,6);ctx.stroke();ctx.restore();}
        ctx.strokeStyle='#8a5a31';ctx.lineWidth=3;for(const [x,y] of [[275,80],[620,380],[360,450]]){ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.arc(x-7,y+2,9,0,Math.PI*2);ctx.arc(x+6,y-4,8,0,Math.PI*2);ctx.stroke();}
      }
    }

    function shadeColor(hex, percent) {
      if (!hex || hex[0] !== '#' || hex.length !== 7) return hex;
      const num = parseInt(hex.slice(1), 16);
      let r = (num >> 16) + Math.round(2.55 * percent);
      let g = ((num >> 8) & 0x00FF) + Math.round(2.55 * percent);
      let b = (num & 0x0000FF) + Math.round(2.55 * percent);
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
    }

    // Draws a rectangle with a subtle top-to-bottom gradient + a dark outline for a more
    // rendered, less flat-pixel look.
    function shadedRect(x, y, w, h, color, lineWidth) {
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, shadeColor(color, 22));
      grad.addColorStop(0.55, color);
      grad.addColorStop(1, shadeColor(color, -22));
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = shadeColor(color, -45);
      ctx.lineWidth = lineWidth || 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    // Small glint/highlight for extra dimensionality on rounded or shiny surfaces.
    function drawGlint(x, y, w, h) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, w, h);
    }

    function drawPlayer() {
      const white=shurikenCosmetic('shuriken-scholar_white_shadow_ninja'),cyber=shurikenCosmetic('shuriken-scholar_cyberpunk_scholar'),eclipse=shurikenCosmetic('shuriken-scholar_eclipse_shinobi');
      const renderBase=()=>player.character==='skeleton'?drawPlayerSkeleton():player.character==='paradox'?drawPlayerParadox():cyber?drawCyberpunkScholar(player.character):(player.character==='samurai'?drawPlayerSamurai():drawPlayerNinja());
      const eclipsePulse=.5+.5*Math.sin(game.frame*.016);
      ctx.save();if(white)ctx.filter='grayscale(1) brightness(1.8) contrast(.85)';else if(eclipse)ctx.filter=`invert(1) brightness(${.5+.42*eclipsePulse}) contrast(1.65)`;renderBase();ctx.restore();
      if(eclipse){ctx.save();ctx.globalAlpha=.15+.4*eclipsePulse;ctx.filter='brightness(0)';renderBase();ctx.restore();}
      if(shurikenCosmetic('shuriken-scholar_academy_headband')){const bob=Math.sin(game.frame*.03)*1.5+Math.sin(game.frame*.04)*.8,hy=player.y-23+bob,hw=player.character==='samurai'?32:28;ctx.fillStyle='#00d4ff';ctx.fillRect(player.x-hw/2,hy,hw,5);ctx.fillStyle='#ffd15c';ctx.fillRect(player.x-3,hy-1,6,7);ctx.fillStyle='#1a0a2e';ctx.fillRect(player.x-1,hy+1,2,3);ctx.fillStyle='#00a6c9';ctx.fillRect(player.x+hw/2-1,hy+2,10+Math.sin(game.frame*.08)*2,3);}
    }

    function drawPlayerSkeleton(){const x=player.x,y=player.y,bob=Math.sin(game.frame*.05);ctx.save();ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(x-21,y+17,42,7);ctx.fillStyle='#eee8d4';ctx.fillRect(x-14,y-28+bob,28,21);ctx.fillStyle='#16131e';ctx.fillRect(x-9,y-20+bob,6,6);ctx.fillRect(x+4,y-20+bob,6,6);ctx.fillRect(x-4,y-9+bob,8,3);ctx.fillStyle='#d8cfb6';ctx.fillRect(x-5,y-7+bob,10,25);for(let r=0;r<4;r++){ctx.fillRect(x-16,y-3+r*5+bob,32,2);}ctx.fillRect(x-23,y-1+bob,9,4);ctx.fillRect(x+14,y-1+bob,9,4);ctx.fillRect(x-11,y+17+bob,5,10);ctx.fillRect(x+6,y+17+bob,5,10);ctx.fillStyle='#7d49a8';ctx.fillRect(x-15,y-29+bob,30,4);ctx.fillRect(x+13,y-27+bob,13,3);ctx.restore();}
    function drawPlayerParadox(){const x=player.x,y=player.y,p=.5+.5*Math.sin(game.frame*.08);ctx.save();for(let i=2;i>=0;i--){ctx.globalAlpha=.18+i*.2;ctx.fillStyle=i%2?'#ff4fc8':'#54f5ff';ctx.fillRect(x-19-i*4,y-22+i*3,38,40);}ctx.globalAlpha=1;ctx.fillStyle='#0b1027';ctx.fillRect(x-15,y-26,30,40);ctx.fillStyle='#54f5ff';ctx.fillRect(x-12,y-20,9,5);ctx.fillStyle='#ff4fc8';ctx.fillRect(x+3,y-20,9,5);ctx.globalAlpha=p;ctx.fillStyle='#ffe06c';ctx.fillRect(x-4,y-8,8,14);ctx.globalAlpha=1;ctx.strokeStyle='#ab75ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y-4,27,game.frame*.03,game.frame*.03+Math.PI*1.4);ctx.stroke();ctx.restore();}

    function drawCyberpunkScholar(kind){
      const x=player.x,y=player.y,bob=Math.sin(game.frame*.05)*1.2,cyan='#16f7ff',pink='#ff2ca8',dark='#090b18',pulse=.65+.35*Math.sin(game.frame*.09);
      ctx.fillStyle='rgba(0,0,0,.42)';ctx.fillRect(x-27,y+19,54,8);ctx.fillStyle=dark;ctx.fillRect(x-23,y-18+bob,46,39);ctx.fillStyle=kind==='samurai'?'#481657':'#142c58';ctx.fillRect(x-18,y-13+bob,36,31);
      ctx.fillStyle='#282941';ctx.fillRect(x-20,y-37+bob,40,23);ctx.fillStyle='#d7a88f';ctx.fillRect(x-13,y-30+bob,26,12);ctx.fillStyle='#111424';ctx.fillRect(x-16,y-32+bob,32,7);ctx.globalAlpha=pulse;ctx.fillStyle=cyan;ctx.fillRect(x-14,y-30+bob,12,3);ctx.fillStyle=pink;ctx.fillRect(x+3,y-30+bob,11,3);ctx.globalAlpha=1;
      ctx.fillStyle='#6b6f86';ctx.fillRect(x-18,y-17+bob,6,32);ctx.fillRect(x+12,y-17+bob,6,32);ctx.fillStyle=cyan;ctx.fillRect(x-25,y-12+bob,5,23);ctx.fillRect(x-16,y+17+bob,12,5);ctx.fillStyle=pink;ctx.fillRect(x+20,y-12+bob,5,23);ctx.fillRect(x+4,y+17+bob,12,5);ctx.fillStyle='#ffe55d';ctx.fillRect(x-4,y-7+bob,8,8);ctx.fillStyle='#111';ctx.fillRect(x-2,y-5+bob,4,4);
      ctx.strokeStyle=cyan;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-18,y-7+bob);ctx.lineTo(x-8,y+2+bob);ctx.lineTo(x-14,y+13+bob);ctx.stroke();ctx.strokeStyle=pink;ctx.beginPath();ctx.moveTo(x+18,y-7+bob);ctx.lineTo(x+8,y+2+bob);ctx.lineTo(x+14,y+13+bob);ctx.stroke();
      if(kind==='samurai'){ctx.fillStyle=dark;ctx.fillRect(x-29,y-41+bob,58,6);ctx.fillRect(x-18,y-51+bob,36,11);ctx.fillStyle=pink;ctx.fillRect(x-15,y-49+bob,30,3);ctx.fillStyle='#8992aa';ctx.fillRect(x+25,y-34+bob,5,39);ctx.fillStyle=cyan;ctx.fillRect(x+26,y-32+bob,2,34);ctx.fillStyle='#ffe55d';ctx.fillRect(x+22,y+2+bob,11,4);}
      else{ctx.fillStyle=cyan;ctx.beginPath();ctx.moveTo(x-19,y-36+bob);ctx.lineTo(x-31,y-48+bob);ctx.lineTo(x-12,y-40+bob);ctx.fill();ctx.fillStyle=pink;ctx.beginPath();ctx.moveTo(x+19,y-36+bob);ctx.lineTo(x+31,y-45+bob);ctx.lineTo(x+12,y-40+bob);ctx.fill();ctx.fillStyle='#8992aa';ctx.fillRect(x-30,y-5+bob,10,5);ctx.fillRect(x+20,y+4+bob,12,5);ctx.fillStyle=cyan;ctx.fillRect(x-27,y-4+bob,4,3);ctx.fillStyle=pink;ctx.fillRect(x+23,y+5+bob,5,3);}
    }

    function drawPlayerNinja() {
      const breathe = Math.sin(game.frame * 0.03) * 1.5;
      const armSwing = Math.sin(game.frame * 0.05) * 4;
      const headBob = Math.sin(game.frame * 0.04) * 0.8;
      const capeFlow = Math.sin(game.frame * 0.06) * 3;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(player.x - 22, player.y + 15, 44, 8);

      shadedRect(player.x - 20 + capeFlow, player.y - 20 + breathe, 40, 38, '#8b0000');
      shadedRect(player.x - 18 + capeFlow, player.y - 18 + breathe, 36, 34, '#6a0000');

      shadedRect(player.x - 18, player.y - 17 + breathe, 36, 34, '#0a0a0a');
      drawGlint(player.x - 15, player.y - 15 + breathe, 6, 10);

      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(player.x - 14, player.y - 15 + breathe, 28, 8);
      ctx.fillRect(player.x - 14, player.y - 5 + breathe, 28, 8);

      shadedRect(player.x - 20, player.y - 3 + breathe, 40, 7, '#c0392b');
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(player.x - 20, player.y - 2 + breathe, 40, 3);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(player.x - 3, player.y - 3 + breathe, 6, 7);
      ctx.strokeStyle = '#7a6010';
      ctx.strokeRect(player.x - 3 + 0.5, player.y - 3 + breathe + 0.5, 5, 6);

      shadedRect(player.x - 24, player.y - 8 + breathe + armSwing, 10, 16, '#1a1a1a');
      shadedRect(player.x + 14, player.y - 8 + breathe - armSwing, 10, 16, '#1a1a1a');

      ctx.fillStyle = '#2c2c2c';
      ctx.fillRect(player.x - 23, player.y - 6 + breathe + armSwing, 8, 4);
      ctx.fillRect(player.x + 15, player.y - 6 + breathe - armSwing, 8, 4);

      shadedRect(player.x - 24, player.y + 7 + breathe + armSwing, 8, 7, '#d4a574');
      shadedRect(player.x + 16, player.y + 7 + breathe - armSwing, 8, 7, '#d4a574');

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(player.x - 12, player.y + 15, 10, 6);
      ctx.fillRect(player.x + 2, player.y + 15, 10, 6);

      shadedRect(player.x - 16, player.y - 26 + breathe + headBob, 32, 20, '#0a0a0a');

      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(player.x - 16, player.y - 26 + breathe + headBob, 32, 6);

      ctx.fillStyle = '#050505';
      ctx.fillRect(player.x - 14, player.y - 16 + breathe + headBob, 28, 10);

      ctx.fillStyle = '#ff0000';
      ctx.fillRect(player.x - 10, player.y - 18 + breathe + headBob, 6, 5);
      ctx.fillRect(player.x + 4, player.y - 18 + breathe + headBob, 6, 5);

      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.fillRect(player.x - 11, player.y - 19 + breathe + headBob, 8, 7);
      ctx.fillRect(player.x + 3, player.y - 19 + breathe + headBob, 8, 7);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(player.x - 8, player.y - 17 + breathe + headBob, 2, 3);
      ctx.fillRect(player.x + 6, player.y - 17 + breathe + headBob, 2, 3);

      shadedRect(player.x - 15, player.y - 21 + breathe + headBob, 30, 4, '#2c3e50');
      ctx.fillStyle = '#34495e';
      ctx.fillRect(player.x - 2, player.y - 21 + breathe + headBob, 4, 4);

      // Storm of Steel: magazine pips + orbiting shurikens
      if (player.character === 'ninja' && pathLevel('shuriken', 'B') >= 3) {
        const pipSpacing = 12;
        const startX = player.x - ((shurikenMag.capacity - 1) * pipSpacing) / 2;
        for (let p = 0; p < shurikenMag.capacity; p++) {
          ctx.fillStyle = p < shurikenMag.current ? '#00d4ff' : 'rgba(255,255,255,0.2)';
          ctx.beginPath();
          ctx.arc(startX + p * pipSpacing, player.y - 42, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        if (wLevel('shuriken') >= 4) {
          for (let p = 0; p < shurikenMag.current; p++) {
            const angle = (game.frame * 0.05) + (p * Math.PI * 2 / Math.max(1, shurikenMag.current));
            const ox = player.x + Math.cos(angle) * 28;
            const oy = player.y + Math.sin(angle) * 28;
            ctx.save();
            ctx.translate(ox, oy);
            ctx.rotate(game.frame * 0.2);
            ctx.fillStyle = '#c0c0c0';
            ctx.fillRect(-4, -4, 8, 8);
            ctx.restore();
          }
        }
      }
    }

    function drawPlayerSamurai() {
      const breathe = Math.sin(game.frame * 0.03) * 1.5;
      const armSwing = Math.sin(game.frame * 0.05) * 3;
      const headBob = Math.sin(game.frame * 0.04) * 0.8;
      const honorPct = Math.min(1, honor / 10);
      const y = player.y + breathe;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(player.x - 22, player.y + 15, 44, 8);

      // Honor glow (Bushido) — brighter and wider the more honor is banked
      if (honorPct > 0) {
        ctx.globalAlpha = 0.28 * honorPct;
        const glowGrad = ctx.createRadialGradient(player.x, y - 5, 4, player.x, y - 5, 38);
        glowGrad.addColorStop(0, '#fff3b0');
        glowGrad.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(player.x, y - 5, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Kusazuri — flared lamellar skirt plates below the torso
      for (let p = -1; p <= 1; p++) {
        shadedRect(player.x + p * 13 - 7, y + 8, 14, 10, '#151a30');
        ctx.fillStyle = '#d4af37';
        ctx.fillRect(player.x + p * 13 - 7, y + 8, 14, 2);
      }

      // Legs / greaves
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(player.x - 12, player.y + 15, 10, 6);
      ctx.fillRect(player.x + 2, player.y + 15, 10, 6);

      // Sode (shoulder armor) behind the arms
      shadedRect(player.x - 27, y - 12 + armSwing * 0.3, 9, 11, '#0d1226');
      shadedRect(player.x + 18, y - 12 - armSwing * 0.3, 9, 11, '#0d1226');
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(player.x - 27, y - 12 + armSwing * 0.3, 9, 2);
      ctx.fillRect(player.x + 18, y - 12 - armSwing * 0.3, 9, 2);

      // Arms (kote sleeves) + gauntlet hands
      shadedRect(player.x - 24, y - 8 + armSwing, 10, 16, '#1a2744');
      shadedRect(player.x + 14, y - 8 - armSwing, 10, 16, '#1a2744');
      shadedRect(player.x - 24, player.y + 7 + breathe + armSwing, 8, 7, '#3a3f52');
      shadedRect(player.x + 16, player.y + 7 + breathe - armSwing, 8, 7, '#3a3f52');

      // Torso (do-maru) — dark lacquered plate with kozane lacing lines
      shadedRect(player.x - 18, y - 17, 36, 30, '#182449');
      for (let li = 0; li < 4; li++) {
        ctx.fillStyle = li % 2 === 0 ? '#8b0000' : '#0d1226';
        ctx.fillRect(player.x - 17, y - 13 + li * 6, 34, 2);
      }
      drawGlint(player.x - 14, y - 15, 6, 9);

      // Obi sash, diagonal
      ctx.save();
      ctx.translate(player.x, y);
      ctx.rotate(-0.35);
      ctx.fillStyle = '#b8860b';
      ctx.fillRect(-20, -3, 42, 6);
      ctx.restore();

      // Chest crest (mon)
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.arc(player.x, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8b0000';
      ctx.beginPath();
      ctx.arc(player.x, y - 4, 2, 0, Math.PI * 2);
      ctx.fill();

      // Sheathed katana at the hip, angled across the back
      ctx.save();
      ctx.translate(player.x + 6, y + 2);
      ctx.rotate(-0.55);
      ctx.fillStyle = '#2a1e14';
      ctx.fillRect(-4, -24, 6, 32);
      ctx.fillStyle = '#8b0000';
      ctx.fillRect(-5, 4, 8, 3);
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.arc(0, 8, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(-2, 8, 4, 9);
      ctx.restore();

      // Kabuto helmet with flared neck guard (shikoro)
      const hx = player.x, hy = y - 26 + headBob;
      shadedRect(hx - 17, hy + 6, 34, 8, '#0d1226');
      shadedRect(hx - 16, hy, 32, 14, '#182449');
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(hx - 16, hy, 32, 3);
      ctx.fillRect(hx - 16, hy, 3, 14);
      ctx.fillRect(hx + 13, hy, 3, 14);

      // Crescent-moon maedate (helmet crest)
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(hx, hy - 6, 8, Math.PI * 0.15, Math.PI * 0.85, false);
      ctx.arc(hx, hy - 4, 6, Math.PI * 0.85, Math.PI * 0.15, true);
      ctx.closePath();
      ctx.fill();

      // Menpo (fierce face mask) with glowing eye slits
      ctx.fillStyle = '#7a1010';
      ctx.fillRect(hx - 10, hy + 6, 20, 10);
      ctx.fillStyle = '#2a0505';
      ctx.fillRect(hx - 8, hy + 14, 16, 3);
      ctx.fillStyle = '#ffe082';
      ctx.fillRect(hx - 7, hy + 9, 5, 3);
      ctx.fillRect(hx + 2, hy + 9, 5, 3);
      ctx.fillStyle = '#3a0a0a';
      ctx.fillRect(hx - 3, hy + 13, 6, 2);
    }

    function drawEnemy(e) {
      if (e.smokeBuffed) {
        const pulse = Math.sin(game.frame * 0.1) * 0.3 + 0.7;
        ctx.globalAlpha = pulse * 0.4;
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (e.ectoCoated) {
        const pulse = Math.sin(game.frame * 0.1) * 0.2 + 0.5;
        ctx.globalAlpha = pulse * 0.35;
        ctx.fillStyle = '#1e3a8a';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.save();
      if (e.isBoss || e.isVoid) {
        let saturatePct = 100;
        if (e.isBoss) saturatePct *= 1.5;
        if (e.isVoid) saturatePct *= 0.75;
        const hasCustomVoidColor = e.isVoid && (e.type === 'bat' || e.type === 'ghost');
        const hueShift = (e.isVoid && !hasCustomVoidColor) ? 260 : 0;
        ctx.filter = `saturate(${saturatePct}%) hue-rotate(${hueShift}deg) ${e.isVoid ? 'brightness(0.85)' : ''}`;
      }
      if (e.isBoss) {
        ctx.translate(e.x, e.y);
        ctx.scale(1.4, 1.4);
        ctx.translate(-e.x, -e.y);
      }

      if (e.type === 'bat') drawBat(e);
      else if (e.type === 'spider') drawSpider(e);
      else if (e.type === 'swordsman') drawSwordSkeleton(e);
      else if (e.type === 'mage') drawSkeletonMage(e);
      else if (e.type === 'ghost') drawGhost(e);
      else if (e.type === 'eye') drawEye(e);
      else if (e.type === 'archer') drawArcher(e);
      else if (e.type === 'golem') drawGolem(e);
      else if (e.type === 'tree_golem') drawTreeGolem(e);
      else if (e.type === 'smoke_golem') drawSmokeGolem(e);
      else if (e.type === 'fire_golem') drawFireGolem(e);
      else if (e.type === 'troll') drawTroll(e);
      else if (e.type === 'mimic') drawMimic(e);
      else drawSlime(e);

      ctx.restore();

      if (e.isBoss) {
        ctx.fillStyle = e.isVoid ? '#b266ff' : '#ff0055';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(e.isVoid ? '☠ VOID BOSS ☠' : '☠ BOSS ☠', e.x, e.y - 60);
        ctx.textAlign = 'left';
      }

      const now = Date.now();
      if (e.stunnedUntil && now < e.stunnedUntil) {
        ctx.fillStyle = '#f1c40f';
        ctx.font = '14px sans-serif';
        ctx.fillText('✳', e.x - 6, e.y - 44);
      }
      if (e.poisonUntil && now < e.poisonUntil) {
        ctx.fillStyle = '#39ff6a';
        ctx.beginPath();
        ctx.arc(e.x + 14, e.y - 40, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (e.bleedUntil && now < e.bleedUntil) {
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(e.x - 14, e.y - 40, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (e.marked) {
        ctx.fillStyle = '#2196f3';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('!', e.x - 3, e.y - 48);
      }
    }

    function drawSpider(e){const bob=Math.sin(e.anim*.08)*2;ctx.fillStyle='#0a070d';ctx.beginPath();ctx.ellipse(e.x,e.y+bob,18,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#4b183d';ctx.beginPath();ctx.ellipse(e.x,e.y-8+bob,11,9,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#1a0d18';ctx.lineWidth=4;for(const side of [-1,1])for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(e.x+side*8,e.y-3+i*4+bob);ctx.lineTo(e.x+side*(22+i*3),e.y-13+i*10+bob);ctx.lineTo(e.x+side*(31+i*3),e.y-8+i*10+bob);ctx.stroke();}ctx.fillStyle='#ff355e';ctx.fillRect(e.x-7,e.y-12+bob,4,4);ctx.fillRect(e.x+3,e.y-12+bob,4,4);}
    function drawSwordSkeleton(e){drawArcher(e);ctx.save();ctx.translate(e.x+18,e.y);ctx.rotate(-.55);ctx.fillStyle='#d9e2ea';ctx.fillRect(-2,-20,5,30);ctx.fillStyle='#9b6a32';ctx.fillRect(-7,8,15,4);ctx.restore();}
    function drawSkeletonMage(e){const float=Math.sin(e.anim*.05)*3;ctx.fillStyle='#3b185f';ctx.beginPath();ctx.moveTo(e.x,e.y-28+float);ctx.lineTo(e.x-22,e.y+24+float);ctx.lineTo(e.x+22,e.y+24+float);ctx.closePath();ctx.fill();ctx.fillStyle='#e7dfc8';ctx.fillRect(e.x-12,e.y-24+float,24,18);ctx.fillStyle='#101018';ctx.fillRect(e.x-7,e.y-19+float,4,5);ctx.fillRect(e.x+3,e.y-19+float,4,5);ctx.strokeStyle='#7c4dff';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(e.x+18,e.y+18);ctx.lineTo(e.x+27,e.y-24);ctx.stroke();ctx.fillStyle='#ff6a22';ctx.beginPath();ctx.arc(e.x+27,e.y-27,6,0,Math.PI*2);ctx.fill();}

    function drawSlime(e) {
      const bounce = Math.abs(Math.sin(e.anim * 0.05)) * 6;
      const squish = Math.sin(e.anim * 0.05) * 0.2 + 1;
      const wobble = Math.sin(e.anim * 0.03) * 2;

      if (e.maxHp > 1) {
        ctx.fillStyle = '#2d1b3d';
        ctx.fillRect(e.x - 20, e.y - 35, 40, 4);
        ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(e.x - 20, e.y - 35, 40 * (e.hp / e.maxHp), 4);
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(e.x - 18, e.y + 8, 36, 6);

      const bodyWidth = 44 * squish;
      const bodyHeight = 10 / squish;
      
      const darkColor = e.isGhostSlime ? '#9ca3af' : (e.metal ? '#6b7280' : '#27ae60');
      const mainColor = e.isGhostSlime ? '#f5f5f5' : (e.metal ? '#9ca3af' : '#2ecc71');
      const lightColor = e.isGhostSlime ? '#ffffff' : (e.metal ? '#d1d5db' : '#34eb77');
      
      ctx.fillStyle = darkColor;
      ctx.fillRect(e.x - bodyWidth/2 + wobble, e.y - 9 - bounce, bodyWidth, bodyHeight);

      const mainWidth = 36 * squish;
      const mainHeight = 20 / squish;
      shadedRect(e.x - mainWidth/2 + wobble, e.y - 16 - bounce, mainWidth, mainHeight, mainColor);

      ctx.fillStyle = lightColor;
      ctx.fillRect(e.x - mainWidth/2 + 3 + wobble, e.y - 14 - bounce, mainWidth - 6, 3);
      drawGlint(e.x - mainWidth/2 + 5 + wobble, e.y - 15 - bounce, 5, 5);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(e.x - 8 + wobble, e.y - 10 - bounce, 16, 12);

      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const distance = Math.hypot(dx, dy);
      const maxOffset = 3;
      
      let pupilOffsetX = 0;
      let pupilOffsetY = 0;
      if (distance > 0) {
        pupilOffsetX = (dx / distance) * maxOffset;
        pupilOffsetY = (dy / distance) * maxOffset;
      }

      ctx.fillStyle = '#000000';
      ctx.fillRect(e.x - 3 + wobble + pupilOffsetX, e.y - 7 - bounce + pupilOffsetY, 6, 6);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(e.x - 1 + wobble + pupilOffsetX, e.y - 6 - bounce + pupilOffsetY, 2, 2);
    }

    // Offscreen scratch canvas used to render the Mimic's copied form at full detail,
    // then tint every non-transparent pixel solid neon pink/blue via compositing.
    const mimicOffscreen = document.createElement('canvas');
    mimicOffscreen.width = 140; mimicOffscreen.height = 140;
    const mimicOffCtx = mimicOffscreen.getContext('2d');
    const MIMIC_OFF_CX = 70, MIMIC_OFF_CY = 90;

    const MIMIC_DRAW_FNS = {
      slime: drawSlime, bat: drawBat, ghost: drawGhost, eye: drawEye, archer: drawArcher,
      golem: drawGolem, tree_golem: drawTreeGolem, smoke_golem: drawSmokeGolem,
      fire_golem: drawFireGolem, troll: drawTroll
    };

    // Renders one detailed, tinted copy of `drawTarget` (an enemy type name, or
    // 'player_ninja'/'player_samurai') into the shared offscreen canvas.
    function renderTintedMimicForm(drawTarget, e, baseColor) {
      mimicOffCtx.clearRect(0, 0, mimicOffscreen.width, mimicOffscreen.height);
      const savedCtx = ctx;
      ctx = mimicOffCtx;
      if (drawTarget.indexOf('player_') === 0) {
        const savedPX = player.x, savedPY = player.y;
        player.x = MIMIC_OFF_CX; player.y = MIMIC_OFF_CY;
        if (drawTarget === 'player_samurai') drawPlayerSamurai(); else drawPlayerNinja();
        player.x = savedPX; player.y = savedPY;
      } else {
        const fn = MIMIC_DRAW_FNS[drawTarget] || drawSlime;
        fn({ x: MIMIC_OFF_CX, y: MIMIC_OFF_CY, anim: e.anim, hp: 1, maxHp: 1, frame: 0 });
      }
      ctx = savedCtx;
      mimicOffCtx.globalCompositeOperation = 'source-in';
      mimicOffCtx.fillStyle = baseColor;
      mimicOffCtx.fillRect(0, 0, mimicOffscreen.width, mimicOffscreen.height);
      mimicOffCtx.globalCompositeOperation = 'source-over';
    }

    function drawMimic(e) {
      const baseColor = e.isVoid ? '#2fd8ff' : '#ff4fd8';
      const glowColor = e.isVoid ? 'rgba(47,216,255,0.5)' : 'rgba(255,79,216,0.5)';

      if (e.maxHp > 1) {
        ctx.fillStyle = '#2d1b3d';
        ctx.fillRect(e.x - 20, e.y - 42, 40, 4);
        ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(e.x - 20, e.y - 42, 40 * (e.hp / e.maxHp), 4);
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(e.x - 16, e.y + 14, 32, 6);

      // Soft neon glow, always present so the Mimic reads as a distinct threat.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 8, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const t = e.anim * 0.05;

      if (e.mimicking) {
        // Morphed: a fully-detailed pink/blue copy of whatever it's mimicking,
        // dripping splotches of its own color.
        renderTintedMimicForm(e.mimicking, e, baseColor);
        ctx.drawImage(mimicOffscreen, e.x - MIMIC_OFF_CX, e.y - MIMIC_OFF_CY);

        const dripCount = 4;
        for (let i = 0; i < dripCount; i++) {
          const dripPhase = (t * 0.6 + i * 1.7) % (Math.PI * 2);
          const dripLen = Math.max(0, Math.sin(dripPhase)) * 12;
          const dripX = e.x - 24 + i * 16;
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = baseColor;
          ctx.beginPath();
          ctx.ellipse(dripX, e.y + 16 + dripLen, 2.5, 4 + dripLen * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else {
        // Idle: the mimic's true form - a slime shape (tinted neon pink/blue) with
        // octopus-like tendrils curling out from its base.
        renderTintedMimicForm('slime', e, baseColor);
        ctx.drawImage(mimicOffscreen, e.x - MIMIC_OFF_CX, e.y - MIMIC_OFF_CY);

        const tendrilCount = 5;
        for (let k = 0; k < tendrilCount; k++) {
          const baseAngle = (k / tendrilCount) * Math.PI * 2 + t * 0.3;
          const sway = Math.sin(t * 1.4 + k * 1.9) * 0.5;
          const reach = 14 + Math.sin(t * 1.1 + k * 2.4) * 8;
          const startX = e.x + Math.cos(baseAngle) * 14;
          const startY = e.y + 10 + Math.sin(baseAngle) * 6;
          const midX = e.x + Math.cos(baseAngle + sway * 0.5) * (14 + reach * 0.6);
          const midY = startY + 6 + Math.sin(baseAngle) * 4;
          const tipX = e.x + Math.cos(baseAngle + sway) * (14 + reach);
          const tipY = startY + 10 + Math.sin(baseAngle + sway) * 6;

          ctx.strokeStyle = baseColor;
          ctx.lineCap = 'round';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.quadraticCurveTo(midX, midY, tipX, tipY);
          ctx.stroke();
          ctx.lineWidth = 2.5;
          ctx.fillStyle = baseColor;
          ctx.beginPath();
          ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawTroll(e) {
      const lumber = Math.sin(e.anim * 0.02) * 3;
      const armSwing = Math.sin(e.anim * 0.02) * 6;

      if (e.maxHp > 1) {
        ctx.fillStyle = '#2d1b3d';
        ctx.fillRect(e.x - 24, e.y - 48, 48, 5);
        ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(e.x - 24, e.y - 48, 48 * (e.hp / e.maxHp), 5);
      }

      const now = Date.now();
      const isRegening = now - (e.lastHit || 0) >= TROLL_REGEN_INTERVAL;
      if (isRegening && e.hp < e.maxHp) {
        const pulse = Math.sin(now * 0.006) * 0.25 + 0.45;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#39ff6a';
        ctx.beginPath();
        ctx.arc(e.x, e.y - 10, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(e.x - 22, e.y + 14, 44, 7);

      const skinDark = e.metal ? '#6b7280' : '#4b5d3a';
      const skinMain = e.metal ? '#9ca3af' : '#6b8e4e';
      const skinLight = e.metal ? '#d1d5db' : '#8bab5e';

      // legs
      ctx.fillStyle = skinDark;
      ctx.fillRect(e.x - 16, e.y + 2, 12, 14);
      ctx.fillRect(e.x + 4, e.y + 2, 12, 14);

      // arms (swinging slightly)
      shadedRect(e.x - 30, e.y - 14 + armSwing, 10, 24, skinMain);
      shadedRect(e.x + 20, e.y - 14 - armSwing, 10, 24, skinMain);

      // torso
      shadedRect(e.x - 20, e.y - 22 + lumber * 0.2, 40, 26, skinMain);
      ctx.fillStyle = skinLight;
      ctx.fillRect(e.x - 20, e.y - 22 + lumber * 0.2, 40, 5);
      drawGlint(e.x - 16, e.y - 20 + lumber * 0.2, 6, 8);

      // head
      shadedRect(e.x - 13, e.y - 40 + lumber * 0.2, 26, 20, skinDark);

      // eyes
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.hypot(dx, dy);
      const maxOffset = 2;
      const eyeOffX = dist > 0 ? (dx / dist) * maxOffset : 0;
      const eyeOffY = dist > 0 ? (dy / dist) * maxOffset : 0;
      ctx.fillStyle = '#ff3b3b';
      ctx.fillRect(e.x - 8 + eyeOffX, e.y - 32 + lumber * 0.2 + eyeOffY, 5, 5);
      ctx.fillRect(e.x + 3 + eyeOffX, e.y - 32 + lumber * 0.2 + eyeOffY, 5, 5);

      // tusks
      ctx.fillStyle = '#f5f5f0';
      ctx.fillRect(e.x - 9, e.y - 22 + lumber * 0.2, 3, 6);
      ctx.fillRect(e.x + 6, e.y - 22 + lumber * 0.2, 3, 6);
    }

    function drawBat(e) {
      const flap = Math.sin(e.anim * 0.3) * 8;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(e.x - 12, e.y + 12, 24, 4);
      
      const bodyColor = e.isVoid ? '#b8470a' : (e.metal ? '#6b7280' : '#1a1a1a');
      const headColor = e.isVoid ? '#d2570d' : (e.metal ? '#9ca3af' : '#2a2a2a');
      const earColor = e.isVoid ? '#b8470a' : (e.metal ? '#6b7280' : '#1a1a1a');
      const wingColor = e.isVoid ? '#7a3007' : (e.metal ? '#4b5563' : '#0a0a0a');
      
      shadedRect(e.x - 8, e.y - 10, 16, 18, bodyColor);
      shadedRect(e.x - 10, e.y - 18, 20, 12, headColor);
      ctx.fillStyle = earColor;
      ctx.fillRect(e.x - 12, e.y - 20, 6, 8);
      ctx.fillRect(e.x + 6, e.y - 20, 6, 8);
      shadedRect(e.x - 24, e.y - 5 - flap, 12, 18, wingColor);
      shadedRect(e.x + 12, e.y - 5 - flap, 12, 18, wingColor);
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(e.x - 6, e.y - 14, 4, 4);
      ctx.fillRect(e.x + 2, e.y - 14, 4, 4);
      drawGlint(e.x - 8, e.y - 17, 4, 3);
    }

    function drawGhost(e) {
      const float = Math.sin(e.anim * 0.04) * 4;
      const fade = Math.sin(e.anim * 0.02) * 0.3 + 0.7;

      if (e.maxHp > 1) {
        ctx.fillStyle = '#2d1b3d';
        ctx.fillRect(e.x - 20, e.y - 35, 40, 4);
        ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(e.x - 20, e.y - 35, 40 * (e.hp / e.maxHp), 4);
      }

      const ghostColor = e.isVoid ? '#1e3a6b' : (e.metal ? '#9ca3af' : '#e8e8ff');
      
      ctx.globalAlpha = e.phased ? fade * 0.15 : fade;
      shadedRect(e.x - 16, e.y - 20 + float, 32, 28, ghostColor);
      ctx.fillStyle = ghostColor;
      ctx.fillRect(e.x - 16, e.y + 8 + float, 8, 6);
      ctx.fillRect(e.x - 4, e.y + 8 + float, 8, 6);
      ctx.fillRect(e.x + 8, e.y + 8 + float, 8, 6);
      drawGlint(e.x - 12, e.y - 17 + float, 6, 10);
      ctx.fillStyle = '#000000';
      ctx.fillRect(e.x - 10, e.y - 10 + float, 6, 8);
      ctx.fillRect(e.x + 4, e.y - 10 + float, 6, 8);
      ctx.globalAlpha = 1;
    }

    function drawEye(e) {
      const pulse = Math.sin(e.anim * 0.08) * 3;

      if (e.maxHp > 1) {
        ctx.fillStyle = '#2d1b3d';
        ctx.fillRect(e.x - 20, e.y - 40, 40, 4);
        ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(e.x - 20, e.y - 40, 40 * (e.hp / e.maxHp), 4);
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(e.x - 18, e.y + 12, 36, 6);
      shadedRect(e.x - 20 - pulse, e.y - 20, 40 + pulse * 2, 36, '#ffffff');
      
      const irisColor = e.metal ? '#6b7280' : '#8b00ff';
      shadedRect(e.x - 12, e.y - 12, 24, 24, irisColor);
      ctx.fillStyle = '#000000';
      ctx.fillRect(e.x - 6, e.y - 6, 12, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(e.x - 3, e.y - 3, 4, 4);
      drawGlint(e.x - 16, e.y - 17, 6, 6);
    }

    function drawArcher(e) {
      const breathe = Math.sin(e.anim * 0.03) * 1;
      const armSwing = Math.sin(e.anim * 0.04) * 3;

      if (e.maxHp > 1) {
        ctx.fillStyle = '#2d1b3d';
        ctx.fillRect(e.x - 20, e.y - 35, 40, 4);
        ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(e.x - 20, e.y - 35, 40 * (e.hp / e.maxHp), 4);
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(e.x - 16, e.y + 12, 32, 6);

      const boneColor = e.metal ? '#9ca3af' : '#f8f8f0';
      
      shadedRect(e.x - 10, e.y - 24 + breathe, 20, 16, boneColor);
      ctx.fillStyle = boneColor;
      ctx.fillRect(e.x - 8, e.y - 26 + breathe, 16, 2);

      ctx.fillStyle = '#000000';
      ctx.fillRect(e.x - 8, e.y - 20 + breathe, 5, 5);
      ctx.fillRect(e.x + 3, e.y - 20 + breathe, 5, 5);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(e.x - 7, e.y - 19 + breathe, 3, 3);
      ctx.fillRect(e.x + 4, e.y - 19 + breathe, 3, 3);
      
      ctx.fillStyle = '#000000';
      ctx.fillRect(e.x - 6, e.y - 18 + breathe, 1, 1);
      ctx.fillRect(e.x + 5, e.y - 18 + breathe, 1, 1);

      ctx.fillStyle = '#000000';
      ctx.fillRect(e.x - 1, e.y - 15 + breathe, 2, 3);

      ctx.fillStyle = '#000000';
      ctx.fillRect(e.x - 4, e.y - 12 + breathe, 8, 2);
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(e.x - 3, e.y - 12 + breathe, 1, 2);
      ctx.fillRect(e.x - 1, e.y - 12 + breathe, 1, 2);
      ctx.fillRect(e.x + 1, e.y - 12 + breathe, 1, 2);

      ctx.fillStyle = boneColor;
      ctx.fillRect(e.x - 2, e.y - 8 + breathe, 4, 6);

      shadedRect(e.x - 12, e.y - 6 + breathe, 24, 16, boneColor);
      
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(e.x - 10, e.y - 4 + breathe, 20, 1);
      ctx.fillRect(e.x - 10, e.y - 1 + breathe, 20, 1);
      ctx.fillRect(e.x - 10, e.y + 2 + breathe, 20, 1);
      ctx.fillRect(e.x - 10, e.y + 5 + breathe, 20, 1);

      ctx.fillStyle = boneColor;
      ctx.fillRect(e.x - 18, e.y - 6 + breathe - armSwing, 6, 12);
      ctx.fillRect(e.x + 12, e.y - 6 + breathe + armSwing, 6, 12);

      ctx.fillStyle = boneColor;
      ctx.fillRect(e.x - 8, e.y + 10 + breathe, 4, 12);
      ctx.fillRect(e.x + 4, e.y + 10 + breathe, 4, 12);

      ctx.save();
      ctx.translate(e.x - 15, e.y - 2 + breathe - armSwing);
      ctx.rotate(-0.2 + armSwing * 0.02);
      
      ctx.fillStyle = '#654321';
      ctx.fillRect(-2, -12, 4, 24);
      
      ctx.fillStyle = '#8b7355';
      const stringStretch = armSwing * 0.5;
      ctx.fillRect(2, -10, 1 + stringStretch, 20);
      
      if (armSwing > 1) {
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(3 + stringStretch, -1, 8, 2);
        ctx.fillStyle = '#c0c0c0';
        ctx.fillRect(11 + stringStretch, -2, 3, 4);
      }
      
      ctx.restore();
    }

    async function loadQuestionBank(){
    const result = await QuestionManager.loadCurrentBanks(window.GAME_CONFIG?.supportedQuestionFormats);

    if (!result.ok) return false;

    // Adaptive question weighting persists across sessions for this game
    // (see progress.questionWeights), unlike the in-memory-only default —
    // restore whatever was saved onto the freshly-loaded bank.
    QuestionManager.restoreWeights(progress.questionWeights);

    const classCode = PlatformManager.getClassCode();
    if (!progress.playedCodes.includes(classCode)) {
      progress.playedCodes.push(classCode);
      saveProgress();
      checkSamuraiUnlock();
    }

    return true;
}
    loadQuestionBank().then(loaded => {
      const bankMessage = document.getElementById('bankMessage');
      if (!bankMessage) return;
      bankMessage.textContent = loaded
        ? `✓ Loaded: ${QuestionManager.getBankName()}`
        : PlatformManager.hasClassCode()
          ? 'Question bank could not be loaded. Return to the Hub and check the class code.'
          : 'Please enter the class code before playing.';
    });
    function drawGolem(e) {
      const breathe = Math.sin(e.anim * 0.02) * 1;
      const rumble = Math.sin(e.anim * 0.15) * 0.5;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(e.x - 24, e.y + 18, 48, 8);

      shadedRect(e.x - 20 + rumble, e.y - 20 + breathe, 40, 38, '#5d4e37');

      ctx.fillStyle = '#7d6e47';
      ctx.fillRect(e.x - 18 + rumble, e.y - 18 + breathe, 36, 34);
      drawGlint(e.x - 14 + rumble, e.y - 16 + breathe, 8, 12);

      ctx.fillStyle = '#4d3e27';
      ctx.fillRect(e.x - 15 + rumble, e.y + 18 + breathe, 8, 6);
      ctx.fillRect(e.x + 7 + rumble, e.y + 18 + breathe, 8, 6);
      ctx.fillRect(e.x - 2 + rumble, e.y + 18 + breathe, 4, 8);

      ctx.fillStyle = '#6b6b6b';
      ctx.fillRect(e.x - 12 + rumble, e.y - 10 + breathe, 6, 6);
      ctx.fillRect(e.x + 6 + rumble, e.y - 14 + breathe, 5, 5);
      ctx.fillRect(e.x - 8 + rumble, e.y + 4 + breathe, 4, 4);

      const pulseSize = 2 + Math.sin(e.anim * 0.1) * 1;
      ctx.fillStyle = '#8b4789';
      ctx.fillRect(e.x - pulseSize + rumble, e.y - 2 + breathe, pulseSize * 2, pulseSize * 2);

      ctx.fillStyle = '#ff6b35';
      ctx.fillRect(e.x - 10 + rumble, e.y - 12 + breathe, 6, 8);
      ctx.fillRect(e.x + 4 + rumble, e.y - 12 + breathe, 6, 8);

      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(e.x - 8 + rumble, e.y - 10 + breathe, 2, 4);
      ctx.fillRect(e.x + 6 + rumble, e.y - 10 + breathe, 2, 4);

      shadedRect(e.x - 28 + rumble, e.y - 8 + breathe, 8, 18, '#5d4e37');
      shadedRect(e.x + 20 + rumble, e.y - 8 + breathe, 8, 18, '#5d4e37');

      ctx.fillStyle = '#4d3e27';
      ctx.fillRect(e.x - 30 + rumble, e.y + 10 + breathe, 10, 8);
      ctx.fillRect(e.x + 20 + rumble, e.y + 10 + breathe, 10, 8);

      ctx.fillStyle = '#5d4e37';
      ctx.fillRect(e.x - 12 + rumble, e.y + 18 + breathe, 8, 10);
      ctx.fillRect(e.x + 4 + rumble, e.y + 18 + breathe, 8, 10);
    }

    function drawTreeGolem(e) {
      const breathe = Math.sin(e.anim * 0.02) * 1;
      const sway = Math.sin(e.anim * 0.04) * 2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(e.x - 24, e.y + 18, 48, 8);

      shadedRect(e.x - 18 + sway, e.y - 18 + breathe, 36, 36, '#3e2723');

      ctx.fillStyle = '#5d4037';
      ctx.fillRect(e.x - 16 + sway, e.y - 16 + breathe, 32, 32);
      drawGlint(e.x - 12 + sway, e.y - 14 + breathe, 7, 11);

      ctx.fillStyle = '#4e342e';
      ctx.fillRect(e.x - 8 + sway, e.y - 10 + breathe, 16, 3);
      ctx.fillRect(e.x - 10 + sway, e.y + breathe, 20, 3);
      ctx.fillRect(e.x - 6 + sway, e.y + 8 + breathe, 12, 3);

      const pulseSize = 2 + Math.sin(e.anim * 0.1) * 1;
      ctx.fillStyle = '#8bc34a';
      ctx.fillRect(e.x - pulseSize + sway, e.y - 2 + breathe, pulseSize * 2, pulseSize * 2);

      ctx.fillStyle = '#1b5e20';
      ctx.fillRect(e.x - 10 + sway, e.y - 12 + breathe, 6, 8);
      ctx.fillRect(e.x + 4 + sway, e.y - 12 + breathe, 6, 8);

      shadedRect(e.x - 26 + sway, e.y - 8 + breathe, 8, 16, '#3e2723');
      shadedRect(e.x + 18 + sway, e.y - 8 + breathe, 8, 16, '#3e2723');

      ctx.fillStyle = '#4caf50';
      ctx.fillRect(e.x - 30 + sway, e.y - 6 + breathe, 8, 8);
      ctx.fillRect(e.x + 22 + sway, e.y - 6 + breathe, 8, 8);

      ctx.fillStyle = '#3e2723';
      ctx.fillRect(e.x - 14 + sway, e.y + 18 + breathe, 10, 10);
      ctx.fillRect(e.x + 4 + sway, e.y + 18 + breathe, 10, 10);
    }

    function drawSmokeGolem(e) {
      const breathe = Math.sin(e.anim * 0.02) * 1;
      const float = Math.sin(e.anim * 0.04) * 3;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(e.x - 24, e.y + 18, 48, 8);

      const alpha = 0.7 + Math.sin(e.anim * 0.05) * 0.2;
      ctx.globalAlpha = alpha;

      shadedRect(e.x - 20, e.y - 20 + breathe + float, 40, 38, '#616161');

      ctx.fillStyle = '#9e9e9e';
      ctx.fillRect(e.x - 18, e.y - 18 + breathe + float, 36, 34);
      drawGlint(e.x - 14, e.y - 15 + breathe + float, 8, 12);

      ctx.fillStyle = '#757575';
      ctx.fillRect(e.x - 22, e.y - 15 + breathe + float, 8, 20);
      ctx.fillRect(e.x + 14, e.y - 15 + breathe + float, 8, 20);
      ctx.fillRect(e.x - 4, e.y + 18 + breathe + float, 8, 12);

      const pulseSize = 2 + Math.sin(e.anim * 0.1) * 1;
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(e.x - pulseSize, e.y - 2 + breathe + float, pulseSize * 2, pulseSize * 2);

      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(e.x - 10, e.y - 12 + breathe + float, 6, 8);
      ctx.fillRect(e.x + 4, e.y - 12 + breathe + float, 6, 8);

      ctx.globalAlpha = 1;
    }

    function drawFireGolem(e) {
      const breathe = Math.sin(e.anim * 0.02) * 1;
      const flicker = Math.sin(e.anim * 0.2) * 1.5;

      let scale = 1;
      if (e.size === 'half') scale = 0.7;
      else if (e.size === 'quarter') scale = 0.4;

      const width = 40 * scale;
      const height = 38 * scale;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(e.x - 24 * scale, e.y + 18 * scale, 48 * scale, 8 * scale);

      shadedRect(e.x - width/2 + flicker, e.y - height/2 + breathe, width, height, '#b71c1c');

      ctx.fillStyle = '#d32f2f';
      ctx.fillRect(e.x - width/2 + 2 * scale + flicker, e.y - height/2 + 2 * scale + breathe, width - 4 * scale, height - 4 * scale);

      ctx.fillStyle = '#f44336';
      ctx.fillRect(e.x - width/2 + 4 * scale + flicker, e.y - height/2 + 4 * scale + breathe, width - 8 * scale, height - 8 * scale);
      drawGlint(e.x - width/2 + 6 * scale + flicker, e.y - height/2 + 6 * scale + breathe, 6 * scale, 8 * scale);

      ctx.fillStyle = '#ff9800';
      ctx.fillRect(e.x - 8 * scale + flicker, e.y - height/2 - 4 * scale + breathe, 4 * scale, 6 * scale);
      ctx.fillRect(e.x + flicker, e.y - height/2 - 5 * scale + breathe, 4 * scale, 7 * scale);
      ctx.fillRect(e.x + 4 * scale + flicker, e.y - height/2 - 3 * scale + breathe, 4 * scale, 5 * scale);

      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(e.x - 10 * scale + flicker, e.y - 12 * scale + breathe, 6 * scale, 8 * scale);
      ctx.fillRect(e.x + 4 * scale + flicker, e.y - 12 * scale + breathe, 6 * scale, 8 * scale);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(e.x - 8 * scale + flicker, e.y - 10 * scale + breathe, 2 * scale, 4 * scale);
      ctx.fillRect(e.x + 6 * scale + flicker, e.y - 10 * scale + breathe, 2 * scale, 4 * scale);
    }

    function drawBullet(b) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      if (b.size && b.size !== 1) ctx.scale(b.size, b.size);
      if(b.bone){ctx.fillStyle='#eee8d4';ctx.fillRect(-10,-3,20,6);ctx.beginPath();ctx.arc(-10,0,4,0,Math.PI*2);ctx.arc(10,0,4,0,Math.PI*2);ctx.fill();ctx.restore();return;}
      if(shurikenCosmetic('shuriken-scholar_academy_headband')){ctx.fillStyle='#2458a6';ctx.fillRect(-11,-8,22,16);ctx.fillStyle='#f7e9b7';ctx.fillRect(-8,-6,7,12);ctx.fillRect(1,-6,7,12);ctx.fillStyle='#ffd15c';ctx.fillRect(-1,-7,2,14);ctx.restore();return;}
      const grad = ctx.createLinearGradient(-12, -12, 12, 12);
      grad.addColorStop(0, '#e8e8e8');
      grad.addColorStop(0.5, '#c0c0c0');
      grad.addColorStop(1, '#888888');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(3, -4);
      ctx.lineTo(12, 0);
      ctx.lineTo(3, 4);
      ctx.lineTo(0, 12);
      ctx.lineTo(-3, 4);
      ctx.lineTo(-12, 0);
      ctx.lineTo(-3, -4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4a4a4a';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawEnemyArrow(a) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot);
      ctx.fillStyle = '#8b4513';
      ctx.fillRect(-16, -2, 20, 4);
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(4, -4, 8, 8);
      ctx.restore();
    }

    function drawShadowTrap(trap) {
      const now = Date.now();
      const timeSincePlaced = now - trap.placed;

      if (!trap.activated) {
        const alpha = Math.min(1, timeSincePlaced / 500);
        ctx.globalAlpha = alpha;
      } else {
        const pulse = Math.sin(timeSincePlaced * 0.01) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
      }

      if(boneSkin('trap')){ctx.strokeStyle='#eee8d4';ctx.lineWidth=5;for(let i=0;i<7;i++){const a=i*Math.PI*2/7;ctx.beginPath();ctx.moveTo(trap.x,trap.y);ctx.lineTo(trap.x+Math.cos(a)*34,trap.y+Math.sin(a)*34);ctx.stroke();}}
      ctx.fillStyle = '#2d0a30';
      ctx.beginPath(); ctx.arc(trap.x, trap.y, 37.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a0620';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#4a0e4e';
      ctx.beginPath(); ctx.arc(trap.x, trap.y, 27, 0, Math.PI * 2); ctx.fill();

      const coreGrad = ctx.createRadialGradient(trap.x - 3, trap.y - 3, 1, trap.x, trap.y, 12);
      coreGrad.addColorStop(0, '#d199ff');
      coreGrad.addColorStop(1, '#8b00ff');
      ctx.fillStyle = coreGrad;
      ctx.beginPath(); ctx.arc(trap.x, trap.y, 12, 0, Math.PI * 2); ctx.fill();

      ctx.globalAlpha = 1;
    }

    function drawDart(d) {
      if(boneSkin('dart')){ctx.fillStyle='#eee8d4';ctx.fillRect(d.x-9,d.y-3,18,6);ctx.beginPath();ctx.arc(d.x-9,d.y,4,0,Math.PI*2);ctx.arc(d.x+9,d.y,4,0,Math.PI*2);ctx.fill();return;}
      shadedRect(d.x - 8, d.y - 2, 16, 4, '#8b4513');
      shadedRect(d.x + 6, d.y - 3, 6, 6, '#c0c0c0');
    }

    function drawParticle(p) {
      const life = (Date.now() - p.start) / p.life;
      ctx.globalAlpha = 1 - life;

      if (p.text) {
        ctx.font = `bold ${p.fontSize}px 'Courier New', monospace`;
        ctx.fillStyle = p.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }

      ctx.globalAlpha = 1;
    }

    function showLevelUpText() {
      particles.push({ x: 400, y: 200, vx: 0, vy: -1, size: 0, color: '#00d4ff', start: Date.now(), life: 2000, text: 'LEVEL UP!', fontSize: 48 });
      clampParticles();
    }

    let activeEvent = { id: null, speedMult: 1, onlyType: null, groupMult: 1, onlyGolems: false, coinMult: 1, damageMult: 1, doubleQuestions: false };

    const RANDOM_EVENTS = [
      { weight: 0.05, id: 'fastEnemies', message: 'The enemies are angrier and more desperate to kill you...', apply: (ev) => { ev.speedMult = 1.5; } },
      { weight: 0.025, id: 'singleTypeSwarm', apply: (ev) => {
          const pool = ['slime', 'bat', 'ghost', 'eye', 'archer', 'troll'];
          ev.onlyType = pool[Math.floor(Math.random() * pool.length)];
          ev.groupMult = 1.5;
        }
      },
      { weight: 0.025, id: 'onlyGolems', message: 'In entering this dungeon, only golems were found guarding the halls...', apply: (ev) => { ev.onlyGolems = true; } },
      { weight: 0.05, id: 'slowEnemies', message: 'The enemies seem sluggish and lethargic today...', apply: (ev) => { ev.speedMult = 0.75; } },
      { weight: 0.05, id: 'doubleDamage', message: 'The enemies attack with unusual ferocity...', apply: (ev) => { ev.damageMult = 2; } },
      { weight: 0.05, id: 'doubleQuestions', message: 'A heavier trial awaits at each level-up...', apply: (ev) => { ev.doubleQuestions = true; } }
    ];

    function rollRandomEvent() {
      const ev = { id: null, speedMult: 1, onlyType: null, groupMult: 1, onlyGolems: false, coinMult: 1, damageMult: 1, doubleQuestions: false };
      const roll = Math.random();
      let cumulative = 0;
      let chosen = null;
      for (const e of RANDOM_EVENTS) {
        cumulative += e.weight;
        if (roll < cumulative) { chosen = e; break; }
      }

      let message = null;
      if (chosen) {
        chosen.apply(ev);
        ev.id = chosen.id;
        if (chosen.id === 'singleTypeSwarm') {
          message = `In entering this dungeon, only ${ENEMY_DISPLAY_NAMES[ev.onlyType]}s were found lurking within...`;
        } else {
          message = chosen.message;
        }
      }

      activeEvent = ev;
      return message;
    }

    function spawnSpecificEnemy(type, x, y, speedMultiplier, baseHp, isMetal, forceVoid) {
      if(progress.selectedStage==='nightmare-forest'&&type==='slime')type='spider';
      if(progress.selectedStage==='ruined-kingdom'&&type==='slime')type='swordsman';
      if(progress.selectedStage==='ruined-kingdom'&&type==='eye')type='mage';
      const id = nextEnemyId++;
      const isVoid = forceVoid !== undefined ? forceVoid : Math.random() < getVoidChance();
      const voidMult = isVoid ? 2 : 1;

      if (type === 'bat') {
        const hp = isVoid ? Math.max(1, Math.floor(baseHp / 2)) : 1;
        enemies.push({ id, type: 'bat', x, y, speed: 0.8 * speedMultiplier, hp, maxHp: hp, anim: Math.random() * 100, metal: isMetal, isVoid });
      } else if (type === 'ghost') {
        const hp = baseHp * voidMult;
        const now = Date.now();
        enemies.push({ id, type: 'ghost', x, y, speed: 0.2 * speedMultiplier, hp, maxHp: hp, anim: Math.random() * 100, sineOffset: 0, metal: isMetal, isVoid, phased: false, lastPhase: now });
      } else if (type === 'eye' || type === 'mage') {
        const hp = baseHp * 2 * voidMult;
        enemies.push({ id, type, x, y, speed: 0.2 * speedMultiplier, hp, maxHp: hp, anim: Math.random() * 100, lastWarp: Date.now(), metal: isMetal, isVoid, lastLaser: Date.now(), lastFireball:Date.now() });
      } else if (type === 'archer') {
        const hp = baseHp * voidMult;
        enemies.push({ id, type: 'archer', x, y, speed: 0.5 * speedMultiplier, hp, maxHp: hp, anim: Math.random() * 100, lastShot: 0, metal: isMetal, isVoid, circleAngle: Math.random() * Math.PI * 2 });
      } else if (type === 'troll') {
        const hp = baseHp * 2 * voidMult;
        const now = Date.now();
        enemies.push({ id, type: 'troll', x, y, speed: 0.12 * speedMultiplier, hp, maxHp: hp, anim: Math.random() * 100, metal: isMetal, isVoid, lastHit: now, lastRegen: now });
      } else {
        const hp = baseHp * voidMult;
        enemies.push({ id, type, x, y, speed: 0.5 * speedMultiplier, hp, maxHp: hp, anim: Math.random() * 100, metal: isMetal, isVoid });
      }

      if (player.character === 'samurai' && pathLevel('katana', 'A') >= 4 && Math.random() < 0.15) {
        const newEnemy = enemies[enemies.length - 1];
        if (newEnemy) newEnemy.marked = true;
      }
    }

    function spawnEnemy() {
      const side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = Math.random() * 800; y = -20; }
      else if (side === 1) { x = 820; y = Math.random() * 600; }
      else if (side === 2) { x = Math.random() * 800; y = 620; }
      else { x = -20; y = Math.random() * 600; }

      const rand = Math.random();
      const baseHp = Math.floor(player.level / 3) + 1;
      const speedMultiplier = Math.pow(0.75, progress.runNumber - 1) * activeEvent.speedMult;

      const metalChance = Math.min((progress.deaths + currentCharUpgrades()) * 0.01, 0.10);
      const isMetal = player.level > 1 && Math.random() < metalChance;

      if (Math.random() < getMimicSpawnChance()) {
        const isVoidMimic = Math.random() < getMimicVoidChance();
        const mimicHp = Math.max(1, Math.floor(currentCharUpgrades() / 2));
        enemies.push({
          id: nextEnemyId++, type: 'mimic', x, y, speed: 0.09,
          hp: mimicHp, maxHp: mimicHp, anim: Math.random() * 100,
          isVoid: isVoidMimic, mimicTargets: [], morphTimer: 0,
          lastShot: 0, lastAbility: 0, lastWarp: 0, lastLaser: 0, lastPhase: 0,
          lastHit: 0, lastRegen: 0, lastBoostTick: 0, circleAngle: 0, sineOffset: 0,
          smokeTrail: []
        });
        return;
      }

      const golemChance = Math.min(player.level * 0.01, 0.10);
      if (player.level > 1 && (activeEvent.onlyGolems || Math.random() < golemChance)) {
        const golemRoll = Math.random();
        const isVoid = Math.random() < getVoidChance();
        const golemHp = isVoid ? baseHp * 2 : 1;
        const golemSpeedMult = isVoid ? 1.5 : 1;
        if (golemRoll < 0.25) {
          enemies.push({ id: nextEnemyId++, type: 'golem', x, y, speed: 0.05 * golemSpeedMult, hp: golemHp, maxHp: golemHp, anim: Math.random() * 100, lastAbility: Date.now(), isVoid });
        } else if (golemRoll < 0.50) {
          enemies.push({ id: nextEnemyId++, type: 'tree_golem', x, y, speed: 0.05 * golemSpeedMult, hp: golemHp, maxHp: golemHp, anim: Math.random() * 100, lastAbility: Date.now(), roots: [], isVoid });
        } else if (golemRoll < 0.75) {
          enemies.push({ id: nextEnemyId++, type: 'smoke_golem', x, y, speed: 0.2 * golemSpeedMult, hp: golemHp, maxHp: golemHp, anim: Math.random() * 100, sineOffset: 0, smokeTrail: [], isVoid });
        } else {
          enemies.push({ id: nextEnemyId++, type: 'fire_golem', x, y, speed: 0.05 * golemSpeedMult, hp: golemHp, maxHp: golemHp, anim: Math.random() * 100, size: 'full', isVoid });
        }
        return;
      }

      if (activeEvent.onlyType && !(player.level === 1 && (activeEvent.onlyType === 'troll' || activeEvent.onlyType.includes('golem')))) {
        const isVoidGroup = Math.random() < getVoidChance();
        let baseGroupSize = activeEvent.onlyType === 'bat' ? progress.runNumber + 1 : 1;
        if (isVoidGroup && activeEvent.onlyType === 'bat') baseGroupSize *= 2;
        const groupSize = Math.max(1, Math.ceil(baseGroupSize * activeEvent.groupMult));
        for (let i = 0; i < groupSize; i++) {
          const ox = x + (Math.random() - 0.5) * 60;
          const oy = y + (Math.random() - 0.5) * 60;
          spawnSpecificEnemy(activeEvent.onlyType, ox, oy, speedMultiplier, baseHp, player.level > 1 && Math.random() < metalChance, isVoidGroup);
        }
        return;
      }

      if (rand < 0.10) {
        const isVoidGroup = Math.random() < getVoidChance();
        const groupSize = isVoidGroup ? (progress.runNumber + 1) * 2 : progress.runNumber + 1;
        for (let i = 0; i < groupSize; i++) {
          const batMetal = player.level > 1 && Math.random() < metalChance;
          spawnSpecificEnemy('bat', x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60, speedMultiplier, baseHp, batMetal, isVoidGroup);
        }
      } else if (rand < 0.20) {
        spawnSpecificEnemy('ghost', x, y, speedMultiplier, baseHp, isMetal);
      } else if (rand < 0.25) {
        spawnSpecificEnemy('eye', x, y, speedMultiplier, baseHp, isMetal);
      } else if (rand < 0.35) {
        spawnSpecificEnemy('archer', x, y, speedMultiplier, baseHp, isMetal);
      } else if (player.level > 1 && rand < 0.45) {
        spawnSpecificEnemy('troll', x, y, speedMultiplier, baseHp, isMetal);
      } else {
        spawnSpecificEnemy('slime', x, y, speedMultiplier, baseHp, isMetal);
      }
    }

    function bossSpawnRate(level) {
      const tier = Math.max(1, (level || 10) / 10);
      return Math.pow(3, tier - 1); // spawns per second
    }

    function spawnBoss(levelNum) {
      const pool = ['slime', 'bat', 'archer', 'eye', 'ghost', 'troll'];
      let baseType = pool[Math.floor(Math.random() * pool.length)];
      if(progress.selectedStage==='nightmare-forest'&&baseType==='slime')baseType='spider';
      if(progress.selectedStage==='ruined-kingdom'&&baseType==='slime')baseType='swordsman';
      if(progress.selectedStage==='ruined-kingdom'&&baseType==='eye')baseType='mage';

      const side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = Math.random() * 800; y = -20; }
      else if (side === 1) { x = 820; y = Math.random() * 600; }
      else if (side === 2) { x = Math.random() * 800; y = 620; }
      else { x = -20; y = Math.random() * 600; }

      const baseHp = Math.floor(player.level / 3) + 1;
      const speedMultiplier = Math.pow(0.75, progress.runNumber - 1) * activeEvent.speedMult;

      let typeBaseHp = baseHp;
      let typeBaseSpeed = 0.5 * speedMultiplier;
      if (baseType === 'bat') { typeBaseHp = 1; typeBaseSpeed = 0.8 * speedMultiplier; }
      else if (baseType === 'ghost') { typeBaseHp = baseHp; typeBaseSpeed = 0.2 * speedMultiplier; }
      else if (baseType === 'eye' || baseType === 'mage') { typeBaseHp = baseHp * 2; typeBaseSpeed = 0.2 * speedMultiplier; }
      else if (baseType === 'archer') { typeBaseHp = baseHp; typeBaseSpeed = 0.5 * speedMultiplier; }
      else if (baseType === 'troll') { typeBaseHp = baseHp * 2; typeBaseSpeed = 0.12 * speedMultiplier; }

      const isVoid = Math.random() < getVoidChance();
      const bossHp = typeBaseHp * 6 * (isVoid ? 2 : 1); // 500% MORE hp = x6 total; void stacks another x2
      const bossSpeed = typeBaseSpeed * 0.5;

      const now = Date.now();
      const boss = {
        id: nextEnemyId++, type: baseType, x, y,
        speed: bossSpeed, hp: bossHp, maxHp: bossHp,
        anim: Math.random() * 100, metal: false,
        isBoss: true, isVoid, bossLevel: levelNum,
        lastAbility: now, lastHit: now, lastRegen: now,
        lastWarp: now, lastLaser: now, lastShot: 0, sineOffset: 0,
        phased: false, lastPhase: now,
        circleAngle: Math.random() * Math.PI * 2,
        healTriggered: { 75: false, 50: false, 25: false },
        lastFireball: now,
        cloneCount: 0,
        spiralAngle: Math.random() * Math.PI * 2,
        spiralRadius: 220
      };
      enemies.push(boss);
      activeBossId = boss.id;

      triggerShake(isVoid ? 18 : 12, 600);

      for (let k = 0; k < 20; k++) {
        const angle = Math.random() * Math.PI * 2;
        particles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3, size: 6, color: '#ff0055', start: now, life: 1200 });
      }
      const bossDisplayName = ENEMY_DISPLAY_NAMES[baseType] || baseType;
      particles.push({ x: 400, y: 100, vx: 0, vy: 0, text: `⚠️ BOSS INCOMING ⚠️`, color: '#ff0055', fontSize: 28, start: now, life: 2500 });
      particles.push({ x: 400, y: 135, vx: 0, vy: 0, text: isVoid ? `☠ VOID ${bossDisplayName.toUpperCase()} ☠` : bossDisplayName.toUpperCase(), color: isVoid ? '#b266ff' : '#ffffff', fontSize: 22, start: now, life: 2500 });
    }

    function maintainEnemies() {
      for(const e of enemies){if(e.stageModifierApplied)continue;e.stageModifierApplied=true;if(progress.selectedStage==='nightmare-forest')e.speed*=1.15;if(progress.selectedStage==='ruined-kingdom'){e.hp*=2;e.maxHp*=2;}}
      const upgradeSpawnAmount = SPAWNING_ADDS_UPGRADE_AMOUNT
        ? Math.pow(1.15, currentCharUpgrades() / 2)
        : 0;
      const target = Math.max(1, Math.round((player.level + upgradeSpawnAmount) * curseEffects.spawnRateMult));
      if (enemies.length < target && (game.frame % 5 === 0)) spawnEnemy();
    }

    const HOMING_LOCK_RADIUS = 100;
    function findHomingLockTarget() {
      let best = null, bestDist = HOMING_LOCK_RADIUS;
      for (const e of enemies) {
        if (e.dead || e.phased) continue;
        const d = Math.hypot(e.x - targetX, e.y - targetY);
        if (d <= bestDist) { bestDist = d; best = e; }
      }
      return best;
    }

    function fireShurikenVolley() {
      const v = norm(targetX - player.x, targetY - player.y);
      if (v.d === 0) return;
      let speed = upgrades.projSpeed;
      const baseAngle = Math.atan2(v.ny, v.nx);

      const levelA = pathLevel('shuriken', 'A');
      const levelB = pathLevel('shuriken', 'B');
      const subC = subPathLevel('shuriken', 'C');
      const subD = subPathLevel('shuriken', 'D');
      const shW = progress.weapons.shuriken;

      if (shW.subPath === 'C' && subC >= 6) speed *= 1.25; // Endless Storm

      let extra = levelB >= 1 ? 1 : 0;
      if (levelB >= 5) extra += 1; // Blade Storm
      const numShots = 1 + extra + (window.AchievementManager?.hasSecret?.('secret_twin_shot') ? 1 : 0);
      const spreadAngle = levelB >= 2 ? 0.3 : 0.1;

      const homingTarget = levelA >= 2 ? findHomingLockTarget() : null;

      let markChance = 0;
      if (shW.subPath === 'C' && subC >= 8) {
        markChance = 0.1;
        if (subC >= 10) markChance += 0.05 * wSubRepeats('shuriken'); // Sharpen Blade (repeatable)
      }

      let bounces = wRepeats('shuriken');
      if (shW.subPath === 'D' && subD >= 6) bounces += 1; // Spectral Bounce
      if (shW.subPath === 'D' && subD >= 10) bounces += wSubRepeats('shuriken'); // Extra Bounce (repeatable)

      let spiralRevolutions = 0;
      if (shW.subPath === 'D' && subD >= 7) spiralRevolutions = 1;
      if (shW.subPath === 'D' && subD >= 8) spiralRevolutions = 2;
      if (shW.subPath === 'D' && subD >= 10) spiralRevolutions += wSubRepeats('shuriken'); // Spiral Shot+ (repeatable)

      const spawnShot = (angle) => {
        if (bullets.length >= MAX_BULLETS) return;
        bullets.push({
          x: player.x, y: player.y,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          rot: 0,
          dmg: upgrades.damage * upgrades.shurikenDamageMult,
          fullRicochets: bounces,
          falloffRicochet: levelA >= 3,
          homingRicochet: shW.subPath === 'D' && subD >= 8, // Seeking Spirits
          pierce: levelA >= 5, // Shadow Master
          homing: !!homingTarget,
          homingTargetId: homingTarget ? homingTarget.id : null,
          stunOnHit: levelA >= 4,
          bleedOnHit: shW.subPath === 'D' && subD >= 7, // Ghost Chain
          bleedStacks: shW.subPath === 'D' && subD >= 9, // Chain Reaction
          markChance,
          isFirstHitOfThrow: shW.subPath === 'C' && subC >= 7, // Execution
          hasHitFirst: false,
          spiralRevolutions,
          size: (shW.subPath === 'D' && subD >= 9) ? 1.5 : 1, // Buzzsaw
          spawnTime: Date.now(),
          hasBounced: false,
          hitIds: []
        });
        const made=bullets[bullets.length-1];if(boneSkin('shuriken'))made.bone=true;if(player.character==='skeleton'){made.bone=true;made.dmg*=player.level>=8?2:player.level>=4?1.5:1;if(player.level>=3)made.pierce=true;if(player.level>=6){made.homing=true;made.homingTargetId=homingTarget?.id||findHomingLockTarget()?.id||null;}}
      };

      for (let i = 0; i < numShots; i++) {
        const offset = numShots > 1 ? (i - (numShots - 1) / 2) * spreadAngle : 0;
        spawnShot(baseAngle + offset);
      }

      // Backshot: also fires one shuriken directly behind the player.
      if (shW.subPath === 'D' && subD >= 6) {
        spawnShot(baseAngle + Math.PI);
      }

      // Shuriken Burst: chance for a bonus small spread on top of the normal throw.
      if (shW.subPath === 'C' && subC >= 8 && Math.random() < 0.15) {
        for (let i = -1; i <= 1; i++) spawnShot(baseAngle + i * 0.4);
      }

      // Hurricane: every 10th shot fires a full ring of shurikens.
      if (shW.subPath === 'C' && subC >= 9) {
        shurikenShotCounter = (shurikenShotCounter || 0) + 1;
        if (shurikenShotCounter % 10 === 0) {
          for (let i = 0; i < 8; i++) spawnShot((i / 8) * Math.PI * 2);
        }
      }
    }

    function shoot() {
      // Storm of Steel path 3+ switches to manual click-to-fire with a magazine (see canvas click handler).
      if (pathLevel('shuriken', 'B') >= 3) return;

      const now = Date.now();
      const dynamicCooldown = Math.min(upgrades.cooldown * 1.2, upgrades.cooldown + 120);
      if (now - lastShoot < dynamicCooldown) return;
      lastShoot = now;

      fireShurikenVolley();
    }

    function explodeSmokeAt(x, y, radius, dealsDamage) {
      const now = Date.now();
      for (let i = 0; i < 16; i++) {
        particles.push({ x: x + (Math.random() - 0.5) * radius, y: y + (Math.random() - 0.5) * radius, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, size: Math.random() * 8 + 4, color: Math.random() > 0.5 ? '#666' : '#888', start: now, life: 800 });
      }
      clampParticles();

      for (const e of enemies) {
        if (e.dead || e.phased) continue;
        const et = mimicEffType(e);
        if (et === 'golem' || et === 'tree_golem' || et === 'fire_golem') continue;
        const dist = Math.hypot(e.x - x, e.y - y);
        if (dist > radius) continue;
        if (et === 'smoke_golem') {
          if (e.isVoid) {
            e.hp -= upgrades.smokeDamage;
            e.lastHit = now;
            if (e.hp <= 0) markEnemyDead(e, 'smoke');
          } else {
            markEnemyDead(e, 'smoke');
          }
          continue;
        }
        if (!dealsDamage) continue;
        let dmg = upgrades.smokeDamage;
        if (e.cloudDamageAmp && e.cloudDamageAmp > 1) dmg *= e.cloudDamageAmp;
        if (e.isVoid && e.type === 'archer') dmg *= 0.5;
        e.hp -= dmg;
        e.lastHit = now;
        if (e.hp <= 0) markEnemyDead(e, 'smoke');
      }
    }

    function throwSmoke() {
      const now = Date.now();
      const subCs = subPathLevel('smoke', 'C');
      const smokeW = progress.weapons.smoke;
      let cooldown = upgrades.smokeCooldown;
      if (now - lastSmoke < cooldown) return;
      if (enemies.length === 0) return;
      lastSmoke = now;

      let target = null, minDist = Infinity;
      for (const e of enemies) {
        if (e.dead || e.phased) continue;
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < minDist) { minDist = dist; target = e; }
      }
      if (!target) return;

      const levelA = pathLevel('smoke', 'A');
      const levelB = pathLevel('smoke', 'B');
      const subC = subPathLevel('smoke', 'C');
      const subD = subPathLevel('smoke', 'D');

      let radius = 60;
      if (levelA >= 1) radius *= 1.5;
      if (levelB >= 2) radius *= 1.3;
      if (levelA >= 5) radius *= 1.5; // Dense Fog
      if (smokeW.subPath === 'C' && subC >= 10) radius *= (1 + 0.05 * wSubRepeats('smoke')); // Cloud Size (repeatable)
      if (smokeW.subPath === 'C' && subC >= 9 && levelB >= 6) radius *= 1.1; // Smoke Damage radius bonus (guarded oddly, harmless)

      const dealsDamage = !(levelA >= 3);
      explodeSmokeAt(target.x, target.y, radius, dealsDamage);

      const subDs = subPathLevel('smoke', 'D');
      let debuffDurationMult = 1;
      if (smokeW.subPath === 'D' && subDs >= 10) debuffDurationMult += 0.05 * wSubRepeats('smoke'); // Debuff Strength (repeatable)

      if (levelA >= 2 || (smokeW.subPath === 'D' && subDs >= 7)) {
        let cloudLife = levelA >= 5 ? 3000 : 2000;
        if (smokeW.subPath === 'D' && subDs >= 7) cloudLife = upgrades.smokeCooldown * 0.75; // Lingering Mist (Control D)
        smokeClouds.push({
          x: target.x, y: target.y, radius,
          expiresAt: now + cloudLife * debuffDurationMult,
          debuffSlow: levelA >= 3,
          weaken: levelA >= 4,
          stunDuration: 0,
          mirage: smokeW.subPath === 'C' && subC >= 6,
          shadowClone: smokeW.subPath === 'C' && subC >= 7,
          teleportMist: smokeW.subPath === 'C' && subC >= 8,
          phantomRealm: smokeW.subPath === 'C' && subC >= 9,
          fearGas: smokeW.subPath === 'D' && subDs >= 8,
          nightmareControl: smokeW.subPath === 'D' && subDs >= 9,
          poisonSurvivors: smokeW.subPath === 'C' && subC >= 6
        });
      }

      {
        let chainChance = levelB >= 3 ? 0.25 : 0;
        let secondaryCount = chainChance > 0 ? 1 : 0;
        if (smokeW.subPath === 'C' && subC >= 7) secondaryCount += 1; // Cluster Bomb
        for (let c = 0; c < secondaryCount; c++) {
          if (Math.random() < (chainChance || 1)) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 40 + Math.random() * 40;
            explodeSmokeAt(target.x + Math.cos(angle) * dist, target.y + Math.sin(angle) * dist, radius * 0.6, true);
          }
        }
        if (levelB >= 4) {
          const ex = target.x, ey = target.y, r = radius;
          setTimeout(() => { if (game.active && !game.paused) explodeSmokeAt(ex, ey, r, true); }, 250);
        }
        // Toxic Mist (Explosives level 5): a lingering pool dealing 50% of remaining HP over time.
        if (levelB >= 5) {
          toxicMistPools.push({ x: target.x, y: target.y, radius: radius * 0.8, created: now, life: 4000, lastTick: now, decayStacks: smokeW.subPath === 'C' && subC >= 8 });
        }
        // Poison Cloud: enemies that survive the initial blast are poisoned.
        if (smokeW.subPath === 'C' && subC >= 6) {
          for (const e of enemies) {
            if (e.dead || e.phased) continue;
            if (Math.hypot(e.x - target.x, e.y - target.y) < radius) {
              const stacking = subC >= 8; // Decay Smoke
              e.poisonUntil = stacking ? (e.poisonUntil || now) + 3000 : Math.max(e.poisonUntil || 0, now + 3000);
              e.poisonNextTick = Math.min(e.poisonNextTick || Infinity, now + 500);
              e.poisonDmg = stacking ? (e.poisonDmg || 0) + 1 : Math.max(e.poisonDmg || 0, 1);
              if (subC >= 9) e.smokeDeathFog = true; // Death Fog
            }
          }
        }
      }
    }
    let toxicMistPools = [];

    const GOLEM_WEAKNESS = { shuriken: 'fire_golem', dart: 'tree_golem', smoke: 'smoke_golem', trap: 'golem', katana: 'fire_golem', naginata: 'tree_golem', bow: 'smoke_golem', servant: 'golem' };
    const GOLEM_TYPES = ['golem', 'tree_golem', 'smoke_golem', 'fire_golem'];
    // A mimic currently copying a golem inherits that golem's exact weapon immunity too.
    function mimicEffType(e) {
      return (e.type === 'mimic' && e.mimicking) ? e.mimicking : e.type;
    }

    function dealWeaponDamage(e, dmg, weaponKey) {
      const et = mimicEffType(e);
      if (GOLEM_TYPES.includes(et)) {
        if (et !== GOLEM_WEAKNESS[weaponKey]) return false; // immune to the wrong weapon
        if (!e.isVoid) { markEnemyDead(e, weaponKey); return true; }
      }
      if (e.corroded) dmg *= 1.15; // Corrosive Venom (Bow Archer D)
      const trapSubC = subPathLevel('trap', 'C');
      const isRootedNow = e.rootedUntil && Date.now() < e.rootedUntil;
      if (isRootedNow && progress.weapons.trap.subPath === 'C' && trapSubC >= 8) dmg *= 1.2; // Crushing Grip
      if (isRootedNow && progress.weapons.trap.subPath === 'C' && trapSubC >= 9 && e.hp / e.maxHp <= 0.15) { // Execution Ground
        markEnemyDead(e, weaponKey);
        return true;
      }
      e.hp -= dmg;
      e.lastHit = Date.now();
      if (e.hp <= 0) markEnemyDead(e, weaponKey);
      return true;
    }

    // ---------------- KATANA ----------------
    function katanaSlash() {
      const now = Date.now();
      const levelA = pathLevel('katana', 'A');
      const levelB = pathLevel('katana', 'B');
      const subC = subPathLevel('katana', 'C');
      const subD = subPathLevel('katana', 'D');
      const w = progress.weapons.katana;

      let cooldown = upgrades.katanaCooldown;
      if (levelA >= 1) cooldown *= 0.9;
      if (w.subPath === 'D' && subD >= 10) cooldown *= Math.pow(0.95, wSubRepeats('katana')); // Cool Down (repeatable)
      cooldown *= (1 - Math.min(0.2, honor * 0.02));
      if (now - lastKatana < cooldown) return;
      lastKatana = now;

      const baseAngle = player.facingAngle;
      const isThrust = w.subPath === 'D' && subD >= 6; // Thrusting Blade converts the attack

      let range = upgrades.katanaRange;
      if (levelA >= 2) range *= 1.3;
      if (w.subPath === 'C' && subC >= 7) range *= 1.15; // Long Blade
      if (isThrust && subD >= 8) range *= 1.15; // Longer Blade (pierce range)

      let arcDeg = isThrust ? 18 : upgrades.katanaArc; // thrust is a narrow line, not a wide arc
      if (!isThrust) {
        if (levelB >= 2) arcDeg *= 1.4;
        if (w.subPath === 'C' && subC >= 8) arcDeg *= 1.15; // Further Slash
      }
      const arcRad = arcDeg * Math.PI / 180;

      let dmg = upgrades.katanaDamage * (1 + Math.min(0.2, honor * 0.02));
      if (levelB >= 1) dmg *= 1.2;

      const markedMult = (w.subPath === 'C' && subC >= 9) || (w.subPath === 'D' && subD >= 9) ? 3 : 2; // Marked Slash/Pierce

      let numSlashes = 1 + (levelA >= 5 ? wRepeats('katana') : 0);
      if (w.subPath === 'C' && subC >= 10) numSlashes += wSubRepeats('katana'); // Grandmaster (repeatable)
      const hitIds = new Set();

      for (let s = 0; s < numSlashes; s++) {
        const slashAngle = baseAngle + (numSlashes > 1 ? (s - (numSlashes - 1) / 2) * 0.3 : 0);
        katanaSlashFX.push({ x: player.x, y: player.y, angle: slashAngle, arc: arcRad, range, created: now, life: 200, thrust: isThrust });

        for (const e of enemies) {
          if (e.dead || e.phased || (hitIds.has(e.id) && !isThrust)) continue;
          const dx = e.x - player.x, dy = e.y - player.y;
          const dist = Math.hypot(dx, dy);
          let hit = false;

          if (dist <= range) {
            const angleToE = Math.atan2(dy, dx);
            let diff = Math.abs(angleToE - slashAngle);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff <= arcRad / 2) hit = true;
          }
          // Piercing Blade: a thrust keeps hitting everything in its line, ignoring hitIds.
          if (hit && isThrust && subD < 7 && hitIds.has(e.id)) hit = false;

          if (hit) {
            hitIds.add(e.id);
            let finalDmg = dmg;
            if (levelA >= 4 && e.marked) finalDmg *= markedMult;

            // Heavy D: Cleaving Strike - bleed, and Executioner's Edge bonus vs bleeding targets.
            if (w.subPath === 'D' && subD >= 6 && e.bleedUntil && now < e.bleedUntil && subD >= 7) finalDmg *= 1.2;

            const wasDead = e.dead;
            const wasBleedingAlready = e.bleedUntil && now < e.bleedUntil;
            const landed = dealWeaponDamage(e, finalDmg, 'katana');

            if (landed) {
              // Vampire Blade: killing with the katana has a chance to heal.
              if (w.subPath === 'C' && subC >= 6 && e.dead && !wasDead && Math.random() < 0.15 && player.hp < player.maxHp) {
                player.hp = Math.min(player.maxHp, player.hp + 1);
                updateUI();
              }
              // Heavy D: Cleaving Strike applies bleed on hit.
              if (w.subPath === 'D' && subD >= 6 && !e.dead) {
                e.bleedUntil = Math.max(e.bleedUntil || 0, now + 3000);
                e.bleedNextTick = Math.min(e.bleedNextTick || Infinity, now + 500);
                e.bleedDmg = Math.max(e.bleedDmg || 0, 1 + (subD >= 10 ? wSubRepeats('katana') : 0)); // Endless Carnage
              }
              // Heavy D: Crushing Blow - chance to stun on heavy hits.
              if (w.subPath === 'D' && subD >= 8 && !e.dead && Math.random() < 0.25) {
                e.stunnedUntil = Math.max(e.stunnedUntil || 0, now + 800);
              }
              // Heavy D: Blood Explosion - bleeding enemies explode on death.
              if (w.subPath === 'D' && subD >= 9 && e.dead && wasBleedingAlready) {
                for (const other of enemies) {
                  if (other === e || other.dead || other.phased) continue;
                  if (Math.hypot(other.x - e.x, other.y - e.y) < 60) {
                    dealWeaponDamage(other, Math.ceil(upgrades.katanaDamage * 0.75), 'katana');
                  }
                }
              }

              if (!e.dead) {
                if (levelB >= 3) {
                  const kv = norm(e.x - player.x, e.y - player.y);
                  e.x += kv.nx * 20; e.y += kv.ny * 20;
                }
                // Heavy C: Unstable Ground - slashes leave a slowing earthquake zone.
                if (w.subPath === 'C' && subC >= 7) {
                  earthquakeZones.push({ x: e.x, y: e.y, created: now, life: 2000, radius: 50 });
                }
              }
              if (e.dead && levelB >= 4) spawnKatanaShockwave(e.x, e.y, slashAngle);
            }
          } else if (levelA >= 3 && dist <= range * 1.4 && dist > 1) {
            // Pulling Blade: enemies just outside the strike are gently drawn toward the blade
            const pv = norm(player.x - e.x, player.y - e.y);
            e.x += pv.nx * 4;
            e.y += pv.ny * 4;
          }
        }
      }
    }

    // Heavy C: Unstable Ground hazard zones - slow enemies standing in them.
    let earthquakeZones = [];

    function spawnKatanaShockwave(x, y, baseAngle) {
      const count = 1 + wRepeats('katana');
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + (i - (count - 1) / 2) * 0.5;
        shockwaves.push({ x, y, vx: Math.cos(angle) * 4, vy: Math.sin(angle) * 4, dist: 0, maxDist: 80, dmg: upgrades.katanaDamage, hitIds: [] });
      }
    }

    // ---------------- NAGINATA ----------------
    function naginataThrow() {
      const now = Date.now();
      const levelA = pathLevel('naginata', 'A');
      const levelB = pathLevel('naginata', 'B');
      const subC = subPathLevel('naginata', 'C');
      const subD = subPathLevel('naginata', 'D');
      const nagW = progress.weapons.naginata;

      let cooldown = upgrades.naginataCooldown;
      if (levelA >= 5) cooldown *= 0.9;
      // Lancer's Charge: faster attacks when nothing is nearby.
      if (nagW.subPath === 'C' && subC >= 8) {
        const nearbyEnemy = enemies.some(e => !e.dead && !e.phased && Math.hypot(e.x - player.x, e.y - player.y) < 150);
        if (!nearbyEnemy) cooldown *= 0.8;
      }
      cooldown *= (1 - Math.min(0.2, honor * 0.02));
      if (now - lastNaginata < cooldown) return;
      lastNaginata = now;

      // Blink Assault: dash toward the nearest enemy just before attacking.
      if (nagW.subPath === 'D' && subD >= 9) {
        const blinkTarget = findNearest(player.x, player.y, []);
        if (blinkTarget) {
          const bv = norm(blinkTarget.x - player.x, blinkTarget.y - player.y);
          player.x += bv.nx * 40; player.y += bv.ny * 40;
        }
      }

      let range = upgrades.naginataRange;
      if (levelA >= 2) range *= 1.3;
      if (levelA >= 5) range *= 1.1;
      let speed = upgrades.naginataSpeed;
      if (levelA >= 5) speed *= 1.1;

      let dmg = upgrades.naginataDamage * (1 + Math.min(0.2, honor * 0.02));
      // Dragon Soul: repeatable damage growth.
      if (nagW.subPath === 'C' && subC >= 10) dmg *= (1 + 0.1 * wSubRepeats('naginata'));

      let angle;
      const nearest = findNearest(player.x, player.y, []);
      if (levelA >= 1 && nearest && Math.random() < 0.65) {
        angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
      } else {
        const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        angle = dirs[Math.floor(Math.random() * 4)];
      }

      const spearCount = levelB >= 1 ? 2 : 1;
      for (let i = 0; i < spearCount; i++) {
        const a = i === 1 ? angle + Math.PI : angle;
        naginataSpears.push({ x: player.x, y: player.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, startX: player.x, startY: player.y, range, dmg, pierce: levelA >= 3, spinning: levelB >= 2, hitIds: [] });
      }

      // Phantom Strike (Precision D): a delayed spear fires a moment later.
      if (nagW.subPath === 'D' && subD >= 6) {
        const phantomHits = subD >= 7 ? 2 : 1; // Afterimage: hits twice
        const echoChance = subD >= 10 ? 0.1 * wSubRepeats('naginata') : 0; // Echo Spear (repeatable)
        for (let p = 0; p < phantomHits; p++) {
          setTimeout(() => {
            if (game.paused || gameOver) return;
            naginataSpears.push({ x: player.x, y: player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, startX: player.x, startY: player.y, range, dmg: dmg * 0.7, pierce: levelA >= 3, spinning: false, hitIds: [] });
          }, 220 + p * 150);
        }
        if (Math.random() < echoChance) {
          setTimeout(() => {
            if (game.paused || gameOver) return;
            naginataSpears.push({ x: player.x, y: player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, startX: player.x, startY: player.y, range, dmg: dmg * 0.7, pierce: levelA >= 3, spinning: false, hitIds: [] });
          }, 450);
        }
      }

      // Spinning Assault: quick 360 spin around the player before the throw
      if (levelB >= 3) {
        let spinRadius = 50;
        if (nagW.subPath === 'C' && subC >= 6) spinRadius *= 1.2; // Larger Tornado
        if (nagW.subPath === 'C' && subC >= 10) spinRadius *= (1 + 0.1 * wSubRepeats('naginata')); // Storm Force
        const pullRadius = (nagW.subPath === 'C' && subC >= 7) ? spinRadius * 2.5 : spinRadius; // Vacuum Storm
        let spinHits = 1 + (levelB >= 5 ? 1 : 0);
        if (nagW.subPath === 'C' && subC >= 9) spinHits += 2; // Endless Cyclone
        for (let hitPass = 0; hitPass < spinHits; hitPass++) {
          for (const e of enemies) {
            if (e.dead || e.phased) continue;
            const dist = Math.hypot(e.x - player.x, e.y - player.y);
            if (dist < pullRadius && dist >= spinRadius && nagW.subPath === 'C' && subC >= 7) {
              const pv = norm(player.x - e.x, player.y - e.y);
              e.x += pv.nx * 6; e.y += pv.ny * 6;
            }
            if (dist < spinRadius) {
              if (levelB >= 4 && hitPass === 0) {
                const pv = norm(player.x - e.x, player.y - e.y);
                e.x += pv.nx * 8; e.y += pv.ny * 8;
              }
              // Razor Wind: every pass deals damage (already looping hitPass); otherwise only first pass would matter here regardless, so this just naturally works.
              applyNaginataHit(e, dmg);
            }
          }
        }
        for (let k = 0; k < 16; k++) {
          const ang = (k / 16) * Math.PI * 2;
          particles.push({ x: player.x + Math.cos(ang) * spinRadius, y: player.y + Math.sin(ang) * spinRadius, vx: 0, vy: 0, size: 3, color: '#c0c0c0', start: now, life: 200 });
        }

        // Ground Slam (Whirlwind D): the spin finishes with a heavy slam.
        if (nagW.subPath === 'D' && subD >= 6) {
          for (const e of enemies) {
            if (e.dead || e.phased) continue;
            if (Math.hypot(e.x - player.x, e.y - player.y) < spinRadius * 1.3) {
              dealWeaponDamage(e, dmg * 0.8, 'naginata');
            }
          }
          // Cracked Earth: leaves damaging cracks where the slam landed.
          if (subD >= 7) {
            let crackRadius = spinRadius * 1.3;
            if (subD >= 10) crackRadius *= (1 + 0.15 * wSubRepeats('naginata')); // Larger Quake
            crackedEarthZones.push({
              x: player.x, y: player.y, created: now, life: 3000, radius: crackRadius,
              tickRate: subD >= 8 ? 400 : 800, lastTick: now, dmg: Math.ceil(dmg * 0.3),
              root: subD >= 9
            });
          }
        }
      }
    }

    // Whirlwind D: Cracked Earth hazard zones - periodic damage, optionally rooting enemies.
    let crackedEarthZones = [];

    // ---------------- BOW ----------------
    function bowShoot() {
      const now = Date.now();
      const levelA = pathLevel('bow', 'A');
      const levelB = pathLevel('bow', 'B');
      const subC = subPathLevel('bow', 'C');
      const subD = subPathLevel('bow', 'D');
      const bowW = progress.weapons.bow;

      let cooldown = upgrades.bowCooldown;
      if (levelA >= 1) cooldown *= 0.85;
      if (bowW.subPath === 'C' && subC >= 7) cooldown *= 0.8; // Rapid Barrage
      cooldown *= (1 - Math.min(0.2, honor * 0.02));
      if (now - lastBow < cooldown) return;

      let target;
      const archers = enemies.filter(e => !e.dead && !e.phased && e.type === 'archer');
      const eliteTargeting = levelA >= 3 || (bowW.subPath === 'C' && subC >= 8); // Eagle Eye
      if (archers.length > 0) {
        target = eliteTargeting
          ? archers.sort((a, b) => b.hp - a.hp)[0]
          : archers.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
      } else if (eliteTargeting) {
        const tough = enemies.filter(e => !e.dead && !e.phased && e.maxHp > 1);
        target = (tough.length > 0 ? tough : enemies.filter(e => !e.dead && !e.phased)).sort((a, b) => b.hp - a.hp)[0];
      } else {
        target = findNearest(player.x, player.y, []);
      }
      if (!target) return;
      lastBow = now;

      let speed = upgrades.bowSpeed;
      if (levelA >= 2) speed *= 1.3;
      let dmg = upgrades.bowDamage * (1 + Math.min(0.2, honor * 0.02));

      const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
      let numArrows = 1 + (levelB >= 1 ? 1 : 0) + (levelB >= 5 ? 1 : 0);
      if (bowW.subPath === 'C' && subC >= 10) numArrows += wSubRepeats('bow'); // Endless Volley (repeatable)
      const spread = levelB >= 2 ? 0.3 : 0.05;
      const bleedDmg = levelA >= 5 ? 1 : 1;

      const critChance = (bowW.subPath === 'C' && subC >= 6) ? 0.2 : 0;
      let critMult = (bowW.subPath === 'C' && subC >= 7) ? 1.75 : 1;
      if (bowW.subPath === 'C' && subC >= 10) critMult += 0.15 * wSubRepeats('bow'); // Sharpshooter (repeatable)
      const ignorePierceLimit = bowW.subPath === 'C' && subC >= 9; // Deadly Accuracy

      const poisonOnHit = bowW.subPath === 'D' && subD >= 6;
      const poisonSpread = bowW.subPath === 'D' && subD >= 7;
      const poisonWeaken = bowW.subPath === 'D' && subD >= 8;
      let poisonDuration = 3000;
      if (bowW.subPath === 'D' && subD >= 9) poisonDuration *= 1.5; // Lethal Infection
      let poisonDmg = 1;
      if (bowW.subPath === 'D' && subD >= 10) poisonDmg += wSubRepeats('bow'); // Potent Venom (repeatable)

      const bounceCount = bowW.subPath === 'D' && subD >= 6 ? 1 + (subD >= 10 ? wSubRepeats('bow') : 0) : 0; // Ricochet + Extra Bounce

      for (let i = 0; i < numArrows; i++) {
        const offset = numArrows > 1 ? (i - (numArrows - 1) / 2) * spread : 0;
        const angle = baseAngle + offset;
        bowArrows.push({
          x: player.x, y: player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          dmg, pierce: levelA >= 3, ignorePierceLimit, bleed: levelA >= 4, bleedDmg, hitIds: [],
          critChance, critMult, poisonOnHit, poisonSpread, poisonWeaken, poisonDuration, poisonDmg,
          bouncesLeft: bounceCount, smartBounce: bowW.subPath === 'D' && subD >= 7,
          explosiveBounce: bowW.subPath === 'D' && subD >= 8, magneticBounce: bowW.subPath === 'D' && subD >= 9
        });
      }

      if (levelB >= 3) {
        let fanCount = 5;
        if (bowW.subPath === 'C' && subC >= 6) fanCount += 2; // Larger Volley
        for (let i = 0; i < fanCount; i++) {
          const angle = baseAngle + (i - (fanCount - 1) / 2) * 0.25;
          bowArrows.push({
            x: player.x, y: player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            dmg: dmg * 0.6, pierce: levelA >= 3, ignorePierceLimit, bleed: levelA >= 4, bleedDmg, hitIds: [],
            critChance, critMult, poisonOnHit, poisonSpread, poisonWeaken, poisonDuration, poisonDmg,
            bouncesLeft: bounceCount, smartBounce: bowW.subPath === 'D' && subD >= 7,
            explosiveBounce: bowW.subPath === 'D' && subD >= 8, magneticBounce: bowW.subPath === 'D' && subD >= 9
          });
        }
      }
      if (levelB >= 4) {
        const explosive = bowW.subPath === 'C' && subC >= 8; // Meteor Rain
        arrowRainMarkers.push({ x: target.x, y: target.y, created: now, fuse: 500, dmg: dmg * 1.5, explosive });
        if (bowW.subPath === 'C' && subC >= 9) { // Endless Rain
          setTimeout(() => {
            if (game.paused || gameOver) return;
            arrowRainMarkers.push({ x: target.x, y: target.y, created: Date.now(), fuse: 300, dmg: dmg * 1.5, explosive });
          }, 400);
        }
      }
    }

    // ---------------- SUMMONED SERVANT ----------------
    function placeServant(x, y) {
      const now = Date.now();
      if (!servantReady || now - lastServant < upgrades.servantCooldown) return;
      lastServant = now;
      servantReady = false;
      setTimeout(() => { servantReady = true; }, upgrades.servantCooldown);

      const levelA = pathLevel('servant', 'A');
      const levelB = pathLevel('servant', 'B');
      const subC = subPathLevel('servant', 'C');
      const subD = subPathLevel('servant', 'D');
      const svW = progress.weapons.servant;

      const maxHp = levelA >= 3 ? 3 : 1;
      let count = 1 + (levelB >= 3 ? 1 : 0) + (levelB >= 5 ? 1 : 0);
      if (svW.subPath === 'C' && subC >= 6) count += 1; // Larger Squad
      if (svW.subPath === 'C' && subC >= 10) count += wSubRepeats('servant'); // Endless Army (repeatable)

      let dmg = upgrades.servantDamage + (levelA >= 4 ? 1 : 0) + (levelA >= 5 ? 1 : 0);
      if (svW.subPath === 'C' && subC >= 6) dmg *= 1.4; // Champion's Blade
      if (svW.subPath === 'C' && subC >= 10) dmg *= (1 + 0.1 * wSubRepeats('servant')); // Legendary Warrior (repeatable)

      let lifetime = levelB >= 2 ? 22000 : 15000;
      if (svW.subPath === 'D' && subD >= 7) lifetime *= 2; // Restless Dead (also affects raised spirits by inheritance)

      // War Cry: this fresh summon grants nearby existing spirits a brief damage buff.
      if (svW.subPath === 'C' && subC >= 8) {
        for (const s of samuraiServants) {
          if (Math.hypot(s.x - x, s.y - y) < 150) {
            s.warCryUntil = now + 3000;
          }
        }
      }

      for (let i = 0; i < count; i++) {
        const ox = x + i * 30 - (count - 1) * 15;
        samuraiServants.push({
          id: nextEnemyId++, x: ox, y, originX: ox, originY: y, hp: maxHp, maxHp,
          range: levelA >= 1 ? 135 : 90,
          dmg,
          baseDmg: dmg,
          lastAttack: 0,
          attackCooldown: levelA >= 3 ? 500 : 800,
          baseAttackCooldown: levelA >= 3 ? 500 : 800,
          kills: 0,
          maxKills: 1 + (levelA >= 2 ? 1 : 0),
          lifetime,
          created: now,
          targetId: null,
          bloodlustUntil: 0,
          warCryUntil: 0,
          isRaised: false
        });
      }
    }

    function updateSamuraiWeapons() {
      const now = Date.now();

      // Katana slash FX fade-out
      katanaSlashFX = katanaSlashFX.filter(fx => now - fx.created < fx.life);
      earthquakeZones = earthquakeZones.filter(z => now - z.created < z.life);

      // Cracked Earth zones (Naginata Whirlwind D): periodic damage, optional root.
      crackedEarthZones = crackedEarthZones.filter(z => now - z.created < z.life);
      for (const z of crackedEarthZones) {
        if (now - z.lastTick < z.tickRate) continue;
        z.lastTick = now;
        for (const e of enemies) {
          if (e.dead || e.phased) continue;
          if (Math.hypot(e.x - z.x, e.y - z.y) < z.radius) {
            dealWeaponDamage(e, z.dmg, 'naginata');
            if (z.root && !e.dead) e.rootedUntil = now + 600;
          }
        }
      }

      // Toxic Mist pools (Smoke Bomb Explosives level 5): damage over time based on remaining HP.
      toxicMistPools = toxicMistPools.filter(p => now - p.created < p.life);
      for (const p of toxicMistPools) {
        if (now - p.lastTick < 500) continue;
        p.lastTick = now;
        for (const e of enemies) {
          if (e.dead || e.phased) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) < p.radius) {
            const tickDmg = Math.max(1, Math.ceil(e.hp * 0.08));
            e.hp -= tickDmg;
            e.lastHit = now;
            if (e.hp <= 0) markEnemyDead(e, 'smoke');
          }
        }
      }

      // Shockwaves (Katana path B)
      const katanaW = progress.weapons.katana;
      const subC_sw = subPathLevel('katana', 'C');
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.x += sw.vx; sw.y += sw.vy;
        sw.dist += Math.hypot(sw.vx, sw.vy);
        if (sw.dist > sw.maxDist) { shockwaves.splice(i, 1); continue; }
        for (const e of enemies) {
          if (e.dead || e.phased || sw.hitIds.includes(e.id)) continue;
          if (Math.hypot(e.x - sw.x, e.y - sw.y) < 24) {
            sw.hitIds.push(e.id);
            dealWeaponDamage(e, sw.dmg, 'katana');
            if (!e.dead) {
              // God Power: shockwaves knock back everything they pass through.
              if (katanaW.subPath === 'C' && subC_sw >= 6) {
                const kv = norm(e.x - sw.x, e.y - sw.y);
                e.x += kv.nx * 25; e.y += kv.ny * 25;
              }
              // Stunning Lightning (implies Thor's Hammer is active at this point).
              if (katanaW.subPath === 'C' && subC_sw >= 9) {
                e.stunnedUntil = Math.max(e.stunnedUntil || 0, now + 700);
              }
              // Bouncing Force: chain to +1 nearby enemy per repeat purchase.
              if (katanaW.subPath === 'C' && subC_sw >= 10 && !sw.bounced) {
                const bounces = wSubRepeats('katana');
                let nearest = null, nearestDist = 90;
                for (const other of enemies) {
                  if (other === e || other.dead || other.phased || sw.hitIds.includes(other.id)) continue;
                  const d = Math.hypot(other.x - e.x, other.y - e.y);
                  if (d < nearestDist) { nearestDist = d; nearest = other; }
                }
                if (nearest && (sw.bounceCount || 0) < bounces) {
                  sw.bounceCount = (sw.bounceCount || 0) + 1;
                  const bv = norm(nearest.x - sw.x, nearest.y - sw.y);
                  sw.vx = bv.nx * 4; sw.vy = bv.ny * 4;
                  sw.dist = 0;
                  sw.bounced = true;
                }
              }
              sw.bounced = false;
            }
          }
        }
      }

      // Naginata spears
      for (let i = naginataSpears.length - 1; i >= 0; i--) {
        const sp = naginataSpears[i];
        sp.x += sp.vx; sp.y += sp.vy;
        const traveled = Math.hypot(sp.x - sp.startX, sp.y - sp.startY);
        if (traveled > sp.range || sp.x < -30 || sp.x > 830 || sp.y < -30 || sp.y > 630) { naginataSpears.splice(i, 1); continue; }

        for (const e of enemies) {
          if (e.dead || e.phased || sp.hitIds.includes(e.id)) continue;
          if (Math.hypot(e.x - sp.x, e.y - sp.y) < 26) {
            sp.hitIds.push(e.id);
            applyNaginataHit(e, sp.dmg);
            if (sp.spinning) {
              for (let k = 0; k < 6; k++) {
                const ang = Math.random() * Math.PI * 2;
                particles.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 2, vy: Math.sin(ang) * 2, size: 3, color: '#c0c0c0', start: now, life: 300 });
              }
            }
            if (!sp.pierce) { naginataSpears.splice(i, 1); break; }
            if (sp.hitIds.length >= 3) {
              lastNaginata -= upgrades.naginataCooldown * 0.4;
            }
          }
        }
      }

      // Bow arrows
      for (let i = bowArrows.length - 1; i >= 0; i--) {
        const ar = bowArrows[i];
        ar.x += ar.vx; ar.y += ar.vy;

        // Ricochet Arrow: bounce off the walls instead of despawning, up to bouncesLeft times.
        if (ar.x < 0 || ar.x > 800) {
          if (ar.bouncesLeft > 0) { ar.vx *= -1; ar.bouncesLeft--; ar.x = Math.max(0, Math.min(800, ar.x)); }
          else { bowArrows.splice(i, 1); continue; }
        }
        if (ar.y < 0 || ar.y > 600) {
          if (ar.bouncesLeft > 0) { ar.vy *= -1; ar.bouncesLeft--; ar.y = Math.max(0, Math.min(600, ar.y)); }
          else { bowArrows.splice(i, 1); continue; }
        }
        // Smart Bounce: after bouncing at least once, steer toward the nearest enemy.
        if (ar.smartBounce && ar.bouncesLeft !== undefined && ar.bouncesLeft < (ar.origBounces ?? (ar.origBounces = ar.bouncesLeft))) {
          const nb = findNearest(ar.x, ar.y, []);
          if (nb) {
            const nv = norm(nb.x - ar.x, nb.y - ar.y);
            const spd = Math.hypot(ar.vx, ar.vy);
            ar.vx = ar.vx * 0.85 + nv.nx * spd * 0.15;
            ar.vy = ar.vy * 0.85 + nv.ny * spd * 0.15;
          }
        }

        let removed = false;
        for (const e of enemies) {
          if (e.dead || e.phased || ar.hitIds.includes(e.id)) continue;
          if (Math.hypot(e.x - ar.x, e.y - ar.y) < 24) {
            ar.hitIds.push(e.id);
            const isCrit = ar.critChance > 0 && Math.random() < ar.critChance;
            const finalDmg = isCrit ? ar.dmg * ar.critMult : ar.dmg;
            const wasDead = e.dead;
            dealWeaponDamage(e, finalDmg, 'bow');

            if (ar.bleed && !e.dead) {
              e.bleedUntil = Math.max(e.bleedUntil || 0, now + 3000);
              e.bleedNextTick = Math.min(e.bleedNextTick || Infinity, now + 500);
              e.bleedDmg = Math.max(e.bleedDmg || 0, ar.bleedDmg);
              // Toxic Arrows: bleeding enemies are also poisoned.
              if (ar.poisonOnHit) {
                e.poisonUntil = Math.max(e.poisonUntil || 0, now + ar.poisonDuration);
                e.poisonNextTick = Math.min(e.poisonNextTick || Infinity, now + 500);
                e.poisonDmg = Math.max(e.poisonDmg || 0, ar.poisonDmg);
                if (ar.poisonWeaken) e.corroded = true; // Corrosive Venom: +15% damage taken, checked in dealWeaponDamage callers indirectly via this flag
                // Venom Spread: poison also spreads to nearby enemies immediately.
                if (ar.poisonSpread) {
                  for (const other of enemies) {
                    if (other === e || other.dead || other.phased) continue;
                    if (Math.hypot(other.x - e.x, other.y - e.y) < 50) {
                      other.poisonUntil = Math.max(other.poisonUntil || 0, now + ar.poisonDuration);
                      other.poisonNextTick = Math.min(other.poisonNextTick || Infinity, now + 500);
                      other.poisonDmg = Math.max(other.poisonDmg || 0, ar.poisonDmg);
                      if (ar.poisonWeaken) other.corroded = true;
                    }
                  }
                }
              }
            }

            // Explosive Bounce: once bounces are exhausted, the arrow explodes on its final hit.
            if (ar.explosiveBounce && ar.bouncesLeft === 0) {
              for (const other of enemies) {
                if (other === e || other.dead || other.phased) continue;
                const d = Math.hypot(other.x - e.x, other.y - e.y);
                if (d < 55) {
                  dealWeaponDamage(other, Math.ceil(ar.dmg * 0.6), 'bow');
                  if (ar.magneticBounce) {
                    const pv = norm(e.x - other.x, e.y - other.y);
                    other.x += pv.nx * 15; other.y += pv.ny * 15;
                  }
                }
              }
            }

            if (!ar.pierce && !(isCrit && ar.ignorePierceLimit)) { bowArrows.splice(i, 1); removed = true; break; }
          }
        }
        if (removed) continue;
        if (ar.x < -30 || ar.x > 830 || ar.y < -30 || ar.y > 630) { bowArrows.splice(i, 1); continue; }
      }

      // Arrow rain markers (Bow path B)
      for (let i = arrowRainMarkers.length - 1; i >= 0; i--) {
        const m = arrowRainMarkers[i];
        if (now - m.created > m.fuse) {
          arrowRainMarkers.splice(i, 1);
          const radius = m.explosive ? 70 : 45; // Meteor Rain: bigger blast
          for (const e of enemies) {
            if (e.dead || e.phased) continue;
            if (Math.hypot(e.x - m.x, e.y - m.y) < radius) dealWeaponDamage(e, m.dmg, 'bow');
          }
          for (let k = 0; k < 14; k++) {
            const ang = Math.random() * Math.PI * 2;
            particles.push({ x: m.x + Math.cos(ang) * 20, y: m.y + Math.sin(ang) * 20, vx: 0, vy: 2, size: 3, color: '#8b7355', start: now, life: 400 });
          }
        }
      }

      // Summoned servants
      const svSubC = subPathLevel('servant', 'C');
      const svSubD = subPathLevel('servant', 'D');
      const svW = progress.weapons.servant;
      for (let i = samuraiServants.length - 1; i >= 0; i--) {
        const s = samuraiServants[i];
        const expired = now - s.created > s.lifetime;
        if (expired || s.hp <= 0) {
          // Last Stand: one massive final attack when the spirit dies or expires.
          if (svW.subPath === 'D' && svSubD >= 8) {
            for (const e of enemies) {
              if (e.dead || e.phased) continue;
              if (Math.hypot(e.x - s.x, e.y - s.y) < 90) dealWeaponDamage(e, s.baseDmg * 3, 'servant');
            }
          }
          // Cursed Legion: raised spirits explode when they expire.
          if (s.isRaised && svW.subPath === 'D' && svSubD >= 8) {
            for (const e of enemies) {
              if (e.dead || e.phased) continue;
              const d = Math.hypot(e.x - s.x, e.y - s.y);
              if (d < 70) {
                dealWeaponDamage(e, s.baseDmg * 2, 'servant');
                if (svSubD >= 9 && !e.dead) e.tarSlowed = true; // Soul Chain: brief slow
              }
            }
          }
          samuraiServants.splice(i, 1);
          continue;
        }

        // Gently draw nearby enemies toward the servant's post
        for (const e of enemies) {
          if (e.dead || e.phased) continue;
          const d = Math.hypot(e.x - s.originX, e.y - s.originY);
          if (d < s.range * 1.3 && d > 20) {
            const pv = norm(s.originX - e.x, s.originY - e.y);
            e.x += pv.nx * 0.3; e.y += pv.ny * 0.3;
          }
        }

        // Recompute this frame's effective damage/speed from all temporary buffs.
        let effDmg = s.baseDmg;
        let effAttackCooldown = s.baseAttackCooldown;
        let effMoveSpeed = 2.2;
        // Rage: faster attacks the lower this spirit's HP is.
        if (svW.subPath === 'D' && svSubD >= 6) {
          const missing = 1 - s.hp / s.maxHp;
          effAttackCooldown *= (1 - missing * 0.5);
        }
        // Bloodlust / Frenzy: temporary buff after a recent kill.
        if (s.bloodlustUntil && now < s.bloodlustUntil) {
          effDmg *= 1.3;
          if (svW.subPath === 'D' && svSubD >= 8) effMoveSpeed *= 1.3; // Frenzy
        }
        // War Cry: temporary buff from a freshly summoned ally.
        if (s.warCryUntil && now < s.warCryUntil) effDmg *= 1.15;
        // Heroic Presence: passive buff while 2+ spirits are active.
        if (svW.subPath === 'C' && svSubC >= 9 && samuraiServants.length >= 2) effDmg *= 1.15;
        // Shield Wall: spirits near each other take less damage (handled as a flag other systems can check).
        s.shielded = svW.subPath === 'C' && svSubC >= 9 && samuraiServants.some(o => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 100);

        // Acquire or validate a target within its leashed territory
        let target = s.targetId ? enemies.find(e => e.id === s.targetId && !e.dead && !e.phased) : null;
        if (target && Math.hypot(target.x - s.originX, target.y - s.originY) > s.range) target = null;
        if (!target) {
          // Focus Fire: all spirits converge on the single toughest enemy in range.
          if (svW.subPath === 'C' && svSubC >= 7) {
            let best = null, bestHp = -1;
            for (const e of enemies) {
              if (e.dead || e.phased) continue;
              if (Math.hypot(e.x - s.originX, e.y - s.originY) > s.range) continue;
              if (e.hp > bestHp) { bestHp = e.hp; best = e; }
            }
            target = best;
          } else {
            let minDist = s.range;
            for (const e of enemies) {
              if (e.dead || e.phased) continue;
              const d = Math.hypot(e.x - s.originX, e.y - s.originY);
              if (d < minDist) { minDist = d; target = e; }
            }
          }
          s.targetId = target ? target.id : null;
        }

        if (target) {
          const distToTarget = Math.hypot(target.x - s.x, target.y - s.y);
          if (distToTarget > 22) {
            const mv = norm(target.x - s.x, target.y - s.y);
            s.x += mv.nx * effMoveSpeed;
            s.y += mv.ny * effMoveSpeed;
          } else {
            // The enemy gets a chance to strike back while in melee range.
            if (!s.lastCounterHit || now - s.lastCounterHit > 700) {
              if (Math.random() < 0.35) {
                let counterDmg = 1;
                if (svW.subPath === 'C' && svSubC >= 7) counterDmg *= 0.7; // Iron Armour: -30% damage taken
                if (s.shielded) counterDmg *= 0.8; // Shield Wall: -20% while near another spirit
                s.hp -= counterDmg;
                s.lastCounterHit = now;
                if (s.hp <= 0) { samuraiServants.splice(i, 1); continue; }
              }
            }
            if (now - s.lastAttack > effAttackCooldown) {
            s.lastAttack = now;
            const wasDead = target.dead;
            const landed = dealWeaponDamage(target, effDmg, 'servant');
            if (landed && !wasDead && target.dead) {
              s.kills++;
              s.targetId = null;
              if (pathLevel('servant', 'A') >= 3) {
                const healAmt = (svW.subPath === 'C' && svSubC >= 8) ? 2 : 1; // Battle Hardened
                s.hp = Math.min(s.maxHp, s.hp + healAmt);
              }
              // Bloodlust: kills grant a brief damage (and Frenzy: speed) buff.
              if (svW.subPath === 'D' && svSubD >= 7) {
                let bloodlustDur = 4000;
                if (svSubD >= 10) bloodlustDur += 500 * wSubRepeats('servant'); // Endless Rage (repeatable)
                s.bloodlustUntil = now + bloodlustDur;
              }
              // Raise Fallen: the enemy that just died has a chance to rise as a temp spirit.
              if (svW.subPath === 'D' && svSubD >= 6) {
                let raiseChance = 0.15;
                if (svSubD >= 10) raiseChance += 0.05 * wSubRepeats('servant'); // Greater Resurrection (repeatable)
                if (Math.random() < raiseChance) {
                  samuraiServants.push({
                    id: nextEnemyId++, x: target.x, y: target.y, originX: target.x, originY: target.y,
                    hp: 1, maxHp: 1, range: 100, dmg: Math.max(1, Math.ceil(s.baseDmg * 0.6)), baseDmg: Math.max(1, Math.ceil(s.baseDmg * 0.6)),
                    lastAttack: 0, attackCooldown: 700, baseAttackCooldown: 700, kills: 0, maxKills: 1,
                    lifetime: (svSubD >= 7 ? 16000 : 8000), created: now, targetId: null,
                    bloodlustUntil: 0, warCryUntil: 0, isRaised: true
                  });
                }
              }
              if (s.kills > s.maxKills) { samuraiServants.splice(i, 1); continue; }
            }
            for (let k = 0; k < 4; k++) {
              particles.push({ x: target.x, y: target.y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, size: 3, color: '#9b59b6', start: now, life: 250 });
            }
            }
          }
        } else {
          // Nothing to fight — drift back to its post
          const distHome = Math.hypot(s.originX - s.x, s.originY - s.y);
          if (distHome > 4) {
            const mv = norm(s.originX - s.x, s.originY - s.y);
            s.x += mv.nx * 1.2; s.y += mv.ny * 1.2;
          }
        }
      }
    }

    function totalDartsThrown() {
      let total = upgrades.dartAmount;
      const levelB = pathLevel('dart', 'B');
      if (levelB >= 1) total += 1;
      total += wRepeats('dart');
      return total;
    }

    function shootDart() {
      const now = Date.now();
      const subCd = subPathLevel('dart', 'C');
      let cooldown = upgrades.dartCooldown;
      const dartW = progress.weapons.dart;
      if (dartW.subPath === 'C' && subCd >= 6) cooldown *= 1.5; // Sharpshooter trade-off
      if (now - lastDart < cooldown) return;
      lastDart = now;

      const levelA = pathLevel('dart', 'A');
      const levelB = pathLevel('dart', 'B');
      const subC = subPathLevel('dart', 'C');
      const subD = subPathLevel('dart', 'D');

      let totalDarts = upgrades.dartAmount;
      if (levelB >= 1) totalDarts += 1;
      if (dartW.subPath === 'D' && subD >= 6) totalDarts += 2; // Rapid Fire
      if (dartW.subPath === 'D' && subD >= 10) totalDarts += wSubRepeats('dart'); // Projectile Count (repeatable)

      let angles = [];
      if (levelA >= 1) {
        const targets = enemies.filter(e => !e.dead)
          .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))
          .slice(0, totalDarts);
        for (const t of targets) angles.push(Math.atan2(t.y - player.y, t.x - player.x));
        while (angles.length < totalDarts) angles.push(Math.random() * Math.PI * 2);
      } else {
        const directions = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0.707,y:-0.707},{x:0.707,y:0.707},{x:-0.707,y:0.707},{x:-0.707,y:-0.707}];
        const shuffled = directions.sort(() => Math.random() - 0.5);
        for (let i = 0; i < totalDarts; i++) {
          const dir = shuffled[i % shuffled.length];
          angles.push(Math.atan2(dir.y, dir.x));
        }
      }

      let range = upgrades.dartRange;
      if (dartW.subPath === 'D' && subD >= 7) range *= 1.1; // Long Shot
      if (dartW.subPath === 'C' && subC >= 6) range *= 1.5; // Sharpshooter
      if (dartW.subPath === 'C' && subC >= 10) range *= (1 + 0.05 * wSubRepeats('dart')); // Range (repeatable)
      const pierce = levelB >= 5;
      const perfectAim = dartW.subPath === 'C' && subC >= 8;

      const spawnDart = (angle) => {
        if (darts.length >= MAX_DARTS) return;
        darts.push({
          x: player.x, y: player.y,
          vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2,
          startX: player.x, startY: player.y,
          maxRange: range,
          large: levelA >= 2 || perfectAim,
          boomerang: levelB >= 4,
          pierce,
          eagleEye: dartW.subPath === 'C' && subC >= 7,
          headshotChance: dartW.subPath === 'C' && subC >= 9 ? 0.05 : 0,
          returning: false,
          broken: false,
          hitIds: []
        });
      };

      for (let i = 0; i < angles.length; i++) {
        spawnDart(angles[i]);
        // Twin Shot: every dart fires as a paired dart at a slight offset.
        if (dartW.subPath === 'D' && subD >= 8) spawnDart(angles[i] + 0.12);
      }

      // Volley: a chance to fire a whole bonus burst of darts toward the nearest enemy.
      if (dartW.subPath === 'D' && subD >= 7 && Math.random() < 0.25) {
        const nb = findNearest(player.x, player.y, []);
        const baseAng = nb ? Math.atan2(nb.y - player.y, nb.x - player.x) : Math.random() * Math.PI * 2;
        for (let i = 0; i < 4; i++) spawnDart(baseAng + (i - 1.5) * 0.15);
      }

      // Bullet Rain: occasionally sprays a short continuous stream toward the nearest enemy.
      if (dartW.subPath === 'D' && subD >= 9 && Math.random() < 0.12) {
        const nb = findNearest(player.x, player.y, []);
        if (nb) {
          const baseAng = Math.atan2(nb.y - player.y, nb.x - player.x);
          for (let i = 0; i < 6; i++) {
            setTimeout(() => {
              if (game.paused || gameOver) return;
              spawnDart(baseAng + (Math.random() - 0.5) * 0.2);
            }, i * 90);
          }
        }
      }
    }

    function findNearest(x, y, excludeIds) {
      let nearest = null, minDist = Infinity;
      for (const e of enemies) {
        if (e.dead || e.phased) continue;
        if (excludeIds && excludeIds.includes(e.id)) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < minDist) { minDist = d; nearest = e; }
      }
      return nearest;
    }

    const deadQueue = [];
    function markEnemyDead(e, source) {
      if (e.dead) return;
      e.dead = true;
      deadQueue.push(e.id);
      createDefeatParticles(e.x, e.y, e.type);
      window.AchievementManager?.notify?.('enemy_defeated',{x:e.x,y:e.y});

      // Death Fog (Smoke Bomb Explosives C): poisoned enemies explode on death.
      if (e.smokeDeathFog) {
        const fogRadius = 30;
        for (const other of enemies) {
          if (other === e || other.dead || other.phased) continue;
          if (Math.hypot(other.x - e.x, other.y - e.y) < fogRadius) {
            dealWeaponDamage(other, upgrades.smokeDamage, 'smoke');
          }
        }
      }

      if (e.rewardless) return; // boss clones etc. give no exp/coins/kill credit

      player.exp += 10;
      player.kills += runPowerupEffects.killValueMult;
      progress.runCoins += (activeEvent.coinMult + runPowerupEffects.coinBonusPerKill) * curseEffects.coinMult;

      if (curseEffects.bloodPact && player.hp > 1) {
        player.hp -= 1;
        updateUI();
      }

      if (player.character === 'samurai') honor = Math.min(10, honor + 1);

      // Enemies killed while standing in a stunning-mist smoke cloud always
      // count as a smoke bomb kill, regardless of what actually finished them off.
      if (e.inSmokeCloud) source = 'smoke';
      source=runtimeWeaponKey(source);

      if (source && progress.weapons[source]) {
        const w = progress.weapons[source];
        w.kills += runPowerupEffects.killValueMult;
        if (!w.unlocked && w.kills >= WEAPON_UNLOCK_KILLS) {
          w.unlocked = true;
        }
        saveProgress();
      }

      // Void variant on-death abilities
      if (e.isVoid && !e.isBoss) {
        if (e.type === 'slime') {
          const miniHp = Math.max(1, Math.floor(e.maxHp / 2));
          for (let i = 0; i < 2; i++) {
            const ox = e.x + (Math.random() - 0.5) * 30;
            const oy = e.y + (Math.random() - 0.5) * 30;
            enemies.push({ id: nextEnemyId++, type: 'slime', x: ox, y: oy, speed: e.speed, hp: miniHp, maxHp: miniHp, anim: Math.random() * 100, metal: false, isVoid: false });
          }
        } else if (e.type === 'troll') {
          const slimeHp = Math.floor(player.level / 3) + 1;
          const batSpeed = 0.8 * (Math.pow(0.75, progress.runNumber - 1) * activeEvent.speedMult);
          enemies.push({ id: nextEnemyId++, type: 'archer', x: e.x, y: e.y, speed: batSpeed, hp: slimeHp, maxHp: slimeHp, anim: Math.random() * 100, lastShot: Infinity, metal: false, isVoid: false, meleeCharger: true });
        }
      }

      // Boss on-death ability + rewards
      if (e.isBoss) {
        if (e.type === 'slime') {
          const count = Math.max(1, e.bossLevel || 10);
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const ox = e.x + Math.cos(angle) * 30;
            const oy = e.y + Math.sin(angle) * 30;
            const hp = Math.floor(player.level / 3) + 1;
            enemies.push({ id: nextEnemyId++, type: 'slime', x: ox, y: oy, speed: 0.5, hp, maxHp: hp, anim: Math.random() * 100, metal: false, isVoid: false });
          }
        }
        if (activeBossId === e.id) activeBossId = null;
        healingOrbs = healingOrbs.filter(o => o.ownerId !== e.id);

        const wave = e.bossLevel || player.level;
        progress.runCoins += 5 * wave;
        for (const key of (CHARACTER_WEAPON_KEYS[player.character]||NINJA_WEAPON_KEYS)) {
          const w = progress.weapons[key];
          w.kills += wave;
          if (!w.unlocked && w.kills >= WEAPON_UNLOCK_KILLS) w.unlocked = true;
        }
        saveProgress();

        game.paused = true;
        quiz.forPowerup = false;
        setTimeout(() => { showUpgrades(1, false); }, 500);
      }
    }
    function sweepDeadEnemies() {
      if (deadQueue.length === 0) return;
      const deadSet = new Set(deadQueue);
      deadQueue.length = 0;

      enemies = enemies.filter(e => !deadSet.has(e.id));

      for (const b of bullets) {
        b.hitIds = b.hitIds.filter(id => !deadSet.has(id));
      }

      updateUI();
      checkLevelUp();
      maintainEnemies();
    }

    function update() {
      if (!game.active || game.paused) return;

      try {
        game.time += 16;
        game.frame++;

        if(shurikenSecret('secret_map_border')){const mx=(secretMoveKeys.ArrowRight||secretMoveKeys.KeyD?1:0)-(secretMoveKeys.ArrowLeft||secretMoveKeys.KeyA?1:0),my=(secretMoveKeys.ArrowDown||secretMoveKeys.KeyS?1:0)-(secretMoveKeys.ArrowUp||secretMoveKeys.KeyW?1:0),v=norm(mx,my),sx=v.nx*3.2,sy=v.ny*3.2;if(v.d){secretWorldX-=sx;secretWorldY-=sy;const groups=[enemies,bullets,darts,shadowTraps,poisonPools,smokeClouds,healingOrbs,trollFireballs,ectoplasmMarkers,naginataSpears,bowArrows,enemyArrows,particles];for(const group of groups)for(const item of group){if(Number.isFinite(item.x))item.x-=sx;if(Number.isFinite(item.y))item.y-=sy;}player.x=400;player.y=300;targetX-=sx;targetY-=sy;}}

        maintainEnemies();
        if(player.character==='paradox'&&game.frame%120===0){for(const e of enemies){if(!e.dead&&Math.hypot(e.x-player.x,e.y-player.y)<145)dealWeaponDamage(e,Math.max(2,upgrades.damage*1.2),'shuriken');}for(let i=0;i<18;i++){const a=i*Math.PI/9;particles.push({x:player.x,y:player.y,vx:Math.cos(a)*3,vy:Math.sin(a)*3,size:4,color:i%2?'#54f5ff':'#ff4fc8',start:Date.now(),life:500});}}
        if (player.character === 'samurai') {
          const wv = norm(samuraiWalkTargetX - player.x, samuraiWalkTargetY - player.y);
          if (wv.d > 4) {
            player.x += wv.nx * SAMURAI_WALK_SPEED;
            player.y += wv.ny * SAMURAI_WALK_SPEED;
            player.facingAngle = Math.atan2(wv.ny, wv.nx);
            player.x = Math.max(30, Math.min(770, player.x));
            player.y = Math.max(30, Math.min(570, player.y));
          }
          katanaSlash();
          if (upgrades.naginataUnlocked) naginataThrow();
          if (upgrades.bowUnlocked) bowShoot();
        } else {
          shoot();
          if (upgrades.smokeUnlocked) throwSmoke();
          if (upgrades.dartUnlocked) shootDart();
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];

          if (b.homing && b.homingTargetId != null) {
            const target = enemies.find(en => en.id === b.homingTargetId && !en.dead);
            if (target) {
              const speed = Math.hypot(b.vx, b.vy);
              const rv = norm(target.x - b.x, target.y - b.y);
              const turn = 0.08;
              b.vx = b.vx * (1 - turn) + rv.nx * speed * turn;
              b.vy = b.vy * (1 - turn) + rv.ny * speed * turn;
            } else {
              // Locked target defeated/gone — stop homing, keep flying straight.
              b.homing = false;
              b.homingTargetId = null;
            }
          }

          // Seeking Spirits: after a ricochet, keep gently homing toward the new target.
          if (b.homingRicochet && b.hasBounced) {
            const rt = findNearest(b.x, b.y, b.hitIds);
            if (rt) {
              const speed = Math.hypot(b.vx, b.vy);
              const rv = norm(rt.x - b.x, rt.y - b.y);
              const turn = 0.1;
              b.vx = b.vx * (1 - turn) + rv.nx * speed * turn;
              b.vy = b.vy * (1 - turn) + rv.ny * speed * turn;
            }
          }

          if (b.spiralRevolutions > 0) {
            if (b.coreX === undefined) { b.coreX = b.x; b.coreY = b.y; b.spiralPhase = 0; }
            b.coreX += b.vx; b.coreY += b.vy;
            b.spiralPhase += 0.25 * b.spiralRevolutions;
            const spd = Math.hypot(b.vx, b.vy) || 1;
            const perpX = -b.vy / spd, perpY = b.vx / spd;
            const amplitude = 14;
            b.x = b.coreX + perpX * Math.sin(b.spiralPhase) * amplitude;
            b.y = b.coreY + perpY * Math.sin(b.spiralPhase) * amplitude;
          } else {
            b.x += b.vx; b.y += b.vy;
          }
          b.rot += 0.35;

          if (b.x < -50 || b.x > 850 || b.y < -50 || b.y > 650) bullets.splice(i, 1);
        }

        // Poison pools left behind by poisoned enemies (Sniper Darts path)
        for (let i = poisonPools.length - 1; i >= 0; i--) {
          const p = poisonPools[i];
          const nowP = Date.now();
          if (nowP - p.created > p.life) { poisonPools.splice(i, 1); continue; }
          for (const e of enemies) {
            if (e.dead || e.phased) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) < 20) {
              e.poisonUntil = Math.max(e.poisonUntil || 0, nowP + 1000);
              e.poisonDmg = Math.max(e.poisonDmg || 0, p.dmg);
            }
          }
        }
        // Expire lingering smoke clouds (Stunning Mist path)
        {
          const nowC = Date.now();
          smokeClouds = smokeClouds.filter(c => c.expiresAt > nowC);
        }

        if (player.character === 'samurai') updateSamuraiWeapons();

        // Ectoplasm markers (Ghost boss) — after the fuse runs out, spawn a ghost slime
        {
          const nowE = Date.now();
          for (let i = ectoplasmMarkers.length - 1; i >= 0; i--) {
            const m = ectoplasmMarkers[i];
            if (nowE - m.created > m.fuse) {
              ectoplasmMarkers.splice(i, 1);
              const ghostBaseHp = Math.floor(player.level / 3) + 1;
              const slimeHp = Math.max(1, Math.floor(ghostBaseHp / 8));
              enemies.push({ id: nextEnemyId++, type: 'slime', x: m.x, y: m.y, speed: 0.5, hp: slimeHp, maxHp: slimeHp, anim: Math.random() * 100, metal: false, isVoid: false, isGhostSlime: true });
            }
          }
          voidLasers = voidLasers.filter(l => nowE - l.created < l.life);
        }

        // Troll boss fireballs — must be shot down or they hit the player
        for (let i = trollFireballs.length - 1; i >= 0; i--) {
          const fb = trollFireballs[i];
          fb.x += fb.vx; fb.y += fb.vy;
          if (fb.x < -30 || fb.x > 830 || fb.y < -30 || fb.y > 630) { trollFireballs.splice(i, 1); continue; }

          const distP = Math.hypot(fb.x - player.x, fb.y - player.y);
          if (distP < 22) {
            player.hp -= 15 * activeEvent.damageMult;
            honor = 0;
            trollFireballs.splice(i, 1);
            if (player.hp <= 0) {
              lastDeathInfo = { type: fb.sourceType||'troll', damage: 15 * activeEvent.damageMult, metal: false, size: null, method: 'projectile' };
              updateUI(); gameOver();
            }
            continue;
          }

          let destroyed = false;
          for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            if (Math.hypot(b.x - fb.x, b.y - fb.y) < 16) { fb.hp -= (b.dmg || upgrades.damage); bullets.splice(bi, 1); destroyed = fb.hp <= 0; break; }
          }
          if (!destroyed) {
            for (let di = darts.length - 1; di >= 0; di--) {
              const d = darts[di];
              if (Math.hypot(d.x - fb.x, d.y - fb.y) < 16) { fb.hp -= upgrades.damage; darts.splice(di, 1); destroyed = fb.hp <= 0; break; }
            }
          }
          if(!destroyed){for(const group of [bowArrows,naginataSpears]){for(let pi=group.length-1;pi>=0;pi--){const p=group[pi];if(Math.hypot(p.x-fb.x,p.y-fb.y)<16){fb.hp-=p.dmg||upgrades.damage;group.splice(pi,1);destroyed=fb.hp<=0;break;}}if(destroyed)break;}}
          if (destroyed) {
            trollFireballs.splice(i, 1);
            const nowFx = Date.now();
            for (let k = 0; k < 10; k++) {
              const angle = Math.random() * Math.PI * 2;
              particles.push({ x: fb.x, y: fb.y, vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2, size: 5, color: '#ff6600', start: nowFx, life: 400 });
            }
          }
        }

        // Troll boss healing orbs — must be destroyed to stop the boosted regen
        for (let i = healingOrbs.length - 1; i >= 0; i--) {
          const orb = healingOrbs[i];
          if (orb.dead) { healingOrbs.splice(i, 1); continue; }

          let destroyed = false;
          for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            if (Math.hypot(b.x - orb.x, b.y - orb.y) < 14) { orb.hp -= (b.dmg || upgrades.damage); bullets.splice(bi, 1); destroyed = orb.hp <= 0; break; }
          }
          if (!destroyed) {
            for (let di = darts.length - 1; di >= 0; di--) {
              const d = darts[di];
              if (Math.hypot(d.x - orb.x, d.y - orb.y) < 14) { orb.hp -= upgrades.damage; darts.splice(di, 1); destroyed = orb.hp <= 0; break; }
            }
          }
          if (destroyed) {
            orb.dead = true;
            healingOrbs.splice(i, 1);
            const nowOx = Date.now();
            for (let k = 0; k < 10; k++) {
              const angle = Math.random() * Math.PI * 2;
              particles.push({ x: orb.x, y: orb.y, vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2, size: 5, color: '#2ecc71', start: nowOx, life: 400 });
            }
          }
        }

        // Storm of Steel magazine regen (passive recharge while in manual-fire mode)
        if (pathLevel('shuriken', 'B') >= 3) {
          const now = Date.now();
          if (shurikenMag.current < shurikenMag.capacity && now - shurikenMag.lastRegen >= BASE_SHURIKEN_COOLDOWN) {
            shurikenMag.current = Math.min(shurikenMag.capacity, shurikenMag.current + 1);
            shurikenMag.lastRegen = now;
          }
        }

        for (let i = shadowTraps.length - 1; i >= 0; i--) {
          const trap = shadowTraps[i];
          const now = Date.now();
          
          if (now - trap.placed >= (trap.lifetime || 20000)) {
            for (let k = 0; k < 12; k++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = Math.random() * 2;
              particles.push({ x: trap.x, y: trap.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 4 + 2, color: '#2d0a30', start: now, life: 600 });
            }
            shadowTraps.splice(i, 1);
            continue;
          }
          
          // Chain Blast: this trap was flagged to detonate early by a nearby trap exploding.
          if (trap.forceExplode) {
            const dmg = upgrades.shadowDamage;
            for (const e of enemies) {
              if (e.dead || e.phased) continue;
              const et = mimicEffType(e);
              if (et === 'tree_golem' || et === 'smoke_golem' || et === 'fire_golem') continue;
              if (Math.hypot(e.x - trap.x, e.y - trap.y) < upgrades.shadowRadius) {
                dealWeaponDamage(e, Math.ceil(dmg / 2), 'trap');
              }
            }
            for (let k = 0; k < 16; k++) {
              const angle = Math.random() * Math.PI * 2;
              particles.push({ x: trap.x, y: trap.y, vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2, size: 4, color: '#4a0e4e', start: now, life: 600 });
            }
            shadowTraps.splice(i, 1);
            continue;
          }

          if (!trap.activated && now - trap.placed >= (trap.armDelay || 500)) trap.activated = true;

          if (trap.activated) {
            const levelA = pathLevel('trap', 'A');
            const levelB = pathLevel('trap', 'B');
            const subCt = subPathLevel('trap', 'C');
            const subDt = subPathLevel('trap', 'D');
            const trapW = progress.weapons.trap;
            const repeats = wRepeats('trap');

            // Minefield: pulling force nudges nearby enemies toward the trap
            if (levelA >= 2) {
              for (const e of enemies) {
                if (e.dead || e.phased) continue;
                const d = Math.hypot(e.x - trap.x, e.y - trap.y);
                if (d > 45 && d < 150 && Math.random() < 0.05) {
                  const pv = norm(trap.x - e.x, trap.y - e.y);
                  e.x += pv.nx * 0.6; e.y += pv.ny * 0.6;
                }
              }
            }

            const deadBefore = new Set(enemies.filter(e => e.dead).map(e => e.id));
            let any = false;
            let shouldExplode = false;
            let explosionCenter = { x: trap.x, y: trap.y };
            
            for (const e of enemies) {
              if (e.dead || e.phased) continue;
              const d = Math.hypot(e.x - trap.x, e.y - trap.y);
              if (d < 45) {
                const et = mimicEffType(e);
                if (et === 'tree_golem' || et === 'smoke_golem' || et === 'fire_golem') {
                  continue; // immune to shadow trap - not their weakness
                }
                if (et === 'golem') {
                  if (e.isVoid) {
                    e.hp -= upgrades.shadowDamage;
                    e.lastHit = now;
                    if (e.hp <= 0) markEnemyDead(e, 'trap');
                  } else {
                    markEnemyDead(e, 'trap');
                  }
                  shouldExplode = true;
                  any = true;
                } else if (levelB >= 3) {
                  // Steel Jaws: no direct damage, applies (possibly rupturing) bleed instead
                  const bleedDmg = 1 + repeats;
                  e.bleedUntil = Math.max(e.bleedUntil || 0, now + 3000);
                  e.bleedNextTick = Math.min(e.bleedNextTick || Infinity, now + 500);
                  e.bleedDmg = Math.max(e.bleedDmg || 0, bleedDmg);
                  e.bleedDirect = true;
                  e.ruptureReady = levelB >= 5;
                  e.lastHit = now;
                  shouldExplode = true;
                } else {
                  let dmg = upgrades.shadowDamage;
                  if (levelA >= 1 && !trap.firstProcUsed) dmg *= 1.5;
                  if (levelA >= 5) dmg *= 1.2; // Dark Explosion
                  if (trapW.subPath === 'C' && subCt >= 10) dmg *= (1 + 0.05 * wSubRepeats('trap')); // Explosion Damage (repeatable)
                  if (e.isVoid && e.type === 'archer') dmg *= 0.5;
                  e.hp -= dmg;
                  e.lastHit = now;
                  shouldExplode = true;

                  // Shockwave: knock the enemy back on trigger.
                  if (trapW.subPath === 'D' && subDt >= 6) {
                    const kv = norm(e.x - trap.x, e.y - trap.y);
                    e.x += kv.nx * 20; e.y += kv.ny * 20;
                  }
                  
                  let splashRadius = upgrades.shadowRadius * (1.1 + repeats * 0.1);
                  if (trapW.subPath === 'C' && subCt >= 8) splashRadius *= 1.25; // Mega Blast
                  if (trapW.subPath === 'D' && subDt >= 10) splashRadius *= (1 + 0.05 * wSubRepeats('trap')); // Blast Radius (repeatable)
                  for (const other of enemies) {
                    if (other === e || other.dead) continue;
                    const od = Math.hypot(other.x - trap.x, other.y - trap.y);
                    if (od < splashRadius) {
                      const oet = mimicEffType(other);
                      if (oet === 'tree_golem' || oet === 'smoke_golem' || oet === 'fire_golem') {
                        continue; // immune to shadow trap splash - not their weakness
                      }
                      if (oet === 'golem') {
                        if (other.isVoid) {
                          other.hp -= Math.ceil(dmg / 2);
                          other.lastHit = now;
                          if (other.hp <= 0) markEnemyDead(other, 'trap');
                        } else {
                          markEnemyDead(other, 'trap');
                        }
                      } else {
                        other.hp -= Math.ceil(dmg / 2);
                        other.lastHit = now;
                        // Earthquake: enemies that survive the splash are briefly stunned.
                        if (trapW.subPath === 'D' && subDt >= 7 && other.hp > 0) {
                          other.stunnedUntil = Math.max(other.stunnedUntil || 0, now + 900);
                        }
                        // Fear Trap: enemies caught in the blast flee.
                        if (trapW.subPath === 'D' && subDt >= 6) {
                          let fearRadius = splashRadius;
                          if (subDt >= 9) fearRadius *= 2; // Terror
                          if (od < fearRadius) {
                            other.feared = true;
                            other.fearedUntil = now + 2500;
                            // Panic: fear spreads outward from this enemy too.
                            if (subDt >= 7) {
                              for (const third of enemies) {
                                if (third === other || third.dead || third.phased) continue;
                                if (Math.hypot(third.x - other.x, third.y - other.y) < 60) {
                                  third.feared = true;
                                  third.fearedUntil = now + 2500;
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }

                  // Snaring Trap (level 5 on path B): roots whatever it hits directly.
                  if (levelB >= 5) {
                    let rootDur = 1500;
                    if (trapW.subPath === 'C' && subCt >= 6) rootDur *= 1.5; // Prison
                    if (trapW.subPath === 'C' && subCt >= 10) rootDur *= (1 + 0.05 * wSubRepeats('trap')); // Root Duration (repeatable)
                    e.rootedUntil = Math.max(e.rootedUntil || 0, now + rootDur);
                    // Binding Chains: root spreads to nearby enemies too.
                    if (trapW.subPath === 'C' && subCt >= 7) {
                      for (const other of enemies) {
                        if (other === e || other.dead || other.phased) continue;
                        if (Math.hypot(other.x - e.x, other.y - e.y) < 60) {
                          other.rootedUntil = Math.max(other.rootedUntil || 0, now + rootDur);
                        }
                      }
                    }
                  }
                  // Minefield: spawn small secondary traps around this one.
                  if (trapW.subPath === 'C' && subCt >= 6) {
                    for (let m = 0; m < 2; m++) {
                      const ang = Math.random() * Math.PI * 2;
                      const dist = 40 + Math.random() * 30;
                      shadowTraps.push({
                        x: trap.x + Math.cos(ang) * dist, y: trap.y + Math.sin(ang) * dist,
                        placed: now, activated: true, armDelay: 0, lifetime: 4000,
                        stickyTar: false, firstProcUsed: true, isMini: true
                      });
                    }
                  }
                  // Chain Blast: nearby traps also detonate.
                  if (trapW.subPath === 'C' && subCt >= 7) {
                    for (const other of shadowTraps) {
                      if (other === trap || !other.activated) continue;
                      if (Math.hypot(other.x - trap.x, other.y - trap.y) < 100) {
                        other.forceExplode = true;
                      }
                    }
                  }
                  // Inferno Trap: leaves burning ground.
                  if (trapW.subPath === 'C' && subCt >= 9) {
                    crackedEarthZones.push({ x: trap.x, y: trap.y, created: now, life: 2500, radius: splashRadius * 0.8, tickRate: 500, lastTick: now, dmg: Math.ceil(dmg * 0.2), root: false });
                  }
                  // Aftershock: a smaller second explosion a moment later.
                  if (trapW.subPath === 'D' && subDt >= 8) {
                    const ex = trap.x, ey = trap.y, r2 = splashRadius * 0.7, d2 = Math.ceil(dmg * 0.5);
                    setTimeout(() => {
                      if (game.paused || gameOver) return;
                      for (const other of enemies) {
                        if (other.dead || other.phased) continue;
                        if (Math.hypot(other.x - ex, other.y - ey) < r2) dealWeaponDamage(other, d2, 'trap');
                      }
                    }, 350);
                  }
                  // Cataclysm: every 5th trigger of this weapon unleashes a massive explosion.
                  if (trapW.subPath === 'D' && subDt >= 9) {
                    trapTriggerCounter = (trapTriggerCounter || 0) + 1;
                    if (trapTriggerCounter % 5 === 0) {
                      for (const other of enemies) {
                        if (other.dead || other.phased) continue;
                        if (Math.hypot(other.x - trap.x, other.y - trap.y) < splashRadius * 2) {
                          dealWeaponDamage(other, dmg * 1.5, 'trap');
                        }
                      }
                    }
                  }
                }
                any = true;
              }
            }
            trap.firstProcUsed = true;
            
            if (any) {
              for (const e of enemies) if (!e.dead && e.hp <= 0) markEnemyDead(e, 'trap');
            }
            const killedThisTick = enemies.some(e => e.dead && !deadBefore.has(e.id));

            if (shouldExplode) {
              for (let k = 0; k < 24; k++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 3;
                particles.push({ x: trap.x, y: trap.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 6 + 3, color: Math.random() > 0.5 ? '#4a0e4e' : '#2d0a30', start: now, life: 800 });
              }
              clampParticles();
              
              let persist = false;
              if (levelB >= 4) persist = true;
              else if (levelA >= 3 && killedThisTick && Math.random() < 0.05) persist = true;

              if (!persist) shadowTraps.splice(i, 1);
            }
          }
        }

        for (const e of enemies) {
          if (e.dead) continue;
          e.smokeBuffed = false;
          
          if (e.type !== 'smoke_golem') {
            for (const sg of enemies) {
              if (sg.dead || !sg.smokeTrail || (sg.type !== 'smoke_golem' && sg.mimicking !== 'smoke_golem')) continue;
              for (const trail of sg.smokeTrail) {
                const dist = Math.hypot(e.x - trail.x, e.y - trail.y);
                if (dist < 30) {
                  e.smokeBuffed = true;
                  break;
                }
              }
              if (e.smokeBuffed) break;
            }
          }
        }
        
        for (const e of enemies) {
          if (e.dead) continue;
          e.anim += 0.08;

          if ((e.type === 'troll' || (e.type === 'mimic' && e.mimicking === 'troll')) && e.hp < e.maxHp) {
            const now = Date.now();
            const regenAmount = e.isVoid ? 2 : 1;
            const activeOrbs = e.isBoss ? healingOrbs.filter(o => o.ownerId === e.id && !o.dead) : [];
            if (e.isBoss && activeOrbs.length > 0) {
              const healPerSec = Math.max(1, (e.bossLevel || 10) / 5);
              if (!e.lastBoostTick) e.lastBoostTick = now;
              const elapsed = (now - e.lastBoostTick) / 1000;
              const healAmt = elapsed * healPerSec;
              if (healAmt >= 1) {
                e.hp = Math.min(e.maxHp, e.hp + Math.floor(healAmt));
                e.lastBoostTick = now;
              }
            } else {
              e.lastBoostTick = now;
              if (now - (e.lastHit || 0) >= TROLL_REGEN_INTERVAL && now - (e.lastRegen || 0) >= TROLL_REGEN_INTERVAL) {
                e.hp = Math.min(e.maxHp, e.hp + regenAmount);
                e.lastRegen = now;
              }
            }
          }

          if (e.type === 'troll' && e.isBoss) {
            const pct = e.hp / e.maxHp;
            if (!e.healTriggered) e.healTriggered = { 75: false, 50: false, 25: false };
            for (const threshold of [75, 50, 25]) {
              if (!e.healTriggered[threshold] && pct <= threshold / 100) {
                e.healTriggered[threshold] = true;
                for (let k = 0; k < 3; k++) {
                  const angle = (k / 3) * Math.PI * 2;
                  healingOrbs.push({ id: nextEnemyId++, ownerId: e.id, x: e.x + Math.cos(angle) * 60, y: e.y + Math.sin(angle) * 60, hp: 15, maxHp: 15, dead: false });
                }
              }
            }
            const nowFb = Date.now();
            if (nowFb - (e.lastFireball || 0) > 4000) {
              e.lastFireball = nowFb;
              const fv = norm(player.x - e.x, player.y - e.y);
              trollFireballs.push({ id: nextEnemyId++, ownerId: e.id, x: e.x, y: e.y, vx: fv.nx * 1.2, vy: fv.ny * 1.2, hp: 3, maxHp: 3, created: nowFb });
            }
          }

          const nowS = Date.now();

          // Stunning-mist cloud detection (also drives kill-attribution + weaken/debuff/stun)
          e.inSmokeCloud = false;
          let cloudSpeedMult = 1;
          e.cloudDamageAmp = 1;
          e.cloudDamageDealtMult = 1;
          e.feared = e.fearedUntil && nowS < e.fearedUntil;
          const mimicImmune = e.type === 'mimic';
          e.wasInPhantomCloud = false;
          if (!mimicImmune) for (const cloud of smokeClouds) {
            if (nowS > cloud.expiresAt) continue;
            if (Math.hypot(e.x - cloud.x, e.y - cloud.y) > cloud.radius) continue;
            e.inSmokeCloud = true;
            if (cloud.debuffSlow) cloudSpeedMult = Math.min(cloudSpeedMult, 0.5);
            if (cloud.weaken) e.cloudDamageAmp = 1.25;
            if (cloud.stunDuration) e.stunnedUntil = Math.max(e.stunnedUntil || 0, nowS + cloud.stunDuration);
            // Shadow Clone: extra slow on top of the base debuff cloud.
            if (cloud.shadowClone) cloudSpeedMult = Math.min(cloudSpeedMult, 0.5);
            // Teleport Mist: enemies deal less damage while inside.
            if (cloud.teleportMist) e.cloudDamageDealtMult = 0.5;
            // Mirage: wander randomly instead of chasing the player.
            if (cloud.mirage) { e.mirageWander = true; e.wasInPhantomCloud = true; }
            // Phantom Realm: the wander effect persists briefly after leaving.
            if (cloud.phantomRealm) e.phantomWanderUntil = nowS + 1500;
            // Fear Gas: flee from the player instead of approaching.
            if (cloud.fearGas) { e.feared = true; e.fearedUntil = nowS + 300; }
            // Nightmare: small chance per frame for a feared enemy to attack another enemy.
            if (cloud.nightmareControl && e.feared && Math.random() < 0.002) {
              let nearestOther = null, nod = Infinity;
              for (const other of enemies) {
                if (other === e || other.dead || other.phased) continue;
                const d = Math.hypot(other.x - e.x, other.y - e.y);
                if (d < nod) { nod = d; nearestOther = other; }
              }
              if (nearestOther && nod < 80) dealWeaponDamage(nearestOther, 2, 'trap');
            }
          }
          if (!e.mirageWander) e.mirageWander = e.phantomWanderUntil && nowS < e.phantomWanderUntil;

          // Chaos (Shadow Trap Fear Trap D): feared enemies occasionally lash out at the nearest ally.
          if (e.feared && progress.weapons.trap.subPath === 'D' && subPathLevel('trap', 'D') >= 8 && Math.random() < 0.01) {
            let nearestAlly = null, nad = Infinity;
            for (const other of enemies) {
              if (other === e || other.dead || other.phased) continue;
              const d = Math.hypot(other.x - e.x, other.y - e.y);
              if (d < nad) { nad = d; nearestAlly = other; }
            }
            if (nearestAlly && nad < 80) dealWeaponDamage(nearestAlly, 2, 'trap');
          }

          // Sticky Tar (Parasite trap path) - continuous slow while inside an active trap
          e.tarSlowed = false;
          if (!mimicImmune) for (const trap of shadowTraps) {
            if (!trap.stickyTar || !trap.activated) continue;
            if (Math.hypot(e.x - trap.x, e.y - trap.y) < 45) { e.tarSlowed = true; break; }
          }

          // Unstable Ground (Katana Heavy C) - slowed while standing in an earthquake zone
          e.earthquakeSlowed = false;
          if (!mimicImmune) for (const z of earthquakeZones) {
            if (nowS - z.created > z.life) continue;
            if (Math.hypot(e.x - z.x, e.y - z.y) < z.radius) { e.earthquakeSlowed = true; break; }
          }

          // Poison DoT (Sniper Darts path)
          if (!mimicImmune && e.poisonUntil && nowS < e.poisonUntil && nowS >= (e.poisonNextTick || 0)) {
            e.hp -= e.poisonDmg || 1;
            e.poisonNextTick = nowS + (e.poisonTickRate || 500);
            if (e.poisonTrail) poisonPools.push({ x: e.x, y: e.y, created: nowS, life: 3000, dmg: e.poisonDmg || 1 });
            // Plague: poison spreads to nearby enemies with each tick.
            if (e.poisonPlague) {
              const spreadRadius = e.poisonContagion ? 90 : 55;
              for (const other of enemies) {
                if (other === e || other.dead || other.phased) continue;
                if (Math.hypot(other.x - e.x, other.y - e.y) < spreadRadius) {
                  other.poisonUntil = Math.max(other.poisonUntil || 0, e.poisonUntil);
                  other.poisonNextTick = Math.min(other.poisonNextTick || Infinity, nowS + (e.poisonTickRate || 500));
                  other.poisonDmg = Math.max(other.poisonDmg || 0, e.poisonDmg || 1);
                  other.poisonTickRate = e.poisonTickRate;
                }
              }
            }
            if (e.hp <= 0) {
              // Pandemic: dying while poisoned spreads the poison outward one last time.
              if (e.poisonPandemic) {
                for (const other of enemies) {
                  if (other === e || other.dead || other.phased) continue;
                  if (Math.hypot(other.x - e.x, other.y - e.y) < 70) {
                    other.poisonUntil = Math.max(other.poisonUntil || 0, nowS + 3000);
                    other.poisonNextTick = Math.min(other.poisonNextTick || Infinity, nowS + 500);
                    other.poisonDmg = Math.max(other.poisonDmg || 0, e.poisonDmg || 1);
                  }
                }
              }
              markEnemyDead(e, 'dart'); continue;
            }
          }

          // Bleed / Rupture DoT (Parasite trap path)
          if (!mimicImmune && e.bleedUntil && nowS < e.bleedUntil && nowS >= (e.bleedNextTick || 0)) {
            e.hp -= e.bleedDmg || 1;
            e.bleedNextTick = nowS + 500;
            if (e.hp <= 0) {
              if (e.bleedDirect && e.ruptureReady) {
                for (const other of enemies) {
                  if (other === e || other.dead) continue;
                  if (Math.hypot(other.x - e.x, other.y - e.y) < 70) {
                    other.bleedUntil = nowS + 3000;
                    other.bleedNextTick = Math.min(other.bleedNextTick || Infinity, nowS + 500);
                    other.bleedDmg = Math.max(other.bleedDmg || 0, e.bleedDmg);
                  }
                }
                for (let k = 0; k < 10; k++) {
                  const angle = Math.random() * Math.PI * 2;
                  particles.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2, size: 5, color: '#8b0000', start: nowS, life: 500 });
                }
              }
              markEnemyDead(e, 'trap');
              continue;
            }
          }

          let v = norm(player.x - e.x, player.y - e.y);
          if (e.mirageWander) {
            if (!e.mirageAngle || Math.random() < 0.02) e.mirageAngle = Math.random() * Math.PI * 2;
            v = { nx: Math.cos(e.mirageAngle), ny: Math.sin(e.mirageAngle), d: v.d };
          } else if (e.feared) {
            v = { nx: -v.nx, ny: -v.ny, d: v.d };
          }
          
          let effectiveSpeed = e.speed;
          if (e.smokeBuffed) {
            effectiveSpeed *= 1.5;
          }
          effectiveSpeed *= cloudSpeedMult;
          if (e.tarSlowed) effectiveSpeed *= 0.5;
          if (e.earthquakeSlowed) effectiveSpeed *= 0.6;
          if (e.poisonSlowed && e.poisonUntil && nowS < e.poisonUntil) effectiveSpeed *= 0.6;

          const isRooted = !mimicImmune && e.rootedUntil && nowS < e.rootedUntil;
          const isStunned = (!mimicImmune && e.stunnedUntil && nowS < e.stunnedUntil) || isRooted;

          // Mimic: figure out what (if anything) it's currently copying, before the
          // main behavior dispatch below - then it flows through that same real
          // per-type logic (movement, spikes, clouds, healing, shooting, etc.) as
          // whatever it's mimicking, rather than a hand-written approximation.
          if (e.type === 'mimic' && !isStunned) {
            const mimicRange = 375; // 1.5x the skeleton archer's 250 firing range
            let nearestTarget = 'player', nearestDist = v.d, nearestIsPlayer = true;
            for (const other of enemies) {
              if (other === e || other.dead || other.phased || other.type === 'mimic') continue;
              const d = Math.hypot(other.x - e.x, other.y - e.y);
              if (d < nearestDist) { nearestDist = d; nearestTarget = other; nearestIsPlayer = false; }
            }

            if (nearestDist <= mimicRange) {
              e.mimicTargets = [nearestTarget];
              if (e.isVoid) {
                let secondDist = Infinity, secondTarget = null;
                if (!nearestIsPlayer && v.d < secondDist) { secondDist = v.d; secondTarget = 'player'; }
                for (const other of enemies) {
                  if (other === e || other === nearestTarget || other.dead || other.phased || other.type === 'mimic') continue;
                  const d = Math.hypot(other.x - e.x, other.y - e.y);
                  if (d < secondDist) { secondDist = d; secondTarget = other; }
                }
                if (secondTarget) e.mimicTargets.push(secondTarget);

                // Void copying 2 targets: randomly switch which one it's actively
                // behaving as every ~1.5s, rather than blending both at once.
                if (!e.lastMimicSwitch || nowS - e.lastMimicSwitch > 1500) {
                  e.lastMimicSwitch = nowS;
                  e.activeMimicIdx = e.mimicTargets.length > 1 ? Math.floor(Math.random() * e.mimicTargets.length) : 0;
                }
                const activeTarget = e.mimicTargets[e.activeMimicIdx || 0];
                e.mimicking = activeTarget === 'player' ? ('player_' + player.character) : activeTarget.type;
              } else {
                e.mimicking = nearestIsPlayer ? ('player_' + player.character) : nearestTarget.type;
              }
            } else {
              e.mimicking = null;
              e.mimicTargets = [];
            }
          }
          // While actively copying a real enemy type (not the player), the mimic is
          // dispatched through that type's actual behavior branch below.
          const effType = (e.type === 'mimic' && e.mimicking && e.mimicking.indexOf('player_') !== 0) ? e.mimicking : e.type;

          if (isStunned) {
            // Frozen: no movement, no special abilities this frame.
          } else if (e.type === 'mimic' && e.mimicking && e.mimicking.indexOf('player_') === 0) {
            // Mimicking the player specifically: ranged if the ninja (shuriken-style),
            // melee if the samurai (katana-style) - there's no "player" behavior branch
            // to route through below, so this part is still hand-written.
            e.x += v.nx * e.speed * 1.3; e.y += v.ny * e.speed * 1.3;
            const now = Date.now();
            if (player.character === 'ninja') {
              if (now - (e.lastShot || 0) > 1400) {
                e.lastShot = now;
                const av = norm(player.x - e.x, player.y - e.y);
                enemyArrows.push({ x: e.x, y: e.y, vx: av.nx * 3, vy: av.ny * 3, rot: Math.atan2(av.ny, av.nx), metal: false, mimicColor: e.isVoid ? '#2fd8ff' : '#ff4fd8' });
              }
            }
            // Samurai mimicry relies on the generic contact-melee damage check further below.
          } else if (effType === 'ghost') {
            const now = Date.now();
            if (e.isBoss || e.isVoid) {
              if (now - e.lastPhase > 1500) {
                e.lastPhase = now;
                e.phased = !e.phased;
              }
            }
            if (e.isBoss) {
              e.spiralAngle = (e.spiralAngle || 0) + 0.03;
              e.spiralRadius = Math.max(20, (e.spiralRadius || 220) - 0.3);
              e.x = player.x + Math.cos(e.spiralAngle) * e.spiralRadius;
              e.y = player.y + Math.sin(e.spiralAngle) * e.spiralRadius;
              if (now - e.lastAbility > 1000 / bossSpawnRate(e.bossLevel)) {
                e.lastAbility = now;
                const angle = Math.random() * Math.PI * 2;
                const dist = 80 + Math.random() * 200;
                ectoplasmMarkers.push({ x: player.x + Math.cos(angle) * dist, y: player.y + Math.sin(angle) * dist, created: now, fuse: 3000, bossLevel: e.bossLevel });
                for (let k = 0; k < 6; k++) {
                  particles.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, size: 4, color: '#c8ffd4', start: now, life: 500 });
                }
              }
            } else {
              e.sineOffset = (e.sineOffset || 0) + 0.025;
              const perpX = v.d === 0 ? 0 : -v.ny;
              const perpY = v.d === 0 ? 0 : v.nx;
              const sineWave = Math.sin(e.sineOffset) * 35;
              e.x += v.nx * effectiveSpeed + perpX * sineWave * 0.05;
              e.y += v.ny * effectiveSpeed + perpY * sineWave * 0.05;
              if (e.isVoid && (!e.lastTrailDrop || now - e.lastTrailDrop > 120)) {
                e.lastTrailDrop = now;
                voidGhostTrail.push({ x: e.x, y: e.y, created: now, life: 6000, ownerId: e.id });
              }
            }
          } else if (effType === 'mage') {
            const now=Date.now();if(now-e.lastWarp>3000){const angle=Math.random()*Math.PI*2,dist=140+Math.random()*120;e.x=Math.max(50,Math.min(750,player.x+Math.cos(angle)*dist));e.y=Math.max(50,Math.min(550,player.y+Math.sin(angle)*dist));e.lastWarp=now;}
            if(now-(e.lastFireball||0)>3200){e.lastFireball=now;const fv=norm(player.x-e.x,player.y-e.y);trollFireballs.push({id:nextEnemyId++,ownerId:e.id,sourceType:'mage',x:e.x,y:e.y,vx:fv.nx*.85,vy:fv.ny*.85,hp:1,maxHp:1,created:now});}
            e.x+=v.nx*effectiveSpeed*.35;e.y+=v.ny*effectiveSpeed*.35;
          } else if (effType === 'eye') {
            const now = Date.now();
            const warpInterval = e.isVoid ? 1500 : 3000;
            if (now - e.lastWarp > warpInterval) {
              const currentDist = Math.hypot(e.x - player.x, e.y - player.y);
              const angle = Math.random() * Math.PI * 2;
              e.x = Math.max(50, Math.min(750, player.x + Math.cos(angle) * currentDist));
              e.y = Math.max(50, Math.min(550, player.y + Math.sin(angle) * currentDist));
              e.lastWarp = now;
              for (let j = 0; j < 15; j++) {
                particles.push({ x: e.x + (Math.random() - 0.5) * 40, y: e.y + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, size: Math.random() * 6 + 3, color: '#8b00ff', start: now, life: 600 });
              }
              clampParticles();
              if (e.isBoss) {
                const cloneCap = Math.max(1, Math.floor((e.bossLevel || 10) / 5));
                const existingClones = enemies.filter(o => !o.dead && o.type === 'eye' && o.rewardless && o.bossOwnerId === e.id).length;
                if (existingClones < cloneCap) {
                  enemies.push({ id: nextEnemyId++, type: 'eye', x: e.x + 30, y: e.y + 30, speed: e.speed, hp: 1, maxHp: 1, anim: Math.random() * 100, lastWarp: now + 99999, metal: false, isVoid: false, rewardless: true, bossOwnerId: e.id });
                }
              }
            }
            if (e.isVoid && now - e.lastLaser > 4000) {
              e.lastLaser = now;
              voidLasers.push({ x1: e.x, y1: e.y, x2: player.x, y2: player.y, created: now, life: 400 });
              player.hp -= 12 * activeEvent.damageMult;
              honor = 0;
              if (player.hp <= 0) {
                lastDeathInfo = { type: 'eye', damage: 12 * activeEvent.damageMult, metal: !!e.metal, size: null, method: 'melee' };
                updateUI();
                gameOver();
                return;
              }
            }
            e.x += v.nx * effectiveSpeed; e.y += v.ny * effectiveSpeed;
          } else if (effType === 'archer') {
            const now = Date.now();
            const shootInterval = (e.isBoss || e.isVoid) ? 1000 : 2000;
            const range = e.isVoid ? 312 : 250;

            if (e.meleeCharger) {
              e.x += v.nx * effectiveSpeed; e.y += v.ny * effectiveSpeed;
            } else if (e.isVoid) {
              e.circleAngle = (e.circleAngle || 0) + 0.005;
              e.x = player.x + Math.cos(e.circleAngle) * range;
              e.y = player.y + Math.sin(e.circleAngle) * range;
              if (now - e.lastShot > shootInterval) {
                e.lastShot = now;
                const arrowSpeed = 2.6;
                const av = norm(player.x - e.x, player.y - e.y);
                enemyArrows.push({ x: e.x, y: e.y, vx: av.nx * arrowSpeed, vy: av.ny * arrowSpeed, rot: Math.atan2(av.ny, av.nx), metal: !!e.metal });
              }
            } else if (v.d > range) {
              e.x += v.nx * effectiveSpeed; e.y += v.ny * effectiveSpeed;
            } else {
              if (e.isBoss) {
                e.patrolDir = e.patrolDir || 1;
                e.x += e.patrolDir * effectiveSpeed * 1.5;
                if (e.x < 60 || e.x > 740) e.patrolDir *= -1;
              }
              if (now - e.lastShot > shootInterval) {
                e.lastShot = now;
                const arrowSpeed = 2.6;
                enemyArrows.push({ x: e.x, y: e.y, vx: v.nx * arrowSpeed, vy: v.ny * arrowSpeed, rot: Math.atan2(player.y - e.y, player.x - e.x), metal: !!e.metal });
              }
            }
          } else if (effType === 'golem') {
            e.x += v.nx * effectiveSpeed; e.y += v.ny * effectiveSpeed;
            const now = Date.now();
            if (now - e.lastAbility > 5000) {
              e.lastAbility = now;
              const otherEnemies = enemies.filter(other => other !== e && !other.dead && other.type !== 'golem' && other.type !== 'tree_golem' && other.type !== 'smoke_golem' && other.type !== 'fire_golem');
              if (otherEnemies.length > 0) {
                const target = otherEnemies[Math.floor(Math.random() * otherEnemies.length)];
                const healthMultiplier = (target.smokeBuffed ? 3 : 2) * (e.isVoid ? 1.5 : 1);
                target.hp *= healthMultiplier;
                target.maxHp *= healthMultiplier;
                for (let k = 0; k < 12; k++) {
                  const angle = Math.random() * Math.PI * 2;
                  const speed = Math.random() * 2 + 1;
                  particles.push({ x: target.x, y: target.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 5 + 3, color: '#5d4e37', start: now, life: 600 });
                }
                clampParticles();
              }
            }
          } else if (effType === 'tree_golem') {
            const angle = Math.atan2(v.ny, v.nx);
            const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            const snapX = Math.cos(snapAngle);
            const snapY = Math.sin(snapAngle);
            e.x += snapX * effectiveSpeed; e.y += snapY * effectiveSpeed;
            
            const now = Date.now();
            if (now - e.lastAbility > 5000) {
              e.lastAbility = now;
              const numRoots = Math.ceil((Math.floor(Math.random() * 4) + 2) * (e.isVoid ? 1.5 : 1));
              for (let i = 0; i < numRoots; i++) {
                const offsetX = (Math.random() - 0.5) * 60;
                const offsetY = (Math.random() - 0.5) * 60;
                rootSpikes.push({ 
                  id: nextRootId++, 
                  x: e.x + offsetX, 
                  y: e.y + offsetY, 
                  hp: 1, 
                  maxHp: 1, 
                  spawnTime: now,
                  ownerId: e.id
                });
              }
            }
          } else if (effType === 'smoke_golem') {
            e.sineOffset = (e.sineOffset || 0) + 0.025;
            const perpX = v.d === 0 ? 0 : -v.ny;
            const perpY = v.d === 0 ? 0 : v.nx;
            const sineWave = Math.sin(e.sineOffset) * 35;
            e.x += v.nx * e.speed + perpX * sineWave * 0.05;
            e.y += v.ny * e.speed + perpY * sineWave * 0.05;
            
            const now = Date.now();
            if (game.frame % 5 === 0) {
              if (!e.smokeTrail) e.smokeTrail = [];
              e.smokeTrail.push({ x: e.x, y: e.y, created: now });
              e.smokeTrail = e.smokeTrail.filter(s => now - s.created < 4500);
            }
          } else if (effType === 'fire_golem') {
            e.x += v.nx * e.speed; e.y += v.ny * e.speed;
          } else {
            e.x += v.nx * e.speed; e.y += v.ny * e.speed;
            if (e.type === 'slime' && e.isBoss) {
              const nowTrail = Date.now();
              const spawnInterval = 1000 / bossSpawnRate(e.bossLevel);
              if (nowTrail - (e.lastAbility || 0) > spawnInterval) {
                e.lastAbility = nowTrail;
                const hp = Math.floor(player.level / 3) + 1;
                enemies.push({ id: nextEnemyId++, type: 'slime', x: e.x - v.nx * 20, y: e.y - v.ny * 20, speed: 0.5, hp, maxHp: hp, anim: Math.random() * 100, metal: false, isVoid: false });
              }
            }
            if (e.type === 'bat' && e.isBoss) {
              const nowSwarm = Date.now();
              const swarmInterval = 1000 / bossSpawnRate(e.bossLevel);
              if (nowSwarm - (e.lastAbility || 0) > swarmInterval) {
                e.lastAbility = nowSwarm;
                const tier = Math.max(1, (e.bossLevel || 10) / 10);
                const swarmSize = Math.round(((e.bossLevel || 10) / 2) * Math.pow(2, tier - 1));
                const dirs = [
                  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
                  { x: 0.707, y: -0.707 }, { x: 0.707, y: 0.707 }, { x: -0.707, y: 0.707 }, { x: -0.707, y: -0.707 }
                ];
                const dir = dirs[Math.floor(Math.random() * dirs.length)];
                const spawnX = player.x - dir.x * 500;
                const spawnY = player.y - dir.y * 500;
                for (let s = 0; s < swarmSize; s++) {
                  spawnSpecificEnemy('bat', spawnX + (Math.random() - 0.5) * 60, spawnY + (Math.random() - 0.5) * 60, e.speed / 0.4, Math.floor(player.level / 3) + 1, false, false);
                }
              }
            }
          }

          if (v.d < 60 && !e.dead && !e.phased) {
            let damage = 10;
            if (e.type === 'bat') damage = 5;
            if (e.type === 'golem') damage = 50;
            if (e.type === 'tree_golem') damage = Math.ceil(player.maxHp / 2);
            if (e.type === 'smoke_golem') damage = Math.ceil(player.maxHp / 2);
            if (e.type === 'fire_golem') {
              if (e.size === 'full') damage = 40;
              else if (e.size === 'half') damage = 25;
              else if (e.size === 'quarter') damage = 15;
            }
            damage *= activeEvent.damageMult;
            if (e.isVoid) damage *= curseEffects.voidDamageTakenMult;
            if (e.cloudDamageDealtMult) damage *= e.cloudDamageDealtMult;
            
            // Smoke Blood (Smoke Bomb, Control D and Explosives D): a chance for the
            // attacking enemy to leave a small smoke bomb behind when it dies here.
            if (upgrades.smokeUnlocked) {
              const subCsb = subPathLevel('smoke', 'C');
              const subDsb = subPathLevel('smoke', 'D');
              if (progress.weapons.smoke.subPath === 'D' && subDsb >= 6 && Math.random() < 0.2) {
                const bx = e.x, by = e.y;
                setTimeout(() => {
                  if (game.paused || gameOver) return;
                  explodeSmokeAt(bx, by, 45, true);
                }, 50);
              }
            }
            
            player.hp -= damage;
            honor = 0;
            markEnemyDead(e);
            if (player.hp <= 0) {
              lastDeathInfo = { type: e.type, damage, metal: !!e.metal, size: e.size || null, method: 'melee' };
              updateUI(); 
              gameOver(); 
              return;
            }
          }
        }

        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          
          for (let r = rootSpikes.length - 1; r >= 0; r--) {
            const root = rootSpikes[r];
            const dist = Math.hypot(b.x - root.x, b.y - root.y);
            if (Number.isFinite(dist) && dist < 15) {
              root.hp -= upgrades.damage;
              if (root.hp <= 0) {
                rootSpikes.splice(r, 1);
                const now = Date.now();
                for (let k = 0; k < 8; k++) {
                  const angle = Math.random() * Math.PI * 2;
                  const speed = Math.random() * 2;
                  particles.push({ x: root.x, y: root.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 3 + 2, color: '#5d4037', start: now, life: 400 });
                }
                clampParticles();
              }
              bullets.splice(j, 1);
              break;
            }
          }
          
          if (j < 0 || j >= bullets.length) continue;
          
          for (const e of enemies) {
            if (e.dead || e.phased) continue;
            if (b.hitIds.includes(e.id)) continue;
            const dist = Math.hypot(b.x - e.x, b.y - e.y);
            if (Number.isFinite(dist) && dist < 40 * (b.size || 1)) {
              const et = mimicEffType(e);
              if (et === 'golem' || et === 'tree_golem' || et === 'smoke_golem') {
                bullets.splice(j, 1);
                const now = Date.now();
                let color = '#5d4e37';
                if (et === 'tree_golem') color = '#5d4037';
                if (et === 'smoke_golem') color = '#616161';
                for (let k = 0; k < 8; k++) {
                  const angle = Math.random() * Math.PI * 2;
                  const speed = Math.random() * 2 + 1;
                  particles.push({ x: e.x, y: e.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 4 + 2, color: color, start: now, life: 400 });
                }
                clampParticles();
                break;
              }
              
              if (et === 'fire_golem') {
                if (b.hasBounced) {
                  bullets.splice(j, 1);
                  const now = Date.now();
                  for (let k = 0; k < 8; k++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 2 + 1;
                    particles.push({ x: e.x, y: e.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 4 + 2, color: '#ff9800', start: now, life: 400 });
                  }
                  clampParticles();
                  break;
                } else {
                  e.hp -= (b.dmg || upgrades.damage);
                  if (e.hp <= 0) {
                    if (e.size === 'full') {
                      for (let s = 0; s < 2; s++) {
                        const angle = (Math.PI * 2 * s) / 2 + (Math.random() - 0.5) * 0.5;
                        const dist = 50;
                        enemies.push({ 
                          id: nextEnemyId++, 
                          type: 'fire_golem', 
                          x: e.x + Math.cos(angle) * dist, 
                          y: e.y + Math.sin(angle) * dist, 
                          speed: 0.1, 
                          hp: 1, 
                          maxHp: 1, 
                          anim: Math.random() * 100, 
                          size: 'half' 
                        });
                      }
                    } else if (e.size === 'half') {
                      for (let s = 0; s < 2; s++) {
                        const angle = (Math.PI * 2 * s) / 2 + (Math.random() - 0.5) * 0.5;
                        const dist = 35;
                        enemies.push({ 
                          id: nextEnemyId++, 
                          type: 'fire_golem', 
                          x: e.x + Math.cos(angle) * dist, 
                          y: e.y + Math.sin(angle) * dist, 
                          speed: 0.3, 
                          hp: 1, 
                          maxHp: 1, 
                          anim: Math.random() * 100, 
                          size: 'quarter' 
                        });
                      }
                    }
                    markEnemyDead(e, 'shuriken');
                  }
                  bullets.splice(j, 1);
                  break;
                }
              }
              
              if (!e.metal) {
                let dmgDealt = b.dmg || upgrades.damage;
                if (e.isVoid && e.type === 'archer') dmgDealt *= 0.5;
                // Weak Point: bonus damage vs enemies still above 75% HP.
                if (b.markChance !== undefined && b.markChance >= 0 && subPathLevel('shuriken', 'C') >= 6 && progress.weapons.shuriken.subPath === 'C' && e.hp / e.maxHp > 0.75) {
                  dmgDealt *= 2;
                }
                // Execution: the first enemy struck by this throw takes bonus damage.
                if (b.isFirstHitOfThrow && !b.hasHitFirst) {
                  dmgDealt *= 1.5;
                  b.hasHitFirst = true;
                }
                // Marked enemies take extra damage; Death Blow makes them explode on death.
                if (e.marked) dmgDealt *= 1.5;
                const wasDead = e.dead;
                e.hp -= dmgDealt;
                e.lastHit = Date.now();
                if (e.hp <= 0) {
                  const wasMarked = e.marked;
                  markEnemyDead(e, 'shuriken');
                  if (wasMarked && progress.weapons.shuriken.subPath === 'C' && subPathLevel('shuriken', 'C') >= 9) {
                    for (const other of enemies) {
                      if (other === e || other.dead || other.phased) continue;
                      if (Math.hypot(other.x - e.x, other.y - e.y) < 55) {
                        dealWeaponDamage(other, Math.ceil(upgrades.damage * 1.2), 'shuriken');
                      }
                    }
                  }
                } else {
                  if (b.stunOnHit) e.stunnedUntil = Date.now() + 1200;
                  // Assassin's Mark: a chance for this enemy to become Marked.
                  if (b.markChance > 0 && !e.marked && Math.random() < b.markChance) e.marked = true;
                  // Ghost Chain / Chain Reaction: bleed on hit, stacking if unlocked.
                  if (b.bleedOnHit) {
                    const now2 = Date.now();
                    e.bleedUntil = Math.max(e.bleedUntil || 0, now2 + 3000);
                    e.bleedNextTick = Math.min(e.bleedNextTick || Infinity, now2 + 500);
                    if (b.bleedStacks) e.bleedDmg = (e.bleedDmg || 0) + 1;
                    else e.bleedDmg = Math.max(e.bleedDmg || 0, 1);
                  }
                }
              } else {
                const now = Date.now();
                for (let k = 0; k < 8; k++) {
                  const angle = Math.random() * Math.PI * 2;
                  const speed = Math.random() * 2 + 1;
                  particles.push({ x: e.x, y: e.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 4 + 2, color: '#c0c0c0', start: now, life: 400 });
                }
                clampParticles();
              }
              
              b.hitIds.push(e.id);
              let removeBullet = true;

              // Shadow Master: the shuriken pierces straight through instead of stopping or ricocheting.
              if (b.pierce) {
                removeBullet = false;
              } else if (b.fullRicochets > 0) {
                const nearest = findNearest(b.x, b.y, b.hitIds);
                const speed = Math.min(8, Math.hypot(b.vx, b.vy)) || 6;
                if (nearest) {
                  const rv = norm(nearest.x - b.x, nearest.y - b.y);
                  b.vx = rv.nx * speed; b.vy = rv.ny * speed;
                } else {
                  // No enemy to bounce toward - fly away from the player instead of freezing in place.
                  const av = norm(b.x - player.x, b.y - player.y);
                  b.vx = av.nx * speed; b.vy = av.ny * speed;
                }
                b.fullRicochets--; b.hasBounced = true; removeBullet = false;
              } else if (b.falloffRicochet) {
                const nextDmg = (b.dmg || upgrades.damage) / 2;
                if (nextDmg >= 1) {
                  const nearest = findNearest(b.x, b.y, b.hitIds);
                  const speed = Math.min(8, Math.hypot(b.vx, b.vy)) || 6;
                  if (nearest) {
                    const rv = norm(nearest.x - b.x, nearest.y - b.y);
                    b.vx = rv.nx * speed; b.vy = rv.ny * speed;
                  } else {
                    // No enemy to bounce toward - fly away from the player instead of freezing in place.
                    const av = norm(b.x - player.x, b.y - player.y);
                    b.vx = av.nx * speed; b.vy = av.ny * speed;
                  }
                  b.dmg = nextDmg; b.hasBounced = true; removeBullet = false;
                }
              }
              if (removeBullet) { bullets.splice(j, 1); break; }
            }
          }
        }

        for (let i = darts.length - 1; i >= 0; i--) {
          const d = darts[i];
          d.x += d.vx; d.y += d.vy;
          const traveled = Math.hypot(d.x - d.startX, d.y - d.startY);

          if (d.boomerang && !d.returning && traveled > d.maxRange) {
            d.returning = true;
            const rv = norm(player.x - d.x, player.y - d.y);
            const speed = Math.hypot(d.vx, d.vy) || 4;
            d.vx = rv.nx * speed; d.vy = rv.ny * speed;
          } else if (d.returning) {
            if (Math.hypot(d.x - player.x, d.y - player.y) < 20) { darts.splice(i, 1); continue; }
          } else if (traveled > d.maxRange || d.x < 0 || d.x > 800 || d.y < 0 || d.y > 600) {
            darts.splice(i, 1); continue;
          }

          let hit = false;
          for (const e of enemies) {
            if (e.dead || e.phased) continue;
            if (d.hitIds && d.hitIds.includes(e.id)) continue;
            
            const dist = Math.hypot(d.x - e.x, d.y - e.y);
            const hitRadius = d.large ? 38 : 30;
            if (Number.isFinite(dist) && dist < hitRadius) {
              const et = mimicEffType(e);
              if (et === 'tree_golem') {
                if (e.isVoid) {
                  e.hp -= upgrades.damage;
                  e.lastHit = Date.now();
                  if (e.hp <= 0) {
                    markEnemyDead(e, 'dart');
                    rootSpikes = rootSpikes.filter(root => root.ownerId !== e.id);
                  }
                } else {
                  markEnemyDead(e, 'dart');
                  rootSpikes = rootSpikes.filter(root => root.ownerId !== e.id);
                }
                darts.splice(i, 1);
                hit = true;
                break;
              }
              
              if (et === 'golem' || et === 'smoke_golem' || et === 'fire_golem') {
                darts.splice(i, 1);
                hit = true;
                break;
              }

              const levelA = pathLevel('dart', 'A');
              const levelB = pathLevel('dart', 'B');
              const subCd2 = subPathLevel('dart', 'C');
              const subDd2 = subPathLevel('dart', 'D');
              const dartW2 = progress.weapons.dart;
              const wasFullHp = e.hp === e.maxHp;

              let dmgDealt = upgrades.damage * upgrades.dartDamageMult;
              if (levelA >= 4 && wasFullHp) dmgDealt *= 2;
              if (e.cloudDamageAmp && e.cloudDamageAmp > 1) dmgDealt *= e.cloudDamageAmp;
              if (e.isVoid && e.type === 'archer') dmgDealt *= 0.5;
              // Eagle Eye: up to +200% damage the further this dart has traveled.
              if (d.eagleEye) {
                const traveledFrac = Math.min(1, traveled / d.maxRange);
                dmgDealt *= (1 + traveledFrac * 2);
              }
              // Headshot: a flat chance for an instant kill.
              if (d.headshotChance && Math.random() < d.headshotChance) dmgDealt = e.hp + 1;

              e.hp -= dmgDealt;
              e.lastHit = Date.now();

              if (levelA >= 3) {
                let poisonDmg = 1;
                if (dartW2.subPath === 'C' && subCd2 >= 10) poisonDmg += wSubRepeats('dart'); // Poison Damage (repeatable)
                let poisonDur = 3000;
                if (dartW2.subPath === 'C' && subCd2 >= 8) poisonDur *= 1.5; // Infection
                let tickRate = 500;
                if (dartW2.subPath === 'D' && subDd2 >= 6) tickRate = 250; // Venom
                if (dartW2.subPath === 'D' && subDd2 >= 10) tickRate = Math.max(100, tickRate - 25 * wSubRepeats('dart')); // Tick Speed (repeatable)
                e.poisonUntil = Math.max(e.poisonUntil || 0, Date.now() + poisonDur);
                e.poisonNextTick = Math.min(e.poisonNextTick || Infinity, Date.now() + tickRate);
                e.poisonTickRate = tickRate;
                e.poisonDmg = Math.max(e.poisonDmg || 0, poisonDmg);
                if (levelA >= 5) e.poisonTrail = true;
                if (dartW2.subPath === 'D' && subDd2 >= 8) e.poisonSlowed = true; // Neurotoxin
                if (dartW2.subPath === 'C' && subCd2 >= 6) e.poisonPlague = true; // Plague: spreads on tick
                if (dartW2.subPath === 'C' && subCd2 >= 7) e.poisonContagion = true; // Contagion: bigger spread radius
                if (dartW2.subPath === 'C' && subCd2 >= 9) e.poisonPandemic = true; // Pandemic: spreads on death
              }
              // Fatal Dose: instantly finish off poisoned enemies below 15% HP.
              if (dartW2.subPath === 'D' && subDd2 >= 9 && e.poisonUntil && Date.now() < e.poisonUntil && e.hp / e.maxHp <= 0.15) {
                e.hp = 0;
              }
              
              if (e.hp <= 0) {
                markEnemyDead(e, 'dart');
              } else if (levelB >= 3 && !d.broken) {
                // Chaos Volley: broken darts split into smaller darts on hit, bouncing in cardinal directions
                const cardinals = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];
                const numBroken = Math.min(totalDartsThrown(), 4);
                for (let s = 0; s < numBroken; s++) {
                  if (darts.length >= MAX_DARTS) break;
                  const dir = cardinals[s % cardinals.length];
                  darts.push({
                    x: e.x, y: e.y,
                    vx: dir.x * 1.5, vy: dir.y * 1.5,
                    startX: e.x, startY: e.y,
                    maxRange: upgrades.dartRange * 0.5,
                    large: false, boomerang: false, returning: false, broken: true,
                    hitIds: [e.id]
                  });
                }
              }
              
              d.hitIds.push(e.id);
              if (d.pierce) {
                hit = false; // keep flying, don't remove or break out of the enemy loop entirely
                continue;
              }
              darts.splice(i, 1);
              hit = true;
              break;
            }
          }
          if (hit) continue;
        }


        for (let i = enemyArrows.length - 1; i >= 0; i--) {
          const a = enemyArrows[i];
          a.x += a.vx; a.y += a.vy;
          if (a.x < -50 || a.x > 850 || a.y < -50 || a.y > 650) { enemyArrows.splice(i, 1); continue; }
          const dist = Math.hypot(a.x - player.x, a.y - player.y);
          if (dist < 30) {
            player.hp -= 10 * activeEvent.damageMult;
            honor = 0;
            enemyArrows.splice(i, 1);
            if (player.hp <= 0) {
              lastDeathInfo = { type: 'archer', damage: 10 * activeEvent.damageMult, metal: !!a.metal, size: null, method: 'arrow' };
              gameOver();
            }
          }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx; p.y += p.vy;
          if (Date.now() - p.start >= p.life) particles.splice(i, 1);
        }

        for (let i = voidGhostTrail.length - 1; i >= 0; i--) {
          if (Date.now() - voidGhostTrail[i].created > voidGhostTrail[i].life) voidGhostTrail.splice(i, 1);
        }
        if (voidGhostTrail.length) {
          for (const e of enemies) {
            if (e.dead || e.phased || e.ectoCoated) continue;
            for (const t of voidGhostTrail) {
              if (t.ownerId === e.id) continue;
              if (Math.hypot(e.x - t.x, e.y - t.y) < 18) {
                const bonus = Math.max(1, Math.ceil(e.maxHp * 0.3));
                e.maxHp += bonus;
                e.hp += bonus;
                e.ectoCoated = true;
                for (let k = 0; k < 8; k++) {
                  particles.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, size: 4, color: '#1e3a8a', start: Date.now(), life: 500 });
                }
                break;
              }
            }
          }
        }

        sweepDeadEnemies();

        updateUI();

        if (bullets.length > MAX_BULLETS * 2) bullets.length = MAX_BULLETS;
        if (darts.length > MAX_DARTS * 2) darts.length = MAX_DARTS;
        if (enemyArrows.length > 120) enemyArrows.length = 80;
        if (particles.length > 800) particles.splice(0, particles.length - 600);
      } catch (err) {
        bullets.length = Math.min(bullets.length, MAX_BULLETS);
        darts.length = Math.min(darts.length, MAX_DARTS);
      }
    }

    function createDefeatParticles(x, y, type) {
      let mainColor = '#2ecc71', altColor1 = '#27ae60', altColor2 = '#34eb77';
      if (type === 'bat') { mainColor = '#1a1a1a'; altColor1 = '#2a2a2a'; altColor2 = '#0a0a0a'; }
      else if (type === 'ghost') { mainColor = '#e8e8ff'; altColor1 = '#d0d0ff'; altColor2 = '#f0f0ff'; }
      else if (type === 'eye') { mainColor = '#8b00ff'; altColor1 = '#ffffff'; altColor2 = '#6a00cc'; }
      else if (type === 'archer') { mainColor = '#e8dcc8'; altColor1 = '#d4c8b0'; altColor2 = '#f0e4d0'; }
      else if (type === 'golem') { mainColor = '#5d4e37'; altColor1 = '#7d6e47'; altColor2 = '#4d3e27'; }
      else if (type === 'troll') { mainColor = '#6b8e4e'; altColor1 = '#4b5d3a'; altColor2 = '#8bab5e'; }

      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const speed = (2 + Math.random() * 2) * 0.25;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: (6 + Math.random() * 4) * 0.5, color: mainColor, start: Date.now(), life: 800 });
      }
      for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (1 + Math.random() * 3) * 0.25;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: (3 + Math.random() * 3) * 0.5, color: Math.random() > 0.5 ? altColor1 : altColor2, start: Date.now(), life: 600 });
      }
      clampParticles();
    }

    function drawRootSpike(root) {
      const now = Date.now();
      const age = now - root.spawnTime;
      const growthProgress = Math.min(age / 300, 1);

      const height = 20 * growthProgress;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(root.x - 8, root.y + 2, 16, 4);

      ctx.fillStyle = '#5d4037';
      ctx.fillRect(root.x - 6, root.y - height, 12, height + 2);

      ctx.fillStyle = '#3e2723';
      ctx.fillRect(root.x - 4, root.y - height - 4, 8, 4);
      ctx.fillRect(root.x - 2, root.y - height - 6, 4, 2);

      if (root.hp < root.maxHp) {
        ctx.fillStyle = '#2d1b3d';
        ctx.fillRect(root.x - 8, root.y - height - 10, 16, 3);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(root.x - 8, root.y - height - 10, 16 * (root.hp / root.maxHp), 3);
      }
    }

    function drawSmokeTrail(trail) {
      const now = Date.now();
      const age = now - trail.created;
      const alpha = Math.max(0, 1 - (age / 3000));
      
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = '#757575';
      ctx.fillRect(trail.x - 15, trail.y - 15, 30, 30);
      ctx.globalAlpha = 1;
    }

    function drawSmokeCloud(cloud) {
      const neon=shurikenCosmetic('shuriken-scholar_neon_smoke'),bone=boneSkin('smoke');ctx.globalAlpha = neon ? .55 : bone ? .42 : .28;
      ctx.fillStyle = bone?'#e9dfc8':neon?(Math.sin(game.frame*.12+cloud.x)>.0?'#00f5ff':'#ff39c8'):'#8899aa';
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
      ctx.fill();
      if(neon){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=15;ctx.stroke();ctx.shadowBlur=0;}
      ctx.globalAlpha = 1;
    }

    function drawPoisonPool(p) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#39ff6a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function draw() {
      const shake = getShakeOffset();
      ctx.save();
      ctx.translate(shake.x, shake.y);

      drawBackground();
      
      for (const e of enemies) {
        if ((e.type === 'smoke_golem' || (e.type === 'mimic' && e.mimicking === 'smoke_golem')) && e.smokeTrail) {
          e.smokeTrail.forEach(drawSmokeTrail);
        }
      }
      
      smokeClouds.forEach(drawSmokeCloud);
      poisonPools.forEach(drawPoisonPool);
      ectoplasmMarkers.forEach(drawEctoplasm);
      voidGhostTrail.forEach(drawVoidGhostTrail);
      voidLasers.forEach(drawVoidLaser);
      shadowTraps.forEach(drawShadowTrap);
      rootSpikes.forEach(drawRootSpike);
      healingOrbs.forEach(drawHealingOrb);
      trollFireballs.forEach(drawTrollFireball);
      arrowRainMarkers.forEach(drawArrowRainMarker);
      samuraiServants.forEach(drawServant);
      enemies.forEach(drawEnemy);
      bullets.forEach(drawBullet);
      darts.forEach(drawDart);
      naginataSpears.forEach(drawNaginataSpear);
      bowArrows.forEach(drawBowArrow);
      katanaSlashFX.forEach(drawKatanaSlash);
      shockwaves.forEach(drawShockwave);
      enemyArrows.forEach(drawEnemyArrow);
      particles.forEach(drawParticle);
      drawPlayer();
      ctx.restore();
    }

    function drawKatanaSlash(fx) {
      const now = Date.now();
      const t = (now - fx.created) / fx.life;
      if (t >= 1) return;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#e8e8ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.range * (0.4 + t * 0.6), fx.angle - fx.arc / 2, fx.angle + fx.arc / 2);
      ctx.stroke();

      // Sword blade sweeping through the slash arc
      const sweepT = Math.min(1, t / 0.7);
      const currentAngle = fx.angle - fx.arc / 2 + fx.arc * sweepT;
      const bladeRadius = fx.range * (0.5 + t * 0.5);
      const bx = fx.x + Math.cos(currentAngle) * bladeRadius;
      const by = fx.y + Math.sin(currentAngle) * bladeRadius;

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(currentAngle + Math.PI / 2);
      if(boneSkin('katana')){ctx.fillStyle='#eee8d4';ctx.fillRect(-4,-18,8,29);ctx.beginPath();ctx.arc(0,-18,6,0,Math.PI*2);ctx.arc(0,11,6,0,Math.PI*2);ctx.fill();ctx.restore();ctx.globalAlpha=1;return;}
      if(shurikenCosmetic('shuriken-scholar_academy_headband')){ctx.fillStyle='#2458a6';ctx.fillRect(-15,-11,30,22);ctx.fillStyle='#f7e9b7';ctx.fillRect(-12,-8,10,16);ctx.fillRect(2,-8,10,16);ctx.fillStyle='#ffd15c';ctx.fillRect(-2,-9,4,18);ctx.restore();ctx.globalAlpha=1;return;}
      ctx.fillStyle = '#f0f0ff';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(3, 5);
      ctx.lineTo(-3, 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#9a9ab0';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(-4, 5, 8, 3);
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(-2, 8, 4, 7);
      ctx.restore();

      ctx.globalAlpha = 1;
    }

    function drawShockwave(sw) {
      ctx.strokeStyle = 'rgba(255, 140, 0, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    function drawNaginataSpear(sp) {
      const angle = Math.atan2(sp.vy, sp.vx);
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(angle);
      if(boneSkin('naginata')){ctx.fillStyle='#eee8d4';ctx.fillRect(-20,-3,38,6);for(let x=-17;x<18;x+=8){ctx.fillStyle='#cfc7b2';ctx.fillRect(x,-5,3,10);}ctx.restore();return;}
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(-18, -2, 30, 4);
      ctx.fillStyle = '#d8d8e8';
      ctx.beginPath();
      ctx.moveTo(12, -5);
      ctx.lineTo(24, 0);
      ctx.lineTo(12, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawBowArrow(ar) {
      const angle = Math.atan2(ar.vy, ar.vx);
      ctx.save();
      ctx.translate(ar.x, ar.y);
      ctx.rotate(angle);
      if(boneSkin('bow')){ctx.fillStyle='#eee8d4';ctx.fillRect(-11,-3,19,6);ctx.beginPath();ctx.arc(-11,0,4,0,Math.PI*2);ctx.fill();ctx.restore();return;}
      ctx.strokeStyle = '#8b5a2b';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.fillStyle = ar.bleed ? '#c0392b' : '#c0c0c0';
      ctx.beginPath();
      ctx.moveTo(6, -3); ctx.lineTo(11, 0); ctx.lineTo(6, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawArrowRainMarker(m) {
      const now = Date.now();
      const t = (now - m.created) / m.fuse;
      ctx.strokeStyle = `rgba(255, 60, 60, ${0.8 - t * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 45 * t, 0, Math.PI * 2);
      ctx.stroke();
    }

    function drawServant(s) {
      const bob = Math.sin(Date.now() * 0.006) * 3;

      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#4a148c';
      ctx.beginPath();
      ctx.arc(s.originX, s.originY, s.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.globalAlpha = 0.85;
      if(boneSkin('servant')){ctx.fillStyle='#eee8d4';ctx.fillRect(s.x-10,s.y-18+bob,20,22);ctx.fillStyle='#15131a';ctx.fillRect(s.x-6,s.y-13+bob,4,4);ctx.fillRect(s.x+2,s.y-13+bob,4,4);ctx.globalAlpha=1;return;}
      shadedRect(s.x - 10, s.y - 18 + bob, 20, 24, '#4a148c');
      ctx.fillStyle = '#ce93d8';
      ctx.fillRect(s.x - 6, s.y - 14 + bob, 12, 6);
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(s.x - 4, s.y - 12 + bob, 3, 3);
      ctx.fillRect(s.x + 1, s.y - 12 + bob, 3, 3);
      ctx.globalAlpha = 1;
      if (s.maxHp > 1) {
        ctx.fillStyle = '#2d1b3d';
        ctx.fillRect(s.x - 12, s.y - 26 + bob, 24, 4);
        ctx.fillStyle = '#9b59b6';
        ctx.fillRect(s.x - 12, s.y - 26 + bob, 24 * (s.hp / s.maxHp), 4);
      }
    }

    function drawEctoplasm(m) {
      const now = Date.now();
      const remaining = 1 - (now - m.created) / m.fuse;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#c8ffd4';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 14, 0, Math.PI * 2 * (1 - remaining));
      ctx.lineTo(m.x, m.y);
      ctx.fill();
      ctx.strokeStyle = '#7fffb0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function drawVoidGhostTrail(t) {
      const now = Date.now();
      const remaining = 1 - (now - t.created) / t.life;
      if (remaining <= 0) return;
      ctx.globalAlpha = remaining * 0.5;
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawVoidLaser(l) {
      const now = Date.now();
      const alpha = Math.max(0, 1 - (now - l.created) / l.life);
      ctx.strokeStyle = `rgba(178, 102, 255, ${alpha})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
    }

    function drawTrollFireball(fb) {
      const grad = ctx.createRadialGradient(fb.x, fb.y, 1, fb.x, fb.y, 12);
      grad.addColorStop(0, '#fff59d');
      grad.addColorStop(0.5, '#ff9800');
      grad.addColorStop(1, '#d32f2f');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fb.x, fb.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawHealingOrb(orb) {
      const pulse = Math.sin(Date.now() * 0.008) * 0.2 + 0.8;
      ctx.globalAlpha = pulse;
      const grad = ctx.createRadialGradient(orb.x, orb.y, 1, orb.x, orb.y, 11);
      grad.addColorStop(0, '#c8ffd4');
      grad.addColorStop(1, '#2ecc71');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#145a32';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function gameLoop() {
      try{ update();
      draw();
      updateLevelBar();
      updateWeaponBars();
      // Reports whether the player is actively playing right now (not paused
      // for a quiz/menu/shop/game-over) so PlatformManager can track "active
      // play time" separately from total session time. Cheap - in-memory only.
      PlatformManager.heartbeat(GAME_CONFIG.id, game.active && !game.paused);
      requestAnimationFrame(gameLoop);

    } catch (err) {
        console.error("GAME LOOP CRASHED:", err);
    }
}

    function updateHomeStats() {
      const w = progress.weapons;
      const totalKills = ALL_WEAPON_KEYS.reduce((sum,key)=>sum+(w[key]?.kills||0),0);
      document.getElementById('homeTotalCoins').textContent = PlatformManager.getCoins();
      document.getElementById('homeTotalKills').textContent = totalKills;
      document.getElementById('homeBestLevel').textContent = progress.bestLevel||0;
      document.getElementById('homeCorrect').textContent = progress.questionsCorrect||0;
      document.getElementById('homeKillsShuriken').textContent = w.shuriken.kills;
      document.getElementById('homeKillsDart').textContent = w.dart.kills;
      document.getElementById('homeKillsSmoke').textContent = w.smoke.kills;
      document.getElementById('homeKillsTrap').textContent = w.trap.kills;
    }

    function updateLevelBar() {
      const expReq = getExpReq(player.level);
      const pct = Math.max(0, Math.min(100, (player.exp / expReq) * 100));
      document.getElementById('levelBarFill').style.width = pct + '%';
      document.getElementById('levelBarText').textContent = `Level ${player.level} — ${player.exp}/${expReq} XP`;
    }

    function setBarFill(id, pct) {
      const el = document.getElementById(id);
      el.style.width = pct + '%';
      if (pct >= 100) el.classList.add('ready'); else el.classList.remove('ready');
    }

    function updateWeaponBars() {
      const now = Date.now();

      if (player.character === 'samurai') {
        document.querySelector('#bar-shuriken .weapon-bar-label').textContent = '⚔️ Katana';
        document.getElementById('bar-shuriken').style.display = '';
        let cooldown = upgrades.katanaCooldown;
        if (pathLevel('katana', 'A') >= 1) cooldown *= 0.9;
        cooldown *= (1 - Math.min(0.2, honor * 0.02));
        setBarFill('fill-shuriken', Math.min(100, ((now - lastKatana) / cooldown) * 100));

        const naginataBar = document.getElementById('bar-dart');
        document.querySelector('#bar-dart .weapon-bar-label').textContent = '🗡️ Naginata';
        if (upgrades.naginataUnlocked) {
          naginataBar.style.display = '';
          setBarFill('fill-dart', Math.min(100, ((now - lastNaginata) / upgrades.naginataCooldown) * 100));
        } else {
          naginataBar.style.display = 'none';
        }

        const bowBar = document.getElementById('bar-smoke');
        document.querySelector('#bar-smoke .weapon-bar-label').textContent = '🏹 Bow';
        if (upgrades.bowUnlocked) {
          bowBar.style.display = '';
          setBarFill('fill-smoke', Math.min(100, ((now - lastBow) / upgrades.bowCooldown) * 100));
        } else {
          bowBar.style.display = 'none';
        }

        const servantBar = document.getElementById('bar-trap');
        document.querySelector('#bar-trap .weapon-bar-label').textContent = '👺 Servant';
        if (upgrades.servantUnlocked) {
          servantBar.style.display = '';
          setBarFill('fill-trap', Math.min(100, ((now - lastServant) / upgrades.servantCooldown) * 100));
        } else {
          servantBar.style.display = 'none';
        }
        return;
      }

      const barKeys=CHARACTER_WEAPON_KEYS[player.character]||NINJA_WEAPON_KEYS;
      document.querySelector('#bar-shuriken .weapon-bar-label').textContent = WEAPON_NAMES[barKeys[0]];
      document.querySelector('#bar-dart .weapon-bar-label').textContent = WEAPON_NAMES[barKeys[1]];
      document.querySelector('#bar-smoke .weapon-bar-label').textContent = WEAPON_NAMES[barKeys[2]];
      document.querySelector('#bar-trap .weapon-bar-label').textContent = WEAPON_NAMES[barKeys[3]];

      let shurikenPct;
      if (pathLevel('shuriken', 'B') >= 3) {
        shurikenPct = shurikenMag.capacity > 0 ? (shurikenMag.current / shurikenMag.capacity) * 100 : 0;
      } else {
        const dynamicCooldown = Math.min(upgrades.cooldown * 1.2, upgrades.cooldown + 120);
        shurikenPct = Math.min(100, ((now - lastShoot) / dynamicCooldown) * 100);
      }
      document.getElementById('bar-shuriken').style.display = '';
      setBarFill('fill-shuriken', shurikenPct);

      const dartBar = document.getElementById('bar-dart');
      if (upgrades.dartUnlocked) {
        dartBar.style.display = '';
        setBarFill('fill-dart', Math.min(100, ((now - lastDart) / upgrades.dartCooldown) * 100));
      } else {
        dartBar.style.display = 'none';
      }

      const smokeBar = document.getElementById('bar-smoke');
      if (upgrades.smokeUnlocked) {
        smokeBar.style.display = '';
        setBarFill('fill-smoke', Math.min(100, ((now - lastSmoke) / upgrades.smokeCooldown) * 100));
      } else {
        smokeBar.style.display = 'none';
      }

      const trapBar = document.getElementById('bar-trap');
      if (upgrades.shadowUnlocked) {
        trapBar.style.display = '';
        setBarFill('fill-trap', Math.min(100, ((now - lastShadow) / upgrades.shadowCooldown) * 100));
      } else {
        trapBar.style.display = 'none';
      }
    }

    function updateUI() {
      if(game.active&&!game.paused)window.ChallengeManager?.update?.({score:player.kills*100+player.level,wave:player.level,waveProgress:player.kills,alive:player.hp>0});
      const expReq = getExpReq(player.level);
      document.getElementById('hpText').textContent = `${Math.max(0, player.hp)}/${player.maxHp}`;
      document.getElementById('xpText').textContent = `${player.exp}/${expReq}`;
      document.getElementById('lvl').textContent = player.level;
      document.getElementById('kills').textContent = player.kills;
      document.getElementById('time').textContent = Math.floor(game.time / 1000);
      document.getElementById('coins').textContent = progress.runCoins;
      document.getElementById('run').textContent = progress.runNumber;
    }

    function checkLevelUp() {
      const expReq = getExpReq(player.level);
      if (player.exp >= expReq) {
        player.exp -= expReq;
        player.level++;
        progress.stageBestLevels[progress.selectedStage]=Math.max(progress.stageBestLevels[progress.selectedStage]||0,player.level);saveProgress();
        game.paused = true;
        showLevelUpText();
        updateUI();
        if (player.level % 10 === 0 && !bossMilestonesSpawned.has(player.level)) {
          bossMilestonesSpawned.add(player.level);
          spawnBoss(player.level);
        }
        setTimeout(() => { startQuiz(false); }, 500);
      }
    }

    // Weight cap for this game's adaptive difficulty is lower (8x) than the
    // shared default (16x) — passed explicitly to QuestionManager.recordAnswer().
    const QUESTION_WEIGHT_CAP = 8;

    // Persists the current in-memory weights (as tracked by QuestionManager)
    // back onto progress.questionWeights so they survive a refresh.
    function saveQuestionWeights() {
      progress.questionWeights = QuestionManager.getWeightsSnapshot();
    }

    let tacticalRethinkUsed=false;
    async function startQuiz(forPowerup) {
      game.paused = true;
      quiz.index = 0;
      quiz.correct = 0;
      quiz.forPowerup = forPowerup;
      quiz.usedQuestions = [];
      quiz.questionCount = activeEvent.doubleQuestions ? 8 : 4;
      tacticalRethinkUsed=false;
      if(window.MixedQuestionRound){
        const result=await MixedQuestionRound.play();
        quiz.correct=result.correct;quiz.questionCount=4;
        if(result.correct){progress.questionsCorrect=(progress.questionsCorrect||0)+result.correct;saveProgress();checkSamuraiUnlock();}
        const misses=4-result.correct;if(misses)PlatformManager.deductCoins(10*misses);
        showQuizResult();return;
      }
      document.getElementById('quizOverlay').classList.add('show');
      document.getElementById('quizResult').style.display = 'none';
      showQuestion();
    }

    function showQuestion() {
      if (quiz.index >= quiz.questionCount) { showQuizResult(); return; }
      const q = QuestionManager.getNextQuestion(false, quiz.usedQuestions);
      quiz.usedQuestions.push(q);
      quiz.currentQ = q;
      document.getElementById('quizNum').textContent = `Question ${quiz.index + 1}/${quiz.questionCount}`;
      document.getElementById('quizQ').textContent = q.q;

      const container = document.getElementById('quizOpts');
      container.innerHTML = '';
      q.a.map((opt, idx) => ({ text: opt, isCorrect: idx === q.c })).sort(() => Math.random() - 0.5).forEach(opt => {
        const btn = document.createElement('div');
        btn.className = 'option';
        btn.textContent = opt.text;
        btn.dataset.correct = String(opt.isCorrect);
        btn.onclick = () => answerQuestion(opt.isCorrect, btn);
        container.appendChild(btn);
      });
    }

    function answerQuestion(correct, btn) {
      const all = document.querySelectorAll('#quizOpts .option');
      all.forEach(o => o.classList.add('disabled'));
      if (quiz.currentQ) {
        QuestionManager.recordAnswer(quiz.currentQ, correct, { cap: QUESTION_WEIGHT_CAP });
        saveQuestionWeights();
      }
      PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, correct);
      if (!correct) PlatformManager.deductCoins(10);
      if (correct) {
        btn.classList.add('right');
        quiz.correct++;
        progress.questionsCorrect = (progress.questionsCorrect || 0) + 1;
        saveProgress();
        checkSamuraiUnlock();
      }
      else { btn.classList.add('wrong'); all.forEach(o=>{if(o.dataset.correct==='true')o.classList.add('right');}); saveProgress(); }
      const rethink=!correct&&!tacticalRethinkUsed&&window.AchievementManager?.hasBoost?.('shuriken-scholar_tactical_rethink');if(rethink){tacticalRethinkUsed=true;document.getElementById('quizNum').textContent='Tactical Rethink — replacement question';setTimeout(()=>showQuestion(),2000);}else setTimeout(() => { quiz.index++; showQuestion(); }, correct ? 1000 : 2000);
    }

    function showQuizResult() {
      document.getElementById('quizNum').textContent = 'Complete!';
      document.getElementById('quizQ').textContent = '';
      document.getElementById('quizOpts').innerHTML = '';
      const res = document.getElementById('quizResult');
      res.style.display = 'block';
      
      if (quiz.correct === 0) {
        res.innerHTML = `<div style="font-size: 24px; margin-bottom: 10px;">❌ 0 Questions Correct</div>
                         <div style="font-size: 18px; color: #e74c3c;">No powerups this time!</div>`;
        setTimeout(() => {
          document.getElementById('quizOverlay').classList.remove('show');
          if (quiz.forPowerup) { continueStartPhase(); } else { game.paused = false; }
        }, 1500);
        return;
      }
      
      const numOptions = quiz.correct;
      res.innerHTML = `<div style="font-size: 24px; margin-bottom: 10px;">✅ ${quiz.correct} Questions Correct!</div>
                       <div style="font-size: 18px; color: #00d4ff;">Choose 1 powerup from ${numOptions} options</div>`;
      
      setTimeout(() => {
        document.getElementById('quizOverlay').classList.remove('show');
        if (quiz.correct === quiz.questionCount) {
          const bonusOverlay = document.getElementById('bonusOverlay');
          document.getElementById('bonusName').textContent = "⚡ All Cooldowns -5%";
          bonusOverlay.classList.add('show');
          setTimeout(() => { bonusOverlay.classList.remove('show'); showUpgrades(numOptions, true); }, 1200);
        } else {
          showUpgrades(numOptions, false);
        }
      }, 900);
    }

    // Cursed Cards: always-available risk/reward picks. Each gives a real benefit
    // alongside a real cost. `cursed: true` flags them for distinct UI styling.
    function buildCursedCards() {
      const general = [
        { name: "🩸 Blood Pact", desc: "+25% weapon damage, but lose 1 HP on every kill", cursed: true, apply: () => {
          upgrades.shurikenDamageMult *= 1.25; upgrades.dartDamageMult *= 1.25; upgrades.smokeDamage = Math.ceil(upgrades.smokeDamage * 1.25);
          upgrades.shadowDamage = Math.ceil(upgrades.shadowDamage * 1.25); upgrades.katanaDamage = Math.ceil(upgrades.katanaDamage * 1.25);
          upgrades.naginataDamage = Math.ceil(upgrades.naginataDamage * 1.25); upgrades.bowDamage = Math.ceil(upgrades.bowDamage * 1.25);
          upgrades.servantDamage = Math.ceil(upgrades.servantDamage * 1.25);
          curseEffects.bloodPact = true;
        }},
        { name: "🪙 Sacrifice Toll", desc: "Lose half your current run coins, but gain +2 flat damage on every weapon", cursed: true, apply: () => {
          progress.runCoins = Math.floor(progress.runCoins / 2);
          upgrades.shurikenDamageMult += (2 / Math.max(1, upgrades.damage)); upgrades.dartDamageMult += (2 / Math.max(1, upgrades.damage));
          upgrades.smokeDamage += 2; upgrades.shadowDamage += 2; upgrades.katanaDamage += 2;
          upgrades.naginataDamage += 2; upgrades.bowDamage += 2; upgrades.servantDamage += 2;
        }},
        { name: "💰 Greed's Toll", desc: "+50% coins per kill, but enemies spawn 25% more often", cursed: true, apply: () => {
          curseEffects.coinMult *= 1.5; curseEffects.spawnRateMult *= 1.25;
        }},
        { name: "🗡️ Glass Edge", desc: "+40% weapon damage, but your max HP is halved this run", cursed: true, apply: () => {
          upgrades.shurikenDamageMult *= 1.4; upgrades.dartDamageMult *= 1.4; upgrades.smokeDamage = Math.ceil(upgrades.smokeDamage * 1.4);
          upgrades.shadowDamage = Math.ceil(upgrades.shadowDamage * 1.4); upgrades.katanaDamage = Math.ceil(upgrades.katanaDamage * 1.4);
          upgrades.naginataDamage = Math.ceil(upgrades.naginataDamage * 1.4); upgrades.bowDamage = Math.ceil(upgrades.bowDamage * 1.4);
          upgrades.servantDamage = Math.ceil(upgrades.servantDamage * 1.4);
          player.maxHp = Math.max(2, Math.floor(player.maxHp / 2));
          player.hp = Math.min(player.hp, player.maxHp);
          updateUI();
        }},
        { name: "🌑 Void Pact", desc: "Double the chance for enemies to spawn as void variants, but void enemies deal +20% more damage to you", cursed: true, apply: () => {
          curseEffects.voidChanceMult *= 2; curseEffects.voidDamageTakenMult *= 1.2;
        }},
        { name: "🔥 Overclock", desc: "+30% attack range, but all cooldowns 20% slower", cursed: true, apply: () => {
          upgrades.dartRange *= 1.3; upgrades.katanaRange *= 1.3; upgrades.naginataRange *= 1.3;
          upgrades.cooldown *= 1.2; upgrades.smokeCooldown *= 1.2; upgrades.shadowCooldown *= 1.2; upgrades.dartCooldown *= 1.2;
          upgrades.katanaCooldown *= 1.2; upgrades.naginataCooldown *= 1.2; upgrades.bowCooldown *= 1.2; upgrades.servantCooldown *= 1.2;
        }}
      ];

      if (player.character === 'samurai') {
        return general.concat([
          { name: "⚔️ Katana Mastery", desc: "Katana +50% damage, -30% cooldown. Naginata, Bow, and Servant all -25% damage", cursed: true, apply: () => {
            upgrades.katanaDamage = Math.ceil(upgrades.katanaDamage * 1.5); upgrades.katanaCooldown *= 0.7;
            upgrades.naginataDamage = Math.max(1, Math.ceil(upgrades.naginataDamage * 0.75));
            upgrades.bowDamage = Math.max(1, Math.ceil(upgrades.bowDamage * 0.75));
            upgrades.servantDamage = Math.max(1, Math.ceil(upgrades.servantDamage * 0.75));
          }},
          { name: "🔱 Naginata Fixation", desc: "Naginata +50% damage, -30% cooldown, +20% range. Katana, Bow, and Servant all -25% damage", cursed: true, apply: () => {
            upgrades.naginataDamage = Math.ceil(upgrades.naginataDamage * 1.5); upgrades.naginataCooldown *= 0.7; upgrades.naginataRange *= 1.2;
            upgrades.katanaDamage = Math.max(1, Math.ceil(upgrades.katanaDamage * 0.75));
            upgrades.bowDamage = Math.max(1, Math.ceil(upgrades.bowDamage * 0.75));
            upgrades.servantDamage = Math.max(1, Math.ceil(upgrades.servantDamage * 0.75));
          }},
          { name: "🏹 Bow Obsession", desc: "Bow +50% damage, -30% cooldown. Katana, Naginata, and Servant all -25% damage", cursed: true, apply: () => {
            upgrades.bowDamage = Math.ceil(upgrades.bowDamage * 1.5); upgrades.bowCooldown *= 0.7;
            upgrades.katanaDamage = Math.max(1, Math.ceil(upgrades.katanaDamage * 0.75));
            upgrades.naginataDamage = Math.max(1, Math.ceil(upgrades.naginataDamage * 0.75));
            upgrades.servantDamage = Math.max(1, Math.ceil(upgrades.servantDamage * 0.75));
          }},
          { name: "👻 Servant Fixation", desc: "Servant +50% damage, -30% cooldown, +20% lifetime. Katana, Naginata, and Bow all -25% damage", cursed: true, apply: () => {
            upgrades.servantDamage = Math.ceil(upgrades.servantDamage * 1.5); upgrades.servantCooldown *= 0.7; upgrades.servantLifetime *= 1.2;
            upgrades.katanaDamage = Math.max(1, Math.ceil(upgrades.katanaDamage * 0.75));
            upgrades.naginataDamage = Math.max(1, Math.ceil(upgrades.naginataDamage * 0.75));
            upgrades.bowDamage = Math.max(1, Math.ceil(upgrades.bowDamage * 0.75));
          }}
        ]);
      }

      return general.concat([
        { name: "🌟 Shuriken Mastery", desc: "Shuriken +50% damage, -30% cooldown. Dart, Smoke, and Shadow Trap all -25% damage", cursed: true, apply: () => {
          upgrades.shurikenDamageMult *= 1.5; upgrades.cooldown *= 0.7;
          upgrades.dartDamageMult *= 0.75;
          upgrades.smokeDamage = Math.max(1, Math.ceil(upgrades.smokeDamage * 0.75));
          upgrades.shadowDamage = Math.max(1, Math.ceil(upgrades.shadowDamage * 0.75));
        }},
        { name: "🎯 Dart Fixation", desc: "Dart +50% damage, -30% cooldown. Shuriken, Smoke, and Shadow Trap all -25% damage", cursed: true, apply: () => {
          upgrades.dartDamageMult *= 1.5; upgrades.dartCooldown *= 0.7;
          upgrades.shurikenDamageMult *= 0.75;
          upgrades.smokeDamage = Math.max(1, Math.ceil(upgrades.smokeDamage * 0.75));
          upgrades.shadowDamage = Math.max(1, Math.ceil(upgrades.shadowDamage * 0.75));
        }},
        { name: "💨 Smoke Obsession", desc: "Smoke +50% damage, -30% cooldown, +20% radius. Shuriken, Dart, and Shadow Trap all -25% damage", cursed: true, apply: () => {
          upgrades.smokeDamage = Math.ceil(upgrades.smokeDamage * 1.5); upgrades.smokeCooldown *= 0.7;
          upgrades.shurikenDamageMult *= 0.75; upgrades.dartDamageMult *= 0.75;
          upgrades.shadowDamage = Math.max(1, Math.ceil(upgrades.shadowDamage * 0.75));
        }},
        { name: "🕸️ Shadow Fixation", desc: "Shadow Trap +50% damage, -30% cooldown. Shuriken, Dart, and Smoke all -25% damage", cursed: true, apply: () => {
          upgrades.shadowDamage = Math.ceil(upgrades.shadowDamage * 1.5); upgrades.shadowCooldown *= 0.7;
          upgrades.shurikenDamageMult *= 0.75; upgrades.dartDamageMult *= 0.75;
          upgrades.smokeDamage = Math.max(1, Math.ceil(upgrades.smokeDamage * 0.75));
        }}
      ]);
    }

    function buildUpgradePool() {
      if (player.character === 'samurai') return buildSamuraiUpgradePool();

      const currentWeaponUpgrades = [{ name: "⚡ Fire Rate +10%", desc: "Throw shurikens faster", apply: () => { upgrades.cooldown *= 0.9; }}];
      if (player.hp < player.maxHp) {
        currentWeaponUpgrades.push({ name: "💚 Heal", desc: "Restore 1 HP", apply: () => { player.hp = Math.min(player.maxHp, player.hp + 1); updateUI(); }});
      }

      if (Math.random() < 0.5) {
        currentWeaponUpgrades.push({ name: "⚔️ Shuriken Damage +1", desc: "More damage per hit", apply: () => { upgrades.damage += 1; }});
      }

      if (upgrades.smokeUnlocked) {
        if (Math.random() < 0.5) currentWeaponUpgrades.push({name: "💨 Smoke Damage +1", desc: "Stronger smoke bombs", apply: () => { upgrades.smokeDamage += 1; }});
        currentWeaponUpgrades.push({name: "⚡ Smoke Speed +10%", desc: "Faster smoke bombs", apply: () => { upgrades.smokeCooldown *= 0.9; }});
      }

      if (upgrades.shadowUnlocked) {
        currentWeaponUpgrades.push({name: "🌑 Shadow Radius +10%", desc: "Larger explosion area", apply: () => { upgrades.shadowRadiusPicks++; upgrades.shadowRadius = applyLinearGrowth(BASE_SHADOW_RADIUS, upgrades.shadowRadiusPicks); }});
        if (Math.random() < 0.5) currentWeaponUpgrades.push({name: "💥 Shadow Damage +1", desc: "More trap damage", apply: () => { upgrades.shadowDamage += 1; }});
      }

      if (upgrades.dartUnlocked) {
        currentWeaponUpgrades.push({name: "🎯 Dart Amount +2", desc: "Fire more darts", apply: () => { upgrades.dartAmount += 2; }});
        currentWeaponUpgrades.push({name: "⚡ Dart Speed +10%", desc: "Fire darts more often", apply: () => { upgrades.dartCooldown *= 0.9; }});
      }

      const newWeaponUnlocks = [];
      if (!upgrades.smokeUnlocked) newWeaponUnlocks.push({name: "💣 UNLOCK Smoke Bomb", desc: "Auto-throw smoke every 4s", apply: () => { upgrades.smokeUnlocked = true; lastSmoke = Date.now(); }});
      if (!upgrades.shadowUnlocked) newWeaponUnlocks.push({name: "🌑 UNLOCK Shadow Trap", desc: "Click to place explosive trap (10s CD)", apply: () => { upgrades.shadowUnlocked = true; lastShadow = 0; shadowReady = true; }});
      if (!upgrades.dartUnlocked) newWeaponUnlocks.push({name: "🎯 UNLOCK Blow Dart", desc: "Auto-fire 2 darts every 3s", apply: () => { upgrades.dartUnlocked = true; upgrades.dartAmount = 2; lastDart = Date.now(); }});

      const result=[...currentWeaponUpgrades, ...newWeaponUnlocks, ...buildCursedCards()];
      const terms=player.character==='skeleton'?{Shuriken:'Bone Throw',shuriken:'bone',Dart:'Soul Orb',dart:'soul orb',Smoke:'Grave Mist',smoke:'grave mist',Shadow:'Ribcage',shadow:'ribcage'}:player.character==='paradox'?{Shuriken:'Rift Blade',shuriken:'rift blade',Dart:'Chrono Shard',dart:'chrono shard',Smoke:'Anomaly Field',smoke:'anomaly field',Shadow:'Echo Sigil',shadow:'echo sigil'}:null;
      if(terms)for(const up of result)for(const [from,to] of Object.entries(terms)){up.name=up.name.replaceAll(from,to);up.desc=up.desc.replaceAll(from,to);}
      return result;
    }

    function buildSamuraiUpgradePool() {
      const pool = [{ name: "⚔️ Katana Damage +1", desc: "More damage per slash", apply: () => { upgrades.katanaDamage += 1; }}];
      if (player.hp < player.maxHp) {
        pool.push({ name: "💚 Heal", desc: "Restore 1 HP", apply: () => { player.hp = Math.min(player.maxHp, player.hp + 1); updateUI(); }});
      }

      if (Math.random() < 0.5) {
        pool.push({ name: "⚡ Katana Speed +10%", desc: "Swing faster", apply: () => { upgrades.katanaCooldown *= 0.9; }});
      }

      if (upgrades.naginataUnlocked) {
        pool.push({name: "🗡️ Naginata Damage +1", desc: "More damage per sweep", apply: () => { upgrades.naginataDamage += 1; }});
        if (Math.random() < 0.5) pool.push({name: "⚡ Naginata Speed +10%", desc: "Sweep more often", apply: () => { upgrades.naginataCooldown *= 0.9; }});
      }

      if (upgrades.bowUnlocked) {
        pool.push({name: "🏹 Bow Damage +1", desc: "More damage per arrow", apply: () => { upgrades.bowDamage += 1; }});
        if (Math.random() < 0.5) pool.push({name: "⚡ Bow Speed +10%", desc: "Draw faster", apply: () => { upgrades.bowCooldown *= 0.9; }});
      }

      if (upgrades.servantUnlocked) {
        pool.push({name: "👺 Servant Damage +1", desc: "Spirit hits harder", apply: () => { upgrades.servantDamage += 1; }});
      }

      const unlocks = [];
      if (!upgrades.naginataUnlocked) unlocks.push({name: "🗡️ UNLOCK Naginata", desc: "Auto-sweep in a cardinal direction", apply: () => { upgrades.naginataUnlocked = true; lastNaginata = Date.now(); }});
      if (!upgrades.bowUnlocked) unlocks.push({name: "🏹 UNLOCK Bow", desc: "Auto-fire at a random enemy", apply: () => { upgrades.bowUnlocked = true; lastBow = Date.now(); }});
      if (!upgrades.servantUnlocked) unlocks.push({name: "👺 UNLOCK Summoned Servant", desc: "Click to summon a spirit guardian", apply: () => { upgrades.servantUnlocked = true; lastServant = 0; servantReady = true; }});

      return [...pool, ...unlocks, ...buildCursedCards()];
    }

    function grantRandomUpgrades(n) {
      const granted = [];
      for (let i = 0; i < n; i++) {
        const pool = buildUpgradePool();
        if (pool.length === 0) continue;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        pick.apply();
        granted.push(pick.name);
      }
      return granted;
    }

    function showUpgrades(numOptions = 1, hasBonus = false) {
      const allUpgrades = buildUpgradePool();

      if (hasBonus) {
        upgrades.cooldown *= 0.95;
        upgrades.dartCooldown *= 0.95;
        upgrades.shadowCooldown *= 0.95;
        upgrades.smokeCooldown *= 0.95;
      }

      const selectedUpgrades = [];
      const normalPool = allUpgrades.filter(u => !u.cursed);
      const cursedPool = allUpgrades.filter(u => u.cursed);
      const usedNames = new Set();

      for (let i = 0; i < numOptions; i++) {
        const wantCursed = Math.random() < 0.25 && cursedPool.length > 0;
        let sourcePool = wantCursed ? cursedPool : normalPool;
        let available = sourcePool.filter(u => !usedNames.has(u.name));
        if (available.length === 0) {
          // Fall back to the other pool if this one's exhausted (small option counts / few unlocks).
          available = (wantCursed ? normalPool : cursedPool).filter(u => !usedNames.has(u.name));
        }
        if (available.length === 0) break;
        const pick = available[Math.floor(Math.random() * available.length)];
        usedNames.add(pick.name);
        selectedUpgrades.push(pick);
      }

      const container = document.getElementById('upgradeOpts');
      container.innerHTML = '';
      
      const header = document.createElement('div');
      header.style.cssText = 'color: #00d4ff; font-size: 18px; margin-bottom: 15px; text-align: center;';
      header.textContent = `Choose 1 powerup`;
      container.appendChild(header);
      
      selectedUpgrades.forEach(up => {
        const div = document.createElement('div');
        div.className = up.cursed ? 'option cursed-card' : 'option';
        const cursedTag = up.cursed ? '<span style="float:right; color:#ff4444; font-size:12px; letter-spacing:1px;">⚠ CURSED</span>' : '';
        div.innerHTML = `<div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">${up.name}${cursedTag}</div><div style="color: ${up.cursed ? '#e8a8ff' : '#00d4ff'}; font-size: 14px;">${up.desc}</div>`;
        div.onclick = () => {
          up.apply();
          document.getElementById('upgradeOverlay').classList.remove('show');
          if (quiz.forPowerup) { continueStartPhase(); } else { game.paused = false; }
        };
        container.appendChild(div);
      });

      document.getElementById('upgradeOverlay').classList.add('show');
    }

    const WEAPON_ABILITY_INFO = {
      shuriken: {
        A: [
          { name: '⚡ Faster Shurikens', desc: 'Throw 10% faster' },
          { name: '🎯 Homing', desc: 'Shurikens slightly curve toward nearby enemies' },
          { name: '↩️ Ricochet', desc: 'Bounce to another enemy, losing half damage each bounce (despawns below 1 dmg)' },
          { name: '😵 Stun', desc: 'Non-lethal hits stun the enemy' },
          { name: '🥷 Shadow Master', desc: 'Shurikens pierce through enemies instead of stopping' }
        ],
        AC: [
          { name: '🎯 Weak Point', desc: '+100% damage against enemies above 75% HP' },
          { name: '⚔️ Execution', desc: 'The first enemy hit each throw takes +50% bonus damage' },
          { name: '❗ Assassin\'s Mark', desc: 'Enemies have a 10% chance to spawn Marked. Marked enemies take 150% damage' },
          { name: '💥 Death Blow', desc: 'Marked enemies explode on death, damaging nearby enemies' },
          { name: '🪒 Sharpen Blade', desc: 'Marked spawn chance +5% (repeatable)' }
        ],
        AD: [
          { name: '👻 Spectral Bounce', desc: '+1 ricochet bounce' },
          { name: '🩸 Ghost Chain', desc: 'Shurikens inflict bleed' },
          { name: '🎯 Seeking Spirits', desc: 'Ricochets home toward the nearest enemy instead of firing straight' },
          { name: '⛓️ Chain Reaction', desc: 'Bleed stacks instead of just refreshing' },
          { name: '🔄 Extra Bounce', desc: '+1 ricochet (repeatable)' }
        ],
        B: [
          { name: '➕ +1 Shuriken', desc: 'Throw an extra shuriken every shot' },
          { name: '📐 Wider Spread', desc: 'Shurikens fire in a wider spread' },
          { name: '🖱️ Manual Fire', desc: 'Click to throw from a magazine (2 base) instead of auto-firing' },
          { name: '🌀 Orbit', desc: 'Shurikens orbit you while waiting to be thrown' },
          { name: '🌪️ Blade Storm', desc: 'Throw +1 shuriken in the spread' }
        ],
        BC: [
          { name: '⚡ Endless Storm', desc: 'Shurikens travel 25% faster' },
          { name: '👜 Rapid Hands', desc: '+1 magazine size' },
          { name: '💥 Shuriken Burst', desc: '15% chance each throw to also fire a small spread burst' },
          { name: '🌀 Hurricane', desc: 'Every 10th shot fires a ring of shurikens in all directions' },
          { name: '⚡ Attack Speed', desc: '+5% fire rate (repeatable)' }
        ],
        BD: [
          { name: '🔙 Backshot', desc: 'Also fires one shuriken directly behind you' },
          { name: '🌀 Spinning Blade', desc: 'Shurikens spiral outward as they travel (1 revolution)' },
          { name: '🌀 Spiral Shot', desc: 'Spiral increases to 2 revolutions' },
          { name: '💿 Buzzsaw', desc: 'Shuriken size +50%' },
          { name: '🌀 Spiral Shot+', desc: '+1 spiral revolution (repeatable)' }
        ]
      },
      dart: {
        A: [
          { name: '🧭 Enemy Direction', desc: 'Darts prioritize the nearest enemies instead of random directions' },
          { name: '🔺 Sharper Tips', desc: 'Larger darts with a bigger hitbox' },
          { name: '☠️ Poison Darts', desc: 'Deals damage over time' },
          { name: '🎯 Deadly Precision', desc: 'Critical hits (2x damage) against full-health enemies' },
          { name: '☣️ Toxic Overload', desc: 'Poisoned enemies leave a damaging trail; poison damage increases' }
        ],
        AC: [
          { name: '🦠 Plague', desc: 'Poison spreads to nearby enemies on tick' },
          { name: '🌍 Contagion', desc: 'Poison spread radius increased' },
          { name: '☠️ Infection', desc: 'Poison lasts 50% longer' },
          { name: '💀 Pandemic', desc: 'Enemies that die while poisoned spread their poison outward' },
          { name: '☣️ Poison Damage', desc: '+1 poison damage (repeatable)' }
        ],
        AD: [
          { name: '🧪 Venom', desc: 'Poison ticks twice as fast' },
          { name: '📏 Long Shot', desc: '+10% dart range' },
          { name: '🧠 Neurotoxin', desc: 'Poisoned enemies are slowed' },
          { name: '⚰️ Fatal Dose', desc: 'Instantly defeats poisoned enemies below 15% HP' },
          { name: '⏱️ Tick Speed', desc: 'Poison ticks even faster (repeatable)' }
        ],
        B: [
          { name: '➕ +1 Dart', desc: 'Fire an extra dart' },
          { name: '⚡ Faster Fire Rate', desc: 'Darts fire more often' },
          { name: '💥 Broken Darts', desc: 'On hit, breaks into smaller darts that bounce off in cardinal directions' },
          { name: '🪃 Boomerang Darts', desc: 'Darts return toward you after reaching max range' },
          { name: '🎯 Piercing Dart', desc: 'Darts pierce through enemies instead of stopping' }
        ],
        BC: [
          { name: '🏹 Sharpshooter', desc: '+50% range, +50% cooldown' },
          { name: '🦅 Eagle Eye', desc: 'Up to +200% damage the further the dart has traveled' },
          { name: '🎯 Perfect Aim', desc: 'Darts have a larger hitbox' },
          { name: '💀 Headshot', desc: '5% chance for an instant kill' },
          { name: '📏 Range', desc: '+5% range (repeatable)' }
        ],
        BD: [
          { name: '⚡ Rapid Fire', desc: 'Fires 2 additional darts each volley' },
          { name: '🌧️ Volley', desc: '25% chance to fire a bonus burst of darts' },
          { name: '👥 Twin Shot', desc: 'Every dart fires as a pair' },
          { name: '🔫 Bullet Rain', desc: 'Occasionally sprays a continuous stream of darts toward the nearest enemy' },
          { name: '➕ Projectile Count', desc: '+1 dart every purchase (repeatable)' }
        ]
      },
      smoke: {
        A: [
          { name: '💨 Larger Explosion', desc: '+50% blast radius' },
          { name: '☁️ Lingering Smoke', desc: 'The cloud lingers for 2 seconds' },
          { name: '🐌 Debuff Cloud', desc: 'The cloud deals no damage, but halves enemy speed' },
          { name: '⚠️ Weakening Smoke', desc: 'Enemies in the cloud take +25% damage from all weapons' },
          { name: '🌫️ Dense Fog', desc: 'Cloud is larger and lasts 50% longer' }
        ],
        AC: [
          { name: '🪞 Mirage', desc: 'Enemies inside the cloud wander in random directions' },
          { name: '👤 Shadow Clone', desc: 'Enemies inside the cloud move 50% slower' },
          { name: '🌌 Teleport Mist', desc: 'Enemies inside the cloud deal 50% less damage' },
          { name: '👻 Phantom Realm', desc: 'The random wandering continues briefly after leaving the cloud' },
          { name: '☁️ Cloud Size', desc: '+5% smoke radius (repeatable)' }
        ],
        AD: [
          { name: '🩸 Smoke Blood', desc: 'Enemies that damage you have a chance to release a small smoke bomb on death' },
          { name: '🌫️ Lingering Mist', desc: 'Clouds last for 75% of the cooldown instead of a fixed duration' },
          { name: '😱 Fear Gas', desc: 'Enemies inside the cloud flee from you' },
          { name: '⚔️ Nightmare', desc: '10% chance per second for a feared enemy to attack the nearest other enemy instead' },
          { name: '🧬 Debuff Strength', desc: 'All smoke debuffs last 5% longer (repeatable)' }
        ],
        B: [
          { name: '⚡ Faster Recharge', desc: 'Smoke bomb recharges 10% faster' },
          { name: '💥 Bigger Blast', desc: '+30% blast radius' },
          { name: '⛓️ Chain Reaction', desc: 'Chance to spawn a smaller secondary bomb nearby' },
          { name: '💣 Double Detonation', desc: 'The explosion triggers twice' },
          { name: '☣️ Toxic Mist', desc: 'The cloud lingers, dealing damage equal to 50% of remaining HP over time instead of one hit' }
        ],
        BC: [
          { name: '☠️ Poison Cloud', desc: 'Enemies that survive the blast are poisoned' },
          { name: '💥 Cluster Bomb', desc: '+1 secondary bomb' },
          { name: '🧪 Decay Smoke', desc: 'Poison from this bomb stacks instead of refreshing' },
          { name: '💀 Death Fog', desc: 'Poisoned enemies explode on death (25% of the blast radius)' },
          { name: '💥 Smoke Damage', desc: '+5% damage and +10% radius (repeatable)' }
        ],
        BD: [
          { name: '🩸 Smoke Blood', desc: 'Enemies that hit you have a chance to spawn a small smoke bomb where they die' },
          { name: '🌫️ Lingering Mist', desc: 'The bomb deals no direct damage, but its cloud lasts much longer' },
          { name: '😱 Fear Gas', desc: 'Enemies inside the cloud flee' },
          { name: '👁️ Nightmare', desc: '2% chance per frame to inflict a random status effect on enemies inside the cloud' },
          { name: '🧬 Debuff Strength', desc: 'Status effects from this bomb last 5% longer (repeatable)' }
        ]
      },
      trap: {
        A: [
          { name: '⏱️ Delayed Explosion', desc: 'Arms slower, but its first hit deals 50% bonus damage' },
          { name: '🧲 Pulling Force', desc: 'Chance to pull nearby enemies toward the trap' },
          { name: '♻️ Respawning Trap', desc: '5% chance a kill leaves the trap behind, active' },
          { name: '💥 Larger Explosion', desc: '+10% splash radius' },
          { name: '💥 Dark Explosion', desc: 'Explosion damage increased' }
        ],
        AC: [
          { name: '💣 Minefield', desc: 'Spawns 2 small mini traps around the main trap when it triggers' },
          { name: '⛓️ Chain Blast', desc: 'Nearby traps also explode when this one does' },
          { name: '💥 Mega Blast', desc: '+25% explosion radius' },
          { name: '🔥 Inferno Trap', desc: 'Leaves burning ground that damages enemies standing on it' },
          { name: '💥 Explosion Damage', desc: '+5% explosion damage (repeatable)' }
        ],
        AD: [
          { name: '🌊 Shockwave', desc: 'The explosion knocks enemies back' },
          { name: '🌍 Earthquake', desc: 'Surviving enemies are stunned briefly' },
          { name: '💥 Aftershock', desc: 'Triggers a second, smaller explosion a moment later' },
          { name: '☄️ Cataclysm', desc: 'Every 5th trigger unleashes a massive area explosion' },
          { name: '📏 Blast Radius', desc: '+5% explosion radius (repeatable)' }
        ],
        B: [
          { name: '⏳ Longer Lifetime', desc: '+50% trap lifetime' },
          { name: '🍯 Sticky Tar', desc: 'Slows enemies touching the trap' },
          { name: '🦷 Steel Jaws', desc: 'Deals no direct damage, but causes bleed to anything entering it' },
          { name: '♾️ Persistent Trap', desc: "Doesn't despawn on a kill, only once its lifetime ends" },
          { name: '🪤 Snaring Trap', desc: 'Roots enemies that enter it briefly' }
        ],
        BC: [
          { name: '⛓️ Prison', desc: '+50% root duration' },
          { name: '🔗 Binding Chains', desc: 'Roots spread to nearby enemies' },
          { name: '💢 Crushing Grip', desc: 'Rooted enemies take +20% damage from all sources' },
          { name: '⚰️ Execution Ground', desc: 'Instantly defeats rooted enemies below 15% HP' },
          { name: '⏳ Root Duration', desc: '+5% root duration (repeatable)' }
        ],
        BD: [
          { name: '😱 Fear Trap', desc: 'Enemies flee when the trap triggers' },
          { name: '🌊 Panic', desc: 'Fear spreads to nearby enemies' },
          { name: '🤯 Chaos', desc: 'Feared enemies have a chance to attack the nearest other enemy' },
          { name: '👁️ Terror', desc: 'The trap causes fear in a much larger radius' },
          { name: '⏳ Fear Duration', desc: '+5% fear duration (repeatable)' }
        ]
      },
      katana: {
        A: [
          { name: '⚡ Faster Swing Speed', desc: 'Swing 10% faster' },
          { name: '📏 Longer Slash Range', desc: 'The slash reaches further' },
          { name: '🧲 Pulling Blade', desc: 'Nearby enemies just outside your slash are gently pulled toward the blade (minor effect)' },
          { name: '❗ Marked Foes', desc: 'Enemies can spawn marked; attacks deal double damage to them' },
          { name: '🥋 Master Swordsman', desc: '+1 slash per swing' }
        ],
        AC: [
          { name: '🩸 Vampire Blade', desc: 'Killing an enemy with the katana has a 15% chance to heal 1 HP' },
          { name: '🗡️ Long Blade', desc: '+15% slash range' },
          { name: '↔️ Further Slash', desc: '+15% slash arc' },
          { name: '❗ Marked Slash', desc: 'Marked enemies take triple damage instead of double' },
          { name: '🥋 Grandmaster', desc: '+1 slash per swing (repeatable)' }
        ],
        AD: [
          { name: '➡️ Thrusting Blade', desc: 'The attack becomes a forward thrust instead of a slash' },
          { name: '🗡️ Piercing Blade', desc: 'The thrust pierces through all enemies in its path' },
          { name: '📏 Longer Blade', desc: '+15% thrust range' },
          { name: '❗ Marked Pierce', desc: 'Marked enemies take triple damage instead of double' },
          { name: '⏱️ Cool Down', desc: 'Cooldown decreases by 5% (repeatable)' }
        ],
        B: [
          { name: '💪 +20% Damage', desc: 'Deal 20% more damage' },
          { name: '📐 Wider Swing Arc', desc: 'The slash covers a wider arc' },
          { name: '💥 Heavy Cleave', desc: 'Slashes knock surviving enemies backward' },
          { name: '🌊 Shockwave', desc: 'Killing an enemy sends a short shockwave forward' },
          { name: "⚡ Titan's Strength", desc: '+1 shockwave, each at a different angle' }
        ],
        BC: [
          { name: '💥 God Power', desc: 'Shockwaves knock back every enemy they pass through' },
          { name: '🌎 Unstable Ground', desc: 'Slashes leave a brief earthquake that slows enemies standing on it' },
          { name: "🔨 Thor's Hammer", desc: 'The slash becomes a lightning hammer strike' },
          { name: '⚡ Stunning Lightning', desc: 'The lightning hammer stuns enemies it hits' },
          { name: '⚡ Bouncing Force', desc: 'Lightning bounces to +1 additional enemy (repeatable)' }
        ],
        BD: [
          { name: '🩸 Cleaving Strike', desc: 'Heavy swings inflict bleed' },
          { name: "🪓 Executioner's Edge", desc: 'Bleeding enemies take +20% damage from all sources' },
          { name: '💢 Crushing Blow', desc: 'Heavy attacks have a chance to stun' },
          { name: '☠️ Blood Explosion', desc: 'Bleeding enemies explode on death, damaging nearby enemies' },
          { name: '🩸 Endless Carnage', desc: 'Bleed damage increases (repeatable)' }
        ]
      },
      naginata: {
        A: [
          { name: '🧭 Spear Sense', desc: 'Higher chance to sweep toward an enemy direction' },
          { name: '📏 Longer Reach', desc: 'The sweep reaches further' },
          { name: '🎯 Piercing Sweep', desc: 'The sweep continues through all enemies it hits' },
          { name: '♻️ Momentum', desc: 'Hitting 3+ enemies in one sweep refreshes part of the cooldown' },
          { name: '📈 Extended Reach', desc: '+10% range and +10% attack speed' }
        ],
        AC: [
          { name: '🐉 Dragon Fang', desc: 'Every 5th hit deals 3x damage' },
          { name: '🎯 Weak Point', desc: 'Critical hits (2x damage) against tougher enemies (more than 1 HP)' },
          { name: "⚔️ Lancer's Charge", desc: 'Attack speed increases by 20% when no enemies are nearby' },
          { name: '💀 Execution', desc: 'Instantly defeats enemies below 20% HP' },
          { name: '🔥 Dragon Soul', desc: 'Spear damage increases (repeatable)' }
        ],
        AD: [
          { name: '👻 Phantom Strike', desc: 'A delayed spear attack fires a moment after your throw' },
          { name: '🌫️ Afterimage', desc: 'The phantom strike hits twice' },
          { name: '💨 Swift Footing', desc: 'Landing a hit briefly boosts your movement speed' },
          { name: '⚡ Blink Assault', desc: 'Dash toward the nearest enemy just before attacking' },
          { name: '✨ Echo Spear', desc: '+10% chance for an extra phantom strike (repeatable)' }
        ],
        B: [
          { name: '➕ Twin Spears', desc: '2 spears launch at once, one from the opposite direction' },
          { name: '🌀 Spinning Strike', desc: 'The spear spins briefly on hit before disappearing' },
          { name: '🌪️ Spinning Assault', desc: 'Winds up with a full 360° spin around you before throwing' },
          { name: '🧲 Inward Pull', desc: 'The spin pulls nearby enemies slightly inward before striking' },
          { name: '⏱️ Longer Spin', desc: '+spin duration and hits' }
        ],
        BC: [
          { name: '🌪️ Larger Tornado', desc: '+20% spin radius' },
          { name: '💨 Vacuum Storm', desc: 'Pulls enemies in from much further away' },
          { name: '🪓 Razor Wind', desc: 'The spin deals damage continuously instead of once' },
          { name: '🌀 Endless Cyclone', desc: '+2 spin hit passes' },
          { name: '🌬️ Storm Force', desc: '+10% spin radius (repeatable)' }
        ],
        BD: [
          { name: '💥 Ground Slam', desc: 'The spin finishes with a heavy slam dealing bonus damage' },
          { name: '🪨 Cracked Earth', desc: 'The slam leaves cracks in the ground that damage enemies standing on them' },
          { name: '🌋 Eruption', desc: 'Cracks deal damage more frequently' },
          { name: '⛓️ Tremor Lock', desc: 'Enemies standing on cracks are rooted in place' },
          { name: '🌍 Larger Quake', desc: '+15% crack radius (repeatable)' }
        ]
      },
      bow: {
        A: [
          { name: '⚡ Faster Draw', desc: 'Draw and fire faster' },
          { name: '💨 Faster Arrows', desc: 'Arrows travel faster' },
          { name: '🎯 Piercing Arrow', desc: 'Arrows pierce through enemies and target the highest-HP enemy' },
          { name: '♾️ Infinite Pierce', desc: 'Arrows inflict bleed' },
          { name: '🩸 Deeper Wounds', desc: 'Bleed damage increases' }
        ],
        AC: [
          { name: '🎯 Precision Aim', desc: '+20% critical hit chance' },
          { name: '💥 Critical Shot', desc: 'Critical hits deal +75% bonus damage' },
          { name: '🦅 Eagle Eye', desc: 'Always targets the toughest enemy on screen (more than 1 HP)' },
          { name: '🏹 Deadly Accuracy', desc: 'Critical hits always land regardless of pierce count' },
          { name: '🎖️ Sharpshooter', desc: 'Critical damage bonus increases (repeatable)' }
        ],
        AD: [
          { name: '🩸 Toxic Arrows', desc: 'Bleeding enemies are also poisoned' },
          { name: '☠️ Venom Spread', desc: 'Poison spreads to nearby enemies' },
          { name: '🦠 Corrosive Venom', desc: 'Poisoned enemies take +15% damage from all sources' },
          { name: '💀 Lethal Infection', desc: '+50% poison duration' },
          { name: '☣️ Potent Venom', desc: 'Poison damage increases (repeatable)' }
        ],
        B: [
          { name: '➕ +1 Arrow', desc: 'Fire an extra arrow' },
          { name: '📐 Wider Spread', desc: 'Arrows fire in a wider spread' },
          { name: '🌦️ Arrow Volley', desc: 'Fires a fan of arrows' },
          { name: '☄️ Arrow Rain', desc: 'Arrows rain from the sky where the first arrow lands' },
          { name: '➕ More Arrows', desc: '+1 arrow fired' }
        ],
        BC: [
          { name: '🌧️ Larger Volley', desc: '+2 arrows in the fan' },
          { name: '⚡ Rapid Barrage', desc: 'Volleys fire 20% faster' },
          { name: '☄️ Meteor Rain', desc: 'Arrow rain explodes on impact, hitting a small area' },
          { name: '🌩️ Endless Rain', desc: 'A second arrow rain falls a moment later' },
          { name: '🏹 Endless Volley', desc: '+1 volley arrow (repeatable)' }
        ],
        BD: [
          { name: '↩️ Ricochet Arrow', desc: 'Arrows bounce off walls once' },
          { name: '🎯 Smart Bounce', desc: 'Bounces seek toward the nearest enemy' },
          { name: '💥 Explosive Bounce', desc: 'The final bounce explodes, damaging nearby enemies' },
          { name: '🧲 Magnetic Arrows', desc: 'Explosions pull enemies inward' },
          { name: '🔄 Extra Bounce', desc: '+1 ricochet (repeatable)' }
        ]
      },
      servant: {
        A: [
          { name: '📏 Extended Range', desc: 'The spirit attacks a larger radius around it' },
          { name: '⏳ Lingering Spirit', desc: 'Survives one extra kill before fading' },
          { name: '🛡️ Veteran Warrior', desc: 'Much higher health and a faster attack; healed by 1 on every kill' },
          { name: '🎖️ Veteran Training', desc: '+1 damage' },
          { name: '🎖️ Veteran Training+', desc: '+1 more damage' }
        ],
        AC: [
          { name: "⚔️ Champion's Blade", desc: '+40% attack damage' },
          { name: '🛡️ Iron Armour', desc: 'The spirit takes 30% less damage' },
          { name: '❤️ Battle Hardened', desc: 'Heals 2 HP on every kill instead of 1' },
          { name: '👑 Heroic Presence', desc: 'All active spirits gain +15% damage while 2 or more are out' },
          { name: '🏅 Legendary Warrior', desc: 'Damage increases further (repeatable)' }
        ],
        AD: [
          { name: '😡 Rage', desc: 'Attack speed increases the lower the spirit\'s HP is (up to +50%)' },
          { name: '🩸 Bloodlust', desc: 'Kills briefly grant +30% damage for 4 seconds' },
          { name: '🔥 Frenzy', desc: 'Bloodlust also grants +30% move speed' },
          { name: '💀 Last Stand', desc: 'When the spirit expires or dies, it unleashes one massive final attack' },
          { name: '⚔️ Endless Rage', desc: 'Bloodlust duration increases (repeatable)' }
        ],
        B: [
          { name: '⏱️ Reduced Cooldown', desc: 'Summon the spirit more often' },
          { name: '⏳ Longer Lifetime', desc: 'The spirit lasts longer before fading' },
          { name: '👥 Call Reinforcements', desc: 'Summons a second spirit' },
          { name: '🎯 Coordinated Targets', desc: 'Spirits spread out and target different enemies' },
          { name: '👥 More Reinforcements', desc: '+1 spirit' }
        ],
        BC: [
          { name: '👥 Larger Squad', desc: 'Summons +1 additional spirit' },
          { name: '🎯 Focus Fire', desc: 'All spirits focus the same toughest enemy' },
          { name: '📣 War Cry', desc: 'Newly summoned spirits grant nearby spirits +15% damage for 3s' },
          { name: '🏰 Shield Wall', desc: 'Spirits near each other take 20% less damage' },
          { name: '🪖 Endless Army', desc: '+1 additional spirit (repeatable)' }
        ],
        BD: [
          { name: '💀 Raise Fallen', desc: 'Defeated enemies have a 15% chance to rise as a temporary spirit' },
          { name: '👻 Restless Dead', desc: 'Raised spirits last twice as long' },
          { name: '☠️ Cursed Legion', desc: 'Raised spirits explode when they expire, damaging nearby enemies' },
          { name: '🕸️ Soul Chain', desc: 'The explosion also slows enemies caught in it' },
          { name: '⚰️ Greater Resurrection', desc: '+5% chance to raise fallen enemies (repeatable)' }
        ]
      }
    };

    // Secret characters have their own persistent mastery tracks. Their combat
    // roles intentionally mirror the four proven Ninja archetypes, while the
    // names and descriptions make each path character-specific.
    const themedWeaponCopy=(base,theme)=>Object.fromEntries(Object.entries(WEAPON_ABILITY_INFO[base]).map(([path,items])=>[path,items.map(item=>({
      name:`${theme.icon} ${theme.prefix} ${item.name.replace(/^\S+\s*/, '')}`,
      desc:item.desc.replace(/Shuriken/gi,theme.weapon).replace(/Dart/gi,theme.weapon).replace(/Smoke Bomb/gi,theme.weapon).replace(/Shadow Trap/gi,theme.weapon)
    }))]));
    const SECRET_WEAPON_THEMES={
      bone:['shuriken',{icon:'🦴',prefix:'Ossified',weapon:'Bone Throw'}],soulOrb:['dart',{icon:'👻',prefix:'Haunting',weapon:'Soul Orb'}],graveMist:['smoke',{icon:'☠️',prefix:'Graveborn',weapon:'Grave Mist'}],ribTrap:['trap',{icon:'🦴',prefix:'Crypt',weapon:'Ribcage Trap'}],
      riftBlade:['shuriken',{icon:'🌌',prefix:'Rift',weapon:'Rift Blade'}],chronoShard:['dart',{icon:'⏳',prefix:'Temporal',weapon:'Chrono Shard'}],anomalyField:['smoke',{icon:'🌐',prefix:'Unstable',weapon:'Anomaly Field'}],echoSigil:['trap',{icon:'🪞',prefix:'Echoing',weapon:'Echo Sigil'}]
    };
    for(const [key,[base,theme]] of Object.entries(SECRET_WEAPON_THEMES)) WEAPON_ABILITY_INFO[key]=themedWeaponCopy(base,theme);

    function renderShop() {
      const upgradesContainer = document.getElementById('shopItemsUpgrades');
      const powerupsContainer = document.getElementById('shopItemsPowerups');
      const stagesContainer = document.getElementById('shopItemsStages');
      let cosmeticsContainer = document.getElementById('shopItemsCosmetics');
      const nativeCosmetics=document.getElementById('arcade-native-cosmetics-panel');
      if(!cosmeticsContainer&&nativeCosmetics){const heading=document.createElement('h3');heading.textContent='🦴 Bone Arsenal';heading.style.color='#00d4ff';cosmeticsContainer=document.createElement('div');cosmeticsContainer.id='shopItemsCosmetics';nativeCosmetics.append(heading,cosmeticsContainer);}
      upgradesContainer.innerHTML = '';
      powerupsContainer.innerHTML = '';
      stagesContainer.innerHTML = '';
      if(cosmeticsContainer)cosmeticsContainer.innerHTML = '';

      const section1 = document.createElement('div');
      section1.innerHTML = '<h3 style="color: #00d4ff; margin: 5px 0 10px 0; font-size: clamp(16px,2.2vw,20px); font-family: \'Lexend\', sans-serif;">⭐ General Upgrades</h3>';
      upgradesContainer.appendChild(section1);

      addShopItem(upgradesContainer, {id: 'powerup', name: '⭐ Starting Powerups', desc: 'Choose powerups before run', base: 100, mult: 1.6, owned: progress.powerupStart, canBuy: true});

      if (progress.samuraiUnlocked||shurikenSecret('secret_skeleton')||shurikenSecret('secret_glitch_aura')) {
        const charDiv = document.createElement('div');
        charDiv.className = 'shop-item';
        charDiv.innerHTML = `
          <div class="shop-header"><div class="shop-name">Shop weapons for:</div></div>
          <button class="shop-btn" id="shopCharNinja" style="margin-bottom:6px;">${progress.selectedCharacter === 'ninja' ? '✅ ' : ''}🥷 Ninja</button>
          <button class="shop-btn" id="shopCharSamurai">${progress.selectedCharacter === 'samurai' ? '✅ ' : ''}⚔️ Samurai</button>
          ${shurikenSecret('secret_skeleton')?`<button class="shop-btn" id="shopCharSkeleton">${progress.selectedCharacter==='skeleton'?'✅ ':''}💀 Skeleton — Bone Path</button>`:''}
          ${shurikenSecret('secret_glitch_aura')?`<button class="shop-btn" id="shopCharParadox">${progress.selectedCharacter==='paradox'?'✅ ':''}🌀 Paradox Scholar — Mixed Arsenal</button>`:''}
        `;
        upgradesContainer.appendChild(charDiv);
        document.getElementById('shopCharNinja').onclick = () => { progress.selectedCharacter = 'ninja'; renderShop(); };
        document.getElementById('shopCharSamurai').onclick = () => { progress.selectedCharacter = 'samurai'; renderShop(); };
        if(document.getElementById('shopCharSkeleton'))document.getElementById('shopCharSkeleton').onclick=()=>{progress.selectedCharacter='skeleton';renderShop();};
        if(document.getElementById('shopCharParadox'))document.getElementById('shopCharParadox').onclick=()=>{progress.selectedCharacter='paradox';renderShop();};
      }

      const weaponKeys = CHARACTER_WEAPON_KEYS[progress.selectedCharacter]||NINJA_WEAPON_KEYS;
      for (const key of weaponKeys) {
        renderWeaponShopSection(upgradesContainer, key);
      }

      renderPowerupShopSection(powerupsContainer);

      for(const stageDef of STAGES){
        const owned=progress.ownedStages.includes(stageDef.id),previousBest=stageDef.previous?(progress.stageBestLevels[stageDef.previous]||0):15,eligible=previousBest>=15;
        const item=document.createElement('div');item.className='shop-item';
        item.innerHTML=`<div class="shop-header"><div class="shop-name">${stageDef.name}</div><div class="shop-cost">${owned?'OWNED':stageDef.cost+' 🪙'}</div></div><div class="shop-desc">${stageDef.desc}</div><div class="shop-owned">${stageDef.previous&&!eligible?`Reach Level 15 in ${STAGES.find(s=>s.id===stageDef.previous).name} (${previousBest}/15)`:owned?'Ready to play':'Stage requirement complete'}</div><button class="shop-btn" ${!owned&&!eligible?'disabled':''}>${progress.selectedStage===stageDef.id?'✅ Selected':owned?'Select':'Buy Stage'}</button>`;
        item.querySelector('button').onclick=()=>{if(owned){progress.selectedStage=stageDef.id;}else if(eligible&&PlatformManager.spendCoins(stageDef.cost)){progress.ownedStages.push(stageDef.id);progress.selectedStage=stageDef.id;}saveProgress();renderShop();};stagesContainer.appendChild(item);
      }
      if(cosmeticsContainer)for(const key of ALL_WEAPON_KEYS){const item=document.createElement('div');item.className='shop-item';const owned=boneSkin(key);item.innerHTML=`<div class="shop-header"><div class="shop-name">🦴 ${BONE_SKIN_NAMES[key]}</div><div class="shop-cost">${owned?'OWNED':'500 🪙'}</div></div><div class="shop-desc">Bone-themed replacement for ${WEAPON_NAMES[key]}; works for every compatible character.</div><button class="shop-btn" ${owned?'disabled':''}>${owned?'✅ Applied':'Buy Cosmetic'}</button>`;item.querySelector('button').onclick=()=>{if(!owned&&PlatformManager.spendCoins(500)){progress.boneWeaponSkins[key]=true;saveProgress();renderShop();}};cosmeticsContainer.appendChild(item);}

      document.getElementById('totalCoins').textContent = PlatformManager.getCoins();
    }

    function switchShopTab(tab) {
      document.querySelectorAll('.shop-tab-btn').forEach(btn => btn.classList.toggle('active-tab', btn.dataset.tab === tab));
      document.querySelectorAll('.shop-tab-content').forEach(el => {el.classList.remove('active');el.hidden=true;});
      const target=document.getElementById('shopTab' + tab.charAt(0).toUpperCase() + tab.slice(1));target.hidden=false;target.classList.add('active');
    }

    let shopReturnScreen = 'startOverlay';
    function showShop(fromScreen) {
      shopReturnScreen = fromScreen === 'gameover' ? 'gameOverOverlay' : 'startOverlay';
      document.getElementById(shopReturnScreen).classList.remove('show');
      renderShop();
      document.getElementById('shopOverlay').classList.add('show');
    }
    function closeShop() {
      document.getElementById('shopOverlay').classList.remove('show');
      document.getElementById(shopReturnScreen).classList.add('show');
      if (shopReturnScreen === 'startOverlay') updateHomeStats();
    }
    addEventListener('arcade-achievement-manager-ready',()=>{if(document.getElementById('shopOverlay')?.classList.contains('show'))renderShop();});

    // Decorative background: a few idle enemy sprites drifting behind the home screen,
    // reusing the same draw functions as gameplay (purely visual, no game-state impact).
    const homeBgCanvas = document.getElementById('homeBg');
    const homeBgCtx = homeBgCanvas ? homeBgCanvas.getContext('2d') : null;
    const homeBgEnemies = [
      { type: 'slime', x: 80, y: 120, vx: 0.4, vy: 0.15, anim: 0, hp: 1, maxHp: 1 },
      { type: 'bat', x: 480, y: 200, vx: -0.3, vy: 0.2, anim: 30, hp: 1, maxHp: 1 },
      { type: 'ghost', x: 260, y: 380, vx: 0.25, vy: -0.2, anim: 60, hp: 1, maxHp: 1 },
      { type: 'slime', x: 620, y: 460, vx: -0.35, vy: -0.15, anim: 90, hp: 1, maxHp: 1 },
      { type: 'eye', x: 160, y: 300, vx: 0.2, vy: 0.25, anim: 15, hp: 1, maxHp: 1 },
      { type: 'archer', x: 540, y: 100, vx: -0.25, vy: 0.18, anim: 45, hp: 1, maxHp: 1 },
      { type: 'troll', x: 380, y: 500, vx: 0.15, vy: -0.1, anim: 75, hp: 1, maxHp: 1 },
      { type: 'golem', x: 60, y: 420, vx: 0.22, vy: -0.18, anim: 20, hp: 1, maxHp: 1 },
      { type: 'tree_golem', x: 660, y: 300, vx: -0.18, vy: 0.22, anim: 50, hp: 1, maxHp: 1 },
      { type: 'smoke_golem', x: 220, y: 60, vx: 0.28, vy: 0.2, anim: 80, hp: 1, maxHp: 1 },
      { type: 'fire_golem', x: 440, y: 440, vx: -0.2, vy: -0.22, anim: 10, hp: 1, maxHp: 1 },
    ];
    function animateHomeBg() {
      if (!homeBgCtx || !document.getElementById('startOverlay').classList.contains('show')) {
        requestAnimationFrame(animateHomeBg);
        return;
      }
      homeBgCanvas.width = homeBgCanvas.clientWidth;
      homeBgCanvas.height = homeBgCanvas.clientHeight;
      const savedCtx = ctx;
      ctx = homeBgCtx;
      ctx.clearRect(0, 0, homeBgCanvas.width, homeBgCanvas.height);
      homeBgEnemies.forEach(e => {
        e.x += e.vx; e.y += e.vy; e.anim++;
        if (e.x < -40) e.x = homeBgCanvas.width + 40;
        if (e.x > homeBgCanvas.width + 40) e.x = -40;
        if (e.y < -40) e.y = homeBgCanvas.height + 40;
        if (e.y > homeBgCanvas.height + 40) e.y = -40;
        drawEnemy(e);
      });
      ctx = savedCtx;
      requestAnimationFrame(animateHomeBg);
    }
    animateHomeBg();

    function renderPowerupShopSection(container) {
      const section = document.createElement('div');
      section.innerHTML = '<h3 style="color: #d4af37; margin: 15px 0 10px 0; font-size: 20px;">🎲 Single-Use Powerups</h3>';
      container.appendChild(section);

      const maxChoices = 1 + Math.floor(progress.questionsCorrect / 100);
      const noteDiv = document.createElement('div');
      noteDiv.className = 'shop-item';
      noteDiv.innerHTML = `<div class="shop-desc">Pick up to <b>${maxChoices}</b> for your <b>next run only</b>. Each one starts that run with 4 bonus quiz questions — how many you get right decides how strong it is. Your picks reset once the run ends.</div>`;
      container.appendChild(noteDiv);

      for (const key in SINGLE_USE_POWERUPS) {
        const info = SINGLE_USE_POWERUPS[key];
        const div = document.createElement('div');
        div.className = 'shop-item';

        if (progress.questionsCorrect < info.unlockAt) {
          div.innerHTML = `
            <div class="shop-header"><div class="shop-name">🔒 ${info.name}</div></div>
            <div class="shop-desc">Unlocks at ${info.unlockAt} correct quiz answers (${Math.min(progress.questionsCorrect, info.unlockAt)}/${info.unlockAt})</div>
          `;
          container.appendChild(div);
          continue;
        }

        const selected = progress.selectedPowerups.includes(key);
        const atCap = progress.selectedPowerups.length >= maxChoices && !selected;
        div.innerHTML = `
          <div class="shop-header"><div class="shop-name">${info.name}</div></div>
          <div class="shop-desc">${info.desc}</div>
          <button class="shop-btn" id="pu_${key}" ${atCap ? 'disabled' : ''}>${selected ? '✅ Selected — click to unselect' : (atCap ? 'Selection full' : 'Select for next run')}</button>
        `;
        container.appendChild(div);
        document.getElementById(`pu_${key}`).onclick = () => togglePowerupSelection(key);
      }
    }

    function togglePowerupSelection(key) {
      const idx = progress.selectedPowerups.indexOf(key);
      if (idx >= 0) {
        progress.selectedPowerups.splice(idx, 1);
      } else {
        const maxChoices = 1 + Math.floor(progress.questionsCorrect / 100);
        if (progress.selectedPowerups.length >= maxChoices) return;
        progress.selectedPowerups.push(key);
      }
      renderShop();
    }

    function renderWeaponShopSection(container, key) {
      const w = progress.weapons[key];
      const section = document.createElement('div');
      section.innerHTML = `<h3 style="color: #d4af37; margin: 15px 0 10px 0; font-size: 20px;">${WEAPON_NAMES[key]}</h3>`;
      container.appendChild(section);

      if (!w.unlocked) {
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `
          <div class="shop-header">
            <div class="shop-name">🔒 Locked</div>
          </div>
          <div class="shop-desc">Kill ${WEAPON_UNLOCK_KILLS} enemies with this weapon in a run to permanently unlock starting with it. (${Math.min(w.kills, WEAPON_UNLOCK_KILLS)}/${WEAPON_UNLOCK_KILLS})</div>
        `;
        container.appendChild(div);
        return;
      }

      if (!w.path) {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'shop-item';
        noteDiv.style.cssText = 'border-color:#d4af37;';
        noteDiv.innerHTML = `
          <div class="shop-desc" style="color:#d4af37;">Levels 1 &amp; 2 can be bought freely in <b>either</b> path below to try them out — once bought, they stay active <b>forever</b>, even after you commit. Buying Level 3 in a path <b>locks that path in</b>; the other path just can't progress past Level 2 anymore.</div>
        `;
        container.appendChild(noteDiv);

        renderPathTrack(container, key, 'A', w.levelA);
        renderPathTrack(container, key, 'B', w.levelB);
        return;
      }

      // Path already committed — show a clear level-by-level checklist for that path.
      const abilities = WEAPON_ABILITY_INFO[key][w.path];
      const listDiv = document.createElement('div');
      listDiv.className = 'shop-item';
      let rows = '';
      for (let lvl = 1; lvl <= 5; lvl++) {
        const info = abilities[lvl - 1];
        const owned = w.level >= lvl;
        rows += `<div style="padding:3px 0; color:${owned ? '#2ecc71' : '#888'};">${owned ? '✅' : '⬜'} Lv${lvl}: ${info.name}</div>`;
      }
      listDiv.innerHTML = `
        <div class="shop-header">
          <div class="shop-name">Path ${w.path} — Level ${Math.min(w.level, 5)}</div>
        </div>
        ${rows}
      `;
      container.appendChild(listDiv);

      const otherPath = w.path === 'A' ? 'B' : 'A';
      const otherLevel = otherPath === 'A' ? Math.min(w.levelA, 2) : Math.min(w.levelB, 2);
      if (otherLevel > 0) {
        const otherAbilities = WEAPON_ABILITY_INFO[key][otherPath];
        let otherRows = '';
        for (let lvl = 1; lvl <= otherLevel; lvl++) {
          otherRows += `<div style="padding:3px 0; color:#2ecc71;">✅ Lv${lvl}: ${otherAbilities[lvl - 1].name}</div>`;
        }
        const otherDiv = document.createElement('div');
        otherDiv.className = 'shop-item';
        otherDiv.innerHTML = `
          <div class="shop-header">
            <div class="shop-name">Path ${otherPath} (still active, capped at Lv2)</div>
          </div>
          ${otherRows}
        `;
        container.appendChild(otherDiv);
      }

      if (w.level < 5) {
        const nextLevel = w.level + 1;
        const nextInfo = abilities[nextLevel - 1];
        const cost = weaponLevelCost(key, nextLevel, 0);
        const canAffordCoin = PlatformManager.getCoins() >= cost.coin;
        const hasKills = w.kills >= cost.kills;
        const canBuy = canAffordCoin && hasKills;

        const buyDiv = document.createElement('div');
        buyDiv.className = 'shop-item';
        buyDiv.innerHTML = `
          <div class="shop-header">
            <div class="shop-name">Next — Level ${nextLevel}: ${nextInfo.name}</div>
            <div class="shop-cost">🪙 ${cost.coin}</div>
          </div>
          <div class="shop-desc">${nextInfo.desc}</div>
          <div class="shop-desc" style="color:${hasKills ? '#2ecc71' : '#e74c3c'};">Kills with this weapon: ${w.kills}/${cost.kills}</div>
          <button class="shop-btn" id="buy_${key}_lvl" ${!canBuy ? 'disabled' : ''}>
            ${!hasKills ? 'Need More Kills' : !canAffordCoin ? 'Need More Coin' : 'Buy'}
          </button>
        `;
        container.appendChild(buyDiv);
        if (canBuy) document.getElementById(`buy_${key}_lvl`).onclick = () => buyWeaponLevel(key, cost.coin);
        return;
      }

      // Level 5 reached: the second branch (C/D) is now revealed.
      renderSubPathSection(container, key, w);
    }

    function renderSubPathSection(container, key, w) {
      if (!w.subPath) {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'shop-item';
        noteDiv.style.cssText = 'border-color:#d4af37;';
        noteDiv.innerHTML = `
          <div class="shop-desc" style="color:#d4af37;">🔓 A second branch has opened up. Level 6 can be bought freely in <b>either</b> branch below — once bought, it stays active <b>forever</b>. Buying Level 7 in a branch <b>locks it in</b>.</div>
        `;
        container.appendChild(noteDiv);

        renderSubPathTrack(container, key, 'C', w.levelC);
        renderSubPathTrack(container, key, 'D', w.levelD);
        return;
      }

      const abilities = WEAPON_ABILITY_INFO[key][w.path + w.subPath];
      const listDiv = document.createElement('div');
      listDiv.className = 'shop-item';
      let rows = '';
      for (let lvl = 6; lvl <= 10; lvl++) {
        const info = abilities[lvl - 6];
        if (lvl < 10) {
          const owned = w.level >= lvl;
          rows += `<div style="padding:3px 0; color:${owned ? '#2ecc71' : '#888'};">${owned ? '✅' : '⬜'} Lv${lvl}: ${info.name}</div>`;
        } else {
          const count = wSubRepeats(key);
          const owned = count > 0;
          rows += `<div style="padding:3px 0; color:${owned ? '#2ecc71' : '#888'};">${owned ? '✅' : '⬜'} Lv10+: ${info.name}${owned ? ` (x${count})` : ''}</div>`;
        }
      }
      listDiv.innerHTML = `
        <div class="shop-header">
          <div class="shop-name">Branch ${w.subPath} — Level ${w.level}${w.level >= 10 ? ` (+${wSubRepeats(key)})` : ''}</div>
        </div>
        ${rows}
      `;
      container.appendChild(listDiv);

      const nextLevel = w.level + 1;
      const nextLevelIdx = Math.min(nextLevel, 10);
      const nextInfo = abilities[nextLevelIdx - 6];
      const cost = nextLevel <= 9 ? weaponSubLevelCost(key, nextLevel) : weaponLevelCost(key, 10, w.subRepeatBuys);
      const canAffordCoin = PlatformManager.getCoins() >= cost.coin;
      const hasKills = w.kills >= cost.kills;
      const canBuy = canAffordCoin && hasKills;

      const buyDiv = document.createElement('div');
      buyDiv.className = 'shop-item';
      buyDiv.innerHTML = `
        <div class="shop-header">
          <div class="shop-name">Next — Level ${nextLevel}: ${nextInfo.name}</div>
          <div class="shop-cost">🪙 ${cost.coin}</div>
        </div>
        <div class="shop-desc">${nextInfo.desc}</div>
        <div class="shop-desc" style="color:${hasKills ? '#2ecc71' : '#e74c3c'};">Kills with this weapon: ${w.kills}/${cost.kills}</div>
        <button class="shop-btn" id="buy_${key}_sublvl" ${!canBuy ? 'disabled' : ''}>
          ${!hasKills ? 'Need More Kills' : !canAffordCoin ? 'Need More Coin' : 'Buy'}
        </button>
      `;
      container.appendChild(buyDiv);
      if (canBuy) document.getElementById(`buy_${key}_sublvl`).onclick = () => buyWeaponSubLevel(key, cost.coin);
    }

    function renderSubPathTrack(container, key, subpath, currentLevel) {
      const abilities = WEAPON_ABILITY_INFO[key][progress.weapons[key].path + subpath];
      const div = document.createElement('div');
      div.className = 'shop-item';

      let rows = '';
      const info = abilities[0]; // level 6 is the only pre-commit level in this branch
      const owned = currentLevel >= 1;
      rows += `<div style="padding:3px 0; color:${owned ? '#2ecc71' : '#888'};">${owned ? '✅' : '⬜'} Lv6: ${info.name} <span style="color:#aaa;">${info.desc}</span></div>`;

      const lockInfo = abilities[1]; // level 7 preview
      rows += `<div style="padding:6px 0 3px 0; color:#666; font-style:italic;">Locking in reveals Lv7: ${lockInfo.name}...</div>`;

      div.innerHTML = `<div class="shop-header"><div class="shop-name">Branch ${subpath}</div></div>${rows}`;
      container.appendChild(div);

      const w = progress.weapons[key];
      if (currentLevel < 1) {
        const cost = weaponSubLevelCost(key, 6);
        const canBuy = PlatformManager.getCoins() >= cost.coin;
        const btnDiv = document.createElement('div');
        btnDiv.className = 'shop-item';
        btnDiv.innerHTML = `
          <div class="shop-header"><div class="shop-name">Buy Lv6 in Branch ${subpath}</div><div class="shop-cost">🪙 ${cost.coin}</div></div>
          <button class="shop-btn" id="precommit_${key}_${subpath}" ${!canBuy ? 'disabled' : ''}>${!canBuy ? 'Need More Coin' : 'Buy'}</button>
        `;
        container.appendChild(btnDiv);
        if (canBuy) document.getElementById(`precommit_${key}_${subpath}`).onclick = () => buySubPreCommitLevel(key, subpath, cost.coin);
      } else {
        const cost = weaponSubLevelCost(key, 7);
        const canAffordCoin = PlatformManager.getCoins() >= cost.coin;
        const hasKills = w.kills >= cost.kills;
        const canBuy = canAffordCoin && hasKills;
        const lockDiv = document.createElement('div');
        lockDiv.className = 'shop-item';
        lockDiv.style.cssText = 'border-color:#e94560;';
        lockDiv.innerHTML = `
          <div class="shop-header"><div class="shop-name">🔒 Lock In Branch ${subpath} (Lv7: ${lockInfo.name})</div><div class="shop-cost">🪙 ${cost.coin}</div></div>
          <div class="shop-desc" style="color:${hasKills ? '#2ecc71' : '#e74c3c'};">Kills with this weapon: ${w.kills}/${cost.kills}</div>
          <button class="shop-btn" id="lock_${key}_${subpath}" ${!canBuy ? 'disabled' : ''}>
            ${!hasKills ? 'Need More Kills' : !canAffordCoin ? 'Need More Coin' : `Lock In Branch ${subpath}`}
          </button>
        `;
        container.appendChild(lockDiv);
        if (canBuy) document.getElementById(`lock_${key}_${subpath}`).onclick = () => chooseWeaponSubPath(key, subpath, cost.coin);
      }
    }

    function renderPathTrack(container, key, path, currentLevel) {
      const abilities = WEAPON_ABILITY_INFO[key][path];
      const div = document.createElement('div');
      div.className = 'shop-item';

      let rows = '';
      for (let lvl = 1; lvl <= 2; lvl++) {
        const info = abilities[lvl - 1];
        const owned = currentLevel >= lvl;
        rows += `<div style="padding:3px 0; color:${owned ? '#2ecc71' : '#ccc'};">${owned ? '✅' : '⬜'} Lv${lvl}: ${info.name} <span style="color:#888;">— ${info.desc}</span></div>`;
      }

      div.innerHTML = `<div class="shop-header"><div class="shop-name">Path ${path}${currentLevel > 0 ? ` (Lv${currentLevel})` : ''}</div></div>${rows}`;
      container.appendChild(div);

      if (currentLevel < 2) {
        const nextLevel = currentLevel + 1;
        const cost = weaponLevelCost(key, nextLevel, 0);
        const canAfford = PlatformManager.getCoins() >= cost.coin;
        const buyDiv = document.createElement('div');
        buyDiv.className = 'shop-item';
        buyDiv.innerHTML = `
          <div class="shop-header">
            <div class="shop-name">Buy Path ${path} Lv${nextLevel}</div>
            <div class="shop-cost">🪙 ${cost.coin}</div>
          </div>
          <button class="shop-btn" id="buy_${key}_${path}_pre" ${!canAfford ? 'disabled' : ''}>${canAfford ? 'Buy' : 'Need More Coin'}</button>
        `;
        container.appendChild(buyDiv);
        if (canAfford) document.getElementById(`buy_${key}_${path}_pre`).onclick = () => buyPreCommitLevel(key, path, cost.coin);
      } else {
        const cost = weaponLevelCost(key, 3, 0);
        const canAffordCoin = PlatformManager.getCoins() >= cost.coin;
        const w = progress.weapons[key];
        const hasKills = w.kills >= cost.kills;
        const canBuy = canAffordCoin && hasKills;
        const lockDiv = document.createElement('div');
        lockDiv.className = 'shop-item';
        lockDiv.style.cssText = 'border-color:#e67e22;';
        lockDiv.innerHTML = `
          <div class="shop-header">
            <div class="shop-name">🔒 Lock in Path ${path} — Level 3: ${abilities[2].name}</div>
            <div class="shop-cost">🪙 ${cost.coin}</div>
          </div>
          <div class="shop-desc">${abilities[2].desc}</div>
          <div class="shop-desc" style="color:${hasKills ? '#2ecc71' : '#e74c3c'};">Kills with this weapon: ${w.kills}/${cost.kills}</div>
          <button class="shop-btn" id="lock_${key}_${path}" ${!canBuy ? 'disabled' : ''}>
            ${!hasKills ? 'Need More Kills' : !canAffordCoin ? 'Need More Coin' : `Lock In Path ${path}`}
          </button>
        `;
        container.appendChild(lockDiv);
        if (canBuy) document.getElementById(`lock_${key}_${path}`).onclick = () => chooseWeaponPath(key, path, cost.coin);
      }
    }

    function buyPreCommitLevel(key, path, cost) {
      if (!PlatformManager.spendCoins(cost)) return;
      const w = progress.weapons[key];
      if (path === 'A') w.levelA++; else w.levelB++;
      if (SAMURAI_WEAPON_KEYS.includes(key)) samuraiUpgradesPurchased++; else ninjaUpgradesPurchased++;
      saveProgress();
      renderShop();
      updateUI();
    }

    function chooseWeaponPath(key, path, cost) {
      if (!PlatformManager.spendCoins(cost)) return;
      const w = progress.weapons[key];
      w.path = path;
      w.level = 3;
      if (SAMURAI_WEAPON_KEYS.includes(key)) samuraiUpgradesPurchased++; else ninjaUpgradesPurchased++;
      saveProgress();
      renderShop();
      updateUI();
    }

    function buyWeaponLevel(key, cost) {
      const w = progress.weapons[key];
      if (w.level >= 5) return; // level 5 no longer stacks - branch into C/D instead
      if (!PlatformManager.spendCoins(cost)) return;
      w.level++;
      if (SAMURAI_WEAPON_KEYS.includes(key)) samuraiUpgradesPurchased++; else ninjaUpgradesPurchased++;
      saveProgress();
      renderShop();
      updateUI();
    }

    // Level 6 pre-commit buy, available in either sub-path once level 5 is owned.
    function buySubPreCommitLevel(key, subpath, cost) {
      const w = progress.weapons[key];
      if (!w.path || w.level < 5 || w.subPath) return;
      if (!PlatformManager.spendCoins(cost)) return;
      if (subpath === 'C') w.levelC++; else w.levelD++;
      if (SAMURAI_WEAPON_KEYS.includes(key)) samuraiUpgradesPurchased++; else ninjaUpgradesPurchased++;
      saveProgress();
      renderShop();
      updateUI();
    }

    // Locking in sub-path C or D: mirrors chooseWeaponPath, jumps straight to level 7.
    function chooseWeaponSubPath(key, subpath, cost) {
      const w = progress.weapons[key];
      if (!w.path || w.level < 5 || w.subPath) return;
      if (!PlatformManager.spendCoins(cost)) return;
      w.subPath = subpath;
      w.level = 7;
      if (SAMURAI_WEAPON_KEYS.includes(key)) samuraiUpgradesPurchased++; else ninjaUpgradesPurchased++;
      saveProgress();
      renderShop();
      updateUI();
    }

    // Levels 8-9 buy normally; level 10+ becomes the new repeatable stacking tier.
    function buyWeaponSubLevel(key, cost) {
      const w = progress.weapons[key];
      if (!w.subPath) return;
      if (!PlatformManager.spendCoins(cost)) return;
      w.level++;
      if (w.level >= 10) w.subRepeatBuys++;
      if (SAMURAI_WEAPON_KEYS.includes(key)) samuraiUpgradesPurchased++; else ninjaUpgradesPurchased++;
      saveProgress();
      renderShop();
      updateUI();
    }
    
    function addShopItem(container, item) {
      const cost = PlatformManager.permanentUpgradeCost(item.owned);
      const canAfford = PlatformManager.getCoins() >= cost;
      const canBuy = canAfford && item.canBuy;

      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <div class="shop-header">
          <div class="shop-name">${item.name}</div>
          <div class="shop-cost">🪙 ${cost}</div>
        </div>
        <div class="shop-desc">${item.desc}</div>
        ${item.owned > 0 ? `<div class="shop-owned">Level: ${item.owned}</div>` : ''}
        <button class="shop-btn" id="buy_${item.id}" ${!canBuy ? 'disabled' : ''}>
          ${!item.canBuy ? 'Max' : canAfford ? 'Buy' : 'Need More'}
        </button>
      `;
      container.appendChild(div);

      const btn = document.getElementById(`buy_${item.id}`);
      if (canBuy) btn.onclick = () => buyItem(item.id, cost);
    }

    function buyItem(id, cost) {
      if (!PlatformManager.spendCoins(cost)) return;

      if (id === 'powerup') progress.powerupStart++;

      saveProgress();
      renderShop();
      updateUI();
    }

    function gameOver() {
      PlatformManager.endPracticeRun();
      game.active = false;
      window.ChallengeManager?.finish?.({score:player.kills*100+player.level,wave:player.level,waveProgress:player.kills,alive:false});
      game.paused = true;
      progress.deaths++;

      const wipe = document.getElementById('screenWipe');
      wipe.classList.add('wipe');

      setTimeout(() => {
        const coinResult = PlatformManager.settleAccuracyCoins(GAME_CONFIG.id, progress.runCoins);
        progress.bestLevel = Math.max(progress.bestLevel||0, player.level);
        progress.stageBestLevels[progress.selectedStage]=Math.max(progress.stageBestLevels[progress.selectedStage]||0,player.level);
        PlatformManager.setHighScore(GAME_CONFIG.id, progress.bestLevel);
        saveProgress();

        document.getElementById('finalLvl').textContent = player.level;
        document.getElementById('finalKills').textContent = player.kills;
        document.getElementById('finalTime').textContent = Math.floor(game.time / 1000);
        document.getElementById('finalCoins').textContent = `${coinResult.coinsAwarded} (${coinResult.accuracyPercent}% accuracy; ${progress.runCoins} raw)`;
        document.getElementById('deathCause').textContent = getDeathMessage(lastDeathInfo);

        document.getElementById('gameOverOverlay').classList.add('show');

        wipe.classList.remove('wipe');
      }, 750);
    }

    function reset() {
      const stageName=STAGES.find(s=>s.id===progress.selectedStage)?.name||'Training Grounds';const enemyLine=document.getElementById('enemyLine');if(enemyLine)enemyLine.textContent=`⚔️ Stage: ${stageName}`;
      lastDeathInfo = null;
      runPowerupEffects = { killValueMult: 1, coinBonusPerKill: 0 };
      player.x = 400; player.y = 300;
      player.facingAngle = 0;
      samuraiWalkTargetX = 400; samuraiWalkTargetY = 300;
      player.hp = 100; player.maxHp = 100;
      player.level = 1; player.exp = 0; player.kills = 0;
      player.character = progress.selectedCharacter==='skeleton'&&shurikenSecret('secret_skeleton')?'skeleton':progress.selectedCharacter==='paradox'&&shurikenSecret('secret_glitch_aura')?'paradox':progress.selectedCharacter === 'samurai' && progress.samuraiUnlocked ? 'samurai' : 'ninja';
      if(player.character==='skeleton'){player.maxHp=50;player.hp=50;}
      if(player.character==='paradox'){player.maxHp=70;player.hp=70;}

      enemies = []; bullets = []; particles = []; enemyArrows = []; shadowTraps = []; darts = []; rootSpikes = [];
      smokeClouds = []; poisonPools = [];
      healingOrbs = []; trollFireballs = []; ectoplasmMarkers = []; voidLasers = []; voidGhostTrail = [];
      katanaSlashFX = []; shockwaves = []; naginataSpears = []; bowArrows = []; arrowRainMarkers = []; samuraiServants = []; earthquakeZones = []; crackedEarthZones = []; naginataHitCounter = 0; shurikenShotCounter = 0; toxicMistPools = []; trapTriggerCounter = 0;
      honor = 0;
      bossMilestonesSpawned = new Set();
      activeBossId = null;
      nextEnemyId = 1;
      nextRootId = 1;

      game.time = 0; game.frame = 0;
      lastShoot = 0; lastSmoke = 0; lastShadow = 0; lastDart = 0;
      lastKatana = 0; lastNaginata = 0; lastBow = 0; lastServant = 0;
      shadowReady = true; servantReady = true;
      targetX = 401; targetY = 300;
      secretWorldX=0;secretWorldY=0;

      upgrades.projSpeed = 5;
      upgrades.damage = 1;
      upgrades.cooldown = 900;
      if(player.character==='paradox')upgrades.cooldown*=.72;
      if (pathLevel('shuriken', 'A') >= 1) upgrades.cooldown *= 0.9;

      upgrades.smokeUnlocked = wUnlocked('smoke');
      upgrades.smokeDamage = 1;
      upgrades.smokeCooldown = 4000;
      if (pathLevel('smoke', 'B') >= 1) upgrades.smokeCooldown *= 0.9;

      upgrades.shadowUnlocked = wUnlocked('trap');
      upgrades.shadowDamage = 2;
      upgrades.shadowRadius = 100;
      upgrades.shadowCooldown = 10000;
      upgrades.shadowRadiusPicks = 0;
      upgrades.shurikenDamageMult = 1;
      upgrades.dartDamageMult = 1;
      curseEffects = { bloodPact: false, coinMult: 1, spawnRateMult: 1, voidChanceMult: 1, voidDamageTakenMult: 1 };

      upgrades.dartUnlocked = wUnlocked('dart');
      upgrades.dartAmount = 2;
      upgrades.dartRange = 120;
      upgrades.dartCooldown = 3000;
      if (pathLevel('dart', 'B') >= 2) upgrades.dartCooldown *= 0.9;

      shurikenMag.capacity = 2 + wRepeats('shuriken');
      shurikenMag.current = shurikenMag.capacity;
      shurikenMag.lastRegen = Date.now();

      upgrades.katanaCooldown = 900;
      upgrades.katanaDamage = 3;
      upgrades.katanaRange = 105;
      upgrades.katanaArc = 70;

      upgrades.naginataUnlocked = wUnlocked('naginata');
      upgrades.naginataCooldown = 1600;
      upgrades.naginataDamage = 3;
      upgrades.naginataRange = 160;
      upgrades.naginataSpeed = 3;

      upgrades.bowUnlocked = wUnlocked('bow');
      upgrades.bowCooldown = 2600;
      upgrades.bowDamage = 2;
      upgrades.bowSpeed = 4.5;

      upgrades.servantUnlocked = wUnlocked('servant');
      upgrades.servantDamage = 1;
      upgrades.servantCooldown = 8000;
      if (pathLevel('servant', 'B') >= 1) upgrades.servantCooldown *= 0.85;
      upgrades.servantLifetime = 15000;

      progress.runCoins = 10;

      updateUI();
      document.getElementById('gameOverOverlay').classList.remove('show');
      game.active = true;
      game.paused = false;
    }

    function showRandomEventThenStart() {
      const message = rollRandomEvent();
      if (message) {
        game.paused = true;
        document.getElementById('eventMessage').textContent = message;
        document.getElementById('eventOverlay').classList.add('show');
      } else {
        beginSingleUsePowerupQuizzes();
      }
    }

    document.getElementById('eventContinueBtn').addEventListener('click', () => {
      document.getElementById('eventOverlay').classList.remove('show');
      beginSingleUsePowerupQuizzes();
    });

    let powerupQuizQueue = [];
    let powerupQuizState = { key: null, index: 0, correct: 0, questionCount: 4 };

    function beginSingleUsePowerupQuizzes() {
      powerupQuizQueue = PlatformManager.powerupsAllowed() ? progress.selectedPowerups.slice() : [];
      progress.selectedPowerups = []; // must be re-selected in the shop for each future run
      runNextPowerupUnlockQuiz();
    }

    function runNextPowerupUnlockQuiz() {
      if (powerupQuizQueue.length === 0 || !QuestionManager.hasQuestions()) {
        startPowerupPhase();
        return;
      }
      const key = powerupQuizQueue.shift();
      powerupQuizState = { key, index: 0, correct: 0, questionCount: 4 };
      game.paused = true;
      document.getElementById('quizResult').style.display = 'none';
      document.getElementById('quizOverlay').classList.add('show');
      showPowerupUnlockQuestion();
    }

    function showPowerupUnlockQuestion() {
      if (powerupQuizState.index >= powerupQuizState.questionCount) { finishPowerupUnlockQuiz(); return; }
      const q = QuestionManager.getNextQuestion();
      powerupQuizState.currentQ = q;
      const info = SINGLE_USE_POWERUPS[powerupQuizState.key];
      document.getElementById('quizNum').textContent = `${info.name} — Q${powerupQuizState.index + 1}/${powerupQuizState.questionCount}`;
      document.getElementById('quizQ').textContent = q.q;

      const container = document.getElementById('quizOpts');
      container.innerHTML = '';
      q.a.map((opt, idx) => ({ text: opt, isCorrect: idx === q.c })).sort(() => Math.random() - 0.5).forEach(opt => {
        const btn = document.createElement('div');
        btn.className = 'option';
        btn.textContent = opt.text;
        btn.dataset.correct = String(opt.isCorrect);
        btn.onclick = () => answerPowerupUnlockQuestion(opt.isCorrect, btn);
        container.appendChild(btn);
      });
    }

    function answerPowerupUnlockQuestion(correct, btn) {
      const all = document.querySelectorAll('#quizOpts .option');
      all.forEach(o => o.classList.add('disabled'));
      if (powerupQuizState.currentQ) {
        QuestionManager.recordAnswer(powerupQuizState.currentQ, correct, { cap: QUESTION_WEIGHT_CAP });
        saveQuestionWeights();
      }
      PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, correct);
      if (!correct) PlatformManager.deductCoins(10);
      if (correct) {
        btn.classList.add('right');
        powerupQuizState.correct++;
        progress.questionsCorrect = (progress.questionsCorrect || 0) + 1;
        saveProgress();
        checkSamuraiUnlock();
      } else {
        btn.classList.add('wrong');
        all.forEach(o=>{if(o.dataset.correct==='true')o.classList.add('right');});
        saveProgress();
      }
      setTimeout(() => { powerupQuizState.index++; showPowerupUnlockQuestion(); }, correct ? 1000 : 2000);
    }

    function finishPowerupUnlockQuiz() {
      const tier = powerupQuizState.correct;
      const grantedList = applySingleUsePowerupEffect(powerupQuizState.key, tier);

      document.getElementById('quizNum').textContent = 'Complete!';
      document.getElementById('quizQ').textContent = '';
      document.getElementById('quizOpts').innerHTML = '';
      const res = document.getElementById('quizResult');
      res.style.display = 'block';
      const info = SINGLE_USE_POWERUPS[powerupQuizState.key];
      const pct = tier * 25;

      let extra = '';
      if (grantedList && grantedList.length > 0) {
        const rows = grantedList.map(name => `<div>• ${name}</div>`).join('');
        extra = `<div style="margin-top: 10px; font-size: 15px; color: #fff;">You received:${rows}</div>`;
      } else if (powerupQuizState.key === 'randomRewards' && tier > 0) {
        extra = `<div style="margin-top: 10px; font-size: 15px; color: #aaa;">Nothing was available to grant.</div>`;
      }

      res.innerHTML = `<div style="font-size: 22px; margin-bottom: 10px;">${info.name}</div>
                        <div style="font-size: 18px; color: #00d4ff;">${powerupQuizState.correct}/4 correct — active at ${pct}% strength</div>${extra}`;

      setTimeout(() => {
        document.getElementById('quizOverlay').classList.remove('show');
        runNextPowerupUnlockQuiz();
      }, grantedList && grantedList.length > 0 ? 2800 : 1800);
    }

    function applySingleUsePowerupEffect(key, tier) {
      if (tier <= 0) return null;
      if (key === 'killValue') {
        runPowerupEffects.killValueMult = 1 + tier;
      } else if (key === 'highLevel') {
        player.level = 1 + tier;
        updateUI();
      } else if (key === 'randomRewards') {
        return grantRandomUpgrades(tier);
      } else if (key === 'coinsPerKill') {
        runPowerupEffects.coinBonusPerKill = 1 + tier;
      }
      return null;
    }

    function startPowerupPhase() {
      if (PlatformManager.powerupsAllowed() && progress.powerupStart > 0) {
        quiz.pending = progress.powerupStart;
        continueStartPhase();
      } else {
        game.active = true;
        game.paused = false;
      }
    }

    function continueStartPhase() {
      if (quiz.pending > 0) {
        quiz.pending--;
        startQuiz(true);
      } else {
        game.active = true;
        game.paused = false;
      }
    }

    canvas.addEventListener('click', (e) => {
      if (!game.active || game.paused) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;

      if (player.character === 'samurai') {
        if (upgrades.servantUnlocked) placeServant(clickX, clickY);
        samuraiWalkTargetX = clickX; samuraiWalkTargetY = clickY;
        return;
      }

      if (upgrades.shadowUnlocked && shadowReady) {
        const now = Date.now();
        if (now - lastShadow >= upgrades.shadowCooldown) {
          const levelA = pathLevel('trap', 'A');
          const levelB = pathLevel('trap', 'B');
          shadowTraps.push({
            x: clickX, y: clickY, placed: now, activated: false,
            armDelay: levelA >= 1 ? 1200 : 500,
            lifetime: levelB >= 1 ? 30000 : 20000,
            stickyTar: levelB >= 2,
            firstProcUsed: false
          });
          lastShadow = now;
          shadowReady = false;
          setTimeout(() => { shadowReady = true; }, upgrades.shadowCooldown);
        }
      }

      targetX = clickX; targetY = clickY;

      if (pathLevel('shuriken', 'B') >= 3) {
        if (shurikenMag.current > 0) {
          fireShurikenVolley();
          shurikenMag.current--;
        }
      }
    });


    document.getElementById("startBtn").addEventListener("click", async () => {
    const loaded = await loadQuestionBank();

    if(!loaded){
        document.getElementById("bankMessage").textContent =
            PlatformManager.hasClassCode()
              ? 'Question bank could not be loaded. Return to the Hub and check the class code.'
              : 'Please enter the class code before playing.';
        return;
    };

    document.getElementById("startOverlay").classList.remove("show");
    document.getElementById("enemyGuideOverlay").classList.add("show");
    renderEnemyGuideSprites();

});

    // Renders a static preview sprite into each Enemy Guide entry's canvas by temporarily
    // swapping the shared `ctx` to that canvas, drawing one representative enemy, then
    // restoring ctx so normal gameplay rendering is unaffected.
    function renderEnemyGuideSprites() {
      const types = ['slime', 'bat', 'ghost', 'eye', 'archer', 'golem', 'tree_golem', 'smoke_golem', 'fire_golem', 'troll'];
      const drawFns = {
        slime: drawSlime, bat: drawBat, ghost: drawGhost, eye: drawEye, archer: drawArcher,
        golem: drawGolem, tree_golem: drawTreeGolem, smoke_golem: drawSmokeGolem,
        fire_golem: drawFireGolem, troll: drawTroll
      };
      const savedCtx = ctx;
      const scale = 0.55;
      types.forEach(type => {
        const canvas = document.getElementById('eg-sprite-' + type);
        const fn = drawFns[type];
        if (!canvas || !fn) return;
        const c2d = canvas.getContext('2d');
        c2d.clearRect(0, 0, canvas.width, canvas.height);
        c2d.save();
        c2d.scale(scale, scale);
        ctx = c2d;
        try {
          fn({ x: (canvas.width / 2) / scale, y: (canvas.height / 2 + 10) / scale, anim: 0, hp: 1, maxHp: 1, frame: 0 });
        } catch (err) { /* guide preview only - ignore draw errors from missing optional fields */ }
        ctx = savedCtx;
        c2d.restore();
      });
    }

    document.getElementById('startGameBtn').addEventListener('click', () => {

      document.getElementById('enemyGuideOverlay').classList.remove('show');
      // One PlatformManager session per sitting — restarting a run (below) doesn't
      // start a new one, it's still the same session.
      PlatformManager.startSession(GAME_CONFIG.id);
      QuestionManager.beginMixedRun();
      reset();
      updateUI();
      showRandomEventThenStart();
      gameLoop();
    });

    document.getElementById('restartBtn').addEventListener('click', () => {
      document.getElementById('gameOverOverlay').classList.remove('show');
      game.active = false;
      game.paused = true;
      updateHomeStats();
      document.getElementById('startOverlay').classList.add('show');
    });

    document.getElementById('homeShopBtn').addEventListener('click', () => showShop('home'));
    document.getElementById('gameOverShopBtn').addEventListener('click', () => showShop('gameover'));
    document.getElementById('exitShopBtn').addEventListener('click', () => closeShop());

    // Canva Element SDK init
    async function onConfigChange(config) {
      const title = config.game_title || defaultConfig.game_title;
      document.getElementById('titleText').textContent = title;
      document.title = title;

      const enemyName = config.enemy_name || defaultConfig.enemy_name;
      const enemyLine = document.getElementById('enemyLine');
      if (enemyLine) enemyLine.textContent = `👾 Defeat ${enemyName} to gain XP and coins`;
    }

    function mapToCapabilities(config) {
      return { recolorables: [], borderables: [], fontEditable: undefined, fontSizeable: undefined };
    }

    function mapToEditPanelValues(config) {
      return new Map([
        ["game_title", config.game_title || defaultConfig.game_title],
        ["enemy_name", config.enemy_name || defaultConfig.enemy_name]
      ]);
    }

    if (window.elementSdk) {
      window.elementSdk.init({
        defaultConfig,
        onConfigChange,
        mapToCapabilities,
        mapToEditPanelValues
      });
    }

    gameLoop();
