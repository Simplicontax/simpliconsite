/**
 * E-Filing Season Popup - Date-aware announcement
 * Shows different messages based on IRS e-filing season dates
 */

// Show popup every time home page is loaded (no storage/dismiss persistence)

// IRS E-Filing season dates (adjust yearly if needed)
function getSeasonDates(year: number) {
  return {
    openDate: new Date(year, 0, 26),      // Jan 26
    deadlineDate: new Date(year, 3, 15),  // Apr 15
    extendedDate: new Date(year, 9, 15),  // Oct 15 (extended deadline)
  };
}

function getCurrentSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const { openDate, extendedDate } = getSeasonDates(year);

  if (now < openDate) {
    return { status: 'opens_soon', year, openDate };
  }
  if (now <= extendedDate) {
    return { status: 'live', year, openDate };
  }
  return { status: 'closed', year: year + 1, openDate: getSeasonDates(year + 1).openDate };
}

function getPopupContent() {
  const season = getCurrentSeason();

  switch (season.status) {
    case 'opens_soon':
      return {
        title: 'E-Filing Opens Soon',
        message: `IRS will <strong class="efiling-popup-highlight">accept tax returns from 26th January</strong>, ${season.year}`,
        variant: 'info' as const,
      };
    case 'live':
      return {
        title: 'E-Filing Is Now Live',
        message: '<strong class="efiling-popup-highlight">IRS Accept Tax Returns From 26th January</strong>',
        variant: 'success' as const,
      };
    case 'closed':
      return {
        title: 'E-Filing Season Closed',
        message: `Check back for the ${season.year} filing season (opens late January)`,
        variant: 'info' as const,
      };
    default:
      return {
        title: 'E-Filing Is Now Live',
        message: '<strong class="efiling-popup-highlight">IRS Accept Tax Returns From 26th January</strong>',
        variant: 'success' as const,
      };
  }
}

function isHomePage(): boolean {
  const path = window.location.pathname;
  return path === '/' || path === '/index.html' || path.endsWith('/');
}

function createPopupElement() {
  const content = getPopupContent();
  const popup = document.createElement('div');
  popup.className = `efiling-popup-overlay efiling-popup--${content.variant}`;
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-labelledby', 'efiling-popup-title');
  popup.innerHTML = `
    <div class="efiling-popup">
      <button class="efiling-popup-close" aria-label="Close">×</button>
      <div class="efiling-popup-content">
        <h2 id="efiling-popup-title" class="efiling-popup-title">${content.title}</h2>
        <p class="efiling-popup-message">${content.message}</p>
      </div>
    </div>
  `;
  return popup;
}

function initEfilingPopup() {
  if (!isHomePage()) return;

  const popup = createPopupElement();
  document.body.appendChild(popup);

  // Trigger animation
  requestAnimationFrame(() => {
    popup.classList.add('efiling-popup--visible');
  });

  const close = () => {
    popup.classList.remove('efiling-popup--visible');
    setTimeout(() => popup.remove(), 300);
  };

  popup.querySelector('.efiling-popup-close')?.addEventListener('click', close);
  popup.addEventListener('click', (e) => {
    if (e.target === popup) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  }, { once: true });
}

export function initEfilingPopupModule() {
  initEfilingPopup();
}
