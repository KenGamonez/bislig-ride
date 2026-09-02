export function MapPlaceholder() {
  return (
    <div className="map-placeholder" aria-label="Map preview placeholder">
      <div className="map-grid" aria-hidden="true" />
      <div className="map-pin pickup-pin" aria-hidden="true">
        <span />
      </div>
      <div className="map-pin destination-pin" aria-hidden="true">
        <span />
      </div>
      <div className="map-overlay">
        <strong>Map preview</strong>
        <span>Maps will appear here</span>
      </div>
    </div>
  )
}
