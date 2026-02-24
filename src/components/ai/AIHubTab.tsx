import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, BookOpen, Bot } from 'lucide-react';
import { AIHubChat } from './AIHubChat';
import { KnowledgeBasePanel } from './KnowledgeBasePanel';
import { CustomGPTsPanel } from './CustomGPTsPanel';
import { CustomGPT } from '@/hooks/useCustomGPTs';
import { Client } from '@/hooks/useClients';
import { SourceAggregatedMetrics } from '@/hooks/useSourceMetrics';

interface AIHubTabProps {
  clients: Client[];
  clientMetrics: Record<string, SourceAggregatedMetrics>;
  agencyMetrics: SourceAggregatedMetrics;
}

export function AIHubTab({ clients, clientMetrics, agencyMetrics }: AIHubTabProps) {
  const [activeSubTab, setActiveSubTab] = useState('chat');
  const [selectedGPT, setSelectedGPT] = useState<CustomGPT | null>(null);

  const handleSelectGPT = (gpt: CustomGPT) => {
    setSelectedGPT(gpt);
    setActiveSubTab('chat');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">AI Hub</h2>
          <p className="text-sm text-muted-foreground">
            Chat with AI assistants, manage knowledge base, and create custom GPTs
          </p>
        </div>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="gpts" className="gap-2">
            <Bot className="h-4 w-4" />
            Custom GPTs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="space-y-4">
          <AIHubChat 
            selectedGPT={selectedGPT}
            onClearGPT={() => setSelectedGPT(null)}
            clients={clients}
            clientMetrics={clientMetrics}
            agencyMetrics={agencyMetrics}
          />
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <KnowledgeBasePanel />
        </TabsContent>

        <TabsContent value="gpts" className="space-y-4">
          <CustomGPTsPanel onSelectGPT={handleSelectGPT} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
