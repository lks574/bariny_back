import { z } from 'zod';
import type { QuizCategory, QuizDifficulty, QuizType } from './types.ts';

// ============================================================================
// Common Validation Schemas
// ============================================================================

export const UUIDSchema = z.string().uuid('유효한 UUID가 아닙니다');

export const EmailSchema = z.string()
  .email('유효한 이메일 주소가 아닙니다')
  .min(5, '이메일은 최소 5자 이상이어야 합니다')
  .max(255, '이메일은 최대 255자까지 가능합니다');

export const PasswordSchema = z.string()
  .min(8, '비밀번호는 최소 8자 이상이어야 합니다')
  .max(128, '비밀번호는 최대 128자까지 가능합니다')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, '영문 대소문자와 숫자를 포함해야 합니다');

export const DeviceInfoSchema = z.object({
  device_id: z.string().optional(),
  device_type: z.string().optional(),
  os_version: z.string().optional(),
  app_version: z.string().optional(),
  timezone: z.string().optional()
});

// ============================================================================
// Authentication Schemas
// ============================================================================

export const SignupRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  provider: z.enum(['email', 'google', 'apple']).default('email'),
  oauth_token: z.string().optional(),
  device_info: DeviceInfoSchema.optional()
});

export const SigninRequestSchema = z.object({
  email: EmailSchema.optional(),
  password: z.string().optional(),
  provider: z.enum(['email', 'google', 'apple', 'guest']).default('email'),
  oauth_token: z.string().optional(),
  device_info: DeviceInfoSchema.optional()
});

export const GuestSigninRequestSchema = z.object({
  provider: z.literal('guest'),
  device_info: DeviceInfoSchema.optional()
});

export const PasswordResetRequestSchema = z.object({
  email: EmailSchema
});

export const UserUpdateRequestSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  preferences: z.record(z.any()).optional(),
  avatar_url: z.string().url().optional()
});

// ============================================================================
// Quiz Data Schemas
// ============================================================================

export const QuizQuestionSchema = z.object({
  id: UUIDSchema,
  category: z.string().min(1).max(50),
  question: z.string().min(1).max(1000),
  options: z.array(z.string()).min(2).max(6),
  correct_answer: z.number().int().min(0),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string()).optional(),
  explanation: z.string().max(500).optional(),
  audio_url: z.string().url().optional(),
  image_url: z.string().url().optional(),
  time_limit: z.number().int().positive().optional(),
  points: z.number().int().positive().optional(),
  is_active: z.boolean().default(true)
});

export const QuizBulkImportSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(1).max(1000),
  category: z.string().min(1).max(50),
  overwrite_existing: z.boolean().default(false)
});

// ============================================================================
// Progress and Session Schemas
// ============================================================================

export const QuizSessionSchema = z.object({
  session_id: UUIDSchema,
  user_id: UUIDSchema,
  quiz_type: z.string().min(1).max(50),
  category: z.string().min(1).max(50),
  status: z.enum(['started', 'in_progress', 'completed', 'abandoned']),
  current_question: z.number().int().min(0),
  total_questions: z.number().int().positive(),
  score: z.number().min(0).max(100),
  time_spent: z.number().int().min(0),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  updated_at: z.string().datetime(),
  metadata: z.record(z.any()).optional()
});

export const QuizResultSchema = z.object({
  result_id: UUIDSchema,
  session_id: UUIDSchema,
  user_id: UUIDSchema,
  question_id: UUIDSchema,
  selected_answer: z.number().int().min(0),
  is_correct: z.boolean(),
  time_taken: z.number().min(0),
  created_at: z.string().datetime(),
  metadata: z.record(z.any()).optional()
});

export const SyncRequestSchema = z.object({
  last_sync_at: z.string().datetime(),
  quiz_sessions: z.array(QuizSessionSchema).optional(),
  quiz_results: z.array(QuizResultSchema).optional(),
  force_sync: z.boolean().default(false)
});

// ============================================================================
// AI Generation Schemas
// ============================================================================

export const AIGenerationRequestSchema = z.object({
  category: z.string().min(1).max(50),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  count: z.number().int().min(1).max(50),
  topic: z.string().max(200).optional(),
  style: z.string().max(100).optional(),
  language: z.string().min(2).max(10).default('ko')
});

// ============================================================================
// Pagination and Filtering Schemas
// ============================================================================

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0)
});

