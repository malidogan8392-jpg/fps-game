const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Dosyaları doğrudan ana dizinden (root) tarayıcıya sunar
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, 'index.html'));
    } catch (e) {
        res.status(404).send('Oyun istemci dosyası (index.html) bulunamadı.');
    }
});

// Gecikme önleyici ve tünel uyumlu Socket.io ayarları
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 30000,   
    pingInterval: 10000,  
    perMessageDeflate: false 
});

// Çökme Korumaları
process.on('uncaughtException', (err) => console.error('❌ Hata:', err.message));
process.on('unhandledRejection', (err) => console.error('❌ Promise Hatası:', err.message));

// Portu dinle
const PORT = process.env.PORT || 7860;
server.listen(PORT, () => {
    console.log('====================================');
    console.log(`🚀 SUNUCU AKTİF! Port: ${PORT}`);
    console.log('====================================');
});

// Oyun motorunu (server.js) ayağa kaldır ve soketi aktar
try {
    require('./server.js')(io);
    console.log('✅ server.js oyun motoru index.js\'e başarıyla bağlandı.');
} catch (error) {
    console.error('❌ server.js yüklenirken kritik hata:', error.message);
}

// Bulunduğun platformdaki tünel loglarını ekrana basan kısmın (Dokunmadık, aynen çalışır)
setTimeout(() => {
    const logPath = path.join(__dirname, 'tunellog.txt');
    if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, 'utf8');
        console.log("=== CLOUDFLARE TÜNEL LOGLARI ===");
        console.log(logContent);
        console.log("=================================");
    }
}, 20000);
