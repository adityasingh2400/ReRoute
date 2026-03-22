import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Eye, Search, RefreshCw, Package, Wrench, Layers,
  Trophy, MessageSquare, Loader2, DollarSign, XCircle,
  CheckCircle2, FileText, AlertTriangle, Image, Zap,
  ShoppingBag, RotateCcw, Clock,
} from 'lucide-react';
import Badge from '../shared/Badge';
import AnimatedValue from '../shared/AnimatedValue';

/* ────────────────────────────────────────────────────────────────
   Stages + Agents
   ──────────────────────────────────────────────────────────────── */
const STAGES = [
  { id: 1, label: 'Extraction', desc: 'Pulling frames & transcript from video',
    agents: [{ id: 'intake', name: 'Intake', icon: Cpu }] },
  { id: 2, label: 'Analysis', desc: 'AI grades every item\'s condition',
    agents: [{ id: 'condition_fusion', name: 'ConditionFusion', icon: Eye }] },
  { id: 3, label: 'Route Bidding', desc: '5 agents racing to find the best route',
    agents: [
      { id: 'marketplace_resale', name: 'Resale', icon: Search },
      { id: 'trade_in', name: 'Trade-In', icon: RefreshCw },
      { id: 'return', name: 'Return', icon: Package },
      { id: 'repair_roi', name: 'Repair', icon: Wrench },
      { id: 'bundle_opportunity', name: 'Bundle', icon: Layers },
    ] },
  { id: 4, label: 'Decision', desc: 'Picking the winning route for each item',
    agents: [{ id: 'route_decider', name: 'RouteDecider', icon: Trophy }] },
];

const ROUTE_LABELS = {
  sell_as_is: 'Sell As-Is', trade_in: 'Trade-In', repair_then_sell: 'Repair & Sell',
  bundle_then_sell: 'Bundle', return: 'Return', no_action: 'No Action',
};
const ROUTE_ICONS = {
  sell_as_is: ShoppingBag, trade_in: RefreshCw, repair_then_sell: Wrench,
  bundle_then_sell: Layers, return: RotateCcw, no_action: XCircle,
};

function getStatus(s) {
  if (!s) return 'idle';
  const v = s.status;
  if (v === 'agent_started' || v === 'thinking' || v === 'agent_progress') return 'thinking';
  if (v === 'agent_completed' || v === 'done') return 'done';
  if (v === 'agent_error' || v === 'error') return 'error';
  return 'idle';
}

function getActiveStageIndex(agents) {
  for (let i = STAGES.length - 1; i >= 0; i--)
    if (STAGES[i].agents.some((a) => getStatus(agents[a.id]) === 'thinking')) return i;
  for (let i = STAGES.length - 1; i >= 0; i--)
    if (STAGES[i].agents.some((a) => getStatus(agents[a.id]) === 'done')) return i;
  return 0;
}

/* ── Small Reusable Bits ──────────────────────────────────────── */
function StatusBadge({ status }) {
  const m = { idle: ['Waiting','mc-badge-idle'], thinking: ['Working','mc-badge-thinking'], done: ['Done','mc-badge-done'], error: ['Error','mc-badge-error'] };
  const [l, c] = m[status] || m.idle;
  return <span className={`mc-badge ${c}`}>{l}</span>;
}

