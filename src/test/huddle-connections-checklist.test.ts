import { describe, it, expect } from 'vitest';
import { crmState, metaState, newest, offerState, pipelineState, syncState } from '@/lib/huddle/connectionsChecklist';

const NOW = new Date('2026-11-06T18:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('huddle connections checklist', () => {
  it('sync is current within 24h, stale after, missing when never', () => {
    expect(syncState(hoursAgo(2), NOW)).toBe('ok');
    expect(syncState(hoursAgo(30), NOW)).toBe('warn');
    expect(syncState(null, NOW)).toBe('missing');
  });

  it('meta is red with no linked accounts or no sync ever', () => {
    expect(metaState([], hoursAgo(1), NOW)).toBe('missing');
    expect(metaState([{ status: 'disconnected' }], hoursAgo(1), NOW)).toBe('missing');
    expect(metaState([{ status: 'active' }], null, NOW)).toBe('missing');
    expect(metaState([{ status: 'active' }], hoursAgo(1), NOW)).toBe('ok');
    expect(metaState([{ status: 'active', last_sync_error: 'token' }], hoursAgo(1), NOW)).toBe('warn');
  });

  it('CRM is red when not connected', () => {
    expect(crmState({ connected: false, lastSyncAt: hoursAgo(1) }, NOW)).toBe('missing');
    expect(crmState({ connected: true, lastSyncAt: hoursAgo(1) }, NOW)).toBe('ok');
  });

  it('offer needs a primary to be green', () => {
    expect(offerState([])).toBe('missing');
    expect(offerState([{ status: 'archived', is_primary: true }])).toBe('missing');
    expect(offerState([{ status: 'active', is_primary: false }])).toBe('warn');
    expect(offerState([{ status: 'active', is_primary: true }])).toBe('ok');
  });

  it('pipeline is green only when calendars, committed and funded are all mapped', () => {
    expect(pipelineState({ calendars: 1, committedStages: 1, fundedPipeline: true, fundedStages: 1 })).toBe('ok');
    expect(pipelineState({ calendars: 1, committedStages: 0, fundedPipeline: true, fundedStages: 1 })).toBe('warn');
    expect(pipelineState({ calendars: 0, committedStages: 0, fundedPipeline: false, fundedStages: 0 })).toBe('missing');
    expect(pipelineState({ calendars: 1, committedStages: 1, fundedPipeline: true, fundedStages: 0 })).toBe('warn');
  });

  it('newest picks the latest timestamp', () => {
    expect(newest(null, hoursAgo(5), hoursAgo(1))).toBe(hoursAgo(1));
    expect(newest(null, undefined)).toBeNull();
  });
});
