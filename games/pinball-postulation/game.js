const canvas = document.getElementById('pinball');
const ctx = canvas.getContext('2d');
const GAME_CONFIG = { id: 'pinball-postulation', name: 'Pinball Postulation' };
function pinballCosmetic(id){ return typeof AchievementManager!=='undefined'&&Object.values(AchievementManager.getEquipped('pinball-postulation')).some(r=>r?.id===id); }
function pinballSecret(id){ return typeof AchievementManager!=='undefined'&&AchievementManager.hasSecret?.(id); }
let platformSessionStarted = false;

let W, H, scale;
const FEATURE_RAMP3 = true; // coral ramp — parallel-offset design, randomly appears each run
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  scale = Math.min(W / 460, H / 760);
}
resize();
window.addEventListener('resize', resize);

let ball = null, balls = [], ballsInPlay = false, lockedBalls = [], score = 0, lives = 3, gameStarted = false;
let uWellDestroyed=false,uWellPixels=[],nudgeUsed=false,tableShakeFrames=0;
const initialPlatformStats = PlatformManager.getGameStats(GAME_CONFIG.id);
let highScore = initialPlatformStats?.highScore || 0;
document.getElementById('high-score-value').textContent = highScore;
document.getElementById('home-high-score').textContent = highScore;
document.getElementById('home-correct').textContent = initialPlatformStats?.correct || 0;
document.getElementById('home-games').textContent = initialPlatformStats?.gamesPlayed || 0;
document.getElementById('home-cosmetics-btn').addEventListener('click', function(){
  window.AchievementManager?.renderGameRewardShop?.();
  const shop=document.getElementById('arcade-generated-shop');
  if(shop)shop.hidden=false;
  else setTimeout(()=>document.getElementById('arcade-generated-shop-button')?.click(),0);
});
let coins = PlatformManager.getCoins();
let runCoins = 0;
document.getElementById('coins-value').textContent = coins;
document.getElementById('home-coins').textContent = coins;
function addCoins(n) {
  runCoins = Math.max(0, runCoins + Math.floor(Number(n) || 0));
  document.getElementById('coins-value').textContent = runCoins;
  document.getElementById('home-coins').textContent = coins;
}
let leftFlipper = 0, rightFlipper = 0;
let leftPressed = false, rightPressed = false;
let gameOver = false;
const gravity = 0.225, friction = 0.999;
const TW = 400, TH = 700;
const ox = () => (W - TW * scale) / 2;
const oy = () => (H - TH * scale) / 2;

// Ramp system: curvy 2-ball-wide tubes that only physically touch the board at their two
// mounting points (small hemisphere posts) — the body itself doesn't block the ball, so
// other balls/obstacles can sit "underneath" it. A gentle push keeps a ball travelling
// through the tube from stalling, and both mouths give a bit of score plus a light pull-in.
function bezierPoint(pts, t) {
  let arr = pts;
  while (arr.length > 1) {
    const next = [];
    for (let i = 0; i < arr.length - 1; i++) {
      next.push({
        x: arr[i].x + (arr[i + 1].x - arr[i].x) * t,
        y: arr[i].y + (arr[i + 1].y - arr[i].y) * t
      });
    }
    arr = next;
  }
  return arr[0];
}
function buildCurvyPath(A, B, numMid, jitterRange, minX, maxX, minY, maxY) {
  const ctrl = [A];
  for (let i = 1; i <= numMid; i++) {
    const t = i / (numMid + 1);
    const baseX = A.x + (B.x - A.x) * t;
    const baseY = A.y + (B.y - A.y) * t; // straight interpolation, never modified — keeps
    // height strictly monotonic between the two mouths so the path can't fold into a U/V dip
    const jitter = (Math.random() - 0.5) * jitterRange;
    ctrl.push({
      x: Math.max(minX, Math.min(maxX, baseX + jitter)),
      y: Math.max(minY, Math.min(maxY, baseY))
    });
  }
  ctrl.push(B);
  const N = 28;
  const path = [];
  for (let i = 0; i <= N; i++) path.push(bezierPoint(ctrl, i / N));
  return path;
}
function buildSpiralPath(A, B, loops) {
  const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const rA = Math.hypot(A.x - M.x, A.y - M.y) || 1;
  const rB = Math.hypot(B.x - M.x, B.y - M.y) || 1;
  const angA = Math.atan2(A.y - M.y, A.x - M.x);
  let angB = Math.atan2(B.y - M.y, B.x - M.x);
  while (angB < angA) angB += Math.PI * 2;
  angB += loops * Math.PI * 2;
  const N = 70;
  const path = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ang = angA + (angB - angA) * t;
    const r = rA + (rB - rA) * t;
    path.push({ x: M.x + Math.cos(ang) * r, y: M.y + Math.sin(ang) * r });
  }
  return path;
}
function pathLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return len;
}
function buildWalls(path, halfW, flareExtra, flareCount) {
  const left = [], right = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const pPrev = path[Math.max(0, i - 1)];
    const pNext = path[Math.min(path.length - 1, i + 1)];
    const dx = pNext.x - pPrev.x, dy = pNext.y - pPrev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const distFromEnd = Math.min(i, path.length - 1 - i);
    const taper = Math.max(0, flareCount - distFromEnd) / flareCount;
    const w = halfW + flareExtra * taper;
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  }
  return { left, right };
}
// The tube's walls are solid along their entire length — the same resolveSegment collision
// used for every other obstacle on the board — so the ball can only ever get in or out
// through the two open ends, never by clipping through anywhere along the body.
function applyFullRampWalls(leftWall, rightWall, br) {
  for (let i = 0; i < leftWall.length - 1; i++) {
    resolveSegment(leftWall[i].x, leftWall[i].y, leftWall[i + 1].x, leftWall[i + 1].y, br);
    resolveSegment(rightWall[i].x, rightWall[i].y, rightWall[i + 1].x, rightWall[i + 1].y, br);
  }
}
// Simple speed-only accelerator at each mouth — no steering, just a push in whatever
// direction the ball is already moving.
function applyMouthAccelerator(mouth) {
  const dist = Math.hypot(ball.x - mouth.x, ball.y - mouth.y);
  if (dist < 26) {
    ball.vx *= 1.02; ball.vy *= 1.02;
    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd > 13) { ball.vx *= 13 / spd; ball.vy *= 13 / spd; }
  }
}
function applyRampPush(path) {
  let nearestIdx = -1, nearestDist = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot(ball.x - path[i].x, ball.y - path[i].y);
    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
  }
  if (nearestDist < 30) {
    const pPrev = path[Math.max(0, nearestIdx - 1)];
    const pNext = path[Math.min(path.length - 1, nearestIdx + 1)];
    let tx = pNext.x - pPrev.x, ty = pNext.y - pPrev.y;
    const tlen = Math.hypot(tx, ty) || 1;
    tx /= tlen; ty /= tlen;
    if (ball.vx * tx + ball.vy * ty < 0) { tx = -tx; ty = -ty; }
    // Gentle forward push so the ball can't stall out inside the tube
    ball.vx += tx * 0.2;
    ball.vy += ty * 0.2;
  }
  return nearestDist;
}
function checkMouthScore(point, key, pts) {
  if (!ball.rampMouthsScored.has(key) && Math.hypot(ball.x - point.x, ball.y - point.y) < 26) {
    ball.rampMouthsScored.add(key);
    addScore(pts);
  }
}

const MOUTH_MIN_DIST = 60; // minimum spacing so no two ramp openings ever overlap

// Ramp 2 (turquoise): fixed entrance at the bottom-middle of the top-left quadrant,
// randomized exit near the middle of the top half.
const rampA = { x: 110, y: 150 };
let rampB = { x: 200, y: 200 };
let ramp2Path = [], ramp2LeftWall = [], ramp2RightWall = [], ramp2Length = 0;
let ramp2Quarter1 = null, ramp2Quarter2 = null;
function generateRamp2() {
  let tries = 0;
  do {
    rampB = { x: 170 + Math.random() * 50, y: 130 + Math.random() * 170 };
    tries++;
  } while (tries < 20 && Math.hypot(rampB.x - rampA.x, rampB.y - rampA.y) < MOUTH_MIN_DIST);
  const numMid = 1 + Math.floor(Math.random() * 3); // 1-3 bends: single/double/triple curve
  ramp2Path = buildCurvyPath(rampA, rampB, numMid, 140, 28, 190, 28, 345);
  const walls = buildWalls(ramp2Path, 16, 8, 4);
  ramp2LeftWall = walls.left; ramp2RightWall = walls.right;
  ramp2Length = pathLength(ramp2Path);
  ramp2Quarter1 = ramp2Path[Math.round(ramp2Path.length * 0.25)];
  ramp2Quarter2 = ramp2Path[Math.round(ramp2Path.length * 0.75)];
}
generateRamp2();

