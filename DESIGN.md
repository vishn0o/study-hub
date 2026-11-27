---
name: Study Hub
description: An offline study-progress tracker that turns an AI-generated plan into topics, questions and a predicted score.
colors:
  navy: "#10243a"
  navy-deep: "#1b3552"
  teal: "#0e7b77"
  teal-deep: "#0a6663"
  teal-soft: "#e3f4f1"
  orange: "#d9761b"
  amber: "#a3510d"
  amber-soft: "#fdf0e2"
  green: "#1f9d63"
  green-soft: "#e7f6ee"
  red: "#c0392b"
  red-soft: "#fdecea"
  canvas: "#f4f7fa"
  surface: "#ffffff"
  surface-2: "#f6f9fc"
  surface-3: "#eef2f6"
  ink: "#1b2733"
  heading: "#10243a"
  muted: "#5b6b7b"
  line: "#e2e9f0"
  on-teal: "#ffffff"
  on-orange: "#241304"
  code-bg: "#0f1e2e"
  code-ink: "#d7e6f2"
typography:
  display:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.3
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 800
    letterSpacing: "0.06em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 700
rounded:
  sm: "9px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "36px"
components:
  button-primary:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.on-teal}"
    rounded: "{rounded.sm}"
    padding: "9px 13px"
  button-primary-hover:
    backgroundColor: "{colors.teal-deep}"
    textColor: "{colors.on-teal}"
    rounded: "{rounded.sm}"
    padding: "9px 13px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "9px 11px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  chip:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 11px"
---

# Design System: Study Hub

## Overview

**Creative North Star: "The Quiet Exam Desk."**

Study Hub is a desk tool, not a stage. It sits beside a student's own notes and PYQs, holds the count of what is rated and what is due, and stays out of the way. The visual language is deliberate and cool: deep navy for orientation, a single confident teal for action, amber and green reserved for pace and mastery. Nothing here performs enthusiasm for the learner.

Density is working density, not dashboard theatre. The progress summary sits directly under the exam strip, with the topic list following it — scores framed as a reading of progress rather than a verdict. Motion is limited to state changes that help: a drawer arriving, a meter filling, a question opening. A prediction is never allowed to shout.

Three themes are composed rather than inverted. Light is paper-cool; dark is a low-light desk; AMOLED is true black for phones in bed. Every theme remaps semantic roles through tokens, and text on an accent is always chosen for that accent, never inherited from another theme.

**Key Characteristics:**
- Offline-first and local — no cloud motifs, no marketing chrome.
- One accent carries action; amber, green and red carry state.
- Progress summary above the topics; metrics read as support, not verdict.
- Calm language around exams: pace is a plan, not a deadline.

## Colors

A cool navy-and-teal system with warm semantic states. Teal is the only action color; it is never used as decoration.

### Primary
- **Deep Desk Navy** (`#10243a`): Top bar, drawer headers, the exam strip and primary surfaces that need authority.
- **Confident Teal** (`#0e7b77`): Primary buttons, focus, selection, active filters and progress. Dark enough for white text at 5.1:1.
- **Teal Deep** (`#0a6663`): Hover and pressed state for teal actions.

### Secondary
- **Pace Amber** (`#d9761b`): Every-paper flags, top ranks, countdown values and warnings. Always paired with dark ink (`#241304`), never white.
- **Mastery Green** (`#1f9d63`): Got-it confidence, completed topics and secured targets.
- **Miss Red** (`#c0392b`): Didn't-get-it confidence and due-now review chips.

### Neutral
- **Cool Canvas** (`#f4f7fa`): Page background.
- **Paper Surface** (`#ffffff`): Cards, inputs, dialogs.
- **Desk Ink** (`#1b2733`): Body copy.
- **Secondary Ink** (`#5b6b7b`): Metadata and hints; 5.48:1 on white.
- **Hairline** (`#e2e9f0`): Borders and dividers.

### Named Rules
**The One Accent Rule.** Teal owns action and focus. It is never used for decoration, and no second action color is introduced.

**The On-Accent Rule.** Text on an accent is a token, not an assumption. Light theme uses white on teal; dark and AMOLED use near-black. Amber always uses dark ink.

## Typography

**Display Font:** DM Sans (system-ui fallback)
**Body Font:** DM Sans (system-ui fallback)
**Label/Mono Font:** JetBrains Mono (ui-monospace fallback), for scores, countdown digits, code and formulas.

**Character:** A single humanist sans carries every voice; weight and size do the hierarchy work. JetBrains Mono appears only where a number is a measurement or text is code. There is no display face and no decorative tracking.

