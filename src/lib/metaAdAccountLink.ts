/**
 * Parses whatever an operator pastes into "Link ad account": a bare ID,
 * `act_123…`, or a full Ads Manager / Business Manager URL. Returns the
 * numeric ad account ID plus the business portfolio ID when the link has one.
 */
export interface ParsedAdAccountInput {
  accountId: string | null;
  businessId: string | null;
  fromLink: boolean;
  error: string | null;
}

const ACCOUNT_PARAMS = ['act', 'ad_account_id', 'selected_ad_account_id', 'asset_id'];

export function parseMetaAdAccountInput(raw: string): ParsedAdAccountInput {
  const input = (raw || '').trim();
  if (!input) return { accountId: null, businessId: null, fromLink: false, error: null };

  const looksLikeLink = /^https?:\/\//i.test(input) || /facebook\.com/i.test(input);
  if (!looksLikeLink) {
    const id = input.replace(/^act_/i, '').replace(/\s+/g, '');
    if (/^\d{6,20}$/.test(id)) return { accountId: id, businessId: null, fromLink: false, error: null };
    return { accountId: null, businessId: null, fromLink: false, error: 'Enter an ad account ID or paste the Ads Manager link' };
  }

  let accountId: string | null = null;
  let businessId: string | null = null;
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    const params = new URLSearchParams(`${url.search.slice(1)}&${url.hash.replace(/^#/, '').split('?').pop() || ''}`);
    for (const key of ACCOUNT_PARAMS) {
      const v = (params.get(key) || '').replace(/^act_/i, '');
      if (/^\d{6,20}$/.test(v)) {
        accountId = v;
        break;
      }
    }
    const b = params.get('business_id') || params.get('global_scope_id');
    if (b && /^\d{6,20}$/.test(b)) businessId = b;
  } catch {
    /* fall through to regex */
  }
  if (!accountId) {
    const m = input.match(/act_(\d{6,20})/i);
    if (m) accountId = m[1];
  }
  if (!accountId) {
    return { accountId: null, businessId, fromLink: true, error: 'No ad account ID found in that link' };
  }
  return { accountId, businessId, fromLink: true, error: null };
}
