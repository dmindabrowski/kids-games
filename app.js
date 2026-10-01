const DB_NAME = 'nasze-obrazki';
const DB_VERSION = 1;
const STORE_NAME = 'photos';
const APP_VERSION = '0.12.1';

const PUZZLE_LEVELS = {
  easy: { label: 'Łatwe', pieces: 6, landscape: [3, 2], portrait: [2, 3], trayCols: 3 },
  medium: { label: 'Średnie', pieces: 12, landscape: [4, 3], portrait: [3, 4], trayCols: 3 },
  hard: { label: 'Trudne', pieces: 20, landscape: [5, 4], portrait: [4, 5], trayCols: 4 }
};
const MEMO_LEVELS = {
  easy: { label: 'Łatwe', pairs: 3 },
  medium: { label: 'Średnie', pairs: 5 },
  hard: { label: 'Trudne', pairs: 6 }
};
let puzzleDifficulty = 'medium';
let memoDifficulty = 'medium';
let puzzleSize = PUZZLE_LEVELS.medium.pieces;
let memoPairs = MEMO_LEVELS.medium.pairs;

let puzzleColumns = 4;
let puzzleRows = 3;
let puzzleRatio = 1.333;
let puzzleTrayCols = 3;
const NUMBERS_LEVELS = [3, 4, 5, 6, 7, 8, 10];
const NUMBERS_START_LEVEL = 2;
const NUMBERS_LEVEL_UP_STREAK = 3;
const NUMBERS_LEVEL_DOWN_STREAK = 2;
let numbersLevel = NUMBERS_START_LEVEL;
let correctStreak = 0;
let wrongStreak = 0;
let lastNumbersCount = 0;
let audioContext;

const NUMBER_WORDS = ['Zero', 'Jeden', 'Dwa', 'Trzy', 'Cztery', 'Pięć', 'Sześć', 'Siedem', 'Osiem', 'Dziewięć', 'Dziesięć'];
const PRAISE_LINES = ['Brawo Strażaku Jasiu!', 'Super Jasiu!'];
let praiseIndex = 0;
const NUMBERS_ASSET = 'assets/woz-strazacki.svg';

const TRACE_PATHS = [
  { d: 'M60 130 L420 130', start: [60, 130], end: [420, 130], name: 'Prosta droga' },
  { d: 'M60 130 Q240 40 420 130', start: [60, 130], end: [420, 130], name: 'Górka' },
  { d: 'M60 130 Q240 220 420 130', start: [60, 130], end: [420, 130], name: 'Dolinka' },
  { d: 'M60 130 C160 40 320 220 420 130', start: [60, 130], end: [420, 130], name: 'Fala' },
  { d: 'M60 50 L240 210 L420 50', start: [60, 50], end: [420, 50], name: 'Góra' },
  { d: 'M60 130 Q140 40 220 130 T380 130 L420 130', start: [60, 130], end: [420, 130], name: 'Wężyk' }
];
let traceIndex = 0;
let traceActive = false;
let traceStartTouched = false;
let traceTrailPoints = [];

const HISTORY_STORAGE_KEY = 'nasze-obrazki-history-v1';

function emptyPerDigit() {
  return Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, { correct: 0, wrong: 0 }]));
}

function defaultHistoricalStats() {
  return {
    firstSessionAt: Date.now(),
    lastSessionAt: Date.now(),
    lastPlayedAt: null,
    sessionsCount: 0,
    totalInAppMs: 0,
    longestSessionMs: 0,
    timeOfDayBuckets: { morning: 0, noon: 0, afternoon: 0, evening: 0, night: 0 },
    puzzleCompleted: 0,
    puzzleByDifficulty: { easy: 0, medium: 0, hard: 0 },
    memoCompleted: 0,
    memoByDifficulty: { easy: 0, medium: 0, hard: 0 },
    numbersCorrect: 0,
    numbersWrong: 0,
    numbersHighestLevel: NUMBERS_START_LEVEL,
    numbersPerDigit: emptyPerDigit(),
    traceCompleted: 0,
    timeByGame: { puzzle: 0, memo: 0, numbers: 0, trace: 0 },
    records: {
      puzzle: { easy: null, medium: null, hard: null },
      memo: { easy: null, medium: null, hard: null }
    }
  };
}

function loadHistoricalStats() {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || 'null');
    if (!stored) return defaultHistoricalStats();
    const base = defaultHistoricalStats();
    return {
      ...base,
      ...stored,
      puzzleByDifficulty: { ...base.puzzleByDifficulty, ...(stored.puzzleByDifficulty ?? {}) },
      memoByDifficulty: { ...base.memoByDifficulty, ...(stored.memoByDifficulty ?? {}) },
      timeByGame: { ...base.timeByGame, ...(stored.timeByGame ?? {}) },
      numbersPerDigit: { ...emptyPerDigit(), ...(stored.numbersPerDigit ?? {}) },
      timeOfDayBuckets: { ...base.timeOfDayBuckets, ...(stored.timeOfDayBuckets ?? {}) },
      records: {
        puzzle: { ...base.records.puzzle, ...(stored.records?.puzzle ?? {}) },
        memo: { ...base.records.memo, ...(stored.records?.memo ?? {}) }
      }
    };
  } catch (error) { return defaultHistoricalStats(); }
}

function bucketForHour(hour) {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 15) return 'noon';
  if (hour >= 15 && hour < 19) return 'afternoon';
  if (hour >= 19 && hour < 23) return 'evening';
  return 'night';
}

const historicalStats = loadHistoricalStats();
historicalStats.sessionsCount += 1;
const currentSessionStartAt = Date.now();
const nowBucket = bucketForHour(new Date().getHours());
historicalStats.timeOfDayBuckets[nowBucket] = (historicalStats.timeOfDayBuckets[nowBucket] ?? 0) + 1;

let historySaveTimer;
function persistHistory() {
  clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(() => {
    try {
      historicalStats.lastSessionAt = Date.now();
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historicalStats));
    } catch (error) { /* quota exceeded, private mode etc. */ }
  }, 400);
}
persistHistory();

const sessionStats = {
  sessionStartAt: Date.now(),
  puzzleCompleted: 0,
  puzzleByDifficulty: { easy: 0, medium: 0, hard: 0 },
  memoCompleted: 0,
  memoByDifficulty: { easy: 0, medium: 0, hard: 0 },
  numbersCorrect: 0,
  numbersWrong: 0,
  numbersHighestLevel: NUMBERS_START_LEVEL,
  numbersPerDigit: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, { correct: 0, wrong: 0 }])),
  traceCompleted: 0,
  timeByGame: { puzzle: 0, memo: 0, numbers: 0, trace: 0 }
};
let activeGameKey = null;
let activeGameStart = 0;

const copyYear = document.querySelector('#copyYear');
const appVersion = document.querySelector('#appVersion');
if (copyYear) copyYear.textContent = String(new Date().getFullYear());
if (appVersion) appVersion.textContent = APP_VERSION;

const screens = [...document.querySelectorAll('.screen')];
const homePhotos = document.querySelector('#homePhotos');
const photoCount = document.querySelector('#photoCount');
const photoInput = document.querySelector('#photoInput');
const libraryGrid = document.querySelector('#libraryGrid');
const startGameButton = document.querySelector('#startGameButton');
const selectionCount = document.querySelector('#selectionCount');
const toast = document.querySelector('#toast');

