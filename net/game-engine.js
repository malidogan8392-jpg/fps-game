window.WEAPONS = {
    glock:   { name: 'Glock',        damage: 34,  cd: 400,  cost: 0 },
    deagle:  { name: 'Desert Eagle', damage: 48,  cd: 550,  cost: 400 },
    uzi:     { name: 'Uzi',          damage: 20,  cd: 100,  cost: 250 },
    shotgun: { name: 'Shotgun',      damage: 65,  cd: 800,  cost: 450 },
    m4:      { name: 'M4A4',         damage: 33,  cd: 200,  cost: 500 },
    ak47:    { name: 'AK-47',        damage: 40,  cd: 220,  cost: 550 },
    sniper:  { name: 'AWP',          damage: 100, cd: 1500, cost: 900 },
    minigun: { name: 'Minigun',      damage: 16,  cd: 80,   cost: 1100 }
};

window.CHARACTERS = {
    soldier: { name: 'Asker',        cost: 0 },
    desert:  { name: 'Çöl Kaplanı',  cost: 200 },
    urban:   { name: 'Şehir Avcısı', cost: 200 },
    ghost:   { name: 'Hayalet',      cost: 350 },
    phoenix: { name: 'Anka',         cost: 500 }
};

function genWalls(seeds, extra) {
    const walls = [];
    seeds.forEach(([x, z, w, d]) => {
        walls.push({ x, z, w, d });
        if (x !== 0) walls.push({ x: -x, z, w, d });
    });
    if (extra) extra.forEach(w => walls.push(w));
    return walls;
}

window.MAPS = {
    arena:   { name: 'Arena', theme: 'grass', size: 34, walls: genWalls([[6, 4, 2, 2], [10, -6, 2, 2], [3, -9, 2, 4], [8, 9, 4, 2]]) },
    desert:  { name: 'Çöl', theme: 'sand', size: 38, walls: genWalls([[7, 0, 3, 3], [12, 8, 2, 2], [4, -10, 2, 2], [9, -4, 4, 2]]) },
    forest:  { name: 'Orman', theme: 'forest', size: 40, walls: genWalls([[6, 6, 2, 3], [11, -5, 1.5, 1.5], [3, 12, 1.4, 1.4], [8, -11, 1.6, 1.6], [13, 2, 1.3, 1.3], [5, -3, 1.5, 1.5], [10, 10, 1.4, 1.4]]) },
    city:    { name: 'Şehir', theme: 'urban', size: 42, walls: genWalls([[8, 5, 4, 4], [13, -8, 3, 3], [4, -13, 3, 5], [10, 12, 5, 3], [15, 0, 3, 3]]) },
    harbor:  { name: 'Liman', theme: 'harbor', size: 40, walls: genWalls([[7, 3, 5, 2], [12, -7, 2, 6], [4, -12, 3, 2], [9, 10, 4, 2]]) },
    castle:  { name: 'Kale', theme: 'grass', size: 40, model: { url: '/models/castle.glb', scale: 1, rotY: 0, offsetY: 0 } },
    castle_arena:  { name: 'Kale Arenası', theme: 'grass', size: 100, model: { url: '/castle_arena.glb', scale: 1, rotY: 0, offsetY: 0 } },
    neon_grand:    { name: 'Neon Kompleks', theme: 'urban', size: 110, model: { url: '/neon_grand.glb', scale: 1, rotY: 0, offsetY: 0 } },
    warehouse:     { name: 'Depo', theme: 'industrial', size: 65, model: { url: '/warehouse.glb', scale: 1, rotY: 0, offsetY: 0 } },
    district:      { name: 'Bölge', theme: 'urban', size: 55, model: { url: '/district.glb', scale: 1, rotY: 0, offsetY: 0 } },
    outpost:       { name: 'Karakol', theme: 'urban', size: 24, model: { url: '/outpost.glb', scale: 1, rotY: 0, offsetY: 0 } },
    outpost_neon:  { name: 'Neon Karakol', theme: 'urban', size: 24, model: { url: '/outpost_neon.glb', scale: 1, rotY: 0, offsetY: 0 } },
    complex:       { name: 'Kompleks', theme: 'industrial', size: 40, model: { url: '/complex.glb', scale: 1, rotY: 0, offsetY: 0 } },
    facility:      { name: 'Tesis', theme: 'industrial', size: 38, model: { url: '/facility.glb', scale: 1, rotY: 0, offsetY: 0 } },
    shatterline:   { name: 'Shatterline', theme: 'industrial', size: 18, model: { url: '/shatterline.glb', scale: 1, rotY: 0, offsetY: 0 } },
    neon_arena:    { name: 'Neon Arena', theme: 'urban', size: 22, model: { url: '/neon_arena.glb', scale: 1, rotY: 0, offsetY: 0 } },
    ruins:         { name: 'Yıkıntı', theme: 'industrial', size: 30, model: { url: '/ruins.glb', scale: 1, rotY: 0, offsetY: 0 } },
    freezone:      { name: 'Serbest Bölge', theme: 'urban', size: 22, model: { url: '/freezone.glb', scale: 1, rotY: 0, offsetY: 0 } },
    sector:        { name: 'Sektör', theme: 'urban', size: 18, model: { url: '/sector.glb', scale: 1, rotY: 0, offsetY: 0 } },
    crossing:      { name: 'Kavşak', theme: 'urban', size: 70, model: { url: '/crossing.glb', scale: 1, rotY: 0, offsetY: 0 } }
};

