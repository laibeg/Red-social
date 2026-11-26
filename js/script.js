const viewport = document.getElementById('viewport');
const track = document.getElementById('movimiento');

const infoModal = document.getElementById('info-modal');
const modalSheet = document.getElementById('modal-sheet');
const modalBadge = document.getElementById('modal-badge');
const modalImg = document.getElementById('modal-img');
const modalMeta = document.getElementById('modal-meta');
const modalText = document.getElementById('modal-text');
const modalInfoImg = document.getElementById('modal-info-img');
const modalBody = document.getElementById('modal-body');

// Configuración de velocidades, colores y gestos (en px)
const INITIAL_SPEED = 7;        // Velocidad inicial más rápida
const SPEED_INCREMENT = 5;      // Mayor tasa de incremento al volver de cada cuadro
const MAX_SPEED = 55;           // Límite superior de velocidad
const HOLD_SPEED = 2.5;         // Velocidad lenta al mantener presionado
const EASE_FACTOR = 0.08;
const SWIPE_LEFT_THRESHOLD = 60;
const SWIPE_RIGHT_THRESHOLD = 60;
const SWIPE_DOWN_THRESHOLD = 45;
const PINCH_CLOSE_THRESHOLD = 45;

// Paleta oscura con mayor contraste y variedad cromática (texto blanco legible)
const DARK_THEMES = [
  { bg: '#0e0232', modal: '#180754' }, // Índigo profundo original
  { bg: '#072a6e', modal: '#0d3d99' }, // Azul cobalto vibrante
  { bg: '#054a5e', modal: '#086985' }, // Cian/turquesa profundo
  { bg: '#3b0a6e', modal: '#531199' }, // Violeta intenso
  { bg: '#630b42', modal: '#87105a' }, // Magenta oscuro
  { bg: '#074d35', modal: '#0b6e4c' }, // Esmeralda oscura
  { bg: '#5c2d06', modal: '#7d3e09' }  // Ámbar/cobrizo oscuro
];

let itemsData = [];
let currentIndex = 0;
let currentColorIndex = 0;
let currentY = 0;
let currentAutoSpeed = INITIAL_SPEED;
let currentSpeed = INITIAL_SPEED;
let halfTrackHeight = 0;

// Estado táctil en la vista principal
let isHolding = false;
let hasTriggeredLeftSwipe = false;
let hasTriggeredDownSwipe = false;
let pointerStartX = 0;
let pointerStartY = 0;

// Estado táctil dentro del modal
let isModalOpen = false;
let isTransitioningCard = false;
const activePointers = new Map();
let singlePointerStartX = 0;
let singlePointerStartY = 0;
let initialPinchDistance = null;
let modalHasActed = false;

function applyDarkTheme(index) {
  const theme = DARK_THEMES[index % DARK_THEMES.length];
  document.documentElement.style.setProperty('--bg-color', theme.bg);
  document.documentElement.style.setProperty('--modal-bg', theme.modal);
  document.documentElement.style.backgroundColor = theme.bg;
  document.body.style.backgroundColor = theme.bg;
  modalSheet.style.backgroundColor = theme.modal;
}

function resetModalScroll() {
  modalBody.scrollTop = 0;
  requestAnimationFrame(() => {
    modalBody.scrollTop = 0;
  });
  setTimeout(() => {
    modalBody.scrollTop = 0;
  }, 50);
}

function isImagePath(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.includes('\n')) return false;
  return (
    /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(trimmed) ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/')
  );
}

