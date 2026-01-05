import pinLeftImage from '../assets/kiven-pin-left.webp'
import pinRightImage from '../assets/kiven-pin-right.webp'

export const StarPin = ({ tone }: { tone: 'lavender' | 'sun' }) => {
  const src = tone === 'lavender' ? pinLeftImage : pinRightImage
  const alt = tone === 'lavender' ? 'Метка услуги' : 'Метка исполнительницы'

  return (
    <div className={`pin-wrap pin-wrap--${tone}`}>
      <img className="card-pin" src={src} alt={alt} />
      <div className={`pin-stars pin-stars--${tone}`} aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span className="pin-star" key={index} />
        ))}
      </div>
    </div>
  )
}
