import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js";

/* Firebase 설정 가져오기 - 클라우드 함수에서 Firebase 구성 정보를 가져오는 함수 */
async function getFirebaseConfig() {
    try {
        const response = await fetch("https://us-central1-bodystar-1b77d.cloudfunctions.net/getFirebaseConfig");
        const config = await response.json();
        console.log("Firebase 설정 가져오기 성공");
        return config;
    } catch (error) {
        console.error("Firebase 설정 가져오기 오류:", error);
        throw error;
    }
}

let firebaseInstance = null;

/* Firebase 초기화 - 필요한 Firebase 서비스(인증, 데이터베이스, 스토리지)를 초기화하고 반환하는 함수 */
async function initializeFirebase() {
    if (!firebaseInstance) {
        try {
            const firebaseConfig = await getFirebaseConfig();
            const app = initializeApp(firebaseConfig);
            firebaseInstance = {
                auth: getAuth(app),
                db: getFirestore(app),
                storage: getStorage(app)
            };
            console.log("✅ Firestore 초기화 완료:", firebaseInstance.db);
            console.log("✅ Firebase Auth 초기화 완료:", firebaseInstance.auth);
        } catch (error) {
            console.error("Firebase 초기화 중 오류 발생:", error);
            throw error;
        }
    }
    return firebaseInstance;
}

/* 외부에서 사용할 Firebase 서비스들을 Promise 형태로 내보내기 */
export const db = initializeFirebase().then(instance => instance.db);
export const auth = initializeFirebase().then(instance => instance.auth);
export const storage = initializeFirebase().then(instance => instance.storage);

// 페이지 로드 시 지점 및 매니저 데이터 로드
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Firebase 설정
        const dbInstance = await db;
        
        // AdminSettings/settings 문서에서 데이터 가져오기
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js");
        const settingsDocRef = doc(dbInstance, "AdminSettings", "settings");
        const settingsDocSnap = await getDoc(settingsDocRef);
        
        if (settingsDocSnap.exists()) {
            const settingsData = settingsDocSnap.data();
            
            // 지점 드롭다운 찾기
            const branchSelect = document.getElementById('branch');
            if (branchSelect) {
                // 기존 옵션 제거 (맨 처음 기본 옵션 제외)
                while (branchSelect.options.length > 1) {
                    branchSelect.remove(1);
                }
                
                // 지점 데이터 가져오기
                const branches = settingsData.branch || {};
                
                // 모든 지점 데이터 추가
                Object.keys(branches).forEach(branchKey => {
                    const option = document.createElement('option');
                    option.value = branchKey;
                    option.textContent = branchKey;
                    branchSelect.appendChild(option);
                    
                    // 각 지점의 매니저 데이터 저장
                    branchSelect.setAttribute(`data-managers-${branchKey}`, JSON.stringify(branches[branchKey]));
                });
                
                // 지점 변경 이벤트 리스너 등록
                branchSelect.addEventListener('change', updateManagerList);
            }
        } else {
            console.warn("설정 데이터를 찾을 수 없습니다.");
        }
    } catch (error) {
        console.error("지점/매니저 데이터 로드 오류:", error);
    }
});

// 매니저 목록 업데이트 함수
function updateManagerList() {
    const branchSelect = document.getElementById('branch');
    const managerSelect = document.getElementById('contract_manager');
    
    if (!branchSelect || !managerSelect) return;
    
    const selectedBranch = branchSelect.value;
    if (!selectedBranch) return;
    
    // 기존 옵션 제거 (첫 번째 옵션 제외)
    while (managerSelect.options.length > 1) {
        managerSelect.remove(1);
    }
    
    // 선택된 지점의 매니저 데이터 가져오기
    const managersData = branchSelect.getAttribute(`data-managers-${selectedBranch}`);
    if (managersData) {
        const managers = JSON.parse(managersData);
        
        // 매니저 옵션 추가
        Object.entries(managers).forEach(([index, name]) => {
            if (name && typeof name === 'string') {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                managerSelect.appendChild(option);
            }
        });
    }
}

