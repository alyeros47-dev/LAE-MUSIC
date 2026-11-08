import {customerFeatures,hideInactiveFeatures} from './feature-visibility.js';
import { OfflineLibrary, offlinePage } from "./offline.js";
import { MusicPlayer } from "./player.js";
const node = (id) => document.getElementById(id);
async function api(path, method = "GET", data, options = {}) {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const value = await r.json();
  if (!r.ok) {
    const e = Error(value.error || "Reconnect to verify your offline library.");
    e.status = r.status;
    throw e;
  }
  return value;
}
function toast(text) {
  node("toast").textContent = text;
  node("toast").hidden = false;
  setTimeout(() => (node("toast").hidden = true), 4500);
}
const offline = new OfflineLibrary({ api, toast }),
  player = new MusicPlayer({
    api,
    toast,
    onLike: () => toast("Connect to manage favorites."),
    onDetail: () => {},
  });
offline.bind(player);
player.sourceProvider = (track) => offline.media(track);
for (const b of document.querySelectorAll("[data-close]"))
  b.onclick = () => b.closest("dialog").close();
node("global-search").onsubmit = (e) => {
  e.preventDefault();
  if (navigator.onLine) location.href = "/discover";
  else toast("Connect to discover more songs.");
};
node("currency-trigger").hidden = true;
node("header-signin").textContent = "Go online";
node("header-signin").href = "/";
node("open-menu").onclick = () => {
  document.body.classList.add("menu-open");
  node("open-menu").setAttribute("aria-expanded", "true");
};
node("close-menu").onclick = () => {
  document.body.classList.remove("menu-open");
  node("open-menu").setAttribute("aria-expanded", "false");
};
document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (a && a.getAttribute("href") !== "/offline" && !navigator.onLine) {
    e.preventDefault();
    toast("Connect to use this part of LAE-MUSIC.");
  }
});
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type !== "LAE_NAVIGATE") return;
  let target;
  try {
    target = new URL(event.data.url, location.origin);
    if (target.origin !== location.origin) return;
  } catch {
    return;
  }
  if (navigator.onLine)
    location.assign(target.pathname + target.search + target.hash);
  else
    toast("Connect to open this release. Your saved music remains available.");
});
let featureCapabilities={};
const featureState=()=>customerFeatures(featureCapabilities,{offline:offline.supported,offlineCached:!!offline.device,premiumActive:!!offline.device});
async function refresh() {
  if (navigator.onLine) {
    featureCapabilities=await api("/api/platform/capabilities").catch(()=>({}));
    const s = await api("/api/platform/session");
    await offline.activate(s.listener);
  } else await offline.boot();
}
const view = {
  set(html) {
    node("page").innerHTML = html;
    hideInactiveFeatures(document,featureState());
    return true;
  },
};
async function render() {
  await offlinePage(view, { offline, player, toast, route: render, refresh });
  node("account-label").textContent = offline.device
    ? "Saved for " + offline.device.name
    : "Your offline listening space";
  document.title = "Offline library | LAE-MUSIC";
}
offline.onchange = () => render().catch((e) => toast(e.message));
try {
  await offline.boot();
  if (navigator.onLine) await refresh();
  await render();
} catch (error) {
  node("page").replaceChildren();
  const h = document.createElement("h1");
  h.textContent = "Offline listening needs a connection.";
  const p = document.createElement("p");
  p.textContent = error.message;
  const a = document.createElement("a");
  a.href = "/";
  a.className = "button";
  a.textContent = "Go online";
  node("page").append(h, p, a);
}
window.addEventListener("online", () =>
  refresh()
    .then(render)
    .catch((e) => toast(e.message)),
);

export { offline, player, refresh, render };
