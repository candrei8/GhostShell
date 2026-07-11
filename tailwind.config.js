/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every ghost token uses rgb(<triplet> / <alpha-value>) so opacity
        // modifiers (bg-ghost-surface/60, text-ghost-text-dim/40,
        // border-ghost-border/70) all compile to real CSS. The -rgb triplets
        // are kept in sync with the hex tokens by applyTheme() and have
        // defaults in globals.css :root for the pre-hydration paint.
        ghost: {
          bg: 'rgb(var(--ghost-bg-rgb) / <alpha-value>)',
          surface: 'rgb(var(--ghost-surface-rgb) / <alpha-value>)',
          sidebar: 'rgb(var(--ghost-sidebar-rgb) / <alpha-value>)',
          border: 'rgb(var(--ghost-border-rgb) / <alpha-value>)',
          text: 'rgb(var(--ghost-text-rgb) / <alpha-value>)',
          'text-dim': 'rgb(var(--ghost-text-dim-rgb) / <alpha-value>)',
          accent: 'rgb(var(--ghost-accent-rgb) / <alpha-value>)',
          'accent-2': 'rgb(var(--ghost-accent-2-rgb) / <alpha-value>)',
          'accent-3': 'rgb(var(--ghost-accent-3-rgb) / <alpha-value>)',
          success: 'rgb(var(--ghost-success-rgb) / <alpha-value>)',
          warning: 'rgb(var(--ghost-warning-rgb) / <alpha-value>)',
          error: 'rgb(var(--ghost-error-rgb) / <alpha-value>)',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Cascadia Mono', 'IBM Plex Mono', 'Consolas', 'monospace'],
        // Inter is the font loaded in index.html; 'Manrope' never was, so the UI
        // silently rendered in Segoe UI.
        sans: ['Inter', 'Segoe UI Variable Text', 'SF Pro Display', 'Helvetica Neue', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.6875rem',
      },
      // Full 0-100 opacity scale so every `/N` color modifier compiles. Tailwind
      // ships only multiples of 5, so classes like border-white/8, bg-black/22,
      // text-white/24 used to produce NO CSS (and borders fell back to
      // preflight's light gray). Every integer step now resolves.
      opacity: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [i, (i / 100).toString()]),
      ),
      spacing: {},
      boxShadow: {
        /* Very subtle shadows for the new minimalist look */
        'minimal': '0 1px 2px rgba(0, 0, 0, 0.5)',
        'minimal-lg': '0 4px 12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
