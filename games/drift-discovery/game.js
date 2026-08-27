(function(){
"use strict";

/* =========================================================================
   UTILITIES
========================================================================= */
const Util = {
  clamp:(v,min,max)=>Math.max(min,Math.min(max,v)),
  lerp:(a,b,t)=>a+(b-a)*t,
  dist:(x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1),
  normalizeAngle(a){
    while(a>Math.PI) a-=Math.PI*2;
    while(a<-Math.PI) a+=Math.PI*2;
    return a;
  },
  angleLerp(a,b,t){
    const diff = Util.normalizeAngle(b-a);
    return a+diff*t;
  },
  choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; },
  sample(arr,n){
    const copy=arr.slice(); const out=[];
    while(out.length<n && copy.length){
      out.push(copy.splice(Math.floor(Math.random()*copy.length),1)[0]);
    }
    return out;
  },
  fmt(n){ return Math.round(n).toLocaleString(); }
};

/* =========================================================================
   CONFIG — every car & component is data. The renderer/physics never
   hardcode a specific part; they just read stats{} and visual{}.
========================================================================= */
const STAT_KEYS = ["speed","acceleration","handling","grip","drift","weight","braking","nitro"];

// Base health increased 300% (100 -> 400). Kept as one shared constant so
// every dependent calculation (speed penalty, HUD %, pit repair, results
// display) scales with it rather than assuming a 0-100 range.
const HEALTH_MAX = 400;

// Flat top-speed bonus nitro grants (used by the player's own nitro cap and
// by the AI's "beside the player" speed ceiling below).
const NITRO_SPEED_BONUS = 90;

const AI_STYLE_LABELS = {
  line: "LINE",
  corner_hugger: "CORNER HUGGER",
  slipstream: "SLIPSTREAM",
  aggressive: "AGGRESSIVE",
  berserker: "BERSERKER",
  rubberband: "RUBBERBAND",
  blocker: "BLOCKER",
  nitro_burst: "NITRO BURST",
  tank: "TANK",
  wall_rider: "WALL RIDER",
};

// Who each style's rubberbanding paces against: "player"-styles are the
// antagonist archetypes built around hunting the player specifically;
// "leader"-styles are racing for position and pace off whoever's actually
// in 1st place (which may or may not be the player).
const RUBBERBAND_TARGET = {
  line: "leader",
  corner_hugger: "leader",
  slipstream: "leader",
  aggressive: "player",
  berserker: "player",
  rubberband: "player",
  blocker: "player",
  nitro_burst: "leader",
  tank: "leader",
  wall_rider: "leader",
};

const CONFIG = {
  // Each car's silhouette is defined purely as a list of {t, w} points:
  // t = position along the car's length (-0.5 nose ... 0.5 tail), w = half-width fraction (0-1).
  // The renderer mirrors this profile into a closed polygon — no shape is hardcoded per car id.
  CARS: [
    {id:"compact", name:"Compact", cost:0,
      base:{speed:48,acceleration:68,handling:74,grip:60,drift:52,weight:38,braking:64,nitro:58},
      body:{width:32,length:56}, color:"#4fe3ff",
      shape:{ angular:false,
        profile:[{t:-0.50,w:0.24},{t:-0.40,w:0.64},{t:-0.20,w:0.95},{t:0.05,w:1.0},{t:0.30,w:0.96},{t:0.50,w:0.55}],
        cabin:{t0:-0.18,t1:0.30,roofFrac:0.66}, wheelFrontT:-0.30, wheelRearT:0.30 }},
    {id:"sports", name:"Sports Car", cost:900,
      base:{speed:68,acceleration:62,handling:64,grip:64,drift:58,weight:48,braking:60,nitro:64},
      body:{width:34,length:62}, color:"#ff4fd8",
      shape:{ angular:false,
        profile:[{t:-0.50,w:0.08},{t:-0.32,w:0.42},{t:-0.08,w:0.86},{t:0.15,w:1.0},{t:0.35,w:0.80},{t:0.50,w:0.38}],
        cabin:{t0:-0.05,t1:0.30,roofFrac:0.50}, wheelFrontT:-0.34, wheelRearT:0.34 }},
    {id:"muscle", name:"Muscle Car", cost:1300,
      base:{speed:74,acceleration:52,handling:44,grip:54,drift:48,weight:78,braking:48,nitro:52},
      body:{width:38,length:64}, color:"#ffb84f",
      shape:{ angular:true,
        profile:[{t:-0.50,w:0.36},{t:-0.34,w:0.86},{t:-0.05,w:1.0},{t:0.28,w:1.0},{t:0.50,w:0.66}],
        cabin:{t0:0.02,t1:0.34,roofFrac:0.56}, wheelFrontT:-0.36, wheelRearT:0.34 }},
    {id:"drift", name:"Drift Car", cost:1100,
      base:{speed:58,acceleration:58,handling:70,grip:42,drift:84,weight:44,braking:54,nitro:68},
      body:{width:34,length:58}, color:"#c04fff",
      shape:{ angular:false,
        profile:[{t:-0.50,w:0.20},{t:-0.32,w:0.68},{t:-0.06,w:0.98},{t:0.18,w:1.0},{t:0.32,w:0.94},{t:0.50,w:0.50}],
        cabin:{t0:-0.10,t1:0.26,roofFrac:0.54}, wheelFrontT:-0.32, wheelRearT:0.34 }},
    {id:"rally", name:"Rally Car", cost:1200,
      base:{speed:56,acceleration:66,handling:70,grip:68,drift:62,weight:52,braking:62,nitro:58},
      body:{width:34,length:58}, color:"#4fff9e",
      shape:{ angular:true,
        profile:[{t:-0.50,w:0.34},{t:-0.36,w:0.82},{t:-0.10,w:1.0},{t:0.30,w:1.0},{t:0.50,w:0.62}],
        cabin:{t0:-0.08,t1:0.34,roofFrac:0.68}, wheelFrontT:-0.34, wheelRearT:0.34 }},
    {id:"supercar", name:"Supercar", cost:2200,
      base:{speed:88,acceleration:78,handling:58,grip:58,drift:48,weight:58,braking:68,nitro:78},
      body:{width:36,length:66}, color:"#fff64f",
      shape:{ angular:true,
        profile:[{t:-0.50,w:0.02},{t:-0.28,w:0.28},{t:-0.02,w:0.86},{t:0.22,w:1.0},{t:0.50,w:0.46}],
        cabin:{t0:0.00,t1:0.24,roofFrac:0.42}, wheelFrontT:-0.36, wheelRearT:0.36 }},
  ],

  PARTS: {
    engine: [
      {id:"stock", name:"Stock Engine", cost:0,
        stats:{}, visual:{hoodStyle:"stock"}},
      {id:"lightweight", name:"Lightweight Engine", cost:450,
        stats:{acceleration:10,weight:-10,speed:-4}, visual:{hoodStyle:"vent"}},
      {id:"v8", name:"V8 Engine", cost:750,
        stats:{speed:15,acceleration:10,weight:12,handling:-5}, visual:{hoodStyle:"bulge",exhaustSizeMult:1.25}},
      {id:"turbo", name:"Turbo Engine", cost:700,
        stats:{acceleration:15,nitro:15,grip:-5}, visual:{hoodStyle:"scoop",exhaustSizeMult:1.15}},
      {id:"supercharged", name:"Supercharged Engine", cost:950,
        stats:{speed:12,acceleration:8,weight:8}, visual:{hoodStyle:"supercharger"}},
    ],
    tyres: [
      {id:"street", name:"Street Tyres", cost:0,
        stats:{}, visual:{wheelWidthMult:1, wheelColor:"#222"}},
      {id:"grip", name:"Grip Tyres", cost:380,
        stats:{grip:15,handling:8,drift:-15}, visual:{wheelWidthMult:1.12, wheelColor:"#181818"}},
      {id:"drift", name:"Drift Tyres", cost:420,
        stats:{drift:20,grip:-10}, visual:{wheelWidthMult:1.2, rearWheelOffset:3, wheelColor:"#3a0a0a"}},
      {id:"slicks", name:"Racing Slicks", cost:650,
        stats:{grip:20,handling:15}, visual:{wheelWidthMult:1.28, wheelColor:"#0a0a0a", slick:true}},
      {id:"rally", name:"Rally Tyres", cost:480,
        stats:{grip:10,handling:-4}, visual:{wheelWidthMult:1.15, wheelColor:"#4a3a20", chunky:true}},
    ],
    suspension: [
      {id:"standard", name:"Standard Suspension", cost:0, stats:{}, visual:{rideHeight:0}},
      {id:"sport", name:"Sport Suspension", cost:320, stats:{handling:10}, visual:{rideHeight:-2}},
      {id:"drift_susp", name:"Drift Suspension", cost:420, stats:{drift:15,grip:-8}, visual:{rideHeight:-3,wheelAngle:4}},
      {id:"rally_susp", name:"Rally Suspension", cost:360, stats:{grip:6,handling:4}, visual:{rideHeight:5}},
      {id:"slammed", name:"Slammed Suspension", cost:560, stats:{handling:18,grip:6}, visual:{rideHeight:-6}},
    ],
    transmission: [
      {id:"standard", name:"Standard Gearing", cost:0, stats:{}, visual:{}},
      {id:"short", name:"Short Gearing", cost:300, stats:{acceleration:12,speed:-8}, visual:{exhaustTip:"sport"}},
      {id:"long", name:"Long Gearing", cost:300, stats:{speed:12,acceleration:-8}, visual:{diffuser:true}},
    ],
    brakes: [
      {id:"standard", name:"Standard Brakes", cost:0, stats:{}, visual:{caliperColor:null,discSizeMult:1}},
      {id:"performance", name:"Performance Brakes", cost:360, stats:{braking:15}, visual:{caliperColor:"#ff3b3b",discSizeMult:1.15}},
      {id:"race", name:"Race Brakes", cost:600, stats:{braking:25,handling:4}, visual:{caliperColor:"#ffd23b",discSizeMult:1.3}},
    ],
    chassis: [
      {id:"standard", name:"Standard Chassis", cost:0, stats:{}, visual:{bodyWidthMult:1,bumperSizeMult:1}},
      {id:"lightweight_chassis", name:"Lightweight Chassis", cost:700,
        stats:{weight:-15,acceleration:10,handling:8}, visual:{bodyWidthMult:0.92,bumperSizeMult:0.82}},
      {id:"reinforced", name:"Reinforced Chassis", cost:700,
        stats:{weight:20,braking:-4,acceleration:-8}, visual:{bodyWidthMult:1.06,bumperSizeMult:1.32,reinforcementBars:true}},
      {id:"widebody", name:"Widebody Chassis", cost:950,
        stats:{grip:12,handling:10,weight:10}, visual:{bodyWidthMult:1.26,wheelArchSize:1.3,sideSkirt:true}},
    ],
    aero: [
      {id:"none", name:"No Spoiler", cost:0, stats:{}, visual:{spoiler:"none"}},
      {id:"small_spoiler", name:"Small Spoiler", cost:200, stats:{handling:3}, visual:{spoiler:"small"}},
      {id:"ducktail", name:"Ducktail", cost:350, stats:{handling:5,speed:-2}, visual:{spoiler:"ducktail"}},
      {id:"racing_wing", name:"Racing Wing", cost:620, stats:{handling:12,grip:8,speed:-5}, visual:{spoiler:"wing"}},
      {id:"extreme_wing", name:"Extreme Wing", cost:950, stats:{handling:20,grip:15,speed:-12,weight:5}, visual:{spoiler:"extreme"}},
    ],
    nitro: [
      {id:"standard", name:"Standard Nitro", cost:0, stats:{}, visual:{flame:"normal"}},
      {id:"power", name:"Power Nitro", cost:420, stats:{nitro:20}, visual:{flame:"large-short"}},
      {id:"endurance", name:"Endurance Nitro", cost:420, stats:{nitro:10}, visual:{flame:"long-thin"}},
      {id:"drift_nitro", name:"Drift Nitro", cost:520, stats:{nitro:8,drift:6}, visual:{flame:"blue"}, driftRegen:true},
    ],
    exhaust: [
      {id:"standard", name:"Standard Exhaust", cost:0, stats:{}, visual:{exhaustStyle:"single",exhaustSizeMult:1}},
      {id:"single_sport", name:"Single Sport Exhaust", cost:200, stats:{acceleration:3}, visual:{exhaustStyle:"single",exhaustSizeMult:1.1}},
      {id:"dual", name:"Dual Exhaust", cost:360, stats:{speed:5,weight:3}, visual:{exhaustStyle:"dual",exhaustSizeMult:1.2}},
      {id:"quad", name:"Quad Exhaust", cost:520, stats:{speed:8,weight:6}, visual:{exhaustStyle:"quad",exhaustSizeMult:1.3}},
      {id:"racing_exhaust", name:"Racing Exhaust", cost:720, stats:{speed:10,nitro:5,weight:-5}, visual:{exhaustStyle:"racing",exhaustSizeMult:1.4}},
    ],
  },

  COSMETICS: {
    primary: ["#4fe3ff","#ff4fd8","#fff64f","#4fff9e","#ff8a4f","#c04fff","#ff4f4f","#ffffff"],
    secondary: ["#1a1a2e","#0d0f1f","#ffffff","#111111","#2a2a2a","#402a1a"],
    wheelColor: ["#141414","#3a0a0a","#0a0a3a","#4a3a20","#ffffff"],
    stripes: ["none","center","side","racing"],
  },

  UPGRADES: [
    {id:"drift_king", name:"Drift King", desc:"Massively boosts drift for the rest of the run.", delta:{drift:20,grip:-5}, visualFlag:"smoke"},
    {id:"slipstream", name:"Slipstream", desc:"Raises your top speed for the rest of the run.", delta:{speed:10}},
    {id:"perfect_line", name:"Perfect Line", desc:"Sharper, more precise steering.", delta:{handling:15}},
    {id:"heavyweight", name:"Heavyweight", desc:"Tougher and more stable, but heavier.", delta:{weight:20,braking:10}, visualFlag:"wide"},
    {id:"lightweight_run", name:"Lightweight", desc:"Sheds weight for snappier acceleration.", delta:{weight:-20,acceleration:15}, visualFlag:"low"},
    {id:"adrenaline", name:"Adrenaline", desc:"Raw power: more speed and acceleration.", delta:{acceleration:10,speed:10}},
    {id:"comeback", name:"Comeback", desc:"Nitro system supercharged.", delta:{nitro:20}, visualFlag:"flame"},
    {id:"clean_racer", name:"Clean Racer", desc:"Better handling and grip through corners.", delta:{handling:10,grip:10}},
    {id:"daredevil", name:"Daredevil", desc:"Huge speed at the cost of grip.", delta:{speed:15,grip:-10}},
    {id:"drift_combo", name:"Drift Combo", desc:"Drift smoke effect and bonus drift rating.", delta:{drift:15}, visualFlag:"smoke"},
    {id:"last_lap", name:"Last Lap Surge", desc:"A late-run power spike.", delta:{speed:14,acceleration:14}, visualFlag:"armour"},
  ],

};

/* =========================================================================
   SAVE MANAGER — persistence layer, deliberately isolated so it can be
   swapped for another backend (e.g. Firebase) without touching game logic.
========================================================================= */
const SaveManager = (function(){
  const KEY = "driftRushSave_v1";

  function defaultState(){
    const unlockedParts = {};
    const equipped = {};
    Object.keys(CONFIG.PARTS).forEach(cat=>{
      unlockedParts[cat] = [CONFIG.PARTS[cat][0].id];
      equipped[cat] = CONFIG.PARTS[cat][0].id;
    });
    return {
      currency: 600,
      currentCarId: "compact",
      unlockedCars: ["compact"],
      unlockedParts,
      equipped,
      cosmetics: {primary:"#4fe3ff", secondary:"#0d0f1f", wheelColor:"#141414", stripes:"none", number:7},
      stats: {totalRaces:0, totalWins:0, bestDriftScore:0},
    };
  }

  let state = null;

  function load(){
    try{
      const raw = localStorage.getItem(KEY);
      if(raw){ state = JSON.parse(raw); }
      else { state = defaultState(); }
    }catch(e){ state = defaultState(); }
    // Backfill any newly added categories/fields gracefully
    const d = defaultState();
    Object.keys(d.unlockedParts).forEach(cat=>{
      if(!state.unlockedParts[cat]) state.unlockedParts[cat] = d.unlockedParts[cat];
      if(!state.equipped[cat]) state.equipped[cat] = d.equipped[cat];
    });
    if(!state.cosmetics) state.cosmetics = d.cosmetics;
    if(!state.stats) state.stats = d.stats;
    if(!state.unlockedCars) state.unlockedCars = d.unlockedCars;
    return state;
  }

  function save(){
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){ /* storage unavailable */ }
  }

  function get(){ return state; }

  return {load, save, get};
})();

