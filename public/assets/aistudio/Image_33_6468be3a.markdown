---
name: Nocturne Sanctuary
colors:
  surface: '#0c1321'
  surface-dim: '#0c1321'
  surface-bright: '#323949'
  surface-container-lowest: '#070e1c'
  surface-container-low: '#151b2a'
  surface-container: '#19202e'
  surface-container-high: '#232a39'
  surface-container-highest: '#2e3544'
  on-surface: '#dce2f6'
  on-surface-variant: '#d5c3bc'
  inverse-surface: '#dce2f6'
  inverse-on-surface: '#2a3040'
  outline: '#9d8d88'
  outline-variant: '#51443f'
  surface-tint: '#f0bba7'
  primary: '#ffd2c1'
  on-primary: '#49281a'
  primary-container: '#e8b4a0'
  on-primary-container: '#6a4535'
  inverse-primary: '#7d5545'
  secondary: '#e2c46f'
  on-secondary: '#3d2f00'
  secondary-container: '#634d00'
  on-secondary-container: '#dec06c'
  tertiary: '#ffd0d1'
  on-tertiary: '#68001a'
  tertiary-container: '#ffa8ac'
  on-tertiary-container: '#9f002c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#f0bba7'
  on-primary-fixed: '#301408'
  on-primary-fixed-variant: '#623e2f'
  secondary-fixed: '#ffe08c'
  secondary-fixed-dim: '#e2c46f'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#584400'
  tertiary-fixed: '#ffdada'
  tertiary-fixed-dim: '#ffb3b6'
  on-tertiary-fixed: '#40000c'
  on-tertiary-fixed-variant: '#920028'
  background: '#0c1321'
  on-background: '#dce2f6'
  surface-variant: '#2e3544'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 44px
    fontWeight: '300'
    lineHeight: 52px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Outfit
    fontSize: 34px
    fontWeight: '300'
    lineHeight: 42px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Outfit
    fontSize: 26px
    fontWeight: '400'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Outfit
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: 0em
  title-md:
    fontFamily: Outfit
    fontSize: 17px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Outfit
    fontSize: 16px
    fontWeight: '300'
    lineHeight: 26px
    letterSpacing: 0.01em
  body-md:
    fontFamily: Outfit
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Space Grotesk
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.08em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.12em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-tablet: 1.5rem
  gutter-desktop: 2rem
  margin: 1.25rem
  margin-tablet: 2.5rem
  margin-desktop: 4rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 2rem
  space-xl: 3rem
---

## Brand & Style

This design system expresses a refined, high-trust sanctuary designed for personal safety, sovereignty, and immediate responsiveness. The brand persona blends haute-horlogerie discretion with modern personal security: calm, decisive, protective, and unmistakably premium. It explicitly avoids clinical, punitive, or panic-inducing visual tropes in favor of composed assurance.

The design movement combines **Minimal Luxury** and **Dark-Field Glassmorphism**:
- **Zero visual clutter:** Every affordance serves a clear intent. Empty space is treated as an active shield to promote cognitive ease during acute stress.
- **Luminous depth:** Rich, layered dark surfaces evoke the quiet strength of twilight, accented with delicate metallic finishes.
- **Tactile urgency:** Protective and emergency actions are instantly legible through high-contrast alerts that cut through ambient surfaces without overwhelming the layout.

## Colors

The palette establishes an ultra-premium dark atmosphere with metallic accents and functional status indicators:

- **Primary (`#E8B4A0` - Soft Rose-Gold):** The primary touchstone. Used for elevated interactive states, key focal points, active controls, and refined borders.
- **Secondary (`#E7C873` - Champagne Gold):** Used for verified status badges, tertiary highlights, elevated metrics, and bespoke secondary actions.
- **Tertiary (`#FF3B5C` - Emergency Red):** Dedicated exclusively to immediate distress triggers (SOS activation, active threat warnings, live location broadcasting). It maintains high saturation against midnight backgrounds.
- **Functional Safe (`#34D399` - Safe Green):** Denotes secure geofences, confirmed check-ins, connected guardians, and active shield statuses.
- **Background Gradient Foundation:**
  - Base Start: `#1B1035` (Deep Royal Purple)
  - Base End: `#0B1220` (Midnight Navy)
  - Applied as an overarching 160-degree linear background gradient across all primary screen canvases.
- **Text & Surfaces:**
  - Primary Typography: `#F8F5F0` (Ivory White) ensures AAA legibility against the dark field.
  - Secondary/Muted Typography: `rgba(248, 245, 240, 0.65)`
  - Glass Surface: `rgba(27, 16, 53, 0.55)` to `rgba(11, 18, 32, 0.70)` with backdrop blur.
  - Glass Border: `rgba(232, 180, 160, 0.18)` graduating to `rgba(255, 255, 255, 0.08)`.

## Typography

The typographical hierarchy pairs the geometric elegance of **Outfit** with the technical precision of **Space Grotesk**:

- **Display & Headlines (Outfit):** Set at light and medium weights (`300` and `400`) with generous letter tracking and ample line heights. This evokes the tone of an architectural editorial while keeping panic out of the visual cadence.
- **Body Text (Outfit):** Uses crisp, slender rendering at `300` and `400` weights in `#F8F5F0`. It balances open aperture design with maximum readability over dark glass backgrounds.
- **Labels & Micro-indicators (Space Grotesk):** Provides structured contrast for timestamps, device telemetry, live battery outputs, geolocational coordinates, and quick status pills. Uppercase treatments apply letter spacing between `0.08em` and `0.12em` for clear legibility at compact scales.

