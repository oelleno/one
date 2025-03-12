
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js";
import { db } from "./firebase.js";

// 회원권 설정 로드 함수
async function loadMembershipSettings() {
  try {
    // Firestore에서 설정 가져오기
    const dbInstance = await db;
    const docRef = doc(dbInstance, "AdminSettings", "membership");
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.warn("회원권 설정을 찾을 수 없습니다.");
      return;
    }

    const settings = docSnap.data();
    console.log("✅ 회원권 설정 로드 완료:", settings);

    // 회원권 가격 설정(New, Renew, Upgrade)
    if (settings.membership) {
      window.membershipFees = {
        new: parseInt(settings.membership.new || "33000"),
        renew: parseInt(settings.membership.renew || "0"),
        upgrade: parseInt(settings.membership.upgrade || "0")
      };
    }

    // 기간회비 설정
    if (settings.membership_fee) {
      window.membershipPrices = {
        1: parseInt(settings.membership_fee['01개월'] || "99000"),
        2: parseInt(settings.membership_fee['02개월'] || "154000"),
        3: parseInt(settings.membership_fee['03개월'] || "198000"),
        6: parseInt(settings.membership_fee['06개월'] || "297000"),
        12: parseInt(settings.membership_fee['12개월'] || "429000")
      };
    }

    // 라커 대여 가격
    if (settings.locker) {
      window.lockerPrice = parseInt(settings.locker || "11000");
    }

    // 운동복 대여 가격
    if (settings.rental) {
      window.rentalPrice = parseInt(settings.rental || "11000");
    }

    // 서비스 정상가격 설정
    if (settings.normal_price) {
      window.normalPrices = {
        dailyPrice: parseInt(settings.normal_price['1day'] || "5000"),
        freePTPrice: parseInt(settings.normal_price['freePT'] || "50000"),
        gxPrice: parseInt(settings.normal_price['GX'] || "30000")
      };
      
      // 환불안내에 정상가격 업데이트
      updateNormalPricesInUI();
    }

    // 초기 계산 수행
    updateAdmissionFee();
  } catch (error) {
    console.error("회원권 설정 로드 오류:", error);
  }
}

// 환불안내의 정상가격 업데이트 함수
function updateNormalPricesInUI() {
  if (!window.normalPrices) return;
  
  // 정상가격 표시 요소 찾기
  const normalPriceElement = document.getElementById('normal-price-display');
  if (normalPriceElement) {
    // 정상가격 텍스트 업데이트
    normalPriceElement.textContent = `회원권 1일 ${window.normalPrices.dailyPrice.toLocaleString('ko-KR')}원 | 무료PT ${window.normalPrices.freePTPrice.toLocaleString('ko-KR')}원 | GX ${window.normalPrices.gxPrice.toLocaleString('ko-KR')}원`;
  }
}

// 페이지 로드 시 설정 로드
document.addEventListener('DOMContentLoaded', loadMembershipSettings);

export { loadMembershipSettings };
