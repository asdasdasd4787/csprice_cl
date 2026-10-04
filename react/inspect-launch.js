(function (global) {
  const CS2_STEAM_CONTEXT = "76561202255233023";

  function normalizeSteamInspectUrl(inspectUrl) {
    let url = String(inspectUrl || "").trim();
    if (!url) {
      return "";
    }

    if (url.startsWith("csgo://")) {
      url = `steam${url.slice(4)}`;
    }

    url = url.replace("steam://run/730//", "steam://run/730/");

    if (/^steam:\/\/run\/730\/(?!76561202255233023\/)/i.test(url)) {
      url = url.replace(/^steam:\/\/run\/730\//i, `steam://run/730/${CS2_STEAM_CONTEXT}/`);
    }

    return url;
  }

  function launchSteamInspectUrl(inspectUrl) {
    const url = normalizeSteamInspectUrl(inspectUrl);
    if (!url) {
      return false;
    }

    try {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);
      global.setTimeout(() => iframe.remove(), 3000);
    } catch (_error) {}

    try {
      const link = document.createElement("a");
      link.href = url;
      link.style.display = "none";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return true;
    } catch (_error) {}

    try {
      global.location.assign(url);
      return true;
    } catch (_error) {}

    return false;
  }

  global.CS2InspectLaunch = {
    launchSteamInspectUrl,
    normalizeSteamInspectUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
