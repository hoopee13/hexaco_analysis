// netlify/functions/analyze.js
// HEXACO 성격 분석 — Claude API 프록시 함수
// 8점 만점 기준 (1.0 ~ 8.0)

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5'; // 빠른 응답(5~10초)에 최적화. 더 깊은 해석이 필요하면 'claude-sonnet-4-6' 또는 'claude-opus-4-7'

// ── 차원 메타데이터 ─────────────────────────────────
const DIM_INFO = {
  H: { ko: '정직·겸손',  en: 'Honesty-Humility' },
  E: { ko: '정서성',      en: 'Emotionality' },
  X: { ko: '외향성',      en: 'Extraversion' },
  A: { ko: '원만성',      en: 'Agreeableness' },
  C: { ko: '성실성',      en: 'Conscientiousness' },
  O: { ko: '개방성',      en: 'Openness' },
};

// ── 8점 만점 해석 구간 ─────────────────────────────
function levelOf(s) {
  if (s >= 6.8) return '매우 높음';
  if (s >= 5.6) return '높음';
  if (s >= 4.3) return '중간';
  if (s >= 2.9) return '낮음';
  return '매우 낮음';
}

// ── 프롬프트 빌더 ───────────────────────────────────
function buildPrompt(sc) {
  // 점수 정렬: 높은 순
  const sorted = Object.entries(sc).sort((a, b) => b[1] - a[1]);
  const avg = Object.values(sc).reduce((a, b) => a + b, 0) / 6;
  const spread = sorted[0][1] - sorted[sorted.length - 1][1];

  const scoreLines = sorted
    .map(([k, v]) => `  - ${DIM_INFO[k].ko} (${k}): ${v.toFixed(1)}점 — ${levelOf(v)}`)
    .join('\n');

  return `당신은 HEXACO 성격 모델 전문가입니다. 한 사람의 6가지 성격 차원 점수를 바탕으로, 20-30대 한국인 맥락에 맞는 깊이 있고 따뜻한 해석을 작성해주세요.

## 점수 해석 기준 (8점 만점)
- 6.8점 이상: 매우 높음
- 5.6 ~ 6.8점: 높음
- 4.3 ~ 5.6점: 중간
- 2.9 ~ 4.3점: 낮음
- 2.9점 미만: 매우 낮음

고/저 구분선:
- 높음(h): 5.7점 이상
- 중간(m): 3.5 ~ 5.7점
- 낮음(l): 3.5점 미만

중간값(평균적인 사람)은 4.5점입니다.

## 분석 대상자의 점수
${scoreLines}

전체 평균: ${avg.toFixed(2)}점
차원 간 격차(최고-최저): ${spread.toFixed(1)}점

## 작성 지침
1. **3~4개 단락, 각 단락은 3~4줄** 정도로 간결하게 작성하세요. 전체 분량은 800자 이내가 적절합니다.
2. **가장 두드러지는 1~2개 차원을 중심**으로 해석하되, 나머지 차원과의 상호작용도 짧게 언급하세요.
3. **일상적인 상황 예시** (직장, 연인, 친구 등)를 구체적으로 들어 서술하세요.
4. **"당신은 ~한 사람입니다"** 형식으로 2인칭 존댓말을 사용하세요.
5. 차원 이름을 언급할 때는 **한국어 이름 + (점수)** 형식으로 표기하세요. 예: **정직·겸손(6.2점)**
6. **강점과 긴장(주의할 점)을 함께** 다뤄주세요. 장점만 나열하지 마세요.
7. 차원 간 격차가 크다면(4.4점 이상), 그 **극단성 자체가 의미 있는 패턴**임을 짚어주세요.
8. 평균이 높으면(5.9점 이상) **번아웃 위험**을, 낮으면(3.3점 미만) **회복의 필요성**을 언급하세요.
9. 마크다운 **굵게(**텍스트**)** 는 사용 가능, 헤더(#)와 목록(-)은 사용하지 마세요.
10. 전체 글은 **자연스러운 프로즈(paragraph)** 형태로, 심리상담가가 편지 쓰듯 작성하세요.

이제 이 사람만의 고유한 해석을 간결하고 따뜻하게 작성해주세요.`;
}

// ── Netlify Function 핸들러 ────────────────────────
exports.handler = async (event) => {
  // CORS 프리플라이트
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'POST 메서드만 지원합니다.' }),
    };
  }

  // API 키 확인
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다. Netlify 대시보드 → Site configuration → Environment variables에서 설정해주세요.',
      }),
    };
  }

  // 요청 파싱
  let sc;
  try {
    const body = JSON.parse(event.body || '{}');
    sc = body.sc;
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: '요청 본문이 올바른 JSON이 아닙니다.' }),
    };
  }

  // 입력 검증 — 6개 차원 모두 존재하고 1~8 범위인지
  const required = ['H', 'E', 'X', 'A', 'C', 'O'];
  if (!sc || typeof sc !== 'object') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: '점수 객체(sc)가 누락되었습니다.' }),
    };
  }
  for (const k of required) {
    const v = sc[k];
    if (typeof v !== 'number' || isNaN(v) || v < 1 || v > 8) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `차원 ${k}의 점수가 유효하지 않습니다. 1.0~8.0 범위의 숫자여야 합니다. (받은 값: ${v})`,
        }),
      };
    }
  }

  // Claude API 호출
  try {
    const apiRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: [
          { role: 'user', content: buildPrompt(sc) },
        ],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Claude API error:', apiRes.status, errText);
      return {
        statusCode: apiRes.status,
        body: JSON.stringify({
          error: `Claude API 오류 (${apiRes.status}): ${errText.slice(0, 200)}`,
        }),
      };
    }

    const data = await apiRes.json();

    // 응답에서 텍스트 추출
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!text) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Claude API 응답에서 텍스트를 찾을 수 없습니다.' }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ text }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: `서버 내부 오류: ${err.message || '알 수 없는 오류'}`,
      }),
    };
  }
};
