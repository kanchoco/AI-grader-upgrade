async function loginAPI(userId, password) {

    return new Promise((resolve) => {
        setTimeout(() => {
            // 지금은 아이디만 입력하면 무조건 성공
            if (userId.trim() !== "") {
                resolve({ success: true, token: "dummy-token-123" });
            } else {
                resolve({ success: false, message: "아이디를 입력해주세요." });
            }
        }, 1000); // 1초 딜레이
    });
    // -------------------------------------------------------
    // try {
    //     const response = await fetch("api주소", {
    //         method: "POST", 
    //         headers: {
    //             "Content-Type": "application/json",
    //         },
    //         body: JSON.stringify({
    //             id: userId,
    //             pw: password
    //         }),
    //     });
            // 서버의 응답을 JSON으로 변환해서 받기
    //     const data = await response.json();

    //     // 결과 반환 (성공/실패 여부)
    //     return data; 

    // } catch (error) {
    //     // 통신 에러 처리
    //     console.error("API 호출 중 에러:", error);
    //     return { success: false, message: "서버 연결 실패" };
    // }
    // -------------------------------------------------------
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');

    if (!form) return; // 폼이 없으면 실행 안 함 (에러 방지)

    form.addEventListener('submit', async function(e) {
        e.preventDefault(); // 새로고침 방지

        // 입력값 가져오기
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const submitBtn = document.querySelector('.submit-btn');

        const userId = usernameInput.value;
        const userPw = passwordInput.value;

        // 버튼 로딩 상태로 변경 
        const originalBtnText = submitBtn.innerText;
        submitBtn.innerText = "로그인 중...";
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.7";
        submitBtn.style.cursor = "not-allowed";

        try {
            const result = await loginAPI(userId, userPw);

            // 결과 처리
            if (result.success) {
                // 성공 -> 페이지 이동
                window.location.href = 'main.html'; 
            } else {
                // 실패 시 에러 메시지 띄우기
                alert(result.message || '로그인 정보를 확인해주세요.');
            }

        } catch (error) {
            console.error("시스템 에러:", error);
            alert("서버와 통신 중 오류가 발생했습니다.");
        } finally {
            // 버튼 상태 원상복구 (성공하든 실패하든 실행됨)
            submitBtn.innerText = originalBtnText;
            submitBtn.disabled = false;
            submitBtn.style.opacity = "1";
            submitBtn.style.cursor = "pointer";
        }
    });

    // 비밀번호 표시/숨기기 토글 기능
    const togglePassword = document.querySelector('.toggle-password');
    const passwordField = document.getElementById('password');

    if (togglePassword && passwordField) {
        togglePassword.addEventListener('click', function() {
            // 1. 현재 input 타입을 확인 (password <-> text)
            const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordField.setAttribute('type', type);

            // 2. 아이콘 모양 변경 (눈 뜬 거 <-> 눈 감은 거)
            // fa-eye: 눈 뜬 아이콘, fa-eye-slash: 눈 감은 아이콘
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }
});