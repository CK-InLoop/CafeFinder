// OpenStreetMap Overpass API endpoint
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// DOM Elements
const savedBtn = document.getElementById('savedBtn');
const findNewBtn = document.getElementById('findNewBtn');
const refreshBtn = document.getElementById('refreshBtn');
const cardsContainer = document.querySelector('.cards');

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    getLocation();
    
    savedBtn.addEventListener('click', showSaved);
    findNewBtn.addEventListener('click', () => {
        getLocation();
        findNewBtn.classList.add('active');
        savedBtn.classList.remove('active');
    });
    
    refreshBtn.addEventListener('click', getLocation);
});

// Get user's current location
function getLocation() {
    showLoading(true);
    
    // Check for cached location (less than 10 minutes old)
    const cache = JSON.parse(localStorage.getItem('cachedLocation') || '{}');
    const now = Date.now();
    
    if (cache.timestamp && now - cache.timestamp < 10 * 60 * 1000) {
        useLocation(cache.lat, cache.lng);
    } else {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    localStorage.setItem('cachedLocation', JSON.stringify({ 
                        lat, 
                        lng, 
                        timestamp: now 
                    }));
                    useLocation(lat, lng);
                },
                error => {
                    showLoading(false);
                    alert("Please enable location access to find nearby cafés.");
                    console.error("Geolocation error:", error);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            showLoading(false);
            alert("Geolocation is not supported by your browser.");
        }
    }
}

// Use location to find nearby cafes
async function useLocation(lat, lng) {
    showLoading(true);
    
    // Clear existing cards
    cardsContainer.innerHTML = '';
    
    // Show loading state
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    cardsContainer.appendChild(loadingDiv);
    
    try {
        // First, log the coordinates we're using
        console.log('Searching for cafes near:', lat, lng);
        
        // Overpass QL query to find cafes and coffee shops near the location
        const query = `
            [out:json];
            (
              // Search for cafes and coffee shops
              node["amenity"="cafe"](around:200000,${lat},${lng});
              node["amenity"="coffee_shop"](around:200000,${lat},${lng});
              node["shop"="coffee"](around:200000,${lat},${lng});
              
              // Also search for restaurants that might serve coffee
              node["amenity"="restaurant"]["cuisine"~"coffee|cafe"](around:200000,${lat},${lng});
              
              // Search for any food/drink related places that might serve coffee
              node["amenity"~"cafe|restaurant|bar|fast_food"]["name"~"[Cc]afe|[Cc]offee",i](around:200000,${lat},${lng});
            );
            out body;
            >;
            out skel qt;
            
            // Also try to get some way data which might have more complete information
            (
              way["amenity"="cafe"](around:20000,${lat},${lng});
              way["amenity"="coffee_shop"](around:20000,${lat},${lng});
              way["shop"="coffee"](around:20000,${lat},${lng});
            );
            out body;
            >;
            out skel qt;
        `;

        console.log('Making request to OpenStreetMap Overpass API');
        try {
            const response = await fetch(OVERPASS_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `data=${encodeURIComponent(query)}`
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
            }
            
            const data = await response.json();
            console.log('OpenStreetMap API Response:', data);
            
            // If no elements found, try a broader search
            if (!data.elements || data.elements.length === 0) {
                console.log('No cafes found in the immediate area, trying a broader search...');
                return await searchBroaderArea(lat, lng);
            }
            
            // Process the data
            const cafes = [];
            const seenIds = new Set();
            
            data.elements.forEach(item => {
                if (item.tags && item.tags.name && !seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    
                    // Create address from available tags
                    let address = 'Address not available';
                    if (item.tags['addr:street']) {
                        address = item.tags['addr:street'];
                        if (item.tags['addr:housenumber']) {
                            address = `${item.tags['addr:housenumber']} ${address}`;
                        }
                        if (item.tags['addr:city']) {
                            address += `, ${item.tags['addr:city']}`;
                        }
                    }
                    
                    cafes.push({
                        id: item.id,
                        name: item.tags.name,
                        address: address,
                        tags: item.tags,
                        lat: item.lat || (item.center && item.center.lat) || null,
                        lon: item.lon || (item.center && item.center.lon) || null
                    });
                }
            });
            
            if (cafes.length > 0) {
                displayCards(cafes);
            } else {
                console.log('No valid cafes found in the response, trying broader search...');
                return await searchBroaderArea(lat, lng);
            }
        } catch (error) {
            console.error('Error in API request:', error);
            cardsContainer.innerHTML = `
                <div class="error-message">
                    <p>Error: ${error.message}</p>
                    <button id="retryBtn" class="btn">Retry</button>
                </div>
            `;
            document.getElementById('retryBtn')?.addEventListener('click', getLocation);
        }
    } catch (error) {
        console.error("Error fetching cafés:", error);
        cardsContainer.innerHTML = '<p>Error loading cafés. Please try again later.</p>';
    } finally {
        showLoading(false);
    }
}

