const readline = require('readline');
const {
  HIDE_CURSOR, SHOW_CURSOR, CLEAR_LINE, SAVE_CURSOR, RESTORE_CURSOR,
  RESET, CAT_FRAMES, CAT_FACES, BANNER_COLOURS, GLITCH_CHARS,
} = require('./constants');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const DIM  = '\x1b[2m';
const BOLD = '\x1b[1m';

let _catFrame   = 0;
let _catMood    = 'idle';
let _statusMsg  = 'warming up...';
let _headerIv   = null;
let _outputLine = 1;
let _catLine    = null;

let _serverLine  = null;
let _serverName  = '';
let _serverMode  = '';
let _serverCount = 0;
let _serverUnit  = '';

function moveCursor(row, col) {
  return '\x1b[' + row + ';' + col + 'H';
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[^m]*m/g, '');
}

function clearScreen() {
  process.stdout.write(HIDE_CURSOR);
  process.stdout.write('\x1b[2J');
  process.stdout.write(moveCursor(1, 1));
}

function lockCatBelowBanner() {
  _catLine     = _outputLine;
  _outputLine += 3;
  if (!_headerIv) {
    _headerIv = setInterval(() => updateHeader(), 300);
  }
}

function setCatMood(mood) {
  if (CAT_FACES[mood]) {
    _catMood  = mood;
    _catFrame = 0;
  }
}

function updateHeader() {
  if (_catLine === null) return;
  const faces     = CAT_FACES[_catMood] || CAT_FACES.idle;
  const c         = faces[_catFrame % faces.length];
  const col       = BANNER_COLOURS[_catFrame % BANNER_COLOURS.length];
  const maxMsgLen = Math.max(10, (process.stdout.columns || 80) - 20);
  const safeMsg   = String(_statusMsg).replace(/[\r\n]/g, ' ').slice(0, maxMsgLen);
  const innerLen  = stripAnsi(c).length + safeMsg.length + 7;
  const boxWidth  = Math.min(innerLen + 2, (process.stdout.columns || 80) - 4);

  process.stdout.write(
    SAVE_CURSOR +
    moveCursor(_catLine, 1)     + CLEAR_LINE + col + '  ╭' + '─'.repeat(boxWidth) + '╮' + RESET +
    moveCursor(_catLine + 1, 1) + CLEAR_LINE + '   ' + col + c + '  │  ' + safeMsg + RESET + ' ' +
    moveCursor(_catLine + 2, 1) + CLEAR_LINE + col + '  ╰' + '─'.repeat(boxWidth) + '╯' + RESET +
    RESTORE_CURSOR
  );
  _catFrame++;
}

function statusSet(msg) {
  _statusMsg = msg;
}

function statusLog(msg) {
  process.stdout.write(SAVE_CURSOR);
  process.stdout.write(moveCursor(_outputLine, 1));
  process.stdout.write(CLEAR_LINE);
  process.stdout.write(msg + '\n');
  _outputLine++;
  process.stdout.write(RESTORE_CURSOR);
}

function serverLogStart(mode, name, unit) {
  _serverMode  = mode;
  _serverName  = name;
  _serverUnit  = unit;
  _serverCount = 0;
  if (_serverLine === null) {
    _serverLine  = _outputLine;
    _outputLine++;
  }
  _redrawServerLine(false);
}

function serverLogUpdate(count) {
  _serverCount = count;
  _redrawServerLine(false);
}

function serverLogDone() {
  _redrawServerLine(true);
}

function _redrawServerLine(done) {
  if (_serverLine === null) return;
  const tick  = done ? '✓' : '▸';
  const count = _serverCount > 0 ? ' (' + _serverCount + ' ' + _serverUnit + ')' : '';
  const line  = '  ' + tick + '  ' + BOLD + _serverMode + RESET + DIM + ' > ' + RESET + _serverName + DIM + count + RESET;
  process.stdout.write(
    SAVE_CURSOR +
    moveCursor(_serverLine, 1) +
    CLEAR_LINE +
    line +
    RESTORE_CURSOR
  );
}

function stopHeader() {
  if (_headerIv) {
    clearInterval(_headerIv);
    _headerIv = null;
  }
  process.stdout.write(SHOW_CURSOR);
}

