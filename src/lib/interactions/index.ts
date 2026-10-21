import { prisma } from "@/lib/database/client";
import { normalizeDrugName, pairKey, splitCombination } from "./normalize";
import type { DrugInteractionInput, DrugInteractionProvider, InteractionFinding } from "./types";
import type { InteractionSeverity } from "@/types/domain";

export * from "./types";
export { normalizeDrugName, pairKey, splitCombination } from "./normalize";

/**
 * Drug-interaction checking.
 *
 * DEMO DATASET: `DemoInteractionProvider` reads the DrugInteraction table that
 * is seeded with a deliberately tiny, hand-written list. It is NOT a clinical
 * reference and the UI says so. The provider interface is the same shape a
 * verified service (RxNav/DrugBank/First Databank/ABDM drug registry) returns,
 * so swapping it is a single environment variable plus one adapter file.
 *
 * Product rule enforced here and in the UI: findings never tell a user to stop
 * or change a medicine — they always route back to a doctor or pharmacist.
 */

export class DemoInteractionProvider implements DrugInteractionProvider {
  readonly name = "Demo interaction dataset";
  readonly isVerifiedSource = false;

  async check(input: DrugInteractionInput): Promise<InteractionFinding[]> {
    const medicines = input.medicines
      .map((medicine) => ({ ...medicine, normalized: normalizeDrugName(medicine.name) }))
      .filter((medicine) => medicine.normalized.length > 1);

    const pairs: { a: (typeof medicines)[number]; b: (typeof medicines)[number] }[] = [];
    for (let i = 0; i < medicines.length; i += 1) {
      for (let j = i + 1; j < medicines.length; j += 1) {
        pairs.push({ a: medicines[i], b: medicines[j] });
      }
    }

    // Expand combination products (e.g. "Augmentin" → amoxicillin + clavulanate)
    // and include their constituents when looking for known interactions.
    const expanded = pairs.map(({ a, b }) => ({
      a,
      b,
      keys: [
        pairKey(a.normalized, b.normalized),
        ...splitCombination(a.normalized).flatMap((sa) =>
          splitCombination(b.normalized).map((sb) => pairKey(sa, sb)),
        ),
      ],
    }));

    const wanted = [...new Set(expanded.flatMap((pair) => pair.keys))];
    if (!wanted.length) return [];

    const rows = await prisma.drugInteraction.findMany({ where: { pairKey: { in: wanted } } });
    const byKey = new Map(rows.map((row) => [row.pairKey, row]));

    const findings: InteractionFinding[] = [];
    // One finding per medicine pair, even when several alias keys match
    // ("Crocin + Brufen" and "Paracetamol + Ibuprofen" are the same pair).
    const reportedPairs = new Set<string>();
    for (const pair of expanded) {
      for (const key of pair.keys) {
        const row = byKey.get(key);
        if (!row) continue;
        const canonical = pairKey(normalizeDrugName(pair.a.name), normalizeDrugName(pair.b.name));
        if (reportedPairs.has(canonical)) continue;
        reportedPairs.add(canonical);
        findings.push({
          medicineA: pair.a.name,
          medicineB: pair.b.name,
          severity: (row.severity as InteractionSeverity) ?? "UNKNOWN",
          description: row.description,
          action: row.action,
          source: row.source,
        });
      }
    }

    return findings;
  }
}

/**
 * RxNav (US NLM) adapter — free, no key required.
 * Enable with INTERACTION_PROVIDER=rxnav. Kept deliberately small: it shows
 * exactly what a verified integration looks like behind the same interface.
 */
/** `RXNAV_BASE_URL` lets a deployment point at a mirror or proxy; default is the public NLM API. */
function rxnavBase(): string {
  return (process.env.RXNAV_BASE_URL ?? "https://rxnav.nlm.nih.gov/REST").replace(/\/$/, "");
}

export class RxNavInteractionProvider implements DrugInteractionProvider {
  readonly name = "RxNav (NLM) drug interaction API";
  readonly isVerifiedSource = true;

  async check(input: DrugInteractionInput): Promise<InteractionFinding[]> {
    const names = input.medicines.map((medicine) => medicine.name);
    if (names.length < 2) return [];

    const rxcuis: { name: string; rxcui: string }[] = [];
    for (const name of names) {
      const url = `${rxnavBase()}/rxcui.json?name=${encodeURIComponent(name)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;
      const payload = (await response.json()) as { idGroup?: { rxnormId?: string[] } };
      const rxcui = payload.idGroup?.rxnormId?.[0];
      if (rxcui) rxcuis.push({ name, rxcui });
    }
    if (rxcuis.length < 2) return [];

    const listUrl = `${rxnavBase()}/interaction/list.json?rxcuis=${rxcuis
      .map((entry) => entry.rxcui)
      .join("+")}`;
    const response = await fetch(listUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      fullInteractionTypeGroup?: {
        fullInteractionType?: {
          interactionPair?: {
            interactionConcept?: { minConceptItem?: { name?: string } }[];
            severity?: string;
            description?: string;
          }[];
        }[];
      }[];
    };

    const findings: InteractionFinding[] = [];
    for (const group of payload.fullInteractionTypeGroup ?? []) {
      for (const type of group.fullInteractionType ?? []) {
        for (const pair of type.interactionPair ?? []) {
          const [first, second] = pair.interactionConcept ?? [];
          const nameA = first?.minConceptItem?.name;
          const nameB = second?.minConceptItem?.name;
          if (!nameA || !nameB) continue;
          findings.push({
            medicineA: nameA,
            medicineB: nameB,
            severity: mapSeverity(pair.severity),
            description:
              pair.description ??
              "A potential interaction is listed for this combination. It should be reviewed by a qualified doctor or pharmacist.",
            action: "Discuss this combination with your doctor or pharmacist before making any change.",
            source: "RxNav / DrugBank-derived interaction list",
          });
        }
      }
    }
    return findings;
  }
}

function mapSeverity(value: string | undefined): InteractionSeverity {
  switch ((value ?? "").toLowerCase()) {
    case "high":
      return "MAJOR";
    case "moderate":
      return "MODERATE";
    case "low":
      return "MINOR";
    default:
      return "UNKNOWN";
  }
}

let cached: DrugInteractionProvider | null = null;

export function getInteractionProvider(): DrugInteractionProvider {
  if (cached) return cached;
  const requested = (process.env.INTERACTION_PROVIDER ?? "demo").toLowerCase();
  if (requested === "rxnav") {
    cached = new RxNavInteractionProvider();
    return cached;
  }
  cached = new DemoInteractionProvider();
  return cached;
}

export function resetInteractionProviderCache() {
  cached = null;
}

/** "Potential interaction detected." — never "dangerous". */
export function interactionHeadline(count: number) {
  return count > 0 ? "⚠️ Potential interaction detected." : null;
}
