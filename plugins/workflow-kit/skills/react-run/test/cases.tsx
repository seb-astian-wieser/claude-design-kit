import { run } from "./run";

declare const state: { loading: boolean; error?: { retryable: boolean }; user?: { admin: boolean } };
declare const Spinner: () => JSX.Element;
declare const Retry: () => JSX.Element;
declare const Fail: () => JSX.Element;
declare const Admin: () => JSX.Element;
declare const Home: () => JSX.Element;

// BAD 1: nested ternary in JSX
export const A = () => (
  <div>{state.loading ? <Spinner /> : state.error ? <Fail /> : <Home />}</div>
);

// BAD 2: IIFE in JSX
export const B = () => (
  <div>
    {(() => {
      if (state.loading) return <Spinner />;
      return <Home />;
    })()}
  </div>
);

// BAD 3: async IIFE
export async function C() {
  const list = await (async () => {
    const res = await fetch("/x");
    return res.ok ? res.json() : null;
  })();
  return list;
}

// BAD 4: classic function IIFE
export const D = (function () {
  return 1;
})();

// BAD 5: run() straight in a function body that could just use ifs
export function E() {
  return run(() => {
    if (state.loading) return <Spinner />;
    return <Home />;
  });
}

// BAD 6: trivial run
export const F = () => <div>{run(() => <Home />)}</div>;

// GOOD 1: run inside JSX with early returns
export const G = () => (
  <div>
    {run(() => {
      if (state.loading) return <Spinner />;
      if (state.error) return state.error.retryable ? <Retry /> : <Fail />;
      if (state.user?.admin) return <Admin />;
      return <Home />;
    })}
  </div>
);

// GOOD 2: server component fetch with await run
export async function H() {
  const list = await run(async () => {
    try {
      const res = await fetch("/x");
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  });
  if (!list) return null;
  return <p>{list.name}</p>;
}

// GOOD 3: single ternary is fine
export const I = () => <div>{state.loading ? <Spinner /> : <Home />}</div>;

// GOOD 4: nested ternary outside JSX is left to Biome's own noNestedTernary
export const label = state.loading ? "a" : state.error ? "b" : "c";

// BAD 7: nested ternary in a JSX attribute
export const J = () => (
  <div className={state.loading ? "a" : state.error ? "b" : "c"} />
);

// GOOD 5: single ternary in an attribute
export const K = () => <div className={state.loading ? "a" : "b"} />;

// BAD 8: nested ternary wrapped in parentheses
export const L = () => <div style={{ top: state.loading ? (state.error ? 1 : 2) : 3 }} />;
