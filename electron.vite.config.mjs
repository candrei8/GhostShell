import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  main: {
    resolve: {
      preserveSymlinks: true,
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'electron/main.ts'),
        },
      },
    },
  },
  preload: {
    resolve: {
      preserveSymlinks: true,
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'electron/preload.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src',
    publicDir: resolve(import.meta.dirname, 'public'),
    resolve: {
      preserveSymlinks: true,
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/index.html'),
        },
      },
    },
    plugins: [react()],
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()],
      },
    },
  },
})
