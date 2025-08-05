// modules are defined as an array
// [ module function, map of requires ]
//
// map of requires is short require name -> numeric require
//
// anything defined in a previous bundle is accessed via the
// orig method which is the require for previous bundles
parcelRequire = (function (modules, cache, entry, globalName) {
  // Save the require from previous bundle to this closure if any
  var previousRequire = typeof parcelRequire === 'function' && parcelRequire;
  var nodeRequire = typeof require === 'function' && require;

  function newRequire(name, jumped) {
    if (!cache[name]) {
      if (!modules[name]) {
        // if we cannot find the module within our internal map or
        // cache jump to the current global require ie. the last bundle
        // that was added to the page.
        var currentRequire = typeof parcelRequire === 'function' && parcelRequire;
        if (!jumped && currentRequire) {
          return currentRequire(name, true);
        }

        // If there are other bundles on this page the require from the
        // previous one is saved to 'previousRequire'. Repeat this as
        // many times as there are bundles until the module is found or
        // we exhaust the require chain.
        if (previousRequire) {
          return previousRequire(name, true);
        }

        // Try the node require function if it exists.
        if (nodeRequire && typeof name === 'string') {
          return nodeRequire(name);
        }

        var err = new Error('Cannot find module \'' + name + '\'');
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      }

      localRequire.resolve = resolve;
      localRequire.cache = {};

      var module = cache[name] = new newRequire.Module(name);

      modules[name][0].call(module.exports, localRequire, module, module.exports, this);
    }

    return cache[name].exports;

    function localRequire(x){
      return newRequire(localRequire.resolve(x));
    }

    function resolve(x){
      return modules[name][1][x] || x;
    }
  }

  function Module(moduleName) {
    this.id = moduleName;
    this.bundle = newRequire;
    this.exports = {};
  }

  newRequire.isParcelRequire = true;
  newRequire.Module = Module;
  newRequire.modules = modules;
  newRequire.cache = cache;
  newRequire.parent = previousRequire;
  newRequire.register = function (id, exports) {
    modules[id] = [function (require, module) {
      module.exports = exports;
    }, {}];
  };

  var error;
  for (var i = 0; i < entry.length; i++) {
    try {
      newRequire(entry[i]);
    } catch (e) {
      // Save first error but execute all entries
      if (!error) {
        error = e;
      }
    }
  }

  if (entry.length) {
    // Expose entry point to Node, AMD or browser globals
    // Based on https://github.com/ForbesLindesay/umd/blob/master/template.js
    var mainExports = newRequire(entry[entry.length - 1]);

    // CommonJS
    if (typeof exports === "object" && typeof module !== "undefined") {
      module.exports = mainExports;

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
     define(function () {
       return mainExports;
     });

    // <script>
    } else if (globalName) {
      this[globalName] = mainExports;
    }
  }

  // Override the current require with this new one
  parcelRequire = newRequire;

  if (error) {
    // throw error from earlier, _after updating parcelRequire_
    throw error;
  }

  return newRequire;
})({"src/app.js":[function(require,module,exports) {
// Initialize map
var map = L.map('map', {
  zoomControl: false
}).setView([0, 0], 2);

// Add zoom control to top right
L.control.zoom({
  position: 'topright'
}).addTo(map);

// Add tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
var aoiLayer = null;
var passesLayer = L.layerGroup().addTo(map);

// UI Elements
var aoiFileInput = document.getElementById('aoiFile');
var aoiFileLabel = document.getElementById('aoiFileLabel');
var satNameInput = document.getElementById('satName');
var noradIdInput = document.getElementById('noradId');
var runBtn = document.getElementById('runBtn');
var passesList = document.getElementById('passesList');
var errorMessage = document.getElementById('errorMessage');
var successMessage = document.getElementById('successMessage');

// Utility functions
function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.style.display = 'block';
  successMessage.style.display = 'none';
  setTimeout(function () {
    errorMessage.style.display = 'none';
  }, 5000);
}
function showSuccess(msg) {
  successMessage.textContent = msg;
  successMessage.style.display = 'block';
  errorMessage.style.display = 'none';
  setTimeout(function () {
    successMessage.style.display = 'none';
  }, 3000);
}
function setLoading(isLoading) {
  if (isLoading) {
    runBtn.disabled = true;
    runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
  } else {
    checkFormValidity();
    runBtn.innerHTML = '<i class="fas fa-play"></i> <span>Run Prediction</span>';
  }
}
function formatDateTime(dateString) {
  var date = new Date(dateString);
  var options = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  return date.toLocaleString('en-US', options);
}
function checkFormValidity() {
  var hasAoi = runBtn.hasAttribute('data-aoi-id');
  var hasName = satNameInput.value.trim() !== '';
  var hasNorad = noradIdInput.value.trim() !== '';
  runBtn.disabled = !(hasAoi && hasName && hasNorad);
}

// AOI File Handler
aoiFileInput.addEventListener('change', function (e) {
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (event) {
    try {
      var geojson = JSON.parse(event.target.result);

      // Remove existing AOI layer
      if (aoiLayer) {
        map.removeLayer(aoiLayer);
      }

      // Add new AOI layer with custom styling
      aoiLayer = L.geoJSON(geojson, {
        style: {
          fillColor: '#667eea',
          weight: 3,
          opacity: 1,
          color: '#667eea',
          fillOpacity: 0.2
        }
      }).addTo(map);
      map.fitBounds(aoiLayer.getBounds());

      // Update file label
      aoiFileLabel.classList.add('has-file');
      aoiFileLabel.innerHTML = '<i class="fas fa-check-circle"></i> <span>' + file.name + '</span>';

      // Send AOI to backend
      fetch('http://localhost:8000/aois/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          geom: geojson
        })
      }).then(function (res) {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      }).then(function (data) {
        // Enable run button
        runBtn.setAttribute('data-aoi-id', data.id);
        checkFormValidity();
        showSuccess('AOI uploaded successfully!');
      }).catch(function (err) {
        showError('Error uploading AOI: ' + err.message);
        // Reset file input
        aoiFileLabel.classList.remove('has-file');
        aoiFileLabel.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> <span>Select GeoJSON file</span>';
      });
    } catch (err) {
      showError('Error processing GeoJSON file: ' + err.message);
      // Reset file input
      aoiFileLabel.classList.remove('has-file');
      aoiFileLabel.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> <span>Select GeoJSON file</span>';
    }
  };
  reader.readAsText(file);
});

