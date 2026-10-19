import { addDays, dayKey, type Range } from './metrics';

export { addDays };
import { israelDayStart } from './sheet/parse';

export type Preset = 'all' | '7d' | '30d' | 'month' | 'prevMonth' | 'custom';

export const PRESETS: { id: Exclude<Preset, 'custom'>; label: string }[] = [
  { id: '7d', label: '7 ימים' },
  { id: '30d', label: '30 יום' },
  { id: 'month', label: 'החודש' },
  { id: 'prevMonth', label: 'החודש הקודם' },
  { id: 'all', label: 'הכול' },
];

/** טווח לפי בחירה. ימים לפי שעון ישראל. custom: from ו-to כוללים, בפורמט 2026-10-19. */
export function rangeFor(preset: Preset, now: Date, custom?: { from: string; to: string }): Range {
  const today = dayKey(now);
  const month = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case '7d':
      return { from: israelDayStart(addDays(today, -6)), to: null };
    case '30d':
      return { from: israelDayStart(addDays(today, -29)), to: null };
    case 'month':
      return { from: israelDayStart(month), to: null };
    case 'prevMonth': {
      const prev = `${addDays(month, -1).slice(0, 7)}-01`;
      return { from: israelDayStart(prev), to: israelDayStart(month) };
    }
    case 'custom':
      return {
        from: custom?.from ? israelDayStart(custom.from) : null,
        to: custom?.to ? israelDayStart(addDays(custom.to, 1)) : null,
      };
    default:
      return { from: null, to: null };
  }
}
