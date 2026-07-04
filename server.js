const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Beklenmeyen bir hata tüm sunucuyu çökertip herkesi atmasın diye:
process.on('uncaughtException', (err) => {
  console.error('❌ Yakalanmamış hata (sunucu ayakta kalıyor):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('❌ Yakalanmamış promise hatası (sunucu ayakta kalıyor):', err);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const MAX_PLAYERS  = 10;
const ROUND_TIME   = 600;
const END_WAIT     = 10;
const VOTE_TIME    = 30;
const BAN_DURATION = 7 * 24 * 3600 * 1000;
const INACTIVE_MS  = 30 * 24 * 3600 * 1000; // 1 ay boyunca giriş yapılmazsa hesap silinir
const COLORS       = { red: '#e74c3c', blue: '#3498db' };

const PROFANITY = [
  'orospu','oç','göt','sik','amk','bok','piç','yarrak','oruspu','amına',
  'sikerim','sikeyim','orosp','fuck','shit','bitch','asshole','cunt','nigger','bastard'
];

// ── Silahlar (CS 1.6 tarzı) ────────────────────────────────
const WEAPONS = {
  glock:   { name: 'Glock',        damage: 34,  cost: 0  },
  deagle:  { name: 'Desert Eagle', damage: 48,  cost: 6  },
  uzi:     { name: 'Uzi',          damage: 20,  cost: 5  },
  shotgun: { name: 'Shotgun',      damage: 65,  cost: 10 },
  m4:      { name: 'M4A4',         damage: 33,  cost: 12 },
  ak47:    { name: 'AK-47',        damage: 40,  cost: 15 },
  sniper:  { name: 'AWP',          damage: 100, cost: 18 },
  minigun: { name: 'Minigun',      damage: 16,  cost: 22 }
};

// ── Karakterler (kozmetik, CS 1.6 tarzı asker skinleri) ────
const CHARACTERS = {
  soldier: { name: 'Asker',        cost: 0  },
  desert:  { name: 'Çöl Kaplanı',  cost: 8  },
  urban:   { name: 'Şehir Avcısı', cost: 8  },
  ghost:   { name: 'Hayalet',      cost: 15 },
  phoenix: { name: 'Anka',         cost: 15 }
};

// ── Haritalar (genişletildi ve büyütüldü) ───────────────────
const MAPS = {
arena: {
    name: "Arena", size: 60, theme: "grass",
    walls: [
      {x:0,z:-30,w:60,d:1.5},{x:0,z:30,w:60,d:1.5},{x:-30,z:0,w:1.5,d:60},{x:30,z:0,w:1.5,d:60},
      {x:-12,z:-12,w:9,d:1.5},{x:12,z:12,w:9,d:1.5},{x:-12,z:12,w:1.5,d:9},{x:12,z:-12,w:1.5,d:9},
      {x:0,z:0,w:4.5,d:4.5},{x:-21,z:0,w:1.5,d:15},{x:21,z:0,w:1.5,d:15},{x:0,z:-21,w:15,d:1.5},
      {x:0,z:21,w:15,d:1.5}
    ]
  },
desert: {
    name: "Çöl", size: 100, theme: "sand",
    walls: [
      {x:0,z:-50,w:100.1,d:1.4},{x:0,z:50.1,w:100.1,d:1.4},{x:-50,z:0,w:1.4,d:100.1},{x:50.1,z:0,w:1.4,d:100.1},
      {x:-20,z:-17.2,w:11.4,d:2.9},{x:20,z:17.2,w:11.4,d:2.9},{x:-20,z:17.2,w:2.9,d:11.4},{x:20,z:-17.2,w:2.9,d:11.4},
      {x:0,z:-22.9,w:5.7,d:5.7},{x:0,z:22.9,w:5.7,d:5.7},{x:-34.3,z:-34.3,w:8.6,d:8.6},{x:34.3,z:34.3,w:8.6,d:8.6},
      {x:-34.3,z:34.3,w:8.6,d:8.6},{x:34.3,z:-34.3,w:8.6,d:8.6},{x:-12.9,z:0,w:4.3,d:17.2},{x:12.9,z:0,w:4.3,d:17.2},
      {x:0,z:0,w:2.9,d:2.9}
    ]
  },
forest: {
    name: "Orman", size: 80, theme: "forest",
    walls: [
      {x:0,z:-40,w:80.1,d:1.4},{x:0,z:40,w:80.1,d:1.4},{x:-40,z:0,w:1.4,d:80.1},{x:40,z:0,w:1.4,d:80.1},
      {x:-17.2,z:-17.2,w:1.4,d:1.4},{x:-8.6,z:-17.2,w:1.4,d:1.4},{x:0,z:-17.2,w:1.4,d:1.4},{x:8.6,z:-17.2,w:1.4,d:1.4},
      {x:17.2,z:-17.2,w:1.4,d:1.4},{x:-17.2,z:17.2,w:1.4,d:1.4},{x:-8.6,z:17.2,w:1.4,d:1.4},{x:0,z:17.2,w:1.4,d:1.4},
      {x:8.6,z:17.2,w:1.4,d:1.4},{x:17.2,z:17.2,w:1.4,d:1.4},{x:-25.7,z:0,w:1.4,d:1.4},{x:-12.9,z:8.6,w:1.4,d:1.4},
      {x:12.9,z:-8.6,w:1.4,d:1.4},{x:25.7,z:0,w:1.4,d:1.4},{x:-4.3,z:-25.7,w:1.4,d:1.4},{x:4.3,z:25.7,w:1.4,d:1.4},
      {x:-4.3,z:25.7,w:1.4,d:1.4},{x:4.3,z:-25.7,w:1.4,d:1.4},{x:-25.7,z:-25.7,w:5.7,d:5.7},{x:25.7,z:25.7,w:5.7,d:5.7},
      {x:-25.7,z:25.7,w:5.7,d:5.7},{x:25.7,z:-25.7,w:5.7,d:5.7},{x:0,z:0,w:7.2,d:1.4},{x:0,z:0,w:1.4,d:7.2}
    ]
  },
city: {
    name: "Şehir", size: 130, theme: "urban",
    walls: [
      {x:0,z:-64.8,w:129.6,d:1.4},{x:0,z:64.8,w:129.6,d:1.4},{x:-64.8,z:0,w:1.4,d:129.6},{x:64.8,z:0,w:1.4,d:129.6},
      {x:-43.2,z:-43.2,w:14.4,d:14.4},{x:43.2,z:-43.2,w:14.4,d:14.4},{x:-43.2,z:43.2,w:14.4,d:14.4},{x:43.2,z:43.2,w:14.4,d:14.4},
      {x:0,z:-43.2,w:11.5,d:11.5},{x:0,z:43.2,w:11.5,d:11.5},{x:-43.2,z:0,w:11.5,d:11.5},{x:43.2,z:0,w:11.5,d:11.5},
      {x:-21.6,z:-21.6,w:8.6,d:8.6},{x:21.6,z:21.6,w:8.6,d:8.6},{x:-21.6,z:21.6,w:8.6,d:8.6},{x:21.6,z:-21.6,w:8.6,d:8.6},
      {x:0,z:0,w:5.8,d:5.8},{x:-11.5,z:0,w:2.9,d:28.8},{x:11.5,z:0,w:2.9,d:28.8},{x:0,z:-11.5,w:28.8,d:2.9},
      {x:0,z:11.5,w:28.8,d:2.9},{x:-54.7,z:-21.6,w:7.2,d:7.2},{x:54.7,z:21.6,w:7.2,d:7.2},{x:-54.7,z:21.6,w:7.2,d:7.2},
      {x:54.7,z:-21.6,w:7.2,d:7.2}
    ]
  },
harbor: {
    name: "Liman", size: 110, theme: "harbor",
    walls: [
      {x:0,z:-55,w:110,d:1.4},{x:0,z:55,w:110,d:1.4},{x:-55,z:0,w:1.4,d:110},{x:55,z:0,w:1.4,d:110},
      {x:-27.5,z:-27.5,w:16.5,d:5.5},{x:27.5,z:27.5,w:16.5,d:5.5},{x:-27.5,z:27.5,w:5.5,d:16.5},{x:27.5,z:-27.5,w:5.5,d:16.5},
      {x:0,z:-34.4,w:8.3,d:8.3},{x:0,z:34.4,w:8.3,d:8.3},{x:-41.2,z:0,w:8.3,d:27.5},{x:41.3,z:0,w:8.3,d:27.5},
      {x:-13.7,z:0,w:4.1,d:4.1},{x:13.8,z:0,w:4.1,d:4.1},{x:0,z:0,w:4.1,d:20.6},{x:-22,z:-8.2,w:2.8,d:2.8},
      {x:22,z:8.3,w:2.8,d:2.8},{x:-22,z:8.3,w:2.8,d:2.8},{x:22,z:-8.2,w:2.8,d:2.8}
    ]
  }
};

// ── Hesaplar ─────────────────────────────────────────────
// GITHUB_TOKEN ayarlıysa hesaplar GitHub deposundaki accounts.json'a kaydedilir
// (yeniden deploy olsa bile kaybolmaz). Ayarlı değilse yerel dosyaya kaydedilir
// (sadece sunucu uykuya dalıp uyanmasına dayanır, redeploy'da sıfırlanır).
const ACCOUNTS_FILE   = path.join(__dirname, 'accounts.json');
const GITHUB_TOKEN    = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO     = process.env.GITHUB_REPO || 'malidogan8392-jpg/fps-game';
const GITHUB_BRANCH   = process.env.GITHUB_BRANCH || 'main';
const GITHUB_PATH     = 'accounts.json';
const USE_GITHUB      = !!GITHUB_TOKEN;

let accounts = {};
let githubSha = null;

async function githubReadAccounts() {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}?ref=${GITHUB_BRANCH}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'fps-game-server' }
  });
  if (res.status === 404) { githubSha = null; return {}; }
  if (!res.ok) throw new Error('GitHub okuma hatası: ' + res.status + ' ' + await res.text());
  const data = await res.json();
  githubSha = data.sha;
  const raw = Buffer.from(data.content, 'base64').toString('utf8');
  return raw.trim() ? JSON.parse(raw) : {};
}