// Ramp 3 (coral): follows the exact same shape as ramp 2, offset sideways to run parallel
// beside it — same length, so it's never longer. Each run it randomly appears on the left,
// appears on the right, or doesn't appear at all. Its body is only 1.1 ball-widths wide
// (much narrower than ramp 2's ~2 ball-widths), so it's a genuine precision shot, with the
// mouth flare scaled down to match — and it scores more to compensate for the difficulty.
let rampC = null, rampD = null;
let ramp3Path = [], ramp3LeftWall = [], ramp3RightWall = [];
let ramp3Active = false;
let ramp3Quarter1 = null, ramp3Quarter2 = null;
function generateRamp3() {
  const roll = Math.random();
  if (roll < 1 / 3) {
    // Doesn't appear this run
    ramp3Active = false;
    rampC = null; rampD = null;
    ramp3Path = []; ramp3LeftWall = []; ramp3RightWall = [];
    ramp3Quarter1 = null; ramp3Quarter2 = null;
    return;
  }
  const side = roll < 2 / 3 ? 1 : -1;
  const offset = 34;
  ramp3Path = ramp2Path.map((p, i) => {
    const pPrev = ramp2Path[Math.max(0, i - 1)];
    const pNext = ramp2Path[Math.min(ramp2Path.length - 1, i + 1)];
    const dx = pNext.x - pPrev.x, dy = pNext.y - pPrev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    return {
      x: Math.max(24, Math.min(376, p.x + nx * offset * side)),
      y: Math.max(24, Math.min(676, p.y + ny * offset * side))
    };
  });
  rampC = ramp3Path[0];
  rampD = ramp3Path[ramp3Path.length - 1];
  const halfW = 8.8; // 1.1 ball-diameters wide through the body
  const flareExtra = 1.8; // mouth flare scaled down to match the narrower body
  const walls = buildWalls(ramp3Path, halfW, flareExtra, 4);
  ramp3LeftWall = walls.left; ramp3RightWall = walls.right;
  ramp3Quarter1 = ramp3Path[Math.round(ramp3Path.length * 0.25)];
  ramp3Quarter2 = ramp3Path[Math.round(ramp3Path.length * 0.75)];
  ramp3Active = true;
}
if (FEATURE_RAMP3) generateRamp3();

// Randomize bumper positions in upper area
function randomBumperPos() {
  // Top-right corner only: above the middle, right of center — top-left is reserved for something else.
  // Kept clear of both ramps' entrance/exit so bumpers don't block them or sit tangent to their mouths.
  // Capped well short of the right wall (330 max) so there's always more than a ball's diameter
  // of clearance between the bumper and the wall — too little room there traps the ball in a
  // rapid wall/bumper bounce loop.
  let pos, tries = 0;
  do {
    pos = { x: 210 + Math.random() * 100, y: 80 + Math.random() * 240 };
    tries++;
  } while (tries < 20 && (
    Math.hypot(pos.x - rampA.x, pos.y - rampA.y) < 60 ||
    Math.hypot(pos.x - rampB.x, pos.y - rampB.y) < 60 ||
    (ramp3Active && Math.hypot(pos.x - rampC.x, pos.y - rampC.y) < 60) ||
    (ramp3Active && Math.hypot(pos.x - rampD.x, pos.y - rampD.y) < 60)
  ));
  return pos;
}
function randomBumpers() {
  const bs = [];
  for (let i = 0; i < 3; i++) {
    let placed = false;
    while (!placed) {
      const { x, y } = randomBumperPos();
      let ok = true;
      for (const b of bs) {
        if (Math.hypot(b.x - x, b.y - y) < 70) { ok = false; break; }
      }
      if (ok) { bs.push({ x, y, r: 16.5, hit: 0 }); placed = true; }
    }
  }
  return bs;
}
let bumpers = randomBumpers();

// Triangle obstacle, centered at y=375 (left side, middle area)
const triangle = [
  { x: 100, y: 355 },
  { x: 160, y: 375 },
  { x: 100, y: 395 }
];
// Lightning rotation: exactly one of the three triangles is electrified at a time, handing
// off to the next in a 360-frame (6s) cycle — 120 frames (2s) lit per triangle, so each one
// individually gets 4s dark between its turns. The order is shuffled each run.
// Role indices: 0 = main triangle (orange), 1 = triangle2 (yellow), 2 = sideTriangle (green)
let triangleTimer = 0;
let triangleOrder = [0, 1, 2];
function shuffleTriangleOrder() {
  triangleOrder = [0, 1, 2];
  for (let i = triangleOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [triangleOrder[i], triangleOrder[j]] = [triangleOrder[j], triangleOrder[i]];
  }
}
shuffleTriangleOrder();
function isTriangleGlowing(role) {
  const phase = Math.floor(triangleTimer / 120);
  return triangleOrder[phase] === role;
}

// Second triangle obstacle (right side, lower area), marked in neon cyan
const triangle2 = [
  { x: 375, y: 481 },
  { x: 335, y: 505 },
  { x: 375, y: 530 }
];

// Small triangle obstacle near the left flipper pocket
const sideTriangle = [
  { x: 80, y: 490 },
  { x: 80, y: 560 },
  { x: 105, y: 525 }
];

const flipY = 600;
// Side gutter boundaries
const gutterWidth = 30;

// Flipper geometry: pivots moved 5px further out, length extended 5px toward the middle,
// and the rest angle tilted down 20 degrees (flippers swing up from a lowered rest position)
const flipperPivotL = 75;
const flipperPivotR = 325;
const flipperLen = 85;
const flipperRestTilt = 20 * Math.PI / 180;


// Spinner obstacle: a rotating bar that scores on impact
let spinner = { x: 200, y: 475, len: 26, angle: 0, spin: 0, phase: 0 };
function generateSpinnerPosition() {
  spinner.y = 450 + Math.random() * 50;
  spinner.phase = Math.random() * Math.PI * 2;
}
generateSpinnerPosition();

// Drop targets: row of 3 rectangles that disappear when hit, reset once all are down
function freshDropTargets() {
  // 6 equal gaps across the 360px playfield width (20 to 380) puts targets equidistant
  // from each other and from the walls
  return [
    { x: 80, y: 400, w: 24, h: 12, down: false },
    { x: 140, y: 400, w: 24, h: 12, down: false },
    { x: 200, y: 400, w: 24, h: 12, down: false },
    { x: 260, y: 400, w: 24, h: 12, down: false },
    { x: 320, y: 400, w: 24, h: 12, down: false }
  ];
}
let dropTargets = freshDropTargets();
let dropTargetsResetTimer = 0;

// Ramp: a scoring gate near the top with guide rails funneling into it
const ramp = { x1: 165, x2: 235, y: 65, flash: 0 };
// Score gates: pass the ball through either lane for a bonus (once per ball, per gate)
const scoreGates = [
  { x1: 65, x2: 125, y: 340, flash: 0 },
  { x1: 275, x2: 335, y: 340, flash: 0 }
];

// U-well: a pocket carved into the left wall (x 20-50, y 495-550). A ball that comes to
// rest in it gets locked in place, and 2 fresh balls drop from the top to start multiball.
const U_WELL = { x1: 20, x2: 50, yTop: 495, yBottom: 550 };
function makeBall(x, y, vx, vy, canTriggerWell = true) {
  return {
    x, y, vx, vy, rampScored: false, gatesScored: new Set(), rampMouthsScored: new Set(),
    wellFreeze: false, wellTimer: 0, wellExitVX: 0, wellExitVY: 0, uWellRest: 0, canTriggerWell, cosmeticTrail:[]
  };
}
function launchBall() {
  if (!gameStarted || gameOver || balls.length > 0) return;
  const dropX = 80 + Math.random() * (TW - 160);
  balls.push(makeBall(dropX, 35, (Math.random() - 0.5) * 1.5, 1.125 + Math.random() * 1.125));
  if (pinballSecret('secret_twin_shot')) balls.push(makeBall(dropX + 18, 35, (Math.random() - 0.5) * 1.5, 1.125 + Math.random() * 1.125));
  ballsInPlay = true;
}

// ── Question-gated launching ──────────────────────────────────────────────
// Launching a ball isn't free: every time the player needs a new ball, they
// must answer a random question first — 1 correct answer earns 1 ball.
// Questions are drawn from the shared QuestionManager (multichoice,
// category, or matching bank, picked at random each time), which requires a
// real platform class code to load actual banks. There is deliberately no
// sample-question fallback: Pinball always uses the class selected in the Hub.
let multichoiceBank = null, categoryBank = null, matchingBank = null;
let questionBankReady = false;
let questionModalOpen = false;
let currentQuestion = null;

async function initQuestionBanks() {
  let loadedAny = false;
  const message = document.getElementById('bank-message');
  const startButton = document.getElementById('start-btn');
  if (window.QuestionManager && window.PlatformManager && PlatformManager.hasClassCode && PlatformManager.hasClassCode()) {
    const mc = await QuestionManager.loadCurrentBank('multichoice');
    if (mc.ok) { multichoiceBank = QuestionManager.questions.slice(); loadedAny = true; }
    const cat = await QuestionManager.loadCurrentBank('category');
    if (cat.ok) { categoryBank = QuestionManager.questions.slice(); loadedAny = true; }
    const match = await QuestionManager.loadCurrentBank('matching');
    if (match.ok) { matchingBank = QuestionManager.questions.slice(); loadedAny = true; }
  }
  questionBankReady = loadedAny;
  startButton.disabled = !loadedAny;
  if (loadedAny) {
    message.textContent = `Questions loaded for class ${PlatformManager.getClassCode()}.`;
    message.classList.remove('error');
  } else {
    message.textContent = PlatformManager.hasClassCode()
      ? 'No compatible questions were found for this class.'
      : 'Return to the Hub and enter your class code before playing.';
    message.classList.add('error');
  }
}
initQuestionBanks();

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Builds one question, picking a random type each time, and normalizes all
// three bank shapes down to the same { type, question, options, correctIndex, raw } shape
function getRandomQuizQuestion() {
  const types = [];
  if (multichoiceBank && multichoiceBank.length) types.push('multichoice');
  if (categoryBank && categoryBank.length) types.push('category');
  if (matchingBank && matchingBank.length) types.push('matching');
  if (types.length === 0) return null;
  const type = types[Math.floor(Math.random() * types.length)];

  if (type === 'multichoice') {
    QuestionManager.questions = multichoiceBank;
    const q = QuestionManager.getRandomQuestion();
    return { type, question: q.q, options: q.a, correctIndex: q.c, raw: q };
  }
  if (type === 'category') {
    QuestionManager.questions = categoryBank;
    const q = QuestionManager.getRandomQuestion();
    const correctAnswer = q.correct[Math.floor(Math.random() * q.correct.length)];
    const distractors = shuffleArray(q.distractors).slice(0, 3);
    const options = shuffleArray([correctAnswer, ...distractors]);
    return { type, question: `Which of these belongs to: ${q.prompt}?`, options, correctIndex: options.indexOf(correctAnswer), raw: q };
  }
  // matching
  QuestionManager.questions = matchingBank;
  const q = QuestionManager.getRandomQuestion();
  const distractors = QuestionManager.getDistractors(q, 3).map(d => d.definition);
  const options = shuffleArray([q.definition, ...distractors]);
  return { type, question: `What is the definition of: ${q.term}?`, options, correctIndex: options.indexOf(q.definition), raw: q };
}

