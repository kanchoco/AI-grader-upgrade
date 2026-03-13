import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from google.cloud.sql.connector import Connector
import sqlalchemy
import pandas as pd
import uuid
import json
from ai_grader import run_ai_grading
from flask import send_file
import io



# React build 경로
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_BUILD_PATH = os.path.join(BASE_DIR, "dist")

print(BASE_DIR)
print(FRONTEND_BUILD_PATH)
print(os.path.exists(FRONTEND_BUILD_PATH))

# Flask app
app = Flask(
    __name__,
    static_folder=FRONTEND_BUILD_PATH,
    static_url_path=""
)

CORS(app)

# 환경변수 (Cloud Run)
DB_USER = os.environ["DB_USER"]
DB_PASS = os.environ["DB_PASS"]
DB_NAME = os.environ["DB_NAME"]
CONN_NAME = os.environ["CONN_NAME"] 

connector = Connector()

# Cloud SQL 연결
def get_engine():
    def getconn():
        return connector.connect(
            CONN_NAME,
            "pymysql",
            user=DB_USER,
            password=DB_PASS,
            db=DB_NAME
        )

    return sqlalchemy.create_engine(
        "mysql+pymysql://",
        creator=getconn,
        pool_pre_ping=True,
    )

# API 영역
@app.route("/")
def serve():
    return app.send_static_file("index.html")

