import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';

import { UiLab } from './lab';

// Poppins 500–800 — headings use 700/800 with tight tracking per the
// Layered Neutral Surface System. Exposed as --font-poppins, scoped to the lab.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'UI Lab — MontrAI',
  description: 'Live component workshop — Layered Neutral Surface System.',
};

export default function UiLabPage() {
  return (
    <div className={poppins.variable}>
      <UiLab />
    </div>
  );
}
