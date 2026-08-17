(function(){
  'use strict';
  const id=location.pathname.match(/\/games\/([^/]+)\//)?.[1];
  if(!['cube-curiosity','tic-tac-toe','pool-practice'].includes(id))return;
  const host=document.querySelector('.arcade-home-screen');
  if(!host)return;
  const canvas=document.createElement('canvas');
  canvas.className='game-home-backdrop';canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
  const ctx=canvas.getContext('2d');let w=1,h=1,last=performance.now();
  const colors=['#35f5ff','#ff2ee6','#ffe23d','#3dff8f','#9b3dff','#ff5b55'];
  const count=id==='cube-curiosity'?28:id==='pool-practice'?15:22;
  const items=Array.from({length:count},(_,i)=>({x:Math.random(),y:Math.random(),
    vx:(Math.random()<.5?-1:1)*(18+Math.random()*45),vy:(Math.random()<.5?-1:1)*(14+Math.random()*40),
    size:id==='cube-curiosity'?10+Math.random()*34:id==='pool-practice'?9+Math.random()*8:20+Math.random()*24,
    color:colors[i%colors.length],number:id==='pool-practice'?i+1:i,rot:Math.random()*Math.PI}));
  function resize(){const r=host.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);w=r.width;h=r.height;canvas.width=Math.max(1,w*d);canvas.height=Math.max(1,h*d);ctx.setTransform(d,0,0,d,0,0)}
  function cube(o){const s=o.size;ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.rot);ctx.shadowColor=o.color;ctx.shadowBlur=12;ctx.fillStyle='#0d0a26';ctx.strokeStyle=o.color;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-s/2,-s/2,s,s,Math.max(2,s*.12));ctx.fill();ctx.stroke();ctx.fillStyle=o.color;ctx.fillRect(-s*.23,-s*.12,s*.12,s*.12);ctx.fillRect(s*.11,-s*.12,s*.12,s*.12);ctx.fillRect(-s*.2,s*.16,s*.4,Math.max(2,s*.07));ctx.restore()}
  function mark(o){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.rot);ctx.strokeStyle=o.color;ctx.lineWidth=Math.max(3,o.size*.13);ctx.lineCap='square';ctx.shadowColor=o.color;ctx.shadowBlur=10;const s=o.size/2;if(o.number%2){ctx.beginPath();ctx.moveTo(-s,-s);ctx.lineTo(s,s);ctx.moveTo(s,-s);ctx.lineTo(-s,s);ctx.stroke()}else{ctx.beginPath();ctx.arc(0,0,s,0,Math.PI*2);ctx.stroke()}ctx.restore()}
  function poolBall(o){const r=o.size,c=['#f2c94c','#2878d0','#e4473d','#7d3fa1','#e88b2b','#2c9b65','#8f2737','#171822'][o.number%8];ctx.save();ctx.translate(o.x,o.y);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();ctx.fillStyle=o.number>8?'#f5f2e9':c;ctx.fillRect(-r,-r,r*2,r*2);if(o.number>8){ctx.fillStyle=c;ctx.fillRect(-r,-r*.5,r*2,r)}ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,r*.42,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111';ctx.font=`bold ${Math.max(7,r*.65)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(o.number),0,1);ctx.restore()}
  function step(now){const dt=Math.min(.04,(now-last)/1000);last=now;ctx.clearRect(0,0,w,h);items.forEach(o=>{o.x+=o.vx*dt;o.y+=o.vy*dt;o.rot+=dt*(o.vx/80);const r=o.size;if(o.x<r){o.x=r;o.vx=Math.abs(o.vx)}if(o.x>w-r){o.x=w-r;o.vx=-Math.abs(o.vx)}if(o.y<r){o.y=r;o.vy=Math.abs(o.vy)}if(o.y>h-r){o.y=h-r;o.vy=-Math.abs(o.vy)}});
    if(id==='pool-practice')for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.size+b.size;if(d&&d<min){const nx=dx/d,ny=dy/d,over=(min-d)/2;a.x-=nx*over;a.y-=ny*over;b.x+=nx*over;b.y+=ny*over;const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(rel<0){a.vx+=rel*nx;a.vy+=rel*ny;b.vx-=rel*nx;b.vy-=rel*ny}}}
    items.forEach(id==='cube-curiosity'?cube:id==='tic-tac-toe'?mark:poolBall);requestAnimationFrame(step)}
  resize();addEventListener('resize',resize);requestAnimationFrame(step);
})();
