import { describe, expect, it } from 'vitest';
import {
  editDistance,
  initials,
  normalize,
  queryWords,
  rankColleges,
  scoreCollege,
  type SearchableCollege,
} from './college-search.js';

const college = (name: string, extra: Partial<SearchableCollege> = {}): SearchableCollege => ({
  name,
  shortName: null,
  city: 'Pune',
  address: null,
  ...extra,
});

const PICT = college("SCTR's Pune Institute of Computer Technology", {
  address: 'Sr.No. 27, Pune-Satara Road, Dhankawadi, Pune',
});
const COEP = college('College of Engineering Pune', { address: 'Wellesley Road, Shivajinagar' });
const DYP = college("Dr. D. Y. Patil Pratishthan's D.Y.Patil College of Engineering Akurdi, Pune", {
  address: 'Sector 29, Nigdi Pradhikaran, Akurdi, Pune',
});
const CUMMINS = college("MKSSS's Cummins College of Engineering for Women, Pune", {
  address: 'Karvenagar, Pune',
});
const FERGUSSON = college('Fergusson College', { address: 'F.C. Road, Shivajinagar, Pune' });
const BARAMATI = college('Tuljaram Chaturchand College Baramati', { city: 'Baramati' });
const ALL = [PICT, COEP, DYP, CUMMINS, FERGUSSON, BARAMATI];

const names = (q: string) => rankColleges(q, ALL).map((match) => match.college.name);

describe('normalize', () => {
  it('drops case, accents and punctuation, and joins initials', () => {
    expect(normalize("Dr. D. Y. Patil's College")).toBe('dr dy patil college');
    expect(normalize('S.M.Joshi College, Hadapsar')).toBe('sm joshi college hadapsar');
    expect(normalize('Café  Nagar')).toBe('cafe nagar');
  });
});

describe('queryWords', () => {
  it('keeps only words worth searching', () => {
    expect(queryWords('College of Engineering')).toEqual(['college', 'engineering']);
    expect(queryWords("' OR 1=1 --")).toEqual([]);
    expect(queryWords('%')).toEqual([]);
  });
});

describe('initials', () => {
  it('reads initials with and without stopwords, and keeps initials words whole', () => {
    expect(initials('College of Engineering Pune')).toEqual(['coep', 'cep']);
    expect(initials('Pune Institute of Computer Technology')).toContain('pict');
    expect(initials("SCTR's Pune Institute of Computer Technology")).toContain('pict');
    expect(initials('Dr. D. Y. Patil College')).toContain('drdypc');
  });
});

describe('editDistance', () => {
  it('counts edits, a swap as one, and stops past the limit', () => {
    expect(editDistance('fergusson', 'fergusson', 2)).toBe(0);
    expect(editDistance('fergason', 'fergusson', 2)).toBe(2);
    expect(editDistance('cummnis', 'cummins', 1)).toBe(1);
    expect(editDistance('abc', 'xyzxyz', 1)).toBe(2);
  });
});

describe('rankColleges', () => {
  it('finds a college by its initials', () => {
    expect(names('pict')[0]).toBe(PICT.name);
    expect(names('COEP')[0]).toBe(COEP.name);
    expect(names('dyp')[0]).toBe(DYP.name);
  });

  it('matches initials from the start only', () => {
    const isbm = college('ISBM College Of Engineering Pune');
    expect(rankColleges('coep', [COEP, isbm]).map((match) => match.college.name)).toEqual([
      COEP.name,
    ]);
  });

  it('finds words in any order, across the name, city and address', () => {
    expect(names('akurdi dy patil')).toEqual([DYP.name]);
    expect(names('engineering karvenagar')).toEqual([CUMMINS.name]);
    expect(names('dhankawadi')).toEqual([PICT.name]);
    expect(names('baramati')).toEqual([BARAMATI.name]);
  });

  it('matches the start of a word and part of a word', () => {
    expect(names('fergu')).toEqual([FERGUSSON.name]);
    expect(names('cumm')).toEqual([CUMMINS.name]);
  });

  it('needs every word: one unknown word means no match', () => {
    expect(names('fergusson zzzz')).toEqual([]);
  });

  it('forgives small typos only when nothing matches exactly', () => {
    expect(names('fergason')).toEqual([FERGUSSON.name]);
    expect(names('cumins')).toEqual([CUMMINS.name]);
    expect(names('enginering')).toEqual(expect.arrayContaining([COEP.name, DYP.name, CUMMINS.name]));
  });

  it('ranks a name that starts with the search first', () => {
    expect(names('college of engineering')[0]).toBe(COEP.name);
  });

  it('matches nothing for text with no searchable word', () => {
    for (const q of ['%', '_', "' OR 1=1 --", '\\', '  ']) expect(names(q)).toEqual([]);
  });

  it('scores 0 for a non-match', () => {
    expect(scoreCollege('pict', BARAMATI)).toBe(0);
  });
});
