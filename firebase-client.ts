import { connectRestEmulator } from "./sync";
import { initializeApp, FirebaseOptions } from "firebase/app";
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
  let config: FirebaseOptions;
  if (import.meta.env.VITE_FIREBASE_CONFIG)
    config = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
  else {
    const r = await fetch("/__/firebase/init.json");
    if (!r.ok)
      throw new Error(
        "Firebase configuration is not available. Deploy this project to Firebase Hosting using the included mobile setup guide.",
      );
    config = await r.json();
  }
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
