"use strict";

export function ffiWatchDist(dir) {
  return function (callback) {
    return function () {
      var debounceTimer = null;
      var pendingFiles = [];

      var watcher = Bun.watch(dir, function (event, filename) {
        pendingFiles.push(filename);
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(function () {
          debounceTimer = null;
          var files = pendingFiles.slice();
          pendingFiles = [];
          callback(files)();
        }, 300);
      });

      return function () {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        watcher.unsubscribe();
      };
    };
  };
}
