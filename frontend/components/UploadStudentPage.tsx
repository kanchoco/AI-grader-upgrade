import React, { useState } from "react";
import './UploadPage.css';

interface UploadProps {
  apiUrl: string;
  raterId: string;
  onLogout: () => void;
}

const UploadStudentPage: React.FC<UploadProps> = ({ apiUrl, raterId, onLogout }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const [projectName, setProjectName] = useState("");
  const [nameColumn, setNameColumn] = useState("");
  const [answerColumn, setAnswerColumn] = useState("");

  const [criteriaList, setCriteriaList] = useState<string[]>([""]);
  const [rubric, setRubric] = useState("");

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteProjectInput, setDeleteProjectInput] = useState("");

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportProjectInput, setExportProjectInput] = useState("");

  const handleAddCriteriaField = () => {
    setCriteriaList([...criteriaList, ""]);
  };

  const exampleRubric = `[역할]
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

각 항목은 반드시 독립적으로 평가하십시오.`;

  const handleRemoveCriteria = (index: number) => {
  if (criteriaList.length === 1) return; // 최소 1개 유지

  const updated = criteriaList.filter((_, i) => i !== index);
  setCriteriaList(updated);
  };

  const handleCriteriaChange = (index: number, value: string) => {
    const updated = [...criteriaList];
    updated[index] = value;
    setCriteriaList(updated);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setMessage("");
    }
  };

  const handleUpload = async () => {
    const filteredCriteria = criteriaList.filter(c => c.trim() !== "");

    if (!projectName.trim()) {
      setMessage("프로젝트명을 입력해주세요.");
      return;
    }

    if (!file) {
      setMessage("업로드할 엑셀 파일을 선택해주세요.");
      return;
    }

    if (!nameColumn.trim() || !answerColumn.trim()) {
      setMessage("이름 열과 답변 열을 모두 입력해주세요.");
      return;
    }

    if (filteredCriteria.length === 0) {
      setMessage("판단 항목을 하나 이상 입력해주세요.");
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append("projectName", projectName);
    formData.append("file", file);
    formData.append("criteria", JSON.stringify(filteredCriteria));
    formData.append("nameColumn", nameColumn);
    formData.append("answerColumn", answerColumn);
    formData.append("rubric", rubric);

    try {
      const res = await fetch(`${apiUrl}/upload_excel`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.status === "success") {
        setMessage("업로드 성공!");
      } else {
        setMessage(`오류 발생: ${data.message}`);
      }
    } catch {
      setMessage("서버 요청 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProject = async () => {

    if (!deleteProjectInput.trim()) {
      setMessage("삭제할 프로젝트 이름을 입력하세요.");
      return;
    }

    if (deleteProjectInput !== projectName) {
      setMessage("프로젝트 이름이 일치하지 않습니다.");
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/delete_project/${deleteProjectInput}`, {
        method: "DELETE"
      });

      const data = await res.json();

      if (data.success) {
        setMessage("프로젝트 데이터가 삭제되었습니다.");
        setDeleteModalOpen(false);
        setDeleteProjectInput("");
      } else {
        setMessage(data.message || "삭제 실패");
      }

    } catch {
      setMessage("삭제 중 서버 오류 발생");
    }
  };

  const handleExportProject = async () => {

    if (!exportProjectInput.trim()) {
      setMessage("내보낼 프로젝트 이름을 입력하세요.");
      return;
    }

    if (exportProjectInput.trim() !== projectName.trim()) {
      setMessage("프로젝트 이름이 일치하지 않습니다.");
      return;
    }

    try {
      const res = await fetch(
        `${apiUrl}/export_db?projectName=${exportProjectInput}`
      );

      if (!res.ok) {
        setMessage("엑셀 다운로드 실패");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportProjectInput}_grading_results.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setExportModalOpen(false);
      setExportProjectInput("");

    } catch {
      setMessage("엑셀 다운로드 중 오류 발생");
    }
  };

  return (
    <>
      <div className="grading-container">

        <header className="top-header">
          <div className="logo">AI Essay Grader</div>
          <div className="rater-info">
            <p className="rater-name">{raterId}님 환영합니다</p>
            <button className="logout-btn" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        <main className="main-content">
          <div style={{ maxWidth: "900px", margin: "60px auto" }}>

            {/* 학생 데이터 업로드 */}
            <div className="card">
              <h2>학생 데이터 업로드</h2>

              <input
                className="input-field"
                placeholder="프로젝트명 입력 (예: 2025_midterm)"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />

              <input
                className="input-field"
                placeholder="학생 이름 열 텍스트 (예: 이름)"
                value={nameColumn}
                onChange={(e) => setNameColumn(e.target.value)}
              />

              <input
                className="input-field"
                placeholder="학생 답변 열 텍스트 (예: 답변)"
                value={answerColumn}
                onChange={(e) => setAnswerColumn(e.target.value)}
              />

              <div style={{ marginTop: "20px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px"
                  }}
                >
                  <h3 style={{ margin: 0 }}>판단 항목 설정</h3>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAddCriteriaField}
                  >
                    + 항목 추가
                  </button>
                </div>

                {criteriaList.map((c, index) => (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignItems: "center",
                      marginBottom: "10px"
                    }}
                  >
                    <input
                      className="input-field"
                      style={{ flex: 1 }}
                      placeholder="예시: 수과학적 지식"
                      value={c}
                      onChange={(e) =>
                        handleCriteriaChange(index, e.target.value)
                      }
                    />

                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => handleRemoveCriteria(index)}
                      disabled={criteriaList.length === 1}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "20px" }}>
                <h3>예시 채점 기준안</h3>

                <div
                  style={{
                    background: "#f5f5f5",
                    padding: "15px",
                    borderRadius: "8px",
                    whiteSpace: "pre-line",
                    fontSize: "14px"
                  }}
                >
                  {exampleRubric}
                </div>
              </div>

              <div style={{ marginTop: "20px" }}>
                <h3>채점 기준안 입력</h3>

                <textarea
                  className="input-field"
                  style={{
                    width: "100%",
                    minHeight: "150px",
                    resize: "vertical"
                  }}
                  placeholder="채점 기준안을 입력하세요"
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                />
              </div>

              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                style={{ marginTop: "20px" }}
              />

              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading}
                style={{ marginTop: "15px" }}
              >
                {uploading ? "업로드 중..." : "엑셀 업로드"}
              </button>

              {message && (
                <p style={{ marginTop: "15px" }}>{message}</p>
              )}
            </div>

            {/* 관리자 DB 관리 */}
            <div className="card">
              <h3>관리자 DB 관리</h3>

              <div className="button-group">
                <button
                  className="btn btn-danger"
                  onClick={() =>   {
                    setDeleteModalOpen(true)}}
                >
                  프로젝트 데이터 지우기
                </button>

                <button
                  className="btn btn-success"
                  onClick={() => {
                    setExportModalOpen(true)}}
                >
                  DB 데이터 내보내기 (Excel)
                </button>
              </div>
            </div>

          </div>
        </main>

      </div>

      {/* 삭제 modal */}
      {deleteModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">

            <h3>프로젝트 삭제</h3>

            <p>
              삭제하려면 아래에 <b>{projectName}</b> 을(를) 정확히 입력하세요
            </p>

            <input
              className="input-field"
              value={deleteProjectInput}
              onChange={(e) => setDeleteProjectInput(e.target.value)}
              placeholder={`프로젝트 이름: ${projectName}`}
            />

            <div className="modal-buttons">

              <button
                className="btn btn-danger"
                onClick={handleDeleteProject}
                disabled={!deleteProjectInput || deleteProjectInput.trim() !== projectName.trim()}
              >
                삭제
              </button>

              <button
                className="btn"
                onClick={() => {setDeleteModalOpen(false);
                setDeleteProjectInput("");
                }}
              >
                취소
              </button>

            </div>

          </div>
        </div>
      )}

      {/* export modal */}
      {exportModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">

            <h3>데이터 내보내기</h3>

            <p>
              내보내려면 아래에 <b>{projectName}</b> 을(를) 정확히 입력하세요
            </p>

            <input
              className="input-field"
              value={exportProjectInput}
              onChange={(e) => setExportProjectInput(e.target.value)}
              placeholder={`프로젝트 이름: ${projectName}`}
            />

            <div className="modal-buttons">

              <button
                className="btn btn-success"
                onClick={handleExportProject}
                disabled={!deleteProjectInput || deleteProjectInput.trim() !== projectName.trim()}
              >
                내보내기
              </button>

              <button
                className="btn"
                onClick={() => {setExportModalOpen(false);
                setExportProjectInput("");
                }}
              >
                취소
              </button>

            </div>

          </div>
        </div>
      )}
    </>
  );
};

export default UploadStudentPage;