// --- NEW UTILITY: Clean Title and Batcher ---
function cleanAndBatch(items, feedUrl, charLimit) {
    let posts = [];
    let currentPost = "";
    let footer = `\n🔗 Read all: ${feedUrl}`;
    let footerLen = footer.length;

    items.forEach((item, index) => {
        let title = item.querySelector('title')?.textContent || 'No Title';
        
        // Fix "multiple bu" issue: Smart truncate at 75 chars
        if (title.length > 75) {
            title = title.substring(0, 75);
            title = title.substring(0, Math.min(title.length, title.lastIndexOf(" "))) + "...";
        }

        let line = `🔹 ${title}\n`;

        // If adding this line + footer exceeds limit, save current batch
        if ((currentPost.length + line.length + footerLen) > charLimit) {
            posts.push(currentPost.trim() + footer);
            currentPost = line;
        } else {
            currentPost += line;
        }

        // Final item check
        if (index === items.length - 1 && currentPost !== "") {
            posts.push(currentPost.trim() + footer);
        }
    });
    return posts;
}

// --- fetchAndDisplayFeed function (UPDATED) ---
async function fetchAndDisplayFeed(feedUrl, sourceText, displayContainer, isSingleFeed = false, optionId = '') {
    console.log(`fetchAndDisplayFeed called for: ${sourceText}`);
    try {
        const xmlDoc = await fetchWithProxyFallback(feedUrl, proxyList);
        if (isSingleFeed) {
            document.getElementById('rss-feed-message').style.display = 'none';
            displayContainer.innerHTML = '';
        }
        
        const items = Array.from(xmlDoc.querySelectorAll('item'));
        
        // 1. GENERATE SOCIAL BATCHES (LOG TO CONSOLE)
        // You can change these limits based on your preferred platforms
        const xBatches = cleanAndBatch(items, feedUrl, 280); 
        const mastodonBatches = cleanAndBatch(items, feedUrl, 500);
        
        console.log(`--- SOCIAL POSTS FOR ${sourceText} ---`);
        console.log(`X/Twitter (${xBatches.length} posts):`, xBatches);
        console.log(`Mastodon (${mastodonBatches.length} posts):`, mastodonBatches);

        // 2. DISPLAY ON WEBPAGE (Existing Logic)
        let sectionHtml = `<h3>${sourceText} (Total: ${items.length} articles)</h3>`;
        sectionHtml += '<ul style="list-style: none; padding: 0;">';
        
        items.forEach(item => {
            let title = item.querySelector('title')?.textContent || 'No Title';
            const pubDateStr = item.querySelector('pubDate')?.textContent;
            
            // Apply smart truncation for the web view too
            if (title.length > 85) {
                title = title.substring(0, 85);
                title = title.substring(0, title.lastIndexOf(" ")) + "...";
            }

            let date = pubDateStr ? new Date(pubDateStr) : new Date();
            let dateStr = isNaN(date.getTime()) ? new Date().toLocaleDateString() : date.toLocaleDateString();

            sectionHtml += `<li>${dateStr} <strong>${sourceText}</strong>: ${title}`;
            if (optionId) {
                // Fixed: URL now appends the hash for better hit rate
                sectionHtml += ` <a href="${feedUrl}#${optionId.split('#').pop()}" target="_blank">🔗</a>`;
            }
            sectionHtml += `</li>`;
        });
        
        sectionHtml += '</ul><hr>';
        displayContainer.innerHTML += sectionHtml;

    } catch (error) {
        console.error(`Error loading feed for ${sourceText}:`, error);
        const errorMessage = error.message.substring(0, 100);
        displayContainer.innerHTML += `<p style="color: orange;">Could not load '${sourceText}'. Error: ${errorMessage}</p>`;
    }
}

// ... Keep your proxyList, fetchWithRetry, fetchWithProxyFallback, and other functions as they are ...
