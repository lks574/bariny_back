import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createResponse, handleCors } from '../_shared/cors.ts';
import { createLogger, type Logger } from '../_shared/logger.ts';
import { verifyAuthToken } from '../_shared/auth.ts';
import { executeQuery } from '../_shared/database.ts';

// ============================================================================
// Manual Sync Edge Function - 수동 동기화 전용
// ============================================================================

serve(async (req: Request) => {
  const logger = createLogger('manual-sync', req);
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

  logger.apiStart(req.method, '/manual-sync');

  try {
    // 인증 검증 (선택적 - 게스트도 동기화 가능)
    const authContext = await verifyAuthToken(logger, req);
    const userId = authContext.user?.id;

    const requestBody = await req.json();
    const {
      pending_results = [],      // 대기 중인 퀴즈 결과들
      pending_sessions = [],     // 대기 중인 퀴즈 세션들
      user_preferences = {},     // 사용자 설정
      request_leaderboard = false, // 리더보드 요청 여부
      last_sync_timestamp,       // 마지막 동기화 시간
      device_info
    } = requestBody;

    logger.info('수동 동기화 요청 시작', {
      userId,
      pendingResultsCount: pending_results.length,
      pendingSessionsCount: pending_sessions.length,
      requestLeaderboard: request_leaderboard
    });

    const syncResult = {
      uploaded_results: 0,
      uploaded_sessions: 0,
      failed_uploads: [],
      leaderboard_updated: false,
      preferences_synced: false,
      download_data: {} as any
    };

    // 1. 배치로 퀴즈 결과 업로드
    if (pending_results.length > 0 && userId) {
      const uploadResult = await batchUploadResults(logger, userId, pending_results);
      syncResult.uploaded_results = uploadResult.success_count;
      syncResult.failed_uploads.push(...uploadResult.failed_items);
    }

    // 2. 배치로 퀴즈 세션 업로드
    if (pending_sessions.length > 0 && userId) {
      const uploadResult = await batchUploadSessions(logger, userId, pending_sessions);
      syncResult.uploaded_sessions = uploadResult.success_count;
      syncResult.failed_uploads.push(...uploadResult.failed_items);
    }

    // 3. 사용자 설정 동기화
    if (Object.keys(user_preferences).length > 0 && userId) {
      const prefResult = await syncUserPreferences(logger, userId, user_preferences);
      syncResult.preferences_synced = prefResult;
    }

    // 4. 리더보드 업데이트 (하루 1회만)
    if (request_leaderboard) {
      const leaderboardResult = await updateLeaderboardIfNeeded(logger, userId);
      syncResult.leaderboard_updated = leaderboardResult.updated;
      if (leaderboardResult.data) {
        syncResult.download_data.leaderboard = leaderboardResult.data;
      }
    }

    // 5. 최신 퀴즈 데이터 체크
    const quizUpdateResult = await checkQuizDataUpdates(logger, last_sync_timestamp);
    if (quizUpdateResult.has_updates) {
      syncResult.download_data.quiz_data = quizUpdateResult.data;
    }

    const duration = performance.now() - startTime;
    logger.info('수동 동기화 완료', {
      userId,
      duration_ms: duration,
      uploadedResults: syncResult.uploaded_results,
      uploadedSessions: syncResult.uploaded_sessions,
      failedUploads: syncResult.failed_uploads.length
    });

    logger.apiEnd(req.method, '/manual-sync', 200, duration);

    return createResponse({
      success: true,
      data: {
        sync_result: syncResult,
        sync_timestamp: new Date().toISOString(),
        message: `${syncResult.uploaded_results + syncResult.uploaded_sessions}개 항목이 동기화되었습니다`,
        next_sync_available: true // 언제든 다시 동기화 가능
      }
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('수동 동기화 처리 중 오류 발생', {
      error: error.message,
      stack: error.stack
    });

    logger.apiEnd(req.method, '/manual-sync', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'MANUAL_SYNC_FAILED',
        message: '수동 동기화 처리 중 오류가 발생했습니다'
      }
    }, 500);
  }
});

// ============================================================================
// 배치 업로드 함수들
// ============================================================================

