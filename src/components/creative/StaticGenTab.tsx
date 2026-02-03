import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Image, 
  Plus, 
  FolderOpen,
  Sparkles,
  Clock
} from 'lucide-react';

interface StaticGenTabProps {
  clientId: string;
  clientName: string;
}

export function StaticGenTab({ clientId, clientName }: StaticGenTabProps) {
  const [projects] = useState<any[]>([]); // Will be populated from database

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Image className="h-5 w-5" />
            Static Image Generator
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate static ad creatives for {clientName}
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
                This section is for internal agency use only. Create projects with offer details to generate AI-powered static ad creatives.
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
              Create your first static generation project to get started.
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
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {project.description || 'No description'}
                </p>
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{project.createdAt}</span>
                  <span>•</span>
                  <span>{project.assetsCount || 0} assets</span>
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
              <p className="font-medium text-sm">AI Image Generation</p>
              <p className="text-xs text-muted-foreground">Generate ad images from offer details</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Image className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Template Library</p>
              <p className="text-xs text-muted-foreground">Pre-built templates for quick creation</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FolderOpen className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Batch Generation</p>
              <p className="text-xs text-muted-foreground">Generate multiple variations at once</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
