import { normalizeTitle, toIdentification, type RawCandidate } from "./identification";
import type { Identification, MediaKind, SearchInput } from "./types";

/**
 * Demo mode: a small, hand-written set of searches so GetReel can be explored
 * (and designed) before any API keys are added. Descriptions that resemble one
 * of these examples return its curated answer; anything else explains how to
 * switch on live search. Every fact here was checked by hand.
 */

/** Hand-written details standing in for TMDB data on the top answer. */
export type DemoExtras = {
  overview: string;
  cast: string[];
  /** Film length in minutes (left out for series). */
  runtime: number | null;
  genres: string[];
  networks?: string[];
  seasonCount?: number;
  episodeCount?: number;
  endYear?: number;
  ongoing?: boolean;
  /** ISO 639-1 code of the original language. */
  language?: string;
  /** ISO 3166-1 codes of the countries of origin. */
  countries?: string[];
  episode?: { airDate?: string; overview?: string };
};

type DemoCase = {
  /** Shown as a clickable example on the home page. */
  prompt: string;
  /** Short label for the example chip. */
  label: string;
  keywords: Record<string, number>;
  interpretation: string;
  followUpQuestion: string | null;
  candidates: RawCandidate[];
  extras: Record<string, DemoExtras>;
};

type Extra = { originalTitle?: string; season?: number; episode?: number; episodeTitle?: string };

function film(
  title: string,
  year: number,
  director: string | null,
  confidence: number,
  why: string,
  matched: string[],
  unmatched: string[],
  scene: string | null,
  query: string,
  extra: Extra = {},
): RawCandidate {
  return {
    kind: "movie",
    title,
    year,
    original_title: extra.originalTitle ?? null,
    made_by: director,
    confidence,
    why,
    matched_clues: matched,
    unmatched_clues: unmatched,
    scene,
    season: null,
    episode: null,
    episode_title: null,
    clip_search_query: query,
  };
}

function series(
  title: string,
  firstAired: number,
  creators: string | null,
  confidence: number,
  why: string,
  matched: string[],
  unmatched: string[],
  scene: string | null,
  query: string,
  extra: Extra = {},
): RawCandidate {
  return {
    kind: "tv",
    title,
    year: firstAired,
    original_title: extra.originalTitle ?? null,
    made_by: creators,
    confidence,
    why,
    matched_clues: matched,
    unmatched_clues: unmatched,
    scene,
    season: extra.season ?? null,
    episode: extra.episode ?? null,
    episode_title: extra.episodeTitle ?? null,
    clip_search_query: query,
  };
}

