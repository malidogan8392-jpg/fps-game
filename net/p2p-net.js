// ── P2P Ağ Katmanı ────────────────────────────────────────────────────
// index.html'in geri kalanı hiç değişmeden `socket.emit(...)` / `socket.on(...)`
// çağırmaya devam eder — bu dosya o arayüzü PeerJS (WebRTC) + Hub backend
// üzerinden sağlar. Tek değişiklik: index.html'de `socket = io({...})` satırı
// `socket = createP2PSocket()` ile değiştirilir.
//
// ⚠️ AŞAĞIDAKİ ADRESİ KENDİ HUB BACKEND'İNİN GERÇEK ADRESİYLE DEĞİŞTİR
// (hub-backend/README.md'deki adımlarla Render/Railway'e deploy ettikten sonra):
const HUB_URL = 'https://fps-hub.onrender.com';

const LS_TOKEN = 'fps_token', LS_USER = 'fps_username';

// ── Oturum / ilerleme durumu (bu tarayıcıya özel) ───────────────────────
let myToken = localStorage.getItem(LS_TOKEN) || null;
let myUsername = localStorage.getItem(LS_USER) || null;
let myProgress = { killPoints: 0, unlockedWeapons: ['glock'], unlockedChars: ['soldier'] };

function persistSession() {
    if (myToken) localStorage.setItem(LS_TOKEN, myToken); else localStorage.removeItem(LS_TOKEN);
    if (myUsername) localStorage.setItem(LS_USER, myUsername); else localStorage.removeItem(LS_USER);
}

