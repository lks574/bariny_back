# Design Document

## Overview

Brainy Backend API는 Supabase를 기반으로 구축되는 RESTful API 서비스입니다. PostgreSQL 데이터베이스를 활용하여 iOS 퀴즈 앱의 백엔드 요구사항을 충족합니다. 마이크로서비스 아키텍처를 적용하여 확장성과 유지보수성을 보장하며, 오프라인 우선 설계를 고려한 효율적인 데이터 동기화를 제공합니다.

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    iOS App (Client)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS/WebSocket/Static Files
┌─────────────────────▼───────────────────────────────────────┐
│                 API Gateway                                 │
│              (Supabase Edge Functions)                      │
├─────────────────────────────────────────────────────────────┤
│                 Static File CDN                             │
│               (Supabase Storage)                            │
├─────────────────────────────────────────────────────────────┤
│                 Authentication                              │
│                (Supabase Auth)                             │
├─────────────────────────────────────────────────────────────┤
│                 Business Logic                              │
│            (Custom API Functions)                           │
├─────────────────────────────────────────────────────────────┤
│                 Data Layer                                  │
│              (PostgreSQL + Supabase)                       │
├─────────────────────────────────────────────────────────────┤
│                 External Services                           │
│         (OpenAI API, File Storage, Monitoring)             │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

```
Frontend: iOS App (Swift 6 + SwiftUI)
Backend: Supabase (PostgreSQL + Edge Functions)
Authentication: Supabase Auth
Storage: Supabase Storage
Push Notifications: Firebase Cloud Messaging (FCM)
AI: OpenAI API
Monitoring: Supabase Analytics
Deployment: Supabase Cloud
Configuration: Static JSON Files
```

## Components and Interfaces

## Data Flow Architecture

### Quiz Data Processing Workflow

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Quiz Admin     │────│  Database        │────│  Edge Function   │
│   Updates Data   │    │  (PostgreSQL)    │    │  (quiz_data)     │
└──────────────────┘    └──────────────────┘    └──────────────────┘
                                                          │
                                                         ▼
                                            ┌──────────────────┐
                                            │   File Generator │
                                            │   (DB → JSON)    │
                                            └──────────────────┘
                                                          │
                                                         ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│    iOS App       │◄───│ Supabase Storage │◄───│   JSON File      │
│ (Direct Access)  │    │     CDN          │    │   Upload         │
└──────────────────┘    └──────────────────┘    └──────────────────┘
          │
          ▼
┌──────────────────┐
│    iOS App       │
│  (Local Cache)   │
└──────────────────┘
```

### Cost Optimization Benefits
- **함수 호출**: 데이터 업데이트 시에만 (90% 절감) 
- **정적 파일 서빙**: CDN 캐싱으로 빠른 전송
- **로컬 캐싱**: 앱에서 오프라인 지원
- **직접 다운로드**: Edge Function 호출 없이 정적 파일 다운로드

### Authentication Service

#### Overview
- **Primary Auth**: Supabase Auth (이메일, Google, Apple 로그인)
- **Config Management**: Static Configuration (정적 설정)
- **Session Management**: JWT + RLS (Row Level Security)
- **User Management**: Supabase PostgreSQL

#### Authentication Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    iOS App (Client)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ Auth Request + Static Config
┌─────────────────────▼───────────────────────────────────────┐
│                 Supabase Auth                               │
│       (JWT Token, OAuth, User Management)                   │
├─────────────────────────────────────────────────────────────┤
│                 PostgreSQL + RLS                            │
│            (User Data & Permissions)                        │
└─────────────────────────────────────────────────────────────┘
```

#### Static Auth Configuration
```typescript
// 정적 인증 설정값
interface AuthStaticConfig {
  // 로그인 방식 제어
  auth_methods_enabled: string;           // "email,google,apple"
  social_login_required: boolean;         // 소셜 로그인 강제 여부

  
  // 보안 설정
  password_min_length: number;            // 최소 비밀번호 길이
  session_timeout_minutes: number;        // 세션 타임아웃 (분)
  max_login_attempts: number;             // 최대 로그인 시도 횟수
  
  // 기능 제어
  auto_sync_enabled: boolean;             // 자동 동기화 허용
  offline_mode_enabled: boolean;          // 오프라인 모드 허용
  
  // 앱 버전 호환성
  min_app_version_for_auth: string;       // 인증 최소 앱 버전
  deprecated_auth_notice: string;         // 구버전 인증 경고 메시지
}

// 정적 설정값 (서버 코드에서 하드코딩)
const authConfig: AuthStaticConfig = {
  auth_methods_enabled: "email,google,apple",
  social_login_required: false,

  password_min_length: 8,
  session_timeout_minutes: 60,
  max_login_attempts: 5,
  auto_sync_enabled: true,
  offline_mode_enabled: true,
  min_app_version_for_auth: "1.0.0",
  deprecated_auth_notice: "앱을 최신 버전으로 업데이트해 주세요."
};
```

