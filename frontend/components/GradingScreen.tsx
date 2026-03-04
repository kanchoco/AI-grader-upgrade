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
  const [expertScore, setExpertScore] = useState({
    critical: '',
    math: '',
  });

  // 채점 근거(전문가 채점)
  const [expertRationale, setExpertRationale] = useState('');

  // AI 결과
  const [aiResult, setAiResult] = useState<any>(null);
  const [scoreUid, setScoreUid] = useState('');

  // 학생 조회 (student_id 기준)
  const handleSearch = async () => {
    const input = searchText.trim();

    if (!input) {
      alert('학생 ID를 입력해주세요');
      return;
    }
  const isRange = input.includes('-');

  const url = isRange
    ? `${apiUrl}/students/${input}`
    : `${apiUrl}/student/${input}`;  
    
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
      setExpertScore({ critical: '', math: '' });
      setExpertRationale(''); // 새 학생 검색 시 채점 근거 초기화
      setAiResult(null);
      setIsAiPanelOpen(false);
      setIsScoreLocked(false); //잠금 해제
      setIsConfirmed(false); //확정 해제
      // UI: 작업 공간 표시
      setIsGradingStarted(true);

    } catch (err) {
      alert('서버 오류가 발생했습니다.');
    }
  };

  // AI 채점 (전문가 + AI)
  const handleAiGrade = async () => {
    const mathScore = Number(expertScore.math);
    const crtScore = Number(expertScore.critical);

    if (!expertScore.critical || !expertScore.math) {
      alert('전문가 점수를 입력하세요');
      return;
    }

    if (mathScore < 1 || mathScore > 10 || crtScore < 1 || crtScore > 10) {
      alert('점수는 1점에서 10점 사이의 정수여야 합니다.');
      return;
    }

    // [UI] 로딩 시작 및 패널 열기
    setIsLoading(true);
    setIsAiPanelOpen(true);
    setIsScoreLocked(true); // 입력창 잠금

    try {
      const res = await fetch(`${apiUrl}/ai_grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_uid: studentUid,   // DB용
          student_id: studentId,     // 로그/확장용
          rater_uid: raterUid,
          expert_crt_score: Number(expertScore.critical),
          expert_knw_score: Number(expertScore.math),
          expert_rationale: expertRationale,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        alert('AI 채점 실패');
        setIsLoading(false);
        setIsScoreLocked(false); // 실패 시 잠금 해제
        return;
      }

      setAiResult(data.ai_result);
      setScoreUid(data.score_uid);

    } catch (err) {
      alert('AI 서버 오류');
      setIsScoreLocked(false);
    } finally {
      setIsLoading(false); // 로딩 종료
    }
  };

  const handleFinalSave = async () => {
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
          knw_score: aiResult.scores.scientific,
          crt_score: aiResult.scores.critical,
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
             <button className="logout-btn" onClick={onLogout}>Logout</button>
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
                <div className="grading-row fade-in">
                    {/* 타이틀 영역 */}
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
                        {/* [왼쪽] 학생 답안 */}
                        <div className="column student-column">
                            <h3 className="mobile-title">Student #{studentId} 답안</h3>
                            <div className="student-card">
                                {/* 실제 DB 데이터 바인딩 */}
                                <p className="answer-text">
                                    <AnswerHighlighter
                                        text={studentAnswer}
                                        // AI 결과가 없으면 빈 배열을 넣어 에러를 방지.
                                        sciSentences={aiResult?.key_sentences?.scientific || []}
                                        crtSentences={aiResult?.key_sentences?.critical || []}
                                    />
                                </p>
                            </div>
                        </div>

                        {/* [가운데] 전문가 채점 */}
                        <div className="column expert-column">
                            <h3 className="mobile-title">전문가 채점</h3>
                            <div className="grading-form-container">
                                <div className="score-row">
                                    <span className="score-label label-blue">수과학적 사고</span>
                                    <input 
                                        type="number" 
                                        className="score-input"
                                        value={expertScore.math}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            // 빈 값(지울 때) 허용 OR 1~10 사이일 때만 상태 업데이트
                                            if (val === '' || (Number(val) >= 1 && Number(val) <= 10)) {
                                                setExpertScore({...expertScore, math: val});
                                            }
                                        }}
                                        min="1"
                                        max="10"
                                        disabled={isScoreLocked || isConfirmed} // 잠금 로직 적용
                                    />
                                </div>
                                <div className="score-row">
                                    <span className="score-label label-yellow">비판적 사고</span>
                                    <input 
                                        type="number" 
                                        className="score-input"
                                        value={expertScore.critical}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            // 빈 값 허용 OR 1~10 사이일 때만 업데이트
                                            if (val === '' || (Number(val) >= 1 && Number(val) <= 10)) {
                                                setExpertScore({...expertScore, critical: val});
                                            }
                                        }}
                                        min="1"
                                        max="10"
                                        disabled={isScoreLocked || isConfirmed} // 잠금 로직 적용
                                    />
                                </div>

                                <textarea 
                                    className="reason-box"
                                    placeholder="채점 근거(선택):"
                                    value={expertRationale} // 값 연결
                                    onChange={(e) => setExpertRationale(e.target.value)} // 입력 시 상태 업데이트
                                    disabled={isScoreLocked || isConfirmed}
                                />

                                <div className="button-stack">
                                    {/* AI 버튼 */}
                                    <button 
                                        className="btn-ai-check" 
                                        onClick={handleAiGrade}
                                        disabled={isAiPanelOpen || isConfirmed}
                                    >
                                        AI 채점 결과 확인
                                    </button>
                                    
                                    {/* 수정/확정 버튼 */}
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

                        {/* [오른쪽] AI 채점 */}
                        <div className="column ai-column">
                            {isAiPanelOpen ? (
                                <>
                                <h3 className="mobile-title">AI 채점</h3>
                                {isLoading ? (
                                    <div className="spinner-container">
                                        <div className="loading-spinner"></div>
                                        <span className="loading-text">AI가 답안을 채점 중...</span>
                                    </div>
                                ) : (
                                    /* API 결과 데이터 바인딩 */
                                    <div className="ai-result-content fade-in">
                                        <div className="score-row">
                                            <span className="score-label label-blue">수과학적 사고</span>
                                            <div className="score-display">{aiResult?.scores?.scientific}</div>
                                        </div>
                                        <div className="score-row">
                                            <span className="score-label label-yellow">비판적 사고</span>
                                            <div className="score-display">{aiResult?.scores?.critical}</div>
                                        </div>
                                        
                                        <div className="ai-feedback-container">
                                            {/* 1. 수과학적 사고 근거 영역 */}
                                            <div className="feedback-section" style={{ marginBottom: '20px' }}>
                                                <h4 className="feedback-label" style={{ display: 'inline-block', marginBottom: '4px' }}>
                                                    [수과학적 사고]
                                                </h4>
                                                <ul className="feedback-list">
                                                    {aiResult?.rationales?.scientific?.length > 0 ? (
                                                        aiResult.rationales.scientific.map((r: string, i: number) => (
                                                            <li key={`sci-${i}`} style={{ marginBottom: '4px' }}>{r}</li>
                                                        ))
                                                    ) : (
                                                        <li>근거 없음</li>
                                                    )}
                                                </ul>
                                            </div>

                                            {/* 2. 비판적 사고 근거 영역 */}
                                            <div className="feedback-section">
                                                <h4 className="feedback-label" style={{ display: 'inline-block', marginBottom: '4px' }}>
                                                    [비판적 사고]
                                                </h4>
                                                <ul className="feedback-list">
                                                    {aiResult?.rationales?.critical?.length > 0 ? (
                                                        aiResult.rationales.critical.map((r: string, i: number) => (
                                                            <li key={`crt-${i}`} style={{ marginBottom: '4px' }}>{r}</li>
                                                        ))
                                                    ) : (
                                                        <li>근거 없음</li>
                                                    )}
                                                </ul>
                                            </div>
                                        </div>
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
