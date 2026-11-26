# Design Guidelines — Sportofino-inspired brand

Source: <https://sportofino.com/> (homepage, desktop 1905px, extracted 2026-11-25 after accepting the Cookiebot consent banner).
Machine-readable tokens: [`assets/design-tokens.json`](../assets/design-tokens.json).

> **License notice:** the logo, favicon and DM Sans font files were downloaded from the public website for reference only. Verify usage rights before using or redistributing them (DM Sans itself is published under the SIL Open Font License, but the Sportofino logo and favicon are trademarked brand assets).

## 1. Assets

| Asset | Path | Notes |
|---|---|---|
| Homepage screenshot | [`../assets/homepage.png`](../assets/homepage.png) | Full page, no overlays; visual reference for QA |
| Logo (black wordmark) | [`../assets/logo.svg`](../assets/logo.svg) | SVG, `fill="#1a1a17"`, 599.9×214 viewBox |
| Favicon | [`../assets/favicon.png`](../assets/favicon.png) | 32×32 PNG |
| Design tokens | [`../assets/design-tokens.json`](../assets/design-tokens.json) | Colors, typography, spacing, radii, components |
| DM Sans Light | [`../assets/fonts/dmsans-light/DMSans-Light.woff2`](../assets/fonts/dmsans-light/DMSans-Light.woff2) | Weight 300 |
| DM Sans Regular | [`../assets/fonts/dmsans-regular/DMSans-Regular.woff2`](../assets/fonts/dmsans-regular/DMSans-Regular.woff2) | Weight 400 (body default) |
| DM Sans Medium | [`../assets/fonts/dmsans-medium/DMSans-Medium.woff2`](../assets/fonts/dmsans-medium/DMSans-Medium.woff2) | Weight 500 |
| DM Sans Bold | [`../assets/fonts/dmsans-bold/DMSans-Bold.woff2`](../assets/fonts/dmsans-bold/DMSans-Bold.woff2) | Weight 700 |
| Desktop screenshots | [`../assets/screenshots/desktop/`](../assets/screenshots/desktop/) | 1440×900 viewport: `full-page.png` + `01…06-viewport.png` (one per screen, top to bottom) |
| Mobile screenshots | [`../assets/screenshots/mobile/`](../assets/screenshots/mobile/) | iPhone 15 emulation, 393×659 CSS px @3x: `full-page.png` + `01…08-viewport.png` |
| Icon font (technical) | `../assets/fonts/icons-blank-theme/Blank-Theme-Icons.woff2` | Magento Blank theme icon font — **not a brand asset, do not use**; prefer an SVG icon set |

## 2. Colors

The palette is almost monochrome: black, near-black and greys, with one warm accent (promo bar) and one red for sales.

| Token | Hex | Usage |
|---|---|---|
| `brand.primary` | `#1A1A1A` | Primary text, product badges, dark hero background |
| `brand.black` | `#000000` | Footer, dark category section, links |
| `brand.accent` | `#FFAB3D` | Top promo bar background (the only saturated surface) |
| `brand.sale` / `text.sale` | `#FF5640` | Sale prices |
| `brand.error` | `#FF5652` | Highlighted nav item ("BLACK WEEK"); reuse for errors |
| `brand.success` | `#2E7D32` | *Assumed* — not observed on homepage, confirm on checkout |
| `background.default` | `#FFFFFF` | Page and header background |
| `background.light` | `#F5F5F5` | Search input, product image backdrop |
| `background.darker` | `#0A0A0A` | Dark sections |
| `background.buttonDark` | `#2B2B2B` | Primary CTA button |
| `text.secondary` | `#707070` | Product brand name, omnibus price, footer titles |
| `text.muted` | `#767676` | Helper text |
| `text.disabled` | `#999999` | Language switcher label, inactive |
| `text.onDark` | `#FFFFFF` / `#FAFAFA` | Text on black sections and images |
| `border.default` / `border.light` | `#A3A3A3` / `#D4D4D4` | Carousel arrows (active / disabled) |

## 3. Typography

**Family:** DM Sans, self-hosted as separate families per weight (each `@font-face` declares `font-weight: 400`, the weight is encoded in the family name):

```css
@font-face { font-family: "DMSans-Light";   src: url("/assets/fonts/dmsans-light/DMSans-Light.woff2") format("woff2");     font-display: swap; }
@font-face { font-family: "DMSans-Regular"; src: url("/assets/fonts/dmsans-regular/DMSans-Regular.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "DMSans-Medium";  src: url("/assets/fonts/dmsans-medium/DMSans-Medium.woff2") format("woff2");   font-display: swap; }
@font-face { font-family: "DMSans-Bold";    src: url("/assets/fonts/dmsans-bold/DMSans-Bold.woff2") format("woff2");       font-display: swap; }

body { font-family: "DMSans-Regular", "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 14px; color: #1A1A1A; }
```

The downloaded files are listed in section 1; verify their license before shipping.

| Role | Family | Size / line-height | Letter-spacing |
|---|---|---|---|
| Promo heading | DMSans-Light (300) | 30px / 39px | -0.15px |
| Section heading (H2) | DMSans-Regular | 26px / 33.8px | -0.3px |
| Category tile label | DMSans-Regular | 26px / 33.8px | -0.3px |
| H1 (SEO, small) | DMSans-Light | 18px | normal |
| Promo bar link | DMSans-Regular | 16px / 19.2px | normal |
| Body, nav, product name | DMSans-Regular | 14px / ~1.3–1.45 | normal |
| Product brand | DMSans-Light | 14px / 18.2px | normal |
| Buttons on images, footer | DMSans-Regular | 12px / 14.4px | normal |
| Omnibus (lowest 30-day) price | DMSans-Regular | 10px / 15px | normal |

