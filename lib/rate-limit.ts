interface Window {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private windows = new Map<string, Window>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(key: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (entry.count >= this.maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    entry.count++;
    return { allowed: true, remaining: this.maxRequests - entry.count };
  }
}

// 50 chat requests per hour per session
export const chatLimiter = new RateLimiter(50, 60 * 60 * 1000);

// 20 prep requests per hour per session
export const prepLimiter = new RateLimiter(20, 60 * 60 * 1000);
