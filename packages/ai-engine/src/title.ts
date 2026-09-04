import {
  TITLE_VARIANTS,
  parseUuidV7,
  type PlatformId,
  type TitleCandidate,
  type TitleValidationIssue,
  type UuidV7,
} from '@eaw/domain';
import { z } from 'zod';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UuidSchema = z.string().regex(UUID_V7).transform(parseUuidV7);
const EvidenceSchema = z
  .object({ kind: z.literal('product_fact'), id: UuidSchema, productId: UuidSchema })
  .strict();
const CandidateSchema: z.ZodType<TitleCandidate> = z
  .object({
    variant: z.enum(TITLE_VARIANTS),
    text: z.string().trim().min(1).max(300),
    keywords: z.array(z.string().trim().min(1).max(80)).max(20),
    claims: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(160),
            evidenceRefs: z.array(EvidenceSchema).max(20),
          })
          .strict(),
      )
      .max(20),
    reviewTerms: z.array(z.string().trim().min(1).max(80)).max(20),
  })
  .strict();

export interface TitleGenerationOutput {
  readonly productId: UuidV7;
  readonly titles: readonly TitleCandidate[];
}

export const TitleGenerationOutputSchema: z.ZodType<TitleGenerationOutput> = z
  .object({ productId: UuidSchema, titles: z.array(CandidateSchema).length(4) })
  .strict();

const maxLength: Record<PlatformId, number> = { pinduoduo: 60, taobao: 60, douyin: 30 };
const forbiddenTerms = ['国家级', '第一', '100%', '绝对'];

export function validateTitleOutput(
  value: TitleGenerationOutput,
  context: {
    readonly productId: UuidV7;
    readonly platformId: PlatformId;
    readonly allowedFactRefs: ReadonlySet<string>;
  },
): readonly TitleValidationIssue[] {
  const issues: TitleValidationIssue[] = [];
  const variants = new Set(value.titles.map(({ variant }) => variant));
  const normalizedTitles = new Set<string>();
  value.titles.forEach((title, candidateIndex) => {
    const add = (code: TitleValidationIssue['code'], detail: string) =>
      issues.push({ candidateIndex, code, detail });
    if (Array.from(title.text).length > maxLength[context.platformId]) {
      add('length_exceeded', `标题超过本地限制 ${maxLength[context.platformId]} 字符`);
    }
    const normalized = title.text.replace(/\s+/gu, '').toLocaleLowerCase('zh-CN');
    if (normalizedTitles.has(normalized)) add('duplicate_title', '标题与同批候选重复');
    normalizedTitles.add(normalized);
    const forbidden = forbiddenTerms.find((term) => title.text.includes(term));
    if (forbidden) add('forbidden_term', `包含本地禁用词：${forbidden}`);
    for (const claim of title.claims) {
      if (
        claim.evidenceRefs.length === 0 ||
        claim.evidenceRefs.some(
          (reference) =>
            reference.productId !== context.productId || !context.allowedFactRefs.has(reference.id),
        )
      ) {
        add('unsupported_claim', `主张缺少当前商品事实证据：${claim.text}`);
      }
    }
    for (const term of title.reviewTerms) add('review_term', `词语需要人工核实：${term}`);
  });
  if (value.productId !== context.productId) {
    issues.push({ candidateIndex: 0, code: 'unsupported_claim', detail: '输出商品归属不符' });
  }
  if (TITLE_VARIANTS.some((variant) => !variants.has(variant))) {
    issues.push({ candidateIndex: 0, code: 'duplicate_title', detail: '四类标题候选不完整' });
  }
  return issues;
}