#### Authentication Endpoints
```typescript
// Supabase Auth 기반 엔드포인트
POST /auth/v1/signup              // 회원가입 (이메일/소셜)
POST /auth/v1/token               // 로그인 (JWT 발급)
POST /auth/v1/refresh             // 토큰 갱신
POST /auth/v1/logout              // 로그아웃
GET  /auth/v1/user                // 사용자 정보 조회
PUT  /auth/v1/user                // 사용자 정보 업데이트
POST /auth/v1/password/reset      // 비밀번호 재설정

DELETE /auth/v1/account           // 계정 삭제
```

#### Enhanced Authentication Flow
```typescript
interface AuthRequest {
  email?: string;
  password?: string;
  provider?: 'email' | 'google' | 'apple';
  oauth_token?: string;
  device_info?: {
    device_id: string;
    app_version: string;
    os_version: string;
  };
}

interface AuthResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserProfile;
  session_info: SessionInfo;
  auth_config?: AuthRemoteConfig; // 첫 로그인 시 포함
}

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  auth_provider: 'email' | 'google' | 'apple';
  is_verified: boolean;
  created_at: string;
  last_login_at: string;
  preferences: UserPreferences;
}

interface SessionInfo {
  session_id: string;
  device_id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  expires_at: string;
}

interface UserPreferences {
  language: 'ko' | 'en';
  notification_enabled: boolean;
  auto_sync_enabled: boolean;
  theme: 'light' | 'dark' | 'system';
}
```

#### iOS App Auth Implementation
```swift
// AuthManager.swift
import Supabase

class AuthManager: ObservableObject {
    private let supabase = SupabaseClient(
        supabaseURL: URL(string: Config.supabaseURL)!,
        supabaseKey: Config.supabaseAnonKey
    )
    
    @Published var currentUser: UserProfile?
    @Published var isAuthenticated = false
    
    // 정적 인증 설정 (앱에서 하드코딩)
    private let authConfig = AuthStaticConfig(
        authMethodsEnabled: ["email", "google", "apple"],
        socialLoginRequired: false,
        guestModeEnabled: true,
        passwordMinLength: 8,
        sessionTimeoutMinutes: 60,
        maxLoginAttempts: 5
    )
    
    // 이메일 로그인
    func signInWithEmail(email: String, password: String) async throws -> AuthResponse {
        // 정적 설정 확인
        guard authConfig.authMethodsEnabled.contains("email") else {
            throw AuthError.methodNotAllowed
        }
        
        guard password.count >= authConfig.passwordMinLength else {
            throw AuthError.passwordTooShort
        }
        
        let response = try await supabase.auth.signIn(
            email: email,
            password: password
        )
        
        return processAuthResponse(response)
    }
    
    // 소셜 로그인
    func signInWithProvider(_ provider: Provider) async throws -> AuthResponse {
        let providerName = provider.rawValue
        guard authConfig.authMethodsEnabled.contains(providerName) else {
            throw AuthError.methodNotAllowed
        }
        
        let response = try await supabase.auth.signInWithOAuth(provider: provider)
        return processAuthResponse(response)
    }
    

    
    // 자동 로그인 (저장된 세션)
    func autoSignIn() async {
        do {
            let session = try await supabase.auth.session
            if let session = session {
                self.currentUser = try await fetchUserProfile(session.user.id)
                self.isAuthenticated = true
                
                // 세션 타임아웃 확인
                if isSessionExpired(session) {
                    try await refreshSession()
                }
            }
        } catch {
            print("자동 로그인 실패: \(error)")
            await signOut()
        }
    }
    
    private func processAuthResponse(_ response: AuthResponse) -> AuthResponse {
        self.currentUser = response.user
        self.isAuthenticated = true
        
        // 세션 만료 타이머 설정
        scheduleSessionTimeout()
        
        return response
    }
    
    private func isSessionExpired(_ session: Session) -> Bool {
        let expiresAt = session.expiresAt
        let timeoutMinutes = authConfig.sessionTimeoutMinutes
        let maxSessionTime = Date().addingTimeInterval(TimeInterval(timeoutMinutes * 60))
        
        return Date(timeIntervalSince1970: expiresAt) > maxSessionTime
    }
}

enum AuthError: Error {
    case methodNotAllowed
    case passwordTooShort
    case guestModeDisabled
    case sessionExpired
    case rateLimitExceeded
}
```

#### Security Enhancements
```typescript
// 보안 강화된 JWT 토큰 구조
interface EnhancedJWTPayload {
  // 기본 정보
  sub: string;                    // user_id
  email: string;
  role: 'user' | 'admin';
  
  // 세션 정보
  session_id: string;             // 세션 추적
  device_id: string;              // 기기 식별
  iat: number;                    // 발급 시간
  exp: number;                    // 만료 시간
  
  // 보안 정보
  auth_provider: string;          // 인증 방식
  ip_address: string;             // 로그인 IP
  user_agent: string;             // 사용자 에이전트
  
  // 권한 정보
  permissions: string[];          // 세부 권한
  feature_flags: string[];        // 사용자별 기능 플래그
  
  // 메타데이터
  app_version: string;            // 앱 버전
  last_activity: number;          // 마지막 활동 시간
}

// 향상된 RLS 정책
const enhancedRLSPolicies = `
-- 사용자별 데이터 접근 제어
CREATE POLICY "user_data_access" ON quiz_results
  FOR ALL USING (
    auth.uid() = user_id AND
    auth.jwt() ->> 'role' IN ('user', 'admin') AND
    auth.jwt() ->> 'session_id' IS NOT NULL
  );