function requestLaunch() {
  if (!gameStarted || gameOver || balls.length > 0 || questionModalOpen) return;
  if (!questionBankReady) return;
  showQuestion();
}

function showQuestion() {
  const q = getRandomQuizQuestion();
  if (!q) return;
  currentQuestion = q;
  questionModalOpen = true;
  const typeLabels = { multichoice: 'Multiple Choice', category: 'Category', matching: 'Matching' };
  document.getElementById('question-type-label').textContent = typeLabels[q.type];
  document.getElementById('question-text').textContent = q.question;
  document.getElementById('question-feedback').textContent = '';
  const optsEl = document.getElementById('question-options');
  optsEl.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'canva-button px-4 py-3 rounded font-bold text-sm clickable';
    btn.style.pointerEvents = 'all';
    btn.textContent = opt;
    btn.onclick = () => answerQuestion(i);
    optsEl.appendChild(btn);
  });
  document.getElementById('question-overlay').classList.remove('hidden');
}

function answerQuestion(selectedIndex) {
  if (!questionModalOpen || !currentQuestion) return;
  const q = currentQuestion;
  const correct = selectedIndex === q.correctIndex;
  const buttons = document.querySelectorAll('#question-options button');
  buttons.forEach(b => b.style.pointerEvents = 'none');
  buttons[selectedIndex].style.borderColor = correct ? 'var(--arcade-answer-correct, #00ff88)' : 'var(--arcade-answer-incorrect, #ff3b3b)';
  if (!correct && q.correctIndex >= 0) buttons[q.correctIndex].style.borderColor = 'var(--arcade-answer-correct, #00ff88)';
  const feedback = document.getElementById('question-feedback');
  if (correct) {
    addCoins(10);
    feedback.textContent = 'Correct! +1 ball, +10 coins';
    feedback.style.color = '#00ff88';
  } else {
    addCoins(-5);
    feedback.textContent = 'Not quite — -5 coins, try another question';
    feedback.style.color = '#ff3b3b';
  }
  PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, correct);
  if (window.QuestionManager && q.raw) QuestionManager.recordAnswer(q.raw, correct);
  setTimeout(() => {
    document.getElementById('question-overlay').classList.add('hidden');
    questionModalOpen = false;
    currentQuestion = null;
    if (correct) launchBall();
  }, correct ? 700 : 2000);
}

function restartGame() {
  runCoins = 0;
  score = 0; lives = 3; gameOver = false; ball = null; balls = []; ballsInPlay = false; lockedBalls = [];
  combo = 0; comboTimer = 0;
  document.getElementById('combo-label').classList.add('hidden');
  shuffleTriangleOrder();
  triangleTimer = 0;
  scorePopups = [];
  generateRamp2();
  if (FEATURE_RAMP3) generateRamp3();
  bumpers = randomBumpers();
  dropTargets = freshDropTargets();
  dropTargetsResetTimer = 0;
  spinner.spin = 0;uWellDestroyed=false;uWellPixels=[];nudgeUsed=false;tableShakeFrames=0;
  generateSpinnerPosition();
  generateRandomElements();
  generateWells();
  document.getElementById('score-value').textContent = '0';
  document.getElementById('new-high-score').classList.add('hidden');
  document.getElementById('game-over-overlay').classList.add('hidden');
  document.getElementById('question-overlay').classList.add('hidden');
  questionModalOpen = false;
  syncNudgeButton();
}

function returnToHome() {
  restartGame();
  gameStarted = false;
  const latestStats = PlatformManager.getGameStats(GAME_CONFIG.id);
  document.getElementById('home-high-score').textContent = highScore;
  document.getElementById('home-coins').textContent = PlatformManager.getCoins();
  document.getElementById('home-correct').textContent = latestStats?.correct || 0;
  document.getElementById('home-games').textContent = latestStats?.gamesPlayed || 0;
  document.getElementById('home-screen').classList.remove('hidden');
}

function startFromHomeScreen() {
  if (!questionBankReady) return;
  gameStarted = true;
  if (!platformSessionStarted) {
    PlatformManager.startSession(GAME_CONFIG.id);
    platformSessionStarted = true;
  }
  document.getElementById('home-screen').classList.add('hidden');
  restartGame();
}
function syncNudgeButton(){const btn=document.getElementById('table-nudge-btn'),enabled=window.AchievementManager?.hasBoost?.('pinball-postulation_table_nudge');btn.classList.toggle('hidden',!enabled||!gameStarted);btn.disabled=nudgeUsed||!balls.length;}
document.getElementById('table-nudge-btn').onclick=()=>{if(nudgeUsed||!balls.length)return;nudgeUsed=true;tableShakeFrames=28;syncNudgeButton();};

const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space') requestLaunch(); });
document.addEventListener('keyup', e => { keys[e.code] = false; });

const leftBtn = document.getElementById('left-flip-btn');
const rightBtn = document.getElementById('right-flip-btn');
function addPressEvents(el, setFn) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); setFn(true); });
  el.addEventListener('pointerup', () => setFn(false));
  el.addEventListener('pointerleave', () => setFn(false));
  el.addEventListener('pointercancel', () => setFn(false));
}
addPressEvents(leftBtn, v => { leftPressed = v; });
addPressEvents(rightBtn, v => { rightPressed = v; });

function pointInTriangle(px, py, t) {
  const [a, b, c] = t;
  const d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
  const d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
  const d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

// Wall bumps: random protruding bumper pieces embedded in the left/right outer walls
let wallBumps = [];
function generateWallBumps() {
  wallBumps = [];
  const config = ['none', 'left', 'right', 'both'][Math.floor(Math.random() * 4)];
  const r = 26;
  if (config === 'left' || config === 'both') {
    wallBumps.push({ side: 'left', y: 150 + Math.random() * 380, r, hit: 0 });
  }
  if (config === 'right' || config === 'both') {
    wallBumps.push({ side: 'right', y: 150 + Math.random() * 380, r, hit: 0 });
  }
}

// Speed zones: one accelerator, one decelerator, placed randomly each run
let speedZone = null, slowZone = null;
function randomZonePos() {
  return { x: 60 + Math.random() * (TW - 120), y: 130 + Math.random() * 380 };
}
function generateSpeedZones() {
  const p1 = randomZonePos();
  let p2 = randomZonePos();
  let tries = 0;
  while (Math.hypot(p1.x - p2.x, p1.y - p2.y) < 90 && tries < 10) { p2 = randomZonePos(); tries++; }
  speedZone = { x: p1.x, y: p1.y, r: 32 };
  slowZone = { x: p2.x, y: p2.y, r: 32 };
}

// Directional push zone: one zone that shoves the ball in a random fixed direction each run
let pushZone = null;
function generatePushZone() {
  let p = randomZonePos();
  let tries = 0;
  while ((Math.hypot(p.x - speedZone.x, p.y - speedZone.y) < 90 ||
          Math.hypot(p.x - slowZone.x, p.y - slowZone.y) < 90) && tries < 10) { p = randomZonePos(); tries++; }
  pushZone = { x: p.x, y: p.y, r: 32, angle: Math.random() * Math.PI * 2 };
}

// Feature toggles: set to true to bring these back later
const FEATURE_SPEED_ZONES = false;
const FEATURE_PUSH_ZONE = false;
// Debug ruler along the left/bottom edges showing table coordinates — set to false to hide
const SHOW_COORDINATES = true;

function generateRandomElements() {
  generateWallBumps();
  if (FEATURE_SPEED_ZONES) { generateSpeedZones(); } else { speedZone = null; slowZone = null; }
  if (FEATURE_PUSH_ZONE) { generatePushZone(); } else { pushZone = null; }
}
generateRandomElements();

// Wells: 4 spots in the left/right margins (x 0-100 or x 300-400, y 0-550), kept at least
// 100px from every other object on the board. Entering one sends the ball to a random other
// well, where it pauses for 1s (showing an arrow for the direction it'll leave in) before
// launching — keeping the exact speed and direction it had when it entered, just relocated.
const WELL_RADIUS = 16;
let wells = [];
function triCentroid(t) { return { x: (t[0].x + t[1].x + t[2].x) / 3, y: (t[0].y + t[1].y + t[2].y) / 3 }; }
function collectObstaclePoints() {
  const pts = [rampA, rampB, { x: flipperPivotL, y: flipY }, { x: flipperPivotR, y: flipY },
    triCentroid(triangle), triCentroid(triangle2), triCentroid(sideTriangle), spinner,
    { x: (U_WELL.x1 + U_WELL.x2) / 2, y: (U_WELL.yTop + U_WELL.yBottom) / 2 }];
  if (FEATURE_RAMP3 && ramp3Active) pts.push(rampC, rampD);
  for (const b of bumpers) pts.push(b);
  for (const w of wallBumps) pts.push({ x: w.side === 'left' ? 20 : 380, y: w.y });
  for (const t of dropTargets) pts.push(t);
  for (const g of scoreGates) { pts.push({ x: g.x1, y: g.y }); pts.push({ x: g.x2, y: g.y }); }
  return pts;
}
function generateWells() {
  const obstacles = collectObstaclePoints();
  wells = [];
  for (let i = 0; i < 4; i++) {
    let pos = null;
    for (const minDist of [100, 80, 60, 40, 20]) {
      for (let tries = 0; tries < 150 && !pos; tries++) {
        const leftSide = Math.random() < 0.5;
        const candidate = {
          x: leftSide ? (20 + WELL_RADIUS) + Math.random() * (100 - (20 + WELL_RADIUS))
                      : 300 + Math.random() * ((380 - WELL_RADIUS) - 300),
          y: 75 + Math.random() * (550 - 75)
        };
        const ok = !wells.some(w => Math.hypot(w.x - candidate.x, w.y - candidate.y) < minDist) &&
                   !obstacles.some(o => Math.hypot(o.x - candidate.x, o.y - candidate.y) < minDist);
        if (ok) pos = candidate;
      }
      if (pos) break;
    }
    if (!pos) {
      const leftSide = Math.random() < 0.5;
      pos = {
        x: leftSide ? (20 + WELL_RADIUS) + Math.random() * (100 - (20 + WELL_RADIUS))
                    : 300 + Math.random() * ((380 - WELL_RADIUS) - 300),
        y: 75 + Math.random() * (550 - 75)
      };
    }
    pos.cooldown = 0;
    wells.push(pos);
  }
}
generateWells();

function resolveSegment(x1, y1, x2, y2, br) {
  const gx = x2 - x1, gy = y2 - y1;
  const lenSq = gx * gx + gy * gy;
  const t = Math.max(0, Math.min(1, ((ball.x - x1) * gx + (ball.y - y1) * gy) / lenSq));
  const cx = x1 + t * gx, cy = y1 + t * gy;
  let nx = ball.x - cx, ny = ball.y - cy;
  const dist = Math.hypot(nx, ny);
  if (dist < br) {
    if (dist < 0.001) { nx = -gy; ny = gx; }
    const nLen = Math.hypot(nx, ny);
    nx /= nLen; ny /= nLen;
    ball.x = cx + nx * (br + 0.5);
    ball.y = cy + ny * (br + 0.5);
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 0.9 * dot * nx;
      ball.vy -= 0.9 * dot * ny;
      applyNudgeCollisionImpulse();
    }
  }
}

