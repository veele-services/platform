import type { Metadata } from 'next';
import '../src/app/globals.css';
import '../src/components/fieldgrid/backoffice-portal.css';
import '../src/components/fieldgrid/shell-chrome.css';
import '../src/app/dashboard-system.css';
import '../src/prototype.css';

export const metadata: Metadata = {
  title: 'Fieldgrid · Platform & CRM',
  description: 'Fieldgrid platformbeheer, CRM, afspraken en managementcockpit.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="nl"><body>{children}</body></html>;
}
