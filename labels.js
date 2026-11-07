// labels.js: every tappable person and place at Gettysburg on July 3, 1863. Quotations are checked word for word
// against Haskell's letter (Project Gutenberg #33121) and the official reports (OR vol. 27) in research.md.
//   key: { type 'person' | 'place', kind (the small line), name, line, teach (optional) }
window.LABELS = {
  csaGuns: { type: 'place', kind: 'Confederate artillery', name: 'The guns on Seminary Ridge', line: '"A hundred and twenty-five rebel guns, we estimate, are now active."', teach: 'Lt. Frank Haskell, 1863' },
  unionGuns: { type: 'place', kind: 'Union artillery', name: 'The guns on Cemetery Ridge', line: '"our guns, the guardian lions of the crest"', teach: 'Lt. Frank Haskell, 1863' },
  napoleon: { type: 'place', kind: 'A Union cannon', name: 'A twelve-pound Napoleon', line: '"the dazzling brass of the Napoleons"', teach: 'Lt. Frank Haskell, 1863' },
  copse: { type: 'place', kind: 'A landmark', name: 'The Copse of Trees', line: '"that group of trees which ought to be historic forever"', teach: 'Lt. Frank Haskell, 1863' },
  wall: { type: 'place', kind: 'A stone wall', name: 'The Angle', line: '"a stone fence, constructed of small, rough stones"', teach: 'Lt. Frank Haskell, 1863' },
  swale: { type: 'place', kind: 'The fields', name: 'The swale', line: '"a ravine partially sheltered our troops"', teach: 'Gen. James Longstreet, official report' },
  fields: { type: 'place', kind: 'The fields', name: 'Between the ridges', line: '"through orchard and meadow, and cornfield"', teach: 'Lt. Frank Haskell, 1863' },
  road: { type: 'place', kind: 'A road', name: 'The Emmitsburg Road', line: 'The lines climbed its fences and kept going.' },
  farm: { type: 'place', kind: 'A farm', name: 'A farm by the road', line: 'Farm families lived all over this battlefield.' },
  csaLines: { type: 'person', kind: 'Confederate infantry', name: 'Pickett, Pettigrew and Trimble\'s men', line: '"The advance was made in very handsome style"', teach: 'Gen. James Longstreet, official report' },
  csaFlag: { type: 'person', kind: 'A flag-bearer', name: 'Confederate colours', line: '"The red flags wave"', teach: 'Lt. Frank Haskell, 1863' },
  csaSoldier: { type: 'person', kind: 'Confederate soldier', name: 'A soldier from Virginia', line: 'They waited in the shade of the woods on Seminary Ridge.' },
  unionInf: { type: 'person', kind: 'Union infantry', name: 'Gibbon\'s division', line: '"they hug the ground, silent, quiet, unterrified, little harmed"', teach: 'Lt. Frank Haskell, 1863' },
  unionSoldier: { type: 'person', kind: 'Union soldier', name: 'A soldier of the Second Corps', line: 'He waited behind the stone wall on Cemetery Ridge.' },
  vermont: { type: 'person', kind: 'Union infantry', name: 'Stannard\'s Vermonters', line: '"Stannard\'s bushy crest"', teach: 'Lt. Frank Haskell, 1863' },
  gunner: { type: 'person', kind: 'Artillery crew', name: 'A gun crew', line: 'Each gun had a crew to load, aim and fire it.' },
  hunt: { type: 'person', kind: 'Union general', name: 'Gen. Henry Hunt', line: 'Chief of artillery for the Union army. He rode along the gun line.' },
  csaOfficer: { type: 'person', kind: 'Confederate officer', name: 'An officer on horseback', line: '"their horsemen gallop up and down"', teach: 'Lt. Frank Haskell, 1863' },
  haskell: { type: 'person', kind: 'Union officer', name: 'Lt. Frank Haskell', line: '"It was five minutes before one o\'clock."', teach: 'He wrote a long letter home about this day.' },
  horse: { type: 'person', kind: 'A horse', name: 'Haskell\'s horse', line: '"eating oats, with an air of the greatest composure"', teach: 'Lt. Frank Haskell, 1863' },
  csaCamp: { type: 'place', kind: 'A camp', name: 'Camp in the woods', line: 'The Confederate lines waited in these woods, then formed at their edge.' },
  unionCamp: { type: 'place', kind: 'A camp', name: 'The Union camp', line: '"the muskets in stacks upon the crest"', teach: 'Lt. Frank Haskell, 1863' },
  roundTop: { type: 'place', kind: 'A rocky hill', name: 'Little Round Top', line: 'The rock was so close under the soil that soldiers could not dig. They hid behind boulders instead.', teach: 'National Park Service' },
  bigRoundTop: { type: 'place', kind: 'A wooded hill', name: 'Big Round Top', line: 'The highest hill on the battlefield.' },
  culps: { type: 'place', kind: 'A wooded hill', name: 'Culp\'s Hill', line: '"a large rock, forming a corner of breastworks on Culp\'s Hill"', teach: 'A photograph caption from the time' },
  gatling: { type: 'place', kind: 'Not really here!', name: 'A Gatling gun', line: 'No Gatling guns were at Gettysburg. A few were used at Petersburg, 1864–65.', teach: 'We added this one for fun.' },
};

// The story panel at the top left: the day's chapters in cycle seconds. Tapping one jumps the scene there.
window.STORY = [
  { from: 0, to: 30, title: 'A hot July morning', text: 'Two armies wait on two ridges, a mile apart. The soldiers rest in the shade by their camps.', ref: '"The silence and sultriness of a July noon are supreme." (Haskell)' },
  { from: 28, to: 42, title: 'The signal gun', text: 'At five minutes to one, a single cannon fires. Then the whole Confederate line answers.', ref: '"It was five minutes before one o\'clock." (Haskell)' },
  { from: 32, to: 80, title: 'The great cannonade', text: 'More than a hundred guns boom across the valley, and the Union guns boom back. Smoke rolls over the fields like a great cloud.', ref: '"They hiss, they scream, they growl, they sputter" (Haskell)' },
  { from: 76, to: 94, title: 'Quiet again', text: 'After about two hours the guns fall silent. The Confederate soldiers step out of the woods.', ref: '"At three o\'clock almost precisely the last shot hummed" (Haskell)' },
  { from: 90, to: 128, title: 'The long march', text: 'Three long lines walk across the open fields with their flags. They climb the fences by the road and keep going.', ref: '"Right on they move, as with one soul, in perfect order" (Haskell)' },
  { from: 125, to: 138, title: 'At the stone wall', text: 'The lines reach the wall by the little group of trees. The Union soldiers hold their ground.', ref: '"The advance was made in very handsome style" (Longstreet)' },
  { from: 134, to: 164, title: 'Back to the woods', text: 'The charge did not succeed, and the soldiers walk back to their lines. The battle is over.', ref: 'Gen. James Longstreet, official report' },
  { from: 156, to: 180, title: 'Evening in camp', text: 'Campfires glow and the guns get ready for the night. In the morning the camps wake up again.', ref: 'Lt. Frank Haskell, 1863: "Come, don\'t you hear that?" (Gen. Gibbon waking him at dawn)' },
];
