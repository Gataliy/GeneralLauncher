// Update from the internet. "Проверить обновления" in "О программе" reads bundle.json from the update address,
// checks it and stores it. The next start runs the stored copy (see boot.js).
// Only bundle.json is needed on the repository: its "version" field is the version number.
let pendingUpdate = null;
const UPDATE_URL_KEY = "generic_launcher_update_url_v1";
const UPDATE_BUNDLE_KEY = "generic_launcher_bundle_v1";
const UPDATE_FILE = "bundle.json";
// Address of the published launcher folder (raw files of the repository). Can be changed in the settings storage if the repository moves.
const DEFAULT_UPDATE_URL = "https://raw.githubusercontent.com/Gataliy/GeneralLauncher/main/";

function updateBaseUrl() {
  try { return localStorage.getItem(UPDATE_URL_KEY) || DEFAULT_UPDATE_URL; }
  catch (error) { return DEFAULT_UPDATE_URL; }
}

function fetchUpdateText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  return fetch(url, { cache: "no-store", signal: controller.signal })
    .then(response => { if (!response.ok) throw new Error("сервер ответил " + response.status); return response.text(); })
    .finally(() => clearTimeout(timer));
}

// Checks that a bundle is complete: every script and the stylesheet are in it (scripts on the drive-only list excepted).
function checkBundle(bundle) {
  if (!bundle || typeof bundle.version !== "string" || !bundle.version || !Array.isArray(bundle.order) || !bundle.files) {
    throw new Error("пакет обновления повреждён");
  }
  const flashOnly = Array.isArray(bundle.flashOnly) ? bundle.flashOnly : [];
  if (typeof bundle.files["styles.css"] !== "string" || !bundle.order.every(name => flashOnly.includes(name) || typeof bundle.files[name] === "string")) {
    throw new Error("в пакете не хватает файлов");
  }
  return bundle;
}

// Reads bundle.json: returns { version, bundle }. Throws if the address does not answer or the file is broken.
async function checkForUpdate() {
  const bundle = checkBundle(JSON.parse(await fetchUpdateText(updateBaseUrl() + UPDATE_FILE + "?t=" + Date.now())));
  return { version: bundle.version, bundle };
}

// Stores the checked bundle. It is stored only if it is complete (see boot.js).
async function downloadUpdate(info) {
  const bundle = checkBundle(info && info.bundle);
  try { localStorage.setItem(UPDATE_BUNDLE_KEY, JSON.stringify(bundle)); }
  catch (error) { throw new Error("не хватает памяти для обновления"); }
  return bundle;
}

// Forgets the stored copy: the launcher then runs the build from the drive again.
function dropUpdate() {
  try { localStorage.removeItem(UPDATE_BUNDLE_KEY); } catch (error) { /* nothing stored */ }
}
