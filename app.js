const DB_NAME = 'nasze-obrazki';
const DB_VERSION = 1;
const STORE_NAME = 'photos';
const PUZZLE_SIZE = 12;
const MEMO_PAIRS = 5;
const APP_VERSION = '0.6.3';

let puzzleColumns = 4;
let puzzleRows = 3;
let puzzleRatio = 1.333;
let numbersMaxDigit = 5;
let numbersCorrectStreak = 0;
let audioContext;

const NUMBER_WORDS = ['Zero', 'Jeden', 'Dwa', 'Trzy', 'Cztery', 'Pięć', 'Sześć', 'Siedem', 'Osiem', 'Dziewięć', 'Dziesięć'];
const PRAISE_LINES = ['Brawo Strażaku Jasiu!', 'Super Jasiu!'];
let praiseIndex = 0;
const NUMBERS_ASSET = 'assets/woz-strazacki.svg';

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

async function loadPhotos() {
  photos = (await withStore('readonly', store => store.getAll())).sort((a, b) => a.createdAt - b.createdAt);
  renderHomePhotos();
}

function imageUrl(photo) {
  if (!activePhotoUrls.has(photo.id)) activePhotoUrls.set(photo.id, URL.createObjectURL(photo.blob));
  return activePhotoUrls.get(photo.id);
}

function releasePhotoUrl(photoId) {
  const url = activePhotoUrls.get(photoId);
  if (url) URL.revokeObjectURL(url);
  activePhotoUrls.delete(photoId);
}

const GAME_SCREENS = new Set(['puzzleScreen', 'memoScreen', 'numbersScreen']);

