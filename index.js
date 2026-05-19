async function main() {
  const term         = require('./terminal');
  const { loadEnv, saveEnv }  = require('./env');
  const { setToken, discordAPI } = require('./api');

  term.clearScreen();
  term.statusSet('warming up...');
  await term.delay(500);
  await term.printBanner();

  const env = loadEnv();
  const hasEnvFile = require('fs').existsSync(require('path').join(process.cwd(), '.env'));
  let token = null;
  if (env.Token && env.Token.length) {
    token = env.Token.trim();
    setToken(token);
    term.statusSet('checking token...');
    const me = await discordAPI('/users/@me');
    if (me && me.username && !me.code) {
      const myTag = me.global_name || (me.discriminator && me.discriminator !== '0'
        ? me.username + '#' + me.discriminator : me.username);
      term.statusLog('  logged in as        ' + myTag);
    } else {
      term.statusLog('  token loaded');
    }
  }

  const fs_   = require('fs');
  const path_ = require('path');
  const scanDirs = fs_.readdirSync('.').filter(f => {
    try {
      return fs_.statSync(f).isDirectory() &&
        (fs_.existsSync(path_.join(f, 'messages.json')) ||
         fs_.existsSync(path_.join(f, 'mentions.json')));
    } catch { return false; }
  });

  const action = await term.promptStartMenu(scanDirs.length > 0);

  if (action === 'view') {
    const { launchViewer } = require('./viewer');
    const folder = scanDirs.length === 1 ? scanDirs[0] : await term.promptFolderSelect(scanDirs);
    const hasMessages = fs_.existsSync(path_.join(folder, 'messages.json'));
    const hasMentions = fs_.existsSync(path_.join(folder, 'mentions.json'));
    const mode = hasMentions && !hasMessages ? 'mentions' : 'messages';
    term.stopHeader();
    const v = await launchViewer(folder, mode);
    await term.catTypeLine('  viewer  →  ' + v.url, { charDelay: 14 });
    await term.catTypeLine('     ctrl+c to stop', { charDelay: 14 });
    term.finalizeOutput();
    return;
  }

  // action === 'scan'
  if (!token) {
    const noEnv = !hasEnvFile;
    const envMsgLine = noEnv ? term.getOutputLine() : null;
    token = await term.promptToken({ createEnv: noEnv });
    if (noEnv) {
      saveEnv(token);
      term.statusLog('  .env created        ✓');
      await term.delay(900);
      term.clearLinesFrom(envMsgLine);
    }
    setToken(token);
    term.statusSet('checking token...');
    const me = await discordAPI('/users/@me');
    if (me && me.username && !me.code) {
      const myTag = me.global_name || (me.discriminator && me.discriminator !== '0'
        ? me.username + '#' + me.discriminator : me.username);
      term.statusLog('  logged in as        ' + myTag);
    }
    term.statusLog('');
  }

  const userId = await term.promptUserId();
  term.statusLog('  target locked: ' + userId);
  term.statusLog('');

  term.statusSet('fetching your server list...');
  const guilds = await discordAPI('/users/@me/guilds');

  if (!Array.isArray(guilds)) {
    term.stopHeader();
    console.error('\n  nyx could not fetch servers — that token smells wrong.\n');
    process.exit(1);
  }

  const setupLine = term.getOutputLine();
  term.statusLog('  ' + guilds.length + ' server(s) found');

  const selectedGuilds = guilds;

  const op = await term.promptMenu();

  term.clearLinesFrom(setupLine);

  const constants = require('./constants');
  constants.configure({
    TARGET_USER_ID: userId,
    MODE_ALL:       op === 'all',
    MODE_MESSAGES:  op === 'messages',
    MODE_FILES:     op === 'files',
    MODE_MENTION:   op === 'mentions',
    MODE_HEATMAP:   op !== 'mentions',
  });

  const fs   = require('fs');
  const path = require('path');
  const { sanitizeName, stripEmoji }                        = require('./utils');
  const { resolveProfile }                                  = require('./api');
  const { printAndSaveHeatmap, saveTimeline }               = require('./heatmap');
  const { ensureDir, moveTmpFiles }                         = require('./fileHandler');
  const { searchGuildForMentions, searchGuildForFiles, searchGuildForUser } = require('./search');
  const {
    writeMentionsOutput, writeMessagesOutput,
    buildMessageRows, buildFilesOnlyRows, buildMentionRows,
  } = require('./output');
  const {
    TARGET_USER_ID, MODE_ALL, MODE_MESSAGES, MODE_FILES, MODE_MENTION,
    MODE_HEATMAP, DOWNLOAD_FILES, SAVE_MESSAGES, FILES_ONLY_MODE,
    MENTION_ONLY_MODE, SERVER_DELAY_MIN_MS, SERVER_DELAY_MAX_MS,
  } = constants;

  term.setCatMood('hunting');

  function formatBadge(id) {
    const lvl = id.match(/guild_booster_lvl(\d+)/);
    if (lvl) return 'Booster L' + lvl[1];
    const MAP = {
      premium: 'Nitro', legacy_username: 'Legacy Username',
      verified_developer: 'Verified Dev', active_developer: 'Active Dev',
      bug_hunter_level_1: 'Bug Hunter', bug_hunter_level_2: 'Bug Hunter Gold',
      partner: 'Partner', staff: 'Staff', certified_moderator: 'Certified Mod',
      hypesquad_house_1: 'HypeSquad Bravery', hypesquad_house_2: 'HypeSquad Brilliance',
      hypesquad_house_3: 'HypeSquad Balance', quest_completed: 'Quest', orb_profile_badge: 'Orb',
    };
    const tenure = id.match(/premium_tenure_(\d+)_month/);
    if (tenure) return 'Nitro ' + tenure[1] + 'mo';
    return MAP[id] || id.replace(/_/g, ' ');
  }

  function fmtYearMonth(iso) {
    const d = new Date(iso);
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getFullYear() + ' ' + MONTHS[d.getMonth()];
  }

  let profileShown = false;

  async function showTargetProfile(usernameOverride, authorObj) {
    if (profileShown) return;
    const prof = await resolveProfile(TARGET_USER_ID);

    const tag = prof ? prof.tag
      : (authorObj && authorObj.username) ? (authorObj.discriminator && authorObj.discriminator !== '0' ? authorObj.username + '#' + authorObj.discriminator : authorObj.username)
      : (usernameOverride || null);
    if (!tag) return;

    const displayName = prof ? prof.displayName : (authorObj ? (authorObj.global_name || null) : null);
    const username    = prof ? prof.username    : (authorObj ? authorObj.username : tag);
    const avatar      = prof ? prof.avatar      : (authorObj ? authorObj.avatar   : null);

    if (avatar && !resolvedAvatar) resolvedAvatar = avatar;
    profileShown = true;

    term.statusLog('  target identified:  ' + tag);
    if (displayName && displayName !== username) {
      term.statusLog('  display name:        ' + displayName);
    }
    term.statusLog('  username:            ' + username);
    if (prof && prof.legacyUsername) term.statusLog('  legacy username:     ' + prof.legacyUsername);
    term.statusLog('  joined discord:      ' + formatSnowflakeDate(TARGET_USER_ID));
    if (prof && prof.pronouns)  term.statusLog('  pronouns:            ' + prof.pronouns);
    if (prof && prof.bio)       term.statusLog('  bio:                 ' + prof.bio.replace(/\n/g, ' ').slice(0, 80));
    if (prof && prof.premiumSince)      term.statusLog('  nitro since:         ' + fmtYearMonth(prof.premiumSince));
    if (prof && prof.premiumGuildSince) term.statusLog('  boosting since:      ' + fmtYearMonth(prof.premiumGuildSince));
    if (prof && prof.badges && prof.badges.length > 0) {
      term.statusLog('  badges:              ' + prof.badges.map(formatBadge).join('  ·  '));
    }
    if (prof && prof.mutualFriendsCount !== null) term.statusLog('  mutual friends:      ' + prof.mutualFriendsCount);
    if (prof && prof.mutualGuilds && prof.mutualGuilds.length > 0) {
      term.statusLog('  mutual servers:      ' + prof.mutualGuilds.length);
      const shown     = prof.mutualGuilds.slice(0, 5);
      const remaining = prof.mutualGuilds.length - shown.length;
      for (const mg of shown) {
        const g    = guilds.find(x => x.id === mg.id);
        const name = g ? (stripEmoji(g.name) || mg.id) : mg.id;
        term.statusLog('    ·  ' + name + (mg.nick ? '  (nick: ' + mg.nick + ')' : ''));
      }
      if (remaining > 0) term.statusLog('    &  ' + remaining + ' more');
    }
    if (prof && prof.connectedAccounts && prof.connectedAccounts.length > 0) {
      for (const acc of prof.connectedAccounts) {
        term.statusLog('  ' + (acc.label + ':').padEnd(21) + acc.name);
      }
    }
    return prof;
  }

  let resolvedUsername = null;
  let resolvedAvatar   = null;

  term.statusSet('picking up the scent...');
  const profile = await showTargetProfile(null);
  if (profile) {
    if (!resolvedUsername) resolvedUsername = profile.tag;
    if (!resolvedAvatar)   resolvedAvatar   = profile.avatar;
  }
  await term.delay(1500);

  const tmpDir = '_tmp_' + TARGET_USER_ID;
  if (DOWNLOAD_FILES && !MENTION_ONLY_MODE && !fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  const allMessages = [];
  const allMentions = [];
  const summary     = [];

  function modeDisplay() {
    if (MODE_ALL)      return 'All';
    if (MODE_MESSAGES) return 'Messages';
    if (MODE_FILES)    return 'Files';
    if (MODE_MENTION)  return 'Mentions';
    return 'All';
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

  for (const guild of selectedGuilds) {
    const name = stripEmoji(guild.name) || guild.id;
    term.serverLogStart(mode, name, unit);

    if (MENTION_ONLY_MODE) {
      const mentions = await searchGuildForMentions(guild.id, guild.name, async (username, authorObj) => {
        if (!resolvedUsername) {
          resolvedUsername = username;
          await showTargetProfile(username, authorObj);
        }
      }, (count, meta) => term.serverLogUpdate(count, meta));
      allMentions.push(...mentions);
      summary.push({ server: name, count: mentions.length, files: [], mentions: mentions.length });
      term.serverLogUpdate(mentions.length);
    } else {
      let msgs;
      if (FILES_ONLY_MODE) {
        msgs = await searchGuildForFiles(guild.id, guild.name, tmpDir, async (username, authorObj) => {
          if (!resolvedUsername) {
            resolvedUsername = username;
            await showTargetProfile(username, authorObj);
          }
        }, (count, meta) => term.serverLogUpdate(count, meta));
      } else {
        msgs = await searchGuildForUser(guild.id, guild.name, tmpDir, async (username, authorObj) => {
          if (!resolvedUsername) {
            resolvedUsername = username;
            await showTargetProfile(username, authorObj);
          }
        }, (count, meta) => term.serverLogUpdate(count, meta));
      }
      const allFiles = msgs.flatMap((m) => m.files || []);
      allMessages.push(...msgs);

      let guildMentions = [];
      if (MODE_ALL) {
        term.serverLogDone();
        term.serverLogStart('Mentions', name, 'mentions');
        guildMentions = await searchGuildForMentions(guild.id, guild.name, async (username, authorObj) => {
          if (!resolvedUsername) {
            resolvedUsername = username;
            await showTargetProfile(username, authorObj);
          }
        }, (count, meta) => term.serverLogUpdate(count, meta));
        allMentions.push(...guildMentions);
      } else {
        term.serverLogUpdate(FILES_ONLY_MODE ? allFiles.length : msgs.length);
      }

      summary.push({ server: name, count: msgs.length, files: allFiles, mentions: guildMentions.length });
    }

    term.serverLogDone();

    if (guild !== selectedGuilds[selectedGuilds.length - 1]) {
      const delayMs = Math.floor(Math.random() * (SERVER_DELAY_MAX_MS - SERVER_DELAY_MIN_MS + 1)) + SERVER_DELAY_MIN_MS;
      term.setCatMood('sleepy');
      await new Promise((resolve) => {
        const start = Date.now();
        const iv = setInterval(() => {
          const remaining = Math.max(0, (delayMs - (Date.now() - start)) / 1000).toFixed(1);
          term.statusSet('padding softly to the next server...  ' + remaining + 's');
          if (Date.now() - start >= delayMs) { clearInterval(iv); resolve(); }
        }, 100);
      });
      term.setCatMood('hunting');
    }
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
  if (profile) {
    const enriched = Object.assign({}, profile);
    if (profile.mutualGuilds && profile.mutualGuilds.length) {
      enriched.mutualGuilds = profile.mutualGuilds.map(mg => {
        const g = guilds.find(x => x.id === mg.id);
        return Object.assign({}, mg, { name: g ? (stripEmoji(g.name) || mg.id) : mg.id });
      });
    }
    fs.writeFileSync(path.join(outDir, 'profile.json'), JSON.stringify(enriched, null, 2));
  }

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
  } else if (MODE_ALL) {
    writeMessagesOutput(outDir, filesDir, {
      finalUsername, targetAvatar: resolvedAvatar, allMessages, serversWithMsgs, totalFiles,
    });
    const rows = buildMessageRows(allMessages, serversWithMsgs, totalFiles, elapsed);
    if (allMentions.length > 0) {
      const mentioners = writeMentionsOutput(outDir, {
        finalUsername, targetAvatar: resolvedAvatar, allMentions, serversWithMsgs, totalMentions,
      });
      rows.push('');
      rows.push(...buildMentionRows(mentioners, serversWithMsgs, totalMentions, null));
    }
    term.setCatMood('happy');
    term.stopHeader();
    await term.printResults(rows, './' + outDir + '/');
    viewerMode = 'messages';
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

  if (allMessages.length > 0) saveTimeline(allMessages, outDir, finalUsername);

  if (MODE_HEATMAP && allMessages.length > 0) {
    await printAndSaveHeatmap(allMessages, outDir, finalUsername);
    await term.catTypeLine('  heatmap.txt saved', { charDelay: 14 });
  }

  if (viewerMode) {
    try {
      const { launchViewer } = require('./viewer');
      const v = await launchViewer(outDir, viewerMode);
      await term.catTypeLine('  viewer  →  ' + v.url, { charDelay: 14 });
      await term.catTypeLine('     ctrl+c to stop', { charDelay: 14 });
      term.finalizeOutput();
      return;
    } catch (e) {
      await term.catTypeLine('  ✗  viewer error: ' + e.message, { charDelay: 14 });
    }
  }

  term.finalizeOutput();
}

function formatSnowflakeDate(id) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d      = new Date(Number(BigInt(id) >> 22n) + 1420070400000);
  const diffMs = Date.now() - d.getTime();
  const years  = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));
  const months = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
  const ago    = years >= 1  ? years  + ' year'  + (years  === 1 ? '' : 's') + ' ago'
               : months >= 1 ? months + ' month' + (months === 1 ? '' : 's') + ' ago'
               : Math.floor(diffMs / (1000 * 60 * 60 * 24)) + ' days ago';
  return d.getFullYear() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + '  (' + ago + ')';
}

