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
  const bot    = sorted[sorted.length - 1][0];
  const spread = (sorted[0][1] - sorted[sorted.length - 1][1]).toFixed(1);

  const dimDesc = DIMS.map(d =>
    `${KO[d]}(${EN[d]}): ${sc[d].toFixed(1)}점 — ${lvl(sc[d])}`
  ).join('\n');

  const prompt = `당신은 HEXACO 성격 모델 전문가입니다. 아래 점수를 바탕으로 이 사람의 성격 프로파일을 작성해주세요.

[HEXACO 점수]
${dimDesc}

전체 평균: ${avg.toFixed(2)}점
최고 차원: ${KO[top]} (${sc[top].toFixed(1)}점)
2위 차원: ${KO[second]} (${sc[second].toFixed(1)}점)
최저 차원: ${KO[bot]} (${sc[bot].toFixed(1)}점)
차원 간 격차: ${spread}점

[작성 지침]
- 20-30대가 공감할 수 있는 실생활 언어로 작성
- 직장, 연애, 친구 관계에서 실제로 겪는 상황을 구체적으로 언급
- 점수의 조합이 만들어내는 복합적인 패턴을 중심으로 설명 (단순 나열 금지)
- 높은 차원과 낮은 차원이 어떻게 서로 영향을 주고받는지 분석
- 강점과 성장 과제를 균형 있게 다루되, 비판적이지 않게
- 전체 평균이 높으면 번아웃 주의, 낮으면 회복과 자기 이해의 관점에서 접근
- 5단락, 각 단락 3-4문장, 총 15-20줄 분량
- **굵게** 표시로 핵심 키워드 강조
- 마지막 단락은 이 시기(20-30대)를 살아가는 당신에게 따뜻하게 마무리`;

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
        max_tokens: 1200,
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
