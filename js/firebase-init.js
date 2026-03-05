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
window.db = firebase.firestore();
window.auth = firebase.auth();
window.provider = new firebase.auth.GoogleAuthProvider();

// Firestore Persistence
window.db.enablePersistence()
  .catch(function(err) {
      if (err.code == 'failed-precondition') {
          console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
      } else if (err.code == 'unimplemented') {
          console.warn("The current browser does not support all of the features required to enable persistence.");
      }
  });
