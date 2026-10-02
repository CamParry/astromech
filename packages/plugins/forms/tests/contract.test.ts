/**
 * The checks every first-party plugin passes, run against this one. The cases
 * live in `packages/astromech/tests/_support/plugin-contract.ts`.
 */

import { describePluginContract } from '@tests/plugin-contract';
import { forms } from '../src/index';

describePluginContract('forms', forms(), new URL('..', import.meta.url));