// Run Prediction Handler
runBtn.addEventListener('click', function () {
  var name = satNameInput.value.trim();
  var norad = parseInt(noradIdInput.value, 10);
  var aoiId = Number(runBtn.getAttribute('data-aoi-id'));
  if (!name || !norad || !aoiId) {
    return showError('Please fill in all fields and upload an AOI first.');
  }
  setLoading(true);

  // 1) Download and save TLE
  fetch('http://localhost:8000/tles/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: name,
      norad_id: norad
    })
  }).then(function (res) {
    if (!res.ok) {
      return res.json().then(function (err) {
        throw new Error(err.detail || res.statusText);
      });
    }
    return res.json();
  }).then(function (tleData) {
    // 2) Predict passes
    var start = new Date().toISOString();
    return fetch('http://localhost:8000/predict/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        aoi_id: aoiId,
        tle_ids: [tleData.id],
        start: start
      })
    });
  }).then(function (res) {
    if (!res.ok) {
      return res.json().then(function (err) {
        throw new Error(err.detail || res.statusText);
      });
    }
    return res.json();
  }).then(function (passes) {
    // 3) Display results
    displayPasses(passes);
    showSuccess('Found ' + passes.length + ' orbital passes!');
  }).catch(function (err) {
    showError('Prediction failed: ' + err.message);
  }).finally(function () {
    setLoading(false);
  });
});
function displayPasses(passes) {
  // Clear existing passes
  passesList.innerHTML = '';
  passesLayer.clearLayers();
  if (passes.length === 0) {
    passesList.innerHTML = '<div class="empty-state">' + '<i class="fas fa-search"></i>' + '<p>No orbital passes found for the selected parameters</p>' + '</div>';
    return;
  }
  passes.forEach(function (pass, index) {
    // Create pass item
    var passItem = document.createElement('div');
    passItem.className = 'pass-item';
    passItem.innerHTML = '<div class="pass-time">Pass #' + (index + 1) + '</div>' + '<div class="pass-details">' + '<div><i class="fas fa-arrow-up"></i> Rise: ' + formatDateTime(pass.rise_time) + '</div>' + '<div><i class="fas fa-arrow-down"></i> Set: ' + formatDateTime(pass.set_time) + '</div>' + '</div>';

    // Add click handler to focus on pass
    (function (currentPass) {
      passItem.addEventListener('click', function () {
        var trackLayer = L.geoJSON(currentPass.track);
        map.fitBounds(trackLayer.getBounds());
      });
    })(pass);
    passesList.appendChild(passItem);

    // Add track to map with custom styling
    var hue = index * 360 / passes.length;
    L.geoJSON(pass.track, {
      style: {
        color: 'hsl(' + hue + ', 70%, 50%)',
        weight: 3,
        opacity: 0.8
      }
    }).addTo(passesLayer);
  });
}