### Hierarchy
- **Display** (800, 44px, -0.04em): Predicted score numeral only.
- **Headline** (800, 24px, -0.02em): Section and subject titles.
- **Title** (800, 16px): Topic names, card titles.
- **Body** (500, 14px, 1.5): Concepts, answers, explanations.
- **Label** (800, 11.5px, uppercase, 0.06em): Pills, badges, small controls. Functional labels stay at 11px or above.

### Named Rules
**The Weight-Not-Effect Rule.** Emphasis comes from weight and size, never gradient text, glow or shadow.

## Layout

A 1280px centered container with 24px side padding, stepping to 16px on phones. The primary column is the topic grid, using `auto-fill` with a 280px minimum so it reflows without arbitrary breakpoints. The four-stat summary is four separate rounded cards with a 16px gap, becoming two columns under 1080px and one under 700px.

Navigation lives in one top bar: brand, subject selector and actions. Below 700px the secondary actions collapse into one labelled menu instead of disappearing; the brand and subject selector stay on a single row. Filter tabs wrap rather than scrolling horizontally. Fixed overlays never cover content on phones — the install chip returns to the document flow.

**The Thumb Rule.** Any control that can be tapped is at least 44px under a coarse pointer; icon-only controls are never the sole label.

## Elevation & Depth

Depth is quiet and structural. Cards use one ambient shadow with a real offset and blur; the summary strip and dashboard strip use a border plus the same shadow. True black AMOLED replaces shadows with a 1px hairline. A zero-offset colored glow is not part of this system.

### Shadow Vocabulary
- **Ambient** (`0 1px 2px rgba(16,36,58,.05), 0 8px 24px rgba(16,36,58,.06)`): Resting cards and the summary strip.
- **Drawer** (`-12px 0 40px rgba(16,36,58,.18)`): Sliding topic drawer.
- **Dialog** (`0 24px 60px rgba(0,0,0,.35)`): Modal surface.

### Named Rules
**The Border-or-Shadow Rule.** A surface declares depth once: either a hairline border or a shadow, never a border under a wide shadow. Progress cards stay separate; they are never fused into one strip.

## Shapes

Cards are softly rounded (16px); controls and inputs are tighter (9px); pills and badges are fully rounded. Dialogs use 16px. Corners are consistent within a role — there is no square card beside a pill card. Borders are 1px hairlines from `--line`, tinted for state rather than painted with hard accent colors.

## Components

### Buttons
- **Shape:** 9px radius, 9–13px vertical padding, 700 weight.
- **Primary:** Teal surface with the theme's `--on-teal` text; hover darkens to teal-deep.
- **Ghost:** Transparent with a translucent white outline on navy; active state switches to teal.
- **Focus:** 3px teal outline with 2px offset, plus a themed ring on inputs.

### Chips and Badges
- **Style:** Fully rounded, 10–11.5px uppercase, tinted surface with muted text; accent variants use soft-tinted backgrounds.
- **State:** Active filters invert to solid teal with `--on-teal` text. Zero-count badges fall back to neutral.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** `--surface`, one ambient shadow.
- **Border:** Hairline `--line`; state borders use themed state tokens.
- **Internal Padding:** 18–20px.

### Inputs and Fields
- **Style:** `--surface-2` fill, 1px `--line`, 9px radius, 9px 11px padding.
- **Focus:** Teal border plus a 3px themed focus ring; the UA outline is never the only cue.

### Navigation
- **Style:** Solid navy bar, 4px teal top rule, white brand text, 11.5px ghost actions.
- **Mobile:** Secondary actions collapse into one menu button with `aria-expanded`; nothing is hidden from touch users.

### Signature Component — Question Row
A question is a three-part row: a confidence checkbox, a full-width text button that reveals the answer with `aria-expanded`, and an edit control. Confidence is encoded by a colored left border plus a letter mark and label, never by color alone. Answers and formulas are hidden by default for blind recall.

## Do's and Don'ts

### Do:
- **Do** use `--on-teal` for text on teal in every theme.
- **Do** pair every state color with a label, mark or icon.
- **Do** keep the metrics strip directly below the exam summary and above the topic grid.
- **Do** use `role="progressbar"` with a numeric `aria-valuenow` on every meter.
- **Do** preserve keyboard focus across a re-render.

### Don't:
- **Don't** put an eyebrow or kicker above a heading.
- **Don't** use a zero-offset colored glow as elevation.
- **Don't** hide a primary action at a mobile breakpoint; collapse it into a labelled menu.
- **Don't** show a verdict pill before the user has rated anything.
- **Don't** hard-code an accent color that bypasses the theme tokens.
