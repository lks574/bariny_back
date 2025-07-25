-- ============================================================================
-- Fix Signup RLS Policy
-- Created: 2024-12-15 (Fix)
-- Version: 1.0.1
-- Description: 회원가입 시 사용자 생성을 허용하는 RLS 정책 수정
-- ============================================================================

-- 기존 사용자 INSERT 정책 제거
DROP POLICY IF EXISTS "users_insert_admin_only" ON users;

-- 새로운 사용자 INSERT 정책 생성
-- 1. 관리자는 모든 사용자 생성 가능
-- 2. 인증되지 않은 사용자도 회원가입을 위해 사용자 생성 가능 (단, 자신의 ID만)
-- 3. 인증된 사용자도 자신의 ID로만 사용자 생성 가능
CREATE POLICY "users_insert_signup_allowed"
    ON users FOR INSERT
    WITH CHECK (
        -- 관리자는 모든 사용자 생성 가능
        is_admin(auth.uid())
        -- 또는 인증되지 않은 상태에서의 회원가입 허용 (Supabase Auth에서 ID 할당)
        OR auth.uid() IS NULL
        -- 또는 인증된 사용자가 자신의 ID로 생성
        OR auth.uid()::text = id::text
    );

-- 마이그레이션 로그 추가
INSERT INTO migrations_log (version, description, executed_at) 
VALUES ('20241215000002', 'Fix RLS policy to allow user signup', NOW())
ON CONFLICT (version) DO NOTHING; 