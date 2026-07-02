const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const players = {};

const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'];

io.on('connection', (socket) => {
    console.log('Oyuncu bağlandı:', socket.id);

    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    players[socket.id] = {
        id: socket.id,
        x: (Math.random() - 0.5) * 20,
        y: 0,
        z: (Math.random() - 0.5) * 20,
        rotY: 0,
        health: 100,
        kills: 0,
        deaths: 0,
        color,
        name: 'Oyuncu' + Math.floor(Math.random() * 9000 + 1000)
    };

    socket.emit('init', { id: socket.id, players });
    socket.broadcast.emit('playerJoined', players[socket.id]);

    socket.on('move', (data) => {
        if (!players[socket.id]) return;
        players[socket.id].x = data.x;
        players[socket.id].y = data.y;
        players[socket.id].z = data.z;
        players[socket.id].rotY = data.rotY;
        socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, z: data.z, rotY: data.rotY });
    });

    socket.on('shoot', (data) => {
        socket.broadcast.emit('bulletFired', { id: socket.id, ...data });
    });

    socket.on('hit', (data) => {
        const target = players[data.targetId];
        if (!target) return;
        target.health -= 25;
        if (target.health <= 0) {
            target.health = 100;
            target.deaths++;
            if (players[socket.id]) players[socket.id].kills++;
            io.emit('playerDied', { deadId: data.targetId, killerId: socket.id });
            io.emit('scoreUpdate', {
                id: data.targetId,
                kills: target.kills,
                deaths: target.deaths
            });
            if (players[socket.id]) {
                io.emit('scoreUpdate', {
                    id: socket.id,
                    kills: players[socket.id].kills,
                    deaths: players[socket.id].deaths
                });
            }
        } else {
            io.to(data.targetId).emit('damaged', { health: target.health });
        }
    });

    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`FPS Sunucu hazır: ${PORT}`));
