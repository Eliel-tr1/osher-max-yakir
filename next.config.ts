import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // קובץ הרצה עצמאי: על השרת צריך רק Node, בלי להתקין תלויות.
  output: 'standalone',
  poweredByHeader: false,
};

export default nextConfig;
