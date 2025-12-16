const GOAPI_BASE_URL = 'https://api.goapi.ai';
const GOAPI_IMAGINE_URL = `${GOAPI_BASE_URL}/mj/v2/imagine`;
const GOAPI_TASK_URL = `${GOAPI_BASE_URL}/api/v1/task`;

// TTAPI endpoints
const TTAPI_BASE_URL = 'https://ttapi.io';
const TTAPI_IMAGINE_URL = `${TTAPI_BASE_URL}/api/midjourney/imagine`;
const TTAPI_TASK_URL = `${TTAPI_BASE_URL}/api/midjourney/task`;

export interface GenerateImageOptions {
  prompt: string;
  aspect_ratio?: string;
  process_mode?: string;
  image_url?: string; // Optional image URL for image prompts
  account_id?: string; // Optional: TTAPI account ID for multi-account support
}

export interface TaskResponse {
  status: string;
  task_id?: string;
  message?: string;
}

export interface TaskStatus {
  code: number;
  data: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    output?: {
      image_urls: string[];
    };
    progress?: number;
  };
  message?: string;
}

export interface TTAPIAccount {
  id: string;
  hasFastTime?: boolean; // Whether account has Fast Time credits available
  status?: string;
  [key: string]: any; // Allow other account properties
}

/**
 * Get available TTAPI accounts with their details (for multi-account support)
 */
