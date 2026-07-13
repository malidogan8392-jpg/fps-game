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








const path = require('path');

try {
    // Bu komut dosya nerede olursa olsun ana klasördeki sunucu.js'i tam adresiyle bulur
    const absolutePath = path.resolve(__dirname, 'sunucu.js');
    require(absolutePath);
} catch(e) {
    try {
        // Eğer bulamazsa bir üst klasördeki sunucu.js'e tam adresiyle bakar
        const upperPath = path.resolve(__dirname, '../sunucu.js');
        require(upperPath);
    } catch(err) {
        console.error("Maalesef iki konumda da sunucu.js bulunamadı usta:", err);
    }
}
