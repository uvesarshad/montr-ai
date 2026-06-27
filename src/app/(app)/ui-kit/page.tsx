import type { Metadata } from 'next';

import { UiKitGallery } from './gallery';

export const metadata: Metadata = {
  title: 'UI Kit — MontrAI',
  description: 'The MontrAI design-system gallery — every ui-kit component, live.',
};

export default function UiKitPage() {
  return <UiKitGallery />;
}
