/**
 * Name lookup and note formatting for call-transcription.
 *
 * Contact and user names come from GHL (clients.ghl_api_key + clients.ghl_location_id)
 * so the summary model and the speech-to-text prompt use the CRM spelling.
 * A failed lookup keeps the names already on the call record.
 */
const GHL_BASE = "https://services.leadconnectorhq.com";

export interface CallPartyNames {
  contactName: string | null;
  userName: string | null;
}

export interface LookupCallPartyNamesArgs {
  apiKey: string | null;
  locationId: string | null;
  contactId: string | null;
  userId: string | null;
  fallbackContactName?: string | null;
  fallbackUserName?: string | null;
  fetchImpl?: typeof fetch;
}

function filled(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function idOf(value: unknown): string | null {
  const direct = filled(value);
  if (direct) return direct;
  if (value && typeof value === "object" && "id" in value) {
    return filled((value as { id: unknown }).id);
  }
  return null;
}

/** first + last when GHL has them, otherwise a single full-name field. */
export function ghlFullName(person: unknown): string | null {
  if (!person || typeof person !== "object") return null;
  const record = person as Record<string, unknown>;
  const first = filled(record.firstName ?? record.first_name);
  const last = filled(record.lastName ?? record.last_name);
  return filled([first, last].filter(Boolean).join(" "))
    || filled(record.name ?? record.fullName ?? record.full_name ?? record.contactName);
}

function ghlHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: "2021-07-28",
    Accept: "application/json",
  };
}

async function readJson(res: Response): Promise<any> {
  return await res.json().catch(() => null);
}

/**
 * Look up the prospect by contact id and the rep by user id.
 * When the call has no user id, the contact's assigned user is the rep.
 * Any failed request leaves that side on its fallback name.
 */
export async function lookupCallPartyNames(args: LookupCallPartyNamesArgs): Promise<CallPartyNames> {
  const fallback: CallPartyNames = {
    contactName: filled(args.fallbackContactName),
    userName: filled(args.fallbackUserName),
  };
  const apiKey = filled(args.apiKey);
  const locationId = filled(args.locationId);
  const contactId = filled(args.contactId);
  const explicitUserId = idOf(args.userId);
  if (!apiKey || !locationId || (!contactId && !explicitUserId)) return fallback;

  const fetchImpl = args.fetchImpl ?? fetch;
  let contactName = fallback.contactName;
  let assignedUserId: string | null = null;

  if (contactId) {
    try {
      const res = await fetchImpl(`${GHL_BASE}/contacts/${encodeURIComponent(contactId)}`, {
        headers: ghlHeaders(apiKey),
      });
      if (res.ok) {
        const body = await readJson(res);
        const contact = body?.contact ?? body;
        const contactLocation = filled(contact?.locationId ?? contact?.location_id);
        if (!contactLocation || contactLocation === locationId) {
          contactName = ghlFullName(contact) || contactName;
          assignedUserId = idOf(contact?.assignedTo) || idOf(contact?.assignedUserId) || idOf(contact?.assigned_to);
        }
      }
    } catch {
      contactName = fallback.contactName;
    }
  }

  const userId = explicitUserId || assignedUserId;
  let userName = fallback.userName;
  if (userId) {
    try {
      const res = await fetchImpl(`${GHL_BASE}/users/${encodeURIComponent(userId)}`, {
        headers: ghlHeaders(apiKey),
      });
      if (res.ok) {
        const body = await readJson(res);
        userName = ghlFullName(body?.user ?? body) || userName;
      }
    } catch {
      userName = fallback.userName;
    }
  }

  return { contactName, userName };
}

/** Prompt text for a transcription provider that accepts a vocabulary hint. */
export function transcriptionNamePrompt(
  repName: string | null | undefined,
  prospectName: string | null | undefined,
): string | undefined {
  const rep = filled(repName);
  const prospect = filled(prospectName);
  if (rep && prospect) return `The rep is ${rep} and the prospect is ${prospect}.`;
  if (rep) return `The rep is ${rep}.`;
  if (prospect) return `The prospect is ${prospect}.`;
  return undefined;
}

/** Tells the summary model which spellings to keep and who is speaking on a voicemail. */
export function summaryUserPreamble(
  repName: string | null | undefined,
  prospectName: string | null | undefined,
): string {
  const rep = filled(repName);
  const prospect = filled(prospectName);
  return (
    `Analyze this phone call transcript. Salesperson${rep ? ` = ${rep}` : ""} is "User". ` +
    `Prospect${prospect ? ` = ${prospect}` : ""} is "Contact". ` +
    "Use these exact spellings for the rep and the prospect. " +
    "On a voicemail, or when only one person speaks, the speaker is the rep."
  );
}

/** Header clock for the GHL note: Pacific time, labeled PT. */
export function callSummaryTimestamp(when?: string | number | Date | null, now: Date = new Date()): string {
  const parsed = when == null || when === "" ? now : new Date(when);
  const date = Number.isNaN(parsed.getTime()) ? now : parsed;
  return `${date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT`;
}

export function isBlankSummary(summary: unknown): boolean {
  return String(summary ?? "").trim().length === 0;
}
