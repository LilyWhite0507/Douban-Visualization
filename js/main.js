const introScreen = document.getElementById("intro-screen");
const app = document.getElementById("app");
const enterButton = document.getElementById("enter-app-btn");
const prevSceneBtn = document.getElementById("prev-scene");
const nextSceneBtn = document.getElementById("next-scene");
const sceneTitle = document.getElementById("scene-title");
const sceneDesc = document.getElementById("scene-desc");
const datasetToggle = document.getElementById("dataset-toggle");
const yearTagsContainer = document.getElementById("year-tags");
const directorControls = document.getElementById("director-controls");
const ratingRankPanel = document.getElementById("rating-rank-panel");
const directorChartPanel = document.getElementById("director-chart-panel");
const hoverTip = document.getElementById("hover-tip");
const canvasShell = document.querySelector(".canvas-shell");

const detailName = document.getElementById("detail-name");
const detailHero = document.getElementById("detail-hero");
const detailScore = document.getElementById("detail-score");
const detailVotes = document.getElementById("detail-votes");
const detailYear = document.getElementById("detail-year");
const detailGenres = document.getElementById("detail-genres");
const detailRegion = document.getElementById("detail-region");
const detailDirector = document.getElementById("detail-director");
const detailActors = document.getElementById("detail-actors");
const detailStory = document.getElementById("detail-story");

const svg = d3.select("#viz-canvas");
const rootLayer = svg.append("g");
const bgLayer = rootLayer.append("g");
const chartLayer = rootLayer.append("g");
const particleLayer = rootLayer.append("g");

const SCENES = [
  {
    id: "overview",
    title: "Particle Overview",
    desc: "Each glowing particle is one movie with a valid poster URL. Hover to inspect details."
  },
  {
    id: "year",
    title: "Year Lens",
    desc: "Click a year tag. That year stays colorful while all other movie particles turn gray."
  },
  {
    id: "genre",
    title: "Genre Morph",
    desc: "Particles move and settle into a thematic particle bar chart by primary genre."
  },
  {
    id: "rating",
    title: "Rating Ranking Tags",
    desc: "Top-rated and high-vote movies are shown in ranked neon tags."
  },
  {
    id: "map",
    title: "Country Heat Map",
    desc: "Countries reflect film quality and popularity using score tint and vote-size bubbles."
  },
  {
    id: "director",
    title: "Director Reputation Distribution",
    desc: "Switch between high/low datasets and sort directors by film count, average score, or high-score count."
  }
];

const countryAlias = {
  "中国大陆": "China",
  "中国香港": "Hong Kong",
  "中国台湾": "Taiwan",
  "美国": "United States of America",
  "英国": "United Kingdom",
  "法国": "France",
  "德国": "Germany",
  "日本": "Japan",
  "韩国": "South Korea",
  "印度": "India",
  "意大利": "Italy",
  "西班牙": "Spain",
  "俄罗斯": "Russia",
  "加拿大": "Canada",
  "澳大利亚": "Australia",
  "巴西": "Brazil",
  "墨西哥": "Mexico",
  "阿根廷": "Argentina",
  "伊朗": "Iran",
  "土耳其": "Turkey",
  "泰国": "Thailand",
  "新加坡": "Singapore"
};

const state = {
  movies: [],
  sampledMovies: [],
  years: [],
  selectedYear: null,
  sceneIndex: 0,
  simulation: null,
  particleData: [],
  width: 0,
  height: 0,
  canvasRect: null,
  hoverRAF: null,
  hoverX: 0,
  hoverY: 0,
  hoverDetailTimer: null,
  activeDetailMovieId: null,
  mapGeoJson: null,
  directorMetric: "count",
  datasetMode: "high",
  datasetCache: { high: null, low: null },
  directorStatsCache: { high: null, low: null }
};

const genreColors = d3.scaleOrdinal(d3.schemeTableau10);

enterButton.addEventListener("click", async () => {
  introScreen.classList.add('show-guide');
  const guideCopy = document.querySelector('.guide-copy');
  if (guideCopy) guideCopy.classList.add('visible');
  await new Promise((resolve) => setTimeout(resolve, 380));
  introScreen.classList.add('hidden');
  app.classList.remove('hidden');
  setupCanvas();
  await loadMovies();
  await wireDatasetToggle();
  renderScene();
});

nextSceneBtn.addEventListener("click", () => {
  state.sceneIndex = Math.min(SCENES.length - 1, state.sceneIndex + 1);
  renderScene();
});

prevSceneBtn.addEventListener("click", () => {
  state.sceneIndex = Math.max(0, state.sceneIndex - 1);
  renderScene();
});