// The nudge moves the table, never the ball directly. Its momentum is only
// transferred when the ball actually makes contact with table geometry.
function applyNudgeCollisionImpulse() {
  if (tableShakeFrames <= 0) return;
  ball.vx += Math.sin(tableShakeFrames * 2.8) * 0.85;
  ball.vy += Math.cos(tableShakeFrames * 2.15) * 0.55;
}

// Forces the ball toward the middle of the table when it's within ~2px of a guard segment's
// inside surface, regardless of the angle it arrived at — prevents it from getting stuck in the corner
function guardPush(x1, y1, x2, y2, br) {
  const gx = x2 - x1, gy = y2 - y1;
  const lenSq = gx * gx + gy * gy;
  const t = Math.max(0, Math.min(1, ((ball.x - x1) * gx + (ball.y - y1) * gy) / lenSq));
  const cx = x1 + t * gx, cy = y1 + t * gy;
  const dist = Math.hypot(ball.x - cx, ball.y - cy);
  if (dist < br + 2) {
    const speed = Math.max(Math.hypot(ball.vx, ball.vy), 1.875);
    const dir = ball.x < TW / 2 ? 1 : -1;
    ball.vx = dir * speed;
    ball.vy = 0;
  }
}

// Segment-based flipper collision so the bounce matches the flipper's actual drawn angle,
// instead of a static box that drifts out of sync as the flipper swings and tilts.
// angularVel is how fast the flipper moved this frame (its swing speed) — a still flipper
// only gives the ball a normal elastic bounce, an actively swinging one transfers extra force.
function flipperHit(pivotX, pivotY, tipX, tipY, angularVel, br) {
  const gx = tipX - pivotX, gy = tipY - pivotY;
  const lenSq = gx * gx + gy * gy;
  const t = Math.max(0, Math.min(1, ((ball.x - pivotX) * gx + (ball.y - pivotY) * gy) / lenSq));
  const cx = pivotX + t * gx, cy = pivotY + t * gy;
  const dx = ball.x - cx, dy = ball.y - cy;
  const dist = Math.hypot(dx, dy);
  const rad = 6;
  if (dist < rad + br) {
    const nx = dist > 0.001 ? dx / dist : 0;
    const ny = dist > 0.001 ? dy / dist : -1;
    ball.x = cx + nx * (rad + br + 0.5);
    ball.y = cy + ny * (rad + br + 0.5);
    const dot = ball.vx * nx + ball.vy * ny;
    const bounce = Math.max(-dot, 0) * 1.7 + 2.25;
    ball.vx = nx * bounce;
    ball.vy = ny * bounce - Math.max(angularVel, 0) * 19.5;
  }
}

let scorePopups = [];
let combo = 0, comboTimer = 0;
const COMBO_WINDOW = 150; // ~2.5s at 60fps to keep a combo alive
function comboMultiplier() {
  return 1 + Math.min(combo, 8) * 0.25; // builds up to 3x at an 8-hit combo
}
function addScore(basePts) {
  combo++;
  comboTimer = COMBO_WINDOW;
  const mult = comboMultiplier();
  const pts = Math.round(basePts * mult);
  score += pts;
  window.ChallengeManager?.update?.({score,alive:true});
  document.getElementById('score-value').textContent = score;
  const comboLabel = document.getElementById('combo-label');
  if (mult > 1) {
    comboLabel.classList.remove('hidden');
    document.getElementById('combo-value').textContent = mult.toFixed(2);
  } else {
    comboLabel.classList.add('hidden');
  }
  if (ball) {
    scorePopups.push({ x: ball.x, y: ball.y, text: mult > 1 ? `+${pts} x${mult.toFixed(2)}` : '+' + pts, life: 40 });
  }
}
function saveScoreAfterDrain(){if(score>highScore){highScore=score;document.getElementById('high-score-value').textContent=highScore;document.getElementById('home-high-score').textContent=highScore;PlatformManager.setHighScore(GAME_CONFIG.id,highScore);}}

