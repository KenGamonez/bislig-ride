import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type MapViewProps = {
  className?: string
}

export function MapView({ className = '' }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    const container = containerRef.current

    if (!container || mapRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [126.327, 8.188],
      zoom: 12,
      attributionControl: { compact: true },
    })

    mapRef.current = map

    const handleResize = () => {
      map.resize()
    }

    map.on('load', () => {
      console.log('MapLibre load complete. Style URL:', map.getStyle().sprite)
      console.log('MapLibre render style sources:', Object.keys(map.getStyle().sources))
      requestAnimationFrame(handleResize)
    })

    map.on('styledata', () => {
      console.log('MapLibre style data updated')
    })

    map.on('sourcedata', (event) => {
      if (event.isSourceLoaded) {
        console.log('MapLibre source loaded:', event.sourceId)
      }
    })

    map.on('error', (event) => {
      console.error('MapLibre failed to load:', event.error)
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')

    window.addEventListener('resize', handleResize)

    requestAnimationFrame(handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      map.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} className={`map-view ${className}`.trim()} aria-label="Bislig City map" />
}
