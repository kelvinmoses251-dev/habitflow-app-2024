// Stats insights: plain-language reads of the user's own check-in history.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, visible, sleep, signedIn, noExceptions } = c;
  const TZ = 'Africa/Lagos';
  const key = n => { const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: TZ }) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dow = k => new Date(k + 'T12:00:00Z').getUTCDay();
  const habit = (name, dates) => ({ userId: 'u-test', name, category: 'fitness', frequency: 'daily', completedDates: dates, createdAt: new Date(Date.now() - 60 * 864e5).toISOString(), order: 1 });
  const open = async habits => {
    await boot({ tz: TZ, seed: { ...signedIn(), mock_fb_db: { habits } } });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await ev(`location.hash = '#stats'`);
    await sleep(900);
  };
  const items = () => ev(`[...document.querySelectorAll('#insights-list li')].map(li => li.textContent)`);

  scenario('insights: momentum, strongest weekday and best streak', async () => {
    // 4 check-ins this week vs 2 last week => "Up 100%"; plus a run of 8 Mondays for the weekday read
    const dates = new Set([key(0), key(-1), key(-2), key(-3), key(-7), key(-8)]);
    let mondays = 0;
    for (let n = 0; n < 56 && mondays < 8; n++) if (dow(key(-n)) === 1) { dates.add(key(-n)); mondays++; }
    await open({ h1: habit('Run', [...dates]) });
    check('insights card shown', await visible('#insights-card'));
    const list = (await items()).join(' | ');
    check('momentum read is present', /(Up|Down) \d+%|Steady|Up/.test(list), list);
    check('names a strongest weekday', /are your strongest day/.test(list), list);
    check('best streak surfaced (4 consecutive days)', /best streak ever: 4 days/.test(list), list);
    noExceptions();
  });

  scenario('insights: exact momentum arithmetic (4 vs 2 => Up 100%)', async () => {
    await open({ h1: habit('Read', [key(0), key(-1), key(-2), key(-3), key(-7), key(-8)]) });
    check('says Up 100%', /Up 100%/.test((await items()).join(' | ')), (await items()).join(' | '));
  });

  scenario('insights: a falling week is described honestly', async () => {
    await open({ h1: habit('Read', [key(-1), key(-8), key(-9), key(-10), key(-11)]) });
    check('says Down 75%', /Down 75%/.test((await items()).join(' | ')), (await items()).join(' | '));
  });

  scenario('insights: stays hidden when there is too little data', async () => {
    await open({ h1: habit('Read', [key(0)]) });
    check('card hidden', !(await visible('#insights-card')));
  });

  scenario('insights: habit names are escaped', async () => {
    await open({ h1: habit('<img src=x onerror=window.__x=1>', [key(0), key(-1), key(-2), key(-3), key(-4)]) });
    check('no injected element', (await ev(`document.querySelectorAll('#insights-list img').length`)) === 0);
    check('payload did not run', (await ev(`window.__x === undefined`)) === true);
  });
};
