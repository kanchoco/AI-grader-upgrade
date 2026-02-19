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

@app.post("/upload_excel")
def upload_excel():
    if "file" not in request.files:
        return {"status": "error", "message": "No file uploaded"}, 400

    file = request.files["file"]

    project_name = request.form.get("projectName")
    name_column = request.form.get("nameColumn")
    answer_column = request.form.get("answerColumn")
    criteria_raw = request.form.get("criteria")

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
                    (project_name, criteria, created_at)
                    VALUES (:name, :criteria, NOW())
                """),
                {
                    "name": project_name,
                    "criteria": json.dumps(criteria)
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
    
@app.get("/export_db")
def export_db():
    project_name = request.args.get("projectName")

    if not project_name:
        return {"status": "error", "message": "projectName 누락"}, 400

    try:
        engine = get_engine()

        with engine.connect() as conn:

            # ---- project_id 조회 ----
            project = conn.execute(
                sqlalchemy.text("""
                    SELECT project_id
                    FROM projectDB
                    WHERE project_name = :name
                """),
                {"name": project_name}
            ).mappings().fetchone()

            if not project:
                return {"status": "error", "message": "프로젝트 없음"}, 404

            project_id = project["project_id"]

            # ---- 학생 + 점수 JOIN ----
            rows = conn.execute(
                sqlalchemy.text("""
                    SELECT 
                        s.student_id,
                        s.student_name,
                        s.student_answer,

                        MAX(CASE WHEN sc.stage='human' THEN sc.scores END) AS human_scores,
                        MAX(CASE WHEN sc.stage='ai' THEN sc.scores END) AS ai_scores,
                        MAX(CASE WHEN sc.stage='final' THEN sc.scores END) AS final_scores

                    FROM studentDB s
                    LEFT JOIN scoreDB sc
                        ON s.student_id = sc.student_id

                    WHERE s.project_id = :pid
                    GROUP BY s.student_id
                """),
                {"pid": project_id}
            ).mappings().all()

        if not rows:
            return {"status": "error", "message": "학생 데이터 없음"}, 404

        df = pd.DataFrame(rows)

        # JSON 컬럼 문자열 변환
        for col in ["human_scores", "ai_scores", "final_scores"]:
            if col in df.columns:
                df[col] = df[col].apply(
                    lambda x: json.dumps(x, ensure_ascii=False)
                    if isinstance(x, dict)
                    else x
                )

        # ---- 메모리 Excel 생성 ----
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
            df.to_excel(writer, index=False, sheet_name="Results")

        output.seek(0)

        return send_file(
            output,
            as_attachment=True,
            download_name=f"{project_name}_grading_results.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


@app.get("/student/<student_id>")
def get_student(student_id):
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            sqlalchemy.text("SELECT * FROM studentDB WHERE student_id = :id"),
            {"id": student_id}
        ).mappings().fetchone()

        if not row:
            return {"error": "student not found"}, 404

        return jsonify(dict(row)) 

@app.get("/students/<student_range>")
def get_students_by_range(student_range):
    try:
        start_id, end_id = student_range.split("-")
        start_id = int(start_id)
        end_id = int(end_id)
    except ValueError:
        return {"error": "invalid range format. use start-end"}, 400

    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sqlalchemy.text("""
                SELECT *
                FROM studentDB
                WHERE student_id BETWEEN :start AND :end
                ORDER BY student_id
            """),
            {"start": start_id, "end": end_id}
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
    expert_knw = data["expert_knw_score"]
    expert_crt = data["expert_crt_score"]

    engine = get_engine()

    with engine.connect() as conn:
        student = conn.execute(
            sqlalchemy.text("""
                SELECT student_uid, student_answer
                FROM studentDB
                WHERE student_id = :id
            """),
            {"id": student_id}
        ).mappings().fetchone()

        if not student:
            return {"success": False, "message": "student not found"}, 404

        student_uid = student["student_uid"]
        essay = student["student_answer"]

        # AI 채점
        ai_result = run_ai_grading(essay)
        score_uid = str(uuid.uuid4())

        # AI 점수 저장
        conn.execute(
            sqlalchemy.text("""
                INSERT INTO ai_scoreDB
                (score_uid, student_uid, rater_uid,
                 knw_score, crt_score,
                 knw_text, crt_text)
                VALUES
                (:uid, :student_uid, :rater_uid,
                 :knw, :crt,
                 :knw_text, :crt_text)
            """),
            {
                "uid": score_uid,
                "student_uid": student_uid,
                "rater_uid": rater_uid,
                "knw": ai_result["scores"]["scientific"],
                "crt": ai_result["scores"]["critical"],
                "knw_text": "\n".join(ai_result["rationales"]["scientific"]),
                "crt_text": "\n".join(ai_result["rationales"]["critical"]),
            }
        )

        # 전문가 점수 저장
        conn.execute(
            sqlalchemy.text("""
                INSERT INTO rater_scoreDB
                (score_uid, student_uid, rater_uid,
                 knw_score, crt_score)
                VALUES
                (:uid, :student_uid, :rater_uid,
                 :knw, :crt)
            """),
            {
                "uid": score_uid,
                "student_uid": student_uid,
                "rater_uid": rater_uid,
                "knw": expert_knw,
                "crt": expert_crt,
            }
        )

        conn.commit()

    return {
        "success": True,
        "score_uid": score_uid,
        "ai_result": ai_result
    }


@app.post("/add_final_score")
def add_final_score():
    data = request.json
    engine = get_engine()

    with engine.connect() as conn:
        conn.execute(
            sqlalchemy.text("""
                INSERT INTO final_scoreDB
                (score_uid, student_uid, rater_uid,
                 knw_score, crt_score)
                VALUES
                (:score_uid, :student_uid, :rater_uid,
                 :knw_score, :crt_score)
            """),
            data
        )
        conn.commit()

    return {"status": "ok"}

@app.post("/login")
def login():
    data = request.json
    rater_id = data.get("rater_id")
    password = data.get("password")

    COMMON_PASSWORD = os.environ.get("COMMON_PASSWORD", "000000")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "1111")

    # 관리자 로그인 분기
    if password == ADMIN_PASSWORD:
        return {
            "success": True,
            "role": "admin",
            "rater_uid": "admin",
            "rater_id": "admin"
        }

    # 일반 사용자 비밀번호 검사
    if password != COMMON_PASSWORD:
        return {"success": False, "message": "비밀번호 오류"}

    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            sqlalchemy.text("""
                SELECT rater_uid, rater_id
                FROM raterDB
                WHERE rater_id = :rid
            """),
            {"rid": rater_id}
        ).mappings().fetchone()

        if row is not None:
            return {
                "success": True,
                "role": "rater",
                "rater_uid": row["rater_uid"],
                "rater_id": row["rater_id"]
            }

        new_uid = conn.execute(
            sqlalchemy.text("SELECT UUID() AS uid")
        ).mappings().fetchone()["uid"]

        conn.execute(
            sqlalchemy.text("""
                INSERT INTO raterDB (rater_uid, rater_id)
                VALUES (:uid, :rid)
            """),
            {"uid": new_uid, "rid": rater_id}
        )
        conn.commit()

        return {
            "success": True,
            "role": "rater",
            "rater_uid": new_uid,
            "rater_id": rater_id
        }


# 프런트엔드 서빙
@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_BUILD_PATH, "index.html")

@app.route("/<path:path>")
def serve_react(path):
    file_path = os.path.join(FRONTEND_BUILD_PATH, path)
    if os.path.exists(file_path):
        return send_from_directory(FRONTEND_BUILD_PATH, path)
    return send_from_directory(FRONTEND_BUILD_PATH, "index.html")