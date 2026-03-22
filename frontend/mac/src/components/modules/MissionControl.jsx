import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Eye, Search, RefreshCw, Package, Wrench, Layers,
  Trophy, MessageSquare, Loader2, ChevronLeft, ChevronRight,
  DollarSign, ArrowRight, CheckCircle2, XCircle,
} from 'lucide-react';
import Badge from '../shared/Badge';

/* ────────────────────────────────────────────────────────────────
   Agent Pipeline — organized by stage for slideshow progression
   ──────────────────────────────────────────────────────────────── */
const STAGES = [
  {
    id: 1, label: 'Extraction', desc: 'Pulling frames & transcript from video',
    agents: [{ id: 'intake', name: 'Intake', icon: Cpu, desc: 'Extract video frames & transcript' }],
  },
  {
    id: 2, label: 'Analysis', desc: 'AI grades every item\'s condition',
    agents: [{ id: 'condition_fusion', name: 'ConditionFusion', icon: Eye, desc: 'Grade item condition with AI' }],
  },
  {
    id: 3, label: 'Route Bidding', desc: '5 agents race to find the best route',
    agents: [
      { id: 'marketplace_resale', name: 'Resale', icon: Search, desc: 'Search eBay, Mercari, FB comps' },
      { id: 'trade_in', name: 'Trade-In', icon: RefreshCw, desc: 'Query trade-in providers' },
      { id: 'return', name: 'Return', icon: Package, desc: 'Check return eligibility' },
      { id: 'repair_roi', name: 'Repair', icon: Wrench, desc: 'Search parts & calculate ROI' },
      { id: 'bundle_opportunity', name: 'Bundle', icon: Layers, desc: 'Evaluate bundle premiums' },
    ],
  },
  {
    id: 4, label: 'Decision', desc: 'Scoring all bids and picking the winner',
    agents: [{ id: 'route_decider', name: 'RouteDecider', icon: Trophy, desc: 'Score bids & pick winner' }],
  },
];

