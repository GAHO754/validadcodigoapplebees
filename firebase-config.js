const firebaseConfig = {
  apiKey: "AIzaSyAWta7DENSCSb-DN8OcKGa6uAbTbUYJhVg",
  authDomain: "applebesapp.firebaseapp.com",
  projectId: "applebesapp",

  // ✅ URL correcto de tu base de datos Realtime
  databaseURL: "https://applebesapp-default-rtdb.firebaseio.com",

  // ⚠️ Corrige también el bucket (usa .appspot.com en lugar de .firebasestorage.app)
  storageBucket: "applebesapp.appspot.com",

  messagingSenderId: "83305456668",
  appId: "1:83305456668:web:3dfcfdd4eb2b6cb8982bd9",
  measurementId: "G-WNTW6P44P3"
};

// Inicializa Firebase solo si aún no está iniciado
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
