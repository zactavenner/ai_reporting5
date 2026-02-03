import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Video, 
  Plus, 
  FolderOpen,
  Sparkles,
  Clock,
  Play
} from 'lucide-react';

interface VideoGenTabProps {
  clientId: string;
  clientName: string;
}

export function VideoGenTab({ clientId, clientName }: VideoGenTabProps) {
  const [projects] = useState<any[]>([]); // Will be populated from database

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Video className="h-5 w-5" />
            Video Ad Generator
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate video ad creatives for {clientName}
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Agency Only Notice */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-sm">Agency Creative Hub</p>
              <p className="text-xs text-muted-foreground">
                This section is for internal agency use only. Create projects with offer details to generate AI-powered video ad creatives.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-16 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg mb-2">No Projects Yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Create your first video generation project to get started.
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{project.name}</CardTitle>
                  <Badge variant="outline">
                    {project.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-muted rounded-lg mb-3 flex items-center justify-center">
                  <Play className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {project.description || 'No description'}
                </p>
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{project.createdAt}</span>
                  <span>•</span>
                  <span>{project.videosCount || 0} videos</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Coming Soon Features */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">AI Video Generation</p>
              <p className="text-xs text-muted-foreground">Generate videos from scripts & offers</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Video className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">UGC Templates</p>
              <p className="text-xs text-muted-foreground">Pre-built video ad templates</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FolderOpen className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Batch Rendering</p>
              <p className="text-xs text-muted-foreground">Render multiple variations at once</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
