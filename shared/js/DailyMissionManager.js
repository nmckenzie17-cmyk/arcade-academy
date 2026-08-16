/** Three account-specific daily missions selected from a shared pool of twenty. */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'arcadeAcademy.dailyMissions.v1';
  const COIN_REWARD = 50;
  const XP_REWARD = 200;
  const PLAY_TARGET_MS = 5 * 60 * 1000;
  let games = [];
  let uid = null;
  let state = null;
  let saveTimer = null;

  const dayKey = () => {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const num = value => Math.max(0, Number(value) || 0);

  function snapshot() {
    const overall = global.PlatformManager?.getOverallStats?.() || {};
    const byGame = Object.fromEntries((global.PlatformManager?.getAllGameStats?.() || []).map(item => [item.gameId, {
      activeMs: num(item.activePlayTimeMs), played: num(item.gamesPlayed), answered: num(item.questionsAnswered), correct: num(item.correct)
    }]));
    return {
      sessions: num(overall.totalSessionsPlayed), answered: num(overall.totalQuestionsAnswered), correct: num(overall.totalCorrect),
      activeMs: num(overall.activePlayTimeMs), games: byGame
    };
  }

  function pool() {
    const play = games.map(game => ({id:`play_${game.id}`,kind:'gameTime',gameId:game.id,title:`Play ${game.title}`,detail:'Play actively for 5 minutes.',target:PLAY_TARGET_MS}));
    return [...play,
      {id:'answer_20',kind:'answered',title:'Question Quest',detail:'Answer 20 questions.',target:20},
      {id:'correct_15',kind:'correct',title:'Correct Collector',detail:'Answer 15 questions correctly.',target:15},
      {id:'accuracy_80',kind:'accuracy',title:'Accuracy Ace',detail:'Reach at least 80% across 10 new answers.',target:80,minimum:10},
      {id:'play_2_games',kind:'distinctGames',title:'Arcade Explorer',detail:'Start 2 different games.',target:2},
      {id:'active_10',kind:'activeTime',title:'Focused Player',detail:'Play actively for 10 minutes across any games.',target:10*60*1000},
      {id:'three_sessions',kind:'sessions',title:'Triple Challenge',detail:'Start 3 game sessions.',target:3}
    ];
  }

  function hash(text) { let h=2166136261; for (let i=0;i<text.length;i+=1){h^=text.charCodeAt(i);h=Math.imul(h,16777619);} return h>>>0; }
  function selectedIds(date) {
    const items = pool().map(item => item.id);
    let seed = hash(`${uid}:${date}`);
    for (let i=items.length-1;i>0;i-=1) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; const j=seed%(i+1); [items[i],items[j]]=[items[j],items[i]]; }
    return items.slice(0,3);
  }

  function loadLocal() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); } catch (_) { return null; } }
  function normalize(value) { return value && typeof value==='object' ? value : null; }
  function initialise(cloud) {
    const date=dayKey(), local=normalize(loadLocal()), remote=normalize(cloud);
    const candidates=[local,remote].filter(item=>item?.uid===uid&&item?.date===date);
    state=candidates.sort((a,b)=>num(b.updatedAt)-num(a.updatedAt))[0] || {version:1,uid,date,selected:selectedIds(date),baseline:snapshot(),claimed:{},updatedAt:Date.now()};
    state.selected=Array.isArray(state.selected)&&state.selected.length===3?state.selected:selectedIds(date);
    state.claimed=state.claimed||{};
    save();
  }

  function save() {
    if(!state)return;
    state.updatedAt=Date.now();
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); } catch (_) {}
    clearTimeout(saveTimer);
    if(uid&&global.FirebaseManager?.updateUserProfile) saveTimer=setTimeout(()=>global.FirebaseManager.updateUserProfile(uid,{dailyMissions:state}),300);
  }

  function progress(mission,current=snapshot()) {
    const base=state.baseline||{}, delta=(a,b)=>Math.max(0,num(a)-num(b));
    if(mission.kind==='gameTime') return delta(current.games?.[mission.gameId]?.activeMs,base.games?.[mission.gameId]?.activeMs);
    if(mission.kind==='answered') return delta(current.answered,base.answered);
    if(mission.kind==='correct') return delta(current.correct,base.correct);
    if(mission.kind==='activeTime') return delta(current.activeMs,base.activeMs);
    if(mission.kind==='sessions') return delta(current.sessions,base.sessions);
    if(mission.kind==='distinctGames') return games.filter(game=>delta(current.games?.[game.id]?.played,base.games?.[game.id]?.played)>0).length;
    if(mission.kind==='accuracy') { const answered=delta(current.answered,base.answered),correct=delta(current.correct,base.correct); return {answered,percent:answered?correct/answered*100:0}; }
    return 0;
  }

  function complete(mission,value) { return mission.kind==='accuracy' ? value.answered>=mission.minimum&&value.percent>=mission.target : value>=mission.target; }
  function displayProgress(mission,value) {
    if(mission.kind==='accuracy') return `${Math.min(value.answered,mission.minimum)} / ${mission.minimum} answers · ${Math.round(value.percent)}%`;
    if(['gameTime','activeTime'].includes(mission.kind)) return `${Math.min(Math.floor(value/60000),Math.floor(mission.target/60000))} / ${Math.floor(mission.target/60000)} min`;
    return `${Math.min(Math.floor(value),mission.target)} / ${mission.target}`;
  }

  function evaluate() {
    if(!state)return [];
    const definitions=new Map(pool().map(item=>[item.id,item])), current=snapshot(), newly=[];
    state.selected.forEach(id=>{const mission=definitions.get(id);if(!mission||state.claimed[id])return;const value=progress(mission,current);if(!complete(mission,value))return;const source=`daily:${state.date}:${id}`;if(!global.AchievementManager?.awardXp?.(XP_REWARD,source))return;global.PlatformManager?.addCoins?.(COIN_REWARD,{countsTowardLifetime:false});state.claimed[id]={claimedAt:Date.now(),coins:COIN_REWARD,xp:XP_REWARD};newly.push(mission);});
    if(newly.length)save();
    return newly;
  }

  function getMissions() {
    if(!state)return [];
    evaluate();
    const definitions=new Map(pool().map(item=>[item.id,item])), current=snapshot();
    return state.selected.map(id=>{const mission=definitions.get(id);const value=progress(mission,current);return {...mission,progressText:displayProgress(mission,value),completed:!!state.claimed[id],reward:{coins:COIN_REWARD,xp:XP_REWARD}};}).filter(item=>item.id);
  }

  function configure(gameList){games=(gameList||[]).filter(game=>game?.id&&game?.title).map(game=>({id:game.id,title:game.title,path:game.path}));}
  function connect(userId,cloudState){uid=userId||null;if(!uid)return;initialise(cloudState);}
  function disconnect(){uid=null;state=null;clearTimeout(saveTimer);}
  global.DailyMissionManager={configure,connect,disconnect,evaluate,getMissions,getPool:pool};
})(window);
