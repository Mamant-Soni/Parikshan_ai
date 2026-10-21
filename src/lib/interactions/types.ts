import type { InteractionFinding, InteractionSeverity } from "@/types/domain";

export type DrugInteractionInput = {
  medicines: { id?: string; name: string; dosage?: string | null }[];
};

export interface DrugInteractionProvider {
  readonly name: string;
  /** False for the demo dataset — surfaced in the UI so nothing is oversold. */
  readonly isVerifiedSource: boolean;
  check(input: DrugInteractionInput): Promise<InteractionFinding[]>;
}

export type { InteractionFinding, InteractionSeverity };

export type InteractionCheckResult = {
  findings: InteractionFinding[];
  providerName: string;
  isVerifiedSource: boolean;
  checkedPairs: number;
  /** The dataset is deliberately incomplete; we say so instead of implying safety. */
  disclaimer: string;
};
