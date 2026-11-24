import { useState } from 'react';
import { Check, Edit3, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Creative, useRenameCreative } from '@/hooks/useCreatives';

export function CreativeNameEditor({ creative, readOnly = false }: { creative: Creative; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(creative.title);
  const rename = useRenameCreative();

  const save = () => {
    if (!name.trim() || rename.isPending) return;
    if (name.trim() === creative.title) {
      setEditing(false);
      return;
    }
    rename.mutate({ id: creative.id, clientId: creative.client_id, title: name }, {
      onSuccess: () => setEditing(false),
    });
  };

  if (editing && !readOnly) {
    return (
      <form className="flex min-w-0 flex-1 flex-wrap items-center gap-1" onSubmit={event => { event.preventDefault(); save(); }}>
        <Input
          aria-label="Creative name"
          autoFocus
          className="h-8 min-w-0 flex-1 basis-24 text-sm"
          value={name}
          disabled={rename.isPending}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape' && !rename.isPending) setEditing(false); }}
        />
        <Button type="submit" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Save creative name" title="Save name" disabled={!name.trim() || rename.isPending}>
          {rename.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Cancel rename" title="Cancel" disabled={rename.isPending} onClick={() => setEditing(false)}>
          <X className="h-4 w-4" />
        </Button>
      </form>
    );
  }

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <span className="min-w-0 break-words" title={creative.title}>{creative.title}</span>
      {!readOnly && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Rename creative: ${creative.title}`} onClick={() => { setName(creative.title); setEditing(true); }}>
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Rename creative</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}