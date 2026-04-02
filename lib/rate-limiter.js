import { templateMeta } from "./metadata.js";

export const rateStore = new Map();

function checkRateLimit(key, max, windowMs) {
  const now = Date.now();

  if (!rateStore.has(key)) {
    rateStore.set(key, {
      count: 1,
      reset: now + windowMs
    });
    return true;
  }

  const entry = rateStore.get(key);

  if (now > entry.reset) {
    entry.count = 1;
    entry.reset = now + windowMs;
    return true;
  }

  if (entry.count >= max) {
    return false;
  }

  entry.count++;
  return true;
}


//check if rate limit for the client has exceeded
export function rateLimitExceeded(rel, req) {
  const meta = templateMeta.get(rel);
  if (meta?.rateLimit){
    const max = Number(meta.rateLimit) || 10;
    const windowMs = 60_000;
  
    const key = rel + ":" + req.ip;
  
    const allowed = checkRateLimit(key, max, windowMs);
  
    if (!allowed) {
      return true;
    } else {
      return false;
    }
  }

  return false;
}