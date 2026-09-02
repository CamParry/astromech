import type { TypedGlobalsService } from '@/types/index';
import { globalsService } from './service';

/**
 * `globalsService` under its typed facade. `TypedGlobalsService` layers
 * compile-time literal overloads over the wide runtime `GlobalsService`, so this
 * is the one acknowledged place the cast happens — build consumer handles from it.
 */
export const typedGlobalsService = globalsService as unknown as TypedGlobalsService;