let databasePromise;
let photos = [];
let selectedPhotoIds = new Set();
let currentGame = null;
let activePhotoUrls = new Map();
let toastTimeout;
let selectedPuzzlePiece = null;
let puzzleStartTime = 0;
let memoStartTime = 0;
let dragState = null;
let mismatchedTimeout;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function withStore(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

const BUILTIN_PHOTOS = [
  { id: 'builtin-woz', name: 'Wóz strażacki', src: 'assets/woz-strazacki.svg', builtin: true },
  { id: 'builtin-policja', name: 'Samochód policji', src: 'assets/samochod-policji.svg', builtin: true },
  { id: 'builtin-karetka', name: 'Karetka', src: 'assets/karetka.svg', builtin: true },
  { id: 'builtin-smieciarka', name: 'Śmieciarka', src: 'assets/smieciarka.svg', builtin: true },
  { id: 'builtin-dzwig', name: 'Dźwig', src: 'assets/dzwig.svg', builtin: true }
];

async function loadPhotos() {
  const userPhotos = (await withStore('readonly', store => store.getAll())).sort((a, b) => a.createdAt - b.createdAt);
  photos = [...BUILTIN_PHOTOS, ...userPhotos];
  renderHomePhotos();
}

function imageUrl(photo) {
  if (photo.builtin) return photo.src;
  if (!activePhotoUrls.has(photo.id)) activePhotoUrls.set(photo.id, URL.createObjectURL(photo.blob));
  return activePhotoUrls.get(photo.id);
}

function releasePhotoUrl(photoId) {
  const url = activePhotoUrls.get(photoId);
  if (url) URL.revokeObjectURL(url);
  activePhotoUrls.delete(photoId);
}

const GAME_SCREENS = new Set(['puzzleScreen', 'memoScreen', 'numbersScreen', 'traceScreen']);

const SCREEN_TO_GAME = { puzzleScreen: 'puzzle', memoScreen: 'memo', numbersScreen: 'numbers', traceScreen: 'trace' };

function showScreen(screenId) {
  for (const screen of screens) screen.hidden = screen.id !== screenId;
  document.body.classList.toggle('locked-view', GAME_SCREENS.has(screenId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const newGame = SCREEN_TO_GAME[screenId] ?? null;
  if (newGame !== activeGameKey) {
    if (activeGameKey) {
      const delta = Date.now() - activeGameStart;
      sessionStats.timeByGame[activeGameKey] = (sessionStats.timeByGame[activeGameKey] ?? 0) + delta;
      historicalStats.timeByGame[activeGameKey] = (historicalStats.timeByGame[activeGameKey] ?? 0) + delta;
      persistHistory();
    }
    activeGameKey = newGame;
    activeGameStart = Date.now();
    if (newGame) {
      historicalStats.lastPlayedAt = Date.now();
      persistHistory();
    }
  }
}

document.addEventListener('gesturestart', event => event.preventDefault());
document.addEventListener('gesturechange', event => event.preventDefault());
document.addEventListener('gestureend', event => event.preventDefault());

function notify(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function pluralizePhotos(count) {
  if (count === 1) return '1 zdjęcie';
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) return `${count} zdjęcia`;
  return `${count} zdjęć`;
}

function renderHomePhotos() {
  photoCount.textContent = pluralizePhotos(photos.length);
  homePhotos.replaceChildren();
  if (photos.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'empty-shelf';
    empty.textContent = 'Dodaj ulubione zdjęcia, aby zacząć.';
    homePhotos.append(empty);
    return;
  }
  for (const photo of photos.slice(-8)) {
    const frame = document.createElement('div');
    frame.className = 'home-photo';
    const image = document.createElement('img');
    image.src = imageUrl(photo);
    image.alt = '';
    frame.append(image);
    homePhotos.append(frame);
  }
}

function openLibrary(game = null) {
  currentGame = game;
  selectedPhotoIds.clear();
  const setup = Boolean(game);
  if (game === 'memo') memoPairs = MEMO_LEVELS[memoDifficulty].pairs;
  document.querySelector('#libraryEyebrow').textContent = setup ? `WYBIERZ ZDJĘCIE · ${game === 'puzzle' ? 'PUZZLE' : 'MEMO'}` : 'DLA RODZICA';
  document.querySelector('#libraryTitle').textContent = setup ? (game === 'puzzle' ? 'Wybierz obrazek' : `Wybierz ${memoPairs} obrazków`) : 'Wasze zdjęcia';
  document.querySelector('#libraryHint').textContent = setup
    ? (game === 'puzzle' ? 'Wybierz jedno zdjęcie do ułożenia.' : `Dotknij ${memoPairs} zdjęć, z których zrobimy pary.`)
    : 'Dodaj zdjęcia. Zostają zapisane tylko na tym urządzeniu.';
  startGameButton.hidden = !setup;
  selectionCount.hidden = !setup;
  document.querySelector('#libraryFooter').hidden = !setup;
  document.querySelector('#randomSelectButton').hidden = game !== 'memo';
  refreshDifficultyChips(game);
  renderLibrary();
  showScreen('libraryScreen');
}

function refreshDifficultyChips(game) {
  const container = document.querySelector('#difficultyChips');
  const show = game === 'puzzle' || game === 'memo';
  container.hidden = !show;
  if (!show) return;
  const active = game === 'puzzle' ? puzzleDifficulty : memoDifficulty;
  const levels = game === 'puzzle' ? PUZZLE_LEVELS : MEMO_LEVELS;
  for (const chip of container.querySelectorAll('.chip')) {
    const key = chip.dataset.difficulty;
    chip.classList.toggle('active', key === active);
    const level = levels[key];
    const suffix = game === 'puzzle' ? ` · ${level.pieces} części` : ` · ${level.pairs} ${pluralPairs(level.pairs)}`;
    chip.textContent = `${level.label}${suffix}`;
  }
}

function pluralPairs(count) {
  if (count === 1) return 'para';
  const last = count % 10;
  const twoDigits = count % 100;
  if (last >= 2 && last <= 4 && (twoDigits < 12 || twoDigits > 14)) return 'pary';
  return 'par';
}

document.querySelector('#difficultyChips').addEventListener('click', event => {
  const chip = event.target.closest('.chip[data-difficulty]');
  if (!chip) return;
  const key = chip.dataset.difficulty;
  if (currentGame === 'puzzle') puzzleDifficulty = key;
  else if (currentGame === 'memo') {
    memoDifficulty = key;
    memoPairs = MEMO_LEVELS[key].pairs;
    selectedPhotoIds = new Set([...selectedPhotoIds].slice(0, memoPairs));
    renderLibrary();
  }
  refreshDifficultyChips(currentGame);
});

function renderLibrary() {
  libraryGrid.replaceChildren();
  if (photos.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'library-empty';
    empty.textContent = 'Nie ma tu jeszcze zdjęć. Dodaj kilka z galerii tabletu.';
    libraryGrid.append(empty);
  }
  for (const photo of photos) {
    const card = document.createElement('div');
    card.className = `library-card${selectedPhotoIds.has(photo.id) ? ' selected' : ''}${photo.builtin ? ' builtin' : ''}`;
    card.dataset.photoId = photo.id;
    const select = document.createElement('button');
    select.className = 'photo-select';
    select.type = 'button';
    select.setAttribute('aria-label', selectedPhotoIds.has(photo.id) ? 'Odznacz zdjęcie' : 'Wybierz zdjęcie');
    const image = document.createElement('img');
    image.src = imageUrl(photo);
    image.alt = photo.name || 'Dodane zdjęcie';
    const mark = document.createElement('span');
    mark.className = 'selection-mark';
    mark.textContent = '✓';
    select.append(image, mark);
    select.addEventListener('click', () => togglePhoto(photo.id));
    card.append(select);
    if (!photo.builtin) {
      const remove = document.createElement('button');
      remove.className = 'delete-photo';
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Usuń zdjęcie');
      remove.addEventListener('click', event => {
        event.stopPropagation();
        deletePhoto(photo.id);
      });
      card.append(remove);
    }
    libraryGrid.append(card);
  }
  updateSelectionUi();
}

function togglePhoto(photoId) {
  if (currentGame === 'puzzle') {
    selectedPhotoIds.clear();
    selectedPhotoIds.add(photoId);
  } else if (currentGame === 'memo') {
    if (selectedPhotoIds.has(photoId)) selectedPhotoIds.delete(photoId);
    else if (selectedPhotoIds.size < memoPairs) selectedPhotoIds.add(photoId);
    else notify('Wybierz dokładnie 5 zdjęć.');
  }
  renderLibrary();
}

function updateSelectionUi() {
  if (!currentGame) return;
  const count = selectedPhotoIds.size;
  selectionCount.textContent = currentGame === 'puzzle'
    ? (count ? '1 zdjęcie wybrane' : 'Wybierz 1 zdjęcie')
    : `${count} z ${memoPairs} zdjęć`;
  startGameButton.disabled = count !== (currentGame === 'puzzle' ? 1 : memoPairs);
  startGameButton.textContent = currentGame === 'puzzle' ? 'Zagraj w puzzle' : 'Zagraj w memo';
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

photoInput.addEventListener('change', async () => {
  const files = [...photoInput.files].filter(file => file.type.startsWith('image/'));
  if (files.length === 0) return;
  try {
    for (const file of files) {
      await withStore('readwrite', store => store.add({ id: makeId(), name: file.name, blob: file, createdAt: Date.now() }));
    }
    await loadPhotos();
    renderLibrary();
    notify(`Dodano ${pluralizePhotos(files.length)}.`);
  } catch (error) {
    console.error(error);
    notify('Nie udało się zapisać zdjęć. Sprawdź wolne miejsce na urządzeniu.');
  } finally {
    photoInput.value = '';
  }
});

async function deletePhoto(photoId) {
  await withStore('readwrite', store => store.delete(photoId));
  releasePhotoUrl(photoId);
  await loadPhotos();
  renderLibrary();
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function memoRowSizes(total) {
  const rows = 3;
  const base = Math.floor(total / rows);
  const extra = total - base * rows;
  return Array.from({ length: rows }, (_, index) => base + (index < extra ? 1 : 0));
}

function pieceStyle(photo, pieceIndex) {
  const column = pieceIndex % puzzleColumns;
  const row = Math.floor(pieceIndex / puzzleColumns);
  return `background-image:url("${imageUrl(photo)}");background-size:${puzzleColumns * 100}% ${puzzleRows * 100}%;background-position:${column * 100 / (puzzleColumns - 1)}% ${row * 100 / (puzzleRows - 1)}%`;
}

function slotHintStyle(photo, pieceIndex) {
  const column = pieceIndex % puzzleColumns;
  const row = Math.floor(pieceIndex / puzzleColumns);
  const size = `${puzzleColumns * 100}% ${puzzleRows * 100}%`;
  const position = `${column * 100 / (puzzleColumns - 1)}% ${row * 100 / (puzzleRows - 1)}%`;
  return `background-image:linear-gradient(rgba(232,237,229,.78),rgba(232,237,229,.78)),url("${imageUrl(photo)}");background-size:auto, ${size};background-position:0 0, ${position};background-repeat:no-repeat, no-repeat`;
}

function loadImageDimensions(url) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 4, height: image.naturalHeight || 3 });
    image.onerror = () => resolve({ width: 4, height: 3 });
    image.src = url;
  });
}

