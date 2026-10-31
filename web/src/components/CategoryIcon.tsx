import type { Category } from "@/lib/ledger";
import { categoryIcon } from "@/lib/shop";

/** The family's own picture or emoji, else one guessed from its name. */
export function CategoryIcon({ category, name, className = "" }: { category?: Category; name?: string; className?: string }) {
  const icon = category?.icon ?? "";
  if (icon.startsWith("data:image/")) return <img src={icon} alt="" className={`cat-img ${className}`} width={40} height={40} />;
  return (
    <span className={className} aria-hidden="true">
      {icon || categoryIcon(category?.name ?? name ?? "")}
    </span>
  );
}
