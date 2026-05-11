const fetch = require('node-fetch');
const { RATE_LIMIT_WAIT_MS } = require('./constants');
const { statusLog, serverSubSet, serverSubClear, delay } = require('./terminal');

let DISCORD_TOKEN = '';

function setToken(token) {
  DISCORD_TOKEN = token;
}

function getToken() {
  return DISCORD_TOKEN;
}

async function discordAPI(apiPath) {
  const token = DISCORD_TOKEN.replace(/^"|"$/g, '');
  const res   = await fetch('https://discord.com/api/v9' + apiPath, {
    headers: { Authorization: token },
  });

  if (res.status === 429) {
    const { setCatMood } = require('./terminal');

    const waitMs = RATE_LIMIT_WAIT_MS;
    const total  = waitMs / 1000;
    const start  = Date.now();

    setCatMood('sad');

    const rlIv = setInterval(() => {
      const elapsed   = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(0, total - elapsed);
      serverSubSet('⟳  rate limited — resuming in ' + remaining + 's');
    }, 500);

    await delay(waitMs);
    clearInterval(rlIv);
    setCatMood('hunting');
    serverSubClear();
    return discordAPI(apiPath);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await res.text();
    statusLog('  ✗  unexpected response (HTTP ' + res.status + ') — skipping this request');
    statusLog('     hint: ' + body.slice(0, 120).replace(/[\r\n]+/g, ' ').trim() + '...');
    return { code: res.status, message: 'non-JSON response (HTTP ' + res.status + ')' };
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    statusLog('  ✗  JSON parse failed for ' + apiPath + ' — skipping');
    return { code: -1, message: 'JSON parse error: ' + err.message };
  }

  return json;
}

async function tryResolveFromAPI(userId) {
  try {
    const user = await discordAPI('/users/' + userId);
    if (user && user.username && !user.code) {
      return user.discriminator && user.discriminator !== '0'
        ? user.username + '#' + user.discriminator
        : user.username;
    }
  } catch {}
  return null;
}

async function resolveProfile(userId) {
  try {
    const user = await discordAPI('/users/' + userId);
    if (user && user.username && !user.code) {
      const tag = user.discriminator && user.discriminator !== '0'
        ? user.username + '#' + user.discriminator
        : user.username;
      const createdMs = Number(BigInt(userId) >> 22n) + 1420070400000;

      let mutualGuilds        = [];
      let mutualFriendsCount  = null;
      let bio                 = null;
      try {
        const profRes = await fetch(
          'https://discord.com/api/v9/users/' + userId + '/profile?with_mutual_guilds=true&with_mutual_friends_count=true',
          { headers: { Authorization: DISCORD_TOKEN.replace(/^"|"$/g, '') } }
        );
        if (profRes.ok) {
          const prof = await profRes.json();
          if (prof && !prof.code) {
            mutualGuilds       = prof.mutual_guilds       || [];
            mutualFriendsCount = prof.mutual_friends_count ?? null;
            bio                = prof.user_profile?.bio   || null;
          }
        }
      } catch {}

      return {
        id:                 user.id,
        tag,
        displayName:        user.global_name || null,
        username:           user.username,
        avatar:             user.avatar      || null,
        createdAt:          new Date(createdMs),
        mutualGuilds,
        mutualFriendsCount,
        bio,
      };
    }
  } catch {}
  return null;
}

module.exports = { discordAPI, tryResolveFromAPI, resolveProfile, setToken, getToken };