/* =========================================================
   YT CLIP DOWNLOADER — BACKEND EXPRESS
   Endpoints:
     GET /api/info?id=VIDEO_ID              -> metadata + available qualities
     GET /api/download?id=...&quality=...&start=0&end=0&format=mp4
     GET /api/transcript?id=...&lang=id     -> SRT / VTT / TXT / JSON
   Serve static: GET /*  ->  public/index.html
   ========================================================= */
const express = require('express');
const cors    = require('cors');
const ytdl    = require('@distube/ytdl-core');
const ffmpeg  = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { YoutubeTranscript } = require('youtube-transcript');
const path    = require('path');
const fs      = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const YT_AGENT = ytdl.createAgent ? null : undefined;

/* ---------- helpers ---------- */
function fmtSize(bytes){
  if(!bytes) return null;
  if(bytes < 1024) return bytes + ' B';
  if(bytes < 1024*1024) return (bytes/1024).toFixed(1)+' KB';
  if(bytes < 1024*1024*1024) return (bytes/1024/1024).toFixed(1)+' MB';
  return (bytes/1024/1024/1024).toFixed(2)+' GB';
}
function slug(s){ return (s||'video').toString().replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60) || 'video'; }
function pickFormat(info, qualityKey){
  // qualityKey: '1080p'|'720p'|'480p'|'360p'|'240p'|'audio'
  const fmts = info.formats.filter(f => f.hasVideo || f.hasAudio);
  const heightOrder = { '1080p':1080, '720p':720, '480p':480, '360p':360, '240p':240 };

  if(qualityKey === 'audio'){
    // highest quality audio-only
    const audioOnly = fmts.filter(f => f.hasAudio && !f.hasVideo)
      .sort((a,b) => (b.audioBitrate||0) - (a.audioBitrate||0));
    if(audioOnly.length) return { video: null, audio: audioOnly[0], isAudio: true };
    // fallback: any with audio
    const any = fmts.filter(f=>f.hasAudio).sort((a,b)=>(b.audioBitrate||0)-(a.audioBitrate||0))[0];
    return { video: null, audio: any, isAudio: true };
  }

  const targetH = heightOrder[qualityKey] || 1080;
  // Find video format closest to target (prefer progressive if small, else DASH)
  const videoFmts = fmts.filter(f => f.hasVideo && f.height)
    .sort((a,b) => {
      const da = Math.abs(a.height - targetH);
      const db = Math.abs(b.height - targetH);
      if(da !== db) return da - db;
      // prefer higher bitrate among same height
      return (b.bitrate||0) - (a.bitrate||0);
    });

  let video = videoFmts[0] || null;
  // If video has no audio (DASH), pick best audio
  let audio = null;
  if(video && !video.hasAudio){
    audio = fmts.filter(f => f.hasAudio && !f.hasVideo)
      .sort((a,b) => (b.audioBitrate||0) - (a.audioBitrate||0))[0] || null;
  }
  return { video, audio, isAudio: false };
}

