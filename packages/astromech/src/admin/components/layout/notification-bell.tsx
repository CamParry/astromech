/**
 * Notification bell with unread badge and dropdown panel.
 *
 * The unread count polls every 30s always. The notification list is fetched
 * lazily — only when the dropdown is open.
 */

import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Menu } from '@base-ui/react/menu';
import { Bell, X } from 'lucide-react';
import type { Notification } from '@/types/index.js';
import {
    useUnreadCount,
    useNotifications,
    useMarkRead,
    useMarkAllRead,
    useDismiss,
    useDismissAll,
} from '../../hooks/notifications.js';

// ============================================================================
// Relative time formatter
// ============================================================================

function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    if (seconds < 60) return rtf.format(-seconds, 'second');
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    if (hours < 24) return rtf.format(-hours, 'hour');
    return rtf.format(-days, 'day');
}

// ============================================================================
// Notification row
// ============================================================================

type NotificationRowProps = {
    notification: Notification;
    onDismiss: (id: string) => void;
    onClick: (notification: Notification) => void;
};

function NotificationRow({ notification, onDismiss, onClick }: NotificationRowProps) {
    const { t } = useTranslation();
    const isUnread = notification.readAt === null;

    function handleDismiss(e: React.MouseEvent) {
        e.stopPropagation();
        onDismiss(notification.id);
    }

    return (
        <div
            className={['am-notif-row', isUnread ? 'am-notif-row--unread' : '']
                .filter(Boolean)
                .join(' ')}
            role="button"
            tabIndex={0}
            onClick={() => onClick(notification)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onClick(notification);
            }}
        >
            {isUnread && <span className="am-notif-row-dot" aria-hidden="true" />}
            <div className="am-notif-row-body">
                <span className="am-notif-row-title">{notification.title}</span>
                <span className="am-notif-row-message">{notification.message}</span>
                <span className="am-notif-row-time">
                    {formatRelativeTime(notification.createdAt)}
                </span>
            </div>
            <button
                type="button"
                className="am-notif-row-dismiss"
                aria-label={t('notifications.dismissLabel')}
                onClick={handleDismiss}
            >
                <X size={12} />
            </button>
        </div>
    );
}

// ============================================================================
// Bell component
// ============================================================================

export function NotificationBell() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    const { data: unreadCount = 0 } = useUnreadCount();
    const { data: items = [], isPending: isLoading } = useNotifications(undefined, open);

    const markRead = useMarkRead();
    const markAllRead = useMarkAllRead();
    const dismiss = useDismiss();
    const dismissAll = useDismissAll();

    const badgeCount =
        unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : null;

    function handleRowClick(notification: Notification) {
        if (notification.readAt === null) {
            markRead.mutate(notification.id);
        }
        if (notification.href !== null) {
            void navigate({ to: notification.href });
        }
    }

    function handleDismiss(id: string) {
        dismiss.mutate(id);
    }

    function handleMarkAllRead() {
        markAllRead.mutate();
    }

    function handleDismissAll() {
        dismissAll.mutate();
    }

    const isEmpty = !isLoading && items.length === 0;

    return (
        <Menu.Root open={open} onOpenChange={setOpen}>
            <Menu.Trigger
                render={<button type="button" />}
                className="am-topbar-action-btn am-notif-bell-trigger"
                aria-label={t('topbar.notificationsLabel')}
            >
                <Bell size={17} />
                {badgeCount !== null && (
                    <span className="am-notif-badge" aria-hidden="true">
                        {badgeCount}
                    </span>
                )}
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner
                    className="am-notif-positioner"
                    sideOffset={8}
                    align="end"
                >
                    <Menu.Popup
                        className="am-notif-panel"
                        aria-busy={isLoading ? 'true' : undefined}
                    >
                        <div className="am-notif-panel-header">
                            <span className="am-notif-panel-title">
                                {t('notifications.panelTitle')}
                            </span>
                            <div className="am-notif-panel-actions">
                                <button
                                    type="button"
                                    className="am-notif-panel-action"
                                    onClick={handleMarkAllRead}
                                    disabled={isEmpty || markAllRead.isPending}
                                >
                                    {t('notifications.markAllRead')}
                                </button>
                                <button
                                    type="button"
                                    className="am-notif-panel-action"
                                    onClick={handleDismissAll}
                                    disabled={isEmpty || dismissAll.isPending}
                                >
                                    {t('notifications.dismissAll')}
                                </button>
                            </div>
                        </div>
                        <div className="am-notif-list">
                            {isLoading ? (
                                <div className="am-notif-state">
                                    {t('common.loading')}
                                </div>
                            ) : isEmpty ? (
                                <div className="am-notif-state">
                                    {t('notifications.empty')}
                                </div>
                            ) : (
                                items.map((notification) => (
                                    <NotificationRow
                                        key={notification.id}
                                        notification={notification}
                                        onDismiss={handleDismiss}
                                        onClick={handleRowClick}
                                    />
                                ))
                            )}
                        </div>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
