import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const BRANCHES = [
  { id: 'ebay', label: 'eBay', color: '#e53238', xPct: 20, yPct: 22, delay: 0.3 },
  { id: 'facebook', label: 'Marketplace', color: '#1877f2', xPct: 50, yPct: 16, delay: 0.45 },
  { id: 'mercari', label: 'Mercari', color: '#4dc9f6', xPct: 80, yPct: 22, delay: 0.6 },
];

function PlatformLogo({ id, x, y }) {
  if (id === 'ebay') {
    // eBay uses a rounded, overlapping sans-serif — closest web-safe match is the actual brand style
    return (
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central"
        fontSize="17" fontWeight="700" letterSpacing="-0.5"
        fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif" fill="#fff">
        <tspan fill="#e53238">e</tspan><tspan fill="#0064d2">b</tspan><tspan fill="#f5af02">a</tspan><tspan fill="#86b817">y</tspan>
      </text>
    );
  }

  if (id === 'facebook') {
    // Facebook "f" — centered precisely
    return (
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central"
        fontSize="22" fontWeight="300" fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif" fill="#fff">
        f
      </text>
    );
  }

  if (id === 'mercari') {
    return (
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central"
        fontSize="18" fontWeight="800" fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif" fill="#fff">
        m
      </text>
    );
  }

  return null;
}

export default function ExecuteRouteAnimation({ onComplete }) {
  const [phase, setPhase] = useState('burst');
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 1000, h: 600 });

  useEffect(() => {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setDims({ w: r.width, h: r.height });
    }
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('branches'), 350);
    const t2 = setTimeout(() => setPhase('glow'), 1100);
    const t3 = setTimeout(() => onComplete(), 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const cx = dims.w / 2;
  const cy = dims.h / 2;

  return (
    <motion.div
      ref={containerRef}
      className="exec-anim-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <svg
        className="exec-anim-svg"
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <linearGradient id="exec-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>

        {BRANCHES.map((b) => {
          const ex = dims.w * (b.xPct / 100);
          const ey = dims.h * (b.yPct / 100);
          const cpx = cx + (ex - cx) * 0.35;
          const cpy = cy - (cy - ey) * 0.1;

          return (
            <g key={b.id}>
              {/* Branch curve */}
              <motion.path
                d={`M${cx},${cy} C${cpx},${cpy} ${ex},${ey + 40} ${ex},${ey}`}
                fill="none"
                stroke={b.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={phase !== 'burst' ? { pathLength: 1, opacity: 0.9 } : {}}
                transition={{ duration: 0.55, delay: b.delay, ease: 'easeOut' }}
              />

              {/* Background circle */}
              <motion.circle
                cx={ex} cy={ey} r="26"
                fill={b.color}
                initial={{ scale: 0, opacity: 0 }}
                animate={phase === 'glow' ? { scale: 1, opacity: 1 } : {}}
                transition={{ duration: 0.3, delay: b.delay + 0.1, type: 'spring', stiffness: 260, damping: 18 }}
                style={{ transformOrigin: `${ex}px ${ey}px` }}
              />
              {/* Pulse ring */}
              <motion.circle
                cx={ex} cy={ey} r="26"
                fill="none" stroke={b.color} strokeWidth="2"
                initial={{ scale: 1, opacity: 0 }}
                animate={phase === 'glow' ? { scale: [1, 2.2], opacity: [0.6, 0] } : {}}
                transition={{ duration: 0.7, delay: b.delay + 0.15 }}
                style={{ transformOrigin: `${ex}px ${ey}px` }}
              />
              {/* Platform logo inside circle */}
              <motion.g
                initial={{ opacity: 0 }}
                animate={phase === 'glow' ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.2, delay: b.delay + 0.2 }}
              >
                <PlatformLogo id={b.id} x={ex} y={ey} />
              </motion.g>

              {/* Platform label below */}
              <motion.text
                x={ex} y={ey + 44}
                textAnchor="middle" fill="#fff"
                fontSize="13" fontWeight="600"
                fontFamily="Inter, -apple-system, sans-serif"
                initial={{ opacity: 0 }}
                animate={phase === 'glow' ? { opacity: 0.85 } : { opacity: 0 }}
                transition={{ duration: 0.3, delay: b.delay + 0.3 }}
              >
                {b.label}
              </motion.text>
            </g>
          );
        })}

        {/* Center origin dot */}
        <motion.circle
          cx={cx} cy={cy} r="26"
          fill="url(#exec-grad)"
          initial={{ scale: 0 }}
          animate={{ scale: phase === 'burst' ? [0, 1.4, 1] : 1 }}
          transition={{ duration: 0.35 }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
        <motion.circle
          cx={cx} cy={cy} r="26"
          fill="none" stroke="rgba(99,102,241,0.5)" strokeWidth="2"
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: [1, 3.5], opacity: [0.7, 0] }}
          transition={{ duration: 0.9, delay: 0.1 }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
        <motion.text
          x={cx} y={cy + 1}
          textAnchor="middle" dominantBaseline="central"
          fontSize="20" fill="#fff"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          ⚡
        </motion.text>
      </svg>

      <motion.div
        className="exec-anim-label"
        initial={{ opacity: 0, y: 16 }}
        animate={phase === 'glow' ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ delay: 0.2, duration: 0.35 }}
      >
        Posting to marketplaces…
      </motion.div>
    </motion.div>
  );
}
