import type { Metadata } from 'next';
import { Barlow_Condensed, Open_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
// Styles by area, in cascade order (responsive last). Tokens are in base.css.
import '../ui/styles/base.css';
import '../ui/styles/shell.css';
import '../ui/styles/cards.css';
import '../ui/styles/map.css';
import '../ui/styles/sheets.css';
import '../ui/styles/table.css';
import '../ui/styles/admin.css';
import '../ui/styles/responsive.css';

// Fonts from docs/spec/06-ui.md (Design tokens): Open Sans for everything, as on reedelsevier.com.ph (RELX branding);
// Barlow Condensed only for the map's room labels, which must fit inside the rooms (FloorMap measures them).
const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-open-sans',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'REPH Room Assistant',
  description: 'Book rooms at REPH Bldg. H and Iloilo with an AI assistant and a live floor map.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${openSans.variable} ${barlowCondensed.variable}`}>
      <body>{children}</body>
    </html>
  );
}
