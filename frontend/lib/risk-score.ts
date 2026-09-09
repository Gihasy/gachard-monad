import { TradeSignals } from "./fraud-signals";

const MIMO_API_KEY = process.env.MIMO_API_KEY!;
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || "https://token-plan-sgp.xiaomimimo.com/v1";
const MIMO_MODEL = process.env.MIMO_MODEL || "MiMo-V2.5-Pro";
const FLAGGED_THRESHOLD = 70;

export interface RiskResult {
  riskScore: number;
  flagged: boolean;
  reasoning: string;
}

export async function calculateRiskScore(signals: TradeSignals): Promise<RiskResult> {
  // Skip AI for trivial cases — no meaningful data
  if (
    signals.repeatPairCount === 0 &&
    signals.priceDeviationPct < 5 &&
    signals.resaleSpeedHours === null
  ) {
    return { riskScore: 0, flagged: false, reasoning: "No suspicious signals detected" };
  }

  const resaleInfo =
    signals.resaleSpeedHours !== null
      ? `${Math.round(signals.resaleSpeedHours)} jam`
      : "tidak diketahui (seller bukan dari pembelian marketplace)";

  const prompt = `Berdasarkan sinyal transaksi kartu koleksi berikut: pasangan wallet ini sudah bertransaksi ${signals.repeatPairCount} kali dalam 30 hari, harga menyimpang ${signals.priceDeviationPct.toFixed(1)}% dari nilai pasar wajar, kartu dijual ulang ${resaleInfo} setelah dibeli. Berikan skor risiko wash-trading 0-100 (0=aman, 100=sangat mencurigakan) dan alasan singkat 1 kalimat. Return JSON: {"riskScore": number, "reasoning": string}`;

  try {
    const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MIMO_API_KEY}`,
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages: [
          { role: "system", content: "You are a fraud detection analyst. Respond only with valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      throw new Error(`MiMo API ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content?.trim() ?? "";

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { riskScore: 0, flagged: false, reasoning: "AI response parsing failed" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(100, Math.round(parsed.riskScore || 0)));
    const reasoning = String(parsed.reasoning || "No reasoning provided");

    return {
      riskScore: score,
      flagged: score >= FLAGGED_THRESHOLD,
      reasoning,
    };
  } catch (err) {
    console.error("[risk-score] MiMo call failed:", err);
    return { riskScore: 0, flagged: false, reasoning: "AI scoring unavailable" };
  }
}
