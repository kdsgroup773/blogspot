// Define proxyList globally, as it's a constant list
const proxyList = [
    'https://api.allorigins.win?url=',
    'https://corsproxy.io/?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors-anywhere.herokuapp.com/', // Note: this proxy often requires a click-through on its site
    'https://cors.lol/?url=',
    'https://cors.x2u.in/?url=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://cors-proxy.htmldriven.com/?url=',
    'https://crossorigin.me/', // This one is often down or slow
    'https://yacdn.org/proxy/',
];

// --- fetchWithRetry function (moved to global scope) ---
async function fetchWithRetry(url, options = {}, retries = 4, delay = 7500) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            if (response.status === 408 && retries > 0) {
                console.warn(`Proxy 408 timeout for ${url}, retrying in ${delay / 1000}s... (${retries} retries left)`);
                await new Promise(res => setTimeout(res, delay));
                return fetchWithRetry(url, options, retries - 1, delay * 2);
            }
            throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        }
        return response;
    } catch (error) {
        if (retries > 0 && (error instanceof TypeError || error.message.includes('Failed to fetch') || error.message.includes('Network request failed') || error.message.includes('timeout') || error.message.includes('ERR_CONNECTION_REFUSED'))) {
            console.warn(`Fetch failed (network/timeout error for ${url}), retrying in ${delay / 1000}s... (${retries} retries left)`);
            document.getElementById('rss-feed-message').textContent = `Retrying in ${delay / 1000}s... (${retries} retries left)`;
            await new Promise(res => setTimeout(res, delay));
            return fetchWithRetry(url, options, retries - 1, delay);
        } else {
            throw error;
        }
    }
}

// --- fetchWithProxyFallback Function (No changes) ---
async function fetchWithProxyFallback(targetFeedUrl, proxies) {
    // Note: The loadingDiv text updates here will only show the *last* proxy attempt's status
    // when multiple feeds are fetching concurrently. Consider if you need a more granular
    // loading indicator per feed.
    const loadingDiv = document.getElementById('rss-feed-message');
    let lastError = null;
    for (let i = 0; i < proxies.length; i++) {
        const proxyBaseUrl = proxies[i];
        let proxiedUrl;

        if (proxyBaseUrl.includes('codetabs.com')) {
            proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
        } else if (proxyBaseUrl.includes('crossorigin.me')) {
            proxiedUrl = proxyBaseUrl + targetFeedUrl;
        } else if (proxyBaseUrl.includes('thingproxy.freeboard.io')) {
            proxiedUrl = proxyBaseUrl + targetFeedUrl;
        } else {
            proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
        }

        console.log(`Attempting with proxy ${i + 1}/${proxies.length}: ${proxyBaseUrl}`);
        // This will be overwritten quickly if many are running in parallel
        // loadingDiv.textContent = `Trying proxy ${i + 1}/${proxies.length}...`;
        // console.log(loadingDiv.textContent);

        try {
            const response = await fetchWithRetry(proxiedUrl);

            if (!response.ok) {
                lastError = new Error(`Proxy ${proxyBaseUrl} returned non-OK status: ${response.status} ${response.statusText}`);
                console.warn(lastError.message);
                continue;
            }

            const xmlString = await response.text();
            // console.log("Raw content received from proxy (first 500 chars):", xmlString.substring(0, 500) + '...');

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

            const errorNode = xmlDoc.querySelector("parsererror");
            if (errorNode) {
                const errorText = errorNode.textContent;
                lastError = new Error(`XML Parsing Error from ${proxyBaseUrl}: ${errorText}`);
                console.error(lastError.message);
                continue;
            }

            const items = xmlDoc.querySelectorAll('item');
            if (items.length === 0) {
                lastError = new Error(`No RSS items found in feed using ${proxyBaseUrl}. Feed might be empty or structured differently.`);
                console.warn(lastError.message);
                continue;
            }

            console.log(`Successfully parsed feed with ${items.length} items using proxy: ${proxyBaseUrl}`);
            return xmlDoc;
        } catch (error) {
            lastError = error;
            console.error(`Failed with proxy ${proxyBaseUrl}:`, error);
        }
    }
    console.log("All proxy attempts failed.");
    throw new Error(`All proxy attempts failed to fetch the feed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
    // throw new Error(`All proxy attempts failed to fetch or parse the feed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);

}


