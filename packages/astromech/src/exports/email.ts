/** `astromech/email` — email rendering & drivers. */

export type { EmailTemplateOverride } from '@/types/plugins';
export { BaseLayout } from '@/email/components/base-layout';
export { PasswordResetEmail } from '@/email/components/password-reset';
export { renderEmail } from '@/email/render';
