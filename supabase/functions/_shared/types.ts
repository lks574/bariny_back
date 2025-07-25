// ============================================================================
// API Response Types
// ============================================================================

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIError;
  message?: string;
}

export interface APIError {
  code: string;
  message: string;
  details?: any;
}

export interface PaginationInfo {
  limit: number;
  offset: number;
  total_count?: number;
  has_more?: boolean;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface AuthRequest {
  email?: string;
  password?: string;
  provider?: 'email' | 'google' | 'apple' | 'guest';
  oauth_token?: string;
  device_info?: DeviceInfo;
}

export interface AuthResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserProfile;
  session_info: SessionInfo;
  auth_config: AuthRemoteConfig;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  auth_provider: string;
  is_verified: boolean;
  created_at: string;
  last_login_at: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  language?: string;
  notification_enabled?: boolean;
  auto_sync_enabled?: boolean;
  theme?: 'light' | 'dark' | 'system';
  [key: string]: any;
}

export interface SessionInfo {
  session_id: string;
  device_id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  expires_at: string;
}

export interface DeviceInfo {
  device_id?: string;
  device_type?: string;
  os_version?: string;
  app_version?: string;
  timezone?: string;
}

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

// ============================================================================
// Static Configuration Types
// ============================================================================

// Static configuration (no Firebase dependency)

// ============================================================================
// Quiz Data Types
// ============================================================================

export interface QuizQuestion {
  id: string;
  category: string;
  question: string;
  options: string[];
  correct_answer: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags?: string[];
  explanation?: string;
  audio_url?: string;
  image_url?: string;
  time_limit?: number;
  points?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuizDataFile {
  version: string;
  generated_at: string;
  questions: QuizQuestion[];
  total_count: number;
  categories: string[];
  meta: {
    last_updated: string;
    source: string;
    [key: string]: any;
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
// User Progress and Session Types
// ============================================================================

export interface QuizSession {
  session_id: string;
  user_id: string;
  quiz_type: string;
  category: string;
  status: 'started' | 'in_progress' | 'completed' | 'abandoned';
  current_question: number;
  total_questions: number;
  score: number;
  time_spent: number; // seconds
  started_at: string;
  completed_at?: string;
  updated_at: string;
  metadata?: {
    difficulty?: string;
    mode?: string;
    [key: string]: any;
  };
}

export interface QuizResult {
  result_id: string;
  session_id: string;
  user_id: string;
  question_id: string;
  selected_answer: number;
  is_correct: boolean;
  time_taken: number; // seconds
  created_at: string;
  metadata?: {
    points_earned?: number;
    bonus_applied?: boolean;
    [key: string]: any;
  };
}

export interface ProgressStats {
  total_sessions: number;
  completed_sessions: number;
  completion_rate: number;
  average_score: number;
  total_time_spent: number;
  total_questions_answered: number;
  accuracy_rate: number;
  streak_days: number;
  last_activity: string;
}

// ============================================================================
// Sync Types
// ============================================================================

export interface SyncRequest {
  last_sync_at: string;
  quiz_sessions?: QuizSession[];
  quiz_results?: QuizResult[];
  force_sync?: boolean;
}

export interface SyncResponse {
  success: boolean;
  message: string;
  sync_timestamp: string;
  sync_results: {
    synced_sessions: string[];
    synced_results: string[];
    failed_sessions: string[];
    failed_results: string[];
    conflicts: any[];
  };
  server_data: {
    quiz_sessions: QuizSession[];
    quiz_results: QuizResult[];
    server_timestamp: string;
  };
  conflicts_resolved: boolean;
}

// ============================================================================
// Leaderboard Types
// ============================================================================

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url?: string;
  stats: {
    total_sessions: number;
    completed_sessions: number;
    average_score: number;
    total_time_spent: number;
    total_questions: number;
    correct_answers: number;
    accuracy_rate: number;
    composite_score: number;
  };
  last_activity: string;
}

export interface LeaderboardResponse {
  success: boolean;
  leaderboard: LeaderboardEntry[];
  user_rank?: {
    rank: number;
    total_users: number;
    stats: any;
  } | null;
  category: string;
  time_range: string;
  total_entries: number;
  generated_at: string;
}

// ============================================================================
// AI Quiz Generation Types
// ============================================================================

export interface AIGenerationRequest {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
  topic?: string;
  style?: string;
  language?: string;
}

export interface AIGenerationResponse {
  success: boolean;
  generated_questions: QuizQuestion[];
  generation_info: {
    model_used: string;
    tokens_used: number;
    generation_time: number;
    cost_estimate: number;
  };
  generated_at: string;
}

// ============================================================================
// Security and Logging Types
// ============================================================================

export interface SecurityEvent {
  id: string;
  user_id?: string;
  event_type: string;
  ip_address: string;
  user_agent: string;
  timestamp: string;
  details: any;
}

export interface LogEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  timestamp: string;
  function_name: string;
  message: string;
  context?: any;
  duration?: number;
  error?: any;
}

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: ServiceHealth;
    auth: ServiceHealth;
    storage: ServiceHealth;
    openai: ServiceHealth;
  };
  total_response_time: number;
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy';
  response_time: number;
  error?: string;
}

// ============================================================================
// Database User Model
// ============================================================================

export interface DatabaseUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  auth_provider: string;
  is_verified: boolean;
  is_active: boolean;
  account_status: 'active' | 'suspended' | 'pending';
  login_count: number;
  failed_login_attempts: number;
  last_login_at?: string;
  preferences: any;
  feature_flags: any;
  metadata: any;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Error Code Enum
// ============================================================================

export enum ErrorCodes {
  // General
  INVALID_REQUEST = 'INVALID_REQUEST',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  
  // Authentication
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Data
  DATA_NOT_FOUND = 'DATA_NOT_FOUND',
  DATA_VALIDATION_FAILED = 'DATA_VALIDATION_FAILED',
  DUPLICATE_DATA = 'DUPLICATE_DATA',
  
  // Business Logic
  QUIZ_NOT_AVAILABLE = 'QUIZ_NOT_AVAILABLE',
  SESSION_EXPIRED_OR_INVALID = 'SESSION_EXPIRED_OR_INVALID',
  SYNC_CONFLICT = 'SYNC_CONFLICT',
  
  // External Services
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR'
}

// ============================================================================
// Utility Types
// ============================================================================

export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
export interface JSONObject {
  [key: string]: JSONValue;
}
export interface JSONArray extends Array<JSONValue> {}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
  total_count: number;
} 