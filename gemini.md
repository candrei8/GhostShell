# Project Style Guidelines

## Languages & Localization
- **UI Language:** All labels, buttons, dialogs, and user-facing text in the GhostShell UI MUST be written in Spanish (e.g., "Misión" instead of "Mission", "Configurar Nodos" instead of "Configure Nodes").
- **Code & Variables:** Variable names, function names, and comments within the code should remain in English.

## Colors & Styling
- **NO GRADIENTS:** Do not use CSS gradients (`linear-gradient`, `radial-gradient`, `<linearGradient>` in SVG, etc.) anywhere in the application.
- **NO GLOWS:** Do not use unnecessary glowing effects (e.g. `shadow-[0_0_...` with colors, or large background colored blur circles). Keep the UI flat, clean, and professional.
- **SOLID COLORS ONLY:** Always use solid colors for backgrounds, borders, shadows, and text.
- Follow the established "Glass UI" theme, utilizing solid translucent colors (e.g. `rgba(255, 255, 255, 0.03)` or tailwind `bg-white/[0.03]`) combined with `backdrop-filter: blur(...)` to achieve depth, rather than using gradient backgrounds or glows.
- The primary accent color is `#38bdf8` (Tailwind `sky-400`). Use it as a solid color.

## 3D Parallax Glass UI (Premium Holographic Effect)
When creating prominent cards, selection panels, or premium interactive elements, use the 3D Parallax effect via `framer-motion` and native CSS 3D transforms instead of static 2D designs.

**Rules for 3D UI:**
1. **No External 3D Libraries:** Do not use Three.js or similar. Use Framer Motion's `useMotionValue`, `useSpring`, and `useTransform` to map mouse coordinates to `rotateX` and `rotateY` (max 15 degrees).
2. **Structural Depth (CSS 3D):**
   - The wrapper must have `perspective` (e.g., `perspective: 1500`).
   - The moving container must have `transformStyle: "preserve-3d"`.
   - Separate UI layers physically using `translateZ`:
     - **Backgrounds:** Push backward (e.g., `translateZ(-20px)`). Use standard solid Glass UI backgrounds.
     - **Mid-layers/Borders:** Keep near 0 or slightly forward (e.g., `translateZ(30px)`).
     - **Content (Icons, Text):** Push forward (e.g., `translateZ(60px)`).
3. **Pointer Events:** Always set `pointer-events-none` on inner layered content to prevent mouse position miscalculations (`getBoundingClientRect` jumps) when hovering over text/icons.
4. **Lighting/Shadows:** Maintain the "NO GLOWS/NO GRADIENTS" rule. Volume is created physically by `translateZ`. Highlight active states by changing borders to the solid `#38bdf8` accent color or adjusting solid background opacities.

**Example Base Implementation:**
```tsx
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

// Setup inside component:
const x = useMotionValue(0);
const y = useMotionValue(0);
const mouseXSpring = useSpring(x, { stiffness: 150, damping: 15 });
const mouseYSpring = useSpring(y, { stiffness: 150, damping: 15 });
const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["15deg", "-15deg"]);
const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-15deg", "15deg"]);

const handleMouseMove = (e: React.MouseEvent) => {
  const rect = e.currentTarget.getBoundingClientRect();
  x.set((e.clientX - rect.left) / rect.width - 0.5);
  y.set((e.clientY - rect.top) / rect.height - 0.5);
};
const handleMouseLeave = () => { x.set(0); y.set(0); };

// Render:
<motion.div style={{ perspective: 1500 }}>
  <motion.div
    onMouseMove={handleMouseMove}
    onMouseLeave={handleMouseLeave}
    style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
    className="relative w-80 h-96 rounded-2xl cursor-pointer"
  >
    {/* Glass Background */}
    <div className="absolute inset-0 bg-white/[0.02] border border-white/10" style={{ transform: "translateZ(-20px)" }} />
    {/* Content */}
    <div className="relative p-8 w-full h-full pointer-events-none" style={{ transform: "translateZ(60px)" }}>
      <h3 className="text-white">Premium Content</h3>
    </div>
  </motion.div>
</motion.div>
```
