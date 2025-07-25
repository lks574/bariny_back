import { z } from 'zod';
import type { QuizCategory, QuizDifficulty, QuizType } from './types.ts';

// ============================================================================
// Common Validation Schemas
// ============================================================================

export const UUIDSchema = z.string().uuid('올바른 UUID 형식이 아닙니다');

export const EmailSchema = z.string().email('올바른 이메일 형식이 아닙니다');

export const PasswordSchema = z.string()
  .min(8, '비밀번호는 최소 8자 이상이어야 합니다')
  .max(100, '비밀번호는 최대 100자까지 가능합니다')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 
    '비밀번호는 영문 대소문자와 숫자를 포함해야 합니다');

export const DeviceInfoSchema = z.object({
  device_id: z.string().min(1, '기기 ID는 필수입니다'),
  app_version: z.string().regex(/^\d+\.\d+\.\d+$/, '올바른 앱 버전 형식이 아닙니다'),
  os_version: z.string().min(1, 'OS 버전은 필수입니다')
});

// ============================================================================
// Authentication Schemas
// ============================================================================

export const AuthSignupSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  provider: z.enum(['email', 'google', 'apple']).optional().default('email'),
  device_info: DeviceInfoSchema.optional()
});

export const AuthSigninSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, '비밀번호는 필수입니다'),
  provider: z.enum(['email', 'google', 'apple']).optional().default('email'),
  oauth_token: z.string().optional(),
  device_info: DeviceInfoSchema.optional()
});

export const AuthGuestSchema = z.object({
  device_info: DeviceInfoSchema
});

export const PasswordResetSchema = z.object({
  email: EmailSchema
});

export const UserUpdateSchema = z.object({
  display_name: z.string().min(1, '사용자명은 필수입니다').max(100, '사용자명은 최대 100자까지 가능합니다').optional(),
  avatar_url: z.string().url('올바른 URL 형식이 아닙니다').optional(),
  preferences: z.object({
    language: z.enum(['ko', 'en']).optional(),
    notification_enabled: z.boolean().optional(),
    auto_sync_enabled: z.boolean().optional(),
    theme: z.enum(['light', 'dark', 'system']).optional()
  }).optional()
});

// ============================================================================
// Quiz Data Schemas
// ============================================================================

export const QuizCategorySchema = z.enum(['person', 'general', 'country', 'drama', 'music']);
export const QuizDifficultySchema = z.enum(['easy', 'medium', 'hard']);
export const QuizTypeSchema = z.enum(['multiple_choice', 'short_answer']);

export const QuizQuestionSchema = z.object({
  question: z.string()
    .min(10, '문제는 최소 10자 이상이어야 합니다')
    .max(500, '문제는 최대 500자까지 가능합니다'),
  correct_answer: z.string()
    .min(1, '정답은 필수입니다')
    .max(200, '정답은 최대 200자까지 가능합니다'),
  options: z.array(z.string().max(100, '선택지는 최대 100자까지 가능합니다'))
    .min(2, '최소 2개의 선택지가 필요합니다')
    .max(6, '최대 6개의 선택지까지 가능합니다')
    .optional(),
  category: QuizCategorySchema,
  difficulty: QuizDifficultySchema,
  type: QuizTypeSchema,
  audio_url: z.string().url('올바른 URL 형식이 아닙니다').optional()
});

export const QuizQuestionUpdateSchema = QuizQuestionSchema.partial();

export const QuizBulkImportSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(1, '최소 1개의 문제가 필요합니다').max(1000, '한 번에 최대 1000개까지 가져올 수 있습니다')
});

// ============================================================================
// Progress & Session Schemas
// ============================================================================

export const QuizResultSchema = z.object({
  question_id: UUIDSchema,
  user_answer: z.string().min(1, '사용자 답안은 필수입니다').max(200, '답안은 최대 200자까지 가능합니다'),
  is_correct: z.boolean(),
  time_spent: z.number().min(0, '소요 시간은 0 이상이어야 합니다').max(3600, '소요 시간은 최대 1시간까지 가능합니다'),
  completed_at: z.string().datetime('올바른 날짜 형식이 아닙니다'),
  category: QuizCategorySchema,
  quiz_mode: z.string().min(1, '퀴즈 모드는 필수입니다').max(50, '퀴즈 모드는 최대 50자까지 가능합니다')
});

