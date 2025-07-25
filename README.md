# 🧠 Brainy Quiz Backend

Firebase Remote Config와 Supabase를 활용한 iOS 퀴즈 앱 백엔드 시스템입니다.

## 📋 **프로젝트 개요**

이 프로젝트는 비용 효율적이고 확장 가능한 퀴즈 앱 백엔드를 제공하며, Firebase Remote Config를 통한 동적 설정 관리와 Supabase의 강력한 백엔드 서비스를 결합했습니다.

### 🎯 **핵심 가치**
- **비용 최적화**: Firebase Remote Config 무료 사용으로 버전 관리 비용 0원
- **실시간 설정**: 앱 재배포 없이 실시간 설정 변경
- **확장성**: Supabase Edge Functions를 통한 서버리스 아키텍처
- **보안**: 포괄적인 인증 및 권한 관리 시스템

## 🏗️ **프로젝트 구조**

```
brainy_back/
├── README.md
├── deno.json                           # Deno 프로젝트 설정
├── firebase.json                       # Firebase 프로젝트 설정
├── firebase-remote-config.json         # Remote Config 초기 템플릿
├── scripts/
│   └── firebase-setup.md              # Firebase 설정 가이드
├── supabase/
│   ├── config.toml                     # Supabase 로컬 설정
│   ├── migrations/
│   │   └── 20240115000001_initial_schema.sql  # 초기 데이터베이스 스키마
│   └── functions/
│       ├── _shared/                    # 공통 모듈
│       │   ├── types.ts               # TypeScript 타입 정의
│       │   ├── cors.ts                # CORS 설정
│       │   ├── validation.ts          # 입력 검증
│       │   ├── logger.ts              # 로깅 시스템
│       │   ├── database.ts            # 데이터베이스 헬퍼
│       │   ├── auth.ts                # 인증 미들웨어
│       │   └── firebase-admin.ts      # Firebase Admin SDK
│       ├── health/                     # 헬스체크 API
│       ├── auth-signup/                # 회원가입 API
│       ├── auth-signin/                # 로그인 API
│       ├── quiz-data/                  # 퀴즈 데이터 관리 API
│       ├── sync-progress/              # 진행 상황 동기화 API
│       └── leaderboard/                # 리더보드 API
```

## 🚀 **빠른 시작**

### 1. 환경 설정

```bash
# 프로젝트 클론
git clone <repository-url>
cd brainy_back

# Deno 설치 (macOS)
brew install deno

# Supabase CLI 설치
brew install supabase/tap/supabase
```

### 2. Supabase 로컬 환경 설정

```bash
# Supabase 로컬 서버 시작
supabase start

# 데이터베이스 마이그레이션 실행
supabase db reset
```

### 3. Firebase Remote Config 설정

[Firebase 설정 가이드](scripts/firebase-setup.md)를 참조하여 Firebase 프로젝트를 설정하세요.

### 4. 환경 변수 설정

`supabase/.env.local` 파일 생성:

```env
# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Firebase Remote Config
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_CLIENT_ID=your-client-id
```

### 5. 개발 서버 실행

```bash
# Edge Functions 서빙
deno task dev

# 또는
supabase functions serve --env-file supabase/.env.local
```

## ✅ **구현 완료 기능**

### 🔥 **Firebase Remote Config 연동**
- [x] Firebase Admin SDK 통합
- [x] JWT 토큰 기반 인증
- [x] Remote Config 파라미터 관리 (20개 이상)
- [x] 실시간 설정 업데이트

### 🔐 **완전한 인증 시스템**
- [x] 이메일 회원가입/로그인
- [x] Google/Apple 소셜 로그인
- [x] 게스트 모드 지원
- [x] JWT 토큰 검증 미들웨어
- [x] 로그인 시도 제한 및 계정 잠금
- [x] 앱 버전 호환성 검사
- [x] 세션 관리 및 디바이스 추적

### 📊 **퀴즈 데이터 관리**
- [x] DB → JSON 파일 자동 생성
- [x] Supabase Storage 업로드
- [x] Remote Config 자동 업데이트
- [x] 카테고리별 데이터 관리

### 🔄 **진행 상황 동기화**
- [x] 오프라인 → 온라인 데이터 동기화
- [x] 충돌 감지 및 해결
- [x] 사용자별 진행 통계
- [x] 세션 및 결과 관리

### 🏆 **리더보드 시스템**
- [x] 실시간 순위표
- [x] 카테고리별/기간별 필터링
- [x] 종합 점수 계산
- [x] 사용자 개별 순위 조회

### 🩺 **모니터링 및 로깅**
- [x] 헬스체크 API (모든 서비스 상태 확인)
- [x] 구조화된 로깅 시스템
- [x] 성능 측정 및 메트릭
- [x] 보안 이벤트 추적

## 🛠️ **개발 명령어**

```bash
# 개발 서버 시작
deno task dev

# Edge Functions 배포
deno task deploy

# 데이터베이스 리셋
deno task db:reset

# 새 마이그레이션 생성
deno task db:migration

# 테스트 실행
deno task test

# 코드 린팅
deno task lint

# 코드 포맷팅
deno task fmt
```

