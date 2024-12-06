const OPENCAGE_API_KEY = "d5f1b62201ef43049b8126fc6cb49ba0";
const OPENCAGE_API = "https://api.opencagedata.com/geocode/v1";
const WEATHER_API_BASE = "https://api.open-meteo.com/v1";
const REST_COUNTRIES_API = "https://restcountries.com/v3.1";
const GLOBE_RADIUS = 1;

let scene, camera, renderer, earth, controls;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let clickMarker;

let isDragging = false;
let mouseDownTime = 0;

function init() {
  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 2;

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById("globe-container").appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0xffffff, 1);
  pointLight.position.set(5, 3, 5);
  scene.add(pointLight);

  createEarth();

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = 0.5;
  controls.minDistance = 1.5;
  controls.maxDistance = 4;

  window.addEventListener("resize", onWindowResize, false);
  renderer.domElement.addEventListener("click", onGlobeClick, false);

  setupKeyboardNavigation();

  const globeContainer = document.getElementById("globe-container");
  globeContainer.setAttribute("tabindex", "0");
  globeContainer.setAttribute(
    "aria-label",
    "Globe terrestre interactif. Utilisez les flèches pour pivoter, + et - pour zoomer."
  );

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function createEarth() {
  const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
  const textureLoader = new THREE.TextureLoader();

  const earthTexture = textureLoader.load("textures/earth_texture.jpg", () => {
    renderer.render(scene, camera);
  });

  const material = new THREE.MeshPhongMaterial({
    map: earthTexture,
    bumpScale: 0.05,
  });

  earth = new THREE.Mesh(geometry, material);
  scene.add(earth);
}

function latLongToVector3(lat, lon) {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (-lon * Math.PI) / 180;

  const x = Math.cos(latRad) * Math.cos(lonRad);
  const y = Math.sin(latRad);
  const z = Math.cos(latRad) * Math.sin(lonRad);

  return new THREE.Vector3(x, y, z);
}

function vector3ToLatLong(position) {
  const vector = position.clone().normalize();

  const lat = (Math.asin(vector.y) * 180) / Math.PI;

  const lon = (-Math.atan2(vector.z, vector.x) * 180) / Math.PI;

  return { lat, lon };
}

function onGlobeClick(event) {
  event.preventDefault();

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(earth);

  if (intersects.length > 0) {
    const intersectionPoint = intersects[0].point;
    const coords = vector3ToLatLong(intersectionPoint);

    console.log("Clicked coordinates:", coords);

    createClickMarker(intersectionPoint);

    moveCamera(intersectionPoint);

    getLocationNameFromCoords(coords.lat, coords.lon)
      .then((locationName) => {
        if (locationName) {
          getWeatherByCoordinates(coords.lat, coords.lon, locationName);
        }
      })
      .catch((error) => {
        console.error("Error processing click:", error);
        const coordsText = `Location at ${coords.lat.toFixed(
          2
        )}°, ${coords.lon.toFixed(2)}°`;
        const locationElement = document.getElementById("location-name");
        if (locationElement) {
          locationElement.textContent = coordsText;
        }
      });
  }
}

