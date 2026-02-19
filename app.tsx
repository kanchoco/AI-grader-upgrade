import { useState, useEffect } from "react";
import LoginScreen from "./components/LoginScreen";
import GradingScreen from "./components/GradingScreen";
import UploadStudentPage from "./components/UploadStudentPage";
import './components/Grading.css'

// Cloud Run API URL
const API_BASE_URL =
  "https://ai-grading-upgrade-1015930710584.us-central1.run.app";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [raterId, setRaterId] = useState("");
  const [raterUid, setRaterUid] = useState("");
  const [role, setRole] = useState<string>(""); 

  // 로딩 상태 추가
  const [isLoading, setIsLoading] = useState(true);

// 앱이 처음 실행될 때 브라우저 저장소 확인
  useEffect(() => {
    const savedUid = localStorage.getItem("raterUid");
    const savedId = localStorage.getItem("raterId");
    const savedRole = localStorage.getItem("role");

    if (savedUid && savedId) {
      // 저장된 정보가 있으면 바로 로그인 처리
      setRaterUid(savedUid);
      setRaterId(savedId);
      setRole(savedRole ?? "");
      setIsLoggedIn(true);
    }
    
    // 확인 끝났으면 로딩 해제
    setIsLoading(false);
  }, []);

  // 로그인 성공 시 저장소에 기록
  const handleLoginSuccess = (
    uid: string,
    id: string,
    userRole?: string
  ) => {
    localStorage.setItem("raterUid", uid);
    localStorage.setItem("raterId", id);

    if (userRole) {
      localStorage.setItem("role", userRole);
      setRole(userRole);
    }

    setRaterUid(uid);
    setRaterId(id);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    // 브라우저 저장소에서 삭제
    localStorage.removeItem("raterUid");
    localStorage.removeItem("raterId");
    localStorage.removeItem("role");

    // 상태 초기화
    setRaterId("");
    setRaterUid("");
    setRole("");
    setIsLoggedIn(false);
  };

  // 로딩 스피너
  if (isLoading) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div className="loading-spinner" style={{ width: '40px', height: '40px' }}></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        apiUrl={API_BASE_URL}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  if (role === "admin") {
    return (
      <UploadStudentPage
        apiUrl={API_BASE_URL}
        raterId={raterId}
        onLogout={handleLogout}  
      />
    );
  }

  return (
    <GradingScreen
      apiUrl={API_BASE_URL}
      raterId={raterId}
      raterUid={raterUid}
      onLogout={handleLogout}  
    />
  );
}

export default App;

