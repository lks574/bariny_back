-- ============================================================================
-- Enhanced Row Level Security (RLS) Policies
-- Created: 2024-12-15
-- Version: 1.0.0
-- Description: 보안 강화된 RLS 정책 및 권한 관리 시스템
-- ============================================================================

-- ============================================================================
-- 1. 권한 관리 시스템 개선
-- ============================================================================

-- 역할(Role) 정의 테이블 생성
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 사용자 역할 할당 테이블
CREATE TABLE user_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES user_roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(user_id, role_id)
);

-- ============================================================================
-- 2. 감사 로그 시스템
-- ============================================================================

-- 데이터 접근 로그 테이블
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 3. 인덱스 생성
-- ============================================================================

-- 역할 관리 인덱스
CREATE INDEX idx_user_roles_name ON user_roles(role_name);
CREATE INDEX idx_user_roles_active ON user_roles(is_active) WHERE is_active = true;

CREATE INDEX idx_user_role_assignments_user_id ON user_role_assignments(user_id);
CREATE INDEX idx_user_role_assignments_role_id ON user_role_assignments(role_id);
CREATE INDEX idx_user_role_assignments_active ON user_role_assignments(is_active, expires_at);

-- 감사 로그 인덱스
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_operation ON audit_logs(operation);

-- ============================================================================
-- 4. 유틸리티 함수들
-- ============================================================================

