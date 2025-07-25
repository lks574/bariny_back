import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from './logger.ts';
import { logError, measurePerformance } from './logger.ts';

// ============================================================================
// Database Configuration
// ============================================================================

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase 환경 변수가 설정되지 않았습니다');
    }

    supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public'
      }
    });
  }

  return supabaseClient;
}

// ============================================================================
// Database Query Helpers
// ============================================================================

export async function executeQuery<T>(
  logger: Logger,
  queryName: string,
  queryFn: () => Promise<{ data: T | null; error: any }>
): Promise<T> {
  const timer = measurePerformance(logger, `db_query_${queryName}`);
  
  try {
    const { data, error } = await queryFn();
    
    if (error) {
      timer.end(false);
      logger.error(`데이터베이스 쿼리 실패: ${queryName}`, {
        error_message: error.message,
        error_details: error.details,
        error_hint: error.hint
      });
      throw new Error(`데이터베이스 오류: ${error.message}`);
    }

    timer.end(true);
    logger.debug(`데이터베이스 쿼리 성공: ${queryName}`);
    
    return data!;
  } catch (error) {
    timer.end(false);
    logError(logger, error, { query_name: queryName });
    throw error;
  }
}

export async function executeTransaction<T>(
  logger: Logger,
  transactionName: string,
  operations: ((client: SupabaseClient) => Promise<T>)[]
): Promise<T[]> {
  const timer = measurePerformance(logger, `db_transaction_${transactionName}`);
  const client = getSupabaseClient();
  
  try {
    logger.info(`트랜잭션 시작: ${transactionName}`);
    
    // Supabase는 자동 트랜잭션을 지원하지 않으므로 
    // RPC 함수를 사용하거나 개별 작업을 순차 실행
    const results: T[] = [];
    
    for (const operation of operations) {
      const result = await operation(client);
      results.push(result);
    }
    
    timer.end(true);
    logger.info(`트랜잭션 완료: ${transactionName}`);
    
    return results;
  } catch (error) {
    timer.end(false);
    logError(logger, error, { transaction_name: transactionName });
    throw error;
  }
}

// ============================================================================
// User Management Helpers
// ============================================================================

export async function getUserById(logger: Logger, userId: string) {
  return executeQuery(logger, 'get_user_by_id', async () => {
    const client = getSupabaseClient();
    return await client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
  });
}

export async function updateUserLastLogin(logger: Logger, userId: string) {
  return executeQuery(logger, 'update_user_last_login', async () => {
    const client = getSupabaseClient();
    return await client
      .from('users')
      .update({
        last_login_at: new Date().toISOString(),
        login_count: client.rpc('increment_login_count', { user_id: userId })
      })
      .eq('id', userId);
  });
}

export async function createSecurityEvent(
  logger: Logger,
  userId: string | null,
  eventType: string,
  ipAddress: string,
  userAgent: string,
  details: any
) {
  return executeQuery(logger, 'create_security_event', async () => {
    const client = getSupabaseClient();
    return await client
      .from('security_events')
      .insert({
        user_id: userId,
        event_type: eventType,
        ip_address: ipAddress,
        user_agent: userAgent,
        details,
        timestamp: new Date().toISOString()
      });
  });
}

// ============================================================================
// Quiz Data Helpers
// ============================================================================

export async function getQuizQuestions(
  logger: Logger,
  category?: string,
  limit: number = 100
) {
  return executeQuery(logger, 'get_quiz_questions', async () => {
    const client = getSupabaseClient();
    let query = client
      .from('quiz_questions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    return await query;
  });
}

export async function createQuizQuestion(logger: Logger, questionData: any) {
  return executeQuery(logger, 'create_quiz_question', async () => {
    const client = getSupabaseClient();
    return await client
      .from('quiz_questions')
      .insert({
        ...questionData,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
  });
}

export async function getQuizSessionsByUser(
  logger: Logger,
  userId: string,
  limit: number = 50
) {
  return executeQuery(logger, 'get_quiz_sessions_by_user', async () => {
    const client = getSupabaseClient();
    return await client
      .from('quiz_sessions')
      .select(`
        *,
        quiz_results (*)
      `)
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);
  });
}

export async function saveQuizResults(logger: Logger, results: any[]) {
  return executeQuery(logger, 'save_quiz_results', async () => {
    const client = getSupabaseClient();
    return await client
      .from('quiz_results')
      .upsert(results, {
        onConflict: 'id',
        ignoreDuplicates: false
      });
  });
}

// ============================================================================
// Storage Helpers
// ============================================================================

export async function uploadFileToStorage(
  logger: Logger,
  bucketName: string,
  fileName: string,
  fileData: ArrayBuffer,
  contentType: string = 'application/octet-stream'
) {
  const timer = measurePerformance(logger, 'storage_upload');
  
  try {
    const client = getSupabaseClient();
    
    const { data, error } = await client.storage
      .from(bucketName)
      .upload(fileName, fileData, {
        contentType,
        upsert: true
      });

    if (error) {
      timer.end(false);
      throw new Error(`파일 업로드 실패: ${error.message}`);
    }

    timer.end(true);
    logger.info('파일 업로드 성공', {
      bucket: bucketName,
      file_name: fileName,
      file_size: fileData.byteLength
    });

    return data;
  } catch (error) {
    timer.end(false);
    logError(logger, error, { bucket: bucketName, file_name: fileName });
    throw error;
  }
}

export async function getPublicFileUrl(
  logger: Logger,
  bucketName: string,
  fileName: string
): Promise<string> {
  try {
    const client = getSupabaseClient();
    
    const { data } = client.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    logger.debug('공개 URL 생성', {
      bucket: bucketName,
      file_name: fileName,
      public_url: data.publicUrl
    });

    return data.publicUrl;
  } catch (error) {
    logError(logger, error, { bucket: bucketName, file_name: fileName });
    throw error;
  }
}

// ============================================================================
// Health Check Helpers
// ============================================================================

export async function checkDatabaseHealth(logger: Logger): Promise<{
  status: 'healthy' | 'unhealthy';
  response_time: number;
  error?: string;
}> {
  const startTime = performance.now();
  
  try {
    const client = getSupabaseClient();
    
    // 간단한 쿼리로 데이터베이스 연결 확인
    const { error } = await client
      .from('users')
      .select('count')
      .limit(1);

    const responseTime = performance.now() - startTime;

    if (error) {
      return {
        status: 'unhealthy',
        response_time: responseTime,
        error: error.message
      };
    }

    return {
      status: 'healthy',
      response_time: responseTime
    };
  } catch (error) {
    const responseTime = performance.now() - startTime;
    return {
      status: 'unhealthy',
      response_time: responseTime,
      error: error.message
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function generateId(): string {
  return crypto.randomUUID();
}

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
} 