/* 회원가입 양식 제출 함수 - 사용자 입력을 수집하여 Firestore에 저장 */
async function submitForm() {
    return new Promise(async (resolve, reject) => {
        try {
            const firebaseInstance = await initializeFirebase();
            const dbInstance = firebaseInstance.db;

            /* 폼 데이터 수집 및 기본 유효성 검사 */
            const formData = new FormData();
            const name = document.getElementById('name').value.trim();
            const contact = document.getElementById('contact').value.trim();
            const birthdate = document.getElementById('birthdate').value.trim();
            const address = document.getElementById('main_address').value.trim();
            const membership = document.getElementById('membership').value.trim();
            const isAdmin = localStorage.getItem("adminVerified");

            if (!name || !contact) {
                reject(new Error("이름과 연락처를 입력하세요."));
                return;
            }

            /* 추가 결제 및 회원권 정보 수집 */
            const rentalMonths = document.getElementById('rental_months').value.trim();
            const lockerMonths = document.getElementById('locker_months').value.trim();
            const membershipMonths = document.getElementById('membership_months').value.trim();
            const discount = document.getElementById('discount').value.trim();
            const totalAmount = document.getElementById('total_amount').value.trim();

            /* 문서 ID 생성을 위한 현재 날짜 및 일련번호 설정 */
            const now = new Date();
            const dateStr = now.getFullYear().toString().slice(2) +
                (now.getMonth() + 1).toString().padStart(2, '0') +
                now.getDate().toString().padStart(2, '0');

            const startOfDay = new Date(now.setHours(0, 0, 0, 0));
            const endOfDay = new Date(now.setHours(23, 59, 59, 999));

            /* 오늘 생성된 문서 수를 계산하여 일련번호 생성 */
            const querySnapshot = await getDocs(collection(dbInstance, "Membership"));
            let todayDocs = 0;
            querySnapshot.forEach(doc => {
                const docDate = new Date(doc.data().timestamp);
                if (docDate >= startOfDay && docDate <= endOfDay) {
                    todayDocs++;
                }
            });

            const dailyNumber = (todayDocs + 1).toString().padStart(3, '0');

            localStorage.setItem('current_doc_number', dailyNumber);

            /* 고유 문서 ID 생성: 날짜_일련번호_이름 형식 */
            window.docId = `${dateStr}_${dailyNumber}_${name}`;
            console.log("🚀 생성된 Doc ID:", window.docId);

            /* 회원 정보 데이터 구성 */
            const userData = {
                docId: window.docId,
                name: name,
                contact: contact,
                birthdate: birthdate,
                address: address,
                membership: membership,
                branch: document.getElementById('branch').value,
                contract_manager: document.querySelector('input[name="contract_manager"]').value,
                gender: document.querySelector('input[name="gender"]:checked')?.value || '',
                rental_months: rentalMonths,
                rental_price: document.getElementById('rental_price').value,
                locker_months: lockerMonths,
                locker_price: document.getElementById('locker_price').value,
                membership_months: membershipMonths,
                membership_fee: document.getElementById('membership_fee').value,
                admission_fee: document.getElementById('admission_fee').value,
                discount: discount,
                totalAmount: totalAmount,
                goals: Array.from(document.querySelectorAll('input[name="goal"]:checked')).map(cb => cb.value),
                other_goal: document.getElementById('other').value,
                workout_times: {
                    start: document.querySelector('select[name="morning_hour"]').value,
                    end: document.querySelector('select[name="afternoon_hour"]').value,
                    additional: document.querySelector('.time-input[type="text"]').value
                },
                payment_method: document.querySelector('input[name="payment"]:checked')?.value || '',
                payment_details: Array.from(document.querySelectorAll('#payment-items input')).reduce((acc, input, i) => {
                    if (i % 2 === 0) {
                        acc.push({
                            description: input.value,
                            amount: document.querySelectorAll('#payment-items input')[i + 1]?.value || ''
                        });
                    }
                    return acc;
                }, []),
                cash_receipt: document.querySelector('input[name="cash_receipt"]:checked')?.value || '',
                receipt_phone: document.getElementById('receipt_phone').value,
                membership_start_date: document.getElementById('membership_start_date').value,
                referral_sources: Array.from(document.querySelectorAll('input[name="referral"]:checked')).map(cb => ({
                    source: cb.value,
                    detail: cb.value === 'SNS' ? document.getElementById('snsField').value :
                        cb.value === '인터넷검색' ? document.querySelector('input[name="internet_detail"]').value :
                            cb.value === '지인추천' ? document.querySelector('input[name="referral_name"]').value : ''
                })),
                terms_agreed: {
                    main: document.querySelector('input[name="terms_agree"]').checked,
                    twentyfour_hour: document.querySelector('input[name="24h_terms_agree"]').checked,
                    refund: document.querySelector('input[name="refund_terms_agree"]').checked
                },
                timestamp: new Date().toISOString(),
                unpaid: document.getElementById('unpaid').value,
                adminVerified: isAdmin ? true : false
            };

            /* Firestore에 회원 정보 저장 */
            await setDoc(doc(dbInstance, "Membership", window.docId), userData);
            resolve();
        } catch (error) {
            console.error("회원 정보 저장 중 오류 발생:", error);
            alert("회원 정보 저장에 실패했습니다.");
            reject(error);
        }
    });
}

/* 이미지 업로드 함수 - 서명이나 계약서 이미지를 Firebase Storage에 업로드하고 URL을 Firestore에 저장 */
async function uploadImage(fileName, blob) {
    try {
        const { ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/11.3.0/firebase-storage.js");
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js");

        const firebaseInstance = await initializeFirebase();
        const storage = firebaseInstance.storage;
        const db = firebaseInstance.db;

        // membership.html에서는 항상 Membership 컬렉션 사용
        const collectionName = "Membership";

        /* Firebase Storage에 이미지 업로드 */
        const storageRef = ref(storage, `${collectionName}/${window.docId}/${fileName}`);
        await uploadBytes(storageRef, blob);
        console.log("✅ Firebase Storage 업로드 완료!");

        /* 업로드된 이미지의 다운로드 URL 가져오기 */
        const downloadURL = await getDownloadURL(storageRef);
        console.log("🔗 Firebase Storage 이미지 URL:", downloadURL);

        /* Firestore 문서에 이미지 URL 업데이트 */
        if (window.docId) {
            const docRef = doc(db, collectionName, window.docId);
            await updateDoc(docRef, { imageUrl: downloadURL });
            console.log(`✅ Firestore ${collectionName}에 이미지 URL 저장 완료:`, downloadURL);
        } else {
            console.error("❌ Firestore 문서 ID(window.docId)가 제공되지 않음.");
        }

        return downloadURL;
    } catch (error) {
        console.error("❌ Firebase Storage 업로드 실패:", error);
        throw error;
    }
}


window.submitForm = submitForm;
window.uploadImage = uploadImage;