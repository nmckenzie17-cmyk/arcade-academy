(function () {
  'use strict';

  const GAME_ID = 'tic-tac-toe';
  const ACTIVE_MATCH_KEY = 'arcadeAcademy.ticTacToe.activeMatch';
  const EMPTY_STATE = () => ({ board: Array(9).fill(null), winningLine: [] });
  const WIN_LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  const screens = ['loading', 'auth', 'menu', 'join', 'room', 'match'];
  const byId = id => document.getElementById(id);
  let player = null;
  let match = null;
  let matchId = null;
  let stopListening = null;
  let sessionStarted = false;
  let questionBankKey = null;
  let activeQuestion = null;
  let activeQuestionNonce = null;
  let gateInitialising = false;
  let isSinglePlayer = false;
  let aiThinking = false;
  let secondThoughtUsed = false;
  let celebratedRound = null;
  const claimingRounds = new Set();
  function tttReward(slot){ return typeof AchievementManager!=='undefined' ? AchievementManager.getEquipped(GAME_ID)[slot] : null; }
  function tttBoost(id){ return typeof AchievementManager!=='undefined'&&AchievementManager.hasBoost(id); }
  function applyCosmetics(){
    const root=document.documentElement,e=typeof AchievementManager!=='undefined'?AchievementManager.getEquipped(GAME_ID):{};
    ['holographic','gemstone','chalk','tanks','quantum'].forEach(n=>root.classList.remove('ttt-'+n));
    if(e.board?.id==='tic-tac-toe_holographic_board')root.classList.add('ttt-holographic');
    if(e.pieces?.id==='tic-tac-toe_gemstone_pieces')root.classList.add('ttt-gemstone');
    if(e.theme?.id==='tic-tac-toe_classroom_chalk')root.classList.add('ttt-chalk');
    if(e.board?.id==='tic-tac-toe_thinking_tanks_grid')root.classList.add('ttt-tanks');
    if(e.pieces?.id==='tic-tac-toe_quantum_noughts')root.classList.add('ttt-quantum');
  }

  function showScreen(name) {
    screens.forEach(screen => { byId(`${screen}-screen`).hidden = screen !== name; });
  }

  function setMessage(id, text) { byId(id).textContent = text || ''; }
  function setBusy(button, busy, busyText, normalText) {
    button.disabled = busy;
    button.textContent = busy ? busyText : normalText;
  }
  function updateHomeStats() {
    const stats = PlatformManager.getGameStats(GAME_ID) || {};
    byId('home-wins').textContent = stats.wins || 0;
    byId('home-losses').textContent = stats.losses || 0;
    byId('home-draws').textContent = stats.draws || 0;
    byId('home-games').textContent = stats.gamesPlayed || 0;
  }

  async function init() {
    buildBoard();
    bindEvents();
    applyCosmetics();window.addEventListener('arcade-progression-changed',applyCosmetics);
    try {
      await MultiplayerManager.initialiseAuth();
      player = await MultiplayerManager.requirePlayer();
      updateHomeStats();
      const savedMatch = localStorage.getItem(ACTIVE_MATCH_KEY);
      if (savedMatch && /^\d{5}$/.test(savedMatch)) connectToMatch(savedMatch);
      else showScreen('menu');
    } catch (error) {
      showScreen('auth');
    }
    setInterval(() => {
      updateHomeStats();
      if (sessionStarted) PlatformManager.heartbeat(GAME_ID, match?.status === 'playing');
    }, 1000);
  }

  function bindEvents() {
    byId('sign-in-btn').addEventListener('click', signIn);
    byId('single-btn').addEventListener('click', () => { byId('single-options').hidden = false; byId('multiplayer-options').hidden = true; });
    byId('multiplayer-btn').addEventListener('click', () => { byId('single-options').hidden = true; byId('multiplayer-options').hidden = false; });
    byId('start-single-btn').addEventListener('click', startSingleGame);
    byId('create-btn').addEventListener('click', createGame);
    byId('show-join-btn').addEventListener('click', () => { setMessage('join-error'); showScreen('join'); byId('room-input').focus(); });
    byId('join-back-btn').addEventListener('click', () => showScreen('menu'));
    byId('join-form').addEventListener('submit', joinGame);
    byId('room-input').addEventListener('input', event => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 5); });
    byId('cancel-room-btn').addEventListener('click', leaveMatch);
    byId('leave-btn').addEventListener('click', leaveMatch);
    byId('rematch-btn').addEventListener('click', requestRematch);
  }

  async function loadQuestions() {
    const classCode = PlatformManager.getClassCode();
    const questionType = byId('question-type').value;
    if (!classCode) throw new Error('Return to the Hub and enter your class code before playing.');
    const loaded = await MultiplayerQuestionHelper.load({ classCode, questionType });
    if (!loaded.ok) throw new Error('This class does not have that question type available.');
    questionBankKey = `${classCode}:${questionType}`;
    return questionType;
  }

  async function startSingleGame() {
    const button = byId('start-single-btn');
    setBusy(button, true, 'Calibrating…', 'Play Computer');
    setMessage('menu-error');
    try {
      secondThoughtUsed=false;celebratedRound=null;
      const questionType = await loadQuestions();
      match = await SinglePlayerManager.createMatch(GAME_ID, { ...EMPTY_STATE(), turnGate: { uid: player.uid, status: 'pending', nonce: `1-${Date.now()}` } }, { questionType }, byId('ai-difficulty').value);
      isSinglePlayer = true;
      matchId = match.id;
      const ai = match.settings.aiProfile;
      setMessage('ai-summary', `${Math.round(ai.averageAccuracy * 100)}% target · ${ai.source === 'class-data' ? `${ai.group}, ${ai.sampleSize} student${ai.sampleSize === 1 ? '' : 's'}` : 'safe fallback'}`);
      stopListening = SinglePlayerManager.listen(handleMatchChange);
    } catch (error) { setMessage('menu-error', error.message || 'Could not start single player.'); }
    finally { setBusy(button, false, '', 'Play Computer'); }
  }

  async function signIn() {
    const button = byId('sign-in-btn');
    setBusy(button, true, 'Signing in…', 'Sign in with Google');
    setMessage('auth-error');
    const user = await FirebaseManager.signInWithGoogle();
    if (!user) {
      setMessage('auth-error', 'Sign-in was cancelled or did not complete.');
      setBusy(button, false, '', 'Sign in with Google');
      return;
    }
    location.reload();
  }

  async function createGame() {
    const button = byId('create-btn');
    setBusy(button, true, 'Creating…', 'Create Game');
    setMessage('menu-error');
    try {
      const classCode = PlatformManager.getClassCode();
      const questionType = byId('question-type').value;
      if (!classCode) throw new Error('Return to the Hub and enter your class code before creating a multiplayer room.');
      const loaded = await MultiplayerQuestionHelper.load({ classCode, questionType });
      if (!loaded.ok) throw new Error('This class does not have that question type available. Choose another type or check the question bank.');
      matchId = await MultiplayerManager.createRoom(GAME_ID, EMPTY_STATE(), { questionType });
      localStorage.setItem(ACTIVE_MATCH_KEY, matchId);
      byId('room-code').textContent = matchId;
      showScreen('room');
      connectToMatch(matchId);
    } catch (error) {
      setMessage('menu-error', error.message || 'Could not create a room. Please try again.');
    } finally {
      setBusy(button, false, '', 'Create Game');
    }
  }

  async function joinGame(event) {
    event.preventDefault();
    const code = byId('room-input').value.trim();
    if (!/^\d{5}$/.test(code)) {
      setMessage('join-error', 'Enter exactly five numbers.');
      return;
    }
    const button = byId('join-btn');
    setBusy(button, true, 'Joining…', 'Join');
    setMessage('join-error');
    try {
      matchId = await MultiplayerManager.joinRoom(code);
      localStorage.setItem(ACTIVE_MATCH_KEY, matchId);
      connectToMatch(matchId);
    } catch (error) {
      const messages = {
        ROOM_NOT_FOUND: 'Room not found. Check the code and try again.',
        ROOM_FULL: 'This room already has two players.',
        CREATOR_CANNOT_JOIN: 'You created this room. Wait for another player to join.'
      };
      setMessage('join-error', messages[error.message] || error.message || 'Unable to join this room.');
    } finally {
      setBusy(button, false, '', 'Join');
    }
  }

  function connectToMatch(id) {
    if (stopListening) stopListening();
    matchId = id;
    isSinglePlayer = false;
    stopListening = MultiplayerManager.listenToMatch(id, handleMatchChange, () => {
      setMessage('loading-message', 'Unable to read this match. It may have expired or Firebase rules may be blocking access.');
      showScreen('loading');
    });
  }

  async function handleMatchChange(nextMatch) {
    if (!nextMatch) { returnToMenu('This match is no longer available.'); return; }
    const isParticipant = nextMatch.player1?.uid === player.uid || nextMatch.player2?.uid === player.uid;
    if (!isParticipant) { returnToMenu('You do not have access to this match.'); return; }
    match = nextMatch;
    if (!isSinglePlayer) localStorage.setItem(ACTIVE_MATCH_KEY, nextMatch.id);

    const validQuestionSettings = nextMatch.settings
      && ['matching', 'multichoice', 'category'].includes(nextMatch.settings.questionType);
    if (!validQuestionSettings) {
      returnToMenu('That previous room used the old question system. Create a new room to continue.');
      return;
    }

    const localClassCode = PlatformManager.getClassCode();
    if (!localClassCode) {
      returnToMenu('Return to the Hub and enter your own class code before joining a room.');
      return;
    }
    const localQuestionSettings = {
      classCode: localClassCode,
      questionType: nextMatch.settings.questionType
    };
    const nextBankKey = `${localClassCode}:${nextMatch.settings.questionType}`;
    if (questionBankKey !== nextBankKey) {
      const loaded = await MultiplayerQuestionHelper.load(localQuestionSettings);
      if (!loaded.ok) {
        setMessage('loading-message', 'Unable to load this room’s question bank. Return to the Hub and check the class code.');
        showScreen('loading');
        return;
      }
      questionBankKey = nextBankKey;
    }

    if (nextMatch.status === 'waiting') {
      byId('room-code').textContent = nextMatch.roomCode;
      setMessage('room-status', 'Waiting for opponent…');
      showScreen('room');
      return;
    }
    if (nextMatch.status === 'abandoned') {
      renderMatch();
      setMessage('turn-status', nextMatch.leftBy === player.uid ? 'You left the match.' : 'Your opponent left the match.');
      byId('board').querySelectorAll('.cell').forEach(cell => { cell.disabled = true; });
      byId('result-actions').hidden = true;
      showScreen('match');
      return;
    }
    if (!sessionStarted) {
      PlatformManager.startSession(GAME_ID);
      sessionStarted = true;
    }
    renderMatch();
    showScreen('match');
    manageTurnQuestion();
    if (isSinglePlayer) scheduleComputerMove();
    if (nextMatch.status === 'finished') claimReward(nextMatch);
  }

  function buildBoard() {
    const board = byId('board');
    for (let index = 0; index < 9; index++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.index = index;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `Square ${index + 1}`);
      cell.addEventListener('click', () => makeMove(index));
      board.appendChild(cell);
    }
  }

  function renderMatch() {
    applyCosmetics();
    const board = Array.isArray(match.gameState?.board) ? match.gameState.board : Array(9).fill(null);
    const isPlayerOne = match.player1.uid === player.uid;
    const mySymbol = isPlayerOne ? 'X' : 'O';
    byId('match-room-code').textContent = isSinglePlayer ? 'Single Player' : match.roomCode;
    byId('player-one-name').textContent = `${match.player1.displayName}${isPlayerOne ? ' (You)' : ''}`;
    byId('player-two-name').textContent = `${match.player2?.displayName || 'Waiting…'}${!isPlayerOne ? ' (You)' : ''}`;
    byId('player-one-panel').classList.toggle('active', match.currentTurn === match.player1.uid);
    byId('player-two-panel').classList.toggle('active', match.currentTurn === match.player2?.uid);

    byId('board').querySelectorAll('.cell').forEach((cell, index) => {
      const value = board[index];
      const pieceReward=tttReward('pieces')?.id;
      cell.innerHTML = value==='O'&&pieceReward==='tic-tac-toe_quantum_noughts'?'<span class="quantum-o"><i></i></span>':value&&pieceReward==='tic-tac-toe_gemstone_pieces'?`<span class="gem-piece ${value.toLowerCase()}">${value}</span>`:(value || '');
      cell.className = `cell${value ? ` ${value.toLowerCase()}` : ''}${match.gameState?.winningLine?.includes(index) ? ' winning' : ''}`;
      cell.setAttribute('aria-label', value ? `Square ${index + 1}: ${value}` : `Square ${index + 1}: empty`);
      cell.disabled = match.status !== 'playing' || match.currentTurn !== player.uid || Boolean(value);
      if (match.gameState?.turnGate?.status !== 'passed') cell.disabled = true;
    });

    byId('result-actions').hidden = match.status !== 'finished';
    byId('rematch-btn').disabled = !isSinglePlayer && Boolean(match.rematchRequests?.[player.uid]);
    byId('rematch-btn').textContent = !isSinglePlayer && match.rematchRequests?.[player.uid] ? 'Rematch Requested' : 'Play Again';
    const opponentUid = isPlayerOne ? match.player2?.uid : match.player1.uid;
    setMessage('rematch-status', match.rematchRequests?.[player.uid]
      ? (match.rematchRequests?.[opponentUid] ? 'Starting rematch…' : 'Waiting for opponent…')
      : (match.rematchRequests?.[opponentUid] ? 'Your opponent wants a rematch.' : ''));

    if (match.status === 'playing') {
      const gate = match.gameState?.turnGate;
      setMessage('turn-status', match.currentTurn === player.uid
        ? (gate?.status === 'passed' ? `Your Turn · You are ${mySymbol}` : `Answer the question · You are ${mySymbol}`)
        : `Opponent's Turn · You are ${mySymbol}`);
    } else if (match.status === 'finished') {
      setMessage('turn-status', match.winner === 'draw' ? 'DRAW' : match.winner === player.uid ? 'YOU WIN!' : 'YOU LOSE');
      if(match.gameState?.winningLine?.length&&celebratedRound!==match.round&&tttReward('winEffect')?.id==='tic-tac-toe_confetti_line_win'){celebratedRound=match.round;launchWinConfetti(match.gameState.winningLine);}
    }
    setMessage('match-error');
  }

  function manageTurnQuestion() {
    if (!match || match.status !== 'playing') { byId('question-overlay').hidden = true; return; }
    const gate = match.gameState?.turnGate;
    if (isSinglePlayer && match.currentTurn === match.player2.uid) { byId('question-overlay').hidden = true; return; }
    if (!gate || gate.uid !== match.currentTurn) {
      if (match.currentTurn === player.uid && !gateInitialising) initialiseTurnGate();
      return;
    }
    if (match.currentTurn !== player.uid || gate.status !== 'pending') {
      byId('question-overlay').hidden = true;
      activeQuestionNonce = null;
      return;
    }
    if (activeQuestionNonce === gate.nonce) return;
    activeQuestionNonce = gate.nonce;
    activeQuestion = MultiplayerQuestionHelper.next();
    if (!activeQuestion) return;
    byId('question-prompt').textContent = activeQuestion.prompt;
    setMessage('question-feedback');
    const options = byId('question-options');
    options.innerHTML = '';
    activeQuestion.answers.forEach(answer => {
      const button = document.createElement('button');
      button.className = 'question-option';
      button.textContent = answer.text;
      button.dataset.correct = String(answer.correct);
      button.addEventListener('click', () => answerTurnQuestion(answer.correct, button));
      options.appendChild(button);
    });
    byId('question-overlay').hidden = false;
  }

  async function initialiseTurnGate() {
    gateInitialising = true;
    try {
      await submitHumanMove((fresh, uid) => {
        if (fresh.status !== 'playing' || fresh.currentTurn !== uid || fresh.gameState?.turnGate?.uid === uid) return null;
        return { gameState: { ...fresh.gameState, turnGate: { uid, status: 'pending', nonce: `${fresh.round}-${Date.now()}` } } };
      });
    } finally { gateInitialising = false; }
  }

  async function answerTurnQuestion(correct, selectedButton) {
    byId('question-options').querySelectorAll('button').forEach(button => { button.disabled = true; if(button.dataset.correct==='true')button.classList.add('correct'); });
    if(!correct)selectedButton?.classList.add('incorrect');
    MultiplayerQuestionHelper.record(activeQuestion, correct);
    if(!correct&&isSinglePlayer&&!secondThoughtUsed&&tttBoost('tic-tac-toe_second_thought')){secondThoughtUsed=true;setMessage('question-feedback','Second Thought saved your turn — the correct answer is highlighted.');activeQuestionNonce=null;setTimeout(manageTurnQuestion,2000);return;}
    setMessage('question-feedback', correct ? 'Correct — take your turn!' : 'Incorrect — your turn is skipped.');
    if(!correct)await new Promise(resolve=>setTimeout(resolve,2000));
    try {
      await submitHumanMove((fresh, uid) => {
        const gate = fresh.gameState?.turnGate;
        if (fresh.currentTurn !== uid || gate?.nonce !== activeQuestionNonce || gate.status !== 'pending') throw new Error('QUESTION_EXPIRED');
        if (correct) return { gameState: { ...fresh.gameState, turnGate: { ...gate, status: 'passed' } } };
        const nextUid = fresh.player1.uid === uid ? fresh.player2.uid : fresh.player1.uid;
        return {
          currentTurn: nextUid,
          gameState: { ...fresh.gameState, turnGate: { uid: nextUid, status: 'pending', nonce: `${fresh.round}-${Date.now()}` } }
        };
      });
    } catch (error) {
      setMessage('question-feedback', 'That question is no longer active.');
    }
  }

  async function makeMove(index) {
    if (!match || match.status !== 'playing') return;
    setMessage('match-error');
    try {
      await submitHumanMove((freshMatch, uid) => {
        if (freshMatch.gameId !== GAME_ID || freshMatch.status !== 'playing') throw new Error('MATCH_NOT_PLAYING');
        if (freshMatch.currentTurn !== uid) throw new Error('NOT_YOUR_TURN');
        if (freshMatch.gameState?.turnGate?.uid !== uid || freshMatch.gameState.turnGate.status !== 'passed') throw new Error('ANSWER_REQUIRED');
        if (!Number.isInteger(index) || index < 0 || index > 8) throw new Error('INVALID_SQUARE');
        const board = Array.isArray(freshMatch.gameState?.board) ? [...freshMatch.gameState.board] : Array(9).fill(null);
        if (board[index] !== null) throw new Error('SQUARE_OCCUPIED');
        const isPlayerOne = freshMatch.player1.uid === uid;
        board[index] = isPlayerOne ? 'X' : 'O';
        const winningLine = WIN_LINES.find(line => line.every(position => board[position] === board[index]));
        const isDraw = !winningLine && board.every(Boolean);
        if (winningLine || isDraw) {
          return {
            gameState: { board, winningLine: winningLine || [] },
            status: 'finished',
            currentTurn: null,
            winner: winningLine ? uid : 'draw',
            rematchRequests: {}
          };
        }
        return {
          gameState: {
            board,
            winningLine: [],
            turnGate: {
              uid: isPlayerOne ? freshMatch.player2.uid : freshMatch.player1.uid,
              status: 'pending',
              nonce: `${freshMatch.round}-${Date.now()}`
            }
          },
          currentTurn: isPlayerOne ? freshMatch.player2.uid : freshMatch.player1.uid
        };
      });
    } catch (error) {
      const messages = { NOT_YOUR_TURN:'It is not your turn.', ANSWER_REQUIRED:'Answer the turn question first.', SQUARE_OCCUPIED:'That square is already taken.', MATCH_NOT_PLAYING:'This round has already ended.' };
      setMessage('match-error', messages[error.message] || 'That move could not be played. Please try again.');
    }
  }

  async function submitHumanMove(changes) {
    const updated=isSinglePlayer ? await SinglePlayerManager.applyMove(player.uid, changes) : await MultiplayerManager.submitMove(match.id, changes);
    if(!isSinglePlayer&&updated)await handleMatchChange(updated);
    return updated;
  }

  function scoreBoard(board, aiSymbol, humanSymbol, aiTurn, depth) {
    if (WIN_LINES.some(line => line.every(i => board[i] === aiSymbol))) return 10 - depth;
    if (WIN_LINES.some(line => line.every(i => board[i] === humanSymbol))) return depth - 10;
    if (board.every(Boolean)) return 0;
    const scores = board.map((value, index) => {
      if (value) return null;
      const copy = [...board]; copy[index] = aiTurn ? aiSymbol : humanSymbol;
      return scoreBoard(copy, aiSymbol, humanSymbol, !aiTurn, depth + 1);
    }).filter(value => value !== null);
    return aiTurn ? Math.max(...scores) : Math.min(...scores);
  }

  function scheduleComputerMove() {
    if (aiThinking || match.status !== 'playing' || match.currentTurn !== match.player2.uid) return;
    aiThinking = true;
    setTimeout(async () => {
      try {
        await SinglePlayerManager.applyMove(match.player2.uid, (fresh, uid) => {
          const board = [...fresh.gameState.board], open = board.map((v, i) => v ? null : i).filter(i => i !== null);
          const ranked = open.map(index => { const copy = [...board]; copy[index] = 'O'; return { index, score: scoreBoard(copy, 'O', 'X', false, 0) }; }).sort((a,b) => b.score-a.score);
          const accuracy = fresh.settings.aiProfile.averageAccuracy;
          const strong = Math.random() < accuracy;
          const pool = strong ? ranked.filter(move => move.score === ranked[0].score) : ranked.slice(1, Math.min(4, ranked.length));
          const move = (pool.length ? pool : ranked)[Math.floor(Math.random() * (pool.length || ranked.length))];
          board[move.index] = 'O';
          const winningLine = WIN_LINES.find(line => line.every(position => board[position] === 'O'));
          const draw = !winningLine && board.every(Boolean);
          return winningLine || draw
            ? { gameState:{ board, winningLine:winningLine || [] }, status:'finished', currentTurn:null, winner:winningLine ? uid : 'draw', rematchRequests:{} }
            : { gameState:{ board, winningLine:[], turnGate:{ uid:fresh.player1.uid, status:'pending', nonce:`${fresh.round}-${Date.now()}` } }, currentTurn:fresh.player1.uid };
        });
      } finally { aiThinking = false; }
    }, 550);
  }

  async function claimReward(finishedMatch) {
    PlatformManager.endPracticeRun();
    const key = `${finishedMatch.id}:${finishedMatch.round}`;
    if (claimingRounds.has(key)) return;
    claimingRounds.add(key);
    if (isSinglePlayer) {
      const result = finishedMatch.winner === 'draw' ? 'draw' : finishedMatch.winner === player.uid ? 'win' : 'loss';
      PlatformManager.recordMultiplayerResult(GAME_ID, result);
      updateHomeStats();
      return;
    }
    try {
      const reward = await MultiplayerManager.claimRoundReward(finishedMatch.id, finishedMatch.round);
      if (reward) {
        PlatformManager.recordMultiplayerResult(GAME_ID, reward.result);
        updateHomeStats();
      }
    } catch (error) {
      claimingRounds.delete(key);
      setMessage('match-error', 'Your result could not be recorded yet. Reconnect to try again.');
    }
  }

  async function requestRematch() {
    if (!match) return;
    if (isSinglePlayer) {
      secondThoughtUsed=false;celebratedRound=null;
      const starter = match.startingPlayerUid === match.player1.uid ? match.player2.uid : match.player1.uid;
      SinglePlayerManager.rematch({ ...EMPTY_STATE(), turnGate: starter === player.uid ? { uid:player.uid, status:'pending', nonce:`${match.round + 1}-${Date.now()}` } : null });
      return;
    }
    byId('rematch-btn').disabled = true;
    try {
      await MultiplayerManager.requestRematch(match.id, EMPTY_STATE());
    } catch (error) {
      byId('rematch-btn').disabled = false;
      setMessage('match-error', 'Could not request a rematch. Please try again.');
    }
  }

  function launchWinConfetti(line){
    const board=byId('board');line.forEach(index=>{const r=board.children[index].getBoundingClientRect();for(let i=0;i<14;i++){const p=document.createElement('i');p.className='ttt-confetti';p.style.left=(r.left+r.width/2)+'px';p.style.top=(r.top+r.height/2)+'px';p.style.background=['#4de8ff','#ff4f9a','#fff36d','#a970ff'][i%4];p.style.setProperty('--x',((i%7)-3)*22+'px');p.style.setProperty('--y',(-35-(i%5)*18)+'px');document.body.appendChild(p);setTimeout(()=>p.remove(),900);}});
  }

  async function leaveMatch() {
    const leavingId = matchId;
    if (stopListening) { stopListening(); stopListening = null; }
    try { if (isSinglePlayer) SinglePlayerManager.close(); else if (leavingId) await MultiplayerManager.leaveMatch(leavingId); }
    catch (error) { /* Navigation should never trap a student in a dead room. */ }
    returnToMenu();
  }

  function returnToMenu(message) {
    localStorage.removeItem(ACTIVE_MATCH_KEY);
    match = null;
    matchId = null;
    isSinglePlayer = false;
    if (stopListening) { stopListening(); stopListening = null; }
    if (sessionStarted) { PlatformManager.endSession(GAME_ID); sessionStarted = false; }
    setMessage('menu-error', message);
    showScreen('menu');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
