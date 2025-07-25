import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createResponse, handleCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { verifyAuthToken, loadAuthConfig } from '../_shared/auth.ts';
import { saveQuizResults, getQuizSessionsByUser } from '../_shared/database.ts';
import { validateInput } from '../_shared/validation.ts';
import type { 
  SyncRequest, 
  SyncResponse, 
  QuizResult, 
  QuizSession, 
  ProgressStats 
} from '../_shared/types.ts';

// ============================================================================
// User Progress Sync Edge Function
// ============================================================================

serve(async (req: Request) => {
  const logger = createLogger('sync-progress', req);
  const startTime = performance.now();
  
  // CORS 처리
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  logger.apiStart(req.method, '/sync-progress');

  try {
    // 인증 검증
    const authContext = await verifyAuthToken(logger, req);
    if (!authContext.isAuthenticated || !authContext.user) {
      return createResponse({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: '인증이 필요합니다'
        }
      }, 401);
    }

    // 메서드별 처리
    switch (req.method) {
      case 'POST':
        return await handleSyncData(logger, req, authContext.user.id);
      case 'GET':
        return await handleGetProgress(logger, req, authContext.user.id);
      case 'PUT':
        return await handleUpdateProgress(logger, req, authContext.user.id);
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
    logger.error('진행 상황 동기화 처리 중 오류 발생', {
      error: error.message,
      stack: error.stack
    });

    logger.apiEnd(req.method, '/sync-progress', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'SYNC_FAILED',
        message: '진행 상황 동기화 처리 중 오류가 발생했습니다'
      }
    }, 500);
  }
});

// ============================================================================
// POST: 퀴즈 결과 동기화 (오프라인 → 온라인)
// ============================================================================

async function handleSyncData(
  logger: Logger, 
  req: Request, 
  userId: string
): Promise<Response> {
  const startTime = performance.now();

  try {
    // 요청 본문 파싱 및 검증
    const requestBody = await req.json();
    const validationResult = await validateInput(requestBody, 'syncRequest');
    
    if (!validationResult.success) {
      return createResponse({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '요청 데이터가 올바르지 않습니다',
          details: validationResult.errors
        }
      }, 400);
    }

    const syncRequest = validationResult.data as SyncRequest;
    
    logger.info('퀴즈 결과 동기화 시작', {
      userId,
      sessionCount: syncRequest.quiz_sessions?.length || 0,
      resultCount: syncRequest.quiz_results?.length || 0,
      lastSyncAt: syncRequest.last_sync_at
    });

    // Firebase Remote Config에서 동기화 설정 로드
    const authConfig = await loadAuthConfig(logger);
    if (!authConfig.auto_sync_enabled) {
      return createResponse({
        success: false,
        error: {
          code: 'SYNC_DISABLED',
          message: '자동 동기화가 비활성화되어 있습니다'
        }
      }, 400);
    }

    const syncResults = {
      synced_sessions: [] as string[],
      synced_results: [] as string[],
      failed_sessions: [] as string[],
      failed_results: [] as string[],
      conflicts: [] as any[]
    };

    // 1. 퀴즈 세션 동기화
    if (syncRequest.quiz_sessions && syncRequest.quiz_sessions.length > 0) {
      for (const session of syncRequest.quiz_sessions) {
        try {
          const result = await syncQuizSession(logger, userId, session);
          if (result.success) {
            syncResults.synced_sessions.push(session.session_id);
          } else {
            syncResults.failed_sessions.push(session.session_id);
            if (result.conflict) {
              syncResults.conflicts.push({
                type: 'session',
                id: session.session_id,
                conflict: result.conflict
              });
            }
          }
        } catch (error) {
          logger.error('세션 동기화 실패', { 
            sessionId: session.session_id, 
            error: error.message 
          });
          syncResults.failed_sessions.push(session.session_id);
        }
      }
    }

    // 2. 퀴즈 결과 동기화
    if (syncRequest.quiz_results && syncRequest.quiz_results.length > 0) {
      for (const result of syncRequest.quiz_results) {
        try {
          const syncResult = await syncQuizResult(logger, userId, result);
          if (syncResult.success) {
            syncResults.synced_results.push(result.result_id);
          } else {
            syncResults.failed_results.push(result.result_id);
            if (syncResult.conflict) {
              syncResults.conflicts.push({
                type: 'result',
                id: result.result_id,
                conflict: syncResult.conflict
              });
            }
          }
        } catch (error) {
          logger.error('결과 동기화 실패', { 
            resultId: result.result_id, 
            error: error.message 
          });
          syncResults.failed_results.push(result.result_id);
        }
      }
    }

    // 3. 최신 서버 데이터 조회
    const serverData = await getLatestServerData(logger, userId, syncRequest.last_sync_at);

    const duration = performance.now() - startTime;
    logger.info('퀴즈 결과 동기화 완료', {
      userId,
      duration_ms: duration,
      syncedSessions: syncResults.synced_sessions.length,
      syncedResults: syncResults.synced_results.length,
      conflicts: syncResults.conflicts.length
    });

    const response: SyncResponse = {
      success: true,
      message: '동기화가 완료되었습니다',
      sync_timestamp: new Date().toISOString(),
      sync_results: syncResults,
      server_data: serverData,
      conflicts_resolved: syncResults.conflicts.length === 0
    };

    logger.apiEnd(req.method, '/sync-progress', 200, duration);

    return createResponse({
      success: true,
      data: response
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('동기화 처리 실패', { error: error.message });

    logger.apiEnd(req.method, '/sync-progress', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'SYNC_PROCESSING_FAILED',
        message: '동기화 처리에 실패했습니다'
      }
    }, 500);
  }
}