export const DEMO_CASES: DemoCase[] = [
  {
    prompt: "A man is stranded on a desert island for years and his only friend is a volleyball",
    label: "The volleyball friend",
    keywords: { volleyball: 3, wilson: 3, island: 2, stranded: 1, deserted: 1, desert: 1, fedex: 3, castaway: 3 },
    interpretation: "A film where a man stranded alone on a desert island befriends a volleyball.",
    followUpQuestion: null,
    candidates: [
      film(
        "Cast Away",
        2000,
        "Robert Zemeckis",
        97,
        "You're remembering Cast Away: Tom Hanks plays a FedEx engineer marooned on a Pacific island, where a volleyball he names Wilson becomes his only companion.",
        ["stranded on a desert island", "years alone", "volleyball as a friend"],
        [],
        "Chuck and his volleyball companion, Wilson",
        "Cast Away 2000 Wilson volleyball scene",
      ),
      film(
        "The Martian",
        2015,
        "Ridley Scott",
        6,
        "Another survivor stranded alone for a very long time, though on Mars, and his company is a video diary rather than a volleyball.",
        ["stranded alone", "survives for a long time"],
        ["desert island", "volleyball"],
        null,
        "The Martian 2015 official trailer",
      ),
      film(
        "Life of Pi",
        2012,
        "Ang Lee",
        4,
        "A shipwreck survivor whose only companion is an unlikely one, a Bengal tiger, adrift at sea.",
        ["stranded", "an unusual companion"],
        ["desert island", "volleyball"],
        null,
        "Life of Pi 2012 official trailer",
      ),
      film(
        "All Is Lost",
        2013,
        "J.C. Chandor",
        3,
        "Robert Redford alone on a crippled yacht in the Indian Ocean, with almost no dialogue.",
        ["alone for a long time"],
        ["island", "volleyball"],
        null,
        "All Is Lost 2013 official trailer",
      ),
    ],
    extras: {
      "Cast Away|2000": {
        overview:
          "A time-obsessed FedEx systems engineer survives a plane crash in the South Pacific and spends four years on an uninhabited island, learning to survive, keeping his sanity with a volleyball named Wilson, and finally risking everything on a raft.",
        cast: ["Tom Hanks", "Helen Hunt", "Nick Searcy", "Chris Noth"],
        runtime: 143,
        genres: ["Adventure", "Drama"],
      },
    },
  },
  {
    prompt: "Kids on BMX bikes help a lost alien get home and fly across the moon",
    label: "Bikes across the moon",
    keywords: { alien: 2, bikes: 2, bike: 2, bmx: 2, moon: 2, kids: 1, home: 1, phone: 2, flying: 1, extraterrestrial: 3 },
    interpretation: "A film where children on bicycles help a stranded alien return to his home world.",
    followUpQuestion: null,
    candidates: [
      film(
        "E.T. the Extra-Terrestrial",
        1982,
        "Steven Spielberg",
        98,
        "That's E.T.: Elliott and his friends pedal their bikes into the sky, silhouetted against the full moon, to get their alien friend to his ship.",
        ["kids on bikes", "lost alien", "flying across the moon"],
        [],
        "The bikes lifting off and flying across the moon",
        "E.T. the Extra-Terrestrial 1982 bike flying moon scene",
      ),
      film(
        "Super 8",
        2011,
        "J.J. Abrams",
        9,
        "Kids making a home movie in 1979 Ohio run into an escaped alien. It's a deliberate homage to E.T., but nobody flies.",
        ["kids", "alien trying to get home"],
        ["flying across the moon"],
        null,
        "Super 8 2011 official trailer",
      ),
      film(
        "Flight of the Navigator",
        1986,
        "Randal Kleiser",
        5,
        "A boy teams up with an alien ship's robotic pilot and flies home with it.",
        ["boy helps alien", "flying"],
        ["bikes", "moon"],
        null,
        "Flight of the Navigator 1986 official trailer",
      ),
      film(
        "Explorers",
        1985,
        "Joe Dante",
        4,
        "Three boys build a homemade spacecraft from blueprints they dream up and meet aliens in orbit.",
        ["kids", "aliens", "flying"],
        ["bikes", "helping an alien home"],
        null,
        "Explorers 1985 official trailer",
      ),
    ],
    extras: {
      "E.T. the Extra-Terrestrial|1982": {
        overview:
          "A lonely suburban boy discovers a gentle alien stranded on Earth, hides him from the grown-ups and the government, and rallies his siblings and friends to help him phone home before it's too late.",
        cast: ["Henry Thomas", "Drew Barrymore", "Dee Wallace", "Peter Coyote", "Robert MacNaughton"],
        runtime: 115,
        genres: ["Science Fiction", "Family", "Adventure"],
      },
    },
  },
  {
    prompt: "A lobby boy at a pink hotel in the mountains gets mixed up in a stolen painting and a murder",
    label: "The pink hotel",
    keywords: { lobby: 3, hotel: 2, pink: 2, painting: 2, concierge: 3, budapest: 3, mountains: 1, murder: 1 },
    interpretation: "A film where a hotel lobby boy is swept up in a murder and the theft of a priceless painting.",
    followUpQuestion: null,
    candidates: [
      film(
        "The Grand Budapest Hotel",
        2014,
        "Wes Anderson",
        96,
        "You're thinking of The Grand Budapest Hotel: the concierge Gustave H. and his lobby boy Zero steal the painting 'Boy with Apple' after a wealthy guest is murdered.",
        ["lobby boy", "pink hotel in the mountains", "stolen painting", "a murder"],
        [],
        "Gustave and Zero stealing 'Boy with Apple'",
        "The Grand Budapest Hotel 2014 Boy with Apple painting scene",
      ),
      film(
        "Knives Out",
        2019,
        "Rian Johnson",
        5,
        "A wealthy family, a suspicious death and a disputed inheritance, but it's set in a New England mansion rather than a hotel.",
        ["a murder", "an inheritance fight"],
        ["hotel", "lobby boy", "stolen painting"],
        null,
        "Knives Out 2019 official trailer",
      ),
      film(
        "The Royal Tenenbaums",
        2001,
        "Wes Anderson",
        3,
        "The same director's storybook look and deadpan humor, but it's a family drama in New York.",
        ["Wes Anderson style"],
        ["hotel", "painting", "murder"],
        null,
        "The Royal Tenenbaums 2001 official trailer",
      ),
    ],
    extras: {
      "The Grand Budapest Hotel|2014": {
        overview:
          "Between the wars, at a grand spa hotel high in the mountains of a fictional European republic, a fastidious concierge and his devoted lobby boy are framed for murder, steal a priceless Renaissance painting and flee across a continent on the brink of war.",
        cast: ["Ralph Fiennes", "Tony Revolori", "F. Murray Abraham", "Saoirse Ronan", "Willem Dafoe"],
        runtime: 100,
        genres: ["Comedy", "Drama"],
      },
    },
  },
  {
    prompt: "Two rival magicians in Victorian London try to outdo each other's teleportation trick",
    label: "Rival magicians",
    keywords: { magician: 3, magicians: 3, rival: 1, victorian: 2, london: 1, teleportation: 3, teleport: 3, trick: 2, illusion: 2 },
    interpretation: "A film about two rival stage magicians in Victorian London obsessed with a teleportation illusion.",
    followUpQuestion: null,
    candidates: [
      film(
        "The Prestige",
        2006,
        "Christopher Nolan",
        90,
        "That's The Prestige: Hugh Jackman and Christian Bale play rival magicians whose feud escalates over 'The Transported Man', a trick in which a performer seems to teleport across the stage.",
        ["rival magicians", "Victorian London", "teleportation trick"],
        [],
        "The Transported Man illusion",
        "The Prestige 2006 Transported Man trick scene",
      ),
      film(
        "The Illusionist",
        2006,
        "Neil Burger",
        35,
        "Released the same year and often confused with The Prestige, it's a period magician film, but set in Vienna and built around a forbidden romance rather than a rivalry.",
        ["19th-century stage magic", "dazzling illusions"],
        ["London", "rivalry between magicians"],
        null,
        "The Illusionist 2006 official trailer",
      ),
      film(
        "Now You See Me",
        2013,
        "Louis Leterrier",
        4,
        "Modern-day illusionists pull off heists during their shows, with an apparent teleportation, but there's no Victorian setting.",
        ["magicians", "teleportation illusion"],
        ["Victorian London", "rivalry"],
        null,
        "Now You See Me 2013 official trailer",
      ),
    ],
    extras: {
      "The Prestige|2006": {
        overview:
          "In 1890s London, two young stage magicians start out as friends and end as bitter rivals after a tragedy, each sacrificing everything to discover the secret of the other's greatest illusion.",
        cast: ["Hugh Jackman", "Christian Bale", "Scarlett Johansson", "Michael Caine", "David Bowie"],
        runtime: 130,
        genres: ["Drama", "Mystery", "Science Fiction"],
      },
    },
  },
  {
    prompt: "Thieves sneak into people's dreams to plant an idea, and it ends on a spinning top",
    label: "The spinning top",
    keywords: { dream: 3, dreams: 3, spinning: 2, top: 1, idea: 1, plant: 1, heist: 1, inception: 3, totem: 3 },
    interpretation: "A film where a team of thieves enters dreams to plant an idea, ending on a spinning top.",
    followUpQuestion: null,
    candidates: [
      film(
        "Inception",
        2010,
        "Christopher Nolan",
        98,
        "You mean Inception: Leonardo DiCaprio leads a crew who infiltrate dreams within dreams to plant an idea, and the film famously cuts to black on his spinning top.",
        ["thieves in dreams", "planting an idea", "spinning top ending"],
        [],
        "The final shot of the spinning top",
        "Inception 2010 ending spinning top scene",
      ),
      film(
        "Paprika",
        2006,
        "Satoshi Kon",
        7,
        "A Japanese animated thriller about a device that lets therapists enter patients' dreams, often cited as an influence on Inception.",
        ["entering dreams"],
        ["planting an idea", "spinning top"],
        null,
        "Paprika 2006 official trailer",
      ),
      film(
        "The Cell",
        2000,
        "Tarsem Singh",
        3,
        "A psychologist uses experimental technology to enter a comatose killer's mind.",
        ["entering someone's mind"],
        ["thieves", "spinning top"],
        null,
        "The Cell 2000 official trailer",
      ),
      film(
        "Dreamscape",
        1984,
        "Joseph Ruben",
        2,
        "A psychic is recruited to enter people's dreams, and must stop an assassin who kills from inside them.",
        ["entering dreams"],
        ["planting an idea", "spinning top"],
        null,
        "Dreamscape 1984 trailer",
      ),
    ],
    extras: {
      "Inception|2010": {
        overview:
          "A thief who steals secrets from people's subconscious is offered a way home if he can do the reverse: plant an idea in a powerful heir's mind, by descending through dreams within dreams.",
        cast: ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page", "Tom Hardy", "Marion Cotillard"],
        runtime: 148,
        genres: ["Action", "Science Fiction", "Adventure"],
      },
    },
  },
  {
    prompt: "An old black-and-white film where a husband dims the gas lights to make his wife think she's going mad",
    label: "The dimming lights",
    keywords: { gas: 3, gaslight: 3, lights: 1, husband: 1, wife: 1, mad: 1, crazy: 1, insane: 1, sanity: 1, black: 1, white: 1 },
    interpretation:
      "A black-and-white film where a husband manipulates his wife into doubting her sanity by secretly dimming the gas lights.",
    followUpQuestion: "Was it the Hollywood version with Ingrid Bergman, or a British film?",
    candidates: [
      film(
        "Gaslight",
        1944,
        "George Cukor",
        72,
        "Most likely the Hollywood Gaslight: Ingrid Bergman's new husband dims the lights and insists she's imagining it, the film that gave us the word 'gaslighting'.",
        ["black-and-white", "dimming gas lights", "husband making her doubt her sanity"],
        [],
        "The gas lights flickering while he denies it",
        "Gaslight 1944 gas lights dimming scene",
      ),
      film(
        "Gaslight",
        1940,
        "Thorold Dickinson",
        45,
        "The original British adaptation of the same play, made four years earlier, and just as chilling.",
        ["black-and-white", "dimming gas lights", "husband making her doubt her sanity"],
        [],
        null,
        "Gaslight 1940 Thorold Dickinson",
      ),
      film(
        "Rebecca",
        1940,
        "Alfred Hitchcock",
        6,
        "A young bride made to doubt herself in a gloomy mansion. Psychological torment, but no gas lights.",
        ["black-and-white", "a wife made to doubt herself"],
        ["gas lights", "a scheming husband"],
        null,
        "Rebecca 1940 Hitchcock trailer",
      ),
      film(
        "Suspicion",
        1941,
        "Alfred Hitchcock",
        4,
        "A wife slowly comes to believe her charming husband is plotting against her.",
        ["black-and-white", "a menacing husband"],
        ["gas lights", "doubting her sanity"],
        null,
        "Suspicion 1941 Hitchcock trailer",
      ),
    ],
    extras: {
      "Gaslight|1944": {
        overview:
          "A young singer marries a charming older man and moves into the London house where her aunt was murdered years before. Soon pictures vanish, footsteps echo in the attic, and the gaslights dim, and her husband insists it's all in her mind.",
        cast: ["Ingrid Bergman", "Charles Boyer", "Joseph Cotten", "Angela Lansbury"],
        runtime: 114,
        genres: ["Thriller", "Mystery", "Drama"],
      },
    },
  },  {
    prompt: "A Korean show where contestants in green tracksuits play deadly children's games for a huge cash prize",
    label: "Deadly playground games",
    keywords: { korean: 2, tracksuits: 2, tracksuit: 2, deadly: 1, children: 1, games: 1, contestants: 1, prize: 1, doll: 2, squid: 3 },
    interpretation: "A Korean series where debt-ridden contestants play lethal versions of children's games for a fortune.",
    followUpQuestion: null,
    candidates: [
      series(
        "Squid Game",
        2021,
        "Hwang Dong-hyuk",
        97,
        "That's Squid Game: 456 players in green tracksuits risk their lives in children's games for a 45.6 billion won prize, beginning with a giant doll's game of Red Light, Green Light.",
        ["Korean show", "green tracksuits", "deadly children's games", "huge cash prize"],
        [],
        "The giant doll's game of Red Light, Green Light",
        "Squid Game Red Light Green Light doll scene",
        { originalTitle: "오징어 게임", season: 1, episode: 1, episodeTitle: "Red Light, Green Light" },
      ),
      series(
        "Alice in Borderland",
        2020,
        "Shinsuke Sato",
        12,
        "A Japanese series where people trapped in a deserted Tokyo must survive deadly games, though the games aren't children's games and there's no cash prize.",
        ["deadly games"],
        ["Korean", "green tracksuits", "cash prize"],
        null,
        "Alice in Borderland official trailer",
        { originalTitle: "今際の国のアリス" },
      ),
      film(
        "As the Gods Will",
        2014,
        "Takashi Miike",
        6,
        "A Japanese film where students are forced into lethal versions of children's games, starting with a murderous Daruma doll.",
        ["deadly children's games", "a giant doll"],
        ["Korean", "a series", "cash prize"],
        null,
        "As the Gods Will 2014 trailer",
        { originalTitle: "神さまの言うとおり" },
      ),
      series(
        "3%",
        2016,
        "Pedro Aguilera",
        4,
        "A Brazilian series where young people compete in brutal tests for a place in a privileged society.",
        ["contestants", "high-stakes competition"],
        ["Korean", "children's games"],
        null,
        "3% Netflix series official trailer",
      ),
    ],
    extras: {
      "Squid Game|2021": {
        overview:
          "Hundreds of cash-strapped players accept a mysterious invitation to compete in children's games for a life-changing prize, only to discover that losing costs them their lives.",
        cast: ["Lee Jung-jae", "Park Hae-soo", "Wi Ha-joon", "Jung Ho-yeon", "O Yeong-su"],
        runtime: null,
        genres: ["Drama", "Thriller"],
        networks: ["Netflix"],
        seasonCount: 3,
        episodeCount: 22,
        endYear: 2025,
        language: "ko",
        countries: ["KR"],
        episode: {
          airDate: "2021-09-17",
          overview:
            "Deep in debt, Gi-hun accepts a stranger's offer to play games for money and wakes up in a secret compound, where the first game is Red Light, Green Light.",
        },
      },
    },
  },
  {
    prompt: "A Spanish heist series where robbers in red jumpsuits and Salvador Dalí masks take over the Royal Mint",
    label: "The Dalí masks",
    keywords: { spanish: 2, spain: 2, heist: 2, robbers: 1, jumpsuits: 2, jumpsuit: 2, red: 1, dali: 3, masks: 1, mask: 1, mint: 3, professor: 2 },
    interpretation: "A Spanish series about a crew in red jumpsuits and Dalí masks who take over the Royal Mint of Spain.",
    followUpQuestion: null,
    candidates: [
      series(
        "Money Heist",
        2017,
        "Álex Pina",
        97,
        "You mean Money Heist (La casa de papel): the Professor's crew, in red jumpsuits and Dalí masks, seize the Royal Mint of Spain to print their own fortune.",
        ["Spanish series", "red jumpsuits", "Dalí masks", "the Royal Mint"],
        [],
        null,
        "Money Heist La casa de papel official trailer",
        { originalTitle: "La casa de papel" },
      ),
      series(
        "Berlin",
        2023,
        "Álex Pina & Esther Martínez Lobato",
        9,
        "The prequel spin-off following Berlin's earlier heist in Paris: the same world and style, but no Royal Mint.",
        ["Spanish heist series"],
        ["the Royal Mint", "red jumpsuits"],
        null,
        "Berlin Netflix series official trailer",
      ),
      series(
        "Money Heist: Korea – Joint Economic Area",
        2022,
        null,
        6,
        "The Korean remake keeps the red jumpsuits and the mint, but moves the story to the Korean Peninsula and swaps Dalí for traditional Hahoe masks.",
        ["red jumpsuits", "a mint heist"],
        ["Spanish", "Dalí masks"],
        null,
        "Money Heist Korea Joint Economic Area official trailer",
      ),
      series(
        "Lupin",
        2021,
        "George Kay & François Uzan",
        3,
        "A French series about a gentleman thief pulling off elaborate heists in Paris, without a masked crew.",
        ["heist series"],
        ["Spanish", "red jumpsuits", "Dalí masks"],
        null,
        "Lupin Netflix official trailer",
      ),
    ],
    extras: {
      "Money Heist|2017": {
        overview:
          "A mysterious mastermind known as the Professor recruits eight robbers with nothing to lose for an audacious plan: lock themselves inside the Royal Mint of Spain with hostages and print billions of euros.",
        cast: ["Úrsula Corberó", "Álvaro Morte", "Itziar Ituño", "Pedro Alonso", "Miguel Herrán"],
        runtime: null,
        genres: ["Crime", "Drama"],
        networks: ["Antena 3", "Netflix"],
        endYear: 2021,
        language: "es",
        countries: ["ES"],
      },
    },
  },
  {
    prompt: "A high school chemistry teacher with cancer starts cooking meth in an RV in the desert",
    label: "The chemistry teacher",
    keywords: { chemistry: 2, teacher: 1, cancer: 2, meth: 3, methamphetamine: 3, rv: 2, heisenberg: 3, albuquerque: 2 },
    interpretation: "A series about a dying chemistry teacher who turns to making meth in the New Mexico desert.",
    followUpQuestion: null,
    candidates: [
      series(
        "Breaking Bad",
        2008,
        "Vince Gilligan",
        98,
        "That's Breaking Bad: Walter White, a chemistry teacher with terminal cancer, starts cooking meth with his former student Jesse Pinkman in a battered RV outside Albuquerque.",
        ["chemistry teacher", "cancer", "cooking meth", "an RV in the desert"],
        [],
        null,
        "Breaking Bad official trailer",
      ),
      series(
        "Better Call Saul",
        2015,
        "Vince Gilligan & Peter Gould",
        7,
        "The prequel set in the same Albuquerque world, but it follows the lawyer Saul Goodman rather than the teacher.",
        ["the New Mexico desert", "the drug trade"],
        ["chemistry teacher", "cancer"],
        null,
        "Better Call Saul official trailer",
      ),
      series(
        "Weeds",
        2005,
        "Jenji Kohan",
        5,
        "A suburban mother turns to dealing marijuana to pay the bills: a similar ordinary-person-turned-dealer premise.",
        ["an ordinary person turns dealer"],
        ["chemistry teacher", "meth", "an RV"],
        null,
        "Weeds Showtime series trailer",
      ),
      series(
        "Ozark",
        2017,
        "Bill Dubuque & Mark Williams",
        4,
        "A financial adviser launders money for a drug cartel in the Missouri Ozarks: another family man in over his head.",
        ["a family man turns criminal"],
        ["chemistry teacher", "meth", "the desert"],
        null,
        "Ozark official trailer",
      ),
    ],
    extras: {
      "Breaking Bad|2008": {
        overview:
          "Facing a terminal cancer diagnosis, mild-mannered chemistry teacher Walter White teams up with former student Jesse Pinkman to cook and sell crystal meth, and slowly becomes someone his family would never recognize.",
        cast: ["Bryan Cranston", "Aaron Paul", "Anna Gunn", "Dean Norris", "Bob Odenkirk"],
        runtime: null,
        genres: ["Drama", "Crime"],
        networks: ["AMC"],
        seasonCount: 5,
        episodeCount: 62,
        endYear: 2013,
        language: "en",
        countries: ["US"],
      },
    },
  },
  {
    prompt: "The sitcom episode where a guy keeps yelling “pivot!” while carrying a couch up the stairs",
    label: "“Pivot!”",
    keywords: { pivot: 3, couch: 2, sofa: 2, stairs: 2, staircase: 1, sitcom: 1, ross: 3 },
    interpretation: "A sitcom episode where someone shouts “pivot!” while wrestling a couch up a staircase.",
    followUpQuestion: null,
    candidates: [
      series(
        "Friends",
        1994,
        "David Crane & Marta Kauffman",
        98,
        "That's Friends: Ross buys a new couch and, with Rachel and Chandler, tries to carry it up the stairs while shouting “Pivot!”",
        ["a sitcom episode", "yelling “pivot!”", "a couch up the stairs"],
        [],
        "Ross yelling “Pivot!” on the stairs",
        "Friends pivot couch scene The One with the Cop",
        { season: 5, episode: 16, episodeTitle: "The One with the Cop" },
      ),
      series(
        "Seinfeld",
        1989,
        "Larry David & Jerry Seinfeld",
        2,
        "Another sitcom about a group of friends in New York, but the “pivot” couch scene isn't from it.",
        ["a sitcom"],
        ["yelling “pivot!”", "a couch up the stairs"],
        null,
        "Seinfeld trailer",
      ),
    ],
    extras: {
      "Friends|1994": {
        overview:
          "Six friends navigate work, love and life in Manhattan, mostly from the couch of a coffee shop called Central Perk.",
        cast: ["Jennifer Aniston", "Courteney Cox", "Lisa Kudrow", "Matt LeBlanc", "Matthew Perry", "David Schwimmer"],
        runtime: null,
        genres: ["Comedy"],
        networks: ["NBC"],
        seasonCount: 10,
        episodeCount: 236,
        endYear: 2004,
        language: "en",
        countries: ["US"],
        episode: {
          overview: "Ross buys a new couch and enlists Rachel and Chandler to help carry it up to his apartment.",
        },
      },
    },
  },
];

