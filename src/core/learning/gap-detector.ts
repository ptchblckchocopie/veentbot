import pg from 'pg';

interface DeclinedQuery {
  content: string;
  created_at: Date;
}

interface GapCluster {
  representativeQuestion: string;
  sampleQueries: string[];
  clusterSize: number;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Finds unanswered questions (Tier 3 declines) and clusters them
 * into knowledge gaps using embedding similarity.
 */
export async function detectGaps(
  pool: pg.Pool,
  embedFn: (text: string) => Promise<number[]>,
  options: { sinceDays?: number; minClusterSize?: number; similarityThreshold?: number } = {}
): Promise<GapCluster[]> {
  const { sinceDays = 30, minClusterSize = 2, similarityThreshold = 0.80 } = options;

  // Get all Tier 3 user messages (the question before the decline)
  const result = await pool.query(
    `SELECT cm_user.content, cm_user.created_at
     FROM chat_messages cm_decline
     JOIN chat_messages cm_user
       ON cm_user.session_id = cm_decline.session_id
       AND cm_user.role = 'user'
       AND cm_user.created_at < cm_decline.created_at
     WHERE cm_decline.role = 'assistant'
       AND cm_decline.tier = 'decline'
       AND cm_decline.created_at > now() - $1 * interval '1 day'
     ORDER BY cm_user.created_at DESC`,
    [sinceDays]
  );

  const queries: DeclinedQuery[] = result.rows;
  if (queries.length === 0) return [];

  // Deduplicate similar queries
  const uniqueQueries = deduplicateQueries(queries.map(q => q.content));

  // Embed all unique queries
  const embeddings: { text: string; embedding: number[] }[] = [];
  for (const text of uniqueQueries) {
    const embedding = await embedFn(text);
    embeddings.push({ text, embedding });
  }

  // Simple greedy clustering by cosine similarity
  const clusters = greedyCluster(embeddings, similarityThreshold);

  // Convert to gap clusters, filter by minimum size
  return clusters
    .filter(c => c.length >= minClusterSize)
    .map(cluster => {
      const size = cluster.length;
      return {
        representativeQuestion: cluster[0], // First item (most common-like)
        sampleQueries: cluster.slice(0, 10),
        clusterSize: size,
        priority: size >= 10 ? 'high' : size >= 5 ? 'medium' : 'low',
      };
    })
    .sort((a, b) => b.clusterSize - a.clusterSize);
}

function deduplicateQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const q of queries) {
    const normalized = q.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(q);
    }
  }
  return unique;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function greedyCluster(
  items: { text: string; embedding: number[] }[],
  threshold: number
): string[][] {
  const assigned = new Set<number>();
  const clusters: string[][] = [];

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;

    const cluster = [items[i].text];
    assigned.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      const sim = cosineSimilarity(items[i].embedding, items[j].embedding);
      if (sim >= threshold) {
        cluster.push(items[j].text);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}
