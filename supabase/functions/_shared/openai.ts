// ============================================================================
// OpenAI API Integration for Quiz Generation
// ============================================================================

import type { Logger } from './logger.ts';
import { logError, measurePerformance } from './logger.ts';
import type { AIGenerationRequest, AIGenerationResponse, QuizQuestion } from './types.ts';

// ============================================================================
// OpenAI API Types
// ============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAICompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature: number;
  max_tokens: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
}

interface OpenAICompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GenerationCacheEntry {
  key: string;
  questions: QuizQuestion[];
  generated_at: string;
  expires_at: string;
  usage: {
    tokens_used: number;
    cost_estimate: number;
  };
}

// ============================================================================
// OpenAI API Client
// ============================================================================

class OpenAIClient {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  private defaultModel = 'gpt-3.5-turbo';
  private cache = new Map<string, GenerationCacheEntry>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateQuizQuestions(
    logger: Logger,
    request: AIGenerationRequest
  ): Promise<AIGenerationResponse> {
    const timer = measurePerformance(logger, 'openai_quiz_generation');
    
    try {
      // 캐시 확인
      const cacheKey = this.generateCacheKey(request);
      const cached = this.getFromCache(cacheKey);
      
      if (cached) {
        timer.end(true);
        logger.info('AI 퀴즈 생성 캐시 히트', { cacheKey });
        
        return {
          success: true,
          generated_questions: cached.questions,
          generation_info: {
            model_used: 'cached',
            tokens_used: 0,
            generation_time: 0,
            cost_estimate: 0
          },
          generated_at: new Date().toISOString()
        };
      }

      // OpenAI API 호출
      const prompt = this.buildPrompt(request);
      const response = await this.callOpenAI(logger, prompt);
      
      // 응답 파싱 및 검증
      const questions = await this.parseAndValidateQuestions(logger, response.choices[0].message.content, request);
      
      // 비용 계산
      const costEstimate = this.calculateCost(response.usage);
      
      // 캐시 저장 (24시간)
      this.saveToCache(cacheKey, questions, response.usage, costEstimate);
      
      const generationTime = timer.end(true);
      
      logger.info('AI 퀴즈 생성 완료', {
        questionCount: questions.length,
        tokensUsed: response.usage.total_tokens,
        costEstimate,
        generationTime
      });

      return {
        success: true,
        generated_questions: questions,
        generation_info: {
          model_used: response.model,
          tokens_used: response.usage.total_tokens,
          generation_time: generationTime,
          cost_estimate: costEstimate
        },
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      timer.end(false);
      logError(logger, error, { context: 'openai_quiz_generation', request });
      
      return {
        success: false,
        generated_questions: [],
        generation_info: {
          model_used: 'error',
          tokens_used: 0,
          generation_time: 0,
          cost_estimate: 0
        },
        generated_at: new Date().toISOString()
      };
    }
  }

  private buildPrompt(request: AIGenerationRequest): OpenAIMessage[] {
    const { category, difficulty, count, topic, style, language = 'ko' } = request;
    
    const systemPrompt = language === 'ko' 
      ? this.getKoreanSystemPrompt()
      : this.getEnglishSystemPrompt();

    const userPrompt = language === 'ko'
      ? this.buildKoreanUserPrompt(category, difficulty, count, topic, style)
      : this.buildEnglishUserPrompt(category, difficulty, count, topic, style);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  private getKoreanSystemPrompt(): string {
    return `당신은 한국어 퀴즈 문제를 생성하는 전문가입니다. 다음 규칙을 엄격히 따라 퀴즈를 생성해주세요:

**형식 규칙:**
1. 반드시 JSON 형태로만 응답하세요
2. 각 문제는 정확히 4개의 선택지를 가져야 합니다
3. 정답은 0-3 사이의 숫자로 표시하세요 (0이 첫 번째 선택지)
4. 모든 문제는 명확하고 모호하지 않아야 합니다

**품질 규칙:**
1. 정답이 명확하고 논란의 여지가 없어야 합니다
2. 선택지들은 서로 구별되고 합리적이어야 합니다
3. 너무 쉽거나 너무 어려워서는 안 됩니다
4. 문화적으로 적절하고 교육적 가치가 있어야 합니다

**JSON 형식:**
{
  "questions": [
    {
      "question": "문제 내용",
      "options": ["선택지1", "선택지2", "선택지3", "선택지4"],
      "correct_answer": 0,
      "explanation": "정답 설명 (선택사항)"
    }
  ]
}`;
  }

  private getEnglishSystemPrompt(): string {
    return `You are an expert quiz question generator. Follow these rules strictly:

**Format Rules:**
1. Respond only in JSON format
2. Each question must have exactly 4 options
3. Correct answer should be a number 0-3 (0 for first option)
4. All questions must be clear and unambiguous

**Quality Rules:**
1. Answers must be factually correct and indisputable
2. Options should be distinct and reasonable
3. Difficulty should be appropriate for general audience
4. Content should be culturally appropriate and educational

**JSON Format:**
{
  "questions": [
    {
      "question": "Question content",
      "options": ["Option1", "Option2", "Option3", "Option4"],
      "correct_answer": 0,
      "explanation": "Answer explanation (optional)"
    }
  ]
}`;
  }

  private buildKoreanUserPrompt(
    category: string,
    difficulty: string,
    count: number,
    topic?: string,
    style?: string
  ): string {
    const difficultyMap = {
      easy: '쉬움 (초등학교 수준)',
      medium: '보통 (중고등학교 수준)',
      hard: '어려움 (대학교/전문가 수준)'
    };

    const categoryMap = {
      person: '인물 (유명인, 역사적 인물, 연예인 등)',
      general: '일반상식 (과학, 역사, 문화, 시사 등)',
      country: '국가/지리 (세계 각국의 문화, 지리, 역사)',
      drama: '드라마/영화 (한국 드라마, 해외 드라마, 영화)',
      music: '음악 (가수, 노래, 음악 이론, 음악사)'
    };

    let prompt = `다음 조건에 맞는 한국어 퀴즈 문제를 ${count}개 생성해주세요:

**카테고리:** ${categoryMap[category as keyof typeof categoryMap] || category}
**난이도:** ${difficultyMap[difficulty as keyof typeof difficultyMap] || difficulty}`;

    if (topic) {
      prompt += `\n**주제:** ${topic}`;
    }

    if (style) {
      prompt += `\n**스타일:** ${style}`;
    }

    prompt += `

**추가 요구사항:**
- 한국 문화와 상황에 맞는 내용으로 구성
- 최신 정보를 반영하되 시간이 지나도 유효한 내용
- 교육적 가치가 있고 흥미로운 문제
- 정답이 명확하고 논란의 여지가 없는 문제

반드시 JSON 형식으로만 응답해주세요.`;

    return prompt;
  }

  private buildEnglishUserPrompt(
    category: string,
    difficulty: string,
    count: number,
    topic?: string,
    style?: string
  ): string {
    let prompt = `Generate ${count} quiz questions with the following criteria:

**Category:** ${category}
**Difficulty:** ${difficulty}`;

    if (topic) {
      prompt += `\n**Topic:** ${topic}`;
    }

    if (style) {
      prompt += `\n**Style:** ${style}`;
    }

    prompt += `

**Additional Requirements:**
- Content should be culturally appropriate and educational
- Use current information but ensure long-term validity
- Questions should be engaging and thought-provoking
- Answers must be factually correct and indisputable

Respond only in JSON format.`;

    return prompt;
  }

  private async callOpenAI(logger: Logger, messages: OpenAIMessage[]): Promise<OpenAICompletionResponse> {
    const request: OpenAICompletionRequest = {
      model: this.defaultModel,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenAI API 호출 실패: ${response.status} - ${errorData}`);
    }

    return await response.json();
  }

  private async parseAndValidateQuestions(
    logger: Logger,
    content: string,
    request: AIGenerationRequest
  ): Promise<QuizQuestion[]> {
    try {
      // JSON 파싱
      const cleanContent = this.cleanJsonContent(content);
      const parsed = JSON.parse(cleanContent);
      
      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error('응답에서 questions 배열을 찾을 수 없습니다');
      }

      const questions: QuizQuestion[] = [];
      
      for (let i = 0; i < parsed.questions.length; i++) {
        const q = parsed.questions[i];
        
        // 필수 필드 검증
        if (!q.question || !Array.isArray(q.options) || typeof q.correct_answer !== 'number') {
          logger.warn(`문제 ${i + 1} 스키마 검증 실패`, { question: q });
          continue;
        }

        // 선택지 개수 검증
        if (q.options.length !== 4) {
          logger.warn(`문제 ${i + 1} 선택지 개수 오류`, { optionCount: q.options.length });
          continue;
        }

        // 정답 범위 검증
        if (q.correct_answer < 0 || q.correct_answer >= q.options.length) {
          logger.warn(`문제 ${i + 1} 정답 인덱스 오류`, { correctAnswer: q.correct_answer });
          continue;
        }

        // QuizQuestion 객체 생성
        const quizQuestion: QuizQuestion = {
          id: crypto.randomUUID(),
          category: request.category,
          question: q.question.trim(),
          options: q.options.map((opt: string) => opt.trim()),
          correct_answer: q.correct_answer,
          difficulty: request.difficulty,
          tags: request.topic ? [request.topic] : [],
          explanation: q.explanation?.trim(),
          time_limit: this.getTimeLimit(request.difficulty),
          points: this.getPoints(request.difficulty),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        questions.push(quizQuestion);
      }

      if (questions.length === 0) {
        throw new Error('유효한 문제가 생성되지 않았습니다');
      }

      logger.info('AI 생성 문제 검증 완료', {
        totalGenerated: parsed.questions.length,
        validQuestions: questions.length
      });

      return questions;

    } catch (error) {
      logger.error('AI 응답 파싱 실패', { 
        content: content.substring(0, 500),
        error: error.message 
      });
      throw new Error(`AI 응답 파싱 실패: ${error.message}`);
    }
  }

  private cleanJsonContent(content: string): string {
    // 코드 블록 제거
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // 앞뒤 공백 제거
    content = content.trim();
    
    // JSON 시작과 끝 찾기
    const startIndex = content.indexOf('{');
    const lastIndex = content.lastIndexOf('}');
    
    if (startIndex !== -1 && lastIndex !== -1 && lastIndex > startIndex) {
      content = content.substring(startIndex, lastIndex + 1);
    }
    
    return content;
  }

  private getTimeLimit(difficulty: string): number {
    const timeLimits = {
      easy: 30,    // 30초
      medium: 45,  // 45초
      hard: 60     // 60초
    };
    return timeLimits[difficulty as keyof typeof timeLimits] || 45;
  }

  private getPoints(difficulty: string): number {
    const points = {
      easy: 10,
      medium: 20,
      hard: 30
    };
    return points[difficulty as keyof typeof points] || 20;
  }

  private calculateCost(usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }): number {
    // GPT-3.5-turbo 가격 (2024년 기준)
    // Input: $0.0010 / 1K tokens
    // Output: $0.0020 / 1K tokens
    const inputCost = (usage.prompt_tokens / 1000) * 0.0010;
    const outputCost = (usage.completion_tokens / 1000) * 0.0020;
    return Number((inputCost + outputCost).toFixed(6));
  }

  private generateCacheKey(request: AIGenerationRequest): string {
    const key = `${request.category}_${request.difficulty}_${request.count}_${request.topic || 'none'}_${request.style || 'none'}_${request.language || 'ko'}`;
    return btoa(key).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  }

  private getFromCache(key: string): GenerationCacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 만료 확인
    if (new Date() > new Date(entry.expires_at)) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  private saveToCache(
    key: string, 
    questions: QuizQuestion[], 
    usage: any, 
    costEstimate: number
  ): void {
    const entry: GenerationCacheEntry = {
      key,
      questions,
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24시간
      usage: {
        tokens_used: usage.total_tokens,
        cost_estimate: costEstimate
      }
    };

    this.cache.set(key, entry);

    // 캐시 크기 제한 (최대 100개)
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
}

// ============================================================================
// Export Functions
// ============================================================================

let openaiClient: OpenAIClient | null = null;

export function getOpenAIClient(): OpenAIClient {
  if (!openaiClient) {
    const apiKey = (globalThis as any).Deno?.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY 환경 변수가 설정되지 않았습니다');
    }
    openaiClient = new OpenAIClient(apiKey);
  }
  return openaiClient;
}

export async function generateQuizQuestions(
  logger: Logger,
  request: AIGenerationRequest
): Promise<AIGenerationResponse> {
  const client = getOpenAIClient();
  return await client.generateQuizQuestions(logger, request);
}

export async function checkOpenAIHealth(logger: Logger): Promise<{
  status: 'healthy' | 'unhealthy';
  response_time: number;
  error?: string;
}> {
  const startTime = performance.now();
  
  try {
    const apiKey = (globalThis as any).Deno?.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return {
        status: 'unhealthy',
        response_time: performance.now() - startTime,
        error: 'OPENAI_API_KEY 환경 변수가 설정되지 않음'
      };
    }

    // 간단한 모델 목록 조회로 헬스체크
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const responseTime = performance.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        response_time: responseTime,
        error: `OpenAI API HTTP ${response.status}: ${response.statusText}`
      };
    }

    return {
      status: 'healthy',
      response_time: responseTime
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      response_time: performance.now() - startTime,
      error: error.message
    };
  }
} 