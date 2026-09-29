package main

// Voice sideband module for the AI Outbound Setter.
//
// The edge function creates the outbound GPT-Live SIP session, then calls
// POST /voice/attach here. This long-lived process attaches to
// wss://api.openai.com/v1/live/sessions/{id}/attach, forwards transcripts and
// lifecycle events to ai-setter-tools, executes delegated function calls through
// that trusted executor, and keeps the socket open until session.closed.
// If the socket drops first, finalization is reported as incomplete.

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type voiceState struct {
	mu       sync.Mutex
	sessions map[string]bool
	seen     map[string]map[string]bool // openai session id -> handled call ids / event ids
}

var voice = voiceState{sessions: map[string]bool{}, seen: map[string]map[string]bool{}}

func voiceEnabled() bool {
	return os.Getenv("OPENAI_API_KEY") != "" && os.Getenv("AI_SETTER_BRIDGE_SECRET") != "" && os.Getenv("AI_SETTER_TOOLS_URL") != ""
}

func voiceAuth(r *http.Request) bool {
	want := os.Getenv("AI_SETTER_BRIDGE_SECRET")
	got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	return want != "" && subtle.ConstantTimeCompare([]byte(want), []byte(got)) == 1
}

func voiceHealthHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]any{"ok": true})
}

func voiceReadyHandler(w http.ResponseWriter, _ *http.Request) {
	voice.mu.Lock()
	n := len(voice.sessions)
	voice.mu.Unlock()
	status := 200
	if !voiceEnabled() {
		status = 503
	}
	writeJSON(w, status, map[string]any{
		"ready":           voiceEnabled(),
		"openai_key":      os.Getenv("OPENAI_API_KEY") != "",
		"bridge_secret":   os.Getenv("AI_SETTER_BRIDGE_SECRET") != "",
		"tools_url":       os.Getenv("AI_SETTER_TOOLS_URL") != "",
		"active_sessions": n,
	})
}

func voiceAttachHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	if !voiceAuth(r) {
		writeJSON(w, 401, map[string]any{"error": "unauthorized"})
		return
	}
	if !voiceEnabled() {
		writeJSON(w, 503, map[string]any{"error": "voice_not_configured"})
		return
	}
	var body struct {
		OpenAISessionID string `json:"openai_session_id"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&body); err != nil || body.OpenAISessionID == "" {
		writeJSON(w, 400, map[string]any{"error": "openai_session_id required"})
		return
	}
	voice.mu.Lock()
	if voice.sessions[body.OpenAISessionID] {
		voice.mu.Unlock()
		writeJSON(w, 200, map[string]any{"ok": true, "already_attached": true})
		return
	}
	voice.sessions[body.OpenAISessionID] = true
	voice.seen[body.OpenAISessionID] = map[string]bool{}
	voice.mu.Unlock()
	go runSideband(body.OpenAISessionID)
	writeJSON(w, 202, map[string]any{"ok": true})
}

func postTools(payload map[string]any) (map[string]any, error) {
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", os.Getenv("AI_SETTER_TOOLS_URL"), bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+os.Getenv("AI_SETTER_BRIDGE_SECRET"))
	c := &http.Client{Timeout: 20 * time.Second}
	res, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return out, nil
}

func markSeen(sid, key string) bool {
	voice.mu.Lock()
	defer voice.mu.Unlock()
	if voice.seen[sid][key] {
		return false
	}
	voice.seen[sid][key] = true
	return true
}

func runSideband(sid string) {
	finalization := "incomplete"
	var usage any
	defer func() {
		_, _ = postTools(map[string]any{"action": "closed", "openai_session_id": sid, "finalization": finalization, "usage": usage})
		voice.mu.Lock()
		delete(voice.sessions, sid)
		delete(voice.seen, sid)
		voice.mu.Unlock()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour+5*time.Minute)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "wss://api.openai.com/v1/live/sessions/"+sid+"/attach", &websocket.DialOptions{
		HTTPHeader: http.Header{"Authorization": []string{"Bearer " + os.Getenv("OPENAI_API_KEY")}},
	})
	if err != nil {
		log.Printf("[voice] attach failed for session: %v", err)
		return
	}
	conn.SetReadLimit(4 << 20)
	defer conn.Close(websocket.StatusNormalClosure, "done")

	send := func(v any) {
		b, _ := json.Marshal(v)
		_ = conn.Write(ctx, websocket.MessageText, b)
	}

	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return // dropped before session.closed → incomplete
		}
		var ev map[string]any
		if json.Unmarshal(data, &ev) != nil {
			continue
		}
		typ, _ := ev["type"].(string)
		if id, ok := ev["event_id"].(string); ok && id != "" && !markSeen(sid, "ev:"+id) {
			continue // replayed event
		}
		switch {
		case typ == "session.closed":
			finalization = "complete"
			usage = ev["usage"]
			return
		case typ == "transport.failed":
			_, _ = postTools(map[string]any{"action": "event", "openai_session_id": sid, "event_type": "transport.failed"})
		case strings.HasSuffix(typ, "transcript.done") || strings.HasSuffix(typ, "transcription.completed"):
			who := "transcript.agent"
			if strings.Contains(typ, "input") {
				who = "transcript.user"
			}
			text, _ := ev["transcript"].(string)
			_, _ = postTools(map[string]any{"action": "event", "openai_session_id": sid, "event_type": who, "text": text, "event_id": ev["event_id"]})
		case typ == "response.event":
			inner, _ := ev["event"].(map[string]any)
			if inner == nil || inner["type"] != "response.output_item.done" {
				continue
			}
			item, _ := inner["item"].(map[string]any)
			if item == nil || item["type"] != "function_call" {
				continue
			}
			callID, _ := item["call_id"].(string)
			if callID == "" || !markSeen(sid, "call:"+callID) {
				continue // one handler per tool call
			}
			out, err := postTools(map[string]any{
				"action": "tool", "openai_session_id": sid, "call_id": callID,
				"name": item["name"], "arguments": item["arguments"],
			})
			result := map[string]any{"status": "error", "error": "executor_unreachable"}
			if err == nil && out != nil && out["result"] != nil {
				result, _ = out["result"].(map[string]any)
			}
			rb, _ := json.Marshal(result)
			send(map[string]any{"type": "response.item.create", "event_id": "out_" + callID,
				"item": map[string]any{"type": "function_call_output", "call_id": callID, "output": string(rb)}})
			send(map[string]any{"type": "response.create", "event_id": "cont_" + callID})
			if result["hangup"] == true {
				go func() {
					time.Sleep(4 * time.Second)
					req, _ := http.NewRequest("POST", "https://api.openai.com/v1/live/sessions/"+sid+"/hangup", nil)
					req.Header.Set("Authorization", "Bearer "+os.Getenv("OPENAI_API_KEY"))
					if res, err := http.DefaultClient.Do(req); err == nil {
						res.Body.Close()
					}
				}()
			}
		}
	}
}
