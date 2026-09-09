"use client";

import { useEffect, useState, useCallback } from "react";
import PageShell from "@/components/PageShell";

type AdminUser = {
  id: string;
  email: string;
  username: string;
  walletAddress: string;
  createdAt: string;
};

type AdminTx = {
  id: string;
  rawId: string;
  txHash: string | null;
  status: string;
  rawStatus: string;
  type: string;
  tokenId: number | null;
  tokenIds: number[] | null;
  userId: string;
  fromAddress: string;
  toAddress: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  riskScore: number | null;
  flagged: boolean;
  riskReasoning: string | null;
  amount: number | null;
  rarity: number | null;
};

type AdminCard = {
  cardId: string | null;
  tokenId: number | null;
  templateId: string;
  rarity: number;
  status: string;
  fulfillmentStatus: string | null;
  ownerAddress: string;
  ownerUsername: string | null;
  createdAt: string;
};

type ShippingAddress = {
  recipientName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  phone: string;
};

type PrintRequest = {
  txId: string;
  rawTxId: string;
  tokenId: number | null;
  redeemCode: string | null;
  codeStatus: string | null;
  accepted: boolean;
  fulfillmentStatus: string | null;
  shippingAddress: ShippingAddress | null;
  user: { email: string; username: string; walletAddress: string } | null;
  card: { cardId: string | null; claimId: string | null; status: string; rarity: number; templateId: string; fulfillmentStatus: string | null } | null;
  redeemer: { username: string; walletAddress: string } | null;
  txStatus: string;
  createdAt: string;
  updatedAt: string;
};

const RARITY_LABELS = ["Common", "Rare", "Epic", "Legendary"];
const EXPLORER_TX = "https://testnet.monadexplorer.com/tx/";
const EXPLORER_TOKEN = "https://testnet.monadexplorer.com/token/";
const CONTRACT_ADDR = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x3E1Cf18D6b94A4aCC438176b87E1387280aC87d4").trim();

type PendingCard = {
  cardId: string | null;
  tokenId: number | null;
  templateId: string;
  rarity: string;
  rarityCode: number;
  ownerUsername: string | null;
  txHash: string | null;
  txStatus: string;
  createdAt: string;
  pendingMs: number;
  pendingDuration: string;
  isStale: boolean;
};

type TabKey = "cards" | "transactions" | "dismantle" | "prints" | "health" | "users" | "supporters" | "creators";

type AdminSupporter = {
  id: string;
  email: string;
  message: string;
  createdAt: string;
};

type CreatorApp = {
  id: string;
  name: string;
  brandName: string;
  ipType: string;
  socialMedia: string;
  email: string;
  interest: string;
  communitySize: string | null;
  status: string;
  createdAt: string;
};

