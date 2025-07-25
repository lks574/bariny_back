import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { createResponse, handleCors } from '../_shared/cors.ts';
import { createLogger, type Logger } from '../_shared/logger.ts';
import { loadAuthConfig, validateAuthMethod, validateAppVersion, checkLoginAttempts } from '../_shared/auth.ts';
import { createSecurityEvent, updateUserLastLogin } from '../_shared/database.ts';
import type { AuthRequest, AuthResponse, UserProfile, SessionInfo } from '../_shared/types.ts';

// ============================================================================
// User Signin Edge Function
// ============================================================================

serve(async (req: Request) => {
  const logger = createLogger('auth-signin', req);
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

  logger.apiStart(req.method, '/auth-signin');

  try {
    // 요청 본문 파싱
    const requestBody = await req.json() as AuthRequest;
    const { email, password, provider = 'email', oauth_token, device_info } = requestBody;

    // 인증 설정 로드
    const authConfig = await loadAuthConfig(logger);

    // 앱 버전 검증
    if (device_info?.app_version && !validateAppVersion(device_info.app_version, authConfig)) {
      logger.warn('지원하지 않는 앱 버전', { 
        app_version: device_info.app_version,
        min_version: authConfig.min_app_version_for_auth 
      });

      return createResponse({
        success: false,
        error: {
          code: 'APP_VERSION_NOT_SUPPORTED',
          message: authConfig.deprecated_auth_notice
        }
      }, 400);
    }

    // 인증 방식 검증
    if (!validateAuthMethod(provider, authConfig)) {
      logger.warn('지원하지 않는 인증 방식', { provider });

      return createResponse({
        success: false,
        error: {
          code: 'AUTH_METHOD_NOT_ALLOWED',
          message: `${provider} 로그인이 비활성화되어 있습니다`
        }
      }, 400);
    }

    // 소셜 로그인 강제 확인
    if (authConfig.social_login_required && provider === 'email') {
      return createResponse({
        success: false,
        error: {
          code: 'SOCIAL_LOGIN_REQUIRED',
          message: '소셜 로그인만 허용됩니다'
        }
      }, 400);
    }

    // 로그인 시도 제한 확인
    const identifier = email || getClientIP(req);
    const { allowed, remainingAttempts, lockedUntil } = await checkLoginAttempts(
      logger, 
      identifier, 
      authConfig
    );
    
    if (!allowed) {
      await logSigninEvent(logger, req, 'signin_blocked', { 
        email, 
        reason: 'rate_limited',
        locked_until: lockedUntil?.toISOString()
      });

      return createResponse({
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: `너무 많은 로그인 실패로 계정이 잠겼습니다. ${lockedUntil?.toLocaleString()}까지 대기해주세요.`
        }
      }, 429);
    }

    const supabase = createClient(
      (globalThis as any).Deno.env.get('SUPABASE_URL')!,
      (globalThis as any).Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let authResult;

    // 인증 방식별 처리
    switch (provider) {
      case 'email':
        authResult = await handleEmailSignin(logger, supabase, email!, password!);
        break;
      case 'google':
        authResult = await handleSocialSignin(logger, supabase, 'google', oauth_token!);
        break;
      case 'apple':
        authResult = await handleSocialSignin(logger, supabase, 'apple', oauth_token!);
        break;
      case 'guest':
        if (!authConfig.guest_mode_enabled) {
          return createResponse({
            success: false,
            error: {
              code: 'GUEST_MODE_DISABLED',
              message: '게스트 로그인이 비활성화되어 있습니다'
            }
          }, 400);
        }
        authResult = await handleGuestSignin(logger, supabase, device_info);
        break;
      default:
        throw new Error(`지원하지 않는 인증 방식: ${provider}`);
    }

    if (!authResult.success) {
      // 로그인 실패 이벤트 로깅
      await logSigninEvent(logger, req, 'signin_failure', {
        email,
        provider,
        error: authResult.error,
        remaining_attempts: remainingAttempts
      });

      return createResponse({
        success: false,
        error: authResult.error
      }, 400);
    }

    // 로그인 성공 시 마지막 로그인 시간 업데이트
    if (authResult.user) {
      try {
        await updateUserLastLogin(logger, authResult.user.id);
      } catch (error) {
        logger.warn('마지막 로그인 시간 업데이트 실패', { error: error.message });
      }
    }

    // 세션 정보 생성
    const sessionInfo: SessionInfo = {
      session_id: crypto.randomUUID(),
      device_id: device_info?.device_id || req.headers.get('x-device-id') || '',
      ip_address: getClientIP(req),
      user_agent: req.headers.get('user-agent') || '',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + (authConfig.session_timeout_minutes * 60 * 1000)).toISOString()
    };

    // 세션 정보 저장
    if (authResult.user) {
      try {
        await supabase
          .from('user_sessions')
          .insert({
            user_id: authResult.user.id,
            session_id: sessionInfo.session_id,
            device_id: sessionInfo.device_id,
            ip_address: sessionInfo.ip_address,
            user_agent: sessionInfo.user_agent,
            app_version: device_info?.app_version,
            os_version: device_info?.os_version,
            is_active: true,
            last_activity_at: new Date().toISOString(),
            expires_at: sessionInfo.expires_at,
            metadata: {
              login_method: provider,
              auth_config_version: authConfig
            }
          });
      } catch (error) {
        logger.warn('세션 정보 저장 실패', { error: error.message });
      }
    }

    // 성공 로그
    await logSigninEvent(logger, req, 'signin_success', {
      user_id: authResult.user?.id,
      email: authResult.user?.email,
      provider,
      session_id: sessionInfo.session_id
    });

    const duration = performance.now() - startTime;
    logger.info('로그인 성공', {
      user_id: authResult.user?.id,
      provider,
      duration_ms: duration
    });

    logger.apiEnd(req.method, '/auth-signin', 200, duration);

    // 응답 생성
    const response: AuthResponse = {
      success: true,
      access_token: authResult.access_token!,
      refresh_token: authResult.refresh_token!,
      expires_in: authResult.expires_in!,
      user: authResult.user!,
      session_info: sessionInfo,
      auth_config: authConfig
    };

    return createResponse({
      success: true,
      data: response
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('로그인 처리 중 오류 발생', {
      error: error.message,
      stack: error.stack
    });

    await logSigninEvent(logger, req, 'signin_error', {
      error: error.message
    });

    logger.apiEnd(req.method, '/auth-signin', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'SIGNIN_FAILED',
        message: '로그인 처리 중 오류가 발생했습니다'
      }
    }, 500);
  }
});

