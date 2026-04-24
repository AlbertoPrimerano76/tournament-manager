interface Props {
  images: string[]
  accentColor?: string | null
  primaryColor?: string | null
}

export default function SponsorBar({ images, accentColor, primaryColor }: Props) {
  if (!images || images.length === 0) return null

  const loopedImages = [...images, ...images]
  const accent = accentColor ?? '#15803d'
  const primary = primaryColor ?? '#166534'

  return (
    <section
      className="surface-panel overflow-hidden py-5"
      style={{
        borderColor: `${primary}22`,
        background: `linear-gradient(180deg, ${primary}0f 0%, #ffffff 35%, ${accent}10 100%)`,
      }}
    >
      <div className="px-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Sponsor</p>
        <p className="mt-1 text-sm font-semibold text-slate-800">Partner dell&apos;evento</p>
      </div>
      <div className="mt-4 overflow-hidden">
        <div className="sponsor-track flex w-max items-center gap-10 px-6">
          {loopedImages.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="flex h-20 min-w-[160px] items-center justify-center rounded-2xl bg-white px-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.45)]"
              style={{ border: `1px solid ${primary}14` }}
            >
              <img
                src={src}
                alt={`Sponsor ${i + 1}`}
                className="h-14 w-[140px] object-contain scale-[1.35] grayscale transition-all duration-300 hover:grayscale-0"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
