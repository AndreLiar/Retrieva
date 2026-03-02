---
sidebar_position: 5
---

# Pricing & Contact Pages

Public pages that give prospective users full pricing transparency before they sign up.

## Overview

Two new public routes were added in Week 3:

| Route | File | Type |
|-------|------|------|
| `/pricing` | `app/pricing/page.tsx` | `'use client'` |
| `/contact` | `app/contact/page.tsx` | Server component |

Neither route requires authentication. Authenticated users are **not** redirected away — they
can visit these pages at any time.

---

## `/pricing`

A standalone pricing page that mirrors the landing page header/footer pattern.

### Structure

```
Header (logo · ThemeToggle · Pricing [active] · Sign In · Get Started)
  └── PricingSection        ← shared component from components/marketing/
  └── FAQ section           ← native <details>/<summary> elements
Footer
```

### Billing toggle

A pill-style toggle lets visitors switch between **monthly** and **annual** billing.
Annual prices are 20 % lower and a green `−20 %` badge is shown on the toggle button.

```tsx
const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
```

When `billing === 'annual'`, each card shows the annual unit price with a
`"billed annually"` sub-label beneath.

### Plan grid

Four plans displayed in a `sm:grid-cols-2 lg:grid-cols-4` responsive grid:

| Plan | Monthly | Annual | Vendors | Members | Data sources |
|------|---------|--------|---------|---------|--------------|
| Starter | €199/mo | €159/mo | Up to 10 | 3 | File, URL |
| Professional | €499/mo | €399/mo | Up to 50 | 10 | File, URL, Confluence |
| Business | €999/mo | €799/mo | Up to 150 | 30 | All sources |
| Enterprise | Custom | Custom | Unlimited | Unlimited | All + custom |

- **Professional** is highlighted: `ring-2 ring-primary` border + "Most Popular" badge
  at `absolute -top-3 left-1/2 -translate-x-1/2`
- Each card fades up with `framer-motion` `whileInView`, staggered by `index × 0.1 s`
- CTA buttons: `default` variant on highlighted card, `outline` on others
- Enterprise CTA → `/contact`; all others → `/register`

### FAQ

Four static questions rendered with native HTML `<details>/<summary>` (no extra package):

- Can I change plans later?
- What happens after the trial?
- Is there an annual discount?
- How does the Enterprise POC work?

---

## `/contact`

A minimal enterprise sales contact page. Server component — no client-side state required.

### Structure

```
Header (same as /pricing)
Main
  ├── Back arrow → /pricing
  ├── Mail icon (primary/10 circle)
  ├── "Talk to Sales" heading
  ├── Description paragraph
  ├── <a href="mailto:sales@retrieva.online?subject=…"> → Button
  ├── Plain-text email address
  └── "We typically respond within 1 business day."
Footer
```

The `mailto:` subject line is URL-encoded: `Enterprise%20inquiry%20%E2%80%94%20Retrieva`.

---

## Shared component: `PricingSection`

`components/marketing/pricing-section.tsx` is reused in two places:

1. **`/pricing`** — full standalone page
2. **`app/page.tsx`** — inline section between "How It Works" and the final CTA

The component is self-contained: it manages its own `billing` state and imports no
auth-dependent code, so it renders correctly on public routes.

See the [Components](./components#marketing-components) page for the full component reference.

---

## Landing page changes

`app/page.tsx` received two targeted edits:

1. **Header** — "Pricing" `<Button variant="ghost">` added after `ThemeToggle`:
   ```tsx
   <Link href="/pricing">
     <Button variant="ghost">Pricing</Button>
   </Link>
   ```

2. **Pricing section** — `<PricingSection />` inserted between the How It Works section
   (`bg-muted/30`) and the CTA section. No extra wrapper needed — the container inside
   `PricingSection` uses `bg-background`, creating natural visual alternation.

---

## Design decisions

| Decision | Rationale |
|----------|-----------|
| Native `<details>/<summary>` for FAQ | `@radix-ui/react-accordion` is not installed; avoids adding a new package |
| Shared `PricingSection` component | Single source of truth — prices can't drift between `/` and `/pricing` |
| Server component for `/contact` | No `useState` needed; smaller JS bundle for a static page |
| `'use client'` for `/pricing` | Required because `PricingSection` uses `useState` for the billing toggle |