/* ---------- GET /api/info ---------- */
app.get('/api/info', async (req, res) => {
  const id = (req.query.id || '').toString().trim();
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id)){
    return res.status(400).json({ ok:false, error:'ID video tidak valid' });
  }
  try {
    const url = 'https://www.youtube.com/watch?v=' + id;
    const info = await ytdl.getInfo(url);
    const v = info.videoDetails;
    const available = [];
    const seen = new Set();
    info.formats.filter(f=>f.hasVideo && f.height).forEach(f => {
      const key = f.height + 'p';
      if(!seen.has(key) && [240,360,480,720,1080,1440,2160].includes(f.height)){
        seen.add(key);
        available.push({ key, label: key, sub: f.qualityLabel || key });
      }
    });
    available.sort((a,b) => parseInt(b.key) - parseInt(a.key));
    available.push({ key:'audio', label:'Audio', sub:'MP3 128k+' });

    res.json({
      ok: true,
      id: v.videoId,
      title: v.title,
      channel: v.author?.name || v.ownerChannelName || 'YouTube',
      duration: parseInt(v.lengthSeconds || '0', 10),
      thumbnail: v.thumbnails?.[v.thumbnails.length-1]?.url ||
                 `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      description: (v.description||'').slice(0,200),
      views: v.viewCount,
      availableQualities: available
    });
  } catch(err){
    console.error('[info ERR]', err.message);
    res.status(500).json({ ok:false, error: err.message || 'Gagal mengambil info video' });
  }
});

/* ---------- GET /api/download ---------- */
app.get('/api/download', async (req, res) => {
  const id = (req.query.id || '').toString().trim();
  const quality = (req.query.quality || '1080p').toString();
  const start = Math.max(0, parseFloat(req.query.start || '0'));
  const end   = parseFloat(req.query.end || '0');
  const doClip = !!(end && end > start + 0.1);

  if(!/^[a-zA-Z0-9_-]{11}$/.test(id)){
    return res.status(400).json({ ok:false, error:'ID tidak valid' });
  }
  const url = 'https://www.youtube.com/watch?v=' + id;

  try {
    const info = await ytdl.getInfo(url);
    const fmt = pickFormat(info, quality);
    const v = info.videoDetails;
    const isAudio = fmt.isAudio;
    const ext = isAudio ? 'mp3' : 'mp4';
    const clipTag = doClip ? `_clip_${Math.floor(start/60)}m${Math.floor(start%60)}s-${Math.floor(end/60)}m${Math.floor(end%60)}s` : '';
    const filename = `${slug(v.title)}${clipTag}_${quality}.${ext}`;

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'no-cache');

    // ---- AUDIO ONLY ----
    if(isAudio){
      const stream = ytdl(url, { format: fmt.audio });
      if(doClip){
        ffmpeg(stream)
          .format('mp3')
          .audioCodec('libmp3lame')
          .audioBitrate(fmt.audio.audioBitrate || 128)
          .seekInput(start)
          .duration(end - start)
          .on('error', e => { console.error('[ffmpeg audio]',e.message); try{res.end();}catch(_){} })
          .pipe(res, { end: true });
      } else {
        res.setHeader('Content-Type', 'audio/mpeg');
        ffmpeg(stream)
          .format('mp3').audioCodec('libmp3lame')
          .audioBitrate(fmt.audio.audioBitrate || 128)
          .on('error', e => { console.error('[ffmpeg audio]',e.message); try{res.end();}catch(_){} })
          .pipe(res, { end: true });
      }
      return;
    }

    // ---- VIDEO (progressive or DASH mux) ----
    const videoStream = fmt.video ? ytdl(url, { format: fmt.video }) : null;
    const audioStream = fmt.audio ? ytdl(url, { format: fmt.audio }) : null;

    if(!videoStream){
      return res.status(500).json({ok:false,error:'Tidak ada stream video untuk kualitas ini'});
    }

    const cmd = ffmpeg();
    if(videoStream) cmd.input(videoStream);
    if(audioStream) cmd.input(audioStream);
    cmd.outputFormat('mp4');
    cmd.videoCodec('copy');
    cmd.audioCodec(audioStream ? 'aac' : 'copy');
    if(doClip){
      cmd.seekInput(start);
      cmd.duration(end - start);
    }
    // Faststart for web playback
    cmd.outputOptions('-movflags', '+faststart');
    res.setHeader('Content-Type', 'video/mp4');

    cmd.on('error', e => {
      console.error('[ffmpeg ERR]', e.message);
      try{ res.end(); }catch(_){}
    });
    cmd.on('end', () => { /* done */ });
    cmd.pipe(res, { end: true });
    cmd.run();

  } catch(err){
    console.error('[download ERR]', err.message);
    if(!res.headersSent){
      res.status(500).json({ ok:false, error: err.message || 'Gagal mengunduh' });
    }
  }
});

/* ---------- GET /api/transcript ---------- */
app.get('/api/transcript', async (req, res) => {
  const id = (req.query.id || '').toString().trim();
  const lang = (req.query.lang || 'id').toString();
  const format = (req.query.format || 'json').toString();
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id)){
    return res.status(400).json({ ok:false, error:'ID tidak valid' });
  }
  try {
    let raw;
    try {
      raw = await YoutubeTranscript.fetchTranscript(id, { lang });
    } catch(_){
      // fallback: try en
      raw = await YoutubeTranscript.fetchTranscript(id, { lang: 'en' });
    }
    const lines = raw.map(r => ({
      start: r.offset / 1000,
      dur:   r.duration / 1000,
      end:   (r.offset + r.duration) / 1000,
      text:  r.text
    }));

    if(format === 'json'){
      return res.json({ ok:true, id, lang, lines });
    }

    const pad = n => n<10?'0'+n:''+n;
    const srtT = t => {
      const h=Math.floor(t/3600), m=Math.floor((t%3600)/60), s=Math.floor(t%60), ms=Math.floor((t%1)*1000);
      return `${pad(h)}:${pad(m)}:${pad(s)},${ms<10?'00'+ms:ms<100?'0'+ms:ms}`;
    };
    const vttT = t => {
      const h=Math.floor(t/3600), m=Math.floor((t%3600)/60), s=Math.floor(t%60), ms=Math.floor((t%1)*1000);
      return (h>0?pad(h)+':':'') + `${pad(m)}:${pad(s)}.${ms<10?'00'+ms:ms<100?'0'+ms:ms}`;
    };

    let out = '', mime = 'text/plain', fname = `${id}.${lang}.${format}`;
    if(format === 'srt'){
      lines.forEach((L,i) => {
        out += `${i+1}\n${srtT(L.start)} --> ${srtT(L.end)}\n${L.text}\n\n`;
      });
      mime = 'text/plain';
    } else if(format === 'vtt'){
      out = 'WEBVTT\n\n';
      lines.forEach((L,i) => {
        out += `${i+1}\n${vttT(L.start)} --> ${vttT(L.end)}\n${L.text}\n\n`;
      });
      mime = 'text/vtt';
    } else { // txt
      lines.forEach(L => { out += `[${vttT(L.start)}] ${L.text}\n`; });
    }
    res.setHeader('Content-Type', `${mime}; charset=utf-8`);
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(out);
  } catch(err){
    console.error('[transcript ERR]', err.message);
    res.status(500).json({ ok:false, error: err.message || 'Transkrip tidak tersedia untuk video ini' });
  }
});

/* ---------- SPA fallback ---------- */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ---------- START ---------- */
if(require.main === module){
  app.listen(PORT, () => {
    console.log(`\n🚀 YT Clip Downloader berjalan di:`);
    console.log(`   Lokal : http://localhost:${PORT}`);
    console.log(`   UI    : http://localhost:${PORT}/`);
    console.log(`   API   : http://localhost:${PORT}/api/info?id=dQw4w9WgXcQ\n`);
  });
}

module.exports = app;
