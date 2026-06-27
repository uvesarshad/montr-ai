import type { MetadataRoute } from 'next';

import { getPwaManifest } from '@/lib/pwa/config';

export default function manifest(): MetadataRoute.Manifest {
  return getPwaManifest();
}
