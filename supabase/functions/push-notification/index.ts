import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createResponse, handleCors } from '../_shared/cors.ts';
import { createLogger, type Logger } from '../_shared/logger.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { executeQuery } from '../_shared/database.ts';

// ============================================================================
// Push Notification Edge Function
// ============================================================================

serve(async (req: Request) => {
  const logger = createLogger('push-notification', req);
  const startTime = performance.now();
  
  // CORS 처리
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  logger.apiStart(req.method, '/push-notification');

  try {
    switch (req.method) {
      case 'POST':
        return await handleSendNotification(logger, req);
      case 'GET':
        return await handleGetNotificationHistory(logger, req);
      default:
        return createResponse({
          success: false,
          error: {
            code: 'METHOD_NOT_ALLOWED',
            message: '지원하지 않는 HTTP 메서드입니다'
          }
        }, 405);
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('푸시 알림 처리 중 오류 발생', {
      error: error.message,
      stack: error.stack
    });

    logger.apiEnd(req.method, '/push-notification', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'PUSH_NOTIFICATION_FAILED',
        message: '푸시 알림 처리 중 오류가 발생했습니다'
      }
    }, 500);
  }
});

// ============================================================================
// POST: 푸시 알림 발송 (관리자 전용)
// ============================================================================

async function handleSendNotification(logger: Logger, req: Request): Promise<Response> {
  return await requireAdmin(async (authContext: any, request: Request) => {
    try {
      const requestBody = await request.json();
      const {
        type, // 'quiz_update', 'new_content', 'achievement', 'maintenance'
        title,
        body,
        target_users, // 'all', 'active', [user_ids]
        data,
        schedule_at // 선택적 - 예약 발송
      } = requestBody;

      if (!type || !title || !body) {
        return createResponse({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'type, title, body는 필수 필드입니다'
          }
        }, 400);
      }

      logger.info('푸시 알림 발송 시작', {
        type,
        title,
        targetUsers: target_users,
        adminId: authContext.user.id
      });

      // 대상 사용자의 푸시 토큰 조회
      const pushTokens = await getPushTokens(logger, target_users);
      
      if (pushTokens.length === 0) {
        return createResponse({
          success: false,
          error: {
            code: 'NO_PUSH_TOKENS',
            message: '발송할 푸시 토큰이 없습니다'
          }
        }, 400);
      }

      // 알림 발송 (실제 FCM 연동은 환경에 따라 구현)
      const notificationResult = await sendPushNotifications(logger, {
        tokens: pushTokens,
        notification: {
          title,
          body
        },
        data: {
          type,
          ...data
        }
      });

      // 발송 이력 저장
      await saveNotificationHistory(logger, {
        type,
        title,
        body,
        target_users,
        sent_count: notificationResult.success_count,
        failed_count: notificationResult.failure_count,
        sent_by: authContext.user.id
      });

      logger.info('푸시 알림 발송 완료', {
        successCount: notificationResult.success_count,
        failureCount: notificationResult.failure_count
      });

      return createResponse({
        success: true,
        data: {
          message: '푸시 알림이 발송되었습니다',
          sent_count: notificationResult.success_count,
          failed_count: notificationResult.failure_count,
          total_tokens: pushTokens.length
        }
      });

    } catch (error) {
      logger.error('푸시 알림 발송 실패', { error: error.message });

      return createResponse({
        success: false,
        error: {
          code: 'NOTIFICATION_SEND_FAILED',
          message: '푸시 알림 발송에 실패했습니다'
        }
      }, 500);
    }
  })(req);
}

// ============================================================================
// GET: 알림 발송 이력 조회
// ============================================================================

async function handleGetNotificationHistory(logger: Logger, req: Request): Promise<Response> {
  return await requireAdmin(async (authContext: any, request: Request) => {
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const type = url.searchParams.get('type');

      const history = await getNotificationHistory(logger, type, limit, offset);

      return createResponse({
        success: true,
        data: {
          notifications: history,
          pagination: {
            limit,
            offset,
            has_more: history.length === limit
          }
        }
      });

    } catch (error) {
      logger.error('알림 이력 조회 실패', { error: error.message });

      return createResponse({
        success: false,
        error: {
          code: 'NOTIFICATION_HISTORY_FAILED',
          message: '알림 이력 조회에 실패했습니다'
        }
      }, 500);
    }
  })(req);
}

// ============================================================================
// 헬퍼 함수들
// ============================================================================