// --- fetchAndDisplayFeed function (Now uses full optionId directly) ---
// This function will now return a Promise, whether it succeeds or fails
async function fetchAndDisplayFeed(feedUrl, sourceText, displayContainer, isSingleFeed = false, optionId = '') {
    console.log(`fetchAndDisplayFeed called for: ${sourceText}, with optionId: "${optionId}"`); // DEBUG LOG
    try {
        const xmlDoc = await fetchWithProxyFallback(feedUrl, proxyList);

        // If not a single feed, we don't clear the container here,
        // we just append. The initial clear happens in autoLoadAllFeeds.
        if (isSingleFeed) {
             // If this is a single, explicit load, hide the global message
             document.getElementById('rss-feed-message').style.display = 'none';
             displayContainer.innerHTML = ''; // Clear for single view
        }

        const items = xmlDoc.querySelectorAll('item');
        let sectionHtml = '';

        sectionHtml += `<h3>${sourceText}</h3>`;
        sectionHtml += '<ul style="list-style: none; padding: 0;">';

        items.forEach(item => {
            let title = item.querySelector('title')?.textContent || 'No Title'; // Use 'let' as we might modify it
            const pubDateStr = item.querySelector('pubDate')?.textContent;

            if (title.length > 50) {
                title = title.substring(0, 50); // Just cut it off
                // console.log(`Truncated title to: ${title}`); // DEBUG LOG
            }

            let date = null;
            if (pubDateStr) {
                try {
                    date = new Date(pubDateStr);
                    if (isNaN(date.getTime())) {
                        console.warn("Invalid date string for new Date():", pubDateStr);
                        date = null;
                    }
                } catch (e) {
                    console.error("Error parsing date:", pubDateStr, e);
                    date = null;
                }
            }

            sectionHtml += `<li>`;
            sectionHtml += `<p>`;
            if (date) {
                sectionHtml += `${date.toLocaleDateString()}  `;
            }
            sectionHtml += `<strong>${sourceText}</strong>: `;
            sectionHtml += `${title}`; // This will now be the potentially truncated title

            if (optionId) {
                sectionHtml += ` ${optionId}`;
            }

            sectionHtml += `</p>`;
            sectionHtml += `</li>`;
        });

        sectionHtml += '</ul>';
        displayContainer.innerHTML += sectionHtml; // Append content

    } catch (error) {
        console.error(`Error loading feed for ${sourceText}:`, error);
        if (isSingleFeed) {
            // For single feed, hide message and show error directly
            document.getElementById('rss-feed-message').style.display = 'none';
            displayContainer.innerHTML = `<p style="color: red;">Failed to load '${sourceText}' feed: ${error.message}</p>`;
        } else {
            // For multiple feeds, just append the error message for that specific feed
            displayContainer.innerHTML += `<p style="color: orange;">Could not load '${sourceText}' feed. Error: ${error.message.substring(0, 100)}...</p>`;
        }
    }
}
// --- Helper function to extract the number from the option ID (STILL NEEDED for autoLoad hash handling) ---
function extractOptionNumberId(fullOptionId) {
    if (fullOptionId) {
        const parts = fullOptionId.split('#');
        if (parts.length > 1) {
            return parts[parts.length - 1]; // Return the last part after the '#'
        }
    }
    return ''; // Return empty string if no valid ID found
}


// --- MODIFIED: manualLoad function (Passing full option ID) ---
function manualLoad() {
    const selectElement = document.getElementById('Choice');
    const rssFeedUrl = selectElement.value;
    const selectedOption = selectElement.options[selectElement.selectedIndex]; // Get the selected option element
    const selectedOptionText = selectedOption.textContent;
    const fullOptionId = selectedOption.id; // Get the full ID string directly

    console.log(`manualLoad called. Selected URL: ${rssFeedUrl}, Full Option ID: "${fullOptionId}"`); // DEBUG LOG

    const container = document.getElementById('rss-feed-container');
    const loadingDiv = document.getElementById('rss-feed-message');

    if (selectElement.selectedIndex === 0) {
        container.innerHTML = '<p>Please select an interest to load the feed.</p>';
        loadingDiv.style.display = 'none';
        return;
    }

    loadingDiv.textContent = 'Loading RSS feed...';
    loadingDiv.style.display = 'block';
    container.innerHTML = '';

    fetchAndDisplayFeed(rssFeedUrl, selectedOptionText, container, true, fullOptionId); // Pass the full ID
}


