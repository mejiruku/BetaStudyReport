// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDXrKDl-NmTWQ6TgW6G6O1LeHQXH1RIv1Y",
  authDomain: "studyreport-dc715.firebaseapp.com",
  projectId: "studyreport-dc715",
  storageBucket: "studyreport-dc715.firebasestorage.app",
  messagingSenderId: "1031578888568",
  appId: "1:1031578888568:web:7e6ec22fc674f704ee808d",
  measurementId: "G-CQ340DVK9R",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
