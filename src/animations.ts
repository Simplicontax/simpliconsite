/**
 * Scroll-triggered Animations - TypeScript
 */

const ANIMATION_OPTIONS: IntersectionObserverInit = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px',
};

export function initAnimations(): void {
  const animatedElements = document.querySelectorAll<HTMLElement>(
    '[data-animate]'
  );

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement;
        const delay = el.dataset.animateDelay || '0';
        el.style.transitionDelay = `${delay}ms`;
        el.classList.add('animate-in');
        observer.unobserve(el);
      }
    });
  }, ANIMATION_OPTIONS);

  animatedElements.forEach((el) => observer.observe(el));
}
