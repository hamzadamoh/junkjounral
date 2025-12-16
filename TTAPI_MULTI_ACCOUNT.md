# TTAPI Multi-Account Support

## Overview

This project now supports **TTAPI** with multiple Midjourney accounts using a single API key. TTAPI's "Hold Account Mode" allows you to manage multiple Midjourney/Discord accounts through one API.

## How It Works

### Automatic Account Selection

The system automatically:
1. **Detects available accounts** from your TTAPI dashboard
2. **Rotates between accounts** using round-robin load balancing
3. **Distributes tasks** across accounts to prevent rate limiting
4. **Falls back gracefully** if account detection fails

### Account Rotation

When you generate multiple pages:
- Page 1 → Account A
- Page 2 → Account B  
- Page 3 → Account C
- Page 4 → Account A (cycles back)

This ensures even distribution of workload across all your accounts.

## Setup Instructions

### 1. Get Your TTAPI API Key

1. Sign up at [ttapi.io](https://ttapi.io)
2. Navigate to your dashboard
3. Copy your API key

### 2. Enable Hold Account Mode

1. In TTAPI dashboard, enable "Hold Account Mode"
2. Bind your Discord/Midjourney accounts
3. Configure account settings (active times, speed modes, etc.)

### 3. Configure Environment Variable

Add to `.env.local`:
```bash
TTAPI_API_KEY=your_ttapi_api_key_here
```

### 4. Verify Setup

The system will automatically:
- Use TTAPI if `TTAPI_API_KEY` is set
- Fall back to GoAPI if TTAPI is not available
- Log which account is being used: `[TTAPI] Using account: {account_id}`

## API Endpoints

The implementation uses:
- **Create Task**: `POST https://ttapi.io/api/midjourney/imagine`
- **Check Status**: `GET https://ttapi.io/api/midjourney/task/{task_id}`
- **List Accounts**: `GET https://ttapi.io/api/midjourney/accounts`

## Request Format

### Create Task (TTAPI)

```json
{
  "prompt": "Gothic Victorian junk journal page...",
  "aspect_ratio": "4:3",
  "mode": "fast",
  "account_id": "optional_account_id"  // Auto-selected if not provided
}
```

### Response

```json
{
  "status": "success",
  "task_id": "abc123..."
}
```

## Benefits of Multi-Account Support

1. **Higher Throughput**: Generate more images simultaneously
2. **Rate Limit Avoidance**: Distribute requests across accounts
3. **Fault Tolerance**: If one account has issues, others continue
4. **Load Balancing**: Automatic distribution prevents overload

## Manual Account Selection

If you need to use a specific account for a task, you can pass `account_id` in the options:

```typescript
await createMidjourneyTask({
  prompt: "your prompt",
  account_id: "specific_account_id"  // Use this account
});
```

## Troubleshooting

### No Accounts Detected

If you see warnings about no accounts:
- Verify Hold Account Mode is enabled in TTAPI dashboard
- Check that accounts are properly bound
- Ensure your API key has the correct permissions

### Account Rotation Not Working

- Check console logs for `[TTAPI] Using account: ...` messages
- Verify multiple accounts are bound in TTAPI
- The system will use default account if rotation fails

### Rate Limit Issues

- Ensure accounts are properly configured in TTAPI
- Check account active time ranges
- Verify speed mode settings per account

## Important Warnings

⚠️ **Terms of Service**: Operating multiple Midjourney accounts may violate Midjourney's Terms of Service. TTAPI implements technical measures to reduce ban risk, but use at your own discretion.

⚠️ **Account Bans**: There is a risk of account bans when using multiple accounts. TTAPI provides tools to mitigate this, but cannot guarantee account safety.

## Comparison: TTAPI vs GoAPI

| Feature | TTAPI | GoAPI |
|---------|-------|-------|
| Multi-Account Support | ✅ Yes (Hold Account Mode) | ❌ No |
| Account Rotation | ✅ Automatic | ❌ N/A |
| Rate Limit Handling | ✅ Better (distributed) | ⚠️ Single account |
| Setup Complexity | Medium | Low |
| Cost | Varies by plan | Varies by plan |

## Migration from GoAPI

If you're currently using GoAPI and want to switch to TTAPI:

1. Get your TTAPI API key
2. Set `TTAPI_API_KEY` in environment variables
3. Remove or keep `GOAPI_API_KEY` (TTAPI takes priority)
4. The system will automatically use TTAPI

No code changes needed - it's fully backward compatible!

