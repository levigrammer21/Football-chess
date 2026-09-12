import { connectRestEmulator } from "./sync";
import { initializeApp, FirebaseOptions } from "firebase/app";
import { firebaseConfig } from "./firebase-config";
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
export async function connect() {
  const config: FirebaseOptions = import.meta.env.VITE_FIREBASE_CONFIG
    ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG)
    : firebaseConfig;
  if (
    import.meta.env.VITE_USE_EMULATORS === "true" &&
    !config.projectId?.startsWith("demo-")
  )
    throw new Error("Emulator mode requires an explicit demo project configuration.");
  if (!config.apiKey || !config.projectId)
    throw new Error("Firebase project configuration is incomplete.");
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db =
    import.meta.env.VITE_USE_EMULATORS === "true"
      ? initializeFirestore(app, {
          experimentalForceLongPolling: true,
          experimentalLongPollingOptions: { timeoutSeconds: 5 },
        })
      : getFirestore(app);
  const functions = getFunctions(app, "us-central1");
  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectRestEmulator(db);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }
  await setPersistence(auth, browserLocalPersistence);
  const invoke = httpsCallable<Record<string, unknown>, any>(
    functions,
    "coach",
  );
  return {
    auth,
    db,
    call: async (data: Record<string, unknown>) => {
      const result = (await invoke(data)).data;
      window.dispatchEvent(new Event("coach-write"));
      return result;
    },
  };
}
export type Services = Awaited<ReturnType<typeof connect>>;
