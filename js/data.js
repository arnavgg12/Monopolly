// Board, property and card data for the full Monopoly ruleset.
// 40 spaces, indexed 0..39 starting from GO and moving clockwise.

export const TOKENS = ['🎩', '🚗', '🐕', '🚢', '👞', '🐈', '🦖', '🚀'];

export const COLOR_GROUPS = {
  brown:  { name: 'Brown',      color: '#8B4513', count: 2, houseCost: 50  },
  lblue:  { name: 'Light Blue', color: '#AADEE6', count: 3, houseCost: 50  },
  pink:   { name: 'Pink',       color: '#D93A96', count: 3, houseCost: 100 },
  orange: { name: 'Orange',     color: '#F7941D', count: 3, houseCost: 100 },
  red:    { name: 'Red',        color: '#ED1B24', count: 3, houseCost: 150 },
  yellow: { name: 'Yellow',     color: '#FEF200', count: 3, houseCost: 150 },
  green:  { name: 'Green',      color: '#1FB25A', count: 3, houseCost: 200 },
  dblue:  { name: 'Dark Blue',  color: '#0072BB', count: 2, houseCost: 200 },
};

// Types: go, prop, rr, util, chance, chest, tax, jail, gotojail, parking
export const BOARD = [
  { i: 0,  type: 'go',     name: 'GO' },
  { i: 1,  type: 'prop',   name: 'Mediterranean Ave', group: 'brown',  price: 60,  mortgage: 30,  rent: [2, 10, 30, 90, 160, 250] },
  { i: 2,  type: 'chest',  name: 'Community Chest' },
  { i: 3,  type: 'prop',   name: 'Baltic Ave',        group: 'brown',  price: 60,  mortgage: 30,  rent: [4, 20, 60, 180, 320, 450] },
  { i: 4,  type: 'tax',    name: 'Income Tax',        amount: 200 },
  { i: 5,  type: 'rr',     name: 'Reading Railroad',  price: 200, mortgage: 100 },
  { i: 6,  type: 'prop',   name: 'Oriental Ave',      group: 'lblue',  price: 100, mortgage: 50,  rent: [6, 30, 90, 270, 400, 550] },
  { i: 7,  type: 'chance', name: 'Chance' },
  { i: 8,  type: 'prop',   name: 'Vermont Ave',       group: 'lblue',  price: 100, mortgage: 50,  rent: [6, 30, 90, 270, 400, 550] },
  { i: 9,  type: 'prop',   name: 'Connecticut Ave',   group: 'lblue',  price: 120, mortgage: 60,  rent: [8, 40, 100, 300, 450, 600] },
  { i: 10, type: 'jail',   name: 'Jail / Just Visiting' },
  { i: 11, type: 'prop',   name: 'St. Charles Place', group: 'pink',   price: 140, mortgage: 70,  rent: [10, 50, 150, 450, 625, 750] },
  { i: 12, type: 'util',   name: 'Electric Company',  price: 150, mortgage: 75 },
  { i: 13, type: 'prop',   name: 'States Ave',        group: 'pink',   price: 140, mortgage: 70,  rent: [10, 50, 150, 450, 625, 750] },
  { i: 14, type: 'prop',   name: 'Virginia Ave',      group: 'pink',   price: 160, mortgage: 80,  rent: [12, 60, 180, 500, 700, 900] },
  { i: 15, type: 'rr',     name: 'Pennsylvania RR',   price: 200, mortgage: 100 },
  { i: 16, type: 'prop',   name: 'St. James Place',   group: 'orange', price: 180, mortgage: 90,  rent: [14, 70, 200, 550, 750, 950] },
  { i: 17, type: 'chest',  name: 'Community Chest' },
  { i: 18, type: 'prop',   name: 'Tennessee Ave',     group: 'orange', price: 180, mortgage: 90,  rent: [14, 70, 200, 550, 750, 950] },
  { i: 19, type: 'prop',   name: 'New York Ave',      group: 'orange', price: 200, mortgage: 100, rent: [16, 80, 220, 600, 800, 1000] },
  { i: 20, type: 'parking',name: 'Free Parking' },
  { i: 21, type: 'prop',   name: 'Kentucky Ave',      group: 'red',    price: 220, mortgage: 110, rent: [18, 90, 250, 700, 875, 1050] },
  { i: 22, type: 'chance', name: 'Chance' },
  { i: 23, type: 'prop',   name: 'Indiana Ave',       group: 'red',    price: 220, mortgage: 110, rent: [18, 90, 250, 700, 875, 1050] },
  { i: 24, type: 'prop',   name: 'Illinois Ave',      group: 'red',    price: 240, mortgage: 120, rent: [20, 100, 300, 750, 925, 1100] },
  { i: 25, type: 'rr',     name: 'B & O Railroad',    price: 200, mortgage: 100 },
  { i: 26, type: 'prop',   name: 'Atlantic Ave',      group: 'yellow', price: 260, mortgage: 130, rent: [22, 110, 330, 800, 975, 1150] },
  { i: 27, type: 'prop',   name: 'Ventnor Ave',       group: 'yellow', price: 260, mortgage: 130, rent: [22, 110, 330, 800, 975, 1150] },
  { i: 28, type: 'util',   name: 'Water Works',       price: 150, mortgage: 75 },
  { i: 29, type: 'prop',   name: 'Marvin Gardens',    group: 'yellow', price: 280, mortgage: 140, rent: [24, 120, 360, 850, 1025, 1200] },
  { i: 30, type: 'gotojail', name: 'Go To Jail' },
  { i: 31, type: 'prop',   name: 'Pacific Ave',       group: 'green',  price: 300, mortgage: 150, rent: [26, 130, 390, 900, 1100, 1275] },
  { i: 32, type: 'prop',   name: 'North Carolina Ave',group: 'green',  price: 300, mortgage: 150, rent: [26, 130, 390, 900, 1100, 1275] },
  { i: 33, type: 'chest',  name: 'Community Chest' },
  { i: 34, type: 'prop',   name: 'Pennsylvania Ave',  group: 'green',  price: 320, mortgage: 160, rent: [28, 150, 450, 1000, 1200, 1400] },
  { i: 35, type: 'rr',     name: 'Short Line',        price: 200, mortgage: 100 },
  { i: 36, type: 'chance', name: 'Chance' },
  { i: 37, type: 'prop',   name: 'Park Place',        group: 'dblue',  price: 350, mortgage: 175, rent: [35, 175, 500, 1100, 1300, 1500] },
  { i: 38, type: 'tax',    name: 'Luxury Tax',        amount: 100 },
  { i: 39, type: 'prop',   name: 'Boardwalk',         group: 'dblue',  price: 400, mortgage: 200, rent: [50, 200, 600, 1400, 1700, 2000] },
];