export type DemoPrompt = { label: string; prompt: string; kind: MediaKind };

/** The example prompts, for the home page. `kind` is the answer's kind. */
export const DEMO_PROMPTS: DemoPrompt[] = DEMO_CASES.map((d) => ({
  label: d.label,
  prompt: d.prompt,
  kind: d.candidates[0].kind,
}));

function words(text: string): string[] {
  return normalizeTitle(text).split(" ").filter(Boolean);
}

function scoreCase(demo: DemoCase, text: string): number {
  const ws = new Set(words(text));
  let score = 0;
  for (const [word, weight] of Object.entries(demo.keywords)) {
    if (ws.has(word)) score += weight;
  }
  return score;
}

export function findDemoCase(input: SearchInput): DemoCase | null {
  const text = [input.description, ...input.clues].join(" ");
  const exact = DEMO_CASES.find((d) => d.prompt.toLowerCase() === input.description.toLowerCase());
  if (exact) return exact;
  let best: { demo: DemoCase; score: number } | null = null;
  for (const demo of DEMO_CASES) {
    const score = scoreCase(demo, text);
    if (!best || score > best.score) best = { demo, score };
  }
  return best && best.score >= 3 ? best.demo : null;
}

export function demoIdentify(input: SearchInput): Identification {
  const demo = findDemoCase(input);
  if (!demo) {
    return {
      interpretation: input.description,
      candidates: [],
      followUpQuestion: null,
    };
  }
  return toIdentification(
    {
      interpretation: demo.interpretation,
      candidates: demo.candidates,
      follow_up_question: demo.followUpQuestion,
    },
    input,
  );
}

/** Hand-written details for a demo title's top answer. */
export function demoExtras(title: string, year: number | null): DemoExtras | null {
  const want = `${normalizeTitle(title)}|${year ?? ""}`;
  for (const demo of DEMO_CASES) {
    for (const [key, extras] of Object.entries(demo.extras)) {
      const [t, y] = key.split("|");
      if (`${normalizeTitle(t)}|${y}` === want) return extras;
    }
  }
  return null;
}
