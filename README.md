# HEXACO 성격 분석 사이트 — Netlify 배포 가이드

## 파일 구조
```
hexaco-site/
├── index.html                    # 메인 사이트
├── netlify.toml                  # Netlify 설정
└── netlify/
    └── functions/
        └── analyze.js            # Claude API 프록시 함수
```

---

## Netlify 배포 방법

### 1단계 — GitHub에 올리기
```bash
git init
git add .
git commit -m "HEXACO site init"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/hexaco-site.git
git push -u origin main
```

### 2단계 — Netlify 연결
1. https://netlify.com 접속 → 로그인
2. **"Add new site"** → **"Import an existing project"**
3. GitHub 연결 후 `hexaco-site` 저장소 선택
4. Build 설정은 자동 감지 (netlify.toml 읽음)
5. **"Deploy site"** 클릭

### 3단계 — API 키 환경변수 설정 ⚠️ 필수
1. Netlify 대시보드 → 사이트 선택
2. **Site configuration** → **Environment variables**
3. **"Add a variable"** 클릭
4. Key: `ANTHROPIC_API_KEY`
5. Value: `sk-ant-...` (Anthropic Console에서 발급)
6. **Save** → **Trigger deploy** (재배포 필요)

> API 키는 절대 index.html에 직접 넣지 마세요.
> Netlify 환경변수에만 저장하면 외부에 노출되지 않습니다.

---

## API 키 발급
1. https://console.anthropic.com 접속
2. **API Keys** → **Create Key**
3. 키 복사 후 Netlify 환경변수에 붙여넣기

---

## 로컬 테스트 (선택)
```bash
npm install -g netlify-cli
netlify dev
```
`.env` 파일 생성:
```
ANTHROPIC_API_KEY=sk-ant-여기에키입력
```
브라우저에서 `http://localhost:8888` 접속