const TAB_META: Record<TabKey, { label: string; icon: React.ReactNode }> = {
  users: {
    label: "Users",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    ),
  },
  transactions: {
    label: "Transactions",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4M7 4L3 8M7 4l4 4" /><path d="M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>
    ),
  },
  cards: {
    label: "Cards",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="14" height="18" rx="2" /><path d="M8 8l9-3 4 11-7 2.5" /></svg>
    ),
  },
  prints: {
    label: "Print Requests",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
    ),
  },
  health: {
    label: "Health",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
    ),
  },
  supporters: {
    label: "Supporters",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
    ),
  },
  dismantle: {
    label: "Dismantle",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
    ),
  },
  creators: {
    label: "Creators",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
    ),
  },
};

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>("cards");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [txs, setTxs] = useState<AdminTx[]>([]);
  const [cards, setCards] = useState<AdminCard[]>([]);
  const [prints, setPrints] = useState<PrintRequest[]>([]);
  const [pendingCards, setPendingCards] = useState<PendingCard[]>([]);
  const [pendingMeta, setPendingMeta] = useState({ total: 0, staleCount: 0, avgPendingMinutes: 0 });
  const [supporters, setSupporters] = useState<AdminSupporter[]>([]);
  const [creatorApps, setCreatorApps] = useState<CreatorApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txTypeFilter, setTxTypeFilter] = useState<string>("all");
  const [txRiskFilter, setTxRiskFilter] = useState<string>("all");
  const [cardSearch, setCardSearch] = useState<string>("");
  const [cardStatusFilter, setCardStatusFilter] = useState<string>("all");
  const [cardRarityFilter, setCardRarityFilter] = useState<string>("all");

  const fetchAll = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch("/api/admin/users", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/transactions", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/cards", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/print-requests", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/pending-cards", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/supporters", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/creator-applications", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([usersData, txsData, cardsData, printsData, pendingData, supportersData, creatorsData]) => {
        setUsers(usersData.users ?? []);
        setTxs(txsData.transactions ?? []);
        setCards(cardsData.cards ?? []);
        setPrints(printsData.printRequests ?? []);
        setPendingCards(pendingData.cards ?? []);
        setPendingMeta({ total: pendingData.total ?? 0, staleCount: pendingData.staleCount ?? 0, avgPendingMinutes: pendingData.avgPendingMinutes ?? 0 });
        setSupporters(supportersData.supporters ?? []);
        setCreatorApps(creatorsData.applications ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredTxs = txs.filter((tx) => {
    if (txTypeFilter !== "all" && tx.type !== txTypeFilter) return false;
    if (txRiskFilter === "flagged" && !tx.flagged) return false;
    if (txRiskFilter === "high" && (tx.riskScore === null || tx.riskScore < 70)) return false;
    if (txRiskFilter === "medium" && (tx.riskScore === null || tx.riskScore < 30 || tx.riskScore >= 70)) return false;
    if (txRiskFilter === "low" && (tx.riskScore === null || tx.riskScore >= 30)) return false;
    if (txRiskFilter === "none" && tx.riskScore !== null) return false;
    return true;
  });

  const txTypes = [...new Set(txs.map((t) => t.type))].sort();

  const filteredCards = cards.filter((c) => {
    if (cardStatusFilter !== "all" && c.status !== cardStatusFilter) return false;
    if (cardRarityFilter !== "all" && c.rarity !== Number(cardRarityFilter)) return false;
    if (cardSearch) {
      const q = cardSearch.toLowerCase();
      const match =
        (c.cardId && c.cardId.toLowerCase().includes(q)) ||
        (c.tokenId !== null && String(c.tokenId).includes(q)) ||
        (c.templateId && c.templateId.toLowerCase().includes(q)) ||
        (c.ownerUsername && c.ownerUsername.toLowerCase().includes(q)) ||
        (c.ownerAddress && c.ownerAddress.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const cardStatuses = [...new Set(cards.map((c) => c.status))].sort();

  const count =
    tab === "users" ? users.length :
    tab === "transactions" ? filteredTxs.length :
    tab === "cards" ? filteredCards.length :
    tab === "prints" ? prints.length :
    tab === "supporters" ? supporters.length :
    tab === "dismantle" ? txs.filter((t) => t.type === "dismantled").length :
    tab === "creators" ? creatorApps.length :
    pendingCards.length;

  const pendingPrints = prints.filter((p) => (p.card?.fulfillmentStatus || p.fulfillmentStatus) !== "Real").length;
  const newPrintRequests = prints.filter((p) => (p.card?.fulfillmentStatus || p.fulfillmentStatus) === "Locked").length;

  const handleConfirmAll = async () => {
    setConfirmingAll(true);
    try {
      await fetch("/api/admin/confirm-all", { method: "POST", credentials: "include" });
      fetchAll();
    } catch {
      alert("Failed to confirm transactions");
    } finally {
      setConfirmingAll(false);
    }
  };

  return (
    <PageShell
      testId="admin-page"
      eyebrow="Control Room"
      title={<span className="text-gradient-aurora">Admin Console</span>}
      description="Transparent proof of blockchain integration — view wallet addresses, verify on-chain transactions via Monad Explorer, and track every card's journey from mint to physical redemption."
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-8 gap-4 mb-8">
        <SummaryCard label="Cards" value={cards.length} color="var(--aurora-pink)" active={tab === "cards"} onClick={() => setTab("cards")} />
        <SummaryCard label="Transactions" value={txs.length} color="var(--cosmic-violet)" active={tab === "transactions"} onClick={() => setTab("transactions")} />
        <SummaryCard label="Dismantle" value={txs.filter((t) => t.type === "dismantled").length} color="var(--crystal)" active={tab === "dismantle"} onClick={() => setTab("dismantle")} />
        <SummaryCard label="Print Requests" value={pendingPrints} color="var(--aurora-gold)" active={tab === "prints"} onClick={() => setTab("prints")} hasNotification={newPrintRequests > 0} />
        <SummaryCard label="Pending Mints" value={pendingMeta.total} color={pendingMeta.staleCount > 0 ? "#ff6bba" : "var(--electric-blue)"} active={tab === "health"} onClick={() => setTab("health")} hasNotification={pendingMeta.staleCount > 0} />
        <SummaryCard label="Users" value={users.length} color="var(--electric-blue)" active={tab === "users"} onClick={() => setTab("users")} />
        <SummaryCard label="Supporters" value={supporters.length} color="var(--aurora-pink)" active={tab === "supporters"} onClick={() => setTab("supporters")} />
        <SummaryCard label="Creators" value={creatorApps.length} color="var(--cosmic-violet)" active={tab === "creators"} onClick={() => setTab("creators")} />
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {(["cards", "transactions", "dismantle", "prints", "health", "users", "supporters", "creators"] as const).map((t) => {
            const isActive = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                data-testid={`admin-tab-${t}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
                style={{
                  background: isActive
                    ? "linear-gradient(135deg, rgba(184,172,255,0.22), rgba(255,107,186,0.14))"
                    : "rgba(255,255,255,0.04)",
                  border: isActive
                    ? "1px solid rgba(184,172,255,0.5)"
                    : "1px solid rgba(255,255,255,0.1)",
                  color: isActive ? "#fff" : "rgba(255,255,255,0.6)",
                }}
              >
                {TAB_META[t].icon}
                {TAB_META[t].label}
              </button>
            );
          })}
        </div>
        <button
          onClick={fetchAll}
          className="btn-ghost !py-2 !px-4 !text-xs"
          data-testid="admin-refresh"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
          Refresh
        </button>
      </div>

      {error && (
        <div
          className="p-4 rounded-2xl mb-4"
          style={{
            background: "rgba(255,107,186,0.1)",
            border: "1px solid rgba(255,107,186,0.3)",
            color: "#ff6bba",
          }}
          data-testid="admin-error"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass p-16 text-center text-white/50" data-testid="admin-loading">
          <span className="inline-block w-6 h-6 rounded-full border-2 border-white/20 border-t-white/70 animate-spin mb-3" />
          <p>Loading {TAB_META[tab].label.toLowerCase()}…</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-white/40 mb-3 uppercase tracking-widest" data-testid="admin-count">
            {count} record{count === 1 ? "" : "s"}
          </p>
          {tab === "users" && <UsersTable users={users} />}
          {tab === "transactions" && (
            <>
              <TxFilterBar
                txTypes={txTypes}
                typeFilter={txTypeFilter}
                onTypeChange={setTxTypeFilter}
                riskFilter={txRiskFilter}
                onRiskChange={setTxRiskFilter}
                total={txs.length}
                filtered={filteredTxs.length}
              />
              <TxsTable txs={filteredTxs} />
            </>
          )}
          {tab === "cards" && (
            <>
              <CardsFilterBar
                cardStatuses={cardStatuses}
                statusFilter={cardStatusFilter}
                onStatusChange={setCardStatusFilter}
                rarityFilter={cardRarityFilter}
                onRarityChange={setCardRarityFilter}
                search={cardSearch}
                onSearchChange={setCardSearch}
                total={cards.length}
                filtered={filteredCards.length}
              />
              <CardsTable cards={filteredCards} />
            </>
          )}
          {tab === "prints" && (
            <>
              <div className="mb-4">
                <button
                  onClick={async () => {
                    const res = await fetch("/api/admin/fix-claimed-cards", { method: "POST", credentials: "include" });
                    const data = await res.json();
                    alert(data.fixed !== undefined ? `Fixed ${data.fixed} card(s)` : data.error || "Failed");
                    if (data.fixed > 0) fetchAll();
                  }}
                  className="btn-ghost !py-1.5 !px-3 !text-xs"
                  data-testid="admin-fix-claimed-cards"
                >
                  Fix Claimed Cards
                </button>
              </div>
              <PrintRequestsTable prints={prints} onAccept={fetchAll} />
            </>
          )}
          {tab === "health" && (
            <HealthTable
              pendingCards={pendingCards}
              meta={pendingMeta}
              confirmingAll={confirmingAll}
              onConfirmAll={handleConfirmAll}
            />
          )}
          {tab === "supporters" && <SupportersTable supporters={supporters} />}
          {tab === "dismantle" && <DismantleTable txs={txs.filter((t) => t.type === "dismantled")} cards={cards} users={users} />}
          {tab === "creators" && <CreatorAppsTable apps={creatorApps} />}
        </>
      )}
    </PageShell>
  );
}

function SummaryCard({
  label, value, color, active, onClick, hasNotification,
}: { label: string; value: number | string; color: string; active: boolean; onClick: () => void; hasNotification?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="glass glass-hover p-5 text-left relative"
      style={{ borderColor: active ? color : undefined }}
      data-testid={`admin-summary-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {hasNotification && (
        <span
          className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full animate-pulse"
          style={{ background: "#ff6bba", boxShadow: "0 0 8px rgba(255,107,186,0.6)" }}
        />
      )}
      <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/45 mb-2">{label}</p>
      <p className="font-display text-3xl" style={{ color }}>{value}</p>
    </button>
  );
}

/* ─── Shared table shell ─── */
function TableShell({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass overflow-hidden" data-testid="admin-table">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-strong)", background: "rgba(255,255,255,0.02)" }}>
              {head}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left px-4 py-3.5 text-white/45 uppercase text-[0.62rem] tracking-[0.18em] font-semibold">{children}</th>
);
const rowStyle = { borderBottom: "1px solid var(--border-subtle)" };

/* ─── Users ─── */
function UsersTable({ users }: { users: AdminUser[] }) {
  return (
    <TableShell head={<><TH>Email</TH><TH>Username</TH><TH>Wallet Address</TH><TH>Joined</TH></>}>
      {users.length === 0 ? (
        <tr><td colSpan={4} className="p-8 text-center text-white/40">No users found</td></tr>
      ) : (
        users.map((u) => (
          <tr key={u.id} style={rowStyle} className="hover:bg-white/[0.03] transition-colors">
            <td className="px-4 py-3.5 text-white/90">{u.email}</td>
            <td className="px-4 py-3.5" style={{ color: "var(--cosmic-violet)" }}>@{u.username}</td>
            <td className="px-4 py-3.5 font-mono text-xs text-white/60">{u.walletAddress}</td>
            <td className="px-4 py-3.5 text-white/50">{new Date(u.createdAt).toLocaleDateString()}</td>
          </tr>
        ))
      )}
    </TableShell>
  );
}

/* ─── Transactions ─── */
function TxFilterBar({
  txTypes, typeFilter, onTypeChange, riskFilter, onRiskChange, total, filtered,
}: {
  txTypes: string[];
  typeFilter: string;
  onTypeChange: (v: string) => void;
  riskFilter: string;
  onRiskChange: (v: string) => void;
  total: number;
  filtered: number;
}) {
  const selectStyle: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "rgba(255,255,255,0.85)",
    borderRadius: "0.5rem",
    padding: "0.375rem 0.75rem",
    fontSize: "0.75rem",
    outline: "none",
    cursor: "pointer",
  };
  const optionStyle: React.CSSProperties = {
    backgroundColor: "#1a1a2e",
    color: "rgba(255,255,255,0.85)",
  };
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4" data-testid="tx-filters">
      <div className="flex items-center gap-2">
        <span className="text-[0.62rem] uppercase tracking-widest text-white/40">Type</span>
        <select value={typeFilter} onChange={(e) => onTypeChange(e.target.value)} style={selectStyle}>
          <option value="all" style={optionStyle}>All</option>
          {txTypes.map((t) => <option key={t} value={t} style={optionStyle}>{t}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[0.62rem] uppercase tracking-widest text-white/40">Risk</span>
        <select value={riskFilter} onChange={(e) => onRiskChange(e.target.value)} style={selectStyle}>
          <option value="all" style={optionStyle}>All</option>
          <option value="flagged" style={optionStyle}>Flagged</option>
          <option value="high" style={optionStyle}>High (&#8805;70)</option>
          <option value="medium" style={optionStyle}>Medium (30-69)</option>
          <option value="low" style={optionStyle}>Low (&lt;30)</option>
          <option value="none" style={optionStyle}>No Score</option>
        </select>
      </div>
      {filtered !== total && (
        <span className="text-[0.6rem] text-white/30 ml-2">{filtered} of {total}</span>
      )}
    </div>
  );
}

function TxsTable({ txs }: { txs: AdminTx[] }) {
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  return (
    <TableShell head={<><TH>Invoice ID</TH><TH>txHash</TH><TH>Status</TH><TH>Type</TH><TH>Risk</TH><TH>Timestamp</TH></>}>
      {txs.length === 0 ? (
        <tr><td colSpan={6} className="p-8 text-center text-white/40">No transactions found</td></tr>
      ) : (
        txs.map((tx) => (
          <>
            <tr key={tx.rawId} style={rowStyle} className="hover:bg-white/[0.03] transition-colors">
              <td className="px-4 py-3.5">
                <div className="font-mono text-xs text-white/90">{tx.id}</div>
                <div className="text-[0.6rem] text-white/35 font-mono">{tx.rawId}</div>
              </td>
              <td className="px-4 py-3.5 font-mono text-xs">
                {tx.txHash ? (
                  <a href={`${EXPLORER_TX}${tx.txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--electric-blue)" }} className="hover:underline">
                    {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-6)}
                  </a>
                ) : <span className="text-white/30">—</span>}
              </td>
              <td className="px-4 py-3.5">
                <StatusPill status={tx.status} rgb={tx.rawStatus === "confirmed" ? "0,204,255" : tx.rawStatus === "failed" ? "255,107,186" : "255,196,102"} />
              </td>
              <td className="px-4 py-3.5 capitalize text-white/80">{tx.type}</td>
              <td className="px-4 py-3.5">
                {tx.riskScore !== null ? (
                  <button
                    onClick={() => setExpandedTx(expandedTx === tx.rawId ? null : tx.rawId)}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: tx.riskScore >= 70 ? "rgba(255,107,186,0.15)" : tx.riskScore >= 30 ? "rgba(255,196,102,0.15)" : "rgba(0,255,136,0.15)",
                        color: tx.riskScore >= 70 ? "rgb(255,107,186)" : tx.riskScore >= 30 ? "rgb(255,196,102)" : "rgb(0,255,136)",
                      }}
                    >
                      {tx.riskScore}
                    </span>
                    {tx.flagged && <span title="Flagged suspicious">🚩</span>}
                  </button>
                ) : (
                  <span className="text-white/20 text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-white/50">{new Date(tx.createdAt).toLocaleString()}</td>
            </tr>
            {expandedTx === tx.rawId && tx.riskReasoning && (
              <tr key={`${tx.rawId}-detail`}>
                <td colSpan={6} className="px-4 py-2 text-xs text-white/60" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                  <span className="text-white/40">Risk reasoning:</span> {tx.riskReasoning}
                </td>
              </tr>
            )}
          </>
        ))
      )}
    </TableShell>
  );
}

/* ─── Cards ─── */
const FULFILLMENT_COLORS: Record<string, { rgb: string }> = {
  Locked: { rgb: "255,196,102" },
  Processing: { rgb: "138,92,255" },
  Printed: { rgb: "0,204,255" },
  Shipping: { rgb: "255,107,186" },
  Real: { rgb: "0,255,136" },
  Physical: { rgb: "0,255,136" },
};

function statusRgb(status: string) {
  return (status === "Real" || status === "Physical") ? "0,255,136" : status === "Vaulted" ? "255,107,186" : status === "Digital" ? "0,204,255" : "255,196,102";
}

const FULFILLMENT_DISPLAY: Record<string, string> = { Real: "Physical" };

function StatusPill({ status, rgb }: { status: string; rgb: string }) {
  return (
    <span className="text-[0.62rem] uppercase tracking-widest px-2.5 py-1 rounded-full inline-block"
      style={{ background: `rgba(${rgb},0.14)`, color: `rgb(${rgb})`, border: `1px solid rgba(${rgb},0.35)` }}>
      {FULFILLMENT_DISPLAY[status] ?? status}
    </span>
  );
}

function TokenIdCell({ tokenId }: { tokenId: number }) {
  const [copied, setCopied] = useState(false);
  const fullUrl = `https://testnet.monadexplorer.com/token/${CONTRACT_ADDR}?a=${tokenId}#transactions`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2">
      <a
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-white/90 hover:text-white transition-colors"
        title={fullUrl}
      >
        {tokenId}
      </a>
      <button
        onClick={handleCopy}
        className="text-white/40 hover:text-white/80 transition-colors cursor-pointer"
        title={copied ? "Copied!" : fullUrl}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--electric-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
        )}
      </button>
      <a
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-white/40 hover:text-white/80 transition-colors"
        title={fullUrl}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
      </a>
    </div>
  );
}

/* ─── Cards Filter Bar ─── */
function CardsFilterBar({
  cardStatuses, statusFilter, onStatusChange, rarityFilter, onRarityChange, search, onSearchChange, total, filtered,
}: {
  cardStatuses: string[];
  statusFilter: string;
  onStatusChange: (v: string) => void;
  rarityFilter: string;
  onRarityChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  total: number;
  filtered: number;
}) {
  const selectStyle: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "rgba(255,255,255,0.85)",
    borderRadius: "0.5rem",
    padding: "0.375rem 0.75rem",
    fontSize: "0.75rem",
    outline: "none",
    cursor: "pointer",
  };
  const optionStyle: React.CSSProperties = {
    backgroundColor: "#1a1a2e",
    color: "rgba(255,255,255,0.85)",
  };
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4" data-testid="cards-filters">
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search cardId, tokenId, template, owner…"
          className="flex-1 bg-transparent text-sm text-white/85 placeholder:text-white/25 outline-none"
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "0.5rem",
            padding: "0.375rem 0.75rem",
            fontSize: "0.75rem",
          }}
          data-testid="cards-search"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[0.62rem] uppercase tracking-widest text-white/40">Status</span>
        <select value={statusFilter} onChange={(e) => onStatusChange(e.target.value)} style={selectStyle}>
          <option value="all" style={optionStyle}>All</option>
          {cardStatuses.map((s) => <option key={s} value={s} style={optionStyle}>{s}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[0.62rem] uppercase tracking-widest text-white/40">Rarity</span>
        <select value={rarityFilter} onChange={(e) => onRarityChange(e.target.value)} style={selectStyle}>
          <option value="all" style={optionStyle}>All</option>
          <option value="0" style={optionStyle}>Common</option>
          <option value="1" style={optionStyle}>Rare</option>
          <option value="2" style={optionStyle}>Epic</option>
          <option value="3" style={optionStyle}>Legendary</option>
        </select>
      </div>
      {filtered !== total && (
        <span className="text-[0.6rem] text-white/30 ml-2">{filtered} of {total}</span>
      )}
    </div>
  );
}

function CardsTable({ cards }: { cards: AdminCard[] }) {
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 1500);
  };

  return (
    <TableShell head={<><TH>Token ID</TH><TH>Card ID</TH><TH>Template</TH><TH>Rarity</TH><TH>Status</TH><TH>Fulfillment</TH><TH>Owner</TH></>}>
      {cards.length === 0 ? (
        <tr><td colSpan={7} className="p-8 text-center text-white/40">No cards found</td></tr>
      ) : (
        cards.map((c, i) => (
          <tr key={c.tokenId ?? `card-${i}`} style={rowStyle} className="hover:bg-white/[0.03] transition-colors">
            <td className="px-4 py-3.5">
              {c.tokenId !== null ? <TokenIdCell tokenId={c.tokenId} /> : <span className="text-white/30 text-xs">pending</span>}
            </td>
            <td className="px-4 py-3.5 font-mono text-xs text-white/50">{c.cardId ?? "—"}</td>
            <td className="px-4 py-3.5 text-white/80">{c.templateId}</td>
            <td className="px-4 py-3.5">
              <span className={`tag tag-${(RARITY_LABELS[c.rarity] ?? "common").toLowerCase()}`}>{RARITY_LABELS[c.rarity] ?? `?${c.rarity}`}</span>
            </td>
            <td className="px-4 py-3.5"><StatusPill status={c.status} rgb={statusRgb(c.status)} /></td>
            <td className="px-4 py-3.5">
              {c.fulfillmentStatus ? (
                <StatusPill status={c.fulfillmentStatus} rgb={FULFILLMENT_COLORS[c.fulfillmentStatus]?.rgb ?? "230,232,240"} />
              ) : <span className="text-white/30">—</span>}
            </td>
            <td className="px-4 py-3.5 text-xs">
              {c.ownerUsername && <div className="text-white/90 font-medium mb-0.5">{c.ownerUsername}</div>}
              {c.ownerAddress ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[0.6rem] text-white/40">{c.ownerAddress.slice(0, 10)}...{c.ownerAddress.slice(-6)}</span>
                  <button
                    onClick={() => handleCopyAddress(c.ownerAddress)}
                    className="text-white/30 hover:text-white/70 transition-colors cursor-pointer"
                    title={copiedAddr === c.ownerAddress ? "Copied!" : "Copy wallet address"}
                  >
                    {copiedAddr === c.ownerAddress ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--crystal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                    )}
                  </button>
                </div>
              ) : (
                <span className="text-white/30">—</span>
              )}
            </td>
          </tr>
        ))
      )}
    </TableShell>
  );
}

/* ─── Print Requests ─── */
const FULFILLMENT_ACTIONS: Record<string, { label: string; next: string }> = {
  Locked: { label: "Accept & Start Processing", next: "Processing" },
  Processing: { label: "Mark as Printed", next: "Printed" },
  Printed: { label: "Mark as Shipped", next: "Shipping" },
  Shipping: { label: "Awaiting User Claim", next: "" },
};

function PrintRequestsTable({ prints, onAccept }: { prints: PrintRequest[]; onAccept: () => void }) {
  const [processing, setProcessing] = useState<number | null>(null);
  const [trackingInput, setTrackingInput] = useState<Record<number, string>>({});

  const handleFulfillment = async (tokenId: number, action: string) => {
    setProcessing(tokenId);
    try {
      const body: Record<string, unknown> = { tokenId, action };
      if (action === "Shipping") body.trackingNumber = trackingInput[tokenId] || "";
      const res = await fetch("/api/admin/fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) onAccept();
      else { const data = await res.json(); alert(data.error || "Action failed"); }
    } catch { alert("Network error"); }
    finally { setProcessing(null); }
  };

  if (prints.length === 0) {
    return <div className="glass p-12 text-center text-white/40">No print requests found</div>;
  }

  return (
    <div className="space-y-4">
      {prints.map((pr) => {
        const fs = pr.card?.fulfillmentStatus || pr.fulfillmentStatus;
        const action = fs ? FULFILLMENT_ACTIONS[fs] : null;
        const fsRgb = fs ? (FULFILLMENT_COLORS[fs]?.rgb ?? "230,232,240") : "230,232,240";

        return (
          <div
            key={pr.rawTxId}
            className="glass p-5"
            style={{
              borderColor: fs === "Locked"
                ? "rgba(255,107,186,0.5)"
                : fs === "Real"
                ? "rgba(0,255,136,0.3)"
                : undefined,
            }}
            data-testid={`print-request-${pr.tokenId}`}
          >
            <div className="flex flex-wrap gap-6 items-start">
              <div className="min-w-[140px]">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[0.62rem] uppercase tracking-widest text-white/40">Card</p>
                  {fs === "Locked" && (
                    <span
                      className="text-[0.5rem] uppercase tracking-widest px-1.5 py-0.5 rounded-full animate-pulse"
                      style={{ background: "rgba(255,107,186,0.2)", color: "#ff6bba", border: "1px solid rgba(255,107,186,0.5)" }}
                    >
                      NEW
                    </span>
                  )}
                </div>
                <p className="font-display text-xl">#{pr.card?.cardId || pr.tokenId || "?"}</p>
                {pr.card && (
                  <>
                    <p className="text-xs text-white/60">{pr.card.templateId}</p>
                    <span className={`tag tag-${(RARITY_LABELS[pr.card.rarity] ?? "common").toLowerCase()} mt-1 inline-block`}>
                      {RARITY_LABELS[pr.card.rarity] ?? "Unknown"}
                    </span>
                  </>
                )}
              </div>

              <div className="min-w-[180px]">
                <p className="text-[0.62rem] uppercase tracking-widest text-white/40 mb-1">User</p>
                {pr.user ? (
                  <>
                    <p className="text-sm text-white/90">{pr.user.email}</p>
                    <p className="text-xs text-white/60">@{pr.user.username}</p>
                    <p className="text-[0.6rem] font-mono text-white/35 mt-1">
                      {pr.user.walletAddress.slice(0, 10)}...{pr.user.walletAddress.slice(-6)}
                    </p>
                  </>
                ) : <p className="text-xs text-white/40">Unknown user</p>}
              </div>

              <div className="min-w-[200px]">
                <p className="text-[0.62rem] uppercase tracking-widest text-white/40 mb-1">Redeem Code</p>
                <p className="font-mono text-sm px-3 py-1.5 rounded-lg inline-block select-all"
                  style={{ background: "rgba(255,196,102,0.1)", border: "1px solid rgba(255,196,102,0.3)", color: "#ffc466" }}>
                  {pr.redeemCode ?? "N/A"}
                </p>
                <p className="text-[0.6rem] text-white/40 mt-1">
                  Status: {pr.codeStatus === "claimed" ? "Claimed" : pr.codeStatus ?? "unknown"}
                </p>
                {pr.codeStatus === "claimed" && pr.redeemer && (
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-[0.6rem] text-white/50">
                      Claimed by <span className="text-white/80 font-medium">@{pr.redeemer.username}</span>
                    </p>
                    <p className="text-[0.55rem] font-mono text-white/35">
                      {pr.redeemer.walletAddress.slice(0, 10)}...{pr.redeemer.walletAddress.slice(-6)}
                    </p>
                  </div>
                )}
              </div>

              <div className="min-w-[200px]">
                <p className="text-[0.62rem] uppercase tracking-widest text-white/40 mb-1">Shipping Address</p>
                {pr.shippingAddress ? (
                  <div className="text-xs text-white/70 space-y-0.5">
                    <p className="font-medium text-white">{pr.shippingAddress.recipientName}</p>
                    <p>{pr.shippingAddress.addressLine1}</p>
                    {pr.shippingAddress.addressLine2 && <p>{pr.shippingAddress.addressLine2}</p>}
                    <p>{pr.shippingAddress.city}, {pr.shippingAddress.postalCode}</p>
                    <p className="text-white/50">{pr.shippingAddress.phone}</p>
                  </div>
                ) : <p className="text-xs text-white/40">No address</p>}
              </div>

              <div className="flex gap-4">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-widest text-white/40 mb-1">Scan & Verify</p>
                  {pr.tokenId !== null ? (
                    <div className="bg-white p-2 rounded-lg inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/cards/${pr.tokenId}/qr`} alt={`QR for #${pr.tokenId}`} className="w-20 h-20" />
                    </div>
                  ) : <p className="text-xs text-white/40">No token ID</p>}
                </div>
                {pr.card?.claimId && pr.card?.fulfillmentStatus === "Shipping" && (
                  <div>
                    <p className="text-[0.62rem] uppercase tracking-widest text-white/40 mb-1">Claim Shipping</p>
                    <div className="bg-white p-2 rounded-lg inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/claim-qr/${pr.card.claimId}`} alt="Claim QR" className="w-20 h-20" />
                    </div>
                    <p className="text-[0.5rem] font-mono text-white/30 mt-1">{pr.card.claimId}</p>
                  </div>
                )}
              </div>

              <div className="w-full sm:ml-auto sm:w-auto sm:min-w-[210px] text-left sm:text-right">
                <p className="text-[0.62rem] uppercase tracking-widest text-white/40 mb-2">Fulfillment</p>
                {fs && (
                  <span className="text-[0.68rem] uppercase tracking-widest px-3 py-1 rounded-full inline-block mb-3"
                    style={{ background: `rgba(${fsRgb},0.14)`, color: `rgb(${fsRgb})`, border: `1px solid rgba(${fsRgb},0.35)` }}>
                    {FULFILLMENT_DISPLAY[fs] ?? fs}
                  </span>
                )}
                {fs === "Printed" && (
                  <input
                    type="text"
                    placeholder="Tracking number (optional)"
                    value={trackingInput[pr.tokenId ?? 0] || ""}
                    onChange={(e) => setTrackingInput((p) => ({ ...p, [pr.tokenId ?? 0]: e.target.value }))}
                    className="w-full mb-2 px-3 py-2 rounded-xl text-xs bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 outline-none focus:border-white/30"
                  />
                )}
                {action && action.next && pr.tokenId !== null && (
                  <button
                    onClick={() => handleFulfillment(pr.tokenId!, action.next)}
                    disabled={processing === pr.tokenId}
                    data-testid={`print-action-${pr.tokenId}`}
                    className="w-full px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-50"
                    style={{
                      background: action.next === "Real"
                        ? "linear-gradient(135deg, rgba(0,255,136,0.22), rgba(0,204,255,0.15))"
                        : "linear-gradient(135deg, rgba(138,92,255,0.24), rgba(255,107,186,0.16))",
                      border: action.next === "Real" ? "1px solid rgba(0,255,136,0.5)" : "1px solid rgba(138,92,255,0.5)",
                      color: action.next === "Real" ? "#00ff88" : "#b8acff",
                    }}
                  >
                    {processing === pr.tokenId ? "Processing..." : action.label}
                  </button>
                )}

              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Health / Pending Cards ─── */
function HealthTable({
  pendingCards,
  meta,
  confirmingAll,
  onConfirmAll,
}: {
  pendingCards: PendingCard[];
  meta: { total: number; staleCount: number; avgPendingMinutes: number };
  confirmingAll: boolean;
  onConfirmAll: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="glass p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-[0.6rem] uppercase tracking-widest text-white/40">Pending Cards</p>
            <p className="font-display text-2xl" style={{ color: meta.staleCount > 0 ? "#ff6bba" : "var(--electric-blue)" }}>
              {meta.total}
            </p>
          </div>
          {meta.staleCount > 0 && (
            <div>
              <p className="text-[0.6rem] uppercase tracking-widest text-white/40">Stale (&gt;1m)</p>
              <p className="font-display text-2xl" style={{ color: "#ff6bba" }}>{meta.staleCount}</p>
            </div>
          )}
          {meta.total > 0 && (
            <div>
              <p className="text-[0.6rem] uppercase tracking-widest text-white/40">Avg Pending</p>
              <p className="font-display text-2xl" style={{ color: "var(--aurora-gold)" }}>{meta.avgPendingMinutes}m</p>
            </div>
          )}
        </div>
        {meta.total > 0 && (
          <button
            onClick={onConfirmAll}
            disabled={confirmingAll}
            className="btn-primary !py-2 !px-4 !text-xs disabled:opacity-50"
            data-testid="admin-confirm-all-pending"
          >
            {confirmingAll ? "Confirming…" : "Confirm All Pending"}
          </button>
        )}
      </div>

      {/* Table */}
      {pendingCards.length === 0 ? (
        <div className="glass p-12 text-center" data-testid="admin-health-empty">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "rgba(0,204,255,0.15)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--electric-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l4 4 10-10" />
            </svg>
          </div>
          <p className="text-white/60 text-sm">No pending cards — all mints confirmed.</p>
        </div>
      ) : (
        <TableShell
          head={
            <>
              <TH>Card ID</TH>
              <TH>Template</TH>
              <TH>Rarity</TH>
              <TH>Owner</TH>
              <TH>Tx Status</TH>
              <TH>Pending</TH>
              <TH>Created</TH>
            </>
          }
        >
          {pendingCards.map((card, i) => (
            <tr
              key={card.cardId ?? `pending-${i}`}
              style={{
                ...rowStyle,
                background: card.isStale ? "rgba(255,107,186,0.04)" : undefined,
              }}
              className="hover:bg-white/[0.03] transition-colors"
              data-testid={`pending-card-${card.cardId ?? i}`}
            >
              <td className="px-4 py-3 font-mono text-white/90">
                {card.cardId ? `#${card.cardId}` : "—"}
              </td>
              <td className="px-4 py-3 text-white/80 text-xs">{card.templateId}</td>
              <td className="px-4 py-3">
                <span className={`tag tag-${card.rarity.toLowerCase()} text-[0.55rem]`}>{card.rarity}</span>
              </td>
              <td className="px-4 py-3 text-xs">
                {card.ownerUsername && <div className="text-white/80">{card.ownerUsername}</div>}
              </td>
              <td className="px-4 py-3">
                <StatusPill
                  status={card.txStatus}
                  rgb={card.txStatus === "confirmed" ? "0,204,255" : card.txStatus === "failed" ? "255,107,186" : "255,196,102"}
                />
              </td>
              <td className="px-4 py-3">
                <span
                  className="text-sm font-mono font-semibold"
                  style={{ color: card.pendingMs > 300000 ? "#ff6bba" : card.pendingMs > 60000 ? "var(--aurora-gold)" : "var(--electric-blue)" }}
                >
                  {card.pendingDuration}
                </span>
              </td>
              <td className="px-4 py-3 text-white/50 text-xs">
                {new Date(card.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
}

/* ─── Supporters ─── */
function SupportersTable({ supporters }: { supporters: AdminSupporter[] }) {
  return (
    <TableShell head={<><TH>Email</TH><TH>Message</TH><TH>Submitted</TH></>}>
      {supporters.length === 0 ? (
        <tr><td colSpan={3} className="p-8 text-center text-white/40">No supporters yet</td></tr>
      ) : (
        supporters.map((s) => (
          <tr key={s.id} style={rowStyle} className="hover:bg-white/[0.03] transition-colors">
            <td className="px-4 py-3.5 text-white/90">{s.email}</td>
            <td className="px-4 py-3.5 text-white/70 max-w-xs truncate" title={s.message}>
              {s.message || <span className="text-white/30 italic">—</span>}
            </td>
            <td className="px-4 py-3.5 text-white/50">{new Date(s.createdAt).toLocaleString()}</td>
          </tr>
        ))
      )}
    </TableShell>
  );
}

/* ─── Dismantle ─── */
function DismantleTable({ txs, cards, users }: { txs: AdminTx[]; cards: AdminCard[]; users: AdminUser[] }) {
  const cardMap = new Map(cards.map((c) => [c.tokenId, c]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <TableShell
      head={
        <>
          <TH>Time</TH>
          <TH>Owner</TH>
          <TH>Card</TH>
          <TH>Rarity</TH>
          <TH>Crystal</TH>
          <TH>Tx Hash</TH>
          <TH>Status</TH>
        </>
      }
    >
      {txs.length === 0 ? (
        <tr><td colSpan={7} className="p-8 text-center text-white/40">No dismantle records yet</td></tr>
      ) : (
        txs.map((tx) => {
          const card = tx.tokenId != null ? cardMap.get(tx.tokenId) : undefined;
          const user = userMap.get(tx.userId);
          const rarityLabel = tx.rarity != null ? RARITY_LABELS[tx.rarity] ?? "?" : card ? RARITY_LABELS[card.rarity] ?? "?" : "?";
          const cardName = card?.templateId ?? `Token #${tx.tokenId ?? "?"}`;

          return (
            <tr key={tx.id} style={rowStyle} className="hover:bg-white/[0.03] transition-colors">
              <td className="px-4 py-3.5 text-white/50 whitespace-nowrap">{new Date(tx.createdAt).toLocaleString()}</td>
              <td className="px-4 py-3.5 text-white/90">{user?.username ?? tx.userId}</td>
              <td className="px-4 py-3.5 text-white/90">{cardName}</td>
              <td className="px-4 py-3.5">
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-medium"
                  style={{
                    background: rarityLabel === "Legendary" ? "rgba(255,196,102,0.15)" : rarityLabel === "Epic" ? "rgba(184,172,255,0.15)" : rarityLabel === "Rare" ? "rgba(0,204,255,0.15)" : "rgba(255,255,255,0.08)",
                    color: rarityLabel === "Legendary" ? "var(--aurora-gold)" : rarityLabel === "Epic" ? "var(--cosmic-violet)" : rarityLabel === "Rare" ? "var(--electric-blue)" : "rgba(255,255,255,0.5)",
                  }}
                >
                  {rarityLabel}
                </span>
              </td>
              <td className="px-4 py-3.5 font-medium" style={{ color: "var(--crystal)" }}>
                +{tx.amount ?? "?"}
              </td>
              <td className="px-4 py-3.5">
                {tx.txHash ? (
                  <a
                    href={`${EXPLORER_TX}${tx.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/60 hover:text-white transition-colors font-mono text-xs"
                  >
                    {tx.txHash.slice(0, 10)}…{tx.txHash.slice(-6)}
                  </a>
                ) : (
                  <span className="text-white/30">—</span>
                )}
              </td>
              <td className="px-4 py-3.5">
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-medium"
                  style={{
                    background: tx.rawStatus === "confirmed" ? "rgba(0,255,136,0.12)" : tx.rawStatus === "failed" ? "rgba(255,107,186,0.12)" : "rgba(255,196,102,0.12)",
                    color: tx.rawStatus === "confirmed" ? "#00ff88" : tx.rawStatus === "failed" ? "#ff6bba" : "var(--aurora-gold)",
                  }}
                >
                  {tx.status}
                </span>
              </td>
            </tr>
          );
        })
      )}
    </TableShell>
  );
}

/* ─── Creator Applications ─── */
function CreatorAppsTable({ apps }: { apps: CreatorApp[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <TableShell
      head={
        <>
          <TH>Date</TH>
          <TH>Name</TH>
          <TH>Brand / IP</TH>
          <TH>Type</TH>
          <TH>Email</TH>
          <TH>Social</TH>
          <TH>Community</TH>
          <TH>Interest</TH>
        </>
      }
    >
      {apps.length === 0 ? (
        <tr><td colSpan={8} className="p-8 text-center text-white/40">No applications yet</td></tr>
      ) : (
        apps.map((a) => {
          const isExpanded = expanded === a.id;
          const interestShort = a.interest.length > 60 ? a.interest.slice(0, 60) + "…" : a.interest;

          return (
            <tr key={a.id} style={rowStyle} className="hover:bg-white/[0.03] transition-colors">
              <td className="px-4 py-3.5 text-white/50 text-xs whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td>
              <td className="px-4 py-3.5 text-white/90 text-xs font-medium">{a.name}</td>
              <td className="px-4 py-3.5 text-white/80 text-xs">{a.brandName}</td>
              <td className="px-4 py-3.5">
                <span
                  className="text-[0.6rem] uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{ background: "rgba(184,172,255,0.12)", color: "var(--cosmic-violet)" }}
                >
                  {a.ipType}
                </span>
              </td>
              <td className="px-4 py-3.5 text-xs">
                <a href={`mailto:${a.email}`} className="text-white/60 hover:text-white transition-colors">{a.email}</a>
              </td>
              <td className="px-4 py-3.5 text-xs">
                <a href={a.socialMedia} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors max-w-[120px] truncate inline-block">
                  {a.socialMedia}
                </a>
              </td>
              <td className="px-4 py-3.5 text-white/50 text-xs">{a.communitySize || "—"}</td>
              <td className="px-4 py-3.5 text-xs max-w-[200px]">
                <button
                  onClick={() => setExpanded(isExpanded ? null : a.id)}
                  className="text-left text-white/60 hover:text-white/90 transition-colors cursor-pointer"
                  title={a.interest}
                >
                  {isExpanded ? a.interest : interestShort}
                </button>
              </td>
            </tr>
          );
        })
      )}
    </TableShell>
  );
}
