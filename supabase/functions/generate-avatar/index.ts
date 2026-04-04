import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getGeminiApiKey } from '../_shared/get-gemini-key.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      gender = 'female',
      ageRange = '26-35',
      ethnicity = 'caucasian',
      style = 'ugc',
      background = 'studio',
      backgroundPrompt,
      customPrompt,
      prompt: directPrompt,
      cameraDevice = 'iphone',
      aspectRatio = '3:4',
      realism = 0.7,
      wideAngle = 0.5,
      angleType,
      anglePromptModifier,
      angleFocalLength,
      angleFraming,
      referenceImageUrl,
      realism_level = 'high',
      style_preset,
      look_type,
      look_description,
      avatar_description,
      apiKey: requestApiKey,
      isStock,
      clientId,
    } = body;

    // Get API key with priority chain
    const geminiApiKey = await getGeminiApiKey(requestApiKey);
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Gemini API key not configured. Add it in Agency Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the prompt
    let fullPrompt: string;

    if (directPrompt) {
      fullPrompt = directPrompt;
    } else {
      const realismDesc = realism_level === 'ultra-realistic'
        ? 'shot on Canon EOS R5 with RF 50mm f/1.2L, 8K resolution, natural skin texture with visible pores'
        : realism_level === 'high'
        ? 'high-resolution DSLR quality, natural skin texture, professional studio lighting'
        : 'clean polished portrait, professional quality';

      const cameraDesc = cameraDevice === 'samsung'
        ? 'Samsung Galaxy S24 Ultra camera, vivid AMOLED-tuned colors, AI-enhanced sharpness'
        : 'iPhone 15 Pro camera, natural Apple color science, ProRAW quality';

      const bgDesc = backgroundPrompt || 'clean neutral studio backdrop, professional lighting';

      const angleDesc = anglePromptModifier
        ? `\nCamera angle: ${anglePromptModifier}. Focal: ${angleFocalLength || '50mm'}. Framing: ${angleFraming || 'standard'}.`
        : '';

      const lookDesc = look_type && look_description
        ? `\nVariation type: ${look_type}. ${look_description}`
        : '';

      const avatarDesc = avatar_description
        ? `\nIdentity reference: ${avatar_description}`
        : '';

      fullPrompt = `Generate a hyper-realistic ${gender} person, age ${ageRange}, ${ethnicity} ethnicity, ${style} style.
${realismDesc}. ${cameraDesc}.
Background/setting: ${bgDesc}
${angleDesc}
${lookDesc}
${avatarDesc}
${customPrompt ? `Additional instructions: ${customPrompt}` : ''}

CRITICAL REQUIREMENTS:
- Photorealistic human portrait, indistinguishable from a real photograph
- Natural skin texture, subtle imperfections, realistic hair
- Proper lighting with catchlights in eyes
- NO artificial or AI-looking artifacts
- NO watermarks or text
- Authentic UGC creator aesthetic`.trim();
    }

    // Build parts array
    const parts: any[] = [{ text: fullPrompt }];

    // Add reference image for identity consistency
    if (referenceImageUrl) {
      try {
        const imgRes = await fetch(referenceImageUrl);
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          const b64 = arrayBufferToBase64(buf);
          const ct = imgRes.headers.get('content-type') || 'image/png';
          parts.push({ inlineData: { mimeType: ct, data: b64 } });
          console.log('Added reference image for identity consistency');
        }
      } catch (err) {
        console.warn('Failed to fetch reference image:', err);
      }
    }

    // Call Gemini
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Gemini API error', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiResponse.json();
    const candidates = geminiData.candidates || [];
    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No image generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const imageParts = candidates[0]?.content?.parts || [];
    const imagePart = imageParts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart?.inlineData?.data) {
      return new Response(
        JSON.stringify({ success: false, error: 'No image data in response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const base64Image = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType || 'image/png';

    // Upload to storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const imageBytes = Uint8Array.from(atob(base64Image), c => c.charCodeAt(0));
    const timestamp = Date.now();
    const uuid = crypto.randomUUID().slice(0, 8);
    const ext = mimeType.split('/')[1] || 'png';
    const folder = clientId ? `avatars/${clientId}` : 'avatars/stock';
    const filePath = `${folder}/${timestamp}-${uuid}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(filePath, imageBytes, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to upload avatar image' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(filePath);

    console.log('Avatar generated successfully:', publicUrl);

    return new Response(
      JSON.stringify({ success: true, imageUrl: publicUrl, storagePath: filePath }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Generate avatar error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
