import type { NextConfig } from 'next';
import { BASE_PATH } from './lib/app';

const nextConfig: NextConfig = {
  // אתר סטטי: נבנה בגיטהאב ועולה כקבצים לתיקייה oshermax באתר ai.vitrue.co.il,
  // כמו שאר הפרויקטים שם. בשרת לא צריך Node. הנתונים נקראים בדפדפן מ-data/leads.json.
  output: 'export',
  basePath: BASE_PATH,
  trailingSlash: true,
};

export default nextConfig;
