import './floating-contact.css';

const envelopeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h17v11h-17z"/><path d="m4 7 8 6 8-6"/></svg>';
const phoneIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.8 10 7.6 8.4 9.2c.9 2.2 2.6 3.9 4.8 4.8l1.6-1.6 3.8 2.8-.7 3.4c-.2.9-1 1.5-1.9 1.4C9.6 19.2 4.8 14.4 4 8c-.1-.9.5-1.7 1.4-1.9z"/></svg>';

export function mountFloatingContact(): void {
  if (document.querySelector('.floating-contact-rail')) return;

  const rail = document.createElement('aside');
  rail.className = 'floating-contact-rail';
  rail.setAttribute('aria-label', 'Contact Simplicon Tax');
  rail.innerHTML = [
    '<a class="floating-contact-button email" href="mailto:info@simplicontax.com" data-label="Email us" aria-label="Email Simplicon Tax at info@simplicontax.com">' + envelopeIcon + '</a>',
    '<a class="floating-contact-button us-call" href="tel:+14704448100" data-label="Call US: +1 470 444 8100" aria-label="Call the Simplicon Tax United States number, plus 1 470 444 8100">' + phoneIcon + '<span>US</span></a>',
    '<a class="floating-contact-button india-call" href="tel:+917207057471" data-label="Call India: +91 72070 57471" aria-label="Call the Simplicon Tax India number, plus 91 72070 57471">' + phoneIcon + '<span>IN</span></a>',
  ].join('');
  document.body.append(rail);
}
