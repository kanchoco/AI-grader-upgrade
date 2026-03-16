import React, { useState, useMemo } from 'react';
import './Grading.css';

// ----------------------------------------------------------------------
// [1] 헬퍼 함수들
// ----------------------------------------------------------------------
const createFlexiblePattern = (text: string) => {
  let escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(/\s+/g, '\\s+');
};

const normalize = (text: string) => text.replace(/[\s,.?!]+/g, '').trim();

// 색상 팔레트 (항목이 늘어날 경우 순환해서 적용됨)
const HIGHLIGHT_COLORS = ['#B4C6E7', '#FFE699', '#D5E8D4', '#F8CECC']; // 파랑, 노랑, 초록, 분홍

// ----------------------------------------------------------------------
// [2] 동적 답안 하이라이터 컴포넌트
// ----------------------------------------------------------------------
interface HighlighterProps {
  text: string;
  highlights: { text: string; color: string }[];
}

const AnswerHighlighter: React.FC<HighlighterProps> = ({ text, highlights = [] }) => {
  if (!text) return null;
  if (highlights.length === 0) return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;

  // 긴 문장부터 찾도록 정렬
  const targets = [...highlights].sort((a, b) => b.text.length - a.text.length);
  const patternString = `(${targets.map(t => createFlexiblePattern(t.text)).join('|')})`;
  const pattern = new RegExp(patternString, 'g');
  const parts = text.split(pattern);

  return (
    <span style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
      {parts.map((part, index) => {
        const matchedTarget = targets.find(t => normalize(t.text) === normalize(part));
        if (matchedTarget) {
          return (
            <span key={index} style={{ backgroundColor: matchedTarget.color }}>
              {part}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};

// ----------------------------------------------------------------------
// [3] GradingRow 컴포넌트 (학생 1명분의 채점판)
// ----------------------------------------------------------------------
interface GradingRowProps {
  student: any;       
  apiUrl: string;
  raterUid: string;
  raterId: string;
  projectName: string;
  criteria: string[];
  isLast: boolean;
}

const GradingRow: React.FC<GradingRowProps> = ({ 
  student, apiUrl, raterUid, raterId, projectName, criteria, isLast 
}) => {
  const [expertScores, setExpertScores] = useState<{ [key: string]: string }>({});
  
  type AIResult = {
    scores: Record<string, number>;
    rationales: Record<string, string[]>;
    key_sentences?: Record<string, string[]>;
  };
  
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [scoreUid, setScoreUid] = useState('');
  
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isScoreLocked, setIsScoreLocked] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [aiError, setAiError] = useState(false);

  //항목 개수에 비례하는 동적 높이 계산 
  // 기본 버튼/여백 높이(150) + (항목 개수 * 항목당 높이 75)
  const calculatedHeight = Math.max(280, 150 + (criteria.length * 75));
  const CARD_HEIGHT = `${calculatedHeight}px`;

  // AI 채점 실행
  const handleAiGrade = async () => {
    // 모든 항목이 입력되었는지 검사
    for (const c of criteria) {
      if (!expertScores[c]) {
        alert(`[Student #${student.student_id}] 모든 판단 항목의 점수를 입력하세요.`);
        return;
      }
      const val = Number(expertScores[c]);
      if (val < 1 || val > 10) {
        alert(`[Student #${student.student_id}] 점수는 1~10점 사이여야 합니다.`);
        return;
      }
    }

    setIsLoading(true);
    setIsAiPanelOpen(true);
    setIsScoreLocked(true);
    setAiError(false);

    try {
      const res = await fetch(`${apiUrl}/ai_grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: student.student_id,
          student_name: student.student_name,
          student_answer: student.student_answer,
          rater_uid: raterUid,
          rater_name: raterId,
          project_name: projectName,
          criteria: criteria.map((c) => ({
            name: c,
            expert_score: Number(expertScores[c])
          }))
        }),
      });

      if (!res.ok) throw new Error("AI 서버 오류");
      const data = await res.json();
      if (!data.success) throw new Error("AI 채점 실패");

      setAiResult(data.ai_result);
      setScoreUid(data.score_uid);
    } catch (err) {
      alert(`[Student #${student.student_name}] AI 채점 실패. 다시 시도해주세요.`);
      setAiError(true);
      setIsScoreLocked(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalSave = async () => {
    if (!aiResult?.scores) {
      alert("AI 결과가 없습니다.");
      return;
    }
    
    if (!window.confirm(`Student #${student.student_name} 점수를 최종 확정하시겠습니까? (수정 불가)`)) {
        return;
    }

    try {
      const res = await fetch(`${apiUrl}/add_final_score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score_uid: scoreUid,
          student_id: student.student_id,
          student_name: student.student_name,
          rater_uid: raterUid,
          rater_name: raterId,
          project_name: projectName,

          // 1차 전문가
          expert_scores: Object.fromEntries(
            Object.entries(expertScores).map(([k, v]) => [k, Number(v)])
          ),

          // 2차 AI
          ai_scores: aiResult.scores,

          // 3차 최종 (사람 수정)
          final_scores: Object.fromEntries(
            Object.entries(expertScores).map(([k, v]) => [k, Number(v)])
          )
        }),
      });

      const data = await res.json();
      if (data.status === 'ok') {
        setIsConfirmed(true);
        alert(`Student #${student.student_name} 점수 확정 완료!`);
      } else {
        alert('확정 실패');
      }
    } catch (err) {
      alert('서버 오류');
    }
  };

  const isAnalysisComplete = isAiPanelOpen && !isLoading && aiResult;

  // 동적 하이라이트 문장 가공 (항목별로 지정된 색상 매핑)
  const allHighlights: { text: string; color: string }[] = [];
  if (aiResult?.key_sentences) {
    criteria.forEach((c, idx) => {
      const sentences = aiResult!.key_sentences![c] || [];
      const color = HIGHLIGHT_COLORS[idx % HIGHLIGHT_COLORS.length];
      
      sentences.forEach(sentence => {
        sentence.split(/\/|(?=\s\d+\.)/).map(s => s.trim()).filter(s => s.length > 0).forEach(part => {
          allHighlights.push({ text: part, color });
        });
      });
    });
  }

  return (
    <div className="grading-row fade-in" style={{ 
      paddingTop: '10px',
      marginBottom: isLast ? '0px' : '60px', 
      borderBottom: isLast ? 'none' : '1px solid #ccc', 
      paddingBottom: isLast ? '20px' : '40px' 
    }}>
      <div className="row-header desktop-only">
          <h2>Student #{student.student_name} 답안</h2>
          <h2>전문가 채점</h2>
          <div className="header-placeholder">{isAiPanelOpen && <h2>AI 채점</h2>}</div>
      </div>

      <div className="row-body" style={{ alignItems: 'flex-start' }}>
          
          {/* 학생 답안 */}
          <div className="column student-column" style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 className="mobile-title">Student #{student.student_id} 답안</h3>
              {/* 동적으로 계산된 높이 적용 */}
              <div className="student-card custom-scroll" style={{ height: CARD_HEIGHT, overflowY: 'auto' }}>
                  <p className="answer-text">
                          <AnswerHighlighter text={student.student_answer} highlights={allHighlights} />
                  </p>
              </div>
          </div>

          {/* 전문가 채점 */}
          <div className="column expert-column" style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 className="mobile-title">전문가 채점</h3>
              {/* 동적으로 계산된 높이 적용 */}
              <div className="grading-form-container" style={{ height: CARD_HEIGHT, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flex: '0 0 auto' }}> 
                    {criteria.length === 0 && <div style={{color: 'red', marginBottom: '10px'}}>새 프로젝트를 업로드해야 항목이 표시됩니다.</div>}
                    
                    {(criteria || []).map((criterion, idx) => {
                      const bgColor = HIGHLIGHT_COLORS[idx % HIGHLIGHT_COLORS.length];
                      return (
                        <div key={criterion} className="score-row">
                            <span className="score-label" style={{ backgroundColor: bgColor }}>
                                {criterion}
                            </span>
                            <input 
                                type="number" 
                                className="score-input"
                                value={expertScores[criterion] || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || (Number(val) >= 1 && Number(val) <= 10)) {
                                        setExpertScores(prev => ({ ...prev, [criterion]: val }));
                                    }
                                }}
                                min="1" max="10"
                                disabled={isScoreLocked || isConfirmed}
                            />
                        </div>
                      );
                    })}
                  </div>

                  <div className="button-stack" style={{ flex: '0 0 auto', marginTop: '10px' }}>
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
                              onClick={() => { if(!isConfirmed) setIsScoreLocked(false); }}
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

          {/* [3] AI 결과 (동적 생성) */}
          <div className="column ai-column">
              {isAiPanelOpen ? (
                  <>
                  <h3 className="mobile-title">AI 채점</h3>
                  {isLoading ? (
                      <div className="spinner-container" style={{ height: CARD_HEIGHT }}>
                          <div className="loading-spinner"></div>
                          <span className="loading-text">AI 채점 중...</span>
                      </div>
                  ) : (
                      <div className="ai-result-content fade-in" style={{ height: CARD_HEIGHT, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          
                          {/* 점수 영역 */}
                          <div style={{ flex: '0 0 auto', paddingBottom: '10px', borderBottom: '1px solid #eee' }}>
                            {(criteria || []).map((criterion, idx) => {
                               const bgColor = HIGHLIGHT_COLORS[idx % HIGHLIGHT_COLORS.length];
                               return (
                                  <div key={criterion} className="score-row">
                                      <span className="score-label" style={{ backgroundColor: bgColor }}>
                                          {criterion}
                                      </span>
                                      <div className="score-display">{aiResult?.scores?.[criterion] ?? '-'}</div>
                                  </div>
                               );
                            })}
                          </div>
                          
                          {/* 피드백 영역 */}
                          <div className="ai-feedback-container custom-scroll" style={{ flex: 1, overflowY: 'auto', paddingTop: '10px', minHeight: 0 }}>
                              {(criteria || []).map((criterion) => (
                                <div key={criterion} className="feedback-section" style={{ marginBottom: '20px' }}>
                                    <h4 className="feedback-label" style={{ display: 'inline-block', marginBottom: '4px' }}>
                                        [{criterion}]
                                    </h4>
                                    <ul className="feedback-list">
                                        {(aiResult?.rationales?.[criterion] ?? []).length > 0 ? (
                                            aiResult!.rationales![criterion].map((r, i) => (
                                                <li key={i} style={{ marginBottom: '4px' }}>{r}</li>
                                            ))
                                        ) : ( <li>근거 없음</li> )}
                                    </ul>
                                </div>
                              ))}
                          </div>
                      </div>
                  )}
                  </>
              ) : (
                  <div className="empty-placeholder" style={{ height: CARD_HEIGHT }}></div>
              )}
          </div>
      </div>
    </div>
  );
};


// ----------------------------------------------------------------------
// [4] 메인 화면
// ----------------------------------------------------------------------
interface GradingProps {
  apiUrl: string;
  raterId: string;
  raterUid: string;
  projectName: string;
  criteria: any;
  onLogout: () => void;
}

const GradingScreen: React.FC<GradingProps> = ({
  apiUrl, raterId, raterUid, projectName, criteria, onLogout,
}) => {
  const [searchText, setSearchText] = useState('');
  const [studentList, setStudentList] = useState<any[]>([]);
  const [isGradingStarted, setIsGradingStarted] = useState(false);

  const safeCriteria = useMemo(() => {
    let parsed: string[] = [];
    try {
      if (Array.isArray(criteria)) {
        parsed = criteria;
      } else if (typeof criteria === 'string') {
        const temp = JSON.parse(criteria);
        // 이중으로 문자열화 되어있을 경우를 대비
        parsed = typeof temp === 'string' ? JSON.parse(temp) : temp;
      }
    } catch (e) {
      console.error("Criteria parsing error", e);
    }
    return Array.isArray(parsed) ? parsed : [];
  }, [criteria]);

  const handleSearch = async () => {
    const input = searchText.trim();
    if (!input) {
      alert('학생 ID를 입력해주세요');
      return;
    }

    const isMulti = input.includes('-') || input.includes(',');
    const url = isMulti ? `${apiUrl}/students/${projectName}/${input}` : `${apiUrl}/student/${projectName}/${input}`;  
    
    try {
      const res = await fetch(url);
      if (!res.ok) {
        alert('학생을 찾을 수 없습니다');
        return;
      }
      const data = await res.json();

      if (isMulti) {
        if (!Array.isArray(data) || data.length === 0) {
          alert('조회된 학생이 없습니다');
          return;
        }
        setStudentList(data);
      } else {     
        setStudentList([data]);
      }
      setIsGradingStarted(true);
    } catch (err) {
      alert('서버 오류가 발생했습니다.');
    }
  };

  return (
    <div className="grading-container">
      <header className="top-header">
        <div className="logo">AI Essay Grader</div>
        <div className="rater-info">
             <p className="rater-name">{raterId}님 환영합니다</p>
             <p className="project-name">Project: {projectName}</p>
             <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>      
      </header>

      <main className="main-content">
        <div className="search-section">
             <div className="search-bar-wrapper">
                <i className="fa-solid fa-magnifying-glass search-icon"></i>
                <input 
                    type="text" 
                    placeholder="학생 ID를 입력하세요 ( ex. 10101, 10101-10105 )" 
                    value={searchText} 
                    onChange={(e) => setSearchText(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()} 
                />
                <button className="search-btn" onClick={handleSearch}>Search</button>
             </div>
        </div>

        {!isGradingStarted ? (
          <div className="empty-state-container">
            <p className="empty-text">채점 대상 입력 시 이곳에 해당 학생의 답안과 채점 란이 나타납니다.</p>
          </div>
        ) : (
          <div className="grading-list">
             {studentList.map((student, index) => (
               <GradingRow 
                  key={student.student_id} 
                  student={student}
                  apiUrl={apiUrl}
                  raterUid={raterUid}
                  raterId={raterId}
                  projectName={projectName}
                  criteria={safeCriteria}
                  isLast={index === studentList.length - 1}
               />
             ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default GradingScreen;