// ============================================================================
// 이메일 로그인 처리
// ============================================================================

async function handleEmailSignin(
  logger: Logger,
  supabase: any,
  email: string,
  password: string
): Promise<{ success: boolean; user?: UserProfile; access_token?: string; refresh_token?: string; expires_in?: number; error?: any }> {
  
  try {
    // Supabase Auth를 통한 로그인
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      logger.warn('이메일 로그인 실패', { 
        email, 
        error: error.message 
      });

      return {
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: '이메일 또는 비밀번호가 올바르지 않습니다'
        }
      };
    }

    if (!data.user || !data.session) {
      return {
        success: false,
        error: {
          code: 'LOGIN_FAILED',
          message: '로그인에 실패했습니다'
        }
      };
    }

    // 사용자 정보 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError || !userData) {
      logger.error('사용자 정보 조회 실패', { 
        userId: data.user.id, 
        error: userError?.message 
      });

      return {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '사용자 정보를 찾을 수 없습니다'
        }
      };
    }

    // 계정 상태 확인
    if (!userData.is_active || userData.account_status !== 'active') {
      return {
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: '비활성화된 계정입니다'
        }
      };
    }

    const userProfile: UserProfile = {
      id: userData.id,
      email: userData.email,
      display_name: userData.display_name,
      avatar_url: userData.avatar_url,
      auth_provider: userData.auth_provider,
      is_verified: userData.is_verified,
      created_at: userData.created_at,
      last_login_at: new Date().toISOString(),
      preferences: userData.preferences || {}
    };

    return {
      success: true,
      user: userProfile,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in
    };

  } catch (error) {
    logger.error('이메일 로그인 처리 중 오류', { error: error.message });
    return {
      success: false,
      error: {
        code: 'EMAIL_SIGNIN_ERROR',
        message: '이메일 로그인 처리 중 오류가 발생했습니다'
      }
    };
  }
}

// ============================================================================
// 소셜 로그인 처리
// ============================================================================

