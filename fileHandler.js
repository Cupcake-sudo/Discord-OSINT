const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

async function downloadFile(url, destDir, messageContext) {
  try {
    const urlObj = new URL(url);
    
    // Get file extension from URL
    const urlPath = urlObj.pathname;
    const extMatch = urlPath.match(/\.([^.]+)$/);
    const ext = extMatch ? extMatch[1] : 'unknown';
    
    // Create filename from Discord message link
    let filename;
    if (messageContext && messageContext.guildId && messageContext.channelId && messageContext.messageId) {
      const { guildId, channelId, messageId } = messageContext;
      // Make filename look like the Discord URL but with safe characters
      // https://discord.com/channels/123/456/789.png becomes:
      // https__discord.com_channels_123_456_789.png
      const discordUrl = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
      const safeFilename = discordUrl.replace(/:/g, '').replace(/\//g, '_');
      filename = `${safeFilename}.${ext}`;
    } else {
      filename = path.basename(urlPath).replace(/[^a-zA-Z0-9._-]/g, '_') || ('file_' + Date.now() + '.' + ext);
    }
    
    // Determine file category
    const category = classifyFileByExtension(ext);
    
    // Create category subdirectory
    const categoryDir = path.join(destDir, category);
    ensureDir(categoryDir);
    
    const destPath = path.join(categoryDir, filename);
    if (fs.existsSync(destPath)) return destPath;
    
    const res = await fetch(url, { timeout: 30000 });
    if (!res.ok) return null;
    const buf = await Promise.race([
      res.buffer(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('body timeout')), 30000)),
    ]);
    fs.writeFileSync(destPath, buf);
    return destPath;
  } catch {
    return null;
  }
}

function classifyFileByExtension(ext) {
  const extLower = ext.toLowerCase();
  const categories = {
    images: ['jpg','jpeg','png','webp','heic','heif','bmp','tiff','tif','avif'],
    gifs: ['gif'],
    videos: ['mp4','mov','avi','mkv','webm','m4v','wmv','flv','3gp'],
    audio: ['mp3','ogg','wav','m4a','flac','aac','opus'],
    documents: ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip','rar','7z'],
  };
  
  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(extLower)) return category;
  }
  return 'other';
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function moveTmpFiles(tmpDir, filesDir) {
  ensureDir(filesDir);
  for (const entry of fs.readdirSync(tmpDir)) {
    const src = path.join(tmpDir, entry);
    const dst = path.join(filesDir, entry);
    if (fs.statSync(src).isDirectory()) {
      ensureDir(dst);
      for (const file of fs.readdirSync(src)) {
        const fileSrc = path.join(src, file);
        const fileDst = path.join(dst, file);
        if (!fs.existsSync(fileDst)) fs.renameSync(fileSrc, fileDst);
      }
      fs.rmSync(src, { recursive: true, force: true });
    } else {
      if (!fs.existsSync(dst)) fs.renameSync(src, dst);
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

module.exports = { downloadFile, ensureDir, moveTmpFiles };