@app.post("/upload_excel")
def upload_excel():
    if "file" not in request.files:
        return {"status": "error", "message": "No file uploaded"}, 400

    file = request.files["file"]

    project_name = request.form.get("projectName")
    name_column = request.form.get("nameColumn")
    answer_column = request.form.get("answerColumn")
    criteria_raw = request.form.get("criteria")
    rubric = request.form.get("rubric", "")

    if not project_name:
        return {"status": "error", "message": "프로젝트명 누락"}, 400

    if not name_column or not answer_column:
        return {"status": "error", "message": "이름/답변 열 정보 누락"}, 400

    if not criteria_raw:
        return {"status": "error", "message": "criteria 누락"}, 400

    try:
        criteria = json.loads(criteria_raw)
    except:
        return {"status": "error", "message": "criteria JSON 파싱 실패"}, 400

    try:
        df = pd.read_excel(file)

        # ---- 동적 컬럼 검사 ----
        if name_column not in df.columns:
            return {
                "status": "error",
                "message": f"엑셀에 해당 이름 열이 없습니다: {name_column}"
            }, 400

        if answer_column not in df.columns:
            return {
                "status": "error",
                "message": f"엑셀에 해당 답변 열이 없습니다: {answer_column}"
            }, 400

        engine = get_engine()

        with engine.connect() as conn:

            # ---- 프로젝트 생성 ----
            result = conn.execute(
                sqlalchemy.text("""
                    INSERT INTO projectDB
                    (project_name, criteria, prompt_text, created_at)
                    VALUES (:name, :criteria, :prompt_text, NOW())
                """),
                {
                    "name": project_name,
                    "criteria": json.dumps(criteria),
                    "prompt_text": rubric
                }
            )

            project_id = result.lastrowid

            inserted = 0

            for _, row in df.iterrows():
                conn.execute(
                    sqlalchemy.text("""
                        INSERT INTO studentDB
                        (project_id, student_name, student_answer, created_at)
                        VALUES (:pid, :name, :answer, NOW())
                    """),
                    {
                        "pid": project_id,
                        "name": str(row[name_column]).strip(),
                        "answer": str(row[answer_column]).strip()
                    }
                )
                inserted += 1

            conn.commit()

        return {
            "status": "success",
            "message": f"{inserted} students added",
            "project_id": project_id
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500
    
@app.get("/export_project_excel/<project_name>")
def export_project_excel(project_name):

    engine = get_engine()

    with engine.connect() as conn:

        project_id = get_project_id(conn, project_name)

        if not project_id:
            return {"success": False, "message": "project not found"}, 404

        rows = conn.execute(
            sqlalchemy.text("""
                SELECT
                    st.student_name,
                    s.rater_name,
                    s.stage,
                    s.scores,
                    s.created_at,

                    GROUP_CONCAT(
                        CONCAT(a.criterion_name, ': ', a.rationale)
                        SEPARATOR '\n\n'
                    ) AS ai_rationales

                FROM scoreDB s

                JOIN (
                    SELECT
                        student_id,
                        rater_name,
                        stage,
                        project_id,
                        MAX(created_at) AS max_created
                    FROM scoreDB
                    WHERE project_id = :pid
                    GROUP BY
                        student_id,
                        rater_name,
                        stage,
                        project_id
                ) latest
                ON s.student_id = latest.student_id
                AND s.rater_name = latest.rater_name
                AND s.stage = latest.stage
                AND s.project_id = latest.project_id
                AND s.created_at = latest.max_created

                LEFT JOIN studentDB st
                ON s.student_id = st.student_id
                AND s.project_id = st.project_id

                LEFT JOIN ai_feedback_log a
                ON s.student_id = a.student_id
                AND s.project_id = a.project_id
                AND s.stage = 'ai'

                WHERE s.project_id = :pid

                GROUP BY
                    st.student_name,
                    s.rater_name,
                    s.stage,
                    s.scores,
                    s.created_at

                ORDER BY st.student_name
            """),
            {"pid": project_id}
        ).mappings().all()

    if not rows:
        return {"success": False, "message": "no data"}

    df = pd.DataFrame(rows)

    output = io.BytesIO()

    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="scores")

    output.seek(0)

    return send_file(
        output,
        as_attachment=True,
        download_name=f"{project_name}_scores.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

def get_project_id(conn, project_name):
    row = conn.execute(
        sqlalchemy.text("""
            SELECT project_id
            FROM projectDB
            WHERE project_name = :name
        """),
        {"name": project_name}
    ).mappings().fetchone()

    if not row:
        return None

    return row["project_id"]

@app.get("/student/<project_name>/<student_id>")
def get_student(project_name, student_id):

    engine = get_engine()

    with engine.connect() as conn:

        project_id = get_project_id(conn, project_name)

        row = conn.execute(
            sqlalchemy.text("""
                SELECT *
                FROM studentDB
                WHERE student_name = :id
                AND project_id = :project_id
            """),
            {
                "id": student_id,
                "project_id": project_id
            }
        ).mappings().fetchone()

        if not row:
            return {"error": "student not found"}, 404

        return jsonify(dict(row))
    
@app.get("/students/<project_name>/<student_range>")
def get_students_by_range(project_name, student_range):

    try:
        start_id, end_id = student_range.split("-")
        start_id = int(start_id)
        end_id = int(end_id)
    except ValueError:
        return {"error": "invalid range format. use start-end"}, 400

    engine = get_engine()

    with engine.connect() as conn:

        project_id = get_project_id(conn, project_name)

        rows = conn.execute(
            sqlalchemy.text("""
                SELECT *
                FROM studentDB
                WHERE project_id = :project_id
                AND student_name BETWEEN :start AND :end
                ORDER BY student_id
            """),
            {
                "project_id": project_id,
                "start": start_id,
                "end": end_id
            }
        ).mappings().fetchall()

        if not rows:
            return {"error": "no students found"}, 404

        return [dict(row) for row in rows]

@app.post("/ai_grade")
def ai_grade():

    data = request.get_json(silent=True)

    if data is None:
        return {"success": False, "message": "Invalid JSON"}, 400

    student_id = data["student_id"]
    rater_uid = data["rater_uid"]
    rater_name = data["rater_name"]
    project_name = data["project_name"]
    student_answer = data["student_answer"]

    criteria_data = data["criteria"]   # [{name:"logic", expert_score:7}...]

    engine = get_engine()

    with engine.begin() as conn:

        project_id = get_project_id(conn, project_name)

        project = conn.execute(
            sqlalchemy.text("""
                SELECT prompt_text
                FROM projectDB
                WHERE project_id = :pid
            """),
            {"pid": project_id}
        ).mappings().fetchone()

        prompt_text = project["prompt_text"] if project else ""

        criteria_list = [c["name"] for c in criteria_data]
        # AI 채점 실행
        ai_result = run_ai_grading(student_answer, prompt_text, criteria_list)
        print("AI RESULT RAW:", ai_result)
        score_uid = str(uuid.uuid4())

        human_scores = {}

        for c in criteria_data:
            human_scores[c["name"]] = c["expert_score"]

        ai_scores = ai_result["scores"]

        conn.execute(
            sqlalchemy.text("""
                INSERT INTO scoreDB
                (score_id, student_id, rater_uid, rater_name,
                 stage, scores, project_id, created_at)
                VALUES
                (:score_id, :student_id, :rater_id, :rater_name,
                 'human', :scores, :project_id, NOW())
            """),
            {
                "score_id": score_uid,
                "student_id": student_id,
                "rater_id": rater_uid,
                "rater_name": rater_name,
                "scores": json.dumps(human_scores, ensure_ascii=False),
                "project_id": project_id
            }
        )

        conn.execute(
            sqlalchemy.text("""
                INSERT INTO scoreDB
                (score_id, student_id, rater_uid, rater_name,
                 stage, scores, project_id, created_at)
                VALUES
                (:score_id, :student_id, :rater_uid, :rater_name,
                 'ai', :scores, :project_id, NOW())
            """),
            {
                "score_id": score_uid,
                "student_id": student_id,
                "rater_uid": rater_uid,
                "rater_name": rater_name,
                "scores": json.dumps(ai_scores, ensure_ascii=False),
                "project_id": project_id
            }
        )

        ai_scores = ai_result.get("scores", {})
        ai_rationales = ai_result.get("rationales", {})
        ai_keys = ai_result.get("key_sentences", {})
        MODEL_VERSION = "gemini-2.5-flash"
        if not isinstance(ai_scores, dict):
            ai_scores = {}

        for criterion, score in ai_scores.items():

            rationale_list = ai_rationales.get(criterion, [])
            key_sentence_list = ai_keys.get(criterion, [])

            rationale_text = "\n".join(rationale_list)
            key_sentence_text = "\n".join(key_sentence_list)

            conn.execute(
                sqlalchemy.text("""
                    INSERT INTO ai_feedback_log
                    (
                        student_id,
                        criterion_name,
                        score,
                        rationale,
                        key_sentence,
                        model_name,
                        raw_response,
                        created_at,
                        project_id,
                        rater_uid,
                        rater_name
                    )
                    VALUES
                    (
                        :student_id,
                        :criterion_name,
                        :score,
                        :rationale,
                        :key_sentence,
                        :model_name,
                        :raw_response,
                        NOW(),
                        :project_id,
                        :rater_uid,
                        :rater_name
                    )
                """),
                {
                    "student_id": student_id,
                    "criterion_name": criterion,
                    "score": score,
                    "rationale": rationale_text,
                    "key_sentence": key_sentence_text,
                    "model_name": MODEL_VERSION,
                    "raw_response": json.dumps(ai_result, ensure_ascii=False),
                    "project_id": project_id,
                    "rater_uid": rater_uid,
                    "rater_name": rater_name
                }
            )


    return {
        "success": True,
        "score_uid": score_uid,
        "ai_result": ai_result
    }


@app.post("/login")
def login():
    data = request.json
    rater_id = data.get("rater_id")
    password = data.get("password")
    project_name = data.get("project_name")

    COMMON_PASSWORD = os.environ.get("COMMON_PASSWORD", "000000")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "1111")

    # 관리자 로그인 분기
    if password == ADMIN_PASSWORD:
        return {
            "success": True,
            "role": "admin",
            "rater_uid": "admin",
            "rater_name": "admin"
        }

    # 일반 사용자 비밀번호 검사
    if password != COMMON_PASSWORD:
        return {"success": False, "message": "비밀번호 오류"}

    engine = get_engine()
    with engine.connect() as conn:

        # 일반 사용자만 project 검사
        project_id = get_project_id(conn, project_name)

        if not project_id:
            return {"success": False, "message": "project not found"}


        row = conn.execute(
            sqlalchemy.text("""
                SELECT rater_uid, rater_name
                FROM raterDB
                WHERE rater_name = :rid
            """),
            {"rid": rater_id}
        ).mappings().fetchone()

        # project criteria 가져오기
        project_row = conn.execute(
            sqlalchemy.text("""
                SELECT criteria
                FROM projectDB
                WHERE project_id = :pid
            """),
            {"pid": project_id}
        ).mappings().fetchone()

        criteria = project_row["criteria"] if project_row else None

        if row is not None:
            return {
                "success": True,
                "role": "rater",
                "rater_uid": row["rater_uid"],
                "rater_id": row["rater_name"],
                "project_id": project_id,
                "criteria": criteria
            }

        new_uid = conn.execute(
            sqlalchemy.text("SELECT UUID() AS uid")
        ).mappings().fetchone()["uid"]

        conn.execute(
            sqlalchemy.text("""
                INSERT INTO raterDB (rater_uid, rater_name)
                VALUES (:uid, :rid)
            """),
            {"uid": new_uid, "rid": rater_id}
        )
        conn.commit()

        return {
            "success": True,
            "role": "rater",
            "rater_uid": new_uid,
            "rater_id": rater_id,
            "project_id": project_id,
            "criteria": criteria
        }
    
@app.delete("/delete_project/<project_name>")
def delete_project(project_name):

    engine = get_engine()

    with engine.begin() as conn:

        project_id = get_project_id(conn, project_name)

        if not project_id:
            return {"success": False, "message": "project not found"}, 404


        conn.execute(
            sqlalchemy.text("DELETE FROM scoreDB WHERE project_id = :pid"),
            {"pid": project_id}
        )

        conn.execute(
            sqlalchemy.text("DELETE FROM studentDB WHERE project_id = :pid"),
            {"pid": project_id}
        )

    return {
        "success": True,
        "message": f"Project {project_name} 데이터 삭제 완료"
    }


# 프런트엔드 서빙
@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_BUILD_PATH, "index.html")

@app.route("/<path:path>")
def serve_react(path):

    # API 경로는 React로 보내지 않음
    if path.startswith("api") or path.startswith("ai_grade") or path.startswith("student"):
        return {"error": "API route not found"}, 404

    file_path = os.path.join(FRONTEND_BUILD_PATH, path)

    if os.path.exists(file_path):
        return send_from_directory(FRONTEND_BUILD_PATH, path)

    return send_from_directory(FRONTEND_BUILD_PATH, "index.html")