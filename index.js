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








const fs = require('fs');

// Render'ın ana klasöründeki tam yolu bulalım
const anaKlasorYolu = path.resolve('/opt/render/project/src/sunucu.js');
const disKlasorYolu = path.resolve('/opt/render/project/sunucu.js');

if (fs.existsSync(anaKlasorYolu)) {
    require(anaKlasorYolu);
} else if (fs.existsSync(disKlasorYolu)) {
    require(disKlasorYolu);
} else {
    console.error("Usta, Render sunucusunda sunucu.js dosyasını hiçbir yerde bulamadım!");
}
