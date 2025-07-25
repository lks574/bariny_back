import { z } from 'zod';

// ============================================================================
// Validation Result Type
// ============================================================================

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors?: string[];
}

// ============================================================================
// Common Schemas
// ============================================================================

const PaginationSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0)
});

const FilterSchema = z.object({
  category: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  status: z.string().optional(),
  time_range: z.enum(['all', 'week', 'month']).optional()
});

const SortSchema = z.object({
  field: z.string().optional(),
  direction: z.enum(['asc', 'desc']).optional().default('desc')
});

// ============================================================================
// Authentication Schemas
// ============================================================================

const SignupRequestSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  display_name: z.string().min(1).max(100),
  provider: z.enum(['email', 'google', 'apple', 'guest']).default('email'),
  oauth_token: z.string().optional(),
  device_info: z.object({
    device_id: z.string().optional(),
    device_type: z.string().optional(),
    os_version: z.string().optional(),
    app_version: z.string().optional(),
    timezone: z.string().optional()
  }).optional()
});

const SigninRequestSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().optional(),
  provider: z.enum(['email', 'google', 'apple', 'guest']).default('email'),
  oauth_token: z.string().optional(),
  device_info: z.object({
    device_id: z.string().optional(),
    device_type: z.string().optional(),
    os_version: z.string().optional(),
    app_version: z.string().optional(),
    timezone: z.string().optional()
  }).optional()
});

const GuestSigninRequestSchema = z.object({
  device_info: z.object({
    device_id: z.string(),
    device_type: z.string().optional(),
    os_version: z.string().optional(),
    app_version: z.string().optional(),
    timezone: z.string().optional()
  })
});

const PasswordResetRequestSchema = z.object({
  email: z.string().email()
});

const UserUpdateRequestSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().optional(),
  preferences: z.record(z.any()).optional()
});

// ============================================================================
// Quiz Data Schemas
// ============================================================================

const QuizQuestionSchema = z.object({
  category: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string()).min(2).max(6),
  correct_answer: z.number().min(0).max(5),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  audio_url: z.string().url().optional(),
  image_url: z.string().url().optional(),
  time_limit: z.number().min(10).max(300).optional(),
  points: z.number().min(1).max(100).optional()
});

const QuizBulkImportSchema = z.object({
  questions: z.array(QuizQuestionSchema),
  category: z.string().optional(),
  replace_existing: z.boolean().optional().default(false)
});

// ============================================================================
// Session and Progress Schemas
// ============================================================================

const QuizSessionSchema = z.object({
  session_id: z.string().uuid(),
  quiz_type: z.string().default('standard'),
  category: z.string(),
  status: z.enum(['started', 'in_progress', 'completed', 'abandoned']).default('started'),
  current_question: z.number().min(0).default(0),
  total_questions: z.number().min(1),
  score: z.number().min(0).max(100).default(0),
  time_spent: z.number().min(0).default(0),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  updated_at: z.string().datetime(),
  metadata: z.record(z.any()).optional()
});

const QuizResultSchema = z.object({
  result_id: z.string().uuid(),
  session_id: z.string().uuid(),
  question_id: z.string().uuid(),
  selected_answer: z.number().min(0),
  is_correct: z.boolean(),
  time_taken: z.number().min(0),
  created_at: z.string().datetime(),
  metadata: z.record(z.any()).optional()
});

// ============================================================================
// Sync Schemas
// ============================================================================

const SyncRequestSchema = z.object({
  last_sync_at: z.string().datetime(),
  quiz_sessions: z.array(QuizSessionSchema).optional(),
  quiz_results: z.array(QuizResultSchema).optional(),
  force_sync: z.boolean().optional().default(false)
});

// ============================================================================
// AI Generation Schemas
// ============================================================================

const AIGenerationRequestSchema = z.object({
  category: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  count: z.number().min(1).max(20),
  topic: z.string().optional(),
  style: z.string().optional(),
  language: z.enum(['ko', 'en']).optional().default('ko')
});

// ============================================================================
// Leaderboard Schemas
// ============================================================================

const LeaderboardQuerySchema = z.object({
  category: z.string().optional().default('all'),
  time_range: z.enum(['all', 'week', 'month']).optional().default('all'),
  limit: z.number().min(1).max(100).optional().default(50),
  include_user_rank: z.boolean().optional().default(false)
});

