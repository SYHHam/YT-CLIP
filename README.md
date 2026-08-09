# 🎬 YT Clip Downloader — Full Stack

**Unduh video YouTube, potong klip dengan presisi, ambil transkrip.**
Frontend: Single-file HTML + Tailwind + YouTube IFrame Player API
Backend: Node.js + Express + `@distube/ytdl-core` + `fluent-ffmpeg` + `youtube-transcript`

## ✨ Fitur
- ▶️ **Pemutar YouTube sungguhan** (bisa play/pause/fullscreen)
- ✋ **Timeline bisa DIGESER** — handle A (awal) & B (akhir) drag pakai mouse/jari
- ⚡ **Kualitas otomatis** sampai 1080p (DASH mux video+audio via ffmpeg)
- ✂️ **Potong klip di server** (ffmpeg `-ss` + `-to`, akurat per-detik)
- 📝 **Transkrip / Subtitle** — download SRT / VTT / TXT / JSON
- 🖱️ Klik baris transkrip → video lompat ke waktu itu, auto-highlight
- 🔌 **Auto-detect backend** — jika server mati, frontend masuk **Mode DEMO**
- 🚀 Siap jalankan **lokal** (Express) atau deploy **Netlify** (static + serverless)

---

## 🚀 Cara Jalankan Lokal (Paling Disarankan)

```bash
# 1. Ekstrak ZIP, masuk folder
cd yt-clip-downloader

# 2. Install dependensi (otomatis download binary ffmpeg)
npm install

# 3. Jalankan server
npm start
```

Buka browser → **http://localhost:3000** ✅

> Backend berjalan di port `3000`, frontend diserve dari folder `public/`.
> API endpoint: `/api/info`, `/api/download`, `/api/transcript`.

---

## 🌐 Cara Deploy ke Netlify (2 Opsi)

### 🅰️ Opsi A — CEPAT: Hanya Frontend (Mode DEMO)
1. Drag folder **`public/`** ke https://app.netlify.com/drop
2. Selesai! Dapat URL live.
3. ⚠️ Fitur download & transkrip **simulasi** (tidak dapat file asli).

### 🅱️ Opsi B — LENGKAP: Frontend + Netlify Functions
Upload **SELURUH folder `yt-clip-downloader`** (termasuk `netlify.toml` & `netlify/functions/`):

**Cara CLI:**
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

**Cara Website:**
1. Push folder ini ke GitHub/GitLab
2. Netlify → **Add new site → Import** → pilih repo
3. Build command: `npm install` · Publish: `public`
4. Deploy!

#### ⚠️ Batasan Netlify Functions
- **Runtime limit**: 10 detik (free) / 26 detik (pro) → klip **> ~2-3 menit** sering timeout
- **Bundle size**: `ffmpeg-static` ~70MB → mungkin melebihi batas 50MB zipped
- **IP YouTube**: kadang IP Netlify diblok oleh YouTube

#### 💡 Solusi jika Netlify Functions gagal
**Deploy backend terpisah ke VPS** (Railway / Render / Fly.io / Vercel Edge):
1. Upload folder ini ke Railway → command `npm start` → port `3000`
2. Dapat URL misal `https://yt-clip-production.up.railway.app`
3. Edit `public/index.html` → ubah `API_BASE` di baris pertama `<script>`:
   ```js
   var API_BASE = 'https://yt-clip-production.up.railway.app/api';
   ```
4. Upload folder `public/` ke Netlify Drop.

---

## 📡 API Endpoints

| Method | Path | Query | Output |
|---|---|---|---|
| `GET` | `/api/info` | `id=VIDEO_ID` | Metadata + kualitas tersedia |
| `GET` | `/api/download` | `id`, `quality`, `start`, `end` | Stream file MP4/MP3 (Content-Disposition) |
| `GET` | `/api/transcript` | `id`, `lang=id/en`, `format=json/srt/vtt/txt` | Transkrip dalam format pilihan |

**Contoh:**
```
http://localhost:3000/api/download?id=dQw4w9WgXcQ&quality=1080p&start=10&end=25
http://localhost:3000/api/transcript?id=dQw4w9WgXcQ&lang=en&format=srt
```

---

## 📁 Struktur File
```
yt-clip-downloader/
├── package.json              # Dependencies + scripts
├── server.js                 # Express server (lokal / VPS)
├── netlify.toml              # Konfigurasi Netlify
├── netlify/
│   └── functions/
│       ├── info.js           # Serverless: GET /api/info
│       ├── download.js       # Serverless: GET /api/download
│       └── transcript.js     # Serverless: GET /api/transcript
├── public/
│   └── index.html            # Frontend lengkap (UI + Player + Timeline)
└── README.md                 # Dokumen ini
```

---

## 🛠️ Stack Teknis
- **`@distube/ytdl-core`** — stream video/audio YouTube (paling aktif di-maintain)
- **`fluent-ffmpeg` + `ffmpeg-static`** — mux DASH (video+audio terpisah) & potong klip
- **`youtube-transcript`** — ambil caption/subtitle dari YouTube
- **`serverless-http`** — bungkus Express jadi Netlify Function
- **YouTube IFrame API** — pemutar video interaktif

## 🔧 Troubleshooting
- **"Signature extraction failed"** → `npm update @distube/ytdl-core` (YouTube sering ubah algoritma)
- **ffmpeg error** → hapus `node_modules` & `package-lock.json` → `npm install` ulang
- **Transkrip kosong** → video tidak punya caption yang di-enable oleh uploader
- **Netlify deploy gagal bundle size** → hapus `ffmpeg-static` dari `netlify.toml` → gunakan `@ffmpeg-installer/ffmpeg` atau layer Lambda

## ⚖️ Disclaimer
Gunakan hanya untuk konten yang **izinkan diunduh** (Creative Commons dll).
Hormati **Terms of Service YouTube** dan hak cipta pemilik konten.

---

**Dibuat dengan ❤️ — Full stack siap pakai.**
