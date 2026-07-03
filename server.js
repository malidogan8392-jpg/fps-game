const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const mongoose = require('mongoose'); // Kalıcı depolama için eklendi

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const MAX_PLAYERS  = 10;
const ROUND_TIME   = 600;
const END_WAIT     = 10;
const VOTE_TIME    = 30;
const BAN_DURATION = 7 * 24 * 3600 * 1000;
const INACTIVE_MS  = 90 * 24 * 3600 * 1000;
const COLORS       = { red: '#e74c3c', blue: '#3498db' };

const PROFANITY = [
  'orospu','oç','göt','sik','amk','bok','piç','yarrak','oruspu','amına',
  'sikerim','sikeyim','orosp','fuck','shit','bitch','asshole','cunt','nigger','bastard'
];

// ── MONGOOSE VERİTABANI ALTYAPISI ────────────────────────
const MONGO_URI = process.env.MONGO_URI || "";
let useDatabase = false;

if (MONGO_URI) {
    mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(() => { console.log("MongoDB Bağlantısı Başarılı!"); useDatabase = true; })
        .catch(err => console.log("Veritabanı bağlanamadı, yerel dosya modu aktif."));
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
// ─────────────────────────────────────────────────────────

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
let localAccounts = {};
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

function loadAccounts() {
  if (useDatabase) return;
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      localAccounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    }
  } catch(e) { console.error("Dosya okuma hatası:", e); }
}

function saveAccounts() {
  if (useDatabase) return;
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(localAccounts, null, 2), 'utf8');
  } catch(e) { console.error("Dosya yazma hatası:", e); }
}

loadAccounts();

function getOrCreateRoom() {
  for (let id in rooms) {
    let r = rooms[id];
    if (Object.keys(r.players).length < MAX_PLAYERS && r.phase !== 'end') {
      return r;
    }
  }
  const rid = 'room_' + Math.random().toString(36).substring(2, 9);
  rooms[rid] = {
    id: rid,
    name: 'Resmi Sunucu #' + Math.floor(Math.random() * 900 + 100),
    players: {},
    teamKills: { red: 0, blue: 0 },
    timeLeft: ROUND_TIME,
    phase: 'play',
    currentMap: 'dust2',
    votes: {},
    lastActive: Date.now()
  };
  return rooms[rid];
}

