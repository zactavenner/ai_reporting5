import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Film, Plus, MoreVertical, Copy, Trash2, Pencil, Clock, RatioIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { VideoProject } from '@/hooks/useVideoProjects';

interface VideoProjectHomeProps {
  projects: VideoProject[];
  isLoading: boolean;
  onCreateProject: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject: (project: VideoProject) => void;
  onRenameProject: (id: string, name: string) => void;
}

export function VideoProjectHome({
  projects,
  isLoading,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
  onRenameProject,
}: VideoProjectHomeProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const startRename = (p: VideoProject) => {
    setEditingId(p.id);
    setEditName(p.name);
  };

  const commitRename = (id: string) => {
    if (editName.trim()) onRenameProject(id, editName.trim());
    setEditingId(null);
  };

  const getDurationLabel = (p: VideoProject) => {
    const clips = (p as any).clips_data || (p as any).scenes || [];
    if (clips.length === 0) return '0:00';
    const total = clips.reduce((s: number, c: any) => s + ((c.trimEnd || c.duration || 0) - (c.trimStart || 0)) / (c.speed || 1), 0);
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center min-h-[calc(100vh-48px)] -m-6 bg-[#f9fafb] p-8">
      <div className="w-full max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h1 className="text-2xl font-bold text-foreground">Video Editor</h1>
          <Button onClick={onCreateProject} className="gap-2 bg-[#111827] hover:bg-[#1f2937] text-white">
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </div>

        {/* Project grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-20 h-20 rounded-2xl bg-muted/30 flex items-center justify-center">
              <Film className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-lg font-medium text-foreground">No projects yet</p>
              <p className="text-sm text-muted-foreground mt-1">Upload a video to get started.</p>
            </div>
            <Button onClick={onCreateProject} size="lg" className="gap-2 mt-2">
              <Plus className="h-5 w-5" /> Create First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <div
                key={p.id}
                className={cn(
                  'group relative rounded-xl border border-border/50 bg-card hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer overflow-hidden'
                )}
                onClick={() => onOpenProject(p.id)}
              >
                {/* Thumbnail area */}
                <div className="h-28 bg-[#111827] flex items-center justify-center">
                  <Film className="h-8 w-8 text-gray-600" />
                </div>

                {/* Info */}
                <div className="p-3 space-y-1.5">
                  {editingId === p.id ? (
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => commitRename(p.id)}
                      onKeyDown={e => e.key === 'Enter' && commitRename(p.id)}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                      className="h-7 text-sm font-semibold"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                  )}

                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {getDurationLabel(p)}
                    </span>
                    <span className="flex items-center gap-1">
                      <RatioIcon className="h-3 w-3" /> {p.aspect_ratio}
                    </span>
                    <span>{formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}</span>
                  </div>
                </div>

                {/* 3-dot menu */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7"
                        onClick={e => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => startRename(p)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicateProject(p)}>
                        <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDeleteProject(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
