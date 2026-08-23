/** Manual smoke test for the Cash 5 Studio live source. */

const SOURCE = 'https://www.lotteryusa.com/south-carolina/palmetto-cash-5/year';

async function run() {
  const response = await fetch(SOURCE, {
    headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/605.1.15' }
  });
  if (!response.ok) throw new Error(`Cash 5 source returned HTTP ${response.status}`);
  const html = await response.text();
  const cards = (html.match(/c-draw-card/g) || []).length;
  if (!cards) throw new Error('Cash 5 source did not contain recognizable draw cards');
  console.log(`Cash 5 source returned ${cards} draw-card markers.`);
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
