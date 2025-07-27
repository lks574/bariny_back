import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createResponse, handleCors } from '../_shared/cors.ts';
import { createLogger, type Logger } from '../_shared/logger.ts';
import { verifyAuthToken } from '../_shared/auth.ts';
import { executeQuery } from '../_shared/database.ts';

// ============================================================================
// App Launch Sync Edge Function
// ============================================================================

serve(async (req: Request) => {
  const logger = createLogger('app-sync', req);
  const startTime = performance.now();
  
  // CORS 처리
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return createResponse({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'POST 메서드만 지원됩니다'
      }
    }, 405);
  }

  logger.apiStart(req.method, '/app-sync');

  try {
    // 인증 검증 (선택적 - 게스트도 동기화 가능)
    const authContext = await verifyAuthToken(logger, req);
    const userId = authContext.user?.id;

    const requestBody = await req.json();
    const {
      current_quiz_version,
      current_config_version,
      last_sync_timestamp,
      device_info
    } = requestBody;

    logger.info('앱 동기화 요청 시작', {
      userId,
      currentQuizVersion: current_quiz_version,
      currentConfigVersion: current_config_version,
      lastSyncTimestamp: last_sync_timestamp
    });

    // 동기화 결과 객체
    const syncResult = {
      quiz_data_updated: false,
      config_updated: false,
      user_progress_synced: false,
      leaderboard_refreshed: false,
      push_token_updated: false,
      updates: {} as any
    };

    // 1. 퀴즈 데이터 버전 체크
    const latestQuizVersion = await getLatestQuizVersion(logger);
    if (latestQuizVersion && latestQuizVersion !== current_quiz_version) {
      syncResult.quiz_data_updated = true;
      syncResult.updates.quiz_data = {
        new_version: latestQuizVersion,
        download_url: await getQuizDataDownloadUrl(logger, latestQuizVersion),
        update_message: '새로운 퀴즈가 추가되었습니다!'
      };
    }

    // 2. 앱 설정 버전 체크
    const latestConfigVersion = await getLatestConfigVersion(logger);
    if (latestConfigVersion && latestConfigVersion !== current_config_version) {
      syncResult.config_updated = true;
      syncResult.updates.config = {
        new_version: latestConfigVersion,
        config_url: await getConfigDownloadUrl(logger)
      };
    }

    // 3. 사용자 진행 상황 동기화 (인증된 사용자만)
    if (userId && last_sync_timestamp) {
      const progressUpdates = await getUserProgressUpdates(logger, userId, last_sync_timestamp);
      if (progressUpdates.length > 0) {
        syncResult.user_progress_synced = true;
        syncResult.updates.user_progress = progressUpdates;
      }
    }

    // 4. 리더보드 새로고침 (최신 데이터)
    const leaderboardData = await getLatestLeaderboard(logger);
    syncResult.leaderboard_refreshed = true;
    syncResult.updates.leaderboard = leaderboardData;

    // 5. 푸시 토큰 업데이트 (제공된 경우)
    if (userId && device_info?.push_token) {
      await updateUserPushToken(logger, userId, device_info.push_token, device_info);
      syncResult.push_token_updated = true;
    }

    const duration = performance.now() - startTime;
    logger.info('앱 동기화 완료', {
      userId,
      duration_ms: duration,
      updatesCount: Object.keys(syncResult.updates).length
    });

    logger.apiEnd(req.method, '/app-sync', 200, duration);

    return createResponse({
      success: true,
      data: {
        sync_result: syncResult,
        sync_timestamp: new Date().toISOString(),
        sync_triggers: {
          app_launch: 'completed',
          user_action_based: 'enabled',
          network_recovery: 'enabled',
          push_notification: 'enabled'
        }
      }
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('앱 동기화 처리 중 오류 발생', {
      error: error.message,
      stack: error.stack
    });

    logger.apiEnd(req.method, '/app-sync', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'APP_SYNC_FAILED',
        message: '앱 동기화 처리 중 오류가 발생했습니다'
      }
    }, 500);
  }
});

// ============================================================================
// 헬퍼 함수들
// ============================================================================

