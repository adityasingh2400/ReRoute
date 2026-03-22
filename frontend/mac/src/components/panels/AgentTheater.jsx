import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, BarChart3, MessageSquare, Wrench, Layers,
  Trophy, Image, Rocket, Inbox, Flag,
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

const MODULES = [
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

export default function AgentTheater({
  job,
  items,
  bids,
  decisions,
  listings,
  threads,
  events,
  lastEvent,
  onExecuteItem,
  onSendReply,
}) {
  const [activeTab, setActiveTab] = useState('condition');

  const activeModules = useMemo(() => {
    const active = new Set(['condition']);
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
    const props = { job, items, bids, decisions, listings, threads, events };
    switch (activeTab) {
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
      <div className="theater-tabs">
        {MODULES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`theater-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={14} />
            {label}
            {activeModules.has(id) && activeTab !== id && (
              <span className="tab-dot" />
            )}
          </button>
        ))}
      </div>

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
