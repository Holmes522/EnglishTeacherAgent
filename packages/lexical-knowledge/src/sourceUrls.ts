/** Canonical raw per-headword path; this function never fetches the URL. */
export function kaikkiSampleUrl(query: string) {
  const word = query.normalize("NFKC").trim().toLowerCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '-]{0,199}$/u.test(word))
    throw new Error("INVALID_QUERY");
  const chars = [...word];
  return `https://kaikki.org/dictionary/English/meaning/${encodeURIComponent(chars[0]!)}/${encodeURIComponent(chars.slice(0, 2).join(""))}/${encodeURIComponent(word)}.jsonl`;
}