setInterval(() => {
  for (let rid in rooms) {
    let room = rooms[rid];
    if (Object.keys(room.players).length === 0) {
      if (Date.now() - room.lastActive > 60000) {
        delete rooms[rid];
      }
      continue;
    }
    if (room.phase === 'play') {
      room.timeLeft--;
      if (room.timeLeft <= 0) {
        room.phase = 'end';
        room.timeLeft = END_WAIT;
        let winner = 'tie';
        if (room.teamKills.red > room.teamKills.blue) winner = 'red';
        else if (room.teamKills.blue > room.teamKills.red) winner = 'blue';
        io.to(rid).emit('phaseUpdate', { phase: 'end', timeLeft: END_WAIT, winner });
      }
    } else if (room.phase === 'end') {
      room.timeLeft--;
      if (room.timeLeft <= 0) {
        room.phase = 'vote';
        room.timeLeft = VOTE_TIME;
        room.votes = {};
        io.to(rid).emit('phaseUpdate', { phase: 'vote', timeLeft: VOTE_TIME });
      }
    } else if (room.phase === 'vote') {
      room.timeLeft--;
      if (room.timeLeft <= 0) {
        let counts = { dust2: 0, mirage: 0 };
        Object.values(room.votes).forEach(v => {
          if (counts[v] !== undefined) counts[v]++;
        });
        let nextMap = 'dust2';
        if (counts.mirage > counts.dust2) nextMap = 'mirage';
        room.currentMap = nextMap;
        room.phase = 'play';
        room.timeLeft = ROUND_TIME;
        room.teamKills = { red: 0, blue: 0 };
        io.to(rid).emit('phaseUpdate', {
          phase: 'play',
          timeLeft: ROUND_TIME,
          currentMap: room.currentMap,
          mapData: MAPS[room.currentMap]
        });
        Object.values(room.players).forEach(p => {
          p.health = 100;
          p.kills = 0;
          p.deaths = 0;
          const map = MAPS[room.currentMap];
          const half = map.size / 2 - 2;
          if (p.team === 'red') {
            p.x = -half + Math.random() * 4;
            p.z = Math.random() * 6 - 3;
          } else {
            p.x = half - Math.random() * 4;
            p.z = Math.random() * 6 - 3;
          }
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
      return socket.emit('authRes', { success: false, msg: 'Geçersiz kullanıcı adı veya şifre.' });
    }
    const hash = crypto.createHash('sha256').update(password).digest('hex');

    if (type === 'register') {
      if (useDatabase) {
        const exist = await Account.findOne({ username });
        if (exist) return socket.emit('authRes', { success: false, msg: 'Bu kullanıcı adı zaten alınmış.' });
        const newAcc = new Account({ username, hash });
        await newAcc.save();
        socket.emit('authRes', { success: true, username, killPoints: 0, unlocked: ['glock'] });
      } else {
        if (localAccounts[username]) return socket.emit('authRes', { success: false, msg: 'Bu kullanıcı adı zaten alınmış.' });
        localAccounts[username] = { username, hash, killPoints: 0, unlocked: ['glock'], banUntil: 0, lastLogin: Date.now() };
        saveAccounts();
        socket.emit('authRes', { success: true, username, killPoints: 0, unlocked: ['glock'] });
      }
    } else {
      let user = null;
      if (useDatabase) {
        user = await Account.findOne({ username });
      } else {
        user = localAccounts[username];
      }

      if (!user || user.hash !== hash) {
        return socket.emit('authRes', { success: false, msg: 'Hatalı kullanıcı adı veya şifre.' });
      }
      if (user.banUntil > Date.now()) {
        return socket.emit('authRes', { success: false, msg: 'Hesabınız yasaklanmıştır.' });
      }

      if (useDatabase) {
        user.lastLogin = Date.now(); await user.save();
      } else {
        user.lastLogin = Date.now(); saveAccounts();
      }
      socket.emit('authRes', { success: true, username, killPoints: user.killPoints, unlocked: user.unlocked });
    }
  });

  socket.on('joinGame', async (data) => {
    const { username } = data;
    let room = getOrCreateRoom();
    currentRoomId = room.id;
    socket.join(currentRoomId);
    room.lastActive = Date.now();

    const reds = Object.values(room.players).filter(p => p.team === 'red').length;
    const blues = Object.values(room.players).filter(p => p.team === 'blue').length;
    const team = reds <= blues ? 'red' : 'blue';

    const map = MAPS[room.currentMap];
    const half = map.size / 2 - 2;
    let sx, sz;
    if (team === 'red') {
      sx = -half + Math.random() * 4;
      sz = Math.random() * 6 - 3;
    } else {
      sx = half - Math.random() * 4;
      sz = Math.random() * 6 - 3;
    }

    const displayName = username || ('Oyuncu' + Math.floor(Math.random() * 9000 + 1000));
    
    let pKillPoints = 0;
    let pUnlocked = ['glock'];

    if (username) {
      if (useDatabase) {
        let acc = await Account.findOne({ username });
        if (acc) { pKillPoints = acc.killPoints; pUnlocked = acc.unlocked; }
      } else if (localAccounts[username]) {
        pKillPoints = localAccounts[username].killPoints;
        pUnlocked = localAccounts[username].unlocked;
      }
    }

    room.players[socket.id] = {
      id: socket.id,
      username,
      name: displayName,
      x: sx, y: 0, z: sz, rotY: 0,
      health: 100, kills: 0, deaths: 0,
      killPoints: pKillPoints,
      weapon: 'glock',
      unlocked: pUnlocked,
      team,
      color: COLORS[team]
    };

    socket.emit('init', {
      id: socket.id,
      players: room.players,
      roomId: room.id,
      roomName: room.name,
      phase: room.phase,
      currentMap: room.currentMap,
      mapData: MAPS[room.currentMap],
      teamKills: room.teamKills,
      timeLeft: room.timeLeft,
      myTeam: team,
      maps: Object.keys(MAPS).map(k => ({ id: k, name: MAPS[k].name })),
      weapons: WEAPONS
    });

    socket.to(currentRoomId).emit('playerJoined', room.players[socket.id]);
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
    if (!currentRoomId || !rooms[currentRoomId]) return;
    socket.to(currentRoomId).emit('bulletFired', data);
  });

  socket.on('hit', async (data) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    let room = rooms[currentRoomId];
    if (room.phase !== 'play') return;
    let shooter = room.players[socket.id];
    let target = room.players[data.targetId];

    if (!shooter || !target || target.health <= 0 || shooter.team === target.team) return;

    let dmg = WEAPONS[shooter.weapon] ? WEAPONS[shooter.weapon].damage : 20;
    target.health -= dmg;

    if (target.health <= 0) {
      target.health = 0;
      target.deaths++;
      shooter.kills++;
      room.teamKills[shooter.team]++;
      io.to(currentRoomId).emit('teamKills', room.teamKills);

      if (shooter.username) {
        if (useDatabase) {
          await Account.updateOne({ username: shooter.username }, { $inc: { killPoints: 2 } });
          let acc = await Account.findOne({ username: shooter.username });
          if (acc) shooter.killPoints = acc.killPoints;
        } else if (localAccounts
