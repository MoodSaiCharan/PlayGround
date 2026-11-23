const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$('#board'),ctx=canvas.getContext('2d');
let token='',code='',state=null,color='#25272c',size=5,drawing=false,current=[],lastState='',pollId;

function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=r.width*dpr;canvas.height=r.height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);redraw()}
function redraw(){const r=canvas.getBoundingClientRect();ctx.fillStyle='#fff';ctx.fillRect(0,0,r.width,r.height);ctx.lineCap='round';ctx.lineJoin='round';if(state?.strokes)for(const s of state.strokes){if(!s.points||s.points.length<2)continue;ctx.strokeStyle=s.color;ctx.lineWidth=s.size;ctx.beginPath();ctx.moveTo(s.points[0].x,s.points[0].y);for(let i=1;i<s.points.length;i++)ctx.lineTo(s.points[i].x,s.points[i].y);ctx.stroke()} }
function point(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
canvas.addEventListener('pointerdown',e=>{if(!canDraw())return;canvas.setPointerCapture(e.pointerId);drawing=true;current=[point(e)];api('/api/draw',{stroke:{color,size,points:current}})});
canvas.addEventListener('pointermove',e=>{if(!drawing||!canDraw())return;const p=point(e);current.push(p);ctx.strokeStyle=color;ctx.lineWidth=size;ctx.beginPath();ctx.moveTo(current[current.length-2].x,current[current.length-2].y);ctx.lineTo(p.x,p.y);ctx.stroke();if(current.length%3===0)api('/api/draw',{stroke:{color,size,points:[...current]}})});
canvas.addEventListener('pointerup',()=>{drawing=false;if(current.length){api('/api/draw',{stroke:{color,size,points:[...current]}})}});
canvas.addEventListener('pointercancel',()=>drawing=false);
function canDraw(){return state&&state.status==='playing'&&state.drawer?.id===state.me?.id}
async function api(path,data={}){const isGet=path.includes('/api/state');const url=isGet?`${path}?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`:path;const r=await fetch(url,{method:isGet?'GET':'POST',headers:{'Content-Type':'application/json'},body:isGet?undefined:JSON.stringify({...data,code,token})});return r.json()}
async function poll(){if(!token||!code)return;try{const old=state;state=await api('/api/state');render(old)}catch(e){}}
function render(old){resize();$('#roundLabel').innerHTML=`${state.started?'Round '+state.round:'Lobby · '+state.code} <span>of 5</span>`;$('#avatarBtn').textContent=state.me?.host&&!state.started?'START':'YOU';$('#avatarBtn').title=state.me?.host&&!state.started?'Start game':'Your player';$('#playerCount').textContent=state.players.length;
 $('#players').innerHTML=state.players.map(p=>{const drawing=state.drawer?.id===p.id;return `<div class="player ${drawing?'drawing':''}"><div class="player-avatar" style="background:${p.id===state.me?.id?'#f58d70':'#6e9efa'}">${p.name[0].toUpperCase()}</div><div class="player-info"><div class="player-name">${p.name}${p.id===state.me?.id?' (You)':''}</div><div class="player-state">${drawing?'Drawing':p.guessed?'Guessed':'Thinking...'}</div></div><div class="player-score">${p.score}</div></div>`}).join('');
 $('#wordBlanks').textContent=state.word||'_ _ _ _ _';$('#timerNum').textContent=state.roundEnds?Math.max(0,Math.ceil((state.roundEnds-Date.now())/1000)):60;$('#guessCount').textContent=state.messages.filter(m=>!m.system&&!m.correct).length;
 if(state.drawer){$('#turnBanner').innerHTML=`<div class="turn-avatar">${state.drawer.name[0].toUpperCase()}</div><div><small>${canDraw()?'You are drawing':'Now drawing'}</strong></div>`.replace('<strong>','<strong>').replace('</strong>','</strong>');$('#turnBanner').innerHTML=`<div class="turn-avatar">${state.drawer.name[0].toUpperCase()}</div><div><small>${canDraw()?'You are drawing':'Now drawing'}</small><strong>${canDraw()?'Draw the secret word':state.drawer.name+' is sketching...'}</strong></div>`}
 const key=JSON.stringify(state.messages);if(key!==lastState){$('#messages').innerHTML=state.messages.map(m=>m.system?`<div class="system-msg"><b>${m.text}</b></div>`:`<div class="message ${m.correct?'correct':''}"><div class="message-avatar">${m.name[0].toUpperCase()}</div><div><b>${m.name}</b><span>${m.text}</span></div></div>`).join('');lastState=key;}
 redraw();
 if(state.status==='roundEnd'||state.status==='ended')showResult(state.status==='ended');
 else $('#roundResult').classList.remove('show');
}
function showResult(final){$('#roundResult').classList.add('show');$('#resultEmoji').textContent=final?'🏆':'⏰';$('#resultTitle').textContent=final?'Game complete!':'Time!';$('#resultCopy').innerHTML=final?'The highest score wins!':`The word was <b>${state.word}</b>`;const b=$('#nextRoundBtn');b.textContent=state.me?.host?(final?'Play again':'Next round'):'Waiting for host';b.disabled=!state.me?.host}
$('#nextRoundBtn').onclick=()=>api('/api/next');
async function enterLobby(create){const name=$('#nameInput').value.trim().slice(0,16)||'Player';const res=await fetch('/api/'+(create?'create':'join'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(create?{name}:{name,code:$('#codeInput').value.toUpperCase()})}).then(r=>r.json());if(res.error){$('#lobbyStatus').textContent=res.error;return}token=res.token;code=res.code;$('#lobbyStatus').textContent=`Room code: ${code}`;$('#lobbyModal').classList.remove('show');clearInterval(pollId);pollId=setInterval(poll,700);poll()}
$('#createBtn').onclick=()=>enterLobby(true);$('#joinBtn').onclick=()=>enterLobby(false);
$('#guessForm').onsubmit=async e=>{e.preventDefault();const i=$('#guessInput'),text=i.value.trim();if(!text)return;await api('/api/guess',{text});i.value='';poll()};
$('#undoBtn').onclick=()=>api('/api/undo');$('#clearBtn').onclick=()=>api('/api/clear');
$$('#colors .swatch').forEach(b=>b.onclick=()=>{$$('#colors .swatch').forEach(x=>x.classList.remove('active'));b.classList.add('active');color=b.dataset.color});
$$('#sizes .size').forEach(b=>b.onclick=()=>{$$('#sizes .size').forEach(x=>x.classList.remove('active'));b.classList.add('active');size=+b.dataset.size});
$('#helpBtn').onclick=()=>$('#helpModal').classList.add('show');$('#closeHelp').onclick=()=>$('#helpModal').classList.remove('show');$('#playBtn').onclick=()=>$('#helpModal').classList.remove('show');
let sound=true;$('#soundBtn').onclick=()=>{sound=!sound;$('#soundBtn').textContent=sound?'🔊':'🔇'};
window.addEventListener('resize',resize);

// Host can start from the lobby using the room code shown in the round title by clicking avatar.
$('#avatarBtn').onclick=async()=>{if(!token)return;if(state?.started)return;$('#lobbyStatus').textContent='Starting game...';await api('/api/start')};
setInterval(()=>{if(state?.roundEnds&&state.status==='playing')$('#timerNum').textContent=Math.max(0,Math.ceil((state.roundEnds-Date.now())/1000))},300);
