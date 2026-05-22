# Aurelia Cafe - AI Instructions

## 🎯 Project Goal
The primary goal of this project is to maintain and polish the existing Aurelia Cafe website strictly adhering to the provided reference designs. The focus is on pixel-perfect UI adjustments, layout stability, and premium smooth animations.

## 📐 UI Rules
**1. Hero Slider:**
- Ensure the slider center image is the largest (`scale(1.3)`), with surrounding images slightly smaller but still large.
- Images must align horizontally with zero overlapping.
- Slider arrows must be vertically centered and fixed to the extreme left and right edges.
- Slider dots must be horizontally centered directly below the slider track.

**2. Explore Menu Button:**
- The "Explore Menu" button must ALWAYS be horizontally centered at the bottom of the hero section.
- Uses `position: absolute; left: 50%; transform: translateX(-50%);` to prevent any movement during Javascript DOM manipulations or page navigation.

**3. Menu Layout:**
- Exactly 6 items match the slider items and map to specific categories (Coffee, Pastries, Sandwiches).
- **Product Card Design:** 
  - Image on top (large, clear, zoomed in slightly using `object-fit: contain` and `transform: scale(1.2)` inside a visible overflow wrapper).
  - Title, description, and price neatly vertically stacked and center-aligned below the image.
  - No default "Add to Cart" button visible in the grid view to strictly match the reference UI.

## 🎬 Animation Rules
- **Steam Animation:** A subtle, upward-looping, blurred steam effect must sit perfectly over the center slider image.
- **Coffee Beans:** Must float randomly in the background (`floatBean` animation over 15-20s duration).
- **Menu Card Hover:** Slight zoom (`scale(1.3)`) on the image and brightness increase (`brightness(1.2)`), plus a shadow glow around the card frame.
- **Menu Card Click:** Trigger a fast (200ms) pop effect (`scale(1.05)` and glow shadow) via the `.clicked` class before opening the modal.

## 🚨 STRICT INSTRUCTIONS FOR AI AGENTS
- **DO NOT REDESIGN:** Maintain the current dark theme, gold accents, and font choices (Inter + Playfair Display).
- **DO NOT CHANGE LAYOUT:** Only FIX identified problems (e.g., alignment issues, overlaps). Never introduce new structural layouts unless explicitly asked.
- **NO PLACEHOLDERS:** Strictly use provided images from the `images/` directory.
- **STABLE POSITIONING:** Ensure UI elements (especially buttons) use rigid positioning (absolute or flex) so they do not break when Javascript toggles section visibility (e.g., avoid relying on `display: block` transitions breaking flexbox contexts).
