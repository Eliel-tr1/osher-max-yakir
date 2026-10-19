import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // אתר סטטי: נבנה בגיטהאב ועולה כקבצים לתיקייה oshermax באתר ai.vitrue.co.il,
  // כמו שאר הפרויקטים שם. בשרת לא צריך Node.
  output: 'export',
  basePath: '/oshermax',
  trailingSlash: true,
};

export default nextConfig;
