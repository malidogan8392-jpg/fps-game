const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// MongoDB Bağlantısı (Boş kalırsa geçici bellekte çalışır, hata vermez)
const MONGO_URI = process.env.MONGO_URI || ""; 
let useDatabase = false;

if (MONGO_URI) {
    mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(() => { console.log("MongoDB Bağlantısı Başarılı!"); useDatabase = true; })
        .catch(err => console.log("Veritabanı bağlanamadı, yerel bellek aktif."));
}

const accountSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    hash: { type: String, required: true },
    killPoints: { type: Number, default: 0 },
    unlocked: { type: [String], default: ['glock'] },
    banUntil: { type: Number, default: 0 },
    lastLogin: { type: Number, default: Date.now }
});
const Account = mongoose.model('Account', accountSchema);

const MAX_PLAYERS  = 10;
const ROUND_TIME   = 600;
const END_WAIT     = 10;
const VOTE_TIME    = 30;
const COLORS       = { red: '#e74c3c', blue: '#3498db' };

const PROFANITY = [
  'orospu','oç','göt','sik','amk','bok','piç','yarrak','oruspu','amına',
  'sikerim','sikeyim','orosp','fuck','shit','bitch','asshole','cunt','nigger','bastard'
];

function filterText(text) {
    let filtered = text;
    PROFANITY.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filtered = filtered.replace(regex, '***');
    });
    return filtered;
}

const WEAPONS = {
  glock:   { name: 'Glock',   damage: 34,  cost: 0  },
  uzi:     { name: 'Uzi',     damage: 20,  cost: 5  },
  sniper:  { name: 'Sniper',  damage: 100, cost: 15 }
};

const MAPS = {
  dust2: { name: 'de_dust2', size: 60, walls: [] },
  mirage: { name: 'de_mirage', size: 50, walls: [] }
};

let rooms = {};
let memoryAccounts = {};

function getOrCreateRoom() {
    for (let id in rooms) {
        if (Object.keys(rooms[id].players).length < MAX_PLAYERS && rooms[id].phase !== 'end') {
            return rooms[id];
        }
    }
    const rid = 'room_' + Math.random().toString(36).substring(2, 9);
    rooms[rid] = {
        id: rid, name: 'Resmi Sunucu #' + Math.floor(Math.random()*900+100),
        players: {}, teamKills: { red: 0, blue: 0 }, timeLeft: ROUND_TIME,
        phase: 'play', currentMap: 'dust2', votes: {}, lastActive: Date.now()
    };
    return rooms[rid];
}

setInterval(() => {
    for (let rid in rooms) {
        let room = rooms[rid];
        if (Object.keys(room.players).length === 0) {
            if (Date.now() - room.lastActive > 60000) delete rooms[rid];
            continue;
        }
        if (room.phase === 'play') {
            room.timeLeft--;
            if (room.timeLeft <= 0) {
                room.phase = 'end'; room.timeLeft = END_WAIT;
                io.to(rid).emit('phaseUpdate', { phase: 'end', timeLeft: END_WAIT, winner: room.teamKills.red > room.teamKills.blue ? 'red' : 'blue' });
            }
        } else if (room.phase === 'end') {
            room.timeLeft--;
            if (room.timeLeft <= 0) {
                room.phase = 'vote'; room.timeLeft = VOTE_TIME; room.votes = {};
                io.to(rid).emit('phaseUpdate', { phase: 'vote', timeLeft: VOTE_TIME });
            }
        } else if (room.phase === 'vote') {
            room.timeLeft--;
            if (room.timeLeft <= 0) {
                let counts = { dust2: 0, mirage: 0 };
                Object.values(room.votes).forEach(v => { if(counts[v]!==undefined) counts[v]++; });
                room.currentMap = counts.dust2 >= counts.mirage ? 'dust2' : 'mirage';
                room.phase = 'play'; room.timeLeft = ROUND_TIME;
                room.teamKills = { red: 0, blue: 0 };
                io.to(rid).emit('phaseUpdate', { phase: 'play', timeLeft: ROUND_TIME, currentMap: room.currentMap, mapData: MAPS[room.currentMap] });
                Object.values(room.players).forEach(p => {
                    p.health = 100; p.kills = 0; p.deaths = 0;
                    const map = MAPS[room.currentMap]; const half = map.size/2-2;
                    if(p.team==='red'){ p.x = -half+Math.random()*4; p.z = Math.random()*6-3; }
                    else { p.x = half-Math.random()*4; p.z = Math.random()*6-3; }
                });
                io.to(rid).emit('initRound', { players: room.players });
            }
        }
        io.to(rid).emit('timeSync', { timeLeft: room.timeLeft });
    }
}, 1000);

