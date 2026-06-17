/* game_touchtyping.js
   Typing Trainer v2 (Duolingo-like Learning Path + Free Mode)
   Built on the existing "falling bubbles" mechanic; refactored for modes + testability.

   Assumptions (explicit):
   - Keyboard input is limited to A–Z (existing code filtered this way). Therefore we avoid ';' in home-row.
   - Levels are loaded from ./levels.json via fetch when possible; if fetch fails (e.g., file://), a built-in fallback is used.
*/

'use strict';

// =========================
// DOM ELEMENTS
// =========================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const progressBar = document.getElementById('progress-bar');

const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('playBtn');
const subtitleEl = document.getElementById('subtitle');

const overlay = document.getElementById('overlay');
const finalText = document.getElementById('finalText');
const restartBtn = document.getElementById('restart-btn');

const levelCanvas = document.getElementById('f');
const lctx = levelCanvas.getContext('2d');

// NEW UI (injected from HTML)
const modeLearnBtn = document.getElementById('modeLearnBtn');
const modeFreeBtn = document.getElementById('modeFreeBtn');
const levelListEl = document.getElementById('levelList');
const backToMenuBtn = document.getElementById('backToMenuBtn');

// Feedback overlay (learning-mode results)
const feedbackOverlay = document.getElementById('feedback-overlay');
const fbTitle = document.getElementById('fb-title');
const fbSubtitle = document.getElementById('fb-subtitle');
const fbCriteria = document.getElementById('fb-criteria');
const fbTip = document.getElementById('fb-tip');
const fbRetryBtn = document.getElementById('fb-retry');
const fbNextBtn = document.getElementById('fb-next');
const fbMenuBtn = document.getElementById('fb-menu');

// Optional hint
const hintEl = document.getElementById('hint');

// =========================
// CANVAS SIZING
// =========================
function resize() {
  canvas.width = Math.floor(window.innerWidth);
  canvas.height = Math.floor(window.innerHeight);
  levelCanvas.width = canvas.width;
  levelCanvas.height = canvas.height;
}
window.addEventListener('resize', resize);
resize();

// =========================
// AUDIO (kept from existing project, simplified calls)
// =========================
let audioContext = null;
function getAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      audioContext = null;
    }
  }
  return audioContext;
}

function safePlay(fn) {
  try { fn(); } catch (e) {}
}

function playSmallClick() {
  safePlay(() => {
    const ac = getAudioContext();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    const now = ac.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(720, now);
    o.frequency.exponentialRampToValueAtTime(520, now + 0.06);
    g.gain.setValueAtTime(0.035, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    o.connect(g);
    g.connect(ac.destination);
    o.start(now);
    o.stop(now + 0.08);
  });
}

// Kept: ASMR-ish pop (short + soft)
function playASMRPop(volume = 0.12) {
  safePlay(() => {
    const ac = getAudioContext();
    if (!ac) return;
    const now = ac.currentTime;

    // tonal body
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, now);
    o.frequency.exponentialRampToValueAtTime(80, now + 0.10);
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o.connect(g);
    g.connect(ac.destination);
    o.start(now);
    o.stop(now + 0.13);

    // noise click
    const bufferSize = 2 * ac.sampleRate;
    const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1);
    const noise = ac.createBufferSource();
    noise.buffer = noiseBuffer;

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 6;

    const ng = ac.createGain();
    ng.gain.setValueAtTime(volume * 0.55, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    noise.connect(bp);
    bp.connect(ng);
    ng.connect(ac.destination);
    noise.start(now);
    noise.stop(now + 0.04);
  });
}

function playLevelUpSound() {
  safePlay(() => {
    const ac = getAudioContext();
    if (!ac) return;
    const now = ac.currentTime;
    const freqs = [720, 980];
    freqs.forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, now + i * 0.06);
      g.gain.setValueAtTime(0.05, now + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.18);
      o.connect(g);
      g.connect(ac.destination);
      o.start(now + i * 0.06);
      o.stop(now + i * 0.06 + 0.2);
    });
  });
}

function playGameOverSound() {
  safePlay(() => {
    const ac = getAudioContext();
    if (!ac) return;
    const now = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(240, now);
    o.frequency.exponentialRampToValueAtTime(80, now + 0.8);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    o.connect(g);
    g.connect(ac.destination);
    o.start(now);
    o.stop(now + 0.9);
  });
}

