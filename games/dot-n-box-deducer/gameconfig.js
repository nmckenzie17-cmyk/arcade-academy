window.GAME_CONFIG = {
  id: 'dot-n-box-deducer',
  title: 'Dot-n-Box Deducer',
  name: 'Dot-n-Box Deducer',
  description: 'Answer class questions, connect neighbouring dots and complete boxes against class-calibrated computer opponents or another student in a live room.',
  catchphrase: 'Think. Connect. Complete the box.',
  genre: 'Quiz / Strategy',
  gameModes: ['singleplayer', 'multiplayer'],
  primaryMode: 'multiplayer',
  players: '1 Player / 2 Online',
  minPlayers: 2,
  maxPlayers: 2,
  questionType: 'host-choice',
  supportedQuestionFormats: ['multichoice', 'matching', 'category'],
  supportsAI: true,
  version: '1.0.0',
  entry: 'index.html',
  icon: '🔳',
  requiresQuestionBank: true,
  supportsHighScores: false,
  supportsAchievements: true,
  createdBy: 'Mr McKenzie',
  achievements: [
    { id:'dot_n_box_smart_victory', name:'Proof by Boxes', description:'Win a valid match with at least 80% question accuracy over five questions.', tier:'gold', scope:'game', requirement:{ all:[{event:'match_completed',result:'win'},{stat:'match.questionsAnswered',operator:'>=',value:5},{stat:'match.accuracy',operator:'>=',value:80}] } },
    { id:'dot_n_box_chain_master', name:'Chain Reaction', description:'Claim at least four boxes from one uninterrupted sequence of bonus turns.', tier:'gold', scope:'game', requirement:{ event:'dot_box_chain_mastery', value:true } }
  ],
  levelRewards: [
    { id:'dot-n-box-deducer_neon_dots', name:'Neon Dots', type:'cosmetic', slot:'dots' },
    { id:'dot-n-box-deducer_prismatic_lines', name:'Prismatic Lines', type:'cosmetic', slot:'lines' },
    { id:'dot-n-box-deducer_pixel_burst_boxes', name:'Pixel-burst Boxes', type:'cosmetic', slot:'captureEffect' },
    { id:'dot-n-box-deducer_blueprint_board', name:'Blueprint Board', type:'cosmetic', slot:'board' },
    { id:'dot-n-box-deducer_tic_tac_grid', name:'Tic-Tac Grid', type:'cosmetic', slot:'crossover' },
    { id:'dot-n-box-deducer_deduction_matrix', name:'Deduction Matrix', type:'cosmetic', slot:'theme' },
    { id:'dot-n-box-deducer_safe_connection', name:'Safe Connection', type:'gameplay', slot:'boost' }
  ]
};
