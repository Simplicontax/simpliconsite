/**
 * Hero Carousel - Cinematic Ken Burns style
 * Auto-advancing with subtle zoom & pan, no visible controls
 */

const HERO_IMAGES = [
  { src: 'https://images.unsplash.com/photo-1762151662378-f40e20901824?w=1200&q=85', alt: 'Tax preparation - Glasses and pen on tax form and laptop', title: 'Expert Tax Preparation' },
  { src: 'https://images.unsplash.com/photo-1709880945165-d2208c6ad2ec?w=1200&q=85', alt: 'Tax calculations - Calculator and laptop for accurate filing', title: 'Accurate Tax Calculations' },
  { src: 'https://images.unsplash.com/photo-1762151717091-4e0633e0c431?w=1200&q=85', alt: 'Tax forms with dollars - Filing your tax return', title: 'Tax Return Filing' },
  { src: 'https://images.unsplash.com/photo-1729488368227-1f1eee39ff20?w=1200&q=85', alt: 'Tax refund - Person with money and calculator', title: 'Maximize Your Refund' },
  { src: 'https://images.unsplash.com/photo-1762427907123-c7ab022a5de7?w=1200&q=85', alt: 'Record keeping - Desk with papers, calculator and documents', title: 'Organized Record Keeping' },
  { src: 'https://images.unsplash.com/photo-1764231467852-b609a742e082?w=1200&q=80', alt: 'Signing tax documents - Professional tax filing', title: 'Secure Document Signing' },
  { src: 'https://images.unsplash.com/photo-1762152212840-3ec91c031d52?w=1200&q=85', alt: 'Tax season reminder - Tax time preparation', title: 'Tax Season Ready' },
  { src: 'https://images.unsplash.com/photo-1762427354566-2b6902a9fd06?w=1200&q=85', alt: 'Tax documents - Calculator, pens and envelope', title: 'Complete Your Filing' },
];

const INTERVAL_MS = 5500;

function createCarouselElement() {
  const wrapper = document.createElement('div');
  wrapper.className = 'hero-carousel hero-carousel--kenburns';
  wrapper.innerHTML = `
    <div class="hero-carousel-stage">
      <div class="hero-carousel-stack">
        ${HERO_IMAGES.map((img, i) => `
          <div class="hero-carousel-card ${i === 0 ? 'active' : ''}" data-index="${i}">
            <div class="hero-carousel-card-inner">
              <div class="hero-carousel-img-wrap">
                <img src="${img.src}" alt="${img.alt}" loading="lazy">
              </div>
              <div class="hero-carousel-card-shine"></div>
              <div class="hero-carousel-card-caption">${img.title || img.alt}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  return wrapper;
}

function initCarousel() {
  const carousel = document.querySelector('.hero-carousel');
  if (!carousel) return;

  const cards = carousel.querySelectorAll('.hero-carousel-card');
  let currentIndex = 0;

  function updateCarousel(index: number) {
    currentIndex = index;
    cards.forEach((card) => {
      const idx = Number(card.getAttribute('data-index'));
      card.classList.toggle('active', idx === index);
    });
  }

  function nextSlide() {
    updateCarousel((currentIndex + 1) % HERO_IMAGES.length);
  }

  window.setInterval(nextSlide, INTERVAL_MS);
}

export function initHeroCarousel() {
  const carouselSlot = document.querySelector('.hero-carousel-slot');
  if (!carouselSlot) return;
  const carouselEl = createCarouselElement();
  carouselSlot.appendChild(carouselEl);
  initCarousel();
}
