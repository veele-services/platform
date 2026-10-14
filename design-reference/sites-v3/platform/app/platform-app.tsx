'use client';

import { useEffect, useState } from 'react';
import App from '../src/App';

export default function PlatformApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <App /> : <main style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', textAlign: 'center', gap: 16 }} aria-busy="true"><img src="/branding/fieldgrid-wordmark.svg" width="180" alt="Fieldgrid" /><p>Je omgeving wordt geladen…</p></main>;
}
