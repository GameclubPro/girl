type ScreenLoaderProps = {
  label?: string
}

export const ScreenLoader = ({ label = 'Загрузка...' }: ScreenLoaderProps) => (
  <div className="screen screen--loader">
    <div className="loader-card">
      <div className="loader-spinner" aria-hidden="true" />
      <p className="loader-text">{label}</p>
    </div>
  </div>
)
