const fs   = require('fs');
const path = require('path');
const { TARGET_USER_ID, DOWNLOAD_FILES, SAVE_MESSAGES } = require('./constants');
const { modeLabel, stripEmoji, countFileTypes, fileTypeSummaryStr, generateMessageLink } = require('./utils');

function writeMentionsOutput(outDir, { finalUsername, targetAvatar, allMentions, serversWithMsgs, totalMentions }) {
  const mentionerMap = {};
  for (const m of allMentions) {
    if (!m.senderId) continue;
    if (!mentionerMap[m.senderId]) {
      mentionerMap[m.senderId] = {
        id:     m.senderId,
        tag:    m.senderTag,
        avatar: m.senderAvatar || null,
        count:  0,
        messages: [],
      };
    }
    mentionerMap[m.senderId].count++;
    mentionerMap[m.senderId].messages.push(m);
  }

  const mentioners = Object.values(mentionerMap).sort((a, b) => b.count - a.count);

  fs.writeFileSync(path.join(outDir, 'mentions.json'), JSON.stringify({
    userId:       TARGET_USER_ID,
    username:     finalUsername,
    targetAvatar: targetAvatar || null,
    mode:         modeLabel(),
    total:        totalMentions,
    mentioners,
    mentions:     allMentions,
  }, null, 2));

  let txt = 'DISCORD OSINT — MENTIONS\n' + '═'.repeat(64) + '\n\n';
  txt += '  Target     : ' + finalUsername + ' (' + TARGET_USER_ID + ')\n';
  txt += '  Mode       : ' + modeLabel() + '\n';
  txt += '  Scraped    : ' + new Date().toISOString() + '\n';
  txt += '  Total pings: ' + totalMentions + '\n\n';
  txt += '═'.repeat(64) + '\n\n';
  txt += '  WHO MENTIONED THIS USER\n  ' + '─'.repeat(60) + '\n\n';

  if (mentioners.length === 0) {
    txt += '  (none found)\n\n';
  } else {
    const mml = Math.max(...mentioners.map((u) => (u.tag || u.id).length), 6);
    for (const u of mentioners) txt += '  ' + (u.tag || u.id).padEnd(mml + 2) + '  ID: ' + u.id + '  ·  ' + u.count + ' mention(s)\n';
  }
  txt += '\n' + '═'.repeat(64) + '\n\n';

  const byServer = {};
  for (const m of allMentions) {
    const sk = stripEmoji(m.guildName) || m.guildId;
    const ck = m.channelName ? '#' + m.channelName : '#unknown-channel';
    if (!byServer[sk]) byServer[sk] = {};
    if (!byServer[sk][ck]) byServer[sk][ck] = [];
    byServer[sk][ck].push(m);
  }

  for (const [server, channels] of Object.entries(byServer)) {
    txt += '  SERVER: ' + server + '\n  ' + '─'.repeat(60) + '\n\n';
    for (const [channel, msgs] of Object.entries(channels)) {
      txt += '    ' + channel + '  ·  ' + msgs.length + ' mention(s)\n    ' + '·'.repeat(56) + '\n\n';
      for (const m of [...msgs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) {
        txt += '      [' + new Date(m.timestamp).toLocaleString() + ']  from: ' + (m.senderTag || m.senderId) + ' (' + m.senderId + ')\n';
        if (m.content) txt += '      ' + m.content + '\n';
        txt += '\n';
      }
    }
    txt += '\n';
  }

  const ml = Math.max(...(serversWithMsgs.length ? serversWithMsgs.map((s) => s.server.length) : [5]), 5);
  txt += '═'.repeat(64) + '\n  SUMMARY\n' + '═'.repeat(64) + '\n\n';
  for (const s of serversWithMsgs) txt += '  ' + s.server.padEnd(ml + 2) + '  ' + String(s.mentions).padStart(5) + ' mention(s)\n';
  txt += '\n  ' + '─'.repeat(62) + '\n';
  txt += '  ' + 'TOTAL'.padEnd(ml + 2) + '  ' + String(totalMentions).padStart(5) + ' mention(s)\n';

  fs.writeFileSync(path.join(outDir, 'mentions.txt'), txt);

  return mentioners;
}

function writeMessagesOutput(outDir, filesDir, { finalUsername, targetAvatar, allMessages, serversWithMsgs, totalFiles }) {
  fs.writeFileSync(path.join(outDir, 'messages.json'), JSON.stringify({
    userId:       TARGET_USER_ID,
    username:     finalUsername,
    targetAvatar: targetAvatar || null,
    mode:         modeLabel(),
    total:        allMessages.length,
    messages:     allMessages,
  }, null, 2));

  let txt = 'DISCORD OSINT\n' + '═'.repeat(64) + '\n\n';
  txt += '  User       : ' + finalUsername + ' (' + TARGET_USER_ID + ')\n';
  txt += '  Mode       : ' + modeLabel() + '\n';
  txt += '  Scraped    : ' + new Date().toISOString() + '\n';
  txt += '  Total msgs : ' + allMessages.length + '\n';
  txt += '  Total files: ' + totalFiles + '\n\n';
  txt += '═'.repeat(64) + '\n\n';

  const byServer = {};
  for (const m of allMessages) {
    const sk = stripEmoji(m.guildName) || m.guildId;
    const ck = m.channelName ? '#' + m.channelName : '#unknown-channel';
    if (!byServer[sk]) byServer[sk] = {};
    if (!byServer[sk][ck]) byServer[sk][ck] = [];
    byServer[sk][ck].push(m);
  }

  for (const [server, channels] of Object.entries(byServer)) {
    txt += '  SERVER: ' + server + '\n  ' + '─'.repeat(60) + '\n\n';
    for (const [channel, msgs] of Object.entries(channels)) {
      const fileCount = msgs.reduce((n, m) => n + (m.files ? m.files.length : 0), 0);
      txt += '    ' + channel + '  ·  ' + msgs.length + ' message(s)  ·  ' + fileCount + ' file(s)\n    ' + '·'.repeat(56) + '\n\n';
      for (const m of [...msgs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) {
        txt += '      [' + new Date(m.timestamp).toLocaleString() + ']\n';
        if (m.content) txt += '      ' + m.content + '\n';
        if (m.attachments && m.attachments.length) {
          txt += '\n      ATTACHMENTS\n';
          for (const url of m.attachments) txt += '        ' + url + '\n';
        }
        if (m.files && m.files.length) {
          txt += '\n      SAVED FILES\n';
          for (const f of m.files) {
            const messageLink = generateMessageLink(f.guildId || m.guildId, f.channelId || m.channelId, f.messageId || m.messageId);
            txt += '        [' + f.type + ']  ' + f.localPath + '\n';
            txt += '        Message: ' + messageLink + '\n';
          }
        }
        txt += '\n';
      }
    }
    txt += '\n';
  }

  const maxLen     = Math.max(...serversWithMsgs.map((s) => s.server.length), 6);
  const grandTypes = countFileTypes(allMessages.flatMap((m) => m.files || []));
  const grandLine  = DOWNLOAD_FILES && totalFiles > 0 ? '  [ ' + fileTypeSummaryStr(grandTypes) + ' ]' : '';

  txt += '═'.repeat(64) + '\n  SUMMARY\n' + '═'.repeat(64) + '\n\n';
  for (const s of serversWithMsgs) {
    const tl = DOWNLOAD_FILES && s.files.length > 0 ? '  [ ' + fileTypeSummaryStr(countFileTypes(s.files)) + ' ]' : '';
    txt += '  ' + s.server.padEnd(maxLen + 2) + '  ' + String(s.count).padStart(5) + ' msg(s)  ' + String(s.files.length).padStart(4) + ' file(s)' + tl + '\n';
  }
  txt += '\n  ' + '─'.repeat(62) + '\n';
  txt += '  ' + 'TOTAL'.padEnd(maxLen + 2) + '  ' + String(allMessages.length).padStart(5) + ' msg(s)  ' + String(totalFiles).padStart(4) + ' file(s)' + grandLine + '\n';
  if (DOWNLOAD_FILES) txt += '\n  Output directory: ./' + filesDir + '/\n';

  fs.writeFileSync(path.join(outDir, 'messages.txt'), txt);
}

function buildMessageRows(allMessages, serversWithMsgs, totalFiles, elapsed) {
  const rows = [];
  if (serversWithMsgs.length > 0) {
    const maxLen = Math.max(...serversWithMsgs.map((s) => s.server.length), 6);
    rows.push('  Files');
    for (const s of serversWithMsgs) {
      const typePart = DOWNLOAD_FILES && s.files.length > 0 ? '  ' + fileTypeSummaryStr(countFileTypes(s.files)) : '';
      const fPart    = DOWNLOAD_FILES ? '  ' + String(s.files.length).padStart(3) + ' file(s)' + typePart : '';
      rows.push('  ' + s.server.padEnd(maxLen + 2) + '  ' + String(s.count).padStart(4) + ' msg(s)' + fPart);
    }
    const grandTypes = countFileTypes(allMessages.flatMap((m) => m.files || []));
    const totalFType = DOWNLOAD_FILES && totalFiles > 0 ? '  ' + fileTypeSummaryStr(grandTypes) : '';
    const totalFPart = DOWNLOAD_FILES ? '  ' + String(totalFiles).padStart(3) + ' file(s)' + totalFType : '';
    rows.push('  ' + 'Total'.padEnd(maxLen + 2) + '  ' + String(allMessages.length).padStart(4) + ' msg(s)' + totalFPart);
  } else {
    rows.push('  No messages found.');
  }
  if (elapsed) rows.push('  Got ' + allMessages.length + ' message(s) in ' + elapsed);
  return rows;
}

function buildFilesOnlyRows(summary, totalFiles, elapsed) {
  const serversWithFiles = summary.filter((s) => s.files.length > 0);
  const rows = [];
  if (serversWithFiles.length > 0) {
    const maxLen = Math.max(...serversWithFiles.map((s) => s.server.length), 6);
    rows.push('  Files');
    for (const s of serversWithFiles) {
      const typePart = s.files.length > 0 ? '  ' + fileTypeSummaryStr(countFileTypes(s.files)) : '';
      rows.push('  ' + s.server.padEnd(maxLen + 2) + '  ' + String(s.files.length).padStart(4) + ' file(s)' + typePart);
    }
    const grandTypes    = countFileTypes(summary.flatMap((s) => s.files));
    const totalTypePart = totalFiles > 0 ? '  ' + fileTypeSummaryStr(grandTypes) : '';
    rows.push('  ' + 'Total'.padEnd(maxLen + 2) + '  ' + String(totalFiles).padStart(4) + ' file(s)' + totalTypePart);
  } else {
    rows.push('  No files found.');
  }
  if (elapsed) rows.push('  Got ' + totalFiles + ' file(s) in ' + elapsed);
  return rows;
}

function buildMentionRows(mentioners, serversWithMsgs, totalMentions, elapsed) {
  const top  = mentioners.slice(0, 5);
  const rows = [];
  if (top.length > 0) {
    const mml = Math.max(...top.map((u) => (u.tag || u.id).length), 6);
    rows.push('  Most Mentions');
    for (const u of top) rows.push('  ' + (u.tag || u.id).padEnd(mml + 2) + '  ' + String(u.count).padStart(4) + '×');
    rows.push('  Total  ' + String(totalMentions).padStart(4) + ' ping(s) across ' + serversWithMsgs.length + ' server(s)');
  } else {
    rows.push('  No mentions found.');
  }
  if (elapsed) rows.push('  Got ' + totalMentions + ' mention(s) in ' + elapsed);
  return rows;
}

module.exports = {
  writeMentionsOutput,
  writeMessagesOutput,
  buildMessageRows,
  buildFilesOnlyRows,
  buildMentionRows,
};