// netlify/functions/analyze.js
// Anthropic API 키를 서버사이드에서 안전하게 처리하는 프록시 함수

exports.handler = async (event) => {
  // CORS 헤더
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Preflight 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Netlify 환경변수에서 API 키 읽기 (절대 클라이언트에 노출되지 않음)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'API key not configured' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { sc } = body; // { H, E, X, A, C, O }
  if (!sc) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing score data' }),
    };
  }

  // 점수 데이터 가공
  const KO = { H:'정직·겸손', E:'정서성', X:'외향성', A:'원만성', C:'성실성', O:'개방성' };
  const EN = { H:'Honesty-Humility', E:'Emotionality', X:'eXtraversion', A:'Agreeableness', C:'Conscientiousness', O:'Openness' };
  const DIMS = ['H','E','X','A','C','O'];

  function lvl(s) {
    if (s >= 4.3) return '매우 높음';
    if (s >= 3.6) return '높음';
    if (s >= 2.9) return '중간';
    if (s >= 2.1) return '낮음';
    return '매우 낮음';
  }

  const sorted = Object.entries(sc).sort((a, b) => b[1] - a[1]);
  const avg    = Object.values(sc).reduce((a, b) => a + b, 0) / 6;
  const top    = sorted[0][0];
  const second = sorted[1][0];
  const third  = sorted[2][0];
  const bot    = sorted[sorted.length - 1][0];
  const bot2   = sorted[sorted.length - 2][0];
  const spread = (sorted[0][1] - sorted[sorted.length - 1][1]).toFixed(1);

  // 상위/하위 조합 설명
  const topCombos = sorted.slice(0,3).map(e=>`${KO[e[0]]}(${e[1].toFixed(1)}점)`).join(', ');
  const botCombos = sorted.slice(-2).map(e=>`${KO[e[0]]}(${e[1].toFixed(1)}점)`).join(', ');

  const dimDesc = DIMS.map(d =>
    `  - ${KO[d]}(${EN[d]}): ${sc[d].toFixed(1)}점 [${lvl(sc[d])}]`
  ).join('\n');

  const prompt = `당신은 HEXACO 성격 모델을 깊이 연구한 심리학 전문가입니다.
아래 점수를 바탕으로 이 사람만의 고유한 성격 프로파일을 다각적으로 분석해주세요.

━━━ HEXACO 점수 ━━━
${dimDesc}

전체 평균: ${avg.toFixed(2)}점 / 5.0
상위 차원: ${topCombos}
하위 차원: ${botCombos}
차원 간 최대 격차: ${spread}점

━━━ 분석 요청 ━━━

아래 7개 관점을 모두 포함하여 총 20줄 내외의 풍부한 프로파일을 작성해주세요.
각 단락은 자연스럽게 이어지는 하나의 이야기처럼 구성해주세요.

【1. 핵심 성격 구조】
가장 높은 두 차원(${KO[top]}, ${KO[second]})이 만들어내는 이 사람의 본질적인 성격 구조를 설명하세요.
단순 특성 나열이 아니라, 이 두 가지가 어떻게 결합되어 고유한 패턴을 만드는지 서술하세요.

【2. 강점이 발휘되는 구체적 상황】
직장, 연애, 친구 관계에서 이 조합의 강점이 실제로 어떻게 나타나는지 생생한 상황으로 설명하세요.
20-30대가 "맞아, 나 이랬어"라고 공감할 수 있는 구체적인 장면을 포함하세요.

【3. 높은 차원과 낮은 차원의 상호작용】
${KO[top]}이 높고 ${KO[bot]}이 낮은 이 조합이 만들어내는 내면의 긴장 또는 시너지를 분석하세요.
예를 들어, 강한 특성이 약한 특성을 어떻게 보완하거나 충돌하는지 구체적으로 서술하세요.

【4. 반복되는 패턴과 숨은 함정】
이 성격 구조를 가진 사람이 직장, 관계, 자기관리에서 반복적으로 경험하는 어려움이나 함정을 솔직하게 서술하세요.
"나만 이런 게 아니었구나"라고 느낄 수 있도록 공감적으로 써주세요.

【5. 에너지 수준과 번아웃/회복 패턴】
전체 평균 ${avg.toFixed(2)}점을 고려해서, 이 사람이 에너지를 어떻게 쓰고 회복하는지 분석하세요.
어떤 상황에서 충전되고, 어떤 상황에서 소진되는지 구체적으로 서술하세요.

【6. 성장을 위한 실질적 방향】
이 성격 구조가 더 건강하게 발전하려면 어떤 방향이 필요한지 구체적으로 제안하세요.
막연한 조언이 아니라 실제로 시도해볼 수 있는 행동 방향으로 써주세요.

【7. 따뜻한 마무리】
20-30대라는 이 시기에 이 성격을 갖고 살아가는 것의 의미를 따뜻하게 마무리해주세요.
점수가 높든 낮든, 이 성격은 그 자체로 의미 있다는 메시지로 끝맺어주세요.

━━━ 작성 규칙 ━━━
- 한국어로 작성, 20-30대 공감 언어 사용
- 총 7단락, 각 단락 2-4문장, 전체 20줄 내외
- **굵게**로 핵심 키워드 3-5개 강조
- 심리학 용어보다 일상 언어 우선
- "당신은" 2인칭으로 직접 말 걸기
- 점수의 높고 낮음은 우열이 아닌 방향의 차이임을 전제로`;


  try {
    // Anthropic API 호출 (non-streaming — Netlify Functions는 스트리밍 미지원)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'Anthropic API error', detail: errText }),
      };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
