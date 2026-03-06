import React, { useState } from 'react';
import './Grading.css';

// [정규식 생성기] 공백, 줄바꿈, 특수문자 처리를 위한 유연한 패턴 생성
const createFlexiblePattern = (text: string) => {
  // 1. 특수문자 이스케이프 (., ?, * 등)
  let escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 2. 모든 공백(스페이스, 탭, 줄바꿈)을 정규식의 \s+(공백 하나 이상)로 변환
  return escaped.replace(/\s+/g, '\\s+');
};

// 비교용 정규화: 공백뿐만 아니라 마침표(.)와 특수문자도 떼고 글자만 비교
const normalize = (text: string) => text.replace(/[\s,.?!]+/g, '').trim();

interface GradingProps {
  apiUrl: string;
  raterId: string;
  raterUid: string;
  projectName: string;
  criteria: string[];
  onLogout: () => void;
}

// [컴포넌트] 답안 하이라이터
interface HighlighterProps {
  text: string;
  sciSentences?: string[];
  crtSentences?: string[];
}

const AnswerHighlighter: React.FC<HighlighterProps> = ({
  text,
  sciSentences = [],
  crtSentences = []
}) => {
  if (!text) return null;
  
  // 데이터가 없으면 원본 리턴
  if (sciSentences.length === 0 && crtSentences.length === 0) {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
  }

  const processSentences = (sentences: string[], type: string) => {
    return sentences.flatMap(sentence => 
      sentence
        // 슬래시(/) 또는 " 공백+숫자+점( 1., 2.)" 패턴 앞에서 자르기
        .split(/\/|(?=\s\d+\.)/) 
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => ({ text: s, type }))
    );
  };

  const targets = [
    ...processSentences(sciSentences, 'sci'),
    ...processSentences(crtSentences, 'crt')
  ];

  if (targets.length === 0) return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;

  // 2. 긴 문장부터 찾도록 정렬 (정확도 향상)
  targets.sort((a, b) => b.text.length - a.text.length);

  // 3. 정규식 패턴 생성 (공백이 달라도 찾을 수 있게 flexiblePattern 사용)
  const patternString = `(${targets.map(t => createFlexiblePattern(t.text)).join('|')})`;
  const pattern = new RegExp(patternString, 'g');

  // 4. 텍스트 쪼개기
  const parts = text.split(pattern);

  return (
    <span style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
      {parts.map((part, index) => {
        // 쪼개진 조각(part)이 어떤 타겟과 일치하는지 확인
        const matchedTarget = targets.find(t => normalize(t.text) === normalize(part));

        if (matchedTarget?.type === 'sci') {
          return (
            <span key={index} style={{ backgroundColor: '#B4C6E7'}}>
              {part}
            </span>
          );
        } else if (matchedTarget?.type === 'crt') {
          return (
            <span key={index} style={{ backgroundColor: '#FFE699' }}>
              {part}
            </span>
          );
        } else {
          return <span key={index}>{part}</span>;
        }
      })}
    </span>
  );
};

