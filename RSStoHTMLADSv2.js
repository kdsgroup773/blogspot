// Define proxyList globally, as it's a constant list
const proxyList = [
    'https://wispy-thunder-5150.the-kds-group.workers.dev/?url=',
    'https://script.google.com/macros/s/AKfycbwkJ1pJt2PNPGKVMO5s-IllRnhIg0bejIXbkXah3vuJnTJBaUFDb1Jb6CaXFhk_elGtCg/exec?url=',
    'https://corsproxy.io/?url=',
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors.lol/?url=',
];

// --- fetchWithRetry function ---
async function fetchWithRetry(url, options = {}, retries = 2, delay = 2000) {
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
            const msgElem = document.getElementById('rss-feed-message');
            if (msgElem) msgElem.textContent = `Retrying in ${delay / 1000}s... (${retries} retries left)`;
            await new Promise(res => setTimeout(res, delay));
            return fetchWithRetry(url, options, retries - 1, delay);
        } else {
            throw error;
        }
    }
}

// --- fetchWithProxyFallback Function ---
async function fetchWithProxyFallback(targetFeedUrl, proxies) {
    let lastError = null;
    for (let i = 0; i < proxies.length; i++) {
        const proxyBaseUrl = proxies[i];
        let proxiedUrl;
        if (proxyBaseUrl.includes('codetabs.com') || !proxyBaseUrl.includes('crossorigin.me') && !proxyBaseUrl.includes('thingproxy.freeboard.io')) {
            proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
        } else {
            proxiedUrl = proxyBaseUrl + targetFeedUrl;
        }
        
        console.log(`Attempting with proxy ${i + 1}/${proxies.length}: ${proxyBaseUrl}`);
        try {
            const response = await fetchWithRetry(proxiedUrl);
            if (!response.ok) {
                lastError = new Error(`Proxy ${proxyBaseUrl} returned non-OK status: ${response.status}`);
                continue;
            }
            const xmlString = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
            if (xmlDoc.querySelector("parsererror")) {
                lastError = new Error(`XML Parsing Error from ${proxyBaseUrl}`);
                continue;
            }
            
            // Fixed double matching: Check entry first (YouTube Atom), drop back to item (Standard RSS)
            const items = xmlDoc.querySelectorAll('entry').length > 0 
                ? xmlDoc.querySelectorAll('entry') 
                : xmlDoc.querySelectorAll('item');

            if (items.length === 0) {
                lastError = new Error(`No RSS items found in feed using ${proxyBaseUrl}`);
                continue;
            }
            return xmlDoc;
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(lastError ? lastError.message : 'All proxies failed.');
}

// --- fetchAndDisplayFeed function ---
async function fetchAndDisplayFeed(feedUrl, sourceText, displayContainer, isSingleFeed = false, optionId = '') {
    console.log(`fetchAndDisplayFeed called for: ${sourceText}`);
    try {
        const xmlDoc = await fetchWithProxyFallback(feedUrl, proxyList);
        
        if (isSingleFeed) {
            document.getElementById('rss-feed-message').style.display = 'none';
            displayContainer.innerHTML = '';
        }

        // Smart selection: prevents selecting both if a proxy duplicates structures
        const items = xmlDoc.querySelectorAll('entry').length > 0 
            ? xmlDoc.querySelectorAll('entry') 
            : xmlDoc.querySelectorAll('item');

        let sectionHtml = `<h3>${sourceText}</h3><ul style="list-style: none; padding: 0;">`;
            
        items.forEach(item => {
            let title = item.querySelector('title')?.textContent || 'No Title';
            const pubDateStr = item.querySelector('pubDate')?.textContent || item.querySelector('published')?.textContent;
            
            let linkUrl = '#';
            const linkElem = item.querySelector('link');
            if (linkElem) {
                linkUrl = linkElem.getAttribute('href') || linkElem.textContent || '#';
            }

            let maxLen = 50; 
            if (title.includes(":")) {
                title = title.substring(title.indexOf(":") + 1).trim();
            }
            if (title.length > maxLen) {
                let nextSpace = title.indexOf(" ", maxLen);
                title = nextSpace !== -1 ? title.substring(0, nextSpace) + "..." : title.substring(0, maxLen) + "...";
            }

            let date = null;
            if (pubDateStr) {
                date = new Date(pubDateStr);
                if (isNaN(date.getTime())) date = null;
            }

            const displayDate = date ? date.toLocaleDateString() : new Date().toLocaleDateString();
            sectionHtml += `<li>${displayDate} <strong>${sourceText}</strong>: <a href="${linkUrl}" target="_blank" style="text-decoration: none; color: #0066cc;">${title} - ${optionId}</a></li>`;
        });

        sectionHtml += '</ul>';
        displayContainer.innerHTML += sectionHtml;

    } catch (error) {
        console.error(`Error loading feed for ${sourceText}:`, error);
        const errorMessage = error.message.substring(0, 100);
        if (isSingleFeed) {
            document.getElementById('rss-feed-message').style.display = 'none';
            displayContainer.innerHTML = `<p style="color: red;">Failed to load '${sourceText}' feed.<br>Reason: ${errorMessage}</p>`;
        } else {
            displayContainer.innerHTML += `<p style="color: orange;">Could not load '${sourceText}'. Error: ${errorMessage}</p>`;
        }
    }
}

function extractOptionNumberId(fullOptionId) {
    if (fullOptionId && fullOptionId.includes('#')) {
        const parts = fullOptionId.split('#');
        return parts[parts.length - 1];
    }
    return '';
}

function manualLoad() {
    const selectElement = document.getElementById('Choice');
    const rssFeedUrl = selectElement.value;
    const selectedOption = selectElement.options[selectElement.selectedIndex];
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
    fetchAndDisplayFeed(rssFeedUrl, selectedOption.textContent, container, true, selectedOption.id);
}

// --- autoLoadAllFeeds function ---
async function autoLoadAllFeeds() {
    const selectElement = document.getElementById('Choice');
    const container = document.getElementById('rss-feed-container');
    const loadingDiv = document.getElementById('rss-feed-message');

    loadingDiv.textContent = 'Preparing to load feeds sequentially...';
    loadingDiv.style.display = 'block';
    container.innerHTML = '';

    let allSucceeded = true;
    const totalFeeds = selectElement.options.length - 1;

    for (let i = 1; i < selectElement.options.length; i++) {
        const option = selectElement.options[i];
        loadingDiv.textContent = `Loading (${i}/${totalFeeds}): ${option.textContent}...`;
        loadingDiv.style.color = 'blue';

        try {
            await fetchAndDisplayFeed(option.value, option.textContent, container, false, option.id);
        } catch (error) {
            allSucceeded = false;
        }
        await new Promise(res => setTimeout(res, 500));
    }
    
    container.innerHTML += '<br><br><br><br><br>';
    if (allSucceeded) {
        loadingDiv.textContent = 'All feeds loaded successfully! ✓';
        loadingDiv.style.color = 'green';
        changeFavicon('success');
    } else {
        loadingDiv.textContent = 'Processing complete. Some feeds failed to load.';
        loadingDiv.style.color = 'orange';
    }
    window.scrollTo(0, document.body.scrollHeight);

    setTimeout(() => {
        loadingDiv.textContent = 'All feeds have been processed.';
        setTimeout(() => {
            loadingDiv.style.display = 'none';
            loadingDiv.style.color = '';
        }, 1500);
    }, 2500);
}

// --- Mutex Guard added to prevent double fires from event hookups ---
let isAutoLoadActive = false;

async function autoLoad() {
    if (isAutoLoadActive) return; // Break loop if already running
    isAutoLoadActive = true;

    const wlh = window.location.href;
    if (wlh.includes("#")) {
        const selectedHashId = wlh.substring(wlh.indexOf("#") + 1);
        const selectElement = document.getElementById('Choice');
        let optionElement = null;

        for (let i = 1; i < selectElement.options.length; i++) {
            if (extractOptionNumberId(selectElement.options[i].id) === selectedHashId) {
                optionElement = selectElement.options[i];
                break;
            }
        }
        
        if (optionElement) {
            selectElement.value = optionElement.value;
            const container = document.getElementById('rss-feed-container');
            const loadingDiv = document.getElementById('rss-feed-message');
            loadingDiv.textContent = `Loading feed for ${optionElement.textContent}...`;
            loadingDiv.style.display = 'block';
            container.innerHTML = '';
            await fetchAndDisplayFeed(optionElement.value, optionElement.textContent, container, true, optionElement.id);
            isAutoLoadActive = false;
            return;
        }
    }
    
    await autoLoadAllFeeds();
    isAutoLoadActive = false;
}

function changeFavicon(status) {
    if (status === 'success') {
        const favicon = document.getElementById('favicon');
        if (favicon) favicon.href = 'https://kdsgroup773.github.io/blogspot/success.jpeg';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    autoLoad();
});
