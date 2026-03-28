import { haversineKm } from './geo'

const BASE_PRICES = {
  30: 3000,
  45: 4000,
  60: 5500,
}

export function calculateDistanceSurcharge(distanceKm) {
  if (distanceKm < 0.5) return 0
  if (distanceKm <= 5) return Math.round(distanceKm * 10) / 10 * 300
  return 1500
}

export function calculatePrice(durationMinutes, walkerLat, walkerLng, pickupLat, pickupLng) {
  const basePrice = BASE_PRICES[durationMinutes] || 3000
  let distanceKm = 0
  let distanceSurcharge = 0

  if (walkerLat != null && walkerLng != null && pickupLat != null && pickupLng != null) {
    distanceKm = Math.round(haversineKm(walkerLat, walkerLng, pickupLat, pickupLng) * 10) / 10
    distanceSurcharge = calculateDistanceSurcharge(distanceKm)
  }

  return {
    basePrice,
    distanceKm,
    distanceSurcharge,
    totalPrice: basePrice + distanceSurcharge,
  }
}

export function formatPrice(amount) {
  return '$' + Math.round(amount).toLocaleString('es-AR')
}
