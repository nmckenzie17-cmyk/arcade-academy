/* ============================================================
   poolPhysics.js
   Self-contained 2D pool physics: ball-ball / ball-cushion
   collisions, friction, pocket detection. No external deps —
   deterministic enough that the same shot (same seed inputs)
   produces the same result on host and guest.
   ============================================================ */

class Ball {
  constructor(number, x, y) {
    this.number = number;      // 0 = cue, 1-7 solids, 8 = eight, 9-15 stripes
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = GameConfig.ball.radius;
    this.pocketed = false;
  }
  get isCue() { return this.number === 0; }
  get isEight() { return this.number === 8; }
  get isSolid() { return this.number >= 1 && this.number <= 7; }
  get isStripe() { return this.number >= 9 && this.number <= 15; }
  get speed() { return Math.hypot(this.vx, this.vy); }
}

class PoolTable {
  constructor() {
    const cfg = GameConfig.table;
    this.width = cfg.width;
    this.height = cfg.height;
    this.rail = cfg.railWidth;
    this.pocketRadius = cfg.pocketRadius;
    this.pockets = this._computePockets();
    this.balls = [];
  }

  _computePockets() {
    const w = this.width, h = this.height, r = this.rail;
    // 6 pockets: 4 corners + 2 side middles, positioned at the inner rail line
    return [
      { x: r, y: r, corner: true },
      { x: w / 2, y: r * 0.55, corner: false },
      { x: w - r, y: r, corner: true },
      { x: r, y: h - r, corner: true },
      { x: w / 2, y: h - r * 0.55, corner: false },
      { x: w - r, y: h - r, corner: true }
    ];
  }

  // Standard rack: cue ball on the left, triangle of 15 on the right (apex toward cue).
  rack() {
    const cfg = GameConfig.ball;
    const balls = [];
    balls.push(new Ball(0, this.width * 0.25, this.height / 2));

    const order = [1, 9, 2, 10, 8, 11, 3, 12, 4, 13, 5, 14, 6, 15, 7]; // 8-ball centered per standard rack
    const apexX = this.width * 0.72;
    const apexY = this.height / 2;
    const spacing = cfg.radius * 2.02;
    let idx = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const num = order[idx++];
        const x = apexX + row * spacing * 0.87;
        const y = apexY - row * spacing / 2 + col * spacing;
        balls.push(new Ball(num, x, y));
      }
    }
    this.balls = balls;
    return balls;
  }

  // Standard 9-ball diamond: 1 at the apex, 9 in the centre, others shuffled.
  rackNineBall() {
    const cfg = GameConfig.ball, balls = [new Ball(0, this.width * 0.25, this.height / 2)];
    const others = [2,3,4,5,6,7,8];
    for(let i=others.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[others[i],others[j]]=[others[j],others[i]];}
    const order=[1,others[0],others[1],others[2],9,others[3],others[4],others[5],others[6]];
    const rows=[1,2,3,2,1],apexX=this.width*.72,apexY=this.height/2,spacing=cfg.radius*2.02;
    let idx=0;
    rows.forEach((count,row)=>{for(let col=0;col<count;col++){const x=apexX+row*spacing*.87,y=apexY-(count-1)*spacing/2+col*spacing;balls.push(new Ball(order[idx++],x,y));}});
    this.balls=balls;return balls;
  }

  getBall(number) { return this.balls.find(b => b.number === number && !b.pocketed); }
  get cueBall() { return this.getBall(0); }
  get activeBalls() { return this.balls.filter(b => !b.pocketed); }

  // Deep-cloneable plain state, for sending to Firebase / restoring mulligans.
  serialize() {
    return this.balls.map(b => ({ n: b.number, x: b.x, y: b.y, p: b.pocketed }));
  }
  deserialize(state) {
    this.balls = state.map(s => {
      const b = new Ball(s.n, s.x, s.y);
      b.pocketed = s.p;
      return b;
    });
  }
}

/**
 * Runs a full shot to rest, deterministically, given a starting table state
 * (all balls stationary except the cue ball, which gets an initial velocity).
 *
 * Returns { events, frames }:
 *  - events describes what happened overall (for 8-ball rules resolution).
 *  - frames is a ~60fps sequence of ball-position snapshots so the caller
 *    can play back the actual motion in real time instead of jump-cutting
 *    to the resting positions. Each frame also flags what happened during
 *    that slice of time (collided/cushioned/newPockets) so sound effects
 *    can be triggered in sync with what's on screen.
 */
