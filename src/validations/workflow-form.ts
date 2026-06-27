/**
 * Zod schemas for the interactive workflow form-input step.
 */

import { z } from 'zod';

/** Submission body — raw values keyed by field key. Validation against the
 * stored field defs (required / type coercion) happens in the submit route. */
export const submitWorkflowFormSchema = z.object({
  values: z.record(z.string(), z.unknown()),
});

export type SubmitWorkflowFormInput = z.infer<typeof submitWorkflowFormSchema>;