// =========================
// UTIL
// =========================
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function roundRectPath(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function hexWithAlpha(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Colorful tile palettes: dark navy base + vibrant accent per tile
const TILE_PALETTES = [
  { fill: '#0d1b4e', stroke: '#4facfe', glow: 'rgba(79,172,254,0.5)',  text: '#bfdbfe' },
  { fill: '#1a0e3a', stroke: '#a78bfa', glow: 'rgba(167,139,250,0.5)', text: '#ddd6fe' },
  { fill: '#062a1e', stroke: '#06ffa5', glow: 'rgba(6,255,165,0.45)',  text: '#a7f3d0' },
  { fill: '#2a0d0d', stroke: '#ff6b6b', glow: 'rgba(255,107,107,0.45)',text: '#fecaca' },
  { fill: '#2a1800', stroke: '#fbbf24', glow: 'rgba(251,191,36,0.45)', text: '#fde68a' },
];

// =========================
// LEVEL MODEL + LOADER
// =========================
/**
 * LevelDefinition schema (JSON):
 * {
 *   "id": "L1_HOME_ROW",
 *   "title": "Home Row Basics",
 *   "intro": "Short intro shown before exercise",
 *   "allowedLetters": ["A","S","D","F","J","K","L"],
 *   "exercise": { "type": "letters", "minLen": 1, "maxLen": 1 },
 *   "rules": {
 *      "durationSeconds": 60,
 *      "minKeystrokes": 120,
 *      "minAccuracy": 0.9
 *   },
 *   "difficulty": { "spawnRate": 0.012, "speed": 1.0 },
 *   "lives": 3
 * }
 */
const LEVELS_URL = 'levels.json';
// Mirrors levels.json so the full curriculum also works under file:// (where fetch is blocked).
const HOME9 = ['A','S','D','F','G','H','J','K','L'];
const HOME7 = ['A','S','D','F','J','K','L'];
const OBEN1 = ['A','S','D','F','G','H','J','K','L','E','I','R','U'];
const OBEN2 = ['A','S','D','F','G','H','J','K','L','E','I','R','U','T','Z','W','O','Q','P'];
const TOP_HOME = ['Q','W','E','R','T','Z','U','I','O','P','A','S','D','F','G','H','J','K','L'];
const UNTEN1 = TOP_HOME.concat(['C','M','V','N']);
const UNTEN2 = TOP_HOME.concat(['C','M','V','N','B','X','Y']);
const ALL26 = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

// Duolingo-style curriculum: lessons (Lektionen) each containing several levels.
const FALLBACK_LESSONS = [
  { id:'LE1_GRUNDSTELLUNG', title:'Grundstellung', subtitle:'Die Heimatreihe deiner Finger', color:'#4facfe', levels:[
    { id:'L1_1', title:'Zeigefinger: F J', intro:'Lege die Zeigefinger auf F und J – an den kleinen Erhebungen findest du blind zurück.', allowedLetters:['F','J'], exercise:{type:'letters',minLen:1,maxLen:1}, rules:{durationSeconds:25,minKeystrokes:35,minAccuracy:0.90}, difficulty:{spawnRate:0.010,speed:0.85}, lives:3 },
    { id:'L1_2', title:'Mittelfinger: D K', intro:'Die Mittelfinger kommen dazu: D und K. Finger ruhen auf der Grundreihe.', allowedLetters:['F','J','D','K'], exercise:{type:'letters',minLen:1,maxLen:1}, rules:{durationSeconds:25,minKeystrokes:40,minAccuracy:0.90}, difficulty:{spawnRate:0.011,speed:0.88}, lives:3 },
    { id:'L1_3', title:'Ringfinger: S L', intro:'Die Ringfinger: S und L. Nur den Finger bewegen, nicht die Hand.', allowedLetters:['S','D','F','J','K','L'], exercise:{type:'letters',minLen:1,maxLen:1}, rules:{durationSeconds:28,minKeystrokes:45,minAccuracy:0.90}, difficulty:{spawnRate:0.011,speed:0.90}, lives:3 },
    { id:'L1_4', title:'Kleiner Finger: A', intro:'Der kleine Finger der linken Hand: A. Damit liegen alle Anker.', allowedLetters:HOME7, exercise:{type:'letters',minLen:1,maxLen:1}, rules:{durationSeconds:28,minKeystrokes:50,minAccuracy:0.90}, difficulty:{spawnRate:0.011,speed:0.92}, lives:3 },
    { id:'L1_5', title:'Grundreihe-Mix', intro:'Erste Kombinationen aus der Grundreihe. Gleichmäßig statt schnell.', allowedLetters:HOME7, exercise:{type:'letters',minLen:2,maxLen:3}, rules:{durationSeconds:35,minKeystrokes:70,minAccuracy:0.88}, difficulty:{spawnRate:0.011,speed:1.0}, lives:3 }
  ]},
  { id:'LE2_GRUNDREIHE', title:'Grundreihe komplett', subtitle:'G, H und erste Kombinationen', color:'#06ffa5', levels:[
    { id:'L2_1', title:'Mitte: G H', intro:'Die Zeigefinger strecken sich zur Mitte: G und H. Danach zurück zur Grundstellung.', allowedLetters:HOME9, exercise:{type:'letters',minLen:1,maxLen:1}, rules:{durationSeconds:28,minKeystrokes:50,minAccuracy:0.89}, difficulty:{spawnRate:0.012,speed:0.95}, lives:3 },
    { id:'L2_2', title:'Kurze Kombis', intro:'Zwei-Buchstaben-Folgen aus der kompletten Grundreihe.', allowedLetters:HOME9, exercise:{type:'letters',minLen:2,maxLen:2}, rules:{durationSeconds:32,minKeystrokes:65,minAccuracy:0.88}, difficulty:{spawnRate:0.012,speed:1.0}, lives:3 },
    { id:'L2_3', title:'Längere Folgen', intro:'Längere Sequenzen für mehr Routine in den Fingern.', allowedLetters:HOME9, exercise:{type:'letters',minLen:2,maxLen:4}, rules:{durationSeconds:38,minKeystrokes:80,minAccuracy:0.87}, difficulty:{spawnRate:0.012,speed:1.05}, lives:3 },
    { id:'L2_4', title:'Grundreihe-Wörter', intro:'Echte Wörter nur aus der Grundreihe. Tippe sie als Einheit.', allowedLetters:HOME9, exercise:{type:'words',words:['DAS','FALL','HALL','GLAS','HALS','SAAL','GAS','LAG','SAG','HAG']}, rules:{durationSeconds:40,minKeystrokes:80,minAccuracy:0.87}, difficulty:{spawnRate:0.011,speed:1.0}, lives:3 }
  ]},
  { id:'LE3_OBEN_I', title:'Obere Reihe I', subtitle:'E I R U – Mittel- und Zeigefinger hoch', color:'#a78bfa', levels:[
    { id:'L3_1', title:'Mittelfinger hoch: E I', intro:'Obere Reihe, Mittelfinger nach oben: E (links) und I (rechts).', allowedLetters:['A','S','D','F','G','H','J','K','L','E','I'], exercise:{type:'letters',minLen:1,maxLen:2}, rules:{durationSeconds:30,minKeystrokes:55,minAccuracy:0.88}, difficulty:{spawnRate:0.012,speed:1.0}, lives:3 },
    { id:'L3_2', title:'Zeigefinger hoch: R U', intro:'Zeigefinger nach oben: R und U. Achte auf die schräge Bewegung.', allowedLetters:OBEN1, exercise:{type:'letters',minLen:1,maxLen:2}, rules:{durationSeconds:30,minKeystrokes:60,minAccuracy:0.88}, difficulty:{spawnRate:0.012,speed:1.05}, lives:3 },
    { id:'L3_3', title:'EIRU im Mix', intro:'Grundreihe und neue Buchstaben gemischt.', allowedLetters:OBEN1, exercise:{type:'letters',minLen:2,maxLen:3}, rules:{durationSeconds:36,minKeystrokes:75,minAccuracy:0.87}, difficulty:{spawnRate:0.013,speed:1.10}, lives:3 },
    { id:'L3_4', title:'Erste Wörter', intro:'Deine ersten echten Wörter mit E, I, R, U.', allowedLetters:OBEN1, exercise:{type:'words',words:['DIE','DER','DREI','FREI','HIER','RUF','REIS','LEER','EILE','REIHE','FEIER','RUHE']}, rules:{durationSeconds:40,minKeystrokes:80,minAccuracy:0.86}, difficulty:{spawnRate:0.012,speed:1.05}, lives:3 }
  ]},
  { id:'LE4_OBEN_II', title:'Obere Reihe II', subtitle:'T Z W O Q P – obere Reihe komplett', color:'#f472b6', levels:[
    { id:'L4_1', title:'T Z', intro:'Zeigefinger-Dehnung nach oben innen: T und Z.', allowedLetters:['A','S','D','F','G','H','J','K','L','E','I','R','U','T','Z'], exercise:{type:'letters',minLen:1,maxLen:2}, rules:{durationSeconds:30,minKeystrokes:60,minAccuracy:0.87}, difficulty:{spawnRate:0.013,speed:1.10}, lives:3 },
    { id:'L4_2', title:'W O', intro:'Ringfinger nach oben: W und O.', allowedLetters:['A','S','D','F','G','H','J','K','L','E','I','R','U','T','Z','W','O'], exercise:{type:'letters',minLen:1,maxLen:2}, rules:{durationSeconds:30,minKeystrokes:60,minAccuracy:0.87}, difficulty:{spawnRate:0.013,speed:1.10}, lives:3 },
    { id:'L4_3', title:'Q P', intro:'Kleine Finger nach oben: Q und P.', allowedLetters:OBEN2, exercise:{type:'letters',minLen:1,maxLen:3}, rules:{durationSeconds:32,minKeystrokes:65,minAccuracy:0.86}, difficulty:{spawnRate:0.013,speed:1.10}, lives:3 },
    { id:'L4_4', title:'Obere Reihe komplett', intro:'Die gesamte obere Reihe im Zusammenspiel mit der Grundreihe.', allowedLetters:TOP_HOME, exercise:{type:'letters',minLen:2,maxLen:4}, rules:{durationSeconds:40,minKeystrokes:90,minAccuracy:0.86}, difficulty:{spawnRate:0.013,speed:1.20}, lives:3 }
  ]},
  { id:'LE5_UNTEN_I', title:'Untere Reihe I', subtitle:'C M V N – Finger nach unten', color:'#fbbf24', levels:[
    { id:'L5_1', title:'C M', intro:'Untere Reihe, Mittelfinger nach unten: C und M.', allowedLetters:TOP_HOME.concat(['C','M']), exercise:{type:'letters',minLen:1,maxLen:2}, rules:{durationSeconds:30,minKeystrokes:60,minAccuracy:0.87}, difficulty:{spawnRate:0.013,speed:1.10}, lives:3 },
    { id:'L5_2', title:'V N', intro:'Zeigefinger nach unten: V und N.', allowedLetters:UNTEN1, exercise:{type:'letters',minLen:1,maxLen:2}, rules:{durationSeconds:30,minKeystrokes:65,minAccuracy:0.87}, difficulty:{spawnRate:0.013,speed:1.15}, lives:3 },
    { id:'L5_3', title:'Untere Reihe im Mix', intro:'Neue untere Buchstaben gemischt mit dem Rest.', allowedLetters:UNTEN1, exercise:{type:'letters',minLen:2,maxLen:3}, rules:{durationSeconds:36,minKeystrokes:75,minAccuracy:0.86}, difficulty:{spawnRate:0.014,speed:1.15}, lives:3 },
    { id:'L5_4', title:'Wörter', intro:'Wörter mit M, N, V und C.', allowedLetters:UNTEN1, exercise:{type:'words',words:['MEIN','NEIN','NAME','MANN','KOMM','WIND','MOND','WEIN','NEUN','MINE','KANN','DENN','WANN']}, rules:{durationSeconds:40,minKeystrokes:85,minAccuracy:0.85}, difficulty:{spawnRate:0.013,speed:1.10}, lives:3 }
  ]},
  { id:'LE6_UNTEN_II', title:'Untere Reihe II', subtitle:'B X Y – untere Reihe komplett', color:'#fb923c', levels:[
    { id:'L6_1', title:'B', intro:'Zeigefinger-Dehnung nach unten: B.', allowedLetters:TOP_HOME.concat(['C','M','V','N','B']), exercise:{type:'letters',minLen:1,maxLen:3}, rules:{durationSeconds:30,minKeystrokes:60,minAccuracy:0.86}, difficulty:{spawnRate:0.014,speed:1.15}, lives:3 },
    { id:'L6_2', title:'X Y', intro:'Ring- und kleiner Finger nach unten: X und Y.', allowedLetters:UNTEN2, exercise:{type:'letters',minLen:1,maxLen:3}, rules:{durationSeconds:30,minKeystrokes:60,minAccuracy:0.86}, difficulty:{spawnRate:0.014,speed:1.20}, lives:3 },
    { id:'L6_3', title:'Untere Reihe komplett', intro:'Die komplette untere Reihe Y X C V B N M mit der Grundstellung.', allowedLetters:['Y','X','C','V','B','N','M','A','S','D','F','G','H','J','K','L'], exercise:{type:'letters',minLen:2,maxLen:3}, rules:{durationSeconds:38,minKeystrokes:80,minAccuracy:0.86}, difficulty:{spawnRate:0.014,speed:1.20}, lives:3 },
    { id:'L6_4', title:'Alles gemischt', intro:'Erstmals alle drei Reihen zusammen.', allowedLetters:ALL26, exercise:{type:'letters',minLen:2,maxLen:4}, rules:{durationSeconds:42,minKeystrokes:95,minAccuracy:0.85}, difficulty:{spawnRate:0.014,speed:1.25}, lives:3 }
  ]},
  { id:'LE7_ALPHABET', title:'Das ganze Alphabet', subtitle:'Alle Buchstaben im Zusammenspiel', color:'#22d3ee', levels:[
    { id:'L7_1', title:'Alphabet kurz', intro:'Alle Buchstaben in kurzen, zufälligen Folgen.', allowedLetters:ALL26, exercise:{type:'letters',minLen:2,maxLen:3}, rules:{durationSeconds:40,minKeystrokes:90,minAccuracy:0.85}, difficulty:{spawnRate:0.014,speed:1.25}, lives:3 },
    { id:'L7_2', title:'Bigramme', intro:'Häufige Buchstabenpaare wie EN, ER, CH – die Bausteine echter Wörter.', allowedLetters:ALL26, exercise:{type:'words',words:['EN','ER','CH','DE','IE','ND','TE','EI','IN','ES','UN','ST','GE','BE','SE','RE','AN','DA','IS','CK']}, rules:{durationSeconds:40,minKeystrokes:90,minAccuracy:0.86}, difficulty:{spawnRate:0.012,speed:1.15}, lives:3 },
    { id:'L7_3', title:'Alphabet flott', intro:'Einzelne Buchstaben, aber schneller und dichter.', allowedLetters:ALL26, exercise:{type:'letters',minLen:1,maxLen:2}, rules:{durationSeconds:40,minKeystrokes:110,minAccuracy:0.86}, difficulty:{spawnRate:0.016,speed:1.35}, lives:3 },
    { id:'L7_4', title:'Alphabet-Challenge', intro:'Längere Folgen bei höherem Tempo.', allowedLetters:ALL26, exercise:{type:'letters',minLen:2,maxLen:4}, rules:{durationSeconds:45,minKeystrokes:110,minAccuracy:0.85}, difficulty:{spawnRate:0.015,speed:1.35}, lives:3 }
  ]},
  { id:'LE8_WOERTER', title:'Wörter & Tempo', subtitle:'Echte Wörter und Geschwindigkeit', color:'#ff6b6b', levels:[
    { id:'L8_1', title:'Kurze Wörter', intro:'Kurze, häufige Wörter. Tippe sie als Einheit, nicht Buchstabe für Buchstabe.', allowedLetters:ALL26, exercise:{type:'words',words:['UND','DER','DIE','DAS','IST','EIN','MIT','ICH','DEN','VON','BEI','AUS','NUR','WIR','HAT','WAR','WIE','WAS','HER','MAN','DOCH','AUCH','NOCH','DANN']}, rules:{durationSeconds:45,minKeystrokes:100,minAccuracy:0.86}, difficulty:{spawnRate:0.011,speed:1.10}, lives:3 },
    { id:'L8_2', title:'Mittlere Wörter', intro:'Mittellange Wörter. Achte auf gleichmäßigen Rhythmus über das ganze Wort.', allowedLetters:ALL26, exercise:{type:'words',words:['HAUS','BAUM','HAND','KIND','BUCH','BLUME','SONNE','TISCH','STUHL','WASSER','GARTEN','FENSTER','MORGEN','ABEND','LICHT','WELT','ZEIT','JAHR','SPIEL','KATZE','HUND','VOGEL','STRAND','WOLKE']}, rules:{durationSeconds:50,minKeystrokes:110,minAccuracy:0.85}, difficulty:{spawnRate:0.010,speed:1.05}, lives:4 },
    { id:'L8_3', title:'Lange Wörter', intro:'Lange Wörter als Herausforderung. Ruhig bleiben und sauber zu Ende tippen.', allowedLetters:ALL26, exercise:{type:'words',words:['COMPUTER','TASTATUR','PROGRAMM','FREUNDE','SCHULE','ARBEIT','FAMILIE','WETTER','STRASSE','BAHNHOF','KUCHEN','SOMMER','WINTER','FRUEHLING','HERBST','URLAUB','NATUR','MASCHINE','GESCHENK','FREIHEIT','GEDANKE','ZUKUNFT']}, rules:{durationSeconds:55,minKeystrokes:120,minAccuracy:0.85}, difficulty:{spawnRate:0.009,speed:1.0}, lives:4 },
    { id:'L8_4', title:'Speed-Finale', intro:'Geschwindigkeits-Finale: alle Buchstaben, schnelle Anschläge, 5 Leben. Zeig, was du kannst!', allowedLetters:ALL26, exercise:{type:'letters',minLen:1,maxLen:2}, rules:{durationSeconds:55,minKeystrokes:170,minAccuracy:0.88}, difficulty:{spawnRate:0.018,speed:1.50}, lives:5 }
  ]}
];

// Accepts either the new {lessons:[...]} shape or the legacy {levels:[...]} shape
// and always returns a normalized lessons array.
function normalizeLessons(json) {
  if (json && Array.isArray(json.lessons) && json.lessons.length) {
    return json.lessons;
  }
  if (json && Array.isArray(json.levels) && json.levels.length) {
    // Wrap a flat legacy level list into a single lesson.
    return [{ id:'LEGACY', title:'Lernpfad', subtitle:'', color:'#4facfe', levels: json.levels }];
  }
  throw new Error('levels.json missing lessons[]/levels[]');
}

async function loadLessons() {
  try {
    const res = await fetch(LEVELS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('levels.json not ok');
    const json = await res.json();
    return normalizeLessons(json);
  } catch (e) {
    // Fallback keeps app working even in file:// usage.
    return FALLBACK_LESSONS;
  }
}

// =========================
// PROGRESS STORAGE
// =========================
const PROGRESS_KEY = 'tt_progress_v3';
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { unlockedIndex: 0 };
    const v = JSON.parse(raw);
    return { unlockedIndex: Math.max(0, v.unlockedIndex | 0) };
  } catch {
    return { unlockedIndex: 0 };
  }
}
function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {}
}

