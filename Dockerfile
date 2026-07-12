# ── Combat-Game sunucusu — Hugging Face Spaces (Docker) ──
FROM node:20-slim

WORKDIR /app

# Bağımlılıkları kur (önce sadece package.json kopyalanır ki
# kod değiştiğinde npm install tekrar tekrar çalışmasın, build hızlansın)
COPY package*.json ./
RUN npm install --omit=dev

# Geri kalan tüm proje dosyalarını kopyala (index.html, server.js, public/ vb.)
COPY . .

# Hugging Face Spaces varsayılan olarak 7860 portunu dinler
EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production

# Sunucuyu doğrudan başlat (index.js sarmalayıcısını atlayıp
# server.js'i doğrudan çalıştırıyoruz — daha güvenilir)
CMD ["node", "server.js"]
