import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
        contact: 'contact.html',
        pricing: 'pricing.html',
        services: 'services.html',
        resources: 'resources.html',
        refundStatus: 'refund-status.html',
        portal: 'portal.html',
      },
    },
  },
});