// =========================
// WORD/SEQUENCE GENERATOR
// =========================
class SequenceGenerator {
  constructor() {
    this.words = [
      // existing WORDS list is not guaranteed; keep a minimal safe list
      'AS', 'DF', 'JK', 'LA', 'KJ', 'SD', 'FJ', 'KL'
    ];
  }

  /**
   * Generates a sequence using allowedLetters.
   * For testability this is deterministic given Math.random; can be injected if needed.
   */
  generate(allowedLetters, minLen, maxLen) {
    const len = clamp(minLen + Math.floor(Math.random() * (maxLen - minLen + 1)), minLen, maxLen);
    let s = '';
    for (let i = 0; i < len; i++) {
      const ch = allowedLetters[Math.floor(Math.random() * allowedLetters.length)];
      s += ch;
    }
    return s;
  }
}

// =========================
// PARTICLES (kept small; not distracting)
// =========================
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  burst(x, y, color) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 2.2;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 28 + Math.floor(Math.random() * 18),
        color
      });
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.vy += 0.03;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(c) {
    for (const p of this.particles) {
      c.globalAlpha = clamp(p.life / 40, 0, 1);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, 2.0, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  clear() { this.particles.length = 0; }
}

// =========================
// CORE GAME ENGINE (shared by Free Mode and Learning Levels)
// =========================
class FallingBubbleEngine {
  constructor({ ctx, canvas, particleSystem }) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.particles = particleSystem;

    this.objects = [];
    this.running = false;
    this.gameOver = false;
    this.gameOverReason = null;

    this.isTransition = false;

    this.flashTimer = 0;

    // Stats (per session)
    this.totalScore = 0;
    this.level = 1;

    this.levelProgress = 0;
    this.levelTarget = 20;

    this.lives = 3;
    this.maxLives = 3;

    this.speed = 1.0;

    // injected behavior
    this.getSpawnRate = () => 0.01;
    this.getNextText = () => 'A';

    // callbacks
    this.onGameOver = () => {};
    this.onLevelUp = () => {};
    this.onStatsChanged = () => {};
    this.onCheckpoint = () => {};

    // accuracy tracking
    this.correctKeystrokes = 0;
    this.totalKeystrokes = 0;

    // rendering config
    this.fontFamily = "'Space Grotesk', system-ui, sans-serif";
    this.fontSize = 20;
    this.tileHeight = 52;
    this.tilePadding = 22;
  }

  resetSession({ maxLives, speed, levelTarget }) {
    this.objects = [];
    this.particles.clear();

    this.running = false;
    this.gameOver = false;
    this.gameOverReason = null;
    this.isTransition = false;

    this.flashTimer = 0;

    this.totalScore = 0;
    this.level = 1;

    this.levelProgress = 0;
    this.levelTarget = levelTarget;

    this.maxLives = maxLives;
    this.lives = maxLives;

    this.speed = speed;

    this.correctKeystrokes = 0;
    this.totalKeystrokes = 0;

    this.onStatsChanged();
  }

  beginTransition() {
    this.isTransition = true;
    // hide letters entirely (not just dim)
    this.canvas.style.visibility = 'hidden';
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  endTransition() {
    this.canvas.style.visibility = 'visible';
    this.isTransition = false;
  }

  start() {
    this.running = true;
    this.gameOver = false;
    requestAnimationFrame((t) => this._updateLoop(t));
  }

  stop() { this.running = false; }

  triggerGameOver(reason = 'fell') {
    this.gameOver = true;
    this.gameOverReason = reason;
    this.running = false;
    this.onGameOver();
  }

  // bubble factory
  _createBubble(text) {
    const c = this.ctx;
    c.save();
    c.font = `${this.fontSize}px ${this.fontFamily}`;
    const textW = c.measureText(text).width;
    c.restore();

    const baseW = Math.max(70, textW + this.tilePadding * 2);
    const w = baseW * (0.95 + Math.random() * 0.12);
    const h = this.tileHeight + (Math.random() - 0.5) * 6;
    const rotation = (Math.random() - 0.5) * 0.07;

    let x = 0, ok = false;
    const margin = 12;
    for (let attempt = 0; attempt < 80; attempt++) {
      x = Math.random() * (this.canvas.width - margin * 2) + margin;
      ok = true;
      for (const o of this.objects) {
        if (Math.abs(o.x - x) < (o.width + w) * 0.35) { ok = false; break; }
      }
      if (ok) break;
    }

    const y = -h - 10;

    const palette = TILE_PALETTES[Math.floor(Math.random() * TILE_PALETTES.length)];

    return {
      x, y, width: w, height: h, rotation,
      text,
      progress: 0,
      palette
    };
  }

  _drawBubble(b) {
    const c = this.ctx;
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.rotation);

    const w = b.width;
    const h = b.height;
    const radius = Math.min(14, w * 0.18, h * 0.38);
    const pal = b.palette;

    // glow stroke (drawn first, behind the fill)
    c.shadowColor = pal.glow;
    c.shadowBlur = 18;
    c.strokeStyle = pal.stroke;
    c.lineWidth = 1.5;
    roundRectPath(c, -w / 2, -h / 2, w, h, radius);
    c.stroke();
    c.shadowBlur = 0;

    // tile body
    c.fillStyle = pal.fill;
    roundRectPath(c, -w / 2, -h / 2, w, h, radius);
    c.fill();

    // border
    c.strokeStyle = pal.stroke;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.5;
    roundRectPath(c, -w / 2, -h / 2, w, h, radius);
    c.stroke();
    c.globalAlpha = 1;

    // subtle top-edge highlight
    const hl = c.createLinearGradient(0, -h / 2, 0, 0);
    hl.addColorStop(0, 'rgba(255,255,255,0.07)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hl;
    roundRectPath(c, -w / 2, -h / 2, w, h, radius);
    c.fill();

    // text
    c.font = `700 ${this.fontSize}px ${this.fontFamily}`;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.shadowBlur = 0;

    const full = b.text;
    const totalW = c.measureText(full).width;
    let tx = -totalW / 2;
    let cursorX = tx;

    for (let i = 0; i < full.length; i++) {
      const ch = full[i];
      const cw = c.measureText(ch).width;

      c.fillStyle = (i < b.progress) ? 'rgba(255,255,255,0.18)' : pal.text;
      c.fillText(ch, tx, 0);

      if (i === b.progress) cursorX = tx;
      tx += cw;
    }

    // cursor underline on next char
    if (b.progress < full.length) {
      const nextW = c.measureText(full[b.progress]).width;
      c.strokeStyle = pal.stroke;
      c.lineWidth = 2;
      c.globalAlpha = 0.9;
      c.beginPath();
      c.moveTo(cursorX, this.fontSize * 0.46);
      c.lineTo(cursorX + Math.max(8, nextW), this.fontSize * 0.46);
      c.stroke();
      c.globalAlpha = 1;
    }

    c.restore();
  }

  handleKey(k) {
    if (!this.running || this.gameOver || this.isTransition) return;
    if (!/^[A-Z]$/.test(k)) return;

    this.totalKeystrokes++;

    // choose nearest bubble that expects this key (lowest y among matching)
    let hitBubble = null;
    let hitIndex = -1;

    for (let i = 0; i < this.objects.length; i++) {
      const b = this.objects[i];
      const expected = b.text[b.progress];
      if (expected === k) {
        if (!hitBubble || b.y > hitBubble.y) {
          hitBubble = b;
          hitIndex = i;
        }
      }
    }

    if (!hitBubble) {
      // wrong key => lose life, no score penalty
      this.lives = Math.max(0, this.lives - 1);
      this.flashTimer = 8;
      this.onStatsChanged();
      if (this.lives <= 0) this.triggerGameOver('lives');
      return;
    }

    // correct keystroke
    this.correctKeystrokes++;
    hitBubble.progress++;
    playSmallClick();

    if (hitBubble.progress >= hitBubble.text.length) {
      // completed bubble
      const b = hitBubble;
      this.particles.burst(b.x, b.y, b.palette.stroke);
      playASMRPop(0.13 + Math.random() * 0.06);

      this.objects.splice(hitIndex, 1);

      this.totalScore++;
      this.levelProgress++;

      this.onCheckpoint();  // mode-specific (e.g., for learning session progression)
      this.onStatsChanged();
    } else {
      this.onStatsChanged();
    }
  }

  getAccuracy() {
    if (this.totalKeystrokes <= 0) return 1;
    return this.correctKeystrokes / this.totalKeystrokes;
  }

  _updateLoop() {
    if (!this.running) return;

    // hide falling letters during transitions completely
    if (this.isTransition) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      requestAnimationFrame(() => this._updateLoop());
      return;
    }

    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // spawn
    const spawnRate = this.getSpawnRate();
    if (Math.random() < spawnRate) {
      const text = this.getNextText();
      this.objects.push(this._createBubble(text));
    }

    // update particles first (behind bubbles)
    this.particles.update();

    // move + draw bubbles
    const bottomMargin = 12;
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const b = this.objects[i];
      b.y += this.speed;

      this._drawBubble(b);

      if (b.y + b.height / 2 > this.canvas.height - bottomMargin) {
        this.triggerGameOver('fell');
        return;
      }
    }

    // particles on top
    this.particles.draw(c);

    // error flash
    if (this.flashTimer > 0) {
      c.fillStyle = 'rgba(255,0,0,0.12)';
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.flashTimer--;
    }

    requestAnimationFrame(() => this._updateLoop());
  }
}