## 📡 **API 엔드포인트**

### 인증 API
- `POST /functions/v1/auth-signup` - 회원가입
- `POST /functions/v1/auth-signin` - 로그인

### 퀴즈 데이터 API
- `GET /functions/v1/quiz-data` - 퀴즈 데이터 조회
- `POST /functions/v1/quiz-data` - 퀴즈 파일 생성

### 진행 상황 API
- `GET /functions/v1/sync-progress` - 진행 상황 조회
- `POST /functions/v1/sync-progress` - 데이터 동기화
- `PUT /functions/v1/sync-progress` - 진행 상황 업데이트

### 리더보드 API
- `GET /functions/v1/leaderboard` - 리더보드 조회

### 시스템 API
- `GET /functions/v1/health` - 헬스체크

## 🗄️ **데이터베이스 스키마**

### 핵심 테이블
- **users**: 사용자 정보 및 프로필
- **user_sessions**: 세션 관리 및 디바이스 추적
- **security_events**: 보안 이벤트 로깅
- **quiz_questions**: 퀴즈 문제 데이터
- **quiz_sessions**: 퀴즈 세션 정보
- **quiz_results**: 퀴즈 답안 결과
- **quiz_versions**: 퀴즈 데이터 버전 관리

### 보안 기능
- **Row Level Security (RLS)**: 모든 테이블에 적용
- **권한 기반 접근 제어**: 사용자/관리자/게스트 역할
- **데이터 암호화**: 민감 정보 보호

## 🔒 **보안 기능**

### 인증 및 인가
- JWT 토큰 기반 인증
- 역할 기반 권한 관리 (RBAC)
- Firebase Remote Config 기반 동적 정책
- 세션 타임아웃 및 디바이스 관리

### 보안 모니터링
- 로그인 시도 제한
- 계정 잠금 메커니즘
- 보안 이벤트 실시간 로깅
- IP 주소 및 User-Agent 추적

### 데이터 보안
- Row Level Security (RLS)
- 입력 데이터 검증 및 sanitization
- SQL 인젝션 방지
- XSS 공격 방지

## 💰 **비용 최적화**

### Firebase Remote Config 활용
- **무료 티어 사용**: 월 100만 요청 무료
- **버전 관리 비용 0원**: 기존 서버 비용 대비 100% 절감
- **실시간 업데이트**: 앱 스토어 배포 없이 설정 변경

### Supabase 효율적 사용
- **PostgreSQL**: 강력한 관계형 데이터베이스
- **Edge Functions**: 서버리스로 인프라 비용 최소화
- **내장 인증**: 별도 인증 서버 불필요

### CDN 활용
- **정적 파일 서빙**: 퀴즈 데이터 JSON 파일
- **글로벌 캐싱**: 빠른 응답 속도
- **대역폭 비용 절감**: 효율적인 콘텐츠 전송

## 🚀 **배포**

### 프로덕션 배포

```bash
# Supabase 프로젝트 링크
supabase link --project-ref your-project-ref

# Edge Functions 배포
supabase functions deploy

# 환경 변수 설정 (Supabase Dashboard)
# Settings → Edge Functions → Environment Variables
```

### Firebase Remote Config 배포

```bash
# Remote Config 템플릿 배포
firebase deploy --only remoteconfig --project your-firebase-project
```

## 📊 **모니터링 및 관리**

### 로그 확인
```bash
# Supabase 로그 확인
supabase functions logs --function-name health

# 실시간 로그 스트리밍
supabase functions logs --function-name auth-signin --follow
```

### 데이터베이스 관리
```bash
# 데이터베이스 백업
supabase db dump --file backup.sql

# 마이그레이션 상태 확인
supabase migration list
```

## 🔄 **진행 중인 작업**

- [ ] AI 퀴즈 생성 시스템
- [ ] 실시간 알림 시스템
- [ ] 관리자 대시보드
- [ ] 파일 저장소 최적화
- [ ] 성능 모니터링 대시보드
- [ ] 자동화된 테스트 스위트

## 📝 **문서**

- [Firebase 설정 가이드](scripts/firebase-setup.md)
- [API 문서](docs/api.md) *(예정)*
- [배포 가이드](docs/deployment.md) *(예정)*
- [트러블슈팅](docs/troubleshooting.md) *(예정)*

## 🤝 **기여하기**

1. 이슈를 생성하여 기능 요청이나 버그를 보고해주세요
2. Fork 후 feature 브랜치를 생성하세요
3. 변경 사항을 커밋하고 Pull Request를 제출하세요

## 📄 **라이선스**

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

---

## 📞 **지원**

문제가 발생하거나 질문이 있으시면:

1. [GitHub Issues](https://github.com/your-repo/issues)에 문의
2. [Supabase 공식 문서](https://supabase.com/docs) 참조
3. [Firebase 공식 문서](https://firebase.google.com/docs) 참조

**🎉 Happy Coding!**
