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
    setTimeout(function() {
        errorMessage.style.display = 'none';
    }, 5000);
}

function showSuccess(msg) {
    successMessage.textContent = msg;
    successMessage.style.display = 'block';
    errorMessage.style.display = 'none';
    setTimeout(function() {
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
aoiFileInput.addEventListener('change', function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(event) {
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geom: geojson }),
            })
            .then(function(res) {
                if (!res.ok) throw new Error(res.statusText);
                return res.json();
            })
            .then(function(data) {
                // Enable run button
                runBtn.setAttribute('data-aoi-id', data.id);
                checkFormValidity();
                showSuccess('AOI uploaded successfully!');
            })
            .catch(function(err) {
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
runBtn.addEventListener('click', function() {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, norad_id: norad }),
    })
    .then(function(res) {
        if (!res.ok) {
            return res.json().then(function(err) {
                throw new Error(err.detail || res.statusText);
            });
        }
        return res.json();
    })
    .then(function(tleData) {
        // 2) Predict passes
        var start = new Date().toISOString();
        return fetch('http://localhost:8000/predict/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                aoi_id: aoiId,
                tle_ids: [tleData.id],
                start: start,
            }),
        });
    })
    .then(function(res) {
        if (!res.ok) {
            return res.json().then(function(err) {
                throw new Error(err.detail || res.statusText);
            });
        }
        return res.json();
    })
    .then(function(passes) {
        // 3) Display results
        displayPasses(passes);
        showSuccess('Found ' + passes.length + ' orbital passes!');
    })
    .catch(function(err) {
        showError('Prediction failed: ' + err.message);
    })
    .finally(function() {
        setLoading(false);
    });
});

function displayPasses(passes) {
    // Clear existing passes
    passesList.innerHTML = '';
    passesLayer.clearLayers();

    if (passes.length === 0) {
        passesList.innerHTML = 
            '<div class="empty-state">' +
                '<i class="fas fa-search"></i>' +
                '<p>No orbital passes found for the selected parameters</p>' +
            '</div>';
        return;
    }

    passes.forEach(function(pass, index) {
        // Create pass item
        var passItem = document.createElement('div');
        passItem.className = 'pass-item';
        passItem.innerHTML = 
            '<div class="pass-time">Pass #' + (index + 1) + '</div>' +
            '<div class="pass-details">' +
                '<div><i class="fas fa-arrow-up"></i> Rise: ' + formatDateTime(pass.rise_time) + '</div>' +
                '<div><i class="fas fa-arrow-down"></i> Set: ' + formatDateTime(pass.set_time) + '</div>' +
            '</div>';
        
        // Add click handler to focus on pass
        (function(currentPass) {
            passItem.addEventListener('click', function() {
                var trackLayer = L.geoJSON(currentPass.track);
                map.fitBounds(trackLayer.getBounds());
            });
        })(pass);

        passesList.appendChild(passItem);

        // Add track to map with custom styling
        var hue = (index * 360 / passes.length);
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