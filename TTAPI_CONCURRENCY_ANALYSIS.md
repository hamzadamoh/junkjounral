# TTAPI Concurrency Limits Analysis

## ✅ Information Verification

The information you provided is **accurate** based on TTAPI's documentation. Here's how our current implementation compares:

## 📊 Current Implementation vs TTAPI Limits

### Our Current Settings:

| Setting | Current Value | TTAPI Limit | Status |
|---------|--------------|-------------|--------|
| **Concurrent `/imagine` requests** | 6 (2 accounts) or 3 (1 account) | 10 per key/account | ✅ **SAFE** |
| **Polling frequency** | 10 seconds | Not specified, but warns against high concurrency | ✅ **REASONABLE** |
| **Stagger delay** | 0-10 seconds (based on variation index) | Recommended to avoid simultaneous polling | ✅ **IMPLEMENTED** |
| **Webhooks** | ❌ Not used | ✅ Recommended | ⚠️ **COULD IMPROVE** |

### Code Location:

**File:** `App.tsx` (line 627)
```typescript
const maxConcurrent = assumedAccountCount * 3; // 2 accounts = 6, 1 account = 3
```

**File:** `services/ttapiService.ts` (line 695)
```typescript
initialDelay: number = 10000, // 10 seconds between polls
staggerDelay: number = 0 // Staggered to avoid simultaneous polling
```

## ✅ What We're Doing Right

1. **Under the 10-job limit**: We send 6 concurrent requests (for 2 accounts), which is well under the 10-job limit per key/account.

2. **Reasonable polling**: We poll every 10 seconds, which is not too aggressive.

3. **Staggered polling**: We use `staggerDelay` to spread out polling requests and avoid simultaneous fetches.

4. **Batch processing**: We process requests in batches and wait for each batch to complete before starting the next.

## ⚠️ Potential Improvements

### 1. **Consider Webhooks Instead of Polling**

**Current:** We use polling (`pollTaskUntilComplete`) which makes repeated fetch requests.

**Better:** Use TTAPI's webhook feature (`hookUrl` parameter) to get notified when jobs complete.

**Benefits:**
- No polling overhead
- Faster response (immediate notification)
- No risk of high concurrency fetch warnings
- More scalable

**Implementation:**
```typescript
// In sendTaskToTtapi, add hookUrl parameter
const data: any = {
  prompt: promptWithNegative,
  getUImages: true,
  hookUrl: `${process.env.VERCEL_URL || 'https://your-app.vercel.app'}/api/ttapi/webhook`
};
```

### 2. **Reduce Concurrent Requests if Needed**

If you experience issues, you could reduce from 6 to 5 concurrent requests per batch:

```typescript
const maxConcurrent = Math.min(assumedAccountCount * 3, 5); // Cap at 5
```

### 3. **Add Request Queue Manager**

For very large batches, consider implementing a proper queue that:
- Tracks active jobs
- Waits for jobs to complete before starting new ones
- Respects the 10-job limit strictly

## 📋 TTAPI Documentation Summary

### Key Points:

1. **Max 10 active jobs** per API key/account
   - "Active jobs" = jobs that are queued/executing in Midjourney
   - Not a traditional RPS limit
   - Jobs stay "active" until they complete (via webhook or fetch)

2. **High concurrency fetch warning**
   - Too many simultaneous `/fetch` requests may be flagged
   - Use webhooks instead when possible
   - Stagger polling if you must poll

3. **No published RPS limit**
   - TTAPI doesn't specify a numeric requests-per-second cap
   - Focus is on concurrent active jobs, not request rate

## 🎯 Recommendations

### Short Term (Current Implementation is Fine):

✅ **Keep current settings** - 6 concurrent requests is safe (under 10 limit)
✅ **Keep 10-second polling** - Reasonable frequency
✅ **Keep stagger delays** - Helps avoid simultaneous fetches

### Long Term (Optional Improvements):

1. **Implement webhooks** for better scalability
2. **Add queue manager** for very large batches (100+ images)
3. **Monitor for rate limit errors** and adjust if needed

## 🔍 How to Monitor

Watch for these signs that you're hitting limits:

1. **"Queue is full" errors** - Too many active jobs
2. **429 Rate Limit errors** - Too many fetch requests
3. **Delayed responses** - Jobs queued internally by TTAPI

If you see these, reduce `maxConcurrent` or implement webhooks.

## ✅ Conclusion

**Your current implementation is SAFE and within TTAPI's limits.**

- ✅ 6 concurrent requests < 10 limit
- ✅ 10-second polling is reasonable
- ✅ Stagger delays prevent simultaneous fetches
- ⚠️ Webhooks would be better, but polling works fine

**No immediate changes needed**, but webhooks would be a good future improvement for better scalability.

