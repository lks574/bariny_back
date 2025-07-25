import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createResponse, handleCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkFirebaseHealth } from '../_shared/firebase-admin.ts';
import type { HealthCheck } from '../_shared/types.ts';

// ============================================================================
// Health Check Edge Function
// ============================================================================

serve(async (req: Request) => {
  const logger = createLogger('health', req);
  const startTime = performance.now();
  
  // CORS 처리
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  logger.apiStart(req.method, '/health');

  try {
    const healthCheck: HealthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: await checkDatabase(),
        auth: await checkAuth(),
        storage: await checkStorage(),
        firebase: await checkFirebaseHealth(logger)
      },
      total_response_time: 0
    };

    // 전체 응답 시간 계산
    healthCheck.total_response_time = performance.now() - startTime;

    // 서비스 중 하나라도 unhealthy면 전체 상태를 unhealthy로 변경
    const isUnhealthy = Object.values(healthCheck.services).some(
      service => service.status === 'unhealthy'
    );

    if (isUnhealthy) {
      healthCheck.status = 'unhealthy';
    }

    // 응답 상태 코드 결정
    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;

    logger.apiEnd(req.method, '/health', statusCode, healthCheck.total_response_time);

    return createResponse({
      success: true,
      data: healthCheck
    }, statusCode);

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('헬스체크 실행 중 오류 발생', {
      error: error.message,
      stack: error.stack
    });

    logger.apiEnd(req.method, '/health', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: '헬스체크 실행 중 오류가 발생했습니다'
      }
    }, 500);
  }
});

// ============================================================================
// Individual Service Health Checks
// ============================================================================

async function checkDatabase(): Promise<{
  status: 'healthy' | 'unhealthy';
  response_time: number;
  error?: string;
}> {
  const startTime = performance.now();
  
  try {
    // Supabase 클라이언트를 통한 데이터베이스 연결 확인
    const supabaseUrl = (globalThis as any).Deno?.env.get('SUPABASE_URL');
    const supabaseKey = (globalThis as any).Deno?.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return {
        status: 'unhealthy',
        response_time: performance.now() - startTime,
        error: 'Supabase 환경 변수가 설정되지 않음'
      };
    }

    // 간단한 HTTP 요청으로 Supabase API 상태 확인
    const response = await fetch(`${supabaseUrl}/rest/v1/quiz_versions?select=count`, {
      method: 'HEAD',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    const responseTime = performance.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        response_time: responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    return {
      status: 'healthy',
      response_time: responseTime
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      response_time: performance.now() - startTime,
      error: error.message
    };
  }
}

async function checkAuth(): Promise<{
  status: 'healthy' | 'unhealthy';
  response_time: number;
  error?: string;
}> {
  const startTime = performance.now();
  
  try {
    const supabaseUrl = (globalThis as any).Deno?.env.get('SUPABASE_URL');
    const supabaseKey = (globalThis as any).Deno?.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return {
        status: 'unhealthy',
        response_time: performance.now() - startTime,
        error: 'Supabase 인증 환경 변수가 설정되지 않음'
      };
    }

    // Supabase Auth API 상태 확인
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey
      }
    });

    const responseTime = performance.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        response_time: responseTime,
        error: `Auth API HTTP ${response.status}: ${response.statusText}`
      };
    }

    return {
      status: 'healthy',
      response_time: responseTime
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      response_time: performance.now() - startTime,
      error: error.message
    };
  }
}

async function checkStorage(): Promise<{
  status: 'healthy' | 'unhealthy';
  response_time: number;
  error?: string;
}> {
  const startTime = performance.now();
  
  try {
    const supabaseUrl = (globalThis as any).Deno?.env.get('SUPABASE_URL');
    const supabaseKey = (globalThis as any).Deno?.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return {
        status: 'unhealthy',
        response_time: performance.now() - startTime,
        error: 'Supabase Storage 환경 변수가 설정되지 않음'
      };
    }

    // Storage API 상태 확인 (버킷 목록 조회)
    const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    const responseTime = performance.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        response_time: responseTime,
        error: `Storage API HTTP ${response.status}: ${response.statusText}`
      };
    }

    return {
      status: 'healthy',
      response_time: responseTime
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      response_time: performance.now() - startTime,
      error: error.message
    };
  }
} 