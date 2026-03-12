# Project Style Guidelines

## Colors & Styling
- **NO GRADIENTS:** Do not use CSS gradients (`linear-gradient`, `radial-gradient`, `<linearGradient>` in SVG, etc.) anywhere in the application.
- **NO GLOWS:** Do not use unnecessary glowing effects (e.g. `shadow-[0_0_...` with colors, or large background colored blur circles). Keep the UI flat, clean, and professional.
- **SOLID COLORS ONLY:** Always use solid colors for backgrounds, borders, shadows, and text.
- Follow the established "Glass UI" theme, utilizing solid translucent colors (e.g. `rgba(255, 255, 255, 0.03)` or tailwind `bg-white/[0.03]`) combined with `backdrop-filter: blur(...)` to achieve depth, rather than using gradient backgrounds or glows.
- The primary accent color is `#38bdf8` (Tailwind `sky-400`). Use it as a solid color.
