const fs = require('fs');
const path = require('path');

// Süreyi 20 saniyeye çıkardık ki link kesinleşsin usta
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








try {
    require('./sunucu.js');
} catch(e) {
    console.error("Dosya yüklenemedi:", e);
}