const GradingScreen: React.FC<GradingProps> = ({
  apiUrl,
  raterId,
  raterUid,
  projectName,
  criteria,
  onLogout,
}) => {
  // ui 상태
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);       // AI 패널 열림 여부
  const [isLoading, setIsLoading] = useState(false);               // 로딩 스피너
  const [isScoreLocked, setIsScoreLocked] = useState(false);       // 점수 잠금 (수정 방지)
  const [isConfirmed, setIsConfirmed] = useState(false);           // 최종 확정 여부

  const [searchText, setSearchText] = useState('');
  const [isGradingStarted, setIsGradingStarted] = useState(false);

  // 학생 정보
  const [studentUid, setStudentUid] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentAnswer, setStudentAnswer] = useState('');
  const [studentList, setStudentList] = useState<any[]>([]);

  // 전문가 점수
  const [expertScores, setExpertScores] = useState<{ [key: string]: string }>({});
  
  // 채점 근거(전문가 채점)
  const [expertRationale, setExpertRationale] = useState('');

  // AI 결과
  type AIResult = {
    scores: Record<string, number>;
    rationales: Record<string, string[]>;
    key_sentences?: Record<string, string[]>;
  };

  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [scoreUid, setScoreUid] = useState('');
  const [aiError, setAiError] = useState(false);

  // 학생 조회 (student_id 기준)
  const handleSearch = async () => {
    const input = searchText.trim();

    if (!input) {
      alert('학생 ID를 입력해주세요');
      return;
    }
  const isRange = input.includes('-');

  const url = isRange
    ? `${apiUrl}/students/${projectName}/${input}`
    : `${apiUrl}/student/${projectName}/${input}`;
    
    try {
      const res = await fetch(url);

      if (!res.ok) {
        alert('학생을 찾을 수 없습니다');
        return;
      }

      const data = await res.json();

      if (isRange) {
      // 범위 조회: 여러 명
      if (!Array.isArray(data) || data.length === 0) {
        alert('조회된 학생이 없습니다');
        return;
      }

      // 학생 리스트 저장
      setStudentList(data);

      // 첫 학생을 기본 선택으로 세팅
      const firstStudent = data[0];
      setStudentUid(firstStudent.student_uid);
      setStudentId(firstStudent.student_id);
      setStudentAnswer(firstStudent.student_answer);

} else {     
      setStudentList([]);  
      setStudentUid(data.student_uid);
      setStudentId(data.student_id);
      setStudentAnswer(data.student_answer);
    }
      // 상태 초기화 (새 학생 검색 시)
      setExpertScores({});
      setExpertRationale(''); // 새 학생 검색 시 채점 근거 초기화
      setAiResult(null);
      setIsAiPanelOpen(false);
      setIsScoreLocked(false); //잠금 해제
      setIsConfirmed(false); //확정 해제
      // UI: 작업 공간 표시
      setIsGradingStarted(true);
      setAiError(false);
      setScoreUid("");
      setExpertScores({});  
    } catch (err) {
      alert('서버 오류가 발생했습니다.');
    }
  };

  // AI 채점 (전문가 + AI)
  const handleAiGrade = async () => {

    for (const c of criteria) {
      if (!expertScores[c]) {
        alert("모든 전문가 점수를 입력하세요");
        return;
      }
    }

    setIsLoading(true);
    setIsAiPanelOpen(true);
    setIsScoreLocked(true);
    setAiError(false);   // 재시도 시 에러 초기화

    try {
      const res = await fetch(`${apiUrl}/ai_grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_uid: studentUid,
          student_id: studentId,
          rater_uid: raterUid,
          rater_name: raterId,
          project_name: projectName,

          criteria: criteria.map((c) => ({
            name: c,
            expert_score: Number(expertScores[c])
          })),

          expert_rationale: expertRationale
        })
      });

      if (!res.ok) {
        throw new Error("AI 서버 오류");
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error("AI 채점 실패");
      }

      setAiResult(data.ai_result);
      setScoreUid(data.score_uid);

    } catch (err) {
      alert("AI 채점 실패. 다시 시도해주세요.");
      setAiError(true);         // 실패 상태
      setIsScoreLocked(false);  // 점수 수정 가능
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalSave = async () => {
    if (!aiResult?.scores) {
      alert("AI 결과가 없습니다.");
      return;
    }
    
    if (!window.confirm(`Student #${studentId} 점수를 최종 확정하시겠습니까? (확정 후 수정 불가)`)) {
        return;
    }

    try {
      const res = await fetch(`${apiUrl}/add_final_score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score_uid: scoreUid,
          student_uid: studentUid,
          rater_uid: raterUid,
          rater_name: raterId,
          criteria: criteria.map((c) => ({
            name: c,
            ai_score: aiResult?.scores?.[c]
          }))
        }),
      });

      const data = await res.json();

      if (data.status === 'ok') {
        setIsConfirmed(true); // [UI] 모든 버튼 비활성화 (확정 상태)
        alert('점수가 최종 확정되었습니다');
      } else {
        alert('확정 실패');
      }
    } catch (err) {
      alert('서버 오류');
    }
  };

  const handleEditScore = () => {
    if(isConfirmed) return; // 이미 확정됐으면 수정 불가
    setIsScoreLocked(false); // 잠금 해제 -> 다시 입력 가능
  };

  // 분석 완료 여부 (AI 데이터가 있고 로딩이 끝남)
  const isAnalysisComplete = isAiPanelOpen && !isLoading && aiResult;

  return (
    <div className="grading-container">

      <header className="top-header">
        <div className="logo">AI Essay Grader</div>

        <div className="rater-info">
          <p className="rater-name">{raterId}님 환영합니다</p>
          <p className="project-name">Project: {projectName}</p>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>


      <main className="main-content">

        {/* 검색창 */}
        <div className="search-section">
          <div className="search-bar-wrapper">

            <i className="fa-solid fa-magnifying-glass search-icon"></i>

            <input
              type="text"
              placeholder="학생 ID를 입력하세요 ( ex. 10101, 10101-10105 )"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />

            <button className="search-btn" onClick={handleSearch}>
              Search
            </button>

          </div>
        </div>


        {!isGradingStarted ? (

          <div className="empty-state-container">
            <p className="empty-text">
              채점 대상 입력 시 이곳에 해당 학생의 답안과 채점 란이 나타납니다.
            </p>
          </div>

        ) : (

          <div className="grading-list">

            <div className="grading-row fade-in">

              <div className="row-header desktop-only">
                <h2>Student #{studentId} 답안</h2>
                <h2>전문가 채점</h2>
                <div className="header-placeholder">
                  {isAiPanelOpen && <h2>AI 채점</h2>}
                </div>
              </div>


              {studentList.length > 0 && (
                <div className="range-info">
                  총 {studentList.length}명 조회됨
                </div>
              )}


              <div className="row-body">

                {/* 학생 답안 */}
                <div className="column student-column">

                  <h3 className="mobile-title">
                    Student #{studentId} 답안
                  </h3>

                  <div className="student-card">

                    <p className="answer-text">
                      <AnswerHighlighter
                        text={studentAnswer}
                        sciSentences={aiResult?.key_sentences?.scientific || []}
                        crtSentences={aiResult?.key_sentences?.critical || []}
                      />
                    </p>

                  </div>

                </div>


                {/* 전문가 채점 */}
                <div className="column expert-column">

                  <h3 className="mobile-title">전문가 채점</h3>

                  <div className="grading-form-container">

                    {(criteria || []).map((criterion) => (

                      <div key={criterion} className="score-row">

                        <span className="score-label">
                          {criterion}
                        </span>

                        <input
                          type="number"
                          className="score-input"
                          value={expertScores?.[criterion] || ""}
                          min="1"
                          max="10"
                          onChange={(e) => {

                            const val = e.target.value;

                            if (
                              val === "" ||
                              (Number(val) >= 1 && Number(val) <= 10)
                            ) {

                              setExpertScores(prev => ({
                                ...prev,
                                [criterion]: val
                              }));

                            }

                          }}
                          disabled={isScoreLocked || isConfirmed}
                        />

                      </div>

                    ))}


                    <textarea
                      className="reason-box"
                      placeholder="채점 근거(선택):"
                      value={expertRationale}
                      onChange={(e) => setExpertRationale(e.target.value)}
                      disabled={isScoreLocked || isConfirmed}
                    />


                    <div className="button-stack">

                      <button
                        className="btn-ai-check"
                        onClick={handleAiGrade}
                        disabled={isLoading || isConfirmed}
                      >
                        {aiError ? "AI 채점 재시도" : "AI 채점 결과 확인"}
                      </button>


                      <div className="btn-row">

                        <button
                          className="btn-edit"
                          onClick={handleEditScore}
                          disabled={!isAnalysisComplete || isConfirmed}
                        >
                          점수 수정
                        </button>

                        <button
                          className="btn-save"
                          onClick={handleFinalSave}
                          disabled={!isAnalysisComplete || isConfirmed}
                        >
                          점수 확정
                        </button>

                      </div>

                    </div>

                  </div>

                </div>


                {/* AI 채점 */}
                <div className="column ai-column">

                  {isAiPanelOpen ? (

                    <>
                      <h3 className="mobile-title">AI 채점</h3>

                      {isLoading ? (

                        <div className="spinner-container">
                          <div className="loading-spinner"></div>
                          <span className="loading-text">
                            AI가 답안을 채점 중...
                          </span>
                        </div>

                      ) : (

                        <div className="ai-result-content fade-in">

                          {(criteria || []).map((criterion) => (

                            <div key={criterion} className="score-row">

                              <span className="score-label">
                                {criterion}
                              </span>

                              <div className="score-display">
                                {aiResult?.scores?.[criterion] ?? "-"}
                              </div>

                            </div>

                          ))}


                          {(criteria || []).map((criterion) => (

                            <div key={criterion} className="feedback-section">

                              <h4 className="feedback-label">
                                [{criterion}]
                              </h4>

                              <ul className="feedback-list">

                                {(aiResult?.rationales?.[criterion] ?? []).length > 0
                                  ? (aiResult?.rationales?.[criterion] ?? []).map((r, i) => (
                                      <li key={i}>{r}</li>
                                    ))
                                  : <li>근거 없음</li>
                                }

                              </ul>

                            </div>

                          ))}

                        </div>

                      )}

                    </>

                  ) : (

                    <div className="empty-placeholder"></div>

                  )}

                </div>

              </div>

            </div>

          </div>

        )}

      </main>

    </div>
  );
};

export default GradingScreen;
