import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const DELAY_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface QuestionAnswer {
  question: string;
  answer: string | string[] | null;
}

interface GHLCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
}

/**
 * Normalize a string for fuzzy matching: lowercase, strip spaces/punctuation
 */
function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Fetch all custom fields for a GHL location
 */
async function fetchCustomFields(apiKey: string, locationId: string): Promise<GHLCustomField[]> {
  try {
    const response = await fetch(`${GHL_BASE_URL}/locations/${locationId}/customFields`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[bulk-export-to-ghl] Failed to fetch custom fields: ${response.status} - ${text}`);
      return [];
    }

    const data = await response.json();
    return (data.customFields || []) as GHLCustomField[];
  } catch (err) {
    console.error('[bulk-export-to-ghl] Error fetching custom fields:', err);
    return [];
  }
}

/**
 * Build a mapping from normalized question label -> GHL custom field ID
 */
function buildFieldMap(customFields: GHLCustomField[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const field of customFields) {
    // Map by normalized name
    map.set(normalize(field.name), field.id);
    // Also map by fieldKey (e.g. "contact.field_name")
    if (field.fieldKey) {
      map.set(normalize(field.fieldKey), field.id);
      // Strip "contact." prefix
      const stripped = field.fieldKey.replace(/^contact\./, '');
      map.set(normalize(stripped), field.id);
    }
  }
  return map;
}
/**
 * Common question-to-field keyword mappings for better matching
 */
const KEYWORD_MAPPINGS: Record<string, string[]> = {
  'zipcode': ['zip code', 'zip', 'postal code', 'current zip'],
  'city': ['city', 'what city'],
  'state': ['state', 'what state'],
  'timezone': ['timezone', 'time zone'],
  'bilingualstatus': ['bilingual', 'speak another language', 'second language', 'languages'],
  'liveonsite': ['live on-site', 'live on site', 'on-site', 'onsite', 'willing to live'],
  'weekendavailability': ['weekend', 'available on weekends', 'weekend availability'],
  'nextrolegoals': ['next role', 'role goals', 'career goals', 'looking for in a role'],
  'resumepath': ['resume', 'cv', 'curriculum'],
  'videopath': ['video', 'video introduction', 'video resume'],
  'relocate': ['relocate', 'relocation', 'willing to relocate', 'move to'],
  'salesexperience': ['sales experience', 'business development', 'sales or business'],
  'outboundcalls': ['outbound calls', '50+ outbound', 'cold calls', 'making calls'],
};

/**
 * Extract meaningful words from a question (skip common stop words)
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['what', 'is', 'your', 'are', 'you', 'do', 'have', 'the', 'a', 'an', 'in', 'or', 'to', 'if', 'of', 'on', 'for', 'and', 'with', 'how', 'can', 'will', 'would', 'could', 'should', 'that', 'this', 'it', 'be', 'been', 'being', 'was', 'were', 'has', 'had', 'does', 'did', 'per', 'day', 'current', 'currently']);
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Try to match a question label to a GHL custom field ID using multiple strategies
 */
function matchFieldId(questionLabel: string, fieldMap: Map<string, string>): string | null {
  const norm = normalize(questionLabel);
  const lowerQuestion = questionLabel.toLowerCase();
  
  // 1. Direct normalized match
  if (fieldMap.has(norm)) return fieldMap.get(norm)!;
  
  // 2. Partial matching - field name contained in question or vice versa
  for (const [key, id] of fieldMap.entries()) {
    if (key.length > 3 && (norm.includes(key) || key.includes(norm))) {
      return id;
    }
  }
  
  // 3. Keyword-based matching against known patterns
  for (const [fieldNorm, keywords] of Object.entries(KEYWORD_MAPPINGS)) {
    const matched = keywords.some(kw => lowerQuestion.includes(kw));
    if (matched && fieldMap.has(fieldNorm)) {
      return fieldMap.get(fieldNorm)!;
    }
  }
  
  // 4. Word-level overlap matching
  const questionWords = extractKeywords(questionLabel);
  let bestMatch: { id: string; score: number } | null = null;
  
  for (const [key, id] of fieldMap.entries()) {
    const fieldWords = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
    if (fieldWords.length === 0) continue;
    
    const overlap = fieldWords.filter(fw => questionWords.some(qw => qw.includes(fw) || fw.includes(qw))).length;
    const score = overlap / fieldWords.length;
    
    if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id, score };
    }
  }
  
  if (bestMatch) return bestMatch.id;
  
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { client_id } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ success: false, error: 'client_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get client GHL credentials
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, ghl_api_key, ghl_location_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return new Response(JSON.stringify({ success: false, error: 'Client not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!client.ghl_api_key || !client.ghl_location_id) {
      return new Response(JSON.stringify({ success: false, error: 'Client has no GHL credentials configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Fetch GHL custom fields for the location
    console.log(`[bulk-export-to-ghl] Fetching custom fields for location ${client.ghl_location_id}...`);
    const customFields = await fetchCustomFields(client.ghl_api_key, client.ghl_location_id);
    console.log(`[bulk-export-to-ghl] Found ${customFields.length} custom fields`);
    
    const fieldMap = buildFieldMap(customFields);
    
    // Log field names for debugging
    if (customFields.length > 0) {
      console.log(`[bulk-export-to-ghl] Custom fields: ${customFields.map(f => `${f.name} (${f.id})`).join(', ')}`);
    }

    // Step 2: Fetch all leads with questions and external_id (GHL contact ID)
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, external_id, name, email, phone, questions')
      .eq('client_id', client_id)
      .not('external_id', 'is', null)
      .not('external_id', 'like', 'wh_%')
      .not('external_id', 'like', 'manual-%');

    if (leadsError) throw leadsError;

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No leads to export', updated: 0, skipped: 0, failed: 0, fields_mapped: 0, fields_unmapped: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[bulk-export-to-ghl] Processing ${leads.length} leads for ${client.name}`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let totalFieldsMapped = 0;
    let totalFieldsUnmapped = 0;
    const unmappedFieldNames = new Set<string>();

    for (const lead of leads) {
      const questions = lead.questions as QuestionAnswer[] | null;
      
      // Skip leads without question answers
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        skipped++;
        continue;
      }

      try {
        // Build custom field values and collect unmapped questions
        const customFieldValues: Record<string, string> = {};
        const unmappedQuestions: QuestionAnswer[] = [];

        for (const qa of questions) {
          if (!qa.question || qa.answer == null) continue;
          
          const answer = Array.isArray(qa.answer) ? qa.answer.join(', ') : String(qa.answer);
          const fieldId = matchFieldId(qa.question, fieldMap);
          
          if (fieldId) {
            customFieldValues[fieldId] = answer;
            totalFieldsMapped++;
          } else {
            unmappedQuestions.push(qa);
            unmappedFieldNames.add(qa.question);
            totalFieldsUnmapped++;
          }
        }

        let contactUpdated = false;
        let noteCreated = false;

        // Step 3a: Update contact with mapped custom fields
        if (Object.keys(customFieldValues).length > 0) {
          const updatePayload: Record<string, unknown> = {
            customFields: Object.entries(customFieldValues).map(([id, value]) => ({
              id,
              field_value: value,
            })),
          };

          const updateResponse = await fetch(`${GHL_BASE_URL}/contacts/${lead.external_id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${client.ghl_api_key}`,
              'Version': '2021-07-28',
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(updatePayload),
          });

          if (updateResponse.ok) {
            contactUpdated = true;
          } else {
            const errorText = await updateResponse.text();
            console.error(`[bulk-export-to-ghl] Contact update failed for ${lead.external_id}: ${updateResponse.status} - ${errorText}`);
          }
          
          await delay(DELAY_MS);
        }

        // Step 3b: For unmapped questions, create a note with the remaining answers
        if (unmappedQuestions.length > 0) {
          let noteBody = `📋 Form Responses (unmapped fields)\n\n`;
          for (const qa of unmappedQuestions) {
            const answer = Array.isArray(qa.answer) ? qa.answer.join(', ') : (qa.answer || 'N/A');
            noteBody += `${qa.question}: ${answer}\n`;
          }

          const noteResponse = await fetch(`${GHL_BASE_URL}/contacts/${lead.external_id}/notes`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${client.ghl_api_key}`,
              'Version': '2021-07-28',
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ body: noteBody }),
          });

          if (noteResponse.ok) {
            noteCreated = true;
          } else {
            const errorText = await noteResponse.text();
            console.error(`[bulk-export-to-ghl] Note creation failed for ${lead.external_id}: ${noteResponse.status} - ${errorText}`);
          }
          
          await delay(DELAY_MS);
        }

        if (contactUpdated || noteCreated) {
          updated++;
        } else if (Object.keys(customFieldValues).length === 0 && unmappedQuestions.length === 0) {
          skipped++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`[bulk-export-to-ghl] Error for ${lead.external_id}:`, err);
        failed++;
      }
    }

    const unmappedList = Array.from(unmappedFieldNames);
    console.log(`[bulk-export-to-ghl] Complete: ${updated} updated, ${skipped} skipped, ${failed} failed`);
    console.log(`[bulk-export-to-ghl] Fields mapped: ${totalFieldsMapped}, unmapped: ${totalFieldsUnmapped}`);
    if (unmappedList.length > 0) {
      console.log(`[bulk-export-to-ghl] Unmapped field names: ${unmappedList.join(', ')}`);
    }

    return new Response(JSON.stringify({
      success: true,
      updated,
      skipped,
      failed,
      total: leads.length,
      fields_mapped: totalFieldsMapped,
      fields_unmapped: totalFieldsUnmapped,
      unmapped_field_names: unmappedList,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[bulk-export-to-ghl] Error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
