-- ============================================================================
-- Push Notifications and App Sync Tables
-- Created: 2025-01-28
-- Version: 1.1.0
-- ============================================================================

-- 푸시 알림 발송 이력 테이블
CREATE TABLE IF NOT EXISTS push_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL, -- 'quiz_update', 'new_content', 'achievement', 'maintenance'
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    target_users JSONB NOT NULL, -- 'all', 'active', [user_ids]
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 앱 동기화 로그 테이블
CREATE TABLE IF NOT EXISTS app_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL, -- 'app_launch', 'manual'
    quiz_version_before VARCHAR(20),
    quiz_version_after VARCHAR(20),
    config_version_before VARCHAR(20),
    config_version_after VARCHAR(20),
    sync_duration_ms INTEGER,
    updates_applied JSONB DEFAULT '{}'::jsonb,
    device_info JSONB DEFAULT '{}'::jsonb,
    sync_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 리더보드 캐시 테이블 (하루 1회 업데이트)
CREATE TABLE IF NOT EXISTS leaderboard_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 사용자 기기 정보 및 푸시 토큰 관리 (users 테이블의 metadata 확장)
-- 기존 users 테이블에 컬럼 추가는 하지 않고 metadata JSONB 필드 활용

-- ============================================================================
-- 인덱스 생성
-- ============================================================================

-- 푸시 알림 인덱스
CREATE INDEX idx_push_notifications_type ON push_notifications(type);
CREATE INDEX idx_push_notifications_sent_at ON push_notifications(sent_at DESC);
CREATE INDEX idx_push_notifications_sent_by ON push_notifications(sent_by);

-- 앱 동기화 로그 인덱스
CREATE INDEX idx_app_sync_logs_user_id ON app_sync_logs(user_id);
CREATE INDEX idx_app_sync_logs_sync_type ON app_sync_logs(sync_type);
CREATE INDEX idx_app_sync_logs_timestamp ON app_sync_logs(sync_timestamp DESC);

-- 사용자 메타데이터에서 푸시 토큰 검색을 위한 인덱스
CREATE INDEX idx_users_push_token ON users USING GIN ((metadata->'push_token'));
CREATE INDEX idx_users_last_login_active ON users(last_login_at DESC) WHERE is_active = true;

-- ============================================================================
-- RLS 정책
-- ============================================================================

-- 푸시 알림 테이블 RLS 활성화
ALTER TABLE push_notifications ENABLE ROW LEVEL SECURITY;

-- 관리자만 푸시 알림 이력 조회 가능
CREATE POLICY "관리자는 푸시 알림 이력을 조회할 수 있음"
    ON push_notifications FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

-- 관리자만 푸시 알림 발송 가능
CREATE POLICY "관리자는 푸시 알림을 발송할 수 있음"
    ON push_notifications FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

-- 앱 동기화 로그 테이블 RLS 활성화
ALTER TABLE app_sync_logs ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 동기화 로그만 조회 가능
CREATE POLICY "사용자는 자신의 동기화 로그를 조회할 수 있음"
    ON app_sync_logs FOR SELECT
    USING (auth.uid()::text = user_id::text);

-- 사용자는 자신의 동기화 로그만 생성 가능
CREATE POLICY "사용자는 자신의 동기화 로그를 생성할 수 있음"
    ON app_sync_logs FOR INSERT
    WITH CHECK (auth.uid()::text = user_id::text);

-- 관리자는 모든 동기화 로그 조회 가능
CREATE POLICY "관리자는 모든 동기화 로그를 조회할 수 있음"
    ON app_sync_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

-- ============================================================================
-- 유틸리티 함수들
-- ============================================================================

-- 활성 사용자 푸시 토큰 조회 함수
CREATE OR REPLACE FUNCTION get_active_user_push_tokens(days_threshold INTEGER DEFAULT 30)
RETURNS TABLE (
    user_id UUID,
    push_token TEXT,
    last_login_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id as user_id,
        u.metadata->>'push_token' as push_token,
        u.last_login_at
    FROM users u
    WHERE u.is_active = true
    AND u.metadata->>'push_token' IS NOT NULL
    AND u.metadata->>'push_token' != ''
    AND u.last_login_at > NOW() - INTERVAL '1 day' * days_threshold
    AND u.auth_provider != 'guest';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 사용자 푸시 토큰 업데이트 함수
CREATE OR REPLACE FUNCTION update_user_push_token(
    user_id UUID,
    push_token TEXT,
    device_info JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE users 
    SET 
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'push_token', push_token,
            'device_info', device_info,
            'push_token_updated_at', NOW()
        ),
        updated_at = NOW()
    WHERE id = user_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 앱 동기화 로그 생성 함수
CREATE OR REPLACE FUNCTION log_app_sync(
    user_id UUID,
    sync_type VARCHAR(50),
    quiz_version_before VARCHAR(20) DEFAULT NULL,
    quiz_version_after VARCHAR(20) DEFAULT NULL,
    config_version_before VARCHAR(20) DEFAULT NULL,
    config_version_after VARCHAR(20) DEFAULT NULL,
    sync_duration_ms INTEGER DEFAULT NULL,
    updates_applied JSONB DEFAULT '{}'::jsonb,
    device_info JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO app_sync_logs (
        user_id, sync_type, quiz_version_before, quiz_version_after,
        config_version_before, config_version_after, sync_duration_ms,
        updates_applied, device_info, sync_timestamp
    ) VALUES (
        user_id, sync_type, quiz_version_before, quiz_version_after,
        config_version_before, config_version_after, sync_duration_ms,
        updates_applied, device_info, NOW()
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 마이그레이션 완료 로그
-- ============================================================================

INSERT INTO migrations_log (version, description, executed_at) 
VALUES ('20250128000001', 'Add Push Notifications and App Sync Tables', NOW())
ON CONFLICT (version) DO NOTHING;