// =========================
// TRANSITION OVERLAY (low-distraction)
// =========================
class TransitionOverlay {
  constructor({ levelCanvas, lctx }) {
    this.levelCanvas = levelCanvas;
    this.lctx = lctx;
    this.running = false;
  }

  showBadge(text, durationMs = 420, onDone) {
    if (this.running) return;
    this.running = true;

    this.levelCanvas.style.display = 'block';
    this.levelCanvas.style.zIndex = 200;
    this.levelCanvas.style.pointerEvents = 'none';

    playLevelUpSound();

    const start = performance.now();
    const step = (ts) => {
      const t = ts - start;
      const p = clamp(t / durationMs, 0, 1);

      const fadeIn = clamp(p / 0.2, 0, 1);
      const fadeOut = clamp((1 - p) / 0.25, 0, 1);
      const alpha = Math.min(fadeIn, fadeOut);

      const c = this.lctx;
      c.clearRect(0, 0, this.levelCanvas.width, this.levelCanvas.height);

      // subtle scrim
      c.fillStyle = `rgba(0,0,0,${0.10 * alpha})`;
      c.fillRect(0, 0, this.levelCanvas.width, this.levelCanvas.height);

      // centered badge
      const cx = this.levelCanvas.width / 2;
      const cy = this.levelCanvas.height / 2 - 90;
      const boxW = 240;
      const boxH = 72;

      c.save();
      c.globalAlpha = alpha;

      // badge background
      c.shadowColor = 'rgba(79,172,254,0.4)';
      c.shadowBlur = 24;
      c.fillStyle = 'rgba(13, 24, 60, 0.96)';
      roundRectPath(c, cx - boxW / 2, cy - boxH / 2, boxW, boxH, 16);
      c.fill();
      c.shadowBlur = 0;

      c.strokeStyle = 'rgba(79,172,254,0.45)';
      c.lineWidth = 1.5;
      roundRectPath(c, cx - boxW / 2, cy - boxH / 2, boxW, boxH, 16);
      c.stroke();

      c.font = "700 20px 'Space Grotesk', system-ui, sans-serif";
      c.fillStyle = '#bfdbfe';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, cx, cy);

      c.restore();

      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        c.clearRect(0, 0, this.levelCanvas.width, this.levelCanvas.height);
        this.levelCanvas.style.display = 'none';
        this.running = false;
        if (typeof onDone === 'function') onDone();
      }
    };

    requestAnimationFrame(step);
  }
}

