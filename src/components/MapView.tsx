import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type MapViewProps = {
  driverLatitude?: number | null
  driverLongitude?: number | null
  pickupLatitude?: number | null
  pickupLongitude?: number | null
}

export function MapView({
  driverLatitude = null,
  driverLongitude = null,
  pickupLatitude = null,
  pickupLongitude = null,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null)
  const pickupMarkerRef = useRef<maplibregl.Marker | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current

    if (!container || mapRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [126.327, 8.188],
      zoom: 12,
      attributionControl: { compact: true },
    })

    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      map.resize()
      setMapReady(true)
    })

    return () => {
      driverMarkerRef.current?.remove()
      driverMarkerRef.current = null
      pickupMarkerRef.current?.remove()
      pickupMarkerRef.current = null
      setMapReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const hasDriverLocation =
      typeof driverLatitude === 'number' &&
      Number.isFinite(driverLatitude) &&
      typeof driverLongitude === 'number' &&
      Number.isFinite(driverLongitude)

    if (!mapReady || !map) {
      return
    }

    if (!hasDriverLocation) {
      driverMarkerRef.current?.remove()
      driverMarkerRef.current = null
      return
    }

    if (!driverMarkerRef.current) {
      const markerElement = document.createElement('div')
      markerElement.setAttribute('aria-label', 'Driver location')
      markerElement.style.width = '18px'
      markerElement.style.height = '18px'
      markerElement.style.borderRadius = '50%'
      markerElement.style.backgroundColor = '#1f6feb'
      markerElement.style.border = '3px solid #ffffff'
      markerElement.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)'

      driverMarkerRef.current = new maplibregl.Marker({ element: markerElement }).setLngLat([
        driverLongitude,
        driverLatitude,
      ]).addTo(map)
      return
    }

    driverMarkerRef.current.setLngLat([driverLongitude, driverLatitude])
  }, [driverLatitude, driverLongitude, mapReady])

  useEffect(() => {
    const map = mapRef.current
    const hasPickupLocation =
      typeof pickupLatitude === 'number' &&
      Number.isFinite(pickupLatitude) &&
      typeof pickupLongitude === 'number' &&
      Number.isFinite(pickupLongitude)

    if (!mapReady || !map) {
      return
    }

    if (!hasPickupLocation) {
      pickupMarkerRef.current?.remove()
      pickupMarkerRef.current = null
      return
    }

    if (!pickupMarkerRef.current) {
      const markerElement = document.createElement('div')
      markerElement.setAttribute('aria-label', 'Pickup location')
      markerElement.style.width = '18px'
      markerElement.style.height = '18px'
      markerElement.style.borderRadius = '50%'
      markerElement.style.backgroundColor = '#d97706'
      markerElement.style.border = '3px solid #ffffff'
      markerElement.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)'

      pickupMarkerRef.current = new maplibregl.Marker({ element: markerElement }).setLngLat([
        pickupLongitude,
        pickupLatitude,
      ]).addTo(map)
      return
    }

    pickupMarkerRef.current.setLngLat([pickupLongitude, pickupLatitude])
  }, [pickupLatitude, pickupLongitude, mapReady])

  return (
    <div
      ref={containerRef}
      aria-label="Bislig City map"
      style={{
        position: 'relative',
        width: '100%',
        height: '400px',
        minHeight: '400px',
      }}
    />
  )
}
