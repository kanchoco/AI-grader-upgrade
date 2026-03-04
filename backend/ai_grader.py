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

    return max(0, min(10, score))  



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

def fallback_response(reason: str = "모델 응답 오류"):
    return {
        "scores": {
            "scientificKnowledge": 1,
            "criticalThinking": 1
        },
        "rationales": {
            "scientificKnowledge": [
                f"{reason}로 기본 점수 적용함",
                "형식 불안정으로 최소 점수 처리함"
            ],
            "criticalThinking": [
                f"{reason}로 기본 점수 적용함",
                "형식 불안정으로 최소 점수 처리함"
            ]
        },
        "keySentences": {
            "scientificKnowledge": [
                "원문 분석 실패",
                "원문 분석 실패"
            ],
            "criticalThinking": [
                "원문 분석 실패",
                "원문 분석 실패"
            ]
        }
    }


def analyze_essay(essay: str, prompt_text: str) -> dict:
    rubric_prompt = prompt_text

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
        return fallback_response("JSON 파싱 실패")

    try:
        validate(parsed)
    except Exception as e:
        print("VALIDATE ERROR:", e)
        return fallback_response(str(e))

    return parsed


def run_ai_grading(essay_text: str, prompt_text: str):
    try:
        parsed = analyze_essay(essay_text, prompt_text)
    except Exception as e:
        print("AI GRADING ERROR:", e)
        parsed = fallback_response(str(e))

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