// =========================
// MODES
// =========================
class FreeMode {
  constructor({ engine, overlay }) {
    this.engine = engine;
    this.overlay = overlay;

    // free mode progression parameters (longer levels, gentle scaling)
    this.SPAWN_BASE = 0.010;
    this.SPAWN_INC = 0.0007;
    this.LEVEL_TARGET_BASE = 20;
    this.LEVEL_TARGET_GROWTH = 8;
    this.LEVEL_TARGET_CAP = 80;

    this.maxLives = 3;

    this.generator = new SequenceGenerator();
    this.unlockedPoolByLevel = (lvl) => {
      // existing concept: unlock more letters over time
      const tier1 = 'ASDFJKL'.split('');
      const tier2 = 'GHQWERTYUIOPZXCVBNM'.split('');
      // start with home-ish, then expand; keep simple
      const p = tier1.concat(tier2.slice(0, clamp((lvl - 1) * 2, 0, tier2.length)));
      return p;
    };

    this._bindEngine();
  }

  _levelTargetFor(lvl) {
    return Math.min(this.LEVEL_TARGET_CAP, this.LEVEL_TARGET_BASE + (lvl - 1) * this.LEVEL_TARGET_GROWTH);
  }

  _bindEngine() {
    this.engine.onLevelUp = () => {};
    this.engine.onCheckpoint = () => {
      if (this.engine.levelProgress >= this.engine.levelTarget) {
        this._levelUp();
      }
    };
  }

