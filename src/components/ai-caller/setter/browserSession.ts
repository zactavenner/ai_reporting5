// Browser WebRTC test-call controller. The SDP exchange happens server-side, so
// no OpenAI key is ever present in the browser. Tool calls from the data
// channel are executed by the protected server endpoint.
import { setterInvoke } from '@/hooks/useAiSetter';

export type ConnState = 'idle' | 'requesting_mic' | 'mic_denied' | 'mic_unavailable' | 'connecting' | 'active' | 'closing' | 'closed' | 'failed';

export interface LiveHandlers {
  onState: (s: ConnState) => void;
  onTranscript: (who: 'AI Caller' | 'Prospect', text: string) => void;
  onTool: (name: string, status: string, revision?: number) => void;
  onError: (msg: string) => void;
}

export class BrowserSetterSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  sessionId: string | null = null;
  private handled = new Set<string>();
  private closed = false;

  constructor(private clientId: string, private h: LiveHandlers, private deps: {
    getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
    createPeer?: () => RTCPeerConnection;
  } = {}) {}

  async start(queueId: string) {
    this.h.onState('requesting_mic');
    const gum = this.deps.getUserMedia || ((c) => navigator.mediaDevices.getUserMedia(c));
    try {
      this.stream = await gum({ audio: true });
    } catch (e: any) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      this.h.onState(denied ? 'mic_denied' : 'mic_unavailable');
      return;
    }
    this.h.onState('connecting');
    try {
      const pc = (this.deps.createPeer || (() => new RTCPeerConnection()))();
      this.pc = pc;
      this.audio = document.createElement('audio');
      this.audio.autoplay = true;
      pc.ontrack = (ev) => { if (this.audio) this.audio.srcObject = ev.streams[0]; };
      this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.onmessage = (m) => this.onEvent(m.data);
      dc.onopen = () => {
        this.h.onState('active');
        // Agent speaks first.
        dc.send(JSON.stringify({ type: 'response.create' }));
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected'].includes(pc.connectionState) && !this.closed) this.end('dropped');
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const r = await setterInvoke<{ session_id: string; sdp: string }>('ai-setter-realtime-session', {
        action: 'start', client_id: this.clientId, queue_id: queueId, sdp: offer.sdp,
      });
      this.sessionId = r.session_id;
      await pc.setRemoteDescription({ type: 'answer', sdp: r.sdp });
    } catch (e) {
      this.h.onError((e as Error).message);
      this.h.onState('failed');
      await this.teardown();
    }
  }

  private async onEvent(raw: string) {
    let ev: any;
    try { ev = JSON.parse(raw); } catch { return; }
    if (ev.type === 'response.output_audio_transcript.done' && ev.transcript) {
      this.h.onTranscript('AI Caller', ev.transcript);
      this.post('transcript.agent', { text: ev.transcript });
    } else if (ev.type === 'conversation.item.input_audio_transcription.completed' && ev.transcript) {
      this.h.onTranscript('Prospect', ev.transcript);
      this.post('transcript.user', { text: ev.transcript });
    } else if (ev.type === 'input_audio_buffer.speech_started') {
      // Natural interruption: stop the agent's current audio.
      this.dc?.send(JSON.stringify({ type: 'response.cancel' }));
    } else if (ev.type === 'response.function_call_arguments.done') {
      if (this.handled.has(ev.call_id)) return;
      this.handled.add(ev.call_id);
      this.h.onTool(ev.name, 'running');
      try {
        const r = await setterInvoke<{ result: any; task_revision: number }>('ai-setter-realtime-session', {
          action: 'tool', client_id: this.clientId, session_id: this.sessionId,
          tool_call_id: ev.call_id, name: ev.name, arguments: ev.arguments,
        });
        this.h.onTool(ev.name, r.result?.status || 'done', r.task_revision);
        this.dc?.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(r.result) } }));
        this.dc?.send(JSON.stringify({ type: 'response.create' }));
        if (r.result?.hangup) setTimeout(() => this.end('agent_end_call'), 4000);
      } catch (e) {
        this.h.onTool(ev.name, 'error');
        this.h.onError((e as Error).message);
      }
    } else if (ev.type === 'error') {
      this.h.onError(ev.error?.message || 'Realtime error');
    }
  }

  private post(event_type: string, payload: Record<string, unknown>) {
    if (!this.sessionId) return;
    setterInvoke('ai-setter-realtime-session', { action: 'event', client_id: this.clientId, session_id: this.sessionId, event_type, payload }).catch(() => {});
  }

  private async teardown() {
    this.stream?.getTracks().forEach((t) => t.stop());
    try { this.dc?.close(); } catch { /* noop */ }
    try { this.pc?.close(); } catch { /* noop */ }
    if (this.audio) this.audio.srcObject = null;
    this.stream = null; this.dc = null; this.pc = null;
  }

  async end(reason = 'operator') {
    if (this.closed) return;
    this.closed = true;
    this.h.onState('closing');
    await this.teardown();
    if (this.sessionId) {
      await setterInvoke('ai-setter-realtime-session', { action: 'end', client_id: this.clientId, session_id: this.sessionId, reason }).catch(() => {});
    }
    this.h.onState('closed');
  }

  get tracksLive() {
    return !!this.stream?.getTracks().some((t) => t.readyState === 'live');
  }
}
