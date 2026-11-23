const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const port = Number(process.env.APP_PORT || process.env.PORT || 3000);
const words = ['apple','rocket','guitar','pizza','castle','penguin','rainbow','camera','banana','turtle','cactus','bicycle','snowman','sailboat','butterfly'];
const rooms = new Map();
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};

function rand(n=6){ return crypto.randomBytes(n).toString('hex').slice(0,n).toUpperCase(); }
function readBody(req){
  return new Promise(resolve=>{
    let data='';
    req.on('data',chunk=>{ data += chunk; if(data.length>2_000_000) req.destroy(); });
    req.on('end',()=>{ try{ resolve(JSON.parse(data||'{}')); }catch{ resolve({}); } });
  });
}
function send(res,data,status=200){ res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
function makeRoom(host){
  const code=rand(6);
  const room={code,host:host.id,players:[host],started:false,round:0,status:'lobby',drawer:0,word:'',strokes:[],messages:[],roundEnds:0};
  rooms.set(code,room);
  return room;
}
function nextRound(room){
  if(!room.started) return;
  if(room.status==='ended') return;
  if(room.round===0){ room.round=1; room.drawer=0; }
  else if(room.status==='roundEnd' || room.status==='lobby'){
    room.round++;
    if(room.round>5){ room.status='ended'; room.messages.push({system:true,text:'Game complete!'}); return; }
    room.drawer=(room.drawer+1)%room.players.length;
  }
  room.word=words[(room.round*3+room.drawer)%words.length];
  room.status='playing'; room.strokes=[]; room.roundEnds=Date.now()+60000;
  room.players.forEach(p=>p.guessed=false);
  room.messages.push({system:true,text:`${room.players[room.drawer].name} is drawing!`});
}
function publicState(room,token){
  const me=room.players.find(p=>p.token===token);
  const drawer=room.players[room.drawer];
  const isDrawer=Boolean(me && drawer && me.id===drawer.id);
  return {
    code:room.code, started:room.started, round:room.round, status:room.status,
    roundEnds:room.roundEnds, drawer:drawer?{id:drawer.id,name:drawer.name}:null,
    me:me?{id:me.id,name:me.name,score:me.score,host:me.id===room.host}:null,
    players:room.players.map(p=>({id:p.id,name:p.name,score:p.score,guessed:p.guessed})),
    word:isDrawer||room.status==='ended'?room.word:room.word.replace(/[^ ]/g,'_').split('').join(' '),
    strokes:room.strokes, messages:room.messages.slice(-40), host:room.host
  };
}
setInterval(()=>{
  for(const room of rooms.values()){
    if(room.started && room.status==='playing' && Date.now()>room.roundEnds){
      room.status='roundEnd';
      room.messages.push({system:true,text:`Time! The word was ${room.word}`});
    }
  }
},500);

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  try{
    if(u.pathname.startsWith('/api/')){
      const body=await readBody(req);
      if(req.method==='POST' && u.pathname===' /api/create'.trim()){}
      if(req.method==='POST' && u.pathname===' /api/join'.trim()){}
      if(req.method==='POST' && u.pathname===' /api/state'.trim()){}

      if(req.method==='POST' && u.pathname=== '/api/create'){
        const name=(body.name||'Player').trim().slice(0,16)||'Player';
        const player={id:rand(8),token:rand(16),name,score:0,guessed:false};
        const room=makeRoom(player);
        return send(res,{token:player.token,code:room.code});
      }
      if(req.method==='POST' && u.pathname=== '/api/join'){
        const code=(body.code||'').trim().toUpperCase();
        const room=rooms.get(code);
        if(!room) return send(res,{error:'Room not found'},404);
        if(room.started) return send(res,{error:'Game already started'},400);
        if(room.players.length>=6) return send(res,{error:'Room is full'},400);
        const name=(body.name||'Player').trim().slice(0,16)||'Player';
        const player={id:rand(8),token:rand(16),name,score:0,guessed:false};
        room.players.push(player); room.messages.push({system:true,text:`${name} joined`});
        return send(res,{token:player.token,code});
      }

      const code=(body.code||u.searchParams.get('code')||'').toUpperCase();
      const token=body.token||u.searchParams.get('token');
      const room=rooms.get(code);
      if(!room) return send(res,{error:'Room not found'},404);
      const me=room.players.find(p=>p.token===token);
      if(!me) return send(res,{error:'Unauthorized'},401);

      if(req.method==='GET' && u.pathname===' /api/state'.trim()){}
      if(req.method==='GET' && u.pathname=== '/api/state') return send(res,publicState(room,token));
      if(req.method==='POST' && u.pathname=== '/api/start'){
        if(room.host!==me.id) return send(res,{error:'Only host can start'},403);
        if(room.players.length<2) return send(res,{error:'Need at least 2 players'},400);
        room.started=true; room.status='lobby'; room.round=0;
        nextRound(room);
        return send(res,{ok:true});
      }
      if(req.method==='POST' && u.pathname=== '/api/draw'){
        const drawer=room.players[room.drawer];
        if(room.status==='playing' && drawer.id===me.id && body.stroke){
          room.strokes.push(body.stroke);
          if(room.strokes.length>500) room.strokes.shift();
        }
        return send(res,{ok:true});
      }
      if(req.method==='POST' && u.pathname=== '/api/clear'){
        if(room.players[room.drawer].id===me.id) room.strokes=[];
        return send(res,{ok:true});
      }
      if(req.method==='POST' && u.pathname=== '/api/undo'){
        if(room.players[room.drawer].id===me.id) room.strokes.pop();
        return send(res,{ok:true});
      }
      if(req.method==='POST' && u.pathname=== '/api/guess'){
        if(room.status==='playing' && !me.guessed){
          const guess=(body.text||'').trim().slice(0,24);
          if(guess){
            const drawer=room.players[room.drawer];
            const correct=guess.toLowerCase()===room.word.toLowerCase();
            room.messages.push({name:me.name,text:correct?'Guessed the word!':guess,correct,id:me.id});
            if(correct && drawer.id!==me.id){
              me.guessed=true;
              me.score+=Math.max(20,Math.ceil((room.roundEnds-Date.now())/300));
              drawer.score+=10;
            }
          }
        }
        return send(res,{ok:true});
      }
      if(req.method==='POST' && u.pathname=== '/api/next'){
        if(room.host!==me.id) return send(res,{error:'Only host can continue'},403);
        nextRound(room);
        return send(res,{ok:true});
      }
      return send(res,{error:'Unknown API'},404);
    }

    const relative=u.pathname==='/'?'index.html':u.pathname.slice(1);
    const file=path.resolve(process.cwd(),relative);
    if(file!==process.cwd() && !file.startsWith(process.cwd()+path.sep)) return res.writeHead(403).end();
    fs.readFile(file,(error,data)=>{
      if(error){ res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(data);
    });
  }catch(error){ send(res,{error:'Server error'},500); }
});
server.listen(port,'0.0.0.0',()=>console.log(`Scribble server on ${port}`));
