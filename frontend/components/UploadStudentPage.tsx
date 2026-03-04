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

  const handleAddCriteriaField = () => {
    setCriteriaList([...criteriaList, ""]);
  };

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

  const handleCreateNewDB = async () => {
    if (!projectName.trim()) {
      setMessage("프로젝트명을 입력해주세요.");
      return;
    }

    if (!window.confirm("해당 프로젝트의 DB를 초기화하시겠습니까?")) {
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/admin/reset_db`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName }),
      });

      const data = await res.json();

      if (data.status === "success") {
        setMessage("DB가 새로 생성되었습니다.");
      } else {
        setMessage("DB 생성 실패: " + data.message);
      }
    } catch {
      setMessage("DB 생성 중 오류 발생");
    }
  };

  const handleExportDB = async () => {
    if (!projectName.trim()) {
      setMessage("프로젝트명을 입력해주세요.");
      return;
    }

    try {
      const res = await fetch(
        `${apiUrl}/export_db?projectName=${projectName}`
      );

      if (!res.ok) {
        setMessage("엑셀 다운로드 실패");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}_grading_results.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setMessage("엑셀 다운로드 중 오류 발생");
    }
  };

  return (
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

          <div className="card">
            <h3>관리자 DB 관리</h3>

            <div className="button-group">
              <button
                className="btn btn-danger"
                onClick={handleCreateNewDB}
              >
                DB 새로 만들기
              </button>

              <button
                className="btn btn-success"
                onClick={handleExportDB}
              >
                DB 데이터 내보내기 (Excel)
              </button>
            </div>
          </div>

        </div>
      </main>

    </div>  

  );

};

export default UploadStudentPage;
