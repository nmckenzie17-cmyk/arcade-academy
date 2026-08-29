// === DATA ===
const PLANT_DEFS = [
    {id:'pea',name:'Pea Shooter',cost:100,color:'#22c55e',dmg:15,rate:60,range:600,type:'projectile',hp:100,desc:'Basic shooter'},
    {id:'rapid',name:'Rapid Shooter',cost:150,color:'#86efac',dmg:8,rate:25,range:500,type:'projectile',hp:70,desc:'Fast fire',unlockCost:150},
    {id:'ice',name:'Ice Flower',cost:175,color:'#67e8f9',dmg:11,rate:80,range:500,type:'slow',hp:90,desc:'Slows enemies',unlockCost:175},
    {id:'wall',name:'Wall Plant',cost:50,color:'#a3a3a3',dmg:0,rate:0,range:0,type:'wall',hp:300,desc:'Blocks enemies'},
    {id:'boom',name:'Exploding Shroom',cost:125,color:'#f97316',dmg:113,rate:0,range:80,type:'explode',hp:50,desc:'One-time boom',unlockCost:125},
    {id:'poison',name:'Poison Vine',cost:150,color:'#a855f7',dmg:4,rate:90,range:400,type:'poison',hp:85,desc:'Poisons enemies',unlockCost:150},
    {id:'laser',name:'Laser Plant',cost:250,color:'#f43f5e',dmg:30,rate:100,range:700,type:'projectile',hp:110,desc:'High damage',unlockCost:250},
    {id:'sun',name:'Sun Flower',cost:50,color:'#facc15',dmg:0,rate:300,range:0,type:'producer',hp:60,desc:'+25 sun'},
    {id:'spike',name:'Spike Trap',cost:75,color:'#78716c',dmg:8,rate:30,range:0,type:'spike',hp:130,desc:'Damages walkers',unlockCost:75},
    {id:'lightning',name:'Lightning Bush',cost:200,color:'#818cf8',dmg:23,rate:120,range:600,type:'chain',hp:95,desc:'Hits 3 enemies',unlockCost:200},
    {id:'torch',name:'Torch Tree',cost:150,color:'#f97316',dmg:0,rate:0,range:0,type:'firebuff',hp:120,desc:'Ignites passing shots',unlockCost:150},
    {id:'amp',name:'Amplifier Totem',cost:200,color:'#eab308',dmg:0,rate:0,range:0,type:'amplify',ampMult:1.3,hp:80,desc:'+30% dmg in lane',unlockCost:200},
    {id:'web',name:'Web Weaver',cost:150,color:'#94a3b8',dmg:0,rate:150,range:250,type:'root',hp:75,desc:'Roots an enemy',unlockCost:150},
    {id:'beacon',name:'Sun Beacon',cost:175,color:'#fde047',dmg:0,rate:0,range:0,type:'sunboost',sunMult:1.5,hp:70,desc:'+50% sun income',unlockCost:175},
    {id:'lilypad',name:'Lily Pad',cost:50,color:'#4ade80',dmg:0,rate:0,range:0,type:'lilypad',hp:80,desc:'Build on water'},
];

const PLANT_COOLDOWN_SECONDS = {
    pea:3, rapid:4, ice:6, wall:5, boom:10, poison:6, laser:9, sun:7,
    spike:5, lightning:8, torch:6, amp:8, web:7, beacon:8, lilypad:3
};


const ENEMY_DEFS = [
    {id:'bug',name:'Basic Bug',hp:60,speed:0.4,color:'#84cc16',reward:5,introWave:1},
    {id:'beetle',name:'Fast Beetle',hp:40,speed:0.8,color:'#65a30d',reward:7,introWave:2},
    {id:'spider',name:'Spider',hp:80,speed:0.5,color:'#1c1917',reward:8,introWave:3,shielded:true},
    {id:'caterpillar',name:'Poison Caterpillar',hp:70,speed:0.35,color:'#16a34a',reward:8,introWave:4,venom:true},
    {id:'slug',name:'Giant Slug',hp:350,speed:0.2,color:'#7c3aed',reward:20,introWave:5,regens:true},
    {id:'armour',name:'Armoured Beetle',hp:200,speed:0.3,color:'#525252',reward:15,armor:5,introWave:6},
    {id:'wasp',name:'Flying Wasp',hp:50,speed:0.6,color:'#fbbf24',reward:10,flying:true,introWave:7,laneSwitch:true},
    {id:'healer',name:'Healer',hp:60,speed:0.35,color:'#f0abfc',reward:12,introWave:8,heals:true},
    {id:'rhino',name:'Rhino Beetle',hp:150,speed:1.2,color:'#b91c1c',reward:18,introWave:9,charges:true},
    {id:'splitter',name:'Splitter',hp:100,speed:0.4,color:'#06b6d4',reward:15,introWave:10,splits:true},
    {id:'boss1',name:'Mega Beetle',hp:800,speed:0.2,color:'#dc2626',reward:50,boss:true,enrages:true},
    {id:'boss2',name:'Hive Queen',hp:1200,speed:0.15,color:'#9333ea',reward:80,boss:true,spawnsMinions:true},
];


const REWARDS = [
    {name:'+50 Sun',type:'sun',value:50,emoji:'☀️'},
    {name:'+100 Sun',type:'sun',value:100,emoji:'☀️'},
    {name:'Upgrade Damage',type:'stat',stat:'dmg',value:5,emoji:'⚔️'},
    {name:'Upgrade Speed',type:'stat',stat:'rate',value:-5,emoji:'⚡'},
    {name:'Upgrade Range',type:'stat',stat:'range',value:50,emoji:'🎯'},
    {name:'Reduce Cost',type:'cost',value:-15,emoji:'💰'},
    {name:'Heal All Plants',type:'heal',emoji:'💚'},
    {name:'Temp Shield',type:'shield',emoji:'🛡️'},
    {name:'+10 Coins',type:'coins',value:10,emoji:'🪙'},
];

// Lighten/darken a hex color by percent (-100..100)
function shadeColor(hex, percent) {
    const f = parseInt(hex.slice(1), 16), t = percent < 0 ? 0 : 255, p = Math.abs(percent) / 100;
    const R = f >> 16, G = f >> 8 & 0x00FF, B = f & 0x0000FF;
    return "#" + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
}

// === GAME ENGINE ===
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const LANES = 5;
const COLS = 9;
let cw, ch, cellW, cellH, gridOffsetX, gridOffsetY;

function resize() {
    const container = document.getElementById('game-container');
    cw = container.clientWidth;
    ch = container.clientHeight;
    canvas.width = cw;
    canvas.height = ch;
    gridOffsetX = 60;
    gridOffsetY = 40;
    cellW = (cw - gridOffsetX - 20) / COLS;
    cellH = (ch - gridOffsetY - 70) / LANES;
}
resize();
window.addEventListener('resize', resize);

// Persistence
const SAVE_KEY='gardenGuessingProgress_v1';
const defaultSave={starting_sun_upgrade:0,reward_choices_upgrade:0,rerolls_upgrade:0,highest_wave:0,unlockedShopPlants:[]};
let saveData={...defaultSave};
try{saveData={...defaultSave,...JSON.parse(localStorage.getItem(SAVE_KEY)||'{}')};}catch(_){saveData={...defaultSave};}
function persistSave(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(saveData));}catch(_){};}
let gardenRewardCache={},gardenRewardCacheAt=0;
function gardenReward(slot,id){
    const now=performance.now();
    if(now-gardenRewardCacheAt>250){gardenRewardCache=window.AchievementManager?.getEquipped?.('garden-guessing')||{};gardenRewardCacheAt=now;}
    return gardenRewardCache[slot]?.id===id;
}

// === SOUND EFFECTS ===
const SFX = {
    ctx: null,
    muted: false,
    _lastHit: 0,
    ensureCtx() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },
    beep(freq, duration, type='sine', vol=0.15, sweepTo=null) {
        if (this.muted) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + duration);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + duration);
    },
    noise(duration, vol=0.2) {
        if (this.muted) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;
        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        src.connect(gain); gain.connect(ctx.destination);
        src.start();
    },
    shoot() { this.beep(600, 0.08, 'square', 0.06, 350); },
    zap() { this.beep(900, 0.06, 'square', 0.07, 250); },
    hit() {
        const now = performance.now();
        if (now - this._lastHit < 40) return;
        this._lastHit = now;
        this.beep(150, 0.07, 'triangle', 0.08, 80);
    },
    explosion() { this.noise(0.35, 0.22); },
    place() { this.beep(320, 0.1, 'sine', 0.1, 520); },
    sell() { this.beep(700, 0.1, 'sine', 0.09, 1000); },
    death() { this.beep(220, 0.14, 'sawtooth', 0.09, 60); },
    hazard() { this.noise(0.25, 0.15); },
    waveStart() { this.beep(440, 0.14, 'sine', 0.1, 660); setTimeout(()=>this.beep(660, 0.18, 'sine', 0.1, 880), 130); },
    nightStart() { this.beep(220, 0.4, 'sine', 0.08, 140); },
    correct() { this.beep(523, 0.12, 'sine', 0.12, 784); },
    wrong() { this.beep(280, 0.22, 'sawtooth', 0.12, 110); },
    combo() { this.beep(700, 0.1, 'triangle', 0.12, 1100); },
};

