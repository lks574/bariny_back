# 🚀 Brainy Quiz Backend - 환경 설정 가이드

이 가이드는 Brainy Quiz Backend 시스템의 완전한 설정 과정을 안내합니다.

## 📋 **사전 요구사항**

### 필수 소프트웨어
- **Deno**: 1.37.0 이상
- **Supabase CLI**: 최신 버전
- **Node.js**: 18.0.0 이상 (Firebase CLI용)
- **Git**: 버전 관리

### 계정 및 서비스
- **Supabase 계정**: https://supabase.com
- **Firebase 계정**: https://firebase.google.com
- **OpenAI 계정**: https://platform.openai.com

## 🏗️ **1단계: 기본 환경 설정**

### Deno 설치
```bash
# macOS
brew install deno

# Linux/WSL
curl -fsSL https://deno.land/x/install/install.sh | sh

# Windows
iwr https://deno.land/x/install/install.ps1 -useb | iex
```

### Supabase CLI 설치
```bash
# macOS
brew install supabase/tap/supabase

# Linux/WSL
curl -fsSL https://deno.land/x/install/install.sh | sh

# Windows (PowerShell)
Invoke-WebRequest -Uri https://github.com/supabase/cli/releases/latest/download/supabase_windows_amd64.zip -OutFile supabase.zip
```

### Firebase CLI 설치
```bash
npm install -g firebase-tools
```

## 🗄️ **2단계: Supabase 프로젝트 설정**

### 로컬 개발 환경
```bash
# 1. 프로젝트 디렉토리에서 Supabase 초기화
supabase init

# 2. 로컬 Supabase 서버 시작
supabase start

# 3. 데이터베이스 마이그레이션 실행
supabase db reset

# 4. 상태 확인
supabase status
```

### 프로덕션 환경 (선택사항)
```bash
# 1. Supabase 로그인
supabase login

# 2. 새 프로젝트 생성
supabase projects create brainy-quiz-backend

# 3. 프로젝트 링크
supabase link --project-ref your-project-ref
```

## 🔥 **3단계: Firebase 설정**

### Firebase 프로젝트 생성
```bash
# 1. Firebase 로그인
firebase login

# 2. 새 프로젝트 생성
firebase projects:create brainy-quiz-firebase

# 3. 프로젝트 설정
firebase use brainy-quiz-firebase
```

### Service Account 키 생성
1. Firebase Console → 프로젝트 설정 → 서비스 계정
2. **새 비공개 키 생성** 클릭
3. JSON 파일 다운로드 및 안전한 곳에 보관

### Remote Config 활성화
```bash
# Remote Config 템플릿 배포
firebase deploy --only remoteconfig
```

## 🤖 **4단계: OpenAI API 설정**

### API 키 생성
1. https://platform.openai.com 접속
2. **API Keys** → **Create new secret key**
3. 키 복사 및 안전한 곳에 보관

### 사용량 제한 설정 (권장)
1. OpenAI Dashboard → **Billing** → **Usage limits**
2. 월 사용량 제한 설정 (예: $50)

## ⚙️ **5단계: 환경 변수 설정**

### 로컬 개발용 환경 변수
```bash
# supabase/.env.local 파일 생성
cp supabase/.env.local.example supabase/.env.local
```

### 환경 변수 값 설정
```bash
# supabase/.env.local 파일 편집
# 다음 값들을 실제 값으로 변경:

# Supabase (supabase status 명령어로 확인)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Firebase (Service Account JSON에서 추출)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_CLIENT_ID=your-client-id

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key
```

## 🏪 **6단계: Storage Bucket 설정**

### 로컬 환경
```bash
# 로컬 Supabase에서는 자동으로 생성됨
# supabase/config.toml에서 설정 확인
```

### 프로덕션 환경
1. Supabase Dashboard → **Storage**
2. **Create bucket** 클릭
3. 버킷 정보:
   - Name: `quiz-files`
   - Public: `true`
   - File size limit: `10MB`

## 🔧 **7단계: 개발 서버 시작**

### 모든 서비스 시작
```bash
# 1. Supabase 서비스 시작 (아직 시작하지 않은 경우)
supabase start

# 2. Edge Functions 서빙
deno task dev

# 또는 직접 실행
supabase functions serve --env-file supabase/.env.local
```

### 헬스체크
```bash
# 시스템 상태 확인
deno task health

# 또는 직접 호출
curl http://localhost:54321/functions/v1/health
```

## ✅ **8단계: 설정 검증**

### 각 서비스별 테스트
```bash
# 1. 데이터베이스 연결 확인
curl http://localhost:54321/functions/v1/health

# 2. AI 퀴즈 생성 테스트 (JWT 토큰 필요)
# 먼저 테스트 사용자 생성 후:
deno task ai:test

# 3. 리더보드 조회 테스트
deno task leaderboard:test
```

### 환경 변수 확인
```bash
# Edge Functions 로그에서 확인
supabase functions logs --function-name health
```

## 🚀 **9단계: 프로덕션 배포 (선택사항)**

### Supabase 배포
```bash
# 1. 프로덕션 환경 변수 설정 (Supabase Dashboard)
# Settings → Edge Functions → Environment Variables

# 2. Edge Functions 배포
supabase functions deploy

# 3. 데이터베이스 마이그레이션 배포
supabase db push
```

### Firebase 배포
```bash
firebase deploy --only remoteconfig
```

## 🔍 **트러블슈팅**

### 자주 발생하는 문제들

#### 1. Supabase 연결 실패
```bash
# 포트 충돌 확인
lsof -i :54321

# Supabase 재시작
supabase stop
supabase start
```

#### 2. Firebase 인증 오류
```bash
# 환경 변수 확인
echo $FIREBASE_PROJECT_ID

# Service Account 키 형식 확인
cat path/to/service-account.json | jq .
```

#### 3. OpenAI API 오류
```bash
# API 키 유효성 확인
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

#### 4. Edge Functions 오류
```bash
# 함수별 로그 확인
supabase functions logs --function-name auth-signin

# 실시간 로그 스트리밍
supabase functions logs --function-name health --follow
```

## 📚 **추가 자료**

- [Supabase 공식 문서](https://supabase.com/docs)
- [Firebase 공식 문서](https://firebase.google.com/docs)
- [OpenAI API 문서](https://platform.openai.com/docs)
- [Deno 공식 문서](https://deno.land/manual)

## 💡 **개발 팁**

### 유용한 명령어들
```bash
# 전체 시스템 상태 확인
supabase status

# 특정 함수 배포
supabase functions deploy ai-generate

# 데이터베이스 차이점 확인
supabase db diff

# 새 마이그레이션 생성
supabase migration new add_new_feature
```

### VS Code 설정 (권장)
```json
{
  "deno.enable": true,
  "deno.lint": true,
  "deno.unstable": true
}
```

---

**🎉 설정 완료!** 모든 설정이 완료되면 완전한 기능을 갖춘 퀴즈 백엔드 시스템을 사용할 수 있습니다! 