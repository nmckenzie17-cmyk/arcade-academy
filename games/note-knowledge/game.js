// Note Knowledge Game.js

// BG Canvas (fullscreen starfield, behind everything at all times) — runs
// first and wrapped in try/catch, deliberately isolated from all game
// logic below so a bank/session error elsewhere can never block it.
try {
  var bgCanvas=document.getElementById('bg-canvas'),bgCtx=bgCanvas.getContext('2d');
  var stars=[];
  var initBg=function(){bgCanvas.width=window.innerWidth;bgCanvas.height=window.innerHeight;stars=Array.from({length:60},()=>({x:Math.random()*bgCanvas.width,y:Math.random()*bgCanvas.height,s:Math.random()*2+1,sp:Math.random()*0.5+0.2}));};
  var drawBg=function(){bgCtx.fillStyle='#0a0a1a';bgCtx.fillRect(0,0,bgCanvas.width,bgCanvas.height);bgCtx.fillStyle='#fff';stars.forEach(s=>{s.y+=s.sp;if(s.y>bgCanvas.height){s.y=0;s.x=Math.random()*bgCanvas.width;}bgCtx.fillRect(Math.floor(s.x),Math.floor(s.y),s.s,s.s);});};
  initBg();
  window.addEventListener('resize',initBg);
  (function bgLoop(){drawBg();requestAnimationFrame(bgLoop);})();
} catch(bgErr) {
  console.error('BG canvas failed to start:', bgErr);
}

// Home-screen-only decoration: pixel-art notes drifting behind the menu
// content. Uses its own canvas (#noteHomeBg) that lives *inside*
// #menu-screen, sized to that container and painted before the header/
// main (which are already position:relative;z-index:1 in the markup) so
// it is structurally guaranteed to sit behind the menu, not just
// z-index-behind the whole page like #bg-canvas. Only animates while the
// menu is actually visible, mirroring the same technique used for the
// idle-enemy home background in Castle Defence/Rogue Ninja.
try {
  var homeBgCanvas=document.getElementById('noteHomeBg');
  var homeBgCtx=homeBgCanvas?homeBgCanvas.getContext('2d'):null;
  var HOMEBG_NOTE_COLORS=['#00d4ff','#ffdd00','#ff6ec7','#7fffb0','#ff8fa8'];
  // 8x8 pixel-art eighth-note glyph (1 = filled pixel block)
  var HOMEBG_NOTE_BITMAP=[
    [0,0,0,0,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0],
    [0,0,0,0,1,1,1,0,0],
    [0,0,0,0,1,0,1,1,0],
    [0,0,0,0,1,0,0,1,0],
    [0,1,1,1,1,0,0,0,0],
    [1,1,1,1,1,0,0,0,0],
    [0,1,1,1,0,0,0,0,0]
  ];
  var homeBgNotes=null;
  function makeHomeBgNotes(w,h){
    return Array.from({length:14},()=>{
      const angle=Math.random()*Math.PI*2;
      const speed=Math.random()*0.35+0.15;
      return{
        x:Math.random()*w,
        y:Math.random()*h,
        vx:Math.cos(angle)*speed,
        vy:Math.sin(angle)*speed,
        px:Math.random()*2.2+2,
        color:HOMEBG_NOTE_COLORS[Math.floor(Math.random()*HOMEBG_NOTE_COLORS.length)],
        alpha:Math.random()*0.3+0.3
      };
    });
  }
  var menuScreenEl=document.getElementById('menu-screen');
  function animateHomeBg(){
    const menuVisible=homeBgCtx&&menuScreenEl&&getComputedStyle(menuScreenEl).display!=='none';
    if(menuVisible){
      const w=homeBgCanvas.clientWidth,h=homeBgCanvas.clientHeight;
      // (Re)seed the notes once we know the real on-screen size, and again
      // if that size changes meaningfully (rotation, resize) — spawning
      // them against the actual canvas dimensions instead of a guessed
      // box is what keeps them spread across the whole screen.
      if(w>0&&h>0&&!(w===300&&h===150)&&(!homeBgNotes||Math.abs(homeBgCanvas._lastW-w)>40||Math.abs(homeBgCanvas._lastH-h)>40)){
        homeBgNotes=makeHomeBgNotes(w,h);
        homeBgCanvas._lastW=w;homeBgCanvas._lastH=h;
      }
      homeBgCanvas.width=w;
      homeBgCanvas.height=h;
      homeBgCtx.clearRect(0,0,homeBgCanvas.width,homeBgCanvas.height);
      (homeBgNotes||[]).forEach(n=>{
        n.x+=n.vx;n.y+=n.vy;
        const w=8*n.px,h=8*n.px;
        if(n.x<-w)n.x=homeBgCanvas.width+w;
        if(n.x>homeBgCanvas.width+w)n.x=-w;
        if(n.y<-h)n.y=homeBgCanvas.height+h;
        if(n.y>homeBgCanvas.height+h)n.y=-h;
        homeBgCtx.globalAlpha=n.alpha;
        homeBgCtx.fillStyle=n.color;
        for(let r=0;r<8;r++){
          for(let c=0;c<8;c++){
            if(HOMEBG_NOTE_BITMAP[r][c])homeBgCtx.fillRect(Math.floor(n.x+c*n.px),Math.floor(n.y+r*n.px),n.px,n.px);
          }
        }
      });
      homeBgCtx.globalAlpha=1;
    }
    requestAnimationFrame(animateHomeBg);
  }
  animateHomeBg();
} catch(homeBgErr) {
  console.error('Home background failed to start:', homeBgErr);
}

