/** Shared class-calibrated computer opponents and in-browser matches. */
(function (global) {
  'use strict';

  const FALLBACK_ACCURACY = Object.freeze({ low: 0.45, medium: 0.65, high: 0.85 });
  const GROUPS = Object.freeze({ low: 'bottom-third', medium: 'middle-third', high: 'top-third' });
  let player = null;
  let activeMatch = null;
  let listener = null;

  function normaliseDifficulty(value) {
    return Object.prototype.hasOwnProperty.call(FALLBACK_ACCURACY, value) ? value : 'medium';
  }

  async function getClassAIDifficulty(classId, difficulty) {
    const level = normaliseDifficulty(difficulty);
    const fallback = FALLBACK_ACCURACY[level];
    try {
      const group = await global.FirebaseManager?.getClassAIProfile?.(classId, level);
      if (!group) throw new Error('NO_RELIABLE_DATA');
      return {
        difficulty: level,
        group: GROUPS[level],
        averageAccuracy: group.averageAccuracy,
        sampleSize: group.sampleSize,
        classSampleSize: group.classSampleSize,
        source: 'class-data'
      };
    } catch (error) {
      return { difficulty: level, group: GROUPS[level], averageAccuracy: fallback, sampleSize: 0, classSampleSize: 0, source: 'fallback' };
    }
  }

  async function createMatch(gameId, initialGameState, settings, difficulty) {
    player = await global.MultiplayerManager.requirePlayer();
    const profile = await global.FirebaseManager.getUserProfile(player.uid);
    const aiProfile = await getClassAIDifficulty(profile?.className, difficulty);
    const now = Date.now();
    activeMatch = {
      id: `solo-${gameId}-${now}`, roomCode: 'SOLO', gameId, mode: 'single', status: 'playing',
      player1: player, player2: { uid: 'computer', displayName: `Computer (${aiProfile.difficulty})` },
      currentTurn: player.uid, startingPlayerUid: player.uid, gameState: initialGameState,
      settings: { ...(settings || {}), aiProfile }, winner: null, round: 1, rematchRequests: {}, createdAt: now, updatedAt: now
    };
    return activeMatch;
  }

  function emit() { if (listener && activeMatch) queueMicrotask(() => listener(structuredClone(activeMatch))); }
  function listen(onChange) { listener = onChange; emit(); return () => { listener = null; }; }
  function applyMove(actorUid, buildChanges) {
    if (!activeMatch) throw new Error('MATCH_NOT_FOUND');
    const changes = buildChanges(structuredClone(activeMatch), actorUid);
    if (changes && typeof changes === 'object') activeMatch = { ...activeMatch, ...changes, updatedAt: Date.now() };
    emit();
    return Promise.resolve(structuredClone(activeMatch));
  }
  function rematch(emptyGameState) {
    if (!activeMatch) return;
    const nextStarter = activeMatch.startingPlayerUid === activeMatch.player1.uid ? activeMatch.player2.uid : activeMatch.player1.uid;
    const nextState = structuredClone(emptyGameState);
    if (Object.prototype.hasOwnProperty.call(nextState, 'turnGate')) {
      nextState.turnGate = { uid: nextStarter, status: nextStarter === activeMatch.player2.uid ? 'passed' : 'pending', nonce: `${activeMatch.round + 1}-${Date.now()}` };
    }
    activeMatch = { ...activeMatch, status: 'playing', winner: null, currentTurn: nextStarter, startingPlayerUid: nextStarter,
      gameState: nextState, round: activeMatch.round + 1, rematchRequests: {} };
    emit();
  }
  function close() { activeMatch = null; listener = null; }

  global.SinglePlayerManager = { FALLBACK_ACCURACY, getClassAIDifficulty, createMatch, listen, applyMove, rematch, close };
})(window);
