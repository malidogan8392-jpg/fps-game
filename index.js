const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Yüksek oyuncu sayısında gecikmeyi (ping) düşürmek için optimize edilmiş Socket ayarları
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Performans ve Ağ Optimizasyonları
    pingTimeout: 30000,   // Bağlantısı zayıf oyuncuların hemen düşmesini engeller
    pingInterval: 10000,  // Her 10 saniyede bir bağlantıyı check eder
    perMessageDeflate: false // CPU yükünü azaltmak için socket düzeyinde ekstra sıkıştırmayı kapatır
});

// Sunucunun beklenmedik anlık hatalarla çökmesini tamamen engeller
process.on('uncaughtException', (err) => {
    console.error('❌ Kritik Hata (Sunucu Koruması Aktif):', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('❌ Promise Hatası (Sunucu Koruması Aktif):', err.message);
});

// Port tanımı (Platformlarla tam uyumlu)
const PORT = process.env.PORT || 7860;
server.listen(PORT, () => {
    console.log('====================================');
    console.log(`🚀 OPTİMİZE FPS SUNUCUSU AKTİF!`);
    console.log(`📡 Port: ${PORT} | Mod: 10 Dk Tek Maç`);
    console.log('====================================');
});

// Oyun motorunu (server.js) bağla
try {
    require('./server.js')(io);
    console.log('✅ Oyun motoru ve 10 dakikalık maç döngüsü optimize şekilde bağlandı.');
} catch (error) {
    console.error('❌ Oyun motoru yüklenirken hata oluştu:', error.message);
}
