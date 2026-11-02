export type WikiMentionMatch<T> = {
  from: number;
  to: number;
  article: T;
};

export function createWikiMentionMatcher<T extends { title: string }>(
  articles: readonly T[]
): (text: string) => WikiMentionMatch<T>[] {
  const articleByTitle = new Map<string, T>();
  for (const article of articles) {
    const title = article.title.trim();
    const key = title.toLowerCase();
    if (title && !articleByTitle.has(key)) articleByTitle.set(key, article);
  }

  const titles = [...articleByTitle.keys()].sort((a, b) => b.length - a.length);
  if (titles.length === 0) return () => [];

  const escapedTitles = titles.map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_])(${escapedTitles.join("|")})(?=$|[^\\p{L}\\p{N}_])`,
    "giu"
  );

  return (text) => {
    const matches: WikiMentionMatch<T>[] = [];
    for (const match of text.matchAll(pattern)) {
      const title = match[2].toLowerCase();
      const article = articleByTitle.get(title);
      if (!article || match.index === undefined) continue;
      const from = match.index + match[1].length;
      matches.push({ from, to: from + match[2].length, article });
    }
    return matches;
  };
}