function ProgressBar({ status, progress, doneCount, totalCount }) {
  const pct = status === 'done' ? 100
    : totalCount > 0 ? (doneCount / totalCount) * 100
    : (progress || 0.3) * 100;
  return (
    <div className="mc-card-progress-track">
      <motion.div className={`mc-card-progress-fill ${status === 'done' ? 'done' : ''}`}
        initial={{ width: '0%' }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
    </div>
  );
}

/* ── Agent Card — compact header with live message ────────────── */
function AgentCard({ agent, state, perItem, items, index, children }) {
  const status = getStatus(state);
  const message = state?.message || '';
  const elapsed = state?.elapsed_ms;
  const itemEntries = Object.entries(perItem || {}).filter(([k]) => k !== '_global');
  const doneCount = itemEntries.filter(([, s]) => getStatus(s) === 'done').length;
  const totalCount = Math.max(itemEntries.length, items?.length || 0);

  return (
    <motion.div className={`mc-card mc-card-${status}`}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 220, damping: 22 }}>
      <div className="mc-card-header">
        <div className={`mc-card-icon mc-icon-${status}`}><agent.icon size={16} /></div>
        <span className="mc-card-name">{agent.name}</span>
        {totalCount > 1 && status !== 'idle' && (
          <span className="mc-card-item-count">{doneCount}/{totalCount}</span>
        )}
        <StatusBadge status={status} />
        {elapsed && <span className="mc-card-timer">{(elapsed/1000).toFixed(1)}s</span>}
      </div>
      <div className="mc-card-message">
        {status === 'thinking' && <Loader2 size={12} className="mc-spinner" />}
        {message}
      </div>
      {(status === 'thinking' || status === 'done') && (
        <ProgressBar status={status} progress={state?.progress} doneCount={doneCount} totalCount={totalCount} />
      )}
      {/* Per-item breakdown for multi-item */}
      {items && items.length > 1 && itemEntries.length > 0 && (
        <div className="mc-item-list">
          {items.map((item) => {
            const is = perItem?.[item.item_id];
            if (!is) return null;
            const st = getStatus(is);
            return (
              <div key={item.item_id} className={`mc-item-row mc-item-${st}`}>
                <span className={`mc-item-dot ${st}`} />
                <span className="mc-item-name">{item.name_guess?.split(' ').slice(0, 3).join(' ')}</span>
                {st === 'done' && is.message && <span className="mc-item-msg">{is.message.slice(0, 60)}</span>}
                {st === 'thinking' && <Loader2 size={9} className="mc-spinner" />}
              </div>
            );
          })}
        </div>
      )}
      {/* Rich embedded content from parent */}
      {children}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STAGE-SPECIFIC EMBEDDED CONTENT
   ════════════════════════════════════════════════════════════════ */

/* ── Stage 1: Extraction — show transcript + frame count ─────── */
function ExtractionContent({ job, agents }) {
  const state = agents.intake;
  const status = getStatus(state);
  const transcript = job?.transcript_text;
  const frameCount = state?.frame_count || job?.frame_paths?.length;

  return (
    <div className="mc-embedded">
      {frameCount > 0 && (
        <div className="mc-stat-row">
          <Image size={14} /> <span>{frameCount} frames extracted</span>
        </div>
      )}
      {transcript && status === 'done' && (
        <div className="mc-transcript">
          <div className="mc-transcript-header"><FileText size={13} /> Transcript</div>
          <p className="mc-transcript-text">{transcript}</p>
        </div>
      )}
    </div>
  );
}

/* ── Stage 2: Analysis — show items as they're graded ────────── */
function AnalysisContent({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mc-embedded">
      <div className="mc-items-grid">
        {items.map((item, i) => {
          const condition = item.visible_defects?.length || item.spoken_defects?.length
            ? (item.visible_defects?.some?.((d) => d.severity === 'major') ? 'Fair' : 'Good')
            : 'Like New';
          return (
            <motion.div key={item.item_id} className="mc-item-card"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}>
              {item.hero_frame_paths?.[0] && (
                <img src={item.hero_frame_paths[0]} alt={item.name_guess} className="mc-item-thumb" />
              )}
              <div className="mc-item-info">
                <div className="mc-item-title">{item.name_guess}</div>
                <div className="mc-item-tags">
                  <Badge variant={condition === 'Like New' ? 'success' : 'warning'}>{condition}</Badge>
                  <Badge variant="primary">{Math.round((item.confidence || 0) * 100)}%</Badge>
                </div>
                {item.visible_defects?.length > 0 && (
                  <div className="mc-item-defects">
                    <AlertTriangle size={10} /> {item.visible_defects.map((d) => d.description || d).join(', ')}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Stage 3: Route Bidding — show bid results per agent ─────── */
function BiddingCardContent({ agentId, bids, items }) {
  const routeMap = { marketplace_resale: 'sell_as_is', trade_in: 'trade_in', repair_roi: 'repair_then_sell', return: 'return', bundle_opportunity: 'bundle_then_sell' };
  const routeType = routeMap[agentId];
  if (!routeType || !bids) return null;

  const agentBids = Object.values(bids).flat().filter((b) => b.route_type === routeType && b.viable);
  if (agentBids.length === 0) return null;

  return (
    <div className="mc-bid-results">
      {agentBids.map((bid, i) => {
        const itemName = items?.find((it) => it.item_id === bid.item_id)?.name_guess || 'Item';
        return (
          <div key={i} className="mc-bid-row">
            <span className="mc-bid-item">{itemName.split(' ').slice(0, 3).join(' ')}</span>
            <span className="mc-bid-value"><DollarSign size={11} />{bid.estimated_value?.toFixed(0)}</span>
            {bid.confidence != null && <span className="mc-bid-conf">{(bid.confidence * 100).toFixed(0)}%</span>}
          </div>
        );
      })}
      {/* Comparables for marketplace */}
      {agentId === 'marketplace_resale' && agentBids[0]?.comparable_listings?.length > 0 && (
        <div className="mc-comps-row">
          {agentBids[0].comparable_listings.slice(0, 4).map((c, ci) => (
            <span key={ci} className="mc-comp-chip">
              <Badge platform={c.platform || 'other'} /> ${c.price?.toFixed(0)}
            </span>
          ))}
        </div>
      )}
      {/* Trade-in quotes */}
      {agentId === 'trade_in' && agentBids[0]?.trade_in_quotes?.length > 0 && (
        <div className="mc-comps-row">
          {agentBids[0].trade_in_quotes.slice(0, 3).map((q, qi) => (
            <span key={qi} className="mc-comp-chip">{q.provider}: ${q.payout?.toFixed(0)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Stage 4: Decision — show the winning routes ──────────────── */
function DecisionContent({ decisions, items, onExecuteItem }) {
  const decisionList = Object.values(decisions);
  if (decisionList.length === 0) return null;

  return (
    <div className="mc-embedded">
      <div className="mc-decisions-grid">
        {items.map((item) => {
          const d = decisions[item.item_id];
          if (!d) return null;
          const Icon = ROUTE_ICONS[d.best_route] || Trophy;
          return (
            <motion.div key={item.item_id} className="mc-decision-card"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
              <div className="mc-decision-header">
                <span className="mc-decision-item">{item.name_guess}</span>
                <Badge variant="success">{ROUTE_LABELS[d.best_route] || d.best_route}</Badge>
              </div>
              <div className="mc-decision-value">
                <Icon size={18} />
                <AnimatedValue value={d.estimated_best_value || 0} prefix="$" decimals={2} positive />
              </div>
              <div className="mc-decision-reason">{d.route_reason}</div>
              <button className="mc-decision-execute" onClick={() => onExecuteItem?.(item.item_id, ['ebay', 'mercari'])}>
                <Zap size={13} /> Execute Route
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN MISSION CONTROL
   ════════════════════════════════════════════════════════════════ */
export default function MissionControl({ agents = {}, agentsRaw = {}, items = [], decisions = {}, bids = {}, job = null, listings = {}, onExecuteItem }) {
  const autoIdx = getActiveStageIndex(agents);
  const [manualIdx, setManualIdx] = useState(null);
  const activeIdx = manualIdx ?? autoIdx;

  useEffect(() => {
    if (manualIdx !== null && manualIdx !== autoIdx) {
      const t = setTimeout(() => setManualIdx(null), 5000);
      return () => clearTimeout(t);
    }
  }, [autoIdx, manualIdx]);

  const stage = STAGES[activeIdx];

  return (
    <div className="mission-control-v2">
      {/* Stage dots */}
      <div className="mc-stage-dots">
        {STAGES.map((s, i) => {
          const allDone = s.agents.every((a) => getStatus(agents[a.id]) === 'done');
          const anyThinking = s.agents.some((a) => getStatus(agents[a.id]) === 'thinking');
          return (
            <button key={s.id} className={`mc-dot ${i === activeIdx ? 'active' : ''} ${allDone ? 'done' : ''} ${anyThinking ? 'thinking' : ''}`}
              onClick={() => setManualIdx(i)}>
              <span className="mc-dot-num">{s.id}</span>
              <span className="mc-dot-label">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Stage content */}
      <AnimatePresence mode="wait">
        <motion.div key={stage.id} className="mc-stage-content"
          initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.25 }}>

          <div className="mc-stage-header">
            <span className="mc-stage-number">Stage {stage.id}</span>
            <h3 className="mc-stage-title">{stage.label}</h3>
            <p className="mc-stage-desc">{stage.desc}</p>
          </div>

          {/* Agent cards */}
          <div className={`mc-agents-row mc-agents-${stage.agents.length}`}>
            {stage.agents.map((agent, i) => (
              <AgentCard key={agent.id} agent={agent} state={agents[agent.id]}
                perItem={agentsRaw[agent.id] || {}} items={items} index={i}>
                {/* Embedded rich content per agent in Stage 3 */}
                {stage.id === 3 && getStatus(agents[agent.id]) === 'done' && (
                  <BiddingCardContent agentId={agent.id} bids={bids} items={items} />
                )}
              </AgentCard>
            ))}
          </div>

          {/* Stage-specific embedded content */}
          {stage.id === 1 && <ExtractionContent job={job} agents={agents} />}
          {stage.id === 2 && <AnalysisContent items={items} />}
          {stage.id === 4 && <DecisionContent decisions={decisions} items={items} onExecuteItem={onExecuteItem} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
