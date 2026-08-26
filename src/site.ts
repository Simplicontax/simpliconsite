const header = document.getElementById('siteHeader');
const toggle = document.getElementById('menuToggle');
const nav = document.getElementById('siteNav');

toggle?.addEventListener('click', () => {
  const open = nav?.classList.toggle('open') ?? false;
  toggle.classList.toggle('active', open);
  toggle.setAttribute('aria-expanded', String(open));
});

nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  toggle?.classList.remove('active');
  toggle?.setAttribute('aria-expanded', 'false');
}));

window.addEventListener('scroll', () => header?.classList.toggle('scrolled', window.scrollY > 18), { passive: true });

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll<HTMLElement>('.modern-service, .country-cards article, .process-grid article, .reveal').forEach((element, index) => {
  if (element.classList.contains('reveal')) element.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
  revealObserver.observe(element);
});

const jurisdictionShowcase = document.querySelector<HTMLElement>('[data-jurisdiction-showcase]');
if (jurisdictionShowcase) {
  const rows = Array.from(jurisdictionShowcase.querySelectorAll<HTMLButtonElement>('[data-jurisdiction-index]'));
  const highlight = jurisdictionShowcase.querySelector<HTMLElement>('.jurisdiction-highlight');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeIndex = 0;
  let visible = false;
  let interacting = false;
  let rotationTimer: number | undefined;

  const positionHighlight = (): void => {
    const row = rows[activeIndex];
    if (!row || !highlight) return;
    jurisdictionShowcase.style.setProperty('--highlight-y', String(row.offsetTop) + 'px');
    jurisdictionShowcase.style.setProperty('--highlight-height', String(row.offsetHeight) + 'px');
  };

  const setActiveJurisdiction = (index: number): void => {
    if (!rows.length) return;
    activeIndex = (index + rows.length) % rows.length;
    jurisdictionShowcase.dataset.active = String(activeIndex);
    rows.forEach((row, rowIndex) => {
      const active = rowIndex === activeIndex;
      row.classList.toggle('active', active);
      row.setAttribute('aria-pressed', String(active));
    });
    window.requestAnimationFrame(positionHighlight);
  };

  const stopRotation = (): void => {
    if (rotationTimer !== undefined) window.clearInterval(rotationTimer);
    rotationTimer = undefined;
  };

  const startRotation = (): void => {
    stopRotation();
    if (reduceMotion || !visible || interacting || rows.length < 2) return;
    rotationTimer = window.setInterval(() => setActiveJurisdiction(activeIndex + 1), 3200);
  };

  rows.forEach((row, index) => {
    row.addEventListener('pointerenter', () => setActiveJurisdiction(index));
    row.addEventListener('focus', () => setActiveJurisdiction(index));
    row.addEventListener('click', () => setActiveJurisdiction(index));
  });

  jurisdictionShowcase.addEventListener('pointerenter', () => { interacting = true; stopRotation(); });
  jurisdictionShowcase.addEventListener('pointerleave', () => { interacting = false; startRotation(); });
  jurisdictionShowcase.addEventListener('focusin', () => { interacting = true; stopRotation(); });
  jurisdictionShowcase.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && jurisdictionShowcase.contains(event.relatedTarget)) return;
    interacting = false;
    startRotation();
  });

  const showcaseObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) startRotation(); else stopRotation();
  }, { threshold: 0.35 });
  showcaseObserver.observe(jurisdictionShowcase);
  new ResizeObserver(positionHighlight).observe(jurisdictionShowcase);
  setActiveJurisdiction(0);
}
const priceButtons = document.querySelectorAll<HTMLButtonElement>('[data-price-filter]');
const priceGroups = document.querySelectorAll<HTMLElement>('[data-price-group]');
priceButtons.forEach((button) => button.addEventListener('click', () => {
  const filter = button.dataset.priceFilter;
  priceButtons.forEach((item) => item.classList.toggle('active', item === button));
  priceGroups.forEach((group) => group.classList.toggle('active', group.dataset.priceGroup === filter));
}));

const resourceButtons = document.querySelectorAll<HTMLButtonElement>('[data-resource-filter]');
const resourceCards = document.querySelectorAll<HTMLElement>('[data-resource-category]');
const resourceSearch = document.getElementById('resourceSearch') as HTMLInputElement | null;
const resourceEmpty = document.getElementById('resourceEmpty');
let resourceFilter = 'all';

function filterResources(): void {
  const query = resourceSearch?.value.trim().toLowerCase() ?? '';
  let visible = 0;
  resourceCards.forEach((card) => {
    const categoryMatch = resourceFilter === 'all' || card.dataset.resourceCategory === resourceFilter;
    const queryMatch = !query || (card.textContent ?? '').toLowerCase().includes(query);
    const show = categoryMatch && queryMatch;
    card.classList.toggle('filtered-out', !show);
    if (show) visible += 1;
  });
  resourceEmpty?.classList.toggle('hidden', visible > 0);
}

resourceButtons.forEach((button) => button.addEventListener('click', () => {
  resourceFilter = button.dataset.resourceFilter ?? 'all';
  resourceButtons.forEach((item) => item.classList.toggle('active', item === button));
  filterResources();
}));
resourceSearch?.addEventListener('input', filterResources);

const contactForm = document.getElementById('contactForm') as HTMLFormElement | null;
const formSuccess = document.getElementById('formSuccess');
const formError = document.getElementById('formError');
contactForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!contactForm.reportValidity()) return;

  const submitButton = contactForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  const originalButtonContent = submitButton?.innerHTML ?? '';
  formError?.classList.remove('show');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="form-spinner" aria-hidden="true"></i> Sending…';
  }

  try {
    const payload = Object.fromEntries(new FormData(contactForm).entries());
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) throw new Error(result.error || 'We could not send your enquiry.');

    contactForm.style.display = 'none';
    if (formSuccess) formSuccess.style.display = 'block';
  } catch (error) {
    if (formError) {
      formError.textContent = error instanceof Error ? error.message : 'We could not send your enquiry. Please email info@simplicontax.com.';
      formError.classList.add('show');
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonContent;
    }
  }
});

document.getElementById('sendAnother')?.addEventListener('click', () => {
  contactForm?.reset();
  formError?.classList.remove('show');
  if (contactForm) contactForm.style.display = 'grid';
  if (formSuccess) formSuccess.style.display = 'none';
});