async function batchUploadResults(
  logger: Logger,
  userId: string,
  results: any[]
): Promise<{ success_count: number; failed_items: any[] }> {
  let successCount = 0;
  const failedItems = [];

  try {
    logger.info('퀴즈 결과 배치 업로드 시작', {
      userId,
      resultCount: results.length
    });

    // 트랜잭션으로 배치 처리
    for (const result of results) {
      try {
        await executeQuery(
          logger,
          `INSERT INTO quiz_results (
            result_id, session_id, user_id, question_id,
            selected_answer, is_correct, time_taken,
            created_at, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (result_id) DO NOTHING`, // 중복 방지
          [
            result.result_id,
            result.session_id,
            userId,
            result.question_id,
            result.selected_answer,
            result.is_correct,
            result.time_taken,
            result.created_at,
            JSON.stringify(result.metadata || {})
          ]
        );
        successCount++;
      } catch (error) {
        logger.warn('개별 결과 업로드 실패', {
          resultId: result.result_id,
          error: error.message
        });
        failedItems.push({
          type: 'result',
          id: result.result_id,
          error: error.message
        });
      }
    }

    logger.info('퀴즈 결과 배치 업로드 완료', {
      successCount,
      failedCount: failedItems.length
    });

  } catch (error) {
    logger.error('배치 업로드 전체 실패', { error: error.message });
  }

  return { success_count: successCount, failed_items: failedItems };
}

async function batchUploadSessions(
  logger: Logger,
  userId: string,
  sessions: any[]
): Promise<{ success_count: number; failed_items: any[] }> {
  let successCount = 0;
  const failedItems = [];

  try {
    logger.info('퀴즈 세션 배치 업로드 시작', {
      userId,
      sessionCount: sessions.length
    });

    for (const session of sessions) {
      try {
        await executeQuery(
          logger,
          `INSERT INTO quiz_sessions (
            session_id, user_id, quiz_type, category,
            status, current_question, total_questions,
            score, time_spent, started_at, completed_at, updated_at, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (session_id) DO UPDATE SET
            status = EXCLUDED.status,
            score = EXCLUDED.score,
            completed_at = EXCLUDED.completed_at,
            updated_at = EXCLUDED.updated_at`, // 업데이트 허용
          [
            session.session_id,
            userId,
            session.quiz_type,
            session.category,
            session.status,
            session.current_question,
            session.total_questions,
            session.score,
            session.time_spent,
            session.started_at,
            session.completed_at,
            session.updated_at,
            JSON.stringify(session.metadata || {})
          ]
        );
        successCount++;
      } catch (error) {
        logger.warn('개별 세션 업로드 실패', {
          sessionId: session.session_id,
          error: error.message
        });
        failedItems.push({
          type: 'session',
          id: session.session_id,
          error: error.message
        });
      }
    }

    logger.info('퀴즈 세션 배치 업로드 완료', {
      successCount,
      failedCount: failedItems.length
    });

  } catch (error) {
    logger.error('세션 배치 업로드 전체 실패', { error: error.message });
  }

  return { success_count: successCount, failed_items: failedItems };
}

// ============================================================================
// 리더보드 업데이트 (하루 1회만)
// ============================================================================

async function updateLeaderboardIfNeeded(
  logger: Logger,
  userId?: string
): Promise<{ updated: boolean; data?: any }> {
  try {
    // 마지막 리더보드 업데이트 시간 확인
    const lastUpdate = await getLastLeaderboardUpdate(logger);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    if (lastUpdate && new Date(lastUpdate) > oneDayAgo) {
      logger.info('리더보드 업데이트 건너뛰기 - 24시간 미경과', {
        lastUpdate
      });
      
      // 캐시된 리더보드 반환
      const cachedLeaderboard = await getCachedLeaderboard(logger);
      return {
        updated: false,
        data: cachedLeaderboard
      };
    }

    // 새로운 리더보드 생성
    const leaderboardData = await generateLeaderboard(logger);
    
    // 캐시 업데이트
    await updateLeaderboardCache(logger, leaderboardData);

    logger.info('리더보드 업데이트 완료', {
      entryCount: leaderboardData.leaderboard?.length || 0
    });

    return {
      updated: true,
      data: leaderboardData
    };

  } catch (error) {
    logger.error('리더보드 업데이트 실패', { error: error.message });
    return { updated: false };
  }
}

// ============================================================================
// 헬퍼 함수들
// ============================================================================

async function syncUserPreferences(
  logger: Logger,
  userId: string,
  preferences: any
): Promise<boolean> {
  try {
    await executeQuery(
      logger,
      `UPDATE users SET 
       preferences = $2,
       updated_at = NOW()
       WHERE id = $1`,
      [userId, JSON.stringify(preferences)]
    );
    
    logger.info('사용자 설정 동기화 완료', { userId });
    return true;
  } catch (error) {
    logger.error('사용자 설정 동기화 실패', { userId, error: error.message });
    return false;
  }
}