async function getLocationNameFromCoords(lat, lon) {
  try {
    const formattedLat = lat.toFixed(6);
    const formattedLon = lon.toFixed(6);

    const response = await fetch(
      `${OPENCAGE_API}/json?` +
        `q=${formattedLat}+${formattedLon}&` +
        `key=${OPENCAGE_API_KEY}&` +
        `language=en&` +
        `pretty=1&` +
        `no_annotations=1`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("OpenCage API response:", data);

    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      const components = result.components;
      let locationParts = [];

      const isWaterBody = !!(
        components.body_of_water ||
        components.ocean ||
        components.sea
      );

      if (isWaterBody) {
        if (components.body_of_water) {
          locationParts.push(components.body_of_water);
        } else if (components.ocean) {
          locationParts.push(components.ocean);
        } else if (components.sea) {
          locationParts.push(components.sea);
        }

        const countryInfoElement = document.getElementById("country-info");
        if (countryInfoElement) {
          countryInfoElement.style.display = "none";
        }
      } else {
        if (components.city) {
          locationParts.push(components.city);
        } else if (components.town) {
          locationParts.push(components.town);
        } else if (components.village) {
          locationParts.push(components.village);
        } else if (components.county) {
          locationParts.push(components.county);
        } else if (components.state_district) {
          locationParts.push(components.state_district);
        }

        if (
          components.state &&
          (!locationParts[0] || locationParts[0] !== components.state)
        ) {
          locationParts.push(components.state);
        }

        if (components.country_code) {
          try {
            const countryResponse = await fetch(
              `${REST_COUNTRIES_API}/alpha/${components.country_code.toLowerCase()}`
            );
            if (countryResponse.ok) {
              const countryData = await countryResponse.json();
              if (Array.isArray(countryData) && countryData.length > 0) {
                const country = countryData[0];

                const countryName = `${country.name.common} ${country.flag}`;
                if (!locationParts.includes(country.name.common)) {
                  locationParts.push(countryName);
                }

                const countryInfoElement =
                  document.getElementById("country-info");
                if (countryInfoElement) {
                  countryInfoElement.innerHTML = `
                                        <p><strong>Capital:</strong> ${
                                          country.capital
                                            ? country.capital[0]
                                            : "N/A"
                                        }</p>
                                        <p><strong>Population:</strong> ${
                                          country.population
                                            ? country.population.toLocaleString()
                                            : "N/A"
                                        }</p>
                                        <p><strong>Region:</strong> ${
                                          country.region || "N/A"
                                        }</p>
                                        <p><strong>Languages:</strong> ${
                                          country.languages
                                            ? Object.values(
                                                country.languages
                                              ).join(", ")
                                            : "N/A"
                                        }</p>
                                    `;
                  countryInfoElement.style.display = "block";
                }
              }
            }
          } catch (error) {
            console.error("Error fetching country data:", error);
            if (components.country) {
              locationParts.push(components.country);
            }
          }
        } else if (components.country) {
          locationParts.push(components.country);
        }
      }

      const locationName =
        locationParts.length > 0
          ? locationParts.join(", ")
          : `Location at ${formattedLat}°, ${formattedLon}°`;

      const locationElement = document.getElementById("location-name");
      if (locationElement) {
        locationElement.textContent = locationName;
      }

      return locationName;
    }

    throw new Error("No results found");
  } catch (error) {
    console.error("Error getting location name:", error);
    throw error;
  }
}

