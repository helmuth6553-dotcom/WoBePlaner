import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks for better caching
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-date': ['date-fns'],
          'vendor-ui': ['lucide-react'],
          'vendor-pdf': ['jspdf', 'html2canvas', 'dompurify']
        }
      }
    },
    // Increase warning limit since we're aware of the size
    chunkSizeWarningLimit: 600
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
})
