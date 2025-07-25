// ============================================================================
// Authentication Middleware and Utilities
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { Logger } from './logger.ts';
import { logError, logSecurityEvent } from './logger.ts';
import { getRemoteConfigValue } from './firebase-admin.ts';
import { createSecurityEvent } from './database.ts';
import type { AuthRemoteConfig, UserProfile } from './types.ts';

// ============================================================================
// JWT 토큰 검증 미들웨어
// ============================================================================

export interface AuthContext {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isGuest: boolean;
  sessionId?: string;
  deviceId?: string;
  authConfig?: AuthRemoteConfig;
}

export async function verifyAuthToken(
  logger: Logger,
  request: Request
): Promise<AuthContext> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      isGuest: false
    };
  }

  const token = authHeader.substring(7);

  try {
    const supabase = createClient(
      (globalThis as any).Deno.env.get('SUPABASE_URL')!,
      (globalThis as any).Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // JWT 토큰 검증
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('JWT 토큰 검증 실패', { error: error?.message });
      return {
        user: null,
        isAuthenticated: false,
        isAdmin: false,
        isGuest: false
      };
    }

    // 사용자 정보 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      logger.warn('사용자 정보 조회 실패', { 
        userId: user.id, 
        error: userError?.message 
      });
      return {
        user: null,
        isAuthenticated: false,
        isAdmin: false,
        isGuest: false
      };
    }

    // JWT 토큰에서 추가 정보 추출
    const payload = parseJWTPayload(token);
    const role = payload?.role || 'user';
    const sessionId = payload?.session_id;

    const userProfile: UserProfile = {
      id: userData.id,
      email: userData.email,
      display_name: userData.display_name,
      avatar_url: userData.avatar_url,
      auth_provider: userData.auth_provider,
      is_verified: userData.is_verified,
      created_at: userData.created_at,
      last_login_at: userData.last_login_at,
      preferences: userData.preferences || {}
    };

    logger.debug('JWT 토큰 검증 성공', {
      userId: user.id,
      role,
      sessionId
    });

    return {
      user: userProfile,
      isAuthenticated: true,
      isAdmin: role === 'admin',
      isGuest: role === 'guest',
      sessionId,
      deviceId: request.headers.get('x-device-id') || undefined
    };

  } catch (error) {
    logError(logger, error, { context: 'jwt_verification' });
    
    // 보안 이벤트 로깅
    await logSecurityEventAsync(logger, request, 'invalid_token', {
      token_prefix: token.substring(0, 20),
      error: error.message
    });

    return {
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      isGuest: false
    };
  }
}

// ============================================================================
// Firebase Remote Config 인증 설정 로드
// ============================================================================

export async function loadAuthConfig(logger: Logger): Promise<AuthRemoteConfig> {
  try {
    const [
      authMethodsEnabled,
      socialLoginRequired,
      guestModeEnabled,
      passwordMinLength,
      sessionTimeoutMinutes,
      maxLoginAttempts,
      autoSyncEnabled,
      offlineModeEnabled,
      minAppVersionForAuth,
      deprecatedAuthNotice
    ] = await Promise.all([
      getRemoteConfigValue(logger, 'auth_methods_enabled'),
      getRemoteConfigValue(logger, 'social_login_required'),
      getRemoteConfigValue(logger, 'guest_mode_enabled'),
      getRemoteConfigValue(logger, 'password_min_length'),
      getRemoteConfigValue(logger, 'session_timeout_minutes'),
      getRemoteConfigValue(logger, 'max_login_attempts'),
      getRemoteConfigValue(logger, 'auto_sync_enabled'),
      getRemoteConfigValue(logger, 'offline_mode_enabled'),
      getRemoteConfigValue(logger, 'min_app_version_for_auth'),
      getRemoteConfigValue(logger, 'deprecated_auth_notice')
    ]);

    return {
      auth_methods_enabled: authMethodsEnabled || 'email,google,apple',
      social_login_required: socialLoginRequired === 'true',
      guest_mode_enabled: guestModeEnabled !== 'false',
      password_min_length: parseInt(passwordMinLength || '8'),
      session_timeout_minutes: parseInt(sessionTimeoutMinutes || '60'),
      max_login_attempts: parseInt(maxLoginAttempts || '5'),
      auto_sync_enabled: autoSyncEnabled !== 'false',
      offline_mode_enabled: offlineModeEnabled !== 'false',
      min_app_version_for_auth: minAppVersionForAuth || '1.0.0',
      deprecated_auth_notice: deprecatedAuthNotice || '앱을 최신 버전으로 업데이트해 주세요.'
    };

  } catch (error) {
    logError(logger, error, { context: 'load_auth_config' });
    
    // 기본값 반환
    return {
      auth_methods_enabled: 'email,google,apple',
      social_login_required: false,
      guest_mode_enabled: true,
      password_min_length: 8,
      session_timeout_minutes: 60,
      max_login_attempts: 5,
      auto_sync_enabled: true,
      offline_mode_enabled: true,
      min_app_version_for_auth: '1.0.0',
      deprecated_auth_notice: '앱을 최신 버전으로 업데이트해 주세요.'
    };
  }
}

