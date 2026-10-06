/**
 * Forgiving college search. Students type "pict", "dy patil akurdi", "coep", "kothrud engineering"
 * or "fergason": every word they type must be found somewhere in the college's name, short name,
 * city or address, as a whole word, the start of a word, part of a word, or the initials of the name.
 * Only when nothing matches that way are small typos forgiven, so a correctly spelt search never
 * drowns in near misses.
 *
 * Pure functions over rows already read: the directory has hundreds of colleges, not millions.
 */

/** Words that carry no meaning in a search ("college of engineering" = "college engineering"). */
const STOPWORDS = new Set(['of', 'and', 'the', 'or', 'for', 'in', 'at', 'to', 's']);

/** Lower case, accents and punctuation gone, and "D. Y." / "D.Y." / "DY" all become "dy". */
export function normalize(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’`]s\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      // Runs of single letters are initials: "d y patil" → "dy patil", "s m joshi" → "sm joshi".
      .replace(/\b(?:[a-z] )+[a-z]\b/g, (run) => run.replace(/ /g, ''))
      .trim()
  );
}

export function words(text: string | null | undefined): string[] {
  return text ? normalize(text).split(' ').filter(Boolean) : [];
}

/** The search words: no stopwords, nothing shorter than two characters. */
export function queryWords(q: string): string[] {
  return words(q).filter((word) => word.length >= 2 && !STOPWORDS.has(word));
}

/**
 * Initials of a name, with and without stopwords ("College of Engineering Pune" → "coep", "cep"),
 * and again without the trust in front ("SCTR's Pune Institute of Computer Technology" → "pict").
 * A short word without vowels is itself initials ("dy" in "D.Y. Patil").
 */
export function initials(name: string): string[] {
  const letters = (list: string[]) =>
    list.map((word) => (word.length <= 3 && !/[aeiou]/.test(word) ? word : word[0])).join('');
  const variants = (text: string) => {
    const all = words(text);
    return [letters(all), letters(all.filter((word) => !STOPWORDS.has(word)))];
  };
  const core = name.split(/['’]s\b|\b(?:society|trust|mandal|sanstha|foundation)\b/i).pop() ?? name;
  return [...new Set([...variants(name), ...variants(core)])].filter(Boolean);
}

/** Edit distance with transpositions ("fergsuon"), giving up once it passes `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous2: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, previous2[j - 2]! + 1);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    previous2 = previous;
    previous = current;
  }
  return previous[b.length]!;
}

/** How many typos a word of this length may have. */
const typoAllowance = (length: number) => (length >= 7 ? 2 : length >= 4 ? 1 : 0);

export interface SearchableCollege {
  name: string;
  shortName: string | null;
  city: string;
  address: string | null;
}

interface Indexed {
  fields: Array<{ words: string[]; weight: number }>;
  initials: string[];
  name: string;
}

function index(college: SearchableCollege): Indexed {
  return {
    fields: [
      { words: words(college.name), weight: 1 },
      { words: words(college.shortName), weight: 1 },
      { words: words(college.city), weight: 0.8 },
      { words: words(college.address), weight: 0.6 },
    ],
    initials: [...initials(college.name), ...(college.shortName ? [normalize(college.shortName).replace(/ /g, '')] : [])],
    name: normalize(college.name),
  };
}

/** The best match of one search word in a college, as points (0 = not found). */
function wordScore(word: string, college: Indexed, typos: boolean): number {
  let best = 0;
  for (const field of college.fields)
    for (const candidate of field.words) {
      let points = 0;
      if (candidate === word) points = 10;
      else if (candidate.startsWith(word)) points = 7;
      else if (word.length >= 3 && candidate.includes(word)) points = 4;
      else if (typos) {
        const allowed = typoAllowance(word.length);
        if (allowed && editDistance(word, candidate, allowed) <= allowed) points = 3;
        // A typo in the start of a longer word: "enginer" for "engineering".
        else if (
          allowed &&
          candidate.length > word.length &&
          editDistance(word, candidate.slice(0, word.length), 1) <= 1
        )
          points = 2;
      }
      best = Math.max(best, points * field.weight);
    }
  // Initials: "pict" = Pune Institute of Computer Technology, "sppu", "coep", "dyp" (from the start).
  if (word.length >= 3 && college.initials.some((letters) => letters.startsWith(word)))
    best = Math.max(best, college.initials.some((letters) => letters === word) ? 9 : 6);
  return best;
}

/** Points for one college against the search words, or 0 when any word is missing. */
export function scoreCollege(q: string, college: SearchableCollege, typos = false): number {
  const search = queryWords(q);
  if (search.length === 0) return 0;
  const indexed = index(college);
  let total = 0;
  for (const word of search) {
    const points = wordScore(word, indexed, typos);
    if (points === 0) return 0;
    total += points;
  }
  // The name itself starting with, or containing, the whole phrase ranks highest.
  const phrase = search.join(' ');
  if (indexed.name.startsWith(phrase)) total += 6;
  else if (` ${indexed.name} `.includes(` ${phrase} `)) total += 3;
  return total;
}

/**
 * The colleges matching `q`, best first (ties by name). Strict matches only; if there are none,
 * the same search again forgiving small typos. Text with no searchable word ("%", "' OR 1=1")
 * matches nothing.
 */
export function rankColleges<T extends SearchableCollege>(
  q: string,
  colleges: readonly T[],
): Array<{ college: T; score: number }> {
  if (queryWords(q).length === 0) return [];
  const run = (typos: boolean) =>
    colleges
      .map((college) => ({ college, score: scoreCollege(q, college, typos) }))
      .filter((match) => match.score > 0);
  const strict = run(false);
  const matches = strict.length > 0 ? strict : run(true);
  return matches.sort(
    (a, b) =>
      b.score - a.score ||
      a.college.name.localeCompare(b.college.name, 'en', { sensitivity: 'base' }),
  );
}
