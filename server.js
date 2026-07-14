const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ACCOUNTS_FILE = path.join(process.cwd(), 'hesaplar.json');

module.exports = function(io) {
    // ── Hesap Yönetimi ───────────────────────────────────────
    let accounts = {};
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            const fileContent = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
            accounts = JSON.parse(fileContent);
        } else {
            accounts = {};
        }
    } catch (e) {
        console.error('Kritik okuma hatası:', e.message);
        accounts = {};
    }

    let saveTimer = null;
    let savePending = false;

    function saveAccounts() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            if (typeof USE_GITHUB !== 'undefined' && USE_GITHUB) {
                if (savePending) { saveTimer = setTimeout(saveAccounts, 500); return; }
                savePending = true;
                try { await githubWriteAccounts(); }
                catch (e) { console.error('GitHub\'a kaydedilemedi:', e.message); }
                savePending = false;
            } else {
                try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2)); }
                catch (e) { console.error('Hesaplar kaydedilemedi:', e.message); }
            }
        }, 1500);
    }

    function hashPwd(p) { return crypto.createHash('sha256').update(p+':fps2024').digest('hex'); }

    const INACTIVE_MS = 30 * 24 * 60 * 60 * 1000; // 30 Gün
    setInterval(() => {
        const now = Date.now();
        let changed = false;
        Object.keys(accounts).forEach(u => { 
            if (now - accounts[u].lastLogin > INACTIVE_MS) { 
                delete accounts[u]; 
                changed = true; 
            } 
        });
        if (changed) saveAccounts();
    }, 3600000);

    // ── Odalar ve Sabitler ───────────────────────────────────
    const rooms = {};
    const VOTE_TIME = 15;
    const ROUND_TIME = 180;
    const END_WAIT = 10;
    const MAX_PLAYERS = 10;
    const MAPS = { arena: { name: 'Arena', size: 30 } };
    const COLORS = { red: '#ff0000', blue: '#0000ff' };
    const WEAPONS = { glock: { name: 'Glock', damage: 20, cost: 0 } };
    const CHARACTERS = { soldier: { name: 'Asker', cost: 0 } };
    const PROFANITY = ['kufur1', 'kufur2']; 
    const BAN_DURATION = 7 * 24 * 60 * 60 * 1000;

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
        const map=MAPS[r.currentMap]; const half=(map.sizeX||map.size)/2-2;
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

    // ── Socket Bağlantısı ───────────────────────────────────
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
            socket.to(rid).volatile.emit('playerMoved',{id:socket.id,x:data.x,y:data.y,z:data.z,rotY:data.rotY});
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
                const map=MAPS[r.currentMap]; const half=(map.sizeX||map.size)/2-2;
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

        socket.on('throwItem', (data) => {
            const r=rooms[rid]; if(!r||r.phase!=='playing') return;
            if(!data||typeof data.x!=='number'||typeof data.z!=='number') return;
            socket.to(rid).emit('itemThrown',{id:socket.id,kind:data.kind,x:data.x,y:data.y,z:data.z,vx:data.vx,vy:data.vy,vz:data.vz});
        });

        socket.on('grenadeExplode', (data) => {
            const r=rooms[rid]; if(!r||r.phase!=='playing') return;
            const thrower=r.players[socket.id]; if(!thrower) return;
            if(!data||typeof data.x!=='number'||typeof data.z!=='number') return;
            const x=data.x, z=data.z;
            const radius=Math.min(data.radius||6,8);
            const maxDamage=Math.min(data.damage||70,100);
            Object.keys(r.players).forEach(pid=>{
                const target=r.players[pid];
                if(!target||target.team===thrower.team) return;
                const dx=target.x-x, dz=target.z-z;
                const dist=Math.sqrt(dx*dx+dz*dz);
                if(dist<radius){
                    const dmg=Math.round(maxDamage*(1-dist/radius));
                    target.health-=dmg;
                    if(target.health<=0){
                        target.health=100; target.deaths++;
                        thrower.kills++; thrower.killPoints=(thrower.killPoints||0)+1;
                        r.teamKills[thrower.team]=(r.teamKills[thrower.team]||0)+1;
                        const map=MAPS[r.currentMap]; const half=(map.sizeX||map.size)/2-2;
                        if(target.team==='red'){target.x=-half+Math.random()*4;target.z=Math.random()*6-3;}
                        else{target.x=half-Math.random()*4;target.z=Math.random()*6-3;}
                        io.to(rid).emit('playerDied',{deadId:pid,killerId:socket.id});
                        io.to(rid).emit('teamKills',r.teamKills);
                        io.to(rid).emit('scoreUpdate',{id:pid,kills:target.kills,deaths:target.deaths});
                        io.to(rid).emit('scoreUpdate',{id:socket.id,kills:thrower.kills,deaths:thrower.deaths,killPoints:thrower.killPoints});
                    } else {
                        io.to(pid).emit('damaged',{health:target.health});
                    }
                }
            });
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
            if(username&&accounts[username]){accounts[username].lastLogin=Date.now();} 
            const reds=Object.values(room.players).filter(p=>p.team==='red').length;
            const blues=Object.values(room.players).filter(p=>p.team==='blue').length;
            const team=reds<=blues?'red':'blue';
            const map=MAPS[room.currentMap]; const half=(map.sizeX||map.size)/2-2;
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

    // ── Sunucu Rutinleri ─────────────────────────────────────
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

    // 15 dakikalık arka plan görevi
    setInterval(() => {
        try {
            console.log("=== ARKA PLAN GÖREVİ BAŞLADI ===");
            if (fs.existsSync(ACCOUNTS_FILE)) {
                const hamVeri = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
                let hesaplar = JSON.parse(hamVeri);
                console.log("Hesaplar kontrol ediliyor...");
                fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(hesaplar, null, 2));
            }
            console.log("=== ARKA PLAN GÖREVİ BAŞARIYLA BİTTİ ===");
        } catch (error) {
            console.error("Arka plan görevi çalışırken hata oluştu:", error);
        }
    }, 15 * 60 * 1000);
};