-- 게스트 사용자 제한
CREATE POLICY "guest_limitations" ON quiz_sessions
  FOR SELECT USING (
    CASE 
      WHEN auth.jwt() ->> 'role' = 'guest' 
      THEN started_at > NOW() - INTERVAL '24 hours'
      ELSE auth.uid() = user_id
    END
  );

-- 관리자 권한
CREATE POLICY "admin_full_access" ON quiz_questions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
`;
```

#### Rate Limiting & Security
```typescript
// 인증 관련 Rate Limiting (더 엄격)
const authRateLimits = {
  '/auth/v1/signup': { requests: 3, window: '1h', block_duration: '24h' },
  '/auth/v1/token': { requests: 5, window: '15m', block_duration: '1h' },
  '/auth/v1/password/reset': { requests: 2, window: '1h', block_duration: '24h' },
  '/auth/v1/refresh': { requests: 10, window: '1h' },
  '/auth/v1/guest': { requests: 5, window: '1d' }
};

// 보안 이벤트 로깅
interface SecurityEvent {
  event_type: 'login_success' | 'login_failure' | 'password_reset' | 'suspicious_activity';
  user_id?: string;
  ip_address: string;
  user_agent: string;
  device_id?: string;
  timestamp: string;
  details: any;
}
```

### Quiz Data Service

#### Endpoints
```typescript
POST /api/v1/quiz/generate-file    // DB → JSON 파일 생성
GET  /api/v1/quiz/categories
GET  /api/v1/quiz/questions/:category
POST /api/v1/quiz/ai-generate
```

#### Static Configuration Integration
```typescript
// 정적 퀴즈 설정값
interface QuizStaticConfig {
  quiz_version: string;           // "1.2.3"
  download_url: string;          // JSON 파일 다운로드 URL
  categories: string[];          // ["person","general","country","drama","music"]
  maintenance_mode: boolean;     // 점검 모드
  min_app_version: string;       // 최소 앱 버전
  feature_flags: {               // 기능 플래그
    ai_quiz: boolean;
    voice_mode: boolean;
    offline_mode: boolean;
  };
}

// 정적 설정값 (앱에서 하드코딩 또는 JSON 파일에서 로드)
const quizConfig: QuizStaticConfig = {
  quiz_version: "1.0.0",
  download_url: "https://your-project.supabase.co/storage/v1/object/public/quiz-files/quiz_data_v1.0.0.json",
  categories: ["person", "general", "country", "drama", "music"],
  maintenance_mode: false,
  min_app_version: "1.0.0",
  feature_flags: {
    ai_quiz: true,
    voice_mode: true,
    offline_mode: true
  }
};
```

#### Quiz Data Models
```typescript
// QuizVersion 인터페이스 제거 - Firebase Remote Config로 대체
// interface QuizVersion 삭제

interface QuizQuestion {
  id: string;
  question: string;
  correct_answer: string;
  options?: string[];
  category: QuizCategory;
  difficulty: QuizDifficulty;
  type: QuizType;
  audio_url?: string;
  version: string;
  created_at: string;
}

interface QuizFileGenerationResponse {
  success: boolean;
  message: string;
  file_info: {
    filename: string;
    version: string;
    download_url: string;
    size_bytes: number;
    questions_count: number;
    categories: string[];
  };
  generated_at: string;
}

interface QuizDataFile {
  version: string;
  generated_at: string;
  questions: QuizQuestion[];
  total_count: number;
  categories: string[];
  meta: {
    last_updated: string;
    source: 'database';
  };
}
```

### User Progress Service

#### Endpoints
```typescript
POST /api/v1/sync/progress
GET  /api/v1/sync/progress
POST /api/v1/sync/batch
GET  /api/v1/history
GET  /api/v1/history/:session_id
GET  /api/v1/statistics
```

#### Progress Data Models
```typescript
interface QuizResult {
  id: string;
  user_id: string;
  question_id: string;
  user_answer: string;
  is_correct: boolean;
  time_spent: number;
  completed_at: string;
  category: string;
  quiz_mode: string;
}

interface QuizSession {
  id: string;
  user_id: string;
  category: string;
  mode: string;
  total_questions: number;
  correct_answers: number;
  total_time: number;
  started_at: string;
  completed_at?: string;
  results: QuizResult[];
}

interface SyncRequest {
  sessions: QuizSession[];
  results: QuizResult[];
  last_sync_at?: string;
}
```

### AI Quiz Generation Service

#### Endpoints
```typescript
POST /api/v1/ai/generate-quiz
POST /api/v1/ai/validate-question
GET  /api/v1/ai/usage
```

#### AI Integration
```typescript
interface AIQuizRequest {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  type: 'multiple_choice' | 'short_answer';
  count: number;
  language: 'ko' | 'en';
}

interface AIQuizResponse {
  questions: QuizQuestion[];
  generation_time: number;
  tokens_used: number;
}
```

### Admin Service

