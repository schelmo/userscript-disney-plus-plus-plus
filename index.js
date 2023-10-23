// ==UserScript==
// @name         Disney plus plus plus
// @namespace    https://github.com/schelmo
// @version      0.1
// @description  Real Links for Movies and Series (allows to open in new Tab) + Overlay with some Informations (title, year, brief description, type and genres)
// @author       schelmo
// @license      MIT
// @homepageURL  https://github.com/schelmo/userscript-disney-plus-plus-plus
// @supportURL   https://github.com/schelmo/userscript-disney-plus-plus-plus
// @match        https://www.disneyplus.com/*
// @grant        unsafeWindow
// ==/UserScript==

const lang = location.pathname.split("/")[1];
const items = new Map();
let bamGridUrlResolver;

const capitalize = (s) => s && s[0].toUpperCase() + s.slice(1);

const buildLink = (item) => {
  if (item.encodedSeriesId) return `/${lang}/series/x/${item.encodedSeriesId}`;
  else if (["movie", "short-form"].includes(item.programType))
    return `/${lang}/movies/s/${item.family.encodedFamilyId}`;
  else console.log(item);
};
const getTitle = (item) => {
  return (
    item.text?.title?.full?.series?.default?.content ||
    item.text?.title?.full?.program?.default?.content ||
    item.internalTitle
  );
};
const getTitleWithYear = (item) => {
  const title = getTitle(item);
  let year;
  if (item.seasonsMinYear && item.seasonsMaxYear)
    year = `${item.seasonsMinYear} - ${item.seasonsMaxYear}`;
  else year = item.releases?.releaseYear || item.releases?.[0]?.releaseYear;
  return year ? `${title} <small>(${year})</small>` : title;
};

const getDescription = async (item) => {
  if (item.description) return item.description;
  let description =
    item.text?.description?.brief?.series?.default?.content ||
    item.text?.description?.brief?.program?.default?.content;
  if (description) {
    item.description = description;
    return description;
  }
  if (!bamGridUrlResolver) return;
  const isSeries = !!item.seriesId;
  const content = item.seriesId ? "DmcSeriesBundle" : "DmcVideoBundle";
  const params = item.seriesId
    ? ["encodedSeriesId", item.encodedSeriesId]
    : ["encodedFamilyId", item.family.encodedFamilyId];
  const url = bamGridUrlResolver(content, params);
  const response = await fetch(url);
  const json = await response.json();
  const key = item.seriesId ? "series" : "video";
  const newItemData = json.data?.[content]?.[key];
  if (newItemData) Object.assign(item, newItemData);

  description =
    item.text?.description?.brief?.series?.default?.content ||
    item.text?.description?.brief?.program?.default?.content;

  if (description) item.description = description;

  return description;
};

const overlay = document.createElement("div");
const overlayH1 = document.createElement("h1");
overlay.appendChild(overlayH1);
const overlayInner = document.createElement("div");
overlay.appendChild(overlayInner);
const overlayBottom = document.createElement("footer");
overlay.appendChild(overlayBottom);

document.addEventListener(
  "pointerenter",
  async (evt) => {
    if (evt.target?.nodeName !== "A") return;
    const data = evt.target.dataset;
    if (!["contentId", "encodedSeriesId"].includes(data.gv2elementtype)) return;
    if (!items.has(data.gv2elementvalue)) return;
    const item = items.get(data.gv2elementvalue);
    if (!evt.target.href) evt.target.href = buildLink(item);
    let hovered = true;
    evt.target.addEventListener(
      "pointerleave",
      () => {
        hovered = false;
        overlay.classList.add("hidden");
      },
      { once: true },
    );

    if (!hovered) return;
    const setContents = () => {
      if (!hovered) return;
      overlayH1.innerHTML = getTitleWithYear(item);
      const bottom = [];
      if (item.seriesId) bottom.push("Series");
      else if (item.programType) bottom.push(capitalize(item.programType));
      if (item.typedGenres?.length)
        bottom.push(item.typedGenres.map((g) => g.name).join(", "));
      overlayBottom.textContent = bottom.join(" – ");

      overlayInner.textContent = item.description;
    };
    setContents();

    overlay.classList.remove("hidden");
    evt.target.appendChild(overlay);

    if (item.description) return;

    const description = await getDescription(item);
    if (description) setContents();
  },
  { capture: true },
);

