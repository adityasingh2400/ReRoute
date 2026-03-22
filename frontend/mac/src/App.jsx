import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Monitor, Wifi, WifiOff, Activity } from 'lucide-react';
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
    agents,
    agentsRaw,
    connected,
    events,
    lastEvent,
    uploadAndStart,
    executeItem,
    sendReply,
  } = useJob(jobId);

  const agentSummary = useMemo(() => {
    const entries = Object.values(agents);
    // Handle both normalized (thinking/done) and raw backend (agent_started/agent_completed) statuses
    const active = entries.filter((a) => ['thinking', 'agent_started', 'agent_progress'].includes(a.status)).length;
    const done = entries.filter((a) => ['done', 'agent_completed'].includes(a.status)).length;
    const total = entries.length;
    return { active, done, total };
  }, [agents]);

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
          {agentSummary.total > 0 && (
            <div className="topbar-agents">
              <Activity size={14} className={agentSummary.active > 0 ? 'agent-active-icon' : ''} />
              <span>
                {agentSummary.active > 0
                  ? `${agentSummary.active} agent${agentSummary.active !== 1 ? 's' : ''} working`
                  : `${agentSummary.done}/${agentSummary.total} complete`}
              </span>
            </div>
          )}
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
          agents={agents}
          agentsRaw={agentsRaw}
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
