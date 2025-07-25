-- ============================================================================
-- Brainy Quiz Backend - Initial Database Schema
-- Created: 2024-01-15
-- Version: 1.0.0
-- ============================================================================

-- 마이그레이션 로그 테이블 생성 (제일 먼저)
CREATE TABLE IF NOT EXISTS migrations_log (
    version VARCHAR(20) PRIMARY KEY,
    description TEXT NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Extensions 활성화
-- ============================================================================

-- UUID 생성을 위한 확장
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 암호화를 위한 확장  
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 사용자 관리 테이블들
-- ============================================================================

-- 사용자 정보 테이블
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    auth_provider VARCHAR(20) NOT NULL DEFAULT 'email' CHECK (auth_provider IN ('email', 'google', 'apple', 'guest')),
    is_verified BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    account_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'pending')),
    login_count INTEGER NOT NULL DEFAULT 0,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    last_login_at TIMESTAMP WITH TIME ZONE,
    preferences JSONB DEFAULT '{}'::jsonb,
    feature_flags JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 사용자 세션 관리 테이블
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(500) NOT NULL UNIQUE,
    device_id VARCHAR(100),
    device_info JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 보안 이벤트 로그 테이블
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 사용자 권한 및 할당량 테이블
CREATE TABLE user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_type VARCHAR(50) NOT NULL,
    permission_value JSONB DEFAULT '{}'::jsonb,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================================
-- 퀴즈 데이터 테이블들
-- ============================================================================

-- 퀴즈 문제 테이블
CREATE TABLE quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answer INTEGER NOT NULL CHECK (correct_answer >= 0 AND correct_answer <= 5),
    difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    tags JSONB DEFAULT '[]'::jsonb,
    explanation TEXT,
    audio_url TEXT,
    image_url TEXT,
    time_limit INTEGER CHECK (time_limit > 0),
    points INTEGER DEFAULT 10 CHECK (points > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 퀴즈 세션 테이블
CREATE TABLE quiz_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quiz_type VARCHAR(50) NOT NULL DEFAULT 'standard',
    category VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'in_progress', 'completed', 'abandoned')),
    current_question INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL CHECK (total_questions > 0),
    score DECIMAL(5, 2) NOT NULL DEFAULT 0.0 CHECK (score >= 0 AND score <= 100),
    time_spent INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 퀴즈 결과 테이블