/* =========================================================================
   COMPONENT MANAGER — merges car archetype + equipped parts + cosmetics
   + temporary run upgrades into (a) numeric stats and (b) a visual view
   model. The renderer NEVER special-cases a part id; it just reads fields.
========================================================================= */
const ComponentManager = (function(){

  function getPart(category, id){
    const list = CONFIG.PARTS[category];
    return list.find(p=>p.id===id) || list[0];
  }
  function getCar(carId){
    return CONFIG.CARS.find(c=>c.id===carId) || CONFIG.CARS[0];
  }

  const DEFAULT_SHAPE = { angular:false,
    profile:[{t:-0.5,w:0.2},{t:-0.3,w:0.6},{t:0,w:1.0},{t:0.3,w:0.9},{t:0.5,w:0.5}],
    cabin:{t0:-0.15,t1:0.3,roofFrac:0.58}, wheelFrontT:-0.3, wheelRearT:0.3 };

  // equippedIds: {engine:'v8', tyres:'drift', ...}
  // runUpgrades: array of upgrade objects (already resolved from CONFIG.UPGRADES)
  function computeStats(carId, equippedIds, runUpgrades){
    const car = getCar(carId);
    const stats = {};
    STAT_KEYS.forEach(k=> stats[k] = car.base[k] || 0);

    Object.keys(equippedIds).forEach(cat=>{
      const part = getPart(cat, equippedIds[cat]);
      if(part && part.stats){
        Object.keys(part.stats).forEach(k=>{ stats[k] = (stats[k]||0) + part.stats[k]; });
      }
    });

    (runUpgrades||[]).forEach(u=>{
      Object.keys(u.delta).forEach(k=>{ stats[k] = (stats[k]||0) + u.delta[k]; });
    });

    STAT_KEYS.forEach(k=> stats[k] = Util.clamp(stats[k], 5, 160));
    return stats;
  }

  function buildVisual(carId, equippedIds, cosmetics, runFlags){
    const car = getCar(carId);
    const vm = {
      bodyWidth: car.body.width, bodyLength: car.body.length,
      primaryColor: cosmetics.primary, secondaryColor: cosmetics.secondary,
      wheelColor: "#141414", wheelWidthMult:1, wheelStyle:"street", rearWheelOffset:0,
      bodyWidthMult:1, bumperSizeMult:1, wheelArchSize:1, sideSkirt:false, reinforcementBars:false,
      rideHeight:0, wheelAngle:0,
      hoodStyle:"stock",
      spoiler:"none",
      flame:"normal",
      caliperColor:null, discSizeMult:1,
      exhaustStyle:"single", exhaustSizeMult:1,
      stripes: cosmetics.stripes, number: cosmetics.number,
      slick:false, chunky:false,
      diffuser:false, exhaustTip:null,
    };
    if(cosmetics.cometSmoke) vm.cometSmoke=true;

    Object.keys(equippedIds).forEach(cat=>{
      const part = getPart(cat, equippedIds[cat]);
      if(part && part.visual){
        Object.assign(vm, part.visual);
      }
    });
    if(cosmetics.wheelColor) vm.wheelColor=cosmetics.wheelColor;
    if(cosmetics.goldNitro) vm.flame="gold";

    // run-time roguelike visual flags stack additively on top of permanent build
    if(runFlags){
      if(runFlags.wide){ vm.bodyWidthMult *= 1.06; }
      if(runFlags.low){ vm.rideHeight -= 3; }
      if(runFlags.smoke){ vm.driftSmokeBonus = true; }
      if(runFlags.flame){ vm.flame = "large-short"; vm.nitroBoosted = true; }
      if(runFlags.armour){ vm.armourPanels = true; }
    }

    vm.finalBodyWidth = car.body.width * vm.bodyWidthMult;
    vm.finalBodyLength = car.body.length;
    vm.baseColor = car.color;
    vm.shape = car.shape || DEFAULT_SHAPE;
    return vm;
  }

  return {getPart, getCar, computeStats, buildVisual};
})();

