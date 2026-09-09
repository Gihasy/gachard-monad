/**
 * Map internal transaction/card statuses to user-friendly labels.
 */

const TX_STATUS_MAP: Record<string, string> = {
  pending: "Processing",
  confirmed: "Success",
  failed: "Failed",
};

const CARD_STATUS_MAP: Record<string, string> = {
  pending: "Processing",
  Digital: "Digital",
  Vaulted: "Print Requested",
  Real: "Physical",
};

const TX_TYPE_MAP: Record<string, string> = {
  mint: "Pack Opened",
  print: "Print Request",
  redeem: "Digital",
  transfer: "Transfer",
  topup: "Top Up",
  listed: "Listed for Sale",
  sold: "Sold",
  dismantled: "Dismantled",
  claimed: "Physical",
};

/**
 * Get friendly label for a transaction status.
 * Returns the original status if no mapping exists.
 */
export function friendlyTxStatus(status: string): string {
  return TX_STATUS_MAP[status] ?? status;
}

/**
 * Get friendly label for a card status.
 * Returns the original status if no mapping exists.
 */
export function friendlyCardStatus(status: string): string {
  return CARD_STATUS_MAP[status] ?? status;
}

export function friendlyTxType(type: string): string {
  return TX_TYPE_MAP[type] ?? type;
}