export const QuizSessionSchema = z.object({
  category: QuizCategorySchema,
  mode: z.string().min(1, '모드는 필수입니다').max(50, '모드는 최대 50자까지 가능합니다'),
  total_questions: z.number().min(1, '총 문제 수는 1 이상이어야 합니다').max(100, '총 문제 수는 최대 100개까지 가능합니다'),
  correct_answers: z.number().min(0, '정답 수는 0 이상이어야 합니다'),
  total_time: z.number().min(0, '총 소요 시간은 0 이상이어야 합니다'),
  started_at: z.string().datetime('올바른 날짜 형식이 아닙니다'),
  completed_at: z.string().datetime('올바른 날짜 형식이 아닙니다').optional(),
  results: z.array(QuizResultSchema)
});

export const SyncRequestSchema = z.object({
  sessions: z.array(QuizSessionSchema).max(100, '한 번에 최대 100개 세션까지 동기화할 수 있습니다'),
  results: z.array(QuizResultSchema).max(1000, '한 번에 최대 1000개 결과까지 동기화할 수 있습니다'),
  last_sync_at: z.string().datetime('올바른 날짜 형식이 아닙니다').optional()
});

// ============================================================================
// AI Generation Schemas
// ============================================================================

export const AIQuizRequestSchema = z.object({
  category: QuizCategorySchema,
  difficulty: QuizDifficultySchema,
  type: QuizTypeSchema,
  count: z.number().min(1, '최소 1개의 문제를 생성해야 합니다').max(10, '한 번에 최대 10개까지 생성할 수 있습니다'),
  language: z.enum(['ko', 'en']).default('ko')
});

// ============================================================================
// Pagination and Filtering Schemas
// ============================================================================

export const PaginationSchema = z.object({
  page: z.number().min(1, '페이지는 1 이상이어야 합니다').default(1),
  per_page: z.number().min(1, '페이지당 항목 수는 1 이상이어야 합니다').max(100, '페이지당 최대 100개까지 가능합니다').default(20)
});

export const DateRangeSchema = z.object({
  start_date: z.string().datetime('올바른 시작 날짜 형식이 아닙니다').optional(),
  end_date: z.string().datetime('올바른 종료 날짜 형식이 아닙니다').optional()
}).refine(data => {
  if (data.start_date && data.end_date) {
    return new Date(data.start_date) <= new Date(data.end_date);
  }
  return true;
}, {
  message: '시작 날짜는 종료 날짜보다 이전이어야 합니다'
});

export const HistoryFilterSchema = z.object({
  category: QuizCategorySchema.optional(),
  mode: z.string().max(50, '모드는 최대 50자까지 가능합니다').optional(),
  ...PaginationSchema.shape,
  ...DateRangeSchema.shape
});

// ============================================================================
// Validation Utility Functions
// ============================================================================

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`입력 검증 실패: ${messages}`);
    }
    throw error;
  }
}

export function validateQuery<T>(schema: z.ZodSchema<T>, url: URL): T {
  const params: Record<string, any> = {};
  
  // URL search params를 적절한 타입으로 변환
  for (const [key, value] of url.searchParams.entries()) {
    // 숫자 변환 시도
    if (!isNaN(Number(value))) {
      params[key] = Number(value);
    }
    // boolean 변환 시도
    else if (value === 'true') {
      params[key] = true;
    }
    else if (value === 'false') {
      params[key] = false;
    }
    // 그 외에는 문자열 그대로
    else {
      params[key] = value;
    }
  }

  return validateInput(schema, params);
}

export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
}

export function validateAndSanitize<T extends Record<string, any>>(
  schema: z.ZodSchema<T>, 
  data: unknown
): T {
  const validated = validateInput(schema, data);
  
  // Sanitize string fields
  if (validated && typeof validated === 'object') {
    Object.keys(validated).forEach(key => {
      if (typeof validated[key] === 'string') {
        (validated as any)[key] = sanitizeString(validated[key]);
      }
    });
  }
  
  return validated;
} 