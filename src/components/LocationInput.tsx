type LocationInputProps = {
  label: string
  value: string
  placeholder: string
  error?: string
  onChange: (value: string) => void
  list?: string
}

export function LocationInput({
  label,
  value,
  placeholder,
  error,
  onChange,
  list,
}: LocationInputProps) {
  return (
    <label className="field-block">
      <span className="field-label">{label}</span>
      <input
        className={error ? 'input-field has-error' : 'input-field'}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        list={list}
      />
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  )
}
