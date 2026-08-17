import { prisma } from '@/server/db/prisma';
import { NotificationType } from '@prisma/client';

export interface CreateNotificationParams {
  userId: string;
  organisationId?: string;
  type: NotificationType;
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
}

export class NotificationService {
  /**
   * Creates an in-app notification for a user
   */
  static async send(params: CreateNotificationParams) {
    return prisma.notification.create({
      data: {
        userId: params.userId,
        organisationId: params.organisationId,
        type: params.type,
        title: params.title,
        message: params.message,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      },
    });
  }

  /**
   * Lists notifications for a given user with pagination and unread counts
   */
  static async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notifications, totalCount, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({
        where: { userId },
      }),
      prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    };
  }

  /**
   * Marks a notification as read
   */
  static async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  }

  /**
   * Marks all notifications as read for a user
   */
  static async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
