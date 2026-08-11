(function () {
  'use strict';

  const GAME_ID = 'dot-n-box-deducer';
  const ACTIVE_MATCH_KEY = 'arcadeAcademy.dotNBox.activeMatch';
  const PLAYER_COLORS = ['#4deeea', '#f000ff', '#f9f002', '#74ee15'];
  const DOTS_BY_PLAYER_COUNT = { 2: 5, 3: 9, 4: 11 };
  const $ = id => document.getElementById(id);

  let player = null;
  let match = null;
  let matchId = null;
  let stopListening = null;
  let isSinglePlayer = true;
  let sessionStarted = false;
  let activeQuestion = null;
  let activeQuestionNonce = null;
  let gateInitialising = false;
  let recordedRound = null;

  const state = {
    mode: 'single', playerCount: 2, difficulty: 'medium', questionType: 'multichoice',
    players: [], dotsX: 5, dotsY: 5, lines: {}, boxes: [], totalBoxes: 0,
    claimedBoxes: 0, currentPlayerIndex: 0, startingPlayerIndex: 0,
    particles: [], recentLines: [], awaitingHumanLine: false, chainCount: 0, maxChain: 0, safeConnectionUsed: false,
    layout: { margin: 40, cellSize: 130, size: 600 }
  };
  function dotReward(slot){return window.AchievementManager?.getEquipped?.(GAME_ID)?.[slot]||null;}
  function dotBoost(id){return !!window.AchievementManager?.hasBoost?.(id);}

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
    if (id === 'screen-home') updateHomeStats();
  }
  function setMessage(text, error) {
    $('menu-message').textContent = text || '';
    $('menu-message').classList.toggle('error', !!error);
  }
  function setBusy(button, busy, busyText, normalText) {
    button.disabled = busy;
    button.textContent = busy ? busyText : normalText;
  }

  function wireOptionRow(rowId, dataAttr, onSelect) {
    $(rowId).querySelectorAll('.opt-btn').forEach(button => button.addEventListener('click', () => {
      $(rowId).querySelectorAll('.opt-btn').forEach(other => other.classList.remove('selected'));
      button.classList.add('selected');
      onSelect(button.dataset[dataAttr]);
    }));
  }

  async function initialise() {
    wireOptionRow('player-count-row', 'count', value => state.playerCount = Number(value));
    wireOptionRow('difficulty-row', 'diff', value => state.difficulty = value);
    wireOptionRow('qtype-row', 'qtype', value => state.questionType = value);
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => selectMode(button.dataset.mode)));
    $('start-btn').addEventListener('click', startSingleMatch);
    $('create-room-btn').addEventListener('click', createRoom);
    $('show-join-btn').addEventListener('click', () => $('join-controls').hidden = false);
    $('join-room-btn').addEventListener('click', joinRoom);
    $('room-code-input').addEventListener('input', event => event.target.value = event.target.value.replace(/\D/g, '').slice(0, 5));
    $('leave-game-btn').addEventListener('click', leaveGame);
    $('rematch-btn').addEventListener('click', rematch);
    $('lobby-btn').addEventListener('click', leaveGame);
    try {
      await MultiplayerManager.initialiseAuth();
      player = await MultiplayerManager.requirePlayer();
      const saved = localStorage.getItem(ACTIVE_MATCH_KEY);
      if (saved && /^\d{5}$/.test(saved)) connectToMatch(saved);
      else showScreen('screen-home');
    } catch (_) {
      setMessage('Return to Arcade Academy and sign in before playing.', true);
      $('start-btn').disabled = true;
      $('create-room-btn').disabled = true;
      $('join-room-btn').disabled = true;
      showScreen('screen-home');
    }
    setInterval(() => PlatformManager.heartbeat(GAME_ID, sessionStarted && $('screen-game').classList.contains('active')), 1000);
  }

  function selectMode(mode) {
    state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('selected', button.dataset.mode === mode));
    const multiplayer = mode === 'multiplayer';
    $('single-player-options').hidden = multiplayer;
    $('difficulty-panel').hidden = multiplayer;
    $('start-btn').hidden = multiplayer;
    $('multiplayer-actions').hidden = !multiplayer;
  }

  async function loadQuestions(type) {
    const classCode = PlatformManager.getClassCode();
    if (!classCode) throw new Error('Return to the Hub and select a class code before playing.');
    const loaded = await MultiplayerQuestionHelper.load({ classCode, questionType: type });
    if (!loaded.ok) throw new Error('That question format is unavailable for your selected class.');
  }

  function emptyBoard(playerCount) {
    const dots = DOTS_BY_PLAYER_COUNT[playerCount] || 5;
    const lines = {};
    for (let row = 0; row < dots; row++) for (let col = 0; col < dots - 1; col++) lines[`h-${row}-${col}`] = { drawn:false, owner:null, type:'h', r:row, c:col };
    for (let row = 0; row < dots - 1; row++) for (let col = 0; col < dots; col++) lines[`v-${row}-${col}`] = { drawn:false, owner:null, type:'v', r:row, c:col };
    return {
      dotsX:dots, dotsY:dots, lines,
      boxes:Array.from({length:dots - 1}, () => Array.from({length:dots - 1}, () => ({owner:null}))),
      scores:Array(playerCount).fill(0), questionStats:Array.from({length:playerCount},()=>({answered:0,correct:0})),
      claimedBoxes:0, currentSeat:0, chainCount:0, maxChain:0, turnGate:null
    };
  }

  async function startSingleMatch() {
    setBusy($('start-btn'), true, 'LOADING…', 'START VS COMPUTER'); setMessage('');
    try {
      await loadQuestions(state.questionType);
      const profile = await FirebaseManager.getUserProfile(player.uid);
      const ai = await SinglePlayerManager.getClassAIDifficulty(profile?.className, state.difficulty);
      isSinglePlayer = true; state.mode = 'single'; state.startingPlayerIndex = 0; state.currentPlayerIndex = 0;
      const count = state.playerCount;
      state.players = [{id:0,name:'You',isHuman:true,color:PLAYER_COLORS[0],score:0,questionsAttempted:0,questionsCorrect:0}];
      for (let i=1;i<count;i++) state.players.push({id:i,name:`Computer ${i}`,isHuman:false,color:PLAYER_COLORS[i],difficulty:state.difficulty,accuracy:ai.averageAccuracy * 100,score:0,questionsAttempted:0,questionsCorrect:0});
      applyBoard(emptyBoard(count));
      beginSession(); showScreen('screen-game'); startTurn();
      setMessage(`${Math.round(ai.averageAccuracy * 100)}% computer target · ${ai.source === 'class-data' ? ai.group : 'safe fallback'}`);
    } catch (error) { setMessage(error.message, true); }
    finally { setBusy($('start-btn'), false, '', 'START VS COMPUTER'); }
  }

  async function createRoom() {
    setBusy($('create-room-btn'), true, 'CREATING…', 'CREATE ROOM'); setMessage('');
    try {
      await loadQuestions(state.questionType);
      matchId = await MultiplayerManager.createRoom(GAME_ID, emptyBoard(2), { questionType:state.questionType, maxPlayers:2 });
      localStorage.setItem(ACTIVE_MATCH_KEY, matchId);
      $('room-code-display').textContent = matchId; $('room-waiting').hidden = false;
      connectToMatch(matchId);
    } catch (error) { setMessage(error.message || 'Could not create the room.', true); }
    finally { setBusy($('create-room-btn'), false, '', 'CREATE ROOM'); }
  }

  async function joinRoom() {
    const code = $('room-code-input').value.trim();
    if (!/^\d{5}$/.test(code)) { setMessage('Enter exactly five numbers.', true); return; }
    setBusy($('join-room-btn'), true, 'JOINING…', 'JOIN'); setMessage('');
    try {
      matchId = await MultiplayerManager.joinRoom(code);
      localStorage.setItem(ACTIVE_MATCH_KEY, matchId);
      connectToMatch(matchId);
    } catch (error) {
      const messages={ROOM_NOT_FOUND:'Room not found.',ROOM_FULL:'That room already has two players.',CREATOR_CANNOT_JOIN:'You created this room.'};
      setMessage(messages[error.message] || error.message || 'Could not join the room.', true);
    } finally { setBusy($('join-room-btn'), false, '', 'JOIN'); }
  }

  function connectToMatch(id) {
    if (stopListening) stopListening();
    isSinglePlayer = false; matchId = id;
    stopListening = MultiplayerManager.listenToMatch(id, handleMatchChange, () => setMessage('The live room could not be loaded.', true));
  }

  async function handleMatchChange(nextMatch) {
    if (!nextMatch) { await returnHome('This room is no longer available.'); return; }
    if (![nextMatch.player1?.uid,nextMatch.player2?.uid].includes(player.uid)) { await returnHome('You do not have access to this room.'); return; }
    match = nextMatch;
    if (!['multichoice','matching','category'].includes(match.settings?.questionType)) { await returnHome('This room uses an outdated question format.'); return; }
    try { await loadQuestions(match.settings.questionType); } catch (error) { await returnHome(error.message); return; }
    if (match.status === 'waiting') {
      $('room-code-display').textContent = match.roomCode; $('room-waiting').hidden = false; selectMode('multiplayer'); showScreen('screen-home'); return;
    }
    if (match.status === 'abandoned') { showScreen('screen-game'); showFeedback('Your opponent left the match', 'wrong'); return; }
    state.mode = 'multiplayer'; state.questionType = match.settings.questionType;
    state.players = [
      {id:0,name:match.player1.displayName + (match.player1.uid===player.uid?' (You)':''),isHuman:match.player1.uid===player.uid,color:PLAYER_COLORS[0]},
      {id:1,name:(match.player2?.displayName||'Player 2') + (match.player2?.uid===player.uid?' (You)':''),isHuman:match.player2?.uid===player.uid,color:PLAYER_COLORS[1]}
    ];
    applyBoard(match.gameState);
    state.currentPlayerIndex = match.currentTurn === match.player1.uid ? 0 : 1;
    if (!sessionStarted) beginSession();
    showScreen(match.status === 'finished' ? 'screen-gameover' : 'screen-game');
    if (match.status === 'finished') { renderGameOver(); recordOnlineResult(); return; }
    renderHUD(); render(); manageOnlineTurn();
  }

  function beginSession() { PlatformManager.startSession(GAME_ID); sessionStarted = true; recordedRound = null; }
  function applyBoard(board) {
    state.dotsX=board.dotsX; state.dotsY=board.dotsY; state.lines=structuredClone(board.lines); state.boxes=structuredClone(board.boxes);
    state.totalBoxes=(state.dotsX-1)*(state.dotsY-1); state.claimedBoxes=Number(board.claimedBoxes||0); state.chainCount=Number(board.chainCount||0); state.maxChain=Number(board.maxChain||0); state.safeConnectionUsed=false;
    (board.scores||[]).forEach((score,index)=>{ if(state.players[index]) state.players[index].score=score; });
    (board.questionStats||[]).forEach((stats,index)=>{ if(state.players[index]) { state.players[index].questionsAttempted=stats.answered; state.players[index].questionsCorrect=stats.correct; } });
    state.awaitingHumanLine = match?.gameState?.turnGate?.status === 'passed' && match.currentTurn === player?.uid;
    computeLayout(); renderHUD(); render();
  }

  function manageOnlineTurn() {
    if (!match || match.status !== 'playing') return;
    const gate = match.gameState?.turnGate;
    if (!gate || gate.uid !== match.currentTurn) { if (match.currentTurn === player.uid) initialiseTurnGate(); return; }
    if (match.currentTurn !== player.uid || gate.status !== 'pending') { closeModal(); activeQuestionNonce=null; return; }
    if (activeQuestionNonce === gate.nonce) return;
    activeQuestionNonce = gate.nonce;
    askQuestion(state.players[state.currentPlayerIndex], correct => answerOnlineQuestion(correct, gate.nonce));
  }

  async function initialiseTurnGate() {
    if (gateInitialising) return; gateInitialising=true;
    try { await MultiplayerManager.submitMove(match.id,(fresh,uid)=> fresh.currentTurn===uid && (!fresh.gameState.turnGate || fresh.gameState.turnGate.uid!==uid) ? {gameState:{...fresh.gameState,turnGate:{uid,status:'pending',nonce:`${fresh.round}-${Date.now()}`}}} : null); }
    finally { gateInitialising=false; }
  }

  async function answerOnlineQuestion(correct, nonce) {
    MultiplayerQuestionHelper.record(activeQuestion, correct); PlatformManager.recordQuestionAnswered(GAME_ID, correct);
    try {
      await MultiplayerManager.submitMove(match.id, (fresh, uid) => {
        const gate=fresh.gameState.turnGate;if(fresh.currentTurn!==uid||gate?.nonce!==nonce||gate.status!=='pending')throw new Error('QUESTION_EXPIRED');
        const seat=fresh.player1.uid===uid?0:1, stats=structuredClone(fresh.gameState.questionStats);stats[seat].answered++;if(correct)stats[seat].correct++;
        if(correct)return{gameState:{...fresh.gameState,questionStats:stats,turnGate:{...gate,status:'passed'}}};
        const nextSeat=1-seat,nextUid=nextSeat===0?fresh.player1.uid:fresh.player2.uid;
        return{currentTurn:nextUid,gameState:{...fresh.gameState,questionStats:stats,currentSeat:nextSeat,chainCount:0,turnGate:{uid:nextUid,status:'pending',nonce:`${fresh.round}-${Date.now()}`}}};
      });
      showFeedback(correct?'Correct! Draw a line':'Incorrect — turn passes',correct?'correct':'wrong');
    } catch (error) { showFeedback(error.message==='QUESTION_EXPIRED'?'That question expired.':'Unable to submit answer.','wrong'); }
  }

  function boxSideKeys(row,col){return[`h-${row}-${col}`,`h-${row+1}-${col}`,`v-${row}-${col}`,`v-${row}-${col+1}`];}
  function countBoxDrawnSides(row,col,lines=state.lines){return boxSideKeys(row,col).filter(key=>lines[key].drawn).length;}
  function boxesAffectedByLine(key,lines=state.lines){const{type,r,c}=lines[key],boxes=[];if(type==='h'){if(r<state.dotsY-1)boxes.push({r,c});if(r>0)boxes.push({r:r-1,c});}else{if(c<state.dotsX-1)boxes.push({r,c});if(c>0)boxes.push({r,c:c-1});}return boxes;}
  function getUndrawnLines(){return Object.keys(state.lines).filter(key=>!state.lines[key].drawn);}

  function placeLine(lineKey, playerId) {
    if (state.mode === 'multiplayer') { placeOnlineLine(lineKey); return; }
    if(!state.lines[lineKey]||state.lines[lineKey].drawn)return;
    state.lines[lineKey].drawn=true;state.lines[lineKey].owner=playerId;state.recentLines.push({key:lineKey,t:performance.now()});
    const current=state.players[playerId];let completed=0;
    boxesAffectedByLine(lineKey).forEach(({r,c})=>{if(state.boxes[r][c].owner===null&&countBoxDrawnSides(r,c)===4){state.boxes[r][c].owner=playerId;current.score++;state.claimedBoxes++;completed++;spawnParticles(r,c,current.color);}});
    state.chainCount=completed?state.chainCount+completed:0;state.maxChain=Math.max(state.maxChain,state.chainCount);render();renderHUD();
    if(state.claimedBoxes>=state.totalBoxes){setTimeout(endSingleGame,500);return;}
    setTimeout(()=>{if(!completed)state.currentPlayerIndex=(state.currentPlayerIndex+1)%state.players.length;startTurn();},400);
  }

  async function placeOnlineLine(lineKey) {
    state.awaitingHumanLine=false;
    try {
      await MultiplayerManager.submitMove(match.id,(fresh,uid)=>{
        if(fresh.currentTurn!==uid||fresh.gameState.turnGate?.status!=='passed')throw new Error('ANSWER_REQUIRED');
        const seat=fresh.player1.uid===uid?0:1, lines=structuredClone(fresh.gameState.lines),boxes=structuredClone(fresh.gameState.boxes),scores=[...fresh.gameState.scores];
        if(!lines[lineKey]||lines[lineKey].drawn)throw new Error('LINE_TAKEN');lines[lineKey].drawn=true;lines[lineKey].owner=seat;
        let completed=0;const dots=fresh.gameState.dotsX;
        const affected=(()=>{const{type,r,c}=lines[lineKey],out=[];if(type==='h'){if(r<dots-1)out.push({r,c});if(r>0)out.push({r:r-1,c});}else{if(c<dots-1)out.push({r,c});if(c>0)out.push({r,c:c-1});}return out;})();
        affected.forEach(({r,c})=>{if(boxes[r][c].owner===null&&boxSideKeys(r,c).every(key=>lines[key].drawn)){boxes[r][c].owner=seat;scores[seat]++;completed++;}});
        const claimed=Number(fresh.gameState.claimedBoxes||0)+completed,chain=completed?Number(fresh.gameState.chainCount||0)+completed:0,maxChain=Math.max(Number(fresh.gameState.maxChain||0),chain);
        if(claimed>=(dots-1)*(dots-1)){const winner=scores[0]===scores[1]?'draw':scores[0]>scores[1]?fresh.player1.uid:fresh.player2.uid;return{gameState:{...fresh.gameState,lines,boxes,scores,claimedBoxes:claimed,chainCount:chain,maxChain,turnGate:null},status:'finished',currentTurn:null,winner,rematchRequests:{}};}
        const nextSeat=completed?seat:1-seat,nextUid=nextSeat===0?fresh.player1.uid:fresh.player2.uid;
        return{currentTurn:nextUid,gameState:{...fresh.gameState,lines,boxes,scores,claimedBoxes:claimed,currentSeat:nextSeat,chainCount:chain,maxChain,turnGate:{uid:nextUid,status:'pending',nonce:`${fresh.round}-${Date.now()}`}}};
      });
    } catch(error){showFeedback(error.message==='LINE_TAKEN'?'That line was already taken.':'Move could not be submitted.','wrong');}
  }

  function startTurn() {
    if(state.mode==='multiplayer'){manageOnlineTurn();return;}
    const current=state.players[state.currentPlayerIndex];renderHUD();showTurnBanner(current);
    if(current.isHuman){askQuestion(current,correct=>{current.questionsAttempted++;if(correct)current.questionsCorrect++;PlatformManager.recordQuestionAnswered(GAME_ID,correct);if(correct){showFeedback('Correct! Draw a line','correct');state.awaitingHumanLine=true;}else if(!state.safeConnectionUsed&&dotBoost('dot-n-box-deducer_safe_connection')){state.safeConnectionUsed=true;showFeedback('Safe Connection saved your turn!','correct');state.awaitingHumanLine=true;}else{showFeedback('Incorrect — turn passes','wrong');setTimeout(()=>{state.chainCount=0;state.currentPlayerIndex=(state.currentPlayerIndex+1)%state.players.length;startTurn();},800);}});}
    else setTimeout(()=>{current.questionsAttempted++;const correct=Math.random()*100<current.accuracy;if(correct){current.questionsCorrect++;const line=chooseBotLine(current);if(line)placeLine(line,current.id);}else{showFeedback(`${current.name} answered incorrectly`,'wrong');setTimeout(()=>{state.chainCount=0;state.currentPlayerIndex=(state.currentPlayerIndex+1)%state.players.length;startTurn();},800);}},650);
  }

  function completionCount(key){return boxesAffectedByLine(key).filter(({r,c})=>countBoxDrawnSides(r,c)===3).length;}
  function chooseBotLine(bot){const undrawn=getUndrawnLines(),completing=undrawn.filter(key=>completionCount(key)>0);if(completing.length)return completing.sort((a,b)=>completionCount(b)-completionCount(a))[0];const safe=undrawn.filter(key=>!boxesAffectedByLine(key).some(({r,c})=>countBoxDrawnSides(r,c)===2));const pool=safe.length?safe:undrawn;const mistake={low:.35,medium:.15,high:.05}[bot.difficulty]||.15;return Math.random()<mistake?undrawn[Math.floor(Math.random()*undrawn.length)]:pool[Math.floor(Math.random()*pool.length)];}

  const modalOverlay=$('question-modal'),modalBox=$('question-modal-box'),modalWho=$('question-who'),modalBody=$('question-body');
  function askQuestion(turnPlayer,callback){activeQuestion=MultiplayerQuestionHelper.next();if(!activeQuestion){showFeedback('No questions available','wrong');return;}modalBox.style.setProperty('--chip-color',turnPlayer.color);modalWho.textContent=`${turnPlayer.name.toUpperCase()} — ANSWER TO EARN YOUR MOVE`;modalBody.innerHTML=`<div class="prompt"></div><div class="answer-list"></div>`;modalBody.querySelector('.prompt').textContent=activeQuestion.prompt;activeQuestion.answers.forEach(answer=>{const button=document.createElement('button');button.className='mc-option';button.textContent=answer.text;button.onclick=()=>{closeModal();callback(answer.correct);};modalBody.querySelector('.answer-list').appendChild(button);});modalOverlay.classList.add('show');}
  function closeModal(){modalOverlay.classList.remove('show');}

  function renderHUD(){const hud=$('hud');hud.innerHTML='';state.players.forEach((item,index)=>{const chip=document.createElement('div');chip.className=`hud-chip${index===state.currentPlayerIndex?' active-turn':''}`;chip.style.setProperty('--chip-color',item.color);chip.innerHTML=`<span class="dot-swatch"></span><span>${item.name}</span><span class="hud-score">${item.score||0}</span>`;hud.appendChild(chip);});}
  function showTurnBanner(turnPlayer){const banner=$('turn-banner');banner.style.setProperty('--chip-color',turnPlayer.color);banner.textContent=turnPlayer.isHuman?'YOUR TURN':`${turnPlayer.name.toUpperCase()}'S TURN`;banner.classList.add('show');clearTimeout(showTurnBanner.timer);showTurnBanner.timer=setTimeout(()=>banner.classList.remove('show'),1200);}
  function showFeedback(message,kind){const toast=$('feedback-toast');toast.textContent=message;toast.className=`show ${kind}`;clearTimeout(showFeedback.timer);showFeedback.timer=setTimeout(()=>toast.classList.remove('show'),1100);}

  const canvas=$('gameCanvas'),ctx=canvas.getContext('2d');
  function computeLayout(){const size=600,margin=40;canvas.width=size;canvas.height=size;state.layout={margin,size,cellSize:(size-margin*2)/(Math.max(state.dotsX,state.dotsY)-1)};}
  function dotPos(r,c){return{x:state.layout.margin+c*state.layout.cellSize,y:state.layout.margin+r*state.layout.cellSize};}
  function lineEndpoints(key){const{type,r,c}=state.lines[key];return type==='h'?[dotPos(r,c),dotPos(r,c+1)]:[dotPos(r,c),dotPos(r+1,c)];}
  function render(){const blueprint=dotReward('board')?.id==='dot-n-box-deducer_blueprint_board',matrix=dotReward('theme')?.id==='dot-n-box-deducer_deduction_matrix',tic=dotReward('crossover')?.id==='dot-n-box-deducer_tic_tac_grid',prism=dotReward('lines')?.id==='dot-n-box-deducer_prismatic_lines',neon=dotReward('dots')?.id==='dot-n-box-deducer_neon_dots';ctx.clearRect(0,0,600,600);ctx.fillStyle=blueprint?'#082b55':matrix?'#020b12':'#0b0e1a';ctx.fillRect(0,0,600,600);if(blueprint||matrix){ctx.strokeStyle=blueprint?'rgba(95,205,255,.13)':'rgba(35,255,166,.1)';ctx.lineWidth=1;const gap=blueprint?24:30;for(let n=0;n<=600;n+=gap){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n,600);ctx.stroke();ctx.beginPath();ctx.moveTo(0,n);ctx.lineTo(600,n);ctx.stroke();}}for(let r=0;r<state.dotsY-1;r++)for(let c=0;c<state.dotsX-1;c++){const box=state.boxes[r]?.[c];if(!box)continue;const pos=dotPos(r,c),size=state.layout.cellSize;if(box.owner!==null){const owner=state.players[box.owner];if(!owner)continue;ctx.fillStyle=hexToRgba(owner.color,.18);ctx.fillRect(pos.x+4,pos.y+4,size-8,size-8);ctx.fillStyle=owner.color;ctx.font='700 11px Lexend';ctx.textAlign='center';ctx.fillText(tic?(box.owner===0?'X':'O'):`P${box.owner+1}`,pos.x+size/2,pos.y+size/2);}}ctx.lineCap='round';Object.keys(state.lines).forEach((key,index)=>{const line=state.lines[key],[a,b]=lineEndpoints(key);const owner=state.players[line.owner];ctx.strokeStyle=line.drawn&&owner?(prism?`hsl(${(performance.now()/20+index*13)%360} 95% 65%)`:owner.color):'rgba(138,148,190,.18)';ctx.lineWidth=line.drawn?6:4;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();});for(let r=0;r<state.dotsY;r++)for(let c=0;c<state.dotsX;c++){const{x,y}=dotPos(r,c);ctx.fillStyle=neon?`hsl(${(performance.now()/18+(r+c)*35)%360} 100% 72%)`:'#eef2ff';if(neon){ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;}ctx.fillRect(x-(neon?5:4),y-(neon?5:4),neon?10:8,neon?10:8);ctx.shadowBlur=0;}state.particles.forEach(p=>{ctx.fillStyle=hexToRgba(p.color,Math.max(p.life,0));ctx.fillRect(p.x-3,p.y-3,6,6);});}
  function hexToRgba(hex,alpha){const value=hex.replace('#','');return`rgba(${parseInt(value.slice(0,2),16)},${parseInt(value.slice(2,4),16)},${parseInt(value.slice(4,6),16)},${alpha})`;}
  function spawnParticles(r,c,color){const pos=dotPos(r,c),center={x:pos.x+state.layout.cellSize/2,y:pos.y+state.layout.cellSize/2},burst=dotReward('captureEffect')?.id==='dot-n-box-deducer_pixel_burst_boxes';for(let i=0;i<(burst?42:14);i++)state.particles.push({x:center.x,y:center.y,vx:(Math.random()-.5)*(burst?9:5),vy:(Math.random()-.5)*(burst?9:5),life:1,color:burst?PLAYER_COLORS[i%PLAYER_COLORS.length]:color});requestAnimationFrame(particleLoop);}
  function particleLoop(){state.particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life-=.035;});state.particles=state.particles.filter(p=>p.life>0);render();if(state.particles.length)requestAnimationFrame(particleLoop);}
  function distToSegment(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy,t=Math.max(0,Math.min(1,len?((px-ax)*dx+(py-ay)*dy)/len:0));return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));}
  canvas.addEventListener('pointerdown',event=>{if(!state.awaitingHumanLine)return;const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*canvas.width/rect.width,y=(event.clientY-rect.top)*canvas.height/rect.height;let best=null,distance=22;getUndrawnLines().forEach(key=>{const[a,b]=lineEndpoints(key),next=distToSegment(x,y,a.x,a.y,b.x,b.y);if(next<distance){best=key;distance=next;}});if(best){state.awaitingHumanLine=false;placeLine(best,state.currentPlayerIndex);}});

  function endSingleGame(){renderGameOver();showScreen('screen-gameover');const human=state.players[0],best=Math.max(...state.players.map(p=>p.score)),result=human.score===best?(state.players.filter(p=>p.score===best).length>1?'draw':'win'):'loss';PlatformManager.recordMultiplayerResult(GAME_ID,result);window.AchievementManager?.notify?.('cpu_match',{facts:completionFacts(result,human,state.maxChain)});PlatformManager.endSession(GAME_ID);sessionStarted=false;}
  function completionFacts(result,human,maxChain){const accuracy=human.questionsAttempted?Math.round(human.questionsCorrect/human.questionsAttempted*100):0;return{match_completed:1,[`match_result_${result}`]:1,dot_box_smart_victory:result==='win'&&human.questionsAttempted>=5&&accuracy>=80?1:0,mastery_dot_n_box_deducer:maxChain>=4?1:0,dot_box_chain_mastery:maxChain>=4?1:0,match_questions_answered:human.questionsAttempted,match_accuracy:accuracy};}
  function recordOnlineResult(){if(recordedRound===match.round)return;recordedRound=match.round;const seat=match.player1.uid===player.uid?0:1,stats=match.gameState.questionStats[seat],result=match.winner==='draw'?'draw':match.winner===player.uid?'win':'loss';PlatformManager.recordMultiplayerResult(GAME_ID,result);window.AchievementManager?.notify?.('match_completed',{facts:completionFacts(result,{questionsAttempted:stats.answered,questionsCorrect:stats.correct},match.gameState.maxChain)});PlatformManager.endSession(GAME_ID);sessionStarted=false;}
  function renderGameOver(){const summary=state.players.map(p=>({name:p.name,score:p.score||0,answered:p.questionsAttempted||0,correct:p.questionsCorrect||0})).sort((a,b)=>b.score-a.score);$('gameover-rankings').innerHTML=summary.map((p,index)=>`<div class="rank-row${index===0?' first':''}"><div class="rank-num">${index===0?'🏆':index+1}</div><div class="rank-name">${p.name}</div><div class="rank-stats">${p.score} boxes · ${p.correct}/${p.answered} correct</div></div>`).join('');}
  async function rematch(){if(isSinglePlayer){state.startingPlayerIndex=(state.startingPlayerIndex+1)%state.players.length;state.currentPlayerIndex=state.startingPlayerIndex;applyBoard(emptyBoard(state.playerCount));beginSession();showScreen('screen-game');startTurn();}else await MultiplayerManager.requestRematch(match.id,emptyBoard(2));}
  async function leaveGame(){if(stopListening){stopListening();stopListening=null;}if(!isSinglePlayer&&matchId){try{await MultiplayerManager.leaveMatch(matchId);}catch(_){}}localStorage.removeItem(ACTIVE_MATCH_KEY);match=null;matchId=null;closeModal();if(sessionStarted)PlatformManager.endSession(GAME_ID);sessionStarted=false;showScreen('screen-home');}
  async function returnHome(message){localStorage.removeItem(ACTIVE_MATCH_KEY);if(stopListening){stopListening();stopListening=null;}match=null;matchId=null;showScreen('screen-home');setMessage(message,true);}
  function updateHomeStats(){const stats=PlatformManager.getGameStats(GAME_ID)||{};$('home-stats').innerHTML=`<span>Wins <b>${stats.wins||0}</b></span><span>Losses <b>${stats.losses||0}</b></span><span>Games <b>${stats.gamesPlayed||0}</b></span>`;}
  window.addEventListener('resize',()=>{computeLayout();render();});
  window.addEventListener('arcade-progression-changed',render);
  document.addEventListener('DOMContentLoaded',initialise);
})();
