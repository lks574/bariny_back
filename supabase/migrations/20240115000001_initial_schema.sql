-- ============================================================================
-- Initial Schema Migration
-- Created: 2024-01-15
-- Description: 기본 테이블 구조 및 보안 정책 설정
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Enhanced Users Table
-- ============================================================================

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

-- ============================================================================
-- User Sessions Table
-- ============================================================================

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

-- ============================================================================
-- Security Events Table
-- ============================================================================

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

-- ============================================================================
-- User Permissions Table
-- ============================================================================

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

-- ============================================================================
-- Quiz Questions Table
-- ============================================================================

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

-- ============================================================================
-- Quiz Sessions Table
-- ============================================================================

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

-- ============================================================================
-- Quiz Results Table
-- ============================================================================

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

-- ============================================================================
-- Quiz Versions Table
-- ============================================================================

CREATE TABLE quiz_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL UNIQUE,
  description TEXT,
  question_count INTEGER DEFAULT 0,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- Performance Indexes
-- ============================================================================

-- Users table indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_provider ON users(auth_provider);
CREATE INDEX idx_users_account_status ON users(account_status);
CREATE INDEX idx_users_last_login ON users(last_login_at);

-- User sessions indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_user_sessions_device_id ON user_sessions(device_id);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Security events indexes
CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_timestamp ON security_events(timestamp);
CREATE INDEX idx_security_events_ip ON security_events(ip_address);

-- User permissions indexes
CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_type ON user_permissions(permission_type);
CREATE INDEX idx_user_permissions_value ON user_permissions(permission_value);

-- Quiz questions indexes
CREATE INDEX idx_quiz_questions_category ON quiz_questions(category);
CREATE INDEX idx_quiz_questions_active ON quiz_questions(is_active);
CREATE INDEX idx_quiz_questions_category_type ON quiz_questions(category, type);

-- Quiz results indexes
CREATE INDEX idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX idx_quiz_results_completed_at ON quiz_results(completed_at);
CREATE INDEX idx_quiz_results_user_session ON quiz_results(user_id, session_id);

-- Quiz sessions indexes
CREATE INDEX idx_quiz_sessions_user_id ON quiz_sessions(user_id);
CREATE INDEX idx_quiz_sessions_completed_at ON quiz_sessions(completed_at);

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to increment login count
CREATE OR REPLACE FUNCTION increment_login_count(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE users 
  SET login_count = login_count + 1,
      updated_at = NOW()
  WHERE id = user_id
  RETURNING login_count INTO new_count;
  
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at for users table
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for quiz_questions table
CREATE TRIGGER update_quiz_questions_updated_at 
  BEFORE UPDATE ON quiz_questions 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_versions ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "users_own_access" ON users
  FOR ALL USING (auth.uid() = id);

-- User sessions policies
CREATE POLICY "sessions_own_access" ON user_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "sessions_admin_access" ON user_sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Security events policies
CREATE POLICY "security_events_own_read" ON security_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "security_events_admin_full" ON security_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- User permissions policies
CREATE POLICY "permissions_own_read" ON user_permissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "permissions_admin_full" ON user_permissions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Quiz questions policies
CREATE POLICY "quiz_questions_read_authenticated" ON quiz_questions
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    is_active = true
  );

CREATE POLICY "quiz_questions_admin_full" ON quiz_questions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Quiz results policies
CREATE POLICY "quiz_results_enhanced_access" ON quiz_results
  FOR ALL USING (
    auth.uid() = user_id AND
    auth.jwt() ->> 'role' IN ('user', 'admin') AND
    auth.jwt() ->> 'session_id' IS NOT NULL
  );

-- Quiz sessions policies
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

-- Quiz versions policies
CREATE POLICY "quiz_versions_read_all" ON quiz_versions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "quiz_versions_admin_full" ON quiz_versions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- ============================================================================
-- Initial Data
-- ============================================================================

-- Insert initial quiz version
INSERT INTO quiz_versions (version, description, is_current)
VALUES ('1.0.0', '초기 퀴즈 데이터 버전', true);

-- Insert sample categories in quiz_questions (for reference)
-- This will be populated by the admin interface later

COMMENT ON TABLE users IS '사용자 정보 및 계정 상태 관리';
COMMENT ON TABLE user_sessions IS '사용자 세션 및 기기 추적';
COMMENT ON TABLE security_events IS '보안 이벤트 로깅 및 감사';
COMMENT ON TABLE user_permissions IS '사용자별 권한 및 할당량 관리';
COMMENT ON TABLE quiz_questions IS '퀴즈 문제 저장소';
COMMENT ON TABLE quiz_results IS '사용자 퀴즈 답안 및 결과';
COMMENT ON TABLE quiz_sessions IS '퀴즈 세션 및 통계';
COMMENT ON TABLE quiz_versions IS '퀴즈 데이터 버전 관리'; 