export async function getSupporterCount(): Promise<number> {
  try {
    const res = await fetch("/api/supporters/count", { credentials: "include" });
    const data = await res.json();
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

export async function submitSupporter(
  email: string,
  message?: string,
  honeypot?: string
): Promise<{
  success: boolean;
  duplicate: boolean;
  count: number;
  error?: string;
}> {
  try {
    const res = await fetch("/api/supporters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, message, website: honeypot }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        duplicate: false,
        count: 0,
        error: data.error || "Something went wrong.",
      };
    }
    return {
      success: data.success ?? false,
      duplicate: data.duplicate ?? false,
      count: data.count ?? 0,
    };
  } catch {
    return {
      success: false,
      duplicate: false,
      count: 0,
      error: "Something went wrong. Please try again in a moment.",
    };
  }
}