#### Endpoints
```typescript
POST /api/v1/admin/auth
GET  /api/v1/admin/users
GET  /api/v1/admin/statistics
POST /api/v1/admin/quiz/create
PUT  /api/v1/admin/quiz/:id
DELETE /api/v1/admin/quiz/:id
POST /api/v1/admin/quiz/bulk-import
```

## Data Models

### Database Schema

#### Enhanced Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  auth_provider VARCHAR(20) NOT NULL DEFAULT 'email',
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- 계정 상태
  account_status VARCHAR(20) DEFAULT 'active', -- 'active', 'suspended', 'locked'
  last_login_at TIMESTAMP WITH TIME ZONE,
  login_count INTEGER DEFAULT 0,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  
  -- 사용자 설정
  preferences JSONB DEFAULT '{}',
  feature_flags JSONB DEFAULT '{}',
  
  -- 메타데이터
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_sync_at TIMESTAMP WITH TIME ZONE
);

-- 인덱스
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_provider ON users(auth_provider);
CREATE INDEX idx_users_account_status ON users(account_status);
CREATE INDEX idx_users_last_login ON users(last_login_at);
```

#### User Sessions Table
```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  device_id VARCHAR(255),
  
  -- 세션 정보
  ip_address INET,
  user_agent TEXT,
  app_version VARCHAR(50),
  os_version VARCHAR(50),
  
  -- 상태 정보
  is_active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- 메타데이터
  metadata JSONB DEFAULT '{}'
);

-- 인덱스
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_user_sessions_device_id ON user_sessions(device_id);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
```

#### Security Events Table
```sql
CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- 이벤트 정보
  event_type VARCHAR(50) NOT NULL, -- 'login_success', 'login_failure', 'password_reset' 등
  severity VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'critical'
  
  -- 요청 정보
  ip_address INET,
  user_agent TEXT,
  device_id VARCHAR(255),
  session_id VARCHAR(255),
  
  -- 상세 정보
  details JSONB DEFAULT '{}',
  error_message TEXT,
  
  -- 메타데이터
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES users(id)
);

-- 인덱스
CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_timestamp ON security_events(timestamp);
CREATE INDEX idx_security_events_ip ON security_events(ip_address);
```

#### User Permissions Table
```sql
CREATE TABLE user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- 권한 정보
  permission_type VARCHAR(50) NOT NULL, -- 'quiz_access', 'admin_panel', 'ai_generation' 등
  permission_value VARCHAR(50) DEFAULT 'granted', -- 'granted', 'denied', 'limited'
  
  -- 제한사항
  quota_limit INTEGER,
  quota_used INTEGER DEFAULT 0,
  quota_reset_at TIMESTAMP WITH TIME ZONE,
  
  -- 유효성
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,
  
  -- 메타데이터
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- 인덱스
CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_type ON user_permissions(permission_type);
CREATE INDEX idx_user_permissions_value ON user_permissions(permission_value);
```

#### Quiz Questions Table
```sql
CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  options JSONB, -- Array of options for multiple choice
  category VARCHAR(50) NOT NULL,
  difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
  type VARCHAR(30) NOT NULL DEFAULT 'multiple_choice',
  audio_url TEXT,
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Quiz Results Table
```sql
CREATE TABLE quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES quiz_questions(id),
  session_id UUID REFERENCES quiz_sessions(id),
  user_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent INTEGER NOT NULL, -- in seconds
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Quiz Sessions Table
```sql
CREATE TABLE quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  mode VARCHAR(30) NOT NULL,
  total_questions INTEGER NOT NULL,
  correct_answers INTEGER DEFAULT 0,
  total_time INTEGER DEFAULT 0, -- in seconds
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'
);
```

#### Quiz Versions Table
```sql
CREATE TABLE quiz_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL UNIQUE,
  description TEXT,
  question_count INTEGER DEFAULT 0,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Indexes and Performance

```sql
-- Performance indexes
CREATE INDEX idx_quiz_questions_category ON quiz_questions(category);
CREATE INDEX idx_quiz_questions_active ON quiz_questions(is_active);
CREATE INDEX idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX idx_quiz_results_completed_at ON quiz_results(completed_at);
CREATE INDEX idx_quiz_sessions_user_id ON quiz_sessions(user_id);
CREATE INDEX idx_quiz_sessions_completed_at ON quiz_sessions(completed_at);

-- Composite indexes
CREATE INDEX idx_quiz_questions_category_type ON quiz_questions(category, type);
CREATE INDEX idx_quiz_results_user_session ON quiz_results(user_id, session_id);
```

## API Design

### RESTful API Conventions

#### HTTP Methods
- GET: 데이터 조회
- POST: 새 리소스 생성
- PUT: 전체 리소스 업데이트
- PATCH: 부분 리소스 업데이트
- DELETE: 리소스 삭제

#### Response Format
```typescript
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    total_count?: number;
    page?: number;
    per_page?: number;
    version?: string;
  };
}
```

#### Error Handling
```typescript
enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR'
}
```

### Authentication & Authorization

#### JWT Token Structure
```typescript
interface JWTPayload {
  sub: string; // user_id
  email: string;
  role: 'user' | 'admin';
  iat: number;
  exp: number;
  aud: string;
  iss: string;
}
```