-- 사용자 역할 확인 함수
CREATE OR REPLACE FUNCTION get_user_roles(user_id UUID)
RETURNS TEXT[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT ur.role_name
        FROM user_role_assignments ura
        JOIN user_roles ur ON ura.role_id = ur.id
        WHERE ura.user_id = get_user_roles.user_id
        AND ura.is_active = true
        AND ur.is_active = true
        AND (ura.expires_at IS NULL OR ura.expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 권한 확인 함수
CREATE OR REPLACE FUNCTION has_permission(user_id UUID, permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    permission_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO permission_count
    FROM user_role_assignments ura
    JOIN user_roles ur ON ura.role_id = ur.id
    WHERE ura.user_id = has_permission.user_id
    AND ura.is_active = true
    AND ur.is_active = true
    AND (ura.expires_at IS NULL OR ura.expires_at > NOW())
    AND ur.permissions ? permission_name
    AND (ur.permissions->permission_name)::boolean = true;
    
    RETURN permission_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 관리자 확인 함수 (기존 메타데이터 방식과 새 역할 시스템 모두 지원)
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin_legacy BOOLEAN;
    is_admin_roles BOOLEAN;
BEGIN
    -- 기존 메타데이터 방식 확인
    SELECT COALESCE((u.metadata->>'role') = 'admin', false) INTO is_admin_legacy
    FROM users u
    WHERE u.id = is_admin.user_id;
    
    -- 새 역할 시스템 확인
    SELECT has_permission(is_admin.user_id, 'admin') INTO is_admin_roles;
    
    RETURN COALESCE(is_admin_legacy, false) OR COALESCE(is_admin_roles, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 데이터 접근 로그 함수
CREATE OR REPLACE FUNCTION log_data_access(
    table_name TEXT,
    operation TEXT,
    record_id UUID DEFAULT NULL,
    old_values JSONB DEFAULT NULL,
    new_values JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO audit_logs (
        user_id,
        table_name,
        operation,
        record_id,
        old_values,
        new_values,
        ip_address,
        user_agent
    ) VALUES (
        auth.uid(),
        log_data_access.table_name,
        log_data_access.operation,
        log_data_access.record_id,
        log_data_access.old_values,
        log_data_access.new_values,
        inet_client_addr(),
        current_setting('request.headers', true)::json->>'user-agent'
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. 기존 RLS 정책 제거 및 개선된 정책 생성
-- ============================================================================

-- 기존 정책들 제거
DROP POLICY IF EXISTS "사용자는 자신의 정보를 조회할 수 있음" ON users;
DROP POLICY IF EXISTS "사용자는 자신의 정보를 수정할 수 있음" ON users;
DROP POLICY IF EXISTS "관리자는 모든 사용자 정보를 조회할 수 있음" ON users;

-- 개선된 사용자 테이블 RLS 정책
CREATE POLICY "users_select_self"
    ON users FOR SELECT
    USING (
        auth.uid()::text = id::text
        OR is_admin(auth.uid())
    );

CREATE POLICY "users_update_self"
    ON users FOR UPDATE
    USING (
        auth.uid()::text = id::text
        OR is_admin(auth.uid())
    )
    WITH CHECK (
        auth.uid()::text = id::text
        OR is_admin(auth.uid())
    );

CREATE POLICY "users_insert_admin_only"
    ON users FOR INSERT
    WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "users_delete_admin_only"
    ON users FOR DELETE
    USING (is_admin(auth.uid()));

-- ============================================================================
-- 6. 세션 관리 RLS 정책 개선
-- ============================================================================

DROP POLICY IF EXISTS "사용자는 자신의 세션을 관리할 수 있음" ON user_sessions;

CREATE POLICY "sessions_select_own"
    ON user_sessions FOR SELECT
    USING (
        auth.uid()::text = user_id::text
        OR is_admin(auth.uid())
    );

CREATE POLICY "sessions_insert_own"
    ON user_sessions FOR INSERT
    WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "sessions_update_own"
    ON user_sessions FOR UPDATE
    USING (
        auth.uid()::text = user_id::text
        OR is_admin(auth.uid())
    );

CREATE POLICY "sessions_delete_own_or_admin"
    ON user_sessions FOR DELETE
    USING (
        auth.uid()::text = user_id::text
        OR is_admin(auth.uid())
    );

-- ============================================================================
-- 7. 퀴즈 관련 테이블 RLS 정책 개선
-- ============================================================================

-- 퀴즈 문제 정책 개선
DROP POLICY IF EXISTS "모든 사용자는 활성화된 퀴즈 문제를 조회할 수 있음" ON quiz_questions;
DROP POLICY IF EXISTS "관리자는 모든 퀴즈 문제를 관리할 수 있음" ON quiz_questions;

CREATE POLICY "quiz_questions_select_active"
    ON quiz_questions FOR SELECT
    USING (
        is_active = true
        OR is_admin(auth.uid())
        OR has_permission(auth.uid(), 'quiz_manage')
    );

CREATE POLICY "quiz_questions_manage_admin"
    ON quiz_questions FOR ALL
    USING (
        is_admin(auth.uid())
        OR has_permission(auth.uid(), 'quiz_manage')
    );

-- 퀴즈 세션 정책 개선
DROP POLICY IF EXISTS "사용자는 자신의 퀴즈 세션을 관리할 수 있음" ON quiz_sessions;

CREATE POLICY "quiz_sessions_select_own"
    ON quiz_sessions FOR SELECT
    USING (
        auth.uid()::text = user_id::text
        OR is_admin(auth.uid())
        OR has_permission(auth.uid(), 'quiz_monitor')
    );

CREATE POLICY "quiz_sessions_insert_own"
    ON quiz_sessions FOR INSERT
    WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "quiz_sessions_update_own"
    ON quiz_sessions FOR UPDATE
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "quiz_sessions_delete_admin"
    ON quiz_sessions FOR DELETE
    USING (is_admin(auth.uid()));

-- 퀴즈 결과 정책 개선
DROP POLICY IF EXISTS "사용자는 자신의 퀴즈 결과를 관리할 수 있음" ON quiz_results;

CREATE POLICY "quiz_results_select_own"
    ON quiz_results FOR SELECT
    USING (
        auth.uid()::text = user_id::text
        OR is_admin(auth.uid())
        OR has_permission(auth.uid(), 'quiz_monitor')
    );

CREATE POLICY "quiz_results_insert_own"
    ON quiz_results FOR INSERT
    WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "quiz_results_update_own"
    ON quiz_results FOR UPDATE
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "quiz_results_delete_admin"
    ON quiz_results FOR DELETE
    USING (is_admin(auth.uid()));

-- ============================================================================
-- 8. AI 생성 관련 RLS 정책 개선
-- ============================================================================

-- AI 생성 이력 정책 개선
DROP POLICY IF EXISTS "사용자는 자신의 AI 생성 이력을 조회할 수 있음" ON ai_generations;
DROP POLICY IF EXISTS "사용자는 AI 생성 요청을 생성할 수 있음" ON ai_generations;
DROP POLICY IF EXISTS "관리자는 모든 AI 생성 이력을 조회할 수 있음" ON ai_generations;
DROP POLICY IF EXISTS "관리자는 AI 생성 이력을 업데이트할 수 있음" ON ai_generations;

CREATE POLICY "ai_generations_select_own"
    ON ai_generations FOR SELECT
    USING (
        auth.uid()::text = user_id::text
        OR is_admin(auth.uid())
        OR has_permission(auth.uid(), 'ai_monitor')
    );

CREATE POLICY "ai_generations_insert_with_limits"
    ON ai_generations FOR INSERT
    WITH CHECK (
        auth.uid()::text = user_id::text
        AND (
            SELECT can_generate 
            FROM check_daily_generation_limit(auth.uid(), 10)
        ) = true
    );

CREATE POLICY "ai_generations_update_admin"
    ON ai_generations FOR UPDATE
    USING (
        is_admin(auth.uid())
        OR has_permission(auth.uid(), 'ai_manage')
    );

-- ============================================================================
-- 9. 새로운 테이블들의 RLS 정책
-- ============================================================================

-- 역할 관리 테이블 RLS 활성화
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 역할 테이블 정책
CREATE POLICY "roles_select_admin"
    ON user_roles FOR SELECT
    USING (is_admin(auth.uid()));

CREATE POLICY "roles_manage_admin"
    ON user_roles FOR ALL
    USING (is_admin(auth.uid()));

-- 역할 할당 테이블 정책
CREATE POLICY "role_assignments_select_self_or_admin"
    ON user_role_assignments FOR SELECT
    USING (
        auth.uid()::text = user_id::text
        OR is_admin(auth.uid())
    );

CREATE POLICY "role_assignments_manage_admin"
    ON user_role_assignments FOR ALL
    USING (is_admin(auth.uid()));

-- 감사 로그 정책
CREATE POLICY "audit_logs_select_admin"
    ON audit_logs FOR SELECT
    USING (is_admin(auth.uid()));

CREATE POLICY "audit_logs_insert_system"
    ON audit_logs FOR INSERT
    WITH CHECK (true); -- 시스템에서 자동 생성

-- ============================================================================
-- 10. 보안 이벤트 및 권한 관련 정책 개선
-- ============================================================================

-- 보안 이벤트 정책 개선
DROP POLICY IF EXISTS "관리자는 보안 이벤트를 조회할 수 있음" ON security_events;

CREATE POLICY "security_events_select_admin"
    ON security_events FOR SELECT
    USING (
        is_admin(auth.uid())
        OR has_permission(auth.uid(), 'security_monitor')
    );

CREATE POLICY "security_events_insert_system"
    ON security_events FOR INSERT
    WITH CHECK (true); -- 시스템에서 자동 생성

-- 사용자 권한 테이블 정책 개선
CREATE POLICY "user_permissions_select_self_or_admin"
    ON user_permissions FOR SELECT
    USING (
        auth.uid()::text = user_id::text
        OR is_admin(auth.uid())
    );

CREATE POLICY "user_permissions_manage_admin"
    ON user_permissions FOR ALL
    USING (is_admin(auth.uid()));

-- ============================================================================
-- 11. 데이터 초기화
-- ============================================================================

-- 기본 역할 생성
INSERT INTO user_roles (role_name, description, permissions) VALUES
('admin', '시스템 관리자', '{"admin": true, "quiz_manage": true, "ai_manage": true, "security_monitor": true, "quiz_monitor": true, "ai_monitor": true}'::jsonb),
('moderator', '콘텐츠 관리자', '{"quiz_manage": true, "ai_monitor": true, "quiz_monitor": true}'::jsonb),
('premium_user', '프리미엄 사용자', '{"ai_generate": true, "unlimited_quiz": true}'::jsonb),
('basic_user', '일반 사용자', '{"quiz_play": true}'::jsonb);

-- ============================================================================
-- 12. 트리거 함수들
-- ============================================================================

-- updated_at 자동 갱신 트리거
CREATE TRIGGER trigger_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 13. 코멘트 추가
-- ============================================================================

COMMENT ON TABLE user_roles IS '사용자 역할 정의 테이블';
COMMENT ON TABLE user_role_assignments IS '사용자별 역할 할당 테이블';
COMMENT ON TABLE audit_logs IS '데이터 접근 및 변경 감사 로그';

COMMENT ON FUNCTION get_user_roles(UUID) IS '사용자의 모든 활성 역할을 반환';
COMMENT ON FUNCTION has_permission(UUID, TEXT) IS '사용자의 특정 권한 보유 여부 확인';
COMMENT ON FUNCTION is_admin(UUID) IS '사용자의 관리자 권한 확인 (기존 방식과 새 역할 시스템 모두 지원)';
COMMENT ON FUNCTION log_data_access(TEXT, TEXT, UUID, JSONB, JSONB) IS '데이터 접근 로그 기록';

-- ============================================================================
-- 마이그레이션 완료 로그
-- ============================================================================

INSERT INTO migrations_log (version, description, executed_at) 
VALUES ('20241215000001', 'Enhanced RLS Policies with Role-based Access Control', NOW())
ON CONFLICT (version) DO NOTHING; 