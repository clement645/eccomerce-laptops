/**
 * Original scene illustrations for the hero and promotional banners (no third-party imagery).
 * Each takes an idPrefix because SVG gradient ids are global to the document.
 */

interface SceneProps {
  idPrefix: string;
  className?: string;
}

/** Flowing purple ribbons used as screen wallpaper. */
function Ribbons({ id }: { id: (name: string) => string }) {
  return (
    <g>
      <path
        d="M0 210 C 90 120, 170 260, 300 150 S 470 60, 520 110 V 330 H 0 Z"
        fill={`url(#${id('ribbonA')})`}
        opacity="0.95"
      />
      <path
        d="M0 250 C 120 170, 200 300, 330 210 S 480 150, 520 190 V 330 H 0 Z"
        fill={`url(#${id('ribbonB')})`}
        opacity="0.85"
      />
      <path
        d="M0 290 C 140 230, 260 320, 380 260 S 500 240, 520 250 V 330 H 0 Z"
        fill="#ffffff"
        opacity="0.12"
      />
      <path
        d="M40 120 C 160 40, 260 170, 400 70"
        fill="none"
        stroke="#e9d5ff"
        strokeWidth="2"
        opacity="0.5"
      />
      <path
        d="M20 160 C 150 90, 280 210, 470 100"
        fill="none"
        stroke="#c4b5fd"
        strokeWidth="1.5"
        opacity="0.4"
      />
    </g>
  );
}

