/**
 * Scroll Effects - TypeScript
 */

export function initScrollEffects(): void {
  const header = document.querySelector<HTMLElement>('.header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    if (currentScroll > 50) {
      header.style.boxShadow =
        '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)';
    } else {
      header.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
    }
  });
}
