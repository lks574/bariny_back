import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createResponse, handleCors } from '../_shared/cors.ts';
import { createLogger, type Logger } from '../_shared/logger.ts';
import { getQuizQuestions, uploadFileToStorage, getPublicFileUrl } from '../_shared/database.ts';
import type { QuizDataFile, QuizFileGenerationResponse } from '../_shared/types.ts';

// ============================================================================
// Quiz Data Management Edge Function
// ============================================================================

serve(async (req: Request) => {
  const logger = createLogger('quiz-data', req);
  const startTime = performance.now();
  
  // CORS 처리
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  logger.apiStart(req.method, '/quiz-data');

  try {
    if (req.method === 'GET') {
      return await handleGetQuizData(logger, req);
    } else if (req.method === 'POST') {
      return await handleGenerateQuizFile(logger, req);
    } else {
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
    logger.error('퀴즈 데이터 API 오류 발생', {
      error: error.message,
      stack: error.stack
    });

    logger.apiEnd(req.method, '/quiz-data', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '서버 내부 오류가 발생했습니다'
      }
    }, 500);
  }
});

// ============================================================================
// GET: 퀴즈 데이터 조회
// ============================================================================

async function handleGetQuizData(logger: Logger, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const limit = parseInt(url.searchParams.get('limit') || '100');

  try {
    logger.info('퀴즈 데이터 조회 시작', { category, limit });

    const { data: questions, error } = await getQuizQuestions(logger, category || undefined, limit);

    if (error || !questions) {
      return createResponse({
        success: false,
        error: {
          code: 'DATA_FETCH_FAILED',
          message: '퀴즈 데이터 조회에 실패했습니다'
        }
      }, 500);
    }

    const questionsArray = Array.isArray(questions) ? questions : [];

    logger.apiEnd(req.method, '/quiz-data', 200, performance.now());

    return createResponse({
      success: true,
      data: {
        questions: questionsArray,
        total_count: questionsArray.length,
        category: category || 'all',
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('퀴즈 데이터 조회 실패', { error: error.message });

    return createResponse({
      success: false,
      error: {
        code: 'DATA_FETCH_FAILED',
        message: '퀴즈 데이터 조회에 실패했습니다'
      }
    }, 500);
  }
}

// ============================================================================
// POST: 퀴즈 데이터 파일 생성 및 Remote Config 업데이트
// ============================================================================

async function handleGenerateQuizFile(logger: Logger, req: Request): Promise<Response> {
  const startTime = performance.now();
  
  try {
    // 요청 본문 파싱 (선택적 파라미터)
    let requestBody: any = {};
    try {
      const body = await req.text();
      if (body) {
        requestBody = JSON.parse(body);
      }
    } catch {
      // 빈 요청 본문은 허용
    }

    const {
      version = `${Date.now()}`,
      categories = ['person', 'general', 'country', 'drama', 'music'],
      includeInactive = false
    } = requestBody;

    logger.info('퀴즈 파일 생성 시작', { 
      version, 
      categories, 
      includeInactive 
    });

    // 1. 데이터베이스에서 퀴즈 데이터 조회
    const allQuestions: any[] = [];
    
    for (const category of categories) {
      const { data: questions, error } = await getQuizQuestions(logger, category, 1000);
      
      if (error) {
        logger.warn(`카테고리 ${category} 퀴즈 조회 실패`, { error: error.message });
        continue;
      }
      
      if (questions && Array.isArray(questions)) {
        allQuestions.push(...questions);
      } else {
        logger.warn(`카테고리 ${category}에서 유효하지 않은 데이터 형식`, { questions });
      }
    }

    if (allQuestions.length === 0) {
      return createResponse({
        success: false,
        error: {
          code: 'NO_DATA_FOUND',
          message: '생성할 퀴즈 데이터가 없습니다'
        }
      }, 404);
    }

    // 2. JSON 파일 데이터 구성
    const quizDataFile: QuizDataFile = {
      version,
      generated_at: new Date().toISOString(),
      questions: allQuestions,
      total_count: allQuestions.length,
      categories,
      meta: {
        last_updated: new Date().toISOString(),
        source: 'database'
      }
    };

    // 3. JSON 파일 생성 및 Storage에 업로드
    const fileName = `quiz_data_v${version}.json`;
    const fileContent = JSON.stringify(quizDataFile, null, 2);
    const fileData = new TextEncoder().encode(fileContent);

    logger.info('파일 업로드 시작', { 
      fileName, 
      fileSize: fileData.length 
    });

    await uploadFileToStorage(
      logger,
      'quiz-files',
      fileName,
      fileData.buffer,
      'application/json'
    );

    // 4. 공개 URL 생성
    const downloadUrl = await getPublicFileUrl(logger, 'quiz-files', fileName);

    // 5. 응답 생성
    const response: QuizFileGenerationResponse = {
      success: true,
      message: '퀴즈 데이터 파일이 성공적으로 생성되었습니다',
      file_info: {
        filename: fileName,
        version,
        download_url: downloadUrl,
        size_bytes: fileData.length,
        questions_count: allQuestions.length,
        categories
      },
      generated_at: new Date().toISOString()
    };

    const duration = performance.now() - startTime;
    logger.info('퀴즈 파일 생성 완료', {
      duration_ms: duration,
      questions_count: allQuestions.length
    });

    logger.apiEnd(req.method, '/quiz-data', 200, duration);

    return createResponse({
      success: true,
      data: response
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('퀴즈 파일 생성 실패', {
      error: error.message,
      stack: error.stack
    });

    logger.apiEnd(req.method, '/quiz-data', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'FILE_GENERATION_FAILED',
        message: '퀴즈 데이터 파일 생성에 실패했습니다',
        details: error.message
      }
    }, 500);
  }
}

// ============================================================================
// 유틸리티 함수들
// ============================================================================

function generateVersionNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  
  return `${year}.${month}.${day}.${time}`;
}

function validateCategories(categories: any): boolean {
  const validCategories = ['person', 'general', 'country', 'drama', 'music'];
  
  if (!Array.isArray(categories)) {
    return false;
  }
  
  return categories.every(cat => 
    typeof cat === 'string' && validCategories.includes(cat)
  );
} 