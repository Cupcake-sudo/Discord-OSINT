const readline = require('readline');
const {
  HIDE_CURSOR, SHOW_CURSOR, CLEAR_LINE, SAVE_CURSOR, RESTORE_CURSOR,
  RESET, CAT_FRAMES, CAT_FACES, BANNER_COLOURS, GLITCH_CHARS,
} = require('./constants');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let _catFrame   = 0;
let _catMood    = 'idle';
let _statusMsg  = 'warming up...';
let _headerIv   = null;
let _outputLine = 1;
let _catLine    = null;

function moveCursor(row, col) {
  return '\x1b[' + row + ';' + col + 'H';
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
  const faces  = CAT_FACES[_catMood] || CAT_FACES.idle;
  const c      = faces[_catFrame % faces.length];
  const col    = BANNER_COLOURS[_catFrame % BANNER_COLOURS.length];

  const maxMsgLen = Math.max(10, (process.stdout.columns || 80) - 20);
  const safeMsg   = String(_statusMsg).replace(/[\r\n]/g, ' ').slice(0, maxMsgLen);

  // box chars
  const inner     = '  ' + c + '  │  ' + safeMsg;
  const innerLen  = c.replace(/\x1b\[[^m]*m/g, '').length + safeMsg.length + 7;
  const boxWidth  = Math.min(innerLen + 2, (process.stdout.columns || 80) - 2);
  const top       = '  ╭' + '─'.repeat(boxWidth) + '╮';
  const bottom    = '  ╰' + '─'.repeat(boxWidth) + '╯';
  const mid       = '  │ ' + col + c + RESET + '  │  ' + col + safeMsg + RESET;

  process.stdout.write(
    SAVE_CURSOR +
    moveCursor(_catLine, 1)     + CLEAR_LINE + col + top    + RESET + '\n' +
    moveCursor(_catLine + 1, 1) + CLEAR_LINE + mid                        + '\n' +
    moveCursor(_catLine + 2, 1) + CLEAR_LINE + col + bottom + RESET +
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
  process.stdout.write(msg + '\n');
  _outputLine++;
  process.stdout.write(RESTORE_CURSOR);
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
    { text: '',                                                                               charDelay: 0 },
    { text: '      _   _  __   __  _  _  ',                                                  charDelay: 4 },
    { text: '     | \\ | | \\ \\ / / \\ \\/ / ',                                           charDelay: 4 },
    { text: '     |  \\| |  \\ V /   >  <  ',                                               charDelay: 4 },
    { text: '     | |\\  |   | |   / /\\ \\ ',                                              charDelay: 4 },
    { text: '     |_| \\_|   |_|  /_/  \\_\\',                                              charDelay: 4 },
    { text: '',                                                                               charDelay: 0 },
    { text: '  ____  _________ __________  ____  ____ ',                                     charDelay: 3 },
    { text: ' / __ \\/  _/ ___// ____/ __ \\/ __ \\/ __ \\',                               charDelay: 3 },
    { text: '/ / / // / \\__ \\/ /   / / / / /_/ / / / /',                                 charDelay: 3 },
    { text: '/_____/___//____/\\____/\\____/_/ |_/_____/  ',                                charDelay: 3 },
    { text: '',                                                                               charDelay: 0 },
    { text: '        ____  _____ _____   ________',                                          charDelay: 3 },
    { text: '       / __ \\/ ___//  _/ | / /_  __/',                                        charDelay: 3 },
    { text: '      / / / /\\__ \\ / //  |/ / / /   ',                                       charDelay: 3 },
    { text: '     / /_/ /___/ // // /|  / / /    ',                                         charDelay: 3 },
    { text: '     \\____//____/___/_/ |_/ /_/    v2.0                  -By Cupcake',         charDelay: 3 },
    { text: '',                                                                               charDelay: 0 },
  ];

  for (const { text, charDelay } of bannerLines) {
    if (text === '') {
      _outputLine++;
      await delay(40);
    } else {
      await typeLine(text, { charDelay });
    }
  }

  await glitchType('~ sniffing discord', { charDelay: 4, glitches: 4 });
  lockCatBelowBanner();
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

  const token = await new Promise((resolve) => {
    process.stdout.write(SAVE_CURSOR);
    process.stdout.write(moveCursor(_outputLine, 1));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  » Input |Token| for servers : ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  clearInterval(rotateIv);
  process.stdout.write(RESTORE_CURSOR);
  statusSet('initializing...');
  return token;
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
  printResults,
  catTypeLine,
  typeLine,
  glitchType,
  getOutputLine,
  setOutputLine,
  setCatMood,
  delay,
};