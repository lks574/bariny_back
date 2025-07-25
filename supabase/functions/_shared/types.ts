// ============================================================================
// API Response Types
// ============================================================================

export interface APIResponse<T = any> {
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
    timestamp?: string;
  };
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface AuthRequest {
  email?: string;
  password?: string;
  provider?: 'email' | 'google' | 'apple' | 'guest';
  oauth_token?: string;
  device_info?: {
    device_id: string;
    app_version: string;
    os_version: string;
  };
}

export interface AuthResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserProfile;
  session_info: SessionInfo;
  auth_config?: AuthRemoteConfig;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  auth_provider: 'email' | 'google' | 'apple' | 'guest';
  is_verified: boolean;
  created_at: string;
  last_login_at: string;
  preferences: UserPreferences;
}

export interface SessionInfo {
  session_id: string;
  device_id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  expires_at: string;
}

export interface UserPreferences {
  language: 'ko' | 'en';
  notification_enabled: boolean;
  auto_sync_enabled: boolean;
  theme: 'light' | 'dark' | 'system';
}

// ============================================================================
// Firebase Remote Config Types
// ============================================================================

export interface AuthRemoteConfig {
  auth_methods_enabled: string;
  social_login_required: boolean;
  guest_mode_enabled: boolean;
  password_min_length: number;
  session_timeout_minutes: number;
  max_login_attempts: number;
  auto_sync_enabled: boolean;
  offline_mode_enabled: boolean;
  min_app_version_for_auth: string;
  deprecated_auth_notice: string;
}

export interface QuizRemoteConfig {
  quiz_version: string;
  download_url: string;
  categories: string;
  force_update: boolean;
  maintenance_mode: boolean;
  min_app_version: string;
  feature_flags: string;
}

// ============================================================================
// Quiz Data Types
// ============================================================================

export type QuizCategory = 'person' | 'general' | 'country' | 'drama' | 'music';
export type QuizDifficulty = 'easy' | 'medium' | 'hard';
export type QuizType = 'multiple_choice' | 'short_answer';

export interface QuizQuestion {
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

export interface QuizDataFile {
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

export interface QuizFileGenerationResponse {
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

// ============================================================================
// Progress & Session Types
// ============================================================================

export interface QuizResult {
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

export interface QuizSession {
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

export interface SyncRequest {
  sessions: QuizSession[];
  results: QuizResult[];
  last_sync_at?: string;
}

// ============================================================================
// AI Generation Types
// ============================================================================

export interface AIQuizRequest {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  type: 'multiple_choice' | 'short_answer';
  count: number;
  language: 'ko' | 'en';
}

export interface AIQuizResponse {
  questions: QuizQuestion[];
  generation_time: number;
  tokens_used: number;
}

// ============================================================================
// Security & Monitoring Types
// ============================================================================

export interface SecurityEvent {
  event_type: 'login_success' | 'login_failure' | 'password_reset' | 'suspicious_activity';
  user_id?: string;
  ip_address: string;
  user_agent: string;
  device_id?: string;
  timestamp: string;
  details: any;
}

export interface LogEvent {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  function_name: string;
  user_id?: string;
  request_id: string;
  timestamp: string;
  metadata?: any;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: { status: string; response_time: number; error?: string };
    auth: { status: string; response_time: number; error?: string };
    storage: { status: string; response_time: number; error?: string };
    firebase: { status: string; response_time: number; error?: string };
  };
  total_response_time: number;
}

// ============================================================================
// Database Schema Types
// ============================================================================

export interface DatabaseUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  auth_provider: string;
  is_verified: boolean;
  is_active: boolean;
  account_status: 'active' | 'suspended' | 'locked';
  last_login_at?: string;
  login_count: number;
  failed_login_attempts: number;
  locked_until?: string;
  preferences: Record<string, any>;
  feature_flags: Record<string, any>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  last_sync_at?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE'
}

export class APIError extends Error {
  constructor(
    public code: ErrorCodes,
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
} 