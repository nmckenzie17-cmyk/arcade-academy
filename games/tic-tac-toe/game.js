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
  const claimingRounds = new Set();

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
    byId('create-btn').addEventListener('click', createGame);
    byId('show-join-btn').addEventListener('click', () => { setMessage('join-error'); showScreen('join'); byId('room-input').focus(); });
    byId('join-back-btn').addEventListener('click', () => showScreen('menu'));
    byId('join-form').addEventListener('submit', joinGame);
    byId('room-input').addEventListener('input', event => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 5); });
    byId('cancel-room-btn').addEventListener('click', leaveMatch);
    byId('leave-btn').addEventListener('click', leaveMatch);
    byId('rematch-btn').addEventListener('click', requestRematch);
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
      matchId = await MultiplayerManager.createRoom(GAME_ID, EMPTY_STATE(), { classCode, questionType });
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
    localStorage.setItem(ACTIVE_MATCH_KEY, nextMatch.id);

    const validQuestionSettings = nextMatch.settings
      && nextMatch.settings.classCode
      && ['matching', 'multichoice', 'category'].includes(nextMatch.settings.questionType);
    if (!validQuestionSettings) {
      returnToMenu('That previous room used the old question system. Create a new room to continue.');
      return;
    }

    const nextBankKey = `${nextMatch.settings?.classCode}:${nextMatch.settings?.questionType}`;
    if (questionBankKey !== nextBankKey) {
      const loaded = await MultiplayerQuestionHelper.load(nextMatch.settings);
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
    const board = Array.isArray(match.gameState?.board) ? match.gameState.board : Array(9).fill(null);
    const isPlayerOne = match.player1.uid === player.uid;
    const mySymbol = isPlayerOne ? 'X' : 'O';
    byId('match-room-code').textContent = match.roomCode;
    byId('player-one-name').textContent = `${match.player1.displayName}${isPlayerOne ? ' (You)' : ''}`;
    byId('player-two-name').textContent = `${match.player2?.displayName || 'Waiting…'}${!isPlayerOne ? ' (You)' : ''}`;
    byId('player-one-panel').classList.toggle('active', match.currentTurn === match.player1.uid);
    byId('player-two-panel').classList.toggle('active', match.currentTurn === match.player2?.uid);

    byId('board').querySelectorAll('.cell').forEach((cell, index) => {
      const value = board[index];
      cell.textContent = value || '';
      cell.className = `cell${value ? ` ${value.toLowerCase()}` : ''}${match.gameState?.winningLine?.includes(index) ? ' winning' : ''}`;
      cell.setAttribute('aria-label', value ? `Square ${index + 1}: ${value}` : `Square ${index + 1}: empty`);
      cell.disabled = match.status !== 'playing' || match.currentTurn !== player.uid || Boolean(value);
      if (match.gameState?.turnGate?.status !== 'passed') cell.disabled = true;
    });

    byId('result-actions').hidden = match.status !== 'finished';
    byId('rematch-btn').disabled = Boolean(match.rematchRequests?.[player.uid]);
    byId('rematch-btn').textContent = match.rematchRequests?.[player.uid] ? 'Rematch Requested' : 'Play Again';
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
    }
    setMessage('match-error');
  }

  function manageTurnQuestion() {
    if (!match || match.status !== 'playing') { byId('question-overlay').hidden = true; return; }
    const gate = match.gameState?.turnGate;
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
      button.addEventListener('click', () => answerTurnQuestion(answer.correct));
      options.appendChild(button);
    });
    byId('question-overlay').hidden = false;
  }

  async function initialiseTurnGate() {
    gateInitialising = true;
    try {
      await MultiplayerManager.submitMove(match.id, (fresh, uid) => {
        if (fresh.status !== 'playing' || fresh.currentTurn !== uid || fresh.gameState?.turnGate?.uid === uid) return null;
        return { gameState: { ...fresh.gameState, turnGate: { uid, status: 'pending', nonce: `${fresh.round}-${Date.now()}` } } };
      });
    } finally { gateInitialising = false; }
  }

  async function answerTurnQuestion(correct) {
    byId('question-options').querySelectorAll('button').forEach(button => { button.disabled = true; });
    MultiplayerQuestionHelper.record(activeQuestion, correct);
    setMessage('question-feedback', correct ? 'Correct — take your turn!' : 'Incorrect — your turn is skipped.');
    try {
      await MultiplayerManager.submitMove(match.id, (fresh, uid) => {
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
      await MultiplayerManager.submitMove(match.id, (freshMatch, uid) => {
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

  async function claimReward(finishedMatch) {
    const key = `${finishedMatch.id}:${finishedMatch.round}`;
    if (claimingRounds.has(key)) return;
    claimingRounds.add(key);
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
    byId('rematch-btn').disabled = true;
    try {
      await MultiplayerManager.requestRematch(match.id, EMPTY_STATE());
    } catch (error) {
      byId('rematch-btn').disabled = false;
      setMessage('match-error', 'Could not request a rematch. Please try again.');
    }
  }

  async function leaveMatch() {
    const leavingId = matchId;
    if (stopListening) { stopListening(); stopListening = null; }
    try { if (leavingId) await MultiplayerManager.leaveMatch(leavingId); }
    catch (error) { /* Navigation should never trap a student in a dead room. */ }
    returnToMenu();
  }

  function returnToMenu(message) {
    localStorage.removeItem(ACTIVE_MATCH_KEY);
    match = null;
    matchId = null;
    if (stopListening) { stopListening(); stopListening = null; }
    if (sessionStarted) { PlatformManager.endSession(GAME_ID); sessionStarted = false; }
    setMessage('menu-error', message);
    showScreen('menu');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
