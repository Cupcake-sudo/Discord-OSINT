const { TARGET_USER_ID, HAS_FILTERS, PAGE_SIZE, SEARCH_DELAY_MS, DOWNLOAD_FILES, SAVE_MESSAGES } = require('./constants');
const { statusSet, statusLog, delay } = require('./terminal');
const { discordAPI } = require('./api');
const { downloadFile } = require('./fileHandler');
const { stripEmoji, formatUserTag, extractUsernameFromMessage, extractFileUrls } = require('./utils');

function setCatMood(mood) { require('./terminal').setCatMood(mood); }

async function searchGuildForMentions(guildId, guildName, onTargetResolved, onProgress) {
  let targetResolved = false;
  const collected    = [];
  let offset         = 0;
  let total          = null;

  setCatMood('hunting');

  while (true) {
    statusSet(total !== null
      ? 'ears up, scanning every ping... [' + offset + ' / ' + total + ']'
      : 'perking ears... sniffing for mentions...'
    );

    const data = await discordAPI(
      '/guilds/' + guildId + '/messages/search' +
      '?mentions=' + TARGET_USER_ID +
      '&sort_by=timestamp&sort_order=desc' +
      '&offset=' + offset + '&limit=' + PAGE_SIZE
    );

    if (!data || data.code) {
      statusLog('  ✗  no search access: ' + (data && data.message ? data.message : 'unknown error'));
      break;
    }

    if (total === null) {
      total = data.total_results || 0;
      if (total === 0) break;
    }

    const messages = (data.messages || []).map((g) => g[0]).filter(Boolean);

    for (const msg of messages) {
      const senderTag      = formatUserTag(msg.author);
      const mentionedUsers = (msg.mentions || [])
        .filter((u) => u.id === TARGET_USER_ID)
        .map((u) => {
          if (!targetResolved) {
            const tag = formatUserTag(u);
            if (tag) { onTargetResolved(tag); targetResolved = true; }
          }
          return { id: u.id, tag: formatUserTag(u) };
        });

      collected.push({
        messageId:     msg.id,
        channelId:     msg.channel_id,
        channelName:   stripEmoji(msg.channel && msg.channel.name ? msg.channel.name : null),
        guildId,
        guildName:     stripEmoji(guildName),
        senderId:      msg.author && msg.author.id ? msg.author.id : null,
        senderTag,
        timestamp:     msg.timestamp,
        content:       msg.content,
        mentionedUsers,
      });
    }

    offset += messages.length;
    if (onProgress) onProgress(collected.length);
    if (offset >= total || messages.length === 0) break;

    setCatMood('sleepy');
    statusSet('taking a tiny nap before the next page... [' + offset + ' / ' + total + ']');
    await delay(SEARCH_DELAY_MS);
    setCatMood('hunting');
  }

  return collected;
}

async function searchGuildForFiles(guildId, guildName, filesDir, onFirstAuthor, onProgress) {
  const collected = [];
  const seenIds   = new Set();
  let authorSent  = false;
  const hasParams = HAS_FILTERS.map((f) => 'has=' + f).join('&');
  let offset      = 0;
  let total       = null;

  setCatMood('hunting');

  while (true) {
    statusSet(total !== null
      ? 'dragging files back to the den... [' + offset + ' / ' + total + ']'
      : 'nose to the ground, sniffing for files...'
    );

    const data = await discordAPI(
      '/guilds/' + guildId + '/messages/search' +
      '?author_id=' + TARGET_USER_ID +
      '&' + hasParams +
      '&sort_by=timestamp&sort_order=desc' +
      '&offset=' + offset + '&limit=' + PAGE_SIZE
    );

    if (!data || data.code) {
      statusLog('  ✗  no search access: ' + (data && data.message ? data.message : 'unknown error'));
      break;
    }

    if (total === null) {
      total = data.total_results || 0;
      if (total === 0) break;
    }

    const messages = (data.messages || []).map((g) => g[0]).filter(Boolean);

    for (const msg of messages) {
      if (seenIds.has(msg.id)) continue;
      seenIds.add(msg.id);

      if (!authorSent && msg.author && msg.author.id === TARGET_USER_ID) {
        const name = extractUsernameFromMessage(msg);
        if (name) { onFirstAuthor(name); authorSent = true; }
      }

      const fileUrls   = extractFileUrls(msg);
      const localFiles = [];

      if (fileUrls.length > 0) {
        setCatMood('eating');
        statusSet('chomping through ' + fileUrls.length + ' file(s)...');
        for (const f of fileUrls) {
          const messageContext = {
            guildId: guildId,
            channelId: msg.channel_id,
            messageId: msg.id
          };
          const localPath = await downloadFile(f.url, filesDir, messageContext);
          if (localPath) {
            localFiles.push({ 
              localPath, 
              type: f.type, 
              originalUrl: f.url,
              guildId: guildId,
              channelId: msg.channel_id,
              messageId: msg.id
            });
          }
        }
        setCatMood('hunting');
      }

      collected.push({ 
        messageId: msg.id, 
        timestamp: msg.timestamp, 
        guildId: guildId,
        channelId: msg.channel_id,
        files: localFiles 
      });
    }

    offset += messages.length;
    const totalFiles = collected.reduce((n, m) => n + m.files.length, 0);
    if (onProgress) onProgress(totalFiles);
    if (offset >= total || messages.length === 0) break;

    setCatMood('sleepy');
    statusSet('tiny nap... [' + offset + ' / ' + total + ']');
    await delay(SEARCH_DELAY_MS);
    setCatMood('hunting');
  }

  return collected;
}

