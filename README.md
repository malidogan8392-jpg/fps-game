---
title: Combat Game Server
emoji: 🔫
colorFrom: red
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Combat-Game Sunucusu

Multiplayer low-poly FPS oyunu için Node.js + Socket.io sunucusu.
Docker üzerinden Hugging Face Spaces'te çalışacak şekilde yapılandırıldı.

## Gerekli ortam değişkenleri (Space → Settings → Repository secrets)

| Değişken | Açıklama |
|---|---|
| `GITHUB_TOKEN` | Hesapları GitHub'a kalıcı kaydetmek için (repo yetkili PAT) |
| `GITHUB_REPO` | `kullanici/repo` formatında |
| `GITHUB_BRANCH` | Genelde `main` |

Bu değişkenler ayarlanmazsa hesaplar sadece container içinde geçici olarak tutulur,
container yeniden başladığında (HF Spaces'in disk alanı kalıcı değildir) hesaplar silinir.
