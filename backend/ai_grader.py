import os
import json
import hashlib
from typing import Dict, Any
import google.generativeai as genai
import re

genai.configure(api_key=os.environ["GEMINI_API_KEY"])

MODEL_VERSION = "gemini-2.5-flash"
model = genai.GenerativeModel(
    MODEL_VERSION,
    generation_config={
        "temperature": 0,
        "top_k": 1,
        "top_p": 1,
        "candidate_count": 1,
        "max_output_tokens": 512
    }
)
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



def validate(parsed: dict, criteria: list[str]):

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

    # criteria 기준으로 처리
    for criterion in criteria:

        score = scores.get(criterion, 0)

        score = normalize_score(score)
        parsed_scores[criterion] = score

        r = rationales.get(criterion, [])
        ks = key_sentences.get(criterion, [])

        if not isinstance(r, list):
            r = []

        if not isinstance(ks, list):
            ks = []

        while len(r) < 2:
            r.append("근거 부족함")

        while len(ks) < 2:
            ks.append("관련 문장 부족")

        min_len = min(len(r), len(ks))

        parsed_rationales[criterion] = r[:min_len]
        parsed_key_sentences[criterion] = ks[:min_len]

    parsed["scores"] = parsed_scores
    parsed["rationales"] = parsed_rationales
    parsed["keySentences"] = parsed_key_sentences

    return parsed


def fallback_response(criteria: list[str], ai_result: dict | None = None, reason: str = "모델 응답 오류"):

    scores = {}
    rationales = {}
    key_sentences = {}

    ai_scores = ai_result.get("scores", {}) if ai_result else {}
    ai_rationales = ai_result.get("rationales", {}) if ai_result else {}
    ai_keys = ai_result.get("keySentences", {}) if ai_result else {}

    ai_keys_list = list(ai_scores.keys())

    for i, c in enumerate(criteria):

        if i < len(ai_keys_list):

            k = ai_keys_list[i]

            scores[c] = ai_scores.get(k, 0)

            rationales[c] = ai_rationales.get(
                k,
                [f"{reason}로 기본 점수 적용함"]
            )

            key_sentences[c] = ai_keys.get(
                k,
                ["원문 분석 실패"]
            )

        else:

            scores[c] = 0

            rationales[c] = [
                f"{reason}로 기본 점수 적용함",
                "형식 오류로 최소 점수 처리함"
            ]

            key_sentences[c] = ["원문 분석 실패"]

    return {
        "scores": scores,
        "rationales": rationales,
        "keySentences": key_sentences
    }


def analyze_essay_raw(essay: str, prompt_text: str) -> dict:

    prompt = (
        prompt_text
        + """

You are an automated essay grading system.

Return STRICT JSON only.

Rules:
- Output must be valid JSON
- Do NOT include explanations
- Do NOT include markdown
- Use double quotes for all keys
- The keys in scores, rationales, and keySentences must EXACTLY match the rubric criterion names
- keySentences must be exact quotes from the student essay
- rationales must end with "~함"

JSON schema:

{
  "scores": {
    "<criterion_name>": integer (1-10)
  },
  "rationales": {
    "<criterion_name>": ["근거1","근거2"]
  },
  "keySentences": {
    "<criterion_name>": ["문장1","문장2"]
  }
}

Student Essay:
---
"""
        + essay
        + """
---
"""
    )

    response = model.generate_content(prompt)
    raw_text = (response.text or "").strip()

    if not raw_text:
        raise ValueError("AI 응답 없음")

    if raw_text.startswith("```"):
        raw_text = raw_text.replace("```json", "").replace("```", "").strip()

    try:
        parsed = json.loads(raw_text)
    except Exception:
        raise ValueError("JSON 파싱 실패")

    if not isinstance(parsed, dict):
        raise ValueError("JSON 구조 오류")

    return parsed

def run_ai_grading(essay_text: str, prompt_text: str, criteria: list[str], max_retry: int = 3):

    last_error = None
    parsed = None

    for attempt in range(max_retry + 1):

        try:

            parsed = analyze_essay_raw(essay_text, prompt_text)

            scores = parsed.get("scores", {})
            rationales = parsed.get("rationales", {})
            key_sentences = parsed.get("keySentences", {})

            if not isinstance(scores, dict):
                raise ValueError("scores 형식 오류")

            if set(scores.keys()) != set(criteria):
                raise ValueError("criterion mismatch")

            parsed = validate(parsed, criteria)

            return {
                "success": True,
                "scores": parsed["scores"],
                "rationales": parsed["rationales"],
                "key_sentences": parsed["keySentences"]
            }

        except Exception as e:

            print(f"AI GRADING ERROR (attempt {attempt+1}):", e)

            last_error = e

            if attempt < max_retry:
                continue

    fallback = fallback_response(criteria, parsed, str(last_error))

    return {
        "success": False,
        "scores": fallback["scores"],
        "rationales": fallback["rationales"],
        "key_sentences": fallback["keySentences"]
    }