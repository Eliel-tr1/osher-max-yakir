import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'דשבורד אושר מקס',
  description: 'הלידים במקום אחד',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/** מצב כהה כברירת מחדל (הנחיית המנהל, 1/11/2026). רץ לפני הציור כדי שלא יהבהב לבן */
const THEME_SCRIPT = `try{var t=localStorage.getItem('osher-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
