import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCMLZHMMRM13YtQkMzVEYcbgCUxKHE15T0",
  authDomain: "lokmanni-traders-rent.firebaseapp.com",
  projectId: "lokmanni-traders-rent",
  storageBucket: "lokmanni-traders-rent.firebasestorage.app",
  messagingSenderId: "640576820709",
  appId: "1:640576820709:web:03ab4c4e5ebe9060458b0c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Expose to global scope for app.js
window.db = db;
window.fsCollection = collection;
window.fsDoc = doc;
window.fsSetDoc = setDoc;
window.fsGetDoc = getDoc;
window.fsGetDocs = getDocs;
window.fsDeleteDoc = deleteDoc;

window.firebaseReady = true;
window.dispatchEvent(new Event('firebaseReady'));