/* =========================================================================
   CAR RENDERER — draws a car purely from a visual view-model, in a local
   coordinate space where the nose points toward -Y (up).
========================================================================= */
const CarRenderer = (function(){

  function draw(ctx, vm, opts){
    opts = opts||{};
    const scale = opts.scale || 1;
    const isDrifting = !!opts.isDrifting;
    const nitroActive = !!opts.nitroActive;

    const W = vm.finalBodyWidth * scale;
    const L = vm.finalBodyLength * scale;
    const rh = (vm.rideHeight||0) * scale; // ride height nudges shadow/body slightly

    ctx.save();

    const shape = vm.shape;
    const outline = buildOutlinePoints(shape.profile, W, L);

    // Shadow — same silhouette, offset and slightly enlarged
    ctx.save();
    ctx.translate(2*scale, 4*scale + rh*0.3);
    ctx.scale(1.05, 1.05);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    if(shape.angular) angularPolygonPath(ctx, outline); else roundedPolygonPath(ctx, outline);
    ctx.fill();
    ctx.restore();

    // Wheels (drawn first, peek out from under body) — wheelbase comes from the car's shape config
    const wheelLen = 15*scale;
    const wheelWid = 7*scale*(vm.wheelWidthMult||1);
    const frontY = shape.wheelFrontT * L;
    const rearY = shape.wheelRearT * L;
    const wheelX = W/2 - 1*scale;
    const rearOffset = (vm.rearWheelOffset||0)*scale;

    drawWheel(ctx, -wheelX, frontY, wheelWid, wheelLen, vm, -( (vm.wheelAngle||0) ));
    drawWheel(ctx,  wheelX, frontY, wheelWid, wheelLen, vm,  ( (vm.wheelAngle||0) ));
    drawWheel(ctx, -wheelX-rearOffset, rearY, wheelWid, wheelLen, vm, 0);
    drawWheel(ctx,  wheelX+rearOffset, rearY, wheelWid, wheelLen, vm, 0);

    // Wheel arches (widebody etc.)
    if(vm.sideSkirt){
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      roundRect(ctx, -W/2-1, -L/2+10*scale, 4*scale, L-20*scale, 3*scale); ctx.fill();
      roundRect(ctx,  W/2-3, -L/2+10*scale, 4*scale, L-20*scale, 3*scale); ctx.fill();
    }

    // Main body — traced from this car's silhouette profile, not a generic rectangle
    ctx.fillStyle = vm.primaryColor || vm.baseColor;
    if(shape.angular) angularPolygonPath(ctx, outline); else roundedPolygonPath(ctx, outline);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.4*scale;
    ctx.stroke();

    // Secondary color accent zone (roof), sized & positioned from the car's cabin descriptor
    const cabin = shape.cabin;
    ctx.fillStyle = vm.secondaryColor || "#111";
    roundRect(ctx, -W*cabin.roofFrac/2, L*cabin.t0, W*cabin.roofFrac, L*(cabin.t1-cabin.t0), 6*scale);
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Reinforcement bars
    if(vm.reinforcementBars){
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 2*scale;
      ctx.beginPath();
      ctx.moveTo(-W/2, -L*0.1); ctx.lineTo(W/2, -L*0.1);
      ctx.moveTo(-W/2, L*0.15); ctx.lineTo(W/2, L*0.15);
      ctx.stroke();
    }

    // Armour panels (temp upgrade)
    if(vm.armourPanels){
      ctx.fillStyle = "rgba(180,180,200,0.55)";
      roundRect(ctx, -W/2+2*scale, -L/2+2*scale, W-4*scale, 10*scale, 3*scale); ctx.fill();
    }

    // Front bumper — width matches this car's nose width (pointed wedge cars get a narrow bumper)
    const noseW = Math.max(shape.profile[0].w, 0.28);
    const tailW = Math.max(shape.profile[shape.profile.length-1].w, 0.32);
    ctx.fillStyle = shade(vm.primaryColor||vm.baseColor, -25);
    const bump = 8*scale*(vm.bumperSizeMult||1);
    roundRect(ctx, -W*noseW/2, -L/2-bump*0.35, W*noseW, bump, 4*scale); ctx.fill();
    // Rear bumper
    roundRect(ctx, -W*tailW/2, L/2-bump*0.65, W*tailW, bump, 4*scale); ctx.fill();

    // Hood detail — positioned between the nose and the cabin's front edge
    const hoodCy = L*((-0.5+cabin.t0)/2);
    drawHood(ctx, vm, W, L, scale, hoodCy);

    // Windows — sized & positioned from the cabin descriptor
    ctx.fillStyle = "#0a1626";
    ctx.globalAlpha = 0.92;
    roundRect(ctx, -W*cabin.roofFrac*0.46, L*cabin.t0+2*scale, W*cabin.roofFrac*0.92, L*(cabin.t1-cabin.t0)-3*scale, 5*scale);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Headlights
    ctx.fillStyle = "#fff9c4";
    roundRect(ctx, -W/2+3*scale, -L/2-1*scale, W*0.22, 5*scale, 2*scale); ctx.fill();
    roundRect(ctx,  W/2-3*scale-W*0.22, -L/2-1*scale, W*0.22, 5*scale, 2*scale); ctx.fill();
    // Taillights
    ctx.fillStyle = "#ff4040";
    roundRect(ctx, -W/2+3*scale, L/2-4*scale, W*0.2, 4*scale, 2*scale); ctx.fill();
    roundRect(ctx,  W/2-3*scale-W*0.2, L/2-4*scale, W*0.2, 4*scale, 2*scale); ctx.fill();

    // Spoiler
    drawSpoiler(ctx, vm, W, L, scale);

    // Exhaust pipes + nitro flame
    drawExhaust(ctx, vm, W, L, scale, nitroActive);

    // Racing stripes
    if(vm.stripes && vm.stripes !== "none"){
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      if(vm.stripes==="center"){
        roundRect(ctx, -W*0.08, -L/2, W*0.16, L, 2*scale); ctx.fill();
      } else if(vm.stripes==="side"){
        roundRect(ctx, -W/2+2*scale, -L/2, 3*scale, L, 1*scale); ctx.fill();
        roundRect(ctx,  W/2-5*scale, -L/2, 3*scale, L, 1*scale); ctx.fill();
      } else if(vm.stripes==="racing"){
        roundRect(ctx, -W*0.16, -L/2, W*0.1, L, 2*scale); ctx.fill();
        roundRect(ctx,  W*0.06, -L/2, W*0.1, L, 2*scale); ctx.fill();
      }
    }

    // Number
    if(vm.number !== undefined && vm.number !== null && vm.number !== ""){
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, L*0.15, 8*scale, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = `bold ${8*scale}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(vm.number), 0, L*0.15+0.5*scale);
    }

    // Drift smoke
    if(isDrifting){
      ctx.fillStyle = vm.cometSmoke ? "rgba(120,210,255,0.48)" : "rgba(230,230,230,0.35)";
      for(let i=0;i<2;i++){
        ctx.beginPath();
        ctx.arc((i===0?-1:1)*wheelX, rearY+8*scale, 8*scale, 0, Math.PI*2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawWheel(ctx, x, y, w, l, vm, angleOffset){
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angleOffset*Math.PI/180);
    ctx.fillStyle = vm.wheelColor || "#141414";
    roundRect(ctx, -w/2, -l/2, w, l, 2);
    ctx.fill();
    if(vm.caliperColor){
      ctx.fillStyle = vm.caliperColor;
      ctx.beginPath();
      ctx.arc(0,0,w*0.28*(vm.discSizeMult||1),0,Math.PI*2);
      ctx.fill();
    }
    if(vm.chunky){
      ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5;
      for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(-w/2,i*l/3); ctx.lineTo(w/2,i*l/3); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawHood(ctx, vm, W, L, scale, hoodCy){
    const cx=0, cy=(hoodCy!==undefined?hoodCy:-L*0.22);
    ctx.fillStyle = shade(vm.primaryColor||vm.baseColor, -12);
    if(vm.hoodStyle==="bulge"){
      roundRect(ctx, -W*0.22, cy-6*scale, W*0.44, 12*scale, 4*scale); ctx.fill();
    } else if(vm.hoodStyle==="scoop"){
      ctx.beginPath();
      ctx.moveTo(-W*0.14, cy-8*scale); ctx.lineTo(W*0.14, cy-8*scale);
      ctx.lineTo(W*0.09, cy+6*scale); ctx.lineTo(-W*0.09, cy+6*scale);
      ctx.closePath(); ctx.fill();
    } else if(vm.hoodStyle==="supercharger"){
      roundRect(ctx, -W*0.16, cy-9*scale, W*0.32, 14*scale, 3*scale); ctx.fill();
      ctx.fillStyle = "#333";
      roundRect(ctx, -W*0.10, cy-11*scale, W*0.2, 5*scale, 2*scale); ctx.fill();
    } else if(vm.hoodStyle==="vent"){
      ctx.strokeStyle = shade(vm.primaryColor||vm.baseColor,-40);
      ctx.lineWidth = 1.2*scale;
      for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.moveTo(i*4*scale, cy-5*scale); ctx.lineTo(i*4*scale, cy+5*scale); ctx.stroke(); }
    }
    if(vm.diffuser){
      ctx.fillStyle = "#222";
      roundRect(ctx, -W*0.3, L/2-3*scale, W*0.6, 5*scale, 2*scale); ctx.fill();
    }
  }

  function drawSpoiler(ctx, vm, W, L, scale){
    if(!vm.spoiler || vm.spoiler==="none") return;
    const y = L/2 - 2*scale;
    ctx.fillStyle = "#181818";
    if(vm.spoiler==="small"){
      roundRect(ctx, -W*0.32, y-4*scale, W*0.64, 4*scale, 2*scale); ctx.fill();
    } else if(vm.spoiler==="ducktail"){
      ctx.beginPath();
      ctx.moveTo(-W*0.34,y); ctx.lineTo(W*0.34,y); ctx.lineTo(W*0.22,y-6*scale); ctx.lineTo(-W*0.22,y-6*scale);
      ctx.closePath(); ctx.fill();
    } else if(vm.spoiler==="wing" || vm.spoiler==="extreme"){
      const wingW = vm.spoiler==="extreme" ? W*0.9 : W*0.7;
      const standH = vm.spoiler==="extreme" ? 12*scale : 8*scale;
      ctx.fillStyle="#111";
      roundRect(ctx, -3*scale, y-standH, 3*scale, standH, 1); ctx.fill();
      roundRect(ctx, 3*scale-6*scale, y-standH, 3*scale, standH, 1); ctx.fill();
      ctx.fillStyle="#181818";
      roundRect(ctx, -wingW/2, y-standH-4*scale, wingW, 5*scale, 2*scale); ctx.fill();
    }
  }

  function drawExhaust(ctx, vm, W, L, scale, nitroActive){
    const y = L/2;
    const size = 3.2*scale*(vm.exhaustSizeMult||1);
    const style = vm.exhaustStyle||"single";
    let positions = [0];
    if(style==="dual") positions=[-W*0.18, W*0.18];
    else if(style==="quad") positions=[-W*0.24,-W*0.1,W*0.1,W*0.24];
    else if(style==="racing") positions=[-W*0.2,W*0.2];

    ctx.fillStyle = "#0a0a0a";
    positions.forEach(px=>{
      ctx.beginPath();
      ctx.ellipse(px, y+1*scale, size, size*0.7, 0, 0, Math.PI*2);
      ctx.fill();
    });

    if(nitroActive){
      const flameLong = vm.flame==="long-thin";
      const flameBig = vm.flame==="large-short";
      const flameColor = vm.flame==="blue" ? "rgba(90,180,255,0.85)" : vm.flame==="gold" ? "rgba(255,209,92,0.92)" : "rgba(255,150,60,0.85)";
      positions.forEach(px=>{
        ctx.fillStyle = flameColor;
        const len = (flameLong?16:flameBig?10:12)*scale;
        const wid = (flameBig?5:3)*scale;
        ctx.beginPath();
        ctx.moveTo(px-wid, y+size);
        ctx.lineTo(px+wid, y+size);
        ctx.lineTo(px, y+size+len);
        ctx.closePath();
        ctx.fill();
      });
    }
  }

  // Mirrors a car's {t,w} profile (right half, nose->tail) into a full closed
  // polygon of local {x,y} points (right side nose->tail, then left side tail->nose).
  function buildOutlinePoints(profile, W, L){
    const right = profile.map(p=>({x: p.w*(W/2), y: p.t*L}));
    const left = right.slice().reverse().map(p=>({x:-p.x, y:p.y}));
    return right.concat(left);
  }

  // Rounded silhouette: classic "curve through the midpoints" technique, smooths every corner.
  function roundedPolygonPath(ctx, pts){
    const n = pts.length;
    const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    ctx.beginPath();
    const m0 = mid(pts[n-1], pts[0]);
    ctx.moveTo(m0.x, m0.y);
    for(let i=0;i<n;i++){
      const next = pts[(i+1)%n];
      const m = mid(pts[i], next);
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
    }
    ctx.closePath();
  }

  // Angular silhouette: straight edges between profile points, sharper/boxier look.
  function angularPolygonPath(ctx, pts){
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  function roundRect(ctx,x,y,w,h,r){
    if(w<0){x+=w;w=-w;} if(h<0){y+=h;h=-h;}
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function shade(hex, percent){
    if(!hex) return "#333";
    let num = parseInt(hex.replace("#",""),16);
    let r = (num>>16), g=(num>>8&0x00FF), b=(num&0x0000FF);
    r = Util.clamp(r+percent*2.55,0,255); g=Util.clamp(g+percent*2.55,0,255); b=Util.clamp(b+percent*2.55,0,255);
    return `rgb(${r|0},${g|0},${b|0})`;
  }

  return {draw};
})();

/* =========================================================================
   INPUT MANAGER
========================================================================= */
const InputManager = (function(){
  const keys = new Set();
  const touch = new Set();
  window.addEventListener("keydown", e=>{
    keys.add(e.code);
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", e=> keys.delete(e.code));
  function isDown(...codes){ return codes.some(c=>keys.has(c)); }
  function bindTouchControls(root){
    root?.querySelectorAll("[data-touch-control]").forEach(button=>{
      const control=button.dataset.touchControl;
      const release=event=>{touch.delete(control);button.classList.remove("pressed");if(button.hasPointerCapture?.(event.pointerId))button.releasePointerCapture(event.pointerId);};
      button.addEventListener("pointerdown",event=>{event.preventDefault();touch.add(control);button.classList.add("pressed");button.setPointerCapture?.(event.pointerId);});
      button.addEventListener("pointerup",release);
      button.addEventListener("pointercancel",release);
      button.addEventListener("lostpointercapture",()=>{touch.delete(control);button.classList.remove("pressed");});
      button.addEventListener("contextmenu",event=>event.preventDefault());
    });
  }
  return {
    bindTouchControls,
    clearTouch(){touch.clear();document.querySelectorAll(".touch-control.pressed").forEach(button=>button.classList.remove("pressed"));},
    get throttle(){ return isDown("KeyW","ArrowUp") || touch.has("accelerate") ? 1 : 0; },
    get brake(){ return isDown("KeyS","ArrowDown") || touch.has("brake") ? 1 : 0; },
    get steer(){ return ((isDown("KeyD","ArrowRight")||touch.has("right"))?1:0) - ((isDown("KeyA","ArrowLeft")||touch.has("left"))?1:0); },
    get handbrake(){ return isDown("Space") || touch.has("drift"); },
    get nitro(){ return isDown("ShiftLeft","ShiftRight") || touch.has("nitro"); },
  };
})();

/* =========================================================================
   TRACK GENERATORS — each returns a closed-loop array of {x,y} centerline
   points. Genuinely different shapes (not resizes of the same loop):
   a stadium oval, a self-crossing figure-eight, a hand-authored technical
   switchback, an organic wavy sweep, a big circular bowl, and a stadium
   with a slalom chicane cut into one straight.
========================================================================= */
function genStadium(cx,cy,rx,ry,segPerCurve){
  const pts=[];
  for(let i=0;i<=segPerCurve;i++){
    const t = -Math.PI/2 + Math.PI*(i/segPerCurve);
    pts.push({x:cx+rx+ry*Math.cos(t), y:cy+ry*Math.sin(t)});
  }
  for(let i=1;i<segPerCurve;i++){
    pts.push({x:cx+rx-(2*rx)*(i/segPerCurve), y:cy+ry});
  }
  for(let i=0;i<=segPerCurve;i++){
    const t = Math.PI/2 + Math.PI*(i/segPerCurve);
    pts.push({x:cx-rx+ry*Math.cos(t), y:cy+ry*Math.sin(t)});
  }
  for(let i=1;i<segPerCurve;i++){
    pts.push({x:cx-rx+(2*rx)*(i/segPerCurve), y:cy-ry});
  }
  return pts;
}
function genFigureEight(cx,cy,a,steps){
  const pts=[];
  for(let i=0;i<steps;i++){
    const t=(i/steps)*Math.PI*2;
    const denom = 1+Math.sin(t)*Math.sin(t);
    pts.push({x:cx+a*Math.cos(t)/denom, y:cy+a*Math.sin(t)*Math.cos(t)/denom});
  }
  return pts;
}
function genWavyLoop(cx,cy,rx,ry,wobbleAmp,freq,steps){
  const pts=[];
  for(let i=0;i<steps;i++){
    const t=(i/steps)*Math.PI*2;
    const r1 = rx + wobbleAmp*Math.sin(freq*t);
    const r2 = ry + wobbleAmp*Math.cos(freq*t*0.7);
    pts.push({x:cx+r1*Math.cos(t), y:cy+r2*Math.sin(t)});
  }
  return pts;
}
function genOvalBowl(cx,cy,rx,ry,steps){
  const pts=[];
  for(let i=0;i<steps;i++){
    const t=(i/steps)*Math.PI*2;
    pts.push({x:cx+rx*Math.cos(t), y:cy+ry*Math.sin(t)});
  }
  return pts;
}
function genCloverChicane(cx,cy,rx,ry,seg,amp,cycles){
  const pts = genStadium(cx,cy,rx,ry,seg);
  const startIdx = seg+1, endIdx = 2*seg-1; // index range of the bottom straight
  for(let i=startIdx;i<=endIdx && i<pts.length;i++){
    const localT = (i-startIdx)/(endIdx-startIdx);
    pts[i] = {x:pts[i].x, y:pts[i].y + amp*Math.sin(cycles*Math.PI*2*localT)};
  }
  return pts;
}
function genDoubleChicane(cx,cy,rx,ry,seg,amp,cycles){
  const pts = genStadium(cx,cy,rx,ry,seg);
  const startB = seg+1, endB = 2*seg-1; // bottom straight
  for(let i=startB;i<=endB && i<pts.length;i++){
    const t = (i-startB)/(endB-startB);
    pts[i] = {x:pts[i].x, y:pts[i].y + amp*Math.sin(cycles*Math.PI*2*t)};
  }
  const startT = 3*seg+1, endT = 4*seg-1; // top straight (opposite phase for variety)
  for(let i=startT;i<=endT && i<pts.length;i++){
    const t = (i-startT)/(endT-startT);
    pts[i] = {x:pts[i].x, y:pts[i].y - amp*Math.sin(cycles*Math.PI*2*t)};
  }
  return pts;
}
function genTriOval(cx,cy,R,amp,squash,steps){
  const pts=[];
  for(let i=0;i<steps;i++){
    const t=(i/steps)*Math.PI*2;
    const r = R + amp*Math.cos(3*t);
    pts.push({x:cx+r*Math.cos(t), y:cy+r*squash*Math.sin(t)});
  }
  return pts;
}

// Every track carries a bg descriptor — a base colour, an accent glow colour,
// and a decoration theme — used to give each track a distinct atmosphere
// (see drawBackground/drawDecoration near the renderer).
const TRACK_DEFS = [
  {id:"neon_oval", name:"Neon Oval", desc:"A wide, fast stadium loop — great for learning the controls.",
    roadWidth:540, roadColor:"#14172c", kerbA:"#ff2b2b", kerbB:"#ffffff",
    bg:{base:"#05060a", accent:"#4fe3ff", decoration:"stars"},
    points: genStadium(0,0,9360,5400,140)},
  {id:"infinity_loop", name:"Infinity Loop", desc:"A crossing figure-eight circuit — watch for traffic at the middle.",
    roadWidth:472, roadColor:"#1a1030", kerbA:"#ff4fd8", kerbB:"#ffffff",
    bg:{base:"#0d0518", accent:"#ff4fd8", decoration:"city"},
    points: genFigureEight(0,0,8640,320)},
  {id:"zigzag_alley", name:"Zigzag Alley", desc:"A tight technical switchback. Handling beats raw speed here.",
    roadWidth:405, roadColor:"#101a14", kerbA:"#fff64f", kerbB:"#111111",
    bg:{base:"#0a1410", accent:"#fff64f", decoration:"industrial"},
    points: genWavyLoop(0,0,5000,3200,1350,6,240)},
  {id:"mountain_sweep", name:"Mountain Sweep", desc:"Wide, organic sweeping curves through open terrain.",
    roadWidth:585, roadColor:"#1a140a", kerbA:"#4fff9e", kerbB:"#ffffff",
    bg:{base:"#140f0a", accent:"#ff8a4f", decoration:"mountains"},
    points: genWavyLoop(0,0,8280,5040,1260,3,320)},
  {id:"speed_bowl", name:"Speed Bowl", desc:"A huge, wide oval built for flat-out top speed.",
    roadWidth:652, roadColor:"#12141c", kerbA:"#4fe3ff", kerbB:"#ffffff",
    bg:{base:"#140f06", accent:"#4fe3ff", decoration:"desert"},
    points: genOvalBowl(0,0,9000,6840,260)},
  {id:"clover_circuit", name:"Clover Circuit", desc:"A stadium loop with a slalom chicane cut into the back straight.",
    roadWidth:472, roadColor:"#141224", kerbA:"#c04fff", kerbB:"#ffffff",
    bg:{base:"#0a140a", accent:"#c04fff", decoration:"meadow"},
    points: genCloverChicane(0,0,7560,4680,120,810,2)},
  {id:"dumbbell_pass", name:"Dumbbell Pass", desc:"Two fast bulbous ends squeezed through a tight central pinch.",
    roadWidth:470, roadColor:"#161022", kerbA:"#ff6f4f", kerbB:"#ffffff",
    bg:{base:"#0c0818", accent:"#ff6f4f", decoration:"hex"},
    points: genWavyLoop(0,0,8200,4200,3600,2,260)},
  {id:"drag_strip", name:"Drag Strip Oval", desc:"Very long straights, brutally tight hairpin ends. Pure speed.",
    roadWidth:560, roadColor:"#161410", kerbA:"#fff64f", kerbB:"#111111",
    bg:{base:"#100a06", accent:"#fff64f", decoration:"dragstrip"},
    points: genOvalBowl(0,0,13000,3200,220)},
  {id:"slalom_circuit", name:"Slalom Circuit", desc:"A stadium loop with chicanes cut into BOTH straights — constant weaving.",
    roadWidth:430, roadColor:"#0f1420", kerbA:"#4fff9e", kerbB:"#ffffff",
    bg:{base:"#0a0f16", accent:"#4fff9e", decoration:"cones"},
    points: genDoubleChicane(0,0,7200,4200,110,620,2)},
  {id:"tri_oval_speedway", name:"Tri-Oval Speedway", desc:"A gently distorted three-cornered oval built for flat-out speed.",
    roadWidth:600, roadColor:"#1a1210", kerbA:"#ff2b2b", kerbB:"#ffffff",
    bg:{base:"#120a06", accent:"#ff2b2b", decoration:"grandstand"},
    points: genTriOval(0,0,7800,2100,0.62,220)},
];

/* =========================================================================
   TRACK — holds one generated centerline, draws asphalt + striped kerbs,
   and resolves wall collisions (nearest-segment distance check).
========================================================================= */
// Walks forward along the centerline from startIdx, accumulating real arc
// length (not point count, since tracks have wildly different point
// densities) until it covers targetLen, building an offset path that starts
// AT the main track (ramp=0), rises to a full lateral offset for the middle
// "flat" stretch, then eases back to 0 to rejoin — i.e. a real pit lane that
// runs alongside the track and merges in/out, not a branch to a dead end.
function buildPitLanePoints(centerline, n, startIdx, targetLen, taperLen, sign, laneOffset){
  const idxList = [startIdx];
  let idx = startIdx, dist = 0, guard = 0;
  const minPoints = 8;
  while((dist<targetLen || idxList.length<minPoints) && guard<n){
    const nextIdx = (idx+1)%n;
    dist += Util.dist(centerline[idx].x,centerline[idx].y, centerline[nextIdx].x,centerline[nextIdx].y);
    idx = nextIdx;
    idxList.push(idx);
    guard++;
  }
  if(guard>=n) return null; // lane would wrap the entire track — bail, caller tries another spot
  const segLen = idxList.length-1;
  const taperCount = Math.max(1, Math.min(Math.floor(segLen/2)-1, Math.round((taperLen/targetLen)*segLen)));
  const points = idxList.map((pIdx,k)=>{
    const p = centerline[pIdx];
    const pPrev = centerline[(pIdx-1+n)%n];
    const pNext = centerline[(pIdx+1)%n];
    const tangent = {x:pNext.x-pPrev.x, y:pNext.y-pPrev.y};
    const tLen = Math.hypot(tangent.x,tangent.y) || 1;
    const tx=tangent.x/tLen, ty=tangent.y/tLen;
    const nx=-ty*sign, ny=tx*sign;
    let ramp = 1;
    if(k<taperCount) ramp = k/taperCount;
    else if(k>segLen-taperCount) ramp = (segLen-k)/taperCount;
    const offset = laneOffset*ramp;
    return {x:p.x+nx*offset, y:p.y+ny*offset};
  });
  return {points, idxList, segLen, taperCount};
}

// Minimum distance from any pit lane point to any main-track point that
// ISN'T part of the stretch the lane runs alongside (so the "flat" middle
// of the lane can't have drifted into a totally different part of the track).
function pitLaneClearance(centerline, n, points, idxList){
  const near = new Set();
  idxList.forEach(idx=>{ for(let d=-6;d<=6;d++) near.add(((idx+d)%n+n)%n); });
  let minD = Infinity;
  points.forEach(lp=>{
    for(let j=0;j<n;j++){
      if(near.has(j)) continue;
      const d = Util.dist(lp.x,lp.y,centerline[j].x,centerline[j].y);
      if(d<minD) minD = d;
    }
  });
  return minD;
}

// Finds a good stretch of any track shape to run a pit lane alongside: tries
// a spread of starting points and both sides of the road, and picks whichever
// gives the most clearance from the rest of the circuit (so it never overlaps
// another part of the track, even on a self-crossing shape like the figure-eight).
function computePitLane(centerline, roadWidth){
  const n = centerline.length;
  const pitRoadWidth = Math.max(80, roadWidth*0.5);
  const gap = 40;
  const laneOffset = roadWidth/2 + gap + pitRoadWidth/2;
  const targetLen = Util.clamp(roadWidth*7, 900, 2200);
  const taperLen = Math.min(targetLen*0.3, 380);

  const candidateCount = 22;
  let best = null;
  for(let c=0;c<candidateCount;c++){
    const frac = 0.08 + 0.84*(c/candidateCount);
    const startIdx = Math.floor(frac*n);
    [1,-1].forEach(sign=>{
      const built = buildPitLanePoints(centerline, n, startIdx, targetLen, taperLen, sign, laneOffset);
      if(!built) return;
      const clearance = pitLaneClearance(centerline, n, built.points, built.idxList);
      if(!best || clearance>best.clearance){
        best = Object.assign({sign, clearance}, built);
      }
    });
  }

  const midK = Math.round(best.segLen/2);
  const zoneCenter = best.points[Util.clamp(midK,0,best.points.length-1)];
  return {
    points: best.points,
    roadWidth: pitRoadWidth,
    zone: {x:zoneCenter.x, y:zoneCenter.y, radius: pitRoadWidth/2},
  };
}

class Track{
  constructor(def){
    this.def = def;
    this.roadWidth = def.roadWidth;
    this.roadColor = def.roadColor;
    this.kerbA = def.kerbA;
    this.kerbB = def.kerbB;
    this.centerline = def.points;
    // Every generated centerline point is used as a checkpoint/pursuit target.
    // A fixed small handful of checkpoints (the old approach) meant AI steered
    // in long straight lines between far-apart waypoints on a big track, cutting
    // straight through corners. Using the dense curve itself fixes that, and the
    // checkpointRadius below still gives a sensible steering look-ahead distance.
    this.checkpoints = this.centerline;
    this.startPoint = this.centerline[0];
    const p0=this.centerline[0], p1=this.centerline[1];
    this.startAngle = Math.atan2(p1.x-p0.x, -(p1.y-p0.y));
    this.pit = computePitLane(this.centerline, this.roadWidth);
  }
  draw(ctx, camX, camY){
    ctx.save();
    ctx.lineJoin="round"; ctx.lineCap="round";
    // Striped kerb border (two overlaid strokes, one dashed) shows exactly where the wall is
    ctx.strokeStyle = this.kerbA;
    ctx.lineWidth = this.roadWidth+16;
    this._strokePath(ctx,camX,camY);
    ctx.setLineDash([22,22]);
    ctx.strokeStyle = this.kerbB;
    ctx.lineWidth = this.roadWidth+16;
    this._strokePath(ctx,camX,camY);
    ctx.setLineDash([]);
    // Asphalt surface
    ctx.strokeStyle = this.roadColor;
    ctx.lineWidth = this.roadWidth;
    this._strokePath(ctx,camX,camY);
    // center dashed line
    ctx.setLineDash([18,18]);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 3;
    this._strokePath(ctx,camX,camY);
    ctx.setLineDash([]);
    // start/finish line
    const p0=this.centerline[0];
    ctx.save();
    ctx.translate(p0.x-camX,p0.y-camY);
    ctx.rotate(this.startAngle);
    ctx.fillStyle="#fff";
    for(let i=-this.roadWidth/2;i<this.roadWidth/2;i+=14){
      ctx.fillRect(i, -4, 10, 8);
    }
    ctx.restore();
    this._drawPit(ctx, camX, camY);
    ctx.restore();
  }
  _drawPit(ctx, camX, camY){
    const pit = this.pit;
    ctx.save();
    ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.strokeStyle = "#ffd23b";
    ctx.lineWidth = pit.roadWidth+10;
    this._strokeOpenPath(ctx, pit.points, camX, camY);
    ctx.strokeStyle = "#1c1e2c";
    ctx.lineWidth = pit.roadWidth;
    this._strokeOpenPath(ctx, pit.points, camX, camY);
    ctx.setLineDash([12,12]);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    this._strokeOpenPath(ctx, pit.points, camX, camY);
    ctx.setLineDash([]);

    const zx = pit.zone.x-camX, zy = pit.zone.y-camY;
    ctx.setLineDash([10,10]);
    ctx.strokeStyle = "rgba(79,255,158,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(zx,zy,pit.zone.radius,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffd23b";
    ctx.font = "bold 42px sans-serif";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("P", zx, zy-30);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("PIT LANE — REPAIR", zx, zy+pit.zone.radius+22);
    ctx.restore();
  }
  _strokePath(ctx,camX,camY){
    ctx.beginPath();
    this.centerline.forEach((p,i)=>{
      const x=p.x-camX, y=p.y-camY;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  _strokeOpenPath(ctx, points, camX, camY){
    ctx.beginPath();
    points.forEach((p,i)=>{
      const x=p.x-camX, y=p.y-camY;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  }
  // Nearest point on an (optionally closed) polyline to (x,y), with distance.
  nearestPointInfoOnPath(points, x, y, closed){
    const n = points.length;
    const segCount = closed ? n : n-1;
    let best = null;
    for(let i=0;i<segCount;i++){
      const a = points[i], b = points[(i+1)%n];
      const abx=b.x-a.x, aby=b.y-a.y;
      const lenSq = abx*abx+aby*aby || 1;
      let t = ((x-a.x)*abx+(y-a.y)*aby)/lenSq;
      t = Util.clamp(t,0,1);
      const px=a.x+abx*t, py=a.y+aby*t;
      const d = Util.dist(x,y,px,py);
      if(!best || d<best.dist){ best = {dist:d, x:px, y:py}; }
    }
    return best;
  }
  // Nearest point on the main centerline loop to (x,y), with distance.
  nearestPointInfo(x,y){
    return this.nearestPointInfoOnPath(this.centerline, x, y, true);
  }
  // True if (x,y) is anywhere on the pit lane surface — used to exempt the
  // pit lane from the main-track wall collision.
  isOnPit(x,y,carRadius){
    const pit = this.pit;
    if(!pit) return false;
    const info = this.nearestPointInfoOnPath(pit.points, x, y, false);
    return info.dist <= (pit.roadWidth/2 - carRadius);
  }
  // Pushes a car back inside the road boundary and BOUNCES it off the wall:
  // reflects velocity outward (with some energy retained, not just cancelled),
  // adds a spin proportional to how hard it hit, and spawns impact sparks —
  // so any car (player or AI) visibly caroms off the wall, not just stops.
  // Damage is based on impact speed along the wall normal. Returns {hit, damage}.
  resolveCollision(car, particles){
    const carRadius = ((car.visual && car.visual.finalBodyWidth) || 34) * 0.42;
    if(this.isOnPit(car.x, car.y, carRadius)) return {hit:false, damage:0};
    const info = this.nearestPointInfo(car.x, car.y);
    const limit = this.roadWidth/2 - carRadius;
    if(info.dist > limit){
      const dist = Math.max(info.dist, 0.001);
      const nx = (car.x-info.x)/dist, ny=(car.y-info.y)/dist;
      const overlap = info.dist - limit;
      car.x -= nx*overlap; car.y -= ny*overlap;

      const vn = car.vx*nx + car.vy*ny;
      const tangent = {x:-ny, y:nx};
      const vt = car.vx*tangent.x + car.vy*tangent.y;
      const impactSpeed = Math.max(vn, 0);
      const damage = computeImpactDamage(impactSpeed);
      applyDamage(car, damage, particles);

      // Elastic bounce: reflect the inward velocity component back outward
      // (restitution > 1 on the cancel term = it rebounds, not just stops),
      // then apply an overall damping so the bounce doesn't run away.
      if(vn>0){ car.vx -= 1.8*vn*nx; car.vy -= 1.8*vn*ny; }
      car.vx *= 0.72; car.vy *= 0.72;

      // Spin the car on impact — direction follows the tangential (along-wall)
      // velocity it had going in, strength scales with how hard it hit.
      const spinDir = vt>=0 ? 1 : -1;
      const spinAmount = Util.clamp(impactSpeed*0.0035, 0, 1.1);
      car.angle += spinDir*spinAmount;

      const stunMult = (car.aiStyle==="wall_rider" ? 0.35 : 1) / Math.sqrt(car.lastRubberBoost||1);
      car.collisionStun = Util.clamp((0.15 + damage*0.022)*stunMult, 0.03, 0.9);

      if(particles){
        particles.spawnSpark(car.x, car.y, "rgba(255,150,60,");
        particles.spawnSpark(car.x, car.y, "rgba(255,230,90,");
        if(damage>10) particles.spawnSpark(car.x, car.y, "rgba(255,255,255,");
      }

      return {hit:true, damage};
    }
    return {hit:false, damage:0};
  }
}

// Damage from an impact speed (units/sec along the collision normal). Gentle
// grazes below the threshold do nothing; harder hits scale up, capped so a
// single collision can't be a one-shot wipeout.
function computeImpactDamage(speed){
  return Util.clamp((speed-70)*0.055, 0, 16);
}

// Applies damage to a car's health and, the moment health hits zero, wrecks
// the car (disabled for the rest of the race) with a one-time explosion.
function applyDamage(car, dmg, particles){
  if(dmg<=0) return 0;
  const prevHealth = car.health!==undefined ? car.health : HEALTH_MAX;
  car.health = Util.clamp(prevHealth-dmg, 0, HEALTH_MAX);
  car.lastDamage = dmg;
  if(car.health<=0 && !car.wrecked){
    car.wrecked = true;
    if(particles) particles.spawnExplosion(car.x, car.y);
  }
  return dmg;
}

// Circle-based collision between every pair of cars (player included). Cars
// overlapping get pushed apart and exchange some velocity along the impact
// normal, with a bit of energy loss so it feels like a bump, not a bounce.
// The radius blends body width and length — width alone made nose-to-tail
// hits (the most common kind in racing) nearly impossible to trigger.
function carCollisionRadius(car){
  const w = (car.visual && car.visual.finalBodyWidth) || 34;
  const l = (car.visual && car.visual.finalBodyLength) || 60;
  return w*0.5 + l*0.3;
}
function resolveCarCollisions(cars, particles){
  const restitution = 0.68;
  const events = [];
  for(let i=0;i<cars.length;i++){
    for(let j=i+1;j<cars.length;j++){
      const a = cars[i], b = cars[j];
      const ra = carCollisionRadius(a);
      const rb = carCollisionRadius(b);
      const dx = b.x-a.x, dy = b.y-a.y;
      const dist = Math.hypot(dx,dy) || 0.001;
      const minDist = ra+rb;
      if(dist < minDist){
        const nx = dx/dist, ny = dy/dist;
        const overlap = minDist-dist;

        // Mass-weighted separation and impulse — a heavier car (e.g. the
        // tank-style rival) barely gets pushed/slowed while a lighter car
        // bounces off it hard. Equal masses (the default) behave exactly
        // like the old 50/50 split.
        const ma = a.mass||1, mb = b.mass||1;
        const invA = 1/ma, invB = 1/mb, totalInv = invA+invB;
        a.x -= nx*overlap*(invA/totalInv); a.y -= ny*overlap*(invA/totalInv);
        b.x += nx*overlap*(invB/totalInv); b.y += ny*overlap*(invB/totalInv);

        const avn = a.vx*nx + a.vy*ny;
        const bvn = b.vx*nx + b.vy*ny;
        const closingSpeed = Math.abs(avn-bvn);
        const impulse = -(1+restitution)*(avn-bvn)/totalInv;
        a.vx += impulse*invA*nx; a.vy += impulse*invA*ny;
        b.vx -= impulse*invB*nx; b.vy -= impulse*invB*ny;
        a.vx *= 0.97; a.vy *= 0.97; b.vx *= 0.97; b.vy *= 0.97;

        // Spin both cars on impact (each based on their own tangential
        // velocity), so a hit visibly knocks them off-line, same as a wall bounce.
        const tangent = {x:-ny, y:nx};
        const aVt = a.vx*tangent.x + a.vy*tangent.y;
        const bVt = b.vx*tangent.x + b.vy*tangent.y;
        const spinAmount = Util.clamp(closingSpeed*0.003, 0, 0.8);
        a.angle += (aVt>=0?1:-1)*spinAmount*0.5;
        b.angle += (bVt>=0?1:-1)*spinAmount*0.5;

        const damage = computeImpactDamage(closingSpeed);
        if(damage>0){
          applyDamage(a, damage, particles);
          applyDamage(b, damage, particles);
          events.push({car:a, damage}, {car:b, damage});
        }
        const stun = closingSpeed>90 ? 0.4 : 0.2;
        a.collisionStun = Math.max(a.collisionStun||0, stun/Math.sqrt(a.lastRubberBoost||1));
        b.collisionStun = Math.max(b.collisionStun||0, stun/Math.sqrt(b.lastRubberBoost||1));

        if(a.isDrifting){ a.isDrifting=false; a.driftDuration=0; a.driftCombo=1; }
        if(b.isDrifting){ b.isDrifting=false; b.driftDuration=0; b.driftCombo=1; }

        if(particles){
          particles.spawnSpark((a.x+b.x)/2, (a.y+b.y)/2, "rgba(255,190,90,");
          particles.spawnSpark((a.x+b.x)/2, (a.y+b.y)/2, "rgba(255,255,255,");
        }
      }
    }
  }
  return events;
}

/* =========================================================================
   PARTICLE MANAGER
========================================================================= */
class ParticleManager{
  constructor(){ this.particles=[]; }
  spawnSmoke(x,y,color){
    this.particles.push({x,y,vx:(Math.random()-0.5)*20,vy:(Math.random()-0.5)*20,
      life:0.6,maxLife:0.6,size:6+Math.random()*6,color:color||"rgba(220,220,220,"});
  }
  spawnSpark(x,y,color){
    this.particles.push({x,y,vx:(Math.random()-0.5)*60,vy:(Math.random()-0.5)*60,
      life:0.3,maxLife:0.3,size:2+Math.random()*2,color:color||"rgba(255,200,80,"});
  }
  spawnExplosion(x,y){
    const colors = ["rgba(255,120,40,","rgba(255,200,60,","rgba(255,60,30,","rgba(90,90,90,","rgba(255,255,255,"];
    for(let i=0;i<28;i++){
      const angle = Math.random()*Math.PI*2;
      const spd = 60+Math.random()*240;
      const life = 0.5+Math.random()*0.55;
      this.particles.push({
        x, y, vx:Math.cos(angle)*spd, vy:Math.sin(angle)*spd,
        life, maxLife:life, size:6+Math.random()*12,
        color: colors[Math.floor(Math.random()*colors.length)],
      });
    }
  }
  update(dt){
    for(let i=this.particles.length-1;i>=0;i--){
      const p=this.particles[i];
      p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(p.life<=0) this.particles.splice(i,1);
    }
  }
  draw(ctx,camX,camY){
    this.particles.forEach(p=>{
      const alpha = Util.clamp(p.life/p.maxLife,0,1)*0.6;
      ctx.fillStyle = p.color+alpha+")";
      ctx.beginPath();
      ctx.arc(p.x-camX,p.y-camY,p.size,0,Math.PI*2);
      ctx.fill();
    });
  }
}

/* =========================================================================
   TRACK BACKGROUNDS — each track's bg{base, accent, decoration} drives a
   base fill + radial glow plus a themed scatter of simple world-space
   shapes. Decorations are placed deterministically from a position hash
   (not stored anywhere) and only the cells near the camera are drawn each
   frame, so this stays cheap regardless of how far the player has driven.
========================================================================= */
function bgHash(x,y){
  const h = Math.sin(x*127.1 + y*311.7) * 43758.5453;
  return h - Math.floor(h);
}

function drawBackground(ctx, camX, camY, w, h, bg){
  ctx.fillStyle = bg.base;
  ctx.fillRect(0,0,w,h);
  const grad = ctx.createRadialGradient(w/2,h*0.4,0, w/2,h*0.4, Math.max(w,h)*0.85);
  grad.addColorStop(0, bg.accent+"22");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,w,h);
  drawDecorations(ctx, camX, camY, w, h, bg);
}

function drawDecorations(ctx, camX, camY, w, h, bg){
  const cell = 760;
  const margin = cell;
  const startX = Math.floor((camX-margin)/cell)*cell;
  const startY = Math.floor((camY-margin)/cell)*cell;
  const endX = camX+w+margin;
  const endY = camY+h+margin;
  for(let wx=startX; wx<endX; wx+=cell){
    for(let wy=startY; wy<endY; wy+=cell){
      const gx = Math.round(wx/cell), gy = Math.round(wy/cell);
      const presence = bgHash(gx,gy);
      if(presence>0.5) continue; // sparsity control
      const px = wx + bgHash(gx+13.7,gy)*cell;
      const py = wy + bgHash(gx,gy+7.3)*cell;
      drawDecorationShape(ctx, px-camX, py-camY, bg.decoration, bgHash(gx+3.1,gy+9.4), bg.accent);
    }
  }
}

function drawDecorationShape(ctx, x, y, type, seed, accent){
  ctx.save();
  ctx.translate(x,y);
  if(type==="stars"){
    const s = 2+seed*3.5;
    ctx.fillStyle = `rgba(255,255,255,${(0.25+seed*0.5).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(0,0,s,0,Math.PI*2); ctx.fill();
  } else if(type==="city"){
    const bw = 46+seed*70, bh = 140+seed*300;
    ctx.fillStyle = "#150a24";
    ctx.fillRect(-bw/2,-bh,bw,bh);
    ctx.fillStyle = accent+"55";
    for(let r=0;r<Math.floor(bh/26);r++){
      for(let c=0;c<Math.floor(bw/16);c++){
        if(bgHash(seed*131+r,c*7.1)>0.6) ctx.fillRect(-bw/2+6+c*16,-bh+10+r*26,7,9);
      }
    }
  } else if(type==="industrial"){
    ctx.strokeStyle = accent+"55"; ctx.lineWidth = 7;
    const s = 46+seed*40;
    ctx.beginPath(); ctx.moveTo(-s,-s); ctx.lineTo(s,s); ctx.moveTo(s,-s); ctx.lineTo(-s,s); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth=4;
    ctx.strokeRect(-s,-s,s*2,s*2);
  } else if(type==="mountains"){
    const peak = 160+seed*220, half = 110+seed*90;
    ctx.fillStyle = `rgba(70,55,45,${(0.35+seed*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(-half,0); ctx.lineTo(0,-peak); ctx.lineTo(half,0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath(); ctx.moveTo(-half*0.18,-peak*0.72); ctx.lineTo(0,-peak); ctx.lineTo(half*0.18,-peak*0.72); ctx.closePath(); ctx.fill();
  } else if(type==="desert"){
    const rx = 70+seed*70, ry = 20+seed*16;
    ctx.fillStyle = `rgba(150,110,60,${(0.3+seed*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2); ctx.fill();
    if(seed>0.6){
      ctx.strokeStyle = "rgba(90,160,90,0.5)"; ctx.lineWidth=6; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(0,4); ctx.lineTo(0,-40-seed*30); ctx.moveTo(0,-24); ctx.lineTo(-16,-38); ctx.moveTo(0,-14); ctx.lineTo(16,-28); ctx.stroke();
    }
  } else if(type==="meadow"){
    ctx.strokeStyle = "rgba(120,255,150,0.45)"; ctx.lineWidth=4; ctx.lineCap="round";
    for(let i=-1;i<=1;i++){
      ctx.beginPath(); ctx.moveTo(i*8,8); ctx.lineTo(i*10,-18-seed*18); ctx.stroke();
    }
    if(seed>0.55){
      ctx.fillStyle = accent+"88";
      ctx.beginPath(); ctx.arc(0,-24-seed*10,7,0,Math.PI*2); ctx.fill();
    }
  } else if(type==="hex"){
    const r = 26+seed*30;
    ctx.strokeStyle = accent+"50"; ctx.lineWidth=3;
    ctx.beginPath();
    for(let i=0;i<=6;i++){ const a=i/6*Math.PI*2; const px=Math.cos(a)*r, py=Math.sin(a)*r; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); }
    ctx.stroke();
  } else if(type==="dragstrip"){
    ctx.fillStyle = seed>0.5 ? "rgba(255,246,79,0.4)" : "rgba(255,255,255,0.15)";
    ctx.fillRect(-6,-30,12,60);
  } else if(type==="cones"){
    ctx.fillStyle = "rgba(255,140,40,0.55)";
    ctx.beginPath(); ctx.moveTo(0,-30-seed*10); ctx.lineTo(14,10); ctx.lineTo(-14,10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-14,0,28,6);
  } else if(type==="grandstand"){
    const bw = 100+seed*80, bh = 44+seed*20;
    ctx.fillStyle = "rgba(40,30,30,0.5)";
    ctx.fillRect(-bw/2,-bh,bw,bh);
    ctx.fillStyle = accent+"40";
    for(let i=0;i<bw/14;i++){ if(bgHash(seed*71+i,i*3.3)>0.55) ctx.fillRect(-bw/2+6+i*14,-bh+8,6,8); }
  }
  ctx.restore();
}

/* =========================================================================
   CAR (physics + state) — used for both player and AI, AI uses a
   simplified subset of the update logic.
========================================================================= */
class Car{
  constructor({carId, equipped, cosmetics, isPlayer, color}){
    this.carId = carId;
    this.equipped = equipped;
    this.cosmetics = cosmetics;
    this.isPlayer = !!isPlayer;
    this.colorOverride = color || null;
    this.runUpgrades = [];
    this.runFlags = {};

    this.x=0; this.y=0; this.angle=0;
    this.vx=0; this.vy=0;
    this.speed=0;
    this.driftAngle=0;
    this.isDrifting=false;
    this.driftDuration=0;
    this.driftScore=0;
    this.driftCombo=1;
    this.nitroAmount=100;
    this.nitroActive=false;

    this.lap=0;
    this.nextCP=1;
    this.finished=false;
    this.finishTime=0;

    this.health = HEALTH_MAX;
    this.collisionStun = 0;
    this.lastDamage = 0;
    this.wrecked = false;
    this.mass = 1;
    // Universal NOS cycle — every rival bursts nitro right at race start,
    // then repeats wait(nosN seconds) -> burst(nosN/5 seconds) -> wait -> burst...
    // nosN is this rival's own fixed personality (1-20), so different rivals
    // burst at different rhythms.
    this.nosN = 1 + Math.floor(Math.random()*20); // integer 1-20 inclusive
    this.nosActive = true; // bursts immediately at t=0
    this.nosTimer = this.nosN/5;
    this.laneBias = Math.random()*2 - 1; // -1..1, this car's fixed preferred side of the road
    this.lastRubberBoost = 1;
    this.rubberBoostSmoothed = 1;
    this.rubberQuarterIndex = -1; // forces a recompute the first time updateAI runs
    this.lockedTargetBoost = 1;
    this.rubberbandFactor = 0.75 + Math.random()*0.6; // 0.75-1.35, this rival's individual rubberband strength

    this.recompute();
  }

  // Damaged cars lose top speed — 100% health = full speed, 0% health = 55% of max.
  effectiveMaxSpeed(){
    const mult = 0.55 + 0.45*Util.clamp((this.health!==undefined?this.health:HEALTH_MAX)/HEALTH_MAX, 0, 1);
    return this.maxSpeed*mult;
  }

  recompute(){
    this.stats = ComponentManager.computeStats(this.carId, this.equipped, this.runUpgrades);
    this.visual = ComponentManager.buildVisual(this.carId, this.equipped, this.cosmetics, this.runFlags);
    if(this.colorOverride){ this.visual.primaryColor = this.colorOverride; }
    // physics parameters derived from abstract stats
    const s = this.stats;
    this.maxSpeed = 210 + s.speed*4.2;
    this.accelForce = (170 + s.acceleration*4.4) / (1+ s.weight/220);
    this.brakeForce = 220 + s.braking*4;
    this.turnRate = 1.9 + s.handling*0.022;
    this.gripFactor = 0.12 + s.grip*0.011;
    this.driftGripFactor = 0.02 + Math.max(0,(100-s.drift))*0.0009;
    this.nitroMax = 80 + s.nitro*0.6;
    if(this.nitroAmount>this.nitroMax) this.nitroAmount=this.nitroMax;
  }

  applyUpgrade(upgrade){
    this.runUpgrades.push(upgrade);
    if(upgrade.visualFlag) this.runFlags[upgrade.visualFlag]=true;
    this.recompute();
  }

  resetForNewRun(){
    this.runUpgrades=[]; this.runFlags={}; this.driftScore=0; this.driftCombo=1;
    this.lap=0; this.nextCP=1; this.finished=false; this.nitroAmount=this.nitroMax||80;
    this.health=HEALTH_MAX; this.collisionStun=0; this.lastDamage=0;
    this.recompute();
  }

  placeAt(pos, angle){
    this.x=pos.x; this.y=pos.y; this.angle=angle; this.vx=0; this.vy=0; this.speed=0;
  }

  // Full arcade physics for the player car
  updatePlayer(dt, input, particles, others){
    if(this.wrecked){
      // No control at all once wrecked — the car just coasts to a stop.
      this.vx *= 0.9; this.vy *= 0.9;
      this.x += this.vx*dt; this.y += this.vy*dt;
      this.speed = Math.hypot(this.vx,this.vy);
      this.isDrifting = false; this.nitroActive = false;
      return;
    }
    if(this.collisionStun>0) this.collisionStun = Math.max(0, this.collisionStun-dt);
    const stunned = this.collisionStun>0;

    const forward = {x:Math.sin(this.angle), y:-Math.cos(this.angle)};
    const speed = Math.hypot(this.vx,this.vy);
    this.speed = speed;

    // Slipstream — tuck in close behind another car (AI or, in principle,
    // any car) and get a speed-cap bonus, same idea as the AI's slipstream style.
    this.isDraft = false;
    if(others){
      const drafting = others.some(o=>{
        if(o===this) return false;
        const dx=o.x-this.x, dy=o.y-this.y;
        const dist = Math.hypot(dx,dy);
        if(dist>170 || dist<6) return false;
        const dot = (dx*forward.x+dy*forward.y)/dist;
        return dot>0.75; // mostly directly ahead
      });
      this.isDraft = drafting;
    }

    // Steering — sharper at low speed for maneuverability, more stable at high speed
    const speedFactor = Util.clamp(speed/120, 0.35, 1);
    this.angle += input.steer * this.turnRate * speedFactor * dt * (stunned?0.5:1);

    // Throttle / brake — reduced while stunned, simulating a car that just got hit
    const accelMult = (stunned ? 0.35 : 1) * (this.isDraft ? 1.12 : 1);
    if(input.throttle){
      this.vx += forward.x*this.accelForce*accelMult*dt;
      this.vy += forward.y*this.accelForce*accelMult*dt;
    }
    if(input.brake){
      const dot = this.vx*forward.x + this.vy*forward.y;
      if(dot>10){ // moving forward -> brake
        this.vx -= forward.x*this.brakeForce*dt;
        this.vy -= forward.y*this.brakeForce*dt;
      } else { // reverse
        this.vx -= forward.x*this.accelForce*0.55*dt;
        this.vy -= forward.y*this.accelForce*0.55*dt;
      }
    }

    // Nitro
    this.nitroActive = input.nitro && this.nitroAmount>1 && speed>20 && !stunned;
    if(this.nitroActive){
      this.vx += forward.x*260*dt;
      this.vy += forward.y*260*dt;
      this.nitroAmount = Util.clamp(this.nitroAmount - 32*dt, 0, this.nitroMax);
    } else {
      const regenRate = 6;
      this.nitroAmount = Util.clamp(this.nitroAmount + regenRate*dt, 0, this.nitroMax);
    }

    // Drag / natural friction
    const drag = 0.992;
    this.vx *= Math.pow(drag, dt*60);
    this.vy *= Math.pow(drag, dt*60);

    const draftBonus = this.isDraft ? 75 : 0;
    const effMax = this.effectiveMaxSpeed() + draftBonus;
    const newSpeed = Math.hypot(this.vx,this.vy);
    if(newSpeed > effMax + (this.nitroActive?NITRO_SPEED_BONUS:0)){
      const f = (effMax+(this.nitroActive?NITRO_SPEED_BONUS:0))/newSpeed;
      this.vx*=f; this.vy*=f;
    }

    // Grip / drift model — blend velocity direction toward heading each frame.
    // While stunned from a collision, grip is sharply reduced so the impact
    // actually carries the car sideways instead of snapping straight again.
    const velDir = newSpeed>5 ? Math.atan2(this.vx,-this.vy) : this.angle;
    const rawDrift = Util.normalizeAngle(this.angle - velDir);
    this.driftAngle = rawDrift;

    const handbrakeActive = input.handbrake && newSpeed>40;
    const baseGrip = handbrakeActive ? this.driftGripFactor : this.gripFactor;
    const grip = stunned ? baseGrip*0.15 : baseGrip;
    const blended = Util.angleLerp(velDir, this.angle, Util.clamp(grip*dt*60,0,1));
    this.vx = Math.sin(blended)*newSpeed;
    this.vy = -Math.cos(blended)*newSpeed;

    this.isDrifting = handbrakeActive && !stunned && Math.abs(rawDrift) > 0.18 && newSpeed>50;

    if(this.isDrifting){
      this.driftDuration += dt;
      this.driftCombo = 1 + Math.min(this.driftDuration/1.5, 5);
      this.driftScore += newSpeed*Math.abs(rawDrift)*this.driftCombo*dt*0.6;
      if(particles && Math.random()<0.5){
        particles.spawnSmoke(this.x - forward.x*20, this.y - forward.y*20,
          this.visual.cometSmoke ? "rgba(90,190,255," : undefined);
      }
      // drift-generated nitro
      const bonus = this.visual.driftSmokeBonus ? 22 : 14;
      const nitroPart = ComponentManager.getPart("nitro", this.equipped.nitro);
      const genMult = (nitroPart && nitroPart.driftRegen) ? 2 : 1;
      this.nitroAmount = Util.clamp(this.nitroAmount + bonus*genMult*dt, 0, this.nitroMax);
    } else {
      this.driftDuration = 0;
      this.driftCombo = 1;
    }

    this.x += this.vx*dt;
    this.y += this.vy*dt;
  }

  // Pursuit steering for AI, shaped by this car's aiStyle ("line" is the plain baseline):
  //  - corner_hugger: bites the inside of the upcoming corner for a tighter line
  //  - slipstream: drafts behind a nearby car ahead for a speed bonus
  //  - aggressive: pushes corner speed harder (more prone to clipping walls) and shoulder-checks rivals it gets close to
  //  - berserker: the more damaged it gets, the faster and more reckless it drives
  //  - rubberband: speeds up when trailing the player, eases off when far ahead — keeps the race close
  //  - blocker: when the player is closing in from behind, weaves its line to block the pass
  //  - nitro_burst: fires unpredictable timed speed bursts, like pulsing nitro
  //  - tank: heavy — barely budges in a collision and shoves lighter cars hard (see resolveCarCollisions' mass weighting)
  //  - wall_rider: takes corners wide along the outside and shrugs off wall hits quickly
  updateAI(dt, ctx){
    if(this.wrecked){
      this.vx *= 0.9; this.vy *= 0.9;
      this.x += this.vx*dt; this.y += this.vy*dt;
      this.speed = Math.hypot(this.vx,this.vy);
      this.isDraft = false;
      return;
    }
    if(this.collisionStun>0) this.collisionStun = Math.max(0, this.collisionStun-dt);
    if(this.collisionStun>0){
      // Freewheel while stunned so a hit actually carries the car off-line
      // for a moment instead of it snapping straight back onto its route.
      this.x += this.vx*dt; this.y += this.vy*dt;
      this.vx *= 0.95; this.vy *= 0.95;
      this.speed = Math.hypot(this.vx,this.vy);
      this.isDraft = false;
      return;
    }

    let target = ctx.target;
    let speedMult = ctx.skill;
    const style = this.aiStyle || "line";
    const player = ctx.others ? ctx.others.find(o=>o.isPlayer) : null;

    if(style==="corner_hugger" && ctx.track){
      target = cornerHugTarget(ctx.track, this, target, 1);
    }
    if(style==="wall_rider" && ctx.track){
      target = cornerHugTarget(ctx.track, this, target, -0.85);
    }

    if(style==="aggressive"){
      speedMult *= 1.14; // carries more speed into corners — occasionally clips the wall as a result
    }

    if(style==="berserker"){
      // The lower its health, the harder it pushes — desperate, reckless driving.
      const rage = 1 + (1 - Util.clamp(this.health,0,HEALTH_MAX)/HEALTH_MAX) * 0.65;
      speedMult *= rage;
    }

    // Rubberbanding — exponential AND front-loaded, only when this rival is
    // behind its reference car. The sqrt on diffFrac means the response is
    // already strong at a SMALL gap, not just once a rival is badly behind.
    // Capped at 2.5 "laps behind" purely as a numerical safety valve.
    //
    // The TARGET is only recomputed when this rival crosses into a new
    // quarter of the track (not every frame) — so it holds a pace for a
    // real stretch of track, meaning there are genuine windows where it's
    // ahead and windows where it's behind, rather than continuously
    // micro-correcting to stay glued to its reference. The smoothing below
    // still runs every frame so motion stays fluid between those updates.
    //
    // Reference car depends on style (RUBBERBAND_TARGET): antagonist styles
    // pace off the player specifically; racer styles pace off whoever is
    // actually in 1st place. Each rival also has its own fixed strength
    // modifier (rubberbandFactor) so two rivals of the same style don't
    // rubberband identically.
    if(ctx.track){
      const cpLen = ctx.track.checkpoints.length;
      const quarterSize = Math.max(1, Math.floor(cpLen/4));
      const currentQuarter = Math.floor(this.nextCP/quarterSize);
      if(currentQuarter !== this.rubberQuarterIndex){
        this.rubberQuarterIndex = currentQuarter;
        const refStyle = RUBBERBAND_TARGET[style] || "player";
        const refCar = refStyle==="player" ? player : (ctx.leader || player);
        let newTarget = 1;
        if(refCar && refCar!==this){
          const myProgress = this.lap*cpLen + this.nextCP;
          const refProgress = refCar.lap*cpLen + refCar.nextCP;
          const diff = refProgress - myProgress; // positive = reference car ahead (this car is behind)
          const diffFrac = Util.clamp(diff/cpLen, 0, 2.5); // 0 whenever this car is level or ahead
          const base = (style==="rubberband" ? 35 : 22) * this.rubberbandFactor;
          newTarget = Math.pow(base, Math.sqrt(diffFrac));
        }
        this.lockedTargetBoost = newTarget;
      }
    }
    const targetBoost = this.lockedTargetBoost;
    const prevBoost = this.rubberBoostSmoothed || 1;
    const rampRate = targetBoost>prevBoost ? 8 : 0.55; // fast to engage, slow to fade
    const rubberBoost = prevBoost + (targetBoost-prevBoost)*Util.clamp(rampRate*dt,0,1);
    this.rubberBoostSmoothed = rubberBoost;
    speedMult *= rubberBoost;
    this.lastRubberBoost = rubberBoost;

    if(style==="blocker" && player){
      const dx = player.x-this.x, dy = player.y-this.y;
      const dist = Math.hypot(dx,dy);
      const fwd = {x:Math.sin(this.angle), y:-Math.cos(this.angle)};
      const behindDot = dx*fwd.x + dy*fwd.y; // negative if player is behind this car
      if(dist<320 && behindDot<0){
        const perp = {x:-fwd.y, y:fwd.x};
        const lateral = dx*perp.x + dy*perp.y;
        const shift = Util.clamp(lateral*0.55, -70, 70);
        target = {x:target.x+perp.x*shift, y:target.y+perp.y*shift};
      }
    }

    // Universal NOS cycle — every rival, regardless of style, bursts nitro
    // right at race start and then repeats wait(nosN seconds) ->
    // burst(nosN/5 seconds) indefinitely, using its own fixed nosN (1-20).
    // OVERDRIVE gets a stronger burst as its signature trait, but every
    // rival now does this.
    this.nosTimer -= dt;
    if(this.nosActive){
      if(this.nosTimer<=0){
        this.nosActive = false;
        this.nosTimer = this.nosN;
      }
    } else if(this.nosTimer<=0){
      this.nosActive = true;
      this.nosTimer = this.nosN/5;
    }
    if(this.nosActive){
      speedMult *= (style==="nitro_burst" ? 1.7 : 1.4);
      this.nitroActive = true;
      if(ctx.particles && Math.random()<0.4){
        ctx.particles.spawnSpark(this.x-Math.sin(this.angle)*24, this.y+Math.cos(this.angle)*24, "rgba(255,140,60,");
      }
    } else {
      this.nitroActive = false;
    }

    this.isDraft = false;
    if(style==="slipstream" && ctx.others){
      const fwd = {x:Math.sin(this.angle), y:-Math.cos(this.angle)};
      const drafting = ctx.others.some(o=>{
        if(o===this) return false;
        const dx=o.x-this.x, dy=o.y-this.y;
        const dist = Math.hypot(dx,dy);
        if(dist>140 || dist<6) return false;
        const dot = (dx*fwd.x+dy*fwd.y)/dist;
        return dot>0.72; // mostly directly ahead
      });
      if(drafting){ speedMult *= 1.25; this.isDraft = true; }
    }

    if(style==="aggressive" && ctx.others){
      ctx.others.forEach(o=>{
        if(o===this) return;
        const dx=o.x-this.x, dy=o.y-this.y;
        const dist = Math.hypot(dx,dy) || 1;
        if(dist<50){
          const push = (50-dist)*2.4;
          o.vx += (dx/dist)*push; o.vy += (dy/dist)*push;
          this.vx -= (dx/dist)*push*0.35; this.vy -= (dy/dist)*push*0.35;
          if(ctx.particles) ctx.particles.spawnSpark((this.x+o.x)/2,(this.y+o.y)/2,"rgba(255,80,80,");
        }
      });
    }

    if(ctx.track){
      const toTarget = {x:target.x-this.x, y:target.y-this.y};
      const segLen = Math.hypot(toTarget.x,toTarget.y) || 1;
      const perp = {x:-toTarget.y/segLen, y:toTarget.x/segLen};
      const biasAmount = ctx.track.roadWidth*0.22*this.laneBias;
      target = {x:target.x+perp.x*biasAmount, y:target.y+perp.y*biasAmount};
    }

    // Launch boost — real racing-game AI gets a bit of a head start off the
    // line to offset human reaction time/optimal launch technique; without
    // it, rivals feel like they're stuck in neutral for the first few
    // seconds while the player rockets past the whole field.
    if(ctx.raceTime!==undefined && ctx.raceTime<3.5){
      speedMult *= 1 + (3.5-ctx.raceTime)/3.5*0.45;
    }

    const dx = target.x-this.x, dy = target.y-this.y;
    const desiredAngle = Math.atan2(dx, -dy);
    this.angle = Util.angleLerp(this.angle, desiredAngle, Util.clamp(3.4*Math.sqrt(rubberBoost)*dt,0,1));
    let targetSpeed = this.effectiveMaxSpeed()*1.14*speedMult;

    // Nitro-tension mechanic — when this rival is genuinely riding alongside
    // the player (close by AND mostly beside rather than ahead/behind), its
    // speed is hard-capped at the player's own top speed plus half the
    // nitro boost. That means a straight-up drag race can only be won by
    // actually using NOS — matching speed alone isn't enough to get past.
    if(player){
      const pdx = this.x-player.x, pdy = this.y-player.y;
      const pdist = Math.hypot(pdx,pdy);
      if(pdist<260){
        const pFwd = {x:Math.sin(player.angle), y:-Math.cos(player.angle)};
        const forwardComp = pdx*pFwd.x + pdy*pFwd.y;
        const lateralComp = Math.hypot(pdx-forwardComp*pFwd.x, pdy-forwardComp*pFwd.y);
        if(Math.abs(forwardComp)<130 && lateralComp>15){
          const nosThreshold = player.effectiveMaxSpeed() + NITRO_SPEED_BONUS*0.5;
          targetSpeed = Math.min(targetSpeed, nosThreshold);
        }
      }
    }

    this.speed = Util.lerp(this.speed, targetSpeed, Util.clamp(4.2*rubberBoost*dt,0,1));
    const forward = {x:Math.sin(this.angle), y:-Math.cos(this.angle)};
    this.x += forward.x*this.speed*dt;
    this.y += forward.y*this.speed*dt;
    this.vx = forward.x*this.speed; this.vy = forward.y*this.speed;
  }
}

// Nudges an AI's aim point toward the inside of the upcoming corner (factor>0,
// used by corner_hugger) or wide toward the outside (factor<0, used by
// wall_rider), so either style visibly drives a different line than the
// plain center-of-road pursuit. Magnitude is capped so it stays a "different
// line" rather than driving the AI onto (or off) the track entirely.
function cornerHugTarget(track, car, target, factor){
  const cps = track.checkpoints;
  const nextIdx = (car.nextCP+1) % cps.length;
  const afterTarget = cps[nextIdx];
  const toTarget = {x:target.x-car.x, y:target.y-car.y};
  const afterTurn = {x:afterTarget.x-target.x, y:afterTarget.y-target.y};
  const cross = toTarget.x*afterTurn.y - toTarget.y*afterTurn.x;
  const turnSign = cross>0 ? 1 : -1;
  const segLen = Math.hypot(toTarget.x,toTarget.y) || 1;
  const perp = {x:-toTarget.y/segLen, y:toTarget.x/segLen};
  const hug = Util.clamp(track.roadWidth*0.14, 12, 40) * factor;
  return {x: target.x - perp.x*turnSign*hug, y: target.y - perp.y*turnSign*hug};
}

/* =========================================================================
   RACE MANAGER
========================================================================= */
class RaceManager{
  constructor(track, player, aiList, totalLaps){
    this.track = track;
    this.player = player;
    this.aiList = aiList;
    this.totalLaps = totalLaps;
    this.allCars = [player, ...aiList];
    this.checkpointRadius = 260;
    this.raceFinished = false;
    this.correctAnswers = 0;
    this.elapsedTime = 0;

    // Random grid order each race — who gets pole position vs the back row
    // is shuffled independently of car array order (which other logic like
    // position sorting doesn't care about anyway).
    const gridOrder = Util.sample(this.allCars, this.allCars.length);
    const laneOffset = Math.min(120, track.roadWidth*0.26); // fixed per column — does NOT grow with row
    const rowSpacing = 190; // real bumper-to-bumper gap between rows
    gridOrder.forEach((c,i)=>{
      const p = track.startPoint;
      const row = Math.floor(i/2);
      const side = (i%2===0 ? -1 : 1);
      const back = row*rowSpacing + 60;
      const lateral = side*laneOffset;
      const dirX = Math.sin(track.startAngle), dirY = -Math.cos(track.startAngle);
      const perpX = Math.cos(track.startAngle), perpY = Math.sin(track.startAngle);
      c.placeAt({x:p.x - dirX*back + perpX*lateral, y:p.y - dirY*back + perpY*lateral}, track.startAngle);
      c.lap=0; c.nextCP=1; c.finished=false;
    });
  }

  updateProgress(car){
    const cps = this.track.checkpoints;
    const n = cps.length;
    // Look ahead across a window of upcoming checkpoints, not just the very
    // next one — driving through the pit lane (or cutting any shortcut)
    // rejoins the main track well past the car's current checkpoint index,
    // so checking only that one exact point left lap/position tracking
    // permanently stuck. Take the FURTHEST reachable checkpoint in range so
    // the car catches all the way up in one go instead of trickling forward
    // one checkpoint per frame.
    const lookahead = Math.min(60, n-1);
    let matchedK = -1;
    for(let k=lookahead;k>=0;k--){
      const idx = (car.nextCP+k) % n;
      const d = Util.dist(car.x,car.y,cps[idx].x,cps[idx].y);
      if(d < this.checkpointRadius){ matchedK = k; break; }
    }
    if(matchedK>=0){
      const advance = matchedK+1;
      const newIndexRaw = car.nextCP + advance;
      const wraps = Math.floor(newIndexRaw/n);
      car.nextCP = newIndexRaw % n;
      if(wraps>0){
        car.lap += wraps;
        if(car===this.player && !this.raceFinished){
          if(car.lap>=this.totalLaps){
            this.raceFinished = true;
            car.finished = true;
          } else {
            return "lap_complete";
          }
        } else if(car.lap>=this.totalLaps){
          car.finished = true;
        }
      }
    }
    return null;
  }

  getTargetPoint(car){
    return this.track.checkpoints[car.nextCP];
  }

  getPositions(){
    const scored = this.allCars.map(c=>{
      const cps=this.track.checkpoints;
      const target = cps[c.nextCP];
      const d = Util.dist(c.x,c.y,target.x,target.y);
      const progress = c.lap*cps.length + c.nextCP - Util.clamp(d/2000,0,0.99);
      return {car:c, progress};
    });
    scored.sort((a,b)=>b.progress-a.progress);
    return scored.map(s=>s.car);
  }

  playerPosition(){
    const order = this.getPositions();
    return order.indexOf(this.player)+1;
  }
}

/* =========================================================================
   UPGRADE MANAGER
========================================================================= */
const UpgradeManager = (function(){
  function offerChoices(car, count){
    const available = CONFIG.UPGRADES.filter(u=> !car.runUpgrades.find(ru=>ru.id===u.id));
    return Util.sample(available.length? available : CONFIG.UPGRADES, Math.min(count, available.length||CONFIG.UPGRADES.length));
  }
  return {offerChoices};
})();

/* =========================================================================
   GAME — orchestrates screens, main loop, garage & race flow
========================================================================= */
const Game = (function(){
  let state = "MENU"; // MENU, GARAGE, RACE, PAUSED_QUESTION, PAUSED_UPGRADE, RESULTS
  let save = null;
  let track = null, race = null, particles = null;
  let raceCanvas, raceCtx, garageCanvas, garageCtx;
  let lastTime = 0;
  let countdownVal = 0, countingDown=false;
  let wallShake = 0;
  let wreckEndTimer = 0;
  let playerWreckedShown = false;
  let lbUpdateTimer = 0;
  let garagePreviewCategory = null; // {cat, partId} while previewing
  let currentTab = "car";
  let currentPerfCat = "engine";
  let selectedRaceType = "single";
  let grandPrix = null;
  let resultsAction = null;

  function el(id){ return document.getElementById(id); }

  async function init(){
    save = SaveManager.load();
    raceCanvas = el("raceCanvas");
    raceCtx = raceCanvas.getContext("2d");
    garageCanvas = el("garageCanvas");
    garageCtx = garageCanvas.getContext("2d");
    resizeRaceCanvas();
    window.addEventListener("resize", resizeRaceCanvas);
    InputManager.bindTouchControls(el("touchControls"));
    document.addEventListener("visibilitychange",()=>{if(document.hidden)InputManager.clearTouch();});

    el("btnPlay").addEventListener("click", ()=>{ showScreen("GARAGE"); });
    el("btnGarageFromMenu").addEventListener("click", ()=> showScreen("GARAGE"));
    el("btnBackToMenu").addEventListener("click", ()=> showScreen("MENU"));
    el("btnGoRace").addEventListener("click", ()=>selectedRaceType==="grand-prix"?startGrandPrix():openTrackSelect());
    el("btnToGarage").addEventListener("click", ()=>{ el("modalResults").classList.remove("active");if(resultsAction){const action=resultsAction;resultsAction=null;action();}else showScreen("MENU"); });
    el("btnCancelPreview").addEventListener("click", cancelPreview);
    el("btnEquipBuy").addEventListener("click", equipOrBuy);

    document.querySelectorAll(".tab-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        currentTab = btn.dataset.tab;
        garagePreviewCategory = null;
        renderGaragePanel();
      });
    });
    document.querySelectorAll("[data-race-type]").forEach(button=>button.addEventListener("click",()=>{
      selectedRaceType=button.dataset.raceType;
      document.querySelectorAll("[data-race-type]").forEach(item=>item.classList.toggle("active",item===button));
      el("raceTypeDescription").textContent=selectedRaceType==="grand-prix"
        ? "Race four different random tracks. Every racer’s score carries into the final championship placing."
        : "Choose a track and compete in one race.";
      el("btnGoRace").textContent=selectedRaceType==="grand-prix"?"🏆 START GRAND PRIX":"🏁 START RACE";
    }));

    window.addEventListener("arcade-coins-changed", updateCurrencyDisplays);
    updateCurrencyDisplays();
    renderGaragePanel();
    renderGaragePreview();
    showScreen("MENU");
    const bankResult = await window.QuestionManager.loadCurrentBank("multichoice");
    const status = el("classStatus");
    if(bankResult.ok){
      status.textContent = `Class questions ready: ${window.QuestionManager.getBankName()}`;
      el("btnPlay").disabled = false;
    }else{
      status.textContent = bankResult.error === "class-code-required"
        ? "Please enter your class code on the Arcade Academy Hub."
        : "This class does not have compatible questions for this game.";
    }
    initHomeBackdrop();
    registerChallengeAdapter();
    requestAnimationFrame(loop);
  }

  function resizeRaceCanvas(){
    raceCanvas.width = window.innerWidth;
    raceCanvas.height = window.innerHeight;
  }

  function showScreen(s){
    if(s!=="RACE") InputManager.clearTouch();
    document.querySelectorAll(".screen").forEach(sc=>sc.classList.remove("active"));
    if(s==="MENU"){
      el("screen-menu").classList.add("active");
      updateHomeStats();
    }
    if(s==="GARAGE"){ el("screen-garage").classList.add("active"); renderGaragePanel(); renderGaragePreview(); updateCurrencyDisplays(); }
    if(s==="RACE") el("screen-race").classList.add("active");
    state = s;
  }

  function updateCurrencyDisplays(){
    const coins = window.PlatformManager?.getCoins?.() || 0;
    el("garageCurrency").textContent = "🪙 " + Util.fmt(coins) + " coins";
    el("raceCurrency").textContent = "🪙 " + Util.fmt(coins) + " coins";
    if(el("homeCoins")) el("homeCoins").textContent = Util.fmt(coins);
  }

  function updateHomeStats(){
    const stats = window.PlatformManager?.getGameStats?.(window.GAME_CONFIG.id) || {};
    el("homeRaces").textContent = Util.fmt(save.stats.totalRaces || stats.gamesPlayed || 0);
    el("homeWins").textContent = Util.fmt(save.stats.totalWins || 0);
    el("homeHighScore").textContent = Util.fmt(stats.highScore || 0);
    updateCurrencyDisplays();
  }

  function activeCosmetics(base){
    const next={...base};
    const equipped=window.AchievementManager?.getEquipped?.(window.GAME_CONFIG.id) || {};
    if(equipped.skin?.id==="drift-discovery_academy_blue_racer"){next.primary="#2458a6";next.secondary="#4fe3ff";}
    if(equipped.wheels?.id==="drift-discovery_neon_tyres") next.wheelColor="#4fe3ff";
    if(equipped.trail?.id==="drift-discovery_comet_drift_smoke") next.cometSmoke=true;
    if(equipped.nitro?.id==="drift-discovery_gold_nitro") next.goldNitro=true;
    if(equipped.livery?.id==="drift-discovery_champion_livery"){next.stripes="racing";next.number=1;next.secondary="#ffd15c";}
    return next;
  }

  /* ---------------- GARAGE ---------------- */

  function buildPlayerCarObject(){
    const carDef = ComponentManager.getCar(save.currentCarId);
    return {carDef, equipped: save.equipped, cosmetics: activeCosmetics(save.cosmetics)};
  }

  function renderGaragePreview(previewOverride){
    garageCtx.clearRect(0,0,garageCanvas.width,garageCanvas.height);
    const equipped = Object.assign({}, save.equipped);
    let cosmetics = activeCosmetics(save.cosmetics);
    if(previewOverride && previewOverride.cat){
      equipped[previewOverride.cat] = previewOverride.partId;
    }
    if(previewOverride && previewOverride.cosmeticKey){
      cosmetics = Object.assign({}, activeCosmetics(save.cosmetics));
      cosmetics[previewOverride.cosmeticKey] = previewOverride.cosmeticValue;
    }
    const carId = (previewOverride && previewOverride.carId) || save.currentCarId;
    const vm = ComponentManager.buildVisual(carId, equipped, cosmetics, {});
    garageCtx.save();
    garageCtx.translate(garageCanvas.width/2, garageCanvas.height/2);
    CarRenderer.draw(garageCtx, vm, {scale: 3.3, isDrifting:false, nitroActive:false});
    garageCtx.restore();
    el("garageCarName").textContent = ComponentManager.getCar(carId).name;
  }

  function statsForEquipped(equippedOverride, carIdOverride){
    const carId = carIdOverride || save.currentCarId;
    const equipped = equippedOverride || save.equipped;
    return ComponentManager.computeStats(carId, equipped, []);
  }

  function renderGaragePanel(){
    const catRow = el("perfCatRow");
    const partList = el("partList");
    const statCompare = el("statCompare");
    const actionRow = el("actionRow");
    catRow.innerHTML = ""; partList.innerHTML = ""; statCompare.innerHTML="";
    actionRow.style.display = "none";

    if(currentTab === "car"){
      catRow.style.display="none";
      CONFIG.CARS.forEach(car=>{
        const unlocked = save.unlockedCars.includes(car.id);
        const isCurrent = car.id===save.currentCarId;
        const card = document.createElement("div");
        card.className = "part-card" + (isCurrent?" equipped":"") + (!unlocked?" locked":"");
        card.innerHTML = `<div class="part-card-top"><span class="part-name">${car.name}</span>
          <span class="${unlocked?'part-tag':'part-cost'}">${isCurrent?'EQUIPPED': unlocked?'OWNED':('💰 '+car.cost)}</span></div>`;
        card.addEventListener("click", ()=>{
          renderGaragePreview({carId: car.id});
          renderCarStatCompare(car.id);
          actionRow.style.display="flex";
          el("btnEquipBuy").textContent = isCurrent ? "EQUIPPED" : (unlocked?"SELECT":"BUY & SELECT");
          el("btnEquipBuy").disabled = isCurrent || (!unlocked && PlatformManager.getCoins()<car.cost);
          el("btnEquipBuy").onclick = ()=>{
            if(!unlocked){
              if(!PlatformManager.spendCoins(car.cost)) return;
              save.unlockedCars.push(car.id);
            }
            save.currentCarId = car.id;
            SaveManager.save();
            garagePreviewCategory=null;
            renderGaragePanel(); renderGaragePreview(); updateCurrencyDisplays();
          };
        });
        partList.appendChild(card);
      });
      return;
    }

    if(currentTab === "paint"){
      catRow.style.display="none";
      partList.innerHTML = `
        <div class="paint-section-title">PRIMARY COLOUR</div>
        <div class="swatch-row" id="swatchPrimary"></div>
        <div class="paint-section-title">SECONDARY COLOUR</div>
        <div class="swatch-row" id="swatchSecondary"></div>
        <div class="paint-section-title">WHEEL COLOUR</div>
        <div class="swatch-row" id="swatchWheel"></div>
        <div class="paint-section-title">STRIPES</div>
        <div class="cat-row" id="stripeRow"></div>
        <div class="paint-section-title">CAR NUMBER</div>
        <div style="padding:10px 12px;"><input class="number-input" id="numberInput" type="number" min="0" max="99" value="${save.cosmetics.number}"></div>
      `;
      buildSwatches("swatchPrimary", CONFIG.COSMETICS.primary, save.cosmetics.primary, v=>{ save.cosmetics.primary=v; SaveManager.save(); renderGaragePreview(); renderGaragePanel(); });
      buildSwatches("swatchSecondary", CONFIG.COSMETICS.secondary, save.cosmetics.secondary, v=>{ save.cosmetics.secondary=v; SaveManager.save(); renderGaragePreview(); renderGaragePanel(); });
      buildSwatches("swatchWheel", CONFIG.COSMETICS.wheelColor, save.cosmetics.wheelColor, v=>{ save.cosmetics.wheelColor=v; SaveManager.save(); renderGaragePreview(); renderGaragePanel(); });
      const stripeRow = el("stripeRow");
      CONFIG.COSMETICS.stripes.forEach(s=>{
        const b = document.createElement("button");
        b.className = "cat-btn"+(save.cosmetics.stripes===s?" active":"");
        b.textContent = s.toUpperCase();
        b.addEventListener("click", ()=>{ save.cosmetics.stripes=s; SaveManager.save(); renderGaragePreview(); renderGaragePanel(); });
        stripeRow.appendChild(b);
      });
      el("numberInput").addEventListener("change", e=>{
        let v = parseInt(e.target.value); if(isNaN(v)) v=0; v=Util.clamp(v,0,99);
        save.cosmetics.number=v; SaveManager.save(); renderGaragePreview();
      });
      return;
    }

    // PERFORMANCE tab
    catRow.style.display="flex";
    const cats = Object.keys(CONFIG.PARTS);
    cats.forEach(cat=>{
      const b = document.createElement("button");
      b.className = "cat-btn"+(cat===currentPerfCat?" active":"");
      b.textContent = cat.toUpperCase();
      b.addEventListener("click", ()=>{ currentPerfCat=cat; garagePreviewCategory=null; renderGaragePanel(); renderGaragePreview(); });
      catRow.appendChild(b);
    });

    CONFIG.PARTS[currentPerfCat].forEach(part=>{
      const unlocked = save.unlockedParts[currentPerfCat].includes(part.id);
      const isEquipped = save.equipped[currentPerfCat]===part.id;
      const card = document.createElement("div");
      card.className = "part-card"+(isEquipped?" equipped":"")+(!unlocked?" locked":"");
      card.innerHTML = `<div class="part-card-top"><span class="part-name">${part.name}</span>
        <span class="${unlocked?'part-tag':'part-cost'}">${isEquipped?'EQUIPPED':(unlocked?'OWNED':('💰 '+part.cost))}</span></div>`;
      card.addEventListener("click", ()=> previewPart(currentPerfCat, part));
      partList.appendChild(card);
    });

    renderStatCompareForCategory(currentPerfCat, save.equipped[currentPerfCat]);
  }

  function buildSwatches(containerId, colors, current, onPick){
    const c = el(containerId);
    colors.forEach(col=>{
      const s = document.createElement("div");
      s.className = "swatch"+(col===current?" selected":"");
      s.style.background = col;
      s.addEventListener("click", ()=> onPick(col));
      c.appendChild(s);
    });
  }

  function previewPart(cat, part){
    garagePreviewCategory = {cat, partId: part.id};
    renderGaragePreview({cat, partId: part.id});
    renderStatCompareForCategory(cat, part.id);
    const actionRow = el("actionRow");
    actionRow.style.display="flex";
    const unlocked = save.unlockedParts[cat].includes(part.id);
    const isEquipped = save.equipped[cat]===part.id;
    const btn = el("btnEquipBuy");
    btn.textContent = isEquipped ? "EQUIPPED" : (unlocked ? "EQUIP" : `BUY (💰${part.cost})`);
    btn.className = "action-btn " + (unlocked ? "equip" : "buy");
    btn.disabled = isEquipped || (!unlocked && PlatformManager.getCoins()<part.cost);
  }

  function cancelPreview(){
    garagePreviewCategory = null;
    renderGaragePreview();
    el("actionRow").style.display="none";
    renderGaragePanel();
  }

  function equipOrBuy(){
    if(!garagePreviewCategory) return;
    const {cat, partId} = garagePreviewCategory;
    const part = ComponentManager.getPart(cat, partId);
    const unlocked = save.unlockedParts[cat].includes(partId);
    if(!unlocked){
      if(!PlatformManager.spendCoins(part.cost)) return;
      save.unlockedParts[cat].push(partId);
    }
    save.equipped[cat] = partId;
    SaveManager.save();
    garagePreviewCategory = null;
    updateCurrencyDisplays();
    renderGaragePanel();
    renderGaragePreview();
  }

  function renderStatCompareForCategory(cat, previewPartId){
    const currentStats = statsForEquipped();
    const previewEquipped = Object.assign({}, save.equipped);
    previewEquipped[cat] = previewPartId;
    const newStats = statsForEquipped(previewEquipped);
    renderStatBars(currentStats, newStats);
  }

  function renderCarStatCompare(carId){
    const currentStats = statsForEquipped();
    const newStats = statsForEquipped(save.equipped, carId);
    renderStatBars(currentStats, newStats);
  }

  function renderStatBars(currentStats, newStats){
    const box = el("statCompare");
    box.innerHTML = "";
    STAT_KEYS.forEach(key=>{
      const cur = currentStats[key], neu = newStats[key];
      const delta = Math.round(neu-cur);
      const row = document.createElement("div");
      row.className = "stat-row";
      const deltaClass = delta>0?"pos":delta<0?"neg":"zero";
      row.innerHTML = `
        <div class="stat-label">${key}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${Util.clamp(cur,0,160)/1.6}%"></div>
          <div class="bar-fill new" style="width:${Util.clamp(neu,0,160)/1.6}%"></div>
        </div>
        <div class="stat-delta ${deltaClass}">${delta>0?'+':''}${delta}</div>
      `;
      box.appendChild(row);
    });
  }

  /* ---------------- RACE FLOW ---------------- */

  function startGrandPrix(){
    grandPrix={tracks:Util.sample(TRACK_DEFS,4),index:0,scores:{},baseCoins:0,totalCorrect:0};
    startRace(grandPrix.tracks[0]);
  }

  function openTrackSelect(){
    const container = el("trackCards");
    container.innerHTML = "";
    TRACK_DEFS.forEach(def=>{
      const card = document.createElement("div");
      card.className = "track-card";
      card.innerHTML = `
        <div class="track-swatch" style="background:${def.roadColor};border-color:${def.kerbA};"></div>
        <div class="track-name">${def.name}</div>
        <div class="track-desc">${def.desc}</div>
        <div class="track-meta">Road width ${def.roadWidth}</div>
      `;
      card.addEventListener("click", ()=>{
        el("modalTrackSelect").classList.remove("active");
        startRace(def);
      });
      container.appendChild(card);
    });
    el("modalTrackSelect").classList.add("active");
  }

  function startRace(trackDef){
    window.PlatformManager.startSession(window.GAME_CONFIG.id);
    track = new Track(trackDef || TRACK_DEFS[0]);
    particles = new ParticleManager();

    const player = new Car({carId: save.currentCarId, equipped: save.equipped, cosmetics: activeCosmetics(save.cosmetics), isPlayer:true});
    const aiColors = ["#ff6f4f","#4fffb8","#c0c0ff","#a0ff4f","#ff2b2b","#b8b8ff","#ffae42","#ff4fd8","#9a9aa8","#d4ff4f"];
    const aiNames = ["RIVAL: GHOST","RIVAL: THE BULL","RIVAL: ROCKET","RIVAL: VECTOR",
      "RIVAL: BERSERKER","RIVAL: PHANTOM","RIVAL: BLOCKADE","RIVAL: OVERDRIVE","RIVAL: IRONCLAD","RIVAL: OUTLAW"];
    const aiStyles = ["corner_hugger","aggressive","slipstream","line",
      "berserker","rubberband","blocker","nitro_burst","tank","wall_rider"];
    const aiList = aiStyles.map((style,i)=>{
      const carDef = Util.choice(CONFIG.CARS.filter(c=>c.id!==save.currentCarId).concat([ComponentManager.getCar(save.currentCarId)]));
      const equipped = {};
      Object.keys(CONFIG.PARTS).forEach(cat=> equipped[cat]=Util.choice(CONFIG.PARTS[cat]).id);
      const c = new Car({carId: carDef.id, equipped, cosmetics: save.cosmetics, color: aiColors[i]});
      c.aiName = aiNames[i];
      c.aiStyle = style;
      c.skill = 1.02 + Math.random()*0.3;
      if(style==="tank") c.mass = 2.6;
      return c;
    });

    race = new RaceManager(track, player, aiList, 3);
    if(window.AchievementManager?.hasBoost?.("drift-discovery_tuned_start") && !window.PlatformManager.isPracticeMode?.()){
      race.player.nitroAmount = Math.min(race.player.nitroMax, race.player.nitroAmount + race.player.nitroMax * .15);
    }
    player.inPitZone = false;
    wreckEndTimer = 0;
    playerWreckedShown = false;
    el("wreckedBanner").classList.remove("active");
    resetHud();
    showScreen("RACE");
    countingDown = true; countdownVal = 3;
    el("countdown").style.display="flex";
    tickCountdown();
  }

  function tickCountdown(){
    if(countdownVal<=0){
      el("countdown").style.display="none";
      countingDown=false;
      return;
    }
    el("countdown").textContent = countdownVal;
    setTimeout(()=>{ countdownVal--; if(countdownVal===0){ el("countdown").textContent="GO!"; setTimeout(tickCountdown, 500);} else tickCountdown(); }, 800);
  }

  function resetHud(){
    el("hudLap").textContent = (grandPrix?`GP ${grandPrix.index+1}/${grandPrix.tracks.length} · `:"") + "LAP 1/" + race.totalLaps;
    el("hudPos").textContent = "POS 1/" + race.allCars.length;
    el("speedMeter").style.width="0%";
    el("nitroMeter").style.width="100%";
    el("driftScoreVal").textContent="0";
    el("driftComboVal").textContent="";
    const healthBar = el("healthMeter");
    healthBar.style.width="100%";
    healthBar.style.background="linear-gradient(90deg,#4fff9e,#2ab86e)";
    el("draftIndicator").classList.remove("active");
    lbUpdateTimer = 0;
    renderLeaderboard();
  }

  function triggerDamageFlash(){
    const flash = el("damageFlash");
    flash.classList.add("active");
    clearTimeout(triggerDamageFlash._t);
    triggerDamageFlash._t = setTimeout(()=> flash.classList.remove("active"), 180);
  }

  function openPitQuestion(){
    InputManager.clearTouch();
    state = "PAUSED_QUESTION";
    el("questionModalTitle").textContent = "PIT STOP — ANSWER TO REPAIR YOUR CAR";
    const q = window.QuestionManager.getNextQuestion(false);
    if(!q){ state="RACE"; return; }
    el("questionText").textContent = q.q;
    const opts = el("optionsContainer");
    opts.innerHTML = "";
    q.a.forEach((optText, idx)=>{
      const b = document.createElement("button");
      b.className = "option-btn";
      b.textContent = optText;
      b.addEventListener("click", ()=> answerPitQuestion(idx, q, b));
      opts.appendChild(b);
    });
    el("modalQuestion").classList.add("active");
  }

  function answerPitQuestion(idx, q, btnEl){
    const buttons = el("optionsContainer").querySelectorAll(".option-btn");
    buttons.forEach(b=>b.disabled=true);
    const correct = idx===q.c;
    buttons[q.c].classList.add("correct");
    if(!correct) btnEl.classList.add("incorrect");
    if(correct){
      race.correctAnswers++;
      race.player.health = HEALTH_MAX;
      window.AchievementManager?.notify?.("drift_discovery_correct");
    }
    window.QuestionManager.recordAnswer(q, correct);
    window.PlatformManager.recordQuestionAnswered(window.GAME_CONFIG.id, correct);
    setTimeout(()=>{
      el("modalQuestion").classList.remove("active");
      state = "RACE";
    }, 900);
  }

  function endRace(){
    InputManager.clearTouch();
    state = "RESULTS";
    const order = race.getPositions();
    const pos = order.indexOf(race.player)+1;
    const posBonus = [0,300,200,100,50][pos] || 30;
    const driftBonus = Math.floor(race.player.driftScore/40);
    const baseCoins = 100 + posBonus + driftBonus;
    if(grandPrix){
      finishGrandPrixRace(order,pos,posBonus,baseCoins);
      return;
    }
    const settlement = window.PlatformManager.settleAccuracyCoins(window.GAME_CONFIG.id, baseCoins);
    document.querySelector("#modalResults .modal-title").textContent="RACE COMPLETE";
    el("btnToGarage").textContent="RETURN HOME";
    const earned = settlement.coinsAwarded;
    save.stats.totalRaces++;
    if(pos===1) save.stats.totalWins++;
    save.stats.bestDriftScore = Math.max(save.stats.bestDriftScore, Math.round(race.player.driftScore));
    SaveManager.save();
    const score = Math.round(race.player.driftScore) + Math.max(0, (order.length-pos)*1000);
    window.PlatformManager.setHighScore(window.GAME_CONFIG.id, score);
    const driftScore=Math.round(race.player.driftScore);
    window.AchievementManager?.notify?.("drift_race_completed", {facts:{drift_discovery_best_drift:driftScore,mastery_drift_discovery:driftScore>=5000?1:0}, run:{answered:settlement.questionsAnswered,correct:settlement.questionsCorrect}});
    window.ChallengeManager?.finish?.({score,alive:!race.player.wrecked,finished:true});
    window.PlatformManager.endSession(window.GAME_CONFIG.id);

    el("resultsBody").innerHTML = `
      <div class="result-stat"><span>Finish Position</span><span>${pos} / ${order.length}</span></div>
      <div class="result-stat"><span>Drift Score</span><span>${Math.round(race.player.driftScore)}</span></div>
      <div class="result-stat"><span>Correct Answers</span><span>${race.correctAnswers}</span></div>
      <div class="result-stat"><span>Car Condition</span><span>${Math.round(race.player.health/HEALTH_MAX*100)}%</span></div>
      <div class="result-stat"><span>Position Bonus</span><span>+${posBonus}</span></div>
    `;
    el("resultCurrencyEarned").textContent = "+" + Util.fmt(earned) + " coins";
    el("modalResults").classList.add("active");
    updateCurrencyDisplays();
  }

  function championshipName(car){return car===race.player?"YOU":(car.aiName||"RIVAL").replace("RIVAL: ","");}
  function scoreForCar(car,position,total){return Math.round(car.driftScore||0)+Math.max(0,(total-position)*1000);}
  function standingsMarkup(){
    return Object.entries(grandPrix.scores).sort((a,b)=>b[1]-a[1]).map(([name,score],index)=>
      `<div class="result-stat"><span>${index+1}. ${name}</span><span>${Util.fmt(score)}</span></div>`).join("");
  }
  function finishGrandPrixRace(order,pos,posBonus,baseCoins){
    order.forEach((car,index)=>{const name=championshipName(car);grandPrix.scores[name]=(grandPrix.scores[name]||0)+scoreForCar(car,index+1,order.length);});
    grandPrix.baseCoins+=baseCoins;
    grandPrix.totalCorrect+=race.correctAnswers;
    save.stats.totalRaces++;
    if(pos===1)save.stats.totalWins++;
    const driftScore=Math.round(race.player.driftScore);
    save.stats.bestDriftScore=Math.max(save.stats.bestDriftScore,driftScore);SaveManager.save();
    window.AchievementManager?.notify?.("drift_race_completed",{facts:{drift_discovery_best_drift:driftScore,mastery_drift_discovery:driftScore>=5000?1:0}});
    const completed=grandPrix.index+1;
    const isFinal=completed>=grandPrix.tracks.length;
    document.querySelector("#modalResults .modal-title").textContent=isFinal?"GRAND PRIX COMPLETE":`GRAND PRIX · RACE ${completed} COMPLETE`;
    el("resultsBody").innerHTML=`
      <div class="result-stat"><span>Grand Prix Race</span><span>${completed} / ${grandPrix.tracks.length}</span></div>
      <div class="result-stat"><span>Track</span><span>${track.def.name}</span></div>
      <div class="result-stat"><span>Race Finish</span><span>${pos} / ${order.length}</span></div>
      <div class="result-stat"><span>Race Score</span><span>+${Util.fmt(scoreForCar(race.player,pos,order.length))}</span></div>
      <h3>${isFinal?"FINAL GRAND PRIX STANDINGS":"CHAMPIONSHIP STANDINGS"}</h3>${standingsMarkup()}`;
    if(isFinal){
      const settlement=window.PlatformManager.settleAccuracyCoins(window.GAME_CONFIG.id,grandPrix.baseCoins);
      const finalScore=grandPrix.scores.YOU||0;
      const finalPlace=Object.entries(grandPrix.scores).sort((a,b)=>b[1]-a[1]).findIndex(([name])=>name==="YOU")+1;
      window.PlatformManager.setHighScore(window.GAME_CONFIG.id,finalScore);
      window.AchievementManager?.notify?.("drift_grand_prix_completed",{facts:{drift_discovery_grand_prix_place:finalPlace},run:{correct:settlement.questionsCorrect,answered:settlement.questionsAnswered}});
      window.PlatformManager.endSession(window.GAME_CONFIG.id);
      el("resultCurrencyEarned").textContent=`${ordinal(finalPlace)} overall · +${Util.fmt(settlement.coinsAwarded)} coins`;
      el("btnToGarage").textContent="RETURN HOME";
      resultsAction=()=>{grandPrix=null;showScreen("MENU");};
      updateCurrencyDisplays();
    }else{
      el("resultCurrencyEarned").textContent="Scores carry into the next race";
      el("btnToGarage").textContent=`NEXT RACE ${completed+1} / ${grandPrix.tracks.length}`;
      resultsAction=()=>{grandPrix.index++;startRace(grandPrix.tracks[grandPrix.index]);};
    }
    el("modalResults").classList.add("active");
  }

  function ordinal(value){const mod100=value%100;if(mod100>=11&&mod100<=13)return `${value}th`;return `${value}${value%10===1?"st":value%10===2?"nd":value%10===3?"rd":"th"}`;}

  /* ---------------- MAIN LOOP ---------------- */

  function loop(ts){
    const dt = Math.min((ts-lastTime)/1000 || 0, 0.05);
    lastTime = ts;

    if(state==="RACE" && !countingDown){
      updateRace(dt);
      drawRace();
    } else if(state==="RACE" && countingDown){
      drawRace();
    }
    window.PlatformManager?.heartbeat?.(window.GAME_CONFIG.id, state==="RACE" && !countingDown);

    requestAnimationFrame(loop);
  }

  function updateRace(dt){
    race.elapsedTime = (race.elapsedTime||0) + dt;
    const input = {
      throttle: InputManager.throttle,
      brake: InputManager.brake,
      steer: InputManager.steer,
      handbrake: InputManager.handbrake,
      nitro: InputManager.nitro,
    };
    race.player.updatePlayer(dt, input, particles, race.aiList);
    const playerWallHit = track.resolveCollision(race.player, particles);
    if(playerWallHit.hit){
      race.player.isDrifting = false;
      race.player.driftDuration = 0;
      race.player.driftCombo = 1;
      wallShake = 0.18;
      if(playerWallHit.damage>0) triggerDamageFlash();
    }

    // Wreck sequence — triggers once the instant health hits zero.
    if(race.player.wrecked && !playerWreckedShown){
      playerWreckedShown = true;
      wallShake = 0.6;
      triggerDamageFlash();
      el("wreckedBanner").classList.add("active");
    }
    if(race.player.wrecked){
      wreckEndTimer += dt;
      if(wreckEndTimer>2.6 && !race.raceFinished){
        race.raceFinished = true;
        endRace();
      }
    }
    if(wallShake>0) wallShake = Math.max(0, wallShake-dt);

    race.updateProgress(race.player);
    if(race.raceFinished && state==="RACE"){
      endRace();
    }

    // Pit stop — driving through the pit lane's repair zone pauses the race
    // with a question; a correct answer repairs the car. Hysteresis (exit
    // radius bigger than the trigger radius) stops it re-firing while sitting inside.
    if(state==="RACE" && !race.player.wrecked){
      const zone = track.pit.zone;
      const distToPit = Util.dist(race.player.x, race.player.y, zone.x, zone.y);
      if(distToPit < zone.radius && !race.player.inPitZone){
        race.player.inPitZone = true;
        openPitQuestion();
      } else if(distToPit > zone.radius*1.4 && race.player.inPitZone){
        race.player.inPitZone = false;
      }
    }

    const currentLeader = race.getPositions()[0];
    race.aiList.forEach(ai=>{
      if(!ai.finished){
        const target = race.getTargetPoint(ai);
        ai.updateAI(dt, {target, skill: ai.skill, track, others: race.allCars, particles, raceTime: race.elapsedTime, leader: currentLeader});
        track.resolveCollision(ai, particles);
        race.updateProgress(ai);
        if(ai.isDraft && Math.random()<0.35){
          particles.spawnSpark(ai.x - Math.sin(ai.angle)*22, ai.y + Math.cos(ai.angle)*22, "rgba(120,200,255,");
        }
      }
    });

    const collisionEvents = resolveCarCollisions(race.allCars, particles);
    if(collisionEvents.some(e=>e.car===race.player && e.damage>0)) triggerDamageFlash();

    particles.update(dt);

    // HUD
    el("hudLap").textContent = (grandPrix?`GP ${grandPrix.index+1}/${grandPrix.tracks.length} · `:"") + "LAP " + Math.min(race.player.lap+1, race.totalLaps) + "/" + race.totalLaps;
    el("hudPos").textContent = "POS " + race.playerPosition() + "/" + race.allCars.length;
    el("speedMeter").style.width = Util.clamp((race.player.speed/race.player.maxSpeed)*100,0,100)+"%";
    el("nitroMeter").style.width = Util.clamp((race.player.nitroAmount/race.player.nitroMax)*100,0,100)+"%";
    el("driftScoreVal").textContent = Util.fmt(race.player.driftScore);
    el("driftComboVal").textContent = race.player.isDrifting ? ("COMBO x"+race.player.driftCombo.toFixed(1)) : "";
    window.ChallengeManager?.update?.({score:Math.round(race.player.driftScore),alive:!race.player.wrecked});
    const healthPct = Util.clamp((race.player.health/HEALTH_MAX)*100,0,100);
    const healthBar = el("healthMeter");
    healthBar.style.width = healthPct+"%";
    healthBar.style.background = healthPct>60 ? "linear-gradient(90deg,#4fff9e,#2ab86e)" :
      healthPct>30 ? "linear-gradient(90deg,#fff64f,#d9a52a)" : "linear-gradient(90deg,#ff4f4f,#a02020)";
    el("draftIndicator").classList.toggle("active", !!race.player.isDraft);
    if(race.player.isDraft && Math.random()<0.35){
      particles.spawnSpark(race.player.x - Math.sin(race.player.angle)*22, race.player.y + Math.cos(race.player.angle)*22, "rgba(120,200,255,");
    }

    lbUpdateTimer -= dt;
    if(lbUpdateTimer<=0){
      lbUpdateTimer = 0.3;
      renderLeaderboard();
    }
  }

  function renderLeaderboard(){
    const order = race.getPositions();
    const container = el("leaderboard");
    container.innerHTML = "";
    order.forEach((c,i)=>{
      const isPlayer = c===race.player;
      const row = document.createElement("div");
      row.className = "lb-row" + (isPlayer?" lb-me":"") + (c.wrecked?" lb-wrecked":"");
      const name = isPlayer ? "YOU" : (c.aiName ? c.aiName.replace("RIVAL: ","") : "CPU");
      const color = isPlayer ? "#4fe3ff" : ((c.visual && c.visual.primaryColor) || "#fff");
      row.innerHTML = `<span class="lb-pos">${i+1}</span><span class="lb-swatch" style="background:${color}"></span><span class="lb-name">${name}</span>`;
      container.appendChild(row);
    });
  }

  function drawRace(){
    const w = raceCanvas.width, h = raceCanvas.height;
    raceCtx.clearRect(0,0,w,h);

    const camX = race.player.x - w/2 + (wallShake>0 ? (Math.random()-0.5)*10 : 0);
    const camY = race.player.y - h/2 + (wallShake>0 ? (Math.random()-0.5)*10 : 0);

    const midnight=window.AchievementManager?.getEquipped?.(window.GAME_CONFIG.id)?.world?.id==="drift-discovery_midnight_circuit";
    drawBackground(raceCtx, camX, camY, w, h, midnight?{base:"#02030a",accent:"#5636a8",decoration:"stars"}:(track.def.bg || {base:"#05060f", accent:"#4fe3ff", decoration:"stars"}));
    track.draw(raceCtx, camX, camY);
    particles.draw(raceCtx, camX, camY);

    // draw AI then player (player on top)
    race.aiList.forEach(ai=>{
      raceCtx.save();
      raceCtx.translate(ai.x-camX, ai.y-camY);
      raceCtx.rotate(ai.angle);
      CarRenderer.draw(raceCtx, ai.visual, {scale:1, isDrifting:false, nitroActive: !!ai.nitroActive});
      raceCtx.restore();
      raceCtx.fillStyle="rgba(10,12,28,0.7)";
      raceCtx.font="10px sans-serif"; raceCtx.textAlign="center";
      raceCtx.fillText(ai.aiName + " · " + (AI_STYLE_LABELS[ai.aiStyle]||""), ai.x-camX, ai.y-camY-34);
    });

    raceCtx.save();
    raceCtx.translate(race.player.x-camX, race.player.y-camY);
    raceCtx.rotate(race.player.angle);
    CarRenderer.draw(raceCtx, race.player.visual, {scale:1, isDrifting:race.player.isDrifting, nitroActive:race.player.nitroActive});
    raceCtx.restore();
  }

  function registerChallengeAdapter(){
    const register=()=>window.ChallengeManager?.register?.({
      start:()=>openTrackSelect(),
      snapshot:()=>race?{score:Math.round(race.player.driftScore),alive:!race.player.wrecked}:{}
    });
    register();
    window.addEventListener("arcade-challenge-manager-ready",register,{once:true});
  }

  function initHomeBackdrop(){
    const canvas=el("homeBackdrop"),ctx=canvas.getContext("2d");
    const cars=Array.from({length:7},(_,i)=>({x:Math.random(),y:Math.random(),speed:.00004+i*.000006,
      visual:ComponentManager.buildVisual(CONFIG.CARS[i%CONFIG.CARS.length].id,save.equipped,{...save.cosmetics,primary:i%2?"#ff4fd8":"#4fe3ff"},{})}));
    function resize(){canvas.width=innerWidth;canvas.height=innerHeight;} resize(); addEventListener("resize",resize);
    function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);cars.forEach(car=>{car.x+=car.speed;if(car.x>1.1)car.x=-.1;ctx.save();ctx.translate(car.x*canvas.width,car.y*canvas.height);ctx.rotate(Math.PI/2);CarRenderer.draw(ctx,car.visual,{scale:.75,nitroActive:true});ctx.restore();});requestAnimationFrame(draw);}draw();
  }

  return {init};
})();

window.addEventListener("DOMContentLoaded", Game.init);

})();