// ============================================================================
// 인증 검증 함수들
// ============================================================================

export function validateAuthMethod(
  method: string, 
  authConfig: AuthRemoteConfig
): boolean {
  const enabledMethods = authConfig.auth_methods_enabled.split(',');
  return enabledMethods.includes(method);
}

export function validatePassword(
  password: string, 
  authConfig: AuthRemoteConfig
): { valid: boolean; message?: string } {
  if (password.length < authConfig.password_min_length) {
    return {
      valid: false,
      message: `비밀번호는 최소 ${authConfig.password_min_length}자 이상이어야 합니다`
    };
  }

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    return {
      valid: false,
      message: '비밀번호는 영문 대소문자와 숫자를 포함해야 합니다'
    };
  }

  return { valid: true };
}

export function validateAppVersion(
  appVersion: string,
  authConfig: AuthRemoteConfig
): boolean {
  if (!appVersion) return false;
  
  const minVersion = authConfig.min_app_version_for_auth;
  return compareVersions(appVersion, minVersion) >= 0;
}

// ============================================================================
// 로그인 시도 제한 확인
// ============================================================================

export async function checkLoginAttempts(
  logger: Logger,
  identifier: string, // email 또는 IP
  authConfig: AuthRemoteConfig
): Promise<{ allowed: boolean; remainingAttempts?: number; lockedUntil?: Date }> {
  try {
    const supabase = createClient(
      (globalThis as any).Deno.env.get('SUPABASE_URL')!,
      (globalThis as any).Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 최근 1시간 내 실패한 로그인 시도 조회
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const { data: events, error } = await supabase
      .from('security_events')
      .select('*')
      .eq('event_type', 'login_failure')
      .or(`ip_address.eq.${identifier},details->>email.eq.${identifier}`)
      .gte('timestamp', oneHourAgo.toISOString())
      .order('timestamp', { ascending: false });

    if (error) {
      logger.error('로그인 시도 조회 실패', { error: error.message });
      return { allowed: true }; // 오류 시 허용
    }

    const failureCount = events?.length || 0;
    const remainingAttempts = Math.max(0, authConfig.max_login_attempts - failureCount);

    if (failureCount >= authConfig.max_login_attempts) {
      // 계정 잠금 시간 계산 (1시간)
      const lockedUntil = new Date(Date.now() + 60 * 60 * 1000);
      
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil
      };
    }

    return {
      allowed: true,
      remainingAttempts
    };

  } catch (error) {
    logError(logger, error, { context: 'check_login_attempts' });
    return { allowed: true }; // 오류 시 허용
  }
}

// ============================================================================
// 보안 이벤트 로깅
// ============================================================================

async function logSecurityEventAsync(
  logger: Logger,
  request: Request,
  eventType: string,
  details: any
): Promise<void> {
  try {
    const ipAddress = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || '';
    const deviceId = request.headers.get('x-device-id') || '';

    await createSecurityEvent(
      logger,
      null, // userId는 인증 실패 시 null
      eventType,
      ipAddress,
      userAgent,
      {
        device_id: deviceId,
        ...details
      }
    );
  } catch (error) {
    logError(logger, error, { context: 'log_security_event' });
  }
}

// ============================================================================
// 유틸리티 함수들
// ============================================================================

function parseJWTPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);
  
  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1 = v1Parts[i] || 0;
    const v2 = v2Parts[i] || 0;
    
    if (v1 > v2) return 1;
    if (v1 < v2) return -1;
  }
  
  return 0;
}

function getClientIP(request: Request): string {
  // Cloudflare, Vercel 등의 프록시 헤더 확인
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  return 'unknown';
}

// ============================================================================
// 인증 미들웨어 래퍼
// ============================================================================

export function requireAuth(handler: (authContext: AuthContext, request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const logger = createLogger('auth_middleware', request);
    
    try {
      const authContext = await verifyAuthToken(logger, request);
      
      if (!authContext.isAuthenticated) {
        return new Response(JSON.stringify({
          success: false,
          error: {
            code: 'AUTHENTICATION_FAILED',
            message: '인증이 필요합니다'
          }
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return await handler(authContext, request);
    } catch (error) {
      logError(logger, error, { context: 'auth_middleware' });
      
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: '서버 내부 오류가 발생했습니다'
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
}

export function requireAdmin(handler: (authContext: AuthContext, request: Request) => Promise<Response>) {
  return requireAuth(async (authContext: AuthContext, request: Request) => {
    if (!authContext.isAdmin) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: 'AUTHORIZATION_FAILED',
          message: '관리자 권한이 필요합니다'
        }
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return await handler(authContext, request);
  });
} 