async function startPuzzle(photo) {
  const board = document.querySelector('#puzzleBoard');
  const tray = document.querySelector('#pieceTray');
  board.replaceChildren();
  tray.replaceChildren();
  selectedPuzzlePiece = null;
  document.querySelector('#puzzleComplete').hidden = true;
  document.querySelector('#pieceInstruction').textContent = 'Przeciągnij element na planszę';
  const { width, height } = await loadImageDimensions(imageUrl(photo));
  const portrait = height > width;
  const level = PUZZLE_LEVELS[puzzleDifficulty] ?? PUZZLE_LEVELS.medium;
  const [landscapeCols, landscapeRows] = level.landscape;
  const [portraitCols, portraitRows] = level.portrait;
  puzzleColumns = portrait ? portraitCols : landscapeCols;
  puzzleRows = portrait ? portraitRows : landscapeRows;
  puzzleSize = level.pieces;
  puzzleTrayCols = level.trayCols;
  puzzleRatio = width / height;
  board.style.removeProperty('aspect-ratio');
  board.style.gridTemplateColumns = `repeat(${puzzleColumns}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${puzzleRows}, 1fr)`;
  const tray2 = document.querySelector('#pieceTray');
  tray2.style.gridTemplateColumns = `repeat(${puzzleTrayCols}, minmax(0, 1fr))`;
  for (let index = 0; index < puzzleSize; index++) {
    const slot = document.createElement('button');
    slot.className = 'puzzle-slot';
    slot.type = 'button';
    slot.dataset.slot = String(index);
    slot.setAttribute('aria-label', `Miejsce ${index + 1}`);
    slot.style.cssText = slotHintStyle(photo, index);
    slot.addEventListener('click', () => {
      if (selectedPuzzlePiece !== null) placePiece(selectedPuzzlePiece, slot);
    });
    board.append(slot);
  }
  for (const pieceIndex of shuffled(Array.from({ length: puzzleSize }, (_, index) => index))) {
    const piece = document.createElement('button');
    piece.className = 'puzzle-piece';
    piece.type = 'button';
    piece.dataset.piece = String(pieceIndex);
    piece.style.cssText = pieceStyle(photo, pieceIndex);
    piece.setAttribute('aria-label', `Element puzzli ${pieceIndex + 1}`);
    tray.append(piece);
  }
  document.querySelector('#puzzleProgress').textContent = `0 z ${puzzleSize}`;
  puzzleStartTime = Date.now();
  showScreen('puzzleScreen');
  requestAnimationFrame(fitPuzzleBoard);
}

function fitPuzzleBoard() {
  const board = document.querySelector('#puzzleBoard');
  if (!board || board.offsetParent === null) return;
  const layout = board.parentElement;
  const layoutRect = layout.getBoundingClientRect();
  const cols = getComputedStyle(layout).gridTemplateColumns.split(/\s+/).map(parseFloat).filter(v => !isNaN(v));
  const boardCellW = cols[0] ?? layoutRect.width;
  const boardCellH = layoutRect.height;
  const border = 14;
  const availW = Math.max(0, boardCellW - border);
  const availH = Math.max(0, boardCellH - border);
  let w = Math.min(availW, availH * puzzleRatio);
  if (!Number.isFinite(w) || w <= 0) w = Math.min(availW, availH);
  const h = w / puzzleRatio;
  board.style.width = `${Math.floor(w) + border}px`;
  board.style.height = `${Math.floor(h) + border}px`;
}