// === GAME STATE ===
const Game = {
    state: 'menu', // menu, playing, questions, rewards, gameover, shop
    wave: 0,
    health: 10,
    sun: 50,
    coins: 0,
    score: 0,
    plants: [], // placed plants
    enemies: [],
    projectiles: [],
    particles: [],
    zaps: [],
    unlockedPlants: ['pea','sun','wall'],
    plantUpgrades: {},
    plantCooldowns: {},
    plantCooldownMax: {},
    homeEnemies: [],
    selectedPlant: null,
    grid: [], // [lane][col]
    questionsCorrect: 0,
    currentQuestionIdx: 0,
    questionSet: [],
    rewardsToGive: 0,
    rerollsUsed: 0,
    pendingSunBonus: 0,
    spawnTimer: 0,
    waveEnemies: [],
    shieldActive: false,
    shieldTimer: 0,
    animTick: 0,
    bgSunTimer: 0,
    sellMode: false,
    gameSpeed: 1,
    isNightWave: false,
    debris: {},
    water: {},
    floodWavesLeft: 0,

    init() {
        this.grid = Array.from({length:LANES}, ()=>Array(COLS).fill(null));
        this.plants = [];
        this.enemies = [];
        this.projectiles = [];
        this.particles = [];
        this.zaps = [];
        this.bgSunTimer = 0;
        this.pendingSunBonus = 0;
        this.isNightWave = false;
        this.debris = {};
        this.water = {};
        this.floodWavesLeft = 0;
        this.rerollsUsed = 0;
        this.wave = 0;
        this.health = 10;
        this.sun = 50 + saveData.starting_sun_upgrade * 25 +
            (gardenReward('boost','garden-guessing_seedling_start')&&!window.PlatformManager?.isPracticeMode?.()?25:0);
        this.coins = 0;
        this.score = 0;
        this.unlockedPlants = ['pea','sun','wall','lilypad', ...new Set(saveData.unlockedShopPlants||[])];
        this.plantUpgrades = {};
        this.plantCooldowns = {};
        this.plantCooldownMax = {};
        this.selectedPlant = 'pea';
        this.shieldActive = false;
    },

    startRun() {
        if(!window.QuestionManager?.hasQuestions?.())return;
        this.init();
        window.PlatformManager.startSession(window.GAME_CONFIG.id);
        this.state = 'playing';
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('hud').style.display = 'flex';
        document.getElementById('sell-btn').style.display = 'block';
        document.getElementById('sun-question-btn').style.display = 'block';
        document.getElementById('speed-btn').style.display = 'block';
        document.getElementById('mute-btn').style.display = 'block';
        document.getElementById('speed-btn').textContent = `▶ ${this.gameSpeed}x`;
        document.getElementById('mute-btn').textContent = SFX.muted ? '🔇' : '🔊';
        this.buildPlantBar();
        this.nextWave();
    },

    buildPlantBar() {
        const bar = document.getElementById('plant-bar');
        bar.style.display = 'flex';
        bar.innerHTML = '';
        PLANT_DEFS.filter(p => this.unlockedPlants.includes(p.id)).sort((a,b) => a.cost - b.cost).forEach(p => {
            const count = this.plants.filter(pl=>pl.id===p.id).length;
            const maxed = count >= 5;
            const cooling = (this.plantCooldowns[p.id]||0)>0;
            const div = document.createElement('div');
            div.dataset.plantId=p.id;
            div.className = 'plant-slot' + (this.selectedPlant === p.id ? ' selected' : '') + (maxed||cooling ? ' locked' : '') + (cooling?' cooldown-active':'');
            div.title = `${p.name} (${p.cost}☀️)\n${p.desc}\n${count}/5 placed`;
            div.innerHTML = `<canvas width="128" height="128" class="plant-icon" aria-hidden="true"></canvas><span class="plant-name">${p.name} (${count}/5)</span><span class="plant-cost">☀️ ${p.cost}</span><span class="plant-cooldown"></span>`;
            const icon = div.querySelector('canvas');
            const iconCtx = icon.getContext('2d');
            iconCtx.imageSmoothingEnabled = false;
            iconCtx.save();
            iconCtx.translate(0, 0);
            const { pattern: iconPattern, colors: iconColors } = this.getPlantSpriteData(p);
            const rows = iconPattern.length, cols = Math.max(...iconPattern.map(row => row.length));
            const px = 96 / cols, py = 96 / rows;
            iconPattern.forEach((row, r) => [...row].forEach((key, c) => { if (iconColors[key]) { iconCtx.fillStyle = iconColors[key]; iconCtx.fillRect(16 + c * px, 16 + r * py, Math.ceil(px), Math.ceil(py)); } }));
            iconCtx.restore();
            div.onclick = () => {
                if (!this.unlockedPlants.includes(p.id) || (this.plantCooldowns[p.id]||0)>0) return;
                this.selectedPlant = p.id;
                this.buildPlantBar();
            };
            bar.appendChild(div);
        });
        this.updatePlantCooldownUI();
    },

    startPlantCooldown(plantId){
        const frames=Math.round((PLANT_COOLDOWN_SECONDS[plantId]||5)*60);
        this.plantCooldowns[plantId]=frames;
        this.plantCooldownMax[plantId]=frames;
    },

    updatePlantCooldowns(){
        let changed=false;
        Object.keys(this.plantCooldowns).forEach(id=>{if(this.plantCooldowns[id]>0){this.plantCooldowns[id]--;changed=true;}});
        if(changed&&this.animTick%6===0)this.updatePlantCooldownUI();
    },

    updatePlantCooldownUI(){
        document.querySelectorAll('#plant-bar [data-plant-id]').forEach(slot=>{
            const id=slot.dataset.plantId,left=Math.max(0,this.plantCooldowns[id]||0),max=this.plantCooldownMax[id]||1;
            const label=slot.querySelector('.plant-cooldown');
            slot.style.setProperty('--cooldown-left',`${Math.max(0,Math.min(100,left/max*100))}%`);
            slot.classList.toggle('cooldown-active',left>0);
            if(left<=0&&this.plants.filter(p=>p.id===id).length<5)slot.classList.remove('locked');
            if(label)label.textContent=left>0?`${(left/60).toFixed(1)}s`:'';
        });
    },

    nextWave() {
        this.wave++;
        this.sun = 50 + saveData.starting_sun_upgrade * 25 + this.pendingSunBonus;
        this.pendingSunBonus = 0;
        this.isNightWave = this.wave % 3 === 0;
        this.bgSunTimer = 0;
        if (this.isNightWave) SFX.nightStart(); else SFX.waveStart();
        this.updateHUD();
        this.spawnDebris();
        this.updateFlood();
        this.generateWaveEnemies();
        this.spawnTimer = 0;
    },

    spawnDebris() {
        if (this.wave % 4 !== 0 || this.wave === 0) return;
        const emptyCells = [];
        for (let l=0; l<LANES; l++) {
            for (let c=0; c<COLS; c++) {
                const key = `${l}_${c}`;
                if (!this.grid[l][c] && !this.water[key] && !this.debris[key]) emptyCells.push([l,c]);
            }
        }
        if (!emptyCells.length) return;
        const [l,c] = emptyCells[Math.floor(Math.random()*emptyCells.length)];
        const hp = Math.max(1, Math.round(this.wave/2));
        this.debris[`${l}_${c}`] = {lane:l, col:c, hp, maxHp:hp, chipTimer:0};
        SFX.hazard();
    },

    clearDebris(lane, col) {
        const key = `${lane}_${col}`;
        const d = this.debris[key];
        if (!d) return;
        const cost = d.hp * 10;
        if (this.sun < cost) return;
        this.sun -= cost;
        delete this.debris[key];
        this.particles.push({x: gridOffsetX+col*cellW+cellW/2, y: gridOffsetY+lane*cellH+cellH/2, size: 16, life: 16, color: '#a16207'});
        this.updateHUD();
    },

    updateFlood() {
        // Recede an existing flood after its duration expires
        if (this.floodWavesLeft > 0) {
            this.floodWavesLeft--;
            if (this.floodWavesLeft <= 0) this.water = {};
        }
        // Start a new flood every 6th wave
        if (this.wave % 6 === 0 && this.wave > 0) {
            this.water = {};
            const laneCount = 2 + Math.floor(Math.random()*2); // 2 or 3 lanes
            const startLane = Math.floor(Math.random()*(LANES-laneCount+1));
            const colCount = Math.random() < 0.5 ? 5 : 7; // middle 5 or 7 tiles
            const startCol = Math.max(0, Math.floor((COLS-colCount)/2));
            this.floodWavesLeft = 2 + Math.floor(Math.random()*2); // lasts 2-3 waves
            for (let l=startLane; l<startLane+laneCount; l++) {
                for (let c=startCol; c<Math.min(COLS, startCol+colCount); c++) {
                    const key = `${l}_${c}`;
                    this.water[key] = true;
                    const occupant = this.grid[l][c];
                    if (occupant && occupant.type !== 'lilypad') {
                        // Washed away
                        this.plants.splice(this.plants.indexOf(occupant), 1);
                        this.grid[l][c] = null;
                        this.particles.push({x: occupant.x, y: gridOffsetY+l*cellH+cellH/2, size: 20, life: 20, color: '#38bdf8'});
                    }
                    delete this.debris[key]; // debris can't coexist with water
                }
            }
            SFX.hazard();
            this.buildPlantBar();
        }
    },

    generateWaveEnemies() {
        this.waveEnemies = [];
        const count = 2 + this.wave * 2;
        const spawnDelay = 300; // 5 second head start before enemies begin spawning
        const available = ENEMY_DEFS.filter(e => {
            if (e.boss) return false;
            return this.wave >= e.introWave;
        });
        for (let i = 0; i < count; i++) {
            const def = available[Math.floor(Math.random() * available.length)];
            this.waveEnemies.push({...def, lane: Math.floor(Math.random()*LANES), delay: spawnDelay + i * 40 + Math.random()*20});
        }
        if (this.wave % 5 === 0 && this.wave >= 5) {
            const bossDef = ENEMY_DEFS.filter(e=>e.boss)[Math.min(1,Math.floor(this.wave/10))];
            this.waveEnemies.push({...bossDef, lane: Math.floor(Math.random()*LANES), delay: spawnDelay + count*40, hp: bossDef.hp + this.wave*50});
        }
    },

    update() {
        if (this.state !== 'playing') return;
        this.animTick++;
        this.updatePlantCooldowns();

        // Background sun - passive income independent of Sun Flowers (paused at night)
        if (!this.isNightWave) {
            this.bgSunTimer++;
            if (this.bgSunTimer >= 300) {
                this.bgSunTimer = 0;
                this.sun += 25;
                this.updateHUD();
            }
        }

        // Spawn enemies
        if (this.waveEnemies.length > 0) {
            this.spawnTimer++;
            while (this.waveEnemies.length > 0 && this.waveEnemies[0].delay <= this.spawnTimer) {
                const e = this.waveEnemies.shift();
                const speed = e.id === 'beetle' ? e.speed * (1 + this.wave*0.02) : e.speed;
                const armor = e.id === 'armour' ? (e.armor||0) + this.wave*0.4 : (e.armor||0);
                this.enemies.push({x: cw + 20, lane: e.lane, hp: e.hp * (1 + this.wave*0.1), maxHp: e.hp * (1 + this.wave*0.1), speed, baseSpeed: speed, color: e.color, id: e.id, armor, flying: e.flying||false, slowTimer:0, poisonTimer:0, burnTimer:0, rootTimer:0, reward: e.reward,
                    splits: e.splits, heals: e.heals, boss: e.boss,
                    shielded: e.shielded, shield: 0, shieldMax: 20, shieldTimer: 0,
                    laneSwitch: e.laneSwitch, laneTimer: 90 + Math.random()*60,
                    regens: e.regens,
                    venom: e.venom,
                    charges: e.charges, chargeTimer: 120 + Math.random()*60, chargeActive: false, chargeDuration: 0,
                    enrages: e.enrages,
                    spawnsMinions: e.spawnsMinions, minionTimer: 200});
            }
        }

        // Check wave complete
        if (this.waveEnemies.length === 0 && this.enemies.length === 0) {
            this.startQuestions();
            return;
        }

        // Shield
        if (this.shieldActive) {
            this.shieldTimer--;
            if (this.shieldTimer <= 0) this.shieldActive = false;
        }

        // Update plants
        this.plants.forEach(p => {
            if (p.type === 'producer') {
                if (this.isNightWave) return; // Sun Flowers produce nothing at night
                p.timer++;
                if (p.timer >= p.rate) {
                    p.timer = 0;
                    const beacon = this.plants.find(pl => pl.type === 'sunboost');
                    this.sun += Math.floor(25 * (beacon ? beacon.sunMult : 1));
                    this.updateHUD();
                }
            } else if (p.type === 'projectile' || p.type === 'slow' || p.type === 'poison' || p.type === 'chain') {
                p.timer++;
                if (p.timer >= p.rate) {
                    const target = this.enemies.find(e => e.lane === p.lane && e.x > p.x && e.x - p.x < p.range && (!e.flying || p.type==='chain'));
                    if (target) {
                        p.timer = 0;
                        const amp = this.plants.find(pl => pl.type === 'amplify' && pl.lane === p.lane);
                        const dmg = p.dmg * (amp ? amp.ampMult : 1);
                        if (p.type === 'chain') {
                            // Hit up to 3 in lane
                            let hits = this.enemies.filter(e=>e.lane===p.lane && e.x>p.x && e.x-p.x<p.range).slice(0,3);
                            let fromX = p.x+cellW/2, fromY = gridOffsetY+p.lane*cellH+cellH/2;
                            SFX.zap();
                            hits.forEach(e => {
                                this.damageEnemy(e, dmg, p.type);
                                const toX = e.x, toY = gridOffsetY+e.lane*cellH+cellH/2;
                                this.zaps.push({x1:fromX,y1:fromY,x2:toX,y2:toY,life:10,maxLife:10,color:p.color});
                                fromX = toX; fromY = toY; // chain onward from the last hit enemy
                            });
                        } else {
                            SFX.shoot();
                            this.projectiles.push({x:p.x+cellW/2, y:gridOffsetY+p.lane*cellH+cellH/2, lane:p.lane, dx:6, dmg, type:p.type, id:p.id, color:p.color, trail:[], burn:false});
                        }
                    }
                }
            } else if (p.type === 'spike') {
                this.enemies.forEach(e => {
                    if (e.lane === p.lane && !e.flying && Math.abs(e.x - p.x) < cellW/2) {
                        p.timer++;
                        if (p.timer >= p.rate) { p.timer = 0; this.damageEnemy(e, p.dmg, 'spike'); }
                    }
                });
            } else if (p.type === 'root') {
                p.timer++;
                if (p.timer >= p.rate) {
                    const target = this.enemies.find(e => e.lane === p.lane && e.x > p.x && e.x - p.x < p.range && !e.flying);
                    if (target) {
                        p.timer = 0;
                        target.rootTimer = 90;
                        this.particles.push({x:target.x, y:gridOffsetY+target.lane*cellH+cellH/2, size:14, life:14, color:'#94a3b8'});
                    }
                }
            }
        });

        // Explode check
        this.plants = this.plants.filter(p => {
            if (p.type === 'explode') {
                const nearby = this.enemies.find(e => e.lane === p.lane && Math.abs(e.x - p.x) < p.range);
                if (nearby) {
                    SFX.explosion();
                    this.enemies.filter(e => Math.abs(e.x-p.x)<p.range && Math.abs(e.lane-p.lane)<=1).forEach(e => this.damageEnemy(e, p.dmg, 'explode'));
                    this.particles.push({x:p.x,y:gridOffsetY+p.lane*cellH,size:p.range,life:20,color:'#f97316'});
                    const gridOccupant = this.grid[p.lane][p.col];
                    if (gridOccupant && gridOccupant.type === 'lilypad' && gridOccupant.rider === p) {
                        gridOccupant.rider = null;
                    } else {
                        this.grid[p.lane][p.col] = null;
                    }
                    this.buildPlantBar();
                    return false;
                }
            }
            return true;
        });

        // Update projectiles
        this.projectiles = this.projectiles.filter(proj => {
            proj.trail.push({x:proj.x, y:proj.y});
            if (proj.trail.length > 5) proj.trail.shift();
            if (!proj.burn) {
                const torch = this.plants.find(pl => pl.type === 'firebuff' && pl.lane === proj.lane && Math.abs(pl.x - proj.x) < cellW*0.6);
                if (torch) proj.burn = true;
            }
            proj.x += proj.dx;
            if (proj.x > cw) return false;
            const hit = this.enemies.find(e => e.lane === proj.lane && Math.abs(e.x - proj.x) < 20);
            if (hit) {
                const wasSlowed = hit.slowTimer > 0;
                const wasPoisoned = hit.poisonTimer > 0;
                this.damageEnemy(hit, proj.dmg, proj.type);
                SFX.hit();
                if (proj.burn) {
                    hit.burnTimer = 90;
                    const hitY = gridOffsetY + hit.lane*cellH + cellH/2;
                    if (wasSlowed) {
                        // Shatter combo: Ice + Fire - bonus burst damage, clears the slow, icy shatter burst
                        hit.hp -= proj.dmg * 0.5;
                        hit.slowTimer = 0;
                        SFX.combo();
                        for (let i=0;i<6;i++) {
                            const angle = Math.random()*Math.PI*2;
                            this.particles.push({x:hit.x, y:hitY, vx:Math.cos(angle)*2, vy:Math.sin(angle)*2, size:3, life:16, color:'#67e8f9', squarish:true});
                        }
                    }
                    if (wasPoisoned) {
                        // Combustion combo: Poison + Fire - ignites the gas, AoE burn to nearby enemies
                        SFX.combo();
                        this.enemies.filter(e2 => e2!==hit && e2.lane===hit.lane && Math.abs(e2.x-hit.x)<70).forEach(e2 => {
                            e2.hp -= 15;
                            e2.burnTimer = Math.max(e2.burnTimer||0, 60);
                        });
                        this.particles.push({x:hit.x, y:hitY, size:24, life:16, color:'#fb923c'});
                    }
                }
                return false;
            }
            return true;
        });

        // Update lightning zaps
        this.zaps = this.zaps.filter(z => { z.life--; return z.life > 0; });

        // Debris hazard - chips away when a plant sits directly adjacent to it
        Object.keys(this.debris).forEach(key => {
            const d = this.debris[key];
            const hasAdjacentPlant = this.grid[d.lane][d.col-1] || this.grid[d.lane][d.col+1];
            if (hasAdjacentPlant) {
                d.chipTimer++;
                if (d.chipTimer >= 60) { d.chipTimer = 0; d.hp--; }
            }
            if (d.hp <= 0) delete this.debris[key];
        });

        // Update enemies
        this.enemies.forEach(e => {
            // Enrage: boss speeds up and hits harder below half HP
            const enraged = e.enrages && e.hp < e.maxHp * 0.5;
            let spd = (e.baseSpeed != null ? e.baseSpeed : e.speed) * (enraged ? 1.5 : 1);
            if (e.slowTimer > 0) { spd *= 0.4; e.slowTimer--; }
            if (e.poisonTimer > 0) { e.poisonTimer--; if (e.poisonTimer % 30 === 0) e.hp -= 5; }
            if (e.burnTimer > 0) { e.burnTimer--; if (e.burnTimer % 20 === 0) e.hp -= 3; }
            if (e.rootTimer > 0) e.rootTimer--;

            // Regeneration (slug)
            if (e.regens && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + 0.15); }

            // Shield regen (spider) - periodically rebuilds a damage-absorbing shield
            if (e.shielded) {
                e.shieldTimer--;
                if (e.shieldTimer <= 0 && e.shield <= 0) { e.shield = e.shieldMax; e.shieldTimer = 240; }
            }

            // Lane switching (wasp) - dodges between lanes
            if (e.laneSwitch) {
                e.laneTimer--;
                if (e.laneTimer <= 0) {
                    const options = [e.lane-1, e.lane+1].filter(l => l >= 0 && l < LANES);
                    if (options.length) e.lane = options[Math.floor(Math.random()*options.length)];
                    e.laneTimer = 90 + Math.random()*60;
                }
            }

            // Charging (rhino) - periodic burst of speed
            if (e.charges) {
                if (e.chargeActive) {
                    spd *= 2.5;
                    e.chargeDuration--;
                    if (e.chargeDuration <= 0) e.chargeActive = false;
                } else {
                    e.chargeTimer--;
                    if (e.chargeTimer <= 0) { e.chargeActive = true; e.chargeDuration = 25; e.chargeTimer = 150 + Math.random()*60; }
                }
            }

            // Hive Queen spawns minor bugs while alive
            if (e.spawnsMinions) {
                e.minionTimer--;
                if (e.minionTimer <= 0) {
                    this.enemies.push({x:e.x-20,lane:e.lane,hp:30,maxHp:30,speed:0.4,baseSpeed:0.4,color:'#84cc16',id:'bug',reward:3,armor:0,flying:false,slowTimer:0,poisonTimer:0,burnTimer:0,rootTimer:0});
                    e.minionTimer = 300;
                }
            }

            // Check plant collision (any plant type blocks and takes damage)
            if (!e.flying) {
                const blockers = this.plants.filter(p => p.lane === e.lane && Math.abs(p.x - e.x) < cellW*0.6 && e.x > p.x && !(p.type==='lilypad' && p.rider));
                if (blockers.length) {
                    const blocker = blockers.reduce((a,b) => (a.x > b.x ? a : b)); // nearest one in front
                    let dmg = 0.5 * (enraged ? 1.5 : 1);
                    if (e.venom) dmg += 0.5; // caterpillar bites deal extra damage
                    blocker.hp -= dmg;
                    if (blocker.hp <= 0) {
                        const gridOccupant = this.grid[blocker.lane][blocker.col];
                        if (gridOccupant && gridOccupant.type === 'lilypad' && gridOccupant.rider === blocker) {
                            // The rider died - clear just the rider, the lily pad survives
                            gridOccupant.rider = null;
                        } else {
                            this.grid[blocker.lane][blocker.col] = null;
                        }
                        this.plants.splice(this.plants.indexOf(blocker),1);
                        this.buildPlantBar();
                    }
                    return;
                }
            }

            e.x -= (e.rootTimer > 0 ? 0 : spd);

            // Healer
            if (e.heals && Math.random() < 0.005) {
                this.enemies.filter(en=>en!==e&&Math.abs(en.x-e.x)<100&&en.lane===e.lane).forEach(en=>{en.hp=Math.min(en.maxHp,en.hp+10);});
            }

            if (e.x < gridOffsetX - 10) {
                if (!this.shieldActive) this.health--;
                this.updateHUD();
                e.hp = 0;
                if (this.health <= 0) this.gameOver();
            }
        });

        // Remove dead enemies
        this.enemies = this.enemies.filter(e => {
            if (e.hp <= 0) {
                this.coins += e.reward || 5;
                this.score += e.reward || 5;
                SFX.death();
                if (e.splits) {
                    for (let i=0;i<2;i++) this.enemies.push({x:e.x+Math.random()*20,lane:e.lane,hp:30,maxHp:30,speed:0.5,baseSpeed:0.5,color:'#22d3ee',reward:3,armor:0,flying:false,slowTimer:0,poisonTimer:0,burnTimer:0,rootTimer:0});
                }
                // Pixel burst: scattering colored squares instead of a plain fading circle
                const deathY = gridOffsetY + e.lane*cellH + cellH/2;
                const pixelCount = e.boss ? 16 : 8;
                for (let i=0;i<pixelCount;i++) {
                    const angle = Math.random()*Math.PI*2;
                    const speed = 1 + Math.random()*3;
                    this.particles.push({
                        x: e.x, y: deathY,
                        vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - 1.5,
                        size: 2 + Math.random()*3, life: 20 + Math.random()*12,
                        color: Math.random() < 0.5 ? e.color : shadeColor(e.color, -30),
                        squarish: true
                    });
                }
                this.updateHUD();
                return false;
            }
            return true;
        });

        // Particles
        this.particles = this.particles.filter(p => {
            if (p.vx !== undefined) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; }
            p.life--;
            return p.life > 0;
        });
    },

    damageEnemy(e, dmg, type) {
        let actual = Math.max(1, dmg - (e.armor||0));
        if (e.shield > 0) {
            const absorbed = Math.min(e.shield, actual);
            e.shield -= absorbed;
            actual -= absorbed;
            if (e.shield <= 0) e.shieldTimer = 240; // shield broken, starts rebuilding
        }
        e.hp -= actual;
        if (type === 'slow') e.slowTimer = 90;
        if (type === 'poison') e.poisonTimer = 150;
    },

    drawPixelPattern(pattern, colors, x, y, w, h) {
        const rows = pattern.length, cols = Math.max(...pattern.map(row => row.length));
        const px = w / cols, py = h / rows;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        pattern.forEach((row, r) => [...row].forEach((key, c) => {
            if (colors[key]) { ctx.fillStyle = colors[key]; ctx.fillRect(Math.floor(x + c * px), Math.floor(y + r * py), Math.ceil(px), Math.ceil(py)); }
        }));
        ctx.restore();
    },

    drawProjectile(p) {
        const firefly=gardenReward('projectiles','garden-guessing_firefly_shots');
        const projectileColor=firefly?'#fde047':p.color;
        // Fading motion trail
        const n = p.trail.length;
        p.trail.forEach((t, i) => {
            const f = (i+1)/(n+1);
            ctx.globalAlpha = f * 0.4;
            ctx.fillStyle = projectileColor;
            ctx.beginPath();
            ctx.arc(t.x, t.y, 1.5 + f*2, 0, Math.PI*2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // Soft glow behind the projectile
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 11);
        glow.addColorStop(0, projectileColor + 'aa');
        glow.addColorStop(1, projectileColor + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI*2);
        ctx.fill();

        if (p.id === 'laser') {
            // Elongated glowing bolt
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.ellipse(-6, 0, 10, 2.5, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.ellipse(1, 0, 3.5, 2, 0, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        } else if (p.type === 'slow') {
            // Ice crystal shard
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.PI/4);
            ctx.fillStyle = p.color;
            ctx.fillRect(-4.5, -4.5, 9, 9);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-2, -2, 4, 4);
            ctx.restore();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.8;
            ctx.beginPath(); ctx.moveTo(p.x-6,p.y); ctx.lineTo(p.x+6,p.y); ctx.moveTo(p.x,p.y-6); ctx.lineTo(p.x,p.y+6); ctx.stroke();
            ctx.globalAlpha = 1;
        } else if (p.type === 'poison') {
            // Pulsating venom blob with a bubble highlight
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = shadeColor(p.color, 45);
            ctx.beginPath(); ctx.arc(p.x-1.5, p.y-1.5, 1.6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = shadeColor(p.color, -30);
            ctx.beginPath(); ctx.arc(p.x+1.5, p.y+1.5, 1.2, 0, Math.PI*2); ctx.fill();
        } else if (p.id === 'rapid') {
            // Small bright spark
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI*2); ctx.fill();
        } else {
            // Pea (default): shaded orb with highlight
            ctx.fillStyle = shadeColor(p.color, -25);
            ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.7;
            ctx.beginPath(); ctx.arc(p.x-1.3, p.y-1.3, 1.3, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Ignited overlay (from Torch Tree) - flickering fire aura
        if (p.burn) {
            const flicker = 3 + Math.sin(this.animTick*0.8 + p.x)*1.2;
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = '#fb923c';
            ctx.beginPath(); ctx.arc(p.x - 3, p.y, flicker, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#facc15';
            ctx.beginPath(); ctx.arc(p.x - 2, p.y, flicker*0.5, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
        }
    },

    getPlantSpriteData(p) {
        const academy=gardenReward('plants','garden-guessing_academy_blooms');
        const legend=gardenReward('theme','garden-guessing_garden_legend');
        const base = academy?'#2458a6':legend?'#a855f7':p.color, dark = shadeColor(base, -35), deep = shadeColor(base, -55), light = shadeColor(base, 35);
        const colors = { B: base, D: dark, N: deep, L: light, K: '#161616', W: '#f8fafc',
            G: '#22c55e', E: '#15803d', Y: '#facc15', O: '#f97316', P: '#e879f9', M: '#78350f', S: '#94a3b8', T: '#44403c' };
        const plantPatterns = {
            pea: ['   LLL     ','  LBBBL    ',' BBBBBBB   ',' BBBBBBB   ','BBBKK BB   ',' BBBBBBB   ',' BDBBBDB   ','  DBBBD    ','   BBB     ','   EGE     ','  EEGEE    '],
            rapid: ['  LL   LL  ',' LBBL LBBL ','BBBBB BBBBB','BBBKB BKBBB','BBBBB BBBBB',' DBBD DBBD ','   BB BB   ','    BBB    ','    EGE    ','   EEGEE   '],
            ice: ['    W      ','   WLW     ','  W BBB W  ',' WLBBBBBLW ','  BBWWWBB  ',' LBBWWWBBL ','  BBBBBBB  ','   DBBBD   ','    BBB    ','    EGE    ','   E G E   '],
            wall: ['SSSSSSSSSS ','S T S T S T','SSSSSSSSSS ','T S T S T S','SSSSSSSSSS ','S T S T S T','SSSSSSSSSS ','T S T S T S','SSSSSSSSSS '],
            boom: ['   DDDDD   ','  DOOOOD   ',' DOOOOOOD  ','DOOWOOWOOD ','DOOOOOOOOD ',' DOOOOOOD  ','  DDDDD    ','   WWW     ','  WWWWW    ','  W W W    '],
            poison: ['  E     E  ',' EBE   EBE ','  BBB BBB  ','   BBBBB   ','   BKKKB   ','   BBBBB   ','    BDB    ','    PPP    ','     P     '],
            laser: ['    L      ','   LBL     ','  BBBBB    ',' BBBWBB    ','BBBBWBBB   ',' BBBWBB    ','  BBBBB    ','   DBD     ','    B      ','    EGE    ','   E G E   '],
            sun: ['  Y     Y  ',' Y  YYY  Y ','  YYYYYYY  ',' YYMMMMMYY ',' YYMWMWMYY ',' YYMMMMMYY ','  YYYYYYY  ',' Y  YYY  Y ','    EGE    ','   EEGEE   ','  E   G  E '],
            spike: ['S  S  S  S ','SS SS SS SS',' S  S  S   ','MMMMMMMMMMM','M M M M M M','MMMMMMMMMMM'],
            lightning: ['  DBBBD    ',' DBBBBBD   ','BBBBYBBBB  ','BBBYYBBBB  ',' BBYY BBB  ','BBBYBBBBB  ',' DBBBBBD   ','   EGE     ','  EEGEE    '],
            torch: ['    Y      ','   OYO     ','  OOYOO    ',' OOOOOOO   ','  OOOOO    ','   MMM     ','   MMM     ','  MMMMM    ',' MM   MM   '],
            amp: ['   BBB     ','  BYYYB    ','  BBBBB    ','   DBD     ','  BYYYB    ','  BBBBB    ','   DBD     ','  BBBBB    ','   DDD     '],
            web: ['B   B   B  ',' B  B  B   ','  B B B    ','BBBBBBBBB  ','  B B B    ',' B  K  B   ','B   B   B  '],
            beacon: ['    Y      ','   YWY     ','  YYYYY    ','   BBB     ','   BBB     ','   BBB     ','  BBBBB    ',' BB   BB   '],
            lilypad: [' EEBBBBBEE ','EBBBBBBBBBE','BBBBWBBBBB','EBBBBBBBBBE',' EEBBBBBEE ']
        };
        return { pattern: plantPatterns[p.id] || plantPatterns.pea, colors };
    },

    drawPlantSprite(p, x, y, w, h) {
        const { pattern, colors } = this.getPlantSpriteData(p);
        this.drawPixelPattern(pattern, colors, x, y, w, h);
    },

    drawEnemySprite(e, x, y, s) {
        const base = e.color, dark = shadeColor(base, -35), deep = shadeColor(base, -55), light = shadeColor(base, 30);
        const colors = { C: base, D: dark, V: deep, L: light, K: '#161616', W: '#fef9c3',
            H: '#f8fafc', R: '#dc2626', Y: '#facc15', N: '#d6d3d1', P: '#4ade80', G: '#86efac' };
        const patterns = {
            bug: [[
                '    K     K    ',
                '     LLLLL     ',
                '    CCCCCCC    ',
                '   CCCCCCCCC   ',
                '  CCDCCCCCDCC  ',
                '  CCCCCCCCCCC  ',
                ' CCCCWCCCWCCCC ',
                ' CCCCCCCCCCCCC ',
                'CCCCCCCCCCCCCCC',
                ' C C  C C  C C ',
                '  C    C    C  '
            ],[
                '   K       K   ',
                '     LLLLL     ',
                '    CCCCCCC    ',
                '   CCCCCCCCC   ',
                '  CCDCCCCCDCC  ',
                '  CCCCCCCCCCC  ',
                ' CCCCWCCCWCCCC ',
                ' CCCCCCCCCCCCC ',
                'CCCCCCCCCCCCCCC',
                '  C  C C  C  C ',
                ' C    C    C   '
            ]],
            beetle: [[
                '     CCCCCCC    ',
                '    CLLLLLLLC   ',
                '   CDDDDDDDDDC  ',
                '  CCCCCCCCCCCC  ',
                '  CCWCCCCCWCCC  ',
                '  CCCCCCCCCCCC  ',
                '   CDCDCDCDCD   ',
                '  C   C  C   C  ',
                ' L     L     L  '
            ],[
                '     CCCCCCC    ',
                '    CLLLLLLLC   ',
                '   CDDDDDDDDDC  ',
                '  CCCCCCCCCCCC  ',
                '  CCWCCCCCWCCC  ',
                '  CCCCCCCCCCCC  ',
                '   CDCDCDCDCD   ',
                ' C   C  C   C   ',
                'L     L     L   '
            ]],
            armour: [[
                '  N DDDDDDDDD N ',
                ' NCCCCCCCCCCCCN ',
                'NCNCNCNCNCNCNCN ',
                'NCCCCCCCCCCCCCN ',
                'NCCWCCCCCCCWCCN ',
                'NCCCCCCCCCCCCCN ',
                'NCNCNCNCNCNCNCN ',
                ' NCCCCCCCCCCCCN ',
                '  NDDDDDDDDDN   ',
                ' N N N  N N N N '
            ],[
                '  N DDDDDDDDD N ',
                ' NCCCCCCCCCCCCN ',
                'NCNCNCNCNCNCNCN ',
                'NCCCCCCCCCCCCCN ',
                'NCCWCCCCCCCWCCN ',
                'NCCCCCCCCCCCCCN ',
                'NCNCNCNCNCNCNCN ',
                ' NCCCCCCCCCCCCN ',
                '  NDDDDDDDDDN   ',
                'N N N  N N N N  '
            ]],
            wasp: [[
                ' WW    K K    WW ',
                '  WW  CCCCC  WW  ',
                '   WWCCCCCCCWW   ',
                '    CYCCCCCYC    ',
                '    CCCWCWCCC    ',
                '    CYCCCCCYC    ',
                '     CCCCCCC     ',
                '      CCCCC      ',
                '       CCC       ',
                '        R        '
            ],[
                '   W    K K    W  ',
                '    WCCCCCCCW     ',
                '     CCCCCCCC     ',
                '    CYCCCCCYC    ',
                '    CCCWCWCCC    ',
                '    CYCCCCCYC    ',
                '     CCCCCCC     ',
                '      CCCCC      ',
                '       CCC       ',
                '        R        '
            ]],
            slug: [[
                '   K     K      ',
                '   L     L      ',
                '   D     D      ',
                '  CCCCCCCCCCC   ',
                ' CCCCCCCCCCCCC  ',
                ' CCCCCCCCCCCCC  ',
                ' CCWCCCCCCWCCC  ',
                ' CCCCCCCCCCCCC  ',
                ' DCCCCCCCCCCCD  ',
                '  DDDDDDDDDDD   ',
                '   G  G  G  G   '
            ],[
                '                ',
                '   K     K      ',
                '   L     L      ',
                '  CCCCCCCCCCCC  ',
                ' CCCCCCCCCCCCCC ',
                ' CCCCCCCCCCCCC  ',
                ' CCWCCCCCCWCCC  ',
                ' CCCCCCCCCCCCC  ',
                ' DCCCCCCCCCCCD  ',
                '  DDDDDDDDDDD   ',
                '  G  G  G  G    '
            ]],
            spider: [[
                'C    C   C    C',
                ' C   C   C   C ',
                '  C  C   C  C  ',
                '   C C   C C   ',
                '    CCCCCCC    ',
                '   CKCWCWCKC   ',
                '   CCCCCCCCC   ',
                '    CRCCCRC    ',
                '   C C   C C   ',
                '  C  C   C  C  ',
                ' C   C   C   C '
            ],[
                ' C   C   C   C ',
                '  C  C   C  C  ',
                '   C C   C C   ',
                '    CCCCCCC    ',
                '    CCCCCCC    ',
                '   CKCWCWCKC   ',
                '   CCCCCCCCC   ',
                '    CRCCCRC    ',
                '  C  C   C  C  ',
                '   C C   C C   ',
                '    C     C    '
            ]],
            caterpillar: [[
                '  P    P    P   ',
                ' CCC  CCC  CCCC ',
                'CCCCCCCCCCCCCCCC',
                'CCDCCCCDCCCCDCCC',
                'CCWCCCCWCCCCWCCC',
                'CCCCCCCCCCCCCCCC',
                ' CCC  CCC  CCCC ',
                '  P    P    P   '
            ],[
                '   P    P    P  ',
                'CCC  CCC  CCCC  ',
                'CCCCCCCCCCCCCCCC',
                'CCDCCCCDCCCCDCCC',
                'CCWCCCCWCCCCWCCC',
                'CCCCCCCCCCCCCCCC',
                '  CCC  CCC  CCCC',
                '   P    P    P  '
            ]],
            rhino: [[
                '      NNN       ',
                '     NNNNN      ',
                '    NNNNNNN     ',
                '   NN     NN    ',
                '  CCCCCCCCCCC   ',
                ' CDCDCDCDCDCD   ',
                ' CCCWCCCCCWCC   ',
                ' CCCCCCCCCCCC   ',
                'CCCCCCCCCCCCCC  ',
                'C C  C  C  C  C '
            ],[
                '      NNN       ',
                '     NNNNN      ',
                '    NNNNNNN     ',
                '   NN     NN    ',
                '  CCCCCCCCCCC   ',
                ' CDCDCDCDCDCD   ',
                ' CCCWCCCCCWCC   ',
                ' CCCCCCCCCCCC   ',
                ' CCCCCCCCCCCCC  ',
                ' C  C  C  C  C  '
            ]],
            healer: [[
                '   L    L    L  ',
                '  CCCCCCCCCCCC  ',
                ' CCCCCCCCCCCCCC ',
                ' CCCWCCCCCWCCCC ',
                ' CCC  HHH  CCCC ',
                ' CCC  HHH  CCCC ',
                ' CCCCCCCCCCCCCC ',
                '  CCCCCCCCCCCC  ',
                '   C  C  C  C   '
            ],[
                '                ',
                '  CCCCCCCCCCCC  ',
                ' CLCCCCCCCCCLC  ',
                ' CCCWCCCCCWCCC  ',
                ' CCC  HHH  CCCC ',
                ' CCC  HHH  CCCC ',
                ' CCCCCCCCCCCCCC ',
                '  CCCCCCCCCCCC  ',
                '    C  C  C     '
            ]],
            splitter: [[
                '  CCCC   CCCC  ',
                ' CCCCCC CCCCCC ',
                'CCCCCCCDCCCCCCC',
                'CCWCCCCDCCCCWCC',
                'CCCCCCCDCCCCCCC',
                ' CCCCCC CCCCCC ',
                '  CCCC   CCCC  ',
                '   C  C C  C   '
            ],[
                '  CCCC    CCCC  ',
                ' CCCCC     CCCCC ',
                'CCCCCC  D  CCCCC',
                'CCWCCC  D  CCWCC',
                'CCCCCC  D  CCCCC',
                ' CCCCC     CCCCC ',
                '  CCCC    CCCC  ',
                '   C  C   C  C  '
            ]],
            boss1: [[
                '  R  N   N  R  ',
                ' DDDDDDDDDDDDD ',
                'DCCCCCCCCCCCCCD',
                'DCVCDCDCDCVCCD ',
                'DCCCCCCCCCCCCCD',
                'DCCWCCCRCCCWCCD',
                'DCCCCCCCCCCCCCD',
                'DCVCDCDCDCVCCD ',
                ' DDDDDDDDDDDDD ',
                'D D  D  D  D  D'
            ],[
                ' R  N   N  R   ',
                ' DDDDDDDDDDDDD ',
                'DCCCCCCCCCCCCCD',
                'DCVCDCDCDCVCCD ',
                'DCCCCCCCCCCCCCD',
                'DCCRCCCWCCCRCCD',
                'DCCCCCCCCCCCCCD',
                'DCVCDCDCDCVCCD ',
                ' DDDDDDDDDDDDD ',
                ' D  D  D  D  D '
            ]],
            boss2: [[
                ' Y  Y  Y  Y  Y ',
                '  YYYYYYYYYYY  ',
                'WW CCCCCCCCC WW',
                ' WCCCCCCCCCCW  ',
                '  CCCWCCCCCWC  ',
                '  CCCCCYCCCCC  ',
                '  CCCCCCCCCCC  ',
                '   CDCCCCCDC   ',
                '    C  C  C    '
            ],[
                'Y  Y  Y  Y  Y  ',
                '  YYYYYYYYYYY  ',
                ' W CCCCCCCCC W ',
                '  WCCCCCCCCCW  ',
                '  CCCWCCCCCWC  ',
                '  CCCCCYCCCCC  ',
                '  CCCCCCCCCCC  ',
                '   CDCCCCCDC   ',
                '     C  C  C   '
            ]]
        };
        const frames = patterns[e.id] || patterns.bug;
        const frame = frames[Math.floor(this.animTick / 12) % 2];
        this.drawPixelPattern(frame, colors, x-s/2, y, s, s);
    },

    drawHomeGarden() {
        this.animTick++;
        const tile=Math.max(54,Math.min(90,cw/10));
        ctx.globalAlpha=.82;
        if(!this.homeEnemies.length){
            this.homeEnemies=Array.from({length:8},(_,i)=>({def:ENEMY_DEFS[i%10],x:Math.random()*cw,lane:i%5,speed:.35+(i%4)*.12}));
        }
        this.homeEnemies.forEach(enemy=>{
            enemy.x-=enemy.speed;
            if(enemy.x < -tile){enemy.x=cw+tile;enemy.lane=Math.floor(Math.random()*5);}
            const y=ch*(.12+enemy.lane*.18);
            this.drawEnemySprite(enemy.def,enemy.x,y,enemy.def.boss?tile*.82:tile*.64);
        });
        ctx.globalAlpha=1;
    },

    draw() {
        ctx.clearRect(0,0,cw,ch);
        if (this.state === 'menu' || this.state === 'shop') {
            ctx.fillStyle = '#020305';
            ctx.fillRect(0,0,cw,ch);
            this.drawHomeGarden();
            return;
        }

        // Background
        const moonlit=gardenReward('world','garden-guessing_moonlit_garden');
        const legend=gardenReward('theme','garden-guessing_garden_legend');
        ctx.fillStyle = moonlit?'#07142d':legend?'#170b2b':'#0f1a2a';
        ctx.fillRect(0,0,cw,ch);

        // Grid
        for (let l=0;l<LANES;l++) {
            for (let c=0;c<COLS;c++) {
                const x = gridOffsetX + c*cellW;
                const y = gridOffsetY + l*cellH;
                const key = `${l}_${c}`;
                if (this.water[key]) {
                    // Water tile - animated wavy blue
                    const wave = Math.sin(this.animTick*0.1 + c*0.6 + l*0.3) * 3;
                    ctx.fillStyle = (l+c)%2===0 ? '#1d4ed8' : '#1e40af';
                    ctx.fillRect(x,y,cellW-1,cellH-1);
                    ctx.strokeStyle = 'rgba(191,219,254,0.5)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(x+2, y+cellH/2+wave);
                    ctx.lineTo(x+cellW-3, y+cellH/2-wave);
                    ctx.stroke();
                } else {
                    ctx.fillStyle = moonlit ? ((l+c)%2===0?'#102b45':'#0b2238') : this.isNightWave
                        ? ((l+c)%2===0 ? '#0d1a0d' : '#0a140a')
                        : ((l+c)%2===0 ? '#1a2d1a' : '#162816');
                    ctx.fillRect(x,y,cellW-1,cellH-1);
                }
                if (this.debris[key]) {
                    const d = this.debris[key];
                    ctx.fillStyle = '#57534e';
                    ctx.fillRect(x+cellW*0.15, y+cellH*0.2, cellW*0.7, cellH*0.6);
                    ctx.fillStyle = '#78716c';
                    ctx.fillRect(x+cellW*0.25, y+cellH*0.3, cellW*0.3, cellH*0.2);
                    ctx.fillRect(x+cellW*0.5, y+cellH*0.45, cellW*0.25, cellH*0.25);
                    // HP bar
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(x+cellW*0.15, y+cellH*0.12, cellW*0.7, 4);
                    ctx.fillStyle = '#eab308';
                    ctx.fillRect(x+cellW*0.15, y+cellH*0.12, cellW*0.7*(d.hp/d.maxHp), 4);
                }
            }
        }

        // Garden edge
        ctx.fillStyle = '#2d5a27';
        ctx.fillRect(0, gridOffsetY, gridOffsetX-2, LANES*cellH);
        if(gardenReward('crossover','garden-guessing_academy_scarecrow')){
            ctx.fillStyle='#8b5a2b';ctx.fillRect(21,gridOffsetY+cellH*1.6,6,cellH*1.8);ctx.fillRect(8,gridOffsetY+cellH*2,32,5);
            ctx.fillStyle='#2458a6';ctx.fillRect(10,gridOffsetY+cellH*1.45,28,16);ctx.fillStyle='#fde047';ctx.fillRect(17,gridOffsetY+cellH*1.15,14,15);
        }

        // Plants
        this.plants.forEach(p => {
            const x = p.x;
            if (p.type === 'lilypad') {
                // Draw as a flat base pad sitting on the water, riders draw on top of it
                const py = gridOffsetY + p.lane*cellH + cellH*0.4;
                this.drawPlantSprite(p, x+cellW*0.1, py, cellW*0.8, cellH*0.45);
                return;
            }
            const y = gridOffsetY + p.lane*cellH + cellH*0.2;
            const w = cellW*0.6;
            const h = cellH*0.6;
            this.drawPlantSprite(p, x+cellW*0.2, y, w, h);
            if (p.maxHp > 0 && p.hp < p.maxHp) {
                // HP bar (only shown once the plant has taken damage)
                ctx.fillStyle='#333';
                ctx.fillRect(x+cellW*0.2,y-4,w,3);
                ctx.fillStyle = p.hp/p.maxHp > 0.5 ? '#22c55e' : p.hp/p.maxHp > 0.25 ? '#eab308' : '#ef4444';
                ctx.fillRect(x+cellW*0.2,y-4,w*(p.hp/p.maxHp),3);
            }
        });

        // Enemies
        this.enemies.forEach(e => {
            const y = gridOffsetY + e.lane*cellH + cellH*0.25;
            const s = e.boss ? cellH*0.7 : cellH*0.5;
            this.drawEnemySprite(e, e.x, y, s);
            // HP bar
            ctx.fillStyle='#333';
            ctx.fillRect(e.x-s/2, y-6, s, 4);
            ctx.fillStyle = e.hp/e.maxHp > 0.5 ? '#22c55e' : e.hp/e.maxHp > 0.25 ? '#eab308' : '#ef4444';
            ctx.fillRect(e.x-s/2, y-6, s*(e.hp/e.maxHp), 4);
            // Slow indicator
            if (e.slowTimer>0) { ctx.fillStyle='#67e8f9'; ctx.fillRect(e.x-3,y-10,6,3); }
            // Burn indicator
            if (e.burnTimer>0) {
                ctx.fillStyle = Math.floor(this.animTick/4)%2===0 ? '#f97316' : '#facc15';
                ctx.beginPath(); ctx.arc(e.x, y-10, 2.5, 0, Math.PI*2); ctx.fill();
            }
            // Root indicator
            if (e.rootTimer>0) { ctx.fillStyle='#94a3b8'; ctx.fillRect(e.x-5,y-10,10,3); }
            // Shield indicator
            if (e.shield>0) {
                ctx.strokeStyle='#38bdf8'; ctx.lineWidth=2;
                ctx.beginPath(); ctx.arc(e.x, y+s*0.3, s*0.65, 0, Math.PI*2); ctx.stroke();
                ctx.fillStyle='#0ea5e9';
                ctx.fillRect(e.x-s/2, y-6, s*(e.shield/e.shieldMax), 2);
            }
            // Charge flash
            if (e.chargeActive) { ctx.fillStyle='rgba(251,191,36,0.35)'; ctx.beginPath(); ctx.arc(e.x, y+s*0.3, s*0.7, 0, Math.PI*2); ctx.fill(); }
        });

        // Projectiles
        this.projectiles.forEach(p => this.drawProjectile(p));

        // Lightning zaps (chain attacks)
        this.zaps.forEach(z => {
            const alpha = z.life / z.maxLife;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = z.color;
            ctx.lineWidth = 3;
            ctx.shadowColor = z.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(z.x1, z.y1);
            const segments = 4;
            for (let i=1;i<segments;i++) {
                const t = i/segments;
                ctx.lineTo(z.x1 + (z.x2-z.x1)*t + (Math.random()-0.5)*10, z.y1 + (z.y2-z.y1)*t + (Math.random()-0.5)*10);
            }
            ctx.lineTo(z.x2, z.y2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        });

        // Particles
        this.particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life/20);
            ctx.fillStyle = gardenReward('effect','garden-guessing_bloom_bursts') ? ['#f472b6','#fde047','#4ade80'][Math.abs(Math.floor(p.x+p.y))%3] : p.color;
            if (p.squarish) {
                const s = Math.max(1, p.size);
                ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size*(1-p.life/20), 0, Math.PI*2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        });

        // Shield indicator
        if (this.shieldActive) {
            ctx.strokeStyle = '#67e8f9';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.5;
            ctx.strokeRect(gridOffsetX-5, gridOffsetY-5, 10, LANES*cellH+10);
            ctx.globalAlpha = 1;
        }

        // Night wave overlay + banner
        if (this.isNightWave) {
            ctx.fillStyle = 'rgba(5,10,30,0.35)';
            ctx.fillRect(gridOffsetX, gridOffsetY, COLS*cellW, LANES*cellH);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(gridOffsetX, 4, COLS*cellW, 22);
            ctx.fillStyle = '#93c5fd';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🌙 Night Wave — No Sun Production!', gridOffsetX + COLS*cellW/2, 20);
            ctx.textAlign = 'left';
        }

        // Flood event banner
        if (this.floodWavesLeft > 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(gridOffsetX, 4, COLS*cellW, 22);
            ctx.fillStyle = '#93c5fd';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`🌊 Flooded! Build Lily Pads — recedes in ${this.floodWavesLeft} wave${this.floodWavesLeft>1?'s':''}`, gridOffsetX + COLS*cellW/2, 20);
            ctx.textAlign = 'left';
        }
    },

    updateHUD() {
        document.getElementById('hud-wave').textContent = this.wave;
        document.getElementById('hud-health').textContent = this.health;
        document.getElementById('hud-sun').textContent = this.sun;
        document.getElementById('hud-coins').textContent = this.coins;
        document.getElementById('hud-score').textContent = this.score;
    },

    // Questions
    startQuestions() {
        this.state = 'questions';
        this.questionsCorrect = 0;
        this.currentQuestionIdx = 0;
        this.questionSet = window.QuestionManager.getRandomSet(4);
        document.getElementById('question-modal').style.display = 'flex';
        this.showQuestion();
    },

    showQuestion() {
        const q = this.questionSet[this.currentQuestionIdx];
        document.getElementById('question-progress').textContent = `Question ${this.currentQuestionIdx+1} of ${this.questionSet.length}`;
        document.getElementById('question-text').textContent = q.q;
        const container = document.getElementById('answers-container');
        container.innerHTML = '';
        document.getElementById('next-question-btn').style.display = 'none';
        q.a.forEach((a, i) => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn choice-btn';
            btn.textContent = a;
            btn.onclick = () => this.answerQuestion(i);
            container.appendChild(btn);
        });
    },

    answerQuestion(idx) {
        const q = this.questionSet[this.currentQuestionIdx];
        const btns = document.querySelectorAll('#answers-container .answer-btn');
        btns.forEach((b,i) => {
            b.onclick = null;
            if (i === q.c) b.classList.add('correct');
            else if (i === idx) b.classList.add('wrong');
        });
        const correct=idx===q.c;
        if(correct){this.questionsCorrect++;SFX.correct();window.AchievementManager?.notify?.('garden_guessing_correct');}else SFX.wrong();
        window.QuestionManager.recordAnswer(q,correct);
        window.PlatformManager.recordQuestionAnswered(window.GAME_CONFIG.id,correct);
        document.getElementById('next-question-btn').style.display = 'block';
    },

    nextQuestion() {
        this.currentQuestionIdx++;
        if (this.currentQuestionIdx >= this.questionSet.length) {
            document.getElementById('question-modal').style.display = 'none';
            if (this.questionsCorrect > 0) {
                this.rewardsToGive = 1;
                this.rerollsUsed = 0;
                this.showRewardSelection();
            } else {
                this.state = 'playing';
                this.nextWave();
            }
        } else {
            this.showQuestion();
        }
    },

    openSunQuestion() {
        if (this.state !== 'playing') return;
        this.state = 'sunquestion';
        this.sunQ = window.QuestionManager.getNextQuestion(false);
        document.getElementById('sun-question-modal').style.display = 'flex';
        document.getElementById('sun-question-text').textContent = this.sunQ.q;
        const container = document.getElementById('sun-answers-container');
        container.innerHTML = '';
        this.sunQ.a.forEach((a, i) => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn choice-btn';
            btn.textContent = a;
            btn.onclick = () => this.answerSunQuestion(i);
            container.appendChild(btn);
        });
    },

    answerSunQuestion(idx) {
        const q = this.sunQ;
        const btns = document.querySelectorAll('#sun-answers-container .answer-btn');
        btns.forEach((b,i) => {
            b.onclick = null;
            if (i === q.c) b.classList.add('correct');
            else if (i === idx) b.classList.add('wrong');
        });
        const correct=idx===q.c;
        if(correct) {
            this.sun += 25;
            SFX.correct();
        } else {
            this.health -= 1;
            SFX.wrong();
        }
        window.QuestionManager.recordAnswer(q,correct);
        window.PlatformManager.recordQuestionAnswered(window.GAME_CONFIG.id,correct);
        if(correct)window.AchievementManager?.notify?.('garden_guessing_correct');
        this.updateHUD();
        setTimeout(() => {
            document.getElementById('sun-question-modal').style.display = 'none';
            if (this.health <= 0) {
                this.gameOver();
            } else {
                this.state = 'playing';
            }
        }, 900);
    },

    showRewardSelection() {
        this.state = 'rewards';
        document.getElementById('reward-modal').style.display = 'flex';
        document.getElementById('reward-subtitle').textContent = `You got ${this.questionsCorrect}/${this.questionSet.length} correct — pick 1 upgrade`;
        const container = document.getElementById('rewards-container');
        container.innerHTML = '';
        const numChoices = Math.min(REWARDS.length, this.questionsCorrect + saveData.reward_choices_upgrade);
        const options = [...REWARDS].sort(()=>Math.random()-0.5).slice(0, numChoices).map(r => this.instantiateReward(r));
        options.forEach(r => {
            const card = document.createElement('div');
            card.className = 'reward-card';
            card.innerHTML = `<div class="text-3xl mb-2">${r.emoji}</div><div class="text-white font-semibold text-sm">${r.name}</div>`;
            card.onclick = () => this.claimReward(r);
            container.appendChild(card);
        });
        const rerollBtn = document.getElementById('reroll-btn');
        const rerollsLeft = saveData.rerolls_upgrade - this.rerollsUsed;
        if (rerollsLeft > 0) {
            rerollBtn.style.display = 'inline-block';
            rerollBtn.textContent = `🔄 Reroll (${rerollsLeft} left)`;
        } else {
            rerollBtn.style.display = 'none';
        }
    },

    rerollReward() {
        if (this.rerollsUsed >= saveData.rerolls_upgrade) return;
        this.rerollsUsed++;
        SFX.place();
        this.showRewardSelection();
    },

    // Picks the target plant (for stat/cost rewards) up front and bakes an explicit,
    // plant-specific name into the reward so the card text always matches what gets applied.
    instantiateReward(baseR) {
        const r = {...baseR};
        if (r.type === 'stat' || r.type === 'cost') {
            const pid = this.unlockedPlants[Math.floor(Math.random()*this.unlockedPlants.length)];
            const def = PLANT_DEFS.find(p=>p.id===pid);
            r.plantId = pid;
            if (r.type === 'stat') {
                const label = r.stat === 'dmg' ? `Damage +${r.value}` : r.stat === 'rate' ? 'Fire Rate ↑' : `Range +${r.value}`;
                r.name = `${def.name}: ${label}`;
            } else {
                r.name = `${def.name}: Cost ${r.value}`;
            }
        }
        return r;
    },

    claimReward(r) {
        switch(r.type) {
            case 'sun': this.sun += r.value; this.pendingSunBonus += r.value; break;
            case 'stat':
                if (!this.plantUpgrades[r.plantId]) this.plantUpgrades[r.plantId] = {};
                this.plantUpgrades[r.plantId][r.stat] = (this.plantUpgrades[r.plantId][r.stat]||0) + r.value;
                break;
            case 'cost':
                const costDef = PLANT_DEFS.find(p=>p.id===r.plantId);
                if (costDef) costDef.cost = Math.max(25, costDef.cost + r.value);
                break;
            case 'heal':
                this.plants.forEach(p=>{ if (p.maxHp) p.hp = p.maxHp; });
                break;
            case 'shield':
                this.shieldActive = true; this.shieldTimer = 600;
                break;
            case 'coins': this.coins += r.value; break;
        }
        this.updateHUD();
        this.rewardsToGive--;
        if (this.rewardsToGive > 0) {
            this.showRewardSelection();
        } else {
            document.getElementById('reward-modal').style.display = 'none';
            this.state = 'playing';
            this.nextWave();
        }
    },

    gameOver() {
        this.state = 'gameover';
        const earned = Math.floor(this.coins + this.wave * 5);
        if(!window.PlatformManager?.isPracticeMode?.()){
            if (this.wave > saveData.highest_wave) saveData.highest_wave = this.wave;
            persistSave();
        }
        const settlement=window.PlatformManager.settleAccuracyCoins(window.GAME_CONFIG.id,earned);
        window.PlatformManager.setHighScore(window.GAME_CONFIG.id,this.score);
        window.AchievementManager?.notify?.('garden_run_completed',{facts:{garden_guessing_best_wave:this.wave,mastery_garden_guessing:this.wave>=15?1:0},run:{health:this.health}});
        window.ChallengeManager?.finish?.({score:this.score,wave:this.wave,alive:false,finished:true});
        window.PlatformManager.endSession(window.GAME_CONFIG.id);
        document.getElementById('go-waves').textContent = this.wave;
        document.getElementById('go-coins').textContent = settlement.coinsAwarded;
        document.getElementById('gameover-modal').style.display = 'flex';
        document.getElementById('hud').style.display = 'none';
        document.getElementById('plant-bar').style.display = 'none';
        document.getElementById('sell-btn').style.display = 'none';
        document.getElementById('sun-question-btn').style.display = 'none';
        document.getElementById('sun-question-modal').style.display = 'none';
        document.getElementById('speed-btn').style.display = 'none';
        document.getElementById('mute-btn').style.display = 'none';
        this.sellMode = false;
    },

    returnToMenu() {
        document.getElementById('gameover-modal').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
        this.state = 'menu';
        updateHomeStats();
    },

    showShop() {
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('shop-modal').style.display = 'flex';
        this.state = 'shop';
        updateShopUI();
    },

    closeShop() {
        document.getElementById('shop-modal').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
        this.state = 'menu';
        updateHomeStats();
    },

    placePlant(lane, col) {
        if (this.state !== 'playing') return;
        const key = `${lane}_${col}`;
        if (this.debris[key]) return; // blocked by rubble
        const def = PLANT_DEFS.find(p=>p.id===this.selectedPlant);
        if (!def || !this.unlockedPlants.includes(def.id)) return;
        if ((this.plantCooldowns[def.id]||0)>0) return;
        const isWater = !!this.water[key];
        const existing = this.grid[lane][col];

        if (isWater) {
            if (!existing) {
                // Open water - only a Lily Pad can be built here first
                if (def.id !== 'lilypad') return;
            } else if (existing.type === 'lilypad') {
                // A Lily Pad is already here
                if (def.id === 'lilypad' || existing.rider) return; // no double lily pads, no double riders
                if (this.plants.filter(p=>p.id===def.id).length >= 5) return;
                if (this.sun < def.cost) return;
                this.sun -= def.cost;
                const upgrades = this.plantUpgrades[def.id] || {};
                const rider = {
                    ...def, x: existing.x, lane, col, timer: 0,
                    dmg: def.dmg + (upgrades.dmg||0),
                    rate: Math.max(10, def.rate + (upgrades.rate||0)),
                    range: def.range + (upgrades.range||0),
                    hp: def.hp || 0, maxHp: def.hp || 0
                };
                existing.rider = rider;
                this.plants.push(rider);
                this.startPlantCooldown(def.id);
                SFX.place();
                this.updateHUD();
                this.buildPlantBar();
                return;
            } else {
                return; // shouldn't happen, but guard just in case
            }
        } else {
            if (def.id === 'lilypad') return; // lily pads are only useful on water
            if (existing) return;
        }

        if (this.plants.filter(p=>p.id===def.id).length >= 5) return;
        if (this.sun < def.cost) return;
        this.sun -= def.cost;
        const upgrades = this.plantUpgrades[def.id] || {};
        const plant = {
            ...def,
            x: gridOffsetX + col*cellW,
            lane, col, timer: 0,
            dmg: def.dmg + (upgrades.dmg||0),
            rate: Math.max(10, def.rate + (upgrades.rate||0)),
            range: def.range + (upgrades.range||0),
            hp: def.hp || 0,
            maxHp: def.hp || 0
        };
        this.grid[lane][col] = plant;
        this.plants.push(plant);
        this.startPlantCooldown(def.id);
        SFX.place();
        this.updateHUD();
        this.buildPlantBar();
    },

    toggleSellMode() {
        this.sellMode = !this.sellMode;
        const btn = document.getElementById('sell-btn');
        btn.style.background = this.sellMode ? 'rgba(220,38,38,0.9)' : 'rgba(0,0,0,0.8)';
        btn.style.borderColor = this.sellMode ? '#dc2626' : '#4ade8060';
        canvas.style.cursor = this.sellMode ? 'crosshair' : 'default';
    },

    toggleSpeed() {
        this.gameSpeed = this.gameSpeed >= 3 ? 1 : this.gameSpeed + 1;
        document.getElementById('speed-btn').textContent = `▶ ${this.gameSpeed}x`;
    },

    toggleMute() {
        SFX.muted = !SFX.muted;
        document.getElementById('mute-btn').textContent = SFX.muted ? '🔇' : '🔊';
    },

    sellPlant(lane, col) {
        if (this.state !== 'playing') return;
        const occupant = this.grid[lane][col];
        if (!occupant) return;
        if (occupant.type === 'lilypad' && occupant.rider) {
            // Sell just the rider plant, leave the lily pad in place
            const rider = occupant.rider;
            const refund = Math.floor((rider.cost || 0) * 0.1);
            this.sun += refund;
            this.plants.splice(this.plants.indexOf(rider), 1);
            occupant.rider = null;
            this.particles.push({x: rider.x, y: gridOffsetY + lane*cellH + cellH/2, size: 15, life: 15, color: '#facc15'});
            SFX.sell();
            this.updateHUD();
            this.buildPlantBar();
            return;
        }
        const refund = Math.floor((occupant.cost || 0) * 0.1);
        this.sun += refund;
        this.grid[lane][col] = null;
        this.plants.splice(this.plants.indexOf(occupant), 1);
        this.particles.push({x: occupant.x, y: gridOffsetY + lane*cellH + cellH/2, size: 15, life: 15, color: '#facc15'});
        SFX.sell();
        this.updateHUD();
        this.buildPlantBar();
    }
};

// Shop UI
const SHOP_ITEMS = [
    {key:'starting_sun_upgrade',name:'Starting Sun +25',cost:20,max:5},
    {key:'reward_choices_upgrade',name:'+1 Reward Choice',cost:50,max:3},
    {key:'rerolls_upgrade',name:'+1 Reroll',cost:30,max:3},
];

function updateShopUI() {
    const el = document.getElementById('shop-coins');
    if (el) el.textContent = window.PlatformManager?.getCoins?.()||0;
    const container = document.getElementById('shop-items');
    if (!container) return;
    container.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        const level = saveData[item.key] || 0;
        const cost = item.cost * (level+1);
        const maxed = level >= item.max;
        const div = document.createElement('div');
        div.className = 'shop-upgrade';
        div.innerHTML = `<div><div class="text-white font-semibold text-sm">${item.name}</div><div class="text-gray-400 text-xs">Level ${level}/${item.max}</div></div>`;
        if (!maxed) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-yellow text-xs';
            btn.textContent = `${cost} 🪙`;
            btn.disabled = window.PlatformManager.getCoins() < cost;
            btn.style.opacity = btn.disabled ? '0.5' : '1';
            btn.onclick = async () => {
                if (!window.PlatformManager.spendCoins(cost)) return;
                saveData[item.key] = level + 1;
                await persistSave();
                updateShopUI();
            };
            div.appendChild(btn);
        } else {
            const span = document.createElement('span');
            span.className = 'text-green-400 text-xs font-bold';
            span.textContent = 'MAXED';
            div.appendChild(span);
        }
        container.appendChild(div);
    });

    const plantsContainer = document.getElementById('shop-plants');
    if (plantsContainer) {
        plantsContainer.innerHTML = '';
        const unlockable = PLANT_DEFS.filter(p => p.unlockCost).sort((a,b) => a.unlockCost - b.unlockCost);
        unlockable.forEach(p => {
            const owned = (saveData.unlockedShopPlants||[]).includes(p.id);
            const div = document.createElement('div');
            div.className = 'shop-upgrade';
            div.innerHTML = `<div><div class="text-white font-semibold text-sm">${p.name}</div><div class="text-gray-400 text-xs">${p.desc}</div></div>`;
            if (!owned) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-yellow text-xs';
                btn.textContent = `${p.unlockCost} 🪙`;
                btn.disabled = window.PlatformManager.getCoins() < p.unlockCost;
                btn.style.opacity = btn.disabled ? '0.5' : '1';
                btn.onclick = async () => {
                    if (!window.PlatformManager.spendCoins(p.unlockCost)) return;
                    saveData.unlockedShopPlants = [...(saveData.unlockedShopPlants||[]), p.id];
                    await persistSave();
                    updateShopUI();
                };
                div.appendChild(btn);
            } else {
                const span = document.createElement('span');
                span.className = 'text-green-400 text-xs font-bold';
                span.textContent = 'OWNED';
                div.appendChild(span);
            }
            plantsContainer.appendChild(div);
        });
    }
}