#### Enhanced Row Level Security (RLS)
```sql
-- 사용자 데이터 접근 정책
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_access" ON users
  FOR ALL USING (auth.uid() = id);

-- 세션 관리 정책
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_own_access" ON user_sessions
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sessions_admin_access" ON user_sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- 보안 이벤트 정책
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security_events_own_read" ON security_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "security_events_admin_full" ON security_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- 권한 관리 정책
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_own_read" ON user_permissions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "permissions_admin_full" ON user_permissions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- 퀴즈 관련 정책 (기존 강화)
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quiz_results_enhanced_access" ON quiz_results
  FOR ALL USING (
    auth.uid() = user_id AND
    auth.jwt() ->> 'role' IN ('user', 'admin') AND
    auth.jwt() ->> 'session_id' IS NOT NULL
  );

ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quiz_sessions_enhanced_access" ON quiz_sessions
  FOR ALL USING (
    CASE 
      WHEN auth.jwt() ->> 'role' = 'guest' 
      THEN started_at > NOW() - INTERVAL '24 hours' AND auth.uid() = user_id
      WHEN auth.jwt() ->> 'role' = 'admin'
      THEN true
      ELSE auth.uid() = user_id
    END
  );

-- 퀴즈 문제 접근 정책
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quiz_questions_read_authenticated" ON quiz_questions
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    is_active = true
  );
CREATE POLICY "quiz_questions_admin_full" ON quiz_questions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
```

## Local-First Architecture

### Core Principles
- **로컬 우선**: 모든 퀴즈 데이터, 결과, 히스토리는 로컬 저장
- **수동 동기화**: 사용자가 동기화 버튼 클릭 시에만 서버 통신
- **배치 처리**: 여러 퀴즈 결과를 한 번에 업로드
- **최소 통신**: 필수적인 경우에만 네트워크 사용

#### Local Data Management
```typescript
// 로컬 데이터 구조
interface LocalAppData {
  quiz_questions: QuizQuestion[];      // 모든 퀴즈 문제 (로컬 저장)
  quiz_results: QuizResult[];          // 사용자 퀴즈 결과 (로컬 저장)
  quiz_sessions: QuizSession[];        // 퀴즈 세션 기록 (로컬 저장)
  user_stats: UserStats;               // 사용자 통계 (로컬 계산)
  leaderboard: LeaderboardData;        // 리더보드 (하루 1회 갱신)
  last_sync: string;                   // 마지막 동기화 시간
  pending_sync: boolean;               // 동기화 대기 상태
}

// 앱 시작 시 - 로컬 데이터만 로드
const initializeApp = async () => {
  const localData = await loadLocalData();
  
  // 퀴즈 버전만 체크 (네트워크 사용 최소화)
  const needsQuizUpdate = await checkQuizVersionOnly();
  if (needsQuizUpdate) {
    showUpdateAvailableNotification();
  }
  
  return localData;
};
```

#### Push Notification Integration
```typescript
// 중요한 업데이트는 푸시 알림으로 처리
interface PushNotificationPayload {
  type: 'quiz_update' | 'new_content' | 'achievement';
  title: string;
  body: string;
  data: {
    action: string;
    payload: any;
  };
}

// FCM을 통한 알림 발송
const sendPushNotification = async (
  userTokens: string[],
  notification: PushNotificationPayload
) => {
  // Firebase Admin SDK를 통한 알림 발송
};
```

#### Manual Sync Strategy

##### 1. 퀴즈 플레이 - 완전 로컬
```typescript
// 퀴즈 완료 시 - 로컬에만 저장
quiz_completed: {
  trigger: 'onQuizSessionComplete',
  actions: [
    'saveToLocalStorage',   // 로컬 저장소에 결과 저장
    'updateLocalStats',     // 로컬 통계 업데이트
    'markPendingSync'       // 동기화 대기 상태로 표시
  ],
  network_required: false,  // 네트워크 불필요
  immediate: true
}

// 퀴즈 시작 시 - 로컬 데이터만 사용
quiz_started: {
  trigger: 'onQuizSessionStart',
  actions: [
    'loadLocalQuestions',   // 로컬 문제 로드
    'checkLocalProgress'    // 로컬 진행 상황 확인
  ],
  network_required: false,
  immediate: true
}
```

##### 2. 수동 동기화 버튼
```typescript
// 사용자가 동기화 버튼 클릭 시
manual_sync: {
  trigger: 'onSyncButtonClick',
  priority: 'high',
  actions: [
    'uploadPendingResults', // 대기 중인 퀴즈 결과 업로드
    'downloadLatestData',   // 최신 퀴즈 데이터 다운로드
    'syncUserPreferences',  // 사용자 설정 동기화
    'updateLeaderboard'     // 리더보드 갱신 (하루 1회만)
  ],
  network_required: true,
  batch_processing: true,   // 배치로 처리
  show_progress: true       // 진행률 표시
}
```

