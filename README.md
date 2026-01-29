# Simplicon Tax Website

A professional US tax filing services website for **Simplicon Tax** (Simplicon Tax Advisors LLP).

## Services

- **Individual Tax Filing** - Federal, State, Local, FBAR, FATCA
- **Business Tax Filing** - S-Corp, C-Corp, Partnership
- **International Tax Filing** - Expat, foreign income
- **Apply for ITIN** - For yourself, spouse, or dependents
- **Audit Representation** - IRS representation
- **Amendments** - Prior year corrections

## Tech Stack

- **TypeScript** - Type-safe UI interactions
- **Vite** - Fast build tool & dev server
- **HTML5, CSS3** - Modern responsive design
- **Stock Images** - Unsplash (free, high-quality)
- **SVG Icons** - Lucide-style inline icons
- **Typography** - Plus Jakarta Sans + Instrument Serif

## Getting Started

```bash
# Install dependencies
npm install

# Development (with hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The dev server runs on **http://localhost:5173** by default. Use `npm run dev -- --port 1110` for port 1110.

## Project Structure

```
ustaxfiler-clone/
├── index.html          # Homepage
├── about.html          # About Us
├── contact.html        # Contact
├── pricing.html        # Pricing
├── styles.css          # All styles + animations
├── src/
│   ├── main.ts         # Entry point
│   ├── nav.ts          # Mobile navigation
│   ├── testimonials.ts # Testimonial slider
│   ├── contact-form.ts # Form handling
│   ├── scroll-effects.ts
│   └── animations.ts   # Scroll-triggered animations
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Features

- **Scroll-triggered animations** - Elements fade in on scroll
- **Hero with stock image** - Professional tax/finance imagery
- **Service cards with images** - Each service has a relevant Unsplash image
- **SVG icons** - Clean, scalable icons throughout
- **Responsive design** - Mobile-first, works on all devices
- **Smooth transitions** - CSS animations for better UX

## Customization

- **Colors**: Edit CSS variables in `:root` in `styles.css`
- **Contact Form**: Connect to backend in `src/contact-form.ts`
- **Images**: Replace Unsplash URLs with your own

---

Simplicon Tax Advisors LLP | Trading as Simplicon Tax
