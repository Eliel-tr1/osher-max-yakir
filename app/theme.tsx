'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

/** כפתור מעבר בין כהה לבהיר. הבחירה נשמרת בדפדפן של הצופה בלבד */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);
  const flip = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('osher-theme', next);
    } catch {
      // בלי אחסון: הבחירה תקפה עד רענון
    }
    setTheme(next);
  };
  return (
    <button type="button" className="themebtn" onClick={flip} aria-label={theme === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'} title={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}>
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
