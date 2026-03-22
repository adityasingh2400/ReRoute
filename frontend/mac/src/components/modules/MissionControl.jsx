import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Eye, Search, RefreshCw, Package, Wrench, Layers,
  Trophy, MessageSquare, Loader2, DollarSign, XCircle,
  CheckCircle2, FileText, AlertTriangle,
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
    id: 3, label: 'Route Bidding', desc: '5 agents race to find the best route for each item',
    agents: [
      { id: 'marketplace_resale', name: 'Resale', icon: Search, desc: 'Search marketplace comps' },
      { id: 'trade_in', name: 'Trade-In', icon: RefreshCw, desc: 'Query trade-in providers' },
      { id: 'return', name: 'Return', icon: Package, desc: 'Check return eligibility' },
      { id: 'repair_roi', name: 'Repair', icon: Wrench, desc: 'Search parts & ROI' },
      { id: 'bundle_opportunity', name: 'Bundle', icon: Layers, desc: 'Evaluate bundles' },
    ],
  },
  {
    id: 4, label: 'Decision', desc: 'Scoring all bids and picking the winner for each item',
    agents: [{ id: 'route_decider', name: 'RouteDecider', icon: Trophy, desc: 'Score bids & pick winner' }],
  },
];

function getStatus(agentState) {
  if (!agentState) return 'idle';
  const s = agentState.status;
  if (s === 'agent_started' || s === 'thinking') return 'thinking';
  if (s === 'agent_completed' || s === 'done') return 'done';
  if (s === 'agent_error' || s === 'error') return 'error';
  if (s === 'agent_progress') return 'thinking';
  return 'idle';
}

function getActiveStageIndex(agents) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (STAGES[i].agents.some((a) => getStatus(agents[a.id]) === 'thinking')) return i;
  }
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (STAGES[i].agents.some((a) => getStatus(agents[a.id]) === 'done')) return i;
  }
  return 0;
}

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

/* ── Per-Item Status Row inside an Agent Card ────────────────── */
function ItemStatusRow({ itemName, state }) {
  const status = getStatus(state);
  return (
    <div className={`mc-item-row mc-item-${status}`}>
      <span className={`mc-item-dot ${status}`} />
      <span className="mc-item-name">{itemName}</span>
      {state?.message && status === 'done' && (
        <span className="mc-item-msg">{state.message.slice(0, 50)}</span>
      )}
      {status === 'thinking' && <Loader2 size={10} className="mc-spinner" />}
    </div>
  );
}

/* ── Agent Card with per-item breakdown ──────────────────────── */
function AgentCard({ agent, agentState, perItemStates, items, bids, index }) {
  const status = getStatus(agentState);
  const message = agentState?.message || agent.desc;
  const elapsed = agentState?.elapsed_ms;
  const confidence = agentState?.confidence;

  // Count per-item status
  const itemEntries = Object.entries(perItemStates || {}).filter(([k]) => k !== '_global');
  const doneCount = itemEntries.filter(([, s]) => getStatus(s) === 'done').length;
  const totalCount = Math.max(itemEntries.length, items?.length || 0);

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
        {totalCount > 1 && status !== 'idle' && (
          <span className="mc-card-item-count">{doneCount}/{totalCount}</span>
        )}
        <StatusBadge status={status} />
      </div>

      <div className="mc-card-body">
        {/* Summary message */}
        <div className="mc-card-message">
          {status === 'thinking' && <Loader2 size={13} className="mc-spinner" />}
          {message}
        </div>

        {/* Per-item breakdown for multi-item jobs */}
        {items && items.length > 1 && itemEntries.length > 0 && (
          <div className="mc-item-list">
            {items.map((item) => {
              const itemState = perItemStates?.[item.item_id];
              if (!itemState) return null;
              return (
                <ItemStatusRow
                  key={item.item_id}
                  itemName={item.name_guess?.split(' ').slice(0, 3).join(' ')}
                  state={itemState}
                />
              );
            })}
          </div>
        )}
      </div>

      {(status === 'thinking' || status === 'done') && (
        <div className="mc-card-progress-track">
          <motion.div
            className={`mc-card-progress-fill ${status === 'done' ? 'done' : ''}`}
            initial={{ width: '0%' }}
            animate={{
              width: status === 'done' ? '100%'
                : totalCount > 0 ? `${(doneCount / totalCount) * 100}%`
                : '30%'
            }}
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

/* ── Transcript Display ──────────────────────────────────────── */
function TranscriptBox({ job }) {
  const transcript = job?.transcript_text;
  if (!transcript) return null;
  return (
    <div className="mc-transcript">
      <div className="mc-transcript-header">
        <FileText size={14} />
        <span>Extracted Transcript</span>
      </div>
      <p className="mc-transcript-text">{transcript}</p>
    </div>
  );
}

/* ── Main Mission Control ────────────────────────────────────── */
export default function MissionControl({ agents = {}, agentsRaw = {}, items = [], decisions = {}, bids = {}, job = null }) {
  const autoStageIdx = getActiveStageIndex(agents);
  const [manualIdx, setManualIdx] = useState(null);
  const activeIdx = manualIdx ?? autoStageIdx;

  useEffect(() => {
    if (manualIdx !== null && manualIdx !== autoStageIdx) {
      const timer = setTimeout(() => setManualIdx(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [autoStageIdx, manualIdx]);

  const currentStage = STAGES[activeIdx];

  return (
    <div className="mission-control-v2">
      <StageDots
        stages={STAGES}
        activeIndex={activeIdx}
        agents={agents}
        onNavigate={setManualIdx}
      />

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
                agentState={agents[agent.id]}
                perItemStates={agentsRaw[agent.id] || {}}
                items={items}
                bids={bids}
                index={i}
              />
            ))}
          </div>

          {/* Show transcript after extraction stage */}
          {currentStage.id <= 2 && <TranscriptBox job={job} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
