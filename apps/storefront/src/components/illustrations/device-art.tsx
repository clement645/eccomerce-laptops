/**
 * Original flat illustrations of each product type. Used until real photography is uploaded
 * (Phase 8). Pure SVG: no network requests, crisp at any size, tiny payload.
 */

export type DeviceKind =
  | 'laptops'
  | 'desktops'
  | 'gaming'
  | 'accessories'
  | 'monitors'
  | 'printers'
  | 'networking'
  | 'storage-devices';

/** Screen wallpaper accents, so cards in the same category don't look identical. */
export const ACCENTS = [
  ['#7c3aed', '#5b3df5', '#c084fc'],
  ['#4f46e5', '#3b82f6', '#93c5fd'],
  ['#9333ea', '#db2777', '#f9a8d4'],
  ['#0891b2', '#6366f1', '#67e8f9'],
] as const;

type Accent = (typeof ACCENTS)[number];

interface DeviceArtProps {
  kind: string;
  /** Must be unique on the page: SVG gradient ids are global. */
  idPrefix: string;
  accent?: number;
  className?: string;
  title?: string;
}

export function DeviceArt({ kind, idPrefix, accent = 0, className, title }: DeviceArtProps) {
  const colors = ACCENTS[accent % ACCENTS.length]!;
  const id = (name: string) => `${idPrefix}-${name}`;
  const Art = ART[kind as DeviceKind] ?? ART.laptops;
  return (
    <svg
      viewBox="0 0 240 170"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={id('screen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#120f3a" />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
        <linearGradient id={id('wave')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={colors[0]} />
          <stop offset="0.55" stopColor={colors[1]} />
          <stop offset="1" stopColor={colors[2]} />
        </linearGradient>
        <linearGradient id={id('metal')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9ebf3" />
          <stop offset="1" stopColor="#b9bdcc" />
        </linearGradient>
        <linearGradient id={id('dark')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3f5c" />
          <stop offset="1" stopColor="#1c1f33" />
        </linearGradient>
        <linearGradient id={id('rgb')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f43f5e" />
          <stop offset="0.33" stopColor="#a855f7" />
          <stop offset="0.66" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="156" rx="96" ry="6" fill="#1e1b4b" opacity="0.1" />
      <Art id={id} colors={colors} />
    </svg>
  );
}

interface ArtProps {
  id: (name: string) => string;
  colors: Accent;
}

function Wallpaper({
  id,
  x,
  y,
  w,
  h,
}: {
  id: ArtProps['id'];
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="2" fill={`url(#${id('screen')})`} />
      <path
        d={`M${x} ${y + h * 0.62} C ${x + w * 0.28} ${y + h * 0.2}, ${x + w * 0.55} ${y + h * 1.05}, ${x + w} ${y + h * 0.35} V ${y + h} H ${x} Z`}
        fill={`url(#${id('wave')})`}
        opacity="0.95"
      />
      <path
        d={`M${x} ${y + h * 0.82} C ${x + w * 0.35} ${y + h * 0.55}, ${x + w * 0.6} ${y + h * 1.02}, ${x + w} ${y + h * 0.62} V ${y + h} H ${x} Z`}
        fill="#ffffff"
        opacity="0.18"
      />
    </g>
  );
}

function Laptop({ id, rgb }: ArtProps & { rgb?: boolean }) {
  return (
    <g>
      <rect x="54" y="18" width="132" height="92" rx="7" fill={rgb ? '#15172b' : '#1f2340'} />
      <Wallpaper id={id} x={60} y={24} w={120} h={80} />
      <circle cx="120" cy="21" r="1.2" fill="#6b7280" />
      <path
        d="M30 112 H210 L224 138 Q226 143 220 143 H20 Q14 143 16 138 Z"
        fill={`url(#${id(rgb ? 'dark' : 'metal')})`}
      />
      <path d="M44 116 H196 L203 130 H37 Z" fill={rgb ? '#0f1122' : '#d4d7e2'} />
      {[0, 1, 2].map((row) => (
        <line
          key={row}
          x1={46 - row * 2.3}
          x2={194 + row * 2.3}
          y1={119.5 + row * 4}
          y2={119.5 + row * 4}
          stroke={rgb ? `url(#${id('rgb')})` : '#b6bacb'}
          strokeWidth="2"
          strokeDasharray="5 2"
          opacity={rgb ? 0.9 : 1}
        />
      ))}
      <rect x="102" y="132" width="36" height="6" rx="2" fill={rgb ? '#23263f' : '#c7cad6'} />
      {rgb && <rect x="20" y="141" width="200" height="2" rx="1" fill={`url(#${id('rgb')})`} />}
    </g>
  );
}

const ART: Record<DeviceKind, (props: ArtProps) => React.ReactElement> = {
  laptops: (props) => <Laptop {...props} />,
  gaming: (props) => <Laptop {...props} rgb />,
  desktops: ({ id }) => (
    <g>
      <rect x="22" y="16" width="140" height="94" rx="6" fill="#1f2340" />
      <Wallpaper id={id} x={28} y={22} w={128} h={82} />
      <path d="M82 110 H102 L106 134 H78 Z" fill={`url(#${id('metal')})`} />
      <rect x="62" y="134" width="60" height="8" rx="4" fill="#b9bdcc" />
      <rect x="172" y="36" width="48" height="108" rx="6" fill={`url(#${id('dark')})`} />
      <rect x="180" y="46" width="32" height="4" rx="2" fill="#4b5072" />
      <rect x="180" y="54" width="32" height="4" rx="2" fill="#4b5072" />
      <circle cx="196" cy="126" r="4" fill={`url(#${id('wave')})`} />
    </g>
  ),
  monitors: ({ id }) => (
    <g>
      <rect x="16" y="12" width="208" height="112" rx="7" fill="#1f2340" />
      <Wallpaper id={id} x={21} y={17} w={198} h={102} />
      <path d="M108 124 H132 L138 146 H102 Z" fill={`url(#${id('metal')})`} />
      <rect x="80" y="145" width="80" height="7" rx="3.5" fill="#b9bdcc" />
    </g>
  ),
  accessories: ({ id }) => (
    <g>
      <path
        d="M22 108 L150 96 Q158 96 159 104 L162 132 Q163 140 155 141 L28 150 Q20 151 19 143 L16 117 Q15 109 22 108 Z"
        fill={`url(#${id('dark')})`}
      />
      {[0, 1, 2, 3].map((row) => (
        <line
          key={row}
          x1={28}
          y1={116 + row * 8}
          x2={152}
          y2={105 + row * 8}
          stroke="#5a5f80"
          strokeWidth="4"
          strokeDasharray="7 3"
          strokeLinecap="round"
        />
      ))}
      <ellipse cx="196" cy="128" rx="17" ry="23" fill={`url(#${id('dark')})`} />
      <line
        x1="196"
        y1="108"
        x2="196"
        y2="122"
        stroke="#5a5f80"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M150 74 C150 30, 214 30, 214 74"
        fill="none"
        stroke="#2a2e4d"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <rect x="138" y="62" width="22" height="34" rx="10" fill={`url(#${id('wave')})`} />
      <rect x="204" y="62" width="22" height="34" rx="10" fill={`url(#${id('wave')})`} />
    </g>
  ),
  printers: ({ id }) => (
    <g>
      <path d="M78 20 H162 V58 H78 Z" fill="#ffffff" stroke="#d6d9e4" strokeWidth="2" />
      <line x1="90" y1="32" x2="150" y2="32" stroke="#c7cad6" strokeWidth="3" />
      <line x1="90" y1="42" x2="138" y2="42" stroke="#c7cad6" strokeWidth="3" />
      <rect x="34" y="52" width="172" height="74" rx="12" fill={`url(#${id('metal')})`} />
      <rect x="34" y="52" width="172" height="18" rx="9" fill="#d9dce6" />
      <rect x="150" y="80" width="40" height="14" rx="4" fill={`url(#${id('screen')})`} />
      <circle cx="160" cy="87" r="2.5" fill={`url(#${id('wave')})`} />
      <rect
        x="62"
        y="118"
        width="116"
        height="26"
        rx="4"
        fill="#ffffff"
        stroke="#d6d9e4"
        strokeWidth="2"
      />
      <rect x="56" y="112" width="128" height="10" rx="5" fill="#2a2e4d" />
    </g>
  ),
  networking: ({ id }) => (
    <g>
      {[64, 120, 176].map((x, i) => (
        <rect
          key={x}
          x={x - 4}
          y={34 + (i === 1 ? -10 : 0)}
          width="8"
          height="70"
          rx="4"
          fill="#2a2e4d"
          transform={`rotate(${(i - 1) * 10} ${x} 104)`}
        />
      ))}
      <rect x="28" y="98" width="184" height="42" rx="14" fill={`url(#${id('dark')})`} />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={58 + i * 18} cy="119" r="3" fill={i < 3 ? '#22d3ee' : '#4b5072'} />
      ))}
      <rect x="160" y="113" width="34" height="12" rx="6" fill={`url(#${id('wave')})`} />
      {[18, 30, 42].map((r) => (
        <path
          key={r}
          d={`M${120 - r} 28 A ${r} ${r} 0 0 1 ${120 + r} 28`}
          fill="none"
          stroke={`url(#${id('wave')})`}
          strokeWidth="4"
          strokeLinecap="round"
          opacity={1 - r / 70}
          transform="translate(0 -6)"
        />
      ))}
    </g>
  ),
  'storage-devices': ({ id }) => (
    <g>
      <rect x="30" y="38" width="96" height="108" rx="14" fill={`url(#${id('dark')})`} />
      <rect
        x="30"
        y="38"
        width="96"
        height="108"
        rx="14"
        fill={`url(#${id('wave')})`}
        opacity="0.35"
      />
      <rect x="66" y="132" width="24" height="6" rx="3" fill="#0f1122" />
      <text
        x="78"
        y="96"
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill="#ffffff"
        opacity="0.9"
        fontFamily="system-ui"
      >
        1TB
      </text>
      <g transform="rotate(-14 176 92)">
        <rect x="140" y="80" width="84" height="26" rx="3" fill="#14532d" />
        <rect x="150" y="85" width="22" height="16" rx="2" fill="#1f2937" />
        <rect x="178" y="85" width="22" height="16" rx="2" fill="#1f2937" />
        <rect x="204" y="87" width="12" height="12" rx="2" fill="#374151" />
        <rect x="140" y="84" width="6" height="18" fill="#d4af37" />
      </g>
    </g>
  ),
};