Scale: `10 / 12 / 14 / 16 / 18 / 26 / 30px`. Headings are **light or regular, never bold**; hierarchy comes from size and negative tracking, not weight. Nav items are written in uppercase in the content.

## 4. Spacing & layout

- Base unit: **4px**; common values `4, 8, 12, 16, 20, 24, 32, 40px`.
- Container: `max-width: 1640px`, horizontal padding `40px`, centered.
- Controls (buttons on images, carousel arrows) are `32px` tall; primary CTA `38px`.
- Product grids and carousels use tight gutters (~8–12px); category collage tiles sit edge to edge with small gaps.

## 5. Border radius

| Token | Value | Usage |
|---|---|---|
| `xs` | 2px | Product badges ("BLACK WEEK" sticker) — most common radius |
| `sm` | 4px | White "Sprawdź" buttons on images |
| `md` | 6px | Primary dark CTA ("DOŁĄCZ DO KLUBU") |
| `lg` | 8px | Floating widgets (rating badge) |
| `xl` | 12px | Rare, larger cards |
| `full` | 999px | Search input, circular carousel arrows |
| `circle` | 50% | Icon buttons, avatars |

Images and product cards are **square-cornered** (0px).

## 6. Components

- **Promo bar** — full-width, `#FFAB3D` background, centered black underlined 16px link; language switcher on the right.
- **Header** — white, 121px total with promo bar. Centered logo (~96px wide), pill search input on the right (`#F5F5F5`, radius 999px), then account / wishlist / cart icons.
- **Navigation** — single row under the logo: uppercase 14px `#1A1A1A` items left-aligned; promotional item in red `#FF5652`; secondary links (Club, Magazine, Stores) right-aligned.
- **Hero** — full-width dark (`#1A1A1A`) banner with very large light-weight display type and a small white `Sprawdź` button.
- **Buttons**
  - *Primary*: `#2B2B2B` bg, white uppercase 14px text, 1px same-color border, radius 6px, padding 10px 20px.
  - *On image*: white bg, black 12px text, radius 4px, height 32px, padding 0 16px.
  - *Carousel arrow*: 32px circle, transparent, 1px `#A3A3A3` border (`#D4D4D4` disabled).
- **Product card** — image on `#F5F5F5`, bottom "BLACK WEEK" badge (`#1A1A1A`, white text, radius 2px, 26px tall), then brand (Light, grey), name (Regular, `#1A1A1A`), price (`#FF5640` when discounted) and 10px grey omnibus/regular price lines.
- **Category collage** — black section, white 26px heading, photo tiles with white 26px labels overlaid at the bottom.
- **Club split promo** — white half with centered 30px Light heading and dark CTA; photo on the other half.
- **Brand strip** — row of monochrome partner logos (~80px) on white.
- **Footer** — black background, 12px; grey column titles (`#707070`), white links; a white Club card with dark CTA on the right.

### Mobile (≤ 393px, see `assets/screenshots/mobile/`)

The mobile site keeps the same palette and font; layout and type scale shrink:

| Element | Mobile | Desktop |
|---|---|---|
| Header | 97px tall; hamburger + wishlist left, logo centered, search + cart right | 121px; centered logo, search pill + 3 icons right, nav row below |
| Navigation | Off-canvas menu behind the hamburger | Inline uppercase row |
| Section heading | DMSans-Light 24px / 31.2px | DMSans-Regular 26px / 33.8px |
| Category tile label | 16px / 23.2px, padding 10px 20px 4px | 26px / 33.8px |
| Category collage | 2-column photo grid | 4-column collage |
| Product name | 12px / 17.4px | 14px / 20.3px |
| Club promo | Dark card, white DMSans-Light 26px heading, white-on-dark CTA | White split layout, 30px heading |
| Footer | Accordion rows (16px white titles, `+` toggles, 16px vertical padding) | 4 open link columns, 12px |
| Promo carousels | Horizontal scroll with peeking next card | Same, with arrow buttons |

Floating widgets (rating badge bottom-left, chat/mail bubble bottom-right) appear on both breakpoints; they are third-party and not part of the design system.

## 7. Logo usage

- Use [`assets/logo.svg`](../assets/logo.svg) centered in the header at ~96px width (40px height box), on white.
- It is a single-color near-black (`#1a1a17`) "Sportofino" wordmark. No inverted variant was extracted; on dark backgrounds override the fill to `#FFFFFF` (e.g. inline the SVG and set `fill="currentColor"`).
- Keep clear space of at least the wordmark's x-height around it; do not recolor with the accent or sale colors.
- The logo is a registered brand asset: use it only with permission.

## 8. Visual style summary

A premium fashion and outdoor retailer with a restrained, editorial look: black, white and greys dominate, so the large lifestyle photography provides almost all the color. Typography is a single geometric sans (DM Sans) used in light and regular weights with slight negative tracking, giving a calm, luxurious tone instead of loud sale aesthetics. Accents are rare and purposeful: a warm orange promo bar and red sale prices are the only saturated elements. Corners are mostly sharp, with small radii on controls and pill shapes for search and carousel navigation.
