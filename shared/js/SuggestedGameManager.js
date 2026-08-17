/** Daily least-played-game suggestion with a duplicate-safe five-minute reward. */
(function(global){
  'use strict';
  if(global.SuggestedGameManager)return;
  const STORAGE_KEY='arcadeAcademy.suggestedGame.v1';
  const TARGET_MS=5*60*1000,COINS=50,XP=200;
  let games=[],uid=null,state=null,saveTimer=null,onChange=null,lastCompleted=false;
  const num=v=>Math.max(0,Number(v)||0);
  const dayKey=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
  const load=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(_){return null}};
  const stats=id=>global.PlatformManager?.getGameStats?.(id)||{};
  function randomItem(items){if(items.length<2)return items[0];const a=new Uint32Array(1);global.crypto?.getRandomValues?.(a);return items[(a[0]||Math.floor(Math.random()*0xffffffff))%items.length]}
  function choose(){
    const ranked=games.map(game=>({game,played:num(stats(game.id).activePlayTimeMs)}));
    const least=Math.min(...ranked.map(item=>item.played));
    return randomItem(ranked.filter(item=>item.played===least)).game;
  }
  function save(){
    if(!state)return;state.updatedAt=Date.now();
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(_){}
    clearTimeout(saveTimer);
    if(uid&&global.FirebaseManager?.updateUserProfile)saveTimer=setTimeout(()=>global.FirebaseManager.updateUserProfile(uid,{suggestedGame:state}),300);
  }
  function initialise(cloud){
    const date=dayKey(),local=load(),candidates=[local,cloud].filter(v=>v&&v.uid===uid&&v.date===date);
    state=candidates.sort((a,b)=>num(b.updatedAt)-num(a.updatedAt))[0]||null;
    if(!state||!games.some(game=>game.id===state.gameId)){
      const selected=choose();if(!selected)return;
      state={version:1,uid,date,gameId:selected.id,title:selected.title,path:selected.path,baselineMs:num(stats(selected.id).activePlayTimeMs),claimed:false,updatedAt:Date.now()};
    }
    lastCompleted=!!state.claimed;save();evaluate();
  }
  function progress(){if(!state)return 0;return Math.max(0,num(stats(state.gameId).activePlayTimeMs)-num(state.baselineMs))}
  function evaluate(){
    if(!state||state.claimed||progress()<TARGET_MS)return false;
    const source=`suggested:${state.uid}:${state.date}:${state.gameId}`;
    if(!global.AchievementManager?.awardXp?.(XP,source))return false;
    global.PlatformManager?.addCoins?.(COINS,{countsTowardLifetime:false});
    state.claimed={claimedAt:Date.now(),coins:COINS,xp:XP};save();
    if(!lastCompleted){lastCompleted=true;onChange?.();}
    return true;
  }
  function getSuggestion(){
    if(!state)return null;evaluate();const value=progress();
    return {...state,completed:!!state.claimed,progressMs:Math.min(value,TARGET_MS),targetMs:TARGET_MS,
      progressText:`${Math.min(Math.floor(value/60000),5)} / 5 min`,reward:{coins:COINS,xp:XP}};
  }
  function configure(list){games=(list||[]).filter(g=>g?.id&&g?.title).map(g=>({id:g.id,title:g.title,path:g.path||`games/${g.id}/`}));if(uid)initialise(state)}
  function connect(userId,cloud){uid=userId||null;if(uid&&games.length)initialise(cloud)}
  function disconnect(){uid=null;state=null;clearTimeout(saveTimer)}
  function setOnChange(fn){onChange=typeof fn==='function'?fn:null}
  // In a game page, the Hub-created local state is enough to track and award.
  const local=load();if(local?.date===dayKey()){state=local;setInterval(evaluate,1000)}
  global.SuggestedGameManager={configure,connect,disconnect,evaluate,getSuggestion,setOnChange};
})(window);
