import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Monitor, Wifi, WifiOff } from 'lucide-react';
import Layout from './components/Layout';
import { useJob } from './hooks/useJob';

export default function App() {
  const [presentationMode, setPresentationMode] = useState(false);
  const [jobId, setJobId] = useState(null);

  const {
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
  } = useJob(jobId);

  const handleUpload = useCallback(async (file) => {
    const id = await uploadAndStart(file);
    if (id) setJobId(id);
  }, [uploadAndStart]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-logo">R</div>
          <span className="topbar-title">ReRoute</span>
          <span className="topbar-subtitle">Command Center</span>
        </div>
        <div className="topbar-controls">
          <div className="topbar-status">
            <span className={`status-dot ${connected ? '' : 'disconnected'}`} />
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{connected ? 'Live' : 'Offline'}</span>
          </div>
          <button
            className={`presentation-toggle ${presentationMode ? 'active' : ''}`}
            onClick={() => setPresentationMode(!presentationMode)}
          >
            <Monitor size={14} />
            Presentation
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <Layout
          presentationMode={presentationMode}
          job={job}
          items={items}
          bids={bids}
          decisions={decisions}
          listings={listings}
          threads={threads}
          events={events}
          lastEvent={lastEvent}
          onUpload={handleUpload}
          onExecuteItem={executeItem}
          onSendReply={sendReply}
        />
      </AnimatePresence>
    </div>
  );
}
