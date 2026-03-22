import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, BarChart3, MessageSquare, Wrench, Layers,
  Trophy, Image, Rocket, Inbox, Flag, Activity,
  Cpu, Search, RefreshCw, Package, Zap, ArrowRight,
} from 'lucide-react';
import ConditionFusion from '../modules/ConditionFusion';
import MarketSweep from '../modules/MarketSweep';
import QuoteSweep from '../modules/QuoteSweep';
import RepairSweep from '../modules/RepairSweep';
import BundleMerge from '../modules/BundleMerge';
import BestRoute from '../modules/BestRoute';
import AssetStudio from '../modules/AssetStudio';
import MultiPostEngine from '../modules/MultiPostEngine';
import UnifiedInbox from '../modules/UnifiedInbox';
import RouteClose from '../modules/RouteClose';
import MissionControl from '../modules/MissionControl';

/* ── Agent pipeline definition ─────────────────────────────────────────── */
const AGENT_PIPELINE = [
  { id: 'intake', label: 'Intake', icon: Cpu, stage: 1, tab: 'condition' },
  { id: 'condition_fusion', label: 'Fusion', icon: Eye, stage: 2, tab: 'condition' },
  { id: 'marketplace_resale', label: 'Resale', icon: Search, stage: 3, tab: 'market' },
  { id: 'trade_in', label: 'Trade', icon: RefreshCw, stage: 3, tab: 'quotes' },
  { id: 'return', label: 'Return', icon: Package, stage: 3, tab: 'quotes' },
  { id: 'repair_roi', label: 'Repair', icon: Wrench, stage: 3, tab: 'repair' },
  { id: 'bundle_opportunity', label: 'Bundle', icon: Layers, stage: 3, tab: 'bundle' },
  { id: 'route_decider', label: 'Decider', icon: Trophy, stage: 4, tab: 'route' },
  { id: 'concierge', label: 'Concierge', icon: MessageSquare, stage: 5, tab: 'inbox' },
];

const MODULES = [
  { id: 'mission', label: 'Mission Control', icon: Activity },
  { id: 'condition', label: 'Condition', icon: Eye },
  { id: 'market', label: 'Market', icon: BarChart3 },
  { id: 'quotes', label: 'Quotes', icon: MessageSquare },
  { id: 'repair', label: 'Repair', icon: Wrench },
  { id: 'bundle', label: 'Bundle', icon: Layers },
  { id: 'route', label: 'Best Route', icon: Trophy },
  { id: 'assets', label: 'Assets', icon: Image },
  { id: 'launch', label: 'Launch', icon: Rocket },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'close', label: 'Close', icon: Flag },
];

/* ── Auto-tab story sequence ─────────────────────────────────────────── */
const AUTO_TAB_SEQUENCE = [
  { trigger: 'condition_fusion', tab: 'condition' },
  { trigger: 'marketplace_resale', tab: 'market' },
  { trigger: 'route_decider', tab: 'route' },
];
const AUTO_DWELL_MS = 3000;

