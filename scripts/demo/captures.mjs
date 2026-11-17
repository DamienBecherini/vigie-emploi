// Captures du tableau de bord pour le README (Chrome ou Edge sans interface, protocole DevTools, sans dépendance).
//   node scripts/demo/captures.mjs <espace-de-démo> fr|en [dossier-de-sortie=docs/captures]
// L'espace vient de scripts/demo/demo.ts ; l'interface doit être compilée (npm run build).
// Sortie : tableau-de-bord.png et detail-offre.png (fr), tableau-de-bord.en.png et detail-offre.en.png (en).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [espace, langue = 'fr', sortie = 'docs/captures'] = process.argv.slice(2);
if (!espace || !['fr', 'en'].includes(langue)) {
  console.error('Usage : node scripts/demo/captures.mjs <espace-de-démo> fr|en [dossier-de-sortie]');
  process.exit(2);
}
mkdirSync(sortie, { recursive: true });
const suffixe = langue === 'fr' ? '' : `.${langue}`;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const NAVIGATEURS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const navigateur = process.env.CHROME ?? NAVIGATEURS.find((c) => existsSync(c));
if (!navigateur) throw new Error('Chrome ou Edge introuvable (variable CHROME pour en donner le chemin)');

// Tableau de bord de l'espace, sur un port libre de la plage de démo
const PORT_UI = 4430 + (langue === 'fr' ? 0 : 1);
const base = `http://localhost:${PORT_UI}`;
const serveur = spawn(process.execPath, [resolve(import.meta.dirname, '../../bin/vigie-emploi.js'), 'serve', '--port', String(PORT_UI), '--data', resolve(espace)], { stdio: 'ignore' });
let pret = false;
for (let i = 0; i < 50 && !pret; i++) {
  await attendre(200);
  pret = await fetch(`${base}/api/sante`).then((r) => r.ok, () => false);
}
if (!pret) throw new Error(`tableau de bord injoignable sur ${base}`);

const PORT_CDP = 9333;
const profil = mkdtempSync(join(tmpdir(), 'captures-'));
const chrome = spawn(navigateur, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--lang=${langue}`, `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${profil}`, 'about:blank'], { stdio: 'ignore' });
let cible;
for (let i = 0; i < 50 && !cible; i++) {
  await attendre(200);
  try {
    cible = (await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json()).find((t) => t.type === 'page');
  } catch {}
}
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let n = 0;
const enAttente = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && enAttente.has(m.id)) {
    enAttente.get(m.id)(m);
    enAttente.delete(m.id);
  }
});
const cdp = (method, params = {}) =>
  new Promise((r) => {
    const id = ++n;
    enAttente.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluer = async (expression) => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

const vues = [
  { fichier: `tableau-de-bord${suffixe}.png`, chemin: '/?tri=recue_le:desc,note:desc', largeur: 1440, hauteur: 860 },
  { fichier: `detail-offre${suffixe}.png`, chemin: '/?tri=recue_le:desc,note:desc&offre=4', largeur: 1440, hauteur: 1000 },
];
try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: base });
  await attendre(1500);
  await evaluer(
    `localStorage.setItem('vigie-emploi:statistiques-visibles', 'true'); localStorage.setItem('vigie-emploi:theme', 'clair'); localStorage.setItem('vigie-emploi:langue', '${langue}'); true`,
  );
  for (const v of vues) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: v.largeur, height: v.hauteur, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: base + v.chemin });
    await attendre(3500);
    const lang = await evaluer('document.documentElement.lang');
    const img = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(sortie, v.fichier), Buffer.from(img.result.data, 'base64'));
    console.log(`${join(sortie, v.fichier)} (lang=${lang})`);
  }
} finally {
  ws.close();
  chrome.kill();
  serveur.kill();
  await attendre(500);
  rmSync(profil, { recursive: true, force: true });
}
