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
        // Overpass QL query to find cafes and coffee shops near the location
        const query = `
            [out:json];
            (
              node["amenity"="cafe"](around:1500,${lat},${lng});
              node["amenity"="coffee_shop"](around:1500,${lat},${lng});
              node["shop"="coffee"](around:1500,${lat},${lng});
            );
            out body;
            >;
            out skel qt;
        `;

        console.log('Making request to OpenStreetMap Overpass API');
        const response = await fetch(OVERPASS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `data=${encodeURIComponent(query)}`
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('OpenStreetMap API Response:', data);
        
        if (data.elements && data.elements.length > 0) {
            // Filter out duplicate nodes and keep only cafes with names
            const uniqueCafes = [];
            const seenIds = new Set();
            
            data.elements.forEach(cafe => {
                if (cafe.tags && cafe.tags.name && !seenIds.has(cafe.id)) {
                    seenIds.add(cafe.id);
                    uniqueCafes.push({
                        id: cafe.id,
                        name: cafe.tags.name,
                        tags: cafe.tags,
                        lat: cafe.lat,
                        lon: cafe.lon,
                        address: cafe.tags['addr:street'] ? 
                            `${cafe.tags['addr:street']}${cafe.tags['addr:housenumber'] ? ' ' + cafe.tags['addr:housenumber'] : ''}` : 
                            'Address not available'
                    });
                }
            });
            
            if (uniqueCafes.length > 0) {
                displayCards(uniqueCafes);
            } else {
                cardsContainer.innerHTML = '<p>No cafés found nearby. Try increasing the search radius or moving to a different location.</p>';
            }
        } else {
            cardsContainer.innerHTML = '<p>No cafés found nearby. Try increasing the search radius or moving to a different location.</p>';
        }
    } catch (error) {
        console.error("Error fetching cafés:", error);
        cardsContainer.innerHTML = '<p>Error loading cafés. Please try again later.</p>';
    } finally {
        showLoading(false);
    }
}

// Display cafe cards
function displayCards(cafes) {
    cardsContainer.innerHTML = '';
    
    if (!cafes || cafes.length === 0) {
        cardsContainer.innerHTML = '<p>No cafés found. Please try again later.</p>';
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
                    ${cafe.tags.website ? `<a href="${cafe.tags.website}" target="_blank" class="btn">Visit Website</a>` : ''}
                    ${cafe.tags.phone ? `<a href="tel:${cafe.tags.phone}" class="btn">Call Now</a>` : ''}
                </div>
                <p class="save-hint"><small>Swipe right to save 💖</small></p>
            </div>
        `;
        
        wrapper.appendChild(card);
        cardsContainer.appendChild(wrapper);
        
        // Initialize Hammer.js for swipe gestures
        const hammertime = new Hammer(wrapper);
        
        hammertime.on('swipeleft', () => {
            swipeCard(wrapper, 'left');
        });
        
        hammertime.on('swiperight', () => {
            saveCafe(cafeData);
            swipeCard(wrapper, 'right');
        });
    });
}

// Handle card swipe animation
function swipeCard(element, direction) {
    element.style.transform = `translateX(${direction === 'left' ? '-' : ''}150%) rotate(${direction === 'left' ? '-15' : '15'}deg)`;
    element.style.opacity = '0';
    setTimeout(() => element.remove(), 300);
}

// Save cafe to local storage
function saveCafe(cafe) {
    let savedCafes = JSON.parse(localStorage.getItem('savedCafes') || '[]');
    
    // Check if cafe is already saved
    if (!savedCafes.some(c => c.place_id === cafe.place_id)) {
        savedCafes.push(cafe);
        localStorage.setItem('savedCafes', JSON.stringify(savedCafes));
        showNotification(`${cafe.name} saved to your list!`);
    } else {
        showNotification(`${cafe.name} is already in your saved list.`);
    }
}

// Show saved cafes
function showSaved() {
    showLoading(true);
    cardsContainer.innerHTML = '';
    
    const savedCafes = JSON.parse(localStorage.getItem('savedCafes') || '[]');
    
    if (savedCafes.length === 0) {
        cardsContainer.innerHTML = '<p>No saved cafés yet. Swipe right on a café to save it!</p>';
        showLoading(false);
        return;
    }
    
    savedCafes.forEach((cafe, index) => {
        const card = document.createElement('div');
        card.className = 'location-card';
        card.style.margin = '10px 0';
        card.innerHTML = `
            <img src="${cafe.photo}" alt="${cafe.name}" />
            <h3>${cafe.name}</h3>
            <p>⭐ ${cafe.rating}/5</p>
            <p>📍 ${cafe.address || 'Address not available'}</p>
        `;
        
        cardsContainer.appendChild(card);
    });
    
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

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Add styles for the notification
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.backgroundColor = '#5d4037';
    notification.style.color = 'white';
    notification.style.padding = '10px 20px';
    notification.style.borderRadius = '5px';
    notification.style.zIndex = '1000';
    notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    notification.style.animation = 'slideIn 0.3s ease-out';
    
    // Remove notification after 3 seconds
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
