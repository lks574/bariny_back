import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createResponse, handleCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { verifyAuthToken } from '../_shared/auth.ts';
import type { LeaderboardEntry, LeaderboardResponse } from '../_shared/types.ts';

// ============================================================================
// Leaderboard and Ranking Edge Function
// ============================================================================

serve(async (req: Request) => {
  const logger = createLogger('leaderboard', req);
  const startTime = performance.now();
  
  // CORS 처리
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') {
    return createResponse({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'GET 메서드만 지원됩니다'
      }
    }, 405);
  }

  logger.apiStart(req.method, '/leaderboard');

  try {
    // 인증 검증 (선택적 - 게스트도 리더보드 조회 가능)
    const authContext = await verifyAuthToken(logger, req);
    const currentUserId = authContext.user?.id;

    const url = new URL(req.url);
    const category = url.searchParams.get('category') || 'all';
    const timeRange = url.searchParams.get('time_range') || 'all'; // all, week, month
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const includeUserRank = url.searchParams.get('include_user_rank') === 'true';

    logger.info('리더보드 조회 시작', {
      category,
      timeRange,
      limit,
      includeUserRank,
      currentUserId
    });

    // 리더보드 데이터 조회
    const leaderboard = await getLeaderboard(logger, category, timeRange, limit);
    
    // 현재 사용자 순위 조회 (인증된 사용자인 경우)
    let userRank = null;
    if (currentUserId && includeUserRank) {
      userRank = await getUserRank(logger, currentUserId, category, timeRange);
    }

    const duration = performance.now() - startTime;
    logger.info('리더보드 조회 완료', {
      category,
      timeRange,
      entryCount: leaderboard.length,
      duration_ms: duration
    });

    const response: LeaderboardResponse = {
      success: true,
      leaderboard,
      user_rank: userRank,
      category,
      time_range: timeRange,
      total_entries: leaderboard.length,
      generated_at: new Date().toISOString()
    };

    logger.apiEnd(req.method, '/leaderboard', 200, duration);

    return createResponse({
      success: true,
      data: response
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('리더보드 조회 중 오류 발생', {
      error: error.message,
      stack: error.stack
    });

    logger.apiEnd(req.method, '/leaderboard', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'LEADERBOARD_FAILED',
        message: '리더보드 조회에 실패했습니다'
      }
    }, 500);
  }
});

// ============================================================================
// 리더보드 조회 함수
// ============================================================================

