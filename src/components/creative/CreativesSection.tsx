import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreativeApproval } from './CreativeApproval';
import { StaticGenTab } from './StaticGenTab';
import { VideoGenTab } from './VideoGenTab';
import { Upload, Image, Video } from 'lucide-react';

interface CreativesSectionProps {
  clientId: string;
  clientName: string;
  isPublicView?: boolean;
}

export function CreativesSection({ clientId, clientName, isPublicView = false }: CreativesSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState('approval');

  // In public view, only show the Creative Approval section
  if (isPublicView) {
    return (
      <CreativeApproval 
        clientId={clientId} 
        clientName={clientName} 
        isPublicView={true}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="approval" className="gap-2">
            <Upload className="h-4 w-4" />
            Creative Approval
          </TabsTrigger>
          <TabsTrigger value="static" className="gap-2">
            <Image className="h-4 w-4" />
            Static Gen
          </TabsTrigger>
          <TabsTrigger value="video" className="gap-2">
            <Video className="h-4 w-4" />
            Video Gen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approval" className="mt-4">
          <CreativeApproval 
            clientId={clientId} 
            clientName={clientName} 
            isPublicView={false}
          />
        </TabsContent>

        <TabsContent value="static" className="mt-4">
          <StaticGenTab 
            clientId={clientId} 
            clientName={clientName}
          />
        </TabsContent>

        <TabsContent value="video" className="mt-4">
          <VideoGenTab 
            clientId={clientId} 
            clientName={clientName}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
