import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu, Eye, Search, RefreshCw, Package, Wrench, Layers,
  Trophy, MessageSquare, Clock, AlertCircle, CheckCircle2,
  Loader2,
} from 'lucide-react';

const AGENTS = [
  { id: 'intake', name: 'Intake', icon: Cpu, stage: 1, desc: 'Extract video frames & transcript' },
  { id: 'condition_fusion', name: 'ConditionFusion', icon: Eye, stage: 2, desc: 'Grade item condition with AI' },
  { id: 'marketplace_resale', name: 'MarketplaceResale', icon: Search, stage: 3, desc: 'Search eBay, Mercari, FB comps' },
  { id: 'trade_in', name: 'TradeIn', icon: RefreshCw, stage: 3, desc: 'Query trade-in providers' },
  { id: 'return', name: 'Return', icon: Package, stage: 3, desc: 'Check return eligibility' },
  { id: 'repair_roi', name: 'RepairROI', icon: Wrench, stage: 3, desc: 'Search parts & calculate ROI' },
  { id: 'bundle_opportunity', name: 'BundleOpp', icon: Layers, stage: 3, desc: 'Evaluate bundle premiums' },
  { id: 'route_decider', name: 'RouteDecider', icon: Trophy, stage: 4, desc: 'Score bids & pick winner' },
  { id: 'concierge', name: 'Concierge', icon: MessageSquare, stage: 5, desc: 'Handle buyer conversations' },
];

const STAGE_LABELS = {
  1: 'Stage 1 — Extraction',
  2: 'Stage 2 — Analysis',
  3: 'Stage 3 — Route Bidding',
  4: 'Stage 4 — Decision',
  5: 'Stage 5 — Communication',
};

function getStatus(agentState) {
  if (!agentState) return 'idle';
  const s = agentState.status;
  if (s === 'agent_started' || s === 'thinking') return 'thinking';
  if (s === 'agent_completed' || s === 'done') return 'done';
  if (s === 'agent_error' || s === 'error') return 'error';
  if (s === 'agent_progress') return 'thinking';
  return 'idle';
}

function StatusBadge({ status }) {
  const config = {
    idle: { label: 'Idle', cls: 'mc-badge-idle' },
    thinking: { label: 'Thinking', cls: 'mc-badge-thinking' },
    done: { label: 'Done', cls: 'mc-badge-done' },
    error: { label: 'Error', cls: 'mc-badge-error' },
    waiting: { label: 'Waiting', cls: 'mc-badge-waiting' },
  };
  const c = config[status] || config.idle;
  return <span className={`mc-badge ${c.cls}`}>{c.label}</span>;
}

function AgentCard({ agent, state, index }) {
  const status = getStatus(state);
  const message = state?.message || agent.desc;
  const elapsed = state?.elapsed_ms;
  const confidence = state?.confidence;
  const progress = state?.progress;

  return (
    <motion.div
      className={`mc-card mc-card-${status}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 180, damping: 20 }}
    >
      <div className="mc-card-header">
        <div className="mc-card-icon">
          <agent.icon size={16} />
        </div>
        <span className="mc-card-name">{agent.name}</span>
        <StatusBadge status={status} />
      </div>

      <div className="mc-card-body">
        <div className="mc-card-message">
          {status === 'thinking' && <Loader2 size={12} className="mc-spinner" />}
          {message}
        </div>
      </div>

      {(status === 'thinking' || status === 'done') && (
        <div className="mc-card-progress-track">
          <motion.div
            className={`mc-card-progress-fill ${status === 'done' ? 'done' : ''}`}
            initial={{ width: '0%' }}
            animate={{ width: status === 'done' ? '100%' : `${(progress || 0.3) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}

      <div className="mc-card-footer">
        <span className="mc-card-timer">
          {elapsed ? `${(elapsed / 1000).toFixed(1)}s` : status === 'thinking' ? '...' : '—'}
        </span>
        {confidence != null && (
          <span className="mc-card-confidence">
            conf: {(confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default function MissionControl({ agents = {}, items = [], decisions = {} }) {
  const stages = useMemo(() => {
    const grouped = {};
    for (const agent of AGENTS) {
      if (!grouped[agent.stage]) grouped[agent.stage] = [];
      grouped[agent.stage].push(agent);
    }
    return grouped;
  }, []);

  let cardIndex = 0;

  return (
    <div className="mission-control">
      {Object.entries(stages).map(([stage, stageAgents]) => (
        <div key={stage} className="mc-stage">
          <div className="mc-stage-label">{STAGE_LABELS[stage]}</div>
          <div className={`mc-stage-grid mc-stage-${stage}`}>
            {stageAgents.map((agent) => {
              const idx = cardIndex++;
              return (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  state={agents[agent.id]}
                  index={idx}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
