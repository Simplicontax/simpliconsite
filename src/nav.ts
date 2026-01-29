/**
 * Mobile Navigation - TypeScript
 */

export function initMobileNav(): void {
  const navToggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
  const navMenu = document.querySelector<HTMLUListElement>('.nav-menu');

  if (!navToggle || !navMenu) return;

  navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    navToggle.classList.toggle('active');
    document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
  });

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('active');
      navToggle.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as Node;
    if (
      navMenu.classList.contains('active') &&
      !navMenu.contains(target) &&
      !navToggle.contains(target)
    ) {
      navMenu.classList.remove('active');
      navToggle.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
}
