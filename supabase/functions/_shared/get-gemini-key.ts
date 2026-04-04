import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type GeminiKeyType = 'text' | 'video' | 'transcription';

type AgencySettingsRow = {
  settings?: Record<string, unknown> | null;
  gemini_api_key?: string | null;
  gemini_text_key?: string | null;
  gemini_video_key?: string | null;
  gemini_transcription_key?: string | null;
};

const typeKeyMap: Record<GeminiKeyType, keyof AgencySettingsRow> = {
  text: 'gemini_text_key',
  video: 'gemini_video_key',
  transcription: 'gemini_transcription_key',
};

function readKey(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function getSettingsObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractGeminiKey(row: AgencySettingsRow | null | undefined, keyType: GeminiKeyType): string | null {
  if (!row) return null;

  const settings = getSettingsObject(row.settings);
  const typeKey = typeKeyMap[keyType];

  return (
    readKey(row[typeKey]) ??
    readKey(settings[typeKey]) ??
    readKey(row.gemini_api_key) ??
    readKey(settings.gemini_api_key)
  );
}

async function fetchAgencySettingsRow(url: string, serviceKey: string): Promise<AgencySettingsRow | null> {
  const supabase = createClient(url, serviceKey);

  const { data: narrowedRow, error: narrowedError } = await supabase
    .from('agency_settings')
    .select('settings, gemini_api_key, gemini_text_key, gemini_video_key, gemini_transcription_key')
    .limit(1)
    .maybeSingle();

  if (!narrowedError && narrowedRow) {
    return narrowedRow as AgencySettingsRow;
  }

  const { data: fallbackRow, error: fallbackError } = await supabase
    .from('agency_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (!fallbackError && fallbackRow) {
    return fallbackRow as AgencySettingsRow;
  }

  return null;
}

/**
 * Get Gemini API key with priority:
 * 1. Agency settings in Lovable Cloud
 * 2. Agency settings in the original production database
 * 3. Key passed in request body (client override / local fallback)
 * 4. GEMINI_API_KEY env var
 */
export async function getGeminiApiKey(requestApiKey?: string, keyType: GeminiKeyType = 'text'): Promise<string | null> {
  try {
    const databaseCandidates = [
      {
        url: Deno.env.get('SUPABASE_URL'),
        serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      },
      {
        url: Deno.env.get('ORIGINAL_SUPABASE_URL'),
        serviceKey: Deno.env.get('ORIGINAL_SUPABASE_SERVICE_ROLE_KEY'),
      },
    ];

    for (const candidate of databaseCandidates) {
      if (!candidate.url || !candidate.serviceKey) continue;

      const row = await fetchAgencySettingsRow(candidate.url, candidate.serviceKey);
      const resolvedKey = extractGeminiKey(row, keyType);
      if (resolvedKey) return resolvedKey;
    }
  } catch (err) {
    console.warn('Failed to resolve Gemini key from agency settings:', err);
  }

  if (requestApiKey?.trim()) return requestApiKey;

  return Deno.env.get('GEMINI_API_KEY') || null;
}
