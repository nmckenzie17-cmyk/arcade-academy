"use strict";
const GLOBAL_BODY_FONT = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'sans-serif';
const GLOBAL_TITLE_FONT = getComputedStyle(document.documentElement).getPropertyValue('--font-title').trim() || 'monospace';
/* =========================================================================
   RUMBUX REVISION — single-file canvas beat 'em up roguelike
   Sections: CONFIG, UTIL, INPUT, PARTICLES, SPRITES, DATA (characters/
   enemies/weapons/upgrades/themes), ENTITIES (Player/Enemy/Boss/Weapon/
   Projectile/Destructible), STAGE/RUN MANAGERS, UI, GAME (state machine)

   EXTENSION POINTS (marked inline with "EXT:") are where future systems
   should hook in: educational question rewards, permanent meta-progression,
   additional characters, additional enemies/bosses/weapons, save data.
   ========================================================================= */

// ---------------------------------------------------------------------
// CONFIG — central tunable values. Avoid scattering magic numbers.
// ---------------------------------------------------------------------
const CONFIG = {
  canvasW: 960, canvasH: 540,
  gravity: 1500,
  streetTop: 300,      // shallow edge of the street (depth axis)
  streetBottom: 470,   // near edge of the street
  groundY: 470,        // baseline "floor" y for depth=1
  scrollSpeed: 90,
  cameraCatchup: 4,
  player: {
    baseSpeed: 165,
    baseHealth: 100,
    baseDamage: 10,
    hitboxW: 30, hitboxH: 46,
    dodgeSpeed: 420,
    dodgeTime: 0.24,
    dodgeIframes: 0.16,
    dodgeCooldown: 0.55,
    comboWindow: 0.9,
    jumpVel: -560,
    specialCooldown: 8,
    invulnAfterHit: 0.5,
  },
  hitstop: {
    light: 0.045, heavy: 0.11, finisher: 0.14, special: 0.13,
  },
  shake: {
    light: 4, heavy: 9, finisher: 12, boss: 16,
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// depth (0..1) -> vertical screen offset & scale, for pseudo-3D street feel
function depthToScreenY(depth) {
  return CONFIG.streetTop + depth * (CONFIG.streetBottom - CONFIG.streetTop);
}
function depthToScale(depth) {
  return lerp(0.78, 1.08, depth);
}

// ---------------------------------------------------------------------
// INPUT MANAGER
// ---------------------------------------------------------------------
class InputManager {
  constructor() {
    this.keys = {};
    this.virtualKeys = {}; // touch-driven state, merged with keyboard state
    this.pressed = {}; // single-frame press flags
    window.addEventListener('keydown', (e) => {
      const k = this.mapKey(e.code, e.key);
      if (!k) return;
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = this.mapKey(e.code, e.key);
      if (!k) return;
      this.keys[k] = false;
    });
  }
  mapKey(code, key) {
    const map = {
      'KeyW':'up','ArrowUp':'up','KeyS':'down','ArrowDown':'down',
      'KeyA':'left','ArrowLeft':'left','KeyD':'right','ArrowRight':'right',
      'KeyJ':'attack','KeyK':'heavy','KeyL':'special','Space':'jump',
      'ShiftLeft':'dodge','ShiftRight':'dodge','KeyB':'buildPanel','KeyG':'grab',
    };
    return map[code] || null;
  }
  // Called by touch controls (virtual joystick / on-screen buttons).
  setVirtual(name, val) {
    const was = !!this.keys[name] || !!this.virtualKeys[name];
    this.virtualKeys[name] = val;
    const now = !!this.keys[name] || !!this.virtualKeys[name];
    if (!was && now) this.pressed[name] = true;
  }
  down(name) { return !!this.keys[name] || !!this.virtualKeys[name]; }
  consumePress(name) {
    if (this.pressed[name]) { this.pressed[name] = false; return true; }
    return false;
  }
  endFrame() { this.pressed = {}; }
}

// ---------------------------------------------------------------------
// TOUCH CONTROLS — virtual joystick + on-screen buttons for iPad/touch.
// Feeds the same InputManager virtual-key API used by keyboard input,
// so Player/combat code never needs to know the input source.
// ---------------------------------------------------------------------
class TouchControls {
  constructor(input) {
    this.input = input;
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
    if (this.isTouch) document.body.classList.add('touch-device');

    this.stickZone = document.getElementById('tcStickZone');
    this.stickBase = document.getElementById('tcStickBase');
    this.stickNub = document.getElementById('tcStickNub');
    this.stickId = null;
    this.stickOrigin = {x:0,y:0};

    this.bindStick();
    this.bindButton('tcAttack', 'attack');
    this.bindButton('tcHeavy', 'heavy');
    this.bindButton('tcJump', 'jump');
    this.bindButton('tcDodge', 'dodge');
    this.bindButton('tcSpecial', 'special');
    this.bindButton('tcGrab', 'grab');

    // Prevent iOS Safari gestures (pinch-zoom, double-tap-zoom, pull-to-refresh)
    document.addEventListener('gesturestart', (e)=>e.preventDefault());
    document.addEventListener('dblclick', (e)=>e.preventDefault(), {passive:false});
    document.addEventListener('touchmove', (e)=>{ if (e.scale && e.scale !== 1) e.preventDefault(); }, {passive:false});
  }

  bindButton(elId, keyName) {
    const el = document.getElementById(elId);
    if (!el) return;
    const start = (e) => {
      e.preventDefault();
      el.classList.add('active');
      this.input.setVirtual(keyName, true);
    };
    const end = (e) => {
      e.preventDefault();
      el.classList.remove('active');
      this.input.setVirtual(keyName, false);
    };
    el.addEventListener('touchstart', start, {passive:false});
    el.addEventListener('touchend', end, {passive:false});
    el.addEventListener('touchcancel', end, {passive:false});
    // also support mouse for desktop testing of the touch layout
    el.addEventListener('mousedown', start);
    window.addEventListener('mouseup', end);
  }

  bindStick() {
    const maxRadius = 50;
    const updateFromDelta = (dx, dy) => {
      const r = Math.min(maxRadius, Math.hypot(dx,dy));
      const angle = Math.atan2(dy,dx);
      const nx = Math.cos(angle)*r, ny = Math.sin(angle)*r;
      this.stickNub.style.left = (30+nx) + 'px';
      this.stickNub.style.top = (30+ny) + 'px';
      const dead = 14;
      const active = Math.hypot(dx,dy) > dead;
      this.input.setVirtual('left', active && dx < -dead*0.5);
      this.input.setVirtual('right', active && dx > dead*0.5);
      this.input.setVirtual('up', active && dy < -dead*0.5);
      this.input.setVirtual('down', active && dy > dead*0.5);
    };
    const clearStick = () => {
      this.input.setVirtual('left', false);
      this.input.setVirtual('right', false);
      this.input.setVirtual('up', false);
      this.input.setVirtual('down', false);
      this.stickBase.style.display = 'none';
      this.stickId = null;
    };
    this.stickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.stickId !== null) return;
      const t = e.changedTouches[0];
      this.stickId = t.identifier;
      const rect = this.stickZone.getBoundingClientRect();
      const bx = clamp(t.clientX - rect.left, 60, rect.width-60);
      const by = clamp(t.clientY - rect.top, 60, rect.height-60);
      this.stickOrigin = {x: rect.left+bx, y: rect.top+by};
      this.stickBase.style.left = (bx-55)+'px';
      this.stickBase.style.top = (by-55)+'px';
      this.stickBase.style.display = 'block';
      updateFromDelta(0,0);
    }, {passive:false});
    this.stickZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickId) continue;
        updateFromDelta(t.clientX - this.stickOrigin.x, t.clientY - this.stickOrigin.y);
      }
    }, {passive:false});
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickId) clearStick();
      }
    };
    this.stickZone.addEventListener('touchend', onEnd, {passive:false});
    this.stickZone.addEventListener('touchcancel', onEnd, {passive:false});
  }
}