function showScreen(screenId) {
  for (const screen of screens) screen.hidden = screen.id !== screenId;
  document.body.classList.toggle('locked-view', GAME_SCREENS.has(screenId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  document.querySelector('#libraryEyebrow').textContent = setup ? `WYBIERZ ZDJĘCIE · ${game === 'puzzle' ? 'PUZZLE' : 'MEMO'}` : 'DLA RODZICA';
  document.querySelector('#libraryTitle').textContent = setup ? (game === 'puzzle' ? 'Wybierz obrazek' : 'Wybierz 5 obrazków') : 'Wasze zdjęcia';
  document.querySelector('#libraryHint').textContent = setup
    ? (game === 'puzzle' ? 'Wybierz jedno zdjęcie do ułożenia.' : 'Dotknij pięciu zdjęć, z których zrobimy pary.')
    : 'Dodaj zdjęcia. Zostają zapisane tylko na tym urządzeniu.';
  startGameButton.hidden = !setup;
  selectionCount.hidden = !setup;
  document.querySelector('#libraryFooter').hidden = !setup;
  renderLibrary();
  showScreen('libraryScreen');
}

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
    card.className = `library-card${selectedPhotoIds.has(photo.id) ? ' selected' : ''}`;
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
    if (!currentGame) {
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
    else if (selectedPhotoIds.size < MEMO_PAIRS) selectedPhotoIds.add(photoId);
    else notify('Wybierz dokładnie 5 zdjęć.');
  }
  renderLibrary();
}

function updateSelectionUi() {
  if (!currentGame) return;
  const count = selectedPhotoIds.size;
  selectionCount.textContent = currentGame === 'puzzle'
    ? (count ? '1 zdjęcie wybrane' : 'Wybierz 1 zdjęcie')
    : `${count} z ${MEMO_PAIRS} zdjęć`;
  startGameButton.disabled = count !== (currentGame === 'puzzle' ? 1 : MEMO_PAIRS);
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
  puzzleColumns = portrait ? 3 : 4;
  puzzleRows = portrait ? 4 : 3;
  puzzleRatio = width / height;
  board.style.removeProperty('aspect-ratio');
  board.style.gridTemplateColumns = `repeat(${puzzleColumns}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${puzzleRows}, 1fr)`;
  for (let index = 0; index < PUZZLE_SIZE; index++) {
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
  for (const pieceIndex of shuffled(Array.from({ length: PUZZLE_SIZE }, (_, index) => index))) {
    const piece = document.createElement('button');
    piece.className = 'puzzle-piece';
    piece.type = 'button';
    piece.dataset.piece = String(pieceIndex);
    piece.style.cssText = pieceStyle(photo, pieceIndex);
    piece.setAttribute('aria-label', `Element puzzli ${pieceIndex + 1}`);
    tray.append(piece);
  }
  document.querySelector('#puzzleProgress').textContent = `0 z ${PUZZLE_SIZE}`;
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
  document.querySelector('#puzzleProgress').textContent = `${placed} z ${PUZZLE_SIZE}`;
  if (placed === PUZZLE_SIZE) {
    document.querySelector('#puzzleComplete').hidden = false;
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
          document.querySelector('#memoProgress').textContent = `${foundPairs} z ${MEMO_PAIRS}`;
          if (foundPairs === MEMO_PAIRS) {
            document.querySelector('#memoComplete').hidden = false;
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
  document.querySelector('#memoProgress').textContent = `0 z ${MEMO_PAIRS}`;
  showScreen('memoScreen');
  requestAnimationFrame(fitMemoBoard);
}

document.querySelector('#memoAgainButton').addEventListener('click', () => startMemo(photos.filter(photo => selectedPhotoIds.has(photo.id))));
document.querySelectorAll('[data-game]').forEach(button => button.addEventListener('click', () => {
  const game = button.dataset.game;
  if (game === 'numbers') {
    currentGame = 'numbers';
    numbersMaxDigit = 5;
    numbersCorrectStreak = 0;
    startNumbers();
    return;
  }
  openLibrary(game);
}));

function goBack() {
  const puzzleActive = !document.querySelector('#puzzleScreen').hidden;
  const memoActive = !document.querySelector('#memoScreen').hidden;
  const numbersActive = !document.querySelector('#numbersScreen').hidden;
  if (puzzleActive || memoActive) {
    openLibrary(currentGame);
    return;
  }
  if (numbersActive) {
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
document.querySelector('#managePhotosButton').addEventListener('click', () => openLibrary());
document.querySelector('#addPhotosButton').addEventListener('click', () => openLibrary());
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
  const count = 1 + Math.floor(Math.random() * numbersMaxDigit);
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
  while (options.size < 3) options.add(1 + Math.floor(Math.random() * numbersMaxDigit));
  for (const digit of shuffled([...options])) {
    const button = document.createElement('button');
    button.className = 'digit-card';
    button.type = 'button';
    button.textContent = String(digit);
    button.setAttribute('aria-label', `Liczba ${digit}`);
    button.addEventListener('click', () => handleDigitClick(button, digit, count));
    choices.append(button);
  }
  document.querySelector('#numbersProgress').textContent = `1\u2013${numbersMaxDigit}`;  requestAnimationFrame(fitNumberStage);}

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
    numbersCorrectStreak++;
    if (numbersCorrectStreak >= 3 && numbersMaxDigit === 5) numbersMaxDigit = 7;
    else if (numbersCorrectStreak >= 6 && numbersMaxDigit === 7) numbersMaxDigit = 10;
    const word = NUMBER_WORDS[correct] ?? '';
    const praise = PRAISE_LINES[praiseIndex++ % PRAISE_LINES.length];
    speakLines(word, praise);
    celebrate(`${word}!`);
    setTimeout(() => numbersRound(), 1800);
  } else {
    button.classList.add('digit-wrong');
    playBuzz();
    setTimeout(() => button.classList.remove('digit-wrong'), 500);
  }
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

function celebrate(message = 'Brawo!') {
  const confetti = document.createElement('div');
  confetti.className = 'confetti';
  confetti.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 42; index++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.setProperty('--left', `${Math.random() * 100}%`);
    piece.style.setProperty('--delay', `${(Math.random() * 0.6).toFixed(2)}s`);
    piece.style.setProperty('--duration', `${(2.4 + Math.random() * 1.4).toFixed(2)}s`);
    piece.style.setProperty('--hue', String(Math.floor(Math.random() * 360)));
    piece.style.setProperty('--tilt', `${Math.floor(Math.random() * 120 - 60)}deg`);
    confetti.append(piece);
  }
  const overlay = document.createElement('div');
  overlay.className = 'celebration';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="celebration-face">
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="46" fill="#f1c64f" />
        <circle cx="35" cy="42" r="6" fill="#25312e" />
        <circle cx="65" cy="42" r="6" fill="#25312e" />
        <path d="M28 58 Q50 82 72 58" fill="none" stroke="#25312e" stroke-width="6" stroke-linecap="round" />
      </svg>
    </div>
    <div class="celebration-message"></div>
  `;
  overlay.querySelector('.celebration-message').textContent = message;
  document.body.append(confetti);
  document.body.append(overlay);
  playChord();
  setTimeout(() => overlay.classList.add('celebration-out'), 1900);
  setTimeout(() => { overlay.remove(); confetti.remove(); }, 2600);
}

loadPhotos().catch(error => {
  console.error(error);
  notify('Nie udało się otworzyć galerii na tym urządzeniu.');
});