/** `notifications` domain module — server-side emit + user-scoped repo. */
export { notify, notificationsRepo, toNotification } from './service.js';
export type { NotifyInput, NotifyTarget } from '@/types/index.js';
export type { NotificationRow, NewNotificationRow } from './schema.js';
