# FE 001 · Three-Card Flex Row

## Task
Build a horizontal row of exactly three cards inside a flex container.

Requirements (each is an automated assertion):
1. A `<section class="cards">` container exists and is `display: flex`.
2. It contains exactly **three** elements with class `card`.
3. Each card contains an `<h2>` title.
4. The container has a `gap` of at least `8px`.

## How it's checked
The playground renders your markup live and evaluates `assertions.json`
against the real DOM and computed styles — no pixel-diffing, so results are
deterministic across browsers.
