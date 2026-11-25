const viewport = document.getElementById('viewport');
const track = document.getElementById('movimiento');

const infoModal = document.getElementById('info-modal');
const modalSheet = document.getElementById('modal-sheet');
const modalBadge = document.getElementById('modal-badge');
const modalImg = document.getElementById('modal-img');
const modalText = document.getElementById('modal-text');
const modalBody = document.getElementById('modal-body');
const closeModalBtn = document.getElementById('close-modal');

// Configuración de velocidades y gestos (en px)
const AUTO_SPEED = 22;     // Velocidad rápida por defecto
const HOLD_SPEED = 3.5;    // Velocidad lenta al mantener oprimido
const EASE_FACTOR = 0.08;
const SWIPE_LEFT_THRESHOLD = 65;
const SWIPE_UP_THRESHOLD = 65;
const SWIPE_DOWN_THRESHOLD = 75;

let itemsData = [];
let currentIndex = 0;      // Índice dentro de itemsData
let currentY = 0;
let currentSpeed = AUTO_SPEED;
let halfTrackHeight = 0;

// Estado táctil en la vista principal
let isHolding = false;
let hasTriggeredLeftSwipe = false;
let pointerStartX = 0;
let pointerStartY = 0;
let lastPointerY = 0;

// Estado táctil dentro del modal
let isModalOpen = false;
let modalStartY = 0;
let modalLastY = 0;
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
      <img src="${item.url}" alt="Imagen ${item.id}" loading="eager">
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
  ).then(calculateBounds);
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

  modalBadge.textContent = `Imagen ${currentIndex + 1} de ${itemsData.length} · ID ${item.id}`;
  modalImg.src = item.url;
  modalImg.alt = `Imagen ${item.id}`;

  if (item.info && item.info.trim().length > 0) {
    modalText.textContent = item.info;
    modalText.classList.remove('modal-empty');
  } else {
    modalText.textContent = 'Esta imagen no tiene información registrada.';
    modalText.classList.add('modal-empty');
  }

  modalBody.scrollTop = 0;
}

function openInfoModal(index) {
  isHolding = false;
  hasTriggeredLeftSwipe = false;
  viewport.classList.remove('is-holding');
  isModalOpen = true;

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
  modalSheet.style.transform = '';
  modalSheet.style.opacity = '';

  if (typeof infoModal.close === 'function') {
    infoModal.close();
  } else {
    infoModal.removeAttribute('open');
  }
}

// Gestos en la vista principal
viewport.addEventListener('pointerdown', (e) => {
  if (isModalOpen) return;

  isHolding = true;
  hasTriggeredLeftSwipe = false;
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;
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

  // Permite acompañar el movimiento vertical mientras mantiene oprimido
  currentY += deltaY;

  // Detectar deslizamiento hacia la izquierda para desplegar información
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
// - Deslizar hacia arriba: pasa a la información de la imagen siguiente
// - Deslizar hacia abajo: regresa a la página principal
infoModal.addEventListener('pointerdown', (e) => {
  if (!isModalOpen || e.target === closeModalBtn) return;

  modalStartY = e.clientY;
  modalLastY = e.clientY;
  modalHasActed = false;
});

infoModal.addEventListener('pointermove', (e) => {
  if (!isModalOpen || modalHasActed) return;

  const deltaY = e.clientY - modalStartY;
  const stepY = e.clientY - modalLastY;
  modalLastY = e.clientY;

  const isAtTop = modalBody.scrollTop <= 0;
  const isAtBottom = modalBody.scrollTop + modalBody.clientHeight >= modalBody.scrollHeight - 2;

  // Si desliza hacia abajo desde arriba, dar feedback visual de cierre
  if (isAtTop && deltaY > 0) {
    modalSheet.style.transform = `translateY(${Math.min(deltaY * 0.45, 160)}px)`;
  }

  // Deslizar hacia arriba -> siguiente imagen
  if ((isAtTop || isAtBottom) && deltaY <= -SWIPE_UP_THRESHOLD) {
    modalHasActed = true;
    modalSheet.style.transform = '';
    renderModalContent(currentIndex + 1);
    if (navigator.vibrate) {
      navigator.vibrate(12);
    }
    return;
  }

  // Deslizar hacia abajo desde el inicio -> volver a la página principal
  if (isAtTop && deltaY >= SWIPE_DOWN_THRESHOLD) {
    modalHasActed = true;
    closeInfoModal();
    return;
  }

  // Permitir scroll normal del texto si no se cumple gesto de cambio/cierre
  if (!isAtTop || deltaY < 0) {
    modalBody.scrollTop -= stepY;
  }
});

function handleModalRelease() {
  if (!isModalOpen) return;
  if (!modalHasActed) {
    modalSheet.style.transform = '';
  }
  modalHasActed = false;
}

infoModal.addEventListener('pointerup', handleModalRelease);
infoModal.addEventListener('pointercancel', handleModalRelease);
closeModalBtn.addEventListener('click', closeInfoModal);

init();