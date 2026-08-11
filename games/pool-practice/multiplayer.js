/* Pool Practice adapter for Arcade Academy's shared MultiplayerManager. */
const PoolMultiplayer = (function () {
  let player = null;
  let unsubscribe = null;
  let lastQuestionMode = 'earn_your_shot';

  async function init() {
    await MultiplayerManager.initialiseAuth();
    player = await MultiplayerManager.requirePlayer();
    return player;
  }

  function generatePlayerId() { return player?.uid || ''; }

  function initialState(questionMode) {
    return {
      questionMode,
      balls: null,
      groups: { 0: null, 1: null },
      pocketed: [],
      currentTurnSeat: 0,
      winnerSeat: null,
      matchStartedAt: null
    };
  }

  async function createRoom(_playerId, questionMode, questionType) {
    return MultiplayerManager.createRoom('pool-practice', initialState(questionMode), { questionType });
  }

  async function joinRoom(roomCode) {
    try {
      const id = await MultiplayerManager.joinRoom(roomCode);
      return { ok: true, roomCode: id };
    } catch (error) {
      return { ok: false, reason: error?.message || 'join_failed' };
    }
  }

  function toLegacyRoom(match) {
    if (!match) return null;
    const state = match.gameState || {};
    if (state.questionMode) lastQuestionMode = state.questionMode;
    const rematchReady = {};
    if (match.rematchRequests?.[match.player1?.uid]) rematchReady['0'] = true;
    if (match.rematchRequests?.[match.player2?.uid]) rematchReady['1'] = true;
    return {
      ...state,
      id: match.id,
      roomCode: match.roomCode || match.id,
      host: match.player1?.uid || null,
      guest: match.player2?.uid || null,
      status: match.status === 'playing' ? 'active' : match.status,
      gameStateVersion: Number(match.updatedAt || match.round || 0),
      rematchReady,
      _match: match
    };
  }

  function subscribe(roomCode, onUpdate) {
    stopSubscription();
    unsubscribe = MultiplayerManager.listenToMatch(roomCode, match => onUpdate(toLegacyRoom(match)), error => {
      console.error('[Pool Practice] Multiplayer update failed:', error);
    });
    return unsubscribe;
  }

  function stopSubscription() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  }

  async function pushState(roomCode, _expectedVersion, patch) {
    try {
      await MultiplayerManager.submitMove(roomCode, (match, uid) => {
        const seat = match.player1?.uid === uid ? 0 : 1;
        const currentSeat = Number(match.gameState?.currentTurnSeat ?? 0);
        const isInitialRack = match.gameState?.balls === null && seat === 0;
        if (!isInitialRack && match.status === 'playing' && seat !== currentSeat) throw new Error('NOT_YOUR_TURN');
        const nextState = { ...(match.gameState || {}), ...patch };
        const nextSeat = Number(nextState.currentTurnSeat ?? currentSeat);
        const winnerSeat = nextState.winnerSeat;
        const changes = {
          gameState: nextState,
          currentTurn: nextSeat === 0 ? match.player1.uid : match.player2?.uid
        };
        if (winnerSeat !== null && winnerSeat !== undefined) {
          changes.status = 'finished';
          changes.currentTurn = null;
          changes.winner = winnerSeat === 0 ? match.player1.uid : match.player2?.uid;
          changes.rematchRequests = {};
        }
        return changes;
      });
      return { ok: true };
    } catch (error) {
      console.error('[Pool Practice] Move rejected:', error);
      return { ok: false, reason: error?.message || 'move_failed' };
    }
  }

  async function leave(roomCode) {
    stopSubscription();
    if (roomCode) await MultiplayerManager.leaveMatch(roomCode);
  }

  async function setRematchReady(roomCode) {
    await MultiplayerManager.requestRematch(roomCode, initialState(lastQuestionMode));
  }

  return { generatePlayerId, init, createRoom, joinRoom, subscribe, stopSubscription, pushState, leave, setRematchReady };
})();