## Layout & Spacing

The layout philosophy uses a disciplined fluid grid grounded in generous negative space:

- **Grid Architecture:**
  - **Mobile (< 768px):** 4-column layout with 20px (`1.25rem`) gutters and canvas margins. Single primary action focus per vertical frame.
  - **Tablet (768px - 1024px):** 8-column layout with 24px (`1.5rem`) gutters and 40px (`2.5rem`) margins. Dual pane support (e.g., live telemetry on left, map interface on right).
  - **Desktop (> 1024px):** 12-column layout capped at an inner container width of 1240px, with 32px (`2rem`) gutters and 64px (`4rem`) outer margins.
- **Whitespace Principles:**
  - Density is intentionally sparse. Interface components must breathe to facilitate quick touch accuracy during movement or distress.
  - Emergency actions are isolated with a minimum safety buffer of `space-xl` (48px) from standard navigation elements to eliminate false taps.

## Elevation & Depth

Visual hierarchy uses a refined dark-field glassmorphism approach rather than heavy drop shadows:

- **Surface Base:** The canvas sits on a deep gradient from `#1B1035` down to `#0B1220`.
- **Level 1 (Standard Card Surfaces):**
  - Fill: `linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)`
  - Backdrop Blur: `20px`
  - Outline: 1px continuous hairline border using `rgba(232, 180, 160, 0.15)`
  - Ambient Glow: Soft radial ambient shadow `0 20px 40px -15px rgba(0, 0, 0, 0.6)`.
- **Level 2 (Floating Controls & Navigation Modals):**
  - Fill: `linear-gradient(135deg, rgba(27, 16, 53, 0.8) 0%, rgba(11, 18, 32, 0.85) 100%)`
  - Backdrop Blur: `32px`
  - Outline: 1px border with `rgba(231, 200, 115, 0.25)` highlights along the top edge.
  - Ambient Glow: `0 24px 48px -12px rgba(11, 18, 32, 0.8), 0 0 24px 0 rgba(232, 180, 160, 0.06)`.
- **Level 3 (SOS & Emergency Criticality):**
  - Fill: Deep luminous crimson core `#FF3B5C`
  - Ambient Glow: Concentric double glow `0 0 32px rgba(255, 59, 92, 0.45), 0 0 64px rgba(255, 59, 92, 0.2)`.

## Shapes

The geometric framework is defined by soft, organic curves balanced against hairline borders:

- **Containers & Glass Cards:** Explicitly crafted with `24px` to `28px` corner radii (`1.5rem` to `1.75rem`), creating a soft, protective feel.
- **Buttons & Interactive Tags:** Use full pill contours (`9999px`) to maintain fluid touch affordances.
- **Safety Trigger Elements:** Circular geometries (`50%` radius) are reserved for primary status rings, guardian avatars, and the primary emergency activation beacon.

## Components

- **Buttons:**
  - *Primary (Luxe):* Pill shape, filled with `#E8B4A0` (Rose-Gold), text in `#0B1220` (Outfit Medium). Features a subtle inner glow. Hover/active shifts gently into `#E7C873`.
  - *Secondary (Glass):* Pill shape, translucent glass fill `rgba(255, 255, 255, 0.04)`, 1px border in `rgba(232, 180, 160, 0.3)`. Text in `#F8F5F0`.
  - *Emergency SOS Trigger:* Large circular floating control (`80px` mobile, `96px` desktop). Solid `#FF3B5C` with pulsing outer concentric glass rings. Requires a directional swipe or intentional long-press (1.5s) to eliminate accidental triggers.

- **Cards & Enclosures:**
  - Constructed using frosted glass surfaces with `26px` corner rounding.
  - Framed with a 1px glass border using a subtle linear gradient from `rgba(232, 180, 160, 0.25)` at the top-left to `rgba(255, 255, 255, 0.04)` at the bottom-right.
  - Zero heavy solid card fills; cards must reveal the deep purple-to-navy background through backdrops.

- **Chips & Status Pills:**
  - Space Grotesk uppercase labels (`11px`), `label-md`.
  - Border radius `9999px`, height `28px`, padding `0 12px`.
  - Safe State: `rgba(52, 211, 153, 0.12)` background, `rgba(52, 211, 153, 0.3)` border, `#34D399` text and pulse dot.
  - Alert State: `rgba(255, 59, 92, 0.12)` background, `rgba(255, 59, 92, 0.3)` border, `#FF3B5C` text.

- **Input Fields:**
  - Minimal translucent troughs with `rgba(255, 255, 255, 0.03)` fill and `16px` border radius.
  - Resting border: 1px `rgba(248, 245, 240, 0.12)`.
  - Focus state: Smooth transition to 1px `#E8B4A0` with a subtle external bloom `0 0 12px rgba(232, 180, 160, 0.2)`.
  - Text rendered in `#F8F5F0`, placeholder in `rgba(248, 245, 240, 0.35)`.

- **Checkboxes & Radios:**
  - Circular profile for both controls to harmonize with the soft geometry.
  - Resting: 1px hairline border in `rgba(232, 180, 160, 0.35)` on a dark translucent fill.
  - Active: Filled with `#E8B4A0`, featuring an ivory check or concentric dot.

- **Safety-Specific Components:**
  - *Guardian Mesh Avatars:* Overlapping circular portraits framed in 2px `#0B1220` with a live safety halo (safe green `#34D399` or active sync rose-gold `#E8B4A0`).
  - *Geofence Radar Indicator:* Concentric animated rings with delicate champagne gold (`#E7C873`) accents depicting route protection boundaries.