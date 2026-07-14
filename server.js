const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ACCOUNTS_FILE = path.join(process.cwd(), 'hesaplar.json');

module.exports = function(io) {
    let accounts = {};
    
    // Hesapları güvenli yükleme
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            const fileContent = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
            if (fileContent.trim()) {
                accounts = JSON.parse(fileContent);
                console.log(`💾 Toplam ${Object.keys(accounts).length} kayıtlı hesap başarıyla yüklendi.`);
            }
        }
    } catch (e) {
        console.error('❌ Hesaplar dosyası okunurken hata oluştu, sıfırlandı:', e.message);
        accounts = {};
    }

    let saveTimer = null;
    function saveAccounts() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try { 
                fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2)); 
                console.log("💾 Hesaplar dosyasına yazıldı.");
            } catch (e) { 
                console.error('❌ Hesaplar kaydedilemedi:', e.message); 
            }
        }, 1500);
    }

    // Geliştirilmiş ve güvenceye alınmış şifre hash fonksiyonu
    function hashPwd(p) { 
        const cleanPassword = String(p || '');
        return crypto.createHash('sha256').update(cleanPassword + ':fps2024').digest('hex'); 
    }

    const rooms = {};
    const MATCH_TIME = 600; // 10 Dakika
    const MAX_PLAYERS = 10;
    const MAPS = { arena: { name: 'Arena', size: 30 } };
    const COLORS = { red: '#ff0000', blue: '#0000ff' };
    const WEAPONS = { glock: { name: 'Glock', damage: 20, cost: 0 } };
    const CHARACTERS = { soldier: { name: 'Asker', cost: 0 } };

    function makeRoom() {
        const id = crypto.randomBytes(2).toString('hex').toUpperCase();
        rooms[id] = { id, name: 'Sunucu ' + id, players: {}, phase: 'playing', currentMap: 'arena', teamKills: { red: 0, blue: 0 }, timeLeft: MATCH_TIME, intervalId: null, lastActive: Date.now() };
        startMatch(id);
        return rooms[id];
    }

    function getRoomList() {
        return Object.values(rooms).map(r => ({ id: r.id, name: r.name, count: Object.keys(r.players).length, max: MAX_PLAYERS, phase: r.phase, map: r.currentMap }));
    }

    function findOrCreate() {
        return Object.values(rooms).find(r => Object.keys(r.players).length < MAX_PLAYERS) || makeRoom();
    }

    function startMatch(rid) {
        const r = rooms[rid]; if (!r) return;
        clearInterval(r.intervalId);
        
        r.phase = 'playing';
        r.timeLeft = MATCH_TIME;
        r.teamKills = { red: 0, blue: 0 };
        
        const map = MAPS[r.currentMap]; const half = (map.sizeX || map.size) / 2 - 2;
        Object.values(r.players).forEach(p => {
            p.kills = 0; p.deaths = 0; p.health = 100;
            if (p.team === 'red') { p.x = -half + Math.random() * 4; p.z = Math.random() * 6 - 3; }
            else { p.x = half - Math.random() * 4; p.z = Math.random() * 6 - 3; }
        });

        io.to(rid).emit('phaseChange', { phase: 'playing', map: r.currentMap, mapData: MAPS[r.currentMap], players: r.players, timeLeft: MATCH_TIME });
        
        r.intervalId = setInterval(() => {
            r.timeLeft--;
            io.to(rid).emit('timerTick', r.timeLeft);
            if (r.timeLeft <= 0) endMatch(rid);
        }, 1000);
    }

    function endMatch(rid) {
        const r = rooms[rid]; if (!r) return;
        clearInterval(r.intervalId);
        
        r.phase = 'ending';
        const winner = r.teamKills.red > r.teamKills.blue ? 'red' : r.teamKills.blue > r.teamKills.red ? 'blue' : 'tie';
        
        io.to(rid).emit('phaseChange', { phase: 'ending', winner, teamKills: r.teamKills, timeLeft: 5 });
        
        setTimeout(() => {
            if (rooms[rid]) startMatch(rid);
        }, 5000);
    }

    io.on('connection', (socket) => {
        let rid = null;
        let username = null;

        socket.on('register', ({user, pwd}) => {
            user = String(user || '').trim();
            const lowUser = user.toLowerCase();
            
            if(!user || user.length < 3 || user.length > 20){
                socket.emit('authErr', 'İsim 3-20 karakter olmalı');
                return;
            }
            if(accounts[lowUser]){
                socket.emit('authErr', 'Bu kullanıcı adı alınmış');
                return;
            }
            
            // Kayıt ederken hem orijinal ismi hem de küçük harf versiyonunu tutuyoruz
            accounts[lowUser] = {
                username: user, 
                passwordHash: hashPwd(pwd), 
                createdAt: Date.now(), 
                lastLogin: Date.now()
            };
            saveAccounts();
            username = user; 
            socket.emit('authOk', { username: user });
        });

        socket.on('login', ({user, pwd}) => {
            user = String(user || '').trim();
            const lowUser = user.toLowerCase();
            const a = accounts[lowUser];
            
            if(!a){
                socket.emit('authErr', 'Kullanıcı bulunamadı');
                return;
            }
            
            const clientHash = hashPwd(pwd);
            if(a.passwordHash !== clientHash){
                socket.emit('authErr', 'Şifre yanlış');
                return;
            }
            
            a.lastLogin = Date.now(); 
            saveAccounts();
            username = a.username; // Kayıtlı olan orijinal büyük/küçük harfli ismi alıyoruz
            socket.emit('authOk', { username: username });
        });

        socket.on('getRooms', () => socket.emit('roomList', getRoomList()));
        socket.on('quickJoin', () => enterRoom(findOrCreate()));
        
        socket.on('joinRoom', (roomId) => {
            const r=rooms[roomId];
            if(!r){socket.emit('gameErr','Sunucu bulunamadı');return;}
            if(Object.keys(r.players).length>=MAX_PLAYERS){socket.emit('gameErr','Sunucu dolu');return;}
            enterRoom(r);
        });

        socket.on('move', (data) => {
            const r=rooms[rid]; if(!r||!r.players[socket.id]||r.phase!=='playing') return;
            const p=r.players[socket.id];
            p.x=data.x; p.y=data.y; p.z=data.z; p.rotY=data.rotY;
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
                target.health=100; target.deaths++; shooter.kills++;
                r.teamKills[shooter.team]=(r.teamKills[shooter.team]||0)+1;
                
                const map=MAPS[r.currentMap]; const half=(map.sizeX||map.size)/2-2;
                if(target.team==='red'){target.x=-half+Math.random()*4;target.z=Math.random()*6-3;}
                else{target.x=half-Math.random()*4;target.z=Math.random()*6-3;}
                
                io.to(rid).emit('playerDied',{deadId:data.targetId,killerId:socket.id});
                io.to(rid).emit('teamKills',r.teamKills);
                io.to(rid).emit('scoreUpdate',{id:data.targetId,kills:target.kills,deaths:target.deaths});
                io.to(rid).emit('scoreUpdate',{id:socket.id,kills:shooter.kills,deaths:shooter.deaths});
            } else {
                io.to(data.targetId).emit('damaged',{health:target.health});
            }
        });

        socket.on('disconnect', () => {
            const r=rooms[rid]; if (!r) return;
            delete r.players[socket.id];
            io.to(rid).emit('playerLeft',socket.id);
            io.emit('roomListUpdate',getRoomList());
            if(Object.keys(r.players).length===0) r.lastActive=Date.now();
        });

        function enterRoom(room) {
            rid=room.id;
            socket.join(room.id);
            room.lastActive=Date.now();
            
            const reds=Object.values(room.players).filter(p=>p.team==='red').length;
            const blues=Object.values(room.players).filter(p=>p.team==='blue').length;
            const team=reds<=blues?'red':'blue';
            
            const map=MAPS[room.currentMap]; const half=(map.sizeX||map.size)/2-2;
            let sx,sz;
            if(team==='red'){sx=-half+Math.random()*4;sz=Math.random()*6-3;}
            else{sx=half-Math.random()*4;sz=Math.random()*6-3;}
            
            const displayName=username||('Oyuncu'+Math.floor(Math.random()*9000+1000));
            
            room.players[socket.id]={id:socket.id,username,name:displayName,x:sx,y:0,z:sz,rotY:0,health:100,kills:0,deaths:0,weapon:'glock',character:'soldier',team,color:COLORS[team]};
            
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
};
