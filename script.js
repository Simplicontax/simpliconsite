/**
 * Simplicon Tax - Interactive Features
 */

document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    initTestimonials();
    initContactForm();
    initScrollEffects();
});

/**
 * Mobile Navigation Toggle
 */
function initMobileNav() {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');

    if (!navToggle || !navMenu) return;

    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        navToggle.classList.toggle('active');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });

    // Close menu when clicking a link
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('active') && 
            !navMenu.contains(e.target) && 
            !navToggle.contains(e.target)) {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
}

/**
 * Testimonials Slider / Carousel
 */
function initTestimonials() {
    const slider = document.querySelector('.testimonials-slider');
    const dotsContainer = document.getElementById('testimonialDots');

    if (!slider || !dotsContainer) return;

    const cards = slider.querySelectorAll('.testimonial-card');
    const cardCount = cards.length;

    if (cardCount === 0) return;

    // Create dot indicators
    for (let i = 0; i < cardCount; i++) {
        const dot = document.createElement('span');
        dot.className = 'testimonial-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('data-index', i);
        dot.addEventListener('click', () => scrollToTestimonial(i));
        dotsContainer.appendChild(dot);
    }

    const dots = dotsContainer.querySelectorAll('.testimonial-dot');

    function scrollToTestimonial(index) {
        const card = cards[index];
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
            updateDots(index);
        }
    }

    function updateDots(activeIndex) {
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === activeIndex);
        });
    }

    // Update dots on scroll (intersection observer)
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const index = Array.from(cards).indexOf(entry.target);
                updateDots(index);
            }
        });
    }, { root: slider, threshold: 0.5 });

    cards.forEach(card => observer.observe(card));
}

/**
 * Contact Form Handling
 */
function initContactForm() {
    const form = document.getElementById('contactForm');
    const formSuccess = document.getElementById('formSuccess');

    if (!form || !formSuccess) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Get form data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Basic validation
        const name = form.querySelector('#name')?.value?.trim();
        const email = form.querySelector('#email')?.value?.trim();
        const message = form.querySelector('#message')?.value?.trim();

        if (!name || !email || !message) {
            alert('Please fill in all required fields.');
            return;
        }

        // Simulate form submission (replace with actual API call)
        form.style.display = 'none';
        formSuccess.style.display = 'block';

        // In production, you would send to your backend:
        // fetch('/api/contact', { method: 'POST', body: JSON.stringify(data) })
        console.log('Form submitted:', data);
    });
}

/**
 * Scroll Effects - Header shadow on scroll
 */
function initScrollEffects() {
    const header = document.querySelector('.header');
    if (!header) return;

    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        if (currentScroll > 50) {
            header.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)';
        } else {
            header.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
        }
        lastScroll = currentScroll;
    });
}
