import { Heart, House, Palette, Sprout, Sun, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { CategoryId } from "./model";

const categoryIcons = {
  life: House,
  activity: Sun,
  care: Heart,
  hobby: Palette,
  family: UsersRound,
};

export function IconBadge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={"icon-badge tone-" + tone} aria-hidden="true">{children}</span>;
}

export function CategoryIcon({ category }: { category: CategoryId }) {
  const Icon = categoryIcons[category];
  return <IconBadge tone={category}><Icon size={18} strokeWidth={1.8} /></IconBadge>;
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true"><Sprout size={24} strokeWidth={1.9} /></span>
      <span>できたこと記録</span>
    </div>
  );
}
