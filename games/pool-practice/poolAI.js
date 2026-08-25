/* ============================================================
   poolAI.js
   A simplified but reasonable computer opponent. Not a full
   physics solver — it scores candidate (ball, pocket) pairs
   with cheap geometric heuristics, picks a good one, then adds
   aim/power noise scaled by difficulty so it never plays
   perfectly (even on Hard).
   ============================================================ */

const PoolAI = {
  /**
   * @param {PoolTable} table
   * @param {'solids'|'stripes'|null} group - AI's assigned group, or null if not yet decided
   * @param {'easy'|'medium'|'hard'} difficulty
   * @returns {{angle: number, power: number, targetBall: number|null}}
   */
  chooseShot(table, group, difficulty) {
    const diff = GameConfig.ai[difficulty] || GameConfig.ai.medium;
    const cue = table.cueBall;
    if (!cue) return { angle: 0, power: 0.5, targetBall: null };

    const legalBalls = this._legalTargets(table, group);
    let best = null;

    for (const ball of legalBalls) {
      for (const pocket of table.pockets) {
        const score = this._scoreShot(table, cue, ball, pocket);
        if (score !== null && (!best || score.value > best.value)) {
          best = { ball, pocket, ...score };
        }
      }
    }

    // Occasional deliberate "mistake": ignore the best option and pick a weaker one.
    if (best && Math.random() < diff.mistakeChance) {
      const alt = legalBalls[Math.floor(Math.random() * legalBalls.length)];
      const altPocket = table.pockets[Math.floor(Math.random() * table.pockets.length)];
      best = { ball: alt, pocket: altPocket, value: 0, aimAngle: this._angleToward(cue, alt) };
    }

    if (!best) {
      // No clear shot found — aim roughly at nearest legal ball (or any ball) with modest power.
      const fallbackTarget = legalBalls[0] || table.activeBalls.find(b => !b.isCue);
      const angle = fallbackTarget ? this._angleToward(cue, fallbackTarget) : Math.random() * Math.PI * 2;
      return this._applyError(angle, 0.5, diff, fallbackTarget ? fallbackTarget.number : null);
    }

    // Aim so the cue ball drives the target ball toward the chosen pocket.
    const aimPoint = this._ghostBallPosition(best.ball, best.pocket);
    const angle = Math.atan2(aimPoint.y - cue.y, aimPoint.x - cue.x);
    const dist = Math.hypot(best.ball.x - cue.x, best.ball.y - cue.y);
    const power = Math.min(1, 0.45 + dist / 900); // farther shots get more power

    return this._applyError(angle, power, diff, best.ball.number);
  },

  _legalTargets(table, group) {
    const active = table.activeBalls.filter(b => !b.isCue);
    if(group==='nine'){const lowest=Math.min(...active.map(b=>b.number));return active.filter(b=>b.number===lowest);}
    if (!group) return active.filter(b => !b.isEight); // open table: any non-eight ball
    const groupBalls = active.filter(b => group === 'solids' ? b.isSolid : b.isStripe);
    if (groupBalls.length > 0) return groupBalls;
    const eight = active.find(b => b.isEight);
    return eight ? [eight] : active;
  },

  _scoreShot(table, cue, ball, pocket) {
    const ballToPocket = Math.hypot(pocket.x - ball.x, pocket.y - ball.y);
    const cueToBall = Math.hypot(ball.x - cue.x, ball.y - cue.y);
    if (ballToPocket < 1 || cueToBall < 1) return null;

    // Cut angle: angle between (cue->ball) and (ball->pocket). Near 0 = straight in (easy).
    const v1 = { x: ball.x - cue.x, y: ball.y - cue.y };
    const v2 = { x: pocket.x - ball.x, y: pocket.y - ball.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
    const cutAngle = Math.acos(Math.max(-1, Math.min(1, dot / mag)));
    if (cutAngle > Math.PI * 0.42) return null; // too thin / behind the ball, not realistically pottable

    // simple obstruction check: any other ball too close to the cue->ball or ball->pocket line
    const obstruction = table.activeBalls.some(other => {
      if (other === ball || other.isCue) return false;
      return this._pointNearSegment(other, cue, ball) || this._pointNearSegment(other, ball, pocket);
    }) ? 0.5 : 1;

    const difficulty = ballToPocket + cueToBall * 0.6 + cutAngle * 260;
    const value = (5000 / (difficulty + 1)) * obstruction;
    return { value, aimAngle: this._angleToward(cue, ball) };
  },

  _pointNearSegment(point, a, b) {
    const r = GameConfig.ball.radius * 1.8;
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((point.x - a.x) * abx + (point.y - a.y) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + abx * t, py = a.y + aby * t;
    return Math.hypot(point.x - px, point.y - py) < r;
  },

  _ghostBallPosition(ball, pocket) {
    const dx = ball.x - pocket.x, dy = ball.y - pocket.y;
    const dist = Math.hypot(dx, dy) || 1;
    const r2 = GameConfig.ball.radius * 2;
    return { x: ball.x + (dx / dist) * r2, y: ball.y + (dy / dist) * r2 };
  },

  _angleToward(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
  },

  _applyError(angle, power, diff, targetBall) {
    const angleError = (Math.random() * 2 - 1) * (diff.aimErrorDeg * Math.PI / 180);
    const powerError = (Math.random() * 2 - 1) * diff.powerError;
    return {
      angle: angle + angleError,
      power: Math.max(0.15, Math.min(1, power + powerError)),
      targetBall
    };
  }
};

if (typeof module !== 'undefined') module.exports = PoolAI;