// --- NEW / MODIFIED: autoLoadAllFeeds function to use Promise.all() ---
async function autoLoadAllFeeds() {
    const selectElement = document.getElementById('Choice');
    const container = document.getElementById('rss-feed-container');
    const loadingDiv = document.getElementById('rss-feed-message');

    loadingDiv.textContent = 'Loading all RSS feeds concurrently...';
    loadingDiv.style.display = 'block';
    container.innerHTML = ''; // Clear existing content

    const feedPromises = [];
    const feedDetails = []; // To store context for each promise

    // Collect all promises without awaiting them immediately
    for (let i = 1; i < selectElement.options.length; i++) { // Start from 1 to skip "Choose an Interest"
        const option = selectElement.options[i];
        const feedUrl = option.value;
        const sourceText = option.textContent;
        const fullOptionId = option.id;

        // Create a promise for each feed and push it to the array
        // We pass the parameters needed by fetchAndDisplayFeed
        feedPromises.push(
            fetchAndDisplayFeed(feedUrl, sourceText, container, false, fullOptionId)
        );
        feedDetails.push({ sourceText: sourceText, index: i }); // Store for logging/tracking
    }

    console.log(`Starting to fetch ${feedPromises.length} feeds concurrently.`);

    // Use Promise.allSettled to wait for all promises to settle (either fulfill or reject)
    // This ensures that even if some fail, the others continue and we get results for all.
    const results = await Promise.allSettled(feedPromises);

    console.log('All feed promises have settled:', results);

    // Optionally, update a final message based on overall success/failure
    let allSucceeded = true;
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            allSucceeded = false;
            // The error message is already appended by fetchAndDisplayFeed's catch block
            console.error(`Feed ${feedDetails[index].sourceText} failed:`, result.reason);
        } else {
            console.log(`Feed ${feedDetails[index].sourceText} succeeded.`);
        }
    });

    if (allSucceeded) {
        loadingDiv.textContent = 'All feeds loaded successfully!';
        loadingDiv.style.color = 'green'; // Optional: visual feedback
    } else {
        loadingDiv.textContent = 'Some feeds could not be loaded. Please check the console for details.';
        loadingDiv.style.color = 'orange'; // Optional: visual feedback
    }

    // Hide the loading message after a short delay so the user can see the final status
    setTimeout(() => {
        loadingDiv.style.display = 'none';
        loadingDiv.style.color = ''; // Reset color
    }, 3000); // Hide after 3 seconds

    if (container.innerHTML === '') {
        container.innerHTML = '<p>No feeds could be loaded or displayed.</p>';
    }
}


// --- MODIFIED: autoLoad function (Using extractOptionNumberId for hash lookup, but passing full ID for display) ---
function autoLoad() {
    var wlh = window.location.href;
    if (wlh.search("#") > 0) {
        var ixo = wlh.indexOf("#");
        var selectedHashId = wlh.substring(ixo + 1); // This will be "1", "2", etc., from the URL hash

        console.log("autoLoad: Hash detected:", selectedHashId); // DEBUG LOG

        const selectElement = document.getElementById('Choice');
        let optionElement = null;

        // Loop through options to find the one whose extracted number ID matches the hash
        for (let i = 1; i < selectElement.options.length; i++) {
            const option = selectElement.options[i];
            const extractedIdFromOption = extractOptionNumberId(option.id); // Extract number from option's ID
            if (extractedIdFromOption === selectedHashId) {
                optionElement = option; // Found the matching option
                break;
            }
        }

        if (optionElement && optionElement.tagName === 'OPTION') {
            const fullOptionIdToDisplay = optionElement.id; // Get the full ID string from the found option
            console.log(`autoLoad (hash): Found option element for hash "${selectedHashId}", Full ID to display: "${fullOptionIdToDisplay}"`); // DEBUG LOG

            selectElement.value = optionElement.value; // Set the select dropdown to this option
            const selectedOptionText = optionElement.textContent;

            const container = document.getElementById('rss-feed-container');
            const loadingDiv = document.getElementById('rss-feed-message');

            loadingDiv.textContent = `Loading feed for ${selectedOptionText}...`;
            loadingDiv.style.display = 'block';
            container.innerHTML = '';
            // Pass the full ID string to display
            fetchAndDisplayFeed(optionElement.value, selectedOptionText, container, true, fullOptionIdToDisplay);
        } else {
            console.warn("AutoLoad: Could not find option element for hash:", selectedHashId);
            autoLoadAllFeeds(); // Fallback to loading all if hash doesn't match an option
        }
    } else {
        console.log("AutoLoad: No hash in URL, loading all feeds concurrently.");
        autoLoadAllFeeds();
    }
}
// ... (all of your existing JavaScript functions and code) ...

// Add this code at the end of your JavaScript file
document.addEventListener('DOMContentLoaded', (event) => {
    console.log('DOM is fully loaded and parsed');
    autoLoad();
});
// Function to play the sound
function playSound() {
  const audio = document.getElementById('notificationSound');
  if (audio) {
    audio.play().catch(e => console.error("Sound playback failed:", e));
  }
}
