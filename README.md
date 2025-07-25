# Brainy Backend API

Firebase Remote Config와 Supabase를 기반으로 구축된 iOS 퀴즈 앱 백엔드 시스템입니다.

## 🏗 **프로젝트 구조**

```
brainy_back/
├── deno.json                      # Deno 프로젝트 설정
├── .env.example                   # 환경변수 예시
├── supabase/
│   ├── config.toml                # Supabase 로컬 설정
│   ├── .env.local                 # 로컬 환경변수
│   ├── migrations/                # 데이터베이스 마이그레이션
│   │   └── 20240115000001_initial_schema.sql
│   └── functions/                 # Edge Functions
│       ├── _shared/               # 공통 모듈
│       │   ├── types.ts          # 타입 정의
│       │   ├── cors.ts           # CORS 설정
│       │   ├── validation.ts     # 입력 검증
│       │   ├── logger.ts         # 로깅 시스템
│       │   └── database.ts       # DB 헬퍼
│       └── health/               # 헬스체크 API
│           └── index.ts
└── .kiro/specs/                  # 설계 문서
    └── bariny-backend-api/
        ├── design.md
        ├── requirements.md
        └── tasks.md
```

## 🚀 **빠른 시작**

### 1. 환경 설정

```bash
# 1. Deno 설치 (https://deno.land/manual/getting_started/installation)
curl -fsSL https://deno.land/x/install/install.sh | sh

# 2. Supabase CLI 설치
npm install -g @supabase/cli

# 3. 환경 변수 설정
cp .env.example .env.local
# .env.local 파일을 편집하여 실제 값 입력
```

### 2. Supabase 프로젝트 설정

```bash
# 로컬 Supabase 시작
supabase start

# 데이터베이스 마이그레이션 실행
supabase db reset

# Edge Functions 로컬 서빙
supabase functions serve --env-file supabase/.env.local
```

### 3. Firebase Remote Config 설정

```bash
# Firebase CLI 설치
npm install -g firebase-tools

# Firebase 로그인
firebase login

# Firebase 프로젝트 생성 (선택사항)
firebase projects:create your-quiz-app-firebase
```

## 📋 **주요 기능**

### ✅ **구현 완료**
- [x] 프로젝트 기본 구조
- [x] 데이터베이스 스키마 (Enhanced Users, Sessions, Security Events, Quiz Data)
- [x] 공통 모듈 (Types, CORS, Validation, Logger, Database)
- [x] 헬스체크 API
- [x] Row Level Security (RLS) 정책
- [x] 성능 최적화 인덱스

### 🔄 **구현 중**
- [ ] Firebase Remote Config 연동
- [ ] 인증 시스템 (Supabase Auth + Firebase Remote Config)
- [ ] 퀴즈 데이터 관리 API
- [ ] 사용자 진행 상황 동기화
- [ ] AI 퀴즈 생성

## 🛠 **개발 명령어**

```bash
# 개발 서버 시작
deno task dev

# 데이터베이스 리셋
deno task db:reset

# 새 마이그레이션 생성
deno task db:migration migration_name

# 테스트 실행
deno task test

# 코드 포맷팅
deno task fmt

# 린팅
deno task lint

# 배포
deno task deploy
```

## 🔧 **환경 변수**

`.env.local` 파일에 다음 환경 변수들을 설정해야 합니다:

```env
# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Firebase Remote Config
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY=your-firebase-private-key
FIREBASE_CLIENT_EMAIL=your-firebase-client-email

# OpenAI (AI 퀴즈 생성용)
OPENAI_API_KEY=your-openai-api-key

# 환경 설정
ENVIRONMENT=development
LOG_LEVEL=debug
```

## 📊 **데이터베이스 스키마**

### 주요 테이블
- `users` - 사용자 정보 및 계정 상태
- `user_sessions` - 세션 관리 및 기기 추적
- `security_events` - 보안 이벤트 로깅
- `user_permissions` - 권한 및 할당량 관리
- `quiz_questions` - 퀴즈 문제 저장
- `quiz_results` - 사용자 답안 및 결과
- `quiz_sessions` - 퀴즈 세션 정보
- `quiz_versions` - 데이터 버전 관리

## 📡 **API 엔드포인트**

### 현재 구현된 API
- `GET /health` - 시스템 헬스체크

### 계획된 API
- `POST /auth/signup` - 사용자 회원가입
- `POST /auth/signin` - 로그인
- `POST /quiz/generate-file` - 퀴즈 데이터 파일 생성
- `POST /sync/progress` - 진행 상황 동기화
- `GET /history` - 퀴즈 히스토리 조회

## 🔒 **보안 기능**

- **Row Level Security (RLS)** - 데이터베이스 수준 접근 제어
- **JWT 토큰 검증** - 모든 API 요청 인증
- **Rate Limiting** - API 남용 방지
- **CORS 설정** - 크로스 오리진 요청 제어
- **입력 검증** - Zod 스키마 기반 데이터 검증
- **보안 이벤트 로깅** - 이상 활동 추적

## 💰 **비용 최적화**

- **Firebase Remote Config** - 버전 체크 완전 무료 (100% 절감)
- **정적 파일 서빙** - CDN을 통한 퀴즈 데이터 제공 (90% 절감)
- **Edge Functions** - 필요시에만 실행되는 서버리스 아키텍처
- **로컬 캐싱** - 앱에서 오프라인 지원

## 🚀 **배포**

### 개발 환경
```bash
supabase functions deploy --project-ref your-dev-project
```

### 프로덕션 환경
```bash
# 환경 변수 설정 후
supabase functions deploy --project-ref your-prod-project
```

## 📚 **문서**

- [설계 문서](.kiro/specs/bariny-backend-api/design.md)
- [요구사항 정의](.kiro/specs/bariny-backend-api/requirements.md)
- [구현 계획](.kiro/specs/bariny-backend-api/tasks.md)

## 🤝 **기여하기**

1. 이슈 생성 또는 기존 이슈 선택
2. 기능 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 푸시 (`git push origin feature/amazing-feature`)
5. Pull Request 생성

## 📞 **지원**

문제가 발생하거나 질문이 있으시면 GitHub Issues를 통해 문의해 주세요.

---

**📝 마지막 업데이트:** 2024-01-15  
**🔖 버전:** 1.0.0 (MVP 개발 중)
