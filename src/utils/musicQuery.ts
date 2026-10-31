export interface ParsedMusicQuery {
  searchQuery: string;
  detectedArtist?: string;
  descriptiveType?: 'popular' | 'latest' | 'best' | 'mood' | 'general';
  displayName: string;
  isDescriptive: boolean;
}

/**
 * Known top signature hits for world-famous and top Indonesian artists.
 * Used as an ultra-fast, rock-solid fallback when external search or network fails.
 */
export const TOP_ARTIST_SIGNATURE_HITS: Record<string, string> = {
  'alan walker': 'Faded',
  'coldplay': 'Yellow',
  'bruno mars': 'Just the Way You Are',
  'tulus': 'Hati-Hati di Jalan',
  'taylor swift': 'Cruel Summer',
  'ed sheeran': 'Shape of You',
  'sheila on 7': 'Dan',
  'ariana grande': '7 rings',
  'billie eilish': 'bad guy',
  'the weeknd': 'Blinding Lights',
  'dua lipa': 'Levitating',
  'queen': 'Bohemian Rhapsody',
  'avicii': 'Wake Me Up',
  'maroon 5': 'Sugar',
  'imagine dragons': 'Believer',
  'justin bieber': 'Ghost',
  'adele': 'Someone Like You',
  'tiara andini': 'Janji Setia',
  'mahalini': 'Sial',
  'judika': 'Putus Atau Terus',
  'dewa 19': 'Kangen',
  'noah': 'Separuh Aku',
  'peterpan': 'Mungkin Nanti',
  'pamungkas': 'To the Bone',
  'nadin amizah': 'Rayuan Perempuan Gila',
  'hindia': 'Evaluasi',
};

/**
 * Checks whether a text contains raw descriptive prompt phrases rather than a real song title.
 * Designed carefully to NEVER trigger false positives on legitimate titles containing 'dari'
 * (e.g. "Pesan Dari Hati", "Surat Dari Desa", "Bidadari Dari Surga").
 */
export function hasDescriptiveKeywords(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  return (
    /\b(?:yang\s+)?(?:paling\s+)?(?:populer|terpopuler|terkenal|terfavorit|terbaik|terbaru|viral|hits?)\b/i.test(t) ||
    /\b(?:lagu|musik)\s+(?:populer|terpopuler|terkenal|terfavorit|terbaik|terbaru|hits|viral)\b/i.test(t) ||
    /\b(?:populer|terpopuler|terkenal|terfavorit|terbaik|terbaru|hits)\s+(?:dari|oleh|milik|ciptaan|by)\b/i.test(t) ||
    /^(?:putar|puter|setel|stel|mainkan|play)\s+/i.test(t) ||
    /^(?:dari|oleh|milik|by)\s+.+?\s+(?:yang\s+)?(?:populer|terpopuler|terkenal|hits|terbaik|terbaru)/i.test(t)
  );
}

/**
 * Parses user input for music requests and extracts artist and intent from descriptive phrases.
 * Examples:
 * - "yang populer oleh alan walker" -> detectedArtist: "Alan Walker", searchQuery: "Alan Walker"
 * - "puter lagunya alan walker yang populer" -> detectedArtist: "Alan Walker", searchQuery: "Alan Walker"
 * - "lagunya alan walker" -> detectedArtist: "Alan Walker", searchQuery: "Alan Walker"
 * - "lagu terbaru dari tulus" -> detectedArtist: "Tulus", searchQuery: "Tulus", descriptiveType: "latest"
 * - "faded alan walker" -> searchQuery: "faded alan walker", isDescriptive: false
 */