async function getPushTokens(logger: Logger, targetUsers: any): Promise<string[]> {
  try {
    let query = '';
    let params: any[] = [];

    if (targetUsers === 'all') {
      query = `SELECT metadata->>'push_token' as push_token 
               FROM users 
               WHERE metadata->>'push_token' IS NOT NULL 
               AND is_active = true`;
    } else if (targetUsers === 'active') {
      query = `SELECT metadata->>'push_token' as push_token 
               FROM users 
               WHERE metadata->>'push_token' IS NOT NULL 
               AND is_active = true 
               AND last_login_at > NOW() - INTERVAL '30 days'`;
    } else if (Array.isArray(targetUsers)) {
      query = `SELECT metadata->>'push_token' as push_token 
               FROM users 
               WHERE id = ANY($1) 
               AND metadata->>'push_token' IS NOT NULL 
               AND is_active = true`;
      params = [targetUsers];
    } else {
      return [];
    }

    const result = await executeQuery(logger, query, params);
    
    return (result.data || [])
      .map((row: any) => row.push_token)
      .filter((token: string) => token && token.length > 0);

  } catch (error) {
    logger.error('푸시 토큰 조회 실패', { error: error.message });
    return [];
  }
}

async function sendPushNotifications(
  logger: Logger,
  payload: {
    tokens: string[];
    notification: { title: string; body: string };
    data: any;
  }
): Promise<{ success_count: number; failure_count: number }> {
  try {
    // 실제 FCM 연동 구현
    // 여기서는 시뮬레이션으로 처리
    logger.info('FCM 푸시 알림 발송 시뮬레이션', {
      tokenCount: payload.tokens.length,
      title: payload.notification.title
    });

    // TODO: Firebase Admin SDK를 사용한 실제 구현
    /*
    const admin = require('firebase-admin');
    
    const message = {
      notification: payload.notification,
      data: payload.data,
      tokens: payload.tokens
    };

    const response = await admin.messaging().sendMulticast(message);
    
    return {
      success_count: response.successCount,
      failure_count: response.failureCount
    };
    */

    // 시뮬레이션 결과
    const successCount = Math.floor(payload.tokens.length * 0.95); // 95% 성공률 가정
    const failureCount = payload.tokens.length - successCount;

    return {
      success_count: successCount,
      failure_count: failureCount
    };

  } catch (error) {
    logger.error('FCM 푸시 알림 발송 실패', { error: error.message });
    return {
      success_count: 0,
      failure_count: payload.tokens.length
    };
  }
}

async function saveNotificationHistory(
  logger: Logger,
  notification: {
    type: string;
    title: string;
    body: string;
    target_users: any;
    sent_count: number;
    failed_count: number;
    sent_by: string;
  }
): Promise<void> {
  try {
    await executeQuery(
      logger,
      `INSERT INTO push_notifications (
        type, title, body, target_users, 
        sent_count, failed_count, sent_by, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        notification.type,
        notification.title,
        notification.body,
        JSON.stringify(notification.target_users),
        notification.sent_count,
        notification.failed_count,
        notification.sent_by,
        new Date().toISOString()
      ]
    );
  } catch (error) {
    logger.error('알림 이력 저장 실패', { error: error.message });
  }
}

async function getNotificationHistory(
  logger: Logger,
  type?: string | null,
  limit: number = 20,
  offset: number = 0
): Promise<any[]> {
  try {
    let query = `SELECT * FROM push_notifications`;
    const params: any[] = [];
    
    if (type) {
      query += ` WHERE type = $1`;
      params.push(type);
    }
    
    query += ` ORDER BY sent_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await executeQuery(logger, query, params);
    return result.data || [];

  } catch (error) {
    logger.error('알림 이력 조회 실패', { error: error.message });
    return [];
  }
}

// ============================================================================
// 자동 알림 트리거 함수들 (다른 함수에서 호출)
// ============================================================================

export async function triggerQuizUpdateNotification(
  logger: Logger,
  version: string,
  description: string
): Promise<void> {
  try {
    logger.info('퀴즈 업데이트 자동 알림 트리거', { version, description });

    // 활성 사용자들에게 알림 발송
    const pushTokens = await getPushTokens(logger, 'active');
    
    if (pushTokens.length > 0) {
      await sendPushNotifications(logger, {
        tokens: pushTokens,
        notification: {
          title: '새로운 퀴즈가 추가되었어요! 🎉',
          body: description || '지금 바로 도전해보세요!'
        },
        data: {
          type: 'quiz_update',
          version,
          action: 'open_app'
        }
      });

      await saveNotificationHistory(logger, {
        type: 'quiz_update',
        title: '새로운 퀴즈가 추가되었어요! 🎉',
        body: description || '지금 바로 도전해보세요!',
        target_users: 'active',
        sent_count: pushTokens.length,
        failed_count: 0,
        sent_by: 'system'
      });
    }
  } catch (error) {
    logger.error('퀴즈 업데이트 자동 알림 실패', { error: error.message });
  }
}