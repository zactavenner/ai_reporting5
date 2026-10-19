import type { Client } from '@/hooks/useClients';
import { AgentWorkforceV3 } from './AgentWorkforceV3';
import { AllChannelsInbox } from './AllChannelsInbox';
import { JarvisMissionsPanel } from './JarvisMissionsPanel';
import { ExternalAgentsPanel } from './ExternalAgentsPanel';
import { AgentsTeamChat } from './AgentsTeamChat';

interface Props { clients: Client[]; }

export function AgentsTab({ clients }: Props) {
  return (
    <div className="space-y-6">
      {/* Persistent backend goal loop — Jarvis + specialist agents + Jeremy AI */}
      <JarvisMissionsPanel />

      {/* Real external assistants (Grok PPM, Alfred, Muse, Claude) + shared team chat */}
      <div className="grid gap-6 xl:grid-cols-2">
        <ExternalAgentsPanel />
        <AgentsTeamChat />
      </div>

      {/* Agent Workforce v3 — Claude-style profiles with Memory / Instructions / Files / Connectors / Models */}
      <AgentWorkforceV3 />

      {/* Agency-wide unified inbox across all agent channels (agency + client) */}
      <AllChannelsInbox clients={clients} />
    </div>
  );
}