window.addEventListener("resize", () => {
  if (app.classList.contains("hidden")) return;
  setupCanvas();
  renderScene();
});

function setupCanvas() {
  state.width = canvasShell.clientWidth;
  state.height = canvasShell.clientHeight;
  state.canvasRect = canvasShell.getBoundingClientRect();
  svg.attr("viewBox", [0, 0, state.width, state.height]);
}

async function loadMovies() {
  state.movies = await loadDatasetRows(state.datasetMode);
  refreshActiveDataset();
}

async function loadDatasetRows(mode) {
  if (state.datasetCache[mode]) return state.datasetCache[mode];
  const path = mode === "low" ? "./dataset_clean/low/movies.csv" : "./dataset_clean/high/movies.csv";
  const rows = await d3.csv(path);
  const parsed = rows.map((row) => {
    const cover = (row.COVER || "").trim();
    const score = Number(row.DOUBAN_SCORE || 0);
    const votes = Number(row.DOUBAN_VOTES || 0);
    const year = Number(row.YEAR || 0);
    const genres = (row.GENRES || "")
      .split("/")
      .map((d) => d.trim())
      .filter(Boolean);
    const regions = (row.REGIONS || "")
      .split("/")
      .map((d) => d.trim())
      .filter(Boolean);
    const directors = (row.DIRECTORS || "")
      .split("/")
      .map((d) => d.trim())
      .filter(Boolean);
    const actors = (row.ACTORS || "")
      .split("/")
      .map((d) => d.trim())
      .filter(Boolean);
    return {
      id: row.MOVIE_ID,
      name: row.NAME || "Unknown Movie",
      cover,
      score,
      votes,
      year,
      genres,
      primaryGenre: genres[0] || "Unknown",
      region: regions[0] || "Unknown",
      regions,
      directors,
      director: directors[0] || "Unknown",
      actors,
      actorText: actors.slice(0, 6).join(" / "),
      storyline: row.STORYLINE || "No summary available."
    };
  });
  state.datasetCache[mode] = parsed;
  return parsed;
}

async function loadDirectorStats(mode) {
  if (state.directorStatsCache[mode]) return state.directorStatsCache[mode];
  const url = mode === 'low' ? './dataset_clean/director/low.json' : './dataset_clean/director/high.json';
  const stats = await d3.json(url);
  state.directorStatsCache[mode] = stats || [];
  return state.directorStatsCache[mode];
}

function findDirectorStats(director, mode) {
  const stats = state.directorStatsCache[mode] || [];
  return stats.find((item) => item.director === director) || null;
}

function findDirectorFromSeed(director, mode) {
  const seedMovies = state.datasetCache[mode] || [];
  const matched = seedMovies.filter((movie) => (movie.directors || []).includes(director));
  if (!matched.length) return null;
  const allMovies = (state.movies || []).filter((movie) => (movie.directors || []).includes(director));
  return {
    director,
    movieCount: matched.length,
    avgScore: d3.mean(allMovies, (d) => d.score) || d3.mean(matched, (d) => d.score) || 0,
    bands: allMovies.reduce((acc, movie) => {
      const score = movie.score;
      const band = score < 2 ? '0-2' : score < 4 ? '2-4' : score < 6 ? '4-6' : score < 8 ? '6-8' : '8-10';
      acc[band] = (acc[band] || 0) + 1;
      return acc;
    }, {'0-2':0,'2-4':0,'4-6':0,'6-8':0,'8-10':0}),
    movies: allMovies.sort((a, b) => b.score - a.score || b.year - a.year || a.name.localeCompare(b.name)).slice(0, 30)
  };
}

function selectTopMovies(movies, targetSize) {
  return [...movies]
    .sort((a, b) => b.score - a.score || b.votes - a.votes || b.year - a.year)
    .slice(0, targetSize);
}

function selectBottomMovies(movies, targetSize) {
  return [...movies]
    .sort((a, b) => a.score - b.score || a.votes - b.votes || a.year - b.year)
    .slice(0, targetSize);
}

function refreshActiveDataset() {
  state.sampledMovies = state.datasetMode === "high"
    ? selectTopMovies(state.movies, 1500)
    : selectBottomMovies(state.movies, 1500);
  state.years = [...new Set(state.sampledMovies.map((d) => Math.floor(d.year / 10) * 10))]
    .filter((decade) => decade >= 1900 && decade <= 2010)
    .sort((a, b) => a - b);
  state.selectedYear = "ALL";
  genreColors.domain([...new Set(state.sampledMovies.map((d) => d.primaryGenre))]);
  buildParticleCache();
  updateDatasetToggleUI();
}