// ============================================================================
// GET: 사용자 진행 상황 조회
// ============================================================================

async function handleGetProgress(
  logger: Logger, 
  req: Request, 
  userId: string
): Promise<Response> {
  const startTime = performance.now();

  try {
    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const includeStats = url.searchParams.get('include_stats') === 'true';

    logger.info('사용자 진행 상황 조회 시작', {
      userId,
      category,
      limit,
      offset,
      includeStats
    });

    // 사용자 퀴즈 세션 조회
    const sessions = await getQuizSessionsByUser(logger, userId, category, limit, offset);

    // 통계 정보 계산 (요청 시)
    let stats: ProgressStats | undefined;
    if (includeStats) {
      stats = await calculateProgressStats(logger, userId, category);
    }

    const duration = performance.now() - startTime;
    logger.info('사용자 진행 상황 조회 완료', {
      userId,
      sessionCount: sessions.length,
      duration_ms: duration
    });

    logger.apiEnd(req.method, '/sync-progress', 200, duration);

    return createResponse({
      success: true,
      data: {
        sessions,
        stats,
        total_count: sessions.length,
        category: category || 'all',
        pagination: {
          limit,
          offset,
          has_more: sessions.length === limit
        },
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('진행 상황 조회 실패', { error: error.message });

    logger.apiEnd(req.method, '/sync-progress', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'PROGRESS_FETCH_FAILED',
        message: '진행 상황 조회에 실패했습니다'
      }
    }, 500);
  }
}

// ============================================================================
// PUT: 진행 상황 수정/업데이트
// ============================================================================

async function handleUpdateProgress(
  logger: Logger, 
  req: Request, 
  userId: string
): Promise<Response> {
  const startTime = performance.now();

  try {
    const requestBody = await req.json();
    const { session_id, updates } = requestBody;

    if (!session_id || !updates) {
      return createResponse({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'session_id와 updates가 필요합니다'
        }
      }, 400);
    }

    logger.info('진행 상황 업데이트 시작', {
      userId,
      sessionId: session_id,
      updateFields: Object.keys(updates)
    });

    // 세션 소유권 확인 및 업데이트
    const updateResult = await updateQuizSession(logger, userId, session_id, updates);

    if (!updateResult.success) {
      return createResponse({
        success: false,
        error: updateResult.error
      }, 400);
    }

    const duration = performance.now() - startTime;
    logger.info('진행 상황 업데이트 완료', {
      userId,
      sessionId: session_id,
      duration_ms: duration
    });

    logger.apiEnd(req.method, '/sync-progress', 200, duration);

    return createResponse({
      success: true,
      data: {
        message: '진행 상황이 업데이트되었습니다',
        session_id,
        updated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('진행 상황 업데이트 실패', { error: error.message });

    logger.apiEnd(req.method, '/sync-progress', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'PROGRESS_UPDATE_FAILED',
        message: '진행 상황 업데이트에 실패했습니다'
      }
    }, 500);
  }
}

// ============================================================================
// 동기화 헬퍼 함수들
// ============================================================================

async function syncQuizSession(
  logger: Logger,
  userId: string, 
  session: QuizSession
): Promise<{ success: boolean; conflict?: any }> {
  try {
    const { executeQuery } = await import('../_shared/database.ts');
    
    // 기존 세션 확인
    const existingSession = await executeQuery(
      logger,
      'SELECT * FROM quiz_sessions WHERE session_id = $1 AND user_id = $2',
      [session.session_id, userId]
    );

    if (existingSession.data && existingSession.data.length > 0) {
      const existing = existingSession.data[0];
      
      // 충돌 검사 (서버 데이터가 더 최신인 경우)
      if (new Date(existing.updated_at) > new Date(session.updated_at)) {
        return {
          success: false,
          conflict: {
            server_data: existing,
            client_data: session,
            resolution: 'server_wins'
          }
        };
      }
      
      // 업데이트
      await executeQuery(
        logger,
        `UPDATE quiz_sessions SET 
         status = $3, current_question = $4, score = $5, 
         time_spent = $6, updated_at = $7, metadata = $8
         WHERE session_id = $1 AND user_id = $2`,
        [
          session.session_id, userId, session.status, 
          session.current_question, session.score, 
          session.time_spent, session.updated_at, 
          JSON.stringify(session.metadata || {})
        ]
      );
    } else {
      // 새로운 세션 삽입
      await executeQuery(
        logger,
        `INSERT INTO quiz_sessions (
          session_id, user_id, quiz_type, category, 
          status, current_question, total_questions, 
          score, time_spent, started_at, updated_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          session.session_id, userId, session.quiz_type, 
          session.category, session.status, session.current_question,
          session.total_questions, session.score, session.time_spent,
          session.started_at, session.updated_at, 
          JSON.stringify(session.metadata || {})
        ]
      );
    }

    return { success: true };

  } catch (error) {
    logger.error('세션 동기화 실패', { 
      sessionId: session.session_id, 
      error: error.message 
    });
    return { success: false };
  }
}

async function syncQuizResult(
  logger: Logger,
  userId: string, 
  result: QuizResult
): Promise<{ success: boolean; conflict?: any }> {
  try {
    const { executeQuery } = await import('../_shared/database.ts');
    
    // 기존 결과 확인
    const existingResult = await executeQuery(
      logger,
      'SELECT * FROM quiz_results WHERE result_id = $1 AND user_id = $2',
      [result.result_id, userId]
    );

    if (existingResult.data && existingResult.data.length > 0) {
      const existing = existingResult.data[0];
      
      // 충돌 검사
      if (new Date(existing.created_at) > new Date(result.created_at)) {
        return {
          success: false,
          conflict: {
            server_data: existing,
            client_data: result,
            resolution: 'server_wins'
          }
        };
      }
      
      // 결과는 일반적으로 업데이트하지 않음 (불변)
      logger.warn('퀴즈 결과 중복', { resultId: result.result_id });
      return { success: true };
    } else {
      // 새로운 결과 삽입
      await executeQuery(
        logger,
        `INSERT INTO quiz_results (
          result_id, session_id, user_id, question_id,
          selected_answer, is_correct, time_taken,
          created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          result.result_id, result.session_id, userId,
          result.question_id, result.selected_answer, 
          result.is_correct, result.time_taken,
          result.created_at, JSON.stringify(result.metadata || {})
        ]
      );
    }

    return { success: true };

  } catch (error) {
    logger.error('결과 동기화 실패', { 
      resultId: result.result_id, 
      error: error.message 
    });
    return { success: false };
  }
}

async function getLatestServerData(
  logger: Logger,
  userId: string,
  lastSyncAt: string
): Promise<any> {
  try {
    const { executeQuery } = await import('../_shared/database.ts');
    
    // 마지막 동기화 이후 변경된 데이터 조회
    const [sessions, results] = await Promise.all([
      executeQuery(
        logger,
        'SELECT * FROM quiz_sessions WHERE user_id = $1 AND updated_at > $2 ORDER BY updated_at DESC LIMIT 50',
        [userId, lastSyncAt]
      ),
      executeQuery(
        logger,
        'SELECT * FROM quiz_results WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 100',
        [userId, lastSyncAt]
      )
    ]);

    return {
      quiz_sessions: sessions.data || [],
      quiz_results: results.data || [],
      server_timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error('서버 데이터 조회 실패', { error: error.message });
    return {
      quiz_sessions: [],
      quiz_results: [],
      server_timestamp: new Date().toISOString()
    };
  }
}

async function calculateProgressStats(
  logger: Logger,
  userId: string,
  category?: string
): Promise<ProgressStats> {
  try {
    const { executeQuery } = await import('../_shared/database.ts');
    
    const categoryFilter = category ? 'AND qs.category = $2' : '';
    const params = category ? [userId, category] : [userId];
    
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT qs.session_id) as total_sessions,
        COUNT(DISTINCT CASE WHEN qs.status = 'completed' THEN qs.session_id END) as completed_sessions,
        AVG(CASE WHEN qs.status = 'completed' THEN qs.score END) as average_score,
        SUM(qs.time_spent) as total_time_spent,
        COUNT(qr.result_id) as total_questions_answered,
        COUNT(CASE WHEN qr.is_correct THEN 1 END) as correct_answers
      FROM quiz_sessions qs
      LEFT JOIN quiz_results qr ON qs.session_id = qr.session_id
      WHERE qs.user_id = $1 ${categoryFilter}
    `;

    const result = await executeQuery(logger, statsQuery, params);
    const stats = result.data?.[0] || {};

    return {
      total_sessions: parseInt(stats.total_sessions) || 0,
      completed_sessions: parseInt(stats.completed_sessions) || 0,
      completion_rate: stats.total_sessions > 0 
        ? (stats.completed_sessions / stats.total_sessions) * 100 
        : 0,
      average_score: parseFloat(stats.average_score) || 0,
      total_time_spent: parseInt(stats.total_time_spent) || 0,
      total_questions_answered: parseInt(stats.total_questions_answered) || 0,
      accuracy_rate: stats.total_questions_answered > 0 
        ? (stats.correct_answers / stats.total_questions_answered) * 100 
        : 0,
      streak_days: 0, // 별도 계산 필요
      last_activity: new Date().toISOString()
    };

  } catch (error) {
    logger.error('통계 계산 실패', { error: error.message });
    return {
      total_sessions: 0,
      completed_sessions: 0,
      completion_rate: 0,
      average_score: 0,
      total_time_spent: 0,
      total_questions_answered: 0,
      accuracy_rate: 0,
      streak_days: 0,
      last_activity: new Date().toISOString()
    };
  }
}

async function updateQuizSession(
  logger: Logger,
  userId: string,
  sessionId: string,
  updates: any
): Promise<{ success: boolean; error?: any }> {
  try {
    const { executeQuery } = await import('../_shared/database.ts');
    
    // 세션 소유권 확인
    const session = await executeQuery(
      logger,
      'SELECT * FROM quiz_sessions WHERE session_id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (!session.data || session.data.length === 0) {
      return {
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: '세션을 찾을 수 없습니다'
        }
      };
    }

    // 업데이트 가능한 필드만 추출
    const allowedFields = ['status', 'current_question', 'score', 'time_spent', 'metadata'];
    const updateFields = Object.keys(updates).filter(field => allowedFields.includes(field));
    
    if (updateFields.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_VALID_UPDATES',
          message: '업데이트할 유효한 필드가 없습니다'
        }
      };
    }

    // 동적 UPDATE 쿼리 생성
    const setClauses = updateFields.map((field, index) => `${field} = $${index + 3}`).join(', ');
    const values = [sessionId, userId, ...updateFields.map(field => 
      field === 'metadata' ? JSON.stringify(updates[field]) : updates[field]
    ), new Date().toISOString()];

    const updateQuery = `
      UPDATE quiz_sessions 
      SET ${setClauses}, updated_at = $${values.length}
      WHERE session_id = $1 AND user_id = $2
    `;

    await executeQuery(logger, updateQuery, values);

    return { success: true };

  } catch (error) {
    logger.error('세션 업데이트 실패', { 
      sessionId, 
      userId, 
      error: error.message 
    });
    return {
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        message: '세션 업데이트에 실패했습니다'
      }
    };
  }
} 