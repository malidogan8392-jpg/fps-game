const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Eğer HTML dosyaların sunucu dizindeyse onları yayınlar
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    // index.html varsa onu gönderir, yoksa hata vermez
    try {
        res.sendFile(path.join(__dirname, 'index.html'));
    } catch (e) {
        res.status(404).send('Oyun istemci dosyası bulunamadı. Lütfen HTML dosyanızı açarak bağlanın.');
    }
});

// Optimize edilmiş soket ayarları (CORS dışarıdan gelen HTML bağlantılarına izin verir)
const io = new Server(server, {
    cors: {
        origin: "*", // Dışarıdaki tüm HTML dosyalarının bağlanmasına izin verir
        methods: ["GET", "POST"]
    },
    pingTimeout: 30000,   
    pingInterval: 10000,  
    perMessageDeflate: false 
});

// Çökme koruması
process.on('uncaughtException', (err) => {
    console.error('❌ Kritik Hata:', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('❌ Promise Hatası:', err.message);
});

const PORT = process.env.PORT || 7860;
server.listen(PORT, () => {
    console.log('====================================');
    console.log(`🚀 OPTİMİZE FPS SUNUCUSU AKTİF!`);
    console.log(`📡 Port: ${PORT} | Mod: 10 Dk Tek Maç`);
    console.log('====================================');
});

try {
    require('./server.js')(io);
    console.log('✅ Oyun motoru başarıyla bağlandı.');
} catch (error) {
    console.error('❌ Oyun motoru yüklenirken hata oluştu:', error.message);
}
