import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Client } from '@/hooks/useClients';

interface DeleteClientDialogProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteClientDialog({ client, open, onOpenChange }: DeleteClientDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const canDelete = confirmText === client?.name;

  const handleDelete = async () => {
    if (!client || !canDelete) return;
    
    setDeleting(true);
    try {
      // Delete related records first
      await supabase.from('alert_configs').delete().eq('client_id', client.id);
      await supabase.from('funded_investors').delete().eq('client_id', client.id);
      await supabase.from('calls').delete().eq('client_id', client.id);
      await supabase.from('leads').delete().eq('client_id', client.id);
      await supabase.from('daily_metrics').delete().eq('client_id', client.id);
      await supabase.from('sync_logs').delete().eq('client_id', client.id);
      
      // Delete the client
      const { error } = await supabase.from('clients').delete().eq('id', client.id);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['all-daily-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['funded-investors'] });
      
      toast.success(`${client.name} has been deleted`);
      setConfirmText('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Failed to delete client');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {client?.name}?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              This action cannot be undone. This will permanently delete the client 
              and all associated data including leads, calls, metrics, and investors.
            </p>
            <p className="font-medium">
              Type <span className="font-mono text-destructive">{client?.name}</span> to confirm:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type client name to confirm"
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'Deleting...' : 'Delete Client'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
