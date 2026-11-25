// Ready-made habits for the "Habit ideas" library. Plain data, plus the search that the library uses.
// Every template must pass the same rules as the habit sheet (tests/templates.test.js checks each one):
// name up to 60 characters, a known category, cue up to 80, unit up to 12, a goal from 1 to 100,000.

export const TEMPLATE_GOALS = ['Energy', 'Fitness', 'Focus', 'Calm', 'Learning', 'Money', 'Home', 'Relationships'];

const days = (...d) => ({ type: 'days', days: d });
const times = n => ({ type: 'times', times: n });
const WEEKDAYS = days(1, 2, 3, 4, 5);

export const TEMPLATES = [
  // ── Energy ──
  { name: 'Drink water', category: 'health', icon: 'drop', target: { amount: 8, unit: 'glasses', step: 1 }, goals: ['Energy'] },
  { name: 'In bed by 11', category: 'health', icon: 'bed', timeOfDay: 'evening', cue: 'When the 10:30 alarm goes', goals: ['Energy', 'Calm'] },
  { name: 'Morning sunlight', category: 'health', icon: 'sun', timeOfDay: 'morning', target: { amount: 10, unit: 'minutes', step: 5 }, cue: 'Right after I get up', goals: ['Energy'] },
  { name: 'No caffeine after 2 pm', category: 'nutrition', icon: 'coffee', timeOfDay: 'afternoon', goals: ['Energy'] },
  { name: 'Eat a proper breakfast', category: 'nutrition', timeOfDay: 'morning', goals: ['Energy'] },
  { name: 'Fruit or vegetables with every meal', category: 'nutrition', icon: 'leaf', target: { amount: 3, unit: 'meals', step: 1 }, goals: ['Energy'] },
  { name: 'No phone in the first hour', category: 'mind', icon: 'phone', timeOfDay: 'morning', goals: ['Energy', 'Focus'] },
  // ── Fitness ──
  { name: 'Walk', category: 'fitness', target: { amount: 8000, unit: 'steps', step: 1000 }, goals: ['Fitness', 'Energy'] },
  { name: 'Strength training', category: 'fitness', schedule: days(1, 3, 5), cue: 'After work, before dinner', goals: ['Fitness'] },
  { name: 'Run', category: 'fitness', schedule: times(3), goals: ['Fitness'] },
  { name: 'Stretch', category: 'fitness', timeOfDay: 'morning', target: { amount: 5, unit: 'minutes', step: 5 }, cue: 'After I pour my coffee', goals: ['Fitness', 'Calm'] },
  { name: 'Push-ups', category: 'fitness', target: { amount: 30, unit: 'push-ups', step: 10 }, goals: ['Fitness'] },
  { name: 'Take the stairs', category: 'fitness', schedule: WEEKDAYS, goals: ['Fitness'] },
  { name: 'Yoga', category: 'fitness', schedule: times(2), timeOfDay: 'evening', goals: ['Fitness', 'Calm'] },
  { name: 'Long weekend walk or ride', category: 'fitness', schedule: days(0, 6), goals: ['Fitness'] },
  // ── Focus ──
  { name: 'Plan my top 3 tasks', category: 'productive', icon: 'target', timeOfDay: 'morning', schedule: WEEKDAYS, cue: 'When I sit down at my desk', goals: ['Focus'] },
  { name: 'Deep work block', category: 'productive', icon: 'clock', schedule: WEEKDAYS, target: { amount: 90, unit: 'minutes', step: 30 }, goals: ['Focus'] },
  { name: 'Inbox to zero', category: 'productive', schedule: WEEKDAYS, timeOfDay: 'afternoon', goals: ['Focus'] },
  { name: 'Phone out of reach while working', category: 'productive', icon: 'phone', schedule: WEEKDAYS, goals: ['Focus'] },
  { name: 'Weekly review', category: 'productive', icon: 'calendar', schedule: times(1), cue: 'Friday, before I close the laptop', goals: ['Focus'] },
  { name: 'Work on my side project', category: 'project', schedule: times(3), target: { amount: 30, unit: 'minutes', step: 15 }, goals: ['Focus', 'Learning'] },
  { name: 'Tidy my desk', category: 'productive', schedule: WEEKDAYS, timeOfDay: 'evening', cue: 'Before I stop work', goals: ['Focus', 'Home'] },
  // ── Calm ──
  { name: 'Meditate', category: 'relaxation', timeOfDay: 'morning', target: { amount: 10, unit: 'minutes', step: 5 }, goals: ['Calm'] },
  { name: 'Write in a journal', category: 'mind', icon: 'pen', timeOfDay: 'evening', cue: 'When I get into bed', goals: ['Calm'] },
  { name: 'Three things I am grateful for', category: 'mind', icon: 'heart', timeOfDay: 'evening', target: { amount: 3, unit: 'things', step: 1 }, goals: ['Calm'] },
  { name: 'Screens off an hour before bed', category: 'relaxation', icon: 'moon', timeOfDay: 'evening', goals: ['Calm', 'Energy'] },
  { name: 'Ten slow breaths', category: 'relaxation', target: { amount: 10, unit: 'breaths', step: 10 }, cue: 'When I feel rushed', goals: ['Calm'] },
  { name: 'Time outdoors', category: 'relaxation', icon: 'leaf', target: { amount: 20, unit: 'minutes', step: 10 }, goals: ['Calm', 'Energy'] },
  { name: 'Listen to music with nothing else on', category: 'relaxation', icon: 'music', schedule: times(2), goals: ['Calm'] },
  // ── Learning ──
  { name: 'Read', category: 'reading', timeOfDay: 'evening', target: { amount: 20, unit: 'pages', step: 5 }, goals: ['Learning', 'Calm'] },
  { name: 'Practise a language', category: 'growth', target: { amount: 15, unit: 'minutes', step: 5 }, cue: 'On the way to work', goals: ['Learning'] },
  { name: 'Practise an instrument', category: 'growth', icon: 'music', schedule: times(4), target: { amount: 20, unit: 'minutes', step: 10 }, goals: ['Learning'] },
  { name: 'Review today’s notes', category: 'growth', icon: 'pen', schedule: WEEKDAYS, timeOfDay: 'evening', goals: ['Learning', 'Focus'] },
  { name: 'Take one lesson of my course', category: 'growth', schedule: times(3), goals: ['Learning'] },
  { name: 'Write 200 words', category: 'growth', icon: 'pen', target: { amount: 200, unit: 'words', step: 50 }, goals: ['Learning'] },
  { name: 'Finish a book', category: 'reading', frequency: 'monthly', goals: ['Learning'] },
  // ── Money ──
  { name: 'Log what I spent', category: 'saving', timeOfDay: 'evening', goals: ['Money'] },
  { name: 'No-spend day', category: 'saving', schedule: times(2), goals: ['Money'] },
  { name: 'Bring lunch from home', category: 'saving', schedule: WEEKDAYS, cue: 'While dinner is cooking, pack tomorrow’s', goals: ['Money'] },
  { name: 'Move money to savings', category: 'saving', schedule: times(1), goals: ['Money'] },
  { name: 'Review my budget', category: 'saving', icon: 'calendar', frequency: 'monthly', goals: ['Money'] },
  { name: 'Check subscriptions and cancel one I do not use', category: 'saving', frequency: 'monthly', goals: ['Money'] },
  // ── Home ──
  { name: 'Make the bed', category: 'productive', icon: 'bed', timeOfDay: 'morning', cue: 'As soon as I am out of it', goals: ['Home'] },
  { name: 'Ten-minute tidy', category: 'productive', icon: 'home', timeOfDay: 'evening', target: { amount: 10, unit: 'minutes', step: 5 }, goals: ['Home'] },
  { name: 'Dishes done before bed', category: 'productive', icon: 'home', timeOfDay: 'evening', goals: ['Home'] },
  { name: 'Laundry', category: 'productive', icon: 'home', schedule: times(2), goals: ['Home'] },
  { name: 'Cook dinner at home', category: 'nutrition', icon: 'home', schedule: times(4), goals: ['Home', 'Money'] },
  { name: 'Water the plants', category: 'productive', icon: 'leaf', schedule: times(2), goals: ['Home'] },
  { name: 'Plan the week’s meals', category: 'nutrition', icon: 'calendar', schedule: days(0), goals: ['Home', 'Money'] },
  // ── Relationships ──
  { name: 'Call a friend or family member', category: 'social', icon: 'phone', schedule: times(2), goals: ['Relationships'] },
  { name: 'Dinner without phones', category: 'social', icon: 'heart', timeOfDay: 'evening', goals: ['Relationships'] },
  { name: 'Send one kind message', category: 'social', icon: 'heart', goals: ['Relationships'] },
  { name: 'Date night', category: 'social', icon: 'star', schedule: times(1), goals: ['Relationships'] },
  { name: 'Play with the kids, no screens', category: 'social', target: { amount: 20, unit: 'minutes', step: 10 }, goals: ['Relationships'] },
  { name: 'Meet someone in person', category: 'social', schedule: times(1), goals: ['Relationships'] },
];

// How often a template repeats, in the app's own terms.
export function templateFrequency(t) {
  if (t.frequency === 'monthly') return 'monthly';
  return t.schedule && t.schedule.type === 'times' ? 'weekly' : 'daily';
}

// Lower case, accents removed, punctuation and extra spaces dropped: "Café  au-lait" and "cafe au lait" match.
export function fold(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Templates for a goal (or all of them), narrowed by a search over the name, cue, unit, category and goals.
// Every word typed must be found. Order is the list's own.
export function searchTemplates(query = '', goal = '') {
  const words = fold(query).split(' ').filter(Boolean);
  return TEMPLATES.filter(t => {
    if (goal && !t.goals.includes(goal)) return false;
    if (!words.length) return true;
    const hay = fold([t.name, t.cue, t.target && t.target.unit, t.category, t.timeOfDay, ...t.goals].filter(Boolean).join(' '));
    return words.every(w => hay.includes(w));
  });
}
