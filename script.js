/* script.js — gère la logique de la page web, maintenant avec le support de MQTT */

const weatherKey = {
  "sun": "MISSION_OK",
  "cloud": "RETRAIT",
  "rain": "RENFORT",
  "storm": "ATTENTION",
  "snow": "REPLIEZ"
};

const icons = {
  "sun": "☀️",
  "cloud": "☁️",
  "rain": "🌧️",
  "storm": "⛈️",
  "snow": "❄️"
};

const tempRanges = {
  "sun": { min: 25, max: 35 },
  "cloud": { min: 15, max: 25 },
  "rain": { min: 10, max: 20 },
  "storm": { min: 18, max: 28 },
  "snow": { min: -5, max: 5 }
};

function decodeTempToDetail(temp) {
  const n = parseInt(String(temp).replace(/[^\d]/g,''), 10);
  if (isNaN(n)) return null;
  return `HEURE_${n}`;
}

function renderWeather(type, tempValue) {
  const container = document.querySelector('div[id^="meteo"]');
  if (!container) return;
  
  let iconEl = document.getElementById('icon');
  if (!iconEl) {
    const repl = document.createElement('div');
    repl.id = 'icon';
    repl.className = 'icon-repl';
    container.insertBefore(repl, container.firstChild);
    iconEl = repl;
  }
  iconEl.textContent = icons[type] || icons.sun;

  let tempsEl = document.getElementById('temps');
  if (!tempsEl) {
    tempsEl = document.createElement('p');
    tempsEl.id = 'temps';
    tempsEl.style.margin = '0';
    tempsEl.style.fontWeight = '700';
    container.appendChild(tempsEl);
  }
  tempsEl.textContent = `${tempValue}°C`;

  let descEl = container.querySelector('.desc');
  const descriptions = {
    "sun": "Ensoleillé",
    "cloud": "Nuageux",
    "rain": "Pluie légère",
    "storm": "Orage",
    "snow": "Neige"
  };
  if (!descEl) {
    descEl = document.createElement('p');
    descEl.className = 'desc';
    container.appendChild(descEl);
  }
  descEl.textContent = descriptions[type] || 'Clair';
  
  const alertCard = document.getElementById('secret-meteo-card');
  if (type === 'rain' && alertCard) {
    alertCard.classList.remove('hidden-alert');
    alertCard.classList.add('show-alert');
  } else if (alertCard) {
    alertCard.classList.remove('show-alert');
    alertCard.classList.add('hidden-alert');
  }
}

function createHiddenMessage(type, temp) {
  const keyPhrase = weatherKey[type] || "INCONNU";
  const detail = decodeTempToDetail(temp) || "DETAIL_NA";
  return `MSG|${keyPhrase}|${detail}`;
}

function decodeHiddenMessage(encoded) {
  if (!encoded) return null;
  const parts = encoded.split('|');
  if (parts.length < 3) return null;
  return {
    raw: encoded,
    meaning: `${parts[1].replace(/_/g,' ')} - ${parts[2].replace(/_/g,' ')}`
  };
}

(function init() {
  // Paramètres du broker MQTT
  const mqttServer = 'broker.hivemq.com';
  const mqttTopic = 'home/esp32s3/pir/mouvement';

  // Connexion au broker MQTT
  const client = mqtt.connect(`ws://${mqttServer}:8000/mqtt`);

  client.on('connect', function () {
    console.log('Connecté au broker MQTT !');
    client.subscribe(mqttTopic, function (err) {
      if (!err) {
        console.log("Abonné au topic: " + mqttTopic);
      }
    });
  });

  client.on('message', function (topic, message) {
    // Message reçu du broker
    const payload = message.toString();
    console.log("Message reçu sur le topic " + topic + ": " + payload);

    // Analyse le message "rain-25"
    if (payload && payload.includes('-')) {
      const [weatherType, tempStr] = payload.split('-');
      const tempVal = parseInt(tempStr, 10);
      
      // Met à jour la page avec les nouvelles données
      renderWeather(weatherType, tempVal);
      const hidden = createHiddenMessage(weatherType, tempVal);
      document.getElementById('hiddenMessage').textContent = hidden;
    }
  });

  // Raccourci clavier silencieux : Shift+M pour révéler (prototype)
  window.addEventListener('keydown', function(e) {
    if (e.shiftKey && (e.key === 'M' || e.key === 'm')) {
      const pass = prompt("Entrez la clé pour décrypter le message:");
      if (!pass) return;
      if (pass.trim() !== 'Q-KEY') {
        alert("Accès refusé.");
        return;
      }
      const encoded = document.getElementById('hiddenMessage').textContent;
      const decoded = decodeHiddenMessage(encoded);
      if (!decoded) {
        alert("Rien à afficher.");
      } else {
        alert(decoded.meaning);
      }
    }
  });

  // Initialisation au chargement de la page avec un état par défaut
  renderWeather('sun', 25);
})();
