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
        usTax: 'us-tax-filing.html',
        indiaTax: 'india-tax-filing.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase/') || id.includes('node_modules/@realtime/') || id.includes('node_modules/@typespec/ts-http-runtime')) return 'supabase-vendor';
        },
      },
    },
  },
});