const ROUTE_LABELS = {
  sell_as_is: 'Sell As-Is', trade_in: 'Trade-In',
  repair_then_sell: 'Repair & Sell', bundle_then_sell: 'Bundle',
  return: 'Return',
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

/* ── Determine which stage is currently active ──────────────────── */
function getActiveStageIndex(agents) {
  // Find the highest stage that has at least one agent thinking, or the last completed stage
  for (let i = STAGES.length - 1; i >= 0; i--) {
    const stage = STAGES[i];
    const hasThinking = stage.agents.some((a) => {
      const s = getStatus(agents[a.id]);
      return s === 'thinking';
    });
    if (hasThinking) return i;
  }
  // No thinking agents — find the last completed stage
  for (let i = STAGES.length - 1; i >= 0; i--) {
    const stage = STAGES[i];
    const hasDone = stage.agents.some((a) => getStatus(agents[a.id]) === 'done');
    if (hasDone) return i;
  }
  return 0; // Default to first stage
}

/* ── Status Badge ──────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const config = {
    idle: { label: 'Waiting', cls: 'mc-badge-idle' },
    thinking: { label: 'Working', cls: 'mc-badge-thinking' },
    done: { label: 'Done', cls: 'mc-badge-done' },
    error: { label: 'Error', cls: 'mc-badge-error' },
  };
  const c = config[status] || config.idle;
  return <span className={`mc-badge ${c.cls}`}>{c.label}</span>;
}

/* ── Rich Agent Card with inline findings ──────────────────────── */
function AgentCard({ agent, state, bids, items, decisions, index }) {
  const status = getStatus(state);
  const message = state?.message || agent.desc;
  const elapsed = state?.elapsed_ms;
  const confidence = state?.confidence;
  const progress = state?.progress;

  // Find relevant bid data for this agent
  const agentBids = useMemo(() => {
    if (!bids) return [];
    const routeMap = {
      marketplace_resale: 'sell_as_is',
      trade_in: 'trade_in',
      repair_roi: 'repair_then_sell',
      return: 'return',
      bundle_opportunity: 'bundle_then_sell',
    };
    const routeType = routeMap[agent.id];
    if (!routeType) return [];
    return Object.values(bids).flat().filter((b) => b.route_type === routeType);
  }, [bids, agent.id]);

  return (
    <motion.div
      className={`mc-card mc-card-${status}`}
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 200, damping: 22 }}
    >
      <div className="mc-card-header">
        <div className={`mc-card-icon mc-icon-${status}`}>
          <agent.icon size={18} />
        </div>
        <span className="mc-card-name">{agent.name}</span>
        <StatusBadge status={status} />
      </div>

      <div className="mc-card-body">
        <div className="mc-card-message">
          {status === 'thinking' && <Loader2 size={13} className="mc-spinner" />}
          {message}
        </div>

        {/* Rich findings for completed route agents */}
        {status === 'done' && agentBids.length > 0 && (
          <div className="mc-card-findings">
            {agentBids.map((bid, i) => (
              <div key={i} className="mc-finding-row">
                <span className="mc-finding-item">
                  {items?.find((it) => it.item_id === bid.item_id)?.name_guess?.split(' ').slice(0, 3).join(' ') || 'Item'}
                </span>
                <span className={`mc-finding-value ${bid.viable ? '' : 'not-viable'}`}>
                  {bid.viable ? (
                    <><DollarSign size={11} />{bid.estimated_value?.toFixed(0)}</>
                  ) : (
                    <><XCircle size={11} /> N/A</>
                  )}
                </span>
                {bid.confidence != null && bid.viable && (
                  <span className="mc-finding-conf">{(bid.confidence * 100).toFixed(0)}%</span>
                )}
              </div>
            ))}
            {/* Show comparable details for marketplace */}
            {agent.id === 'marketplace_resale' && agentBids[0]?.comparable_listings?.length > 0 && (
              <div className="mc-finding-detail">
                {agentBids[0].comparable_listings.slice(0, 3).map((comp, ci) => (
                  <span key={ci} className="mc-comp-chip">
                    <Badge platform={comp.platform || 'other'} />
                    ${comp.price?.toFixed(0)}
                  </span>
                ))}
                {agentBids[0].comparable_listings.length > 3 && (
                  <span className="mc-comp-more">+{agentBids[0].comparable_listings.length - 3} more</span>
                )}
              </div>
            )}
            {/* Show quotes for trade-in */}
            {agent.id === 'trade_in' && agentBids[0]?.trade_in_quotes?.length > 0 && (
              <div className="mc-finding-detail">
                {agentBids[0].trade_in_quotes.slice(0, 3).map((q, qi) => (
                  <span key={qi} className="mc-comp-chip">
                    {q.provider}: ${q.payout?.toFixed(0)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
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

/* ── Stage Progress Dots ─────────────────────────────────────── */
function StageDots({ stages, activeIndex, agents, onNavigate }) {
  return (
    <div className="mc-stage-dots">
      {stages.map((stage, i) => {
        const allDone = stage.agents.every((a) => getStatus(agents[a.id]) === 'done');
        const anyThinking = stage.agents.some((a) => getStatus(agents[a.id]) === 'thinking');
        const isActive = i === activeIndex;
        return (
          <button
            key={stage.id}
            className={`mc-dot ${isActive ? 'active' : ''} ${allDone ? 'done' : ''} ${anyThinking ? 'thinking' : ''}`}
            onClick={() => onNavigate(i)}
          >
            <span className="mc-dot-num">{stage.id}</span>
            <span className="mc-dot-label">{stage.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Main Mission Control ────────────────────────────────────── */
export default function MissionControl({ agents = {}, items = [], decisions = {}, bids = {} }) {
  const autoStageIdx = getActiveStageIndex(agents);
  const [manualIdx, setManualIdx] = useState(null);
  const activeIdx = manualIdx ?? autoStageIdx;

  // Auto-follow the pipeline unless user manually navigated
  useEffect(() => {
    if (manualIdx !== null && manualIdx !== autoStageIdx) {
      // User navigated manually — keep their choice for 5s then resume auto
      const timer = setTimeout(() => setManualIdx(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [autoStageIdx, manualIdx]);

  const currentStage = STAGES[activeIdx];

  return (
    <div className="mission-control-v2">
      {/* Stage navigation dots */}
      <StageDots
        stages={STAGES}
        activeIndex={activeIdx}
        agents={agents}
        onNavigate={setManualIdx}
      />

      {/* Current stage content — slides in/out */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStage.id}
          className="mc-stage-content"
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -60 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          <div className="mc-stage-header">
            <span className="mc-stage-number">Stage {currentStage.id}</span>
            <h3 className="mc-stage-title">{currentStage.label}</h3>
            <p className="mc-stage-desc">{currentStage.desc}</p>
          </div>

          <div className={`mc-agents-row mc-agents-${currentStage.agents.length}`}>
            {currentStage.agents.map((agent, i) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                state={agents[agent.id]}
                bids={bids}
                items={items}
                decisions={decisions}
                index={i}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