export default function AgentTheater({
  job,
  items,
  bids,
  decisions,
  listings,
  threads,
  agents = {},
  events,
  lastEvent,
  onExecuteItem,
  onSendReply,
}) {
  const [activeTab, setActiveTab] = useState('mission');
  const [autoTabEnabled, setAutoTabEnabled] = useState(true);
  const lastAutoSwitch = useRef(0);
  const autoTabIdx = useRef(0);

  /* ── Auto-tab switching on agent completion ───────────────── */
  useEffect(() => {
    if (!autoTabEnabled) return;
    const seq = AUTO_TAB_SEQUENCE[autoTabIdx.current];
    if (!seq) return;

    const agentState = agents[seq.trigger];
    if (agentState?.status === 'done' || agentState?.status === 'agent_completed') {
      const now = Date.now();
      const elapsed = now - lastAutoSwitch.current;
      const delay = Math.max(0, AUTO_DWELL_MS - elapsed);
      const timer = setTimeout(() => {
        setActiveTab(seq.tab);
        lastAutoSwitch.current = Date.now();
        autoTabIdx.current += 1;
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [agents, autoTabEnabled]);

  // Reset auto-tab sequence when agents reset (new job)
  useEffect(() => {
    if (Object.keys(agents).length === 0) {
      autoTabIdx.current = 0;
      lastAutoSwitch.current = 0;
      setAutoTabEnabled(true);
    }
  }, [agents]);

  // Manual tab click disables auto-switching
  const handleTabClick = useCallback((tabId) => {
    setAutoTabEnabled(false);
    setActiveTab(tabId);
  }, []);

  const activeModules = useMemo(() => {
    const active = new Set(['mission', 'condition']);
    if (items.length > 0) {
      active.add('market');
      active.add('quotes');
      active.add('repair');
    }
    if (items.length > 1) active.add('bundle');
    if (Object.keys(decisions).length > 0) {
      active.add('route');
      active.add('assets');
      active.add('launch');
    }
    if (threads.length > 0) active.add('inbox');
    const hasArchived = Object.values(listings).some((l) =>
      l.platform_listings?.some((pl) => pl.status === 'archived')
    );
    if (hasArchived) active.add('close');
    return active;
  }, [items, decisions, listings, threads]);

  function renderModule() {
    const props = { job, items, bids, decisions, listings, threads, events, agents };
    switch (activeTab) {
      case 'mission': return <MissionControl agents={agents} items={items} decisions={decisions} />;
      case 'condition': return <ConditionFusion {...props} />;
      case 'market': return <MarketSweep {...props} />;
      case 'quotes': return <QuoteSweep {...props} />;
      case 'repair': return <RepairSweep {...props} />;
      case 'bundle': return <BundleMerge {...props} />;
      case 'route': return <BestRoute {...props} />;
      case 'assets': return <AssetStudio {...props} />;
      case 'launch': return <MultiPostEngine {...props} onExecuteItem={onExecuteItem} />;
      case 'inbox': return <UnifiedInbox {...props} onSendReply={onSendReply} />;
      case 'close': return <RouteClose {...props} />;
      default: return null;
    }
  }

  return (
    <>
      {/* ── Agent Status Bar ────────────────────────────────── */}
      <div className="agent-status-bar">
        <span className="asb-label">Agents</span>
        {AGENT_PIPELINE.map((agent, i) => {
          const state = agents[agent.id];
          // Status is already normalized by useJob hook (thinking/done/error)
          // but may be raw backend values from initial_state restoration
          const rawStatus = state?.status || 'idle';
          const status = rawStatus === 'agent_started' ? 'thinking'
            : rawStatus === 'agent_completed' ? 'done'
            : rawStatus === 'agent_error' ? 'error'
            : rawStatus;
          const isStage3 = agent.stage === 3;
          const nextAgent = AGENT_PIPELINE[i + 1];
          const showArrow = nextAgent && agent.stage !== nextAgent.stage;
          const isFirstInStage3 = isStage3 && (i === 0 || AGENT_PIPELINE[i - 1].stage !== 3);
          const isLastInStage3 = isStage3 && (!nextAgent || nextAgent.stage !== 3);

          return (
            <span key={agent.id} style={{ display: 'contents' }}>
              {isFirstInStage3 && <span className="asb-group-start" />}
              <button
                className={`asb-pip ${status}`}
                onClick={() => handleTabClick(agent.tab)}
                title={state?.message || agent.label}
              >
                <span className={`asb-dot ${status}`} />
                <span className="asb-name">{agent.label}</span>
              </button>
              {isLastInStage3 && <span className="asb-group-end" />}
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

      {/* ── Tab Bar ─────────────────────────────────────────── */}
      <div className="theater-tabs">
        {MODULES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`theater-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => handleTabClick(id)}
          >
            <Icon size={14} />
            {label}
            {activeModules.has(id) && activeTab !== id && (
              <span className="tab-dot" />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="theater-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {renderModule()}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
