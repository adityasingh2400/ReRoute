import { motion, AnimatePresence } from 'framer-motion';
import { Video, Package, AlertTriangle, CheckCircle } from 'lucide-react';
import Badge from '../shared/Badge';

function getConditionLabel(item) {
  const visible = item.visible_defects || [];
  const spoken = item.spoken_defects || [];
  if (visible.length + spoken.length === 0) return 'Like New';
  if (visible.some((d) => d.severity === 'major')) return 'Fair';
  return 'Good';
}

function getDefectStrings(item) {
  const visible = (item.visible_defects || []).map((d) => d.description);
  const spoken = item.spoken_defects || [];
  return [...visible, ...spoken];
}

const DEMO_ITEMS = [
  {
    item_id: 'demo-1',
    name_guess: 'iPhone 14 Pro Max',
    confidence: 0.96,
    visible_defects: [
      { description: 'Hairline scratch on screen', source: 'camera', severity: 'minor' },
      { description: 'Minor scuff on corner', source: 'camera', severity: 'minor' },
    ],
    spoken_defects: [],
    accessories_included: ['Original box', 'Lightning cable'],
    accessories_missing: [],
    hero_frame_paths: [],
  },
  {
    item_id: 'demo-2',
    name_guess: 'AirPods Pro 2nd Gen',
    confidence: 0.92,
    visible_defects: [
      { description: 'Light wear on case', source: 'camera', severity: 'minor' },
    ],
    spoken_defects: [],
    accessories_included: ['All ear tips', 'USB-C cable'],
    accessories_missing: [],
    hero_frame_paths: [],
  },
  {
    item_id: 'demo-3',
    name_guess: 'Apple Watch Series 8',
    confidence: 0.89,
    visible_defects: [
      { description: 'Small nick on bezel', source: 'camera', severity: 'minor' },
    ],
    spoken_defects: [],
    accessories_included: ['Charger', 'Sport band'],
    accessories_missing: [],
    hero_frame_paths: [],
  },
];

export default function ConditionFusion({ items }) {
  const displayItems = items.length > 0 ? items : DEMO_ITEMS;

  return (
    <div className="condition-fusion">
      <div className="cf-video-section">
        <div className="cf-video-placeholder">
          <Video size={40} />
        </div>
      </div>

      <div className="cf-items-section">
        <AnimatePresence>
          {displayItems.map((item, index) => {
            const condition = getConditionLabel(item);
            const defects = getDefectStrings(item);
            return (
              <motion.div
                key={item.item_id}
                className="cf-item-card"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: index * 0.15,
                  type: 'spring',
                  stiffness: 200,
                  damping: 20,
                }}
              >
                <div className="cf-item-image">
                  {item.hero_frame_paths?.[0] ? (
                    <img src={item.hero_frame_paths[0]} alt={item.name_guess} />
                  ) : (
                    <Package size={28} />
                  )}
                </div>
                <div className="cf-item-details">
                  <div className="cf-item-name">{item.name_guess}</div>
                  {defects.length > 0 && (
                    <div className="cf-item-defects">
                      <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4 }} />
                      {defects.join(' · ')}
                    </div>
                  )}
                  {item.accessories_included?.length > 0 && (
                    <div className="cf-item-accessories">
                      <CheckCircle size={11} style={{ display: 'inline', marginRight: 4 }} />
                      {item.accessories_included.join(' · ')}
                    </div>
                  )}
                  <div className="cf-item-tags">
                    {item.confidence != null && (
                      <Badge variant="primary">
                        {Math.round(item.confidence * 100)}% match
                      </Badge>
                    )}
                    <Badge variant={condition === 'Like New' ? 'success' : 'warning'}>
                      {condition}
                    </Badge>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
