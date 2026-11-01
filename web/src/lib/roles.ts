// Who can do what. Shared by the server (which enforces it) and the app (which
// only hides what a user can't use).

export type Role = "owner" | "seller" | "stock";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "المالك",
  seller: "البائع",
  stock: "مسؤول المخزون",
};

/** Services the owner can give a seller, one by one. */
export const SELLER_SERVICES = [
  { key: "sell_cash", label: "💵 البيع كاش" },
  { key: "sell_credit", label: "📒 البيع بالكريدي" },
  { key: "payment", label: "💰 تسجيل الدفعات" },
  { key: "client_add", label: "➕ إضافة زبون جديد" },
  { key: "client_edit", label: "✏️ تعديل الزبناء، السلع والدفعات" },
  { key: "client_delete", label: "🗑️ حذف وأرشفة الزبناء" },
  { key: "cancel_sale", label: "↩️ إلغاء البيع" },
  { key: "reminders", label: "📲 إرسال التذكيرات" },
  { key: "stock", label: "📦 تسيير المخزون (زيادة، تعديل، حذف)" },
  { key: "caisse", label: "🔒 الصندوق" },
  { key: "reports", label: "📊 التقارير" },
  { key: "backup", label: "💾 تحميل نسخة Excel" },
] as const;

export type Service = (typeof SELLER_SERVICES)[number]["key"];
/** stock_add: add products and deliveries, search (the stock manager's job). owner_only: users, dev tools. */
export type Permission = Service | "stock_add" | "owner_only";

export interface Me {
  id: string;
  name: string;
  role: Role;
  services: Service[];
  /** Buy prices and profit are visible (always for the owner). */
  seeCost: boolean;
}

export function can(me: Pick<Me, "role" | "services"> | null | undefined, perm: Permission): boolean {
  if (!me) return false;
  if (me.role === "owner") return true;
  if (perm === "owner_only") return false;
  if (me.role === "stock") return perm === "stock_add";
  // seller
  if (perm === "stock_add") return me.services.includes("stock");
  return me.services.includes(perm);
}

export const seesCost = (me: Pick<Me, "role" | "seeCost"> | null | undefined) => Boolean(me && (me.role === "owner" || me.seeCost));

export const isService = (v: unknown): v is Service => SELLER_SERVICES.some((s) => s.key === v);
