/* Netlify Function: GET /api/download?id=...&quality=...&start=...&end=...
   Catatan: Netlify Functions punya batas waktu 10-26 detik & memori.
   Untuk video panjang / klip > ~3 menit, gunakan server Express lokal/VPS. */
const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());

app.get('/.netlify/functions/download', go);
app.get('/api/download', go);
app.get('/', go);

function pickFormat(info, qualityKey){
  const fmts = info.formats.filter(f => f.hasVideo || f.hasAudio);
  const h = {'1080p':1080,'720p':720,'480p':480,'360p':360,'240p':240};
  if(qualityKey==='audio'){
    const a = fmts.filter(f=>f.hasAudio&&!f.hasVideo).sort((a,b)=>(b.audioBitrate||0)-(a.audioBitrate||0))[0];
    return {video:null, audio:a||fmts.filter(f=>f.hasAudio)[0], isAudio:true};
  }
  const target = h[qualityKey] || 1080;
  const vids = fmts.filter(f=>f.hasVideo&&f.height).sort((a,b)=>{
    const da=Math.abs(a.height-target), db=Math.abs(b.height-target);
    if(da!==db) return da-db; return (b.bitrate||0)-(a.bitrate||0);
  });
  const video = vids[0] || null;
  let audio = null;
  if(video && !video.hasAudio){
    audio = fmts.filter(f=>f.hasAudio&&!f.hasVideo).sort((a,b)=>(b.audioBitrate||0)-(a.audioBitrate||0))[0];
  }
  return {video, audio, isAudio:false};
}

function slug(s){return (s||'video').toString().replace(/[^\w\-]+/g,'_').slice(0,60)||'video';}

async function go(req, res){
  const id = (req.query.id||'').toString().trim();
  const quality = (req.query.quality||'1080p').toString();
  const start = Math.max(0, parseFloat(req.query.start||'0'));
  const end = parseFloat(req.query.end||'0');
  const doClip = !!(end && end > start + 0.1);
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id)) return res.status(400).json({ok:false,error:'ID invalid'});
  const url = 'https://www.youtube.com/watch?v='+id;
  try{
    const info = await ytdl.getInfo(url);
    const fmt = pickFormat(info, quality);
    const v = info.videoDetails;
    const ext = fmt.isAudio?'mp3':'mp4';
    const clipTag = doClip ? `_clip_${Math.floor(start/60)}m${Math.floor(start%60)}s-${Math.floor(end/60)}m${Math.floor(end%60)}s`:'';
    const filename = `${slug(v.title)}${clipTag}_${quality}.${ext}`;
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control','no-cache');

    if(fmt.isAudio){
      const s = ytdl(url,{format:fmt.audio});
      const cmd = ffmpeg(s).format('mp3').audioCodec('libmp3lame').audioBitrate(fmt.audio.audioBitrate||128);
      if(doClip) cmd.seekInput(start).duration(end-start);
      res.setHeader('Content-Type','audio/mpeg');
      cmd.on('error',e=>{console.error(e);try{res.end();}catch(_){}}).pipe(res,{end:true});
      return;
    }

    const vs = fmt.video ? ytdl(url,{format:fmt.video}) : null;
    const as = fmt.audio ? ytdl(url,{format:fmt.audio}) : null;
    if(!vs) return res.status(500).json({ok:false,error:'no video stream'});
    const cmd = ffmpeg();
    if(vs) cmd.input(vs);
    if(as) cmd.input(as);
    cmd.format('mp4').videoCodec('copy').audioCodec(as?'aac':'copy');
    if(doClip) cmd.seekInput(start).duration(end-start);
    cmd.outputOptions('-movflags','+faststart');
    res.setHeader('Content-Type','video/mp4');
    cmd.on('error',e=>{console.error(e);try{res.end();}catch(_){}});
    cmd.pipe(res,{end:true});
    cmd.run();
  }catch(err){
    console.error(err);
    if(!res.headersSent) res.status(500).json({ok:false,error:err.message||'Gagal'});
  }
}

exports.handler = serverless(app);
