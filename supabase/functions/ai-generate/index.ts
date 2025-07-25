import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createResponse, handleCors } from '../_shared/cors.ts';
import { createLogger, type Logger } from '../_shared/logger.ts';
import { verifyAuthToken, requireAdmin } from '../_shared/auth.ts';
import { generateQuizQuestions } from '../_shared/openai.ts';
import { executeQuery } from '../_shared/database.ts';
import type { AIGenerationRequest, AIGenerationResponse, QuizQuestion } from '../_shared/types.ts';

// ============================================================================
// AI Quiz Generation Edge Function
// ============================================================================

serve(async (req: Request) => {
  const logger = createLogger('ai-generate', req);
  const startTime = performance.now();
  
  // CORS 처리
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  logger.apiStart(req.method, '/ai-generate');

  try {
    // 메서드별 처리
    switch (req.method) {
      case 'POST':
        return await handleGenerateQuiz(logger, req);
      case 'GET':
        return await handleGetGenerations(logger, req);
      case 'PUT':
        return await handleApproveQuestions(logger, req);
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
    logger.error('AI 퀴즈 생성 처리 중 오류 발생', {
      error: error.message,
      stack: error.stack
    });

    logger.apiEnd(req.method, '/ai-generate', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'AI_GENERATION_FAILED',
        message: 'AI 퀴즈 생성 처리 중 오류가 발생했습니다'
      }
    }, 500);
  }
});

// ============================================================================
// POST: AI 퀴즈 생성
// ============================================================================

async function handleGenerateQuiz(logger: Logger, req: Request): Promise<Response> {
  const startTime = performance.now();

  try {
    // 인증 검증 (관리자 또는 인증된 사용자)
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

    // 요청 본문 파싱 및 간단한 검증
    const requestBody = await req.json();
    
    if (!requestBody || typeof requestBody !== 'object') {
      return createResponse({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '요청 데이터가 올바르지 않습니다'
        }
      }, 400);
    }

    // 필수 필드 검증
    const { category, difficulty, count = 2, language = 'ko' } = requestBody;
    
    if (!category || !difficulty) {
      return createResponse({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'category와 difficulty는 필수 필드입니다'
        }
      }, 400);
    }

    const generationRequest: AIGenerationRequest = {
      category,
      difficulty,
      count: Math.min(Math.max(count, 1), 10), // 1-10개 제한
      language,
      topic: requestBody.topic
    };
    
    const userId = authContext.user?.id;
    if (!userId) {
      return createResponse({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '사용자 정보를 찾을 수 없습니다'
        }
      }, 400);
    }

    logger.info('AI 퀴즈 생성 요청 시작', {
      userId,
      category: generationRequest.category,
      difficulty: generationRequest.difficulty,
      count: generationRequest.count,
      topic: generationRequest.topic
    });

    // 일일 생성 제한 확인 (일반 사용자)
    if (!authContext.isAdmin) {
      const dailyLimit = await checkDailyGenerationLimit(logger, userId);
      if (!dailyLimit.allowed) {
        return createResponse({
          success: false,
          error: {
            code: 'DAILY_LIMIT_EXCEEDED',
            message: `일일 AI 퀴즈 생성 한도를 초과했습니다 (${dailyLimit.used}/${dailyLimit.limit})`
          }
        }, 429);
      }
    }

    // OpenAI를 통한 퀴즈 생성
    const aiResponse = await generateQuizQuestions(logger, generationRequest);
    
    if (!aiResponse.success || aiResponse.generated_questions.length === 0) {
      return createResponse({
        success: false,
        error: {
          code: 'AI_GENERATION_FAILED',
          message: 'AI 퀴즈 생성에 실패했습니다'
        }
      }, 500);
    }

    // 생성 이력 저장
    const generationId = crypto.randomUUID();
    await saveGenerationHistory(
      logger, 
      generationId, 
      authContext.user.id, 
      generationRequest, 
      aiResponse
    );

    // 관리자가 아닌 경우 검토 대기 상태로 저장
    const questionsToSave = aiResponse.generated_questions.map(q => ({
      ...q,
      is_active: authContext.isAdmin, // 관리자는 즉시 활성화
      metadata: {
        ...q,
        generation_id: generationId,
        generated_by: authContext.user.id,
        requires_approval: !authContext.isAdmin
      }
    }));

    // 임시 퀴즈 테이블에 저장 (검토용)
    if (!authContext.isAdmin) {
      await savePendingQuestions(logger, questionsToSave);
      
      logger.info('AI 생성 퀴즈 검토 대기 상태로 저장', {
        generationId,
        questionCount: questionsToSave.length
      });
    } else {
      // 관리자는 바로 본 테이블에 저장
      await saveApprovedQuestions(logger, questionsToSave);
      
      logger.info('AI 생성 퀴즈 즉시 승인 및 저장', {
        generationId,
        questionCount: questionsToSave.length
      });
    }

    const duration = performance.now() - startTime;
    logger.info('AI 퀴즈 생성 완료', {
      generationId,
      questionCount: aiResponse.generated_questions.length,
      tokensUsed: aiResponse.generation_info.tokens_used,
      costEstimate: aiResponse.generation_info.cost_estimate,
      duration_ms: duration
    });

    logger.apiEnd(req.method, '/ai-generate', 200, duration);

    const response = {
      ...aiResponse,
      generation_id: generationId,
      status: authContext.isAdmin ? 'approved' : 'pending_approval',
      message: authContext.isAdmin 
        ? 'AI 퀴즈가 생성되어 즉시 활성화되었습니다'
        : 'AI 퀴즈가 생성되었습니다. 관리자 검토 후 활성화됩니다'
    };

    return createResponse({
      success: true,
      data: response
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('AI 퀴즈 생성 실패', { error: error.message });

    logger.apiEnd(req.method, '/ai-generate', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'AI_GENERATION_ERROR',
        message: 'AI 퀴즈 생성 중 오류가 발생했습니다'
      }
    }, 500);
  }
}