// ============================================================================
// Admin Schemas
// ============================================================================

const AdminQuizCreateSchema = z.object({
  questions: z.array(QuizQuestionSchema),
  category: z.string(),
  auto_activate: z.boolean().optional().default(true)
});

const AdminUserUpdateSchema = z.object({
  user_id: z.string().uuid(),
  updates: z.object({
    is_active: z.boolean().optional(),
    account_status: z.enum(['active', 'suspended', 'pending']).optional(),
    metadata: z.record(z.any()).optional(),
    preferences: z.record(z.any()).optional()
  })
});

// ============================================================================
// Schema Registry
// ============================================================================

const schemas = {
  // Auth
  signup: SignupRequestSchema,
  signin: SigninRequestSchema,
  guestSignin: GuestSigninRequestSchema,
  passwordReset: PasswordResetRequestSchema,
  userUpdate: UserUpdateRequestSchema,
  
  // Quiz Data
  quizQuestion: QuizQuestionSchema,
  quizBulkImport: QuizBulkImportSchema,
  
  // Sessions
  quizSession: QuizSessionSchema,
  quizResult: QuizResultSchema,
  
  // Sync
  syncRequest: SyncRequestSchema,
  
  // AI Generation
  aiGeneration: AIGenerationRequestSchema,
  
  // Leaderboard
  leaderboardQuery: LeaderboardQuerySchema,
  
  // Admin
  adminQuizCreate: AdminQuizCreateSchema,
  adminUserUpdate: AdminUserUpdateSchema,
  
  // Common
  pagination: PaginationSchema,
  filter: FilterSchema,
  sort: SortSchema
};

// ============================================================================
// Main Validation Function
// ============================================================================

export async function validateInput<T>(
  data: unknown,
  schemaType: keyof typeof schemas
): Promise<ValidationResult<T>> {
  try {
    const schema = schemas[schemaType];
    
    if (!schema) {
      return {
        success: false,
        errors: [`Unknown schema type: ${schemaType}`]
      };
    }

    const result = schema.safeParse(data);
    
    if (result.success) {
      return {
        success: true,
        data: result.data as T
      };
    } else {
      return {
        success: false,
        errors: result.error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        )
      };
    }
  } catch (error) {
    return {
      success: false,
      errors: [`Validation error: ${error.message}`]
    };
  }
}

// ============================================================================
// Query Parameter Validation
// ============================================================================

export async function validateQuery(
  searchParams: URLSearchParams,
  schemaType: keyof typeof schemas
): Promise<ValidationResult> {
  try {
    const data: Record<string, any> = {};
    
    // URL 검색 매개변수를 객체로 변환
    for (const [key, value] of searchParams.entries()) {
      // 숫자로 변환 시도
      if (/^\d+$/.test(value)) {
        data[key] = parseInt(value);
      }
      // 불린으로 변환 시도
      else if (value === 'true' || value === 'false') {
        data[key] = value === 'true';
      }
      // 문자열 그대로
      else {
        data[key] = value;
      }
    }

    return await validateInput(data, schemaType);
  } catch (error) {
    return {
      success: false,
      errors: [`Query validation error: ${error.message}`]
    };
  }
}

// ============================================================================
// Input Sanitization
// ============================================================================

export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .replace(/[<>]/g, '') // 기본 HTML 태그 제거
    .replace(/javascript:/gi, '') // JavaScript 프로토콜 제거
    .replace(/data:/gi, '') // Data URL 제거
    .substring(0, 10000); // 길이 제한
}

export function sanitizeObject(obj: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? sanitizeString(item) :
        typeof item === 'object' && item !== null ? sanitizeObject(item) : item
      );
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// ============================================================================
// Export Schemas (for external use)
// ============================================================================

export { 
  SignupRequestSchema,
  SigninRequestSchema,
  GuestSigninRequestSchema,
  QuizQuestionSchema,
  QuizSessionSchema,
  QuizResultSchema,
  SyncRequestSchema,
  AIGenerationRequestSchema,
  LeaderboardQuerySchema,
  PaginationSchema,
  FilterSchema,
  SortSchema
}; 