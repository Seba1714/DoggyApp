export const PD = {
  bg:          '#111111',
  card:        '#1c1c1e',
  input:       '#2a2a2e',
  separator:   '#2e2e30',
  green:       '#1DB954',
  greenBg:     '#0f2318',
  greenActive: '#1a3a25',
  white:       '#ffffff',
  textSec:     '#888888',
  textDis:     '#555555',
  textLabel:   '#666666',
}

// Estilo oscuro tipo Uber para Google Maps
export const DARK_MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#8a8a8a' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'road',                elementType: 'geometry',           stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road',                elementType: 'geometry.stroke',    stylers: [{ color: '#212121' }] },
  { featureType: 'road',                elementType: 'labels.text.fill',   stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway',        elementType: 'geometry',           stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway',        elementType: 'geometry.stroke',    stylers: [{ color: '#1f1f1f' }] },
  { featureType: 'road.highway',        elementType: 'labels.text.fill',   stylers: [{ color: '#f3d19c' }] },
  { featureType: 'water',               elementType: 'geometry',           stylers: [{ color: '#0e1626' }] },
  { featureType: 'water',               elementType: 'labels.text.fill',   stylers: [{ color: '#515c6d' }] },
  { featureType: 'poi',                                                     stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',                                                 stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative',      elementType: 'geometry',           stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'landscape',           elementType: 'geometry',           stylers: [{ color: '#212121' }] },
]