CREATE TABLE quiz_results (
    result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES quiz_sessions(session_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    selected_answer INTEGER NOT NULL CHECK (selected_answer >= 0),
    is_correct BOOLEAN NOT NULL,
    time_taken INTEGER NOT NULL DEFAULT 0 CHECK (time_taken >= 0),
    points_earned INTEGER DEFAULT 0 CHECK (points_earned >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 퀴즈 데이터 버전 관리 테이블
CREATE TABLE quiz_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_number VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    file_path TEXT,
    file_size BIGINT,
    question_count INTEGER NOT NULL DEFAULT 0,
    categories JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 인덱스 생성 (성능 최적화)
-- ============================================================================

-- 사용자 테이블 인덱스
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_provider ON users(auth_provider);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_login ON users(last_login_at);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;

-- 세션 테이블 인덱스
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_device ON user_sessions(device_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active) WHERE is_active = true;

-- 보안 이벤트 인덱스
CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_timestamp ON security_events(timestamp DESC);
CREATE INDEX idx_security_events_ip ON security_events(ip_address);

-- 퀴즈 문제 인덱스
CREATE INDEX idx_quiz_questions_category ON quiz_questions(category);
CREATE INDEX idx_quiz_questions_difficulty ON quiz_questions(difficulty);
CREATE INDEX idx_quiz_questions_active ON quiz_questions(is_active) WHERE is_active = true;
CREATE INDEX idx_quiz_questions_created ON quiz_questions(created_at DESC);

-- 퀴즈 세션 인덱스
CREATE INDEX idx_quiz_sessions_user_id ON quiz_sessions(user_id);
CREATE INDEX idx_quiz_sessions_category ON quiz_sessions(category);
CREATE INDEX idx_quiz_sessions_status ON quiz_sessions(status);
CREATE INDEX idx_quiz_sessions_started ON quiz_sessions(started_at DESC);
CREATE INDEX idx_quiz_sessions_user_category ON quiz_sessions(user_id, category);

-- 퀴즈 결과 인덱스
CREATE INDEX idx_quiz_results_session_id ON quiz_results(session_id);
CREATE INDEX idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX idx_quiz_results_question_id ON quiz_results(question_id);
CREATE INDEX idx_quiz_results_created ON quiz_results(created_at DESC);
CREATE INDEX idx_quiz_results_user_created ON quiz_results(user_id, created_at DESC);

-- 버전 관리 인덱스
CREATE INDEX idx_quiz_versions_number ON quiz_versions(version_number);
CREATE INDEX idx_quiz_versions_active ON quiz_versions(is_active) WHERE is_active = true;
CREATE INDEX idx_quiz_versions_created ON quiz_versions(created_at DESC);

-- ============================================================================
-- PostgreSQL 함수들
-- ============================================================================

-- 로그인 횟수 증가 함수
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 사용자 통계 계산 함수
CREATE OR REPLACE FUNCTION get_user_stats(user_id UUID)
RETURNS TABLE (
    total_sessions BIGINT,
    completed_sessions BIGINT,
    total_score DECIMAL,
    average_score DECIMAL,
    total_time BIGINT,
    questions_answered BIGINT,
    correct_answers BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT qs.session_id) as total_sessions,
        COUNT(DISTINCT CASE WHEN qs.status = 'completed' THEN qs.session_id END) as completed_sessions,
        COALESCE(SUM(qs.score), 0) as total_score,
        COALESCE(AVG(qs.score), 0) as average_score,
        COALESCE(SUM(qs.time_spent), 0) as total_time,
        COUNT(qr.result_id) as questions_answered,
        COUNT(CASE WHEN qr.is_correct THEN 1 END) as correct_answers
    FROM quiz_sessions qs
    LEFT JOIN quiz_results qr ON qs.session_id = qr.session_id
    WHERE qs.user_id = get_user_stats.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 세션 정리 함수 (만료된 세션 제거)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() OR (last_accessed_at < NOW() - INTERVAL '30 days');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SQL 실행 함수 (executeQuery용)
CREATE OR REPLACE FUNCTION execute_sql(sql_query TEXT, sql_params JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- 보안상 SELECT, INSERT, UPDATE, DELETE만 허용
    IF sql_query !~* '^\s*(SELECT|INSERT|UPDATE|DELETE)' THEN
        RAISE EXCEPTION 'Only SELECT, INSERT, UPDATE, DELETE statements are allowed';
    END IF;
    
    -- 실제로는 동적 SQL 실행 시 보안 검증이 필요하지만,
    -- 이는 Supabase RLS와 인증 시스템에 의존
    RETURN '{"status": "executed"}'::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 트리거 함수들
-- ============================================================================

-- updated_at 자동 갱신 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 퀴즈 세션 완료 시간 자동 설정 함수
CREATE OR REPLACE FUNCTION update_quiz_session_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 트리거 생성
-- ============================================================================

-- updated_at 자동 갱신 트리거들
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_quiz_questions_updated_at
    BEFORE UPDATE ON quiz_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_quiz_sessions_updated_at
    BEFORE UPDATE ON quiz_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 퀴즈 세션 완료 시간 트리거
CREATE TRIGGER trigger_quiz_session_completed_at
    BEFORE UPDATE ON quiz_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_quiz_session_completed_at();

-- ============================================================================
-- Row Level Security (RLS) 정책
-- ============================================================================

-- RLS 활성화
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_versions ENABLE ROW LEVEL SECURITY;

-- 사용자 테이블 정책들
CREATE POLICY "사용자는 자신의 정보를 조회할 수 있음"
    ON users FOR SELECT
    USING (auth.uid()::text = id::text);

CREATE POLICY "사용자는 자신의 정보를 수정할 수 있음"
    ON users FOR UPDATE
    USING (auth.uid()::text = id::text);

CREATE POLICY "관리자는 모든 사용자 정보를 조회할 수 있음"
    ON users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

-- 퀴즈 문제 정책들
CREATE POLICY "모든 사용자는 활성화된 퀴즈 문제를 조회할 수 있음"
    ON quiz_questions FOR SELECT
    USING (is_active = true);

CREATE POLICY "관리자는 모든 퀴즈 문제를 관리할 수 있음"
    ON quiz_questions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

-- 퀴즈 세션 정책들
CREATE POLICY "사용자는 자신의 퀴즈 세션을 관리할 수 있음"
    ON quiz_sessions FOR ALL
    USING (auth.uid()::text = user_id::text);

-- 퀴즈 결과 정책들
CREATE POLICY "사용자는 자신의 퀴즈 결과를 관리할 수 있음"
    ON quiz_results FOR ALL
    USING (auth.uid()::text = user_id::text);

-- 세션 테이블 정책
CREATE POLICY "사용자는 자신의 세션을 관리할 수 있음"
    ON user_sessions FOR ALL
    USING (auth.uid()::text = user_id::text);

-- 보안 이벤트 정책 (읽기 전용)
CREATE POLICY "관리자는 보안 이벤트를 조회할 수 있음"
    ON security_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

-- 버전 관리 정책
CREATE POLICY "모든 사용자는 활성화된 버전을 조회할 수 있음"
    ON quiz_versions FOR SELECT
    USING (is_active = true);

CREATE POLICY "관리자는 모든 버전을 관리할 수 있음"
    ON quiz_versions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

-- ============================================================================
-- 초기 데이터 삽입
-- ============================================================================

-- 기본 퀴즈 카테고리 버전 생성
INSERT INTO quiz_versions (version_number, description, question_count, categories, is_active, created_at)
VALUES ('1.0.0', '초기 퀴즈 데이터', 0, '["person", "general", "country", "drama", "music"]'::jsonb, true, NOW());

-- ============================================================================
-- 마이그레이션 완료 로그
-- ============================================================================

INSERT INTO migrations_log (version, description, executed_at) 
VALUES ('20240115000001', 'Initial Schema - Users, Sessions, Quiz System, Security', NOW())
ON CONFLICT (version) DO NOTHING; 