function renderScene() {
  const scene = SCENES[state.sceneIndex];
  sceneTitle.textContent = scene.title;
  sceneDesc.textContent = scene.desc;
  prevSceneBtn.disabled = state.sceneIndex <= 0;
  prevSceneBtn.style.opacity = state.sceneIndex <= 0 ? "0.45" : "1";
  nextSceneBtn.disabled = state.sceneIndex >= SCENES.length - 1;
  nextSceneBtn.style.opacity = state.sceneIndex >= SCENES.length - 1 ? "0.45" : "1";

  chartLayer.selectAll("*").remove();
  stopSimulation();
  hideSceneSpecificPanels();
  particleLayer.selectAll("*").interrupt();
  chartLayer.selectAll("*").interrupt();
  canvasShell.classList.remove("scene-fade");
  void canvasShell.offsetWidth;
  canvasShell.classList.add("scene-fade");

  if (scene.id === "overview") renderOverviewScene();
  if (scene.id === "year") renderYearScene();
  if (scene.id === "genre") renderGenreScene();
  if (scene.id === "rating") renderRatingScene();
  if (scene.id === "map") renderMapScene();
  if (scene.id === "director") renderDirectorScene();
}

function hideSceneSpecificPanels() {
  yearTagsContainer.classList.add("hidden");
  directorControls.classList.add("hidden");
  ratingRankPanel.classList.add("hidden");
  directorChartPanel.classList.add("hidden");
  hoverTip.classList.add("hidden");
}

function stopSimulation() {
  if (state.simulation) {
    state.simulation.stop();
    state.simulation = null;
  }
}

function ensureParticles() {
  const nodes = particleLayer
    .selectAll("circle")
    .data(state.particleData, (d) => d.id)
    .join("circle")
    .attr("class", "movie-node")
    .attr("r", (d) => d.r)
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("fill", (d) => getMovieFill(d))
    .attr("stroke", "rgba(20,20,20,0.18)")
    .attr("stroke-width", 0.6)
    .attr("opacity", 0.9)
    .attr("pointer-events", "all")
    .on("mouseenter", (event, d) => {
      onEnterMovie(event, d);
      onHoverMovie(event, d);
    })
    .on("mousemove", onMoveHoverTip)
    .on("mouseleave", (event, d) => onLeaveMovie(event, d));

  return nodes;
}

function buildParticleCache() {
  const r = d3.scaleSqrt().domain([0, 10]).range([2.4, 8.8]);
  state.particleData = state.sampledMovies.map((d) => ({
    ...d,
    r: r(d.score),
    x: Math.random() * state.width,
    y: Math.random() * state.height
  }));
}

function renderOverviewScene() {
  const nodes = ensureParticles();
  showBackgroundDust();
  const particles = nodes.data();
  state.simulation = d3.forceSimulation(particles)
    // Dense gravity pack: particles squeeze together without overlap.
    .force("radial", d3.forceRadial(0, state.width / 2, state.height / 2).strength(0.045))
    .force("collide", d3.forceCollide().radius((d) => d.r + 0.9).iterations(2))
    .velocityDecay(0.2)
    .alpha(0.85)
    .alphaDecay(0.035)
    .on("tick", () => {
      nodes
        .attr("cx", (d) => clamp(d.x, d.r, state.width - d.r))
        .attr("cy", (d) => clamp(d.y, d.r, state.height - d.r));
    });
}

function renderYearScene() {
  const nodes = ensureParticles();
  showBackgroundDust();
  yearTagsContainer.classList.remove("hidden");
  renderYearTags(nodes);
  const particles = nodes.data();
  state.simulation = d3.forceSimulation(particles)
    .force("radial", d3.forceRadial(0, state.width / 2, state.height / 2).strength(0.044))
    .force("collide", d3.forceCollide().radius((d) => d.r + 0.9).iterations(2))
    .velocityDecay(0.2)
    .alpha(0.82)
    .alphaDecay(0.038)
    .on("tick", () => {
      nodes
        .attr("cx", (d) => clamp(d.x, d.r, state.width - d.r))
        .attr("cy", (d) => clamp(d.y, d.r, state.height - d.r));
    });
}

function renderYearTags(nodes) {
  yearTagsContainer.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.textContent = "ALL";
  allBtn.classList.toggle("active", state.selectedYear === "ALL");
  allBtn.addEventListener("click", () => {
    state.selectedYear = "ALL";
    renderYearTags(nodes);
    updateYearHighlight(nodes);
  });
  yearTagsContainer.appendChild(allBtn);

  state.years.forEach((decade) => {
    const btn = document.createElement("button");
    btn.textContent = `${decade}s`;
    btn.classList.toggle("active", decade === state.selectedYear);
    btn.addEventListener("click", () => {
      state.selectedYear = decade;
      renderYearTags(nodes);
      updateYearHighlight(nodes);
    });
    yearTagsContainer.appendChild(btn);
  });
  updateYearHighlight(nodes);
}