export async function getTTAPIAccounts(apiKey: string): Promise<TTAPIAccount[]> {
  try {
    const response = await fetch(`${TTAPI_BASE_URL}/api/midjourney/accounts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      // Map accounts and try to extract Fast Time status
      const accounts = (data.accounts || data.data || []).map((acc: any) => ({
        id: acc.id || acc.account_id,
        hasFastTime: acc.fast_time_remaining > 0 || acc.has_fast_time || acc.fast_hours > 0,
        status: acc.status,
        ...acc, // Include all other properties
      }));
      return accounts;
    }
  } catch (error) {
    console.warn('Could not fetch TTAPI accounts:', error);
  }
  return [];
}

/**
 * Get account IDs only (backward compatibility)
 */
export async function getTTAPIAccountIds(apiKey: string): Promise<string[]> {
  const accounts = await getTTAPIAccounts(apiKey);
  return accounts.map(acc => acc.id);
}

/**
 * Get the number of available accounts for batch size calculation
 */
export async function getAvailableAccountCount(mode: 'fast' | 'relaxed' = 'fast'): Promise<number> {
  const ttapiKey = process.env.TTAPI_API_KEY;
  
  if (ttapiKey) {
    const accounts = await getTTAPIAccounts(ttapiKey);
    
    // If fast mode, only count accounts with Fast Time available
    if (mode === 'fast') {
      const accountsWithFastTime = accounts.filter(acc => acc.hasFastTime);
      return Math.max(accountsWithFastTime.length || accounts.length, 1);
    }
    
    return Math.max(accounts.length, 1); // At least 1 account
  }
  
  // For GoAPI or no TTAPI, default to 1 account
  return 1;
}

/**
 * Select an account for load balancing (smart selection based on Fast Time)
 */
let accountRotationIndex = 0;
async function selectTTAPIAccount(
  apiKey: string, 
  preferredAccountId?: string,
  mode: 'fast' | 'relaxed' = 'fast'
): Promise<string | null> {
  // If a specific account is requested, use it
  if (preferredAccountId) {
    return preferredAccountId;
  }

  // Get available accounts with their details
  const accounts = await getTTAPIAccounts(apiKey);
  if (accounts.length === 0) {
    return null; // No accounts available, TTAPI will use default
  }

  // If fast mode, prioritize accounts with Fast Time available
  if (mode === 'fast') {
    const accountsWithFastTime = accounts.filter(acc => acc.hasFastTime);
    
    if (accountsWithFastTime.length > 0) {
      // Use round-robin among accounts with Fast Time
      const selectedAccount = accountsWithFastTime[accountRotationIndex % accountsWithFastTime.length];
      accountRotationIndex++;
      console.log(`[TTAPI] Selected account with Fast Time: ${selectedAccount.id}`);
      return selectedAccount.id;
    } else {
      // No Fast Time available, use any account (will fall back to Relaxed)
      console.warn(`[TTAPI] No accounts with Fast Time available, using any account`);
      const selectedAccount = accounts[accountRotationIndex % accounts.length];
      accountRotationIndex++;
      return selectedAccount.id;
    }
  } else {
    // Relaxed mode - use any account
    const selectedAccount = accounts[accountRotationIndex % accounts.length];
    accountRotationIndex++;
    return selectedAccount.id;
  }
}

/**
 * Send a task to Midjourney via GoAPI or TTAPI
 */
export async function createMidjourneyTask(options: GenerateImageOptions): Promise<string> {
  // Check which API provider to use
  const ttapiKey = process.env.TTAPI_API_KEY;
  const goapiKey = process.env.GOAPI_API_KEY || process.env.MIDJOURNEY_API_KEY;
  
  // Prefer TTAPI if available, otherwise use GoAPI
  const useTTAPI = !!ttapiKey;
  const apiKey = useTTAPI ? ttapiKey : goapiKey;
  
  if (!apiKey) {
    throw new Error('TTAPI_API_KEY or GOAPI_API_KEY or MIDJOURNEY_API_KEY environment variable is required');
  }

  if (useTTAPI) {
    // TTAPI implementation with multi-account support
    const mode = (options.process_mode || 'fast') as 'fast' | 'relaxed';
    const accountId = await selectTTAPIAccount(apiKey, options.account_id, mode);
    
    const payload: any = {
      prompt: options.prompt,
      aspect_ratio: options.aspect_ratio || '4:3',
      mode: mode,
    };

    // Add account_id if available (for Hold Account Mode)
    if (accountId) {
      payload.account_id = accountId;
      console.log(`[TTAPI] Using account: ${accountId}`);
    }

    // Add image URL if provided (for image prompts)
    if (options.image_url) {
      payload.prompt = `${options.image_url} ${options.prompt}`;
    }

    try {
      const response = await fetch(TTAPI_IMAGINE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTAPI request failed: ${response.status} ${errorText}`);
      }

      const json: TaskResponse = await response.json();

      if (json.status === 'success' && json.task_id) {
        return json.task_id;
      } else {
        throw new Error(json.message || 'Failed to create Midjourney task');
      }
    } catch (error) {
      console.error('Error creating Midjourney task via TTAPI:', error);
      throw new Error(`Failed to create Midjourney task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // GoAPI implementation (original)
    const payload: any = {
      prompt: options.prompt,
      aspect_ratio: options.aspect_ratio || '4:3',
      process_mode: options.process_mode || 'fast',
      skip_prompt_check: true,
      webhook_endpoint: '',
      webhook_secret: '',
      notify_progress: true,
    };

    // Add image URL if provided (for image prompts)
    if (options.image_url) {
      payload.prompt = `${options.image_url} ${options.prompt}`;
    }

    try {
      const response = await fetch(GOAPI_IMAGINE_URL, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GoAPI request failed: ${response.status} ${errorText}`);
      }

      const json: TaskResponse = await response.json();

      if (json.status === 'success' && json.task_id) {
        return json.task_id;
      } else {
        throw new Error(json.message || 'Failed to create Midjourney task');
      }
    } catch (error) {
      console.error('Error creating Midjourney task via GoAPI:', error);
      throw new Error(`Failed to create Midjourney task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Check the status of a Midjourney task
 */
export async function checkTaskStatus(taskId: string): Promise<TaskStatus> {
  const ttapiKey = process.env.TTAPI_API_KEY;
  const goapiKey = process.env.GOAPI_API_KEY || process.env.MIDJOURNEY_API_KEY;
  
  const useTTAPI = !!ttapiKey;
  const apiKey = useTTAPI ? ttapiKey : goapiKey;
  
  if (!apiKey) {
    throw new Error('TTAPI_API_KEY or GOAPI_API_KEY or MIDJOURNEY_API_KEY environment variable is required');
  }

  try {
    const url = useTTAPI ? `${TTAPI_TASK_URL}/${taskId}` : `${GOAPI_TASK_URL}/${taskId}`;
    const headers = useTTAPI 
      ? { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      : { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' };

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${useTTAPI ? 'TTAPI' : 'GoAPI'} request failed: ${response.status} ${errorText}`);
    }

    const json: TaskStatus = await response.json();
    return json;
  } catch (error) {
    console.error('Error checking task status:', error);
    throw new Error(`Failed to check task status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Poll a task until it's completed and return the image URL
 */
export async function waitForTaskCompletion(
  taskId: string,
  maxWaitTime: number = 300000, // 5 minutes default
  pollInterval: number = 5000 // 5 seconds default
): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const status = await checkTaskStatus(taskId);

    if (status.code === 200 && status.data) {
      if (status.data.status === 'completed' && status.data.output?.image_urls?.[0]) {
        // Return the full image URL
        return status.data.output.image_urls[0];
      } else if (status.data.status === 'failed') {
        throw new Error('Midjourney task failed');
      }
      // Task is still pending or processing, wait and poll again
      console.log(`Task ${taskId} status: ${status.data.status}, progress: ${status.data.progress || 0}%`);
    } else {
      console.warn(`Unexpected status response for task ${taskId}:`, status);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Task did not complete within the maximum wait time');
}

/**
 * Generate a journal page using Midjourney
 */
export async function generateJournalPage(
  prompt: string,
  aspectRatio: string = '4:3',
  additionalParams: string = '',
  mode: 'fast' | 'relaxed' = 'fast'
): Promise<string> {
  // Combine prompt with additional parameters
  const fullPrompt = additionalParams ? `${prompt} ${additionalParams}` : prompt;

  // Create the task
  const taskId = await createMidjourneyTask({
    prompt: fullPrompt,
    aspect_ratio: aspectRatio,
    process_mode: mode,
  });

  console.log(`Created Midjourney task (${mode} mode): ${taskId}`);

  // Wait for completion and return the image URL
  const imageUrl = await waitForTaskCompletion(taskId);
  return imageUrl;
}

