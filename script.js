/* script.js — logique de la page, avec MQTT robuste (WS/WSS, PIR mapping, JSON) */

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
  "sun":   { min: 25, max: 35 },
  "cloud": { min: 15, max: 25 },
  "rain":  { min: 10, max: 20 },
  "storm": { min: 18, max: 28 },
  "snow":  { min: -5, max: 5 }
};

function midTempOf(type, fallback = 25) {
  const r = tempRanges[type];
  if (!r) return fallback;
  return Math.round((r.min + r.max) / 2);
}

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
  // ----- Paramètres broker/topic -----
  const mqttServer = 'broker.hivemq.com';
  const mqttTopic  = 'home/esp32s3/pir/mouvement';

  // Auto WS/WSS selon le contexte
  const isHttps = location.protocol === 'https:';
  const url = isHttps
    ? `wss://${mqttServer}:8884/mqtt`
    : `ws://${mqttServer}:8000/mqtt`;

  if (typeof mqtt === 'undefined') {
    console.error('MQTT.js non chargé. Ajoute <script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script> dans ton HTML.');
    return;
  }

  // ----- Connexion MQTT -----
  const client = mqtt.connect(url, {
    clientId: 'web_' + Math.random().toString(16).slice(2,10),
    clean: true,
    reconnectPeriod: 2000
  });

  client.on('connect', function () {
    console.log('Connecté au broker MQTT :', url);
    client.subscribe(mqttTopic, function (err) {
      if (err) console.error('Subscribe error:', err);
      else console.log('Abonné au topic:', mqttTopic);
    });
  });

  client.on('reconnect', () => console.log('MQTT: reconnexion…'));
  client.on('error',     (e) => console.error('MQTT error:', e?.message || e));
  client.on('close',     () => console.warn('MQTT: connexion fermée'));

  // ----- Réception -----
  client.on('message', function (topic, message) {
    const payload = (message?.toString?.() || '').trim();
    if (!payload) return;

    console.log(`Message reçu [${topic}] :`, payload);

    let weatherType = '';
    let tempVal = NaN;

    // 1) Mapping des messages PIR → météo
    if (payload === 'MOUVEMENT') {
      weatherType = 'storm';                  // mouvement = orage / alerte
      tempVal     = midTempOf('storm', 25);
    } else if (payload === 'PAS_DE_MOUVEMENT') {
      weatherType = 'sun';                    // calme = ensoleillé
      tempVal     = midTempOf('sun', 25);
    }
    // 2) Format déjà météo: "rain-25"
    else if (payload.includes('-')) {
      const [w, t] = payload.split('-');
      weatherType = (w || '').trim();
      tempVal     = parseInt((t || '').trim(), 10);
    }
    // 3) JSON générique {"motion":1,"temp":23}
    else {
      try {
        const obj = JSON.parse(payload);
        if ('motion' in obj) {
          const isMove = !!obj.motion;
          weatherType = isMove ? 'storm' : 'sun';
        }
        if (Number.isFinite(obj?.temp)) {
          tempVal = parseInt(obj.temp, 10);
        }
        if (!Number.isFinite(tempVal)) {
          tempVal = midTempOf(weatherType || 'sun', 25);
        }
      } catch {
        // inconnu -> on ignore poliment
        console.warn('Payload non reconnu, ignoré:', payload);
        return;
      }
    }

    if (!weatherType || !Number.isFinite(tempVal)) {
      console.warn('Payload mal formé, ignoré:', payload);
      return;
    }

    // 4) Mise à jour UI
    if (typeof renderWeather === 'function') {
      renderWeather(weatherType, tempVal);
    }
    if (typeof createHiddenMessage === 'function') {
      const hidden = createHiddenMessage(weatherType, tempVal);
      const node = document.getElementById('hiddenMessage');
      if (node) node.textContent = hidden;
    }
  });

  // ----- Raccourci clavier : Shift+M pour “décrypter” -----
  window.addEventListener('keydown', function(e) {
    if (!(e.shiftKey && (e.key === 'M' || e.key === 'm'))) return;
    const pass = prompt("Entrez la clé pour décrypter le message:");
    if (!pass) return;
    if (pass.trim() !== 'Q-KEY') { alert("Accès refusé."); return; }

    const node = document.getElementById('hiddenMessage');
    const encoded = node ? node.textContent : '';
    if (!encoded) { alert("Rien à afficher."); return; }

    if (typeof decodeHiddenMessage === 'function') {
      const decoded = decodeHiddenMessage(encoded);
      alert(decoded?.meaning || 'Décodage OK (mais rien à afficher)');
    } else {
      alert('decodeHiddenMessage non défini.');
    }
  });

  // ----- État par défaut -----
  renderWeather('sun', midTempOf('sun', 25));
})();
