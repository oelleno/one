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

/* 일일권 양식 제출 함수 - 사용자 입력을 수집하여 Firestore에 저장 */
async function submitOnetimeForm() {
    return new Promise(async (resolve, reject) => {
        try {
            const firebaseInstance = await initializeFirebase();
            const dbInstance = firebaseInstance.db;

            /* 폼 데이터 수집 및 기본 유효성 검사 */
            const formData = new FormData();
            const name = document.getElementById('name').value.trim();
            const contact = document.getElementById('contact').value.trim();
            const price = document.getElementById('price').value.trim();
            const totalAmount = document.getElementById('total_amount').value.trim();
            const isAdmin = localStorage.getItem("adminVerified");

            if (!name || !contact) {
                reject(new Error("이름과 연락처를 입력하세요."));
                return;
            }

            /* 문서 ID 생성을 위한 현재 날짜 및 일련번호 설정 */
            const now = new Date();
            const dateStr = now.getFullYear().toString().slice(2) +
                (now.getMonth() + 1).toString().padStart(2, '0') +
                now.getDate().toString().padStart(2, '0');

            const startOfDay = new Date(now.setHours(0, 0, 0, 0));
            const endOfDay = new Date(now.setHours(23, 59, 59, 999));

            /* 오늘 생성된 문서 수를 계산하여 일련번호 생성 */
            const querySnapshot = await getDocs(collection(dbInstance, "Onetimepass"));
            let todayDocs = 0;
            querySnapshot.forEach(doc => {
                const docDate = new Date(doc.data().timestamp);
                if (docDate >= startOfDay && docDate <= endOfDay) {
                    todayDocs++;
                }
            });

            const dailyNumber = (todayDocs + 1).toString().padStart(3, '0');

            localStorage.setItem('current_doc_number', dailyNumber);

            // Set the correct document ID for onetime pass
            window.docIdone = `${dateStr}one_${dailyNumber}_${name}`;
            console.log("🚀 생성된 Doc ID:", window.docIdone);

            // Create the user data for Firestore
            const userData = {
                docId: window.docIdone,
                name: name,
                contact: contact,
                branch: document.getElementById('branch').value,
                price: price,
                totalAmount: totalAmount,
                gender: document.querySelector('input[name="gender"]:checked')?.value || '',
                payment_method: document.querySelector('input[name="payment"]:checked')?.value || '',
                discount: document.getElementById('discount').value,
                timestamp: new Date().toISOString(),
                adminVerified: isAdmin ? true : false
            };

            // Create the document in Firestore
            await setDoc(doc(dbInstance, "Onetimepass", window.docIdone), userData);
            console.log("✅ Firestore에 일일권 정보 저장 완료");

            // Continue with regular membership registration...
            resolve();
        } catch (error) {
            console.error("일일권 정보 저장 중 오류 발생:", error);
            alert("일일권 정보 저장에 실패했습니다.");
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

        // 현재 페이지 URL에 따라 컬렉션 이름 결정
        const isOnetime = window.location.pathname.includes('onetime.html');
        const collectionName = isOnetime ? "Onetimepass" : "Membership";

        /* Firebase Storage에 이미지 업로드 */
        const storageRef = ref(storage, `${collectionName}/${window.docIdone}/${fileName}`);
        await uploadBytes(storageRef, blob);
        console.log("✅ Firebase Storage 업로드 완료!");

        /* 업로드된 이미지의 다운로드 URL 가져오기 */
        const downloadURL = await getDownloadURL(storageRef);
        console.log("🔗 Firebase Storage 이미지 URL:", downloadURL);

        /* Firestore 문서에 이미지 URL 업데이트 */
        if (window.docIdone) {
            const docRef = doc(db, collectionName, window.docIdone);
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

window.submitOnetimeForm = submitOnetimeForm;
window.uploadImage = uploadImage;