function placePiece(pieceIndex, slot) {
  if (Number(slot.dataset.slot) !== pieceIndex || slot.classList.contains('filled')) return;
  const piece = document.querySelector(`.puzzle-piece[data-piece="${pieceIndex}"]`);
  if (!piece) return;
  slot.classList.add('filled');
  slot.style.cssText = pieceStyle(photos.find(photo => photo.id === [...selectedPhotoIds][0]), pieceIndex);
  slot.setAttribute('aria-label', 'Ułożony element');
  piece.remove();
  selectedPuzzlePiece = null;
  const placed = document.querySelectorAll('.puzzle-slot.filled').length;
  document.querySelector('#puzzleProgress').textContent = `${placed} z ${puzzleSize}`;
  if (placed === puzzleSize) {
    document.querySelector('#puzzleComplete').hidden = false;
    sessionStats.puzzleCompleted++;
    sessionStats.puzzleByDifficulty[puzzleDifficulty] = (sessionStats.puzzleByDifficulty[puzzleDifficulty] ?? 0) + 1;
    historicalStats.puzzleCompleted++;
    historicalStats.puzzleByDifficulty[puzzleDifficulty] = (historicalStats.puzzleByDifficulty[puzzleDifficulty] ?? 0) + 1;
    const duration = Date.now() - puzzleStartTime;
    if (puzzleStartTime && (historicalStats.records.puzzle[puzzleDifficulty] === null || duration < historicalStats.records.puzzle[puzzleDifficulty])) {
      historicalStats.records.puzzle[puzzleDifficulty] = duration;
    }
    persistHistory();
    celebrate('Brawo!');
  }
}

function beginPuzzleDrag(event) {
  const piece = event.target.closest('.puzzle-piece');
  if (!piece || event.button > 0) return;
  dragState = { piece, index: Number(piece.dataset.piece), startX: event.clientX, startY: event.clientY, moved: false, ghost: null };
  selectedPuzzlePiece = dragState.index;
}

function movePuzzleDrag(event) {
  if (!dragState) return;
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (!dragState.moved && distance > 8) {
    dragState.moved = true;
    dragState.piece.classList.remove('selected');
    const bounds = dragState.piece.getBoundingClientRect();
    dragState.ghost = document.createElement('div');
    dragState.ghost.className = 'drag-ghost';
    dragState.ghost.style.cssText = `${dragState.piece.style.cssText};width:${bounds.width}px;height:${bounds.height}px;left:${event.clientX}px;top:${event.clientY}px`;
    document.body.append(dragState.ghost);
  }
  if (dragState.ghost) {
    dragState.ghost.style.left = `${event.clientX}px`;
    dragState.ghost.style.top = `${event.clientY}px`;
  }
}

function endPuzzleDrag(event) {
  if (!dragState) return;
  const state = dragState;
  dragState = null;
  if (state.ghost) state.ghost.remove();
  if (state.moved) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.puzzle-slot');
    if (target) placePiece(state.index, target);
    else selectedPuzzlePiece = null;
  } else {
    document.querySelectorAll('.puzzle-piece.selected').forEach(piece => piece.classList.remove('selected'));
    state.piece.classList.add('selected');
    document.querySelector('#pieceInstruction').textContent = 'Teraz dotknij pasującego miejsca';
  }
}

document.querySelector('#pieceTray').addEventListener('pointerdown', beginPuzzleDrag);
window.addEventListener('pointermove', movePuzzleDrag);
window.addEventListener('pointerup', endPuzzleDrag);
document.querySelector('#puzzleAgainButton').addEventListener('click', () => startPuzzle(photos.find(photo => photo.id === [...selectedPhotoIds][0])));

function startMemo(selectedPhotos) {
  const board = document.querySelector('#memoBoard');
  board.replaceChildren();
  document.querySelector('#memoComplete').hidden = true;
  clearTimeout(mismatchedTimeout);
  let firstCard = null;
  let locked = false;
  let foundPairs = 0;
  const cards = shuffled(selectedPhotos.flatMap(photo => [photo, photo]));
  const rowSizes = memoRowSizes(cards.length);
  board.style.setProperty('--memo-columns', String(Math.max(...rowSizes)));
  let cursor = 0;
  for (const rowSize of rowSizes) {
    const row = document.createElement('div');
    row.className = 'memo-row';
    for (let index = 0; index < rowSize; index++) {
      const photo = cards[cursor++];
      const card = document.createElement('button');
      card.className = 'memo-card';
      card.type = 'button';
      card.dataset.photoId = photo.id;
      card.setAttribute('aria-label', 'Odkryj kartę');
      const image = document.createElement('img');
      image.src = imageUrl(photo);
      image.alt = photo.name || 'Zdjęcie';
      image.hidden = true;
      card.append(image);
      card.addEventListener('click', () => {
        if (locked || card.classList.contains('revealed') || card.classList.contains('matched')) return;
        card.classList.add('revealed');
        image.hidden = false;
        if (!firstCard) {
          firstCard = card;
          return;
        }
        if (firstCard.dataset.photoId === card.dataset.photoId) {
          firstCard.classList.replace('revealed', 'matched');
          card.classList.replace('revealed', 'matched');
          firstCard.disabled = true;
          card.disabled = true;
          firstCard = null;
          foundPairs++;
          document.querySelector('#memoProgress').textContent = `${foundPairs} z ${memoPairs}`;
          if (foundPairs === memoPairs) {
            document.querySelector('#memoComplete').hidden = false;
            sessionStats.memoCompleted++;
            sessionStats.memoByDifficulty[memoDifficulty] = (sessionStats.memoByDifficulty[memoDifficulty] ?? 0) + 1;
            historicalStats.memoCompleted++;
            historicalStats.memoByDifficulty[memoDifficulty] = (historicalStats.memoByDifficulty[memoDifficulty] ?? 0) + 1;
            const duration = Date.now() - memoStartTime;
            if (memoStartTime && (historicalStats.records.memo[memoDifficulty] === null || duration < historicalStats.records.memo[memoDifficulty])) {
              historicalStats.records.memo[memoDifficulty] = duration;
            }
            persistHistory();
            celebrate('Wszystkie pary!');
          }
        } else {
          locked = true;
          const previous = firstCard;
          firstCard = null;
          mismatchedTimeout = setTimeout(() => {
            for (const openCard of [previous, card]) {
              openCard.classList.remove('revealed');
              openCard.classList.add('mismatched');
              openCard.querySelector('img').hidden = true;
              setTimeout(() => openCard.classList.remove('mismatched'), 260);
            }
            locked = false;
          }, 850);
        }
      });
      row.append(card);
    }
    board.append(row);
  }
  document.querySelector('#memoProgress').textContent = `0 z ${memoPairs}`;
  memoStartTime = Date.now();
  showScreen('memoScreen');
  requestAnimationFrame(fitMemoBoard);
}

document.querySelector('#memoAgainButton').addEventListener('click', () => startMemo(photos.filter(photo => selectedPhotoIds.has(photo.id))));

