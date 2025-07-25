-- ============================================================================
-- AI Quiz Generation Tables Migration
-- ============================================================================

-- AI 생성 이력 테이블
CREATE TABLE ai_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_data JSONB NOT NULL,
    response_data JSONB,
    question_count INTEGER NOT NULL DEFAULT 0,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    cost_estimate DECIMAL(10, 6) NOT NULL DEFAULT 0.0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES users(id),
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejected_by UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- AI 생성 대기 퀴즈 테이블 (관리자 검토용)
CREATE TABLE quiz_questions_pending (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id UUID REFERENCES ai_generations(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answer INTEGER NOT NULL CHECK (correct_answer >= 0 AND correct_answer <= 5),
    difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    tags JSONB DEFAULT '[]'::jsonb,
    explanation TEXT,
    time_limit INTEGER CHECK (time_limit > 0),
    points INTEGER DEFAULT 10 CHECK (points > 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 인덱스 생성
-- ============================================================================

-- AI 생성 이력 인덱스
CREATE INDEX idx_ai_generations_user_id ON ai_generations(user_id);
CREATE INDEX idx_ai_generations_status ON ai_generations(status);
CREATE INDEX idx_ai_generations_created_at ON ai_generations(created_at DESC);
CREATE INDEX idx_ai_generations_user_created ON ai_generations(user_id, created_at DESC);

-- 대기 퀴즈 인덱스
CREATE INDEX idx_quiz_questions_pending_generation_id ON quiz_questions_pending(generation_id);
CREATE INDEX idx_quiz_questions_pending_category ON quiz_questions_pending(category);
CREATE INDEX idx_quiz_questions_pending_difficulty ON quiz_questions_pending(difficulty);
CREATE INDEX idx_quiz_questions_pending_created_at ON quiz_questions_pending(created_at DESC);

-- ============================================================================
-- 트리거 함수 생성
-- ============================================================================

-- AI 생성 완료 시간 자동 업데이트
CREATE OR REPLACE FUNCTION update_ai_generation_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER trigger_update_ai_generation_completed_at
    BEFORE UPDATE ON ai_generations
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_generation_completed_at();

-- ============================================================================
-- Row Level Security (RLS) 정책
-- ============================================================================

-- AI 생성 이력 테이블 RLS 활성화
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions_pending ENABLE ROW LEVEL SECURITY;

-- AI 생성 이력 정책들
CREATE POLICY "사용자는 자신의 AI 생성 이력을 조회할 수 있음"
    ON ai_generations FOR SELECT
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "사용자는 AI 생성 요청을 생성할 수 있음"
    ON ai_generations FOR INSERT
    WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "관리자는 모든 AI 생성 이력을 조회할 수 있음"
    ON ai_generations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

CREATE POLICY "관리자는 AI 생성 이력을 업데이트할 수 있음"
    ON ai_generations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

-- 대기 퀴즈 정책들
CREATE POLICY "관리자는 대기 중인 퀴즈를 조회할 수 있음"
    ON quiz_questions_pending FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

CREATE POLICY "시스템은 대기 퀴즈를 생성할 수 있음"
    ON quiz_questions_pending FOR INSERT
    WITH CHECK (true); -- Edge Function에서 service role로 실행

CREATE POLICY "관리자는 대기 퀴즈를 삭제할 수 있음"
    ON quiz_questions_pending FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.metadata->>'role' = 'admin'
        )
    );

-- ============================================================================
-- 초기 데이터 및 제약조건
-- ============================================================================

-- 대기 퀴즈에 generation_id 추가 (generation_id 필드가 누락된 경우를 위한 제약조건)
ALTER TABLE quiz_questions_pending 
ADD CONSTRAINT fk_quiz_questions_pending_generation 
FOREIGN KEY (generation_id) REFERENCES ai_generations(id) ON DELETE CASCADE;

-- ============================================================================
-- 유틸리티 함수들
-- ============================================================================

-- AI 생성 통계 조회 함수
CREATE OR REPLACE FUNCTION get_ai_generation_stats(user_id_param UUID DEFAULT NULL)
RETURNS TABLE (
    total_generations BIGINT,
    total_questions BIGINT,
    total_tokens BIGINT,
    total_cost DECIMAL(10, 6),
    approved_questions BIGINT,
    pending_questions BIGINT,
    rejected_questions BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(ag.id) as total_generations,
        COALESCE(SUM(ag.question_count), 0) as total_questions,
        COALESCE(SUM(ag.tokens_used), 0) as total_tokens,
        COALESCE(SUM(ag.cost_estimate), 0.0) as total_cost,
        COUNT(CASE WHEN ag.status = 'approved' THEN 1 END) as approved_questions,
        COUNT(CASE WHEN ag.status = 'completed' THEN 1 END) as pending_questions,
        COUNT(CASE WHEN ag.status = 'rejected' THEN 1 END) as rejected_questions
    FROM ai_generations ag
    WHERE (user_id_param IS NULL OR ag.user_id = user_id_param);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 일일 생성 제한 확인 함수
CREATE OR REPLACE FUNCTION check_daily_generation_limit(user_id_param UUID, limit_param INTEGER DEFAULT 10)
RETURNS TABLE (
    used_count BIGINT,
    limit_count INTEGER,
    can_generate BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(ag.id) as used_count,
        limit_param as limit_count,
        (COUNT(ag.id) < limit_param) as can_generate
    FROM ai_generations ag
    WHERE ag.user_id = user_id_param 
        AND ag.created_at >= CURRENT_DATE
        AND ag.status IN ('completed', 'approved');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 코멘트 추가
-- ============================================================================

COMMENT ON TABLE ai_generations IS 'AI 퀴즈 생성 요청 및 결과 이력';
COMMENT ON TABLE quiz_questions_pending IS '관리자 검토 대기 중인 AI 생성 퀴즈';

COMMENT ON COLUMN ai_generations.request_data IS 'AI 생성 요청 데이터 (JSON)';
COMMENT ON COLUMN ai_generations.response_data IS 'AI 생성 응답 데이터 (JSON)';
COMMENT ON COLUMN ai_generations.tokens_used IS '사용된 OpenAI 토큰 수';
COMMENT ON COLUMN ai_generations.cost_estimate IS '예상 비용 (USD)';

COMMENT ON COLUMN quiz_questions_pending.generation_id IS '연관된 AI 생성 세션 ID';
COMMENT ON COLUMN quiz_questions_pending.options IS '퀴즈 선택지 배열 (JSON)';
COMMENT ON COLUMN quiz_questions_pending.tags IS '퀴즈 태그 배열 (JSON)';

-- ============================================================================
-- 마이그레이션 완료 로그
-- ============================================================================

INSERT INTO public.migrations_log (version, description, executed_at) 
VALUES ('20240116000001', 'AI Quiz Generation Tables', NOW())
ON CONFLICT (version) DO NOTHING; 