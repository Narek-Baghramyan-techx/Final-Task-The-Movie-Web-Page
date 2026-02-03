// Configuration
const API_KEY = '5fa69f3ac43065d46dfbaacc57b07b99';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_PATH = 'https://image.tmdb.org/t/p/w500';

// State
let currentPage = 1;
let totalPages = 1;
let currentSort = 'popularity.desc';
let isFetching = false;
let selectedGenres = [];
let countriesCache = null;
let selectedKeywords = [];
let keywordSearchTimeout = null;

// Genres list
const genres = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 36, name: 'History' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Science Fiction' },
  { id: 10770, name: 'TV Movie' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'War' },
  { id: 37, name: 'Western' }
];

// DOM Elements
const movieGrid = document.getElementById('movie-grid');
const loadMoreBtn = document.getElementById('load-more-btn');
const sortSelect = document.getElementById('sort-select');
const searchBtn = document.getElementById('search-trigger');

// Filter-change tracking
let filtersChanged = false;
let filtersSnapshot = null;

//  Country code to flag emoji mapping
 
function getCountryFlag(countryCode) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

// Fetch countries from TMDB API
 
async function fetchCountries() {
  if (countriesCache) {
    return countriesCache;
  }

  try {
    const response = await fetch(`${BASE_URL}/configuration/countries?api_key=${API_KEY}`);
    const countries = await response.json();
    
    // Sort countries alphabetically by name
    countriesCache = countries.sort((a, b) => a.english_name.localeCompare(b.english_name));
    return countriesCache;
  } catch (error) {
    console.error('Error fetching countries:', error);
    return [];
  }
}

// Populate countries dropdown

async function populateCountries() {
  const countrySelect = document.getElementById('country-select');
  const countries = await fetchCountries();
  
  if (countries.length === 0) {
    countrySelect.innerHTML = '<option value="">No countries available</option>';
    return;
  }

  countrySelect.innerHTML = '<option value="">Select Country</option>';
  
  countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country.iso_3166_1;
    option.textContent = `${getCountryFlag(country.iso_3166_1)} ${country.english_name}`;
    countrySelect.appendChild(option);
  });
}


// Search keywords from TMDB API

