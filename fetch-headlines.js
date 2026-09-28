  <!-- SCRIPT TO DYNAMICALLY FETCH RANDOM HEADLINES -->
    function initPage(ip) {
      if (typeof autoLoad === 'function') {
        autoLoad();
      }
      fetchRandomTopStories(ip);
    }

async function fetchRandomTopStories(top) {
  const container = document.getElementById('dynamic-top-stories');
  container.innerHTML = '<li><em>Loading random live stories...</em></li>';

  // Gather valid feeds from select dropdown
  const select = document.getElementById('Choice');
  const options = Array.from(select.options).filter(opt => !opt.disabled && opt.value);

  // Randomize the entire options list
  const shuffled = options.sort(() => 0.5 - Math.random());
  
  const corsProxy = 'https://wispy-thunder-prod.the-kds-group.workers.dev/?url=';
  const results = [];

  // Iterate through shuffled feeds one by one until reaching 'top' working stories
  for (const opt of shuffled) {
    if (results.length >= top) break; // Stop as soon as we reach the desired count (11)

    try {
      const res = await fetch(corsProxy + encodeURIComponent(opt.value));
      const text = await res.text();
      const xml = new DOMParser().parseFromString(text, 'text/xml');
      
      let title = '';
      const item = xml.querySelector('item') || xml.querySelector('entry');
      if (item) {
        title = item.querySelector('title')?.textContent || '';
      }

      if (title) {
        results.push({
          feedTitle: opt.text,
          feedUrl: opt.value,
          storyTitle: title.trim()
        });
      }
    } catch (e) {
      // If a single feed fails, skip it and continue to the next candidate
    }
  }

  if (results.length === 0) {
    container.innerHTML = '<li>Unable to load live headlines right now. Select a feed below.</li>';
    return;
  }

  container.innerHTML = '';
  results.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `
      <a href="javascript:void(0)" onclick="loadFeedFromHeadline('${item.feedUrl}')">
        ${item.storyTitle}
      </a>
      <span class="source-tag">(${item.feedTitle})</span>
    `;
    container.appendChild(li);
  });
}
      const results = (await Promise.all(fetchPromises)).filter(Boolean);

      if (results.length === 0) {
        container.innerHTML = '<li>Unable to load live headlines right now. Select a feed below.</li>';
        return;
      }

      container.innerHTML = '';
      results.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
          <a href="javascript:void(0)" onclick="loadFeedFromHeadline('${item.feedUrl}')">
            ${item.storyTitle}
          </a>
          <span class="source-tag">(${item.feedTitle})</span>
        `;
        container.appendChild(li);
      });
    }

    function loadFeedFromHeadline(url) {
      const select = document.getElementById('Choice');
      select.value = url;
      if (typeof manualLoad === 'function') {
        manualLoad();
      }
    }
