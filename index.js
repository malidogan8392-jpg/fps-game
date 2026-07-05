const fs = require('fs');
const path = require('path');

// 5 saniye sonra log dosyasını okuyup ekrana yazdırır
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
}, 5000);








try { require('./server.js'); } catch(e) { require('./sunucu.js'); }
