# Design language

Based on the reference homepage design supplied in Phase 3: a white storefront with deep indigo-navy hero and footer, violet accents, pastel category cards and rounded, softly shadowed cards. Tokens live in [apps/storefront/src/app/globals.css](../apps/storefront/src/app/globals.css).

## Palette

| Token                              | Value                                               | Use                                                                  |
| ---------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| `navy-950`                         | `#090b26`                                           | Hero, dark promos, footer, announcement bar                          |
| `navy-900` / `navy-800`            | `#0f1235` / `#1a1e4a`                               | Dark surfaces and borders                                            |
| `primary-600`                      | `#5b3df5`                                           | Buttons, prices, links (white text passes WCAG AA)                   |
| `primary-700`                      | `#4a2ddb`                                           | Hover                                                                |
| `primary-50` / `primary-100`       | `#f3f0ff` / `#e8e2ff`                               | Icon wells, hover backgrounds                                        |
| `brand-purple` → `brand-blue`      | `#7c3aed` → `#4f46e5`                               | Heading highlight gradient (`text-gradient`), brand gradient banners |
| `surface-muted`                    | `#f6f5ff`                                           | Alternating section background (lavender tint)                       |
| `surface-sunken`                   | `#f3f4f8`                                           | Product image wells, inputs                                          |
| `ink` / `ink-muted` / `ink-subtle` | `#0f172a` / `#5b6478` / `#646b7f`                   | Text                                                                 |
| Pastels                            | blue, violet, mint, pink, peach, cyan, lemon, slate | Category cards, cycled in order                                      |
| `success` / `warning` / `danger`   | `#15803d` / `#a35207` / `#b91c1c`                   | Status text and icons                                                |

On dark backgrounds, highlighted words use `text-gradient-light` (`#c4b5fd` → `#818cf8`).

## Type

- Headings: **Plus Jakarta Sans** 600–800, tracking `-0.02em`. Body: **Inter**. Handwritten notes: **Caveat** (decorative annotations only, hidden from screen readers).
- Section titles highlight their last word or phrase: "Shop by **Category**", "Best Selling **Products**".

## Components

- **Buttons:** pill-shaped. Primary is violet with a soft violet shadow and an arrow chip.
- **Cards:** `rounded-[1.25rem]`, 1px `line` border, layered shadow. Hover lifts 4px with a violet-tinted shadow.
- **Product card:** image well with up to two badges (out of stock, discount, new, refurbished), brand, two-line name, rating (or "No reviews yet"), violet price with struck previous price, Add to Cart and wishlist.
- **Hero:** `bg-hero` (navy with violet radial light and a faint grid), two-tone headline, highlight pills, CTAs, illustration with a handwritten annotation.

## Imagery

Until real photography is uploaded (Phase 8), original SVG illustrations stand in: [device-art.tsx](../apps/storefront/src/components/illustrations/device-art.tsx) (one per product type) and [scenes.tsx](../apps/storefront/src/components/illustrations/scenes.tsx) (hero laptop, gaming rig, desk scene). Brand names render as typographic wordmarks until logos are uploaded; trademarked logo artwork is not reproduced.

## Content rules (deliberate departures from the reference)

- The reference shows "50,000+ happy customers", "10K+" and "4.8★". These are replaced by **real figures** from the database (products, brands, counties served, and average rating only once approved reviews exist).
- Star ratings appear only for products with approved reviews; otherwise "No reviews yet".
- The testimonials section renders only when real testimonials exist.
- "Best Selling" appears only once products have sales.
- "Best Price Guarantee" became "Competitive Prices", since no price-match policy exists.

## Accessibility

- Text contrast meets WCAG AA. Focus ring: 2px `primary-600` with 2px offset, never removed.
- Motion respects `prefers-reduced-motion` (no hero autoplay, transitions minimised).
- Carousels use `aria-roledescription`, labelled slides and keyboard-reachable controls. The mobile menu is a native `<dialog>` (focus trap and Escape for free).
- One visible-to-assistive-tech `h1` per page. Decorative SVGs are `aria-hidden`.

## Contrast

Every text colour meets WCAG 2.1 AA (4.5:1) on white, `surface-muted` and `surface-sunken`; this is checked by
axe in `tests/e2e`. In Phase 10 `ink-subtle` went from `#8a91a5` (3.1:1) to `#646b7f`, and the status colours were
darkened for the same reason. Badges with white text use the 700 shades (e.g. `emerald-700`), not 500.
