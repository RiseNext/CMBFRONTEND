/**
 * Tells React that `act(...)` is legitimate here, so state updates are flushed
 * synchronously inside it. Without this React warns and does not guarantee the
 * flush, which would make assertions on post-update state unreliable.
 */
declare global {
  interface globalThis {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export {};
