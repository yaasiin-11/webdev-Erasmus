export function createAttemptLimiter({ limit = 10, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const failures = new Map();

  function prune(key) {
    const entry = failures.get(key);
    if (entry && now() - entry.first > windowMs) failures.delete(key);
    return failures.get(key);
  }

  return {
    isBlocked(key) {
      const entry = prune(key);
      return Boolean(entry && entry.count >= limit);
    },
    fail(key) {
      const entry = prune(key) ?? { first: now(), count: 0 };
      entry.count += 1;
      failures.set(key, entry);
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
