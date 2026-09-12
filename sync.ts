// Realtime listeners with a REST refresh path for suspended/background mobile streams.
// Both paths use Firebase Authentication and the same Firestore security rules.
import * as live from "firebase/firestore";
import * as rest from "firebase/firestore/lite";
const mirrors = new WeakMap<object, any>();
export function doc(db: live.Firestore, path: string, ...segments: string[]) {
  const ref = live.doc(db, path, ...segments);
  mirrors.set(ref, rest.doc(rest.getFirestore(db.app), path, ...segments));
  return ref;
}
export function collection(
  db: live.Firestore,
  path: string,
  ...segments: string[]
) {
  const ref = live.collection(db, path, ...segments);
  mirrors.set(
    ref,
    rest.collection(rest.getFirestore(db.app), path, ...segments),
  );
  return ref;
}
export function where(field: string, op: live.WhereFilterOp, value: unknown) {
  const constraint = live.where(field, op, value);
  mirrors.set(constraint, rest.where(field, op, value));
  return constraint;
}
export function orderBy(field: string) {
  const constraint = live.orderBy(field);
  mirrors.set(constraint, rest.orderBy(field));
  return constraint;
}
export function query(ref: live.Query, ...constraints: live.QueryConstraint[]) {
  const result = live.query(ref, ...constraints);
  mirrors.set(
    result,
    rest.query(mirrors.get(ref), ...constraints.map((c) => mirrors.get(c))),
  );
  return result;
}
export function connectRestEmulator(db: live.Firestore) {
  rest.connectFirestoreEmulator(rest.getFirestore(db.app), "127.0.0.1", 8080);
}
function observe(
  ref: any,
  next: (value: any) => void,
  error?: (e: Error) => void,
) {
  let closed = false,
    busy = false,
    last = "",
    revision = 0;
  const mirror = mirrors.get(ref);
  const emit = (s: any) => {
    if (closed) return;
    const encoded = JSON.stringify(
      "docs" in s
        ? s.docs.map((d: any) => [d.id, d.data()])
        : (s.data() ?? null),
    );
    if (encoded !== last) {
      last = encoded;
      revision++;
      next(s);
    }
  };
  const stop = live.onSnapshot(ref, emit, (e) => {
    if (!closed) error?.(e);
  });
  async function refresh() {
    if (
      closed ||
      busy ||
      !navigator.onLine ||
      document.visibilityState === "hidden" ||
      !mirror
    )
      return;
    busy = true;
    const at = revision;
    try {
      const snapshot =
        ref.type === "document"
          ? await rest.getDoc(mirror)
          : await rest.getDocs(mirror);
      if (at === revision) emit(snapshot);
    } catch (e) {
      if (!closed && last === "") error?.(e as Error);
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(refresh, 5000);
  window.addEventListener("coach-write", refresh);
  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", refresh);
  void refresh();
  return () => {
    closed = true;
    stop();
    clearInterval(timer);
    window.removeEventListener("coach-write", refresh);
    window.removeEventListener("online", refresh);
    document.removeEventListener("visibilitychange", refresh);
  };
}
export const onSnapshot = observe as typeof live.onSnapshot;
