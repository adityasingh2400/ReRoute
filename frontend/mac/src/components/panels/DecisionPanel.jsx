import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, TrendingUp, ShoppingBag, RefreshCw, Package, Wrench, RotateCcw } from 'lucide-react';
import AnimatedValue from '../shared/AnimatedValue';
import Badge from '../shared/Badge';

const ROUTE_ICONS = {
  sell_as_is: ShoppingBag,
  trade_in: RefreshCw,
  repair_then_sell: Wrench,
  bundle_then_sell: Package,
  return: RotateCcw,
};

const ROUTE_LABELS = {
  sell_as_is: 'Sell As-Is',
  trade_in: 'Trade-In',
  repair_then_sell: 'Repair & Sell',
  bundle_then_sell: 'Bundle & Sell',
  return: 'Return',
};

export default function DecisionPanel({ items, decisions, onExecuteItem }) {
  const decisionList = useMemo(() => Object.values(decisions), [decisions]);

  const totalValue = useMemo(() => {
    return decisionList.reduce((sum, d) => sum + (d.estimated_best_value || 0), 0);
  }, [decisionList]);

  return (
    <>
      <div className="panel-header">Decisions</div>
      <div className="decision-panel">
        <div className="dp-total">
          <div className="dp-total-label">Total Recovered Value</div>
          <AnimatedValue
            value={totalValue}
            prefix="$"
            decimals={2}
            large
            positive
          />
        </div>

        <AnimatePresence>
          <div className="dp-items">
            {items.map((item, index) => {
              const decision = decisions[item.item_id];
              return (
                <motion.div
                  key={item.item_id}
                  className="dp-item-card"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="dp-item-header">
                    <span className="dp-item-name">{item.name_guess}</span>
                    {decision && (
                      <Badge variant="success">
                        {ROUTE_LABELS[decision.best_route] || decision.best_route}
                      </Badge>
                    )}
                  </div>

                  {decision?.alternatives && (
                    <div className="dp-route-ladder">
                      {[
                        decision.winning_bid,
                        ...decision.alternatives,
                      ].filter(Boolean).slice(0, 3).map((route, i) => {
                        const RouteIcon = ROUTE_ICONS[route.route_type] || TrendingUp;
                        return (
                          <div
                            key={route.route_type}
                            className={`dp-route ${i === 0 ? 'recommended' : ''}`}
                          >
                            <RouteIcon size={14} />
                            <span className="dp-route-name">
                              {ROUTE_LABELS[route.route_type] || route.route_type}
                            </span>
                            <span className="dp-route-value animated-value">
                              ${route.estimated_value?.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    className="dp-execute-btn"
                    disabled={!decision}
                    onClick={() =>
                      decision && onExecuteItem(item.item_id, ['ebay', 'mercari'])
                    }
                  >
                    <Zap size={14} />
                    Execute Route
                  </button>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>

        {items.length === 0 && (
          <div className="empty-state">
            <TrendingUp size={28} className="empty-state-icon" />
            <p className="empty-state-text">Route decisions will appear here</p>
          </div>
        )}
      </div>
    </>
  );
}
