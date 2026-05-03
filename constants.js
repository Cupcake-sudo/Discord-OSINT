const HAS_FILTERS        = ['image', 'video', 'file', 'embed', 'sticker', 'sound'];
const SYSTEM_TZ          = Intl.DateTimeFormat().resolvedOptions().timeZone;
const SEARCH_DELAY_MS    = 1500;
const RATE_LIMIT_WAIT_MS = 150000;
const PAGE_SIZE          = 25;

const HIDE_CURSOR    = '\x1b[?25l';
const SHOW_CURSOR    = '\x1b[?25h';
const CLEAR_LINE     = '\r\x1b[2K';
const SAVE_CURSOR    = '\x1b[s';
const RESTORE_CURSOR = '\x1b[u';
const RESET          = '\x1b[0m';

const CAT_FACES = {
  idle:    ['(=^ OwO  ^=)', '(=^ ◕ω◕ ^=)', '(=^ ✧ω✧ ^=)', '(=^ ≧◡≦ ^=)'],
  hunting: ['(=^ ⊙ω⊙ ^=)', '(=^ ◈ω◈ ^=)', '(=^ ◉ω◉ ^=)', '(=^ ✧ω✧ ^=)'],
  eating:  ['(=^ >ω< ^=)', '(=^ ꒰꒱ ^=)', '(=^ ᗒᗨᗕ ^=)', '(=^ NOM  ^=)'],
  sad:     ['(=^ ;ω; ^=)', '(=^ T_T ^=)', '(=^ ╥ω╥ ^=)', '(=^ u_u ^=)'],
  sleepy:  ['(=^ -ω- ^=)', '(=^ ˘ω˘ ^=)', '(=^ ᴖωᴖ ^=)', '(=^ zzZ  ^=)'],
  happy:   ['(=^ ≧ω≦ ^=)', '(=^ ^ω^ ^=)', '(=^ ᵔωᵔ ^=)', '(=^ ♡ω♡ ^=)'],
};
const CAT_FRAMES = CAT_FACES.idle;

const BANNER_COLOURS = [
  '\x1b[38;5;99m',
  '\x1b[38;5;105m',
  '\x1b[38;5;111m',
  '\x1b[38;5;117m',
  '\x1b[38;5;123m',
  '\x1b[38;5;117m',
  '\x1b[38;5;111m',
  '\x1b[38;5;105m',
  '\x1b[38;5;99m',
  '\x1b[38;5;93m',
  '\x1b[38;5;99m',
  '\x1b[38;5;105m',
];

const GLITCH_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&';

const EXT_BUCKETS = {
  img:   ['jpg','jpeg','png','webp','heic','heif','bmp','tiff','tif','avif'],
  gif:   ['gif'],
  vid:   ['mp4','mov','avi','mkv','webm','m4v','wmv','flv','3gp'],
  audio: ['mp3','ogg','wav','m4a','flac','aac','opus'],
  doc:   ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip','rar','7z'],
};

const m = module.exports;

m.HAS_FILTERS        = HAS_FILTERS;
m.SYSTEM_TZ          = SYSTEM_TZ;
m.SEARCH_DELAY_MS    = SEARCH_DELAY_MS;
m.RATE_LIMIT_WAIT_MS = RATE_LIMIT_WAIT_MS;
m.PAGE_SIZE          = PAGE_SIZE;
m.HIDE_CURSOR        = HIDE_CURSOR;
m.SHOW_CURSOR        = SHOW_CURSOR;
m.CLEAR_LINE         = CLEAR_LINE;
m.SAVE_CURSOR        = SAVE_CURSOR;
m.RESTORE_CURSOR     = RESTORE_CURSOR;
m.RESET              = RESET;
m.CAT_FACES          = CAT_FACES;
m.CAT_FRAMES         = CAT_FRAMES;
m.BANNER_COLOURS     = BANNER_COLOURS;
m.GLITCH_CHARS       = GLITCH_CHARS;
m.EXT_BUCKETS        = EXT_BUCKETS;

m.TARGET_USER_ID    = null;
m.MODE_ALL          = false;
m.MODE_MESSAGES     = false;
m.MODE_FILES        = false;
m.MODE_MENTION      = false;
m.MODE_HEATMAP      = false;
m.DOWNLOAD_FILES    = false;
m.SAVE_MESSAGES     = false;
m.FILES_ONLY_MODE   = false;
m.MENTION_ONLY_MODE = false;

m.configure = function (opts) {
  const MODE_ALL      = !!opts.MODE_ALL;
  const MODE_MESSAGES = !!opts.MODE_MESSAGES;
  const MODE_FILES    = !!opts.MODE_FILES;
  const MODE_MENTION  = !!opts.MODE_MENTION;
  const MODE_HEATMAP  = !!opts.MODE_HEATMAP && !MODE_MENTION;

  m.TARGET_USER_ID    = opts.TARGET_USER_ID || null;
  m.MODE_ALL          = MODE_ALL;
  m.MODE_MESSAGES     = MODE_MESSAGES;
  m.MODE_FILES        = MODE_FILES;
  m.MODE_MENTION      = MODE_MENTION;
  m.MODE_HEATMAP      = MODE_HEATMAP;
  m.DOWNLOAD_FILES    = MODE_ALL || MODE_FILES;
  m.SAVE_MESSAGES     = MODE_ALL || MODE_MESSAGES || (!MODE_MESSAGES && !MODE_FILES && !MODE_MENTION);
  m.FILES_ONLY_MODE   = MODE_FILES   && !MODE_ALL && !MODE_MESSAGES && !MODE_MENTION;
  m.MENTION_ONLY_MODE = MODE_MENTION && !MODE_ALL && !MODE_MESSAGES && !MODE_FILES;
};