const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// HTML ve istemci dosyalarını doğrudan ana dizinden sunar
app.use(express.static(__dirname));
// models/ ve sounds/ klasörleri public/ altında olduğu için onu da kök gibi sun
// (böylece /models/x.glb isteği public/models/x.glb dosyasını bulur)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, 'index.html'));
    } catch (e) {
        res.status(404).send('Oyun istemci dosyası (index.html) bulunamadı.');
    }
});

// Performans ve tünel uyumlu Socket.io ayarları
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 30000,   
    pingInterval: 10000,  
    perMessageDeflate: false 
});

// Sunucu Korumaları (Çökmeyi Engeller)
process.on('uncaughtException', (err) => console.error('❌ Kritik Hata:', err.message));
process.on('unhandledRejection', (err) => console.error('❌ Promise Hatası:', err.message));

// Portu dinle
const PORT = process.env.PORT || 7860;
server.listen(PORT, () => {
    console.log('====================================');
    console.log(`🚀 FPS SUNUCUSU AKTİF! Port: ${PORT}`);
    console.log('====================================');
});

// Oyun motorunu (server.js) soket nesnesiyle birlikte ayağa kaldır
try {
    require('./server.js')(io);
    console.log('✅ server.js oyun motoru başarıyla bağlandı.');
} catch (error) {
    console.error('❌ server.js yüklenirken kritik hata:', error.message);
}

// Bulunduğun platformdaki tünel loglarını ekrana basan kısım (Dokunmadık)
setTimeout(() => {
    const logPath = path.join(__dirname, 'tunellog.txt');
    if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, 'utf8');
        console.log("=== CLOUDFLARE TÜNEL LOGLARI ===");
        console.log(logContent);
        console.log("=================================");
    } else {
        console.log("tunellog.txt henüz oluşturulmadı.");
    }
}, 20000);