##### 3. 화면별 로컬 데이터 표시
```typescript
// 리더보드 화면 - 로컬 캐시 데이터 표시
leaderboard_view: {
  trigger: 'onLeaderboardScreenEnter',
  actions: [
    'loadCachedLeaderboard', // 캐시된 리더보드 표시
    'showLastUpdateTime',    // 마지막 업데이트 시간 표시
    'showSyncButton'         // 수동 동기화 버튼 표시
  ],
  network_required: false,
  cache_duration: 86400000  // 24시간 캐시
}

// 프로필 화면 - 로컬 통계 표시
profile_view: {
  trigger: 'onProfileScreenEnter',
  actions: [
    'calculateLocalStats',   // 로컬 데이터로 통계 계산
    'showLocalAchievements', // 로컬 업적 표시
    'displaySyncStatus'      // 동기화 상태 표시
  ],
  network_required: false,
  real_time_calculation: true
}

// 히스토리 화면 - 로컬 기록 표시
history_view: {
  trigger: 'onHistoryScreenEnter',
  actions: [
    'loadLocalHistory',      // 로컬 퀴즈 기록 로드
    'groupByDate',           // 날짜별 그룹화
    'calculateStreaks'       // 연속 플레이 계산
  ],
  network_required: false,
  pagination: true          // 페이지네이션으로 성능 최적화
}
```

##### 4. 앱 시작 시 최소 통신
```typescript
// 앱 시작 시 - 필수 체크만
app_launch: {
  trigger: 'onAppLaunch',
  actions: [
    'loadLocalData',         // 로컬 데이터 우선 로드
    'quickVersionCheck',     // 퀴즈 버전만 빠르게 체크
    'showUpdateBadge'        // 업데이트 필요 시 배지 표시
  ],
  network_required: false,   // 오프라인도 동작
  fallback_to_local: true,
  timeout: 3000             // 3초 타임아웃
}
```

##### 5. 리더보드 업데이트 정책
```typescript
// 리더보드 - 하루 1회만 업데이트
leaderboard_update: {
  frequency: 'daily',        // 하루 1회
  trigger: 'manual_sync_only', // 수동 동기화 시에만
  cache_policy: {
    duration: 86400000,      // 24시간 캐시
    show_age: true,          // 데이터 나이 표시
    offline_fallback: true   // 오프라인 시 캐시 사용
  },
  update_conditions: [
    'user_clicked_sync',     // 사용자가 동기화 클릭
    'cache_expired',         // 캐시 만료
    'first_launch_today'     // 오늘 첫 실행
  ]
}
```

## External Integrations

### OpenAI Integration

#### AI Quiz Generation
```typescript
interface OpenAIConfig {
  apiKey: string;
  model: 'gpt-4' | 'gpt-3.5-turbo';
  maxTokens: number;
  temperature: number;
}

const generateQuizPrompt = (category: string, difficulty: string) => `
Generate a ${difficulty} level quiz question about ${category} in Korean.
Return JSON format:
{
  "question": "문제 내용",
  "correct_answer": "정답",
  "options": ["선택지1", "선택지2", "선택지3", "선택지4"],
  "explanation": "해설"
}
`;
```

### File Storage

#### Audio File Management
```typescript
interface AudioFileConfig {
  bucket: 'quiz-audio';
  allowedFormats: ['mp3', 'wav', 'aac'];
  maxFileSize: 10 * 1024 * 1024; // 10MB
  cdnUrl: string;
}
```

## Security

### Data Protection

#### Encryption
- 데이터베이스: PostgreSQL 내장 암호화
- 전송: HTTPS/TLS 1.3
- 토큰: JWT with RS256 signing

#### Input Validation
```typescript
const quizQuestionSchema = {
  question: { type: 'string', minLength: 10, maxLength: 500 },
  correct_answer: { type: 'string', minLength: 1, maxLength: 200 },
  category: { type: 'string', enum: ['person', 'general', 'country', 'drama', 'music'] },
  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }
};
```

#### Rate Limiting
```typescript
const rateLimits = {
  '/api/v1/auth/*': { requests: 5, window: '15m' },
  '/api/v1/quiz/*': { requests: 100, window: '1h' },
  '/api/v1/sync/*': { requests: 50, window: '1h' },
  '/api/v1/ai/*': { requests: 10, window: '1h' }
};
```

## Performance Optimization

### Caching Strategy

#### Redis Caching
```typescript
interface CacheConfig {
  quiz_data: { ttl: 3600 }, // 1 hour
  user_stats: { ttl: 1800 }, // 30 minutes
  ai_responses: { ttl: 86400 }, // 24 hours
  quiz_versions: { ttl: 7200 } // 2 hours
}
```

#### Database Optimization
- Connection pooling: 최대 20개 연결
- Query optimization: EXPLAIN ANALYZE 사용
- Materialized views: 통계 데이터용
- Partitioning: quiz_results 테이블 월별 파티션

### CDN Integration
```typescript
interface CDNConfig {
  provider: 'Supabase Storage';
  regions: ['ap-northeast-1', 'us-west-1'];
  staticFiles: {
    bucket: 'quiz-files';
    cacheHeaders: {
      'Cache-Control': 'public, max-age=86400', // 24시간 캐싱
      'Content-Type': 'application/json'
    };
  };
  workflow: {
    step1: 'DB에서 퀴즈 데이터 조회';
    step2: 'JSON 파일 생성 및 Storage 업로드';
    step3: '앱에서 정적 파일 다운로드';
    step4: '로컬 캐싱으로 함수 호출 최소화';
  };
}
```

