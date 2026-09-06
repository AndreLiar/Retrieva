'use client';

/**
 * The hero visual IS the product: a vendor → subprocessor concentration graph.
 * Two critical functions depend on three providers, which converge on ONE shared
 * substrate (the concentration) — flagged as a single point of failure. This is the
 * subject-true "most characteristic thing in Retrieva's world" (the moat + logo motif),
 * not a generic big-number hero. One orchestrated load animation (edges draw, nodes
 * settle, the risk node pulses); fully static under prefers-reduced-motion.
 */
export function ConcentrationGraphHero({ className }: { className?: string }) {
  // node coords in a 360×320 viewBox
  const fn = [
    { id: 'f1', x: 70, y: 34, label: 'Claims' },
    { id: 'f2', x: 250, y: 34, label: 'Payments' },
  ];
  const pv = [
    { id: 'p1', x: 40, y: 150, label: 'OpenAI' },
    { id: 'p2', x: 170, y: 140, label: 'Datadog' },
    { id: 'p3', x: 300, y: 150, label: 'Azure' },
  ];
  const sub = { id: 's1', x: 185, y: 262, label: 'Azure infra' }; // shared substrate = SPOF
  const edges = [
    ['f1', 'p1'], ['f1', 'p2'], ['f2', 'p2'], ['f2', 'p3'],
    ['p1', 's1'], ['p2', 's1'], ['p3', 's1'], // everything converges → concentration
  ];
  const pos: Record<string, { x: number; y: number }> = {};
  [...fn, ...pv, sub].forEach((n) => (pos[n.id] = { x: n.x, y: n.y }));

  return (
    <div className={className} aria-hidden="true">
      <svg viewBox="0 0 360 320" className="w-full h-auto rg-hero-graph" fill="none">
        <defs>
          <linearGradient id="rgEdge" x1="0" y1="0" x2="360" y2="320" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22D3EE" /><stop offset="1" stopColor="#2563EB" />
          </linearGradient>
          <radialGradient id="rgNode" cx="0.5" cy="0.4" r="0.7">
            <stop stopColor="#38BDF8" /><stop offset="1" stopColor="#2563EB" />
          </radialGradient>
          <radialGradient id="rgRisk" cx="0.5" cy="0.4" r="0.7">
            <stop stopColor="#FF8A8A" /><stop offset="1" stopColor="#FB5B5B" />
          </radialGradient>
        </defs>

        {/* edges */}
        <g stroke="url(#rgEdge)" strokeWidth="1.5" strokeLinecap="round">
          {edges.map(([a, b], i) => {
            const risk = b === 's1';
            return (
              <line
                key={`${a}-${b}`}
                x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y}
                stroke={risk ? '#FB5B5B' : 'url(#rgEdge)'}
                opacity={risk ? 0.7 : 0.5}
                className="rg-edge"
                style={{ '--i': i } as React.CSSProperties}
              />
            );
          })}
        </g>

        {/* function nodes (small, outlined) */}
        {fn.map((n, i) => (
          <g key={n.id} className="rg-node" style={{ '--i': 8 + i } as React.CSSProperties}>
            <circle cx={n.x} cy={n.y} r="6" fill="#10151F" stroke="url(#rgEdge)" strokeWidth="1.5" />
            <text x={n.x} y={n.y - 12} textAnchor="middle" className="rg-label">{n.label}</text>
          </g>
        ))}

        {/* provider nodes */}
        {pv.map((n, i) => (
          <g key={n.id} className="rg-node" style={{ '--i': 10 + i } as React.CSSProperties}>
            <circle cx={n.x} cy={n.y} r="8" fill="url(#rgNode)" />
            <text x={n.x} y={n.y + 22} textAnchor="middle" className="rg-label">{n.label}</text>
          </g>
        ))}

        {/* shared substrate = single point of failure (the one bold moment) */}
        <g className="rg-node rg-risk" style={{ '--i': 14 } as React.CSSProperties}>
          <circle cx={sub.x} cy={sub.y} r="14" fill="url(#rgRisk)" className="rg-pulse" />
          <circle cx={sub.x} cy={sub.y} r="10" fill="url(#rgRisk)" />
          <text x={sub.x} y={sub.y + 30} textAnchor="middle" className="rg-label rg-label-risk">
            {sub.label} · single point of failure
          </text>
        </g>
      </svg>
    </div>
  );
}
