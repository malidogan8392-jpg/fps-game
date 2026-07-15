const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ACCOUNTS_FILE = path.join(process.cwd(), 'hesaplar.json');

// ── GitHub üzerinden kalıcı hesap depolama ────────────────────
// Render'ın diski her deploy/restart'ta sıfırlandığı için hesaplar.json'ı
// gerçekten kalıcı yapmak amacıyla, GitHub REST API üzerinden repodaki
// hesaplar.json dosyasına commit atıyoruz. Gerekli ortam değişkenleri
// (Render → Environment sekmesinden eklenir):
//   GITHUB_TOKEN  → "repo" (contents) yazma izni olan bir Personal Access Token
//   GITHUB_REPO   → "kullaniciadi/repo-adi" formatında
//   GITHUB_BRANCH → opsiyonel, varsayılan 'main'
const GH_TOKEN = process.env.GITHUB_TOKEN;
const GH_REPO = process.env.GITHUB_REPO;
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GH_API = GH_REPO ? `https://api.github.com/repos/${GH_REPO}/contents/hesaplar.json` : null;
const GH_FLUSH_MS = 15000; // her kayıt anında değil, 15 saniyede bir toplu commit atılır (rate limit + commit spamı önlemek için)

module.exports = function(io) {
    // ── Hesap Yönetimi ───────────────────────────────────────
    let accounts = {};
    let accountsSha = null;   // GitHub'daki dosyanın güncel sürüm imzası (üzerine yazmak için gerekli)
    let accountsDirty = false;
    let ghReady = !GH_TOKEN || !GH_REPO; // GitHub ayarlanmamışsa yerel dosyayla senkron kabul et

    function loadAccountsFromDisk() {
        try {
            if (fs.existsSync(ACCOUNTS_FILE)) {
                const fileContent = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
                if (fileContent.trim()) accounts = JSON.parse(fileContent);
            }
        } catch (e) {
            console.error('Hesap okuma hatası (yerel):', e.message);
        }
    }

    async function ghRequest(method, body) {
        const url = method === 'GET' ? `${GH_API}?ref=${GH_BRANCH}` : GH_API;
        return fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${GH_TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        });
    }

    async function loadAccountsFromGithub() {
        if (!GH_TOKEN || !GH_REPO) {
            console.warn('⚠️ GITHUB_TOKEN / GITHUB_REPO tanımlı değil — hesaplar sadece yerel diske yazılacak, Render\'da kalıcı OLMAYACAK.');
            loadAccountsFromDisk();
            return;
        }
        try {
            const res = await ghRequest('GET');
            if (res.status === 200) {
                const data = await res.json();
                accountsSha = data.sha;
                const content = Buffer.from(data.content, 'base64').toString('utf8');
                accounts = content.trim() ? JSON.parse(content) : {};
                console.log(`💾 GitHub'dan ${Object.keys(accounts).length} kayıtlı hesap yüklendi.`);
            } else if (res.status === 404) {
                console.log("ℹ️ Repoda hesaplar.json henüz yok, ilk kayıtla birlikte oluşturulacak.");
                accounts = {}; accountsSha = null;
            } else {
                console.error('❌ GitHub\'dan hesap okunamadı:', res.status, await res.text());
                loadAccountsFromDisk(); // en azından bu oturum için yerel yedekten devam et
            }
        } catch (e) {
            console.error('❌ GitHub bağlantı hatası:', e.message);
            loadAccountsFromDisk();
        } finally {
            ghReady = true;
        }
    }

    async function flushAccountsToGithub() {
        if (!accountsDirty || !GH_TOKEN || !GH_REPO) return;
        accountsDirty = false;
        const content = Buffer.from(JSON.stringify(accounts, null, 2)).toString('base64');
        try {
            const res = await ghRequest('PUT', {
                message: '💾 hesaplar güncellendi',
                content, branch: GH_BRANCH,
                sha: accountsSha || undefined
            });
            if (res.status === 200 || res.status === 201) {
                const data = await res.json();
                accountsSha = data.content.sha;
            } else if (res.status === 409) {
                // Başka bir işlem arada commit atmış (sha uyuşmuyor): güncel sha'yı çekip bir sonraki flush'ta tekrar dene
                const getRes = await ghRequest('GET');
                if (getRes.status === 200) { accountsSha = (await getRes.json()).sha; }
                accountsDirty = true;
            } else {
                console.error('❌ GitHub\'a hesap kaydedilemedi:', res.status, await res.text());
                accountsDirty = true;
            }
        } catch (e) {
            console.error('❌ GitHub kayıt isteği başarısız:', e.message);
            accountsDirty = true;
        }
    }

    function saveAccounts() {
        accountsDirty = true;
        // Aynı oturum içinde anlık kayıp olmaması için yerel dosyaya da hemen yazıyoruz;
        // asıl kalıcılığı sağlayan ise 15 saniyede bir GitHub'a atılan commit.
        try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2)); } catch (e) {}
    }

    loadAccountsFromGithub();
    const flushTimer = setInterval(flushAccountsToGithub, GH_FLUSH_MS);
    process.on('SIGTERM', () => { flushAccountsToGithub(); });
    process.on('SIGINT', () => { flushAccountsToGithub(); });

    function hashPwd(p) { return crypto.createHash('sha256').update(String(p || '') + ':fps2024').digest('hex'); }

    // ── Silahlar / Karakterler / Haritalar ───────────────────
    const WEAPONS = {
        glock:   { name: 'Glock',        damage: 34,  cd: 400,  cost: 0 },
        deagle:  { name: 'Desert Eagle', damage: 48,  cd: 550,  cost: 400 },
        uzi:     { name: 'Uzi',          damage: 20,  cd: 100,  cost: 250 },
        shotgun: { name: 'Shotgun',      damage: 65,  cd: 800,  cost: 450 },
        m4:      { name: 'M4A4',         damage: 33,  cd: 200,  cost: 500 },
        ak47:    { name: 'AK-47',        damage: 40,  cd: 220,  cost: 550 },
        sniper:  { name: 'AWP',          damage: 100, cd: 1500, cost: 900 },
        minigun: { name: 'Minigun',      damage: 16,  cd: 80,   cost: 1100 }
    };

    const CHARACTERS = {
        soldier: { name: 'Asker',        cost: 0 },
        desert:  { name: 'Çöl Kaplanı',  cost: 200 },
        urban:   { name: 'Şehir Avcısı', cost: 200 },
        ghost:   { name: 'Hayalet',      cost: 350 },
        phoenix: { name: 'Anka',         cost: 500 }
    };

    // Simetrik (kırmızı/mavi için adil) engel/sandık dizilimi üretir.
    function genWalls(seeds, extra) {
        const walls = [];
        seeds.forEach(([x, z, w, d]) => {
            walls.push({ x, z, w, d });
            if (x !== 0) walls.push({ x: -x, z, w, d });
        });
        if (extra) extra.forEach(w => walls.push(w));
        return walls;
    }

    const MAPS = {
        arena: {
            name: 'Arena', theme: 'grass', size: 34,
            walls: genWalls([
                [6, 4, 2, 2], [10, -6, 2, 2], [3, -9, 2, 4], [8, 9, 4, 2]
            ])
        },
        desert: {
            name: 'Çöl', theme: 'sand', size: 38,
            walls: genWalls([
                [7, 0, 3, 3], [12, 8, 2, 2], [4, -10, 2, 2], [9, -4, 4, 2]
            ])
        },
        forest: {
            name: 'Orman', theme: 'forest', size: 40,
            walls: genWalls([
                [6, 6, 2, 3], [11, -5, 1.5, 1.5], [3, 12, 1.4, 1.4], [8, -11, 1.6, 1.6],
                [13, 2, 1.3, 1.3], [5, -3, 1.5, 1.5], [10, 10, 1.4, 1.4]
            ])
        },
        city: {
            name: 'Şehir', theme: 'urban', size: 42,
            walls: genWalls([
                [8, 5, 4, 4], [13, -8, 3, 3], [4, -13, 3, 5], [10, 12, 5, 3], [15, 0, 3, 3]
            ])
        },
        harbor: {
            name: 'Liman', theme: 'harbor', size: 40,
            walls: genWalls([
                [7, 3, 5, 2], [12, -7, 2, 6], [4, -12, 3, 2], [9, 10, 4, 2]
            ])
        },
        castle: {
            name: 'Kale', theme: 'grass', size: 40,
            model: { url: '/models/castle.glb', scale: 1, rotY: 0, offsetY: 0 }
        },
        labyrinth: {
            name: 'Labirent', theme: 'urban', size: 40,
            model: { url: '/models/labyrinth.glb', scale: 1, rotY: 0, offsetY: 0 }
        },
        warship: {
            name: 'Savaş Gemisi', theme: 'harbor', size: 44,
            model: { url: '/models/warship.glb', scale: 1, rotY: 0, offsetY: 0 }
        }
    };
    // NOT: castle/labyrinth/warship modelleri için scale/rotY/offsetY tahmini.
    // Tarayıcıda test edip "çok büyük/küçük/ters" derseniz buradan ayarlanır.
    // Bu haritalarda henüz collision (walls) verisi yok; mermiler model
    // geometrisini görsel olarak es geçer, isterseniz sonra manuel wall
    // koordinatları ekleyebiliriz.

    const COLORS = { red: '#ff0000', blue: '#0000ff' };
    const VOTE_TIME = 20;      // saniye
    const MATCH_TIME = 600;    // saniye (10 dk)
    const END_TIME = 5;        // saniye
    const MAX_PLAYERS = 10;
    const KILL_REWARD = 100;

    // ── Odalar ────────────────────────────────────────────
    const rooms = {};

    function getRoomList() {
        return Object.values(rooms).map(r => ({
            id: r.id, name: r.name, count: Object.keys(r.players).length,
            max: MAX_PLAYERS, phase: r.phase, map: r.currentMap
        }));
    }

    function findOrCreate() {
        return Object.values(rooms).find(r => Object.keys(r.players).length < MAX_PLAYERS) || makeRoom();
    }

    function makeRoom() {
        const id = crypto.randomBytes(2).toString('hex').toUpperCase();
        rooms[id] = {
            id, name: 'Sunucu ' + id, players: {},
            phase: 'voting', currentMap: 'arena', votes: {}, teamKills: { red: 0, blue: 0 },
            timeLeft: VOTE_TIME, intervalId: null, lastActive: Date.now()
        };
        startVoting(id);
        return rooms[id];
    }

    function getSpawn(mapId, team) {
        const map = MAPS[mapId];
        const half = (map.sizeX || map.size) / 2 - 2;
        if (team === 'red') return { x: -half + Math.random() * 4, z: Math.random() * 6 - 3 };
        return { x: half - Math.random() * 4, z: Math.random() * 6 - 3 };
    }

    function pickVoteChoices() {
        const ids = Object.keys(MAPS);
        const shuffled = ids.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(3, ids.length));
    }

    function startVoting(rid) {
        const r = rooms[rid]; if (!r) return;
        clearInterval(r.intervalId);
        r.phase = 'voting';
        r.votes = {};
        r.voteChoices = pickVoteChoices();
        r.timeLeft = VOTE_TIME;

        io.to(rid).emit('phaseChange', {
            phase: 'voting', timeLeft: VOTE_TIME,
            maps: r.voteChoices.map(id => ({ id, name: MAPS[id].name }))
        });

        r.intervalId = setInterval(() => {
            r.timeLeft--;
            io.to(rid).emit('timerTick', r.timeLeft);
            if (r.timeLeft <= 0) finishVoting(rid);
        }, 1000);
    }

    function finishVoting(rid) {
        const r = rooms[rid]; if (!r) return;
        clearInterval(r.intervalId);
        const tally = {};
        (r.voteChoices || []).forEach(id => tally[id] = 0);
        Object.values(r.votes).forEach(id => { if (tally[id] != null) tally[id]++; });
        let winner = r.voteChoices[0];
        let best = -1;
        Object.entries(tally).forEach(([id, count]) => {
            if (count > best) { best = count; winner = id; }
        });
        r.currentMap = winner;
        startMatch(rid);
    }

    function startMatch(rid) {
        const r = rooms[rid]; if (!r) return;
        clearInterval(r.intervalId);

        r.phase = 'playing';
        r.timeLeft = MATCH_TIME;
        r.teamKills = { red: 0, blue: 0 };

        Object.values(r.players).forEach(p => {
            p.kills = 0; p.deaths = 0; p.health = 100;
            p.grenades = 1; p.smokes = 1;
            const sp = getSpawn(r.currentMap, p.team);
            p.x = sp.x; p.z = sp.z;
        });

        io.to(rid).emit('phaseChange', {
            phase: 'playing', map: r.currentMap, mapData: MAPS[r.currentMap],
            players: r.players, timeLeft: MATCH_TIME
        });

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

        io.to(rid).emit('phaseChange', { phase: 'ending', winner, teamKills: r.teamKills, timeLeft: END_TIME });

        r.intervalId = setTimeout(() => {
            if (rooms[rid]) startVoting(rid);
        }, END_TIME * 1000);
    }

    // Bir vuruşu (mermi ya da bomba) uygular; öldüyse ödül/yeniden doğma yapar.
    function applyDamage(rid, shooterId, targetId, damage) {
        const r = rooms[rid]; if (!r || r.phase !== 'playing') return;
        const target = r.players[targetId];
        const shooter = r.players[shooterId];
        if (!target || !shooter || target.team === shooter.team) return;

        target.health -= damage;

        if (target.health <= 0) {
            target.health = 100; target.deaths++; shooter.kills++;
            shooter.killPoints = (shooter.killPoints || 0) + KILL_REWARD;
            r.teamKills[shooter.team] = (r.teamKills[shooter.team] || 0) + 1;

            if (shooter.username && accounts[shooter.username.toLowerCase()]) {
                accounts[shooter.username.toLowerCase()].killPoints = shooter.killPoints;
                saveAccounts();
            }

            const sp = getSpawn(r.currentMap, target.team);
            target.x = sp.x; target.z = sp.z;
            target.grenades = 1; target.smokes = 1;

            io.to(rid).emit('playerDied', { deadId: targetId, killerId: shooterId });
            io.to(rid).emit('teamKills', r.teamKills);
            io.to(rid).emit('scoreUpdate', { id: targetId, kills: target.kills, deaths: target.deaths });
            io.to(rid).emit('scoreUpdate', { id: shooterId, kills: shooter.kills, deaths: shooter.deaths, killPoints: shooter.killPoints });
        } else {
            io.to(targetId).emit('damaged', { health: target.health });
        }
    }

    // ── Socket İşlemleri ────────────────────────────────────
    io.on('connection', (socket) => {
        let rid = null;
        let username = null;

        socket.on('register', ({ user, pwd }) => {
            if (!ghReady) { socket.emit('authErr', 'Sunucu hazırlanıyor, birkaç saniye sonra tekrar deneyin'); return; }
            user = String(user || '').trim();
            const lowUser = user.toLowerCase();

            if (!user || user.length < 3 || user.length > 20) {
                socket.emit('authErr', 'İsim 3-20 karakter olmalı'); return;
            }
            if (accounts[lowUser]) {
                socket.emit('authErr', 'Bu kullanıcı adı alınmış'); return;
            }

            accounts[lowUser] = {
                username: user, passwordHash: hashPwd(pwd), createdAt: Date.now(), lastLogin: Date.now(),
                killPoints: 0, unlockedWeapons: ['glock'], unlockedChars: ['soldier']
            };
            saveAccounts();
            username = user;
            socket.emit('authOk', { username: user });
        });

        socket.on('login', ({ user, pwd }) => {
            if (!ghReady) { socket.emit('authErr', 'Sunucu hazırlanıyor, birkaç saniye sonra tekrar deneyin'); return; }
            user = String(user || '').trim();
            const lowUser = user.toLowerCase();
            const a = accounts[lowUser];

            if (!a) { socket.emit('authErr', 'Kullanıcı bulunamadı'); return; }
            if (a.passwordHash !== hashPwd(pwd)) { socket.emit('authErr', 'Şifre yanlış'); return; }

            a.lastLogin = Date.now();
            if (!a.unlockedWeapons) a.unlockedWeapons = ['glock'];
            if (!a.unlockedChars) a.unlockedChars = ['soldier'];
            if (a.killPoints == null) a.killPoints = 0;
            saveAccounts();
            username = a.username;
            socket.emit('authOk', { username });
        });

        socket.on('getRooms', () => socket.emit('roomList', getRoomList()));
        socket.on('quickJoin', () => enterRoom(findOrCreate()));

        socket.on('joinRoom', (roomId) => {
            const r = rooms[roomId];
            if (!r) { socket.emit('gameErr', 'Sunucu bulunamadı'); return; }
            if (Object.keys(r.players).length >= MAX_PLAYERS) { socket.emit('gameErr', 'Sunucu dolu'); return; }
            enterRoom(r);
        });

        socket.on('vote', (mapId) => {
            const r = rooms[rid]; if (!r || r.phase !== 'voting') return;
            if (!(r.voteChoices || []).includes(mapId)) return;
            r.votes[socket.id] = mapId;
            const tally = {};
            (r.voteChoices || []).forEach(id => tally[id] = 0);
            Object.values(r.votes).forEach(id => { if (tally[id] != null) tally[id]++; });
            io.to(rid).emit('voteUpdate', tally);
        });

        socket.on('move', (data) => {
            const r = rooms[rid]; if (!r || !r.players[socket.id] || r.phase !== 'playing') return;
            const p = r.players[socket.id];
            p.x = data.x; p.y = data.y; p.z = data.z; p.rotY = data.rotY;
            r.lastActive = Date.now();
            socket.to(rid).volatile.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, z: data.z, rotY: data.rotY });
        });

        socket.on('shoot', (data) => {
            if (rooms[rid]?.phase !== 'playing') return;
            socket.to(rid).emit('bulletFired', { id: socket.id, ...data });
        });

        socket.on('hit', (data) => {
            const r = rooms[rid]; if (!r || r.phase !== 'playing') return;
            const shooter = r.players[socket.id];
            if (!shooter) return;
            const weapon = WEAPONS[shooter.weapon || 'glock'] || WEAPONS.glock;
            applyDamage(rid, socket.id, data.targetId, weapon.damage);
        });

        socket.on('throwItem', (data) => {
            const r = rooms[rid]; if (!r || r.phase !== 'playing') return;
            const p = r.players[socket.id]; if (!p) return;
            const kind = data.kind === 'smoke' ? 'smoke' : 'grenade';
            if (kind === 'grenade') {
                if ((p.grenades || 0) <= 0) return;
                p.grenades--;
            } else {
                if ((p.smokes || 0) <= 0) return;
                p.smokes--;
            }
            socket.to(rid).emit('itemThrown', { id: socket.id, kind, x: data.x, y: data.y, z: data.z, vx: data.vx, vy: data.vy, vz: data.vz });
        });

        socket.on('grenadeExplode', (data) => {
            const r = rooms[rid]; if (!r || r.phase !== 'playing') return;
            const radius = 6, maxDamage = 70; // sunucu taraflı sabit değerler (istemci verisine güvenilmez)
            Object.keys(r.players).forEach(targetId => {
                if (targetId === socket.id) return;
                const target = r.players[targetId];
                const dx = target.x - data.x, dz = target.z - data.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > radius) return;
                const dmg = Math.round(maxDamage * (1 - dist / radius));
                if (dmg > 0) applyDamage(rid, socket.id, targetId, dmg);
            });
        });

        socket.on('buyWeapon', (id) => {
            const r = rooms[rid]; const p = r && r.players[socket.id];
            if (!p) return;
            const w = WEAPONS[id];
            if (!w) { socket.emit('shopMsg', 'Geçersiz silah'); return; }
            if ((p.unlocked || []).includes(id)) { socket.emit('shopMsg', 'Zaten sahipsin'); return; }
            if ((p.killPoints || 0) < w.cost) { socket.emit('shopMsg', 'Yetersiz puan'); return; }

            p.killPoints -= w.cost;
            p.unlocked = [...(p.unlocked || []), id];

            if (username && accounts[username.toLowerCase()]) {
                const a = accounts[username.toLowerCase()];
                a.killPoints = p.killPoints;
                a.unlockedWeapons = p.unlocked;
                saveAccounts();
            }

            socket.emit('shopOk', { unlocked: p.unlocked, killPoints: p.killPoints, weaponId: id });
        });

        socket.on('switchWeapon', (id) => {
            const r = rooms[rid]; const p = r && r.players[socket.id];
            if (!p || !WEAPONS[id] || !(p.unlocked || []).includes(id)) return;
            p.weapon = id;
            io.to(rid).emit('weaponChanged', { id: socket.id, weapon: id });
        });

        socket.on('buyChar', (id) => {
            const r = rooms[rid]; const p = r && r.players[socket.id];
            if (!p) return;
            const c = CHARACTERS[id];
            if (!c) { socket.emit('shopMsg', 'Geçersiz karakter'); return; }
            if ((p.unlockedChars || []).includes(id)) { socket.emit('shopMsg', 'Zaten sahipsin'); return; }
            if ((p.killPoints || 0) < c.cost) { socket.emit('shopMsg', 'Yetersiz puan'); return; }

            p.killPoints -= c.cost;
            p.unlockedChars = [...(p.unlockedChars || []), id];

            if (username && accounts[username.toLowerCase()]) {
                const a = accounts[username.toLowerCase()];
                a.killPoints = p.killPoints;
                a.unlockedChars = p.unlockedChars;
                saveAccounts();
            }

            socket.emit('charOk', { unlockedChars: p.unlockedChars, killPoints: p.killPoints, charId: id });
        });

        socket.on('switchCharacter', (id) => {
            const r = rooms[rid]; const p = r && r.players[socket.id];
            if (!p || !CHARACTERS[id] || !(p.unlockedChars || []).includes(id)) return;
            p.character = id;
            io.to(rid).emit('characterChanged', { id: socket.id, character: id });
        });

        socket.on('chat', (msg) => {
            const r = rooms[rid]; const p = r && r.players[socket.id];
            if (!p) return;
            msg = String(msg || '').slice(0, 200).trim();
            if (!msg) return;
            io.to(rid).emit('chatMsg', { name: p.name, msg, team: p.team });
        });

        socket.on('disconnect', () => {
            const r = rooms[rid]; if (!r) return;
            delete r.players[socket.id];
            io.to(rid).emit('playerLeft', socket.id);
            io.emit('roomListUpdate', getRoomList());
            if (Object.keys(r.players).length === 0) r.lastActive = Date.now();
        });

        function enterRoom(room) {
            rid = room.id; socket.join(room.id); room.lastActive = Date.now();
            const reds = Object.values(room.players).filter(p => p.team === 'red').length;
            const blues = Object.values(room.players).filter(p => p.team === 'blue').length;
            const team = reds <= blues ? 'red' : 'blue';

            const sp = getSpawn(room.currentMap, team);
            const acc = username ? accounts[username.toLowerCase()] : null;
            const displayName = username || ('Oyuncu' + Math.floor(Math.random() * 9000 + 1000));

            room.players[socket.id] = {
                id: socket.id, username, name: displayName,
                x: sp.x, y: 0, z: sp.z, rotY: 0, health: 100, kills: 0, deaths: 0,
                weapon: 'glock', character: 'soldier',
                team, color: COLORS[team],
                killPoints: acc ? (acc.killPoints || 0) : 0,
                unlocked: acc ? (acc.unlockedWeapons || ['glock']) : ['glock'],
                unlockedChars: acc ? (acc.unlockedChars || ['soldier']) : ['soldier'],
                grenades: 1, smokes: 1
            };

            socket.emit('init', {
                id: socket.id, players: room.players, roomId: room.id, roomName: room.name,
                phase: room.phase, currentMap: room.currentMap, mapData: MAPS[room.currentMap],
                teamKills: room.teamKills, timeLeft: room.timeLeft, myTeam: team,
                maps: (room.phase === 'voting' ? room.voteChoices : Object.keys(MAPS)).map(k => ({ id: k, name: MAPS[k].name })),
                weapons: WEAPONS, characters: CHARACTERS
            });
            socket.to(room.id).emit('playerJoined', room.players[socket.id]);
            io.emit('roomListUpdate', getRoomList());
        }
    });

    setInterval(() => {
        const now = Date.now();
        Object.keys(rooms).forEach(id => {
            const r = rooms[id];
            if (Object.keys(r.players).length === 0 && (now - r.lastActive) > 60000) {
                clearInterval(r.intervalId); clearTimeout(r.intervalId); delete rooms[id];
                io.emit('roomListUpdate', getRoomList());
            }
        });
    }, 15000);
};
