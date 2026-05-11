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
let _flatOutput = false;

const LOGO_COLOURS = [
  '\x1b[38;5;240m',
  '\x1b[38;5;244m',
  '\x1b[38;5;248m',
  '\x1b[38;5;252m',
  '\x1b[38;5;255m',
  '\x1b[38;5;252m',
  '\x1b[38;5;248m',
  '\x1b[38;5;244m',
];

let _serverLine    = null;
let _serverSubLine = null;
let _serverName    = '';
let _serverMode    = '';
let _serverCount   = 0;
let _serverUnit    = '';
let _serverMeta    = '';

let _logBuffer     = [];
let _bannerPrinted = false;

const _BANNER_LINES = [
  '▐ ▄  ▄· ▄▌▐▄• ▄',
  '•█▌▐█▐█▪██▌ █▌█▌▪',
  '▐█▐▐▌▐█▌▐█▪ ·██·',
  '██▐█▌ ▐█▀·.▪▐█·█▌',
  '▀▀ █▪  ▀ • •▀▀ ▀▀',
  '',
  '·▄▄▄▄  ▪  .▄▄ ·  ▄▄·       ▄▄▄  ·▄▄▄▄  ▄▄▄▄▄            ▄▄▌',
  '██▪ ██ ██ ▐█ ▀. ▐█ ▌▪▪     ▀▄ █·██▪ ██ •██  ▪     ▪     ██•',
  '▐█· ▐█▌▐█·▄▀▀▀█▄██ ▄▄ ▄█▀▄ ▐▀▀▄ ▐█· ▐█▌ ▐█.▪ ▄█▀▄  ▄█▀▄ ██▪',
  '██. ██ ▐█▌▐█▄▪▐█▐███▌▐█▌.▐▌▐█•█▌██. ██  ▐█▌·▐█▌.▐▌▐█▌.▐▌▐█▌▐▌',
  '▀▀▀▀▀• ▀▀▀ ▀▀▀▀ ·▀▀▀  ▀█▄▀▪.▀  ▀▀▀▀▀▀•  ▀▀▀  ▀█▄▀▪ ▀█▄▀▪.▀▀▀',
];

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

let _catSepAbove = null;
let _catSepBelow = null;

function lockCatBelowBanner() {
  _catSepAbove = _outputLine;
  _catLine     = _outputLine + 1;
  _catSepBelow = _outputLine + 2;
  _outputLine += 3;
  if (!_headerIv) {
    _headerIv = setInterval(() => updateHeader(), 150);
  }
  updateHeader();
}

function setCatMood(mood) {
  if (CAT_FACES[mood]) {
    _catMood  = mood;
    _catFrame = 0;
  }
}

function updateHeader() {
  if (_catLine === null) return;
  const faces  = CAT_FACES[_catMood] || CAT_FACES.idle;
  const c      = faces[_catFrame % faces.length];
  const col    = BANNER_COLOURS[_catFrame % BANNER_COLOURS.length];
  const catW   = stripAnsi(c).length;
  const bar    = '─'.repeat(catW);
  const maxMsgLen = Math.max(10, (process.stdout.columns || 80) - catW - 10);
  const safeMsg   = String(_statusMsg).replace(/[\r\n]/g, ' ').slice(0, maxMsgLen);

  process.stdout.write(
    SAVE_CURSOR +
    moveCursor(_catSepAbove, 1) + CLEAR_LINE + '  ' + col + '╭' + bar + '╮' + RESET +
    moveCursor(_catLine,     1) + CLEAR_LINE + '  ' + col + '│' + c + '│' + RESET + '  ' + DIM + safeMsg + RESET +
    moveCursor(_catSepBelow, 1) + CLEAR_LINE + '  ' + col + '╰' + bar + '╯' + RESET +
    RESTORE_CURSOR
  );
  _catFrame++;
}

function statusSet(msg) {
  _statusMsg = msg;
}

function _resetOutputTo(line) {
  if (_catSepBelow !== null) {
    _logBuffer.length = Math.max(0, line - (_catSepBelow + 1));
  }
  _outputLine = line;
}

function statusLog(msg) {
  _logBuffer.push(msg);
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
  _serverMeta = '';
  if (_serverLine === null) {
    _serverLine    = _outputLine;
    _serverSubLine = _outputLine + 1;
    _outputLine   += 2;
  } else {
    serverSubClear();
  }
  _redrawServerLine(false);
}

function serverSubSet(msg) {
  if (_serverSubLine === null) return;
  process.stdout.write(SAVE_CURSOR + moveCursor(_serverSubLine, 1) + CLEAR_LINE + '  ' + DIM + msg + RESET + RESTORE_CURSOR);
}

function serverSubClear() {
  if (_serverSubLine === null) return;
  process.stdout.write(SAVE_CURSOR + moveCursor(_serverSubLine, 1) + CLEAR_LINE + RESTORE_CURSOR);
}

function clearLinesFrom(fromLine) {
  for (let row = fromLine; row < _outputLine; row++) {
    process.stdout.write(SAVE_CURSOR + moveCursor(row, 1) + CLEAR_LINE + RESTORE_CURSOR);
  }
  _resetOutputTo(fromLine);
}

function serverLogUpdate(count, meta) {
  _serverCount = count;
  if (meta !== undefined) _serverMeta = meta;
  _redrawServerLine(false);
}

function serverLogDone() {
  _redrawServerLine(true);
}

