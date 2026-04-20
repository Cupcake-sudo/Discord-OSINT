
<const fs   = require('fs');
const path = require('path');

const {
  TARGET_USER_ID, MODE_ALL, MODE_MESSAGES, MODE_FILES, MODE_MENTION,
  MODE_HEATMAP, DOWNLOAD_FILES, SAVE_MESSAGES, FILES_ONLY_MODE,
  MENTION_ONLY_MODE, SEARCH_DELAY_MS,
} = require('./constants');

const {
  clearScreen, statusSet, statusLog, stopHeader, finalizeOutput,
  printBanner, promptToken, printResults, catTypeLine, setCatMood, delay,
} = require('./terminal');

const { sanitizeName, modeLabel, stripEmoji } = require('./utils');
const { discordAPI, tryResolveFromAPI, setToken } = require('./api');
const { printAndSaveHeatmap } = require('./heatmap');
const { ensureDir, moveTmpFiles } = require('./fileHandler');
const { searchGuildForMentions, searchGuildForFiles, searchGuildForUser } = require('./search');
const {
  writeMentionsOutput, writeMessagesOutput,
  buildMessageRows, buildFilesOnlyRows, buildMentionRows,
} = require('./output');

function formatElapsed(ms) {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(1) + 's';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(0).padStart(2, '0');
  return minutes + 'm ' + seconds + 's';
}

async function main() {
  clearScreen();
  statusSet('warming up...');
  await delay(500);
  await printBanner();

  const token = await promptToken();
  setToken(token);
  statusLog('');
  setCatMood('hunting');

  statusLog('  Target ID  →  ' + TARGET_USER_ID);
  statusLog('  Mode       →  ' + modeLabel() + (MODE_HEATMAP ? '  +heatmap' : ''));
  statusLog('  Started    →  ' + new Date().toISOString());
  statusLog('');

  statusSet('fetching your server list...');
  const guilds = await discordAPI('/users/@me/guilds');

  if (!Array.isArray(guilds)) {
    stopHeader();
    console.error('\n  ✗  nyx could not fetch servers — that token smells wrong.\n');
    process.exit(1);
  }

  statusLog('  ✓  ' + guilds.length + ' server(s) found — ready to pounce');
  statusSet('picking up the scent...');
  let resolvedUsername = await tryResolveFromAPI(TARGET_USER_ID);
  await delay(1500);

  if (resolvedUsername) statusLog('  ✓  target identified:  ' + resolvedUsername);

  const tmpDir = '_tmp_' + TARGET_USER_ID;
  if (DOWNLOAD_FILES && !MENTION_ONLY_MODE && !fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  const allMessages = [];
  const allMentions = [];
  const summary     = [];

  statusLog('');

  const startTime = Date.now();

  for (const guild of guilds) {
    const name = stripEmoji(guild.name) || guild.id;
    statusLog('  ▸  ' + name);

    if (MENTION_ONLY_MODE) {
      const mentions = await searchGuildForMentions(guild.id, guild.name, (username) => {
        if (!resolvedUsername) {
          resolvedUsername = username;
          statusLog('');
          statusLog('  ✓  target identified: ' + resolvedUsername);
        }
      });
      allMentions.push(...mentions);
      summary.push({ server: name, count: mentions.length, files: [], mentions: mentions.length });
      if (mentions.length > 0) statusLog('');
    } else {
      let msgs;
      if (FILES_ONLY_MODE) {
        msgs = await searchGuildForFiles(guild.id, guild.name, tmpDir, (username) => {
          if (!resolvedUsername) {
            resolvedUsername = username;
            statusLog('');
            statusLog('  ✓  target identified: ' + resolvedUsername);
          }
        });
      } else {
        msgs = await searchGuildForUser(guild.id, guild.name, tmpDir, (username) => {
          if (!resolvedUsername) {
            resolvedUsername = username;
            statusLog('');
            statusLog('  ✓  target identified: ' + resolvedUsername);
          }
        });
      }
      const allFiles = msgs.flatMap((m) => m.files || []);
      allMessages.push(...msgs);
      summary.push({ server: name, count: msgs.length, files: allFiles, mentions: 0 });
      if (msgs.length > 0) statusLog('');
    }

    statusSet('padding softly to the next server...');
    await delay(SEARCH_DELAY_MS);
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

  statusSet('tidying up the den...');

  const totalFiles      = allMessages.reduce((n, m) => n + (m.files ? m.files.length : 0), 0);
  const totalMentions   = allMentions.length;
  const serversWithMsgs = summary.filter((s) => s.count > 0);

  if (MENTION_ONLY_MODE) {
    const mentioners = writeMentionsOutput(outDir, { finalUsername, allMentions, serversWithMsgs, totalMentions });
    const rows       = buildMentionRows(mentioners, serversWithMsgs, totalMentions, elapsed);
    setCatMood('happy');
    stopHeader();
    await printResults(rows, './' + outDir + '/');
    finalizeOutput();
    return;
  }

  if (SAVE_MESSAGES) {
    writeMessagesOutput(outDir, filesDir, { finalUsername, allMessages, serversWithMsgs, totalFiles });
    const rows = buildMessageRows(allMessages, serversWithMsgs, totalFiles, elapsed);
    setCatMood('happy');
    stopHeader();
    await printResults(rows, './' + outDir + '/');
  } else {
    const rows = buildFilesOnlyRows(summary, totalFiles, elapsed);
    setCatMood('happy');
    stopHeader();
    await printResults(rows, './' + outDir + '/');
  }

  if (MODE_HEATMAP && allMessages.length > 0) {
    await printAndSaveHeatmap(allMessages, outDir, finalUsername);
    await catTypeLine('  ✓  heatmap.txt saved', { charDelay: 14 });
  }

  finalizeOutput();
}

main().catch((err) => {
  stopHeader();
  console.error('\n  ✗  fatal error: ' + err.message);
  process.exit(1);
});>

