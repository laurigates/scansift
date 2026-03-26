/**
 * Zod validation schemas for API request/response types.
 */

import { VALID_RESOLUTIONS } from '@shared/constants';
import { z } from 'zod';

/** Schema for scan request body (front and back endpoints) */
export const scanRequestSchema = z.object({
  resolution: z
    .union([z.literal(VALID_RESOLUTIONS[0]), z.literal(VALID_RESOLUTIONS[1])])
    .optional(),
});

export type ScanRequestBody = z.infer<typeof scanRequestSchema>;

/** Schema for position parameter */
export const positionParamSchema = z.object({
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
});

export type PositionParam = z.infer<typeof positionParamSchema>;
