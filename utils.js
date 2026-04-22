const { MODE_ALL, MODE_MESSAGES, MODE_FILES, MODE_MENTION, EXT_BUCKETS } = require('./constants');

function sanitizeName(str) {
  if (!str) return 'unknown';
  return str
    .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase()
    .slice(0, 64) || 'unknown';
}

function stripEmoji(str) {
  if (!str) return str;
  return str
    .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function modeLabel() {
  if (MODE_ALL)      return 'all';
  if (MODE_MESSAGES) return 'messages only';
  if (MODE_FILES)    return 'files only';
  if (MODE_MENTION)  return 'mentions only';
  return 'all';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function classifyFile(filePath) {
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  for (const [bucket, exts] of Object.entries(EXT_BUCKETS)) {
    if (exts.includes(ext)) return bucket;
  }
  return 'other';
}

function countFileTypes(files) {
  const counts = { img: 0, gif: 0, vid: 0, audio: 0, doc: 0, other: 0 };
  for (const f of files) counts[classifyFile(f.localPath || f.originalUrl || '')]++;
  return counts;
}

function fileTypeSummaryStr(counts) {
  const labels = { img: 'img', gif: 'gif', vid: 'vid', audio: 'audio', doc: 'doc', other: 'other' };
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => v + ' ' + labels[k])
    .join('  ');
}

function formatUserTag(user) {
  if (!user || !user.username) return null;
  return user.discriminator && user.discriminator !== '0'
    ? user.username + '#' + user.discriminator
    : user.username;
}

function extractUsernameFromMessage(msg) {
  if (!msg || !msg.author || !msg.author.username) return null;
  return msg.author.discriminator && msg.author.discriminator !== '0'
    ? msg.author.username + '#' + msg.author.discriminator
    : msg.author.username;
}

function extractFileUrls(msg) {
  const urls = [];
  for (const a of msg.attachments || [])
    urls.push({ url: a.url, type: 'attachment', name: a.filename });
  for (const e of msg.embeds || []) {
    if (e.image && e.image.url)         urls.push({ url: e.image.url,     type: 'embed_image',     name: null });
    if (e.thumbnail && e.thumbnail.url) urls.push({ url: e.thumbnail.url, type: 'embed_thumbnail', name: null });
    if (e.video && e.video.url)         urls.push({ url: e.video.url,     type: 'embed_video',     name: null });
  }
  return urls;
}

function generateMessageLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

module.exports = {
  sanitizeName,
  stripEmoji,
  modeLabel,
  pad2,
  classifyFile,
  countFileTypes,
  fileTypeSummaryStr,
  formatUserTag,
  extractUsernameFromMessage,
  extractFileUrls,
  generateMessageLink,
};