function update() {
  const lActive = keys['KeyZ'] || keys['ArrowLeft'] || leftPressed;
  const rActive = keys['KeyM'] || keys['ArrowRight'] || rightPressed;
  const prevLeftFlipper = leftFlipper, prevRightFlipper = rightFlipper;
  leftFlipper += ((lActive ? 0.5 : 0) - leftFlipper) * 0.3;
  rightFlipper += ((rActive ? 0.5 : 0) - rightFlipper) * 0.3;
  const leftFlipperVel = leftFlipper - prevLeftFlipper;
  const rightFlipperVel = rightFlipper - prevRightFlipper;

  spinner.angle += spinner.spin;
  spinner.spin *= 0.95;
  spinner.phase += 0.0087; // slow drift, full cycle roughly every 12 seconds
  spinner.x = 200 + Math.sin(spinner.phase) * 65; // stays within the middle third of the table width
  triangleTimer = (triangleTimer + 1) % 360; // 3 x 120-frame (2s) slots — one triangle lit at a time
  if (ramp.flash > 0) ramp.flash--;
  for (const g of scoreGates) {
    if (g.flash > 0) g.flash--;
  }
  if (dropTargetsResetTimer > 0) {
    dropTargetsResetTimer--;
    if (dropTargetsResetTimer === 0) dropTargets = freshDropTargets();
  }
  for (const w of wells) {
    if (w.cooldown > 0) w.cooldown--;
  }
  if (comboTimer > 0) {
    comboTimer--;
    if (comboTimer === 0) {
      combo = 0;
      document.getElementById('combo-label').classList.add('hidden');
    }
  }
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    scorePopups[i].y -= 0.5;
    scorePopups[i].life--;
    if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
  }

  if (gameOver) return;

  for (let __bi = balls.length - 1; __bi >= 0; __bi--) {
    ball = balls[__bi];
    let __locked = false;

    if (ball.wellFreeze) {
      ball.wellTimer--;
      if (ball.wellTimer <= 0) {
        ball.wellFreeze = false;
        ball.vx = ball.wellExitVX;
        ball.vy = ball.wellExitVY;
        const spd = Math.hypot(ball.vx, ball.vy) || 1;
        // Nudge just outside the well's radius in the exit direction so it doesn't
        // immediately re-trigger the well it's leaving from
        ball.x += (ball.vx / spd) * (WELL_RADIUS + 2);
        ball.y += (ball.vy / spd) * (WELL_RADIUS + 2);
      }
      continue;
    }

    ball.vy += gravity;
    ball.vx *= friction;
    ball.vy *= friction;
    ball.x += ball.vx;
    ball.y += ball.vy;
    if(pinballCosmetic('pinball-postulation_fireball_trail')){ball.cosmeticTrail.push({x:ball.x,y:ball.y,life:20});if(ball.cosmeticTrail.length>20)ball.cosmeticTrail.shift();ball.cosmeticTrail.forEach(p=>p.life--);}

    const br = 8;

    // Wells: entering one relocates the ball to a random other well, preserving its exact
    // speed and direction, and pauses it there for 1s before launching it back out. A well
    // that was just teleported to goes on a 10s cooldown and can't be entered OR chosen as
    // a destination during that time.
    for (const w of wells) {
      if (w.cooldown > 0) continue;
      if (Math.hypot(ball.x - w.x, ball.y - w.y) < WELL_RADIUS) {
        let others = wells.filter(o => o !== w && o.cooldown === 0);
        if (others.length === 0) others = wells.filter(o => o !== w); // fallback if everything else is cooling down
        if (others.length === 0) break; // only one well exists — nowhere to send it
        const dest = others[Math.floor(Math.random() * others.length)];
        addScore(200);
        ball.wellExitVX = ball.vx;
        ball.wellExitVY = ball.vy;
        ball.x = dest.x;
        ball.y = dest.y;
        ball.vx = 0;
        ball.vy = 0;
        ball.wellFreeze = true;
        ball.wellTimer = 60;
        dest.cooldown = 600; // 10 seconds at 60fps
        break;
      }
    }
    if (ball.wellFreeze) continue;

  // Mint ramp: solid walls along its entire length, same collision as every other obstacle
  // on the board — the ball can only get in or out through the two open ends.
  applyFullRampWalls(ramp2LeftWall, ramp2RightWall, br);
  applyMouthAccelerator(rampA);
  applyMouthAccelerator(rampB);
  applyRampPush(ramp2Path);
  checkMouthScore(rampA, 'A', 100);
  checkMouthScore(rampB, 'B', 100);
  checkMouthScore(ramp2Quarter1, 'ramp2q1', 50);
  checkMouthScore(ramp2Quarter2, 'ramp2q2', 50);
  if (FEATURE_RAMP3 && ramp3Active) {
    applyFullRampWalls(ramp3LeftWall, ramp3RightWall, br);
    applyMouthAccelerator(rampC);
    applyMouthAccelerator(rampD);
    applyRampPush(ramp3Path);
    checkMouthScore(rampC, 'C', 350);
    checkMouthScore(rampD, 'D', 350);
    checkMouthScore(ramp3Quarter1, 'ramp3q1', 100);
    checkMouthScore(ramp3Quarter2, 'ramp3q2', 100);
  }

  const leftWall = 20;
  const rightWall = TW - 20;
  const gutterInnerLeft = leftWall + gutterWidth;
  const gutterInnerRight = rightWall - gutterWidth;

  // Top wall
  if (ball.y < 20 + br) { ball.y = 20 + br; ball.vy = Math.abs(ball.vy) * 0.4; }

  // Outer side walls
  if (ball.x < leftWall + br) { ball.x = leftWall + br; ball.vx = Math.abs(ball.vx) * 0.4; }
  if (ball.x > rightWall - br) { ball.x = rightWall - br; ball.vx = -Math.abs(ball.vx) * 0.4; }

  // Short 45-degree corner walls with 20px raised, inward-turning ends.
  const cornerTopY = flipY - 20;
  // The left guard's vertical segment overlaps the U-well's footprint (both sit at x=50,
  // y 490-580 vs the well's y 495-550) — skip it there so guardPush's forced-velocity
  // behavior can't fight the U-well's own walls and rest detection.
  const inUWellZone = ball.x < U_WELL.x2 + 10 && ball.y > U_WELL.yTop - 10 && ball.y < U_WELL.yBottom + 10;
  if (!inUWellZone) {
    resolveSegment(gutterInnerLeft, cornerTopY, gutterInnerLeft, cornerTopY - 90, br);
    guardPush(gutterInnerLeft, cornerTopY, gutterInnerLeft, cornerTopY - 90, br);
  }
  resolveSegment(gutterInnerLeft, cornerTopY, 100, flipY + 30, br);
  guardPush(gutterInnerLeft, cornerTopY, 100, flipY + 30, br);
  resolveSegment(gutterInnerRight, cornerTopY, gutterInnerRight, cornerTopY - 20, br);
  guardPush(gutterInnerRight, cornerTopY, gutterInnerRight, cornerTopY - 20, br);
  resolveSegment(gutterInnerRight, cornerTopY, 300, flipY + 30, br);
  guardPush(gutterInnerRight, cornerTopY, 300, flipY + 30, br);

  for (const b of bumpers) {
    const dx = ball.x - b.x, dy = ball.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist < b.r + br) {
      const angle = Math.atan2(dy, dx);
      const speed = Math.hypot(ball.vx, ball.vy);
      const reboundSpeed = Math.max(speed * 0.5, 3);
      ball.vx = Math.cos(angle) * reboundSpeed;
      ball.vy = Math.sin(angle) * reboundSpeed;
      applyNudgeCollisionImpulse();
      ball.x = b.x + Math.cos(angle) * (b.r + br + 1);
      ball.y = b.y + Math.sin(angle) * (b.r + br + 1);
      addScore(100);
      b.hit = 6;
    }
    if (b.hit > 0) b.hit--;
  }

  // Wall bumps: protruding bumper pieces embedded in the outer walls
  for (const w of wallBumps) {
    const wx = w.side === 'left' ? leftWall : rightWall;
    const dx = ball.x - wx, dy = ball.y - w.y;
    const dist = Math.hypot(dx, dy);
    if (dist < w.r + br) {
      const angle = Math.atan2(dy, dx);
      const speed = Math.hypot(ball.vx, ball.vy);
      const reboundSpeed = Math.max(speed * 0.6, 3);
      ball.vx = Math.cos(angle) * reboundSpeed;
      ball.vy = Math.sin(angle) * reboundSpeed;
      applyNudgeCollisionImpulse();
      ball.x = wx + Math.cos(angle) * (w.r + br + 1);
      ball.y = w.y + Math.sin(angle) * (w.r + br + 1);
      addScore(50);
      w.hit = 6;
    }
    if (w.hit > 0) w.hit--;
  }

  // Speed zones: continuously accelerate or decelerate the ball while inside
  if (speedZone && Math.hypot(ball.x - speedZone.x, ball.y - speedZone.y) < speedZone.r) {
    ball.vx *= 1.03; ball.vy *= 1.03;
    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd > 14) { ball.vx *= 14 / spd; ball.vy *= 14 / spd; }
  }
  if (slowZone && Math.hypot(ball.x - slowZone.x, ball.y - slowZone.y) < slowZone.r) {
    ball.vx *= 0.94; ball.vy *= 0.94;
  }

  // Directional push zone: shoves the ball along a fixed random direction while inside
  if (pushZone && Math.hypot(ball.x - pushZone.x, ball.y - pushZone.y) < pushZone.r) {
    ball.vx += Math.cos(pushZone.angle) * 0.4;
    ball.vy += Math.sin(pushZone.angle) * 0.4;
  }

  // Triangle collisions — shared lightning-aware handler for all three
  function handleTriangleCollision(tri, role, normalPush, normalKick) {
    const glowing = isTriangleGlowing(role);
    const cx = (tri[0].x + tri[1].x + tri[2].x) / 3;
    const cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
    if (glowing) {
      for (let i = 0; i < 3; i++) {
        const p1 = tri[i], p2 = tri[(i + 1) % 3];
        const gx = p2.x - p1.x, gy = p2.y - p1.y;
        const lenSq = gx * gx + gy * gy;
        const t = Math.max(0, Math.min(1, ((ball.x - p1.x) * gx + (ball.y - p1.y) * gy) / lenSq));
        const ex = p1.x + t * gx, ey = p1.y + t * gy;
        if (Math.hypot(ball.x - ex, ball.y - ey) < br + 2) {
          const ang = Math.atan2(ball.y - cy, ball.x - cx);
          ball.x = cx + Math.cos(ang) * normalPush * 1.5;
          ball.y = cy + Math.sin(ang) * normalPush * 1.5;
          ball.vx = Math.cos(ang) * normalKick * 1.5;
          ball.vy = Math.sin(ang) * normalKick * 1.5;
          addScore(50);
        }
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const p1 = tri[i], p2 = tri[(i + 1) % 3];
        resolveSegment(p1.x, p1.y, p2.x, p2.y, br);
      }
    }
    if (pointInTriangle(ball.x, ball.y, tri)) {
      const ang = Math.atan2(ball.y - cy, ball.x - cx);
      const pushDist = glowing ? normalPush * 1.5 : normalPush;
      const kickSpeed = glowing ? normalKick * 1.5 : normalKick;
      ball.x = cx + Math.cos(ang) * pushDist;
      ball.y = cy + Math.sin(ang) * pushDist;
      ball.vx = Math.cos(ang) * kickSpeed;
      ball.vy = Math.sin(ang) * kickSpeed;
      addScore(50);
    }
  }
  handleTriangleCollision(triangle, 0, 35, 2.25);
  handleTriangleCollision(triangle2, 1, 35, 2.25);
  handleTriangleCollision(sideTriangle, 2, 25, 2.25);

  {
    const sx1 = spinner.x - Math.cos(spinner.angle) * spinner.len;
    const sy1 = spinner.y - Math.sin(spinner.angle) * spinner.len;
    const sx2 = spinner.x + Math.cos(spinner.angle) * spinner.len;
    const sy2 = spinner.y + Math.sin(spinner.angle) * spinner.len;
    const gx = sx2 - sx1, gy = sy2 - sy1;
    const lenSq = gx * gx + gy * gy;
    const t = Math.max(0, Math.min(1, ((ball.x - sx1) * gx + (ball.y - sy1) * gy) / lenSq));
    const cx = sx1 + t * gx, cy = sy1 + t * gy;
    const dx = ball.x - cx, dy = ball.y - cy;
    const dist = Math.hypot(dx, dy);
    const rad = 5;
    if (dist < rad + br) {
      const nx = dist > 0.001 ? dx / dist : 0;
      const ny = dist > 0.001 ? dy / dist : -1;
      const speed = Math.hypot(ball.vx, ball.vy);
      ball.x = cx + nx * (rad + br + 0.5);
      ball.y = cy + ny * (rad + br + 0.5);
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) {
        ball.vx -= 1.8 * dot * nx;
        ball.vy -= 1.8 * dot * ny;
      }
      const side = Math.sign((ball.x - spinner.x) * Math.sin(spinner.angle) - (ball.y - spinner.y) * Math.cos(spinner.angle)) || 1;
      spinner.spin += side * Math.max(speed, 2) * 0.05;
      addScore(75);
    }
  }

  // Drop targets: knock them down one at a time, clearing the row gives a bonus
  for (const t of dropTargets) {
    if (t.down) continue;
    if (ball.x > t.x - t.w / 2 - br && ball.x < t.x + t.w / 2 + br &&
        ball.y > t.y - t.h / 2 - br && ball.y < t.y + t.h / 2 + br) {
      t.down = true;
      ball.vy = -Math.abs(ball.vy) * 0.6 - 2;
      addScore(200);
      if (dropTargets.every(d => d.down)) {
        addScore(1000);
        dropTargetsResetTimer = 120;
      }
    }
  }

  // Ramp gate: shoot the ball through the top lane for a bonus
  if (!ball.rampScored && ball.vy > 0 && ball.y > ramp.y - 4 && ball.y < ramp.y + 8 &&
      ball.x > ramp.x1 && ball.x < ramp.x2) {
    ball.rampScored = true;
    ramp.flash = 30;
    addScore(300);
  }

  // Score gates: fly the ball through either lane (up or down) for a bonus, once per launch
  scoreGates.forEach((g, i) => {
    if (!ball.gatesScored.has(i) && ball.y > g.y - 5 && ball.y < g.y + 5 &&
        ball.x > g.x1 && ball.x < g.x2) {
      ball.gatesScored.add(i);
      g.flash = 30;
      addScore(150);
    }
  });

  // Flippers: collide against the actual angled line, not a static box
  const thetaL = leftFlipper * 1.149 - flipperRestTilt; // swings 10 degrees higher than before
  const thetaR = rightFlipper * 1.149 - flipperRestTilt;
  const leftTipX = flipperPivotL + flipperLen * Math.cos(thetaL);
  const leftTipY = flipY - flipperLen * Math.sin(thetaL);
  const rightTipX = flipperPivotR - flipperLen * Math.cos(thetaR);
  const rightTipY = flipY - flipperLen * Math.sin(thetaR);
  flipperHit(flipperPivotL, flipY, leftTipX, leftTipY, leftFlipperVel, br);
  flipperHit(flipperPivotR, flipY, rightTipX, rightTipY, rightFlipperVel, br);

  // U-well pocket walls (an indent in the left wall): open at the top so a ball can fall
  // in, walled on the sides and bottom so it settles rather than rolling back out
  if(!uWellDestroyed){resolveSegment(U_WELL.x1,U_WELL.yTop,U_WELL.x1,U_WELL.yBottom,br);resolveSegment(U_WELL.x2,U_WELL.yTop,U_WELL.x2,U_WELL.yBottom,br);resolveSegment(U_WELL.x1,U_WELL.yBottom,U_WELL.x2,U_WELL.yBottom,br);}

  // If the ball has settled (come to rest) inside the U-well, lock it there and drop 2
  // fresh balls from the top to start multiball — but only if this ball hasn't already used
  // up its one shot at triggering the well (balls spawned by a trigger can't trigger again)
  if (ball.canTriggerWell && ball.x > U_WELL.x1 && ball.x < U_WELL.x2 && ball.y > U_WELL.yTop && ball.y < U_WELL.yBottom + 10) {
    const spd = Math.hypot(ball.vx, ball.vy);
    ball.uWellRest = spd < 0.6 ? ball.uWellRest + 1 : 0;
    if (ball.uWellRest > 20) {
      lockedBalls.push(ball);
      balls.splice(__bi, 1);
      balls.push(makeBall(120 + Math.random() * 40, 35, (Math.random() - 0.5) * 1.5, 1.125 + Math.random() * 1.125, false));
      balls.push(makeBall(240 + Math.random() * 40, 35, (Math.random() - 0.5) * 1.5, 1.125 + Math.random() * 1.125, false));
      window.AchievementManager?.notify?.('pinball_double_shot',{facts:{mastery_pinball_postulation:1}});
      uWellDestroyed=true;for(let i=0;i<34;i++)uWellPixels.push({x:U_WELL.x1+Math.random()*(U_WELL.x2-U_WELL.x1),y:U_WELL.yTop+Math.random()*(U_WELL.yBottom-U_WELL.yTop),vx:(Math.random()-.5)*5,vy:-Math.random()*4,life:35+Math.random()*30});
      __locked = true;
    }
  } else if (ball.canTriggerWell) {
    ball.uWellRest = 0;
  }

  // Game over: entire bottom, including gutters
  if (!__locked && ball.y > TH - 20) {
    balls.splice(__bi, 1);
    nudgeUsed=false;
  }
  }

  // Ball-vs-ball collision — every ball can bounce off every other ball
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], c = balls[j];
      const dx = c.x - a.x, dy = c.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const minDist = 16; // two ball radii (8 + 8)
      if (dist < minDist) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = minDist - dist;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        c.x += nx * overlap / 2; c.y += ny * overlap / 2;
        const avn = a.vx * nx + a.vy * ny;
        const cvn = c.vx * nx + c.vy * ny;
        a.vx += (cvn - avn) * nx; a.vy += (cvn - avn) * ny;
        c.vx += (avn - cvn) * nx; c.vy += (avn - cvn) * ny;
      }
    }
  }

  ball = balls[0] || null;
  syncNudgeButton();

  if (balls.length === 0 && ballsInPlay) {
    ballsInPlay = false;
    lives--;
    if (lives <= 0) {
      PlatformManager.endPracticeRun();
      gameOver = true;
      window.ChallengeManager?.finish?.({score,alive:false});
      saveScoreAfterDrain();
      const coinResult = PlatformManager.settleAccuracyCoins(GAME_CONFIG.id, runCoins);
      document.getElementById('final-score').textContent = 'Score: ' + score;
      document.getElementById('final-score').textContent += ` · ${coinResult.accuracyPercent}% accuracy · ${coinResult.coinsAwarded} coins awarded from ${runCoins} raw (+15%)`;
      if (score > 0 && score === highScore) {
        document.getElementById('new-high-score').classList.remove('hidden');
      }
      document.getElementById('game-over-overlay').classList.remove('hidden');
    }
  }
}