// ===== Teacher question banks =====
    // Category files use this shape:
    //   { "subject": "Year 9 Biology", "categories": [
    //       { "prompt": "Cell Structures", "correct": ["Nucleus","Mitochondria","Ribosome","Cell membrane"],
    //         "distractors": ["Bone","Muscle","Skin","Blood vessel", ... at least 12 wrong options] }
    //   ] }
    // Each chorus shows a category's "correct" words mixed with random distractors.
    // A valid code is required to play — there is no built-in question bank.
    // Change this value if Rhythm Recall ever supports another question type.
    // All loading, storing, selecting and shuffling of categories lives in QuestionManager now.
    const QUESTION_BANK_TYPE = 'category';

    // Identifies this game to the shared PlatformManager (shared/js/PlatformManager.js).
    // Platform-wide stats (coins, question totals, sessions, high score) are keyed by this id.
    const GAME_CONFIG = { id: 'rhythm-recall', name: 'Rhythm Recall' };

    async function loadQuestionBank() {
      return QuestionManager.loadCurrentBank(QUESTION_BANK_TYPE);
    }

    function updateCodeStatus() {
      const el = document.getElementById('code-status');
      if (!el) return;
      if (QuestionManager.hasQuestions()) {
        el.textContent = '📚 Loaded: ' + QuestionManager.getBankName();
        el.style.color = '#2ecc71';
      } else {
        el.textContent = 'Please enter the class code before playing.';
        el.style.color = '#9aa0a6';
      }
    }

    // Song unlock requirements: {minScore on previous, minPlays on previous}
    const SONG_DEFS = [
      { id:1, name:'Adjacent', unlock:null },
      { id:2, name:'Random', unlock:{song:1,score:500,plays:3} },
      { id:3, name:'Mirror', unlock:{song:2,score:1000,plays:3} },
      { id:4, name:'Repeat 4', unlock:{song:3,score:1500,plays:3} },
      { id:5, name:'Beat', unlock:{song:4,score:2000,plays:3} },
      { id:6, name:'Echo', unlock:{song:5,score:2500,plays:3} },
      { id:7, name:'Mutate', unlock:{song:6,score:3000,plays:3} },
      { id:8, name:'Double', unlock:{song:7,score:3500,plays:3} },
      { id:9, name:'Hold', unlock:{song:8,score:4000,plays:3} },
      { id:10, name:'Medley', unlock:{song:9,score:5000,plays:3} },
    ];

    let gameState='menu', score=0, health=100, totalCorrect=0, coins=0;
    let notes=[], noteSpeed=2.5, spawnInterval=850;
    let lastSpawn=0, animFrame=null;
    let phase='verse', notesInPhase=0;
    const VERSE_LENGTH=32, CHORUS_LENGTH=16;
    let currentCategory=null, chorusQueue=[];
    let selectedSong=1;
    let songPlays={}, bestScores={}, unlockedSongs=new Set([1]);
    // NOTE: the persistent coin balance is NOT stored in a local field — it
    // lives in PlatformManager as the single source of truth for the shared
    // coin economy. `coins` below is this run's live working balance: it's
    // synced from PlatformManager.getCoins() whenever a run/shop session
    // starts, mutated locally as coins are earned/spent during play, and
    // reconciled back into PlatformManager at each commit point (game over,
    // shop purchase, cheat code) — see commitCoinsToPlatform().
    let scoreUpgradeLevel=0, chainUpgradeLevel=0, superBonusLevel=0, chain=0;
    let highScore=0, totalCorrectAnswers=0, totalNotesPlayed=0, playerData=null, notesHitSession=0;
    let gameOverReason='';
    function upgradeCost(){return Math.floor(10*Math.pow(2,scoreUpgradeLevel));}
    function chainCost(){return Math.floor(25*Math.pow(2,chainUpgradeLevel));}
    function superCost(){return Math.floor(50*Math.pow(2,superBonusLevel));}
    function scorePerNote(){return 10+(scoreUpgradeLevel*5)+(superBonusLevel*10);}
    // Chain Multiplier: each level adds up to +1% score per consecutive hit (capped at a 20-hit streak),
    // so a maxed-out streak with Chain LV n gives up to +20n% bonus score. Resets on any miss or wrong hit.
    const CHAIN_CAP=20;
    function chainMultiplier(){ return 1 + chainUpgradeLevel*Math.min(chain,CHAIN_CAP)*0.01; }

    // Reconciles this run's locally-mutated `coins` working balance back into
    // PlatformManager's shared, persistent balance, then re-syncs `coins` to
    // match. Call at any point local coin changes should be committed
    // (game over, cheat code) — NOT on every note hit, since that would hit
    // localStorage far too often.
    function commitCoinsToPlatform(){
      const delta = coins - PlatformManager.getCoins();
      if (delta > 0) PlatformManager.addCoins(delta);
      else if (delta < 0) PlatformManager.spendCoins(-delta);
      coins = PlatformManager.getCoins();
    }
    function updateChainDisplay(){
      const stat=document.getElementById('chain-stat'),disp=document.getElementById('chain-display');
      if(!stat||!disp)return;
      if(chain>1){stat.style.display='flex';disp.textContent='x'+chain;}
      else{stat.style.display='none';}
    }
    function triggerChainShake(){
      const box=document.getElementById('score-box');if(!box)return;
      const amt=Math.min(2+chain*0.6,14);
      box.style.setProperty('--shake-amt',amt+'px');
      box.classList.remove('chain-shake');
      void box.offsetWidth;
      box.classList.add('chain-shake');
    }
    function registerChainHit(){ chain++; updateChainDisplay(); if(chain>1)triggerChainShake(); }
    function resetChain(){ chain=0; updateChainDisplay(); }
    function updateShop(){document.getElementById('upgrade-cost').textContent=upgradeCost();document.getElementById('upgrade-bonus').textContent=scoreUpgradeLevel*5;document.getElementById('buy-chain-btn').textContent=`CHAIN LV ${chainUpgradeLevel} · ${chainCost()}¢`;document.getElementById('buy-super-btn').textContent=`SUPER LV ${superBonusLevel} · ${superCost()}¢`;const sc=document.getElementById('shop-coins-display');if(sc)sc.textContent='🪙 '+PlatformManager.getCoins();}
    function openShop(){updateShop();document.getElementById('shop-modal').classList.add('open');}
    function closeShop(){document.getElementById('shop-modal').classList.remove('open');}
    function openSongs(){document.getElementById('songs-modal').classList.add('open');}
    function closeSongs(){document.getElementById('songs-modal').classList.remove('open');}
    function openScores(){showScores();document.getElementById('high-scores-modal').classList.add('open');}
    function closeScores(){document.getElementById('high-scores-modal').classList.remove('open');}
    function closeAllModals(){closeShop();closeSongs();closeScores();}
    async function buyScoreUpgrade(){const cost=upgradeCost();const msg=document.getElementById('shop-message');if(!PlatformManager.spendCoins(cost)){msg.textContent='Not enough coins.';return;}coins=PlatformManager.getCoins();scoreUpgradeLevel++;updateShop();msg.textContent='Score upgrade purchased!';await safeSave();}
    async function buyChainUpgrade(){const cost=chainCost(),msg=document.getElementById('shop-message');if(!PlatformManager.spendCoins(cost)){msg.textContent='Not enough coins.';return;}coins=PlatformManager.getCoins();chainUpgradeLevel++;updateShop();msg.textContent='Chain upgrade purchased!';await safeSave();}
    async function buySuperBonus(){const cost=superCost(),msg=document.getElementById('shop-message');if(!PlatformManager.spendCoins(cost)){msg.textContent='Not enough coins.';return;}coins=PlatformManager.getCoins();superBonusLevel++;updateShop();msg.textContent='Super bonus purchased!';await safeSave();}

    // Song-specific state
    let songState={};

    // ===== Persistence: single record per player (create once, then update in place) =====
    async function safeSave() { try { await saveData(); } catch(e) { console.error("saveData failed", e); } }

    async function saveData() {
      const obj = {
        player_name: 'Player',
        high_score: highScore,
        score_upgrade_level: scoreUpgradeLevel,
        chain_upgrade_level: chainUpgradeLevel,
        super_bonus_level: superBonusLevel,
        total_correct_answers: totalCorrectAnswers,
        total_notes_played: totalNotesPlayed,
        song_plays: JSON.stringify(songPlays),
        song_best_scores: JSON.stringify(bestScores)
      };
      if (playerData) {
        await window.dataSdk.update({...playerData, ...obj});
      } else {
        await window.dataSdk.create(obj);
      }
    }

    const dataHandler = {
      onDataChanged(data) {
        // Coins are no longer part of this per-player data record — they live
        // in PlatformManager (shared/js/PlatformManager.js) as the single
        // source of truth for the shared coin economy across every game.
        coins = PlatformManager.getCoins();
        if (data.length > 0) {
          playerData = data[0];
          highScore = Number(playerData.high_score) || 0;
          scoreUpgradeLevel = Number(playerData.score_upgrade_level) || 0;
          chainUpgradeLevel = Number(playerData.chain_upgrade_level) || 0;
          superBonusLevel = Number(playerData.super_bonus_level) || 0;
          totalCorrectAnswers = Number(playerData.total_correct_answers) || 0;
          totalNotesPlayed = Number(playerData.total_notes_played) || 0;
          try { songPlays = JSON.parse(playerData.song_plays || '{}'); } catch(e) { songPlays = {}; }
          try { bestScores = JSON.parse(playerData.song_best_scores || '{}'); } catch(e) { bestScores = {}; }
        } else {
          playerData = null;
          highScore = 0;
          scoreUpgradeLevel = 0; chainUpgradeLevel = 0; superBonusLevel = 0;
          totalCorrectAnswers = 0; totalNotesPlayed = 0; songPlays = {}; bestScores = {};
        }
        updateShop();
        recalcUnlocks();
        updateHomeHighScore();
        renderSongGrid();
        loadQuestionBank().then(updateCodeStatus);
      }
    };
    (async()=>{await window.dataSdk.init(dataHandler);})();
    loadQuestionBank().then(updateCodeStatus);

    function recalcUnlocks(){
      unlockedSongs=new Set([1]);
      SONG_DEFS.forEach(sd=>{
        if(!sd.unlock){unlockedSongs.add(sd.id);return;}
        const prevBest=bestScores[String(sd.unlock.song)]||0;
        const prevPlays=songPlays[String(sd.unlock.song)]||0;
        if(prevBest>=sd.unlock.score && prevPlays>=sd.unlock.plays) unlockedSongs.add(sd.id);
      });
    }

    function renderSongGrid(){
      const grid=document.getElementById('song-grid');
      grid.innerHTML='';
      SONG_DEFS.forEach(sd=>{
        const div=document.createElement('div');
        const unlocked=unlockedSongs.has(sd.id);
        div.className='song-card '+(unlocked?'unlocked':'locked')+(selectedSong===sd.id?' selected':'');
        div.innerHTML=unlocked?`<div class="font-bold">${sd.id}</div><div>${sd.name}</div>`:`<div>🔒</div><div>${sd.id}</div>`;
        if(unlocked) div.onclick=()=>{selectedSong=sd.id;renderSongGrid();};
        grid.appendChild(div);
      });
    }
    renderSongGrid();

    function updateHomeHighScore(){
      document.getElementById('home-high-score').textContent=highScore;
      const homeCoins=document.getElementById('home-coins');if(homeCoins)homeCoins.textContent=PlatformManager.getCoins();
      const homeNotes=document.getElementById('home-notes');if(homeNotes)homeNotes.textContent=totalNotesPlayed;
      const homeCorrect=document.getElementById('home-correct');if(homeCorrect)homeCorrect.textContent=totalCorrectAnswers;
    }

    // --- iPad/mobile Safari viewport fix ---
    // Keeps the HUD/category text from being pushed off the top of the
    // screen when Safari's address bar shows/hides or the page rubber-bands.
    function setVh(){
      const h = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
      document.documentElement.style.setProperty('--vh', (h * 0.01) + 'px');
      window.scrollTo(0,0);
    }
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', setVh);
    document.addEventListener('touchmove', function(e){
      if (e.scale !== 1) e.preventDefault();
    }, { passive:false });

    // --- SONG GENERATORS ---
    function initSongState(){
      songState={lastCol:Math.floor(Math.random()*4), seq:[], seqIdx:0, subPhase:0, noteCount:0, beatCol:Math.floor(Math.random()*4), mutations:[], baseSong:0, holdActive:false, holdCol:-1, holdRemaining:0, medleySong:0};
      // Pre-generate sequences for songs that need them
      if(selectedSong===3) generateSong3Seq();
      if(selectedSong===4) generateSong4Seq();
      if(selectedSong===5) songState.beatCol=Math.floor(Math.random()*4);
      if(selectedSong===6) generateSong6Seq();
      if(selectedSong===7) generateSong7Seq();
      if(selectedSong===8) songState.baseSong=Math.floor(Math.random()*7)+1;
      if(selectedSong===9){songState.baseSong=Math.floor(Math.random()*8)+1;songState.holdRemaining=0;}
      if(selectedSong===10) songState.medleySong=Math.floor(Math.random()*9)+1;
    }

    function generateSong3Seq(){
      const s=[];for(let i=0;i<8;i++)s.push(Math.floor(Math.random()*4));
      // Pattern: forward, reverse, forward, reverse = 32
      songState.seq=[...s,...[...s].reverse(),...s,...[...s].reverse()];
      songState.seqIdx=0;
    }
    function generateSong4Seq(){
      const phrase=[];for(let i=0;i<4;i++)phrase.push(Math.floor(Math.random()*4));
      const repeated=[...phrase,...phrase,...phrase,...phrase]; // 16
      const random=[];for(let i=0;i<16;i++)random.push(Math.floor(Math.random()*4));
      songState.seq=[...repeated,...random]; // first 16 + 16 random, but we need 32: repeated(16)+random(16) wait no
      // "4 random notes repeated 4 times (16) then 16 random then starting phrase again (16)" = 48? 
      // Re-reading: "generates 4 random notes repeated 4 times (16 notes). then 16 completely random. then starting phrase again (16)" = 48 but verse is 32
      // I'll interpret as: 4 notes x4 = 16, then 16 random = 32 total for verse
      songState.seq=[...repeated,...random];
      songState.seqIdx=0;
    }
    function generateSong6Seq(){
      const call=[];for(let i=0;i<8;i++)call.push(Math.floor(Math.random()*4));
      const response=call.map(c=>{const dir=Math.random()<0.5?-1:1;return Math.max(0,Math.min(3,c+dir));});
      // 8+8=16, repeat twice for 32
      songState.seq=[...call,...response,...call,...response];
      songState.seqIdx=0;
    }
    function generateSong7Seq(){
      const base=[];for(let i=0;i<8;i++)base.push(Math.floor(Math.random()*4));
      // 4 repeats with one mutation each = 32
      let current=[...base];
      songState.seq=[...current];
      for(let r=0;r<3;r++){
        const mutIdx=Math.floor(Math.random()*8);
        current[mutIdx]=Math.floor(Math.random()*4);
        songState.seq.push(...current);
      }
      songState.seqIdx=0;
    }

    function getNextVerseCol(songId){
      const s=songState;
      switch(songId){
        case 1:{ // Adjacent
          const off=Math.random()<0.5?-1:1;
          s.lastCol=Math.max(0,Math.min(3,s.lastCol+off));
          return s.lastCol;
        }
        case 2: return Math.floor(Math.random()*4); // Random
        case 3: case 4: case 6: case 7:{
          if(s.seqIdx>=s.seq.length){
            // Regenerate
            if(songId===3)generateSong3Seq();
            else if(songId===4)generateSong4Seq();
            else if(songId===6)generateSong6Seq();
            else generateSong7Seq();
          }
          return s.seq[s.seqIdx++];
        }
        case 5:{ // Every 4th note is beatCol
          s.noteCount++;
          if(s.noteCount%4===0) return s.beatCol;
          return Math.floor(Math.random()*4);
        }
        case 8:{ // Double - uses a random base song
          return getNextVerseCol(s.baseSong);
        }
        case 9:{ // Hold - uses base song
          return getNextVerseCol(s.baseSong);
        }
        case 10:{ // Medley
          return getNextVerseCol(s.medleySong);
        }
        default: return Math.floor(Math.random()*4);
      }
    }

    function startGame(){
      if(!QuestionManager.hasQuestions()){
        const statusEl=document.getElementById('code-status');
        statusEl.textContent='❌ Please enter the class code before playing.';
        statusEl.style.color='#e74c3c';
        return;
      }
      cancelAnimationFrame(animFrame);
      document.querySelectorAll('.lane-note').forEach(n=>n.remove());
      notes=[];gameState='playing';score=0;health=100;totalCorrect=0;coins=PlatformManager.getCoins();notesHitSession=0;gameOverReason='';chain=0;
      // One PlatformManager session per sitting — playing another song after
      // this one (via backToMenu -> startGame again) doesn't start a new one.
      PlatformManager.startSession(GAME_CONFIG.id);
      noteSpeed=2.5;spawnInterval=850;lastSpawn=0;
      phase='verse';notesInPhase=0;currentCategory=null;chorusQueue=[];
      initSongState();
      closeAllModals();
      document.getElementById('menu-screen').style.display='none';
      document.getElementById('gameover-screen').classList.add('hidden');
      const gs=document.getElementById('game-screen');gs.classList.remove('hidden');gs.style.display='flex';
      updateChainDisplay();
      updateHUD();animFrame=requestAnimationFrame(gameLoop);
    }

    function gameLoop(ts){
      if(gameState!=='playing')return;
      // Reports that the player is actively playing right now, so
      // PlatformManager can track "active play time" separately from total
      // session time. Cheap - in-memory only, safe to call every frame.
      PlatformManager.heartbeat(GAME_CONFIG.id, true);
      drawBg();
      if(ts-lastSpawn>spawnInterval){spawnNote();lastSpawn=ts;}
      updateNotes();
      updateHUD();
      animFrame=requestAnimationFrame(gameLoop);
    }

    function prepareChorus(){
      if(!QuestionManager.hasQuestions()){
        // Safety net — should never be reached since startGame() requires a loaded code.
        backToMenu();
        return;
      }
      const c=QuestionManager.getNextQuestion();
      const cat={name:c.prompt,correct:c.correct,wrong:c.distractors};
      currentCategory=cat;
      let items=cat.correct.map(t=>({text:t,isCorrect:true})).concat(cat.wrong.slice(0,12).map(t=>({text:t,isCorrect:false})));
      for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
      chorusQueue=items.slice(0,16);
    }

    function spawnNote(){
      if(phase==='verse'&&notesInPhase>=VERSE_LENGTH){phase='chorus';notesInPhase=0;prepareChorus();}
      else if(phase==='chorus'&&notesInPhase>=CHORUS_LENGTH){
        phase='verse';notesInPhase=0;currentCategory=null;
        // Regenerate song state for new verse
        if(selectedSong===3)generateSong3Seq();
        else if(selectedSong===4)generateSong4Seq();
        else if(selectedSong===5)songState.beatCol=Math.floor(Math.random()*4);
        else if(selectedSong===6)generateSong6Seq();
        else if(selectedSong===7)generateSong7Seq();
        else if(selectedSong===10)songState.medleySong=Math.floor(Math.random()*9)+1;
        songState.seqIdx=0;songState.noteCount=0;
      }

      // Handle hold note logic (song 9)
      if((selectedSong===9||(selectedSong===10&&songState.medleySong===9))&&songState.holdRemaining>0){
        songState.holdRemaining--;
        notesInPhase++;
        return; // No note spawns during hold
      }

      let col=phase==='chorus'?Math.floor(Math.random()*4):getNextVerseCol(selectedSong);
      const isDouble=(selectedSong===8||(selectedSong===10&&songState.medleySong===8))&&phase==='verse'&&Math.random()<0.3;
      const isHold=(selectedSong===9||(selectedSong===10&&songState.medleySong===9))&&phase==='verse'&&notesInPhase>0&&notesInPhase%8===7;

      spawnSingleNote(col, isHold);
      if(isDouble){
        let col2=Math.floor(Math.random()*4);
        while(col2===col)col2=Math.floor(Math.random()*4);
        spawnSingleNote(col2, false);
      }
      if(isHold){songState.holdRemaining=Math.floor(Math.random()*5)+4;songState.holdCol=col;}
      notesInPhase++;
    }

    // ===== Auto-fit note text so long chorus words still fit inside the block =====
    function fitNoteFont(el){
      const len=(el.textContent||'').length;
      let size;
      if(len<=4) size=21;
      else if(len<=7) size=18;
      else if(len<=10) size=15;
      else if(len<=14) size=12;
      else if(len<=18) size=10;
      else size=8.5;
      el.style.fontSize=size+'px';
    }

    // ===== Perfect Zone: a band above the hit line worth bonus score =====
    const NOTE_HEIGHT=98, HIT_ZONE_HEIGHT=64, PERFECT_ZONE_HEIGHT=NOTE_HEIGHT*1.1;
    function isInPerfectZone(n){
      const h=document.getElementById('lanes-container').offsetHeight;
      const zoneBottom=h-HIT_ZONE_HEIGHT;
      const zoneTop=zoneBottom-PERFECT_ZONE_HEIGHT;
      const noteCenter=n.y+NOTE_HEIGHT/2;
      return noteCenter>=zoneTop&&noteCenter<=zoneBottom;
    }
    const PERFECT_WORDS=['PERFECT!','AWESOME!','GOOD JOB!','NICE!','GREAT!','SWEET!'];
    const MISS_WORDS=['MISSED!','OOPS!','TOO SLOW!','MISS!'];
    function spawnFloatingWord(el, words){
      const container=document.getElementById('lanes-container');
      const containerRect=container.getBoundingClientRect();
      const rect=el.getBoundingClientRect();
      const color=getComputedStyle(el).backgroundColor;
      const cx=rect.left-containerRect.left+rect.width/2;
      const word=words[Math.floor(Math.random()*words.length)];
      const w=document.createElement('div');
      w.textContent=word;
      w.style.cssText=`position:absolute;left:${cx}px;top:${rect.top-containerRect.top}px;transform:translate(-50%,-50%);color:${color};font-weight:800;font-size:13px;font-family:'Lexend',sans-serif;text-shadow:0 0 6px ${color},0 2px 4px rgba(0,0,0,0.8);pointer-events:none;z-index:50;animation:floatUpWord 1s ease-out forwards;`;
      container.appendChild(w);
      setTimeout(()=>w.remove(),1000);
    }
    function spawnPerfectEffect(el, showWord){
      const container=document.getElementById('lanes-container');
      const containerRect=container.getBoundingClientRect();
      const rect=el.getBoundingClientRect();
      const color=getComputedStyle(el).backgroundColor;
      const cx=rect.left-containerRect.left+rect.width/2;
      const cy=rect.top-containerRect.top+rect.height/2;
      // Pixel burst
      for(let i=0;i<10;i++){
        const p=document.createElement('div');
        const angle=Math.random()*Math.PI*2, dist=20+Math.random()*30;
        p.style.cssText=`position:absolute;left:${cx}px;top:${cy}px;width:5px;height:5px;background:${color};box-shadow:0 0 4px ${color};pointer-events:none;z-index:49;--dx:${Math.cos(angle)*dist}px;--dy:${Math.sin(angle)*dist}px;animation:pixelBurst 0.45s ease-out forwards;`;
        container.appendChild(p);
        setTimeout(()=>p.remove(),450);
      }
      // Floating word — for verse notes and correct chorus hits
      if(showWord) spawnFloatingWord(el, PERFECT_WORDS);
    }

    function spawnSingleNote(col, isHold){
      const lane=document.querySelectorAll('.lane')[col];
      const el=document.createElement('div');
      el.className='lane-note rounded-sm'+(isHold?' hold-note':'');
      const colors=['#ff4757','#2ed573','#1e90ff','#ffa502'];
      let noteData={el,y:-55,col,isChorus:false,isCorrect:false,isHold,holdTime:isHold?Date.now():0,held:false,holdDuration:isHold?Math.floor(Math.random()*5)+4:0,holdTicks:0,holdTimer:null};

      if(phase==='chorus'&&chorusQueue.length>0){
        const item=chorusQueue.shift();
        el.style.background=colors[col];el.textContent=item.text;
        noteData.isChorus=true;noteData.isCorrect=item.isCorrect;
        fitNoteFont(el);
      } else {
        el.style.background=colors[col];
        if(isHold){el.textContent='HOLD';fitNoteFont(el);}
      }
      el.style.top='-95px';el.style.height='98px';el.dataset.col=col;

      if(isHold){
        const bar=document.createElement('div');bar.className='hold-bar';
        const fill=document.createElement('div');fill.className='hold-bar-fill';bar.appendChild(fill);el.appendChild(bar);
        noteData.barFill=fill;
        const onDown=e=>{e.preventDefault();if(noteData.held)return;el.classList.add('hold-active');noteData.held=true;noteData.holdTime=Date.now();noteData.holdTimer=setInterval(()=>{if(!noteData.held)return;noteData.holdTicks++;score+=5;fill.style.height=Math.min(100,(noteData.holdTicks*500/(noteData.holdDuration*1000))*100)+'%';},500);};
        const onUp=e=>{e.preventDefault();if(!noteData.held)return;noteData.held=false;clearInterval(noteData.holdTimer);if(noteData.holdTicks*500<noteData.holdDuration*1000){health-=10;resetChain();if(health<=0){gameOverReason='Ran out of health — you let go of a HOLD note too early. Keep pressing until the bar fills all the way!';gameOver();}else updateHUD();}else completeHoldNote(el);};
        el.addEventListener('mousedown',onDown);el.addEventListener('touchstart',onDown,{passive:false});
        el.addEventListener('mouseup',onUp);el.addEventListener('mouseleave',onUp);el.addEventListener('touchend',onUp,{passive:false});
      } else {
        el.addEventListener('click',()=>hitNote(el));
        el.addEventListener('touchstart',e=>{e.preventDefault();hitNote(el);});
      }
      lane.appendChild(el);notes.push(noteData);
    }

    function updateNotes(){
      const h=document.getElementById('lanes-container').offsetHeight;
      const redLineY=h-HIT_ZONE_HEIGHT;
      for(let i=notes.length-1;i>=0;i--){
        const n=notes[i];n.y+=noteSpeed;n.el.style.top=n.y+'px';
        if(n.y+NOTE_HEIGHT>=redLineY)missNote(i);
      }
    }

    function hitNote(el){
      const idx=notes.findIndex(n=>n.el===el);if(idx===-1)return;
      const n=notes[idx];
      const perfect=isInPerfectZone(n);
      if(perfect)spawnPerfectEffect(el,!n.isChorus||n.isCorrect);
      el.remove();notes.splice(idx,1);
      notesHitSession++;
      if(n.isChorus){
        // Each chorus note tap is a "does this word belong in the category?"
        // answer — report it to PlatformManager regardless of outcome.
        PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, n.isCorrect);
        if(n.isCorrect){let pts=25+(scoreUpgradeLevel*5);if(perfect)pts=Math.round(pts*1.5);pts=Math.round(pts*chainMultiplier());score+=pts;coins+=10;totalCorrect++;registerChainHit();noteSpeed=Math.min(8,noteSpeed+0.15);spawnInterval=Math.max(350,spawnInterval-15);playTone(400,0.08);}
        else{score=Math.max(0,score-50);health-=10;coins=Math.max(0,coins-2);resetChain();noteSpeed=Math.max(1.5,noteSpeed-0.1);spawnInterval=Math.min(1100,spawnInterval+10);playTone(150,0.12);if(health<=0){gameOverReason='Ran out of health — you tapped a word that didn\'t belong in "'+currentCategory.name+'". Check the category before you sort each word!';gameOver();}}
      } else {
        let pts=scorePerNote();if(perfect)pts=Math.round(pts*1.5);pts=Math.round(pts*chainMultiplier());score+=pts;coins+=1;registerChainHit();noteSpeed=Math.min(8,noteSpeed+0.08);spawnInterval=Math.max(350,spawnInterval-8);playTone(200+n.col*100,0.08);
      }
    }

    function completeHoldNote(el){
      const idx=notes.findIndex(n=>n.el===el);if(idx===-1)return;
      const n=notes[idx];
      const perfect=isInPerfectZone(n);
      if(perfect){spawnPerfectEffect(el,true);score+=Math.round(n.holdTicks*5*0.5);}
      clearInterval(n.holdTimer);el.remove();notes.splice(idx,1);notesHitSession++;registerChainHit();playTone(300,0.15);updateHUD();
    }

    function hitHoldNote(el,duration){ completeHoldNote(el); }

    function missNote(idx){
      const n=notes[idx];
      if(!n.isChorus||n.isCorrect) spawnFloatingWord(n.el, MISS_WORDS);
      n.el.remove();notes.splice(idx,1);
      playTone(150,0.12);
      noteSpeed=Math.max(1.5,noteSpeed-0.12);spawnInterval=Math.min(1100,spawnInterval+12);
      if(n.isChorus){if(n.isCorrect){resetChain();health-=20;if(health<=0){gameOverReason='Ran out of health — a correct "'+currentCategory.name+'" word slipped past you. Tap the right answers before they reach the bottom!';gameOver();}}else{score+=10;}}
      else{resetChain();health-=10;if(health<=0){gameOverReason='Ran out of health — you let a note fall without hitting it. Keep tapping the beat as it drops!';gameOver();}}
    }

    function updateHUD(){
      document.getElementById('score-display').textContent=score;
      document.getElementById('coin-display').textContent=coins;
      document.getElementById('health-bar').style.width=Math.max(0,health)+'%';
      const pd=document.getElementById('phase-display');
      if(phase==='verse'){
        const remaining=VERSE_LENGTH-notesInPhase;
        pd.textContent='♪ '+remaining;pd.style.color='#8888aa';
      } else {
        pd.textContent='🎯 '+currentCategory.name.toUpperCase();pd.style.color='#00ffcc';
      }
    }

    function gameOver(){
      gameState='over';cancelAnimationFrame(animFrame);
      PlatformManager.heartbeat(GAME_CONFIG.id, false);

      // Update persisted per-song stats
      const key=String(selectedSong);
      const wasUnlocked=new Set(unlockedSongs);
      songPlays[key]=(songPlays[key]||0)+1;
      const newHigh=score>highScore;
      if(score>(bestScores[key]||0)) bestScores[key]=score;
      if(newHigh) highScore=score;
      PlatformManager.setHighScore(GAME_CONFIG.id, score);
      totalCorrectAnswers+=totalCorrect;
      totalNotesPlayed+=notesHitSession;
      commitCoinsToPlatform();
      recalcUnlocks();

      document.getElementById('final-score').textContent='Score: '+score+' (Notes: '+notesHitSession+')';
      document.getElementById('final-correct-line').textContent='✅ '+totalCorrect+' correct answers';
      document.getElementById('gameover-reason').textContent=gameOverReason||'';
      document.getElementById('new-highscore').classList.toggle('hidden',!newHigh);

      // Check unlocks
      const nextSong=SONG_DEFS.find(s=>s.unlock&&s.unlock.song===selectedSong&&!wasUnlocked.has(s.id));
      const um=document.getElementById('unlock-msg');
      if(nextSong){
        const needed=nextSong.unlock;
        if(unlockedSongs.has(nextSong.id)){um.textContent='🎉 Song '+nextSong.id+' Unlocked!';um.classList.remove('hidden');}
        else{um.textContent='Next unlock: '+needed.score+' pts & '+needed.plays+' plays';um.classList.remove('hidden');}
      } else {um.classList.add('hidden');}

      const wipe=document.getElementById('screenWipe');
      wipe.classList.add('wipe');
      setTimeout(()=>{
        document.getElementById('game-screen').style.display='none';
        document.getElementById('gameover-screen').classList.remove('hidden');
        wipe.classList.remove('wipe');
      },750);

      saveScore();
    }

    async function saveScore(){
      await safeSave();
    }

    function backToMenu(){
      cancelAnimationFrame(animFrame);gameState='menu';
      PlatformManager.heartbeat(GAME_CONFIG.id, false);
      document.getElementById('gameover-screen').classList.add('hidden');
      document.getElementById('game-screen').style.display='none';
      document.querySelectorAll('.lane-note').forEach(n=>n.remove());notes=[];
      closeAllModals();
      document.getElementById('menu-screen').style.display='flex';
      updateHomeHighScore();
      renderSongGrid();
    }

    function showScores(){
      const list=document.getElementById('scores-list');
      const rows=SONG_DEFS.map(sd=>{
        const best=bestScores[String(sd.id)]||0;
        const label=unlockedSongs.has(sd.id)?sd.name:'🔒 Locked';
        return `<div>${sd.id}. ${label} — ${best}</div>`;
      });
      list.innerHTML=rows.length?rows.join(''):'<div>No scores yet</div>';
    }

    let audioCtx;
    function playTone(freq,dur){
      if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
      const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
      osc.type='square';osc.frequency.value=freq;
      gain.gain.setValueAtTime(0.15,audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+dur);
      osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+dur);
    }