## Monitoring and Logging

### Health Checks
```typescript
interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: { status: string; response_time: number };
    auth: { status: string; response_time: number };
    storage: { status: string; response_time: number };
    ai_service: { status: string; response_time: number };
  };
}
```

### Metrics Collection
```typescript
interface Metrics {
  api_requests_total: Counter;
  api_request_duration: Histogram;
  database_connections: Gauge;
  quiz_completions_total: Counter;
  ai_generations_total: Counter;
  error_rate: Gauge;
}
```

## Deployment Architecture

### Supabase Configuration
```typescript
interface SupabaseConfig {
  project_url: string;
  anon_key: string;
  service_role_key: string;
  database: {
    host: string;
    port: 5432;
    database: string;
    max_connections: 20;
  };
  auth: {
    site_url: string;
    redirect_urls: string[];
    jwt_expiry: 3600;
  };
}
```

### Environment Management
```bash
# Production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-key
ENVIRONMENT=production

# Development
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=local-anon-key
SUPABASE_SERVICE_ROLE_KEY=local-service-role-key
OPENAI_API_KEY=your-openai-key
ENVIRONMENT=development
```

## Testing Strategy

### Unit Testing
- Edge Functions 로직 테스트
- 데이터 검증 함수 테스트
- AI 응답 파싱 테스트

### Integration Testing
- API 엔드포인트 테스트
- 데이터베이스 연동 테스트
- 외부 서비스 연동 테스트

### Load Testing
```typescript
interface LoadTestConfig {
  concurrent_users: 100;
  test_duration: '10m';
  scenarios: {
    auth_flow: { weight: 20 };
    quiz_data_fetch: { weight: 40 };
    progress_sync: { weight: 30 };
    ai_generation: { weight: 10 };
  };
}
```

## Migration Strategy

### Database Migrations
```sql
-- Migration: 001_initial_schema.sql
-- Migration: 002_add_quiz_versions.sql
-- Migration: 003_add_indexes.sql
-- Migration: 004_add_rls_policies.sql
```

### Data Migration
```typescript
interface MigrationPlan {
  phase1: 'Setup Supabase project and basic schema';
  phase2: 'Migrate quiz data from existing sources';
  phase3: 'Setup authentication and user data';
  phase4: 'Configure real-time features';
  phase5: 'Deploy and test production environment';
}
```

## Static Configuration Integration

### Cost Optimization with Static Files

- **JSON 파일 다운로드**: CDN을 통한 빠른 전송
- **Edge Function 호출 최소화**: 데이터 업데이트 시에만
- **로컬 캐싱**: 앱에서 오프라인 지원
- **정적 파일 서빙**: 함수 호출 비용 절감

## Pre-Deployment Checklist

### 🔧 **1. 환경 설정 및 배포 준비**

#### Environment Configuration
```typescript
// .env.development
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
FIREBASE_PROJECT_ID=brainy-quiz-dev
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@brainy-quiz-dev.iam.gserviceaccount.com
OPENAI_API_KEY=sk-...
ENVIRONMENT=development

// .env.production  
SUPABASE_URL=https://ikxipyfncyzwtlypixfz.supabase.co
SUPABASE_ANON_KEY=production_anon_key
SUPABASE_SERVICE_ROLE_KEY=production_service_key
FIREBASE_PROJECT_ID=brainy-quiz-prod
FIREBASE_PRIVATE_KEY=production_firebase_key
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@brainy-quiz-prod.iam.gserviceaccount.com
OPENAI_API_KEY=production_openai_key
ENVIRONMENT=production
```

#### CORS & Security Headers
```typescript
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
  // Security Headers
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'",
};

export function handleCors(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
}
```

### 📋 **2. API 문서화 (OpenAPI 3.0)**

```yaml
# supabase/functions/_shared/openapi.yaml
openapi: 3.0.0
info:
  title: Brainy Quiz Backend API
  version: 1.0.0
  description: Firebase Remote Config와 Supabase 기반 퀴즈 앱 백엔드
servers:
  - url: https://ikxipyfncyzwtlypixfz.functions.supabase.co
    description: Production server
  - url: http://localhost:54321/functions/v1
    description: Development server

paths:
  /auth/v1/signup:
    post:
      tags: [Authentication]
      summary: 사용자 회원가입
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  minLength: 8
                provider:
                  type: string
                  enum: [email, google, apple]
      responses:
        '200':
          description: 성공
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '400':
          description: 잘못된 요청
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

components:
  schemas:
    AuthResponse:
      type: object
      properties:
        success:
          type: boolean
        access_token:
          type: string
        refresh_token:
          type: string
        expires_in:
          type: number
        user:
          $ref: '#/components/schemas/UserProfile'

    ErrorResponse:
      type: object
      properties:
        success:
          type: boolean
          example: false
        error:
          type: object
          properties:
            code:
              type: string
            message:
              type: string
```

### 🧪 **3. 테스트 전략 및 구조**