function draw() {
  const neonTable=pinballCosmetic('pinball-postulation_neon_academy_table'),fortressTable=pinballCosmetic('pinball-postulation_fortress_facts_table'),cosmic=pinballCosmetic('pinball-postulation_cosmic_multiball');
  ctx.fillStyle = cosmic?'#020817':neonTable?'#05051e':fortressTable?'#120d18':'#0a0014';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(ox(), oy());
  ctx.scale(scale, scale);
  const tableShakeX=tableShakeFrames>0?Math.sin(tableShakeFrames*2.8)*5:0,tableShakeY=tableShakeFrames>0?Math.cos(tableShakeFrames*2.15)*3:0;if(tableShakeFrames>0)tableShakeFrames--;ctx.translate(tableShakeX,tableShakeY);
  if(cosmic){ctx.fillStyle='#d9f7ff';for(let i=0;i<55;i++){const x=(i*73)%TW,y=(i*137)%TH,a=.25+.65*Math.sin(performance.now()/700+i);ctx.globalAlpha=Math.abs(a);ctx.fillRect(x,y,i%8===0?2:1,i%8===0?2:1);}for(let i=0;i<6;i++){const x=45+(i*67)%320,y=75+(i*109)%520,a=.18+.35*Math.abs(Math.sin(performance.now()/1100+i));ctx.globalAlpha=a;ctx.fillStyle=`hsl(${i*58+190} 70% 55%)`;ctx.beginPath();ctx.arc(x,y,7+i%3*3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d7efff';ctx.beginPath();ctx.ellipse(x,y,13+i%3*3,3+i%2,-.3,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;}
  if(neonTable){ctx.save();ctx.strokeStyle='rgba(0,245,255,.13)';ctx.lineWidth=1;for(let x=20;x<TW;x+=25){ctx.beginPath();ctx.moveTo(x,10);ctx.lineTo(x,TH-10);ctx.stroke();}for(let y=10;y<TH;y+=25){ctx.beginPath();ctx.moveTo(10,y);ctx.lineTo(TW-10,y);ctx.stroke();}ctx.restore();}
  if(fortressTable){const stone=ctx.createLinearGradient(0,0,TW,TH);stone.addColorStop(0,'#20263c');stone.addColorStop(.5,'#3d4965');stone.addColorStop(1,'#171c2d');ctx.fillStyle=stone;ctx.fillRect(18,14,TW-36,TH-28);ctx.strokeStyle='#7d8aa8';ctx.lineWidth=1;for(let y=24;y<TH-22;y+=24){ctx.beginPath();ctx.moveTo(20,y);ctx.lineTo(TW-20,y);ctx.stroke();for(let x=20+((y/24)%2)*18;x<TW-20;x+=36){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+24);ctx.stroke();}}ctx.fillStyle='#101526';ctx.fillRect(42,92,72,118);ctx.fillRect(TW-114,92,72,118);for(const tx of [42,TW-114]){ctx.fillStyle='#586682';for(let i=0;i<4;i++)ctx.fillRect(tx+i*18,76,12,24);ctx.fillRect(tx,94,72,8);ctx.fillStyle='#ffd15c';ctx.fillRect(tx+29,128,14,38);}ctx.fillStyle='#111827';ctx.beginPath();ctx.arc(TW/2,TH-85,48,Math.PI,0);ctx.fill();ctx.fillRect(TW/2-48,TH-85,96,72);ctx.strokeStyle='#ffd15c';ctx.lineWidth=4;ctx.stroke();ctx.fillStyle='#ffd15c';ctx.font='bold 18px monospace';ctx.textAlign='center';ctx.fillText('FORTRESS FACTS',TW/2,45);ctx.textAlign='left';}

  // Table border
  ctx.strokeStyle = '#7a1fff';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, TW - 20, TH - 20);

  ctx.shadowColor = '#7a1fff';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#7a1fff55';
  ctx.lineWidth = 2;
  ctx.strokeRect(15, 15, TW - 30, TH - 30);
  ctx.shadowBlur = 0;

  // Ramp tubes
  function drawRampTube(leftWall, rightWall, fillColor, strokeColor) {
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(leftWall[0].x, leftWall[0].y);
    for (let i = 1; i < leftWall.length; i++) ctx.lineTo(leftWall[i].x, leftWall[i].y);
    for (let i = rightWall.length - 1; i >= 0; i--) ctx.lineTo(rightWall[i].x, rightWall[i].y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftWall[0].x, leftWall[0].y);
    for (let i = 1; i < leftWall.length; i++) ctx.lineTo(leftWall[i].x, leftWall[i].y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightWall[0].x, rightWall[0].y);
    for (let i = 1; i < rightWall.length; i++) ctx.lineTo(rightWall[i].x, rightWall[i].y);
    ctx.stroke();
  }
  function drawRampMouth(pt, color) {
    ctx.fillStyle = color;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('»', pt.x, pt.y - 10);
    ctx.textAlign = 'left';
  }

  // Short corner walls plus raised 45-degree inward extensions.
  const cornerTopY = flipY - 20;
  ctx.strokeStyle = '#3d3dff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(20 + gutterWidth, cornerTopY);
  ctx.lineTo(20 + gutterWidth, cornerTopY - 90);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(TW - 20 - gutterWidth, cornerTopY);
  ctx.lineTo(TW - 20 - gutterWidth, cornerTopY - 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20 + gutterWidth, cornerTopY);
  ctx.lineTo(100, flipY + 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(TW - 20 - gutterWidth, cornerTopY);
  ctx.lineTo(300, flipY + 30);
  ctx.stroke();

  // Wall bumps
  for (const w of wallBumps) {
    const wx = w.side === 'left' ? 20 : TW - 20;
    const startAngle = w.side === 'left' ? -Math.PI / 2 : Math.PI / 2;
    const endAngle = w.side === 'left' ? Math.PI / 2 : 3 * Math.PI / 2;
    ctx.beginPath();
    ctx.arc(wx, w.y, w.hit > 0 ? w.r + 2 : w.r, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = w.hit > 0 ? '#88fff0' : '#00332b';
    ctx.fill();
    ctx.strokeStyle = '#00d9b5';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Speed zone (accelerator)
  if (speedZone) {
    ctx.strokeStyle = '#00ffb0';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(speedZone.x, speedZone.y, speedZone.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#00ffb0';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('»»', speedZone.x, speedZone.y + 6);
    ctx.textAlign = 'left';
  }

  // Slow zone (decelerator)
  if (slowZone) {
    ctx.strokeStyle = '#6f9fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(slowZone.x, slowZone.y, slowZone.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#6f9fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('««', slowZone.x, slowZone.y + 6);
    ctx.textAlign = 'left';
  }

  // Directional push zone
  if (pushZone) {
    ctx.strokeStyle = '#e0009e';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(pushZone.x, pushZone.y, pushZone.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(pushZone.x, pushZone.y);
    ctx.rotate(pushZone.angle);
    ctx.strokeStyle = '#e0009e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(14, 0);
    ctx.lineTo(6, -8);
    ctx.moveTo(14, 0);
    ctx.lineTo(6, 8);
    ctx.stroke();
    ctx.restore();
  }

  // Bottom game-over line (gold)
  ctx.strokeStyle = '#ffc400';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(20, TH - 20);
  ctx.lineTo(TW - 20, TH - 20);
  ctx.stroke();

  // Ramp gate: guide rails funneling into a scoring lane near the top
  ctx.strokeStyle = ramp.flash > 0 ? '#2f8fff' : '#2f8fff88';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ramp.x1 - 35, 115);
  ctx.lineTo(ramp.x1, ramp.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ramp.x2 + 35, 115);
  ctx.lineTo(ramp.x2, ramp.y);
  ctx.stroke();
  ctx.strokeStyle = ramp.flash > 0 ? '#2f8fff' : '#2f8fff55';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ramp.x1, ramp.y);
  ctx.lineTo(ramp.x2, ramp.y);
  ctx.stroke();

  // Score gates
  for (const g of scoreGates) {
    const glow = g.flash > 0;
    ctx.strokeStyle = glow ? '#ff5cd6' : '#ff00aa';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y);
    ctx.lineTo(g.x2, g.y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const px of [g.x1, g.x2]) {
      ctx.beginPath();
      ctx.arc(px, g.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#330026';
      ctx.fill();
      ctx.strokeStyle = glow ? '#ff5cd6' : '#ff00aa';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Triangles — shared lightning-aware drawing for all three
  function drawTriangleWithLightning(tri, role, fillColor, normalStroke) {
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(tri[0].x, tri[0].y);
    ctx.lineTo(tri[1].x, tri[1].y);
    ctx.lineTo(tri[2].x, tri[2].y);
    ctx.closePath();
    ctx.fill();
    if (isTriangleGlowing(role)) {
      // Electrified: jagged bright bolts along each edge instead of a plain stroke
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#ffee00';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const p1 = tri[i], p2 = tri[(i + 1) % 3];
        const steps = 5;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const mx = p1.x + (p2.x - p1.x) * t;
          const my = p1.y + (p2.y - p1.y) * t;
          const dx = p2.x - p1.x, dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy) || 1;
          const jx = -dy / len, jy = dx / len;
          const jitter = (Math.random() - 0.5) * 8;
          ctx.lineTo(mx + jx * jitter, my + jy * jitter);
        }
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = normalStroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  drawTriangleWithLightning(triangle, 0, '#331900', '#ff7a00');
  drawTriangleWithLightning(triangle2, 1, '#f5ff00aa', '#f5ff00');
  drawTriangleWithLightning(sideTriangle, 2, '#0d3312', '#2ecc40');

  // U-well pocket (multiball lock)
  if(!uWellDestroyed){ctx.fillStyle='#331f00';ctx.fillRect(U_WELL.x1,U_WELL.yTop,U_WELL.x2-U_WELL.x1,U_WELL.yBottom-U_WELL.yTop);ctx.strokeStyle='#cc8800';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(U_WELL.x1,U_WELL.yTop);ctx.lineTo(U_WELL.x1,U_WELL.yBottom);ctx.lineTo(U_WELL.x2,U_WELL.yBottom);ctx.lineTo(U_WELL.x2,U_WELL.yTop);ctx.stroke();}
  for(let i=uWellPixels.length-1;i>=0;i--){const p=uWellPixels[i];p.x+=p.vx;p.y+=p.vy;p.vy+=.16;p.life--;ctx.globalAlpha=Math.max(0,p.life/60);ctx.fillStyle=i%3?'#cc8800':'#fff1a6';ctx.fillRect(p.x,p.y,3,3);if(p.life<=0)uWellPixels.splice(i,1);}ctx.globalAlpha=1;

  // Wells
  for (const w of wells) {
    const onCooldown = w.cooldown > 0;
    ctx.beginPath();
    ctx.arc(w.x, w.y, WELL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#1a0a2e';
    ctx.fill();
    ctx.strokeStyle = onCooldown ? '#555566' : '#8855ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w.x, w.y, WELL_RADIUS - 5, 0, Math.PI * 2);
    ctx.strokeStyle = onCooldown ? '#55556655' : '#8855ff55';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (onCooldown) {
      ctx.beginPath();
      ctx.arc(w.x, w.y, WELL_RADIUS + 4, -Math.PI / 2, -Math.PI / 2 + (w.cooldown / 600) * Math.PI * 2);
      ctx.strokeStyle = '#aaaaaa';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Bumpers
  for (const b of bumpers) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    const starFlash=pinballCosmetic('pinball-postulation_star_bumper_flashes')&&b.hit>0,planetBumper=cosmic;
    ctx.fillStyle = planetBumper?`hsl(${(b.x*2+b.y+performance.now()/80)%360} 65% 45%)`:starFlash ? '#fff5a8' : b.hit > 0 ? '#ffb0b0' : '#330d0d';
    ctx.fill();
    ctx.strokeStyle = b.hit > 0 ? '#ffb0b0' : '#ff3b3b';
    ctx.lineWidth = 2;
    ctx.stroke();
    // White center
    ctx.beginPath();
    ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    if(planetBumper){ctx.strokeStyle='rgba(210,240,255,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(b.x,b.y,b.r+8,5,-.35,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.35;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(b.x-5,b.y-4,3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    if(starFlash){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(performance.now()/160);ctx.fillStyle='#fff36b';ctx.shadowColor='#ff57d5';ctx.shadowBlur=14;ctx.beginPath();for(let i=0;i<10;i++){const r=i%2?b.r+3:b.r+13,a=i*Math.PI/5;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.restore();}
  }

  // Drop targets
  for (const t of dropTargets) {
    if (t.down) continue;
    ctx.fillStyle = '#002733';
    ctx.fillRect(t.x - t.w / 2, t.y - t.h / 2, t.w, t.h);
    ctx.strokeStyle = '#00c8ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(t.x - t.w / 2, t.y - t.h / 2, t.w, t.h);
  }

  // Spinner
  {
    const sx1 = spinner.x - Math.cos(spinner.angle) * spinner.len;
    const sy1 = spinner.y - Math.sin(spinner.angle) * spinner.len;
    const sx2 = spinner.x + Math.cos(spinner.angle) * spinner.len;
    const sy2 = spinner.y + Math.sin(spinner.angle) * spinner.len;
    ctx.strokeStyle = Math.abs(spinner.spin) > 0.05 ? '#e0b3ff' : '#9d1fff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(spinner.x, spinner.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // Flippers
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0047ff';
  const thetaL = leftFlipper * 1.149 - flipperRestTilt; // swings 10 degrees higher than before
  const thetaR = rightFlipper * 1.149 - flipperRestTilt;
  ctx.beginPath();
  ctx.moveTo(flipperPivotL, flipY);
  ctx.lineTo(flipperPivotL + flipperLen * Math.cos(thetaL), flipY - flipperLen * Math.sin(thetaL));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(flipperPivotR, flipY);
  ctx.lineTo(flipperPivotR - flipperLen * Math.cos(thetaR), flipY - flipperLen * Math.sin(thetaR));
  ctx.stroke();

  // Ramp tubes drawn before the ball — with solid walls the ball is always genuinely on
  // top of the tube's floor while traveling through it, never hidden underneath
  function drawRampCheckpoint(pt, color) {
    if (!pt) return;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  drawRampTube(ramp2LeftWall, ramp2RightWall, '#0a3d38', '#1de9b6');
  drawRampMouth(rampA, '#1de9b6');
  drawRampMouth(rampB, '#1de9b6');
  drawRampCheckpoint(ramp2Quarter1, '#1de9b6');
  drawRampCheckpoint(ramp2Quarter2, '#1de9b6');
  if (FEATURE_RAMP3 && ramp3Active) {
    drawRampTube(ramp3LeftWall, ramp3RightWall, '#3d1a14', '#ff6f61');
    drawRampMouth(rampC, '#ff6f61');
    drawRampMouth(rampD, '#ff6f61');
    drawRampCheckpoint(ramp3Quarter1, '#ff6f61');
    drawRampCheckpoint(ramp3Quarter2, '#ff6f61');
  }

  // The table and obstacles shake, but balls retain their real position and velocity.
  ctx.translate(-tableShakeX,-tableShakeY);
  // Locked balls resting in the U-well (decorative — no physics)
  for (const lb of lockedBalls) {
    ctx.beginPath();
    ctx.arc(lb.x, lb.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#cccccc';
    ctx.shadowColor = '#8855ff';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Balls
  for (const b of balls) {
    if(pinballCosmetic('pinball-postulation_fireball_trail')){for(let i=0;i<b.cosmeticTrail.length;i++){const p=b.cosmeticTrail[i],r=2+5*i/Math.max(1,b.cosmeticTrail.length);ctx.globalAlpha=Math.max(0,p.life/20);ctx.fillStyle=i%3===0?'#fff06a':i%2?'#ff9b2f':'#ef342a';ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
    ctx.beginPath();
    ctx.arc(b.x, b.y, 8, 0, Math.PI * 2);
    const prism=pinballCosmetic('pinball-postulation_prismatic_pinball'),cosmicBall=pinballCosmetic('pinball-postulation_cosmic_multiball');
    const hue=(performance.now()/12+b.x+b.y)%360;ctx.fillStyle=prism?`hsl(${hue} 95% 72%)`:cosmicBall?'#17285c':'#ffffff';
    ctx.shadowColor = prism?`hsl(${(hue+90)%360} 100% 60%)`:cosmicBall?'#7adfff':'#ff2d95';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    if(prism){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(b.x,b.y,5,Math.PI*1.05,Math.PI*1.65);ctx.stroke();}
    if(cosmicBall){ctx.strokeStyle='#a9e8ff';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(b.x,b.y,13,4,-.35,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff';ctx.fillRect(b.x-2,b.y-3,2,2);}

    if (b.wellFreeze) {
      const ang = Math.atan2(b.wellExitVY, b.wellExitVX);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.strokeStyle = '#8855ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(16, 0);
      ctx.lineTo(8, -8);
      ctx.moveTo(16, 0);
      ctx.lineTo(8, 8);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Floating score popups
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  for (const p of scorePopups) {
    ctx.globalAlpha = Math.min(1, p.life / 15);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(p.text, p.x, p.y - 16);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';

  // Lives
  for (let i = 0; i < lives; i++) {
    ctx.beginPath();
    ctx.arc(30 + i * 20, TH - 35, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6699';
    ctx.fill();
  }

  ctx.restore();

  // Coordinate ruler (debug aid) along the left and bottom edges, outside the table
  if (SHOW_COORDINATES) {
    ctx.save();
    ctx.font = '9px monospace';
    ctx.fillStyle = '#888888';
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 1;
    for (let ty = 0; ty <= TH; ty += 50) {
      const sy = oy() + ty * scale;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ty), ox() - 4, sy);
      ctx.beginPath();
      ctx.moveTo(ox() - 3, sy);
      ctx.lineTo(ox(), sy);
      ctx.stroke();
    }
    for (let tx = 0; tx <= TW; tx += 50) {
      const sx = ox() + tx * scale;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(String(tx), sx, oy() + TH * scale + 4);
      ctx.beginPath();
      ctx.moveTo(sx, oy() + TH * scale);
      ctx.lineTo(sx, oy() + TH * scale + 3);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function loop() {
  if (platformSessionStarted) PlatformManager.heartbeat(GAME_CONFIG.id, gameStarted && !gameOver && !questionModalOpen);
  update();
  draw();
  requestAnimationFrame(loop);
}
loop();

// Home screen background: a slow drift of neon particles behind the title card
const homeBgCanvas = document.getElementById('home-bg');
const homeBgCtx = homeBgCanvas.getContext('2d');
const homeParticles = [];
for (let i = 0; i < 60; i++) {
  homeParticles.push({
    x: Math.random(), y: Math.random(),
    r: 1 + Math.random() * 2,
    speed: 0.0002 + Math.random() * 0.0004,
    color: ['#00fff2', '#ff00aa', '#8855ff', '#ffdd00'][Math.floor(Math.random() * 4)]
  });
}
const homeBalls = Array.from({length:14}, (_,i)=>({
  x:Math.random(),y:Math.random(),vx:(Math.random()<.5?-1:1)*(.00012+Math.random()*.00028),
  vy:(Math.random()<.5?-1:1)*(.00012+Math.random()*.00028),r:5+Math.random()*8,
  color:['#00fff2','#ff00aa','#8855ff','#ffdd00'][i%4],trail:[]
}));
function resizeHomeBg() {
  homeBgCanvas.width = window.innerWidth;
  homeBgCanvas.height = window.innerHeight;
}
resizeHomeBg();
window.addEventListener('resize', resizeHomeBg);
function drawHomeBg() {
  if (!document.getElementById('home-screen').classList.contains('hidden')) {
    const w = homeBgCanvas.width, h = homeBgCanvas.height;
    homeBgCtx.clearRect(0, 0, w, h);
    for (const p of homeParticles) {
      p.y -= p.speed;
      if (p.y < 0) p.y = 1;
      homeBgCtx.beginPath();
      homeBgCtx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
      homeBgCtx.fillStyle = p.color;
      homeBgCtx.globalAlpha = 0.6;
      homeBgCtx.fill();
      homeBgCtx.globalAlpha = 1;
    }
    for(const b of homeBalls){
      b.x+=b.vx;b.y+=b.vy;
      if(b.x<0||b.x>1)b.vx*=-1;if(b.y<0||b.y>1)b.vy*=-1;
      b.trail.unshift({x:b.x*w,y:b.y*h});if(b.trail.length>16)b.trail.pop();
      homeBgCtx.lineCap='round';
      for(let i=b.trail.length-1;i>0;i--){
        homeBgCtx.strokeStyle=b.color;homeBgCtx.globalAlpha=(1-i/b.trail.length)*.3;
        homeBgCtx.lineWidth=Math.max(1,b.r*(1-i/b.trail.length));homeBgCtx.beginPath();
        homeBgCtx.moveTo(b.trail[i].x,b.trail[i].y);homeBgCtx.lineTo(b.trail[i-1].x,b.trail[i-1].y);homeBgCtx.stroke();
      }
      homeBgCtx.globalAlpha=.75;homeBgCtx.fillStyle=b.color;homeBgCtx.shadowColor=b.color;homeBgCtx.shadowBlur=12;
      homeBgCtx.beginPath();homeBgCtx.arc(b.x*w,b.y*h,b.r,0,Math.PI*2);homeBgCtx.fill();
      homeBgCtx.shadowBlur=0;homeBgCtx.globalAlpha=1;
    }
  }
  requestAnimationFrame(drawHomeBg);
}
drawHomeBg();
