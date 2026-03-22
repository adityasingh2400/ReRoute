import { useMemo } from 'react';
import {
  Cpu, Eye, Search, RefreshCw, Package, Wrench, Layers,
  Trophy, MessageSquare, ArrowRight,
} from 'lucide-react';
import MissionControl from '../modules/MissionControl';

/* ── Agent pipeline definition for the status bar ──────────────── */
const AGENT_PIPELINE = [
  { id: 'intake', label: 'Intake', icon: Cpu, stage: 1 },
  { id: 'condition_fusion', label: 'Fusion', icon: Eye, stage: 2 },
  { id: 'marketplace_resale', label: 'Resale', icon: Search, stage: 3 },
  { id: 'trade_in', label: 'Trade', icon: RefreshCw, stage: 3 },
  { id: 'return', label: 'Return', icon: Package, stage: 3 },
  { id: 'repair_roi', label: 'Repair', icon: Wrench, stage: 3 },
  { id: 'bundle_opportunity', label: 'Bundle', icon: Layers, stage: 3 },
  { id: 'route_decider', label: 'Decider', icon: Trophy, stage: 4 },
  { id: 'concierge', label: 'Concierge', icon: MessageSquare, stage: 5 },
];

function normalizeStatus(rawStatus) {
  if (!rawStatus) return 'idle';
  if (rawStatus === 'agent_started' || rawStatus === 'thinking') return 'thinking';
  if (rawStatus === 'agent_completed' || rawStatus === 'done') return 'done';
  if (rawStatus === 'agent_error' || rawStatus === 'error') return 'error';
  if (rawStatus === 'agent_progress') return 'thinking';
  return rawStatus;
}

export default function AgentTheater({
  job,
  items,
  bids,
  decisions,
  listings,
  threads,
  agents = {},
  agentsRaw = {},
  events,
  lastEvent,
  onExecuteItem,
  onSendReply,
}) {
  return (
    <>
      {/* ── Agent Status Bar ────────────────────────────────── */}
      <div className="agent-status-bar">
        <span className="asb-label">Agents</span>
        {AGENT_PIPELINE.map((agent, i) => {
          const state = agents[agent.id];
          const status = normalizeStatus(state?.status);
          const nextAgent = AGENT_PIPELINE[i + 1];
          const showArrow = nextAgent && agent.stage !== nextAgent.stage;

          return (
            <span key={agent.id} style={{ display: 'contents' }}>
              <span className={`asb-pip ${status}`} title={state?.message || agent.label}>
                <span className={`asb-dot ${status}`} />
                <span className="asb-name">{agent.label}</span>
              </span>
              {showArrow && (
                <ArrowRight size={12} className={`asb-arrow ${status === 'done' ? 'active' : ''}`} />
              )}
            </span>
          );
        })}
        <span className="asb-counter">
          {Object.values(agents).filter((a) => ['thinking', 'agent_started', 'agent_progress'].includes(a.status)).length}/
          {AGENT_PIPELINE.length}
        </span>
      </div>

      {/* ── Unified Mission Control — THE entire center panel ── */}
      <div className="theater-content">
        <MissionControl
          agents={agents}
          agentsRaw={agentsRaw}
          items={items}
          decisions={decisions}
          bids={bids}
          job={job}
          listings={listings}
          onExecuteItem={onExecuteItem}
        />
      </div>
    </>
  );
}
