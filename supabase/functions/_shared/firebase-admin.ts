// ============================================================================
// Firebase Admin SDK Integration
// ============================================================================

import type { Logger } from './logger.ts';
import { logError, measurePerformance } from './logger.ts';

// Firebase Admin SDK 타입 정의 (실제 런타임에서 사용)
interface FirebaseConfig {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

interface RemoteConfigTemplate {
  conditions: any[];
  parameters: Record<string, any>;
  version: {
    versionNumber: string;
    updateTime: string;
    updateUser: {
      email: string;
    };
    updateOrigin: string;
    updateType: string;
  };
}

interface RemoteConfigUpdateResult {
  success: boolean;
  versionNumber?: string;
  error?: string;
}

// ============================================================================
// Firebase Admin 클라이언트 초기화
// ============================================================================

let firebaseApp: any = null;

function getFirebaseConfig(): FirebaseConfig {
  const requiredEnvVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY_ID', 
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_CLIENT_ID'
  ];

  for (const envVar of requiredEnvVars) {
    if (!(globalThis as any).Deno?.env.get(envVar)) {
      throw new Error(`Firebase 환경 변수 ${envVar}가 설정되지 않았습니다`);
    }
  }

  return {
    type: "service_account",
    project_id: (globalThis as any).Deno.env.get('FIREBASE_PROJECT_ID')!,
    private_key_id: (globalThis as any).Deno.env.get('FIREBASE_PRIVATE_KEY_ID')!,
    private_key: (globalThis as any).Deno.env.get('FIREBASE_PRIVATE_KEY')!.replace(/\\n/g, '\n'),
    client_email: (globalThis as any).Deno.env.get('FIREBASE_CLIENT_EMAIL')!,
    client_id: (globalThis as any).Deno.env.get('FIREBASE_CLIENT_ID')!,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token"
  };
}

async function initializeFirebaseAdmin(logger: Logger): Promise<any> {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    const config = getFirebaseConfig();
    
    // Firebase Admin SDK 동적 import (Deno에서 지원되는 방식)
    const { initializeApp, cert } = await import('firebase-admin/app');
    
    firebaseApp = initializeApp({
      credential: cert(config),
    });

    logger.info('Firebase Admin SDK 초기화 완료', {
      project_id: config.project_id
    });

    return firebaseApp;
  } catch (error) {
    logError(logger, error, { context: 'firebase_admin_init' });
    throw new Error(`Firebase Admin SDK 초기화 실패: ${error.message}`);
  }
}

// ============================================================================
// JWT 토큰 생성 (Firebase Admin API 인증용)
// ============================================================================

async function generateFirebaseJWT(logger: Logger): Promise<string> {
  const timer = measurePerformance(logger, 'firebase_jwt_generation');
  
  try {
    const config = getFirebaseConfig();
    
    // JWT 헤더
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };

    // JWT 페이로드
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: config.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.remoteconfig',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600, // 1시간 후 만료
      iat: now
    };

    // Base64 인코딩
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));

    // 서명할 데이터
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // RS256 서명 생성 (Web Crypto API 사용)
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      new TextEncoder().encode(config.private_key),
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      new TextEncoder().encode(signingInput)
    );

    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)));
    const jwt = `${signingInput}.${encodedSignature}`;

    timer.end(true);
    logger.debug('Firebase JWT 토큰 생성 완료');

    return jwt;
  } catch (error) {
    timer.end(false);
    logError(logger, error, { context: 'firebase_jwt_generation' });
    throw error;
  }
}

// ============================================================================
// Access Token 획득
// ============================================================================

async function getFirebaseAccessToken(logger: Logger): Promise<string> {
  const timer = measurePerformance(logger, 'firebase_access_token');
  
  try {
    const jwt = await generateFirebaseJWT(logger);
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    if (!response.ok) {
      throw new Error(`Firebase 인증 실패: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    timer.end(true);
    logger.debug('Firebase Access Token 획득 완료');

    return data.access_token;
  } catch (error) {
    timer.end(false);
    logError(logger, error, { context: 'firebase_access_token' });
    throw error;
  }
}

// ============================================================================
// Remote Config 관리 함수들
// ============================================================================

export async function updateRemoteConfig(
  logger: Logger,
  updates: Record<string, string>
): Promise<RemoteConfigUpdateResult> {
  const timer = measurePerformance(logger, 'remote_config_update');
  
  try {
    const config = getFirebaseConfig();
    const accessToken = await getFirebaseAccessToken(logger);
    
    // 현재 Remote Config 템플릿 가져오기
    const getCurrentTemplate = async (): Promise<RemoteConfigTemplate> => {
      const response = await fetch(
        `https://firebase.googleapis.com/v1/projects/${config.project_id}/remoteConfig`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept-Encoding': 'gzip'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Remote Config 조회 실패: ${response.status}`);
      }

      return await response.json();
    };

    // 템플릿 업데이트
    const template = await getCurrentTemplate();
    
    // 파라미터 업데이트
    Object.entries(updates).forEach(([key, value]) => {
      if (template.parameters[key]) {
        template.parameters[key].defaultValue.value = value;
      } else {
        // 새 파라미터 추가
        template.parameters[key] = {
          defaultValue: { value },
          description: `자동 생성된 파라미터: ${key}`
        };
      }
    });

    // 버전 정보 업데이트
    template.version = {
      versionNumber: String(Date.now()),
      updateTime: new Date().toISOString(),
      updateUser: {
        email: 'system@brainy-app.com'
      },
      updateOrigin: 'ADMIN_SDK_NODE',
      updateType: 'INCREMENTAL_UPDATE'
    };

    // Remote Config 업데이트 요청
    const response = await fetch(
      `https://firebase.googleapis.com/v1/projects/${config.project_id}/remoteConfig`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; UTF8',
          'If-Match': '*' // ETag 검증 생략
        },
        body: JSON.stringify(template)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Remote Config 업데이트 실패: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    timer.end(true);
    logger.info('Remote Config 업데이트 완료', {
      version_number: result.version?.versionNumber,
      updated_parameters: Object.keys(updates)
    });

    return {
      success: true,
      versionNumber: result.version?.versionNumber
    };

  } catch (error) {
    timer.end(false);
    logError(logger, error, { 
      context: 'remote_config_update',
      updates: Object.keys(updates) 
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getRemoteConfigValue(
  logger: Logger,
  parameterName: string
): Promise<string | null> {
  try {
    const config = getFirebaseConfig();
    const accessToken = await getFirebaseAccessToken(logger);
    
    const response = await fetch(
      `https://firebase.googleapis.com/v1/projects/${config.project_id}/remoteConfig`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Remote Config 조회 실패: ${response.status}`);
    }

    const template = await response.json();
    const parameter = template.parameters[parameterName];
    
    return parameter?.defaultValue?.value || null;
  } catch (error) {
    logError(logger, error, { 
      context: 'remote_config_get_value', 
      parameter: parameterName 
    });
    return null;
  }
}

// ============================================================================
// Health Check
// ============================================================================

export async function checkFirebaseHealth(logger: Logger): Promise<{
  status: 'healthy' | 'unhealthy';
  response_time: number;
  error?: string;
}> {
  const startTime = performance.now();
  
  try {
    const config = getFirebaseConfig();
    const accessToken = await getFirebaseAccessToken(logger);
    
    // Remote Config API 상태 확인
    const response = await fetch(
      `https://firebase.googleapis.com/v1/projects/${config.project_id}/remoteConfig`,
      {
        method: 'HEAD',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const responseTime = performance.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        response_time: responseTime,
        error: `Firebase API HTTP ${response.status}: ${response.statusText}`
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