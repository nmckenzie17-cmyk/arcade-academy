'use strict';
/* =========================================================================
   CUBE CURIOSITY — Geometry-Dash-style endless precision roguelike
   Split across index.html / style.css / game.js for Arcade Academy
   integration. Checkpoint flow is deliberately isolated (see
   CheckpointFlow) so a Question Phase can be spliced in between "reach
   checkpoint" and "show upgrades" later without touching movement /
   collision / chunk-generation code.
   ========================================================================= */

  /* ------------------------------- CONFIG ------------------------------- */
  const CONFIG = {
    RUN_SPEED: 380,          // px/sec base scroll speed
    GRAVITY: 2200,           // px/sec^2
    JUMP_FORCE: 780,         // initial upward velocity
    MAX_FALL_SPEED: 1500,
    GROUND_Y_RATIO: 0.72,    // ground line as ratio of canvas height
    ROOF_HEIGHT: 20,         // thickness of the solid roof band during reversed gravity
    PLAYER_SIZE: 40,
    PLAYER_VISUAL_PAD: 6,    // visible cube bigger than hitbox by this many px
    PLAYER_X_RATIO: 0.28,    // player sits ~28% across the screen
    CHECKPOINT_DISTANCE: 500, // metres per stage
    CHECKPOINTS_PER_STAGE: 2, // sub-checkpoints within each stage; only the last one per stage advances stage/theme/speed
    MAX_SPEED_MULT: 1.35,
    SPEED_STEP: 0.03,        // +3% per stage, capped
    NEAR_MISS_DIST: 26,      // px proximity counts as near miss
    NEAR_MISS_COOLDOWN: 0.6,
    COMBO_DECAY_TIME: 3.2,   // seconds of inactivity before combo resets
    STARTING_LIVES: 3,       // checkpoint respawns allowed per run before a full restart
    JUMP_BUFFER_TIME: 0.12,  // seconds a jump press is "remembered" before landing
    ARCADE_HUB_URL: '../../index.html',
  };

  const GAME_ID = window.GAME_CONFIG?.id || 'cube-curiosity';
  const QUESTION_TYPE = window.GAME_CONFIG?.questionType || 'multichoice';
  const CORRECT_REWARD = 10;
  const INCORRECT_PENALTY = 5;
  const hasReward = id => (document.documentElement.dataset.arcadeCosmetics || '').split(' ').includes(id);

  const PPM = 16; // pixels-per-metre for distance display (visual scaling only)

  /* ------------------------------ CANVAS -------------------------------- */
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, GROUND_Y = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  // Set by ChunkManager right before building each chunk — lets obstacle
  // factories that don't take an explicit ground-y argument (like gap())
  // still track Cyber City's stepped terrain without touching every call site.
  let CHUNK_GROUND_REF = 0;

  function resize(){
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
    GROUND_Y = Math.round(H * CONFIG.GROUND_Y_RATIO);
    CHUNK_GROUND_REF = GROUND_Y;
  }
  window.addEventListener('resize', resize);
  resize();

  /* ----------------------------- UTILITIES ------------------------------ */
  const rand = (a,b) => a + Math.random()*(b-a);
  const randInt = (a,b) => Math.floor(rand(a,b+1));
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
  function weightedPick(items, weightFn){
    const total = items.reduce((s,i)=>s+weightFn(i),0);
    let r = Math.random()*total;
    for(const it of items){ r -= weightFn(it); if(r<=0) return it; }
    return items[items.length-1];
  }
  // Rolled fresh every time a chunk is built, so the same chunk id can turn
  // out bouncy or not from one appearance to the next — this is what makes
  // bounce pads read as scattered through the run rather than fixed to a
  // couple of dedicated chunks.
  function maybeBouncy(chance=0.35){ return Math.random() < chance; }
  function aabb(a,b){
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  /* ---------------------------- INPUT MANAGER ---------------------------- */
  class InputManager {
    constructor(){
      this.jumpPressed = false;   // edge-triggered "just pressed"
      this.jumpHeld = false;
      this.downPressed = false;
      this.dashPressed = false;
      this.timeSlowPressed = false;
      this._jumpKeyDown = false;
      this._suppressNextPointerJump = false;

      window.addEventListener('keydown', (e)=>{
        if(['Space','ArrowUp','KeyW'].includes(e.code)){
          e.preventDefault();
          if(!this._jumpKeyDown){ this.jumpPressed = true; }
          this._jumpKeyDown = true; this.jumpHeld = true;
        } else if(e.code === 'ArrowDown' || e.code === 'KeyS'){
          this.downPressed = true;
        } else if(e.code === 'ShiftLeft' || e.code === 'ShiftRight'){
          this.dashPressed = true;
        } else if(e.code === 'KeyE'){
          this.timeSlowPressed = true;
        }
      });
      window.addEventListener('keyup', (e)=>{
        if(['Space','ArrowUp','KeyW'].includes(e.code)){
          this._jumpKeyDown = false; this.jumpHeld = false;
        } else if(e.code === 'ArrowDown' || e.code === 'KeyS'){
          this.downPressed = false;
        }
      });

      const jumpZone = document.getElementById('jumpZone');
      const triggerDown = (ev)=>{
        if(this._suppressNextPointerJump){ this._suppressNextPointerJump = false; return; }
        if(!this._jumpKeyDown){ this.jumpPressed = true; this.jumpHeld = true; this._jumpKeyDown = true; }
      };
      jumpZone.addEventListener('mousedown', triggerDown);
      jumpZone.addEventListener('mouseup', ()=>{ this.jumpHeld=false; this._jumpKeyDown=false; });
      jumpZone.addEventListener('touchstart', (e)=>{ e.preventDefault(); triggerDown(e); }, {passive:false});
      jumpZone.addEventListener('touchend', (e)=>{ e.preventDefault(); this.jumpHeld=false; this._jumpKeyDown=false; }, {passive:false});

      this.abilityHandlers = { dash:null, timeslow:null, groundslam:null, blink:null };
    }
    markPointerConsumed(){ this._suppressNextPointerJump = true; }
    consumeJumpPress(){ const j = this.jumpPressed; this.jumpPressed = false; return j; }
    consumeDash(){ const d = this.dashPressed; this.dashPressed = false; return d; }
    consumeTimeSlow(){ const t = this.timeSlowPressed; this.timeSlowPressed = false; return t; }
  }

  /* --------------------------- PARTICLE SYSTEM --------------------------- */
  class ParticleSystem {
    constructor(){ this.particles = []; this.maxParticles = 300; }
    spawn(p){
      if(this.particles.length >= this.maxParticles) this.particles.shift();
      this.particles.push(Object.assign({ life:1, age:0, size:4, vx:0, vy:0, color:'#35f5ff', gravity:0, shape:'square' }, p));
    }
    burstJump(x,y,color){
      for(let i=0;i<6;i++) this.spawn({x,y, vx:rand(-60,60), vy:rand(20,90), life:0.4, size:rand(2,4), color, gravity:400});
    }
    burstLand(x,y,color){
      for(let i=0;i<8;i++) this.spawn({x,y, vx:rand(-90,90), vy:rand(-60,-10), life:0.35, size:rand(2,4), color, gravity:600});
    }
    burstCoin(x,y){
      for(let i=0;i<10;i++) this.spawn({x,y, vx:rand(-70,70), vy:rand(-140,-40), life:0.5, size:rand(2,3), color:'#ffe23d', gravity:500});
    }
    burstDeath(x,y){
      for(let i=0;i<40;i++) this.spawn({x,y, vx:rand(-260,260), vy:rand(-320,60), life:rand(0.5,1.0), size:rand(3,7), color: pick(['#35f5ff','#ff2ee6','#ffe23d','#ff3d5a']), gravity:700});
    }
    burstPortal(x,y,color){
      for(let i=0;i<14;i++) this.spawn({x,y, vx:rand(-40,40), vy:rand(-40,40), life:0.5, size:rand(2,5), color, gravity:0});
    }
    trail(x,y,color){
      this.spawn({x,y, vx:rand(-20,10), vy:rand(-10,10), life:0.3, size:rand(2,3), color, gravity:0});
    }
    update(dt){
      for(const p of this.particles){
        p.age += dt;
        p.x += p.vx*dt; p.y += p.vy*dt;
        p.vy += p.gravity*dt;
      }
      this.particles = this.particles.filter(p=>p.age < p.life);
    }
    render(ctx){
      for(const p of this.particles){
        const t = 1 - p.age/p.life;
        ctx.globalAlpha = clamp(t,0,1);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        if(p.shape === 'square') ctx.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
        else { ctx.beginPath(); ctx.arc(p.x,p.y,p.size/2,0,Math.PI*2); ctx.fill(); }
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
  }

  /* --------------------------------- THEMES ------------------------------ */
  const THEMES = [
    { name:'NEON GRID', bg:['#0a0730','#170a3d'], accent:'#35f5ff', ground:'#1b1150', groundLine:'#35f5ff', deco:'#2a1a66' },
    { name:'INFERNO', bg:['#2a0705','#450a05'], accent:'#ff6a2e', ground:'#3a0d08', groundLine:'#ff6a2e', deco:'#5c150a' },
    { name:'CYBER CITY', bg:['#050515','#0d0d2b'], accent:'#ff2ee6', ground:'#150d33', groundLine:'#ff2ee6', deco:'#20123f' },
    { name:'TOXIC FACTORY', bg:['#081208','#0f1f0a'], accent:'#3dff8f', ground:'#0f2110', groundLine:'#3dff8f', deco:'#163a1a' },
    { name:'THE VOID', bg:['#020103','#0a0512'], accent:'#9b3dff', ground:'#0d081c', groundLine:'#9b3dff', deco:'#160f2e' },
  ];

  /* ------------------------------ PLAYER SKINS ----------------------------- */
  const SKIN_COLORS = [
    { id:'cyan',   color:'#35f5ff', name:'Academy Cyan', cost:0 },
    { id:'pink',   color:'#ff2ee6', name:'Neon Pink', cost:75 },
    { id:'yellow', color:'#ffe23d', name:'Scholar Gold', cost:100 },
    { id:'green',  color:'#3dff8f', name:'Toxic Green', cost:125 },
    { id:'purple', color:'#9b3dff', name:'Void Purple', cost:150 },
    { id:'red',    color:'#ff3d5a', name:'Inferno Red', cost:175 },
  ];
  const FACE_PATTERNS = [
    { id:'dots', name:'Pixel Dots', cost:0, draw(ctx, half, color){
      ctx.fillStyle = color;
      ctx.fillRect(-half*0.35,-half*0.35, half*0.35, half*0.35);
      ctx.fillRect(0, 0, half*0.35, half*0.35);
    } },
    { id:'visor', name:'Cyber Visor', cost:100, draw(ctx, half, color){
      ctx.fillStyle = color;
      ctx.fillRect(-half*0.6, -half*0.18, half*1.2, half*0.36);
    } },
    { id:'cross', name:'Hazard Cross', cost:125, draw(ctx, half, color){
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-half*0.4,-half*0.4); ctx.lineTo(half*0.4,half*0.4);
      ctx.moveTo(half*0.4,-half*0.4); ctx.lineTo(-half*0.4,half*0.4); ctx.stroke();
    } },
    { id:'ring', name:'Gravity Ring', cost:150, draw(ctx, half, color){
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0,0,half*0.42,0,Math.PI*2); ctx.stroke();
    } },
  ];
  class ThemeManager {
    constructor(){ this.stage = 1; this.theme = THEMES[0]; this.starLayer = this._makeStars(); }
    _makeStars(){ const s=[]; for(let i=0;i<80;i++) s.push({x:Math.random(), y:Math.random()*0.65, r:rand(0.5,2), speed:rand(0.1,0.4)}); return s; }
    setStage(stage){
      this.stage = stage;
      const expectedIndex = (stage-1) % THEMES.length;
      if(Math.random() < 0.1 && THEMES.length > 1){
        // 10% of the time, break the sequential cycle and drop in a
        // different theme instead of the expected next one.
        const otherIndices = THEMES.map((_,i)=>i).filter(i=>i!==expectedIndex);
        const idx = otherIndices[Math.floor(Math.random()*otherIndices.length)];
        this.theme = THEMES[idx];
      } else {
        this.theme = THEMES[expectedIndex];
      }
    }
    render(ctx, scrollX){
      const th = this.theme;
      const grad = ctx.createLinearGradient(0,0,0,H);
      grad.addColorStop(0, th.bg[0]); grad.addColorStop(1, th.bg[1]);
      ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);
      // stars / parallax specks
      ctx.fillStyle = th.accent;
      for(const s of this.starLayer){
        const x = ((s.x*W) - (scrollX*s.speed*0.05)) % (W+40);
        const px = x < 0 ? x+W+40 : x;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(px, s.y*H, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      // parallax deco blocks (skyline-ish silhouettes)
      ctx.fillStyle = th.deco;
      const blockW = 90;
      const offset = (scrollX*0.15) % blockW;
      for(let x = -blockW - offset; x < W+blockW; x += blockW){
        const hh = 60 + (Math.sin(x*0.01+this.stage)+1)*50;
        ctx.fillRect(x, GROUND_Y-hh, blockW*0.6, hh);
      }
      // ground
      ctx.fillStyle = th.ground;
      ctx.fillRect(0, GROUND_Y, W, H-GROUND_Y);
      ctx.fillStyle = th.groundLine;
      ctx.shadowColor = th.groundLine; ctx.shadowBlur = 12;
      ctx.fillRect(0, GROUND_Y, W, 3);
      ctx.shadowBlur = 0;
    }
  }

  /* ------------------------------- PLAYER --------------------------------- */
  class Player {
    constructor(game){
      this.game = game;
      this.reset();
    }
    reset(){
      this.x = W * CONFIG.PLAYER_X_RATIO;
      this.y = GROUND_Y - CONFIG.PLAYER_SIZE;
      this.vy = 0;
      this.size = CONFIG.PLAYER_SIZE;
      this.grounded = true;
      this.rotation = 0;
      this.gravityDir = 1; // 1 = normal, -1 = reversed
      this.alive = true;
      this.hitboxScale = 1;
      this.form = 'cube'; // 'cube' | 'ship' — architecture supports adding ball/ufo/wave later
      this.sizeScale = 1; this.sizeTimer = 0; // temporary Size Portal shrink
      this.squash = 1; this.stretch = 1; this.squashTimer = 0; // landing/jump juice
      // upgrade-driven stats
      this.jumpForceMult = 1;
      this.gravityMult = 1;
      this.fallSpeedMult = 1;
      this.airControl = false;
      this.extraJumps = 0;       // double/triple jump charges
      this.jumpsUsed = 0;
      this.hasShield = false;
      this.regenShield = false;
      this.secondChance = false;
      this.secondChanceUsed = false;
      this.hasPhase = false;
      this.phaseTimer = 0;
      this.dashCharges = 0; this.dashMax = 0; this.dashCooldownT = 0; this.dashActive = 0;
      this.hoverEnabled = false; this.hovering = false;
      this.timeSlowMax = 0; this.timeSlowMeter = 0; this.timeSlowActive = 0;
      this.blinkCooldownMax = 0; this.blinkCooldownT = 0;
      this.groundSlamActive = false;
      this.trailColor = this.game.skinPrefs.color;
      this.landedThisFrame = false;
      this.recentlyLanded = 0;
      this.trailHistory = [];
    }
    get renderSize(){ return this.size * this.sizeScale; }
    get hitbox(){
      const s = this.renderSize;
      const pad = (s * (1-this.hitboxScale)) / 2 + CONFIG.PLAYER_VISUAL_PAD*0.5;
      return { x:this.x+pad, y:this.y+pad, w:s-pad*2, h:s-pad*2 };
    }
    jump(){
      if(this.form !== 'cube') return false; // ship uses thrust, not discrete jumps
      if(this.grounded){
        this.vy = -CONFIG.JUMP_FORCE * this.jumpForceMult * this.gravityDir;
        this.grounded = false;
        this.jumpsUsed = 0;
        this.squashTimer = 0.14; // stretch on launch
        this.game.particles.burstJump(this.x+this.renderSize/2, this.y+this.renderSize, this.trailColor);
        return true;
      } else if(this.jumpsUsed < this.extraJumps){
        this.jumpsUsed++;
        this.vy = -CONFIG.JUMP_FORCE * this.jumpForceMult * 0.92 * this.gravityDir;
        this.squashTimer = 0.14;
        this.game.particles.burstJump(this.x+this.renderSize/2, this.y+this.renderSize/2, '#ff2ee6');
        return true;
      }
      return false;
    }
    tryDash(){
      if(this.dashMax<=0 || this.dashCharges<=0 || this.dashActive>0) return;
      this.dashCharges--; this.dashActive = 0.18;
      this.game.particles.burstJump(this.x, this.y+this.renderSize/2, '#ffffff');
    }
    tryBlink(){
      if(this.blinkCooldownMax<=0 || this.blinkCooldownT>0) return;
      this.blinkCooldownT = this.blinkCooldownMax;
      this.x += 140;
      this.game.particles.burstPortal(this.x, this.y+this.renderSize/2, '#9b3dff');
    }
    tryTimeSlow(){
      if(this.timeSlowMax<=0 || this.timeSlowMeter<=0.05 || this.timeSlowActive>0) return;
      this.timeSlowActive = Math.min(this.timeSlowMeter, 1.6);
    }
    groundSlam(){
      if(this.form==='cube' && !this.grounded && this.vy*this.gravityDir >= 0){
        this.vy = CONFIG.MAX_FALL_SPEED * this.gravityDir;
        this.groundSlamActive = true;
      }
    }
    applyUpgrade(id){
      switch(id){
        case 'spring_loaded': this.jumpForceMult += 0.08; break;
        case 'featherweight': this.gravityMult *= 0.92; break;
        case 'heavy_landing': this.fallSpeedMult *= 1.18; break;
        case 'air_control': this.airControl = true; break;
        case 'double_jump': this.extraJumps = Math.max(this.extraJumps, 1); break;
        case 'triple_jump': if(this.extraJumps>=1) this.extraJumps = 2; break;
        case 'shield': this.hasShield = true; break;
        case 'regen_shield': this.regenShield = true; this.hasShield = true; break;
        case 'second_chance': this.secondChance = true; this.secondChanceUsed = false; break;
        case 'phase': this.hasPhase = true; break;
        case 'smaller_hitbox': this.hitboxScale *= 0.8; break;
        case 'dash': this.dashMax += 1; this.dashCharges = this.dashMax; break;
        case 'time_slow': this.timeSlowMax = Math.max(this.timeSlowMax, 3); this.timeSlowMeter = this.timeSlowMax; break;
        case 'ground_slam': this.canGroundSlam = true; break;
        case 'hover': this.hoverEnabled = true; break;
        case 'blink': this.blinkCooldownMax = 5; break;
      }
    }
    onStageStart(){
      if(this.regenShield) this.hasShield = true;
      this.dashCharges = this.dashMax;
    }
    setForm(form){
      this.form = form;
      this.vy = 0; this.grounded = false;
      this.game.particles.burstPortal(this.x+this.renderSize/2, this.y+this.renderSize/2, form==='ship' ? '#ffe23d' : '#35f5ff');
    }
    setGravityDir(dir){
      this.gravityDir = dir;
      this.vy = 0; this.grounded = false;
      this.game.particles.burstPortal(this.x+this.renderSize/2, this.y+this.renderSize/2, '#ffffff');
    }
    setSizeScale(scale, duration){
      this.sizeScale = scale; this.sizeTimer = duration;
      this.game.particles.burstPortal(this.x+this.renderSize/2, this.y+this.renderSize/2, '#3dff8f');
    }
    // Timers/abilities that tick every frame regardless of which form's physics is active.
    // Returns the extra forward speed bonus contributed by an active dash this frame.
    tickTimers(dt, speed){
      let dashSpeedBonus = 0;
      if(this.dashActive > 0){ this.dashActive -= dt; dashSpeedBonus = speed*1.8; this.game.particles.trail(this.x, this.y+this.renderSize/2, '#ffffff'); }
      if(this.dashCooldownT>0) this.dashCooldownT -= dt;
      if(this.blinkCooldownT>0) this.blinkCooldownT -= dt;
      if(this.timeSlowActive>0){ this.timeSlowActive -= dt; this.timeSlowMeter -= dt; }
      else if(this.timeSlowMax>0){ this.timeSlowMeter = Math.min(this.timeSlowMax, this.timeSlowMeter + dt*0.25); }
      if(this.phaseTimer>0) this.phaseTimer -= dt;
      if(this.recentlyLanded>0) this.recentlyLanded -= dt;
      if(this.sizeTimer>0){ this.sizeTimer -= dt; if(this.sizeTimer<=0){ this.sizeScale = 1; } }
      if(this.squashTimer>0) this.squashTimer -= dt;
      // trail afterimage history (screen-space snapshot, most recent first)
      this.trailHistory.unshift({ x:this.x, y:this.y, rot:this.rotation, size:this.renderSize });
      if(this.trailHistory.length > 6) this.trailHistory.pop();
      return dashSpeedBonus;
    }
    updateCube(dt, input){
      this.landedThisFrame = false;
      // gravity / fall
      let g = CONFIG.GRAVITY * this.gravityMult;
      const hovering = this.hoverEnabled && input.jumpHeld && !this.grounded && (this.vy*this.gravityDir > 40);
      if(hovering){ g *= 0.35; }
      this.vy += g * this.gravityDir * dt;
      const maxFall = CONFIG.MAX_FALL_SPEED * this.fallSpeedMult;
      this.vy = clamp(this.vy, -maxFall, maxFall);
      this.y += this.vy * dt;

      // rotation
      if(!this.grounded){
        this.rotation += dt * 10 * this.gravityDir;
      } else {
        this.rotation = Math.round(this.rotation / (Math.PI/2)) * (Math.PI/2);
      }
    }
    updateShip(dt, input){
      this.landedThisFrame = false;
      const THRUST = 1500;
      const g = CONFIG.GRAVITY * 0.6 * this.gravityMult;
      const accel = (input.jumpHeld ? -THRUST : g) * this.gravityDir;
      this.vy += accel * dt;
      this.vy = clamp(this.vy, -820, 820);
      this.y += this.vy * dt;
      // gentle nose-up/down tilt based on vertical velocity — no discrete rotation snap
      this.rotation = clamp((this.vy/900) * this.gravityDir, -0.5, 0.5);
      this.grounded = false;
    }
    land(){
      if(!this.grounded){
        this.game.particles.burstLand(this.x+this.renderSize/2, this.y+this.renderSize, this.trailColor);
        this.recentlyLanded = 0.12;
        this.squashTimer = 0.16; // squash on impact
        if(this.hasPhase) this.phaseTimer = 0.35;
        this.landedThisFrame = true;
      }
      this.grounded = true; this.vy = 0; this.rotation = 0; this.jumpsUsed = 0; this.groundSlamActive = false;
    }
    // Called only when the caller has confirmed this is a genuine
    // airborne->grounded transition onto a bouncy surface (see
    // _isOnPlatformNow) — never for a player already resting on one, so
    // running/sliding across a bouncy stretch does nothing, only landing on
    // it does. The bounce is purely a reversal of whatever vertical speed
    // you actually hit it with, scaled up 1.5x — a soft tap gives a soft
    // bounce, a fast fall gives a big one. Horizontal/world-scroll speed is
    // never touched here at all.
    bounceLand(){
      const color = '#ff2ee6';
      this.game.particles.burstLand(this.x+this.renderSize/2, this.y+this.renderSize, color);
      this.recentlyLanded = 0.12;
      this.squashTimer = 0.22; // bigger squash than a normal landing
      this.landedThisFrame = true;
      this.vy = -this.vy * 1.5;
      this.grounded = false;
      this.jumpsUsed = 0;
      this.game.particles.burstJump(this.x+this.renderSize/2, this.y+this.renderSize, color);
    }
    hitHazard(){
      if(this.phaseTimer>0) return false; // immune just after landing
      if(this.hasShield){ this.hasShield = false; this.game.flash('#35f5ff'); return false; }
      if(this.secondChance && !this.secondChanceUsed){
        this.secondChanceUsed = true;
        this.game.flash('#ffe23d');
        this.x = Math.max(this.x - 220, W*0.1);
        this.vy = 0; this.grounded = false;
        return false;
      }
      return true; // real death
    }
  }

  /* ------------------------------ OBSTACLES ------------------------------- */
  // All world objects share {x,y,w,h,type} in WORLD space (x increases with distance travelled).
  // Obstacle factory helpers used by chunk builders.
  const Obstacles = {

    spike(x, groundY, count=1, spacing=34){
      const list = [];
      for(let i=0;i<count;i++){
        list.push({ type:'spike', x:x+i*spacing, y:groundY-30, w:30, h:30, lethal:true });
      }
      return list;
    },
    gap(x, width){
      return [{ type:'gap', x, y:CHUNK_GROUND_REF, w:width, h:H-CHUNK_GROUND_REF, lethal:true }];
    },
    platform(x, y, w, h=18, bouncy=false){
      return [{ type:'platform', x, y, w, h, lethal:false, solidTop:true, bouncy }];
    },
    // A landable surface that auto-launches the player upward the instant
    // they LAND on it. Walking/sliding across one while already grounded
    // does nothing — only an actual airborne->grounded transition bounces.
    // Place it elevated (like a normal platform) or flush with the ground
    // (y close to GROUND_Y) to make a stretch of the floor itself bouncy.
    bouncePad(x, y, w, h=6){
      return [{ type:'platform', x, y, w, h, lethal:false, solidTop:true, bouncy:true }];
    },
    ceiling(x, w, dropHeight){
      return [{ type:'ceiling', x, y:0, w, h:dropHeight, lethal:true }];
    },
    movingBlock(x, y, w, h, axis, range, speed){
      return [{ type:'movingblock', x, y, w, h, lethal:true, axis, range, speed, phase:Math.random()*Math.PI*2, baseX:x, baseY:y }];
    },
    jumpPad(x, y, strength){ // strength: 'yellow' | 'pink' | 'red'
      return [{ type:'jumppad', x, y:y-14, w:34, h:14, strength, used:false }];
    },
    jumpOrb(x, y){
      return [{ type:'jumporb', x, y, w:26, h:26, used:false, pulse:0 }];
    },
    coin(x, y){
      return [{ type:'coin', x, y, w:18, h:18, collected:false, spin:0 }];
    },
    portal(x, y, kind){ // 'speed' | 'slow' | 'gravity' | 'size'
      return [{ type:'portal', x, y:y-60, w:26, h:120, kind, triggered:new Set() }];
    },
    formPortal(x, y, form){ // 'ship' | 'cube' — switches the player's active form
      return [{ type:'formportal', x, y:y-70, w:30, h:140, form, triggered:new Set() }];
    },
    // A corridor obstacle for ship-mode chunks: a hazard block anchored to
    // either the floor or ceiling, sized to leave a specific flight gap.
    shipWall(x, fromTop, w, h){
      return [{ type:'shipwall', x, y: fromTop ? 0 : GROUND_Y-h, w, h, lethal:true }];
    },
    // Rotating blade orbiting a fixed anchor point — anchor itself doesn't
    // move, only the blade sweeps around it, so the danger zone changes
    // shape as the player passes through.
    rotor(x, y, radius, speed, bladeSize=26){
      return [{ type:'rotor', x, y, radius, speed, bladeSize, phase:Math.random()*Math.PI*2, w:bladeSize, h:bladeSize, lethal:true }];
    },
    // Vertical beam that idles (safe, dashed guide visible), then pulses
    // with a warning glow, THEN goes lethal for a short window, on a
    // repeating cycle — the warning phase is real reaction time, not a
    // memorized pattern, so it stays fair even in a procedurally-generated
    // sequence.
    laser(x, w, warnTime=0.5, activeTime=0.4, idleTime=1.3){
      return [{ type:'laser', x, y:0, w, h:GROUND_Y, warnTime, activeTime, idleTime,
        cycle: warnTime+activeTime+idleTime, phase: Math.random()*(warnTime+activeTime+idleTime), lethal:true }];
    },
    // Slowly drifts its vertical position toward the player's current
    // height as it scrolls closer, forcing a reactive dodge rather than a
    // pre-planned jump — reserved for late-game chaos (tier 5+).
    homer(x, y, size=30, trackSpeed=90){
      return [{ type:'homer', x, y, w:size, h:size, trackSpeed, lethal:true }];
    }
  };

  /* ---- Reverse-gravity chunk builder helper ------------------------------
     Per spec: never flip gravity mid-chunk arbitrarily — only these
     dedicated chunks (which bookend themselves with a gravity portal on the
     way in and another on the way out) use reversed-gravity obstacle
     placement, and everything reverts to normal before the chunk ends so
     the next chunk can assume normal 'ground' entry again.
  ------------------------------------------------------------------------- */
  function buildGravityZone(x, g, hazardCount){
    const objects = [...Obstacles.portal(x+120, g, 'gravity')];
    // hazards placed near the ceiling (y=0) using the existing 'ceiling'
    // obstacle type, which already renders/collides as a hanging spike row —
    // exactly the shape needed for "spikes on the new floor" once flipped.
    let cursor = x + 260;
    for(let i=0;i<hazardCount;i++){
      objects.push(...Obstacles.ceiling(cursor, 70, 34));
      cursor += 190;
    }
    objects.push(...Obstacles.portal(cursor+40, g, 'gravity')); // flip back
    const length = cursor + 40 + 340; // trailing flat buffer to let the player settle back onto the ground
    return { length, objects };
  }
  function buildShipZone(x, g, segments){
    const objects = [...Obstacles.formPortal(x+120, g, 'ship')];
    let cursor = x + 260;
    for(const seg of segments){
      objects.push(...Obstacles.shipWall(cursor, true, 120, seg.top));
      objects.push(...Obstacles.shipWall(cursor, false, 120, seg.bottom));
      cursor += 220;
    }
    objects.push(...Obstacles.formPortal(cursor+40, g, 'cube')); // revert to cube
    const length = cursor + 40 + 260;
    return { length, objects };
  }
  function buildSizeZone(x, g){
    const objects = [
      ...Obstacles.portal(x+120, g, 'size'),
      ...Obstacles.gap(x+260, 70),
      ...Obstacles.ceiling(x+420, 110, g-30), // only a shrunk player clears this gap
      ...Obstacles.gap(x+640, 70),
    ];
    return { length: 920, objects };
  }

  /* -------------------------------- CHUNKS -------------------------------- */
  // Each chunk: {id, tier, requires:[], entryHeight:'ground', exitHeight:'ground', minSpeedOK:true, build(x, groundY)->{objects, length}}
  // entry/exit height: 'ground' (player on floor) ensures chunks compose safely back-to-back.
  const CHUNK_LIBRARY = [];
  function defChunk(id, tier, buildFn, opts={}){
    CHUNK_LIBRARY.push(Object.assign({ id, tier, requires:[], entry:'ground', exit:'ground' }, opts, { build:buildFn }));
  }

  // ---- Tier 1 ----
  defChunk('t1_flat', 1, (x,g)=>({ length: 260, objects: [] }));
  defChunk('t1_single_spike', 1, (x,g)=>({ length: 340, objects: Obstacles.spike(x+180, g, 1) }));
  defChunk('t1_spike_gap_recovery', 1, (x,g)=>({ length: 420, objects: Obstacles.spike(x+160,g,1) }));
  defChunk('t1_small_gap', 1, (x,g)=>({ length: 380, objects: Obstacles.gap(x+160, 70) }));
  defChunk('t1_low_platform', 1, (x,g)=>({ length: 380, objects: Obstacles.platform(x+150, g-70, 140, maybeBouncy(0.25)) }));
  defChunk('t1_ground_bounce', 1, (x,g)=>({ length: 460, objects: [...Obstacles.bouncePad(x+150, g-1, 120), ...Obstacles.gap(x+280, 90)] }));
  defChunk('t1_coin_arc', 1, (x,g)=>({ length: 360, objects: [...Obstacles.spike(x+170,g,1), ...Obstacles.coin(x+170, g-90)] }));
  defChunk('t1_two_singles', 1, (x,g)=>({ length: 520, objects: [...Obstacles.spike(x+150,g,1), ...Obstacles.spike(x+360,g,1)] }));
  defChunk('t1_yellow_pad', 1, (x,g)=>({ length: 400, objects: [...Obstacles.jumpPad(x+150,g,'yellow'), ...Obstacles.gap(x+220, 90)] }));

  // ---- Tier 2 ----
  defChunk('t2_double_spike', 2, (x,g)=>({ length: 400, objects: Obstacles.spike(x+170,g,2) }));
  defChunk('t2_gap_platform_gap', 2, (x,g)=>({ length: 520, objects: [...Obstacles.gap(x+140,60), ...Obstacles.platform(x+260,g-60,110), ...Obstacles.gap(x+430,60)] }));
  defChunk('t2_long_gap', 2, (x,g)=>({ length: 440, objects: Obstacles.gap(x+150, 110) }));
  defChunk('t2_elevated_run', 2, (x,g)=>({ length: 480, objects: [...Obstacles.platform(x+140,g-90,220), ...Obstacles.spike(x+220,g-90-60,1)] , customTop:true}));
  defChunk('t2_double_and_coin', 2, (x,g)=>({ length: 460, objects: [...Obstacles.spike(x+170,g,2), ...Obstacles.coin(x+400, g-100)] }));
  defChunk('t2_pink_pad_gap', 2, (x,g)=>({ length: 440, objects: [...Obstacles.jumpPad(x+150,g,'pink'), ...Obstacles.gap(x+210,80)] }));
  defChunk('t2_ceiling_low', 2, (x,g)=>({ length: 420, objects: [...Obstacles.ceiling(x+180, 140, g-90)] }));
  defChunk('t2_floating_platform', 2, (x,g)=>({ length: 460, objects: Obstacles.platform(x+180, g-120, 140, maybeBouncy(0.25)) }));
  defChunk('t2_bounce_platform', 2, (x,g)=>({ length: 560, objects: [...Obstacles.bouncePad(x+160, g-50, 135), ...Obstacles.platform(x+400, g-190, 120)] }));

  // ---- Tier 3 ----
  defChunk('t3_triple_spike', 3, (x,g)=>({ length: 480, objects: Obstacles.spike(x+180,g,3) }));
  defChunk('t3_platform_chain', 3, (x,g)=>({ length: 620, objects: [
    ...Obstacles.platform(x+140,g-70,110, maybeBouncy(0.3)),
    ...Obstacles.platform(x+330,g-70,110, maybeBouncy(0.3)),
    ...Obstacles.platform(x+520,g-70,110, maybeBouncy(0.3)),
  ] }));
  defChunk('t3_red_pad_gauntlet', 3, (x,g)=>({ length: 520, objects: [...Obstacles.jumpPad(x+150,g,'red'), ...Obstacles.spike(x+380, g-160, 1)] }));
  defChunk('t3_gap_spike_gap', 3, (x,g)=>({ length: 560, objects: [...Obstacles.gap(x+140,70), ...Obstacles.spike(x+320,g,1), ...Obstacles.gap(x+420,70)] }));
  defChunk('t3_double_gap_precision', 3, (x,g)=>({ length: 560, objects: [...Obstacles.spike(x+150,g,2), ...Obstacles.gap(x+330,90)] }));
  defChunk('t3_orb_gap', 3, (x,g)=>({ length: 500, objects: [...Obstacles.jumpOrb(x+180, g-90), ...Obstacles.gap(x+260, 130)] }));
  defChunk('t3_high_low_platforms', 3, (x,g)=>({ length: 560, objects: [
    ...Obstacles.platform(x+140,g-140,110, maybeBouncy(0.3)),
    ...Obstacles.platform(x+340,g-40,110, maybeBouncy(0.3)),
  ] }));
  defChunk('t3_size_zone', 3, (x,g)=>buildSizeZone(x,g));

  // ---- Tier 4 ----
  defChunk('t4_moving_block_gap', 4, (x,g)=>({ length: 560, objects: [...Obstacles.movingBlock(x+220, g-100, 34, 34, 'vertical', 70, 1.6), ...Obstacles.gap(x+150,70)] }));
  defChunk('t4_ceiling_spike_combo', 4, (x,g)=>({ length: 560, objects: [...Obstacles.ceiling(x+180,120,g-100), ...Obstacles.spike(x+380,g,1)] }));
  defChunk('t4_rapid_doubles', 4, (x,g)=>({ length: 620, objects: [...Obstacles.spike(x+150,g,2), ...Obstacles.spike(x+380,g,2)] }));
  defChunk('t4_moving_horizontal', 4, (x,g)=>({ length: 560, objects: Obstacles.movingBlock(x+260, g-30, 34, 34, 'horizontal', 60, 1.4) }));
  defChunk('t4_triple_plus_gap', 4, (x,g)=>({ length: 620, objects: [...Obstacles.spike(x+160,g,3), ...Obstacles.gap(x+400,80)] }));
  defChunk('t4_orb_chain', 4, (x,g)=>({ length: 620, objects: [...Obstacles.jumpOrb(x+170,g-90), ...Obstacles.jumpOrb(x+340,g-140), ...Obstacles.gap(x+250,60), ...Obstacles.gap(x+420,60)] }));
  defChunk('t4_small_landing', 4, (x,g)=>({ length: 560, objects: [...Obstacles.gap(x+140,100), ...Obstacles.platform(x+260,g-50,70), ...Obstacles.gap(x+350,90)] }));
  defChunk('t4_bounce_chain', 4, (x,g)=>({ length: 700, objects: [
    ...Obstacles.bouncePad(x+150, g-1, 105),
    ...Obstacles.gap(x+260, 90),
    ...Obstacles.bouncePad(x+420, g-1, 105),
    ...Obstacles.gap(x+530, 90),
  ] }));
  defChunk('t4_bounce_over_spikes', 4, (x,g)=>({ length: 620, objects: [
    ...Obstacles.bouncePad(x+150, g-1, 105),
    ...Obstacles.spike(x+320, g, 2),
  ] }));
  defChunk('t4_ship_zone_easy', 4, (x,g)=>buildShipZone(x,g,[{top:60,bottom:60},{top:90,bottom:50},{top:60,bottom:90}]));

  // ---- Tier 5 ----
  defChunk('t5_speed_portal_run', 5, (x,g)=>({ length: 640, objects: [...Obstacles.portal(x+150,g,'speed'), ...Obstacles.spike(x+320,g,2), ...Obstacles.gap(x+460,70)] }));
  defChunk('t5_slow_precision', 5, (x,g)=>({ length: 640, objects: [...Obstacles.portal(x+150,g,'slow'), ...Obstacles.spike(x+340,g,3)] }));
  defChunk('t5_gauntlet', 5, (x,g)=>({ length: 700, objects: [...Obstacles.spike(x+140,g,2), ...Obstacles.gap(x+330,80), ...Obstacles.movingBlock(x+520,g-90,34,34,'vertical',70,1.8)] }));
  defChunk('t5_orb_ceiling_combo', 5, (x,g)=>({ length: 680, objects: [...Obstacles.jumpOrb(x+160,g-90), ...Obstacles.ceiling(x+340,110,g-110), ...Obstacles.gap(x+250,60)] }));
  defChunk('t5_gravity_zone', 5, (x,g)=>buildGravityZone(x,g,2));
  defChunk('t5_gravity_zone_long', 5, (x,g)=>buildGravityZone(x,g,3));
  defChunk('t5_ship_zone_hard', 5, (x,g)=>buildShipZone(x,g,[{top:100,bottom:40},{top:40,bottom:100},{top:80,bottom:80},{top:110,bottom:40}]));
  defChunk('t5_rotor_gauntlet', 5, (x,g)=>({ length: 620, objects: [...Obstacles.rotor(x+260, g-100, 80, 2.2), ...Obstacles.gap(x+140,70)] }));
  defChunk('t5_double_rotor', 5, (x,g)=>({ length: 700, objects: [...Obstacles.rotor(x+220, g-90, 65, -2.0), ...Obstacles.rotor(x+460, g-90, 65, 2.0)] }));
  defChunk('t5_laser_run', 5, (x,g)=>({ length: 640, objects: [...Obstacles.laser(x+260, 24), ...Obstacles.laser(x+460, 24)] }));
  defChunk('t5_laser_gap', 5, (x,g)=>({ length: 620, objects: [...Obstacles.laser(x+280, 24), ...Obstacles.gap(x+400, 80)] }));
  defChunk('t5_homer_chase', 5, (x,g)=>({ length: 640, objects: [...Obstacles.homer(x+300, g-100, 30, 100), ...Obstacles.gap(x+160,70)] }));
  defChunk('t5_homer_and_spikes', 5, (x,g)=>({ length: 660, objects: [...Obstacles.spike(x+150,g,1), ...Obstacles.homer(x+380, g-120, 30, 90)] }));

  // double-jump-gated bonus chunks (only enter pool if player has ability)
  defChunk('dj_double_gap', 3, (x,g)=>({ length: 560, objects: [...Obstacles.gap(x+140,110), ...Obstacles.gap(x+330,110)] }), { requires:['double_jump'] });
  defChunk('dj_high_platform_series', 4, (x,g)=>({ length: 640, objects: [...Obstacles.platform(x+150,g-170,100), ...Obstacles.platform(x+380,g-170,100)] }), { requires:['double_jump'] });

  /* ------------------------------ CHUNK MANAGER ---------------------------- */
  class ChunkManager {
    constructor(game){
      this.game = game;
      this.objects = [];        // flattened active obstacles/platforms/etc (world space)
      this.nextSpawnX = 0;
      this.spawnAheadDistance = 2400;
      this.usedChunkHistory = [];
      this.checkpointMarkersAdded = new Set(); // checkpoint indices already given a flag
      this.groundOffset = 0;    // current stepped-terrain offset (Cyber City only)
      this.groundSegments = []; // {xStart, xEnd, offset} for rendering + collision lookup
    }
    reset(){
      this.objects = [];
      this.nextSpawnX = W + 200;
      this.usedChunkHistory = [];
      this.checkpointMarkersAdded = new Set();
      this.groundOffset = 0;
      this.groundSegments = [];
      // seed with a flat safe run
      this._spawnFlat(this.nextSpawnX, 500);
      this.nextSpawnX += 500;
    }
    // Re-seed the stream anchored at an arbitrary world x (used when
    // respawning at a checkpoint rather than starting a brand new run).
    resetAt(worldX){
      this.objects = [];
      this.nextSpawnX = worldX + W + 200;
      this.usedChunkHistory = [];
      this.groundOffset = 0;
      this.groundSegments = [];
      // deliberately do NOT clear checkpointMarkersAdded — flags already
      // passed shouldn't reappear behind the player after a respawn.
    }
    _spawnFlat(x, length){ /* no obstacles, just advances spawn cursor */ }
    // The ground height the player should actually stand on at a given
    // world x. Only Cyber City ever produces a nonzero offset; every other
    // theme's segments are flat (offset 0), so this is a no-op elsewhere.
    getGroundOffsetAt(worldX){
      for(const seg of this.groundSegments){
        if(worldX >= seg.xStart && worldX < seg.xEnd) return seg.offset;
      }
      return 0;
    }
    tierWeights(distanceM){
      // gradually widen the tier distribution as distance increases
      const p = Math.min(distanceM / 4000, 1); // 0..1 progress
      return {
        1: Math.max(0.06, 1 - p*1.1),
        2: 0.5 + p*0.3,
        3: 0.15 + p*0.7,
        4: Math.max(0, (p-0.15))*1.3,
        5: Math.max(0, (p-0.4))*1.6,
      };
    }
    pickChunk(distanceM){
      const weights = this.tierWeights(distanceM);
      const player = this.game.player;
      const abilityFlags = {
        double_jump: player.extraJumps >= 1,
      };
      const pool = CHUNK_LIBRARY.filter(c=>{
        if(c.requires && c.requires.length){
          for(const r of c.requires){ if(!abilityFlags[r]) return false; }
        }
        // avoid immediate repeat of the same chunk id
        if(this.usedChunkHistory.length && this.usedChunkHistory[this.usedChunkHistory.length-1] === c.id) return false;
        return true;
      });
      const chosen = weightedPick(pool, c => (weights[c.tier] || 0.02));
      this.usedChunkHistory.push(chosen.id);
      if(this.usedChunkHistory.length > 6) this.usedChunkHistory.shift();
      return chosen;
    }
    // Places a visible flag exactly at the world x where a checkpoint
    // falls, well before the player reaches it, so it reads as a marker to
    // run toward rather than an invisible trigger. Checkpoint x is a fixed
    // distance independent of chunk boundaries, so it can land mid-chunk on
    // top of a spike, gap, or other hazard — sanitize a safe landing zone
    // around it before placing the flag.
    _maybeAddCheckpointMarker(checkpointIndex){
      const subDist = CONFIG.CHECKPOINT_DISTANCE / CONFIG.CHECKPOINTS_PER_STAGE;
      const targetX = checkpointIndex * subDist * PPM;
      if(this.checkpointMarkersAdded.has(checkpointIndex) || targetX > this.nextSpawnX) return;
      this.checkpointMarkersAdded.add(checkpointIndex);
      const SAFE_RADIUS = 90;
      const hazardTypes = new Set(['spike','ceiling','movingblock','shipwall','gap','rotor','laser','homer']);
      this.objects = this.objects.filter(o=>{
        if(!hazardTypes.has(o.type)) return true;
        const oLeft = o.x, oRight = o.x + (o.w||0);
        const overlapsSafeZone = oRight > targetX - SAFE_RADIUS && oLeft < targetX + SAFE_RADIUS;
        return !overlapsSafeZone;
      });
      const isMajor = (checkpointIndex % CONFIG.CHECKPOINTS_PER_STAGE === 0);
      const localGroundY = GROUND_Y + this.getGroundOffsetAt(targetX);
      this.objects.push({ type:'checkpointFlag', x: targetX, y: localGroundY-96, groundY: localGroundY, w:14, h:96, major:isMajor, passed:false });
    }
    ensureSpawned(playerWorldX, distanceM, nextCheckpointIndex){
      while(this.nextSpawnX < playerWorldX + this.spawnAheadDistance){
        const isCyberCity = this.game.theme.theme.name === 'CYBER CITY';
        if(isCyberCity){
          // Step, don't drift: change only sometimes (not every chunk) and
          // only by a modest amount, so the terrain reads as an occasional
          // staircase rather than constant jitter ("not too fast").
          if(Math.random() < 0.3){
            const step = rand(18, 34) * (Math.random() < 0.5 ? -1 : 1);
            this.groundOffset = clamp(this.groundOffset + step, -70, 70);
          }
        } else if(this.groundOffset !== 0){
          this.groundOffset = 0; // flat again as soon as we leave Cyber City
        }
        const segStart = this.nextSpawnX;
        const effectiveGround = GROUND_Y + this.groundOffset;
        CHUNK_GROUND_REF = effectiveGround;
        const chunk = this.pickChunk(distanceM);
        const result = chunk.build(this.nextSpawnX, effectiveGround);
        for(const obj of result.objects) this.objects.push(obj);
        this.nextSpawnX += result.length;
        this.groundSegments.push({ xStart: segStart, xEnd: this.nextSpawnX, offset: this.groundOffset });
      }
      this._maybeAddCheckpointMarker(nextCheckpointIndex);
    }
    pruneBehind(playerWorldX){
      this.groundSegments = this.groundSegments.filter(s => s.xEnd > playerWorldX - 400);
      this.objects = this.objects.filter(o => (o.x + (o.w||0)) > playerWorldX - 400);
    }
  }

  /* ------------------------------ UPGRADES -------------------------------- */
  const UPGRADE_DEFS = [
    { id:'spring_loaded', name:'Spring Loaded', rarity:'common', desc:'Jump 8% higher. Stacks.', repeatable:true },
    { id:'featherweight', name:'Featherweight', rarity:'common', desc:'Reduced gravity, floatier arcs.' },
    { id:'heavy_landing', name:'Heavy Landing', rarity:'common', desc:'Fall faster for precise landings.' },
    { id:'air_control', name:'Air Control', rarity:'uncommon', desc:'Slight mid-air correction.' },
    { id:'shield', name:'Shield', rarity:'uncommon', desc:'Survive one collision.' },
    { id:'smaller_hitbox', name:'Smaller Hitbox', rarity:'uncommon', desc:'Tighter true hitbox, same look.' },
    { id:'phase', name:'Phase', rarity:'uncommon', desc:'Brief immunity right after landing.' },
    { id:'dash', name:'Dash', rarity:'uncommon', desc:'Shift to burst forward. Limited charges.', repeatable:true },
    { id:'double_jump', name:'Double Jump', rarity:'rare', desc:'Gain one extra mid-air jump.' },
    { id:'regen_shield', name:'Regenerating Shield', rarity:'rare', desc:'A fresh shield every stage.' },
    { id:'ground_slam', name:'Ground Slam', rarity:'rare', desc:'Press Down in air to slam down fast.' },
    { id:'hover', name:'Hover', rarity:'rare', desc:'Hold jump at the peak to float briefly.' },
    { id:'time_slow', name:'Time Slow', rarity:'rare', desc:'Press E to slow the world down.' },
    { id:'blink', name:'Blink', rarity:'legendary', desc:'Teleport forward. Long cooldown.' },
    { id:'triple_jump', name:'Triple Jump', rarity:'legendary', desc:'One more jump, requires Double Jump.', requires:['double_jump'] },
    { id:'second_chance', name:'Second Chance', rarity:'legendary', desc:'Your first death this run is forgiven.' },
  ];
  const RARITY_WEIGHT = { common:100, uncommon:45, rare:18, legendary:6 };

  class UpgradeManager {
    constructor(game){ this.game = game; }
    rollN(player, n){
      const pool = UPGRADE_DEFS.filter(u=>{
        if(u.requires){ for(const r of u.requires){ if(!this._has(player,r)) return false; } }
        if(!u.repeatable && this._has(player,u.id)) return false;
        return true;
      });
      const results = [];
      const working = [...pool];
      for(let i=0;i<n && working.length;i++){
        const chosen = weightedPick(working, u=>RARITY_WEIGHT[u.rarity]);
        results.push(chosen);
        const idx = working.indexOf(chosen);
        working.splice(idx,1);
      }
      return results;
    }
    _has(player, id){
      switch(id){
        case 'double_jump': return player.extraJumps>=1;
        case 'shield': return player.hasShield || player.regenShield;
        case 'dash': return player.dashMax>0;
        default: return false;
      }
    }
  }

  function pickQuestions(n){
    return QuestionManager.getRandomSet(n).map(source => ({
      q: source.q,
      options: source.a,
      correct: source.c,
      source
    }));
  }

  /* ------------------------------ SCORE MANAGER ---------------------------- */
  class ScoreManager {
    constructor(){ this.reset(); }
    reset(){
      this.distanceM = 0; this.score = 0; this.coins = 0; this.nearMisses = 0;
      this.combo = 1; this.comboTimer = 0; this.bestCombo = 1;
      this.stage = 1;
    }
    addDistance(m){ this.distanceM += m; this.score += m*0.4; }
    addScoreAction(base){
      this.score += base * this.combo;
      this.combo = Math.min(this.combo+1, 99);
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.comboTimer = CONFIG.COMBO_DECAY_TIME;
    }
    coinCollected(){ this.coins++; this.addScoreAction(15); }
    nearMiss(){ this.nearMisses++; this.addScoreAction(25); }
    update(dt){
      if(this.comboTimer>0){ this.comboTimer -= dt; if(this.comboTimer<=0) this.combo = 1; }
    }
  }

  /* -------------------------------- GAME ----------------------------------- */
  class Game {
    constructor(){
      this.skinPrefs = this._loadSkinPrefs(); // must exist before Player.reset() reads it
      this.input = new InputManager();
      this.particles = new ParticleSystem();
      this.theme = new ThemeManager();
      this.player = new Player(this);
      this.chunks = new ChunkManager(this);
      this.upgrades = new UpgradeManager(this);
      this.score = new ScoreManager();
      this.state = 'menu'; // menu | playing | checkpoint | gameover | dead-anim
      this.worldX = 0;             // player's world-space x (== distance in px)
      this.speedMult = 1;
      this.lastTime = 0;
      this.shakeT = 0; this.shakeMag = 0;
      this.nearMissCooldowns = new Map();
      this.deathTimer = 0;
      this.acquiredUpgrades = [];
      this.checkpoint = null;              // snapshot captured each time a checkpoint is reached
      this.checkpointsReached = 0;         // total checkpoints hit this run (2 per stage)
      const steadyStart = !PlatformManager.isPracticeMode() && window.AchievementManager?.hasBoost?.('cube-curiosity_steady_start');
      this.livesRemaining = CONFIG.STARTING_LIVES + (steadyStart ? 1 : 0);
      this.jumpBufferTimer = 0;
      this._loadHighScores();
      this._bindUI();
      this._buildAbilityBar();
      this._buildCustomizeUI();
      requestAnimationFrame(this.loop.bind(this));
    }

    /* ---------- persistence ---------- */
    _loadSkinPrefs(){
      try{
        const saved = JSON.parse(localStorage.getItem('cubeCuriositySkin'));
        if(saved && saved.color && saved.pattern){
          const colorId = SKIN_COLORS.find(item=>item.color===saved.color)?.id || 'cyan';
          return {
            ...saved,
            unlockedColors:[...new Set(['cyan', colorId, ...(saved.unlockedColors||[])])],
            unlockedPatterns:[...new Set(['dots', saved.pattern, ...(saved.unlockedPatterns||[])])]
          };
        }
      }catch(e){}
      return { color:'#35f5ff', pattern:'dots', unlockedColors:['cyan'], unlockedPatterns:['dots'] };
    }
    _saveSkinPrefs(){
      localStorage.setItem('cubeCuriositySkin', JSON.stringify(this.skinPrefs));
    }
    _loadHighScores(){
      try{
        this.highScores = JSON.parse(localStorage.getItem('cubeCuriosityHighScores')) || {distance:0,stage:1,score:0,coins:0,combo:1};
      }catch(e){ this.highScores = {distance:0,stage:1,score:0,coins:0,combo:1}; }
      this._refreshMenuStats();
    }
    _saveHighScores(){
      const hs = this.highScores;
      hs.distance = Math.max(hs.distance, Math.floor(this.score.distanceM));
      hs.stage = Math.max(hs.stage, this.score.stage);
      hs.score = Math.max(hs.score, Math.floor(this.score.score));
      hs.coins = Math.max(hs.coins, this.score.coins);
      hs.combo = Math.max(hs.combo, this.score.bestCombo);
      localStorage.setItem('cubeCuriosityHighScores', JSON.stringify(hs));
      this._refreshMenuStats();
    }
    _refreshMenuStats(){
      document.getElementById('menuBestScore').textContent = Math.floor(this.highScores.score);
      const sharedCoins = window.PlatformManager?.getCoins?.() || 0;
      document.getElementById('menuCoinWallet').textContent = sharedCoins;
      const shopWallet = document.getElementById('shopCoinWallet');
      if(shopWallet) shopWallet.textContent = sharedCoins;
    }

    /* ---------- UI binding ---------- */
    _bindUI(){
      document.getElementById('playBtn').onclick = ()=> this.startRun();
      document.getElementById('shopBtn').onclick = ()=>{ this._refreshMenuStats(); this._show('shopOverlay'); this._showStyleShop(); window.AchievementManager?.renderGameRewardShop?.(); };
      document.getElementById('backFromShop').onclick = ()=> this._show('menuOverlay');
      document.getElementById('cubeStylesTab').onclick = ()=>this._showStyleShop();
      document.getElementById('hubBtn').onclick = ()=>{
        // Adjust this to match Arcade Academy's actual hub path once this
        // game is dropped into its subfolder — kept as a single, easy-to-
        // change spot rather than scattered through the code.
        window.AudioManager?.navigateWithFade(CONFIG.ARCADE_HUB_URL);
      };
      document.getElementById('menuFromGoBtn').onclick = ()=>{ this._refreshMenuStats(); this._show('menuOverlay'); };
      window.addEventListener('arcade-coins-changed', ()=>this._refreshMenuStats());
    }
    _show(id){
      ['menuOverlay','shopOverlay','questionOverlay','checkpointOverlay','gameOverOverlay'].forEach(o=>{
        document.getElementById(o).classList.toggle('hidden', o!==id);
      });
      document.getElementById('hud').classList.toggle('hidden', id!=='__hud__');
    }

    /* ---------- customization ---------- */
    _showStyleShop(){
      document.querySelectorAll('#shopOverlay .shop-tab-content').forEach(panel=>{panel.hidden=panel.id!=='cubeStylePanel';panel.classList.toggle('hidden',panel.id!=='cubeStylePanel');});
      document.querySelectorAll('#cubeShopTabs button').forEach(button=>button.classList.toggle('active-tab',button.id==='cubeStylesTab'));
      this._buildCustomizeUI();
    }
    _buyOrEquip(kind, item){
      const key = kind==='color' ? 'unlockedColors' : 'unlockedPatterns';
      const owned = this.skinPrefs[key].includes(item.id);
      const message = document.getElementById('shopMessage');
      if(!owned && !PlatformManager.spendCoins(item.cost)){
        message.textContent = PlatformManager.isPracticeMode() ? 'Purchases are disabled in Practice Mode.' : `You need ${item.cost} coins to unlock ${item.name}.`;
        message.classList.add('error');
        return;
      }
      if(!owned) this.skinPrefs[key].push(item.id);
      if(!owned) window.AchievementManager?.notify?.('upgrade_purchased');
      if(kind==='color'){this.skinPrefs.color=item.color;this.player.trailColor=item.color;}
      else this.skinPrefs.pattern=item.id;
      this._saveSkinPrefs();
      message.textContent = owned ? `${item.name} equipped.` : `${item.name} unlocked and equipped!`;
      message.classList.remove('error');
      this._refreshMenuStats();
      this._buildCustomizeUI();
    }
    _buildCustomizeUI(){
      const colorRow = document.getElementById('colorSwatchRow');
      colorRow.innerHTML = '';
      SKIN_COLORS.forEach(c=>{
        const owned=this.skinPrefs.unlockedColors.includes(c.id),equipped=this.skinPrefs.color===c.color;
        const el = document.createElement('article');
        el.className = 'shop-item cubeStyleItem'+(equipped?' equipped':'');
        el.innerHTML = `<span class="stylePreview" style="--preview:${c.color}"></span><span><b class="shop-name">${c.name}</b><small>${owned?'Owned':`${c.cost} ◆`}</small></span><button class="shop-buy" type="button">${equipped?'Equipped':owned?'Equip':'Unlock'}</button>`;
        el.querySelector('button').disabled=equipped;
        el.querySelector('button').onclick=()=>this._buyOrEquip('color',c);
        colorRow.appendChild(el);
      });
      const patternRow = document.getElementById('patternSwatchRow');
      patternRow.innerHTML = '';
      FACE_PATTERNS.forEach(p=>{
        const owned=this.skinPrefs.unlockedPatterns.includes(p.id),equipped=this.skinPrefs.pattern===p.id;
        const el = document.createElement('article');
        el.className = 'shop-item cubeStyleItem'+(equipped?' equipped':'');
        el.innerHTML = `<span class="facePreview">${p.id==='dots'?'▪ ▪':p.id==='visor'?'▬':p.id==='cross'?'×':'○'}</span><span><b class="shop-name">${p.name}</b><small>${owned?'Owned':`${p.cost} ◆`}</small></span><button class="shop-buy" type="button">${equipped?'Equipped':owned?'Equip':'Unlock'}</button>`;
        el.querySelector('button').disabled=equipped;
        el.querySelector('button').onclick=()=>this._buyOrEquip('pattern',p);
        patternRow.appendChild(el);
      });
      this._renderSkinPreview();
    }
    _renderSkinPreview(){
      const canvas = document.getElementById('skinPreviewCanvas');
      if(!canvas) return;
      const pctx = canvas.getContext('2d');
      pctx.clearRect(0,0,120,120);
      pctx.save();
      pctx.translate(60,60);
      const half = 34;
      const color = this.skinPrefs.color;
      pctx.shadowColor = color; pctx.shadowBlur = 18;
      pctx.fillStyle = '#0d0a26';
      pctx.strokeStyle = color; pctx.lineWidth = 3;
      pctx.beginPath();
      const r = 8;
      pctx.moveTo(-half+r,-half);
      pctx.arcTo(half,-half,half,half,r);
      pctx.arcTo(half,half,-half,half,r);
      pctx.arcTo(-half,half,-half,-half,r);
      pctx.arcTo(-half,-half,half,-half,r);
      pctx.closePath();
      pctx.fill(); pctx.stroke();
      const pattern = FACE_PATTERNS.find(f=>f.id===this.skinPrefs.pattern) || FACE_PATTERNS[0];
      pattern.draw(pctx, half, color);
      pctx.restore();
    }

    _buildAbilityBar(){
      this.abilityBar = document.getElementById('abilityBar');
    }
    _refreshAbilityBar(){
      const p = this.player;
      this.abilityBar.innerHTML = '';
      const addBtn = (label, key, ready)=>{
        const b = document.createElement('div');
        b.className = 'abilityBtn';
        b.textContent = label;
        b.style.opacity = ready ? '1' : '0.45';
        b.addEventListener('touchstart', (e)=>{ e.preventDefault(); this.input.markPointerConsumed(); this._fireAbility(key); }, {passive:false});
        b.addEventListener('mousedown', (e)=>{ e.stopPropagation(); this.input.markPointerConsumed(); this._fireAbility(key); });
        this.abilityBar.appendChild(b);
      };
      if(p.dashMax>0) addBtn('DASH', 'dash', p.dashCharges>0);
      if(p.timeSlowMax>0) addBtn('SLOW', 'timeslow', p.timeSlowMeter>0.3);
      if(p.canGroundSlam) addBtn('SLAM', 'groundslam', !p.grounded);
      if(p.blinkCooldownMax>0) addBtn('BLINK', 'blink', p.blinkCooldownT<=0);
    }
    _fireAbility(key){
      const p = this.player;
      if(key==='dash') p.tryDash();
      else if(key==='timeslow') p.tryTimeSlow();
      else if(key==='groundslam') p.groundSlam();
      else if(key==='blink') p.tryBlink();
    }

    flash(color){
      const el = document.getElementById('flashDiv');
      el.style.background = color; el.style.opacity = '0.35';
      requestAnimationFrame(()=>{ el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(()=>{el.style.transition='';},300); });
    }
    shake(mag, t){ this.shakeMag = mag; this.shakeT = t; }

    /* ---------- run lifecycle ---------- */
    startRun(){
      if(!window.QuestionManager?.hasQuestions?.()) return;
      QuestionManager.beginMixedRun();
      PlatformManager.startSession(GAME_ID);
      this.player.reset();
      this.chunks.reset();
      this.score.reset();
      this.worldX = 0;
      this.speedMult = 1;
      this.theme.setStage(1);
      this.acquiredUpgrades = [];
      this.checkpoint = null;
      this.checkpointsReached = 0;
      this.livesRemaining = CONFIG.STARTING_LIVES;
      this.jumpBufferTimer = 0;
      this._show('__hud__');
      this.state = 'playing';
      this._refreshAbilityBar();
      this._updateHUD();
      this.player.onStageStart();
    }
    triggerCheckpoint(isMajor){
      this.state = 'checkpoint';
      if(hasReward('cube-curiosity_checkpoint_spark')){
        for(let i=0;i<24;i++) this.particles.spawn({x:this.player.x+this.player.renderSize/2,y:this.player.y,vx:rand(-220,220),vy:rand(-280,20),life:.75,size:rand(2,6),color:i%2?'#ffd15c':'#35f5ff',gravity:420});
      }
      window.AchievementManager?.notify?.('cube_curiosity_checkpoint', { facts:{ cube_curiosity_run_checkpoints:this.checkpointsReached } });
      if(this.checkpointsReached>=20) window.AchievementManager?.notify?.('mastery_cube_curiosity');
      window.ChallengeManager?.update?.({ alive:true, distance:Math.floor(this.score.distanceM) });
      this.runQuestionPhase(isMajor);
    }
    /* ---- CheckpointFlow -------------------------------------------------
       reachCheckpoint() -> runQuestionPhase() -> (0 correct: no upgrade,
       1-4 correct: that many upgrade choices) -> _chooseUpgrade() -> resume.
       Swap pickQuestions()/QUESTION_BANK for Arcade Academy's shared
       QuestionManager.js / class-code bank later — everything below this
       point only depends on pickQuestions(n) returning {q,options,correct}.
    --------------------------------------------------------------------*/
    async runQuestionPhase(isMajor){
      this.pendingIsMajor = isMajor;
      if(window.MixedQuestionRound){
        const result=await MixedQuestionRound.play();
        this.questionCorrect=result.correct;
        this.questionQueue=new Array(4).fill(null);
        if(!PlatformManager.isPracticeMode()){
          if(result.correct){PlatformManager.addCoins(CORRECT_REWARD*result.correct);window.AchievementManager?.notify?.('cube_curiosity_correct',{amount:result.correct});}
          const misses=4-result.correct;if(misses)PlatformManager.deductCoins(INCORRECT_PENALTY*misses);
        }
        this._refreshMenuStats();this._finishQuestionPhase();return;
      }
      this.questionQueue = pickQuestions(4);
      this.questionIndex = 0;
      this.questionCorrect = 0;
      this._showQuestion();
    }
    _showQuestion(){
      const total = this.questionQueue.length;
      const q = this.questionQueue[this.questionIndex];
      document.getElementById('questionProgress').textContent = `QUESTION ${this.questionIndex+1} OF ${total}`;
      document.getElementById('questionText').textContent = q.q;
      const optionsEl = document.getElementById('questionOptions');
      optionsEl.innerHTML = '';
      q.options.forEach((opt, i)=>{
        const btn = document.createElement('button');
        btn.className = 'questionOptionBtn';
        btn.textContent = opt;
        btn.onclick = ()=> this._answerQuestion(i);
        optionsEl.appendChild(btn);
      });
      this._show('questionOverlay');
    }
    _answerQuestion(selectedIndex){
      const q = this.questionQueue[this.questionIndex];
      const buttons = document.querySelectorAll('#questionOptions .questionOptionBtn');
      buttons.forEach(b=> b.disabled = true);
      const correct = selectedIndex === q.correct;
      if(!PlatformManager.isPracticeMode()){
        QuestionManager.recordAnswer(q.source, correct);
        PlatformManager.recordQuestionAnswered(GAME_ID, correct);
        if(correct) window.AchievementManager?.notify?.('cube_curiosity_correct');
        if(correct) PlatformManager.addCoins(CORRECT_REWARD);
        else PlatformManager.deductCoins(INCORRECT_PENALTY);
      }
      this._refreshMenuStats();
      if(correct){ this.questionCorrect++; buttons[selectedIndex].classList.add('correct'); }
      else {
        buttons[selectedIndex].classList.add('incorrect');
        buttons[q.correct].classList.add('correct');
      }
      setTimeout(()=>{
        this.questionIndex++;
        if(this.questionIndex < this.questionQueue.length){
          this._showQuestion();
        } else {
          this._finishQuestionPhase();
        }
      }, 700);
    }
    _finishQuestionPhase(){
      if(this.questionCorrect <= 0){
        this._showNoUpgrade(this.pendingIsMajor);
      } else {
        this.showUpgrades(this.pendingIsMajor, this.questionCorrect);
      }
    }
    showUpgrades(isMajor, count){
      const n = count || 3;
      const choices = this.upgrades.rollN(this.player, n);
      const grid = document.getElementById('upgradeGrid');
      grid.style.display = '';
      grid.innerHTML = '';
      document.getElementById('continueNoUpgradeBtn').style.display = 'none';
      document.getElementById('checkpointStageLine').textContent = isMajor
        ? `CHECKPOINT REACHED · STAGE ${this.score.stage} COMPLETE`
        : `CHECKPOINT REACHED · STAGE ${this.score.stage}`;
      document.getElementById('checkpointTitle').textContent =
        `${this.questionCorrect}/${this.questionQueue.length} CORRECT · CHOOSE 1 UPGRADE`;
      choices.forEach(u=>{
        const card = document.createElement('div');
        card.className = `upgradeCard rarity-${u.rarity}`;
        card.innerHTML = `<div class="upName">${u.name}</div><div class="upRarity">${u.rarity}</div><div class="upDesc">${u.desc}</div>`;
        card.onclick = ()=> this._chooseUpgrade(u, isMajor);
        grid.appendChild(card);
      });
      this._show('checkpointOverlay');
    }
    _showNoUpgrade(isMajor){
      document.getElementById('checkpointStageLine').textContent = isMajor
        ? `CHECKPOINT REACHED · STAGE ${this.score.stage} COMPLETE`
        : `CHECKPOINT REACHED · STAGE ${this.score.stage}`;
      document.getElementById('checkpointTitle').textContent = `0/${this.questionQueue.length} CORRECT · NO UPGRADE THIS TIME`;
      const grid = document.getElementById('upgradeGrid');
      grid.innerHTML = '';
      grid.style.display = 'none';
      const btn = document.getElementById('continueNoUpgradeBtn');
      btn.style.display = '';
      btn.onclick = ()=> this._chooseUpgrade(null, isMajor);
      this._show('checkpointOverlay');
    }
    _chooseUpgrade(u, isMajor){
      if(u){
        this.player.applyUpgrade(u.id);
        this.acquiredUpgrades.push(u.id);
      }
      if(isMajor){
        this.score.stage++;
        this.theme.setStage(this.score.stage);
        this.speedMult = Math.min(CONFIG.MAX_SPEED_MULT, 1 + (this.score.stage-1)*CONFIG.SPEED_STEP);
      }
      this.player.onStageStart();
      this._refreshAbilityBar();
      this._show('__hud__');
      this.state = 'playing';
      document.getElementById('stageDisplay').textContent = `STAGE ${this.score.stage} · ${this.theme.theme.name}`;
      // Snapshot everything needed to resume exactly here if the player
      // dies later in the run and still has a life left. Captured after the
      // upgrade is applied, so a respawn retries from here already
      // equipped with it, not stripped back to the pre-upgrade state.
      this.checkpoint = {
        worldX: this.worldX,
        stage: this.score.stage,
        checkpointsReached: this.checkpointsReached,
        distanceM: this.score.distanceM,
        score: this.score.score,
        coins: this.score.coins,
        nearMisses: this.score.nearMisses,
        combo: this.score.combo,
        bestCombo: this.score.bestCombo,
        speedMult: this.speedMult,
      };
    }
    die(){
      if(this.state !== 'playing') return;
      if(!this.player.hitHazard()){ return; } // absorbed by shield / second chance
      this.state = 'dead-anim';
      this.player.alive = false;
      this.particles.burstDeath(this.player.x+this.player.renderSize/2, this.player.y+this.player.renderSize/2);
      this.shake(14, 0.4);
      this.deathTimer = 0.9;
    }
    respawnAtCheckpoint(){
      const cp = this.checkpoint;
      this.livesRemaining--;

      // restore run progress to exactly how it stood at the checkpoint
      this.score.distanceM = cp.distanceM;
      this.score.score = cp.score;
      this.score.coins = cp.coins;
      this.score.nearMisses = cp.nearMisses;
      this.score.combo = cp.combo;
      this.score.bestCombo = cp.bestCombo;
      this.score.stage = cp.stage;
      this.score.comboTimer = 0;
      this.speedMult = cp.speedMult;
      this.theme.setStage(cp.stage);
      this.worldX = cp.worldX;
      this.checkpointsReached = cp.checkpointsReached;
      this._tempSpeedTimer = 0; this._tempSpeedMult = 1;
      this.nearMissCooldowns.clear();

      // reset the player's physical state but keep every upgrade earned so far
      const p = this.player;
      p.x = W * CONFIG.PLAYER_X_RATIO;
      p.y = GROUND_Y - p.renderSize;
      p.vy = 0; p.grounded = true; p.rotation = 0; p.alive = true;
      p.gravityDir = 1; p.form = 'cube'; p.sizeScale = 1; p.sizeTimer = 0;
      p.landedThisFrame = false; p.phaseTimer = 0; p.squashTimer = 0;
      p.trailHistory = [];
      p.onStageStart();

      this.chunks.resetAt(this.worldX);
      this.state = 'playing';
      this._show('__hud__');
      document.getElementById('stageDisplay').textContent = `STAGE ${this.score.stage} · ${this.theme.theme.name}`;
      this._updateHUD();
      this._refreshAbilityBar();
      this._showRespawnBanner();
    }
    _showRespawnBanner(){
      const el = document.getElementById('respawnBanner');
      el.textContent = this.livesRemaining > 0
        ? `RESPAWNED · ${this.livesRemaining} ${this.livesRemaining===1?'LIFE':'LIVES'} LEFT`
        : `RESPAWNED · LAST LIFE`;
      el.classList.remove('hidden');
      el.classList.add('showBanner');
      setTimeout(()=>{ el.classList.remove('showBanner'); el.classList.add('hidden'); }, 1600);
    }
    finishDeath(){
      this._saveHighScores();
      PlatformManager.addCoins(this.score.coins);
      PlatformManager.setHighScore(GAME_ID, Math.floor(this.score.score));
      window.ChallengeManager?.finish?.({ alive:false, distance:Math.floor(this.score.distanceM), score:Math.floor(this.score.score) });
      PlatformManager.endSession(GAME_ID);
      PlatformManager.endPracticeRun();
      document.getElementById('goDistance').textContent = Math.floor(this.score.distanceM)+'m';
      document.getElementById('goStage').textContent = this.score.stage;
      document.getElementById('goScore').textContent = Math.floor(this.score.score);
      document.getElementById('goCoins').textContent = this.score.coins;
      document.getElementById('goNearMiss').textContent = this.score.nearMisses;
      document.getElementById('goCombo').textContent = 'x'+this.score.bestCombo;
      this.state = 'gameover';
      this._show('gameOverOverlay');
    }

    /* ---------- HUD ---------- */
    _updateHUD(){
      document.getElementById('distanceDisplay').textContent = Math.floor(this.score.distanceM)+'m';
      document.getElementById('stageDisplay').textContent = `STAGE ${this.score.stage} · ${this.theme.theme.name}`;
      document.getElementById('scoreDisplay').textContent = 'SCORE '+Math.floor(this.score.score);
      document.getElementById('coinDisplay').textContent = '◆ '+this.score.coins;
      const combo = document.getElementById('comboDisplay');
      combo.textContent = 'x'+this.score.combo;
      combo.style.opacity = this.score.combo>1 ? '1' : '0';
      const livesEl = document.getElementById('livesDisplay');
      livesEl.textContent = '♥'.repeat(Math.max(0,this.livesRemaining)) + '♡'.repeat(Math.max(0, CONFIG.STARTING_LIVES - this.livesRemaining));
    }

    _popupNearMiss(screenX, screenY){
      const holder = document.getElementById('nearMissPopups');
      const el = document.createElement('div');
      el.className = 'popup'; el.textContent = 'NEAR MISS +25';
      el.style.left = screenX+'px'; el.style.top = screenY+'px';
      holder.appendChild(el);
      setTimeout(()=>el.remove(), 850);
    }

    /* ---------- collision resolution against chunk ground/platforms ---------- */
    // Obstacles are stored in WORLD space; the player's hitbox lives in SCREEN
    // space (it sits near a fixed x on screen while the world scrolls past).
    // screenBox() converts an object's x into screen space so aabb tests
    // against pBox are comparing like-for-like coordinates.
    screenBox(o){
      return { x:this.worldToScreen(o.x), y:o.y, w:o.w, h:o.h };
    }
    resolveVertical(){
      const p = this.player;
      if(p.form === 'ship'){ this._resolveShipBounds(); return; }

      const pBox = p.hitbox;
      const size = p.renderSize;

      // ground/gap check: if standing over a gap with no platform support -> fall through
      let overGap = false;
      if(p.gravityDir>0){
        for(const o of this.chunks.objects){
          if(o.type==='gap'){
            const box = this.screenBox(o);
            if(pBox.x+pBox.w/2 > box.x && pBox.x+pBox.w/2 < box.x+box.w){ overGap = true; break; }
          }
        }
      }

      if(p.gravityDir > 0){
        const onPlatform = this._isOnPlatformNow(); // single authoritative check for this frame
        if(!onPlatform){
          const localGroundY = GROUND_Y + this.chunks.getGroundOffsetAt(this.worldX);
          const groundLevel = localGroundY - size;
          if(!overGap && p.y >= groundLevel && p.vy>=0){
            p.y = groundLevel; p.land();
          } else if(p.y > groundLevel + 4 && overGap){
            if(p.y > localGroundY + 20){ this.die(); } // fell into a gap
          } else if(p.y < groundLevel){
            p.grounded = false;
          }
        }
      } else {
        // reversed gravity: "ground" is the underside of the solid roof
        // band (CONFIG.ROOF_HEIGHT), matching where it's actually drawn —
        // resting at y=0 would visually bury the player inside the fill.
        // Dedicated gravity-zone chunks avoid gap/platform obstacles, so
        // only the roof-attach case needs handling here.
        if(p.y <= CONFIG.ROOF_HEIGHT && p.vy<=0){
          p.y = CONFIG.ROOF_HEIGHT; p.land();
        } else if(p.y > CONFIG.ROOF_HEIGHT){
          p.grounded = false;
        }
      }
    }
    _resolveShipBounds(){
      const p = this.player;
      const size = p.renderSize;
      if(p.y <= 0 || p.y + size >= GROUND_Y){ this.die(); }
    }
    _isOnPlatformNow(){
      const p = this.player;
      if(p.form === 'ship' || p.gravityDir < 0) return false;
      const pBox = p.hitbox;
      const size = p.renderSize;
      for(const o of this.chunks.objects){
        if(o.type!=='platform') continue;
        const box = this.screenBox(o);
        const withinX = pBox.x+pBox.w > box.x+4 && pBox.x < box.x+box.w-4;
        const feetY = pBox.y+pBox.h;
        if(withinX && p.vy>=0 && feetY >= box.y && feetY <= box.y+16){
          const wasAirborne = !p.grounded;
          p.y = box.y - size;
          if(o.bouncy){
            if(wasAirborne) p.bounceLand(); // landing on it launches you; already resting on it does nothing
            else { p.grounded = true; p.vy = 0; } // explicitly re-affirmed every frame so jump() always sees grounded=true here
          } else {
            if(wasAirborne) p.land();
            else { p.grounded = true; p.vy = 0; } // same guarantee on ordinary platforms
          }
          return true;
        }
      }
      return false;
    }

    /* ---------- interactions with special objects ---------- */
    handleInteractions(dt){
      const p = this.player;
      const pBox = p.hitbox;
      const visBox = { x:p.x, y:p.y, w:p.renderSize, h:p.renderSize };

      for(const o of this.chunks.objects){
        const box = this.screenBox(o); // obstacle converted to screen space for this frame
        switch(o.type){
          case 'spike': case 'ceiling': case 'shipwall':
            if(o.lethal && aabb(pBox, box)){ this.die(); }
            else if(o.type==='spike'){
              const dx = Math.abs((pBox.x+pBox.w/2) - (box.x+box.w/2));
              const dy = Math.abs((pBox.y+pBox.h) - box.y);
              if(dx < CONFIG.NEAR_MISS_DIST && dy < CONFIG.NEAR_MISS_DIST){
                const key = o; const nowSec = performance.now()/1000;
                const last = this.nearMissCooldowns.get(key) || -99;
                if((nowSec - last) > CONFIG.NEAR_MISS_COOLDOWN){
                  this.nearMissCooldowns.set(key, nowSec);
                  this.score.nearMiss();
                  this._popupNearMiss(box.x+box.w/2, box.y-30);
                }
              }
            }
            break;
          case 'movingblock': {
            const t = performance.now()/1000;
            if(o.axis==='vertical') o.y = o.baseY + Math.sin(t*o.speed+o.phase)*o.range;
            else o.x = o.baseX + Math.sin(t*o.speed+o.phase)*o.range;
            const liveBox = this.screenBox(o); // re-derive after moving
            if(aabb(pBox, liveBox)) this.die();
            break;
          }
          case 'rotor': {
            const t = performance.now()/1000;
            const angle = t*o.speed + o.phase;
            const bx = box.x + Math.cos(angle)*o.radius;
            const by = o.y + Math.sin(angle)*o.radius;
            o._bx = bx; o._by = by; // stashed for rendering this same frame
            const bladeBox = { x:bx-o.bladeSize/2, y:by-o.bladeSize/2, w:o.bladeSize, h:o.bladeSize };
            if(aabb(pBox, bladeBox)) this.die();
            break;
          }
          case 'laser': {
            const t = (performance.now()/1000 + o.phase) % o.cycle;
            if(t < o.idleTime) o._phase = 'idle';
            else if(t < o.idleTime + o.warnTime) o._phase = 'warn';
            else o._phase = 'active';
            if(o._phase === 'active' && aabb(pBox, box)) this.die();
            break;
          }
          case 'homer': {
            const targetY = p.y + p.renderSize/2 - o.h/2;
            const diff = targetY - o.y;
            const step = clamp(diff, -o.trackSpeed*dt, o.trackSpeed*dt);
            o.y += step;
            o.y = clamp(o.y, 20, GROUND_Y - o.h - 20);
            const liveBox = this.screenBox(o);
            if(aabb(pBox, liveBox)) this.die();
            break;
          }
          case 'jumppad':
            if(p.form==='cube' && !o.used && aabb(visBox, {x:box.x,y:box.y,w:box.w,h:box.h+8})){
              o.used = true;
              const mult = o.strength==='red' ? 1.7 : (o.strength==='yellow' ? 1.25 : 0.9);
              p.vy = -CONFIG.JUMP_FORCE*mult*p.gravityDir;
              p.grounded = false;
              const color = o.strength==='red' ? '#ff3d5a' : (o.strength==='yellow' ? '#ffe23d' : '#ff2ee6');
              this.particles.burstJump(box.x+box.w/2, box.y, color);
              setTimeout(()=>{ o.used=false; }, 260);
            }
            break;
          case 'jumporb':
            o.pulse += dt*4;
            if(p.form==='cube' && !o.used && this.input.jumpPressed && aabb({x:pBox.x-10,y:pBox.y-10,w:pBox.w+20,h:pBox.h+20}, box)){
              p.vy = -CONFIG.JUMP_FORCE*1.05*p.gravityDir;
              p.grounded = false; o.used = true;
              this.particles.burstJump(box.x+box.w/2, box.y+box.h/2, '#35f5ff');
              setTimeout(()=>{ o.used=false; }, 200);
            }
            break;
          case 'coin':
            o.spin += dt*5;
            if(!o.collected && aabb(pBox, box)){
              o.collected = true;
              this.score.coinCollected();
              this.particles.burstCoin(box.x+box.w/2, box.y+box.h/2);
            }
            break;
          case 'portal':
            if(aabb(pBox, box) && !o.triggered.has('hit')){
              o.triggered.add('hit');
              this.particles.burstPortal(box.x+box.w/2, box.y+box.h/2,
                o.kind==='speed' ? '#3dff8f' : o.kind==='slow' ? '#ff3d5a' : o.kind==='gravity' ? '#ffffff' : '#3dff8f');
              if(o.kind==='speed') this._applyTempSpeed(1.35, 1.6);
              else if(o.kind==='slow') this._applyTempSpeed(0.7, 1.6);
              else if(o.kind==='gravity') p.setGravityDir(p.gravityDir * -1);
              else if(o.kind==='size') p.setSizeScale(0.55, 3.5);
            }
            break;
          case 'formportal':
            if(aabb(pBox, box) && !o.triggered.has('hit') && p.form !== o.form){
              o.triggered.add('hit');
              p.setForm(o.form);
            }
            break;
          case 'checkpointFlag':
            if(!o.passed && box.x + box.w < pBox.x){
              o.passed = true;
              this.particles.burstPortal(box.x+box.w/2, box.y+box.h/2, '#ffe23d');
            }
            break;
        }
      }
    }
    _applyTempSpeed(mult, duration){
      this._tempSpeedMult = mult; this._tempSpeedTimer = duration;
    }

    worldToScreen(worldX){ return worldX - this.worldX + this.player.x; }

    /* ---------- main update ---------- */
    update(dt){
      if(this.state === 'dead-anim'){
        this.particles.update(dt);
        this.deathTimer -= dt;
        if(this.deathTimer<=0){
          if(this.checkpoint && this.livesRemaining>0) this.respawnAtCheckpoint();
          else this.finishDeath();
        }
        return;
      }
      if(this.state !== 'playing') { this.particles.update(dt); return; }

      // consume ability inputs
      if(this.input.consumeDash()) this.player.tryDash();
      if(this.input.consumeTimeSlow()) this.player.tryTimeSlow();
      if(this.input.downPressed && this.player.canGroundSlam) this.player.groundSlam();

      let dtEff = dt;
      if(this.player.timeSlowActive>0) dtEff *= 0.4;
      if(this._tempSpeedTimer>0){ this._tempSpeedTimer -= dt; }

      let speed = CONFIG.RUN_SPEED * this.speedMult * (this._tempSpeedTimer>0 ? this._tempSpeedMult : 1);

      if(this.input.consumeJumpPress()) this.jumpBufferTimer = CONFIG.JUMP_BUFFER_TIME;
      if(this.jumpBufferTimer > 0 && this.player.jump()) this.jumpBufferTimer = 0;

      const dashBonus = this.player.tickTimers(dtEff, CONFIG.RUN_SPEED * this.speedMult);
      if(this.player.form === 'ship') this.player.updateShip(dtEff, this.input);
      else this.player.updateCube(dtEff, this.input);

      // Advance the world scroll BEFORE resolving collisions, so the
      // obstacle positions used for collision this frame match exactly what
      // gets drawn this frame. Doing this after collision (as before) meant
      // render() used a slightly newer worldX than resolveVertical() did,
      // which could make death/landing look like it happened on clean
      // ground/air when the obstacle had already visually moved.
      const moveAmount = (speed + dashBonus) * dtEff;
      this.worldX += moveAmount;
      this.score.addDistance(moveAmount / PPM);
      this.score.update(dtEff);
      this.player.trailColor = hasReward('cube-curiosity_comet_trail')
        ? `hsl(${Math.floor(performance.now()/9)%360} 100% 65%)`
        : this.skinPrefs.color;

      this.chunks.ensureSpawned(this.worldX, this.score.distanceM, this.checkpointsReached + 1);

      this.resolveVertical();
      // a jump pressed just before landing gets a second shot the instant
      // grounded becomes true this frame, instead of being thrown away
      if(this.jumpBufferTimer > 0 && this.player.jump()) this.jumpBufferTimer = 0;
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dtEff);
      this.handleInteractions(dtEff);

      this.chunks.pruneBehind(this.worldX);
      this.particles.update(dtEff);

      // gentle player trail while airborne
      if(!this.player.grounded && Math.random()<0.5){
        this.particles.trail(this.player.x+this.player.renderSize/2, this.player.y+this.player.renderSize/2, this.player.trailColor);
      }
      // speed-line streaks during a dash or a speed/slow portal boost
      if(this._tempSpeedTimer>0 || this.player.dashActive>0){
        const streakColor = this.player.dashActive>0 ? '#ffffff' : (this._tempSpeedMult>1 ? '#3dff8f' : '#ff3d5a');
        for(let i=0;i<2;i++){
          this.particles.spawn({ x:this.player.x+rand(-10,50), y:this.player.y+rand(0,this.player.renderSize),
            vx:-300-rand(0,150), vy:0, life:0.22, size:rand(2,4), color:streakColor, gravity:0 });
        }
      }

      // checkpoint check — CHECKPOINTS_PER_STAGE checkpoints fall within
      // each stage's distance; only the last one in the group is "major"
      // (advances stage/theme/speed), the rest are "minor" (upgrade +
      // respawn anchor only).
      const subDist = CONFIG.CHECKPOINT_DISTANCE / CONFIG.CHECKPOINTS_PER_STAGE;
      const nextCheckpointTarget = (this.checkpointsReached + 1) * subDist;
      if(this.score.distanceM >= nextCheckpointTarget){
        this.checkpointsReached++;
        const isMajor = (this.checkpointsReached % CONFIG.CHECKPOINTS_PER_STAGE === 0);
        this.triggerCheckpoint(isMajor);
      }

      if(this.shakeT>0) this.shakeT -= dt;

      this._updateHUD();
      this._refreshAbilityBar();
    }

    /* ---------- render ---------- */
    render(){
      ctx.save();
      if(this.shakeT>0){
        const mag = this.shakeMag * (this.shakeT/0.4);
        ctx.translate(rand(-mag,mag), rand(-mag,mag));
      }
      this.theme.render(ctx, this.worldX);
      if(hasReward('cube-curiosity_midnight_grid')){
        ctx.save();ctx.globalAlpha=.18;ctx.strokeStyle='#7c3aed';ctx.lineWidth=1;
        for(let x=-(this.worldX%48);x<W;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
        for(let y=0;y<H;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.restore();
      }

      if(this.theme.theme.name === 'CYBER CITY'){
        this._drawSteppedGround();
      }

      // reversed-gravity zones: a proper roof, not just a thin line — a
      // solid band matching the ground's own visual weight, so the level
      // reads as bounded top and bottom while flipped, and it's obvious
      // where the player is actually standing.
      if(this.player.gravityDir < 0){
        const th = this.theme.theme;
        ctx.fillStyle = th.ground;
        ctx.fillRect(0, 0, W, CONFIG.ROOF_HEIGHT);
        ctx.fillStyle = th.groundLine;
        ctx.shadowColor = th.groundLine; ctx.shadowBlur = 12;
        ctx.fillRect(0, CONFIG.ROOF_HEIGHT, W, 3);
        ctx.shadowBlur = 0;
      }

      // world objects
      for(const o of this.chunks.objects){
        const sx = this.worldToScreen(o.x);
        if(sx < -200 || sx > W+200) continue;
        this._drawObstacle(o, sx);
      }

      this.particles.render(ctx);
      this._drawPlayerTrail();
      this._drawPlayer();
      ctx.restore();
    }

    // Overdraws the flat base ground with Cyber City's stepped terrain,
    // segment by segment, plus a short vertical connector at each step so
    // the height change reads clearly instead of looking like a gap.
    _drawSteppedGround(){
      const th = this.theme.theme;
      const segs = this.chunks.groundSegments;
      let prevRight = null, prevLocalY = null;
      for(const seg of segs){
        const sxStart = this.worldToScreen(seg.xStart);
        const sxEnd = this.worldToScreen(seg.xEnd);
        if(sxEnd < -20 || sxStart > W+20){ continue; }
        const localGroundY = GROUND_Y + seg.offset;
        const left = Math.max(sxStart, -5);
        const right = Math.min(sxEnd, W+5);
        if(right > left){
          ctx.fillStyle = th.ground;
          ctx.fillRect(left, localGroundY, right-left, H-localGroundY);
          ctx.fillStyle = th.groundLine;
          ctx.shadowColor = th.groundLine; ctx.shadowBlur = 10;
          ctx.fillRect(left, localGroundY, right-left, 3);
          ctx.shadowBlur = 0;
        }
        // vertical connector at the step boundary between two segments
        if(prevRight !== null && Math.abs(sxStart-prevRight) < 2 && prevLocalY !== localGroundY){
          const top = Math.min(prevLocalY, localGroundY);
          const bottom = Math.max(prevLocalY, localGroundY) + 3;
          ctx.fillStyle = th.groundLine;
          ctx.shadowColor = th.groundLine; ctx.shadowBlur = 8;
          ctx.fillRect(sxStart-1, top, 3, bottom-top);
          ctx.shadowBlur = 0;
        }
        prevRight = sxEnd; prevLocalY = localGroundY;
      }
    }

    _drawPlayerTrail(){
      const p = this.player;
      const n = p.trailHistory.length;
      for(let i=n-1;i>=1;i--){
        const t = p.trailHistory[i];
        ctx.save();
        ctx.globalAlpha = (1 - i/n) * 0.22;
        ctx.translate(t.x+t.size/2, t.y+t.size/2);
        ctx.rotate(t.rot);
        ctx.fillStyle = p.trailColor;
        ctx.fillRect(-t.size*0.35, -t.size*0.35, t.size*0.7, t.size*0.7);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    _drawObstacle(o, sx){
      const th = this.theme.theme;
      switch(o.type){
        case 'spike':{
          ctx.save();
          ctx.translate(sx, o.y);
          ctx.fillStyle = th.accent; ctx.shadowColor = th.accent; ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(0, o.h); ctx.lineTo(o.w/2, 0); ctx.lineTo(o.w, o.h);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
        case 'ceiling':{
          ctx.fillStyle = th.accent; ctx.shadowColor = th.accent; ctx.shadowBlur = 10;
          // hanging spikes pattern
          const n = Math.floor(o.w/24);
          for(let i=0;i<n;i++){
            ctx.beginPath();
            const bx = sx + i*24;
            ctx.moveTo(bx, o.h); ctx.lineTo(bx+12, 0); ctx.lineTo(bx+24, o.h);
            ctx.closePath(); ctx.fill();
          }
          break;
        }
        case 'platform':{
          if(o.bouncy){
            ctx.fillStyle = '#ff2ee6'; ctx.strokeStyle = '#ff2ee6'; ctx.lineWidth = 2;
            ctx.shadowColor = '#ff2ee6'; ctx.shadowBlur = 16;
            ctx.fillRect(sx, o.y, o.w, o.h);
            ctx.strokeRect(sx, o.y, o.w, o.h);
          } else {
            ctx.fillStyle = '#171246'; ctx.strokeStyle = th.accent; ctx.lineWidth=2;
            ctx.shadowColor = th.accent; ctx.shadowBlur = 8;
            ctx.fillRect(sx, o.y, o.w, o.h);
            ctx.strokeRect(sx, o.y, o.w, o.h);
          }
          break;
        }
        case 'movingblock':{
          ctx.fillStyle = '#ff3d5a'; ctx.shadowColor='#ff3d5a'; ctx.shadowBlur = 12;
          ctx.fillRect(sx, o.y, o.w, o.h);
          break;
        }
        case 'jumppad':{
          const c = o.strength==='red' ? '#ff3d5a' : (o.strength==='yellow' ? '#ffe23d' : '#ff2ee6');
          ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = o.used ? 22 : 10;
          ctx.fillRect(sx, o.y, o.w, o.h);
          break;
        }
        case 'jumporb':{
          const r = o.w/2 + Math.sin(o.pulse)*2;
          ctx.strokeStyle = '#35f5ff'; ctx.lineWidth=3; ctx.shadowColor='#35f5ff'; ctx.shadowBlur=14;
          ctx.beginPath(); ctx.arc(sx+o.w/2, o.y+o.h/2, r, 0, Math.PI*2); ctx.stroke();
          break;
        }
        case 'coin':{
          if(o.collected) break;
          const scaleX = Math.abs(Math.cos(o.spin));
          ctx.save();
          ctx.translate(sx+o.w/2, o.y+o.h/2);
          ctx.scale(Math.max(0.15,scaleX),1);
          ctx.fillStyle = '#ffe23d'; ctx.shadowColor='#ffe23d'; ctx.shadowBlur=12;
          ctx.beginPath(); ctx.arc(0,0,o.w/2,0,Math.PI*2); ctx.fill();
          ctx.restore();
          break;
        }
        case 'portal':{
          if(o.kind === 'gravity'){
            ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 20;
            ctx.fillRect(sx, o.y, o.w, o.h);
            ctx.shadowBlur = 0;
            break;
          }
          const c = o.kind==='speed' ? '#3dff8f' : o.kind==='slow' ? '#ff3d5a' : '#3dff8f';
          ctx.fillStyle = c; ctx.globalAlpha=0.25; ctx.shadowColor=c; ctx.shadowBlur=20;
          ctx.fillRect(sx, o.y, o.w, o.h);
          ctx.globalAlpha=1;
          ctx.strokeStyle = c; ctx.lineWidth=3; ctx.strokeRect(sx,o.y,o.w,o.h);
          break;
        }
        case 'formportal':{
          const c = o.form==='ship' ? '#ffe23d' : '#35f5ff';
          ctx.fillStyle = c; ctx.globalAlpha=0.22; ctx.shadowColor=c; ctx.shadowBlur=22;
          ctx.fillRect(sx, o.y, o.w, o.h);
          ctx.globalAlpha=1;
          ctx.strokeStyle = c; ctx.lineWidth=3; ctx.strokeRect(sx,o.y,o.w,o.h);
          // small icon hinting at the form
          ctx.fillStyle = c;
          if(o.form==='ship'){ ctx.beginPath(); ctx.moveTo(sx+o.w/2+8,o.y+o.h/2); ctx.lineTo(sx+o.w/2-8,o.y+o.h/2-8); ctx.lineTo(sx+o.w/2-8,o.y+o.h/2+8); ctx.closePath(); ctx.fill(); }
          else { ctx.fillRect(sx+o.w/2-7, o.y+o.h/2-7, 14, 14); }
          break;
        }
        case 'shipwall':{
          ctx.fillStyle = '#ff3d5a'; ctx.shadowColor='#ff3d5a'; ctx.shadowBlur=10;
          ctx.fillRect(sx, o.y, o.w, o.h);
          break;
        }
        case 'rotor': {
          const bx = (o._bx !== undefined) ? o._bx : sx;
          const by = (o._by !== undefined) ? o._by : o.y;
          // anchor + orbit guide
          ctx.strokeStyle = 'rgba(255,61,90,0.35)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(sx, o.y, o.radius, 0, Math.PI*2); ctx.stroke();
          ctx.fillStyle = '#5c0c18';
          ctx.beginPath(); ctx.arc(sx, o.y, 6, 0, Math.PI*2); ctx.fill();
          // connecting arm
          ctx.strokeStyle = '#ff3d5a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(sx, o.y); ctx.lineTo(bx, by); ctx.stroke();
          // spinning blade
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate((performance.now()/1000)*o.speed*3);
          ctx.fillStyle = '#ff3d5a'; ctx.shadowColor='#ff3d5a'; ctx.shadowBlur=14;
          const bs = o.bladeSize;
          for(let i=0;i<4;i++){
            ctx.rotate(Math.PI/2);
            ctx.beginPath();
            ctx.moveTo(0,0); ctx.lineTo(bs*0.5,-bs*0.15); ctx.lineTo(bs*0.5,bs*0.15);
            ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          break;
        }
        case 'laser': {
          const phase = o._phase || 'idle';
          if(phase === 'idle'){
            ctx.setLineDash([6,8]);
            ctx.strokeStyle = 'rgba(255,61,90,0.35)'; ctx.lineWidth = o.w*0.5;
            ctx.beginPath(); ctx.moveTo(sx+o.w/2, 0); ctx.lineTo(sx+o.w/2, GROUND_Y); ctx.stroke();
            ctx.setLineDash([]);
          } else if(phase === 'warn'){
            const pulse = 0.4 + Math.abs(Math.sin(performance.now()/80))*0.5;
            ctx.fillStyle = `rgba(255,61,90,${pulse})`; ctx.shadowColor='#ff3d5a'; ctx.shadowBlur=16;
            ctx.fillRect(sx, 0, o.w, GROUND_Y);
          } else {
            ctx.fillStyle = '#ff3d5a'; ctx.shadowColor='#ff3d5a'; ctx.shadowBlur=24;
            ctx.fillRect(sx, 0, o.w, GROUND_Y);
            ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.6;
            ctx.fillRect(sx+o.w*0.3, 0, o.w*0.4, GROUND_Y);
            ctx.globalAlpha = 1;
          }
          // emitter caps top & bottom regardless of phase
          ctx.shadowBlur = 0; ctx.fillStyle = '#5c0c18';
          ctx.fillRect(sx-6, -4, o.w+12, 14);
          ctx.fillRect(sx-6, GROUND_Y-10, o.w+12, 14);
          break;
        }
        case 'homer': {
          ctx.fillStyle = '#ff2ee6'; ctx.shadowColor='#ff2ee6'; ctx.shadowBlur=16;
          ctx.beginPath();
          ctx.arc(sx+o.w/2, o.y+o.h/2, o.w/2, 0, Math.PI*2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,46,230,0.4)'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(sx+o.w/2, o.y+o.h/2, o.w/2+6, 0, Math.PI*2); ctx.stroke();
          break;
        }
        case 'gap': {
          // The theme always fills a continuous ground bar, so gaps must
          // punch their own hole in it here (drawn after the ground, so it
          // paints over it) plus glowing edge markers so the drop is
          // actually visible before the player reaches it, not just lethal.
          ctx.fillStyle = '#000000';
          ctx.fillRect(sx, GROUND_Y, o.w, H - GROUND_Y);
          ctx.shadowColor = '#ff3d5a'; ctx.shadowBlur = 12;
          ctx.fillStyle = '#ff3d5a';
          ctx.fillRect(sx - 2, GROUND_Y - 4, 4, 14);
          ctx.fillRect(sx + o.w - 2, GROUND_Y - 4, 4, 14);
          ctx.shadowBlur = 0;
          break;
        }
        case 'checkpointFlag': {
          // Non-lethal world marker showing exactly where the next
          // checkpoint / upgrade choice will trigger. Major (stage-end)
          // flags are taller and gold; minor (mid-stage) flags are shorter
          // and cyan, so the two are readable at a glance. Anchored to its
          // own baked-in local ground height so it plants correctly on
          // Cyber City's stepped terrain instead of always the base line.
          const baseY = o.groundY !== undefined ? o.groundY : GROUND_Y;
          const c = o.major ? '#ffe23d' : '#35f5ff';
          const poleHeight = o.major ? o.h : o.h * 0.7;
          ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.shadowColor = c; ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo(sx, baseY);
          ctx.lineTo(sx, baseY - poleHeight);
          ctx.stroke();
          ctx.shadowBlur = 10;
          ctx.fillStyle = o.passed ? `rgba(${o.major?'255,226,61':'53,245,255'},0.35)` : c;
          ctx.beginPath();
          ctx.moveTo(sx, baseY - poleHeight);
          ctx.lineTo(sx + 30, baseY - poleHeight + 11);
          ctx.lineTo(sx, baseY - poleHeight + 22);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
          break;
        }
      }
    }

    _drawPlayer(){
      const p = this.player;
      const size = p.renderSize;
      const cx = p.x + size/2, cy = p.y + size/2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(p.rotation);

      // squash/stretch juice on jump-launch and landing impact
      const squashT = clamp(p.squashTimer / 0.16, 0, 1);
      ctx.scale(1 + 0.22*squashT, 1 - 0.3*squashT);

      const half = size/2 + CONFIG.PLAYER_VISUAL_PAD/2;
      const comboTier = Math.min(Math.floor((this.score.combo-1)/2), 6);
      const rewardColour = hasReward('cube-curiosity_prismatic_cube')
        ? `hsl(${Math.floor(performance.now()/12)%360} 95% 65%)`
        : hasReward('cube-curiosity_arcade_academy_cube') ? '#ffd15c'
        : hasReward('cube-curiosity_cyber_city_legend') ? '#ff2ee6'
        : this.skinPrefs.color;
      const glowColor = p.hasShield ? '#35f5ff' : (p.phaseTimer>0 ? '#ffe23d' : rewardColour);
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = (p.landedThisFrame ? 26 : 16) + comboTier*3;
      ctx.fillStyle = '#0d0a26';
      ctx.strokeStyle = glowColor; ctx.lineWidth = 3;

      if(p.form === 'ship'){
        ctx.beginPath();
        ctx.moveTo(half, 0);
        ctx.lineTo(-half*0.7, -half*0.75);
        ctx.lineTo(-half*0.25, 0);
        ctx.lineTo(-half*0.7, half*0.75);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = glowColor;
        ctx.beginPath(); ctx.arc(-half*0.55, 0, half*0.16, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.beginPath();
        const r = 6;
        ctx.moveTo(-half+r,-half);
        ctx.arcTo(half,-half,half,half,r);
        ctx.arcTo(half,half,-half,half,r);
        ctx.arcTo(-half,half,-half,-half,r);
        ctx.arcTo(-half,-half,half,-half,r);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        const pattern = FACE_PATTERNS.find(f=>f.id===this.skinPrefs.pattern) || FACE_PATTERNS[0];
        pattern.draw(ctx, half, glowColor);
      }
      if(p.hasShield){
        ctx.beginPath(); ctx.arc(0,0, half+8, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(53,245,255,0.6)'; ctx.lineWidth=2; ctx.stroke();
      }
      ctx.restore();
    }

    loop(t){
      const dt = Math.min((t - this.lastTime)/1000 || 0, 0.033);
      this.lastTime = t;
      this.update(dt);
      PlatformManager.heartbeat(GAME_ID, this.state === 'playing');
      this.render();
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  const game = new Game();

  async function loadClassQuestions(){
    const status = document.getElementById('questionBankStatus');
    const play = document.getElementById('playBtn');
    play.disabled = true;
    const result = await QuestionManager.loadCurrentBanks(window.GAME_CONFIG?.supportedQuestionFormats);
    status.classList.toggle('error', !result.ok);
    status.textContent = result.ok
      ? `Class questions ready · ${QuestionManager.getBankName()}`
      : result.error === 'class-code-required'
        ? 'Please enter your class code on the Arcade Academy Hub.'
        : 'This class does not have compatible multiple-choice questions for this game.';
    play.disabled = !result.ok;
  }

  function registerChallengeAdapter(){
    window.ChallengeManager?.register?.({
      start: () => game.startRun(),
      snapshot: () => ({
        alive: game.state !== 'gameover',
        distance: Math.floor(game.score.distanceM),
        score: Math.floor(game.score.score)
      })
    });
  }
  registerChallengeAdapter();
  window.addEventListener('arcade-challenge-manager-ready', registerChallengeAdapter);
  loadClassQuestions();
