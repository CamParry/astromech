/** `notifications` domain module — server-side emit + user-scoped service. */
export { notify, notificationsService, toNotification } from './service';
export type { NotificationsDomainService } from './service';
export { currentUserNotificationsService } from './current-user-service';
export { notificationsContract } from './methods';
export { setNotifyAccess } from './plugin-access';
export type { NotifyInput, NotifyTarget } from '@/types/index';
export type { NotificationRow, NewNotificationRow } from './schema';