async function checkQuizDataUpdates(
  logger: Logger,
  lastSyncTimestamp?: string
): Promise<{ has_updates: boolean; data?: any }> {
  try {
    const latestVersion = await executeQuery(
      logger,
      'SELECT version_number, created_at FROM quiz_versions WHERE is_active = true ORDER BY created_at DESC LIMIT 1',
      []
    );

    if (!latestVersion.data || latestVersion.data.length === 0) {
      return { has_updates: false };
    }

    const latest = latestVersion.data[0];
    
    // 마지막 동기화 이후 업데이트가 있는지 확인
    if (lastSyncTimestamp && new Date(latest.created_at) <= new Date(lastSyncTimestamp)) {
      return { has_updates: false };
    }

    return {
      has_updates: true,
      data: {
        version: latest.version_number,
        download_url: `${(globalThis as any).Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/quiz-files/quiz_data_v${latest.version_number}.json`,
        updated_at: latest.created_at
      }
    };

  } catch (error) {
    logger.error('퀴즈 데이터 업데이트 확인 실패', { error: error.message });
    return { has_updates: false };
  }
}

async function getLastLeaderboardUpdate(logger: Logger): Promise<string | null> {
  try {
    const result = await executeQuery(
      logger,
      'SELECT updated_at FROM leaderboard_cache ORDER BY updated_at DESC LIMIT 1',
      []
    );
    
    return result.data?.[0]?.updated_at || null;
  } catch (error) {
    logger.warn('리더보드 업데이트 시간 조회 실패', { error: error.message });
    return null;
  }
}

async function getCachedLeaderboard(logger: Logger): Promise<any> {
  try {
    const result = await executeQuery(
      logger,
      'SELECT data FROM leaderboard_cache ORDER BY updated_at DESC LIMIT 1',
      []
    );
    
    return result.data?.[0]?.data || { leaderboard: [], updated_at: new Date().toISOString() };
  } catch (error) {
    logger.error('캐시된 리더보드 조회 실패', { error: error.message });
    return { leaderboard: [], updated_at: new Date().toISOString() };
  }
}

async function generateLeaderboard(logger: Logger): Promise<any> {
  try {
    const result = await executeQuery(
      logger,
      `SELECT 
         u.id, u.display_name, u.avatar_url,
         COUNT(DISTINCT qs.session_id) as total_sessions,
         COUNT(DISTINCT CASE WHEN qs.status = 'completed' THEN qs.session_id END) as completed_sessions,
         COALESCE(AVG(CASE WHEN qs.status = 'completed' THEN qs.score END), 0) as average_score,
         COUNT(qr.result_id) as total_questions,
         COUNT(CASE WHEN qr.is_correct THEN 1 END) as correct_answers,
         ROW_NUMBER() OVER (ORDER BY AVG(CASE WHEN qs.status = 'completed' THEN qs.score END) DESC) as rank
       FROM users u
       JOIN quiz_sessions qs ON u.id = qs.user_id
       LEFT JOIN quiz_results qr ON qs.session_id = qr.session_id
       WHERE u.is_active = true AND u.auth_provider != 'guest' AND qs.status = 'completed'
       GROUP BY u.id, u.display_name, u.avatar_url
       HAVING COUNT(DISTINCT CASE WHEN qs.status = 'completed' THEN qs.session_id END) > 0
       ORDER BY average_score DESC
       LIMIT 50`,
      []
    );

    return {
      leaderboard: result.data || [],
      updated_at: new Date().toISOString(),
      total_entries: result.data?.length || 0
    };

  } catch (error) {
    logger.error('리더보드 생성 실패', { error: error.message });
    return { leaderboard: [], updated_at: new Date().toISOString() };
  }
}

async function updateLeaderboardCache(logger: Logger, data: any): Promise<void> {
  try {
    await executeQuery(
      logger,
      `INSERT INTO leaderboard_cache (data, updated_at) VALUES ($1, $2)`,
      [JSON.stringify(data), new Date().toISOString()]
    );
    
    // 오래된 캐시 정리 (최근 3개만 유지)
    await executeQuery(
      logger,
      `DELETE FROM leaderboard_cache WHERE id NOT IN (
        SELECT id FROM leaderboard_cache ORDER BY updated_at DESC LIMIT 3
      )`,
      []
    );
    
  } catch (error) {
    logger.error('리더보드 캐시 업데이트 실패', { error: error.message });
  }
}