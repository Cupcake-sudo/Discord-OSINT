const http = require('http');
const fs   = require('fs');
const path = require('path');

const MIME = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.bmp':  'image/bmp',
  '.svg':  'image/svg+xml',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.m4a':  'audio/mp4',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
};

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function avatarUrl(userId, avatarHash, discriminator) {
  if (avatarHash) {
    const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
    return 'https://cdn.discordapp.com/avatars/' + userId + '/' + avatarHash + '.' + ext + '?size=128';
  }
  let idx;
  if (discriminator && discriminator !== '0') {
    idx = parseInt(discriminator, 10) % 5;
  } else {
    try {
      idx = Number((BigInt(userId) >> 22n) % 6n);
    } catch {
      idx = 0;
    }
  }
  return 'https://cdn.discordapp.com/embed/avatars/' + idx + '.png';
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
         '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function localFileToHref(p) {
  if (!p) return null;
  const norm = p.replace(/\\/g, '/');
  const idx  = norm.lastIndexOf('/files/');
  if (idx === -1) {
    const base = path.basename(norm);
    return '/files/' + encodeURIComponent(base);
  }
  return '/files/' + norm.slice(idx + '/files/'.length).split('/').map(encodeURIComponent).join('/');
}

function isImage(p) { return /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(p || ''); }
function isVideo(p) { return /\.(mp4|webm|mov|m4v)$/i.test(p || ''); }
function isAudio(p) { return /\.(mp3|ogg|wav|m4a|flac|aac|opus)$/i.test(p || ''); }

