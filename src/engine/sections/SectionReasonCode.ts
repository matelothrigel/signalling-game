/**
 * Stable reason codes for section-state-store rejections.
 * Same pattern as switches/signals/routes.
 */

import { type EngineError, engineError } from '@/types/result';

export const SectionReasonCode = {
  UNKNOWN: 'SECTION_UNKNOWN',
} as const;

export type SectionReasonCode = (typeof SectionReasonCode)[keyof typeof SectionReasonCode];

export const sectionReasonMessage = (
  code: SectionReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): string => {
  const id = String(context.sectionId ?? '?');
  switch (code) {
    case SectionReasonCode.UNKNOWN:
      return `Unknown section ${id}`;
    default:
      return `Section ${id}: ${code}`;
  }
};

export const sectionError = (
  code: SectionReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): EngineError => engineError(code, sectionReasonMessage(code, context), context);
