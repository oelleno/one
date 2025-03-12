import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, getDownloadURL, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { db, storage } from "./firebase.js";

const fileName = "contract.xlsx";

/* Excel 업로드 함수 - 회원 데이터를 Excel 파일로 가공하여 Firebase Storage에 업로드 */
export async function excelupload() {
  const uploadBtn = document.getElementById("excel-upload-btn");
  uploadBtn.textContent = "최종업로드중...";
  uploadBtn.disabled = true;

  try {
    /* Firestore에서 회원 정보 문서 가져오기 */
    const dbInstance = await db;
    const docRef = doc(dbInstance, "Membership", docId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.error("문서를 찾을 수 없습니다:", docId);
      document.getElementById("status").innerText = "문서를 찾을 수 없습니다!";
      return;
    }
    const userData = docSnap.data();

    /* 영수증 URL 로깅 (디버깅용) */
    if (userData.receipts && userData.receipts.length > 0) {
      userData.receipts.forEach((receipt, index) => {
        console.log(`영수증 ${index + 1} URL:`, receipt.url);
      });
    } else {
      console.warn("영수증 URL이 없습니다.");
    }

    /* Excel 데이터 행 생성 - 회원 정보를 Excel 형식으로 가공 */
    const newData = [[
      userData.docId || "N/A",
      userData.branch || "N/A",
      userData.contract_manager || "N/A",
      userData.name || "N/A",
      userData.contact || "N/A",
      userData.gender || "N/A",
      userData.birthdate || "N/A",
      userData.address || "N/A",
      userData.membership || "N/A",
      userData.rental_months || "N/A",
      userData.locker_months || "N/A",
      userData.membership_months || "N/A",
      userData.discount || "N/A",
      userData.totalAmount || "N/A",
      userData.payment_method || "N/A",
      userData.unpaid ? userData.unpaid.replace('결제예정 ', '') : "N/A",
      userData.goals ? userData.goals.join(", ") : "N/A",
      userData.other_goal || "N/A",
      userData.workout_times ? `${userData.workout_times.start}-${userData.workout_times.end} ${userData.workout_times.additional || ''}` : "N/A",
      userData.referral_sources ? userData.referral_sources.map(ref =>
        ref.source + (ref.detail ? `: ${typeof ref.detail === 'object' ? `${ref.detail.name}(${ref.detail.phone})` : ref.detail}` : '')
      ).join(', ') : "N/A",
      userData.membership_start_date || "N/A",
      userData.timestamp || "N/A",
      userData.imageUrl || "",
      userData.receipts?.[0]?.url || "",
      userData.receipts?.[1]?.url || "",
      userData.receipts?.[2]?.url || "",
      userData.receipts?.[3]?.url || "",
      userData.receipts?.[4]?.url || "",
      userData.receipts?.[5]?.url || ""
    ]];

    let workbook;
    let existingData = [];
    const sheetName = "회원가입계약서";
    
    /* Excel 헤더 행 설정 */
    const headerRow = [
      "ID", "지점", "계약담당자", "이름", "연락처", "성별",
      "생년월일", "주소", "회원권", "운동복대여", "라커대여",
      "기간", "할인", "합계", "결제방법", "결제예정",
      "운동목적", "기타목적", "운동시간", "가입경로", "시작일",
      "등록일시", "계약서사본", "영수증1", "영수증2", "영수증3", "영수증4", "영수증5", "영수증6"
    ];

    try {
      /* 기존 Excel 파일이 있다면 가져오기 */
      const storageInstance = await storage;
      const encodedFileName = encodeURIComponent(fileName);
      const fileRef = ref(storageInstance, encodedFileName);
      const url = await getDownloadURL(fileRef);
      const response = await fetch(url);
      const data = await response.arrayBuffer();

      workbook = XLSX.read(data, { type: "array" });

      if (workbook.SheetNames.includes(sheetName)) {
        const worksheet = workbook.Sheets[sheetName];
        existingData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      }

    } catch (error) {
      console.warn("기존 엑셀 파일 없음. 새 파일 생성.");
      workbook = XLSX.utils.book_new();
    }

    /* 데이터 처리 및 새 데이터 행 추가 */
    if (existingData.length === 0) {
      existingData.push(headerRow);
    } else {
      existingData = existingData.filter(row => row.some(cell => cell !== undefined && cell !== ""));
    }

    existingData.push(...newData);

    /* 새 워크시트 생성 및 열 너비 설정 */
    const newWorksheet = XLSX.utils.aoa_to_sheet(existingData, { cellDates: true });
    if (!newWorksheet['!cols']) newWorksheet['!cols'] = [];
    for (let i = 22; i <= 28; i++) {
      newWorksheet['!cols'][i] = { wch: 15 };
    }

    /* 워크북에 워크시트 추가 또는 업데이트 */
    if (workbook.SheetNames.includes(sheetName)) {
      workbook.Sheets[sheetName] = newWorksheet;
    } else {
      XLSX.utils.book_append_sheet(workbook, newWorksheet, sheetName);
    }

    /* Excel 파일 생성 및 Firebase Storage에 업로드 */
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const storageInstance = await storage;
    const fileRef = ref(storageInstance, `Membership/${window.docId}/${fileName}`);
    await uploadBytesResumable(fileRef, blob);

    /* 업로드 성공 처리 */
    const uploadBtn = document.getElementById("excel-upload-btn");
    uploadBtn.textContent = "최종업로드완료!";
    uploadBtn.disabled = true;
    uploadBtn.classList.remove("blink-border");
    console.log("✅ 엑셀 업데이트가 성공적으로 완료되었습니다!");

    /* 모든 작업이 완료되었는지 확인 */
    if (window.parent && window.parent.checkAllActionsCompleted) {
      window.parent.checkAllActionsCompleted();
    }
  } catch (error) {
    console.error("엑셀 업데이트 오류:", error);
    document.getElementById("status").innerText = "엑셀 업데이트 실패!";
  }
};