function _redrawServerLine(done) {
  if (_serverLine === null) return;
  const tick  = done ? '✓' : '▸';
  const meta  = _serverMeta ? '  ' + _serverMeta : '';
  const count = _serverCount > 0 ? ' (' + _serverCount + ' ' + _serverUnit + meta + ')' : '';
  const line  = '  ' + tick + '  ' + BOLD + _serverMode + RESET + DIM + ' │ ' + RESET + _serverName + DIM + count + RESET;
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
  if (_catLine !== null) {
    process.stdout.write(
      moveCursor(_catSepAbove, 1) + CLEAR_LINE +
      moveCursor(_catLine,     1) + CLEAR_LINE +
      moveCursor(_catSepBelow, 1) + CLEAR_LINE
    );
  }
  _flatOutput = true;
  process.stdout.write(moveCursor(_outputLine, 1));
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
  if (_flatOutput) {
    let out = '';
    for (const ch of text) {
      out += ch;
      process.stdout.write('\r' + out);
      await delay(charDelay);
    }
    process.stdout.write('\n');
    _outputLine++;
    return;
  }
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
  process.stdout.write('\n');
  _outputLine++;
  for (const row of rows) {
    await catTypeLine(row, { charDelay: 11 });
    await delay(35);
  }
  process.stdout.write('\n');
  _outputLine++;
  await catTypeLine('  Folder  →  ' + folderPath, { charDelay: 18 });
  process.stdout.write('\n');
  _outputLine++;
}

async function printBanner() {
  _bannerStartLine  = _outputLine;
  let colorIdx = 0;

  for (const line of _BANNER_LINES) {
    if (line === '') {
      _outputLine++;
      await delay(40);
      continue;
    }

    let built = '  ';
    process.stdout.write(SAVE_CURSOR + moveCursor(_outputLine, 1) + CLEAR_LINE + RESTORE_CURSOR);

    for (const ch of line) {
      const col = LOGO_COLOURS[colorIdx % LOGO_COLOURS.length];
      colorIdx++;
      built += col + ch + RESET;
      process.stdout.write(SAVE_CURSOR + moveCursor(_outputLine, 1) + CLEAR_LINE + built + RESTORE_CURSOR);
      await delay(2);
    }
    _outputLine++;
    await delay(18);
  }

  _outputLine++;
  await glitchType('~ harvest  ·  analyze  ·  profile ~', { charDelay: 5, glitches: 4 });
  process.stdout.write(SAVE_CURSOR + moveCursor(_outputLine, 1) + CLEAR_LINE + DIM + '─'.repeat(36) + RESET + RESTORE_CURSOR);
  _outputLine++;
  lockCatBelowBanner();
  _bannerPrinted = true;
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

async function promptServerSelect(guilds) {
  setCatMood('idle');
  statusSet('pick your servers...');

  const listStart = _outputLine;
  statusLog('');
  for (let i = 0; i < guilds.length; i++) {
    statusLog('   [' + (i + 1) + ']  ' + (guilds[i].name || guilds[i].id));
  }
  statusLog('');

  const ans = await _question('  » Servers [1,2,3 or enter for all] : ');

  for (let row = listStart; row <= _outputLine; row++) {
    process.stdout.write(SAVE_CURSOR + moveCursor(row, 1) + CLEAR_LINE + RESTORE_CURSOR);
  }
  _resetOutputTo(listStart);

  if (!ans.trim()) return guilds;

  const selected = ans.split(',')
    .map((s) => {
      const idx = parseInt(s.trim(), 10) - 1;
      return (idx >= 0 && idx < guilds.length) ? guilds[idx] : null;
    })
    .filter(Boolean);

  return selected.length > 0 ? selected : guilds;
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
  process.stdout.write('\n');
}

function _redrawAll() {
  if (!_bannerPrinted || _flatOutput) return;

  const savedBuffer  = _logBuffer.slice();
  const serverActive = _serverLine !== null;

  process.stdout.write('\x1b[2J');
  _outputLine  = 1;
  _logBuffer   = [];

  let colorIdx = 0;
  for (const line of _BANNER_LINES) {
    if (line === '') { _outputLine++; continue; }
    let built = '  ';
    for (const ch of line) {
      built += LOGO_COLOURS[colorIdx % LOGO_COLOURS.length] + ch + RESET;
      colorIdx++;
    }
    process.stdout.write(moveCursor(_outputLine, 1) + CLEAR_LINE + built);
    _outputLine++;
  }

  _outputLine++;
  process.stdout.write(moveCursor(_outputLine, 1) + CLEAR_LINE + '~ HARVEST  ·  ANALYZE  ·  PROFILE ~');
  _outputLine++;
  process.stdout.write(moveCursor(_outputLine, 1) + CLEAR_LINE + DIM + '─'.repeat(36) + RESET);
  _outputLine++;

  _catSepAbove = _outputLine;
  _catLine     = _outputLine + 1;
  _catSepBelow = _outputLine + 2;
  _outputLine += 3;
  updateHeader();

  for (const msg of savedBuffer) {
    process.stdout.write(moveCursor(_outputLine, 1) + CLEAR_LINE + msg);
    _outputLine++;
  }
  _logBuffer = savedBuffer;

  if (serverActive) {
    _serverLine    = _outputLine;
    _serverSubLine = _outputLine + 1;
    _outputLine   += 2;
    _redrawServerLine(false);
  }
}

process.on('exit', () => stopHeader());
process.on('SIGINT', () => { stopHeader(); process.stdout.write('\n'); process.exit(0); });
if (process.platform !== 'win32') {
  process.on('SIGWINCH', () => _redrawAll());
}

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
  promptServerSelect,
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
  serverSubSet,
  serverSubClear,
  clearLinesFrom,
  delay,
};