function formatElapsed(ms) {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return totalSeconds.toFixed(1) + 's';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(0).padStart(2, '0');
  return minutes + 'm ' + seconds + 's';
}

async function viewMode() {
  const fs       = require('fs');
  const path     = require('path');
  const readline = require('readline');
  const { launchViewer, launchFileBrowser } = require('./viewer');

  let folder = process.argv[3] || null;

  if (!folder) {
    const dirs = fs.readdirSync('.').filter((f) => {
      try {
        return fs.statSync(f).isDirectory() &&
          (fs.existsSync(path.join(f, 'messages.json')) ||
           fs.existsSync(path.join(f, 'mentions.json')) ||
           f.startsWith('_tmp_'));
      } catch { return false; }
    });

    if (dirs.length === 0) {
      console.error('\n  ✗  no output folders found\n');
      process.exit(1);
    }

    if (dirs.length === 1) {
      folder = dirs[0];
    } else {
      console.log('\n  available folders:\n');
      dirs.forEach((d, i) => console.log('  [' + (i + 1) + ']  ' + d));
      console.log('');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      folder = await new Promise((resolve) => {
        rl.question('  » pick a folder: ', (ans) => {
          rl.close();
          const idx = parseInt(ans, 10) - 1;
          resolve(dirs[idx] || dirs[0]);
        });
      });
    }
  }

  const hasMessages = fs.existsSync(path.join(folder, 'messages.json'));
  const hasMentions = fs.existsSync(path.join(folder, 'mentions.json'));

  if (!hasMessages && !hasMentions) {
    console.log('\n  no JSON data — launching file browser for ' + folder + '...\n');
    const v = await launchFileBrowser(folder);
    console.log('  viewer  →  ' + v.url);
    console.log('     ctrl+c to stop\n');
    return;
  }

  const mode = hasMentions && !hasMessages ? 'mentions' : 'messages';

  console.log('\n  opening ' + folder + ' (' + mode + ')...\n');
  const v = await launchViewer(folder, mode);
  console.log('  viewer  →  ' + v.url);
  console.log('     ctrl+c to stop\n');
}

if (process.argv[2] === '--view') {
  viewMode().catch((err) => {
    console.error('\n  ✗  ' + err.message + '\n');
    process.exit(1);
  });
} else {
  main().catch((err) => {
    try { require('./terminal').stopHeader(); } catch {}
    const msg = (err && err.stack) ? err.stack : String(err);
    try { require('fs').writeFileSync('nyx_error.log', msg + '\n'); } catch {}
    console.error('\n  ✗  fatal error: ' + (err && err.message ? err.message : err));
    console.error('  (details saved to nyx_error.log)');
    process.exit(1);
  });
}