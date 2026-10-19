import { APP_NAME } from '@/lib/app';

/**
 * בדיקת חיים של הדשבורד. הפריסה קוראת לכתובת הזו כדי לוודא שעונה הדשבורד שלנו,
 * ולא אפליקציה אחרת שיושבת על אותו פורט באותו שרת.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ app: APP_NAME, ok: true });
}
