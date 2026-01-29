/**
 * Contact Form Handler - TypeScript
 */

interface FormData {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

export function initContactForm(): void {
  const form = document.getElementById('contactForm') as HTMLFormElement | null;
  const formSuccess = document.getElementById('formSuccess') as HTMLDivElement | null;

  if (!form || !formSuccess) return;

  form.addEventListener('submit', (e: Event) => {
    e.preventDefault();

    const name = (form.querySelector('#name') as HTMLInputElement)?.value?.trim();
    const email = (form.querySelector('#email') as HTMLInputElement)?.value?.trim();
    const message = (form.querySelector('#message') as HTMLTextAreaElement)?.value?.trim();

    if (!name || !email || !message) {
      alert('Please fill in all required fields.');
      return;
    }

    const formData: FormData = {
      name: name,
      email: email,
      phone: (form.querySelector('#phone') as HTMLInputElement)?.value || '',
      subject: (form.querySelector('#subject') as HTMLSelectElement)?.value || '',
      message: message,
    };

    form.style.display = 'none';
    formSuccess.style.display = 'block';

    console.log('Form submitted:', formData);
  });
}