function groupByServer(items) {
  const out = {};
  for (const m of items) {
    const sk = m.guildName || m.guildId || 'unknown server';
    const ck = m.channelName ? '#' + m.channelName : '#unknown';
    if (!out[sk]) out[sk] = {};
    if (!out[sk][ck]) out[sk][ck] = [];
    out[sk][ck].push(m);
  }
  for (const s of Object.keys(out)) {
    for (const c of Object.keys(out[s])) {
      out[s][c].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
  }
  return out;
}

function messageDataHas(m) {
  const types = [];
  if (m.content && m.content.trim()) types.push('text');
  const allFiles = m.files || [];
  for (const f of allFiles) {
    if (isImage(f.localPath))      types.push('image');
    else if (isVideo(f.localPath)) types.push('video');
    else if (isAudio(f.localPath)) types.push('audio');
    else                           types.push('other');
  }
  if (m.attachments && m.attachments.length) types.push('other');
  if (types.length === 0) types.push('text');
  return [...new Set(types)].join(' ');
}

function renderMessageCard(m, opts) {
  const id        = opts.mode === 'mentions' ? m.senderId    : (m.authorId || opts.targetId);
  const tag       = opts.mode === 'mentions' ? m.senderTag   : (m.authorTag || opts.targetTag || '—');
  const av        = opts.mode === 'mentions' ? m.senderAvatar : (m.authorAvatar || opts.targetAvatar);
  const discrim   = opts.mode === 'mentions' ? m.senderDiscriminator : null;
  const avSrc     = id ? avatarUrl(id, av, discrim) : null;
  const dataHas   = messageDataHas(m);

  const parts = [];
  parts.push('<article class="msg" data-has="' + dataHas + '">');
  parts.push('  <div class="msg-head">');
  if (avSrc) {
    parts.push('    <img class="av" src="' + escapeHtml(avSrc) + '" alt="">');
  } else {
    parts.push('    <div class="av av-blank"></div>');
  }
  parts.push('    <div class="meta">');
  parts.push('      <div class="who">' + escapeHtml(tag || '—') + '</div>');
  parts.push('      <div class="sub">ID ' + escapeHtml(id || '—') + '  ·  ' + escapeHtml(fmtDate(m.timestamp)) + '</div>');
  parts.push('    </div>');
  if (m.messageId && m.guildId && m.channelId) {
    const link = 'https://discord.com/channels/' + m.guildId + '/' + m.channelId + '/' + m.messageId;
    parts.push('    <a class="jump" href="' + escapeHtml(link) + '" target="_blank" rel="noreferrer">jump ↗</a>');
  }
  parts.push('  </div>');

  if (m.content && m.content.trim()) {
    parts.push('  <div class="body">' + escapeHtml(m.content) + '</div>');
  }

  if (m.files && m.files.length) {
    parts.push('  <div class="files">');
    for (const f of m.files) {
      const href = localFileToHref(f.localPath);
      const fname = (f.localPath || '').split(/[\\/]/).pop();
      if (isImage(f.localPath)) {
        parts.push('    <a class="thumb" href="' + escapeHtml(href) + '" target="_blank"><img src="' + escapeHtml(href) + '" loading="lazy" alt=""></a>');
      } else if (isVideo(f.localPath)) {
        parts.push('    <video class="vid" controls preload="metadata"><source src="' + escapeHtml(href) + '"></video>');
      } else if (isAudio(f.localPath)) {
        parts.push('    <audio controls preload="none" src="' + escapeHtml(href) + '"></audio>');
      } else {
        parts.push('    <a class="filechip" href="' + escapeHtml(href) + '" target="_blank">' + escapeHtml(fname) + '</a>');
      }
    }
    parts.push('  </div>');
  } else if (m.attachments && m.attachments.length) {
    parts.push('  <div class="files">');
    for (const url of m.attachments) {
      parts.push('    <a class="filechip ext" href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' + escapeHtml(url.split('/').pop().split('?')[0]) + '</a>');
    }
    parts.push('  </div>');
  }

  parts.push('</article>');
  return parts.join('\n');
}

function renderMentioners(mentioners, targetId) {
  if (!mentioners || !mentioners.length) return '';
  const rows = mentioners.map((u) => {
    const av = avatarUrl(u.id, u.avatar, null);
    return '<li><img src="' + escapeHtml(av) + '" alt=""><span class="t">' + escapeHtml(u.tag || u.id) + '</span><span class="n">' + u.count + '×</span></li>';
  }).join('');
  return '<aside class="rank"><h3>RANKED MENTIONERS</h3><ol>' + rows + '</ol></aside>';
}

function buildHTML(data, mode) {
  const isMentions = mode === 'mentions';
  const items      = isMentions ? data.mentions : data.messages;
  const grouped    = groupByServer(items || []);
  const targetAv   = data.targetAvatar
    ? avatarUrl(data.userId, data.targetAvatar, null)
    : avatarUrl(data.userId, null, null);

  const sectionParts = [];
  for (const server of Object.keys(grouped).sort()) {
    sectionParts.push('<section class="srv"><h2>' + escapeHtml(server) + '</h2>');
    for (const channel of Object.keys(grouped[server]).sort()) {
      const list = grouped[server][channel];
      sectionParts.push('<div class="chan"><div class="chan-head"><span class="ch">' + escapeHtml(channel) + '</span><span class="cn">' + list.length + ' ' + (isMentions ? 'mention' : 'message') + (list.length === 1 ? '' : 's') + '</span></div>');
      for (const m of list) {
        sectionParts.push(renderMessageCard(m, {
          mode,
          targetId:     data.userId,
          targetTag:    data.username,
          targetAvatar: data.targetAvatar,
        }));
      }
      sectionParts.push('</div>');
    }
    sectionParts.push('</section>');
  }

  const totalLine = isMentions
    ? (data.total + ' mentions  ·  ' + (data.mentioners ? data.mentioners.length : 0) + ' unique senders')
    : (data.total + ' messages  ·  ' + (items || []).reduce((n, m) => n + (m.files ? m.files.length : 0), 0) + ' files');

  const css = `
    :root{
      --bg:#0e1116; --panel:#141921; --panel-2:#1a2029;
      --line:#2a313c; --line-soft:#1f2530;
      --ink:#e6e8ec; --ink-soft:#a6acb8; --ink-mute:#6b7280;
      --target:#a78bfa; --link:#7dd3fc; --warn:#f59e0b;
      --mono:'JetBrains Mono','Menlo','Consolas','SF Mono',monospace;
    }
    *{box-sizing:border-box}
    html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13.5px;line-height:1.55}
    a{color:var(--link);text-decoration:none}
    a:hover{text-decoration:underline}

    .frame{max-width:1180px;margin:0 auto;padding:28px 24px 80px}

    .top{
      border:1px solid var(--line); background:var(--panel);
      padding:18px 22px; position:relative; margin-bottom:22px;
    }
    .top::before{content:'';position:absolute;left:-1px;top:-1px;width:14px;height:14px;border-top:1px solid var(--target);border-left:1px solid var(--target)}
    .top::after{content:'';position:absolute;right:-1px;bottom:-1px;width:14px;height:14px;border-bottom:1px solid var(--target);border-right:1px solid var(--target)}

    .stamp{font-size:10.5px;color:var(--ink-mute);letter-spacing:.22em;margin-bottom:10px}
    .stamp .sep{margin:0 10px;color:var(--line)}

    .target{display:flex;align-items:center;gap:16px}
    .target img{width:64px;height:64px;border-radius:2px;border:1px solid var(--line);background:var(--panel-2)}
    .target h1{margin:0 0 4px;font-size:20px;letter-spacing:.04em;color:var(--ink)}
    .target h1 .at{color:var(--target)}
    .target .id{font-size:12px;color:var(--ink-mute)}
    .target .id b{color:var(--ink-soft);font-weight:normal}

    .stats{display:flex;gap:0;border:1px solid var(--line);background:var(--panel);margin-bottom:22px}
    .stats div{flex:1;padding:12px 18px;border-right:1px solid var(--line)}
    .stats div:last-child{border-right:0}
    .stats .k{font-size:10.5px;color:var(--ink-mute);letter-spacing:.18em;text-transform:uppercase}
    .stats .v{font-size:16px;color:var(--ink);margin-top:2px}

    .layout{display:grid;grid-template-columns: 1fr; gap:22px}
    .layout.has-rank{grid-template-columns: 1fr 280px}

    .rank{border:1px solid var(--line);background:var(--panel);padding:14px 16px;align-self:start;position:sticky;top:20px}
    .rank h3{margin:0 0 10px;font-size:11px;color:var(--ink-mute);letter-spacing:.22em}
    .rank ol{list-style:none;padding:0;margin:0;counter-reset:rk}
    .rank li{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--line-soft);counter-increment:rk}
    .rank li:last-child{border-bottom:0}
    .rank li::before{content:counter(rk,decimal-leading-zero);color:var(--ink-mute);font-size:11px;width:22px}
    .rank li img{width:22px;height:22px;border-radius:50%;background:var(--panel-2)}
    .rank li .t{flex:1;font-size:12.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .rank li .n{color:var(--target);font-size:12px}

    .srv{margin-bottom:30px}
    .srv h2{
      margin:0 0 12px;font-size:11px;letter-spacing:.28em;color:var(--ink-mute);
      border-bottom:1px solid var(--line);padding-bottom:8px;text-transform:uppercase;
    }
    .chan{margin:0 0 18px;border-left:1px solid var(--line-soft);padding-left:14px}
    .chan-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
    .chan-head .ch{color:var(--ink-soft);font-size:13px}
    .chan-head .cn{color:var(--ink-mute);font-size:11px;letter-spacing:.12em}

    .msg{
      border:1px solid var(--line-soft); background:var(--panel);
      padding:12px 14px; margin:0 0 8px;
    }
    .msg-head{display:flex;align-items:center;gap:12px}
    .av{width:36px;height:36px;border-radius:50%;background:var(--panel-2);border:1px solid var(--line-soft);object-fit:cover}
    .av-blank{}
    .meta{flex:1;min-width:0}
    .who{color:var(--ink);font-size:13px}
    .sub{color:var(--ink-mute);font-size:11px;letter-spacing:.04em;margin-top:2px}
    .jump{font-size:11px;color:var(--ink-mute)}
    .jump:hover{color:var(--link)}

    .body{
      margin:8px 0 0;padding:8px 10px;background:var(--bg);
      border-left:2px solid var(--line);white-space:pre-wrap;word-wrap:break-word;
      color:var(--ink);font-size:13px;
    }

    .files{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .thumb img{max-height:180px;max-width:280px;border:1px solid var(--line-soft);border-radius:2px;display:block}
    .vid{max-width:360px;max-height:240px;border:1px solid var(--line-soft);background:#000}
    .filechip{
      display:inline-block;padding:6px 10px;border:1px solid var(--line);
      background:var(--panel-2);color:var(--ink-soft);font-size:11.5px;
    }
    .filechip.ext{border-style:dashed;color:var(--ink-mute)}
    .filechip:hover{color:var(--ink);border-color:var(--target);text-decoration:none}

    .filters{
      display:flex;flex-direction:column;gap:8px;
      border:1px solid var(--line);background:var(--panel);
      padding:12px 16px;margin-bottom:22px;
    }
    .filter-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .filter-row .label{font-size:10.5px;color:var(--ink-mute);letter-spacing:.18em;text-transform:uppercase;margin-right:6px;white-space:nowrap}
    .fbtn{
      padding:5px 13px;font-size:11.5px;font-family:var(--mono);
      border:1px solid var(--line);background:var(--panel-2);
      color:var(--ink-soft);cursor:pointer;letter-spacing:.04em;
      transition:border-color .15s,color .15s;
    }
    .fbtn:hover{border-color:var(--target);color:var(--ink)}
    .fbtn.active{border-color:var(--target);color:var(--target);background:var(--bg)}
    .sub-row{display:none;align-items:center;gap:6px;flex-wrap:wrap}
    .sub-row.visible{display:flex}
    .hidden{display:none!important}

    .foot{
      margin-top:40px;padding-top:14px;border-top:1px solid var(--line);
      color:var(--ink-mute);font-size:11px;letter-spacing:.16em;
      display:flex;justify-content:space-between;
    }
    .foot .nyx{color:var(--target)}
  `;

  const head = '<!doctype html><html><head><meta charset="utf-8"><title>case file — ' + escapeHtml(data.username || data.userId) + '</title><style>' + css + '</style></head><body>';

  const stamp = '<div class="stamp">CASE FILE<span class="sep">·</span>' + escapeHtml((data.mode || mode).toUpperCase()) + '<span class="sep">·</span>SCRAPED ' + escapeHtml(new Date().toISOString().slice(0, 19).replace('T', ' ')) + ' UTC</div>';

  const targetBlock = '<div class="target"><img src="' + escapeHtml(targetAv) + '" alt=""><div><h1><span class="at">▸</span> ' + escapeHtml(data.username || '—') + '</h1><div class="id"><b>ID</b> ' + escapeHtml(data.userId) + '</div></div></div>';

  const statsBlock = '<div class="stats"><div><div class="k">Operation</div><div class="v">' + escapeHtml(data.mode || mode) + '</div></div><div><div class="k">Volume</div><div class="v">' + escapeHtml(totalLine) + '</div></div><div><div class="k">Servers</div><div class="v">' + Object.keys(grouped).length + '</div></div></div>';

  const rank   = isMentions ? renderMentioners(data.mentioners, data.userId) : '';
  const layout = '<div class="layout' + (rank ? ' has-rank' : '') + '"><main id="main-feed">' + sectionParts.join('\n') + '</main>' + rank + '</div>';

  const filterBar = `
<div class="filters">
  <div class="filter-row">
    <span class="label">Filter</span>
    <button class="fbtn active" data-main="all">All</button>
    <button class="fbtn" data-main="messages">Messages</button>
    <button class="fbtn" data-main="files">Files</button>
  </div>
  <div class="sub-row" id="sub-row">
    <span class="label">Type</span>
    <button class="fbtn active" data-sub="all">All Files</button>
    <button class="fbtn" data-sub="image">Images</button>
    <button class="fbtn" data-sub="video">Videos</button>
    <button class="fbtn" data-sub="audio">Audio</button>
    <button class="fbtn" data-sub="other">Other</button>
  </div>
</div>
<script>
(function(){
  var main='all', sub='all';
  function applyFilter(){
    var cards=document.querySelectorAll('.msg');
    cards.forEach(function(c){
      var has=c.dataset.has?c.dataset.has.split(' '):[];
      var show=false;
      if(main==='all'){
        show=true;
      } else if(main==='messages'){
        show=has.indexOf('text')>-1;
      } else if(main==='files'){
        var fileTypes=['image','video','audio','other'];
        var hasFile=has.some(function(t){return fileTypes.indexOf(t)>-1;});
        if(sub==='all') show=hasFile;
        else show=has.indexOf(sub)>-1;
      }
      c.classList.toggle('hidden',!show);
    });
    document.querySelectorAll('.chan').forEach(function(ch){
      var vis=ch.querySelectorAll('.msg:not(.hidden)').length>0;
      ch.classList.toggle('hidden',!vis);
    });
    document.querySelectorAll('.srv').forEach(function(sv){
      var vis=sv.querySelectorAll('.chan:not(.hidden)').length>0;
      sv.classList.toggle('hidden',!vis);
    });
  }
  document.querySelectorAll('.fbtn[data-main]').forEach(function(btn){
    btn.addEventListener('click',function(){
      main=btn.dataset.main;
      document.querySelectorAll('.fbtn[data-main]').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      var subRow=document.getElementById('sub-row');
      if(main==='files') subRow.classList.add('visible');
      else subRow.classList.remove('visible');
      applyFilter();
    });
  });
  document.querySelectorAll('.fbtn[data-sub]').forEach(function(btn){
    btn.addEventListener('click',function(){
      sub=btn.dataset.sub;
      document.querySelectorAll('.fbtn[data-sub]').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      applyFilter();
    });
  });
})();
</script>`;

  const foot = '<div class="foot"><span>nyx · case archive</span><span class="nyx">(=^ ◕ω◕ ^=)</span></div>';

  return head + '<div class="frame">' + '<div class="top">' + stamp + targetBlock + '</div>' + statsBlock + filterBar + layout + foot + '</div></body></html>';
}

async function launchViewer(outDir, mode) {
  const dataFile = mode === 'mentions'
    ? path.join(outDir, 'mentions.json')
    : path.join(outDir, 'messages.json');

  if (!fs.existsSync(dataFile)) {
    throw new Error('no data file at ' + dataFile);
  }

  const data     = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const html     = buildHTML(data, mode);
  const filesDir = path.resolve(path.join(outDir, 'files'));

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);

    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (url.startsWith('/files/')) {
      const rel  = url.slice('/files/'.length);
      const full = path.resolve(path.join(filesDir, rel));
      if (!full.startsWith(filesDir)) { res.writeHead(403).end(); return; }
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404).end(); return; }
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
      return;
    }

    res.writeHead(404).end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ url: 'http://127.0.0.1:' + port + '/', server, port });
    });
  });
}

module.exports = { launchViewer, buildHTML };