export function parseMusicQuery(raw: string): ParsedMusicQuery {
  let q = (raw || '').trim();

  // Strip leading speech / polite command prefixes
  q = q.replace(
    /^(?:tolong\s+)?(?:dengerin|dengarkan|carikan|cariin|puterin|putarkan|putar|puter|setelin|setelkan|setel|stel|mainkan|mainin|play)\s+/i,
    ''
  );

  // Check if query had a song/music prefix (including Indonesian possessives/plurals)
  const hadSongPrefix =
    /^(?:lagu-lagunya|lagu-lagu|lagu2nya|lagu2|musik-musiknya|musik-musik|musik2|lagunya|musiknya|lagu\s+nya|musik\s+nya|lagu|musik|music|song|track)\s+/i.test(
      q
    );
  q = q.replace(
    /^(?:lagu-lagunya|lagu-lagu|lagu2nya|lagu2|musik-musiknya|musik-musik|musik2|lagunya|musiknya|lagu\s+nya|musik\s+nya|lagu|musik|music|song|track)\s+/i,
    ''
  );
  q = q.trim();

  // Determine descriptive preference
  let descriptiveType: 'popular' | 'latest' | 'best' | 'mood' | 'general' = 'general';
  if (/\b(?:populer|terpopuler|terkenal|viral|hits?|top|favorit|terfavorit)\b/i.test(q)) {
    descriptiveType = 'popular';
  } else if (/\b(?:terbaru|latest|newest|baru)\b/i.test(q)) {
    descriptiveType = 'latest';
  } else if (/\b(?:terbaik|best|greatest|enak|terbagus)\b/i.test(q)) {
    descriptiveType = 'best';
  }

  // Helper to cleanly extract and title-case artist names
  const cleanArtist = (str: string) =>
    str
      .replace(
        /^(?:lagu-lagunya|lagu-lagu|lagu2nya|lagu2|musik-musiknya|musik-musik|musik2|lagunya|musiknya|lagu|musik|artis|penyanyi|band|si)\s+/i,
        ''
      )
      .trim()
      .split(/\s+/)
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ');

  // 1. Pattern: (yang) (paling) (populer|terbaru|terbaik|hits|enak) oleh/dari/milik/by <artist>
  // e.g. "yang populer oleh alan walker", "terbaru dari tulus", "hits by coldplay"
  let m = q.match(
    /^(?:yang\s+)?(?:paling\s+)?(?:populer|terpopuler|terkenal|hits?|terbaik|terbaru|terfavorit|viral|favorit|enak|santai|top|best)\s+(?:dari|oleh|milik|ciptaan|nyanyian|punya|by|of)\s+(.+)/i
  );
  if (m && m[1]) {
    const artist = cleanArtist(m[1]);
    return {
      searchQuery: artist,
      detectedArtist: artist,
      descriptiveType,
      displayName: artist,
      isDescriptive: true,
    };
  }

  // 2. Pattern: dari/oleh/milik/by <artist> (yang) (paling) (populer|terbaru|terbaik|hits|enak)
  // e.g. "oleh alan walker yang populer", "dari tulus yang terbaru"
  m = q.match(
    /^(?:dari|oleh|milik|ciptaan|by)\s+(.+?)\s+(?:yang\s+)?(?:paling\s+)?(?:populer|terpopuler|terkenal|hits?|terbaik|terbaru|terfavorit|viral|favorit|enak|santai|top|best)$/i
  );
  if (m && m[1]) {
    const artist = cleanArtist(m[1]);
    return {
      searchQuery: artist,
      detectedArtist: artist,
      descriptiveType,
      displayName: artist,
      isDescriptive: true,
    };
  }

  // 3. Pattern: <artist> (yang) (paling) (lagi) (populer|terbaru|terbaik|hits|enak|viral)
  // e.g. "alan walker yang populer", "alan walker hits", "tulus terbaru"
  m = q.match(
    /^(.+?)\s+(?:yang\s+)?(?:paling\s+)?(?:lagi\s+)?(?:populer|terpopuler|terkenal|hits?|terbaik|terbaru|terfavorit|viral|favorit|enak|santai|top|best)$/i
  );
  if (m && m[1]) {
    const artist = cleanArtist(m[1]);
    if (!/^(?:yang|lagu|musik|apa)$/i.test(artist)) {
      return {
        searchQuery: artist,
        detectedArtist: artist,
        descriptiveType,
        displayName: artist,
        isDescriptive: true,
      };
    }
  }

  // 4. Pattern: dari/oleh/milik/by <artist>
  // e.g. "dari alan walker", "oleh coldplay"
  m = q.match(/^(?:dari|oleh|milik|by)\s+(.+)/i);
  if (m && m[1]) {
    const artist = cleanArtist(m[1]);
    return {
      searchQuery: artist,
      detectedArtist: artist,
      descriptiveType,
      displayName: artist,
      isDescriptive: true,
    };
  }

  // 5. Pattern: (yang) (paling) (populer|terbaru|terbaik|hits) <artist>
  // e.g. "hits alan walker", "terpopuler tulus", "lagu terbaik coldplay"
  m = q.match(
    /^(?:yang\s+)?(?:paling\s+)?(?:populer|terpopuler|terkenal|hits?|terbaik|terbaru|terfavorit|viral|favorit|enak|top|best)\s+(.+)/i
  );
  if (m && m[1]) {
    const artist = cleanArtist(m[1]);
    return {
      searchQuery: artist,
      detectedArtist: artist,
      descriptiveType,
      displayName: artist,
      isDescriptive: true,
    };
  }

  // 6. Pattern: lagunya / musiknya <artist> (e.g. "lagunya alan walker", "musiknya coldplay")
  if (hadSongPrefix && q.length > 0 && !/\b(?:dan|dengan|ft|feat)\b/i.test(q)) {
    const artist = cleanArtist(q);
    if (artist.length > 1) {
      return {
        searchQuery: artist,
        detectedArtist: artist,
        descriptiveType: 'popular',
        displayName: artist,
        isDescriptive: true,
      };
    }
  }

  // 7. Generic descriptive without artist specified (e.g. "putar lagu yang populer", "setel musik hits")
  if (
    /^(?:yang\s+)?(?:paling\s+)?(?:populer|terpopuler|terkenal|hits?|terbaik|terbaru|terfavorit|viral|favorit|enak|santai)$/i.test(
      q
    )
  ) {
    return {
      searchQuery: 'Top Hits Indonesia',
      descriptiveType: 'popular',
      displayName: 'Top Hits',
      isDescriptive: true,
    };
  }

  // Standard specific song query (e.g., "Faded", "Lily Alan Walker", "Hanya Rindu")
  return {
    searchQuery: q,
    displayName: q,
    isDescriptive: false,
  };
}
