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






// Global alandaki fs çakışmalarını engellemek için geçici bir blok (scope) açıyoruz
{
    const fs = require('fs');
    const olasiYollar = [
        path.resolve(__dirname, 'sunucu.js'),
        path.resolve(__dirname, 'Sunucu.js'),
        path.resolve(__dirname, 'server.js'),
        path.resolve(__dirname, '../sunucu.js'),
        path.resolve(__dirname, '../Sunucu.js'),
        path.resolve(__dirname, '../server.js')
    ];

    let dosyaBulundu = false;

    // server.js'in içindeki mükerrer fs tanımları index.js'i çökertmesin diye koruma altına alıyoruz
    global.fs = fs; 

    for (const yol of olasiYollar) {
        if (fs.existsSync(yol)) {
            try {
                require(yol);
                dosyaBulundu = true;
                break; 
            } catch (e) {
                console.error("Dosya yüklenirken hata oluştu:", e.message);
            }
        }
    }

    if (!dosyaBulundu) {
        console.error("Usta, denediğim 6 farklı kombinasyonda da bu dosyayı bulamadım!");
    }
}