function updateYearHighlight(nodes) {
  const activeDecade = state.selectedYear;
  nodes
    .transition()
    .duration(450)
    .attr("fill", (d) => (activeDecade === "ALL" || Math.floor(d.year / 10) * 10 === activeDecade ? getMovieFill(d) : "rgba(170,170,190,0.35)"))
    .attr("opacity", (d) => (activeDecade === "ALL" || Math.floor(d.year / 10) * 10 === activeDecade ? 0.98 : 0.22))
    .attr("pointer-events", (d) => (activeDecade === "ALL" || Math.floor(d.year / 10) * 10 === activeDecade ? "all" : "none"));
}

function renderGenreScene() {
  showBackgroundDust();
  const nodes = ensureParticles();
  const particles = nodes.data();
  const topGenres = d3.rollups(particles, (arr) => arr.length, (d) => getPrimaryColorGenre(d))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 9)
    .map((d) => d[0]);
  const x = d3.scaleBand().domain(topGenres).range([0, state.width]).paddingInner(0).paddingOuter(0);
  const counts = new Map(topGenres.map((genre) => [genre, 0]));
  const barBottom = state.height - 18;
  const barTop = 66;
  const availableHeight = Math.max(160, barBottom - barTop);
  const rowStep = 16;
  const maxRows = Math.max(1, Math.floor(availableHeight / rowStep));

  particles.forEach((d) => {
    const genre = getPrimaryColorGenre(d);
    d.bucket = topGenres.includes(genre) ? genre : topGenres[topGenres.length - 1];
    const index = counts.get(d.bucket) || 0;
    const colX = x(d.bucket) + x.bandwidth() / 2;
    const row = index % maxRows;
    const layer = Math.floor(index / maxRows);
    d.tx = colX;
    d.ty = barBottom - row * rowStep - layer * 1.2;
    counts.set(d.bucket, index + 1);
  });

  chartLayer.selectAll("text.genre-label")
    .data(topGenres)
    .join("text")
    .attr("class", "genre-label")
    .attr("x", (d) => x(d) + x.bandwidth() / 2)
    .attr("y", state.height - 22)
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(240,250,255,0.95)")
    .style("font-size", "11px")
    .text((d) => d);

  state.simulation = d3.forceSimulation(particles)
    .force("x", d3.forceX((d) => d.tx).strength(0.9))
    .force("y", d3.forceY((d) => d.ty).strength(1))
    .force("collide", d3.forceCollide().radius((d) => d.r + 0.15).iterations(1))
    .alpha(1)
    .alphaDecay(0.16)
    .velocityDecay(0.45)
    .on("tick", () => {
      nodes
        .attr("cx", (d) => clamp(d.x, d.r, state.width - d.r))
        .attr("cy", (d) => clamp(d.y, d.r, state.height - d.r))
        .attr("fill", (d) => getMovieFill(d))
        .attr("opacity", 0.96)
        .attr("pointer-events", "all");
    });
}

function renderRatingScene() {
  showBackgroundDust();
  particleLayer.selectAll("*").remove();
  ratingRankPanel.classList.remove("hidden");

  const rankedMovies = getRankedMovies(state.sampledMovies, state.datasetMode);
  const rankData = rankedMovies.slice(0, 50);

  ratingRankPanel.innerHTML = "";
  rankData.forEach((movie, idx) => {
    const item = document.createElement("article");
    item.className = "rank-item";
    item.innerHTML = `<b>#${idx + 1} ${movie.name}</b><div>Score ${movie.score.toFixed(1)} · Votes ${movie.votes.toLocaleString()} · ${movie.year}</div>`;
    item.addEventListener("mouseenter", () => fillDetail(movie));
    ratingRankPanel.appendChild(item);
  });
}