async function getLeaderboard(
  logger: Logger,
  category: string,
  timeRange: string,
  limit: number
): Promise<LeaderboardEntry[]> {
  try {
    const { executeQuery } = await import('../_shared/database.ts');
    
    // 시간 범위 필터 생성
    let timeFilter = '';
    const now = new Date();
    
    switch (timeRange) {
      case 'week':
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        timeFilter = `AND qs.updated_at >= '${oneWeekAgo.toISOString()}'`;
        break;
      case 'month':
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        timeFilter = `AND qs.updated_at >= '${oneMonthAgo.toISOString()}'`;
        break;
      default:
        timeFilter = '';
    }

    // 카테고리 필터 생성
    const categoryFilter = category === 'all' ? '' : `AND qs.category = '${category}'`;

    const leaderboardQuery = `
      WITH user_stats AS (
        SELECT 
          u.id as user_id,
          u.display_name,
          u.avatar_url,
          COUNT(DISTINCT qs.session_id) as total_sessions,
          COUNT(DISTINCT CASE WHEN qs.status = 'completed' THEN qs.session_id END) as completed_sessions,
          COALESCE(AVG(CASE WHEN qs.status = 'completed' THEN qs.score END), 0) as average_score,
          COALESCE(SUM(qs.time_spent), 0) as total_time_spent,
          COUNT(qr.result_id) as total_questions,
          COUNT(CASE WHEN qr.is_correct THEN 1 END) as correct_answers,
          MAX(qs.updated_at) as last_activity
        FROM users u
        LEFT JOIN quiz_sessions qs ON u.id = qs.user_id
        LEFT JOIN quiz_results qr ON qs.session_id = qr.session_id
        WHERE u.is_active = true AND u.auth_provider != 'guest'
        ${categoryFilter}
        ${timeFilter}
        GROUP BY u.id, u.display_name, u.avatar_url
        HAVING COUNT(DISTINCT CASE WHEN qs.status = 'completed' THEN qs.session_id END) > 0
      ),
      ranked_users AS (
        SELECT 
          *,
          CASE 
            WHEN total_questions > 0 THEN (correct_answers::float / total_questions * 100)
            ELSE 0 
          END as accuracy_rate,
          -- 종합 점수 계산: 평균 점수 * 완료율 * 정확도
          CASE 
            WHEN total_sessions > 0 AND total_questions > 0 THEN 
              (average_score * (completed_sessions::float / total_sessions) * (correct_answers::float / total_questions))
            ELSE 0
          END as composite_score,
          ROW_NUMBER() OVER (
            ORDER BY 
              CASE 
                WHEN total_sessions > 0 AND total_questions > 0 THEN 
                  (average_score * (completed_sessions::float / total_sessions) * (correct_answers::float / total_questions))
                ELSE 0
              END DESC,
              completed_sessions DESC,
              average_score DESC,
              last_activity DESC
          ) as rank
        FROM user_stats
      )
      SELECT 
        rank,
        user_id,
        display_name,
        avatar_url,
        total_sessions,
        completed_sessions,
        ROUND(average_score, 2) as average_score,
        total_time_spent,
        total_questions,
        correct_answers,
        ROUND(accuracy_rate, 2) as accuracy_rate,
        ROUND(composite_score, 2) as composite_score,
        last_activity
      FROM ranked_users
      ORDER BY rank
      LIMIT $1
    `;

    const result = await executeQuery(logger, leaderboardQuery, [limit]);
    
    if (!result.data) {
      return [];
    }

    return result.data.map((row: any): LeaderboardEntry => ({
      rank: row.rank,
      user_id: row.user_id,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      stats: {
        total_sessions: row.total_sessions,
        completed_sessions: row.completed_sessions,
        average_score: row.average_score,
        total_time_spent: row.total_time_spent,
        total_questions: row.total_questions,
        correct_answers: row.correct_answers,
        accuracy_rate: row.accuracy_rate,
        composite_score: row.composite_score
      },
      last_activity: row.last_activity
    }));

  } catch (error) {
    logger.error('리더보드 데이터 조회 실패', { error: error.message });
    return [];
  }
}

// ============================================================================
// 사용자 순위 조회 함수
// ============================================================================

