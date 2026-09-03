export function validateEvidenceReferences(
  output: { readonly productId: string; readonly evidenceRefs: readonly string[] },
  context: { readonly productId: string; readonly allowedEvidenceRefs: ReadonlySet<string> },
): readonly string[] {
  const issues: string[] = [];
  if (output.productId !== context.productId) issues.push('cross_product_reference');
  if (output.evidenceRefs.some((reference) => !context.allowedEvidenceRefs.has(reference))) {
    issues.push('unsupported_evidence');
  }
  if (output.evidenceRefs.length === 0) issues.push('unsupported_claim');
  return issues;
}