// Function to search a broader area if no cafes found nearby
async function searchBroaderArea(lat, lng) {
    console.log('Trying broader area search...');
    const broaderQuery = `
        [out:json];
        (
          node["amenity"~"cafe|coffee_shop|restaurant"]["name"~"[Cc]afe|[Cc]offee",i](around:50000,${lat},${lng});
          way["amenity"~"cafe|coffee_shop|restaurant"]["name"~"[Cc]afe|[Cc]offee",i](around:50000,${lat},${lng});
        );
        out body;
        >;
        out skel qt;
    `;
    
    try {
        const response = await fetch(OVERPASS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `data=${encodeURIComponent(broaderQuery)}`
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Broader area search results:', data);
        
        if (data.elements && data.elements.length > 0) {
            const cafes = processOsmData(data.elements);
            if (cafes.length > 0) {
                displayCards(cafes);
                return;
            }
        }
        
        // If still no results, show a more helpful message
        cardsContainer.innerHTML = `
            <div class="no-results">
                <h3>No cafés found nearby</h3>
                <p>We couldn't find any cafés in your area. This could be because:</p>
                <ul>
                    <li>There are no cafés mapped in OpenStreetMap in your area</li>
                    <li>Your location might be set to a remote area</li>
                    <li>There might be an issue with the location services</li>
                </ul>
                <p>Try moving to a different location or check the browser console for more details.</p>
                <button id="tryAgainBtn" class="btn">Try Again</button>
            </div>
        `;
        
        document.getElementById('tryAgainBtn')?.addEventListener('click', getLocation);
        
    } catch (error) {
        console.error('Error in broader area search:', error);
        cardsContainer.innerHTML = `
            <div class="error-message">
                <p>Error searching for cafés: ${error.message}</p>
                <button id="retryBtn" class="btn">Retry</button>
            </div>
        `;
        document.getElementById('retryBtn')?.addEventListener('click', getLocation);
    }
}

// Process OSM data into a consistent format
function processOsmData(elements) {
    const cafes = [];
    const seenIds = new Set();
    
    elements.forEach(item => {
        // Skip if no name or already seen
        if ((!item.tags || !item.tags.name) || seenIds.has(item.id)) return;
        
        seenIds.add(item.id);
        
        // Create address from available tags
        let address = 'Address not available';
        if (item.tags['addr:street']) {
            address = item.tags['addr:street'];
            if (item.tags['addr:housenumber']) {
                address = `${item.tags['addr:housenumber']} ${address}`;
            }
            if (item.tags['addr:city']) {
                address += `, ${item.tags['addr:city']}`;
            }
        }
        
        cafes.push({
            id: item.id,
            name: item.tags.name,
            address: address,
            tags: item.tags,
            lat: item.lat || (item.center && item.center.lat) || null,
            lon: item.lon || (item.center && item.center.lon) || null
        });
    });
    
    return cafes;
}

// Display cafe cards
function displayCards(cafes, isSavedList = false) {
    cardsContainer.innerHTML = '';
    
    if (!cafes || cafes.length === 0) {
        cardsContainer.innerHTML = `
            <div class="no-results">
                <h3>No ${isSavedList ? 'saved' : 'cafés'} found</h3>
                <p>We couldn't find any ${isSavedList ? 'saved' : 'cafés'} in your area. Try moving to a different location.</p>
                <button id="refreshBtn" class="btn">Try Again</button>
            </div>
        `;
        document.getElementById('refreshBtn')?.addEventListener('click', getLocation);
        return;
    }
    
    // Show only the first 5 cafes to avoid too many API calls
    const cafesToShow = cafes.slice(0, 5);
    
    cafesToShow.forEach((cafe, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'swipe-wrapper';
        wrapper.style.zIndex = 200 - index;
        
        // Create cafe data object with OpenStreetMap data
        const cafeData = {
            id: cafe.id,
            name: cafe.name,
            address: cafe.address,
            tags: cafe.tags || {},
            lat: cafe.lat,
            lon: cafe.lon
        };
        
        // Create a nice description from available tags
        let description = '';
        if (cafe.tags) {
            if (cafe.tags.cuisine) description += `Cuisine: ${cafe.tags.cuisine}<br>`;
            if (cafe.tags['opening_hours']) description += `Hours: ${cafe.tags['opening_hours']}<br>`;
            if (cafe.tags.website) description += `<a href="${cafe.tags.website}" target="_blank">Website</a> `;
            if (cafe.tags.phone) description += ` | Phone: ${cafe.tags.phone}`;
        }
        
        // Add save hint for new cafes
        const saveHint = isSavedList ? '' : '<p class="save-hint">Swipe right to save 💖</p>';
        
        // Create card HTML
        const card = document.createElement('div');
        card.className = 'location-card';
        card.innerHTML = `
            <div class="cafe-header">
                <h3>${cafe.name}</h3>
                <p>📍 ${cafe.address}</p>
            </div>
            <div class="cafe-details">
                ${description ? `<p>${description}</p>` : ''}
                <div class="cafe-actions">
                    ${cafe.tags?.website ? `<a href="${cafe.tags.website}" target="_blank" class="btn">Website</a>` : ''}
                    ${cafe.tags?.phone ? `<a href="tel:${cafe.tags.phone}" class="btn">Call Now</a>` : ''}
                    ${saveHint}
                </div>
            </div>
        `;
        
        wrapper.appendChild(card);
        cardsContainer.appendChild(wrapper);
        
        // Initialize Hammer.js for swipe gestures
        const hammertime = new Hammer(wrapper);
        
        // Only add swipe right for saving on non-saved lists
        if (!isSavedList) {
            hammertime.on('swiperight', () => {
                swipeCard(wrapper, 'right', cafe);
            });
        }
        
        // Always allow swipe left to dismiss
        hammertime.on('swipeleft', () => {
            swipeCard(wrapper, 'left');
        });
    });
}

// Handle card swipe animation
function swipeCard(element, direction, cafe) {
    element.style.transform = `translateX(${direction === 'left' ? '-' : ''}150%) rotate(${direction === 'left' ? '-15' : '15'}deg)`;
    element.style.opacity = '0';
    
    if (direction === 'right' && cafe) {
        handleSwipeRight(cafe);
    }
    
    setTimeout(() => element.remove(), 300);
}

// Handle saving a cafe with right swipe
function handleSwipeRight(cafe) {
    const savedCafes = JSON.parse(localStorage.getItem('savedCafes') || '[]');

    if (!savedCafes.some(c => c.id === cafe.id)) {
        savedCafes.push(cafe);
        localStorage.setItem('savedCafes', JSON.stringify(savedCafes));
        showToast('Café saved!');
    }
}

// Show a toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Show the toast
    setTimeout(() => toast.classList.add('show'), 100);

    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Show saved cafes
function showSaved() {
    showLoading(true);
    cardsContainer.innerHTML = '';

    // Update active button states
    savedBtn.classList.add('active');
    findNewBtn.classList.remove('active');

    // Get saved cafes from localStorage
    const savedCafes = JSON.parse(localStorage.getItem('savedCafes') || '[]');

    if (savedCafes.length === 0) {
        cardsContainer.innerHTML = `
            <div class="no-results">
                <h3>No saved cafés yet</h3>
                <p>Swipe right on a café to save it!</p>
                <button id="findNewBtn2" class="btn">Find Cafés</button>
            </div>
        `;
        document.getElementById('findNewBtn2')?.addEventListener('click', () => {
            getLocation();
            findNewBtn.classList.add('active');
            savedBtn.classList.remove('active');
        });
    } else {
        displayCards(savedCafes, true);
    }
    
    showLoading(false);
}

// Show loading state
function showLoading(isLoading) {
    const loadingElements = document.querySelectorAll('.loading');
    
    if (isLoading && loadingElements.length === 0) {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        cardsContainer.appendChild(loadingDiv);
    } else if (!isLoading) {
        loadingElements.forEach(el => el.remove());
    }
}

// Show notification (legacy, using showToast instead)
function showNotification(message) {
    showToast(message);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add keyframe animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translate(-50%, 100%); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translate(-50%, 0); opacity: 1; }
        to { transform: translate(-50%, 100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
