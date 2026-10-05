/**
 * Security route: the block list and allow list, rendered by `SecurityPage`.
 */

import { createFileRoute } from '@tanstack/react-router';
import { SecurityPage } from '../../../components/security/security-page';

export const Route = createFileRoute('/_protected/security/')({
    component: SecurityPage,
});
