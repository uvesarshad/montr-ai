// Reddit API service - handles all Reddit fetching logic
const USER_AGENT = 'Montr/1.0 (by /u/uveskhan234)';

/**
 * Fetches Reddit post data from client-side
 * @param {string} url - Reddit post URL
 * @returns {Promise<Object>} - Clean post data
 */
export async function fetchRedditPost(url: string) {
  try {
    // Validate URL
    if (!isValidRedditUrl(url)) {
      throw new Error('Invalid Reddit URL. Please use a valid post URL (e.g., https://www.reddit.com/r/subreddit/comments/...).');
    }

    // Convert to JSON endpoint
    const jsonUrl = url.endsWith('.json') ? url : `${url.split('?')[0]}.json`;

    // Fetch from Reddit (client-side)
    const response = await fetch(jsonUrl, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status}. The post may be private, removed, or the URL is incorrect.`);
    }

    const rawData = await response.json();

    // Clean and return data
    return cleanRedditData(rawData);

  } catch (error: unknown) {
    console.error('Reddit fetch error:', error);
    throw new Error(`Failed to fetch Reddit post: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validates Reddit URL format
 */
function isValidRedditUrl(url: string): boolean {
  const redditPattern = /^https?:\/\/(www\.)?reddit\.com\/r\/[\w-]+\/(comments|s)\/[\w]+/;
  return redditPattern.test(url);
}

/**
 * Cleans raw Reddit API response to extract only needed data
 */
function cleanRedditData(rawData: unknown) {
  try {
    // Reddit response structure: [post, comments]
    const raw = rawData as Array<{ data?: { children?: Array<{ data?: Record<string, unknown> }> } }>;
    const postData = raw[0]?.data?.children?.[0]?.data;

    if (!postData) {
      throw new Error('Invalid Reddit data structure. Could not find post data.');
    }

    // Extract only the fields you need
    return {
      // Core content
      title: postData.title || '',
      content: postData.selftext || '',
      
      // Metadata
      author: postData.author || 'unknown',
      subreddit: postData.subreddit || '',
      url: `https://reddit.com${postData.permalink}`,
      
      // Engagement metrics
      score: postData.score || 0,
      upvoteRatio: postData.upvote_ratio || 0,
      commentsCount: postData.num_comments || 0,
      
      // Timestamps
      createdAt: new Date((postData.created_utc as number) * 1000).toISOString(),
      
      // Media (if exists)
      thumbnail: postData.thumbnail !== 'self' && postData.thumbnail !== 'default' 
        ? postData.thumbnail 
        : null,
      
      // Additional useful fields
      isVideo: postData.is_video || false,
      flair: postData.link_flair_text || null,
      
      // Raw URL for reference
      originalUrl: postData.url || '',
    };

  } catch (error: unknown) {
    console.error('Data cleaning error:', error);
    throw new Error('Failed to parse Reddit data');
  }
}

/**
 * Fetches Reddit comments (if needed later)
 */
export async function fetchRedditComments(url: string, limit = 10) {
  const jsonUrl = url.endsWith('.json') ? url : `${url.split('?')[0]}.json`;
  
  const response = await fetch(`${jsonUrl}?limit=${limit}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  
  const rawData = await response.json() as Array<{ data?: { children?: Array<{ kind: string; data: Record<string, unknown> }> } }>;
  const comments = rawData[1]?.data?.children || [];

  return comments
    .filter((c: { kind: string; data: Record<string, unknown> }) => c.kind === 't1') // Only actual comments
    .map((c: { kind: string; data: Record<string, unknown> }) => ({
      author: c.data.author,
      body: c.data.body,
      score: c.data.score,
      createdAt: new Date((c.data.created_utc as number) * 1000).toISOString(),
    }));
}
