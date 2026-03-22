import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from './useWebSocket';
import { uploadVideo, getJobState, executeItem as execItem, sendReply as replyApi } from '../utils/api';

// Priority-based aggregation mirroring backend store.py logic.
// For each agent, we track state per item_id and expose the highest-priority
// (most active) state. This prevents multi-item clobbering: if item-1 completes
// but item-2 is still thinking, the agent shows "thinking".
const STATUS_PRIORITY = { thinking: 3, error: 2, done: 1 };

function aggregateAgents(raw) {
  const result = {};
  for (const [agentName, itemMap] of Object.entries(raw)) {
    let best = null, bestP = -1;
    for (const state of Object.values(itemMap)) {
      const p = STATUS_PRIORITY[state.status] ?? 0;
      if (p > bestP) { best = state; bestP = p; }
    }
    if (best) result[agentName] = best;
  }
  return result;
}

export function useJob(jobId) {
  const [job, setJob] = useState(null);
  const [items, setItems] = useState([]);
  const [bids, setBids] = useState({});
  const [decisions, setDecisions] = useState({});
  const [listings, setListings] = useState({});
  const [threads, setThreads] = useState([]);
  // Internal: per-item agent states: { agentName: { itemId: state } }
  const [agentsRaw, setAgentsRaw] = useState({});
  // Exposed: aggregated agent states (highest priority per agent)
  const agents = useMemo(() => aggregateAgents(agentsRaw), [agentsRaw]);

  const { connected, events, lastEvent, subscribe } = useWebSocket(jobId);
  const initialized = useRef(false);

  useEffect(() => {
    if (!jobId) return;
    if (initialized.current) return;
    initialized.current = true;

    getJobState(jobId)
      .then((state) => {
        if (state.job) setJob(state.job);
        if (state.items) setItems(state.items);
        if (state.bids) setBids(state.bids || {});
        if (state.decisions) setDecisions(state.decisions || {});
        if (state.listings) setListings(state.listings || {});
        if (state.threads) {
          const flat = Object.values(state.threads || {}).flat();
          setThreads(flat);
        }
        if (state.agent_states) {
          // Backend returns aggregated states; convert to per-item raw format
          const raw = {};
          for (const [agent, st] of Object.entries(state.agent_states)) {
            raw[agent] = { [st.item_id || '_global']: st };
          }
          setAgentsRaw(raw);
        }
      })
      .catch(() => {});
  }, [jobId]);

  useEffect(() => {
    return subscribe((event) => {
      const { type, data } = event;
      if (!type || !data) return;

      switch (type) {
        case 'initial_state':
          if (data.job) setJob(data.job);
          if (data.items) setItems(data.items);
          if (data.bids) setBids(data.bids || {});
          if (data.decisions) setDecisions(data.decisions || {});
          if (data.listings) setListings(data.listings || {});
          if (data.threads) {
            const flat = Object.values(data.threads || {}).flat();
            setThreads(flat);
          }
          if (data.agent_states) setAgents(data.agent_states);
          break;

        case 'job_created':
        case 'job_updated':
          setJob((prev) => ({ ...prev, ...data }));
          break;

        case 'item_added':
          setItems((prev) => {
            const idx = prev.findIndex((i) => i.item_id === data.item_id);
            return idx >= 0
              ? prev.map((i, j) => (j === idx ? { ...i, ...data } : i))
              : [...prev, data];
          });
          break;

        case 'bid_added':
          setBids((prev) => {
            const itemBids = prev[data.item_id] || [];
            return { ...prev, [data.item_id]: [...itemBids, data] };
          });
          break;

        case 'decision_made':
          setDecisions((prev) => ({ ...prev, [data.item_id]: data }));
          break;

        case 'listing_updated':
          setListings((prev) => ({ ...prev, [data.item_id]: data }));
          break;

        case 'thread_updated':
          setThreads((prev) => {
            const idx = prev.findIndex((t) => t.thread_id === data.thread_id);
            return idx >= 0
              ? prev.map((t, j) => (j === idx ? { ...t, ...data } : t))
              : [...prev, data];
          });
          break;

        case 'agent_started':
          setAgentsRaw((prev) => {
            const itemId = data.item_id || '_global';
            const agentMap = { ...prev[data.agent], [itemId]: { status: 'thinking', message: data.message, progress: 0, item_id: data.item_id } };
            return { ...prev, [data.agent]: agentMap };
          });
          break;
        case 'agent_progress':
          setAgentsRaw((prev) => {
            const itemId = data.item_id || '_global';
            const existing = prev[data.agent]?.[itemId] || {};
            const agentMap = { ...prev[data.agent], [itemId]: { ...existing, message: data.message, confidence: data.confidence, progress: data.progress } };
            return { ...prev, [data.agent]: agentMap };
          });
          break;
        case 'agent_completed':
          setAgentsRaw((prev) => {
            const itemId = data.item_id || '_global';
            const agentMap = { ...prev[data.agent], [itemId]: { status: 'done', message: data.message, elapsed_ms: data.elapsed_ms, confidence: data.confidence, item_id: data.item_id } };
            return { ...prev, [data.agent]: agentMap };
          });
          break;
        case 'agent_error':
          setAgentsRaw((prev) => {
            const itemId = data.item_id || '_global';
            const agentMap = { ...prev[data.agent], [itemId]: { status: 'error', message: data.error || data.message, elapsed_ms: data.elapsed_ms, item_id: data.item_id } };
            return { ...prev, [data.agent]: agentMap };
          });
          break;
      }
    });
  }, [subscribe]);

  useEffect(() => {
    if (jobId) {
      initialized.current = false;
    }
  }, [jobId]);

  const uploadAndStart = useCallback(async (file) => {
    try {
      const result = await uploadVideo(file);
      if (result?.job_id) {
        setJob({ job_id: result.job_id, status: result.status });
        return result.job_id;
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
    return null;
  }, []);

  const executeItem = useCallback(async (itemId, platforms) => {
    if (!jobId) return;
    return execItem(jobId, itemId, platforms);
  }, [jobId]);

  const sendReply = useCallback(async (threadId, text) => {
    if (!jobId) return;
    return replyApi(jobId, threadId, text);
  }, [jobId]);

  return {
    job,
    items,
    bids,
    decisions,
    listings,
    threads,
    agents,
    connected,
    events,
    lastEvent,
    uploadAndStart,
    executeItem,
    sendReply,
  };
}
