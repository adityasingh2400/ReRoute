import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { uploadVideo, getJobState, executeItem as execItem, sendReply as replyApi } from '../utils/api';

export function useJob(jobId) {
  const [job, setJob] = useState(null);
  const [items, setItems] = useState([]);
  const [bids, setBids] = useState({});
  const [decisions, setDecisions] = useState({});
  const [listings, setListings] = useState({});
  const [threads, setThreads] = useState([]);

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
    connected,
    events,
    lastEvent,
    uploadAndStart,
    executeItem,
    sendReply,
  };
}