async function hubFetch(path, opts) {
    const res = await fetch(HUB_URL + path, {
        method: 'GET', headers: { 'Content-Type': 'application/json' }, ...opts
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error || ('Hub hatası: ' + res.status));
    return data;
}

// ── FakeIO / FakeSocket: host tarafında socket.io API'sini taklit eder ──
class FakeSocket {
    constructor(id, transport) {
        this.id = id;
        this._transport = transport; // { sendOut(event,data) }
        this._handlers = {};
        this._io = null; // FakeIO tarafından atanır
    }
    on(event, cb) { this._handlers[event] = cb; }
    emit(event, data) { this._transport.sendOut(event, data); } // bu client'a gönder
    join() {} // tek oda var, no-op
    to(_rid) {
        const io = this._io, selfId = this.id;
        const emitFn = (event, data) => io._sockets.forEach((s) => { if (s.id !== selfId) s._transport.sendOut(event, data); });
        return { emit: emitFn, volatile: { emit: emitFn } };
    }
    _receive(event, data) { this._handlers[event] && this._handlers[event](data); }
}

class FakeIO {
    constructor() { this._sockets = new Map(); this._connCb = null; }
    on(event, cb) { if (event === 'connection') this._connCb = cb; }
    to(target) {
        const io = this;
        // target bir socket id'sine (belirli bir oyuncuya) denk geliyorsa SADECE ona gönder;
        // değilse (oda id'si) herkese broadcast et.
        if (io._sockets.has(target)) {
            const one = io._sockets.get(target);
            const emitFn = (event, data) => one._transport.sendOut(event, data);
            return { emit: emitFn, volatile: { emit: emitFn } };
        }
        const emitFn = (event, data) => io._sockets.forEach((s) => s._transport.sendOut(event, data));
        return { emit: emitFn, volatile: { emit: emitFn } };
    }
    emit(event, data) { this._sockets.forEach((s) => s._transport.sendOut(event, data)); }
    _addSocket(fakeSocket) {
        fakeSocket._io = this;
        this._sockets.set(fakeSocket.id, fakeSocket);
        this._connCb && this._connCb(fakeSocket);
    }
    _removeSocket(id) {
        const s = this._sockets.get(id);
        this._sockets.delete(id);
        if (s) s._receive('disconnect');
    }
}

// ── window.socket: index.html'in kullandığı tek nesne ───────────────────
class P2PSocket {
    constructor() {
        this._handlers = {};
        this.connected = false;
        this.id = null;
        this._mode = null;      // 'host' | 'client'
        this._conn = null;      // PeerJS DataConnection (client modunda)
        this._fakeSocket = null; // host'un kendi loopback FakeSocket'i (host modunda)
    }
    on(event, cb) { this._handlers[event] = cb; }
    connect() { /* basit sürüm: yeniden bağlanma otomatik değil, sayfa yenilenir */ }

    _fire(event, data) {
        this._handlers[event] && this._handlers[event](data);
        maybeSaveProgress(event, data, this.id);
    }

    emit(event, data) {
        switch (event) {
            case 'login': return void p2pNetLogin(data);
            case 'register': return void p2pNetRegister(data);
            case 'getRooms': return void p2pNetGetRooms();
            case 'quickJoin': return void p2pNetQuickJoin();
            case 'joinRoom': return void p2pNetJoinRoom(data);
            default:
                if (this._mode === 'host' && this._fakeSocket) this._fakeSocket._receive(event, data);
                else if (this._mode === 'client' && this._conn && this._conn.open) this._conn.send({ event, data });
        }
    }
}

function createP2PSocket() {
    const s = new P2PSocket();
    // Sayfa bir davet linkiyle açıldıysa (?join=KOD) otomatik katıl
    const params = new URLSearchParams(location.search);
    const joinCode = params.get('join');
    if (joinCode) setTimeout(() => { becomeClient(s, joinCode); }, 300);
    return s;
}

// ── Hesap işlemleri (doğrudan Hub API'sine, P2P'ye hiç girmeden) ────────
async function p2pNetLogin({ user, pwd }) {
    try {
        const data = await hubFetch('/api/login', { method: 'POST', body: JSON.stringify({ user, pwd }) });
        myToken = data.token; myUsername = data.username;
        myProgress = { killPoints: data.killPoints, unlockedWeapons: data.unlockedWeapons, unlockedChars: data.unlockedChars };
        persistSession();
        window.socket._fire('authOk', { username: myUsername });
    } catch (e) { window.socket._fire('authErr', e.message); }
}

async function p2pNetRegister({ user, pwd }) {
    try {
        const data = await hubFetch('/api/register', { method: 'POST', body: JSON.stringify({ user, pwd }) });
        myToken = data.token; myUsername = data.username;
        myProgress = { killPoints: data.killPoints, unlockedWeapons: data.unlockedWeapons, unlockedChars: data.unlockedChars };
        persistSession();
        window.socket._fire('authOk', { username: myUsername });
    } catch (e) { window.socket._fire('authErr', e.message); }
}

// Oyun içinde ilerleme değiştiğinde (kill, mağaza) kendi hesabımızı Hub'a kaydet.
// Not: host BUNU asla bizim adımıza yapamaz — token hiçbir zaman host'a gönderilmez,
// sadece bu tarayıcı kendi ilerlemesini kendi token'ıyla kaydeder.
let saveTimer = null;
function maybeSaveProgress(event, data, myId) {
    if (!myToken) return;
    const isMine = (event === 'scoreUpdate' && data && data.id === myId && data.killPoints !== undefined)
        || event === 'shopOk' || event === 'charOk';
    if (!isMine) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        hubFetch('/api/save', {
            method: 'POST',
            body: JSON.stringify({
                token: myToken,
                killPoints: window.killPoints,
                unlockedWeapons: window.unlockedWeapons,
                unlockedChars: window.unlockedChars
            })
        }).catch(() => {}); // sessizce yeniden dener bir sonraki değişiklikte
    }, 800);
}

// ── Lobi: Hızlı Oyna / Sunucular / Sunucu Aç ────────────────────────────
async function p2pNetGetRooms() {
    try {
        const data = await hubFetch('/api/servers/list');
        const list = data.servers.map(s => ({ id: s.peerId, name: s.name, count: s.players, max: s.maxPlayers, phase: s.phase || 'playing', map: s.map }));
        window.socket._fire('roomList', list);
    } catch (e) { window.socket._fire('roomList', []); }
}

async function p2pNetQuickJoin() {
    try {
        const data = await hubFetch('/api/servers/quick');
        if (data.server) becomeClient(window.socket, data.server.peerId);
        else becomeHost(window.socket, 'public', 'Hızlı Sunucu');
    } catch (e) {
        // Hub'a ulaşılamıyorsa yine de kendi P2P sunucunu açıp oynayabilesin
        becomeHost(window.socket, 'public', 'Hızlı Sunucu (çevrimdışı hub)');
    }
}

function p2pNetJoinRoom(id) { becomeClient(window.socket, id); }

