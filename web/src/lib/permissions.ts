// Rules about who may do what, as pure functions (used by the server routes, and tested).

import type { Ledger, LedgerOp } from "./ledger";
import { can, seesCost, type Me, type Permission } from "./roles";

/** May this user make this change (sent from a phone)? */
export function opAllowed(me: Me, op: LedgerOp): boolean {
  const any = (...perms: Permission[]) => perms.some((p) => can(me, p));
  switch (op.type) {
    case "client.add":
      return any("client_add", "sell_credit");
    case "client.update":
      return any("client_edit");
    case "client.delete":
      return any("client_delete");
    case "client.installment":
      return any("client_edit", "sell_credit");
    case "purchase.add":
      return any("sell_credit");
    case "purchase.update":
    case "purchase.delete":
    case "payment.update":
    case "payment.delete":
      return any("client_edit");
    case "payment.add":
      return any("payment", "sell_credit");
    case "stock.add":
    case "category.save":
      return any("stock_add");
    case "stock.adjust":
      // The stock manager adds deliveries; taking stock out needs full stock rights.
      return op.move && op.move.delta < 0 ? any("stock") : any("stock_add");
    case "stock.update":
    case "stock.delete":
      return any("stock");
    case "sale.add": {
      const lines = Array.isArray(op.lines) ? op.lines : [];
      return lines.every((l) => (l?.type === "كريدي" ? any("sell_credit") : any("sell_cash")));
    }
    case "sale.delete":
      return any("cancel_sale");
    case "caisse.close":
      return any("caisse");
    default:
      return false;
  }
}

/**
 * What the server records about who did it, whatever the phone sent, and
 * what a user who can't see costs isn't allowed to change.
 */
export function stampOp(me: Me, op: LedgerOp, ledger: Ledger): LedgerOp {
  switch (op.type) {
    case "sale.add":
      return {
        ...op,
        lines: (Array.isArray(op.lines) ? op.lines : []).map((l) => {
          const item = l?.stockId ? ledger.stock.find((s) => s.id === l.stockId) : undefined;
          // A seller who doesn't see costs sends none: take it from the stock card.
          const buyPrice = l.buyPrice === null && item && item.buyPrice > 0 ? Math.round(item.buyPrice * l.quantity * 100) / 100 : l.buyPrice;
          return { ...l, seller: me.name, buyPrice };
        }),
      };
    case "stock.adjust":
      return op.move ? { ...op, move: { ...op.move, seller: me.name } } : op;
    case "caisse.close":
      return op.close ? { ...op, close: { ...op.close, clerk: me.name } } : op;
    case "stock.update": {
      if (seesCost(me) || !op.patch) return op;
      // Can't see the cost, so can't change it (the form had none to show).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { buyPrice, ...patch } = op.patch;
      return { ...op, patch };
    }
    default:
      return op;
  }
}

/** The ledger as this user may see it. */
export function ledgerFor(me: Me, ledger: Ledger): Ledger {
  const cost = seesCost(me);
  const stock = cost ? ledger.stock : ledger.stock.map((s) => ({ ...s, buyPrice: 0 }));
  if (me.role === "stock") return { ...ledger, clients: [], purchases: [], payments: [], changes: [], sales: [], closings: [], stock };
  return { ...ledger, stock, sales: cost ? ledger.sales : ledger.sales.map((s) => ({ ...s, buyPrice: null })) };
}
