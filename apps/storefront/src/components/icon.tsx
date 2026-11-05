import {
  Award,
  BadgeCheck,
  CreditCard,
  Headset,
  Package,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Tag,
  ThumbsUp,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** Icons that store settings may reference by name (trust indicators, "why choose us"). */
const ICONS: Record<string, LucideIcon> = {
  truck: Truck,
  'shield-check': ShieldCheck,
  'badge-check': BadgeCheck,
  headset: Headset,
  tag: Tag,
  'rotate-ccw': RotateCcw,
  award: Award,
  'credit-card': CreditCard,
  package: Package,
  sparkles: Sparkles,
  'thumbs-up': ThumbsUp,
  wrench: Wrench,
  zap: Zap,
};

export function SettingIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon aria-hidden className={className} />;
}