const levelInfoModal = document.querySelector('#levelInfoModal');
function openLevelInfo() {
  const list = document.querySelector('#levelsList');
  list.replaceChildren();
  NUMBERS_LEVELS.forEach((max, index) => {
    const level = index + 1;
    const item = document.createElement('li');
    if (level === numbersLevel) item.classList.add('current');
    const num = document.createElement('span');
    num.className = 'level-num';
    num.textContent = String(level);
    const range = document.createElement('span');
    range.className = 'level-range';
    range.textContent = `1\u2013${max}`;
    item.append(num, range);
    list.append(item);
  });
  document.querySelector('#currentLevelText').textContent = `1\u2013${NUMBERS_LEVELS[numbersLevel - 1]}`;
  document.querySelector('#currentLevelNumber').textContent = String(numbersLevel);
  levelInfoModal.hidden = false;
}
function closeLevelInfo() { levelInfoModal.hidden = true; }
document.querySelector('#numbersProgress').addEventListener('click', openLevelInfo);
document.querySelector('#levelInfoClose').addEventListener('click', closeLevelInfo);
levelInfoModal.querySelector('[data-close]').addEventListener('click', closeLevelInfo);
document.querySelectorAll('[data-game]').forEach(button => button.addEventListener('click', () => {
  const game = button.dataset.game;
  if (game === 'numbers') {
    currentGame = 'numbers';
    numbersLevel = NUMBERS_START_LEVEL;
    correctStreak = 0;
    wrongStreak = 0;
    lastNumbersCount = 0;
    startNumbers();
    return;
  }
  if (game === 'trace') {
    currentGame = 'trace';
    traceIndex = 0;
    startTrace();
    return;
  }
  openLibrary(game);
}));

function goBack() {
  const puzzleActive = !document.querySelector('#puzzleScreen').hidden;
  const memoActive = !document.querySelector('#memoScreen').hidden;
  const numbersActive = !document.querySelector('#numbersScreen').hidden;
  const traceActiveScreen = !document.querySelector('#traceScreen').hidden;
  if (puzzleActive || memoActive) {
    openLibrary(currentGame);
    return;
  }
  if (numbersActive || traceActiveScreen) {
    currentGame = null;
    showScreen('homeScreen');
    return;
  }
  currentGame = null;
  selectedPhotoIds.clear();
  showScreen('homeScreen');
}
document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', goBack));
document.querySelector('#homeButton').addEventListener('click', () => {
  currentGame = null;
  selectedPhotoIds.clear();
  showScreen('homeScreen');
});
document.querySelector('#parentInfoButton').addEventListener('click', () => { document.querySelector('#parentInfoModal').hidden = false; });
document.querySelector('#parentInfoClose').addEventListener('click', () => { document.querySelector('#parentInfoModal').hidden = true; });
document.querySelector('#parentInfoModal [data-close]').addEventListener('click', () => { document.querySelector('#parentInfoModal').hidden = true; });

const statsModal = document.querySelector('#statsModal');
document.querySelector('#statsButton').addEventListener('click', () => { renderStats(); statsModal.hidden = false; });
document.querySelector('#statsClose').addEventListener('click', () => { statsModal.hidden = true; });
document.querySelector('#statsCloseHistory').addEventListener('click', () => { statsModal.hidden = true; });
statsModal.querySelector('[data-close]').addEventListener('click', () => { statsModal.hidden = true; });
statsModal.querySelector('.stats-tabs').addEventListener('click', event => {
  const tab = event.target.closest('.stats-tab');
  if (!tab) return;
  for (const t of statsModal.querySelectorAll('.stats-tab')) t.classList.toggle('active', t === tab);
  for (const panel of statsModal.querySelectorAll('.stats-panel')) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
});
document.querySelector('#resetHistoryButton').addEventListener('click', () => {
  Object.assign(historicalStats, defaultHistoricalStats(), { sessionsCount: 1 });
  persistHistory();
  renderStats();
  notify('Historia wyzerowana.');
});
document.querySelector('#resetStatsButton').addEventListener('click', () => {
  sessionStats.sessionStartAt = Date.now();
  sessionStats.puzzleCompleted = 0;
  sessionStats.puzzleByDifficulty = { easy: 0, medium: 0, hard: 0 };
  sessionStats.memoCompleted = 0;
  sessionStats.memoByDifficulty = { easy: 0, medium: 0, hard: 0 };
  sessionStats.numbersCorrect = 0;
  sessionStats.numbersWrong = 0;
  sessionStats.numbersHighestLevel = numbersLevel;
  sessionStats.traceCompleted = 0;
  sessionStats.timeByGame = { puzzle: 0, memo: 0, numbers: 0, trace: 0 };
  sessionStats.numbersPerDigit = emptyPerDigit();
  activeGameStart = Date.now();
  renderStats();
  notify('Statystyki sesji wyzerowane.');
});

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function computeLiveTime() {
  const times = { ...sessionStats.timeByGame };
  if (activeGameKey) times[activeGameKey] = (times[activeGameKey] ?? 0) + (Date.now() - activeGameStart);
  return times;
}

function fillList(target, items) {
  target.replaceChildren();
  for (const [label, value] of items) {
    const item = document.createElement('li');
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    const valueSpan = document.createElement('strong');
    valueSpan.textContent = String(value);
    item.append(labelSpan, valueSpan);
    target.append(item);
  }
}

function renderStats() {
  const times = computeLiveTime();
  const totalMs = Object.values(times).reduce((sum, ms) => sum + ms, 0);
  const startAgo = Date.now() - sessionStats.sessionStartAt;
  document.querySelector('#sessionStartLabel').textContent = formatDuration(startAgo) + ' temu';
  fillList(document.querySelector('#statsTimeList'), [
    ['Puzzle', formatDuration(times.puzzle)],
    ['Memo', formatDuration(times.memo)],
    ['Liczby', formatDuration(times.numbers)],
    ['Ślad', formatDuration(times.trace)],
    ['Łącznie w grach', formatDuration(totalMs)]
  ]);
  fillList(document.querySelector('#statsAchievementsList'), [
    [`Puzzle — ułożone (Ł/Ś/T)`, `${sessionStats.puzzleByDifficulty.easy} / ${sessionStats.puzzleByDifficulty.medium} / ${sessionStats.puzzleByDifficulty.hard}`],
    ['Puzzle — razem', sessionStats.puzzleCompleted],
    [`Memo — skończone (Ł/Ś/T)`, `${sessionStats.memoByDifficulty.easy} / ${sessionStats.memoByDifficulty.medium} / ${sessionStats.memoByDifficulty.hard}`],
    ['Memo — razem', sessionStats.memoCompleted],
    ['Ślady ukończone', sessionStats.traceCompleted]
  ]);
  const attempts = sessionStats.numbersCorrect + sessionStats.numbersWrong;
  const accuracy = attempts > 0 ? Math.round((sessionStats.numbersCorrect / attempts) * 100) : 0;
  fillList(document.querySelector('#statsNumbersList'), [
    ['Poprawnie', sessionStats.numbersCorrect],
    ['Błędnie', sessionStats.numbersWrong],
    ['Trafność', `${accuracy}%`],
    ['Najwyższy osiągnięty poziom', `${sessionStats.numbersHighestLevel} z ${NUMBERS_LEVELS.length}`],
    ['Aktualny poziom', `${numbersLevel} z ${NUMBERS_LEVELS.length}`]
  ]);
  renderDigitAccuracy();
  renderHistoryPanel();
}

function renderDigitAccuracy() {
  fillDigitGrid(document.querySelector('#statsDigitGrid'), document.querySelector('#statsDigitHeading'), sessionStats.numbersPerDigit);
}