async function init() {
  try {
    const response = await fetch(`imagenes.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    itemsData = await response.json();
    if (!Array.isArray(itemsData) || itemsData.length === 0) {
      throw new Error('imagenes.json está vacío');
    }

    applyDarkTheme(0);
    renderStream(itemsData);
    waitForImagesAndCalculateBounds();
    window.addEventListener('resize', calculateBounds);

    requestAnimationFrame(animate);
  } catch (error) {
    console.error('Error al cargar imagenes.json:', error);
  }
}

function cycleDarkBackground() {
  currentColorIndex = (currentColorIndex + 1) % DARK_THEMES.length;
  applyDarkTheme(currentColorIndex);
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
}

function renderStream(images) {
  const infiniteList = [...images, ...images];

  track.innerHTML = infiniteList.map((item, idx) => `
    <article class="card" data-id="${item.id}" data-index="${idx % images.length}">
      <img src="${item.url}" alt="${item.titulo || `Imagen ${item.id}`}" loading="eager" decoding="async">
    </article>
  `).join('');
}

function waitForImagesAndCalculateBounds() {
  const imgs = Array.from(track.querySelectorAll('img'));

  Promise.all(
    imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    })
  ).then(() => {
    calculateBounds();
    setTimeout(calculateBounds, 100);
  });
}

function calculateBounds() {
  requestAnimationFrame(() => {
    halfTrackHeight = track.scrollHeight / 2;
  });
}

function animate() {
  if (!isModalOpen) {
    const targetSpeed = isHolding ? Math.min(HOLD_SPEED, currentAutoSpeed) : currentAutoSpeed;
    currentSpeed += (targetSpeed - currentSpeed) * EASE_FACTOR;
    currentY -= currentSpeed;

    wrapPosition();
    track.style.transform = `translate3d(0, ${currentY}px, 0)`;
  }

  requestAnimationFrame(animate);
}

function wrapPosition() {
  if (halfTrackHeight === 0) return;

  if (currentY <= -halfTrackHeight) {
    currentY += halfTrackHeight;
  } else if (currentY > 0) {
    currentY -= halfTrackHeight;
  }
}

function updateActiveCard(x, y) {
  track.querySelectorAll('.card.is-active').forEach((el) => {
    el.classList.remove('is-active');
  });

  const elUnderFinger = document.elementFromPoint(x, y);
  const card = elUnderFinger ? elUnderFinger.closest('.card') : null;

  if (card) {
    card.classList.add('is-active');
    currentIndex = Number(card.dataset.index) || 0;
  }
}

function renderModalContent(index) {
  const normalizedIndex = ((index % itemsData.length) + itemsData.length) % itemsData.length;
  currentIndex = normalizedIndex;
  const item = itemsData[currentIndex];

  modalBadge.textContent = item.titulo || '';
  modalImg.src = item.url;
  modalImg.alt = item.titulo || `Imagen ${item.id}`;

  const metaLines = [item.autor, item.pagina, item.fecha]
    .filter((val) => typeof val === 'string' && val.trim().length > 0);

  modalMeta.innerHTML = metaLines
    .map((line) => `<span class="modal-meta-line">${line.trim()}</span>`)
    .join('');

  if (item.info && item.info.trim().length > 0) {
    if (isImagePath(item.info)) {
      modalText.style.display = 'none';
      modalText.textContent = '';
      if (modalInfoImg) {
        modalInfoImg.src = item.info.trim();
        modalInfoImg.alt = item.titulo || 'Información en imagen';
        modalInfoImg.style.display = 'block';
      }
    } else {
      if (modalInfoImg) {
        modalInfoImg.style.display = 'none';
        modalInfoImg.src = '';
      }
      modalText.style.display = 'block';
      modalText.textContent = item.info;
      modalText.classList.remove('modal-empty');
    }
  } else {
    if (modalInfoImg) {
      modalInfoImg.style.display = 'none';
      modalInfoImg.src = '';
    }
    modalText.style.display = 'block';
    modalText.textContent = 'Esta imagen no tiene información registrada.';
    modalText.classList.add('modal-empty');
  }

  resetModalScroll();
}

function transitionToNextItem() {
  if (isTransitioningCard) return;
  isTransitioningCard = true;

  modalSheet.style.transition = '';
  modalSheet.style.transform = '';
  modalSheet.classList.remove('is-entering-left');
  modalSheet.classList.add('is-exiting-right');

  if (navigator.vibrate) {
    navigator.vibrate(12);
  }

  setTimeout(() => {
    renderModalContent(currentIndex + 1);
    modalSheet.classList.remove('is-exiting-right');
    void modalSheet.offsetWidth;
    modalSheet.classList.add('is-entering-left');
    resetModalScroll();

    setTimeout(() => {
      modalSheet.classList.remove('is-entering-left');
      isTransitioningCard = false;
    }, 260);
  }, 190);
}

function openInfoModal(index) {
  isHolding = false;
  hasTriggeredLeftSwipe = false;
  hasTriggeredDownSwipe = false;
  viewport.classList.remove('is-holding');
  isModalOpen = true;
  isTransitioningCard = false;
  activePointers.clear();
  initialPinchDistance = null;
  modalHasActed = false;

  modalSheet.style.transition = '';
  modalSheet.style.transform = '';
  modalSheet.classList.remove('is-exiting-right', 'is-entering-left');

  renderModalContent(index);

  if (navigator.vibrate) {
    navigator.vibrate(20);
  }

  if (typeof infoModal.showModal === 'function') {
    infoModal.showModal();
  } else {
    infoModal.setAttribute('open', '');
  }

  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  resetModalScroll();
}

function closeInfoModal() {
  if (!isModalOpen) return;

  isModalOpen = false;
  isTransitioningCard = false;
  activePointers.clear();
  initialPinchDistance = null;
  modalSheet.style.transition = '';
  modalSheet.style.transform = '';
  modalSheet.style.opacity = '';
  modalSheet.classList.remove('is-exiting-right', 'is-entering-left');
  modalBody.scrollTop = 0;

  currentAutoSpeed = Math.min(currentAutoSpeed + SPEED_INCREMENT, MAX_SPEED);

  if (typeof infoModal.close === 'function') {
    infoModal.close();
  } else {
    infoModal.removeAttribute('open');
  }
}

function getPinchDistance() {
  if (activePointers.size < 2) return null;
  const [p1, p2] = Array.from(activePointers.values());
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// Gestos en la vista principal
viewport.addEventListener('pointerdown', (e) => {
  if (isModalOpen) return;

  isHolding = true;
  hasTriggeredLeftSwipe = false;
  hasTriggeredDownSwipe = false;
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;

  viewport.classList.add('is-holding');
  viewport.setPointerCapture(e.pointerId);
  updateActiveCard(e.clientX, e.clientY);
});

viewport.addEventListener('pointermove', (e) => {
  if (!isHolding || isModalOpen) return;

  const deltaX = e.clientX - pointerStartX;
  const totalDeltaY = e.clientY - pointerStartY;

  if (!hasTriggeredDownSwipe && totalDeltaY >= SWIPE_DOWN_THRESHOLD && totalDeltaY > Math.abs(deltaX) * 0.8) {
    hasTriggeredDownSwipe = true;
    cycleDarkBackground();
  }

  if (!hasTriggeredLeftSwipe && deltaX <= -SWIPE_LEFT_THRESHOLD) {
    hasTriggeredLeftSwipe = true;
    if (viewport.hasPointerCapture(e.pointerId)) {
      viewport.releasePointerCapture(e.pointerId);
    }
    openInfoModal(currentIndex);
  }
});

function handleViewportRelease(e) {
  if (!isHolding) return;

  isHolding = false;
  hasTriggeredLeftSwipe = false;
  hasTriggeredDownSwipe = false;
  viewport.classList.remove('is-holding');

  if (viewport.hasPointerCapture(e.pointerId)) {
    viewport.releasePointerCapture(e.pointerId);
  }
}

viewport.addEventListener('pointerup', handleViewportRelease);
viewport.addEventListener('pointercancel', handleViewportRelease);

// Gestos dentro del cuadro de información:
// - Deslizar a la derecha: animación lateral hacia la imagen siguiente
// - Pellizco (pinch) con dos dedos: regresa a la página principal
infoModal.addEventListener('pointerdown', (e) => {
  if (!isModalOpen) return;

  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  modalHasActed = false;

  if (activePointers.size === 1) {
    singlePointerStartX = e.clientX;
    singlePointerStartY = e.clientY;
    initialPinchDistance = null;
  } else if (activePointers.size >= 2) {
    modalSheet.style.transition = '';
    modalSheet.style.transform = '';
    initialPinchDistance = getPinchDistance();
  }
});

infoModal.addEventListener('pointermove', (e) => {
  if (!isModalOpen || modalHasActed || isTransitioningCard || !activePointers.has(e.pointerId)) return;

  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size >= 2) {
    const currentDistance = getPinchDistance();
    if (initialPinchDistance !== null && currentDistance !== null) {
      const pinchDelta = initialPinchDistance - currentDistance;
      if (pinchDelta >= PINCH_CLOSE_THRESHOLD) {
        modalHasActed = true;
        closeInfoModal();
      }
    }
    return;
  }

  const deltaX = e.clientX - singlePointerStartX;
  const deltaY = e.clientY - singlePointerStartY;

  if (deltaX > 10 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
    modalSheet.style.transition = 'none';
    modalSheet.style.transform = `translateX(${Math.min(deltaX * 0.45, 90)}px)`;

    if (deltaX >= SWIPE_RIGHT_THRESHOLD) {
      modalHasActed = true;
      transitionToNextItem();
    }
  }
});

function handleModalPointerEnd(e) {
  activePointers.delete(e.pointerId);

  if (activePointers.size < 2) {
    initialPinchDistance = null;
  }

  if (activePointers.size === 1) {
    const [remaining] = Array.from(activePointers.values());
    singlePointerStartX = remaining.x;
    singlePointerStartY = remaining.y;
  }

  if (activePointers.size === 0) {
    if (!modalHasActed && !isTransitioningCard) {
      modalSheet.style.transition = '';
      modalSheet.style.transform = '';
    }
    modalHasActed = false;
  }
}

infoModal.addEventListener('pointerup', handleModalPointerEnd);
infoModal.addEventListener('pointercancel', handleModalPointerEnd);

init();