/** Reusable room and match orchestration for Arcade Academy multiplayer games. */
(function (global) {
  'use strict';

  let currentUser = null;
  let currentProfile = null;
  let authReadyPromise = null;

  function firebase() {
    if (!global.FirebaseManager) throw new Error('Firebase is still loading. Please try again.');
    return global.FirebaseManager;
  }

  function initialiseAuth() {
    if (authReadyPromise) return authReadyPromise;
    authReadyPromise = new Promise((resolve) => {
      firebase().watchAuthState(async (user) => {
        currentUser = user || null;
        currentProfile = user ? await firebase().getUserProfile(user.uid) : null;
        resolve(currentUser);
      });
    });
    return authReadyPromise;
  }

  async function requirePlayer() {
    await initialiseAuth();
    if (!currentUser) throw new Error('You must sign in through Arcade Academy before playing online.');
    return {
      uid: currentUser.uid,
      displayName: currentProfile?.displayName || currentUser.displayName || 'Student'
    };
  }

  async function createRoom(gameId, initialGameState, settings) {
    const player = await requirePlayer();
    return firebase().createMultiplayerMatch(gameId, player, initialGameState, settings || {});
  }

  async function joinRoom(roomCode) {
    const player = await requirePlayer();
    return firebase().joinMultiplayerMatch(String(roomCode), player);
  }

  function listenToMatch(matchId, onChange, onError) {
    return firebase().watchMultiplayerMatch(matchId, onChange, onError);
  }

  async function submitMove(matchId, buildChanges) {
    await requirePlayer();
    return firebase().transactMultiplayerMatch(matchId, (match, uid) => buildChanges(match, uid));
  }

  async function requestRematch(matchId, emptyGameState) {
    await requirePlayer();
    return firebase().transactMultiplayerMatch(matchId, (match, uid) => {
      if (match.status !== 'finished') throw new Error('MATCH_NOT_FINISHED');
      const requests = { ...(match.rematchRequests || {}), [uid]: true };
      const playerUids = [match.player1?.uid, match.player2?.uid].filter(Boolean);
      if (!playerUids.every(playerUid => requests[playerUid])) return { rematchRequests: requests };

      const nextStarter = match.startingPlayerUid === match.player1.uid
        ? match.player2.uid
        : match.player1.uid;
      const nextGameState = { ...emptyGameState };
      if (Object.prototype.hasOwnProperty.call(nextGameState, 'turnGate')) {
        nextGameState.turnGate = {
          uid: nextStarter,
          status: 'pending',
          nonce: `${Number(match.round || 1) + 1}-${Date.now()}`
        };
      }
      return {
        status: 'playing',
        currentTurn: nextStarter,
        startingPlayerUid: nextStarter,
        gameState: nextGameState,
        winner: null,
        round: Number(match.round || 1) + 1,
        rematchRequests: {},
        leftBy: null
      };
    });
  }

  async function leaveMatch(matchId) {
    await requirePlayer();
    return firebase().transactMultiplayerMatch(matchId, (match, uid) => ({
      status: 'abandoned',
      currentTurn: null,
      leftBy: uid
    }));
  }

  async function claimRoundReward(matchId, round) {
    await requirePlayer();
    return firebase().claimMultiplayerReward(matchId, round);
  }

  global.MultiplayerManager = {
    initialiseAuth,
    requirePlayer,
    createRoom,
    joinRoom,
    listenToMatch,
    submitMove,
    requestRematch,
    leaveMatch,
    claimRoundReward
  };
})(window);
