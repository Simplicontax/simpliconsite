/**
 * Testimonials Slider - TypeScript
 */

export function initTestimonials(): void {
  const slider = document.querySelector<HTMLDivElement>('.testimonials-slider');
  const dotsContainer = document.getElementById('testimonialDots');

  if (!slider || !dotsContainer) return;

  const cards = slider.querySelectorAll<HTMLDivElement>('.testimonial-card');
  const cardCount = cards.length;

  if (cardCount === 0) return;

  for (let i = 0; i < cardCount; i++) {
    const dot = document.createElement('span');
    dot.className = 'testimonial-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('data-index', String(i));
    dot.addEventListener('click', () => scrollToTestimonial(i));
    dotsContainer.appendChild(dot);
  }

  const dots = dotsContainer.querySelectorAll<HTMLSpanElement>('.testimonial-dot');

  function scrollToTestimonial(index: number): void {
    const card = cards[index];
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      updateDots(index);
    }
  }

  function updateDots(activeIndex: number): void {
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === activeIndex);
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = Array.from(cards).indexOf(entry.target as HTMLDivElement);
          updateDots(index);
        }
      });
    },
    { root: slider, threshold: 0.5 }
  );

  cards.forEach((card) => observer.observe(card));
}
