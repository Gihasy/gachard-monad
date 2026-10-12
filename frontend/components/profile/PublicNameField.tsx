"use client";

/**
 * Who you are on Gachard: the profile header and the controls behind it.
 *
 * The header used to read `@username`, and the username is the email's local
 * part. It is now the name strangers see on your cards — your public name, or
 * the anonymous `Collector #…` label until you choose one — so the profile
 * shows the user exactly what a stranger sees, under the same heading.
 *
 * The username is not offered as a default or a suggestion. Keeping it off
 * public pages is the reason this field exists.
 *
 * **A name is chosen once.** Saving asks for confirmation first and says so,
 * because there is no undo. A change later needs a grant set on the account
 * (see `mayChangeName`); when one exists, "Change" appears.
 *
 * Once chosen, a name can be made private: scans show the anonymous label, but
 * the name stays reserved for its owner. Your own header keeps showing the
 * name, marked Private — this page is yours, not a public surface.
 *
 * Changes are announced with a `gachard:public-name` event so the navbar,
 * which shows the same name, does not go stale.
 */
import { useEffect, useState } from "react";

export const PUBLIC_NAME_EVENT = "gachard:public-name";

type State = { name: string | null; hidden: boolean; fallback: string; canChange: boolean };

export default function PublicNameField({
  email,
  onLabel,
}: {
  email?: string;
  onLabel?: (label: string) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (d: { displayName: string | null; hidden?: boolean; fallback: string; canChange?: boolean }) => {
    const next = { name: d.displayName, hidden: d.hidden === true, fallback: d.fallback, canChange: d.canChange === true };
    setState(next);
    const label = next.name ?? next.fallback;
    onLabel?.(label);
    window.dispatchEvent(new CustomEvent(PUBLIC_NAME_EVENT, { detail: label }));
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/display-name", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && !d.error) apply(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (body: { displayName: string } | { hidden: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/user/display-name", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not save that name.");
      apply(d);
      setEditing(false);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that name.");
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  const name = state?.name ?? null;
  const hidden = state?.hidden ?? false;
  const fallback = state?.fallback ?? "";

  const header = (
    <>
      <p
        className="font-display text-base sm:text-lg lg:text-xl text-white truncate"
        data-testid="profile-username"
        title={state ? `@${name ?? fallback}` : undefined}
      >
        @{state ? name ?? fallback : "…"}
      </p>
      {/* The anonymous label is the collector's permanent id, shown under a
          chosen name so its owner knows what scans fall back to. */}
      {name && (
        <p className="text-xs font-mono text-white/45 truncate" data-testid="profile-collector-id">
          {fallback}
        </p>
      )}
      {email && <p className="text-sm text-white/60 truncate">{email}</p>}
    </>
  );

  if (!state) return header;

  if (editing) {
    const trimmed = draft.trim();
    return (
      <>
        {header}
        <div className="mt-2" data-testid="public-name-editor">
          {confirming ? (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-white/80 w-full">
                Use <span className="font-semibold text-white">{trimmed}</span> as your public name?{" "}
                {name ? "This uses your one change." : "It can only be chosen once."}
              </p>
              <button
                onClick={() => send({ displayName: trimmed })}
                disabled={saving}
                className="btn-primary !py-1.5 !px-3 !text-xs disabled:opacity-50"
                data-testid="public-name-confirm"
              >
                {saving ? "…" : "Yes, use this name"}
              </button>
              <button onClick={() => setConfirming(false)} className="btn-ghost !py-1.5 !px-3 !text-xs">
                Back
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && trimmed) setConfirming(true);
                  if (e.key === "Escape") setEditing(false);
                }}
                maxLength={24}
                autoFocus
                placeholder="Choose a public name"
                className="form-field !py-1.5 !text-sm flex-1 min-w-0"
                data-testid="public-name-input"
              />
              <button
                onClick={() => setConfirming(true)}
                disabled={!trimmed}
                className="btn-primary !py-1.5 !px-3 !text-xs disabled:opacity-50"
                data-testid="public-name-save"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                className="btn-ghost !py-1.5 !px-3 !text-xs"
              >
                Cancel
              </button>
            </div>
          )}
          <p className="text-[0.65rem] mt-1.5" style={{ color: error ? "var(--aurora-pink)" : "var(--text-tertiary)" }}>
            {error ?? "3 to 24 letters, numbers, spaces, dots, hyphens or underscores. Chosen once, so choose carefully."}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="mt-1.5 flex items-center gap-2 flex-wrap" data-testid="public-name">
        {name ? (
          <>
            <span
              className="text-[0.55rem] uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={hidden
                ? { background: "rgba(255,255,255,0.06)", color: "var(--text-tertiary)" }
                : { background: "rgba(0,255,136,0.12)", color: "#00ff88" }}
              data-testid="public-name-visibility"
            >
              {hidden ? "Private" : "Public"}
            </span>
            <button
              onClick={() => send({ hidden: !hidden })}
              disabled={saving}
              className="text-[0.65rem] underline underline-offset-2 text-white/50 hover:text-white/80 disabled:opacity-50"
              data-testid="public-name-toggle"
            >
              {hidden ? "Make public" : "Make private"}
            </button>
            {state.canChange && (
              <button
                onClick={() => {
                  setDraft(name);
                  setError(null);
                  setEditing(true);
                }}
                className="text-[0.65rem] underline underline-offset-2 text-white/40 hover:text-white/70"
                data-testid="public-name-edit"
              >
                Change
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => {
              setDraft("");
              setError(null);
              setEditing(true);
            }}
            className="text-[0.65rem] underline underline-offset-2 text-white/60 hover:text-white/90"
            data-testid="public-name-edit"
          >
            Choose a public name
          </button>
        )}
        <p className="w-full text-[0.65rem] text-white/35">
          {!name
            ? "This is what anyone who scans one of your cards sees. You can choose a public name once."
            : hidden
              ? `Private. Scans of your cards show ${fallback}, and the name stays reserved for you.`
              : "Anyone who scans one of your cards sees this name in its history."}
        </p>
        {error && (
          <p className="w-full text-[0.65rem]" style={{ color: "var(--aurora-pink)" }}>
            {error}
          </p>
        )}
      </div>
    </>
  );
}