async function searchKeywords(query) {
  if (!query || query.length < 2) return [];
  
  try {
    const response = await fetch(`${BASE_URL}/search/keyword?api_key=${API_KEY}&query=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error searching keywords:', error);
    return [];
  }
}


// Add keyword tag to UI

function addKeywordTag(keyword) {
  if (selectedKeywords.find(k => k.id === keyword.id)) {
    return; 
  }
  
  selectedKeywords.push(keyword);
  renderKeywordTags();
  try { checkFiltersChanged(); } catch(e) { /* noop during init */ }
}


// Remove keyword tag

function removeKeyword(keywordId) {
  selectedKeywords = selectedKeywords.filter(k => k.id !== keywordId);
  renderKeywordTags();
  try { checkFiltersChanged(); } catch(e) { /* noop during init */ }
}


// Render keyword tags

function renderKeywordTags() {
  const container = document.getElementById('keywords-container');
  container.innerHTML = selectedKeywords.map(keyword => `
    <div class="keyword-tag">
      <span>${keyword.name}</span>
      <span class="remove-keyword" onclick="removeKeyword(${keyword.id})">×</span>
    </div>
  `).join('');
}


// Setup keywords autocomplete

function setupKeywordsAutocomplete() {
  const input = document.getElementById('keywords-input');
  const container = document.getElementById('keywords-container');
  let autocompleteDiv = null;
  
  input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    clearTimeout(keywordSearchTimeout);
    
    if (query.length < 2) {
      if (autocompleteDiv) {
        autocompleteDiv.remove();
        autocompleteDiv = null;
      }
      return;
    }
    
    keywordSearchTimeout = setTimeout(async () => {
      const keywords = await searchKeywords(query);
      
      // Remove old autocomplete
      if (autocompleteDiv) {
        autocompleteDiv.remove();
      }
      
      if (keywords.length > 0) {
        autocompleteDiv = document.createElement('div');
        autocompleteDiv.className = 'keywords-autocomplete';
        autocompleteDiv.innerHTML = keywords.slice(0, 5).map(keyword => `
          <div class="autocomplete-item" data-id="${keyword.id}" data-name="${keyword.name}">
            ${keyword.name}
          </div>
        `).join('');
        
        input.parentElement.style.position = 'relative';
        input.parentElement.appendChild(autocompleteDiv);
        
        // Add click handlers
        autocompleteDiv.querySelectorAll('.autocomplete-item').forEach(item => {
          item.addEventListener('click', () => {
            addKeywordTag({
              id: parseInt(item.dataset.id),
              name: item.dataset.name
            });
            input.value = '';
            autocompleteDiv.remove();
            autocompleteDiv = null;
          });
        });
      }
    }, 300);
  });
  
  // Close autocomplete when clicking outside
  document.addEventListener('click', (e) => {
    if (autocompleteDiv && !input.contains(e.target) && !autocompleteDiv.contains(e.target)) {
      autocompleteDiv.remove();
      autocompleteDiv = null;
    }
  });
  
  // Handle Enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (autocompleteDiv) {
        const firstItem = autocompleteDiv.querySelector('.autocomplete-item');
        if (firstItem) {
          firstItem.click();
        }
      }
    }
  });
}

// Filter snapshot / change detection helpers 
function getFiltersState() {
  const scoreMin = document.getElementById('score-min').value;
  const scoreMax = document.getElementById('score-max').value;
  const voteMin = document.getElementById('vote-min').value;
  const voteMax = document.getElementById('vote-max').value;
  const runtimeMin = document.getElementById('runtime-min').value;
  const runtimeMax = document.getElementById('runtime-max').value;
  const releaseFrom = document.getElementById('release-from').value;
  const releaseTo = document.getElementById('release-to').value;
  const searchAllCountries = document.getElementById('search-all-countries').checked;
  const searchAllReleases = document.getElementById('search-all-releases').checked;
  const countryEl = document.getElementById('country-select');
  const country = countryEl ? countryEl.value : '';
  const releaseTypes = Array.from(document.querySelectorAll('.release-type:checked')).map(cb => cb.value).sort();

  return {
    sort: sortSelect.value,
    scoreMin, scoreMax, voteMin, voteMax, runtimeMin, runtimeMax,
    releaseFrom, releaseTo,
    searchAllCountries, searchAllReleases, country,
    selectedGenres: [...selectedGenres].slice().sort(),
    selectedKeywords: selectedKeywords.map(k => k.id).slice().sort(),
    releaseTypes
  };
}

function takeFiltersSnapshot() {
  try {
    filtersSnapshot = JSON.stringify(getFiltersState());
    filtersChanged = false;
    updateFloatingButton();
  } catch (e) {
    // ignore during early init
  }
}

function checkFiltersChanged() {
  if (!filtersSnapshot) return false;
  let changed = false;
  try {
    changed = JSON.stringify(getFiltersState()) !== filtersSnapshot;
  } catch (e) {
    changed = false;
  }
  filtersChanged = changed;
  updateFloatingButton();
  return changed;
}

function isElementFullyVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.top >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
}

function updateFloatingButton() {
  if (!filtersChanged) {
    searchBtn.classList.remove('floating');
    document.body.classList.remove('with-floating');
    return;
  }

  if (!isElementFullyVisible(searchBtn)) {
    searchBtn.classList.add('floating');
    document.body.classList.add('with-floating');
  } else {
    searchBtn.classList.remove('floating');
    document.body.classList.remove('with-floating');
  }
}


// Render genres as toggleable buttons

function renderGenres() {
  const container = document.getElementById('genres-container');
  container.innerHTML = genres.map(genre => `
    <button class="genre-tag" data-id="${genre.id}">${genre.name}</button>
  `).join('');

  container.addEventListener('click', (e) => {
    if (e.target.classList.contains('genre-tag')) {
      const genreId = parseInt(e.target.dataset.id);
      e.target.classList.toggle('active');
      
      if (selectedGenres.includes(genreId)) {
        selectedGenres = selectedGenres.filter(id => id !== genreId);
      } else {
        selectedGenres.push(genreId);
      }
      try { checkFiltersChanged(); } catch(e) { }
    }
  });
}


// Get selected release types

function getSelectedReleaseTypes() {
  const checkboxes = document.querySelectorAll('.release-type:checked');
  const types = Array.from(checkboxes).map(cb => cb.value);
  return types.length > 0 ? types.join('|') : '';
}

// Fetch movies from API with all filters
 
async function fetchMovies(page, append = false) {
  if (isFetching) return;
  isFetching = true;
  
  try {
    const sortBy = sortSelect.value;
    const scoreMin = document.getElementById('score-min').value;
    const scoreMax = document.getElementById('score-max').value;
    const voteMin = document.getElementById('vote-min').value;
    const voteMax = document.getElementById('vote-max').value;
    const runtimeMin = document.getElementById('runtime-min').value;
    const runtimeMax = document.getElementById('runtime-max').value;
    const releaseFrom = document.getElementById('release-from').value;
    const releaseTo = document.getElementById('release-to').value;
    const searchAllCountries = document.getElementById('search-all-countries').checked;
    const searchAllReleases = document.getElementById('search-all-releases').checked;
    const country = document.getElementById('country-select').value;

    let url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=en-US&page=${page}&sort_by=${sortBy}`;
    
    // Genres filter
    if (selectedGenres.length > 0) {
      url += `&with_genres=${selectedGenres.join(',')}`;
    }
    
    // User score filter
    if (scoreMin > 0) {
      url += `&vote_average.gte=${scoreMin}`;
    }
    
    if (scoreMax < 10) {
      url += `&vote_average.lte=${scoreMax}`;
    }
    
    // Vote count filter
    if (voteMin > 0) {
      url += `&vote_count.gte=${voteMin}`;
    }
    
    if (voteMax < 500) {
      url += `&vote_count.lte=${voteMax}`;
    }
    
    // Runtime filter
    if (runtimeMin > 0) {
      url += `&with_runtime.gte=${runtimeMin}`;
    }
    
    if (runtimeMax < 400) {
      url += `&with_runtime.lte=${runtimeMax}`;
    }
    
    // Release date filtering
    if (!searchAllReleases) {
      if (releaseFrom) {
        url += `&primary_release_date.gte=${releaseFrom}`;
      }
      
      if (releaseTo) {
        url += `&primary_release_date.lte=${releaseTo}`;
      }
    }

    // Country and release type filters
    if (!searchAllCountries && country) {
      url += `&region=${country}`;
      const releaseTypes = getSelectedReleaseTypes();
      if (releaseTypes) {
        url += `&with_release_type=${releaseTypes}`;
      }
    }

    // Keywords filter
    if (selectedKeywords.length > 0) {
      url += `&with_keywords=${selectedKeywords.map(k => k.id).join(',')}`;
    }

    console.log('Fetching URL:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    totalPages = data.total_pages;
    isFetching = false;
    return data.results;
  } catch (error) {
    console.error('Error fetching movies:', error);
    isFetching = false;
    return [];
  }
}


// Determine rating color class

function getRatingColor(rating) {
    if (rating >= 7) return 'green';
    if (rating >= 4) return 'yellow';
    return 'red';
}

// Format Date to "MMM DD, YYYY"
 
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Generate HTML for a single movie card
 
function createMovieCard(movie) {
    const card = document.createElement('div');
    card.className = 'movie-card';

    // Check if screen is mobile size
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        card.classList.add('horizontal');
    }

    // Calculate rating percentage 
    const ratingPercent = Math.round(movie.vote_average * 10);
    const colorClass = getRatingColor(movie.vote_average);
    const poster = movie.poster_path ? `${IMAGE_PATH}${movie.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';

    // Truncate overview text
    const overview = movie.overview ? 
        (movie.overview.length > 150 ? movie.overview.substring(0, 150) + '...' : movie.overview) 
        : 'No overview available.';

    if (isMobile) {
        // Horizontal layout for mobile
        card.innerHTML = `
            <a href="#">
                <img src="${poster}" alt="${movie.title}" loading="lazy" />
            </a>
            <div class="movie-info">
                <div class="rating-container ${colorClass}" style="--pct: ${ratingPercent}%">
                    <div class="rating-inner">
                        ${ratingPercent}<span>%</span>
                    </div>
                </div>
                <h3 class="movie-title">${movie.title}</h3>
                <p class="release-date">${formatDate(movie.release_date)}</p>
                <p class="movie-overview">${overview}</p>
            </div>
        `;
    } else {
        // Vertical layout for desktop
        card.innerHTML = `
            <a href="#">
                <img src="${poster}" alt="${movie.title}" loading="lazy" />
            </a>
            <div class="movie-info">
                <div class="rating-container ${colorClass}" style="--pct: ${ratingPercent}%">
                    <div class="rating-inner">
                        ${ratingPercent}<span>%</span>
                    </div>
                </div>
                <h3 class="movie-title">${movie.title}</h3>
                <p class="release-date">${formatDate(movie.release_date)}</p>
            </div>
        `;
    }
    
    return card;
}


// Render movies to the DOM

function renderMovies(movies, append = false) {
    if (!append) {
        movieGrid.innerHTML = ''; // Clear grid if new search
    }

    const fragment = document.createDocumentFragment();
    movies.forEach(movie => {
        fragment.appendChild(createMovieCard(movie));
    });
    
    movieGrid.appendChild(fragment);
    
    // Show/hide load more button
    if (currentPage < totalPages) {
      loadMoreBtn.style.display = 'block';
    } else {
      loadMoreBtn.style.display = 'none';
    }
}

// Store current movies for re-rendering on resize
let currentMovies = [];

// Handle window resize to switch between layouts
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (currentMovies.length > 0) {
            renderMovies(currentMovies, false);
        }
    }, 250);
});

// Setup dual range sliders
 
function setupDualRange(minId, maxId, trackId, min, max) {
  const minSlider = document.getElementById(minId);
  const maxSlider = document.getElementById(maxId);
  const track = document.getElementById(trackId);
  
  function updateTrack() {
    const minVal = parseInt(minSlider.value);
    const maxVal = parseInt(maxSlider.value);
    const minPercent = ((minVal - min) / (max - min)) * 100;
    const maxPercent = ((maxVal - min) / (max - min)) * 100;
    
    track.style.background = `linear-gradient(to right, 
      #e3e3e3 0%, 
      #e3e3e3 ${minPercent}%, 
      #01b4e4 ${minPercent}%, 
      #01b4e4 ${maxPercent}%, 
      #e3e3e3 ${maxPercent}%, 
      #e3e3e3 100%)`;
  }
  
  minSlider.addEventListener('input', () => {
    const minVal = parseInt(minSlider.value);
    const maxVal = parseInt(maxSlider.value);
    if (minVal > maxVal) {
      minSlider.value = maxVal;
    }
    updateTrack();
  });
  
  maxSlider.addEventListener('input', () => {
    const minVal = parseInt(minSlider.value);
    const maxVal = parseInt(maxSlider.value);
    if (maxVal < minVal) {
      maxSlider.value = minVal;
    }
    updateTrack();
  });
  
  updateTrack();
}

// Setup event listeners

function setupEventListeners() {
  // Search all countries toggle
  const searchAllCountries = document.getElementById('search-all-countries');
  const countrySelector = document.getElementById('country-selector');
  
  searchAllCountries.addEventListener('change', () => {
    if (searchAllCountries.checked) {
      countrySelector.style.display = 'none';
    } else {
      countrySelector.style.display = 'block';
    }
  });

  // Search all releases toggle
  const searchAllReleases = document.getElementById('search-all-releases');
  const releaseDateFrom = document.getElementById('release-from');
  const releaseDateTo = document.getElementById('release-to');
  
  searchAllReleases.addEventListener('change', () => {
    if (searchAllReleases.checked) {
      releaseDateFrom.disabled = true;
      releaseDateTo.disabled = true;
      releaseDateFrom.value = '';
      releaseDateTo.value = '';
    } else {
      releaseDateFrom.disabled = false;
      releaseDateTo.disabled = false;
    }
  });

  // Initialize disabled state for date inputs
  if (searchAllReleases.checked) {
    releaseDateFrom.disabled = true;
    releaseDateTo.disabled = true;
  }

  // Search button
  searchBtn.addEventListener('click', handleSearch);
  
  // Load more button
  loadMoreBtn.addEventListener('click', handleLoadMore);
  
  // Sort menu toggle
  const sortMenu = document.getElementById('sort-menu');
  const sortSelection = sortMenu.nextElementSibling;
  
  sortMenu.addEventListener('click', () => {
    const icon = sortMenu.querySelector('i');
    if (sortSelection.style.display === 'none') {
      sortSelection.style.display = 'block';
      icon.className = 'fa-solid fa-chevron-down';
    } else {
      sortSelection.style.display = 'none';
      icon.className = 'fa-solid fa-chevron-right';
    }
  });
  
  // Filter menu toggle
  const filterMenu = document.getElementById('filter-menu');
  const filterSelection = filterMenu.nextElementSibling;
  
  filterMenu.addEventListener('click', () => {
    const icon = filterMenu.querySelector('i');
    if (filterSelection.style.display === 'none') {
      filterSelection.style.display = 'block';
      icon.className = 'fa-solid fa-chevron-down';
    } else {
      filterSelection.style.display = 'none';
      icon.className = 'fa-solid fa-chevron-right';
    }
  });
  
  // Set panels to collapsed on mobile by default
  if (window.innerWidth <= 768) {
    sortSelection.style.display = 'none';
    filterSelection.style.display = 'none';
    sortMenu.querySelector('i').className = 'fa-solid fa-chevron-right';
    filterMenu.querySelector('i').className = 'fa-solid fa-chevron-right';
  }

  // Monitor user interactions inside the filters panel to detect changes
  const filtersContainer = document.querySelector('.filters');
  if (filtersContainer) {
    ['input', 'change', 'click'].forEach(evt => {
      filtersContainer.addEventListener(evt, (ev) => {
        if (ev.target === searchBtn) return;
        checkFiltersChanged();
      }, { passive: true });
    });
  }

  // Re-evaluate floating button on scroll/resize (in case button goes out of view)
  window.addEventListener('scroll', () => updateFloatingButton());
  window.addEventListener('resize', () => updateFloatingButton());
}

// Event Handlers
 
async function handleLoadMore() {
    currentPage++;
    loadMoreBtn.textContent = 'Loading...';
    const movies = await fetchMovies(currentPage, true);
    currentMovies = currentMovies.concat(movies);
    renderMovies(currentMovies, false);
    loadMoreBtn.textContent = 'Load More';
}

async function handleSearch() {
    currentPage = 1;
    
    // Visual feedback
    searchBtn.textContent = 'Searching...';
    movieGrid.style.opacity = '0.5';

    const movies = await fetchMovies(currentPage, false);
    currentMovies = movies;
    renderMovies(movies, false);

    searchBtn.textContent = 'Search';
    movieGrid.style.opacity = '1';
    try { takeFiltersSnapshot(); } catch (e) { }
}

// Initialize
(async function init() {
    renderGenres();
    await populateCountries();
    setupEventListeners();
    setupKeywordsAutocomplete();
    setupDualRange('score-min', 'score-max', 'score-track', 0, 10);
    setupDualRange('vote-min', 'vote-max', 'votes-track', 0, 500);
    setupDualRange('runtime-min', 'runtime-max', 'runtime-track', 0, 400);
    
    const movies = await fetchMovies(currentPage);
    currentMovies = movies;
    renderMovies(movies);
})();

// Make removeKeyword globally accessible
window.removeKeyword = removeKeyword;

// After initial rendering we should snapshot the current filters state
window.addEventListener('load', () => {
  setTimeout(() => {
    try { takeFiltersSnapshot(); } catch (e) { }
  }, 300);
});