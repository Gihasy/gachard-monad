"use client";

/**
 * The name strangers see on your cards.
 *
 * Shown under the email in the profile header, because it is part of who you
 * are on Gachard, but labelled for what it actually does: anyone who scans one
 * of your cards sees this in its history. Until a name is chosen they see an
 * anonymous label, and this field shows that label too — the user should know
 * exactly what a stranger sees, not be told "no name set".
 *
 * The username is not offered as a default or a suggestion. It is the email's
 * local part, and keeping it off public pages is the reason this field exists.
 *
 * Once chosen, a name can be made private: scans show the anonymous label, but
 * the name stays reserved for its owner. There is deliberately no "remove"
 * button here — hiding and giving up a name are different acts, and only the
 * first is something a person usually means when they want to go quiet.
 */
import { useEffect, useState } from "react";

export default function PublicNameField() {
  const [name, setName] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [fallback, setFallback] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/display-name", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || d.error) return;
        setName(d.displayName);
        setHidden(d.hidden === true);
        setFallback(d.fallback);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
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
      setName(d.displayName);
      setHidden(d.hidden === true);
      setFallback(d.fallback);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that name.");
    } finally {
      setSaving(false);
    }
  };

  const save = (value: string) => send({ displayName: value });

  if (!loaded) return null;

  if (editing) {
    return (
      <div className="mt-2" data-testid="public-name-editor">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) save(draft);
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={24}
            autoFocus
            placeholder="Choose a public name"
            className="form-field !py-1.5 !text-sm flex-1 min-w-0"
            data-testid="public-name-input"
          />
          <button
            onClick={() => save(draft)}
            disabled={saving || !draft.trim()}
            className="btn-primary !py-1.5 !px-3 !text-xs disabled:opacity-50"
            data-testid="public-name-save"
          >
            {saving ? "…" : "Save"}
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
        <p className="text-[0.65rem] mt-1.5" style={{ color: error ? "var(--aurora-pink)" : "var(--text-tertiary)" }}>
          {error ?? "3 to 24 letters, numbers, spaces, dots, hyphens or underscores."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-2 flex-wrap" data-testid="public-name">
      <span className="text-[0.65rem] uppercase tracking-widest text-white/40">Public name</span>
      <span className={`text-sm ${name && !hidden ? "text-white/90" : "text-white/50"}`} data-testid="public-name-value">
        {name ?? fallback}
      </span>
      {name && (
        <span
          className="text-[0.55rem] uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={hidden
            ? { background: "rgba(255,255,255,0.06)", color: "var(--text-tertiary)" }
            : { background: "rgba(0,255,136,0.12)", color: "#00ff88" }}
          data-testid="public-name-visibility"
        >
          {hidden ? "Private" : "Public"}
        </span>
      )}
      <button
        onClick={() => {
          setDraft(name ?? "");
          setError(null);
          setEditing(true);
        }}
        className="text-[0.65rem] underline underline-offset-2 text-white/50 hover:text-white/80"
        data-testid="public-name-edit"
      >
        {name ? "Change" : "Choose a name"}
      </button>
      {name && (
        <button
          onClick={() => send({ hidden: !hidden })}
          disabled={saving}
          className="text-[0.65rem] underline underline-offset-2 text-white/40 hover:text-white/70 disabled:opacity-50"
          data-testid="public-name-toggle"
        >
          {hidden ? "Make public" : "Make private"}
        </button>
      )}
      <p className="w-full text-[0.65rem] text-white/35">
        {name && hidden
          ? `Private. Scans of your cards show ${fallback}, and the name stays reserved for you.`
          : "Anyone who scans one of your cards sees this in its history."}
      </p>
      {error && (
        <p className="w-full text-[0.65rem]" style={{ color: "var(--aurora-pink)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
