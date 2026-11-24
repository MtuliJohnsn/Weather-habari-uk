import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'screenshot-wide.jpg',
          'screenshot-mobile.jpg',
        ],
        manifest: {
          id: '/',
          lang: 'en-US',
          name: 'Habari Weather',
          short_name: 'Habari',
          description:
            'Live 3D weather observatory with plain-English daily summaries, free commute radar routing, multi-model confidence, and smart lifestyle guides.',
          theme_color: '#0f172a',
          background_color: '#020617',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'any',
          start_url: '/',
          scope: '/',
          prefer_related_applications: false,
          categories: ['weather', 'navigation', 'lifestyle'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [
            {
              src: '/screenshot-wide.jpg',
              sizes: '1376x768',
              type: 'image/jpeg',
              form_factor: 'wide',
              label: 'Habari Weather 3D Observatory & Daily Outlook',
            },
            {
              src: '/screenshot-mobile.jpg',
              sizes: '768x1376',
              type: 'image/jpeg',
              form_factor: 'narrow',
              label: 'Habari Weather Mobile Forecast & Commute Radar',
            },
          ],
          shortcuts: [
            {
              name: 'Commute Radar & Route',
              short_name: 'Commute',
              description: 'Check rain, crosswind, and ice along your drive',
              url: '/?tab=commute',
              icons: [{src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png'}],
            },
            {
              name: '7-Day & Confidence',
              short_name: '7-Day',
              description: 'View 7-day forecast, model confidence, and threshold alerts',
              url: '/?tab=forecast',
              icons: [{src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png'}],
            },
            {
              name: 'Lifestyle & Activities',
              short_name: 'Activities',
              description: 'Check smart windows for outdoor plans and outfits',
              url: '/?tab=activities',
              icons: [{src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png'}],
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/\.well-known\//, /^\/privacy/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'open-meteo-forecast-cache',
                networkTimeoutSeconds: 4,
                expiration: {
                  maxEntries: 24,
                  maxAgeSeconds: 60 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/([a-d]\.basemaps\.cartocdn\.com|tile\.openstreetmap\.org)\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'free-map-tiles-cache',
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