// ============================================================================
// GET: AI 생성 이력 조회
// ============================================================================

async function handleGetGenerations(logger: Logger, req: Request): Promise<Response> {
  const startTime = performance.now();

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

    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'all'; // all, pending, approved, rejected
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    logger.info('AI 생성 이력 조회 시작', {
      userId: authContext.user.id,
      isAdmin: authContext.isAdmin,
      status,
      limit,
      offset
    });

    // 관리자는 모든 생성 이력 조회, 일반 사용자는 자신의 이력만
    const generations = await getGenerationHistory(
      logger, 
      authContext.isAdmin ? undefined : authContext.user.id,
      status,
      limit,
      offset
    );

    const duration = performance.now() - startTime;
    logger.info('AI 생성 이력 조회 완료', {
      generationCount: generations.length,
      duration_ms: duration
    });

    logger.apiEnd(req.method, '/ai-generate', 200, duration);

    return createResponse({
      success: true,
      data: {
        generations,
        pagination: {
          limit,
          offset,
          has_more: generations.length === limit
        },
        total_count: generations.length
      }
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('AI 생성 이력 조회 실패', { error: error.message });

    logger.apiEnd(req.method, '/ai-generate', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'GENERATION_HISTORY_FAILED',
        message: 'AI 생성 이력 조회에 실패했습니다'
      }
    }, 500);
  }
}

// ============================================================================
// PUT: 퀴즈 승인/거부 (관리자 전용)
// ============================================================================

