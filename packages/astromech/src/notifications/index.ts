/** `notifications` domain module — server-side emit + user-scoped service. */
export { notify, notificationsService, toNotification } from './service';
export type { NotifyInput, NotifyTarget } from '@/types/index';
export type { NotificationRow, NewNotificationRow } from './schema';