async function searchGuildForUser(guildId, guildName, filesDir, onFirstAuthor, onProgress) {
  const collected = [];
  let offset      = 0;
  let total       = null;
  let authorSent  = false;

  setCatMood('hunting');

  while (true) {
    statusSet(total !== null
      ? 'sifting through messages... [' + offset + ' / ' + total + ']'
      : 'ears perked, picking up the scent...'
    );

    const data = await discordAPI(
      '/guilds/' + guildId + '/messages/search?author_id=' + TARGET_USER_ID +
      '&offset=' + offset + '&limit=' + PAGE_SIZE
    );

    if (!data || data.code) {
      statusLog('  ✗  no search access: ' + (data && data.message ? data.message : 'unknown error'));
      break;
    }

    if (total === null) {
      total = data.total_results || 0;
      if (total === 0) break;
    }

    const messages = (data.messages || []).map((g) => g[0]).filter(Boolean);

    for (const msg of messages) {
      if (!authorSent && msg.author && msg.author.id === TARGET_USER_ID) {
        const name = extractUsernameFromMessage(msg);
        if (name) { onFirstAuthor(name); authorSent = true; }
      }

      const fileUrls   = extractFileUrls(msg);
      const localFiles = [];

      if (DOWNLOAD_FILES && fileUrls.length > 0) {
        setCatMood('eating');
        statusSet('nomming ' + fileUrls.length + ' file(s)...');
        for (const f of fileUrls) {
          const messageContext = {
            guildId: guildId,
            channelId: msg.channel_id,
            messageId: msg.id
          };
          const localPath = await downloadFile(f.url, filesDir, messageContext);
          if (localPath) {
            localFiles.push({ 
              localPath, 
              type: f.type, 
              originalUrl: f.url,
              guildId: guildId,
              channelId: msg.channel_id,
              messageId: msg.id
            });
          }
        }
        setCatMood('hunting');
      }

      if (SAVE_MESSAGES) {
        collected.push({
          messageId:   msg.id,
          channelId:   msg.channel_id,
          channelName: stripEmoji(msg.channel && msg.channel.name ? msg.channel.name : null),
          guildId,
          guildName:   stripEmoji(guildName),
          authorId:    msg.author && msg.author.id ? msg.author.id : null,
          authorTag:   extractUsernameFromMessage(msg),
          timestamp:   msg.timestamp,
          content:     msg.content,
          attachments: (msg.attachments || []).map((a) => a.url),
          embeds:      msg.embeds || [],
          files:       localFiles,
          type:        msg.type,
        });
      } else if (localFiles.length > 0) {
        collected.push({ 
          messageId: msg.id, 
          timestamp: msg.timestamp, 
          guildId: guildId,
          channelId: msg.channel_id,
          files: localFiles 
        });
      }
    }

    offset += messages.length;
    if (onProgress) onProgress(collected.length);
    if (offset >= total || messages.length === 0) break;

    setCatMood('sleepy');
    statusSet('curling up briefly between pages... [' + offset + ' / ' + total + ']');
    await delay(SEARCH_DELAY_MS);
    setCatMood('hunting');
  }

  return collected;
}

module.exports = { searchGuildForMentions, searchGuildForFiles, searchGuildForUser };