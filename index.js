async function main() {
  const term         = require('./terminal');
  const { loadEnv }  = require('./env');
  const { setToken, discordAPI } = require('./api');

  term.clearScreen();
  term.statusSet('warming up...');
  await term.delay(500);
  await term.printBanner();

  const env = loadEnv();
  let token;
  if (env.Token && env.Token.length) {
    token = env.Token.trim();
    setToken(token);
    
    term.statusSet('checking token...');
    const me = await discordAPI('/users/@me');
    if (me && me.username && !me.code) {
      const myTag = me.global_name || (me.discriminator && me.discriminator !== '0'
        ? me.username + '#' + me.discriminator
        : me.username);
      term.statusLog('  ✓  logged in as ' + myTag);
    } else {
      term.statusLog('  ✓  token loaded');
    }
  } else {
    token = await term.promptToken();
    term.statusLog('');
  }

  const userId = await term.promptUserId();
  term.statusLog('  ✓  target locked: ' + userId);

  const op = await term.promptMenu();

  let heatmap = false;
  if (op !== 'mentions') {
    heatmap = await term.promptYesNo('  » Heatmap?      [y/n] : ');
  }
  const wantViewer = await term.promptYesNo('  » Browser view? [y/n] : ');
  term.statusLog('');

  const constants = require('./constants');
  constants.configure({
    TARGET_USER_ID: userId,
    MODE_ALL:       op === 'all',
    MODE_MESSAGES:  op === 'messages',
    MODE_FILES:     op === 'files',
    MODE_MENTION:   op === 'mentions',
    MODE_HEATMAP:   heatmap,
  });

  const fs   = require('fs');
  const path = require('path');
  const { sanitizeName, stripEmoji }                        = require('./utils');
  const { resolveProfile }                                  = require('./api');
  const { printAndSaveHeatmap }                             = require('./heatmap');
  const { ensureDir, moveTmpFiles }                         = require('./fileHandler');
  const { searchGuildForMentions, searchGuildForFiles, searchGuildForUser } = require('./search');
  const {
    writeMentionsOutput, writeMessagesOutput,
    buildMessageRows, buildFilesOnlyRows, buildMentionRows,
  } = require('./output');
  const {
    TARGET_USER_ID, MODE_ALL, MODE_MESSAGES, MODE_FILES, MODE_MENTION,
    MODE_HEATMAP, DOWNLOAD_FILES, SAVE_MESSAGES, FILES_ONLY_MODE,
    MENTION_ONLY_MODE, SEARCH_DELAY_MS,
  } = constants;

  term.setCatMood('hunting');

  term.statusSet('fetching your server list...');
  const guilds = await discordAPI('/users/@me/guilds');

  if (!Array.isArray(guilds)) {
    term.stopHeader();
    console.error('\n  ✗  nyx could not fetch servers — that token smells wrong.\n');
    process.exit(1);
  }

  term.statusLog('  ✓  ' + guilds.length + ' server(s) found — ready to pounce');

  term.statusSet('picking up the scent...');
  const profile         = await resolveProfile(TARGET_USER_ID);
  let resolvedUsername  = profile ? profile.tag : null;
  let resolvedAvatar    = profile ? profile.avatar : null;
  await term.delay(1500);

  if (resolvedUsername) term.statusLog('  ✓  target identified:  ' + resolvedUsername);

  const tmpDir = '_tmp_' + TARGET_USER_ID;
  if (DOWNLOAD_FILES && !MENTION_ONLY_MODE && !fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  const allMessages = [];
  const allMentions = [];
  const summary     = [];

  function modeDisplay() {
    if (MODE_ALL)      return 'All' + (MODE_HEATMAP ? ' + Heatmap' : '');
    if (MODE_MESSAGES) return 'Messages' + (MODE_HEATMAP ? ' + Heatmap' : '');
    if (MODE_FILES)    return 'Files' + (MODE_HEATMAP ? ' + Heatmap' : '');
    if (MODE_MENTION)  return 'Mentions';
    return 'All' + (MODE_HEATMAP ? ' + Heatmap' : '');
  }

  function unitFor() {
    if (MODE_MENTION)    return 'mentions';
    if (FILES_ONLY_MODE) return 'files';
    return 'msgs';
  }

  const mode = modeDisplay();
  const unit = unitFor();

  term.statusLog('');

  const startTime = Date.now();

  for (const guild of guilds) {
    const name = stripEmoji(guild.name) || guild.id;
    term.serverLogStart(mode, name, unit);

    if (MENTION_ONLY_MODE) {
      const mentions = await searchGuildForMentions(guild.id, guild.name, (username) => {
        if (!resolvedUsername) {
          resolvedUsername = username;
          term.statusLog('  ✓  target identified: ' + resolvedUsername);
        }
      }, (count) => term.serverLogUpdate(count));
      allMentions.push(...mentions);
      summary.push({ server: name, count: mentions.length, files: [], mentions: mentions.length });
      term.serverLogUpdate(mentions.length);
    } else {
      let msgs;
      if (FILES_ONLY_MODE) {
        msgs = await searchGuildForFiles(guild.id, guild.name, tmpDir, (username) => {
          if (!resolvedUsername) {
            resolvedUsername = username;
            term.statusLog('  ✓  target identified: ' + resolvedUsername);
          }
        }, (count) => term.serverLogUpdate(count));
      } else {
        msgs = await searchGuildForUser(guild.id, guild.name, tmpDir, (username) => {
          if (!resolvedUsername) {
            resolvedUsername = username;
            term.statusLog('  ✓  target identified: ' + resolvedUsername);
          }
        }, (count) => term.serverLogUpdate(count));
      }
      const allFiles = msgs.flatMap((m) => m.files || []);
      allMessages.push(...msgs);
      summary.push({ server: name, count: msgs.length, files: allFiles, mentions: 0 });
      term.serverLogUpdate(FILES_ONLY_MODE ? allFiles.length : msgs.length);
    }

    term.serverLogDone();
    term.statusSet('padding softly to the next server...');
    await term.delay(SEARCH_DELAY_MS);
  }

  const elapsed = formatElapsed(Date.now() - startTime);

  const finalUsername = resolvedUsername || TARGET_USER_ID;
  const safeUser      = sanitizeName(finalUsername.split('#')[0]);

  const modePrefix = MODE_ALL      ? 'Everything'
                   : MODE_MESSAGES ? 'Messages'
                   : MODE_FILES    ? 'Files'
                   : MODE_MENTION  ? 'Mentions'
                   : 'Everything';

  const outDir   = modePrefix + '_' + safeUser;
  const filesDir = path.join(outDir, 'files');

  ensureDir(outDir);
  if (DOWNLOAD_FILES) ensureDir(filesDir);

  if (DOWNLOAD_FILES && !MENTION_ONLY_MODE && fs.existsSync(tmpDir)) {
    moveTmpFiles(tmpDir, filesDir);
    for (const m of allMessages)
      for (const f of m.files || []) f.localPath = f.localPath.replace(tmpDir, filesDir);
  }

  term.statusSet('tidying up the den...');

  const totalFiles      = allMessages.reduce((n, m) => n + (m.files ? m.files.length : 0), 0);
  const totalMentions   = allMentions.length;
  const serversWithMsgs = summary.filter((s) => s.count > 0);

  let viewerMode = null;

  if (MENTION_ONLY_MODE) {
    const mentioners = writeMentionsOutput(outDir, {
      finalUsername, targetAvatar: resolvedAvatar, allMentions, serversWithMsgs, totalMentions,
    });
    const rows = buildMentionRows(mentioners, serversWithMsgs, totalMentions, elapsed);
    term.setCatMood('happy');
    term.stopHeader();
    await term.printResults(rows, './' + outDir + '/');
    viewerMode = 'mentions';
  } else if (SAVE_MESSAGES) {
    writeMessagesOutput(outDir, filesDir, {
      finalUsername, targetAvatar: resolvedAvatar, allMessages, serversWithMsgs, totalFiles,
    });
    const rows = buildMessageRows(allMessages, serversWithMsgs, totalFiles, elapsed);
    term.setCatMood('happy');
    term.stopHeader();
    await term.printResults(rows, './' + outDir + '/');
    viewerMode = 'messages';
  } else {
    const rows = buildFilesOnlyRows(summary, totalFiles, elapsed);
    term.setCatMood('happy');
    term.stopHeader();
    await term.printResults(rows, './' + outDir + '/');
  }

  if (MODE_HEATMAP && allMessages.length > 0) {
    await printAndSaveHeatmap(allMessages, outDir, finalUsername);
    await term.catTypeLine('  ✓  heatmap.txt saved', { charDelay: 14 });
  }

  if (wantViewer && viewerMode) {
    try {
      const { launchViewer } = require('./viewer');
      const v = await launchViewer(outDir, viewerMode);
      await term.catTypeLine('  ✓  viewer  →  ' + v.url, { charDelay: 14 });
      await term.catTypeLine('     ctrl+c to stop', { charDelay: 14 });
      term.finalizeOutput();
      return;
    } catch (e) {
      await term.catTypeLine('  ✗  viewer error: ' + e.message, { charDelay: 14 });
    }
  }

  term.finalizeOutput();
}

function formatElapsed(ms) {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return totalSeconds.toFixed(1) + 's';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(0).padStart(2, '0');
  return minutes + 'm ' + seconds + 's';
}

main().catch((err) => {
  try { require('./terminal').stopHeader(); } catch {}
  console.error('\n  ✗  fatal error: ' + err.message);
  process.exit(1);
});