// Form validation listeners
satNameInput.addEventListener('input', checkFormValidity);
noradIdInput.addEventListener('input', checkFormValidity);
},{}],"node_modules/parcel-bundler/src/builtins/hmr-runtime.js":[function(require,module,exports) {
var global = arguments[3];
var OVERLAY_ID = '__parcel__error__overlay__';
var OldModule = module.bundle.Module;
function Module(moduleName) {
  OldModule.call(this, moduleName);
  this.hot = {
    data: module.bundle.hotData,
    _acceptCallbacks: [],
    _disposeCallbacks: [],
    accept: function (fn) {
      this._acceptCallbacks.push(fn || function () {});
    },
    dispose: function (fn) {
      this._disposeCallbacks.push(fn);
    }
  };
  module.bundle.hotData = null;
}
module.bundle.Module = Module;
var checkedAssets, assetsToAccept;
var parent = module.bundle.parent;
if ((!parent || !parent.isParcelRequire) && typeof WebSocket !== 'undefined') {
  var hostname = "" || location.hostname;
  var protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  var ws = new WebSocket(protocol + '://' + hostname + ':' + "58794" + '/');
  ws.onmessage = function (event) {
    checkedAssets = {};
    assetsToAccept = [];
    var data = JSON.parse(event.data);
    if (data.type === 'update') {
      var handled = false;
      data.assets.forEach(function (asset) {
        if (!asset.isNew) {
          var didAccept = hmrAcceptCheck(global.parcelRequire, asset.id);
          if (didAccept) {
            handled = true;
          }
        }
      });

      // Enable HMR for CSS by default.
      handled = handled || data.assets.every(function (asset) {
        return asset.type === 'css' && asset.generated.js;
      });
      if (handled) {
        console.clear();
        data.assets.forEach(function (asset) {
          hmrApply(global.parcelRequire, asset);
        });
        assetsToAccept.forEach(function (v) {
          hmrAcceptRun(v[0], v[1]);
        });
      } else if (location.reload) {
        // `location` global exists in a web worker context but lacks `.reload()` function.
        location.reload();
      }
    }
    if (data.type === 'reload') {
      ws.close();
      ws.onclose = function () {
        location.reload();
      };
    }
    if (data.type === 'error-resolved') {
      console.log('[parcel] ✨ Error resolved');
      removeErrorOverlay();
    }
    if (data.type === 'error') {
      console.error('[parcel] 🚨  ' + data.error.message + '\n' + data.error.stack);
      removeErrorOverlay();
      var overlay = createErrorOverlay(data);
      document.body.appendChild(overlay);
    }
  };
}
function removeErrorOverlay() {
  var overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.remove();
  }
}
function createErrorOverlay(data) {
  var overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;

  // html encode message and stack trace
  var message = document.createElement('div');
  var stackTrace = document.createElement('pre');
  message.innerText = data.error.message;
  stackTrace.innerText = data.error.stack;
  overlay.innerHTML = '<div style="background: black; font-size: 16px; color: white; position: fixed; height: 100%; width: 100%; top: 0px; left: 0px; padding: 30px; opacity: 0.85; font-family: Menlo, Consolas, monospace; z-index: 9999;">' + '<span style="background: red; padding: 2px 4px; border-radius: 2px;">ERROR</span>' + '<span style="top: 2px; margin-left: 5px; position: relative;">🚨</span>' + '<div style="font-size: 18px; font-weight: bold; margin-top: 20px;">' + message.innerHTML + '</div>' + '<pre>' + stackTrace.innerHTML + '</pre>' + '</div>';
  return overlay;
}
function getParents(bundle, id) {
  var modules = bundle.modules;
  if (!modules) {
    return [];
  }
  var parents = [];
  var k, d, dep;
  for (k in modules) {
    for (d in modules[k][1]) {
      dep = modules[k][1][d];
      if (dep === id || Array.isArray(dep) && dep[dep.length - 1] === id) {
        parents.push(k);
      }
    }
  }
  if (bundle.parent) {
    parents = parents.concat(getParents(bundle.parent, id));
  }
  return parents;
}
function hmrApply(bundle, asset) {
  var modules = bundle.modules;
  if (!modules) {
    return;
  }
  if (modules[asset.id] || !bundle.parent) {
    var fn = new Function('require', 'module', 'exports', asset.generated.js);
    asset.isNew = !modules[asset.id];
    modules[asset.id] = [fn, asset.deps];
  } else if (bundle.parent) {
    hmrApply(bundle.parent, asset);
  }
}
function hmrAcceptCheck(bundle, id) {
  var modules = bundle.modules;
  if (!modules) {
    return;
  }
  if (!modules[id] && bundle.parent) {
    return hmrAcceptCheck(bundle.parent, id);
  }
  if (checkedAssets[id]) {
    return;
  }
  checkedAssets[id] = true;
  var cached = bundle.cache[id];
  assetsToAccept.push([bundle, id]);
  if (cached && cached.hot && cached.hot._acceptCallbacks.length) {
    return true;
  }
  return getParents(global.parcelRequire, id).some(function (id) {
    return hmrAcceptCheck(global.parcelRequire, id);
  });
}
function hmrAcceptRun(bundle, id) {
  var cached = bundle.cache[id];
  bundle.hotData = {};
  if (cached) {
    cached.hot.data = bundle.hotData;
  }
  if (cached && cached.hot && cached.hot._disposeCallbacks.length) {
    cached.hot._disposeCallbacks.forEach(function (cb) {
      cb(bundle.hotData);
    });
  }
  delete bundle.cache[id];
  bundle(id);
  cached = bundle.cache[id];
  if (cached && cached.hot && cached.hot._acceptCallbacks.length) {
    cached.hot._acceptCallbacks.forEach(function (cb) {
      cb();
    });
    return true;
  }
}
},{}]},{},["node_modules/parcel-bundler/src/builtins/hmr-runtime.js","src/app.js"], null)
//# sourceMappingURL=/app.a6a4d504.js.map