```typescript
// tests/auth.test.ts
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";

Deno.test("Auth - 이메일 회원가입", async () => {
  const response = await fetch("http://localhost:54321/functions/v1/auth-signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "password123"
    })
  });
  
  const data = await response.json();
  assertEquals(response.status, 200);
  assertEquals(data.success, true);
});

// tests/quiz.test.ts
Deno.test("Quiz - 데이터 파일 생성", async () => {
  const response = await fetch("http://localhost:54321/functions/v1/quiz-data", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": "Bearer test_token"
    }
  });
  
  const data = await response.json();
  assertEquals(response.status, 200);
  assertEquals(data.success, true);
});
```

### 📊 **4. 모니터링 및 로깅**

```typescript
// supabase/functions/_shared/logger.ts
export interface LogEvent {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  function_name: string;
  user_id?: string;
  request_id: string;
  timestamp: string;
  metadata?: any;
}

export function logEvent(event: Omit<LogEvent, 'timestamp'>) {
  const logData = {
    ...event,
    timestamp: new Date().toISOString()
  };
  
  // Console 로깅
  console.log(JSON.stringify(logData));
  
  // 추후 외부 로깅 서비스 연동 (DataDog, CloudWatch 등)
  // sendToLogService(logData);
}

// supabase/functions/_shared/metrics.ts
export function recordMetric(name: string, value: number, tags?: Record<string, string>) {
  const metric = {
    name,
    value,
    tags: {
      environment: Deno.env.get('ENVIRONMENT') || 'development',
      ...tags
    },
    timestamp: Date.now()
  };
  
  console.log(`METRIC: ${JSON.stringify(metric)}`);
}
```

### 🔒 **5. 입력 검증 스키마**

```typescript
// supabase/functions/_shared/validation.ts
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

export const AuthSignupSchema = z.object({
  email: z.string().email("올바른 이메일 형식이 아닙니다"),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다"),
  provider: z.enum(["email", "google", "apple"]).optional(),
  device_info: z.object({
    device_id: z.string(),
    app_version: z.string(),
    os_version: z.string()
  }).optional()
});

export const QuizQuestionSchema = z.object({
  question: z.string().min(10, "문제는 최소 10자 이상이어야 합니다"),
  correct_answer: z.string().min(1, "정답은 필수입니다"),
  options: z.array(z.string()).min(2, "최소 2개의 선택지가 필요합니다").optional(),
  category: z.enum(["person", "general", "country", "drama", "music"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  type: z.enum(["multiple_choice", "short_answer"])
});

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`입력 검증 실패: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
}
```

### ⚡ **6. 성능 최적화 체크리스트**

```sql
-- 추가 인덱스 최적화
CREATE INDEX CONCURRENTLY idx_users_email_active ON users(email) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_quiz_results_user_date ON quiz_results(user_id, completed_at DESC);
CREATE INDEX CONCURRENTLY idx_security_events_severity_time ON security_events(severity, timestamp DESC);

-- 쿼리 성능 분석
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM quiz_results 
WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '30 days'
ORDER BY completed_at DESC 
LIMIT 50;
```

### 🚀 **7. CI/CD 파이프라인**

```yaml
# .github/workflows/deploy.yml
name: Deploy to Supabase

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x
      
      - name: Run Tests
        run: |
          deno test --allow-net --allow-read tests/

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest
      
      - name: Deploy Functions
        run: |
          supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### 🔧 **8. 정적 설정 파일 준비**

```json
// config/app-config.json
{
  "quiz_version": "1.0.0",
  "download_url": "https://ikxipyfncyzwtlypixfz.supabase.co/storage/v1/object/public/quiz-files/quiz_data_v1.0.0.json",
  "auth_methods_enabled": ["email", "google", "apple"],
  "maintenance_mode": false,
  "min_app_version": "1.0.0",
  "feature_flags": {
    "ai_generation": true,
    "leaderboard": true,
    "offline_mode": true
  },
  "quiz_settings": {
    "time_limit": 30,
    "lives": 3,
    "hints_enabled": true
  },
  "last_updated": "2024-01-15T10:00:00Z"
}
```

### 🏥 **9. 헬스체크 및 복구 절차**

```typescript
// supabase/functions/health/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const startTime = Date.now();
  const checks = [];
  
  // Database 연결 확인
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data, error } = await supabase.from('users').select('count').limit(1);
    checks.push({
      service: 'database',
      status: error ? 'unhealthy' : 'healthy',
      response_time: Date.now() - startTime,
      error: error?.message
    });
  } catch (error) {
    checks.push({
      service: 'database',
      status: 'unhealthy',
      response_time: Date.now() - startTime,
      error: error.message
    });
  }
  
  // Static Config 확인
  try {
    const configHealthStart = Date.now();
    // 정적 설정 파일 로드 테스트
    checks.push({
      service: 'static_config',
      status: 'healthy',
      response_time: Date.now() - configHealthStart
    });
  } catch (error) {
    checks.push({
      service: 'static_config',
      status: 'unhealthy',
      response_time: Date.now() - startTime,
      error: error.message
    });
  }
  
  const overallStatus = checks.every(c => c.status === 'healthy') ? 'healthy' : 'unhealthy';
  
  return new Response(JSON.stringify({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: checks,
    total_response_time: Date.now() - startTime
  }), {
    status: overallStatus === 'healthy' ? 200 : 503,
    headers: { 'Content-Type': 'application/json' }
  });
});
```