async function getLatestQuizVersion(logger: Logger): Promise<string | null> {
  try {
    const result = await executeQuery(
      logger,
      'SELECT version_number FROM quiz_versions WHERE is_active = true ORDER BY created_at DESC LIMIT 1',
      []
    );
    
    return result.data?.[0]?.version_number || null;
  } catch (error) {
    logger.error('최신 퀴즈 버전 조회 실패', { error: error.message });
    return null;
  }
}

async function getQuizDataDownloadUrl(logger: Logger, version: string): Promise<string> {
  try {
    const supabaseUrl = (globalThis as any).Deno.env.get('SUPABASE_URL');
    return `${supabaseUrl}/storage/v1/object/public/quiz-files/quiz_data_v${version}.json`;
  } catch (error) {
    logger.error('퀴즈 데이터 다운로드 URL 생성 실패', { error: error.message });
    return '';
  }
}

async function getLatestConfigVersion(logger: Logger): Promise<string | null> {
  try {
    // 설정 파일의 last_updated 타임스탬프를 버전으로 사용
    const supabaseUrl = (globalThis as any).Deno.env.get('SUPABASE_URL');
    const configUrl = `${supabaseUrl}/storage/v1/object/public/quiz-files/app-config.json`;
    
    const response = await fetch(configUrl, { method: 'HEAD' });
    const lastModified = response.headers.get('last-modified');
    
    return lastModified ? new Date(lastModified).getTime().toString() : null;
  } catch (error) {
    logger.error('최신 설정 버전 조회 실패', { error: error.message });
    return null;
  }
}

async function getConfigDownloadUrl(logger: Logger): Promise<string> {
  try {
    const supabaseUrl = (globalThis as any).Deno.env.get('SUPABASE_URL');
    return `${supabaseUrl}/storage/v1/object/public/quiz-files/app-config.json`;
  } catch (error) {
    logger.error('설정 다운로드 URL 생성 실패', { error: error.message });
    return '';
  }
}

async function getUserProgressUpdates(
  logger: Logger, 
  userId: string, 
  lastSyncTimestamp: string
): Promise<any[]> {
  try {
    const result = await executeQuery(
      logger,
      `SELECT qs.*, qr.* FROM quiz_sessions qs 
       LEFT JOIN quiz_results qr ON qs.session_id = qr.session_id
       WHERE qs.user_id = $1 AND qs.updated_at > $2
       ORDER BY qs.updated_at DESC LIMIT 50`,
      [userId, lastSyncTimestamp]
    );
    
    return result.data || [];
  } catch (error) {
    logger.error('사용자 진행 상황 업데이트 조회 실패', { error: error.message });
    return [];
  }
}

async function getLatestLeaderboard(logger: Logger): Promise<any> {
  try {
    const result = await executeQuery(
      logger,
      `SELECT u.display_name, u.avatar_url,
              COUNT(DISTINCT qs.session_id) as total_sessions,
              AVG(qs.score) as average_score,
              ROW_NUMBER() OVER (ORDER BY AVG(qs.score) DESC) as rank
       FROM users u
       JOIN quiz_sessions qs ON u.id = qs.user_id
       WHERE qs.status = 'completed' AND u.auth_provider != 'guest'
       GROUP BY u.id, u.display_name, u.avatar_url
       ORDER BY average_score DESC
       LIMIT 10`,
      []
    );
    
    return {
      top_players: result.data || [],
      updated_at: new Date().toISOString()
    };
  } catch (error) {
    logger.error('리더보드 조회 실패', { error: error.message });
    return { top_players: [], updated_at: new Date().toISOString() };
  }
}

async function updateUserPushToken(
  logger: Logger,
  userId: string,
  pushToken: string,
  deviceInfo: any
): Promise<void> {
  try {
    await executeQuery(
      logger,
      `UPDATE users SET 
       metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
       updated_at = NOW()
       WHERE id = $1`,
      [
        userId,
        JSON.stringify({
          push_token: pushToken,
          device_info: deviceInfo,
          push_token_updated_at: new Date().toISOString()
        })
      ]
    );
    
    logger.info('푸시 토큰 업데이트 완료', { userId });
  } catch (error) {
    logger.error('푸시 토큰 업데이트 실패', { userId, error: error.message });
  }
}