function RibbonGradients({ id }: { id: (name: string) => string }) {
  return (
    <>
      <linearGradient id={id('screenBg')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1e1065" />
        <stop offset="1" stopColor="#0b0a2e" />
      </linearGradient>
      <linearGradient id={id('ribbonA')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#6d28d9" />
        <stop offset="0.5" stopColor="#a855f7" />
        <stop offset="1" stopColor="#4f46e5" />
      </linearGradient>
      <linearGradient id={id('ribbonB')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#c026d3" />
        <stop offset="0.6" stopColor="#7c3aed" />
        <stop offset="1" stopColor="#38bdf8" />
      </linearGradient>
    </>
  );
}

/** Hero: a laptop in three-quarter view with a glowing violet screen. */
export function HeroLaptop({ idPrefix, className }: SceneProps) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <svg viewBox="0 0 640 460" className={className} aria-hidden>
      <defs>
        <RibbonGradients id={id} />
        <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.85" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('deck')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3f6b" />
          <stop offset="1" stopColor="#141733" />
        </linearGradient>
        <linearGradient id={id('edge')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7c3aed" stopOpacity="0" />
          <stop offset="0.5" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#4f46e5" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id('screenClip')}>
          <path d="M166 58 L468 36 L480 268 L150 290 Z" />
        </clipPath>
        <filter id={id('blur')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
      </defs>

      <ellipse
        cx="330"
        cy="330"
        rx="260"
        ry="110"
        fill={`url(#${id('glow')})`}
        filter={`url(#${id('blur')})`}
      />

      {/* Lid */}
      <path
        d="M152 44 L476 20 Q492 19 493 35 L506 280 L136 306 L140 60 Q141 46 152 44 Z"
        fill="#0d0f24"
        stroke="#3b3f6b"
        strokeWidth="2"
      />
      <g clipPath={`url(#${id('screenClip')})`}>
        <rect x="140" y="30" width="360" height="270" fill={`url(#${id('screenBg')})`} />
        <g transform="translate(150 20) rotate(-4)">
          <Ribbons id={id} />
        </g>
      </g>
      <path
        d="M166 58 L468 36 L480 268 L150 290 Z"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.08"
      />

      {/* Base */}
      <path
        d="M128 308 L512 282 L608 350 Q616 357 604 359 L52 392 Q38 393 44 384 Z"
        fill={`url(#${id('deck')})`}
      />
      <path d="M156 318 L496 295 L560 342 L112 372 Z" fill="#0f1126" />
      {[0, 1, 2, 3].map((row) => (
        <path
          key={row}
          d={`M${162 - row * 12} ${324 + row * 11} L${500 + row * 15} ${300 + row * 11}`}
          stroke="#2b2f55"
          strokeWidth="6"
          strokeDasharray="14 5"
          strokeLinecap="round"
        />
      ))}
      <path d="M282 372 L382 366 L388 380 L280 386 Z" fill="#23264a" />
      <path
        d="M52 392 L604 359"
        stroke={`url(#${id('edge')})`}
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Sparkles */}
      {[
        [96, 120, 10],
        [560, 120, 7],
        [600, 250, 5],
        [70, 300, 6],
      ].map(([x, y, s]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y! - s!} Q${x} ${y} ${x! + s!} ${y} Q${x} ${y} ${x} ${y! + s!} Q${x} ${y} ${x! - s!} ${y} Q${x} ${y} ${x} ${y! - s!} Z`}
          fill="#e9d5ff"
          opacity="0.8"
        />
      ))}
    </svg>
  );
}

/** "Built for Real Gamers": an RGB tower, monitor and keyboard. */
export function GamingRig({ idPrefix, className }: SceneProps) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <svg viewBox="0 0 560 380" className={className} aria-hidden>
      <defs>
        <RibbonGradients id={id} />
        <linearGradient id={id('rgb')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f43f5e" />
          <stop offset="0.35" stopColor="#a855f7" />
          <stop offset="0.7" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#a855f7" stopOpacity="0.6" />
          <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id('monitorClip')}>
          <rect x="196" y="58" width="320" height="186" rx="4" />
        </clipPath>
      </defs>
      <ellipse cx="300" cy="330" rx="270" ry="60" fill={`url(#${id('glow')})`} />

      {/* Monitor */}
      <rect
        x="188"
        y="50"
        width="336"
        height="202"
        rx="10"
        fill="#0b0d22"
        stroke="#2b2f55"
        strokeWidth="2"
      />
      <g clipPath={`url(#${id('monitorClip')})`}>
        <rect x="196" y="58" width="320" height="186" fill={`url(#${id('screenBg')})`} />
        <g transform="translate(196 -10) scale(0.62)">
          <Ribbons id={id} />
        </g>
        <path d="M300 200 L340 120 L380 200 Z" fill="#0b0a2e" opacity="0.6" />
        <path d="M340 200 L400 90 L460 200 Z" fill="#0b0a2e" opacity="0.8" />
      </g>
      <path d="M340 252 H372 L380 290 H332 Z" fill="#1a1d3a" />
      <rect x="304" y="288" width="104" height="10" rx="5" fill="#1a1d3a" />

      {/* Tower */}
      <rect
        x="34"
        y="70"
        width="140"
        height="250"
        rx="12"
        fill="#0b0d22"
        stroke="#2b2f55"
        strokeWidth="2"
      />
      <rect x="46" y="84" width="116" height="222" rx="6" fill="#121533" />
      {[128, 196, 264].map((cy) => (
        <g key={cy}>
          <circle
            cx="104"
            cy={cy}
            r="28"
            fill="none"
            stroke={`url(#${id('rgb')})`}
            strokeWidth="5"
          />
          <circle cx="104" cy={cy} r="18" fill="#0b0d22" />
          <circle cx="104" cy={cy} r="5" fill={`url(#${id('rgb')})`} />
        </g>
      ))}
      <rect x="34" y="316" width="140" height="4" rx="2" fill={`url(#${id('rgb')})`} />

      {/* Keyboard and mouse */}
      <path d="M200 312 L470 306 L486 336 L188 344 Z" fill="#11132b" stroke="#2b2f55" />
      <path
        d="M206 330 L478 323"
        stroke={`url(#${id('rgb')})`}
        strokeWidth="4"
        strokeDasharray="10 4"
        strokeLinecap="round"
      />
      <path
        d="M210 320 L466 314"
        stroke="#2b2f55"
        strokeWidth="4"
        strokeDasharray="10 4"
        strokeLinecap="round"
      />
      <ellipse
        cx="516"
        cy="330"
        rx="14"
        ry="20"
        fill="#11132b"
        stroke={`url(#${id('rgb')})`}
        strokeWidth="2"
      />
    </svg>
  );
}

/** "Work smarter": a laptop on a desk with a plant and a mug. */
export function DeskScene({ idPrefix, className }: SceneProps) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <svg
      viewBox="0 0 560 360"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <defs>
        <RibbonGradients id={id} />
        <linearGradient id={id('desk')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7c5a3c" />
          <stop offset="1" stopColor="#4a3423" />
        </linearGradient>
        <linearGradient id={id('wall')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#272b52" />
          <stop offset="1" stopColor="#14173a" />
        </linearGradient>
        <radialGradient id={id('lamp')} cx="0.7" cy="0.1" r="0.8">
          <stop offset="0" stopColor="#fde68a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id('screenClip')}>
          <path d="M196 92 L388 92 L388 212 L196 212 Z" />
        </clipPath>
      </defs>
      <rect width="560" height="360" fill={`url(#${id('wall')})`} />
      <rect width="560" height="360" fill={`url(#${id('lamp')})`} />
      <rect x="380" y="36" width="120" height="84" rx="6" fill="#ffffff" opacity="0.06" />
      <rect y="262" width="560" height="98" fill={`url(#${id('desk')})`} />
      <rect y="262" width="560" height="6" fill="#a07a55" opacity="0.6" />

      {/* Laptop */}
      <rect x="188" y="84" width="208" height="136" rx="8" fill="#0d0f24" />
      <g clipPath={`url(#${id('screenClip')})`}>
        <rect x="196" y="92" width="192" height="120" fill={`url(#${id('screenBg')})`} />
        <g transform="translate(196 50) scale(0.38)">
          <Ribbons id={id} />
        </g>
      </g>
      <path d="M160 222 H424 L452 262 H132 Z" fill="#c9ccd8" />
      <path d="M184 228 H400 L414 248 H170 Z" fill="#b3b7c6" />
      <rect x="262" y="252" width="60" height="6" rx="3" fill="#a3a7b8" />

      {/* Plant */}
      <path d="M86 262 L80 214 H128 L122 262 Z" fill="#e7e5e4" />
      {[
        'M104 214 C 70 180, 64 150, 84 120 C 96 160, 104 180, 104 214',
        'M104 214 C 120 170, 140 150, 158 140 C 150 180, 130 200, 104 214',
        'M104 214 C 96 170, 104 130, 118 100 C 124 150, 116 190, 104 214',
        'M104 214 C 84 196, 58 194, 44 200 C 64 214, 86 216, 104 214',
      ].map((d) => (
        <path key={d} d={d} fill="#22c55e" opacity="0.85" />
      ))}

      {/* Mug */}
      <rect x="464" y="222" width="40" height="40" rx="6" fill="#f5f5f4" />
      <path d="M504 230 C 522 230, 522 254, 504 254" fill="none" stroke="#f5f5f4" strokeWidth="6" />
      <path
        d="M476 214 C 470 204, 482 198, 476 188"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
