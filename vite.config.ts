import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'CNC WoodCraft Studio PWA',
        short_name: 'CNC Studio',
        description: 'Aplicație PWA specializată pentru sculptură în lemn 3D, gravură și generare STL/G-Code pentru orice CNC.',
        theme_color: '#11100e',
        background_color: '#11100e',
        display: 'standalone',
        orientation: 'any',
        // căi relative: site-ul stă în subfolderul /cnc-woodcraft-pwa/ pe GitHub Pages
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ]
})
