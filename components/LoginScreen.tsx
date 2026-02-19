import React, { useState } from 'react';
import './Login.css';
import bloodReportImg from '../assets/blood-report.png';

interface LoginProps {
  apiUrl: string;
  onLoginSuccess: (raterUid: string, raterId: string, role?: string) => void;
}

const LoginScreen: React.FC<LoginProps> = ({ apiUrl, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Cloud Run 로그인 API 호출
  const loginAPI = async (id: string, pw: string) => {
    const response = await fetch(`${apiUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rater_id: id,
        password: pw
      })
    });

    const data = await response.json();
    return data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {  
      const result = await loginAPI(username, password);

      if (result.success) {
        onLoginSuccess(
          result.rater_uid, 
          result.rater_id,
          result.role 
        );
      } else {
        alert(result.message ?? "로그인 실패");
        setIsLoading(false); 
      }

    } catch (error) {
      console.error(error);
      alert("서버 오류 발생");
      setIsLoading(false);    
    }
  };

  return (
    <div className="container">
      <div className="left-section">
        <div className="content-wrapper">
          <h1>AI-Assisted<br />Essay Review</h1>
          <div className="image-box">
            <img src={bloodReportImg} alt="Icon" className="login-icon-img" />
          </div>
        </div>
      </div>

      <div className="right-section">
        <div className="login-wrapper">
          <h2 className="hello">Welcome Back!</h2>
          <p className="description">채점자 본인의 이름과 비밀번호를 입력해 주세요.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="username">User name</label>
              <input
                type="text"
                id="username"
                className="input-field"
                value={username}
                onChange={(e)=>setUsername(e.target.value)}
                placeholder="Enter your Username"
              />
            </div>

            <div className="input-group">
              <label htmlFor="password">Password</label>
              <div className="password-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  className="input-field"
                  value={password}
                  onChange={(e)=>setPassword(e.target.value)}
                  placeholder="Enter your Password"
                />
                <i
                  className={`fa-regular ${showPassword ? 'fa-eye' : 'fa-eye-slash'} toggle-password`}
                  onClick={()=>setShowPassword(!showPassword)}
                ></i>
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? (
                  <span><i className="fa-solid fa-spinner fa-spin"></i>   Loading...</span>
              ) : (
                  "Login"
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