async function handleSocialSignin(
  logger: Logger,
  supabase: any,
  provider: 'google' | 'apple',
  oauthToken: string
): Promise<{ success: boolean; user?: UserProfile; access_token?: string; refresh_token?: string; expires_in?: number; error?: any }> {
  
  try {
    logger.info(`${provider} 소셜 로그인 시작`);

    // OAuth 토큰 검증 및 사용자 정보 획득
    // 실제 구현에서는 각 프로바이더의 API를 호출하여 토큰을 검증해야 함

    // Supabase Auth를 통한 OAuth 처리
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: {
        queryParams: {
          access_token: oauthToken
        }
      }
    });

    if (error) {
      logger.error(`${provider} OAuth 실패`, { error: error.message });
      return {
        success: false,
        error: {
          code: 'OAUTH_FAILED',
          message: `${provider} 로그인에 실패했습니다`
        }
      };
    }

    if (!data.user || !data.session) {
      return {
        success: false,
        error: {
          code: 'SOCIAL_LOGIN_FAILED',
          message: '소셜 로그인에 실패했습니다'
        }
      };
    }

    // 사용자 정보 업데이트/생성
    const { error: upsertError } = await supabase
      .from('users')
      .upsert({
        id: data.user.id,
        email: data.user.email,
        display_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email?.split('@')[0],
        avatar_url: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture,
        auth_provider: provider,
        is_verified: true,
        is_active: true,
        account_status: 'active',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (upsertError) {
      logger.error('소셜 사용자 정보 저장 실패', { error: upsertError.message });
    }

    const userProfile: UserProfile = {
      id: data.user.id,
      email: data.user.email!,
      display_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email?.split('@')[0],
      avatar_url: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture,
      auth_provider: provider,
      is_verified: true,
      created_at: data.user.created_at,
      last_login_at: new Date().toISOString(),
      preferences: {
        language: 'ko',
        notification_enabled: true,
        auto_sync_enabled: true,
        theme: 'system'
      }
    };

    return {
      success: true,
      user: userProfile,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in
    };

  } catch (error) {
    logger.error(`${provider} 로그인 처리 중 오류`, { error: error.message });
    return {
      success: false,
      error: {
        code: 'SOCIAL_SIGNIN_ERROR',
        message: '소셜 로그인 처리 중 오류가 발생했습니다'
      }
    };
  }
}

// ============================================================================
// 게스트 로그인 처리
// ============================================================================

async function handleGuestSignin(
  logger: Logger,
  supabase: any,
  deviceInfo?: any
): Promise<{ success: boolean; user?: UserProfile; access_token?: string; refresh_token?: string; expires_in?: number; error?: any }> {
  
  try {
    // 게스트 계정 생성
    const guestEmail = `guest_${crypto.randomUUID()}@brainy.local`;
    const guestPassword = crypto.randomUUID();

    const { data, error } = await supabase.auth.signUp({
      email: guestEmail,
      password: guestPassword,
      options: {
        data: {
          display_name: '게스트 사용자',
          auth_provider: 'guest',
          is_guest: true
        }
      }
    });

    if (error || !data.user) {
      logger.error('게스트 계정 생성 실패', { error: error?.message });
      return {
        success: false,
        error: {
          code: 'GUEST_CREATION_FAILED',
          message: '게스트 계정 생성에 실패했습니다'
        }
      };
    }

    // 게스트 사용자 정보 저장
    const { error: insertError } = await supabase
      .from('users')
      .insert({
        id: data.user.id,
        email: guestEmail,
        display_name: '게스트 사용자',
        auth_provider: 'guest',
        is_verified: false,
        is_active: true,
        account_status: 'active',
        login_count: 0,
        preferences: {
          language: 'ko',
          notification_enabled: false,
          auto_sync_enabled: false,
          theme: 'system'
        },
        metadata: {
          signup_method: 'guest',
          device_info: deviceInfo,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24시간 후 만료
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      logger.error('게스트 사용자 정보 저장 실패', { error: insertError.message });
    }

    const userProfile: UserProfile = {
      id: data.user.id,
      email: guestEmail,
      display_name: '게스트 사용자',
      avatar_url: undefined,
      auth_provider: 'guest',
      is_verified: false,
      created_at: data.user.created_at,
      last_login_at: new Date().toISOString(),
      preferences: {
        language: 'ko',
        notification_enabled: false,
        auto_sync_enabled: false,
        theme: 'system'
      }
    };

    return {
      success: true,
      user: userProfile,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      expires_in: data.session?.expires_in
    };

  } catch (error) {
    logger.error('게스트 로그인 처리 중 오류', { error: error.message });
    return {
      success: false,
      error: {
        code: 'GUEST_SIGNIN_ERROR',
        message: '게스트 로그인 처리 중 오류가 발생했습니다'
      }
    };
  }
}

// ============================================================================
// 유틸리티 함수들
// ============================================================================

async function logSigninEvent(
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
      details.user_id || null,
      eventType,
      ipAddress,
      userAgent,
      {
        device_id: deviceId,
        ...details
      }
    );
  } catch (error) {
    logger.error('보안 이벤트 로깅 실패', { error: error.message });
  }
}

function getClientIP(request: Request): string {
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