async function glitchType(text, { charDelay = 55, glitches = 2 } = {}) {
  let out = '';
  for (const ch of text) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      for (let i = 0; i < glitches; i++) {
        const r = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        process.stdout.write(SAVE_CURSOR);
        process.stdout.write(moveCursor(_outputLine, 1));
        process.stdout.write(CLEAR_LINE + (out + r));
        process.stdout.write(RESTORE_CURSOR);
        await delay(22);
      }
    }
    out += ch.toUpperCase();
    process.stdout.write(SAVE_CURSOR);
    process.stdout.write(moveCursor(_outputLine, 1));
    process.stdout.write(CLEAR_LINE + out);
    process.stdout.write(RESTORE_CURSOR);
    await delay(charDelay);
  }
  _outputLine++;
}

async function typeLine(text, { charDelay = 18, newline = true } = {}) {
  let out = '';
  for (const ch of text) {
    out += ch;
    process.stdout.write(SAVE_CURSOR);
    process.stdout.write(moveCursor(_outputLine, 1));
    process.stdout.write(CLEAR_LINE + out);
    process.stdout.write(RESTORE_CURSOR);
    await delay(charDelay);
  }
  if (newline) _outputLine++;
}

async function catTypeLine(text, { charDelay = 13 } = {}) {
  let out = '';
  for (const ch of text) {
    out += ch;
    process.stdout.write(SAVE_CURSOR);
    process.stdout.write(moveCursor(_outputLine, 1));
    process.stdout.write(CLEAR_LINE + out);
    process.stdout.write(RESTORE_CURSOR);
    await delay(charDelay);
  }
  _outputLine++;
}

async function printResults(rows, folderPath) {
  _outputLine++;
  for (const row of rows) {
    await catTypeLine(row, { charDelay: 11 });
    await delay(35);
  }
  _outputLine++;
  await catTypeLine('  ✓  Folder  →  ' + folderPath, { charDelay: 18 });
  _outputLine++;
}

async function printBanner() {
  const bannerLines = [
'▐ ▄  ▄· ▄▌▐▄• ▄                                             ',
'•█▌▐█▐█▪██▌ █▌█▌▪                                            ',
'▐█▐▐▌▐█▌▐█▪ ·██·                                             ',
'██▐█▌ ▐█▀·.▪▐█·█▌                                            ',
'▀▀ █▪  ▀ • •▀▀ ▀▀                                            ',
'·▄▄▄▄  ▪  .▄▄ ·  ▄▄·       ▄▄▄  ·▄▄▄▄  ▄▄▄▄▄            ▄▄▌  ',
'██▪ ██ ██ ▐█ ▀. ▐█ ▌▪▪     ▀▄ █·██▪ ██ •██  ▪     ▪     ██•  ',
'▐█· ▐█▌▐█·▄▀▀▀█▄██ ▄▄ ▄█▀▄ ▐▀▀▄ ▐█· ▐█▌ ▐█.▪ ▄█▀▄  ▄█▀▄ ██▪  ',
'██. ██ ▐█▌▐█▄▪▐█▐███▌▐█▌.▐▌▐█•█▌██. ██  ▐█▌·▐█▌.▐▌▐█▌.▐▌▐█▌▐▌',
'▀▀▀▀▀• ▀▀▀ ▀▀▀▀ ·▀▀▀  ▀█▄▀▪.▀  ▀▀▀▀▀▀•  ▀▀▀  ▀█▄▀▪ ▀█▄▀▪.▀▀▀  ',
'',
  ];

  const cols     = process.stdout.columns || 120;
  const maxLen   = bannerLines.reduce((m, l) => Math.max(m, l.trimEnd().length), 0);
  const boxWidth = Math.min(maxLen + 4, cols - 4);

  await typeLine('  ╭' + '─'.repeat(boxWidth) + '╮', { charDelay: 1 });

  for (const line of bannerLines) {
    if (line === '') {
      await typeLine('  │' + ' '.repeat(boxWidth) + '│', { charDelay: 0 });
    } else {
      const trimmed    = line.trimEnd();
      const innerWidth = boxWidth - 2;
      const totalPad   = Math.max(0, innerWidth - trimmed.length);
      const leftPad    = Math.floor(totalPad / 2);
      const rightPad   = totalPad - leftPad;
      const padded     = ' '.repeat(leftPad) + trimmed + ' '.repeat(rightPad);
      await typeLine('  │ ' + padded + ' │', { charDelay: 3 });
    }
  }

  await typeLine('  ╰' + '─'.repeat(boxWidth) + '╯', { charDelay: 2 });
  _outputLine++;
  await glitchType('~ sniffing discord ~', { charDelay: 4, glitches: 4 });
  lockCatBelowBanner();
}

