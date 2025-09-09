// --- RSS to HTML Script v3.0 ---
// Designed for robust RSS feed fetching with a proxy fallback system.
// Addresses duplicate error messages and improves overall logic.

// --- Global Constants ---
const proxyList = [
    'https://api.allorigins.win?url=',
    'https://corsproxy.io/?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors-anywhere.herokuapp.com/', // Note: this proxy often requires a click-through on its site
    'https://cors.lol/?url=',
    'https://cors.x2u.in/?url=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://cors-proxy.htmldriven.com/?url=',
    'https://crossorigin.me/',
    'https://yacdn.org/proxy/',
];

// --- Core Fetching Logic with Retry ---
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
            await new Promise(res => setTimeout(res, delay));
            return fetchWithRetry(url, options, retries - 1, delay);
        } else {
            throw error;
        }
    }
}

// --- Proxy Fallback and Parsing ---
async function fetchWithProxyFallback(targetFeedUrl, proxies) {
    let lastError = null;
    for (const proxyBaseUrl of proxies) {
        let proxiedUrl;
        if (proxyBaseUrl.includes('codetabs.com') || proxyBaseUrl.includes('cors.lol') || proxyBaseUrl.includes('allorigins.win') || proxyBaseUrl.includes('corsproxy.io')) {
            proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
        } else if (proxyBaseUrl.includes('crossorigin.me') || proxyBaseUrl.includes('thingproxy.freeboard.io') || proxyBaseUrl.includes('cors-anywhere.herokuapp.com') || proxyBaseUrl.includes('yacdn.org') || proxyBaseUrl.includes('cors.x2u.in')) {
            proxiedUrl = proxyBaseUrl + targetFeedUrl;
        } else {
            proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
        }

        console.log(`Attempting with proxy: ${proxyBaseUrl}`);
        try {
            const response = await fetchWithRetry(proxiedUrl);
            const xmlString = await response.text();
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
                lastError = new Error(`No RSS items found in feed using ${proxyBaseUrl}.`);
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
    throw new Error(`All proxy attempts failed to fetch the feed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
}

// --- Display Function (Now only handles display, not errors) ---
function displayFeedContent(xmlDoc, sourceText, displayContainer, optionId = '') {
    const items = xmlDoc.querySelectorAll('item');
    let sectionHtml = '';
    sectionHtml += `<h3 class="feed-source-header">${sourceText}</h3>`;
    sectionHtml += '<ul class="feed-list">';

    items.forEach(item => {
        const title = item.querySelector('title')?.textContent || 'No Title';
        const pubDateStr = item.querySelector('pubDate')?.textContent;
        const link = item.querySelector('link')?.textContent || '#';

        const date = pubDateStr ? new Date(pubDateStr) : null;
        const formattedDate = date && !isNaN(date.getTime()) ? date.toLocaleDateString() : '';

        sectionHtml += `
            <li class="feed-item">
                <a href="${link}" target="_blank" rel="noopener noreferrer" class="feed-link">
                    <p class="feed-title">${title}</p>
                    <p class="feed-meta">
                        <span class="feed-source-name">${sourceText}</span>
                        ${optionId ? `<span class="feed-option-id">#${extractOptionNumberId(optionId)}</span>` : ''}
                        <span class="feed-date">${formattedDate}</span>
                    </p>
                </a>
            </li>
        `;
    });

    sectionHtml += '</ul>';
    displayContainer.innerHTML += sectionHtml;
}

// --- Main Function to Fetch and Display (now returns status) ---
async function fetchAndDisplayFeed(feedUrl, sourceText, displayContainer, isSingleFeed = false, optionId = '') {
    try {
        const xmlDoc = await fetchWithProxyFallback(feedUrl, proxyList);
        displayFeedContent(xmlDoc, sourceText, displayContainer, optionId);
        return { status: 'fulfilled' };
    } catch (error) {
        console.error(`Error loading feed for ${sourceText}:`, error);
        // Return a rejected status to the caller
        return { status: 'rejected', reason: error.message, sourceText: sourceText, isSingleFeed: isSingleFeed };
    }
}

// --- Helper function to extract the number from the option ID ---
function extractOptionNumberId(fullOptionId) {
    if (fullOptionId) {
        const parts = fullOptionId.split('#');
        if (parts.length > 1) {
            return parts[parts.length - 1];
        }
    }
    return '';
}

// --- Manual Load Function ---
function manualLoad() {
    const selectElement = document.getElementById('Choice');
    const rssFeedUrl = selectElement.value;
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const selectedOptionText = selectedOption.textContent;
    const fullOptionId = selectedOption.id;

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
    
    // Call the single-feed handler and display its status
    fetchAndDisplayFeed(rssFeedUrl, selectedOptionText, container, true, fullOptionId)
        .then(result => {
            if (result.status === 'fulfilled') {
                loadingDiv.style.display = 'none';
            } else {
                loadingDiv.style.display = 'none';
                container.innerHTML = `<p style="color: red;">Failed to load '${selectedOptionText}' feed: ${result.reason}</p>`;
            }
        });
}

// --- Auto Load All Feeds Function ---
async function autoLoadAllFeeds() {
    const selectElement = document.getElementById('Choice');
    const container = document.getElementById('rss-feed-container');
    const loadingDiv = document.getElementById('rss-feed-message');

    loadingDiv.textContent = 'Loading all RSS feeds...';
    loadingDiv.style.display = 'block';
    container.innerHTML = '';

    const feedPromises = [];
    const feedDetails = [];
    for (let i = 1; i < selectElement.options.length; i++) {
        const option = selectElement.options[i];
        const feedUrl = option.value;
        const sourceText = option.textContent;
        const fullOptionId = option.id;
        feedPromises.push(
            fetchAndDisplayFeed(feedUrl, sourceText, container, false, fullOptionId)
        );
        feedDetails.push({ sourceText: sourceText, index: i });
    }

    const results = await Promise.all(feedPromises.map(p => p.catch(e => e)));
    
    let allSucceeded = true;
    let successfulLoads = 0;

    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            allSucceeded = false;
            const sourceText = result.sourceText;
            const error = result.reason;
            container.innerHTML += `<p style="color: orange;">Could not load '${sourceText}' feed. Error: ${error.substring(0, 100)}...</p>`;
        } else {
            successfulLoads++;
        }
    });

    if (successfulLoads > 0) {
        loadingDiv.textContent = `Loaded ${successfulLoads} feeds.`;
        loadingDiv.style.color = 'green';
        changeFavicon('success');
    } else {
        loadingDiv.textContent = 'No feeds could be loaded.';
        loadingDiv.style.color = 'red';
    }

    setTimeout(() => {
        loadingDiv.style.display = 'none';
        loadingDiv.style.color = '';
    }, 5000);

    if (container.innerHTML === '') {
        container.innerHTML = '<p>No feeds could be loaded or displayed.</p>';
    }
}

// --- Auto Load on Page Start ---
function autoLoad() {
    const wlh = window.location.href;
    if (wlh.search("#") > 0) {
        const ixo = wlh.indexOf("#");
        const selectedHashId = wlh.substring(ixo + 1);

        const selectElement = document.getElementById('Choice');
        const optionElement = Array.from(selectElement.options).find(option => extractOptionNumberId(option.id) === selectedHashId);

        if (optionElement) {
            selectElement.value = optionElement.value;
            manualLoad();
        } else {
            autoLoadAllFeeds();
        }
    } else {
        autoLoadAllFeeds();
    }
}

// ** NEW CODE FOR FAVICON CHANGES **
function changeFavicon(status) {
    const favicon = document.getElementById('favicon');
    if (!favicon) return;
    if (status === 'success') {
        favicon.href = 'https://kdsgroup773.github.io/blogspot/success.jpeg';
    } else if (status === 'error') {
        favicon.href = 'https://kdsgroup773.github.io/blogspot/error.jpeg';
    }
}

document.addEventListener('DOMContentLoaded', autoLoad);
