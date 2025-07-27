// ============================================================================
// User Action-Based Sync Triggers
// ============================================================================

import type { Logger } from './logger.ts';
import { executeQuery } from './database.ts';

// ============================================================================
// Sync Trigger Types
// ============================================================================

export interface SyncTrigger {
  action: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  immediate: boolean;
  cache_duration?: number;
  throttle?: number;
  retry_on_failure?: boolean;
  lightweight?: boolean;
}

export interface SyncAction {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT';
  payload?: any;
  required_auth: boolean;
}

// ============================================================================
// Sync Trigger Definitions
// ============================================================================

export const SYNC_TRIGGERS: Record<string, SyncTrigger> = {
  // 퀴즈 관련
  quiz_completed: {
    action: 'quiz_completed',
    priority: 'high',
    immediate: true,
    retry_on_failure: true
  },
  
  quiz_started: {
    action: 'quiz_started', 
    priority: 'medium',
    immediate: false,
    cache_duration: 300000 // 5분
  },
  
  // 화면 진입
  leaderboard_view: {
    action: 'leaderboard_view',
    priority: 'high',
    immediate: true,
    cache_duration: 60000 // 1분
  },
  
  profile_view: {
    action: 'profile_view',
    priority: 'low',
    immediate: false,
    cache_duration: 600000 // 10분
  },
  
  home_view: {
    action: 'home_view',
    priority: 'medium',
    immediate: false,
    throttle: 300000 // 5분
  },
  
  // 설정 및 상태 변경
  settings_changed: {
    action: 'settings_changed',
    priority: 'high',
    immediate: true,
    retry_on_failure: true
  },
  
  auth_state_changed: {
    action: 'auth_state_changed',
    priority: 'critical',
    immediate: true,
    retry_on_failure: true
  },
  
  // 네트워크 및 앱 상태
  network_restored: {
    action: 'network_restored',
    priority: 'critical',
    immediate: true,
    retry_on_failure: true
  },
  
  app_foreground: {
    action: 'app_foreground',
    priority: 'medium',
    immediate: false,
    throttle: 60000, // 1분
    lightweight: true
  }
};

// ============================================================================
// Sync Actions by Trigger
// ============================================================================

export const SYNC_ACTIONS: Record<string, SyncAction[]> = {
  quiz_completed: [
    {
      name: 'syncQuizResults',
      endpoint: '/sync-progress',
      method: 'POST',
      required_auth: true
    },
    {
      name: 'refreshLeaderboard',
      endpoint: '/leaderboard',
      method: 'GET',
      required_auth: false
    }
  ],
  
  quiz_started: [
    {
      name: 'checkLatestQuestions',
      endpoint: '/quiz-data',
      method: 'GET',
      required_auth: false
    },
    {
      name: 'syncUserProgress',
      endpoint: '/sync-progress',
      method: 'GET',
      required_auth: true
    }
  ],
  
  leaderboard_view: [
    {
      name: 'refreshLeaderboard',
      endpoint: '/leaderboard',
      method: 'GET',
      payload: { include_user_rank: true },
      required_auth: false
    }
  ],
  
  profile_view: [
    {
      name: 'syncUserStats',
      endpoint: '/sync-progress',
      method: 'GET',
      payload: { include_stats: true },
      required_auth: true
    }
  ],
  
  settings_changed: [
    {
      name: 'syncUserPreferences',
      endpoint: '/sync-progress',
      method: 'PUT',
      required_auth: true
    }
  ],
  
  network_restored: [
    {
      name: 'syncOfflineData',
      endpoint: '/sync-progress',
      method: 'POST',
      required_auth: true
    },
    {
      name: 'checkPendingUpdates',
      endpoint: '/app-sync',
      method: 'POST',
      required_auth: false
    }
  ],
  
  app_foreground: [
    {
      name: 'quickHealthCheck',
      endpoint: '/health',
      method: 'GET',
      required_auth: false
    }
  ]
};

// ============================================================================
// Sync Trigger Manager
// ============================================================================

export class SyncTriggerManager {
  private logger: Logger;
  private lastSyncTimes: Map<string, number> = new Map();
  private cache: Map<string, { data: any; expires: number }> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  // ============================================================================
  // 동기화 트리거 실행
  // ============================================================================