// ---------------------------------------------------------------------
// PARTICLES
// ---------------------------------------------------------------------
class Particle {
  constructor(x, y, vx, vy, life, color, size, gravity=false, shrink=true) {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.life=life; this.maxLife=life;
    this.color=color; this.size=size; this.gravity=gravity; this.shrink=shrink;
  }
  update(dt) {
    this.x += this.vx*dt; this.y += this.vy*dt;
    if (this.gravity) this.vy += 900*dt;
    this.vx *= 0.96;
    this.life -= dt;
    return this.life > 0;
  }
  draw(ctx, camX) {
    const a = clamp(this.life/this.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    const s = this.shrink ? this.size*a : this.size;
    ctx.fillRect(Math.round(this.x-camX-s/2), Math.round(this.y-s/2), Math.ceil(s), Math.ceil(s));
    ctx.globalAlpha = 1;
  }
}

class ParticleSystem {
  constructor() { this.list = []; this.numbers = []; }
  burst(x, y, color, count=8, opts={}) {
    for (let i=0;i<count;i++) {
      const a = rand(0, Math.PI*2);
      const spd = rand(opts.minSpd||40, opts.maxSpd||220);
      this.list.push(new Particle(x, y, Math.cos(a)*spd, Math.sin(a)*spd*(opts.vScale||0.6),
        rand(opts.minLife||0.25, opts.maxLife||0.6), color, rand(opts.minSize||2, opts.maxSize||5), opts.gravity, true));
    }
  }
  dust(x, y) {
    this.burst(x, y, 'rgba(200,190,170,0.8)', 5, {minSpd:20,maxSpd:70,vScale:0.3,minLife:0.3,maxLife:0.55,minSize:2,maxSize:4});
  }
  impact(x, y) {
    this.burst(x, y, '#fff6c8', 10, {minSpd:80,maxSpd:260,vScale:0.7,minLife:0.15,maxLife:0.35,minSize:2,maxSize:4});
  }
  blood(x, y, color='#ff3355') {
    this.burst(x, y, color, 7, {minSpd:60,maxSpd:200,vScale:0.8,minLife:0.3,maxLife:0.6,minSize:2,maxSize:4,gravity:true});
  }
  damageNumber(x, y, amount, crit=false) {
    this.numbers.push({x,y,vy:-60,life:0.9,maxLife:0.9,text:Math.round(amount).toString(),crit});
  }
  update(dt) {
    this.list = this.list.filter(p => p.update(dt));
    this.numbers = this.numbers.filter(n => { n.y += n.vy*dt; n.vy += 40*dt; n.life -= dt; return n.life>0; });
  }
  draw(ctx, camX) {
    for (const p of this.list) p.draw(ctx, camX);
    ctx.textAlign = 'center';
    for (const n of this.numbers) {
      const a = clamp(n.life/n.maxLife,0,1);
      ctx.globalAlpha = a;
      ctx.font = n.crit ? `bold 20px ${GLOBAL_TITLE_FONT}` : `bold 15px ${GLOBAL_BODY_FONT}`;
      ctx.fillStyle = n.crit ? '#ffe14d' : '#ffffff';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.strokeText(n.text, n.x-camX, n.y);
      ctx.fillText(n.text, n.x-camX, n.y);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------
// SPRITE DRAWING — procedural blocky "pixel art" humanoid figures.
// Built from rectangles so any palette/pose combo can be rendered
// without external image assets.
// ---------------------------------------------------------------------
function drawRect(ctx, x, y, w, h, color, outline) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  if (outline) {
    ctx.strokeStyle = outline===true ? 'rgba(0,0,0,0.55)' : outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x)+0.5, Math.round(y)+0.5, Math.round(w)-1, Math.round(h)-1);
  }
}

// Darkens (negative amt) or lightens (positive amt) a '#rgb'/'#rrggbb' color
// by a flat channel amount. Used for cheap pixel-art shading/highlights
// without needing separate shadow/highlight colors in every palette.
function shadeColor(hex, amt) {
  let c = hex.replace('#','');
  if (c.length===3) c = c.split('').map(ch=>ch+ch).join('');
  const num = parseInt(c,16);
  let r=(num>>16)+amt, g=((num>>8)&0xff)+amt, b=(num&0xff)+amt;
  r=Math.max(0,Math.min(255,r)); g=Math.max(0,Math.min(255,g)); b=Math.max(0,Math.min(255,b));
  return `rgb(${r},${g},${b})`;
}

function drawLimb(ctx, hipX, hipY, len1, len2, w, angle1, angle2, color, color2, capColor, propFn, jointAccent) {
  ctx.save();
  ctx.translate(hipX, hipY);
  ctx.rotate(angle1);
  drawRect(ctx, -w/2, 0, w, len1, color, true);
  drawRect(ctx, w/2-2, 0, 2, len1, shadeColor(color,-35)); // inner shade strip
  drawRect(ctx, -w/2, 2, 2, len1-4, shadeColor(color,18)); // outer highlight strip
  drawRect(ctx, -w/2+1, len1*0.28, w-2, len1*0.22, shadeColor(color,10)); // muscle bulge (bicep/thigh) highlight
  ctx.translate(0, len1);
  // joint accent (elbow/knee guard) — small colored band + highlight dot
  if (jointAccent) {
    drawRect(ctx, -w/2-1, -2, w+2, 3, jointAccent, true);
    drawRect(ctx, -1, -2, 2, 2, shadeColor(jointAccent, 40));
  }
  ctx.rotate(angle2);
  const c2 = color2||color;
  drawRect(ctx, -w/2, 0, w, len2, c2, true);
  drawRect(ctx, w/2-2, 0, 2, len2, shadeColor(c2,-35));
  if (capColor) {
    drawRect(ctx, -w/2-1, len2-5, w+2, 6, capColor, true);
    drawRect(ctx, -w/2, len2-3, (w+2)/3, 2, shadeColor(capColor,-25)); // finger/toe separation hint
    drawRect(ctx, -w/2-1, len2-1, w+2, 2, shadeColor(capColor,-40)); // shoe sole strip
  }
  if (propFn) propFn(ctx); // e.g. a held weapon, drawn in the hand's local space
  ctx.restore();
}

// Body proportions per archetype — the single biggest lever for making
// silhouettes read as different characters rather than recolors of the
// same rig. Scales torso/head/limb width; hip attachment points scale
// with it (via `ratio`) so limbs still meet the torso correctly.
const BUILD_PRESETS = {
  lean:   { torsoW:19, armW:6,  legW:8,  headW:16 },
  normal: { torsoW:24, armW:7,  legW:9,  headW:18 },
  bulky:  { torsoW:30, armW:9,  legW:11, headW:20 },
  huge:   { torsoW:35, armW:11, legW:13, headW:22 },
};

// Renders the head: skull, one of several hairstyles, an optional
// accessory (headband/cap/bandana), and a simple face.
function drawHead(ctx, P, bp, flashWhite) {
  const hw = bp.headW, hx = -hw/2;
  const c = (col)=> flashWhite?'#ffffff':col;
  const hairCol = c(P.hair);
  drawRect(ctx, hx, -20, hw, 18, c(P.skin), true);
  drawRect(ctx, hw/2-5, -20, 5, 18, flashWhite?'#fff':shadeColor(P.skin,-25));
  // subtle cheek/jaw shading for a bit of facial structure
  if (!flashWhite) drawRect(ctx, hx+hw*0.15, -6, hw*0.3, 3, shadeColor(P.skin,-12));
  // ear hint on the back side of the head
  if (!flashWhite) drawRect(ctx, hx-1, -12, 2, 5, shadeColor(P.skin,-10));

  const hairStyle = P.hairStyle||'short';
  if (hairStyle === 'bald') {
    drawRect(ctx, hx+2, -19, hw-4, 3, flashWhite?'#fff':shadeColor(P.skin,22));
  } else if (hairStyle === 'spiky') {
    drawRect(ctx, hx, -20, hw, 5, hairCol, true);
    if (!flashWhite) {
      ctx.fillStyle = hairCol;
      for (let s=0;s<4;s++) {
        const sx = hx+1+s*(hw-2)/4;
        ctx.beginPath();
        ctx.moveTo(sx,-20); ctx.lineTo(sx+3,-29-((s%2)*3)); ctx.lineTo(sx+6,-20);
        ctx.closePath(); ctx.fill();
      }
    }
  } else if (hairStyle === 'mohawk') {
    drawRect(ctx, hx, -20, hw, 4, flashWhite?'#fff':shadeColor(P.skin,-10));
    drawRect(ctx, -3, -33, 6, 15, hairCol, true);
  } else if (hairStyle === 'ponytail') {
    drawRect(ctx, hx, -20, hw, 7, hairCol, true);
    drawRect(ctx, hx-4, -16, 5, 17, hairCol, true);
  } else {
    drawRect(ctx, hx, -20, hw, 7, hairCol, true);
  }

  const accessory = P.accessory||'none';
  if (accessory === 'headband') {
    drawRect(ctx, hx, -15, hw, 3, c(P.accent));
  } else if (accessory === 'cap') {
    const capCol = flashWhite?'#fff':shadeColor(P.shirt,-10);
    drawRect(ctx, hx-1, -23, hw+2, 7, capCol, true);
    drawRect(ctx, hw*0.05, -18, hw*0.55, 4, capCol, true);
  } else if (accessory === 'bandana') {
    drawRect(ctx, hx, -18, hw, 4, c(P.accent), true);
    drawRect(ctx, hx-3, -16, 4, 11, c(P.accent));
  }

  if (!flashWhite) {
    drawRect(ctx, hx+hw*0.62, -10, 3, 3, '#1a1a1a');
    drawRect(ctx, hx+hw*0.66, -11, 1, 1, '#fff'); // eye shine
    drawRect(ctx, hx+hw*0.5, -13, hw*0.32, 2, shadeColor(P.hair,12));
  }
}

// pose: {armL:{a1,a2}, armR:{a1,a2}, legL:{a1,a2}, legR:{a1,a2}, torsoLean, headBob}
function drawFighter(ctx, cx, groundY, facing, scale, pose, palette, flashWhite, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha!==undefined?alpha:1;
  ctx.translate(cx, groundY);
  ctx.scale(scale*facing, scale);
  const P = palette;
  const bp = BUILD_PRESETS[P.build] || BUILD_PRESETS.normal;
  const ratio = bp.torsoW / 24;
  const legW = bp.legW, armW = bp.armW;
  // soft ground shadow
  ctx.save();
  ctx.globalAlpha *= 0.32;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 2, 17*ratio, 5, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  const torsoLean = pose.torsoLean||0;
  const bodyY = -pose.crouch*1||0;
  const shoeCap = flashWhite?'#fff':shadeColor(P.shoe,-15);
  const handCap = flashWhite?'#fff':shadeColor(P.skin,-10);
  const c = (col)=> flashWhite?'#ffffff':col;
  const sleeveless = P.accessory === 'vest';
  const sleeveCol = sleeveless ? c(P.skin) : c(P.shirt);
  const accentJoint = flashWhite ? null : P.accent;
  const gunProp = P.holdsWeapon ? (ctx)=>{
    drawRect(ctx, -3, -3, 4, 16, flashWhite?'#fff':'#1a1a1a', true);
    drawRect(ctx, -3, 10, 10, 4, flashWhite?'#fff':'#0a0a0a', true);
  } : null;
  // Small hand-attached props for characters whose kit calls for one but
  // don't hold a full weapon — wrapped knuckles, wrist tape, a satchel.
  const smallPropFn = !P.holdsWeapon && P.heldProp ? (ctx)=>{
    if (P.heldProp === 'wraps') {
      drawRect(ctx, -armW/2-2, -3, armW+4, 5, flashWhite?'#fff':'#ddd', true);
      drawRect(ctx, -armW/2-2, -3, armW+4, 2, flashWhite?'#fff':shadeColor('#ddd',-20));
    } else if (P.heldProp === 'tape') {
      drawRect(ctx, -5, -9, 10, 3, flashWhite?'#fff':'#eee', true);
    } else if (P.heldProp === 'satchel') {
      drawRect(ctx, -4, 2, 11, 9, flashWhite?'#fff':'#3a2a1a', true);
      drawRect(ctx, -2, 0, 6, 3, flashWhite?'#fff':'#222', true);
      drawRect(ctx, -3, 4, 9, 2, flashWhite?'#fff':shadeColor('#3a2a1a',20));
    }
  } : null;
  const frontHandProp = gunProp || smallPropFn;

  // back leg (knee guard accent)
  drawLimb(ctx, -4*ratio, -4+bodyY, 20, 18, legW, pose.legR.a1, pose.legR.a2, c(P.pants), c(P.shoe), c(shoeCap), null, accentJoint);
  // back arm
  drawLimb(ctx, -6*ratio, -20+bodyY, 16, 15, armW, pose.armR.a1, pose.armR.a2, sleeveCol, c(P.skin), c(handCap));

  // torso
  ctx.save();
  ctx.translate(0, -22+bodyY);
  ctx.rotate(torsoLean);
  const tw = bp.torsoW, tx = -tw/2;
  // neck
  drawRect(ctx, -4, -4, 8, 6, c(P.skin));
  drawRect(ctx, -4, -4, 8, 2, flashWhite?'#fff':shadeColor(P.skin,-15)); // neck shade under jaw
  // torso base + outline
  drawRect(ctx, tx, 0, tw, 28, c(P.shirt), true);
  // shaded side (light reads as coming from the left)
  drawRect(ctx, tx+tw-6, 0, 6, 28, flashWhite?'#fff':shadeColor(P.shirt,-30));
  drawRect(ctx, tx, 0, 3, 28, flashWhite?'#fff':shadeColor(P.shirt,22));
  // accent piping down the lit edge, tying the character's accent color
  // into the body rather than just the chest stripe
  if (!flashWhite) drawRect(ctx, tx+2, 0, 1, 28, P.accent);
  // center seam/zipper line for a less flat, more "garment" look
  if (!flashWhite) drawRect(ctx, -1, 9, 1, 13, shadeColor(P.shirt,-30));
  // chest accent stripe
  drawRect(ctx, tx, 4, tw, 5, c(P.accent));
  // collar notch
  drawRect(ctx, -5, 0, 10, 3, flashWhite?'#fff':shadeColor(P.shirt,-20));
  // belt + buckle
  drawRect(ctx, tx, 23, tw, 5, flashWhite?'#fff':shadeColor(P.pants,-10));
  drawRect(ctx, -3, 23, 6, 5, flashWhite?'#fff':shadeColor(P.accent,-10), true);
  // shoulder pads (bulky/grappler-style accessory)
  if (P.accessory === 'shoulderpads') {
    const padCol = flashWhite?'#fff':shadeColor(P.accent,-10);
    drawRect(ctx, tx-4, -3, 9, 8, padCol, true);
    drawRect(ctx, tx+tw-5, -3, 9, 8, padCol, true);
  }
  drawHead(ctx, P, bp, flashWhite);
  ctx.restore();

  // front leg
  drawLimb(ctx, 4*ratio, -4+bodyY, 20, 18, legW, pose.legL.a1, pose.legL.a2, c(P.pants), c(P.shoe), c(shoeCap), null, accentJoint);
  // front arm (carries the held-weapon prop, if any, in its hand)
  drawLimb(ctx, 6*ratio, -20+bodyY, 16, 15, armW, pose.armL.a1, pose.armL.a2, sleeveCol, c(P.skin), c(handCap), frontHandProp);

  // Riot shield — drawn as a stable overlay in front of the torso rather
  // than attached to the swinging arm, so it doesn't rotate wildly mid-punch.
  if (P.heldProp === 'shield') {
    const shieldCol = flashWhite?'#fff':shadeColor(P.accent,-25);
    drawRect(ctx, 9, -48+bodyY, 15, 36, shieldCol, true);
    drawRect(ctx, 11, -46+bodyY, 11, 7, flashWhite?'#fff':shadeColor(P.accent,15));
    drawRect(ctx, 14, -30+bodyY, 5, 5, flashWhite?'#fff':'#222', true);
  }

  ctx.restore();
}


// Standard pose library keyed by animation name, function of t (0..1 loop or progress)
function getPose(anim, t, facing) {
  const idle = { armL:{a1:0.15+Math.sin(t*Math.PI*2)*0.05,a2:0.2}, armR:{a1:-0.15-Math.sin(t*Math.PI*2)*0.05,a2:-0.2},
    legL:{a1:0.05,a2:0}, legR:{a1:-0.05,a2:0}, torsoLean:Math.sin(t*Math.PI*2)*0.02, crouch:Math.sin(t*Math.PI*2)*1 };
  switch(anim) {
    case 'idle': return idle;
    case 'walk': {
      const s = Math.sin(t*Math.PI*2);
      return { armL:{a1:-s*0.5,a2:0.1}, armR:{a1:s*0.5,a2:-0.1},
        legL:{a1:s*0.6,a2:Math.max(0,-s)*0.7}, legR:{a1:-s*0.6,a2:Math.max(0,s)*0.7},
        torsoLean:s*0.03, crouch:Math.abs(s)*1.5 };
    }
    case 'punch1': return { armL:{a1:-1.9*t+0.2, a2:0.1}, armR:{a1:-0.3,a2:-0.2}, legL:{a1:0.15,a2:0}, legR:{a1:-0.1,a2:0}, torsoLean:0.15*t, crouch:0 };
    case 'punch2': return { armR:{a1:-1.9*t+0.2, a2:0.1}, armL:{a1:-0.3,a2:-0.2}, legR:{a1:0.15,a2:0}, legL:{a1:-0.1,a2:0}, torsoLean:0.15*t, crouch:0 };
    case 'kick': return { legL:{a1:-1.7*t+0.3,a2:0.3*t}, legR:{a1:0.3,a2:0}, armL:{a1:0.4,a2:0.2}, armR:{a1:-0.6,a2:-0.3}, torsoLean:-0.1, crouch:0 };
    case 'finisher': return { armL:{a1:-2.3*t+0.4,a2:0.15}, armR:{a1:-2.3*t+0.4,a2:0.15}, legL:{a1:0.3,a2:0}, legR:{a1:-0.3,a2:0.1}, torsoLean:0.3*t, crouch:-2 };
    case 'heavy': return { armR:{a1:-2.6*Math.min(1,t*1.3)+1.3,a2:0.2}, armL:{a1:0.5,a2:0.2}, legL:{a1:0.35,a2:0.1}, legR:{a1:-0.2,a2:0}, torsoLean:0.35*t, crouch:1 };
    case 'jump': return { armL:{a1:-0.9,a2:0.1}, armR:{a1:0.9,a2:-0.1}, legL:{a1:-0.6,a2:0.9}, legR:{a1:0.6,a2:0.9}, torsoLean:0, crouch:-4 };
    case 'air': return { armL:{a1:-1.8,a2:0.2}, armR:{a1:0.5,a2:-0.2}, legL:{a1:-0.9,a2:1.1}, legR:{a1:0.9,a2:0.6}, torsoLean:0.2, crouch:-4 };
    case 'dodge': return { armL:{a1:0.3,a2:0.1}, armR:{a1:-0.3,a2:-0.1}, legL:{a1:0.7,a2:0.2}, legR:{a1:-0.7,a2:0.2}, torsoLean:0.5, crouch:3 };
    case 'special': return { armL:{a1:-3.0*t,a2:0.3}, armR:{a1:3.0*t,a2:-0.3}, legL:{a1:0.2,a2:0}, legR:{a1:-0.2,a2:0}, torsoLean:0, crouch:-1 };
    case 'hurt': return { armL:{a1:0.8,a2:0.4}, armR:{a1:-0.8,a2:-0.4}, legL:{a1:-0.3,a2:0.1}, legR:{a1:0.5,a2:0.1}, torsoLean:-0.35, crouch:0 };
    case 'knockdown': return { armL:{a1:1.5,a2:0.2}, armR:{a1:-1.5,a2:0.2}, legL:{a1:1.4,a2:0.2}, legR:{a1:-1.4,a2:0.2}, torsoLean:1.4, crouch:8 };
    case 'block': return { armL:{a1:-0.6,a2:-0.4}, armR:{a1:0.6,a2:0.4}, legL:{a1:0.2,a2:0}, legR:{a1:-0.2,a2:0}, torsoLean:0, crouch:0 };
    default: return idle;
  }
}

// ---------------------------------------------------------------------
// DATA: characters, enemy types, weapons, upgrades, stage themes
// EXT: additional characters can be appended to CHARACTERS without
// touching Player/combat code — everything reads from this config.
// ---------------------------------------------------------------------
const CHARACTERS = {
  ranger: {
    id:'ranger', name:'JAX "RANGER" COLE',
    maxHealth: 100, speed: 165, damage: 10, attackSpeed: 1.0,
    special: 'Shockwave Slam — hits all nearby foes',
    palette: { skin:'#e0a878', hair:'#2b2b2b', shirt:'#2f8fff', pants:'#20263a', shoe:'#111', accent:'#4ff0ff', build:'normal', hairStyle:'spiky', accessory:'headband' },
    desc: ['ALL-ROUND BRAWLER','Balanced speed, power & health','Great for learning the ropes'],
  },
  raven: {
    id:'raven', name:'RAVEN "QUICKSILVER" NYX',
    maxHealth: 75, speed: 215, damage: 8, attackSpeed: 1.25,
    special: 'Blink Strike — a burst of rapid hits',
    palette: { skin:'#e8b894', hair:'#1a0a1a', shirt:'#6a1a6a', pants:'#1a0a22', shoe:'#111', accent:'#ff2f92', build:'lean', hairStyle:'ponytail', accessory:'none' },
    desc: ['GLASS-CANNON SPEEDSTER','Very fast, hits quick, low HP','For players who dodge more than block'],
  },
  titan: {
    id:'titan', name:'TITAN "IRON FIST" OKAFOR',
    maxHealth: 140, speed: 120, damage: 15, attackSpeed: 0.8,
    special: 'Seismic Slam — wide radius, huge knockback',
    palette: { skin:'#c68a5a', hair:'#2a1a0a', shirt:'#8a4a1a', pants:'#2a1a0a', shoe:'#111', accent:'#ffce2f', build:'huge', hairStyle:'mohawk', accessory:'shoulderpads' },
    desc: ['SLOW HEAVY-HITTER','Huge HP & damage, slower speed','For players who like to tank hits and swing hard'],
  },
  // Shop-unlockable characters (Unlocks tab) — locked:true hides them in
  // character select until meta.shop['char_<id>'] is owned.
  astronaut: {
    id:'astronaut', name:'CADET "ZERO-G" VASQUEZ', locked:true, shopId:'char_astronaut',
    maxHealth: 80, speed: 200, damage: 9, attackSpeed: 1.2,
    special: 'Thruster Burst — a rapid dash-and-strike combo',
    palette: { skin:'#e0a878', hair:'#eee', shirt:'#dde5ea', pants:'#8a97a0', shoe:'#333', accent:'#4ff0ff', build:'lean', hairStyle:'short', accessory:'headband' },
    desc: ['DODGE & COMBO SPECIALIST','Fast, evasive, combo-focused','Unlocked in the shop'],
  },
  ninja: {
    id:'ninja', name:'SHADOW "SILENT BLADE" KAI', locked:true, shopId:'char_ninja',
    maxHealth: 90, speed: 180, damage: 10, attackSpeed: 1.15,
    special: 'Aerial Barrage — a flurry of airborne strikes',
    palette: { skin:'#c68a5a', hair:'#000', shirt:'#111', pants:'#0a0a0a', shoe:'#000', accent:'#ff3355', build:'lean', hairStyle:'ponytail', accessory:'bandana' },
    desc: ['LONG COMBOS, STRONG AERIALS','Extended combo chains','Unlocked in the shop'],
  },
  wrestler: {
    id:'wrestler', name:'"IRON GRIP" GRETA', locked:true, shopId:'char_wrestler',
    maxHealth: 150, speed: 115, damage: 13, attackSpeed: 0.85,
    special: 'Suplex Slam — grabs and slams everything nearby',
    palette: { skin:'#b98060', hair:'#2a1a0a', shirt:'#aa1a2a', pants:'#221', shoe:'#000', accent:'#ffce2f', build:'huge', hairStyle:'bald', accessory:'shoulderpads' },
    desc: ['GRAPPLER & TANK','Strong grabs, throws, huge survivability','Unlocked in the shop'],
  },
  // EXT: additional unlockable characters go here, e.g. a fast low-health
  // character or a slow heavy-hitter, reusing the same Player class.
};

const ENEMY_TYPES = {
  thug: {
    id:'thug', name:'Thug', health:36, speed:78, damage:8, knockbackRes:1,
    attackRange:34, aggroRange:420, attackCooldown:1.1, telegraph:0.28, windup:'punch1',
    palette:{skin:'#c98f5c', hair:'#111', shirt:'#7a2a2a', pants:'#2b2b2b', shoe:'#000', accent:'#a33', build:'normal', hairStyle:'short', accessory:'none'},
    scoreValue: 100, xp:1,
  },
  runner: {
    id:'runner', name:'Runner', health:20, speed:150, damage:6, knockbackRes:0.7,
    attackRange:28, aggroRange:480, attackCooldown:0.7, telegraph:0.16, windup:'punch1',
    palette:{skin:'#d7a06a', hair:'#440', shirt:'#2a7a3a', pants:'#173', shoe:'#000', accent:'#5c3', build:'lean', hairStyle:'spiky', accessory:'none'},
    scoreValue: 80, xp:1, scaleMod:0.92,
  },
  bruiser: {
    id:'bruiser', name:'Bruiser', health:110, speed:52, damage:16, knockbackRes:2.6,
    attackRange:40, aggroRange:420, attackCooldown:1.6, telegraph:0.5, windup:'heavy',
    palette:{skin:'#b98060', hair:'#000', shirt:'#4a3a6a', pants:'#221933', shoe:'#000', accent:'#a3f', build:'bulky', hairStyle:'bald', accessory:'shoulderpads'},
    scoreValue: 220, xp:2, scaleMod:1.35,
  },
  kickboxer: {
    id:'kickboxer', name:'Kickboxer', health:44, speed:100, damage:11, knockbackRes:1.1,
    attackRange:52, aggroRange:460, attackCooldown:1.2, telegraph:0.3, windup:'kick',
    palette:{skin:'#caa070', hair:'#222', shirt:'#c9c9c9', pants:'#111', shoe:'#900', accent:'#e33', build:'lean', hairStyle:'short', accessory:'headband'},
    scoreValue: 150, xp:1.5, keepDistance:36,
  },
  grappler: {
    id:'grappler', name:'Grappler', health:70, speed:85, damage:14, knockbackRes:2,
    attackRange:26, aggroRange:400, attackCooldown:1.4, telegraph:0.4, windup:'heavy',
    palette:{skin:'#8a6a4a', hair:'#000', shirt:'#333', pants:'#222', shoe:'#000', accent:'#960', build:'huge', hairStyle:'bald', accessory:'vest'},
    scoreValue: 180, xp:1.6, rush:true,
  },
  ranged: {
    id:'ranged', name:'Gunner', health:26, speed:95, damage:7, knockbackRes:0.8,
    attackRange:260, aggroRange:520, attackCooldown:1.8, telegraph:0.35, windup:'punch2',
    palette:{skin:'#d8b080', hair:'#663', shirt:'#556b2f', pants:'#333', shoe:'#000', accent:'#8b0', build:'lean', hairStyle:'short', accessory:'cap', holdsWeapon:true},
    scoreValue: 160, xp:1.5, ranged:true, retreatRange:150,
  },
  shielded: {
    id:'shielded', name:'Riot Guard', health:60, speed:60, damage:10, knockbackRes:2.4,
    attackRange:36, aggroRange:400, attackCooldown:1.5, telegraph:0.4, windup:'heavy',
    palette:{skin:'#c98f5c', hair:'#111', shirt:'#2a3a55', pants:'#151f2e', shoe:'#000', accent:'#4ff0ff', build:'bulky', hairStyle:'bald', accessory:'cap', heldProp:'shield'},
    scoreValue: 200, xp:1.8, shielded:true, // basic attacks are mostly blocked — heavy attacks break the guard
  },
  acrobat: {
    id:'acrobat', name:'Acrobat', health:32, speed:130, damage:9, knockbackRes:0.9,
    attackRange:56, aggroRange:500, attackCooldown:0.85, telegraph:0.2, windup:'kick',
    palette:{skin:'#d7a06a', hair:'#204', shirt:'#0a8a7a', pants:'#063', shoe:'#000', accent:'#0fc', build:'lean', hairStyle:'ponytail', accessory:'none', heldProp:'tape'},
    scoreValue: 170, xp:1.5, acrobatic:true, // hops around unpredictably between attacks
  },
  bomber: {
    id:'bomber', name:'Bomber', health:28, speed:88, damage:9, knockbackRes:0.8,
    attackRange:280, aggroRange:520, attackCooldown:2.4, telegraph:0.5, windup:'punch2',
    palette:{skin:'#d8b080', hair:'#432', shirt:'#8a5a1a', pants:'#333', shoe:'#000', accent:'#ff8f2f', build:'normal', hairStyle:'short', accessory:'cap', heldProp:'satchel'},
    scoreValue: 190, xp:1.7, ranged:true, retreatRange:170, bomber:true, // lobs an explosive instead of a simple shot
  },
  enforcer: {
    id:'enforcer', name:'Enforcer', health:150, speed:65, damage:13, knockbackRes:3.2,
    attackRange:42, aggroRange:440, attackCooldown:1.9, telegraph:0.45, windup:'heavy',
    palette:{skin:'#8a5030', hair:'#000', shirt:'#3a2a2a', pants:'#1a1414', shoe:'#000', accent:'#ff3355', build:'huge', hairStyle:'bald', accessory:'shoulderpads', heldProp:'wraps'},
    scoreValue: 320, xp:2.4, scaleMod:1.5, multiHit:2, // late-game elite: a two-hit flurry instead of one swing
  },
  turret: {
    // Not part of normal encounter pools — spawned only by The Mechanic's
    // Turret Deploy attack. Stationary, self-destructs after a while.
    id:'turret', name:'Sentry Turret', health:24, speed:0, damage:6, knockbackRes:99,
    attackRange:520, aggroRange:600, attackCooldown:1.1, telegraph:0.25, windup:'punch2',
    palette:{skin:'#999', hair:'#333', shirt:'#666', pants:'#333', shoe:'#111', accent:'#ff3355', build:'normal', hairStyle:'bald', accessory:'none'},
    scoreValue: 60, xp:0.5, ranged:true, retreatRange:0,
  },
  // EXT: more enemy archetypes can be added here with new flags,
  // then referenced by StageManager encounter tables.
};

const BOSS_TYPES = {
  brute_king: {
    id:'brute_king', name:'THE BRUTE KING', health:520, speed:60, damage:18, knockbackRes:6,
    palette:{skin:'#8a5030', hair:'#111', shirt:'#5a1a1a', pants:'#221', shoe:'#000', accent:'#f92', build:'huge', hairStyle:'mohawk', accessory:'shoulderpads'},
    scoreValue: 2000,
    attacks: ['charge','slam','combo','jumpattack','ground_pound'],
  },
  iron_matron: {
    id:'iron_matron', name:'IRON MATRON', health:600, speed:70, damage:16, knockbackRes:5,
    palette:{skin:'#c0a0c0', hair:'#222', shirt:'#333366', pants:'#111', shoe:'#000', accent:'#a3f', build:'bulky', hairStyle:'ponytail', accessory:'shoulderpads'},
    scoreValue: 2200,
    attacks: ['projectile','combo','slam','charge','missile_barrage'],
  },
  neon_reaper: {
    id:'neon_reaper', name:'THE NEON REAPER', health:560, speed:110, damage:15, knockbackRes:3.5,
    palette:{skin:'#c0a0c0', hair:'#111', shirt:'#1a0a2a', pants:'#0a0512', shoe:'#000', accent:'#ff2fdc', build:'lean', hairStyle:'mohawk', accessory:'none'},
    scoreValue: 2400,
    attacks: ['teleport_strike','volley','combo','charge'],
  },
  the_mechanic: {
    id:'the_mechanic', name:'THE MECHANIC', health:680, speed:55, damage:17, knockbackRes:6.5,
    palette:{skin:'#8a8a8a', hair:'#222', shirt:'#4a3a1a', pants:'#221', shoe:'#000', accent:'#ffce2f', build:'huge', hairStyle:'bald', accessory:'cap'},
    scoreValue: 2600,
    attacks: ['turret_deploy','wrecking_swing','slam','combo'],
  },
  // EXT: additional bosses append here with their own attack lists.
};
const MINIBOSS_TYPES = {
  twin_thug: { id:'twin_thug', name:'TWIN THUGS', health:150, speed:80, damage:12, knockbackRes:2.2,
    palette:{skin:'#b98a5a', hair:'#000', shirt:'#333', pants:'#111', shoe:'#000', accent:'#e93', build:'bulky', hairStyle:'short', accessory:'bandana'},
    scoreValue: 500, attacks:['combo','slam'] },
};

const WEAPON_TYPES = {
  // These 4 plus the 6 below are gated by the Arsenal shop tab's
  // sequential unlock chain (see SHOP_TABS) — none drop until unlocked.
  bat: { id:'bat', name:'Baseball Bat', damage:22, knockback:2.2, speedMult:0.65, range:44, durability:6, color:'#c8a15a', throwable:false, shopLocked:true },
  pipe: { id:'pipe', name:'Pipe', damage:15, knockback:1.3, speedMult:1.05, range:40, durability:8, color:'#9aa0a6', throwable:false, shopLocked:true },
  bottle: { id:'bottle', name:'Bottle', damage:14, knockback:1.0, speedMult:1.2, range:30, durability:1, color:'#5ad', throwable:true, shopLocked:true },
  crowbar: { id:'crowbar', name:'Crowbar', damage:19, knockback:1.7, speedMult:0.95, range:42, durability:7, color:'#7a1a1a', throwable:false, shopLocked:true },
  sledgehammer: { id:'sledgehammer', name:'Sledgehammer', damage:34, knockback:2.8, speedMult:0.55, range:48, durability:4, color:'#555', throwable:false, shopLocked:true },
  katana: { id:'katana', name:'Katana', damage:26, knockback:1.2, speedMult:1.3, range:46, durability:5, color:'#ddd', throwable:false, shopLocked:true },
  chain: { id:'chain', name:'Chain', damage:17, knockback:1.9, speedMult:1.0, range:52, durability:6, color:'#888', throwable:false, shopLocked:true },
  sign: { id:'sign', name:'Street Sign', damage:24, knockback:1.9, speedMult:0.75, range:48, durability:4, color:'#4a8a4a', throwable:false, shopLocked:true },
  fire_extinguisher: { id:'fire_extinguisher', name:'Fire Extinguisher', damage:16, knockback:1.4, speedMult:1.0, range:38, durability:5, color:'#b71c1c', throwable:true, shopLocked:true },
  trash_can: { id:'trash_can', name:'Trash Can', damage:20, knockback:2.0, speedMult:0.8, range:40, durability:5, color:'#556677', throwable:false, shopLocked:true },
  // Plank plus the "Anything's a Weapon" set are unlocked in-run instead
  // (via the Weapon upgrade tree), independent of the shop's Arsenal tab.
  plank: { id:'plank', name:'Wooden Plank', damage:30, knockback:1.6, speedMult:0.8, range:42, durability:3, color:'#8a5a2a', throwable:false },
  chair: { id:'chair', name:'Chair', damage:18, knockback:1.8, speedMult:0.85, range:40, durability:4, color:'#7a5a3a', throwable:false, extra:true },
  cone: { id:'cone', name:'Traffic Cone', damage:10, knockback:1.0, speedMult:1.3, range:32, durability:3, color:'#ff8f2f', throwable:true, extra:true },
  brick: { id:'brick', name:'Brick', damage:16, knockback:1.1, speedMult:1.1, range:28, durability:1, color:'#9a4a3a', throwable:true, extra:true },
  tyre: { id:'tyre', name:'Tyre', damage:20, knockback:2.6, speedMult:0.6, range:46, durability:5, color:'#222', throwable:false, extra:true },
  crate: { id:'crate', name:'Small Crate', damage:13, knockback:1.2, speedMult:1.0, range:34, durability:2, color:'#a87d4a', throwable:true, extra:true },
  // EXT: more weapons can be added; UpgradeManager/DropTables reference by id.
};

// ---------------------------------------------------------------------
// Weapon Master (Weapon tree level 4) gives each weapon a signature
// heavy-attack flourish. Purely cosmetic/particle-flavour hook — the
// damage bonus itself is applied uniformly in Player.afterHeavyHit.
const WEAPON_FINISHER_FLAVOR = {
  bat:'Charged swing', pipe:'Wide sweep', plank:'Splintering smash', bottle:'Impact burst',
  chair:'Frame-breaker', cone:'Whirl toss', brick:'Heavy lob', tyre:'Rolling slam',
  sign:'Signpost sweep', crate:'Crate crash', crowbar:'Wrenching pry', sledgehammer:'Earth-shaker',
  katana:'Iaido slash', chain:'Whirling lash', fire_extinguisher:'Blinding spray', trash_can:'Lid smash',
};

// ---------------------------------------------------------------------
// UPGRADE SYSTEM — 8 trees (~5 levels each), an elemental tree that
// branches into Fire/Lightning/Ice, standalone Legendary upgrades, and
// cross-tree Synergies. Offered 3-at-a-time after each stage; the
// player picks one. All data-driven so new trees/levels/synergies can
// be added without touching the roll/apply/UI code below.
// ---------------------------------------------------------------------
const UPGRADE_TREES = {
  brawler: { name:'Brawler', icon:'👊', color:'#ff6a6a', levels: [
    { level:1, id:'brawler_1', name:'Heavy Hands', rarity:'common',
      desc:'Basic attacks deal 15% more damage.',
      apply:(p)=>{ p.mods.basicDamageMult *= 1.15; } },
    { level:2, id:'brawler_2', name:'Combo Master', rarity:'common',
      desc:'Combo extends: Punch → Punch → Kick → Kick → Finisher.',
      apply:(p)=>{ p.abilities.comboExtended = true; } },
    { level:3, id:'brawler_3', name:'Momentum', rarity:'rare',
      desc:'Each hit within a combo deals 8% more than the last.',
      apply:(p)=>{ p.abilities.momentum = true; } },
    { level:4, id:'brawler_4', name:'Double Impact', rarity:'epic',
      desc:'Combo finishers strike a second time.',
      apply:(p)=>{ p.abilities.doubleImpact = true; } },
    { level:5, id:'brawler_5', name:'One-Man Army', rarity:'epic',
      desc:'After a full combo, the next combo starts on its second hit.',
      apply:(p)=>{ p.abilities.oneManArmy = true; } },
  ]},
  power: { name:'Power', icon:'💥', color:'#ff9a2f', levels: [
    { level:1, id:'power_1', name:'Heavy Hitter', rarity:'common',
      desc:'Heavy attacks deal 30% more damage.',
      apply:(p)=>{ p.mods.heavyDamageMult *= 1.3; } },
    { level:2, id:'power_2', name:'Uppercut', rarity:'common',
      desc:'Heavy attacks launch enemies upward.',
      apply:(p)=>{ p.abilities.uppercut = true; } },
    { level:3, id:'power_3', name:'Ground Bounce', rarity:'rare',
      desc:'Launched enemies bounce once on landing, taking extra damage.',
      apply:(p)=>{ p.abilities.groundBounce = true; } },
    { level:4, id:'power_4', name:'Shockwave', rarity:'epic',
      desc:'Heavy attacks create a small damaging shockwave.',
      apply:(p)=>{ p.abilities.shockwave = true; } },
    { level:5, id:'power_5', name:'Seismic Slam', rarity:'epic',
      desc:'Heavy attacks create a large shockwave that knocks enemies down.',
      apply:(p)=>{ p.abilities.seismicSlam = true; } },
  ]},
  speed: { name:'Speed', icon:'💨', color:'#4ff0ff', levels: [
    { level:1, id:'speed_1', name:'Quick Feet', rarity:'common',
      desc:'+15% movement speed.',
      apply:(p)=>{ p.mods.speedMult *= 1.15; } },
    { level:2, id:'speed_2', name:'Rapid Dodge', rarity:'common',
      desc:'-25% dodge cooldown.',
      apply:(p)=>{ p.mods.dodgeCdMult *= 0.75; } },
    { level:3, id:'speed_3', name:'Dash Strike', rarity:'rare',
      desc:'Attacking during a dodge unleashes a rushing strike.',
      apply:(p)=>{ p.abilities.dashStrike = true; } },
    { level:4, id:'speed_4', name:'Afterimage', rarity:'epic',
      desc:'Dodging leaves a damaging afterimage behind you.',
      apply:(p)=>{ p.abilities.afterimage = true; } },
    { level:5, id:'speed_5', name:'Untouchable', rarity:'epic',
      desc:'Perfect dodges reset your dodge cooldown and boost attack speed.',
      apply:(p)=>{ p.abilities.untouchable = true; } },
  ]},
  aerial: { name:'Aerial', icon:'🦶', color:'#39ff6a', levels: [
    { level:1, id:'aerial_1', name:'Flying Kick', rarity:'common',
      desc:'Aerial attacks deal 25% more damage.',
      apply:(p)=>{ p.mods.airDamageMult *= 1.25; } },
    { level:2, id:'aerial_2', name:'High Flyer', rarity:'common',
      desc:'Higher jumps with air control.',
      apply:(p)=>{ p.abilities.highFlyer = true; } },
    { level:3, id:'aerial_3', name:'Dive Kick', rarity:'rare',
      desc:'Hold down + attack in midair for a diving kick.',
      apply:(p)=>{ p.abilities.diveKick = true; } },
    { level:4, id:'aerial_4', name:'Air Combo', rarity:'epic',
      desc:'Launched enemies hang in the air longer, open to more hits.',
      apply:(p)=>{ p.abilities.airCombo = true; } },
    { level:5, id:'aerial_5', name:'Meteor Strike', rarity:'epic',
      desc:'Heavy attack in midair slams into the ground with a shockwave.',
      apply:(p)=>{ p.abilities.meteorStrike = true; } },
  ]},
  tank: { name:'Tank', icon:'🛡️', color:'#c9c9c9', levels: [
    { level:1, id:'tank_1', name:'Iron Skin', rarity:'common',
      desc:'+20% maximum health.',
      apply:(p)=>{ p.mods.healthMult *= 1.2; p.maxHealth = Math.round(p.baseMaxHealth*p.mods.healthMult); p.health = Math.min(p.maxHealth, p.health + p.maxHealth*0.2); } },
    { level:2, id:'tank_2', name:'Brace', rarity:'common',
      desc:'Take less knockback from enemy attacks.',
      apply:(p)=>{ p.abilities.brace = true; } },
    { level:3, id:'tank_3', name:'Second Wind', rarity:'rare',
      desc:'Defeating an enemy restores a little health.',
      apply:(p)=>{ p.abilities.secondWind = true; } },
    { level:4, id:'tank_4', name:'Payback', rarity:'epic',
      desc:'Taking damage empowers your next successful attack.',
      apply:(p)=>{ p.abilities.payback = true; } },
    { level:5, id:'tank_5', name:'Juggernaut', rarity:'epic',
      desc:'Heavy attacks cannot be interrupted and reduce incoming damage.',
      apply:(p)=>{ p.abilities.juggernaut = true; } },
  ]},
  special: { name:'Special', icon:'✨', color:'#ff2f92', levels: [
    { level:1, id:'special_1', name:'Specialist', rarity:'common',
      desc:'-20% special attack cooldown.',
      apply:(p)=>{ p.mods.specialCdMult *= 0.8; } },
    { level:2, id:'special_2', name:'Wide Impact', rarity:'common',
      desc:'+40% special attack radius.',
      apply:(p)=>{ p.abilities.specialRadiusMult = (p.abilities.specialRadiusMult||1) * 1.4; } },
    { level:3, id:'special_3', name:'Energy Rush', rarity:'rare',
      desc:'Defeating enemies reduces your special cooldown.',
      apply:(p)=>{ p.abilities.energyRush = true; } },
    { level:4, id:'special_4', name:'Double Burst', rarity:'epic',
      desc:'A delayed second shockwave follows your special attack.',
      apply:(p)=>{ p.abilities.doubleBurst = true; } },
    { level:5, id:'special_5', name:'Limit Break', rarity:'epic',
      desc:'High combo count empowers your special into a knockdown blast.',
      apply:(p)=>{ p.abilities.limitBreak = true; } },
  ]},
  weapon: { name:'Weapons', icon:'🏏', color:'#ffce2f', levels: [
    { level:1, id:'weapon_1', name:'Street Fighter', rarity:'common',
      desc:'+20% damage with picked-up weapons.',
      apply:(p)=>{ p.abilities.streetFighter = true; } },
    { level:2, id:'weapon_2', name:'Careful Hands', rarity:'common',
      desc:'+50% weapon durability.',
      apply:(p)=>{ p.abilities.carefulHands = true; } },
    { level:3, id:'weapon_3', name:'Fast Hands', rarity:'rare',
      desc:'Faster weapon pickup and swing recovery.',
      apply:(p)=>{ p.abilities.fastHands = true; } },
    { level:4, id:'weapon_4', name:'Weapon Master', rarity:'epic',
      desc:'Each weapon gains a unique heavy-attack finisher.',
      apply:(p)=>{ p.abilities.weaponMaster = true; } },
    { level:5, id:'weapon_5', name:"Anything's a Weapon", rarity:'epic',
      desc:'Chairs, bins, cones, bricks, tyres & signs can now be picked up.',
      apply:(p)=>{ p.abilities.anythingWeapon = true; } },
  ]},
};

// Elemental tree: level 1 is a single root unlock; picking it opens the
// pool to the three branch starters (fire_2/lightning_2/ice_2). The
// first one the player actually picks locks in `player.element` — after
// that, only further levels of that one branch are offered.
const ELEMENTAL_ROOT = {
  level:1, id:'elemental_1', name:'Elemental Fist', rarity:'rare', tree:'elemental',
  desc:'Unlock elemental attacks — choose Fire, Lightning or Ice next.',
  apply:(p)=>{},
};
const ELEMENT_BRANCHES = {
  fire: { name:'Fire', icon:'🔥', color:'#ff5a2f', levels: [
    { level:2, id:'fire_2', name:'Burning Fists', rarity:'common',
      desc:'Attacks have a chance to set enemies on fire (damage over time).',
      apply:(p)=>{ p.abilities.burningFists = true; } },
    { level:3, id:'fire_3', name:'Spreading Flames', rarity:'rare',
      desc:'Burning enemies can spread fire to nearby enemies.',
      apply:(p)=>{ p.abilities.spreadingFlames = true; } },
    { level:4, id:'fire_4', name:'Inferno', rarity:'epic',
      desc:'Burn deals more damage and lasts longer.',
      apply:(p)=>{ p.abilities.inferno = true; } },
    { level:5, id:'fire_5', name:'Explosion', rarity:'epic',
      desc:'Enemies defeated while burning explode, damaging nearby foes.',
      apply:(p)=>{ p.abilities.fireExplosion = true; } },
  ]},
  lightning: { name:'Lightning', icon:'⚡', color:'#4ff0ff', levels: [
    { level:2, id:'lightning_2', name:'Static Fists', rarity:'common',
      desc:'Attacks occasionally shock enemies.',
      apply:(p)=>{ p.abilities.staticFists = true; } },
    { level:3, id:'lightning_3', name:'Chain Lightning', rarity:'rare',
      desc:'Shocks jump to one nearby enemy.',
      apply:(p)=>{ p.abilities.chainLightning = true; } },
    { level:4, id:'lightning_4', name:'Supercharge', rarity:'epic',
      desc:'Chain Lightning jumps to additional enemies.',
      apply:(p)=>{ p.abilities.supercharge = true; } },
    { level:5, id:'lightning_5', name:'Thunderstorm', rarity:'epic',
      desc:'Finishers and specials can summon a lightning strike.',
      apply:(p)=>{ p.abilities.thunderstorm = true; } },
  ]},
  ice: { name:'Ice', icon:'❄️', color:'#8fd6ff', levels: [
    { level:2, id:'ice_2', name:'Cold Fists', rarity:'common',
      desc:'Attacks slow enemy movement and attack speed.',
      apply:(p)=>{ p.abilities.coldFists = true; } },
    { level:3, id:'ice_3', name:'Deep Freeze', rarity:'rare',
      desc:'Repeated hits on a slowed enemy can freeze it briefly.',
      apply:(p)=>{ p.abilities.deepFreeze = true; } },
    { level:4, id:'ice_4', name:'Frozen Solid', rarity:'epic',
      desc:'Frozen enemies stay frozen longer.',
      apply:(p)=>{ p.abilities.frozenSolid = true; } },
    { level:5, id:'ice_5', name:'Shatter', rarity:'epic',
      desc:'Heavy attacks on frozen enemies deal massive bonus damage.',
      apply:(p)=>{ p.abilities.shatter = true; } },
  ]},
};

const LEGENDARY_UPGRADES = [
  { id:'legendary_one_punch', name:'One Punch', icon:'☄️',
    desc:'Heavy attacks deal 200% more damage but have a much longer wind-up.',
    apply:(p)=>{ p.abilities.onePunch = true; } },
  { id:'legendary_berserker', name:'Berserker', icon:'😡',
    desc:'Below 25% health: double attack speed and faster movement.',
    apply:(p)=>{ p.abilities.berserker = true; } },
  { id:'legendary_shadow_fighter', name:'Shadow Fighter', icon:'👥',
    desc:'A shadow copy repeats your attacks 0.5s later at reduced damage.',
    apply:(p)=>{ p.abilities.shadowFighter = true; } },
  { id:'legendary_explosive_finish', name:'Explosive Finish', icon:'💣',
    desc:'Full combo finishers create a small explosion.',
    apply:(p)=>{ p.abilities.explosiveFinish = true; } },
  { id:'legendary_cant_touch_this', name:"Can't Touch This", icon:'🌀',
    desc:'Perfect dodges briefly slow nearby enemies.',
    apply:(p)=>{ p.abilities.cantTouchThis = true; } },
  { id:'legendary_blood_rush', name:'Blood Rush', icon:'🩸',
    desc:'Every 10 defeats restores some health.',
    apply:(p)=>{ p.abilities.bloodRush = true; } },
  { id:'legendary_combo_addict', name:'Combo Addict', icon:'🎯',
    desc:'Every 10 hits in a combo increases attack speed. Resets when the combo ends.',
    apply:(p)=>{ p.abilities.comboAddict = true; } },
  { id:'legendary_chaos', name:'Chaos', icon:'🎲',
    desc:'Every hit has a small chance to trigger a random combat effect.',
    apply:(p)=>{ p.abilities.chaos = true; } },
];

// Synergies unlock automatically the moment all required upgrade ids are
// owned (checked after every pick). requiresElement means "any elemental
// branch owned" rather than a specific upgrade id.
const SYNERGIES = [
  { id:'syn_juggler', name:'Juggler', requires:['power_2','aerial_4'],
    desc:'Launched enemies hang even longer and take extra aerial hits.',
    apply:(p)=>{ p.abilities.synJuggler = true; } },
  { id:'syn_haymaker', name:'Haymaker', requires:['speed_3','power_1'],
    desc:'Dash Strike becomes a powerful charging punch.',
    apply:(p)=>{ p.abilities.synHaymaker = true; } },
  { id:'syn_earthquake', name:'Earthquake', requires:['aerial_5','power_4'],
    desc:'Meteor Strike creates multiple expanding shockwaves.',
    apply:(p)=>{ p.abilities.synEarthquake = true; } },
  { id:'syn_explosive_fists', name:'Explosive Fists', requires:['fire_2','brawler_4'],
    desc:"The finisher's second hit creates a fire explosion.",
    apply:(p)=>{ p.abilities.synExplosiveFists = true; } },
  { id:'syn_thunderdome', name:'Thunderdome', requires:['lightning_3','special_2'],
    desc:'Special attacks shock every enemy caught in the blast.',
    apply:(p)=>{ p.abilities.synThunderdome = true; } },
  { id:'syn_revenge', name:'Revenge', requires:['tank_4','power_1'],
    desc:"Payback's bonus damage is much bigger on heavy attacks.",
    apply:(p)=>{ p.abilities.synRevenge = true; } },
  { id:'syn_elemental_weapons', name:'Elemental Weapons', requires:['weapon_4'], requiresElement:true,
    desc:'Weapons inherit your element — Fire burns, Lightning shocks, Ice slows.',
    apply:(p)=>{ p.abilities.synElementalWeapons = true; } },
];

const UPGRADE_RARITY = {
  common:    { label:'COMMON',    color:'#9adb9a' },
  rare:      { label:'RARE',      color:'#4ff0ff' },
  epic:      { label:'EPIC',      color:'#c86fff' },
  legendary: { label:'LEGENDARY', color:'#ffce2f' },
};

// ---------------------------------------------------------------------
// QUESTION BANK — a generic built-in trivia set so the quiz-gated
// upgrade flow works out of the box. EXT: swap this out for (or extend
// it with) a real curriculum question bank loaded via a teacher class
// code, the same way Jai's other Arcade Academy games pull in
// QuestionManager — the quiz flow below only needs {q, options, correct}
// shaped objects, so any bank in that shape drops in without changes.
// ---------------------------------------------------------------------
const LEGACY_QUESTION_EXAMPLES_UNUSED = [
  { q:'What is the capital of France?', options:['Paris','Rome','Madrid','Berlin'], correct:0 },
  { q:'What is 7 x 8?', options:['54','56','63','48'], correct:1 },
  { q:'Which planet is known as the Red Planet?', options:['Venus','Jupiter','Mars','Saturn'], correct:2 },
  { q:'How many continents are there on Earth?', options:['5','6','7','8'], correct:2 },
  { q:'What is the chemical symbol for water?', options:['O2','H2O','CO2','NaCl'], correct:1 },
  { q:'Who wrote Romeo and Juliet?', options:['Charles Dickens','Mark Twain','William Shakespeare','Jane Austen'], correct:2 },
  { q:'What is the largest ocean on Earth?', options:['Atlantic','Indian','Arctic','Pacific'], correct:3 },
  { q:'How many sides does a hexagon have?', options:['5','6','7','8'], correct:1 },
  { q:'What gas do plants absorb from the atmosphere?', options:['Oxygen','Nitrogen','Carbon dioxide','Hydrogen'], correct:2 },
  { q:'What is the smallest prime number?', options:['0','1','2','3'], correct:2 },
  { q:'Which country is home to the kangaroo?', options:['Brazil','Australia','Kenya','Canada'], correct:1 },
  { q:'What is the square root of 81?', options:['7','8','9','10'], correct:2 },
  { q:'What is the hardest natural substance on Earth?', options:['Gold','Iron','Diamond','Quartz'], correct:2 },
  { q:'How many legs does a spider have?', options:['6','8','10','12'], correct:1 },
  { q:'Which organ pumps blood around the human body?', options:['Lungs','Liver','Heart','Kidney'], correct:2 },
  { q:'What is the freezing point of water in Celsius?', options:['0','32','100','-10'], correct:0 },
  { q:'Which is the longest river in the world?', options:['Amazon','Nile','Yangtze','Mississippi'], correct:1 },
  { q:'What do you call a group of wolves?', options:['A pack','A herd','A flock','A pod'], correct:0 },
  { q:'How many players are on a soccer team on the field?', options:['9','10','11','12'], correct:2 },
  { q:'What is 15 - 9?', options:['4','5','6','7'], correct:2 },
  { q:'Which planet is closest to the Sun?', options:['Venus','Mercury','Earth','Mars'], correct:1 },
  { q:'What is the main language spoken in Brazil?', options:['Spanish','Portuguese','French','Italian'], correct:1 },
  { q:'How many colors are in a rainbow?', options:['5','6','7','8'], correct:2 },
  { q:'What is the powerhouse of the cell?', options:['Nucleus','Ribosome','Mitochondria','Cytoplasm'], correct:2 },
  { q:'Which shape has three sides?', options:['Square','Triangle','Pentagon','Hexagon'], correct:1 },
  { q:'What year did World War II end?', options:['1943','1945','1947','1950'], correct:1 },
  { q:'What is the tallest mountain in the world?', options:['K2','Kilimanjaro','Everest','Denali'], correct:2 },
  { q:'How many minutes are in two hours?', options:['100','110','120','130'], correct:2 },
  { q:'What is the currency of Japan?', options:['Won','Yuan','Yen','Ringgit'], correct:2 },
  { q:'Which sense organ is used to detect sound?', options:['Eye','Ear','Nose','Tongue'], correct:1 },
  { q:'What is 9 squared?', options:['18','72','81','99'], correct:2 },
  { q:'Which gas do humans need to breathe to survive?', options:['Carbon dioxide','Nitrogen','Oxygen','Helium'], correct:2 },
];

// ---- Roll / apply logic (pure functions, no DOM) --------------------
const TREE_BASE_WEIGHT = 10;
const TREE_INVESTED_MULT = 1.6; // owning a tree already makes it more likely to reappear
const LEGENDARY_REPLACE_CHANCE = 0.16;

function getEligibleTreeOption(player, treeKey) {
  const tree = UPGRADE_TREES[treeKey];
  const curLevel = player.treeLevel[treeKey]||0;
  if (curLevel >= tree.levels.length) return null; // maxed
  const def = tree.levels[curLevel]; // levels[] is 0-indexed; curLevel=0 -> level 1
  const investedMult = player.abilities && player.abilities.shopSpecialist ? TREE_INVESTED_MULT * 1.3 : TREE_INVESTED_MULT;
  let weight = TREE_BASE_WEIGHT * (curLevel>0 ? investedMult : 1);
  if (player.abilities && player.abilities.shopLuckyBreak && def.rarity !== 'common') weight *= 1.4;
  return { kind:'tree', treeKey, def, weight };
}

function getElementalOptions(player) {
  if ((player.treeLevel.elemental||0) === 0) {
    return [{ kind:'elemental_root', treeKey:'elemental', def:ELEMENTAL_ROOT, weight: TREE_BASE_WEIGHT }];
  }
  if (!player.element) {
    // Root owned, no branch chosen yet — offer a starter from each branch.
    return Object.keys(ELEMENT_BRANCHES).map(elKey => ({
      kind:'element_branch', treeKey:'elemental', elementKey:elKey,
      def: ELEMENT_BRANCHES[elKey].levels[0], weight: TREE_BASE_WEIGHT,
    }));
  }
  const branch = ELEMENT_BRANCHES[player.element];
  const nextLevelNumber = (player.elementLevel||1) + 1;
  const idx = nextLevelNumber - 2; // branch.levels[0] is level 2
  if (idx < 0 || idx >= branch.levels.length) return []; // maxed
  const invested = (player.elementLevel||1) > 1;
  const investedMult = player.abilities && player.abilities.shopSpecialist ? TREE_INVESTED_MULT * 1.3 : TREE_INVESTED_MULT;
  let weight = TREE_BASE_WEIGHT * (invested ? investedMult : 1);
  if (player.abilities && player.abilities.shopLuckyBreak && branch.levels[idx].rarity !== 'common') weight *= 1.4;
  return [{ kind:'element_level', treeKey:'elemental', elementKey:player.element,
    def: branch.levels[idx], weight }];
}

function getLegendaryPool(player) {
  return LEGENDARY_UPGRADES.filter(l => !player.legendaries.has(l.id));
}

function weightedPick(arr) {
  const total = arr.reduce((s,c)=>s+c.weight, 0);
  let r = Math.random()*total;
  for (const c of arr) { r -= c.weight; if (r<=0) return c; }
  return arr[arr.length-1];
}

function formatUpgradeOption(c) {
  if (c.kind === 'legendary') {
    return { id:c.def.id, name:c.def.name, desc:c.def.desc, rarity:'legendary', treeLabel:'LEGENDARY', icon:c.def.icon||'⭐', level:null, kind:'legendary', def:c.def };
  }
  if (c.kind === 'elemental_root') {
    return { id:c.def.id, name:c.def.name, desc:c.def.desc, rarity:c.def.rarity, treeLabel:'ELEMENTAL', icon:'✨', level:c.def.level, kind:'elemental_root', def:c.def };
  }
  if (c.kind === 'element_branch' || c.kind === 'element_level') {
    const branch = ELEMENT_BRANCHES[c.elementKey];
    return { id:c.def.id, name:c.def.name, desc:c.def.desc, rarity:c.def.rarity, treeLabel:branch.name.toUpperCase(), icon:branch.icon, level:c.def.level, kind:c.kind, elementKey:c.elementKey, def:c.def };
  }
  const tree = UPGRADE_TREES[c.treeKey];
  return { id:c.def.id, name:c.def.name, desc:c.def.desc, rarity:c.def.rarity, treeLabel:tree.name.toUpperCase(), icon:tree.icon, level:c.def.level, kind:'tree', treeKey:c.treeKey, def:c.def };
}

// Builds the 3 cards offered after a stage: gathers every currently
// eligible tree/elemental candidate, weights already-invested trees
// higher, avoids offering 3-of-the-same-tree unless forced, then has a
// small chance to swap one slot for a not-yet-owned Legendary.
function rollUpgradeChoices(player, count, excludeTreeKeys) {
  count = count || 3;
  let pool = [];
  for (const treeKey in UPGRADE_TREES) {
    const opt = getEligibleTreeOption(player, treeKey);
    if (opt) pool.push(opt);
  }
  pool = pool.concat(getElementalOptions(player));
  if (excludeTreeKeys && excludeTreeKeys.length) {
    pool = pool.filter(c => !excludeTreeKeys.includes(c.treeKey));
  }

  const chosen = [];
  const usedGroups = new Set();
  while (chosen.length < count && pool.length > 0) {
    let candidates = pool.filter(c => !usedGroups.has(c.treeKey));
    if (candidates.length === 0) candidates = pool; // forced: no other tree left
    const pick = weightedPick(candidates);
    chosen.push(pick);
    usedGroups.add(pick.treeKey);
    pool = pool.filter(c => c !== pick);
  }

  const legendaryPool = getLegendaryPool(player);
  const legendaryChance = (player.abilities && player.abilities.shopLegendaryChance)
    ? LEGENDARY_REPLACE_CHANCE + 0.10 : LEGENDARY_REPLACE_CHANCE;
  if (legendaryPool.length > 0 && chosen.length > 0 && Math.random() < legendaryChance) {
    const idx = Math.floor(Math.random()*chosen.length);
    chosen[idx] = { kind:'legendary', def: choice(legendaryPool) };
  }

  return chosen.map(formatUpgradeOption);
}

// Applies a chosen card to the player, updates tree/element progress,
// and returns any Synergy definitions newly unlocked as a result.
function applyUpgradeChoice(player, option) {
  player.upgrades.add(option.id);
  if (option.kind === 'legendary') {
    player.legendaries.add(option.id);
  } else if (option.kind === 'elemental_root') {
    player.treeLevel.elemental = 1;
    player.elementLevel = 1;
  } else if (option.kind === 'element_branch' || option.kind === 'element_level') {
    player.element = option.elementKey;
    player.elementLevel = option.def.level;
  } else if (option.kind === 'tree') {
    player.treeLevel[option.treeKey] = option.def.level;
  }
  option.def.apply(player);
  return checkSynergies(player);
}

function checkSynergies(player) {
  const newly = [];
  for (const syn of SYNERGIES) {
    if (player.synergiesUnlocked.has(syn.id)) continue;
    const hasAll = syn.requires.every(id => player.upgrades.has(id));
    const elementOk = !syn.requiresElement || !!player.element;
    if (hasAll && elementOk) {
      player.synergiesUnlocked.add(syn.id);
      syn.apply(player);
      newly.push(syn);
    }
  }
  return newly;
}

// ---------------------------------------------------------------------
// META PROGRESSION / SHOP — coins earned from kills persist between runs
// (localStorage) and are spent in a 6-tab shop on permanent upgrades.
// Distinct from the in-run UPGRADE_TREES above: those are temporary and
// reset every run; everything here carries over forever. All costs start
// at 100 coins and grow exponentially per level/tier (see shopCost()).
// ---------------------------------------------------------------------
const SHOP_COST_GROWTH = 1.15;
function shopCost(tierIndex) { return Math.round(100 * Math.pow(SHOP_COST_GROWTH, tierIndex)); }

const SHOP_TABS = [
  { id:'training', name:'Training', items: [
    { id:'stronger_strikes', name:'Stronger Strikes', desc:'Increase basic attack damage.', type:'leveled', maxLevel:20, effectPerLevel:1 },
    { id:'heavy_training', name:'Heavy Training', desc:'Increase heavy attack damage.', type:'leveled', maxLevel:20, effectPerLevel:1 },
    { id:'conditioning', name:'Conditioning', desc:'Increase maximum health.', type:'leveled', maxLevel:30, effectPerLevel:1 },
    { id:'footwork', name:'Footwork', desc:'Increase movement speed.', type:'leveled', maxLevel:20, effectPerLevel:0.01 },
    { id:'recovery_training', name:'Recovery Training', desc:'Reduce dodge cooldown.', type:'leveled', maxLevel:15, effectPerLevel:0.01 },
  ]},
  { id:'survival', name:'Survival', items: [
    { id:'toughened_up', name:'Toughened Up', desc:'Start each run with more maximum health.', type:'leveled', maxLevel:30, effectPerLevel:1 },
    { id:'second_chance', name:'Second Chance', desc:'Once per run, lethal damage leaves you at 1 HP instead.', type:'once' },
    { id:'first_aid', name:'First Aid', desc:'Health pickups restore more health.', type:'leveled', maxLevel:20, effectPerLevel:1 },
    { id:'street_medicine', name:'Street Medicine', desc:'Increase the chance of enemies dropping health.', type:'leveled', maxLevel:15, effectPerLevel:0.01 },
    { id:'fresh_start', name:'Fresh Start', desc:'Restore some health after defeating a boss.', type:'leveled', maxLevel:20, effectPerLevel:1 },
  ]},
  { id:'economy', name:'Economy', items: [
    { id:'bigger_payout', name:'Bigger Payout', desc:'Earn more coins during runs.', type:'leveled', maxLevel:25, effectPerLevel:1 },
    { id:'boss_bonus', name:'Boss Bonus', desc:'Bosses drop additional coins.', type:'leveled', maxLevel:25, effectPerLevel:1 },
    { id:'reroll_1', name:'Reroll I', desc:'Gain one upgrade reroll per run.', type:'sequence', chain:'reroll', chainIndex:0 },
    { id:'reroll_2', name:'Reroll II', desc:'Gain a second upgrade reroll per run.', type:'sequence', chain:'reroll', chainIndex:1, requires:'reroll_1' },
    { id:'reroll_3', name:'Reroll III', desc:'Gain a third upgrade reroll per run.', type:'sequence', chain:'reroll', chainIndex:2, requires:'reroll_2' },
    { id:'reject', name:'Reject', desc:'Replace one unwanted upgrade choice per selection.', type:'once' },
    { id:'specialist', name:'Specialist', desc:'Upgrades from trees you are investing in become slightly more common.', type:'once' },
    { id:'lucky_break', name:'Lucky Break', desc:'Increase the chance of Rare upgrades.', type:'once' },
    { id:'legendary_chance', name:'Legendary Chance', desc:'Slightly increase the chance of Legendary upgrades.', type:'once' },
  ]},
  { id:'startingBuild', name:'Starting Build', items: [
    { id:'starting_upgrade', name:'Starting Upgrade', desc:'Begin each run with one random Level 1 upgrade.', type:'once' },
    { id:'choose_your_training', name:'Choose Your Training', desc:'Select a starting upgrade tree at the beginning of the run.', type:'once' },
    { id:'extra_choice', name:'Extra Choice', desc:'Your first upgrade selection of the run has four options.', type:'once' },
    { id:'head_start', name:'Head Start', desc:'Receive your first upgrade earlier in the run.', type:'once' },
  ]},
  { id:'arsenal', name:'Arsenal', items: [
    { id:'durable_weapons', name:'Durable Weapons', desc:'Increase weapon durability.', type:'leveled', maxLevel:5, effectPerLevel:0.1 },
    { id:'scavenger', name:'Scavenger', desc:'Increase weapon drop chance.', type:'leveled', maxLevel:5, effectPerLevel:0.05 },
    { id:'armed_start', name:'Armed Start', desc:'Begin runs with a random unlocked weapon already in hand.', type:'once' },
    { id:'unlock_bat', name:'Baseball Bat Unlock', desc:'Baseball Bats can now appear as weapon drops.', type:'sequence', chain:'weapon', chainIndex:0, weaponId:'bat' },
    { id:'unlock_pipe', name:'Pipe Unlock', desc:'Pipes can now appear as weapon drops.', type:'sequence', chain:'weapon', chainIndex:1, requires:'unlock_bat', weaponId:'pipe' },
    { id:'unlock_bottle', name:'Bottle Unlock', desc:'Bottles can now appear as weapon drops.', type:'sequence', chain:'weapon', chainIndex:2, requires:'unlock_pipe', weaponId:'bottle' },
    { id:'unlock_crowbar', name:'Crowbar Unlock', desc:'Crowbars can now appear as weapon drops.', type:'sequence', chain:'weapon', chainIndex:3, requires:'unlock_bottle', weaponId:'crowbar' },
    { id:'unlock_sledgehammer', name:'Sledgehammer Unlock', desc:'Sledgehammers can now appear as weapon drops.', type:'sequence', chain:'weapon', chainIndex:4, requires:'unlock_crowbar', weaponId:'sledgehammer' },
    { id:'unlock_katana', name:'Katana Unlock', desc:'Katanas can now appear as weapon drops.', type:'sequence', chain:'weapon', chainIndex:5, requires:'unlock_sledgehammer', weaponId:'katana' },
    { id:'unlock_chain', name:'Chain Unlock', desc:'Chains can now appear as weapon drops.', type:'sequence', chain:'weapon', chainIndex:6, requires:'unlock_katana', weaponId:'chain' },
    { id:'unlock_sign', name:'Street Sign Unlock', desc:'Street Signs can now appear as weapon drops.', type:'sequence', chain:'weapon', chainIndex:7, requires:'unlock_chain', weaponId:'sign' },
    { id:'unlock_extinguisher', name:'Fire Extinguisher Unlock', desc:'Fire Extinguishers can now appear as weapon drops.', type:'sequence', chain:'weapon', chainIndex:8, requires:'unlock_sign', weaponId:'fire_extinguisher' },
    { id:'unlock_trashcan', name:'Trash Can Unlock', desc:'Trash Cans can now appear as weapon drops.', type:'sequence', chain:'weapon', chainIndex:9, requires:'unlock_extinguisher', weaponId:'trash_can' },
  ]},
  { id:'unlocks', name:'Unlocks', items: [
    { id:'tech_slide_kick', name:'Slide Kick', desc:'Perform a sliding attack.', type:'once', control:'Move, then hold DOWN and press ATTACK (J)' },
    { id:'tech_rising_uppercut', name:'Rising Uppercut', desc:'Launch enemies into the air.', type:'once', control:'HEAVY ATTACK (K)' },
    { id:'tech_ground_pound', name:'Ground Pound', desc:'Slam downward while airborne.', type:'once', control:'HEAVY ATTACK (K) while airborne' },
    { id:'tech_running_attack', name:'Running Attack', desc:'Attack while sprinting for bonus damage.', type:'once', control:'Move for a moment, then ATTACK (J)' },
    { id:'tech_grab', name:'Grab', desc:'Grab a stunned or vulnerable enemy.', type:'once', control:'G near a hurt enemy' },
    { id:'tech_throw', name:'Throw', desc:'Throw a grabbed enemy into others.', type:'once', control:'G again while grabbing' },
    { id:'tech_counter', name:'Counter', desc:'Perfect dodges allow an immediate counterattack.', type:'once', control:'DODGE (Shift) just before a hit lands' },
    { id:'tech_air_combo', name:'Air Combo', desc:'Continue attacking launched enemies before they land.', type:'once', control:'ATTACK (J) on airborne enemies' },
    { id:'tech_finisher_upgrade', name:'Finisher Upgrade', desc:'Add an additional attack to your basic combo.', type:'once', control:'Automatic — extends your combo chain' },
    { id:'tech_charged_heavy', name:'Charged Heavy', desc:'Hold heavy attack to charge a stronger strike.', type:'once', control:'Hold HEAVY (K), release to strike' },
    { id:'char_astronaut', name:'Astronaut', desc:'Fast fighter focused on dodges and combos.', type:'once', isCharacter:'astronaut' },
    { id:'char_ninja', name:'Ninja', desc:'Longer combos and stronger aerial attacks.', type:'once', isCharacter:'ninja' },
    { id:'char_wrestler', name:'Wrestler', desc:'Strong grabs, throws and survivability.', type:'once', isCharacter:'wrestler' },
  ]},
  { id:'cosmetics', name:'Cosmetics', items: [] },
];

// Flat lookup by id, and a lookup of chain members by chain name — both
// built once so the shop UI/cost logic never has to search nested arrays.
const SHOP_ITEMS_BY_ID = {};
const SHOP_CHAINS = {};
const WEAPON_UNLOCK_ITEM = {}; // weaponId -> shop item id that unlocks it
for (const tab of SHOP_TABS) {
  for (const item of tab.items) {
    SHOP_ITEMS_BY_ID[item.id] = item;
    if (item.chain) (SHOP_CHAINS[item.chain] = SHOP_CHAINS[item.chain]||[]).push(item);
    if (item.weaponId) WEAPON_UNLOCK_ITEM[item.weaponId] = item.id;
  }
}
function isWeaponUnlocked(weaponId, meta) {
  const def = WEAPON_TYPES[weaponId];
  if (!def || !def.shopLocked) return true; // plank/chair/cone/etc. aren't shop-gated at all
  const unlockItemId = WEAPON_UNLOCK_ITEM[weaponId];
  return !!(unlockItemId && meta && meta.shop[unlockItemId]);
}

function shopItemCost(item, meta) {
  if (item.type === 'leveled') return shopCost(meta.shop[item.id]||0);
  if (item.type === 'sequence') return shopCost(item.chainIndex);
  return shopCost(0); // standalone one-time purchase: flat 100
}
function shopItemOwnedLevel(item, meta) { return meta.shop[item.id]||0; }
function shopItemIsMaxed(item, meta) {
  if (item.type === 'leveled') return shopItemOwnedLevel(item, meta) >= item.maxLevel;
  return shopItemOwnedLevel(item, meta) >= 1;
}
function shopItemIsLocked(item, meta) {
  return !!item.requires && !(meta.shop[item.requires]);
}

const META_STORAGE_KEY = 'neonStreetsMetaProgress';

function loadMetaProgress() {
  const fresh = { coins:0, shop:{}, highScore:0, questionsCorrect:0 };
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw);
    return { coins: parsed.coins||0, shop: parsed.shop||{},
      highScore: parsed.highScore||0, questionsCorrect: parsed.questionsCorrect||0 };
  } catch (e) {
    return fresh; // localStorage unavailable (private browsing, file:// quirks, etc.)
  }
}
function saveMetaProgress(meta) {
  try { localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta)); }
  catch (e) { /* non-fatal: progress just won't persist this session */ }
}
function coinsForKill(def, meta) {
  const val = (def && def.scoreValue) || 50;
  const base = Math.max(1, Math.round(val/20));
  const flatBonus = (meta.shop.bigger_payout||0) * SHOP_ITEMS_BY_ID.bigger_payout.effectPerLevel;
  return Math.max(1, Math.round(base + flatBonus));
}

