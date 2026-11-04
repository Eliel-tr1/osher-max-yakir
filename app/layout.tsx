import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans_Hebrew } from 'next/font/google';
import './globals.css';

export const metadata: Metadata = {
  title: 'דשבורד אושר מקס',
  description: 'הלידים במקום אחד',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/** הגופנים נשמרים בבנייה ויושבים בשרת שלנו: הדף לא פונה לגוגל בכל טעינה (#34) */
const sans = IBM_Plex_Sans_Hebrew({ subsets: ['hebrew', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

/** מצב כהה כברירת מחדל (הנחיית המנהל, 1/11/2026). רץ לפני הציור כדי שלא יהבהב לבן */
const THEME_SCRIPT = `try{var t=localStorage.getItem('osher-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" data-theme="dark" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