function fillDigitGrid(grid, heading, perDigit) {
  grid.replaceChildren();
  const totalAttempts = Object.values(perDigit).reduce((sum, stat) => sum + stat.correct + stat.wrong, 0);
  heading.hidden = totalAttempts === 0;
  if (totalAttempts === 0) return;
  for (let digit = 1; digit <= 10; digit++) {
    const stat = perDigit[digit] ?? { correct: 0, wrong: 0 };
    const total = stat.correct + stat.wrong;
    const item = document.createElement('div');
    if (total === 0) item.classList.add('dim');
    else if (stat.correct / total >= 0.75) item.classList.add('ok');
    else if (stat.correct / total < 0.5) item.classList.add('bad');
    const digitLabel = document.createElement('strong');
    digitLabel.textContent = String(digit);
    const detail = document.createElement('small');
    detail.textContent = total === 0 ? '—' : `${stat.correct}/${total} · ${Math.round((stat.correct / total) * 100)}%`;
    item.append(digitLabel, detail);
    grid.append(item);
  }
}

function formatDateShort(timestamp) {
  try {
    return new Date(timestamp).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return new Date(timestamp).toISOString().split('T')[0]; }
}

function renderHistoryPanel() {
  const totalMs = Object.values(historicalStats.timeByGame).reduce((sum, ms) => sum + ms, 0);
  const currentSessionMs = Date.now() - currentSessionStartAt;
  const totalInApp = (historicalStats.totalInAppMs ?? 0) + currentSessionMs;
  const averageSession = historicalStats.sessionsCount > 0 ? totalInApp / historicalStats.sessionsCount : 0;
  const longestSession = Math.max(historicalStats.longestSessionMs ?? 0, currentSessionMs);
  document.querySelector('#historySummary').innerHTML = `Zbieramy dane od <strong>${formatDateShort(historicalStats.firstSessionAt)}</strong>. Łącznie sesji: <strong>${historicalStats.sessionsCount}</strong>.`;
  fillList(document.querySelector('#historySessionsList'), [
    ['Ostatnio grane', historicalStats.lastPlayedAt ? formatRelative(historicalStats.lastPlayedAt) : 'jeszcze nic'],
    ['Czas w aplikacji', formatDuration(totalInApp)],
    ['Średnia sesja', formatDuration(averageSession)],
    ['Najdłuższa sesja', formatDuration(longestSession)]
  ]);
  renderBucketBars();
  fillList(document.querySelector('#historyTimeList'), [
    ['Puzzle', formatDuration(historicalStats.timeByGame.puzzle)],
    ['Memo', formatDuration(historicalStats.timeByGame.memo)],
    ['Liczby', formatDuration(historicalStats.timeByGame.numbers)],
    ['Ślad', formatDuration(historicalStats.timeByGame.trace)],
    ['Łącznie w grach', formatDuration(totalMs)]
  ]);
  renderFrequencyBars(totalMs);
  renderRecords();
  fillList(document.querySelector('#historyAchievementsList'), [
    ['Puzzle — ułożone (Ł/Ś/T)', `${historicalStats.puzzleByDifficulty.easy} / ${historicalStats.puzzleByDifficulty.medium} / ${historicalStats.puzzleByDifficulty.hard}`],
    ['Puzzle — razem', historicalStats.puzzleCompleted],
    ['Memo — skończone (Ł/Ś/T)', `${historicalStats.memoByDifficulty.easy} / ${historicalStats.memoByDifficulty.medium} / ${historicalStats.memoByDifficulty.hard}`],
    ['Memo — razem', historicalStats.memoCompleted],
    ['Ślady ukończone', historicalStats.traceCompleted]
  ]);
  const attemptsAll = historicalStats.numbersCorrect + historicalStats.numbersWrong;
  const accuracyAll = attemptsAll > 0 ? Math.round((historicalStats.numbersCorrect / attemptsAll) * 100) : 0;
  fillList(document.querySelector('#historyNumbersList'), [
    ['Poprawnie', historicalStats.numbersCorrect],
    ['Błędnie', historicalStats.numbersWrong],
    ['Trafność', `${accuracyAll}%`],
    ['Najwyższy osiągnięty poziom', `${historicalStats.numbersHighestLevel} z ${NUMBERS_LEVELS.length}`]
  ]);
  fillDigitGrid(document.querySelector('#historyDigitGrid'), document.querySelector('#historyDigitHeading'), historicalStats.numbersPerDigit);
}

const BUCKET_LABELS = { morning: 'Rano', noon: 'Południe', afternoon: 'Popołudnie', evening: 'Wieczór', night: 'Noc' };
const BUCKET_ORDER = ['morning', 'noon', 'afternoon', 'evening', 'night'];

function renderBucketBars() {
  const container = document.querySelector('#historyBucketsBars');
  container.replaceChildren();
  const buckets = historicalStats.timeOfDayBuckets;
  const max = Math.max(1, ...Object.values(buckets));
  for (const key of BUCKET_ORDER) {
    const count = buckets[key] ?? 0;
    container.append(makeBar(BUCKET_LABELS[key], count, max, `${count} sesji`));
  }
}

function renderFrequencyBars(totalMs) {
  const container = document.querySelector('#historyFrequencyBars');
  container.replaceChildren();
  const labels = { puzzle: 'Puzzle', memo: 'Memo', numbers: 'Liczby', trace: 'Ślad' };
  for (const key of ['puzzle', 'memo', 'numbers', 'trace']) {
    const value = historicalStats.timeByGame[key] ?? 0;
    const percent = totalMs > 0 ? Math.round((value / totalMs) * 100) : 0;
    container.append(makeBar(labels[key], value, totalMs || 1, `${percent}%`));
  }
}

function makeBar(labelText, value, max, valueText) {
  const row = document.createElement('div');
  row.className = 'bars-row';
  const label = document.createElement('span');
  label.className = 'bar-label';
  label.textContent = labelText;
  const track = document.createElement('div');
  track.className = 'bar-track';
  const fill = document.createElement('div');
  fill.className = 'bar-fill';
  fill.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  track.append(fill);
  const val = document.createElement('span');
  val.className = 'bar-value';
  val.textContent = valueText;
  row.append(label, track, val);
  return row;
}

function renderRecords() {
  const container = document.querySelector('#historyRecords');
  container.replaceChildren();
  const games = [
    { key: 'puzzle', label: 'Puzzle' },
    { key: 'memo', label: 'Memo' }
  ];
  for (const game of games) {
    const section = document.createElement('section');
    const heading = document.createElement('h5');
    heading.textContent = game.label;
    section.append(heading);
    const difficulties = [
      { key: 'easy', label: 'Łatwe' },
      { key: 'medium', label: 'Średnie' },
      { key: 'hard', label: 'Trudne' }
    ];
    for (const level of difficulties) {
      const record = historicalStats.records[game.key][level.key];
      const row = document.createElement('div');
      row.className = 'record-row' + (record === null ? ' empty' : '');
      const name = document.createElement('span');
      name.textContent = level.label;
      const time = document.createElement('strong');
      time.textContent = record === null ? '—' : formatDuration(record);
      row.append(name, time);
      section.append(row);
    }
    container.append(section);
  }
  // Third column: general summary card
  const summary = document.createElement('section');
  const sHeading = document.createElement('h5');
  sHeading.textContent = 'Podsumowanie';
  summary.append(sHeading);
  const rows = [
    ['Ukończone puzzle', historicalStats.puzzleCompleted],
    ['Ukończone memo', historicalStats.memoCompleted],
    ['Ukończone ślady', historicalStats.traceCompleted]
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'record-row';
    const name = document.createElement('span');
    name.textContent = label;
    const val = document.createElement('strong');
    val.textContent = String(value);
    row.append(name, val);
    summary.append(row);
  }
  container.append(summary);
}

