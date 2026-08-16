import type { CreativeBatch, EvidenceRecord } from "../schemas.ts";

export interface ValidationIssue {
  conceptId: string;
  message: string;
}

export function validateBatchGrounding(
  batch: CreativeBatch,
  evidence: EvidenceRecord[],
): ValidationIssue[] {
  const evidenceIds = new Set(evidence.map(({ id }) => id));
  const issues: ValidationIssue[] = [];

  for (const concept of batch.concepts) {
    for (const evidenceId of concept.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push({
          conceptId: concept.id,
          message: `Unknown evidence ID: ${evidenceId}`,
        });
      }
    }
    for (const claim of concept.claims) {
      if (!evidenceIds.has(claim.evidenceId)) {
        issues.push({
          conceptId: concept.id,
          message: `Claim has unknown evidence ID: ${claim.evidenceId}`,
        });
      }
    }
  }
  return issues;
}
