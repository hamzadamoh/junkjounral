import { NextRequest, NextResponse } from 'next/server';
import { createMidjourneyTask, waitForTaskCompletion, getAvailableAccountCount } from '@/lib/midjourney';
import { buildPrompt } from '@/lib/prompts';
import { GenerationSettings } from '@/lib/types';

// In-memory storage for generated pages (in production, use a database)
const jobStorage = new Map<string, { pages: string[]; settings: GenerationSettings; createdAt: string }>();

export async function POST(request: NextRequest) {
  try {
    const settings: GenerationSettings = await request.json();

    // Validate settings
    if (!settings.themeId || settings.pageCount < 20 || settings.pageCount > 500) {
      return NextResponse.json(
        { error: 'Invalid settings' },
        { status: 400 }
      );
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const pages: string[] = [];

    // Generate pages (in production, this should be done in a background job)
    // Note: Midjourney generation takes longer, so we limit to fewer pages
    const maxPages = Math.min(settings.pageCount, 5); // Limit for demo (Midjourney is slower)
    
    const aspectRatio = '4:3'; // Default for journal pages
    const mode = settings.midjourneyMode || 'fast';
    
    // Calculate dynamic batch size based on available accounts
    // With multiple accounts, we can send more parallel requests
    // Formula: accounts × 3 (e.g., 2 accounts = 6 parallel requests)
    // For fast mode, only count accounts with Fast Time available
    const accountCount = await getAvailableAccountCount(mode);
    const batchSize = accountCount * 3;
    console.log(`[Batch] Using batch size of ${batchSize} (${accountCount} account(s) available for ${mode} mode)`);
    
    for (let batchStart = 0; batchStart < maxPages; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, maxPages);
      const batchTasks: Promise<{ taskId: string; index: number }>[] = [];
      
      // Create tasks in parallel for this batch
      for (let i = batchStart; i < batchEnd; i++) {
        try {
          const prompt = buildPrompt(settings);
          const taskPromise = createMidjourneyTask({
            prompt,
            aspect_ratio: aspectRatio,
            process_mode: mode,
          }).then(taskId => ({ taskId, index: i }));
          
          batchTasks.push(taskPromise);
        } catch (error) {
          console.error(`Error creating task for page ${i + 1}:`, error);
        }
      }
      
      // Wait for all tasks in batch to be created
      const createdTasks = await Promise.allSettled(batchTasks);
      
      // Now poll each task individually until completion
      const pagePromises = createdTasks.map(async (result, batchIndex) => {
        if (result.status === 'rejected') {
          console.error(`Task creation failed for page ${batchStart + batchIndex + 1}:`, result.reason);
          return null;
        }
        
        const { taskId, index } = result.value;
        console.log(`Created Midjourney task ${index + 1} (${mode} mode): ${taskId}`);
        
        try {
          // Poll this specific task until completion
          const imageUrl = await waitForTaskCompletion(taskId);
          return { imageUrl, index };
        } catch (error) {
          console.error(`Error waiting for task ${taskId} (page ${index + 1}):`, error);
          return null;
        }
      });
      
      // Wait for all pages in this batch to complete
      const batchResults = await Promise.allSettled(pagePromises);
      
      // Collect successful results
      batchResults.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled' && result.value) {
          const { imageUrl, index } = result.value;
          pages[index] = imageUrl; // Store at correct index
        }
      });
    }
    
    // Filter out any null values and maintain order
    const finalPages = pages.filter(url => url !== null && url !== undefined) as string[];

    // Store job
    jobStorage.set(jobId, {
      pages: finalPages,
      settings,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      jobId,
      pages: finalPages,
      status: 'completed',
    });
  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate pages' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
  }

  const job = jobStorage.get(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(job);
}

