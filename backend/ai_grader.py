import os
import json
import hashlib
from typing import Dict, Any
import google.generativeai as genai
import re

genai.configure(api_key=os.environ["GEMINI_API_KEY"])

MODEL_VERSION = "gemini-2.5-flash"


def normalize(s: str) -> str:
    return s.replace("\r\n", "\n").strip()

def normalize_score(n):
    if n is None:
        raise ValueError("점수 없음")

    if isinstance(n, (int, float)):
        score = int(round(n))

    elif isinstance(n, str):
        match = re.search(r"-?\d+", n)
        if not match:
            raise ValueError(f"점수 숫자 추출 실패: {n}")
        score = int(match.group())

    else:
        raise ValueError(f"점수 타입 오류: {type(n)}")

    return max(1, min(10, score))  



def validate(parsed: dict):
    if not isinstance(parsed, dict):
        raise ValueError("응답 파싱 실패")

    scores = parsed.get("scores", {})
    rationales = parsed.get("rationales", {})
    key_sentences = parsed.get("keySentences", {})

    if not isinstance(scores, dict):
        scores = {}
    if not isinstance(rationales, dict):
        rationales = {}
    if not isinstance(key_sentences, dict):
        key_sentences = {}

    # 점수 정규화 (1~10 고정)
    ct = normalize_score(scores.get("criticalThinking", 1))
    sk = normalize_score(scores.get("scientificKnowledge", 1))

    parsed["scores"] = {
        "criticalThinking": ct,
        "scientificKnowledge": sk,
    }

    for k in ["criticalThinking", "scientificKnowledge"]:

        r = rationales.get(k, [])
        ks = key_sentences.get(k, [])

        if not isinstance(r, list):
            r = []
        if not isinstance(ks, list):
            ks = []

        # 최소 2개 보장
        while len(r) < 2:
            r.append("근거 부족함")

        while len(ks) < 2:
            ks.append("관련 문장 부족")

        # 개수 불일치 보정
        min_len = min(len(r), len(ks))
        r = r[:min_len]
        ks = ks[:min_len]

        parsed["rationales"][k] = r
        parsed["keySentences"][k] = ks

def fallback_response():
    return {
        "scores": {
            "scientificKnowledge": 1,
            "criticalThinking": 1
        },
        "rationales": {
            "scientificKnowledge": ["모델 응답 오류로 기본값 적용함", "응답 형식 불안정함"],
            "criticalThinking": ["모델 응답 오류로 기본값 적용함", "응답 형식 불안정함"]
        },
        "keySentences": {
            "scientificKnowledge": ["원문 분석 실패", "원문 분석 실패"],
            "criticalThinking": ["원문 분석 실패", "원문 분석 실패"]
        }
    }