function prand(i) { const x = Math.sin(i*12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }

const THEMES = {
  city: { name:'City Street', sky:['#1a0d2e','#3a1550'], ground:'#2a2436', accent:'#ff2f92',
    deco: drawCityDeco, groundDeco: drawCityGround },
  alley: { name:'Alleyway', sky:['#100a18','#2a1a30'], ground:'#241f2a', accent:'#39ff6a',
    deco: drawAlleyDeco, groundDeco: drawAlleyGround },
  subway: { name:'Subway', sky:['#0a0a14','#181428'], ground:'#20222c', accent:'#4ff0ff',
    deco: drawSubwayDeco, groundDeco: drawSubwayGround },
  warehouse: { name:'Warehouse', sky:['#0e0e10','#221f1a'], ground:'#2c2620', accent:'#ffce2f',
    deco: drawWarehouseDeco, groundDeco: drawWarehouseGround },
  rooftop: { name:'Rooftop', sky:['#0a1030','#302060'], ground:'#3a3a44', accent:'#ff8f2f',
    deco: drawRooftopDeco, groundDeco: drawRooftopGround },
  nightclub: { name:'Nightclub', sky:['#0a0212','#1a0530'], ground:'#140a20', accent:'#ff2fdc',
    deco: drawNightclubDeco, groundDeco: drawNightclubGround },
  docks: { name:'The Docks', sky:['#0a1218','#16242e'], ground:'#1c2830', accent:'#4ff0ff',
    deco: drawDocksDeco, groundDeco: drawDocksGround },
  construction: { name:'Construction Site', sky:['#140e0a','#241a10'], ground:'#2a2018', accent:'#ffce2f',
    deco: drawConstructionDeco, groundDeco: drawConstructionGround },
  mall: { name:'Neon Mall', sky:['#0a0a1a','#1a1236'], ground:'#20203a', accent:'#39ff6a',
    deco: drawMallDeco, groundDeco: drawMallGround },
  junkyard: { name:'Junkyard', sky:['#100c08','#241c10'], ground:'#241c14', accent:'#ff8f2f',
    deco: drawJunkyardDeco, groundDeco: drawJunkyardGround },
};

// ---------------------------------------------------------------------
// Per-theme "minor gameplay" gimmicks. Two archetypes: a periodic
// telegraphed ground hazard (zoneHazard — spawns, warns, then triggers
// an effect if the player is standing in it), and a couple of bespoke
// ones (nightclub/docks visibility overlays, mall's moving walkway).
// ---------------------------------------------------------------------
const THEME_MODIFIERS = {
  city:         { type:'zoneHazard', name:'Traffic',       interval:[4,7],   telegraph:1.0,  radius:70, damage:12, effect:'damage',    color:'#ff3355' },
  alley:        { type:'zoneHazard', name:'Falling Junk',  interval:[4,6],   telegraph:0.9,  radius:60, damage:10, effect:'damage',    color:'#39ff6a' },
  subway:       { type:'zoneHazard', name:'Train Gust',    interval:[5,8],   telegraph:1.1,  radius:95, damage:5,  effect:'push',       color:'#4ff0ff' },
  warehouse:    { type:'zoneHazard', name:'Falling Crate', interval:[5,8],   telegraph:1.0,  radius:50, damage:14, effect:'spawnCrate', color:'#ffce2f' },
  rooftop:      { type:'zoneHazard', name:'Vent Burst',    interval:[4,7],   telegraph:0.8,  radius:55, damage:0,  effect:'launch',     color:'#ff8f2f' },
  nightclub:    { type:'overlay',    name:'Spotlight',     style:'dark' },
  docks:        { type:'overlay',    name:'Sea Fog',       style:'fog' },
  construction: { type:'zoneHazard', name:'Debris Fall',   interval:[3.5,6], telegraph:0.85, radius:55, damage:13, effect:'damage',    color:'#ffce2f' },
  mall:         { type:'walkway',    name:'Moving Walkway' },
  junkyard:     { type:'zoneHazard', name:'Live Wire',     interval:[4,6.5], telegraph:1.0,  radius:65, damage:7,  effect:'slow',       color:'#4ff0ff' },
};

// ---------------------------------------------------------------------
// Layered parallax background decoration. Each theme draws several
// depth layers (far sky glow -> skyline -> mid buildings/props ->
// near foreground silhouettes) using deterministic pseudo-random
// variation (prand) so detail stays stable frame-to-frame while
// `time` drives small touches like neon flicker.
// ---------------------------------------------------------------------
function wrapDrivePos(time, speed, phase, totalWidth, itemWidth) {
  const cycle = totalWidth + itemWidth*2;
  const x = ((time*speed + phase) % cycle + cycle) % cycle;
  return x - itemWidth;
}

function drawMovingCar(ctx, x, y, facing, bodyCol, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing*scale, scale);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(0, 20, 40, 8, 0, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  drawRect(ctx, -38, -2, 76, 20, bodyCol, true);
  drawRect(ctx, -22, -16, 44, 16, shadeColor(bodyCol,-10), true);
  drawRect(ctx, -18, -14, 36, 10, '#8fd6ff'); // windshield/windows band
  drawRect(ctx, 30, 2, 8, 6, '#ffe8a0'); // headlight
  drawRect(ctx, -38, 2, 6, 6, '#ff3355'); // taillight
  drawRect(ctx, -24, 16, 12, 8, '#111', true);
  drawRect(ctx, 14, 16, 12, 8, '#111', true);
  ctx.restore();
}

function drawCityDeco(ctx, w, h, camX, time) {
  // distant stars/glints
  for (let i=0;i<40;i++) {
    const bx = ((i*97 - camX*0.05) % (w+80)) - 40;
    const by = 10 + prand(i)*80;
    ctx.globalAlpha = 0.3 + 0.25*Math.sin(time*2 + i);
    drawRect(ctx, bx, by, 2, 2, '#fff');
  }
  ctx.globalAlpha = 1;
  // far skyline silhouette
  for (let i=-1;i<10;i++) {
    const bx = i*180 - (camX*0.12 % 180);
    const hgt = 60 + (prand(i*3.1)*70);
    drawRect(ctx, bx, 90-hgt*0.4, 140, hgt, '#160a26');
  }
  // mid buildings with lit windows + rooftop props
  for (let i=-1;i<8;i++) {
    const bx = i*260 - (camX*0.3 % 260);
    const bcol = i%2 ? '#241636' : '#2c1a3e';
    drawRect(ctx, bx, 40, 180, 200, bcol);
    drawRect(ctx, bx, 40, 180, 4, shadeColor(bcol,25));
    // rooftop water tank / antenna
    drawRect(ctx, bx+120, 24, 20, 18, '#191022');
    drawRect(ctx, bx+128, 8, 3, 18, '#191022');
    const blink = 0.5+0.5*Math.sin(time*4 + i*2);
    ctx.globalAlpha = blink;
    drawRect(ctx, bx+126, 6, 5, 5, '#ff3355');
    ctx.globalAlpha = 1;
    // fire escape zigzag
    for (let f=0; f<5; f++) drawRect(ctx, bx+8, 70+f*32, 26, 3, '#150a1f');
    // windows, some lit (flicker very slightly)
    for (let wx=0; wx<5; wx++) for (let wy=0; wy<6; wy++) {
      const seed = prand(i*31+wx*7+wy*13);
      if (seed > 0.35) {
        const flicker = seed>0.9 ? (0.5+0.5*Math.sin(time*6+wx+wy)) : 1;
        ctx.globalAlpha = 0.55*flicker;
        drawRect(ctx, bx+14+wx*32, 56+wy*28, 14, 16, '#ffce6a');
        ctx.globalAlpha = 1;
      } else {
        drawRect(ctx, bx+14+wx*32, 56+wy*28, 14, 16, '#0e0716');
      }
    }
    // occasional neon sign
    if (prand(i*7.7) > 0.6) {
      const signCol = i%2 ? '#ff2f92' : '#4ff0ff';
      ctx.globalAlpha = 0.7+0.3*Math.sin(time*5+i);
      drawRect(ctx, bx+20, 96, 60, 14, '#000');
      drawRect(ctx, bx+22, 98, 56, 10, signCol);
      ctx.globalAlpha = 1;
    }
  }
  // foreground streetlights + parked cars
  for (let i=-1;i<10;i++) {
    const bx = i*130 - (camX*0.85 % 130);
    drawRect(ctx, bx, 240, 22, 60, '#161018');
    drawRect(ctx, bx-2, 236, 26, 6, '#ff2f92');
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ff2f92';
    ctx.beginPath(); ctx.ellipse(bx+9, 250, 34, 14, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    if (prand(i*4.4) > 0.55) {
      const cx2 = bx + 60;
      const ccol = ['#2a3a6a','#5a1a2a','#1a3a2a'][Math.floor(prand(i*9.1)*3)];
      drawRect(ctx, cx2, 268, 70, 22, ccol, true);
      drawRect(ctx, cx2+10, 258, 44, 14, shadeColor(ccol,15), true);
      drawRect(ctx, cx2+4, 286, 12, 8, '#0a0a0a');
      drawRect(ctx, cx2+54, 286, 12, 8, '#0a0a0a');
    }
  }
  // moving traffic — cars driving through, independent of camera parallax
  // (uses `time`, not camX, so they keep moving even while the camera is
  // locked during an encounter)
  const carX1 = wrapDrivePos(time, 95, 0, w, 46);
  drawMovingCar(ctx, carX1, 218, 1, '#c62828', 0.55);
  const carX2 = wrapDrivePos(time, -78, 260, w, 46);
  drawMovingCar(ctx, carX2, 202, -1, '#2962ff', 0.5);
}

function drawCityGround(ctx, w, h, camX, time) {
  const groundTop = CONFIG.streetTop-10;
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#000';
  for (let i=-1;i<30;i++) {
    const bx = i*70 - (camX % 70);
    ctx.beginPath(); ctx.moveTo(bx, groundTop+4); ctx.lineTo(bx, h); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i=-1;i<8;i++) {
    const bx = i*220 - (camX*1.0 % 220);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.ellipse(bx+110, h-14, 20, 7, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawAlleyDeco(ctx, w, h, camX, time) {
  for (let i=-1;i<8;i++) {
    const bx = i*220 - (camX*0.3 % 220);
    drawRect(ctx, bx, 30, 200, 210, '#221a26');
    // brick texture grid
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#0d0810';
    for (let r=0;r<14;r++) {
      const ry = 30+r*15;
      ctx.beginPath(); ctx.moveTo(bx,ry); ctx.lineTo(bx+200,ry); ctx.stroke();
      const off = (r%2)*20;
      for (let c=0;c<7;c++) {
        const cx2 = bx+off+c*30;
        ctx.beginPath(); ctx.moveTo(cx2,ry); ctx.lineTo(cx2,ry+15); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // graffiti tag
    if (prand(i*5.5) > 0.4) {
      const gcol = ['#39ff6a','#ff2f92','#4ff0ff','#ffce2f'][Math.floor(prand(i*8.2)*4)];
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = gcol; ctx.lineWidth = 3;
      ctx.beginPath();
      const gx = bx+30+prand(i*2.2)*100, gy = 140+prand(i*3.3)*40;
      ctx.moveTo(gx,gy); ctx.lineTo(gx+30,gy-14); ctx.lineTo(gx+55,gy+8); ctx.lineTo(gx+80,gy-10);
      ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
    // vertical pipe with joints
    const px = bx + 170;
    drawRect(ctx, px, 30, 10, 210, '#3a3a3a', true);
    for (let j=0;j<6;j++) drawRect(ctx, px-2, 40+j*32, 14, 6, '#555');
    // hanging cable to next building
    ctx.strokeStyle = '#111'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(bx+200,60); ctx.quadraticCurveTo(bx+230,90,bx+260,60); ctx.stroke();
    ctx.lineWidth=1;
  }
  for (let i=-1;i<12;i++) {
    const bx = i*90 - (camX*0.7 % 90);
    if (prand(i*3.7) > 0.5) {
      // dumpster
      drawRect(ctx, bx, 250, 34, 30, '#3a3230', true);
      drawRect(ctx, bx-2, 246, 38, 8, '#2a241f', true);
      drawRect(ctx, bx+2, 254, 6, 6, '#181513');
    } else {
      // stacked crate
      drawRect(ctx, bx, 258, 24, 22, '#4a3a26', true);
      drawRect(ctx, bx+3, 261, 18, 3, '#2e2418');
    }
  }
}
function drawAlleyGround(ctx, w, h, camX, time) {
  const groundTop = CONFIG.streetTop-10;
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#0a0a0a';
  for (let i=-1;i<10;i++) {
    const bx = i*180 - (camX*0.9 % 180);
    ctx.beginPath(); ctx.ellipse(bx+40, groundTop+40, 30, 8, 0.2, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 0.12 + 0.03*Math.sin(time*1.5);
  ctx.fillStyle = '#39ff6a';
  ctx.beginPath(); ctx.ellipse(w*0.3, h-30, 50, 12, 0, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawSubwayDeco(ctx, w, h, camX, time) {
  drawRect(ctx, -50, 260, w+100, 8, '#3a3a44');
  // tiled back wall (the tunnel gap behind it is where the moving train runs)
  for (let i=-1;i<6;i++) {
    const bx = i*300 - (camX*0.4 % 300);
    drawRect(ctx, bx, 90, 220, 120, '#12131a');
    for (let tx=0;tx<10;tx++) for (let ty=0;ty<5;ty++) {
      drawRect(ctx, bx+4+tx*22, 94+ty*24, 20, 22, (tx+ty)%2? '#1c2a38':'#223345');
    }
    drawRect(ctx, bx+10, 160, 200, 10, '#0e1015');
  }
  // moving train — slides through the tunnel gap independent of camera
  // parallax, alternating with a dark gap so it reads as actually arriving/departing
  const trainCycle = 14; // seconds for a full pass + gap
  const trainT = time % trainCycle;
  if (trainT < 6) {
    const tx = wrapDrivePos(trainT, (w+400)/6, 0, w, 200) ;
    drawRect(ctx, tx, 110, 220, 60, '#151a24', true);
    for (let tw=0; tw<8; tw++) {
      const lit = prand(tw*3.3) > 0.3;
      ctx.globalAlpha = lit ? (0.6+0.2*Math.sin(time*3+tw)) : 1;
      drawRect(ctx, tx+12+tw*26, 118, 18, 20, lit?'#ffe8a0':'#0a0d12');
      ctx.globalAlpha = 1;
    }
    drawRect(ctx, tx-6, 128, 6, 30, '#0a0d12'); // front car coupling/nose
  }
  // support pillars
  for (let i=-1;i<8;i++) {
    const bx = i*180 - (camX*0.6 % 180);
    drawRect(ctx, bx, 60, 26, 210, '#2a2c36', true);
    drawRect(ctx, bx-4, 60, 34, 10, '#3a3c48', true);
    drawRect(ctx, bx+4, 100, 4, 150, shadeColor('#2a2c36',-15));
  }
  // platform edge safety line + tactile strip
  drawRect(ctx, -50, 258, w+100, 4, '#ffce2f');
  for (let i=-1;i<20;i++) {
    const bx = i*60 - (camX*0.8 % 60);
    drawRect(ctx, bx, 250, 6, 8, '#555');
  }
  // hanging signs
  for (let i=-1;i<5;i++) {
    const bx = i*320 - (camX*0.5 % 320) + 100;
    drawRect(ctx, bx, 44, 70, 20, '#0a0a0a', true);
    ctx.globalAlpha = 0.8;
    drawRect(ctx, bx+3, 47, 64, 14, '#4ff0ff');
    ctx.globalAlpha = 1;
  }
}
function drawSubwayGround(ctx, w, h, camX, time) {
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#000';
  for (let i=-1;i<26;i++) {
    const bx = i*80 - (camX % 80);
    ctx.beginPath(); ctx.moveTo(bx, CONFIG.streetTop-6); ctx.lineTo(bx, h); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawWarehouseDeco(ctx, w, h, camX, time) {
  for (let i=-1;i<8;i++) {
    const bx = i*240 - (camX*0.3 % 240);
    drawRect(ctx, bx, 40, 200, 200, '#241f1a');
    // hazard stripe beam across top
    for (let s=0;s<10;s++) drawRect(ctx, bx+s*22, 40, 11, 10, s%2? '#000':'#ffce2f');
    // shelving with boxes
    drawRect(ctx, bx+16, 120, 160, 8, '#3a2f22', true);
    drawRect(ctx, bx+16, 180, 160, 8, '#3a2f22', true);
    for (let bxi=0; bxi<5; bxi++) {
      if (prand(i*13+bxi) > 0.3) drawRect(ctx, bx+22+bxi*30, 90, 22, 28, shadeColor('#8a6a3a', (bxi%2?10:-10)), true);
      if (prand(i*17+bxi) > 0.3) drawRect(ctx, bx+22+bxi*30, 150, 22, 28, shadeColor('#7a5a2a', (bxi%2?-10:10)), true);
    }
    // hanging chain + hook
    ctx.strokeStyle='#555'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(bx+190,40); ctx.lineTo(bx+190,80); ctx.stroke();
    ctx.lineWidth=1;
    drawRect(ctx, bx+186, 78, 8, 8, '#444');
    // industrial light cone
    ctx.globalAlpha = 0.1+0.03*Math.sin(time*2+i);
    ctx.fillStyle = '#ffce2f';
    ctx.beginPath();
    ctx.moveTo(bx+100,44); ctx.lineTo(bx+60,220); ctx.lineTo(bx+140,220);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (let i=-1;i<10;i++) {
    const bx = i*100 - (camX*0.7 % 100);
    drawRect(ctx, bx, 230, 36, 36, '#5a4630', true);
    drawRect(ctx, bx+3, 233, 30, 3, '#3a2c1c');
    drawRect(ctx, bx+3, 258, 30, 3, '#3a2c1c');
  }
}
function drawWarehouseGround(ctx, w, h, camX, time) {
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#000';
  for (let i=-1;i<10;i++) {
    const bx = i*220 - (camX*0.9 % 220);
    for (let s=0;s<10;s++) { ctx.beginPath(); ctx.moveTo(bx+s*22,h-2); ctx.lineTo(bx+s*22-10,CONFIG.streetTop-6); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}

function drawRooftopDeco(ctx, w, h, camX, time) {
  // distant skyline (far parallax)
  for (let i=-1;i<10;i++) {
    const bx = i*160 - (camX*0.15 % 160);
    const hgt = 40 + (prand(i*2.7)*70);
    drawRect(ctx, bx, 110-hgt*0.5, 90, hgt, '#150c2c');
    if (prand(i*6.1) > 0.6) {
      const blink = 0.4+0.6*Math.abs(Math.sin(time*3+i*3));
      ctx.globalAlpha = blink;
      drawRect(ctx, bx+42, 110-hgt*0.5-6, 4, 4, '#ff3355');
      ctx.globalAlpha = 1;
    }
  }
  // nearer rooftop silhouettes with vents / water towers
  for (let i=-1;i<10;i++) {
    const bx = i*160 - (camX*0.25 % 160);
    const hgt = 60+((i*37)%90);
    drawRect(ctx, bx, 260-hgt, 100, hgt, '#241d3a');
    drawRect(ctx, bx, 260-hgt, 100, 4, shadeColor('#241d3a',20));
    if (prand(i*4.9) > 0.5) {
      // water tower
      drawRect(ctx, bx+20, 260-hgt-26, 30, 26, '#332850', true);
      drawRect(ctx, bx+16, 260-hgt-30, 38, 6, '#241d3a', true);
      for (let leg=0; leg<3; leg++) drawRect(ctx, bx+22+leg*8, 260-hgt, 3, 10, '#241d3a');
    } else {
      // vent stack with faint steam
      drawRect(ctx, bx+60, 260-hgt-16, 14, 16, '#2a2140', true);
      ctx.globalAlpha = 0.15+0.05*Math.sin(time*2+i);
      ctx.fillStyle = '#cfcfe0';
      ctx.beginPath(); ctx.ellipse(bx+67, 260-hgt-24-4*Math.sin(time+i), 6, 10, 0, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // guardrail on this rooftop, foreground
  for (let i=-1;i<16;i++) {
    const bx = i*60 - (camX*0.9 % 60);
    drawRect(ctx, bx, 250, 4, 18, '#3a3a44');
  }
  ctx.globalAlpha=0.5;
  drawRect(ctx, -50, 248, w+100, 3, '#4a4a54');
  ctx.globalAlpha=1;
}
function drawRooftopGround(ctx, w, h, camX, time) {
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = '#000';
  for (let i=-1;i<24;i++) {
    const bx = i*70 - (camX % 70);
    ctx.beginPath(); ctx.moveTo(bx, CONFIG.streetTop-6); ctx.lineTo(bx, h); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawNightclubDeco(ctx, w, h, camX, time) {
  // dark walls with a scattering of colored wall-wash lights
  for (let i=-1;i<8;i++) {
    const bx = i*220 - (camX*0.3 % 220);
    drawRect(ctx, bx, 30, 200, 210, '#170a24');
    const col = i%2 ? '#ff2fdc' : '#4ff0ff';
    ctx.globalAlpha = 0.25 + 0.15*Math.sin(time*3+i);
    drawRect(ctx, bx+40, 40, 120, 60, col);
    ctx.globalAlpha = 1;
  }
  // hanging disco lights + speaker stacks
  for (let i=-1;i<10;i++) {
    const bx = i*140 - (camX*0.7 % 140);
    const blink = 0.4+0.6*Math.abs(Math.sin(time*6+i*2));
    ctx.globalAlpha = blink;
    ctx.fillStyle = i%3===0?'#ff2fdc':(i%3===1?'#4ff0ff':'#ffce2f');
    ctx.beginPath(); ctx.arc(bx+10, 60, 5, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    drawRect(ctx, bx, 230, 26, 40, '#0a0a0a', true);
    drawRect(ctx, bx+4, 236, 18, 8, '#222', true);
  }
}
function drawNightclubGround(ctx, w, h, camX, time) {
  // pulsing dance-floor tiles
  for (let i=-1;i<16;i++) {
    const bx = i*60 - (camX*0.9 % 60);
    const on = Math.floor(time*2 + i) % 3 === 0;
    ctx.globalAlpha = on ? 0.35 : 0.1;
    ctx.fillStyle = i%2? '#ff2fdc':'#4ff0ff';
    drawRect(ctx, bx, CONFIG.streetTop-6, 58, h-CONFIG.streetTop+6, ctx.fillStyle);
    ctx.globalAlpha = 1;
  }
}

function drawDocksDeco(ctx, w, h, camX, time) {
  // stacked shipping containers + a crane silhouette
  for (let i=-1;i<8;i++) {
    const bx = i*200 - (camX*0.3 % 200);
    const col = ['#2a5a6a','#5a3a2a','#2a4a3a'][((i%3)+3)%3];
    drawRect(ctx, bx, 120, 160, 90, col, true);
    drawRect(ctx, bx, 100, 160, 40, shadeColor(col,-15), true);
    drawRect(ctx, bx+10, 130, 140, 6, shadeColor(col,20));
  }
  ctx.strokeStyle = '#0a1418'; ctx.lineWidth = 4;
  const cx = 200 - (camX*0.15 % 900);
  ctx.beginPath(); ctx.moveTo(cx,30); ctx.lineTo(cx,220); ctx.lineTo(cx+220,90); ctx.stroke();
  ctx.lineWidth = 1;
  // water glints
  for (let i=0;i<20;i++) {
    const bx = ((i*53 - camX*0.6) % (w+60)) - 30;
    ctx.globalAlpha = 0.2+0.15*Math.sin(time*2+i);
    ctx.fillStyle = '#4ff0ff';
    drawRect(ctx, bx, 250+((i*13)%20), 8, 2, '#4ff0ff');
    ctx.globalAlpha = 1;
  }
}
function drawDocksGround(ctx, w, h, camX, time) {
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#000';
  for (let i=-1;i<14;i++) {
    const bx = i*90 - (camX*0.9 % 90);
    ctx.beginPath(); ctx.moveTo(bx, CONFIG.streetTop-6); ctx.lineTo(bx, h); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawConstructionDeco(ctx, w, h, camX, time) {
  for (let i=-1;i<8;i++) {
    const bx = i*220 - (camX*0.3 % 220);
    // exposed concrete/rebar shell
    drawRect(ctx, bx, 40, 190, 200, '#2a2420');
    for (let f=0;f<5;f++) drawRect(ctx, bx+8, 50+f*36, 174, 4, '#1a1612');
    // scaffolding poles
    drawRect(ctx, bx+10, 40, 5, 200, '#8a8a8a');
    drawRect(ctx, bx+170, 40, 5, 200, '#8a8a8a');
  }
  for (let i=-1;i<6;i++) {
    const bx = i*260 - (camX*0.5 % 260) + 100;
    ctx.globalAlpha = 0.5+0.3*Math.sin(time*8+i);
    ctx.fillStyle = '#ffce2f';
    drawRect(ctx, bx, 200, 3, 3, '#ffce2f'); // welding sparks glint
    ctx.globalAlpha = 1;
  }
}
function drawConstructionGround(ctx, w, h, camX, time) {
  for (let i=-1;i<8;i++) {
    const bx = i*150 - (camX*0.8 % 150);
    drawRect(ctx, bx, 250, 30, 3, '#ffce2f');
    drawRect(ctx, bx, 250, 3, 20, '#ffce2f');
  }
}

function drawMallDeco(ctx, w, h, camX, time) {
  for (let i=-1;i<8;i++) {
    const bx = i*230 - (camX*0.3 % 230);
    drawRect(ctx, bx, 40, 200, 200, '#181430');
    // storefront glass with a neon sign
    drawRect(ctx, bx+10, 90, 180, 110, '#0a1a2a', true);
    const col = i%2?'#39ff6a':'#ff2fdc';
    ctx.globalAlpha = 0.6+0.3*Math.sin(time*4+i);
    drawRect(ctx, bx+30, 60, 140, 16, col);
    ctx.globalAlpha = 1;
  }
  // hanging plants / fountain glints at ground level
  for (let i=-1;i<10;i++) {
    const bx = i*130 - (camX*0.7 % 130);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#4ff0ff';
    ctx.beginPath(); ctx.ellipse(bx+30, 245, 20, 8, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}
function drawMallGround(ctx, w, h, camX, time) {
  // polished tile checkerboard
  for (let i=-1;i<20;i++) {
    const bx = i*48 - (camX % 48);
    ctx.globalAlpha = i%2? 0.12 : 0.05;
    drawRect(ctx, bx, CONFIG.streetTop-6, 46, h-CONFIG.streetTop+6, '#fff');
    ctx.globalAlpha = 1;
  }
}

function drawJunkyardDeco(ctx, w, h, camX, time) {
  for (let i=-1;i<8;i++) {
    const bx = i*180 - (camX*0.3 % 180);
    // stacked crushed cars
    for (let s=0;s<3;s++) {
      const col = ['#5a2a2a','#2a4a5a','#4a4a2a'][s];
      drawRect(ctx, bx+10, 220-s*40, 90, 36, col, true);
    }
  }
  ctx.strokeStyle = '#1a1410'; ctx.lineWidth=3;
  for (let i=-1;i<14;i++) {
    const bx = i*70 - (camX*0.85 % 70);
    ctx.beginPath(); ctx.moveTo(bx,150); ctx.lineTo(bx,260); ctx.stroke();
  }
  ctx.lineWidth=1;
}
function drawJunkyardGround(ctx, w, h, camX, time) {
  ctx.globalAlpha = 0.2;
  for (let i=-1;i<10;i++) {
    const bx = i*160 - (camX*0.9 % 160);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(bx+40, h-16, 26, 7, 0, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// ENTITIES
// ---------------------------------------------------------------------
let ENTITY_ID = 1;

class Entity {
  constructor(x, depth) {
    this.id = ENTITY_ID++;
    this.x = x;           // world X (horizontal, scrolls with camera)
    this.depth = depth;   // 0..1 position across the street (pseudo-3D)
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.z = 0; this.vz = 0; // vertical jump offset
    this.alive = true;
    this.animTime = 0;
    this.anim = 'idle';
    this.animLocked = false;
  }
  get groundY() { return depthToScreenY(this.depth); }
  get scale() { return depthToScale(this.depth); }
}

class Weapon {
  constructor(type, x, depth) {
    this.type = type; this.x = x; this.depth = depth; this.durability = WEAPON_TYPES[type].durability;
    this.alive = true; this.pickedUp = false; this.bob = Math.random()*10;
  }
}

class Pickup {
  constructor(kind, x, depth) { this.kind = kind; this.x = x; this.depth = depth; this.alive = true; this.bob = Math.random()*10; this.life = 14; }
}

class Projectile {
  constructor(x, depth, vx, damage, fromPlayer, color, isBomb) {
    this.x=x; this.depth=depth; this.vx=vx; this.damage=damage; this.fromPlayer=fromPlayer;
    this.alive=true; this.color=color||'#ff5'; this.life=3; this.isBomb=!!isBomb;
  }
}

class Destructible {
  constructor(kind, x, depth) {
    this.kind = kind; this.x = x; this.depth = depth; this.alive = true;
    this.health = kind==='crate'?12:kind==='barrel'?18:10;
    this.hitFlash=0;
  }
}

// ---------- PLAYER ----------
class Player extends Entity {
  constructor(charId, x, depth, meta) {
    super(x, depth);
    meta = meta || { coins:0, shop:{} };
    const def = CHARACTERS[charId];
    this.def = def;
    // Permanent shop bonuses apply here, on top of the character's base
    // stats. In-run tree upgrades (UPGRADE_TREES) stack further on top
    // via this.mods/abilities. sh() reads a shop item's owned level.
    const sh = (id)=> meta.shop[id]||0;
    const S = SHOP_ITEMS_BY_ID;
    const metaMaxHealth = def.maxHealth
      + sh('conditioning')*S.conditioning.effectPerLevel
      + sh('toughened_up')*S.toughened_up.effectPerLevel;
    const metaSpeedMult = 1 + sh('footwork')*S.footwork.effectPerLevel;
    const metaDodgeCdMult = 1 - sh('recovery_training')*S.recovery_training.effectPerLevel;

    this.baseMaxHealth = metaMaxHealth;
    this.mods = { damageMult:1, speedMult:metaSpeedMult, healthMult:1,
      dodgeCdMult:metaDodgeCdMult, specialCdMult:1,
      basicDamageMult:1, heavyDamageMult:1, airDamageMult:1 };
    // Flat (non-%) shop bonuses — these add directly to a damage/heal
    // amount rather than multiplying, matching "+1 per upgrade" wording.
    this.flatBonusBasic = sh('stronger_strikes')*S.stronger_strikes.effectPerLevel;
    this.flatBonusHeavy = sh('heavy_training')*S.heavy_training.effectPerLevel;
    this.healBonusFlat = sh('first_aid')*S.first_aid.effectPerLevel;
    this.healDropChanceBonus = sh('street_medicine')*S.street_medicine.effectPerLevel;
    this.bossHealBonus = sh('fresh_start')*S.fresh_start.effectPerLevel;
    this.weaponDurabilityMult = 1 + sh('durable_weapons')*S.durable_weapons.effectPerLevel;
    this.weaponDropBonus = sh('scavenger')*S.scavenger.effectPerLevel;
    this.rerollsRemaining = (sh('reroll_1')?1:0) + (sh('reroll_2')?1:0) + (sh('reroll_3')?1:0);
    this.rejectUsedThisScreen = false;
    this.secondChanceAvailable = !!sh('second_chance');
    this.secondChanceUsed = false;

    this.maxHealth = Math.round(metaMaxHealth);
    this.health = this.maxHealth;
    this.baseDamage = def.damage;
    this.baseSpeed = def.speed;
    this.palette = def.palette;

    // ---- Roguelike upgrade-tree state ----
    this.upgrades = new Set();         // every owned upgrade id (tree + legendary)
    this.treeLevel = { brawler:0, power:0, speed:0, aerial:0, tank:0, special:0, weapon:0, elemental:0 };
    this.element = null;               // 'fire' | 'lightning' | 'ice' once committed
    this.elementLevel = 0;
    this.legendaries = new Set();
    this.synergiesUnlocked = new Set();
    this.abilities = {};               // flags/values toggled by upgrade apply() functions
    // Shop-bought Techniques set base ability flags the same way a tree
    // pick would — some reuse existing tree mechanics outright (owning
    // both just means the flag is already true before you even pick).
    if (sh('tech_rising_uppercut')) this.abilities.uppercut = true;
    if (sh('tech_ground_pound')) this.abilities.meteorStrike = true;
    if (sh('tech_air_combo')) this.abilities.airCombo = true;
    if (sh('tech_finisher_upgrade')) this.abilities.comboExtended = true;
    if (sh('tech_slide_kick')) this.abilities.slideKick = true;
    if (sh('tech_running_attack')) this.abilities.runningAttack = true;
    if (sh('tech_grab')) this.abilities.grab = true;
    if (sh('tech_throw')) this.abilities.throwTech = true;
    if (sh('tech_counter')) this.abilities.counter = true;
    if (sh('tech_charged_heavy')) this.abilities.chargedHeavy = true;
    if (sh('specialist')) this.abilities.shopSpecialist = true;
    if (sh('lucky_break')) this.abilities.shopLuckyBreak = true;
    if (sh('legendary_chance')) this.abilities.shopLegendaryChance = true;
    if (sh('reject')) this.abilities.shopReject = true;
    this.runMoveTimer = 0;
    this.runningAttackReady = false;
    this.heavyChargeTime = 0;
    this.isChargingHeavy = false;
    this.grabbedEnemy = null;
    this.queuedActions = [];           // [{time, action}] — delayed effects (Double Impact, Double Burst, One Punch windup, Shadow Fighter echoes...)
    this.paybackActive = false;
    this.comboAddictStacks = 0;
    this.attackSpeedBuffTimer = 0;     // from Untouchable (perfect dodge)
    this.divingActive = false;
    this.meteorPending = false;
    this._secondWindCd = 0;
    this.envSlowTimer = 0; // Junkyard's Live Wire hazard (Junkyard theme gimmick)

    this.state = 'idle'; // idle, walk, attack, hurt, knockdown, dodge, jump
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.attackTimer = 0;
    this.attackActive = false;
    this.hitEnemiesThisSwing = new Set();
    this.dodgeTimer = 0; this.dodgeCd = 0; this.dodgeDir = {x:0,y:0};
    this.invuln = 0;
    this.hurtTimer = 0;
    this.knockdownTimer = 0;
    this.grounded = true;
    this.specialCd = 0;
    this.weapon = null;
    this.hitStun = 0;
    this.comboCount = 0;
    this.comboResetTimer = 0;
    this.stats = { damageDealt:0, defeats:0, highestCombo:0, coinsEarned:0 };
  }

  get speed() {
    const berserk = this.abilities.berserker && this.health < this.maxHealth*0.25;
    const envSlow = this.envSlowTimer > 0 ? 0.55 : 1;
    return this.baseSpeed * this.mods.speedMult * (berserk ? 1.15 : 1) * envSlow;
  }

  // Duration multiplier applied to attack timers/windups — folds together
  // Untouchable's temporary buff, Berserker's below-25%-HP buff, and
  // Combo Addict's stacking buff, all of which read as "attack faster".
  get attackSpeedMult() {
    let m = 1;
    if (this.attackSpeedBuffTimer > 0) m *= 0.7;
    if (this.abilities.berserker && this.health < this.maxHealth*0.25) m *= 0.5;
    if (this.abilities.comboAddict && this.comboAddictStacks > 0) m *= Math.max(0.5, 1 - this.comboAddictStacks*0.06);
    return m;
  }

  takeDamage(amount, kbx, game) {
    if (this.invuln > 0 || this.state==='dodge') {
      // A hit that would have landed while dodging is a "perfect dodge" —
      // Untouchable resets the dodge cooldown and grants a brief attack-
      // speed buff; Can't Touch This also slows nearby enemies.
      if (this.state === 'dodge' && (this.abilities.untouchable || this.abilities.cantTouchThis || this.abilities.counter)) {
        if (this.abilities.untouchable) { this.dodgeCd = 0; this.attackSpeedBuffTimer = 1.2; }
        if (this.abilities.cantTouchThis && game.stage) {
          for (const e of game.stage.enemies) {
            if (e.alive && e.state!=='dead' && dist(e.x,0,this.x,0) < 140) { e.slow = e.slow||{}; e.slow.timer = Math.max(e.slow.timer||0, 1.5); e.slow.factor = 0.5; }
          }
        }
        if (this.abilities.counter) {
          // Techniques — Counter: an immediate free strike on a perfect dodge.
          game.playerAttackHitboxRadial(this, 60, this.baseDamage*this.mods.damageMult*1.1, 220);
        }
        game.showPerfectDodge && game.showPerfectDodge();
      }
      return false;
    }
    if (this.abilities.juggernaut && this.state==='attack' && this.anim==='heavy') {
      amount *= 0.5; // heavy attacks can't be interrupted and shrug off some damage
    }
    this.health -= amount;
    this.invuln = CONFIG.player.invulnAfterHit;
    this.hitStun = 0.28;
    this.vx += kbx * (this.abilities.brace ? 0.55 : 1);
    this.state = 'hurt'; this.anim='hurt'; this.animTime=0;
    game.particles.blood(this.x, this.groundY-30, '#ff5577');
    game.shake(CONFIG.shake.light);
    this.comboCount = 0;
    if (this.abilities.payback) { this.paybackActive = true; }
    if (this.health <= 0) {
      if (this.secondChanceAvailable && !this.secondChanceUsed) {
        // Survival tab — Second Chance: once per run, lethal damage leaves you at 1 HP.
        this.secondChanceUsed = true;
        this.health = 1;
        game.particles.burst(this.x, this.groundY-30, '#ffce2f', 24, {minSpd:100,maxSpd:300,vScale:0.5,minLife:0.3,maxLife:0.6});
        game.showSecondChance && game.showSecondChance();
      } else {
        this.health = 0;
        this.state = 'knockdown'; this.anim='knockdown';
        this.alive = false;
      }
    }
    return true;
  }

  registerHit(dmg) {
    this.comboCount++;
    this.stats.highestCombo = Math.max(this.stats.highestCombo, this.comboCount);
    this.comboResetTimer = 2.2;
    this.stats.damageDealt += dmg;
    if (this.abilities.comboAddict) this.comboAddictStacks = Math.floor(this.comboCount/10);
  }

  update(dt, input, game) {
    if (!this.alive) { this.animTime += dt; return; }
    // Keep a grabbed enemy locked to the player's position each frame.
    if (this.grabbedEnemy) {
      if (!this.grabbedEnemy.alive || this.grabbedEnemy.state !== 'grabbed') { this.grabbedEnemy = null; }
      else { this.grabbedEnemy.x = this.x + this.facing*22; this.grabbedEnemy.depth = this.depth; }
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.specialCd > 0) this.specialCd -= dt;
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.attackSpeedBuffTimer > 0) this.attackSpeedBuffTimer -= dt;
    if (this._secondWindCd > 0) this._secondWindCd -= dt;
    if (this.envSlowTimer > 0) this.envSlowTimer -= dt;
    if (this.comboResetTimer > 0) { this.comboResetTimer -= dt; if (this.comboResetTimer<=0) { this.comboCount = 0; this.comboAddictStacks = 0; } }

    // Delayed effects: Double Impact's second finisher hit, Double
    // Burst's echo shockwave, One Punch's extended wind-up, Shadow
    // Fighter's replayed attacks — all queued here rather than via
    // setTimeout so they stay in lockstep with hitstop/pause.
    if (this.queuedActions.length) {
      for (let i=this.queuedActions.length-1; i>=0; i--) {
        const qa = this.queuedActions[i];
        qa.time -= dt;
        if (qa.time <= 0) { qa.action(); this.queuedActions.splice(i,1); }
      }
    }

    if (this.hitStun > 0) {
      this.hitStun -= dt;
      this.vx = lerp(this.vx, 0, 0.1);
      this.animTime += dt;
      if (this.hitStun <= 0 && this.state==='hurt') { this.state='idle'; this.anim='idle'; }
      this.x += this.vx*dt;
      this.clampToStreet();
      return;
    }

    if (this.state === 'dodge') {
      // Dash Strike: attacking mid-dodge cancels into a rushing strike.
      if (this.abilities.dashStrike && input.consumePress('attack')) {
        this.doDashStrike(game);
        return;
      }
      this.dodgeTimer -= dt;
      this.x += this.dodgeDir.x * CONFIG.player.dodgeSpeed * dt;
      this.depth = clamp(this.depth + this.dodgeDir.y * CONFIG.player.dodgeSpeed * dt / (CONFIG.streetBottom - CONFIG.streetTop), 0, 1);
      if (this.dodgeTimer <= 0) { this.state='idle'; this.anim='idle'; this.animTime=0; }
      this.animTime += dt;
      this.clampToStreet();
      return;
    }

    if (this.state === 'attack') {
      this.attackTimer -= dt;
      this.animTime += dt;
      if (this.attackTimer <= 0) {
        this.state = 'idle'; this.anim='idle'; this.attackActive=false; this.hitEnemiesThisSwing.clear();
      }
      // allow slight movement lock during attacks
      this.x += this.vx*dt*0.2; this.vx *= 0.9;
      this.clampToStreet();
      return;
    }

    if (this.state === 'jump' || this.state === 'air') {
      this.z += this.vz*dt;
      this.vz += CONFIG.gravity*dt;
      // High Flyer: limited horizontal steering while airborne.
      if (this.abilities.highFlyer) {
        let ax = 0;
        if (input.down('left')) ax -= 1;
        if (input.down('right')) ax += 1;
        if (ax !== 0) { this.vx = lerp(this.vx, ax*this.speed, dt*3); this.facing = ax>0?1:-1; }
      }
      if (this.z >= 0) {
        this.z = 0; this.vz = 0; this.grounded=true; this.state='idle'; this.anim='idle';
        // Meteor Strike / diving impact land here.
        if (this.meteorPending) {
          this.meteorPending = false;
          const groups = this.abilities.synEarthquake ? 3 : 1; // Earthquake synergy: multiple expanding shockwaves
          for (let g=0; g<groups; g++) {
            const delay = g*0.12;
            this.queuedActions.push({ time: delay, action: ()=>{
              game.playerAttackHitboxRadial(this, 90+g*40, this.baseDamage*this.mods.damageMult*(1.6+g*0.4), 260);
              game.shake(CONFIG.shake.boss); game.hitstop(CONFIG.hitstop.finisher);
            }});
          }
        } else if (this.divingActive) {
          this.divingActive = false;
          game.playerAttackHitboxRadial(this, 55, this.baseDamage*this.mods.damageMult*this.mods.airDamageMult*1.3, 200);
          game.shake(CONFIG.shake.heavy*0.6);
        }
      }
      this.x += this.vx*dt;
      this.animTime += dt;
      if (this.state === 'jump' || this.state === 'air') {
        // Meteor Strike: heavy attack while airborne.
        if (input.consumePress('heavy') && this.abilities.meteorStrike && !this.meteorPending) {
          this.meteorPending = true; this.vz = 1100; this.state='air'; this.anim='heavy'; this.animTime=0;
        }
        // Dive Kick: down + attack while airborne.
        else if (this.abilities.diveKick && input.down('down') && input.consumePress('attack') && !this.divingActive) {
          this.divingActive = true; this.vz = 950; this.state='air'; this.anim='air'; this.animTime=0;
        }
        else if (input.consumePress('attack') && this.state!=='air') {
          this.state='air'; this.anim='air'; this.animTime=0; this.attackActive=true; this.hitEnemiesThisSwing.clear();
          game.playerAttackHitbox(this, 30, this.baseDamage*this.mods.damageMult*this.mods.airDamageMult, 60, false);
        }
      }
      this.clampToStreet();
      return;
    }

    // ---- normal movement & input state ----
    let mvx=0, mvy=0;
    if (input.down('left')) mvx -= 1;
    if (input.down('right')) mvx += 1;
    if (input.down('up')) mvy -= 1;
    if (input.down('down')) mvy += 1;
    const moving = mvx!==0 || mvy!==0;
    if (mvx !== 0) this.facing = mvx > 0 ? 1 : -1;

    const len = Math.hypot(mvx,mvy)||1;
    this.vx = (mvx/len) * this.speed;
    // Depth axis spans CONFIG.streetTop..streetBottom in screen pixels;
    // dividing by that span ties vertical pacing to the same px/sec feel
    // as horizontal movement. (Previously missing "* dt" here made this
    // move a fixed amount per FRAME instead of per SECOND — at 60fps
    // that covered the whole depth range in ~1/16s, i.e. a teleport.)
    const depthSpan = CONFIG.streetBottom - CONFIG.streetTop;
    this.depth = clamp(this.depth + (mvy/len) * this.speed * dt / depthSpan, 0, 1);
    this.x += this.vx*dt;
    this.clampToStreet();

    this.state = moving ? 'walk' : 'idle';
    this.anim = moving ? 'walk' : 'idle';
    this.animTime += dt * (moving?2.2:1);

    // Running Attack (Techniques): track sustained movement to arm a bonus.
    if (this.abilities.runningAttack) {
      if (moving) { this.runMoveTimer += dt; if (this.runMoveTimer > 0.5) this.runningAttackReady = true; }
      else { this.runMoveTimer = 0; this.runningAttackReady = false; }
    }

    // ---- actions ----
    // Slide Kick (Techniques): Down + Attack while moving on the ground.
    if (this.abilities.slideKick && moving && input.down('down') && input.consumePress('attack')) {
      this.doSlideKick(game);
      return;
    }
    if (input.consumePress('dodge') && this.dodgeCd<=0) {
      this.state='dodge'; this.anim='dodge'; this.animTime=0;
      this.dodgeTimer = CONFIG.player.dodgeTime;
      this.dodgeCd = CONFIG.player.dodgeCooldown * this.mods.dodgeCdMult;
      this.invuln = CONFIG.player.dodgeIframes;
      let dx = mvx, dy = mvy;
      if (dx===0 && dy===0) dx = this.facing;
      const l = Math.hypot(dx,dy)||1;
      this.dodgeDir = {x:dx/l, y:dy/l};
      game.particles.dust(this.x, this.groundY-4);
      if (this.abilities.afterimage) {
        game.spawnHazard(this.x, this.depth, this.baseDamage*this.mods.damageMult*0.5, 0.4);
      }
      return;
    }

    if (input.consumePress('jump')) {
      this.state='jump'; this.anim='jump'; this.animTime=0;
      this.vz = CONFIG.player.jumpVel * (this.abilities.highFlyer ? 1.25 : 1);
      this.grounded=false;
      game.particles.dust(this.x, this.groundY-2);
      return;
    }

    if (input.consumePress('special') && this.specialCd<=0) {
      this.doSpecial(game);
      return;
    }

    if (this.abilities.chargedHeavy) {
      // Hold to charge; release to fire with a scaled bonus (capped).
      if (input.consumePress('heavy')) { this.isChargingHeavy = true; this.heavyChargeTime = 0; }
      if (this.isChargingHeavy) {
        if (input.down('heavy')) {
          this.heavyChargeTime += dt;
          this.state = 'idle'; this.anim = 'block'; // brace pose while charging
        } else {
          this.isChargingHeavy = false;
          const chargeMult = 1 + Math.min(this.heavyChargeTime, 0.8) * 0.75; // up to +60% at full charge
          this.doHeavy(game, chargeMult);
          return;
        }
      }
    } else if (input.consumePress('heavy')) {
      this.doHeavy(game);
      return;
    }

    if (this.abilities.grab && input.consumePress('grab')) {
      game.tryPlayerGrab(this);
      return;
    }

    if (input.consumePress('attack')) {
      this.doBasicAttack(game);
      return;
    }
  }

  // Techniques — Slide Kick: a forward-dashing low attack usable while
  // moving on the ground (no dodge/cooldown needed, unlike Dash Strike).
  doSlideKick(game) {
    this.state='attack'; this.anim='kick'; this.animTime=0; this.attackActive=true; this.hitEnemiesThisSwing.clear();
    this.attackTimer = 0.34 * this.attackSpeedMult;
    const dmg = (this.baseDamage * this.mods.damageMult + this.flatBonusBasic) * 1.2;
    this.vx = this.facing * 300;
    this.x += this.facing * 16;
    game.hitstop(CONFIG.hitstop.light);
    game.particles.dust(this.x, this.groundY-4);
    game.playerAttackHitbox(this, 50, dmg, 200, false);
  }

  // Speed tree — Dash Strike: cancel a dodge into a rushing punch/kick.
  // The Haymaker synergy (Dash Strike + Heavy Hitter) turns it into a
  // heavier charging punch instead.
  doDashStrike(game) {
    this.state='attack'; this.anim = this.abilities.synHaymaker ? 'heavy' : 'kick';
    this.animTime = 0; this.attackActive = true; this.hitEnemiesThisSwing.clear();
    this.attackTimer = 0.32;
    const haymaker = this.abilities.synHaymaker;
    const dmg = this.baseDamage * this.mods.damageMult * (haymaker ? 2.0 : 1.3);
    this.vx = this.dodgeDir.x * 260;
    this.x += this.dodgeDir.x * 20;
    game.hitstop(haymaker ? CONFIG.hitstop.heavy : CONFIG.hitstop.light);
    game.shake(haymaker ? CONFIG.shake.heavy*0.6 : CONFIG.shake.light);
    game.playerAttackHitbox(this, 46, dmg, haymaker ? 380 : 260, haymaker);
  }

  clampToStreet() {
    this.depth = clamp(this.depth, 0, 1);
  }

  // Consumes the Tank tree's Payback buff (if active) on the next attack
  // that goes out, boosting its damage — much more so on a heavy attack
  // if the Revenge synergy (Payback + Heavy Hitter) is owned.
  consumePayback(dmg, isHeavy) {
    if (!this.paybackActive) return dmg;
    this.paybackActive = false;
    const bonus = (isHeavy && this.abilities.synRevenge) ? 1.2 : 0.4;
    return dmg * (1+bonus);
  }

  // Legendary — Shadow Fighter: records the position/facing of an attack
  // and replays a weaker copy of it ~0.5s later via a shadow. Queued
  // rather than setTimeout so it stays in lockstep with hitstop/pause,
  // and uses a throwaway "attacker" stand-in (not `this`) so the shadow's
  // hit doesn't fight over hitEnemiesThisSwing dedup with the real swing.
  queueShadowEcho(game, kind, x, depth, facing, dmg, range, knockback, big, anim) {
    this.queuedActions.push({ time: 0.5, action: ()=>{
      if (!game.stage) return;
      game.spawnShadowVisual(x, depth, facing, anim||'punch1');
      game.particles.burst(x, depthToScreenY(depth)-30, '#8866ff', 10, {minSpd:60,maxSpd:180,vScale:0.5,minLife:0.2,maxLife:0.4});
      if (kind === 'radial') {
        game.playerAttackHitboxRadialAt(x, depth, range*0.9, dmg*0.45, knockback*0.6, false, false, '#8866ff');
      } else {
        const echoAttacker = { x, depth, facing, groundY: depthToScreenY(depth), hitEnemiesThisSwing: new Set(), registerHit(){},
          abilities: this.abilities, weapon: null, mods: this.mods, baseDamage: this.baseDamage, attackSpeedBuffTimer: 0 };
        game.playerAttackHitbox(echoAttacker, range, dmg*0.45, knockback*0.6, big);
      }
    }});
  }

  doBasicAttack(game) {
    if (this.comboTimer <= 0) {
      this.comboIndex = (this.abilities.oneManArmy && this.justFinishedFullCombo) ? 1 : 0;
      this.justFinishedFullCombo = false;
    }
    const baseSeq = ['punch1','punch2','kick','finisher'];
    const sequence = this.weapon ? ['wpn1','wpn2']
      : (this.abilities.comboExtended ? ['punch1','punch2','kick','kick','finisher'] : baseSeq);
    const posInCombo = this.comboIndex;
    const step = sequence[posInCombo % sequence.length];
    const isFinisher = step === 'finisher';
    this.comboIndex++;
    this.comboTimer = CONFIG.player.comboWindow;
    this.state='attack'; this.anim = step==='wpn1'||step==='wpn2' ? (this.comboIndex%2? 'punch1':'punch2') : step;
    this.animTime = 0; this.attackActive = true; this.hitEnemiesThisSwing.clear();

    let dmg = this.baseDamage * this.mods.damageMult * this.mods.basicDamageMult + this.flatBonusBasic;
    let range = 40, knockback=90, hs=CONFIG.hitstop.light, shake=CONFIG.shake.light;
    if (isFinisher) { dmg*=1.9; range=48; knockback=260; hs=CONFIG.hitstop.finisher; shake=CONFIG.shake.finisher; this.attackTimer=0.5; }
    else { this.attackTimer = 0.30; }
    this.attackTimer *= this.attackSpeedMult;
    // Running Attack (Techniques): sustained movement before this swing grants a bonus.
    if (this.abilities.runningAttack && this.runningAttackReady) { dmg *= 1.35; this.runningAttackReady = false; }
    if (this.weapon) {
      const w = WEAPON_TYPES[this.weapon];
      dmg = dmg*0.7 + w.damage * (this.abilities.streetFighter ? 1.2 : 1);
      range = w.range; knockback *= w.knockback;
      if (this.abilities.fastHands) this.attackTimer *= 0.85;
    }
    if (this.abilities.momentum) dmg *= (1 + Math.min(posInCombo,12)*0.08);
    dmg = this.consumePayback(dmg, false);

    game.hitstop(hs);
    game.shake(shake*0.5);
    game.playerAttackHitbox(this, range, dmg, knockback, isFinisher);
    if (this.abilities.shadowFighter) this.queueShadowEcho(game, 'melee', this.x, this.depth, this.facing, dmg, range, knockback, isFinisher, step);

    if (isFinisher) {
      this.justFinishedFullCombo = true;
      if (this.abilities.doubleImpact) {
        const fx = this.x, fdmg = dmg, fkb = knockback, ffacing = this.facing;
        this.queuedActions.push({ time: 0.15, action: ()=>{
          this.hitEnemiesThisSwing.clear();
          game.playerAttackHitbox(this, range, fdmg, fkb*1.1, true);
          if (this.abilities.synExplosiveFists) game.triggerExplosion(fx, this.depth, fdmg*0.6, 60, '#ff5a2f', true);
        }});
      }
      if (this.abilities.explosiveFinish) {
        game.triggerExplosion(this.x, this.depth, dmg*0.5, 55, '#ffce2f', false);
      }
    }
    if (this.weapon) {
      const dur = --game.currentWeaponDurability;
      if (dur<=0) { this.weapon=null; }
    }
  }

  doHeavy(game, chargeMult) {
    chargeMult = chargeMult || 1;
    this.state='attack'; this.anim='heavy'; this.animTime=0; this.attackActive=true; this.hitEnemiesThisSwing.clear();
    let dmg = (this.baseDamage * this.mods.damageMult * 1.8 * this.mods.heavyDamageMult + this.flatBonusHeavy) * chargeMult;
    dmg = this.consumePayback(dmg, true);
    const launch = !!this.abilities.uppercut;
    const weaponBonus = (this.weapon && this.abilities.weaponMaster) ? 1.3 : 1;

    if (this.abilities.onePunch) {
      // Legendary: massive damage, much longer wind-up before the hit lands.
      this.attackTimer = 1.15 * this.attackSpeedMult;
      const finalDmg = dmg*3*weaponBonus;
      game.hitstop(CONFIG.hitstop.light);
      this.queuedActions.push({ time: 0.5, action: ()=>{
        game.hitstop(CONFIG.hitstop.finisher); game.shake(CONFIG.shake.boss);
        game.playerAttackHitbox(this, 55, finalDmg, 420, true, launch);
        this.afterHeavyHit(game, finalDmg);
        if (this.abilities.shadowFighter) this.queueShadowEcho(game, 'melee', this.x, this.depth, this.facing, finalDmg, 55, 420, true, 'heavy');
      }});
      return;
    }

    this.attackTimer = 0.62 * this.attackSpeedMult;
    game.hitstop(CONFIG.hitstop.heavy);
    game.shake(CONFIG.shake.heavy*0.6);
    game.playerAttackHitbox(this, 50, dmg*weaponBonus, 320, true, launch);
    this.afterHeavyHit(game, dmg);
    if (this.abilities.shadowFighter) this.queueShadowEcho(game, 'melee', this.x, this.depth, this.facing, dmg*weaponBonus, 50, 320, true, 'heavy');
  }

  // Shared follow-up effects for a landed heavy hit: Shockwave/Seismic
  // Slam AoE, and Weapon Master's per-weapon flourish.
  afterHeavyHit(game, dmg) {
    if (this.abilities.seismicSlam) {
      game.playerAttackHitboxRadial(this, 130, dmg*0.7, 260, true);
      game.shake(CONFIG.shake.boss);
    } else if (this.abilities.shockwave) {
      game.playerAttackHitboxRadial(this, 75, dmg*0.4, 140);
    }
    if (this.weapon && this.abilities.weaponMaster) {
      const wcol = WEAPON_TYPES[this.weapon].color;
      game.particles.burst(this.x, this.groundY-30, wcol, 14, {minSpd:100,maxSpd:280,vScale:0.5,minLife:0.25,maxLife:0.5});
    }
  }

  doSpecial(game) {
    this.state='attack'; this.anim='special'; this.animTime=0; this.attackActive=true; this.hitEnemiesThisSwing.clear();
    this.attackTimer = 0.5 * this.attackSpeedMult;
    this.specialCd = CONFIG.player.specialCooldown * this.mods.specialCdMult;
    let dmg = this.baseDamage * this.mods.damageMult * 1.4;
    dmg = this.consumePayback(dmg, false);

    const radiusMult = this.abilities.specialRadiusMult || 1;
    const enhanced = this.abilities.limitBreak && this.comboCount >= 15;
    const radius = 70 * radiusMult * (enhanced ? 1.6 : 1);
    const finalDmg = dmg * (enhanced ? 1.8 : 1);

    game.hitstop(enhanced ? CONFIG.hitstop.finisher : CONFIG.hitstop.special);
    game.shake(enhanced ? CONFIG.shake.boss : CONFIG.shake.heavy);
    game.playerAttackHitboxRadial(this, radius, finalDmg, 240, enhanced, this.abilities.synThunderdome);

    if (this.abilities.thunderstorm && Math.random() < 0.35) {
      game.triggerLightningStrike(this.x + this.facing*80, this.depth);
    }
    if (this.abilities.doubleBurst) {
      const bx = this.x, bd = this.depth, bdmg = finalDmg*0.55, brad = radius*0.8;
      this.queuedActions.push({ time: 0.35, action: ()=>{
        game.shake(CONFIG.shake.heavy*0.5);
        game.playerAttackHitboxRadialAt(bx, bd, brad, bdmg, 180);
      }});
    }
    if (this.abilities.shadowFighter) this.queueShadowEcho(game, 'radial', this.x, this.depth, this.facing, finalDmg, radius, 240, false, 'special');
  }

  draw(ctx, camX) {
    const pose = getPose(this.anim, Math.min(1, (this.animTime / (this.state==='attack'?this.attackDurationHint():0.5))), this.facing);
    const flash = this.invuln>0 && Math.floor(this.invuln*20)%2===0;
    const screenY = this.groundY + this.z;
    drawFighter(ctx, this.x-camX, screenY, this.facing, this.scale, pose, this.palette, flash && this.hitStun>0, this.alive?1:1);
    if (this.weapon) {
      const w = WEAPON_TYPES[this.weapon];
      ctx.save();
      ctx.translate(this.x-camX + this.facing*14, screenY-40);
      ctx.rotate(this.facing*0.6);
      drawRect(ctx, -2, -3, 4, 26, w.color);
      ctx.restore();
    }
  }
  attackDurationHint() {
    if (this.anim==='finisher') return 0.5;
    if (this.anim==='heavy') return 0.62;
    if (this.anim==='special') return 0.5;
    return 0.30;
  }
}

// ---------- ENEMY ----------
class Enemy extends Entity {
  constructor(typeId, x, depth, scaleFactor=1, flatHealthBonus=0) {
    super(x, depth);
    const def = ENEMY_TYPES[typeId];
    this.def = def; this.typeId = typeId;
    this.maxHealth = Math.round(def.health * scaleFactor) + flatHealthBonus;
    this.health = this.maxHealth;
    this.damage = def.damage * scaleFactor;
    this.speed = def.speed;
    this.palette = def.palette;
    this.state = 'approach'; // approach, position, telegraph, attack, retreat, hurt, knockdown, dead, staggered
    this.stateTimer = 0;
    this.attackCd = rand(0, 0.6);
    this.hasToken = false;
    this.hitFlash = 0;
    this.targetOffsetAngle = rand(0, Math.PI*2);
    this.orbitRadius = rand(60, 110);
    this.knockdownTimer = 0;
    this.deathTimer = 0;
    this.anim='idle';
    // Elemental status effects (Elemental tree)
    this.burn = { timer:0, tick:0, dps:0, spreadFlag:false };
    this.slow = { timer:0, factor:1 };
    this.frozenTimer = 0;
    // Ground Bounce (Power tree): armed by an uppercut hit, resolves on landing
    this._bounceArmed = false;
    this._bounceDamage = 0;
    // Air Combo (Aerial tree): floatier while launched so more hits land
    this._floaty = false;
    // Acrobat: periodic unpredictable hop between attacks
    this._hopTimer = rand(0.8, 2.2);
    // Enforcer: multi-hit flurry (extra hits queued after the first lands)
    this._pendingExtraHits = 0;
    this._extraHitTimer = 0;
    // Optional self-destruct timer (used by The Mechanic's deployed turrets)
    this._expireTimer = 0;
  }

  forceStagger(duration) {
    if (this.state === 'knockdown' || this.state === 'dead') return;
    this.state = 'staggered'; this.anim = 'knockdown'; this.stateTimer = duration; this.hasToken = false;
  }

  takeDamage(amount, kbx, game, launch) {
    // Already defeated/defeating — ignore further hits so a stray swing
    // or AoE clipping a falling body can't reset its knockdown/death
    // timer and leave the encounter stuck "locked" forever.
    if (this.state === 'knockdown' || this.state === 'dead') return;
    this.health -= amount;
    this.hitFlash = 0.12;
    this.vx += kbx / (this.def.knockbackRes||1);
    game.particles.blood(this.x, this.groundY-30);
    game.particles.impact(this.x, this.groundY-30);
    if (launch) { this.vz = -260; this._floaty = game.player && game.player.abilities.airCombo; }
    this.hasToken = false;
    if (this.health <= 0) {
      this.health = 0;
      this.state = 'knockdown'; this.anim='knockdown'; this.stateTimer=0; this.knockdownTimer = 0.9;
    } else if (this.state !== 'staggered') {
      this.state = 'hurt'; this.anim='hurt'; this.stateTimer = 0.18;
    }
  }

  update(dt, player, game) {
    this.animTime += dt;
    if (this.hitFlash>0) this.hitFlash -= dt;

    // Self-destruct timer (e.g. The Mechanic's deployed turrets) — fades
    // out the same way a normal defeat does, just without a kill credit.
    if (this._expireTimer > 0 && this.state!=='knockdown' && this.state!=='dead') {
      this._expireTimer -= dt;
      if (this._expireTimer <= 0) { this.state='dead'; this.anim='defeat'; this.deathTimer=0.6; }
    }

    // Frozen: cannot act at all until the freeze wears off.
    if (this.frozenTimer > 0) {
      this.frozenTimer -= dt;
      this.anim = 'hurt';
      return;
    }
    // Burn: ticking damage over time, with optional spread/explosion.
    if (this.burn.timer > 0) {
      this.burn.timer -= dt; this.burn.tick -= dt;
      if (this.burn.tick <= 0) {
        this.burn.tick = 0.5;
        if (this.state !== 'knockdown' && this.state !== 'dead') {
          this.health -= this.burn.dps;
          game.particles.burst(this.x, this.groundY-30, '#ff6a2f', 4, {minSpd:30,maxSpd:90,vScale:0.6,minLife:0.2,maxLife:0.4,minSize:2,maxSize:3});
          if (player.abilities.spreadingFlames) game.spreadBurn(this, this.burn.dps, this.burn.timer);
          if (this.health <= 0) {
            this.health = 0;
            this._burnKill = true;
            this.state = 'knockdown'; this.anim='knockdown'; this.stateTimer=0; this.knockdownTimer = 0.9;
          }
        }
      }
    }

    if (this.vz!==0 || this.z<0) {
      this.z += this.vz*dt;
      this.vz += CONFIG.gravity*dt * (this._floaty ? 0.55 : 1);
      if (this.z>=0){
        this.z=0; this.vz=0; this._floaty=false;
        if (this._bounceArmed) {
          this._bounceArmed = false;
          this.health -= this._bounceDamage;
          game.particles.impact(this.x, this.groundY-10);
          game.shake(CONFIG.shake.light);
          this.vz = -110; // small bounce
          if (this.health <= 0 && this.state!=='knockdown' && this.state!=='dead') {
            this.health = 0; this.state='knockdown'; this.anim='knockdown'; this.stateTimer=0; this.knockdownTimer=0.9;
          }
        }
      }
    }
    this.vx = lerp(this.vx, 0, 0.12);
    this.x += this.vx*dt;

    if (this.state === 'hurt') {
      this.stateTimer -= dt;
      if (this.stateTimer<=0) this.state='position';
      return;
    }
    if (this.state === 'staggered') {
      this.stateTimer -= dt;
      if (this.stateTimer<=0) this.state='position';
      return;
    }
    if (this.state === 'grabbed') {
      // Held by the player (Techniques — Grab); frozen until thrown or released.
      // Position is synced by Player.update each frame.
      return;
    }
    if (this.state === 'knockdown') {
      this.knockdownTimer -= dt;
      if (this.knockdownTimer <= 0) {
        this.state='dead'; this.anim='defeat'; this.deathTimer=0.8;
        if (this._burnKill && player.abilities.fireExplosion) game.triggerExplosion(this.x, this.depth, this.maxHealth*0.25, 65, '#ff5a2f', true);
      }
      return;
    }
    if (this.state === 'dead') {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.alive = false;
      return;
    }

    if (this.def.ranged) return this.updateRanged(dt, player, game);
    return this.updateMelee(dt, player, game);
  }

  faceTarget(player) { this.facing = (player.x >= this.x) ? 1 : -1; }

  get effSpeed() { return this.speed * (this.slow.timer > 0 ? this.slow.factor : 1); }

  updateMelee(dt, player, game) {
    if (this.slow.timer > 0) this.slow.timer -= dt;
    this.faceTarget(player);
    const d = dist(this.x, this.groundY, player.x, player.groundY);
    if (this.attackCd>0) this.attackCd -= dt * (this.slow.timer>0 ? this.slow.factor : 1);
    const spd = this.effSpeed;

    // Acrobat: small unpredictable hops for flavor and to sell "hard to pin down"
    // (the actual z/vz gravity integration already happens once per frame in
    // the base Enemy.update() before this is called — just set vz here).
    if (this.def.acrobatic && (this.state==='position' || this.state==='wait' || this.state==='approach')) {
      this._hopTimer -= dt;
      if (this._hopTimer <= 0 && this.z >= 0) {
        this._hopTimer = rand(0.9, 2.0);
        this.vz = -190;
        this.x += (Math.random()<0.5?-1:1) * rand(20, 50);
      }
    }

    switch (this.state) {
      case 'approach':
      case 'position': {
        this.anim = 'walk';
        // move toward player's vertical position and a spot around them
        const desiredDepth = clamp(player.depth + Math.sin(this.targetOffsetAngle)*0.12, 0, 1);
        this.depth = lerp(this.depth, desiredDepth, dt*1.5);
        const targetX = player.x - this.facing * (this.def.attackRange + (this.def.keepDistance||0));
        const dx = targetX - this.x;
        if (Math.abs(dx) > 6) this.x += Math.sign(dx) * spd * dt;
        if (Math.abs(dx) < this.def.attackRange+10 && Math.abs(player.depth-this.depth) < 0.14) {
          if (this.hasToken && this.attackCd<=0) { this.state='telegraph'; this.stateTimer = this.def.telegraph; this.anim = this.def.windup; this.animTime=0; }
          else { this.state='wait'; this.stateTimer = rand(0.2,0.6); }
        }
        break;
      }
      case 'wait': {
        this.anim='idle';
        this.stateTimer -= dt;
        if (this.hasToken && this.attackCd<=0) { this.state='telegraph'; this.stateTimer=this.def.telegraph; this.anim=this.def.windup; this.animTime=0; }
        else if (this.stateTimer<=0) this.state='position';
        break;
      }
      case 'telegraph': {
        this.stateTimer -= dt;
        if (this.stateTimer<=0) {
          this.state='attack'; this.stateTimer=0.28; this.anim=this.def.windup;
          const dd = dist(this.x,this.groundY,player.x,player.groundY);
          if (dd < this.def.attackRange+30 && Math.abs(this.depth-player.depth)<0.18) {
            player.takeDamage(this.damage, this.facing*140, game);
            game.particles.impact(player.x, player.groundY-30);
            // Enforcer: a two-hit flurry — the extra hit(s) land shortly after the first.
            if (this.def.multiHit > 1) { this._pendingExtraHits = this.def.multiHit - 1; this._extraHitTimer = 0.22; }
          }
          this.attackCd = this.def.attackCooldown;
        }
        break;
      }
      case 'attack': {
        this.stateTimer -= dt;
        if (this._pendingExtraHits > 0) {
          this._extraHitTimer -= dt;
          if (this._extraHitTimer <= 0) {
            const dd = dist(this.x,this.groundY,player.x,player.groundY);
            if (dd < this.def.attackRange+30 && Math.abs(this.depth-player.depth)<0.2) {
              player.takeDamage(this.damage*0.75, this.facing*120, game);
              game.particles.impact(player.x, player.groundY-30);
            }
            this._pendingExtraHits--;
            this._extraHitTimer = 0.22;
          }
        }
        if (this.stateTimer<=0) { this.state='retreat'; this.stateTimer=rand(0.3,0.6); this.hasToken=false; this._pendingExtraHits=0; }
        break;
      }
      case 'retreat': {
        this.anim='walk';
        this.stateTimer -= dt;
        this.x -= this.facing * this.effSpeed * 0.6 * dt;
        if (this.stateTimer<=0) this.state='position';
        break;
      }
    }
  }

  updateRanged(dt, player, game) {
    if (this.slow.timer > 0) this.slow.timer -= dt;
    this.faceTarget(player);
    const d = Math.abs(this.x-player.x);
    this.anim='idle';
    if (this.attackCd>0) this.attackCd -= dt * (this.slow.timer>0 ? this.slow.factor : 1);
    const spd = this.effSpeed;
    const desiredDepth = clamp(player.depth + 0.15, 0, 1);
    this.depth = lerp(this.depth, desiredDepth, dt);
    if (d < this.def.retreatRange) {
      this.anim='walk';
      this.x -= this.facing*spd*dt;
    } else if (d > this.def.attackRange) {
      this.anim='walk';
      this.x += Math.sign(player.x-this.x)*spd*0.6*dt;
    } else if (this.hasToken && this.attackCd<=0) {
      this.anim = 'punch2'; this.animTime=0;
      if (this.def.bomber) {
        game.spawnProjectile(this.x, this.depth, this.facing*190, this.damage, false, '#ff8f2f', true);
      } else {
        game.spawnProjectile(this.x, this.depth, this.facing*260, this.damage, false, '#8b0');
      }
      this.attackCd = this.def.attackCooldown;
      this.hasToken=false;
    }
  }

  draw(ctx, camX) {
    const pose = getPose(this.anim, (this.animTime%1), this.facing);
    const screenY = this.groundY + this.z;
    const alpha = this.state==='dead' ? clamp(this.deathTimer/0.8,0,1) : 1;
    drawFighter(ctx, this.x-camX, screenY, this.facing, this.scale, pose, this.palette, this.hitFlash>0, alpha);
  }
}

class Boss extends Enemy {
  constructor(typeId, x, depth, isMini=false, flatHealthBonus=0) {
    const table = isMini ? MINIBOSS_TYPES : BOSS_TYPES;
    super('thug', x, depth); // placeholder init then override
    const def = table[typeId];
    this.def = { ...def, attackRange:56, aggroRange:800, attackCooldown:1.8, telegraph:0.55, windup:'heavy', knockbackRes:def.knockbackRes };
    this.typeId = typeId;
    this.isMini = isMini;
    this.maxHealth = def.health + flatHealthBonus;
    this.health = this.maxHealth;
    this.damage = def.damage;
    this.speed = def.speed;
    this.palette = def.palette;
    this.phase = 1;
    this.attackList = def.attacks;
    this.state='approach';
    this.stateTimer=0;
    this.attackCd = 1;
    this.hasToken = true;
    this.chargeVX = 0;
  }

  update(dt, player, game) {
    this.animTime += dt;
    if (this.hitFlash>0) this.hitFlash -= dt;
    if (this.slow.timer > 0) this.slow.timer -= dt;
    // Bosses shrug off freeze/stagger (handled by never being targeted with
    // them — see Game's elemental/limit-break hooks) but still burn & slow.
    if (this.burn.timer > 0) {
      this.burn.timer -= dt; this.burn.tick -= dt;
      if (this.burn.tick <= 0 && this.state!=='knockdown' && this.state!=='dead') {
        this.burn.tick = 0.5;
        this.health -= this.burn.dps;
        game.particles.burst(this.x, this.groundY-40, '#ff6a2f', 4, {minSpd:30,maxSpd:90,vScale:0.6,minLife:0.2,maxLife:0.4,minSize:2,maxSize:3});
      }
    }
    if (this.health <= this.maxHealth*0.5 && this.phase===1) {
      this.phase = 2;
      this.speed *= 1.25;
      game.announcePhase2 && game.announcePhase2(this);
    }
    this.vx = lerp(this.vx, 0, 0.08);
    this.x += this.vx*dt;
    if (this.state==='knockdown') {
      this.knockdownTimer -= dt;
      if (this.knockdownTimer<=0) { this.state='dead'; this.anim='defeat'; this.deathTimer=1.0; }
      return;
    }
    if (this.state==='dead') { this.deathTimer -= dt; if (this.deathTimer<=0) this.alive=false; return; }
    if (this.state==='hurt') { this.stateTimer -= dt; if (this.stateTimer<=0) this.state='position'; return; }

    this.faceTarget(player);
    const d = Math.abs(this.x-player.x);
    const spd = this.effSpeed;

    switch(this.state) {
      case 'approach':
      case 'position': {
        this.anim='walk';
        const desiredDepth = clamp(player.depth, 0, 1);
        this.depth = lerp(this.depth, desiredDepth, dt*1.2);
        const targetX = player.x - this.facing*70;
        const dx = targetX - this.x;
        if (Math.abs(dx)>8) this.x += Math.sign(dx)*spd*dt;
        if (this.attackCd<=0) { this.chooseAttack(); }
        break;
      }
      case 'telegraph': {
        this.stateTimer -= dt;
        if (this.stateTimer<=0) this.executeAttack(player, game);
        break;
      }
      case 'attack': {
        this.stateTimer -= dt;
        if (this.currentAttack==='charge') { this.x += this.chargeVX*dt; }
        if (this.stateTimer<=0) { this.state='position'; this.attackCd = this.phase===2?1.1:1.8; }
        break;
      }
      case 'wait': {
        this.stateTimer -= dt;
        if (this.stateTimer<=0) this.state='position';
        break;
      }
    }
    if (this.attackCd>0) this.attackCd -= dt;
  }

  chooseAttack() {
    this.currentAttack = choice(this.attackList);
    this.state = 'telegraph';
    this.stateTimer = this.phase===2 ? 0.32 : 0.5;
    const animMap = {
      charge:'punch2', slam:'heavy', combo:'punch1', projectile:'punch2', jumpattack:'jump',
      ground_pound:'heavy', missile_barrage:'special', teleport_strike:'dodge', volley:'special',
      turret_deploy:'punch2', wrecking_swing:'heavy',
    };
    this.anim = animMap[this.currentAttack]||'heavy';
    this.animTime = 0;
  }

  executeAttack(player, game) {
    this.state = 'attack';
    switch(this.currentAttack) {
      case 'charge':
        this.stateTimer = 0.45;
        this.chargeVX = this.facing * 480;
        game.shake(6);
        break;
      case 'slam':
        this.stateTimer = 0.3;
        game.shake(CONFIG.shake.boss);
        if (Math.abs(this.x-player.x) < 90 && Math.abs(this.depth-player.depth)<0.3) {
          player.takeDamage(this.damage*1.3, this.facing*220, game);
        }
        break;
      case 'combo':
        this.stateTimer = 0.6;
        if (Math.abs(this.x-player.x) < 80 && Math.abs(this.depth-player.depth)<0.25) {
          player.takeDamage(this.damage, this.facing*160, game);
        }
        break;
      case 'projectile':
        this.stateTimer = 0.3;
        game.spawnProjectile(this.x, this.depth, this.facing*300, this.damage, false, '#f5f');
        break;
      case 'jumpattack':
        this.stateTimer = 0.5;
        this.vz = -420;
        game.shake(8);
        break;

      // ---- Brute King exclusive ----
      case 'ground_pound':
        this.stateTimer = 0.5;
        game.shake(CONFIG.shake.boss);
        game.triggerExplosion(this.x, this.depth, this.damage*1.1, 130, '#f92', false, true);
        break;

      // ---- Iron Matron exclusive ----
      case 'missile_barrage':
        this.stateTimer = 0.5;
        for (let i=-1;i<=1;i++) {
          game.spawnProjectile(this.x, clamp(this.depth+i*0.12,0,1), this.facing*(280+i*30), this.damage*0.7, false, '#c6f');
        }
        break;

      // ---- Neon Reaper exclusive ----
      case 'teleport_strike': {
        this.stateTimer = 0.5;
        game.particles.burst(this.x, this.groundY-40, '#ff2fdc', 16, {minSpd:100,maxSpd:280,vScale:0.5,minLife:0.2,maxLife:0.4});
        this.x = player.x - this.facing*55;
        this.depth = player.depth;
        game.particles.burst(this.x, this.groundY-40, '#ff2fdc', 20, {minSpd:120,maxSpd:320,vScale:0.5,minLife:0.25,maxLife:0.45});
        game.shake(CONFIG.shake.heavy);
        if (Math.abs(this.x-player.x) < 90 && Math.abs(this.depth-player.depth)<0.3) {
          player.takeDamage(this.damage*1.2, this.facing*240, game);
        }
        break;
      }
      case 'volley':
        this.stateTimer = 0.5;
        for (let i=0;i<3;i++) {
          game.spawnProjectile(this.x, clamp(this.depth+(i-1)*0.1,0,1), this.facing*(340+i*20), this.damage*0.55, false, '#ff2fdc');
        }
        break;

      // ---- The Mechanic exclusive ----
      case 'turret_deploy':
        this.stateTimer = 0.5;
        game.spawnTurret(this.x - this.facing*90, clamp(this.depth + (Math.random()<0.5?-0.2:0.2), 0, 1));
        break;
      case 'wrecking_swing':
        this.stateTimer = 0.5;
        game.shake(CONFIG.shake.boss);
        if (Math.abs(this.x-player.x) < 100 && Math.abs(this.depth-player.depth)<0.3) {
          player.takeDamage(this.damage*1.5, this.facing*320, game);
        }
        break;

      default:
        this.stateTimer = 0.4;
    }
  }

  takeDamage(amount, kbx, game) {
    if (this.state === 'knockdown' || this.state === 'dead') return;
    this.health -= amount;
    this.hitFlash = 0.1;
    game.particles.blood(this.x, this.groundY-40);
    game.particles.impact(this.x, this.groundY-40);
    game.shake(CONFIG.shake.light);
    if (this.health <= 0) {
      this.health = 0;
      this.state='knockdown'; this.anim='knockdown'; this.knockdownTimer=1.2;
    } else if (this.state!=='attack' && this.state!=='telegraph') {
      this.state='hurt'; this.stateTimer=0.12; this.anim='hurt';
    }
  }

  draw(ctx, camX) {
    const pose = getPose(this.anim, (this.animTime%1), this.facing);
    const screenY = this.groundY + this.z;
    const screenX = this.x - camX;
    const alpha = this.state==='dead' ? clamp(this.deathTimer/1.0,0,1) : 1;
    // Neon Reaper: trailing motion-streak echoes to sell its speed
    if (this.typeId === 'neon_reaper' && (this.state==='attack' || this.currentAttack==='charge')) {
      for (let i=1;i<=2;i++) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.18 / i;
        drawFighter(ctx, screenX - this.facing*this.vx*0.01*i, screenY, this.facing, this.scale*1.35, pose, this.palette, false, 1);
        ctx.restore();
      }
    }
    ctx.save();
    drawFighter(ctx, screenX, screenY, this.facing, this.scale*1.35, pose, this.palette, this.hitFlash>0, alpha);
    ctx.restore();
    this.drawBossExtras(ctx, screenX, screenY);
    if (this.state==='telegraph') {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(this.animTime*30)*0.3;
      ctx.fillStyle = this.palette.accent || '#ff2f2f';
      ctx.beginPath();
      ctx.arc(screenX, screenY-40, 34, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Small extra silhouette elements unique to each boss, drawn on top of
  // the shared drawFighter rig so every boss reads as distinct beyond
  // just palette/build (already handled), not just its attack list.
  drawBossExtras(ctx, screenX, screenY) {
    const s = this.scale*1.35;
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.scale(s*this.facing, s);
    switch (this.typeId) {
      case 'brute_king': {
        // spiked mane across the shoulders
        ctx.fillStyle = shadeColor(this.palette.accent, -10);
        for (let i=-2;i<=2;i++) {
          const bx = i*7;
          ctx.beginPath();
          ctx.moveTo(bx-3, -40); ctx.lineTo(bx, -52); ctx.lineTo(bx+3, -40);
          ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'iron_matron': {
        // mechanical shoulder cannon on the back
        drawRect(ctx, -22, -46, 12, 20, shadeColor(this.palette.shirt, -20), true);
        drawRect(ctx, -20, -50, 8, 6, this.palette.accent, true);
        break;
      }
      case 'the_mechanic': {
        // fuel-tank backpack with a small vent pipe
        drawRect(ctx, -18, -44, 14, 24, '#555', true);
        drawRect(ctx, -15, -50, 6, 8, '#333', true);
        ctx.globalAlpha = 0.4 + 0.3*Math.sin(this.animTime*10);
        ctx.fillStyle = this.palette.accent;
        drawRect(ctx, -13, -52, 2, 4, this.palette.accent);
        ctx.globalAlpha = 1;
        break;
      }
      case 'twin_thug': {
        // spiked knuckle wraps
        drawRect(ctx, 8, -6, 6, 4, '#ccc', true);
        drawRect(ctx, -14, -6, 6, 4, '#ccc', true);
        break;
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------
// STAGE MANAGER — builds one stage: encounters along the scrolling
// street, environment decorations, destructibles, and camera locking.
// ---------------------------------------------------------------------
class StageManager {
  constructor(game, stageDef) {
    this.game = game;
    this.stageDef = stageDef; // {theme, length, encounters:[...], isBoss, isMini}
    this.theme = THEMES[stageDef.theme];
    this.modifier = THEME_MODIFIERS[stageDef.theme] || null;
    this.camX = 0;
    this.length = stageDef.length;
    this.locked = false;
    this.encounters = stageDef.encounters.map(e => ({ ...e, triggered:false, cleared:false }));
    this.destructibles = [];
    this.weapons = [];
    this.pickups = [];
    this.projectiles = [];
    this.enemies = [];
    this.hazards = []; // Speed tree's Afterimage: brief damaging zones
    this.envHazards = []; // per-theme "minor gameplay" telegraphed zones
    this.modTimer = this.modifier && this.modifier.type==='zoneHazard' ? rand(1.5, 3) : 0;
    this.activeEncounter = null;
    this.goBannerTimer = 0;
    this.time = 0;
    this.spawnDestructibles();
  }

  spawnDestructibles() {
    const count = randInt(5, 9);
    for (let i=0;i<count;i++) {
      const kind = choice(['crate','barrel','bin']);
      this.destructibles.push(new Destructible(kind, rand(160, this.length-200), rand(0.15,0.9)));
    }
  }

  // Per-theme "minor gameplay" gimmick — see THEME_MODIFIERS. Overlay-type
  // modifiers (nightclub/docks) are pure rendering and handled in Game's
  // render pass instead; walkway/zoneHazard actually touch gameplay here.
  updateThemeModifier(dt, player, game) {
    const mod = this.modifier;
    if (!mod || this.locked) return; // hold off during locked encounters so hazards don't pile onto a fight
    if (mod.type === 'zoneHazard') {
      this.modTimer -= dt;
      if (this.modTimer <= 0) {
        this.modTimer = rand(mod.interval[0], mod.interval[1]);
        // Spawn ahead by roughly what the player covers during the
        // telegraph window, so it's reliably reachable rather than
        // landing somewhere they've already passed or won't get to.
        const x = clamp(player.x + rand(70, 260), 60, this.length-60);
        const depth = rand(0.15, 0.9);
        this.envHazards.push({ x, depth, mod, timer: mod.telegraph, phase:'telegraph' });
      }
      for (const hz of this.envHazards) {
        if (hz.phase === 'telegraph') {
          hz.timer -= dt;
          if (hz.timer <= 0) { hz.phase='active'; hz.timer=0.25; this.triggerZoneEffect(hz, player, game); }
        } else if (hz.phase === 'active') {
          hz.timer -= dt;
          if (hz.timer <= 0) hz.phase = 'done';
        }
      }
      this.envHazards = this.envHazards.filter(h => h.phase !== 'done');
    } else if (mod.type === 'walkway') {
      // Repeating floor bands that passively slide the player forward.
      const bandSpacing = 420, bandWidth = 160;
      const posInCycle = ((player.x % bandSpacing) + bandSpacing) % bandSpacing;
      if (posInCycle < bandWidth) player.x += 70*dt;
    }
  }

  triggerZoneEffect(hz, player, game) {
    const mod = hz.mod;
    const inRange = dist(hz.x,0,player.x,0) < mod.radius && Math.abs(hz.depth-player.depth) < 0.35;
    if (mod.effect === 'spawnCrate') {
      this.destructibles.push(new Destructible('crate', hz.x, hz.depth));
      game.particles.dust(hz.x, depthToScreenY(hz.depth));
      if (inRange) player.takeDamage(mod.damage, 0, game);
      return;
    }
    if (!inRange) return;
    switch (mod.effect) {
      case 'damage':
        player.takeDamage(mod.damage, (player.x>=hz.x?1:-1)*140, game);
        break;
      case 'push':
        player.x += (player.x>=hz.x?1:-1) * 90;
        game.shake(4);
        break;
      case 'launch':
        player.vz = -420; player.state='jump'; player.anim='jump'; player.animTime=0; player.grounded=false;
        break;
      case 'slow':
        player.takeDamage(mod.damage, 0, game);
        player.envSlowTimer = Math.max(player.envSlowTimer, 1.5);
        break;
    }
    game.particles.impact(player.x, player.groundY-30);
  }

  drawEnvHazards(ctx) {
    for (const hz of this.envHazards) {
      const y = depthToScreenY(hz.depth);
      const s = depthToScale(hz.depth);
      ctx.save();
      ctx.translate(hz.x-this.camX, y);
      if (hz.phase === 'telegraph') {
        const pulse = 0.35 + 0.35*Math.sin(this.time*14);
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = hz.mod.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 2, hz.mod.radius*0.7*s, hz.mod.radius*0.28*s, 0, 0, Math.PI*2); ctx.stroke();
        ctx.lineWidth = 1;
      } else {
        ctx.globalAlpha = clamp(hz.timer/0.25, 0, 1) * 0.6;
        ctx.fillStyle = hz.mod.color;
        ctx.beginPath(); ctx.ellipse(0, 2, hz.mod.radius*0.85*s, hz.mod.radius*0.35*s, 0, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  update(dt, player, game) {
    this.time += dt;
    this.updateThemeModifier(dt, player, game);
    // camera follows player unless locked by an active encounter
    if (!this.locked) {
      const targetCam = clamp(player.x - 260, 0, Math.max(0, this.length - CONFIG.canvasW));
      this.camX = lerp(this.camX, targetCam, dt*CONFIG.cameraCatchup);
      // clamp player to not exceed camera view too far right
      const maxX = this.camX + CONFIG.canvasW - 60;
      if (player.x > maxX) player.x = maxX;
    }
    const minX = this.camX + 20;
    if (player.x < minX) player.x = minX;
    if (this.locked) {
      const lockedMaxX = this.camX + CONFIG.canvasW - 40;
      if (player.x > lockedMaxX) player.x = lockedMaxX;
    }
    player.x = clamp(player.x, 20, this.length-20);

    // check encounters — only ever trigger the NEXT encounter once the
    // current one is fully resolved and the camera is unlocked. Without
    // this guard, walking around inside a locked encounter's screen
    // space can cross a later trigger point and spawn a second wave
    // whose enemies land outside the frozen camera bounds, unreachable
    // forever — which is what caused stages to get stuck "locked".
    if (!this.locked) {
      for (const enc of this.encounters) {
        if (!enc.triggered && player.x >= enc.triggerX) {
          this.triggerEncounter(enc, game);
          break;
        }
      }
    }

    if (this.activeEncounter && !this.activeEncounter.cleared) {
      const aliveEnemies = this.enemies.filter(e => e.alive && e.state !== 'dead');
      if (aliveEnemies.length === 0 && this.enemies.length>0) {
        this.activeEncounter.cleared = true;
        this.locked = false;
        this.goBannerTimer = 1.4;
        game.showGoBanner();
      }
      this.assignAttackTokens();
    }

    // update enemies
    for (const e of this.enemies) if (e.alive) e.update(dt, player, game);
    this.enemies = this.enemies.filter(e => e.alive);

    // update destructibles (fade)
    for (const d of this.destructibles) if (d.hitFlash>0) d.hitFlash -= dt;

    // weapons / pickups bob & lifetime
    for (const p of this.pickups) { p.bob += dt*4; p.life -= dt; if (p.life<=0) p.alive=false; }
    this.pickups = this.pickups.filter(p=>p.alive);
    for (const w of this.weapons) w.bob += dt*4;

    // projectiles
    for (const pr of this.projectiles) {
      pr.x += pr.vx*dt; pr.life -= dt;
      if (pr.life<=0) {
        pr.alive=false;
        if (pr.isBomb) game.triggerExplosion(pr.x, pr.depth, pr.damage, 62, '#ff8f2f', false, true);
      }
      if (pr.fromPlayer) {
        for (const e of this.enemies) {
          if (!e.alive || e.state==='dead') continue;
          if (Math.abs(e.x-pr.x)<20 && Math.abs(e.depth-pr.depth)<0.15) {
            e.takeDamage(pr.damage, Math.sign(pr.vx)*80, game);
            pr.alive=false; break;
          }
        }
      } else if (pr.isBomb) {
        if (Math.abs(player.x-pr.x)<40 && Math.abs(player.depth-pr.depth)<0.2) {
          pr.alive=false;
          game.triggerExplosion(pr.x, pr.depth, pr.damage, 62, '#ff8f2f', false, true);
        }
      } else {
        if (Math.abs(player.x-pr.x)<24 && Math.abs(player.depth-pr.depth)<0.16) {
          player.takeDamage(pr.damage, Math.sign(pr.vx)*80, game);
          pr.alive=false;
        }
      }
    }
    this.projectiles = this.projectiles.filter(p=>p.alive);

    // afterimage hazards (Speed tree)
    for (const hz of this.hazards) {
      hz.life -= dt;
      if (hz.life <= 0) { hz.alive = false; continue; }
      for (const e of this.enemies) {
        if (!e.alive || e.state==='dead' || hz.hitSet.has(e.id)) continue;
        if (Math.abs(e.x-hz.x)<26 && Math.abs(e.depth-hz.depth)<0.16) {
          hz.hitSet.add(e.id);
          e.takeDamage(hz.damage, Math.sign(e.x-hz.x||1)*60, game);
          game.particles.impact(e.x, e.groundY-30);
          if (e.health<=0) game.onEnemyDefeated(e);
        }
      }
    }
    this.hazards = this.hazards.filter(h=>h.alive);

    if (this.goBannerTimer>0) this.goBannerTimer -= dt;

    // pickup collection
    for (const p of this.pickups) {
      if (Math.abs(p.x-player.x)<30 && Math.abs(p.depth-player.depth)<0.18) {
        if (p.kind==='health') { player.health = Math.min(player.maxHealth, player.health + player.maxHealth*0.25 + (player.healBonusFlat||0)); }
        p.alive=false;
      }
    }
    this.pickups = this.pickups.filter(p=>p.alive);
    for (const w of this.weapons) {
      if (w.pickedUp) continue;
      if (Math.abs(w.x-player.x)<28 && Math.abs(w.depth-player.depth)<0.18) {
        player.weapon = w.type;
        const baseDur = WEAPON_TYPES[w.type].durability;
        const durMult = (player.abilities.carefulHands ? 1.5 : 1) * (player.weaponDurabilityMult||1);
        game.currentWeaponDurability = Math.round(baseDur * durMult);
        w.pickedUp = true; w.alive=false;
      }
    }
    this.weapons = this.weapons.filter(w=>w.alive);
  }

  assignAttackTokens() {
    const active = this.enemies.filter(e=>e.alive && e.state!=='dead' && e.state!=='knockdown');
    const withToken = active.filter(e=>e.hasToken);
    const maxTokens = active.length > 3 ? 2 : 1;
    if (withToken.length < maxTokens) {
      const candidates = active.filter(e=>!e.hasToken && (e.state==='wait'||e.state==='position'||e.state==='approach'));
      const need = maxTokens - withToken.length;
      for (let i=0;i<need && i<candidates.length;i++) {
        choice(candidates).hasToken = true;
      }
    }
  }

  triggerEncounter(enc, game) {
    enc.triggered = true;
    this.locked = true;
    this.activeEncounter = enc;
    if (enc.isBoss) {
      const typeId = choice(Object.keys(BOSS_TYPES));
      const boss = new Boss(typeId, this.camX + CONFIG.canvasW*0.75, 0.5, false, game.difficultyBossHealthBonus);
      this.enemies.push(boss);
      game.activeBoss = boss;
      game.showBossBanner && game.showBossBanner(boss.def.name);
      return;
    }
    if (enc.isMiniboss) {
      const typeId = choice(Object.keys(MINIBOSS_TYPES));
      const boss = new Boss(typeId, this.camX + CONFIG.canvasW*0.75, 0.5, true, game.difficultyBossHealthBonus);
      this.enemies.push(boss);
      game.activeBoss = boss;
      game.showBossBanner && game.showBossBanner(boss.def.name);
      return;
    }
    for (const spawn of enc.spawns) {
      const scaleFactor = ENEMY_TYPES[spawn.type].scaleMod || 1;
      const x = player_spawn_x(this, spawn, enc);
      const en = new Enemy(spawn.type, x, spawn.depth!==undefined?spawn.depth:rand(0.2,0.85), scaleFactor, game.difficultyHealthBonus);
      en.damage *= game.difficultyDamageMult;
      this.enemies.push(en);
    }
  }

  spawnDropFrom(x, depth, kind, allowExtraWeapons, meta) {
    if (kind==='health') this.pickups.push(new Pickup('health', x, depth));
    else if (kind==='weapon') {
      const pool = Object.keys(WEAPON_TYPES).filter(id =>
        (allowExtraWeapons || !WEAPON_TYPES[id].extra) && isWeaponUnlocked(id, meta));
      if (pool.length === 0) return; // nothing unlocked yet — no drop
      const wt = choice(pool);
      this.weapons.push(new Weapon(wt, x, depth));
    }
  }

  draw(ctx) {
    // sky gradient
    const grad = ctx.createLinearGradient(0,0,0,CONFIG.streetTop);
    grad.addColorStop(0, this.theme.sky[0]);
    grad.addColorStop(1, this.theme.sky[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,CONFIG.canvasW, CONFIG.streetTop);
    this.theme.deco(ctx, CONFIG.canvasW, CONFIG.canvasH, this.camX, this.time);
    // ground
    const groundGrad = ctx.createLinearGradient(0, CONFIG.streetTop-10, 0, CONFIG.canvasH);
    groundGrad.addColorStop(0, shadeColor(this.theme.ground, 12));
    groundGrad.addColorStop(1, shadeColor(this.theme.ground, -18));
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, CONFIG.streetTop-10, CONFIG.canvasW, CONFIG.canvasH-CONFIG.streetTop+10);
    if (this.theme.groundDeco) this.theme.groundDeco(ctx, CONFIG.canvasW, CONFIG.canvasH, this.camX, this.time);
    // depth lines
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = this.theme.accent;
    for (let i=0;i<5;i++) {
      const y = depthToScreenY(i/4);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CONFIG.canvasW,y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.drawAmbientMotes(ctx);
    this.drawVignette(ctx);
  }

  // Slow-drifting dust/ember motes tinted with the theme's accent color —
  // applied to every theme uniformly for a bit of atmospheric depth
  // without needing bespoke particle code per stage.
  drawAmbientMotes(ctx) {
    ctx.save();
    for (let i=0;i<22;i++) {
      const seed = prand(i*7.3);
      const baseX = seed * (this.length + 400) - this.camX*0.6;
      const driftX = Math.sin(this.time*0.4 + i) * 14;
      const x = ((baseX + driftX) % (CONFIG.canvasW + 80)) - 40;
      const y = 60 + prand(i*3.1)*(CONFIG.streetTop-40) + Math.sin(this.time*0.6+i*2)*8;
      const flicker = 0.15 + 0.15*Math.sin(this.time*2 + i*3);
      ctx.globalAlpha = Math.max(0, flicker);
      ctx.fillStyle = this.theme.accent;
      const size = 1 + (i%3===0 ? 1 : 0);
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    }
    ctx.restore();
  }

  // A very light vignette for depth — skipped when a strong overlay
  // modifier (nightclub's spotlight, docks' fog) is already darkening
  // the scene, so the two effects don't stack into mush.
  drawVignette(ctx) {
    if (this.modifier && this.modifier.type === 'overlay') return;
    ctx.save();
    const grad = ctx.createRadialGradient(
      CONFIG.canvasW/2, CONFIG.canvasH/2, CONFIG.canvasH*0.35,
      CONFIG.canvasW/2, CONFIG.canvasH/2, CONFIG.canvasH*0.85
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,CONFIG.canvasW,CONFIG.canvasH);
    ctx.restore();
  }

  drawEntitiesSorted(ctx, player) {
    const all = [...this.destructibles.filter(d=>d.alive), ...this.enemies, player];
    all.sort((a,b)=> (a.depth - b.depth) || 0);
    for (const hz of this.hazards) this.drawHazard(ctx, hz);
    for (const ent of all) {
      if (ent instanceof Destructible) this.drawDestructible(ctx, ent);
      else ent.draw(ctx, this.camX);
    }
    for (const w of this.weapons) if (!w.pickedUp) this.drawWeaponPickup(ctx, w);
    for (const p of this.pickups) this.drawPickup(ctx, p);
    for (const pr of this.projectiles) this.drawProjectile(ctx, pr);
  }

  drawHazard(ctx, hz) {
    const y = depthToScreenY(hz.depth);
    const s = depthToScale(hz.depth);
    ctx.save();
    ctx.globalAlpha = clamp(hz.life/hz.maxLife, 0, 1) * 0.5;
    ctx.fillStyle = '#4ff0ff';
    ctx.shadowColor = '#4ff0ff'; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(hz.x-this.camX, y-24, 16*s, 30*s, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  drawDestructible(ctx, d) {
    const y = depthToScreenY(d.depth);
    const s = depthToScale(d.depth);
    const flash = d.hitFlash>0;
    ctx.save();
    ctx.translate(d.x-this.camX, y);
    ctx.scale(s,s);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 2, 15, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    const colors = { crate:'#a87d4a', barrel:'#7a8a3a', bin:'#556677' };
    const base = flash?'#fff':colors[d.kind];
    if (d.kind === 'crate') {
      drawRect(ctx, -13, -25, 26, 25, base, true);
      drawRect(ctx, -13, -25, 26, 4, flash?'#fff':shadeColor(base,25));
      drawRect(ctx, -13, -4, 26, 4, flash?'#fff':shadeColor(base,-25));
      ctx.strokeStyle = flash?'#fff':'rgba(0,0,0,0.4)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(-13,-25); ctx.lineTo(13,-1); ctx.moveTo(13,-25); ctx.lineTo(-13,-1); ctx.stroke();
    } else if (d.kind === 'barrel') {
      drawRect(ctx, -11, -26, 22, 26, base, true);
      drawRect(ctx, -11, -26, 22, 4, flash?'#fff':shadeColor(base,20), true);
      drawRect(ctx, -11, -14, 22, 3, flash?'#fff':shadeColor(base,-20));
      drawRect(ctx, -11, -6, 22, 3, flash?'#fff':shadeColor(base,-20));
      drawRect(ctx, 4, -26, 3, 26, flash?'#fff':shadeColor(base,-30));
    } else {
      drawRect(ctx, -12, -22, 24, 22, base, true);
      drawRect(ctx, -13, -26, 26, 6, flash?'#fff':shadeColor(base,15), true);
      drawRect(ctx, 5, -22, 3, 22, flash?'#fff':shadeColor(base,-25));
    }
    ctx.restore();
  }

  drawWeaponPickup(ctx, w) {
    const y = depthToScreenY(w.depth) - 10 - Math.sin(w.bob)*4;
    const s = depthToScale(w.depth);
    const def = WEAPON_TYPES[w.type];
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(w.x-this.camX, depthToScreenY(w.depth)+2, 12, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(w.x-this.camX, y);
    ctx.scale(s,s);
    ctx.save();
    ctx.rotate(Math.sin(w.bob*0.5)*0.15);
    drawRect(ctx,-3,-14,6,28,def.color,true);
    drawRect(ctx,-3,-14,2,28,shadeColor(def.color,25));
    drawRect(ctx,-1,10,2,6,'#3a2a1a');
    ctx.restore();
    // soft glow ring to signal "pick me up"
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = def.color; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(0, 14, 14, 5, 0, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  drawPickup(ctx, p) {
    const y = depthToScreenY(p.depth) - 10 - Math.sin(p.bob)*4;
    const s = depthToScale(p.depth);
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(p.x-this.camX, depthToScreenY(p.depth)+2, 10, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(p.x-this.camX, y);
    ctx.scale(s,s);
    ctx.globalAlpha = 0.4 + 0.15*Math.sin(this.time*4);
    ctx.fillStyle = '#ff3366';
    ctx.beginPath(); ctx.ellipse(0,4,13,13,0,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    drawRect(ctx,-8,-8,16,16,'#ff3366',true);
    drawRect(ctx,-8,-8,16,4,shadeColor('#ff3366',25));
    drawRect(ctx,-2,-6,4,12,'#fff');
    drawRect(ctx,-6,-2,12,4,'#fff');
    ctx.restore();
  }
  drawProjectile(ctx, pr) {
    const y = depthToScreenY(pr.depth);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pr.color;
    ctx.beginPath(); ctx.ellipse(pr.x-this.camX-pr.vx*0.01, y-36, 7, 2.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pr.color;
    ctx.shadowColor = pr.color; ctx.shadowBlur=10;
    ctx.beginPath();
    ctx.arc(pr.x-this.camX, y-36, 5, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(pr.x-this.camX-1, y-37, 2, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

function player_spawn_x(stage, spawn, enc) {
  return clamp(enc.triggerX + 260 + (spawn.xOff||0), 40, stage.length-40);
}

// ---------------------------------------------------------------------
// RUN MANAGER — builds the sequence of stages for a run.
// ---------------------------------------------------------------------
function buildEncounter(triggerX, count, pool, opts={}) {
  const spawns = [];
  for (let i=0;i<count;i++) {
    spawns.push({ type: choice(pool), depth: rand(0.15,0.9), xOff: rand(-40,120) });
  }
  return { triggerX, spawns, ...opts };
}

function generateStage(stageIndex, theme) {
  const length = 1500 + stageIndex*120;
  // A run only ever calls generateStage with stageIndex 0-3 (the 4 real
  // "Stage N" slots — miniboss/boss are separate). Tiers below map to
  // those 4 slots directly (no /2 compression) so every tier — and every
  // enemy type — is actually reachable across a run, not just the first
  // two. The hardest tier lands on Stage 4, right before the boss.
  const encCount = clamp(2 + stageIndex, 2, 4);
  // Each tier's pool is plain (uniform-random, with replacement) — a type
  // listed more than once is proportionally more likely to be picked, so
  // 'enforcer' (a deliberately rare late-game elite) only appears once
  // against 8 other entries rather than getting a full equal share.
  const pools = [
    ['thug','runner'],
    ['thug','runner','kickboxer','acrobat'],
    ['thug','bruiser','kickboxer','runner','shielded','ranged'],
    ['bruiser','grappler','ranged','runner','kickboxer','shielded','acrobat','bomber','enforcer'],
  ];
  const pool = pools[Math.min(pools.length-1, stageIndex)];
  const encounters = [];
  for (let i=0;i<encCount;i++) {
    const triggerX = 380 + i*((length-500)/encCount);
    const count = clamp(2 + stageIndex + randInt(0,1), 2, 5);
    encounters.push(buildEncounter(triggerX, count, pool));
  }
  return { theme, length, encounters, kind:'stage' };
}

function generateMiniboss(stageIndex, theme) {
  const length = 1100;
  return { theme, length, encounters:[ { triggerX:450, spawns:[{type:'thug',depth:0.5,xOff:0}], isMiniboss:true } ], kind:'miniboss' };
}
function generateBossStage(stageIndex, theme) {
  const length = 1200;
  return { theme, length, encounters:[ { triggerX:450, spawns:[{type:'thug',depth:0.5,xOff:0}], isBoss:true } ], kind:'boss' };
}

function buildRun() {
  // The run keeps one theme for everything up through Stage 4, then
  // switches to a different theme for the Boss stage — a clear visual
  // "final stretch" beat rather than a random theme every single stage.
  const themeKeys = Object.keys(THEMES);
  const mainTheme = choice(themeKeys);
  const bossTheme = choice(themeKeys.filter(t => t !== mainTheme));

  // STAGE 1 -> STAGE 2 -> MINIBOSS -> STAGE 3 -> STAGE 4 -> BOSS
  const plan = [];
  plan.push(generateStage(0, mainTheme));
  plan.push(generateStage(1, mainTheme));
  plan.push(generateMiniboss(2, mainTheme));
  plan.push(generateStage(2, mainTheme));
  plan.push(generateStage(3, mainTheme));
  plan.push(generateBossStage(4, bossTheme));
  return plan;
}

// ---------------------------------------------------------------------
// GAME — main state machine & loop
// ---------------------------------------------------------------------
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.input = new InputManager();
    this.touch = new TouchControls(this.input);
    this.particles = new ParticleSystem();
    this.setupResize();
    this.state = 'menu'; // menu, how, charselect, playing, upgrade, gameover
    this.lastTime = performance.now();
    this.shakeAmount = 0;
    this.hitstopTimer = 0;
    this.difficultyHealthBonus = 0;
    this.difficultyBossHealthBonus = 0;
    this.difficultyDamageMult = 1;
    this.currentWeaponDurability = 0;
    this.activeBoss = null;
    this.activeShadows = []; // Shadow Fighter legendary: brief translucent echo sprites
    this.selectedChar = 'ranger';
    this.meta = loadMetaProgress();
    this.questionsReady = false;
    this.charCardTime = 0;
    this.charCardEntries = [];
    this.bindUI();
    this.loadClassQuestions();
    requestAnimationFrame(this.loop.bind(this));
  }

  setupResize() {
    const resize = () => {
      const vv = window.visualViewport;
      const availW = vv ? vv.width : window.innerWidth;
      const availH = vv ? vv.height : window.innerHeight;
      const aspect = CONFIG.canvasW / CONFIG.canvasH;
      let w = availW, h = w / aspect;
      if (h > availH) { h = availH; w = h * aspect; }
      this.canvas.style.width = Math.floor(w) + 'px';
      this.canvas.style.height = Math.floor(h) + 'px';
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 100));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
      window.visualViewport.addEventListener('scroll', resize);
    }
  }

  bindUI() {
    document.getElementById('btnStart').onclick = () => this.goCharSelect();
    document.getElementById('btnConfirmChar').onclick = () => this.startRun();
    document.getElementById('btnMainMenu').onclick = () => this.showScreen('menuScreen');
    document.getElementById('btnMenuShop').onclick = () => this.openShopFrom('menuScreen');
    document.getElementById('btnOpenShop').onclick = () => this.openShopFrom('gameOverScreen');
    document.getElementById('btnShopBack').onclick = () => this.showScreen(this.shopReturnScreen || 'menuScreen');
    document.getElementById('btnBuildToggle').onclick = () => this.toggleBuildPanel();
    document.getElementById('btnBuildClose').onclick = () => this.closeBuildPanel();
    this.renderCharCards();
    this.updateCoinBadges();
    window.addEventListener('arcade-coins-changed', () => this.updateCoinBadges());
  }

  async loadClassQuestions() {
    const status = document.getElementById('classStatus');
    const start = document.getElementById('btnStart');
    start.disabled = true;
    const result = await window.QuestionManager?.loadCurrentBank('multichoice');
    this.questionsReady = !!result?.ok;
    if (this.questionsReady) {
      status.textContent = `Class questions ready: ${QuestionManager.getBankName()}`;
      start.disabled = false;
    } else {
      status.textContent = result?.error === 'class-code-required'
        ? 'Please enter your class code on the Arcade Academy Hub.'
        : 'This class does not have compatible questions for this game.';
    }
  }

  // ---- Run Build Display: a pause-and-view panel (button or "B") ----
  toggleBuildPanel() { this.buildPanelOpen ? this.closeBuildPanel() : this.openBuildPanel(); }
  openBuildPanel() {
    if (this.state !== 'playing') return;
    this.buildPanelOpen = true;
    this.renderBuildPanel();
    document.getElementById('buildScreen').classList.remove('hidden');
  }
  closeBuildPanel() {
    this.buildPanelOpen = false;
    document.getElementById('buildScreen').classList.add('hidden');
  }

  renderBuildPanel() {
    const wrap = document.getElementById('buildContent');
    wrap.innerHTML = '';
    const p = this.player;
    let anyOwned = false;

    for (const treeKey in UPGRADE_TREES) {
      const tree = UPGRADE_TREES[treeKey];
      const level = p.treeLevel[treeKey]||0;
      if (level === 0) continue;
      anyOwned = true;
      const owned = tree.levels.filter(l => l.level <= level);
      const block = document.createElement('div');
      block.className = 'buildTreeBlock';
      block.innerHTML = `<h4 style="color:${tree.color};">${tree.icon} ${tree.name.toUpperCase()}</h4>` +
        `<ul>${owned.map(l=>`<li>${l.name}</li>`).join('')}</ul>`;
      wrap.appendChild(block);
    }

    if ((p.treeLevel.elemental||0) > 0) {
      anyOwned = true;
      const branch = p.element ? ELEMENT_BRANCHES[p.element] : null;
      const items = ['Elemental Fist'];
      if (branch) items.push(...branch.levels.filter(l => l.level <= p.elementLevel).map(l=>l.name));
      const block = document.createElement('div');
      block.className = 'buildTreeBlock';
      block.innerHTML = `<h4 style="color:${branch?branch.color:'#fff'};">${branch?branch.icon:'✨'} ${branch?branch.name.toUpperCase():'ELEMENTAL'}</h4>` +
        `<ul>${items.map(n=>`<li>${n}</li>`).join('')}</ul>`;
      wrap.appendChild(block);
    }

    if (p.legendaries.size > 0) {
      anyOwned = true;
      const names = [...p.legendaries].map(id => (LEGENDARY_UPGRADES.find(l=>l.id===id)||{}).name).filter(Boolean);
      const block = document.createElement('div');
      block.className = 'buildTreeBlock';
      block.innerHTML = `<h4 style="color:#ffce2f;">⭐ LEGENDARY</h4><ul>${names.map(n=>`<li>${n}</li>`).join('')}</ul>`;
      wrap.appendChild(block);
    }

    if (p.synergiesUnlocked.size > 0) {
      anyOwned = true;
      const names = [...p.synergiesUnlocked].map(id => (SYNERGIES.find(s=>s.id===id)||{}).name).filter(Boolean);
      const block = document.createElement('div');
      block.className = 'buildTreeBlock';
      block.innerHTML = `<h4 style="color:#ff2f92;">🔗 SYNERGIES</h4><ul>${names.map(n=>`<li>${n}</li>`).join('')}</ul>`;
      wrap.appendChild(block);
    }

    if (!anyOwned) {
      wrap.innerHTML = '<div class="buildEmpty">No upgrades yet — clear a stage to pick your first one.</div>';
    }
  }

  showScreen(id) {
    for (const s of ['menuScreen','charScreen','quizScreen','upgradeScreen','gameOverScreen','shopScreen']) {
      document.getElementById(s).classList.toggle('hidden', s!==id);
    }
    if (id === 'menuScreen') this.updateCoinBadges();
    if (id === 'shopScreen') this.renderShop();
  }

  openShopFrom(returnId) {
    this.shopReturnScreen = returnId;
    if (!this.currentShopTab) this.currentShopTab = SHOP_TABS[0].id;
    this.showScreen('shopScreen');
  }

  // 6-tab full-screen shop: spends coins banked from kills (see endRun)
  // across every run on permanent bonuses applied in the Player
  // constructor, or on flags read directly by combat code at runtime.
  renderShop() {
    this.meta.coins = window.PlatformManager?.getCoins() ?? this.meta.coins;
    document.getElementById('shopCoinCount').textContent = this.meta.coins;
    this.renderShopTabs();
    this.renderShopBody();
  }

  renderShopTabs() {
    const wrap = document.getElementById('shopTabs');
    wrap.innerHTML = '';
    for (const tab of SHOP_TABS) {
      const btn = document.createElement('button');
      btn.className = 'shop-tab-btn' + (this.currentShopTab===tab.id ? ' active' : '');
      btn.textContent = tab.name.toUpperCase();
      btn.onclick = () => { this.currentShopTab = tab.id; this.renderShop(); };
      wrap.appendChild(btn);
    }
  }

  renderShopBody() {
    const wrap = document.getElementById('shopBody');
    wrap.innerHTML = '';
    const tab = SHOP_TABS.find(t => t.id === this.currentShopTab) || SHOP_TABS[0];
    if(tab.id==='cosmetics'){
      const rewards=window.AchievementManager?.getRewards?.({gameId:'rumbux-revision'}).filter(r=>r.owned)||[];
      if(!rewards.length){wrap.innerHTML='<div class="shopCard"><h4>NO COSMETICS UNLOCKED YET</h4><p>Earn Arcade Academy XP to unlock game cosmetics here.</p></div>';return;}
      rewards.forEach(reward=>{
        const card=document.createElement('div');card.className='shopCard'+(reward.equipped?' owned':'');
        card.innerHTML=`<h4>${reward.name}</h4><p>${reward.detail}</p>`;
        if(reward.secretGlobal||reward.type==='gameplay')card.insertAdjacentHTML('beforeend','<div class="shopLevel">ALWAYS ACTIVE</div>');
        else{const button=document.createElement('button');button.className='shopBuyBtn';button.textContent=reward.equipped?'DISABLE':'EQUIP';button.onclick=()=>{AchievementManager.equip(reward.id);this.renderShopBody()};card.appendChild(button)}
        wrap.appendChild(card);
      });
      return;
    }
    for (const item of tab.items) wrap.appendChild(this.buildShopCard(item));
  }

  buildShopCard(item) {
    const meta = this.meta;
    const locked = shopItemIsLocked(item, meta);
    const maxed = shopItemIsMaxed(item, meta);
    const owned = shopItemOwnedLevel(item, meta) > 0;
    const card = document.createElement('div');
    card.className = 'shopCard' + (maxed ? ' owned' : '') + (locked ? ' locked' : '');

    let levelHtml = '';
    if (item.type === 'leveled') levelHtml = `<div class="shopLevel">LEVEL ${shopItemOwnedLevel(item,meta)} / ${item.maxLevel}</div>`;
    else if (item.type === 'sequence') levelHtml = `<div class="shopLevel">${owned ? 'UNLOCKED' : 'TIER '+(item.chainIndex+1)}</div>`;
    else if (owned) levelHtml = `<div class="shopLevel">OWNED</div>`;

    let bodyHtml = `<h4>${item.name}</h4><p>${item.desc}</p>${levelHtml}`;
    if (item.control && owned) bodyHtml += `<div class="shopControlHint">CONTROL: ${item.control}</div>`;
    if (locked) bodyHtml += `<div class="shopLockedNote">Requires: ${SHOP_ITEMS_BY_ID[item.requires].name}</div>`;

    let btnHtml;
    if (locked) btnHtml = `<button class="shopBuyBtn" disabled>LOCKED</button>`;
    else if (maxed) btnHtml = `<button class="shopBuyBtn" disabled>${item.type==='leveled' ? 'MAXED' : 'OWNED'}</button>`;
    else {
      const cost = shopItemCost(item, meta);
      btnHtml = `<button class="shopBuyBtn" ${meta.coins<cost?'disabled':''}>BUY — 🪙 ${cost}</button>`;
    }
    card.innerHTML = bodyHtml + btnHtml;
    if (!locked && !maxed) card.querySelector('.shopBuyBtn').onclick = () => this.buyShopItem(item.id);
    return card;
  }

  buyShopItem(id) {
    const item = SHOP_ITEMS_BY_ID[id];
    const meta = this.meta;
    if (shopItemIsLocked(item, meta) || shopItemIsMaxed(item, meta)) return;
    const cost = shopItemCost(item, meta);
    if (window.PlatformManager ? !PlatformManager.spendCoins(cost) : meta.coins < cost) return;
    if (!window.PlatformManager) meta.coins -= cost;
    else meta.coins = PlatformManager.getCoins();
    meta.shop[id] = item.type === 'leveled' ? (meta.shop[id]||0) + 1 : 1;
    saveMetaProgress(meta);
    this.renderShop();
    this.updateCoinBadges();
  }

  updateCoinBadges() {
    this.meta.coins = window.PlatformManager?.getCoins() ?? this.meta.coins;
    const menuEl = document.getElementById('menuCoinCount');
    const shopEl = document.getElementById('shopCoinCount');
    if (menuEl) menuEl.textContent = this.meta.coins;
    if (shopEl) shopEl.textContent = this.meta.coins;
    const scoreEl = document.getElementById('menuScoreCount');
    if (scoreEl) scoreEl.textContent = this.meta.highScore||0;
    const qEl = document.getElementById('menuQuestionsCount');
    if (qEl) qEl.textContent = this.meta.questionsCorrect||0;
  }

  renderCharCards() {
    const wrap = document.getElementById('charCards');
    wrap.innerHTML = '';
    this.charCardEntries = [];
    for (const key in CHARACTERS) {
      const c = CHARACTERS[key];
      const isLocked = c.locked && !(this.meta.shop[c.shopId]);
      const card = document.createElement('div');
      card.className = 'charCard' + (isLocked ? ' locked' : '');
      card.style.cursor = 'pointer';
      card.style.outline = key===this.selectedChar ? '3px solid #ff2f92' : 'none';

      const canvas = document.createElement('canvas');
      canvas.className = 'charSpriteCanvas';
      canvas.width = 90; canvas.height = 120;

      const textDiv = document.createElement('div');
      if (isLocked) {
        textDiv.innerHTML = `<h3>🔒 ${c.name}</h3>` + c.desc.map(d=>`<p>${d}</p>`).join('') +
          `<p style="margin-top:8px;color:#ff8f2f;">Unlock in the shop (Unlocks tab)</p>`;
      } else {
        textDiv.innerHTML = `<h3>${c.name}</h3>` + c.desc.map(d=>`<p>${d}</p>`).join('') +
          `<p style="margin-top:8px;color:#ffce2f;">HP ${c.maxHealth} · SPD ${c.speed} · DMG ${c.damage}</p>`;
      }

      card.appendChild(canvas);
      card.appendChild(textDiv);
      card.onclick = () => {
        if (isLocked) { this.currentShopTab = 'unlocks'; this.openShopFrom('charScreen'); return; }
        this.selectedChar = key; this.renderCharCards();
      };
      wrap.appendChild(card);
      this.charCardEntries.push({ canvas, ctx: canvas.getContext('2d'), key, locked: isLocked });
    }
    this.drawCharCardSprites();
  }

  // Renders a live idle-pose pixel-art preview of each character next to
  // its card, reusing the exact same drawFighter/getPose code the actual
  // game uses — so the preview always matches what you'll see in battle.
  drawCharCardSprites() {
    if (!this.charCardEntries) return;
    for (const entry of this.charCardEntries) {
      const { ctx, key, canvas } = entry;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const def = CHARACTERS[key];
      const pose = getPose('idle', (this.charCardTime*0.5)%1, 1);
      drawFighter(ctx, canvas.width/2, canvas.height-14, 1, 1.35, pose, def.palette, false, 1);
    }
  }

  goCharSelect() {
    this.showScreen('charScreen');
    this.renderCharCards();
  }

  startRun() {
    if (!this.questionsReady) return;
    window.PlatformManager?.startSession('rumbux-revision');
    this.showScreen(null);
    for (const s of ['menuScreen','charScreen','quizScreen','upgradeScreen','gameOverScreen','shopScreen']) document.getElementById(s).classList.add('hidden');
    this.buildPanelOpen = false;
    document.getElementById('buildScreen').classList.add('hidden');
    this.run = { plan: buildRun(), index: 0, score:0, coins:0, startTime: performance.now(), enemiesDefeated:0, firstUpgradeDone:false };
    this.player = new Player(this.selectedChar, 60, 0.5, this.meta);
    this.difficultyHealthBonus = 0; this.difficultyBossHealthBonus = 0; this.difficultyDamageMult = 1;

    const sh = (id) => this.meta.shop[id]||0;
    // Starting Build (shop) — applied once, right at run start.
    if (sh('armed_start')) {
      const pool = Object.keys(WEAPON_TYPES).filter(id => !WEAPON_TYPES[id].extra && isWeaponUnlocked(id, this.meta));
      if (pool.length) {
        const wt = choice(pool);
        this.player.weapon = wt;
        this.currentWeaponDurability = Math.round(WEAPON_TYPES[wt].durability * (this.player.weaponDurabilityMult||1));
      }
    }
    if (sh('starting_upgrade')) {
      const tKey = choice(Object.keys(UPGRADE_TREES));
      applyUpgradeChoice(this.player, formatUpgradeOption({ kind:'tree', treeKey:tKey, def: UPGRADE_TREES[tKey].levels[0] }));
    }
    if (sh('head_start')) {
      // Shortens stage 1 so the first stage-clear (and first upgrade
      // offer) happens sooner — a real but simplified take on "earlier".
      this.run.plan[0].length = Math.round(this.run.plan[0].length * 0.55);
    }

    const beginPlaying = () => { this.loadStage(0); this.state = 'playing'; };
    if (sh('choose_your_training')) {
      // Reuses the normal upgrade-card UI: with 8 requested choices and
      // only 7 trees + the elemental root available at run start, every
      // group gets exactly one slot — i.e. "pick your starting tree".
      this.offerUpgrade(beginPlaying, 8);
    } else {
      beginPlaying();
    }
  }

  loadStage(idx) {
    this.run.index = idx;
    const def = this.run.plan[idx];
    // Flat, additive difficulty scaling: +5 enemy health and +10 boss
    // health per stage slot progressed (0-5 across a run), rather than
    // a percentage multiplier — keeps early fights from feeling spongy
    // while still making the back half of a run noticeably tougher.
    this.difficultyHealthBonus = idx * 5;
    this.difficultyBossHealthBonus = idx * 10;
    this.difficultyDamageMult = 1 + idx*0.09;
    this.stage = new StageManager(this, def);
    this.player.x = 60;
    this.player.depth = 0.5;
    this.activeBoss = null;
  }

  showGoBanner() {
    const el = document.getElementById('goBanner');
    el.style.opacity = 1;
    el.style.transform = 'translate(-50%,-50%) scale(1.15)';
    setTimeout(()=>{ el.style.transform='translate(-50%,-50%) scale(1)'; }, 120);
    setTimeout(()=>{ el.style.opacity = 0; }, 1200);
  }
  showBossBanner(name) {
    // reuse particles/shake; a text banner drawn on canvas is handled in draw()
    this._bossBannerTimer = 2.2;
    this._bossBannerText = name;
  }
  announcePhase2(boss) {
    this._phase2Timer = 1.6;
    this.shake(10);
  }

  shake(amt) { this.shakeAmount = Math.max(this.shakeAmount, amt); }
  hitstop(t) { this.hitstopTimer = Math.max(this.hitstopTimer, t); }

  playerAttackHitbox(player, range, dmg, knockback, big, launch) {
    const hb = { x: player.x + (player.facing>0?0:-range), y: player.groundY-40, w: range, h: 60, depthMin: player.depth-0.16, depthMax: player.depth+0.16 };
    let hitAny = false;
    for (const e of this.stage.enemies) {
      if (!e.alive || e.state==='dead' || player.hitEnemiesThisSwing.has(e.id)) continue;
      if (e.depth < hb.depthMin-0.05 || e.depth > hb.depthMax+0.05) continue;
      const ex = e.x;
      const within = player.facing>0 ? (ex >= player.x && ex <= player.x+range+14) : (ex <= player.x && ex >= player.x-range-14);
      if (!within) continue;
      player.hitEnemiesThisSwing.add(e.id);
      let dealt = dmg;
      let crit = big;
      // Riot Guard: shield blocks most damage from light/medium attacks —
      // only a heavy attack (big===true) breaks the guard for full damage.
      if (e.def && e.def.shielded && !big) {
        dealt *= 0.22;
        this.particles.burst(e.x, e.groundY-40, '#4ff0ff', 8, {minSpd:60,maxSpd:160,vScale:0.4,minLife:0.15,maxLife:0.3});
      } else if (e.def && e.def.shielded && big) {
        this.particles.burst(e.x, e.groundY-40, '#ffce2f', 14, {minSpd:100,maxSpd:260,vScale:0.5,minLife:0.2,maxLife:0.4});
      }
      // Shatter (Ice tree): a heavy hit on a frozen enemy is devastating.
      if (big && player.abilities.shatter && e.frozenTimer > 0) {
        dealt *= 3.5; crit = true; e.frozenTimer = 0;
        this.triggerExplosion(e.x, e.depth, dealt*0.2, 45, '#8fd6ff', false);
      }
      const doLaunch = launch && !(e instanceof Boss);
      e.takeDamage(dealt, player.facing*knockback, this, doLaunch);
      if (doLaunch && player.abilities.groundBounce) { e._bounceArmed = true; e._bounceDamage = dealt*0.35; }
      player.registerHit(dealt);
      this.applyOnHitAbilities(player, e, dealt, big);
      this.particles.damageNumber(e.x, e.groundY-70, dealt, crit);
      hitAny = true;
      if (e.health<=0) this.onEnemyDefeated(e);
    }
    // destructibles
    for (const d of this.stage.destructibles) {
      if (!d.alive) continue;
      if (Math.abs(d.depth-player.depth) > 0.22) continue;
      const within = player.facing>0 ? (d.x >= player.x && d.x <= player.x+range+14) : (d.x <= player.x && d.x >= player.x-range-14);
      if (!within) continue;
      d.health -= dmg; d.hitFlash = 0.15;
      this.particles.impact(d.x, d.groundY-20);
      if (d.health<=0) { d.alive=false; this.particles.dust(d.x, d.groundY-10);
        const roll = Math.random();
        const healthThresh = Math.min(0.85, 0.28 + (player.healDropChanceBonus||0));
        const weaponThresh = Math.min(0.95, healthThresh + 0.22 + (player.weaponDropBonus||0));
        if (roll<healthThresh) this.stage.spawnDropFrom(d.x, d.depth, 'health');
        else if (roll<weaponThresh) this.stage.spawnDropFrom(d.x, d.depth, 'weapon', player.abilities.anythingWeapon, this.meta);
        this.run.score += 20;
      }
    }
    if (hitAny) {
      this.particles.impact(player.x + player.facing*range*0.6, player.groundY-40);
    }
    return hitAny;
  }

  // radius/knockback hit centered on an explicit world position — used
  // both by the normal special attack and by delayed echoes (Double
  // Burst, Shadow Fighter) that shouldn't snap to the player's *current*
  // position if they've moved since the effect was queued.
  playerAttackHitboxRadialAt(x, depth, radius, dmg, knockback, forceStagger, forceShock, colorOverride) {
    const player = this.player;
    let hitAny = false;
    for (const e of this.stage.enemies) {
      if (!e.alive || e.state==='dead') continue;
      const d = dist(x, 0, e.x, 0);
      if (d > radius) continue;
      if (Math.abs(e.depth-depth) > 0.3) continue;
      e.takeDamage(dmg, Math.sign(e.x-x||1)*knockback, this);
      player.registerHit(dmg);
      this.applyOnHitAbilities(player, e, dmg, true);
      if (forceShock) this.applyShock(e, dmg*0.3);
      if (forceStagger && !(e instanceof Boss) && e.health > 0) e.forceStagger(1.1);
      this.particles.damageNumber(e.x, e.groundY-70, dmg, true);
      hitAny = true;
      if (e.health<=0) this.onEnemyDefeated(e);
    }
    this.particles.burst(x, depthToScreenY(depth)-30, colorOverride||'#ff2f92', 24, {minSpd:80,maxSpd:320,vScale:0.5,minLife:0.3,maxLife:0.6});
    return hitAny;
  }

  playerAttackHitboxRadial(player, radius, dmg, knockback, forceStagger, forceShock) {
    return this.playerAttackHitboxRadialAt(player.x, player.depth, radius, dmg, knockback, forceStagger, forceShock);
  }

  // Central hook for every per-hit ability that isn't already baked into
  // the caller: elemental status effects, weapon-inherited elements, and
  // the Chaos legendary's random effect roll.
  applyOnHitAbilities(player, e, dealt, big) {
    const isBoss = e instanceof Boss;
    const weaponElemental = player.weapon && player.abilities.synElementalWeapons && player.element;

    if (player.abilities.burningFists && (player.element==='fire') && (Math.random()<0.35 || weaponElemental)) {
      const dps = (player.abilities.inferno ? 7 : 4);
      const dur = (player.abilities.inferno ? 5 : 3);
      e.burn.timer = Math.max(e.burn.timer, dur); e.burn.tick = e.burn.tick||0.5; e.burn.dps = dps;
    }
    if (player.abilities.staticFists && (player.element==='lightning') && (Math.random()<0.3 || weaponElemental)) {
      this.applyShock(e, dealt*0.25, player);
    }
    if (player.abilities.coldFists && (player.element==='ice') && (Math.random()<0.35 || weaponElemental) && !isBoss) {
      const wasSlowed = e.slow.timer > 0;
      e.slow.timer = Math.max(e.slow.timer, player.abilities.frozenSolid ? 3.5 : 2.2);
      e.slow.factor = 0.5;
      if (wasSlowed && player.abilities.deepFreeze && Math.random() < 0.4) {
        e.frozenTimer = player.abilities.frozenSolid ? 2.2 : 1.4;
        this.particles.burst(e.x, e.groundY-30, '#8fd6ff', 10, {minSpd:40,maxSpd:120,vScale:0.5,minLife:0.3,maxLife:0.5});
      }
    }
    if (player.abilities.chaos && Math.random() < 0.12) {
      this.triggerChaosEffect(e, this.player || player); // always the real player, never a shadow-echo stand-in
    }
  }

  applyShock(e, dmg, player) {
    if (e instanceof Boss) { e.health -= dmg; this.particles.burst(e.x, e.groundY-40, '#4ff0ff', 6, {minSpd:60,maxSpd:160,vScale:0.6,minLife:0.2,maxLife:0.4}); return; }
    e.health -= dmg;
    this.particles.burst(e.x, e.groundY-30, '#4ff0ff', 6, {minSpd:60,maxSpd:160,vScale:0.6,minLife:0.2,maxLife:0.4});
    if (e.health<=0 && e.state!=='knockdown' && e.state!=='dead') { e.health=0; e.state='knockdown'; e.anim='knockdown'; e.stateTimer=0; e.knockdownTimer=0.9; }
    if (player && player.abilities.chainLightning) {
      const jumps = player.abilities.supercharge ? 3 : 1;
      let jumped = 0;
      for (const other of this.stage.enemies) {
        if (jumped >= jumps) break;
        if (other===e || !other.alive || other.state==='dead') continue;
        if (dist(e.x,0,other.x,0) < 90) { this.applyShock(other, dmg*0.6); jumped++; }
      }
    }
  }

  triggerExplosion(x, depth, dmg, radius, color, isFire, hitsPlayer) {
    this.shake(CONFIG.shake.light);
    this.particles.burst(x, depthToScreenY(depth)-30, color||'#ffce2f', 20, {minSpd:100,maxSpd:320,vScale:0.5,minLife:0.3,maxLife:0.55});
    for (const e of this.stage.enemies) {
      if (!e.alive || e.state==='dead') continue;
      if (dist(x,0,e.x,0) > radius) continue;
      if (Math.abs(e.depth-depth) > 0.3) continue;
      e.takeDamage(dmg, Math.sign(e.x-x||1)*160, this);
      this.particles.damageNumber(e.x, e.groundY-70, dmg, true);
      if (isFire) { e.burn.timer = Math.max(e.burn.timer, 2); e.burn.tick = e.burn.tick||0.5; e.burn.dps = 4; }
      if (e.health<=0) this.onEnemyDefeated(e);
    }
    if (hitsPlayer && this.player && dist(x,0,this.player.x,0) <= radius && Math.abs(this.player.depth-depth) < 0.3) {
      this.player.takeDamage(dmg, Math.sign(this.player.x-x||1)*160, this);
    }
  }

  triggerLightningStrike(x, depth) {
    let target = null, bestD = 220;
    for (const e of this.stage.enemies) {
      if (!e.alive || e.state==='dead') continue;
      const d = dist(x,0,e.x,0);
      if (d < bestD) { bestD = d; target = e; }
    }
    const strikeX = target ? target.x : x;
    const strikeDepth = target ? target.depth : depth;
    this.particles.burst(strikeX, depthToScreenY(strikeDepth)-60, '#4ff0ff', 18, {minSpd:120,maxSpd:340,vScale:0.7,minLife:0.2,maxLife:0.4});
    this.shake(CONFIG.shake.light);
    for (const e of this.stage.enemies) {
      if (!e.alive || e.state==='dead') continue;
      if (dist(strikeX,0,e.x,0) > 60) continue;
      if (Math.abs(e.depth-strikeDepth) > 0.25) continue;
      this.applyShock(e, this.player.baseDamage*this.player.mods.damageMult*0.8, this.player);
      if (e.health<=0) this.onEnemyDefeated(e);
    }
  }

  // Fire tree's Spreading Flames: a burning enemy occasionally passes a
  // lesser burn to a nearby, not-yet-burning enemy.
  spreadBurn(source, dps, timer) {
    for (const e of this.stage.enemies) {
      if (e===source || !e.alive || e.state==='dead' || e.burn.timer>0) continue;
      if (dist(source.x,0,e.x,0) < 70) {
        e.burn.timer = Math.max(0.5, timer*0.6); e.burn.tick = e.burn.tick||0.5; e.burn.dps = dps*0.7;
        break; // one spread per tick keeps it from cascading instantly through a whole crowd
      }
    }
  }

  spawnHazard(x, depth, dmg, life) {
    this.stage.hazards.push({ x, depth, damage:dmg, life, maxLife:life, alive:true, hitSet:new Set() });
  }

  spawnShadowVisual(x, depth, facing, anim) {
    this.activeShadows.push({ x, depth, facing, anim, timer:0.22, maxTimer:0.22 });
  }

  // Chaos legendary: a small random combat effect on a lucky hit.
  triggerChaosEffect(e, player) {
    const effects = ['explosion','lightning','freeze','knockback','bonus','speed'];
    const pick = choice(effects);
    switch (pick) {
      case 'explosion': this.triggerExplosion(e.x, e.depth, player.baseDamage*0.6, 50, '#ffce2f', false); break;
      case 'lightning': this.applyShock(e, player.baseDamage*0.5, player); break;
      case 'freeze': if (!(e instanceof Boss)) e.frozenTimer = Math.max(e.frozenTimer, 1.0); break;
      case 'knockback': e.vx += (e.x>=player.x?1:-1) * 260; break;
      case 'bonus': e.health -= player.baseDamage*0.4; this.particles.damageNumber(e.x, e.groundY-80, player.baseDamage*0.4, true); break;
      case 'speed': player.attackSpeedBuffTimer = Math.max(player.attackSpeedBuffTimer, 0.8); break;
    }
    this.particles.burst(e.x, e.groundY-40, '#c86fff', 8, {minSpd:60,maxSpd:180,vScale:0.5,minLife:0.2,maxLife:0.4});
  }

  onEnemyDefeated(e) {
    this.run.enemiesDefeated++;
    window.AchievementManager?.notify?.('enemy_defeated', { amount:1, facts:{ rumbuxBestCombo:this.player.comboCount||0 } });
    this.player.stats.defeats++;
    const val = (e.def && e.def.scoreValue) || 100;
    this.run.score += Math.round(val * (1 + this.player.comboCount*0.02));
    window.ChallengeManager?.update?.({ score:this.run.score, distance:this.player.x||0, wave:this.run.index+1, alive:true });
    const coins = coinsForKill(e.def, this.meta);
    this.run.coins += coins;
    this.player.stats.coinsEarned += coins;

    const p = this.player;
    // Tank tree — Second Wind: small heal per kill, capped so it can't
    // trivialize damage. Only heals while below 90% HP and off cooldown.
    if (p.abilities.secondWind && p.health < p.maxHealth*0.9 && (p._secondWindCd||0) <= 0) {
      p.health = Math.min(p.maxHealth, p.health + p.maxHealth*0.04);
      p._secondWindCd = 0.6;
    }
    // Special tree — Energy Rush: kills chip away at the special cooldown.
    if (p.abilities.energyRush) p.specialCd = Math.max(0, p.specialCd - 0.6);
    // Legendary — Blood Rush: heal every 10th defeat.
    if (p.abilities.bloodRush && p.stats.defeats % 10 === 0) {
      p.health = Math.min(p.maxHealth, p.health + p.maxHealth*0.15);
      this.particles.burst(p.x, p.groundY-30, '#ff5577', 14, {minSpd:60,maxSpd:180,vScale:0.5,minLife:0.3,maxLife:0.5});
    }
  }

  spawnProjectile(x, depth, vx, dmg, fromPlayer, color, isBomb) {
    this.stage.projectiles.push(new Projectile(x, depth, vx, dmg, fromPlayer, color, isBomb));
  }

  // The Mechanic's Turret Deploy: a stationary sentry that shoots at the
  // player for a while, then self-destructs. A real Enemy so it can be
  // fought/destroyed early like anything else in the encounter.
  spawnTurret(x, depth) {
    const t = new Enemy('turret', x, clamp(depth, 0, 1), 1, this.difficultyHealthBonus);
    t._expireTimer = 9;
    t.hasToken = true; // always ready to fire, it can't move into position
    this.stage.enemies.push(t);
    this.particles.burst(x, depthToScreenY(depth)-20, '#ffce2f', 12, {minSpd:60,maxSpd:200,vScale:0.5,minLife:0.25,maxLife:0.45});
  }

  update(dt) {
    window.PlatformManager?.heartbeat('rumbux-revision', this.state === 'playing' && !this.buildPanelOpen);
    document.body.classList.toggle('in-game', this.state==='playing');
    this.input.endFramePending = true;
    if (this.state !== 'playing') { this.input.endFrame(); return; }

    if (this.input.consumePress('buildPanel')) this.toggleBuildPanel();
    if (this.buildPanelOpen) { this.input.endFrame(); return; }

    if (this.hitstopTimer > 0) { this.hitstopTimer -= dt; this.particles.update(dt*0.3); this.input.endFrame(); return; }

    this.player.update(dt, this.input, this);
    this.stage.update(dt, this.player, this);
    this.particles.update(dt);
    this.shakeAmount = lerp(this.shakeAmount, 0, 0.15);

    // boss defeat check
    if (this.activeBoss && !this.activeBoss.alive) {
      this.run.score += this.activeBoss.def.scoreValue||1000;
      this.run.enemiesDefeated++;
      const bossBonus = (this.meta.shop.boss_bonus||0) * SHOP_ITEMS_BY_ID.boss_bonus.effectPerLevel;
      const bossCoins = coinsForKill(this.activeBoss.def, this.meta) + Math.round(bossBonus);
      this.run.coins += bossCoins;
      this.player.stats.coinsEarned += bossCoins;
      // Survival tab — Fresh Start: restore some health after a boss kill.
      if (this.player.bossHealBonus) {
        this.player.health = Math.min(this.player.maxHealth, this.player.health + this.player.bossHealBonus);
      }
      this.activeBoss = null;
    }

    // player death -> game over
    if (!this.player.alive && this.player.knockdownTimer !== undefined) {
      this._deathTimer = (this._deathTimer||0) + dt;
      if (this._deathTimer > 1.2) { this.endRun(false); }
    }

    // stage complete (reached end & no active encounter & not locked)
    // Stage-clear threshold must stay comfortably inside the player's
    // max reachable x (camX + canvasW - 60, capped once the camera
    // hits the level's right edge at length-canvasW). A threshold of
    // length-40 sat *outside* that reachable range, making the very
    // end of every stage permanently unreachable — the game's real
    // "stage gets locked" bug. length-100 leaves solid clearance.
    if (!this.stage.locked && this.player.x >= this.stage.length - 100) {
      this.onStageCleared();
    }

    if (this._bossBannerTimer>0) this._bossBannerTimer -= dt;
    if (this._phase2Timer>0) this._phase2Timer -= dt;
    if (this._synergyBannerTimer>0) this._synergyBannerTimer -= dt;
    if (this._perfectDodgeTimer>0) this._perfectDodgeTimer -= dt;
    if (this._secondChanceTimer>0) this._secondChanceTimer -= dt;
    if (this.activeShadows.length) {
      for (const sh of this.activeShadows) sh.timer -= dt;
      this.activeShadows = this.activeShadows.filter(sh => sh.timer > 0);
    }

    this.input.endFrame();
  }

  onStageCleared() {
    const idx = this.run.index;
    if (idx >= this.run.plan.length - 1) {
      this.endRun(true);
      return;
    }
    this.startQuiz(() => this.loadStage(idx+1));
  }

  // Draws `count` questions from a shuffled, non-repeating-within-a-pass
  // pool, reshuffling the full bank once it runs out.
  drawQuestions(count) {
    return QuestionManager.getRandomSet(count).map(q => ({ source:q, q:q.q, options:q.a, correct:q.c }));
  }

  // 4 multichoice questions gate how many upgrade cards you get to choose
  // from afterward: every correct answer = one more option in the pool
  // (still pick just one). 0 correct = no upgrade offered this round.
  startQuiz(onDone) {
    this.state = 'quiz';
    this.quizQuestions = this.drawQuestions(4);
    this.quizIndex = 0;
    this.quizCorrectCount = 0;
    this.quizOnDone = onDone;
    this.showScreen('quizScreen');
    this.renderQuizScoreTrack();
    this.renderQuizQuestion();
  }

  renderQuizScoreTrack() {
    const track = document.getElementById('quizScoreTrack');
    track.innerHTML = '';
    for (let i=0;i<this.quizQuestions.length;i++) {
      const pip = document.createElement('div');
      pip.className = 'quiz-score-pip';
      pip.id = 'quizPip'+i;
      track.appendChild(pip);
    }
  }

  renderQuizQuestion() {
    const q = this.quizQuestions[this.quizIndex];
    document.getElementById('quizProgress').textContent = `${this.quizIndex+1}/${this.quizQuestions.length}`;
    document.getElementById('quizQuestionText').textContent = q.q;
    document.getElementById('quizFeedback').textContent = '';
    const wrap = document.getElementById('quizOptions');
    wrap.innerHTML = '';
    const order = q.options.map((_, i) => i).sort(() => Math.random()-0.5);
    for (const optIdx of order) {
      const btn = document.createElement('button');
      btn.className = 'quiz-option-btn';
      btn.textContent = q.options[optIdx];
      btn.onclick = () => this.answerQuiz(optIdx === q.correct, btn, wrap);
      wrap.appendChild(btn);
    }
  }

  answerQuiz(isCorrect, btnEl, wrap) {
    for (const c of wrap.children) c.disabled = true;
    btnEl.classList.add(isCorrect ? 'correct' : 'incorrect');
    const fb = document.getElementById('quizFeedback');
    const pip = document.getElementById('quizPip'+this.quizIndex);
    const question = this.quizQuestions[this.quizIndex];
    QuestionManager.recordAnswer(question.source, isCorrect);
    window.PlatformManager?.recordQuestionAnswered('rumbux-revision', isCorrect);
    if (isCorrect) {
      this.quizCorrectCount++;
      window.AchievementManager?.notify?.('rumbux_revision_correct', { amount:1 });
      fb.textContent = 'CORRECT!'; fb.style.color = '#39ff6a';
      if (pip) pip.classList.add('correct');
    } else {
      fb.textContent = 'INCORRECT'; fb.style.color = '#ff3355';
      if (pip) pip.classList.add('incorrect');
    }
    setTimeout(() => {
      this.quizIndex++;
      if (this.quizIndex < this.quizQuestions.length) this.renderQuizQuestion();
      else this.finishQuiz();
    }, 900);
  }

  finishQuiz() {
    this.meta.questionsCorrect = (this.meta.questionsCorrect||0) + this.quizCorrectCount;
    saveMetaProgress(this.meta);
    this.updateCoinBadges();
    const onDone = this.quizOnDone;
    let correctCount = this.quizCorrectCount;
    if (correctCount <= 0) {
      // No correct answers -> no upgrade choices this round, straight to the next stage.
      this.showScreen(null);
      for (const s of ['menuScreen','charScreen','quizScreen','upgradeScreen','gameOverScreen','shopScreen']) document.getElementById(s).classList.add('hidden');
      this.state = 'playing';
      onDone();
      return;
    }
    // Starting Build — Extra Choice: your first upgrade selection has 4 options.
    if (!this.run.firstUpgradeDone && (this.meta.shop.extra_choice||0)) correctCount = Math.max(correctCount, 4);
    this.run.firstUpgradeDone = true;
    this.offerUpgrade(onDone, correctCount);
  }

  offerUpgrade(onDone, numChoices) {
    numChoices = numChoices || 3;
    this.state = 'upgrade';
    this.player.rejectUsedThisScreen = false;
    const wrap = document.getElementById('upgradeCards');
    wrap.innerHTML = '';
    const subtitle = document.getElementById('upgradeSubtitle');
    if (subtitle) {
      subtitle.textContent = numChoices===1 ? '1 CORRECT ANSWER — CHOOSE YOUR UPGRADE'
        : `${numChoices} CORRECT ANSWERS — CHOOSE 1 OF ${numChoices}`;
    }
    const choices = rollUpgradeChoices(this.player, numChoices);
    const finalize = (opt) => {
      const newSynergies = applyUpgradeChoice(this.player, opt);
      this.showScreen(null);
      for (const s of ['menuScreen','charScreen','quizScreen','upgradeScreen','gameOverScreen','shopScreen']) document.getElementById(s).classList.add('hidden');
      this.state = 'playing';
      if (newSynergies.length) this.queueSynergyNotifications(newSynergies, onDone);
      else onDone();
    };
    for (const opt of choices) wrap.appendChild(this.buildUpgradeCard(opt, choices, finalize));
    if (choices.length === 0) { this.state = 'playing'; onDone(); return; } // fully maxed build — nothing left to offer

    // Upgrade Luck (shop) — Reroll: re-rolls the whole set of cards.
    const controls = document.getElementById('upgradeControls');
    controls.innerHTML = '';
    if (this.player.rerollsRemaining > 0) {
      const rerollBtn = document.createElement('button');
      rerollBtn.className = 'btn secondary';
      rerollBtn.textContent = `🔄 REROLL (${this.player.rerollsRemaining} LEFT)`;
      rerollBtn.onclick = () => { this.player.rerollsRemaining--; this.offerUpgrade(onDone, numChoices); };
      controls.appendChild(rerollBtn);
    }

    document.getElementById('upgradeScreen').classList.remove('hidden');
    for (const s of ['menuScreen','charScreen','quizScreen','gameOverScreen']) document.getElementById(s).classList.add('hidden');
  }

  buildUpgradeCard(opt, allChoices, finalize) {
    const rarityDef = UPGRADE_RARITY[opt.rarity];
    const card = document.createElement('div');
    card.className = 'upgradeCard';
    card.style.borderColor = rarityDef.color;
    card.style.boxShadow = `0 0 16px ${rarityDef.color}66`;
    const levelLabel = opt.level ? `${opt.treeLabel} — LEVEL ${opt.level}` : opt.treeLabel;
    card.innerHTML =
      `<div class="upgradeRarity" style="color:${rarityDef.color};">${rarityDef.label}</div>` +
      `<div class="upgradeTreeLabel">${opt.icon} ${levelLabel}</div>` +
      `<h4>${opt.name}</h4><p>${opt.desc}</p>`;
    card.onclick = () => finalize(opt);

    // Upgrade Luck (shop) — Reject: swap one unwanted card for a fresh
    // roll, once per selection screen.
    if (this.player.abilities.shopReject && !this.player.rejectUsedThisScreen) {
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'upgradeRejectBtn';
      rejectBtn.textContent = '✕ REJECT';
      rejectBtn.onclick = (e) => {
        e.stopPropagation();
        this.player.rejectUsedThisScreen = true;
        const excludeTrees = allChoices.filter(c => c !== opt).map(c => c.treeKey);
        const replacement = rollUpgradeChoices(this.player, 1, excludeTrees)[0];
        if (replacement) {
          const idx = allChoices.indexOf(opt);
          if (idx >= 0) allChoices[idx] = replacement;
          const newCard = this.buildUpgradeCard(replacement, allChoices, finalize);
          card.replaceWith(newCard);
        }
      };
      card.appendChild(rejectBtn);
    }
    return card;
  }

  // Shows "SYNERGY UNLOCKED" banners one at a time (in case two unlock
  // from the same pick) before continuing to the next stage.
  queueSynergyNotifications(synergies, onDone) {
    let i = 0;
    const showNext = () => {
      if (i >= synergies.length) { onDone(); return; }
      const syn = synergies[i++];
      this._synergyBannerTimer = 2.4;
      this._synergyBannerText = syn.name;
      this._synergyBannerDesc = syn.desc;
      setTimeout(showNext, 2500);
    };
    showNext();
  }

  endRun(victory) {
    this.state = 'gameover';
    this.buildPanelOpen = false;
    document.getElementById('buildScreen').classList.add('hidden');
    // Bank whatever coins were earned this run into permanent meta
    // progress, spendable in the shop, regardless of win or death.
    window.PlatformManager?.addCoins(this.run.coins);
    this.meta.coins = window.PlatformManager?.getCoins() ?? this.meta.coins + this.run.coins;
    this.meta.highScore = Math.max(this.meta.highScore||0, this.run.score);
    window.PlatformManager?.setHighScore('rumbux-revision', this.run.score);
    window.PlatformManager?.endSession('rumbux-revision');
    window.ChallengeManager?.finish?.({ score:this.run.score, distance:this.player?.x||0, wave:this.run.index+1, alive:!!victory });
    saveMetaProgress(this.meta);

    const timeSec = Math.round((performance.now()-this.run.startTime)/1000);
    document.getElementById('gameOverTitle').textContent = victory ? 'VICTORY!' : 'GAME OVER';
    document.getElementById('gameOverTitle').style.color = victory ? '#39ff6a' : '#ff2f2f';
    const stats = document.getElementById('gameOverStats');
    const rows = [
      ['SCORE', this.run.score],
      ['COINS EARNED', this.run.coins],
      ['STAGE REACHED', `${this.run.index+1} / ${this.run.plan.length}`],
      ['ENEMIES DEFEATED', this.run.enemiesDefeated],
      ['HIGHEST COMBO', this.player.stats.highestCombo],
      ['DAMAGE DEALT', Math.round(this.player.stats.damageDealt)],
      ['RUN TIME', `${Math.floor(timeSec/60)}:${String(timeSec%60).padStart(2,'0')}`],
    ];
    stats.innerHTML = rows.map(([k,v])=>`<div class="statLine"><span>${k}</span><span>${v}</span></div>`).join('');
    this.showScreen('gameOverScreen');
  }

  loop(now) {
    const dt = Math.min(0.033, (now - this.lastTime)/1000);
    this.lastTime = now;
    this.update(dt);
    this.render();
    const charScreenEl = document.getElementById('charScreen');
    if (charScreenEl && !charScreenEl.classList.contains('hidden') && this.charCardEntries.length) {
      this.charCardTime += dt;
      this.drawCharCardSprites();
    }
    requestAnimationFrame(this.loop.bind(this));
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0,0,CONFIG.canvasW,CONFIG.canvasH);
    if (this.shakeAmount > 0.2) {
      ctx.translate(rand(-this.shakeAmount,this.shakeAmount), rand(-this.shakeAmount,this.shakeAmount));
    }
    if (this.state === 'playing' || this.state==='upgrade' || this.state==='quiz') {
      this.stage.draw(ctx);
      for (const sh of this.activeShadows) this.drawShadowVisual(ctx, sh);
      this.stage.drawEntitiesSorted(ctx, this.player);
      this.stage.drawEnvHazards(ctx);
      this.particles.draw(ctx, this.stage.camX);
      this.drawThemeOverlay(ctx);
      this.drawHUD(ctx);
      if (this.activeBoss && this.activeBoss.alive) this.drawBossBar(ctx, this.activeBoss);
      if (this._bossBannerTimer>0) this.drawCenterBanner(ctx, this._bossBannerText, '#ff2f2f');
      if (this._phase2Timer>0) this.drawCenterBanner(ctx, 'PHASE 2!', '#ffce2f');
      if (this._synergyBannerTimer>0) this.drawSynergyBanner(ctx);
      if (this._perfectDodgeTimer>0) this.drawCenterBanner(ctx, 'PERFECT!', '#4ff0ff');
      if (this._secondChanceTimer>0) this.drawCenterBanner(ctx, 'SAVED!', '#ffce2f');
    } else {
      ctx.fillStyle = '#0a0612';
      ctx.fillRect(0,0,CONFIG.canvasW,CONFIG.canvasH);
    }
    ctx.restore();
  }

  drawCenterBanner(ctx, text, color) {
    ctx.save();
    ctx.textAlign='center';
    ctx.font = `bold 34px ${GLOBAL_TITLE_FONT}`;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000'; ctx.lineWidth=5;
    ctx.strokeText(text, CONFIG.canvasW/2, 100);
    ctx.fillText(text, CONFIG.canvasW/2, 100);
    ctx.restore();
  }

  drawSynergyBanner(ctx) {
    ctx.save();
    ctx.textAlign='center';
    const y = 130;
    ctx.font = `bold 14px ${GLOBAL_BODY_FONT}`;
    ctx.fillStyle = '#ffce2f';
    ctx.strokeStyle='#000'; ctx.lineWidth=4;
    ctx.strokeText('SYNERGY UNLOCKED', CONFIG.canvasW/2, y);
    ctx.fillText('SYNERGY UNLOCKED', CONFIG.canvasW/2, y);
    ctx.font = `bold 30px ${GLOBAL_TITLE_FONT}`;
    ctx.fillStyle = '#fff';
    ctx.strokeText(this._synergyBannerText, CONFIG.canvasW/2, y+34);
    ctx.fillText(this._synergyBannerText, CONFIG.canvasW/2, y+34);
    if (this._synergyBannerDesc) {
      ctx.font = `12px ${GLOBAL_BODY_FONT}`;
      ctx.fillStyle = '#cfe';
      ctx.strokeText(this._synergyBannerDesc, CONFIG.canvasW/2, y+56);
      ctx.fillText(this._synergyBannerDesc, CONFIG.canvasW/2, y+56);
    }
    ctx.restore();
  }

  showPerfectDodge() { this._perfectDodgeTimer = 0.7; }
  showSecondChance() { this._secondChanceTimer = 1.1; }

  // Techniques — Grab / Throw. Called on the 'grab' key: grabs the
  // nearest hurt, non-boss enemy in range, or (if already holding one)
  // throws it — dealing damage to anything it hits along the way.
  tryPlayerGrab(player) {
    if (player.grabbedEnemy && player.grabbedEnemy.alive) {
      const enemy = player.grabbedEnemy;
      player.grabbedEnemy = null;
      if (player.abilities.throwTech) {
        const dmg = player.baseDamage*player.mods.damageMult*1.6;
        this.stage.projectiles.push(new Projectile(enemy.x, enemy.depth, player.facing*500, dmg, true, '#ff8844'));
        enemy.health = 0; enemy.state='knockdown'; enemy.anim='knockdown'; enemy.stateTimer=0; enemy.knockdownTimer=0.4;
        this.shake(CONFIG.shake.light);
      } else {
        // Own Grab but not Throw yet: a hard release slam instead.
        enemy.state = 'hurt'; enemy.stateTimer = 0.18;
        enemy.takeDamage(player.baseDamage*player.mods.damageMult*0.8, player.facing*220, this);
      }
      return;
    }
    let target = null, bestD = 55;
    for (const e of this.stage.enemies) {
      if (!e.alive || e.state !== 'hurt' || e instanceof Boss) continue;
      const d = dist(player.x,0,e.x,0);
      if (d < bestD && Math.abs(e.depth-player.depth) < 0.2) { bestD = d; target = e; }
    }
    if (target) {
      target.state = 'grabbed'; target.anim = 'hurt'; target.vx = 0; target.vz = 0;
      player.grabbedEnemy = target;
      this.particles.impact(target.x, target.groundY-30);
    }
  }

  // Nightclub's Spotlight / Docks' Sea Fog — a radial gradient centered
  // on the player, drawn on top of everything else. Purely atmospheric:
  // it doesn't change hit detection, just how far you can comfortably see.
  drawThemeOverlay(ctx) {
    const mod = this.stage.modifier;
    if (!mod || mod.type !== 'overlay') return;
    const px = this.player.x - this.stage.camX;
    const py = this.player.groundY - 40;
    const innerR = mod.style === 'dark' ? 75 : 130;
    const outerR = mod.style === 'dark' ? 260 : 430;
    const grad = ctx.createRadialGradient(px, py, innerR, px, py, outerR);
    if (mod.style === 'dark') {
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(4,0,10,0.9)');
    } else {
      grad.addColorStop(0, 'rgba(180,195,205,0)');
      grad.addColorStop(1, 'rgba(160,178,190,0.5)');
    }
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
    ctx.restore();
  }

  drawShadowVisual(ctx, sh) {
    const pose = getPose(sh.anim, 0.4, sh.facing);
    const y = depthToScreenY(sh.depth);
    const alpha = clamp(sh.timer/sh.maxTimer, 0, 1) * 0.55;
    drawFighter(ctx, sh.x-this.stage.camX, y, sh.facing, depthToScale(sh.depth), pose, this.player.palette, false, alpha);
  }

  drawHUD(ctx) {
    ctx.save();
    // player health bar - top left
    drawRect(ctx, 16, 16, 220, 22, '#000000aa');
    const hpPct = clamp(this.player.health/this.player.maxHealth,0,1);
    drawRect(ctx, 20, 20, 212*hpPct, 14, hpPct>0.3?'#39ff6a':'#ff3355');
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.strokeRect(20,20,212,14);
    ctx.fillStyle='#fff'; ctx.font=`bold 11px ${GLOBAL_BODY_FONT}`;
    ctx.fillText(`HP ${Math.ceil(this.player.health)}/${this.player.maxHealth}`, 24, 31);
    ctx.fillStyle='#4ff0ff'; ctx.font=`bold 13px ${GLOBAL_BODY_FONT}`;
    ctx.fillText(`STAGE ${this.run.index+1}/${this.run.plan.length}`, 20, 54);

    // special cooldown
    drawRect(ctx, 20, 60, 100, 8, '#000000aa');
    const scPct = 1 - clamp(this.player.specialCd/CONFIG.player.specialCooldown,0,1);
    drawRect(ctx, 20, 60, 100*scPct, 8, '#ff2f92');
    ctx.fillStyle='#ff2f92'; ctx.font=`9px ${GLOBAL_BODY_FONT}`; ctx.fillText('SPECIAL', 124, 67);

    // score, coins & combo - top right
    ctx.textAlign='right';
    ctx.fillStyle='#ffce2f'; ctx.font=`bold 16px ${GLOBAL_TITLE_FONT}`;
    ctx.fillText(`SCORE ${this.run.score}`, CONFIG.canvasW-16, 28);
    ctx.fillStyle='#ffce2f'; ctx.font=`bold 13px ${GLOBAL_BODY_FONT}`;
    ctx.fillText(`🪙 ${this.run.coins}`, CONFIG.canvasW-16, 46);
    if (this.player.comboCount > 1) {
      ctx.fillStyle='#ff2f92'; ctx.font=`bold 20px ${GLOBAL_TITLE_FONT}`;
      ctx.fillText(`${this.player.comboCount} HIT COMBO`, CONFIG.canvasW-16, 70);
    }
    ctx.textAlign='left';
    ctx.restore();
  }

  drawBossBar(ctx, boss) {
    ctx.save();
    const w = 500, x = CONFIG.canvasW/2 - w/2, y = 16;
    drawRect(ctx, x-3, y-3, w+6, 22, '#000000cc');
    const pct = clamp(boss.health/boss.maxHealth,0,1);
    drawRect(ctx, x, y, w*pct, 16, pct<0.3?'#ff2f2f':'#ffce2f');
    ctx.strokeStyle='#fff'; ctx.strokeRect(x,y,w,16);
    ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.font=`bold 13px ${GLOBAL_BODY_FONT}`;
    ctx.fillText(boss.def.name, CONFIG.canvasW/2, y+13);
    ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => { window.__game = new Game(); });

// Reuse the exact enemy palettes, pose generator and fighter rig from combat
// for the home-screen crowd.
const homeEnemyCanvas = document.getElementById('homeEnemyBackdrop');
const homeEnemyCtx = homeEnemyCanvas?.getContext('2d');
const homeEnemyTypes = Object.values(ENEMY_TYPES).filter(def => def.palette).slice(0, 9);
const homeEnemySprites = homeEnemyTypes.map((def, i) => ({
  def, x:55+i*112, y:510-(i%3)*145, vx:(i%2?-1:1)*(.16+i*.018), phase:i*.73,
  scale:(def.scaleMod||1)*(.75+(i%3)*.08)
}));
function drawHomeEnemySprites(now){
  if(homeEnemyCtx && !document.getElementById('menuScreen').classList.contains('hidden')){
    homeEnemyCtx.clearRect(0,0,homeEnemyCanvas.width,homeEnemyCanvas.height);
    homeEnemySprites.forEach(s=>{
      s.x+=s.vx;
      if(s.x<-70)s.x=1030;
      if(s.x>1030)s.x=-70;
      const facing=s.vx>0?1:-1;
      const pose=getPose(Math.sin(now/700+s.phase)>.55?'walk':'idle',(now/900+s.phase)%1,facing);
      drawFighter(homeEnemyCtx,s.x,s.y+Math.sin(now/650+s.phase)*7,facing,s.scale,pose,s.def.palette,false,.58);
    });
  }
  requestAnimationFrame(drawHomeEnemySprites);
}
requestAnimationFrame(drawHomeEnemySprites);
