/** Independent-run Challenge Mode shared by every Arcade Academy game. */
(function (global) {
  'use strict';

  // Master kill switch. Set false to remove all Challenge Mode UI and network activity.
  const CHALLENGE_MODE_ENABLED = false;
  const UPDATE_INTERVAL_MS = 400;
  const DISCONNECT_TIMEOUT_MS = 30000;
  const ACTIVE_ROOM_KEY = 'arcadeAcademy.activeChallenge';
  const TYPE_LABELS = {
    scoreAttack:['SCORE ATTACK','Highest score wins'], survival:['SURVIVAL','Last player alive wins'],
    distanceRace:['DISTANCE RACE','Travel furthest'], waveRace:['WAVE RACE','Reach the highest wave'],
    timeAttack:['TIME ATTACK','First to the target score'], questionRace:['QUESTION RACE','First to the correct-answer target'],
    accuracyChallenge:['ACCURACY CHALLENGE','Highest qualifying accuracy wins']
  };
  let config=null, gameId=null, player=null, room=null, roomCode=null, unsubscribe=null, panel=null, hud=null;
  let pendingProgress={}, lastSent={}, sendTimer=null, accuracyTimer=null, disconnectTimer=null, selectionShownRound=null, countdownRound=null, runStartedAt=0, resultClaimedRound=null, launchedRound=null, starting=false, hooks={};
  let localQuestions={correct:0,answered:0};

  function gameConfig(){
    try { return global.GAME_CONFIG || (typeof GameConfig !== 'undefined' ? GameConfig : null); } catch (_) { return global.GAME_CONFIG || null; }
  }
  function challengeConfig(value){ return value?.challengeMode || null; }
  function validTypes(){
    return Object.entries(config?.types||{}).filter(([,value])=>value?.enabled).map(([type,value])=>({type,config:{...value}}));
  }
  function initialProgress(){return{score:0,alive:true,distance:0,wave:0,waveProgress:0,questionsCorrect:0,questionsAnswered:0,survivalTimeMs:0,finished:false};}
  function slotFor(uid=player?.uid){return room?.player1?.uid===uid?'player1':room?.player2?.uid===uid?'player2':null;}
  function opponent(){const mine=slotFor();return mine==='player1'?room?.player2:room?.player1;}
  function escapeHtml(value){const div=document.createElement('div');div.textContent=String(value??'');return div.innerHTML;}
  function setStatus(text,error=false){const el=panel?.querySelector('[data-challenge-status]');if(el){el.textContent=text||'';el.classList.toggle('error',error);}}

  async function requirePlayer(){
    if(player)return player;
    if(global.MultiplayerManager){await global.MultiplayerManager.initialiseAuth();player=await global.MultiplayerManager.requirePlayer();return player;}
    player=await new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>{if(!settled)reject(new Error('Return to the Hub and sign in before starting a challenge.'));},8000);global.FirebaseManager?.watchAuthState?.(async user=>{if(settled||!user)return;settled=true;clearTimeout(timer);const profile=await global.FirebaseManager.getUserProfile(user.uid);resolve({uid:user.uid,displayName:profile?.displayName||user.displayName||'Student'});});});
    return player;
  }

  function injectStyles(){if(document.getElementById('arcade-challenge-styles'))return;const style=document.createElement('style');style.id='arcade-challenge-styles';style.textContent=`
  #arcade-challenge-open{position:fixed;z-index:9996;left:12px;bottom:12px;padding:11px 15px;color:#fff;background:linear-gradient(145deg,#09285d,#1255a0);border:2px solid #00d4ff;border-radius:9px;box-shadow:0 0 16px rgba(0,212,255,.38);font:800 13px var(--font-body,sans-serif);cursor:pointer}
  #arcade-challenge-panel{position:fixed;z-index:11000;inset:0;display:grid;place-items:center;padding:16px;overflow:auto;background:rgba(2,8,25,.92)}#arcade-challenge-panel[hidden]{display:none}.challenge-window{width:min(620px,100%);padding:20px;color:#fff;background:linear-gradient(145deg,#071536,#0d2e67);border:3px solid #00d4ff;border-radius:14px;box-shadow:0 0 30px rgba(0,212,255,.35);font-family:var(--font-body,sans-serif)}.challenge-window h2,.challenge-window h3{color:#00d4ff;font-family:var(--font-title,monospace);line-height:1.5}.challenge-actions,.challenge-wager-controls{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.challenge-window button,.challenge-window input{min-height:42px;padding:8px 12px;color:#fff;background:#172d60;border:2px solid #587dc5;border-radius:8px;font:700 14px inherit}.challenge-window button{cursor:pointer}.challenge-window button:hover{border-color:#00d4ff}.challenge-window button:disabled{opacity:.45}.challenge-code{font:900 clamp(34px,10vw,64px) var(--font-title,monospace);letter-spacing:.16em;color:#ffd15c;text-align:center}.challenge-players{display:grid;grid-template-columns:1fr 1fr;gap:10px}.challenge-player{padding:12px;background:rgba(0,0,0,.22);border:2px solid #4568a8;border-radius:9px}.challenge-player.ready{border-color:#2ecc71}.challenge-balance{color:#ffd15c;font-weight:800}.challenge-wager-value{min-width:70px;text-align:center;font-size:20px}.challenge-status{min-height:1.4em;color:#b9eaff}.challenge-status.error{color:#ff8fa8}.challenge-picker{text-align:center;padding:16px;border:2px dashed #ffd15c}.challenge-countdown{font:900 clamp(60px,20vw,140px) var(--font-title,monospace);text-align:center;color:#ffd15c;text-shadow:0 0 25px #00d4ff}
  #arcade-challenge-hud{position:fixed;z-index:9995;top:10px;left:50%;transform:translateX(-50%);min-width:min(410px,90vw);padding:8px 12px;color:#fff;background:rgba(4,18,51,.9);border:2px solid #00d4ff;border-radius:9px;pointer-events:none;font:700 12px var(--font-body,sans-serif)}#arcade-challenge-hud[hidden]{display:none}.challenge-hud-values{display:grid;grid-template-columns:1fr auto 1fr;gap:9px;text-align:center}.challenge-hud-type{color:#ffd15c;text-align:center;font-family:var(--font-title,monospace);font-size:9px}.challenge-result{text-align:center}.challenge-result strong{display:block;font:900 clamp(26px,7vw,48px) var(--font-title,monospace);color:#ffd15c}@media(max-width:520px){.challenge-players{grid-template-columns:1fr}#arcade-challenge-open{bottom:8px;left:8px}}
  `;document.head.appendChild(style);}

  function buildUI(){
    injectStyles();const open=document.createElement('button');open.id='arcade-challenge-open';open.type='button';open.textContent='⚔ CHALLENGE MODE';open.onclick=showMenu;document.body.appendChild(open);
    panel=document.createElement('section');panel.id='arcade-challenge-panel';panel.hidden=true;panel.innerHTML='<div class="challenge-window"><button type="button" data-close style="float:right">×</button><div data-challenge-content></div><p class="challenge-status" data-challenge-status role="status"></p></div>';document.body.appendChild(panel);panel.querySelector('[data-close]').onclick=()=>{if(!room||['waiting','ready','finished'].includes(room.status))panel.hidden=true;else confirmForfeit();};
    hud=document.createElement('aside');hud.id='arcade-challenge-hud';hud.hidden=true;document.body.appendChild(hud);
  }
  function content(html){panel.querySelector('[data-challenge-content]').innerHTML=html;panel.hidden=false;}
  function showMenu(){content(`<h2>Challenge Mode</h2><p>Compete toward one shared objective while both players run their own independent game.</p><div class="challenge-actions"><button data-create>Create Challenge</button><button data-show-join>Join Challenge</button></div><div data-join hidden><input data-code inputmode="numeric" maxlength="5" placeholder="00000"><button data-join-button>Join</button></div>`);const root=panel.querySelector('[data-challenge-content]');root.querySelector('[data-create]').onclick=createRoom;root.querySelector('[data-show-join]').onclick=()=>root.querySelector('[data-join]').hidden=false;root.querySelector('[data-join-button]').onclick=()=>joinRoom(root.querySelector('[data-code]').value);}

  async function createRoom(){try{setStatus('Creating challenge…');await requirePlayer();roomCode=await global.FirebaseManager.createChallengeRoom(gameId,player,validTypes());localStorage.setItem(ACTIVE_ROOM_KEY,JSON.stringify({gameId,roomCode}));listen(roomCode);}catch(error){setStatus(error.message||'Could not create challenge.',true);}}
  async function joinRoom(code){try{setStatus('Joining challenge…');await requirePlayer();roomCode=await global.FirebaseManager.joinChallengeRoom(String(code).trim(),player);localStorage.setItem(ACTIVE_ROOM_KEY,JSON.stringify({gameId,roomCode}));listen(roomCode);}catch(error){const messages={ROOM_NOT_FOUND:'Room not found.',ROOM_FULL:'That challenge is full.',CREATOR_CANNOT_JOIN:'You created this challenge.'};setStatus(messages[error.message]||error.message,true);}}
  function listen(code){if(unsubscribe)unsubscribe();unsubscribe=global.FirebaseManager.watchChallengeRoom(code,onRoom,error=>setStatus(error.message||'Challenge connection lost.',true));}
  async function onRoom(next){
    if(!next)return leaveLocal();room=next;roomCode=next.roomCode||next.id;const mine=slotFor();if(!mine)return;
    if((room.status==='waiting'||room.status==='ready')){renderLobby();if(mine==='player1'&&room.player2&&room.player1.ready&&room.player2.ready&&!starting){starting=true;const choices=validTypes().filter(item=>validTypes().length===1||item.type!==room.previousChallengeType);const selected=choices[Math.floor(Math.random()*choices.length)]||validTypes()[0];try{await global.FirebaseManager.updateChallengeRoom(roomCode,{type:'start',challengeType:selected.type});}finally{starting=false;}}return;}
    if(room.status==='countdown'){renderSelection();scheduleCountdown();return;}
    if(room.status==='playing'){panel.hidden=true;hud.hidden=false;runStartedAt=runStartedAt||Date.now();renderHud();monitorOpponentConnection();if(launchedRound!==room.round){launchedRound=room.round;localQuestions={correct:0,answered:0};if(room.selectedChallenge?.type==='accuracyChallenge'){clearTimeout(accuracyTimer);const endAt=Number(room.startedAt)+(Number(room.selectedChallenge.durationSeconds)||300)*1000;accuracyTimer=setTimeout(()=>finish(hooks.snapshot?.()||{}),Math.max(0,endAt-Date.now()));}if(hooks.start)hooks.start(room.selectedChallenge);else launchNormalRun();}return;}
    if(room.status==='finished'){hud.hidden=true;await renderResult();}
  }
  function renderLobby(){
    const mine=room[slotFor()],other=opponent(),balance=global.PlatformManager?.getCoins?.()||0;
    content(`<h2>Challenge Lobby</h2><div class="challenge-code">${roomCode}</div><div class="challenge-players"><div class="challenge-player ${room.player1.ready?'ready':''}"><b>${escapeHtml(room.player1.displayName)}</b><span>${room.player1.ready?'READY':'NOT READY'}</span><small>Wager ${room.player1.wager||0}</small></div><div class="challenge-player ${room.player2?.ready?'ready':''}"><b>${escapeHtml(room.player2?.displayName||'Waiting for Player 2')}</b><span>${room.player2?.ready?'READY':'NOT READY'}</span><small>Wager ${room.player2?.wager||0}</small></div></div><h3>Your Wager</h3><p class="challenge-balance">Balance: ${balance} coins</p>${balance===0?'<p>NO COINS AVAILABLE — you can still play for free.</p>':''}<div class="challenge-wager-controls"><button data-delta="-10">-10</button><button data-delta="-1">-1</button><span class="challenge-wager-value">${mine.wager||0}</span><button data-delta="1">+1</button><button data-delta="10">+10</button><button data-max>MAX</button></div><div class="challenge-actions"><button data-ready ${!other?'disabled':''}>${mine.ready?'UNREADY':'READY'}</button><button data-leave>Leave Room</button></div>`);
    panel.querySelectorAll('[data-delta]').forEach(button=>button.onclick=()=>setWager(Math.max(0,Math.min(balance,(mine.wager||0)+Number(button.dataset.delta)))));panel.querySelector('[data-max]').onclick=()=>setWager(balance);panel.querySelector('[data-ready]').onclick=()=>global.FirebaseManager.updateChallengeRoom(roomCode,{type:'ready',ready:!mine.ready});panel.querySelector('[data-leave]').onclick=leaveRoom;
  }
  async function setWager(wager){try{await global.FirebaseManager.updateChallengeRoom(roomCode,{type:'wager',wager});}catch(error){setStatus(error.message,true);}}
  function renderSelection(){const [label,detail]=TYPE_LABELS[room.selectedChallenge.type]||[room.selectedChallenge.type,''],isNew=selectionShownRound!==room.round;content(`<div class="challenge-picker"><p data-picker-label>${isNew?'CHOOSING CHALLENGE…':'CHALLENGE SELECTED'}</p><h2 data-picker-mode>${isNew?'???':label}</h2><p data-picker-detail>${isNew?'':targetText(room.selectedChallenge)||detail}</p></div><div class="challenge-countdown" data-countdown>…</div>`);if(!isNew)return;selectionShownRound=room.round;const modes=validTypes().map(item=>TYPE_LABELS[item.type]?.[0]||item.type);let index=0;const cycle=setInterval(()=>{const mode=panel.querySelector('[data-picker-mode]');if(mode)mode.textContent=modes[index++%modes.length];},90);setTimeout(()=>{clearInterval(cycle);const labelNode=panel.querySelector('[data-picker-label]'),mode=panel.querySelector('[data-picker-mode]'),detailNode=panel.querySelector('[data-picker-detail]');if(labelNode)labelNode.textContent='CHALLENGE SELECTED';if(mode)mode.textContent=label;if(detailNode)detailNode.textContent=targetText(room.selectedChallenge)||detail;},1500);}
  function targetText(selected){if(selected.type==='questionRace')return `First to ${selected.targetCorrect||25} correct answers`;if(selected.type==='timeAttack')return `First to ${selected.targetScore||10000} points`;if(selected.type==='accuracyChallenge')return `Highest accuracy after at least ${selected.minimumQuestions||20} questions`;return TYPE_LABELS[selected.type]?.[1]||'';}
  function launchNormalRun(){const selectors=[config.startSelector,'#homeStartBtn','#start-btn','#startBtn','#start-button','#beginGameBtn','#btn-start-single','#start-single-btn'].filter(Boolean);const button=selectors.map(selector=>document.querySelector(selector)).find(item=>item&&!item.disabled&&item.offsetParent!==null);button?.click();}
  function scheduleCountdown(){if(countdownRound===room.round)return;countdownRound=room.round;const tick=()=>{if(!room||room.status!=='countdown')return;const remaining=Math.ceil((Number(room.startedAt)-Date.now())/1000),el=panel.querySelector('[data-countdown]');if(el)el.textContent=remaining>3?'…':remaining>0?remaining:'GO!';if(remaining<=0){countdownRound=null;update({});return;}setTimeout(tick,200);};tick();}
  function formatMetric(progress={}){const type=room?.selectedChallenge?.type;if(type==='questionRace')return `${progress.questionsCorrect||0} / ${room.selectedChallenge.targetCorrect||25}`;if(type==='accuracyChallenge')return `${progress.questionsAnswered?((progress.questionsCorrect/progress.questionsAnswered)*100).toFixed(1):0}%`;if(type==='distanceRace')return `${Math.floor(progress.distance||0)} m`;if(type==='waveRace')return `Wave ${progress.wave||0}`;if(type==='survival')return progress.alive===false?'DEAD':`${Math.floor((progress.survivalTimeMs||0)/1000)}s`;return Math.floor(progress.score||0).toLocaleString();}
  function renderHud(){const mine=room[slotFor()]?.progress||{},other=opponent()?.progress||{},label=TYPE_LABELS[room.selectedChallenge.type]?.[0]||room.selectedChallenge.type;hud.innerHTML=`<div class="challenge-hud-type">${label}</div><div class="challenge-hud-values"><span>YOU<br><b>${formatMetric(mine)}</b></span><i>VS</i><span>OPPONENT<br><b>${formatMetric(other)}</b></span></div>`;}
  function monitorOpponentConnection(){clearTimeout(disconnectTimer);const other=opponent();if(!other||other.connected!==false)return;hud.insertAdjacentHTML('beforeend','<div style="color:#ff8fa8;text-align:center">OPPONENT CONNECTION LOST — waiting 30 seconds…</div>');const remaining=Math.max(0,DISCONNECT_TIMEOUT_MS-(Date.now()-Number(other.disconnectedAt||Date.now())));disconnectTimer=setTimeout(()=>global.FirebaseManager.updateChallengeRoom(roomCode,{type:'disconnectForfeit'}).catch(()=>{}),remaining);}

  function update(values={}){
    if(!room||!['countdown','playing'].includes(room.status))return;pendingProgress={...pendingProgress,...values,questionsCorrect:Math.max(localQuestions.correct,Number(values.questionsCorrect)||0),questionsAnswered:Math.max(localQuestions.answered,Number(values.questionsAnswered)||0),survivalTimeMs:Math.max(0,Date.now()-(runStartedAt||Date.now()))};
    if(values.alive===false||values.finished||importantChange(pendingProgress))flush();else if(!sendTimer)sendTimer=setTimeout(flush,UPDATE_INTERVAL_MS);
  }
  function importantChange(next){return next.wave!==undefined&&next.wave!==lastSent.wave||next.questionsAnswered!==undefined&&next.questionsAnswered!==lastSent.questionsAnswered;}
  async function flush(){if(sendTimer){clearTimeout(sendTimer);sendTimer=null;}if(!room||!Object.keys(pendingProgress).length)return;const progress={...initialProgress(),...room[slotFor()]?.progress,...pendingProgress};pendingProgress={};lastSent={...progress};try{await global.FirebaseManager.updateChallengeRoom(roomCode,{type:'progress',progress});}catch(error){console.warn('[Challenge Mode] Progress update failed:',error);}}
  function finish(values={}){update({...values,finished:true,alive:values.alive!==undefined?values.alive:false});}
  async function forfeit(){try{await global.FirebaseManager.updateChallengeRoom(roomCode,{type:'forfeit'});}catch(error){setStatus(error.message,true);}}
  function confirmForfeit(){if(confirm('Leaving counts as a forfeit. You will lose your wager.'))forfeit();}
  async function renderResult(){
    panel.hidden=false;const round=room.round||1;if(resultClaimedRound!==round){try{const claim=await global.FirebaseManager.claimChallengeEconomy(roomCode);resultClaimedRound=round;global.PlatformManager?.recordChallengeResult?.(gameId,claim,room.selectedChallenge?.type);}catch(error){if(error.message==='CLAIM_INVALID'&&room.economyProcessed?.[player.uid])resultClaimedRound=round;else console.warn('[Challenge Mode] Reward claim failed:',error);}}
    const processed=room.economyProcessed?.[player.uid],result=processed?.result||(room.winnerUid==='draw'?'draw':room.winnerUid===player.uid?'win':'loss'),claim=processed||{};content(`<div class="challenge-result"><strong>${result==='win'?'VICTORY!':result==='loss'?'DEFEAT':'DRAW'}</strong><h3>${TYPE_LABELS[room.selectedChallenge?.type]?.[0]||''}</h3><p>You: ${formatMetric(room[slotFor()]?.progress)}</p><p>Opponent: ${formatMetric(opponent()?.progress)}</p><p>Wager: ${room[slotFor()]?.wager||0}</p><p>${result==='win'?'Reward':result==='loss'?'Lost':'Change'}: ${Number(claim.delta)>0?'+':''}${claim.delta||0} coins</p><div class="challenge-actions"><button data-rematch>REMATCH</button><button data-hub>RETURN TO HUB</button></div></div>`);panel.querySelector('[data-rematch]').onclick=()=>global.FirebaseManager.updateChallengeRoom(roomCode,{type:'rematch'});panel.querySelector('[data-hub]').onclick=()=>location.href='../../index.html';
  }
  function leaveLocal(){unsubscribe?.();unsubscribe=null;room=null;roomCode=null;localStorage.removeItem(ACTIVE_ROOM_KEY);panel.hidden=true;hud.hidden=true;}
  async function leaveRoom(){try{if(roomCode)await global.FirebaseManager.updateChallengeRoom(roomCode,{type:'leave'});}catch(_){}leaveLocal();}
  function hookPlatform(){
    const pm=global.PlatformManager;if(!pm||pm.__challengeHooked)return;pm.__challengeHooked=true;
    const question=pm.recordQuestionAnswered;pm.recordQuestionAnswered=function(id,correct){const result=question.apply(this,arguments);if(id===gameId&&room?.status==='playing'){localQuestions.answered++;if(correct)localQuestions.correct++;update({questionsAnswered:localQuestions.answered,questionsCorrect:localQuestions.correct});}return result;};
    const end=pm.endSession;pm.endSession=function(id){if(id===gameId&&room?.status==='playing')finish(hooks.snapshot?.()||{});return end.apply(this,arguments);};
  }
  function register(adapter={}){hooks={...hooks,...adapter};}
  async function init(){
    global.CHALLENGE_MODE_ENABLED=CHALLENGE_MODE_ENABLED;if(!CHALLENGE_MODE_ENABLED||!/\/games\//.test(location.pathname))return;
    for(let attempt=0;attempt<80&&!gameConfig();attempt++)await new Promise(resolve=>setTimeout(resolve,50));const raw=gameConfig();config=challengeConfig(raw);gameId=raw?.id||raw?.meta?.id;if(!config?.enabled||!gameId||!validTypes().length)return;
    buildUI();hookPlatform();document.addEventListener('visibilitychange',()=>{if(roomCode&&['countdown','playing'].includes(room?.status||''))global.FirebaseManager?.updateChallengeRoom?.(roomCode,{type:'presence',connected:document.visibilityState==='visible'}).catch(()=>{});});try{const saved=JSON.parse(localStorage.getItem(ACTIVE_ROOM_KEY)||'null');if(saved?.gameId===gameId&&/^\d{5}$/.test(saved.roomCode)){await requirePlayer();roomCode=saved.roomCode;listen(roomCode);}}catch(_){}
  }
  global.ChallengeManager={enabled:CHALLENGE_MODE_ENABLED,register,update,updateScore:score=>update({score}),finish,forfeit,getRoom:()=>room,getConfig:()=>config};
  global.dispatchEvent(new Event('arcade-challenge-manager-ready'));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
