'use client';

/**
 * /ui-lab — the live workshop.
 *
 * Implements the "Layered Neutral Surface System": contrast comes from
 * ELEVATION, not color. A surface ladder (page < inset < card < inverted),
 * two rationed accents (violet + warm), two-layer shadows, convex buttons,
 * and a border hierarchy. Everything is driven by the CSS variables in the
 * <style> block below — tune any value there and it updates live.
 *
 * Buttons are the current focus. Approved results graduate into the ui-kit.
 */

import * as React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, Plus, Sparkles, Trash2 } from 'lucide-react';

import { TextEffect } from '@/components/motion-primitives/text-effect';

/* -------------------------------------------------------------- entrance */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

/* ---------------------------------------------------------------- button */
type Variant = 'primary' | 'warm' | 'neutral' | 'dark' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

function LabButton({
  variant = 'primary',
  size = 'md',
  children,
  icon: Icon,
}: {
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const iconSize = size === 'lg' ? 'h-[18px] w-[18px]' : size === 'sm' ? 'h-[14px] w-[14px]' : 'size-4';
  return (
    <button className={`lns-btn lns-btn--${variant} lns-btn--${size}`}>
      {Icon ? <Icon className={iconSize} /> : null}
      {children}
    </button>
  );
}

export function UiLab() {
  return (
    <div className="lns min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-4xl px-6 py-12"
      >
        {/* ----------------------------------------------------------- header */}
        <motion.div variants={item}>
          <TextEffect per="word" preset="fade-in-blur" as="h1" className="lns-h1">
            Layered Neutral Surface System
          </TextEffect>
          <p className="lns-sub mt-3 max-w-xl">
            Contrast from elevation, not color. A surface ladder, two rationed accents, two-layer
            shadows, and convex controls. Tell me what to tune — it updates here live.
          </p>
        </motion.div>

        {/* ---------------------------------------------------- surface ladder */}
        <motion.section variants={item} className="mt-12">
          <h2 className="lns-h2">Surface ladder</h2>
          <p className="lns-cap mt-1">Each level is a slightly different neutral. Color is rationed.</p>
          <div className="lns-ladder mt-4">
            <div className="lns-rung" style={{ background: 'var(--page)' }}>
              <span className="lns-tag">page</span>
              <div className="lns-rung lns-bordered" style={{ background: 'var(--inset)' }}>
                <span className="lns-tag">inset</span>
                <div className="lns-card lns-rung" style={{ background: 'var(--card)' }}>
                  <span className="lns-tag">card</span>
                </div>
              </div>
            </div>
            <div className="lns-card-dark lns-rung-tall">
              <span className="lns-tag" style={{ color: 'rgba(255,255,255,.7)' }}>
                inverted · featured
              </span>
            </div>
          </div>
        </motion.section>

        {/* --------------------------------------------------- buttons (hero) */}
        <motion.section variants={item} className="lns-card mt-10 p-7">
          <h2 className="lns-h2">Buttons</h2>
          <p className="lns-cap mt-1">
            Convex: inner top highlight + vertical gradient + grounding shadow. Accents are the only
            color on the page.
          </p>

          {/* variants */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <LabButton variant="primary" icon={Sparkles}>Primary</LabButton>
            <LabButton variant="warm" icon={Plus}>Warm accent</LabButton>
            <LabButton variant="neutral" icon={Check}>Neutral</LabButton>
            <LabButton variant="dark" icon={ArrowRight}>Inverted</LabButton>
            <LabButton variant="ghost">Ghost</LabButton>
          </div>

          {/* sizes */}
          <div className="mt-7">
            <p className="lns-cap mb-3">Sizes</p>
            <div className="flex flex-wrap items-center gap-3">
              <LabButton variant="primary" size="sm">Small</LabButton>
              <LabButton variant="primary" size="md">Medium</LabButton>
              <LabButton variant="primary" size="lg">Large</LabButton>
            </div>
          </div>

          {/* destructive uses status color (data, not a brand accent) */}
          <div className="mt-7">
            <p className="lns-cap mb-3">Status (data — kept separate from brand accents)</p>
            <div className="flex flex-wrap items-center gap-3">
              <LabButton variant="neutral" icon={Trash2}>Delete</LabButton>
            </div>
          </div>
        </motion.section>

        {/* ------------------------------------------------- border hierarchy */}
        <motion.section variants={item} className="mt-10">
          <h2 className="lns-h2">Borders are a hierarchy</h2>
          <p className="lns-cap mt-1">Weight signals priority — not a constant.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lns-card lns-demo">
              <span className="lns-tag">subtle · 1px default</span>
            </div>
            <div className="lns-card lns-demo lns-bd-strong">
              <span className="lns-tag">strong · 1.5px featured</span>
            </div>
            <div className="lns-card lns-demo lns-bd-accent">
              <span className="lns-tag">accent · 3px left-rail</span>
            </div>
            <div className="lns-card lns-demo lns-bd-dashed">
              <span className="lns-tag">dashed · empty state</span>
            </div>
            <div className="lns-card lns-demo lns-bd-double">
              <span className="lns-tag">double-ring · max emphasis</span>
            </div>
          </div>
        </motion.section>
      </motion.div>
    </div>
  );
}

/* --------------------------------------------------------------------- CSS
 * One source of truth for the system. Edit a variable, the whole page moves.
 */
const CSS = `
.lns {
  /* surface ladder */
  --page:#F2F2F0; --inset:#F6F6F4; --card:#FFFFFF; --ink:#0A0A0A;
  /* accents — ceiling of two */
  --accent:#7A5AF8; --accent-hi:#8E72FA; --accent-lo:#6A46EE;
  --warm:#F0783C;   --warm-hi:#F68F58;  --warm-lo:#E96A2A;
  /* text */
  --t1:#1A1A1A; --t2:#6B6B6B; --t3:#9B9B9B;
  /* borders relative to surface */
  --bd:rgba(10,10,10,.08); --bd-strong:rgba(10,10,10,.14);
  /* two-layer shadow (ambient + key) */
  --sh-ambient:0 1px 2px rgba(10,10,10,.05);
  --sh-key:0 8px 24px rgba(10,10,10,.06);

  background:var(--page);
  color:var(--t1);
  font-family:var(--font-poppins), Inter, system-ui, sans-serif;
}

/* typography */
.lns-h1{ font-weight:800; font-size:34px; line-height:1.05; letter-spacing:-.03em; color:var(--t1); }
.lns-h2{ font-weight:700; font-size:18px; letter-spacing:-.02em; color:var(--t1); }
.lns-sub{ font-size:14px; line-height:1.55; color:var(--t2); }
.lns-cap{ font-size:12.5px; color:var(--t3); }
.lns-tag{ font-size:11px; font-weight:600; letter-spacing:.02em; color:var(--t3); text-transform:lowercase; }

/* card surface — two-layer shadow + subtle border */
.lns-card{
  background:var(--card);
  border:1px solid var(--bd);
  border-radius:16px;
  box-shadow:var(--sh-ambient), var(--sh-key);
}
.lns-card-dark{
  background:var(--ink);
  border:1px solid rgba(255,255,255,.08);
  border-radius:16px;
  box-shadow:var(--sh-ambient), 0 10px 30px rgba(10,10,10,.25);
}

/* ladder visual */
.lns-ladder{ display:grid; grid-template-columns:1fr; gap:14px; }
@media(min-width:640px){ .lns-ladder{ grid-template-columns:1.4fr 1fr; } }
.lns-rung{ position:relative; border-radius:16px; padding:18px; }
.lns-rung > .lns-rung{ margin-top:14px; }
.lns-bordered{ border:1px solid var(--bd); }
.lns-rung-tall{ display:flex; align-items:flex-end; min-height:140px; padding:18px; }

/* ---- buttons ---- */
.lns-btn{
  position:relative; overflow:hidden; isolation:isolate;
  display:inline-flex; align-items:center; gap:8px;
  height:44px; padding:0 22px; border-radius:999px;
  font-family:var(--font-poppins), Inter, sans-serif;
  font-weight:600; font-size:14px; line-height:1; letter-spacing:-.01em;
  border:1px solid transparent; cursor:pointer; white-space:nowrap;
  transition:transform .12s ease, box-shadow .22s ease, filter .22s ease, background .22s ease;
}
.lns-btn:active{ transform:translateY(1px); }

/* continuous light flash sweeping across on hover */
.lns-btn::after{
  content:''; position:absolute; inset:0; z-index:-1; pointer-events:none;
  background:linear-gradient(100deg, transparent 20%, rgba(255,255,255,.55) 50%, transparent 80%);
  width:55%; transform:translateX(-180%) skewX(-14deg); opacity:0;
}
.lns-btn--primary:hover::after,
.lns-btn--warm:hover::after,
.lns-btn--dark:hover::after{ opacity:1; animation:lns-flash 1.25s linear infinite; }
@keyframes lns-flash{
  from{ transform:translateX(-180%) skewX(-14deg); }
  to{ transform:translateX(320%) skewX(-14deg); }
}
.lns-btn--sm{ height:36px; padding:0 16px; font-size:13px; }
.lns-btn--lg{ height:52px; padding:0 28px; font-size:15px; }

/* primary — convex violet (no top shine, very soft shadow) */
.lns-btn--primary{
  color:#fff;
  background:linear-gradient(180deg, var(--accent-hi), var(--accent-lo));
  box-shadow:
    inset 0 -1px 2px rgba(10,10,10,.14),
    0 1px 2px rgba(10,10,10,.05),
    0 3px 10px rgba(122,90,248,.22);
}
.lns-btn--primary:hover{
  box-shadow:
    inset 0 -1px 2px rgba(10,10,10,.14),
    0 1px 2px rgba(10,10,10,.05),
    0 5px 16px rgba(122,90,248,.30);
}

/* warm — convex orange (no top shine, very soft shadow) */
.lns-btn--warm{
  color:#fff;
  background:linear-gradient(180deg, var(--warm-hi), var(--warm-lo));
  box-shadow:
    inset 0 -1px 2px rgba(10,10,10,.14),
    0 1px 2px rgba(10,10,10,.05),
    0 3px 10px rgba(240,120,60,.22);
}
.lns-btn--warm:hover{ box-shadow:
    inset 0 -1px 2px rgba(10,10,10,.14),
    0 1px 2px rgba(10,10,10,.05), 0 5px 16px rgba(240,120,60,.30); }

/* neutral — convex on light */
.lns-btn--neutral{
  color:var(--t1);
  background:linear-gradient(180deg, #FFFFFF, #ECECEA);
  border-color:var(--bd-strong);
  box-shadow:
    inset 0 1px 0 #fff,
    0 1px 2px rgba(10,10,10,.06),
    0 2px 6px rgba(10,10,10,.05);
}
.lns-btn--neutral:hover{ background:linear-gradient(180deg,#FFFFFF,#E6E6E3);
  box-shadow:inset 0 1px 0 #fff, 0 1px 2px rgba(10,10,10,.08), 0 4px 12px rgba(10,10,10,.07); }

/* dark — inverted convex */
.lns-btn--dark{
  color:#fff;
  background:linear-gradient(180deg, #2B2B2B, #0A0A0A);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.12),
    0 1px 2px rgba(10,10,10,.4),
    0 4px 14px rgba(10,10,10,.32);
}
.lns-btn--dark:hover{ filter:brightness(1.15);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.16), 0 1px 2px rgba(10,10,10,.4), 0 6px 20px rgba(10,10,10,.4); }

/* ghost — flat until hover */
.lns-btn--ghost{ color:var(--t1); background:transparent; box-shadow:none; }
.lns-btn--ghost:hover{ background:rgba(10,10,10,.05); }

/* ---- border hierarchy demo ---- */
.lns-demo{ display:flex; align-items:flex-end; min-height:96px; padding:16px; }
.lns-bd-strong{ border-width:1.5px; border-color:var(--bd-strong); }
.lns-bd-accent{ border-left:3px solid var(--accent); }
.lns-bd-dashed{ border-style:dashed; border-color:var(--bd-strong); box-shadow:none; background:var(--inset); }
.lns-bd-double{ box-shadow:0 0 0 1px var(--bd), 0 0 0 4px var(--card), 0 0 0 5px var(--accent), var(--sh-key); }
`;
