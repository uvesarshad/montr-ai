# Layered Neutral Surface System

> The visual design language for MontrAI's UI. **Contrast comes from
> ELEVATION, not color.** Establish a surface ladder; each level is a slightly
> different neutral. Color is rationed.
>
> Live workshop: `/ui-lab` (`src/app/(app)/ui-lab/`). Approved components
> graduate into `src/components/ui-kit/`. Component sources: **Aceternity UI**
> (`npx shadcn add @aceternity/<name>`) + **motion-primitives**, rethemed to
> these tokens.

---

## Core idea

Contrast comes from elevation, not color. Establish a surface ladder; each
level is a slightly different neutral. Color is rationed.

## Surface ladder (recessed → raised)

```
page    #F2F2F0  (warm off-white)
inset   #F6F6F4
card    #FFFFFF
inverted / featured  #0A0A0A
```

Borders are relative to their surface (dark borders on dark surfaces).

## Color discipline

- **ONE primary accent `#7A5AF8` + ONE warm accent `#F0783C`.** Ceiling of two.
- Each accent ≈ **5% of a section**. Never a fill on large areas.
- **Status colors** (green / red / amber) are **DATA**, kept separate from the
  brand accents.
- Text: `#1A1A1A` / `#6B6B6B` / `#9B9B9B` (primary / secondary / tertiary).

## Depth

- **Two-layer shadows** (ambient + key), never one flat drop shadow.
- **Convex buttons:** vertical gradient + grounding shadow (NO bright top
  highlight — see "Button recipe" below; the top-shine was explicitly rejected).
- **Featured = invert to dark OR thicken border**, not "add more color."

## Borders are a hierarchy, not a constant

| Use | Weight |
| --- | --- |
| default | subtle 1px |
| featured | strong 1.5px |
| priority | accent 3px left-rail |
| empty states | dashed |
| max emphasis | double-ring |

## Form

- **Radius:** 16px cards, 12px nested, 999px pills.
- **Type:** Poppins 700–800 headings, tight tracking (−0.03em). Generous
  whitespace.
- **Motion:** one orchestrated entrance (staggered ~50ms), restrained hovers.

## Rule of thumb

If you're adding a third color to create emphasis, **stop** — use elevation or
border weight instead.

---

## Concrete tokens (validated in `/ui-lab`)

These are the exact values dialed in on the lab page. Use them when promoting
into the token system (`src/app/globals.css` + `tailwind.config.ts`).

```css
/* surface ladder */
--page:#F2F2F0; --inset:#F6F6F4; --card:#FFFFFF; --ink:#0A0A0A;

/* accents — ceiling of two */
--accent:#7A5AF8; --accent-hi:#8E72FA; --accent-lo:#6A46EE;   /* gradient stops */
--warm:#F0783C;   --warm-hi:#F68F58;  --warm-lo:#E96A2A;

/* text */
--t1:#1A1A1A; --t2:#6B6B6B; --t3:#9B9B9B;

/* borders relative to surface */
--bd:rgba(10,10,10,.08); --bd-strong:rgba(10,10,10,.14);

/* two-layer shadow (ambient + key) */
--sh-ambient:0 1px 2px rgba(10,10,10,.05);
--sh-key:0 8px 24px rgba(10,10,10,.06);
```

### Button recipe (convex, no top shine, soft shadow, hover flash)

```css
.btn-primary {
  color:#fff;
  background:linear-gradient(180deg, var(--accent-hi), var(--accent-lo));
  /* convex via gradient + faint BOTTOM inner shadow — NO top highlight */
  box-shadow:
    inset 0 -1px 2px rgba(10,10,10,.14),   /* convex bottom */
    0 1px 2px rgba(10,10,10,.05),          /* ambient */
    0 3px 10px rgba(122,90,248,.22);       /* soft colored grounding */
  border-radius:999px;
}

/* continuous light flash sweeping across on hover (clip with overflow:hidden) */
.btn::after {
  content:''; position:absolute; inset:0; z-index:-1; pointer-events:none;
  background:linear-gradient(100deg, transparent 20%, rgba(255,255,255,.55) 50%, transparent 80%);
  width:55%; transform:translateX(-180%) skewX(-14deg); opacity:0;
}
.btn:hover::after { opacity:1; animation:flash 1.25s linear infinite; }
@keyframes flash {
  from { transform:translateX(-180%) skewX(-14deg); }
  to   { transform:translateX(320%)  skewX(-14deg); }
}
```

Warm button = same recipe with the `--warm-*` stops. Neutral = white→`#ECECEA`
gradient on a 1.5px border. Inverted = `#2B2B2B`→`#0A0A0A`.

---

## Tooling

- **Aceternity UI** via shadcn registry: `components.json` has
  `registries["@aceternity"]`; key in `.env.local` (gitignored). Install:
  `NODE_OPTIONS=--use-system-ca npx -y shadcn@latest add @aceternity/<name> --yes`
  (lands in `src/components/ui/`). MCP also configured.
- **motion-primitives:** `npx -y motion-primitives@latest add <name>` writes to
  repo-root `components/` — move into `src/components/motion-primitives/`.
- **Poppins** wired via `next/font/google` on the lab page (`--font-poppins`).