def analyze_essay(essay: str) -> dict:
    rubric_prompt = f"""
[역할]
당신은 엄격하고 비판적인 대학 수준의 평가자입니다.
학생의 에세이를 논리적 정합성과 과학적 정확성에 기반하여 냉정하게 평가하십시오.
점수 인플레이션을 경계하고, 깐깐하게 채점하십시오.

[답변 스타일 가이드]
평가 근거(rationales)는 구어체를 사용하지 마십시오.
'~함', '~임', '~부족함', '~타당함' 등 명사형 종결 어미(개조식)로 간결하게 작성하십시오.


각 항목은 0~10점 사이의 정수로 평가합니다.

0점 기준:
- 평가 요소가 거의 충족되지 않음
- 과학적 오류가 다수 존재함
- 논리 구조가 형성되지 않음
- 근거가 전혀 제시되지 않음

점수를 매길 때는 아래 핵심 평가 요소를 종합적으로 고려하십시오.

[채점 기준표]

평가 영역 1. 수과학적 지식(Scientific Knowledge)
[핵심 평가요소]
- 개념 활용의 타당성: 원자력 발전과 관련된 과학 개념이나 핵심 용어를 적절하고 다양하게 활용하여,
원자력 발전의 장점과 단점을 과학적으로 타당하게 설명하는가?
- 개념의 정확성(오개념 여부): 과학 개념이나 핵심 용어를 정확하게 이해하고 있는가? 과학적으로
잘못된 설명이나 사실 오류가 없는가? 이 때, 단순한 표현 미숙(오타와 같은 표현)과 개념 오류는
구분하여 판단할 것
- 설명의 구체성: 추상적 표현이 아닌 구체적 과학적 근거를 제시하는가? 수치, 비교, 구조적 설명 등을
활용하는가?

평가 영역 2. 비판적 사고력(Critical Thinking)
[핵심 평가요소]
- 논리적 흐름: 주장이 서론 →본론(근거, 설명) → 결론과 같은 구조로 자연스럽게 연결되는가? 글
전체에 모순이 없는가?
- 인과관계의 타당성: 원인과 결과를 적절히 연결하고 있는가? 단순 나열이 아니라 논증 구조를
갖추었는가?
- 근거의 충분성 및 반대 논거 고려: 주장을 지지하는 근거가 충분히 제시되는가? 근거가 주장과
직접적으로 연결되는가? 자신의 입장에 대한 반대 가능성을 예상했는가? 그에 대한 대응 논리를
제시하는가?
- 심층적 고찰: 단순히 한 측면만이 아니라 다양한 관점에서 검토하는가?(경제성, 안전성, 환경성, 국가
상황과 같은 다양한 측면)

각 항목은 1~10점 사이의 정수로 평가합니다.
각 점수에 대해 평가 근거 2개 이상과
해당 근거를 뒷받침하는 원문 문장을 함께 제공합니다.

각 항목은 반드시 독립적으로 평가하십시오.

"""

    canon = normalize(essay)

    prompt = f"""
당신은 전문 교육 조교입니다.
아래 학생 글을 평가하세요.

{rubric_prompt}

⚠️`keySentences`는 반드시 학생 글에 있는 문장을 **토씨 하나 틀리지 않고 그대로(Exact Match)** 가져와야 합니다.
⚠️`rationales`는 위에서 정의한 **'~함' 체**로 간결하게 작성하십시오.
⚠️ 반드시 아래 JSON 스키마를 정확히 따르시오.
⚠️ 키 이름, 중첩 구조, 배열 형태를 절대 변경하지 마시오.
⚠️ JSON 외 텍스트가 있으면 오류로 간주됨.

출력 JSON 스키마 (예시 형식 그대로 유지):

{{
  "scores": {{
    "scientificKnowledge": 1~10 사이의 정수,
    "criticalThinking": 1~10 사이의 정수
  }},
  "rationales": {{
    "scientificKnowledge": ["근거1", "근거2"],
    "criticalThinking": ["근거1", "근거2"]
  }},
  "keySentences": {{
    "scientificKnowledge": ["문장1", "문장2"],
    "criticalThinking": ["문장1", "문장2"]
  }}
}}

학생 글:
---
{canon}
---
"""


    model = genai.GenerativeModel(
        MODEL_VERSION,
        generation_config={
            "temperature": 0,
            "top_k": 1,
            "top_p": 0,
            "candidate_count": 1,
        }
    )

    response = model.generate_content(prompt)
    raw_text = response.text

    if not raw_text or not raw_text.strip():
        raise ValueError("Gemini returned empty response")

    raw_text = raw_text.strip()

    # ```json ``` 제거 방어
    if raw_text.startswith("```"):
        raw_text = (
            raw_text
            .replace("```json", "")
            .replace("```", "")
            .strip()
        )

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        return fallback_response()
    validate(parsed)

    return parsed


def run_ai_grading(essay_text: str):
    parsed = analyze_essay(essay_text)

    return {
        "success": True,
        "scores": {
            "scientific": parsed["scores"]["scientificKnowledge"],
            "critical": parsed["scores"]["criticalThinking"],
        },
        "rationales": {
            "scientific": parsed["rationales"]["scientificKnowledge"],
            "critical": parsed["rationales"]["criticalThinking"],
        },
        "key_sentences": {
            "scientific": parsed["keySentences"]["scientificKnowledge"],
            "critical": parsed["keySentences"]["criticalThinking"],
        }
    }