export const FilterSchema = z.object({
  category: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  search: z.string().max(100).optional()
});

export const SortSchema = z.object({
  field: z.string().min(1).max(50),
  order: z.enum(['asc', 'desc']).default('desc')
});

// ============================================================================
// Leaderboard Schemas
// ============================================================================

export const LeaderboardQuerySchema = z.object({
  category: z.string().default('all'),
  time_range: z.enum(['all', 'week', 'month']).default('all'),
  limit: z.number().int().min(1).max(100).default(50),
  include_user_rank: z.boolean().default(false)
});

// ============================================================================
// Admin Schemas
// ============================================================================

export const AdminQuizCreateSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(1),
  auto_publish: z.boolean().default(false),
  notify_users: z.boolean().default(false)
});

export const AdminUserUpdateSchema = z.object({
  user_id: UUIDSchema,
  is_active: z.boolean().optional(),
  account_status: z.enum(['active', 'suspended', 'pending']).optional(),
  role: z.enum(['user', 'admin', 'moderator']).optional(),
  feature_flags: z.record(z.any()).optional()
});

// ============================================================================
// Validation Utility Functions
// ============================================================================

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export async function validateInput<T>(
  input: unknown,
  schemaType: string
): Promise<ValidationResult<T>> {
  try {
    let schema: z.ZodSchema;

    switch (schemaType) {
      case 'signup':
        schema = SignupRequestSchema;
        break;
      case 'signin':
        schema = SigninRequestSchema;
        break;
      case 'guestSignin':
        schema = GuestSigninRequestSchema;
        break;
      case 'passwordReset':
        schema = PasswordResetRequestSchema;
        break;
      case 'userUpdate':
        schema = UserUpdateRequestSchema;
        break;
      case 'quizQuestion':
        schema = QuizQuestionSchema;
        break;
      case 'quizBulkImport':
        schema = QuizBulkImportSchema;
        break;
      case 'quizSession':
        schema = QuizSessionSchema;
        break;
      case 'quizResult':
        schema = QuizResultSchema;
        break;
      case 'syncRequest':
        schema = SyncRequestSchema;
        break;
      case 'aiGeneration':
        schema = AIGenerationRequestSchema;
        break;
      case 'pagination':
        schema = PaginationSchema;
        break;
      case 'filter':
        schema = FilterSchema;
        break;
      case 'sort':
        schema = SortSchema;
        break;
      case 'leaderboardQuery':
        schema = LeaderboardQuerySchema;
        break;
      case 'adminQuizCreate':
        schema = AdminQuizCreateSchema;
        break;
      case 'adminUserUpdate':
        schema = AdminUserUpdateSchema;
        break;
      default:
        return {
          success: false,
          errors: [`알 수 없는 스키마 타입: ${schemaType}`]
        };
    }

    const result = schema.parse(input);
    return {
      success: true,
      data: result as T
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }

    return {
      success: false,
      errors: ['유효성 검사 중 알 수 없는 오류가 발생했습니다']
    };
  }
}

export async function validateQuery(
  url: URL,
  schemaType: string
): Promise<ValidationResult> {
  try {
    const params: Record<string, any> = {};
    
    for (const [key, value] of url.searchParams.entries()) {
      // 숫자 변환 시도
      if (/^\d+$/.test(value)) {
        params[key] = parseInt(value);
      } else if (/^\d+\.\d+$/.test(value)) {
        params[key] = parseFloat(value);
      } else if (value === 'true' || value === 'false') {
        params[key] = value === 'true';
      } else {
        params[key] = value;
      }
    }

    return await validateInput(params, schemaType);
  } catch (error) {
    return {
      success: false,
      errors: ['쿼리 파라미터 검증 실패']
    };
  }
}

export function sanitizeString(input: string, maxLength: number = 1000): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // 기본 XSS 방지
    .substring(0, maxLength);
}

export function validateAndSanitize<T>(
  input: any,
  schemaType: string,
  sanitizeFields?: string[]
): Promise<ValidationResult<T>> {
  // 문자열 필드 정리
  if (sanitizeFields && typeof input === 'object' && input !== null) {
    const sanitized = { ...input };
    for (const field of sanitizeFields) {
      if (typeof sanitized[field] === 'string') {
        sanitized[field] = sanitizeString(sanitized[field]);
      }
    }
    return validateInput<T>(sanitized, schemaType);
  }

  return validateInput<T>(input, schemaType);
} 