io.on('connection', (socket) => {
    let currentRoomId = null;

    socket.on('auth', async (data) => {
        const { type, username, password } = data;
        if (!username || !password || username.length < 3 || password.length < 4) {
            return socket.emit('authRes', { success: false, msg: 'Geçersiz giriş.' });
        }
        const hash = crypto.createHash('sha256').update(password).digest('hex');

        if (type === 'register') {
            if (useDatabase) {
                const exist = await Account.findOne({ username });
                if (exist) return socket.emit('authRes', { success: false, msg: 'Bu ad alınmış.' });
                const newAcc = new Account({ username, hash });
                await newAcc.save();
                socket.emit('authRes', { success: true, username, killPoints: 0, unlocked: ['glock'] });
            } else {
                if (memoryAccounts[username]) return socket.emit('authRes', { success: false, msg: 'Bu ad alınmış.' });
                memoryAccounts[username] = { username, hash, killPoints: 0, unlocked: ['glock'], banUntil: 0, lastLogin: Date.now() };
                socket.emit('authRes', { success: true, username, killPoints: 0, unlocked: ['glock'] });
            }
        } else {
            let user = useDatabase ? await Account.findOne({ username }) : memoryAccounts[username];
            if (!user || user.hash !== hash) return socket.emit('authRes', { success: false, msg: 'Hatalı şifre/ad.' });
            
            socket.emit('authRes', { success: true, username, killPoints: user.killPoints, unlocked: user.unlocked });
        }
    });

    socket.on('joinGame', async (data) => {
        const { username } = data;
        let room = getOrCreateRoom();
        currentRoomId = room.id;
        socket.join(currentRoomId);

        const reds = Object.values(room.players).filter(p => p.team === 'red').length;
        const blues = Object.values(room.players).filter(p => p.team === 'blue').length;
        const team = reds <= blues ? 'red' : 'blue';

        const map = MAPS[room.currentMap]; const half = map.size/2-2;
        let sx = team === 'red' ? -half + Math.random()*4 : half - Math.random()*4;
        let sz = Math.random()*6-3;

        let pKillPoints = 0; let pUnlocked = ['glock'];
        if (username) {
            let acc = useDatabase ? await Account.findOne({ username }) : memoryAccounts[username];
            if (acc) { pKillPoints = acc.killPoints; pUnlocked = acc.unlocked; }
        }

        room.players[socket.id] = {
            id: socket.id, username, name: username || 'Oyuncu',
            x: sx, y: 0, z: sz, rotY: 0, health: 100,
            kills: 0, deaths: 0, killPoints: pKillPoints,
            weapon: 'glock', unlocked: pUnlocked, team, color: COLORS[team]
        };

        socket.emit('init', {
            id: socket.id, players: room.players, roomId: room.id, roomName: room.name,
            phase: room.phase, currentMap: room.currentMap, mapData: MAPS[room.currentMap],
            teamKills: room.teamKills, timeLeft: room.timeLeft, myTeam: team,
            maps: Object.keys(MAPS).map(k => ({ id: k, name: MAPS[k].name })), weapons: WEAPONS
        });

        socket.to(currentRoomId).emit('playerJoined', room.players[socket.id]);
    });

    socket.on('chatMessage', (msg) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const player = rooms[currentRoomId].players[socket.id];
        if (!player) return;
        io.to(currentRoomId).emit('chatMessage', { sender: player.name, team: player.team, color: player.color, text: filterText(msg) });
    });

    socket.on('move', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        let p = rooms[currentRoomId].players[socket.id];
        if (p && rooms[currentRoomId].phase === 'play') {
            p.x = data.x; p.z = data.z; p.rotY = data.rotY;
            socket.to(currentRoomId).emit('playerMoved', { id: socket.id, x: p.x, z: p.z, rotY: p.rotY });
        }
    });

    socket.on('fire', (data) => {
        if (currentRoomId) socket.to(currentRoomId).emit('bulletFired', data);
    });

    socket.on('hit', async (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        let room = rooms[currentRoomId];
        let shooter = room.players[socket.id];
        let target = room.players[data.targetId];

        if (!shooter || !target || target.health <= 0 || shooter.team === target.team) return;

        target.health -= WEAPONS[shooter.weapon].damage;

        if (target.health <= 0) {
            target.health = 0; target.deaths++; shooter.kills++;
            room.teamKills[shooter.team]++;
            io.to(currentRoomId).emit('teamKills', room.teamKills);

            if (shooter.username) {
                if (useDatabase) {
                    await Account.updateOne({ username: shooter.username }, { $inc: { killPoints: 2 } });
                    let acc = await Account.findOne({ username: shooter.username });
                    if(acc) shooter.killPoints = acc.killPoints;
                } else if (memoryAccounts[shooter.username]) {
                    memoryAccounts[shooter.username].killPoints += 2;
                    shooter.killPoints = memoryAccounts[shooter.username].killPoints;
                }
            }

            io.to(currentRoomId).emit('playerDied', { deadId: target.id, killerId: shooter.id });
            io.to(currentRoomId).emit('scoreUpdate', { id: shooter.id, kills: shooter.kills, deaths: shooter.deaths, killPoints: shooter.killPoints });
            io.to(currentRoomId).emit('scoreUpdate', { id: target.id, kills: target.kills, deaths: target.deaths });

            setTimeout(() => {
                if (room.players[target.id]) {
                    room.players[target.id].health = 100;
                    const map = MAPS[room.currentMap]; const half = map.size/2-2;
                    target.x = target.team === 'red' ? -half+Math.random()*4 : half-Math.random()*4;
                    target.z = Math.random()*6-3;
                    io.to(currentRoomId).emit('respawn', { id: target.id, x: target.x, z: target.z, health: 100 });
                }
            }, 3000);
        } else {
            io.to(currentRoomId).emit('damaged', { id: target.id, health: target.health });
        }
    });

    socket.on('buyWeapon', async (wid) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        let p = rooms[currentRoomId].players[socket.id];
        if (!p || !p.username || !WEAPONS[wid]) return;

        let user = useDatabase ? await Account.findOne({ username: p.username }) : memoryAccounts[p.username];
        if (!user || user.unlocked.includes(wid)) return;

        if (user.killPoints >= WEAPONS[wid].cost) {
            user.killPoints -= WEAPONS[wid].cost;
            user.unlocked.push(wid);
            if (useDatabase) await user.save();
            p.killPoints = user.killPoints; p.unlocked = user.unlocked;
            socket.emit('shopOk', { unlocked: user.unlocked, killPoints: user.killPoints, weaponId: wid });
        } else { socket.emit('shopMsg', 'Yetersiz Puan!'); }
    });

    socket.on('switchWeapon', (wid) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        let p = rooms[currentRoomId].players[socket.id];
        if (p && p.unlocked.includes(wid)) {
            p.weapon = wid;
            socket.to(currentRoomId).emit('weaponChanged', { id: socket.id, weapon: wid });
        }
    });

    socket.on('disconnect', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            delete rooms[currentRoomId].players[socket.id];
            io.to(currentRoomId).emit('playerLeft', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000