function formatRelative(timestamp) {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 45) return 'przed chwilą';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.floor(minutes / 60);
  const now = new Date();
  const then = new Date(timestamp);
  const sameDay = now.toDateString() === then.toDateString();
  const timePart = then.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `dziś o ${timePart}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === then.toDateString()) return `wczoraj o ${timePart}`;
  if (hours < 24 * 7) return `${Math.floor(hours / 24)} dni temu`;
  return then.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
}
document.querySelector('#addPhotosButton').addEventListener('click', () => openLibrary());
document.querySelector('#randomSelectButton').addEventListener('click', () => {
  if (currentGame !== 'memo') return;
  if (photos.length < memoPairs) {
    notify(`Potrzeba przynajmniej ${memoPairs} obrazków.`);
    return;
  }
  const picked = shuffled(photos).slice(0, memoPairs);
  selectedPhotoIds = new Set(picked.map(photo => photo.id));
  renderLibrary();
});
startGameButton.addEventListener('click', () => {
  const chosen = photos.filter(photo => selectedPhotoIds.has(photo.id));
  if (currentGame === 'puzzle') startPuzzle(chosen[0]);
  if (currentGame === 'memo') startMemo(chosen);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('#homeScreen').hidden) return;
  if (event.key === 'Escape') {
    currentGame = null;
    showScreen('homeScreen');
  }
});

function startNumbers() {
  numbersRound();
  showScreen('numbersScreen');
}

function numbersRound() {
  const stage = document.querySelector('#numbersStage');
  const choices = document.querySelector('#numbersChoices');
  stage.replaceChildren();
  choices.replaceChildren();
  const maxDigit = NUMBERS_LEVELS[numbersLevel - 1];
  let count;
  let attempts = 0;
  do {
    count = 1 + Math.floor(Math.random() * maxDigit);
    attempts++;
  } while (count === lastNumbersCount && maxDigit > 1 && attempts < 10);
  lastNumbersCount = count;
  const topCount = Math.ceil(count / 2);
  const bottomCount = count - topCount;
  stage.style.setProperty('--truck-columns', String(topCount || 1));
  const topRow = document.createElement('div');
  topRow.className = 'number-stage-row';
  for (let index = 0; index < topCount; index++) topRow.append(createTruck(index));
  stage.append(topRow);
  if (bottomCount > 0) {
    const bottomRow = document.createElement('div');
    bottomRow.className = 'number-stage-row';
    for (let index = 0; index < bottomCount; index++) bottomRow.append(createTruck(topCount + index));
    stage.append(bottomRow);
  }
  const options = new Set([count]);
  while (options.size < 3) options.add(1 + Math.floor(Math.random() * maxDigit));
  for (const digit of shuffled([...options])) {
    const button = document.createElement('button');
    button.className = 'digit-card';
    button.type = 'button';
    button.textContent = String(digit);
    button.setAttribute('aria-label', `Liczba ${digit}`);
    button.addEventListener('click', () => handleDigitClick(button, digit, count));
    choices.append(button);
  }
  document.querySelector('#numbersProgress').textContent = `1–${maxDigit}`;
  requestAnimationFrame(fitNumberStage);
}

function createTruck(index) {
  const item = document.createElement('img');
  item.src = NUMBERS_ASSET;
  item.alt = '';
  item.className = 'number-item number-item-truck';
  item.style.animationDelay = `${index * 60}ms`;
  return item;
}

function handleDigitClick(button, digit, correct) {
  if (digit === correct) {
    button.classList.add('digit-right');
    correctStreak++;
    wrongStreak = 0;
    sessionStats.numbersCorrect++;
    sessionStats.numbersPerDigit[correct].correct++;
    historicalStats.numbersCorrect++;
    historicalStats.numbersPerDigit[correct] = historicalStats.numbersPerDigit[correct] ?? { correct: 0, wrong: 0 };
    historicalStats.numbersPerDigit[correct].correct++;
    persistHistory();
    if (correctStreak >= NUMBERS_LEVEL_UP_STREAK && numbersLevel < NUMBERS_LEVELS.length) {
      numbersLevel++;
      correctStreak = 0;
    }
    if (numbersLevel > sessionStats.numbersHighestLevel) sessionStats.numbersHighestLevel = numbersLevel;
    if (numbersLevel > historicalStats.numbersHighestLevel) { historicalStats.numbersHighestLevel = numbersLevel; persistHistory(); }
    updateNumbersProgress();
    const word = NUMBER_WORDS[correct] ?? '';
    const praise = PRAISE_LINES[praiseIndex++ % PRAISE_LINES.length];
    speakLines(word, praise);
    celebrate(`${word}!`, { digit: correct });
    setTimeout(() => numbersRound(), 3600);
  } else {
    button.classList.add('digit-wrong');
    wrongStreak++;
    correctStreak = 0;
    sessionStats.numbersWrong++;
    sessionStats.numbersPerDigit[correct].wrong++;
    historicalStats.numbersWrong++;
    historicalStats.numbersPerDigit[correct] = historicalStats.numbersPerDigit[correct] ?? { correct: 0, wrong: 0 };
    historicalStats.numbersPerDigit[correct].wrong++;
    persistHistory();
    if (wrongStreak >= NUMBERS_LEVEL_DOWN_STREAK && numbersLevel > 1) {
      numbersLevel--;
      wrongStreak = 0;
    }
    updateNumbersProgress();
    playBuzz();
    speakLines(NUMBER_WORDS[digit] ?? '');
    setTimeout(() => button.classList.remove('digit-wrong'), 500);
  }
}

function updateNumbersProgress() {
  document.querySelector('#numbersProgress').textContent = `1\u2013${NUMBERS_LEVELS[numbersLevel - 1]}`;
}

function ensureAudioContext() {
  if (!audioContext) {
    try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (error) { audioContext = null; }
  }
  if (audioContext && audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function playChord() {
  const context = ensureAudioContext();
  if (!context) return;
  const now = context.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(context.destination);
    const startAt = now + index * 0.08;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(0.14, startAt + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.9);
    oscillator.start(startAt);
    oscillator.stop(startAt + 1);
  });
}

function playBuzz() {
  const context = ensureAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(320, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(200, context.currentTime + 0.2);
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.linearRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.28);
}

function speakPolish(text) {
  speakLines(text);
}

function speakLines(...lines) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    for (const text of lines) {
      if (!text) continue;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pl-PL';
      utterance.rate = 0.95;
      utterance.pitch = 1.15;
      speechSynthesis.speak(utterance);
    }
  } catch (error) { /* ignore */ }
}

function fitNumberStage() {
  const stage = document.querySelector('#numbersStage');
  if (!stage || stage.offsetHeight === 0) return;
  const rows = [...stage.querySelectorAll('.number-stage-row')];
  if (rows.length === 0) return;
  const columns = rows[0].querySelectorAll('.number-item').length || 1;
  const styles = getComputedStyle(stage);
  const gap = parseFloat(styles.getPropertyValue('--truck-gap')) || 14;
  const availW = stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
  const availH = stage.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
  const maxByW = (availW - (columns - 1) * gap) / columns;
  const maxByH = (availH - (rows.length - 1) * gap) / rows.length;
  const size = Math.max(60, Math.min(maxByW, maxByH, 240));
  stage.style.setProperty('--truck-item-size', `${Math.floor(size)}px`);
}

function fitMemoBoard() {
  const board = document.querySelector('#memoBoard');
  if (!board || board.offsetHeight === 0) return;
  const rows = [...board.querySelectorAll('.memo-row')];
  if (rows.length === 0) return;
  const maxCols = Math.max(...rows.map(row => row.querySelectorAll('.memo-card').length));
  const gap = parseFloat(getComputedStyle(board).getPropertyValue('--memo-gap')) || 14;
  const availW = board.clientWidth;
  const availH = board.clientHeight;
  const maxCardWFromW = (availW - (maxCols - 1) * gap) / maxCols;
  const maxCardHFromH = (availH - (rows.length - 1) * gap) / rows.length;
  const cardW = Math.max(50, Math.min(maxCardWFromW, maxCardHFromH * 1.05, 260));
  board.style.setProperty('--memo-card-w', `${Math.floor(cardW)}px`);
}

window.addEventListener('resize', () => {
  fitNumberStage();
  fitMemoBoard();
  fitPuzzleBoard();
});

function celebrate(message = 'Brawo!', options = {}) {
  const confetti = document.createElement('div');
  confetti.className = 'confetti';
  confetti.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 42; index++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.setProperty('--left', `${Math.random() * 100}%`);
    piece.style.setProperty('--delay', `${(Math.random() * 0.1).toFixed(2)}s`);
    piece.style.setProperty('--duration', `${(2 + Math.random() * 1.2).toFixed(2)}s`);
    piece.style.setProperty('--hue', String(Math.floor(Math.random() * 360)));
    piece.style.setProperty('--tilt', `${Math.floor(Math.random() * 120 - 60)}deg`);
    confetti.append(piece);
  }
  const overlay = document.createElement('div');
  overlay.className = 'celebration';
  overlay.setAttribute('aria-hidden', 'true');
  const iconHtml = options.digit !== undefined
    ? `<div class="celebration-digit">${options.digit}</div>`
    : `<div class="celebration-face">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="46" fill="#f1c64f" />
          <circle cx="35" cy="42" r="6" fill="#25312e" />
          <circle cx="65" cy="42" r="6" fill="#25312e" />
          <path d="M28 58 Q50 82 72 58" fill="none" stroke="#25312e" stroke-width="6" stroke-linecap="round" />
        </svg>
      </div>`;
  overlay.innerHTML = `${iconHtml}<div class="celebration-message"></div>`;
  overlay.querySelector('.celebration-message').textContent = message;
  document.body.append(confetti);
  document.body.append(overlay);
  playChord();
  setTimeout(() => overlay.classList.add('celebration-out'), 3800);
  setTimeout(() => { overlay.remove(); confetti.remove(); }, 5200);
}

function startTrace() {
  const svg = document.querySelector('#traceSvg');
  const path = TRACE_PATHS[traceIndex % TRACE_PATHS.length];
  document.querySelector('#tracePath').setAttribute('d', path.d);
  document.querySelector('#tracePath2').setAttribute('d', path.d);
  const [sx, sy] = path.start;
  const [ex, ey] = path.end;
  const start = document.querySelector('#traceStart');
  start.setAttribute('cx', sx);
  start.setAttribute('cy', sy);
  const startLabel = document.querySelector('#traceStartLabel');
  startLabel.setAttribute('x', sx);
  startLabel.setAttribute('y', sy);
  document.querySelector('#traceEnd').setAttribute('transform', `translate(${ex} ${ey})`);
  document.querySelector('#traceTrail').setAttribute('points', '');
  traceTrailPoints = [];
  traceActive = false;
  traceStartTouched = false;
  document.querySelector('#traceProgress').textContent = `Ślad ${traceIndex + 1} · ${path.name}`;
  showScreen('traceScreen');
}

function tracePointFromEvent(event) {
  const svg = document.querySelector('#traceSvg');
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const x = ((event.clientX - rect.left) / rect.width) * viewBox.width;
  const y = ((event.clientY - rect.top) / rect.height) * viewBox.height;
  return { x, y };
}

function tracePointerDown(event) {
  const svg = document.querySelector('#traceSvg');
  const point = tracePointFromEvent(event);
  const path = TRACE_PATHS[traceIndex % TRACE_PATHS.length];
  const [sx, sy] = path.start;
  const distStart = Math.hypot(point.x - sx, point.y - sy);
  if (distStart > 60) return;
  event.preventDefault();
  svg.setPointerCapture(event.pointerId);
  traceActive = true;
  traceStartTouched = true;
  traceTrailPoints = [`${sx},${sy}`, `${point.x.toFixed(1)},${point.y.toFixed(1)}`];
  document.querySelector('#traceTrail').setAttribute('points', traceTrailPoints.join(' '));
}

function tracePointerMove(event) {
  if (!traceActive) return;
  event.preventDefault();
  const point = tracePointFromEvent(event);
  traceTrailPoints.push(`${point.x.toFixed(1)},${point.y.toFixed(1)}`);
  if (traceTrailPoints.length > 400) traceTrailPoints.splice(1, traceTrailPoints.length - 400);
  document.querySelector('#traceTrail').setAttribute('points', traceTrailPoints.join(' '));
  const path = TRACE_PATHS[traceIndex % TRACE_PATHS.length];
  const [ex, ey] = path.end;
  if (Math.hypot(point.x - ex, point.y - ey) < 50) {
    traceActive = false;
    document.querySelector('#traceSvg').releasePointerCapture(event.pointerId);
    sessionStats.traceCompleted++;
    historicalStats.traceCompleted++;
    persistHistory();
    celebrate('Brawo!');
    setTimeout(() => { traceIndex++; startTrace(); }, 3600);
  }
}

function tracePointerUp(event) {
  if (!traceActive) return;
  traceActive = false;
  try { document.querySelector('#traceSvg').releasePointerCapture(event.pointerId); } catch (_) {}
}

document.querySelector('#traceSvg').addEventListener('pointerdown', tracePointerDown);
document.querySelector('#traceSvg').addEventListener('pointermove', tracePointerMove);
document.querySelector('#traceSvg').addEventListener('pointerup', tracePointerUp);
document.querySelector('#traceSvg').addEventListener('pointercancel', tracePointerUp);

window.addEventListener('pagehide', () => {
  if (activeGameKey) {
    const delta = Date.now() - activeGameStart;
    sessionStats.timeByGame[activeGameKey] = (sessionStats.timeByGame[activeGameKey] ?? 0) + delta;
    historicalStats.timeByGame[activeGameKey] = (historicalStats.timeByGame[activeGameKey] ?? 0) + delta;
    activeGameStart = Date.now();
  }
  const sessionMs = Date.now() - currentSessionStartAt;
  historicalStats.totalInAppMs = (historicalStats.totalInAppMs ?? 0) + sessionMs;
  if (sessionMs > (historicalStats.longestSessionMs ?? 0)) historicalStats.longestSessionMs = sessionMs;
  try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historicalStats)); } catch (_) {}
});

loadPhotos().catch(error => {
  console.error(error);
  notify('Nie udało się otworzyć galerii na tym urządzeniu.');
});