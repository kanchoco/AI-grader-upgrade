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

    parsed_scores = {}
    parsed_rationales = {}
    parsed_key_sentences = {}

    # scores에 있는 criteria 기준으로 처리
    for criterion, score in scores.items():

        # 점수 정규화
        score = normalize_score(score)
        parsed_scores[criterion] = score

        r = rationales.get(criterion, [])
        ks = key_sentences.get(criterion, [])

        if not isinstance(r, list):
            r = []

        if not isinstance(ks, list):
            ks = []

        # 최소 2개 보장
        while len(r) < 2:
            r.append("근거 부족함")

        while len(ks) < 2:
            ks.append("관련 문장 부족")

        # 개수 맞추기
        min_len = min(len(r), len(ks))
        r = r[:min_len]
        ks = ks[:min_len]

        parsed_rationales[criterion] = r
        parsed_key_sentences[criterion] = ks

    parsed["scores"] = parsed_scores
    parsed["rationales"] = parsed_rationales
    parsed["keySentences"] = parsed_key_sentences


def fallback_response(criteria: list[str], reason: str = "모델 응답 오류"):

    scores = {}
    rationales = {}
    key_sentences = {}

    for c in criteria:

        scores[c] = 1

        rationales[c] = [
            f"{reason}로 기본 점수 적용함",
            "형식 불안정으로 최소 점수 처리함"
        ]

        key_sentences[c] = [
            "원문 분석 실패",
            "원문 분석 실패"
        ]

    return {
        "scores": scores,
        "rationales": rationales,
        "keySentences": key_sentences
    }


def analyze_essay(essay: str, prompt_text: str) -> dict:

    prompt = f"""
{prompt_text}

⚠️`scores`, `rationales`, `keySentences`의 key는 **rubric에서 제시된 평가 항목 이름을 그대로 사용해야 합니다.**
⚠️`keySentences`는 반드시 학생 글에서 **Exact Match**로 가져와야 합니다.
⚠️`rationales`는 '~함' 체로 간결하게 작성하십시오.
⚠️ 반드시 아래 JSON 스키마를 정확히 따르시오.
⚠️ JSON 외 텍스트가 있으면 오류로 간주됨.
⚠️ JSON만 출력해야 합니다.

JSON 형식:

{{
  "scores": {{
    "<criterion_name>": 1~10
  }},
  "rationales": {{
    "<criterion_name>": ["근거1","근거2"]
  }},
  "keySentences": {{
    "<criterion_name>": ["문장1","문장2"]
  }}
}}

학생 글:
---
{essay}
---
"""

    model = genai.GenerativeModel(
        MODEL_VERSION,
        generation_config={
            "temperature": 0,
            "top_k": 1,
            "top_p": 0,
            "candidate_count": 1,
            "response_mime_type": "application/json"
        }
    )

    response = model.generate_content(prompt)

    raw_text = response.text.strip()

    if raw_text.startswith("```"):
        raw_text = raw_text.replace("```json", "").replace("```", "").strip()

    parsed = json.loads(raw_text)

    validate(parsed)

    return parsed

def run_ai_grading(essay_text: str, prompt_text: str, criteria: list[str], max_retry: int = 3):

    last_error = None

    for attempt in range(max_retry + 1):

        try:

            parsed = analyze_essay(essay_text, prompt_text)

            return {
                "success": True,
                "scores": parsed.get("scores", {}),
                "rationales": parsed.get("rationales", {}),
                "key_sentences": parsed.get("keySentences", {})
            }

        except Exception as e:

            print(f"AI GRADING ERROR (attempt {attempt+1}):", e)

            last_error = e

            if attempt < max_retry:
                continue

    # 최종 실패 fallback
    fallback = fallback_response(criteria, str(last_error))

    return {
        "success": False,
        "scores": fallback["scores"],
        "rationales": fallback["rationales"],
        "key_sentences": fallback["keySentences"]
    }