const COLORS = { red: '#ff0000', blue: '#0000ff' };
const VOTE_TIME = 20, MATCH_TIME = 600, END_TIME = 5, MAX_PLAYERS = 10, KILL_REWARD = 100;
window.MAX_PLAYERS = MAX_PLAYERS;

function createRoomEngine(io, opts) {
    const RID = 'ROOM';
    const r = {
        id: RID, name: (opts && opts.name) || 'Sunucu',
        players: {}, phase: 'voting', currentMap: 'arena',
        votes: {}, teamKills: { red: 0, blue: 0 }, timeLeft: VOTE_TIME, intervalId: null
    };

    io._room = r;

    function getSpawn(mapId, team) {
        const map = window.MAPS[mapId];
        const half = (map.sizeX || map.size) / 2 - 2;
        if (team === 'red') return { x: -half + Math.random() * 4, z: Math.random() * 6 - 3 };
        return { x: half - Math.random() * 4, z: Math.random() * 6 - 3 };
    }

    function pickVoteChoices() { return Object.keys(window.MAPS); }

    function startVoting() {
        clearInterval(r.intervalId);
        r.phase = 'voting'; r.votes = {};
        r.voteChoices = pickVoteChoices(); r.timeLeft = VOTE_TIME;

        io.to(RID).emit('phaseChange', {
            phase: 'voting', timeLeft: VOTE_TIME,
            maps: r.voteChoices.map(id => ({ id, name: window.MAPS[id].name }))
        });

        r.intervalId = setInterval(() => {
            r.timeLeft--;
            io.to(RID).emit('timerTick', r.timeLeft);
            if (r.timeLeft <= 0) finishVoting();
        }, 1000);
    }

    function finishVoting() {
        clearInterval(r.intervalId);
        const tally = {};
        (r.voteChoices || []).forEach(id => tally[id] = 0);
        Object.values(r.votes).forEach(id => { if (tally[id] != null) tally[id]++; });
        let winner = r.voteChoices[0], best = -1;
        Object.entries(tally).forEach(([id, count]) => { if (count > best) { best = count; winner = id; } });
        r.currentMap = winner;
        startMatch();
    }

    function startMatch() {
        clearInterval(r.intervalId);
        r.phase = 'playing'; r.timeLeft = MATCH_TIME; r.teamKills = { red: 0, blue: 0 };

        Object.values(r.players).forEach(p => {
            p.kills = 0; p.deaths = 0; p.health = 100; p.grenades = 1; p.smokes = 1;
            const sp = getSpawn(r.currentMap, p.team);
            p.x = sp.x; p.z = sp.z;
        });

        io.to(RID).emit('phaseChange', {
            phase: 'playing', map: r.currentMap, mapData: window.MAPS[r.currentMap],
            players: r.players, timeLeft: MATCH_TIME
        });

        r.intervalId = setInterval(() => {
            r.timeLeft--;
            io.to(RID).emit('timerTick', r.timeLeft);
            if (r.timeLeft <= 0) endMatch();
        }, 1000);
    }

    function endMatch() {
        clearInterval(r.intervalId);
        r.phase = 'ending';
        const winner = r.teamKills.red > r.teamKills.blue ? 'red' : r.teamKills.blue > r.teamKills.red ? 'blue' : 'tie';
        io.to(RID).emit('phaseChange', { phase: 'ending', winner, teamKills: r.teamKills, timeLeft: END_TIME });
        r.intervalId = setTimeout(() => startVoting(), END_TIME * 1000);
    }

    function applyDamage(shooterId, targetId, damage) {
        if (r.phase !== 'playing') return;
        const target = r.players[targetId], shooter = r.players[shooterId];
        if (!target || !shooter || target.team === shooter.team) return;

        target.health -= damage;

        if (target.health <= 0) {
            target.health = 100; target.deaths++; shooter.kills++;
            shooter.killPoints = (shooter.killPoints || 0) + KILL_REWARD;
            r.teamKills[shooter.team] = (r.teamKills[shooter.team] || 0) + 1;

            const sp = getSpawn(r.currentMap, target.team);
            target.x = sp.x; target.z = sp.z; target.grenades = 1; target.smokes = 1;

            io.to(RID).emit('playerDied', { deadId: targetId, killerId: shooterId });
            io.to(RID).emit('teamKills', r.teamKills);
            io.to(RID).emit('scoreUpdate', { id: targetId, kills: target.kills, deaths: target.deaths });
            io.to(RID).emit('scoreUpdate', { id: shooterId, kills: shooter.kills, deaths: shooter.deaths, killPoints: shooter.killPoints });
        } else {
            io.to(targetId).emit('damaged', { health: target.health });
        }
    }

    startVoting();

    io.on('connection', (socket) => {
        function enterRoom(hello) {
            socket.join(RID);
            const reds = Object.values(r.players).filter(p => p.team === 'red').length;
            const blues = Object.values(r.players).filter(p => p.team === 'blue').length;
            const team = reds <= blues ? 'red' : 'blue';
            const sp = getSpawn(r.currentMap, team);
            const displayName = hello.username || hello.name || ('Oyuncu' + Math.floor(Math.random() * 9000 + 1000));

            r.players[socket.id] = {
                id: socket.id, username: hello.username || null, name: displayName,
                x: sp.x, y: 0, z: sp.z, rotY: 0, health: 100, kills: 0, deaths: 0,
                weapon: 'glock', character: 'soldier', team, color: COLORS[team],
                killPoints: hello.killPoints || 0,
                unlocked: hello.unlockedWeapons || ['glock'],
                unlockedChars: hello.unlockedChars || ['soldier'],
                grenades: 1, smokes: 1
            };

            socket.emit('init', {
                id: socket.id, players: r.players, roomId: r.id, roomName: r.name,
                phase: r.phase, currentMap: r.currentMap, mapData: window.MAPS[r.currentMap],
                teamKills: r.teamKills, timeLeft: r.timeLeft, myTeam: team,
                maps: (r.phase === 'voting' ? r.voteChoices : Object.keys(window.MAPS)).map(k => ({ id: k, name: window.MAPS[k].name })),
                weapons: window.WEAPONS, characters: window.CHARACTERS
            });
            socket.to(RID).emit('playerJoined', r.players[socket.id]);
        }

        socket.on('helloJoin', enterRoom);

        socket.on('vote', (mapId) => {
            if (r.phase !== 'voting' || !(r.voteChoices || []).includes(mapId)) return;
            r.votes[socket.id] = mapId;
            const tally = {};
            (r.voteChoices || []).forEach(id => tally[id] = 0);
            Object.values(r.votes).forEach(id => { if (tally[id] != null) tally[id]++; });
            io.to(RID).emit('voteUpdate', tally);
        });

        socket.on('move', (data) => {
            const p = r.players[socket.id]; if (!p || r.phase !== 'playing') return;
            p.x = data.x; p.y = data.y; p.z = data.z; p.rotY = data.rotY;
            socket.to(RID).volatile.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, z: data.z, rotY: data.rotY });
        });

        socket.on('shoot', (data) => {
            if (r.phase !== 'playing') return;
            socket.to(RID).emit('bulletFired', { id: socket.id, ...data });
        });

        socket.on('hit', (data) => {
            if (r.phase !== 'playing') return;
            const shooter = r.players[socket.id]; if (!shooter) return;
            const weapon = window.WEAPONS[shooter.weapon || 'glock'] || window.WEAPONS.glock;
            applyDamage(socket.id, data.targetId, weapon.damage);
        });

        socket.on('throwItem', (data) => {
            if (r.phase !== 'playing') return;
            const p = r.players[socket.id]; if (!p) return;
            const kind = data.kind === 'smoke' ? 'smoke' : 'grenade';
            if (kind === 'grenade') { if ((p.grenades || 0) <= 0) return; p.grenades--; }
            else { if ((p.smokes || 0) <= 0) return; p.smokes--; }
            socket.to(RID).emit('itemThrown', { id: socket.id, kind, x: data.x, y: data.y, z: data.z, vx: data.vx, vy: data.vy, vz: data.vz });
        });

        socket.on('grenadeExplode', (data) => {
            if (r.phase !== 'playing') return;
            const radius = 6, maxDamage = 70;
            Object.keys(r.players).forEach(targetId => {
                if (targetId === socket.id) return;
                const target = r.players[targetId];
                const dx = target.x - data.x, dz = target.z - data.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > radius) return;
                const dmg = Math.round(maxDamage * (1 - dist / radius));
                if (dmg > 0) applyDamage(socket.id, targetId, dmg);
            });
        });

        socket.on('buyWeapon', (id) => {
            const p = r.players[socket.id]; if (!p) return;
            const w = window.WEAPONS[id];
            if (!w) { socket.emit('shopMsg', 'Geçersiz silah'); return; }
            if ((p.unlocked || []).includes(id)) { socket.emit('shopMsg', 'Zaten sahipsin'); return; }
            if ((p.killPoints || 0) < w.cost) { socket.emit('shopMsg', 'Yetersiz puan'); return; }
            p.killPoints -= w.cost; p.unlocked = [...(p.unlocked || []), id];
            socket.emit('shopOk', { unlocked: p.unlocked, killPoints: p.killPoints, weaponId: id });
        });

        socket.on('switchWeapon', (id) => {
            const p = r.players[socket.id];
            if (!p || !window.WEAPONS[id] || !(p.unlocked || []).includes(id)) return;
            p.weapon = id;
            io.to(RID).emit('weaponChanged', { id: socket.id, weapon: id });
        });

        socket.on('buyChar', (id) => {
            const p = r.players[socket.id]; if (!p) return;
            const c = window.CHARACTERS[id];
            if (!c) { socket.emit('shopMsg', 'Geçersiz karakter'); return; }
            if ((p.unlockedChars || []).includes(id)) { socket.emit('shopMsg', 'Zaten sahipsin'); return; }
            if ((p.killPoints || 0) < c.cost) { socket.emit('shopMsg', 'Yetersiz puan'); return; }
            p.killPoints -= c.cost; p.unlockedChars = [...(p.unlockedChars || []), id];
            socket.emit('charOk', { unlockedChars: p.unlockedChars, killPoints: p.killPoints, charId: id });
        });

        socket.on('switchCharacter', (id) => {
            const p = r.players[socket.id];
            if (!p || !window.CHARACTERS[id] || !(p.unlockedChars || []).includes(id)) return;
            p.character = id;
            io.to(RID).emit('characterChanged', { id: socket.id, character: id });
        });

        socket.on('chat', (msg) => {
            const p = r.players[socket.id]; if (!p) return;
            msg = String(msg || '').slice(0, 200).trim(); if (!msg) return;
            io.to(RID).emit('chatMsg', { name: p.name, msg, team: p.team });
        });

        socket.on('disconnect', () => {
            if (!r.players[socket.id]) return;
            delete r.players[socket.id];
            io.to(RID).emit('playerLeft', socket.id);
        });
    });

    return r;
}

window.createRoomEngine = createRoomEngine;
window.MAX_PLAYERS = MAX_PLAYERS;
