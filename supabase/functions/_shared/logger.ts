import type { LogEvent } from './types.ts';

// ============================================================================
// Logger Configuration
// ============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

const LOG_LEVELS: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR
};

export class Logger {
  private readonly functionName: string;
  private readonly requestId: string;
  private readonly userId?: string;
  private readonly minLevel: LogLevel;

  constructor(functionName: string, requestId: string, userId?: string) {
    this.functionName = functionName;
    this.requestId = requestId;
    this.userId = userId;
    
    const logLevelEnv = (globalThis as any).Deno?.env.get('LOG_LEVEL') || 'info';
    this.minLevel = LOG_LEVELS[logLevelEnv.toLowerCase()] ?? LogLevel.INFO;
  }

  private log(level: LogLevel, message: string, metadata?: any): void {
    if (level < this.minLevel) return;

    const logEvent: LogEvent = {
      level: LogLevel[level].toLowerCase() as 'debug' | 'info' | 'warn' | 'error',
      message,
      function_name: this.functionName,
      user_id: this.userId,
      request_id: this.requestId,
      timestamp: new Date().toISOString(),
      metadata
    };

    // Console 출력 (Supabase 로그에서 확인 가능)
    const logString = JSON.stringify(logEvent);
    
    switch (level) {
      case LogLevel.DEBUG:
        console.log(`🔍 ${logString}`);
        break;
      case LogLevel.INFO:
        console.log(`ℹ️ ${logString}`);
        break;
      case LogLevel.WARN:
        console.warn(`⚠️ ${logString}`);
        break;
      case LogLevel.ERROR:
        console.error(`❌ ${logString}`);
        break;
    }

    // 프로덕션 환경에서는 외부 로깅 서비스로 전송
    this.sendToExternalLogger(logEvent);
  }

  private async sendToExternalLogger(logEvent: LogEvent): Promise<void> {
    // 프로덕션 환경에서만 외부 로깅 서비스로 전송
    if ((globalThis as any).Deno?.env.get('ENVIRONMENT') !== 'production') {
      return;
    }

    try {
      // 예: DataDog, Sentry, CloudWatch 등으로 전송
      // 현재는 Supabase 자체 로깅을 사용하므로 별도 구현 불필요
      // 필요시 여기에 외부 로깅 서비스 연동 코드 추가
    } catch (error) {
      console.error('외부 로깅 서비스 전송 실패:', error);
    }
  }

  debug(message: string, metadata?: any): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: any): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: any): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  error(message: string, metadata?: any): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  // API 요청 시작 로깅
  apiStart(method: string, path: string, headers?: Record<string, string>): void {
    this.info('API 요청 시작', {
      method,
      path,
      user_agent: headers?.['user-agent'],
      device_id: headers?.['x-device-id'],
      app_version: headers?.['x-app-version']
    });
  }

  // API 요청 완료 로깅
  apiEnd(method: string, path: string, status: number, duration: number): void {
    this.info('API 요청 완료', {
      method,
      path,
      status,
      duration_ms: duration,
      success: status < 400
    });
  }

  // 인증 관련 로깅
  authEvent(event: string, details?: any): void {
    this.info(`인증 이벤트: ${event}`, {
      event_type: 'auth',
      ...details
    });
  }

  // 데이터베이스 쿼리 로깅
  dbQuery(query: string, duration: number, success: boolean): void {
    this.debug('데이터베이스 쿼리', {
      query: query.substring(0, 200), // 처음 200자만 로깅
      duration_ms: duration,
      success
    });
  }

  // 외부 API 호출 로깅
  externalApi(service: string, endpoint: string, duration: number, success: boolean): void {
    this.info('외부 API 호출', {
      service,
      endpoint,
      duration_ms: duration,
      success
    });
  }
}

// ============================================================================
// Logger Factory
// ============================================================================

export function createLogger(
  functionName: string, 
  request?: Request, 
  userId?: string
): Logger {
  // 요청 ID 생성 (헤더에서 가져오거나 새로 생성)
  const requestId = request?.headers.get('x-request-id') || 
                   request?.headers.get('cf-ray') || 
                   crypto.randomUUID();

  return new Logger(functionName, requestId, userId);
}

// ============================================================================
// Performance Monitoring
// ============================================================================

export class PerformanceTimer {
  private readonly startTime: number;
  private readonly logger: Logger;
  private readonly operation: string;

  constructor(logger: Logger, operation: string) {
    this.logger = logger;
    this.operation = operation;
    this.startTime = performance.now();
  }

  end(success: boolean = true, metadata?: any): number {
    const duration = performance.now() - this.startTime;
    
    this.logger.info(`성능 측정: ${this.operation}`, {
      operation: this.operation,
      duration_ms: duration,
      success,
      ...metadata
    });

    return duration;
  }
}

export function measurePerformance(logger: Logger, operation: string): PerformanceTimer {
  return new PerformanceTimer(logger, operation);
}

// ============================================================================
// Error Logging Utilities
// ============================================================================

export function logError(logger: Logger, error: Error, context?: any): void {
  logger.error('오류 발생', {
    error_name: error.name,
    error_message: error.message,
    error_stack: error.stack,
    context
  });
}

export function logValidationError(logger: Logger, validationErrors: string[], input?: any): void {
  logger.warn('입력 검증 실패', {
    validation_errors: validationErrors,
    invalid_input: input
  });
}

export function logSecurityEvent(logger: Logger, event: string, details?: any): void {
  logger.warn(`보안 이벤트: ${event}`, {
    event_type: 'security',
    timestamp: new Date().toISOString(),
    ...details
  });
}

// ============================================================================
// Metrics Collection
// ============================================================================

export function recordMetric(name: string, value: number, tags?: Record<string, string>): void {
  const metric = {
    name,
    value,
    tags: {
      environment: (globalThis as any).Deno?.env.get('ENVIRONMENT') || 'development',
      function: 'edge_function',
      ...tags
    },
    timestamp: Date.now()
  };
  
  console.log(`METRIC: ${JSON.stringify(metric)}`);
}

export function incrementCounter(name: string, tags?: Record<string, string>): void {
  recordMetric(name, 1, tags);
}

export function recordLatency(name: string, duration: number, tags?: Record<string, string>): void {
  recordMetric(`${name}.duration`, duration, tags);
}

export function recordGauge(name: string, value: number, tags?: Record<string, string>): void {
  recordMetric(`${name}.gauge`, value, tags);
} 