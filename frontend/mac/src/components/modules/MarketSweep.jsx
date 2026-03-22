import { useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ExternalLink, Truck, Package } from 'lucide-react';
import Badge from '../shared/Badge';

const DEMO_COMPS = [
  { platform: 'ebay', title: 'Apple AirPods Pro 2nd Gen - White, Excellent', price: 149.99, condition: 'Used - Like New', match_score: 96, image_url: '', url: '', shipping: 'FREE' },
  { platform: 'mercari', title: 'AirPods Pro 2 USB-C with Case', price: 135.00, condition: 'Good', match_score: 93, image_url: '', url: '', shipping: '$5.99' },
  { platform: 'swappa', title: 'Apple AirPods Pro (2nd Generation) MagSafe', price: 142.00, condition: 'Good', match_score: 91, image_url: '', url: '', shipping: 'FREE' },
  { platform: 'facebook', title: 'AirPods Pro 2 barely used w/ box', price: 120.00, condition: 'Like New', match_score: 88, image_url: '', url: '', shipping: 'Local pickup' },
  { platform: 'offerup', title: 'Apple AirPods Pro 2nd Gen USB-C', price: 125.00, condition: 'Good', match_score: 85, image_url: '', url: '', shipping: '$4.99' },
  { platform: 'ebay', title: 'AirPods Pro 2 - For Parts/Repair', price: 55.00, condition: 'For Parts', match_score: 70, image_url: '', url: '', shipping: '$8.99' },
  { platform: 'poshmark', title: 'Apple AirPods Pro Gen 2 w/ extras', price: 139.00, condition: 'Good', match_score: 82, image_url: '', url: '', shipping: 'FREE' },
  { platform: 'mercari', title: 'AirPods Pro 2 USB-C Unlocked MagSafe Charging', price: 155.00, condition: 'Excellent', match_score: 95, image_url: '', url: '', shipping: 'FREE' },
];

const PLATFORM_COLORS = {
  ebay: '#e53238',
  mercari: '#4dc9f6',
  swappa: '#47c96b',
  amazon: '#ff9900',
  facebook: '#1877f2',
  offerup: '#00ab6c',
  poshmark: '#c13584',
  craigslist: '#5a0fa0',
  other: '#6366f1',
};

export default function MarketSweep({ bids }) {
  const railRef = useRef(null);

  const comps = useMemo(() => {
    const allBids = Object.values(bids || {}).flat();
    const sellBids = allBids.filter((b) => b.route_type === 'sell_as_is');
    const realComps = sellBids.flatMap((b) => b.comparable_listings || []);
    if (realComps.length > 0) {
      return realComps.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    }
    return DEMO_COMPS;
  }, [bids]);

  const prices = comps.filter((c) => c.price > 0).map((c) => c.price);
  const bestMatch = comps[0]?.match_score || 0;
  const avgPrice = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
  const highPrice = prices.length ? Math.max(...prices) : 0;
  const lowPrice = prices.length ? Math.min(...prices) : 0;
  const platformCount = new Set(comps.map((c) => c.platform)).size;

  function scroll(dir) {
    railRef.current?.scrollBy({ left: dir * 270, behavior: 'smooth' });
  }

  return (
    <div className="market-sweep">
      <div className="ms-stats-bar">
        <div className="ms-stat">
          <div className="ms-stat-value">{comps.length}</div>
          <div className="ms-stat-label">Listings Found</div>
        </div>
        <div className="ms-stat">
          <div className="ms-stat-value">{platformCount}</div>
          <div className="ms-stat-label">Platforms</div>
        </div>
        <div className="ms-stat">
          <div className="ms-stat-value" style={{ color: 'var(--success)' }}>
            ${avgPrice.toFixed(0)}
          </div>
          <div className="ms-stat-label">Avg Price</div>
        </div>
        <div className="ms-stat">
          <div className="ms-stat-value" style={{ color: 'var(--success)' }}>
            ${lowPrice.toFixed(0)}–${highPrice.toFixed(0)}
          </div>
          <div className="ms-stat-label">Range</div>
        </div>
        <div className="ms-stat">
          <div className="ms-stat-value">{Math.round(bestMatch)}%</div>
          <div className="ms-stat-label">Best Match</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => scroll(-1)} className="presentation-toggle" style={{ padding: '6px 8px' }}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => scroll(1)} className="presentation-toggle" style={{ padding: '6px 8px' }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="ms-rail" ref={railRef}>
        {comps.map((comp, index) => {
          const isBest = (comp.match_score || 0) >= 90;
          const platformColor = PLATFORM_COLORS[comp.platform] || PLATFORM_COLORS.other;
          const hasImage = comp.image_url && comp.image_url.startsWith('http');
          const hasUrl = comp.url && comp.url.startsWith('http');

          return (
            <motion.div
              key={`${comp.platform}-${index}`}
              className={`ms-comp-card ${isBest ? 'best-match' : ''}`}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: isBest ? 1.03 : 1,
                y: isBest ? -6 : 0,
              }}
              transition={{
                delay: index * 0.06,
                type: 'spring',
                stiffness: 180,
                damping: 18,
              }}
            >
              <div className="ms-card-image" style={!hasImage ? { background: `linear-gradient(135deg, ${platformColor}22, ${platformColor}08)` } : undefined}>
                {hasImage ? (
                  <img src={comp.image_url} alt={comp.title} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                ) : null}
                <div className="ms-card-image-fallback" style={{ display: hasImage ? 'none' : 'flex', color: platformColor }}>
                  <Package size={32} />
                </div>
                <div className="ms-card-platform">
                  <Badge platform={comp.platform} />
                </div>
                {comp.match_score != null && (
                  <div className="ms-card-match">
                    <Badge variant={comp.match_score >= 90 ? 'success' : comp.match_score >= 80 ? 'primary' : 'neutral'}>
                      {Math.round(comp.match_score)}%
                    </Badge>
                  </div>
                )}
              </div>

              <div className="ms-card-body">
                <div className="ms-card-title">{comp.title}</div>
                <div className="ms-card-price-row">
                  <span className="ms-card-price">${comp.price?.toFixed(2)}</span>
                  {comp.shipping && (
                    <span className="ms-card-shipping">
                      <Truck size={10} />
                      {comp.shipping}
                    </span>
                  )}
                </div>
                <div className="ms-card-meta">
                  <span className="ms-card-condition">{comp.condition}</span>
                  {hasUrl && (
                    <a href={comp.url} target="_blank" rel="noopener noreferrer" className="ms-card-link" onClick={(e) => e.stopPropagation()}>
                      <ExternalLink size={10} />
                      View
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