  start() {
    const lvl = 1;
    this.engine.resetSession({ maxLives: this.maxLives, speed: 1.0, levelTarget: this._levelTargetFor(lvl) });
    this.engine.level = 1;

    // spawn behavior
    this.engine.getSpawnRate = () => {
      return this.SPAWN_BASE + clamp(this.engine.level - 1, 0, 20) * this.SPAWN_INC;
    };

    this.engine.getNextText = () => {
      const pool = this.unlockedPoolByLevel(this.engine.level);
      // In free mode: mostly single letters; occasionally short sequences
      const wordChance = clamp(0.10 + this.engine.level * 0.03, 0.10, 0.55);
      const isSeq = Math.random() < wordChance;
      if (!isSeq) return pool[Math.floor(Math.random() * pool.length)];
      return this.generator.generate(pool, 2, 4);
    };

    this.engine.start();
  }

  _levelUp() {
    this.engine.level++;
    this.engine.speed = Math.min(3.0, this.engine.speed + 0.10);
    this.engine.levelProgress = 0;
    this.engine.levelTarget = this._levelTargetFor(this.engine.level);
    this.engine.lives = this.engine.maxLives;

    this.engine.beginTransition();
    this.overlay.showBadge(`Level ${this.engine.level}`, 420, () => this.engine.endTransition());
  }
}

class LearningMode {
  constructor({ engine, overlay, levels, progress }) {
    this.engine = engine;
    this.overlay = overlay;

    this.levels = levels;
    this.progress = progress;

    this.generator = new SequenceGenerator();

    this.activeIndex = 0;
    this.activeLevel = null;

    this.startTimeMs = 0;
    this.timerId = null;

    this._bindEngine();
  }

  _bindEngine() {
    this.engine.onCheckpoint = () => {
      // Progress bar / HUD updates come via onStatsChanged, but checkpoint is useful for completion rules if needed.
      // No-op here.
    };
  }

  startLevel(index) {
    this.activeIndex = index;
    this.activeLevel = this.levels[index];

    // Intro -> short transition overlay, then start exercise
    this.engine.beginTransition();
    this.overlay.showBadge(this.activeLevel.title, 520, () => {
      this.engine.endTransition();
      this._startExercise();
    });
  }

  _startExercise() {
    const lvl = this.activeLevel;

    // per-level lives
    const maxLives = typeof lvl.lives === 'number' ? lvl.lives : 3;
    const speed = lvl.difficulty?.speed ?? 1.0;

    // progress metric in learning mode: time-based progress bar by default
    this.engine.resetSession({ maxLives, speed, levelTarget: 999999 }); // not used for leveling here
    this.engine.level = this.activeIndex + 1; // show as level number
    this.engine.lives = maxLives;

    // spawn behavior controlled by level definition
    const spawnRate = lvl.difficulty?.spawnRate ?? 0.011;
    this.engine.getSpawnRate = () => spawnRate;

    const allowed = (lvl.allowedLetters || []).map(x => String(x).toUpperCase()).filter(x => /^[A-Z]$/.test(x));
    const exercise = lvl.exercise || {};
    const minLen = exercise.minLen ?? 1;
    const maxLen = exercise.maxLen ?? 1;

    // Word-based exercises: pick from a curated list instead of random letters.
    const hasWords = (exercise.type === 'words') && Array.isArray(exercise.words) && exercise.words.length > 0;
    const words = hasWords
      ? exercise.words.map(w => String(w).toUpperCase()).filter(w => /^[A-Z]+$/.test(w))
      : [];

    this.engine.getNextText = () => {
      if (hasWords && words.length) {
        return words[Math.floor(Math.random() * words.length)];
      }
      return this.generator.generate(allowed, minLen, maxLen);
    };

    // timer / checkpoint
    this.startTimeMs = performance.now();
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => this._tickRules(), 200);

