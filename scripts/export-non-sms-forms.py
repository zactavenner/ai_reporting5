#!/usr/bin/env python3
"""Export the latest non-SMS form check to a JSON file on the box (NOT scheduled).

Edge functions can't write to the box, so the daily pg_cron job stores results in
public.meta_non_sms_form_checks; this script reads public.v_non_sms_forms_latest and writes
/workspace/shared/meta/non-sms-forms-latest.json (override with --out).

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (e.g. `set -a; . /home/box/secrets/reporting5.env; set +a`).
Never prints secrets.
"""
import argparse, json, os, sys, urllib.request

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/workspace/shared/meta/non-sms-forms-latest.json")
    a = ap.parse_args()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    req = urllib.request.Request(f"{url}/rest/v1/v_non_sms_forms_latest?select=ran_at,result",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    rows = json.load(urllib.request.urlopen(req, timeout=30))
    if not rows:
        sys.exit("no non-SMS form check has run yet")
    out = {"ran_at": rows[0]["ran_at"], **rows[0]["result"]}
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(out, f, indent=2)
    print(f"wrote {a.out}: {len(out.get('clients', []))} client(s)")

if __name__ == "__main__":
    main()