async function renderMapScene() {
  showBackgroundDust();
  particleLayer.selectAll("*").remove();
  const existing = document.getElementById('country-movie-list');
  if (existing) existing.remove();
  const renderToken = `${Date.now()}-${Math.random()}`;
  state.currentMapRenderToken = renderToken;

  chartLayer.append("text")
    .attr("class", "map-status")
    .attr("x", 24)
    .attr("y", 38)
    .attr("fill", "#111")
    .style("font-size", "14px")
    .text("Loading world map...");

  const geo = await fetchWorldGeoJson();
  if (state.currentMapRenderToken !== renderToken) return;
  chartLayer.selectAll("text.map-status").remove();
  if (!geo || !geo.features || !geo.features.length) {
    chartLayer.append("text")
      .attr("x", 24)
      .attr("y", 38)
      .attr("fill", "#111")
      .style("font-size", "14px")
      .text("Map data failed to load. Please check network or provide local world.geojson.");
    return;
  }

  const countryStats = d3.rollups(
    state.sampledMovies.filter((d) => d.region !== "Unknown"),
    (arr) => ({
      count: arr.length,
      avgScore: d3.mean(arr, (d) => d.score),
      totalVotes: d3.sum(arr, (d) => d.votes)
    }),
    (d) => countryAlias[d.region] || d.region
  );
  const byCountry = new Map(countryStats);
  const projection = d3.geoNaturalEarth1().fitExtent([[18, 24], [state.width - 18, state.height - 24]], geo);
  const path = d3.geoPath(projection);

  const scoreColor = d3.scaleSequential(state.datasetMode === "high" ? [6.3, 9.2] : [2.0, 6.5], (t) => d3.interpolateRgbBasis(["#4d4d4d", "#9400d3", "#ff69b4", "#00ffff"])(t));
  const bubble = d3.scaleSqrt().domain([0, d3.max(countryStats, (d) => d[1].totalVotes) || 1]).range([0, 20]);

  chartLayer.selectAll("path.country")
    .data(geo.features)
    .join("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("stroke", "rgba(245,250,255,0.55)")
    .attr("stroke-width", 0.5)
    .attr("fill", (d) => {
      const stats = byCountry.get(d.properties.name);
      return stats ? scoreColor(stats.avgScore) : "rgba(120,130,160,0.24)";
    })
    .attr("opacity", 0.85)
    .on("mouseenter", (event, d) => {
      const stats = byCountry.get(d.properties.name);
      const countryMovies = state.sampledMovies
        .filter((movie) => (countryAlias[movie.region] || movie.region) === d.properties.name)
        .slice()
        .sort((a, b) => state.datasetMode === 'low'
          ? a.score - b.score || a.votes - b.votes || a.year - b.year
          : b.score - a.score || b.votes - a.votes || b.year - a.year)
        .slice(0, 50);
      hoverTip.classList.remove("hidden");
      hoverTip.innerHTML = stats
        ? `<strong>${d.properties.name}</strong><br/>Avg Score ${stats.avgScore.toFixed(2)}<br/>Movies ${stats.count}<br/>Votes ${Math.round(stats.totalVotes).toLocaleString()}`
        : `<strong>${d.properties.name}</strong><br/>No matched data`;
      renderCountryDetail(d.properties.name, countryMovies);
      onMoveHoverTip(event);
    })
    .on("mousemove", onMoveHoverTip)
    .on("mouseleave", () => hoverTip.classList.add("hidden"));

  chartLayer.selectAll("circle.country-bubble")
    .data(geo.features)
    .join("circle")
    .attr("class", "country-bubble")
    .attr("transform", (d) => `translate(${path.centroid(d)})`)
    .attr("r", (d) => {
      const stats = byCountry.get(d.properties.name);
      return stats ? bubble(stats.totalVotes) : 0;
    })
    .attr("fill", "rgba(255,255,255,0.35)")
    .attr("stroke", "rgba(0,255,255,0.7)")
    .attr("stroke-width", 1);
}

async function fetchWorldGeoJson() {
  if (state.mapGeoJson) return state.mapGeoJson;
  const urls = [
    "https://cdn.jsdelivr.net/gh/holtzy/D3-graph-gallery@master/DATA/world.geojson",
    "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson",
    "https://geojson-maps.ash.ms/world-110m.geo.json"
  ];
  for (const url of urls) {
    try {
      const geo = await d3.json(url);
      if (geo && geo.features && geo.features.length) {
        state.mapGeoJson = geo;
        return geo;
      }
    } catch (error) {
      // Try next mirror.
    }
  }
  return null;
}

function showBackgroundDust() {
  bgLayer.selectAll("*").remove();
  bgLayer.selectAll("circle")
    .data(d3.range(Math.max(100, Math.floor((state.width * state.height) / 12000))))
    .join("circle")
    .attr("cx", () => Math.random() * state.width)
    .attr("cy", () => Math.random() * state.height)
    .attr("r", () => Math.random() * 1.4 + 0.25)
    .attr("fill", "#c9f7ff")
    .attr("opacity", () => Math.random() * 0.26 + 0.05);
}

function onHoverMovie(event, movie) {
  if (state.hoverDetailTimer) {
    clearTimeout(state.hoverDetailTimer);
    state.hoverDetailTimer = null;
  }
  state.hoverDetailTimer = setTimeout(() => {
    if (state.activeDetailMovieId !== movie.id) {
      fillDetail(movie);
      state.activeDetailMovieId = movie.id;
    }
  }, 70);
  hoverTip.classList.remove("hidden");
  hoverTip.innerHTML = `<strong>${movie.name}</strong><br/>${movie.year} · Score ${movie.score.toFixed(1)}`;
  onMoveHoverTip(event);
}

function onLeaveMovie(event, movie) {
  if (state.hoverDetailTimer) {
    clearTimeout(state.hoverDetailTimer);
    state.hoverDetailTimer = null;
  }
  d3.select(event.currentTarget)
    .attr("r", movie.r)
    .attr("stroke", "rgba(20,20,20,0.18)")
    .attr("stroke-width", 0.6);
  hoverTip.classList.add("hidden");
}

function onEnterMovie(event, movie) {
  d3.select(event.currentTarget)
    .attr("r", movie.r * 1.12)
    .attr("stroke", "#111")
    .attr("stroke-width", 1.5);
}

function getMovieFill(movie) {
  const genre = getPrimaryColorGenre(movie);
  return genreColors(genre);
}

function getPrimaryColorGenre(movie) {
  if (!movie.genres || movie.genres.length === 0) return movie.primaryGenre || "Unknown";
  if (movie.genres[0] === "剧情" && movie.genres.length > 1) return movie.genres[1];
  return movie.genres[0];
}

async function wireDatasetToggle() {
  datasetToggle.addEventListener("click", async () => {
    state.datasetMode = state.datasetMode === "high" ? "low" : "high";
    await loadMovies();
    renderScene();
  });
  updateDatasetToggleUI();
}

function updateDatasetToggleUI() {
  const isLow = state.datasetMode === "low";
  datasetToggle.textContent = isLow ? "LOW SCORE" : "HIGH SCORE";
  datasetToggle.classList.toggle("is-low", isLow);
  datasetToggle.setAttribute("aria-pressed", String(isLow));
}

function hasActiveYearFilter() {
  return state.selectedYear !== "ALL";
}

function fillDetail(movie) {
  detailName.textContent = movie.name;
  detailHero.innerHTML = `
    <div class="detail-placeholder">
      ${movie.cover ? "No Cover Preview" : "No Cover"}
    </div>
  `;
  detailScore.textContent = movie.score.toFixed(1);
  detailVotes.textContent = movie.votes.toLocaleString();
  detailYear.textContent = String(movie.year);
  detailGenres.textContent = movie.genres.join(" / ") || "-";
  detailRegion.textContent = movie.regions.join(" / ") || "-";
  detailDirector.textContent = movie.directors?.join(" / ") || movie.director || "-";
  detailActors.textContent = movie.actors?.slice(0, 6).join(" / ") || movie.actorText || "-";
  detailStory.textContent = movie.storyline;
}

function renderCountryDetail(countryName, movies) {
  const panel = document.querySelector('.detail-panel');
  if (!panel) return;
  panel.innerHTML = `
    <h3 id="detail-name">${countryName}</h3>
    <div class="country-movie-list country-movie-list-full">
      <div class="country-movie-list-header">${countryName} · ${movies.length} 部电影</div>
      <div class="country-movie-list-body">
        ${movies.slice(0, 50).map((movie, index) => `
          <div class="country-movie-item">
            <span class="country-movie-rank">${index + 1}</span>
            <div class="country-movie-meta">
              <b>${movie.name}</b>
              <small>Score ${movie.score.toFixed(1)} · Votes ${movie.votes.toLocaleString()} · ${movie.year}</small>
            </div>
          </div>
        `).join('') || '<div class="country-movie-empty">暂无匹配电影</div>'}
      </div>
    </div>
  `;
}

function getRankedMovies(movies, mode) {
  const scoredMovies = [...movies]
    .map((movie) => ({
      ...movie,
      score: movie.score > 0 ? movie.score : estimateScore(movie)
    }))
    .filter((movie) => movie.year <= 2019 && movie.cover && /^https?:\/\//.test(movie.cover));

  return scoredMovies.sort((a, b) => {
    if (mode === "low") return a.score - b.score || a.votes - b.votes || a.year - b.year;
    return b.score - a.score || b.votes - a.votes || b.year - a.year;
  });
}

function estimateScore(movie) {
  const voteScore = Math.min(10, Math.log10((movie.votes || 0) + 1) * 1.45);
  const genreBonus = movie.genres.length ? 0.12 : 0;
  return Math.max(0.1, voteScore + genreBonus);
}

function renderDirectorScene() {
  showBackgroundDust();
  particleLayer.selectAll('*').remove();
  directorControls.classList.remove('hidden');
  directorControls.style.left = '-112px';
  directorControls.style.top = '0';
  directorControls.style.bottom = '0';
  directorControls.style.width = '96px';
  directorControls.style.flexDirection = 'column';
  directorControls.style.alignItems = 'stretch';
  directorControls.style.gap = '7px';
  directorControls.style.overflowY = 'auto';
  directorChartPanel.classList.remove('hidden');
  ratingRankPanel.classList.add('hidden');
  yearTagsContainer.classList.add('hidden');
  hoverTip.classList.add('hidden');
  state.activeDetailMovieId = null;

  const controls = [
    { id: 'count', label: '作品数' },
    { id: 'avgScore', label: '均分' }
  ];

  directorControls.innerHTML = '';
  controls.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    btn.className = item.id === state.directorMetric ? 'active' : '';
    btn.addEventListener('click', () => {
      if (state.directorMetric === item.id) return;
      state.directorMetric = item.id;
      renderDirectorScene();
    });
    directorControls.appendChild(btn);
  });

  directorChartPanel.innerHTML = '';
  const seedDirectors = new Set((state.datasetCache[state.datasetMode] || []).flatMap((movie) => movie.directors || []));
  const rows = [...seedDirectors]
    .map((director) => findDirectorStats(director, state.datasetMode) || findDirectorFromSeed(director, state.datasetMode))
    .filter((d) => d && d.movieCount > 0)
    .sort((a, b) => {
      if (state.directorMetric === 'avgScore') return b.avgScore - a.avgScore || b.movieCount - a.movieCount;
      return b.movieCount - a.movieCount || b.avgScore - a.avgScore;
    })
    .slice(0, 30);

  const width = canvasShell.clientWidth - 24;
  const height = canvasShell.clientHeight - 24;
  const innerW = Math.max(430, width - 210);
  const innerH = Math.max(380, height - 40);
  const margin = { top: 18, right: 24, bottom: 18, left: 188 };
  const maxCount = d3.max(rows, (d) => d.movieCount) || 1;
  const maxAvg = d3.max(rows, (d) => d.avgScore) || 1;
  const domainMax = state.directorMetric === 'avgScore' ? maxAvg : maxCount;
  const panel = d3.select(directorChartPanel)
    .append('svg')
    .attr('viewBox', [0, 0, width, height]);

  const x = d3.scaleLinear()
    .domain([0, domainMax])
    .nice()
    .range([margin.left, margin.left + innerW]);


  const y = d3.scaleBand()
    .domain(rows.map((d) => d.director))
    .range([margin.top, margin.top + innerH])
    .padding(0.22);

  const barLayer = panel.append('g');
  const labelLayer = panel.append('g');
  const valueLayer = panel.append('g');

  const duration = 900;
  const ease = d3.easeCubicOut;

  barLayer.selectAll('rect')
    .data(rows, (d) => d.director)
    .join(
      (enter) => enter.append('rect')
        .attr('x', margin.left)
        .attr('y', (d) => y(d.director))
        .attr('height', y.bandwidth())
        .attr('width', 0)
        .attr('rx', 10)
        .attr('fill', state.datasetMode === 'high' ? 'rgba(255, 84, 112, 0.92)' : 'rgba(20,20,20,0.18)')
        .attr('stroke', '#111')
        .attr('stroke-width', 1.5)
        .call((enterSel) => enterSel.transition().duration(duration).ease(ease)
          .attr('width', (d) => Math.max(4, x(state.directorMetric === 'avgScore' ? d.avgScore : d.movieCount) - margin.left))),
      (update) => update.call((updateSel) => updateSel.transition().duration(duration).ease(ease)
        .attr('y', (d) => y(d.director))
        .attr('height', y.bandwidth())
        .attr('width', (d) => Math.max(4, x(state.directorMetric === 'avgScore' ? d.avgScore : d.movieCount) - margin.left))),
      (exit) => exit.call((exitSel) => exitSel.transition().duration(420).ease(d3.easeCubicIn).attr('width', 0).remove())
    )
    .on('mouseenter', (event, d) => {
      hoverTip.classList.remove('hidden');
      hoverTip.innerHTML = `<strong>${d.director}</strong><br/>作品数 ${d.movieCount}<br/>均分 ${d.avgScore.toFixed(2)}`;
      onMoveHoverTip(event);
    })
    .on('mousemove', onMoveHoverTip)
    .on('mouseleave', () => hoverTip.classList.add('hidden'));

  labelLayer.selectAll('text.name')
    .data(rows, (d) => d.director)
    .join(
      (enter) => enter.append('text')
        .attr('x', 10)
        .attr('y', (d) => y(d.director) + y.bandwidth() / 2 + 5)
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#111')
        .attr('opacity', 0)
        .style('cursor', 'pointer')
        .text((d) => d.director.length > 16 ? `${d.director.slice(0, 16)}…` : d.director)
        .call((enterSel) => enterSel.transition().duration(duration).ease(ease).attr('opacity', 1)),
      (update) => update.call((updateSel) => updateSel.transition().duration(duration).ease(ease)
        .attr('x', 10)
        .attr('y', (d) => y(d.director) + y.bandwidth() / 2 + 5)),
      (exit) => exit.call((exitSel) => exitSel.transition().duration(260).attr('opacity', 0).remove())
    )
    .on('mouseenter', (event, d) => {
      const detail = findDirectorStats(d.director, state.datasetMode);
      if (!detail) return;
      detailName.textContent = detail.director;
      detailHero.innerHTML = `<div class="detail-placeholder">DIRECTOR</div>`;
      detailScore.textContent = detail.avgScore.toFixed(2);
      detailVotes.textContent = `${detail.movieCount} 部作品`;
      detailYear.textContent = state.datasetMode === 'high' ? 'HIGH SCORE' : 'LOW SCORE';
      detailGenres.textContent = '按分数段统计';
      detailRegion.textContent = '作品分布';
      detailDirector.innerHTML = ['0-2', '2-4', '4-6', '6-8', '8-10']
        .map((band) => `${band} 分：${detail.bands[band] || 0}`)
        .join('<br/>');
      detailActors.textContent = detail.movies.slice(0, 6).map((movie) => `${movie.name} · ${movie.score.toFixed(1)}`).join(' / ');
      detailStory.textContent = '点击导演名称后右侧展示该导演作品分布。';
      hoverTip.classList.remove('hidden');
      hoverTip.innerHTML = `<strong>${detail.director}</strong><br/>作品数 ${detail.movieCount}<br/>均分 ${detail.avgScore.toFixed(2)}`;
      onMoveHoverTip(event);
    })
    .on('mousemove', onMoveHoverTip)
    .on('mouseleave', () => hoverTip.classList.add('hidden'));

  valueLayer.selectAll('text.value')
    .data(rows, (d) => d.director)
    .join(
      (enter) => enter.append('text')
        .attr('x', (d) => x(state.directorMetric === 'avgScore' ? d.avgScore : d.movieCount) + 8)
        .attr('y', (d) => y(d.director) + y.bandwidth() / 2 + 5)
        .attr('font-size', 12)
        .attr('font-weight', 800)
        .attr('fill', '#111')
        .attr('opacity', 0)
        .text((d) => state.directorMetric === 'avgScore' ? d.avgScore.toFixed(2) : d.movieCount)
        .call((enterSel) => enterSel.transition().duration(duration).ease(ease).attr('opacity', 1)),
      (update) => update.call((updateSel) => updateSel.transition().duration(duration).ease(ease)
        .attr('x', (d) => x(state.directorMetric === 'avgScore' ? d.avgScore : d.movieCount) + 8)
        .attr('y', (d) => y(d.director) + y.bandwidth() / 2 + 5)
        .tween('text', function(d) {
          const node = this;
          const current = state.directorMetric === 'avgScore' ? parseFloat(node.textContent) || 0 : parseFloat(node.textContent) || 0;
          const end = state.directorMetric === 'avgScore' ? d.avgScore : d.movieCount;
          const interp = d3.interpolateNumber(current, end);
          return function(t) {
            node.textContent = state.directorMetric === 'avgScore' ? interp(t).toFixed(2) : Math.round(interp(t));
          };
        })),
      (exit) => exit.call((exitSel) => exitSel.transition().duration(260).attr('opacity', 0).remove())
    );


}

function onMoveHoverTip(event) {
  state.hoverX = event.clientX;
  state.hoverY = event.clientY;
  if (state.hoverRAF) return;
  state.hoverRAF = requestAnimationFrame(() => {
    if (!state.canvasRect) state.canvasRect = canvasShell.getBoundingClientRect();
    hoverTip.style.left = `${state.hoverX - state.canvasRect.left}px`;
    hoverTip.style.top = `${state.hoverY - state.canvasRect.top}px`;
    state.hoverRAF = null;
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