async function githubWriteAccounts() {
  const body = {
    message: 'Hesap güncelleme ' + new Date().toISOString(),
    content: Buffer.from(JSON.stringify(accounts, null, 2)).toString('base64'),
    branch: GITHUB_BRANCH
  };
  if (githubSha) body.sha = githubSha;
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`, {
    method: 'PUT',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'fps-game-server', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 409) { const fresh = await githubReadAccounts(); accounts = { ...fresh, ...accounts }; return githubWriteAccounts(); }
    throw new Error('GitHub yazma hatası: ' + res.status + ' ' + errText);
  }
  const data = await res.json();
  githubSha = data.content.sha;
}

async function loadAccounts() {
  if (USE_GITHUB) {
    try { accounts = await githubReadAccounts(); console.log('Hesaplar GitHub\'dan yüklendi:', Object.keys(accounts).length); }
    catch (e) { console.error('GitHub\'dan hesap yüklenemedi, boş başlatılıyor:', e.message); accounts = {}; }
  } else {
    try { if (fs.existsSync(ACCOUNTS_FILE)) accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); }
    catch (e) { console.error('Hesaplar okunamadı:', e.message); accounts = {}; }
  }
}

let saveTimer = null;
let savePending = false;
function saveAccounts() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (USE_GITHUB) {
      if (savePending) { saveTimer = setTimeout(saveAccounts, 500); return; }
      savePending = true;
      try { await githubWriteAccounts(); }
      catch (e) { console.error('GitHub\'a kaydedilemedi:', e.message); }
      savePending = false;
    } else {
      try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts)); }
      catch (e) { console.error('Hesaplar kaydedilemedi:', e.message); }
    }
  }, 1500);
}
loadAccounts();

function hashPwd(p) { return crypto.createHash('sha256').update(p+':fps2024').digest('hex'); }
setInterval(() => {
  const now = Date.now();
  let changed = false;
  Object.keys(accounts).forEach(u => { if (now - accounts[u].lastLogin > INACTIVE_MS) { delete accounts[u]; changed = true; } });
  if (changed) saveAccounts();
}, 3600000);

// ── Odalar ───────────────────────────────────────────────
const rooms = {};
function makeRoom() {
  const id = crypto.randomBytes(2).toString('hex').toUpperCase();
  rooms[id] = { id, name:'Sunucu '+id, players:{}, phase:'voting', votes:{}, currentMap:'arena', teamKills:{red:0,blue:0}, timeLeft:VOTE_TIME, intervalId:null, lastActive:Date.now() };
  startVoting(id);
  return rooms[id];
}
function getRoomList() {
  return Object.values(rooms).map(r => ({ id:r.id, name:r.name, count:Object.keys(r.players).length, max:MAX_PLAYERS, phase:r.phase, map:r.currentMap }));
}
function findOrCreate() {
  return Object.values(rooms).find(r => Object.keys(r.players).length < MAX_PLAYERS && r.phase !== 'ending') || makeRoom();
}

// ── Tur döngüsü ──────────────────────────────────────────
function startVoting(rid) {
  const r = rooms[rid]; if (!r) return;
  clearInterval(r.intervalId);
  r.phase='voting'; r.votes={}; r.timeLeft=VOTE_TIME; r.teamKills={red:0,blue:0};
  io.to(rid).emit('phaseChange',{phase:'voting',maps:Object.keys(MAPS).map(k=>({id:k,name:MAPS[k].name})),timeLeft:VOTE_TIME});
  r.intervalId=setInterval(()=>{ r.timeLeft--; io.to(rid).emit('timerTick',r.timeLeft); if(r.timeLeft<=0) startRound(rid); },1000);
}
function startRound(rid) {
  const r = rooms[rid]; if (!r) return;
  clearInterval(r.intervalId);
  const tally={}; Object.keys(MAPS).forEach(k=>tally[k]=0);
  Object.values(r.votes).forEach(v=>{if(tally[v]!==undefined)tally[v]++;});
  r.currentMap = Object.keys(tally).reduce((a,b)=>tally[a]>=tally[b]?a:b);
  r.phase='playing'; r.timeLeft=ROUND_TIME; r.teamKills={red:0,blue:0};
  const map=MAPS[r.currentMap]; const half=map.size/2-2;
  Object.values(r.players).forEach(p=>{
    if(p.team==='red'){p.x=-half+Math.random()*4;p.z=Math.random()*6-3;}
    else{p.x=half-Math.random()*4;p.z=Math.random()*6-3;}
    p.y=0; p.health=100;
  });
  io.to(rid).emit('phaseChange',{phase:'playing',map:r.currentMap,mapData:MAPS[r.currentMap],players:r.players,timeLeft:ROUND_TIME});
  r.intervalId=setInterval(()=>{ r.timeLeft--; io.to(rid).emit('timerTick',r.timeLeft); if(r.timeLeft<=0) endRound(rid); },1000);
}
function endRound(rid) {
  const r = rooms[rid]; if (!r) return;
  clearInterval(r.intervalId);
  r.phase='ending'; r.timeLeft=END_WAIT;
  const winner = r.teamKills.red>r.teamKills.blue?'red':r.teamKills.blue>r.teamKills.red?'blue':'tie';
  io.to(rid).emit('phaseChange',{phase:'ending',winner,teamKills:r.teamKills,timeLeft:END_WAIT});
  r.intervalId=setInterval(()=>{ r.timeLeft--; io.to(rid).emit('timerTick',r.timeLeft); if(r.timeLeft<=0) startVoting(rid); },1000);
}

function containsProfanity(t) { const l=t.toLowerCase(); return PROFANITY.some(w=>l.includes(w)); }

// ── Socket ───────────────────────────────────────────────
io.on('connection', (socket) => {
  let rid = null;
  let username = null;

  socket.on('register', ({user,pwd}) => {
    user=(user||'').trim();
    if(!user||user.length<3||user.length>20){socket.emit('authErr','İsim 3-20 karakter olmalı');return;}
    if(accounts[user]){socket.emit('authErr','Bu kullanıcı adı alınmış');return;}
    accounts[user]={username:user,passwordHash:hashPwd(pwd),createdAt:Date.now(),lastLogin:Date.now(),warnings:0,bannedUntil:0};
    saveAccounts();
    username=user; socket.emit('authOk',{username:user});
  });

  socket.on('login', ({user,pwd}) => {
    const a=accounts[user];
    if(!a){socket.emit('authErr','Kullanıcı bulunamadı');return;}
    if(a.passwordHash!==hashPwd(pwd)){socket.emit('authErr','Şifre yanlış');return;}
    if(a.bannedUntil>Date.now()){socket.emit('authErr',`Banlısın. ${Math.ceil((a.bannedUntil-Date.now())/86400000)} gün kaldı.`);return;}
    a.lastLogin=Date.now(); saveAccounts();
    username=user; socket.emit('authOk',{username:user});
  });

  socket.on('getRooms', () => socket.emit('roomList', getRoomList()));
  socket.on('quickJoin', () => enterRoom(findOrCreate()));
  socket.on('joinRoom', (roomId) => {
    const r=rooms[roomId];
    if(!r){socket.emit('gameErr','Sunucu bulunamadı');return;}
    if(Object.keys(r.players).length>=MAX_PLAYERS){socket.emit('gameErr','Sunucu dolu');return;}
    enterRoom(r);
  });

  socket.on('vote', (mapId) => {
    const r=rooms[rid]; if(!r||r.phase!=='voting'||!MAPS[mapId]) return;
    r.votes[socket.id]=mapId;
    const tally={}; Object.keys(MAPS).forEach(k=>tally[k]=0);
    Object.values(r.votes).forEach(v=>{if(tally[v]!==undefined)tally[v]++;});
    io.to(rid).emit('voteUpdate',tally);
  });

  socket.on('buyWeapon', (weaponId) => {
    const r=rooms[rid]; if(!r) return;
    const p=r.players[socket.id]; if(!p) return;
    const w=WEAPONS[weaponId]; if(!w) return;
    if(p.unlocked&&p.unlocked.includes(weaponId)){socket.emit('shopMsg','Zaten sahipsin');return;}
    if(p.killPoints<w.cost){socket.emit('shopMsg',`Yetersiz puan (${w.cost} gerekli)`);return;}
    p.killPoints-=w.cost;
    if(!p.unlocked) p.unlocked=[];
    p.unlocked.push(weaponId);
    socket.emit('shopOk',{weaponId,killPoints:p.killPoints,unlocked:p.unlocked});
  });

  socket.on('switchWeapon', (weaponId) => {
    const r=rooms[rid]; if(!r) return;
    const p=r.players[socket.id]; if(!p) return;
    if(weaponId!=='glock'&&(!p.unlocked||!p.unlocked.includes(weaponId))) return;
    p.weapon=weaponId;
    io.to(rid).emit('weaponChanged',{id:socket.id,weapon:weaponId});
  });

  socket.on('buyCharacter', (charId) => {
    const r=rooms[rid]; if(!r) return;
    const p=r.players[socket.id]; if(!p) return;
    const c=CHARACTERS[charId]; if(!c) return;
    if(p.unlockedChars&&p.unlockedChars.includes(charId)){socket.emit('shopMsg','Zaten sahipsin');return;}
    if(p.killPoints<c.cost){socket.emit('shopMsg',`Yetersiz puan (${c.cost} gerekli)`);return;}
    p.killPoints-=c.cost;
    if(!p.unlockedChars) p.unlockedChars=[];
    p.unlockedChars.push(charId);
    socket.emit('charOk',{charId,killPoints:p.killPoints,unlockedChars:p.unlockedChars});
  });

  socket.on('switchCharacter', (charId) => {
    const r=rooms[rid]; if(!r) return;
    const p=r.players[socket.id]; if(!p) return;
    if(charId!=='soldier'&&(!p.unlockedChars||!p.unlockedChars.includes(charId))) return;
    p.character=charId;
    io.to(rid).emit('characterChanged',{id:socket.id,character:charId});
  });

  socket.on('move', (data) => {
    const r=rooms[rid]; if(!r||!r.players[socket.id]||r.phase!=='playing') return;
    const p=r.players[socket.id];
    p.x=data.x; p.y=data.y; p.z=data.z; p.rotY=data.rotY;
    r.lastActive=Date.now();
    socket.to(rid).emit('playerMoved',{id:socket.id,x:data.x,y:data.y,z:data.z,rotY:data.rotY});
  });

  socket.on('shoot', (data) => {
    if(rooms[rid]?.phase!=='playing') return;
    socket.to(rid).emit('bulletFired',{id:socket.id,...data});
  });

  socket.on('hit', (data) => {
    const r=rooms[rid]; if(!r||r.phase!=='playing') return;
    const target=r.players[data.targetId];
    const shooter=r.players[socket.id];
    if(!target||!shooter||target.team===shooter.team) return;
    const weapon=WEAPONS[shooter.weapon||'glock'];
    target.health-=weapon.damage;
    if(target.health<=0){
      target.health=100;
      target.deaths++;
      shooter.kills++;
      shooter.killPoints=(shooter.killPoints||0)+1;
      r.teamKills[shooter.team]=(r.teamKills[shooter.team]||0)+1;
      const map=MAPS[r.currentMap]; const half=map.size/2-2;
      if(target.team==='red'){target.x=-half+Math.random()*4;target.z=Math.random()*6-3;}
      else{target.x=half-Math.random()*4;target.z=Math.random()*6-3;}
      io.to(rid).emit('playerDied',{deadId:data.targetId,killerId:socket.id});
      io.to(rid).emit('teamKills',r.teamKills);
      io.to(rid).emit('scoreUpdate',{id:data.targetId,kills:target.kills,deaths:target.deaths});
      io.to(rid).emit('scoreUpdate',{id:socket.id,kills:shooter.kills,deaths:shooter.deaths,killPoints:shooter.killPoints});
    } else {
      io.to(data.targetId).emit('damaged',{health:target.health});
    }
  });

  socket.on('chat', (msg) => {
    if(!msg||typeof msg!=='string') return;
    msg=msg.slice(0,120);
    if(containsProfanity(msg)){
      if(username&&accounts[username]){
        accounts[username].warnings=(accounts[username].warnings||0)+1;
        const w=accounts[username].warnings;
        if(w>=4){accounts[username].bannedUntil=Date.now()+BAN_DURATION;saveAccounts();socket.emit('banned','1 hafta banlandın');socket.disconnect();return;}
        saveAccounts();
        socket.emit('warning',`Uyarı ${w}/3`);
      } return;
    }
    const r=rooms[rid]; if(!r) return;
    const p=r.players[socket.id];
    io.to(rid).emit('chatMsg',{name:p?.name||'?',team:p?.team,msg});
  });

  socket.on('disconnect', () => {
    const r=rooms[rid]; if(!r) return;
    delete r.players[socket.id];
    io.to(rid).emit('playerLeft',socket.id);
    io.emit('roomListUpdate',getRoomList());
    if(Object.keys(r.players).length===0) r.lastActive=Date.now();
  });

  function enterRoom(room) {
    rid=room.id;
    socket.join(room.id);
    room.lastActive=Date.now();
    if(username&&accounts[username]){accounts[username].lastLogin=Date.now();saveAccounts();}
    const reds=Object.values(room.players).filter(p=>p.team==='red').length;
    const blues=Object.values(room.players).filter(p=>p.team==='blue').length;
    const team=reds<=blues?'red':'blue';
    const map=MAPS[room.currentMap]; const half=map.size/2-2;
    let sx,sz;
    if(team==='red'){sx=-half+Math.random()*4;sz=Math.random()*6-3;}
    else{sx=half-Math.random()*4;sz=Math.random()*6-3;}
    const displayName=username||('Oyuncu'+Math.floor(Math.random()*9000+1000));
    room.players[socket.id]={id:socket.id,username,name:displayName,x:sx,y:0,z:sz,rotY:0,health:100,kills:0,deaths:0,killPoints:0,weapon:'glock',unlocked:['glock'],character:'soldier',unlockedChars:['soldier'],team,color:COLORS[team]};
    socket.emit('init',{id:socket.id,players:room.players,roomId:room.id,roomName:room.name,phase:room.phase,currentMap:room.currentMap,mapData:MAPS[room.currentMap],teamKills:room.teamKills,timeLeft:room.timeLeft,myTeam:team,maps:Object.keys(MAPS).map(k=>({id:k,name:MAPS[k].name})),weapons:WEAPONS,characters:CHARACTERS});
    socket.to(room.id).emit('playerJoined',room.players[socket.id]);
    io.emit('roomListUpdate',getRoomList());
  }
});

setInterval(()=>{
  const now=Date.now();
  Object.keys(rooms).forEach(id=>{
    const r=rooms[id];
    if(Object.keys(r.players).length===0&&(now-r.lastActive)>60000){
      clearInterval(r.intervalId); delete rooms[id];
      io.emit('roomListUpdate',getRoomList());
    }
  });
},15000);

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('FPS: '+PORT));
