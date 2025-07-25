import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { createResponse, handleCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { loadAuthConfig, validateAuthMethod, validatePassword, validateAppVersion, checkLoginAttempts } from '../_shared/auth.ts';
import { createSecurityEvent } from '../_shared/database.ts';
import type { AuthRequest, AuthResponse, UserProfile } from '../_shared/types.ts';

// ============================================================================
// User Signup Edge Function
// ============================================================================

serve(async (req: Request) => {
  const logger = createLogger('auth-signup', req);
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

  logger.apiStart(req.method, '/auth-signup');

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

    // 로그인 시도 제한 확인 (이메일 기준)
    if (email) {
      const { allowed, remainingAttempts } = await checkLoginAttempts(logger, email, authConfig);
      if (!allowed) {
        await logSignupEvent(logger, req, 'signup_blocked', { 
          email, 
          reason: 'rate_limited' 
        });

        return createResponse({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: '너무 많은 시도로 인해 일시적으로 차단되었습니다'
          }
        }, 429);
      }
    }

    const supabase = createClient(
      (globalThis as any).Deno.env.get('SUPABASE_URL')!,
      (globalThis as any).Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let authResult;

    // 인증 방식별 처리
    switch (provider) {
      case 'email':
        authResult = await handleEmailSignup(logger, supabase, email!, password!, authConfig);
        break;
      case 'google':
        authResult = await handleSocialSignup(logger, supabase, 'google', oauth_token!);
        break;
      case 'apple':
        authResult = await handleSocialSignup(logger, supabase, 'apple', oauth_token!);
        break;
      default:
        throw new Error(`지원하지 않는 인증 방식: ${provider}`);
    }

    if (!authResult.success) {
      await logSignupEvent(logger, req, 'signup_failure', {
        email,
        provider,
        error: authResult.error
      });

      return createResponse({
        success: false,
        error: authResult.error
      }, 400);
    }

    // 성공 로그
    await logSignupEvent(logger, req, 'signup_success', {
      user_id: authResult.user.id,
      email: authResult.user.email,
      provider
    });

    const duration = performance.now() - startTime;
    logger.info('회원가입 성공', {
      user_id: authResult.user.id,
      provider,
      duration_ms: duration
    });

    logger.apiEnd(req.method, '/auth-signup', 200, duration);

    return createResponse({
      success: true,
      data: {
        ...authResult,
        auth_config: authConfig // 첫 로그인 시 설정 정보 포함
      }
    });

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('회원가입 처리 중 오류 발생', {
      error: error.message,
      stack: error.stack
    });

    await logSignupEvent(logger, req, 'signup_error', {
      error: error.message
    });

    logger.apiEnd(req.method, '/auth-signup', 500, duration);

    return createResponse({
      success: false,
      error: {
        code: 'SIGNUP_FAILED',
        message: '회원가입 처리 중 오류가 발생했습니다'
      }
    }, 500);
  }
});

// ============================================================================
// 이메일 회원가입 처리
// ============================================================================

async function handleEmailSignup(
  logger: Logger,
  supabase: any,
  email: string,
  password: string,
  authConfig: any
): Promise<{ success: boolean; user?: UserProfile; access_token?: string; refresh_token?: string; expires_in?: number; error?: any }> {
  
  // 비밀번호 검증
  const passwordValidation = validatePassword(password, authConfig);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: passwordValidation.message
      }
    };
  }

  try {
    // 이메일 중복 확인
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return {
        success: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: '이미 사용 중인 이메일입니다'
        }
      };
    }

    // Supabase Auth를 통한 회원가입
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: email.split('@')[0], // 기본 표시명
          auth_provider: 'email'
        }
      }
    });

    if (error) {
      logger.error('Supabase 회원가입 실패', { error: error.message });
      return {
        success: false,
        error: {
          code: 'SUPABASE_SIGNUP_FAILED',
          message: error.message
        }
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: {
          code: 'USER_CREATION_FAILED',
          message: '사용자 생성에 실패했습니다'
        }
      };
    }

    // 사용자 정보를 users 테이블에 저장
    const { error: insertError } = await supabase
      .from('users')
      .insert({
        id: data.user.id,
        email: data.user.email,
        display_name: data.user.user_metadata?.display_name || email.split('@')[0],
        auth_provider: 'email',
        is_verified: data.user.email_confirmed_at !== null,
        is_active: true,
        account_status: 'active',
        login_count: 0,
        failed_login_attempts: 0,
        preferences: {
          language: 'ko',
          notification_enabled: true,
          auto_sync_enabled: true,
          theme: 'system'
        },
        feature_flags: {},
        metadata: {
          signup_method: 'email',
          created_via: 'api'
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      logger.error('사용자 정보 저장 실패', { error: insertError.message });
      // Supabase Auth 사용자 삭제 (cleanup)
      await supabase.auth.admin.deleteUser(data.user.id);
      
      return {
        success: false,
        error: {
          code: 'USER_DATA_SAVE_FAILED',
          message: '사용자 정보 저장에 실패했습니다'
        }
      };
    }

    const userProfile: UserProfile = {
      id: data.user.id,
      email: data.user.email!,
      display_name: data.user.user_metadata?.display_name || email.split('@')[0],
      avatar_url: data.user.user_metadata?.avatar_url,
      auth_provider: 'email',
      is_verified: data.user.email_confirmed_at !== null,
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
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      expires_in: data.session?.expires_in
    };

  } catch (error) {
    logger.error('이메일 회원가입 처리 중 오류', { error: error.message });
    return {
      success: false,
      error: {
        code: 'EMAIL_SIGNUP_ERROR',
        message: '이메일 회원가입 처리 중 오류가 발생했습니다'
      }
    };
  }
}

// ============================================================================
// 소셜 로그인 회원가입 처리
// ============================================================================

async function handleSocialSignup(
  logger: Logger,
  supabase: any,
  provider: 'google' | 'apple',
  oauthToken: string
): Promise<{ success: boolean; user?: UserProfile; access_token?: string; refresh_token?: string; expires_in?: number; error?: any }> {
  
  try {
    // OAuth 토큰을 통한 사용자 정보 획득 및 회원가입
    // 실제 구현에서는 각 프로바이더의 API를 호출하여 사용자 정보를 확인해야 함
    
    logger.info(`${provider} 소셜 회원가입 시작`);

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

    // 소셜 로그인 성공 시 사용자 정보 업데이트/생성
    if (data.user) {
      const { error: upsertError } = await supabase
        .from('users')
        .upsert({
          id: data.user.id,
          email: data.user.email,
          display_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email?.split('@')[0],
          avatar_url: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture,
          auth_provider: provider,
          is_verified: true, // 소셜 로그인은 이미 검증됨
          is_active: true,
          account_status: 'active',
          preferences: {
            language: 'ko',
            notification_enabled: true,
            auto_sync_enabled: true,
            theme: 'system'
          },
          metadata: {
            signup_method: provider,
            created_via: 'api'
          },
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
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_in: data.session?.expires_in
      };
    }

    return {
      success: false,
      error: {
        code: 'SOCIAL_SIGNUP_FAILED',
        message: '소셜 로그인 처리에 실패했습니다'
      }
    };

  } catch (error) {
    logger.error(`${provider} 회원가입 처리 중 오류`, { error: error.message });
    return {
      success: false,
      error: {
        code: 'SOCIAL_SIGNUP_ERROR',
        message: '소셜 회원가입 처리 중 오류가 발생했습니다'
      }
    };
  }
}

// ============================================================================
// 보안 이벤트 로깅
// ============================================================================

async function logSignupEvent(
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