async function handleApproveQuestions(logger: Logger, req: Request): Promise<Response> {
  return await requireAdmin(async (authContext: any, request: Request) => {
    const startTime = performance.now();

    try {
      const requestBody = await request.json();
      const { generation_id, action, question_ids } = requestBody; // action: 'approve' | 'reject'

      if (!generation_id || !action || !['approve', 'reject'].includes(action)) {
        return createResponse({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'generation_id와 올바른 action이 필요합니다'
          }
        }, 400);
      }

      logger.info('AI 퀴즈 승인/거부 처리 시작', {
        generationId: generation_id,
        action,
        questionIds: question_ids,
        adminId: authContext.user.id
      });

      if (action === 'approve') {
        const approvedCount = await approveQuestions(logger, generation_id, question_ids, authContext.user.id);
        
        logger.info('AI 퀴즈 승인 완료', {
          generationId: generation_id,
          approvedCount
        });

        return createResponse({
          success: true,
          data: {
            message: `${approvedCount}개의 퀴즈가 승인되어 활성화되었습니다`,
            approved_count: approvedCount
          }
        });
      } else {
        const rejectedCount = await rejectQuestions(logger, generation_id, question_ids, authContext.user.id);
        
        logger.info('AI 퀴즈 거부 완료', {
          generationId: generation_id,
          rejectedCount
        });

        return createResponse({
          success: true,
          data: {
            message: `${rejectedCount}개의 퀴즈가 거부되었습니다`,
            rejected_count: rejectedCount
          }
        });
      }

    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error('AI 퀴즈 승인/거부 처리 실패', { error: error.message });

      return createResponse({
        success: false,
        error: {
          code: 'APPROVAL_FAILED',
          message: '퀴즈 승인/거부 처리에 실패했습니다'
        }
      }, 500);
    }
  })(req);
}

// ============================================================================
// 헬퍼 함수들
// ============================================================================

async function checkDailyGenerationLimit(
  logger: Logger,
  userId: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await executeQuery(
      logger,
      `SELECT COUNT(*) as count 
       FROM ai_generations 
       WHERE user_id = $1 AND DATE(created_at) = $2`,
      [userId, today]
    );

    const used = parseInt(result.data?.[0]?.count || '0');
    const limit = 10; // 일일 10개 제한

    return {
      allowed: used < limit,
      used,
      limit
    };

  } catch (error) {
    logger.error('일일 생성 제한 확인 실패', { error: error.message });
    return { allowed: true, used: 0, limit: 10 }; // 오류 시 허용
  }
}

async function saveGenerationHistory(
  logger: Logger,
  generationId: string,
  userId: string,
  request: AIGenerationRequest,
  response: AIGenerationResponse
): Promise<void> {
  try {
    await executeQuery(
      logger,
      `INSERT INTO ai_generations (
        id, user_id, request_data, response_data, 
        question_count, tokens_used, cost_estimate,
        status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        generationId,
        userId,
        JSON.stringify(request),
        JSON.stringify(response),
        response.generated_questions.length,
        response.generation_info.tokens_used,
        response.generation_info.cost_estimate,
        'completed',
        new Date().toISOString()
      ]
    );
  } catch (error) {
    logger.error('AI 생성 이력 저장 실패', { generationId, error: error.message });
  }
}

async function savePendingQuestions(logger: Logger, questions: QuizQuestion[]): Promise<void> {
  try {
    for (const question of questions) {
      await executeQuery(
        logger,
        `INSERT INTO quiz_questions_pending (
          id, category, question, options, correct_answer,
          difficulty, tags, explanation, time_limit, points,
          metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          question.id,
          question.category,
          question.question,
          JSON.stringify(question.options),
          question.correct_answer,
          question.difficulty,
          JSON.stringify(question.tags || []),
          question.explanation,
          question.time_limit,
          question.points,
          JSON.stringify(question.metadata || {}),
          question.created_at
        ]
      );
    }
  } catch (error) {
    logger.error('대기 퀴즈 저장 실패', { error: error.message });
    throw error;
  }
}

