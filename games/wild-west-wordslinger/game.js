 //Wild West Wordslinger Game.js
 // Game state
  let killCount=0, overallScore=0, sessionCoins=0, lives=3, ammo=5, maxAmmo=5;
  let gameActive=false, spawnInterval=null, reloadOpen=false, reloadStartTime=null;
  let gameOverReason='';
  let comboStreak=0;

  // Identifies this game to the shared PlatformManager (shared/js/PlatformManager.js).
  // Platform-wide stats (coins, question totals, sessions, high score) are keyed by this id.
  const GAME_CONFIG = { id: 'wild-west-wordslinger', name: 'Wild West Wordslinger' };
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

  // Persistent state
  let playerData = null; // the SDK record
  // NOTE: the persistent coin balance is NOT stored in a local field — it
  // lives in PlatformManager (shared/js/PlatformManager.js) as the single
  // source of truth for the shared coin economy. `sessionCoins` above is
  // this run's ephemeral, not-yet-banked earnings, which stays local.
  let highScore=0, bulletLevel=0, livesLevel=0, lootBoxCount=0, comboLevel=0;
  let totalCorrectAnswers=0, totalKills=0;
  let equippedPowerups=[]; // ids from POWERUPS the player has selected to run with
  let selectedBankCode='';
  let ownedCrosshairs=[], ownedEffects=[];
  let equippedCrosshair='', equippedEffect='';

  const ALL_CROSSHAIRS = ['Cross','Circle','Dot','Sheriff Badge','Horseshoe','Star','Skull','Bullseye'];
  const ALL_EFFECTS = ['Smoke','Fire','Rainbow','Stars','Lightning','Hearts','Coins','Green Plasma','Blue Ice'];

  // Loot box rarity system
  const RARITY = {
    common:    { chance:0.55, color:'#9aa0a6', glow:'rgba(154,160,166,0.6)',  label:'Common' },
    rare:      { chance:0.28, color:'#00d4ff', glow:'rgba(0,212,255,0.7)',   label:'Rare' },
    epic:      { chance:0.13, color:'#a855f7', glow:'rgba(168,85,247,0.75)', label:'Epic' },
    legendary: { chance:0.04, color:'#d4af37', glow:'rgba(212,175,55,0.85)', label:'Legendary' }
  };
  const RARITY_ORDER = ['common','rare','epic','legendary'];
  const RARITY_COIN_BONUS = { common:15, rare:35, epic:75, legendary:200 };
  const ITEM_RARITY = {
    'Cross':'common','Dot':'common','Circle':'common',
    'Horseshoe':'rare','Star':'rare','Sheriff Badge':'rare',
    'Skull':'epic','Bullseye':'epic',
    'Smoke':'common','Stars':'common','Coins':'common',
    'Fire':'rare','Hearts':'rare','Blue Ice':'rare',
    'Lightning':'epic','Green Plasma':'epic',
    'Rainbow':'legendary'
  };

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
        lootBoxCount = playerData.loot_box_count || 0;
        totalCorrectAnswers = playerData.total_correct_answers || 0;
        totalKills = playerData.total_kills || 0;
        equippedPowerups = playerData.equipped_powerups ? playerData.equipped_powerups.split(',').filter(Boolean) : [];
        comboLevel = playerData.combo_upgrade_level || 0;
        selectedBankCode = playerData.selected_bank_code || '';
        ownedCrosshairs = playerData.owned_crosshairs ? playerData.owned_crosshairs.split(',').filter(Boolean) : [];
        ownedEffects = playerData.owned_effects ? playerData.owned_effects.split(',').filter(Boolean) : [];
        equippedCrosshair = playerData.equipped_crosshair || '';
        equippedEffect = playerData.equipped_effect || '';
      } else {
        playerData = null;
        highScore=0; bulletLevel=0; livesLevel=0; lootBoxCount=0; comboLevel=0;
        totalCorrectAnswers=0; totalKills=0; equippedPowerups=[];
        selectedBankCode='';
        ownedCrosshairs=[]; ownedEffects=[];
        equippedCrosshair=''; equippedEffect='';
      }
      maxAmmo = 5 + bulletLevel;
      updateHomeStats();
      if (selectedBankCode && !QuestionManager.hasQuestions()) {
        loadQuestionBank(selectedBankCode).then(updateCodeStatus);
      } else {
        updateCodeStatus();
      }
    }
  };

  async function initData() {
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
      loot_box_count: lootBoxCount,
      total_correct_answers: totalCorrectAnswers,
      total_kills: totalKills,
      equipped_powerups: equippedPowerups.join(','),
      combo_upgrade_level: comboLevel,
      selected_bank_code: selectedBankCode,
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
  }

  // Screens
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function goHome() { showScreen('home-screen'); updateHomeStats(); }

  async function submitCode() {
    const input = document.getElementById('code-input-field');
    const code = input.value.trim().toLowerCase();
    const statusEl = document.getElementById('code-status');
    if (!code) return;
    if (code === 'reset') {
      QuestionManager.questions = null; QuestionManager.bankCode = ''; QuestionManager.bankName = '';
      selectedBankCode = '';
      await safeSave();
      updateCodeStatus();
      input.value = '';
      return;
    }
    statusEl.textContent = 'Checking code…'; statusEl.style.color = '#00d4ff';
    const ok = await loadQuestionBank(code);
    if (ok) {
      selectedBankCode = code;
      await safeSave();
      input.value = '';
    } else {
      statusEl.textContent = '❌ Unknown code — check with your teacher';
      statusEl.style.color = '#e74c3c';
      return;
    }
    updateCodeStatus();
  }

  // Shop
  const SHOP_TABS = ['upgrades','powerups','loot'];
  function switchShopTab(tab) {
    SHOP_TABS.forEach(t => {
      document.getElementById('shop-tab-'+t).classList.toggle('hidden', t!==tab);
      document.getElementById('shop-tab-btn-'+t).classList.toggle('shop-tab-active', t===tab);
    });
  }
  function openShop() {
    document.getElementById('shop-modal').classList.add('open');
    document.getElementById('shop-coins-display').textContent = '🪙 ' + PlatformManager.getCoins();
    updateBulletInfo();
    updateLifeInfo();
    updateComboUpgradeInfo();
    updateLootBoxInfo();
    renderPowerups();
    switchShopTab('upgrades');
    document.getElementById('loot-result').classList.add('hidden');
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
        showLootResult('No free powerup slots! Unequip one first.', '#e74c3c');
        return;
      }
      equippedPowerups.push(id);
    }
    await safeSave();
    renderPowerups();
  }

  function closeShop() { document.getElementById('shop-modal').classList.remove('open'); }

  function updateBulletInfo() {
    const cost = 10 * Math.pow(10, bulletLevel);
    document.getElementById('bullet-upgrade-info').textContent = 'Level ' + bulletLevel + ' (Ammo: ' + (5+bulletLevel) + ') — Next: ' + cost + ' 🪙';
  }

  async function buyBulletUpgrade() {
    const cost = 10 * Math.pow(10, bulletLevel);
    if (!PlatformManager.spendCoins(cost)) { showLootResult('Not enough coins!', '#e74c3c'); return; }
    bulletLevel++;
    maxAmmo = 5 + bulletLevel;
    await safeSave();
    document.getElementById('shop-coins-display').textContent = '🪙 ' + PlatformManager.getCoins();
    updateBulletInfo();
    showLootResult('Upgraded! Ammo: ' + maxAmmo, '#2ecc71');
  }

  function lifeUpgradeCost() { return Math.round(25 * Math.pow(3, livesLevel)); }
  function updateLifeInfo() {
    document.getElementById('life-upgrade-info').textContent = 'Start with ' + (3+livesLevel) + ' lives — Next: ' + lifeUpgradeCost() + ' 🪙';
  }
  async function buyLifeUpgrade() {
    const cost = lifeUpgradeCost();
    if (!PlatformManager.spendCoins(cost)) { showLootResult('Not enough coins!', '#e74c3c'); return; }
    livesLevel++;
    await safeSave();
    document.getElementById('shop-coins-display').textContent = '🪙 ' + PlatformManager.getCoins();
    updateLifeInfo();
    showLootResult('❤️ Now starting with ' + (3+livesLevel) + ' lives!', '#2ecc71');
  }

  // Combo Master: raises how fast your streak multiplier grows and its cap. Cost rises exponentially.
  function comboUpgradeCost() { return Math.round(20 * Math.pow(2.2, comboLevel)); }
  function updateComboUpgradeInfo() {
    const rate = (0.1 + comboLevel*0.04).toFixed(2);
    const cap = (3 + comboLevel*0.75).toFixed(1);
    document.getElementById('combo-upgrade-info').textContent = 'Level ' + comboLevel + ' (+' + rate + 'x per kill, cap ' + cap + 'x) — Next: ' + comboUpgradeCost() + ' 🪙';
  }
  async function buyComboUpgrade() {
    const cost = comboUpgradeCost();
    if (!PlatformManager.spendCoins(cost)) { showLootResult('Not enough coins!', '#e74c3c'); return; }
    comboLevel++;
    await safeSave();
    document.getElementById('shop-coins-display').textContent = '🪙 ' + PlatformManager.getCoins();
    updateComboUpgradeInfo();
    showLootResult('🔥 Combo power increased!', '#2ecc71');
  }

  function lootBoxCost() { return Math.round(20 * Math.pow(1.5, lootBoxCount)); }
  function updateLootBoxInfo() {
    document.getElementById('lootbox-info').textContent = lootBoxCost() + ' 🪙 — Common → Legendary crosshairs, effects & coin jackpots! (price rises after each box)';
  }

  function pickRarity() {
    const r = Math.random();
    let cum = 0;
    for (const key of RARITY_ORDER) { cum += RARITY[key].chance; if (r <= cum) return key; }
    return 'common';
  }

  async function buyLootBox() {
    const cost = lootBoxCost();
    if (!PlatformManager.spendCoins(cost)) { showLootResult('Not enough coins!', '#e74c3c'); return; }
    lootBoxCount++;
    const rarityKey = pickRarity();
    const poolNames = Object.keys(ITEM_RARITY).filter(n => ITEM_RARITY[n] === rarityKey);
    const availCross = poolNames.filter(n => ALL_CROSSHAIRS.includes(n) && !ownedCrosshairs.includes(n));
    const availEffect = poolNames.filter(n => ALL_EFFECTS.includes(n) && !ownedEffects.includes(n));
    const pool = [...availCross.map(n=>({type:'crosshair',name:n})), ...availEffect.map(n=>({type:'effect',name:n}))];
    if (pool.length > 0) {
      const pick = pool[Math.floor(Math.random()*pool.length)];
      if (pick.type==='crosshair') ownedCrosshairs.push(pick.name); else ownedEffects.push(pick.name);
      const emoji = pick.type==='crosshair' ? '🎯' : '💥';
      showLootReveal(rarityKey, emoji + ' ' + pick.name, false, 0);
    } else {
      // Everything in this tier is already owned — convert to a coin jackpot instead of a dud
      const bonus = RARITY_COIN_BONUS[rarityKey];
      PlatformManager.addCoins(bonus);
      showLootReveal(rarityKey, '', true, bonus);
    }
    await safeSave();
    document.getElementById('shop-coins-display').textContent = '🪙 ' + PlatformManager.getCoins();
    updateLootBoxInfo();
  }

  function burstConfetti(container, color) {
    for (let i=0;i<16;i++) {
      const p = document.createElement('div');
      const angle = Math.random()*Math.PI*2, dist = 24+Math.random()*54;
      p.style.cssText = 'position:absolute;left:50%;top:38%;width:5px;height:5px;border-radius:50%;pointer-events:none;';
      p.style.background = color;
      p.style.setProperty('--cx', Math.cos(angle)*dist+'px');
      p.style.setProperty('--cy', Math.sin(angle)*dist+'px');
      p.style.animation = 'confettiPop 0.8s ease-out forwards';
      container.appendChild(p);
      setTimeout(()=>p.remove(),800);
    }
  }

  function showLootReveal(rarityKey, itemLabel, isCoinBonus, coinAmount) {
    const rarity = RARITY[rarityKey];
    const el = document.getElementById('loot-result');
    el.innerHTML = '';
    el.classList.remove('hidden');
    el.classList.remove('loot-reveal-anim'); void el.offsetWidth; el.classList.add('loot-reveal-anim');
    el.style.position = 'relative';
    el.style.border = '2px solid ' + rarity.color;
    el.style.borderRadius = '10px';
    el.style.padding = '12px';
    el.style.background = 'rgba(0,0,0,0.35)';
    el.style.boxShadow = '0 0 22px ' + rarity.glow;
    const banner = document.createElement('div');
    banner.textContent = rarity.label.toUpperCase() + (rarityKey==='legendary' ? ' — JACKPOT!' : '!');
    banner.style.cssText = 'font-family:"Press Start 2P",cursive;font-size:11px;color:'+rarity.color+';text-shadow:0 0 10px '+rarity.glow+';margin-bottom:8px;letter-spacing:1px;';
    const body = document.createElement('div');
    body.textContent = isCoinBonus ? ('Already own everything here — 🪙 +' + coinAmount + ' bonus coins!') : (itemLabel + ' unlocked!');
    body.style.cssText = 'font-size:14px;color:#fff;font-weight:700;';
    el.appendChild(banner); el.appendChild(body);
    if (rarityKey==='epic' || rarityKey==='legendary') burstConfetti(el, rarity.color);
  }

  function showLootResult(msg, color) {
    const el = document.getElementById('loot-result');
    el.style.cssText = ''; // clear any leftover rarity-reveal styling
    el.textContent = msg; el.style.color = color;
    el.classList.remove('hidden'); el.classList.remove('loot-reveal-anim'); el.classList.add('loot-result');
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
    if (!equippedCrosshair || !gameActive) {
      el.classList.add('hidden');
      if (area) area.classList.remove('custom-cursor-active');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = getCrosshairSVG(equippedCrosshair);
    if (area) area.classList.add('custom-cursor-active');
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
    const colors = equippedEffect && EFFECT_COLORS[equippedEffect] ? EFFECT_COLORS[equippedEffect] : ['#f5c842','#f39c12','#e74c3c','#c0392b'];
    for (let i = 0; i < 16; i++) {
      const g = document.createElement('div');
      g.className = 'gunfire-effect';
      const angle = (Math.PI * 2 / 16) * i;
      const dist = 15 + Math.random() * 40;
      g.style.left = (x + 64) + 'px';
      g.style.top = (y + 64) + 'px';
      g.style.background = colors[Math.floor(Math.random() * colors.length)];
      g.style.width = (4 + Math.random()*6) + 'px';
      g.style.height = (4 + Math.random()*6) + 'px';
      g.style.setProperty('--gx', Math.cos(angle) * dist + 'px');
      g.style.setProperty('--gy', Math.sin(angle) * dist + 'px');
      area.appendChild(g);
      setTimeout(() => g.remove(), 400);
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

  async function loadQuestionBank(code) {
    const result = await QuestionManager.loadBank(code, QUESTION_BANK_TYPE);
    return result.ok;
  }

  function updateCodeStatus() {
    const el = document.getElementById('code-status');
    if (!el) return;
    if (QuestionManager.hasQuestions()) {
      el.textContent = '📚 Loaded: ' + QuestionManager.getBankName();
      el.style.color = '#2ecc71';
    } else {
      el.textContent = 'Enter your class code to play';
      el.style.color = '#9aa0a6';
    }
  }

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

  // Bosses: 5 distinct sprites, each with its own crest color and a matching attack pattern
  function drawBossIronVest(ctx){ drawWestern(ctx,{hatColor:'#3a3f47',skin:'#c9915f',shirt:'#232323',shirtAccent:'#141414',pants:'#1c1c1c',boot:'#0c0c0c',maskColor:'#141414',handItem:'gun',armor:true,armorColor:'#d8dee3',crest:'#ff8fa8'}); }
  function drawBossPhantom(ctx){ drawWestern(ctx,{hatColor:'#e9d8ff',skin:'#e9d8ff',shirt:'#d8c2ff',shirtAccent:'#c2a8f0',pants:'#d8c2ff',boot:'#c2a8f0',maskColor:null,eyeColor:'#a855f7',handItem:'gun',alpha:0.55,glowColor:'rgba(168,85,247,0.35)',crest:'#a855f7'}); }
  function drawBossBoomBaron(ctx){ drawWestern(ctx,{hatColor:'#1a0a0a',skin:'#c9915f',shirt:'#7a2510',shirtAccent:'#4a1608',pants:'#2b2b2b',boot:'#0c0c0c',maskColor:'#1a1a1a',handItem:'dynamite',glowColor:'rgba(255,136,0,0.25)',crest:'#ffb347'}); }
  function drawBossDuchess(ctx){ drawWestern(ctx,{hatColor:'#3d1155',skin:'#c9915f',shirt:'#5c1a75',shirtAccent:'#3d1155',boot:'#1a1a1a',maskColor:null,dress:true,handItem:'cards',glowColor:'rgba(168,85,247,0.2)',crest:'#d4af37'}); }
  function drawBossTalon(ctx){ drawWestern(ctx,{hatColor:'#1c1c1c',skin:'#8a7f6a',shirt:'#2b2b2b',shirtAccent:'#1c1c1c',pants:'#111111',boot:'#0a0a0a',maskColor:'#1c1c1c',eyeColor:'#f5c842',handItem:null,wings:true,wingColor:'#1c1c1c',glowColor:'rgba(46,204,113,0.2)',crest:'#2ecc71'}); }

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
    { id:'doc', name:'The Doctor', draw:drawDoc, penaltyScore:15, penaltyLives:1, warning:"That's the town doctor!", healOnEscape:true }
  ];
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
    const horizon = h*0.62;
    // Sky gradient
    const sky=ctx.createLinearGradient(0,0,0,horizon);
    sky.addColorStop(0,pal.skyTop); sky.addColorStop(0.5,pal.skyMid); sky.addColorStop(1,pal.skyBot);
    ctx.fillStyle=sky; ctx.fillRect(0,0,w,horizon);
    // Sun
    const sunGrad = ctx.createRadialGradient(w*0.82,horizon*0.35,4,w*0.82,horizon*0.35,60);
    sunGrad.addColorStop(0,pal.sunGlow); sunGrad.addColorStop(0.4,pal.sunCore); sunGrad.addColorStop(1,'rgba(212,175,55,0)');
    ctx.fillStyle=sunGrad; ctx.beginPath(); ctx.arc(w*0.82,horizon*0.35,60,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=pal.sunCore; ctx.beginPath(); ctx.arc(w*0.82,horizon*0.35,26,0,Math.PI*2); ctx.fill();
    // Distant mesas (layered silhouettes)
    ctx.fillStyle=pal.mesa1;
    ctx.beginPath(); ctx.moveTo(0,horizon);
    ctx.lineTo(0,horizon-40); ctx.lineTo(w*0.12,horizon-40); ctx.lineTo(w*0.16,horizon-70); ctx.lineTo(w*0.28,horizon-70); ctx.lineTo(w*0.32,horizon-35);
    ctx.lineTo(w*0.55,horizon-35); ctx.lineTo(w*0.6,horizon-60); ctx.lineTo(w*0.7,horizon-60); ctx.lineTo(w*0.74,horizon-25);
    ctx.lineTo(w,horizon-25); ctx.lineTo(w,horizon); ctx.closePath(); ctx.fill();
    ctx.fillStyle=pal.mesa2;
    ctx.beginPath(); ctx.moveTo(0,horizon);
    ctx.lineTo(w*0.05,horizon-22); ctx.lineTo(w*0.2,horizon-22); ctx.lineTo(w*0.24,horizon-45); ctx.lineTo(w*0.4,horizon-45); ctx.lineTo(w*0.44,horizon-18);
    ctx.lineTo(w*0.68,horizon-18); ctx.lineTo(w*0.72,horizon-38); ctx.lineTo(w*0.88,horizon-38); ctx.lineTo(w*0.92,horizon-12);
    ctx.lineTo(w,horizon-12); ctx.lineTo(w,horizon); ctx.closePath(); ctx.fill();
    // Ground
    const ground=ctx.createLinearGradient(0,horizon,0,h);
    ground.addColorStop(0,pal.groundTop); ground.addColorStop(1,pal.groundBot);
    ctx.fillStyle=ground; ctx.fillRect(0,horizon,w,h-horizon);
    ctx.fillStyle=pal.groundLine; ctx.fillRect(0,horizon,w,3);
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
    cactus(w*0.1, horizon+30, 0.9);
    cactus(w*0.92, horizon+45, 1.2);
    // Wooden fence in foreground
    ctx.fillStyle=pal.fence;
    for (let fx=-10; fx<w+30; fx+=46) { ctx.fillRect(fx, h-46, 6, 46); }
    ctx.fillStyle=pal.fenceRail;
    ctx.fillRect(0, h-34, w, 6);
    ctx.fillRect(0, h-18, w, 6);
  }

  function startGame() {
    if (!QuestionManager.hasQuestions()) {
      const statusEl = document.getElementById('code-status');
      if (statusEl) { statusEl.textContent = '⚠️ Enter a valid class code to play'; statusEl.style.color = '#e74c3c'; }
      showScreen('home-screen');
      return;
    }
    killCount=0; overallScore=0; sessionCoins=0; lives=3+livesLevel;
    ammo=maxAmmo; gameActive=false; reloadOpen=false; gameOverReason='';
    comboStreak=0;
    if (!platformSessionStarted) {
      PlatformManager.startSession(GAME_CONFIG.id);
      platformSessionStarted = true;
    }
    runScoreMult=1; runCoinMult=1; runSpawnRateMult=1; runPerformance=0;
    activePowerupsThisRun=[...equippedPowerups];
    stage=1; bossActive=false; bossHP=0; bossMaxHP=0; stageStartScore=0;
    cleanupCurrentBoss();
    clearTimeout(bossIncomingTimer); bossPreviewActive=false;
    document.getElementById('boss-incoming-overlay').classList.add('hidden');
    clearInterval(bossWordInterval);
    updateHUD(); showScreen('game-screen');
    const area=document.getElementById('game-area');
    area.querySelectorAll('.enemy-wrap, .falling-word').forEach(e=>{ stopTeleport(e); stopDrain(e); if(e._expireTimer) clearTimeout(e._expireTimer); e.remove(); });
    const bw=document.getElementById('boss-wrap'); if(bw) bw.remove();
    const bh=document.getElementById('boss-health-bar-wrap'); if(bh) bh.remove();
    document.getElementById('reload-overlay').classList.add('hidden');
    setTimeout(()=>drawBackground(stage),50);
    updateCrosshairCursor();
    if (activePowerupsThisRun.length > 0) {
      startPowerupAssessment();
    } else {
      startEnemySpawning();
    }
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
    document.getElementById('start-question-category').textContent =
      '⚡ Powerup Check ' + (preRunRoundIndex+1) + '/2 — ' + cat.prompt;
    const shuffled=[...cat.distractors].sort(()=>Math.random()-0.5);
    const words=[...cat.correct,...shuffled.slice(0,12)].sort(()=>Math.random()-0.5);
    const grid=document.getElementById('start-question-grid');grid.innerHTML='';grid.className='grid grid-cols-4 gap-2';grid.style.pointerEvents='';
    let found=0;
    let wrongCount=0;
    words.slice(0,16).forEach(w=>{
      const cell=document.createElement('button');
      cell.className='word-cell p-2 text-xs text-center rounded font-bold';cell.textContent=w;
      cell.addEventListener('click',()=>{
        if(cell.classList.contains('selected')||cell.classList.contains('wrong'))return;
        if(cat.correct.includes(w)){
          cell.classList.add('selected');found++;
          if(found>=cat.correct.length){ finishPowerupAssessmentRound(); }
        } else {
          cell.classList.add('wrong'); preRunMistakes++; wrongCount++;
          PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, false);
          if(wrongCount>=2){
            revealCorrectAnswers(grid, cat.correct);
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
    const baseTier = Math.floor(overallScore / 250);
    return Math.max(250, Math.round((1400 - baseTier * 100) * runSpawnRateMult));
  }

  function getEnemyLifetime() {
    // Enemies disappear faster as score increases
    // At score 0: 4200ms, at score 500: 3000ms, at score 1000+: 1800ms
    const baseTier = Math.floor(overallScore / 250);
    return Math.max(1800, 4200 - baseTier * 100);
  }

  function showStartQuestion() {
    const cat = QuestionManager.getNextQuestion();
    document.getElementById('start-question-category').textContent=cat.prompt;
    const shuffled=[...cat.distractors].sort(()=>Math.random()-0.5);
    const words=[...cat.correct,...shuffled.slice(0,12)].sort(()=>Math.random()-0.5);
    const grid=document.getElementById('start-question-grid');grid.innerHTML='';grid.className='grid grid-cols-4 gap-2';
    let found=0;
    words.slice(0,16).forEach(w=>{
      const cell=document.createElement('button');
      cell.className='word-cell p-2 text-xs text-center rounded font-bold';cell.textContent=w;
      cell.addEventListener('click',()=>{
        if(cell.classList.contains('selected'))return;
        if(cat.correct.includes(w)){cell.classList.add('selected');found++;if(found>=cat.correct.length){totalCorrectAnswers++;safeSave();PlatformManager.recordQuestionAnswered(GAME_CONFIG.id,true);document.getElementById('start-question-overlay').classList.add('hidden');startEnemySpawning();}}
        else{cell.classList.add('wrong');PlatformManager.recordQuestionAnswered(GAME_CONFIG.id,false);setTimeout(()=>showStartQuestion(),600);}
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
    wrap.remove();
    if (!gameActive) return;
    if (wrap.dataset.kind === 'decoy') {
      const dtype = DECOY_TYPES.find(t=>t.id===wrap.dataset.type);
      if (dtype && dtype.healOnEscape && lives < 3+livesLevel) {
        lives = Math.min(3+livesLevel, lives+1);
        updateHUD();
      }
    } else {
      const type = ENEMY_TYPES.find(t=>t.id===wrap.dataset.type) || ENEMY_TYPES[0];
      const lost = type.escapePenaltyLives || 1;
      lives -= lost; updateHUD();
      if (lives<=0) { gameOverReason = buildEscapeDeathMessage(type); endGame(); }
    }
  }
  function startTeleport(wrap, areaW, areaH, intervalMs) {
    wrap._teleportSpeed = intervalMs;
    wrap.classList.add('ghost-glide');
    wrap._teleportTimer = setInterval(()=>{
      if (!wrap.parentNode || wrap.dataset.dead) { stopTeleport(wrap); return; }
      wrap.style.left = Math.random()*(areaW-150)+'px';
      wrap.style.top = Math.random()*(areaH-150)+'px';
    }, intervalMs);
  }
  function stopTeleport(wrap) { if (wrap._teleportTimer) { clearInterval(wrap._teleportTimer); wrap._teleportTimer=null; } }
  function startDrain(wrap) {
    wrap._drainTimer = setInterval(()=>{
      if (!wrap.parentNode || wrap.dataset.dead || !gameActive) { stopDrain(wrap); return; }
      if (sessionCoins > 0) { sessionCoins--; updateHUD(); }
    }, 1000);
  }
  function stopDrain(wrap) { if (wrap._drainTimer) { clearInterval(wrap._drainTimer); wrap._drainTimer=null; } }

  function spawnEnemy() {
    if(!gameActive)return;
    const area=document.getElementById('game-area'),areaW=area.clientWidth,areaH=area.clientHeight;
    const isDecoy = Math.random() < DECOY_CHANCE;
    const type = isDecoy ? DECOY_TYPES[Math.floor(Math.random()*DECOY_TYPES.length)] : pickEnemyType();

    const wrap=document.createElement('div');
    wrap.className = 'enemy-wrap' + (isDecoy ? ' decoy-glow' : (type.cssClass ? ' '+type.cssClass : ''));
    wrap.dataset.kind = isDecoy ? 'decoy' : 'enemy';
    wrap.dataset.type = type.id;
    wrap.dataset.hitsLeft = isDecoy ? '1' : String(type.hits);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;canvas.style.width='128px';canvas.style.height='128px';
    type.draw(canvas.getContext('2d'));wrap.appendChild(canvas);
    wrap.style.left=Math.random()*(areaW-150)+'px';
    wrap.style.top=Math.random()*(areaH-150)+'px';
    wrap.addEventListener('click',(e)=>{ e.stopPropagation(); shootEnemy(wrap, type, isDecoy); });
    area.appendChild(wrap);

    // Ghost Rider & Vulture Scout teleport to keep the player guessing
    if (!isDecoy && type.teleports) startTeleport(wrap, areaW, areaH, type.teleportSpeed || 750);
    // Card Shark drains coins every second while alive
    if (!isDecoy && type.drainsCoins) startDrain(wrap);

    const lifetime = getEnemyLifetime() * (isDecoy ? 1 : type.lifetimeMult);
    scheduleExpiry(wrap, lifetime);
  }

  function shootEnemy(el, type, isDecoy) {
    if(!gameActive||ammo<=0||el.dataset.dead)return;
    const area = document.getElementById('game-area');
    const x=parseInt(el.style.left),y=parseInt(el.style.top);

    if (isDecoy) {
      // Penalize: never shoot the townsfolk!
      comboStreak = 0;
      ammo--; el.dataset.dead='1';
      if (el._expireTimer) clearTimeout(el._expireTimer);
      stopTeleport(el); stopDrain(el);
      spawnDeathEffect(x,y,area);
      el.style.transition='transform 0.25s, opacity 0.25s';
      el.style.transform='scale(0) rotate(90deg)';el.style.opacity='0';
      overallScore -= type.penaltyScore;
      lives = Math.max(0, lives - type.penaltyLives);
      showFloatingText(x,y,'-'+type.penaltyScore+' '+type.warning,'#e74c3c',area);
      updateHUD(); updateEnemySpawning();
      setTimeout(()=>el.remove(),300);
      if (lives<=0) { gameOverReason = `Ran out of lives — you shot ${type.name}! ${type.warning} Watch for the townsfolk before you pull the trigger.`; endGame(); return; }
      return;
    }

    // Armored Outlaw needs a second hit before it goes down
    let hitsLeft = parseInt(el.dataset.hitsLeft || '1', 10) - 1;
    if (hitsLeft > 0) {
      ammo--; el.dataset.hitsLeft = String(hitsLeft);
      el.classList.remove('armor-flash'); void el.offsetWidth; el.classList.add('armor-flash');
      showFloatingText(x,y,'Armor cracked!','#ffffff',area);
      updateHUD();
      return;
    }

    ammo--;el.dataset.dead='1';
    if (el._expireTimer) clearTimeout(el._expireTimer);
    stopTeleport(el); stopDrain(el);
    spawnDeathEffect(x,y,area);
    el.style.transition='transform 0.25s, opacity 0.25s';
    el.style.transform='scale(0) rotate(90deg)';el.style.opacity='0';
    const coinMult = runCoinMult;
    comboStreak++;
    const mult = getComboMultiplier() * runScoreMult;
    const scoreGain = Math.round(type.score * mult);
    killCount++;totalKills++;overallScore+=scoreGain;sessionCoins+=Math.round(type.coins*coinMult);
    showFloatingText(x,y,'+'+scoreGain+(mult>1?' ('+mult.toFixed(1)+'x)':''),'#2ecc71',area);

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
        if (dist < 170) {
          other.dataset.dead='1';
          if (other._expireTimer) clearTimeout(other._expireTimer);
          stopTeleport(other); stopDrain(other);
          const otherType = ENEMY_TYPES.find(t=>t.id===other.dataset.type) || ENEMY_TYPES[0];
          comboStreak++;
          const otherGain = Math.round(otherType.score * getComboMultiplier() * runScoreMult);
          killCount++; totalKills++; overallScore+=otherGain; sessionCoins+=Math.round(otherType.coins*coinMult);
          spawnDeathEffect(ox,oy,area);
          other.style.transition='transform 0.25s, opacity 0.25s';
          other.style.transform='scale(0) rotate(90deg)';other.style.opacity='0';
          setTimeout(()=>other.remove(),300);
        }
      });
    }

    updateHUD();updateEnemySpawning();checkStageProgress();setTimeout(()=>el.remove(),300);
  }

  async function endGame() {
    gameActive=false;clearInterval(spawnInterval);
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
    PlatformManager.addCoins(sessionCoins);
    const newHigh = overallScore > highScore;
    if(newHigh) highScore=overallScore;
    PlatformManager.setHighScore(GAME_CONFIG.id, overallScore);
    try { await saveData(); } catch(e) { console.error('saveData failed', e); }
    document.getElementById('final-score').textContent='Score: '+overallScore+' (Kills: '+killCount+')';
    document.getElementById('final-coins').textContent='🪙 '+sessionCoins+' coins earned';
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
    if(gameActive && spawnInterval) {
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
      hint:'Fades and relocates — time your shots on the body!',
      init:bossInitPhantom, cleanup:bossCleanupPhantom },
    { id:'boombaron', name:'Boom Baron', draw:drawBossBoomBaron, hpMult:1, wordInterval:1200,
      hint:'Watch for 💣 — defuse it, don\'t let it hit the ground!' },
    { id:'duchess', name:'Deadeye Duchess', draw:drawBossDuchess, hpMult:1, wordInterval:1000,
      hint:'She steals ammo every few seconds — stay stocked up!',
      init:bossInitDrain, cleanup:bossCleanupDrain },
    { id:'talon', name:'Talon', draw:drawBossTalon, hpMult:0.95, wordInterval:850,
      hint:'Fast and mobile — she won\'t sit still!',
      init:bossInitTalon, cleanup:bossCleanupTalon }
  ];
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

  // --- Phantom: dodge + relocate ---
  function bossInitPhantom() {
    bossState.dodging = false;
    const cycle = () => {
      bossState.dodging = !bossState.dodging;
      const wrap = document.getElementById('boss-wrap');
      const area = document.getElementById('game-area');
      if (wrap) {
        wrap.classList.toggle('boss-dodge', bossState.dodging);
        if (bossState.dodging && area) {
          const maxLeft = Math.max(20, area.clientWidth - 170);
          wrap.style.left = (20 + Math.random()*maxLeft) + 'px';
        }
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

  // --- Talon: constant repositioning (paired with a faster wordInterval) ---
  function bossInitTalon() {
    const move = () => {
      const wrap = document.getElementById('boss-wrap');
      const area = document.getElementById('game-area');
      if (wrap && area) {
        const maxLeft = Math.max(20, area.clientWidth - 170);
        wrap.style.left = (20 + Math.random()*maxLeft) + 'px';
      }
      bossState.moveTimer = setTimeout(move, 1600);
    };
    bossState.moveTimer = setTimeout(move, 1600);
  }
  function bossCleanupTalon() { if (bossState.moveTimer) clearTimeout(bossState.moveTimer); }

  let bossPreviewActive = false;
  let bossIncomingTimer = null;

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
    area.querySelectorAll('.enemy-wrap').forEach(e=>{ stopTeleport(e); stopDrain(e); if(e._expireTimer) clearTimeout(e._expireTimer); e.remove(); });
    const bossDef = BOSS_TYPES[(stage-1)%BOSS_TYPES.length];
    const canvas = document.getElementById('boss-incoming-canvas');
    bossDef.draw(canvas.getContext('2d'));
    document.getElementById('boss-incoming-name').textContent = '👹 ' + bossDef.name;
    document.getElementById('boss-incoming-hint').textContent = bossDef.hint || '';
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
    area.querySelectorAll('.enemy-wrap').forEach(e=>{ stopTeleport(e); stopDrain(e); if(e._expireTimer) clearTimeout(e._expireTimer); e.remove(); });
    const bossDef = BOSS_TYPES[(stage-1)%BOSS_TYPES.length];
    currentBoss = bossDef;
    bossState = {};
    bossMaxHP = Math.round((80 + stage*40) * (bossDef.hpMult||1)); bossHP = bossMaxHP;

    const wrap=document.createElement('div');
    wrap.id='boss-wrap';
    wrap.style.cssText='position:absolute;left:50%;top:34px;transform:translateX(-50%);width:150px;height:150px;cursor:crosshair;z-index:15;';
    const canvas=document.createElement('canvas');
    canvas.width=128;canvas.height=128;canvas.style.width='150px';canvas.style.height='150px';
    bossDef.draw(canvas.getContext('2d'));
    wrap.appendChild(canvas);
    wrap.addEventListener('click',(e)=>{
      e.stopPropagation();
      if (!bossActive || ammo<=0) return;
      if (bossState.dodging) {
        ammo--; updateHUD();
        showFloatingText(area.clientWidth/2-30, area.clientHeight/2, 'Dodged!', '#7fdfff', area);
        return;
      }
      ammo--;
      let dmg = 5;
      if (bossDef.modifyDamage) dmg = bossDef.modifyDamage(dmg, bossState);
      damageBoss(dmg, area);
      updateHUD();
    });
    area.appendChild(wrap);

    const barWrap=document.createElement('div');
    barWrap.id='boss-health-bar-wrap';
    barWrap.style.cssText='position:absolute;left:50%;top:8px;transform:translateX(-50%);width:260px;z-index:16;';
    barWrap.innerHTML='<div style="background:#1a0a2e;border:2px solid var(--border-purple);border-radius:6px;height:16px;overflow:hidden;"><div id="boss-health-fill" style="background:linear-gradient(90deg,#e74c3c,#ff6b81);height:100%;width:100%;transition:width 0.2s;"></div></div><p id="boss-name-label" class="text-center text-xs font-bold" style="color:#fff;text-shadow:0 1px 3px #000;margin-top:2px;"></p><p id="boss-hint-label" class="text-center" style="color:#ffd8e0;font-size:11px;text-shadow:0 1px 3px #000;margin-top:1px;"></p>';
    area.appendChild(barWrap);

    const cat = QuestionManager.getNextQuestion();
    document.getElementById('boss-name-label').textContent = '👹 ' + bossDef.name + ' — tap: ' + cat.prompt;
    document.getElementById('boss-hint-label').textContent = bossDef.hint || '';
    showFloatingText(area.clientWidth/2-60, area.clientHeight/2-20, '⚠️ BOSS FIGHT ⚠️', '#e74c3c', area);

    if (bossDef.init) bossDef.init();
    bossWordInterval = setInterval(()=>spawnFallingWord(cat), bossDef.wordInterval||1100);
  }

  function spawnFallingWord(cat) {
    if (!bossActive) return;
    const area = document.getElementById('game-area');
    const bossDef = currentBoss;
    const isBomb = !!(bossDef && bossDef.id==='boombaron' && Math.random() < 0.25);
    const pool = [...cat.correct, ...cat.distractors.slice(0,8)];
    const word = isBomb ? '💣' : pool[Math.floor(Math.random()*pool.length)];
    const isCorrect = !isBomb && cat.correct.includes(word);
    const el = document.createElement('button');
    el.className = 'falling-word' + (isBomb ? ' falling-bomb' : '');
    el.textContent = word;
    const areaW = area.clientWidth, areaH = area.clientHeight;
    el.style.left = Math.max(4, Math.random()*(areaW-100)) + 'px';
    el.style.top = '-40px';
    area.appendChild(el);
    const fallDuration = 5200;
    requestAnimationFrame(()=>{
      el.style.transition = 'top '+fallDuration+'ms linear';
      el.style.top = (areaH-20) + 'px';
    });
    el.addEventListener('click',(e)=>{
      e.stopPropagation();
      if (!bossActive || el.dataset.dead) return;
      el.dataset.dead='1';
      const x = parseFloat(el.style.left), y = parseFloat(el.style.top) || 0;
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
        ammo = Math.max(0, ammo-1);
        lives = Math.max(0, lives-1);
        showFloatingText(x,y-16,'Wrong!','#e74c3c',area);
        if (lives<=0) { gameOverReason = 'Ran out of lives — you missed a word during the boss fight! Slow down and double-check each word before you shoot it.'; endGame(); }
      }
      updateHUD();
      el.remove();
    });
    setTimeout(()=>{
      if (el.parentNode && !el.dataset.dead) {
        if (isBomb && bossActive) {
          lives = Math.max(0, lives-1);
          showFloatingText(parseFloat(el.style.left), areaH-40, '💥 Boom!', '#e74c3c', area);
          updateHUD();
          if (lives<=0) { gameOverReason = 'Ran out of lives — a Boom Baron bomb went off! Defuse the 💣 before it lands.'; endGame(); }
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
    showFloatingText(area.clientWidth/2-70, 40, '🏁 Stage ' + stage + ' — onward!', '#2ecc71', area);
    drawBackground(stage);
    updateHUD();
    if (gameActive) spawnInterval = setInterval(spawnEnemy, getSpawnDelay());
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

  function generateGrid() {
    const cat = QuestionManager.getNextQuestion();
    document.getElementById('reload-category').textContent=cat.prompt;
    const shuffled=[...cat.distractors].sort(()=>Math.random()-0.5);
    const words=[...cat.correct,...shuffled.slice(0,12)].sort(()=>Math.random()-0.5);
    const grid=document.getElementById('reload-grid');grid.innerHTML='';grid.className='grid grid-cols-4 gap-2';grid.style.pointerEvents='';
    let found=0;
    let wrongCount=0;
    const updateScore=()=>{const t=Math.max(50,2000-(Date.now()-reloadStartTime)/4);document.getElementById('reload-score').textContent='+'+t+' Points';};
    updateScore();const si=setInterval(updateScore,100);
    words.slice(0,16).forEach(w=>{
      const cell=document.createElement('button');
      cell.className='word-cell p-2 text-xs text-center rounded font-bold';cell.textContent=w;
      cell.addEventListener('click',()=>{
        if(cell.classList.contains('selected')||cell.classList.contains('wrong'))return;
        if(cat.correct.includes(w)){cell.classList.add('selected');found++;if(found>=cat.correct.length){clearInterval(si);totalCorrectAnswers++;safeSave();PlatformManager.recordQuestionAnswered(GAME_CONFIG.id,true);const bonus=Math.max(50,2000-(Date.now()-reloadStartTime)/4);overallScore+=bonus;ammo=maxAmmo;updateHUD();closeReload();checkStageProgress();}}
        else{
          cell.classList.add('wrong');wrongCount++;
          PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, false);
          if(wrongCount>=2){
            clearInterval(si);
            revealCorrectAnswers(grid, cat.correct);
            setTimeout(()=>generateGrid(),1000);
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
    ammo--; comboStreak=0; updateHUD();
    showFloatingText(e.clientX-rect.left-30, e.clientY-rect.top-10, 'MISS', '#e74c3c', area);
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