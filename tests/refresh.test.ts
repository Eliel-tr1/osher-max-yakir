import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** רענון: לשונית של תובנות השיחה שלא נקראה נשארת מהרענון הקודם, עם הזמן האמיתי שלה (הנחיית המנהל 3/11/2026) */
const php = (() => {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!php)('keeping a tab that failed to read', () => {
  it('keeps the previous part with its read time, and reconnects each row to the lead with the same id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keep-'));
    writeFileSync(join(dir, 'leads.json'), JSON.stringify({
      version: 2, generatedAt: '2026-11-02T04:30:00.000Z',
      insights: { analysis: { readAt: '2026-11-02T04:30:00.000Z', rows: [{ at: '2026-10-20T07:00:00.000Z', lead: 0, reason: 'אחר' }, { at: '2026-10-21T07:00:00.000Z', lead: 1 }] } },
    }));
    writeFileSync(join(dir, 'ids.json'), JSON.stringify({ analysis: { ns: ['A', 'B'], names: ['x', 'y'], texts: ['', ''] } }));
    const code = `require 'public/_refresh.php';
      $built = ['file' => ['insights' => ['analysis' => null, 'questions' => null, 'inquiries' => null, 'feedback' => null]], 'ids' => ['analysis' => null], 'leadOfNs' => ['B' => 0, 'C' => 1]];
      osher_keep_failed_parts($built, ['analysis', 'inquiries']);
      echo json_encode([$built['file']['insights'], $built['ids']['analysis']], JSON_UNESCAPED_UNICODE);`;
    const [ins, ids] = JSON.parse(execFileSync('php', ['-r', code], { encoding: 'utf8', env: { ...process.env, OSHER_PRIVATE_DIR: dir } }));
    expect(ins.analysis.readAt).toBe('2026-11-02T04:30:00.000Z');
    // A כבר לא בלידים; B עבר למקום 0
    expect(ins.analysis.rows.map((r: { lead: number | null }) => r.lead)).toEqual([null, 0]);
    expect(ins.inquiries).toBeNull();
    expect(ids.names).toEqual(['x', 'y']);
  });
});
