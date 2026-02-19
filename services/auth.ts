// 서버가 보내줄 응답 데이터
export interface LoginResponse {
  success: boolean;      // 로그인 성공 여부
  message?: string;      // 실패 시 에러 메시지
  token?: string;        // 로그인 성공 시 받을 인증 토큰
  user?: {               // 사용자 정보
    name: string;
  };
}

// 서버 통신 함수
export const loginAPI = async (userId: string, userPw: string): Promise<LoginResponse> => {
  
  const BASE_URL = import.meta.env.VITE_API_BASE_URL;
  
  // 최종 주소 조합 (기본 주소 + 로그인 페이지 경로)
  const API_URL = `${BASE_URL}/login`;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // 자바스크립트 객체를 JSON 문자열로 바꿔서 전송
      body: JSON.stringify({
        id: userId,
        password: userPw,
      }),
    });

    // 서버 응답을 JSON으로 변환
    const data: LoginResponse = await response.json();

    // 서버 응답 200인지 확인
    if (response.ok) {
      return data; // 성공 데이터 반환
    } else {
      // 에러
      return {
        success: false,
        message: data.message || "서버 오류가 발생했습니다.",
      };
    }

  } catch (error) {
    console.error("API 통신 에러:", error);
    return {
      success: false,
      message: "서버와 연결할 수 없습니다. 네트워크를 확인해주세요.",
    };
  }
};