async function getUserRank(
  logger: Logger,
  userId: string,
  category: string,
  timeRange: string
): Promise<{ rank: number; total_users: number; stats: any } | null> {
  try {
    const { executeQuery } = await import('../_shared/database.ts');
    
    // 시간 범위 필터 생성
    let timeFilter = '';
    const now = new Date();
    
    switch (timeRange) {
      case 'week':
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        timeFilter = `AND qs.updated_at >= '${oneWeekAgo.toISOString()}'`;
        break;
      case 'month':
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        timeFilter = `AND qs.updated_at >= '${oneMonthAgo.toISOString()}'`;
        break;
      default:
        timeFilter = '';
    }

    // 카테고리 필터 생성
    const categoryFilter = category === 'all' ? '' : `AND qs.category = '${category}'`;

    const rankQuery = `
      WITH user_stats AS (
        SELECT 
          u.id as user_id,
          COUNT(DISTINCT qs.session_id) as total_sessions,
          COUNT(DISTINCT CASE WHEN qs.status = 'completed' THEN qs.session_id END) as completed_sessions,
          COALESCE(AVG(CASE WHEN qs.status = 'completed' THEN qs.score END), 0) as average_score,
          COUNT(qr.result_id) as total_questions,
          COUNT(CASE WHEN qr.is_correct THEN 1 END) as correct_answers
        FROM users u
        LEFT JOIN quiz_sessions qs ON u.id = qs.user_id
        LEFT JOIN quiz_results qr ON qs.session_id = qr.session_id
        WHERE u.is_active = true AND u.auth_provider != 'guest'
        ${categoryFilter}
        ${timeFilter}
        GROUP BY u.id
        HAVING COUNT(DISTINCT CASE WHEN qs.status = 'completed' THEN qs.session_id END) > 0
      ),
      ranked_users AS (
        SELECT 
          user_id,
          total_sessions,
          completed_sessions,
          average_score,
          total_questions,
          correct_answers,
          CASE 
            WHEN total_questions > 0 THEN (correct_answers::float / total_questions * 100)
            ELSE 0 
          END as accuracy_rate,
          CASE 
            WHEN total_sessions > 0 AND total_questions > 0 THEN 
              (average_score * (completed_sessions::float / total_sessions) * (correct_answers::float / total_questions))
            ELSE 0
          END as composite_score,
          ROW_NUMBER() OVER (
            ORDER BY 
              CASE 
                WHEN total_sessions > 0 AND total_questions > 0 THEN 
                  (average_score * (completed_sessions::float / total_sessions) * (correct_answers::float / total_questions))
                ELSE 0
              END DESC,
              completed_sessions DESC,
              average_score DESC
          ) as rank
        FROM user_stats
      ),
      user_rank AS (
        SELECT 
          rank,
          total_sessions,
          completed_sessions,
          ROUND(average_score, 2) as average_score,
          total_questions,
          correct_answers,
          ROUND(accuracy_rate, 2) as accuracy_rate,
          ROUND(composite_score, 2) as composite_score
        FROM ranked_users 
        WHERE user_id = $1
      ),
      total_count AS (
        SELECT COUNT(*) as total_users FROM ranked_users
      )
      SELECT 
        ur.*,
        tc.total_users
      FROM user_rank ur
      CROSS JOIN total_count tc
    `;

    const result = await executeQuery(logger, rankQuery, [userId]);
    
    if (!result.data || result.data.length === 0) {
      return null;
    }

    const row = result.data[0];
    return {
      rank: row.rank,
      total_users: row.total_users,
      stats: {
        total_sessions: row.total_sessions,
        completed_sessions: row.completed_sessions,
        average_score: row.average_score,
        total_questions: row.total_questions,
        correct_answers: row.correct_answers,
        accuracy_rate: row.accuracy_rate,
        composite_score: row.composite_score
      }
    };

  } catch (error) {
    logger.error('사용자 순위 조회 실패', { userId, error: error.message });
    return null;
  }
}

// ============================================================================
// 카테고리별 통계 조회 (보너스 기능)
// ============================================================================

export async function getCategoryStats(
  logger: Logger,
  category?: string
): Promise<any> {
  try {
    const { executeQuery } = await import('../_shared/database.ts');
    
    const categoryFilter = category ? `WHERE qs.category = '${category}'` : '';
    
    const statsQuery = `
      SELECT 
        COALESCE(qs.category, 'unknown') as category,
        COUNT(DISTINCT qs.user_id) as active_users,
        COUNT(DISTINCT qs.session_id) as total_sessions,
        COUNT(DISTINCT CASE WHEN qs.status = 'completed' THEN qs.session_id END) as completed_sessions,
        COALESCE(AVG(CASE WHEN qs.status = 'completed' THEN qs.score END), 0) as average_score,
        COUNT(qr.result_id) as total_questions,
        COUNT(CASE WHEN qr.is_correct THEN 1 END) as correct_answers
      FROM quiz_sessions qs
      LEFT JOIN quiz_results qr ON qs.session_id = qr.session_id
      ${categoryFilter}
      GROUP BY qs.category
      ORDER BY active_users DESC, total_sessions DESC
    `;

    const result = await executeQuery(logger, statsQuery, []);
    return result.data || [];

  } catch (error) {
    logger.error('카테고리 통계 조회 실패', { error: error.message });
    return [];
  }
} 