// Click handling
canvas.addEventListener('click', (e) => {
    if (Game.state !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const col = Math.floor((mx - gridOffsetX) / cellW);
    const lane = Math.floor((my - gridOffsetY) / cellH);
    if (col >= 0 && col < COLS && lane >= 0 && lane < LANES) {
        const key = `${lane}_${col}`;
        if (Game.debris[key]) {
            Game.clearDebris(lane, col);
        } else if (Game.sellMode) {
            Game.sellPlant(lane, col);
        } else {
            Game.placePlant(lane, col);
        }
    }
});

// Game loop
function gameLoop() {
    for (let i=0; i<Game.gameSpeed; i++) Game.update();
    Game.draw();
    window.PlatformManager?.heartbeat?.(window.GAME_CONFIG.id,Game.state==='playing');
    if(Game.state==='playing')window.ChallengeManager?.update?.({score:Game.score,wave:Game.wave,alive:Game.health>0});
    requestAnimationFrame(gameLoop);
}
gameLoop();

function updateHomeStats(){
    const stats=window.PlatformManager?.getGameStats?.(window.GAME_CONFIG.id)||{};
    document.getElementById('home-best-wave').textContent=saveData.highest_wave||0;
    document.getElementById('home-high-score').textContent=stats.highScore||0;
    document.getElementById('home-correct').textContent=stats.correct||0;
    document.getElementById('home-coins').textContent=window.PlatformManager?.getCoins?.()||0;
}

async function preparePlatform(){
    updateHomeStats();
    const result=await window.QuestionManager.loadCurrentBank('multichoice');
    const status=document.getElementById('garden-class-status');
    if(result.ok){status.textContent=`Class questions ready: ${window.QuestionManager.getBankName()}`;document.getElementById('gardenStartBtn').disabled=false;}
    else status.textContent=result.error==='class-code-required'?'Please enter your class code on the Arcade Academy Hub.':'This class does not have compatible questions for this game.';
    const register=()=>window.ChallengeManager?.register?.({start:()=>Game.startRun(),snapshot:()=>({score:Game.score,wave:Game.wave,alive:Game.health>0})});
    register();window.addEventListener('arcade-challenge-manager-ready',register,{once:true});
}
window.addEventListener('arcade-coins-changed',()=>{updateHomeStats();updateShopUI();});
preparePlatform();
