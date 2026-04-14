import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DashboardBoard {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  board_type: string;
  layout: any[];
  is_default: boolean;
  is_template: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardWidget {
  id: string;
  board_id: string;
  widget_type: string;
  title: string | null;
  config: Record<string, any>;
  position: { x: number; y: number; w: number; h: number };
  created_at: string;
}

export function useDashboardBoards(clientId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard-boards', clientId],
    queryFn: async (): Promise<DashboardBoard[]> => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('dashboard_boards')
        .select('*')
        .or(`client_id.eq.${clientId},is_template.eq.true`)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as DashboardBoard[];
    },
    enabled: !!clientId,
  });
}

export function useBoardWidgets(boardId: string | undefined) {
  return useQuery({
    queryKey: ['board-widgets', boardId],
    queryFn: async (): Promise<DashboardWidget[]> => {
      if (!boardId) return [];
      const { data, error } = await supabase
        .from('dashboard_widgets')
        .select('*')
        .eq('board_id', boardId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as DashboardWidget[];
    },
    enabled: !!boardId,
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, name, description, boardType, templateId }: {
      clientId: string; name: string; description?: string; boardType?: string; templateId?: string;
    }) => {
      let layout: any[] = [];
      if (templateId) {
        const { data: template } = await supabase
          .from('dashboard_boards').select('layout').eq('id', templateId).single();
        layout = template?.layout || [];
      }
      const { data, error } = await supabase
        .from('dashboard_boards')
        .insert({ client_id: clientId, name, description: description || null, board_type: boardType || 'custom', layout, is_default: false, is_template: false })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard-boards'] }); },
  });
}

export function useUpdateBoardLayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId, layout }: { boardId: string; layout: any[] }) => {
      const { error } = await supabase.from('dashboard_boards').update({ layout }).eq('id', boardId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard-boards'] }); },
  });
}

export function useAddWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId, widgetType, title, config, position }: {
      boardId: string; widgetType: string; title?: string; config?: Record<string, any>;
      position?: { x: number; y: number; w: number; h: number };
    }) => {
      const { data, error } = await supabase
        .from('dashboard_widgets')
        .insert({ board_id: boardId, widget_type: widgetType, title: title || null, config: config || {}, position: position || { x: 0, y: 0, w: 4, h: 3 } })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => { queryClient.invalidateQueries({ queryKey: ['board-widgets', vars.boardId] }); },
  });
}

export function useDeleteWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ widgetId, boardId }: { widgetId: string; boardId: string }) => {
      const { error } = await supabase.from('dashboard_widgets').delete().eq('id', widgetId);
      if (error) throw error;
      return boardId;
    },
    onSuccess: (boardId) => { queryClient.invalidateQueries({ queryKey: ['board-widgets', boardId] }); },
  });
}
