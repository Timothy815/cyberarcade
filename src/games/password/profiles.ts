// Every profile is made up. Single-word facts (pet, sport, team, artist, food) are 3–10 letters
// so the round patterns can build passwords from them.

export interface Profile {
  name: string;
  age: number;
  pet: string;
  petKind: string;
  birthYear: number;
  sport: string;
  jersey: number;
  team: string;
  artist: string;
  food: string;
}

export const PROFILES: Profile[] = [
  { name: 'Maya', age: 15, pet: 'Pepper', petKind: 'dog', birthYear: 2010, sport: 'Soccer', jersey: 7, team: 'Eagles', artist: 'Drake', food: 'Tacos' },
  { name: 'Jordan', age: 16, pet: 'Biscuit', petKind: 'cat', birthYear: 2009, sport: 'Hockey', jersey: 19, team: 'Rangers', artist: 'Adele', food: 'Pizza' },
  { name: 'Priya', age: 15, pet: 'Mango', petKind: 'parrot', birthYear: 2010, sport: 'Tennis', jersey: 3, team: 'Lakers', artist: 'Shakira', food: 'Noodles' },
  { name: 'Diego', age: 14, pet: 'Rocket', petKind: 'dog', birthYear: 2011, sport: 'Baseball', jersey: 24, team: 'Yankees', artist: 'Usher', food: 'Burritos' },
  { name: 'Emma', age: 16, pet: 'Waffles', petKind: 'hamster', birthYear: 2009, sport: 'Swimming', jersey: 11, team: 'Celtics', artist: 'Rihanna', food: 'Sushi' },
  { name: 'Liam', age: 15, pet: 'Shadow', petKind: 'cat', birthYear: 2010, sport: 'Football', jersey: 88, team: 'Steelers', artist: 'Eminem', food: 'Wings' },
  { name: 'Aisha', age: 14, pet: 'Coco', petKind: 'rabbit', birthYear: 2011, sport: 'Track', jersey: 5, team: 'Warriors', artist: 'Beyonce', food: 'Pasta' },
  { name: 'Noah', age: 16, pet: 'Ziggy', petKind: 'lizard', birthYear: 2009, sport: 'Lacrosse', jersey: 12, team: 'Bruins', artist: 'Weeknd', food: 'Burgers' },
  { name: 'Sofia', age: 15, pet: 'Luna', petKind: 'dog', birthYear: 2010, sport: 'Volleyball', jersey: 9, team: 'Dodgers', artist: 'Olivia', food: 'Ramen' },
  { name: 'Ethan', age: 14, pet: 'Nugget', petKind: 'guinea pig', birthYear: 2011, sport: 'Wrestling', jersey: 32, team: 'Packers', artist: 'Travis', food: 'Nachos' },
  { name: 'Chloe', age: 16, pet: 'Oreo', petKind: 'cat', birthYear: 2009, sport: 'Softball', jersey: 21, team: 'Cubs', artist: 'Swift', food: 'Pancakes' },
  { name: 'Mason', age: 15, pet: 'Bandit', petKind: 'ferret', birthYear: 2010, sport: 'Golf', jersey: 4, team: 'Raiders', artist: 'Bieber', food: 'Steak' },
];

/** Boss-round passphrase words: short, common, nothing to do with any profile. */
export const BOSS_WORDS: string[] = [
  'purple', 'tractor', 'moon', 'pickle', 'river', 'candle', 'thunder', 'velvet', 'giraffe', 'pocket',
  'marble', 'cactus', 'lantern', 'walrus', 'meadow', 'rocket', 'button', 'glacier', 'orbit', 'pepper',
  'sandal', 'violin', 'oyster', 'blanket', 'comet', 'puzzle', 'saddle', 'tunnel', 'wizard', 'yogurt',
  'basket', 'dragon', 'falcon', 'helmet', 'island', 'jungle', 'kettle', 'ladder', 'magnet', 'noodle',
  'olive', 'parrot', 'quilt', 'robot', 'silver', 'tomato', 'umbrella', 'volcano', 'window', 'zebra',
  'anchor', 'bubble', 'copper', 'desert', 'engine', 'forest', 'garden', 'hammer', 'igloo', 'jacket',
];
