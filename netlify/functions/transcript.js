/* Netlify Function: GET /api/transcript?id=...&lang=id&format=json|srt|vtt|txt */
const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { YoutubeTranscript } = require('youtube-transcript');

const app = express();
app.use(cors());

app.get('/.netlify/functions/transcript', go);
app.get('/api/transcript', go);
app.get('/', go);

async function go(req, res){
  const id = (req.query.id||'').toString().trim();
  const lang = (req.query.lang||'id').toString();
  const format = (req.query.format||'json').toString();
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id)) return res.status(400).json({ok:false,error:'ID invalid'});
  try{
    let raw;
    try{ raw = await YoutubeTranscript.fetchTranscript(id,{lang}); }
    catch(_){ raw = await YoutubeTranscript.fetchTranscript(id,{lang:'en'}); }
    const lines = raw.map(r=>({
      start: r.offset/1000, dur: r.duration/1000,
      end: (r.offset+r.duration)/1000, text: r.text
    }));
    if(format==='json') return res.json({ok:true,id,lang,lines});
    const pad=n=>n<10?'0'+n:''+n;
    const srtT=t=>{const h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=Math.floor(t%60),ms=Math.floor((t%1)*1000);return `${pad(h)}:${pad(m)}:${pad(s)},${ms<10?'00'+ms:ms<100?'0'+ms:ms}`;};
    const vttT=t=>{const h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=Math.floor(t%60),ms=Math.floor((t%1)*1000);return (h>0?pad(h)+':':'')+`${pad(m)}:${pad(s)}.${ms<10?'00'+ms:ms<100?'0'+ms:ms}`;};
    let out='';
    if(format==='srt') lines.forEach((L,i)=>{out+=`${i+1}\n${srtT(L.start)} --> ${srtT(L.end)}\n${L.text}\n\n`;});
    else if(format==='vtt'){out='WEBVTT\n\n';lines.forEach((L,i)=>{out+=`${i+1}\n${vttT(L.start)} --> ${vttT(L.end)}\n${L.text}\n\n`;});}
    else lines.forEach(L=>{out+=`[${vttT(L.start)}] ${L.text}\n`;});
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="${id}.${lang}.${format}"`);
    res.send(out);
  }catch(err){
    res.status(500).json({ok:false,error:err.message||'Transkrip tidak tersedia'});
  }
}

exports.handler = serverless(app);
