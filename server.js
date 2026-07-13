// Kodun en başındaki değişken tanımını bununla değiştir:
const path = require('path');
const ACCOUNTS_FILE = path.join(process.cwd(), 'hesaplar.json');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
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
depo: {
    name: 'Depo', size: 28, sizeX: 30, sizeZ: 56, theme: 'industrial',
    walls: [
      {x:0,z:-28,w:30,d:1},{x:0,z:28,w:30,d:1},{x:-15,z:0,w:1,d:56},{x:15,z:0,w:1,d:56},
      {x:7.37,z:13.2,w:1.28,d:1.47},{x:-12.16,z:12.8,w:1.92,d:0.64},{x:11.65,z:12.48,w:3.2,d:0.64},{x:-7.19,z:15.05,w:1.6,d:1.6},
      {x:-5.83,z:15.52,w:0.7,d:0.7},{x:-5.87,z:14.65,w:0.84,d:0.84},{x:-7.33,z:16.51,w:1.28,d:1.28},{x:-7.32,z:15.4,w:0.64,d:0.64},
      {x:-3.97,z:25.0,w:1.28,d:1.09},{x:11.65,z:-16.22,w:3.2,d:0.64},{x:6.5,z:4.0,w:1.6,d:1.6},{x:6.5,z:-5.3,w:1.6,d:1.6},
      {x:-12.13,z:5.44,w:1.28,d:1.28},{x:-10.71,z:5.44,w:1.28,d:1.28},{x:-11.78,z:5.44,w:1.28,d:1.28},{x:-9.75,z:5.28,w:0.64,d:0.64},
      {x:-12.48,z:12.07,w:0.7,d:0.7},{x:-12.48,z:11.34,w:0.7,d:0.7},{x:-12.48,z:11.7,w:0.7,d:0.7},{x:-12.43,z:9.47,w:0.84,d:0.84},
      {x:-5.76,z:2.23,w:1.28,d:1.28},{x:-4.25,z:-3.15,w:1.28,d:1.28},{x:-5.58,z:-3.15,w:1.28,d:1.28},{x:-6.22,z:-5.12,w:1.28,d:1.28},
      {x:-5.22,z:-4.83,w:0.64,d:0.64},{x:-6.53,z:-4.83,w:0.64,d:0.64},{x:-5.88,z:-3.45,w:0.64,d:0.64},{x:-5.2,z:-3.45,w:0.64,d:0.64},
      {x:-4.54,z:-3.45,w:0.64,d:0.64},{x:9.32,z:0.0,w:1.6,d:1.6},{x:10.51,z:7.76,w:1.6,d:1.6},{x:8.37,z:12.8,w:0.7,d:0.7},
      {x:-2.2,z:3.79,w:1.28,d:1.14},{x:1.79,z:3.57,w:0.7,d:0.7},{x:2.64,z:24.96,w:1.28,d:1.28},{x:1.3,z:24.96,w:1.28,d:1.28},
      {x:1.3,z:23.58,w:1.28,d:1.28},{x:2.34,z:24.83,w:1.28,d:1.14},{x:-2.03,z:25.13,w:0.7,d:0.7},{x:-2.75,z:25.12,w:0.7,d:0.7},
      {x:-4.21,z:25.12,w:0.7,d:0.7},{x:-3.5,z:25.13,w:0.7,d:0.7},{x:-2.37,z:25.13,w:0.7,d:0.7},{x:-3.08,z:25.12,w:0.7,d:0.7},
      {x:-12.22,z:23.58,w:1.28,d:1.28},{x:-12.22,z:22.28,w:1.28,d:1.28},{x:9.58,z:24.96,w:1.28,d:1.28},{x:10.87,z:24.96,w:1.28,d:1.28},
      {x:12.15,z:24.96,w:1.28,d:1.28},{x:11.62,z:24.96,w:1.28,d:1.28},{x:10.65,z:24.67,w:0.64,d:0.64},{x:-2.44,z:20.34,w:0.7,d:0.7},
      {x:-1.72,z:20.34,w:0.7,d:0.7},{x:-6.43,z:-1.44,w:1.14,d:1.28},{x:-6.43,z:-1.44,w:1.14,d:1.28},{x:-6.43,z:-0.14,w:1.14,d:1.28},
      {x:-6.43,z:-0.14,w:1.14,d:1.28},{x:-2.19,z:11.5,w:1.28,d:1.47},{x:6.48,z:18.95,w:0.48,d:1.27},{x:7.12,z:18.95,w:0.48,d:1.27},
      {x:-8.31,z:14.98,w:0.64,d:3.2},{x:-0.01,z:18.86,w:1.28,d:1.28},{x:-0.01,z:18.86,w:1.28,d:1.28},{x:0.02,z:17.66,w:1.28,d:1.14},
      {x:0.3,z:17.87,w:0.64,d:0.64},{x:1.46,z:18.78,w:1.6,d:1.6},{x:0.99,z:19.2,w:0.64,d:0.64},{x:-0.32,z:19.2,w:0.64,d:0.64},
      {x:-8.17,z:20.36,w:1.28,d:1.47},{x:-6.54,z:24.38,w:0.7,d:0.7},{x:6.83,z:21.54,w:1.28,d:1.28},{x:6.87,z:21.46,w:1.28,d:1.14},
      {x:-5.53,z:20.7,w:1.28,d:1.28},{x:-11.29,z:-16.22,w:3.2,d:0.64},{x:-5.39,z:-20.42,w:1.28,d:1.28},{x:-12.12,z:-20.42,w:1.28,d:1.28},
      {x:-10.8,z:-20.34,w:1.28,d:1.14},{x:-10.8,z:-20.34,w:1.28,d:1.14},{x:-5.39,z:-24.94,w:1.28,d:1.28},{x:-1.06,z:-20.06,w:0.7,d:0.7},
      {x:-1.06,z:-25.28,w:0.7,d:0.7},{x:-1.79,z:-25.28,w:0.7,d:0.7},{x:-2.53,z:-25.28,w:0.7,d:0.7},{x:-5.78,z:-20.34,w:0.64,d:0.64},
      {x:-0.02,z:-23.98,w:1.28,d:1.47},{x:1.29,z:-20.33,w:1.28,d:1.47},{x:-12.45,z:-25.28,w:0.7,d:0.7},{x:-7.65,z:0.74,w:1.14,d:1.28},
      {x:-12.17,z:-1.73,w:1.28,d:1.2},{x:-12.17,z:-2.91,w:1.27,d:2.14},{x:-12.17,z:0.54,w:1.27,d:1.4},{x:3.62,z:-3.62,w:1.6,d:1.6},
      {x:2.24,z:-3.79,w:1.14,d:1.28},{x:2.22,z:-3.81,w:1.14,d:1.28},{x:11.98,z:-17.39,w:1.6,d:1.6},{x:7.66,z:0.0,w:1.6,d:1.6},
      {x:1.29,z:-4.1,w:0.7,d:0.7},{x:-0.14,z:2.2,w:0.7,d:0.7},{x:-0.86,z:2.2,w:0.7,d:0.7},{x:-0.49,z:2.2,w:0.7,d:0.7},
      {x:-0.49,z:1.5,w:0.7,d:0.7},{x:-0.86,z:1.5,w:0.7,d:0.7},{x:-0.14,z:1.5,w:0.7,d:0.7},{x:-0.14,z:0.8,w:0.7,d:0.7},
      {x:-0.86,z:0.8,w:0.7,d:0.7},{x:-0.49,z:0.8,w:0.7,d:0.7},{x:-2.08,z:-3.77,w:1.28,d:1.28},{x:-0.26,z:12.48,w:2.56,d:2.56},
      {x:-0.26,z:-12.48,w:2.56,d:2.56},{x:-11.82,z:-7.79,w:1.79,d:0.64},{x:-5.66,z:-8.28,w:1.79,d:0.64},{x:-2.19,z:3.79,w:1.28,d:1.14},
      {x:1.65,z:-11.52,w:1.28,d:1.47},{x:-6.62,z:4.11,w:0.64,d:1.79},{x:-6.22,z:-18.94,w:1.28,d:1.28},{x:-7.55,z:-18.94,w:1.28,d:1.28},
      {x:-7.5,z:-18.94,w:1.28,d:1.28},{x:-6.18,z:-18.84,w:1.28,d:1.28},{x:-6.79,z:-17.59,w:1.28,d:1.28},{x:12.07,z:-24.82,w:1.28,d:1.47},
      {x:-7.65,z:0.74,w:1.14,d:1.28},{x:-7.52,z:-0.4,w:0.84,d:0.84},{x:-4.3,z:-20.43,w:3.2,d:1.6},{x:11.19,z:20.43,w:3.2,d:1.6},
      {x:-1.3,z:20.7,w:1.28,d:1.28},{x:-1.34,z:20.7,w:1.28,d:1.28},{x:-2.75,z:25.13,w:0.7,d:0.7},{x:-3.47,z:25.12,w:0.7,d:0.7},
      {x:-2.0,z:25.12,w:0.7,d:0.7},{x:-1.29,z:25.13,w:0.7,d:0.7},{x:5.38,z:24.95,w:1.28,d:1.14},{x:4.11,z:24.95,w:1.28,d:1.14},
      {x:-3.93,z:-20.82,w:1.6,d:1.6},{x:2.82,z:24.95,w:1.28,d:1.14},{x:1.53,z:24.95,w:1.28,d:1.14},{x:-12.16,z:24.88,w:1.28,d:1.28},
      {x:-12.44,z:23.89,w:0.64,d:0.64},{x:-12.44,z:23.09,w:0.64,d:0.64},{x:-12.44,z:22.36,w:0.64,d:0.64},{x:-12.44,z:21.66,w:0.64,d:0.64},
      {x:-12.44,z:21.94,w:0.64,d:0.64},{x:-12.44,z:22.66,w:0.64,d:0.64},{x:-12.44,z:23.39,w:0.64,d:0.64},{x:-12.44,z:23.09,w:0.64,d:0.64},
      {x:-12.44,z:25.14,w:0.64,d:0.64},{x:-12.44,z:19.97,w:0.64,d:0.64},{x:-6.92,z:21.59,w:1.47,d:1.28},{x:-8.77,z:25.21,w:0.84,d:0.84},
      {x:-7.92,z:25.21,w:0.84,d:0.84},{x:-2.67,z:25.0,w:1.28,d:1.09},{x:-1.38,z:25.0,w:1.28,d:1.09},{x:8.25,z:24.89,w:1.28,d:1.47},
      {x:12.15,z:25.07,w:1.28,d:1.14},{x:10.85,z:25.07,w:1.28,d:1.14},{x:12.01,z:22.07,w:1.54,d:1.54},{x:5.43,z:20.3,w:1.54,d:1.54},
      {x:-12.04,z:-15.1,w:1.54,d:1.54},{x:-10.59,z:-15.33,w:1.28,d:1.09},{x:-10.57,z:-15.41,w:0.7,d:0.7},{x:-12.03,z:-15.22,w:1.28,d:1.28},
      {x:-12.4,z:-12.16,w:0.7,d:0.7},{x:-12.21,z:-12.09,w:1.09,d:1.28},{x:-12.21,z:-10.79,w:1.09,d:1.28},{x:-12.4,z:-11.39,w:0.7,d:0.7},
      {x:-12.4,z:-10.62,w:0.7,d:0.7},{x:-12.4,z:-10.98,w:0.7,d:0.7},{x:-12.4,z:-11.76,w:0.7,d:0.7},{x:1.3,z:20.32,w:1.28,d:1.28},
      {x:1.3,z:20.32,w:1.28,d:1.28},{x:2.59,z:20.32,w:1.28,d:1.28},{x:2.59,z:20.32,w:1.28,d:1.28},{x:-2.65,z:20.7,w:1.28,d:1.28},
      {x:-2.6,z:20.7,w:1.28,d:1.28},{x:-5.57,z:20.7,w:1.28,d:1.28},{x:5.43,z:16.17,w:1.54,d:1.54},{x:6.95,z:16.17,w:1.54,d:1.54},
      {x:10.97,z:16.24,w:1.54,d:1.54},{x:5.59,z:-3.07,w:1.54,d:1.54},{x:1.79,z:-0.06,w:0.7,d:0.7},{x:-6.06,z:-3.45,w:0.64,d:0.64},
      {x:-5.77,z:-3.15,w:1.28,d:1.28},{x:-5.77,z:1.94,w:1.28,d:1.28},{x:-6.06,z:0.98,w:0.64,d:0.64},{x:-1.94,z:1.94,w:1.28,d:1.28},
      {x:-0.62,z:-3.19,w:1.28,d:1.28},{x:-5.55,z:20.27,w:1.28,d:1.28},{x:-5.55,z:20.27,w:1.28,d:1.28},{x:8.11,z:20.28,w:1.28,d:1.28},
      {x:8.11,z:20.28,w:1.28,d:1.28},{x:6.95,z:16.17,w:1.54,d:1.54},{x:-0.01,z:9.43,w:1.28,d:1.28},{x:-0.01,z:9.43,w:1.28,d:1.28},
      {x:-0.01,z:8.14,w:1.28,d:1.28},{x:-0.01,z:8.14,w:1.28,d:1.28},{x:-3.0,z:-0.52,w:1.28,d:1.28}
    ]
  },
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
  },
  castle: {
    name: 'Kale', size: 80, sizeX: 92, sizeZ: 76, theme: 'grass',
    model: { url:'/models/castle.glb', scale:0.3, offsetY:-0.49, rotY:0 },
    walls: [
      {x:0,z:-38,w:92,d:1},{x:0,z:38,w:92,d:1},{x:-46,z:0,w:1,d:76},{x:46,z:0,w:1,d:76}
    ]
  },
  city2: {
    name: 'Metropol', size: 100, sizeX: 124, sizeZ: 84, theme: 'urban',
    model: { url:'/models/city_scene.glb', scale:0.0095, offsetY:-5.22, rotY:0 },
    walls: [
      {x:0,z:-42,w:124,d:1},{x:0,z:42,w:124,d:1},{x:-62,z:0,w:1,d:84},{x:62,z:0,w:1,d:84},
      {x:7.02,z:10.8,w:4.77,d:4.77},{x:51.25,z:36.54,w:4.28,d:2.85},{x:46.19,z:39.6,w:4.28,d:2.85},{x:34.76,z:39.6,w:4.28,d:2.85},
      {x:24.49,z:36.54,w:4.28,d:2.85},{x:21.27,z:31.06,w:2.85,d:4.29},{x:25.18,z:19.38,w:2.85,d:4.29},{x:21.26,z:19.38,w:2.85,d:4.29},
      {x:14.19,z:19.75,w:2.85,d:4.29},{x:14.08,z:30.88,w:2.85,d:4.29},{x:13.05,z:36.54,w:4.28,d:2.85},{x:6.6,z:38.18,w:4.64,d:4.85},
      {x:-23.54,z:39.6,w:4.28,d:2.85},{x:-45.24,z:36.54,w:4.28,d:2.85},{x:-61.42,z:36.54,w:4.28,d:2.85},{x:-33.7,z:6.06,w:4.28,d:2.85},
      {x:-33.59,z:-1.02,w:4.28,d:2.85},{x:-33.72,z:-4.99,w:4.28,d:2.85},{x:-17.73,z:6.15,w:4.28,d:2.85},{x:-16.98,z:13.38,w:4.28,d:2.85},
      {x:-23.0,z:17.75,w:4.49,d:4.9},{x:-16.43,z:-8.63,w:4.28,d:2.85},{x:-22.7,z:-10.07,w:2.85,d:4.28},{x:9.83,z:23.43,w:4.87,d:3.96},
      {x:-18.68,z:-19.32,w:4.61,d:3.17},{x:-0.84,z:-14.91,w:4.28,d:2.85},{x:-4.85,z:-19.1,w:4.28,d:2.85},{x:49.25,z:-19.1,w:4.28,d:2.85},
      {x:-34.01,z:-14.91,w:4.28,d:2.85},{x:-41.32,z:-19.1,w:4.28,d:2.85},{x:-61.48,z:-14.91,w:4.28,d:2.85},{x:-61.42,z:-26.75,w:4.28,d:2.85},
      {x:-61.48,z:-34.06,w:4.28,d:2.85},{x:-44.04,z:-34.06,w:4.28,d:2.85},{x:-43.91,z:-30.09,w:4.28,d:2.85},{x:26.51,z:13.27,w:4.28,d:2.85},
      {x:37.94,z:13.27,w:4.28,d:2.85},{x:8.61,z:4.98,w:2.85,d:4.29},{x:13.85,z:-19.28,w:4.29,d:2.85},{x:32.77,z:-18.94,w:4.28,d:2.85},
      {x:41.0,z:-15.09,w:4.29,d:2.85},{x:21.54,z:9.56,w:4.28,d:2.85},{x:32.37,z:9.14,w:4.29,d:2.85},{x:47.82,z:9.38,w:7.21,d:2.83},
      {x:5.65,z:-12.66,w:3.45,d:6.65},{x:31.71,z:-4.36,w:15.54,d:11.51},{x:31.7,z:-4.16,w:11.61,d:7.35},{x:18.39,z:-29.9,w:15.26,d:15.84},
      {x:48.08,z:-4.36,w:15.54,d:11.51},{x:48.07,z:-4.16,w:11.61,d:7.35},{x:-1.77,z:31.0,w:5.97,d:6.53},{x:-1.78,z:30.45,w:5.39,d:4.35},
      {x:17.3,z:-3.08,w:11.39,d:15.32},{x:16.47,z:-3.0,w:4.76,d:10.44},{x:-26.28,z:30.07,w:14.55,d:9.26},{x:-26.28,z:29.52,w:11.12,d:5.92},
      {x:-27.43,z:29.98,w:7.41,d:6.56},{x:-27.71,z:-32.4,w:15.32,d:11.39},{x:-27.63,z:-31.57,w:10.44,d:4.76},{x:46.98,z:-29.5,w:15.84,d:15.26},
      {x:47.69,z:-28.97,w:11.73,d:11.57},{x:32.75,z:25.31,w:5.04,d:12.34},{x:34.43,z:25.46,w:12.41,d:15.26},{x:-4.47,z:-4.15,w:11.57,d:11.73},
      {x:-5.01,z:-3.45,w:15.26,d:15.84},{x:-7.01,z:-31.57,w:10.44,d:4.76},{x:-7.09,z:-32.4,w:15.32,d:11.39},{x:17.86,z:-29.19,w:11.57,d:11.73},
      {x:48.83,z:25.66,w:14.26,d:18.68},{x:-6.49,z:17.47,w:15.16,d:24.12},{x:32.66,z:-31.41,w:13.24,d:19.96},{x:-5.4,z:8.75,w:9.6,d:3.41},
      {x:-13.51,z:-12.3,w:0.63,d:1.06},{x:11.06,z:20.94,w:0.63,d:1.05},{x:43.93,z:-12.32,w:0.63,d:0.97},{x:2.43,z:-22.12,w:0.89,d:0.75},
      {x:2.43,z:-12.1,w:0.89,d:0.75},{x:11.88,z:-22.12,w:0.89,d:0.75},{x:11.88,z:-12.1,w:0.89,d:0.75},{x:11.3,z:6.36,w:0.89,d:0.75},
      {x:11.3,z:15.98,w:0.89,d:0.75},{x:11.23,z:34.44,w:0.75,d:0.89},{x:2.68,z:34.44,w:0.75,d:0.89},{x:11.06,z:29.97,w:0.63,d:1.05},
      {x:-31.18,z:-11.94,w:1.05,d:0.63},{x:-18.24,z:-11.94,w:1.05,d:0.63},{x:-34.48,z:-12.26,w:0.63,d:1.06},{x:10.96,z:17.91,w:1.06,d:0.63},
      {x:13.09,z:34.27,w:0.63,d:1.06},{x:1.78,z:7.06,w:0.63,d:0.96},{x:43.93,z:-21.65,w:0.63,d:0.97},{x:-65.12,z:-22.16,w:0.63,d:1.06},
      {x:-15.01,z:33.38,w:0.96,d:0.63},{x:24.95,z:-22.31,w:0.96,d:0.63},{x:39.88,z:-22.31,w:0.96,d:0.63},{x:-5.68,z:33.38,w:0.96,d:0.63},
      {x:1.78,z:15.83,w:0.63,d:0.96},{x:2.93,z:29.19,w:0.89,d:0.52},{x:-39.09,z:-22.03,w:0.63,d:1.06},{x:-27.67,z:-32.37,w:20.87,d:16.01},
      {x:-14.37,z:25.2,w:1.48,d:3.19},{x:-14.37,z:28.52,w:1.48,d:3.19},{x:-14.37,z:31.45,w:1.48,d:2.61},{x:-6.33,z:28.39,w:1.48,d:3.2},
      {x:-6.33,z:31.32,w:1.48,d:2.61},{x:-2.74,z:26.07,w:8.48,d:1.31}
    ]
  },
  labyrinth: {
    name: 'Labirent', size: 70, sizeX: 60, sizeZ: 86, theme: 'forest',
    model: { url:'/models/labyrinth.glb', scale:1.2, offsetY:3.6, rotY:0 },
    walls: [
      {x:0,z:-43,w:60,d:1},{x:0,z:43,w:60,d:1},{x:-30,z:0,w:1,d:86},{x:30,z:0,w:1,d:86}
    ]
  },
  warship: {
    name: 'Savaş Gemisi', size: 50, sizeX: 92, sizeZ: 14, theme: 'harbor',
    model: { url:'/models/warship.glb', scale:0.034, offsetY:-7.62, rotY:0 },
    walls: [
      {x:0,z:-7,w:92,d:1},{x:0,z:7,w:92,d:1},{x:-46,z:0,w:1,d:14},{x:46,z:0,w:1,d:14},
      {x:-8.28,z:3.16,w:2.0,d:0.81},{x:-8.19,z:-0.3,w:3.95,d:3.18},{x:-8.3,z:-1.1,w:3.72,d:1.59},{x:-8.18,z:-0.63,w:2.72,d:0.66},
      {x:-8.28,z:-3.77,w:2.0,d:0.81},{x:-9.24,z:-0.31,w:0.5,d:5.04},{x:0.44,z:-0.39,w:4.14,d:2.77},{x:-10.18,z:-0.23,w:1.09,d:1.39},
      {x:-0.92,z:1.65,w:1.15,d:0.9},{x:-8.23,z:1.71,w:1.18,d:0.92},{x:21.85,z:-0.38,w:5.59,d:4.79},{x:7.79,z:-0.37,w:2.11,d:2.13},
      {x:7.79,z:0.16,w:2.11,d:1.07},{x:7.79,z:-0.9,w:2.11,d:1.07},{x:47.99,z:-0.35,w:0.5,d:0.5},{x:47.78,z:0.2,w:0.5,d:0.71},
      {x:47.67,z:0.19,w:0.5,d:0.69},{x:47.67,z:-0.9,w:0.5,d:0.69},{x:-36.97,z:-1.92,w:1.36,d:0.5},{x:13.16,z:1.18,w:10.49,d:3.08},
      {x:-2.98,z:1.08,w:12.66,d:2.89},{x:5.08,z:0.48,w:2.88,d:0.85},{x:5.1,z:0.24,w:2.92,d:0.5},{x:-36.72,z:0.64,w:0.58,d:0.5},
      {x:-36.72,z:0.33,w:0.58,d:0.5},{x:-29.76,z:1.09,w:0.82,d:0.91},{x:-14.13,z:0.7,w:2.26,d:0.59},{x:-14.21,z:0.32,w:3.01,d:1.36},
      {x:-36.97,z:1.2,w:1.36,d:0.5},{x:-14.21,z:-1.04,w:3.01,d:1.36},{x:-39.54,z:-1.1,w:1.45,d:0.5},{x:-19.62,z:-0.38,w:5.59,d:4.79},
      {x:13.16,z:-1.9,w:10.49,d:3.08},{x:-2.98,z:-1.8,w:12.66,d:2.89},{x:5.1,z:-0.96,w:2.92,d:0.5},{x:5.08,z:-1.2,w:2.88,d:0.85},
      {x:-36.72,z:-1.36,w:0.58,d:0.5},{x:-36.72,z:-1.05,w:0.58,d:0.5},{x:-29.76,z:-1.81,w:0.82,d:0.91},{x:-14.13,z:-1.42,w:2.26,d:0.59},
      {x:-8.19,z:-0.28,w:3.95,d:3.21},{x:-8.13,z:-0.3,w:2.83,d:1.32},{x:-7.93,z:-0.3,w:2.72,d:5.95},{x:-7.63,z:-0.31,w:3.56,d:5.04},
      {x:22.62,z:-0.39,w:5.59,d:5.59},{x:7.79,z:-0.37,w:2.11,d:2.13},{x:-1.05,z:3.7,w:3.08,d:2.7},{x:-36.74,z:0.49,w:0.62,d:0.62},
      {x:-20.39,z:-0.39,w:5.59,d:5.59},{x:-36.74,z:-1.21,w:0.62,d:0.62},{x:-8.18,z:0.03,w:2.72,d:0.66},{x:2.08,z:-0.44,w:0.85,d:2.67},
      {x:-1.21,z:-0.34,w:0.85,d:2.67},{x:38.71,z:-0.75,w:0.8,d:0.89},{x:2.93,z:-0.4,w:1.05,d:1.37},{x:-0.92,z:-2.43,w:1.15,d:0.9},
      {x:-8.23,z:-2.32,w:1.18,d:0.92},{x:31.86,z:-0.4,w:0.91,d:0.81},{x:47.7,z:-1.08,w:0.55,d:0.7},{x:-39.54,z:0.38,w:1.45,d:0.5},
      {x:47.7,z:0.36,w:0.55,d:0.7}
    ]
  }
};