// Card actions: see game.js applyCard()
// kinds: move, moveTo, moveNearest, collect, pay, payEach, collectEach,
//        gotoJail, jailFree, repairs, backThree
export const CHANCE_CARDS = [
  { text: 'Advance to GO. Collect $200.',                                          kind: 'moveTo',      to: 0 },
  { text: 'Advance to Illinois Ave. If you pass GO, collect $200.',                kind: 'moveTo',      to: 24 },
  { text: 'Advance to St. Charles Place. If you pass GO, collect $200.',           kind: 'moveTo',      to: 11 },
  { text: 'Advance to nearest Utility. Pay 10x dice if owned.',                    kind: 'moveNearest', target: 'util' },
  { text: 'Advance to nearest Railroad. Pay double rent if owned.',                kind: 'moveNearest', target: 'rr' },
  { text: 'Bank pays you a dividend of $50.',                                      kind: 'collect',     amount: 50 },
  { text: 'Get Out of Jail Free. Keep this card.',                                 kind: 'jailFree' },
  { text: 'Go back three spaces.',                                                 kind: 'backThree' },
  { text: 'Go to Jail. Do not pass GO, do not collect $200.',                      kind: 'gotoJail' },
  { text: 'Make general repairs: pay $25 per house, $100 per hotel.',              kind: 'repairs',     perHouse: 25, perHotel: 100 },
  { text: 'Speeding fine. Pay $15.',                                               kind: 'pay',         amount: 15 },
  { text: 'Take a trip to Reading Railroad. If you pass GO, collect $200.',        kind: 'moveTo',      to: 5 },
  { text: 'Advance to Boardwalk.',                                                 kind: 'moveTo',      to: 39 },
  { text: 'You have been elected Chairman. Pay each player $50.',                  kind: 'payEach',     amount: 50 },
  { text: 'Your building loan matures. Collect $150.',                             kind: 'collect',     amount: 150 },
  { text: 'You won a crossword competition. Collect $100.',                        kind: 'collect',     amount: 100 },
];

export const CHEST_CARDS = [
  { text: 'Advance to GO. Collect $200.',                                          kind: 'moveTo',      to: 0 },
  { text: 'Bank error in your favor. Collect $200.',                               kind: 'collect',     amount: 200 },
  { text: "Doctor's fees. Pay $50.",                                               kind: 'pay',         amount: 50 },
  { text: 'From sale of stock you get $50.',                                       kind: 'collect',     amount: 50 },
  { text: 'Get Out of Jail Free. Keep this card.',                                 kind: 'jailFree' },
  { text: 'Go to Jail. Do not pass GO, do not collect $200.',                      kind: 'gotoJail' },
  { text: 'Grand Opera Night. Collect $50 from every player.',                     kind: 'collectEach', amount: 50 },
  { text: 'Holiday Fund matures. Collect $100.',                                   kind: 'collect',     amount: 100 },
  { text: 'Income tax refund. Collect $20.',                                       kind: 'collect',     amount: 20 },
  { text: "It's your birthday. Collect $10 from every player.",                    kind: 'collectEach', amount: 10 },
  { text: 'Life insurance matures. Collect $100.',                                 kind: 'collect',     amount: 100 },
  { text: 'Hospital fees. Pay $100.',                                              kind: 'pay',         amount: 100 },
  { text: 'School fees. Pay $50.',                                                 kind: 'pay',         amount: 50 },
  { text: 'Receive $25 consultancy fee.',                                          kind: 'collect',     amount: 25 },
  { text: 'Street repairs. Pay $40 per house, $115 per hotel.',                    kind: 'repairs',     perHouse: 40, perHotel: 115 },
  { text: 'You won second prize in a beauty contest. Collect $10.',                kind: 'collect',     amount: 10 },
  { text: 'You inherit $100.',                                                     kind: 'collect',     amount: 100 },
];

export const STARTING_CASH = 1500;
export const PASS_GO       = 200;
export const JAIL_FEE      = 50;
export const JAIL_INDEX    = 10;
export const GO_TO_JAIL_INDEX = 30;
export const MAX_JAIL_TURNS = 3;
