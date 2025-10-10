/**
 * In-Memory Rate Limiter for API Endpoints
 * Uses sliding window algorithm with IP-based tracking
 * 
 * Note: Resets on serverless function cold starts, which is acceptable
 * for basic abuse prevention without external dependencies.
 */

// Store request timestamps per IP
// Structure: Map<IP, Array<timestamp>>
const requestLog = new Map();

// Cleanup interval (remove old entries every 5 minutes)
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if request is allowed under rate limit
 * @param {string} ip - Client IP address
 * @param {number} limit - Maximum requests allowed per hour
 * @returns {{ allowed: boolean, remaining: number, resetTime: number }}
 */
export function checkRateLimit(ip, limit) {
  const now = Date.now();
  const windowStart = now - 3600000; // 1 hour ago
  
  // Periodic cleanup of old entries
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    cleanupOldEntries(windowStart);
    lastCleanup = now;
  }
  
  // Get or create request log for this IP
  let timestamps = requestLog.get(ip) || [];
  
  // Remove timestamps outside the current window
  timestamps = timestamps.filter(ts => ts > windowStart);
  
  // Check if limit exceeded
  const allowed = timestamps.length < limit;
  
  if (allowed) {
    // Add current request timestamp
    timestamps.push(now);
    requestLog.set(ip, timestamps);
  }
  
  // Calculate remaining requests and reset time
  const remaining = Math.max(0, limit - timestamps.length);
  const oldestTimestamp = timestamps[0] || now;
  const resetTime = oldestTimestamp + 3600000; // Reset when oldest request expires
  
  return {
    allowed,
    remaining,
    resetTime: Math.ceil((resetTime - now) / 1000) // seconds until reset
  };
}

/**
 * Extract client IP from request object
 * Handles Vercel's forwarded headers
 * @param {Object} req - Request object
 * @returns {string} Client IP address
 */
export function getClientIp(req) {
  // Check Vercel's forwarded IP headers
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Take first IP if multiple (client IP is first in chain)
    return forwarded.split(',')[0].trim();
  }
  
  // Fallback to other headers
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }
  
  // Last resort: use connection remote address (usually not available in serverless)
  return req.connection?.remoteAddress || 'unknown';
}

/**
 * Apply rate limiting middleware to handler
 * @param {Function} handler - Request handler function
 * @param {number} limit - Requests per hour limit
 * @returns {Function} Wrapped handler with rate limiting
 */
export function withRateLimit(handler, limit) {
  return async (req, res) => {
    const ip = getClientIp(req);
    const { allowed, remaining, resetTime } = checkRateLimit(ip, limit);
    
    // Add rate limit headers to response
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetTime.toString());
    
    if (!allowed) {
      console.log(`[RateLimit] IP ${ip} exceeded limit of ${limit} requests/hour`);
      res.setHeader('Retry-After', resetTime.toString());
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again in ${Math.ceil(resetTime / 60)} minutes.`,
        retryAfter: resetTime,
        limit: limit
      });
    }
    
    // Request allowed, proceed to handler
    return handler(req, res);
  };
}

/**
 * Clean up old entries from request log
 * @param {number} cutoffTime - Remove entries older than this timestamp
 */
function cleanupOldEntries(cutoffTime) {
  let cleanedCount = 0;
  
  for (const [ip, timestamps] of requestLog.entries()) {
    const filtered = timestamps.filter(ts => ts > cutoffTime);
    
    if (filtered.length === 0) {
      // Remove IP completely if no recent requests
      requestLog.delete(ip);
      cleanedCount++;
    } else if (filtered.length < timestamps.length) {
      // Update with filtered timestamps
      requestLog.set(ip, filtered);
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[RateLimit] Cleaned up ${cleanedCount} expired IP entries`);
  }
}

// Export rate limit presets for common use cases
export const RATE_LIMITS = {
  ANALYSIS: 30,      // Expensive AI operations
  SUBSCRIPTION: 20,  // Write operations
  READ: 100,         // Read operations
  WEBHOOK: 50        // Webhook receivers
};