async function saveApprovedQuestions(logger: Logger, questions: QuizQuestion[]): Promise<void> {
  try {
    for (const question of questions) {
      await executeQuery(
        logger,
        `INSERT INTO quiz_questions (
          id, category, question, options, correct_answer,
          difficulty, tags, explanation, audio_url, image_url,
          time_limit, points, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          question.id,
          question.category,
          question.question,
          JSON.stringify(question.options),
          question.correct_answer,
          question.difficulty,
          JSON.stringify(question.tags || []),
          question.explanation,
          question.audio_url,
          question.image_url,
          question.time_limit,
          question.points,
          question.is_active,
          question.created_at,
          question.updated_at
        ]
      );
    }
  } catch (error) {
    logger.error('승인 퀴즈 저장 실패', { error: error.message });
    throw error;
  }
}

async function getGenerationHistory(
  logger: Logger,
  userId?: string,
  status: string = 'all',
  limit: number = 20,
  offset: number = 0
): Promise<any[]> {
  try {
    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (userId) {
      whereClause += `WHERE user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (status !== 'all') {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += `status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    params.push(limit, offset);

    const query = `
      SELECT 
        id, user_id, request_data, question_count,
        tokens_used, cost_estimate, status, created_at
      FROM ai_generations
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await executeQuery(logger, query, params);
    return result.data || [];

  } catch (error) {
    logger.error('AI 생성 이력 조회 실패', { error: error.message });
    return [];
  }
}

async function approveQuestions(
  logger: Logger,
  generationId: string,
  questionIds?: string[],
  adminId?: string
): Promise<number> {
  try {
    // 대기 중인 퀴즈 조회
    let whereClause = `WHERE generation_id = $1`;
    const params: any[] = [generationId];

    if (questionIds && questionIds.length > 0) {
      whereClause += ` AND id = ANY($2)`;
      params.push(questionIds);
    }

    const pendingQuestions = await executeQuery(
      logger,
      `SELECT * FROM quiz_questions_pending ${whereClause}`,
      params
    );

    if (!pendingQuestions.data || pendingQuestions.data.length === 0) {
      return 0;
    }

    // 본 테이블로 이동
    let approvedCount = 0;
    for (const question of pendingQuestions.data) {
      try {
        await executeQuery(
          logger,
          `INSERT INTO quiz_questions (
            id, category, question, options, correct_answer,
            difficulty, tags, explanation, time_limit, points,
            is_active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            question.id,
            question.category,
            question.question,
            question.options,
            question.correct_answer,
            question.difficulty,
            question.tags,
            question.explanation,
            question.time_limit,
            question.points,
            true, // 승인되면 활성화
            question.created_at,
            new Date().toISOString()
          ]
        );

        // 대기 테이블에서 삭제
        await executeQuery(
          logger,
          `DELETE FROM quiz_questions_pending WHERE id = $1`,
          [question.id]
        );

        approvedCount++;
      } catch (error) {
        logger.error('개별 퀴즈 승인 실패', { questionId: question.id, error: error.message });
      }
    }

    // 생성 이력 업데이트
    await executeQuery(
      logger,
      `UPDATE ai_generations SET status = 'approved', approved_at = $2, approved_by = $3 WHERE id = $1`,
      [generationId, new Date().toISOString(), adminId]
    );

    return approvedCount;

  } catch (error) {
    logger.error('퀴즈 승인 처리 실패', { generationId, error: error.message });
    return 0;
  }
}

async function rejectQuestions(
  logger: Logger,
  generationId: string,
  questionIds?: string[],
  adminId?: string
): Promise<number> {
  try {
    let whereClause = `WHERE generation_id = $1`;
    const params: any[] = [generationId];

    if (questionIds && questionIds.length > 0) {
      whereClause += ` AND id = ANY($2)`;
      params.push(questionIds);
    }

    const result = await executeQuery(
      logger,
      `DELETE FROM quiz_questions_pending ${whereClause}`,
      params
    );

    // 생성 이력 업데이트
    await executeQuery(
      logger,
      `UPDATE ai_generations SET status = 'rejected', rejected_at = $2, rejected_by = $3 WHERE id = $1`,
      [generationId, new Date().toISOString(), adminId]
    );

    return result.data?.length || 0;

  } catch (error) {
    logger.error('퀴즈 거부 처리 실패', { generationId, error: error.message });
    return 0;
  }
} 