    this.engine.start();
    const focus = hasWords ? `${words.length} Wörter` : allowed.join(' ');
    this._setHint(`${lvl.title} — Fokus: ${focus}`);
  }

  _tickRules() {
    if (!this.engine.running) return;

    const lvl = this.activeLevel;
    const rules = lvl.rules || {};
    const now = performance.now();
    const elapsedSec = (now - this.startTimeMs) / 1000;

    // completion checks: duration reached AND minimum keystrokes + accuracy
    const durationOk = elapsedSec >= (rules.durationSeconds ?? 60);
    const ksOk = this.engine.totalKeystrokes >= (rules.minKeystrokes ?? 0);
    const accOk = this.engine.getAccuracy() >= (rules.minAccuracy ?? 0);

    if (durationOk && ksOk && accOk) {
      this._completeLevel(true, 'timeout');
      return;
    }

    // if duration reached but failed checks -> checkpoint/fail
    if (durationOk && !(ksOk && accOk)) {
      this._completeLevel(false, 'timeout');
      return;
    }
  }

  // Build a detailed result object comparing achieved stats vs. the level's goals.
  _buildFeedback(passed, reason) {
    const lvl = this.activeLevel;
    const rules = lvl.rules || {};

    const targetDur = rules.durationSeconds ?? 60;
    const targetKs = rules.minKeystrokes ?? 0;
    const targetAcc = rules.minAccuracy ?? 0;

    const elapsed = (performance.now() - this.startTimeMs) / 1000;
    const ks = this.engine.totalKeystrokes;
    const acc = this.engine.getAccuracy();

    // "Durchgehalten" only counts if the timer actually ran out (not aborted early).
    const survived = reason === 'timeout';
    const ksOk = ks >= targetKs;
    const accOk = acc >= targetAcc;

    const criteria = [
      {
        label: 'Durchgehalten',
        ok: survived,
        detail: survived
          ? `${Math.round(Math.min(elapsed, targetDur))} / ${targetDur}s`
          : `${Math.round(elapsed)} / ${targetDur}s`
      },
      {
        label: 'Anschläge',
        ok: ksOk,
        detail: `${ks} / ${targetKs}`
      },
      {
        label: 'Genauigkeit',
        ok: accOk,
        detail: `${Math.round(acc * 100)}% / ${Math.round(targetAcc * 100)}%`
      }
    ];

    // Choose the most helpful tip based on the primary cause of failure.
    let tip = '';
    if (passed) {
      tip = 'Sauber getippt! Das nächste Level ist freigeschaltet.';
    } else if (reason === 'lives') {
      tip = 'Du hast alle Leben verloren. Jeder Fehlanschlag kostet ein Leben – tippe lieber etwas langsamer und triff sicher, statt zu raten.';
    } else if (reason === 'fell') {
      tip = 'Eine Kachel hat den unteren Rand erreicht. Räume zuerst die am weitesten unten liegenden Kacheln ab, bevor du an neuen weitertippst.';
    } else if (!accOk && !ksOk) {
      tip = 'Tempo und Präzision haben beide nicht gereicht. Bleib im gleichmäßigen Rhythmus – lieber etwas langsamer, dafür ohne Fehler.';
    } else if (!accOk) {
      tip = `Deine Genauigkeit lag bei ${Math.round(acc * 100)}% (nötig: ${Math.round(targetAcc * 100)}%). Nimm das Tempo raus und konzentrier dich auf saubere, sichere Anschläge.`;
    } else if (!ksOk) {
      tip = `Du hast ${ks} statt ${targetKs} Anschläge geschafft. Versuch, durchgehend im Fluss zu bleiben und keine Kachel zu lange stehen zu lassen.`;
    } else {
      tip = 'Knapp daneben – probier es gleich nochmal!';
    }

    return {
      passed,
      reason,
      levelIndex: this.activeIndex,
      levelTitle: lvl.title,
      criteria,
      tip,
      isLast: this.activeIndex >= this.levels.length - 1
    };
  }

  _completeLevel(passed, reason = 'timeout') {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.engine.stop();

    const feedback = this._buildFeedback(passed, reason);

    // Unlock the next level immediately on success so progress is saved
    // regardless of which button the player presses next.
    if (passed && this.activeIndex >= this.progress.unlockedIndex) {
      this.progress.unlockedIndex = this.activeIndex + 1;
      saveProgress(this.progress);
    }

    if (passed) playLevelUpSound(); else playGameOverSound();

    this.engine.beginTransition();
    this.engine.endTransition();
    App.showFeedback(feedback);
  }

  _setHint(s) {
    if (hintEl) hintEl.textContent = s;
  }
}

// =========================
// APP CONTROLLER
// =========================
const particleSystem = new ParticleSystem();
const transitionOverlay = new TransitionOverlay({ levelCanvas, lctx });
const engine = new FallingBubbleEngine({ ctx, canvas, particleSystem });

