/* Netlify Function: GET /api/info?id=VIDEO_ID */
const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');

const app = express();
app.use(cors());

app.get('/.netlify/functions/info', handler);
app.get('/api/info', handler);
app.get('/', handler);

async function handler(req, res){
  const id = (req.query.id || '').toString().trim();
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id)){
    return res.status(400).json({ok:false,error:'ID tidak valid'});
  }
  try{
    const url = 'https://www.youtube.com/watch?v='+id;
    const info = await ytdl.getInfo(url);
    const v = info.videoDetails;
    const seen = new Set(), available = [];
    info.formats.filter(f=>f.hasVideo && f.height).forEach(f => {
      const key = f.height+'p';
      if(!seen.has(key) && [240,360,480,720,1080,1440,2160].includes(f.height)){
        seen.add(key); available.push({key, label:key, sub:f.qualityLabel||key});
      }
    });
    available.sort((a,b)=>parseInt(b.key)-parseInt(a.key));
    available.push({key:'audio',label:'Audio',sub:'MP3'});
    res.json({
      ok:true, id:v.videoId, title:v.title,
      channel: v.author?.name || v.ownerChannelName || 'YouTube',
      duration: parseInt(v.lengthSeconds||'0',10),
      thumbnail: v.thumbnails?.[v.thumbnails.length-1]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      views: v.viewCount, availableQualities: available
    });
  }catch(err){
    res.status(500).json({ok:false,error:err.message||'Gagal'});
  }
}

exports.handler = serverless(app);
