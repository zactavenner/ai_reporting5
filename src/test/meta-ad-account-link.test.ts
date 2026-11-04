import { describe, expect, it } from 'vitest';
import { parseMetaAdAccountInput } from '@/lib/metaAdAccountLink';

describe('parseMetaAdAccountInput', () => {
  it('pulls the account and business out of a full Ads Manager link', () => {
    const r = parseMetaAdAccountInput(
      'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1948413122522274&business_id=123456789012&nav_entry_point=bm',
    );
    expect(r.accountId).toBe('1948413122522274');
    expect(r.businessId).toBe('123456789012');
    expect(r.fromLink).toBe(true);
  });

  it('reads act_ in a path link', () => {
    expect(parseMetaAdAccountInput('https://business.facebook.com/act_4069111180055441/settings').accountId).toBe('4069111180055441');
  });

  it('still accepts a bare ID or act_ ID', () => {
    expect(parseMetaAdAccountInput('act_834020666384160').accountId).toBe('834020666384160');
    expect(parseMetaAdAccountInput('834020666384160').accountId).toBe('834020666384160');
  });

  it('rejects a link with no ad account in it', () => {
    const r = parseMetaAdAccountInput('https://business.facebook.com/settings/people');
    expect(r.accountId).toBeNull();
    expect(r.error).toMatch(/No ad account/);
  });
});
