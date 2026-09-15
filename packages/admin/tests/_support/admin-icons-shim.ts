/**
 * Shim for virtual:astromech/admin-icons under vitest: one icon, so a test can
 * tell a configured icon from the fallback.
 */
import type { LucideIcon } from 'lucide-react';
import { FileText } from 'lucide-react';

const icons: Record<string, LucideIcon> = { FileText };

export default icons;