async function getWeatherByCoordinates(lat, lon, locationName) {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`
    );
    const data = await response.json();

    if (data.current) {
      updateWeatherInfo(data.current, locationName);
    }
  } catch (error) {
    console.error("Error getting weather data:", error);
    showSearchError("Error fetching weather data. Please try again.");
  }
}

function updateWeatherInfo(weatherData, locationName) {
  const temperature = document.getElementById("temperature");
  const weatherDesc = document.getElementById("weather-description");
  const humidity = document.getElementById("humidity");
  const windSpeed = document.getElementById("wind-speed");
  const locationTitle = document.getElementById("location-name");

  locationTitle.textContent = locationName;
  temperature.textContent = `${Math.round(weatherData.temperature_2m)}°C`;
  weatherDesc.textContent = getWeatherDescription(weatherData.weather_code);
  humidity.textContent = `${Math.round(weatherData.relative_humidity_2m)}%`;
  windSpeed.textContent = `${Math.round(weatherData.wind_speed_10m)} km/h`;

  const announcement = `Météo mise à jour pour ${locationName}: ${Math.round(
    weatherData.temperature_2m
  )}°C, ${getWeatherDescription(weatherData.weather_code)}`;
  announceToScreenReader(announcement);
}

function announceToScreenReader(message) {
  const announcer = document.createElement("div");
  announcer.setAttribute("aria-live", "polite");
  announcer.setAttribute("class", "sr-only");
  announcer.textContent = message;
  document.body.appendChild(announcer);
  setTimeout(() => announcer.remove(), 1000);
}

function showSearchError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.setAttribute("role", "alert");
  errorDiv.textContent = message;

  const searchContainer = document.querySelector(".search-container");
  searchContainer.appendChild(errorDiv);

  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

async function handleSearch(event) {
  if (event) {
    event.preventDefault();
  }
  const searchInput = document.getElementById("search-input");
  const searchQuery = searchInput.value.trim();

  if (!searchQuery) return;

  try {
    const encodedQuery = encodeURIComponent(searchQuery);
    const response = await fetch(
      `${OPENCAGE_API}/json?q=${encodedQuery}&key=${OPENCAGE_API_KEY}&language=en&limit=1&pretty=1`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Search response:", data);

    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      const lat = result.geometry.lat;
      const lon = result.geometry.lng;

      console.log("Search coordinates:", { lat, lon });

      const locationName = await getLocationNameFromCoords(lat, lon);

      const position = latLongToVector3(lat, lon).multiplyScalar(GLOBE_RADIUS);

      createClickMarker(position);

      moveCamera(position);

      getWeatherByCoordinates(lat, lon, locationName);
    } else {
      console.log("Location not found");
      alert("Location not found. Please try another search.");
    }
  } catch (error) {
    console.error("Error searching location:", error);
    alert("Error searching location. Please try again.");
  }
}

function createClickMarker(position) {
  if (clickMarker) {
    scene.remove(clickMarker);
  }

  const markerGeometry = new THREE.SphereGeometry(0.02, 16, 16);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa,
    opacity: 0.8,
    transparent: true,
  });
  clickMarker = new THREE.Mesh(markerGeometry, markerMaterial);

  clickMarker.position.copy(position);
  scene.add(clickMarker);
}

function moveCamera(point) {
  const distance = 1.75;
  const targetPosition = point.clone().multiplyScalar(distance);

  const startPosition = camera.position.clone();
  const startRotation = camera.quaternion.clone();

  const tempCamera = camera.clone();
  tempCamera.position.copy(targetPosition);
  tempCamera.lookAt(new THREE.Vector3(0, 0, 0));
  const targetRotation = tempCamera.quaternion.clone();

  controls.enabled = false;

  const duration = 1000;
  const startTime = Date.now();

  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const easing =
      progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camera.position.lerpVectors(startPosition, targetPosition, easing);
    camera.quaternion.slerpQuaternions(startRotation, targetRotation, easing);

    controls.target.set(0, 0, 0);
    controls.update();

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      camera.position.copy(targetPosition);
      camera.quaternion.copy(targetRotation);
      controls.enabled = true;
    }

    controls.update();
  }

  animate();
}

function setupKeyboardNavigation() {
  document.addEventListener("keydown", (e) => {
    if (document.activeElement.closest("#globe-container")) {
      const rotationSpeed = 0.1;
      switch (e.key) {
        case "ArrowLeft":
          controls.rotateLeft(rotationSpeed);
          e.preventDefault();
          break;
        case "ArrowRight":
          controls.rotateRight(rotationSpeed);
          e.preventDefault();
          break;
        case "ArrowUp":
          controls.rotateUp(rotationSpeed);
          e.preventDefault();
          break;
        case "ArrowDown":
          controls.rotateDown(rotationSpeed);
          e.preventDefault();
          break;
        case "+":
        case "=":
          controls.dollyIn(1.1);
          e.preventDefault();
          break;
        case "-":
        case "_":
          controls.dollyOut(1.1);
          e.preventDefault();
          break;
      }
    }
  });
}

function getWeatherDescription(code) {
  const weatherCodes = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return weatherCodes[code] || "Unknown";
}

// Add event listeners for search
document.addEventListener("DOMContentLoaded", () => {
  const searchButton = document.getElementById("search-button");
  const searchInput = document.getElementById("search-input");

  if (searchButton) {
    searchButton.addEventListener("click", handleSearch);
  }

  if (searchInput) {
    searchInput.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        handleSearch();
      }
    });
  }
});

init();