  async executeSyncTrigger(
    triggerName: string,
    userId?: string,
    additionalData?: any
  ): Promise<{ success: boolean; results: any[] }> {
    const trigger = SYNC_TRIGGERS[triggerName];
    if (!trigger) {
      this.logger.warn('알 수 없는 동기화 트리거', { triggerName });
      return { success: false, results: [] };
    }

    // 스로틀링 체크
    if (trigger.throttle && this.isThrottled(triggerName, trigger.throttle)) {
      this.logger.info('동기화 트리거 스로틀링', { triggerName });
      return { success: true, results: [] };
    }

    // 캐시 체크
    if (trigger.cache_duration) {
      const cached = this.getCachedResult(triggerName);
      if (cached) {
        this.logger.info('캐시된 동기화 결과 반환', { triggerName });
        return { success: true, results: [cached] };
      }
    }

    this.logger.info('동기화 트리거 실행 시작', {
      triggerName,
      priority: trigger.priority,
      immediate: trigger.immediate,
      userId
    });

    const actions = SYNC_ACTIONS[triggerName] || [];
    const results = [];

    for (const action of actions) {
      try {
        // 인증 필요한 액션인데 userId가 없으면 건너뛰기
        if (action.required_auth && !userId) {
          this.logger.warn('인증이 필요한 액션이지만 userId가 없음', {
            actionName: action.name
          });
          continue;
        }

        const result = await this.executeAction(action, userId, additionalData);
        results.push({
          action: action.name,
          success: result.success,
          data: result.data
        });

        // 캐시 저장
        if (trigger.cache_duration && result.success) {
          this.setCachedResult(triggerName, result.data, trigger.cache_duration);
        }

      } catch (error) {
        this.logger.error('동기화 액션 실행 실패', {
          actionName: action.name,
          error: error.message
        });

        results.push({
          action: action.name,
          success: false,
          error: error.message
        });

        // 재시도 로직
        if (trigger.retry_on_failure) {
          // TODO: 재시도 구현
        }
      }
    }

    // 마지막 실행 시간 기록
    this.lastSyncTimes.set(triggerName, Date.now());

    this.logger.info('동기화 트리거 실행 완료', {
      triggerName,
      successCount: results.filter(r => r.success).length,
      totalCount: results.length
    });

    return {
      success: results.some(r => r.success),
      results
    };
  }

  // ============================================================================
  // 개별 액션 실행
  // ============================================================================

  private async executeAction(
    action: SyncAction,
    userId?: string,
    additionalData?: any
  ): Promise<{ success: boolean; data?: any }> {
    try {
      // 실제 API 호출 시뮬레이션
      // 실제 구현에서는 fetch나 Supabase 클라이언트 사용
      
      this.logger.info('동기화 액션 실행', {
        actionName: action.name,
        endpoint: action.endpoint,
        method: action.method
      });

      // TODO: 실제 API 호출 구현
      // const response = await fetch(action.endpoint, {
      //   method: action.method,
      //   headers: userId ? { 'Authorization': `Bearer ${token}` } : {},
      //   body: action.payload ? JSON.stringify(action.payload) : undefined
      // });

      // 시뮬레이션 결과
      return {
        success: true,
        data: {
          action: action.name,
          timestamp: new Date().toISOString(),
          simulated: true
        }
      };

    } catch (error) {
      this.logger.error('액션 실행 실패', {
        actionName: action.name,
        error: error.message
      });

      return {
        success: false,
        data: { error: error.message }
      };
    }
  }

  // ============================================================================
  // 유틸리티 메서드
  // ============================================================================

  private isThrottled(triggerName: string, throttleMs: number): boolean {
    const lastSync = this.lastSyncTimes.get(triggerName);
    if (!lastSync) return false;
    
    return (Date.now() - lastSync) < throttleMs;
  }

  private getCachedResult(triggerName: string): any | null {
    const cached = this.cache.get(triggerName);
    if (!cached) return null;
    
    if (Date.now() > cached.expires) {
      this.cache.delete(triggerName);
      return null;
    }
    
    return cached.data;
  }

  private setCachedResult(triggerName: string, data: any, durationMs: number): void {
    this.cache.set(triggerName, {
      data,
      expires: Date.now() + durationMs
    });
  }

  // ============================================================================
  // 캐시 및 상태 관리
  // ============================================================================

  clearCache(triggerName?: string): void {
    if (triggerName) {
      this.cache.delete(triggerName);
    } else {
      this.cache.clear();
    }
  }

  getLastSyncTime(triggerName: string): number | null {
    return this.lastSyncTimes.get(triggerName) || null;
  }

  getSyncStats(): any {
    return {
      total_triggers: Object.keys(SYNC_TRIGGERS).length,
      cached_results: this.cache.size,
      last_sync_times: Object.fromEntries(this.lastSyncTimes)
    };
  }
}

// ============================================================================
// 편의 함수들
// ============================================================================

export async function triggerQuizCompleted(
  logger: Logger,
  userId: string,
  sessionData: any
): Promise<void> {
  const manager = new SyncTriggerManager(logger);
  await manager.executeSyncTrigger('quiz_completed', userId, sessionData);
}

export async function triggerScreenView(
  logger: Logger,
  screenName: string,
  userId?: string
): Promise<void> {
  const triggerName = `${screenName}_view`;
  if (SYNC_TRIGGERS[triggerName]) {
    const manager = new SyncTriggerManager(logger);
    await manager.executeSyncTrigger(triggerName, userId);
  }
}

export async function triggerNetworkRestore(
  logger: Logger,
  userId?: string
): Promise<void> {
  const manager = new SyncTriggerManager(logger);
  await manager.executeSyncTrigger('network_restored', userId);
}