import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PilotReadinessPanel } from '@/components/dashboard/PilotReadinessPanel';
import { emptyPacket } from '../../supabase/functions/_shared/pilotReadiness';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/lib/dashboardAuthHeaders', () => ({ dashboardAuthHeaders: () => ({ 'x-dashboard-token': 'test-session' }), normalizeDashboardError: async (error: Error) => error }));
const catalog = {
  clients: [{ id: 'client-1', name: 'Active client', status: 'active', meta_ad_account_id: '123', ghl_location_id: 'location' }],
  offers: [{ id: 'offer-1', client_id: 'client-1', title: 'Correct offer', status: 'active' }, { id: 'other-offer', client_id: 'other-client', title: 'Other client offer', status: 'active' }],
  members: [{ id: 'member-1', name: 'Real owner' }],
};
beforeEach(() => { cleanup(); invoke.mockReset(); });
describe('pilot setup UI', () => {
  it('supports active clients, filters offers and saves then reads the persisted draft', async () => {
    let saved = emptyPacket(); let version = 0;
    invoke.mockImplementation(async (_name, { body }) => {
      if (body.action === 'catalog') return { data: catalog };
      if (body.action === 'save') { saved = body.input; version++; return { data: {} }; }
      return { data: { packet: version ? { version } : null, input: saved, status: 'needs_input', blockers: [{ field: 'budget_evidence', message: 'Budget approval missing', owner_id: null }], source_changed: false } };
    });
    const user = userEvent.setup(); render(<PilotReadinessPanel />);
    await user.selectOptions(await screen.findByLabelText('Client'), 'client-1');
    const offer = await screen.findByLabelText('Client offer');
    expect(screen.queryByRole('option', { name: /Other client offer/ })).not.toBeInTheDocument();
    await user.selectOptions(offer, 'offer-1');
    await user.type(screen.getByLabelText('Agreed deliverables'), 'Review the pilot');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Saved and reloaded version 1.')).toBeInTheDocument();
    expect(screen.getByLabelText('Agreed deliverables')).toHaveValue('Review the pilot');
    expect(screen.queryByRole('button', { name: 'Accept reviewed setup' })).not.toBeInTheDocument();
    expect(invoke.mock.calls.map(c => c[1].body.action)).toEqual(['catalog', 'read', 'save', 'read']);
    expect(invoke.mock.calls[2][1]).toMatchObject({ headers: { 'x-dashboard-token': 'test-session' }, body: { expected_version: 0, scope: 'capital_raising' } });
  });
  it('shows denied or missing backend access as an error without an editable packet', async () => {
    invoke.mockResolvedValue({ error: new Error('Deployment unavailable') });
    render(<PilotReadinessPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Deployment unavailable');
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });
  it('requires saved review and attestation, and removes approval action after an edit', async () => {
    invoke.mockImplementation(async (_name, { body }) => ({ data: body.action === 'catalog' ? catalog : { packet: { version: 1 }, input: emptyPacket(), status: 'ready_for_review', blockers: [], source_changed: false } }));
    const user = userEvent.setup(); render(<PilotReadinessPanel />);
    await user.selectOptions(await screen.findByLabelText('Client'), 'client-1');
    const accept = await screen.findByRole('button', { name: 'Accept reviewed setup' });
    expect(accept).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(accept).toBeEnabled();
    await user.type(screen.getByLabelText('Agreed deliverables'), 'Changed');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept reviewed setup' })).not.toBeInTheDocument());
  });
});
