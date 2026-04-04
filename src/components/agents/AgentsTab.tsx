import { useState } from 'react';
import { Plus, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAgents, useAgentRuns, useCreateAgent, useUpdateAgent, useDeleteAgent, useRunAgent, AGENT_TEMPLATES, type Agent } from '@/hooks/useAgents';
import type { Client } from '@/hooks/useClients';

interface Props { clients: Client[]; }

export function AgentsTab({ clients }: Props) {
  const { data: agents = [], isLoading } = useAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedAgent = agents.find(a => a.id === selectedId) || null;
  const { data: runs = [] } = useAgentRuns(selectedId);
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();
  const runAgent = useRunAgent();

  const handleCreateBlank = () => {
    createAgent.mutate({ name: 'New Agent', icon: '🤖', description: '', prompt_template: '', schedule_cron: '0 6 * * *', model: 'google/gemini-2.5-pro', connectors: ['database'] as any, enabled: false } as any);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">AI Agents</h2>
          <p className="text-sm text-muted-foreground">Autonomous workers that run on schedule with full data access</p>
        </div>
        <Button size="sm" onClick={handleCreateBlank} disabled={createAgent.isPending}>
          <Plus className="h-4 w-4 mr-1" /> New Agent
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <span className="text-4xl mb-4 block">🤖</span>
          <h3 className="font-semibold mb-2">No agents yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first agent to get started.</p>
          <Button onClick={handleCreateBlank}>Create Agent</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-3 lg:col-span-1">
            {agents.map((agent) => (
              <div key={agent.id} onClick={() => setSelectedId(agent.id)}
                className={`border rounded-lg p-4 cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === agent.id ? 'border-primary bg-primary/5' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{agent.icon || '🤖'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{agent.description || 'No description'}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${agent.enabled ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                </div>
              </div>
            ))}
          </div>
          <div className="lg:col-span-2">
            {selectedAgent ? (
              <div className="border rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">{selectedAgent.icon} {selectedAgent.name}</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => runAgent.mutate({ agentId: selectedAgent.id, clientId: selectedAgent.client_id || undefined })}>Run Now</Button>
                    <Button variant="outline" size="sm" onClick={() => { updateAgent.mutate({ id: selectedAgent.id, enabled: !selectedAgent.enabled } as any); }}>
                      {selectedAgent.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => { setSelectedId(null); deleteAgent.mutate(selectedAgent.id); }}>Delete</Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{selectedAgent.description}</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Model: {selectedAgent.model || 'Not set'}</p>
                  <p>Schedule: {selectedAgent.schedule_cron || 'Manual'}</p>
                </div>
                {runs.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Recent Runs</h4>
                    {runs.slice(0, 5).map(run => (
                      <div key={run.id} className="border rounded p-3 text-xs space-y-1">
                        <div className="flex justify-between"><span className="font-medium capitalize">{run.status}</span><span className="text-muted-foreground">{run.started_at ? new Date(run.started_at).toLocaleString() : ''}</span></div>
                        {run.output_summary && <p className="text-muted-foreground line-clamp-2">{run.output_summary}</p>}
                        {run.error && <p className="text-destructive">{run.error}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                <p className="text-muted-foreground">Select an agent to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
