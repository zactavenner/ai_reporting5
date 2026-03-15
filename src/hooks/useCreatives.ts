import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';
import { detectAspectRatio } from '@/lib/aspectRatioUtils';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface CreativeComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Creative {
  id: string;
  client_id: string;
  title: string;
  type: 'image' | 'video' | 'copy';
  platform: 'meta' | 'tiktok' | 'youtube' | 'google';
  file_url: string | null;
  headline: string | null;
  body_copy: string | null;
  cta_text: string | null;
  status: 'draft' | 'pending' | 'approved' | 'revisions' | 'rejected' | 'launched';
  comments: CreativeComment[];
  aspect_ratio: string | null;
  source: string;
  trigger_campaign_id: string | null;
  ai_performance_score: number | null;
  created_at: string;
  updated_at: string;
}

export function useCreatives(clientId?: string) {
  return useQuery({
    queryKey: ['creatives', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const data = await fetchAllRows((sb) =>
        sb.from('creatives')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
      );
      
      return data.map((item) => ({
        ...item,
        type: item.type as 'image' | 'video' | 'copy',
        platform: (item.platform as 'meta' | 'tiktok' | 'youtube' | 'google') || 'meta',
        status: item.status as 'draft' | 'pending' | 'approved' | 'revisions' | 'rejected' | 'launched',
        comments: (item.comments as unknown as CreativeComment[]) || [],
        aspect_ratio: (item as any).aspect_ratio || null,
        source: (item as any).source || 'manual',
        trigger_campaign_id: (item as any).trigger_campaign_id || null,
        ai_performance_score: (item as any).ai_performance_score || null,
      })) as Creative[];
    },
    enabled: !!clientId,
  });
}

interface SpellingCheckResult {
  hasErrors: boolean;
  severity: 'none' | 'minor' | 'critical';
  errors: Array<{ text: string; issue: string; suggestion: string }>;
  summary: string;
}

async function runSpellingCheck(creative: {
  headline?: string | null;
  body_copy?: string | null;
  cta_text?: string | null;
  type?: string;
  file_url?: string | null;
}): Promise<SpellingCheckResult | null> {
  try {
    let transcript: string | undefined;
    
    // For video content, first get transcript for review
    if (creative.type === 'video' && creative.file_url) {
      try {
        const { data: transcriptData } = await supabase.functions.invoke('creative-ai-audit', {
          body: { action: 'transcribe', videoUrl: creative.file_url }
        });
        if (transcriptData?.transcript) {
          transcript = transcriptData.transcript;
        }
      } catch (err) {
        console.error('Failed to get video transcript for review:', err);
        // Continue with text-only check
      }
    }
    
    const { data, error } = await supabase.functions.invoke('creative-ai-audit', {
      body: { action: 'spelling_check', creative, transcript }
    });
    
    if (error) {
      console.error('Spelling check error:', error);
      return null;
    }
    
    return data as SpellingCheckResult;
  } catch (err) {
    console.error('Failed to run spelling check:', err);
    return null;
  }
}

export function useCreateCreative() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (creative: {
      client_id: string;
      client_name?: string;
      title: string;
      type?: string;
      platform?: string;
      file_url?: string | null;
      headline?: string | null;
      body_copy?: string | null;
      cta_text?: string | null;
      status?: string;
      comments?: Json;
      aspect_ratio?: string | null;
      isAgencyUpload?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('creatives')
        .insert({
          client_id: creative.client_id,
          title: creative.title,
          type: creative.type || 'image',
          platform: creative.platform || 'meta',
          file_url: creative.file_url || null,
          headline: creative.headline || null,
          body_copy: creative.body_copy || null,
          cta_text: creative.cta_text || null,
          status: creative.status || (creative.isAgencyUpload ? 'draft' : 'pending'),
          comments: creative.comments || [],
          aspect_ratio: creative.aspect_ratio || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Run AI spelling/grammar check for agency uploads
      // Check text content OR video/image creatives (which may have text overlays or spoken content)
      const hasTextContent = creative.headline || creative.body_copy || creative.cta_text;
      const isMediaCreative = creative.type === 'video' || creative.type === 'image';
      
      if (creative.isAgencyUpload && (hasTextContent || isMediaCreative)) {
        const spellCheckResult = await runSpellingCheck({
          headline: creative.headline,
          body_copy: creative.body_copy,
          cta_text: creative.cta_text,
          type: creative.type,
          file_url: creative.file_url,
        });
        
        if (spellCheckResult?.hasErrors) {
          // Add AI review comment and potentially update status
          const aiComment = {
            id: Date.now().toString(),
            author: 'AI Review',
            text: `⚠️ **Spelling/Grammar Review**\n\n${spellCheckResult.summary}${
              spellCheckResult.errors.length > 0 
                ? '\n\n**Issues found:**\n' + spellCheckResult.errors.map(e => 
                    `• "${e.text}" - ${e.issue} → Suggestion: "${e.suggestion}"`
                  ).join('\n')
                : ''
            }`,
            createdAt: new Date().toISOString(),
          };
          
          const newStatus = spellCheckResult.severity === 'critical' ? 'revisions' : 'pending';
          
          await supabase
            .from('creatives')
            .update({ 
              comments: [aiComment] as unknown as Json,
              status: newStatus,
            })
            .eq('id', data.id);
          
          if (spellCheckResult.severity === 'critical') {
            toast.warning('AI found spelling/grammar issues - creative needs revisions');
          } else if (spellCheckResult.severity === 'minor') {
            toast.info('AI found minor spelling/grammar issues - please review');
          }
        }
      }
      
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creatives', variables.client_id] });
      toast.success('Creative uploaded successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to upload creative: ' + error.message);
    },
  });
}

export function useUpdateCreativeStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      clientId,
      creativeTitle
    }: { 
      id: string; 
      status: 'draft' | 'pending' | 'approved' | 'revisions' | 'rejected' | 'launched'; 
      clientId: string;
      creativeTitle?: string;
    }) => {
      const { data, error } = await supabase
        .from('creatives')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creatives', variables.clientId] });
      toast.success(`Creative ${variables.status}`);
    },
    onError: (error: Error) => {
      toast.error('Failed to update status: ' + error.message);
    },
  });
}

export function useAddCreativeComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      comment,
      clientId 
    }: { 
      id: string; 
      comment: CreativeComment;
      clientId: string;
    }) => {
      // First get current comments
      const { data: current, error: fetchError } = await supabase
        .from('creatives')
        .select('comments')
        .eq('id', id)
        .single();
      
      if (fetchError) throw fetchError;
      
      const existingComments = (current?.comments as unknown as CreativeComment[]) || [];
      const updatedComments = [...existingComments, comment];
      
      const { data, error } = await supabase
        .from('creatives')
        .update({ comments: updatedComments as unknown as Json })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creatives', variables.clientId] });
      toast.success('Comment added');
    },
    onError: (error: Error) => {
      toast.error('Failed to add comment: ' + error.message);
    },
  });
}

export function useDeleteCreative() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await supabase
        .from('creatives')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creatives', variables.clientId] });
      toast.success('Creative deleted');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete creative: ' + error.message);
    },
  });
}

export async function uploadCreativeFile(file: File, clientId: string): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${clientId}/${Date.now()}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('creatives')
    .upload(fileName, file);
  
  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from('creatives')
    .getPublicUrl(data.path);
  
  return publicUrl;
}

// Export the detectAspectRatio utility for use in components
export { detectAspectRatio };
