const fetch = require('node-fetch');
const { RATE_LIMIT_WAIT_MS } = require('./constants');
const { statusSet, statusLog, delay } = require('./terminal');

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

    const rateLimitMessages = [
      'got caught... sitting very still...',
      'pretending to be a normal cat...',
      'staring at the wall and thinking about choices...',
      'waiting patiently (not really)...',
      'tail tucked. dignity: minimal...',
      'contemplating every decision that led here...',
    ];

    const waitMs = RATE_LIMIT_WAIT_MS;

    let rlMsgIdx  = 0;
    let rlMsgTick = 0;
    const RL_MSG_HOLD = 6;
    const total = waitMs / 1000;
    const start = Date.now();

    setCatMood('sad');

    const rlIv = setInterval(() => {
      const elapsed   = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(0, total - elapsed);
      statusSet(rateLimitMessages[rlMsgIdx] + '  back in ' + remaining + 's');
      rlMsgTick++;
      if (rlMsgTick >= RL_MSG_HOLD) {
        rlMsgTick = 0;
        rlMsgIdx  = (rlMsgIdx + 1) % rateLimitMessages.length;
      }
    }, 500);

    await delay(waitMs);
    clearInterval(rlIv);
    setCatMood('hunting');
    statusLog('  ✓  timeout lifted — back on the trail...');
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
      return {
        id:            user.id,
        tag,
        avatar:        user.avatar || null,
        discriminator: user.discriminator || null,
      };
    }
  } catch {}
  return null;
}

module.exports = { discordAPI, tryResolveFromAPI, resolveProfile, setToken, getToken };