const App = {
  levels: [],     // flattened, ordered list used by the engine/LearningMode
  lessons: [],    // grouped lessons used to render the Duolingo-style path
  progress: loadProgress(),
  mode: null,

  // Flatten lessons into a single ordered level list while keeping lesson
  // metadata on each level so the path UI can group them again.
  _setLessons(lessons) {
    this.lessons = lessons || [];
    const flat = [];
    this.lessons.forEach((lesson, li) => {
      (lesson.levels || []).forEach((lvl, vi) => {
        flat.push(Object.assign({}, lvl, {
          _lessonIndex: li,
          _lessonId: lesson.id,
          _lessonTitle: lesson.title,
          _lessonSubtitle: lesson.subtitle || '',
          _lessonColor: lesson.color || '#4facfe',
          _levelInLesson: vi,
          _flatIndex: flat.length
        }));
      });
    });
    this.levels = flat;
  },

  async init() {
    // wire input once
    document.addEventListener('keydown', (ev) => {
      const k = ev.key.toUpperCase();
      engine.handleKey(k);
      // For browsers with suspended audio context: first interaction resumes audio
      const ac = getAudioContext();
      if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    });

    // game over callback
    engine.onGameOver = () => {
      // In Learning Mode: treat as a failed checkpoint (Duolingo-like), not a global "game over".
      if (App.mode instanceof LearningMode && App.mode.activeLevel) {
        App.mode._completeLevel(false, engine.gameOverReason || 'fell');
        return;
      }

      overlay.style.display = 'flex';
      finalText.textContent = `Deine Punkte: ${engine.totalScore}`;
      playGameOverSound();
    };

    engine.onStatsChanged = () => {
      App.updateHUD();
    };

    // restart from game over: back to menu
    restartBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
      App.showMenu();
    });

    // mode buttons
    modeLearnBtn.addEventListener('click', () => App.showLearningPath());
    modeFreeBtn.addEventListener('click', () => App.startFreeMode());
    backToMenuBtn.addEventListener('click', () => App.showMenu());

    // feedback overlay buttons
    if (fbRetryBtn) fbRetryBtn.addEventListener('click', () => {
      App.hideFeedback();
      App.startLearningLevel(App._lastFeedback ? App._lastFeedback.levelIndex : 0);
    });
    if (fbNextBtn) fbNextBtn.addEventListener('click', () => {
      App.hideFeedback();
      const next = (App._lastFeedback ? App._lastFeedback.levelIndex : -1) + 1;
      if (next < App.levels.length) App.startLearningLevel(next);
      else App.showMenu();
    });
    if (fbMenuBtn) fbMenuBtn.addEventListener('click', () => {
      App.hideFeedback();
      App.showMenu();
    });

    // load lessons + show menu
    this._setLessons(await loadLessons());
    this.showMenu();
  },

  hideFeedback() {
    if (feedbackOverlay) feedbackOverlay.style.display = 'none';
  },

  showFeedback(fb) {
    App._lastFeedback = fb;
    if (!feedbackOverlay) {
      // Fallback if HTML overlay is missing: degrade gracefully.
      if (!fb.passed) alert(fb.tip);
      App.showMenu();
      return;
    }

    feedbackOverlay.classList.toggle('passed', !!fb.passed);
    feedbackOverlay.classList.toggle('failed', !fb.passed);

    fbTitle.textContent = fb.passed ? 'Bestanden!' : 'Nicht bestanden';
    const flvl = App.levels[fb.levelIndex];
    if (flvl) {
      fbSubtitle.textContent =
        `Lektion ${flvl._lessonIndex + 1}.${flvl._levelInLesson + 1} · ${flvl._lessonTitle} – ${fb.levelTitle}`;
    } else {
      fbSubtitle.textContent = `Level ${fb.levelIndex + 1} · ${fb.levelTitle}`;
    }

    // criteria checklist
    fbCriteria.innerHTML = '';
    fb.criteria.forEach((cr) => {
      const li = document.createElement('li');
      li.className = cr.ok ? 'ok' : 'fail';
      const icon = document.createElement('span');
      icon.className = 'fb-icon';
      icon.textContent = cr.ok ? '✓' : '✕';
      const label = document.createElement('span');
      label.className = 'fb-label';
      label.textContent = cr.label;
      const val = document.createElement('span');
      val.className = 'fb-val';
      val.textContent = cr.detail;
      li.appendChild(icon);
      li.appendChild(label);
      li.appendChild(val);
      fbCriteria.appendChild(li);
    });

    fbTip.textContent = fb.tip;

    // button visibility: "Weiter" only after a pass that isn't the last level
    if (fbNextBtn) fbNextBtn.style.display = (fb.passed && !fb.isLast) ? 'inline-flex' : 'none';
    if (fbRetryBtn) fbRetryBtn.style.display = fb.passed ? 'none' : 'inline-flex';

    overlay.style.display = 'none';
    startScreen.style.display = 'none';
    feedbackOverlay.style.display = 'flex';
  },

  showMenu() {
    // stop any running mode cleanly
    engine.stop();
    engine.canvas.style.visibility = 'visible';
    overlay.style.display = 'none';
    this.hideFeedback();

    // UI
    startScreen.style.display = 'flex';
    subtitleEl.textContent = 'Wähle Modus: Lernpfad (Level) oder Freier Modus.';
    playBtn.style.display = 'none'; // legacy button not used now
    backToMenuBtn.style.display = 'none';

    // clear hint
    if (hintEl) hintEl.textContent = 'Tipp: Falsche Eingabe kostet 1 Leben (pro Level wieder voll).';

    // build level list
    this._renderLevelList();
    this.updateHUD(true);
  },

  showLearningPath() {
    startScreen.style.display = 'flex';
    backToMenuBtn.style.display = 'inline-flex';
    subtitleEl.textContent = 'Lernpfad: Level auswählen.';
    this._renderLevelList(true);
  },

  _renderLevelList(showList = true) {
    if (!levelListEl) return;

    levelListEl.innerHTML = '';
    if (!showList) return;

    const unlocked = this.progress.unlockedIndex;

    this.lessons.forEach((lesson, li) => {
      const color = lesson.color || '#4facfe';
      const lessonLevels = (lesson.levels || []);

      // flat indices that belong to this lesson
      const flatForLesson = this.levels.filter(l => l._lessonIndex === li);
      const firstIdx = flatForLesson.length ? flatForLesson[0]._flatIndex : 0;
      const lastIdx = flatForLesson.length ? flatForLesson[flatForLesson.length - 1]._flatIndex : 0;

      const lessonDone = lastIdx < unlocked;
      const lessonLocked = firstIdx > unlocked;
      const doneCount = flatForLesson.filter(l => l._flatIndex < unlocked).length;

      const section = document.createElement('div');
      section.className = 'lesson-section'
        + (lessonDone ? ' done' : '')
        + (lessonLocked ? ' locked' : '');
      section.style.setProperty('--lesson-color', color);

      // header: dot + texts + progress
      const header = document.createElement('div');
      header.className = 'lesson-header';

      const dot = document.createElement('div');
      dot.className = 'lesson-dot';
      dot.textContent = lessonDone ? '✓' : (li + 1);
      header.appendChild(dot);

      const txt = document.createElement('div');
      txt.className = 'lesson-text';
      const h = document.createElement('div');
      h.className = 'lesson-title';
      h.textContent = `Lektion ${li + 1} · ${lesson.title}`;
      const sub = document.createElement('div');
      sub.className = 'lesson-sub';
      sub.textContent = lesson.subtitle || '';
      txt.appendChild(h);
      txt.appendChild(sub);
      header.appendChild(txt);

      const count = document.createElement('div');
      count.className = 'lesson-count';
      count.textContent = `${doneCount}/${lessonLevels.length}`;
      header.appendChild(count);

      section.appendChild(header);

      // level nodes
      const nodes = document.createElement('div');
      nodes.className = 'lesson-levels';

      flatForLesson.forEach((lvl) => {
        const idx = lvl._flatIndex;
        const locked = idx > unlocked;
        const done = idx < unlocked;
        const current = idx === unlocked;

        const btn = document.createElement('button');
        btn.className = 'level-node'
          + (locked ? ' locked' : '')
          + (done ? ' done' : '')
          + (current ? ' current' : '');
        btn.disabled = locked;
        btn.style.setProperty('--lesson-color', color);

        const num = document.createElement('span');
        num.className = 'node-num';
        num.textContent = locked ? '🔒' : (done ? '✓' : (lvl._levelInLesson + 1));
        btn.appendChild(num);

        const label = document.createElement('span');
        label.className = 'node-label';
        label.textContent = lvl.title;
        btn.appendChild(label);

        const r = lvl.rules || {};
        btn.title =
          `Ziel: ${r.durationSeconds ?? 60}s durchhalten · ≥${r.minKeystrokes ?? 0} Anschläge · ` +
          `≥${Math.round((r.minAccuracy ?? 0) * 100)}% Genauigkeit`;

        btn.addEventListener('click', () => {
          App.startLearningLevel(idx);
        });

        nodes.appendChild(btn);
      });

      section.appendChild(nodes);
      levelListEl.appendChild(section);
    });
  },

  startLearningLevel(index) {
    startScreen.style.display = 'none';
    backToMenuBtn.style.display = 'inline-flex';

    // create mode per run
    this.mode = new LearningMode({
      engine,
      overlay: transitionOverlay,
      levels: this.levels,
      progress: this.progress
    });

    // override HUD: show time-based progress
    this.mode.startLevel(index);

    // ensure overlay/gameover hidden
    overlay.style.display = 'none';
  },

  startFreeMode() {
    startScreen.style.display = 'none';
    backToMenuBtn.style.display = 'inline-flex';

    this.mode = new FreeMode({ engine, overlay: transitionOverlay });
    this.mode.start();

    overlay.style.display = 'none';
  },

  updateHUD(isMenu = false) {
    if (isMenu) {
      scoreEl.textContent = 'Bereit.';
      progressBar.style.width = '0%';
      return;
    }

    // In learning mode, show a time progress bar if possible
    let bar = 0;
    let modeLabel = '';

    if (this.mode instanceof LearningMode && this.mode.activeLevel) {
      const rules = this.mode.activeLevel.rules || {};
      const dur = rules.durationSeconds ?? 60;
      const elapsed = (performance.now() - this.mode.startTimeMs) / 1000;
      bar = clamp(elapsed / dur, 0, 1);
      modeLabel = `Lernen: ${this.mode.activeIndex + 1}/${this.levels.length}`;
    } else {
      // Free mode uses per-level completion progress
      bar = engine.levelTarget > 0 ? clamp(engine.levelProgress / engine.levelTarget, 0, 1) : 0;
      modeLabel = 'Freier Modus';
    }

    const acc = Math.round(engine.getAccuracy() * 100);
    scoreEl.textContent =
      `${modeLabel} | Punkte: ${engine.totalScore} | Leben: ${engine.lives}/${engine.maxLives} | Genauigkeit: ${acc}%`;

    progressBar.style.width = `${Math.round(bar * 100)}%`;
  }
};

// =========================
// INIT
// =========================
App.init();