function simulateShot(table, angleRad, power /* 0..1 */, opts) {
  opts = opts || {};
  const recordFrames = opts.recordFrames !== false;
  const cfg = GameConfig.physics;
  const cue = table.cueBall;
  const events = { pocketed: [], firstContact: null, cueScratched: false, cushionHitBeforeContact: false, railsHit: 0 };
  const frames = [];
  if (!cue) return { events, frames };

  const speed = power * cfg.maxShotSpeed;
  cue.vx = Math.cos(angleRad) * speed;
  cue.vy = Math.sin(angleRad) * speed;

  const dt = 1 / 120;
  const maxSteps = cfg.maxSimSeconds * 120;
  let firstContactLogged = false;

  const snapshot = () => table.balls.map(b => ({ n: b.number, x: b.x, y: b.y, pocketed: b.pocketed }));

  for (let step = 0; step < maxSteps; step++) {
    let moving = false;
    let collidedThisStep = false;
    let cushionThisStep = false;
    const pocketedBefore = events.pocketed.length;

    for (let s = 0; s < cfg.substeps; s++) {
      const stepMoving = physicsSubstep(table, dt / cfg.substeps, events, {
        onFirstContact: (contact) => {
          collidedThisStep = true;
          if (!firstContactLogged) { events.firstContact = contact; firstContactLogged = true; }
        },
        onCushion: () => {
          cushionThisStep = true;
          events.railsHit++;
          if (!firstContactLogged) events.cushionHitBeforeContact = true;
        }
      });
      moving = moving || stepMoving;
    }

    // Sample every 2nd physics step (120hz sim -> ~60fps of playback data).
    if (recordFrames && step % 2 === 0) {
      frames.push({
        balls: snapshot(),
        newPockets: events.pocketed.slice(pocketedBefore),
        collided: collidedThisStep,
        cushioned: cushionThisStep
      });
    }
    if (!moving) break;
  }

  // finalize: snap tiny residual velocities to zero
  table.activeBalls.forEach(b => { b.vx = 0; b.vy = 0; });

  if (recordFrames) frames.push({ balls: snapshot(), newPockets: [], collided: false, cushioned: false });

  return { events, frames };
}

function physicsSubstep(table, dt, events, hooks) {
  const cfg = GameConfig.physics;
  const balls = table.activeBalls;
  let anyMoving = false;

  // integrate + friction
  balls.forEach(b => {
    if (b.speed < cfg.minSpeed) { b.vx = 0; b.vy = 0; return; }
    anyMoving = true;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const frictionFactor = Math.pow(cfg.friction, dt * 120);
    b.vx *= frictionFactor;
    b.vy *= frictionFactor;
  });

  // cushions
  const r = table.rail, w = table.width, h = table.height;
  balls.forEach(b => {
    let bounced = false;
    if (b.x - b.radius < r) { b.x = r + b.radius; b.vx = -b.vx * GameConfig.table.cushionRestitution; bounced = true; }
    if (b.x + b.radius > w - r) { b.x = w - r - b.radius; b.vx = -b.vx * GameConfig.table.cushionRestitution; bounced = true; }
    if (b.y - b.radius < r) { b.y = r + b.radius; b.vy = -b.vy * GameConfig.table.cushionRestitution; bounced = true; }
    if (b.y + b.radius > h - r) { b.y = h - r - b.radius; b.vy = -b.vy * GameConfig.table.cushionRestitution; bounced = true; }
    if (bounced && b.isCue) hooks.onCushion();
  });

  // ball-ball collisions
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;
      if (dist > 0 && dist < minDist) {
        // separate
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;

        // elastic collision along normal (equal masses)
        const rel = { x: b.vx - a.vx, y: b.vy - a.vy };
        const velAlongNormal = rel.x * nx + rel.y * ny;
        if (velAlongNormal < 0) {
          const restitution = cfg.ballRestitution;
          const impulse = -(1 + restitution) * velAlongNormal / 2;
          a.vx -= impulse * nx; a.vy -= impulse * ny;
          b.vx += impulse * nx; b.vy += impulse * ny;

          if (a.isCue || b.isCue) {
            const other = a.isCue ? b : a;
            hooks.onFirstContact({ ball: other.number });
          }
        }
      }
    }
  }

  // pockets
  table.balls.forEach(b => {
    if (b.pocketed) return;
    for (const p of table.pockets) {
      const capture = p.corner ? table.pocketRadius : table.pocketRadius * 0.9;
      if (Math.hypot(b.x - p.x, b.y - p.y) < capture) {
        b.pocketed = true;
        b.vx = 0; b.vy = 0;
        events.pocketed.push(b.number);
        if (b.isCue) events.cueScratched = true;
      }
    }
  });

  return anyMoving;
}

if (typeof module !== 'undefined') module.exports = { Ball, PoolTable, simulateShot };