function genShortCode() {
    return 'FPS-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

// mode: 'public' (Hızlı Oyna havuzu) | 'community' (Community Servers listesi)
function becomeHost(s, mode, name) {
    const peerId = genShortCode();
    const hostToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const peer = new Peer(peerId, { debug: 0 });

    peer.on('open', (id) => {
        s._mode = 'host'; s.id = id; s.connected = true;
        const io = new FakeIO();
        const room = createRoomEngine(io, { name: name || ('Sunucu ' + id) });

        // Host'un kendi oyuncusu: loopback FakeSocket (ağ üzerinden değil, doğrudan)
        const loopback = new FakeSocket(id, { sendOut: (event, data) => s._fire(event, data) });
        io._addSocket(loopback);
        s._fakeSocket = loopback;
        loopback._receive('helloJoin', { username: myUsername, killPoints: myProgress.killPoints, unlockedWeapons: myProgress.unlockedWeapons, unlockedChars: myProgress.unlockedChars });

        s._fire('connect');
        window._hostShareInfo && window._hostShareInfo(id);
        setInterval(() => { if (s._fakeSocket) s._fakeSocket._receive('_ping'); }, 5000); // lobi arayüzüne davet linki/kodu bildir

        // Yeni oyuncular bağlandıkça
        peer.on('connection', (conn) => {
            const fs = new FakeSocket(conn.peer, { sendOut: (event, data) => { if (conn.open) conn.send({ event, data }); } });
            conn.on('open', () => io._addSocket(fs));
            conn.on('data', (msg) => fs._receive(msg.event, msg.data));
            conn.on('close', () => io._removeSocket(conn.peer));
        });

        // Hub'a kendini kaydet (heartbeat)
        const heartbeat = () => {
            hubFetch('/api/servers/heartbeat', {
                method: 'POST',
                body: JSON.stringify({
                    peerId: id, hostToken, name: room.name, mode,
                    players: Object.keys(room.players).length, maxPlayers: window.MAX_PLAYERS,
                    map: room.currentMap, phase: room.phase
                })
            }).catch(() => {});
        };
        heartbeat();
        const hbInterval = setInterval(heartbeat, 8000);
        window.addEventListener('beforeunload', () => {
            clearInterval(hbInterval);
            navigator.sendBeacon && navigator.sendBeacon(HUB_URL + '/api/servers/' + id, new Blob([JSON.stringify({ hostToken })], { type: 'application/json' }));
        });
    });

    peer.on('error', (err) => { console.error('PeerJS host hatası:', err); window.socket._fire('gameErr', 'Sunucu açılamadı: ' + err.type); });
}

function becomeClient(s, hostPeerId) {
    hostPeerId = String(hostPeerId || '').trim().toUpperCase();
    if (!hostPeerId) return;
    const peer = new Peer({ debug: 0 });

    peer.on('open', (myId) => {
        const conn = peer.connect(hostPeerId, { reliable: true });
        conn.on('open', () => {
            s._mode = 'client'; s.id = myId; s.connected = true; s._conn = conn;
            conn.send({ event: 'helloJoin', data: { username: myUsername, killPoints: myProgress.killPoints, unlockedWeapons: myProgress.unlockedWeapons, unlockedChars: myProgress.unlockedChars } });
            s._fire('connect');
            setInterval(() => { if (conn.open) conn.send({ event: '_ping', data: null }); }, 5000);
        });
        conn.on('data', (msg) => s._fire(msg.event, msg.data));
        conn.on('close', () => { s.connected = false; s._fire('disconnect'); });
        conn.on('error', (err) => { console.error('PeerJS bağlantı hatası:', err); window.socket._fire('gameErr', 'Sunucuya bağlanılamadı'); });
    });
    peer.on('error', (err) => {
        console.error('PeerJS client hatası:', err);
        window.socket._fire('gameErr', err.type === 'peer-unavailable' ? 'Sunucu bulunamadı ya da kapalı' : ('Bağlantı hatası: ' + err.type));
    });
}

// Menüden "Sunucu Aç" butonuna basıldığında çağrılır (bkz. index.html lobi kodu)
function startHosting(mode, name) { becomeHost(window.socket, mode, name); }

window.createP2PSocket = createP2PSocket;
window.startHosting = startHosting;
window.becomeClientJoin = (code) => becomeClient(window.socket, code);
