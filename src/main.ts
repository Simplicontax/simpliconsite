/**
 * Simplicon Tax - Interactive Features
 * TypeScript for type-safe UI interactions
 */

import { initMobileNav } from './nav';
import { initTestimonials } from './testimonials';
import { initContactForm } from './contact-form';
import { initScrollEffects } from './scroll-effects';
import { initAnimations } from './animations';
import { initEfilingPopupModule } from './efiling-popup';
import { initHeroCarousel } from './hero-carousel';

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initTestimonials();
  initContactForm();
  initScrollEffects();
  initAnimations();
  initEfilingPopupModule();
  initHeroCarousel();
});
