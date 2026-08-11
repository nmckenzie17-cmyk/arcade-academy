/* ============================================================
   gameconfig.js
   Central tunables for the pool game. Change numbers here
   rather than hunting through the physics/game files.
   ============================================================ */

const GameConfig = {
  meta: {
    id: 'pool-practice',
    name: 'POOL PRACTICE',
    tagline: 'Sink shots. Answer smart. Win big.',
    version: '1.0.0'
  },

  // ---- table geometry (logical units, scaled to canvas at render time) ----
  table: {
    width: 1000,
    height: 500,
    railWidth: 34,
    pocketRadius: 26,
    cushionRestitution: 0.78
  },

  ball: {
    radius: 14.5,
    mass: 1
  },

  physics: {
    friction: 0.992,        // velocity multiplier applied per simulated step (rolling friction)
    minSpeed: 3.5,          // below this, a ball is considered stopped
    maxShotSpeed: 950,      // speed imparted at 100% power
    ballRestitution: 0.96,  // ball-to-ball collision elasticity
    substeps: 4,            // physics substeps per frame for stability
    maxSimSeconds: 8        // safety cap so a shot simulation can't run forever
  },

  aim: {
    baseLineLength: 130,    // px length of the default (non-bonus) aim guide
    extendedLineLength: 340 // px length granted by the "Extended Aim" bonus
  },

  turnTimer: {
    enabled: true,
    baseSeconds: 20,
    bonusExtraSeconds: 15   // "Extra Aim Time" bonus adds this
  },

  ai: {
    easy:   { aimErrorDeg: 9.0, powerError: 0.35, mistakeChance: 0.35 },
    medium: { aimErrorDeg: 4.5, powerError: 0.18, mistakeChance: 0.15 },
    hard:   { aimErrorDeg: 1.6, powerError: 0.08, mistakeChance: 0.05 }
  },

  // Coins awarded for beating the computer, scaled to how hard that was.
  coinRewards: {
    easy: 100,
    medium: 200,
    hard: 300
  },

  // TODO: point this at your real arcade collection's landing page.
  hub: {
    url: '../../index.html',
    label: 'ARCADE ACADEMY'
  },

  // Shop items shown on the Shop screen. All purely cosmetic — no gameplay
  // effect. "category" controls what part of the table they reskin, and
  // "value" is the data game.js's renderer actually applies.
  shop: {
    items: [
      {
        id: 'felt_midnight',
        name: 'Midnight Neon Felt',
        icon: '🌌',
        category: 'felt',
        cost: 500,
        description: 'Swap the table felt for a deep purple neon gradient.',
        value: { top: '#241250', bottom: '#120a2e' }
      },
      {
        id: 'felt_sunset',
        name: 'Sunset Felt',
        icon: '🌅',
        category: 'felt',
        cost: 500,
        description: 'Warm orange-to-crimson felt for a golden-hour table.',
        value: { top: '#8a3a1f', bottom: '#3f1508' }
      },
      {
        id: 'cue_gold',
        name: 'Golden Cue Stick',
        icon: '🥇',
        category: 'cueStick',
        cost: 500,
        description: 'Trade the plain wood cue for a gleaming gold one.',
        value: '#e8c35c'
      },
      {
        id: 'cueball_chrome',
        name: 'Chrome Cue Ball',
        icon: '⚪',
        category: 'cueBall',
        cost: 500,
        description: 'A mirror-polished chrome finish for the cue ball.',
        value: 'chrome'
      },
      {
        id: 'aimline_neon',
        name: 'Neon Aim Line',
        icon: '💫',
        category: 'aimLine',
        cost: 500,
        description: 'Recolor your aim guide with a glowing magenta streak.',
        value: '#ff4bd8'
      }
    ]
  },

  questionModes: {
    EARN_YOUR_SHOT: {
      id: 'earn_your_shot',
      label: 'EARN YOUR SHOT',
      shortDesc: 'Correct = take your shot. Incorrect = lose your turn.',
      icon: '🎯'
    },
    BONUS_POOL: {
      id: 'bonus_pool',
      label: 'BONUS POOL',
      shortDesc: 'You always shoot. Correct answers add a random bonus.',
      icon: '🎁'
    }
  },

  bonuses: [
    { id: 'extended_aim',    label: 'Extended Aim',    icon: '📏', requiresTimer: false },
    { id: 'prediction_line', label: 'Prediction Line', icon: '↗️', requiresTimer: false },
    { id: 'power_indicator', label: 'Power Indicator',  icon: '⚡', requiresTimer: false },
    { id: 'mulligan',        label: 'Mulligan',         icon: '🔁', requiresTimer: false },
    { id: 'extra_aim_time',  label: 'Extra Aim Time',   icon: '⏱️', requiresTimer: true }
  ],

  // Colors used for ball rendering (index 0 = cue, 1-7 solids, 8 = eight ball, 9-15 stripes)
  ballColors: {
    0: '#f5f2e9',   // cue
    1: '#ffcc33', 2: '#3366ff', 3: '#ff3333', 4: '#9b30ff',
    5: '#ff8c1a', 6: '#1fae5a', 7: '#7a1f0f',
    8: '#141414',
    9: '#ffcc33', 10: '#3366ff', 11: '#ff3333', 12: '#9b30ff',
    13: '#ff8c1a', 14: '#1fae5a', 15: '#7a1f0f'
  }
};

if (typeof module !== 'undefined') module.exports = GameConfig;

window.GAME_CONFIG = {
  id: 'pool-practice',
  title: 'Pool Practice',
  name: 'Pool Practice',
  description: 'Play physics-based 8-ball against a computer or another signed-in student. Choose Earn Your Shot or Bonus Pool, then answer questions from your current class before each turn.',
  catchphrase: 'Answer. Aim. Sink it!',
  genre: 'Quiz / Sports',
  gameModes: ['singleplayer', 'multiplayer'],
  primaryMode: 'multiplayer',
  players: '1 Player / 2 Online',
  questionType: 'host-choice',
  version: '1.0.0',
  entry: 'index.html',
  icon: '🎱',
  requiresQuestionBank: true,
  supportsHighScores: false,
  supportsAchievements: true,
  createdBy: 'Mr McKenzie',
  achievements: [
    { id:'pool_practice_run_the_table', name:'Run the Table', description:'Win a Pool Practice match after pocketing at least seven balls.', tier:'gold', scope:'game', requirement:{ event:'mastery_pool_practice', value:true } }
  ],
  levelRewards: [
    { id:'pool-practice_prismatic_cue_ball', name:'Prismatic Cue Ball', type:'cosmetic', slot:'cueBall' },
    { id:'pool-practice_academy_championship_felt', name:'Academy Championship Felt', type:'cosmetic', slot:'felt' },
    { id:'pool-practice_pocket_starbursts', name:'Pocket Starbursts', type:'cosmetic', slot:'pocketEffect' },
    { id:'pool-practice_comet_shot_trails', name:'Comet Shot Trails', type:'cosmetic', slot:'ballTrail' },
    { id:'pool-practice_thinking_tanks_table', name:'Thinking Tanks Table', type:'cosmetic', slot:'tableOverlay' },
    { id:'pool-practice_cosmic_rack', name:'Cosmic Rack', type:'cosmetic', slot:'ballEffect' },
    { id:'pool-practice_safety_shot', name:'Safety Shot', type:'gameplay', slot:'boost' }
  ]
};