// ── Hesaplar ─────────────────────────────────────────────
// GITHUB_TOKEN ayarlıysa hesaplar GitHub deposundaki accounts.json'a kaydedilir
// (yeniden deploy olsa bile kaybolmaz). Ayarlı değilse yerel dosyaya kaydedilir
// (sadece sunucu uykuya dalıp uyanmasına dayanır, redeploy'da sıfırlanır).
 ACCOUNTS_FILE   = path.join(__dirname, 'accounts.json');
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
 // ... üstteki kodlar ...
// 290. satırda catch bloğu bitiyor diyelim

// BURAYI SİLİP ŞUNU YAPIŞTIR:
try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
         fileContent = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
        accounts = JSON.parse(fileContent);
    } else {
        accounts = {};
    }
} catch (e) {
    console.error('Kritik okuma hatası:', e.message);
    accounts = {};
}

// Hemen ardından burası gelsin:
let saveTimer = null;
let savePending = false;
// ... kodun geri kalanı ...

// Buradan sonra 308. satırdaki let saveTimer = null; ile devam et.

 saveTimer = null;
 savePending = false;
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
  saveAccounts(); // lastLogin güncellemelerini de saatte bir GitHub'a yansıt (her girişte değil)
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
    if(username&&accounts[username]){accounts[username].lastLogin=Date.now();} // GitHub'a her girişte commit atmasın diye kaydetmeyi burada tetiklemiyoruz
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

