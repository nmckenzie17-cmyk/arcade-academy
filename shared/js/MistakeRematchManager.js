/** Account-wide, spaced-review deck built automatically from incorrect answers. */
(function(global){
  'use strict';
  const PREFIX='arcadeAcademy.mistakeRematch.v1.';
  const DAY=24*60*60*1000;
  const CORRECT_INTERVALS=[DAY,3*DAY,7*DAY];
  let uid=null,state=null,cloudTimer=null,onChange=null;
  const now=()=>Date.now();
  const clone=value=>JSON.parse(JSON.stringify(value));
  function hash(text){let h=2166136261;for(let i=0;i<text.length;i+=1){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);}
  function key(){return PREFIX+(uid||global.PlatformManager?.getConnectedUid?.()||'pending');}
  function fresh(){return{version:1,uid:uid||null,cards:{},updatedAt:now()};}
  function local(){try{return JSON.parse(localStorage.getItem(key())||'null');}catch(_){return null;}}
  function save(){if(!state)return;state.uid=uid;state.updatedAt=now();try{localStorage.setItem(key(),JSON.stringify(state));}catch(_){}clearTimeout(cloudTimer);if(uid&&global.FirebaseManager?.updateUserProfile)cloudTimer=setTimeout(()=>global.FirebaseManager.updateUserProfile(uid,{mistakeRematch:state}),350);onChange?.();}
  function connect(userId,cloud){uid=userId||global.PlatformManager?.getConnectedUid?.()||null;const here=local(),remote=cloud&&typeof cloud==='object'?cloud:null;state=[here,remote].filter(Boolean).sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0))[0]||fresh();state.cards=state.cards&&typeof state.cards==='object'?state.cards:{};save();}
  function ensure(){if(!state)connect(global.PlatformManager?.getConnectedUid?.(),null);return state;}
  function takeOthers(list,field,value,count){return(list||[]).map(item=>item?.[field]).filter(item=>typeof item==='string'&&item!==value).filter((item,index,all)=>all.indexOf(item)===index).slice(0,count);}
  function normalise(q,context={}){
    const type=context.questionType||'multichoice';let prompt='',answer='',options=[];
    if(type==='matching'&&q.term&&q.definition){prompt=`What matches “${q.term}”?`;answer=q.definition;options=[answer,...takeOthers(context.candidates,'definition',answer,3)];}
    else if(type==='category'&&q.prompt&&q.correct?.length){answer=q.correct[0];prompt=`Which belongs in “${q.prompt}”?`;options=[answer,...(q.distractors||[]).slice(0,3)];}
    else if(type==='type-answer'&&q.q&&q.answer){prompt=q.q;answer=q.answer;options=[answer,...takeOthers(context.candidates,'answer',answer,3)];}
    else if(type.startsWith('falling-words-')&&q.term){prompt=type==='falling-words-definition'?q.definition:`Spell “${q.term}”`;answer=q.term;options=[answer,...takeOthers(context.candidates,'term',answer,3)];}
    else if(type==='falling-words-category'&&q.prompt&&q.correct?.length){answer=q.correct[0];prompt=`Which belongs in “${q.prompt}”?`;options=[answer,...(q.distractors||[]).slice(0,3)];}
    else if(q.q&&Array.isArray(q.a)){prompt=q.q;answer=q.a[q.c];options=[...q.a];}
    if(!prompt||!answer||options.length<2)return null;
    for(let i=options.length-1;i>0;i-=1){const j=Math.floor(Math.random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}
    const bankCode=String(context.bankCode||'unknown');return{id:hash(`${bankCode}|${type}|${prompt}|${answer}`),bankCode,bankName:context.bankName||bankCode,questionType:type,prompt,answer,options};
  }
  function recordWrong(q,context){const card=normalise(q,context);if(!card)return false;ensure();const previous=state.cards[card.id]||{};state.cards[card.id]={...card,wrongCount:(previous.wrongCount||0)+1,correctRematches:previous.correctRematches||0,nextReviewAt:Math.min(Number(previous.nextReviewAt)||Infinity,now()),lastWrongAt:now(),mastered:false};save();return true;}
  function dueCards(limit=10){ensure();return Object.values(state.cards).filter(card=>!card.mastered&&Number(card.nextReviewAt)<=now()).sort((a,b)=>Number(a.nextReviewAt)-Number(b.nextReviewAt)).slice(0,limit).map(clone);}
  function summary(){ensure();const cards=Object.values(state.cards),due=cards.filter(card=>!card.mastered&&Number(card.nextReviewAt)<=now()).length;return{due,learning:cards.filter(card=>!card.mastered).length,mastered:cards.filter(card=>card.mastered).length,total:cards.length};}
  function answer(id,correct){ensure();const card=state.cards[id];if(!card)return null;if(correct){card.correctRematches=(card.correctRematches||0)+1;if(card.correctRematches>=4){card.mastered=true;card.masteredAt=now();card.nextReviewAt=null;}else card.nextReviewAt=now()+CORRECT_INTERVALS[Math.min(card.correctRematches-1,CORRECT_INTERVALS.length-1)];}else{card.wrongCount=(card.wrongCount||0)+1;card.correctRematches=0;card.lastWrongAt=now();card.nextReviewAt=now()+10*60*1000;}save();return clone(card);}
  function setOnChange(callback){onChange=callback;}
  global.MistakeRematchManager={connect,recordWrong,dueCards,summary,answer,setOnChange,getState:()=>clone(ensure())};
})(window);
