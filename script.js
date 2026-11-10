/* JAtmos Weather Dashboard
   Uses beginner-friendly JavaScript: fetch, async/await, arrays and DOM updates.
*/

const searchForm = document.querySelector("#searchForm");
const placeInput = document.querySelector("#placeInput");
const statusMessage = document.querySelector("#statusMessage");
const weekContainer = document.querySelector("#weekContainer");
const navLinks = document.querySelectorAll("nav li");

let temperatureChart;
let rainChart;
let uvChart;

// Display the time of the selected city using the UTC offset returned by OpenWeather.
function cityTime(timestamp, offset, options) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" })
    .format(new Date((timestamp + offset) * 1000));
}

function weatherIcon(icon) {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

function showStatus(message) {
  statusMessage.textContent = message;
}

// A simple fetch helper with useful error messages.
async function getJSON(url) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("OpenWeatherMap rejected the API key. Check the key or activation status.");
    }
    if (response.status === 404) {
      throw new Error("City not found. Try a different city name.");
    }
    throw new Error(data.message || "Unable to retrieve the weather right now.");
  }

  return data;
}

async function loadWeather(city) {
  if (!OPENWEATHER_API_KEY || OPENWEATHER_API_KEY === "YOUR_OPENWEATHER_API_KEY") {
    showStatus("Add your OpenWeatherMap API key to config.js first.");
    return;
  }

  showStatus("");
  const button = document.querySelector("#search");
  button.disabled = true;
  button.textContent = "…";

  try {
    // First, find the city coordinates.
    const places = await getJSON(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${OPENWEATHER_API_KEY}`
    );
    if (places.length === 0) throw new Error("City not found. Please try another name.");

    const place = places[0];
    const lat = place.lat;
    const lon = place.lon;

    // Get current conditions and the 5-day / 3-hour forecast.
    const weatherURL = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    const forecastURL = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    const [current, forecast] = await Promise.all([getJSON(weatherURL), getJSON(forecastURL)]);

    displayCurrentWeather(current, place);
    displayTemperatureChart(forecast);
    displayRainChance(forecast);
    displayForecast(forecast);
    await displayUV(lat, lon);
  } catch (error) {
    showStatus(error.message || "Something went wrong. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "⌕";
  }
}

function displayCurrentWeather(data, place) {
  const offset = data.timezone;
  document.querySelector("#cityName").textContent = `${place.name}, ${place.country}`;
  document.querySelector("#weatherIcon").src = weatherIcon(data.weather[0].icon);
  document.querySelector("#weatherIcon").alt = data.weather[0].description;
  document.querySelector("#currentTemp").textContent = Math.round(data.main.temp);
  document.querySelector("#weatherDescription").textContent = data.weather[0].description;
  document.querySelector("#localTime").textContent = cityTime(data.dt, offset, { hour: "numeric", minute: "2-digit", hour12: true });
  document.querySelector("#feelsLike").textContent = `${Math.round(data.main.feels_like)}°`;
  document.querySelector("#humidity").textContent = `${data.main.humidity}%`;
  document.querySelector("#humidityDetail").textContent = `${data.main.humidity}%`;
  document.querySelector("#windSpeed").textContent = `${Math.round(data.wind.speed * 3.6)} km/h`;
  document.querySelector("#updatedAt").textContent = `Updated: ${cityTime(data.dt, offset, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function displayTemperatureChart(forecast) {
  const nextHours = forecast.list.slice(0, 8);
  const labels = nextHours.map(item => cityTime(item.dt, forecast.city.timezone, { hour: "numeric", hour12: true }));
  const temperatures = nextHours.map(item => Math.round(item.main.temp));

  if (temperatureChart) temperatureChart.destroy();
  temperatureChart = new Chart(document.querySelector("#temperature"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Temperature (°C)",
        data: temperatures,
        borderColor: "#4f8cec",
        backgroundColor: "rgba(100, 163, 255, 0.13)",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: "#4f8cec"
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: value => `${value}°` } }
      }
    }
  });
}

// Creates the small doughnut charts used in the overview cards.
function makeDoughnut(canvasId, filled, total, color, previousChart) {
  if (previousChart) previousChart.destroy();
  return new Chart(document.querySelector(canvasId), {
    type: "doughnut",
    data: { datasets: [{ data: [filled, Math.max(0, total - filled)], backgroundColor: [color, "#ebf0f7"], borderWidth: 0 }] },
    options: { cutout: "78%", maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
  });
}

function displayRainChance(forecast) {
  // pop is the forecast probability of precipitation for a 3-hour interval.
  const rainChance = Math.round((forecast.list[0].pop || 0) * 100);
  document.querySelector("#rainValue").textContent = `${rainChance}%`;
  document.querySelector("#rainMessage").textContent = rainChance < 30 ? "Low chance of rain" : rainChance < 65 ? "Moderate chance of rain" : "High chance of rain";
  rainChart = makeDoughnut("#rain", rainChance, 100, "#66adf6", rainChart);
}

async function displayUV(lat, lon) {
  // The basic OpenWeather 5-day API does not contain UV index values.
  // Use Open-Meteo's public daily UV forecast instead (no extra key needed).
  document.querySelector("#uvValue").textContent = "--";
  document.querySelector("#uvMessage").textContent = "Checking UV forecast";
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=uv_index_max&timezone=auto&forecast_days=1`;
    const data = await getJSON(url);
    const uv = data.daily.uv_index_max[0];
    if (uv === null || uv === undefined) throw new Error("No UV data");
    const roundedUV = Math.round(uv * 10) / 10;
    document.querySelector("#uvValue").textContent = roundedUV;
    document.querySelector("#uvMessage").textContent = uv < 3 ? "Low UV levels" : uv < 6 ? "Moderate UV levels" : uv < 8 ? "High UV levels" : uv < 11 ? "Very high UV levels" : "Extreme UV levels";
    uvChart = makeDoughnut("#uv", Math.min(uv, 11), 11, "#807bf0", uvChart);
  } catch (error) {
    document.querySelector("#uvMessage").textContent = "UV data unavailable";
    if (uvChart) { uvChart.destroy(); uvChart = null; }
  }
}

function displayForecast(forecast) {
  const timezone = forecast.city.timezone;
  const dailyGroups = {};

  // Group the 3-hour forecasts by date in the selected city's local time.
  forecast.list.forEach(item => {
    const date = cityTime(item.dt, timezone, { year: "numeric", month: "2-digit", day: "2-digit" });
    if (!dailyGroups[date]) dailyGroups[date] = [];
    dailyGroups[date].push(item);
  });

  weekContainer.innerHTML = "";
  const days = Object.keys(dailyGroups).slice(0, 5);

  days.forEach((date, index) => {
    const entries = dailyGroups[date];
    // Choose the forecast closest to noon for an icon that represents the day.
    const noon = entries.reduce((closest, item) => {
      const itemHour = Number(cityTime(item.dt, timezone, { hour: "numeric", hourCycle: "h23" }));
      const closestHour = Number(cityTime(closest.dt, timezone, { hour: "numeric", hourCycle: "h23" }));
      return Math.abs(itemHour - 12) < Math.abs(closestHour - 12) ? item : closest;
    });
    const high = Math.round(Math.max(...entries.map(item => item.main.temp_max)));
    const low = Math.round(Math.min(...entries.map(item => item.main.temp_min)));
    const dayName = index === 0 ? "Today" : cityTime(noon.dt, timezone, { weekday: "long" });
    const dateLabel = cityTime(noon.dt, timezone, { month: "short", day: "numeric" });

    const card = document.createElement("div");
    card.className = "forecast-day";
    const icon = document.createElement("img");
    icon.src = weatherIcon(noon.weather[0].icon);
    icon.alt = noon.weather[0].description;
    const text = document.createElement("div");
    text.className = "forecast-date";
    const heading = document.createElement("h3");
    heading.textContent = dayName;
    const caption = document.createElement("p");
    caption.textContent = dateLabel;
    text.append(heading, caption);
    const temp = document.createElement("strong");
    temp.textContent = `${high}° / ${low}°`;
    card.append(icon, text, temp);
    weekContainer.append(card);
  });
}

searchForm.addEventListener("submit", event => {
  event.preventDefault();
  const city = placeInput.value.trim();
  if (city) loadWeather(city);
});

navLinks.forEach(item => {
  item.addEventListener("click", () => {
    navLinks.forEach(link => link.classList.remove("active"));
    item.classList.add("active");
  });
});

// Open with a default location; search for any other city above.
loadWeather("Manila, PH");