const PORT=process.env.PORT||7860; // Hugging Face Spaces varsayılan portu 7860'tır
server.listen(PORT,()=>console.log('FPS: '+PORT));

// Her 15 dakikada bir (15 * 60 * 1000 milisaniye) çalışacak arka plan görevi
setInterval(() => {
    try {
        console.log("=== ARKA PLAN GÖREVİ BAŞLADI ===");
        
        const dosyaYolu = path.join(__dirname, 'hesaplar.json');
        
        // 1. Dosyayı oku
        const hamVeri = fs.readFileSync(dosyaYolu, 'utf8');
        let hesaplar = JSON.parse(hamVeri);

        console.log("Hesaplar kontrol ediliyor ve güncelleniyor...");
        
        // -------------------------------------------------------------
        // BURAYA YAPMAK İSTEDİĞİN İŞLEMİ YAZ
        // Örnek: Süresi biten odaları veya hesapları temizle/güncelle
        // -------------------------------------------------------------

        // 2. Güncellenmiş veriyi dosyaya geri yaz
        fs.writeFileSync(dosyaYolu, JSON.stringify(hesaplar, null, 2));
        console.log("=== ARKA PLAN GÖREVİ BAŞARIYLA BİTTİ (Oyun açık kalmaya devam ediyor) ===");

    } catch (error) {
        console.error("Arka plan görevi çalışırken hata oluştu:", error);
    }
}, 15 * 60 * 1000); 
// SAKIN en sona process.exit(0) KOYMA! Oyun açık kalmalı.
}
