const viewport = document.getElementById('viewport');
const track = document.getElementById('movimiento');

const infoModal = document.getElementById('info-modal');
const modalSheet = document.getElementById('modal-sheet');
const modalBadge = document.getElementById('modal-badge');
const modalImg = document.getElementById('modal-img');
const modalMeta = document.getElementById('modal-meta');
const modalText = document.getElementById('modal-text');
const modalBody = document.getElementById('modal-body');
const closeModalBtn = document.getElementById('close-modal');

// Configuración de velocidades y gestos (en px)
const AUTO_SPEED = 22;          // Velocidad rápida por defecto
const HOLD_SPEED = 3.5;         // Velocidad lenta al mantener presionado
const EASE_FACTOR = 0.08;
const SWIPE_LEFT_THRESHOLD = 65;
const SWIPE_RIGHT_THRESHOLD = 65;
const PINCH_CLOSE_THRESHOLD = 45;

let itemsData = [];
let currentIndex = 0;
let currentY = 0;
let currentSpeed = AUTO_SPEED;
let halfTrackHeight = 0;

// Estado táctil en la vista principal
let isHolding = false;
let hasTriggeredLeftSwipe = false;
let pointerStartX = 0;
let lastPointerY = 0;

// Estado táctil dentro del modal
let isModalOpen = false;
let isTransitioningCard = false;
const activePointers = new Map();
let singlePointerStartX = 0;
let singlePointerStartY = 0;
let initialPinchDistance = null;
let modalHasActed = false;

async function init() {
  try {
    const response = await fetch('imagenes.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    itemsData = await response.json();
    if (!Array.isArray(itemsData) || itemsData.length === 0) {
      throw new Error('imagenes.json está vacío');
    }

    renderStream(itemsData);
    waitForImagesAndCalculateBounds();
    window.addEventListener('resize', calculateBounds);

    requestAnimationFrame(animate);
  } catch (error) {
    console.error('Error al cargar imagenes.json:', error);
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
    const targetSpeed = isHolding ? HOLD_SPEED : AUTO_SPEED;
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
    modalText.textContent = item.info;
    modalText.classList.remove('modal-empty');
  } else {
    modalText.textContent = 'Esta imagen no tiene información registrada.';
    modalText.classList.add('modal-empty');
  }

  modalBody.scrollTop = 0;
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

    setTimeout(() => {
      modalSheet.classList.remove('is-entering-left');
      isTransitioningCard = false;
    }, 260);
  }, 190);
}

function openInfoModal(index) {
  isHolding = false;
  hasTriggeredLeftSwipe = false;
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
}

function closeInfoModal() {
  isModalOpen = false;
  isTransitioningCard = false;
  activePointers.clear();
  initialPinchDistance = null;
  modalSheet.style.transition = '';
  modalSheet.style.transform = '';
  modalSheet.style.opacity = '';
  modalSheet.classList.remove('is-exiting-right', 'is-entering-left');

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
  pointerStartX = e.clientX;
  lastPointerY = e.clientY;

  viewport.classList.add('is-holding');
  viewport.setPointerCapture(e.pointerId);
  updateActiveCard(e.clientX, e.clientY);
});

viewport.addEventListener('pointermove', (e) => {
  if (!isHolding || isModalOpen) return;

  const deltaX = e.clientX - pointerStartX;
  const deltaY = e.clientY - lastPointerY;
  lastPointerY = e.clientY;

  currentY += deltaY;

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
  if (!isModalOpen || e.target === closeModalBtn) return;

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
closeModalBtn.addEventListener('click', closeInfoModal);

init();