function _question(label) {
  return new Promise((resolve) => {
    process.stdout.write(SAVE_CURSOR);
    process.stdout.write(moveCursor(_outputLine, 1));
    process.stdout.write(CLEAR_LINE);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(label, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptToken() {
  const idleMessages = [
    'nyx is waiting for a token...',
    'tail flicking impatiently...',
    'nyx has been sitting here for ages...',
    'sharpening claws on the keyboard...',
    'the hunt cannot begin without a token...',
    'nyx is going to knock something off the desk...',
    'Quick waiting dance.',
    'nyx demands a token immediately.',
    'TOKEN TOKEN TOKEN..',
    'just the token. that is all nyx needs.',
  ];

  let msgIdx  = 0;
  let msgTick = 0;
  const MSG_HOLD = 20;

  const rotateIv = setInterval(() => {
    msgTick++;
    if (msgTick >= MSG_HOLD) {
      msgTick = 0;
      msgIdx  = (msgIdx + 1) % idleMessages.length;
      statusSet(idleMessages[msgIdx]);
    }
  }, 180);

  const token = await _question('  » Input |Token| : ');

  clearInterval(rotateIv);
  process.stdout.write(RESTORE_CURSOR);
  statusSet('initializing...');
  return token;
}

async function promptUserId() {
  setCatMood('hunting');
  statusSet('nyx needs a target...');

  while (true) {
    const id = await _question('  » Target ID    : ');
    if (/^\d{15,25}$/.test(id)) {
      process.stdout.write(SAVE_CURSOR);
      process.stdout.write(moveCursor(_outputLine, 1));
      process.stdout.write(CLEAR_LINE);
      process.stdout.write(RESTORE_CURSOR);
      return id;
    }
    statusSet('that does not look like a discord id...');
  }
}

async function promptMenu() {
  setCatMood('idle');
  statusSet('select an operation...');

  statusLog('');
  statusLog('   [1]  Messages');
  statusLog('   [2]  Files');
  statusLog('   [3]  Mentions');
  statusLog('   [4]  All');
  statusLog('');

  const map = { '1': 'messages', '2': 'files', '3': 'mentions', '4': 'all' };

  while (true) {
    const ans = await _question('  » Operation    : ');
    if (map[ans]) {
      process.stdout.write(SAVE_CURSOR);
      process.stdout.write(moveCursor(_outputLine, 1));
      process.stdout.write(CLEAR_LINE);
      process.stdout.write(RESTORE_CURSOR);
      return map[ans];
    }
  }
}

async function promptYesNo(label) {
  while (true) {
    const ans = (await _question(label)).toLowerCase();
    if (ans === 'y' || ans === 'yes') {
      process.stdout.write(SAVE_CURSOR);
      process.stdout.write(moveCursor(_outputLine, 1));
      process.stdout.write(CLEAR_LINE);
      process.stdout.write(RESTORE_CURSOR);
      return true;
    }
    if (ans === 'n' || ans === 'no' || ans === '') {
      process.stdout.write(SAVE_CURSOR);
      process.stdout.write(moveCursor(_outputLine, 1));
      process.stdout.write(CLEAR_LINE);
      process.stdout.write(RESTORE_CURSOR);
      return false;
    }
  }
}

function getOutputLine() { return _outputLine; }
function setOutputLine(n) { _outputLine = n; }

function finalizeOutput() {
  process.stdout.write(moveCursor(_outputLine + 1, 1));
  process.stdout.write('\n');
}

process.on('exit', () => stopHeader());
process.on('SIGINT', () => { stopHeader(); process.stdout.write('\n'); process.exit(0); });

module.exports = {
  clearScreen,
  lockCatBelowBanner,
  statusSet,
  statusLog,
  stopHeader,
  finalizeOutput,
  printBanner,
  promptToken,
  promptUserId,
  promptMenu,
  promptYesNo,
  printResults,
  catTypeLine,
  typeLine,
  glitchType,
  getOutputLine,
  setOutputLine,
  setCatMood,
  serverLogStart,
  serverLogUpdate,
  serverLogDone,
  delay,
};