const setKeys = [
  "ContinueWatchingSet",
  "CuratedSet",
  "PersonalizedCuratedSet",
  "GenericSet",
  "WatchlistSet",
  "RecommendationSet",
  "BecauseYouSet",
  "RelatedItems",
  "search",
];
const collect = (data, url, byFetch) => {
  setKeys.some((key) => {
    if (!data[key]) return;
    const itemsKey = key === "search" ? "hits" : "items";
    // if (data[key][itemsKey]) console.log(url, {byFetch})
    data[key][itemsKey]?.forEach((item) => {
      if (itemsKey === "hits") item = item.hit;
      // programType: "episode"
      if (item.seriesId) {
        items.set(item.contentId, item);
        items.set(item.seriesId, item);
        items.set(item.encodedSeriesId, item);
      } else if (
        ["movie", "short-form"].includes(item.programType) &&
        item.contentId
      ) {
        items.set(item.contentId, item);
        items.set(item.family.encodedFamilyId, item);
      } else if (item.programType) console.log("ITEM", item?.programType, item);
    });
    return true;
  });

  if (!bamGridUrlResolver) {
    const _url = new URL(url);
    if (!_url.pathname.startsWith("/svc/")) return;
    const [
      _,
      svc,
      contentKey,
      content,
      versionKey,
      version,
      regionKey,
      region,
      audienceKey,
      audience,
      maturityKey,
      maturity,
      languageKey,
      language,
    ] = _url.pathname.split("/");

    if (versionKey !== "version" || languageKey !== "language") return;

    bamGridUrlResolver = (
      content = "DmcSeriesBundle",
      params = [],
      version = "5.1",
    ) => {
      _url.pathname = [
        "",
        svc,
        contentKey,
        content,
        versionKey,
        version,
        regionKey,
        region,
        audienceKey,
        audience,
        maturityKey,
        maturity,
        languageKey,
        language,
        ...params,
      ].join("/");
      return _url;
    };
  }
};

const urlMatchers = [
  "/svc/search/disney/",
  ...setKeys.map((key) => "/svc/content/" + key),
];

unsafeWindow.fetch = async (url, ...args) => {
  const response = await fetch(url, ...args);
  if (urlMatchers.some((matcher) => url.includes(matcher))) {
    const res = response.clone();
    requestIdleCallback(() => {
      res.json().then((json) => json.data && collect(json.data, url, true));
    });
  }

  return response;
};

var origOpen = unsafeWindow.XMLHttpRequest.prototype.open;
unsafeWindow.XMLHttpRequest.prototype.open = function (...args) {
  const url = args[1];
  if (urlMatchers?.some((matcher) => url.includes(matcher))) {
    this.addEventListener(
      "load",
      function () {
        const responseText = this.responseText;
        requestIdleCallback(() => {
          const json = JSON.parse(responseText);
          if (json.data) collect(json.data, url);
        });
      },
      { once: true },
    );
  }
  origOpen.apply(this, args);
};

const id = (Math.random() + 1).toString(36).substring(7);
overlay.id = id;
overlay.classList.add("hidden");
document.body.appendChild(overlay);
const style = document.createElement("style");
document.body.appendChild(style);
style.type = "text/css";
style.textContent = `
#${id} {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background-color: rgba(0,0,0,0.8);
    color: #ffffff;
    min-height: 100%;
    min-width: 100%;
    position: absolute;
    top: 0;
    left: 0;
    padding: 12px;
}
#${id} h1 {
    text-align: center;
    font-size: 18px;
}
#${id} small {
    font-size: 13px;
}
#${id} > div {
    text-align: center;
}
#${id} footer {
    text-align: center;
    font-size: 15px;
    font-style: italic;
}
#${id}.hidden {
    display: none;
}
`;
